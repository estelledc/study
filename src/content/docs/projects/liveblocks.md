---
title: 'Liveblocks — 多人协作的托管基础设施'
来源: 'https://github.com/liveblocks/liveblocks'
日期: 2026-05-30
分类: 协同编辑
难度: 中级
---

## 是什么

Liveblocks 是一套**把"多人协作"打包成 React hooks 的托管基础设施**——你写一个 `useStorage` 就拿到共享状态，写一个 `usePresence` 就拿到光标位置，背后的 WebSocket、CRDT、鉴权、持久化全都托管。日常类比：[[yjs]] / [[automerge]] 像是给你一台引擎，你还得自己造车架、装轮子、找加油站；Liveblocks 像直接租一辆车——hooks 是方向盘，剩下都不用管。

它的核心入口长这样：

```tsx
import { RoomProvider, useStorage, useMutation, useOthers } from '@liveblocks/react'

function Canvas() {
  const shapes = useStorage(root => root.shapes)
  const others = useOthers()       // 其他在场的人 + 他们的光标
  const addShape = useMutation(({ storage }) => {
    storage.get('shapes').push({ x: 100, y: 100 })
  }, [])
  return <button onClick={addShape}>add ({others.length} others online)</button>
}
```

一个 `RoomProvider` = 一个协作房间（一个文档 / 一块画布），房间内的 Storage 自动同步，断网重连会续上。

## 为什么重要

不理解 Liveblocks 这类托管协同基建，下面这些事就说不清：

- 为什么 2024 年起多人 SaaS（Linear / Notion / Figma 风的小工具）能 1-2 个前端就上线协同——他们没自己写 WebSocket，租了 Liveblocks / PartyKit / Tldraw sync
- 为什么"协作"在产品里越来越像默认功能而不是奢侈品——基建被 SaaS 化了，门槛从"3 人月"压到"半天"
- 为什么 [[yjs]] 还活得好好的——Liveblocks 的 `@liveblocks/yjs` 直接把 Yjs Doc 搭在 Liveblocks 房间上，做 Tiptap / Monaco 协同
- 为什么 [[automerge]] 和 Liveblocks 长得像但定位完全不同——一个是 local-first 的库，一个是 always-online 的服务

## 核心要点

Liveblocks 的运行模型可以拆成 **四层**：

1. **Room（房间）**：一个协作单位。每个 Room 一条 WebSocket，独立 Storage 树。多个用户进同一个 Room 才能互看。

2. **Storage（持久共享状态）**：CRDT 化的状态树，三种数据类型：`LiveObject`（键值）/ `LiveList`（有序列表）/ `LiveMap`（无序 map）。背后是 [[crdt-shapiro-2011]] 数学的工程化实现，嵌套结构能收敛靠的是 [[crdt-json-2017]] 那一类思路。任何客户端的改动通过 `useMutation` 提交，Liveblocks 把 op 广播给其他人 + 落库。

3. **Presence（临时状态）**：光标坐标、是否在打字、当前选中——存在内存里，不持久化，断开就消失。`usePresence` 读自己，`useOthers` 读别人。

4. **Comments / Notifications（成品组件）**：`@liveblocks/react-comments` 直接给一个评论 UI（线程、@mention、reactions），不用自己写。

四层加起来叫 **Liveblocks Room 模型**。

## 实践案例

### 案例 1：10 行写出"在线指针 + 共享计数器"

```tsx
import { RoomProvider, useMyPresence, useOthers, useStorage, useMutation } from '@liveblocks/react'

function Counter() {
  const count = useStorage(root => root.count) ?? 0
  const inc = useMutation(({ storage }) => {
    storage.set('count', (storage.get('count') ?? 0) + 1)
  }, [])
  const [, updateMyPresence] = useMyPresence()
  const others = useOthers()
  return (
    <div onPointerMove={e => updateMyPresence({ x: e.clientX, y: e.clientY })}>
      count: {count} · others: {others.length}
      <button onClick={inc}>+1</button>
    </div>
  )
}
```

这 12 行覆盖了：共享状态（`count`）、共享光标（`x/y`）、在线人数（`others`）。换 [[yjs]] 自己搭至少要：起 y-websocket、写鉴权、做持久化、写 React 绑定——半天起步。

### 案例 2：把 Yjs Doc 搭在 Liveblocks 上跑 Tiptap

```tsx
import { useEffect, useState } from 'react'
import { useRoom } from '@liveblocks/react'
import { LiveblocksYjsProvider } from '@liveblocks/yjs'
import * as Y from 'yjs'

function Editor() {
  const room = useRoom()
  const [yDoc] = useState(() => new Y.Doc())
  useEffect(() => {
    const provider = new LiveblocksYjsProvider(room, yDoc)
    return () => provider.destroy()
  }, [room, yDoc])
  // 把 yDoc 接到 Tiptap / ProseMirror / Monaco 的 Yjs 绑定
}
```

为什么要这么套？因为富文本协同 Yjs 的 YATA / YText 比 Liveblocks Storage 更细粒度（按字符）。Liveblocks 在这里只当传输 + 持久化层。Provider 要在 effect 里创建并在卸载时 `destroy`，不要写在渲染路径上。

### 案例 3：Mutation 必须显式声明，不能直接改

```tsx
// 错误：直接改 Storage 不会广播
const shapes = useStorage(root => root.shapes)
shapes.push({...})   // 实际上 useStorage 返回的是只读快照，会报错

// 正确：在 useMutation 里改
const addShape = useMutation(({ storage }) => {
  storage.get('shapes').push({ x: 0, y: 0 })
}, [])
```

`useMutation` 的依赖数组（第二个参数）和 `useCallback` 一样——闭包要捕获的外部状态都要列出来，不然会拿到旧值。

## 踩过的坑

1. **Presence 不持久化**：刷新页面 Presence 重置。想存的东西（比如"用户的颜色偏好"）应放 Storage，不是 Presence。

2. **Storage 改动只能在 useMutation / room.batch 里**：直接对返回的快照做变更不会广播，而且 TypeScript 会拦你。

3. **同键冲突偏 LWW，不是“全盘不要历史”**：Storage 仍是 CRDT 树——`LiveList` 并发插入可以合并；但 `LiveObject` 上两边断网改**同一个键**，重连后通常后写覆盖先写。要字符级保留双方编辑历史，用 `@liveblocks/yjs`。

4. **免费层 MAU 上限**：免费档有 MAU 限额（具体数字以官网定价为准），超出按量计费。做 demo 通常没事；公开产品要先算账。

5. **`@liveblocks/yjs` 升级敏感**：和 Tiptap / Lexical 的 Yjs 绑定一起升级时容易破坏——锁版本，跟着官方迁移指南来。

## 适用 vs 不适用场景

**适用**：
- 多人 SaaS 想要"光标 + 评论 + 状态同步"全家桶（Figma / Notion / Linear 风）
- 不想自己搭 WebSocket + Redis + 持久化的小团队
- 把 Yjs / Tiptap 接进来但不想自己跑 y-websocket 服务器

**不适用**：
- 纯 local-first / 离线优先 → 用 [[automerge]]
- 数据严格不能出公司 → 自托管选项有但比 SaaS 配置复杂
- 高频游戏状态同步 → 用专业实时引擎（Colyseus / 自写 UDP）
- 只想要裸 CRDT、不要托管 → [[yjs]]

## 历史小故事（可跳过）

- **2021 前后**：Liveblocks 从协同白板/文档场景起步，把 Room + Presence 收成 React hooks，降低“自己搭 WebSocket”的门槛。
- **产品化**：随后补上 Storage、Comments、Notifications，定位从实时同步层扩成协作基础设施。
- **与 Yjs 合流**：推出 `@liveblocks/yjs`，让 Tiptap / Monaco 用户把传输和持久化交给托管，不必自建 y-websocket。

## 学到什么

1. **协作基建在被 SaaS 化**——以前 3 人月的活，现在半天搞定，门槛下沉到产品默认功能
2. **Storage / Presence 二分法很重要**：持久 vs 临时，混在一起会做出很怪的产品
3. **CRDT 不止一种**：Liveblocks Storage 对同键常偏 LWW，富文本要叠 [[yjs]] 这种保留编辑历史的 CRDT
4. **托管换的是"把基建外包"**，代价是数据走 SaaS、按 MAU 计费——这是个工程权衡，不是技术优劣

## 延伸阅读

- 官网文档：[Liveblocks Docs](https://liveblocks.io/docs)（hooks API + Storage / Presence 全部例子）
- 入门教程：[Liveblocks Tutorial](https://liveblocks.io/docs/tutorial/react)（30 分钟跑通一个协同 todo）
- 源码：[liveblocks/liveblocks](https://github.com/liveblocks/liveblocks) monorepo（packages 目录看 client / react / yjs）
- 对比阅读：[[yjs]] —— 裸 CRDT 库
- 对比阅读：[[automerge]] —— local-first JSON CRDT

## 关联

- [[yjs]] —— 富文本协同的裸 CRDT；可通过 `@liveblocks/yjs` 跑在 Liveblocks 房间上
- [[automerge]] —— local-first 的 JSON CRDT；和 Liveblocks 的 always-online 路线对立
- [[crdt-shapiro-2011]] —— CRDT 的数学定义；Liveblocks Storage 的 LiveList / LiveMap 是它的工程实例
- [[crdt-json-2017]] —— 嵌套 JSON CRDT 收敛证明；Liveblocks 的复合 Storage 是它的产品化形态

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[partykit]] —— PartyKit — Cloudflare Durable Objects 上的实时协作 framework
- [[sharedb]] —— ShareDB — 基于 OT 的实时数据库
