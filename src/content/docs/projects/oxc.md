---
title: oxc — Rust 写一整套 JS/TS 工具链的勇气
来源: 'https://github.com/oxc-project/oxc'
日期: 2026-05-30
分类: projects / 编译器
难度: 中级
---

## 是什么

oxc 是用 **Rust 写的一整套 JavaScript / TypeScript 工具链**——parser、linter、formatter、transformer、resolver、minifier 全在一个仓库里。日常类比：像一座共用一份图纸的工厂大院，所有车间（linter、formatter）都从同一台总装线（parser + AST）下料，不再各画各的图。

主流前端的现状是：ESLint、Prettier、Babel、tsc、swc、esbuild 各自带一份 parser，每个 parser 输出自己定义的 AST。CI 跑一次 lint+format+build，同一段代码可能被 parse 六次。

oxc 的判断：**AST 应该是个独立的 crate**，parser 把字节变成树，linter 和 formatter 只读这棵树就行。这套设计让它的 linter 比 ESLint 快 50-100 倍，parser 比 swc 快 3 倍。

## 为什么重要

不理解 oxc，下面这些事都没法解释：

- 为什么 Vite 团队会选一个新工具（Rolldown）当下一代 bundler，底座却押在 oxc 上
- 为什么"用 Rust 重写 ESLint"听起来简单，真做出来的只有 oxc 和 [[biome]]
- 为什么 oxc 故意不做插件 API，把社区可贡献口收得很窄
- 为什么 oxlint 在大型 monorepo 里能把 lint 阶段从 90 秒压到 1 秒

## 核心要点

oxc 的设计可以拆成 **三个判断**：

1. **AST 独立成 crate**：`oxc_ast` 是纯 data-only crate，不依赖 parser。下游想做 transform 不用先 parse 一次，直接接 AST。类比：螺丝标准化，所有工具厂都能用同一颗。

2. **数据结构决定性能**：`Span` 用 `u32` 而不是 `usize`，每个节点省 8 字节；分配走 bump arena 而不是 `Box<T>`，drop 整棵树是 O(1)；标识符走 `Atom` 字符串 interning，比较是指针对比。

3. **故意不开放插件 API**：所有 lint 规则都在主仓库里，由维护者直接 review。代价是用户写不了"自定义业务规则"，收益是每次升级不用考虑插件兼容。

三个判断合在一起：**接口标准化 + 数据结构极致 + 生态故意收窄**。

换句话说，oxc 不只是"把 ESLint 翻译成 Rust"——它先把 AST、Span、Allocator 这套"地基"重做一遍，再让 linter / formatter / transformer 像几栋楼一样长在同一块地基上。地基不变，楼可以一栋栋盖。这也是它能同时被 Rolldown 当 parser、被 oxlint 当 lint 引擎、被 oxc-resolver 当解析库的原因。

## 实践案例

### 案例 1：oxlint 在 CI 里替换 ESLint

```bash
# 原来 .eslintrc.js + 200 个文件
$ time pnpm lint
real    1m32.4s

# 安装 oxlint，配置基本兼容
$ pnpm add -D oxlint
$ time pnpm oxlint
real    0m0.9s
```

**逐部分解释**：

- oxlint 把 600+ 条规则编译进二进制，不像 ESLint 每次都要 require plugin
- 多线程跑文件，单核 ESLint 永远赶不上
- 不兼容的规则会输出 warning，不会让 CI 失败
- oxlint 默认开启的规则集（correctness、suspicious）覆盖了 ESLint recommended 的 80%
- 不兼容那部分规则可以保留 ESLint 二次跑，逐步迁移而不是一次切干净

### 案例 2：Rolldown 把 oxc 当依赖用

```rust
use oxc_allocator::Allocator;
use oxc_parser::Parser;
use oxc_span::SourceType;

let allocator = Allocator::default();
let source = "const x: number = 1;";
let ret = Parser::new(&allocator, source, SourceType::ts()).parse();
// ret.program 是 AST，ret.errors 是诊断列表
```

Rolldown 拿到 `ret.program` 直接喂给 `oxc_transformer` 做 TS 降级 + JSX 转换，全程 **不再 parse 第二次**。同一棵 AST 在 bundler 里走完整个 pipeline，省的不只是 parse 时间，还省了"两份 AST 数据结构互相转换"的代码量——这部分在传统工具链里往往是最难维护、最容易出 bug 的胶水层。

### 案例 3：oxc-resolver 替 enhanced-resolve

webpack/Rspack 用的 `enhanced-resolve` 是 JS 写的，每次解析 `import` 都要走 Node fs sync。oxc-resolver 用 Rust 实现同样的 Node 解析算法，且把 `tsconfig.json` 的 paths 也内置：

```ts
const resolver = new Resolver({ extensions: ['.ts', '.tsx', '.js'] });
resolver.sync('/project/src', './utils');
// → /project/src/utils.ts
```

实测在大型 monorepo 里比 enhanced-resolve **快 28 倍**，bundler 冷启动直接腰斩。

oxc-resolver 还顺手把 `package.json` 的 `exports` / `imports` 字段、`browser` 字段、`module` 字段都按 Node 规范实现了，下游不用再各自维护一套兼容代码。Rspack、Rolldown、unbuild 都已经切到这条依赖。

## 踩过的坑

1. **arena lifetime 学习曲线陡**：所有 AST 节点都借用 `&'a Allocator`，写 visitor 时一个生命周期写错就编译不过，前端开发者第一周常卡在这。

2. **formatter 还没到 1.0**：`oxfmt` 输出格式和 Prettier 有少量差异（trailing comma、JSX 换行），需要 100% Prettier 兼容选 Biome 而不是 oxc。

3. **没插件 API**：公司内部要写"禁止 import 某模块"这种业务规则，要么 fork oxlint 改主仓库，要么继续用 ESLint custom rule，没第三条路。

4. **不做类型推导**：oxc 不是 tsc 的替代——它不知道 `T extends keyof X` 这种类型层面的事情，类型检查仍然必须 `tsc --noEmit`。

## 适用 vs 不适用场景

**适用**：

- 大型 monorepo 想砍 lint / parse 时间，oxlint 是当前最快的 ESLint 替代
- 自己造 bundler / 框架，想白嫖一份"100% TS 兼容"的 parser + AST
- Vite 用户切到 Rolldown-Vite，自动享受 oxc 加速
- 想读 Rust 编译器源码学性能优化（arena / 字符串 interning / u32 offset）

**不适用**：

- 重度依赖 ESLint 自定义规则的团队，迁移会丢规则
- 老 Node.js 版本（< 18），napi 二进制不一定有
- 小项目几十个文件，ESLint 跑 2 秒就完事，迁移收益小
- 需要类型层面的检查 / 重构，那是 tsc 的领地

## 历史小故事（可跳过）

- **2021 年**：Boshen 个人项目起手，最初目标只是"用 Rust 写一个 JS parser 玩"
- **2023 年**：oxlint 第一个版本发布，对比 ESLint 快 50 倍的截图在社区刷屏
- **2024 年**：VoidZero 成立（Vite 作者 Evan You 牵头），把 oxc 收编做下一代前端工具链底座
- **2024 年底**：Rolldown 公测，宣布底层全用 oxc，bundler 切到 oxc-resolver
- **2025 年**：Rolldown-Vite 进入 Vite 7 alpha，oxc 正式成为前端主线工具
- **2026 年初**：oxlint 1.0 发布，规则数突破 700+，主流框架（Nuxt、Astro、Preact）官方文档把 oxlint 列为推荐 linter

## 学到什么

1. **接口比实现重要 10 倍**——AST 形状一旦稳定，下游可以爆炸式生长
2. **90% 的性能提升来自数据结构选型**，剩下 10% 才是算法
3. **生态广度和迭代速度是对立的**——故意收窄插件，换每次升级敢动内部 API
4. **新工具不是从"功能更多"赢，是从"重做一份正确的底"赢**

## 延伸阅读

- 官方文档：[oxc.rs](https://oxc.rs)（首页直接列性能对比）
- 仓库：[oxc-project/oxc](https://github.com/oxc-project/oxc)
- 设计稿：[oxc Architecture](https://oxc.rs/docs/learn/architecture.html)
- 性能拆解：[Why is oxc fast](https://oxc.rs/blog)
- [[biome]] —— 同样 Rust 写的 JS 工具链，路线对比

## 关联

- [[biome]] —— 同代竞品，做"用户直接用 CLI"，oxc 做"被别人当依赖用"
- [[swc]] —— 老一代 Rust JS 工具，parser 比 oxc 慢 3 倍，transformer 仍是事实标准
- [[esbuild]] —— Go 写的 bundler，parser 私有不可复用，oxc 反方向走
- [[lightningcss]] —— Rust 写的 CSS 编译器，思路和 oxc 同源但跨语言
- [[rolldown]] —— 用 oxc 当底座的下一代 bundler
- [[wadler-prettier]] —— Prettier 算法源头，oxfmt 仍在追赶
- [[astro]] —— Vite 系下游，迟早会享受 oxc 加速

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[rolldown]] —— rolldown — 用 Rust 给 Vite 当统一引擎的打包器
