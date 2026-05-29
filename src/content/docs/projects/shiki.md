---
title: shiki TextMate Grammar 驱动的语法高亮
来源: https://github.com/shikijs/shiki + shiki.style 官方文档
season: 28
episode: S28-4
---

# shiki — VSCode 同款 TextMate 引擎做语法高亮

## 一句话总结

shiki 是 Pine Wu 2018 开源、Anthony Fu / @userquin 等接管的 JS 语法高亮库，2024 v1.x。它和 Prism / highlight.js 完全不同路线：用 VSCode 的 TextMate grammar 引擎 + theme，输出与 VSCode 完全一致的样式。

设计哲学：

1. **TextMate grammar**：每个语言的语法用 TM grammar JSON 描述（VSCode 内部就用这套），覆盖 130+ 语言
2. **Theme = JSON**：直接用 VSCode 主题（One Dark Pro / Dracula / GitHub Dark 等数百种）
3. **服务端友好**：默认 SSR，输出预渲染的 HTML span class，浏览器零开销
4. **WASM**：用 vscode-oniguruma WASM 跑 TextMate regex（不依赖原生 onigmo C 库）
5. **Transformer hooks**：1.x 引入的后处理管道，支持 line / token / pre 三层注入
6. **Dual theme**：light/dark 双主题输出，CSS variable 切换

性能：build 时一次性编译 grammar，runtime 高亮 ~10 µs/行。bundle 不小（含 wasm + grammar JSON ~200 KB），适合 SSR / 静态生成场景。

定位 vs 竞品：

- vs **Prism**：Prism regex-based，速度快但样式平庸，自定义难
- vs **highlight.js**：自动检测语言，但 grammar 简化版，错位多
- vs **Bright（React Server Component）**：Bright 用 shiki 但封装成 RSC
- vs **CodeMirror**：CodeMirror 是编辑器，shiki 是只读渲染器

Astro Starlight / VitePress / Slidev / Nuxt Content / Astro Code 都默认 shiki。weekly downloads ~5M。

总结一句：**它是把 VSCode 的渲染引擎搬到 web/SSR 上，让你的文档代码块和你写代码时看到的完全一样**。

## Layer 0 — 项目档案速查

| 字段 | 值 |
|---|---|
| 包名 | `shiki`（v1+） / 旧 `@shikijs/shiki` |
| 当前主版本 | v1.x（2024-03 重写）|
| 首版 | 2018-09（v0.1）|
| License | MIT |
| 主仓库 | shikijs/shiki |
| 维护 | Anthony Fu / Pine Wu / 社区 |
| 内部依赖 | vscode-oniguruma（wasm regex）/ vscode-textmate |
| Bundle 核心 | ~150 KB + WASM 200 KB |
| 支持语言 | 130+（与 VSCode 一致） |
| 支持主题 | 数百种 VSCode theme |
| 默认主题 | nord / one-dark-pro / vitesse-* |
| TS 支持 | 完整 |
| 浏览器 | ✓（WASM 可用即可）|
| Node | ≥ 18 |
| Edge runtime | ✓（CF Worker / Bun） |
| Weekly downloads | ~5M |
| GitHub stars | 11k+ |
| 集成 | Astro Starlight / VitePress / Nuxt Content |
| 重大版本 | v0.x → v1.x（2024-03 ESM-only 重写）|
| 子包 | `@shikijs/core` / `@shikijs/transformers` / `@shikijs/twoslash` |

## Layer 1 — 核心抽象

```ts
import { codeToHtml } from 'shiki';

const html = await codeToHtml('console.log("hello")', {
  lang: 'javascript',
  theme: 'one-dark-pro'
});
// 输出：<pre class="shiki ..."><code><span class="line">...</span></code></pre>
```

四要素：

1. **`codeToHtml(code, options)`** —— 一站式 API，输出可直接 innerHTML 的 HTML
2. **`lang`** —— 语言名（'javascript' / 'typescript' / 'python' / 'rust' / ...）
3. **`theme`** —— 主题名 / theme JSON 对象
4. **可选 transformers** —— 后处理 hooks（加行号 / 高亮特定行 / diff 标记等）

进阶：

```ts
import { createHighlighter } from 'shiki';

const highlighter = await createHighlighter({
  themes: ['nord', 'github-dark'],
  langs: ['javascript', 'typescript']
});

const html = highlighter.codeToHtml(code, { lang: 'ts', theme: 'nord' });
```

为什么要 `createHighlighter`？

- 一次加载多个 grammar / theme，复用 highlighter 实例
- 避免每次调用重新 fetch grammar JSON
- SSR 场景下在 build 阶段创建一次，runtime 直接复用

低层 API（拿 tokens 自己渲染）：

```ts
const tokens = highlighter.codeToTokensBase(code, { lang: 'ts', theme: 'nord' });
// tokens: [[{ content, color, fontStyle, ... }]]
```

适合需要自定义渲染（如 React 组件、Canvas、PDF）的场景。

## Layer 2 — 内部架构

shiki 4 层：

1. **Loader**：load grammar JSON / theme JSON（懒加载或 bundled）
2. **vscode-oniguruma**：用 WASM 跑 oniguruma regex（VSCode 同款）
3. **vscode-textmate**：tokenize 用 grammar 把代码切成 tokens（含 scope 数组）
4. **Theme matcher**：把 token 的 scope 与 theme 规则匹配，赋予 color / bg

工作流：

```
1. createHighlighter({themes, langs}) → 加载所有 grammar + theme
2. codeToHtml(code, {lang, theme}) →
3. tokenize(code, langGrammar) → tokens with scopes (e.g. ["source.js", "string.quoted"])
4. for each token: theme.match(scopes) → { color, bg, fontStyle }
5. render <span style="color:...">{text}</span>
6. wrap in <pre><code> + line spans
```

vs Prism 关键不同：Prism 把 grammar 写成 JS 正则数组，tokenize 时直接 RegExp.exec；shiki 用 oniguruma（更强的 regex，支持 lookbehind / atomic group / TextMate 特有 backref），所以兼容 VSCode 的复杂 grammar。

oniguruma 具体支持什么 JS RegExp 不支持的？

- **lookbehind**：`(?<=foo)bar`（V8 2018 后支持，但语法略有差异）
- **atomic group**：`(?>foo|bar)` 不回溯
- **possessive quantifier**：`a++` / `a*+`
- **named backref**：`\k<name>`（JS 写法 `\k<name>`，但 oniguruma 还有 `\g<name>` 子调用）
- **POSIX bracket class**：`[[:alpha:]]`

这些是写复杂 grammar（HTML 内嵌 JS、模板字符串、正则字面量）的必需品。

## Layer 3 — 精读 3 段

### 段 a — TextMate Grammar 工作原理

TM grammar 的最小单位是 pattern：

```json
{
  "match": "\\b(if|else|while|for|return)\\b",
  "name": "keyword.control"
}
```

每个 pattern 由 oniguruma regex + scope name 构成。tokenize 时按嵌套顺序匹配，给每个匹配 substring 赋 scope。

旁注：

1. **scope 是层级字符串**（"keyword.control.flow.javascript"），从粗到细
2. **theme 用 scope 前缀匹配**（"keyword.control" 匹配所有 control flow），未命中则 fallback 到更粗粒度
3. **begin/end pattern 处理跨行**（如 string、template literal），avoid 单行 regex 反复匹配
4. **include 可以引用其他 grammar**（如 HTML 内嵌 JavaScript），实现混合语言
5. **一个 token 可有多个 scope**（"source.js, string.quoted, punctuation.definition.string"），theme 按最具体的匹配
6. **patterns 数组顺序敏感**，先匹配的优先级高，类似 yacc 的 shift-reduce

> 怀疑：TextMate grammar 是 2004 年 macOS 编辑器 TextMate 的 DSL，至今仍是 VSCode / Atom / Sublime Text 的事实标准。grammar 编写复杂（一个语言要 1000+ 行 JSON），新语言支持滞后。是不是 tree-sitter 这种新方案会逐步替代？

> 怀疑 2：oniguruma 的 catastrophic backtracking 是 web 上的潜在 DoS 风险——某些恶意构造的代码块可能让单次 tokenize 卡住数秒。shiki 是否有 timeout 机制？

> 怀疑 3：scope 命名约定是社区约定（不是标准），各 grammar 作者写法不一，导致 theme 兼容性问题（一个 theme 在 A 语言好看，在 B 语言因为 scope 名不同失效）。

### 段 b — Theme 系统

shiki theme 直接复用 VSCode theme JSON：

```json
{
  "name": "Nord",
  "tokenColors": [
    {
      "scope": ["keyword.control"],
      "settings": { "foreground": "#81A1C1" }
    }
  ]
}
```

旁注：

1. **数百种 VSCode theme 可直接用**（One Dark Pro / Dracula / GitHub Dark / Catppuccin / Tokyo Night）
2. **shiki 自带 ~50 种内置 theme**，其他可 import JSON
3. **多 theme 场景（dark/light 切换）**用 `themes: { light: 'github-light', dark: 'github-dark' }`，输出 dual style HTML
4. **CSS variables 模式**：theme 颜色作为 var(--shiki-*)，可在 CSS 切换
5. **自定义 theme** 只需写 tokenColors JSON，无需打包工具
6. **theme 还包含 colors**（编辑器背景 / 选中色等），shiki 只用 tokenColors + 部分 colors

> 怀疑：shiki bundle 含所有 grammar + theme JSON 时极大（500 KB+）。生产应该用 createHighlighter + 显式列出需要的 lang/theme，但很多新手用全量 import 不知优化。

> 怀疑 2：dual theme 输出的 HTML 包含 light + dark 两套 inline style（`style="--shiki-light:#xxx;--shiki-dark:#yyy"`），HTML 体积膨胀近一倍。这对小规模文档站可接受，但海量代码块的 SSG（如 MDN 这种规模）会成瓶颈。

### 段 c — Transformers

shiki 1.x 引入 transformer：在 token / line / pre level 加 hook：

```ts
import { transformerNotationHighlight } from '@shikijs/transformers';

const html = await codeToHtml(code, {
  lang: 'js',
  theme: 'nord',
  transformers: [transformerNotationHighlight()]
});
```

社区 transformers：

- `transformerNotationHighlight` —— `// [!code highlight]` 注释高亮特定行
- `transformerNotationDiff` —— `// [!code ++]` / `// [!code --]` diff 风格
- `transformerNotationFocus` —— focus 模式
- `transformerCompactLineOptions` —— 行级选项压缩
- `transformerMetaHighlight` —— 通过 ` ```js {2,3-5} ` 高亮行号
- `transformerTwoslash` —— TS twoslash 类型注释（hover 显示推断类型）

Transformer 接口：

```ts
interface ShikiTransformer {
  name: string;
  preprocess?(code: string, options): string | void;
  tokens?(tokens): Token[][] | void;
  line?(node: Element, line: number): Element | void;
  span?(node: Element, line: number, col: number): Element | void;
  pre?(node: Element): Element | void;
  postprocess?(html: string, options): string | void;
}
```

> 怀疑：transformer 解决"在 markdown 代码块外指定高亮"的痛点，但 transformer 之间组合可能冲突（多个 transformer 都改 line 元素）。debug 困难。

> 怀疑 2：`// [!code highlight]` 这种注释指令必须跟语言注释语法一致，跨语言写文档时（同一个高亮注释在 JS 写 `//` 在 Python 写 `#`）作者要记住差异。

![shiki TextMate grammar 流程](/study/projects/shiki/01-tm-grammar.webp)

## Layer 4 — 与 Prism / highlight.js / Bright 对比

| 维度 | shiki | Prism | highlight.js | Bright |
|---|---|---|---|---|
| 引擎 | TextMate + oniguruma WASM | regex 数组 | regex + 启发式 | shiki 包装 |
| 语言数 | 130+ | 200+ | 190+ | 130+ |
| theme | VSCode JSON | CSS class | CSS class | VSCode JSON |
| 准确度 | 极高（VSCode 同款）| 中 | 中（自动检测错） | 极高 |
| Bundle | 大（~200KB+wasm） | 小（~10KB） | 中（~50KB） | 中（依赖 shiki） |
| SSR / RSC | ✓（推荐） | ✓ | ✓ | ✓（RSC first） |
| 学习曲线 | 中 | 平 | 平 | 中 |
| 双主题 | ✓（dual theme）| 需手动写 CSS | 需手动写 CSS | ✓ |
| Twoslash | ✓ | ✗ | ✗ | ✓（继承） |

shiki 最大优势：**与你写代码用的 VSCode 渲染一致**。这是文档站的关键卖点。

具体场景选择建议：

- **静态文档站（VitePress / Astro / Nextra）**：shiki，编译期渲染零运行时开销
- **极简博客（10KB bundle 极致追求）**：Prism + 一两个语言
- **CMS 富文本编辑器在线高亮**：highlight.js（自动检测语言友好）
- **React Server Component 文档**：Bright（设计就是 RSC first）
- **runtime 用户提交代码高亮**：shiki + lazy load grammar，或 Prism

## Layer 5 — 6 维评分

| 维度 | shiki | Prism | highlight.js |
|---|---|---|---|
| 准确度 | 10 | 6 | 6 |
| 主题数 | 10 | 6 | 5 |
| Bundle 友好 | 5 | 9 | 7 |
| 性能（build time） | 8 | 10 | 9 |
| SSR 友好 | 10 | 7 | 7 |
| 学习曲线（易） | 6 | 9 | 9 |
| 总分 | 49 | 47 | 43 |

shiki 在准确度 / 主题 / SSR 三维拿满，bundle 和学习曲线扣分。但对静态文档站（编译期跑），bundle 不是用户运行时负担——这是它流行起来的关键。

## Layer 6 — 限制

1. **Bundle 大**：默认全量 grammar/theme 导致 ~500 KB；需手动 createHighlighter 优化
2. **WASM 依赖**：CF Worker / 旧浏览器需 polyfill；冷启动有 200 ms 延迟（WASM 加载）
3. **新语言滞后**：依赖 VSCode 仓库或社区贡献 TextMate grammar，新语言支持几个月后才到 shiki
4. **transformer API 1.x 才稳定**：0.x 时代的 plugin 都不兼容
5. **TextMate grammar 复杂度**：自写 grammar 需懂 oniguruma regex + scope 设计，门槛高
6. **edge runtime WASM 限制**：CF Worker 有 1MB binary 限制，shiki + grammar 要细心选
7. **runtime 高亮成本**：浏览器侧高亮（不是 SSR）首次加载 200ms+，需 placeholder
8. **不支持 incremental**：编辑器场景应用 CodeMirror / Monaco，不是 shiki

## 怀疑总集

> 怀疑：shiki 1.x 重写（2024-03）是 ESM-only + 分包，老项目升级痛苦。半年内社区还在迁移期，文档碎片化严重。

> 怀疑：Tree-sitter（GitHub / Neovim 用）是 incremental parser，理论上比 TextMate 快很多。shiki 团队有讨论 tree-sitter 替代但尚未实施。如果 tree-sitter web port 成熟，shiki 会被取代吗？

> 怀疑：CSS variables 双主题方案对 SEO / RSS 有副作用——非浏览器抓取时只看到 inline style，可能取错颜色。

> 怀疑：shiki 输出的 HTML 体积比 Prism 大 3-5 倍（每个 token 都是 inline style 的 span）。对 SSG 网站，HTML gzip 后差距小，但首字节传输量仍翻倍。

> 怀疑：Pine Wu 已较少参与，Anthony Fu 一人维护核心 + 推动 1.x 重写，bus factor 较低。生态依赖 shiki 的项目（Starlight / VitePress / Nuxt Content）抗风险能力？

## GitHub Permalinks

源码精读入口（链接示意，未实际验证 SHA）：

- shiki 主入口：`https://github.com/shikijs/shiki/blob/3a4f9b8e2d1c5a7e6b8d2f4a9c3e7d1b5f8a4c2e/packages/shiki/src/index.ts`
- highlighter 工厂：`https://github.com/shikijs/shiki/blob/8b2c4d6e1f3a5c7d9e1b3f5a7c9e1b3d5f7a9c1e/packages/core/src/highlighter.ts`
- transformers：`https://github.com/shikijs/shiki/blob/2a4f6e8b1d3c5e7f9a1b3d5c7e9f1a3b5d7e9c1f/packages/transformers/src/index.ts`
- Astro Starlight 集成：`https://github.com/withastro/starlight/blob/9c1b3d5f7a9c1e3b5d7f9a1c3e5d7f9b1c3e5d7f/packages/starlight/integrations/shiki.ts`
- vscode-oniguruma WASM 桥：`https://github.com/microsoft/vscode-oniguruma/blob/4d2e1f6c8b3a5d7e9f1b3d5c7e9f1a3b5d7e9c1f/main/index.ts`

## Layer 7 — 实战

完整 Astro Starlight + shiki 自定义主题：

```ts
// astro.config.mjs
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  integrations: [
    starlight({
      title: 'Docs',
      expressiveCode: {
        themes: ['github-dark', 'github-light'],
        styleOverrides: {
          borderRadius: '0.5rem'
        },
        plugins: [
          // shiki transformers
          {
            name: 'highlight',
            apply: (config) => {
              // ...
            }
          }
        ]
      }
    })
  ]
});
```

要点：

1. Starlight 内部用 expressive-code（基于 shiki）
2. dual theme 自动 light/dark 切换
3. 行号、高亮行、diff 都通过 transformer 注入
4. 编译期渲染，runtime 零开销

VitePress 写法：

```ts
// .vitepress/config.ts
import { defineConfig } from 'vitepress';
import { transformerNotationDiff } from '@shikijs/transformers';

export default defineConfig({
  markdown: {
    theme: { light: 'github-light', dark: 'github-dark' },
    codeTransformers: [transformerNotationDiff()]
  }
});
```

自定义渲染（拿到 token 自己处理）：

```ts
import { createHighlighter } from 'shiki';

const highlighter = await createHighlighter({
  themes: ['nord'],
  langs: ['typescript']
});

const tokens = highlighter.codeToTokensBase('const x = 1', {
  lang: 'typescript',
  theme: 'nord'
});

// tokens: [[{ content: 'const', color: '#81A1C1' }, ...]]
// 现在可以渲染成 React / Vue 组件 / Canvas / PDF
```

边缘情况：

- **CF Worker** 部署：用 `shiki/wasm` 路径加载 inline WASM，避免 fs.readFile
- **Bun + SSR**：Bun 的 fetch/wasm 兼容性好，但 grammar JSON 需 dynamic import
- **Vercel Edge**：lambda 冷启动 200ms+，建议预 warmup
- **Next.js App Router RSC**：用 Bright（封装好的 RSC 版 shiki），避免 hydration mismatch

## 学到什么 + 关联

学到 ≥ 5 条：

1. 复用 VSCode 生态（grammar + theme）是工程上聪明的策略——不重新造数百个语言定义
2. WASM 让 oniguruma regex 可在浏览器跑（C 库的现代 web 路径）
3. SSR / 编译期渲染是性能极致的代码高亮路径——把 runtime 成本前移到 build time
4. transformer 模式是 plugin 系统的现代演进——比 0.x 时代的 monkey patch 更可控
5. bundle 大小 vs 视觉准确度是工具库的根本 trade-off——选哪边取决于使用场景（SSG vs CSR）
6. ESM-only + 分包是 2024+ 库的通用方向，老项目升级阵痛在所难免
7. dual theme 用 CSS variable 切换是优雅方案，但对 HTML 体积有放大效应

关联：

- [[unified]] [[markdown-it]] [[marked]] [[micromark]] —— 同 Markdown 解析路线
- [[starlight]] [[vitepress]] [[nextra]] —— 默认用 shiki 的文档框架
- [[codemirror]] [[monaco-editor]] —— 浏览器编辑器（同样基于 TextMate / oniguruma）
- [[tree-sitter]] —— 替代 TextMate 的 incremental parser 候选
- [[bright]] —— shiki 的 RSC 封装
- [[expressive-code]] —— Starlight 用的 shiki 上层封装

## 下一步

如果继续深入：

1. 读 shiki 1.x 源码 `packages/core/src/highlighter.ts`，理解 tokenizer pipeline
2. 试写自定义 transformer（如 "把 TODO 注释染红"）
3. 对比 tree-sitter web port 的性能 / 准确度
4. 调研 expressive-code 在 Starlight 里的 plugin 机制
5. 在自己的博客里替换掉 Prism，对比构建时间 / HTML 体积 / 渲染效果
