# Design-system source review

> 用途：记录 polaris、carbon-design 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行上游 test、Storybook、Sass 编译、bundle 或视觉 / 无障碍 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git

## polaris

- canonical source：`https://github.com/Shopify/polaris`
- resolved GitHub identity（accessed 2026-08-27）：`Shopify/polaris` 重定向到已归档的 `Shopify/polaris-react-archive`
- revision：`b0a13b7a5058817c3dcf7346020c9e4a44be8148`
- package：`@shopify/polaris@13.9.5`（workspace `polaris-react`）；companion `@shopify/polaris-tokens@9.4.2`
- inspected：
  - `README.md`
  - `LICENSE.md`
  - `package.json`
  - `polaris-react/package.json`
  - `polaris-react/README.md`
  - `polaris-react/src/index.ts`
  - `polaris-react/src/configure.ts`
  - `polaris-react/src/components/AppProvider/AppProvider.tsx`
  - `polaris-react/src/components/AppProvider/tests/AppProvider.test.tsx`
  - `polaris-react/src/components/Button/Button.tsx`
  - `polaris-react/src/utilities/use-theme.ts`
  - `polaris-react/src/utilities/i18n/I18n.ts`
  - `polaris-react/src/utilities/features/hooks.tsx`
  - `polaris-react/src/utilities/features/types.ts`
  - `polaris-tokens/package.json`
  - `polaris-tokens/src/themes/constants.ts`
  - `polaris-tokens/src/themes/utils.ts`
- observed：
  - published React package lives in `polaris-react/` and reports `13.9.5`; root workspace `package.json` is private `0.0.0`;
  - `AppProvider` is a class component; `i18n` is required; `theme` defaults to token `themeNameDefault` (`light`);
  - on mount it writes `--pc-app-provider-scrollbar-width`, sets `document.body` to `--p-color-bg` / `--p-color-text`, and toggles `p-theme-${themeName}` on `documentElement`;
  - context stack is ThemeName / Theme / Features / I18n / ScrollLock / Sticky / Link / MediaQuery / Portals / Focus / EphemeralPresence;
  - `useTheme` / `useThemeName` throw if that stack is missing;
  - `I18n` accepts one dictionary or an array; arrays are shallow-copied and `merge(...reverse())` so the first item wins;
  - `Button` defaults `variant: 'secondary'` and `size: 'medium'`; `url` turns it into a link via `UnstyledButton`;
  - engines: `node >=20.10.0`; peer React `^18.0.0`;
  - LICENSE.md is MIT-shaped plus a Shopify interoperability / visual-distinctness restriction;
  - pinned README still labels the repo Active.
- provenance note：
  - npm `@shopify/polaris@13.9.5` has no `gitHead`;
  - GitHub annotated tag `@shopify/polaris@13.9.5` peels to `b0a13b7a5058817c3dcf7346020c9e4a44be8148`, whose `polaris-react/package.json` reports `13.9.5`;
  - this review binds that tag/package/revision;
  - later archive / Web Components migration is outside the pinned tree and is recorded only as 2026-08-27 GitHub identity metadata.

## carbon-design

- canonical source：`https://github.com/carbon-design-system/carbon`
- revision：`188d23202ec1092322dee92cf0df9d9958224ae4`
- monorepo tag：`v11.114.0`
- package：`@carbon/react@1.114.0`（source path `packages/react`）；companion `@carbon/styles@1.113.0`、`@carbon/feature-flags@1.7.0`
- inspected：
  - `LICENSE`
  - `package.json`
  - `packages/react/package.json`
  - `packages/react/src/index.ts`
  - `packages/react/src/feature-flags.js`
  - `packages/react/src/internal/usePrefix.ts`
  - `packages/react/src/internal/usePrefix-test.js`
  - `packages/react/src/internal/warnAboutDeprecatedReactVersion.ts`
  - `packages/react/src/components/ClassPrefix/index.tsx`
  - `packages/react/src/components/Theme/index.tsx`
  - `packages/react/src/components/Layer/index.tsx`
  - `packages/react/src/components/Layer/LayerLevel.ts`
  - `packages/react/src/components/Layer/LayerContext.ts`
  - `packages/react/src/components/FeatureFlags/index.tsx`
  - `packages/react/src/components/Button/Button.tsx`
  - `packages/react/src/components/Button/index.ts`
  - `packages/styles/package.json`
  - `packages/feature-flags/package.json`
  - `packages/feature-flags/src/FeatureFlagScope.ts`
  - `packages/feature-flags/src/__tests__/feature-flags-test.js`
- observed：
  - `@carbon/react` `package.json` still records `repository.directory: packages/carbon-react`, but this revision's source is `packages/react`;
  - `src/index.ts` is `'use client'` and first imports `./feature-flags` then `warnAboutDeprecatedReactVersion`;
  - `feature-flags.js` merges `enable-v11-release: true` and `enable-v12-release: false` into the global `@carbon/feature-flags` scope;
  - default CSS prefix is context value `cds`; `ClassPrefix` replaces it;
  - `Theme` accepts `white|g10|g90|g100`, writes `${prefix}--${theme}` plus `${prefix}--layer-one`, and sets `LayerContext` to `1`;
  - `Layer` class is `${prefix}--layer-${levels[level]}` where `levels=['one','two','three']`; children receive `clamp(level+1, 0, 2)`;
  - `FeatureFlagScope.enabled()` forces every `enable-v12-*` flag and `enable-focus-wrap-without-sentinels` on when `enable-v12-release` is true; `enable-experimental-*` is not pulled in;
  - React `FeatureFlags` only copies explicitly provided boolean props into a child scope, then `mergeWithScope(parent)` so unspecified props do not shadow parents;
  - `Button` default `kind` is `primary`; `href` / `as` select the rendered element;
  - peer React includes 16/17/18/19, but a one-shot dev warning says 16/17 are deprecated for v12;
  - both `@carbon/react` and `@carbon/styles` declare `postinstall: ibmtelemetry`;
  - license is Apache-2.0.
- provenance note：
  - npm `@carbon/react@1.114.0` reports `gitHead=188d23202ec1092322dee92cf0df9d9958224ae4`;
  - GitHub annotated tag `v11.114.0` peels to the same commit, whose `packages/react/package.json` reports `1.114.0`;
  - this review binds that tag/package/revision.
