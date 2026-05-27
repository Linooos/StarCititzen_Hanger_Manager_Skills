/**
 * RSI Hangar Scraper CLI
 *
 * Usage:
 *   node scrape.js               # headed mode
 *   node scrape.js --headless    # headless (background)
 *   node scrape.js --json-only   # only JSON output
 *   node scrape.js --force       # force re-scrape even if data exists
 */

const path = require("path");
const fs = require("fs");
const { launchContext, checkSession, scrapeAll, exportJSON, exportCSV, summarize } = require("./hangar");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const OUTPUT_DIR = path.join(PROJECT_ROOT, "output");
const HEADLESS = process.argv.includes("--headless");
const JSON_ONLY = process.argv.includes("--json-only");
const FORCE = process.argv.includes("--force");

async function main() {
  const userDataDir = path.join(PROJECT_ROOT, "user_data");
  const outFile = path.join(OUTPUT_DIR, "hangar_items.json");

  // 数据已存在则跳过 / Skip if data exists
  if (!FORCE && fs.existsSync(outFile)) {
    const items = JSON.parse(fs.readFileSync(outFile, "utf-8"));
    const stats = summarize(items);
    console.log("=".repeat(60));
    console.log("  Hangar data already exists — skipping scrape");
    console.log(`  ${items.length} items, ${stats.totalItems} total, $${stats.totalValue.toFixed(2)}`);
    console.log("  Use --force to re-scrape");
    console.log("=".repeat(60));
    return;
  }

  console.log("=".repeat(60));
  console.log("  RSI Hangar Scraper");
  console.log("=".repeat(60));
  console.log(`  Mode: ${HEADLESS ? "headless" : "headed"}`);
  console.log();

  const { context, cleanup } = await launchContext(userDataDir, { headless: HEADLESS });

  // 检查会话 / Check session
  const sessionOk = await checkSession(context);
  if (!sessionOk) {
    console.log("\n⚠️  Session expired. Please re-login:");
    console.log("  npm run login\n");
    await cleanup();
    process.exit(1);
  }

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

  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
