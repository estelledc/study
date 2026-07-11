---
title: Excalidraw — 手绘风协作白板
来源: 'excalidraw/excalidraw v0.18.1, 2026-04 读, MIT'
日期: 2026-05-29
分类: 协作工具
难度: 中级
---

## 是什么

Excalidraw 是一个**让画出来的图看起来像草稿纸涂鸦**的网页白板。日常类比：像在咖啡馆纸巾上随手画的流程图——故意不工整，反而让人觉得"这只是个想法"，没人会盯着像素较真。

打开 [excalidraw.com](https://excalidraw.com)，画几个矩形和箭头，会看到所有线条都微微抖动、颜色边缘有点散。这是底层 [Rough.js](https://roughjs.com) 给每条线加了随机扰动模拟出来的"手绘感"。

它做四件事：画图（canvas 渲染）、撤销（undo/redo）、协作（多人同步）、保存（本地 + 加密链接分享）。卖点是把这四件事**用同一个 delta 抽象**串起来，不是各搞各的。

## 为什么重要

不理解 Excalidraw 这种"四合一"思路，下面这些事都没法解释：

- 为什么很多工程师做的 PRD 流程图都长得歪歪扭扭——故意降低观众对"完美度"的预期，评审会不会卡在"为什么这条线偏 2px"
- 为什么 Excalidraw 比 Figma 嵌入第三方 React 应用容易——它就是一个 npm 包，不是一个 SaaS
- 为什么"无限撤销 + 多人协作"两件事可以同时满足——找到一个增量表示就行
- 为什么它的协作链接长成 `https://excalidraw.com/#room=xxx,yyy`——服务器永远看不到加密钥匙

## 核心要点

Excalidraw 的设计可以拆成 **三层**：

1. **手绘风渲染**：每条线被 Rough.js 拆成多段、每段加随机扰动。类比：你照着尺子画线，但每次手都微微抖一下。这种"故意不完美"是产品判断，不是技术限制。

2. **delta 同时驱动撤销 + 协作**：用户的每个操作（拖、改色、删）先被算成一个"差量"（delta），这个 delta 既进 undo 栈、又广播给其他用户。类比：每次改动都写一张"变更卡"，本人按 Ctrl+Z 就反向应用，远端用户拿到卡就正向应用。

3. **协作不是 P2P 是加密中继**：所有用户都连同一个 socket.io 服务器，但内容用 AES-GCM 加密，服务器只看到密文。钥匙藏在 URL 的 `#hash` 里——`#` 后面的内容浏览器永远不会发到服务器。类比：邮局只负责送信，但信封上锁，钥匙只在收发双方手里。

## 实践案例

### 案例 1：5 分钟把 Excalidraw 嵌进自己的 React 应用

```tsx
// 装包：npm install @excalidraw/excalidraw
import { Excalidraw } from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'

export default function App() {
  return (
    <div style={{ height: '100vh' }}>
      <Excalidraw
        onChange={(elements, appState) => {
          console.log('元素数量:', elements.length)
        }}
      />
    </div>
  )
}
```

跑 `npm run dev`，浏览器里就有一个完整的 Excalidraw 了。**协作功能不在 npm 包里**——npm 包只给你单机白板，要协作得自己搭 socket 服务。

### 案例 2：三档"capture 调度"区分操作来源

Excalidraw 把每个用户操作分成三档：

```typescript
const CaptureUpdateAction = {
  IMMEDIATELY: "IMMEDIATELY",   // 普通画图、移动、删除 → 立即进 undo
  NEVER: "NEVER",               // 远端推过来的协作变化 → 不进自己的 undo
  EVENTUALLY: "EVENTUALLY",     // 文本编辑、自由画线 → 攒一批再合并进 undo
}
```

**逐部分解释**：

- 三态而不是简单 true/false——多步异步操作（比如拖动连续 60 帧）不能每帧都进 undo，否则按一次 Ctrl+Z 只回退 1 像素
- `NEVER` 专门给远端来的变更——你不能撤销别人的操作，否则两人 undo 历史会打架
- `as const` 让 TS 把字符串当字面量类型，比 `enum` 更 tree-shake 友好

### 案例 3：撤销栈存的是反向 delta，不是完整快照

```typescript
public record(delta: StoreDelta) {
  // 把这次变化的"反向"算出来存进栈
  const inverseDelta = HistoryDelta.inverse(delta)
  this.undoStack.push(inverseDelta)
}
```

如果画了 1000 个矩形，朴素做法存 1000 份完整文档拷贝，内存爆炸。Excalidraw 只存 1000 张"变化卡片"——按 Ctrl+Z 就 apply 一张反向卡。**这一点决定能不能在浏览器里做大白板**。

## 踩过的坑

1. **"端到端加密"不等于"无元数据"**：服务器看不到画的内容，但能看到"哪个 IP 和哪个 IP 通信、信封多大"。流量分析攻击没防——严格隐私场景要自托管 portal server。

2. **协作链接一旦截图分享就破防**：钥匙在 URL hash 里，截图带钥匙的链接发出去 = 任何拿到链接的人都能解密。这是 feature 也是隐患，文档没明确警告。

3. **z 顺序冲突没用严格 CRDT**：两人同时在 A 和 B 之间插入元素时，可能算出同一个排序 key，后到的覆盖前到的。这对白板够用，但**不要拿这套实现做协同文档编辑器**——那种场景必须用 [[yjs]] 这类严格 CRDT。

4. **主组件单文件 13000+ 行**：App.tsx 里塞了 140+ 个方法、36 个 addEventListener。它能 work 是因为团队投入巨大——**不是值得抄的 React 实践**，而是历史包袱。

## 适用 vs 不适用场景

**适用**：
- 做产品 PRD / 流程图 / 架构图——草稿感反而让评审更聚焦"想法"而非"完成度"
- 嵌进 React 应用做"AI 输出 + 用户在白板上补充"的交互——npm 包成熟
- 自托管协作白板——MIT 协议 + 加密在客户端做，企业内网部署可控
- 配 markdown 笔记站——`.excalidraw` JSON 存 git 仓库，可编辑也可 diff

**不适用**：
- 高保真 UI 设计 → 用 Figma，手绘风不是 UI 工具
- 严格 CRDT 协作（不允许任何冲突丢失）→ 用 tldraw + [[yjs]]
- 10000+ 元素的大画布 → canvas 2D + viewport culling 撑不住，上 [[pixi]] 或 [[konva]]
- Tier-2 隐私场景 → 服务器仍可见元数据，自托管 portal server 才安全

## 历史小故事（可跳过）

- **2020 年初**：Christopher Chedeau（vjeux）受 Balsamiq Mockups 启发，写了第一个 prototype 放在自己的博客
- **2020-2021 年**：项目爆发增长，社区 PR 涌入；端到端加密协作功能上线
- **2022 年**：抽出 npm 包 `@excalidraw/excalidraw`，可嵌入第三方 React 应用
- **2024-2025 年**：把所有改动收敛到 Store / Snapshot / Delta 三件套，"四合一"架构成型
- **2026 年 4 月**：v0.18.1 发布；124k stars，Google Cloud / Notion / Replit 都把它嵌进自己的产品

## 学到什么

1. **找通用中间表示比各做各的强**——撤销 / 协作 / 持久化都用 delta，比"undo 栈一套、协作一套、保存一套"省一个数量级代码
2. **手绘风是产品决策，不是技术不行**——故意降低完美度，让用户敢画"还没想清楚"的东西
3. **E2E 加密 ≠ P2P**——把钥匙藏在 URL hash 里就能做"服务器无知"的中继协作
4. **够用就好胜过追求完美 CRDT**——白板场景不需要严格冲突解决，简单的字符串 z-order 就能跑稳

## 延伸阅读

- 文章：[How collaboration & end-to-end encryption work](https://blog.excalidraw.com/end-to-end-encryption/) — 官方加密机制详解
- 源码入口：[`packages/element/src/store.ts`](https://github.com/excalidraw/excalidraw/tree/master/packages/element/src/store.ts) — 整个 delta 抽象的核心文件
- [Rough.js 文档](https://roughjs.com) — "手绘风"渲染的真正来源，20% 解释 Excalidraw 视觉特征
- [tldraw 源码](https://github.com/tldraw/tldraw) — 同生态位但用 [[yjs]] 做协作的另一条路
- [[yjs]] —— 严格 CRDT 协作的工业标准，对照 Excalidraw 的简化方案
- [[lexical]] —— 同样要解决"撤销 + 协作"的富文本编辑器，用了不同的抽象

## 关联

- [[yjs]] —— 严格 CRDT 协作库；Excalidraw 故意没用，对比看出"够用就好"的工程取舍
- [[lexical]] —— 富文本编辑器；同样面临 undo + 协作问题，方案是 selection-aware 的 history
- [[fabric-js]] —— 同 canvas 2D 但定位是"图形编辑器"（图层 + 控制点），不做协作
- [[konva]] —— 同 canvas 2D 渲染，也提供 React 绑定，但不带协作和加密
- [[prosemirror]] —— 富文本协作的另一条路，用 OT（Operational Transform）而非 CRDT
- [[monaco-editor]] —— 协作编辑器的代码场景版本，VSCode 的核心

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[affine]] —— AFFiNE — 文档和白板共用同一棵 block 树的开源知识库
- [[canvas-datagrid]] —— canvas-datagrid — 整张表只用一块 canvas 画
- [[chatwoot]] —— chatwoot — 把 11 种外部聊天渠道归一到同一张消息表
- [[drawio]] —— drawio (diagrams.net) — 离线版 Visio
- [[flowchart-js]] —— flowchart.js — 文本生成流程图
- [[librecad]] —— LibreCAD — 2D 工程绘图
- [[pdfme]] —— pdfme — TypeScript 模板化 PDF
- [[tldraw]] —— tldraw — 把白板做成可嵌入的 SDK
