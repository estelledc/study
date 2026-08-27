# CSS-in-JS source review AU

> 用途：记录 styled-components、Emotion 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：parallel writer AU
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行上游 test、dev server、SSR、RSC、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git
- target pair：`styled-components` 与 `emotion`
- forbidden overlap：未修改开放 PR 已占用 slug（含 `tailwind`、`stylex` 未在本轮改写；未碰 A–Z / 开放 PR 中的 `zustand`、`jotai`、`tanstack-query`、`swr`、`react-hook-form` 等）

## styled-components

- canonical source：`https://github.com/styled-components/styled-components`
- revision：`159302389c696a7952aaed31d840b06b8aa6d677`
- release tag / package：`styled-components@6.5.3` / `styled-components@6.5.3`
- inspected：
  - `packages/styled-components/package.json`
  - `packages/styled-components/src/index.ts`
  - `packages/styled-components/src/base.ts`
  - `packages/styled-components/src/constants.ts`
  - `packages/styled-components/src/constructors/styled.tsx`
  - `packages/styled-components/src/constructors/constructWithOptions.ts`
  - `packages/styled-components/src/constructors/css.ts`
  - `packages/styled-components/src/models/StyledComponent.ts`
  - `packages/styled-components/src/models/ComponentStyle.ts`
  - `packages/styled-components/src/models/ServerStyleSheet.tsx`
  - `packages/styled-components/src/models/StyleSheetManager.tsx`
  - `packages/styled-components/src/models/ThemeProvider.tsx`
  - `packages/styled-components/src/utils/hash.ts`
  - `packages/styled-components/src/utils/generateComponentId.ts`
  - `packages/styled-components/src/utils/checkDynamicCreation.ts`
  - `packages/styled-components/src/utils/rscCache.ts`
  - `packages/styled-components/docs/faq.md`
- observed：
  - `styled` 把 HTML 标签快捷方式预挂到 `baseStyled`；模板经 `css()` 展平后交给 `createStyledComponent`；
  - 默认 `componentId` 来自 displayName、每名计数和 `SC_VERSION` 的 djb2 → base-52 字母名，不是运行时读取文件路径；
  - 动态 class 由 `phash(baseHash, stylis.hash, css)` 决定，并写入 `dynamicNameCache`，上限对齐 `warnTooManyClasses`；
  - `$` 前缀与 `as` 不转发到 DOM；未知 HTML prop 在开发态警告；
  - `IS_RSC` 定义为 `typeof React.createContext === 'undefined'`：ThemeProvider 变 no-op，样式以内联 `<style data-styled>` 发出，并用 `React.cache` 去重；
  - 传统 SSR 仍用 `ServerStyleSheet.collectStyles` / `getStyleTags` / `interleaveWithNodeStream`；
  - peer React `>= 16.8.0`，`engines.node` `>= 16`，运行时依赖 `stylis@4.3.6` 与 `@emotion/is-prop-valid@1.4.0`。
- provenance：
  - GitHub annotated tag `styled-components@6.5.3` 解引用到 `159302389c696a7952aaed31d840b06b8aa6d677`；
  - npm `styled-components@6.5.3` 版本一致，但不暴露可比的 `gitHead`；
  - 同仓存在 `7.0.0-prerelease-*`，本页不绑定预发布。

## Emotion

- canonical source：`https://github.com/emotion-js/emotion`
- revision：`3c19ce5997f73960679e546af47801205631dfde`
- packages at this commit：`@emotion/react@11.14.0`、`@emotion/cache@11.14.0`、`@emotion/styled@11.14.0`、`@emotion/serialize@1.3.3`
- inspected：
  - `packages/react/package.json`
  - `packages/react/src/index.ts`
  - `packages/react/src/css.ts`
  - `packages/react/src/jsx.ts`
  - `packages/react/src/emotion-element.tsx`
  - `packages/react/src/context.tsx`
  - `packages/react/src/theming.tsx`
  - `packages/styled/package.json`
  - `packages/styled/src/base.tsx`
  - `packages/cache/package.json`
  - `packages/cache/src/index.ts`
  - `packages/serialize/src/index.ts`
  - `packages/hash/src/index.ts`
  - `packages/server/src/index.js`
  - `packages/server/src/create-instance/index.js`
  - `packages/server/src/create-instance/extract-critical-to-chunks.js`
- observed：
  - `css()` 只是 `serializeStyles`；className 为 `${cache.key}-${serialized.name}`；
  - 哈希是 `@emotion/hash` 的 MurmurHash2，不是旧文里的笼统 “mhash”；
  - 浏览器默认 cache key 为 `css`；开发态必须提供合法 key；
  - 插入走 `useInsertionEffectAlwaysWithSyncFallback`；服务端返回 `<style data-emotion>`；
  - `@emotion/server` 默认导出绑定 `@emotion/css` 全局 cache；React 树必须 `create-instance` 并传入同一 cache，且 helper 会设 `cache.compat = true`；
  - `css` prop 依赖自定义 jsx 工厂；默认主题是空对象；
  - peer React `>= 16.8.0`；cache 依赖 `stylis@4.2.0`。
- provenance：
  - annotated tags `@emotion/react@11.14.0` 与 `@emotion/cache@11.14.0`，以及 npm `gitHead`，都解到 `3c19ce5997f73960679e546af47801205631dfde`；
  - 同提交的 `@emotion/styled` 仍是 `11.14.0`；
  - npm latest `@emotion/styled@11.14.1` 的 `gitHead` 是更晚的 `49229553967b6050c92d9602eb577bdc48167e91`，不能外推到本页。
