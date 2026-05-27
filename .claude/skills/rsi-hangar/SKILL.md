---
name: rsi-hangar
description: >
  Star Citizen RSI hangar manager. Use this skill whenever the user mentions
  Star Citizen, RSI, 星际公民, hangar, 机库, CCU, ship upgrades, Perseus,
  Polaris, Carrack, or any specific Star Citizen ship name, or wants to manage
  their RSI account, find upgrade paths, compute CCU chains, browse the pledge
  store, or scrape their hangar. Handles login, automated scraping, ship catalog,
  CCU chain optimization, and store browsing. Even casual mentions of Star Citizen
  ships or upgrades should trigger this skill.
---

# RSI Hangar Manager / 星际公民机库管家

**触发此 Skill 时必须首先读取 `refs/foundation.md`**（项目结构、命令、登录/爬取流程）。

## 附加功能触发 / Additional Features

根据用户关键词，读取对应子文件：

| 关键词 | 读取文件 | 内容 |
|--------|---------|------|
| CCU、升级链、省钱、链条、目标船、自定义CCU | `refs/ccu-analysis.md` | CCU 链条分析 + 自定义 CCU |
| 本地化、汉化、中文、翻译、i18n | 内置在 foundation.md 中 | 多语言支持（当前：中文） |
| 商店、在售、皮肤、paint、gear、pledge store、升级包 | `refs/store-browser.md` | 网页商店浏览 |
| 验证、检查数据、数据完整 | `refs/validate.md` | 数据质量检查 |
| 清除、删除数据、隐私、重置 | `refs/clear-data.md` | 清除缓存和个人信息 |

## 规则

1. **每次对话开始时**，检查以下三项核心数据是否存在：`user_data/`（登录会话）、`output/hangar_items.json`（机库数据）、`output/cache/ships.json`（船只目录）。**任意缺失则告知用户并立即执行对应获取命令，不得询问用户是否获取。** 详见 foundation.md 启动时自动检查。
2. CCU 分析必须用 `findBestChain()` 单次调用 + `formatResults(result, i18n)` 输出本地化表格。
3. CCU 输出前必须声明免责声明。
4. 严禁同价侧级过渡（$0 gap），算法已内置禁止。
5. 用户说"无视种子"时，使用虚拟种子（不在机库的船按商店价作为种子成本）。
