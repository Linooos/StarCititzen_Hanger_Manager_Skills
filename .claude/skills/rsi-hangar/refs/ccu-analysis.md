# CCU Chain Analysis / CCU 升级链分析

`findBestChain()` 内置 Dijkstra → 递归分解 → 合并信用点。一条命令完成。

## 输出铁律

`formatResults()` 已包含 8 列 markdown 表格、i18n 中文翻译、底部统计、免责声明。你的唯一任务是：**把 `console.log` 的原始输出原文粘贴给用户**。

为什么必须这样做：手工画表必然缺少 From/To Value 列、错译船名、漏掉底部统计、表头缩进导致 markdown 无法渲染。`formatResults` 输出的每一行 `|` 都是顶格的（行首无空格），直接粘贴即可正确显示。

禁止行为：自己画表、总结"关键步骤"、添加"以下是结果"等引导语、用代码块包裹输出。

## 交互流程

每个选择用 `AskUserQuestion` 工具呈现（方向键选择），不让用户打字输入选项编号。

### Step 1 — 种子船

从 `output/hangar_items.json` 筛选 `Standalone Ships` + `Game Packages`，列出选项。⭐ 标记 LTI 种子。模糊输入用 i18n 中文名匹配。完全模式下所有船均为虚拟种子。

### Step 2 — 目标船

从 `output/cache/ships.json` 查船名，列出变体及价格。

### Step 3 — 排除 CCU（可选）

询问是否排除特定 CCU ID，写入 `output/excluded_ccus.json`。

### Step 4 — 计算模式 + 历史 CCU

检查 `output/cache/historical_ccus.json` 是否存在，然后让用户选择模式：

> "请选择 CCU 计算模式："
> 1. **仅机库** — 只用机库内已有 CCU。不需要历史缓存。
> 2. **全量模式** — 历史 WB + 机库 CCU 共同参与 Dijkstra。覆盖面最广。
> 3. **部分模式** — 先用机库 CCU 计算，再针对断层在线搜索历史 CCU。
> 4. **完全模式** — 仅用历史 WB CCU，完全不使用机库 CCU。不需登录 RSI。需全量历史缓存。

- 选 1 → 直接进入 Step 7 计算输出
- 选 4 → 确保 `ships.json` + `historical_ccus.json` 存在（缺失则立即获取），然后询问时间范围
- 选 2/3 → 询问时间范围

时间范围：`"以今日为基准，前推几年几月几日？（例如：1年、6个月）"` → 解析为日期字符串（如 `"2025-05-28"`）。该日期是 CCU 事件窗口起点。用户说"全部历史"时传 `true`。

TC 询问：`"是否开启时间一致性校验？开启后对链中每条历史边用同日价格重建全图重算，约增加 2-5 秒。"` → 选是则传 `temporalConsistency: true`。

缓存不存在时 → 仅可使用部分模式（告知用户，不询问）。缓存存在但超过 7 天 → 提示刷新（`cache-meta.js` 检查），用户拒绝则继续。

### Step 7 — 计算输出

```js
const { findBestChain, formatResults } = require("./src/ccu");
const i18n = require("./output/cache/i18n.json");
console.log(formatResults(findBestChain({
  seedShip: "极光 mk2",
  targetShip: "铁突",
  projectRoot: ".",
  useHistorical: "2025-05-28",      // 全量/部分模式时传入
  completeMode: true,               // 完全模式
  temporalConsistency: true,        // TC 校验
  excludeIds: ["93520320"],
}), i18n));
```

中文船名由 LLM 消歧后填入。`formatResults` 自动输出：

```
| # | From | To | From Value | To Value | CCU Cost | Source | Note |
|---|------|----|-----------|---------|----------|--------|------|
```
- Source: `#ID` / `历史WB` / `涨价CCU` / `自定义` / `—`
- Note: `Warbond` / `⚠️ 无升级` / `历史WB ($X, date)` / `涨价CCU (历史最低$X)`
- 底部: 种子熔解、自有成本、断层成本、总成本、节省、免责声明

## 规则

- 严禁同价侧级过渡（$0 gap），算法已内置
- 禁止手工画表、总结、缩进——直接把 `console.log` 原文贴给用户
- 虚拟种子：用户说"无视种子"时按商店价作为 seed meltValue
- 无合法路径时显示 "No valid path"
