# CCU 升级链分析 / CCU Chain Analysis

> 自包含：`findBestChain()` 内置 Dijkstra，无需预计算。~25ms。

## 交互流程

### Step 1 — 确认种子船

加载 `output/hangar_items.json`，筛选 `Standalone Ships` + `Game Packages`，列出选项。

```
可用种子船：
  1. UTV — 实际船只: UTV | 熔解: $35 | 保险: LTI ⭐
  2. RAFT — 实际船只: RAFT | 熔解: $105 | 保险: LTI, 120mo ⭐
  ...
请选择起始种子船（编号/船名）：
```

- ⭐ 标记 LTI 永久保险种子，优先推荐
- Game Packages 同样可作为种子
- 模糊输入时尝试匹配（含中文名 i18n）

### Step 2 — 确认目标船

查 `output/cache/ships.json`，变体列出供选择，标注价格。

```
"Constellation" 系列：
  1. Constellation-Andromeda — $240
  2. Constellation-Phoenix — $350
  ...
请确认目标：
```

### Step 3 — 排除 CCU（可选）

询问是否排除特定 CCU ID。

### Step 4 — 历史 CCU 数据（可选）

询问用户：

"是否使用外部网站 (scorg.tools) 获取的历史 CCU 信息来寻找更优升级路径？"

若用户选择**否** → 跳过，仅用自有 CCU。

若用户选择**是**：

"以今日为基准，前推几年几月几日？（例如：1年、6个月）"

解析用户输入为日期字符串（如 `"2025-05-28"`）。

检查 `output/cache/historical_ccus.json`：
- **存在且覆盖范围** → 直接加载，传入 `useHistorical: "2025-05-28"`
- **部分覆盖** → 告知现有范围（`getCacheMetadata()`），询问继续使用或重抓
- **不存在** → 告知用户需在线获取（约 8-12 分钟），同时：
  1. 子 agent 后台执行 `npm run scrape:historical:headless` 建立全量缓存
  2. 主 agent 按无历史数据先计算链条，然后进入断层分析（Step 5）

使用历史数据时的调用（一行命令）：

```js
const { findBestChain, formatResults } = require("./src/ccu");
const i18n = require("./output/cache/i18n.json");
console.log(formatResults(findBestChain({
  seedShip: "极光 mk2",
  targetShip: "铁突",
  projectRoot: ".",
  useHistorical: "2025-05-28",   // 历史 CCU 数据起算日期
  excludeIds: ["93520320"],
}), i18n));
```

### Step 5 — 断层分析（可选）

若 `findBestChain()` 返回的链条包含断层（`hasGaps: true` 或表格有 "⚠️ 无升级" 行）：

询问用户：

"链条中存在断层船只。是否针对断层船只搜索历史 CCU 数据来尝试优化？"

若用户选择**是**：

对每个断层船只（chain steps 中 `owned === false` 的 step.to）：
1. 检查 `output/cache/historical_ccus.json` 缓存中是否有该船历史 WB 数据
2. 若有 → 直接提取 `bestWbPrice`，加入临时 historical edge
3. 若缓存缺失该船 → 主 agent 直接 Playwright 访问 scorg.tools 获取：

```js
const { chromium } = require("playwright");
const { fetchShipHistory, loadHistoricalCCUs } = require("./src/historical-ccu");
const ctx = await chromium.launchPersistentContext("user_data", { channel: "chrome", headless: true });
const data = await fetchShipHistory(ctx, "断层船名", catalog, i18n);
await ctx.close();
// 将 data 的 WB 价格转为临时 historical edge 加入计算
```

4. 将断层船的历史 WB 价格作为临时 historical edge 重新运行 `findBestChain()`
5. 报告优化结果

此步骤使用主 agent（非子 agent），因仅抓取 1-3 艘船，每艘约 10-15 秒。

### Step 6 — 免责声明（原 Step 4）

> ⚠️ 此为模拟计算，不会实际部署升级包。你需要手动在机库中应用每个 CCU。

### Step 7 — 计算输出（一行命令，禁止手工推算）

```js
const { findBestChain, formatResults } = require("./src/ccu");
const i18n = require("./output/cache/i18n.json");
console.log(formatResults(findBestChain({
  seedShip: "极光 mk2",
  targetShip: "铁突",
  projectRoot: ".",
  excludeIds: ["93520320"],   // 可选
}), i18n));  // ← 必须传 i18n
```

中文名由 LLM 消歧后填入。一行命令完成全部计算。

## 自定义 CCU

当用户想使用机库中不存在的 CCU 时：

1. 询问：起始船、目标船、实际价值（或节省多少）、是否 Warbond
2. 写入 `output/custom_ccus.json`：`saveCustomCCUs(".", [{ fromShip: "Paladin", toShip: "Carrack", actualCost: 10, isWarbond: true }])`
3. 重新运行 `findBestChain()`（内置加载自定义 CCU，无需预计算）
4. 表格标注：Source 列 `自定义`，Note 列 `Warbond (自定义)` / `(自定义)`

## 翻译缓存

匹配到新中文名后写入缓存供后续使用：
```js
addTranslation(".", "铁突", "Ironclad-Assault");
```

## 输出格式

8 列表格：

```
| # | From | To | From Value | To Value | CCU Cost | Source | Note |
|---|------|----|-----------|---------|----------|--------|------|
```

- Source 列：自有 CCU 填 `#ID` / `自定义`，断层填 `—`
- Note 列：`Warbond` / `(自定义)` / `⚠️ 无升级`
- 底部统计：种子熔解、自有 CCU 成本、断层成本、总实际成本、节省

## 规则

- **严禁同价侧级过渡**：CCU 只能从低价升级到高价，禁止 $0 差价
- 无合法路径时显示 "No valid path"
- CCU 规则详见 `docs/ccu-rules.md`
