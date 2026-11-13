#!/bin/sh
# Builds both copies from src/:
#   dist/index.html + dist/app.js  -> the claude.ai page (published as an artifact)
#   index.html                     -> the hosted copy, one file, served by GitHub Pages
set -e
cd "$(dirname "$0")"

# Where people meet. The claude.ai page cannot connect visitors who come by link, so it points here.
MEET_URL="https://kim950106.github.io/jiujitsu-metaverse/"

mkdir -p dist
npx esbuild src/main.js --bundle --format=iife --target=es2018 --minify --outfile=dist/app.js --log-level=warning
sed "s#<meta name=\"bjj-meet\" content=\"\">#<meta name=\"bjj-meet\" content=\"$MEET_URL\">#" src/page.html > dist/index.html
grep -q "name=\"bjj-meet\" content=\"$MEET_URL\"" dist/index.html
node build-web.mjs
ls -la dist index.html
