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
  --out-dir "$TMP_DIR"

if [[ "$(id -u)" -eq 0 ]]; then
  cp "$TMP_DIR/eg-api.service" "$SYSTEMD_DIR/eg-api.service"
  cp "$TMP_DIR/eg-web.service" "$SYSTEMD_DIR/eg-web.service"
  if [[ "$SKIP_SYSTEMCTL" != "true" ]]; then
    systemctl daemon-reload
    systemctl enable --now eg-api.service
    systemctl enable --now eg-web.service
  fi
else
  sudo cp "$TMP_DIR/eg-api.service" "$SYSTEMD_DIR/eg-api.service"
  sudo cp "$TMP_DIR/eg-web.service" "$SYSTEMD_DIR/eg-web.service"
  if [[ "$SKIP_SYSTEMCTL" != "true" ]]; then
    sudo systemctl daemon-reload
    sudo systemctl enable --now eg-api.service
    sudo systemctl enable --now eg-web.service
  fi
fi

echo "Installed services in ${SYSTEMD_DIR}:"
echo "- eg-api.service"
echo "- eg-web.service"
