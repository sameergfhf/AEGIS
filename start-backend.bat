@echo off
echo Starting AEGIS API Sentinel Backend on http://127.0.0.1:8000 ...
cd /d "%~dp0backend"
win_venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
pause
