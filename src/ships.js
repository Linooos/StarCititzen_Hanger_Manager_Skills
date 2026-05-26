/**
 * RSI Ship Catalog Module / 星际公民船只目录模块
 *
 * 逐厂商点击轮播标签翻页爬取全部船只数据
 * Clicks each manufacturer filter in the carousel, iterates pagination.
 *
 * @module ships
 */

const { launchContext } = require("./hangar");
const fs = require("fs");
const path = require("path");

// Navigate without sale param to include unavailable ships (needed for CCU calcs)
const SHIPS_URL = "https://robertsspaceindustries.com/en/pledge/ships?sortField=name&sortDirection=asc";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// Manufacturer list from carousel
// ---------------------------------------------------------------------------

async function getManufacturers(page) {
  return page.evaluate(() => {
    const slides = document.querySelectorAll(
      ".c-storeSubNavigationCarousel__carousel .swiper-slide"
    );
    return Array.from(slides)
      .map((s, i) => ({ name: s.textContent.trim(), index: i }))
      .filter((m) => m.name !== "All Manufacturers" && m.name.length > 0);
  });
}

// ---------------------------------------------------------------------------
// Ship card extraction from grid
// ---------------------------------------------------------------------------

async function extractShipCards(page) {
  return page.evaluate(() => {
    const grid = document.querySelector(".shipsList-cardStack__grid");
    if (!grid) return [];
    const result = [];

    for (const card of grid.children) {
      const text = card.textContent.replace(/\s+/g, " ").trim();
      const links = card.querySelectorAll("a");
      const href = links.length > 0 ? links[0].getAttribute("href") : "";

      const statusMatch = text.match(/^(\w[\w\s-]+?)(?=Max crew:)/);
      const crewMatch = text.match(/Max crew:\s*(\d+)/);
      const priceMatch = text.match(/\$([\d,]+(?:\.\d{2})?)\s*USD/);
      const shipValueIdx = text.indexOf("Ship Value");

      let name = "", manufacturerSlug = "";
      if (href) {
        const parts = href.replace("/pledge/ships/", "").split("/");
        if (parts.length >= 2) { manufacturerSlug = parts[0]; name = parts[1]; }
      }

      let rolesText = "";
      if (crewMatch && shipValueIdx > 0) {
        const afterCrew = text.indexOf(crewMatch[0]) + crewMatch[0].length;
        rolesText = text.substring(afterCrew, shipValueIdx).trim();
        if (name) {
          const ni = rolesText.lastIndexOf(name);
          if (ni > 0) rolesText = rolesText.substring(0, ni).trim();
        }
      }

      const roles = rolesText
        ? rolesText.split(/\s*\/\s*/).map((r) => r.trim()).filter((r) => r.length > 0)
        : [];

      const price = priceMatch ? parseFloat(priceMatch[1].replace(/,/g, "")) : 0;

      result.push({
        name, manufacturer: "", manufacturerSlug, price,
        crew: crewMatch ? parseInt(crewMatch[1]) : 0,
        status: statusMatch ? statusMatch[1].trim() : "",
        roles, slug: name, href,
        url: href ? "https://robertsspaceindustries.com" + href : "",
      });
    }
    return result;
  });
}

// ---------------------------------------------------------------------------
// Pagination on catalog
// ---------------------------------------------------------------------------

async function getTotalShipPages(page) {
  return page.evaluate(() => {
    const items = document.querySelectorAll(".orion-c-pagination__item");
    let max = 1;
    items.forEach((item) => {
      const link = item.querySelector(".orion-c-pagination__link");
      if (link) { const n = parseInt(link.textContent.trim()); if (!isNaN(n) && n > max) max = n; }
    });
    return max;
  });
}

// ---------------------------------------------------------------------------
// Main Scraper: click each manufacturer, scrape their ships
// ---------------------------------------------------------------------------

async function scrapeAllShips(context, opts = {}) {
  // Step 1: Get manufacturer list
  const initPage = await context.newPage();
  await initPage.goto(SHIPS_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
  await initPage.waitForTimeout(5000);
  const manufacturers = await getManufacturers(initPage);
  console.log(`  Manufacturers: ${manufacturers.length}`);

  // Step 2: For each manufacturer, click its button, scrape all pages
  const seen = new Set();
  const allShips = [];

  for (const mfr of manufacturers) {
    // Navigate back to base URL to reset filters
    if (mfr.index > 0) {
      // Click the manufacturer button
      const btn = initPage
        .locator(".c-storeSubNavigationCarousel__carousel .swiper-slide")
        .nth(mfr.index)
        .locator("button");
      if (await btn.count() > 0) {
        await btn.click({ timeout: 5000 });
        await initPage.waitForTimeout(3000);
      }
    }

    const totalPages = await getTotalShipPages(initPage);
    const mfrShips = [];

    for (let pg = 1; pg <= totalPages; pg++) {
      if (pg > 1) {
        // Navigate to page within this manufacturer filter
        const currentUrl = new URL(initPage.url());
        currentUrl.searchParams.set("page", String(pg));
        await initPage.goto(currentUrl.toString(), {
          waitUntil: "domcontentloaded", timeout: 30000,
        });
        await initPage.waitForTimeout(2000);
      }

      const ships = await extractShipCards(initPage);
      mfrShips.push(...ships);
      if (ships.length === 0) break;
      if (pg < totalPages) await sleep(800);
    }

    // Tag ships with manufacturer
    mfrShips.forEach((s) => {
      s.manufacturer = mfr.name;
      if (!seen.has(s.href)) {
        seen.add(s.href);
        allShips.push(s);
      }
    });

    console.log(`  [${mfr.name}] ${mfrShips.length} ships (${totalPages} pages)`);
  }

  await initPage.close();
  return allShips;
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

function exportJSON(data, filePath) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function exportCSV(ships, filePath) {
  const headers = [
    "name", "manufacturer", "manufacturerSlug", "price", "crew",
    "status", "roles", "slug", "url",
  ];
  const lines = [headers.join(",")];
  ships.forEach((s) => {
    const row = headers.map((h) => {
      let val = s[h];
      if (val == null) val = "";
      if (Array.isArray(val)) val = val.join("; ");
      val = String(val);
      return val.includes(",") ? `"${val.replace(/"/g, '""')}"` : val;
    });
    lines.push(row.join(","));
  });
  fs.writeFileSync(filePath, "﻿" + lines.join("\n"), "utf-8");
}

// ---------------------------------------------------------------------------
// High-level
// ---------------------------------------------------------------------------

async function scrapeAndExport(userDataDir, outputDir, opts = {}) {
  const { headless = false } = opts;
  const { context, cleanup } = await launchContext(userDataDir, { headless });

  let ships;
  try {
    ships = await scrapeAllShips(context);
  } finally { await cleanup(); }

  const withMfr = ships.filter((s) => s.manufacturer).length;
  console.log(`  Total: ${ships.length} ships, ${withMfr} with manufacturer`);

  exportJSON(ships, path.join(outputDir, "ships.json"));
  exportCSV(ships, path.join(outputDir, "ships.csv"));
  return ships;
}

module.exports = {
  SHIPS_URL,
  getManufacturers,
  extractShipCards,
  getTotalShipPages,
  scrapeAllShips,
  exportJSON,
  exportCSV,
  scrapeAndExport,
};
