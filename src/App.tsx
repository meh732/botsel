import { useState, useEffect } from 'react';
import { Save, RefreshCw, Send, Plus, Trash2, BatteryCharging, Settings2, Users as UsersIcon, Box } from 'lucide-react';

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

  useEffect(() => {
    fetch('/api/state').then(r => r.json()).then(setState);
  }, []);

  if (!state) return <div className="text-center p-8">Loading...</div>;

  const saveGeneral = async () => {
    setSaving(true);
    await fetch('/api/update-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        botToken: state.botToken,
        freeTestVolumeGb: Number(state.freeTestVolumeGb),
        freeTestDurationDays: Number(state.freeTestDurationDays),
        referralRewardToman: Number(state.referralRewardToman) || 0,
      })
    });
    setSaving(false);
    alert('General settings saved. Bot restarted if token changed.');
  };

  const savePanel = async () => {
    setSaving(true);
    await fetch('/api/update-panel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state.panel)
    });
    setSaving(false);
    alert('Panel settings saved.');
  };

  const loadInbounds = async () => {
    try {
      const res = await fetch('/api/xui-inbounds');
      const data = await res.json();
      if (data.success) {
        setInbounds(data.inbounds);
      } else {
        alert('Failed: ' + data.message);
      }
    } catch(e: any) {
      alert('Error connecting to panel. Check credentials.');
    }
  };

  return (
    <div className="space-y-8 max-w-2xl mx-auto">
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <h2 className="text-lg font-bold mb-4 flex items-center"><Send className="w-5 h-5 mr-2 text-indigo-600"/> General & Telegram Bot</h2>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Telegram Bot Token (From @BotFather)</label>
            <input type="password" value={state.botToken} onChange={e => setState({...state, botToken: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500 font-mono text-sm" placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Free Test Volume (GB)</label>
              <input type="number" value={state.freeTestVolumeGb} onChange={e => setState({...state, freeTestVolumeGb: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Free Test Duration (Days)</label>
              <input type="number" value={state.freeTestDurationDays} onChange={e => setState({...state, freeTestDurationDays: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Referral Reward (Toman)</label>
              <input type="number" value={state.referralRewardToman || 0} onChange={e => setState({...state, referralRewardToman: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500" />
            </div>
          </div>

          <button onClick={saveGeneral} disabled={saving} className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 transition flex items-center ml-auto">
            <Save className="w-4 h-4 mr-2" /> Save & Restart Bot
          </button>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <h2 className="text-lg font-bold mb-4 flex items-center"><RefreshCw className="w-5 h-5 mr-2 text-emerald-600"/> Sanaei X-UI Panel</h2>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Panel URL</label>
            <input type="text" value={state.panel.url || ''} onChange={e => setState({...state, panel: {...state.panel, url: e.target.value}})} className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500" placeholder="http://1.2.3.4:2053" />
          </div>
          <div className="grid grid-cols-2 gap-4">
             <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Username</label>
              <input type="text" value={state.panel.username || ''} onChange={e => setState({...state, panel: {...state.panel, username: e.target.value}})} className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
              <input type="password" value={state.panel.password || ''} onChange={e => setState({...state, panel: {...state.panel, password: e.target.value}})} className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500" />
            </div>
          </div>

          <div className="flex items-end space-x-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-slate-700 mb-1">Target Inbound ID (For adding clients)</label>
              <input type="number" value={state.panel.inboundId || ''} onChange={e => setState({...state, panel: {...state.panel, inboundId: e.target.value}})} className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500" placeholder="e.g. 1" />
            </div>
            <button onClick={loadInbounds} className="bg-slate-200 text-slate-800 px-4 py-2 rounded-md hover:bg-slate-300 transition">Fetch Inbounds</button>
          </div>

          {inbounds.length > 0 && (
            <div className="mt-4 border rounded-md overflow-hidden bg-slate-50">
               <table className="w-full text-sm text-left">
                  <thead className="bg-slate-100 text-slate-600 border-b">
                    <tr><th className="px-4 py-2 font-medium">ID</th><th className="px-4 py-2 font-medium">Remark</th><th className="px-4 py-2 font-medium">Port</th><th className="px-4 py-2 font-medium">Protocol</th></tr>
                  </thead>
                  <tbody>
                    {inbounds.map((ib: any) => (
                      <tr key={ib.id} className="border-b last:border-0 hover:bg-white cursor-pointer" onClick={() => setState({...state, panel: {...state.panel, inboundId: ib.id}})}>
                        <td className="px-4 py-2 font-mono">{ib.id}</td>
                        <td className="px-4 py-2">{ib.remark}</td>
                        <td className="px-4 py-2">{ib.port}</td>
                        <td className="px-4 py-2">{ib.protocol}</td>
                      </tr>
                    ))}
                  </tbody>
               </table>
            </div>
          )}

          <button onClick={savePanel} disabled={saving} className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 transition flex items-center ml-auto">
            <Save className="w-4 h-4 mr-2" /> Save Panel Details
          </button>
        </div>
      </div>
    </div>
  );
}

function ProductsView() {
  const [products, setProducts] = useState<any[]>([]);
  
  const [form, setForm] = useState({ name: '', price: 0, volumeGb: 10, durationDays: 30 });

  useEffect(() => {
    fetch('/api/state').then(r => r.json()).then(s => setProducts(s.products));
  }, []);

  const addProduct = async () => {
    const res = await fetch('/api/products', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(form)
    });
    const data = await res.json();
    if(data.success) setProducts(data.products);
  };

  const deleteProduct = async (id: string) => {
    await fetch(`/api/products/${id}`, { method: 'DELETE' });
    setProducts(products.filter(p => p.id !== id));
  };

  return (
    <div className="max-w-4xl mx-auto">
       <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 mb-8">
         <h2 className="text-lg font-bold mb-4 flex items-center"><Plus className="w-5 h-5 mr-2 text-indigo-600"/> Add New Product</h2>
         <div className="grid grid-cols-4 gap-4 items-end">
            <div><label className="block text-xs font-medium text-slate-500 mb-1">Name</label><input type="text" value={form.name} onChange={e=>setForm({...form, name: e.target.value})} className="w-full px-3 py-2 border rounded-md" placeholder="e.g. 1 Month 50GB"/></div>
            <div><label className="block text-xs font-medium text-slate-500 mb-1">Price (Toman)</label><input type="number" value={form.price} onChange={e=>setForm({...form, price: Number(e.target.value)})} className="w-full px-3 py-2 border rounded-md"/></div>
            <div><label className="block text-xs font-medium text-slate-500 mb-1">Volume (GB)</label><input type="number" value={form.volumeGb} onChange={e=>setForm({...form, volumeGb: Number(e.target.value)})} className="w-full px-3 py-2 border rounded-md"/></div>
            <div><label className="block text-xs font-medium text-slate-500 mb-1">Duration (Days)</label><input type="number" value={form.durationDays} onChange={e=>setForm({...form, durationDays: Number(e.target.value)})} className="w-full px-3 py-2 border rounded-md"/></div>
         </div>
         <div className="mt-4 text-right">
            <button onClick={addProduct} className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700">Add Product</button>
         </div>
       </div>

       <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {products.map(p => (
            <div key={p.id} className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col">
               <h3 className="text-lg font-bold text-slate-900 mb-2">{p.name}</h3>
               <div className="text-3xl font-black text-indigo-600 mb-4">{p.price.toLocaleString()} <span className="text-base font-normal text-slate-500">Toman</span></div>
               <div className="space-y-2 mb-6 flex-1">
                 <div className="flex justify-between text-sm"><span className="text-slate-500">Volume</span><span className="font-semibold text-slate-800">{p.volumeGb === 0 ? 'Unlimited' : `${p.volumeGb} GB`}</span></div>
                 <div className="flex justify-between text-sm"><span className="text-slate-500">Duration</span><span className="font-semibold text-slate-800">{p.durationDays === 0 ? 'Unlimited' : `${p.durationDays} Days`}</span></div>
               </div>
               <button onClick={() => deleteProduct(p.id)} className="w-full py-2 flex items-center justify-center space-x-2 text-red-600 bg-red-50 hover:bg-red-100 rounded-md transition font-medium">
                 <Trash2 className="w-4 h-4" /> <span>Delete</span>
               </button>
            </div>
          ))}
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

  return (
    <div className="max-w-5xl mx-auto">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-50 border-b">
            <tr>
              <th className="px-6 py-4 font-semibold text-slate-600">User / Chat ID</th>
              <th className="px-6 py-4 font-semibold text-slate-600">Balance</th>
              <th className="px-6 py-4 font-semibold text-slate-600">Free Test</th>
              <th className="px-6 py-4 font-semibold text-slate-600">Registered</th>
              <th className="px-6 py-4 font-semibold text-slate-600 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.chatId} className="border-b last:border-0 hover:bg-slate-50 transition">
                <td className="px-6 py-4">
                  <div className="font-medium text-slate-900">{u.username ? `@${u.username}` : 'No Username'}</div>
                  <div className="text-sm text-slate-500 font-mono">{u.chatId}</div>
                </td>
                <td className="px-6 py-4 font-mono text-emerald-600 font-semibold">{u.balance.toLocaleString()} T</td>
                <td className="px-6 py-4">
                  {u.testUsed ? (
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600">Used</span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700">Available</span>
                  )}
                </td>
                <td className="px-6 py-4 text-sm text-slate-500">{new Date(u.registeredAt).toLocaleDateString()}</td>
                <td className="px-6 py-4 text-right">
                  <button onClick={() => charge(u.chatId)} className="inline-flex items-center px-3 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-md font-medium text-sm transition">
                    <BatteryCharging className="w-4 h-4 mr-1" /> Charge
                  </button>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-500">No users have started the bot yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
