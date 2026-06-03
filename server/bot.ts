import TelegramBot from 'node-telegram-bot-api';
import { db } from './db.js';
import { xui } from './xui.js';
import { encryptData, decryptData } from './crypto.js';
import fs from 'fs';
import path from 'path';
import axios from 'axios';

let bot: TelegramBot | null = null;
let isPolling = false;
const adminSession = new Map<number, string>();

export async function initBot() {
  const state = db.getState();
  if (!state.botToken) {
    console.log('[Bot] No Bot Token configured. Bot not started.');
    return;
  }

  if (bot) {
    console.log('[Bot] Actively stopping current bot polling and cleaning up resources...');
    try {
      const activeBot = bot;
      bot = null; // Unlink reference immediately to prevent race conditions
      if (typeof activeBot.stopPolling === 'function') {
        await activeBot.stopPolling();
      }
      activeBot.removeAllListeners();
    } catch (e: any) {
      console.error('[Bot Error] Error stopping polling of previous bot:', e.message);
    }
    isPolling = false;
  }

  // Grace delay to let Telegram servers process the connection teardown
  await new Promise(resolve => setTimeout(resolve, 1500));

  try {
    console.log(`[Bot] Initializing Telegram Bot with token ending in ...${state.botToken.substring(state.botToken.length - 8 || 0)}`);
    bot = new TelegramBot(state.botToken, { polling: true });
    isPolling = true;

    // Attach crucial error listeners to avoid crashing or unhandled rejections
    bot.on('polling_error', (error: any) => {
      console.error('[Bot Error] Polling error:', error.message || error);
    });

    bot.on('error', (error: any) => {
      console.error('[Bot Error] General error:', error.message || error);
    });

    bot.setMyCommands([
      { command: '/start', description: 'منوی اصلی' },
      { command: '/admin', description: 'مدیریت پنل' }
    ]).then(() => {
      console.log('[Bot] Commands menu registered successfully on Telegram.');
    }).catch(err => {
      console.error("[Bot Error] Failed to set Bot commands menu (Check token):", err.message || err);
    });
  } catch (err: any) {
    console.error('[Bot Error] Exception thrown during Bot creation:', err.message || err);
  }

  const sendAdminMainMenu = (chatId: number) => {
    bot!.sendMessage(chatId, '🔧 پنل مدیریت کامل ربات سنایی (X-UI):\nیکی از گزینه‌های مدیریتی زیر را انتخاب کنید:', {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🖥 تنظیمات اتصال سنایی (X-UI)', callback_data: 'admin_panel_menu' }],
          [{ text: '🎁 تنظیمات هدیه و تست رایگان', callback_data: 'admin_test_menu' }],
          [{ text: '📦 مدیریت محصولات فعال', callback_data: 'admin_products_menu' }],
          [{ text: '👥 مدیریت کاربران و فروشنده‌ها', callback_data: 'admin_users_menu' }],
          [{ text: '📥 تهیه بکاپ امن (رمزگذاری شده)', callback_data: 'admin_backup' }],
          [{ text: '📤 بازیابی اطلاعات (ری‌استور بکاپ)', callback_data: 'admin_restore_prompt' }]
        ]
      }
    });
  };

  const sendSanaeiConnectionMenu = (chatId: number) => {
    const state = db.getState();
    const msg = `🖥 اطلاعات اتصال به پنل سنایی (X-UI):

🔗 آدرس: ${state.panel.url || '❌ تنظیم نشده'}
👤 نام کاربری: ${state.panel.username || '❌ تنظیم نشده'}
🔑 رمز عبور: ${state.panel.password ? '******' : '❌ تنظیم نشده'}
🆔 اینباند (Inbound ID): ${state.panel.inboundId || '❌ تنظیم نشده'}

برای تغییر هر مورد، دکمه مربوطه در زیر را فشرده و پیام جدید را ارسال کنید.`;

    bot!.sendMessage(chatId, msg, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔗 تغییر آدرس پنل', callback_data: 'set_p_url' }, { text: '👤 تغییر نام کاربری', callback_data: 'set_p_user' }],
          [{ text: '🔑 تغییر رمز عبور', callback_data: 'set_p_pass' }, { text: '🆔 تغییر ID اینباند', callback_data: 'set_p_inbound' }],
          [{ text: '🔄 دریافت لیست اینباندهای پنل', callback_data: 'admin_fetch_inbounds' }],
          [{ text: '🔙 بازگشت به منوی ادمین', callback_data: 'admin_main' }]
        ]
      }
    });
  };

  const sendTestSettingsMenu = (chatId: number) => {
    const state = db.getState();
    const msg = `🎁 تنظیمات اکانت تست رایگان و پاداش دعوت:

📦 حجم تست رایگان: ${state.freeTestVolumeGb} گیگابایت
⏰ زمان تست رایگان: ${state.freeTestDurationDays} روز
💰 هدیه زیرمجموعه‌گیری: ${state.referralRewardToman || 0} تومان`;

    bot!.sendMessage(chatId, msg, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📦 حجم تست رایگان', callback_data: 'set_t_volume' }, { text: '⏰ زمان تست رایگان', callback_data: 'set_t_days' }],
          [{ text: '💰 تغییر هدیه معرفی', callback_data: 'set_reward_toman' }],
          [{ text: '🔙 بازگشت به منوی ادمین', callback_data: 'admin_main' }]
        ]
      }
    });
  };

  const sendProductsMenu = (chatId: number) => {
    const state = db.getState();
    let msg = '📦 پکیج‌ها و محصولات فعال در ربات:\n\n';
    if (state.products.length === 0) {
      msg += '❌ هیچ محصولی تعریف نشده است.';
    } else {
      state.products.forEach((p, idx) => {
        const inboundText = p.inboundId ? `🆔 اینباند اختصاصی: ${p.inboundId}` : '🆔 اینباند: عمومی (تعریف شده در تنظیمات)';
        msg += `${idx + 1}- *${p.name}*\n💰 قیمت: ${p.price.toLocaleString()} تومان\n📦 حجم: ${p.volumeGb} GB\n⏳ زمان: ${p.durationDays} روز\n${inboundText}\n🗑 آیدی محصول: \`${p.id}\`\n----------------\n`;
      });
    }

    const inline_keyboard: any[] = [];
    state.products.forEach(p => {
      inline_keyboard.push([{ text: `🗑 حذف "${p.name}"`, callback_data: `del_prod_${p.id}` }]);
    });
    inline_keyboard.push([{ text: '➕ افزودن محصول جدید', callback_data: 'add_prod' }]);
    inline_keyboard.push([{ text: '🔙 بازگشت به منوی ادمین', callback_data: 'admin_main' }]);

    bot!.sendMessage(chatId, msg, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard
      }
    });
  };

  const sendUsersMenu = (chatId: number) => {
    const state = db.getState();
    const sellers = state.users.filter(u => u.isSeller);
    const msg = `👥 مدیریت جامع کاربران و فروشنده‌ها:

کل اعضای ربات: ${state.users.length} نفر
تعداد همکاران فروشنده: ${sellers.length} نفر

یکی از دستورات زیر را برای اعمال انتخاب کنید:`;

    bot!.sendMessage(chatId, msg, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📋 لیست کل کاربران ربات', callback_data: 'list_all_users' }],
          [{ text: '👥 لیست مبالغ و آمار همکاران', callback_data: 'list_sellers_only' }],
          [{ text: '➕ شارژ دستی موجودی کاربر', callback_data: 'charge_user_bot' }],
          [{ text: '🔄 تغییر نقش همکار/عادی', callback_data: 'change_role_bot' }],
          [{ text: '💵 تسویه حساب همکار', callback_data: 'settle_user_bot' }],
          [{ text: '🔙 بازگشت به منوی ادمین', callback_data: 'admin_main' }]
        ]
      }
    });
  };

  bot.onText(/\/start(?:\s+(.+))?/, (msg, match) => {
    const chatId = msg.chat.id;
    const refCode = match ? match[1] : undefined;
    
    let user = db.getUser(chatId);
    let isNewUser = false;

    if (!user) {
      isNewUser = true;
      user = {
        chatId: chatId,
        username: msg.from?.username,
        balance: 0,
        testUsed: false,
        registeredAt: new Date().toISOString(),
        referralsMade: 0
      };

      if (refCode && refCode.startsWith('ref_')) {
        const referrerId = parseInt(refCode.replace('ref_', ''));
        if (!isNaN(referrerId) && referrerId !== chatId) {
          const referrer = db.getUser(referrerId);
          if (referrer) {
            user.referredBy = referrerId;
            const currentState = db.getState();
            referrer.balance += currentState.referralRewardToman || 0;
            referrer.referralsMade = (referrer.referralsMade || 0) + 1;
            db.saveUser(referrer);
            if (currentState.referralRewardToman > 0) {
              bot!.sendMessage(referrerId, `🎉 تبریک!\nیک کاربر با لینک شما عضو شد و ${currentState.referralRewardToman} تومان به موجودی شما اضافه شد.`);
            }
          }
        }
      }

      db.saveUser(user);
      
      const adminIds = db.getState().adminIds;
      if (adminIds.length === 0) {
        db.updateState({ adminIds: [chatId] });
        bot!.sendMessage(chatId, 'شما به عنوان اولین ادمین ربات تنظیم شدید. برای مدیریت از /admin استفاده کنید.');
      }
    } else {
      // Keep username up to date if they changed it
      if (msg.from?.username && user.username !== msg.from.username) {
        user.username = msg.from.username;
        db.saveUser(user);
      }
    }

    const startMsg = `👋 سلام به ربات خدمات VPN فوق سریع ما خوش آمدید!\n\n` +
      `🆔 شناسه عددی شما (Chat ID):\n\`${chatId}\`\n\n` +
      `💡 جهت ثبت مدیریت، می‌توانید شناسه فوق را در داشبورد تحت وب کپی و ذخیره نمایید.\n\n` +
      `لطفاً یکی از گزینه‌های زیر را انتخاب کنید:`;

    bot!.sendMessage(chatId, startMsg, {
      parse_mode: 'Markdown',
      reply_markup: {
        keyboard: [
          [{ text: '🎁 تست رایگان' }, { text: '🛒 خرید سرویس' }],
          [{ text: '👤 پروفایل و موجودی' }, { text: '🔗 زیرمجموعه‌گیری' }],
          ...(user.isSeller ? [[{ text: '📊 پنل همکار (فروشنده)' }]] : [])
        ],
        resize_keyboard: true
      }
    });
  });

  bot.onText(/\/admin/, (msg) => {
    const chatId = msg.chat.id;
    const state = db.getState();
    if (!state.adminIds.includes(chatId)) {
      bot!.sendMessage(chatId, '❌ شما به این بخش دسترسی ندارید.');
      return;
    }
    sendAdminMainMenu(chatId);
  });

  bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    // Check if user is admin and bot waiting for plain text inputs
    const state = db.getState();
    const isAdmin = state.adminIds.includes(chatId);
    const sessionType = adminSession.get(chatId);

    if (isAdmin && sessionType && text && !text.startsWith('/')) {
      adminSession.delete(chatId);
      
      if (sessionType === 'set_p_url') {
        state.panel.url = text.trim();
        db.updateState({ panel: state.panel });
        bot!.sendMessage(chatId, `✅ آدرس پنل به \`${text}\` تغییر یافت.`, { parse_mode: 'Markdown' });
        sendSanaeiConnectionMenu(chatId);
        return;
      }
      if (sessionType === 'set_p_user') {
        state.panel.username = text.trim();
        db.updateState({ panel: state.panel });
        bot!.sendMessage(chatId, '✅ نام کاربری ورود به پنل با موفقیت ویرایش شد.');
        sendSanaeiConnectionMenu(chatId);
        return;
      }
      if (sessionType === 'set_p_pass') {
        state.panel.password = text.trim();
        db.updateState({ panel: state.panel });
        bot!.sendMessage(chatId, '✅ رمز عبور ورود به پنل با موفقیت بروزرسانی شد.');
        sendSanaeiConnectionMenu(chatId);
        return;
      }
      if (sessionType === 'set_p_inbound') {
        const val = parseInt(text.trim());
        if (isNaN(val)) {
          bot!.sendMessage(chatId, '❌ مقدار وارد شده باید یک عدد صحیح باشد.');
          sendSanaeiConnectionMenu(chatId);
          return;
        }
        state.panel.inboundId = val;
        db.updateState({ panel: state.panel });
        bot!.sendMessage(chatId, `✅ شناسه اینباند با موفقیت به \`${val}\` تغییر یافت.`, { parse_mode: 'Markdown' });
        sendSanaeiConnectionMenu(chatId);
        return;
      }
      if (sessionType === 'set_t_volume') {
        const val = parseFloat(text.trim());
        if (isNaN(val)) {
          bot!.sendMessage(chatId, '❌ مقدار حجم وارد شده معتبر نمی‌باشد.');
          sendTestSettingsMenu(chatId);
          return;
        }
        db.updateState({ freeTestVolumeGb: val });
        bot!.sendMessage(chatId, `✅ حجم اکانت تست رایگان به \`${val} گیگابایت\` تغییر یافت.`, { parse_mode: 'Markdown' });
        sendTestSettingsMenu(chatId);
        return;
      }
      if (sessionType === 'set_t_days') {
        const val = parseInt(text.trim());
        if (isNaN(val)) {
          bot!.sendMessage(chatId, '❌ مقدار زمان وارد شده معتبر نمی‌باشد.');
          sendTestSettingsMenu(chatId);
          return;
        }
        db.updateState({ freeTestDurationDays: val });
        bot!.sendMessage(chatId, `✅ زمان اکانت تست رایگان به \`${val} روز\` تغییر یافت.`, { parse_mode: 'Markdown' });
        sendTestSettingsMenu(chatId);
        return;
      }
      if (sessionType === 'set_reward_toman') {
        const val = parseInt(text.trim());
        if (isNaN(val)) {
          bot!.sendMessage(chatId, '❌ پاداش وارد شده معتبر نمی‌باشد.');
          sendTestSettingsMenu(chatId);
          return;
        }
        db.updateState({ referralRewardToman: val });
        bot!.sendMessage(chatId, `✅ پاداش معرفی با موفقیت به \`${val} تومان\` تغییر یافت.`, { parse_mode: 'Markdown' });
        sendTestSettingsMenu(chatId);
        return;
      }
      if (sessionType === 'add_prod') {
        const parts = text.split(',');
        if (parts.length < 4) {
          bot!.sendMessage(chatId, '❌ فرمت وارد شده اشتباه است. دوباره دکمه افزودن را بزنید و طبق الگو بفرستید.');
          sendProductsMenu(chatId);
          return;
        }
        const name = parts[0].trim();
        const price = parseInt(parts[1].trim());
        const volumeGb = parseFloat(parts[2].trim());
        const durationDays = parseInt(parts[3].trim());
        const inboundId = parts.length >= 5 ? (parseInt(parts[4].trim()) || undefined) : undefined;

        if (isNaN(price) || isNaN(volumeGb) || isNaN(durationDays)) {
          bot!.sendMessage(chatId, '❌ مقادیر عددی پکیج نامعتبر است.');
          sendProductsMenu(chatId);
          return;
        }

        const newId = `p_${Date.now()}`;
        state.products.push({ id: newId, name, price, volumeGb, durationDays, inboundId });
        db.updateState({ products: state.products });
        
        bot!.sendMessage(chatId, `✅ محصول جدید *${name}* با موفقیت تعریف شد.`, { parse_mode: 'Markdown' });
        sendProductsMenu(chatId);
        return;
      }
      if (sessionType === 'charge_user_bot') {
        const parts = text.trim().split(/\s+/);
        if (parts.length < 2) {
          bot!.sendMessage(chatId, '❌ فرمت وارد شده اشتباه است. لطفا شناسه عددی و مبلغ را با فاصله بفرستید.');
          sendUsersMenu(chatId);
          return;
        }
        const targetId = parseInt(parts[0]);
        const amount = parseInt(parts[1]);
        if (isNaN(targetId) || isNaN(amount)) {
          bot!.sendMessage(chatId, '❌ شناسه یا مبلغ وارد شده معتبر نمی‌باشد.');
          sendUsersMenu(chatId);
          return;
        }
        const targetUser = db.getUser(targetId);
        if (!targetUser) {
          bot!.sendMessage(chatId, '❌ کاربر مورد نظر یافت نشد.');
          sendUsersMenu(chatId);
          return;
        }
        targetUser.balance = (targetUser.balance || 0) + amount;
        db.saveUser(targetUser);
        bot!.sendMessage(chatId, `✅ حساب کاربر 👤 ${targetUser.username ? '@' + targetUser.username : 'بدون یوزرنیم'} به مقدار *${amount.toLocaleString()}* تومان شارژ دسترسی یافت.`, { parse_mode: 'Markdown' });
        bot!.sendMessage(targetId, `🎉 حساب کاربری شما توسط مدیریت به مبلغ *${amount.toLocaleString()}* تومان شارژ شد!`, { parse_mode: 'Markdown' }).catch(() => {});
        sendUsersMenu(chatId);
        return;
      }
      if (sessionType === 'change_role_bot') {
        const targetId = parseInt(text.trim());
        if (isNaN(targetId)) {
          bot!.sendMessage(chatId, '❌ قالب شناسه کاربری نامعتبر است.');
          sendUsersMenu(chatId);
          return;
        }
        const targetUser = db.getUser(targetId);
        if (!targetUser) {
          bot!.sendMessage(chatId, '❌ کاربر مورد نظر یافت نشد.');
          sendUsersMenu(chatId);
          return;
        }
        targetUser.isSeller = !targetUser.isSeller;
        if (targetUser.isSeller) {
          targetUser.debt = 0;
          targetUser.totalSales = 0;
        }
        db.saveUser(targetUser);
        bot!.sendMessage(chatId, `✅ وضعیت فروشندگی کاربر 👤 ${targetUser.username ? '@' + targetUser.username : 'بدون یوزرنیم'} به *${targetUser.isSeller ? 'همکار فروشنده' : 'کاربر عادی'}* تغییر یافت.`, { parse_mode: 'Markdown' });
        bot!.sendMessage(targetId, `✨ وضعیت همکار شما: نقش کاربری شما به *${targetUser.isSeller ? 'همکار فروشنده' : 'کاربر عادی'}* تغییر کرده است.`, { parse_mode: 'Markdown' }).catch(() => {});
        sendUsersMenu(chatId);
        return;
      }
      if (sessionType === 'settle_user_bot') {
        const targetId = parseInt(text.trim());
        if (isNaN(targetId)) {
          bot!.sendMessage(chatId, '❌ قالب عددی شناسه اشتباه است.');
          sendUsersMenu(chatId);
          return;
        }
        const targetUser = db.getUser(targetId);
        if (!targetUser) {
          bot!.sendMessage(chatId, '❌ همکار فروشنده یافت نشد.');
          sendUsersMenu(chatId);
          return;
        }
        targetUser.debt = 0;
        db.saveUser(targetUser);
        bot!.sendMessage(chatId, `✅ بدهی همکار 👤 ${targetUser.username ? '@' + targetUser.username : 'بدون یوزرنیم'} با موفقیت صفر شد (تسویه حساب کامل).`);
        bot!.sendMessage(targetId, '💵 حساب بدهی شما توسط مدیریت تسویه شد و به صفر بازگشت.').catch(() => {});
        sendUsersMenu(chatId);
        return;
      }

      if (sessionType === 'get_backup_password') {
        const backupPassword = text.trim();
        bot!.sendMessage(chatId, '⏳ در حال ساخت فایل پشتیبان رمزگذاری شده...');
        try {
          const rawData = fs.readFileSync(path.join(process.cwd(), 'db.json'), 'utf8');
          const encryptedPayload = encryptData(rawData, backupPassword);
          const backupFileName = `sanaei_backup_${Date.now()}.json`;
          const backupPath = path.join(process.cwd(), backupFileName);
          
          fs.writeFileSync(backupPath, encryptedPayload, 'utf8');
          
          await bot!.sendDocument(chatId, backupPath, {
            caption: `📥 فایل بکاپ رمزگذاری شده با موفقیت تولید شد.\n\n🔑 رمز فایل بکاپ شما: *${backupPassword}*\n\n⚠️ حتما این فایل و رمز را در جایی مطمئن یادداشت و نگهداری کنید. جهت بازیابی اطلاعات، کافیست همین فایل .json را به ربات ارسال فرمایید.`,
            parse_mode: 'Markdown'
          });
          
          try {
            fs.unlinkSync(backupPath);
          } catch (e) {}
        } catch (err: any) {
          bot!.sendMessage(chatId, `❌ خطا در ایجاد فایل پشتیبان: ${err.message}`);
        }
        return;
      }

      if (sessionType && sessionType.startsWith('restore_pass_')) {
        const fileId = sessionType.replace('restore_pass_', '');
        const backupPassword = text.trim();
        bot!.sendMessage(chatId, '⏳ در حال دریافت و رمزگشایی فایل پشتیبان...');
        try {
          const file = await bot!.getFile(fileId);
          const dUrl = `https://api.telegram.org/file/bot${state.botToken}/${file.file_path}`;
          const res = await axios.get(dUrl);
          
          let fileData = res.data;
          if (typeof fileData === 'object') {
            fileData = JSON.stringify(fileData);
          }
          
          const decryptedData = decryptData(fileData, backupPassword);
          const parsed = JSON.parse(decryptedData);
          
          if (!parsed.panel || !parsed.users) {
            throw new Error('محتوای فایل معتبر نمی‌باشد.');
          }
          
          const dbPath = path.join(process.cwd(), 'db.json');
          fs.writeFileSync(dbPath, JSON.stringify(parsed, null, 2), 'utf8');
          db.updateState(parsed);
          
          bot!.sendMessage(chatId, '✅ بازیابی کامل اطلاعات با موفقیت انجام شد! تمامی کاربران، محصولات، تراکنش‌ها، کانکشن پنل سنایی و تنظیمات ربات با موفقیت جایگذاری و دیتابیس همگام شد. 🎉');
          
          setTimeout(() => {
            initBot();
          }, 1500);
        } catch (err: any) {
          bot!.sendMessage(chatId, `❌ خطا در رمزگشایی و بازیابی فایل: ${err.message}\n\nلطفا مجدداً رمز صحیح را بازنویسی کنید یا فایل بکاپ سالمی ارسال کنید.`);
        }
        return;
      }
    }

    if (!text || text.startsWith('/start') || text === '/admin') return;

    // Helper to strip any emojis from the message for robust Persian matching
    const cleanText = text.replace(/[\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD00-\uDFFF]/g, '').trim();

    if (cleanText === 'تست رایگان' || cleanText === 'اکانت تست' || text.includes('تست رایگان')) {
      const user = db.getUser(chatId);
      if (!user) return;
      if (user.testUsed) {
        bot!.sendMessage(chatId, '❌ شما قبلا از تست رایگان خود استفاده کرده‌اید.');
        return;
      }

      bot!.sendMessage(chatId, '⏳ در حال ساخت اکانت تست شما...');
      try {
        const state = db.getState();
        const client = await xui.addClient(`test_${chatId}`, state.freeTestVolumeGb, state.freeTestDurationDays);
        
        user.testUsed = true;
        db.saveUser(user);

        bot!.sendMessage(chatId, `✅ اکانت تست با موفقیت ساخته شد!\n\nحجم: ${state.freeTestVolumeGb}GB\nزمان: ${state.freeTestDurationDays} روز\n\n🔗 لینک اشتراک (اضافه کردن به v2rayNG):\n\`${client.subUrl}\``, { parse_mode: 'Markdown' });
      } catch (err: any) {
        bot!.sendMessage(chatId, `❌ خطا در ساخت اکانت: ${err.message}`);
      }
      return;
    }

    if (cleanText === 'پروفایل و موجودی' || cleanText === 'پروفایل' || text.includes('پروفایل') || text.includes('موجودی')) {
      const user = db.getUser(chatId);
      if (!user) return;
      bot!.sendMessage(chatId, `👤 کاربر: ${msg.from?.first_name || 'ناشناس'}\n🆔 آیدی: ${chatId}\n💰 موجودی: ${user.balance} تومان\n👥 تعداد زیرمجموعه‌ها: ${user.referralsMade || 0}`);
      return;
    }

    if (cleanText === 'پنل همکار (فروشنده)' || cleanText === 'پنل همکار' || text.includes('پنل همکار') || text.includes('همکار') || text.includes('فروشنده')) {
      const user = db.getUser(chatId);
      if (!user || !user.isSeller) return;
      bot!.sendMessage(chatId, `📊 آمار فروش شما:\n\n💰 مجموع فروش: ${(user.totalSales || 0).toLocaleString()} تومان\n📉 بدهی فعلی به ادمین: ${(user.debt || 0).toLocaleString()} تومان\n\nبرای ثبت فروش جدید از منوی اصلی "خرید سرویس" را انتخاب کنید.`);
      return;
    }

    if (cleanText === 'زیرمجموعه‌گیری' || cleanText === 'زیرمجموعه' || text.includes('زیرمجموعه') || text.includes('دعوت')) {
      const me = await bot!.getMe();
      const refLink = `https://t.me/${me.username}?start=ref_${chatId}`;
      const state = db.getState();
      bot!.sendMessage(chatId, `🔗 لینک اختصاصی شما برای دعوت دوستان:\n\n${refLink}\n\n🎁 با دعوت هر دوست ${state.referralRewardToman || 0} تومان پاداش بگیرید!`);
      return;
    }

    if (cleanText === 'خرید سرویس' || cleanText === 'خرید اکانت' || text.includes('خرید سرویس')) {
      const state = db.getState();
      if (state.products.length === 0) {
        bot!.sendMessage(chatId, '❌ هیچ محصولی موجود نیست.');
        return;
      }

      const inlineKeyboard = state.products.map(p => ([
        { text: `${p.name} - ${p.price} تومان`, callback_data: `buy_${p.id}` }
      ]));

      bot!.sendMessage(chatId, '🛍 لطفا یک محصول انتخاب کنید:', {
         reply_markup: {
           inline_keyboard: inlineKeyboard
         }
      });
      return;
    }

    // Restore Backup System if admin uploads the json document
    if (msg.document) {
      const state = db.getState();
      if (state.adminIds.includes(chatId) && msg.document.file_name?.endsWith('.json')) {
        adminSession.set(chatId, `restore_pass_${msg.document.file_id}`);
        bot!.sendMessage(chatId, '📥 فایل پشتیبان دریافت شد.\n\n🔑 لطفا رمز عبور فایل بکاپ را ارسال کُنید تا رمزگشایی و بازیابی اطلاعات انجام شود:');
        return;
      }
    }

    // Fallback response for unhandled messages to avoid echoing the start message or freezing
    bot!.sendMessage(chatId, '❓ پیام ارسالی شما شناسایی نشد.\n\nلطفاً از میان گزینه‌های منوی زیر انتخاب نمایید یا روی دکمه مربوطه در پایین صفحه ضربه بزنید:', {
      reply_markup: {
        keyboard: [
          [{ text: '🎁 تست رایگان' }, { text: '🛒 خرید سرویس' }],
          [{ text: '👤 پروفایل و موجودی' }, { text: '🔗 زیرمجموعه‌گیری' }],
          ...(db.getUser(chatId)?.isSeller ? [[{ text: '📊 پنل همکار (فروشنده)' }]] : [])
        ],
        resize_keyboard: true
      }
    });
  });

  bot.on('callback_query', async (query) => {
    const chatId = query.message?.chat.id;
    if (!chatId) return;
    
    const user = db.getUser(chatId);
    if (!user) return;

    const data = query.data;
    const state = db.getState();
    const isAdmin = state.adminIds.includes(chatId);

    if (data === 'admin_main') {
      if (isAdmin) {
        sendAdminMainMenu(chatId);
      }
      bot!.answerCallbackQuery(query.id);
      return;
    }

    if (data === 'admin_backup') {
      if (isAdmin) {
        adminSession.set(chatId, 'get_backup_password');
        bot!.sendMessage(chatId, '🔑 لطفا یک رمز عبور دلخواه برای رمزگذاری و محافظت از فایل بکاپ خود وارد کنید:\n\n*(هنگام بازیابی این فایل، وارد کردن این رمز عبور الزامی است)*', { parse_mode: 'Markdown' });
      }
      bot!.answerCallbackQuery(query.id);
      return;
    }

    if (data === 'admin_restore_prompt') {
      if (isAdmin) {
        bot!.sendMessage(chatId, '📤 *راهنمای بازیابی فایل پشتیبان (ری‌استور)*:\n\nلطفاً فایل پشتیبان با پسوند `.json` را که قبلاً از این ربات یا از پنل وب ادمین دریافت کرده‌اید به همین چت فوروارد یا ارسال کُنید.\n\nپس از دریافت فایل، سیستم رمز عبور بکاپ را جهت رمزگشایی و اعمال نهایی از شما خواهد پرسید.', { parse_mode: 'Markdown' });
      }
      bot!.answerCallbackQuery(query.id);
      return;
    }

    if (data === 'admin_panel_menu') {
      if (isAdmin) {
        sendSanaeiConnectionMenu(chatId);
      }
      bot!.answerCallbackQuery(query.id);
      return;
    }

    if (data === 'admin_fetch_inbounds') {
      if (isAdmin) {
        bot!.sendMessage(chatId, '⏳ در حال دریافت لیست اینباندهای پنل...');
        try {
          const list = await xui.getInbounds();
          if (!list || list.length === 0) {
            bot!.sendMessage(chatId, '❌ هیچ اینباندی یافت نشد یا اتصال با پنل برقرار نشد. لطفا مشخصات اتصال (آدرس، یوزرنیم و رمز پنل) را مجدد بررسی فرمایید.');
          } else {
            let text = '⚡️ لیست اینباندهای یافت شده:\n\n';
            list.forEach((inb: any) => {
              text += `🆔 شناسه ID: \`${inb.id}\`\n💬 عنوان (Remark): ${inb.remark}\n🔌 پورت: ${inb.port}\n🌐 پروتکل: ${inb.protocol}\n------------------------\n`;
            });
            bot!.sendMessage(chatId, text, { parse_mode: 'Markdown' });
          }
        } catch(err: any) {
           bot!.sendMessage(chatId, `❌ خطا در برقراری ارتباط با پنل سنایی: ${err.message}`);
        }
      }
      bot!.answerCallbackQuery(query.id);
      return;
    }

    if (data === 'admin_test_menu') {
      if (isAdmin) {
        sendTestSettingsMenu(chatId);
      }
      bot!.answerCallbackQuery(query.id);
      return;
    }

    if (data === 'admin_products_menu') {
      if (isAdmin) {
        sendProductsMenu(chatId);
      }
      bot!.answerCallbackQuery(query.id);
      return;
    }

    if (data === 'admin_users_menu') {
      if (isAdmin) {
        sendUsersMenu(chatId);
      }
      bot!.answerCallbackQuery(query.id);
      return;
    }

    if (data === 'list_all_users') {
      if (isAdmin) {
        if (state.users.length === 0) {
          bot!.sendMessage(chatId, '❌ هیچ کاربری ثبت نشده است.');
        } else {
          let text = '📋 لیست کل کاربران ربات:\n\n';
          state.users.forEach((u, idx) => {
            text += `${idx + 1}- 👤 ${u.username ? '@' + u.username : 'بدون یوزرنیم'}\n🆔 آیدی عددی: \`${u.chatId}\`\n💰 موجودی: ${(u.balance || 0).toLocaleString()} تومان\n👤 نقش: ${u.isSeller ? 'همکار' : 'عادی'}\n------------------\n`;
            if (text.length > 3500) {
              bot!.sendMessage(chatId, text, { parse_mode: 'Markdown' });
              text = '';
            }
          });
          if (text) {
             bot!.sendMessage(chatId, text, { parse_mode: 'Markdown' });
          }
        }
      }
      bot!.answerCallbackQuery(query.id);
      return;
    }

    if (data === 'list_sellers_only') {
      if (isAdmin) {
        const sellers = state.users.filter(u => u.isSeller);
        if (sellers.length === 0) {
          bot!.sendMessage(chatId, '❌ هیچ همکار فروشنده‌ای ثبت نشده است.');
        } else {
          let text = '👥 لیست کل فروشندگان همکار:\n\n';
          sellers.forEach((s, idx) => {
            text += `${idx + 1}- 👤 ${s.username ? '@' + s.username : 'بدون یوزرنیم'}\n🆔 شناسه کاربری: \`${s.chatId}\`\n📉 بدهی به مدیریت: ${(s.debt || 0).toLocaleString()} تومان\n💰 مجموع کل فروش: ${(s.totalSales || 0).toLocaleString()} تومان\n------------------\n`;
          });
          bot!.sendMessage(chatId, text, { parse_mode: 'Markdown' });
        }
      }
      bot!.answerCallbackQuery(query.id);
      return;
    }

    // Capture text input requests
    const inputs = ['set_p_url', 'set_p_user', 'set_p_pass', 'set_p_inbound', 'set_t_volume', 'set_t_days', 'set_reward_toman', 'add_prod', 'charge_user_bot', 'change_role_bot', 'settle_user_bot'];
    if (inputs.includes(data)) {
      if (isAdmin) {
        adminSession.set(chatId, data);
        let promptText = '';
        if (data === 'set_p_url') promptText = '🔗 لطفا آدرس کانکشن پنل سنایی (X-UI) را ارسال کنید.\nمثال:\n`http://1.2.3.4:2053/`';
        if (data === 'set_p_user') promptText = '👤 لطفا نام کاربری مدیریت ورود به پنل سنایی را ارسال کنید:';
        if (data === 'set_p_pass') promptText = '🔑 لطفا رمز عبور مدیریت ورود به پنل سنایی را ارسال کنید:';
        if (data === 'set_p_inbound') promptText = '🆔 لطفا آیدی عددی Inbound مدنظر خود در پنل سنایی را بفرستید:';
        if (data === 'set_t_volume') promptText = '📦 حجم مورد نظر برای اکانت تست رایگان کاربر جدید را وارد کنید (به گیگابایت):';
        if (data === 'set_t_days') promptText = '⏰ مدت زمان اعتبار اکانت تست رایگان را وارد کنید (به روز):';
        if (data === 'set_reward_toman') promptText = '💰 هدیه دریافت پاداش برای زیرمجموعه‌گیری به تومان را بفرستید:';
        if (data === 'add_prod') promptText = '➕ لطفا فرمت پکیج محصول جدید را به صورت دقیق بنویسید و بفرستید:\n\n`نام محصول,قیمت(به تومان),حجم(به گیگ),زمان(به روز),آیدی اینباند(عددی اختیاری)`\n\nمثال بدون اینباند:\n`طرح برنزی,50000,15,30`\n\nمثال با اینباند اختصاصی شماره ۲:\n`طرح طلایی,120000,50,30,2`';
        if (data === 'charge_user_bot') promptText = '➕ لطفا شناسه کاربری (Chat ID) و میزان شارژ مطلوب به تومان را با یک فاصله بنویسید:\n\nمثال:\n`51239401 50000`';
        if (data === 'change_role_bot') promptText = '🔄 لطفا شناسه کاربری (Chat ID) مدنظر را جهت جابجایی بین همکار/عادی بنویسید تا اعمال شود:\nمثال:\n`14023924`';
        if (data === 'settle_user_bot') promptText = '💵 لطفا شناسه کاربری (Chat ID) همکار مدنظر را جهت تسویه کامل بدهی به مدیریت ارسال کنید:';

        bot!.sendMessage(chatId, `${promptText}\n\n⚠️ برای لغو فرآیند می‌توانید دستور دیگری بفرستید.`, { parse_mode: 'Markdown' });
      }
      bot!.answerCallbackQuery(query.id);
      return;
    }

    if (data && data.startsWith('del_prod_')) {
      if (isAdmin) {
        const prodId = data.replace('del_prod_', '');
        state.products = state.products.filter(p => p.id !== prodId);
        db.updateState({ products: state.products });
        bot!.sendMessage(chatId, '🗑 محصول با موفقیت حذف شد.');
        sendProductsMenu(chatId);
      }
      bot!.answerCallbackQuery(query.id);
      return;
    }

    if (data && data.startsWith('buy_')) {
      const productId = data.replace('buy_', '');
      const state = db.getState();
      const product = state.products.find(p => p.id === productId);

      if (!product) {
        bot!.sendMessage(chatId, '❌ محصول یافت نشد.');
        bot!.answerCallbackQuery(query.id);
        return;
      }

      if (user.isSeller) {
        // Seller accumulates debt
      } else {
        if (user.balance < product.price) {
          bot!.sendMessage(chatId, `❌ موجودی کافی نیست!\n\nقیمت: ${product.price} تومان\nموجودی شما: ${user.balance} تومان\n\nجهت شارژ حساب با پشتیبانی هماهنگ کنید.`);
          bot!.answerCallbackQuery(query.id);
          return;
        }
      }

      bot!.sendMessage(chatId, `⏳ در حال خرید ${product.name} و ساخت کانفیگ...`);
      
      try {
        const client = await xui.addClient(`buy_${chatId}_${Date.now()}`, product.volumeGb, product.durationDays, product.inboundId);
        
        if (user.isSeller) {
          user.debt = (user.debt || 0) + product.price;
          user.totalSales = (user.totalSales || 0) + product.price;
        } else {
          user.balance -= product.price;
        }
        db.saveUser(user);

        let finalMsg = `✅ خرید با موفقیت انجام شد!\n\n📦 ${product.name}\n`;
        if (user.isSeller) {
           finalMsg += `📉 بدهی جدید شما: ${(user.debt || 0).toLocaleString()} تومان\n\n`;
        } else {
           finalMsg += `💰 موجودی جدید: ${user.balance.toLocaleString()} تومان\n\n`;
        }
        finalMsg += `🔗 لینک اشتراک:\n\`${client.subUrl}\``;

        bot!.sendMessage(chatId, finalMsg, { parse_mode: 'Markdown' });
      } catch (err: any) {
        bot!.sendMessage(chatId, `❌ ساخت کانفیگ شکست خورد: ${err.message}`);
      }

      bot!.answerCallbackQuery(query.id);
    }
  });
}
