@echo off
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "pnpm run build; if (Test-Path out) { Remove-Item out -Recurse -Force }; New-Item -ItemType Directory -Path out/decky-game-settings-fork -Force | Out-Null; Copy-Item plugin.json,package.json,LICENSE,README.md,main.py,decky.pyi out/decky-game-settings-fork; Copy-Item -Recurse dist out/decky-game-settings-fork/dist; tar -a -c -f out/decky-game-settings-fork-local.zip -C out decky-game-settings-fork; tar -czf out/decky-game-settings-fork-local.tar.gz -C out decky-game-settings-fork"
endlocal
