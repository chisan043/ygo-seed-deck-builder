import { syncOfflineBundles } from "./data-utils.mjs";

await syncOfflineBundles();
console.log("offline caches synced from JSON data");
