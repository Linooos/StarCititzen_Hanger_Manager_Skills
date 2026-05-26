/**
 * Ship Catalog / 船只目录
 * Matrix → URLs, Store → prices via pagination
 */
const { launchContext } = require("./hangar");
const fs = require("fs"), path = require("path");
const MATRIX = "https://robertsspaceindustries.com/en/ship-matrix";
const STORE  = "https://robertsspaceindustries.com/en/pledge/ships?sortField=name&sortDirection=asc";

async function pool(n, tasks, fn) {
  const r = [], e = new Set();
  for (const t of tasks) { const p = Promise.resolve().then(() => fn(t)); r.push(p); e.add(p); p.finally(() => e.delete(p)); if (e.size >= n) await Promise.race(e); }
  return Promise.all(r);
}

// Source 1: Matrix → all ship URLs
async function fromMatrix(page) {
  await page.goto(MATRIX, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(8000);
  return page.evaluate(() => {
    const s = new Set();
    return [...document.querySelectorAll('#statsapp a[href*="/pledge/ships/"]')]
      .map(a => a.getAttribute("href"))
      .filter(h => s.has(h) ? false : (s.add(h), true))
      .map(href => {
        const p = href.replace("/pledge/ships/", "").split("/");
        return { href, name: p[p.length-1], series: p[0], price: 0, url: "https://robertsspaceindustries.com" + href };
      });
  });
}

// Source 2: Store pagination → prices
async function fromStore(context) {
  const p1 = await context.newPage();
  await p1.goto(STORE, { waitUntil: "domcontentloaded", timeout: 30000 });
  await p1.waitForTimeout(5000);
  const total = await p1.evaluate(() => {
    let m = 1; document.querySelectorAll(".orion-c-pagination__link").forEach(l => { const n = parseInt(l.textContent); if (n > m) m = n; }); return m;
  });
  await p1.close();
  console.log(`  Store pages: ${total}`);

  const pages = Array.from({ length: total }, (_, i) => i + 1);
  const chunks = await pool(4, pages, async pg => {
    const p = await context.newPage();
    try {
      await p.goto(`${STORE}&page=${pg}`, { waitUntil: "domcontentloaded", timeout: 30000 });
      await p.waitForTimeout(3000);
      return await p.evaluate(() => {
        const grid = document.querySelector(".shipsList-cardStack__grid");
        return grid ? [...grid.children].map(c => {
          const a = c.querySelector("a");
          const m = c.textContent.match(/\$([\d,]+(?:\.\d{2})?)\s*USD/);
          return { href: a?.getAttribute("href") || "", price: m ? parseFloat(m[1].replace(/,/g, "")) : 0 };
        }) : [];
      });
    } catch { return []; }
    finally { await p.close(); }
  });

  const map = {};
  chunks.flat().forEach(s => { if (s.href && s.price && !map[s.href]) map[s.href] = s.price; });
  console.log(`  Priced from store: ${Object.keys(map).length}`);
  return map;
}

// Source 3: Fallback for unpriced ships
async function fillGaps(context, ships) {
  const need = ships.filter(s => !s.price);
  if (!need.length) return;
  console.log(`  Fallback: ${need.length} ships`);
  let done = 0;
  await pool(2, need, async s => {
    const p = await context.newPage();
    try {
      await p.goto(s.url, { waitUntil: "domcontentloaded", timeout: 15000 });
      await p.waitForTimeout(1000);
      const pr = await p.evaluate(() => { const m = document.body.textContent.match(/\$([\d,]+(?:\.\d{2})?)\s*USD/); return m ? parseFloat(m[1].replace(/,/g, "")) : 0; });
      if (pr) { s.price = pr; done++; }
    } catch {}
    finally { await p.close(); }
  });
  console.log(`    Recovered: ${done}`);
}

// Main
async function scrapeAllShips(context) {
  const mp = await context.newPage();
  console.log("  Matrix: fetching...");
  const ships = await fromMatrix(mp);
  await mp.close();
  console.log(`  Matrix: ${ships.length} URLs`);

  const pm = await fromStore(context);
  ships.forEach(s => { if (pm[s.href]) s.price = pm[s.href]; });
  console.log(`  Merged: ${ships.filter(s=>s.price).length}/${ships.length}`);

  await fillGaps(context, ships);
  return ships;
}

function exportJSON(d, fp) { fs.writeFileSync(fp, JSON.stringify(d, null, 2)); }
function exportCSV(ships, fp) {
  const h = ["name","series","price","url"];
  const lines = [h.join(",")];
  ships.forEach(s => { lines.push(h.map(k => { let v = s[k]||""; v = String(v); return v.includes(",") ? `"${v.replace(/"/g,'""')}"` : v; }).join(",")); });
  fs.writeFileSync(fp, "﻿" + lines.join("\n"), "utf-8");
}

async function scrapeAndExport(userDataDir, outputDir, opts = {}) {
  const { headless = false } = opts;
  const { context, cleanup } = await launchContext(userDataDir, { headless });
  let ships;
  try { ships = await scrapeAllShips(context); } finally { await cleanup(); }
  exportJSON(ships, path.join(outputDir, "ships.json"));
  exportCSV(ships, path.join(outputDir, "ships.csv"));
  return ships;
}

module.exports = { scrapeAllShips, exportJSON, exportCSV, scrapeAndExport };
