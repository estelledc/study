---
title: Radix UI — unstyled accessible 的 React 组件原语库
来源: 'https://github.com/radix-ui/primitives'
日期: 2026-05-30
分类: 前端组件库
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/radix-ui/primitives
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 9aebdd45abd447b84092ecf20f8bcd27f2398c36
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 1.6.7
---

## 是什么

Radix UI Primitives 是一套**无展示样式、按 WAI-ARIA pattern 实现行为**的 React 原语。日常类比：装修毛坯房——水电、承重和防火门先按规范做好，你只负责刷漆和家具。

固定 `1.6.7` 同时提供两条入口：继续按 `@radix-ui/react-dialog` 这种分包安装；或装 umbrella 包 `radix-ui`，再 `import { Dialog } from "radix-ui"`。行为合同在两边相同，只是分发粒度不同。[[shadcn-ui]] 的 `new-york-v4` 模板已经改走后一种。

## 为什么重要

不理解这套原语，下面这些事都对不上号：

- 为什么 shadcn 能把“复制一段组件源码”做成主流分发，却不必自己重写焦点和 Esc
- 为什么 Dialog 看起来像四个组件，实际是 Presence / Portal / FocusScope / DismissableLayer 的接力
- 为什么同一个 `open` API 既能让父组件接管，也能让原语自己记状态
- 为什么 `asChild` 能换掉默认 `<button>`，却不会叠出双层 DOM

## 核心要点

主链可以拆成五步，Dialog 是最完整的样本：

1. **Root 用 `useControllableState` 决定状态归属**：`open !== undefined` 走受控，否则用 `defaultOpen`。受控路径里 `setOpen` 立刻调 `onOpenChange`；非受控路径先 `useState`，再在 effect 里通知。DEV 下中途切换受控/非受控会警告。

2. **Portal + Presence 决定挂载时机**：打开时把内容逃出父级 overflow；关闭时 Presence 的 mounted / unmountSuspended / unmounted 状态机等 CSS 退场动画结束再卸节点。`data-state="open|closed"` 就是给这段动画看的。

3. **FocusScope 管焦点**：modal 打开时 trap + loop，关闭后把焦点还回 Trigger。

4. **DismissableLayer 管退出**：Esc、pointerdown-outside、focus-outside。Overlay 会登记成 `dismissableSurfaces`，即使你在 Overlay 上 `stopPropagation`，点遮罩仍能关。

5. **Slot / `asChild` 换 root 节点**：`Primitive.button` 默认渲染 `<button>`；`asChild` 时 `createSlot` 把事件、ARIA 和 ref merge 到唯一子元素。多个有效子节点会直接 throw，不再静默包一层。

`createContextScope` 给每个实例独立的 `__scope*`，嵌套 Dialog/Popover 才不会共用同一份 open 状态。`philosophy.md` 把“一组件一 DOM、零展示样式、有限 `data-state`”写成硬原则，后面这些零件都从这里推出来。

## 实践示例

### 案例 1：最小 Dialog（分包入口）

```tsx
import * as Dialog from "@radix-ui/react-dialog";

export function Modal() {
  return (
    <Dialog.Root>
      <Dialog.Trigger>打开</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay />
        <Dialog.Content>
          <Dialog.Title>提示</Dialog.Title>
          <Dialog.Description>行为已经由原语接好。</Dialog.Description>
          <Dialog.Close>关闭</Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

Trigger 自带 `aria-haspopup="dialog"`；Content 的 `aria-labelledby` 只在 Title 真的挂载时出现。固定版本里 `WarningProvider` 已是 noop，缺 Title 不会再靠 dev `console.warn` 兜底。

### 案例 2：umbrella 包 + asChild

```tsx
import { Dialog } from "radix-ui";

<Dialog.Trigger asChild>
  <MyButton variant="primary">打开</MyButton>
</Dialog.Trigger>
```

渲染结果是 `MyButton` 自己，不是 `<button><MyButton/></button>`。`onClick`、`aria-expanded` 和 ref 都 merge 到你的按钮上。

### 案例 3：自己接受控双模

```tsx
import { useControllableState } from "@radix-ui/react-use-controllable-state";

export function MyTabs({ value, defaultValue, onValueChange }) {
  const [active, setActive] = useControllableState({
    prop: value,
    defaultProp: defaultValue ?? "tab1",
    onChange: onValueChange,
    caller: "MyTabs",
  });
  return <button onClick={() => setActive("tab2")}>{active}</button>;
}
```

`caller` 只影响 DEV 警告文案。受控时 `setActive` 同步进 `onValueChange`；非受控时要等下一轮 effect。

## 踩过的坑

1. **把缺 Title 当成“库会警告你”**：固定 1.6.7 只是不写 `aria-labelledby`。a11y 仍要自己用 axe 一类工具验。
2. **受控/非受控来回切**：同一 `setValue`，受控立即拿到新值，非受控晚一帧；表单提交读 value 时会踩到这个时机差。
3. **给 Slot 塞两个根节点**：`createSlot` 会 throw，不会再默默包一层 div。
4. **在 Overlay 上 `stopPropagation` 指望挡住关闭**：Overlay 已登记为 dismiss surface，点遮罩仍会 dismiss。
5. **把 umbrella 包和分包版本号当成同一个数**：`radix-ui@1.6.7` 与 `@radix-ui/react-dialog@1.1.23` 同提交但不同版本字段，升级要对包名。

## 适用 vs 不适用场景

**适用**：

- 自建设计系统，只想买下 ARIA / 焦点 / 键盘，样式自己写
- 已经在用 [[shadcn-ui]] 或直接依赖 `radix-ui` umbrella 的项目
- 需要嵌套浮层、modal 滚动锁、退场动画后再卸载

**不适用**：

- 只要一个原生 `<dialog>` 或简单折叠，原语树偏重
- 已锁定 MUI / Ant Design 的视觉和 token，切换等于重写样式层
- 想要 hook 返回 props、自己拼 DOM——那是 React Aria 的模型
- 需要把“某个 Dialog 一定是 N kb gzip”写成预算——本文未测 bundle

## 固定版本边界

- 本文绑定 `radix-ui/primitives@9aebdd45...`，即 annotated tag `1.6.7` 的解引用提交。
- umbrella 包 `radix-ui` 版本为 `1.6.7`；同提交中 `@radix-ui/react-dialog` 为 `1.1.23`。个别子包在 npm 上的更新版本不自动适用本文。
- peer 为 React / ReactDOM `^16.8 || ^17 || ^18 || ^19`。Slot 同时兼容 React 18 的 `element.ref` 与 React 19 的 `props.ref`。
- 本文未安装依赖、未跑 vitest / Playwright、未测 bundle 或屏幕阅读器，状态保持 `UNVERIFIED`。

## 学到什么

1. **无样式不是“没做完”，是把行为合同从视觉里拆出来**
2. **一组件一 DOM 才能让 `asChild` 成立**——允许多层 wrapper，调用方就换不了 root tag
3. **受控双模是 hook 级一等公民**，不是每个原语各写一套 if
4. **复杂浮层是零件接力**：Presence 管寿命，Portal 管位置，FocusScope 管焦点，DismissableLayer 管退出

## 应用型自测

1. 固定 1.6.7 里，Dialog 不写 `Title`，Content 还会带 `aria-labelledby` 吗？dev 模式一定会 warn 吗？
2. 非受控 Dialog 里调用 `setOpen(true)`，`onOpenChange` 是同步发生还是等 effect？
3. `<Dialog.Trigger asChild><Icon/><Label/></Dialog.Trigger>` 会渲染成什么？

检查点：

1. 不会带 `aria-labelledby`；`WarningProvider` 已是 noop，不能指望 console.warn。
2. 等 effect。只有受控路径同步调 `onChange`。
3. `createSlot` 期望单一元素子节点，这样会 throw，不会包一层。

## 延伸阅读

- 官方文档：[Radix Primitives](https://www.radix-ui.com/primitives)
- 设计原则：仓库内 `philosophy.md`（绑定提交可核对）
- 固定源码：[radix-ui/primitives](https://github.com/radix-ui/primitives) —— 本文绑定提交 `9aebdd45abd447b84092ecf20f8bcd27f2398c36`
- [[shadcn-ui]] —— 把这些原语变成可复制的 Tailwind 模板

## 关联

- [[react]] —— Slot 建立在 `forwardRef` + `cloneElement` 与两套 ref 读取上
- [[shadcn-ui]] —— 官方模板已改从 umbrella `radix-ui` 进口行为层
- [[tailwind]] —— 与 Radix 无编译依赖，但是 shadcn 默认样式层
- [[storybook]] —— 本仓库仍用 Storybook 做原语可视化入口

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[shadcn-ui]] —— shadcn/ui — 把 React 组件从 npm 包变成"源码 + CLI 协议"
- [[storybook]] —— Storybook — 给 UI 组件的独立工作台
