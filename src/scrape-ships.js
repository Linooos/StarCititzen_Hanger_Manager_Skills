/** Ship Catalog CLI */
const path = require("path"), fs = require("fs");
const { launchContext, checkSession } = require("./hangar");
const { scrapeAllShips, exportJSON, exportCSV } = require("./ships");

const ROOT = path.resolve(__dirname, ".."), OUT = path.join(ROOT, "output");
const FORCE = process.argv.includes("--force");
const HEADLESS = process.argv.includes("--headless");

async function main() {
  const dir = path.join(ROOT, "user_data");
  const out = path.join(OUT, "cache", "ships.json");
  if (!FORCE && fs.existsSync(out)) {
    const ships = JSON.parse(fs.readFileSync(out, "utf-8"));
    console.log(`Ships exist: ${ships.length}, ${ships.filter(s=>s.price).length} priced. --force to re-scrape`);
    return;
  }
  console.log("=".repeat(50) + "\n  Ship Catalog Scraper\n" + "=".repeat(50));
  const { context, cleanup } = await launchContext(dir, { headless: HEADLESS });
  if (!(await checkSession(context))) { console.log("Session expired — npm run login"); await cleanup(); process.exit(1); }
  let ships;
  try { ships = await scrapeAllShips(context); } finally { await cleanup(); }
  exportJSON(ships, path.join(OUT, "cache", "ships.json"));
  try { require("./cache-meta").touch(ROOT, "ships.json", "scrape:ships"); } catch (_) {}
  exportCSV(ships, path.join(OUT, "ships.csv"));
  console.log(`\nDone: ${ships.length} ships, ${ships.filter(s=>s.price).length} priced`);
}
main().catch(e => { console.error(e); process.exit(1); });
