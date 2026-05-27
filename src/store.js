/**
 * Pledge Store Browser / 网页商店浏览
 * Scrapes categories on-demand based on user query.
 */
const { launchContext } = require("./hangar");
const fs = require("fs"), path = require("path");
const BASE = "https://robertsspaceindustries.com/en";

// 9 categories / 9 个分类
const CATEGORIES = [
  { name: "Starter Packs",       url: "/store/pledge/browse/game-packages" },
  { name: "Subscriber Store",    url: "/store/pledge/browse/extras/subscribers-store" },
  { name: "Ships and Vehicles",  url: "/store/pledge/browse/extras/standalone-ships" },
  { name: "Paints",              url: "/store/pledge/browse/paints" },
  { name: "Packs",               url: "/store/pledge/browse/extras/packs" },
  { name: "Digital Gear",        url: "/store/pledge/browse/extras/gear" },
  { name: "Physical Merchandise",url: "/store/pledge/browse/merchandise" },
  { name: "Add-Ons",             url: "/store/pledge/browse/extras/add-ons" },
  { name: "Gift Cards",          url: "/store/pledge/browse/extras/gift-cards" },
];

async function pool(n, tasks, fn) {
  const r = [], e = new Set();
  for (const t of tasks) { const p = Promise.resolve().then(() => fn(t)); r.push(p); e.add(p); p.finally(() => e.delete(p)); if (e.size >= n) await Promise.race(e); }
  return Promise.all(r);
}

// Scrape one category page → products
async function scrapeCategory(context, cat) {
  const products = [];
  const page = await context.newPage();
  try {
    let pg = 1;
    while (true) {
      const url = `${BASE}${cat.url}?page=${pg}`;
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(3000);
      const items = await page.evaluate((catName) => {
        const grid = document.querySelector(".browsePage-cardStack__grid");
        if (!grid) return [];
        return Array.from(grid.querySelectorAll("a.c-skuCard__anchor")).map(a => {
          const text = a.textContent.replace(/\s+/g, " ").trim();
          const m = text.match(/\$([\d,]+(?:\.\d{2})?)/);
          const tags = [];
          if (/warbond/i.test(text)) tags.push("Warbond");
          if (/limited stock/i.test(text)) tags.push("Limited Stock");
          if (/out of stock/i.test(text)) tags.push("Out of Stock");
          if (/concept/i.test(text)) tags.push("Concept");
          const name = text.replace(/\$[\d,.]+(\s*USD)?/g, "").replace(/Limited Stock|Warbond|Out of Stock|Concept|Standalone Ships|In Stock/gi, "").trim().substring(0, 80);
          return {
            name, category: catName,
            price: m ? parseFloat(m[1].replace(/,/g, "")) : 0,
            url: a.getAttribute("href") || "",
            tags, stock: tags.includes("Out of Stock") ? "Out" : tags.includes("Limited Stock") ? "Limited" : "In",
          };
        }).filter(p => p.name);
      }, cat.name);
      if (items.length === 0) break;
      products.push(...items);
      // Check more pages
      const maxPg = await page.evaluate(() => {
        let m = 1; document.querySelectorAll(".orion-c-pagination__link").forEach(l => { const n = parseInt(l.textContent); if (n > m) m = n; }); return m;
      });
      if (pg >= maxPg) break;
      pg++;
    }
  } finally { await page.close(); }
  return { category: cat.name, products };
}

// Main: scrape categories based on user query
async function scrapeStore(context, query) {
  // LLM selects categories — here we just scrape all if no filter
  const targets = query
    ? CATEGORIES.filter(c => {
        const q = query.toLowerCase();
        return c.name.toLowerCase().includes(q) || q.split(/\s+/).some(w => c.name.toLowerCase().includes(w));
      })
    : CATEGORIES;

  if (targets.length === 0) targets.push(...CATEGORIES.slice(0, 5));

  console.log(`  Categories: ${targets.map(c=>c.name).join(", ")}`);

  const results = [];
  for (const cat of targets) {
    const r = await scrapeCategory(context, cat);
    results.push(r);
    console.log(`  [${r.category}] ${r.products.length} products`);
  }
  return results;
}

function exportJSON(data, fp) { fs.writeFileSync(fp, JSON.stringify(data, null, 2)); }

module.exports = { CATEGORIES, scrapeStore, scrapeCategory, exportJSON };
