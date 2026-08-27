---
title: Sonner — 带堆叠视口的意见式 React toast
description: 命令式 toast 发布到单例 Observer，由 Toaster 订阅并维持堆叠视口。
来源: https://github.com/emilkowalski/sonner
日期: 2026-08-27
分类: 前端组件库
难度: 中级
difficulty: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/emilkowalski/sonner
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 6739aca5f668a33a4fd1d2fd9f758dff95c57466
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 2.0.8
---

## 是什么

Sonner 是一个意见式的 React toast。日常类比：前台只有一个公告栏；谁都可以往栏上贴纸条，真正把纸条钉上墙、决定露出几张、何时撕掉的，是那个必须挂在树上的 `Toaster`。

```tsx
import { Toaster, toast } from "sonner"

export function App() {
  return (
    <>
      <Toaster />
      <button onClick={() => toast("Saved")}>Save</button>
    </>
  )
}
```

`toast()` 只把事件交给进程内单例 `ToastState`。没有订阅者时，纸条先进历史；`Toaster` 挂上后会回放仍未 dismiss 的条目。固定 2.0.8 自带 `src/styles.css`，并用 `data-sonner-*` 驱动堆叠、主题和滑动。

## 为什么重要

不读这条订阅链，就解释不了：

- 为什么在 `Toaster` 上方的 `useEffect` 里先 `toast()`，条子不会丢
- 为什么默认只看见 3 条，但历史里可能还留着更多
- 为什么同一 `id` 有时是更新，有时是全新 toast
- 为什么 `toast.promise` 的返回值既可能是 id，又可能只剩 `{ unwrap }`

## 核心要点

固定版本可以拆成四段：

1. **命令与渲染分离**：`toast.success` / `error` / `info` / `warning` / `loading` / `message` / `custom` / `promise` / `dismiss` 都写进 `Observer`。`Toaster` 用 `subscribe` 把事件刷进 React state，再用 `flushSync` 避开批量更新。

2. **身份与生命周期**：没有合法 `id` 时用递增计数器。仍在场的同 id 会合并字段；已经被 dismiss 的同 id 会丢掉旧 props 再新建，避免 `action` 之类泄漏。尚未交给订阅者的 dismiss 会被 `cancelAnimationFrame` 取消，用来扛 StrictMode 双 effect。

3. **视口不是全量列表**：默认 `visibleToasts=3`、`duration=4000`、`gap=14`、`position=bottom-right`。`index + 1 <= visibleToasts` 才 `data-visible`。hover / 交互 / `document.hidden` 会暂停自动关闭；`loading` 或 `duration === Infinity` 不走超时。

4. **Promise 有自己的结算表**：`loading` 文案可缺省。成功路径里，React 元素当普通消息；`Response` 且 `!ok`、或值为 `Error`，走 error；否则用 `success`。没有可展示结果时会 dismiss 掉仍停在 loading 的条子。`unwrap()` 把原始 resolve/reject 交回调用方。

## 实践示例

### 案例 1：命令式成功提示

```tsx
toast.success("Profile updated", { description: "Name saved" })
```

这是最常见入口：`type` 变成 `success`，标题进 `title`。没有 `Toaster` 时它仍进入 `ToastState.toasts`，等订阅者回放。

### 案例 2：同一 id 先 loading 再结算

```tsx
const id = toast.loading("Saving")
// 稍后
toast.success("Saved", { id })
```

`create` 找到未 dismiss 的同 id 就合并。`toast()` / `message()` / `custom()` 会把 `type` 重置成 `undefined`，避免 loading 转普通/自定义后还留着转圈。

### 案例 3：promise 与 unwrap

```tsx
const result = toast.promise(saveUser(), {
  loading: "Saving…",
  success: (user) => `Saved ${user.name}`,
  error: "Save failed",
})
await result.unwrap()
```

`unwrap` 不改变屏幕上的 success/error 文案，只把原始 Promise 结果交给 await。没提供 `data` 时 `promise()` 直接返回 `undefined`。

## 踩过的坑

1. **把 npm `2.0.8` 的 `gitHead` 当成源码**：registry 指向 `ecce1841...`，该提交的 `package.json` 仍是 `2.0.7`。本文绑定 GitHub tag `v2.0.8` 的 `6739aca5...`。
2. **以为看不见就是删掉了**：超出 `visibleToasts` 的条目还在列表里，只是 `data-visible=false`。
3. **复用已 dismiss 的 id 却期望旧按钮还在**：dismiss 后再用同一 id 会当新 toast，不合并旧 `action` / `cancel`。
4. **给 loading toast 配自动关闭**：`type === 'loading'` 或 `toast.promise` 仍处于 loading 时，超时 effect 直接 return。
5. **多 Toaster 却不设 `id` / `toasterId`**：无 `toasterId` 的 toast 只进没有 `id` 的 `Toaster`。

## 适用 vs 不适用场景

**适用**：

- 已经在 [[react]] 18/19 里要一条意见式、带默认样式的通知栏
- 需要堆叠视口、滑动关闭、`theme` / `richColors` 这类产品外观
- 和 [[shadcn-ui]] 文档里的 Sonner 包装一起用，但仍要读本库合同

**不适用**：

- 只要 reducer/headless、自己画 DOM → 看 [[react-hot-toast]] 的 `headless` 入口
- 不能接受把 CSS 打进包、或不能接受 `document.hidden` / pointer 手势这些浏览器假设
- 需要把「已验证运行、已测 bundle」当成事实——本轮没有执行上游测试

## 固定版本边界

- 本文绑定 `emilkowalski/sonner@6739aca5...`，tag 与 `package.json` 均为 `2.0.8`。
- npm latest `2.0.8` 的 `gitHead=ecce1841...` 在仓库可达，但该对象自报 `2.0.7`；升级前需重新核对 provenance。
- peer 为 React / ReactDOM `^18 || ^19`（含 rc）；`@types/react` 可选。
- 默认常量：`VISIBLE_TOASTS_AMOUNT=3`、`TOAST_LIFETIME=4000`、`SWIPE_THRESHOLD=45`、`TIME_BEFORE_UNMOUNT=200`、`MAX_HISTORY_SIZE=100`。
- 本文未安装依赖、运行 Playwright、测量 bundle 或核对生产 CSS 压缩结果，状态保持 `UNVERIFIED`。

## 学到什么

1. **命令式 API 仍然需要一个渲染订阅者**——`toast()` 不是魔法 portal，只是发布。
2. **同 id 的语义取决于是否还在场**——更新、重建、取消未送达的 dismiss 是三条不同路径。
3. **视口策略和历史策略不是一回事**——看见 3 条、历史最多 100 条、loading 永不超时，要分开记。
4. **Promise toast 的返回值是适配器**——屏幕文案和 `unwrap()` 的业务结果不要混成一个对象。

## 应用型自测

1. 组件树里 `Toaster` 还没挂上，先在父级 `useEffect` 调 `toast("hi")`。条子会丢吗？
2. 一条 toast 已被 dismiss，立刻用同一 `id` 再 `toast.success("ok", { id })`。旧的 `action` 还会在吗？
3. `toast.promise(p, { success: "done" })` 没有 `loading` 字段。返回值一定是可赋值的 id 吗？

检查点：

1. 不会丢。`subscribe` 会回放 `getActiveToasts()`。
2. 不会。dismissed id 会当新 toast，不合并旧 props。
3. 不一定。没有 loading 时可能只得到 `{ unwrap }`。

## 延伸阅读

- 文档：[sonner.emilkowal.ski](https://sonner.emilkowal.ski/)
- 固定源码：[emilkowalski/sonner](https://github.com/emilkowalski/sonner) —— 提交 `6739aca5f668a33a4fd1d2fd9f758dff95c57466`
- [[react-hot-toast]] —— 同赛道：reducer store + headless 导出
- [[react]] —— peer 运行时
- [[shadcn-ui]] —— 常见的复制粘贴包装层

## 关联

- [[react-hot-toast]] —— 命令式 toast 的另一条实现：dismiss/remove 两段、默认 success 2s
- [[react]] —— `'use client'` + `flushSync` 都建立在 React 18/19 上
- [[shadcn-ui]] —— 文档常把 Sonner 当通知原语
- [[radix-ui]] —— 对照：Radix 管 Dialog/Toast 原语行为，Sonner 管意见式产品外观
- [[next-js]] —— App Router 下要把 `Toaster` 放进 client 边界

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[react-hot-toast]] —— react-hot-toast — 可 headless 的 reducer 式 React 通知
