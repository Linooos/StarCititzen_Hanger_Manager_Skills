---
name: rsi-hangar
description: >
  Star Citizen RSI hangar manager — login, scrape pledged items & ship catalog,
  analyze CCU upgrade chains. Use when the user mentions Star Citizen, RSI,
  星际公民, hangar, 机库, CCU, ship upgrades, pledged items, or wants to
  scrape/analyze their RSI account data.
---

# RSI Hangar Manager / 星际公民机库管家

## 基础功能 / Foundation

Skill 加载时或用户提及"机库管理"、"爬取数据"等需求时执行。
已获取数据时可跳过，直接使用附加功能。

### 1. 登录 / Login

检查 `user_data/` 是否存在。若缺失或用户要求重新登录：

```bash
cd D:/WindowsFiles/Users/Stainless_Kettle/Desktop/1
npm run login
```

- **浏览器可见** — 用户需手动输入账号密码及 2FA
- 自动检测 URL 离开 `/sign-in` 视为登录成功
- Session 保存至 `user_data/`，后续无需重复登录

### 2. 爬取数据 / Scrape

登录后获取最新数据，**使用无头模式**隐藏浏览器窗口：

```bash
npm run scrape:headless         # 机库物品 + CCU 预计算
npm run scrape:ships:headless   # 全部船只目录
```

输出：
- `output/hangar_items.json` — 机库物品（种子船、升级包、附属品）
- `output/ships.json` — 船只商店价格（含不在售）
- `output/ccu_analysis.json` — CCU 预计算（局部链排行）

---

## 附加功能 / Additional Features

### CCU 升级链分析 / CCU Chain Analysis

> 依赖基础功能的数据输出。`npm run scrape` 已自动完成 CCU 预计算。

当用户提及"CCU"、"升级链"、"省钱路径"、指定目标船时，按以下步骤交互：

#### Step 1 — 确认种子船 / Confirm Seed

加载 `output/hangar_items.json`，筛选 `Standalone Ships` + `Game Packages`。
列出所有可用种子船：

```
可用种子船：
  1. UTV — 实际船只: UTV | 熔解: $35 | 保险: LTI ⭐
  2. RAFT — 实际船只: RAFT | 熔解: $105 | 保险: LTI, 120mo ⭐
  ...
请选择起始种子船（编号/船名）：
```

- ⭐ 标记 LTI 永久保险种子，优先推荐
- Game Packages 同样可作为种子
- 模糊输入时尝试匹配

#### Step 2 — 确认目标船 / Confirm Target

在 `output/ships.json` 中查找。若存在多个变体，列出供选择并标注价格：

```
"Constellation" 系列：
  1. Constellation-Andromeda — $240
  2. Constellation-Phoenix — $350
  ...
请确认目标：
```

#### Step 3 — 排除 CCU（可选）/ Exclude

询问是否排除特定 CCU ID。

#### Step 4 — 免责声明 / Disclaimer

**输出前必须声明：**

> ⚠️ 此为模拟计算，不会实际部署升级包。你需要手动在机库中应用每个 CCU。

#### Step 5 — 输出表格 / Output

8 列表格，`Source` 列自有 CCU 填 `#ID`、断层填 `—`，`Note` 列 Warbond/无升级。
底部统计：种子熔解、自有 CCU 成本、断层成本、总实际成本、节省。

---

## 命令参考 / Commands

| 命令 | 用途 |
|------|------|
| `npm run login` | 交互式登录（可见浏览器） |
| `npm run scrape` | 爬取机库 + CCU 预计算 |
| `npm run scrape:headless` | 同上，无头模式（隐藏浏览器） |
| `npm run scrape:ships` | 爬取船只目录 |
| `npm run scrape:ships:headless` | 同上，无头模式 |
| `npm run ccu:precompute` | 仅 CCU 预计算 |

---

## 项目结构 / Project Layout

```
./
├── src/
│   ├── hangar.js       # 核心库：登录、爬取、导出
│   ├── login.js        # 交互式登录 CLI
│   ├── scrape.js       # 机库爬取 CLI
│   ├── scrape-ships.js # 船只目录爬取 CLI
│   ├── ships.js        # 船只目录模块
│   └── ccu.js          # CCU 升级链计算
├── output/             # 导出数据
├── user_data/          # Chrome 持久会话
├── docs/
│   └── ccu-rules.md    # CCU 规则参考
├── config.json
└── package.json
```

## API 速查 / API Quick Reference

### hangar.js
`launchContext` `login` `scrapeAll` `extractPageItems` `expandAllItems` `expandUpgradeLogs` `exportJSON` `exportCSV` `summarize` `numericValue`

### ships.js
`scrapeAllShips` `extractShipCards` `exportJSON` `exportCSV`

### ccu.js
`precompute` `findBestChain` `formatChainTable` `formatResults` `setWeights` `matchShip`

### findBestChain 参数
```js
findBestChain({
  seedShip,      // 种子船名或 hangar ID（必填）
  targetShip,    // 目标船名（必填）
  projectRoot,   // 项目根目录，默认 "."
  excludeIds,    // 排除的 CCU ID 数组，可选
})
```

## 注意事项 / Notes

- 使用系统 Chrome（`channel: "chrome"`）避免 Cloudflare 检测
- 爬取船只时使用无头模式防止浏览器窗口干扰
- 登录时使用有头模式，确保用户能完成 2FA
- 会话持久数周，无需频繁登录
- `output/` 和 `user_data/` 已 git 忽略，不提交个人信息
