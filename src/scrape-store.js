/** Pledge Store CLI */
const path = require("path");
const { launchContext, checkSession } = require("./hangar");
const { scrapeStore, exportJSON } = require("./store");

const ROOT = path.resolve(__dirname, ".."), OUT = path.join(ROOT, "output");
const HEADLESS = process.argv.includes("--headless");
const query = process.argv.slice(2).filter(a => !a.startsWith("--")).join(" ") || "";

async function main() {
  console.log("=".repeat(50) + "\n  Pledge Store Browser\n" + "=".repeat(50));
  if (query) console.log(`  Query: "${query}"`);
  const { context, cleanup } = await launchContext(path.join(ROOT, "user_data"), { headless: HEADLESS });
  if (!(await checkSession(context))) { console.log("Session expired — npm run login"); await cleanup(); process.exit(1); }
  let results;
  try { results = await scrapeStore(context, query); } finally { await cleanup(); }
  const all = results.flatMap(r => r.products);
  exportJSON(results, path.join(OUT, "store_products.json"));
  console.log(`\nDone: ${all.length} products across ${results.length} categories`);
}
main().catch(e => { console.error(e); process.exit(1); });
