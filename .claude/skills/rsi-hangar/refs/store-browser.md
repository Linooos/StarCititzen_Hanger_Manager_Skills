# 网页商店浏览 / Pledge Store Browser

> 非用户主动请求时不启动。由 LLM 根据用户意图判断应爬取哪个分类。

## 触发

用户询问商店商品时，如"Titan 的皮肤"、"有什么新手包"、"商店在售的 CCU"。

## 交互流程

### 1. 查找商品 / Search

先从缓存数据 `output/store_products.json` 中搜索。若缓存不存在或用户要求刷新，先运行：

```bash
npm run scrape:store -- --headless          # 全部分类
npm run scrape:store -- --headless "paint"   # 指定分类
```

用关键词在 `name` 和 `category` 字段中过滤。

### 2. 建立表格 / Build Table

找到多个商品时，建立表格询问用户打开哪个：

```
找到 N 个匹配商品：

| # | 类型 | 名称 | 价格 | 链接 |
|---|------|------|------|------|
| 1 | Paints | Avenger - 4 Paint Pack | $17.60 | [打开](url) |
| 2 | Paints | Avenger - Ironweave Paint | $3.30 | [打开](url) |
```

### 3. 用户选择 / User Choice

询问：
- 输入编号自动打开对应页面
- 输入"全部"打开所有
- 用户也可自行点击表格中的链接

### 4. 打开页面 / Open Page

用户要求自动打开时，使用 `launchPersistentContext` 打开页面后**不调用 `ctx.close()`**，让浏览器保持打开。

```js
const ctx = await chromium.launchPersistentContext(userDataDir, { channel: "chrome", headless: false });
const page = await ctx.newPage();
await page.goto(url);
// 不调用 ctx.close() —— 浏览器保持打开
```

### 5. 仅查找 / Search Only

用户仅要求查找时，打印表格后停止，不打开浏览器。

## 9 个分类

| 分类 | URL |
|------|-----|
| Starter Packs | `/store/pledge/browse/game-packages` |
| Subscriber Store | `/store/pledge/browse/extras/subscribers-store` |
| Ships and Vehicles | `/store/pledge/browse/extras/standalone-ships` |
| Paints | `/store/pledge/browse/paints` |
| Packs | `/store/pledge/browse/extras/packs` |
| Digital Gear | `/store/pledge/browse/extras/gear` |
| Physical Merchandise | `/store/pledge/browse/merchandise` |
| Add-Ons | `/store/pledge/browse/extras/add-ons` |
| Gift Cards | `/store/pledge/browse/extras/gift-cards` |

## 产品字段

`{name, price, url, category, tags[], stock}`
