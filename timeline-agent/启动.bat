@echo off
chcp 65001 >nul
title 小说时间线助手
echo ============================================
echo     小说时间线助手 - 启动中...
echo ============================================
echo.
echo [1] 前端: http://localhost:5173
echo [2] 后端: http://localhost:3001
echo.
echo 按 Ctrl+C 停止服务
echo ============================================
echo.
npm run dev:all
pause
