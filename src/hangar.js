/**
 * RSI Hangar Module / 星际公民机库爬取核心模块
 *
 * 功能：浏览器管理、交互登录、分类发现、翻页爬取、数据导出
 * Features: browser lifecycle, interactive login, category discovery,
 *           paginated scraping, JSON/CSV export, summary statistics.
 *
 * @module hangar
 */

const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

// ===========================================================================
// 常量 / Constants
// ===========================================================================

const BASE_URL = "https://robertsspaceindustries.com/en/account/pledges";
const LOGIN_URL = "https://robertsspaceindustries.com/en/sign-in";
const DEFAULT_CONCURRENCY = 4;
const DEFAULT_VIEWPORT = { width: 1280, height: 800 };
const DEFAULT_LOGIN_TIMEOUT_MIN = 10;

// ---------------------------------------------------------------------------
// 工具函数 / Helpers

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Run async tasks with a concurrency limit */
async function asyncPool(limit, tasks, fn) {
  const results = [];
  const executing = new Set();
  for (const task of tasks) {
    const p = Promise.resolve().then(() => fn(task));
    results.push(p);
    executing.add(p);
    const clean = () => executing.delete(p);
    p.then(clean, clean);
    if (executing.size >= limit) await Promise.race(executing);
  }
  return Promise.all(results);
}

// ---------------------------------------------------------------------------
// 浏览器 / Browser

/**
 * Launch a persistent Chromium context with the user's RSI session.
 * @param {string} userDataDir - path to persistent user data directory
 * @param {object} [opts]
 * @param {boolean} [opts.headless=false]
 * @param {object}  [opts.viewport]
 * @param {string}  [opts.channel="chrome"] - browser channel
 * @returns {Promise<{context: BrowserContext, cleanup: Function}>}
 */
async function launchContext(userDataDir, opts = {}) {
  const {
    headless = false,
    viewport = DEFAULT_VIEWPORT,
    channel = "chrome",
  } = opts;

  const context = await chromium.launchPersistentContext(userDataDir, {
    channel,
    headless,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--disable-features=IsolateOrigins,site-per-process",
    ],
    viewport,
    locale: "en-US",
    timezoneId: "America/Chicago",
  });

  return {
    context,
    cleanup: () => context.close(),
  };
}

// ---------------------------------------------------------------------------
// 登录 / Login

/**
 * Open browser to RSI sign-in page and wait for the user to log in.
 * Auto-detects login by polling for redirect away from sign-in page.
 * Returns the authenticated context — ready for scraping.
 *
 * @param {string} userDataDir - path to persistent user data directory
 * @param {object} [opts]
 * @param {string} [opts.loginUrl] - sign-in page URL
 * @param {string} [opts.hangarUrl] - URL to navigate to after login for verification
 * @param {number} [opts.timeoutMinutes=10] - max wait time
 * @param {number} [opts.pollIntervalMs=2000] - URL check interval
 * @param {Function} [opts.onStatus] - called with status updates ({phase, url})
 * @returns {Promise<{context: BrowserContext, page: Page, cleanup: Function}>}
 */
async function login(userDataDir, opts = {}) {
  const {
    loginUrl = LOGIN_URL,
    hangarUrl = BASE_URL,
    timeoutMinutes = DEFAULT_LOGIN_TIMEOUT_MIN,
    pollIntervalMs = 2000,
    onStatus,
  } = opts;

  const { context, cleanup } = await launchContext(userDataDir, { headless: false });
  const page = await context.newPage();

  await page.goto(loginUrl, { waitUntil: "domcontentloaded" });
  if (onStatus) onStatus({ phase: "waiting", url: page.url() });

  const maxChecks = (timeoutMinutes * 60 * 1000) / pollIntervalMs;
  let loggedIn = false;

  for (let i = 0; i < maxChecks; i++) {
    const url = page.url();
    if (!url.includes("/sign-in") && !url.toLowerCase().includes("/login")) {
      loggedIn = true;
      if (onStatus) onStatus({ phase: "detected", url });
      break;
    }
    await sleep(pollIntervalMs);
  }

  if (!loggedIn) {
    await cleanup();
    const err = new Error(`Login timed out after ${timeoutMinutes} minutes`);
    err.code = "LOGIN_TIMEOUT";
    throw err;
  }

  await page.waitForTimeout(2000);

  if (hangarUrl) {
    await page.goto(hangarUrl, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3000);

    const currentUrl = page.url();
    if (currentUrl.includes("sign-in")) {
      await cleanup();
      const err = new Error("Login verification failed — redirected back to sign-in");
      err.code = "LOGIN_FAILED";
      throw err;
    }
    if (onStatus) onStatus({ phase: "verified", url: currentUrl });
  }

  return { context, page, cleanup };
}

/**
 * Save session data (cookies + localStorage) from the current page to files.
 * @param {BrowserContext} context
 * @param {Page} page
 * @param {string} outputDir - directory for cookies.json / local_storage.json
 */
async function saveSession(context, page, outputDir) {
  const cookies = await context.cookies();
  fs.writeFileSync(
    path.join(outputDir, "cookies.json"),
    JSON.stringify(cookies, null, 2)
  );

  const ls = await page.evaluate(() => JSON.stringify(window.localStorage));
  fs.writeFileSync(path.join(outputDir, "local_storage.json"), ls);
}

// ---------------------------------------------------------------------------
// 分类发现 / Category Discovery

/**
 * Extract available product-type categories from the hangar page selectlist.
 * Must be called while on the pledges page.
 *
 * @param {Page} page
 * @returns {Promise<Array<{value: string, label: string}>>}
 */
async function getCategories(page) {
  return page.evaluate(() => {
    const items = document.querySelectorAll(".js-selectlist.selectlist .js-option");
    return Array.from(items)
      .map((li) => {
        const rel = li.getAttribute("rel") || "";
        const params = new URLSearchParams(rel.startsWith("?") ? rel : "?" + rel);
        return {
          value: params.get("product-type") || "",
          label: li.textContent.trim(),
        };
      })
      .filter((c) => c.value !== ""); // exclude "All"
  });
}

// ---------------------------------------------------------------------------
// 翻页 / Pagination

/**
 * Get total page count from the pager element.
 * @param {Page} page
 * @returns {Promise<number>}
 */
async function getTotalPages(page) {
  return page.evaluate(() => {
    const pager = document.querySelector(".pager.clearfix");
    if (!pager) return 1;
    let max = 1;
    pager.querySelectorAll("a").forEach((a) => {
      const m = a.href.match(/page=(\d+)/);
      if (m) max = Math.max(max, parseInt(m[1]));
    });
    return max;
  });
}

// ---------------------------------------------------------------------------
// 价值计算 / Value helpers

/** Extract numeric USD value from a price string like "$10.00 USD" */
function numericValue(priceStr) {
  if (!priceStr) return 0;
  return parseFloat(priceStr.replace(/[^0-9.]/g, "")) || 0;
}

// ---------------------------------------------------------------------------
// DOM 交互 / DOM Interaction

/**
 * Click all expand arrows on the current page to reveal detailed item info
 * (insurance, attached items, actual ship after upgrades, etc.).
 * @param {Page} page
 */
async function expandAllItems(page) {
  const arrows = page.locator(".js-expand-arrow");
  const count = await arrows.count();
  for (let i = 0; i < count; i++) {
    try {
      await arrows.nth(i).click();
      await page.waitForTimeout(400);
    } catch { /* arrow may not be clickable */ }
  }
  if (count > 0) await page.waitForTimeout(1000);
}

/**
 * Click each "Upgrades" log button one at a time and extract the CCU chain.
 * All buttons share a single .pledge-upgrade-log-rows container, so we must
 * click → extract → click next → extract → ... sequentially.
 *
 * Call after expandAllItems().
 * @param {Page} page
 * @returns {Promise<Array<Array<Object>>>} chains[i] = upgrade chain for the i-th item with a button
 */
async function expandUpgradeLogs(page) {
  const btns = page.locator(".js-upgrade-log");
  const count = await btns.count();
  const chains = [];

  for (let i = 0; i < count; i++) {
    try {
      await btns.nth(i).click({ force: true, timeout: 5000 });
      await page.waitForTimeout(2000);

      // Extract the chain from the shared container
      const chain = await page.evaluate(() => {
        const log = document.querySelector(".pledge-upgrade-log-rows");
        if (!log) return [];
        const rows = log.querySelectorAll(".row");
        const result = [];
        rows.forEach((row) => {
          const text = row.textContent.replace(/\s+/g, " ").trim();
          const match = text.match(
            /^(.+?)\s+Upgrade\s+applied:\s+#(\d+)\s+Upgrade\s*-\s*(.+?)\s+to\s+(.+?)(?:\s+(Warbond|Standard))?\s*(?:Edition)[,\s]+new value:\s+\$([0-9.]+)/
          );
          if (match) {
            result.push({
              date: match[1].trim(),
              ccuId: match[2],
              from: match[3].trim(),
              to: match[4].trim(),
              isWarbond: match[5] === "Warbond",
              newValue: parseFloat(match[6]),
            });
          }
        });
        // Rows are newest-first, reverse to application order
        result.reverse();
        return result;
      });

      chains.push(chain);
    } catch {
      chains.push([]);
    }
  }

  return chains;
}

/**
 * Click the "Upgrades" button on an item to load its CCU chain via AJAX,
 * then parse the resulting rows. Returns the chain in application order
 * (first applied → last applied).
 *
 * @param {Page} page
 * @param {number} itemIndex - 0-based index of the .js-upgrade-log button on the page
 * @returns {Promise<Array<{date: string, ccuId: string, from: string, to: string, isWarbond: boolean, newValue: number}>>}
 */
async function extractUpgradeChain(page, itemIndex) {
  const btn = page.locator(".js-upgrade-log").nth(itemIndex);
  if (await btn.count() === 0) return [];

  await btn.click();
  // Wait for AJAX loader to finish and rows to appear
  await page.waitForTimeout(2500);

  const chain = await page.evaluate(() => {
    const rows = document.querySelectorAll(".pledge-upgrade-log-rows .row");
    const result = [];

    rows.forEach((row) => {
      const text = row.textContent.replace(/\s+/g, " ").trim();
      // Parse: "Feb 02 2026, 12:35 am Upgrade applied: #101674810 Upgrade - RAFT to Hermes Warbond Edition, new value: $115.00 USD"
      const match = text.match(
        /^(.+?)\s+Upgrade\s+applied:\s+#(\d+)\s+Upgrade\s*-\s*(.+?)\s+to\s+(.+?)(?:\s+(Warbond|Standard))?\s*(?:Edition)[,\s]+new value:\s+\$([0-9.]+)/
      );
      if (match) {
        result.push({
          date: match[1].trim(),
          ccuId: match[2],
          from: match[3].trim(),
          to: match[4].trim(),
          isWarbond: match[5] === "Warbond",
          newValue: parseFloat(match[6]),
          raw: text,
        });
      } else {
        result.push({ date: "", ccuId: "", from: "", to: "", isWarbond: false, newValue: 0, raw: text });
      }
    });

    return result;
  });

  // Rows come in reverse (newest first). Reverse to get application order.
  chain.reverse();

  return chain;
}

// ---------------------------------------------------------------------------
// 物品提取（v2 增强版，含 CCU 数据）/ Item Extraction (enhanced v2)

/**
 * Extract all pledge items from the current page with full detail.
 * Click expand arrows first to reveal attached items, insurance, etc.
 *
 * @param {Page} page
 * @param {object} [opts]
 * @param {string} [opts.categoryLabel] - tag items with this category label
 * @param {string} [opts.categoryValue] - tag items with this category value
 * @returns {Promise<Array<Item>>}
 */
async function extractPageItems(page, opts = {}) {
  return page.evaluate((options) => {
    const result = [];
    const pledgeIds = document.querySelectorAll(".js-pledge-id");

    pledgeIds.forEach((input) => {
      const li = input.closest("li");
      if (!li) return;

      const getVal = (cls) => {
        const el = li.querySelector("." + cls);
        return el ? el.value.trim() : "";
      };
      const getText = (sel) => {
        const el = li.querySelector(sel);
        return el ? el.textContent.trim() : "";
      };

      // --- basic fields ---
      const nameEl = li.querySelector("h3");
      const rawName = nameEl ? nameEl.textContent.trim() : getVal("js-pledge-name");
      const imgEl = li.querySelector(".image");

      // --- availability & status ---
      const availabilityEl = li.querySelector(".availability");
      const availability = availabilityEl ? availabilityEl.textContent.trim() : "";
      const upgraded = !!li.querySelector(".upgraded");

      // --- contains / actual ship ---
      const itemsCol = li.querySelector(".items-col");
      const containsText = itemsCol ? itemsCol.textContent.replace(/\s+/g, " ").trim() : "";
      // Parse "Contains: X and N items" → extract the ship name
      let actualShip = "";
      let containsItemCount = 0;
      const containsMatch = containsText.match(/Contains:\s*(.+?)\s+and\s+(\d+)\s+items?/);
      if (containsMatch) {
        actualShip = containsMatch[1].trim();
        containsItemCount = parseInt(containsMatch[2]);
      }

      // --- creation date ---
      const dateCol = li.querySelector(".date-col");
      const created = dateCol ? dateCol.textContent.replace(/Created:/, "").trim() : "";

      // --- insurance extraction from full text ---
      const fullText = li.textContent || "";
      const insuranceItems = [];
      const insRegex = /(Lifetime\s*Insurance|LTI|\d+\s*Month\s*Insurance)/gi;
      let insMatch;
      while ((insMatch = insRegex.exec(fullText)) !== null) {
        let type = insMatch[1];
        if (/Lifetime|LTI/i.test(type)) type = "LTI";
        else if (/(\d+)\s*Month/i.test(type)) {
          const months = parseInt(type.match(/\d+/)[0]);
          type = months + "mo";
        }
        insuranceItems.push(type);
      }

      // --- attached items (from expanded .js-more section) ---
      const attachedItems = [];
      const moreSection = li.querySelector(".items.more.js-more");
      if (moreSection) {
        // Each sub-item is in a .content-block1 or .with-images div
        const subItems = moreSection.querySelectorAll(".with-images");
        subItems.forEach((sub) => {
          const subText = sub.textContent.replace(/\s+/g, " ").trim();
          if (subText && subText.length > 2) {
            attachedItems.push(subText.substring(0, 200));
          }
        });
      }

      // --- giftable / exchangeable ---
      const giftable = !!li.querySelector(".js-gift");
      const exchangeable = !!li.querySelector(".js-reclaim");

      // --- upgrade-specific fields ---
      let fromShip = "";
      let toShip = "";
      let isWarbond = false;
      // Parse "Upgrade - X to Y (Warbond) Edition" from name
      const upgradeNameMatch = rawName.match(
        /Upgrade\s*-\s*(.+?)\s+to\s+(.+?)(?:\s+(Warbond|Standard))?\s*(?:Edition)?\s*$/i
      );
      if (upgradeNameMatch) {
        fromShip = upgradeNameMatch[1].trim();
        toShip = upgradeNameMatch[2].trim();
        isWarbond = /warbond/i.test(rawName);
      }

      // --- ship-specific image (overrides default) ---
      const shipImage = imgEl
        ? (imgEl.style.backgroundImage || "").replace(/url\(['"]?|['"]?\)/g, "")
        : "";

      // --- upgrade chain (populated by scrapeCategory post-processing) ---
      const upgradeChain = [];

      result.push({
        // Core
        id: getVal("js-pledge-id"),
        name: rawName,
        category: options.catLabel || "",
        categoryValue: options.catValue || "",

        // Value
        value: getVal("js-pledge-value"),
        meltValue: 0, // computed post-extraction by caller
        configValue: getVal("js-pledge-configuration-value"),
        currency: getVal("js-pledge-currency"),
        notBuybackable: getVal("js-pledge-not-buybackable") === "1",

        // Status
        availability,
        upgraded,
        created,

        // Contents
        contains: containsText,
        actualShip,
        containsItemCount,

        // Insurance
        insurance: [...new Set(insuranceItems)],

        // Attached items
        attachedItems,
        attachedCount: attachedItems.length,

        // Actions
        giftable,
        exchangeable,

        // Image
        image: shipImage,

        // Upgrade-specific (only populated for upgrade items)
        fromShip,
        toShip,
        isWarbond,

        // Upgrade chain (populated later by extractUpgradeChain)
        upgradeChain: [],
      });
    });

    return result;
  }, { catLabel: opts.categoryLabel || "", catValue: opts.categoryValue || "" });
}

// ---------------------------------------------------------------------------
// 分类爬取 / Category Scraping

/**
 * Scrape all pages of a single category with full item details.
 * Auto-expands items to capture insurance, attached items, actual ship, etc.
 *
 * @param {BrowserContext} context
 * @param {{value: string, label: string}} category
 * @param {object} [opts]
 * @param {string} [opts.baseUrl] - pledges page URL
 * @returns {Promise<{category: string, items: Array<Item>}>}
 */
async function scrapeCategory(context, category, opts = {}) {
  const { baseUrl = BASE_URL } = opts;
  const page = await context.newPage();
  const items = [];

  try {
    const params = new URLSearchParams();
    if (category.value) params.set("product-type", category.value);
    params.set("page", "1");

    await page.goto(baseUrl + "?" + params.toString(), {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await page.waitForTimeout(2000);

    const totalPages = await getTotalPages(page);

    for (let pg = 1; pg <= totalPages; pg++) {
      if (pg > 1) {
        params.set("page", String(pg));
        await page.goto(baseUrl + "?" + params.toString(), {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        });
        await page.waitForTimeout(1000);
      }

      // Expand all items to reveal detailed data
      await expandAllItems(page);

      // For ship categories, extract upgrade chains before page items
      let upgradeChains = [];
      const shipCategories = ["standalone_ship", "game_package"];
      if (shipCategories.includes(category.value)) {
        upgradeChains = await expandUpgradeLogs(page);
      }

      const pageItems = await extractPageItems(page, {
        categoryLabel: category.label,
        categoryValue: category.value,
      });

      // Post-process: compute meltValue and attach upgrade chains
      let chainIdx = 0;
      pageItems.forEach((item) => {
        item.meltValue = numericValue(item.value);
        // Attach upgrade chain to items that have upgrade buttons
        if (item.upgraded && chainIdx < upgradeChains.length) {
          item.upgradeChain = upgradeChains[chainIdx];
          chainIdx++;
        }
      });

      items.push(...pageItems);
      if (pageItems.length === 0) break;
      if (pg < totalPages) await sleep(800);
    }
  } finally {
    await page.close();
  }

  return { category: category.label, items };
}

// ---------------------------------------------------------------------------
// 批量爬取 / Bulk Scraping

/**
 * Scrape all categories concurrently. Returns deduplicated, classified items.
 *
 * @param {BrowserContext} context
 * @param {object} [opts]
 * @param {number} [opts.concurrency=4] - max parallel category tabs
 * @param {string} [opts.baseUrl] - pledges page URL
 * @param {Function} [opts.onProgress] - called with ({category, items, total}) after each category
 * @returns {Promise<Array<Item>>}
 */
async function scrapeAll(context, opts = {}) {
  const { concurrency = DEFAULT_CONCURRENCY, baseUrl = BASE_URL, onProgress } = opts;

  // Get categories from a fresh page
  const initPage = await context.newPage();
  await initPage.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
  await initPage.waitForTimeout(3000);
  const categories = await getCategories(initPage);
  await initPage.close();

  // Scrape all categories in parallel batches
  const results = await asyncPool(concurrency, categories, async (cat) => {
    const result = await scrapeCategory(context, cat, { baseUrl });
    if (onProgress) {
      onProgress({
        category: result.category,
        items: result.items.length,
        total: 0, // filled below
      });
    }
    return result;
  });

  // Merge & deduplicate
  const seen = new Set();
  const allItems = [];
  for (const { items } of results) {
    for (const item of items) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        allItems.push(item);
      }
    }
  }

  return allItems;
}

// ---------------------------------------------------------------------------
// 导出 / Export

/**
 * Export items to JSON file.
 * @param {Array<Item>} items
 * @param {string} filePath
 */
function exportJSON(items, filePath) {
  fs.writeFileSync(filePath, JSON.stringify(items, null, 2));
}

/**
 * Export items to CSV file (with BOM for Excel).
 * @param {Array<Item>} items
 * @param {string} filePath
 */
function exportCSV(items, filePath) {
  const headers = [
    "id", "name", "value", "meltValue", "configValue", "currency",
    "notBuybackable", "category", "categoryValue",
    "actualShip", "fromShip", "toShip", "isWarbond",
    "upgraded", "insurance", "containsItemCount",
    "giftable", "exchangeable", "created", "image",
  ];

  const lines = [headers.join(",")];
  items.forEach((item) => {
    const row = headers.map((h) => {
      let val = item[h];
      if (val == null) val = "";
      if (Array.isArray(val)) val = val.join("; ");
      if (typeof val === "boolean") val = val ? "1" : "0";
      val = String(val);
      return val.includes(",") ? `"${val.replace(/"/g, '""')}"` : val;
    });
    lines.push(row.join(","));
  });

  fs.writeFileSync(filePath, "﻿" + lines.join("\n"), "utf-8");
}

// ---------------------------------------------------------------------------
// 汇总 / Summary

/**
 * Generate a summary of items grouped by category.
 * @param {Array<Item>} items
 * @returns {{byCategory: Object<string, {count: number, totalValue: number}>, totalItems: number, totalValue: number}}
 */
function summarize(items) {
  const byCategory = {};
  let totalValue = 0;

  items.forEach((item) => {
    const key = item.category || "Uncategorized";
    if (!byCategory[key]) byCategory[key] = { count: 0, totalValue: 0 };
    byCategory[key].count++;

    const numVal = parseFloat(item.value.replace(/[^0-9.]/g, ""));
    if (!isNaN(numVal)) {
      byCategory[key].totalValue += numVal;
      totalValue += numVal;
    }
  });

  return {
    byCategory,
    totalItems: items.length,
    totalValue,
  };
}

// ---------------------------------------------------------------------------
// 一键爬取+导出 / Combined scrape+export

/**
 * High-level helper: scrape the hangar and export to JSON + CSV.
 *
 * @param {string} userDataDir - path to persistent user data directory
 * @param {string} outputDir - directory for output files
 * @param {object} [opts]
 * @param {boolean} [opts.headless=false]
 * @param {number} [opts.concurrency=4]
 * @returns {Promise<Array<Item>>}
 */
async function scrapeAndExport(userDataDir, outputDir, opts = {}) {
  const { headless = false, concurrency = DEFAULT_CONCURRENCY } = opts;

  const { context, cleanup } = await launchContext(userDataDir, { headless });

  let items;
  try {
    items = await scrapeAll(context, {
      concurrency,
      onProgress: ({ category, items: count }) => {
        console.log(`  [${category}] ${count} items`);
      },
    });
  } finally {
    await cleanup();
  }

  const jsonPath = path.join(outputDir, "hangar_items.json");
  const csvPath = path.join(outputDir, "hangar_items.csv");

  exportJSON(items, jsonPath);
  exportCSV(items, csvPath);

  const summary = summarize(items);
  console.log(`  Total: ${summary.totalItems} items, $${summary.totalValue.toFixed(2)}`);
  console.log(`  Exported: ${jsonPath}`);
  console.log(`            ${csvPath}`);

  return items;
}

// ---------------------------------------------------------------------------
// 模块导出 / Exports

module.exports = {
  // Constants
  BASE_URL,
  LOGIN_URL,

  // Browser
  launchContext,

  // Login
  login,
  saveSession,

  // Discovery
  getCategories,
  getTotalPages,

  // DOM
  expandAllItems,

  // Extraction
  extractPageItems,
  extractUpgradeChain,

  // Scraping
  scrapeCategory,
  scrapeAll,

  // Export
  exportJSON,
  exportCSV,

  // Analysis
  summarize,
  numericValue,

  // High-level
  scrapeAndExport,
};