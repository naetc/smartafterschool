@echo off
set "PATH=C:\Program Files\nodejs;%PATH%"
cd /d "%~dp0.."
"C:\Program Files\nodejs\npx.cmd" --yes serve -l 8420 .
