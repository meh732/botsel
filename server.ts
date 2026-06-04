import express from "express";
import path from "path";
import cors from "cors";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import { createServer as createViteServer } from "vite";
import { db } from "./server/db.js";
import { initBot, sendBroadcast } from "./server/bot.js";
import { xui } from "./server/xui.js";
import { encryptData, decryptData } from "./server/crypto.js";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  // Init Telegram Bot
  initBot();

  // ----- Admin API ----- //
  const api = express.Router();

  api.get("/state", (req, res) => {
    const state = db.getState();
    // Hide password in UI
    const safeState = {
      ...state,
      panel: {
        ...state.panel,
        password: state.panel.password ? '********' : ''
      }
    };
    res.json(safeState);
  });

  api.post("/update-settings", (req, res) => {
    const { 
      botToken, 
      freeTestVolumeGb, 
      freeTestDurationDays, 
      freeTestEnabled, 
      freeTestInboundId, 
      freeTestInboundIds,
      referralRewardToman, 
      adminIds, 
      cardNumber, 
      cardHolder, 
      supportUsername, 
      coupons 
    } = req.body;
    
    const updates: any = { 
      botToken, 
      freeTestVolumeGb: Number(freeTestVolumeGb) || 0, 
      freeTestDurationDays: Number(freeTestDurationDays) || 0,
      freeTestEnabled: freeTestEnabled !== undefined ? Boolean(freeTestEnabled) : true,
      referralRewardToman: Number(referralRewardToman) || 0 
    };

    if (cardNumber !== undefined) updates.cardNumber = cardNumber;
    if (cardHolder !== undefined) updates.cardHolder = cardHolder;
    if (supportUsername !== undefined) updates.supportUsername = supportUsername;
    if (coupons !== undefined) updates.coupons = coupons;
    if (freeTestInboundId !== undefined) {
      updates.freeTestInboundId = freeTestInboundId ? parseInt(freeTestInboundId) : undefined;
    }
    if (freeTestInboundIds !== undefined) {
      updates.freeTestInboundIds = Array.isArray(freeTestInboundIds)
        ? freeTestInboundIds.map((id: any) => parseInt(id)).filter((id: number) => !isNaN(id))
        : [];
    }

    if (adminIds !== undefined) {
      updates.adminIds = Array.isArray(adminIds)
        ? adminIds.map((id: any) => parseInt(id)).filter((id: number) => !isNaN(id))
        : [];
    }

    db.updateState(updates);
    
    // Start or restart bot if token is present
    if (botToken) {
      console.log('[Bot] Triggering initBot from settings update endpoint.');
      initBot();
    }
    res.json({ success: true });
  });

  api.post("/update-panel", async (req, res) => {
    const { url, username, password, inboundId, inboundIds, apiKey } = req.body;
    const currentState = db.getState();
    
    const newPanel = { ...currentState.panel };
    if (url !== undefined) newPanel.url = url;
    if (username !== undefined) newPanel.username = username;
    if (password && password !== '********') newPanel.password = password;
    if (inboundId !== undefined) newPanel.inboundId = parseInt(inboundId) || undefined;
    if (inboundIds !== undefined) {
      newPanel.inboundIds = Array.isArray(inboundIds)
        ? inboundIds.map((id: any) => parseInt(id)).filter((id: number) => !isNaN(id))
        : [];
    }
    if (apiKey !== undefined) newPanel.apiKey = apiKey;

    db.updateState({ panel: newPanel });
    res.json({ success: true });
  });

  api.post("/broadcast", async (req, res) => {
    const { message } = req.body;
    if (!message) {
      return res.status(400).json({ success: false, message: 'متن پیام الزامی است.' });
    }
    try {
      const stats = await sendBroadcast(message);
      res.json({ success: true, ...stats });
    } catch (e: any) {
      res.status(500).json({ success: false, message: e.message || 'خطا در ارسال پیام همگانی.' });
    }
  });

  api.get("/xui-inbounds", async (req, res) => {
    try {
      const inbounds = await xui.getInbounds();
      // If it returns empty, it's either empty or failed (but handled gracefully now)
      res.json({ success: true, inbounds: inbounds || [] });
    } catch (e: any) {
      // Still good to have a backup catch although xui.getInbounds now suppresses most errors
      res.json({ success: false, message: e.message, inbounds: [] });
    }
  });

  api.post("/test-panel-connection", async (req, res) => {
    try {
      const { url, username, password, apiKey } = req.body;
      let result;
      
      if (url) {
        // Create a temporary state for testing
        const tempXui = new (xui.constructor as any)();
        // Manually patch state for this test if possible, or just update the DB temporarily
        // But cleaner is to pass the credentials to testConnection
        console.log(`[X-UI Test] Running test with provided credentials for url: ${url}`);
        
        // Let's modify xui.testConnection to take optional params
        result = await (xui as any).testConnection({ url, username, password, apiKey });
      } else {
        result = await xui.testConnection();
      }
      res.json(result);
    } catch (e: any) {
       res.json({ success: false, message: e.message });
    }
  });

  api.post("/backup", (req, res) => {
    try {
      const { password } = req.body;
      if (!password) {
        return res.status(400).json({ success: false, message: 'رمز عبور برای رمزگذاری فایل بکاپ الزامی است.' });
      }
      
      const dbPath = path.join(process.cwd(), 'db.json');
      if (!fs.existsSync(dbPath)) {
        return res.status(404).json({ success: false, message: 'فایل دیتابیس یافت نشد.' });
      }
      
      const rawData = fs.readFileSync(dbPath, 'utf8');
      const encryptedPayload = encryptData(rawData, password);
      
      res.json({ success: true, payload: encryptedPayload });
    } catch (e: any) {
      res.status(500).json({ success: false, message: e.message || 'خطا در ایجاد بکاپ.' });
    }
  });

  api.post("/restore", (req, res) => {
    try {
      const { payload, password } = req.body;
      if (!payload || !password) {
        return res.status(400).json({ success: false, message: 'مقادیر بکاپ و رمز عبور الزامی می‌باشند.' });
      }
      
      const decryptedData = decryptData(payload, password);
      const parsed = JSON.parse(decryptedData);
      
      if (!parsed.users || !parsed.panel) {
        return res.status(400).json({ success: false, message: 'فایل پشتیبان معتبر نیست. بخش‌های حیاتی خالی هستند.' });
      }
      
      // Write to db.json and update memory state
      const dbPath = path.join(process.cwd(), 'db.json');
      fs.writeFileSync(dbPath, JSON.stringify(parsed, null, 2), 'utf8');
      db.updateState(parsed);
      
      // Re-initialize the Telegram bot
      initBot();
      
      res.json({ success: true, message: 'موفقیت‌آمیز: کل دیتابیس و تنظیمات با موفقیت بازیابی شد.' });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message || 'خطا در رمزگشایی یا بازیابی دیتابیس.' });
    }
  });

  api.post("/products", (req, res) => {
    const product = req.body;
    if (!product.id) {
      product.id = uuidv4();
    }

    if (product.inboundId !== undefined) {
      product.inboundId = product.inboundId ? parseInt(product.inboundId) : undefined;
    }

    if (product.limitIp !== undefined) {
      product.limitIp = parseInt(product.limitIp) || 0;
    }

    if (product.inboundIds !== undefined) {
      product.inboundIds = Array.isArray(product.inboundIds)
        ? product.inboundIds.map((id: any) => parseInt(id)).filter((id: number) => !isNaN(id))
        : [];
    }

    const state = db.getState();
    const existingIndex = state.products.findIndex(p => p.id === product.id);
    const newProducts = [...state.products];
    if (existingIndex >= 0) {
      newProducts[existingIndex] = product;
    } else {
      newProducts.push(product);
    }
    db.updateState({ products: newProducts });
    res.json({ success: true, products: newProducts });
  });

  api.delete("/products/:id", (req, res) => {
    const state = db.getState();
    const newProducts = state.products.filter(p => p.id !== req.params.id);
    db.updateState({ products: newProducts });
    res.json({ success: true });
  });

  api.post("/users/:chatId/charge", (req, res) => {
    const { amount } = req.body;
    const user = db.getUser(parseInt(req.params.chatId));
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    user.balance += parseInt(amount);
    db.saveUser(user);
    res.json({ success: true, balance: user.balance });
  });

  api.post("/users/:chatId/role", (req, res) => {
    const { isSeller } = req.body;
    const user = db.getUser(parseInt(req.params.chatId));
    if (!user) return res.status(404).json({ success: false });
    user.isSeller = isSeller;
    if (isSeller && user.debt === undefined) {
      user.debt = 0;
      user.totalSales = 0;
    }
    db.saveUser(user);
    res.json({ success: true });
  });

  api.post("/users/:chatId/settle", (req, res) => {
    const user = db.getUser(parseInt(req.params.chatId));
    if (!user) return res.status(404).json({ success: false });
    user.debt = 0;
    db.saveUser(user);
    res.json({ success: true, debt: user.debt });
  });

  app.use("/api", api);

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
