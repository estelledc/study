---
title: "Excalidraw — 把 canvas / 协同 / 撤销 / 持久 都收敛到同一个 Store"
description: 大型应用范例——124k stars 背后的"四轨同核"架构判断，以及一处经常被误读的"P2P/E2E"叙事
sidebar:
  order: 27
  label: "excalidraw/excalidraw"
---

> 状元篇升级（2026-05-28）。基于 commit `c08be696` 的源码精读 + 浅克隆 + 一次"量化复杂度"hands-on 实验。
> 上一版（2026-05-27）把 Excalidraw 当"canvas + 协同的最小心脏"理解，
> 升级后两点重写：(1) 协同**不是 P2P / WebRTC**——是 socket.io 中心化中继 + AES-GCM 端到端加密，
> (2) 把 App.tsx 13053 行从"上帝组件"模糊吐槽改成 142 个方法 / 36 个 addEventListener 的可量化数据。

## 核心信息

| 字段 | 值 |
|---|---|
| Repo | [excalidraw/excalidraw](https://github.com/excalidraw/excalidraw) |
| Star / Fork | 124,153 / 13,806（2026-05-28 拉取） |
| 最近活跃 | `pushed_at = 2026-05-25T12:39:23Z`（活跃 daily 推送） |
| 主分支 commit | `c08be69618dc`（2026-05-25，"ci(docker): fix docker dep bundling and pin remaining actions #11398"） |
| 最新 release | `v0.18.0`（已 tag） |
| 主语言 | TypeScript（packages/* 全部 TS）+ SCSS |
| 维护方 | Excalidraw 社区（核心由 dwelle / ad1992 / lipis 推） |
| 主要贡献者 | dwelle 837 / dependabot[bot] 605 / ad1992 501 / lipis 284 / vjeux 141（前 5，2026-05-28 拉取） |
| License | MIT |
| 类似项目 | tldraw（同代开源）/ Figma（闭源高保真）/ Miro（商业 SaaS）/ draw.io（上一代开源） |
| 哲学不同竞品 | tldraw（SDK-first，AI-first，TS 类型更现代） |

## 一句话定位

**Excalidraw 不只是"手绘风白板"——
它是一个"把 canvas 渲染 / 协同同步 / 撤销栈 / 持久化"全部收敛到 Store/Snapshot/Delta 三件套的架构样本。**
四轨独立但靠同一个增量模型协调；这才是 124k stars 真正稳的地方。

## Why（为什么是它而不是 tldraw / Figma / Miro / draw.io）

Excalidraw 解决的不是"画图"问题——是"**画图 + 撤销 + 协作 + 保存**"四件事**怎么用一个抽象统一**的问题。

[README 顶部宣传语](https://github.com/excalidraw/excalidraw/blob/c08be696/README.md#L17-L20)：

> An open source virtual hand-drawn style whiteboard.
> Collaborative and end-to-end encrypted.

这两句各自对应一条产品判断：

1. **"hand-drawn style"**——故意不做 Figma 的精确像素。让产出"像草图"，**降低 stakeholder 对完美度的预期**。
   工程师做 PRD 时画个流程图，"它看起来不完美"反而是一种**心理减负**——
   评审会时没人会盯着像素去较真"为什么这条线歪了 2px"。
2. **"end-to-end encrypted"**——和绝大部分协同白板不同，roomKey 在 URL hash 里（`#room=<id>,<key>`），
   服务器只看到密文（[`Portal.tsx:90-100`](https://github.com/excalidraw/excalidraw/blob/c08be696/excalidraw-app/collab/Portal.tsx#L85-L102)
   走 AES-GCM）。**这不是营销话术，是真实代码**——这意味着 Excalidraw 团队不背"把企业敏感图泄出去"的法律风险。

但如果只看产品宣传，会错过**架构层的真正价值**：

旧版笔记把 Excalidraw 简单写成"canvas + 协同的最小心脏"。这话不错，
但漏掉了真正值得抄作业的判断——**同一个 StoreDelta 模型同时驱动四件事**：
"渲染从 snapshot 拉" / "undo 是反向 delta" / "协作是把 delta 广播" / "持久化也是写 delta"。
这是 124k stars 背后稳的底层机制：**找通用中间表示，而不是各搞各的**。

如果你做任何带"撤销 + 协作"的 web 应用（Notion 类、白板类、协同编辑器），
**第一性问题应该是**："我能不能找到一个增量表示同时满足这四个需求"——这就是 Excalidraw 的答案。

![Excalidraw 三轨架构 — canvas / collab / history / persist 四轨同核](/projects/excalidraw/01-three-tracks-store.webp)

*图 1：Excalidraw v0.18.0 / commit `c08be696` 的"四轨同核"架构。中央米黄底色框是
[`packages/element/src/store.ts:78`](https://github.com/excalidraw/excalidraw/blob/c08be696/packages/element/src/store.ts#L78)
的 `Store` 类（1037 行）——所有改动都先变成 StoreDelta，再 emit。
四个角各是一条独立轨道：左上 Canvas 渲染轨（App.tsx 13053 行 → Renderer 262 → staticScene 501 / interactiveScene 2090），
右上 Collab 协同轨（**注意：是 socket.io 中心化中继 + AES-GCM 端到端加密，不是 P2P/WebRTC**——
官网"e2e encrypted"叙事容易让读者误读成"P2P 不上服务器"），
左下 History/Undo 轨（history.ts 249 行，subscribe 到 DurableIncrement），
右下 Persist/Order 轨（fractional-indexing 322 行 vendored package）。
关键判断：**DurableIncrement 走 undo+collab+persist；EphemeralIncrement 只刷 UI 不广播**——
这一道闸门避免了"鼠标移动一下 → 全网广播"的灾难。手绘 sketchnote 风。*

## 仓库地形

### 顶层目录注释表

```
excalidraw/                                ← monorepo（yarn workspaces 协调）
├── excalidraw-app/                        ← 公开站点 excalidraw.com（不是 npm 包，是 demo 应用）
│   ├── App.tsx                            ← 应用入口（38 commits in last 2k）
│   ├── collab/
│   │   ├── Collab.tsx                     ← 协同集成层（29 commits）
│   │   └── Portal.tsx                     ← ★ socket.io 抽象（15 commits，184 行）
│   └── data/
│       └── index.ts                       ← roomId/roomKey 生成 + URL hash 解析
├── packages/                              ← yarn workspaces 子包（@excalidraw/*）
│   ├── excalidraw/                        ← ★ 主 npm 包（@excalidraw/excalidraw）
│   │   ├── components/App.tsx             ← ★★★ 13053 行：主 React 组件（227 commits in last 2k）
│   │   ├── scene/Renderer.ts              ← 262 行：渲染调度（14 commits）
│   │   ├── renderer/
│   │   │   ├── staticScene.ts             ← 501 行：完成图渲染（17 commits）
│   │   │   ├── interactiveScene.ts        ← 2090 行：实时绘制 + 选择 + handles（41 commits）
│   │   │   └── staticSvgScene.ts          ← SVG 导出
│   │   ├── data/encryption.ts             ← 94 行：AES-GCM 端到端加密
│   │   ├── history.ts                     ← 249 行：undo/redo（11 commits）
│   │   ├── appState.ts                    ← UI 状态（zoom / scroll / selection，29 commits）
│   │   ├── actions/                       ← 用户动作（cut/copy/paste/align/...）
│   │   └── types.ts                       ← 1078 行：类型山（79 commits）
│   ├── element/                           ← 几何 + 元素管理 + ★ Store/Delta 心脏
│   │   └── src/
│   │       ├── store.ts                   ← ★★★ 1037 行：Store / Snapshot / Delta（9 commits）
│   │       ├── delta.ts                   ← 2066 行：增量计算（11 commits）
│   │       ├── binding.ts                 ← 箭头-元素绑定
│   │       ├── collision.ts               ← 命中测试
│   │       └── bounds.ts                  ← 包围盒
│   ├── common/                            ← Emitter / 工具函数
│   ├── math/                              ← 几何运算
│   ├── fractional-indexing/               ← ★ 322 行 vendored，z-order 协同排序
│   └── utils/
└── examples/                              ← 集成示例（NextJS / browser script）
```

### 心脏文件清单（commit `c08be696` 时刻）

| 文件 | 行数 | 角色 |
|---|---|---|
| [`packages/element/src/store.ts`](https://github.com/excalidraw/excalidraw/blob/c08be696/packages/element/src/store.ts) | 1037 | **Store / Snapshot / Delta 三件套**——所有改动的协调器 |
| [`packages/element/src/delta.ts`](https://github.com/excalidraw/excalidraw/blob/c08be696/packages/element/src/delta.ts) | 2066 | StoreDelta / ElementsDelta / AppStateDelta 实现 |
| [`packages/excalidraw/history.ts`](https://github.com/excalidraw/excalidraw/blob/c08be696/packages/excalidraw/history.ts) | 249 | 撤销栈（undoStack / redoStack 都是 `HistoryDelta[]`） |
| [`excalidraw-app/collab/Portal.tsx`](https://github.com/excalidraw/excalidraw/blob/c08be696/excalidraw-app/collab/Portal.tsx) | 184 | socket.io 抽象 + 加密广播——协同的"喉咙" |
| [`packages/excalidraw/data/encryption.ts`](https://github.com/excalidraw/excalidraw/blob/c08be696/packages/excalidraw/data/encryption.ts) | 94 | AES-GCM encrypt/decrypt + 128-bit key 生成 |
| [`packages/fractional-indexing/src/index.ts`](https://github.com/excalidraw/excalidraw/blob/c08be696/packages/fractional-indexing/src/index.ts) | 322 | base62 字符串排序 → z-order 协同不冲突 |
| [`packages/excalidraw/components/App.tsx`](https://github.com/excalidraw/excalidraw/blob/c08be696/packages/excalidraw/components/App.tsx) | 13053 | 主组件（**不要硬读**，hands-on 段量化它的复杂度） |

### commit 热点按子系统分组（基于 `git log --depth=2000 --format='' --name-only` 实测）

数字保留实测真值，按 5 个子系统拆开看——能看出**哪一类心脏文件高频改、哪一类是 noise**，
比单一总榜更能指导精读路径。每组前 1-2 句子系统说明：

#### canvas 渲染（主组件 + 渲染调度）

主组件是大型应用最容易膨胀的位置——App.tsx 的 commit 数高度暗示"god-class 自我加强"。

| 排名 | 文件 | commits | 解读 |
|---|---|---|---|
| 1 | `src/components/App.tsx` | 275 | 旧路径（v0.x 之前），早期 monorepo 重构前位置 |
| 2 | `packages/excalidraw/components/App.tsx` | 227 | **当前主组件**——重构后路径，热度依然最高 |
| 3 | `packages/excalidraw/scene/Renderer.ts` / `renderer/staticScene.ts` 等 | 14+17 | 渲染调度 + 完成图渲染，相对稳定（抽象做对了） |

#### state / delta（Store/Snapshot/Delta 心脏）

抽象一旦定型就很少动——这是 Excalidraw 架构稳的结构性证据。

| 排名 | 文件 | commits | 解读 |
|---|---|---|---|
| 1 | `src/types.ts` → `packages/excalidraw/types.ts` | 91+79 | 类型山，每加 feature 都要碰 |
| 2 | `packages/element/src/store.ts` | 9 | **2024 年新引入**——depth=2000 已覆盖完整历史 |
| 3 | `packages/element/src/delta.ts` | 11 | delta 实现，**改动频率比想象低**——抽象稳定就少动 |
| 4 | `packages/excalidraw/tests/__snapshots__/history.test.tsx.snap` | 66 | history 测试快照——**说明 undo/redo 是高频回归区** |

#### collab（协同 + 加密）

"喉咙文件"集中在两处：Collab.tsx 业务集成 + Portal.tsx socket 抽象。改动数不算高但每次都核心。

| 排名 | 文件 | commits | 解读 |
|---|---|---|---|
| 1 | `excalidraw-app/collab/Collab.tsx` | 29+16(legacy) | 协同集成层 |
| 2 | `excalidraw-app/collab/Portal.tsx` | 15 | socket.io 抽象，184 行小但关键 |

#### i18n + UI 框架

UI 框架层 + 多语言文案——高频但不是心脏，主要靠 PR 增量。

| 排名 | 文件 | commits | 解读 |
|---|---|---|---|
| 1 | `src/components/LayerUI.tsx` | 89 | UI 框架层，高频改动 |
| 2 | `src/locales/en.json` → `.../locales/en.json` | 73+59 | i18n 字符串增删 |
| 3 | `src/utils.ts` → `packages/excalidraw/utils.ts` | 65+? | 公共工具沉淀 |
| 4 | `src/excalidraw-app/index.tsx` | 62 | app 入口 |

#### noise（依赖管理 / changelog，**不读心脏但 commit 数高**）

读源码时**不要被这些迷惑**——dependabot 自动 PR 拉高了 yarn.lock / package.json 的数字，但这些不是设计决策。

| 排名 | 文件 | commits | 解读 |
|---|---|---|---|
| 1 | `yarn.lock` | 214 | 依赖更新（dependabot 贡献，noise） |
| 2 | `package.json` | 166 | 同上，noise |

**怀疑 0**（数据局限）：`git fetch --depth=2000` 拉了 2000 commits 的 surface，
仓库总 commits 量级 21k+，**冷门文件可能被截断**。`store.ts` 只统计到 9 commits 是因为这个文件
是 **2024 年新引入**（之前逻辑散在 App.tsx 里），depth=2000 已经覆盖了它的完整历史；
但像 `App.tsx` 因为太老，275 这个数字是**严重低估**——真实数字需要完整克隆。下次状元篇巡检补一次。

## 核心机制（4 段 30-100 行真实代码精读）

### 机制 1 · `Store` 三档调度 —— `IMMEDIATELY / NEVER / EVENTUALLY`

[`packages/element/src/store.ts:38-72`](https://github.com/excalidraw/excalidraw/blob/c08be696/packages/element/src/store.ts#L38-L72)
是整个 Store 抽象的"语义入口"——**用户每次改动都要被打上一个"它该怎么进 history"的标签**：

```typescript
export const CaptureUpdateAction = {
  /**
   * Immediately undoable.
   *
   * Use for updates which should be captured.
   * Should be used for most of the local updates, except ephemerals such as dragging or resizing.
   *
   * These updates will _immediately_ make it to the local undo / redo stacks.
   */
  IMMEDIATELY: "IMMEDIATELY",
  /**
   * Never undoable.
   *
   * Use for updates which should never be recorded, such as remote updates
   * or scene initialization.
   *
   * These updates will _never_ make it to the local undo / redo stacks.
   */
  NEVER: "NEVER",
  /**
   * Eventually undoable.
   *
   * Use for updates which should not be captured immediately - likely
   * exceptions which are part of some async multi-step process. Otherwise, all
   * such updates would end up being captured with the next
   * `CaptureUpdateAction.IMMEDIATELY` - triggered either by the next `updateScene`
   * or internally by the editor.
   *
   * These updates will _eventually_ make it to the local undo / redo stacks.
   */
  EVENTUALLY: "EVENTUALLY",
} as const;
```

旁注：

- **三态而不是布尔**——`{ shouldCapture: true | false }` 两态会丢失"async 中段"这种情况。
  IMMEDIATELY = 普通画画/移动/删除；NEVER = 远端推过来的协作 update（自己不能 undo 别人的操作）；
  EVENTUALLY = 文本编辑、freedraw 这类**多帧持续**的动作（每一帧都进 undo 太碎）
- **`as const` 让 TS 把这三个 string 字面量当成 literal type**——下游 `CaptureUpdateActionType` 是
  `"IMMEDIATELY" | "NEVER" | "EVENTUALLY"`，不是宽泛的 `string`。这是 `enum` vs `as const object` 的现代取舍——
  后者 tree-shake 更友好、运行时只剩字符串
- **NEVER 的注释专门提到 "remote updates"**——说明 Store 抽象**自始就考虑了协作场景**，
  不是先做单机 undo 再补协同
- **EVENTUALLY 的注释暴露一个真实细节**："would end up being captured with the next IMMEDIATELY"——
  这是个**懒提交**机制：拖拽中的每一帧打 EVENTUALLY，等用户松开鼠标打一个 IMMEDIATELY，
  之前所有 EVENTUALLY 一起合并进 undo。**避免 undo 一次只回退一像素**
- **`scheduleCapture()` 只是 `scheduleAction(IMMEDIATELY)` 的语法糖**（[L110-L112](https://github.com/excalidraw/excalidraw/blob/c08be696/packages/element/src/store.ts#L110-L112)），
  上面有一行 `// TODO: Suspicious that this is called so many places. Seems error-prone.`——
  **作者自己也觉得"到处 scheduleCapture"是技术债**

**怀疑 1**：`as const` + `ValueOf` 的组合（[L71](https://github.com/excalidraw/excalidraw/blob/c08be696/packages/element/src/store.ts#L71)）
比 `enum` 多一层心智负担——下游用 `CaptureUpdateAction.IMMEDIATELY` 的位置和直接用字符串 `"IMMEDIATELY"`
都能编译通过。**测试代码可能偷懒写字符串**，迁移时如果改 enum 名（不改值）测试不会断。
这是借鉴 Continue 笔记机制 2 怀疑 3 的同一类型安全 vs 灵活性 trade-off——但 Excalidraw 没像 Continue 那样
留下"测试硬写字符串"的明显证据，下次需要 grep 验证。

### 机制 2 · `History` —— undo 是"应用反向 delta"，不是"复原快照"

[`packages/excalidraw/history.ts:90-137`](https://github.com/excalidraw/excalidraw/blob/c08be696/packages/excalidraw/history.ts#L90-L137)
是撤销栈实现，**比朴素"存全量历史"省一个数量级内存**：

```typescript
export class History {
  public readonly onHistoryChangedEmitter = new Emitter<
    [HistoryChangedEvent]
  >();

  public readonly undoStack: HistoryDelta[] = [];
  public readonly redoStack: HistoryDelta[] = [];

  public get isUndoStackEmpty() { return this.undoStack.length === 0; }
  public get isRedoStackEmpty() { return this.redoStack.length === 0; }

  constructor(private readonly store: Store) {}

  public clear() {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }

  /**
   * Record a non-empty local durable increment, which will go into the undo stack..
   * Do not re-record history entries, which were already pushed to undo / redo stack, as part of history action.
   */
  public record(delta: StoreDelta) {
    if (delta.isEmpty() || delta instanceof HistoryDelta) {
      return;
    }

    // construct history entry, so once it's emitted, it's not recorded again
    const historyDelta = HistoryDelta.inverse(delta);

    this.undoStack.push(historyDelta);

    if (!historyDelta.elements.isEmpty()) {
      // don't reset redo stack on local appState changes,
      // as a simple click (unselect) could lead to losing all the redo entries
      // only reset on non empty elements changes!
      this.redoStack.length = 0;
    }

    this.onHistoryChangedEmitter.trigger(
      new HistoryChangedEvent(this.isUndoStackEmpty, this.isRedoStackEmpty),
    );
  }
```

旁注：

- **`undoStack: HistoryDelta[]`**——栈里存的不是 snapshot 而是 delta。1000 步的 undo 历史只占
  "1000 个变化的总和"，不是"1000 个完整文档的副本"。**画 1000 个矩形时这一点决定生死**
- **`HistoryDelta.inverse(delta)`**（L123）——record 时立刻算反向 delta 存起来；undo 时直接 apply。
  `inverse` 不是"撤销 = 重新算 prev → curr 的反向"，而是**"在写入时就算好反向，存进栈"**。
  这是用空间换时间的微优化，但避免了 undo 时反复重算
- **`if (delta instanceof HistoryDelta) return`**（L118）——防递归：用 undo 触发的变化不能再被 record 进 undo 栈，
  否则一次 undo 会无限制压栈
- **L127-L132 的 redo 重置规则**——*只有 element 变化清 redo，appState（zoom/选择）变化不清*。
  否则用户撤销后随便点一下空白（取消选择 = appState 变化）就会丢掉 redo 历史。
  **这个细节直接决定"undo/redo 体感是否符合直觉"**
- **`onHistoryChangedEmitter`** 在 try/finally 里只触发一次（[L222-L227](https://github.com/excalidraw/excalidraw/blob/c08be696/packages/excalidraw/history.ts#L222-L227)）——
  即使 undo 跨越多个空 entry，只 emit 一次按钮高亮变化。这是 React 渲染节流的经典手段

**怀疑 2**：`HistoryDelta.inverse` 实际怎么算反向 delta？例如对 `{ x: 100 → 200 }` 反向是 `{ x: 200 → 100 }` 没问题，
但对 `{ elements.add(rect-A) }` 反向是 `{ elements.delete(rect-A) }`，**这要求"被加的元素 ID 已经知道"**。
如果协同状态下另一个用户也加了同 ID 元素（用 randomId 概率极低但理论存在）会怎样？
这种 edge case 在 `delta.ts` 2066 行里应该有保护，但 `--depth 1` 没读。**待补**。

### 机制 3 · `Portal.tsx` —— 协同不是 P2P，是"加密包裹 + 中心化中继"

![Excalidraw collab 数据流 — 用户输入 → Store → Portal → AES-GCM → socket.io 中继 → 远端 applyRemote](/projects/excalidraw/02-collab-flow.webp)

*图 2：Excalidraw collab 子系统的端到端数据流（commit `c08be696`）。手绘 sketchnote 风，
和图 1 同一套配色（蓝=本地处理 / 橄榄绿=delta 生成 / 红=Portal 协同喉咙 / 黄=AES-GCM 加密 /
灰=socket.io 中继）。流向分三段：①②③④ 上行（浏览器内本地处理 + Durable 增量生成）→
④↓⑤ 加密（AES-GCM 128 在 [`encryption.ts:50-78`](https://github.com/excalidraw/excalidraw/blob/c08be696/packages/excalidraw/data/encryption.ts#L50-L78)，
roomKey 在 URL `#hash` 不发服务器）→ ⑤⑥⑦ 下行（中心化中继转发，远端用
`CaptureUpdateAction.NEVER` 反向应用 delta，不污染对端 undo 栈）。
**关键节点**：④ [`Portal._broadcastSocketData`](https://github.com/excalidraw/excalidraw/blob/c08be696/excalidraw-app/collab/Portal.tsx#L85-L102)
是唯一加密入口——只有 DurableIncrement 走到这里，EphemeralIncrement（鼠标移动）只刷 UI 不广播；
⑤ AES-GCM 自带认证标签防服务器篡改密文；⑥ 中继看不到内容但仍可见元数据（traffic analysis 风险，
见怀疑 3）。**和官网"E2E encrypted"叙事的对照**：是真 E2E（服务器无 key），但不是 P2P/WebRTC——
这一道误读图 1 已经标过，图 2 在数据流层面再确认一次。*

[`excalidraw-app/collab/Portal.tsx:85-102`](https://github.com/excalidraw/excalidraw/blob/c08be696/excalidraw-app/collab/Portal.tsx#L85-L102)
是协同的"喉咙"——**所有广播在这里加密一次再 emit**：

```typescript
async _broadcastSocketData(
  data: SocketUpdateData,
  volatile: boolean = false,
  roomId?: string,
) {
  if (this.isOpen()) {
    const json = JSON.stringify(data);
    const encoded = new TextEncoder().encode(json);
    const { encryptedBuffer, iv } = await encryptData(this.roomKey!, encoded);

    this.socket?.emit(
      volatile ? WS_EVENTS.SERVER_VOLATILE : WS_EVENTS.SERVER,
      roomId ?? this.roomId,
      encryptedBuffer,
      iv,
    );
  }
}
```

而 [`excalidraw-app/data/index.ts:131-157`](https://github.com/excalidraw/excalidraw/blob/c08be696/excalidraw-app/data/index.ts#L131-L157)
处理 roomKey 在 URL hash 的存放：

```typescript
const RE_COLLAB_LINK = /^#room=([a-zA-Z0-9_-]+),([a-zA-Z0-9_-]+)$/;

export const isCollaborationLink = (link: string) => {
  const hash = new URL(link).hash;
  return RE_COLLAB_LINK.test(hash);
};

export const getCollaborationLinkData = (link: string) => {
  const hash = new URL(link).hash;
  const match = hash.match(RE_COLLAB_LINK);
  if (match && match[2].length !== 22) {
    window.alert(t("alerts.invalidEncryptionKey"));
    return null;
  }
  return match ? { roomId: match[1], roomKey: match[2] } : null;
};

export const generateCollaborationLinkData = async () => {
  const roomId = await generateRoomId();
  const roomKey = await generateEncryptionKey();
  // ...
};
```

旁注：

- **传输路径**：`socket.io-client` (L23) → 自托管 portal server → 转发给 room 内其他 client。
  **是 WebSocket 中心化中继，不是 WebRTC P2P**——这是上一版笔记最大的一个错。
  服务器看到的只有 `(roomId, encryptedBuffer, iv)`，看不到内容
- **`window.location.hash` 的妙用**——URL fragment（`#` 之后）**浏览器永远不会发到服务器**。
  Excalidraw 把 roomKey 放这里，意味着开 collab link 时**服务器从来不知道 key**。
  生成的 link 长这样：`https://excalidraw.com/#room=abc123,xyz789key`
- **AES-GCM 而非 CBC**（[`encryption.ts:50-78`](https://github.com/excalidraw/excalidraw/blob/c08be696/packages/excalidraw/data/encryption.ts#L50-L78)）——
  GCM 自带认证标签，能 catch 服务器篡改 ciphertext 的攻击。CBC 没这个，要额外搭 HMAC
- **128-bit AES key**（[`packages/common` 的 `ENCRYPTION_KEY_BITS`](https://github.com/excalidraw/excalidraw/blob/c08be696/packages/excalidraw/data/encryption.ts#L20)）——
  不是 256-bit。够用且导出成 22 字符 base64url（[L141](https://github.com/excalidraw/excalidraw/blob/c08be696/excalidraw-app/data/index.ts#L141) 的 `length !== 22` 校验）
  能塞进合理长度的 URL；256-bit 的链接会更长更丑
- **`SERVER` vs `SERVER_VOLATILE`**——前者保证送达，后者允许丢（用于鼠标位置这类高频小数据）。
  socket.io 的"volatile" 语义直接映射到协议层，**省了自己写 backpressure 逻辑**

**怀疑 3**：Excalidraw 把 portal server 当"无知中继"。
**但 portal server 本身是 Excalidraw 团队运营的**——
如果服务器记录"哪个 IP 在和哪个 IP 通信 + ciphertext 大小"，仍然能做流量分析（traffic analysis）攻击。
"E2E encrypted" 在密码学严格意义上没错，但**元数据（metadata）依然漏给服务器**。
这一点 README 不写——属于 Tier-2 隐私要求场景的限制。

### 机制 4 · `fractional-indexing` —— z-order 协同不冲突的关键 trick

[`packages/fractional-indexing/src/index.ts:212-268`](https://github.com/excalidraw/excalidraw/blob/c08be696/packages/fractional-indexing/src/index.ts#L212-L268)
是核心 API `generateKeyBetween(a, b)`：

```typescript
export function generateKeyBetween(
  a: string | null | undefined,
  b: string | null | undefined,
  digits = BASE_62_DIGITS,
): string {
  if (a != null) { validateOrderKey(a, digits); }
  if (b != null) { validateOrderKey(b, digits); }
  if (a != null && b != null && a >= b) {
    throw new Error(`${a} >= ${b}`);
  }
  if (a == null) {
    if (b == null) {
      return `a${digits[0]}`;
    }
    // ...处理 b 头部、整数部分、小数部分...
  }
  if (b == null) {
    const ia = getIntegerPart(a);
    const fa = a.slice(ia.length);
    const i = incrementInteger(ia, digits);
    return i == null ? ia + midpoint(fa, null, digits) : i;
  }

  const ia = getIntegerPart(a);
  const fa = a.slice(ia.length);
  const ib = getIntegerPart(b);
  const fb = b.slice(ib.length);
  if (ia === ib) {
    return ia + midpoint(fa, fb, digits);
  }
  // ...
}
```

旁注：

- **base62（`0-9A-Za-z`）字符串**——`"a0" < "a1" < "a05" < "a1"` 这种字典序天然有"无限可插性"。
  浮点数 `(a+b)/2` 求中间值用不了几次就**精度爆炸**（IEEE 754 只有 52 位尾数，连续插 50 次就插不进去）；
  字符串拼接没这个问题
- **`if (ia === ib) return ia + midpoint(fa, fb, digits)`**——整数部分相同时只算小数部分中点。
  `midpoint("0", "1")` 不会返回不存在的"0.5"，会返回 `"0V"`（因为 base62 中 V 在 0 和 1 之间的中点位置）。
  **递归 midpoint 实现了无限插入**
- **`validateOrderKey`** 在每次 generate 都跑——防御性编程：上游传错 key 会立刻抛错，
  而不是产出无效 key 污染整个 z-order
- **comments 留存** "Vendored from https://www.npmjs.com/package/fractional-indexing"
  ([L1-L3](https://github.com/excalidraw/excalidraw/blob/c08be696/packages/fractional-indexing/src/index.ts#L1-L3))——
  Excalidraw 不直接依赖 npm 包，而是 vendor 进来。**避免上游消失或 license 变化的风险**，
  代价是要自己维护 322 行
- **CC0 license 标注** ([L2](https://github.com/excalidraw/excalidraw/blob/c08be696/packages/fractional-indexing/src/index.ts#L2))——
  vendor 时 license tracking 是工程纪律。任何打算 vendor 第三方代码的项目都该照搬

**怀疑 4**：协同两人**同时**在 A 和 B 之间插入元素，会得到什么？
两人各自调 `generateKeyBetween("a0", "a1")` 都得到相同的 `"a0V"`——**z-order 冲突**。
真实 CRDT 实现会在中点上加一个 random suffix（"jitter"）把概率冲突拉到天文小。
Excalidraw 这个 vendor 版本**没有 jitter**（grep 不到）。
**说明它不是严格 CRDT——它假设最后一刻只有一人在操作 z-order，或者后到的一边会被覆盖**。
这是一个"够用就好"的工程取舍，对白板应用 ok，但**别拿这个 fractional-indexing 当 Notion 协同编辑器用**。

## Hands-on（10 分钟跑通 + 改一处实验）

### 10 分钟跑通命令清单

```bash
# 1. 浅克隆（避免拉 21000+ commits 完整历史）
git clone --depth 1 https://github.com/excalidraw/excalidraw.git
cd excalidraw

# 2. monorepo 装依赖
yarn install                              # 顶层（yarn workspaces）

# 3. （单机最快路径）跑 vitest 看核心测试套
yarn test:typecheck                       # TS 类型检查
yarn test packages/element                # element 包测试（store/delta/...）

# 4. 跑应用 demo（浏览器体感）
yarn start                                # 起 vite dev，默认 http://localhost:3000
```

如果只想嵌入到自己的 React 应用（5 分钟）：

```bash
mkdir excalidraw-demo && cd excalidraw-demo
npm create vite@latest . -- --template react-ts
npm install @excalidraw/excalidraw
```

写 `src/App.tsx`：

```tsx
import { Excalidraw } from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'

export default function App() {
  return (
    <div style={{ height: '100vh' }}>
      <Excalidraw
        onChange={(elements, appState) => {
          console.log('elements:', elements.length, 'selected:', appState.selectedElementIds)
        }}
      />
    </div>
  )
}
```

```bash
npm run dev
```

打开 `http://localhost:5173` —— 一个完整 Excalidraw 嵌进你的应用。

### 改一处实验：量化 App.tsx 13053 行的"上帝组件"复杂度

实验目标：上一版笔记说 App.tsx 是"上帝模式 React 组件"——但**没数据**。
这次用 grep 给出可量化、可复现的证据，回答**"它真的违反 SRP 吗？还是只是大但有结构？"**。

实测命令（在 commit `c08be696` 上）：

```bash
cd /tmp/excalidraw-study
APP=packages/excalidraw/components/App.tsx

# 1. 总行数
wc -l "$APP"
# → 13053

# 2. 类方法数（private/public 方法 + 箭头函数 property）
grep -cE "^\s+private\s+\w+\s*=|^\s+private\s+\w+\(|^\s+public\s+\w+\(" "$APP"
# → 142

# 3. addEventListener 调用（DOM 事件订阅密度）
grep -cE "addEventListener\(" "$APP"
# → 36

# 4. pointer 事件处理函数
grep -c "private handlePointer\|private onPointer\|handlePointerDown\|handlePointerMove\|handlePointerUp\|onPointerDown\|onPointerMove\|onPointerUp" "$APP"
# → 49（注意：grep 计行不计实例，实际函数 ~10 个，每个被引用多次）

# 5. render() 方法数
grep -cE "render\(\)" "$APP"
# → 1
```

数字结果对照表：

| 指标 | 值 | 含义 |
|---|---|---|
| 总行数 | **13,053** | 单文件，远超 React 常规组件（< 500 行） |
| 类方法（含 property arrow） | **142** | **平均每 92 行就有一个方法**——不是巨型函数堆，是巨型类 |
| `addEventListener` 调用 | **36** | DOM 事件订阅的密度——pointer / wheel / keydown / dragover / paste / ... |
| pointer 处理函数引用 | **49** 行 | 鼠标 / 触摸 / pen 三种 input 全在这一类里 |
| `render()` 方法 | **1** | 只有一个 render——所有渲染逻辑在 JSX 里 |

**学到的硬事实（这次 hands-on 真实回答的）**：

1. **App.tsx 不是"巨型函数"，是巨型类**——142 个方法平均 92 行/方法，这个密度其实比业界平均（**100-150 行/类方法**）还略高。
   说明**单方法粒度合理，问题在于类本身职责过载**
2. **36 个 addEventListener 是真的 god-class 信号**——把 pointer / wheel / keydown / dragover / paste / online / offline /
   visibilitychange / fullscreenchange 全订阅到同一个组件实例。**任何一个事件路径出问题都要在 13k 行里找**
3. **唯一的 `render()` 反而合理**——React class component 的 render 只能有一个；问题不在 render，
   在 142 个方法围着 render 转
4. **viewport culling 在 `Renderer.ts:67-83`**——大画布性能不靠 React diff，靠
   [`isElementInViewport()`](https://github.com/excalidraw/excalidraw/blob/c08be696/packages/excalidraw/scene/Renderer.ts#L67-L83)
   过滤。这印证机制段说的"每帧全画 + viewport 过滤"模式
5. **commit 热点 top 1 也是 App.tsx**——227+275 commits 在它上面（最近 2k commits 中），
   说明每加 feature 都要碰它，**god-class 自我加强**

> 复现说明：本实验 commit 锚定 `c08be696`；浅克隆命令是
> `git clone --depth 1 https://github.com/excalidraw/excalidraw.git`，
> 然后 `git fetch --depth=2000` 拿到 2000 commits 的 surface 才能算 commit 热点。
> 不跑 vitest 是诚实的取舍——首次 yarn install 拉很慢；
> grep 给出的 142 / 36 / 49 数字已经回答了"App.tsx 复杂度到底有多真实"这个问题。

## 横向对比

### 维度对比表

| 维度 | tldraw | Figma | Miro | draw.io | **Excalidraw** | Notion canvas |
|---|---|---|---|---|---|---|
| 形态 | npm SDK + 站点 | SaaS（闭源） | SaaS | 站点 + selfhost | npm 包 + 站点 | SaaS（闭源） |
| 开源 | ✓ Apache | ✗ | ✗ | ✓ Apache | **✓ MIT** | ✗ |
| 风格 | 现代 + 多风格 | 高保真像素 | 商业模板 | 流程图工业风 | **手绘草图** | 块状文档嵌入 |
| 协同 | yjs CRDT | 闭源 OT | 闭源 | 弱（多人差） | **socket.io + AES-GCM E2E** | 闭源 |
| 撤销 | yjs Y.UndoManager | 闭源 | 闭源 | 浏览器 history | **HistoryDelta 反向 delta** | 闭源 |
| z-order 冲突 | yjs 自管 | – | – | 整数索引 | **fractional-indexing 字符串** | – |
| 嵌入到自己应用 | ✓（Tldraw SDK 一等公民） | ✗（Embed 是 iframe） | ✗ | ✓ | **✓（npm 包成熟）** | ✗ |
| 离线 | ✓ | 部分 | ✗ | ✓ | **✓（local-first，PWA）** | ✗ |

### "哲学不同的"竞品 → tldraw

旧版笔记把 Excalidraw 对比 tldraw 时只说"tldraw 更现代化"——这是表象。
**真正哲学不同**：

| 维度 | Excalidraw | tldraw |
|---|---|---|
| 抽象核心 | **自己的** Store/Snapshot/Delta（手写 ~3000 行） | **复用 yjs**（成熟 CRDT 库 ~10000 行） |
| 协同 | socket.io 中心化中继 + AES-GCM | yjs CRDT，可走 webrtc / websocket / 自定义 provider |
| z-order 冲突 | 自己 vendor fractional-indexing（无 jitter，假设 last-write-wins） | yjs Y.Array 内置严格 CRDT |
| 风险 | 自管 = 控制力强、bus factor 高 | 复用 yjs = 站在巨人肩上、被生态绑定 |
| 适合谁 | "我懒得学 yjs，手写 delta 我能改" | "我要严格 CRDT 一致性，可接受 yjs 学习曲线" |

**Excalidraw 是"NIH 但更可控"**——重写 CRDT 的部分功能，但能 100% 控制行为（如 jitter 的有无）。
**tldraw 是"站在 yjs 肩上"**——拿来主义，工程量小，但被 yjs 的生命周期绑定。

### 选型建议

| 你的场景 | 选 |
|---|---|
| "我需要一个嵌入到 React 应用的手绘风白板" | **Excalidraw**（旗舰用例，npm 包最成熟） |
| "我做 AI / SDK 优先的白板产品" | tldraw（SDK 设计更现代，AI workflow 一等公民） |
| "我需要严格 CRDT 一致性的协同（无丢失）" | tldraw + yjs（不要 Excalidraw 的 fractional-indexing） |
| "我要做高保真 UI 设计" | Figma（不要选任何手绘工具） |
| "我要企业级模板 + 工程审批流" | Miro（贵但完整） |
| "我只要一个能嵌进 markdown 的简单画图" | Excalidraw（5 分钟集成 vs tldraw 10 分钟） |
| "我需要 self-host + 数据完全在内网" | Excalidraw（MIT + portal 服务可自托管，加密在客户端做） |

## 与你当前工作的连接

### 今天就能用的部分

- **给 study 站加可嵌入手绘示意图**：写笔记时配示意图不要再上传 PNG——
  用 `<iframe src="https://excalidraw.com/...#room=...">` 嵌入或转成 `.excalidraw` JSON 存仓库。**git 友好 + 可编辑**
- **学 Store/Delta 模式**：当下任何带"撤销"的小工具——
  第一反应不应该是"存全量历史"，而是**"找到一个能算反向的 delta 表示"**。机制 2 的 `History.record + inverse` 就是模板
- **学三态 capture 调度**：`IMMEDIATELY / NEVER / EVENTUALLY` 这套 enum 设计可以**直接抄**到任何
  "用户操作可能是单步 / 多步 async / 远端推过来"的状态系统里
- **学"vendor 第三方代码 + 标 license"**：fractional-indexing 这种小但关键的依赖，
  vendor 进来手写 license 标记是好工程纪律，避免 npm 上游 unpublished 翻车（参考 left-pad 事件）

### 下个月能用的部分

- **给个人项目做带协同的小 demo**：可以直接 `npm i @excalidraw/excalidraw` 嵌一个白板——
  "AI 输出 + 用户在白板上画补充"是非常自然的交互模式，下次黑客松可以试
- **把"DurableIncrement vs EphemeralIncrement"模式抄到表单状态管理**：
  打字过程是 Ephemeral 不广播 / 不进 undo；blur 时变 Durable 进 undo + 提交。**这是表单协同的最佳实践**
- **学 portal 模式做 self-host 协同**：如果将来个人项目需要"低成本协同 + 加密"——
  抄 Excalidraw 的 socket.io + AES-GCM 方案比上 yjs 简单一个数量级
- **学 fractional-indexing 用法但不要直接抄**：理解原理（base62 字符串中点）+ 自己加 jitter，
  比直接复用 Excalidraw 的 vendor 更安全

### 不要用 Excalidraw 的部分

- **不要拿 Excalidraw 的 fractional-indexing 当严格 CRDT 用**：机制 4 怀疑 4 已经指出——**没有 jitter**。
  做 Notion 类协同编辑器请用 yjs / Automerge，不要复用这一段
- **不要把 App.tsx 当 React best practice 学**：13053 行 / 142 方法 / 36 个 addEventListener 是
  历史包袱，**不是值得抄的设计**。它能 work 是因为团队投入巨大，不代表你应该这样写
- **不要用 Excalidraw 处理 10000+ 元素**：canvas 2D + viewport culling 撑不到这个量级——
  极大画布场景请上 PixiJS / Konva（GPU 加速）
- **不要在严格隐私要求场景把 portal server 当"无知中继"**：机制 3 怀疑 3 已经指出——
  **元数据（流量分析）依然漏给服务器**。Tier-2 隐私场景请自托管 portal
- **不要用 Excalidraw 做高保真设计 / 数据可视化 / 流程图自动布局**——它不是这些场景的工具

## 自检（5 个具体到行号的怀疑问题）

1. **`store.ts:69` 的 `EVENTUALLY`**——具体哪个事件触发"懒提交合并"？
   freedraw 拖出一道线时是每一帧打 EVENTUALLY，那"合并到下个 IMMEDIATELY"的代码在哪？
   追到 `commit()` 内部（[L183-L201](https://github.com/excalidraw/excalidraw/blob/c08be696/packages/element/src/store.ts#L183-L201)），
   `flushMicroActions()` 是怎么把多个 EVENTUALLY 合并成一个 delta 的？
2. **`history.ts:123` `HistoryDelta.inverse(delta)`**——`StoreDelta` 在 `delta.ts` 2066 行里，
   `inverse` 对 `{ elements: ElementsDelta, appState: AppStateDelta }` 都怎么求反？
   元素 add/remove 反过来好理解，但**"修改属性 a:1 → a:2"的 inverse 需要原值**——
   原值存在 delta 里还是查 snapshot？
3. **`Portal.tsx:90-100` `_broadcastSocketData`**——加密失败（key 错 / Crypto API 不可用）会怎样？
   `await encryptData(...)` 没 try/catch，error 会冒到哪一层？是不是悄悄丢失？
4. **`fractional-indexing/src/index.ts:212` `generateKeyBetween`**——
   如果两人同时调相同的 `(a, b)` 得到同一个 key，**Excalidraw 怎么处理冲突？**
   去 `excalidraw-app/collab/Collab.tsx` 找 element merge 逻辑，看是 last-write-wins 还是别的
5. **`App.tsx` 13053 行 / 142 方法**——36 个 `addEventListener`，
   组件 unmount 时是不是 36 个都对应有 `removeEventListener`？grep 验证：
   `grep -c "removeEventListener" packages/excalidraw/components/App.tsx` 看数字对得上不

## 限制（诚实段）

- **本次 hands-on 是浅克隆 + `git fetch --depth=2000`**——commit 热点统计基于最近 2000 commits surface，
  仓库总 commits 21k+，更早期文件（如 `delta.ts` 11 commits）可能严重低估真实修改频次
- **没真实跑 vitest**——`yarn install` 在 monorepo 下首次很慢，本次实验只用 grep 量化复杂度。
  `yarn test:typecheck` / `yarn test packages/element` 是下一轮要跑的
- **没在两台机器上真实开 collab session 抓包验证 socket.io + AES-GCM**——
  机制 3 的论断基于源码静态阅读，没有 wireshark / DevTools Network 实证。**E2E 加密的"真实"只在抓包后能确认**
- **没读完 `delta.ts` 2066 行**——只看了 `store.ts` 调用面 + `history.ts` 用法面。
  `ElementsDelta.applyTo` / `inverse` 的真实实现在 delta.ts 里，自检问题 2 就因为这个空白
- **没读 `App.tsx` 13053 行**——这个限制是**主动选择**：13k 行硬读没意义，
  改用 grep 量化复杂度的研究方法。但也意味着具体 input handler 的实现细节（如双指缩放）笔记里没覆盖

## 附录 · 宣传 vs 代码现实

| # | README / 网站宣传 | 代码现实 |
|---|---|---|
| 1 | "End-to-end encrypted" | 真。AES-GCM 128，roomKey 在 URL hash 不发服务器（[`encryption.ts`](https://github.com/excalidraw/excalidraw/blob/c08be696/packages/excalidraw/data/encryption.ts) + [`data/index.ts:163`](https://github.com/excalidraw/excalidraw/blob/c08be696/excalidraw-app/data/index.ts#L163)）。**但元数据（谁连谁、ciphertext 大小）服务器仍可见**——traffic analysis 攻击没防 |
| 2 | "Hand-drawn style" | 真。但底层是 [Rough.js](https://roughjs.com) 加随机性，不是真的"手画路径录制"——任何想要"复刻这种风格"的人需要去 Rough.js 而不是 Excalidraw 仓库 |
| 3 | "Local-first" | 真。`excalidraw-app` 是 PWA，离线可用。**但协同模式必须连 portal server**——离线 + 协同同时要不可能，README 没明写 |
| 4 | "Shareable links" | 真。link 包含 roomKey 即"任何拿到 link 的人都能解密"——这是 feature 也是隐患：**link 一旦被截图分享，加密就失效**。文档没明确警告 |
| 5 | "13k stars 的工业级 npm 包" | 真但有保留。**npm 包是 `packages/excalidraw/`，不包含协同**——协同代码在 `excalidraw-app/`，使用 npm 包嵌入要自己实现协同层。这一点容易让人误以为"npm 包开箱即用协同" |

## 延伸阅读

| # | 资源 | 回答什么问题 |
|---|---|---|
| 1 | [`packages/element/src/delta.ts`](https://github.com/excalidraw/excalidraw/blob/c08be696/packages/element/src/delta.ts) (2066 行) | `ElementsDelta.applyTo` / `inverse` 的真实实现——回答自检 2 |
| 2 | [`packages/excalidraw/components/App.tsx`](https://github.com/excalidraw/excalidraw/blob/c08be696/packages/excalidraw/components/App.tsx) 的 `componentDidMount` / `componentWillUnmount` 段 | 36 个 addEventListener 是否都被对应清理——回答自检 5 |
| 3 | [Tldraw 源码](https://github.com/tldraw/tldraw) | 同生态位 + yjs CRDT 的另一种实现哲学，对照 Excalidraw 自管 delta |
| 4 | [Rough.js](https://github.com/rough-stuff/rough) | "手绘风"渲染的真实来源——20% 解释 Excalidraw 的视觉差异 |
| 5 | [Yjs 文档](https://docs.yjs.dev) | 严格 CRDT 是怎么处理 z-order / 文本协同的——和 fractional-indexing 互补 |
| 6 | ["How Figma's multiplayer technology works"](https://www.figma.com/blog/how-figmas-multiplayer-technology-works/) | 中央集权协同的代价——和 Excalidraw 的"端到端 + 中继"形成哲学对比 |
| 7 | [excalidraw/excalidraw-room (portal server 源码)](https://github.com/excalidraw/excalidraw-room) | 协同后端实现——验证"无知中继"论断的最后一块拼图 |

---

**升级日期**：2026-05-28（v1 状元篇）
**总行数**：见 footer（git wc -l）
**启用工具**：源码 `git clone --depth 1` + `git fetch --depth=2000` 拿 commit 热点 + GitHub API 抓 stars/contributors + PIL 画三轨架构图 + cwebp q=80 压 webp + grep 量化 App.tsx 复杂度
**研究方法升级**：上一版"WebFetch + 简单读源"→ 本版浅克隆 + `git fetch --depth=2000` commit 热点 + 行号级 permalink + 量化复杂度实验
**关键修正**：v0 笔记把协同写成 "P2P + WebRTC"——读 [`Portal.tsx:23`](https://github.com/excalidraw/excalidraw/blob/c08be696/excalidraw-app/collab/Portal.tsx#L23) 后修正为 "socket.io 中心化中继 + AES-GCM E2E"。**这是浅读 README 的典型陷阱**
**对照 method.md 状元篇 Checklist v1**：核心信息表 ≥8 字段 ✓ / Why 含 manifesto 引用 ✓ / 仓库地形 + 心脏文件 + commit 热点 ✓ /
1 张架构图 webp ✓ / 4 段代码精读含 GitHub permalink + 旁注 ≥5 + 怀疑 ≥1 ✓ / 改一处含数字结果（142/36/49）✓ /
横向对比 8 维 + 哲学不同竞品 tldraw ✓ / 三段连接每段 ≥4 子弹 ✓ / 自检 5 个具体行号问题 ✓ / 限制 5 条 ✓ /
宣传 vs 现实 5 行 ✓
