---
title: MUI — Material UI 的 createTheme / ThemeProvider 分叉
description: 介绍 @mui/material 9.3.1 默认走 createThemeNoVars，以及 ThemeProvider 如何按 colorSchemes 分叉到 CssVarsProvider。
来源: 'https://github.com/mui/material-ui'
日期: 2026-08-27
分类: 基础组件
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/mui/material-ui
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 5b91ac75008dbd43286a20ef87847042cc7a44ca
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 9.3.1
---

## 是什么

MUI（npm 包 `@mui/material`，仓库 `mui/material-ui`）是一份实现 Material Design 的 React 组件库。日常类比：像一套可以换灯的展厅——默认仍用旧电路（`createThemeNoVars`），你显式打开 `cssVariables` 才换成墙上的开关和电表（`CssVarsProvider` + localStorage）。

你写：

```tsx
import { ThemeProvider, createTheme } from '@mui/material/styles';
import Button from '@mui/material/Button';

const theme = createTheme({ palette: { primary: { main: '#1976d2' } } });

<ThemeProvider theme={theme}>
  <Button variant="contained">Save</Button>
</ThemeProvider>
```

固定 9.3.1 里，`createTheme()` 默认 `cssVariables: false`。options 里没有 `colorSchemes` 时，实现走 `createThemeNoVars`，注释写明「和 v5 一样」。`ThemeProvider` 再看 theme 有没有 `colorSchemes`，决定渲染 `ThemeProviderNoVars` 还是 `CssVarsProvider`。

## 为什么重要

不读固定 monorepo 提交，下面这些合同很容易被「MUI 已经全面 CSS variables」的二手文章带偏：

- 为什么默认 `createTheme()` 不会写 `mui-mode` 进 localStorage
- 为什么上层已经开了 CSS variables，内层普通 theme 要把 `vars` 设成 `null`
- 为什么 `import { makeStyles } from '@mui/material/styles'` 现在一调用就抛错
- 为什么 Button 的样式入口是 `zero-styled` 的 `slot: 'Root'`，不是旧的 `withStyles`

## 核心要点

固定版本的主链可以拆成五步：

1. **`createTheme(options)` 先分叉**：`cssVariables === false` 且 options 不含 `colorSchemes` → `createThemeNoVars`。`cssVariables: true` → `createThemeWithVars`。只有你把 `colorSchemes` 写进 options，无变量路径才会在 no-vars theme 上再挂 `colorSchemes`。

2. **`createThemeNoVars` 拼完整 theme**：palette、typography、mixins、shadows、transitions、zIndex，再加上 `styleFunctionSx` 用的 `unstable_sxConfig`。`alpha` / `lighten` / `darken` 在存在 `vars` 或 `colorSpace` 时改走 CSS 函数，而不是立刻算出一个 hex。

3. **`ThemeProvider` 看结构选实现**：theme 没有 `colorSchemes` 时走 `ThemeProviderNoVars`；若也没有 `vars`，会补 `vars: null`，防止继承上层 CSS 变量。有 `colorSchemes` 则交给 `CssVarsProvider`。

4. **`CssVarsProvider` 管 mode**：默认 `defaultMode='system'`，`modeStorageKey='mui-mode'`，`colorSchemeStorageKey='mui-color-scheme'`，storage 默认 `window.localStorage`。`useCurrentColorScheme` 读 mode / scheme 并提供 setter。

5. **组件用 slot + class 组合**：`Button` 是 `styled(ButtonBase, { name: 'MuiButton', slot: 'Root' })`，再用 `composeClasses` 拼 `variant` / `size` / `color`。`@emotion/react` 与 `@mui/material-pigment-css` 都是 optional peer。

## 实践示例

### 案例 1：默认 theme 不会进入 CssVarsProvider

```tsx
import { ThemeProvider, createTheme } from '@mui/material/styles';
import Button from '@mui/material/Button';

const theme = createTheme(); // cssVariables 默认 false

export function App() {
  return (
    <ThemeProvider theme={theme}>
      <Button variant="contained">默认 no-vars</Button>
    </ThemeProvider>
  );
}
```

这时 theme 对象没有 `colorSchemes`。`ThemeProvider` 走 `ThemeProviderNoVars`，并且因为没有 `vars` 字段，会把 `vars` 设成 `null`。

### 案例 2：打开 CSS variables 与系统 mode

```tsx
import { ThemeProvider, createTheme } from '@mui/material/styles';

const theme = createTheme({
  cssVariables: true,
  colorSchemes: { light: true, dark: true },
});

<ThemeProvider theme={theme} defaultMode="system">
  {children}
</ThemeProvider>
```

`cssVariables: true` 让 `createTheme` 调用 `createThemeWithVars`。`ThemeProvider` 看到 `colorSchemes` 后改渲染 `CssVarsProvider`。默认 mode 是 `system`；没自定义 storage 时写 `localStorage['mui-mode']`。SSR 要对齐首屏，需要自己处理 `noSsr` / `InitColorSchemeScript`，本文未运行这段路径。

### 案例 3：makeStyles 从 @mui/material/styles 再导入会炸

```ts
import { makeStyles } from '@mui/material/styles';

const useStyles = makeStyles(); // 固定实现直接 throw
```

`styles/makeStyles.js` 只抛一句：请从 `@mui/styles` 引入。`withStyles` / `withTheme` 同样是会抛错的空壳。v4 教程里的 API 不是 9.3.1 的默认导出。

## 踩过的坑

1. **把「仓库里有 CssVarsProvider」当成默认开**：默认 `createTheme()` 不走那条路径。
2. **内层自定义 theme 却继承了外层 CSS 变量**：no-vars 路径靠 `vars: null` 切断；自己手拼 theme 时漏掉这个字段就会串味。
3. **继续从 `@mui/material/styles` 引 `makeStyles`**：调用即异常，不是 silently noop。
4. **把 Emotion 写成硬依赖**：它是 optional peer；Pigment CSS 也是 optional。具体打包结果要以目标 bundler 实测为准，本文未测。

## 适用 vs 不适用场景

**适用**：

- 要一套开箱即用的 Material 视觉，而不是自己画 Button
- React 17/18/19 都能接（peer 写成这三段）
- 需要 `sx` / `styled` 与 theme.palette 同一套尺度

**不适用**：

- 只要无样式可访问原语 → [[radix-ui]]
- 要把组件文件复制进应用仓库 → [[shadcn-ui]]
- 想靠 `makeStyles` 继续写 v4 样式层
- 还没决定是否打开 CSS variables，却把「系统暗色自动生效」写成默认事实

## 固定版本边界

- 本文绑定 `mui/material-ui@5b91ac75008dbd43286a20ef87847042cc7a44ca`，annotated tag / npm `@mui/material` 均为 `9.3.1`。
- npm tarball 未提供 `gitHead`；升级前应重新核对 tag 与打包提交是否仍一致。
- peer：`react` / `react-dom` `^17 || ^18 || ^19`；Emotion 与 Pigment CSS optional。
- 包 `engines.node` 写 `>=14.0.0`，这是上游声明，不是本仓库工具链。
- 本文未安装依赖、运行 unit test 或测量 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **默认值比营销页更硬**——v9 仍然把 no-vars 当 `createTheme()` 的默认出口。
2. **Provider 看的是 theme 形状**——有没有 `colorSchemes` 决定走哪条实现，不是看包名。
3. **废弃导出可以是 throw**——`makeStyles` 留在 barrel 里是为了报错，不是为了兼容。
4. **slot 名是样式合同**——`MuiButton` / `Root` 比「一个 className」更接近当前实现。

## 应用型自测

1. `createTheme()` 不传参。`ThemeProvider` 会不会挂 `CssVarsProvider`、写 `mui-mode`？
2. 外层 theme 开了 CSS variables，内层传入一个没有 `vars`、也没有 `colorSchemes` 的普通 theme。内层为什么要补 `vars: null`？
3. `import { makeStyles } from '@mui/material/styles'` 然后调用，9.3.1 会怎样？

检查点：

1. 不会。默认走 `createThemeNoVars` + `ThemeProviderNoVars`。
2. 切断对上层 CSS 变量 theme 的继承，避免 docs/demo 那种嵌套串味。
3. 立刻 throw，提示改从 `@mui/styles` 引入。

## 延伸阅读

- 官方文档：[mui.com/material-ui](https://mui.com/material-ui/)
- 固定源码：[mui/material-ui](https://github.com/mui/material-ui) —— 本文绑定提交 `5b91ac75008dbd43286a20ef87847042cc7a44ca`
- [[antd]] —— 对照 ConfigProvider 默认就把 token 算进 cssinjs
- [[emotion]] —— optional 样式引擎
- [[styled-components]] —— 另一条 CSS-in-JS 历史线

## 关联

- [[antd]] —— 企业后台皮肤库，Provider / 静态方法合同不同
- [[react]] —— 组件模型与 peer
- [[radix-ui]] —— 无样式对照
- [[shadcn-ui]] —— 源码分发对照
- [[emotion]] —— ThemeProvider 常见的 styled engine
- [[storybook]] —— 组件文档工作台

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
