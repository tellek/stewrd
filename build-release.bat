@echo off
setlocal

set REPO=%~dp0
set DEPLOY=C:\Utilities\stewrd
set RELEASE=%REPO%src-tauri\target\release

echo Closing running stewrd...
taskkill /IM stewrd.exe /F >nul 2>&1

echo Building release...
cd /d "%REPO%"
call npx tauri build
if errorlevel 1 (
    echo Build failed.
    exit /b 1
)

echo Deploying to %DEPLOY% (preserving stewrd.config.json, notes, and rules/settings-suggestions data)...
if not exist "%DEPLOY%" mkdir "%DEPLOY%"
robocopy "%RELEASE%" "%DEPLOY%" /E /XF stewrd.config.json notes.txt notes.stewrd-state.json *.pdb *.lib *.exp *.rlib /XD deps build incremental .fingerprint examples wix nsis bundle rules-suggestions settings-suggestions /NFL /NDL /NJH /NJS
if %errorlevel% geq 8 (
    echo Deploy copy failed.
    exit /b 1
)

echo Relaunching stewrd from %DEPLOY%...
start "" "%DEPLOY%\stewrd.exe"

echo Done.
endlocal
