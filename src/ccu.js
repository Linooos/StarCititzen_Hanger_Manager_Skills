/**
 * CCU Chain Calculator
 *
 * Given a target ship and the player's hangar data, finds the cheapest
 * upgrade path from owned standalone ships using owned CCUs.
 *
 * @module ccu
 */

const fs = require("fs");
const path = require("path");

// ---------------------------------------------------------------------------
// Ship name normalization & matching
// ---------------------------------------------------------------------------

/** Normalize a ship name for fuzzy comparison */
function normalize(name) {
  return name
    .toLowerCase()
    .replace(/[-]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^(upgrade\s*-\s*)/i, "")
    .replace(/\s*(standard|warbond)\s*edition\s*$/i, "")
    .replace(/[^a-z0-9\s]/g, "")
    .trim();
}

/** Known ship name aliases: upgrade-name → catalog-name */
const ALIASES = {
  "hull a": "Hull-A",
  "hull b": "Hull-B",
  "hull c": "Hull-C",
  "hull d": "Hull-D",
  "hull e": "Hull-E",
  "cutlass steel": "Cutlass-Steel",
  "cutlass red": "Cutlass-Red",
  "cutlass blue": "Cutlass-Blue",
  "cutlass black": "Cutlass-Black",
  "ironclad assault": "Ironclad-Assault",
  "m2 hercules": "M2-Hercules",
  "c2 hercules": "C2-Hercules",
  "a2 hercules": "A2-Hercules",
  "avenger warlock": "Avenger-Warlock",
  "avenger stalker": "Avenger-Stalker",
  "avenger titan renegade": "Avenger-Titan-Renegade",
  "storm aa": "Storm-AA",
  "c1 spirit": "C1-Spirit",
  "a1 spirit": "A1-Spirit",
  "e1 spirit": "E1-Spirit",
  "terrapin medic": "Terrapin-Medic",
  "vanguard sentinel": "Vanguard-Sentinel",
  "vanguard harbinger": "Vanguard-Harbinger",
  "vanguard hoplite": "Vanguard-Hoplite",
  "guardian qi": "Guardian-QI",
  "guardian mx": "Guardian-MX",
  "f7c r hornet tracker mk ii": "F7C-R-Hornet-Tracker-Mk-II",
  "f7c m super hornet mk ii": "F7C-M-Super-Hornet-Mk-II",
  "zeus mk ii mr": "Zeus-Mk-II-MR",
  "zeus mk ii es": "Zeus-Mk-II-ES",
  "zeus mk ii cl": "Zeus-Mk-II-CL",
  "apollo medivac": "Apollo-Medivac",
  "apollo triage": "Apollo-Triage",
  "starfarer gemini": "Starfarer-Gemini",
  "constellation taurus": "Constellation-Taurus",
  "constellation andromeda": "Constellation-Andromeda",
  "constellation aquila": "Constellation-Aquila",
  "starlancer max": "Starlancer-MAX",
  "starlancer tac": "Starlancer-TAC",
  "fury mx": "Fury-MX",
};

/**
 * Find the best catalog match for a ship name.
 * Priority: alias > exact > normalized > partial word match
 */
function matchShip(name, catalog) {
  if (!name) return null;

  // Try alias lookup
  const key = name.toLowerCase().trim();
  if (ALIASES[key]) {
    const aliasName = ALIASES[key];
    return catalog.find((s) => s.name === aliasName) || null;
  }

  // Try exact match
  let match = catalog.find((s) => s.name === name);
  if (match) return match;

  // Try normalized match
  const norm = normalize(name);
  match = catalog.find((s) => normalize(s.name) === norm);
  if (match) return match;

  // Try partial: catalog name contains the upgrade ship name words
  const words = norm.split(/\s+/).filter((w) => w.length > 1);
  const candidates = catalog.filter((s) => {
    const sNorm = normalize(s.name);
    const matchCount = words.filter((w) => sNorm.includes(w)).length;
    return matchCount >= Math.min(2, words.length);
  });

  if (candidates.length === 1) return candidates[0];
  if (candidates.length > 1) {
    // Pick the one with the most word matches
    candidates.sort((a, b) => {
      const aN = normalize(a.name), bN = normalize(b.name);
      const aC = words.filter((w) => aN.includes(w)).length;
      const bC = words.filter((w) => bN.includes(w)).length;
      return bC - aC;
    });
    return candidates[0];
  }

  return null;
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

function loadHangarItems(projectRoot) {
  const p = path.join(projectRoot, "output", "hangar_items.json");
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

function loadShipCatalog(projectRoot) {
  const p = path.join(projectRoot, "output", "ships.json");
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

// ---------------------------------------------------------------------------
// Price map: ship name → store price
// ---------------------------------------------------------------------------

function buildPriceMap(shipCatalog, upgrades) {
  const map = {};
  shipCatalog.forEach((s) => {
    map[s.name] = s.price;
  });

  // Also try matching upgrade ship names to catalog
  const allNames = new Set();
  upgrades.forEach((u) => {
    if (u.fromShip) allNames.add(u.fromShip);
    if (u.toShip) allNames.add(u.toShip);
  });

  allNames.forEach((name) => {
    if (!map[name]) {
      const match = matchShip(name, shipCatalog);
      if (match) map[name] = match.price;
    }
  });

  return map;
}

// ---------------------------------------------------------------------------
// Directed graph from upgrades
// ---------------------------------------------------------------------------

function buildGraph(upgrades, priceMap, excludeIds) {
  const exclude = new Set(excludeIds || []);
  const graph = {}; // { fromShip: [{ to, cost, id, isWarbond, fromPrice, toPrice }] }

  upgrades.forEach((u) => {
    if (exclude.has(u.id)) return;
    if (!u.fromShip || !u.toShip) return;

    const fromPrice = priceMap[u.fromShip] || 0;
    const toPrice = priceMap[u.toShip] || 0;

    if (!graph[u.fromShip]) graph[u.fromShip] = [];
    graph[u.fromShip].push({
      to: u.toShip,
      cost: u.meltValue,
      id: u.id,
      isWarbond: u.isWarbond,
      fromPrice,
      toPrice,
    });
  });

  return graph;
}

// ---------------------------------------------------------------------------
// Path finding — DFS from seed to target
// ---------------------------------------------------------------------------

function findAllPaths(graph, start, target, maxDepth = 30) {
  const paths = [];

  function dfs(current, visited, path, totalCost) {
    if (current === target) {
      paths.push({ steps: [...path], totalCost });
      return;
    }
    if (path.length >= maxDepth) return;

    const edges = graph[current];
    if (!edges) return;

    for (const edge of edges) {
      if (visited.has(edge.to)) continue; // no cycles
      visited.add(edge.to);
      path.push(edge);
      dfs(edge.to, visited, path, totalCost + edge.cost);
      path.pop();
      visited.delete(edge.to);
    }
  }

  const visited = new Set([start]);
  dfs(start, visited, [], 0);

  return paths;
}

// ---------------------------------------------------------------------------
// Chain analysis
// ---------------------------------------------------------------------------

/**
 * Find the cheapest CCU chains from hangar seed ships to a target ship.
 *
 * @param {object} opts
 * @param {string} opts.targetShip - target ship name (must match catalog)
 * @param {string} opts.projectRoot - project root path
 * @param {string[]} [opts.seedShipIds] - limit to specific seed ship IDs (hangar item IDs)
 * @param {string[]} [opts.excludeIds] - CCU IDs to exclude
 * @returns {object} { target, targetPrice, chains: [{seed, steps, totalMelt, finalValue, savings, efficiency}] }
 */
function findCheapestChain(opts = {}) {
  const {
    targetShip,
    projectRoot = ".",
    seedShipIds = null,
    excludeIds = [],
  } = opts;

  const hangar = loadHangarItems(projectRoot);
  const catalog = loadShipCatalog(projectRoot);
  const upgrades = hangar.filter((i) => i.category === "Upgrades");
  const priceMap = buildPriceMap(catalog, upgrades);

  // Find target in catalog
  const targetMatch = matchShip(targetShip, catalog);
  if (!targetMatch) {
    return { error: `Target ship "${targetShip}" not found in catalog` };
  }
  const targetPrice = targetMatch.price;

  // Get seed ships
  let seeds = hangar.filter((i) => i.category === "Standalone Ships");
  if (seedShipIds) {
    seeds = seeds.filter((s) => seedShipIds.includes(s.id));
  }

  // Build graph
  const graph = buildGraph(upgrades, priceMap, excludeIds);

  // Get the actual ship name (after upgrades) for each seed
  const seedInfo = seeds
    .map((s) => {
      let actualShip = s.actualShip;
      // Fallback: parse ship name from contains text or item name
      if (!actualShip) {
        const containsMatch = (s.contains || "").match(/Contains:\s*(.+?)\s+and\s+\d+\s+items?/);
        if (containsMatch) actualShip = containsMatch[1];
        if (!actualShip) {
          // Try extracting ship name from the item name
          const nameParts = s.name.split(/[\n-]/);
          actualShip = nameParts[nameParts.length - 1].trim();
        }
      }
      return {
        id: s.id,
        label: s.name.trim().split("\n")[0],
        actualShip,
        meltValue: s.meltValue,
        insurance: s.insurance || [],
      };
    })
    .filter((s) => s.actualShip && s.actualShip.length > 0);

  // Find all chains from each seed to target
  const allChains = [];
  seedInfo.forEach((seed) => {
    // The seed's starting ship is what it actually represents after previous upgrades
    const startShip = seed.actualShip;
    if (!startShip) return;

    const paths = findAllPaths(graph, startShip, targetShip);
    paths.forEach((p) => {
      // Compute final value: the last CCU's toPrice
      const lastStep = p.steps[p.steps.length - 1];
      const finalValue = lastStep ? lastStep.toPrice : (priceMap[startShip] || 0);
      const totalMelt = seed.meltValue + p.totalCost;
      const savings = finalValue - totalMelt;
      const efficiency = totalMelt > 0 ? (finalValue / totalMelt).toFixed(2) : "∞";

      allChains.push({
        seed,
        steps: p.steps,
        totalMelt,
        finalValue,
        savings,
        efficiency,
      });
    });
  });

  // Sort by total melt (cheapest first)
  allChains.sort((a, b) => a.totalMelt - b.totalMelt);

  return {
    target: targetMatch.name,
    targetPrice,
    graphNodeCount: Object.keys(graph).length,
    graphEdgeCount: upgrades.length - excludeIds.length,
    chains: allChains.slice(0, 10),
    totalFound: allChains.length,
    _projectRoot: projectRoot,
  };
}

// ---------------------------------------------------------------------------
// Best Path with Gap Filling (Dijkstra on complete price graph)
// ---------------------------------------------------------------------------

/**
 * Find the cheapest path from seed ships to target, including gaps
 * where no CCU is owned (assumes buying at full price difference).
 *
 * Uses Dijkstra on the complete price graph: every ship can upgrade to
 * every more-expensive ship. Owned CCUs provide discounted edges.
 */
function findBestPath(opts = {}) {
  const {
    targetShip, projectRoot = ".", seedShipIds = null, excludeIds = [],
  } = opts;

  const hangar = loadHangarItems(projectRoot);
  const catalog = loadShipCatalog(projectRoot);
  const upgrades = hangar.filter((i) => i.category === "Upgrades");
  const priceMap = buildPriceMap(catalog, upgrades);

  // Find target in catalog
  const targetMatch = matchShip(targetShip, catalog);
  if (!targetMatch) return { error: `Target ship "${targetShip}" not found in catalog` };
  const targetPrice = targetMatch.price;

  // Get seed ships
  let seeds = hangar.filter((i) => i.category === "Standalone Ships");
  if (seedShipIds) seeds = seeds.filter((s) => seedShipIds.includes(s.id));
  seeds = seeds
    .map((s) => {
      let actualShip = s.actualShip;
      if (!actualShip) {
        const cm = (s.contains || "").match(/Contains:\s*(.+?)\s+and\s+\d+\s+items?/);
        if (cm) actualShip = cm[1];
        if (!actualShip) actualShip = s.name.split(/[\n-]/).pop().trim();
      }
      return { id: s.id, label: s.name.trim().split("\n")[0], actualShip, meltValue: s.meltValue, insurance: s.insurance || [] };
    })
    .filter((s) => s.actualShip && s.actualShip.length > 0);

  // Build owned CCU index: { "from→to": { cost, id, isWarbond } }
  const exclude = new Set(excludeIds || []);
  const ownedEdges = {};
  upgrades.forEach((u) => {
    if (exclude.has(u.id)) return;
    if (!u.fromShip || !u.toShip) return;
    const key = u.fromShip + "→" + u.toShip;
    // Keep the cheapest CCU for each pair
    if (!ownedEdges[key] || u.meltValue < ownedEdges[key].cost) {
      ownedEdges[key] = { cost: u.meltValue, id: u.id, isWarbond: u.isWarbond };
    }
  });

  // Build sorted ship list by price (for neighbor generation)
  const shipList = catalog
    .filter((s) => s.price > 0)
    .sort((a, b) => a.price - b.price);

  // For each seed, run Dijkstra
  const allChains = [];

  seeds.forEach((seed) => {
    const startShip = seed.actualShip;
    if (!startShip) return;

    // Can't upgrade to a cheaper ship
    const seedPrice = priceMap[startShip] || 0;
    if (seedPrice >= targetPrice) return;

    // Dijkstra
    const dist = {};   // shipName → minCost from start
    const prev = {};   // shipName → {fromShip, edge}
    const visited = new Set();

    dist[startShip] = 0;

    while (true) {
      // Find unvisited node with smallest distance
      let current = null, minDist = Infinity;
      for (const [ship, d] of Object.entries(dist)) {
        if (!visited.has(ship) && d < minDist) {
          minDist = d; current = ship;
        }
      }
      if (!current || current === targetShip) break;
      visited.add(current);

      const curPrice = priceMap[current] || 0;

      // Generate neighbors: all ships with higher price
      for (const s of shipList) {
        if (s.price <= curPrice) continue;
        const neighbor = s.name;
        if (visited.has(neighbor)) continue;

        // Determine edge cost
        const edgeKey = current + "→" + neighbor;
        const owned = ownedEdges[edgeKey];
        const edgeCost = owned ? owned.cost : (s.price - curPrice);

        const newDist = (dist[current] || 0) + edgeCost;
        if (newDist < (dist[neighbor] || Infinity)) {
          dist[neighbor] = newDist;
          prev[neighbor] = {
            from: current, to: neighbor,
            fromPrice: curPrice, toPrice: s.price,
            cost: edgeCost,
            owned: !!owned,
            ccuid: owned ? owned.id : "",
            isWarbond: owned ? owned.isWarbond : false,
          };
        }
      }
    }

    // Reconstruct path
    if (!prev[targetShip]) return; // not reachable

    const steps = [];
    let node = targetShip;
    while (prev[node]) {
      steps.unshift(prev[node]);
      node = prev[node].from;
    }

    const totalCCUCost = steps.reduce((s, e) => s + e.cost, 0);
    const totalMelt = seed.meltValue + totalCCUCost;
    const finalValue = steps.length > 0 ? steps[steps.length - 1].toPrice : targetPrice;
    const savings = finalValue - totalMelt;
    const efficiency = totalMelt > 0 ? (finalValue / totalMelt).toFixed(2) : "∞";
    const hasGaps = steps.some((e) => !e.owned);
    const ownedCost = steps.filter((e) => e.owned).reduce((s, e) => s + e.cost, 0);
    const gapCost = steps.filter((e) => !e.owned).reduce((s, e) => s + e.cost, 0);

    allChains.push({
      seed, steps, totalMelt, finalValue, savings, efficiency,
      hasGaps, ownedCost, gapCost,
    });
  });

  allChains.sort((a, b) => a.totalMelt - b.totalMelt);

  return {
    target: targetMatch.name,
    targetPrice,
    shipCount: shipList.length,
    ownedEdgeCount: Object.keys(ownedEdges).length,
    chains: allChains.slice(0, 10),
    totalFound: allChains.length,
    _projectRoot: projectRoot,
  };
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/**
 * Format a chain as a markdown table.
 */
function formatChainTable(chain) {
  const { seed, steps, totalMelt, finalValue, savings, efficiency, hasGaps, ownedCost, gapCost } = chain;
  const lines = [];

  lines.push("");
  lines.push(`**Seed Ship**: ${seed.actualShip} (${seed.label})`);
  lines.push(`  Melt: $${seed.meltValue} | Insurance: ${seed.insurance.join(", ")}`);
  lines.push("");

  // 8-column table
  lines.push("| # | From | To | From Value | To Value | CCU Cost | Source | Note |");
  lines.push("|---|------|----|-----------|---------|----------|--------|------|");

  if (steps.length === 0) {
    lines.push(`| - | ${seed.actualShip} | *(already at target)* | - | $${finalValue} | - | - | - |`);
  } else {
    steps.forEach((step, i) => {
      const src = step.owned ? `#${step.ccuid}` : "—";
      let note = "";
      if (!step.owned) note = "⚠️ 无可用CCU";
      else if (step.isWarbond) note = "Warbond";
      lines.push(
        `| ${i + 1} | ${step.from} | ${step.to} | $${step.fromPrice} | $${step.toPrice} | $${step.cost} | ${src} | ${note} |`
      );
    });
  }

  // Summary row
  const totalCCU = steps.reduce((s, e) => s + e.cost, 0);
  lines.push(`| | **TOTALS** | | | **$${finalValue}** | **$${totalCCU}** | | |`);
  lines.push("");

  // Stats with gap breakdown
  lines.push(`- **种子船熔解价值 (Seed melt)**: $${seed.meltValue}`);
  lines.push(`- **自有 CCU 实际成本**: $${ownedCost != null ? ownedCost : totalMelt - seed.meltValue}`);
  if (hasGaps || gapCost > 0) {
    lines.push(`- **断层需购买成本 (Gap cost)**: $${gapCost || 0}`);
  }
  lines.push(`- **总实际成本 (Total actual cost)**: $${totalMelt}`);
  lines.push(`- **最终船只价值 (Final ship value)**: $${finalValue}`);
  lines.push(`- **节省 (Savings)**: $${savings} (${efficiency}x value)`);
  if (hasGaps) {
    lines.push("");
    lines.push(`> ⚠️ 链条包含断层 — 标有"无可用CCU"的行需要从商店以原价购买升级包。`);
  }

  return lines.join("\n");
}

/**
 * Format a result summary showing the best chains.
 */
function formatResults(result) {
  if (result.error) return `Error: ${result.error}`;

  const lines = [];
  lines.push(`## CCU Chains to **${result.target}** (Store Price: $${result.targetPrice})`);
  lines.push("");

  const totalFound = result.totalFound || 0;
  const shipCount = result.shipCount || result.graphNodeCount || 0;
  lines.push(`Found ${totalFound} possible chains from seed ships.`);
  lines.push(`Search space: ${shipCount} ships, ${result.ownedEdgeCount || result.graphEdgeCount || 0} owned CCU edges.`);
  lines.push("");

  if (result.chains.length === 0) {
    lines.push("**No chain found.** The target may not be reachable. This could mean:");
    lines.push("- The target is cheaper than all your seed ships (CCUs only go UP in price)");
    lines.push("- No upgrade path exists even with gaps");
    return lines.join("\n");
  }

  result.chains.slice(0, 3).forEach((chain, i) => {
    const gapNote = chain.hasGaps ? " ⚠️ 含断层" : "";
    lines.push(`### Chain ${i + 1} — Total Cost: $${chain.totalMelt} (${chain.efficiency}x)${gapNote}`);
    lines.push(formatChainTable(chain));
    lines.push("");
  });

  return lines.join("\n");
}

/**
 * List all ships reachable from the player's seed ships via owned upgrades.
 */
function listReachableTargets(opts = {}) {
  const { projectRoot = "." } = opts;
  const hangar = loadHangarItems(projectRoot);
  const catalog = loadShipCatalog(projectRoot);
  const upgrades = hangar.filter((i) => i.category === "Upgrades");
  const priceMap = buildPriceMap(catalog, upgrades);
  const graph = buildGraph(upgrades, priceMap, []);

  let seeds = hangar.filter((i) => i.category === "Standalone Ships");
  seeds = seeds.map((s) => ({
    id: s.id,
    label: s.name.trim().split("\n")[0],
    actualShip: s.actualShip || "",
    meltValue: s.meltValue,
  })).filter((s) => s.actualShip);

  const reachable = new Map(); // targetName → { minCost, seedShip }
  seeds.forEach((seed) => {
    // BFS from seed to all reachable nodes
    const visited = new Set();
    const queue = [{ ship: seed.actualShip, cost: 0 }];
    visited.add(seed.actualShip);

    while (queue.length > 0) {
      const { ship, cost } = queue.shift();
      const edges = graph[ship];
      if (!edges) continue;

      edges.forEach((e) => {
        if (visited.has(e.to)) return;
        visited.add(e.to);
        const totalCost = seed.meltValue + cost + e.cost;
        if (!reachable.has(e.to) || reachable.get(e.to).totalCost > totalCost) {
          reachable.set(e.to, {
            targetShip: e.to,
            targetPrice: e.toPrice,
            totalCost,
            seedShip: seed.actualShip,
            seedLabel: seed.label,
          });
        }
        queue.push({ ship: e.to, cost: cost + e.cost });
      });
    }
  });

  return [...reachable.values()].sort((a, b) => a.targetPrice - b.targetPrice);
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  normalize,
  matchShip,
  loadHangarItems,
  loadShipCatalog,
  buildPriceMap,
  buildGraph,
  findAllPaths,
  findCheapestChain,
  findBestPath,
  listReachableTargets,
  formatChainTable,
  formatResults,
  ALIASES,
};
