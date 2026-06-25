import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const mainPath = path.join(root, "electron", "main.cjs");
const source = fs.readFileSync(mainPath, "utf8");

const match = source.match(/async function openAutoMode\(\) \{([\s\S]*?)\n\}/);
assert.ok(match, "openAutoMode should exist in electron/main.cjs");

const body = match[1];
assert.ok(
  body.includes("openLiveMode({ silentFallback: true })"),
  "automatic mode should attempt the local live refresh service",
);
assert.ok(
  !body.includes("hasNetworkAccess"),
  "automatic mode must not skip live refresh because a short external connectivity probe failed",
);

console.log("electron auto mode starts the local live refresh service directly");
