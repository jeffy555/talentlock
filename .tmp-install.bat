@echo off
cd /d D:\Talent-Lock
"C:\Program Files\nodejs\node.exe" -v
"C:\Program Files\nodejs\npm.cmd" install -g pnpm@10
set PATH=%APPDATA%\npm;C:\Program Files\nodejs;%PATH%
pnpm install
