# 清除数据 / Clear Data

当用户要求清除隐私数据或重置项目时执行。

```bash
cd D:/WindowsFiles/Users/Stainless_Kettle/Desktop/1
rm -rf user_data output/* cookies.json local_storage.json && mkdir -p output
```

## 清除内容

- `user_data/` — Chrome 登录会话（含 RSI cookies）
- `output/*` — 机库数据、船只目录、CCU 分析
- `cookies.json` / `local_storage.json` — 登录凭据快照

## 保留内容

源代码、配置文件、node_modules、docs

## 注意

清除后需重新登录和爬取才能使用 CCU 分析。
