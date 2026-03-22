#!/usr/bin/env bash
# 停止所有本地服务
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOGS="$ROOT/logs"

echo "停止本地服务..."

for service in xagent-core flight-agent hotel-agent; do
  pidfile="$LOGS/${service}.pid"
  if [ -f "$pidfile" ]; then
    pid=$(cat "$pidfile")
    kill "$pid" 2>/dev/null && echo "  ✓ $service (PID $pid) 已停止" || echo "  ~ $service 已不在运行"
    rm -f "$pidfile"
  fi
done

echo "停止 PostgreSQL..."
cd "$ROOT" && docker compose stop postgres

echo "完成。数据已保留在 Docker volume 中。"
echo "如需清除数据库: docker compose down -v"
