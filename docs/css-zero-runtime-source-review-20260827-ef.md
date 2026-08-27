# CSS zero-runtime source review

> 用途：记录 vanilla-extract、StyleX 项目页迁移所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer EF
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与文档阅读
- not executed：未安装两仓依赖，未运行上游 test、bundle、dev server 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git
- target note：原指令是 vanilla-extract + linaria；`linaria` 与 `open-props` 在 Study 均无既有项目页。按 fallback 选择同主题既有页 `stylex`，排除 tailwind / unocss / styled-components / emotion / sass。

## vanilla-extract

- canonical source：`https://github.com/vanilla-extract-css/vanilla-extract`
- revision：`235de1739b5cc123ee12d12a2c0b80c6b31726a4`
- git tag：`@vanilla-extract/css@1.21.2`（annotated tag `c7f7fc32...` → 该 commit）
- package：`@vanilla-extract/css@1.21.2`；同提交 `@vanilla-extract/recipes@0.5.7`
- inspected：
  - `README.md`
  - `packages/css/package.json`
  - `packages/css/src/index.ts`
  - `packages/css/src/style.ts`
  - `packages/css/src/adapter.ts`
  - `packages/css/src/identifier.ts`
  - `packages/css/src/fileScope.ts`
  - `packages/css/src/theme.ts`
  - `packages/css/src/vars.ts`
  - `packages/css/src/transformCss.ts`
  - `packages/css/src/runtimeAdapter.ts`
  - `packages/css/src/recipe.ts`
  - `packages/integration/src/compile.ts`
  - `packages/integration/src/processVanillaFile.ts`
  - `packages/integration/src/filters.ts`
  - `packages/recipes/package.json`
  - `packages/recipes/src/index.ts`
  - `packages/recipes/src/createRuntimeFn.ts`
- observed：
  - `.css.ts` / `.css.js` 等由 `cssFileFilter` 识别；`getFileScope()` 在没有 file scope 时抛错；
  - `compile()` 用 esbuild 把样式文件打成 Node bundle，external `@vanilla-extract`；
  - `processVanillaFile` 用 `eval` 包执行源码，经 adapter 收集 CSS，再用自研 `transformCss` 展开，不是 Node `vm`，也不是 stylis；
  - `style()` 返回类名字符串；传入数组时走 composition，可合并已有 class 与新规则；`composeStyles` 已 deprecated；
  - identifier 是 `@emotion/hash(filePath[+packageName])` + base36 ref counter；`identOption` 为 `debug` / `short` / 自定义函数；
  - `createTheme` 生成 class 并 `assignVars`；tokens 与 contract 不匹配会抛错；
  - `@vanilla-extract/css` 入口会装 browser `runtimeAdapter`，未抽取时会 `injectStyles`；抽取后的模块导出是字符串或序列化 recipe 函数；
  - `recipe()` 在 build 时用 `style` / `styleVariants` 生成类名表，运行时 `createRuntimeFn` 按 variant / compound 拼串；
  - npm 未发布 `gitHead`；身份由 annotated tag 与 package 版本对齐。
- provenance：
  - Git tag `@vanilla-extract/css@1.21.2` 与 npm `@vanilla-extract/css@1.21.2` 指向同一可达 commit。

## StyleX

- canonical source：`https://github.com/facebook/stylex`
- revision：`5f51b24444abced04b213726977b9d67339bb26d`
- git tag：`0.19.0`（annotated tag `9dc40295...` → 该 commit）
- package：`@stylexjs/stylex@0.19.0`；同提交 `@stylexjs/babel-plugin@0.19.0`、`@stylexjs/unplugin@0.19.0`
- inspected：
  - `README.md`
  - `packages/@stylexjs/stylex/package.json`
  - `packages/@stylexjs/stylex/src/stylex.js`
  - `packages/@stylexjs/stylex/src/inject.js`
  - `packages/@stylexjs/babel-plugin/src/shared/stylex-create.js`
  - `packages/@stylexjs/babel-plugin/src/shared/stylex-create-theme.js`
  - `packages/@stylexjs/babel-plugin/src/shared/utils/convert-to-className.js`
  - `packages/@stylexjs/babel-plugin/src/shared/utils/generate-css-rule.js`
  - `packages/@stylexjs/babel-plugin/src/shared/utils/default-options.js`
  - `packages/@stylexjs/babel-plugin/src/shared/when/when.js`
  - `packages/@stylexjs/babel-plugin/src/visitors/stylex-create.js`
  - `packages/@stylexjs/unplugin/package.json`
- observed：
  - `stylex.create` / `defineVars` / `createTheme` / `defineConsts` / `keyframes` 在未编译时直接 throw；
  - 真正的运行时是 `props()` / `attrs()`，用 `styleq` 合并 className 与 inline style；
  - babel 把每个 property/value/pseudo/at-rule 编成原子 class；hash 输入为 `dashedKey + value + modifiers`，默认前缀 `x`；
  - 默认 `styleResolution` 是 `property-specificity`，规则带 `getPriority` 数值；`:where()` 主要用于 `stylex.when` 关系选择器，不是给每条规则锁 specificity 0；
  - `createTheme` 只能覆盖 `defineVars()` 产生的 var group（需要 `__varGroupHash__`）；
  - `@stylexjs/unplugin` 导出 vite / webpack / esbuild / rollup / rspack / rolldown / bun 入口；另有 `@stylexjs/postcss-plugin` 与官方 examples；
  - npm `gitHead`、Git tag `0.19.0` 与 commit message `[release] v0.19.0` 一致。
- provenance：
  - npm `@stylexjs/stylex@0.19.0` 的 `gitHead` 与 GitHub tag `0.19.0` 指向同一可达 commit。
