---
title: kbar — 用 action 树驱动的命令栏
来源: https://github.com/timc1/kbar
日期: 2026-08-27
分类: 前端 / 命令面板
难度: 中级
description: React 命令栏：action 对象进 store，空搜看根节点，输入后用 Fuse 搜整棵子孙树。
difficulty: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/timc1/kbar
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 26ec0f49f92ab34fa6ab59392782d56020f28098
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 1.0.0
---

## 是什么

kbar 是 Tim Chang 做的 **React 命令栏**。日常类比：把应用里能做的事登记成一张动作表——每条有名字、快捷键、可选父子关系——按 `Cmd+K` 打开后，先看根动作，打字再在整棵子孙树里搜。

你写：

```tsx
import { KBarProvider } from "kbar"

<KBarProvider actions={[
  { id: "blog", name: "Blog" },
  { id: "posts", name: "Search Posts", parent: "blog" },
]}>
  <App />
</KBarProvider>
```

固定 1.0.0 用 `ActionInterface` 把数组收成 id → `ActionImpl` 的 store。父节点必须先于子节点注册，否则 `tiny-invariant` 直接抛。打开、搜索和选中都走 `query`，而不是让每条 UI 自己往 root 报名。

## 为什么重要

不理解“动作是数据、UI 是投影”，就解释不了：

- 为什么路由页可以用 `useRegisterActions` 挂上再卸下一批命令
- 为什么空搜索只显示根动作，一开始打字却突然出现深层子动作
- 为什么带 `perform` 的动作回车后会关掉栏，只有 `parent` 的动作却会钻进去
- 为什么它和 [[cmdk]] 看起来都是命令菜单，却不能互换过滤实现

## 核心要点

固定 1.0.0 的执行链可以拆成五步：

1. **登记**：`KBarProvider` 的 `actions` 或 `query.registerActions` 写入 store。`keywords` 会附上 section 名，便于按分组搜。
2. **开关**：默认快捷键 `$mod+k`（`tinykeys`）。`Escape` 进入 `animatingOut`，结束后 `currentRootActionId` 回到 `null`。
3. **候选**：空搜索只收根动作（或当前 root 的直接孩子）；有搜索则拍平子孙，交给 Fuse。
4. **打分**：Fuse 权重 `name` 0.5、`keywords` 0.3、`subtitle` 0.2，`threshold` 0.2，并且 `useTokenSearch` + `tokenMatch: "all"`。注释仍写 commandScore，实现却是 `1 / (fuseScore + 1)` 再加 `action.priority`。
5. **执行**：有 `perform` 就跑 `Command.perform` 并 toggle 关闭；没有 `perform` 只切 `currentRootActionId` 并清空搜索。`KBarSearch` 在子层空搜索按 Backspace 回到父节点。

结果列表用 `@tanstack/react-virtual` 虚拟化；分组名是结果数组里的 `string`，键盘会跳过它们。历史是 `enableHistory` 可选：`perform` 若返回函数，该函数当作 negate，响应 Cmd+Z / Cmd+Shift+Z。

## 实践示例

### 案例 1：根动作 + 子动作

```tsx
<KBarProvider actions={[
  { id: "theme", name: "Theme" },
  { id: "dark", name: "Dark", parent: "theme", perform: () => setTheme("dark") },
]}>
  <KBarPortal>
    <KBarPositioner>
      <KBarAnimator>
        <KBarSearch />
        <RenderResults />
      </KBarAnimator>
    </KBarPositioner>
  </KBarPortal>
</KBarProvider>
```

选 `Theme` 不会关栏，只把 root 设成 `theme`；选 `Dark` 才执行并关闭。

### 案例 2：页面级注册

```tsx
useRegisterActions([
  { id: "save", name: "Save", shortcut: ["s"], perform: () => save() },
], [save])
```

effect 结束会 `unregister`。`shortcut` 只在栏**未打开**时由 `InternalEvents` 监听；更长的组合优先注册，避免 `t s` 和单独的 `s` 连续误触。

### 案例 3：可撤销动作

```tsx
<KBarProvider options={{ enableHistory: true }} actions={[
  {
    id: "rename",
    name: "Rename",
    perform: () => {
      const prev = title
      setTitle("New")
      return () => setTitle(prev)
    },
  },
]} />
```

没开 `enableHistory` 或 `perform` 不返回函数时，不会写入 undo 栈。

## 踩过的坑

1. **先注册孩子再注册父亲**：`ActionInterface.add` 要求 parent 已在 store。顺序反了会 invariant。
2. **把 1.0.0 仍写成 command-score**：源码注释留着旧名，匹配器是 Fuse，且按词 AND。
3. **在输入框聚焦时指望全局 shortcut**：`shouldRejectKeystrokes` 会丢掉 input/textarea/textbox 上的快捷键。
4. **以为箭头会循环**：`KBarResults` 到顶/底停住；Ctrl+P / Ctrl+N 移动，没有 cmdk 那种默认 j/k。
5. **把 `Priority.HIGH` 想成很大的数**：枚举是 `1 / 0 / -1`，再和 Fuse 转换分相加。

## 适用 vs 不适用场景

**适用**：

- 需要全局 `$mod+k`、嵌套命令、页面级注册和可选 undo 的 React 17/18/19 应用
- 动作是数据、渲染用 `onRender`，而不是每条命令都写成 JSX 子组件

**不适用**：

- 想让条目自己长在 JSX 树里、过滤时仍保留复合组件——那是 [[cmdk]]
- 不能接受 Fuse、Radix portal 与 TanStack Virtual
- 需要默认循环选中或 cmdk 那种 DOM 重排排序

## 固定版本边界

- 本文绑定 `timc1/kbar@26ec0f49...`，Git tag、npm `1.0.0` 与 `gitHead` 一致。
- peer 为 React 17/18/19；运行时依赖 Fuse、`@tanstack/react-virtual`、`@radix-ui/react-portal`、`fast-equals`、`tiny-invariant`。
- 未安装依赖、未跑 Jest、未测 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **命令可以是带父子的数据**——UI 只投影当前 root 或 Fuse 命中。
2. **空搜和有搜不是同一份列表**——空搜保分层，有搜拍平再匹配。
3. **执行和导航要分开**——`perform` 关栏；无 `perform` 只改 root。
4. **历史是返回值协议**——只有返回 negate 函数且打开 `enableHistory` 才可撤销。

## 应用型自测

1. 空搜索时，挂在 `blog` 下面的子动作会出现在根列表吗？
2. 回车一个没有 `perform`、但有孩子的动作，栏会关掉吗？
3. 未设 `enableHistory` 时，`perform` 返回的函数会进入 undo 栈吗？

检查点：

1. 不会；空搜只收没有 parent 的根动作（或当前 root 的直接孩子）。
2. 不会；实现只 `setCurrentRootAction` 并清空搜索。
3. 不会；`Command` 在没有 history manager 时直接返回。

## 延伸阅读

- 固定源码：[timc1/kbar](https://github.com/timc1/kbar) —— 本文绑定 `26ec0f49f92ab34fa6ab59392782d56020f28098`
- [[cmdk]] —— 复合组件 + command-score，无内置全局快捷键
- [[radix-ui]] —— portal 底座
- [[react]] —— peer 17/18/19

## 关联

- [[cmdk]] —— 同赛道；过滤和数据模型相反
- [[radix-ui]] —— `KBarPortal` 用 Radix portal
- [[react]] —— peer 含 17
- [[fzf]] —— 终端模糊选择，不是 React action 树
