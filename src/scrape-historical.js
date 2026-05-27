/** Historical CCU Scraper CLI */
const path = require("path"), fs = require("fs");
const { launchContext } = require("./hangar");
const { scrapeFullHistory, exportJSON, getCacheMetadata } = require("./historical-ccu");

const ROOT = path.resolve(__dirname, ".."), OUT = path.join(ROOT, "output");
const FORCE = process.argv.includes("--force");
const HEADLESS = process.argv.includes("--headless");
const CONCURRENCY = parseInt(process.argv.find(a => a.startsWith("--concurrency="))?.split("=")[1] || "6", 10);

async function main() {
  const outFile = path.join(OUT, "cache", "historical_ccus.json");
  const meta = getCacheMetadata(ROOT);

  if (!FORCE && meta.exists) {
    console.log(`Historical CCU cache exists: ${meta.shipCount} ships`);
    if (meta.dateRange) {
      console.log(`  Date range: ${meta.dateRange.earliestDate} ~ ${meta.dateRange.latestDate}`);
    }
    if (meta.totalWbEntries) console.log(`  WB entries: ${meta.totalWbEntries}`);
    console.log("  Use --force to re-scrape");
    return;
  }

  console.log("=".repeat(55) + "\n  Historical CCU Scraper (scorg.tools)\n" + "=".repeat(55));
  console.log(`  Mode: ${HEADLESS ? "headless" : "headed"} | Concurrency: ${CONCURRENCY}`);
  console.log("  Target: ~237 ships\n");

  const { context, cleanup } = await launchContext(
    path.join(ROOT, "user_data"),
    { headless: HEADLESS }
  );

  const startTime = Date.now();
  let lastWb = 0, lastWbShips = 0;

  let result;
  try {
    result = await scrapeFullHistory(context, {
      concurrency: CONCURRENCY,
      onProgress: ({ current, total, shipName, wbShips, wbEntries }) => {
        lastWbShips = wbShips;
        lastWb = wbEntries;
        const pct = ((current / total) * 100).toFixed(0);
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
        const rate = current > 0 ? (elapsed / current).toFixed(1) : "0";
        process.stdout.write(`\r  [${String(current).padStart(3)}/${total}] ${pct}% | WB: ${wbShips}艘/${wbEntries}条 | ${elapsed}s (${rate}s/艘) | ${shipName?.substring(0,25) || ""}${" ".repeat(15)}`);
      },
    });
  } finally {
    await cleanup();
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
  console.log(`\n\n  抓取完成: ${elapsed}s`);

  exportJSON(result, outFile);
  try { require("./cache-meta").touch(ROOT, "historical_ccus.json", "scrape:historical"); } catch (_) {}
  const shipCount = result.filter(s => !s._metadata).length;
  const shipsWithWB = result.filter(s => s.history && s.history.some(e => e.status === "Warbond")).length;
  console.log(`  Ships: ${shipCount} | WB ships: ${shipsWithWB} | WB entries: ${result.reduce((s, ship) => s + (ship.history || []).filter(e => e.status === "Warbond").length, 0)}`);
  console.log(`  Exported to: ${outFile}`);
}

main().catch(e => { console.error(e); process.exit(1); });
