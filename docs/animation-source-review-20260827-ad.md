# Animation library source review (writer AD)

> 用途：记录 `framer-motion`、`gsap` 项目页迁移所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL AD
- evidence：GitHub metadata、npm package metadata、固定提交静态源码阅读
- not executed：未安装两仓依赖，未运行上游 test、浏览器动画、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`（gitignored），不进入 Git
- forbidden slugs not touched：A–AC 目标与开放 PR 已占用 slug（zustand/jotai、tanstack-query/swr、biome/oxlint、prisma/kysely、radix/shadcn、drizzle/inngest、sentry/pino、web-vitals/prom-client、postgres.js/duckdb-wasm、xstate/redux、zod/valtio、hono/elysia、vitest/playwright、browser-use/wdyr、oxc/rolldown、bun/deno、astro/solid、tailwind/unocss、esbuild/swc、mongoose/typeorm、trpc/graphql、express/fastify、nestjs/koa、electron/tauri、storybook/chromatic、dayjs/date-fns、react-router/tanstack-router、socket.io/ws、marked/markdown-it、react-hook-form/tanstack-form、mcp-ts-sdk/ollama、aichat/shell-gpt、haystack/langfuse）

## Framer Motion / Motion

- canonical source：`https://github.com/motiondivision/motion`
- redirect：`https://github.com/framer/motion` 解析到同一仓库
- revision：`1b037b0032578b52af94b06ff3920bfa0aaa5e36`
- tag：annotated `v13.1.1` → tag object `7f23be5574eb3e48c191ddbd77e0683eb50f3779`，peeled commit 与 revision 一致
- packages：`motion@13.1.1` 与 `framer-motion@13.1.1` 的 npm `gitHead` 均为该 revision
- in-tree 残留：`packages/motion/package.json` 与 `packages/framer-motion/package.json` 的 `gitHead` 仍写 `cddcc66430c5c96b2f560bb6a61160231f512c53`；以 npm registry `gitHead` + peeled tag 为准，不把残留字段当成另一 revision
- inspected：
  - `packages/motion/package.json`
  - `packages/motion/src/index.ts`
  - `packages/motion/src/react.ts`
  - `packages/motion/src/react-client.ts`
  - `packages/framer-motion/package.json`
  - `packages/framer-motion/src/index.ts`
  - `packages/framer-motion/src/render/components/motion/proxy.ts`
  - `packages/framer-motion/src/render/components/motion/feature-bundle.ts`
  - `packages/framer-motion/src/components/AnimatePresence/index.tsx`
  - `packages/framer-motion/src/context/MotionContext/create.ts`
  - `packages/framer-motion/src/context/MotionContext/utils.ts`
  - `packages/framer-motion/src/motion/utils/should-inherit-variant.ts`
  - `packages/framer-motion/src/motion/utils/use-visual-state.ts`
  - `packages/motion-dom/src/animation/utils/default-transitions.ts`
- observed：
  - `motion` 默认入口再导出 `framer-motion/dom`；`motion/react` 再导出整个 `framer-motion`，并用本地绑定避免 duplicate re-export；
  - `framer-motion` 是实现包，依赖 `motion-dom@13.1.1` 与 `motion-utils@13.0.0`；`motion` 包依赖 `framer-motion@^13.1.1`；
  - React peer 为 `^18 || ^19`，且为 optional；hooks / `AnimatePresence` / `motion.div` 元素文件带 `"use client"`；
  - `motion` proxy 默认装入 animations、gestures、drag、layout 四组 feature；
  - 默认 transition 按属性分流：多于两个 keyframe 用 `keyframes` 0.8s；transform（非 scale）用 under-damped spring（stiffness 500 / damping 25 / restSpeed 10）；`scale*` 用 critically-damped spring；其余属性用 keyframes 0.3s、ease `[0.25, 0.1, 0.35, 1]`；
  - variants 继承：子节点未自己控制 variant 且 `inherit !== false` 时，从 `MotionContext` 取父级 `initial`/`animate`；`checkShouldInheritVariant` 在未显式 `inherit` 时要求“有 variants 且没有 animate”；
  - `AnimatePresence` 默认 `mode="sync"`、`initial=true`；多子节点必须有唯一 `key`；`wait` 模式在仍有 exiting 子节点时只渲染 exiting。
- not claimed：bundle 体积、运行时帧率、SSR 首帧是否抖动、具体站点采用情况。

## GSAP

- canonical source：`https://github.com/greensock/GSAP`
- revision：`13e2b790546426a1a2e0e9b409f3f8dc6d6611f2`
- tag：lightweight `3.15.0` 直接指向该 revision
- package：`gsap@3.15.0`；npm 未暴露 `gitHead`，以 tag + 源码 `package.json` / `gsap.version` 三方一致为锚点
- license：`Standard 'no charge' license`（`https://gsap.com/standard-license`），不是 MIT
- inspected：
  - `package.json`
  - `README.md`
  - `src/index.js`
  - `src/gsap-core.js`
  - `src/ScrollTrigger.js`
  - `src/CSSPlugin.js`（仅确认独立插件入口）
- observed：
  - `src/index.js` 默认导出会 `registerPlugin(CSSPlugin)`；核心默认值是 `duration: 0.5`、`overwrite: false`、`delay: 0`、ease `quad.out`；
  - `Tween.version = Timeline.version = gsap.version = "3.15.0"`；
  - `Animation.kill()` 无参，走 `_interrupt`：从父级摘除，并在 `progress() < 1` 时调用 `onInterrupt`，不调用 `onComplete`；
  - `Tween.kill(targets, vars = "all")` 可按目标或属性局部杀掉；全部属性被清掉时也会 `_interrupt`；
  - Timeline 位置：`position == null` 落到当前 clipped duration（接在最近子动画之后）；`"<"` 对齐最近子动画 `_start`，`">"` 对齐其 `endTime`；
  - 插件通过条件 exports 以 `gsap/ScrollTrigger` 等形式同仓导入，仍需 `gsap.registerPlugin(...)`；
  - ScrollTrigger 在有 trigger、未 pin、且未显式 `start` 时默认 `start` 为 `"0 100%"`；
  - `_wake()` 仅在 `typeof window !== "undefined"` 时绑定 `window`/`document`；模块末尾执行 `_windowExists() && _wake()`；选择器字符串走 `document.querySelectorAll`；
  - README 声明 Webflow 收购后全部 bonus 插件免费，且指向独立的 `@gsap/react`（本 revision 仓库不含该 hook）。
- not claimed：相对 jQuery 的倍数、站点数量、滚动手感或任何运行时性能数字。
