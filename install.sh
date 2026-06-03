#!/bin/bash
echo "============================================="
echo "   Sanaei Telegram Bot - Auto Installer      "
echo "============================================="

# Check to see if running as root
if [ "$EUID" -ne 0 ]; then
  echo "Please run as root (use sudo bash install.sh)"
  exit 1
fi

echo ">> Installing Node.js..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs git

echo ">> Please enter your GitHub Repository URL (or press enter if already in the repo directory):"
read GIT_URL

if [ ! -z "$GIT_URL" ]; then
   git clone "$GIT_URL" sanaei-bot
   cd sanaei-bot
fi

echo ">> Installing dependencies..."
npm install

echo ">> Building application..."
npm run build

echo ">> Installing PM2 for process management..."
npm install -g pm2

echo ">> Starting Bot and Admin Panel Server..."
pm2 start npm --name "sanaei-bot" -- run start
pm2 save
pm2 startup

echo "============================================="
echo " Installation Complete! "
echo " You can access the Web Admin Panel at: http://YOUR_SERVER_IP:3000"
echo " (Make sure port 3000 is open in your firewall)"
echo " To view logs: pm2 logs sanaei-bot"
echo "============================================="
