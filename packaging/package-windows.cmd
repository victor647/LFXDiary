@echo off
setlocal

cd /d "%~dp0.."

echo.
echo Diary Book Windows packaging
echo ============================
echo.

set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
set ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/
set npm_config_fetch_retries=5
set npm_config_fetch_retry_factor=2
set npm_config_fetch_retry_mintimeout=20000
set npm_config_fetch_retry_maxtimeout=120000
set npm_config_audit=false
set npm_config_fund=false

call :ensure_dependencies
if errorlevel 1 goto install_fail

echo Building Windows installer and zip...
call npm.cmd run desktop:dist:win
if errorlevel 1 goto fail

echo.
echo Done.
echo Output folder:
echo %cd%\dist
echo.
pause
exit /b 0

:fail
echo.
echo Packaging failed. See the error above.
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
echo 3. If Electron download keeps failing, check your network or proxy. This script already uses:
echo    ELECTRON_MIRROR=%ELECTRON_MIRROR%
echo    ELECTRON_BUILDER_BINARIES_MIRROR=%ELECTRON_BUILDER_BINARIES_MIRROR%
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
if not exist node_modules\.bin\electron.cmd goto repair_dependencies
if not exist node_modules\.bin\electron-builder.cmd goto repair_dependencies

exit /b 0

:repair_dependencies
echo node_modules exists, but required build commands are missing.
echo Running npm install to repair dependencies...
call :install_dependencies
if errorlevel 1 exit /b 1

if not exist node_modules\.bin\tsc.cmd exit /b 1
if not exist node_modules\.bin\vite.cmd exit /b 1
if not exist node_modules\.bin\electron.cmd exit /b 1
if not exist node_modules\.bin\electron-builder.cmd exit /b 1

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
