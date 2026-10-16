@echo off
rem 今晚吃啥 · 多智能体演播室 — start the local server (CosyVoice3 env) and open the browser.
cd /d "%~dp0.."
start "" http://127.0.0.1:8770/
"C:\Users\Bryan\anaconda3\envs\cosyvoice\python.exe" -m uvicorn server.app:app --app-dir agent-studio --host 127.0.0.1 --port 8770
pause
