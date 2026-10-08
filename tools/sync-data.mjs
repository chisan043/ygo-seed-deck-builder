import { refreshAllData } from "./serve-with-refresh.mjs";

const result = await refreshAllData({ force: process.argv.includes("--force") });
if (result.failures.length) {
  console.error(`Data update incomplete:\n${result.failures.join("\n")}`);
  process.exitCode = 1;
} else console.log("All data sources and offline caches updated successfully.");
