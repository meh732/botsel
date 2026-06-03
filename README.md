# Sanaei Telegram Bot & Admin Panel

A comprehensive solution to automate X-UI (Sanaei) VPN account distribution via Telegram Bot, featuring an integrated React web dashboard, dynamic X-UI connecting, and multiple admin options.

## Features
- Fully automated Telegram Bot for purchasing and test account creation
- Integrated X-UI (Sanaei panel) client manager via APIs
- User referral and reward system
- Backup and restore directly from Telegram bot (`db.json` file)
- Modern, professional UI web dashboard

## 🚀 Installation on VPS (Linux Ubuntu/Debian)

Use the automated one-line setup command on your fresh Linux VPS:
```bash
wget -O install.sh https://raw.githubusercontent.com/YOUR_GITHUB_USERNAME/YOUR_REPO_NAME/main/install.sh && sudo bash install.sh
```

*(If you haven't uploaded this to GitHub yet, clone the repo manually, then run `sudo bash install.sh` inside the folder).*

## 🌐 Installation on Shared Linux Hosting (cPanel/DirectAdmin)

If you strictly want to host this on cPanel (Shared Hosting):

1. Login to cPanel and open **"Setup Node.js App"**.
2. Click **"Create Application"**.
3. Set **Node.js version** to `20.x` or latest.
4. Set **Application mode** to `Production`.
5. Specify the Application root (e.g., `sanaei-bot`) and URL.
6. **Upload your code:** Archive all files (except `node_modules` and `.git`), upload to the `sanaei-bot` folder via File Manager, and extract.
7. Note: Shared hosting environments often prevent apps from binding to arbitrary ports using Express, they use Passenger to proxy. Open `server.ts` or `dist/server.cjs` and ensure your app binds to the provided `process.env.PORT` instead of hardcoding `3000`. So make sure you run `npm run build` on your PC first, or run it through cPanel Terminal! 
8. Open cPanel Terminal, go to the folder and run `npm install` and then `npm run build`.
9. Go back to "Setup Node.js App" and set **Application startup file** to `dist/server.cjs` (you may need to create a simple `app.js` that `require('./dist/server.cjs')` if Passenger complains). 
10. Click **Start App**.

*Note: VPS is generally recommended for background bots like node-telegram-bot-api polling.*

## Admin Access
Once started, the first user to `/start` the Telegram bot will become the **Admin**. They can use `/admin` inside Telegram to get backups and configure panel settings. Web panel is accessible at Server IP port 3000.
