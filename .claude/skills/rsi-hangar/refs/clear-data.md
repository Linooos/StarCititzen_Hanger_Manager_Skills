# 清除数据 / Clear Data

当用户要求清除隐私数据或重置项目时执行。

## 默认清除（保留缓存）

清除会话、凭证和临时数据，**不删除 `output/cache/` 中的可复用缓存文件**：

```bash
cd D:/WindowsFiles/Users/Stainless_Kettle/Desktop/1
rm -rf user_data && rm -f cookies.json local_storage.json output/hangar_items.json output/hangar_items.csv output/ccu_analysis.json output/custom_ccus.json output/global.ini output/store_products.json && mkdir -p output
```

## 清除内容

- `user_data/` — Chrome 登录会话（含 RSI cookies）
- `cookies.json` — 登录凭据快照
- `local_storage.json` — 本地存储快照
- `output/hangar_items.json` / `.csv` — 机库数据
- `output/ccu_analysis.json` — CCU 预计算
- `output/custom_ccus.json` — 自定义 CCU
- `output/global.ini` — 原始汉化文件（`i18n:setup` 可重新下载）
- `output/store_products.json` — 商店产品数据（`scrape:store` 可重新获取）

## 保留内容（默认不删除）

- `output/cache/ships.json` — 船只目录缓存
- `output/cache/i18n.json` — 翻译缓存
- `output/cache/historical_ccus.json` — 历史 CCU 缓存（~4分钟全量抓取）
- `output/cache/.cache_meta.json` — 缓存元数据

源代码、配置文件、node_modules、docs。

## 强制清除（含缓存）

**仅在用户明确要求删除缓存时**执行：

```bash
cd D:/WindowsFiles/Users/Stainless_Kettle/Desktop/1
rm -rf user_data cookies.json local_storage.json output
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
缓存文件仍在，`npm run scrape:ships` 和 `scrape:historical` 可按需刷新。
