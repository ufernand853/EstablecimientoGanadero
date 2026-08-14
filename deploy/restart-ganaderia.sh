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

journalctl_run() {
  if [[ "$(id -u)" -eq 0 ]]; then
    journalctl "$@"
  else
    sudo journalctl "$@"
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
    if curl -fsS --connect-timeout 2 --max-time 5 -o /dev/null "$url"; then
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

echo "[1/7] Verificando checkout..."
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "ERROR: hay cambios locales en archivos versionados. No se inicia el deploy para no sobrescribirlos."
  echo "Ejecuta 'git status --short', guarda los cambios con git stash o descartalos, hace git pull y vuelve a ejecutar este script."
  exit 1
fi
DEPLOY_COMMIT="$(git rev-parse HEAD)"
echo "Commit a desplegar: $DEPLOY_COMMIT"

echo "[2/7] Instalando dependencias si hace falta..."
npm install

"$APP_DIR/deploy/check-api-syntax.sh"

echo "[3/7] Recompilando frontend..."
NEXT_PUBLIC_APP_COMMIT="$DEPLOY_COMMIT" npm --workspace apps/web run build

echo "[4/7] Prevalidando el build web en puerto temporal $WEB_PREFLIGHT_PORT..."
select_web_preflight_port
start_web "$WEB_PREFLIGHT_PORT" "$APP_DIR/web-preflight.log" "$APP_DIR/web-preflight.err"
WEB_PREFLIGHT_PID="$WEB_STARTED_PID"
wait_for_http "$WEB_PREFLIGHT_URL" "web de prevalidacion" || {
  echo "El build nuevo no arranca. La web anterior sigue atendiendo en el puerto $WEB_PORT."
  echo "Revisar logs: $APP_DIR/web-preflight.err y $APP_DIR/web-preflight.log"
  exit 1
}
stop_web_preflight

echo "[5/7] Instalando y reiniciando servicios persistentes..."
"$APP_DIR/deploy/systemd/install-services.sh" \
  --user "$(stat -c '%U' "$APP_DIR")" \
  --project-dir "$APP_DIR" \
  --api-port "$API_PORT" \
  --web-port "$WEB_PORT"

echo "[6/7] Validando API y web..."
wait_for_http "$API_HEALTH_URL" "API"
wait_for_http "$WEB_HEALTH_URL" "web" || {
  systemctl_run status eg-web.service --no-pager --full || true
  journalctl_run -u eg-web.service -n 80 --no-pager --output=short-precise --all || true
  exit 1
}

echo "[7/7] Verificando version desplegada..."
DEPLOYED_COMMIT="$(curl -fsS "http://127.0.0.1:${WEB_PORT}/api/deployment-info" | node -e 'let data=""; process.stdin.on("data", chunk => data += chunk); process.stdin.on("end", () => console.log(JSON.parse(data).commit ?? ""));')"
if [[ "$DEPLOYED_COMMIT" != "$DEPLOY_COMMIT" ]]; then
  echo "ERROR: la web responde con el commit '$DEPLOYED_COMMIT', pero se desplego '$DEPLOY_COMMIT'."
  echo "Hay un proceso/build viejo atendiendo el puerto $WEB_PORT."
  exit 1
fi
echo "Commit web verificado: $DEPLOYED_COMMIT"

echo "Listo."
echo "Logs: sudo journalctl -u eg-api.service -u eg-web.service -f"
