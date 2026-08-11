#!/usr/bin/env bash

set -euo pipefail

APP_DIR="/home/adminuser/EstablecimientoGanadero"
WEB_PORT="${WEB_PORT:-3200}"
API_PORT="${API_PORT:-3201}"
WEB_PREFLIGHT_PORT="${WEB_PREFLIGHT_PORT:-3299}"
API_HEALTH_URL="http://127.0.0.1:${API_PORT}/health"
WEB_HEALTH_URL="http://127.0.0.1:${WEB_PORT}/login"
WEB_PREFLIGHT_URL="http://127.0.0.1:${WEB_PREFLIGHT_PORT}/login"
WEB_PREFLIGHT_PID=""


systemctl_run() {
  if [[ "$(id -u)" -eq 0 ]]; then
    systemctl "$@"
  else
    sudo systemctl "$@"
  fi
}

stop_systemd_unit() {
  local unit="$1"

  if ! command -v systemctl >/dev/null 2>&1; then
    return 0
  fi

  if systemctl list-unit-files --no-legend "$unit" 2>/dev/null | grep -q "^$unit"; then
    echo "Deteniendo $unit para no mezclar systemd con deploy manual..."
    systemctl_run stop "$unit" || echo "No se pudo detener $unit; revisa permisos/systemd."
    systemctl_run disable "$unit" || echo "No se pudo deshabilitar $unit; revisa permisos/systemd."
    systemctl_run reset-failed "$unit" || true
  fi
}

stop_port_listener() {
  local port="$1"
  local label="$2"

  if ! command -v fuser >/dev/null 2>&1; then
    echo "fuser no esta disponible; no puedo liberar automaticamente el puerto $port ($label)."
    return 0
  fi

  if fuser "${port}/tcp" >/dev/null 2>&1; then
    echo "Liberando puerto $port ($label)..."
    fuser -k -TERM "${port}/tcp" >/dev/null 2>&1 || true
    sleep 2
  fi

  if fuser "${port}/tcp" >/dev/null 2>&1; then
    echo "El puerto $port sigue ocupado; forzando cierre..."
    fuser -k -KILL "${port}/tcp" >/dev/null 2>&1 || true
    sleep 1
  fi
}

port_is_busy() {
  local port="$1"

  if command -v fuser >/dev/null 2>&1; then
    fuser "${port}/tcp" >/dev/null 2>&1
    return
  fi

  ss -ltnH "sport = :${port}" 2>/dev/null | grep -q .
}

select_web_preflight_port() {
  local candidate="$WEB_PREFLIGHT_PORT"
  local max_candidate=$((WEB_PREFLIGHT_PORT + 100))

  while [[ "$candidate" -le "$max_candidate" ]]; do
    if [[ "$candidate" != "$WEB_PORT" && "$candidate" != "$API_PORT" ]] && ! port_is_busy "$candidate"; then
      if [[ "$candidate" != "$WEB_PREFLIGHT_PORT" ]]; then
        echo "El puerto temporal $WEB_PREFLIGHT_PORT esta ocupado; se usara automaticamente el $candidate."
      fi
      WEB_PREFLIGHT_PORT="$candidate"
      WEB_PREFLIGHT_URL="http://127.0.0.1:${WEB_PREFLIGHT_PORT}/login"
      return 0
    fi
    candidate=$((candidate + 1))
  done

  echo "ERROR: no se encontro un puerto temporal libre entre $WEB_PREFLIGHT_PORT y $max_candidate."
  return 1
}

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

stop_web_preflight() {
  if [[ -n "$WEB_PREFLIGHT_PID" ]] && kill -0 "$WEB_PREFLIGHT_PID" 2>/dev/null; then
    kill -TERM "$WEB_PREFLIGHT_PID" 2>/dev/null || true
    wait "$WEB_PREFLIGHT_PID" 2>/dev/null || true
  fi
  WEB_PREFLIGHT_PID=""
}

start_web() {
  local port="$1"
  local stdout_file="$2"
  local stderr_file="$3"

  nohup env \
    API_INTERNAL_URL="http://127.0.0.1:${API_PORT}" \
    PORT="$port" \
    npm --prefix "$APP_DIR/apps/web" run start \
    > "$stdout_file" 2> "$stderr_file" &
  WEB_STARTED_PID="$!"
}

trap stop_web_preflight EXIT

cd "$APP_DIR"

echo "[1/9] Verificando checkout..."
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "ERROR: hay cambios locales en archivos versionados. No se inicia el deploy para no sobrescribirlos."
  echo "Ejecuta 'git status --short', guarda los cambios con git stash o descartalos, hace git pull y vuelve a ejecutar este script."
  exit 1
fi
DEPLOY_COMMIT="$(git rev-parse HEAD)"
echo "Commit a desplegar: $DEPLOY_COMMIT"

echo "[2/9] Instalando dependencias si hace falta..."
npm install

"$APP_DIR/deploy/check-api-syntax.sh"

echo "[3/9] Recompilando frontend..."
NEXT_PUBLIC_APP_COMMIT="$DEPLOY_COMMIT" npm --workspace apps/web run build

echo "[4/9] Bajando API anterior (la web sigue atendiendo durante esta etapa)..."
stop_systemd_unit eg-api.service
pkill -f "src/index.ts" || true
stop_port_listener "$API_PORT" "API"
sleep 2

echo "[5/9] Levantando API en puerto $API_PORT..."
nohup env PORT="$API_PORT" APP_GIT_COMMIT="$DEPLOY_COMMIT" npm --workspace apps/api run start > "$APP_DIR/api.log" 2> "$APP_DIR/api.err" &

echo "[6/9] Validando API..."
wait_for_http "$API_HEALTH_URL" "API" || {
  echo "Revisar logs: $APP_DIR/api.err y $APP_DIR/api.log"
  exit 1
}

echo "[7/9] Prevalidando el build web en puerto temporal $WEB_PREFLIGHT_PORT..."
select_web_preflight_port
start_web "$WEB_PREFLIGHT_PORT" "$APP_DIR/web-preflight.log" "$APP_DIR/web-preflight.err"
WEB_PREFLIGHT_PID="$WEB_STARTED_PID"
wait_for_http "$WEB_PREFLIGHT_URL" "web de prevalidacion" || {
  echo "El build nuevo no arranca. La web anterior sigue atendiendo en el puerto $WEB_PORT."
  echo "Revisar logs: $APP_DIR/web-preflight.err y $APP_DIR/web-preflight.log"
  exit 1
}
stop_web_preflight

echo "[8/9] Levantando web en puerto $WEB_PORT..."
stop_systemd_unit eg-web.service
stop_port_listener "$WEB_PORT" "web"
start_web "$WEB_PORT" "$APP_DIR/web.log" "$APP_DIR/web.err"
disown "$WEB_STARTED_PID" 2>/dev/null || true

echo "[9/9] Validando web..."
wait_for_http "$WEB_HEALTH_URL" "web" || {
  echo "Revisar logs: $APP_DIR/web.err y $APP_DIR/web.log"
  exit 1
}

DEPLOYED_COMMIT="$(curl -fsS "http://127.0.0.1:${WEB_PORT}/api/deployment-info" | node -e 'let data=""; process.stdin.on("data", chunk => data += chunk); process.stdin.on("end", () => console.log(JSON.parse(data).commit ?? ""));')"
if [[ "$DEPLOYED_COMMIT" != "$DEPLOY_COMMIT" ]]; then
  echo "ERROR: la web responde con el commit '$DEPLOYED_COMMIT', pero se desplego '$DEPLOY_COMMIT'."
  echo "Hay un proceso/build viejo atendiendo el puerto $WEB_PORT."
  exit 1
fi
echo "Commit web verificado: $DEPLOYED_COMMIT"

echo "Listo."
echo "API log: $APP_DIR/api.log"
echo "WEB log: $APP_DIR/web.log"
