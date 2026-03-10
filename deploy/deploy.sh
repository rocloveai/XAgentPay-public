#!/bin/bash
set -e

# ═══════════════════════════════════════════
# XAgentPay 一键部署脚本
# 服务器: Ubuntu 22.04/24.04
# 域名: xagenpay.com
# ═══════════════════════════════════════════

DOMAIN="xagenpay.com"
APP_DIR="/opt/xagenpay"
REPO="https://github.com/rocloveai/XAgentPay.git"

echo "========================================="
echo "  XAgentPay 一键部署"
echo "  域名: $DOMAIN"
echo "========================================="

# ── Step 1: 系统更新 + 安装依赖 ──
echo ""
echo "[1/7] 安装系统依赖..."
apt update -qq
apt install -y -qq docker.io docker-compose-plugin nginx certbot python3-certbot-nginx git ufw

# 启动 Docker
systemctl enable docker
systemctl start docker

# ── Step 2: 防火墙 ──
echo ""
echo "[2/7] 配置防火墙..."
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# ── Step 3: 拉取代码 ──
echo ""
echo "[3/7] 拉取代码..."
if [ -d "$APP_DIR" ]; then
  cd "$APP_DIR" && git pull origin main
else
  git clone "$REPO" "$APP_DIR"
fi
cd "$APP_DIR"

# ── Step 4: 配置环境变量 ──
echo ""
echo "[4/7] 配置环境变量..."
if [ ! -f deploy/.env ]; then
  cp deploy/.env.example deploy/.env
  echo ""
  echo "⚠️  请编辑 deploy/.env 填入密钥:"
  echo "    nano $APP_DIR/deploy/.env"
  echo ""
  echo "填好后重新运行此脚本"
  exit 1
fi

# ── Step 5: 构建前端 ──
echo ""
echo "[5/7] 构建前端..."
# 用 Docker 构建前端避免在服务器安装 Node
docker run --rm -v "$APP_DIR/src/nexus-website:/app" -w /app node:20-slim \
  sh -c "npm install && npx vite build"

# 部署静态文件
rm -rf /var/www/xagenpay
mkdir -p /var/www/xagenpay
cp -r src/nexus-website/dist/* /var/www/xagenpay/

# ── Step 6: 启动后端服务 ──
echo ""
echo "[6/7] 启动 Docker 服务..."
cd "$APP_DIR/deploy"
docker compose down 2>/dev/null || true
docker compose up -d --build

echo ""
echo "等待服务启动..."
sleep 10

# 检查服务状态
docker compose ps

# ── Step 7: 配置 Nginx + SSL ──
echo ""
echo "[7/7] 配置 Nginx + SSL..."

# 复制 Nginx 配置
cp "$APP_DIR/deploy/nginx.conf" /etc/nginx/sites-available/xagenpay.com

# 启用站点
ln -sf /etc/nginx/sites-available/xagenpay.com /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# 先用 HTTP 启动（SSL 还没申请）
# 临时去掉 SSL 配置，先让 certbot 验证域名
cat > /etc/nginx/sites-available/xagenpay-temp.conf << 'TMPNGINX'
server {
    listen 80;
    server_name xagenpay.com www.xagenpay.com;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    root /var/www/xagenpay;
    index index.html;
    location / {
        try_files $uri $uri/ /index.html;
    }
}
TMPNGINX

ln -sf /etc/nginx/sites-available/xagenpay-temp.conf /etc/nginx/sites-enabled/xagenpay.com
mkdir -p /var/www/certbot

nginx -t && systemctl reload nginx

# 申请 SSL 证书
echo ""
echo "正在申请 SSL 证书..."
certbot --nginx -d xagenpay.com -d www.xagenpay.com --non-interactive --agree-tos --email admin@xagenpay.com --redirect

# 恢复完整 Nginx 配置
ln -sf /etc/nginx/sites-available/xagenpay.com /etc/nginx/sites-enabled/xagenpay.com
nginx -t && systemctl reload nginx

# 设置证书自动续期
echo "0 3 * * * certbot renew --quiet && systemctl reload nginx" | crontab -

echo ""
echo "========================================="
echo "  ✅ 部署完成！"
echo "========================================="
echo ""
echo "  🌐 网站:  https://xagenpay.com"
echo "  📡 API:   https://xagenpay.com/api"
echo "  ✈️  Flight: https://xagenpay.com/flight"
echo "  🏨 Hotel:  https://xagenpay.com/hotel"
echo ""
echo "  管理命令:"
echo "    查看日志:  cd $APP_DIR/deploy && docker compose logs -f"
echo "    重启服务:  cd $APP_DIR/deploy && docker compose restart"
echo "    更新代码:  cd $APP_DIR && git pull && cd deploy && docker compose up -d --build"
echo "========================================="
