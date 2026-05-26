/**
 * Data Validation / 数据验证模块
 *
 * 检查 output/ 下的数据完整性，发现问题时给出修复建议。
 * Usage: node src/validate.js
 */

const fs = require("fs");
const path = require("path");

const PROJECT_ROOT = path.resolve(__dirname, "..");

function load(file) {
  const p = path.join(PROJECT_ROOT, "output", file);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf-8")) : null;
}

function validate() {
  const results = { ok: true, issues: [], warnings: [] };

  // 1. 机库数据 / Hangar data
  const hangar = load("hangar_items.json");
  if (!hangar) {
    results.issues.push("hangar_items.json missing — run: npm run scrape");
    results.ok = false;
  } else {
    const seeds = hangar.filter(i => i.category === "Standalone Ships" || i.category === "Game Packages");
    const upgrades = hangar.filter(i => i.category === "Upgrades");
    if (hangar.length < 50) results.issues.push(`Hangar items low: ${hangar.length} (expected ~88)`);
    if (seeds.length < 3) results.warnings.push(`Seed ships low: ${seeds.length}`);
    if (upgrades.length < 30) results.issues.push(`Upgrades low: ${upgrades.length}`);
    const hasPrices = hangar.filter(i => i.meltValue > 0).length;
    if (hasPrices < 50) results.warnings.push(`Items with meltValue low: ${hasPrices}`);
    console.log(`  Hangar: ${hangar.length} items, ${seeds.length} seeds, ${upgrades.length} upgrades`);
  }

  // 2. CCU 分析 / CCU analysis
  const ccu = load("ccu_analysis.json");
  if (!ccu) {
    results.warnings.push("ccu_analysis.json missing — run: npm run scrape (or ccu:precompute)");
  } else {
    console.log(`  CCU: ${ccu.upgradeCount} upgrades, ${ccu.chainCount} chains, ${ccu.isolatedCount} isolated`);
    if (ccu.chainCount < 10) results.warnings.push(`CCU chains low: ${ccu.chainCount}`);
  }

  // Summary
  console.log();
  if (results.issues.length > 0) {
    console.log("❌ ISSUES (fix before CCU analysis):");
    results.issues.forEach(i => console.log("  - " + i));
  }
  if (results.warnings.length > 0) {
    console.log("⚠️  WARNINGS:");
    results.warnings.forEach(w => console.log("  - " + w));
  }
  if (results.issues.length === 0 && results.warnings.length === 0) {
    console.log("✓ All data validated — ready for CCU analysis");
  }

  return results;
}

// CLI
if (require.main === module) {
  console.log("=".repeat(50));
  console.log("  Data Validation");
  console.log("=".repeat(50));
  console.log();
  const r = validate();
  process.exit(r.ok ? 0 : 1);
}

module.exports = { validate, load };
