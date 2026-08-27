import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const localCommand = fs.readFileSync(path.join(root, "start-local-server.command"), "utf8");
const localBat = fs.readFileSync(path.join(root, "start-local-server.bat"), "utf8");
const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");

assert.ok(
  localCommand.includes("YGO_OFFLINE") && localCommand.includes("start-live-server.command"),
  "macOS local startup should prefer live refresh and keep an explicit offline fallback",
);
assert.ok(
  localBat.includes("YGO_OFFLINE") && localBat.includes("start-live-server.bat"),
  "Windows local startup should prefer live refresh and keep an explicit offline fallback",
);
assert.ok(
  readme.includes("start-local-server.command") && readme.includes("YGO_OFFLINE=1"),
  "README should document the local startup live-first behavior and offline override",
);

console.log("local startup mode checks passed");
