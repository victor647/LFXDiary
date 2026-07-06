#!/bin/bash
set -e

cd "$(dirname "$0")/.."

echo
echo "Diary Book macOS packaging"
echo "=========================="
echo

if ! command -v npm >/dev/null 2>&1; then
  echo "npm was not found. Install Node.js first, then run this script again."
  echo
  read -r -p "Press Return to close..."
  exit 1
fi

if [ ! -d "node_modules" ]; then
  echo "node_modules not found. Running npm install first..."
  npm install
  echo
fi

echo "Building Intel x64 macOS app, DMG, and ZIP..."
npm run desktop:dist:mac

echo
echo "Done."
echo "Output folder:"
echo "$(pwd)/release"
echo
read -r -p "Press Return to close..."
