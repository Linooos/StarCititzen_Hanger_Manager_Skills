/**
 * RSI Ship Catalog Scraper CLI
 *
 * Clicks each manufacturer filter, scrapes all ships with prices and roles.
 *
 * Usage:
 *   node src/scrape-ships.js              # headed
 *   node src/scrape-ships.js --headless   # background
 */

const path = require("path");
const { launchContext } = require("./hangar");
const { scrapeAllShips, exportJSON, exportCSV } = require("./ships");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const OUTPUT_DIR = path.join(PROJECT_ROOT, "output");
const HEADLESS = process.argv.includes("--headless");

async function main() {
  const userDataDir = path.join(PROJECT_ROOT, "user_data");

  console.log("=".repeat(60));
  console.log("  RSI Ship Catalog Scraper");
  console.log("=".repeat(60));
  console.log(`  Mode: ${HEADLESS ? "headless" : "headed"}`);
  console.log();

  const { context, cleanup } = await launchContext(userDataDir, { headless: HEADLESS });

  let ships;
  try {
    console.log("--- Scraping by Manufacturer ---");
    ships = await scrapeAllShips(context);
  } finally {
    await cleanup();
  }

  const jsonPath = path.join(OUTPUT_DIR, "ships.json");
  exportJSON(ships, jsonPath);
  console.log(`\n[OK] JSON: ${jsonPath} (${ships.length} ships)`);

  const csvPath = path.join(OUTPUT_DIR, "ships.csv");
  exportCSV(ships, csvPath);
  console.log(`[OK] CSV : ${csvPath}`);

  const withPrice = ships.filter((s) => s.price > 0).length;
  const withMfr  = ships.filter((s) => s.manufacturer).length;
  const mfrs     = new Set(ships.filter((s) => s.manufacturer).map((s) => s.manufacturer));
  console.log(`\n  Prices: ${withPrice}/${ships.length}`);
  console.log(`  Manufacturers: ${withMfr}/${ships.length}`);
  console.log(`  Unique: ${mfrs.size}`);
  if (mfrs.size > 0) console.log(`    ${[...mfrs].sort().join(", ")}`);

  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
