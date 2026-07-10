#!/usr/bin/env bash

set -euo pipefail

APP_DIR="/home/adminuser/EstablecimientoGanadero"
WEB_PORT="${WEB_PORT:-3200}"
API_PORT="${API_PORT:-3201}"
API_HEALTH_URL="http://127.0.0.1:${API_PORT}/health"
WEB_HEALTH_URL="http://127.0.0.1:${WEB_PORT}/login"

wait_for_http() {
  local url="$1"
  local label="$2"
  local attempts="${3:-30}"
  local sleep_seconds="${4:-2}"

  for ((i=1; i<=attempts; i++)); do
    if curl -fsS -o /dev/null "$url"; then
      echo "$label listo: $url"
      return 0
    fi
    echo "Esperando $label ($i/$attempts)..."
    sleep "$sleep_seconds"
  done

  echo "No se pudo validar $label en $url"
  return 1
}

cd "$APP_DIR"

echo "[1/8] Actualizando master..."
git checkout master
git pull origin master

echo "[2/8] Instalando dependencias si hace falta..."
npm install

echo "[3/8] Recompilando frontend..."
npm --workspace apps/web run build

echo "[4/8] Bajando procesos anteriores..."
pkill -f "next start" || true
pkill -f "src/index.ts" || true
sleep 2

echo "[5/8] Levantando API en puerto $API_PORT..."
nohup env PORT="$API_PORT" npm --workspace apps/api run dev > "$APP_DIR/api.log" 2> "$APP_DIR/api.err" &

echo "[6/8] Validando API..."
wait_for_http "$API_HEALTH_URL" "API" || {
  echo "Revisar logs: $APP_DIR/api.err y $APP_DIR/api.log"
  exit 1
}

echo "[7/8] Levantando web en puerto $WEB_PORT..."
nohup bash -lc "cd '$APP_DIR/apps/web' && API_INTERNAL_URL='http://127.0.0.1:${API_PORT}' PORT='$WEB_PORT' npm run start" > "$APP_DIR/web.log" 2> "$APP_DIR/web.err" &

echo "[8/8] Validando web..."
wait_for_http "$WEB_HEALTH_URL" "web" || {
  echo "Revisar logs: $APP_DIR/web.err y $APP_DIR/web.log"
  exit 1
}

echo "Listo."
echo "API log: $APP_DIR/api.log"
echo "WEB log: $APP_DIR/web.log"
