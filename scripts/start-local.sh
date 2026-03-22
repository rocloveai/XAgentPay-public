#!/usr/bin/env bash
# ============================================================
# XAgentPay — 本地完整启动脚本
# 用法: ./scripts/start-local.sh
# 停止: ./scripts/stop-local.sh
# ============================================================
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOGS="$ROOT/logs"
mkdir -p "$LOGS"

# 颜色
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info()  { echo -e "${GREEN}[✓]${NC} $*"; }
warn()  { echo -e "${YELLOW}[!]${NC} $*"; }
error() { echo -e "${RED}[✗]${NC} $*"; exit 1; }

# ── 0. 检查 CHANGE_ME 占位符 ─────────────────────────────────
check_secrets() {
  local missing=0
  for f in \
    "$ROOT/src/xagent-core/.env.local" \
    "$ROOT/src/flight-agent/.env.local" \
    "$ROOT/src/hotel-agent/.env.local"; do
    if grep -q "CHANGE_ME" "$f" 2>/dev/null; then
      warn "请先填写 $f 中的 CHANGE_ME 值"
      missing=1
    fi
  done
  if [ $missing -eq 1 ]; then
    echo ""
    echo "  从 Render Dashboard 复制以下值："
    echo "  xagent-core:         RELAYER_PRIVATE_KEY"
    echo "  xagent-flight-agent: MERCHANT_SIGNER_PRIVATE_KEY, DUFFEL_API_TOKEN"
    echo "  xagent-hotel-agent:  MERCHANT_SIGNER_PRIVATE_KEY, AMADEUS_API_KEY, AMADEUS_API_SECRET"
    echo ""
    read -p "已填写完毕？继续启动？[y/N] " confirm
    [[ "$confirm" =~ ^[Yy]$ ]] || exit 0
  fi
}

# ── 1. 启动 PostgreSQL ────────────────────────────────────────
start_postgres() {
  info "启动 PostgreSQL (Docker)..."
  cd "$ROOT"
  docker compose up -d postgres
  
  info "等待 PostgreSQL 就绪..."
  local retries=30
  while ! docker compose exec -T postgres pg_isready -U xagentpay -d xagentpay -q 2>/dev/null; do
    retries=$((retries - 1))
    [ $retries -le 0 ] && error "PostgreSQL 启动超时"
    sleep 1
  done
  info "PostgreSQL 已就绪"
}

# ── 2. 运行数据库迁移 ─────────────────────────────────────────
run_migrations() {
  info "运行数据库迁移..."
  for sql_file in "$ROOT/db/migrations/"*.sql; do
    local name
    name=$(basename "$sql_file")
    docker compose exec -T postgres psql -U xagentpay -d xagentpay \
      -f "/dev/stdin" < "$sql_file" > /dev/null 2>&1 && \
      echo "  ✓ $name" || echo "  ~ $name (已存在，跳过)"
  done
}

# ── 3. 安装依赖 & 构建 ────────────────────────────────────────
build_service() {
  local name="$1" dir="$2"
  info "安装 & 构建 $name..."
  cd "$dir"
  npm install --silent 2>/dev/null
  npm run build > "$LOGS/${name}-build.log" 2>&1 || {
    error "$name 构建失败，查看日志: $LOGS/${name}-build.log"
  }
}

build_all() {
  build_service "xagent-core"    "$ROOT/src/xagent-core"
  build_service "flight-agent"  "$ROOT/src/flight-agent"
  build_service "hotel-agent"   "$ROOT/src/hotel-agent"
  # xagent-website 用 Vite dev server，不需要预构建
  cd "$ROOT/src/xagent-website" && npm install --silent 2>/dev/null
  info "xagent-website 依赖已安装"
}

# ── 4. 启动各服务 ─────────────────────────────────────────────
start_service() {
  local name="$1" dir="$2" env_file="$3" cmd="$4"
  info "启动 $name..."
  # nohup 防止 shell 退出时子进程被杀掉；bash -c source 正确处理带空格的值
  nohup bash -c "set -a; source \"$env_file\"; set +a; cd \"$dir\"; $cmd" \
    > "$LOGS/${name}.log" 2>&1 &
  echo $! > "$LOGS/${name}.pid"
  echo "  PID=$(cat "$LOGS/${name}.pid")  日志: $LOGS/${name}.log"
}

# ── 5. 等待 Core 就绪 ────────────────────────────────────────
wait_for_core() {
  info "等待 xagent-core 就绪..."
  local retries=30
  while ! curl -s http://localhost:4000/health > /dev/null 2>&1; do
    retries=$((retries - 1))
    [ $retries -le 0 ] && { warn "xagent-core 启动超时，跳过自动注册"; return 1; }
    sleep 1
  done
  info "xagent-core 已就绪 $(curl -s http://localhost:4000/health | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d["version"])')"
  return 0
}

# ── 6. 注册本地商户 ───────────────────────────────────────────
register_merchants() {
  info "注册本地商户..."

  register_one() {
    local did="$1" name="$2" desc="$3" cat="$4" signer="$5" payment="$6" port="$7" prefix="$8"
    curl -s -X POST http://localhost:4000/api/market/register \
      -H "Authorization: Bearer 123456" \
      -H "Content-Type: application/json" \
      -d "{
        \"merchant_did\": \"$did\",
        \"name\": \"$name\",
        \"description\": \"$desc\",
        \"category\": \"$cat\",
        \"signer_address\": \"$signer\",
        \"payment_address\": \"$payment\",
        \"skill_md_url\": \"http://localhost:$port/skill.md\",
        \"skill_user_url\": \"http://localhost:$port/skill-user.md\",
        \"health_url\": \"http://localhost:$port/api/info\"
      }" > /dev/null 2>&1 && echo "  ✓ $name" || echo "  ~ $name (已注册)"
  }

  # 等待商户 agents 就绪
  sleep 3

  register_one \
    "did:xagent:20250407:demo_flight" \
    "XAgent Flight Agent" \
    "Search and book flights across Asia-Pacific routes with USDC escrow payments" \
    "travel.flights" \
    "0xdd31F8EcD2F5DE824238AB1A761212006A1E11b6" \
    "0xA1c249A993f31e6c27bC8886caCEc3f9f3b7a9D1" \
    "3001" "FLT"

  register_one \
    "did:xagent:20250407:demo_hotel" \
    "XAgent Hotel Agent" \
    "Search and book hotels across Asia-Pacific cities with USDC escrow payments" \
    "travel.hotels" \
    "0x5916667cfBD5f329c0A6474bf81d7F58c3BFB2C4" \
    "0xB030C3a17DD68C17c0EE8F1001326e0C029f0ADd" \
    "3002" "HTL"
}

# ── MAIN ─────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════╗"
echo "║     XAgentPay — 本地开发环境启动          ║"
echo "╚══════════════════════════════════════════╝"
echo ""

check_secrets
start_postgres
run_migrations
build_all

start_service "xagent-core" \
  "$ROOT/src/xagent-core" \
  "$ROOT/src/xagent-core/.env.local" \
  "node build/server.js"

start_service "flight-agent" \
  "$ROOT/src/flight-agent" \
  "$ROOT/src/flight-agent/.env.local" \
  "node build/server.js"

start_service "hotel-agent" \
  "$ROOT/src/hotel-agent" \
  "$ROOT/src/hotel-agent/.env.local" \
  "node build/server.js"

# xagent-website 用 Vite dev server（前台运行，放最后）
if wait_for_core; then
  register_merchants
fi

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  所有服务已启动！                                        ║"
echo "║                                                          ║"
echo "║  📊 Core Dashboard : http://localhost:4000               ║"
echo "║  🛒 Market         : http://localhost:4000/market        ║"
echo "║  ✈️  Flight Portal  : http://localhost:3001               ║"
echo "║  🏨 Hotel Portal   : http://localhost:3002               ║"
echo "║  🌐 Website        : http://localhost:3000               ║"
echo "║                                                          ║"
echo "║  日志目录: logs/                                         ║"
echo "║  停止所有: ./scripts/stop-local.sh                       ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
info "启动 xagent-website (Vite dev server, port 3000)..."
nohup bash -c "cd \"$ROOT/src/xagent-website\" && VITE_XAGENT_CORE_URL=http://localhost:4000 npm run dev" \
  > "$LOGS/xagent-website.log" 2>&1 &
echo $! > "$LOGS/xagent-website.pid"
echo "  PID=$(cat "$LOGS/xagent-website.pid")  日志: $LOGS/xagent-website.log"
sleep 4
echo ""
echo "  🌐 Website 已就绪: http://localhost:3000"
