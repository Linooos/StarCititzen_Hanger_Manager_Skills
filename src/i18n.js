/**
 * Chinese Localization / 汉化模块
 * Parses global.ini → compact i18n.json lookup
 */
const fs = require("fs");
const path = require("path");
const https = require("https");

const INI_URL = "https://ini.42kit.com/full/global.ini";

// 制造商缩写映射 / Manufacturer abbreviation map
const MFG_MAP = {
  AEGS: "圣盾", ANVL: "铁砧", DRAK: "德雷克", MISC: "武藏", ORIG: "起源",
  RSI: "罗伯茨太空", CRSD: "十字军", CNOU: "联合外域", ARGO: "南船座",
  BANU: "巴努", XIAN: "希安", ESPR: "埃斯佩里亚", KRIG: "克鲁格",
  TMBL: "盾博尔", GRIN: "灰猫", GAMA: "盖塔克", MRAI: "未来", VNCL: "联合",
};

// Parse manufacturer from vehicle key like "vehicle_NameAEGS_Avenger_Stalker"
function parseVehicleKey(key) {
  const m = key.match(/^vehicle_Name([A-Z]+)_(.+)$/);
  if (!m) return null;
  const mfgCode = m[1], mfg = MFG_MAP[mfgCode] || mfgCode;
  const isShort = key.endsWith("_short");
  let raw = m[2];
  if (isShort) raw = raw.replace(/_short$/, "").replace(/short$/, "");
  const name = raw.replace(/_/g, " ").trim();
  return { mfgCode, mfg, name, isShort };
}

function download(filePath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filePath);
    https.get(INI_URL, res => { res.pipe(file); file.on("finish", () => { file.close(); resolve(); }); })
      .on("error", reject);
  });
}

function parse(filePath) {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  const ships = {}, items = {}, paints = {}, others = {};
  const cnToEn = {}; // 中文 → 英文映射

  for (const line of lines) {
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.substring(0, eq).trim();
    const val = line.substring(eq + 1).trim();
    if (!val) continue;

    // 车辆名称 / Vehicle names
    if (key.startsWith("vehicle_Name")) {
      const parsed = parseVehicleKey(key);
      if (!parsed) continue;
      const enName = parsed.name;
      if (!ships[enName]) ships[enName] = {};
      if (parsed.isShort) ships[enName].short = val;
      else ships[enName].full = val;
      // 中文→英文
      const shortCn = val.split(" ").pop();
      cnToEn[val] = enName;
      cnToEn[shortCn] = enName;
    }
    // 涂装 / Paints
    else if (key.toLowerCase().includes("paint") && key.includes("Name")) {
      const name = key.replace(/^.*Name_?/, "").replace(/_/g, " ");
      paints[name] = val;
      cnToEn[val] = key;
    }
    // 物品 / Items (flair, armor, weapon, etc.)
    else if (key.includes("flair") || key.includes("Flair") || key.includes("Armor") || key.includes("Weapon")) {
      if (key.includes("Name")) {
        const name = key.replace(/_/g, " ").replace(/Name/, "").trim();
        items[name] = val;
      }
    }
  }

  return { ships, items, paints, others, cnToEn };
}

function exportCompact(root) {
  const iniPath = path.join(root, "output", "global.ini");
  if (!fs.existsSync(iniPath)) return null;
  const data = parse(iniPath);
  // 扩展 cnToEn：添加中文简称和部分匹配 / Expand with short names and partial matches
  for (const [en, cn] of Object.entries(data.ships)) {
    if (cn.full) data.cnToEn[cn.full] = en;
    if (cn.short) data.cnToEn[cn.short] = en;
    if (cn.full && !data.cnToEn[cn.full]) data.cnToEn[cn.full] = en;
    if (cn.short && !data.cnToEn[cn.short]) data.cnToEn[cn.short] = en;
  }
  const out = { ships: data.ships, items: data.items, paints: data.paints, cnToEn: data.cnToEn };
  fs.writeFileSync(path.join(root, "output", "i18n.json"), JSON.stringify(out, null, 2));
  return out;
}

// 查找翻译 / Look up translation
function translate(i18n, name, type = "ship") {
  if (!i18n) return name;
  const dict = type === "ship" ? i18n.ships : type === "paint" ? i18n.paints : i18n.items;
  if (!dict) return name;
  const entry = dict[name];
  if (!entry) return name;
  return entry.short || entry.full || name;
}

// 从中文名反查英文 / Reverse lookup Chinese → English
function fromChinese(i18n, cnName) {
  if (!i18n || !i18n.cnToEn) return cnName;
  return i18n.cnToEn[cnName] || cnName;
}

// 添加翻译映射并保存到缓存 / Add translation and persist
function addTranslation(root, cnName, enName) {
  const p = path.join(root, "output", "i18n.json");
  const data = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf-8")) : { ships:{}, paints:{}, items:{}, cnToEn:{} };
  if (!data.cnToEn) data.cnToEn = {};
  if (!data.cnToEn[cnName]) {
    data.cnToEn[cnName] = enName;
    fs.writeFileSync(p, JSON.stringify(data, null, 2));
    return true;
  }
  return false;
}

// 一键：下载+解析+导出
async function setup(root) {
  console.log("  [i18n] Downloading global.ini...");
  const iniPath = path.join(root, "output", "global.ini");
  try { await download(iniPath); } catch(e) { console.log("  [i18n] Download failed: " + e.message); return null; }
  console.log("  [i18n] Parsing...");
  const data = exportCompact(root);
  if (data) {
    console.log(`  [i18n] Exported: ${Object.keys(data.ships).length} ships, ${Object.keys(data.paints).length} paints, ${Object.keys(data.cnToEn).length} CN→EN mappings`);
  }
  return data;
}

module.exports = { setup, parse, exportCompact, translate, fromChinese, download, addTranslation, MFG_MAP };
