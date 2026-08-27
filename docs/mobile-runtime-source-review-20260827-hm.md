# Mobile runtime source review (writer HM)

> 用途：记录 Expo、Ionic Framework 项目页迁移所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。Writer slug：`hm`。未占用其他开放 PR 的项目 slug；`capacitor` 由 PR #221 持有，本轮不改。

## 范围与边界

- review date：2026-08-27
- writer：HM
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与 BREAKING / CLI help 阅读
- not executed：未安装两仓依赖，未运行 Metro / prebuild / EAS、上游 test、浏览器、真机、Capacitor sync、bundle 或性能 benchmark
- worktrees：本机 `/tmp/review-expo` 与 `/tmp/review-ionic` 的 blob-filtered sparse clone，不进入 Git

## Expo

- canonical source：`https://github.com/expo/expo`
- revision：`c300d2cc60c9e684e64f48d9bc90ea18a571d01d`
- package：`expo@57.0.17`
- inspected：
  - `packages/expo/package.json`
  - `packages/expo/src/Expo.ts`
  - `packages/expo/src/launch/registerRootComponent.tsx`
  - `packages/expo/src/environment/ExpoGo.ts`
  - `packages/expo/bin/cli`
  - `packages/@expo/config/src/Config.ts`
  - `packages/@expo/cli/src/prebuild/index.ts`
  - `packages/@expo/cli/src/prebuild/prebuildAsync.ts`
  - `packages/@expo/cli/src/start/index.ts`
  - `packages/@expo/prebuild-config/src/plugins/withDefaultPlugins.ts`
  - `packages/expo-modules-core/src/requireNativeModule.ts`
  - `packages/expo-updates/src/Updates.ts`
  - `packages/expo-updates/utils/src/resolveRuntimeVersionAsync.ts`
  - `packages/expo-router/package.json`
  - `packages/expo-router/entry-classic.js`
  - `packages/expo-router/src/link/Link.tsx`
- observed：
  - `expo` 的 `bin.expo` 只 `require('@expo/cli')`；`Expo.ts` 再导出 `registerRootComponent`、`isRunningInExpoGo` 和 `expo-modules-core` 原语；
  - `registerRootComponent` 调用 `AppRegistry.registerComponent('main', ...)`；Web 再对 `#root` 跑 `runApplication`；
  - `isRunningInExpoGo()` 成功条件是 `requireNativeModule('ExpoGo')` 不抛错；
  - `getConfig` 动态文件扩展名为 `.ts/.mts/.cts/.mjs/.cjs/.js`，静态文件为 `app.config.json` 或 `app.json`；
  - `expo prebuild` 默认重建 native 目录，`--no-clean` 才在已有文件夹上打补丁；模板来自 `expo/template.tgz`，随后 `compileModsAsync` 应用 config plugins；
  - `expo start` 默认端口 8081、host `lan`；`--go` 与 `--dev-client` 是两条启动目标；
  - `requireNativeModule` 顺序为 `globalThis.expo.modules` → `NativeModulesProxy` → `TurboModuleRegistry` proxy；
  - `Updates.channel` 在 Expo Go 与 development build 为 `null`；`runtimeVersion` 支持字符串或 policy 对象；OTA 配送 JS/资源，不配送新原生模块；
  - 同提交 `expo-router@57.0.17`，`(tabs)` 为 route group，不进入 URL。
- provenance note：
  - npm `expo@57.0.17` 的 `gitHead` 即本提交，消息为 `Publish packages`，列出 `expo@57.0.17`、`expo-router@57.0.17`、`expo-updates@57.0.18`、`@expo/cli@57.0.19` 等；
  - GitHub 无与该补丁一一对应的 release / `expo@57.0.17` tag；本文绑定可达 `gitHead`，不虚构 tag；
  - 同树补丁号不一致是 monorepo 分开发布，不是冲突。

## Ionic Framework

- canonical source：`https://github.com/ionic-team/ionic-framework`
- revision：`d696a6aecfee59f99eca3c712887a5195a811dbb`
- packages：`@ionic/core@9.0.1`、`@ionic/react@9.0.1`、`@ionic/vue@9.0.1`、`@ionic/angular@9.0.1`
- inspected：
  - `package.json`、`lerna.json`
  - `core/package.json`
  - `packages/react/package.json`
  - `packages/vue/package.json`
  - `packages/angular/package.json`
  - `core/stencil.config.ts`
  - `core/src/global/ionic-global.ts`
  - `core/src/utils/config.ts`
  - `core/src/utils/overlays.ts`
  - `core/src/utils/platform.ts`
  - `core/src/css/core.scss`
  - `core/src/components/router/utils/dom.ts`
  - `packages/react/src/components/index.ts`（`setupIonicReact`）
  - `packages/react/src/components/createRoutingComponent.tsx`
  - `BREAKING.md`
  - `CHANGELOG.md`
- observed：
  - Stencil 4 同时输出 lazy loader 与 per-component custom elements；框架包是 `defineCustomElement` 包装，不是第二套 UI；
  - `initialize()` 按用户 config → `<html mode>` → `isPlatform(ios) ? ios : md` 选定 mode，并写到 `documentElement`；
  - `setupIonicReact` 先加 `ion-ce` class 再 `initialize(config)`；
  - v9 的 `OUTLET_SELECTOR` 只有 `ion-tabs` 与 `ion-router-outlet`，`ion-nav` 不再是 URL outlet；
  - React `routerLink` 经 `NavContext.navigate`，不是 React Router `<Link>`；
  - `createOverlay` 在 custom element 定义后 `createElement` + `assign` + 挂到 app root；
  - 仓库无 Capacitor 运行时，仅 `window.Capacitor` 探测；BREAKING.md 要求 Capacitor 7+、React Router v6.4+、Vue Router v5、Angular 18+；
  - v9.0.1 相对 v9.0.0 为 bugfix（overlay DOM 移位、picker-column、react-router 动画跳过等）。
- provenance note：
  - annotated tag `v9.0.1` 的 tag object 为 `1ebb5c86...`，peel 后指向 `d696a6aecfee59f99eca3c712887a5195a811dbb`；
  - npm `@ionic/core@9.0.1` / `@ionic/react@9.0.1` 的 `gitHead` 是父提交 `ea91babf5fd26fe4993ac1a2d27fbb8f9989503c`（Renovate CodeQL action），比 tag 少一次版本提交；
  - 本文绑定 tag peel 后的 commit，并披露 npm `gitHead` 分叉。
