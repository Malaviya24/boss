#!/bin/bash
# MATKAKING VPS Deployment Script for Ubuntu 24.04 LTS
# Run as root: bash deploy-vps.sh

set -e

echo "========================================="
echo "  MATKAKING VPS Deployment - Ubuntu 24.04"
echo "========================================="

# Step 1: Update system
echo "[1/8] Updating system..."
apt update && apt upgrade -y

# Step 2: Install Node.js 20 LTS
echo "[2/8] Installing Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Step 3: Install Nginx, Git, Certbot
echo "[3/8] Installing Nginx, Git, Certbot..."
apt install -y nginx git certbot python3-certbot-nginx

# Step 4: Install PM2
echo "[4/8] Installing PM2..."
npm install -g pm2

# Step 5: Clone project
echo "[5/8] Cloning project..."
mkdir -p /var/www
cd /var/www
if [ -d "dpboss" ]; then
  echo "Project already exists, pulling latest..."
  cd dpboss
  git pull origin main
else
  git clone https://github.com/Malaviya24/boss.git dpboss
  cd dpboss
fi

# Step 6: Install dependencies and build
echo "[6/8] Installing dependencies and building..."
npm install
cd client
npm install
npm run build
cd ..

# Step 7: Build content
echo "[7/8] Building content..."
npm run content:extract || echo "Content extract skipped (may need .env first)"

# Step 8: Setup Nginx
echo "[8/8] Configuring Nginx..."
cat > /etc/nginx/sites-available/dpboss << 'NGINX'
server {
    listen 80;
    server_name _;

    # Gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml;
    gzip_min_length 256;

    # Frontend (built client)
    location / {
        root /var/www/dpboss/client/dist;
        try_files $uri $uri/ /index.html;
        expires 1h;
        add_header Cache-Control "public, no-transform";
    }

    # Static assets - long cache
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf)$ {
        root /var/www/dpboss/client/dist;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # Backend API
    location /api/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
        proxy_send_timeout 60s;
    }

    # Socket.IO
    location /socket.io/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 86400s;
    }
}
NGINX

ln -sf /etc/nginx/sites-available/dpboss /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl restart nginx
systemctl enable nginx

echo ""
echo "========================================="
echo "  DEPLOYMENT COMPLETE!"
echo "========================================="
echo ""
echo "Next steps:"
echo "1. Create .env file:  nano /var/www/dpboss/.env"
echo "2. Start app:         cd /var/www/dpboss && pm2 start ecosystem.config.cjs"
echo "3. Save PM2:          pm2 save && pm2 startup"
echo "4. Test:              Open http://YOUR_IP in browser"
echo ""
echo "For SSL (after domain is pointed):"
echo "   certbot --nginx -d yourdomain.com -d www.yourdomain.com"
echo ""
