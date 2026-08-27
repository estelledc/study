---
title: Tailwind CSS — 工具类优先样式框架
description: CSS-first 工具类编译器，用 compile/build 和 Oxide 扫描按需生成 utility
来源: https://github.com/tailwindlabs/tailwindcss
日期: 2026-05-29
分类: CSS
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/tailwindlabs/tailwindcss
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: c2b24dd15fed1c59dd521bd86082f520c9f5ad0d
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 4.3.3
---

## 是什么

Tailwind CSS 是一套把「设计 token + 按需工具类」编译成 CSS 的引擎。日常类比：`theme.css` 是色板和尺子，HTML 里的 `px-4` 是点菜单，真正炒菜的是两段式编译——先读你的 CSS，再按扫到的候选生成 utility。

固定 4.3.3 的入口不再是「把 `tailwindcss` 丢进 PostCSS plugins」。默认导出函数会直接抛错，要求改用 `@tailwindcss/postcss`。你写：

```css
@import "tailwindcss";
```

它会按 `@layer theme, base, components, utilities` 依次导入 `theme.css`、`preflight.css` 和只含 `@tailwind utilities;` 的 `utilities.css`。

## 为什么重要

不读固定 4.3.3 源码，下面这些合同很容易被 v3 教程带偏：

- 为什么 `tailwind.config.js` 不再是默认配置面，主合同在 CSS 的 `@theme` / `@source` / `@utility`
- 为什么 `compile()` 本身不扫项目文件，扫描器在 `@tailwindcss/oxide`
- 为什么 `p-4` 输出的是 `--spacing(4)`，而不是写死 `1rem`
- 为什么重要标记同时接受 `mx-4!` 和旧写法 `!mx-4`

## 核心要点

固定版本的主链可以拆成六步：

1. **解析输入 CSS**：`compile(css)` 先 `CSS.parse`，再走 `parseCss`。`@import`、`@theme`、`@source`、`@utility`、`@custom-variant`、`@plugin` / `@config` 都在这一阶段登记。

2. **两段式生成**：返回值是 `{ sources, root, features, build }`。`build(candidates)` 才调用 `compileCandidates`，把有效候选写成 AST。实现只追加候选，不删除已经生成的节点。

3. **扫描在集成包**：`Scanner` 来自 `@tailwindcss/oxide`，由 `@tailwindcss/postcss`、`@tailwindcss/vite`、`@tailwindcss/cli`、`@tailwindcss/webpack` 调用。核心包不保证「自动找到 class」。

4. **token 在 `@theme`**：`@theme` 只接受自定义属性或 `@keyframes`。选项有 `reference` / `inline` / `default` / `static` / `prefix(…)`；`prefix` 必须是小写 ASCII 字母。多个 `@theme` 会合并进第一条替换出的 `:root, :host` 规则。

5. **间距是函数，不是字面表**：存在 `--spacing` 时，`p-4` 走 `handleBareValue` 产出 `--spacing(4)`。默认 `theme.css` 把 `--spacing` 设为 `0.25rem`，色板是 `oklch(...)`。

6. **兼容层是可选钩子**：`@plugin` / `@config` 会打开 `JsPluginCompat`，由 `applyCompatibilityHooks` 加载旧 JS 配置。没有这两条 at-rule 时，核心不读 `tailwind.config.js`。

## 实践示例

### 案例 1：CSS-first 入口与品牌色

```css
@import "tailwindcss";

@theme {
  --color-brand: oklch(0.7 0.15 250);
}

@source "./src/**/*.{html,js}";
```

`@source` 路径必须带引号。`@source not "…"` 排除目录；`@source inline(px-4 bg-brand)` 把字面候选直接喂给 `build`，不必出现在源文件里。`source(none)` 关闭默认 root。

### 案例 2：只把扫到的 class 编进去

```js
import { compile } from "tailwindcss";

const { build } = await compile('@import "tailwindcss";');
const css = build(["px-4", "bg-blue-500", "hover:bg-blue-700"]);
```

`px-4` 会生成 `--spacing(4)`；没出现的 utility 不会进结果。第二次 `build(["px-4"])` 若没有新候选，实现复用上一份 AST。动态拼接 `bg-${color}-500` 仍然扫不到——扫描器看到的是源文本，不是求值后的字符串。

### 案例 3：重要标记与自定义工具类

```html
<button class="px-4! bg-blue-500 hover:bg-blue-700">保存</button>
```

```css
@utility glow-* {
  box-shadow: 0 0 12px var(--glow-*);
}
```

`px-4!` 与旧写法 `!px-4` 都会把该候选标成 important。`@utility` 不能嵌套、不能为空；函数式名称必须以 `-*` 结尾，否则解析阶段抛错。

## 踩过的坑

1. **把 `tailwindcss` 当 PostCSS 插件**：默认导出会抛错，指向 `@tailwindcss/postcss`。
2. **以为核心会自动扫 `./src`**：`compile()` 只吃你传入的 candidate 字符串。扫文件是 Oxide + 集成包的事；漏写 `@source` 时，生产 CSS 可能缺类。
3. **把 `p-4` 记成写死 16px**：固定实现输出 `--spacing(4)`，取决于 `--spacing` 是否存在以及它的值。
4. **只记得 `!mx-4`**：4.3.3 同时接受尾部 `mx-4!`。文档或 lint 若只认一种，会误判合法 class。
5. **在 `@theme` 里写普通 CSS 规则**：除自定义属性和 `@keyframes` 外都会抛错。

## 适用 vs 不适用场景

**适用**：

- 组件化 UI，愿意用 utility 拼样式，并接受 CSS-first token
- 需要 PostCSS / Vite / CLI / webpack 集成，且能接受 Oxide 扫描边界
- 想和 [[unocss]] 对照：同一套 class 语汇，编译器一个是 CSS 驱动，一个是 token 引擎

**不适用**：

- 必须把 `tailwindcss` 本身当 PostCSS 插件，且不能改依赖名
- 需要运行时按字符串拼接 class，又拒绝 safelist / `@source inline`
- 还没在目标环境量过体积或编译时间，却把「快 5–10 倍」写成当前事实

## 固定版本边界

- 本文绑定 `tailwindlabs/tailwindcss@c2b24dd15fed1c59dd521bd86082f520c9f5ad0d`，tag / npm latest 均为 `4.3.3`。
- npm tarball 未提供 `gitHead`；升级前应重新核对 tag 与打包提交是否仍一致。
- 同仓集成包 `@tailwindcss/postcss`、`@tailwindcss/vite`、`@tailwindcss/cli`、`@tailwindcss/node`、`@tailwindcss/browser`、`@tailwindcss/upgrade`、`@tailwindcss/webpack` 在该 tag 也报 `4.3.3`。
- `@tailwindcss/node` 依赖 `lightningcss` 做 optimize；本文未跑 minify 或测量产物。
- 本文未安装依赖、运行 Oxide 扫描、Vite 或 Playwright UI 测试，状态保持 `UNVERIFIED`。

## 学到什么

1. **配置面从 JS 挪到 CSS**——`@theme` / `@source` / `@utility` 才是 4.3.3 的主合同。
2. **编译和扫描是两个包**——核心 `build(candidates)` 不管文件系统。
3. **token 是 CSS 变量**——间距、颜色都先查 theme，再决定能不能生成。
4. **默认导出也是合同**——误用入口会在加载期失败，而不是默默走旧插件。

## 应用型自测

1. 只调用 `compile('@import "tailwindcss";')`，不调用 `build`，也不接 PostCSS/Vite。会不会自动扫到 `src/App.tsx` 里的 `px-4`？
2. 默认 theme 下，`p-4` 生成的声明值是 `1rem` 字面量，还是 `--spacing(4)`？
3. class 写成 `mx-4!`，固定 4.3.3 会不会当成 important？

检查点：

1. 不会。核心只编译传入候选；扫描属于 Oxide 与集成包。
2. 是 `--spacing(4)`，前提是 theme 里存在 `--spacing`。
3. 会。尾部 `!` 与旧的前导 `!` 都被 `parseCandidate` 接受。

## 延伸阅读

- 官方文档：[tailwindcss.com](https://tailwindcss.com)
- 固定源码：[tailwindlabs/tailwindcss](https://github.com/tailwindlabs/tailwindcss) —— 本文绑定提交 `c2b24dd15fed1c59dd521bd86082f520c9f5ad0d`
- [[unocss]] —— 同赛道的 token 引擎对照
- [[lightningcss]] —— `@tailwindcss/node` 用来 optimize 的编译器
- [Adam Wathan 2017 博客](https://adamwathan.me/css-utility-classes-and-separation-of-concerns/)

## 关联

- [[unocss]] —— 规则/preset 驱动的原子引擎，对照 CSS-first 编译器
- [[lightningcss]] —— Tailwind 节点集成里的 CSS optimizer
- [[vite]] —— `@tailwindcss/vite` 的宿主之一
- [[stylex]] —— 编译期原子 class 的另一条路线
- [[vanilla-extract]] —— 用 TypeScript 写样式、运行时零 CSS-in-JS

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[cal-com]] —— cal.com — 自己能托管的开源 Calendly
- [[emotion]] —— Emotion — 在 JS 里写样式，让浏览器拿到一张唯一的 className
- [[next-js]] —— Next.js — React 全栈框架
- [[radix-ui]] —— Radix UI — unstyled accessible 的 React 组件原语库
- [[shadcn-ui]] —— shadcn/ui — 把 React 组件从 npm 包变成"源码 + CLI 协议"
- [[styled-components]] —— styled-components — 用标签模板把 CSS 写进 React 组件的 CSS-in-JS 库
- [[stylex]] —— StyleX — 编译期把样式拍扁成原子 className 的 CSS-in-JS
- [[vanilla-extract]] —— vanilla-extract — 把 CSS 写成 TypeScript，浏览器看到的却是零字节运行时
- [[vue]] —— Vue.js — 渐进式 UI 框架
