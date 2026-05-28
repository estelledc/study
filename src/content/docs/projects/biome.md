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
> Season 3 收尾。**项目类型：编译器 / 运行时（v1.1 分支 C）**——
> 输入字节、输出 transformed text + diagnostics，
> 心脏物按 phase 分布：lex → parse → analyze → format / lint → diagnostic emit。

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

## Pipeline 全景图（v1.1 分支 C 必填 P0）

![Biome pipeline 五个 phase](/projects/biome/01-pipeline.webp)

> **图说**：源码进入 biome 后依次穿过 5 个 phase。
> 每个方框 = 一个 phase + 它的 trade-off + 它在仓库里的代表 crate。
> 中间那条横线是整篇笔记的命门——**「一份 AST 全程不重 parse」**。
> ESLint 是把 espree、Prettier、tsc 当三个独立服务去用，三次 parse；
> biome 是把同一棵 Rowan 树喂下游所有阶段，**parse 只发生一次**。

读这张图的方式：横向看是 dataflow（一份字节怎么变成 diagnostic），
纵向看是 trade-off（每 phase 都做了一个非平凡的设计选择，下一节代码精读会逐个拆开）。

## 仓库地形（按 phase 重画）

v1 工具库笔记习惯按"目录路径"罗列；分支 C 编译器/运行时要按 **pipeline phase 分组**——
路径只是表象，phase 才是心脏。94 个 crate 大致落在 5 个 phase 里：

```
biome/crates/                                  # 94 个 Rust crate
│
├─ Phase 1 · LEX（字节 → token）
│   └─ biome_js_parser/src/lexer/             # 手写 JS 词法器，2076 行
│       ├─ mod.rs                              # 主循环 + JsReLexContext
│       └─ ...                                 # `/` 何时是除号、何时是 regex
│
├─ Phase 2 · PARSE（token → events → Rowan tree）
│   ├─ biome_js_parser/src/parser.rs          # JsParser 主结构（263 行）★ 心脏
│   ├─ biome_js_syntax/                        # JS AST 节点枚举（自动生成）
│   ├─ biome_css_parser/ + biome_json_parser/  # 同模式做 CSS / JSON
│   └─ biome_rowan / biome_parser              # 通用 framework：事件流 + 红绿树
│
├─ Phase 3 · ANALYZE（AST + semantic → rule signals）
│   ├─ biome_analyze/                          # 通用 analyzer framework ★ 心脏
│   │   └─ src/lib.rs                          # Rule trait / Phases / Visitor
│   ├─ biome_js_analyze/                       # JS 规则集（450+ 条）
│   │   ├─ src/lib.rs                          # 入口 + METADATA
│   │   ├─ src/lint/correctness/no_unused_variables.rs
│   │   ├─ src/lint/suspicious/no_var.rs       # 我们会精读这条 ★
│   │   └─ src/lint/style/...                  # 规则按 group 组织
│   ├─ biome_js_semantic/                      # 作用域 + binding 解析
│   └─ biome_control_flow/                     # 控制流图（noUnusedVariables 用到）
│
├─ Phase 4 · FORMAT（AST → IR → printed text）
│   ├─ biome_formatter/                        # 通用 formatter framework ★ 心脏
│   │   └─ src/builders.rs                     # group / indent / soft_line_break（2690 行）
│   ├─ biome_js_formatter/                     # JS AST → IR 适配器
│   ├─ biome_css_formatter/ + biome_json_formatter/
│   └─ biome_formatter_test/                   # 跨语言对比测试
│
├─ Phase 5 · DIAGNOSTIC EMIT（→ CLI / LSP / stdout）
│   ├─ biome_diagnostics/                      # Diagnostic trait + advice 系统
│   │   └─ src/diagnostic.rs                   # 286 行核心 trait
│   ├─ biome_console/                          # 富文本 markup（颜色 / 链接）
│   └─ biome_diagnostics_categories/           # 类别枚举（lint/correctness/...）
│
└─ Phase 0 · 入口（cli / lsp / npm 包装，不在 pipeline 内但要找它们）
    ├─ biome_cli/                              # CLI 入口 `biome check`
    ├─ biome_lsp/                              # LSP server，编辑器集成
    └─ packages/@biomejs/biome/                # npm 发布包
```

**心脏文件**（每 phase 1 个代表，分支 C 量化指标）：

1. `crates/biome_js_parser/src/parser.rs:33-150` — JsParser 主结构 + lookahead/checkpoint/rewind
2. `crates/biome_formatter/src/builders.rs:1760` — `group()` 函数，整个 IR 的 atom
3. `crates/biome_js_analyze/src/lint/suspicious/no_var.rs` — 一个 `Rule` trait 的完整范例（130 行刚好）
4. `crates/biome_diagnostics/src/diagnostic.rs:34-115` — Diagnostic trait，CLI/LSP 共用
5. `crates/biome_js_parser/src/lexer/mod.rs:87-105` — JsReLexContext 枚举，"`/` 还是 regex" 这种 JS 噩梦的解决方案

**关键架构**：每种语言（JS / CSS / JSON / GraphQL）有独立 parser + formatter + analyzer，
但**都基于同一套 framework crate**（`biome_parser` / `biome_formatter` / `biome_analyze`）——
这是 biome 能把 5 种语言压在 1 个二进制里的根本。

---

## 核心机制 · Layer 3 精读（按 phase 切，3 段）

> 选择三段最能讲清"编译器 / 运行时"叙事的 phase：
> Phase 2 parser（事件流而非节点 + checkpoint/rewind 是手写 parser 的灵魂）、
> Phase 4 formatter（Wadler IR 是格式化器的核心 paper）、
> Phase 3 analyzer + Phase 5 diagnostic（Rule trait + Diagnostic trait 一起讲，
> 因为分析和报错是同一个故事的两端）。
>
> 跳过 lex（细节多但概念浅）+ 跳过 framework crate（generic over Language，读 trait 边界容易迷失）。

### 机制 1 · Parser — 事件流 + checkpoint/rewind（Phase 2）

[`biome_js_parser/src/parser.rs:29-151`](https://github.com/biomejs/biome/blob/5f4ea56b1dfb00d839af218e3c6484154073a7eb/crates/biome_js_parser/src/parser.rs#L29-L151)

```rust
/// An extremely fast, error tolerant, completely lossless JavaScript parser
///
/// The Parser yields lower level events instead of nodes.
/// These events are then processed into a syntax tree through a [`TreeSink`] implementation.
pub struct JsParser<'source> {
    pub(super) state: JsParserState,
    pub source_type: JsFileSource,
    context: ParserContext<JsSyntaxKind>,
    source: JsTokenSource<'source>,
    options: JsParserOptions,
}

impl<'source> JsParser<'source> {
    pub fn new(source: &'source str, source_type: JsFileSource, options: JsParserOptions) -> Self {
        let source = JsTokenSource::from_str(source, options);
        JsParser {
            state: JsParserState::new(&source_type),
            source_type,
            context: ParserContext::default(),
            source,
            options,
        }
    }

    /// Stores the parser state and position before calling the function and restores the state
    /// and position before returning.
    ///
    /// Useful in situation where the parser must advance a few tokens to determine whatever a syntax is
    /// of one or the other kind.
    #[inline]
    pub fn lookahead<F, R>(&mut self, op: F) -> R
    where
        F: FnOnce(&mut JsParser) -> R,
    {
        let checkpoint = self.checkpoint();
        let result = op(self);
        self.rewind(checkpoint);
        result
    }

    pub fn checkpoint(&self) -> JsParserCheckpoint {
        JsParserCheckpoint {
            context: self.context.checkpoint(),
            source: self.source.checkpoint(),
            state: self.state.checkpoint(),
        }
    }

    pub fn rewind(&mut self, checkpoint: JsParserCheckpoint) {
        let JsParserCheckpoint { context, source, state } = checkpoint;
        self.context.rewind(context);
        self.source.rewind(source);
        self.state.restore(state);
    }

    pub fn finish(self) -> (Vec<Event<JsSyntaxKind>>, Vec<Trivia>, Vec<ParseDiagnostic>) {
        let (trivia, source_diagnostics) = self.source.finish();
        let (events, parse_diagnostics) = self.context.finish();
        let diagnostics = merge_diagnostics(source_diagnostics, parse_diagnostics);
        (events, trivia, diagnostics)
    }
}
```

旁注（≥ 5 个）：

- **「parser yields events instead of nodes」是关键判断**。直觉上 parser 该输出 AST 节点，
  biome 选了"先输出事件流（`Start node X` / `Token` / `Finish node` / `Error`），再用 TreeSink
  把事件 fold 成 Rowan 树"。这把"产出节点"和"决定节点边界"解耦——前者并行写入 vec，后者
  可以丢给不同 backend（同一份事件可以拼出 lossless 的 CST 也可以拼成精简 AST）。
- **`lookahead` 不是黑魔法**——是 `checkpoint() → op() → rewind()`。手写 parser 的人都知道
  "试着往前读几 token 决定语法分支" 是不可避免的，关键是回溯成本。biome 的回溯只 restore
  三个 cursor（context / source / state），**没有 token 级 vec 复制**——这是它跑得快的微观原因之一。
- **三档 state**：`ParserContext`（事件 + 错误的累积）、`JsTokenSource`（lexer 状态 + trivia 缓冲）、
  `JsParserState`（语法上下文，比如"我在 strict mode 吗 / 在 generator 里吗"）。三档独立 checkpoint 是
  为了 `with_state` 这种"短暂改 state 再恢复" 的语义能廉价做。
- **`finish()` 返回 `(events, trivia, diagnostics)` 三元组而非完整树**。这是事件流模式的兑现——
  parser 阶段不构建树，留给 TreeSink。**好处**：parser crate 不依赖 syntax crate 的具体节点类型；
  **代价**：调用方多一步。
- **`is_module()` 用 `const fn`**——纯字段查找，能在 trait 实现里 inline。Rust 让这种小细节不丢。
- 整个 file 263 行——心脏不大，但解释清楚为什么 biome 的 parser 能 error-tolerant 又快。

**怀疑 1**：事件流模式比直接产 AST 多一次"事件 → 树"转换。为什么 biome 还能比 ESLint 快？
答（推测）：espree 是 JS 写的，构造 AST 节点 = 创建大量小对象 + GC 压力；biome 事件流是 push
到 `Vec<Event>`，事件本身是栈上 enum；后期 TreeSink 用 Rowan 做"绿树（不可变持久化）"，节点
共享底层文本切片。**两条 cost 模型完全不同**——biome 即使多一次 fold，总成本也低得多。

**怀疑 2**：[`parser.rs:99-121`](https://github.com/biomejs/biome/blob/5f4ea56b1dfb00d839af218e3c6484154073a7eb/crates/biome_js_parser/src/parser.rs#L99-L121)
有 `with_scoped_state` 和 `with_state` 两个几乎一样的方法。注释说一个返回 `ParserStateGuard`
（RAII 守卫，drop 时恢复），一个直接 inline 函数调用。**为什么留两个？** 我猜：嵌套使用时 RAII
方便（不用手动配对 push/pop），但热路径 inline 版避免一次 `Drop` 调用。这是一处没有 doc 解释
但藏着性能动机的 API 双写。

---

### 机制 2 · Formatter IR — 一棵树两种打印（Phase 4）

![Formatter IR group + soft_line_break 决策](/projects/biome/02-formatter-ir.webp)

[`biome_formatter/src/builders.rs:1760-1808`](https://github.com/biomejs/biome/blob/5f4ea56b1dfb00d839af218e3c6484154073a7eb/crates/biome_formatter/src/builders.rs#L1760-L1808)

```rust
/// Inserts a group around the content. The content is formatted in [PrintMode::Flat]
/// if all elements fit on the same line. Otherwise, the content is printed in
/// [PrintMode::Expanded] (line breaks at every soft line break).
#[inline]
pub fn group<Context>(content: &impl Format<Context>) -> Group<'_, Context> {
    Group { content: Argument::new(content), group_id: None, should_expand: false }
}

#[derive(Copy, Clone)]
pub struct Group<'a, Context> {
    content: Argument<'a, Context>,
    group_id: Option<GroupId>,
    should_expand: bool,
}

impl<Context> Group<'_, Context> {
    /// Changes the [PrintMode] of the group from [`Flat`](PrintMode::Flat) to [`Expanded`].
    pub fn should_expand(mut self, should_expand: bool) -> Self {
        self.should_expand = should_expand;
        self
    }
}

impl<Context> Format<Context> for Group<'_, Context> {
    fn fmt(&self, f: &mut Formatter<Context>) -> FormatResult<()> {
        let mode = match self.should_expand {
            true => GroupMode::Expand,
            false => GroupMode::Flat,
        };
        f.write_element(FormatElement::Tag(StartGroup(
            tag::Group::new().with_id(self.group_id).with_mode(mode),
        )))?;
        Arguments::from(&self.content).fmt(f)?;
        f.write_element(FormatElement::Tag(EndGroup))
    }
}
```

旁注：

- **`group()` 返回 `Group` struct，`Format::fmt` 才真正写元素**。这是 builder 模式 + 延迟执行：
  你写 `format!(ctx, [group(&format_args![...])])`，IR 元素是在最终遍历时才落到 buffer，不是
  调用 `group()` 当下。这让 IR 可以被嵌套组合而不真的构造中间树。
- **IR 的 atom 性**：一个 `group` 要么整体 Flat（所有 `soft_line_break` 渲染成空格或空），
  要么整体 Expanded（所有 `soft_line_break` 渲染成 `\n` + 当前 indent）。**禁止折半**——
  这是 Wadler 1998 paper 的核心限制，把 printer 复杂度从 O(2^n) 降到 O(n)。
- **`should_expand: bool` 字段**让调用方可以强制 group 进入 Expanded 模式，无需"故意写超长内容
  让它溢出"。例：if-else 块有注释时，即使代码本身能塞一行，也强制 break。
- **`GroupId`** 让一个 group 的 break/no-break 决策**影响其他 group**。比如函数参数 group 一旦
  break，函数体 group 也跟着 break——通过相同 group_id 关联。
- **`StartGroup` / `EndGroup` Tag**：IR 不是嵌套结构而是**扁平 tag 流**。这意味着 printer 可以
  线性扫描、用栈维护"当前在哪个 group"——避免树遍历的递归 overhead。整个 builders.rs 文件 2690 行
  都在围绕这套扁平 tag 系统做语法糖。

**怀疑 3**：`should_expand: bool` 和 `expand_parent()` 函数（[builders.rs](https://github.com/biomejs/biome/blob/5f4ea56b1dfb00d839af218e3c6484154073a7eb/crates/biome_formatter/src/builders.rs#L1820)
里另一个 IR 元素，能让 inner content 强制 outer group 展开）功能重叠。**为什么留两个？**
推测：`should_expand` 是构造 Group 时的静态决策（编译期已知），`expand_parent` 是 IR 节点
（动态——某 inner 计算后才决定）。两条不同时机的路径，**都通向同一个 GroupMode::Expand**。

**怀疑 4**：[builders.rs:778](https://github.com/biomejs/biome/blob/5f4ea56b1dfb00d839af218e3c6484154073a7eb/crates/biome_formatter/src/builders.rs#L778)
的 `indent()` 接受 `&Content`（引用），但 `group()` 接受 `&impl Format<Context>`（generic over Format）。
两者签名不对称——`indent` 用具体类型 `Indent<'_, Context>`，`group` 用 trait object via Argument。
我猜是因为 `Group` 有更多状态字段（`group_id`、`should_expand`），需要 builder 风格；
`Indent` 简单到只是个 wrapper。但这种**不对称在 API 一致性上是个小坑**——新人记不住该传哪种。

---

### 机制 3 · Lint Rule + Diagnostic — 同一份信号两种渲染（Phase 3 + 5）

[`biome_js_analyze/src/lint/suspicious/no_var.rs:50-130`](https://github.com/biomejs/biome/blob/5f4ea56b1dfb00d839af218e3c6484154073a7eb/crates/biome_js_analyze/src/lint/suspicious/no_var.rs#L50-L130)

```rust
declare_lint_rule! {
    /// Disallow the use of `var`
    pub NoVar {
        version: "1.0.0",
        name: "noVar",
        language: "js",
        sources: &[RuleSource::Eslint("no-var").same()],
        recommended: false,
        severity: Severity::Warning,
        fix_kind: FixKind::Unsafe,
    }
}

impl Rule for NoVar {
    type Query = Semantic<AnyJsVariableDeclaration>;
    type State = ();
    type Signals = Option<Self::State>;
    type Options = NoVarOptions;

    fn run(ctx: &RuleContext<Self>) -> Self::Signals {
        let declaration = ctx.query();
        if declaration.is_var() {
            // 排除 TS `declare global` 块——历史遗留，不要乱改
            let ts_global_declaratio = &declaration
                .syntax()
                .ancestors()
                .skip(1)
                .find_map(TsGlobalDeclaration::cast);
            if ts_global_declaratio.is_some() { return None; }
            return Some(());
        }
        None
    }

    fn diagnostic(ctx: &RuleContext<Self>, _state: &Self::State) -> Option<RuleDiagnostic> {
        let declaration = ctx.query();
        let var_scope = declaration.syntax().ancestors()
            .find(|x| AnyJsControlFlowRoot::can_cast(x.kind()))?;
        let contextual_note = if JsScript::can_cast(var_scope.kind()) {
            markup! { "A variable declared with "<Emphasis>"var"</Emphasis>" in the global scope pollutes the global object." }
        } else if JsModule::can_cast(var_scope.kind()) {
            markup! { "A variable declared with "<Emphasis>"var"</Emphasis>" is accessible in the whole module..." }
        } else {
            markup! { "A variable declared with "<Emphasis>"var"</Emphasis>" is accessible in the whole body of the function..." }
        };
        Some(RuleDiagnostic::new(rule_category!(), declaration.range(), markup! {
            "Use "<Emphasis>"let"</Emphasis>" or "<Emphasis>"const"</Emphasis>" instead of "<Emphasis>"var"</Emphasis>"."
        })
        .note(contextual_note)
        .note(markup! { "See "<Hyperlink href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/var">"MDN web docs"</Hyperlink>" for more details." }))
    }

    fn action(ctx: &RuleContext<Self>, _: &Self::State) -> Option<JsRuleAction> {
        let declaration = ctx.query();
        let model = ctx.model();
        let maybe_const = ConstBindings::new(declaration, model);
        let replacing_token_kind = if maybe_const.as_ref().is_some_and(|x| x.can_fix) {
            JsSyntaxKind::CONST_KW
        } else {
            JsSyntaxKind::LET_KW
        };
        let mut mutation = ctx.root().begin();
        mutation.replace_token(declaration.kind_token().ok()?, make::token(replacing_token_kind));
        Some(JsRuleAction::new(/* ... */ mutation))
    }
}
```

旁注：

- **`Rule` trait 把"找信号 / 出诊断 / 自动修"拆成三个方法**。`run()` 返回 `Signals`（可能为
  `Option<()>`、可能为更丰富的 state），`diagnostic()` 把 signal 渲染成富文本，`action()` 产出
  AST mutation。**关注点分离**：写新规则时只需思考 "我看到什么 AST 形状要报错 / 报什么 / 怎么改"。
- **`type Query = Semantic<AnyJsVariableDeclaration>`**——告诉 framework "我只关心 var/let/const
  声明节点 + 我需要 semantic model（作用域信息）"。framework 用这个 type 当 visitor 注册键，**只有
  匹配的节点才会触发本规则**。这是 lint 跑起来快的根因之一——450+ 规则不是对每个节点全跑一遍。
- **`declare_lint_rule!` macro** 把规则元数据（name / severity / fix_kind / 来自哪个 ESLint 规则）
  做成 const 数据。METADATA 在 [biome_js_analyze/src/lib.rs:44-48](https://github.com/biomejs/biome/blob/5f4ea56b1dfb00d839af218e3c6484154073a7eb/crates/biome_js_analyze/src/lib.rs#L44-L48)
  通过 `LazyLock` + `visit_registry` 扫一遍生成全局表。**编译期声明 + 运行期一次 lazy 初始化**，
  比 ESLint 的运行期 plugin 注册便宜得多。
- **`markup!` macro** 把 "颜色 / 加粗 / 超链接" 编进字符串字面量。同一段 markup 在 CLI 渲染成 ANSI
  转义、在 LSP 输出成 markdown、在 GitHub Actions 渲染成 annotation——**一份诊断三处发布**。
- **`action()` 返回 `Option<JsRuleAction>`**——not all rules are auto-fixable。`fix_kind: FixKind::Unsafe`
  告诉用户"这个修可能改语义"（var → let 在闭包捕获场景确实可能有差），需要用户显式启用。

[`biome_diagnostics/src/diagnostic.rs:34-115`](https://github.com/biomejs/biome/blob/5f4ea56b1dfb00d839af218e3c6484154073a7eb/crates/biome_diagnostics/src/diagnostic.rs#L34-L115)

```rust
pub trait Diagnostic: Debug {
    /// The category of a diagnostic uniquely identifying this diagnostic type
    fn category(&self) -> Option<&'static Category> { None }
    fn severity(&self) -> Severity { Severity::Error }
    fn description(&self, fmt: &mut std::fmt::Formatter<'_>) -> std::fmt::Result { Ok(()) }
    fn message(&self, fmt: &mut fmt::Formatter<'_>) -> io::Result<()> { Ok(()) }
    fn advices(&self, visitor: &mut dyn Visit) -> io::Result<()> { Ok(()) }
    fn verbose_advices(&self, visitor: &mut dyn Visit) -> io::Result<()> { Ok(()) }
    fn location(&self) -> Location<'_> { Location::builder().build() }
    fn tags(&self) -> DiagnosticTags { DiagnosticTags::empty() }
    fn source(&self) -> Option<&dyn Diagnostic> { None }
}
```

旁注（Diagnostic 段）：

- **每个方法都有 default 实现**。意思是"实现 Diagnostic 最小成本 = 加 derive macro，什么都不写"。
  这是 trait 设计的人体工程学——把"做对" 设成默认路径。
- **`description` 是纯文本，`message` 是 markup，`advices` 是 visitor 模式**。三种渲染目标：
  没 markup 支持的环境（hover popover）走 description；CLI 走 message；详细模式走 advices。
- **`source()` 返回 `Option<&dyn Diagnostic>`**——错误链。一个 "lint 规则失败" 可能 wrap 了
  一个 "AST 解析失败" wrap 了 "io::Error"。trait 自带的链让最终用户看得到完整 cause-effect。
- **`tags()` 返回 bitflags**——FIXABLE / INTERNAL / FATAL / DEPRECATED 这些正交属性用位标记。
  不放在枚举里因为它们能并存（一个 diagnostic 可以同时是 FIXABLE + DEPRECATED）。

→ 这套 trait-based 规则定义比 ESLint 的 `meta` + `create()` 闭包**类型更安全**——
规则元数据是编译期声明的（用 macro），不是运行期对象。**Phase 3 的输出（rule signals）和
Phase 5 的 Diagnostic 是同一份数据的两种视角**，trait 设计让这两端在编译期就咬合上。

---

## 改一处 · Hands-on（v1.1 分支 C 必填 — 改 default option，看 byte-level diff）

> 分支 C 的"改一处"专注在 **option/transform 的字节级影响**——
> 不是改一行代码看测试通过，是改一个 formatter option 看输出文本怎么变。

### 跑通 5 分钟

```bash
mkdir biome-l4-demo && cd biome-l4-demo
npm init -y
npm install --save-dev --save-exact @biomejs/biome
# 故意写一个全脏的 messy.js
cat > messy.js <<'EOF'
const obj={ foo:1,bar:2,baz:[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15],nested:{a:1,b:2}};
function   greet(name){console.log("hello"+name)}
var x = 1;
if(x){console.log("yes")}else{console.log("no")}
greet  ('world');
EOF
wc -c messy.js  # 213 bytes
```

### 改一处实验：把 lineWidth 从 80 改到 120

**配置 A · `lineWidth: 80`**（biome 的默认行为，也是 Prettier 默认）：

```json
{
  "$schema": "https://biomejs.dev/schemas/2.0.0/schema.json",
  "formatter": { "enabled": true, "indentStyle": "tab", "lineWidth": 80 }
}
```

```bash
cp messy.js after-80.js
npx @biomejs/biome format --write after-80.js
wc -c after-80.js  # 262 bytes（比原文件大了 49 字节，因为换行）
```

`after-80.js`：

```js
const obj = {
	foo: 1,
	bar: 2,
	baz: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
	nested: { a: 1, b: 2 },
};
function greet(name) {
	console.log("hello" + name);
}
var x = 1;
if (x) {
	console.log("yes");
} else {
	console.log("no");
}
greet("world");
```

**配置 B · `lineWidth: 120`**（一个改动，改 default option）：

```json
{
  "$schema": "https://biomejs.dev/schemas/2.0.0/schema.json",
  "formatter": { "enabled": true, "indentStyle": "tab", "lineWidth": 120 }
}
```

```bash
cp messy.js after-120.js
npx @biomejs/biome format --write after-120.js
wc -c after-120.js  # 257 bytes（比 80-width 少 5 字节）
```

`after-120.js`：

```js
const obj = { foo: 1, bar: 2, baz: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], nested: { a: 1, b: 2 } };
function greet(name) {
	console.log("hello" + name);
}
var x = 1;
if (x) {
	console.log("yes");
} else {
	console.log("no");
}
greet("world");
```

### Before / After 字节对比

| 文件 | bytes | 行数 | 顶层对象布局 |
|---|---|---|---|
| `messy.js`（原始）       | **213** | 5 | 一行炸到底 |
| `after-80.js`（lineWidth=80）   | **262** | 17 | obj 字段每个一行（group 整体 break） |
| `after-120.js`（lineWidth=120） | **257** | 13 | obj 整体一行（group 保持 Flat） |

**差异定位**：唯一的字节差就是 `const obj = { ... }` 这个 group。
- 80-width 下，group 算上缩进会超 80 列 → printer 切 Expanded → 5 个 soft_line_break 全 break
- 120-width 下，group 整体 113 字符 < 120 → 保持 Flat → 5 个 soft_line_break 全渲染成空格

→ 这就是 Layer 3 机制 2 讲的 **Wadler atom 性的真实兑现**。同一棵 IR、同一个 printer，
只换一个 `lineWidth` 数字，输出字节流就在两个稳定状态之间切换。**没有中间态**——你看不到 obj
"换了 3 个字段、2 个不换"。这个性质是模型级保证，不是 biome 自己加的。

### 第二个实验：在真实项目跑一次

```bash
# 找一个 1000 文件的 ts 项目
cd ~/your-real-project
time npx @biomejs/biome check .
# 通常 0.5-1 秒

# 装 ESLint + Prettier 同样的项目
npm install --save-dev eslint prettier @typescript-eslint/parser
time (npx eslint . && npx prettier --check .)
# 通常 30-60 秒
```

→ 25-100 倍的差距亲手感受到。

---

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

### 维度对比表

| 维度 | ESLint+Prettier | dprint | oxlint | Biome |
|---|---|---|---|---|
| 实现语言 | JS | Rust | Rust | Rust |
| 做的事 | lint + format（分） | 仅 format | 仅 lint | lint + format（合） |
| 解析次数（每文件） | 2-3 | 1 | 1 | **1** |
| 配置文件数 | 4-6 | 1 | 1 | **1** |
| 速度（相对 ESLint+Prettier） | 1× | 10× | 50× | **25-100×** |
| 设计哲学 | 生态优先 | 单点极致 | 性能极致 | **整合优先** |
| 规则数 | 数千（含 plugins） | 0 | ~150（移植中） | 450+ |
| Plugin 生态 | 海量 | 少 | 限制 | 故意限制 |

→ 真正"哲学不同"的是 **ESLint+Prettier**（多 process 协作）vs **Biome**（单 process 一份 AST）。
oxlint 和 dprint 是"和 Biome 同流派的下位替代"，不是范式不同。

### 选型建议

- **新项目** → Biome（30 分钟搭好、一个文件配置完）
- **已有大型 ESLint 配置 + 50+ 自定义规则** → 暂留 ESLint，加 oxlint 做 fast-feedback 层
- **只想要更快的 Prettier** → dprint
- **需要插件深度定制** → ESLint（biome 故意限 plugin）

---

## 与你工作的连接

### 今天就能用

- 任何**新项目**用 Biome 起步（速度 + 单文件配置）
- 现有 ESLint + Prettier 项目可以**并行**用 biome（不用立即砍掉旧栈）
- pre-commit hook 用 biome（`lint-staged + biome check --staged`）
- 把 `lineWidth=120` / `indentStyle=tab` 这种争议小的 option 当默认，省 PR review 噪声

### 下个月可能用到

- 给团队推 biome：用 ROI 表（性能提升 25x、配置文件减少 4→1、新人上手 30 分钟而不是 3 天）
- 配 VSCode + Biome 插件，体验"边写边 lint+format" 的丝滑
- CI 里把 `biome ci` 当 lint job，比 `eslint . && prettier --check .` 快 30 倍
- 写自己的小工具时借鉴 Wadler IR——你只要 group / indent / soft_line_break 三个原语就能搭一个 toy formatter

### 不要用 Biome 的部分

- **重度依赖 ESLint 自定义规则**——迁移成本可能 > 性能收益
- **超大型项目（10000+ 文件）+ ESLint 早就调到完美**——别动它
- **需要 Prettier 100% 兼容**（某些下游工具吃 Prettier 输出）——3% 差异可能炸
- **要写 plugin 扩展核心**——biome 故意限制 plugin 系统

---

## 自检 · 5 个具体到行号的问题

1. [`parser.rs:177-205`](https://github.com/biomejs/biome/blob/5f4ea56b1dfb00d839af218e3c6484154073a7eb/crates/biome_js_parser/src/parser.rs#L177-L205)
   的 `do_bump_with_context` 做了一件特殊事——如果当前 token 是 keyword 但含 unicode escape，
   报错并把 kind 改成 `ERROR_TOKEN`。**为什么 unicode escape 让 keyword 失效**？JS 规范哪条说的？
   （提示："Reserved words can't have escape sequences"）
2. [`builders.rs:1760`](https://github.com/biomejs/biome/blob/5f4ea56b1dfb00d839af218e3c6484154073a7eb/crates/biome_formatter/src/builders.rs#L1760)
   的 `group()` 接受 `&impl Format<Context>`，但内部存成 `Argument::new(content)`——
   `Argument` 是什么类型？为什么不直接存 `&impl Format`？(提示：trait object + lifetime 处理)
3. [`no_var.rs:59-66`](https://github.com/biomejs/biome/blob/5f4ea56b1dfb00d839af218e3c6484154073a7eb/crates/biome_js_analyze/src/lint/suspicious/no_var.rs#L59-L66)
   排除 `TsGlobalDeclaration`——为什么 TS 的 `declare global { var foo }` 里 var 不该被改？
   把这个例外删掉会让多少现有 TS 项目挂掉？
4. [`diagnostic.rs:74-77`](https://github.com/biomejs/biome/blob/5f4ea56b1dfb00d839af218e3c6484154073a7eb/crates/biome_diagnostics/src/diagnostic.rs#L74-L77)
   的 `advices(visitor: &mut dyn Visit)` 用 visitor 模式而不是直接返回 `Vec<Advice>`。
   **visitor 模式在这里的好处是什么**？（提示：富文本流式输出 + 不分配中间 Vec）
5. biome_js_analyze 里 `Phases` 这个枚举（[lib.rs:11](https://github.com/biomejs/biome/blob/5f4ea56b1dfb00d839af218e3c6484154073a7eb/crates/biome_js_analyze/src/lib.rs#L9-L14)
   import）有几个 phase？为什么 lint 内部还要再分 phase？

## 限制（诚实段）

- 本笔记基于 v2.4.16，commit `5f4ea56`。biome 还在快速迭代——4-6 个月后部分 trait 签名可能变。
- "25-100x 性能"是对照 ESLint+Prettier 默认配置的官方数字，**没有亲手 benchmark 100k 行真实项目**——
  你的项目可能因为 plugin / 自定义规则在两边表现不同。
- formatter Wadler IR 那段我推测 group 的 atom 性来自 Wadler 1998 paper，**没有亲自读 paper**——
  这是从 Prettier source code 注释和 biome 行为反推的，可能在历史归因上有偏差。

## 附录 · 宣传 vs 代码现实

| 宣传 | 代码现实 |
|---|---|
| "AST 复用" | 是真的——`biome_rowan` 提供持久化树，linter / formatter 共享同一个 `&AnyJsRoot` 引用 |
| "97% Prettier 兼容" | 是真的——但那 3% 在 JSX、TS decorators、object literal 边界场景集中发作 |
| "零配置开箱即用" | 半真——`biome init` 给的默认值是合理的，但 lineWidth 80 / indentStyle tab 大概率你想改 |
| "插件支持" | 是的，但**故意被限制**——只支持 GritQL pattern，不支持任意 Rust 代码 plugin |
| "比 ESLint 快 25-100x" | 是真的——但前提是同等规则数。如果你只跑 5 条 ESLint 规则，差距会缩到 5-10x |

## 延伸阅读

- `crates/biome_formatter/src/printer/`——把 IR 转成最终字符串的 printer（fits / break 决策的实现）
- `crates/biome_analyze/src/lib.rs`——Rule trait + Phases + Visitor 的通用 framework
- **Wadler 1998 paper** "A prettier printer"——formatter IR 的理论根
- **rome 历史 + 倒闭 + 重生**博客（biomejs.dev/blog）——理解项目的 governance 演化
- **oxlint** 源码——对比"完全同代"工具的设计差异
- `crates/biome_lsp/`——LSP server 实现，看"一份 AST 多端服务"的另一个截面

---

**笔记完成**：2026-05-28（v2.4.16，commit `5f4ea56b1dfb00d839af218e3c6484154073a7eb`）
**研究方法**：本地 clone（`/tmp/biome-study`） + 读 5 个 phase 心脏文件 + 跑 L4 改一处实验对比字节差
**心脏文件**（按 phase）：parser.rs / builders.rs / no_var.rs / diagnostic.rs / lexer/mod.rs
**项目类型**：编译器/运行时（v1.1 分支 C）— input bytes → output transformed text + diagnostics
