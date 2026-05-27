---
title: "Biome — 一个工具替代 ESLint + Prettier 的勇气"
description: 不是把两个工具合到一起，是从零写一个 Rust 工具链，复用 AST、共享配置、跑得快 25 倍
sidebar:
  order: 22
  label: "biomejs/biome"
---

> biomejs/biome v2.4.16（2026-05），MIT。
> Rust 写的，单二进制 + 零依赖。
>
> Biome 不是"把 ESLint 和 Prettier 包到一起"——
> 它是**从零写一个新工具链**，linter、formatter、import sorter 共享同一份 AST，
> 配置统一在一个 `biome.json`。
>
> 这件事看起来"应该早就有人做"。但前 10 年没人做——
> 因为它需要的不是技术，是**判断力**：你必须相信"现状是局部最优而非全局最优"，
> 才会愿意推翻重来。
>
> Season 3 收尾。

## 一句话定位

**Biome = Rust 写的 JS/TS/JSON/CSS/GraphQL 工具链，linter + formatter + import sorter 一体化。**
跑同一份 AST，**比 ESLint + Prettier 快 25-100 倍**。
配置一个文件 `biome.json`，不要 `.eslintrc` + `.prettierrc` + `.prettierignore` + `.eslintignore` 四件套。

## Why（为什么是它而不是 ESLint + Prettier / dprint / oxlint）

主流工具链的现状：

```
.eslintrc.json
.eslintignore
.prettierrc
.prettierignore
.editorconfig
tsconfig.json
package.json (devDeps: 50+ 个 lint/format 包)
```

每个文件只解决一个问题。每个工具用自己的 AST。
**改一行代码，可能要让 ESLint 解析一次、TypeScript 解析一次、Prettier 解析一次**。

```bash
npm run lint         # ESLint：8 秒
npm run format       # Prettier：3 秒
npm run typecheck    # tsc：6 秒
```

为什么不能一次解析？历史原因：每个工具独立诞生，没有统一基础设施。
**积累 10 年后，没人有动力推翻**。

Biome 就是那个推翻者。判断：

1. **AST 应该一份**——多个 pass 共享
2. **配置应该一个文件**——所有规则统一
3. **Rust 解决性能**——并行 + 零 GC + native 二进制
4. **不要 100% 兼容 ESLint**——选择性移植高价值规则（已 450+ 条）
5. **不要 100% 兼容 Prettier**——但要 97% 兼容（Algora 上有挑战奖金）

| 工具 | 语言 | linter | formatter | 速度 | 配置文件数 |
|---|---|---|---|---|---|
| ESLint + Prettier | JS | ✓ | ✓ | 1x | 4-6 |
| dprint | Rust | ✗ | ✓ | 10x | 1 |
| oxlint | Rust | ✓ | ✗ | 50x | 1 |
| **Biome** | **Rust** | ✓（450+ 规则） | ✓（97% Prettier 兼容） | **25-100x** | **1** |

**为什么不是 dprint**：dprint 只做 format，性能好但 lint 还是 ESLint。
你拿不到"一个工具"的体验。

**为什么不是 oxlint**：oxlint 是 Vite 团队的 Rust linter，性能更极致（号称比 Biome 还快），
但只做 lint，format 还是 Prettier。**和 Biome 不是直接竞品**——更像互补。

**为什么不是 swc 的 `@swc/cli`**：swc 是编译器，不是 linter / formatter。

**Biome 的判断分水岭**：
- 选"整合"——一个工具替代多个，体验加分
- 选"性能"——Rust，AST 复用，速度爆炸
- 选"兼容性 97%"——不追求 100%（追求 100% 等于和 Prettier 绑定演化）
- **不选**"插件生态"——故意限制 plugin 系统，保持快速迭代

**Biome 的代价**：
- 复杂的 ESLint 自定义规则要重新写（或没有等价）
- 某些 Prettier 输出差异（3% 不兼容）
- 团队迁移要培训 + 改 CI

## 仓库地形

```
biome/
├── crates/                     ← 94 个 Rust crate
│   ├── biome_js_parser/        ← JS/TS parser（fork from rome-rs / rslint）
│   ├── biome_js_syntax/        ← AST 节点类型
│   ├── biome_js_formatter/     ← JS formatter
│   ├── biome_js_analyze/       ← JS linter 规则
│   ├── biome_css_parser/       ← CSS parser
│   ├── biome_css_formatter/    ← CSS formatter
│   ├── biome_css_analyze/      ← CSS linter
│   ├── biome_json_parser/      ← JSON parser
│   ├── biome_json_formatter/   ← JSON formatter
│   ├── biome_graphql_*/        ← GraphQL 同套
│   ├── biome_formatter/        ← 通用 formatter framework
│   ├── biome_analyze/          ← 通用 analyzer framework
│   ├── biome_diagnostics/      ← 错误信息系统
│   ├── biome_cli/              ← CLI 入口
│   ├── biome_lsp/              ← LSP server（编辑器集成）
│   └── ...
├── packages/@biomejs/biome/    ← npm 包装
└── plugins/                    ← 实验性 plugin
```

**心脏文件**：

1. `crates/biome_formatter/`——通用 formatter framework，所有语言共享
2. `crates/biome_analyze/`——通用 analyzer framework，所有 lint 规则共享
3. `crates/biome_js_parser/src/parser.rs`——手写 JS parser

**关键架构**：每种语言（JS / CSS / JSON / GraphQL）有独立的 parser + formatter + analyzer，
但**都基于同一套 framework crate**——保证一致性。

## 核心机制 · Layer 3 精读

### 机制 1 · AST 复用 — 整个产品的基础假设

ESLint + Prettier 的工作流：

```
源文件
   ↓
ESLint 用 espree parse → ESLint AST → 跑 lint 规则 → 报错
   ↓ （另一个进程）
Prettier 用自己的 parser parse → Prettier AST → 重新生成代码
```

**两次 parse**——AST 不能共享，因为两个工具的 AST 节点类型不一致。

Biome：

```
源文件
   ↓
biome_js_parser parse → 一份 AST
   ↓
biome_js_analyze 跑 lint
biome_js_formatter 跑 format
（同一个 AST 引用，不重新 parse）
```

**这是 25-100x 性能差距的核心**。其他都是 Rust 红利的次要贡献。

### 机制 2 · 通用 formatter framework — 一套 IR 跨语言

Prettier 内部用一种叫 **IR（intermediate representation）** 的东西来表示"格式化后的文档"——
一系列 `group / indent / line / softline` 等指令。这套 IR 来自论文
"A prettier printer" (Wadler, 2003)。

Biome 直接复用了这套思想（`crates/biome_formatter/`），但加上 Rust 的实现优势：

```rust
// 伪代码（参考 biome_formatter::format_element）
let element = group([
    "function ",
    name,
    "(",
    soft_line_break_or_space,
    indent([params]),
    soft_line_break,
    ")"
]);
```

每种语言（JS / CSS / JSON）的 formatter 把语言特定 AST 转成这套通用 IR——
然后 framework 决定怎么换行、怎么缩进、怎么排版。

→ 这种"**通用 framework + 语言适配器**"模式是 Biome 能扩展到多语言的关键。
和 LSP 协议（一套 client 接口 + 多种 server 实现）异曲同工。

### 机制 3 · analyzer framework — lint 规则像插件

`crates/biome_analyze/` 提供基础设施：
- 规则元数据（name / severity / fix kind）
- 遍历 AST 的 visitor pattern
- diagnostic 收集 + 自动 fix 建议

具体规则在 `crates/biome_js_analyze/`：每条规则是个 Rust struct + impl trait。

例子（伪代码）：

```rust
declare_rule! {
    pub(crate) NoUnusedVariables {
        version: "1.0.0",
        name: "noUnusedVariables",
        recommended: true,
        fix_kind: FixKind::Unsafe,
    }
}

impl Rule for NoUnusedVariables {
    fn run(ctx: &RuleContext<Self>) -> Self::Signals { /* ... */ }
    fn diagnostic(...) -> Option<RuleDiagnostic> { /* ... */ }
    fn action(...) -> Option<JsRuleAction> { /* fix it */ }
}
```

→ 这套 trait-based 规则定义比 ESLint 的 `meta` + `create()` 闭包**类型更安全**——
规则元数据是编译期声明的（用 macro），不是运行期对象。

### 机制 4 · 单二进制 + LSP server — 编辑器集成

Biome 的 npm 包内部是 `bin/biome`——一个 Rust 编译的二进制。
没有 `node_modules` 的递归依赖。

`biome lsp-proxy` 命令启动 LSP server，VSCode 插件通过 LSP 协议和它通信：
- 你在编辑器里写代码
- VSCode 调 LSP 协议告诉 biome
- biome 实时返回 diagnostics + format 建议

→ 这是**为编辑器场景而设计**的。ESLint 在编辑器里慢的根因是 Node 启动 + 单线程 + AST 重复 parse。
Biome 用 Rust LSP 守护进程 + 增量更新 AST，体验完全不同。

### 机制 5 · 配置融合 — 一个文件管所有

```jsonc
// biome.json
{
  "$schema": "https://biomejs.dev/schemas/2.0.0/schema.json",
  "files": { "ignoreUnknown": false, "ignore": ["**/dist/**"] },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 80
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "style": { "noVar": "error" }
    }
  },
  "javascript": { "formatter": { "semicolons": "asNeeded" } },
  "json": { "formatter": { "indentWidth": 4 } }
}
```

**一个文件**。对比 ESLint + Prettier 的 4 个文件：
- `.eslintrc.json` / `.eslintignore`
- `.prettierrc` / `.prettierignore`

→ 这种**配置整合**减少的认知负担和维护成本，比性能提升更长期。

## 横向对比

### vs ESLint + Prettier — 范式差异

ESLint + Prettier 的核心问题不是"它们做错了"，是"它们各自做对了，但合在一起浪费"。

ESLint：plugin 生态丰富、社区规则海量。但 JS 写的，慢。
Prettier：opinionated formatter，配置极简。但 JS 写的，慢，且 lint 不归它管。

Biome 的回答：**两件事一起做，从设计上就**。

代价：ESLint 的某些自定义规则（公司内部 lint）你要在 Biome 重写，
或暂时双跑（成本 = 复杂的 CI 链）。

### vs Rome — 前世今生

Biome 的前身是 **Rome**——同一帮人在 Facebook 做的项目（前 babel 作者发起），后来公司倒闭，
项目分叉成 Biome（社区接管）。

→ 知道这个背景才理解 Biome 为什么有 94 个 crate 这么大——是 Rome 时代的遗产。
某些设计的"野心"也是从 Rome 来的（曾经想做完整 web toolchain，包括 bundler）。

### vs oxlint — 同代竞品

oxlint 是 Vite 团队的"更激进的 Rust linter"。号称比 Biome lint 还快 50%。
但它**只做 lint**，formatter 还要 Prettier。

判断：
- 如果你只要 lint + 已经习惯 Prettier 的产物 → oxlint
- 如果你要 lint + format + 一致性 → Biome

### vs dprint — 互补

dprint 是 Rust formatter，没有 lint。设计目标是"format 单点最好"。
Biome 在 format 的兼容性 / 速度上和 dprint 接近，但**多了 lint**。

实际选择：**整合 > 单点最强**。Biome 胜。

## Hands-on（5 分钟内能跑）

```bash
mkdir biome-demo && cd biome-demo
npm init -y
npm install --save-dev --save-exact @biomejs/biome
npx @biomejs/biome init
```

写一个故意有问题的文件 `app.ts`：

```typescript
const  x =  1;            //   多余空格 + 用 const 声明 var
let unused = 'never used';
function   greet( name :string){
  console.log(  "hello"+name)
}
greet ('bob')
```

```bash
# 一次性 lint + format
npx biome check --write app.ts

# 输出会修复格式 + 报告 unused variable
```

打开 `app.ts`：格式化后变干净。同时在 stderr 看到：

```
app.ts:2:5  unused-vars  unused is declared but never used
```

### 改一处的实验（必做）

把 `package.json` 的 lint 脚本改成：

```json
{
  "scripts": {
    "lint": "biome check ."
  }
}
```

跑 `time npm run lint`。

然后**装上 ESLint + Prettier**：
```bash
npm install --save-dev eslint prettier @typescript-eslint/parser @typescript-eslint/eslint-plugin
# 加 .eslintrc.json + .prettierrc
```

把 `lint` 改成 `eslint . && prettier --check .`。

跑 `time npm run lint`——**两边的耗时差距亲手感受**。

第二个实验：在 1000 文件的项目跑 biome 和 eslint+prettier 对比。
通常 biome 0.5 秒，eslint+prettier 30-60 秒。

## 与你工作的连接

**能立刻迁移**：

- 任何**新项目**用 Biome 起步（速度 + 单文件配置）
- 现有 ESLint + Prettier 项目可以**并行**用 biome（不用立即砍掉旧栈）
- pre-commit hook 用 biome（`lint-staged + biome check --staged`）

**下个月可能用到**：

- 给团队推 biome：用 ROI 表（性能提升 25x、配置文件减少 4→1、新人上手 30 分钟而不是 3 天）
- 配 VSCode + Biome 插件，体验"边写边 lint+format" 的丝滑

**不要用 Biome 的部分**：

- **重度依赖 ESLint 自定义规则**——迁移成本可能 > 性能收益
- **超大型项目（10000+ 文件）+ ESLint 早就调到完美**——别动它
- **需要 Prettier 100% 兼容**（某些下游工具吃 Prettier 输出）——3% 差异可能炸

## 读完你能做之前做不了的事

- **判断**：选 lint / format 工具时，能用"性能 / 整合度 / 生态成熟度"三维评估
- **设计**：写自己的代码工具时，问"我能不能让多个 pass 共享同一份 AST"
- **解释**：被问"为什么 Rust 工具比 JS 工具快这么多"时，能说出"GC / 并行 / AST 共享"三层
- **下钻**：看懂 LSP 协议、AST visitor 模式——它们是工具链的通用基础
- **对照**：识别"我的工具链是不是积累出来的复杂"——对照"是否能合并"

## 自检 · 5 个问题

1. ESLint + Prettier 各自有一份 AST，**重复 parse**。如果 ESLint 团队接受 Prettier 的 AST 格式，
   能不能不重新发明一个 Biome？为什么实际上不会发生？
2. Biome 用 Rust 写。如果用 Go（像 esbuild），技术上的取舍会怎样？性能差距大吗？
3. Biome 故意限制 plugin 系统。这种"反生态"的判断在产品早期是优势还是劣势？长期呢？
4. 公司有 50 条自定义 ESLint 规则，团队 50 人。完全切到 Biome 的迁移路径设计——
   不是 0/1，而是分阶段。
5. Biome 和 oxlint 一个做整合，一个追极致。10 年后哪个会赢？为什么？

## 延伸阅读

读完这篇笔记后下一步：

1. `crates/biome_formatter/src/builders.rs`——通用 IR 的核心 API
2. `crates/biome_analyze/src/lib.rs`——analyzer framework 的 trait 设计
3. **Wadler 1998 paper** "A prettier printer"——Prettier / Biome formatter 的理论根
4. **rome 历史 + 倒闭 + 重生**博客（biomejs.dev/blog）——理解项目的 governance 演化
5. **oxlint** 源码——对比"完全同代"工具的设计差异

---

**笔记完成**：2026-05-27（v2.4.16）
**研究方法**：本地克隆 + 读 README + 看 crates 结构 + 设计判断分析
**心脏文件**：`crates/biome_formatter/` + `crates/biome_analyze/`（通用 framework）
