# Component workshop source review (writer DH)

> 用途：记录 Ladle、Histoire 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer DH
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行上游 test、dev server、preview、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git

## Ladle

- canonical source：`https://github.com/tajo/ladle`
- revision：`780c19e5756db21674db1bdf7ff995d858f4e3e1`
- git tag：annotated `@ladle/react@5.1.1` 解引用到该提交（"Version Packages (#624)"）
- package：`@ladle/react@5.1.1`；unscoped npm `ladle@0.0.0` 指向无关仓库，不是本页对象
- inspected：
  - `packages/ladle/package.json`
  - `packages/ladle/lib/cli/cli.js`
  - `packages/ladle/lib/cli/serve.js`
  - `packages/ladle/lib/cli/vite-dev.js`
  - `packages/ladle/lib/cli/load-config.js`
  - `packages/ladle/lib/cli/vite-plugin/vite-plugin.js`
  - `packages/ladle/lib/cli/vite-plugin/parse/get-entry-data.js`
  - `packages/ladle/lib/cli/vite-plugin/parse/get-named-exports.js`
  - `packages/ladle/lib/cli/vite-plugin/generate/get-story-imports.js`
  - `packages/ladle/lib/cli/vite-plugin/generate/get-generated-list.js`
  - `packages/ladle/lib/shared/default-config.js`
  - `packages/ladle/lib/app/exports.ts`
  - `packages/ladle/lib/app/src/app.tsx`
  - `packages/ladle/lib/app/src/story.tsx`
  - `packages/ladle/lib/app/src/compose-enhancers.tsx`
  - `packages/ladle/lib/app/src/args-provider.tsx`
  - `packages/ladle/lib/app/src/iframe/frame.tsx`
- observed：
  - published identity is `@ladle/react` with Node `>=20`, Vite `^6.0.5`, React peer `>=18`;
  - CLI surface is `serve`/`dev`, `build`, `preview`; serve wraps Vite in Koa `middlewareMode` and falls back from port `61000`;
  - default story glob is `src/**/*.stories.{js,jsx,ts,tsx,mdx}`; config loads `.ladle/config.mjs` and lodash-merges onto defaults;
  - discovery is Babel AST, not story execution; named exports must be variable, class, function, or export specifiers; `__` in the export name is rejected;
  - story ids are `kebab(namespace)--kebab(storyName)`; `virtual:generated-list` lazy-imports each story through `composeEnhancers`;
  - public `Story` type extends `React.FC` with attached `args` / `decorators`; this is not CSF 3 `StoryObj`;
  - sidebar, addons and story share one React tree; iframe is opt-in for width / `meta.iframed` and portals the same React instance;
  - `.bind({})` stories force `import.meta.hot.invalidate()`; a11y and MSW addons default to disabled;
  - npm does not publish `gitHead`; identity is annotated tag + package version + commit SHA.
- provenance：
  - GitHub annotated tag `@ladle/react@5.1.1` peels to `780c19e5...`;
  - npm also published `0.0.0-next-780c19e` the same minute, matching the short SHA.

## Histoire

- canonical source：`https://github.com/histoire-dev/histoire`
- revision：`f04001937b86d330d1b8df3483adbad4bfbcc57c`
- git tag：lightweight `v1.0.0-beta.1`（"v1.0.0-beta.1"，2026-01-07）
- package：`histoire@1.0.0-beta.1`、`@histoire/app@1.0.0-beta.1`、`@histoire/plugin-vue@1.0.0-beta.1`；workspace `engines.node >=22`
- inspected：
  - root `package.json`
  - `packages/histoire/package.json`
  - `packages/histoire/src/node/bin.ts`
  - `packages/histoire/src/node/index.ts`
  - `packages/histoire/src/node/config.ts`
  - `packages/histoire/src/node/commands/dev.ts`
  - `packages/histoire/src/node/server.ts`
  - `packages/histoire/src/node/stories.ts`
  - `packages/histoire/src/node/collect/index.ts`
  - `packages/histoire/src/node/collect/worker.ts`
  - `packages/histoire/src/node/plugin.ts`
  - `packages/histoire/src/node/builtin-plugins/vanilla-support/plugin.ts`
  - `packages/histoire-shared/src/types/story.ts`
  - `packages/histoire-plugin-vue/src/index.node.ts`
  - `packages/histoire-plugin-vue/src/client/app/Story.ts`
  - `packages/histoire-app/src/app/components/story/StoryVariantSinglePreviewRemote.vue`
- observed：
  - CLI surface is `dev`, `build`, `preview`; config files are `histoire.config.ts|js` or `.histoire.ts|js`;
  - default `storyMatch` is `**/*.story.vue` and `**/*.story.svelte`; there is no React CSF plugin in this workspace;
  - builtin plugins are vanilla support (`**/*.js`) and Tailwind tokens; Vue/Svelte/Nuxt are extra packages;
  - `createServer` starts a collecting Vite server first, then the UI Vite server; collection runs story files in Tinypool workers via vite-node + jsdom;
  - one story object per file is supported; multiple collected stories warn and only the first is kept;
  - default layout is `{ type: 'single', iframe: true }`; remote preview syncs variant state through `postMessage`;
  - Vue stories are `<Story>` / `<Variant>` components, not named ESM exports;
  - last non-prerelease GitHub release remains `v0.17.17` (`6d5ba5c8...`); this note binds the published 1.x beta line instead;
  - `packages/histoire/package.json` still records `repository.url` as `Akryum/histoire`; tags and clone used `histoire-dev/histoire`.
- provenance：
  - Git tag `v1.0.0-beta.1` and npm `histoire@1.0.0-beta.1` identify the same reachable commit;
  - npm does not publish `gitHead`; identity is tag + package version + commit SHA.
