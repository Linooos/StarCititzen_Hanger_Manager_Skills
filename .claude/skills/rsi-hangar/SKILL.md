---
name: rsi-hangar
description: >
  Star Citizen RSI hangar manager — login, scrape pledged items & ship catalog,
  analyze CCU upgrade chains. Use when the user mentions Star Citizen, RSI,
  星际公民, hangar, 机库, CCU, ship upgrades, pledged items, or wants to
  scrape/analyze their RSI account data.
---

# RSI Hangar Manager / 星际公民机库管家

**触发此 Skill 时必须首先读取 `refs/foundation.md`**（项目结构、命令、登录/爬取流程）。

## 附加功能触发 / Additional Features

根据用户关键词，读取对应子文件：

| 关键词 | 读取文件 | 内容 |
|--------|---------|------|
| CCU、升级链、省钱、链条、目标船 | `refs/ccu-analysis.md` | CCU 链条分析交互流程 |
| 验证、检查数据、数据完整 | `refs/validate.md` | 数据质量检查 |
| 清除、删除数据、隐私、重置 | `refs/clear-data.md` | 清除缓存和个人信息 |

## 规则

1. **每次对话开始时**，检查 `output/` 下数据是否存在。若缺失，执行 foundation.md 中的登录+爬取流程。
2. CCU 输出前必须声明免责声明。
3. 严禁同价侧级过渡（$0 gap）。
