# RSI Hangar Manager / 星际公民机库管家

[中文文档](docs/README-cn.md) | **English**

Star Citizen RSI hangar management tool with CCU chain optimization. Automates login, hangar scraping, ship catalog browsing, and finds the most cost-effective Cross-Chassis Upgrade paths using Dijkstra's algorithm on a complete price graph with historical Warbond CCU data from [scorg.tools](https://scorg.tools/ccu).

## Features

- **Interactive login** — Playwright + system Chrome for Session persistence
- **Hangar scraping** — Concurrent extraction of all pledge items with upgrade histories
- **Ship catalog** — 250 ships with prices from RSI pledge store + ship matrix
- **CCU chain optimization** — Dijkstra on 37K+ edge graph, globally optimal paths
- **Historical CCU data** — WB and price-increase edges from scorg.tools (237 ships)
- **Chinese localization** — 335 ships + 960 paints with CN↔EN fuzzy matching
- **Four calculation modes** — Hangar-only / Full / Partial / Complete (no account needed)
- **Temporal consistency** — Optional same-date price verification for multi-hop chains

## Quick Start

```bash
# Install
npm install

# Login (interactive browser)
npm run login

# Scrape data
npm run scrape:headless              # Hangar items
npm run scrape:ships:headless        # Ship catalog
npm run scrape:historical:headless   # Historical CCU (optional, ~4 min)

# Calculate CCU chain
node -e "const { findBestChain, formatResults } = require('./src/ccu'); const i18n = require('./output/cache/i18n.json'); console.log(formatResults(findBestChain({ seedShip: 'Aurora Mk II', targetShip: 'Polaris', projectRoot: '.', useHistorical: true }), i18n));"
```

## Project Structure

```
├── src/
│   ├── ccu.js              # Dijkstra CCU calculator
│   ├── hangar.js           # Browser lifecycle, login, scraping
│   ├── historical-ccu.js   # scorg.tools scraper
│   ├── i18n.js             # Chinese localization
│   └── ships.js            # Ship catalog module
├── docs/ccu-rules.md       # CCU rules reference
├── output/                 # Scraped data (gitignored)
└── .claude/skills/         # Claude Code skill definition
```

## CCU Modes

| Mode | Owned CCUs | Historical WB | Login Required |
|------|-----------|---------------|----------------|
| Default (hangar-only) | ✓ | ✗ | Yes |
| Full | ✓ | ✓ | Yes |
| Partial | ✓ | ✓ (gap ships only) | Yes |
| Complete | ✗ | ✓ | **No** |

## Roadmap / TODO

| Status | Feature | Notes |
|--------|---------|-------|
| ✅ | Hangar scraping | Concurrent extraction of all pledge items |
| ✅ | Ship catalog | 250 ships from matrix + store |
| ✅ | CCU chain analysis | Dijkstra + 4 modes + recursive gap decomposition |
| ✅ | Historical CCU | scorg.tools integration (WB + price increase edges) |
| ✅ | Chinese localization | CN↔EN fuzzy matching with auto-cache |
| ⏳ | Store browser | Product listing — scraping done, purchase pending |
| ❌ | Store purchase | Buy CCUs / items directly |
| ❌ | Ship detail lookup | Specs, stats, comparison |
| ❌ | Spectrum forums | Post browsing, thread tracking |
| ❌ | Game events | Schedule, event tracking |
| ❌ | Event calendar | Release window prediction, roadmap estimation |

## License

GNU General Public License v3.0 — see [LICENSE](LICENSE).

This project is not affiliated with Cloud Imperium Games or Roberts Space Industries.
