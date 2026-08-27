# Component library source review (writer AT)

> 用途：记录 Ant Design、MUI 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer AT
- evidence：GitHub release/tag metadata、npm latest 版本号、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行上游 test、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git
- excluded slugs：open PR #47-#85 已占用的页面，包括 `radix-ui`、`shadcn-ui`、`chakra`、`mantine`

## Ant Design

- canonical source：`https://github.com/ant-design/ant-design`
- revision：`164a310f742f801c49b3ff748b2823d5596104bd`
- package：`antd@6.6.1`
- tag：`6.6.1`（lightweight tag 指向上述 commit）
- inspected：
  - `package.json`
  - `components/config-provider/index.tsx`
  - `components/config-provider/context.ts`
  - `components/config-provider/hooks/useTheme.ts`
  - `components/theme/context.ts`
  - `components/theme/useToken.ts`
  - `components/theme/internal.ts`
  - `components/theme/themes/seed.ts`
  - `components/theme/themes/default/theme.ts`
  - `components/app/App.tsx`
  - `components/app/useApp.ts`
  - `components/message/index.tsx`
  - `components/button/Button.tsx`
  - `components/button/style/index.ts`
- observed：
  - peer 要求 `react` / `react-dom` `>=18.0.0`；行为组件依赖 `@rc-component/*` 与 `@ant-design/cssinjs`；
  - `ConfigProvider` 合并 parent context、locale、size、disabled、theme 与按组件覆盖；`prefixCls` 默认 `ant`；
  - `useTheme` 默认继承 parent；`inherit: false` 回落到 `defaultConfig`，但仍保留 parent 的 `hashed` / `cssVar`；
  - seed 默认 `colorPrimary=#1677ff`、`fontSize=14`、`borderRadius=6`、`controlHeight=32`；无 `algorithm` 时用 `themes/default/theme` 的 `createTheme(defaultDerivative)`；
  - `useToken` 调 `@ant-design/cssinjs` 的 `useCacheToken`，`salt` 为 `version-hashed`，并始终构造 `cssVar.{prefix,key}`；
  - `theme.zeroRuntime` 自 6.0.0 起存在，为真时不在运行时注入样式，调用方需自行引入 CSS；
  - `App` 用 `useMessage` / `useNotification` / `useModal` 提供带 holder 的 API；静态 `message.*` 走 `document.createDocumentFragment()` + `ConfigProvider.config({ holderRender })`，动态 theme 不会自动进静态方法；
  - `Button` 的 `type` 映射到 `[color, variant]`（`primary → ['primary','solid']`）；`ghost` 把 `solid` 改成 `outlined`。
- provenance：
  - GitHub latest release、npm latest 与 lightweight tag 均为 `6.6.1`；
  - npm `gitHead` 与 tag commit `164a310f742f801c49b3ff748b2823d5596104bd` 一致。

## MUI / Material UI

- canonical source：`https://github.com/mui/material-ui`
- revision：`5b91ac75008dbd43286a20ef87847042cc7a44ca`
- package：`@mui/material@9.3.1`
- tag：`v9.3.1`（annotated object 指向上述 commit）
- inspected：
  - `package.json`
  - `packages/mui-material/package.json`
  - `packages/mui-material/src/styles/createTheme.ts`
  - `packages/mui-material/src/styles/createThemeNoVars.js`
  - `packages/mui-material/src/styles/ThemeProvider.tsx`
  - `packages/mui-material/src/styles/index.js`
  - `packages/mui-material/src/styles/makeStyles.js`
  - `packages/mui-material/src/Button/Button.js`
  - `packages/mui-system/src/cssVars/createCssVarsProvider.js`
  - `packages/mui-system/src/styleFunctionSx/styleFunctionSx.js`
- observed：
  - `@mui/material` peer 为 React 17/18/19；`@emotion/react`、`@emotion/styled` 与 `@mui/material-pigment-css` 都是 optional peer；
  - `createTheme()` 默认 `cssVariables: false`，且 options 不含 `colorSchemes` 时走 `createThemeNoVars`（注释写明与 v5 行为一致）；
  - `cssVariables: true` 才进入 `createThemeWithVars`；
  - `ThemeProvider` 在 theme 没有 `colorSchemes` 时用 `ThemeProviderNoVars`，必要时把 `vars` 设为 `null` 以免继承上层 CSS 变量；有 `colorSchemes` 则走 `CssVarsProvider`；
  - `CssVarsProvider` 默认 `defaultMode='system'`，storage key 默认 `mui-mode` / `mui-color-scheme`，storage 默认 `window.localStorage`；
  - `Button` 用 `zero-styled` 的 `styled(ButtonBase, { slot: 'Root' })` + `composeClasses`；
  - `@mui/material/styles` 导出的 `makeStyles` / `withStyles` / `withTheme` 被调用即抛错，要求改从 `@mui/styles` 引入。
- provenance：
  - GitHub latest *stable* release 与 npm `@mui/material` latest 均为 `9.3.1`；
  - 已发布 tarball 未带 `gitHead`；本审查绑定可达且内部一致的 GitHub annotated tag commit，不猜测 npm 打包提交。
