#!/usr/bin/env bash

set -euo pipefail

APP_DIR="${APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
ENTRYPOINT="$APP_DIR/apps/api/src/index.ts"
ESBUILD="$APP_DIR/node_modules/.bin/esbuild"
OUTPUT_FILE="$(mktemp --suffix=.mjs)"
trap 'rm -f "$OUTPUT_FILE"' EXIT

if [[ ! -x "$ESBUILD" ]]; then
  echo "ERROR: no se encontro $ESBUILD. Ejecuta npm install antes del chequeo." >&2
  exit 1
fi

echo "Validando sintaxis de $ENTRYPOINT..."
"$ESBUILD" "$ENTRYPOINT" --loader:.ts=ts --format=esm --outfile="$OUTPUT_FILE"
echo "Sintaxis de API valida."
