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

**触发时首先读取 `refs/foundation.md`**（项目结构、命令、数据检查、登录/爬取）。

## 功能索引

| 关键词 | 读取 |
|--------|------|
| CCU、升级链、省钱、链条、目标船、自定义CCU、完全模式、全量模式、部分模式 | `refs/ccu-analysis.md` |
| 本地化、汉化、中文、翻译、i18n | `refs/foundation.md` § 本地化 |
| 商店、在售、皮肤、paint、gear、pledge store | `refs/store-browser.md` |
| 验证、检查数据、数据完整 | `refs/validate.md` |
| 清除、删除数据、隐私、重置 | `refs/clear-data.md` |

> 详细规则分布在对应功能文件中（数据检查 → foundation.md，CCU 规则 → ccu-analysis.md § 规则）。用户选择统一用 `AskUserQuestion` 工具提供选项（方向键选择），不让用户输入文本。
