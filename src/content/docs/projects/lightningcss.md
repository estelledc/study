---
title: lightningcss — 用 Rust 把 CSS 工具链一遍跑完的编译器
来源: 'https://github.com/parcel-bundler/lightningcss'
日期: 2026-05-30
分类: projects / 前端工具链
难度: 中级
---

## 是什么

lightningcss 是一个**用 Rust 写的 CSS 编译器**，一次 walk 同时完成 parse、minify、加 vendor 前缀（-webkit- 那些）、把新语法降级成旧浏览器认得的写法、做 CSS Modules。日常类比：像一台**多功能洗衣机**——洗、甩干、烘干、消毒原本要四台机器排队，它放进去一次按一个键就完事。

主流方案是 PostCSS + 一堆 plugin（autoprefixer / cssnano / postcss-preset-env），每个 plugin 自己再读一遍 CSS。lightningcss 把整条流水线压成一遍，速度大约快 100 倍——参考数字：minify Bootstrap 4 用 cssnano 要 545ms，用 lightningcss 只要 4ms，且输出体积更小（143KB vs 160KB）。

它的灵魂是一个判断：**每个 CSS property 都是一个独立的 Rust 类型**。`background` 是一种 struct，`border-radius` 是另一种 struct，`transform` 是 enum。parse 一次得到带类型的语法树，minify、加前缀、降级新语法都直接读这棵树，不用再 token 一遍。这个看似"工程量爆炸"的决定（200+ property × 每个一个类型）是它和 PostCSS / esbuild / swc-css 的核心分水岭。

## 为什么重要

不理解 lightningcss 的设计，下面这些事都说不清：

- 为什么 Vite / Bun / Parcel 2 / Next.js 14+ 都在切到它，而不是继续用 PostCSS
- 为什么 `oklch(0.7 0.15 240)` 这种新颜色语法在老浏览器上还能显示——是谁在 build 时悄悄换成了 `rgb(...)`
- 为什么 minify Bootstrap 用 cssnano 要 500ms，用它只要 4ms——快 100 倍不是因为 Rust，是因为只 parse 一次
- 为什么 lightningcss 故意不开 plugin API——这和 oxc / esbuild 是同一种取舍

## 核心要点

lightningcss 的设计可以拆成 **三层**：

1. **类型化的语法树**：CSS 有 200+ 个 property，lightningcss 给每个写一个 Rust 类型。类比：把 `颜色: 红色` 不是当成"两个字符串"，而是当成 `{ kind: Color, value: Red }`。下游不用每次重新猜值的形状。

2. **一遍 walk 做完所有事**：minify、加 -webkit- 前缀、把 nesting 展平、把 oklch 换成 rgb 备份，这些操作不是排队执行，而是同一次遍历里顺手做完。类比：洗碗时同时擦干，不是洗完一遍再擦一遍。

3. **Targets 是配置不是代码**：用户写 browserslist 字符串（`>= 0.25%`），lightningcss 把它变成数据结构 `Browsers { chrome: 100, ... }`，传到一个 `should_compile()` 函数决定每个 feature 要不要降级。换浏览器目标不用改代码，改配置就行。

## 实践案例

### 案例 1：用 Node API 一键 minify

```js
// 装包：npm install lightningcss
const { transform } = require('lightningcss');
const fs = require('fs');

const { code } = transform({
  filename: 'input.css',
  code: fs.readFileSync('input.css'),
  minify: true,
  targets: { chrome: 100 << 16 }
});

fs.writeFileSync('output.css', code);
```

**逐部分解释**：

- `transform(...)` 接 4 个关键字段：`filename`（错误信息用）、`code`（CSS 字节）、`minify`、`targets`
- `chrome: 100 << 16` 是把"Chrome 100"编码成 32 位整数（高 16 位放主版本号），lightningcss 内部用整数比浏览器版本，比字符串快很多
- 返回 `{ code }` 是 minify 后的 CSS 字节流

### 案例 2：在 Vite 里启用它

```js
// vite.config.js
export default {
  css: {
    transformer: 'lightningcss',
    lightningcss: {
      targets: { chrome: 100 << 16, firefox: 100 << 16, safari: 15 << 16 }
    }
  },
  build: { cssMinify: 'lightningcss' }
}
```

设了 `transformer: 'lightningcss'` 之后：写 `oklch(...)` 自动降级、写 `&` 嵌套自动展平、写 `user-select: none` 自动加 `-webkit-` 前缀，全程不用装额外插件。

### 案例 3：CLI 命令行用法

```bash
# 装 CLI：npm install -g lightningcss-cli
lightningcss --minify --targets '>= 0.25%' input.css -o output.css

# 看降级效果：传一个含 nesting + oklch 的 css
echo '.a { & .b { color: oklch(70% 0.15 240); } }' \
  | lightningcss --minify --targets 'safari 14' /dev/stdin
# 输出：.a .b{color:#3aa1ff}（嵌套展平 + oklch 转 rgb）
```

`--targets '>= 0.25%'` 直接接 browserslist 语法（"市占率超过 0.25% 的浏览器"），lightningcss 自己解析、自己决定要降级哪些 feature。换成 `safari 14` 可以看到 nesting 被展平、oklch 被换成等效的 rgb 值——这两步在 PostCSS 里要两个独立 plugin 排队跑。

## 踩过的坑

1. **没有 plugin API**：和 PostCSS 不一样，lightningcss 不开放 user-land plugin。公司内部要写自定义 transform 只能 fork 源码或贡献 upstream。从 PostCSS 完整迁移过来要重写所有自定义 plugin 链。

2. **注释会被丢弃**：lightningcss 不保留注释和空白，所以做不了 CSS formatter（输出会丢掉所有 `/* ... */`）。要保留注释做格式化，请用 Prettier 或 Biome。

3. **napi 二进制依赖平台**：node 包按平台预编译（darwin-x64 / linux-arm64 / ...）。一些奇异架构（老 ARM 镜像、Alpine musl）可能没现成 binary，要 fallback 到 wasm，性能差 3-5 倍。

4. **默认不 lowering**：不传 `targets` 时 lightningcss 只做 minify，不会自动降级 oklch / nesting / `:has`。新人常以为它会一并处理，结果输出仍然包含旧浏览器不识别的语法。

## 适用 vs 不适用场景

**适用**：

- 现代 build pipeline（Vite / Parcel 2 / Bun / Next.js 14+）需要快速 minify + 自动 prefix + 新语法降级三合一
- 单独用 Node API / CLI 替换 PostCSS + cssnano + autoprefixer 三件套，省启动时间
- 想用 oklch / CSS Nesting / `:has` 这些新语法但又要兼容老浏览器

**不适用**：

- 需要 plugin 生态（公司内部已积累一堆 PostCSS 自定义 plugin）→ 继续用 PostCSS
- 做 CSS formatter 要保留注释和空白 → 用 Prettier 或 [[biome]]
- 只是要 bundle CSS 不需要深度优化 → [[esbuild]] 已经够用且更轻
- 浏览器里跑的 dynamic CSS-in-JS runtime → lightningcss 是 build-time 工具，wasm 版太重

## 历史小故事（可跳过）

- **2017 年前后**：Devon Govett 启动 Parcel bundler。早期 CSS 流水线用 PostCSS + cssnano，但很快发现 CSS 处理变成整个 bundler 的瓶颈
- **2021 年**：他启动一个新项目 `@parcel/css`，用 Rust 重写整套 CSS 工具链，复用 Servo（Mozilla 浏览器引擎项目）的 cssparser，不重写 token 层
- **2023 年**：项目独立改名 `lightningcss`，从 Parcel 解耦，可以单用；同年发布 1.0 alpha
- **2024 年**：Vite 5 把它作为 experimental CSS transformer；Bun runtime 把它端口成 Zig 内置；Next.js 14+ 在 Turbopack 里用它
- **2025-2026 年**：成为新一代 CSS 工具链事实标准。PostCSS 仍存活但只剩"老项目惯性"和"plugin 生态"两个理由

## 学到什么

- **把"看起来像数据"的东西做成类型**：每个 CSS property 一个 Rust 类型听起来工程量大，但收益持续——下游所有 transform 共享一棵 typed AST，不用反复 parse
- **集成 vs 组合的取舍**：PostCSS 选组合（每个 plugin 独立），换来插件生态；lightningcss 选集成（一遍 walk），换来速度和一致性。两条路都有道理
- **故意不开 plugin API 也是设计**：和 [[esbuild]] / oxc 同一种判断——单一扩展点 + 强类型契约 优于 万能 plugin
- **配置是数据不是代码**：`browserslist` 字符串是数据，浏览器升级时改配置就好；autoprefixer 早期硬编码兼容表，每次升级都要改代码

## 延伸阅读

- 官网：[lightningcss.dev](https://lightningcss.dev)（含 playground 可以在线试 transform）
- 仓库：[parcel-bundler/lightningcss](https://github.com/parcel-bundler/lightningcss)（README 有完整 benchmark 表）
- 视频：[Devon Govett — Lightning CSS @ React Conf](https://www.youtube.com/results?search_query=devon+govett+lightning+css)（作者本人讲设计动机）
- Servo cssparser：[github.com/servo/rust-cssparser](https://github.com/servo/rust-cssparser)（lightningcss 的底座，Firefox 也在用）
- [[vite]] —— 现代前端 build tool，已把 lightningcss 作为可选 CSS transformer
- [[esbuild]] —— Go 写的 bundler，CSS 能力弱但速度同档

## 关联

- [[vite]] —— 默认 CSS pipeline 之一可切到 lightningcss
- [[esbuild]] —— Go 写的同档工具，CSS 处理简陋但 bundle 快
- [[swc]] —— Rust 写的 JS 编译器，swc-css 是它的 CSS 部分但功能远不如 lightningcss
- [[biome]] —— Rust 写的 linter+formatter，CSS formatter 走另一条路（保留 trivia）
- [[bun]] —— runtime 把 lightningcss 端口成 Zig 内置（虽然这个 slug 可能未写）

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[emotion]] —— Emotion — 在 JS 里写样式，让浏览器拿到一张唯一的 className
- [[oxc]] —— oxc — Rust 写一整套 JS/TS 工具链的勇气
- [[rolldown]] —— rolldown — 用 Rust 给 Vite 当统一引擎的打包器
