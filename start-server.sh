#!/usr/bin/env bash
# ============================================================
#  Dot M Futsal - local server launcher
#  macOS / Linux
# ============================================================
set -e
cd "$(dirname "$0")"

PORT=5173
URL="http://localhost:$PORT"

echo ""
echo "  Dot M Futsal - starting local server..."
echo "  URL: $URL"
echo ""

# The server needs a moment to bind the port. Opening the browser before then
# lands on an "unable to connect" error page, so wait for a real response.
wait_for_server() {
  for _ in $(seq 1 90); do
    if command -v curl >/dev/null 2>&1; then
      curl -fs -o /dev/null "$URL" && return 0
    else
      (exec 3<>"/dev/tcp/127.0.0.1/$PORT") 2>/dev/null && return 0
    fi
    sleep 0.25
  done
  return 1
}

open_browser() {
  if command -v open >/dev/null 2>&1; then open "$URL"
  elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL"
  fi
}

if command -v python3 >/dev/null 2>&1; then
  ( wait_for_server && open_browser ) &
  python3 -m http.server "$PORT" --bind 127.0.0.1
elif command -v npx >/dev/null 2>&1; then
  ( wait_for_server && open_browser ) &
  npx --yes serve -l "$PORT" .
else
  echo "  No Python or Node.js found. Just open index.html instead."
  open_browser >/dev/null 2>&1 || xdg-open index.html
fi
