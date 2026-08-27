---
title: Mantine — CSS 变量与 Styles API 驱动的 React 组件库
description: 介绍 Mantine 9 如何用 CSS 产物、Provider 主题合并和 Styles API 覆盖 React 组件。
来源: https://github.com/mantinedev/mantine
日期: 2026-08-27
分类: 前端组件库
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/mantinedev/mantine
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 8a284e2c2c53a9cb6f39f5dc389bf41b7a2073f8
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 9.5.2
---

## 是什么

Mantine 是一套 **React 组件库**，核心包 `@mantine/core` 用 CSS 文件 + CSS 变量画样子，再用 Styles API 让每个组件按 slot 改 class 和 style。日常类比：先发一套已经刷好漆的标准件；你要换颜色，是改墙上的开关（theme / CSS 变量），不是把每扇门拆开重刷。

固定版本是 monorepo tag `9.5.2`，提交 `8a284e2c2c53a9cb6f39f5dc389bf41b7a2073f8`。`@mantine/core@9.5.2` 的 peer 是 `react^19.2.0`、`react-dom^19.2.0` 和同版本 `@mantine/hooks`。Emotion 不在 core 依赖里；要 CSS-in-JS 另装 `@mantine/emotion`。

你写：

```tsx
import '@mantine/core/styles.css'
import { MantineProvider, Button } from '@mantine/core'

export function App() {
  return (
    <MantineProvider>
      <Button>保存</Button>
    </MantineProvider>
  )
}
```

`MantineProvider` 会注入主题、颜色方案和（默认开启的）CSS 变量。`useMantineTheme` 找不到 Provider 会 throw。

## 为什么重要

不读固定 9.5.2 源码，下面这些事会对不上：

- 为什么只包 `MantineProvider`、不导入 `styles.css`，静态类还在、视觉却空
- 为什么 `createTheme({ primaryColor: 'teal' })` 本身不合并默认主题
- 为什么 React 18 项目不能直接装这个 major
- 为什么表单校验能接 Zod，却不必把 Zod 写进 `@mantine/form` 的生产依赖

一句话：Mantine 9 把「CSS 产物」和「theme / Styles API」分开，调用方必须同时接住样式文件和 Provider 合同。

## 核心要点

固定版本可以拆成五步：

1. **CSS 先于组件**：`@mantine/core` 把 `*.css` 标成 sideEffects，并导出 `./styles.css` 与 `./styles.layer.css`。Provider 源码还会 import `baseline.css` / `global.css` / `default-css-variables.css`。

2. **Provider 管三件事**：颜色方案（默认 `light`，`localStorageColorSchemeManager`）、主题合并、CSS 变量挂载。`forceColorScheme` 会忽略 manager。`cssVariablesSelector` 默认写到 `:root`（变量选择器字段默认 `:root`，文档注释同时提到 `:host`）。

3. **`createTheme` 只是 identity**：真正的 merge 在 `MantineThemeProvider`，调用 `mergeMantineTheme(inherit ? parentTheme : DEFAULT_THEME, theme)`。非法 `primaryColor` / `primaryShade` 会 throw。默认主题是 `primaryColor: 'blue'`、`primaryShade: { light: 6, dark: 8 }`、`defaultRadius: 'md'`。

4. **Styles API 按 slot 拼 class**：`useStyles` 组合 CSS module、`mantine-{Name}-{selector}` 静态类、theme.components 覆盖、`vars` 和 inline `style`。`HeadlessMantineProvider` 关掉静态类和 CSS 变量。

5. **表单是另一个包**：`@mantine/form` 的 `useForm` 默认 `mode: 'controlled'`。`schemaResolver` 走 Standard Schema 的 `schema['~standard'].validate`，所以 Zod 4 可以当输入，但不是 form 的运行时依赖。

## 实践示例

### 案例 1：覆盖主题必须经过 Provider merge

```tsx
import '@mantine/core/styles.css'
import { MantineProvider, createTheme, Button } from '@mantine/core'

const theme = createTheme({
  primaryColor: 'teal',
  defaultRadius: 'xl',
})

export function App() {
  return (
    <MantineProvider theme={theme}>
      <Button>确定</Button>
    </MantineProvider>
  )
}
```

`createTheme` 原样返回对象。合并、校验和 CSS 变量生成都在 Provider 里发生。把 `primaryColor` 写成不存在的 key 会在 `mergeMantineTheme` 抛错。

### 案例 2：Button 用变量而不是内联调色盘

```tsx
<Button variant="light" color="teal" size="compact-sm" leftSection="+">
  新建
</Button>
```

固定实现用 `polymorphicFactory` + `createVarsResolver`，把颜色写进 `--button-bg` / `--button-color` 等变量。`size` 允许 `compact-${MantineSize}`。`component` 可以把根节点换成 `a`。

### 案例 3：用 Standard Schema 接校验

```tsx
import { useForm, schemaResolver } from '@mantine/form'
import { z } from 'zod'

const schema = z.object({ email: z.string().email() })

const form = useForm({
  mode: 'controlled',
  initialValues: { email: '' },
  validate: schemaResolver(schema),
})
```

`schemaResolver` 只认 `~standard.validate`。同步 schema 默认仍包成 Promise，除非传入 `{ sync: true }`。

## 踩过的坑

1. **漏导入 CSS**：core 的静态类名在，没有 `styles.css` 就没有默认视觉。
2. **把 `createTheme` 当成会 merge 的函数**：它不深合并 `DEFAULT_THEME`；merge 只发生在 Provider。
3. **按 React 18 peer 来装 9.5.2**：固定 `package.json` 写的是 `react^19.2.0`。
4. **以为 core 依赖 Emotion**：Emotion 在仓库根的开发依赖和可选 `@mantine/emotion` 里，不在 `@mantine/core` 生产依赖。
5. **把 `useForm` 默认当成非受控**：默认 `mode` 是 `'controlled'`，`validateInputOnChange` / `validateInputOnBlur` 默认都是 false。

## 适用 vs 不适用场景

**适用**：

- 已经或准备使用 React 19.2+ 的应用，需要带样式的完整组件面
- 想用 CSS 变量和 `classNames` / `styles` / `vars` 做设计系统覆盖
- 需要独立的 `@mantine/form`、dates、charts 等可选包

**不适用**：

- 必须停在 React 18
- 只要无样式原语（更接近 [[radix-ui]]）或源码复制协议（[[shadcn-ui]]）
- 不能接受导入 CSS 产物，或必须把 Emotion 当作唯一样式运行时
- 想把静态阅读写成已测量的包体积或 a11y 运行结论

## 固定版本边界

- 本文绑定 `mantinedev/mantine@8a284e2c...`，tag 与 package 均为 `9.5.2`。
- `@mantine/core` peer：`react^19.2.0`、`react-dom^19.2.0`、`@mantine/hooks@9.5.2`。
- `@mantine/form` 另依赖 `@standard-schema/spec` 与 `klona`；Zod 只出现在 form 的 devDependencies。
- `HeadlessMantineProvider` 不会写入 CSS 变量，也不能代替 `styles.css`。
- 本文未安装依赖、运行 Jest / Storybook 或测量 CSS 体积，状态保持 `UNVERIFIED`。

## 学到什么

1. **CSS 产物和 theme 对象是两条线**——Provider 可以注入变量，但默认皮肤仍来自打包好的 CSS。
2. **identity helper 不等于 merge**——`createTheme` 只方便类型；合并规则在 `mergeMantineTheme`。
3. **Styles API 是覆盖面，不是另一套 CSS-in-JS**——slot class + CSS 变量 + 可选 stylesTransform。
4. **表单校验协议比具体库更稳定**——Standard Schema 让 resolver 不绑死 Zod。

## 应用型自测

1. 只渲染 `<MantineProvider><Button/></MantineProvider>`、不导入 `styles.css`，固定 9.5.2 是否保证默认视觉？
2. `createTheme({ primaryColor: 'teal' })` 会不会自己深合并 `DEFAULT_THEME`？
3. `@mantine/core@9.5.2` 的 React peer 是否包含 18.x？

检查点：

1. 不保证。默认视觉依赖 CSS 入口。
2. 不会；merge 发生在 `MantineThemeProvider`。
3. 不包含；peer 是 `^19.2.0`。

## 延伸阅读

- 文档：[mantine.dev](https://mantine.dev/)
- 固定源码：[mantinedev/mantine](https://github.com/mantinedev/mantine) —— 本文绑定提交 `8a284e2c2c53a9cb6f39f5dc389bf41b7a2073f8`
- [[chakra-ui]] —— 同赛道：System + Ark + Emotion factory
- [[react]] —— peer 运行时，本包要求 19.2+
- [[radix-ui]] —— 无样式原语对照

## 关联

- [[chakra-ui]] —— 带样式 React 组件库；行为底座是 Ark，样式是 createSystem
- [[radix-ui]] —— Headless 原语
- [[shadcn-ui]] —— 复制源码而不是 npm 运行时
- [[react]] —— peer 运行时
- [[emotion]] —— 可选 `@mantine/emotion`，不是 core 默认路径

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
