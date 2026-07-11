---
title: Radix UI — unstyled accessible 的 React 组件原语库
来源: 'https://github.com/radix-ui/primitives'
日期: 2026-05-30
分类: 前端组件库
难度: 中级
---

## 是什么

Radix UI Primitives 是 WorkOS（前 Modulz 团队）维护的**无样式但完全可访问的 React 组件原语库**——它不给你画好看的按钮，它给你一套**行为已经做对了的零件**，你自己往上贴样式。日常类比：像装修毛坯房——开发商先把水电管线、承重墙、防火门按规范都修对了，你只管刷漆贴砖选家具，不用担心墙体会塌。

每个原语对应一个 WAI-ARIA pattern（Dialog、Popover、Tooltip、Tabs、Select 等），单独发成 `@radix-ui/react-dialog` 这种 npm 包，30 多个加起来覆盖前端常见交互组件。原语只暴露行为（focus 管理、键盘导航、ARIA 属性、受控非受控双模），CSS 一行也不带；shadcn/ui、cal.com、Vercel v0、Linear 早期都站在它上面做样式分发。

## 为什么重要

不理解 Radix 就解释不了下面这些事：

- 为什么 shadcn/ui 火到能让前端圈养成"复制粘贴组件而不是 npm install"的新习惯——它的底层逻辑全部由 Radix 提供
- 为什么 React Aria（Adobe）的 hook-only 设计上手成本明显更高——Radix 提供了"组件树而非 props 钩子"的更友好抽象
- 为什么 Reach UI 这种早期 a11y 库会停更——一个 Modulz 团队全职在做的同类方案吃掉了大部分用户
- 为什么 MUI、Mantine 这种带样式的方案越来越被新项目跳过——一旦想换设计系统，重写样式比换组件库还麻烦

## 核心要点

Radix 的设计可以拆成 **三件抽象**：

1. **Slot 协议（asChild prop 替换 root DOM）**：每个原语承诺只渲染一个 DOM 节点；如果你想换那个节点（比如把默认的 button 换成 a 标签），就用 `<Dialog.Trigger asChild><MyButton/></Dialog.Trigger>`，原语会把 onClick 和 ARIA props merge 到你的 children 上。类比：插座转换头，你的设备直接插上去原插座的电流照样过。

2. **useControllableState（一个 hook 撑两种调用模式）**：每个有状态原语同时支持父组件接管（传 `open`+`onOpenChange`）和原语自管（传 `defaultOpen`）。一行三元判定 `prop !== undefined` 决定走哪条路径，受控分支同步触发 onChange，非受控分支走 effect 异步触发。类比：自动挡车，你想自己换挡（受控）就拨拨杆，懒得管（非受控）就让车自己换。

3. **分层原语 compose（Portal/FocusScope/DismissableLayer/Presence 接力）**：Dialog 这种复杂组件拆成 4 层小原语接力——Presence 决定挂不挂载、Portal 把 DOM 逃出父容器、FocusScope trap 焦点不让 tab 跑出去、DismissableLayer 监听 Esc 和外部点击。类比：医院挂号要走 4 个窗口，每个窗口只管一件事，串起来就能办成大事。

辅助层还有 createContextScope（多实例嵌套时给每个实例独立的 context 命名空间）、Presence 配 `data-state="open|closed"` 让 CSS 退场动画接管卸载时机，以及 useId 这种 SSR 友好的小工具——这些零件给上层 30+ 原语共用。

三件抽象合起来的效果：用户写的是组件树而不是 hook 调用，但内部行为和 React Aria 一样严谨；样式空间完全留给调用方。

## 实践案例

### 案例 1：最小可用的 Dialog

```tsx
import * as Dialog from '@radix-ui/react-dialog'

export function Modal() {
  return (
    <Dialog.Root>
      <Dialog.Trigger>打开</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white p-6">
          <Dialog.Title>提示</Dialog.Title>
          <Dialog.Description>这就是一个 Dialog</Dialog.Description>
          <Dialog.Close>关闭</Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
```

**逐部分解释**：

- 不用写一行 useEffect 监听 Esc，DismissableLayer 已经包好
- 不用手动 focus 第一个 input，FocusScope 已经在 mount 时 autoFocus
- ARIA 的 role / aria-labelledby / aria-describedby 全部由 Title 和 Description 自动连接

### 案例 2：用 asChild 接现有 Button

```tsx
<Dialog.Trigger asChild>
  <MyDesignSystemButton variant="primary">打开</MyDesignSystemButton>
</Dialog.Trigger>
```

**逐部分解释**：

- 不会渲染 `<button><MyDesignSystemButton/></button>` 双层；只渲染 MyDesignSystemButton 本身
- onClick / aria-haspopup / aria-expanded 全部 merge 到 MyDesignSystemButton 上
- 你原来组件库的样式 / 状态 / 主题完全保留

### 案例 3：useControllableState 单独用

```tsx
import { useControllableState } from '@radix-ui/react-use-controllable-state'

export function MyTabs({ value, defaultValue, onValueChange }) {
  const [active, setActive] = useControllableState({
    prop: value,
    defaultProp: defaultValue ?? 'tab1',
    onChange: onValueChange,
    caller: 'MyTabs',
  })
  return <button onClick={() => setActive('tab2')}>{active}</button>
}
```

**逐部分解释**：

- 一个 hook 让 MyTabs 同时支持父组件接管或自管，完全对齐 React `<input>` 的受控双模 API 设计
- caller 字段让 dev 模式 warn 信息能定位到 MyTabs，不是匿名 hook

## 踩过的坑

1. **bundle 重量不轻**——Dialog 一开就约 11kb gzip 起步（compose-refs / context / dismissable-layer / focus-scope / portal / presence / primitive 一连串依赖）；landing page 这种对体积敏感的页面，能用浏览器原生 dialog 元素就别上 Radix
2. **a11y 不自动验证**——Radix 实现了 ARIA pattern 但不检查你用对了；Dialog.Title 写空、aria-describedby 留空、Portal 容器 display:none，dev 模式只 console.warn，prod 哑的，仍要跑 axe-core 这类工具
3. **受控/非受控来回切换出诡异 bug**——同一个 setValue，受控时同步触发 onChange，非受控时要等 effect 异步触发，时机差一帧；表单提交读 value 时受控立刻拿到新值非受控有延迟
4. **createContextScope 多实例隔离**——nested popover 套 popover 时如果不传 scope，关一个会把另一个也关掉；要 `createPopoverScope()` 拿到带 `__scopePopover` prop 的隔离版组件
5. **TypeScript 类型签名爆炸**——每个原语都用 `React.ComponentRef<typeof Primitive.div>` + `ComponentPropsWithoutRef` + ScopedProps 包装，TS 报错经常出现 80+ 字符的类型 lookup，调试体验差，IDE 跳定义经常跳进 6 层 generic 嵌套

## 适用 vs 不适用场景

**适用**：

- 想自己搭设计系统但不想重写一遍 a11y 行为的团队——Radix 把 ARIA 部分包了，你只管 token 和样式
- 已经在用 Tailwind / shadcn/ui 的项目——shadcn 直接复制粘贴 Radix 包装，零迁移成本
- 需要 nested popover / multi-modal / 复杂键盘导航的产品——roving-focus 和 dismissable-layer 已经把这些边角写完
- 服务端渲染框架（Next.js / Remix）——Radix 内部已处理 useLayoutEffect 的 SSR fallback

**不适用**：

- 只需要简单 textarea / 评论框——Radix 上手成本太高
- 团队已经全身心投资 MUI / Ant Design 设计系统——切到 Radix 要重写所有样式和 token
- 体积极度敏感的 landing page / weekly newsletter renderer——单个 Dialog 约 11kb gzip 起步压不下来
- 想要"hooks 返回 props 自己组装 DOM"的极致灵活——选 React Aria

## 历史小故事（可跳过）

- **2020 年**：Modulz 团队（Stitches 作者那群人）发起 Radix Primitives，主张 a11y 应该是 React 应用层硬契约
- **2021 年**：进入公开 beta（0.1.x），30+ 原语覆盖大部分 ARIA pattern，philosophy.md 立下"一组件一 DOM node"硬规则
- **2022 年**：WorkOS 收购 Modulz（随 Series B 公告），团队继续维护 Radix；随后 shadcn 在它之上做复制粘贴分发引爆 React 生态
- **2024 年**：Vercel v0 把 Radix + shadcn 设成默认产物，生态从设计系统工具扩散到 AI 生成 UI
- **2025 年**：React 19 ref cleanup / use API 兼容路径在 Slot.tsx 落地，证明这套抽象能跨大版本

## 学到什么

- **a11y 是契约不是 feature**——把 ARIA 从"做完功能后再加"提前到"行为定义阶段强约束"，整套库的判断都从这里展开
- **一组件一 DOM node 这条硬约束反推出 Slot/asChild**——如果允许多层 wrapper，调用方根本没办法换 root tag，asChild 这条逃生通道就不存在
- **受控双模不是可选 API 而是 hook 级别的 first-class**——每个有状态原语都用同一个 useControllableState，调用方式一致；React `<input>` 怎么用 Radix 就怎么用
- **abstraction 上限取决于 compose 能力**——Dialog 不是单体组件，是 Portal/FocusScope/DismissableLayer/Presence 的接力，每一层独立可测可换

## 延伸阅读

- 官方文档：[Radix Primitives](https://www.radix-ui.com/primitives)（每个原语的 anatomy + accessibility 章节最有信息密度）
- 设计哲学：[philosophy.md](https://github.com/radix-ui/primitives/blob/main/philosophy.md)（5 大 principle 短文，5 分钟读完）
- 配套样式层：[shadcn/ui](https://ui.shadcn.com)（Radix + Tailwind 的复制粘贴分发，理解 Radix 实战首选）
- 视频：搜 "Building a Modal in Radix UI"（社区讲座，多个版本）
- [[react]] —— Radix 的所有抽象都建立在 forwardRef + cloneElement 上，先理解 React 模型再读 Radix 源码

## 关联

- [[react]] —— Radix 全靠 forwardRef + cloneElement 撑起 Slot 协议，React 18+ 是基础前提
- [[shadcn-ui]] —— 站在 Radix 之上做 Tailwind 默认样式 + 复制粘贴分发，把 Radix 推到主流
- [[tailwind]] —— 与 Radix 没有强依赖但 shadcn 默认样式层完全用 Tailwind 表达
- [[storybook]] —— Radix 自己用 Storybook 做 30+ 原语的可视化测试入口
- [[preact]] —— 设计上的对照参考，Preact 在 forwardRef 行为上有差异，Radix 的 Slot.tsx 兼容写法值得借鉴

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[shadcn-ui]] —— shadcn/ui — 把 React 组件从 npm 包变成"源码 + CLI 协议"
- [[storybook]] —— Storybook — 给 UI 组件的独立工作台
