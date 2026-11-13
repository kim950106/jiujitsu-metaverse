#!/bin/sh
# Builds both copies from src/:
#   dist/index.html + dist/app.js  -> the claude.ai page (published as an artifact)
#   index.html                     -> the hosted copy, one file, served by GitHub Pages
set -e
cd "$(dirname "$0")"
mkdir -p dist
npx esbuild src/main.js --bundle --format=iife --target=es2018 --minify --outfile=dist/app.js --log-level=warning
cp src/page.html dist/index.html
node build-web.mjs
ls -la dist index.html
