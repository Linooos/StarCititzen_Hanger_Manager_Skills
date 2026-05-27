# CCU 升级链分析 / CCU Chain Analysis

> 依赖 `output/hangar_items.json` + `output/ships.json` + `output/ccu_analysis.json`

当用户提及"CCU"、"升级链"、"省钱路径"或指定目标船时执行。

## 交互流程

### Step 1 — 确认种子船

加载 `output/hangar_items.json`，筛选 `Standalone Ships` + `Game Packages`。
列出所有可用种子船，标注 LTI ⭐：

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

### Step 2 — 确认目标船

在 `output/ships.json` 中查找。若存在多个变体，列出供选择并标注价格：

```
"Constellation" 系列：
  1. Constellation-Andromeda — $240
  2. Constellation-Phoenix — $350
  ...
请确认目标：
```

### Step 3 — 排除 CCU（可选）

询问是否排除特定 CCU ID（逗号分隔）。

### Step 4 — 免责声明

**输出前必须声明：**

> ⚠️ 此为模拟计算，不会实际部署升级包。你需要手动在机库中应用每个 CCU。

### Step 5 — 计算并输出

```js
const { findBestChain, formatResults } = require("./src/ccu");
const r = findBestChain({
  seedShip: "Aurora Mk II",   // 种子船名或 hangar ID
  targetShip: "Carrack",      // 目标船名
  projectRoot: ".",
  excludeIds: ["93520320"],   // 可选
});
console.log(formatResults(r));
```

## 输出格式

8 列表格：

```
| # | From | To | From Value | To Value | CCU Cost | Source | Note |
|---|------|----|-----------|---------|----------|--------|------|
```

- Source：自有 CCU 填 `#ID`，断层填 `—`
- Note：Warbond 填 `Warbond`，断层填 `⚠️ 无升级`
- 底部统计：种子熔解、自有 CCU 成本、断层成本、总实际成本、节省

### 自定义 CCU / Custom CCU

当用户想使用机库中不存在的 CCU 时：

1. 询问：起始船、目标船、实际价值（或节省多少）、是否 Warbond
2. 写入 `output/custom_ccus.json`
3. 重新运行 `precompute('.')`
4. 重新生成链条

```js
const { saveCustomCCUs, precompute, findBestChain } = require("./src/ccu");
saveCustomCCUs(".", [{ fromShip: "Paladin", toShip: "Carrack", actualCost: 10, isWarbond: true }]);
precompute(".");
findBestChain({ seedShip: "UTV", targetShip: "Carrack", projectRoot: "." });
```

自定义 CCU 在表格中标注 `(自定义)` 尾缀：
- 普通：`(自定义)`
- Warbond：`Warbond (自定义)`

查看/清除：
```bash
cat output/custom_ccus.json   # 查看
echo '[]' > output/custom_ccus.json  # 清除
```

## 规则

- **严禁同价侧级过渡**：CCU 只能从低价升级到高价，禁止 $0 差价
- 无合法路径时显示 "No valid path"
- CCU 规则详见 `docs/ccu-rules.md`
