/**
 * Historical CCU Scraper / 历史 CCU 数据抓取
 * Scrapes scorg.tools/ccu for historical Warbond CCU pricing data.
 * @module historical-ccu
 */
const fs = require("fs"), path = require("path");

const SCORG_CCU_URL = "https://scorg.tools/ccu";
const CACHE_DIR = "cache";
const CACHE_FILE = "historical_ccus.json";

// ===========================================================================
// 全量抓取 / Full scrape
// ===========================================================================

/**
 * Scrape all ships' CCU history from scorg.tools.
 * Concurrent: multiple tabs each handle one ship independently.
 * @param {import("playwright").BrowserContext} context
 * @param {object} [opts]
 * @param {number} [opts.concurrency=6] - max concurrent tabs
 * @param {Function} [opts.onProgress] - ({current, total, shipName})
 * @param {Function} [opts.onShipData] - (shipData) per-ship incremental save
 * @returns {Promise<object[]>} array of ship history objects
 */
async function scrapeFullHistory(context, opts = {}) {
  const { onProgress, onShipData, concurrency = 6 } = opts;

  // Phase 1: collect all ship IDs from the table (single page)
  const collector = await context.newPage();
  await collector.goto(SCORG_CCU_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
  await collector.waitForSelector(`tr[id^="ship-"]`, { timeout: 10000 });

  const shipRows = await collector.$$eval(`tr[id^="ship-"]`, rows =>
    rows.map(r => {
      const link = r.querySelector("td:nth-child(2) a");
      const text = link ? link.textContent.trim() : "";
      return { id: r.id.replace("ship-", ""), name: text };
    }).filter(s => s.name)
  );
  await collector.close();

  const total = shipRows.length;
  const results = [];
  let completed = 0, wbShips = 0, wbEntries = 0;

  // Phase 2: concurrent scraping
  const pool = new Set();
  for (const { id, name } of shipRows) {
    const task = (async () => {
      let page;
      try {
        page = await context.newPage();
        await scrapeOneShip(page, id, name, results, onShipData);
      } catch (_) {
        // skip failures
      } finally {
        if (page) await page.close().catch(() => {});
        completed++;
        wbShips = results.filter(s => s.history && s.history.some(e => e.status === "Warbond")).length;
        wbEntries = results.reduce((s, ship) => s + (ship.history || []).filter(e => e.status === "Warbond").length, 0);
        if (onProgress) onProgress({ current: completed, total, shipName: name, wbShips, wbEntries });
      }
    })();

    pool.add(task);
    task.then(() => pool.delete(task));
    if (pool.size >= concurrency) await Promise.race(pool);

    // Periodic incremental save
    if (results.length % 30 === 0 && results.length > 0) {
      try {
        const meta = buildMetadata(results);
        const tmpPath = path.join(process.cwd(), "output", "cache", "historical_ccus.partial.json");
        fs.writeFileSync(tmpPath, JSON.stringify([...results, { _metadata: meta }], null, 2));
      } catch (_) {}
    }
  }
  await Promise.all(pool); // drain remaining

  results._metadata = buildMetadata(results);
  return results;
}

/** Scrape a single ship in its own page: navigate → click → extract → return. */
async function scrapeOneShip(page, shipId, shipName, results, onShipData) {
  await page.goto(SCORG_CCU_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector(`tr[id^="ship-"]`, { timeout: 10000 });

  const link = page.locator(`tr#ship-${shipId} td:nth-child(2) a`);
  if (await link.count() === 0) return;

  try { await link.scrollIntoViewIfNeeded(); await page.waitForTimeout(150); } catch (_) {}
  await link.click();
  await page.waitForSelector(".ship-data.box", { timeout: 10000 });
  await page.waitForTimeout(500);

  const shipData = await extractFromModal(page, shipId, shipName);
  if (shipData) {
    results.push(shipData);
    if (onShipData) onShipData(shipData);
  }
}

// ===========================================================================
// 单船快取 / Single-ship fetch (for gap analysis)
// ===========================================================================

/**
 * Fetch history for a single ship quickly.
 * @param {import("playwright").BrowserContext} context
 * @param {string} shipName - ship name or scorg ID
 * @param {object[]} catalog - ships catalog
 * @param {object} [i18n] - i18n data
 * @returns {Promise<object|null>} single ship history object
 */
async function fetchShipHistory(context, shipName, catalog, i18n) {
  const { matchShip } = require("./ccu");
  const matched = matchShip(shipName, catalog, i18n);
  const lookupName = matched ? matched.name : shipName;

  const page = await context.newPage();
  try {
    await page.goto(SCORG_CCU_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForSelector(`tr[id^="ship-"]`, { timeout: 10000 });

    // Find the ship row in the CCU table
    const shipInfo = await page.$$eval(`tr[id^="ship-"]`, (rows, target) => {
      const t = target.toLowerCase().replace(/-/g, " ");
      let best = null, bestScore = 0;
      for (const r of rows) {
        const link = r.querySelector("td:nth-child(2) a");
        if (!link) continue;
        const text = link.textContent.trim();
        const textLower = text.toLowerCase();
        if (textLower === t) { best = { id: r.id.replace("ship-", ""), name: text }; break; }
        const words = t.split(/\s+/).filter(w => w.length > 1);
        const score = words.filter(w => textLower.includes(w)).length;
        if (score > bestScore && score >= words.length * 0.6) { bestScore = score; best = { id: r.id.replace("ship-", ""), name: text }; }
      }
      return best;
    }, lookupName);

    if (!shipInfo) { await page.close(); return null; }

    // Click ship link to open modal, extract data, close
    const link = page.locator(`tr#ship-${shipInfo.id} td:nth-child(2) a`);
    await link.click();
    await page.waitForSelector(".ship-data.box", { timeout: 10000 });
    await page.waitForTimeout(600);

    const result = await extractFromModal(page, shipInfo.id, shipInfo.name);

    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);

    return result;
  } finally { await page.close(); }
}

// ===========================================================================
// 数据提取 / Data extraction
// ===========================================================================

/**
 * Extract ship CCU history from a ship-information page.
 */
async function extractFromShipPage(page, shipId, rawName) {
  const infoDiv = page.locator(".ship-data .info");
  if (await infoDiv.count() === 0) return null;

  const divs = infoDiv.locator("> div");
  const count = await divs.count();
  if (count === 0) return null;

  // Extract all label/value pairs
  const pairs = [];
  for (let i = 0; i < count; i++) {
    const cls = (await divs.nth(i).getAttribute("class")) || "";
    const text = (await divs.nth(i).innerText()).trim();
    pairs.push({ cls, text });
  }

  return parseShipData(shipId, rawName, pairs);
}

/**
 * Extract ship CCU history from the in-page modal.
 */
async function extractFromModal(page, shipId, rawName) {
  const modal = page.locator(".ship-data.box").last();
  const divs = modal.locator(".info > div");
  const count = await divs.count();
  if (count === 0) return null;

  const pairs = [];
  for (let i = 0; i < count; i++) {
    const cls = (await divs.nth(i).getAttribute("class")) || "";
    const text = (await divs.nth(i).innerText()).trim();
    pairs.push({ cls, text });
  }

  return parseShipData(shipId, rawName, pairs);
}

/**
 * Parse the label/value pairs into structured ship data.
 */
function parseShipData(shipId, rawName, pairs) {
  let shipName = rawName, regularPrice = 0;
  const history = [];

  // Phase 1: find regular price
  for (let i = 0; i < pairs.length; i++) {
    const { cls, text } = pairs[i];
    if (cls.includes("label") && /MSRP|CCU Value/i.test(text)) {
      // The next sibling (value) contains the price
      for (let j = i + 1; j < Math.min(i + 3, pairs.length); j++) {
        if (pairs[j].cls.includes("value")) {
          const pm = pairs[j].text.match(/\$([\d,]+)/);
          if (pm) regularPrice = parseInt(pm[1].replace(/,/g, ""), 10);
          break;
        }
      }
    }
    // Model name from label "Model:"
    if (cls.includes("label") && /^Model:/i.test(text)) {
      for (let j = i + 1; j < Math.min(i + 3, pairs.length); j++) {
        if (pairs[j].cls.includes("value")) {
          const modelName = pairs[j].text.replace(/\n.*/s, "").trim();
          if (modelName) shipName = modelName;
          break;
        }
      }
    }
  }

  // Phase 2: parse CCU history (after ccu-header)
  let inHistory = false;
  for (let i = 0; i < pairs.length; i++) {
    const { cls, text } = pairs[i];

    // Detect start of history section
    if (cls.includes("ccu-header")) {
      inHistory = true;
      continue;
    }
    if (!inHistory) continue;

    // Skip "Current Value" row
    if (cls.includes("label") && /Current Value/i.test(text)) continue;
    if (cls.includes("value") && /^\$\d/.test(text) && !text.includes("Available") && !text.includes("Warbond")) continue;

    // Label = date (possibly with event span), Value = status/price
    if (cls.includes("label") && /\d{1,2}\s+\w{3}\s+\d{4}/i.test(text)) {
      const dateMatch = text.match(/(\d{1,2}\s+\w{3}\s+\d{4})/i);
      if (!dateMatch) continue;
      const dateStr = parseDate(dateMatch[1]);
      const eventMatch = text.match(/\|?\s*(.+)$/);
      const event = eventMatch && !eventMatch[1].match(/^\d/) ? eventMatch[1].trim() : "";

      // Get the next value div
      let valueText = "";
      for (let j = i + 1; j < Math.min(i + 3, pairs.length); j++) {
        if (pairs[j].cls.includes("value")) {
          valueText = pairs[j].text;
          break;
        }
      }

      const entries = parseValueText(valueText);
      for (const entry of entries) {
        history.push({ date: dateStr, status: entry.status, price: entry.price, event });
      }
      i++; // skip the value we consumed
    }
  }

  return { shipName, rawName, shipId, regularPrice, history };
}

/** Parse combined value text into one or more {status, price} entries. */
function parseValueText(text) {
  const entries = [];
  // Price increased to $X
  const pi = text.match(/Price increased to\s*\$([\d,]+)/i);
  if (pi) entries.push({ status: "PriceIncrease", price: parseInt(pi[1].replace(/,/g, ""), 10) });
  // Warbond: $X (not ended)
  const wb = text.match(/Warbond:\s*\$([\d,]+)/i);
  if (wb && !/Warbond ended/i.test(text)) entries.push({ status: "Warbond", price: parseInt(wb[1].replace(/,/g, ""), 10) });
  // Available on sale: $X
  const av = text.match(/Available on sale:\s*\$([\d,]+)/i);
  if (av) entries.push({ status: "Available", price: parseInt(av[1].replace(/,/g, ""), 10) });
  // Initial value: $X
  const iv = text.match(/Initial value:\s*\$([\d,]+)/i);
  if (iv) entries.push({ status: "Available", price: parseInt(iv[1].replace(/,/g, ""), 10) });
  // Warbond ended
  if (/Warbond ended/i.test(text)) entries.push({ status: "WarbondEnded", price: null });
  // No longer on sale
  if (/No longer on sale/i.test(text)) entries.push({ status: "NoLongerOnSale", price: null });
  if (!entries.length) entries.push({ status: "Unknown", price: null });
  return entries;
}

function classifyStatus(text) { return parseValueText(text)[0]?.status || "Unknown"; }
function extractPrice(text) { return parseValueText(text)[0]?.price || null; }

function parseDate(dateStr) {
  const months = { Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
    Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12" };
  const m = dateStr.match(/(\d{1,2})\s+(\w{3})\s+(\d{4})/i);
  if (!m) return dateStr;
  const day = m[1].padStart(2, "0"), month = months[m[2].charAt(0).toUpperCase() + m[2].slice(1).toLowerCase()] || "01";
  return `${m[3]}-${month}-${day}`;
}

// ===========================================================================
// 缓存管理 / Cache management
// ===========================================================================

/**
 * Load historical CCU data from cache and filter by date.
 * @param {string} root - project root path
 * @param {Date|string} [dateFrom] - earliest date to include
 * @returns {object} map: { ShipName: { regularPrice, bestWbPrice, wbDate, wbEvent } }
 */
function loadHistoricalCCUs(root, dateFrom) {
  const p = path.join(root, "output", CACHE_DIR, CACHE_FILE);
  if (!fs.existsSync(p)) return {};

  let data;
  try {
    data = JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch (_) { return {}; }

  // Support both plain array and { ships: [...] } formats
  if (!Array.isArray(data)) data = data.ships || [];

  const from = dateFrom ? (typeof dateFrom === "string" ? new Date(dateFrom) : dateFrom) : null;
  if (from && isNaN(from.getTime())) return {};

  const result = {};

  for (const ship of data) {
    if (!ship.shipName || !ship.regularPrice) continue;

    let bestWb = null;
    for (const entry of ship.history || []) {
      if (entry.status !== "Warbond" || entry.price == null || entry.price >= ship.regularPrice) continue;

      if (from) {
        const entryDate = new Date(entry.date);
        if (isNaN(entryDate.getTime()) || entryDate < from) continue;
      }

      if (!bestWb || entry.price < bestWb.price) {
        bestWb = { price: entry.price, date: entry.date, event: entry.event };
      }
    }

    if (bestWb) {
      result[ship.shipName] = { regularPrice: ship.regularPrice, bestWbPrice: bestWb.price,
        wbDate: bestWb.date, wbEvent: bestWb.event };
    }
  }

  return result;
}

function buildMetadata(data) {
  let earliest = null, latest = null;
  for (const ship of data) {
    for (const entry of ship.history || []) {
      if (entry.date) {
        if (!earliest || entry.date < earliest) earliest = entry.date;
        if (!latest || entry.date > latest) latest = entry.date;
      }
    }
  }
  return { lastUpdated: new Date().toISOString(), shipCount: data.length,
    dateRange: { earliestDate: earliest, latestDate: latest },
    totalWbEntries: data.reduce((s, ship) => s + (ship.history || []).filter(e => e.status === "Warbond").length, 0) };
}

function getCacheMetadata(root) {
  const p = path.join(root, "output", CACHE_DIR, CACHE_FILE);
  if (!fs.existsSync(p)) return { exists: false };
  try {
    const data = JSON.parse(fs.readFileSync(p, "utf-8"));
    const ships = Array.isArray(data) ? data.filter(s => !s._metadata) : (data.ships || []);
    const meta = Array.isArray(data) ? (data.find(s => s._metadata)?._metadata || {}) : (data._metadata || {});
    return { exists: true, shipCount: ships.length, ...meta };
  } catch (_) { return { exists: false }; }
}

function exportJSON(data, filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  // Plain array with metadata as last entry
  const ships = data.filter(s => !s._metadata);
  const meta = data._metadata || buildMetadata(ships);
  const out = [...ships, { _metadata: meta }];
  fs.writeFileSync(filePath, JSON.stringify(out, null, 2));
}

module.exports = {
  SCORG_CCU_URL,
  scrapeFullHistory,
  scrapeOneShip,
  fetchShipHistory,
  loadHistoricalCCUs,
  exportJSON,
  getCacheMetadata,
  parseShipData,
  buildMetadata,
};
