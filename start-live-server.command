#!/bin/zsh
set -u

cd "$(dirname "$0")"

BUNDLED_NODE="/Users/chi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
if [[ -x "$BUNDLED_NODE" ]]; then
  NODE_BIN="$BUNDLED_NODE"
else
  NODE_BIN="$(command -v node || true)"
fi

if [[ -z "$NODE_BIN" ]]; then
  echo "Node.js was not found."
  echo "Use start-local-server.command for cached static data, or install Node.js to refresh live data."
  echo
  read -k "?Press any key to close..."
  exit 1
fi

START_PORT="${PORT:-5173}"
PORT="$("$NODE_BIN" - "$START_PORT" <<'JS'
const net = require("node:net");
const start = Number(process.argv[2] || 5173);

function canUse(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => server.close(() => resolve(true)));
    server.listen(port, "127.0.0.1");
  });
}

(async () => {
  for (let port = start; port < start + 50; port += 1) {
    if (await canUse(port)) {
      console.log(port);
      return;
    }
  }
  process.exitCode = 1;
})();
JS
)"

if [[ -z "$PORT" ]]; then
  echo "No free port found."
  read -k "?Press any key to close..."
  exit 1
fi

URL="http://127.0.0.1:${PORT}/index.html?api=1"

echo "Yu-Gi-Oh! Seed Deck Builder live refresh server"
echo "Serving: $(pwd)"
echo "URL: ${URL}"
echo
echo "This mode can refresh live data from external sources."
echo "Keep this window open while using the site."
echo "Press Ctrl+C to stop the local server."
echo

open "$URL"
PORT="$PORT" "$NODE_BIN" tools/serve-with-refresh.mjs
