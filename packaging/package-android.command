#!/bin/bash
set -e

cd "$(dirname "$0")/.."

echo
echo "Diary Book Android packaging"
echo "============================"
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

echo "Syncing web assets to Android project..."
npm run android:sync

echo
echo "Android project is ready in android/"
echo "To build the APK, open Android Studio:"
echo "  File > Open... > select \"$(pwd)/android\" folder"
echo
echo "Or build from command line:"
echo "  cd android"
echo "  ./gradlew assembleDebug          (debug APK)"
echo "  ./gradlew assembleRelease        (release APK)"
echo "  ./gradlew bundleRelease          (AAB for Play Store)"
echo
echo "Output folder:"
echo "  $(pwd)/android/app/build/outputs"
echo
read -r -p "Press Return to close..."
