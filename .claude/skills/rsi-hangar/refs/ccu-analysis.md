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

查 `output/ships.json`，变体列出供选择，标注价格。

```
"Constellation" 系列：
  1. Constellation-Andromeda — $240
  2. Constellation-Phoenix — $350
  ...
请确认目标：
```

### Step 3 — 排除 CCU（可选）

询问是否排除特定 CCU ID。

### Step 4 — 免责声明

> ⚠️ 此为模拟计算，不会实际部署升级包。你需要手动在机库中应用每个 CCU。

### Step 5 — 计算输出（一行命令，禁止手工推算）

```js
const { findBestChain, formatResults } = require("./src/ccu");
const i18n = require("./output/i18n.json");
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
