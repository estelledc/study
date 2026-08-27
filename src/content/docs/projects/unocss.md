---
title: UnoCSS — 按需原子 CSS 引擎
description: 按需原子 CSS 引擎，用 createGenerator 和可换 preset 把 token 编成 CSS
来源: https://github.com/unocss/unocss
日期: 2026-08-27
分类: CSS
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/unocss/unocss
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: a441ef4d8b14a20c0b3551383ae1b1e96940c0d2
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 66.8.1
---

## 是什么

UnoCSS 是一个按需生成原子 CSS 的引擎。日常类比：它不自带一份写死的 Tailwind 菜单，而是一台可以换刀片的切片机——`createGenerator` 是机身，preset 才是刀片。

固定 66.8.1 的合法入口是异步工厂，不是 `new`：

```ts
import { createGenerator } from "@unocss/core";
import presetWind3 from "@unocss/preset-wind3";

const uno = await createGenerator({
  presets: [presetWind3()],
});
const { css } = await uno.generate("px-4 bg-blue-500");
```

`new UnoGenerator()` 仍能构造，但会 `console.warn`，源码标为 deprecated。

## 为什么重要

不读固定 66.8.1 源码，下面这些合同很容易被「Tailwind 兼容层」一语带过：

- 为什么装了 `unocss` 元包，不写 `presets` 仍然几乎生不成工具类
- 为什么 `presetUno` 还在导出，却已经改名为 `presetWind3`
- 为什么 `generate("class='px-4'")` 和 `generate(["px-4"])` 走的不是同一条路
- 为什么 shortcut 嵌套五层之后会静默停掉

## 核心要点

固定版本的主链可以拆成五步：

1. **异步装配**：`createGenerator(config)` 先 `resolveConfig`，合并 preset 的 `rules` / `variants` / `shortcuts` / `extractors` / `preflights`。核心默认不装任何 preset。

2. **抽 token**：`generate` 收到字符串时调用 extractor。默认 `extractorSplit` 用 `/[\\:]?[\s'"`;{}]+/g` 切开源码；`extractorDefault === false` 可关掉这把刀。数组或 `Set` 则跳过切开，直接当 token。

3. **解析单个 token**：`preprocess` → `matchVariants` → 先试 `expandShortcut(..., depth=5)`，否则 `parseUtil` 再 `stringifyUtil`。结果缓存在 `TokenProcessor`；命中 `blocklist` 会缓存 `null`。

4. **分批而不是按核数并行**：`generate` 按 4096 个 token 一批 `Promise.all`。源码注释写明这是为了限制 event-loop 压力，不是按 CPU 数加速。

5. **按 layer 拼 CSS**：返回 `{ css, layers, matched, getLayers, getLayer, setLayer }`。`css` 是 getter。`preflights` 与 `safelist` 默认开启。

## 实践示例

### 案例 1：字符串扫描 vs 直接给 token

```ts
const fromSource = await uno.generate(`<button class="px-4 bg-blue-500">`);
const fromTokens = await uno.generate(["px-4", "bg-blue-500"]);
```

第一种会先切开 HTML/JS 文本；第二种把数组原样当候选。动态拼接 `bg-${color}-500` 在第一种路径里通常扫不到完整字面量——默认 extractor 不做求值。

### 案例 2：shortcut 有深度上限

```ts
const uno = await createGenerator({
  presets: [presetWind3()],
  shortcuts: {
    btn: "px-4 py-2 rounded",
    "btn-primary": "btn bg-blue-500 text-white",
  },
});
const { css } = await uno.generate("btn-primary");
```

`expandShortcut` 默认 `depth = 5`，到 0 就返回 `undefined`。循环或超深嵌套不会无限展开。静态 shortcut 是精确字符串匹配；函数式 shortcut 才走正则。

### 案例 3：preset 名称已经换代

```ts
import { defineConfig, presetWind3, presetWind4 } from "unocss";

export default defineConfig({
  presets: [presetWind3()], // 旧名 presetUno 只是改了 name 的包装
  // presets: [presetWind4()], // 自称 Tailwind 4 compact，需单独选用
});
```

`@unocss/preset-uno@66.8.1` 的 package description 写明已 deprecated，实现是 `presetWind3(options)` 再改 `name`。`defineConfig` 只做类型包装，不会自动塞 preset。

## 踩过的坑

1. **以为 `unocss` 元包等于开箱即用的 Tailwind**：它再导出 preset 与 Vite 插件，但引擎默认规则表是空的。
2. **继续把 `presetUno` 写成当前推荐名**：固定版本里它已改名为 `presetWind3`；`presetWind4` 是另一条 Tailwind 4 压缩预设，不是默认。
3. **用 `new UnoGenerator()` 当稳定 API**：构造函数会警告，合同入口是 `createGenerator()`。
4. **Vite `mode: 'svelte-scoped'`**：该 mode 会抛错，要求改用独立包 `@unocss/svelte-scoped`。默认 mode 是 `global`。
5. **把 4096 批次理解成多核加速**：它是为了让出 event loop，不声称吞吐或编译时间。

## 适用 vs 不适用场景

**适用**：

- 需要可换 preset / 自定义 rule 的原子 CSS，而不是一份固定工具类表
- 已经能接受「自己声明 presets」，并在 Vite `global` 模式或编程式 `generate` 下工作
- 想和 [[tailwind]] 对照：同一套 utility 语汇，一个是 CSS-first 编译器，一个是 token 引擎

**不适用**：

- 期望零配置就得到完整 Tailwind v4 语义——那是 `presetWind4` 的可选合同，不是核心默认
- 需要运行时求值动态 class，又拒绝 safelist / 完整字面量
- 还没在目标 bundler 量过体积，却把「比 Tailwind 更快更小」写成当前事实

## 固定版本边界

- 本文绑定 `unocss/unocss@a441ef4d8b14a20c0b3551383ae1b1e96940c0d2`，annotated tag `v66.8.1` 解引用到此提交；`unocss` 与 `@unocss/core` 的 package 版本均为 `66.8.1`。
- npm tarball 未提供 `gitHead`；升级前应重新核对 tag 与打包提交是否仍一致。
- 仓库根 `engines.node` 为 `>=22`；这是 monorepo 约束，不自动等于每个子包的运行时保证。
- Vite / webpack / PostCSS / CLI 是集成包。`@unocss/astro` 只是 optional peer，本页不把它写成默认宿主。
- 本文未安装依赖、运行 vitest、Vite 开发服务或测量产物，状态保持 `UNVERIFIED`。

## 学到什么

1. **引擎和语汇是分开的**——没有 preset，`generate` 几乎只剩空 layer。
2. **输入形态改变主链**——字符串扫描与 token 列表不是同一条路。
3. **deprecated 名称仍会导出**——`presetUno` 能跑，但合同已经指向 `presetWind3`。
4. **缓存和 blocklist 是一等状态**——同一 token 第二次不会重新走规则表。

## 应用型自测

1. `await createGenerator()` 之后直接 `generate("px-4")`，不装任何 preset。`matched` 里会有 `px-4` 吗？
2. shortcut `a -> b -> a` 循环引用，固定实现会无限展开吗？
3. `generate("<div class='px-4'>")` 和 `generate(["px-4"])` 是否都必然走 `extractorSplit`？

检查点：

1. 通常不会。核心默认没有 Tailwind 规则；`px-4` 解析失败就不会进入 `matched`。
2. 不会。`expandShortcut` 深度到 0 即停。
3. 只有字符串输入走 extractor；数组路径直接当 token。

## 延伸阅读

- 官方文档：[unocss.dev](https://unocss.dev)
- 固定源码：[unocss/unocss](https://github.com/unocss/unocss) —— 本文绑定提交 `a441ef4d8b14a20c0b3551383ae1b1e96940c0d2`
- [[tailwind]] —— CSS-first 对照
- [[lightningcss]] —— 相邻 CSS 编译器，不是 UnoCSS 核心依赖
- [[vite]] —— `@unocss/vite` 默认 `global` 模式的宿主

## 关联

- [[tailwind]] —— 固定工具类编译器，对照可换 preset 的引擎
- [[lightningcss]] —— CSS 工具链对照，不负责原子 class 扫描
- [[vite]] —— 官方 Vite 插件默认 mode 为 `global`
- [[stylex]] —— 编译期原子化的另一条路线
- [[vanilla-extract]] —— 用 TypeScript 写样式，运行时不剩 CSS-in-JS

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
