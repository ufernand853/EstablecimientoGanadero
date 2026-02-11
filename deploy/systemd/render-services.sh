#!/usr/bin/env bash
set -euo pipefail

# Generates systemd unit files with concrete USER and PROJECT_DIR values.
# Usage:
#   ./deploy/systemd/render-services.sh
#   ./deploy/systemd/render-services.sh --user adminuser --project-dir /home/adminuser/EstablecimientoGanadero

USER_NAME="$(id -un)"
PROJECT_DIR="$(pwd)"
OUT_DIR="deploy/systemd/generated"

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
    --out-dir)
      OUT_DIR="$2"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

mkdir -p "$OUT_DIR"

cat > "$OUT_DIR/eg-api.service" <<UNIT
[Unit]
Description=Establecimiento Ganadero API
After=network.target

[Service]
Type=simple
User=${USER_NAME}
WorkingDirectory=${PROJECT_DIR}
Environment=NODE_ENV=production
EnvironmentFile=-${PROJECT_DIR}/.env
ExecStart=/usr/bin/env npm --workspace apps/api run start
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
UNIT

cat > "$OUT_DIR/eg-web.service" <<UNIT
[Unit]
Description=Establecimiento Ganadero Web (Next.js)
After=network.target
Wants=eg-api.service

[Service]
Type=simple
User=${USER_NAME}
WorkingDirectory=${PROJECT_DIR}
Environment=NODE_ENV=production
Environment=PORT=3000
EnvironmentFile=-${PROJECT_DIR}/.env
ExecStart=/usr/bin/env npm --workspace apps/web run start
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
UNIT

echo "Generated:"
echo "- ${OUT_DIR}/eg-api.service"
echo "- ${OUT_DIR}/eg-web.service"
