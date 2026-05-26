/**
 * RSI Ship Catalog Scraper CLI / 星际公民船只目录爬取
 *
 * 双数据源：Ship Matrix (URLs) + Pledge Store (Prices)
 * Usage: node src/scrape-ships.js [--headless] [--force]
 */
const path = require("path");
const fs = require("fs");
const { launchContext, checkSession } = require("./hangar");
const { scrapeAllShips, exportJSON, exportCSV } = require("./ships");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const OUTPUT_DIR = path.join(PROJECT_ROOT, "output");
const HEADLESS = process.argv.includes("--headless");
const FORCE = process.argv.includes("--force");

async function main() {
  const userDataDir = path.join(PROJECT_ROOT, "user_data");
  const outFile = path.join(OUTPUT_DIR, "ships.json");

  // 数据已存在则跳过 / Skip if data exists
  if (!FORCE && fs.existsSync(outFile)) {
    const ships = JSON.parse(fs.readFileSync(outFile, "utf-8"));
    const priced = ships.filter(s => s.price > 0).length;
    console.log("=".repeat(60));
    console.log("  Ship catalog already exists — skipping scrape");
    console.log(`  ${ships.length} ships, ${priced} with prices`);
    console.log("  Use --force to re-scrape");
    console.log("=".repeat(60));
    return;
  }
  console.log("=".repeat(60));
  console.log("  RSI Ship Catalog Scraper (Matrix + Store)");
  console.log("=".repeat(60));
  console.log(`  Mode: ${HEADLESS ? "headless" : "headed"}`);
  console.log();

  const { context, cleanup } = await launchContext(userDataDir, { headless: HEADLESS });

  // 检查会话 / Check session
  const sessionOk = await checkSession(context);
  if (!sessionOk) {
    console.log("\n⚠️  Session expired. Please re-login: npm run login\n");
    await cleanup();
    process.exit(1);
  }

  let ships;
  try { ships = await scrapeAllShips(context); } finally { await cleanup(); }

  const jsonPath = path.join(OUTPUT_DIR, "ships.json");
  exportJSON(ships, jsonPath);
  console.log(`\n[OK] JSON: ${jsonPath} (${ships.length} ships)`);

  const csvPath = path.join(OUTPUT_DIR, "ships.csv");
  exportCSV(ships, csvPath);
  console.log(`[OK] CSV : ${csvPath}`);

  const priced = ships.filter(s => s.price > 0).length;
  console.log(`\n  Priced: ${priced}/${ships.length}`);
  console.log("Done.");
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
