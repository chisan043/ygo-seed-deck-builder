import { syncTrendCatalog } from "./trend-catalog.mjs";
import { getOfficialCardLocale } from "./serve-with-refresh.mjs";

console.log("Trend catalog updated:", await syncTrendCatalog({ officialLocale: getOfficialCardLocale }));
