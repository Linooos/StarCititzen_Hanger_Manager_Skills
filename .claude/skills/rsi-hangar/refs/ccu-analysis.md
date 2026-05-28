# CCU 升级链分析 / CCU Chain Analysis

> 自包含：`findBestChain()` 内置 Dijkstra，无需预计算。~25ms。

## 交互流程

**数据时效**：进入 CCU 分析时，检查 `output/cache/ships.json` 的上次更新时间（通过 `cache-meta.js` 的 `.cache_meta.json`）。若超过 30 天未更新，提示用户："船只目录数据已超过一个月未更新，价格可能有变动。是否刷新？"（`npm run scrape:ships:headless`）。用户拒绝则继续使用现有数据。

**依次询问**：每个流程中若有向用户提问的问题，应当一个一个的向用户询问，不要一举列出让用户一起回答。

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

若用户选择**否** → 跳过，仅用自有 CCU（默认模式）。

若用户选择**是**，先询问时间范围：

"以今日为基准，使用前推几年几月几日时间范围内的历史CCU？（例如：1年、6个月）"

解析为日期字符串（如 `"2025-05-28"`）。

> **注意**：此日期是 **CCU 事件的时间窗口起点**，而非缓存文件的过期时间。含义：从该日期到今天，在此期间 scorg.tools 记录过的 WB CCU 事件均可参与计算。例如用户说"3 年"→ 2023 年至今，则 2024-07-12 的 WB 事件在窗口内、会被纳入；2022 年的事件不在窗口内、被排除。该日期最终传给 `findBestChain({ useHistorical: "2023-05-28" })`。

然后检查 `output/cache/historical_ccus.json` 是否存在：

---

**情况 A：缓存不存在** → 仅可使用**部分模式**。告知用户：

> "本地暂无历史 CCU 全量缓存。当前使用**部分模式**：先用机库内 CCU 计算链条，再针对链条中的断层船只，即时在线搜索其历史 CCU 信息来优化。全量缓存需约 4 分钟抓取，若需全量模式可稍后获取。"

然后按 Step 5（断层分析）流程执行。

---

**情况 B：缓存存在** → 让用户选择模式：

> "历史 CCU 缓存已存在。请选择模式：
> 1. **全量模式** — 从缓存中提取指定时间范围内所有历史 WB CCU，与机库 CCU 共同参与 Dijkstra 计算，生成历史 CCU 接入更多的全局最优链条。计算快（~30ms），覆盖面广。
> 2. **部分模式** — 先用机库内 CCU 计算链条，再针对断层船只从缓存或在线搜索历史 CCU 优化。适合只想补漏的场景。"

根据用户选择：
- **全量模式** → 检查缓存文件本身的新鲜度（`cache-meta.js`，超过 7 天提示刷新。**注意：此处 7 天是缓存文件的磁盘年龄，与上面 CCU 事件的时间窗口是两回事**），加载后传入 `useHistorical: "2025-05-28"`：

```js
const { findBestChain, formatResults } = require("./src/ccu");
const i18n = require("./output/cache/i18n.json");
console.log(formatResults(findBestChain({
  seedShip: "极光 mk2",
  targetShip: "铁突",
  projectRoot: ".",
  useHistorical: "2025-05-28",
  excludeIds: ["93520320"],
}), i18n));
```

- **部分模式** → 进入 Step 5（断层分析）。

---

**获取/更新全量缓存**：用户可随时要求 `npm run scrape:historical:headless`（约 4 分钟，237 艘船），之后即可使用全量模式。

> **严禁自动获取全量缓存**：即使 `output/cache/historical_ccus.json` 不存在，也不得自行执行 `npm run scrape:historical` 或后台抓取全量数据。只有用户明确说"获取全量缓存""刷新历史CCU""使用全量模式"等指令时才可执行。缓存不存在时默认使用部分模式，告知用户现状即可。

---

### Step 5 — 断层分析 / 递归缝隙分解

先只用机库 CCU 计算链条（不加 `useHistorical`）。若链条有断层：

**递归分解策略**：大缝隙跨度过大浪费真实价值。应将大缝隙拆分为多个小跳，每跳尽量利用 WB 折扣，使 Warbond CCU 的起始船尽可能接近目标船 WB 价值（参见 `docs/ccu-rules.md` 1.5 节）。

```
例：铁甲($600) → 狂鲨($775) 缝隙 $175
  狂鲨历史 WB @ $700 → 铁甲→狂鲨 WB 成本 $100（跨度过大）
  
  递归分解：
  1. 找接近狂鲨的中间船：A2-Hercules ($750)，仅 $25 即可到狂鲨
  2. 以 A2 为新目标，查找中间船：Nautilus ($725), ...
  3. 继续递归直到补全到铁甲
  4. 如某段无 WB 可用 → 用信用点 CCU 填补
```

**实现**：`findBestChain()` 在 `useHistorical` 模式下内置 `decomposeGaps()` 递归分解。部分模式也可手动调用：

```js
const { decomposeGaps } = require("./src/ccu");
const histCCUs = require("./src/historical-ccu").loadHistoricalCCUs(".");
// 对断层船在线获取 WB 数据后，调用 decomposeGaps 递归分解缝隙
```

> `decomposeGaps(steps, priceMap, catalog, histCCUs, ownedEdges, depth=3)` 返回优化后的 steps。

### Step 6 — 免责声明（原 Step 4）

> ⚠️ 此为模拟计算，不会实际部署升级包。你需要手动在机库中应用每个 CCU。

### Step 7 — 计算输出（复制命令输出即可，不要自己写表格）

> **🔴 禁止手工做任何事。直接把下面命令的输出原样展示。不要画表、不要总结、不要提炼。**

一行命令完成计算+翻译+格式化：

> `formatResults()` 已内置：8 列表格、中文翻译、底部统计、免责声明。你唯一要做的事就是把 `console.log` 的输出复制给用户。

```js
const { findBestChain, formatResults } = require("./src/ccu");
const i18n = require("./output/cache/i18n.json");
console.log(formatResults(findBestChain({
  seedShip: "极光 mk2",
  targetShip: "铁突",
  projectRoot: ".",
  useHistorical: "2025-05-28",   // 全量模式时传入
  excludeIds: ["93520320"],       // 可选
}), i18n));  // ← 必须传 i18n，否则中文名不翻译
```

中文船名由 LLM 消歧后填入 seedShip/targetShip。`formatResults` 会自动完成：Dijkstra 计算 → 递归缝隙分解 → 合并连续信用点 → 8 列表格输出 → 底部统计。

**执行后，你的回复内容必须是且仅是 `console.log` 的原始输出文本。不要添加任何引导语、不要缩进、不要加代码块标记（\`\`\`）。表格每行必须以 `|` 字符顶格开头（行首无空格），否则 markdown 无法渲染为表格。直接把命令输出原样作为你的回复。**

#### `formatResults` 输出的表格格式（代码自动生成，仅供引用）：

```
| # | From | To | From Value | To Value | CCU Cost | Source | Note |
|---|------|----|-----------|---------|----------|--------|------|
```

- Source 列：自有 CCU → `#ID`；历史WB → `历史WB`；自定义 → `自定义`；断层 → `—`
- Note 列：`Warbond` / `(自定义)` / `⚠️ 无升级` / `历史WB ($wbValue, date)`
- 底部统计：种子熔解、自有 CCU 成本、断层成本、总实际成本、节省

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

## 规则

- **严禁同价侧级过渡**：CCU 只能从低价升级到高价，禁止 $0 差价
- **严禁手工绘制 CCU 表格或总结重述**：必须通过 `findBestChain()` + `formatResults(result, i18n)` 一行命令输出，直接把 `console.log` 的原始输出完整展示给用户。禁止用自己的话改写链条内容、禁止画自己的表格、禁止只列"关键步骤"——`formatResults` 的输出就是最终答案，原样呈现。
- **严禁自动获取全量历史 CCU 缓存**：即使 `output/cache/historical_ccus.json` 不存在，也不得自行执行 `npm run scrape:historical` 或在后台抓取全量数据。只有用户明确要求"获取全量缓存""刷新历史CCU""使用全量模式"时才可执行。缓存缺失时默认使用部分模式，告知用户即可。
- **信用点仅在标注中使用**：信用点折扣（如 0.65 折）仅用于在对应 CCU 的备注列标注，不参与实际价值计算。
- 无合法路径时显示 "No valid path"
- CCU 规则详见 `docs/ccu-rules.md`
- **严格遵守**：以上内容输出交互和结果！
