/**
 * RSI Hangar Scraper CLI
 *
 * Usage:
 *   node scrape.js               # headed mode
 *   node scrape.js --headless    # headless (background)
 *   node scrape.js --json-only   # only JSON output
 */

const path = require("path");
const { launchContext, scrapeAll, exportJSON, exportCSV, summarize } = require("./hangar");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const OUTPUT_DIR = path.join(PROJECT_ROOT, "output");
const HEADLESS = process.argv.includes("--headless");
const JSON_ONLY = process.argv.includes("--json-only");

async function main() {
  const userDataDir = path.join(PROJECT_ROOT, "user_data");

  console.log("=".repeat(60));
  console.log("  RSI Hangar Scraper");
  console.log("=".repeat(60));
  console.log(`  Mode: ${HEADLESS ? "headless" : "headed"}`);
  console.log();

  const { context, cleanup } = await launchContext(userDataDir, { headless: HEADLESS });

  let items;
  try {
    items = await scrapeAll(context, {
      concurrency: 4,
      onProgress: ({ category, items: count }) => {
        console.log(`[${category}] ${count} items`);
      },
    });
  } finally {
    await cleanup();
  }

  // Export
  const jsonPath = path.join(OUTPUT_DIR, "hangar_items.json");
  exportJSON(items, jsonPath);
  console.log(`\n[OK] JSON: ${jsonPath} (${items.length} items)`);

  if (!JSON_ONLY) {
    const csvPath = path.join(OUTPUT_DIR, "hangar_items.csv");
    exportCSV(items, csvPath);
    console.log(`[OK] CSV : ${csvPath} (${items.length} items)`);
  }

  // Summary
  const stats = summarize(items);
  console.log("\n--- Summary by Category ---");
  Object.entries(stats.byCategory).forEach(([cat, s]) => {
    console.log(`  ${cat}: ${s.count} items, $${s.totalValue.toFixed(2)}`);
  });
  console.log(`  Total: ${stats.totalItems} items, $${stats.totalValue.toFixed(2)}`);

  console.log("\n--- CCU Precompute ---");
  try { require("./ccu").precompute(PROJECT_ROOT); } catch(e) { console.log(`  [CCU] ${e.message}`); }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});