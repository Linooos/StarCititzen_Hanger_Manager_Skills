/**
 * CCU Chain Calculator / CCU 升级链计算器
 * Dijkstra on complete price graph — globally optimal, no depth penalty.
 * @module ccu
 */
const fs = require("fs"), path = require("path");

// ===========================================================================
// 配置 / Config
// ===========================================================================
let VALUE_SPAN_WEIGHT = 1, SAVINGS_WEIGHT = 1;
function setWeights(v, s) { if (v != null) VALUE_SPAN_WEIGHT = v; if (s != null) SAVINGS_WEIGHT = s; }

// ===========================================================================
// 名称规范化 / Name normalization
// ===========================================================================
const ALIASES = {
  "hull a":"Hull-A","hull b":"Hull-B","hull c":"Hull-C","hull d":"Hull-D","hull e":"Hull-E",
  "cutlass steel":"Cutlass-Steel","cutlass red":"Cutlass-Red","cutlass blue":"Cutlass-Blue","cutlass black":"Cutlass-Black",
  "ironclad assault":"Ironclad-Assault","m2 hercules":"M2-Hercules","c2 hercules":"C2-Hercules","a2 hercules":"A2-Hercules",
  "avenger warlock":"Avenger-Warlock","avenger stalker":"Avenger-Stalker","avenger titan renegade":"Avenger-Titan-Renegade",
  "storm aa":"Storm-AA","c1 spirit":"C1-Spirit","a1 spirit":"A1-Spirit",
  "terrapin medic":"Terrapin-Medic","vanguard sentinel":"Vanguard-Sentinel","vanguard harbinger":"Vanguard-Harbinger",
  "vanguard hoplite":"Vanguard-Hoplite","guardian qi":"Guardian-QI","guardian mx":"Guardian-MX",
  "f7c r hornet tracker mk ii":"F7C-R-Hornet-Tracker-Mk-II","f7c m super hornet mk ii":"F7C-M-Super-Hornet-Mk-II",
  "zeus mk ii mr":"Zeus-Mk-II-MR","zeus mk ii es":"Zeus-Mk-II-ES",
  "apollo medivac":"Apollo-Medivac","apollo triage":"Apollo-Triage","starfarer gemini":"Starfarer-Gemini",
  "constellation taurus":"Constellation-Taurus","constellation andromeda":"Constellation-Andromeda",
  "constellation aquila":"Constellation-Aquila","starlancer max":"Starlancer-MAX","starlancer tac":"Starlancer-TAC",
  "fury mx":"Fury-MX","freelancer dur":"Freelancer-DUR","freelancer max":"Freelancer-MAX","freelancer mis":"Freelancer-MIS",
};
function normalize(n) { return n.toLowerCase().replace(/[-]/g," ").replace(/\s+/g," ").replace(/^(upgrade\s*-\s*)/i,"").replace(/\s*(standard|warbond)\s*edition\s*$/i,"").trim(); }
function matchShip(name, catalog, i18n) {
  if (!name) return null;
  if (i18n?.cnToEn?.[name]) name = i18n.cnToEn[name];
  if (i18n?.ships) for (const [en, cn] of Object.entries(i18n.ships)) { if (cn.short===name||cn.full===name) { name = en; break; } }
  const key = name.toLowerCase().trim();
  if (ALIASES[key]) { const m = catalog.find(s => s.name === ALIASES[key]); if (m) return m; }
  let m = catalog.find(s => s.name === name); if (m) return m;
  const n = normalize(name);
  m = catalog.find(s => normalize(s.name) === n); if (m) return m;
  const words = n.split(/\s+/).filter(w => w.length > 1);
  if (!words.length) return null;
  const cs = catalog.map(s => ({ ship: s, m: words.filter(w => normalize(s.name).includes(w)).length })).filter(x => x.m >= words.length).sort((a,b) => b.m - a.m);
  if (cs[0]) return cs[0].ship;
  const cs2 = catalog.map(s => ({ ship: s, m: words.filter(w => normalize(s.name).includes(w)).length })).filter(x => x.m >= Math.ceil(words.length*0.6)).sort((a,b) => b.m - a.m);
  return cs2[0]?.ship || null;
}

// ===========================================================================
// 数据加载 / Data loading
// ===========================================================================
function loadHangar(root) { return JSON.parse(fs.readFileSync(path.join(root,"output","hangar_items.json"),"utf-8")); }
function loadCatalog(root) { return JSON.parse(fs.readFileSync(path.join(root,"output","ships.json"),"utf-8")); }
function loadI18n(root) { const p = path.join(root,"output","i18n.json"); return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p,"utf-8")) : null; }
function loadCustomCCUs(root) { const p = path.join(root,"output","custom_ccus.json"); return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p,"utf-8")) : []; }
function saveCustomCCUs(root, data) { fs.writeFileSync(path.join(root,"output","custom_ccus.json"), JSON.stringify(data, null, 2)); }

// ===========================================================================
// 价格映射 / Price map
// ===========================================================================
function buildPriceMap(catalog) { const m = {}; catalog.forEach(s => { m[s.name] = s.price; }); return m; }

// ===========================================================================
// 核心：Dijkstra 最优路径 / Optimal path via Dijkstra
// ===========================================================================
function findBestChain(opts = {}) {
  const { seedShip, targetShip, projectRoot: root = ".", excludeIds = [] } = opts;
  const catalog = loadCatalog(root), i18n = loadI18n(root);
  const hangar = loadHangar(root);
  const priceMap = buildPriceMap(catalog);

  // 解析目标 / Resolve target
  const target = matchShip(targetShip, catalog, i18n);
  if (!target) return { error: `Target "${targetShip}" not found` };
  const tp = target.price;

  // 解析种子 / Resolve seed (hangar or virtual)
  const seeds = hangar.filter(i => i.category === "Standalone Ships" || i.category === "Game Packages");
  let seed = null;
  const sm = matchShip(seedShip, catalog, i18n);
  if (seedShip) {
    const s = seeds.find(x => x.actualShip === seedShip || x.name.includes(seedShip) || x.id === seedShip);
    if (s) {
      let a = s.actualShip; if (!a) { const cm = (s.contains||"").match(/Contains:\s*(.+?)\s+and\s+\d+\s+items?/); if (cm) a = cm[1]; } if (!a) a = s.name.split(/[\n-]/).pop().trim();
      seed = { id: s.id, label: s.name.trim().split("\n")[0], actualShip: a, meltValue: s.meltValue, storePrice: _shipPrice(a, catalog, i18n), insurance: s.insurance||[], virtual: false };
    }
    if (!seed && sm) seed = { id: "virtual", label: sm.name, actualShip: sm.name, meltValue: sm.price, storePrice: sm.price, insurance: [], virtual: true };
  }
  if (!seed) return { error: `Seed "${seedShip}" not found` };
  if (seed.storePrice >= tp) return { error: "Seed price >= target price" };

  // 构建拥有 CCU 的边 / Build owned CCU edges
  const exclude = new Set(excludeIds);
  const ownedEdges = {}; // "from→to" → {cost, id, isWarbond}
  hangar.filter(i => i.category === "Upgrades" && !exclude.has(i.id)).forEach(u => {
    if (!u.fromShip || !u.toShip) return;
    const fm = matchShip(u.fromShip, catalog, i18n), tm = matchShip(u.toShip, catalog, i18n);
    if (!fm || !tm || tm.price <= fm.price) return;
    const key = fm.name + "→" + tm.name;
    if (!ownedEdges[key] || u.meltValue < ownedEdges[key].cost) ownedEdges[key] = { cost: u.meltValue, id: u.id, isWarbond: u.isWarbond };
  });
  // 自定义 CCU / Custom CCUs
  (loadCustomCCUs(root)||[]).forEach(c => {
    if (!c.fromShip || !c.toShip) return;
    const fm = matchShip(c.fromShip, catalog, i18n), tm = matchShip(c.toShip, catalog, i18n);
    if (!fm || !tm || tm.price <= fm.price) return;
    const key = fm.name + "→" + tm.name;
    if (!ownedEdges[key] || (c.actualCost||0) < ownedEdges[key].cost) ownedEdges[key] = { cost: c.actualCost||0, id: "custom_"+key.replace(/[^a-zA-Z0-9]/g,"_"), isWarbond: c.isWarbond||false, custom: true };
  });

  // Dijkstra: 从种子到所有船的最短路 / Dijkstra on complete price graph
  const shipList = catalog.filter(s => s.price > seed.storePrice).sort((a,b) => a.price - b.price);
  const dist = {}, prev = {};
  dist[seed.actualShip] = 0;
  const visited = new Set();

  while (true) {
    let cur = null, minD = Infinity;
    for (const [s, d] of Object.entries(dist)) { if (!visited.has(s) && d < minD) { minD = d; cur = s; } }
    if (!cur || cur === target.name) break;
    visited.add(cur);
    const curPrice = priceMap[cur] || seed.storePrice;

    // 遍历所有更贵的船 / Try all more expensive ships
    for (const s of shipList) {
      if (s.price <= curPrice) continue;
      const neighbor = s.name;
      if (visited.has(neighbor)) continue;
      // 禁止同价换船 / No same-price switch
      if (s.price === curPrice && neighbor !== cur) continue;

      const ek = cur + "→" + neighbor;
      const owned = ownedEdges[ek];
      const edgeCost = owned ? owned.cost : (s.price - curPrice);
      const nd = dist[cur] + edgeCost;
      if (nd < (dist[neighbor]||Infinity)) {
        dist[neighbor] = nd;
        prev[neighbor] = { from: cur, to: neighbor, fromPrice: curPrice, toPrice: s.price, cost: edgeCost, owned: !!owned, ccuid: owned?.id||"", isWarbond: owned?.isWarbond||false, custom: owned?.custom||false };
      }
    }
  }

  if (!prev[target.name]) return { error: `No valid path to ${target.name}`, target: target.name, targetPrice: tp, seed, chain: null };

  // 重建路径 / Reconstruct path
  const steps = []; let node = target.name;
  while (prev[node]) { steps.unshift(prev[node]); node = prev[node].from; }
  const tccu = steps.reduce((s,e) => s + e.cost, 0), oc = steps.filter(e => e.owned).reduce((s,e) => s + e.cost, 0);
  const gc = steps.filter(e => !e.owned).reduce((s,e) => s + e.cost, 0), tm = seed.meltValue + tccu;
  const fv = tp, sv = fv - tm, ef = tm > 0 ? (fv/tm).toFixed(2) : "∞", hg = steps.some(e => !e.owned);

  return {
    target: target.name, targetPrice: tp, seed,
    chain: { seed, steps, totalMelt: tm, finalValue: fv, savings: sv, efficiency: ef, hasGaps: hg, ownedCost: oc, gapCost: gc },
    analysisInfo: { ownedEdges: Object.keys(ownedEdges).length, shipCount: shipList.length },
  };
}

function _shipPrice(n, c, i18n) { const m = matchShip(n, c, i18n); return m ? m.price : 0; }

// ===========================================================================
// 输出格式化 / Formatting (with i18n)
// ===========================================================================
function formatChainTable(chain, i18n) {
  const { seed, steps, totalMelt, finalValue, savings, efficiency, hasGaps, ownedCost, gapCost } = chain;
  const cn = (name) => {
    if (!i18n?.ships) return name;
    for (const c of [name, name.replace(/-/g," "), name.replace(/ /g,"-")]) { const e = i18n.ships[c]; if (e) return e.short || e.full || name; }
    return name;
  };
  const l = [];
  const seedTag = seed.virtual ? " [虚拟/需购买]" : "";
  l.push("",`**Seed Ship**: ${cn(seed.actualShip)} (${seed.label})${seedTag}`,`  Melt: $${seed.meltValue} | Insurance: ${seed.insurance.join(", ") || "无"}`, "");
  l.push("| # | From | To | From Value | To Value | CCU Cost | Source | Note |","|---|------|----|-----------|---------|----------|--------|------|");
  if (!steps.length) l.push(`| - | ${cn(seed.actualShip)} | *(at target)* | - | $${finalValue} | - | - | - |`);
  else steps.forEach((s,i) => {
    const src = s.owned ? (s.custom ? "自定义" : `#${s.ccuid}`) : "—";
    let note = s.owned ? "" : "⚠️ 无升级";
    if (s.owned && s.isWarbond) note = "Warbond" + (s.custom ? " (自定义)" : "");
    else if (s.owned && s.custom) note = "(自定义)";
    l.push(`| ${i+1} | ${cn(s.from)} | ${cn(s.to)} | $${s.fromPrice} | $${s.toPrice} | $${s.cost} | ${src} | ${note} |`);
  });
  const tc = steps.reduce((s,e) => s + e.cost, 0);
  l.push(`| | **TOTALS** | | | **$${finalValue}** | **$${tc}** | | |`,"");
  l.push(`- **种子船熔解价值**: $${seed.meltValue}`,`- **自有 CCU 实际成本**: $${ownedCost??tc}`);
  if (hasGaps||gapCost>0) l.push(`- **断层需购买成本**: $${gapCost||0}`);
  l.push(`- **总实际成本**: $${totalMelt}`,`- **最终船只价值**: $${finalValue}`,`- **节省**: $${savings} (${efficiency}x value)`);
  if (hasGaps) l.push(`\n> ⚠️ 含断层 — 标"无升级"的行需从商店原价购买。`);
  return l.join("\n");
}

function formatResults(result, i18n) {
  if (result.error) return `Error: ${result.error}`;
  if (!result.chain) return `## No valid path to **${result.target}**\n\nNo upgrade path exists without illegal same-price side-grades.`;
  const cn = i18n?.ships ? (n) => { for (const c of [n, n.replace(/-/g," "), n.replace(/ /g,"-")]) { const e = i18n.ships[c]; if (e) return e.short||e.full||n; } return n; } : (n)=>n;
  const l=[];
  l.push(`## CCU Chain: ${cn(result.seed.actualShip)} → **${cn(result.target)}** ($${result.targetPrice})`);
  l.push(`_${result.analysisInfo.ownedEdges} owned CCU edges, ${result.analysisInfo.shipCount} ships in graph_`,"");
  l.push(`### Best — $${result.chain.totalMelt} (${result.chain.efficiency}x)`);
  l.push(formatChainTable(result.chain, i18n));
  return l.join("\n");
}

module.exports = { setWeights, normalize, matchShip, ALIASES, findBestChain, formatChainTable, formatResults, loadCustomCCUs, saveCustomCCUs };
