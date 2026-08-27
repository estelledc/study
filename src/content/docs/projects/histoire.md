---
title: Histoire — 先执行故事文件，再决定怎么预览
description: Vue/Svelte 组件工坊：worker 执行收集故事，默认 iframe sandbox 预览。
来源: https://github.com/histoire-dev/histoire
日期: 2026-08-27
分类: 测试
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: tool
  canonical_source: https://github.com/histoire-dev/histoire
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: f04001937b86d330d1b8df3483adbad4bfbcc57c
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 1.0.0-beta.1
---

## 是什么

Histoire 是一个以 Vite 为底座的组件工坊。日常类比：它不是扫 `*.stories.ts` 做静态 export 清单，而是**先在 worker 里真正跑一遍故事文件**，把 `<Story>` / `<Variant>` 收集成树，再决定单页还是网格、本机预览还是 iframe sandbox。

默认匹配 `**/*.story.vue` 和 `**/*.story.svelte`：

```vue
<script setup>
import Button from "./Button.vue";
</script>

<template>
  <Story title="Form/Button">
    <Variant title="Primary">
      <Button label="Save" />
    </Variant>
  </Story>
</template>
```

`histoire dev` 会先起一台 **collecting** Vite，用 vite-node + jsdom + Tinypool 执行这些文件；再起一台 UI Vite。固定版本是 `histoire@1.0.0-beta.1`，workspace 要求 Node `>=22`。这是 1.x beta 线，不是已经结束的 `0.17.17` 稳定线。

## 为什么重要

不理解“执行收集 + 插件认文件”，就解释不了：

- 为什么把 CSF `*.stories.tsx` 丢进仓库，Histoire 默认看不见
- 为什么一个 `.story.vue` 里写两个 `<Story>` 会警告，并且只留第一份
- 为什么控件面板改 state，sandbox iframe 能跟着变
- 为什么 vanilla 插件声明了 `**/*.js`，默认 `storyMatch` 却仍扫不到它

## 核心要点

固定 `1.0.0-beta.1` 的主链可以拆成五步：

1. **读配置**：`histoire.config.ts|js` 或 `.histoire.ts|js`。默认插件只有 vanilla support 和 Tailwind tokens；Vue / Svelte / Nuxt 是另外的包。

2. **按插件认文件**：`HstVue()` 把 `**/*.vue` 交给 `vue3` support plugin。没有匹配的 support plugin 会直接抛错。

3. **两台 Vite**：`createServer` 先 `getViteServer(true)` 做收集，再 `getViteServer(false)` 做 UI。顺序写进注释：先 collecting，免得弄坏 Nuxt HMR。

4. **worker 执行**：每个故事文件进 Tinypool；worker 建 jsdom、`ViteNodeRunner.executeFile`，调用插件的 `run()` 往 `storyData` 里推对象。dev 默认线程数约为 `max(min(collectMaxThreads, cpus/2), 1)`。

5. **预览合同**：缺省 layout 是 `{ type: 'single', iframe: true }`。远程预览用 `postMessage` 同步 `STATE_SYNC` / `SANDBOX_READY`；本机预览走 native 组件。

CLI 是 `dev` / `build` / `preview`。一份文件只支持一个 story 对象；多份会黄字警告。

## 实践示例

### 案例 1：Vue 故事用组件，不用 named export

```vue
<template>
  <Story title="Form/Button" :layout="{ type: 'single', iframe: true }">
    <Variant title="Primary" :init-state="() => ({ label: 'Save' })">
      <Button :label="label" />
    </Variant>
  </Story>
</template>
```

`@histoire/plugin-vue` 的 `Story` 是带 `__histoireType: 'story'` 的 Vue 组件。收集阶段会 stub 掉非 Story/Variant 的未知组件，避免 Vue 警告。这和 Ladle 的 `export const Primary = ...` 不是同一份合同。

### 案例 2：默认匹配扫不到 vanilla 示例

内置 `vanillaSupport()` 的 `supportMatch` 是 `**/*.js`，但默认 `storyMatch` 只有 `*.story.vue` / `*.story.svelte`。要让 `button.story.js` 出现在侧栏，必须自己改 `storyMatch`。插件在、文件在，不等于会被 watch。

### 案例 3：收集失败不会悄悄当成“没有故事”

```ts
// collect/index.ts：storyData.length === 0 时只 warn
// 执行抛错时打印 frame/stack；dev 默认不 throw，build 可 throws
```

空结果是警告；语法/运行错误是红色日志。不要把侧栏缺失理解成“这个框架官方不支持”，先看是 match 没中，还是 worker 执行失败。

## 踩过的坑

1. **把 Histoire 写成 React CSF 工坊**：本 workspace 没有 React plugin；默认 glob 也不含 `*.stories.tsx`。
2. **把 npm latest 当成已稳定 1.0**：绑定的是 `1.0.0-beta.1`。GitHub 非预发布 latest 仍是 `v0.17.17`。
3. **一个文件两个 `<Story>`**：收集器警告 “Multiple stories not supported”，只保留第一份。
4. **以为默认一定本机预览**：缺省 `iframe: true`，控件和组件不在同一 document。
5. **按 `package.json.repository` 去 clone**：包里仍写 `Akryum/histoire`；本页绑定的 tag 在 `histoire-dev/histoire`。

## 适用 vs 不适用场景

**适用**：

- Vue 3 / Svelte / Nuxt 组件库，故事本来就是 SFC
- 需要在收集阶段执行 setup，才能知道有哪些 variant
- 接受 iframe sandbox，并用 state / events 做面板同步

**不适用**：

- React CSF 仓库想零插件接入——应看 [[ladle]] 或 [[storybook]]
- 必须使用已结束的 0.17 稳定线：那是另一份 SHA，不能混称
- 要把启动时间、截图插件或 Percy 结果写成已验证——本轮未跑
- Node 低于 22 的工具链

## 固定版本边界

- 本文绑定 `histoire-dev/histoire@f0400193...`，tag 与 package 均为 `1.0.0-beta.1`。
- `v0.17.17`（`6d5ba5c8...`）只作为对照披露，未并入本页。
- 未安装依赖、未跑 `histoire dev` / 上游 vitest；状态保持 `UNVERIFIED`。
- 审查记录：仓库内 `docs/component-workshop-source-review-20260827-dh.md`。

## 学到什么

1. **发现策略决定故事格式**——静态 AST 走向 CSF 函数；执行收集走向 SFC 组件
2. **默认 glob 比插件清单更硬**——support plugin 在，也不等于文件会被收录
3. **beta 线和 last stable 可以同时“最新”**——必须写清绑的是哪条
4. **iframe 在 Histoire 是默认预览，在 Ladle 是开关**——不能用“组件工坊”四个字外推隔离模型

## 应用型自测

1. 只放 `src/Button.stories.tsx`，不改 `storyMatch`。固定 beta 会列出它吗？
2. 一个 `.story.vue` 里写两个 `<Story>`，侧栏会有几棵故事树？
3. 不写 `layout` 时，默认预览是不是和 Ladle 一样走同 document？

检查点：

1. 不会。默认只匹配 `*.story.vue` / `*.story.svelte`。
2. 一棵。多 story 会警告，只留 `storyData[0]`。
3. 不是。缺省 `{ type: 'single', iframe: true }`。

## 延伸阅读

- 官方文档：[histoire.dev](https://histoire.dev)
- 固定源码：[histoire-dev/histoire](https://github.com/histoire-dev/histoire) —— 本文绑定 `f04001937b86d330d1b8df3483adbad4bfbcc57c`
- 审查记录：仓库内 `docs/component-workshop-source-review-20260827-dh.md`
- [[ladle]] —— React、静态 AST、默认单窗的对照
- [[storybook]] —— CSF 3 / 双 window 对照，不是本页测速对象
- [[vite]] —— 收集服务器和 UI 服务器都基于它

## 关联

- [[ladle]] —— 同主题另一条发现/隔离合同
- [[storybook]] —— 更重的多框架工坊
- [[vite]] —— 双 Vite 服务器底座
- [[vue]] —— `HstVue` 的主故事格式
- [[svelte]] —— 另一条默认 `storyMatch`
- [[nuxt]] —— `@histoire/plugin-nuxt` 集成面

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
