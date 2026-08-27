---
title: listhen — 给 Node listener 选端口、开 HTTPS 和印 URL 的听端口层
description: listen 吃 RequestListener，CLI 再动态加载 h3 把入口包成 listener
来源: https://github.com/unjs/listhen
日期: 2026-08-27
分类: Web 框架
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/unjs/listhen
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 2466b698997f6d5006c22f36ab54379df277cf5f
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 1.10.1
---

## 是什么

listhen 是一个给 Node HTTP/HTTPS 服务器选地址、开端口、印可达 URL 的听端口层。日常类比：[[h3]] 做车间里的工件卡，listhen 做大门——谁来值班、门牌号多少、要不要 HTTPS 和隧道，都在这一层。

你写：

```ts
import { createApp, eventHandler, toNodeListener } from "h3"
import { listen } from "listhen"

const app = createApp()
app.use("/", eventHandler(() => ({ ok: true })))
const listener = await listen(toNodeListener(app))
await listener.close()
```

固定 1.10.1 的 `listen()` 第一参数是 `http.RequestListener`。它不认识 h3 `App`。CLI `listhen ./app.ts` 才会在内部 `import("h3")`，把你的导出剥成 handler。

## 为什么重要

不看 listen 和 CLI 这两条入口，容易把 listhen 写成“h3 自带的 dev server”：

- 为什么编程接口和 `app.listen(3000)` 不是一回事
- 为什么开发时 3000 被占用会换端口，生产却不随机跳
- 为什么 `https: true` 没给证书也能起来，但证书默认只活一天
- 为什么 watch 模式只重载 `.ts/.js` 一类扩展名

## 核心要点

听端口链可以拆成五步：

1. **收选项**：`defu` 叠默认值。端口 `PORT || 3000`，hostname 来自 `HOST` 或 `getDefaultHost`。Docker/WSL 默认空串（全接口）；本地开发默认 `localhost`。

2. **算 public**：显式 `public` 优先，否则 localhost → false，`0.0.0.0`/`::` → true，命令行 `--host` → true，再否则跟 `isProd`。public 却绑私有 host 会警告并改回 false。

3. **要端口再 listen**：`get-port-please`。非生产给 `[3000, 3100]` 备选；生产 `random: false`。HTTP 用 `http.createServer`，HTTPS 用 `resolveCertificate` 后的 `https.createServer`，再套 `http-shutdown`。

4. **附加能力**：`ws` 可以是 upgrade 函数，或 experimental 的 crossws Node adapter；`tunnel` 走 `untun`；`autoClose` 默认挂 `exit`/`SIGINT`/`SIGTERM`/`SIGHUP`。

5. **CLI / watch 另包一层 h3**：`createDevServer` 用 jiti 解析入口，导出顺序 `handler || handle || app || default || module`，有 `.handler` 再剥一层，然后 `fromNodeMiddleware`。watcher 先 `@parcel/watcher`，失败再用 wasm。

## 实践示例

### 案例 1：稳定配对是 listener，不是 App

```ts
import { createApp, eventHandler, toNodeListener } from "h3"
import { listen } from "listhen"

const app = createApp()
app.use("/ping", eventHandler(() => "pong"))
const { url, close } = await listen(toNodeListener(app), { name: "api" })
```

这是和 [[h3]] 页同一条接缝。想听 Express 风格函数也可以：`listen((req, res) => res.end("ok"))`。listhen 不在这一层解析路由。

### 案例 2：开发换端口，生产不乱跳

```ts
await listen(handler, { port: 3000, isProd: false })
await listen(handler, { port: 3000, isProd: true })
```

非生产把 `alternativePortRange: [3000, 3100]` 交给 `get-port-please`。生产关掉 `random`。`NODE_ENV=production` 也会把 `open` / `clipboard` 关掉，避免发布环境弹浏览器。

### 案例 3：CLI 怎么把入口变成 listener

```bash
listhen ./server.ts
listhen -w ./server.ts --ws
```

无 `--watch` 时：`createDevServer` → `listen(devServer.nodeListener)` → `reload(true)`。有 `-w` 时走 `listenAndWatch`。入口文件导出 `default` / `app` / `handler` 均可；导出的若是 h3 `App`，源码会取 `app.handler` 再 `fromNodeMiddleware`。静态目录默认 `public/`，`fallthrough: true`。

## 踩过的坑

1. **把 `App` 直接传给 `listen`**：类型是 `RequestListener`。先 `toNodeListener`。

2. **以为 `https: true` 是长期证书**：没给 key/cert/pfx 时自签，默认 `validityDays=1`，domains 只有 localhost / 127.0.0.1 / `::1`。

3. **在 Docker 里还按 localhost 理解默认 host**：`getDefaultHost` 对 Docker/WSL 返回空串，听全部接口。

4. **watch 不重载 `.vue` / `.json`**：过滤集合是 `.js/.mjs/.cjs/.ts/.mts/.cts`。忽略目录默认 `.git` / `node_modules` / `dist`。

5. **把 crossws 写成稳定 API**：`listen.ts` 自己打了 experimental 警告。

## 适用 vs 不适用场景

**适用**：

- 本地或小服务要用一行代码把已有 Node listener 听起来，并看到 local/network/tunnel URL
- 和固定 1.15.11 的 [[h3]] 组成应用层 + 听端口层
- 需要自签 HTTPS、二维码或 `untun` 隧道做演示

**不适用**：

- 生产要由 systemd / 容器编排管进程和证书轮换——listhen 的 `autoClose` 和一天自签证书不是那份合同
- 入口是 Web `fetch` 而不是 Node listener，例如 [[hono]] 的 Workers 部署
- 需要本轮未跑的热更新正确性或隧道可用性保证

## 固定版本边界

- 本文绑定 `unjs/listhen@2466b69899...`。annotated tag `v1.10.1` 与 package `1.10.1` 同指此提交；npm 未发布 `gitHead`。
- 运行时依赖 `h3@^1.15.11`，与本轮 h3 页一致。
- `@parcel/watcher` 是 optional peer；缺失时退到 `@parcel/watcher-wasm`。
- `package.json` 无 `engines` 字段。
- 本文未安装依赖、未执行 `listen()`、未开隧道，状态保持 `UNVERIFIED`。

## 学到什么

1. **听端口和写 handler 是两个包**——`listen()` 只认 Node listener。
2. **public / hostname / 生产标记会改默认绑定**——Docker 空 host、localhost 不公开，不是同一句话。
3. **CLI 才动态加载 h3**——库入口不 `import` 你的 app，只听你给的函数。
4. **自签证书的默认寿命是一天**——`https: true` 不是“已配置生产 TLS”。

## 应用型自测

1. `listen(createApp())` 能通过类型吗？正确写法是什么？
2. `https: true` 且不提供 cert 时，自签证书默认有效期几天？
3. `listhen ./app.ts` 解析导出的顺序是什么？看到 h3 App 时多哪一步？

检查点：

1. 不能。应 `listen(toNodeListener(app))`。
2. 1 天。
3. `handler || handle || app || default || module`；若有 `.handler` 再剥一层，然后 `fromNodeMiddleware`。

## 延伸阅读

- 固定源码：[unjs/listhen](https://github.com/unjs/listhen) —— 本文绑定提交 `2466b698997f6d5006c22f36ab54379df277cf5f`
- 对照入口：`src/listen.ts`、`src/server/dev.ts`、`src/cli.ts`、`src/_cert.ts`
- [[h3]] —— 本轮配对的 event / layer 框架
- [[express]] —— 同样能作为 `RequestListener` 交给 `listen`

## 关联

- [[h3]] —— 应用层；本包提供听端口层
- [[express]] —— 也可以 `listen(app)`，因为 Express app 本身是 listener
- [[hono]] —— 默认出口是 `fetch`，不是这套 Node listen
- [[ofetch]] —— 客户端；不要和 listhen 的“听”搞反

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
