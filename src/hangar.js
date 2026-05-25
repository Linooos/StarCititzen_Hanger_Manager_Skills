/**
 * RSI Hangar Module
 *
 * Reusable library for scraping the RSI "MY GEAR" hangar page.
 * Handles browser launch, category discovery, paginated scraping,
 * data export (JSON/CSV), and summary statistics.
 *
 * @module hangar
 */

const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BASE_URL = "https://robertsspaceindustries.com/en/account/pledges";
const LOGIN_URL = "https://robertsspaceindustries.com/en/sign-in";
const DEFAULT_CONCURRENCY = 4;
const DEFAULT_VIEWPORT = { width: 1280, height: 800 };
const DEFAULT_LOGIN_TIMEOUT_MIN = 10;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
// Browser
// ---------------------------------------------------------------------------

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
// Login
// ---------------------------------------------------------------------------

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
// Category Discovery
// ---------------------------------------------------------------------------

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
// Pagination
// ---------------------------------------------------------------------------

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
// Item Extraction
// ---------------------------------------------------------------------------

/**
 * Extract all pledge items visible on the current page.
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

      const nameEl = li.querySelector("h3");
      const imgEl = li.querySelector(".image");

      result.push({
        id: getVal("js-pledge-id"),
        name: nameEl ? nameEl.textContent.trim() : getVal("js-pledge-name"),
        value: getVal("js-pledge-value"),
        configValue: getVal("js-pledge-configuration-value"),
        currency: getVal("js-pledge-currency"),
        notBuybackable: getVal("js-pledge-not-buybackable") === "1",
        image: imgEl
          ? (imgEl.style.backgroundImage || "").replace(/url\(['"]?|['"]?\)/g, "")
          : "",
        category: options.catLabel || "",
        categoryValue: options.catValue || "",
      });
    });

    return result;
  }, { catLabel: opts.categoryLabel || "", catValue: opts.categoryValue || "" });
}

// ---------------------------------------------------------------------------
// Category Scraping
// ---------------------------------------------------------------------------

/**
 * Scrape all pages of a single category.
 * Opens its own page, scrapes, then closes it.
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

      const pageItems = await extractPageItems(page, {
        categoryLabel: category.label,
        categoryValue: category.value,
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
// Bulk Scraping
// ---------------------------------------------------------------------------

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
// Export
// ---------------------------------------------------------------------------

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
    "id", "name", "value", "configValue", "currency",
    "notBuybackable", "category", "categoryValue", "image",
  ];

  const lines = [headers.join(",")];
  items.forEach((item) => {
    const row = headers.map((h) => {
      const val = String(item[h] != null ? item[h] : "");
      return val.includes(",") ? `"${val.replace(/"/g, '""')}"` : val;
    });
    lines.push(row.join(","));
  });

  fs.writeFileSync(filePath, "﻿" + lines.join("\n"), "utf-8");
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

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
// Combined: one-call scrape + export
// ---------------------------------------------------------------------------

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
// Exports
// ---------------------------------------------------------------------------

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

  // Extraction
  extractPageItems,

  // Scraping
  scrapeCategory,
  scrapeAll,

  // Export
  exportJSON,
  exportCSV,

  // Analysis
  summarize,

  // High-level
  scrapeAndExport,
};