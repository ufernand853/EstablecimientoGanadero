#!/usr/bin/env bash

set -euo pipefail

API_PORT="${API_PORT:-3201}"
WEB_PORT="${WEB_PORT:-3200}"
API_HEALTH_URL="${API_HEALTH_URL:-http://127.0.0.1:${API_PORT}/health}"
WEB_HEALTH_URL="${WEB_HEALTH_URL:-http://127.0.0.1:${WEB_PORT}/login}"
NGINX_CONF="${NGINX_CONF:-/etc/nginx/sites-enabled/ganaderia.linsse.com.conf}"
APP_DIR="${APP_DIR:-/home/adminuser/EstablecimientoGanadero}"

section() {
  printf '\n== %s ==\n' "$1"
}

run() {
  printf '+ %s\n' "$*"
  "$@"
}

section "Puertos esperados"
printf 'API_PORT=%s\nWEB_PORT=%s\n' "$API_PORT" "$WEB_PORT"

section "Procesos escuchando"
if command -v ss >/dev/null 2>&1; then
  run ss -ltnp "( sport = :${API_PORT} or sport = :${WEB_PORT} )" || true
else
  echo "ss no esta instalado; instalar iproute2 o usar: netstat -ltnp"
fi

section "Healthchecks locales"
run curl -fsS -i --max-time 5 "$API_HEALTH_URL" || true
run curl -fsS -I --max-time 5 "$WEB_HEALTH_URL" || true

section "Procesos node relacionados"
run pgrep -af 'node|tsx|next' || true

section "Nginx proxy_pass efectivo"
if [[ -r "$NGINX_CONF" ]]; then
  run awk '/proxy_pass|server_name|listen/ { print FILENAME ":" FNR ":" $0 }' "$NGINX_CONF"
else
  echo "No se puede leer $NGINX_CONF. Proba con sudo o ajusta NGINX_CONF=/ruta/al/conf."
fi

section "Configs nginx del repo"
if [[ -d "$APP_DIR/deploy/nginx" ]]; then
  run awk '/proxy_pass|server_name|listen/ { print FILENAME ":" FNR ":" $0 }' "$APP_DIR"/deploy/nginx/*.conf
else
  echo "No existe $APP_DIR/deploy/nginx. Ajusta APP_DIR si el repo esta en otro path."
fi

section "Systemd, si aplica"
for unit in eg-api.service eg-web.service; do
  if systemctl list-unit-files "$unit" >/dev/null 2>&1; then
    run systemctl status "$unit" --no-pager || true
    run systemctl show "$unit" -p Environment -p ExecStart -p WorkingDirectory --no-pager || true
  else
    echo "$unit no registrado en systemd."
  fi
done

cat <<EOF_SUMMARY

Resumen esperado:
- La API debe escuchar en 127.0.0.1:${API_PORT} o 0.0.0.0:${API_PORT} y ${API_HEALTH_URL} debe responder 200.
- La web debe escuchar en 127.0.0.1:${WEB_PORT} o 0.0.0.0:${WEB_PORT} y ${WEB_HEALTH_URL} debe responder.
- Nginx debe tener proxy_pass hacia http://127.0.0.1:${API_PORT}/health y http://127.0.0.1:${WEB_PORT}.
- Si /etc/nginx tiene puertos distintos que deploy/nginx, probablemente el deploy manual o un git pull piso la config esperada.
EOF_SUMMARY
