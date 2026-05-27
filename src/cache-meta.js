/**
 * Cache metadata tracker / 缓存元数据
 * Records update timestamps for cache files so staleness can be checked.
 * @module cache-meta
 */
const fs = require("fs"), path = require("path");

const CACHE_DIR = "cache";
const META_FILE = ".cache_meta.json";

/** Get path to meta file */
function metaPath(root) {
  return path.join(root, "output", CACHE_DIR, META_FILE);
}

/** Read existing metadata or return empty object */
function readMeta(root) {
  const p = metaPath(root);
  if (!fs.existsSync(p)) return {};
  try { return JSON.parse(fs.readFileSync(p, "utf-8")); } catch (_) { return {}; }
}

/** Write metadata */
function writeMeta(root, data) {
  const p = metaPath(root);
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
}

/**
 * Record that a cache file was just updated.
 * @param {string} root - project root
 * @param {string} name - cache file name (e.g. "ships.json")
 * @param {string} source - what triggered the update (e.g. "scrape:ships")
 */
function touch(root, name, source) {
  const meta = readMeta(root);
  meta[name] = { updated: new Date().toISOString(), source };
  writeMeta(root, meta);
}

/**
 * Check if a cache file exists and is recent enough.
 * @param {string} root
 * @param {string} name - cache file name
 * @param {number} maxAgeMs - max age in milliseconds (default 7 days)
 * @returns {{ exists: boolean, stale: boolean, updated?: string, age?: number }}
 */
function check(root, name, maxAgeMs = 7 * 24 * 60 * 60 * 1000) {
  const filePath = path.join(root, "output", CACHE_DIR, name);
  const exists = fs.existsSync(filePath);
  if (!exists) return { exists: false, stale: true };

  const meta = readMeta(root);
  const entry = meta[name];
  if (!entry || !entry.updated) return { exists: true, stale: true };

  const age = Date.now() - new Date(entry.updated).getTime();
  return { exists: true, stale: age > maxAgeMs, updated: entry.updated, age, source: entry.source };
}

/** Get all cache metadata */
function all(root) {
  return readMeta(root);
}

module.exports = { touch, check, all, readMeta, writeMeta, metaPath, CACHE_DIR, META_FILE };
