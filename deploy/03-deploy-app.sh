#!/bin/bash
# TOHOSHOU AI — 应用部署脚本（已传输文件后运行）
set -e

APP_DIR=/opt/tohoshou
DOMAIN=aitohoshou.com

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " TOHOSHOU AI 应用部署"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
cd $APP_DIR

# ── 1. 读取 PG 密码 ───────────────────────────────────────────────────────────
PG_PASS=$(grep GENERATED_PG_PASS /root/.tohoshou_pg_pass | cut -d= -f2)
echo "[1/7] PG密码: 已读取"

# ── 2. 写入 .env ──────────────────────────────────────────────────────────────
echo "[2/7] 写入 .env..."
cat > $APP_DIR/.env << ENVEOF
DATABASE_URL="postgresql://tohoshou:${PG_PASS}@localhost:5432/llm_stock"
JQUANTS_API_KEY=${JQUANTS_API_KEY:-请填写}
NEXT_PUBLIC_APP_URL=https://${DOMAIN}

# LINE Bot（TOHOSHOU AI）
LINE_CHANNEL_ID=${LINE_CHANNEL_ID:-请填写}
LINE_CHANNEL_SECRET=${LINE_CHANNEL_SECRET:-请填写}
LINE_CHANNEL_ACCESS_TOKEN=${LINE_CHANNEL_ACCESS_TOKEN:-请填写}

# LINE 聊天权限
LINE_OWNER_USER_ID=${LINE_OWNER_USER_ID:-}

# AI API（DeepSeek 或 OpenAI）
DEEPSEEK_API_KEY=${DEEPSEEK_API_KEY:-}
OPENAI_API_KEY=${OPENAI_API_KEY:-}
OPENAI_BASE_URL=https://api.deepseek.com
AI_MODEL=deepseek-chat
ENVEOF
echo "✅ .env 写入完成"

# ── 3. 安装依赖 ───────────────────────────────────────────────────────────────
echo "[3/7] 安装 npm 依赖..."
npm ci --omit=dev --silent
echo "✅ 依赖安装完成"

# ── 4. Prisma ─────────────────────────────────────────────────────────────────
echo "[4/7] Prisma 初始化..."
npx prisma generate
npx prisma migrate deploy
echo "✅ 数据库迁移完成"

# ── 5. Next.js Build ──────────────────────────────────────────────────────────
echo "[5/7] 构建 Next.js..."
npm run build
echo "✅ 构建完成"

# ── 6. Nginx 配置 ─────────────────────────────────────────────────────────────
echo "[6/7] 配置 Nginx..."
cp $APP_DIR/deploy/02-nginx.conf /etc/nginx/sites-available/tohoshou
ln -sf /etc/nginx/sites-available/tohoshou /etc/nginx/sites-enabled/tohoshou
rm -f /etc/nginx/sites-enabled/default

# 临时 HTTP-only 配置用于 certbot 验证
cat > /etc/nginx/sites-available/tohoshou-temp << 'NGINXEOF'
server {
    listen 80;
    server_name aitohoshou.com www.aitohoshou.com;
    location / { return 200 'ok'; add_header Content-Type text/plain; }
}
NGINXEOF
ln -sf /etc/nginx/sites-available/tohoshou-temp /etc/nginx/sites-enabled/tohoshou
nginx -t && systemctl reload nginx

# 申请 SSL
echo "申请 Let's Encrypt SSL 证书..."
certbot --nginx -d ${DOMAIN} -d www.${DOMAIN} \
  --non-interactive --agree-tos --email admin@${DOMAIN} \
  --redirect

# 切换到完整配置
ln -sf /etc/nginx/sites-available/tohoshou /etc/nginx/sites-enabled/tohoshou
nginx -t && systemctl reload nginx
echo "✅ Nginx + SSL 配置完成"

# ── 7. PM2 ───────────────────────────────────────────────────────────────────
echo "[7/7] 启动 PM2..."
pm2 delete all 2>/dev/null || true
pm2 start $APP_DIR/ecosystem.config.js
pm2 save

# 开机自启
PM2_STARTUP=$(pm2 startup systemd -u root --hp /root 2>&1 | tail -1)
eval "$PM2_STARTUP" 2>/dev/null || true

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " ✅ TOHOSHOU AI 部署完成！"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo " 🌐 网站地址："
echo "    https://${DOMAIN}"
echo ""
echo " 🤖 LINE Webhook："
echo "    https://${DOMAIN}/api/line/webhook"
echo ""
echo " 📊 PM2 状态："
pm2 status
echo ""
echo " 🐘 数据库状态："
sudo -u postgres psql -c "\l" llm_stock 2>/dev/null | grep llm_stock || echo "  llm_stock ✅"
echo ""
echo " ⏰ 定时任务："
echo "    06:00 股票价格同步"
echo "    07:00 新闻抓取"
echo "    07:30 AI 评分计算"
echo "    08:30 LINE AI 日报"
echo "    16:35 风险预警（工作日）"
echo "    22:00 日终复盘"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
