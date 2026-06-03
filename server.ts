import express from "express";
import path from "path";
import cors from "cors";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import { createServer as createViteServer } from "vite";
import { db } from "./server/db.js";
import { initBot } from "./server/bot.js";
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
    const { botToken, freeTestVolumeGb, freeTestDurationDays, referralRewardToman, adminIds } = req.body;
    
    const updates: any = { 
      botToken, 
      freeTestVolumeGb, 
      freeTestDurationDays, 
      referralRewardToman 
    };

    if (adminIds !== undefined) {
      updates.adminIds = Array.isArray(adminIds)
        ? adminIds.map((id: any) => parseInt(id)).filter((id: number) => !isNaN(id))
        : [];
    }

    const oldToken = db.getState().botToken;
    db.updateState(updates);
    
    // Start or restart bot if token is present
    if (botToken) {
      console.log('[Bot] Triggering initBot from settings update endpoint.');
      initBot();
    }
    res.json({ success: true });
  });

  api.post("/update-panel", async (req, res) => {
    const { url, username, password, inboundId } = req.body;
    const currentState = db.getState();
    
    const newPanel = { ...currentState.panel };
    if (url !== undefined) newPanel.url = url;
    if (username !== undefined) newPanel.username = username;
    if (password && password !== '********') newPanel.password = password;
    if (inboundId !== undefined) newPanel.inboundId = parseInt(inboundId) || undefined;

    db.updateState({ panel: newPanel });
    res.json({ success: true });
  });

  api.get("/xui-inbounds", async (req, res) => {
    try {
      const inbounds = await xui.getInbounds();
      res.json({ success: true, inbounds });
    } catch (e: any) {
      res.status(500).json({ success: false, message: e.message });
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
