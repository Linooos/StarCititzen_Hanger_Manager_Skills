# Foundation / 基础功能

> 项目根目录：`D:/WindowsFiles/Users/Stainless_Kettle/Desktop/1`

## 启动检查

Skill 触发时检查三项数据，**缺失则立即执行获取，不询问**：

| 检查项 | 路径 | 缺失时操作 |
|--------|------|-----------|
| 登录会话 | `user_data/` | `npm run login`（有头，用户输密码） |
| 机库数据 | `output/hangar_items.json` | `npm run scrape:headless` |
| 船只目录 | `output/cache/ships.json` | `npm run scrape:ships:headless` |

必须依次执行，不得并行（共用 `user_data/`）。`launchContext` 退出后等 2 秒释放 Chrome 配置。

完全模式快捷路径：若 `user_data/` + `hangar_items.json` 均缺失，用 AskUserQuestion 询问是否使用完全模式（不需登录，仅需 `ships.json` + `historical_ccus.json`）。

## 命令

| 命令 | 用途 |
|------|------|
| `npm run login` | 交互式登录 |
| `npm run scrape:headless` | 爬取机库（无头） |
| `npm run scrape:ships:headless` | 爬取船只目录（无头） |
| `npm run scrape:historical:headless` | 抓取 scorg 历史 CCU（无头，~4分钟） |
| `npm run validate` | 数据验证 |

## 本地化

中文船名/物品名来自 https://ini.42kit.com/full/global.ini。

```bash
node -e "require('./src/i18n').setup('.')"   # 下载+解析 → output/cache/i18n.json
```

LLM 负责模糊匹配和消歧。`matchShip()` 精确匹配 → 失败时 LLM 根据 i18n 数据推断 → 匹配成功写入缓存 `addTranslation()`。`i18n.json` 缺失或匹配失败时自动 `setup('.')` 下载，不询问。

## 数据模式

### hangar_items.json
核心字段：`id`, `name`, `category`, `meltValue`, `actualShip`, `insurance[]`

升级包额外字段：`fromShip`, `toShip`, `isWarbond`

### ships.json — 船只目录
`name`, `price`（USD），`manufacturer`, `status`, `roles[]`。约 250 艘。

### historical_ccus.json — 历史 CCU
`shipName`, `regularPrice`, `history[]` — 每项 `{date, status, price, event}`。状态：`Warbond` / `Available` / `PriceIncrease` / `NoLongerOnSale` / `WarbondEnded`。

### 缓存元数据
`output/cache/.cache_meta.json` — 记录各缓存文件更新时间。`cache-meta.js` 提供 `check()` 判断过期。

## API

### ccu.js
`findBestChain({seedShip, targetShip, projectRoot, useHistorical, completeMode, temporalConsistency, excludeIds})` `formatChainTable` `formatResults` `loadHistoricalCCUs` `decomposeGaps`

### hangar.js
`launchContext` `login` `scrapeAll` `exportJSON` `exportCSV`

### historical-ccu.js
`scrapeFullHistory` `fetchShipHistory` `loadHistoricalCCUs` `getCacheMetadata`

### cache-meta.js
`touch(root,name,source)` `check(root,name,maxAgeMs)` `all(root)`
