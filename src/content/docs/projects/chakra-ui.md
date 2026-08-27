---
title: Chakra UI — 用 System + recipe 包一层 Ark 行为的 React 组件库
description: 介绍 Chakra UI v3 如何用 createSystem、recipe 和 Ark UI 组成带样式的 React 组件。
来源: https://github.com/chakra-ui/chakra-ui
日期: 2026-08-27
分类: 前端组件库
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/chakra-ui/chakra-ui
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: f8133940accf0b7de1f7c9ac4aca37e9be5e2027
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 3.36.1
---

## 是什么

Chakra UI v3 是一套 **React 组件库**：交互行为来自 Ark UI，视觉来自内部 styled-system。日常类比：Ark 先把门、锁和逃生路线按规范装好；Chakra 再刷漆、定色板，并规定按钮在 `loading` 时不能再被按。

固定包是 `@chakra-ui/react@3.36.1`，绑定提交 `f8133940accf0b7de1f7c9ac4aca37e9be5e2027`。入口先 `createSystem` 得到 `SystemContext`，再交给严格的 `ChakraProvider`。组件用 recipe / slot recipe 出 class 与 style，复杂原语直接包 `@ark-ui/react@5.37.2`。

你写：

```tsx
import { ChakraProvider, defaultSystem, Button } from "@chakra-ui/react"

export function App() {
  return (
    <ChakraProvider value={defaultSystem}>
      <Button colorPalette="teal">保存</Button>
    </ChakraProvider>
  )
}
```

`defaultSystem` 来自 `mergeConfigs(defaultBaseConfig, defaultThemeConfig)`。`ChakraProvider` 的 `value` 不是可选项。

## 为什么重要

不读固定 3.36.1 源码，下面这些事会对不上：

- 为什么不能再把 v2 的 `extendTheme` / `ColorModeProvider` 抄到 v3
- 为什么 `ChakraProvider` 不传 `value` 会直接缺 context
- 为什么 Dialog 默认卸载，而不是一直留在 DOM
- 为什么 `_dark` 只认 `.dark` 祖先，而不是库自己切 `prefers-color-scheme`

一句话：v3 把「token → recipe → Emotion 插入」和「Ark 状态机」拆开，调用方必须同时接住两边。

## 核心要点

固定版本可以拆成五步：

1. **合成 System**：`createSystem(...configs)` 合并配置，建 token 字典、breakpoints、conditions、utility，再得到 `css` / `cva` / `sva`。CSS 变量前缀默认 `chakra`，挂在 `:where(:root, :host)`。

2. **注入全局样式**：`ChakraProvider` 用 Emotion `Global` 写入 layers 与 `_global`（reset + globalCss + token CSS）。context 名是 `ChakraContext`，`strict: true`。

3. **条件选择器加下划线**：`createConditions` 把 `hover` 编成 `_hover`。`_dark` 解析为 `.dark &, .dark .chakra-theme:not(.light) &`。数组值按 breakpoint 展开。

4. **recipe 出样子**：单节点走 CVA（如 `Button`）；多 slot 走 SVA + `createSlotRecipeContext`（如 `Dialog`）。`unstyled` 可以关掉 recipe。

5. **Ark 管行为**：`Dialog.Root` 默认 `lazyMount: true`、`unmountOnExit: true`。Trigger / Content / Backdrop 都 `forwardAsChild: true`，可以把行为贴到你自己的节点上。

## 实践示例

### 案例 1：必须把 System 交给 Provider

```tsx
import { ChakraProvider, createSystem, defaultConfig, Button } from "@chakra-ui/react"

const system = createSystem(defaultConfig, {
  theme: { tokens: { fonts: { heading: { value: "Georgia, serif" } } } },
})

export function App() {
  return (
    <ChakraProvider value={system}>
      <Button>确定</Button>
    </ChakraProvider>
  )
}
```

`createSystem` 接受多份 config 再 merge。不要写 `<ChakraProvider>` 而不传 `value`——固定实现没有默认 system。

### 案例 2：Dialog 的默认挂载合同

```tsx
import { Dialog, Button } from "@chakra-ui/react"

export function Confirm() {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <Button>打开</Button>
      </Dialog.Trigger>
      <Dialog.Backdrop />
      <Dialog.Positioner>
        <Dialog.Content>
          <Dialog.Header>
            <Dialog.Title>确认</Dialog.Title>
          </Dialog.Header>
          <Dialog.Body>关闭后内容会随 unmountOnExit 卸掉。</Dialog.Body>
          <Dialog.CloseTrigger>关闭</Dialog.CloseTrigger>
        </Dialog.Content>
      </Dialog.Positioner>
    </Dialog.Root>
  )
}
```

需要保持内部状态时，必须显式改掉这两个默认，不能靠“组件还在树上”的直觉。

### 案例 3：loading 会禁用按钮

```tsx
<Button loading loadingText="提交中">提交</Button>
```

固定实现设 `type="button"`，并执行 `disabled={loading || rest.disabled}`。`asChild` 时不再插入内置 `Loader`。

## 踩过的坑

1. **把 v2 主题 API 当成 v3**：固定版本没有 `extendTheme` 主链，主题是 `createSystem` 的 tokens / recipes / slotRecipes。
2. **以为 Provider 自带暗色切换**：本包没有 ColorModeProvider；要暗色就给祖先加 `.dark`。
3. **漏装 `@emotion/react`**：它是 peer，`>=11`。factory 用 Emotion 做插入和 SSR style 标签。
4. **假设 Dialog 内容一直挂着**：默认 lazy + unmount。
5. **把 Ark 的 API 记成 Chakra 自己的**：`useDialog` / `useDialogContext` 从 `@ark-ui/react/dialog` 再导出。

## 适用 vs 不适用场景

**适用**：

- 需要带样式的 React 组件，同时把无样式行为交给 Ark
- 接受 Emotion runtime 与 `createSystem` 的 token/recipe 合同
- React 18 或 19 的应用，愿意自己管理 `.dark`

**不适用**：

- 还停在 Chakra v2 的 `style props + ColorModeProvider` 心智，又想零改动升级
- 不能接受 `@emotion/react` 或 Ark 作为行为底座
- 需要 Vue / 纯 CSS 文件分发，而不是 JS system
- 想把静态阅读写成已运行的 a11y / bundle 结论

## 固定版本边界

- 本文绑定 `chakra-ui/chakra-ui@f8133940...`，annotated tag 与 package 均为 `@chakra-ui/react@3.36.1`。
- 依赖 `@ark-ui/react@5.37.2`；peer 为 `@emotion/react>=11`、`react>=18`、`react-dom>=18`。
- `package.json` 描述仍写 Emotion，这和 factory 的插入路径一致，不能理解成“已经改成零 runtime CSS”。
- 本文未安装依赖、运行上游测试、打开 Storybook 或测量体积，状态保持 `UNVERIFIED`。

## 学到什么

1. **System 是对象，不是全局单例**——`defaultSystem` 只是预合成结果；换 token 就要 `createSystem` 再传进 Provider。
2. **样式合同和行为合同可以来自两个包**——recipe 管 class/css，Ark 管 open/focus/dismiss。
3. **条件选择器是编出来的**——`_hover` / `_dark` 必须按 `preset-base` 的 selector 读，不能靠 CSS 常识外推。
4. **默认卸载是状态边界**——lazyMount + unmountOnExit 会丢掉未受控的内部 state。

## 应用型自测

1. `<ChakraProvider>` 不传 `value`，固定 3.36.1 会不会自动使用 `defaultSystem`？
2. 未改默认的 `Dialog.Root` 关闭后，Content 是否仍留在文档里？
3. 只调用 `ChakraProvider`、不给祖先加 `.dark`，`_dark` token 会不会按系统深色偏好生效？

检查点：

1. 不会。`value` 是必填 `SystemContext`。
2. 不会；默认 `unmountOnExit` 与 `lazyMount` 均为 true。
3. 不会；`_dark` 只匹配 `.dark` 祖先。

## 延伸阅读

- 文档：[chakra-ui.com](https://chakra-ui.com/)
- 固定源码：[chakra-ui/chakra-ui](https://github.com/chakra-ui/chakra-ui) —— 本文绑定提交 `f8133940accf0b7de1f7c9ac4aca37e9be5e2027`
- [[mantine]] —— 同赛道：CSS 变量 + Styles API，而不是 System + Ark
- [[radix-ui]] —— 无样式原语；Chakra v3 选的是 Ark，不是 Radix
- [[emotion]] —— factory 的 runtime 插入依赖

## 关联

- [[mantine]] —— 带样式的 React 组件库；分发模型是 CSS 文件而不是 createSystem
- [[radix-ui]] —— Headless 原语对照
- [[shadcn-ui]] —— 源码复制协议，不是 npm 组件运行时
- [[react]] —— peer 运行时
- [[emotion]] —— 样式插入

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
