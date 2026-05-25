#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")/.."

mkdir -p data/downloads data/extracted data/logs

if [ ! -d node_modules ]; then
  npm install
fi

node src/main.js >> "data/logs/import-$(date +%Y-%m).log" 2>&1
