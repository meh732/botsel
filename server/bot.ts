import TelegramBot from 'node-telegram-bot-api';
import { db } from './db.js';
import { xui } from './xui.js';
import fs from 'fs';
import path from 'path';

let bot: TelegramBot | null = null;
let isPolling = false;

export function initBot() {
  const state = db.getState();
  if (!state.botToken) {
    console.log('No Bot Token configured. Bot not started.');
    return;
  }

  if (bot && isPolling) {
    bot.stopPolling();
  }

  bot = new TelegramBot(state.botToken, { polling: true });
  isPolling = true;

  bot.setMyCommands([
    { command: '/start', description: 'Meno - منوی اصلی' },
    { command: '/admin', description: 'مدیریت پنل' }
  ]).catch(err => console.error("Failed to set Bot commands (menu)", err));

  const MAIN_KEYBOARD: TelegramBot.SendMessageOptions = {
    reply_markup: {
      keyboard: [
        [{ text: '🎁 تست رایگان' }, { text: '🛒 خرید سرویس' }],
        [{ text: '👤 پروفایل و موجودی' }, { text: '🔗 زیرمجموعه‌گیری' }]
      ],
      resize_keyboard: true
    }
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
    }

    bot!.sendMessage(chatId, 'به ربات خدمات VPN ما خوش آمدید!\nلطفا یکی از گزینه‌های زیر را انتخاب کنید:', MAIN_KEYBOARD);
  });

  bot.onText(/\/admin/, (msg) => {
    const chatId = msg.chat.id;
    const state = db.getState();
    if (!state.adminIds.includes(chatId)) {
      bot!.sendMessage(chatId, '❌ شما به این بخش دسترسی ندارید.');
      return;
    }

    bot!.sendMessage(chatId, '🔧 پنل مدیریت ربات:', {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🖥 تنظیمات پنل سنایی', callback_data: 'admin_panel' }],
          [{ text: '📥 دریافت بکاپ فایل', callback_data: 'admin_backup' }],
          [{ text: '💰 مدیریت پاداش معرفی', callback_data: 'admin_reward' }]
        ]
      }
    });
  });

  bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (!text || text.startsWith('/start') || text === '/admin') return;

    if (text === '🎁 تست رایگان') {
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

    if (text === '👤 پروفایل و موجودی') {
      const user = db.getUser(chatId);
      if (!user) return;
      bot!.sendMessage(chatId, `👤 کاربر: ${msg.from?.first_name}\n🆔 آیدی: ${chatId}\n💰 موجودی: ${user.balance} تومان\n👥 تعداد زیرمجموعه‌ها: ${user.referralsMade || 0}`);
      return;
    }

    if (text === '🔗 زیرمجموعه‌گیری') {
      const me = await bot!.getMe();
      const refLink = `https://t.me/${me.username}?start=ref_${chatId}`;
      const state = db.getState();
      bot!.sendMessage(chatId, `🔗 لینک اختصاصی شما برای دعوت دوستان:\n\n${refLink}\n\n🎁 با دعوت هر دوست ${state.referralRewardToman || 0} تومان پاداش بگیرید!`);
      return;
    }

    if (text === '🛒 خرید سرویس') {
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

    // Restore Backup System
    if (msg.document) {
      const state = db.getState();
      if (state.adminIds.includes(chatId) && msg.document.file_name === 'db.json') {
        try {
           const fileId = msg.document.file_id;
           const file = await bot!.getFile(fileId);
           bot!.sendMessage(chatId, '⏳ در حال بازیابی و ری‌استارت ربات...');
           
           const dUrl = `https://api.telegram.org/file/bot${state.botToken}/${file.file_path}`;
           const axios = require('axios');
           const res = await axios.get(dUrl);
           const newData = res.data;
           
           const fs = require('fs');
           fs.writeFileSync(path.join(process.cwd(), 'db.json'), JSON.stringify(newData, null, 2));
           
           bot!.sendMessage(chatId, '✅ بکاپ با موفقیت بازیابی شد. لطفاً تغییرات را در پنل وب بررسی کنید.');
        } catch(e: any) {
           bot!.sendMessage(chatId, `❌ خطا در بازیابی بکاپ: ${e.message}`);
        }
      }
    }
  });

  bot.on('callback_query', async (query) => {
    const chatId = query.message?.chat.id;
    if (!chatId) return;
    
    const user = db.getUser(chatId);
    if (!user) return;

    const data = query.data;

    if (data === 'admin_backup') {
      const state = db.getState();
      if (state.adminIds.includes(chatId)) {
        bot!.sendDocument(chatId, path.join(process.cwd(), 'db.json'), { caption: '📥 بکاپ دیتابیس ربات. برای بازیابی، همین فایل را ریپلای کنید (یا در ربات بفرستید).' });
      }
      bot!.answerCallbackQuery(query.id);
      return;
    }

    if (data === 'admin_panel') {
      const state = db.getState();
      bot!.sendMessage(chatId, `ℹ️ وضعیت پنل فعلی:\nURL: ${state.panel.url || '❌ تنظیم نشده'}\nUsername: ${state.panel.username || '❌ تنظیم نشده'}\nInbound ID: ${state.panel.inboundId || '❌ تنظیم نشده'}\n\nبرای تنظیم پنل از پنل وب ادمین (/Settings) استفاده کنید. امکان آپدیت در ربات در آپدیت بعدی اضافه می‌شود.`);
      bot!.answerCallbackQuery(query.id);
      return;
    }

    if (data === 'admin_reward') {
      const state = db.getState();
      bot!.sendMessage(chatId, `💰 پاداش فعلی: ${state.referralRewardToman} تومان\n\nجهت تغییر این مقدار، از طریق پنل وب ادمین اقدام کنید.`);
      bot!.answerCallbackQuery(query.id);
      return;
    }

    if (data && data.startsWith('buy_')) {
      const productId = data.replace('buy_', '');
      const state = db.getState();
      const product = state.products.find(p => p.id === productId);

      if (!product) {
        bot!.sendMessage(chatId, '❌ محصول یافت نشد.');
        return;
      }

      if (user.balance < product.price) {
        bot!.sendMessage(chatId, `❌ موجودی کافی نیست!\n\nقیمت: ${product.price} تومان\nموجودی شما: ${user.balance} تومان\n\nجهت شارژ حساب با پشتیبانی هماهنگ کنید.`);
        return;
      }

      bot!.sendMessage(chatId, `⏳ در حال خرید ${product.name} و ساخت کانفیگ...`);
      
      try {
        const client = await xui.addClient(`buy_${chatId}_${Date.now()}`, product.volumeGb, product.durationDays);
        
        user.balance -= product.price;
        db.saveUser(user);

        bot!.sendMessage(chatId, `✅ خرید با موفقیت انجام شد!\n\n📦 ${product.name}\n💰 موجودی جدید: ${user.balance} تومان\n\n🔗 لینک اشتراک:\n\`${client.subUrl}\``, { parse_mode: 'Markdown' });
      } catch (err: any) {
        bot!.sendMessage(chatId, `❌ ساخت کانفیگ شکست خورد: ${err.message}`);
      }

      bot!.answerCallbackQuery(query.id);
    }
  });
}
