import { useState, useEffect } from 'react';
import { Save, RefreshCw, Send, Plus, Trash2, BatteryCharging, Settings2, Users as UsersIcon, Box, Download, Upload, Zap, CheckCircle } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<'settings' | 'products' | 'users'>('settings');

  return (
    <div className="w-full h-full min-h-screen bg-slate-50 flex flex-row" dir="rtl" style={{ fontFamily: "'Tahoma', 'Arial', sans-serif" }}>
      {/* Sidebar */}
      <div className="w-64 bg-slate-900 h-full min-h-screen flex flex-col shadow-xl sticky top-0">
        <div className="p-6 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center text-white font-bold">S</div>
            <span className="text-white font-semibold text-lg tracking-tight">مدیریت پنل سنایی</span>
          </div>
        </div>
        <nav className="flex-1 p-4 space-y-2">
          <TabBtn active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} icon={<Settings2 className="w-5 h-5"/>}>تنظیمات ربات</TabBtn>
          <TabBtn active={activeTab === 'products'} onClick={() => setActiveTab('products')} icon={<Box className="w-5 h-5"/>}>لیست محصولات</TabBtn>
          <TabBtn active={activeTab === 'users'} onClick={() => setActiveTab('users')} icon={<UsersIcon className="w-5 h-5"/>}>مشتریان</TabBtn>
        </nav>
        <div className="p-4 mt-auto border-t border-slate-800">
          <div className="bg-slate-800 rounded-lg p-3">
            <div className="flex justify-between items-center mb-1">
              <span className="text-xs text-slate-400">وضعیت سرور</span>
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            </div>
            <p className="text-white text-sm" dir="ltr">Sanaei Bot v2.1</p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-full min-h-screen overflow-hidden">
        {/* Header */}
        <header className="bg-white h-16 border-b border-slate-200 px-8 flex flex-shrink-0 items-center justify-between sticky top-0 z-10 w-full">
          <h2 className="text-slate-800 font-bold text-xl">داشبورد عملیات خودکار</h2>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="text-left" dir="ltr">
                <p className="text-sm font-medium">Main Admin</p>
                <p className="text-xs text-slate-400">Management</p>
              </div>
              <div className="w-10 h-10 bg-slate-200 rounded-full border-2 border-indigo-500 flex items-center justify-center font-bold text-indigo-500">A</div>
            </div>
          </div>
        </header>

        <main className="p-8 flex flex-col gap-6 flex-1 overflow-y-auto w-full" dir="ltr">
          {activeTab === 'settings' && <SettingsView />}
          {activeTab === 'products' && <ProductsView />}
          {activeTab === 'users' && <UsersView />}
        </main>
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, children, icon }: any) {
  return (
    <button 
      onClick={onClick}
      className={`w-full flex items-center gap-3 p-3 rounded-lg transition-colors text-sm font-medium ${active ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}
    >
      {icon}
      <span>{children}</span>
    </button>
  );
}

function SettingsView() {
  const [state, setState] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [inbounds, setInbounds] = useState<any[]>([]);
  const [adminIdsStr, setAdminIdsStr] = useState('');

  const [backupPassword, setBackupPassword] = useState('');
  const [restorePassword, setRestorePassword] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const [newCouponCode, setNewCouponCode] = useState('');
  const [newCouponPercent, setNewCouponPercent] = useState(20);

  const handleAddCoupon = async () => {
    if (!newCouponCode) {
      alert('لطفا کد تخفیف را وارد کنید.');
      return;
    }
    const code = newCouponCode.trim().toUpperCase();
    const percent = Number(newCouponPercent);
    if (isNaN(percent) || percent <= 0 || percent > 100) {
      alert('درصد تخفیف معتبر نیست (باید بین ۱ تا ۱۰۰ باشد).');
      return;
    }

    const currentCoupons = state.coupons || [];
    if (currentCoupons.some((c: any) => c.code === code)) {
      alert('این کد تخفیف قبلاً تعریف شده است.');
      return;
    }

    const updatedCoupons = [...currentCoupons, { code, discountPercent: percent }];
    
    setSaving(true);
    const parsedAdminIds = adminIdsStr
      .split(',')
      .map(s => s.trim())
      .filter(s => s !== '')
      .map(s => parseInt(s))
      .filter(id => !isNaN(id));

    const res = await fetch('/api/update-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        botToken: state.botToken,
        freeTestVolumeGb: Number(state.freeTestVolumeGb),
        freeTestDurationDays: Number(state.freeTestDurationDays),
        freeTestEnabled: state.freeTestEnabled !== false,
        freeTestInboundId: state.freeTestInboundId ? Number(state.freeTestInboundId) : undefined,
        supportUsername: state.supportUsername,
        referralRewardToman: Number(state.referralRewardToman) || 0,
        cardNumber: state.cardNumber,
        cardHolder: state.cardHolder,
        adminIds: parsedAdminIds,
        coupons: updatedCoupons
      })
    });
    const data = await res.json();
    if (data.success) {
      setState((prev: any) => ({ ...prev, coupons: updatedCoupons }));
      setNewCouponCode('');
      alert('کد تخفیف با موفقیت ایجاد شد.');
    }
    setSaving(false);
  };

  const handleDeleteCoupon = async (codeToDelete: string) => {
    if (!confirm(`آیا از حذف کد تخفیف ${codeToDelete} مطمئن هستید؟`)) return;
    const currentCoupons = state.coupons || [];
    const updatedCoupons = currentCoupons.filter((c: any) => c.code !== codeToDelete);

    setSaving(true);
    const parsedAdminIds = adminIdsStr
      .split(',')
      .map(s => s.trim())
      .filter(s => s !== '')
      .map(s => parseInt(s))
      .filter(id => !isNaN(id));

    const res = await fetch('/api/update-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        botToken: state.botToken,
        freeTestVolumeGb: Number(state.freeTestVolumeGb),
        freeTestDurationDays: Number(state.freeTestDurationDays),
        freeTestEnabled: state.freeTestEnabled !== false,
        freeTestInboundId: state.freeTestInboundId ? Number(state.freeTestInboundId) : undefined,
        supportUsername: state.supportUsername,
        referralRewardToman: Number(state.referralRewardToman) || 0,
        cardNumber: state.cardNumber,
        cardHolder: state.cardHolder,
        adminIds: parsedAdminIds,
        coupons: updatedCoupons
      })
    });
    const data = await res.json();
    if (data.success) {
      setState((prev: any) => ({ ...prev, coupons: updatedCoupons }));
      alert('کد تخفیف حذف شد.');
    }
    setSaving(false);
  };

  useEffect(() => {
    fetch('/api/state')
      .then(r => r.json())
      .then(data => {
        setState(data);
        if (data.adminIds) {
          setAdminIdsStr(data.adminIds.join(', '));
        }
      });

    // Prefetch inbounds automatically on mount if connected
    fetch('/api/xui-inbounds')
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setInbounds(data.inbounds || []);
        }
      })
      .catch(e => console.log('Could not prefetch panel inbounds:', e));
  }, []);

  if (!state) return <div className="text-center p-8">Loading...</div>;

  const saveGeneral = async () => {
    setSaving(true);
    // Parse comma-separated IDs to array of numbers
    const parsedAdminIds = adminIdsStr
      .split(',')
      .map(s => s.trim())
      .filter(s => s !== '')
      .map(s => parseInt(s))
      .filter(id => !isNaN(id));

    const res = await fetch('/api/update-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        botToken: state.botToken,
        freeTestVolumeGb: Number(state.freeTestVolumeGb),
        freeTestDurationDays: Number(state.freeTestDurationDays),
        freeTestEnabled: state.freeTestEnabled !== false,
        freeTestInboundId: state.freeTestInboundId ? Number(state.freeTestInboundId) : undefined,
        freeTestInboundIds: state.freeTestInboundIds || [],
        supportUsername: state.supportUsername,
        referralRewardToman: Number(state.referralRewardToman) || 0,
        cardNumber: state.cardNumber,
        cardHolder: state.cardHolder,
        adminIds: parsedAdminIds,
        coupons: state.coupons || []
      })
    });
    const data = await res.json();
    if (data.success) {
      setState(prevState => ({
        ...prevState,
        adminIds: parsedAdminIds
      }));
    }
    setSaving(false);
    alert('تنظیمات عمومی با موفقیت ذخیره شد. اگر توکن ربات تغییر کرده، ربات مجدداً راه‌اندازی شد.');
  };

  const savePanel = async () => {
    setSaving(true);
    await fetch('/api/update-panel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state.panel)
    });
    setSaving(false);
    alert('اطلاعات پنل سنایی ذخیره شد.');
  };

  const loadInbounds = async () => {
    try {
      const res = await fetch('/api/xui-inbounds');
      const data = await res.json();
      if (data.success) {
        setInbounds(data.inbounds);
      } else {
        alert('خطا در دریافت لیست اینباندها: ' + data.message);
      }
    } catch(e: any) {
      alert('خطا در ارتباط با پنل. مشخصات، آدرس و یا پورت و فایروال را بررسی کنید.');
    }
  };

  const testConnection = async () => {
    try {
      const res = await fetch('/api/test-panel-connection', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        alert('✅ ' + data.message);
        loadInbounds();
      } else {
        alert('❌ خطا: ' + data.message);
      }
    } catch (e: any) {
      alert('خطای شبکه: ' + e.message);
    }
  };

  const handleDownloadBackup = async () => {
    if (!backupPassword) {
      alert('لطفا یک رمز عبور جهت رمزگذاری کانفیگ بکاپ تعیین کنید.');
      return;
    }
    setActionLoading(true);
    try {
      const res = await fetch('/api/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: backupPassword })
      });
      const data = await res.json();
      if (data.success) {
        const blob = new Blob([data.payload], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `sanaei_bot_backup_${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        alert('خطا در ایجاد پشتیبان: ' + data.message);
      }
    } catch (e: any) {
      alert('خطای اتصال به سرور: ' + e.message);
    }
    setActionLoading(false);
  };

  const handleRestoreBackup = async () => {
    if (!restorePassword) {
      alert('لطفا ابتدا رمز عبور فایل بکاپ را وارد کنید.');
      return;
    }
    if (!selectedFile) {
      alert('لطفا ابتدا فایل بکاپ (.json) را انتخاب نمایید.');
      return;
    }
    
    setActionLoading(true);
    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const fileContent = event.target?.result as string;
        try {
          const res = await fetch('/api/restore', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              payload: fileContent,
              password: restorePassword
            })
          });
          const data = await res.json();
          if (data.success) {
            alert('بازیابی کامل اطلاعات ربات و دیتابیس با موفقیت انجام شد! تمامی بخش‌ها لود خواهند شد.');
            window.location.reload();
          } else {
            alert('پشتیبان بازیابی نشد: ' + data.message);
          }
        } catch (e: any) {
          alert('خطا در رمزگشایی بکاپ. رمز وارد شده اشتباه است یا فایل مخدوش شده است.');
        }
        setActionLoading(false);
      };
      reader.readAsText(selectedFile);
    } catch(e: any) {
      alert('خطا در خواندن فایل: ' + e.message);
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-8 max-w-2xl mx-auto" dir="rtl">
      {/* Configuration Help Card */}
      <div className="bg-gradient-to-tr from-slate-900 to-indigo-900 text-white p-6 rounded-xl shadow-md border border-slate-750">
        <h3 className="text-lg font-bold mb-2 flex items-center">💡 راهنمای کانفیگ و اتصال ربات به X-UI :</h3>
        <ul className="text-sm space-y-2 text-slate-200 leading-relaxed pr-4 list-disc">
          <li><strong>آیدی ادمین اصلی (Admin Chat IDs):</strong> هر کاربر تلگرام یک شناسه عددی دارد (مثلاً <code>51239241</code>) که می‌توانید آن را از ربات‌هایی مثل <code className="bg-slate-850 px-1 py-0.5 rounded text-indigo-300">@userinfobot</code> دریافت نموده و در بخش زیر ذخیره کنید. فقط این آیدی‌ها به بخش <code>/admin</code> در ربات دسترسی خواهند داشت.</li>
          <li><strong>اتصال سنایی (X-UI Connection):</strong> آدرس IP و پورت پنل خود را دقیقاً با پورت تعریف شده (مثلاً <code>http://1.2.3.4:2053</code>) وارد کنید. اگر پنل شما دارای پسوند مسیر (basePath) است حتماً آن را نیز بنویسید (مثل <code>http://1.2.3.4:2053/myprefix</code>).</li>
          <li><strong>شناسه اینباند (Inbound ID):</strong> تمام اکانت‌های تستی و فروخته شده به عنوان کلاینت (User) داخل یک <strong>Inbound</strong> در پنل سنایی اضافه می‌شوند. پس از ذخیره آدرس و پسورد پنل، روی دکمه <strong>"دریافت لیست اینباندها"</strong> کلیک کنید تا لیست اینباندهای شما لود شود و سپس شناسه (مثلاً <code>1</code> یا <code>2</code>) را کلیک یا تایپ کنید.</li>
        </ul>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <h2 className="text-lg font-bold mb-4 flex items-center gap-2"><Send className="w-5 h-5 text-indigo-600"/> تنظیمات عمومی و توکن ربات تلگرام</h2>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">توکن ربات تلگرام (Telegram Bot Token)</label>
            <input type="password" value={state.botToken} onChange={e => setState({...state, botToken: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500 font-mono text-sm text-left" dir="ltr" placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11" />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">شناسه عددی ادمین‌های اصلی (با ویرگول انگلیسی , جدا کنید)</label>
            <input type="text" value={adminIdsStr} onChange={e => setAdminIdsStr(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500 font-mono text-sm text-left" dir="ltr" placeholder="e.g. 51239241, 14023924" />
            <p className="text-xs text-slate-400 mt-1" dir="rtl">برای وارد کردن ادمین‌های ربات، شناسه‌های عددی آنها را با کاما جدا کنید.</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">فعال بودن اکانت تست</label>
              <select 
                value={state.freeTestEnabled !== false ? 'true' : 'false'} 
                onChange={e => setState({...state, freeTestEnabled: e.target.value === 'true'})} 
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500"
              >
                <option value="true">فعال (روشن)</option>
                <option value="false">غیرفعال (خاموش)</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-2">اینباندهای منتخب اکانت تست (می‌توانید یک یا چند اینباند را انتخاب کنید تا موازنه موازنه شوند):</label>
              {inbounds.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-3 bg-slate-50 rounded-lg border max-h-48 overflow-y-auto">
                  {inbounds.map((ib: any) => {
                    const isChecked = (state.freeTestInboundIds || []).includes(ib.id) || (state.freeTestInboundId === ib.id);
                    return (
                      <label key={ib.id} className="flex items-center gap-2 text-sm text-slate-700 hover:text-indigo-600 cursor-pointer select-none">
                        <input 
                          type="checkbox" 
                          checked={isChecked}
                          onChange={e => {
                            let updatedIds = [...(state.freeTestInboundIds || [])];
                            if (state.freeTestInboundId && !updatedIds.includes(state.freeTestInboundId)) {
                              updatedIds.push(state.freeTestInboundId);
                            }
                            if (e.target.checked) {
                              if (!updatedIds.includes(ib.id)) updatedIds.push(ib.id);
                            } else {
                              updatedIds = updatedIds.filter(id => id !== ib.id);
                            }
                            setState({
                              ...state,
                              freeTestInboundIds: updatedIds,
                              freeTestInboundId: updatedIds[0] || undefined
                            });
                          }}
                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="font-medium text-slate-800">{ib.remark}</span>
                        <span className="text-xs text-slate-500 font-mono bg-slate-200 px-1.5 py-0.5 rounded">ID: {ib.id} ({ib.protocol})</span>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-xs text-amber-700">
                  ⚠️ ابتدا دکمه "دریافت لیست اینباندها" را در پایین کلیک کنید تا اتصال برقرار شده و اینباندها جهت انتخاب لود گردند. در صورت نبود اتصال، می‌توانید از همان آیدی پیشفرض استفاده کنید.
                </div>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">حجم تست رایگان (گیگابایت)</label>
              <input type="number" value={state.freeTestVolumeGb} onChange={e => setState({...state, freeTestVolumeGb: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">مدت زمان تست رایگان (روز)</label>
              <input type="number" value={state.freeTestDurationDays} onChange={e => setState({...state, freeTestDurationDays: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">شماره کارت بانکی (کارت به کارت)</label>
              <input type="text" value={state.cardNumber || ''} onChange={e => setState({...state, cardNumber: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500 font-mono text-left" dir="ltr" placeholder="۶۰۳۷۹۹۷۹۱۲۳۴۵۶۷۸" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">نام صاحب کارت حساب</label>
              <input type="text" value={state.cardHolder || ''} onChange={e => setState({...state, cardHolder: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500 text-right" placeholder="مدیریت حساب" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">آیدی پشتیبانی تلگرام (بدون @)</label>
              <input type="text" value={state.supportUsername || ''} onChange={e => setState({...state, supportUsername: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500 text-left font-mono" dir="ltr" placeholder="SanaeiSupportAdmin" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">پاداش معرفی زیرمجموعه (تومان)</label>
              <input type="number" value={state.referralRewardToman || 0} onChange={e => setState({...state, referralRewardToman: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500" />
            </div>
          </div>

          <button onClick={saveGeneral} disabled={saving} className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 transition flex items-center mr-auto">
            <Save className="w-4 h-4 ml-2" /> ذخیره تنظیمات عمومی ربات
          </button>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <h2 className="text-lg font-bold mb-4 flex items-center gap-2"><RefreshCw className="w-5 h-5 text-emerald-600"/> مشخصات و اتصال پنل سنایی X-UI</h2>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">آدرس کامل اتصال به پنل سنایی (X-UI URL)</label>
            <input type="text" value={state.panel.url || ''} onChange={e => setState({...state, panel: {...state.panel, url: e.target.value}})} className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500 text-left font-mono" dir="ltr" placeholder="http://1.2.3.4:2053" />
          </div>
          <div className="grid grid-cols-2 gap-4">
             <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">نام کاربری ورود به پنل</label>
              <input type="text" value={state.panel.username || ''} onChange={e => setState({...state, panel: {...state.panel, username: e.target.value}})} className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">رمز عبور ورود به پنل</label>
              <input type="password" value={state.panel.password || ''} onChange={e => setState({...state, panel: {...state.panel, password: e.target.value}})} className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">کلید API Key اختصاصی پنل جدید (جهت عدم نیاز به نام کاربری و رمز عبور)</label>
            <input type="text" value={state.panel.apiKey || ''} onChange={e => setState({...state, panel: {...state.panel, apiKey: e.target.value}})} className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500 font-mono text-left" dir="ltr" placeholder="vXg7hY..." />
          </div>

          <div className="space-y-4">
            <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg flex items-start gap-3">
              <Settings2 className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
              <div className="text-sm text-amber-800">
                <p className="font-bold">راهنمای اتصال به پنل سنایی (MHSanaei):</p>
                <p className="mt-1">۱. آدرس پنل را با پورت وارد کنید (مثلا <code className="bg-amber-100 px-1 rounded">http://1.2.3.4:2053</code>).</p>
                <p>۲. اگر «Web Base Path» در تنظیمات پنل دارید، آن را به انتهای آدرس اضافه نکنید (ربات خودکار شناسایی می‌کند).</p>
                <p>۳. پیشنهاد می‌شود از کلید API برای امنیت و سرعت بیشتر استفاده کنید.</p>
              </div>
            </div>

            <div className="flex gap-2">
              <button 
                onClick={testConnection} 
                className="flex-1 bg-slate-800 text-white px-4 py-2.5 rounded-md hover:bg-slate-900 transition flex items-center justify-center font-medium shadow-sm"
              >
                <Zap className="w-4 h-4 ml-2" /> تست سریع و شناسایی مسیر پنل
              </button>
              <button 
                onClick={loadInbounds} 
                className="flex-1 bg-indigo-600 text-white px-4 py-2.5 rounded-md hover:bg-indigo-700 transition flex items-center justify-center font-medium shadow-sm"
              >
                <RefreshCw className="w-4 h-4 ml-2" /> واکشی لیست اینباندها
              </button>
            </div>

            <div className="space-y-2 border-t pt-4">
              <label className="block text-sm font-medium text-slate-700">اینباندهای پیش‌فرض (Global Inbounds)</label>
              <p className="text-[11px] text-slate-400">اینباندهایی که تیک می‌زنید، مقصد پیش‌فرض برای تمام فروش‌ها خواهند بود.</p>
              
              {inbounds.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 p-3 bg-slate-50 rounded-lg border max-h-60 overflow-y-auto">
                  {inbounds.map((ib: any) => {
                    const isChecked = (state.panel.inboundIds || []).includes(ib.id) || (state.panel.inboundId === ib.id);
                    return (
                      <label key={ib.id} className="flex items-center gap-2 p-2 hover:bg-white rounded border border-transparent hover:border-slate-200 transition text-sm text-slate-700 cursor-pointer select-none">
                        <input 
                          type="checkbox" 
                          checked={isChecked}
                          onChange={e => {
                            let updatedIds = [...(state.panel.inboundIds || [])];
                            if (state.panel.inboundId && !updatedIds.includes(state.panel.inboundId)) {
                              updatedIds.push(state.panel.inboundId);
                            }
                            if (e.target.checked) {
                              if (!updatedIds.includes(ib.id)) updatedIds.push(ib.id);
                            } else {
                              updatedIds = updatedIds.filter(id => id !== ib.id);
                            }
                            setState({
                              ...state,
                              panel: {
                                ...state.panel,
                                inboundIds: updatedIds,
                                inboundId: updatedIds[0] || undefined
                              }
                            });
                          }}
                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                        />
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-800">{ib.remark}</span>
                          <span className="text-[10px] text-slate-500 font-mono">Port: {ib.port} | ID: {ib.id}</span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <div className="p-8 border-2 border-dashed border-slate-200 rounded-lg flex flex-col items-center justify-center text-slate-400 bg-slate-50">
                  <Box className="w-10 h-10 mb-2 opacity-20" />
                  <p className="text-sm">هنوز لیستی دریافت نشده است.</p>
                  <button onClick={loadInbounds} className="mt-2 text-indigo-600 text-xs font-bold hover:underline">دریافت همین حالا</button>
                </div>
              )}
            </div>
          </div>

          {inbounds.length > 0 && (
            <div className="mt-4 border rounded-md overflow-hidden bg-slate-50">
               <table className="w-full text-sm text-right">
                  <thead className="bg-slate-100 text-slate-600 border-b">
                    <tr>
                      <th className="px-4 py-2 font-medium">شناسه ID</th>
                      <th className="px-4 py-2 font-medium">عنوان (Remark)</th>
                      <th className="px-4 py-2 font-medium">پورت</th>
                      <th className="px-4 py-2 font-medium">پروتکل</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inbounds.map((ib: any) => (
                      <tr key={ib.id} className="border-b last:border-0 hover:bg-white cursor-pointer" onClick={() => setState({...state, panel: { ...state.panel, inboundId: ib.id }})}>
                        <td className="px-4 py-2 font-mono">{ib.id}</td>
                        <td className="px-4 py-2 font-bold text-slate-800">{ib.remark}</td>
                        <td className="px-4 py-2 font-mono">{ib.port}</td>
                        <td className="px-4 py-2 text-indigo-600 font-bold">{ib.protocol}</td>
                      </tr>
                    ))}
                  </tbody>
               </table>
               <p className="text-xs text-emerald-600 p-2 text-center font-medium">💡 با کلیک روی هر ردیف بالا, شناسه آن به صورت اتوماتیک انتخاب می‌شود.</p>
            </div>
          )}

          <div className="flex gap-2 mr-auto">
            <button onClick={testConnection} className="bg-slate-800 text-white px-4 py-2 rounded-md hover:bg-slate-900 transition flex items-center">
              <Zap className="w-4 h-4 ml-2" /> تست سریع اتصال
            </button>
            <button onClick={savePanel} disabled={saving} className="bg-emerald-600 text-white px-4 py-2 rounded-md hover:bg-emerald-700 transition flex items-center">
              <Save className="w-4 h-4 ml-2" /> ذخیره اطلاعات اتصال پنل
            </button>
          </div>
        </div>
      </div>

      {/* Coupons/Discounts Management Secured Card */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <h2 className="text-lg font-bold mb-4 flex items-center gap-2"><Plus className="w-5 h-5 text-indigo-600"/> مدیریت کدهای تخفیف و کوپن‌ها (Tickets)</h2>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end bg-slate-50 p-4 rounded-lg border">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">کد تخفیف (کوپن)</label>
              <input value={newCouponCode} onChange={e => setNewCouponCode(e.target.value)} type="text" className="w-full px-3 py-1.5 border rounded-md text-sm font-mono text-left" placeholder="مثال: OFF50" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">درصد تخفیف (٪)</label>
              <input value={newCouponPercent} onChange={e => setNewCouponPercent(Number(e.target.value))} type="number" min="1" max="100" className="w-full px-3 py-1.5 border rounded-md text-sm font-mono" placeholder="20" />
            </div>
            <div>
              <button onClick={handleAddCoupon} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md font-medium text-xs transition">ایجاد کد تخفیف جدید</button>
            </div>
          </div>

          <div className="border rounded-md overflow-hidden">
             <table className="w-full text-sm text-right">
                <thead className="bg-slate-100 text-slate-600 border-b">
                  <tr>
                    <th className="px-4 py-2 font-medium">کد تخفیف</th>
                    <th className="px-4 py-2 font-medium">درصد تخفیف</th>
                    <th className="px-4 py-2 font-medium text-left">عملیات</th>
                  </tr>
                </thead>
                <tbody>
                  {(state.coupons || []).map((c: any) => (
                    <tr key={c.code} className="border-b last:border-0 hover:bg-slate-50 transition">
                      <td className="px-4 py-2 font-mono font-bold text-slate-800">{c.code}</td>
                      <td className="px-4 py-2 font-mono text-indigo-600 font-bold">{c.discountPercent}٪</td>
                      <td className="px-4 py-2 text-left">
                        <button onClick={() => handleDeleteCoupon(c.code)} className="text-red-600 hover:text-red-800 p-1 font-medium text-xs transition">حذف</button>
                      </td>
                    </tr>
                  ))}
                  {(!state.coupons || state.coupons.length === 0) && (
                    <tr><td colSpan={3} className="px-4 py-4 text-center text-slate-400 text-xs">هیچ کد تخفیفی تعریف نشده است.</td></tr>
                  )}
                </tbody>
             </table>
          </div>
        </div>
      </div>

      {/* Backup and Restore Secured System */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <h2 className="text-lg font-bold mb-4 flex items-center gap-2 text-slate-850">
          <Download className="w-5 h-5 text-indigo-600" /> پشتیبان‌گیری و بازیابی کل اطلاعات (بکاپ دیتابیس با رمز)
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 divide-y md:divide-y-0 md:divide-x md:divide-x-reverse divide-slate-200">
          {/* Download Encrypted Backup column */}
          <div className="space-y-4 pb-4 md:pb-0">
            <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">📥 تهیه پشتیبان رمزگذاری شده</h3>
            <p className="text-xs text-slate-400">یک رمز عبور جهت قفل کردن اطلاعات دیتابیس (امنیتی) وارد نموده و فایل پشتیبان را دانلود نمایید.</p>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">رمز عبور دلخواه برای فایل بکاپ</label>
              <input 
                type="password" 
                value={backupPassword} 
                onChange={e => setBackupPassword(e.target.value)} 
                className="w-full px-3 py-1.5 border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500 font-mono text-xs" 
                placeholder="مثلاً MySecuredPass" 
              />
            </div>
            <button 
              onClick={handleDownloadBackup} 
              disabled={actionLoading} 
              className="bg-indigo-600 text-white px-3 py-1.5 rounded-md hover:bg-indigo-700 transition flex items-center text-xs font-medium"
            >
              <Download className="w-3.5 h-3.5 ml-1.5" /> دانلود فایل بکاپ (.json)
            </button>
          </div>

          {/* Upload and Decrypt Restore column */}
          <div className="space-y-4 pt-4 md:pt-0 md:pr-4">
            <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">📤 بازیابی فایل پشتیبان</h3>
            <p className="text-xs text-slate-400">فایل بکاپ را آپلود کرده و رمز عبور قفل را برای بازگشایی و بازنویسی دیتابیس بنویسید.</p>
            
            <div className="space-y-2">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">انتخاب فایل پشتیبان (.json)</label>
                <input 
                  type="file" 
                  accept=".json" 
                  onChange={e => setSelectedFile(e.target.files?.[0] || null)} 
                  className="w-full text-xs text-slate-500 file:mr-4 file:py-1.5 file:px-2.5 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer" 
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">رمز عبور فایل جهت بازگشایی</label>
                <input 
                  type="password" 
                  value={restorePassword} 
                  onChange={e => setRestorePassword(e.target.value)} 
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500 font-mono text-xs" 
                  placeholder="رمز عبور بکاپ" 
                />
              </div>
            </div>

            <button 
              onClick={handleRestoreBackup} 
              disabled={actionLoading} 
              className="bg-emerald-600 text-white px-3 py-1.5 rounded-md hover:bg-emerald-700 transition flex items-center text-xs font-medium mr-auto"
            >
              <Upload className="w-3.5 h-3.5 ml-1.5" /> بازیابی و اعمال بکاپ
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
function ProductsView() {
  const [products, setProducts] = useState<any[]>([]);
  const [inbounds, setInbounds] = useState<any[]>([]);
  const [form, setForm] = useState({ name: '', price: 0, volumeGb: 10, durationDays: 30, inboundId: '', inboundIds: [] as number[], limitIp: 1 });

  useEffect(() => {
    fetch('/api/state')
      .then(r => r.json())
      .then(s => setProducts(s.products || []));
    
    // Fetch inbounds on load if available - don't log errors to main console
    fetch('/api/xui-inbounds')
      .then(r => r.json())
      .then(data => {
        if (data && data.success) {
          setInbounds(data.inbounds || []);
        }
      })
      .catch(() => {});
  }, []);

  const addProduct = async () => {
    const payload = {
      ...form,
      inboundId: form.inboundId ? parseInt(form.inboundId) : undefined,
      inboundIds: form.inboundIds
    };
    const res = await fetch('/api/products', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      setProducts(data.products);
      // Reset form
      setForm({ name: '', price: 10000, volumeGb: 10, durationDays: 30, inboundId: '', inboundIds: [], limitIp: 1 });
    }
  };

  const deleteProduct = async (id: string) => {
    if(!confirm('آیا از حذف این محصول مطمئن هستید؟')) return;
    await fetch(`/api/products/${id}`, { method: 'DELETE' });
    setProducts(products.filter(p => p.id !== id));
  };

  return (
    <div className="max-w-4xl mx-auto" dir="rtl">
       <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 mb-8">
         <h2 className="text-lg font-bold mb-4 flex items-center gap-2"><Plus className="w-5 h-5 text-indigo-600"/> تعریف پکیج و محصول جدید با اینباندهای انتخابی</h2>
         
         <div className="space-y-4">
           {/* Row 1 fields */}
           <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
             <div>
               <label className="block text-xs font-semibold text-slate-700 mb-1">نام محصول (پکیج)</label>
               <input type="text" value={form.name} onChange={e=>setForm({...form, name: e.target.value})} className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-indigo-500 text-sm" placeholder="مثال: ۱ ماهه ۵۰ گیگابایت"/>
             </div>
             <div>
               <label className="block text-xs font-semibold text-slate-700 mb-1">قیمت (تومان)</label>
               <input type="number" value={form.price} onChange={e=>setForm({...form, price: Number(e.target.value)})} className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-indigo-500 text-sm"/>
             </div>
             <div>
               <label className="block text-xs font-semibold text-slate-700 mb-1">حجم (GB)</label>
               <input type="number" value={form.volumeGb} onChange={e=>setForm({...form, volumeGb: Number(e.target.value)})} className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-indigo-500 text-sm"/>
             </div>
             <div>
               <label className="block text-xs font-semibold text-slate-700 mb-1">مدت (روز)</label>
               <input type="number" value={form.durationDays} onChange={e=>setForm({...form, durationDays: Number(e.target.value)})} className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-indigo-500 text-sm"/>
             </div>
             <div>
               <label className="block text-xs font-semibold text-slate-700 mb-1">IP Limit</label>
               <input type="number" value={form.limitIp} onChange={e=>setForm({...form, limitIp: Number(e.target.value)})} className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-indigo-500 text-sm"/>
             </div>
           </div>

           {/* Row 2: Multiple Inbound Checkboxes */}
           <div>
             <label className="block text-xs font-semibold text-slate-700 mb-1.5">اینباندهای منتخب این پکیج (مشتریان جدید به طور خودکار به صورت تقسیم لود بین اینباندهای علامت‌خورده ساخته خواهند شد):</label>
             {inbounds.length > 0 ? (
               <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 p-3 bg-slate-50 rounded-lg border max-h-40 overflow-y-auto">
                 {inbounds.map((ib: any) => {
                   const isChecked = form.inboundIds.includes(ib.id) || form.inboundId === String(ib.id);
                   return (
                     <label key={ib.id} className="flex items-center gap-2 text-xs text-slate-700 hover:text-indigo-600 cursor-pointer select-none">
                       <input 
                         type="checkbox" 
                         checked={isChecked}
                         onChange={e => {
                           let updatedIds = [...form.inboundIds];
                           if (form.inboundId && !updatedIds.includes(Number(form.inboundId))) {
                             updatedIds.push(Number(form.inboundId));
                           }
                           if (e.target.checked) {
                             if (!updatedIds.includes(ib.id)) updatedIds.push(ib.id);
                           } else {
                             updatedIds = updatedIds.filter(id => id !== ib.id);
                           }
                           setForm({
                             ...form,
                             inboundIds: updatedIds,
                             inboundId: updatedIds[0] ? String(updatedIds[0]) : ''
                           });
                         }}
                         className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                       />
                       <span className="font-medium text-slate-800">{ib.remark}</span>
                       <span className="text-[10px] text-slate-500 font-mono bg-slate-200 px-1 py-0.5 rounded">ID: {ib.id} ({ib.protocol})</span>
                     </label>
                   );
                 })}
               </div>
             ) : (
               <div className="flex gap-2">
                 <input 
                   type="text" 
                   value={form.inboundId} 
                   onChange={e=> {
                     const val = e.target.value;
                     const numeric = parseInt(val);
                     setForm({
                       ...form, 
                       inboundId: val, 
                       inboundIds: isNaN(numeric) ? [] : [numeric]
                     });
                   }} 
                   className="w-full px-3 py-2 border rounded-md text-xs font-mono" 
                   placeholder="آیدی عددی اینباند (مثلاً 2)"
                 />
                 <span className="text-[10px] text-amber-600 self-center">ابتدا مشخصات اتصال پنل سنایی را لود کنید تا لیست به صورت خودکار لود شود.</span>
               </div>
             )}
           </div>
         </div>

         <p className="text-xs text-slate-400 mt-3.5">💡 سیستم هوشمند موازنه بار: با انتخاب چند اینباند، ربات به طور خودکار به صورت چرخشی (Round-Robin رندم) کلاینت‌های جدید با پروتکل متناظر را روی این اینباندها تقسیم می‌کند تا لود روی سرورها یکنواخت گردد.</p>
         <div className="mt-4 text-left">
            <button onClick={addProduct} className="bg-indigo-600 text-white px-5 py-2 rounded-md hover:bg-indigo-700 font-semibold text-sm transition">ثبت و افزودن محصول</button>
         </div>
       </div>

       <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {products.map(p => (
            <div key={p.id} className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col hover:shadow-md transition">
               <h3 className="text-lg font-bold text-slate-900 mb-2">{p.name}</h3>
               <div className="text-2xl font-black text-indigo-600 mb-4">{p.price.toLocaleString()} <span className="text-sm font-normal text-slate-500">تومان</span></div>
               <div className="space-y-2 mb-6 flex-1 text-sm text-slate-700">
                 <div className="flex justify-between border-b pb-1"><span>میزان حجم:</span><span className="font-bold text-slate-800">{p.volumeGb === 0 ? 'نامحدود' : `${p.volumeGb} GB`}</span></div>
                 <div className="flex justify-between border-b pb-1"><span>مدت زمان:</span><span className="font-bold text-slate-800">{p.durationDays === 0 ? 'نامحدود' : `${p.durationDays} روز`}</span></div>
                 <div className="flex justify-between border-b pb-1"><span>محدودیت کاربر (IP):</span><span className="font-bold text-slate-800">{p.limitIp || 0}</span></div>
                 <div className="flex justify-between pb-1">
                   <span>اینباندهای پکیج:</span>
                   <span className="font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded text-[11px]">
                     {p.inboundIds && p.inboundIds.length > 0 
                       ? p.inboundIds.map((id: number) => `ID ${id}`).join(', ') 
                       : (p.inboundId ? `اینباند ${p.inboundId}` : 'پیشفرض عمومی')}
                   </span>
                 </div>
               </div>
               <button onClick={() => deleteProduct(p.id)} className="w-full py-2 flex items-center justify-center gap-2 text-red-600 bg-red-50 hover:bg-red-100 rounded-md transition font-medium text-sm">
                 <Trash2 className="w-4 h-4" /> <span>حذف محصول</span>
               </button>
            </div>
          ))}
          {products.length === 0 && (
            <div className="col-span-full bg-slate-100/50 text-slate-500 text-center p-12 rounded-xl border border-dashed">هنوز هیچ پکیجی ثبت nکرده‌اید. از بخش بالا پکیج جدید تعریف کنید.</div>
          )}
       </div>
    </div>
  );
}

function UsersView() {
  const [users, setUsers] = useState<any[]>([]);

  useEffect(() => {
    fetch('/api/state').then(r => r.json()).then(s => setUsers(s.users || []));
  }, []);

  const charge = async (chatId: number) => {
    const amount = prompt("Enter amount to add (Toman):", "10000");
    if (!amount) return;
    const res = await fetch(`/api/users/${chatId}/charge`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ amount: Number(amount) })
    });
    const data = await res.json();
    if(data.success) {
      setUsers(users.map(u => u.chatId === chatId ? {...u, balance: data.balance} : u));
    }
  };

  const toggleSeller = async (chatId: number, currentStatus: boolean) => {
    if(!confirm(`آیا از تغییر نقش این کاربر به ${currentStatus ? 'کاربر عادی' : 'فروشنده'} مطمئن هستید؟`)) return;
    const res = await fetch(`/api/users/${chatId}/role`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ isSeller: !currentStatus })
    });
    const data = await res.json();
    if(data.success) {
      setUsers(users.map(u => u.chatId === chatId ? {...u, isSeller: !currentStatus, debt: !currentStatus ? (u.debt || 0) : u.debt} : u));
    }
  };

  const settleDebt = async (chatId: number) => {
    if(!confirm('آیا از صفر کردن بدهی این فروشنده مطمئن هستید؟ (تسویه حساب)')) return;
    const res = await fetch(`/api/users/${chatId}/settle`, { method: 'POST' });
    const data = await res.json();
    if(data.success) {
      setUsers(users.map(u => u.chatId === chatId ? {...u, debt: 0} : u));
    }
  };

  return (
    <div className="max-w-5xl mx-auto" dir="rtl">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-right">
          <thead className="bg-slate-50 border-b">
            <tr>
              <th className="px-6 py-4 font-semibold text-slate-600">کاربر / آیدی</th>
              <th className="px-6 py-4 font-semibold text-slate-600">نقش</th>
              <th className="px-6 py-4 font-semibold text-slate-600">موجودی / بدهی</th>
              <th className="px-6 py-4 font-semibold text-slate-600">تاریخ ثبت نام</th>
              <th className="px-6 py-4 font-semibold text-slate-600 text-left">عملیات</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.chatId} className="border-b last:border-0 hover:bg-slate-50 transition">
                <td className="px-6 py-4">
                  <div className="font-medium text-slate-900" dir="ltr">{u.username ? `@${u.username}` : 'No Username'}</div>
                  <div className="text-sm text-slate-500 font-mono" dir="ltr">{u.chatId}</div>
                </td>
                <td className="px-6 py-4">
                  {u.isSeller ? (
                    <div>
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-700 mb-1">فروشنده</span>
                    </div>
                  ) : (
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600">کاربر عادی</span>
                  )}
                </td>
                <td className="px-6 py-4">
                  {u.isSeller ? (
                     <div>
                       <div className="text-sm font-bold text-red-600">بدهی: {(u.debt || 0).toLocaleString()} ت</div>
                       <div className="text-xs text-slate-500 mt-1">فروش: {(u.totalSales || 0).toLocaleString()} ت</div>
                     </div>
                  ) : (
                     <div className="font-mono text-emerald-600 font-semibold text-sm">{(u.balance || 0).toLocaleString()} ت</div>
                  )}
                </td>
                <td className="px-6 py-4 text-sm text-slate-500">{new Date(u.registeredAt).toLocaleDateString('fa-IR')}</td>
                <td className="px-6 py-4 text-left flex items-center justify-end gap-2">
                  <button onClick={() => toggleSeller(u.chatId, !!u.isSeller)} className="px-3 py-1.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-md font-medium text-xs transition">
                    تغییر نقش
                  </button>
                  {u.isSeller ? (
                     <button onClick={() => settleDebt(u.chatId)} className="px-3 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-md font-medium text-xs transition">
                       تسویه حساب
                     </button>
                  ) : (
                     <button onClick={() => charge(u.chatId)} className="inline-flex items-center px-3 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-md font-medium text-xs transition">
                       <BatteryCharging className="w-4 h-4 ml-1" /> شارژ موجودی
                     </button>
                  )}
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-500">هنوز کاربری ثبت نشده است.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
