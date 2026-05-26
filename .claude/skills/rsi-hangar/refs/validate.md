# 数据验证 / Validate Data

检查 `output/` 下数据完整性，发现问题给出修复建议。

```bash
npm run validate
```

## 验证项目

- `hangar_items.json`：总数 ≥50、种子船 ≥3、升级包 ≥30
- `ships.json`：总数 ≥200、有价 ≥200、Aurora 变体 ≥3、Aurora-Mk-II 有价
- `ccu_analysis.json`：升级包数、链数、孤立数

## 输出示例

```
  Hangar: 88 items, 9 seeds, 77 upgrades
  Ships: 250 total, 248 priced
  CCU: 77 upgrades, 32 chains, 0 isolated
✓ All data validated — ready for CCU analysis
```

有问题时：
```
❌ ISSUES (fix before CCU analysis):
  - Priced ships low: 74 (expected >200)
  Re-run with: npm run scrape:ships -- --force
```

## 代码调用

```js
const { validate } = require("./src/validate");
const result = validate();
if (!result.ok) console.log("Fix: npm run scrape -- --force");
```
