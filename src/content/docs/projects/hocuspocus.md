---
title: Hocuspocus — 给 Yjs 配一个能直接上线的协作后端
来源: 'https://github.com/ueberdosis/hocuspocus'
日期: 2026-05-30
子分类: Web 后端
分类: 后端 API
难度: 中级
provenance: pipeline-v3
---

## 是什么

Hocuspocus 是一个**装电池的 Yjs 协作服务器**——你前端用 Yjs 做多人协同，后端要的"认证 / 落盘 / 多机扩展"它都封好了。日常类比：Yjs 像一台发动机，Hocuspocus 像把发动机装进车架，加上方向盘、油箱、车牌——你直接能开走，不用自己造车架。

```ts
import { Server } from '@hocuspocus/server'

const server = new Server({
  port: 1234,
  async onAuthenticate({ token }) {
    if (token !== 'secret') throw new Error('Not authorized')
  },
  async onStoreDocument({ documentName, document }) {
    await db.set(documentName, Y.encodeStateAsUpdate(document))
  },
})
server.listen()
```

10 行代码就能起一个**带认证、能持久化**的协作服务。配上前端 `@hocuspocus/provider`，多人改 Tiptap / ProseMirror / CodeMirror 编辑器立刻就同步了。

## 为什么重要

不理解 Hocuspocus 这类 Yjs 后端，下面这些事都没法做：

- Yjs 官方 demo 给的 `y-websocket` 是**纯内存广播**——刷新页面文档没了，也没认证；想真上线必须自己接持久化、token 校验、多机同步
- 自己从 0 写：要懂 Yjs binary update 协议、awareness 协议、Redis pub/sub、graceful shutdown——4 周起步
- Tiptap 团队（背后是 ueberdosis 公司）做了一个**官方推荐的"y-websocket 升级版"**，把这些都解耦成 extension，几小时就能上生产
- 它是目前 Yjs 生态里 **stars 最多、文档最全的后端**，不会的人写协同 SaaS 基本都先抄它

## 核心要点

Hocuspocus 的工作机制可以拆成 **三步**：

1. **Server + Extensions**：核心只是个 WebSocket 路由器，所有功能（认证、持久化、Redis、Webhook、日志）都是扩展点 hook。类比：路由器只管发包，插不插防火墙、不上 NAS 全靠你装。

2. **Document 按 name 路由 + 内存常驻**：每个 `documentName`（比如 `'project-42/page-7'`）对应一个 YDoc 实例，在 server 内存里。客户端连进来，加入对应房间，update 双向广播。没人连时可配置卸载。

3. **生命周期钩子**：连接进来走 `onConnect → onAuthenticate → onLoadDocument`（从 DB 拉 binary state 还原），改动期间 `onChange`（debounce 触发），定期 / 断开 `onStoreDocument` 落盘，`onDisconnect` 收尾。每个 hook 都能拒绝 / 改写 / 旁路触发。

三步合起来叫 **extension-driven server 模型**。

## 实践案例

### 案例 1：接 Postgres 持久化

用官方 `@hocuspocus/extension-database`：

```ts
import { Database } from '@hocuspocus/extension-database'

new Server({
  extensions: [
    new Database({
      fetch: async ({ documentName }) => {
        const row = await pg.query('SELECT data FROM docs WHERE name=$1', [documentName])
        return row?.data ?? null  // null = 新文档
      },
      store: async ({ documentName, state }) => {
        await pg.query(
          'INSERT INTO docs(name,data) VALUES($1,$2) ON CONFLICT(name) DO UPDATE SET data=$2',
          [documentName, state],
        )
      },
    }),
  ],
})
```

`state` 是 `Uint8Array`，存为 `bytea` 即可。重启服务后老文档自动还原。

### 案例 2：多机部署 + Redis 扩展

```ts
import { Redis } from '@hocuspocus/extension-redis'

new Server({
  extensions: [new Redis({ host: 'redis.internal', port: 6379 })],
})
```

`Redis` 扩展把每个 document 的 update **pub/sub 到所有实例**——用户 A 连机器 1、用户 B 连机器 2 改同一文档也能实时同步。CRDT 公理保证乱序合并仍最终一致，不需要 leader 选举。

### 案例 3：前端 provider 接编辑器

```ts
import { HocuspocusProvider } from '@hocuspocus/provider'
import * as Y from 'yjs'

const ydoc = new Y.Doc()
const provider = new HocuspocusProvider({
  url: 'wss://collab.example.com',
  name: 'project-42/page-7',
  document: ydoc,
  token: getJwt(),
})

// 把 ydoc 接给 Tiptap / ProseMirror / CodeMirror 即可
```

`token` 会在 `onAuthenticate` 收到。`provider.awareness` 拿到光标 / 在线人数。

## 踩过的坑

1. **`onAuthenticate` 失败要 throw**：很多人写 `return false`——这没用，连接照样进来。必须 `throw new Error('Not authorized')`，Hocuspocus 才会关闭 WebSocket。

2. **`onStoreDocument` 默认 debounce 2 秒**：用户改完立刻 `kill -9` 进程会丢这 2 秒的更新。生产部署要监听 `SIGTERM`，调用 `server.destroy()` 触发立即落盘再退出。

3. **Document 内存常驻**：海量文档（10w+）的 SaaS 不能让 YDoc 全在内存。配 `unloadImmediately: true` + DB lazy fetch，没人连就释放，下次连接重新拉。

4. **AGPL 协议传染**：Hocuspocus 默认 AGPL-3.0——闭源 SaaS 直接用法律上有风险。商业产品考虑买 Tiptap Pro license 或自己起一个 fork 维护。

## 适用 vs 不适用场景

**适用**：
- Tiptap / ProseMirror / CodeMirror / Lexical 富文本协作的服务端
- 需要"认证 + 落盘 + 横向扩展"齐全的 Yjs 后端
- 中等规模协作 SaaS（万级文档、千级并发）
- 教学 / 内部工具：开箱即用，几小时上线

**不适用**：
- 单纯 P2P 不要服务器 → 用 `y-webrtc` 直连
- 海量文档 + 极低延迟（百万级 DAU）→ 自研专用后端，Hocuspocus 内存模型撑不住
- 需要强一致 / 事务性写（金融账本）→ CRDT 模型本身不适合
- 不能接受 AGPL 又不想买 license → 选 y-websocket 自己加扩展，或 Liveblocks 等 SaaS

## 历史小故事（可跳过）

- **2021 年**：德国公司 ueberdosis 开源 Tiptap 编辑器后，社区反复问"协同怎么做"。官方给的 `y-websocket` demo 没认证没存储，团队决定开第二个项目专门做后端。
- **2021 年底**：Hocuspocus v1 发布，最初只是把 y-websocket 加了几个 hook。
- **2022 年**：v2 重构成 extension 体系，所有功能解耦——Database / Redis / Webhook / Logger 都是独立 npm 包。
- **2024 年**：达到 2k+ stars，被 Linear、JupyterLab 之外的协作 SaaS 大量采用。
- **现在**：Tiptap Cloud 自己生产环境就是跑改进版 Hocuspocus；社区版仍活跃维护。

## 学到什么

1. **"装电池" vs "造电池"**：Yjs 选了"只做核心库"，Hocuspocus 选了"装好电池"——不同抽象层都有市场
2. **Extension 模式胜过 monolith**：核心只做路由 + 钩子，认证/存储/Redis 全是插件，用户用什么装什么
3. **协议 vs 后端职责切分**：Yjs 定义客户端协议（YDoc + binary update），Hocuspocus 只做服务端胶水，两边版本独立演进
4. **协同编辑的"工程难"在状态管理**：算法层 Yjs 已经解了，剩下的难度全在持久化、多机、认证——这些 Hocuspocus 用插件一一对应

## 延伸阅读

- 官方文档：[tiptap.dev/docs/hocuspocus](https://tiptap.dev/docs/hocuspocus/introduction)（含 extension 列表 + 示例）
- 源码：[github.com/ueberdosis/hocuspocus](https://github.com/ueberdosis/hocuspocus)（monorepo，server / provider / extensions 各一个包）
- 对比 SaaS：[Liveblocks vs Hocuspocus](https://liveblocks.io/comparison/liveblocks-vs-hocuspocus)（前者是闭源 SaaS，后者自托管）
- [[yjs]] —— Hocuspocus 服务的客户端，CRDT 算法都在那
- [[prosemirror]] —— 富文本编辑器框架，配 y-prosemirror 接 Hocuspocus
- [[codemirror]] —— 代码编辑器，y-codemirror.next 接 Hocuspocus

## 关联

- [[yjs]] —— Hocuspocus 是 Yjs 的官方推荐后端，前端 binary update 都给它
- [[prosemirror]] —— Tiptap 基于 ProseMirror，Hocuspocus 主用例就是它的协作
- [[codemirror]] —— y-codemirror.next 让代码协同也走 Hocuspocus
- [[lexical]] —— Meta 的新编辑器，y-lexical 也能接
- [[lamport-1978]] —— Yjs binary update 的 ID 机制源头，Hocuspocus 只搬运不参与
- [[paxos-1998]] —— 强一致协议的对比项；Hocuspocus 选 CRDT 最终一致而非 Paxos

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[codemirror]] —— CodeMirror — 编辑器不是一个类，是一组扩展的合奏
- [[lamport-1978]] —— Lamport 1978 — 分布式系统里没有"绝对的同时"
- [[paxos-1998]] —— Paxos 1998 — 古希腊议会寓言里藏的共识协议
- [[prosemirror]] —— ProseMirror — schema 先定 DOM 后服从的富文本编辑器框架
- [[yjs]] —— Yjs — 让任何编辑器都能接的协同编辑内核

