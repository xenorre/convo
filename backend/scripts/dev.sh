#!/usr/bin/env sh
set -e

if [ -f package-lock.json ]; then
  npm ci || npm install
else
  npm install
fi

exec npm run dev
