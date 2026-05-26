# 基础功能 / Foundation

> **Skill 触发时必须首先阅读此文件。**
> 项目根目录：`D:/WindowsFiles/Users/Stainless_Kettle/Desktop/1`

## 项目结构 / Layout

```
./
├── src/
│   ├── hangar.js       # 核心库：登录、爬取、导出
│   ├── login.js        # 交互式登录 CLI
│   ├── scrape.js       # 机库爬取 CLI
│   ├── scrape-ships.js # 船只目录爬取 CLI
│   ├── ships.js        # 船只目录模块
│   ├── ccu.js          # CCU 升级链计算
│   └── validate.js     # 数据验证
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
| `npm run validate` | 数据质量检查 |

工作目录：所有命令在项目根目录运行。

## 登录 / Login

检查 `user_data/` 是否存在。若缺失或用户要求重新登录：

```bash
cd D:/WindowsFiles/Users/Stainless_Kettle/Desktop/1
npm run login
```

- **浏览器可见** — 用户需手动输入账号密码及 2FA
- 自动检测 URL 离开 `/sign-in` 视为登录成功
- **会话过期检测**：爬取前访问机库页面，若标题为 "Access denied" 或无物品数据，提示重新登录

## 爬取数据 / Scrape

登录后获取最新数据。如用户未要求调试则**使用无头模式**。

```bash
npm run scrape:headless         # 机库物品 + CCU 预计算
npm run scrape:ships:headless   # 船只目录
```

输出文件：
- `output/hangar_items.json` — 机库物品
- `output/ships.json` — 船只商店价格
- `output/ccu_analysis.json` — CCU 预计算

> 数据已存在时自动跳过。使用 `--force` 强制刷新。

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
`precompute` `findBestChain({seedShip, targetShip, projectRoot, excludeIds})` `formatChainTable` `formatResults` `setWeights` `matchShip`

## 注意事项 / Notes

- 使用系统 Chrome（`channel: "chrome"`）避免 Cloudflare 检测
- 登录时有头（用户需 2FA），爬取时可无头
- 会话持久数周，`output/` `user_data/` 已 git 忽略
- CCU 链条分析见 `refs/ccu-analysis.md`，清除数据见 `refs/clear-data.md`
