# RSI Hangar Manager / 星际公民机库管家

[English README](../README.md) | **中文文档**

星际公民 RSI 机库管理工具，支持 CCU（Cross-Chassis Upgrade）链条优化。
使用 Dijkstra 算法在完整价格图上结合 [scorg.tools](https://scorg.tools/ccu) 的历史 Warbond 数据，找出最优省钱路径。

## 功能

- **交互式登录** — Playwright + 系统 Chrome，会话持久化
- **机库爬取** — 并发提取所有机库物品及升级链历史
- **船只目录** — RSI 商店 + 船只矩阵的 250 艘船及价格
- **CCU 链条优化** — 37K+ 条边的 Dijkstra 图，全局最优
- **历史 CCU 数据** — 来自 scorg.tools 的 WB 和涨价边（237 艘船）
- **中文汉化** — 335 艘船 + 960 涂装的中英文模糊匹配
- **四种计算模式** — 仅机库 / 全量 / 部分 / **完全模式（无需登录）**
- **时间一致性校验** — 可选的多跳链条同日价格验证

## 快速开始

```bash
# 安装依赖
npm install

# 登录（交互浏览器）
npm run login

# 爬取数据
npm run scrape:headless              # 机库物品
npm run scrape:ships:headless        # 船只目录
npm run scrape:historical:headless   # 历史 CCU（可选，约4分钟）

# 计算 CCU 链条
node -e "const { findBestChain, formatResults } = require('./src/ccu'); const i18n = require('./output/cache/i18n.json'); console.log(formatResults(findBestChain({ seedShip: 'Aurora Mk II', targetShip: 'Polaris', projectRoot: '.', useHistorical: true }), i18n));"
```

## 项目结构

```
├── src/
│   ├── ccu.js              # Dijkstra CCU 计算器（算法核心）
│   ├── hangar.js           # 浏览器生命周期、登录、爬取
│   ├── historical-ccu.js   # scorg.tools 历史 CCU 抓取
│   ├── i18n.js             # 汉化模块
│   ├── cache-meta.js       # 缓存元数据管理（过期检测）
│   ├── login.js            # 交互登录 CLI
│   ├── scrape.js            # 机库爬取 CLI
│   ├── scrape-ships.js      # 船只目录爬取 CLI
│   ├── scrape-historical.js # 历史 CCU 爬取 CLI
│   ├── ships.js             # 船只目录模块
│   └── validate.js          # 数据验证
├── docs/
│   ├── README-cn.md         # 本文档
│   └── ccu-rules.md         # CCU 规则参考
├── output/
│   ├── cache/               # 长期缓存（ships, i18n, historical）
│   └── hangar_items.json    # 机库数据
├── user_data/               # Chrome 持久会话
└── .claude/skills/          # Claude Code Skill 定义
```

## CCU 计算模式

| 模式 | 机库 CCU | 历史 WB | 需要登录 |
|------|---------|---------|---------|
| 仅机库（默认） | ✓ | ✗ | 是 |
| 全量模式 | ✓ | ✓ | 是 |
| 部分模式 | ✓ | ✓（仅断层船） | 是 |
| **完全模式** | ✗ | ✓ | **否** |

### 模式说明

**仅机库模式**：只用你机库中已有的 CCU 计算，不查询任何外部数据。

**全量模式**：从历史 CCU 缓存提取全量数据，与机库 CCU 共同参与 Dijkstra 计算，覆盖面最广。

**部分模式**：先用机库 CCU 算出链条，再针对断层船只从缓存或在线搜索历史 CCU 优化。适合快速补漏。

**完全模式**：完全不用机库数据，仅用历史 WB CCU 计算。**不需要登录 RSI**。适合新建账号或探索理论最优路径。

### 时间一致性校验（TC）

开启后对链中每条历史边用同日价格重建全图重算，进一步优化路径。计算时间约增加 2-5 秒。

## 算法原理

核心基于 **Dijkstra 最短路径算法**：

1. **图构建**：以机库种子船为起点，所有更贵的船为节点，构建完整价格图
2. **边类型**：
   - 自有 CCU 边（机库升级包的实际成本）
   - Warbond 边（历史打折 CCU，用时间校验的真实成本）
   - 涨价边（历史涨价带来的隐性省钱，取时间范围内的最小价格）
   - 信用点边（商店原价购买）
3. **路径优化**：Dijkstra + 递归缝隙分解（将大跳拆为多个小跳）+ 连续信用点合并
4. **输出**：8 列 markdown 表格 + 中文船名 + 底部统计

## 输出表格

```
| # | From | To | From Value | To Value | CCU Cost | Source | Note |
|---|------|----|-----------|---------|----------|--------|------|
```

- Source：`#ID`（自有 CCU）/ `历史WB` / `涨价CCU` / `自定义` / `—`（断层）
- Note：`Warbond` / `⚠️ 无升级` / `历史WB ($price, date)`
- 底部：种子熔解价值、自有 CCU 成本、断层需购买成本、总实际成本、节省金额

## 汉化支持

项目内置完整中文汉化模块：

- 335 艘船只 + 960 涂装的中文翻译（来自全球翻译文件 `global.ini`）
- 中英文模糊匹配（LLM 消歧 + 自动缓存）
- 表格自动输出中文船名
- 匹配失败时自动下载翻译缓存

## 数据来源

- **船只目录**：[RSI Pledge Store](https://robertsspaceindustries.com/pledge) + [Ship Matrix](https://robertsspaceindustries.com/ship-specs)
- **历史 CCU**：[scorg.tools/ccu](https://scorg.tools/ccu) — 931 个日期快照（2021-2026）
- **汉化翻译**：[ini.42kit.com](https://ini.42kit.com/full/global.ini)

## 开发计划 / TODO

| 状态 | 功能 | 备注 |
|------|------|------|
| ✅ | 机库信息抓取 | 并发提取所有机库物品及升级链 |
| ✅ | 船只价格目录 | 250 艘船，商店 + 矩阵双源 |
| ✅ | CCU 链路分析 | Dijkstra + 4 种模式 + 递归缝隙分解 |
| ✅ | 历史 CCU 数据 | scorg.tools 集成（WB + 涨价边） |
| ✅ | 中文汉化 | 335 艘船 + 960 涂装，模糊匹配自动缓存 |
| ⏳ | 商店功能 | 产品分类获取完成，待完成商店购买、项目查询 |
| ❌ | 船只详情查询 | 规格、数据、对比 |
| ❌ | 光谱论坛 | 帖子浏览、主题追踪 |
| ❌ | 游戏活动查询 | 日程、活动追踪 |
| ❌ | 游戏日程推测 | 发布窗口预测、路线图分析 |

## 许可

GNU General Public License v3.0 — 详见 [LICENSE](../LICENSE)。

本项目与 Cloud Imperium Games 或 Roberts Space Industries 无关。
