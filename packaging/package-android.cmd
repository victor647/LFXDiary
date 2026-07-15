@echo off
setlocal

cd /d "%~dp0.."

echo.
echo Diary Book Android packaging
echo ===========================
echo.

call :ensure_dependencies
if errorlevel 1 goto install_fail

echo Syncing web assets to Android project...
call npm.cmd run android:sync
if errorlevel 1 goto fail

echo.
echo Android project is ready in android/
echo To build the APK, open Android Studio:
echo   File ^> Open... ^> select "%cd%\android" folder
echo.
echo Or build from command line:
echo   cd android
echo   .\gradlew assembleDebug           ^(debug APK^)
echo   .\gradlew assembleRelease         ^(release APK^)
echo   .\gradlew bundleRelease           ^(AAB for Play Store^)
echo.
echo Output folder:
echo   %cd%\android\app\build\outputs
echo.
pause
exit /b 0

:fail
echo.
echo Android sync failed. See the error above.
echo Common fixes:
echo 1. Make sure Android Studio and the Android SDK are installed.
echo 2. Set ANDROID_HOME to the Android SDK location.
echo 3. Run "npx cap doctor" to verify your Capacitor setup.
echo 4. Make sure Java 17+ is installed and on your PATH.
echo.
pause
exit /b 1

:install_fail
echo.
echo Dependency installation failed.
echo.
echo Common fixes:
echo 1. Run this project from a local drive such as C:\Development instead of a network or mapped drive.
echo 2. If node_modules was partially created, close editors and terminals, delete only node_modules, keep package-lock.json, then run this script again.
echo.
pause
exit /b 1

:ensure_dependencies
if not exist node_modules (
  echo node_modules not found. Running npm install first...
  call :install_dependencies
  if errorlevel 1 exit /b 1
  echo.
)

if not exist node_modules\.bin\tsc.cmd goto repair_dependencies
if not exist node_modules\.bin\vite.cmd goto repair_dependencies

exit /b 0

:repair_dependencies
echo node_modules exists, but required build commands are missing.
echo Running npm install to repair dependencies...
call :install_dependencies
if errorlevel 1 exit /b 1

if not exist node_modules\.bin\tsc.cmd exit /b 1
if not exist node_modules\.bin\vite.cmd exit /b 1

echo Dependencies are ready.
echo.
exit /b 0

:install_dependencies
call npm.cmd install
if not errorlevel 1 exit /b 0

echo.
echo npm install failed. Verifying npm cache and retrying once...
call npm.cmd cache verify
timeout /t 5 /nobreak >nul
call npm.cmd install
exit /b %errorlevel%
