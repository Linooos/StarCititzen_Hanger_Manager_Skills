/**
 * RSI Ship Catalog — Matrix URLs + Store Prices / 船只目录模块
 * @module ships
 */
const { launchContext } = require("./hangar");
const fs = require("fs");
const path = require("path");

const MATRIX_URL = "https://robertsspaceindustries.com/en/ship-matrix";
const STORE_URL = "https://robertsspaceindustries.com/en/pledge/ships?sortField=name&sortDirection=asc";

// 并发控制 / Concurrency limiter
async function pool(limit, tasks, fn) {
  const results = [], running = new Set();
  for (const t of tasks) {
    const p = Promise.resolve().then(() => fn(t));
    results.push(p); running.add(p);
    p.finally(() => running.delete(p));
    if (running.size >= limit) await Promise.race(running);
  }
  return Promise.all(results);
}

// ===========================================================================
// 数据源 1：Ship Matrix → 全部船只 URL/名称
// ===========================================================================
async function fetchMatrix(page) {
  await page.goto(MATRIX_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(8000);
  return page.evaluate(() => {
    const seen = new Set();
    const ships = [];
    document.querySelectorAll('#statsapp a[href*="/pledge/ships/"]').forEach(a => {
      const href = a.getAttribute("href");
      if (seen.has(href)) return;
      seen.add(href);
      const parts = href.replace("/pledge/ships/", "").split("/");
      ships.push({
        href, slug: parts.pop(), series: parts[0] || "",
        name: parts[parts.length - 1] || parts[0] || "",
        price: 0, manufacturer: "", url: "https://robertsspaceindustries.com" + href,
      });
    });
    return ships;
  });
}

// ===========================================================================
// 数据源 2：Pledge Store 翻页 → 并发获取价格
// ===========================================================================
async function fetchPrices(context) {
  // 获取总页数
  const p1 = await context.newPage();
  await p1.goto(STORE_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
  await p1.waitForTimeout(5000);
  const total = await p1.evaluate(() => {
    let max = 1;
    document.querySelectorAll(".orion-c-pagination__link").forEach(l => {
      const n = parseInt(l.textContent.trim());
      if (n > max) max = n;
    });
    return max;
  });
  await p1.close();
  console.log(`  Store pages: ${total}`);

  // 并发翻页 / Concurrent page scraping
  const pages = Array.from({ length: total }, (_, i) => i + 1);
  const chunks = await pool(4, pages, async (pg) => {
    const p = await context.newPage();
    try {
      await p.goto(`${STORE_URL}&page=${pg}`, { waitUntil: "domcontentloaded", timeout: 30000 });
      await p.waitForTimeout(1500);
      return await p.evaluate(() => {
        const grid = document.querySelector(".shipsList-cardStack__grid");
        if (!grid) return [];
        return Array.from(grid.children).map(card => {
          const a = card.querySelector("a");
          const href = a ? a.getAttribute("href") : "";
          const m = card.textContent.match(/\$([\d,]+(?:\.\d{2})?)\s*USD/);
          return { href, price: m ? parseFloat(m[1].replace(/,/g, "")) : 0 };
        });
      });
    } catch { return []; }
    finally { await p.close(); }
  });

  // 合并 / Merge
  const map = {};
  chunks.flat().forEach(s => { if (s.href && s.price > 0 && !map[s.href]) map[s.href] = s.price; });
  console.log(`  Priced from store: ${Object.keys(map).length}`);
  return map;
}

// ===========================================================================
// 数据源 3：缺价船补全（并发查单个页面）
// ===========================================================================
async function fillMissing(context, ships) {
  const need = ships.filter(s => s.price <= 0);
  if (!need.length) return;
  console.log(`  Fallback: ${need.length} ships...`);

  let done = 0;
  await pool(3, need, async (s) => {
    const p = await context.newPage();
    try {
      await p.goto(s.url, { waitUntil: "domcontentloaded", timeout: 15000 });
      await p.waitForTimeout(1000);
      const price = await p.evaluate(() => {
        const m = document.body.textContent.match(/\$([\d,]+(?:\.\d{2})?)\s*USD/);
        return m ? parseFloat(m[1].replace(/,/g, "")) : 0;
      });
      if (price > 0) { s.price = price; done++; }
    } catch {}
    finally { await p.close(); }
  });
  console.log(`    Recovered: ${done}`);
}

// ===========================================================================
// 主流程 / Main
// ===========================================================================
async function scrapeAllShips(context) {
  const mp = await context.newPage();
  console.log("  Matrix: fetching...");
  const ships = await fetchMatrix(mp);
  await mp.close();
  console.log(`  Matrix: ${ships.length} ships`);

  const priceMap = await fetchPrices(context);
  ships.forEach(s => { if (priceMap[s.href]) s.price = priceMap[s.href]; });
  console.log(`  Merged: ${ships.filter(s=>s.price>0).length}/${ships.length} priced`);

  await fillMissing(context, ships);

  return ships;
}

// 导出 / Export
function exportJSON(data, fp) { fs.writeFileSync(fp, JSON.stringify(data, null, 2)); }
function exportCSV(ships, fp) {
  const h = ["name","manufacturer","series","price","slug","url"];
  const lines = [h.join(",")];
  ships.forEach(s => {
    const row = h.map(k => { let v = s[k]||""; if (Array.isArray(v)) v = v.join("; "); v = String(v); return v.includes(",") ? `"${v.replace(/"/g,'""')}"` : v; });
    lines.push(row.join(","));
  });
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
