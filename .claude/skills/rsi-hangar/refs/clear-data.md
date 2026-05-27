# 清除数据 / Clear Data

当用户要求清除隐私数据或重置项目时执行。

## 默认清除（保留缓存）

清除会话和机库数据，**不删除可复用的缓存文件**：

```bash
cd D:/WindowsFiles/Users/Stainless_Kettle/Desktop/1
rm -rf user_data && rm -f output/hangar_items.json output/hangar_items.csv output/ccu_analysis.json output/custom_ccus.json && mkdir -p output
```

## 清除内容

- `user_data/` — Chrome 登录会话（含 RSI cookies）
- `output/hangar_items.json` / `.csv` — 机库数据
- `output/ccu_analysis.json` — CCU 预计算
- `output/custom_ccus.json` — 自定义 CCU

## 保留内容（默认不删除）

- `output/cache/ships.json` — 船只目录缓存（`scrape:ships` 可重新获取）
- `output/cache/i18n.json` — 翻译缓存（`i18n:setup` 可重新获取）
- `output/cache/historical_ccus.json` — 历史 CCU 缓存（~4分钟全量抓取，`scrape:historical` 可重新获取）
- `output/cache/.cache_meta.json` — 缓存元数据（记录各文件更新时间）

源代码、配置文件、node_modules、docs。

## 强制清除（含缓存）

**仅在用户明确要求删除缓存时**执行：

```bash
cd D:/WindowsFiles/Users/Stainless_Kettle/Desktop/1
rm -rf user_data output/* output/cache/*
```

或单独清除缓存：

```bash
rm -rf output/cache/*
```

## 检查缓存状态

```js
const { all, check } = require("./src/cache-meta");
console.log(all("."));                        // 所有缓存元数据
console.log(check(".", "ships.json"));        // 检查 ships 缓存是否过期（默认7天）
console.log(check(".", "historical_ccus.json", 30*24*3600*1000)); // 30天过期阈值
```

## 注意

清除后需重新登录和爬取（`npm run login` + `npm run scrape`）才能使用 CCU 分析。
但缓存文件仍在，`npm run scrape:ships` 和 `scrape:historical` 可按需刷新。
