---
title: react-hot-toast — 可 headless 的 reducer 式 React 通知
description: 按 toasterId 分桶的 reducer store，dismiss 与 remove 分两段，并提供 headless 导出。
来源: https://github.com/timolins/react-hot-toast
日期: 2026-08-27
分类: 前端组件库
难度: 中级
difficulty: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/timolins/react-hot-toast
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 3a870ed99ff43848c5ad66ce56ee346dbbf3633e
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 2.6.0
---

## 是什么

react-hot-toast 把通知做成一块按 `toasterId` 分桶的内存 store。日常类比：仓库里有多条传送带；`toast()` 往某条带上放包裹，`Toaster` 只负责把自己那条带上的包裹画出来。默认带子叫 `default`。

```tsx
import toast, { Toaster } from "react-hot-toast"

export function App() {
  return (
    <>
      <Toaster />
      <button onClick={() => toast.success("Saved")}>Save</button>
    </>
  )
}
```

固定 2.6.0 同时导出带样式的 `Toaster` / `ToastBar`（用 `goober` 写 CSS）和 `react-hot-toast/headless`（只有 `toast`、`useToaster`、`useToasterStore`）。peer 是 React >=16。

## 为什么重要

不读 reducer 和两段卸载，就解释不了：

- 为什么 `toast.dismiss` 之后条子还在 DOM 里停约 1 秒
- 为什么 success 默认比 blank/error 消失得快
- 为什么 `toast.promise` 返回的是 Promise 而不是 id
- 为什么第二个 `Toaster` 必须带 `toasterId`，否则两个人抢同一条传送带

## 核心要点

主链是 **create → dispatch → subscribe → 定时 dismiss → 延迟 remove**：

1. **UPSERT**：`createToast` 填 `createdAt`、`visible: true`、`dismissed: false`、默认 `role="status"`。有 id 就 UPDATE，没有就 ADD；ADD 后 `slice(0, toastLimit)`，默认上限 20。

2. **分桶 store**：`memoryState[toasterId]` 各有自己的 `toasts` / `pausedAt`。`toast.dismiss(id)` 不带 `toasterId` 时走 `dispatchAll`；带了就只打一口锅。用已有 toast 的 id 更新时，`getToasterIdFromToastId` 能找回原来的桶。

3. **时长按 type 分**：`blank/error/custom=4000`，`success=2000`，`loading=Infinity`。`useToaster` 用 `duration + pauseDuration - (now - createdAt)` 算剩余；容器 `mouseEnter` 记 `pausedAt`，离开时把间隔累加进每条 `pauseDuration`。

4. **dismiss 与 remove 不是一步**：dismiss 只把 `visible=false`。`useToaster` 再排队 `removeDelay`（默认 1000，也等于 `REMOVE_DELAY`）后 `REMOVE_TOAST`。`toast.remove` / `removeAll` 跳过动画直接删。

## 实践示例

### 案例 1：默认 success 会先走

```tsx
toast.success("Saved")
toast.error("Failed")
```

固定测试按 `defaultTimeouts.success` 推进后，success 先离开，error 仍在。不要用「所有类型 4 秒」来记。

### 案例 2：promise 更新同一条

```tsx
await toast.promise(save(), {
  loading: "Saving…",
  success: (row) => `Saved ${row.id}`,
  error: "Save failed",
})
```

实现先 `toast.loading`，再在 then/catch 里用同一 id 调 `success` / `error`。缺 `success` 或 `error` 文案时改为 `dismiss`。返回值是那个 Promise，不是 toast id。

### 案例 3：第二条 Toaster

```tsx
<Toaster />
<Toaster toasterId="audit" position="bottom-right" />

toast("Inbox")
toast("Audit trail", { toasterId: "audit" })
```

无 `toasterId` 的命令进 `default`。`toast.dismissAll("audit")` 只清第二口锅；`toast.dismissAll()` 清全部。`toast.removeAll("audit")` 立即从 DOM 拿掉，不等 1 秒。

## 踩过的坑

1. **把 `dismiss` 当成立刻卸载**：DOM 还要等 `removeDelay`。测试里必须再垫一段 `REMOVE_DELAY`。
2. **拿 `toast.promise` 的返回值去 `dismiss`**：返回的是业务 Promise。要关这条，先自己留着 loading id，或在 msgs 里省略 success/error 让它 dismiss。
3. **两个 `<Toaster />` 都不设 id**：它们订阅同一个 `default` 桶，会画两份。
4. **把 package 里的 5.5 KB `size-limit` 写成实测体积**：那是仓库自己的限额配置，本轮未跑 size-limit，也未打包。
5. **npm `2.6.0` 没有 `gitHead`**：只能用 GitHub 注解 tag `v2.6.0` 剥出的 commit `3a870ed9...` 做 provenance。

## 适用 vs 不适用场景

**适用**：

- 要一条很小的命令式 API，并接受默认 `ToastBar` 外观
- 想自己画 UI：走 `headless` + `useToaster` / `children` render prop
- 一页里要几口互不干扰的通知锅

**不适用**：

- 要 Sonner 那种堆叠视口、滑动阈值和自带 `styles.css` → [[sonner]]
- 不能接受 `goober` 运行时样式，或不能接受 React >=16 的 peer 范围
- 需要「已跑 Jest / 已测体积」的结论——本轮只做静态阅读

## 固定版本边界

- 本文绑定 `timolins/react-hot-toast@3a870ed9...`，注解 tag `v2.6.0` 指向该 commit，`package.json` 为 `2.6.0`。
- npm `2.6.0` 未提供 `gitHead`。
- 运行时依赖 `goober` 与 `csstype`；`exports` 分 `.` 与 `./headless`。
- 默认：`TOAST_LIMIT=20`、`REMOVE_DELAY=1000`、`Toaster` 默认 `position=top-center`、容器偏移 16px。
- `prefers-reduced-motion` 的匹配结果会被缓存，本轮未在浏览器里验证缓存失效。
- 本文未安装依赖、运行 Jest、执行 size-limit 或测量 gzip，状态保持 `UNVERIFIED`。

## 学到什么

1. **内存 reducer 可以当跨树事件总线**——不必 Context 包整棵树，但全局单例要靠测试里 `toast.remove()` 隔离。
2. **可见性和存在性要拆开**——先 `visible=false` 做离场，再 `REMOVE` 才符合动画。
3. **多 Toaster 是分桶，不是自动分流**——`toasterId` 是显式地址。
4. **promise 助手更像适配器**——它复用 loading id，返回值服务业务 await，不服务 UI 句柄。

## 应用型自测

1. `toast.success("ok")` 在默认时长到期后，DOM 会立刻消失吗？
2. `toast.promise(p, { loading: "…" })` 没有 `success`。p resolve 后屏幕上还留着 loading 吗？
3. 两个 `<Toaster />` 都没写 `toasterId`，调用一次 `toast("hi")`。会出现几条？

检查点：

1. 不会。先 dismiss，再等默认 1000ms remove。
2. 不会留着。缺 success 文案时走 `dismiss`。
3. 两条。它们订阅同一 `default` 桶。

## 延伸阅读

- 文档：[react-hot-toast.com](https://react-hot-toast.com/)
- 固定源码：[timolins/react-hot-toast](https://github.com/timolins/react-hot-toast) —— 提交 `3a870ed99ff43848c5ad66ce56ee346dbbf3633e`
- [[sonner]] —— 同赛道：Observer + 意见式堆叠视口
- [[react]] —— peer 运行时
- [[radix-ui]] —— 若要的是可访问原语而不是意见式通知条

## 关联

- [[sonner]] —— 另一条命令式 toast：单例 Observer、默认看见 3 条、自带 CSS
- [[react]] —— `useStore` 仍手写 listener，注释写明尚未切 `useSyncExternalStore`
- [[shadcn-ui]] —— 产品层更常接 Sonner；本库仍是 headless 对照
- [[framer-motion]] —— 若自己做离场，本库只提供 `visible` / `removeDelay`，不绑定动画引擎
- [[next-js]] —— 多 Toaster 时要把 `toasterId` 放进共享 client 边界

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[sonner]] —— Sonner — 带堆叠视口的意见式 React toast
