@echo off
setlocal EnableExtensions DisableDelayedExpansion

set "CONFIG_FILE=%~dp0maa-curl.env"
if not exist "%CONFIG_FILE%" (
  echo [Skyland] Missing config: "%CONFIG_FILE%"
  echo [Skyland] Copy maa-curl.env.example to maa-curl.env and fill in your values.
  exit /b 2
)

for /f "usebackq tokens=1,* delims==" %%A in ("%CONFIG_FILE%") do (
  if /i "%%A"=="WORKER_URL" set "WORKER_URL=%%B"
  if /i "%%A"=="WORKER_AUTH" set "WORKER_AUTH=%%B"
  if /i "%%A"=="SKLAND_TOKEN" set "SKLAND_TOKEN=%%B"
)

if not defined WORKER_URL goto :invalid_config
if not defined WORKER_AUTH goto :invalid_config
if not defined SKLAND_TOKEN goto :invalid_config

echo [Skyland] Starting check-in...
powershell.exe -NoProfile -NonInteractive -Command "[Console]::Out.Write((@{token=$env:SKLAND_TOKEN} | ConvertTo-Json -Compress))" | curl.exe --fail-with-body --silent --show-error --request POST "%WORKER_URL%" --header "Authorization: Bearer %WORKER_AUTH%" --header "Content-Type: application/json" --data-binary @-
set "CURL_EXIT=%ERRORLEVEL%"
echo.

if not "%CURL_EXIT%"=="0" (
  echo [Skyland] Check-in request failed with curl exit code %CURL_EXIT%.
  exit /b %CURL_EXIT%
)

echo [Skyland] Check-in request completed.
exit /b 0

:invalid_config
echo [Skyland] WORKER_URL, WORKER_AUTH, and SKLAND_TOKEN are required in "%CONFIG_FILE%".
exit /b 2
