#!/usr/bin/env bash
set -euo pipefail

# Generate and install systemd service files.
# Usage:
#   ./deploy/systemd/install-services.sh
#   ./deploy/systemd/install-services.sh --user adminuser --project-dir /home/adminuser/EstablecimientoGanadero

USER_NAME="$(id -un)"
PROJECT_DIR="$(pwd)"
SYSTEMD_DIR="/etc/systemd/system"
SKIP_SYSTEMCTL="false"
API_PORT="${API_PORT:-3201}"
WEB_PORT="${WEB_PORT:-3200}"

wait_for_api() {
  local url="http://127.0.0.1:${API_PORT}/health"

  for ((attempt=1; attempt<=30; attempt++)); do
    if curl -fsS --max-time 3 -o /dev/null "$url"; then
      echo "API lista: $url"
      return 0
    fi
    echo "Esperando API ($attempt/30)..."
    sleep 2
  done

  echo "ERROR: la API no respondio en $url; la web no se reiniciara." >&2
  return 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --user)
      USER_NAME="$2"
      shift 2
      ;;
    --project-dir)
      PROJECT_DIR="$2"
      shift 2
      ;;
    --systemd-dir)
      SYSTEMD_DIR="$2"
      shift 2
      ;;
    --api-port)
      API_PORT="$2"
      shift 2
      ;;
    --web-port)
      WEB_PORT="$2"
      shift 2
      ;;
    --skip-systemctl)
      SKIP_SYSTEMCTL="true"
      shift
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

mkdir -p "$SYSTEMD_DIR"

"${PROJECT_DIR}/deploy/systemd/render-services.sh" \
  --user "$USER_NAME" \
  --project-dir "$PROJECT_DIR" \
  --out-dir "$TMP_DIR" \
  --api-port "$API_PORT" \
  --web-port "$WEB_PORT"

"${PROJECT_DIR}/deploy/check-api-syntax.sh"

if [[ "$(id -u)" -eq 0 ]]; then
  cp "$TMP_DIR/eg-api.service" "$SYSTEMD_DIR/eg-api.service"
  cp "$TMP_DIR/eg-web.service" "$SYSTEMD_DIR/eg-web.service"
  if [[ "$SKIP_SYSTEMCTL" != "true" ]]; then
    systemctl daemon-reload
    systemctl enable eg-api.service eg-web.service
    systemctl reset-failed eg-api.service eg-web.service || true
    systemctl restart eg-api.service
    wait_for_api || {
      systemctl status eg-api.service --no-pager --full || true
      journalctl -u eg-api.service -n 80 --no-pager --output=short-precise --all || true
      exit 1
    }
    systemctl restart eg-web.service
  fi
else
  sudo cp "$TMP_DIR/eg-api.service" "$SYSTEMD_DIR/eg-api.service"
  sudo cp "$TMP_DIR/eg-web.service" "$SYSTEMD_DIR/eg-web.service"
  if [[ "$SKIP_SYSTEMCTL" != "true" ]]; then
    sudo systemctl daemon-reload
    sudo systemctl enable eg-api.service eg-web.service
    sudo systemctl reset-failed eg-api.service eg-web.service || true
    sudo systemctl restart eg-api.service
    wait_for_api || {
      sudo systemctl status eg-api.service --no-pager --full || true
      sudo journalctl -u eg-api.service -n 80 --no-pager --output=short-precise --all || true
      exit 1
    }
    sudo systemctl restart eg-web.service
  fi
fi

echo "Installed services in ${SYSTEMD_DIR}:"
echo "- eg-api.service"
echo "- eg-web.service"
