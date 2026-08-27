# CSS utility engine source review (writer R)

> 用途：记录 Tailwind CSS、UnoCSS 项目页迁移所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer R
- evidence：GitHub release/tag metadata、npm latest 版本号、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行上游 test、bundle、Oxide/Vite 扫描或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git
- excluded slugs：`bun`、`deno`、`astro`、`solid`，以及 A–O 与已开 PR 占用的 slug

## Tailwind CSS

- canonical source：`https://github.com/tailwindlabs/tailwindcss`
- revision：`c2b24dd15fed1c59dd521bd86082f520c9f5ad0d`
- package：`tailwindcss@4.3.3`
- tag：`v4.3.3`（lightweight tag 直接指向上述 commit）
- inspected：
  - `packages/tailwindcss/package.json`
  - `packages/tailwindcss/index.css`
  - `packages/tailwindcss/theme.css`
  - `packages/tailwindcss/utilities.css`
  - `packages/tailwindcss/src/index.ts`
  - `packages/tailwindcss/src/compile.ts`
  - `packages/tailwindcss/src/design-system.ts`
  - `packages/tailwindcss/src/candidate.ts`
  - `packages/tailwindcss/src/utilities.ts`
  - `packages/@tailwindcss-node/package.json`
  - `packages/@tailwindcss-postcss/src/index.ts`
  - `packages/@tailwindcss-vite/src/index.ts`
  - `LICENSE`
- observed：
  - 核心包 `tailwindcss@4.3.3` 无生产 `dependencies`；`lightningcss` 与 `@tailwindcss/oxide` 是源码树 devDependency。默认导出函数会抛错，要求改用 `@tailwindcss/postcss`；
  - `index.css` 声明 `@layer theme, base, components, utilities`，再分别导入 `theme.css` / `preflight.css` / `utilities.css`。`utilities.css` 只含 `@tailwind utilities;`；
  - 公开编译入口是两段式：`compile(css)` 解析输入并返回 `{ sources, root, features, build }`，`build(candidates)` 才把候选写成 utility 节点。`build` 只追加有效候选，不删除已生成节点；
  - 候选扫描不在 `tailwindcss` 核心 `compile()` 内。`Scanner` 来自 `@tailwindcss/oxide`，由 `@tailwindcss/postcss`、`@tailwindcss/vite`、`@tailwindcss/cli`、`@tailwindcss/webpack` 调用后把字符串交给 `build`；
  - `@source "…"` 收集扫描路径，`@source not "…"` 取反，`@source inline(…)` 把字面候选（支持 brace expansion）写入 `inlineCandidates` 或 `ignoredCandidates`。路径必须带引号；`source(none)` 关闭默认 root；
  - `@theme` 只接受自定义属性或 `@keyframes`。选项包括 `reference` / `inline` / `default` / `static` / `prefix(…)`；`prefix` 必须是小写 ASCII 字母。多个 `@theme` 会合并进第一条替换出的 `:root, :host` 规则；
  - `p-4` 这类间距工具在存在 `--spacing` 时输出 `--spacing(4)`，而不是写死 `1rem`。默认 `theme.css` 把 `--spacing` 设为 `0.25rem`，色板为 `oklch(...)`；
  - 候选重要标记同时接受 `mx-4!` 与旧写法 `!mx-4`。`@import "…" important` 会把 `designSystem.important` 设为真；
  - `@utility` 不能嵌套且不能为空；函数式名称必须以 `-*` 结尾。`@custom-variant` 名称只允许字母数字、短横与下划线，且不能同时给 selector 和 body；
  - 同仓还发布 `@tailwindcss/postcss`、`@tailwindcss/vite`、`@tailwindcss/cli`、`@tailwindcss/node`、`@tailwindcss/browser`、`@tailwindcss/upgrade`、`@tailwindcss/webpack`，版本均与 `4.3.3` 对齐。
- provenance：
  - GitHub latest stable tag 与 npm latest 均为 `4.3.3`；
  - 已发布 tarball 未带 `gitHead`；本审查绑定可达且内部 `package.json` 一致的 GitHub tag commit，不猜测 npm 打包提交。

## UnoCSS

- canonical source：`https://github.com/unocss/unocss`
- revision：`a441ef4d8b14a20c0b3551383ae1b1e96940c0d2`
- packages：`unocss@66.8.1`、`@unocss/core@66.8.1`
- tag：`v66.8.1`（annotated tag `48c06835…` 解引用到上述 commit）
- inspected：
  - `package.json`
  - `LICENSE`
  - `packages-engine/core/package.json`
  - `packages-engine/core/src/index.ts`
  - `packages-engine/core/src/generator.ts`
  - `packages-engine/core/src/config.ts`
  - `packages-engine/core/src/extractors/split.ts`
  - `packages-presets/unocss/package.json`
  - `packages-presets/unocss/src/index.ts`
  - `packages-presets/preset-wind4/package.json`
  - `packages-deprecated/preset-uno/package.json`
  - `packages-deprecated/preset-uno/src/index.ts`
  - `packages-integrations/vite/src/index.ts`
- observed：
  - 引擎入口是异步 `createGenerator()`；`new UnoGenerator()` 仍可用但会 `console.warn` 并标 deprecated；
  - `generate(input)`：字符串走 extractor；数组 / `Set` 直接当 token。默认 `extractorSplit` 用 `/[\\:]?[\s'"`;{}]+/g` 切开源码。`extractorDefault === false` 可关掉默认切开；
  - 单 token 主链：`preprocess` → `matchVariants` → `expandShortcut(..., 5)` 或 `parseUtil` → `stringifyUtil`。shortcut 递归深度默认 5，到 0 即停；
  - token 结果缓存在 `TokenProcessor`；命中 `blocklist` 的 raw 会进 `blocked` 并缓存 `null`。`generate` 按 4096 一批 `Promise.all`，注释写明是为了限制 event-loop 压力而不是按 CPU 并行；
  - 返回值是 `{ css, layers, matched, getLayers, getLayer, setLayer }`，`css` 是 getter，按 layer 排序后拼接；`preflights` 与 `safelist` 默认开启；
  - 核心本身没有默认 preset。`unocss` 元包再导出 `presetUno` / `presetWind3` / `presetWind4` 等，但 `defineConfig` 不会自动装任何 preset；
  - `@unocss/preset-uno@66.8.1` 的 package description 写明 “Deprecated, renamed to `@unocss/preset-wind3`”，实现是 `presetWind3(options)` 再改 `name`；`@unocss/preset-wind4` 自称 “Tailwind 4 compact preset”；
  - Vite 插件默认 `mode: 'global'`；`svelte-scoped` 会抛错，要求改用独立包 `@unocss/svelte-scoped`。inspector 默认开启；
  - `unocss` 元包把 `@unocss/astro` / `@unocss/postcss` / `@unocss/webpack` 标为 optional peer；本页不把这些集成写成默认合同。
- provenance：
  - GitHub latest stable tag 与 npm `unocss` / `@unocss/core` latest 均为 `66.8.1`；
  - 已发布 tarball 未带 `gitHead`；本审查绑定 annotated tag 解引用后的 commit，其 workspace / 包 `package.json` 均报 `66.8.1`。
