#!/usr/bin/env bash
# Divorce app dev launcher (bash). Usage: ./start.sh
set -euo pipefail
cd "$(dirname "$0")"

command -v node >/dev/null 2>&1 || { echo "node is not installed — get it from https://nodejs.org" >&2; exit 1; }

if [ ! -d node_modules ]; then
  echo "Installing dependencies…"
  npm install
fi

echo "Starting dev server…"
npm run dev
