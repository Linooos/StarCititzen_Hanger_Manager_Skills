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
let CREDIT_RATE = 0.65;
function setWeights(v, s) { if (v != null) VALUE_SPAN_WEIGHT = v; if (s != null) SAVINGS_WEIGHT = s; }
function setCreditRate(r) { if (r != null && r > 0 && r <= 1) CREDIT_RATE = r; }

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
function loadCatalog(root) { return JSON.parse(fs.readFileSync(path.join(root,"output","cache","ships.json"),"utf-8")); }
function loadI18n(root) { const p = path.join(root,"output","cache","i18n.json"); return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p,"utf-8")) : null; }
function loadCustomCCUs(root) { const p = path.join(root,"output","custom_ccus.json"); return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p,"utf-8")) : []; }
function saveCustomCCUs(root, data) { fs.writeFileSync(path.join(root,"output","custom_ccus.json"), JSON.stringify(data, null, 2)); }
function loadHistoricalCCUs(root, dateFrom) { try { return require("./historical-ccu").loadHistoricalCCUs(root, dateFrom); } catch(_) { return {}; } }

/** Load ALL WB events within date range, not just the best price.
 *  Returns { ShipName: [{wbPrice, wbDate, regularPrice, event}, ...] } */
function loadAllWBEevents(root, dateFrom) {
  const result = {}, norm = (n) => (n||"").toLowerCase().replace(/[-]/g," ").replace(/\s+/g," ").trim();
  try {
    const p = path.join(root, "output", "cache", "historical_ccus.json");
    if (!fs.existsSync(p)) return result;
    const raw = JSON.parse(fs.readFileSync(p, "utf-8"));
    const ships = Array.isArray(raw) ? raw.filter(s => !s._metadata) : (raw.ships || []);
    const from = dateFrom ? (typeof dateFrom === "string" ? new Date(dateFrom) : dateFrom) : null;
    ships.forEach(s => {
      const wbEvents = [];
      for (const h of (s.history || [])) {
        if (h.status !== "Warbond" || h.price == null || h.price >= s.regularPrice) continue;
        if (from && h.date) { const d = new Date(h.date); if (isNaN(d.getTime()) || d < from) continue; }
        wbEvents.push({ wbPrice: h.price, wbDate: h.date, regularPrice: s.regularPrice, event: h.event || "" });
      }
      if (wbEvents.length) { result[s.shipName] = wbEvents; result[norm(s.shipName)] = wbEvents; }
    });
  } catch (_) {}
  return result;
}

// 排除 CCU 文件
function loadExcludedCCUs(root) {
  const p = path.join(root, "output", "excluded_ccus.json");
  if (!fs.existsSync(p)) return { pairs: new Set(), byIds: new Set() };
  try { const data = JSON.parse(fs.readFileSync(p, "utf-8")); return { pairs: new Set(data.pairs || []), byIds: new Set(data.ids || []) }; } catch (_) { return { pairs: new Set(), byIds: new Set() }; }
}
function saveExcludedCCUs(root, pairs, ids) {
  fs.writeFileSync(path.join(root, "output", "excluded_ccus.json"), JSON.stringify({ pairs: pairs || [], ids: ids || [] }, null, 2));
}

function buildFirstAppearance(root) {
  const map = {}, norm = (n) => (n||"").toLowerCase().replace(/[-]/g," ").replace(/\s+/g," ").trim();
  try {
    const p = path.join(root, "output", "cache", "historical_ccus.json");
    if (fs.existsSync(p)) { const raw = JSON.parse(fs.readFileSync(p, "utf-8")); const ships = Array.isArray(raw) ? raw.filter(s => !s._metadata) : (raw.ships || []);
      ships.forEach(s => { if (!s.history || !s.history.length) return; let e = null; for (const h of s.history) { if (h.date && (!e || h.date < e)) e = h.date; } if (e) { map[s.shipName] = e; map[norm(s.shipName)] = e; } }); }
  } catch (_) {}
  return map;
}

function buildPriceHistory(root) {
  const map = {}, norm = (n) => (n||"").toLowerCase().replace(/[-]/g," ").replace(/\s+/g," ").trim();
  try {
    const p = path.join(root, "output", "cache", "historical_ccus.json");
    if (fs.existsSync(p)) { const raw = JSON.parse(fs.readFileSync(p, "utf-8")); const ships = Array.isArray(raw) ? raw.filter(s => !s._metadata) : (raw.ships || []);
      ships.forEach(s => { const prices = []; for (const h of (s.history || [])) { if (h.price != null && h.date) prices.push({ date: h.date, price: h.price }); }
        if (prices.length) { prices.sort((a,b) => a.date.localeCompare(b.date)); map[s.shipName] = prices; map[norm(s.shipName)] = prices; } }); }
  } catch (_) {}
  return map;
}
function getPriceAtDate(histPrices, targetDate) {
  if (!histPrices || !histPrices.length) return null;
  let best = null;
  for (const p of histPrices) { if (p.date <= targetDate) best = p.price; else break; }
  return best;
}

// ===========================================================================
// 价格映射 / Price map
// ===========================================================================
function buildPriceMap(catalog) { const m = {}; catalog.forEach(s => { m[s.name] = s.price; }); return m; }

function patchZeroPrices(catalog, root) {
  const zeroShips = catalog.filter(s => s.price === 0);
  if (zeroShips.length === 0) return { patched: 0 };
  let histPrices = {};
  try {
    const p = require("path").join(root, "output", "cache", "historical_ccus.json");
    if (require("fs").existsSync(p)) {
      const raw = JSON.parse(require("fs").readFileSync(p, "utf-8"));
      const ships = Array.isArray(raw) ? raw.filter(s => !s._metadata) : (raw.ships || []);
      ships.forEach(s => { if (s.shipName && s.regularPrice > 0) histPrices[s.shipName] = s.regularPrice; });
    }
  } catch (_) {}
  let patched = 0;
  const norm = (n) => (n||"").toLowerCase().replace(/[-]/g," ").replace(/\s+/g," ").trim();
  for (const s of catalog) {
    if (s.price !== 0) continue;
    if (histPrices[s.name] > 0) { s.price = histPrices[s.name]; patched++; continue; }
    const ns = norm(s.name);
    const key = Object.keys(histPrices).find(k => norm(k) === ns);
    if (key && histPrices[key] > 0) { s.price = histPrices[key]; patched++; continue; }
    const key2 = Object.keys(histPrices).find(k => norm(k).includes(ns) || ns.includes(norm(k)));
    if (key2 && histPrices[key2] > 0) { s.price = histPrices[key2]; patched++; }
  }
  return { patched, stillZero: catalog.filter(s => s.price === 0).map(s => s.name) };
}

// ===========================================================================
// 核心：Dijkstra + 所有 WB 事件 + 递归分解
// ===========================================================================
function findBestChain(opts = {}) {
  const { seedShip, targetShip, projectRoot: root = ".", excludeIds = [], useHistorical, completeMode } = opts;
  const catalog = loadCatalog(root), i18n = loadI18n(root);
  const effectiveUseHistorical = completeMode ? true : useHistorical;
  const hangar = completeMode ? [] : loadHangar(root);
  const pricePatch = patchZeroPrices(catalog, root);
  const priceMap = buildPriceMap(catalog);

  const target = matchShip(targetShip, catalog, i18n);
  if (!target) return { error: `Target "${targetShip}" not found` };
  const tp = target.price;

  const seeds = completeMode ? [] : hangar.filter(i => i.category === "Standalone Ships" || i.category === "Game Packages");
  let seed = null;
  const sm = matchShip(seedShip, catalog, i18n);
  if (seedShip) {
    const s = !completeMode ? seeds.find(x => x.actualShip === seedShip || x.name.includes(seedShip) || x.id === seedShip) : null;
    if (s) {
      let a = s.actualShip; if (!a) { const cm = (s.contains||"").match(/Contains:\s*(.+?)\s+and\s+\d+\s+items?/); if (cm) a = cm[1]; } if (!a) a = s.name.split(/[\n-]/).pop().trim();
      seed = { id: s.id, label: s.name.trim().split("\n")[0], actualShip: a, meltValue: s.meltValue, storePrice: _shipPrice(a, catalog, i18n), insurance: s.insurance||[], virtual: false };
    }
    if (!seed && sm) seed = { id: "virtual", label: sm.name, actualShip: sm.name, meltValue: sm.price, storePrice: sm.price, insurance: [], virtual: true };
  }
  if (!seed) return { error: `Seed "${seedShip}" not found` };
  if (seed.storePrice >= tp) return { error: "Seed price >= target price" };

  const excludedData = completeMode ? { pairs: new Set(), byIds: new Set() } : loadExcludedCCUs(root);
  const exclude = new Set([...excludeIds, ...excludedData.byIds]);
  const excludedPairs = excludedData.pairs;

  const ownedEdges = {};
  hangar.filter(i => i.category === "Upgrades" && !exclude.has(i.id)).forEach(u => {
    if (!u.fromShip || !u.toShip) return;
    const fm = matchShip(u.fromShip, catalog, i18n), tm = matchShip(u.toShip, catalog, i18n);
    if (!fm || !tm || tm.price <= fm.price) return;
    const key = fm.name + "→" + tm.name;
    if (!ownedEdges[key] || u.meltValue < ownedEdges[key].cost) ownedEdges[key] = { cost: u.meltValue, id: u.id, isWarbond: u.isWarbond };
  });
  if (!completeMode) (loadCustomCCUs(root)||[]).forEach(c => {
    if (!c.fromShip || !c.toShip) return;
    const fm = matchShip(c.fromShip, catalog, i18n), tm = matchShip(c.toShip, catalog, i18n);
    if (!fm || !tm || tm.price <= fm.price) return;
    const key = fm.name + "→" + tm.name;
    if (!ownedEdges[key] || (c.actualCost||0) < ownedEdges[key].cost) ownedEdges[key] = { cost: c.actualCost||0, id: "custom_"+key.replace(/[^a-zA-Z0-9]/g,"_"), isWarbond: c.isWarbond||false, custom: true };
  });

  // 历史 WB CCU 边：遍历所有 WB 事件，每个事件用当时的历史价格
  let histCCUs = {}, histPriceMap = {};
  if (useHistorical) {
    let dateFrom;
    if (typeof useHistorical === "string") dateFrom = new Date(useHistorical);
    else if (useHistorical instanceof Date) dateFrom = useHistorical;
    else { dateFrom = new Date(); dateFrom.setFullYear(dateFrom.getFullYear() - 1); }

    histCCUs = loadHistoricalCCUs(root, dateFrom);
    const allWbEvents = loadAllWBEevents(root, dateFrom);
    const debutMap = buildFirstAppearance(root);
    histPriceMap = buildPriceHistory(root);

    for (const [toShip, wbEvents] of Object.entries(allWbEvents)) {
      const toShipPrice = priceMap[toShip] || (wbEvents[0]?.regularPrice || 0);
      for (const wb of wbEvents) {
        const wbValue = wb.wbPrice, wbDate = wb.wbDate;
        if (wbValue >= toShipPrice) continue;
        if (wbValue <= seed.storePrice) continue;

        for (const fromShip of catalog) {
          if (fromShip.price >= wbValue) continue;
          if (fromShip.name === toShip) continue;
          const ek = fromShip.name + "→" + toShip;
          if (ownedEdges[ek]) continue;
          if (excludedPairs.has(ek)) continue;

          if (wbDate) { const deb = debutMap[fromShip.name] || debutMap[fromShip.name.toLowerCase().replace(/[-]/g," ").replace(/\s+/g," ").trim()]; if (deb && deb > wbDate) continue; }

          const fromHistPrices = histPriceMap[fromShip.name] || histPriceMap[fromShip.name.toLowerCase().replace(/[-]/g," ").replace(/\s+/g," ").trim()];
          const histFromPrice = wbDate ? getPriceAtDate(fromHistPrices, wbDate) : null;
          const effectiveFromPrice = histFromPrice != null ? histFromPrice : fromShip.price;
          if (effectiveFromPrice >= wbValue) continue;

          const edgeCost = wbValue - effectiveFromPrice;
          const normalCost = toShipPrice - fromShip.price;
          if (edgeCost >= normalCost) continue;

          if (!ownedEdges[ek] || edgeCost < ownedEdges[ek].cost) {
            ownedEdges[ek] = { cost: edgeCost, id: "hist_"+ek.replace(/[^a-zA-Z0-9]/g,"_"), isWarbond: true, historical: true,
              historicalInfo: { wbValue, regularPrice: wb.regularPrice, date: wbDate, event: wb.event } };
          }
        }
      }
    }

    // 涨价 CCU 边 / Price change edges
    for (const ship of catalog) {
      if (ship.price <= seed.storePrice) continue;
      const hasOwnedTo = !completeMode && Object.keys(ownedEdges).some(k => k.endsWith("→"+ship.name) && !ownedEdges[k].historical);
      if (hasOwnedTo) continue;
      const priceHist = histPriceMap[ship.name] || histPriceMap[ship.name.toLowerCase().replace(/[-]/g," ").replace(/\s+/g," ").trim()];
      if (!priceHist || !priceHist.length) continue;
      let minPrice = ship.price, minDate = null;
      for (const p of priceHist) { if (p.price < minPrice && (!dateFrom || p.date >= dateFrom.toISOString().substring(0,10))) { minPrice = p.price; minDate = p.date; } }
      if (minPrice >= ship.price) continue;
      for (const fromShip of catalog) {
        if (fromShip.price >= minPrice || fromShip.name === ship.name) continue;
        const ek = fromShip.name + "→" + ship.name;
        if (ownedEdges[ek]) continue;
        if (minDate) { const deb = debutMap[fromShip.name] || debutMap[fromShip.name.toLowerCase().replace(/[-]/g," ").replace(/\s+/g," ").trim()]; if (deb && deb > minDate) continue; }
        const fromHist = histPriceMap[fromShip.name] || histPriceMap[fromShip.name.toLowerCase().replace(/[-]/g," ").replace(/\s+/g," ").trim()];
        const histFromP = minDate ? getPriceAtDate(fromHist, minDate) : null;
        const effFromP = histFromP != null ? histFromP : fromShip.price;
        if (effFromP >= minPrice) continue;
        const edgeCost = minPrice - effFromP;
        const normalCost = ship.price - fromShip.price;
        if (edgeCost >= normalCost) continue;
        if (ownedEdges[ek] && !ownedEdges[ek].historical) continue;
        if (!ownedEdges[ek] || edgeCost < ownedEdges[ek].cost)
          ownedEdges[ek] = { cost: edgeCost, id: "price_"+ek.replace(/[^a-zA-Z0-9]/g,"_"), isWarbond: false, historical: true,
            historicalInfo: { wbValue: minPrice, regularPrice: ship.price, date: minDate||"", event: "涨价CCU (历史最低$"+minPrice+")" } };
      }
    }
  }

  // Dijkstra
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

    for (const s of shipList) {
      if (s.price <= curPrice) continue;
      const neighbor = s.name;
      if (visited.has(neighbor)) continue;
      if (s.price === curPrice && neighbor !== cur) continue;

      const ek = cur + "→" + neighbor;
      if (excludedPairs.has(ek)) continue;
      if (excludedPairs.size > 0) { const ekN = cur.toLowerCase().replace(/[-]/g," ").replace(/\s+/g," ").trim() + "→" + neighbor.toLowerCase().replace(/[-]/g," ").replace(/\s+/g," ").trim(); if (excludedPairs.has(ekN)) continue; }

      const owned = ownedEdges[ek];
      const edgeCost = owned ? owned.cost : (s.price - curPrice);
      const nd = dist[cur] + edgeCost;
      if (nd < (dist[neighbor]||Infinity)) {
        dist[neighbor] = nd;
        prev[neighbor] = { from: cur, to: neighbor, fromPrice: curPrice, toPrice: s.price, cost: edgeCost, owned: !!owned, ccuid: owned?.id||"", isWarbond: owned?.isWarbond||false, custom: owned?.custom||false, historical: owned?.historical||false, historicalInfo: owned?.historicalInfo||null };
      }
    }
  }

  if (!prev[target.name]) return { error: `No valid path to ${target.name}`, target: target.name, targetPrice: tp, seed, chain: null };

  let steps = []; let node = target.name;
  while (prev[node]) { steps.unshift(prev[node]); node = prev[node].from; }
  steps = mergeConsecutiveCredits(steps);
  if (effectiveUseHistorical && Object.keys(histCCUs).length > 0) { steps = decomposeGaps(steps, priceMap, catalog, histCCUs, ownedEdges, excludedPairs, 3, histPriceMap); }

  const tccu = steps.reduce((s,e) => s + e.cost, 0), oc = steps.filter(e => e.owned).reduce((s,e) => s + e.cost, 0);
  const gc = steps.filter(e => !e.owned).reduce((s,e) => s + e.cost, 0), tm = seed.meltValue + tccu;
  const fv = tp, sv = fv - tm, ef = tm > 0 ? (fv/tm).toFixed(2) : "∞", hg = steps.some(e => !e.owned);
  const hasHistorical = steps.some(e => e.owned && e.historical);

  return { target: target.name, targetPrice: tp, seed,
    chain: { seed, steps, totalMelt: tm, finalValue: fv, savings: sv, efficiency: ef, hasGaps: hg, ownedCost: oc, gapCost: gc, hasHistorical },
    analysisInfo: { ownedEdges: Object.keys(ownedEdges).length, shipCount: shipList.length, useHistorical: !!effectiveUseHistorical, completeMode: !!completeMode, pricePatch } };
}

function _shipPrice(n, c, i18n) { const m = matchShip(n, c, i18n); return m ? m.price : 0; }

// ===========================================================================
// 递归缝隙分解 / Recursive gap decomposition
// ===========================================================================
function mergeConsecutiveCredits(steps) {
  if (steps.length <= 1) return steps;
  const merged = []; let i = 0;
  while (i < steps.length) {
    const s = steps[i];
    if (!s.owned && !s.historical && i + 1 < steps.length) {
      const n = steps[i + 1];
      if (!n.owned && !n.historical) {
        merged.push({ from: s.from, to: n.to, fromPrice: s.fromPrice, toPrice: n.toPrice, cost: n.toPrice - s.fromPrice, owned: false, ccuid: "", isWarbond: false, custom: false, historical: false });
        i += 2; continue;
      }
    }
    merged.push(s); i++;
  }
  return merged.length === steps.length ? merged : mergeConsecutiveCredits(merged);
}

function decomposeGaps(steps, priceMap, catalog, histCCUs, ownedEdges, excludedPairs, depth, histPriceMap) {
  if (!depth || depth <= 0) depth = 3;
  const result = [];
  for (const step of steps) {
    const isGap = !step.owned;
    const isLargeHist = step.owned && step.historical && (step.toPrice - step.fromPrice) > 50;
    if (!isGap && !isLargeHist) { result.push(step); continue; }
    const decomposed = _decomposeOne(step.fromPrice, step.toPrice, priceMap, catalog, histCCUs, ownedEdges, excludedPairs, depth, histPriceMap);
    if (decomposed.length <= 1) { result.push(step); continue; }
    if (excludedPairs && decomposed.some(seg => excludedPairs.has(seg.from + "→" + seg.to))) { result.push(step); continue; }
    let prev = step.from, prevPrice = step.fromPrice;
    for (const seg of decomposed) {
      const ek = seg.from + "→" + seg.to;
      const owned = ownedEdges[ek];
      result.push({ from: seg.from, to: seg.to, fromPrice: seg.fromPrice, toPrice: seg.toPrice, cost: seg.cost, owned: !!owned || (seg.historical || (owned?.historical || false)), ccuid: owned?.id || ((seg.historical || (owned?.historical || false)) ? (seg.historical ? "hist_" : "price_") + seg.from.replace(/[^a-zA-Z0-9]/g,"_") + "_" + seg.to.replace(/[^a-zA-Z0-9]/g,"_") : ""), isWarbond: owned?.isWarbond || seg.historical || false, custom: owned?.custom || false, historical: seg.historical || (owned?.historical || false), historicalInfo: seg.historicalInfo || owned?.historicalInfo || null });
      prev = seg.to; prevPrice = seg.toPrice;
    }
  }
  return mergeConsecutiveCredits(result);
}

function _decomposeOne(fromPrice, toPrice, priceMap, catalog, histCCUs, ownedEdges, excludedPairs, depth, histPriceMap) {
  const gap = toPrice - fromPrice;
  let bestCost = gap, bestSegs = [{ fromPrice, toPrice, cost: gap }];
  const toName = _shipAtPrice(toPrice, priceMap);

  // Direct WB edge to target with historical price
  if (toName && histCCUs[toName]) {
    const wb = histCCUs[toName];
    if (wb.bestWbPrice > fromPrice && wb.bestWbPrice < toPrice) {
      const wbCost = wb.bestWbPrice - fromPrice;
      if (wbCost < bestCost) { bestCost = wbCost; bestSegs = [{ fromPrice, toPrice, cost: wbCost, historical: true, historicalInfo: { wbValue: wb.bestWbPrice, regularPrice: wb.regularPrice, date: wb.wbDate, event: wb.wbEvent } }]; }
    }
  }

  const mids = catalog.filter(s => s.price > fromPrice && s.price < toPrice)
    .sort((a, b) => { const aW = histCCUs[a.name] ? 1 : 0, bW = histCCUs[b.name] ? 1 : 0; if (aW !== bW) return bW - aW; return (toPrice - a.price) - (toPrice - b.price); }).slice(0, 15);

  for (const mid of mids) {
    const ek = _shipAtPrice(fromPrice, priceMap) + "→" + mid.name;
    if (excludedPairs && excludedPairs.has(ek)) continue;
    const owned = ownedEdges[ek];
    let costToMid, segToMid;
    if (owned) { costToMid = owned.cost; segToMid = [{ fromPrice, toPrice: mid.price, cost: costToMid }]; }
    else { const left = depth > 1 ? _decomposeOne(fromPrice, mid.price, priceMap, catalog, histCCUs, ownedEdges, excludedPairs, depth - 1, histPriceMap) : [{ fromPrice, toPrice: mid.price, cost: mid.price - fromPrice }]; costToMid = left.reduce((s, e) => s + e.cost, 0); segToMid = left; }

    let costFromMid, segFromMid;
    if (toName && histCCUs[toName]) {
      const wb = histCCUs[toName];
      const midName = mid.name, midNorm = midName.toLowerCase().replace(/[-]/g," ").replace(/\s+/g," ").trim();
      const midHistP = (histPriceMap && wb.wbDate) ? getPriceAtDate(histPriceMap[midName] || histPriceMap[midNorm], wb.wbDate) : null;
      const effMidP = midHistP != null ? midHistP : mid.price;
      if (wb.bestWbPrice > effMidP && wb.bestWbPrice < toPrice) {
        costFromMid = wb.bestWbPrice - effMidP;
        segFromMid = [{ fromPrice: effMidP, toPrice, cost: costFromMid, historical: true, historicalInfo: { wbValue: wb.bestWbPrice, regularPrice: wb.regularPrice, date: wb.wbDate, event: wb.wbEvent } }];
      }
    }
    if (!segFromMid) { const right = depth > 1 ? _decomposeOne(mid.price, toPrice, priceMap, catalog, histCCUs, ownedEdges, excludedPairs, depth - 1, histPriceMap) : [{ fromPrice: mid.price, toPrice, cost: toPrice - mid.price }]; costFromMid = right.reduce((s, e) => s + e.cost, 0); segFromMid = right; }

    const totalCost = costToMid + costFromMid;
    if (totalCost < bestCost) { bestCost = totalCost; segToMid[0].from = segToMid[0].from || _shipAtPrice(fromPrice, priceMap); segToMid[segToMid.length - 1].to = segFromMid[0].from || mid.name; segFromMid[segFromMid.length - 1].to = toName || segFromMid[segFromMid.length - 1].to; bestSegs = [...segToMid, ...segFromMid]; }
  }

  let runningPrice = fromPrice;
  for (const seg of bestSegs) { seg.from = seg.from || _shipAtPrice(runningPrice, priceMap); seg.fromPrice = runningPrice; seg.to = seg.to || _shipAtPrice(seg.toPrice, priceMap); runningPrice = seg.toPrice; }
  return bestSegs;
}

function _shipAtPrice(price, priceMap) { for (const [name, p] of Object.entries(priceMap)) { if (p === price) return name; } return null; }

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
    let src, note;
    if (s.owned && s.historical) {
      src = "历史WB"; note = "历史WB";
      if (s.historicalInfo) note += ` ($${s.historicalInfo.wbValue}, ${s.historicalInfo.date||""})`;
    } else if (s.owned && s.custom) {
      src = "自定义"; note = s.isWarbond ? "Warbond (自定义)" : "(自定义)";
    } else if (s.owned) {
      src = `#${s.ccuid}`; note = s.isWarbond ? "Warbond" : "";
    } else {
      src = "—"; note = "⚠️ 无升级";
    }
    l.push(`| ${i+1} | ${cn(s.from)} | ${cn(s.to)} | $${s.fromPrice} | $${s.toPrice} | $${s.cost} | ${src} | ${note} |`);
  });
  const tc = steps.reduce((s,e) => s + e.cost, 0);
  l.push(`| | **TOTALS** | | | **$${finalValue}** | **$${tc}** | | |`,"");
  l.push(`- **种子船熔解价值**: $${seed.meltValue}`,`- **自有 CCU 实际成本**: $${ownedCost??tc}`);
  if (hasGaps||gapCost>0) l.push(`- **断层需购买成本**: $${gapCost||0}`);
  l.push(`- **总实际成本**: $${totalMelt}`,`- **最终船只价值**: $${finalValue}`,`- **节省**: $${savings} (${efficiency}x value)`);
  if (hasGaps) l.push(`\n> ⚠️ 含断层 — 标"无升级"的行需从商店原价购买。`);
  const hasHistorical = steps.some(e => e.owned && e.historical);
  if (hasHistorical) l.push(`\n> 💰 含历史WB CCU — 这些是过往限时折扣价，你可能已拥有该CCU；若未拥有则需从grey market获取或等待下次促销。`);
  return l.join("\n");
}

function formatResults(result, i18n) {
  if (result.error) return `Error: ${result.error}`;
  if (!result.chain) return `## No valid path to **${result.target}**\n\nNo upgrade path exists without illegal same-price side-grades.`;
  const cn = i18n?.ships ? (n) => { for (const c of [n, n.replace(/-/g," "), n.replace(/ /g,"-")]) { const e = i18n.ships[c]; if (e) return e.short||e.full||n; } return n; } : (n)=>n;
  const l=[];
  l.push(`## CCU Chain: ${cn(result.seed.actualShip)} → **${cn(result.target)}** ($${result.targetPrice})`);
  const histInfo = result.analysisInfo.useHistorical ? ", +历史WB数据" : "";
  const patchInfo = result.analysisInfo.pricePatch?.patched > 0 ? ` (${result.analysisInfo.pricePatch.patched}艘价格从scorg补全)` : "";
  l.push(`_${result.analysisInfo.ownedEdges} CCU edges, ${result.analysisInfo.shipCount} ships in graph${histInfo}${patchInfo}_`,"");
  l.push(`### Best — $${result.chain.totalMelt} (${result.chain.efficiency}x)`);
  l.push(formatChainTable(result.chain, i18n));
  return l.join("\n");
}

const { addTranslation } = require("./i18n");
module.exports = { setWeights, setCreditRate, normalize, matchShip, ALIASES, findBestChain, formatChainTable, formatResults, loadCustomCCUs, saveCustomCCUs, loadExcludedCCUs, saveExcludedCCUs, loadHistoricalCCUs, loadAllWBEevents, decomposeGaps, mergeConsecutiveCredits, buildFirstAppearance, buildPriceHistory, getPriceAtDate, patchZeroPrices, addTranslation };
