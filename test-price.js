const fs = require("fs");
const { findBestChain } = require("./src/ccu");
const r = findBestChain({ seedShip: "Aurora Mk II", targetShip: "Perseus", projectRoot: ".", completeMode: true, useHistorical: "2023-05-29" });
console.log("Total: $" + r.chain.totalMelt);
// Check Hull-B in steps
const hullBSteps = r.chain.steps.filter(s => s.to === "Hull-B" || s.from === "Hull-B");
console.log("Hull-B steps:", hullBSteps.length);
hullBSteps.forEach(s => console.log("  "+s.from+"→"+s.to+" $"+s.cost+" "+ (s.historicalInfo?.event||"")));
// Check all price change edges in chain
const pcEdges = r.chain.steps.filter(s => s.historicalInfo?.event?.includes("涨价"));
console.log("Price change edges:", pcEdges.length);
pcEdges.forEach(s => console.log("  "+s.from+"→"+s.to+" $"+s.cost+" | "+s.historicalInfo.event));
