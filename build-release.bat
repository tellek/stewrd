@echo off
setlocal

set REPO=%~dp0
set DEPLOY=C:\Utilities\stewrd
set RELEASE=%REPO%src-tauri\target\release

echo Closing running stewrd...
taskkill /IM stewrd.exe /F >nul 2>&1

cd /d "%REPO%"

echo Building plugin bundles...
for /d %%P in ("%REPO%plugins\*") do (
    if exist "%%P\index.tsx" call :buildplugin "%%P"
    if exist "%%P\index.ts" call :buildplugin "%%P"
    if exist "%%P\index.jsx" call :buildplugin "%%P"
    if exist "%%P\index.js" call :buildplugin "%%P"
)
goto :afterplugins

:buildplugin
call npm run plugin:build -- %1
if errorlevel 1 (
    echo Plugin build failed: %1
    exit /b 1
)
exit /b 0

:afterplugins

rem stages a filtered copy of the plugins that ship bundled in the installer
rem (see tauri.conf.json's bundle.resources) - must run after plugin builds
rem above (needs dist/index.js) and before tauri build below.
call node "%REPO%scripts\stage-bundled-plugins.mjs"
if errorlevel 1 (
    echo Plugin staging failed.
    exit /b 1
)

echo Building release...
call npx tauri build
if errorlevel 1 (
    echo Build failed.
    exit /b 1
)

echo Deploying to %DEPLOY%...
if not exist "%DEPLOY%" mkdir "%DEPLOY%"

rem everything except build artifacts and the user-customizable assets dir
robocopy "%RELEASE%" "%DEPLOY%" /E /XF *.pdb *.lib *.exp *.rlib /XD deps build incremental .fingerprint examples wix nsis bundle assets /NFL /NDL /NJH /NJS
if %errorlevel% geq 8 (
    echo Deploy copy failed.
    exit /b 1
)

rem assets (category icons etc.): only add files the user doesn't already have,
rem never touch existing files (icons the user may have customized)
robocopy "%RELEASE%\assets" "%DEPLOY%\assets" /E /XC /XN /XO /NFL /NDL /NJH /NJS
if %errorlevel% geq 8 (
    echo Asset deploy failed.
    exit /b 1
)

rem plugins: mirror source into deploy, excluding .stewrd and __host__ (host settings storage.json), replacing everything else
robocopy "%REPO%plugins" "%DEPLOY%\plugins" /MIR /XD .stewrd __host__ /NFL /NDL /NJH /NJS
if %errorlevel% geq 8 (
    echo Plugin deploy failed.
    exit /b 1
)

echo Done.
endlocal
