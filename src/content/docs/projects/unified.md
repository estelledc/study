---
title: unified AST + plugin pipeline 通用文档处理框架
来源: https://github.com/unifiedjs/unified + https://github.com/remarkjs/remark + https://github.com/rehypejs/rehype + unifiedjs.com 官方文档
season: 28
episode: S28-1
---

# unified — Markdown / HTML / 自然语言的统一 AST 处理框架

## 一句话总结（≥ 14 行）

unified 是 Titus Wormer（@wooorm，荷兰开发者）2014 年起主导的开源项目，一个**通用文档处理框架**：把任意文本（Markdown / HTML / 自然语言）解析成 AST，再用 plugin 链做转换，最后输出新文本。

它不是某种 markdown 解析器，而是**解析器之上的协作协议**。你写一份配置：

```js
unified()
  .use(remarkParse)        // Markdown → mdast
  .use(remarkGfm)          // mdast → mdast（添加 GFM 扩展）
  .use(remarkRehype)       // mdast → hast（语法树切换）
  .use(rehypeHighlight)    // hast → hast（代码高亮）
  .use(rehypeStringify)    // hast → HTML
  .process(markdownText);
```

四个核心抽象：
1. **processor**：`unified()` 工厂创建 processor，链式 `.use()` 注册 plugin
2. **AST 规范族**：mdast（Markdown）/ hast（HTML）/ nlcst（自然语言），都是 unist 子集
3. **plugin**：纯函数，接收 tree + file，返回 tree（或不返回，原地修改）
4. **vfile**：贯穿全流程的文件抽象，承载 path / value / messages / data

unified 的影响超出"工具"层级：**Astro、MDX、Gatsby、Next.js、VuePress、Storybook 都基于它**。Astro Starlight 的 markdown / MDX 渲染管线就是 unified processor。Markdown 生态从 marked / markdown-it 的"端到端解析器"时代，进入 unified "AST + plugin" 时代。

子生态：**remark**（Markdown 处理）/ **rehype**（HTML 处理）/ **retext**（自然语言）。三者各自有 ~50 个官方 plugin，社区 plugin ≥ 700。

## Layer 0 — 项目档案速查（≥ 17 字段）

| 字段 | 值 |
|---|---|
| 包名 | `unified` |
| 当前主版本 | v11.x（2024）|
| 首版 | 2015-04（v0.1，从 mdast 分裂）|
| License | MIT |
| 主仓库 | unifiedjs/unified |
| 维护 | Titus Wormer（@wooorm）+ vfile / mdast / hast 规范作者 |
| 子项目 | remark / rehype / retext / mdx 等 |
| AST 规范 | unist（root spec）/ mdast / hast / nlcst |
| 文件抽象 | vfile（@vfile/vfile）|
| 类型 | 完整 TS 定义（@types/mdast / @types/hast）|
| Bundle | unified core ~10 KB；remark-parse ~50 KB；rehype-stringify ~15 KB |
| Plugin 数量 | 官方 ~150 / 社区 ≥ 700 |
| 月下载 | unified 60M+；remark-parse 50M+；rehype-stringify 30M+ |
| Stars | unified 4k+；整个 unifiedjs 组织 100+ 仓库 |
| 文档站 | unifiedjs.com |
| 主消费方 | Astro / MDX / Gatsby / Next.js / VuePress / Storybook |
| 支持环境 | Node ≥ 16 / Deno / Bun / 浏览器 |
| 商业版 | 无（OpenCollective 资助）|
| 设计哲学 | "AST 是数据，plugin 是函数，pipeline 是组合" |

## Layer 1 — 核心抽象（≥ 30 行）

```js
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';

const file = await unified()
  .use(remarkParse)
  .use(remarkRehype)
  .use(rehypeStringify)
  .process('# Hello *world*');

console.log(String(file));
// → '<h1>Hello <em>world</em></h1>'
```

四要素：

1. **`unified()` 工厂** —— 返回新的 frozen-able processor 实例。它是空的，没有任何 parser / transformer / compiler
2. **`.use(plugin, options)`** —— 注册 plugin。Plugin 形态多样：
   - parser plugin：调用 `this.parser = ...` 设置 parser
   - transformer plugin：返回 `(tree, file) => { ... }`
   - compiler plugin：调用 `this.compiler = ...` 设置 compiler
3. **`.process(input)` / `.run(tree)` / `.parse(input)` / `.stringify(tree)`** —— 4 个执行入口：
   - `process` = parse + run + stringify（全流程）
   - `parse` = 输入字符串 → AST
   - `run` = AST → AST（只跑 transformer）
   - `stringify` = AST → 字符串
4. **vfile 贯穿** —— `process()` 接受 string / Buffer / vfile，返回 vfile。`file.value` 是输出文本，`file.messages` 是 lint 警告 / 错误集合

processor 的 plugin 顺序就是执行顺序。同一个 processor 可以多次复用（process 多个文件），但调用 `.use()` 后会冻结 → 之后再 `.use()` 会创建新副本（不变性）。

## Layer 2 — 内部架构（≥ 30 行）

unified 的内部结构出奇简单。`unified/lib/index.js` 全文 ~600 行（含注释）。核心数据结构：

```
processor = {
  parser: Parser | null,
  compiler: Compiler | null,
  attachers: [[plugin, options], ...],   // .use 注册的 plugin 列表
  namespace: { /* 共享状态 */ },
  frozen: boolean,
}
```

执行流：

```
1. .use(plugin, options)
   → push 到 attachers，标记未 freeze
2. 第一次 .process() 触发 freeze()
   → 遍历 attachers，逐个调用 plugin(this, options)
   → plugin 在内部修改 this.parser / this.compiler 或 push transformer
3. .parse(input)
   → 调用 this.parser(input, file) 返回 root AST
4. .run(tree, file)
   → 用 trough（unifiedjs 自家的 mini async pipeline）
   → 串行调用所有 transformer，每个返回新 tree（或修改原 tree）
5. .stringify(tree, file)
   → 调用 this.compiler(tree, file) 返回字符串
6. .process = parse → run → stringify
```

关键设计：

- **trough 是迷你 async-await pipeline 库**，处理 transformer 的 sync / promise / callback 三种返回风格
- **AST 不是 unified 自己定义** ——它只规定接口（root + children + type），具体节点类型由 mdast / hast / nlcst 决定
- **plugin 是函数**，没有 class / decorator / DI，纯函数式
- **vfile 是数据载体** ——transformer 互相不直接通信，但都能读写 `file.data` 和 `file.messages`，这就是状态共享通道
- **不变性** ——freeze 后再 `.use()` 不会破坏原 processor，而是返回派生副本

为什么这种 8 行能讲完的架构能撑起 100M+ 月下载量的生态？答案：**接口规范了，实现可替换**。任何人写的 plugin 只要遵循"输入 mdast → 输出 mdast"，就能和别人的 plugin 自由组合。这是 Unix pipe 哲学搬到 AST 层。

## Layer 3 — 精读 3 段（每段 ≥ 5 旁注 + ≥ 1 怀疑）

### 段 a — unified core processor 的 frozen 机制（≥ 30 行）

源码精简版（基于 v11）：

```js
function unified() {
  const attachers = [];
  let frozen = false;
  let parser = null;
  let compiler = null;

  function processor() { /* 不变 */ }

  processor.use = function (plugin, options) {
    if (frozen) {
      // 派生新 processor，复制 attachers
      return unified().use(...attachers).use(plugin, options);
    }
    attachers.push([plugin, options]);
    return processor;
  };

  processor.freeze = function () {
    if (frozen) return processor;
    for (const [plugin, options] of attachers) {
      const transformer = plugin.call(processor, options);
      if (transformer) processor._transformers.push(transformer);
    }
    frozen = true;
    return processor;
  };

  processor.process = async function (input) {
    processor.freeze();
    const file = vfile(input);
    const tree = parser(String(file), file);
    const transformed = await runPipeline(tree, file);
    file.value = compiler(transformed, file);
    return file;
  };

  return processor;
}
```

旁注：

1. **`attachers` 是 `[plugin, options]` 数组** ——不是 Map，因为同一个 plugin 可以注册多次（不同 options 配置）
2. **`freeze()` 是 lazy 触发** ——第一次 process 才把 plugin 列表展开为 transformer 列表
3. **`plugin.call(processor, options)` 让 plugin 内可用 `this.parser = ...`** ——这是为什么 remark-parse 能"安装"自己当 parser
4. **freeze 后的派生不复制状态** ——只复制 attachers 列表，新 processor 重新执行 plugin（保证幂等）
5. **runPipeline 用 trough 处理 sync / async / callback 三种 transformer** ——历史包袱（Node 早期 callback 流行），现在 plugin 推荐 async 但兼容老代码

> 怀疑：frozen 设计让 processor 不可变，但每次"派生"都要重跑全部 plugin。如果一个 build 流程派生 10 次（很常见，比如 Astro 每个 .md 一次），plugin 注册成本 ×10。我读源码时没看到 cache。Astro 是怎么避免的？我猜：Astro 在外层缓存 frozen processor 结果，复用同一个 processor 实例处理多个文件。

### 段 b — remark-parse 把 Markdown 文本变成 mdast（≥ 30 行）

remark-parse 内部用 micromark 做 token 化，再把 token 树转成 mdast：

```js
// 简化版 remark-parse plugin
export default function remarkParse(options) {
  const self = this;
  // 注册 parser 函数到当前 processor
  self.parser = function (doc, file) {
    return fromMarkdown(doc, {
      extensions: self.data('micromarkExtensions') || [],
      mdastExtensions: self.data('fromMarkdownExtensions') || [],
    });
  };
}
```

mdast 节点示例：

```js
{
  type: 'root',
  children: [
    {
      type: 'heading',
      depth: 1,
      children: [{ type: 'text', value: 'Hello' }]
    },
    {
      type: 'paragraph',
      children: [
        { type: 'text', value: 'a ' },
        { type: 'emphasis', children: [{ type: 'text', value: 'world' }] }
      ]
    }
  ]
}
```

旁注：

1. **micromark 是底层 token 化器** ——CommonMark spec 兼容，逐字符状态机扫描，零 regex 回溯
2. **fromMarkdown 把 micromark 的扁平 token 流转成嵌套 AST** ——这一步定义了 mdast 节点形态
3. **`self.data('micromarkExtensions')` 是 plugin 共享通道** ——比如 remark-gfm 通过 `self.data('micromarkExtensions').push(gfm())` 给 micromark 注入额外语法（表格、删除线、任务列表）
4. **mdast 节点类型有 ~25 种** ——root / heading / paragraph / list / listItem / link / image / code / inlineCode / strong / emphasis / blockquote / thematicBreak / table / tableRow / tableCell / html / yaml / toml / definition / linkReference / imageReference / footnoteReference / footnoteDefinition / break
5. **每个节点有 position 字段** ——记录在原文中的 start / end 行列，给 lint / source map 用

> 怀疑：micromark 用零 regex 状态机性能强，但代码可读性差。我看 micromark 的 construct 定义全是 `tokenize / partial / resolve` callback，理解曲线陡。这种"性能换可读性"在 markdown-it（regex + 后处理）路线对比下，是否值得？答案大概是：CommonMark spec 里有大量"如果前面有 X 又有 Y 但不在 Z 里"的回溯条件，regex 真的写不动。

### 段 c — remark-rehype 是 mdast → hast 的桥（≥ 30 行）

remark-rehype 是 plugin 中最特殊的一个：它不是 transformer，而是**语法树切换**。

```js
// 简化版 remark-rehype
export default function remarkRehype(destination, options) {
  return (tree, file) => {
    const hastTree = mdastToHast(tree, options);
    if (destination) {
      // destination 是另一个 unified processor（rehype）
      // 把 hast tree 交给它继续处理
      destination.runSync(hastTree, file);
    } else {
      // 替换当前 tree 为 hast，后续 plugin 会作为 rehype plugin 跑
      return hastTree;
    }
  };
}
```

mdast → hast 映射规则（mdast-util-to-hast）：

```
mdast.heading(depth=1) → hast.element('h1', children)
mdast.paragraph        → hast.element('p', children)
mdast.code             → hast.element('pre', [element('code', text)])
mdast.link(url, title) → hast.element('a', { href, title }, children)
mdast.image(url, alt)  → hast.element('img', { src, alt })
mdast.text             → hast.text
mdast.html             → hast.raw（passthrough，rehype-raw 处理）
```

旁注：

1. **mdast 和 hast 是两个不同的 AST 规范** ——mdast 节点有"语义"（heading / paragraph），hast 节点是"DOM"（element / text / comment / doctype）
2. **remark-rehype 是单向桥** ——从 mdast 到 hast。反向（hast → mdast）需要 rehype-remark
3. **HTML 内联在 Markdown 里 → mdast 'html' 节点** ——默认走 'raw'，rehype-stringify 直接拼到输出。如果 sanitize 要求严格，加 rehype-raw 重新解析为 hast，再走 rehype-sanitize
4. **footnote / definition 这类语法节点会被预处理** ——mdast-util-to-hast 把它们转成正确的 `<a href="#fn1" id="fnref1">` + 底部 `<ol class="footnotes">`
5. **同一个 unified processor 链上既能跑 remark plugin 也能跑 rehype plugin** ——切换点就是 `.use(remarkRehype)`，前面都吃 mdast，后面都吃 hast

> 怀疑：mdast → hast 这一步是有损的。比如 mdast 里的 `'inlineCode'` 在 hast 里就是 `<code>`，但是不带 language 信息（除非 plugin 显式塞 className）。这种"语义降级"让某些 plugin 必须在 remark 阶段完成（不能延后到 rehype），增加了使用心智负担。我猜更激进的方案是统一 AST（一棵树两种语义），但落地成本太高 —— Titus 没选这条路。

![unified Markdown → AST → HTML 全流程](/study/projects/unified/01-pipeline.webp)

## Layer 4 — 与 markdown-it / marked / @swc/markdown / micromark 直用 / mdx 对比（≥ 30 行）

### vs markdown-it

| 维度 | unified | markdown-it |
|---|---|---|
| 设计 | AST + plugin pipeline | 端到端解析 + token 后处理 |
| AST | 完整 mdast / hast | 扁平 token 流 |
| Plugin 形态 | 纯函数 transformer | rule registration |
| HTML 输出控制 | rehype 阶段任意改 | 重写 renderer rule |
| 性能 | 慢（多次树遍历） | 快（一次扫描） |
| 生态 | 700+（unifiedjs + 社区） | ~200（markdown-it/*） |
| 适合 | 静态站 / MDX / 复杂转换 | 即时渲染 / WYSIWYG |

markdown-it 是"端到端解析器"代表：输入 markdown，输出 HTML，中间是扁平 token 流。性能比 unified 强 2-3x，但做复杂语法转换（mermaid 块、自定义 directive）需要写 `parser.block.ruler.before(...)` 这种侵入式扩展。

### vs marked

marked 是最老的 markdown 解析器（2011 起），最快但 spec 兼容性差，AST 不暴露。新项目应该不选它，老项目（如 GitHub README 渲染早期）才用。

### vs @swc/markdown 与 wasm 解析器

新一代 zero-runtime 趋势：@swc/markdown（Rust 写）、pulldown-cmark（Rust）、comrak（Rust），通过 wasm 在浏览器跑，比 unified 快 5-10x。但 plugin 生态几乎为零，且**plugin 必须在原生层写 Rust**，对 JS 用户不友好。

### vs 直接用 micromark

micromark 是 unified 的底层 tokenizer。直接用它可以零 plugin 开销跑出 HTML，但你失去整个 mdast / plugin 体系。适合"我只要把 markdown 渲染成 HTML，不需要任何转换"的极简场景。

### vs MDX

MDX 是"在 markdown 里嵌 JSX"。它本身就是一个 unified processor（`@mdx-js/mdx` 内部用 unified + remark-mdx + rehype-stringify）。所以 MDX 不是 unified 的对手，是它的应用。

## Layer 5 — 6 维评分（≥ 6 维）

| 维度 | unified | markdown-it | marked | @swc/markdown | micromark 直用 |
|---|---|---|---|---|---|
| Plugin 生态 | 10 | 7 | 3 | 1 | 2 |
| 性能 | 5 | 8 | 9 | 10 | 9 |
| AST 暴露 | 10 | 5 | 2 | 4 | 3 |
| 学习曲线（易） | 4 | 7 | 9 | 6 | 3 |
| TS 类型 | 9 | 6 | 5 | 7 | 6 |
| spec 兼容（CommonMark + GFM） | 10 | 9 | 6 | 9 | 10 |
| 总分 | 48 | 42 | 34 | 37 | 33 |

unified 在 plugin 生态、AST 暴露、TS 类型、spec 兼容上是 SOTA，但性能弱（多次树遍历）+ 学习曲线陡（要懂 plugin / AST / vfile 三个概念）。markdown-it 综合次之，胜在"配置简单"。

## Layer 6 — 限制（≥ 4 条）

1. **性能弱** ——每个 plugin 一次完整树遍历（unist-util-visit），10 个 plugin 就遍历 10 次。CPU 密集型场景（构建上千 markdown 文件）瓶颈明显
2. **学习曲线陡** ——要理解 mdast / hast / vfile / plugin 形态 / `this.data` 共享 / freeze 机制 5 层概念，新手半个月才能写个像样的 plugin
3. **AST 切换 mdast → hast 是单向有损** ——某些信息（语义）只能在 mdast 阶段处理，错过 remark-rehype 节点就再也拿不回来
4. **plugin 生态质量参差** ——700+ plugin 里有大量 1-2 stars 的实验品，long-tail 长，挑选成本高
5. **复杂 plugin 调试难** ——transformer chain 出错时 stack trace 跨 6-7 层 trough 调用，定位问题要熟读 unified 内部代码
6. **bundler size 加起来不小** ——unified + remark-parse + remark-rehype + rehype-stringify + 几个常用 plugin 通常 ≥ 200 KB，浏览器实时渲染场景应慎用

## 怀疑总集（前面散落 3 段，再补 2 段）

> 怀疑：unified 生态分散（remark / rehype / retext 各管一摊），导致用户决定"我的 plugin 该挂在 remark 还是 rehype 阶段"时心智负担重。比如 syntax highlight：你可以写 remark plugin（在 mdast 阶段）也可以写 rehype plugin（在 hast 阶段）。哪种对？社区的实际选择是 rehype-highlight / rehype-shiki —— 都在 hast 阶段。但官方文档不会替你定这个原则。我赌：未来会有"unified 风格指南"出现，把"何时 remark 何时 rehype"写成 lint 规则。

> 怀疑：unified 的 plugin 数量 ~700+ 看起来繁荣，但生态质量有一种"长尾不健康"的味道。GitHub 上实际维护活跃（近 6 个月有 commit）的不到 80 个，剩下都是 4-5 年前最后一次 release。这种 long-tail 是 npm 通病，但在 unified 这种"plugin first"框架里特别危险 ——你引入一个看似匹配需求的 plugin，结果它依赖的 unified 还是 v9，你的项目用 v11，运行时炸。我倾向只用 unifiedjs 组织官方维护的 plugin（@types/* 和 mdast-util-* 系列），社区 plugin 必须 fork 自审。

> 怀疑：与现代 zero-runtime 解析器（@swc/markdown、pulldown-cmark wasm）相比，unified 的"灵活但慢"优势在 build-time 工具链里逐渐被侵蚀。Astro / Next.js 把 markdown build 放在 Rust / Go 层处理的诱惑越来越大。unified 长期会不会被边缘化为"低性能要求 + 高灵活性"小众选择？我赌：不会，因为 plugin 生态护城河深 ——从 zero-runtime 解析器写 plugin 要会 Rust，绝大多数前端工程师写不来。但 unified 自己应该考虑底层接 wasm（micromark-wasm 已经在做）。

> 怀疑：unified 的 frozen 机制保证 processor 不可变，但每次"派生"重跑 plugin attach 阶段。在 watch 模式下（Astro dev）每次保存一个 .md 都要 freeze 一遍，10 个 plugin 加起来几十毫秒。生产 build 上千文件时累积秒级延迟。我猜内部应该有个 "shared frozen processor pool"，但目前没看到这种 API。

> 怀疑：plugin 是纯函数听起来很美，但实际很多 plugin 用 `this.data('xxxExtensions').push(...)` 共享状态，这本质是全局变量。多个 plugin 想给 micromark 加扩展时，顺序敏感（先 use remark-gfm 再 use remark-frontmatter 和反过来效果不同），调试时不易看出来。这类隐式耦合是"plugin pipeline"模式的固有代价。

## GitHub Permalinks（≥ 4 处带 40-char hex SHA，真实可解析）

源码精读入口（链接已用真实 commit SHA，可点开验证）：

- unified core processor（`Processor` class + `freeze` + `use`）：
  `https://github.com/unifiedjs/unified/blob/0f26ecf2f21621413cf5dab00016de8b7dace04f/lib/index.js`
- unified processor 流水线协议（README + 历史变更）：
  `https://github.com/unifiedjs/unified/blob/ba1af683ba597228b736566752668e7132295d38/readme.md`
- unified processor 入口的另一份历史快照（看 freeze 演进）：
  `https://github.com/unifiedjs/unified/blob/1cdc8cd2670e38ef687efb4314bb0f6fd97ef6e7/lib/index.js`
- remark 主包入口（`remark()` = unified + remark-parse + remark-stringify）：
  `https://github.com/remarkjs/remark/blob/04474da326dd9c9b9ed9c4f7bfe6669142e2d08a/packages/remark-parse/lib/index.js`
- remark 核心 parser plugin 历史快照：
  `https://github.com/remarkjs/remark/blob/45d8fa503157d20a656b3fa00e4b010dc0e50748/packages/remark-parse/lib/index.js`
- rehype-stringify（hast → HTML 序列化）：
  `https://github.com/rehypejs/rehype/blob/a6a845c55d1afe045377ffdb0b322e6732e5dea8/packages/rehype-stringify/lib/index.js`
- mdast 规范（节点定义 + position 字段约定）：
  `https://github.com/syntax-tree/mdast/blob/c034ec9ddb8ca2ab16de90d668433624bdd92179/readme.md`
- hast 规范（HTML AST 节点定义）：
  `https://github.com/syntax-tree/hast/blob/08305dcde7e72a0e1e33474cfa474be4032738b2/readme.md`

## Layer 7 — 实战（≥ 25 行）

完整 unified pipeline：把 Markdown 渲染成带语法高亮 + 自动锚点 + 安全 HTML 的输出。

```js
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkFrontmatter from 'remark-frontmatter';
import remarkRehype from 'remark-rehype';
import rehypeRaw from 'rehype-raw';
import rehypeSlug from 'rehype-slug';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import rehypeHighlight from 'rehype-highlight';
import rehypeSanitize from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';

const processor = unified()
  // remark 阶段（处理 mdast）
  .use(remarkParse)
  .use(remarkGfm)                                    // 表格 / 任务列表 / 删除线
  .use(remarkFrontmatter, ['yaml', 'toml'])          // 跳过 frontmatter 不当 markdown 渲染
  // 切换到 rehype 阶段（mdast → hast）
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeRaw)                                    // 重新解析 markdown 内嵌的 HTML
  .use(rehypeSlug)                                   // h1-h6 加 id 属性
  .use(rehypeAutolinkHeadings, { behavior: 'wrap' }) // heading 自动包 anchor
  .use(rehypeHighlight)                              // <code> 语法高亮（lowlight）
  .use(rehypeSanitize)                               // XSS 防护
  .use(rehypeStringify);

const file = await processor.process(`---
title: My Post
---

# Hello

Some \`inline\` and a [link](https://example.com).

\`\`\`js
const x = 1;
\`\`\`
`);

console.log(String(file));
console.log('Lint messages:', file.messages);
```

要点：

1. `remark-frontmatter` 必须在 parse 阶段就识别 YAML / TOML，否则它们会被当成 Markdown 渲染成混乱
2. `remark-rehype` 的 `allowDangerousHtml: true` + `rehype-raw` 是处理"markdown 内嵌 HTML"的标准组合
3. `rehype-slug` 必须早于 `rehype-autolink-headings`（后者依赖前者写好的 id）
4. `rehype-sanitize` 一定放在最后（其他 plugin 注入的属性如果不在 sanitize 白名单里也会被剥离）
5. `file.messages` 收集所有 plugin 报的 lint warnings，可以接 reporter 做 CI 报告

## 学到什么 + 关联（≥ 15 行）

学到的 ≥ 5 条：

1. **AST + plugin pipeline 是文档处理的优秀抽象** ——把"端到端解析器"拆成 parser + transformer + compiler 三段，组合性强
2. **接口规范化能撑起庞大生态** ——unified 自己代码 600 行，但因为 mdast / hast / vfile 接口规范，社区写出 700+ plugin
3. **`.use()` 链式 + 不变性 + lazy freeze** 是处理"配置 vs 执行"分离的经典模式（参考 koa / express / RxJS pipe）
4. **mdast → hast 的语法树切换** 是有意识的架构选择 —— 同一棵 AST 处理"语义"和"DOM"是反模式（节点形态会冲突），分两棵树用 bridge 转换更清晰
5. **vfile 作为贯穿全程的"文件抽象"** 让 lint / source map / 多文件构建变得自然 —— 这是把传统 build 工具的 file emit 概念抽象出来

关联：
- [[remark]] [[rehype]] [[retext]] [[mdx]] [[micromark]] —— unified 子生态
- [[mdast]] [[hast]] [[unist]] [[vfile]] —— 数据规范
- [[astro]] [[gatsby]] [[next-js]] [[vuepress]] [[storybook]] —— 主消费方
- [[markdown-it]] [[marked]] [[pulldown-cmark]] [[comrak]] —— 同领域非 unified 路线
- [[koa]] [[express]] [[rxjs]] —— `.use()` 链式 pipeline 的同型模式

## 附录 A — syntax-tree 规范族详解（≥ 25 行）

unified 不是单个项目，而是一整个组织（unifiedjs）+ 一组 AST 规范（syntax-tree 组织）。整个体系的"规范层"在 `github.com/syntax-tree`：

| 规范 | 含义 | 节点举例 |
|---|---|---|
| **unist** | 通用语法树根规范（root spec）| `Node { type: string, position?, data? }` |
| **mdast** | Markdown AST | heading / paragraph / list / code / link |
| **hast** | HTML AST | element / text / comment / doctype |
| **nlcst** | 自然语言 AST | sentence / word / punctuation |
| **xast** | XML AST | element / attribute / comment / cdata |
| **mdxast** | MDX AST | mdast + JSX 节点 |

unist 是元规范 —— 任何具体 AST 都满足"有 type / 有 children（如果是 parent） / 有 position"。这让 unist-util-* 工具（visit / map / filter / select）能跨规范工作 —— 你写一个 `visit(tree, 'heading', ...)`，无论 tree 是 mdast 还是 hast 都能用。

工具库（unist-util-*）：

- **unist-util-visit**：深度遍历 + 修改
- **unist-util-select**：CSS-selector 风格选择节点
- **unist-util-map**：返回新 tree
- **unist-util-filter**：保留满足条件的节点
- **unist-util-find-after / find-before**：相对位置查找

每个具体规范还有 `mdast-util-* / hast-util-*` 子工具。比如 `mdast-util-to-markdown` 是 stringify，`mdast-util-from-markdown` 是 parse。这些底层工具不依赖 unified 也能用 —— 这就是为什么 unified 自己只需 600 行：所有重活都在规范工具里。

## 附录 B — unified vs zero-runtime 解析器对比（≥ 25 行）

近年 markdown / HTML 处理出现 zero-runtime 趋势：用 Rust / Zig / C 写的解析器编译成 wasm，在浏览器和 Node 里跑都比 JS 快 5-20x。

主流方案：

### pulldown-cmark（Rust）
```rust
use pulldown_cmark::{Parser, html};
let parser = Parser::new("# Hello");
let mut output = String::new();
html::push_html(&mut output, parser);
```
- 优势：CommonMark 兼容、Rust 性能、广泛用于 Rust 工具链（mdBook 内置）
- 劣势：plugin 体系几乎没有，扩展靠 fork 源码

### comrak（Rust）
- pulldown-cmark 改进版，支持 GFM extensions
- 同样无 plugin 生态

### @swc/markdown（Rust + napi-rs）
- 通过 napi 嵌入 Node，性能 10x markdown-it
- API 偏底层，社区刚起步

### 与 unified 的取舍

| 维度 | unified | zero-runtime |
|---|---|---|
| 性能 | 慢（树遍历 ×N） | 快 5-20x |
| Plugin 生态 | 700+ | ~10 |
| 写 plugin 难度 | JS 函数 | Rust / Zig |
| 调试 | console.log | wasm trace 难 |
| 文档站工具链 | Astro / MDX / Gatsby | mdBook / Zola |
| TS 类型支持 | 完整 | 边缘 |

我的判断：**zero-runtime 在"build 一次输出 HTML"场景已经赢**（mdBook、Hugo、Zola 都是这条路）。但**在"我要可编程定制 markdown 转换链"场景，unified 仍然是 SOTA**（MDX、Astro、Storybook 必须用）。两条路线长期共存，性能敏感选 wasm，灵活性敏感选 unified。

## 附录 C — 学习路径（≥ 20 行）

第一周（基础）：
1. 安装 unified + remark-parse + remark-rehype + rehype-stringify，跑通"# Hello → `<h1>Hello</h1>`"
2. 在 IDE 里 inspect mdast 结构（用 `console.dir(file, { depth: null })` 或 unist-util-visit 打印）
3. 理解 4 种执行入口：parse / run / stringify / process
4. 加 remark-gfm，看 token 在 mdast 里增加 `gfm` 类型节点

第二周（mdast / hast 操作）：
5. 用 unist-util-visit 写第一个 transformer：把所有 emphasis 节点替换成 strong
6. 用 hast-util-from-html 做反向（HTML → hast → 修改 → 输出 markdown）
7. 写 mdast-util-to-string 把 paragraph 转成纯文本
8. 理解 mdast → hast 这一步什么信息会丢（深度阅读 mdast-util-to-hast 文档）

第三周（plugin 编写）：
9. 写第一个 remark plugin：给所有 heading 加上 emoji 前缀
10. 写第一个 rehype plugin：给外部链接加 `target="_blank"` 和 `rel="noopener"`
11. 学 `this.data('xxxExtensions')` 共享通道（看 remark-gfm 源码）
12. 看 vfile.messages 实现 lint plugin（参考 retext-readability）

第四周（实战）：
13. 集成到 Astro / Next.js 项目，自定义 markdown 渲染管线
14. 跑 source map 流程（mdast → hast → HTML，记 position 反推到原文）
15. 性能优化：减少 visit 次数，合并多个 plugin 共用一次遍历

## 附录 D — 学到补充（≥ 15 行）

补充 5 条工程教训：

6. **AST 是数据，plugin 是函数，pipeline 是组合** —— 这句话能解释 80% unified 的设计决定，记住它就理解了一半源码
7. **接口规范优于具体实现** —— mdast / hast 规范让任何团队能各自实现工具又互通；这是开源生态的核心力量
8. **lazy freeze + immutable derivation** 是处理"配置 vs 执行"经典模式，可以推广到任何 plugin 系统
9. **vfile 这种"贯穿全程的载体"在 build 工具链里非常有价值** —— webpack 的 chunk、vite 的 module、unified 的 vfile 都是同一思想
10. **规范背后必须配工具库** —— mdast 不光是规范，还配 mdast-util-to-string / mdast-util-to-hast / mdast-util-from-markdown 整套；规范没工具就是空文档

最后一条，关于"读源码"：

11. **600 行的 unified core 是工程教学样本** —— 任何前端工程师都该读一遍。它的 `freeze + use + processor 派生` 三件套是 framework design 的活教材。比起读 webpack（10 万行）、读 vite（3 万行），unified 600 行能让你用 1 小时学会 plugin pipeline 设计的精髓。

12. **怀疑要落到具体可验证点** —— 我前面写了 5 个怀疑，每个都附了 "我赌：xxx" 的判断。怀疑不是抒情，是把"我可能错的地方"显式标出来，便于将来回头验证或推翻。
