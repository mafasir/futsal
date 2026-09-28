@echo off
setlocal
REM ==========================================================
REM  Dot M Futsal - local server launcher
REM  Starts a local server, waits until it is really up,
REM  and only then opens the browser.
REM ==========================================================

set PORT=5173
set URL=http://localhost:%PORT%

echo.
echo   Dot M Futsal - starting local server...
echo   URL: %URL%
echo.

where python >nul 2>nul
if not %errorlevel%==0 goto :trynode

start "Dot M Futsal server" /min python -m http.server %PORT% --bind 127.0.0.1
goto :wait

:trynode
where node >nul 2>nul
if %errorlevel%==0 (
  start "Dot M Futsal server" /min npx --yes serve -l %PORT% .
  goto :wait
)

echo   ERROR: neither Python nor Node.js was found on this computer.
echo   No problem - you can simply double-click index.html instead.
echo.
pause
exit /b 1

:wait
REM The server needs a moment to bind the port. Opening the browser before
REM then shows an "this site can't be reached" error page, so poll first.
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$deadline=90; while($deadline -gt 0){ try{ $c=New-Object Net.Sockets.TcpClient; $c.Connect('127.0.0.1',%PORT%); $c.Close(); exit 0 }catch{ Start-Sleep -Milliseconds 250; $deadline-- } }; exit 1"

if errorlevel 1 (
  echo   ERROR: the server did not start within about 22 seconds.
  echo   Close the "Dot M Futsal server" window and try again.
  echo.
  pause
  exit /b 1
)

start "" "%URL%"

echo   Server is running and the browser has been opened.
echo   To stop the server, close the "Dot M Futsal server" window.
echo.
endlocal
