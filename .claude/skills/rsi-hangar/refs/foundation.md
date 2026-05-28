# 基础功能 / Foundation

> **Skill 触发时必须首先阅读此文件。**
> 项目根目录：`D:/WindowsFiles/Users/Stainless_Kettle/Desktop/1`

## 项目结构 / Layout

```
./
├── src/
│   ├── hangar.js            # 核心库：登录、爬取、导出
│   ├── login.js             # 交互式登录 CLI
│   ├── scrape.js            # 机库爬取 CLI
│   ├── scrape-ships.js      # 船只目录爬取 CLI
│   ├── scrape-historical.js # 历史 CCU 数据爬取 CLI
│   ├── ships.js             # 船只目录模块
│   ├── ccu.js               # CCU 升级链计算
│   ├── historical-ccu.js    # scorg.tools 历史 CCU 抓取模块
│   ├── cache-meta.js        # 缓存元数据（时间戳管理）
│   └── validate.js          # 数据验证
├── output/             # 导出数据
├── user_data/          # Chrome 持久会话
├── docs/ccu-rules.md   # CCU 规则参考
├── config.json
└── package.json
```

## 命令 / Commands

| 命令 | 用途 |
|------|------|
| `npm run login` | 交互式登录（可见浏览器） |
| `npm run scrape` | 爬取机库 + CCU 预计算 |
| `npm run scrape:headless` | 同上，无头模式 |
| `npm run scrape:ships` | 爬取船只目录 |
| `npm run scrape:ships:headless` | 同上，无头模式 |
| `npm run scrape:historical` | 抓取 scorg.tools 历史 CCU 数据 |
| `npm run scrape:historical:headless` | 同上，无头模式 |
| `npm run validate` | 数据质量检查 |

工作目录：所有命令在项目根目录运行。

## 本地化 / Localization

支持多语言船名/物品名查询。当前已实现中文，预留其他语言扩展。

### 中文 / Chinese

数据来源：https://ini.42kit.com/full/global.ini

```bash
node -e "require('./src/i18n').setup('.')"   # 下载+解析
```

导出 `output/cache/i18n.json`（335 船 + 960 涂装 + 1717 中→英映射）。

**数据时效**：每次使用本地化翻译时，检查 `output/cache/i18n.json` 的上次更新时间（通过 `cache-meta.js` 的 `.cache_meta.json`）。若超过 30 天未更新，提示用户："翻译数据已超过一个月未更新，是否有新船或新涂装需要同步？"（`node -e \"require('./src/i18n').setup('.')\"`）。用户拒绝则继续使用现有翻译。

**交互流程**（由 LLM 进行模糊匹配和消歧）：

1. **代码精确匹配** — `matchShip(name, catalog, i18n)` 查 `cnToEn` 映射 + `ships` 的 full/short 名称。
2. **LLM 模糊匹配** — 代码未命中时 LLM 根据 i18n 数据消歧。
3. **匹配后写入缓存** — `addTranslation(root, cnName, enName)` 保存到 `i18n.json`。
4. **缓存缺失** — 未匹配到名称时自动 `setup('.')` 下载，刷新缓存。
5. **仍不确定** — 列出候选询问用户。

**注意**：当自动 `setup('.')` 下载仍旧无法匹配，立刻返回询问用户，**不要自行试图解释和搜索**

> 代码仅负责精确映射。模糊匹配由 LLM 判断。匹配成功后自动缓存供后续使用。

**自动获取 i18n 缓存**：CCU 分析或商店浏览中，用户使用中文等非英文船名且 `matchShip()` 匹配失败、同时 `output/cache/i18n.json` 不存在时，立即执行 `node -e "require('./src/i18n').setup('.')"` 下载翻译数据，**不要询问用户**。下载完成后重新尝试匹配。

### 扩展其他语言

在 `src/i18n.js` 中添加新的语言解析器，在 `output/` 下存放对应缓存文件。
接口需导出：`setup(root)`, `translate(i18n, name)`, `fromLang(i18n, name)`, `addTranslation(root, langName, enName)`。

## 登录 / Login

检查 `user_data/` 是否存在。若缺失：

```bash
cd D:/WindowsFiles/Users/Stainless_Kettle/Desktop/1
npm run login
```

- **浏览器可见** — 用户需手动输入账号密码及 2FA
- 自动检测 URL 离开 `/sign-in` 视为登录成功
- **会话过期检测**：爬取前访问机库页面，若标题为 "Access denied" 或无物品数据，提示重新登录

> **自动登录**：`user_data/` 缺失时，告知用户"需要登录 RSI 账号"并立即执行 `npm run login`，**不要询问用户是否登录**。

## 爬取数据 / Scrape

如用户未要求调试则**使用无头模式**。

```bash
npm run scrape:headless         # 机库物品
npm run scrape:ships:headless   # 船只目录
```

输出文件：
- `output/hangar_items.json` — 机库物品
- `output/cache/ships.json` — 船只商店价格缓存
- `output/cache/i18n.json` — 翻译缓存
- `output/cache/historical_ccus.json` — 历史 CCU 缓存
- `output/cache/.cache_meta.json` — 缓存元数据（更新时间戳）

> 数据已存在时自动跳过。使用 `--force` 强制刷新。

### 启动时自动检查 / Startup Auto-Check

**Skill 触发时，必须检查以下三项核心数据，任意缺失则告知用户并立即获取，不得询问：**

| 检查项 | 路径 | 缺失时操作 |
|--------|------|-----------|
| 登录会话 | `user_data/` | `npm run login`（需用户交互输入账号密码） |
| 机库数据 | `output/hangar_items.json` | `npm run scrape:headless` |
| 船只目录 | `output/cache/ships.json` | `npm run scrape:ships:headless` |

> 三项均存在后才进入正常交互流程。若 `user_data/` 存在但会话过期（爬取时报 "Access denied"），提示用户重新登录。

**完全模式快捷路径**：若 `user_data/` 和 `output/hangar_items.json` 均缺失，在开始获取前先用 AskUserQuestion 询问用户：

> "检测到无登录会话和机库数据。是否使用**完全模式**（仅用历史 CCU 计算，不需登录）？需要船只目录缓存和历史 CCU 全量缓存。"
> 1. **使用完全模式** — 跳过登录和机库抓取，仅需确保 `ships.json` + `historical_ccus.json` 存在
> 2. **正常登录** — 依次执行 login → scrape → scrape:ships

**重要：必须依次执行，不得并行**。所有抓取脚本共用 `user_data/`，并行会导致 Chrome 配置冲突。每个脚本完成后 `launchContext` 会等待 2 秒确保 Chrome 进程完全退出。执行顺序：

```
npm run login          # 1. 先登录（有头，用户交互）
npm run scrape:headless       # 2. 再机库（无头）
npm run scrape:ships:headless # 3. 最后船只目录（无头）
```

> 上一步完成后再启动下一步。不要同时运行多个抓取命令。

## 数据模式 / Data Schemas

### hangar_items.json — 机库物品

每个物品包含以下字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 唯一物品 ID |
| `name` | string | 物品名称 |
| `category` | string | 分类：`Standalone Ships`, `Game Packages`, `Upgrades`, `Subscriber Flair`, `Hangar Decorations`, `Component`, `Weapon` |
| `value` | string | 标称价格（如 `"$10.00 USD"`） |
| `meltValue` | number | 溶解价值（实际支付金额，USD） |
| `currency` | string | 支付方式（`Store Credit` / 现金） |
| `notBuybackable` | boolean | 溶解后不可回购 |
| `insurance` | string[] | 保险类型（`LTI`, `120mo`, `24mo`, `6mo`, `3mo`） |
| `actualShip` | string | 当前实际船只（升级后可能与标签名不同） |
| `contains` | string | 包含物品描述 |
| `upgraded` | boolean | 是否已应用过升级包 |
| `giftable` / `exchangeable` | boolean | 可否赠送/溶解 |
| `attachedItems` | string[] | 附属物品描述 |
| `image` | string | 物品缩略图 URL |

**升级包专属字段**（category = `Upgrades`）：

| 字段 | 类型 | 说明 |
|------|------|------|
| `fromShip` | string | 可应用的原始船只名 |
| `toShip` | string | 升级后的目标船只名 |
| `isWarbond` | boolean | 是否为 Warbond 折扣 CCU |

**种子船专属字段**（category = `Standalone Ships`）：

| 字段 | 类型 | 说明 |
|------|------|------|
| `upgradeChain[]` | object | 已应用的 CCU 链，每项含 `{date, ccuId, from, to, isWarbond, newValue}` |

### ships.json — 船只目录

250 艘船，每艘包含：

| 字段 | 类型 | 说明 |
|------|------|------|
| `name` | string | 船名（如 `Aurora-Mk-II`） |
| `slug` | string | URL slug |
| `price` | number | 商店价格（USD，0 = 未知） |
| `manufacturer` | string | 制造商（如 `Roberts Space Industries`） |
| `manufacturerSlug` | string | 制造商 URL slug |
| `crew` | number | 最大船员数 |
| `status` | string | 开发状态（`Flight Ready`, `In Concept` 等） |
| `roles` | string[] | 角色标签（如 `["Multi-role", "Starter"]`） |
| `url` | string | pledge store 详情页 URL |

### historical_ccus.json — 历史 CCU 数据

数组，最后一项为 `_metadata`。每个船包含：

| 字段 | 类型 | 说明 |
|------|------|------|
| `shipName` | string | 船名（匹配 catalog） |
| `rawName` | string | scorg.tools 原始名 |
| `shipId` | string | scorg ship ID |
| `regularPrice` | number | MSRP / CCU 价值 |
| `history[]` | object | CCU 历史数组 |
| `history[].date` | string | 日期 (YYYY-MM-DD) |
| `history[].status` | string | Warbond / Available / NoLongerOnSale / WarbondEnded |
| `history[].price` | number\|null | Warbond 折扣价（非 WB 状态为 null） |
| `history[].event` | string | 活动名（如 "Invictus 2953"） |

## 数据验证 / Validate

需要时手动调用：

```bash
npm run validate
```

详见 `refs/validate.md`。

## API 速查

### hangar.js
`launchContext` `login` `scrapeAll` `extractPageItems` `expandAllItems` `expandUpgradeLogs` `exportJSON` `exportCSV` `summarize` `numericValue`

### ships.js
`scrapeAllShips` `extractShipCards` `exportJSON` `exportCSV`

### ccu.js
`findBestChain({seedShip, targetShip, projectRoot, excludeIds, useHistorical})` `formatChainTable` `formatResults` `setWeights` `matchShip` `loadHistoricalCCUs` `loadCustomCCUs` `saveCustomCCUs`

- `useHistorical` — 可选。传 `true`（默认1年）、Date 对象或日期字符串如 `"2025-05-28"`。加载 `output/cache/historical_ccus.json` 中的历史 WB 价格，在图中添加折扣边。

### historical-ccu.js
`scrapeFullHistory` `fetchShipHistory` `loadHistoricalCCUs` `exportJSON` `getCacheMetadata`

### cache-meta.js
`touch(root, name, source)` `check(root, name, maxAgeMs)` `all(root)` `readMeta(root)` `writeMeta(root, data)`

## 注意事项 / Notes

- 使用系统 Chrome（`channel: "chrome"`）避免 Cloudflare 检测
- 登录时有头（用户需 2FA），爬取时可无头
- 会话持久数周，`output/` `user_data/` 已 git 忽略
- CCU 链条分析见 `refs/ccu-analysis.md`，清除数据见 `refs/clear-data.md`
