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

rem plugins: mirror each source plugin folder individually into deploy (not
rem the whole plugins root) so plugins installed at runtime via the archive
rem installer - which only ever exist in DEPLOY, never in source - aren't
rem purged by /MIR. Skip .stewrd (dev-only type defs) and __host__ (host
rem settings storage.json) entirely. Exclude data/ and storage.json from each
rem plugin's mirror - those are runtime state (note.md, saved settings via
rem api.storage) that only exists in DEPLOY and must survive rebuilds.
for /d %%P in ("%REPO%plugins\*") do (
    if /I not "%%~nxP"==".stewrd" if /I not "%%~nxP"=="__host__" (
        robocopy "%%P" "%DEPLOY%\plugins\%%~nxP" /MIR /XD data /XF storage.json settings.json /NFL /NDL /NJH /NJS
        if errorlevel 8 (
            echo Plugin deploy failed: %%P
            exit /b 1
        )
    )
)

rem settings.json mixes a host-owned "version" field with user-editable
rem fields (category, Configure edits). Merge instead of copy or skip:
rem version always comes from source, everything else is preserved from
rem the existing deployed file.
call node "%REPO%scripts\merge-plugin-settings.mjs"
if errorlevel 1 (
    echo Plugin settings merge failed.
    exit /b 1
)

echo Done.
endlocal
