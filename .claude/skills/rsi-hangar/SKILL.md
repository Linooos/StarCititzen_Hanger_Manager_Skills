---
name: rsi-hangar
description: >
  Manage Star Citizen RSI hangar data — login, scrape pledged items, analyze inventory,
  and extend the hangar management toolkit. Use this skill whenever the user mentions
  Star Citizen, RSI, Roberts Space Industries, 星际公民, hangar, 机库, pledged items,
  hangar items, CCU upgrades, ship inventory, or wants to scrape, analyze, filter,
  sort, or export their RSI hangar data. Also use when the user talks about managing
  or extending the hangar project itself.
---

# RSI Hangar Manager

You are the steward of the RSI Hangar Management project. This skill covers the
full lifecycle: interactive login, paginated scraping with category classification,
data export, analysis, and toolkit extension.

## Project layout

```
D:/WindowsFiles/Users/Stainless_Kettle/Desktop/1/
├── src/
│   ├── hangar.js    # Core library — all reusable functions
│   ├── login.js     # Interactive login CLI
│   └── scrape.js    # Scraper CLI
├── user_data/       # Chrome persistent profile (session cache)
├── output/          # Generated exports (JSON/CSV)
├── config.json      # URL and path configuration
├── package.json     # npm scripts
└── .gitignore
```

## Environment setup & dependency recovery

This project bundles `node_modules/` to avoid network installs, but if dependencies
are missing or the environment is broken, follow these steps.

### 1. Check Node.js

```bash
node --version   # must be >= 18
npm --version
```

If Node.js is not installed, direct the user to download it from https://nodejs.org
(LTS version, 18.x or later). On Windows, the official installer is the simplest path.
After installing, verify with `node --version`.

### 2. Check Chrome browser

The project requires **Google Chrome** installed system-wide (not Chromium, not Edge).
Verify with:

```bash
ls "/c/Program Files/Google/Chrome/Application/chrome.exe"
```

If Chrome is missing, direct the user to install it from https://www.google.com/chrome/.

### 3. Recover node_modules

If `node_modules/` is missing or corrupted:

```bash
cd <project-root>
npm install
```

If the user is in China and npm is slow, use the npmmirror registry:

```bash
npm install --registry=https://registry.npmmirror.com
```

This pulls `playwright` — the only dependency. No separate browser download is needed
because the project uses system Chrome via `channel: "chrome"`.

### 4. Quick health check

Run this one-liner to verify the environment is ready:

```bash
cd <project-root> && node -e "require('playwright'); console.log('[OK] Dependencies loaded')" && node -e "require('./src/hangar'); console.log('[OK] Hangar module loaded')"
```

Expected output: two `[OK]` lines. If these pass, the project is fully operational.

### 5. First-time user flow

For a fresh clone or new machine:

1. Install Node.js (if missing)
2. Install Chrome (if missing)
3. `npm install` (if node_modules missing)
4. `npm run login` — sign in to RSI with 2FA
5. `npm run scrape` — pull your hangar data

After step 4, the session persists in `user_data/` and login is no longer needed
until the session expires (typically weeks).

## Commands

| Command | What it does |
|---------|-------------|
| `npm run login` | Interactive login — opens Chrome, waits for user to complete 2FA, saves session |
| `npm run scrape` | Scrape all MY GEAR items with concurrent tabs, export to output/ |
| `npm run scrape:headless` | Same as scrape but background (no visible browser) |
| `npm run scrape:ships` | Scrape ship catalog — clicks each manufacturer, gets prices + roles |
| `npm run scrape:ships:headless` | Ship catalog in headless mode |

All scripts must be run from the **project root** (`cd` to it first).

## Core module API (`src/hangar.js`)

The heart of the project. Every function is documented with JSDoc.

### Browser & Login

- **`launchContext(userDataDir, opts)`** — Launch persistent Chromium context with RSI session.
  Options: `headless` (default false), `viewport`, `channel` (default "chrome").
  Returns `{context, cleanup}`.

- **`login(userDataDir, opts)`** — Open sign-in page, auto-detect login completion by polling URL.
  Options: `timeoutMinutes` (default 10), `pollIntervalMs`, `onStatus` callback.
  Throws with `err.code = 'LOGIN_TIMEOUT'` or `'LOGIN_FAILED'`.

- **`saveSession(context, page, outputDir)`** — Save cookies.json + local_storage.json.

### Discovery & Extraction

- **`getCategories(page)`** — Returns `[{value, label}]` from the selectlist dropdown.
- **`getTotalPages(page)`** — Reads max page from `.pager.clearfix` element.
- **`expandAllItems(page)`** — Click all expand arrows to reveal insurance, attached items, actual ship.
- **`expandUpgradeLogs(page)`** — Click each upgrade-log button sequentially, extract CCU chains.
  Returns `Array<Array<Step>>`. (All buttons share one DOM container — must click→extract→next.)
- **`extractPageItems(page, opts)`** — Parse all pledge items with full detail (v2 enhanced).
- **`extractUpgradeChain(page, itemIndex)`** — Low-level: click single button and parse its chain.

### Scraping

- **`scrapeCategory(context, category, opts)`** — Scrape all pages of one category.
  Auto-expands items and extracts CCU chains for ship categories (standalone_ship, game_package).
- **`scrapeAll(context, opts)`** — Concurrently scrape all categories (default 4 tabs).
  Options: `concurrency`, `baseUrl`, `onProgress({category, items, total})`.

### Export & Analysis

- **`exportJSON(items, filePath)`** — Write JSON file.
- **`exportCSV(items, filePath)`** — Write CSV with UTF-8 BOM (Excel-compatible), all v2 fields.
- **`summarize(items)`** — Returns `{byCategory, totalItems, totalValue}` grouped by category.
- **`numericValue(priceStr)`** — Extract numeric USD from price string (e.g., `"$10.00 USD"` → `10`).
- **`scrapeAndExport(userDataDir, outputDir, opts)`** — One-shot: launch → scrape → export.

## Item data schema (v2 — enhanced)

Each scraped item has these fields:

### Core fields

| Field | Type | Example | Description |
|-------|------|---------|-------------|
| `id` | string | `"108071856"` | Unique pledge ID |
| `name` | string | `"Upgrade - Hull A to Nova Warbond Edition"` | Display name from h3 |
| `category` | string | `"Upgrades"` | Human-readable category |
| `categoryValue` | string | `"upgrade"` | URL product-type param |

### Value fields

| Field | Type | Example | Description |
|-------|------|---------|-------------|
| `value` | string | `"$10.00 USD"` | Display price |
| `meltValue` | number | `10` | Numeric USD — actual amount paid (dissolve value) |
| `configValue` | string | `"$0.00 USD"` | Additional configuration cost |
| `currency` | string | `"Store Credit"` | Payment method |
| `notBuybackable` | boolean | `false` | Cannot be bought back after melt |

### Status fields

| Field | Type | Example | Description |
|-------|------|---------|-------------|
| `availability` | string | `"Attributed"` | Item status |
| `upgraded` | boolean | `true` | Has upgrades been applied |
| `created` | string | `"May 23, 2026"` | Acquisition date |
| `giftable` | boolean | `true` | Can be gifted to another account |
| `exchangeable` | boolean | `true` | Can be melted for store credit |

### Content fields

| Field | Type | Example | Description |
|-------|------|---------|-------------|
| `contains` | string | `"Contains: Ironclad and 7 items"` | Raw contains text |
| `actualShip` | string | `"Ironclad"` | Actual ship after all upgrades (may differ from label) |
| `containsItemCount` | number | `7` | Number of sub-items in the package |
| `insurance` | string[] | `["LTI", "120mo"]` | Insurance types found (deduplicated) |
| `attachedItems` | string[] | `["...", "..."]` | Sub-item descriptions |
| `attachedCount` | number | `7` | Count of attached sub-items |
| `image` | string | `"https://media.robertsspaceindustries.com/..."` | Item thumbnail URL |

### Upgrade-specific fields (only populated for Upgrades category)

| Field | Type | Example | Description |
|-------|------|---------|-------------|
| `fromShip` | string | `"Hull A"` | Source ship for this CCU |
| `toShip` | string | `"Nova"` | Target ship for this CCU |
| `isWarbond` | boolean | `true` | Discounted (Warbond) upgrade |
| `upgradeChain` | object[] | see below | CCU chain applied to a ship (extracted automatically for ship categories) |

Each `upgradeChain` step object:

| Sub-field | Type | Example | Description |
|-----------|------|---------|-------------|
| `date` | string | `"Feb 02 2026, 12:35 am"` | When this CCU was applied |
| `ccuId` | string | `"101674810"` | CCU pledge ID |
| `from` | string | `"RAFT"` | Source ship |
| `to` | string | `"Hermes"` | Target ship |
| `isWarbond` | boolean | `true` | Discounted Warbond CCU |
| `newValue` | number | `115` | Total ship value after this CCU was applied |

## Product categories

The selectlist on the hangar page provides these filters:

| Filter | `product-type` value |
|--------|---------------------|
| All | *(empty — skip during scrape)* |
| Game Packages | `game_package` |
| Standalone Ships | `standalone_ship` |
| Upgrades | `upgrade` |
| Hangar Decorations | `hangar_decoration` |
| Component | `components` |
| Weapon | `weapon` |
| Subscriber Flair | `flair` |

Categories with zero items for the current account will appear as empty in results.

## Key URLs

- **Sign-in**: `https://robertsspaceindustries.com/en/sign-in`
- **Hangar (MY GEAR)**: `https://robertsspaceindustries.com/en/account/pledges`
- **Category filter**: `?page=1&product-type=<type>` appended to hangar URL
- **Pagination**: `?page=N` — max page detected from `.pager.clearfix` links

## Typical workflows

### First-time setup or re-login

```bash
cd D:/WindowsFiles/Users/Stainless_Kettle/Desktop/1
npm run login
```

The browser opens to the RSI sign-in page. The user completes login + 2FA manually.
The script auto-detects the redirect and saves the session to `user_data/`.

### Refresh inventory data

```bash
npm run scrape
```

Scrapes all categories concurrently (4 tabs), exports to `output/hangar_items.json`
and `output/hangar_items.csv`, prints a category summary.

### Programmatic use in a new script

```js
const path = require("path");
const {
  launchContext, scrapeAll, exportJSON, summarize
} = require("./src/hangar");

const ROOT = "D:/WindowsFiles/Users/Stainless_Kettle/Desktop/1";
const { context, cleanup } = await launchContext(
  path.join(ROOT, "user_data"), { headless: true }
);

const items = await scrapeAll(context, {
  concurrency: 4,
  onProgress: ({ category, items: count }) =>
    console.log(`${category}: ${count}`),
});

const stats = summarize(items);
console.log(`Total: ${stats.totalItems} items, $${stats.totalValue.toFixed(2)}`);
exportJSON(items, path.join(ROOT, "output", "result.json"));
await cleanup();
```

### Common analysis tasks

## Ship Catalog (`src/ships.js`)

Scrapes the pledge store (`https://robertsspaceindustries.com/en/pledge/ships`)
by clicking each manufacturer filter in the carousel and iterating pagination.
Outputs to `output/ships.json` + `output/ships.csv`.

### Module API

- **`getManufacturers(page)`** — Returns `[{name, index}]` from carousel.
- **`extractShipCards(page)`** — Parse ship cards from `.shipsList-cardStack__grid`.
- **`getTotalShipPages(page)`** — Read `.orion-c-pagination` for page count.
- **`scrapeAllShips(context)`** — Click each manufacturer button, scrape all their ships.
- **`exportJSON(ships, path)`**, **`exportCSV(ships, path)`** — Write output files.

### Ship data schema

| Field | Type | Example | Description |
|-------|------|---------|-------------|
| `name` | string | `"Avenger-Titan"` | Ship display slug |
| `manufacturer` | string | `"Aegis Dynamics"` | Manufacturer name |
| `manufacturerSlug` | string | `"aegis-avenger"` | URL series slug |
| `price` | number | `55.00` | Store price in USD |
| `crew` | number | `1` | Max crew |
| `status` | string | `"Flight Ready"` | Development status |
| `roles` | string[] | `["Light Fighter", "Starter"]` | Ship roles |
| `slug` | string | `"Avenger-Titan"` | URL slug |
| `url` | string | `"https://robertsspaceindustries.com/pledge/ships/..."` | Detail page URL |

### Manufacturer filter mechanism

The carousel tabs are `<button>` elements inside `.swiper-slide`. Clicking a button
updates the URL with `?manufacturerId=N` and filters the ship grid. The scraper
clicks each button sequentially (indices 1..N, skipping index 0 "All Manufacturers"),
reads pagination, and extracts ships. All ships are tagged with the manufacturer
name and deduplicated by `href`.

### Analysis snippet

```js
const ships = require("./output/ships.json");

// Find cheapest LTI token (starter ships)
const cheap = ships
  .filter((s) => s.price > 0 && s.price <= 50)
  .sort((a, b) => a.price - b.price);
console.table(cheap.map((s) => ({ name: s.name, price: s.price, mfr: s.manufacturer })));

// Ships by manufacturer
const byMfr = {};
ships.forEach((s) => {
  byMfr[s.manufacturer] = (byMfr[s.manufacturer] || 0) + 1;
});
```

## Extending the project

When asked to add new functionality:

1. **Add functions to `src/hangar.js`** — this is the shared library. Export new functions
   in `module.exports`. Keep JSDoc comments for IntelliSense.

2. **Create CLI wrappers** in new files under `src/` if the feature warrants a standalone
   command. Keep CLIs thin — delegate logic to `hangar.js`.

3. **Add npm scripts** to `package.json` for new CLI commands.

4. **Do NOT put data files in `src/`** — generated files go to `output/`,
   session data stays in `user_data/`.

5. **Do NOT commit `user_data/` or `output/`** — they are in `.gitignore`.

### Example: adding a "value-only" export feature

When asked, add to `hangar.js`:

```js
function extractValue(item) {
  return parseFloat(item.value.replace(/[^0-9.]/g, "")) || 0;
}
module.exports = { ..., extractValue };
```

## Anti-detection notes

- We use **system Chrome** (`channel: "chrome"`) which carries the user's real browser
  fingerprint — far less likely to trigger Cloudflare than Playwright's bundled Chromium.
- The persistent user data directory preserves login cookies between sessions.
- Login auto-detection polls `page.url()` every 2s — when `/sign-in` and `/login`
  disappear from the URL, login is considered complete.
- If Cloudflare blocks (Code 4237), the first thing to try is re-running `npm run login`
  with a visible browser so the user can solve any CAPTCHA.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| `node: command not found` | Node.js not installed | Install from https://nodejs.org (LTS 18+) |
| `Cannot find module 'playwright'` | node_modules missing | Run `npm install` (or with `--registry=https://registry.npmmirror.com`) |
| `Cannot find module './src/hangar'` | Wrong working directory | `cd` to project root first |
| "Executable doesn't exist" | System Chrome not found | Install Chrome from https://www.google.com/chrome/ |
| `ERR_CONNECTION_CLOSED` | Transient network issue | Retry — it usually resolves |
| "Login timed out" | User didn't complete login in 10 min | Re-run `npm run login` |
| Cloudflare Code 4237 | Bot detection triggered | Use headed mode, solve CAPTCHA manually |
| Empty category results | No items in that category | Normal — some categories may be empty |
| Scraper gets 0 items | Session expired | Run `npm run login` first to refresh session |
| Upgrade chains empty (`upgradeChain: []`) | `expandUpgradeLogs` not called before extraction, or buttons share one container and only last one loaded | Ensure `scrapeCategory` flow: expandAllItems → expandUpgradeLogs → extractPageItems. All buttons share ONE `.pledge-upgrade-log-rows` — must click→extract→next sequentially |