/**
 * CCU Chain Calculator / CCU 升级链计算器 v5
 *
 * 11 步贪心局部链算法：
 *   analyzeUpgrades → buildLocalChains → precompute
 *   findBestChain(seed, target, excludeIds) → formatTable
 *
 * 可配置权重：setWeights(valueSpanWeight, savingsWeight)
 *
 * @module ccu
 */
const fs = require("fs"); const path = require("path");

let VALUE_SPAN_WEIGHT = 1;
let SAVINGS_WEIGHT = 1;
function setWeights(v, s) { if (v != null) VALUE_SPAN_WEIGHT = v; if (s != null) SAVINGS_WEIGHT = s; }

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
  // 中文名反查 / Chinese name lookup
  if (i18n && i18n.cnToEn && i18n.cnToEn[name]) name = i18n.cnToEn[name];
  if (i18n && i18n.ships) {
    for (const [en, cn] of Object.entries(i18n.ships)) {
      if (cn.short === name || cn.full === name) { name = en; break; }
    }
  }
  const key = name.toLowerCase().trim();
  if (ALIASES[key]) { const m = catalog.find(s => s.name === ALIASES[key]); if (m) return m; }
  let m = catalog.find(s => s.name === name); if (m) return m;
  const n = normalize(name); m = catalog.find(s => normalize(s.name) === n); if (m) return m;
  const words = n.split(/\s+/).filter(w => w.length > 1);
  if (words.length === 0) return null;
  // Require all words to match, sorted by best match
  const cs = catalog.map(s => ({ ship: s, matches: words.filter(w => normalize(s.name).includes(w)).length }))
    .filter(x => x.matches >= words.length)
    .sort((a,b) => b.matches - a.matches);
  if (cs.length >= 1) return cs[0].ship;
  // Fallback: require majority word match, pick best
  const minMatch = Math.max(1, Math.ceil(words.length * 0.6));
  const cs2 = catalog.map(s => ({ ship: s, matches: words.filter(w => normalize(s.name).includes(w)).length }))
    .filter(x => x.matches >= minMatch)
    .sort((a,b) => b.matches - a.matches);
  return cs2[0]?.ship || null;
}
function loadHangar(root) { return JSON.parse(fs.readFileSync(path.join(root,"output","hangar_items.json"),"utf-8")); }
function loadCatalog(root) { return JSON.parse(fs.readFileSync(path.join(root,"output","ships.json"),"utf-8")); }
function loadAnalysis(root) { const p = path.join(root,"output","ccu_analysis.json"); return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p,"utf-8")) : null; }
function loadCustomCCUs(root) { const p = path.join(root,"output","custom_ccus.json"); return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p,"utf-8")) : []; }
function saveCustomCCUs(root, data) { fs.writeFileSync(path.join(root,"output","custom_ccus.json"), JSON.stringify(data, null, 2)); }
function loadI18n(root) { const p = path.join(root,"output","i18n.json"); return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p,"utf-8")) : { ships:{}, cnToEn:{} }; }

// 第一步：升级包分析 / Step 1: Upgrade Analysis
function analyzeUpgrades(root) {
  const hangar = loadHangar(root); const catalog = loadCatalog(root);
  const pm = {}; catalog.forEach(s => { pm[s.name] = s.price; });
  const result = [];
  hangar.filter(i => i.category === "Upgrades").forEach(u => {
    if (!u.fromShip || !u.toShip) return;
    const fm = matchShip(u.fromShip, catalog), tm = matchShip(u.toShip, catalog);
    const fv = fm ? fm.price : (pm[u.fromShip]||0), tv = tm ? tm.price : (pm[u.toShip]||0), pd = tv - fv;
    if (pd <= 0) return;
    const ac = u.meltValue, sv = pd - ac, sp = pd > 0 ? sv/pd : 0;
    result.push({ id:u.id, name:u.name, fromShip:fm?fm.name:u.fromShip, toShip:tm?tm.name:u.toShip, fromValue:fv, toValue:tv, priceDiff:pd, actualCost:ac, savings:sv, savingsPercent:sp, isWarbond:u.isWarbond });
  });
  // 自定义 CCU / Custom CCUs
  const custom = loadCustomCCUs(root);
  custom.forEach((c, i) => {
    if (!c.fromShip || !c.toShip) return;
    const fm = matchShip(c.fromShip, catalog), tm = matchShip(c.toShip, catalog);
    const fv = fm ? fm.price : (pm[c.fromShip]||0), tv = tm ? tm.price : (pm[c.toShip]||0), pd = tv - fv;
    if (pd <= 0) return;
    const ac = c.actualCost || 0, sv = pd - ac, sp = pd > 0 ? sv/pd : 0;
    result.push({ id: "custom_"+i, name: `Custom: ${fm?fm.name:c.fromShip}→${tm?tm.name:c.toShip}`, fromShip: fm?fm.name:c.fromShip, toShip: tm?tm.name:c.toShip, fromValue:fv, toValue:tv, priceDiff:pd, actualCost:ac, savings:sv, savingsPercent:sp, isWarbond: c.isWarbond || false, addedBy: "custom" });
  });
  result.sort((a,b) => b.savingsPercent - a.savingsPercent);
  return result;
}

// 第二步：构建局部链 / Step 2: Build Local Chains
function buildLocalChains(upgrades) {
  const deduped = []; const seen = new Set();
  upgrades.forEach(u => { const k = u.fromShip+"|"+u.toShip+"|"+u.actualCost; if (!seen.has(k)) { seen.add(k); deduped.push(u); } });
  const byFrom = {}, byTo = {};
  deduped.forEach((u,i) => {
    if (!byFrom[u.fromShip]) byFrom[u.fromShip] = []; byFrom[u.fromShip].push(i);
    if (!byTo[u.toShip]) byTo[u.toShip] = []; byTo[u.toShip].push(i);
  });
  const allChains = [];
  for (let si = 0; si < deduped.length; si++) _extendFromSeed(si, deduped, byFrom, byTo, allChains);
  const seenSigs = new Set(); const scored = [];
  allChains.forEach(indices => {
    const steps = indices.map(i => deduped[i]);
    const sig = steps.map(s => s.id).sort().join(",");
    if (seenSigs.has(sig)) return; seenSigs.add(sig);
    const sv = steps[0].fromValue, ev = steps[steps.length-1].toValue, vs = ev - sv;
    const ts = steps.reduce((s,u) => s+u.savings, 0);
    scored.push({ steps, stepIds:steps.map(s=>s.id), valueSpan:vs, totalSavings:ts, score:(vs*VALUE_SPAN_WEIGHT)+(ts*SAVINGS_WEIGHT) });
  });
  scored.sort((a,b) => b.score - a.score);
  return scored;
}
function _extendFromSeed(si, upgrades, byFrom, byTo, results) {
  const fwd = _extendForward([si], upgrades, byFrom);
  fwd.forEach(c => { const bwd = _extendBackward(c, upgrades, byTo); bwd.forEach(x => { if (x.length>=1) results.push(x); }); });
}
function _extendForward(chain, upgrades, byFrom) {
  const last = upgrades[chain[chain.length-1]];
  const cands = (byFrom[last.toShip]||[]).filter(i => !chain.includes(i));
  if (cands.length===0) return [chain];
  if (cands.length===1) return _extendForward([...chain, cands[0]], upgrades, byFrom);
  const r=[]; cands.forEach(ci => { _extendForward([...chain, ci], upgrades, byFrom).forEach(b => r.push(b)); }); return r;
}
function _extendBackward(chain, upgrades, byTo) {
  const first = upgrades[chain[0]];
  const cands = (byTo[first.fromShip]||[]).filter(i => !chain.includes(i));
  if (cands.length===0) return [chain];
  if (cands.length===1) return _extendBackward([cands[0], ...chain], upgrades, byTo);
  const r=[]; cands.forEach(ci => { _extendBackward([ci, ...chain], upgrades, byTo).forEach(b => r.push(b)); }); return r;
}

// 第三四步：孤立升级包 + 预计算 / Steps 3-4: Isolated + Precompute
function findIsolated(upgrades, chains) { const ic = new Set(); chains.forEach(c => c.steps.forEach(s => ic.add(s.id))); return upgrades.filter(u => !ic.has(u.id)); }
function precompute(root) {
  console.log("  [CCU] Analyzing upgrades...");
  const upgrades = analyzeUpgrades(root); console.log(`  [CCU] ${upgrades.length} valid upgrades`);
  console.log("  [CCU] Building local chains...");
  const chains = buildLocalChains(upgrades); console.log(`  [CCU] ${chains.length} local chains`);
  const dedupedForIso = []; const isoSeen = new Set();
  upgrades.forEach(u => { const k = u.fromShip+"|"+u.toShip+"|"+u.actualCost; if (!isoSeen.has(k)) { isoSeen.add(k); dedupedForIso.push(u); } });
  const isolated = findIsolated(dedupedForIso, chains);
  const upgMap = {}; upgrades.forEach(u => { upgMap[u.id] = u; });
  const data = {
    weights:{valueSpanWeight:VALUE_SPAN_WEIGHT,savingsWeight:SAVINGS_WEIGHT},
    upgradeCount:dedupedForIso.length+isolated.length, chainCount:chains.length, isolatedCount:isolated.length,
    localChains:chains.map(c=>({stepIds:c.stepIds,valueSpan:c.valueSpan,totalSavings:c.totalSavings,score:c.score,steps:c.steps.map(s=>({id:s.id,fromShip:s.fromShip,toShip:s.toShip,fromValue:s.fromValue,toValue:s.toValue,actualCost:s.actualCost,savings:s.savings,savingsPercent:s.savingsPercent,isWarbond:s.isWarbond})),valueRange:{min:c.steps[0].fromValue,max:c.steps[c.steps.length-1].toValue}})),
    isolated:isolated.map(u=>({id:u.id,fromShip:u.fromShip,toShip:u.toShip,fromValue:u.fromValue,toValue:u.toValue,actualCost:u.actualCost,savings:u.savings,savingsPercent:u.savingsPercent})),
    upgrades:upgrades.map(u=>({id:u.id,fromShip:u.fromShip,toShip:u.toShip,fromValue:u.fromValue,toValue:u.toValue,actualCost:u.actualCost,savings:u.savings,savingsPercent:u.savingsPercent})),
    _upgMap:upgMap,
  };
  fs.writeFileSync(path.join(root,"output","ccu_analysis.json"), JSON.stringify(data,null,2));
  console.log(`  [CCU] Saved: output/ccu_analysis.json`);
  return data;
}

// 第五至十步：总链条组装 / Steps 5-10: Chain Assembly
function findBestChain(opts={}) {
  const {seedShip,targetShip,projectRoot:root=".",excludeIds=[]}=opts;
  const exSet=new Set(excludeIds);
  const catalog=loadCatalog(root),analysis=loadAnalysis(root),i18n=loadI18n(root);
  if(!analysis) return {error:"No analysis. Run precompute() first."};
  const target=matchShip(targetShip,catalog,i18n);
  if(!target) return {error:`Target "${targetShip}" not found`};
  const tp=target.price;
  const hangar=loadHangar(root);
  const seeds=hangar.filter(i=>i.category==="Standalone Ships"||i.category==="Game Packages");
  let seed=null;
  if(seedShip){const s=seeds.find(x=>x.actualShip===seedShip||x.name.includes(seedShip)||x.id===seedShip);
    if(s){let a=s.actualShip;if(!a){const cm=(s.contains||"").match(/Contains:\s*(.+?)\s+and\s+\d+\s+items?/);if(cm)a=cm[1];}if(!a)a=s.name.split(/[\n-]/).pop().trim();
      const sp=_shipPrice(a,catalog);seed={id:s.id,label:s.name.trim().split("\n")[0],actualShip:a,meltValue:s.meltValue,storePrice:sp,insurance:s.insurance||[]};}}
  if(!seed){
    // 虚拟种子：用户说"无视种子"或船不在机库中 / Virtual seed
    const sm = matchShip(seedShip, catalog, i18n);
    if (sm) {
      seed = { id: "virtual", label: sm.name, actualShip: sm.name, meltValue: sm.price, storePrice: sm.price, insurance: [], virtual: true };
    } else {
      return {error: `Seed "${seedShip}" not found in hangar or catalog`};
    }
  }
  if(seed.storePrice>=tp) return {error:"Seed price >= target price"};

  function assemble(rankedChains){
    // Limited-depth search: try all candidates at each decision point, depth-limited
    function search(curPrice,curShip,usedSet,pathSoFar,depth){
      if(curPrice>=tp||depth<=0) return _greedyFinish(curPrice,curShip,usedSet,pathSoFar);
      // Collect candidates at this position
      const cands=[];
      for(let ci=0;ci<rankedChains.length;ci++){if(usedSet.has(ci))continue;
        const ch=rankedChains[ci].steps;let si=-1,siVal=Infinity;
        for(let i=0;i<ch.length;i++){if(ch[i].fromValue>=curPrice&&ch[i].fromValue<tp&&ch[i].fromValue<siVal){si=i;siVal=ch[i].fromValue;}}
        if(si<0)continue;
        if(ch[si].fromValue===curPrice&&ch[si].fromShip!==curShip) continue; // 禁同价换船
        // Generate key partial suffixes + full suffix
        const full=ch.slice(si);let cs2=full[0].fromValue,ce=full[full.length-1].toValue;
        if(ce>tp){let ti=full.findIndex(x=>x.toValue>tp);if(ti<0)ti=full.length;full.length=ti;if(full.length===0)continue;ce=full[full.length-1].toValue;}
        if(cs2<tp&&ce>curPrice){cands.push({ci,suffix:[...full],cStart:cs2,cEnd:ce});}
      }
      // Also add "just gap to end" as a candidate (skip all chains)
      if(cands.length===0||depth<=0) return _greedyFinish(curPrice,curShip,usedSet,pathSoFar);
      let best=null,bestCCU=Infinity;
      for(const cand of cands){
        const path=[...pathSoFar];
        if(cand.cStart>curPrice) path.push({from:curShip,to:cand.suffix[0].fromShip,fromPrice:curPrice,toPrice:cand.cStart,cost:cand.cStart-curPrice,owned:false,ccuid:"",isWarbond:false,gap:true});
        cand.suffix.forEach(s=>path.push({from:s.fromShip,to:s.toShip,fromPrice:s.fromValue,toPrice:s.toValue,cost:s.actualCost,owned:true,ccuid:s.id,isWarbond:s.isWarbond,gap:false}));
        const used=new Set(usedSet);used.add(cand.ci);
        const result=search(cand.cEnd,cand.suffix[cand.suffix.length-1].toShip,used,path,depth-1);
        if(result.totalCCU<bestCCU){best=result;bestCCU=result.totalCCU;}
      }
      return best;
    }
    function _greedyFinish(curPrice,curShip,usedSet,pathSoFar){
      const steps=[...pathSoFar];let cp=curPrice,cs=curShip;const used=new Set(usedSet);
      while(cp<tp){
        let best=null,bestSuffix=null,bestStart=0,bestEnd=0;
        for(let ci=0;ci<rankedChains.length;ci++){if(used.has(ci))continue;
          const ch=rankedChains[ci].steps;let si=-1,siVal=Infinity;
          for(let i=0;i<ch.length;i++){if(ch[i].fromValue>cp&&ch[i].fromValue<tp&&ch[i].fromValue<siVal){si=i;siVal=ch[i].fromValue;}}
          if(si<0)continue;let s=ch.slice(si);let cs2=s[0].fromValue,ce=s[s.length-1].toValue;
          if(cs2>=tp||ce<=cp)continue;if(ce>tp){let ti=s.findIndex(x=>x.toValue>tp);if(ti<0)ti=s.length;s=s.slice(0,ti);if(s.length===0)continue;ce=s[s.length-1].toValue;if(ce<=cp)continue;}
          if(!best||ce>bestEnd){best=ci;bestSuffix=s;bestStart=cs2;bestEnd=ce;}}
        if(!best){steps.push({from:cs,to:target.name,fromPrice:cp,toPrice:tp,cost:tp-cp,owned:false,ccuid:"",isWarbond:false,gap:true});cp=tp;cs=target.name;break;}
        used.add(best);if(bestStart>cp)steps.push({from:cs,to:bestSuffix[0].fromShip,fromPrice:cp,toPrice:bestStart,cost:bestStart-cp,owned:false,ccuid:"",isWarbond:false,gap:true});
        bestSuffix.forEach(s=>steps.push({from:s.fromShip,to:s.toShip,fromPrice:s.fromValue,toPrice:s.toValue,cost:s.actualCost,owned:true,ccuid:s.id,isWarbond:s.isWarbond,gap:false}));
        cp=bestEnd;cs=bestSuffix[bestSuffix.length-1].toShip;}
      if(cp>=tp&&cs!==target.name) return {steps,totalCCU:1e9};
      const tccu=steps.reduce((s,e)=>s+e.cost,0);return {steps,totalCCU:tccu};}
    const result=search(seed.storePrice,seed.actualShip,new Set(),[], 5);
    if(result.totalCCU>1e8) return {steps:result.steps,totalCCU:1e9,ownedCost:0,gapCost:0,totalMelt:1e9,finalValue:tp,savings:0,efficiency:"0",hasGaps:false};
    const steps=result.steps;
    const tccu=steps.reduce((s,e)=>s+e.cost,0),oc=steps.filter(e=>e.owned).reduce((s,e)=>s+e.cost,0),gc=steps.filter(e=>e.gap).reduce((s,e)=>s+e.cost,0);
    const tm=seed.meltValue+tccu,fv=steps.length>0?steps[steps.length-1].toPrice:tp,sv=fv-tm,ef=tm>0?(fv/tm).toFixed(2):"∞",hg=steps.some(e=>e.gap);
    return {steps,totalCCU:tccu,ownedCost:oc,gapCost:gc,totalMelt:tm,finalValue:fv,savings:sv,efficiency:ef,hasGaps:hg};
  }
  let activeChains=analysis.localChains;
  if(exSet.size>0){activeChains=analysis.localChains.filter(c=>!c.stepIds.some(id=>exSet.has(id)));}
  const best=assemble(activeChains);
  return {target:target.name,targetPrice:tp,seed,chain:_makeChain(seed,best),alternatives:[],analysisInfo:{upgradeCount:analysis.upgradeCount,chainCount:analysis.chainCount,isolatedCount:analysis.isolatedCount}};
}
function _shipPrice(n,c){const m=matchShip(n,c);return m?m.price:0;}
function _makeChain(seed,a){return{seed,steps:a.steps,totalMelt:a.totalMelt,finalValue:a.finalValue,savings:a.savings,efficiency:a.efficiency,hasGaps:a.hasGaps,ownedCost:a.ownedCost,gapCost:a.gapCost};}

// 第一步：升级包分析 / Step 1: Upgrade Analysis1
function formatChainTable(chain, i18n){
  const{seed,steps,totalMelt,finalValue,savings,efficiency,hasGaps,ownedCost,gapCost}=chain;const l=[];
  // 本地化船名 / Translate ship names (try multiple variants)
  const cn = (name) => {
    if (!i18n || !i18n.ships) return name;
    // Try exact, then space-variant, then hyphen-variant
    const candidates = [name, name.replace(/-/g, " "), name.replace(/ /g, "-")];
    for (const c of candidates) {
      const entry = i18n.ships[c];
      if (entry) return entry.short || entry.full || name;
    }
    return name;
  };
  const seedTag = seed.virtual ? " [虚拟/需购买]" : "";
  const seedName = cn(seed.actualShip);
  l.push("",`**Seed Ship**: ${seedName} (${seed.label})${seedTag}`,`  Melt: $${seed.meltValue} | Insurance: ${seed.insurance.join(", ") || "无"}`, "");
  l.push("| # | From | To | From Value | To Value | CCU Cost | Source | Note |","|---|------|----|-----------|---------|----------|--------|------|");
  if(steps.length===0) l.push(`| - | ${seedName} | *(at target)* | - | $${finalValue} | - | - | - |`);
  else steps.forEach((s,i)=>{const src=s.owned?(s.ccuid.startsWith("custom_")?"自定义":`#${s.ccuid}`):"—";let note=s.gap?"⚠️ 无升级":"";if(!s.gap){note=(s.isWarbond?"Warbond":"")+(s.ccuid?.startsWith("custom_")?(s.isWarbond?" (自定义)":"(自定义)"):"");}l.push(`| ${i+1} | ${cn(s.from)} | ${cn(s.to)} | $${s.fromPrice} | $${s.toPrice} | $${s.cost} | ${src} | ${note} |`);});
  const tc=steps.reduce((s,e)=>s+e.cost,0);l.push(`| | **TOTALS** | | | **$${finalValue}** | **$${tc}** | | |`,"");
  l.push(`- **种子船熔解价值**: $${seed.meltValue}`,`- **自有 CCU 实际成本**: $${ownedCost??tc}`);
  if(hasGaps||gapCost>0) l.push(`- **断层需购买成本**: $${gapCost||0}`);
  l.push(`- **总实际成本**: $${totalMelt}`,`- **最终船只价值**: $${finalValue}`,`- **节省**: $${savings} (${efficiency}x value)`);
  if(hasGaps) l.push(`\n> ⚠️ 含断层 — 标"无升级"的行需从商店原价购买。`);
  return l.join("\n");
}
function formatResults(result, i18n){
  if(result.error) return `Error: ${result.error}`;
  if(result.chain.totalMelt>1e8) return `## No valid path to **${result.target}**\n\nYour available CCUs cannot reach this ship without illegal same-price side-grades.`;
  const l=[];
  const cn = i18n?.ships ? (name) => { for (const c of [name, name.replace(/-/g," "), name.replace(/ /g,"-")]) { const e = i18n.ships[c]; if (e) return e.short||e.full||name; } return name; } : (n) => n;
  l.push(`## CCU Chain: ${cn(result.seed.actualShip)} → **${cn(result.target)}** ($${result.targetPrice})`);
  l.push(`_${result.analysisInfo.upgradeCount} upgrades, ${result.analysisInfo.chainCount} chains, ${result.analysisInfo.isolatedCount} isolated_`,"");
  l.push(`### Best — $${result.chain.totalMelt} (${result.chain.efficiency}x)`);
  l.push(formatChainTable(result.chain, i18n));
  if(result.alternatives?.length){l.push("### Alternatives");result.alternatives.forEach((a,i)=>{l.push(`<details><summary>Alt ${i+1}: $${a.totalMelt} (${a.efficiency}x)</summary>\n`);l.push(formatChainTable(a, i18n));l.push("</details>\n");});}
  return l.join("\n");
}

module.exports={setWeights,normalize,matchShip,ALIASES,analyzeUpgrades,buildLocalChains,precompute,findBestChain,formatChainTable,formatResults,loadCustomCCUs,saveCustomCCUs,loadI18n};
