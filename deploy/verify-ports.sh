#!/usr/bin/env bash

set -euo pipefail

API_PORT="${API_PORT:-3201}"
WEB_PORT="${WEB_PORT:-3200}"
DOMAIN="${DOMAIN:-ganaderia.linsse.com}"
API_HEALTH_URL="${API_HEALTH_URL:-http://127.0.0.1:${API_PORT}/health}"
WEB_HEALTH_URL="${WEB_HEALTH_URL:-http://127.0.0.1:${WEB_PORT}/login}"
WEB_DEPLOYMENT_URL="${WEB_DEPLOYMENT_URL:-http://127.0.0.1:${WEB_PORT}/api/deployment-info}"
NGINX_CONF="${NGINX_CONF:-/etc/nginx/sites-enabled/ganaderia.linsse.com.conf}"
APP_DIR="${APP_DIR:-/home/adminuser/EstablecimientoGanadero}"
PUBLIC_HEALTH_URL="${PUBLIC_HEALTH_URL:-https://${DOMAIN}/health}"
PUBLIC_WEB_URL="${PUBLIC_WEB_URL:-https://${DOMAIN}/login}"

section() {
  printf '\n== %s ==\n' "$1"
}

run() {
  printf '+ %s\n' "$*"
  "$@"
}

curl_check() {
  local method="$1"
  local url="$2"
  shift 2

  if [[ "$method" == "head" ]]; then
    run curl -fsS -I --max-time 8 "$@" "$url" || true
  else
    run curl -fsS -i --max-time 8 "$@" "$url" || true
  fi
}

section "Puertos esperados"
printf 'API_PORT=%s\nWEB_PORT=%s\nDOMAIN=%s\n' "$API_PORT" "$WEB_PORT" "$DOMAIN"

section "Todos los puertos TCP escuchando"
if command -v ss >/dev/null 2>&1; then
  run ss -ltnp || true
else
  echo "ss no esta instalado; instalar iproute2 o usar: netstat -ltnp"
fi

section "Puertos esperados de esta app y Nginx"
if command -v ss >/dev/null 2>&1; then
  run ss -ltnp "( sport = :${API_PORT} or sport = :${WEB_PORT} or sport = :80 or sport = :443 )" || true
fi

section "Healthchecks locales directos a Node"
curl_check get "$API_HEALTH_URL"
curl_check get "http://127.0.0.1:${API_PORT}/public/plans"
curl_check head "$WEB_HEALTH_URL"
curl_check get "$WEB_DEPLOYMENT_URL"
curl_check head "http://127.0.0.1:${WEB_PORT}/registro"

section "Healthchecks pasando por Nginx local HTTP con Host: ${DOMAIN}"
curl_check get "http://127.0.0.1/health" -H "Host: ${DOMAIN}"
curl_check head "http://127.0.0.1/login" -H "Host: ${DOMAIN}"

section "Healthchecks pasando por Nginx local HTTPS con --resolve"
curl_check get "https://${DOMAIN}/health" --resolve "${DOMAIN}:443:127.0.0.1"
curl_check head "https://${DOMAIN}/login" --resolve "${DOMAIN}:443:127.0.0.1"

section "Healthchecks publicos por dominio"
curl_check get "$PUBLIC_HEALTH_URL"
curl_check head "$PUBLIC_WEB_URL"

section "Procesos node relacionados"
run pgrep -af 'node|tsx|next' || true

section "Nginx instalado: config apuntada por sites-enabled"
if [[ -r "$NGINX_CONF" ]]; then
  run awk '/proxy_pass|server_name|listen/ { print FILENAME ":" FNR ":" $0 }' "$NGINX_CONF"
else
  echo "No se puede leer $NGINX_CONF. Proba con sudo o ajusta NGINX_CONF=/ruta/al/conf."
fi

section "Nginx efectivo: nginx -T"
if command -v nginx >/dev/null 2>&1; then
  run nginx -T 2>/dev/null | awk '/server_name|listen|proxy_pass/ { print }' || {
    echo "No se pudo ejecutar nginx -T sin sudo. Proba: sudo ./deploy/verify-ports.sh"
  }
else
  echo "nginx no esta instalado o no esta en PATH."
fi

section "Estado de Nginx"
if command -v systemctl >/dev/null 2>&1; then
  run systemctl is-active nginx || true
  run systemctl status nginx --no-pager || true
fi

section "Configs nginx del repo"
if [[ -d "$APP_DIR/deploy/nginx" ]]; then
  run awk '/proxy_pass|server_name|listen/ { print FILENAME ":" FNR ":" $0 }' "$APP_DIR"/deploy/nginx/*.conf
else
  echo "No existe $APP_DIR/deploy/nginx. Ajusta APP_DIR si el repo esta en otro path."
fi

section "Systemd de la app, si aplica"
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
- /public/plans debe devolver BASIC y PRO con isSelfService=true; los planes con trial siguen disponibles aunque la pasarela todavia no este configurada.
- La web debe escuchar en 127.0.0.1:${WEB_PORT} o 0.0.0.0:${WEB_PORT} y ${WEB_HEALTH_URL} debe responder.
- ${WEB_DEPLOYMENT_URL} debe mostrar el mismo commit que git rev-parse HEAD; si difiere, hay un build o proceso viejo atendiendo el puerto.
- /registro debe responder y mostrar la opcion de prueba/trial cuando la API devuelve planes con trialDays mayor que cero.
- Nginx debe escuchar en 80/443 y nginx -T debe mostrar proxy_pass hacia http://127.0.0.1:${API_PORT}/health y http://127.0.0.1:${WEB_PORT}.
- Si los checks directos a Node funcionan pero los checks con Host/dominio fallan, el problema esta en Nginx, DNS, certificado, firewall o en que no se recargo Nginx.
- Si /etc/nginx tiene puertos distintos que deploy/nginx, copia la config correcta a sites-enabled y ejecuta: sudo nginx -t && sudo systemctl reload nginx
EOF_SUMMARY
