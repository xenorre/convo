#!/usr/bin/env sh
set -e

if [ ! -f .env ]; then
  if [ -f .env.example ]; then
    cp .env.example .env
    echo "Created .env from .env.example"
  else
    echo "No .env.example found; please create .env manually"
  fi
fi

npm install
npm run dev
