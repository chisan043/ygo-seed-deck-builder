#!/bin/zsh
set -u

cd "$(dirname "$0")"

if [[ "${YGO_OFFLINE:-0}" != "1" ]]; then
  BUNDLED_NODE="/Users/chi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
  if [[ -x "$BUNDLED_NODE" ]] || command -v node >/dev/null 2>&1; then
    echo "Node.js found. Starting the local server with live refresh."
    echo "Set YGO_OFFLINE=1 to force cached static data."
    echo
    exec ./start-live-server.command
  fi
fi

PYTHON_BIN="$(command -v python3 || true)"
if [[ -z "$PYTHON_BIN" ]]; then
  echo "python3 was not found. Install Python 3 or run a local static server manually."
  echo
  echo "Manual fallback:"
  echo "  cd \"$(pwd)\""
  echo "  python3 -m http.server 5173 --bind 127.0.0.1"
  echo
  read -k "?Press any key to close..."
  exit 1
fi

START_PORT="${PORT:-5173}"
PORT="$("$PYTHON_BIN" - "$START_PORT" <<'PY'
import socket
import sys

start = int(sys.argv[1])
for port in range(start, start + 50):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        try:
            sock.bind(("127.0.0.1", port))
        except OSError:
            continue
        print(port)
        raise SystemExit(0)

raise SystemExit("No free port found.")
PY
)"

URL="http://127.0.0.1:${PORT}/index.html"

echo "Yu-Gi-Oh! Seed Deck Builder"
echo "Serving: $(pwd)"
echo "URL: ${URL}"
echo
echo "Keep this window open while using the site."
echo "Press Ctrl+C to stop the local server."
echo

open "$URL"
"$PYTHON_BIN" -m http.server "$PORT" --bind 127.0.0.1
