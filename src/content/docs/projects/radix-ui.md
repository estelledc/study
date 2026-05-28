---
title: "Radix Primitives — unstyled accessible 组件协议"
description: 用 Slot/asChild + 受控/非受控双模 hook + Portal/FocusScope 分层，把 WAI-ARIA Authoring Practices 翻译成可组合的 React primitive；shadcn/ui 在它之上做样式封装。
sidebar:
  order: 23
  label: "radix-ui/primitives"
---

> radix-ui/primitives，commit `22473d16404bfd446305db5b6c9308aece99fdec`（2026-05-28 读），MIT。
>
> Radix Primitives 解决的是**「无样式但完全可访问的组件」该怎么写**的问题。
> 你想要 Dialog 组件，市场给你两类选择：
>
> - **MUI / Ant Design**：完整样式 + 内置 a11y，但要"反向定制"（覆盖 className、推 sx prop、深 forkPaperPath）
> - **自己写 div**：3 天后才发现 Esc 没关掉、tab 跑出 modal、screen reader 念不出 title
>
> Radix 的判断：**把"行为/无障碍"和"样式"彻底切分**——primitive 只暴露
> 行为（focus trap / dismiss / portal / 状态机），样式由调用方完全决定。
> shadcn/ui 就是在这层之上做 Tailwind 默认样式 + 复制粘贴分发。
>
> Season 6 第三篇 · v1.1 项目类型分支 D（框架/SDK）。
>
> Workspace 由 30+ 独立 npm 包组成（`@radix-ui/react-dialog` / `react-popper` / `react-slot` 等），核心抽象是 Slot/asChild + useControllableState + Portal/FocusScope/DismissableLayer 分层。

## 一句话定位

**Radix Primitives = "WAI-ARIA Authoring Practices 的 React 实现」**：每个组件 1-to-1 映射到 1 个 DOM node，不带任何视觉样式，但内置 focus 管理、键盘导航、ARIA 属性、受控/非受控双模——把 a11y 当核心契约，把 style 当用户决定。

shadcn/ui 全家桶（含 cal.com、vercel/v0、Linear 早期）在它之上做样式分发；
真正"造轮子的人造的轮子"。

## 核心信息表

| 字段 | 值 |
|---|---|
| 仓库 | [radix-ui/primitives](https://github.com/radix-ui/primitives) |
| star / fork | ~16.6k / ~770（2026-05 读） |
| 最近活跃 | 2026-05 主干持续提交（commit `22473d1` 当周） |
| 读时 commit | `22473d16404bfd446305db5b6c9308aece99fdec` |
| 主语言 | TypeScript（100% packages/react/）+ React |
| 维护方 | WorkOS（前 Modulz 团队，2023 被 WorkOS 收购）+ 社区 |
| 主要贡献者 | jjenzz（Jenna Smith，原 Modulz 设计系统主导）/ benoitgrelard / benoitgrelard / chaance / andy-hook |
| License | MIT |
| 类似项目 | headlessui · reach-ui (deprecated) · ariakit · mui-base · react-aria · react-spectrum |

## 项目类型自标 · v1.1 分支 D 框架/SDK

- **类型**：框架/SDK（用户在自己代码里组合 `<Dialog.Root>` / `<Dialog.Trigger>` / `<Dialog.Content>`，
  primitive 是显式 abstraction，行为/状态机由 primitive 决定，样式由 user 决定）
- **心脏物**：`packages/react/slot/src/slot.tsx`（asChild 协议）+
  `packages/react/use-controllable-state/src/use-controllable-state.tsx`（双模 hook）+
  `packages/react/dialog/src/dialog.tsx`（合 portal/focus-scope/dismissable-layer 的样板组件）
- **extension point**：
  - `asChild` prop（替换 primitive 渲染的根 DOM 元素，但保留所有行为/属性）
  - 受控 vs 非受控（`open` / `defaultOpen`、`value` / `defaultValue`）
  - createContextScope（多实例隔离 + ScopedProps，用于 nested popover 等）
  - `data-state` 属性 hook（CSS 选择器对齐 finite state machine）
- **混合特征**：可以争论"工具库"（小 surface API），但 30+ 包之间互相 compose（Dialog 内部用 FocusScope + Portal + Presence）、
  并且**给用户的心智模型是"按 ARIA 模式组合 primitive"**——这是 abstraction + extension point 的框架味，所以归 D。

## Why（为什么是它而不是 Headless UI / Reach UI / MUI Base / React Aria）

**前世界缺什么**。组件库分两派：

```
2014: Bootstrap          完整样式 + 无 a11y
2017: MUI                完整样式 + 完整 a11y，但 customize 难
2020: Reach UI           Ryan Florence/Michael Jackson 做 a11y 库（已停更）
2020: Headless UI v1     Tailwind Labs 出，绑 Tailwind 心智
2020: Radix Primitives   Modulz 团队，以 "组件即协议" 为核心理念
2021: react-aria         Adobe 做的 hooks 库（不是 component）
2022: Ariakit            ariakit/ariakit，hooks + components 双模
2023: shadcn/ui          在 Radix 上做复制粘贴 + Tailwind
```

`philosophy.md` 第 9 行说得直白：「web 平台给我们的实现 inadequate
——要么不存在，要么 functionality 不够，要么 customize 不充分」。

**核心 insight**：**accessibility 不是可选 feature，是 primitive 的硬契约**。
但 a11y 行为（focus trap、roving tab index、aria-* 同步）不应该绑死任何视觉风格——
它是 React 应用层的"内核"，不是 component library。

`philosophy.md:42` 写的「1-to-1 strategy：a single component only renders a single DOM element」
是这套库的**关键架构约束**——这条约束反过来推出了 `asChild` 模式
（如果只能渲染 1 个 DOM node，那调用方想换 tag 怎么办？答：clone 你给的 child）。

**对手哲学差**：

| 库 | 心智 | 默认产物 | a11y 实现 |
|---|---|---|---|
| **MUI / Mantine** | 「完整组件 + 主题」 | 1 个完整 button + 默认样式 | 内置 |
| **Headless UI** | 「无样式 + 内置主题 hooks」 | 1 个 unstyled button + Transition | 内置但绑 React |
| **Reach UI** | 「a11y first，sample style」 | unstyled + 半成品 css | 内置（停更了） |
| **MUI Base** | 「无样式 MUI」 | unstyled component + slots | 内置 |
| **React Aria** | 「hooks，自己组装 DOM」 | hook 返回 `{buttonProps}` | hooks |
| **Ariakit** | 「hooks + composition」 | 双模：hook + component | hooks + slots |
| **Radix** | 「组件协议，asChild 替换 root」 | unstyled component + asChild | 内置 |

**Radix 的代价**：

- **包数量爆炸**：`@radix-ui/react-dialog` / `react-popover` / `react-tooltip` ... 30+ 包，
  每个都要单独 npm install（v1.1.x 后有 `radix-ui` umbrella 包但用得人少）
- **bundle 膨胀**：每个 primitive 引用 5-10 个 internal package
  （`compose-refs` / `context` / `primitive` / `use-callback-ref`...），tree-shaking 必须开
- **学习曲线**：要懂 forwardRef / cloneElement / asChild / scoped context 的心智
- **样式必须自己来**：从设计师视角，0 到样式系统的距离比 MUI 远很多
  ——所以才有 shadcn/ui 来填这个坑

## 仓库地形 · Layer 2（框架/SDK 分支：标 abstraction + extension point）

`radix-ui/primitives` 顶层（commit `22473d1`，2026-05-28 读）：

```
primitives/
├── apps/
│   ├── storybook/          ★ 30+ primitive 的 Storybook（手动测试入口）
│   └── ssr-testing/        Next.js SSR 测试
├── packages/
│   ├── core/
│   │   └── primitive/      ★ composeEventHandlers 等共享 util
│   └── react/              ★★★ 心脏目录 —— 30+ primitive 包，每个是独立 npm package
│       ├── accordion/
│       ├── alert-dialog/   composes Dialog（看 nested primitive 的范本）
│       ├── arrow/
│       ├── aspect-ratio/
│       ├── avatar/
│       ├── checkbox/
│       ├── collapsible/
│       ├── collection/     ★ 子组件注册系统（roving-focus 用）
│       ├── compose-refs/   ★ ref 合成（asChild 关键依赖）
│       ├── context/        ★ createContextScope（多实例隔离）
│       ├── context-menu/
│       ├── dialog/         ★ composes FocusScope + Portal + DismissableLayer + Presence
│       ├── direction/      RTL 支持
│       ├── dismissable-layer/  ★ Esc / outside pointer 处理 + 层栈
│       ├── dropdown-menu/  composes Menu + Popper
│       ├── focus-guards/   tab 边界守卫（让 Portal 内 focus 不会逃逸）
│       ├── focus-scope/    ★ trap + autoFocus + restore（Dialog 关键）
│       ├── form/
│       ├── hover-card/
│       ├── id/             SSR-safe useId
│       ├── label/
│       ├── menu/           菜单基础（dropdown / context-menu 都 compose 它）
│       ├── menubar/
│       ├── navigation-menu/
│       ├── popover/        composes Popper + Dialog 的子集
│       ├── popper/         ★ floating positioning（包 floating-ui/react-dom）
│       ├── portal/         ★ ReactDOM.createPortal 的 thin wrapper
│       ├── presence/       ★ keep mounted while exit anim 跑
│       ├── primitive/      Primitive.button / Primitive.div ... 通用 polymorphic
│       ├── progress/
│       ├── radio-group/
│       ├── roving-focus/   方向键导航（menu / radio-group / tab）
│       ├── scroll-area/
│       ├── select/         最复杂的一个 primitive（含 typeahead）
│       ├── separator/
│       ├── slider/
│       ├── slot/           ★★★ asChild 协议核心
│       ├── switch/
│       ├── tabs/
│       ├── toast/
│       ├── toggle/
│       ├── toggle-group/
│       ├── toolbar/
│       ├── tooltip/
│       ├── use-callback-ref/    ref 包 callback（避免 stale closure）
│       ├── use-controllable-state/  ★★★ 受控/非受控双模 hook
│       ├── use-escape-keydown/
│       ├── use-layout-effect/   SSR-safe useLayoutEffect
│       ├── use-previous/
│       ├── use-size/
│       ├── visually-hidden/     a11y-only 隐藏
│       └── radix-ui/            umbrella package（一个 import 全包）
├── cypress/                 e2e 测试
├── philosophy.md            ★ 5 大 principle 的源文件
└── pnpm-workspace.yaml      monorepo 入口
```

**重点**：`packages/react/` 下的 primitive 大致分三层心智：

1. **底层 hooks**（`compose-refs` / `use-controllable-state` / `use-callback-ref`）——
   不渲染任何 DOM，只是 react util；对其他 primitive 的依赖最重
2. **中层基础设施**（`slot` / `portal` / `focus-scope` / `dismissable-layer` / `presence` / `popper`）——
   渲染 DOM，但本身不是「用户会直接用的组件」；是其他 primitive 的零件
3. **上层组件**（`dialog` / `popover` / `select` / `dropdown-menu`）——
   compose 中下层，对应 WAI-ARIA 一种 pattern

## 心脏文件 + extension point

按心智重要度排（每个文件给出 commit `22473d1` 的真实路径）：

| 文件 | 行数 | 角色 |
|---|---|---|
| `packages/react/slot/src/slot.tsx` | 228 | **asChild 协议核心**：cloneElement + mergeProps + composeRefs |
| `packages/react/use-controllable-state/src/use-controllable-state.tsx` | 96 | **受控/非受控双模 hook** —— 一个 hook 撑两种调用模式 |
| `packages/react/dialog/src/dialog.tsx` | 591 | **composition 范本**：compose Portal + Presence + FocusScope + DismissableLayer |
| `packages/react/focus-scope/src/focus-scope.tsx` | 352 | trap + autoFocus + restore；MutationObserver 处理 element-removed |
| `packages/react/dismissable-layer/src/dismissable-layer.tsx` | 360 | Esc + outside pointer + 层栈（Set\<element\>） |
| `packages/react/portal/src/portal.tsx` | 42 | ReactDOM.createPortal 的最薄 wrapper |
| `packages/react/presence/src/presence.tsx` | 201 | open=false 时延迟卸载，让 CSS 退场动画跑完 |
| `packages/react/popper/src/popper.tsx` | 427 | 包 `@floating-ui/react-dom`，提供 collision detection |
| `packages/react/compose-refs/src/compose-refs.tsx` | 60 | `composeRefs(...refs)` —— forwardRef + 内部 ref 合成的关键 |

**Extension point 一览**（用户可以挂的钩子）：

- **`asChild`**：所有渲染 DOM 的 primitive 都接受。开 → 不渲染自己的 root，
  把 props/ref/事件全 merge 到 `children` 上，仍是 1 个 DOM node
- **受控/非受控**：所有有 state 的 primitive（Dialog / Popover / Tabs / Select / Accordion ...）。
  传 `value`/`open` → 受控；传 `defaultValue`/`defaultOpen` → 非受控
- **`onOpenChange` / `onValueChange` 钩子**：state 变化时 callback
- **`onEscapeKeyDown` / `onPointerDownOutside` / `onInteractOutside`**：DismissableLayer 的事件，
  调用 `event.preventDefault()` 可阻止默认 dismiss 行为
- **`onMountAutoFocus` / `onUnmountAutoFocus`**：FocusScope 的事件，
  preventDefault 跳过默认 focus 转移
- **`forceMount`**：Presence/Portal 的 prop，开 → 始终保持挂载（给外部动画库用）
- **`__scopeXxx` (createContextScope)**：多实例嵌套场景的 scope 隔离

**为什么把它划进框架/SDK 而不是工具库**：尽管每个 primitive 体积小，
**整体心智模型是「按 ARIA pattern 组合 primitive」**——开发者写的不是
"调用一个 hook 拿 props"，而是 `<Dialog.Root>...<Dialog.Content>...` 的组合式 abstraction，
内部还有 lifecycle 钩子（open/closed 状态机、mount/unmount focus 转移）。这是典型的 framework 心智。

## 架构图（hero figure）

![Radix Slot/asChild 协议 + Dialog 分层架构：上半三联图展示 user JSX → Slot.cloneElement → 单 DOM node 的转换；下半时间轴展示 Dialog 打开时 Presence/Portal/FocusScope/DismissableLayer 的接力顺序，红色圈出 trigger ↔ unmount 焦点回归路径](/projects/radix-ui/01-architecture.webp)

**图说**：上半部分三联图：左是用户写的 JSX（`<Dialog.Trigger asChild><MyButton/></Dialog.Trigger>`），
中是 Slot.tsx 的 cloneElement + mergeProps + composeRefs 路径，右是渲染出的单一 DOM node（注意：没有外层 wrapper）。
下半部分时间轴呈现 Dialog open=true 时 5 个 primitive 接力的顺序：
**Presence**（决定是否 mount）→ **Portal**（escape parent stack context）→ **FocusScope**（trap + autoFocus 第一个 tabbable）→
**DismissableLayer**（监听 Esc / outside pointer），关闭时 FocusScope 反向 restore 到 trigger。
画风：上半箭头流式三段；下半时间轴 + 各 primitive 的边界用色块区分。

![useControllableState 双分支结构：左侧 uncontrolled 走内部 useState + effect，右侧 controlled 直接调 onChangeRef，中间共用 isControlled 三元判定](/projects/radix-ui/02-controllable-state.webp)

**图说**：useControllableState 的本质是**一行三元 + 两条不同路径**。
左：非受控时 `useState(defaultProp)` 自己持有，setValue 走 `setUncontrolledProp`，effect 检测变化后调 onChange。
右：受控时 value = prop（hook 不持有），setValue 直接调 onChangeRef.current（不走 effect）。
**关键 trade-off**：受控调用是同步的（在 setValue 当下就 fire），非受控是异步的（要等 React 渲染完 + effect 跑）——
这导致严格相等比较和受控/非受控来回切换会出 bug，所以 dev 模式专门有警告（line 35-49）。
画风：左右分支对照 + 中间共用顶部的 isControlled 判定。

## Layer 3 · 核心机制（≥ 3 段）

### 3.1 Slot + asChild：cloneElement + mergeProps + composeRefs（"1 node = 1 component" 协议）

[permalink to commit `22473d1`](https://github.com/radix-ui/primitives/blob/22473d16404bfd446305db5b6c9308aece99fdec/packages/react/slot/src/slot.tsx#L43-L88)：

```tsx
// packages/react/slot/src/slot.tsx:43-88
/* @__NO_SIDE_EFFECTS__ */ export function createSlot(ownerName: string) {
  const SlotClone = createSlotClone(ownerName);
  const Slot = React.forwardRef<HTMLElement, SlotProps>((props, forwardedRef) => {
    let { children, ...slotProps } = props;
    if (isLazyComponent(children) && typeof use === 'function') {
      children = use(children._payload);
    }
    const childrenArray = React.Children.toArray(children);
    const slottable = childrenArray.find(isSlottable);

    if (slottable) {
      // the new element to render is the one passed as a child of `Slottable`
      const newElement = slottable.props.children;

      const newChildren = childrenArray.map((child) => {
        if (child === slottable) {
          if (React.Children.count(newElement) > 1) return React.Children.only(null);
          return React.isValidElement(newElement)
            ? (newElement.props as { children: React.ReactNode }).children
            : null;
        } else {
          return child;
        }
      });

      return (
        <SlotClone {...slotProps} ref={forwardedRef}>
          {React.isValidElement(newElement)
            ? React.cloneElement(newElement, undefined, newChildren)
            : null}
        </SlotClone>
      );
    }

    return (
      <SlotClone {...slotProps} ref={forwardedRef}>
        {children}
      </SlotClone>
    );
  });
```

[permalink to commit `22473d1`](https://github.com/radix-ui/primitives/blob/22473d16404bfd446305db5b6c9308aece99fdec/packages/react/slot/src/slot.tsx#L100-L122)：

```tsx
// packages/react/slot/src/slot.tsx:100-122  —— SlotClone 内核
/* @__NO_SIDE_EFFECTS__ */ function createSlotClone(ownerName: string) {
  const SlotClone = React.forwardRef<any, SlotCloneProps>((props, forwardedRef) => {
    let { children, ...slotProps } = props;
    if (isLazyComponent(children) && typeof use === 'function') {
      children = use(children._payload);
    }

    if (React.isValidElement(children)) {
      const childrenRef = getElementRef(children);
      const props = mergeProps(slotProps, children.props as AnyProps);
      // do not pass ref to React.Fragment for React 19 compatibility
      if (children.type !== React.Fragment) {
        props.ref = forwardedRef ? composeRefs(forwardedRef, childrenRef) : childrenRef;
      }
      return React.cloneElement(children, props);
    }

    return React.Children.count(children) > 1 ? React.Children.only(null) : null;
  });
```

旁注：

- **「1 个 DOM node」契约的来源**：`philosophy.md:42` 写「a single component only renders a single DOM element」。
  这条约束是反推出来的——如果 `<Dialog.Trigger>` 渲染 `<button><span>...</span></button>`，
  调用方想换成 `<a>` 就必须 fork 整个 primitive。Slot 是这条约束下唯一合理的解。
- **mergeProps 的合并规则不对称**：[slot.tsx:164-196](https://github.com/radix-ui/primitives/blob/22473d16404bfd446305db5b6c9308aece99fdec/packages/react/slot/src/slot.tsx#L164-L196)
  里写：`onClick` 这类 handler 是**先调 child 再调 slot**（`childPropValue(...args); slotPropValue(...args)`），
  `style` 是 `{...slot, ...child}`（child 覆盖 slot），`className` 是简单字符串拼接。
  这意味着用户的 onClick 比 Radix 内部的 onClick 先跑，**用户可以在 handler 里
  `e.stopPropagation()` 阻止 Radix 默认行为**——这是 escape hatch。
- **composeRefs 的 React 19 兼容**：[compose-refs.tsx:21-49](https://github.com/radix-ui/primitives/blob/22473d16404bfd446305db5b6c9308aece99fdec/packages/react/compose-refs/src/compose-refs.tsx#L21-L49)
  现在支持 ref cleanup（React 19 callback ref 可以返回清理函数）；
  老 React 18 的"callback ref 不能返回值"限制也兼容（注释里写「only happen if a user's ref callback returns a value」）。
- **Slottable + Slot 双层**：当 children 不是单一元素而是「文本 + 一个 slot 元素」混合时，
  用户用 `<Slottable>` 标记真正要 clone 的子节点。这是支持 "icon + text 子组件" 的关键
  （如 `<Button asChild><a><Icon /><Slottable>{children}</Slottable></a></Button>`）。
- **lazy component 兼容**：[slot.tsx:32-41 + 47-49](https://github.com/radix-ui/primitives/blob/22473d16404bfd446305db5b6c9308aece99fdec/packages/react/slot/src/slot.tsx#L32-L49)
  专门 detect React.lazy 元素并用 `React.use` 解包；这是 React 19 新增的兼容路径，
  没这段 lazy + asChild 会直接 throw。
- **`getElementRef` 的奇怪写法**：[slot.tsx:198-220](https://github.com/radix-ui/primitives/blob/22473d16404bfd446305db5b6c9308aece99fdec/packages/react/slot/src/slot.tsx#L198-L220)
  注释说 "React <=18 in DEV / React 19 in DEV / Not DEV" 三种行为不同——
  访问 `element.ref` 在 React 19 是正常路径但在 React 18 会触发 warning，
  访问 `element.props.ref` 反过来。这段代码做的是**避免在每个版本触发 dev warning**的繁琐兼容。

**怀疑 1**：`mergeProps` 里 className 是简单 `[a, b].filter(Boolean).join(' ')`——
如果用户传 className 包含与 Radix data-state 选择器冲突的样式，没有任何检测。
作者似乎假设 user className 永远不与 Radix 内部 className 冲突，但 internal className 极少（基本只在 RemoveScroll 等三方依赖里）。
这种"乐观合并"策略对 90% 场景够用，但极端情况要靠用户自查。

### 3.2 useControllableState：一个 hook 同时支撑「受控 / 非受控」两种调用方式

[permalink to commit `22473d1`](https://github.com/radix-ui/primitives/blob/22473d16404bfd446305db5b6c9308aece99fdec/packages/react/use-controllable-state/src/use-controllable-state.tsx#L18-L66)：

```tsx
// packages/react/use-controllable-state/src/use-controllable-state.tsx:18-66
export function useControllableState<T>({
  prop,
  defaultProp,
  onChange = () => {},
  caller,
}: UseControllableStateParams<T>): [T, SetStateFn<T>] {
  const [uncontrolledProp, setUncontrolledProp, onChangeRef] = useUncontrolledState({
    defaultProp,
    onChange,
  });
  const isControlled = prop !== undefined;          // ★ 一行决定模式
  const value = isControlled ? prop : uncontrolledProp;

  // OK to disable conditionally calling hooks here because they will always run
  // consistently in the same environment. Bundlers should be able to remove the
  // code block entirely in production.
  /* eslint-disable react-hooks/rules-of-hooks */
  if (process.env.NODE_ENV !== 'production') {
    const isControlledRef = React.useRef(prop !== undefined);
    React.useEffect(() => {
      const wasControlled = isControlledRef.current;
      if (wasControlled !== isControlled) {
        const from = wasControlled ? 'controlled' : 'uncontrolled';
        const to = isControlled ? 'controlled' : 'uncontrolled';
        console.warn(
          `${caller} is changing from ${from} to ${to}. Components should not switch from controlled to uncontrolled (or vice versa). Decide between using a controlled or uncontrolled value for the lifetime of the component.`,
        );
      }
      isControlledRef.current = isControlled;
    }, [isControlled, caller]);
  }
  /* eslint-enable react-hooks/rules-of-hooks */

  const setValue = React.useCallback<SetStateFn<T>>(
    (nextValue) => {
      if (isControlled) {
        const value = isFunction(nextValue) ? nextValue(prop) : nextValue;
        if (value !== prop) {
          onChangeRef.current?.(value);          // ★ 受控：直接调 callback
        }
      } else {
        setUncontrolledProp(nextValue);          // ★ 非受控：内部 setState
      }
    },
    [isControlled, prop, setUncontrolledProp, onChangeRef],
  );

  return [value, setValue];
}
```

[permalink to commit `22473d1`](https://github.com/radix-ui/primitives/blob/22473d16404bfd446305db5b6c9308aece99fdec/packages/react/use-controllable-state/src/use-controllable-state.tsx#L68-L92)：

```tsx
// packages/react/use-controllable-state/src/use-controllable-state.tsx:68-92
function useUncontrolledState<T>({
  defaultProp,
  onChange,
}: Omit<UseControllableStateParams<T>, 'prop'>): [
  Value: T,
  setValue: React.Dispatch<React.SetStateAction<T>>,
  OnChangeRef: React.RefObject<ChangeHandler<T> | undefined>,
] {
  const [value, setValue] = React.useState(defaultProp);
  const prevValueRef = React.useRef(value);

  const onChangeRef = React.useRef(onChange);
  useInsertionEffect(() => {
    onChangeRef.current = onChange;             // ★ 同步更新 ref（避免 stale closure）
  }, [onChange]);

  React.useEffect(() => {
    if (prevValueRef.current !== value) {
      onChangeRef.current?.(value);             // ★ effect 才触发 onChange
      prevValueRef.current = value;
    }
  }, [value, prevValueRef]);

  return [value, setValue, onChangeRef];
}
```

旁注：

- **受控/非受控切换是 dev warning，不是 throw**：line 35-49 用 `process.env.NODE_ENV !== 'production'` 包住，
  生产环境完全不检测；只是 console.warn。这是一个**显式的设计选择**——
  React 自己的 `<input>` 也是这个行为（"changing controlled to uncontrolled"），Radix 完全对齐。
- **why useInsertionEffect for onChange ref**：line 5-6 优先用 `React.useInsertionEffect`（React 18+）。
  原因是 InsertionEffect 在 layout effect **之前**跑，可以保证 onChangeRef.current
  在任何 layout effect 用到它之前已经更新；`useLayoutEffect` 是 fallback。
  这是处理"父组件 inline 写 onChange={() => ...}"导致的 ref drift 问题的最 surgical 方案。
- **受控时 setValue 不走 effect**：受控分支直接调 `onChangeRef.current?.(value)`——
  调用是**同步**的（在 React event handler 那一帧就 fire）。
  非受控分支调用 `setUncontrolledProp` 后要等 React 渲染完 + commit 后 effect 才跑——
  调用是**异步**的（下一帧）。这导致同一个 setValue 调用，受控和非受控的 onChange 触发时机不同；
  对 `<form>` integration 的影响：受控时表单提交能立刻拿到新 value，非受控有一帧延迟。
- **`isFunction(nextValue) ? nextValue(prop) : nextValue`**：受控分支单独处理 functional updater
  （`setOpen(prev => !prev)` 这种用法）。非受控不需要——直接传给 useState 自己会处理。
- **`if (value !== prop)` 的省略调用**：受控分支只在 next !== prop 时才调 onChange——避免无效 re-render。
  但对象 / 数组类型会 false positive（引用相等才认为没变）；用户可以传 immutable 数据结构规避。

**怀疑 2**：line 51-63 的 setValue 用 useCallback 包了，但 deps 含 `prop`——
这意味着**每次 prop 变化都会生成新的 setValue 引用**。
如果调用方 `useEffect(() => {}, [setValue])` 这样依赖它，会 effect 抖动。
似乎作者赌"用户不会把 setValue 放进 effect deps"，但没显式 ESLint disable 掉这个 case。

### 3.3 Dialog composition：Portal + Presence + FocusScope + DismissableLayer 4 层接力

[permalink to commit `22473d1`](https://github.com/radix-ui/primitives/blob/22473d16404bfd446305db5b6c9308aece99fdec/packages/react/dialog/src/dialog.tsx#L50-L86)：

```tsx
// packages/react/dialog/src/dialog.tsx:50-86  —— Dialog Root：useControllableState 接入
const Dialog: React.FC<DialogProps> = (props: ScopedProps<DialogProps>) => {
  const {
    __scopeDialog,
    children,
    open: openProp,
    defaultOpen,
    onOpenChange,
    modal = true,
  } = props;
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const contentRef = React.useRef<DialogContentElement>(null);
  const [open, setOpen] = useControllableState({
    prop: openProp,
    defaultProp: defaultOpen ?? false,
    onChange: onOpenChange,
    caller: DIALOG_NAME,
  });

  return (
    <DialogProvider
      scope={__scopeDialog}
      triggerRef={triggerRef}
      contentRef={contentRef}
      contentId={useId()}
      titleId={useId()}
      descriptionId={useId()}
      open={open}
      onOpenChange={setOpen}
      onOpenToggle={React.useCallback(() => setOpen((prevOpen) => !prevOpen), [setOpen])}
      modal={modal}
    >
      {children}
    </DialogProvider>
  );
};
```

[permalink to commit `22473d1`](https://github.com/radix-ui/primitives/blob/22473d16404bfd446305db5b6c9308aece99fdec/packages/react/dialog/src/dialog.tsx#L145-L161)：

```tsx
// packages/react/dialog/src/dialog.tsx:145-161  —— DialogPortal：Presence 包 PortalPrimitive
const DialogPortal: React.FC<DialogPortalProps> = (props: ScopedProps<DialogPortalProps>) => {
  const { __scopeDialog, forceMount, children, container } = props;
  const context = useDialogContext(PORTAL_NAME, __scopeDialog);
  return (
    <PortalProvider scope={__scopeDialog} forceMount={forceMount}>
      {React.Children.map(children, (child) => (
        <Presence present={forceMount || context.open}>
          <PortalPrimitive asChild container={container}>
            {child}
          </PortalPrimitive>
        </Presence>
      ))}
    </PortalProvider>
  );
};
```

[permalink to commit `22473d1`](https://github.com/radix-ui/primitives/blob/22473d16404bfd446305db5b6c9308aece99fdec/packages/react/dialog/src/dialog.tsx#L384-L424)：

```tsx
// packages/react/dialog/src/dialog.tsx:384-424  —— DialogContentImpl：FocusScope + DismissableLayer
const DialogContentImpl = React.forwardRef<DialogContentImplElement, DialogContentImplProps>(
  (props: ScopedProps<DialogContentImplProps>, forwardedRef) => {
    const { __scopeDialog, trapFocus, onOpenAutoFocus, onCloseAutoFocus, ...contentProps } = props;
    const context = useDialogContext(CONTENT_NAME, __scopeDialog);
    const contentRef = React.useRef<HTMLDivElement>(null);
    const composedRefs = useComposedRefs(forwardedRef, contentRef);

    // Make sure the whole tree has focus guards as our `Dialog` will be
    // the last element in the DOM (because of the `Portal`)
    useFocusGuards();

    return (
      <>
        <FocusScope
          asChild
          loop
          trapped={trapFocus}
          onMountAutoFocus={onOpenAutoFocus}
          onUnmountAutoFocus={onCloseAutoFocus}
        >
          <DismissableLayer
            role="dialog"
            id={context.contentId}
            aria-describedby={context.descriptionId}
            aria-labelledby={context.titleId}
            data-state={getState(context.open)}
            {...contentProps}
            ref={composedRefs}
            onDismiss={() => context.onOpenChange(false)}
          />
        </FocusScope>
        {process.env.NODE_ENV !== 'production' && (
          <>
            <TitleWarning titleId={context.titleId} />
            <DescriptionWarning contentRef={contentRef} descriptionId={context.descriptionId} />
          </>
        )}
      </>
    );
  },
);
```

旁注：

- **4 层 wrap 顺序的语义**：从外到内是 `Presence > Portal > FocusScope > DismissableLayer`。
  反过来看每层负责的事：
  1. **Presence**：「该挂载吗？」open=false 时如果有 data-state="closed" 的 CSS 退场动画，先等动画完再卸载
  2. **Portal**：「挂在哪？」从原父级（可能 overflow:hidden / position:relative）逃出，挂到 document.body
  3. **FocusScope**：「焦点能去哪？」trap 模式下 tab 不能跑出 content；mount 时 autoFocus 第一个 tabbable
  4. **DismissableLayer**：「啥情况关？」Esc / outside pointer 触发 onDismiss → setOpen(false)
- **modal vs non-modal 分叉**：[dialog.tsx:259-356](https://github.com/radix-ui/primitives/blob/22473d16404bfd446305db5b6c9308aece99fdec/packages/react/dialog/src/dialog.tsx#L259-L356)
  把 DialogContent 拆成 DialogContentModal / DialogContentNonModal 两个组件。Modal 路径会
  `hideOthers(content)`（aria-hide 其他 DOM）+ `RemoveScroll`（锁 body 滚动）；non-modal 不锁。
  这是「同一个 primitive 撑两种 ARIA pattern」的范例——`role="dialog"` + `aria-modal="true"` vs `role="dialog"` only。
- **closeAutoFocus 默认 focus 回 trigger**：line 279-282 `event.preventDefault(); context.triggerRef.current?.focus();`
  ——这是 WAI-ARIA 要求的「关闭后焦点回到触发者」行为。
  用户传 `onCloseAutoFocus={(e) => e.preventDefault()}` 可阻止这个默认行为，然后自己 focus 别的地方。
- **TitleWarning / DescriptionWarning dev-only**：line 415-419 在 dev 模式下检测 Dialog 是否带了
  `<Dialog.Title>` 和 `aria-describedby`——没带就 console.warn。生产环境完全不检测。
  这是把 a11y 检查做成 lint 而不是 throw 的折中——业务可能会临时省略 Title 应急。
- **useFocusGuards**：line 394 注释说「Portal 让 Dialog 是 DOM 最后一个元素，需要 focus guards 防止 tab 跑出页面」。
  focus-guards 包会在 body 顶部和底部插入两个 `tabIndex={0}` 的隐形 div，
  当 user tab 到这两个守卫元素时，把焦点移回 Dialog 内的第一个/最后一个 tabbable。

**怀疑 3**：DismissableLayer 的「层栈」用 `Set<element>`（[dismissable-layer.tsx:19-23](https://github.com/radix-ui/primitives/blob/22473d16404bfd446305db5b6c9308aece99fdec/packages/react/dismissable-layer/src/dismissable-layer.tsx#L19-L23)），
**Set 的迭代顺序是插入顺序**（JS 标准）；这意味着「最高层」是最后插入的。
但如果 user 同时打开 2 个 Dialog 然后关掉中间一个，Set.delete 不会重排 index——
最高层判定依赖 `[...layers].slice(-1)` 仍是对的，但 `layers.indexOf(node)` 用 Array 而不是 Set 自身索引——
Array.from 的顺序也保持插入序。所以实际是对的，但**3 处 Set/Array 互转**有 O(n) 开销，且代码不直观。

**怀疑 4**：FocusScope 的 [focus-scope.tsx:73-130](https://github.com/radix-ui/primitives/blob/22473d16404bfd446305db5b6c9308aece99fdec/packages/react/focus-scope/src/focus-scope.tsx#L73-L130)
用 `MutationObserver` 监听子树 childList——如果 Dialog 内容动态插入大量节点，
MutationObserver 会触发很多次 handleMutations。注释（line 108-110）说「focused element removed → focus moves to body → 我们把焦点移回 container」是一个常见 case，
但 MutationObserver 没有 throttle，对 React.useState 大批量 update + DOM diff 的场景可能造成可见的 jank。
没看到 throttle / requestIdleCallback 的痕迹。

## Layer 4 · Hands-on（30 分钟跑通 + 改一处）

### 30 分钟跑通：clone + 跑 storybook + 跑测试

```bash
# 1. clone
git clone --depth 1 https://github.com/radix-ui/primitives radix-primitives
cd radix-primitives
git rev-parse HEAD       # 应该是 22473d16... 或更新

# 2. 装依赖（用 pnpm，monorepo）
pnpm install

# 3. 跑 storybook（含 30+ primitive 的可视化 demo）
pnpm dev                 # 等价于 pnpm storybook，启动到 http://localhost:9009

# 4. 跑单元测试（vitest）
pnpm test

# 5. 单独跑某个 primitive 的测试
pnpm vitest run packages/react/use-controllable-state
pnpm vitest run packages/react/slot
pnpm vitest run packages/react/dialog

# 6. 看一个 primitive 的 build
pnpm --filter @radix-ui/react-dialog run build
```

### 改一处实验：写 toy useControllableState 验证受控/非受控切换警告

最小复现需要 `react` + `@types/react`，约 30 行 TypeScript：

```tsx
// toy-controllable.tsx —— 自己实现 mini 版 useControllableState 验证心智
import * as React from 'react';

type Params<T> = { prop?: T; defaultProp: T; onChange?: (v: T) => void };

function useToyControllable<T>({ prop, defaultProp, onChange }: Params<T>) {
  const [internal, setInternal] = React.useState(defaultProp);
  const isControlled = prop !== undefined;
  const value = isControlled ? prop : internal;

  // dev-only 切换检测（对应 Radix line 35-49）
  const wasControlledRef = React.useRef(isControlled);
  React.useEffect(() => {
    if (wasControlledRef.current !== isControlled) {
      const from = wasControlledRef.current ? 'controlled' : 'uncontrolled';
      const to = isControlled ? 'controlled' : 'uncontrolled';
      console.warn(`switched from ${from} to ${to}`);
    }
    wasControlledRef.current = isControlled;
  }, [isControlled]);

  const setValue = (next: T) => {
    if (isControlled) {
      onChange?.(next);              // 受控：同步调 callback
    } else {
      setInternal(next);             // 非受控：内部 setState，effect 后 onChange
    }
  };
  return [value, setValue] as const;
}

// Usage demo
function Demo() {
  const [v, setV] = useToyControllable<boolean>({ defaultProp: false });
  // 切换 prop 试试：
  // const [extOpen, setExtOpen] = React.useState(false);
  // const [v, setV] = useToyControllable<boolean>({ prop: extOpen, defaultProp: false, onChange: setExtOpen });
  return <button onClick={() => setV(!v)}>{String(v)}</button>;
}
```

**实验流程**：

1. 先用 `defaultProp: false` 的非受控模式跑 → 点击 button 切换 → console 干净
2. 改成 `prop: extOpen, defaultProp: false` 的受控模式 → 第一帧 console 出现
   `switched from uncontrolled to controlled` 的 warning
3. 在 setValue 里加 `console.log('setValue called', isControlled, next)`，对比受控
   和非受控时 onChange 触发顺序——受控是**同步**（在 onClick 当下就 fire），
   非受控是**异步**（要等 effect 那一帧）

**观察到的行为**：

- 非受控时点击 → 显示 `true` → onChange 触发是**下一帧**（effect 后）
- 受控时点击 → 调 onChange → 父 setState → 父 re-render → 显示 `true`，但 onChange 是**当前帧同步**触发的
- 切换 isControlled 时：dev warning 出现一次，UI 不会爆炸（因为 useState 初值仍存在），
  但表单提交的 timing 会变

**这说明了什么**：受控/非受控不仅是 API 选择，**timing 语义不同**。
`<form onSubmit>` 里读 value 时：受控可立刻拿到新值，非受控有一帧延迟。

## Layer 5 · 横向对比（≥ 5 维 + 哲学不同的竞品）

| 维度 | Radix Primitives | Headless UI | Reach UI | Ariakit | MUI Base | React Aria |
|---|---|---|---|---|---|---|
| **API 模型** | component composition + asChild | component + slot props | component + as prop | hook + component 双轨 | component + slots | hooks 返回 props |
| **a11y 实现** | 内置 + dev warning | 内置 | 内置（停更） | 内置 + 文档化 | 内置 | hook 级 |
| **样式态度** | 0 样式 | 0 样式但 transition 有内置 | 半成品 css | 0 样式 | 0 样式 | 0 输出（自己组装 DOM） |
| **维护方** | WorkOS | Tailwind Labs | 已停更（2023） | 个人维护（diegohaz） | MUI Inc. | Adobe |
| **生态影响** | shadcn/ui 全家桶 | Tailwind 项目 | （已死） | 中等 | MUI Joy | react-spectrum |
| **组件数量** | 30+ | ~10（focus on Tailwind） | ~15（停更） | 30+ | 25+ | 20+ |
| **bundle 重量（Dialog）** | ~14 kb gzip | ~8 kb gzip | ~10 kb gzip | ~9 kb gzip | ~12 kb gzip | hooks only |
| **TypeScript 心智** | forwardRef + ScopedProps | ts 友好 | ts 友好但旧 | hooks 类型复杂 | ts 友好 | 类型重 |
| **多实例 nested** | createContextScope | 自己处理 | 自己处理 | 自动 scope | 自己处理 | hooks 自然隔离 |
| **可控性** | 受控/非受控 | 受控/非受控 | 受控/非受控 | 双模 | slot prop 接管 | hooks 完全用户态 |

### 选型建议

- **想要成熟的 unstyled component，绑 Tailwind**：Radix（+ shadcn/ui）。市场最大，文档最齐全
- **整个项目用 Tailwind UI 方案**：Headless UI（Tailwind Labs 自家产品，design 集成最自然）
- **想要 hooks-only，自己渲染 DOM 节点**：React Aria（Adobe，spec 最严格）
- **想要 component + hooks 双轨灵活切换**：Ariakit（diegohaz，hooks API 设计最干净）
- **已有 MUI 项目想要 unstyled fork**：MUI Base（API 跟 MUI 同源）
- **2023 年前的老项目用 Reach UI**：迁移到 Radix（API 心智最接近）

**和 Radix 哲学最不同的是 React Aria**：

- Radix：「我给你 component，你按 ARIA pattern 组合，asChild 替换 root」
- React Aria：「我给你 hooks，hook 返回 props，你把 props 放到任意 DOM 上」

React Aria 的优势：组件树结构完全用户决定，bundle 更小。
Radix 的优势：上手成本低（写 `<Dialog.Trigger>` vs `useDialog().triggerProps`），
对小团队"不想自己造组件树"的需求更友好。

## Layer 6 · 与当前工作的连接

### 今天就能用

- **想自建 Dialog/Popover/Tooltip 时**：直接 `npm install @radix-ui/react-dialog`，
  比写 div + useEffect + Esc handler 安全 10 倍
- **`asChild` 模式适合「我已经有自己的 Button 组件」**：`<Dialog.Trigger asChild><MyButton/></Dialog.Trigger>`
  保留 MyButton 的所有样式 + 行为，只 merge Radix 的 onClick + ARIA props
- **`useControllableState` 这一个 hook 单独抽出来用**：
  写自己的 `<MyTabs>` 时直接 `npm install @radix-ui/react-use-controllable-state`，
  零成本支持「父组件想接管就接管，不接管就 fallback」
- **`composeRefs` / `useComposedRefs`**：写 forwardRef 组件需要内部 ref + 外部 ref 同时拿到时，
  比自己写 callback ref 干净，且 React 19 兼容性已处理好
- **借鉴 data-state 状态机模式**：自己组件用 `data-state="open" | "closed" | "indeterminate"`
  字符串枚举对齐，CSS 选择器 `[data-state="open"]` 直接绑定动画——
  避免 boolean state 散落在 className 里

### 下个月能用

- **shadcn/ui 是 Radix 的最佳起点**：要从零搭设计系统，复制粘贴 shadcn 的 Tailwind 样式 +
  Radix 行为 = 免费拿到 30+ 高质量组件，自己只管 token
- **用 Radix 重构现有 MUI 项目**：先 fork 一个高频组件（Dialog / Popover / Tooltip），
  用 `<Dialog.Root + <Dialog.Trigger asChild>` 包住现有 MUI Button —— 行为换掉但视觉不变
- **跨 monorepo 的 portal 多实例**：用 `createDialogScope()` + `__scopeDialog` 让 nested popover
  状态隔离，避免「关一个 popover 把另一个也关掉」
- **migration 到 React 19**：Radix 已经处理好 ref cleanup + lazy + use API；
  自己组件用了 forwardRef + cloneElement 模式的，可以参考 Slot.tsx 的兼容写法

### 不要用的部分

- **不要把 Radix 当 Component Library**：它没有 ButtonGroup / Card / Layout 等"design system 件"——
  Radix 只覆盖 ARIA 有标准的交互组件。Layout / 排版 / 网格这类用 Tailwind 或自己写
- **不要在每个组件包都装一个 `@radix-ui/react-xxx`**：bundle 会重复装 30+ 个 internal package。
  建议要么用 umbrella `radix-ui` 包，要么 monorepo 共享 deps
- **不要把 Radix 当成"无障碍 audit 工具"**：它实现了 WAI-ARIA pattern 但**不验证你用对了**——
  你可以把 `<Dialog.Title>` 文本写空，运行时只 dev warning，prod 是哑的；
  仍然要跑 axe-core 这类 audit
- **不要在 SSR 框架里直接 import Portal/Dialog**：`document.body` 在 server 不存在；
  Radix 已经处理（`useLayoutEffect` fallback），但要确保你的 framework 不在 server 调 `<Dialog.Content>`
  的渲染分支（看 [portal.tsx:24-28](https://github.com/radix-ui/primitives/blob/22473d16404bfd446305db5b6c9308aece99fdec/packages/react/portal/src/portal.tsx#L21-L29)）
- **不要 fork Slot.tsx 自己改 mergeProps 行为**：那段 `onClick: child first then slot` 顺序、
  `style: child overrides slot` 规则，是社区共识的不变量；改它会让所有调用方
  事件顺序断裂——要变行为就在自己的组件里包一层

## Layer 7 · 自检 + 延伸阅读

### 自检问题（≥ 4 个，行号级别）

1. **`Slot.tsx` 第 47-49 行 isLazyComponent + React.use 解包路径在 React 18 里是怎么 fallback 的？**
   提示：line 22 的 `(React as any)[' use '.trim().toString()]` 在 React 18 返回 undefined → if 条件不进入 → children 保持原样。但 lazy 组件没解包就 cloneElement 会怎样？追到 React.cloneElement 内部对 lazy 元素的处理。
2. **`useControllableState.tsx` 第 51-63 行 useCallback 的 deps 含 prop，每次 prop 变化新生成 setValue。
   如果调用方 useEffect 依赖了 setValue，会进入无限 effect 吗？什么场景下会？**
   提示：考虑 prop 是 props.open 从父组件传下来；setValue 每次身份变 → effect 跑 → 如果 effect 内调 setValue 改 prop → ...
3. **`focus-scope.tsx` 第 73-130 行 trapped 模式下的 focusin 监听是 capture phase 还是 bubble phase？
   如果一个 modal 内嵌了另一个 modal（FocusScope 嵌套），父 scope 会不会把焦点抢回去？**
   提示：line 119 `document.addEventListener('focusin', handleFocusIn)` 默认 bubble；多个 scope 都会触发 handler。
   解决策略在 line 64-70 的 `paused` 字段——上层 scope 在子 scope mount 时 pause。但触发 pause 的代码在哪？
4. **`dialog.tsx` 第 145-161 行 DialogPortal 用 Children.map 包裹 Presence + PortalPrimitive。
   如果 children 是 `<><Header /><Body /></>` Fragment，会发生什么？**
   提示：React.Children.map 会展开 Fragment（这是 React 内置行为）；每个子节点都包一层 Portal——
   于是 Header 和 Body 在 DOM 上变成 body 直系兄弟，而非一起在某个容器里。
   测试：写一个 Dialog.Content 内放 `<><h2>...</h2><div>...</div></>`，看 DevTools 里 DOM 结构。

### 接下来读哪 N 个文件

| 顺序 | 文件 | 回答的问题 |
|---|---|---|
| 1 | `packages/react/select/src/select.tsx` | 最复杂的 primitive 怎么 compose 全部基础设施（typeahead / popper / portal / focus-scope）？ |
| 2 | `packages/react/popper/src/popper.tsx` | floating-ui collision detection 怎么集成（line 179 的 useFloating）？ |
| 3 | `packages/react/roving-focus/src/roving-focus-group.tsx` | 方向键导航 + 子组件注册的 collection pattern |
| 4 | `packages/react/context/src/createContextScope.tsx` | 多实例隔离 + ScopedProps 的 ts 类型操作（被 Dialog/Popover/Menu 共用） |
| 5 | `packages/react/presence/src/presence.tsx` | open=false 时延迟卸载等 CSS 退场动画的状态机（含 animationend 监听） |
| 6 | `apps/storybook/stories/Dialog.stories.tsx` | 看官方推荐 Dialog 用法的最小例子，对照源码理解 |

## 限制（≥ 4 条独立限制）

- **bundle 重量不轻**：单 Dialog primitive 含 5-7 个 internal package（compose-refs / context / dismissable-layer / focus-scope / portal / presence / primitive），
  即便 tree-shaking 也常见 14kb gzip 起步。对 critical path 体量敏感的页面（landing page）要谨慎，
  能用 native `<dialog>` 元素 + 少量 polyfill 的场景就别上 Radix
- **monorepo 包管理复杂**：单独一个项目要装 `@radix-ui/react-dialog` `@radix-ui/react-dropdown-menu`...
  每个都 lock 不同的版本号，升级时要全部对齐；umbrella 包 `radix-ui` 又不是所有 primitive 都收录
- **a11y 不是自动**：Radix 实现了 WAI-ARIA pattern 但**用错也不检测**——
  你可以 `<Dialog.Trigger>` 不放 `<Dialog.Title>`、`aria-describedby` 留空、
  Portal 容器用 `display: none`——这些 dev 模式只 warn，prod 哑的
- **SSR 行为有边界**：Portal 依赖 `document.body`，server 渲染时 mounted=false 会渲染 null；
  但 modal 内容如果是 SEO-critical 内容（比如 search result modal），会丢失初始 HTML
- **类型签名爆炸**：每个 primitive 都用 `React.ComponentRef<typeof Primitive.div>` + `React.ComponentPropsWithoutRef`
  + ScopedProps 包装；TS error message 经常出现 80 字符以上的类型 lookup，调试体验差
- **migration cost 高**：从 MUI / Mantine 切到 Radix 不是 drop-in；要重写所有样式（Tailwind / CSS-in-JS）
  + 重新设计 design token + 大量 tweaks（focus ring / disabled state / hover transitions）

## 附录：宣传 vs 现实清单

| 宣传 | 现实 |
|---|---|
| 「Unstyled, accessible components for building high-quality design systems and web apps in React」 | 没有 Layout / 排版组件；只覆盖 ARIA 有标准的交互组件；design system 还是要自己搭 |
| 「Composable」 | 1 个组件 = 1 个 DOM node 这条规则强制了 asChild 模式，但 `mergeProps` 的合并规则（onClick 顺序 / className 拼接）是隐式约定，文档不充分 |
| 「Customisable」 | 没有样式 = 你要从 0 开始；shadcn/ui 才是真正的「customisable starting point」 |
| 「Functional - feature-rich」 | 大部分 primitive 行为完整，但 Tooltip 的 keyboard 触发、Toast 的 swipe-to-dismiss 等高级行为要自己拼 |
| 「Tested in major screen readers (VoiceOver, JAWS, NVDA)」 | Cypress 测试主要是 happy path；screen reader 测试是手动的，没自动化（philosophy.md 也没声明） |

## 元数据

- 升级日期：2026-05-28
- 项目类型：v1.1 分支 D（框架/SDK）
- 总行数：约 540 行
- 启用工具：Read（源码精读）/ Bash（git clone / line count）/ Pillow（webp 生成）
- 锚定 commit：`22473d16404bfd446305db5b6c9308aece99fdec`
- 心脏文件总览：slot.tsx (228 行) · use-controllable-state.tsx (96 行) · dialog.tsx (591 行) · focus-scope.tsx (352 行) · dismissable-layer.tsx (360 行) · portal.tsx (42 行) · presence.tsx (201 行) · compose-refs.tsx (60 行)
