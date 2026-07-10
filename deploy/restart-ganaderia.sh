#!/usr/bin/env bash

set -euo pipefail

APP_DIR="/home/adminuser/EstablecimientoGanadero"
WEB_PORT="${WEB_PORT:-3200}"
API_PORT="${API_PORT:-3201}"

cd "$APP_DIR"

echo "[1/6] Actualizando master..."
git checkout master
git pull origin master

echo "[2/6] Instalando dependencias si hace falta..."
npm install

echo "[3/6] Recompilando frontend..."
npm --workspace apps/web run build

echo "[4/6] Bajando procesos anteriores..."
pkill -f "next start" || true
pkill -f "src/index.ts" || true

echo "[5/6] Levantando API en puerto $API_PORT..."
nohup env PORT="$API_PORT" npm --workspace apps/api run dev > "$APP_DIR/api.log" 2> "$APP_DIR/api.err" &

echo "[6/6] Levantando web en puerto $WEB_PORT..."
nohup bash -lc "cd '$APP_DIR/apps/web' && PORT='$WEB_PORT' npm run start" > "$APP_DIR/web.log" 2> "$APP_DIR/web.err" &

echo "Listo."
echo "API log: $APP_DIR/api.log"
echo "WEB log: $APP_DIR/web.log"
