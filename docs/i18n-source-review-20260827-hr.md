# i18n source review (writer HR)

> 用途：记录 i18next、Lingui 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：HR
- evidence：GitHub metadata、npm package metadata、固定提交静态源码阅读
- not executed：未安装两仓依赖，未运行上游 test、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git

## i18next

- canonical source：`https://github.com/i18next/i18next`
- revision：`652847e70fd68344d00456f20ef0584da51e59f7`
- package：`i18next@26.4.0`
- inspected：
  - `package.json`
  - `src/index.js`
  - `src/i18next.js`（`I18n`、`init`、`use`、`changeLanguage`、`getFixedT`、`t`、`createInstance`）
  - `src/defaults.js`
  - `src/ResourceStore.js`
  - `src/Translator.js`（`extractFromKey`、`translate`、`resolve`、missing-key 回退）
  - `src/PluralResolver.js`
  - `src/Interpolator.js`
  - `src/Formatter.js`
- observed：
  - tag `v26.4.0^{}`、`package.json` version 与 npm `gitHead` 同指 `652847e70fd68344d00456f20ef0584da51e59f7`；tag 对象本身是 annotated tag `381823b814999715801c00615e830b6ffa82d9a9`；
  - 默认 `ns` / `defaultNS` 为 `translation`，`fallbackLng` 为 `['dev']`，`nsSeparator` 为 `:`，`pluralSeparator` / `contextSeparator` 为 `_`，插值为 `{{` / `}}` 且默认 `escapeValue: true`；
  - `use()` 按 `module.type` 登记 `backend` / `logger` / `languageDetector` / `i18nFormat` / `postProcessor` / `formatter` / `3rdParty`，并返回 `this`；
  - `ResourceStore.data` 按 `[lng, ns, ...key]` 取路径；`Translator.resolve` 在 `count` 存在时用 `Intl.PluralRules` 拼 `_one` / `_other` 等后缀；
  - 找不到译文时先用 `defaultValue`，再回退到 key 本身；`missingKeyHandler` 只在 `saveMissing` 为真时触发；
  - `changeLanguage` 先 `languageChanging`，加载资源后再 `languageChanged`。
- provenance：npm `i18next@26.4.0` 的 `gitHead` 与源码 tag 剥皮提交一致。HTTP backend 与 language detector 是独立包，本轮未检视。

## Lingui

- canonical source：`https://github.com/lingui/js-lingui`
- revision：`665a19815378dedd89346bb7707bdb0e28df79e7`
- packages：`@lingui/core@6.6.0`、`@lingui/cli@6.6.0`、`@lingui/babel-plugin-lingui-macro@6.6.0`、`@lingui/react@6.6.0`、`@lingui/vite-plugin@6.6.0`
- inspected：
  - 根 `package.json`
  - `packages/core/package.json`
  - `packages/core/src/index.ts`
  - `packages/core/src/i18n.ts`
  - `packages/core/src/interpolate.ts`
  - `packages/core/src/formats.ts`
  - `packages/conf/src/makeConfig.ts`
  - `packages/babel-plugin-lingui-macro/src/index.ts`
  - `packages/babel-plugin-lingui-macro/src/macro.ts`
  - `packages/babel-plugin-lingui-macro/src/macroJs.ts`
  - `packages/babel-plugin-lingui-macro/src/constants.ts`
  - `packages/cli/src/lingui.ts`
  - `packages/cli/src/lingui-extract.ts`
  - `packages/cli/src/api/catalog/mergeCatalog.ts`
  - `packages/format-po/src/po.ts`
  - `packages/react/src/I18nProvider.tsx`
  - `packages/react/src/Trans.tsx`
  - `packages/react/src/TransNoContext.tsx`
  - `packages/vite-plugin/src/index.ts`
- observed：
  - tag `v6.6.0`、`@lingui/core@6.6.0` / `@lingui/cli@6.6.0` 的 npm `gitHead` 同指 `665a19815378dedd89346bb7707bdb0e28df79e7`；根 workspace `package.json` 仍写 `version: 6.0.0` 且 `private: true`；
  - `engines.node` 为 `>=22.19.0`；默认 macro 入口是 `@lingui/core/macro` 与 `@lingui/react/macro`；
  - JS macro 展开成 `i18n._(descriptor)`；`t` 是 `I18n._` 的别名；`useLingui()` 里解构的 `t` 会被改写成运行时 `_`；
  - `@lingui/macro` 经 `babel-plugin-macros` 的路径自 v6 起弃用；npm 上独立包 `@lingui/macro@5.9.5` 的 `gitHead` 是另一提交 `7b55bd79898d1e9e5a7d32f3c72d017be82e51b3`，本页不绑定它；
  - `mergeCatalog` 按 key 集合算 new / merge / obsolete，不因相近文案自动标 fuzzy；
  - `I18nProvider` 用 `useSyncExternalStore` 订阅 `change`；未 `activate` 时开发态返回 `null`；
  - Vite 插件按 `(\.po|\?lingui)$` 编译 catalog，源码里没有 `handleHotUpdate`。
- provenance split：本页绑定 monorepo tag `v6.6.0`；不把 npm `@lingui/macro@5.9.5` 当成同一 revision。
