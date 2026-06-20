#!/bin/bash
# TOHOSHOU AI — 服务器初始化脚本
# Ubuntu 24.04 | 运行一次即可
set -e

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " TOHOSHOU AI 服务器初始化"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── 1. 系统更新 ───────────────────────────────────────────────────────────────
echo "[1/8] 更新系统..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get upgrade -y -qq

# ── 2. Node.js 22 ─────────────────────────────────────────────────────────────
echo "[2/8] 安装 Node.js 22..."
curl -fsSL https://deb.nodesource.com/setup_22.x | bash - > /dev/null 2>&1
apt-get install -y nodejs > /dev/null 2>&1
echo "Node.js: $(node --version)"
echo "npm: $(npm --version)"

# ── 3. PM2 ───────────────────────────────────────────────────────────────────
echo "[3/8] 安装 PM2..."
npm install -g pm2 > /dev/null 2>&1
echo "PM2: $(pm2 --version)"

# ── 4. PostgreSQL 16 ──────────────────────────────────────────────────────────
echo "[4/8] 安装 PostgreSQL 16..."
apt-get install -y postgresql-16 postgresql-client-16 > /dev/null 2>&1
systemctl enable postgresql
systemctl start postgresql
echo "PostgreSQL: $(psql --version)"

# 创建数据库用户和库
PG_PASS="TH2025_$(openssl rand -hex 8)"
echo "GENERATED_PG_PASS=${PG_PASS}" > /root/.tohoshou_pg_pass
chmod 600 /root/.tohoshou_pg_pass

sudo -u postgres psql << EOSQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'tohoshou') THEN
    CREATE USER tohoshou WITH PASSWORD '${PG_PASS}';
  END IF;
END
\$\$;
CREATE DATABASE IF NOT EXISTS llm_stock OWNER tohoshou;
GRANT ALL PRIVILEGES ON DATABASE llm_stock TO tohoshou;
EOSQL

sudo -u postgres psql -c "GRANT ALL ON SCHEMA public TO tohoshou;" llm_stock
echo "PostgreSQL 数据库已创建：llm_stock / 用户：tohoshou"
echo "密码已保存至 /root/.tohoshou_pg_pass"

# ── 5. Nginx ──────────────────────────────────────────────────────────────────
echo "[5/8] 安装 Nginx..."
apt-get install -y nginx > /dev/null 2>&1
systemctl enable nginx
systemctl start nginx
echo "Nginx: $(nginx -v 2>&1)"

# ── 6. Certbot ────────────────────────────────────────────────────────────────
echo "[6/8] 安装 Certbot..."
apt-get install -y certbot python3-certbot-nginx > /dev/null 2>&1
echo "Certbot: $(certbot --version)"

# ── 7. 防火墙 ─────────────────────────────────────────────────────────────────
echo "[7/8] 开放端口 22/80/443/3000..."
ufw --force enable
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 3000/tcp
ufw status

# ── 8. 目录结构 ───────────────────────────────────────────────────────────────
echo "[8/8] 创建目录..."
mkdir -p /opt/tohoshou/logs
mkdir -p /opt/tohoshou/.next

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " ✅ 服务器初始化完成"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " Node.js: $(node --version)"
echo " npm:     $(npm --version)"
echo " PM2:     $(pm2 --version)"
echo " Nginx:   $(nginx -v 2>&1)"
echo " PgSQL:   $(psql --version)"
echo ""
echo " PG密码文件: /root/.tohoshou_pg_pass"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
