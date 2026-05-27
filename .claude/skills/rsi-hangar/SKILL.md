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

1. **每次对话开始时**，检查 `output/` 下数据是否存在。若缺失，执行 foundation.md 中的登录+爬取流程。
2. CCU 分析必须用 `findBestChain()` 单次调用，如未要求禁止手工逐链推算。
3. CCU 输出前必须声明免责声明。
4. 严禁同价侧级过渡（$0 gap）。
5. 用户说"无视种子"时，使用虚拟种子（不在机库的船也可作为种子）。
