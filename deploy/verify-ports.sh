#!/usr/bin/env bash

set -euo pipefail

VERIFY_PORTS_VERSION="2"
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

PASS_COUNT=0
FAIL_COUNT=0
WARN_COUNT=0

pass() {
  PASS_COUNT=$((PASS_COUNT + 1))
  printf 'OK   %s\n' "$1"
}

fail() {
  FAIL_COUNT=$((FAIL_COUNT + 1))
  printf 'FALLO %s\n' "$1"
}

warn() {
  WARN_COUNT=$((WARN_COUNT + 1))
  printf 'AVISO %s\n' "$1"
}

http_ok() {
  curl -fsS --max-time 8 -o /dev/null "$1"
}

section "Puertos esperados"
printf 'VERIFY_PORTS_VERSION=%s\n' "$VERIFY_PORTS_VERSION"
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
  load_state="$(systemctl show "$unit" -p LoadState --value 2>/dev/null || true)"
  if [[ "$load_state" != "not-found" && -n "$load_state" ]]; then
    run systemctl status "$unit" --no-pager --full || true
    run systemctl show "$unit" -p Environment -p ExecStart -p WorkingDirectory --no-pager || true
    if command -v journalctl >/dev/null 2>&1; then
      printf '\n-- Ultimas 80 lineas completas de %s --\n' "$unit"
      run journalctl -u "$unit" -n 80 --no-pager --output=short-precise --all || true
    fi
  else
    echo "$unit no esta instalado/cargado en systemd (LoadState=${load_state:-desconocido})."
  fi
done

section "Resultado comprobado"

if http_ok "$API_HEALTH_URL"; then
  pass "API responde en $API_HEALTH_URL"
else
  fail "API no responde en $API_HEALTH_URL"
fi

plans_json="$(curl -fsS --max-time 8 "http://127.0.0.1:${API_PORT}/public/plans" 2>/dev/null || true)"
if PLANS_JSON="$plans_json" python3 - <<'PY'
import json
import os

try:
    payload = json.loads(os.environ["PLANS_JSON"])
    plans = payload if isinstance(payload, list) else payload.get("plans", [])
    by_code = {str(plan.get("code", "")).upper(): plan for plan in plans}
    ok = all(by_code.get(code, {}).get("isSelfService") is True for code in ("BASIC", "PRO"))
except (json.JSONDecodeError, TypeError, AttributeError):
    ok = False

raise SystemExit(0 if ok else 1)
PY
then
  pass "BASIC y PRO estan disponibles con isSelfService=true"
else
  fail "/public/plans no devuelve BASIC y PRO con isSelfService=true"
fi

if http_ok "$WEB_HEALTH_URL"; then
  pass "Web responde en $WEB_HEALTH_URL"
else
  fail "Web no responde en $WEB_HEALTH_URL"
fi

repo_commit="$(git -C "$APP_DIR" rev-parse HEAD 2>/dev/null || true)"
deployment_json="$(curl -fsS --max-time 8 "$WEB_DEPLOYMENT_URL" 2>/dev/null || true)"
served_commit="$(DEPLOYMENT_JSON="$deployment_json" python3 - <<'PY'
import json
import os

try:
    print(json.loads(os.environ["DEPLOYMENT_JSON"]).get("commit", ""))
except (json.JSONDecodeError, TypeError, AttributeError):
    pass
PY
)"
if [[ -n "$repo_commit" && "$served_commit" == "$repo_commit" ]]; then
  pass "La web sirve el commit actual: $repo_commit"
else
  fail "Commit servido (${served_commit:-sin respuesta}) distinto del checkout (${repo_commit:-desconocido})"
fi

if http_ok "http://127.0.0.1:${WEB_PORT}/registro"; then
  pass "/registro responde; la disponibilidad del trial fue validada en /public/plans"
else
  fail "/registro no responde"
fi

nginx_dump="$(nginx -T 2>/dev/null || true)"
if [[ "$nginx_dump" == *"proxy_pass http://127.0.0.1:${API_PORT}/health"* &&
      "$nginx_dump" == *"proxy_pass http://127.0.0.1:${WEB_PORT}"* ]]; then
  pass "Nginx efectivo apunta a API ${API_PORT} y web ${WEB_PORT}"
else
  fail "Nginx efectivo no contiene los proxy_pass esperados"
fi

if http_ok "https://${DOMAIN}/health"; then
  pass "El healthcheck publico HTTPS responde"
else
  warn "El dominio publico falla; revisar Nginx, DNS, TLS y firewall"
fi

printf '\nTotales: %d OK, %d fallos, %d avisos.\n' "$PASS_COUNT" "$FAIL_COUNT" "$WARN_COUNT"
if (( FAIL_COUNT > 0 )); then
  printf 'Diagnostico FALLIDO. Revisa las lineas FALLO anteriores.\n'
  exit 1
fi

printf 'Diagnostico OK. Los componentes obligatorios estan alineados.\n'
