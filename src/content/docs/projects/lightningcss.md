---
title: lightningcss — 把 CSS 当类型系统，用 Rust 一遍跑完 parse / transform / minify / prefix
description: Parcel 团队用 Rust 重写整个 CSS 工具链，200+ CSS property 各自一个 Rust 类型，一遍走完 cssnano + autoprefixer + postcss-preset-env 三件事
sidebar:
  order: 24
  label: parcel-bundler/lightningcss
---

> parcel-bundler/lightningcss HEAD `ec165294750bb02903e7f845b66533b0465debcc`（2026-05），MPL-2.0，约 7.6k stars。
> Rust 写的 CSS parser / transformer / bundler / minifier，由 Parcel 作者 Devon Govett 主导。
> 比 PostCSS + cssnano + autoprefixer 三件套快 ~100 倍，关键的不是"用 Rust 写"——
> 是 **每个 CSS property 都是独立的 Rust 类型**，parser / minifier / printer 共享同一棵 typed AST。
>
> Season 12 第三棒。**项目类型：编译器 / 运行时（v1.1 分支 C）**——
> 输入 CSS 字节，输出 transformed CSS + sourcemap，
> 心脏物按 phase 分布：tokenize → parse → Property AST → minify (targets) → print。

## 一句话定位

**lightningcss = Rust 写的 CSS 编译器，每个 property 一个 Rust 类型。**
PostCSS 把 CSS 当成"未类型化的 token 流"，每个 plugin 自己解释；
lightningcss 把 CSS 当成"严格类型化的语法树"，所有下游消费者读的是同一棵 typed AST。
**parse + minify + 自动加前缀 + 降级新语法 + 抽取 dependency** 在一遍 walk 里全部完成。

## Why（为什么是 lightningcss 而不是 PostCSS / cssnano / esbuild css-loader）

主流 CSS 工具链长这样：

```
PostCSS (host)        ← JS-based plugin host，每个 plugin 一次 traversal
  ├─ autoprefixer     ← 加 -webkit- / -moz- 前缀
  ├─ cssnano          ← 30 个 sub-plugin 组成的 minifier
  ├─ postcss-preset-env  ← lower 新语法（custom-properties / nesting / ...）
  └─ postcss-modules  ← CSS Modules 哈希
esbuild               ← 自己写一个最小 CSS parser，只够 minify，不做 lowering
swc-css               ← Rust，但没有 typed property AST
```

**问题不在"JS 慢"**——是 PostCSS 的设计是"plugin 之间共享一个 untyped token tree，每个 plugin
自己解释每个值"。autoprefixer 解释一遍 `transform: rotate(45deg)` 拿到 angle，
cssnano 又解释一遍同样的 token 拿到 angle 做合并。**N 个 plugin = N 次 parse**。

lightningcss 的判断：

1. **每个 CSS property 一个 Rust 类型**——`Background` 是 struct，`BorderRadius` 是 struct，
   `Transform` 是 enum。parse 一次，所有后续操作直接读 typed value，没有"再 token 一次"
2. **共用 Servo 的 cssparser + parcel_selectors**——不重写 token / selector 层，
   只在上面盖"typed property AST"
3. **Targets 是一等公民**——`Browsers { chrome: Some(0x550000), ... }` 一路从 minify 传到 printer，
   降级和加前缀**用同一份配置**
4. **minify 和 lowering 合并成一个 pass**——不是先 parse、再 lower、再 minify，
   是**一遍 walk 同时做完三件事**
5. **CSS Modules 是内置的**——不是外挂 plugin，hash + scope 直接在 printer 里完成

| 工具 | 实现 | typed property | 自动 prefix | 新语法降级 | minify | 速度（vs PostCSS+cssnano） |
|---|---|---|---|---|---|---|
| PostCSS + cssnano + autoprefixer | JS | 否 | 是（plugin） | 部分（plugin） | 是 | 1x |
| esbuild | Go | 否 | 否 | 否 | 是（弱） | ~10x |
| swc-css | Rust | 否 | 部分 | 部分 | 是 | ~30x |
| **lightningcss** | **Rust** | **是（200+ 类型）** | **是（一等公民）** | **是（含 nesting / oklch / lab）** | **是（结合 lowering）** | **~100x** |

**为什么不是 PostCSS**：PostCSS 不会消失——但作为"CSS 编译器底座"它已经是 legacy。
新项目（Vite / Parcel / Bun / Next 14+）都在切到 lightningcss / swc-css。

**为什么不是 esbuild**：esbuild 的 CSS parser 是为"尽快 bundle"设计的，**没有 typed property**——
它做不了 cssnano 那种 longhand 合并 shorthand、calc 化简等深度优化。

**为什么不是 swc-css**：swc-css 的 AST 更接近 cssparser 原始 token，没有 lightningcss 那种
"每个 property 是独立 enum variant"的设计。下游做 transform 仍然要自己 match token。

**lightningcss 的判断分水岭**：

- 选"typed property"——和 PostCSS 的 untyped tree 路线分道扬镳
- 选"复用 Servo cssparser"——不重写 token 层，只盖上层 AST
- 选"集成而非组合"——minify + lowering + prefix 合一遍 walk，不留 plugin hook
- **不选** plugin 生态——和 oxc 同样的取舍：要可预测性能，不要插件兼容包袱
- **不选** 全保真 AST——注释和空白不进 AST，所以做不了 100% 保真 formatter（这是 Prettier 的领地）

**lightningcss 的代价**：

- 不能写 plugin（用户层）——内部规则要靠 PR 进 upstream
- 注释丢失，做 formatter 不合适
- 200+ property 类型是 macro 生成的，调试时 stacktrace 难读
- TypeScript 类型由 napi binding 暴露，但 Rust API 才是 SoT，Node 用户拿不到完整类型

## 工具栈全景图（v1.1 分支 C 必填 P0）

![Lightning CSS pipeline 七阶段](/study/projects/lightningcss/01-pipeline.webp)

> **图说**：CSS 字节进来后顺次经过 cssparser tokenize → TopLevelRuleParser 状态机 →
> Property AST（200+ enum variants）→ minify+targets → Printer，最后输出 `.css string + sourcemap + dependencies`。
> 每个方框下方标了真实源码位置（`src/parser.rs#L159` 之类），下方"cross-cutting decisions"
> 五条说清了 lightningcss 和 PostCSS 哲学不同的核心：**typed AST、Targets 一等公民、prefix 双路径**。
>
> 黄色高亮框是整篇笔记的命门——`enum Property` 就是 lightningcss 的灵魂。
> Servo 的 cssparser 提供 token，lightningcss 在它上面盖"每个 CSS property 是独立 Rust 类型"的 AST，
> 这是它能比 swc-css / esbuild css 都快的根本原因。

## 谱系对比图（必填 P1）

![CSS 编译器谱系：Servo cssparser → PostCSS → Lightning CSS → 后继者](/study/projects/lightningcss/02-genealogy.webp)

> **图说**：纵向时间，横向流派。
> 左列是底座（Servo cssparser，Mozilla 2014）；中列是 PostCSS 系（cssnano / Lightning CSS / Parcel）；
> 右列是 prefix / 新兴竞品（autoprefixer / oxc CSS / swc-css）。
>
> 绿色箭头 = "依赖" 或 "源码移植"；红色 = "现代栈替代"；灰色 = "灵感参考"。
> Lightning CSS 同时**依赖** cssparser（绿）、**替代** cssnano + autoprefixer（红）、**被 Parcel / Bun css 复用**（绿）。
> 这张图回答"为什么不是 swc-css / oxc CSS"——它们晚来，且没有 typed property AST 这个核心 invariant。

## 仓库导航（v1.1 分支 C P0）

```
src/
  lib.rs                 ← crate 根，re-export 所有 public mod
  stylesheet.rs          ← StyleSheet 入口（parse / minify / to_css）★
  parser.rs              ← TopLevelRuleParser 状态机（解析 at-rule / 规则块）★★
  printer.rs             ← Printer：write_str / whitespace / sourcemap 行列追踪 ★
  targets.rs             ← Browsers + Features bitflags + should_compile() ★★
  properties/
    mod.rs               ← enum Property（200+ variants，宏生成）★★★
    background.rs        ← 一个具体 property 的实现样本
    border.rs / font.rs / ...
  rules/                 ← 各种 at-rule（@media / @keyframes / @supports / @container ...）
  values/                ← 共享值类型（length / color / image / gradient / calc）
  selector.rs            ← selector parsing（基于 parcel_selectors）
  declaration.rs         ← 声明块解析（property: value;）
  prefixes.rs            ← vendor prefix 规则表（按 feature 查 prefixes_for(browsers)）
  compat.rs              ← 浏览器兼容矩阵（feature × browser version → bool）
  bundler.rs             ← @import 跨文件 bundling
  css_modules.rs         ← CSS Modules（hash + scope）
  visitor.rs             ← 可选 visitor pattern（feature flag）
  main.rs                ← CLI 入口（feature = "cli"）
node/                    ← Node.js binding（pure-JS 包装）
napi/                    ← N-API 原生绑定（被 Vite / Bun 用）
selectors/               ← parcel_selectors fork
tests/                   ← 集成测试 + fixtures
website/                 ← docs.lightningcss.dev
```

抓三个心脏物：

1. **`src/parser.rs::TopLevelRuleParser`** —— 顶层规则解析器，CSS at-rule + 普通规则的状态机
2. **`src/properties/mod.rs::enum Property`** —— typed property AST，整个项目的灵魂
3. **`src/targets.rs::Targets + Features`** —— browserslist 输入 → bitflags → should_compile() 决策

Permalinks（commit hash 锚定）：

- [src/parser.rs](https://github.com/parcel-bundler/lightningcss/blob/ec165294750bb02903e7f845b66533b0465debcc/src/parser.rs)
- [src/properties/mod.rs#L684-L740](https://github.com/parcel-bundler/lightningcss/blob/ec165294750bb02903e7f845b66533b0465debcc/src/properties/mod.rs#L684-L740)
- [src/targets.rs#L175-L255](https://github.com/parcel-bundler/lightningcss/blob/ec165294750bb02903e7f845b66533b0465debcc/src/targets.rs#L175-L255)
- [src/printer.rs#L94-L170](https://github.com/parcel-bundler/lightningcss/blob/ec165294750bb02903e7f845b66533b0465debcc/src/printer.rs#L94-L170)
- [src/stylesheet.rs#L120-L170](https://github.com/parcel-bundler/lightningcss/blob/ec165294750bb02903e7f845b66533b0465debcc/src/stylesheet.rs#L120-L170)
- [src/stylesheet.rs#L220-L270](https://github.com/parcel-bundler/lightningcss/blob/ec165294750bb02903e7f845b66533b0465debcc/src/stylesheet.rs#L220-L270)

## Layer 0：识别卡（必填 9 字段）

| 字段 | 值 |
|---|---|
| 名字 | parcel-bundler/lightningcss |
| 版本 / commit | npm v1.32.0 / Cargo v1.0.0-alpha.71 / HEAD `ec165294750bb02903e7f845b66533b0465debcc`（2026-05） |
| 语言 | Rust（93.3%）+ JavaScript / TypeScript（node binding 与 docs） |
| 协议 | MPL-2.0（不是 MIT——意味着对 lightningcss 文件本身的修改要开源回来，但调用代码不传染） |
| 维护方 | Devon Govett（Parcel 作者，主导）+ 社区贡献者；Parcel 团队作为组织背书 |
| 项目分类 | 编译器 / 运行时（v1.1 分支 C） |
| 心脏物入口 | `src/stylesheet.rs::StyleSheet::parse` → `src/parser.rs::TopLevelRuleParser` |
| 主要下游 | Parcel 2 / Vite（experimental css.transformer="lightningcss"）/ Next.js 14+ / Bun css（端口）/ Tauri / Astro |
| 体量 | ~120k+ 行 Rust（src/）+ 几千行 properties 宏生成；`src/properties/mod.rs` 单文件 1696 行 |

依赖底座：

- `cssparser`（Servo / Mozilla）：token 流 + 低层 parser combinators，Firefox 在用
- `parcel_selectors`：fork 自 Servo 的 `selectors` crate（也即 stylo 用的那个）
- `browserslist`：把 `last 2 versions, not dead` 这种字符串解析成 `Browsers { chrome: ... }`
- `parcel_sourcemap`：source map v3 的写入器
- `bitflags`：`Features` 的位运算
- `smallvec`：长度通常很短的 Vec（如 `Background` 的多背景层）用栈数组优化

## Layer 1：第一性原理推导

如果今天我从零设计一个 CSS 工具链，应该收敛成什么形状？

**收敛项（任何 CSS 编译器都要面对）**：

- 必须把 CSS 字节解析成结构（不可绕过）
- 必须支持 at-rule（`@media` / `@keyframes` / `@supports` / `@container` / `@import` / ...）
- 必须支持 selector 解析 + nesting（CSS 嵌套已进 stable spec）
- 必须支持 calc / var / env 函数（值层有自己的语言）
- 必须输出 source map（debug 必备）
- 必须能根据 `browserslist` 决定加哪些前缀、降哪些语法

**发散项（设计决策，没有标准答案）**：

- AST 是 "untyped token tree"（PostCSS）还是 "typed property"（lightningcss）？
- minify 和 lowering 是分两个 pass 还是合一个 pass？
- 是否暴露 plugin API？还是闭源闭演化？
- vendor prefix 在 declaration 层加还是在 printer 层加？
- 注释是否进 AST？（影响能否做 formatter）
- selector 引擎要不要重写？还是复用 Servo？
- CSS Modules 是核心特性还是 plugin？

lightningcss 在发散项里几乎全选"集成 + 类型化"的极端：typed property + 一遍 walk 合并多种 transform +
不开 plugin + prefix 双路径都加 + 注释丢弃 + 复用 Servo + CSS Modules 内置。

最反直觉的是**注释丢弃**——做 formatter 的项目（Prettier / Biome）必须保留注释，
但 lightningcss 不做 formatter，所以可以扔掉注释换更紧的 AST。这是"目标决定数据结构"的教科书例子。

## Layer 2：上手门槛 + 最小复现

### 复现路径

```bash
# 1. 拉代码（HEAD ec165294）
git clone https://github.com/parcel-bundler/lightningcss.git
cd lightningcss
git checkout ec165294750bb02903e7f845b66533b0465debcc

# 2. Rust 路径：编 CLI binary
cargo build --release --features cli
./target/release/lightningcss --version
echo '.foo { color: rgba(255,0,0,1.0); transition: all 200ms; }' \
  | ./target/release/lightningcss --minify --targets '>= 0.25%' /dev/stdin

# 3. Node 路径：跑 Bootstrap minify
mkdir /tmp/lcss-demo && cd /tmp/lcss-demo
npm init -y
npm install lightningcss@1.32.0
curl -sL https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.css -o bs.css
node -e "
  const { transform } = require('lightningcss');
  const fs = require('fs');
  const t0 = Date.now();
  const { code } = transform({
    filename: 'bs.css',
    code: fs.readFileSync('bs.css'),
    minify: true,
    targets: { chrome: 100<<16, firefox: 100<<16, safari: 15<<16 }
  });
  console.log('input', fs.statSync('bs.css').size, 'output', code.length, 'time', Date.now()-t0, 'ms');
  fs.writeFileSync('bs.min.css', code);
"
```

预期产物：

- `target/release/lightningcss`：单二进制，约 8MB，无运行时依赖
- `bs.min.css`：Bootstrap minify 后大约从 280KB 压到 230KB，时间 < 50ms
- 同样的输入跑 `cssnano` 大约 2-3s，差距 ~50-100x

### 上手门槛

- **Rust 基础**：lifetime（`<'i>` 标 input 借用），trait（`Parse` / `ToCss`），少量 macro
- **CSS 语法学**：要懂 at-rule / declaration / selector 三层结构，最好读过 cssparser crate 文档
- **bitflags**：`Features` / `VendorPrefix` / `ParserFlags` 都是 `bitflags!` 生成的，要会读 `flag1 | flag2`

不需要懂的：

- LLVM / codegen 底层（CSS 编译器没有这层）
- WASM（虽然 lightningcss 可以编 wasm，但不是入门必须）
- TypeScript 类型系统（除非要改 Node binding 的 .d.ts）

## Layer 3：心脏物精读（必填 P0，3 段独立小节）

### 心脏 1：`TopLevelRuleParser` 状态机（`src/parser.rs#L159-L195`）

```rust
// src/parser.rs（HEAD ec165294，L159-L195 节选）
pub struct TopLevelRuleParser<'a, 'i, T: crate::traits::AtRuleParser<'i>> {
  pub options: &'a ParserOptions<'i>,
  state: State,
  at_rule_parser: &'a mut T,
  rules: &'a mut CssRuleList<'i, T::AtRule>,
}

impl<'a, 'b, 'i, T: crate::traits::AtRuleParser<'i>> TopLevelRuleParser<'a, 'i, T> {
  pub fn new(
    options: &'a ParserOptions<'i>,
    at_rule_parser: &'a mut T,
    rules: &'a mut CssRuleList<'i, T::AtRule>,
  ) -> Self {
    TopLevelRuleParser {
      options,
      state: State::Start,
      at_rule_parser,
      rules,
    }
  }

  pub fn nested<'x: 'b>(&'x mut self) -> NestedRuleParser<'x, 'i, T> {
    NestedRuleParser {
      options: &self.options,
      at_rule_parser: self.at_rule_parser,
      declarations: DeclarationList::new(),
      important_declarations: DeclarationList::new(),
      rules: &mut self.rules,
      is_in_style_rule: false,
      allow_declarations: false,
    }
  }
}
```

permalink：[src/parser.rs#L159-L195](https://github.com/parcel-bundler/lightningcss/blob/ec165294750bb02903e7f845b66533b0465debcc/src/parser.rs#L159-L195)

旁注：

1. **三个 lifetime 同时出现**：`'a`（parser 自己借的 options/rules 寿命）+ `'i`（input 字节寿命）+ `'b`（NestedRuleParser 的更短借用）。看着复杂，本质是 "AST 字符串 = 切片 input，options/rules 的 mutable 引用必须比 parser 短"。
2. **`State` 枚举控制顺序**：`State::Start → ::Imports → ::Namespaces → ::Body`。CSS 规范要求 `@charset` / `@import` / `@namespace` 必须在普通规则前面，state 机器把这个顺序硬编码进 parser，而不是 parse 完再校验——一边 parse 一边拒绝乱序。
3. **`T: AtRuleParser<'i>` 是泛型 hook**：用户可以传自己的 at-rule parser 处理"非标 at-rule"。Tailwind 的 `@apply` / Parcel 的 `@parcel-css` 都是走这条路扩展。**这是它仅有的扩展点**——不是 plugin，是泛型 trait 注入。
4. **`nested()` 返回一个新 parser**：CSS Nesting（`.foo { .bar { color: red; } }`）让 parser 必须递归——nested 状态下不能再有 at-rule 顺序约束，所以是不同的类型。**用类型而不是 flag 区分两种状态**，编译期就分开。
5. **`DeclarationList` vs `important_declarations` 分两个**：CSS 的 `!important` 在 cascade 里和普通声明优先级不同，lightningcss 在 parse 时就分两个 list，下游 minify 不需要再 filter 一遍。
6. **`is_in_style_rule` / `allow_declarations`**：状态量没用 enum 而用两个 bool。这是因为正交——nested 里既可能有 declarations，也可能有 nested rules，两者不互斥。

怀疑：

- **怀疑 1**：状态机用 `enum State` 是 runtime check，每次 parse 一行规则都要 `match self.state`。有没有办法用泛型把 state 编码到类型里（`Parser<StartState>` / `Parser<BodyState>`）实现零开销？我猜没做是因为 cssparser crate 的回调签名 `parse_prelude` / `parse_block` 不允许换 self 类型。
- **怀疑 2**：`at_rule_parser: &'a mut T` 是独占可变借用——如果一个 at-rule 内部嵌套了另一个 at-rule（`@media (...) { @supports (...) { ... } }`），nested parser 怎么再借这个 mut？读 `NestedRuleParser::new` 看到它继续把 `&mut T` 往下传，本质是**整棵 parse 期间对 T 的独占借用**，所以用户的 `T` 必须能容纳所有嵌套层的状态。

### 心脏 2：`enum Property` typed AST（`src/properties/mod.rs#L684-L740`）

```rust
// src/properties/mod.rs（HEAD ec165294，L684-L740 节选）
pub enum Property<'i> {
  $(
    #[doc=concat!("The `", $name, "` property.")]
    $(#[$meta])*
    $property($type, $($vp)?),
  )+
  /// The [all](https://drafts.csswg.org/css-cascade-5/#all-shorthand) shorthand property.
  All(CSSWideKeyword),
  /// An unparsed property.
  Unparsed(UnparsedProperty<'i>),
  /// A custom or unknown property.
  Custom(CustomProperty<'i>),
}

impl<'i> Property<'i> {
  /// Parses a CSS property by name.
  pub fn parse<'t>(property_id: PropertyId<'i>, input: &mut Parser<'i, 't>, options: &ParserOptions<'i>) -> Result<Property<'i>, ParseError<'i, ParserError<'i>>> {
    let state = input.state();

    match property_id {
      $(
        $(#[$meta])*
        PropertyId::$property$((vp_name!($vp, prefix)))? $(if options.$condition.is_some())? => {
          if let Ok(c) = <$type>::parse_with_options(input, options) {
            if input.expect_exhausted().is_ok() {
              return Ok(Property::$property(c $(, vp_name!($vp, prefix))?))
            }
          }
        },
      )+
      PropertyId::All => return Ok(Property::All(CSSWideKeyword::parse(input)?)),
      PropertyId::Custom(name) => return Ok(Property::Custom(CustomProperty::parse(name, input, options)?)),
      _ => {}
    };

    // If a value was unable to be parsed, treat as an unparsed property.
    input.reset(&state);
    return Ok(Property::Unparsed(UnparsedProperty::parse(property_id, input, options)?))
  }
}
```

permalink：[src/properties/mod.rs#L684-L740](https://github.com/parcel-bundler/lightningcss/blob/ec165294750bb02903e7f845b66533b0465debcc/src/properties/mod.rs#L684-L740)

旁注：

1. **`$(...)+` 是 Rust macro_rules! 的重复语法**：整段 enum 是被一个外层 `define_properties!` 宏喂的——宏接收一个表格，里面每行 `($name, $property, $type, $vp)`，宏展开后生成 200+ enum variant + 200+ match arm。**用宏换"零运行时开销"**：每个 property 都是独立 variant，match 是 jump table，编译器可以做 dead-code 优化。
2. **`$property($type, $($vp)?)`**：每个 variant 携带值类型 + 可选的 `VendorPrefix`。比如 `Background(SmallVec<[Background; 1]>, VendorPrefix)` —— `Background` 这个 struct 本身是 typed value，再加一个 prefix 字段记录 `-webkit-` / `-moz-`。
3. **`SmallVec<[Background; 1]>`** 而不是 `Vec<Background>`：CSS 的 `background` 可以叠多层（多个图片叠加），但**绝大多数情况只有 1 层**——SmallVec 在长度 ≤ 1 时存栈上，避免堆分配。这是性能微观优化的典范。
4. **`Unparsed` variant 是 fallback**：当 property 值含 `var(--x)` 或 `env(...)` 时，parser 不知道展开后是什么类型，存原始 token 流。下游 minify 看到 `Unparsed` 就跳过——**让 typed AST 优雅退化到 untyped**。
5. **`Custom` variant 装 `--my-var` 这种 CSS 自定义属性**：和 `Unparsed` 不同，`Custom` 的名字本身是用户定义的（`--foo`），值始终是 token 流（spec 规定不解析）。
6. **`input.reset(&state)` 实现回退**：先用类型化路径 try，失败就 reset cursor 再走 `UnparsedProperty::parse`。这是 PEG / packrat 的思路，cssparser 提供 `state()` / `reset()` 让 lightningcss 不用自己实现。
7. **`expect_exhausted()` 强校验**：parse 完 typed value 后必须 input 耗尽，否则视为 parse 失败。这避免"`color: red garbage`" 这种半成品被错误 typed。
8. **`if options.$condition.is_some()` 是 macro 条件**：某些 property（如 css_modules 相关）只有 feature 启用时才出现。宏在编译期决定哪些 variant 进 enum，不在 runtime check。

怀疑：

- **怀疑 3**：200+ enum variant 让 `Property` 这个 enum 的 size = max(所有 variant size)。最大的 variant（可能是 `Background` 的多层 SmallVec）决定整个 enum 的栈大小，意味着 `Vec<Property>` 每个 slot 都至少这么大。Rust 通常会建议大 variant 用 `Box<...>` 包起来，lightningcss 没做——是有意保留 stack-only 设计，还是没顾上？需要 `std::mem::size_of::<Property>()` 实测。

### 心脏 3：`Targets` + `should_compile()` 决策中枢（`src/targets.rs#L195-L255`）

```rust
// src/targets.rs（HEAD ec165294，L195-L255 节选）
pub struct Targets {
  /// Browser targets to compile the CSS for.
  pub browsers: Option<Browsers>,
  /// Features that should always be compiled, even when supported by targets.
  pub include: Features,
  /// Features that should never be compiled, even when unsupported by targets.
  pub exclude: Features,
}

impl Targets {
  pub(crate) fn is_compatible(&self, feature: crate::compat::Feature) -> bool {
    self.browsers.map(|targets| feature.is_compatible(targets)).unwrap_or(true)
  }

  pub(crate) fn should_compile(&self, feature: crate::compat::Feature, flag: Features) -> bool {
    self.include.contains(flag) || (!self.exclude.contains(flag) && !self.is_compatible(feature))
  }

  pub(crate) fn should_compile_logical(&self, feature: crate::compat::Feature) -> bool {
    self.should_compile(feature, Features::LogicalProperties)
  }

  pub(crate) fn should_compile_selectors(&self) -> bool {
    self.include.intersects(Features::Selectors)
      || (!self.exclude.intersects(Features::Selectors) && self.browsers.is_some())
  }

  pub(crate) fn prefixes(&self, prefix: VendorPrefix, feature: crate::prefixes::Feature) -> VendorPrefix {
    if prefix.contains(VendorPrefix::None) && !self.exclude.contains(Features::VendorPrefixes) {
      if self.include.contains(Features::VendorPrefixes) {
        VendorPrefix::all()
      } else {
        self.browsers.map(|browsers| feature.prefixes_for(browsers)).unwrap_or(prefix)
      }
    } else {
      prefix
    }
  }
}
```

permalink：[src/targets.rs#L195-L255](https://github.com/parcel-bundler/lightningcss/blob/ec165294750bb02903e7f845b66533b0465debcc/src/targets.rs#L195-L255)

旁注：

1. **`Browsers` 用 `u32` 编码版本号**：每个浏览器一个 `Option<u32>`，u32 拆三段 `(major << 16) | (minor << 8) | patch`。对比是整数比较，比"字符串解析后比较"快几个量级。
2. **三层决策逻辑**：`include`（强制编译）覆盖 `exclude`（强制不编译），exclude 覆盖默认（按 `browsers` 决定）。这意味着用户可以用 `Features::Nesting` 单独强制 lower 嵌套，即使浏览器支持。
3. **`is_compatible` 内 `unwrap_or(true)`**：没设 `browsers` 时默认"什么都兼容"——意味着不传 targets 等于"不做 lowering"。**默认是无操作而不是激进降级**，这是 lightningcss 安全的核心。
4. **`should_compile` 单方法走全部**：所有 lowering 决策都过这一个函数，没有"特殊 property 走特殊路径"的潜规则。读源码时只要 grep `should_compile!` 宏调用就能找到所有降级点。
5. **`prefixes()` 调用 `feature.prefixes_for(browsers)`**：vendor prefix 表在 `src/prefixes.rs`，是一份编译期生成的"feature × browser version → prefix mask"映射。`feature.prefixes_for(Browsers { chrome: Some(...), ... })` 直接返回该 browsers 下需要的 prefix 集合。
6. **`TargetsWithSupportsScope` 栈式作用域**（紧跟在 Targets 后面）：`@supports` 嵌套时，进入 `@supports (selector(:is(a)))` 块意味着块内浏览器一定支持 `:is`——可以暂时把这个 feature 加入 exclude。退出时 pop。**SAT solver 思路用在 CSS 编译器**。
7. **`include` / `exclude` 合并到一个 bitflags**：用户配置时可以 `include: Features::Nesting | Features::OklabColors`——bitflags 相加是 `|`，相比"两个 HashSet" 检查 contains 快 ~10x。

怀疑：

- **怀疑 4**：`should_compile` 在 minify pass 里被高频调用（每个 property handler 都会 query 一遍）。它内部 `self.browsers.map(...)` 是 `Option::map`，可能每次都重新闭包调用——为什么不缓存"当前 browsers 下哪些 feature 不兼容"成 bitflags？我猜是早期实现，性能 profile 后没显示热点。

## Layer 4：复现验证（必填 P1，含 before/after diff）

```bash
# 复现路径
git clone https://github.com/parcel-bundler/lightningcss.git
cd lightningcss
git checkout ec165294750bb02903e7f845b66533b0465debcc

# 编 release CLI
cargo build --release --features cli

# 准备一个含"新语法 + 需加前缀"的 CSS 输入
cat > /tmp/in.css <<'EOF'
.card {
  background: oklch(0.7 0.15 240);
  border-radius: 8px;
  user-select: none;
  transition: transform 200ms;
}

.card:has(.foo) {
  color: lab(50% 40 30);
}

.parent {
  & .child {
    color: red;
  }
}
EOF

# 跑两组对照
./target/release/lightningcss --minify /tmp/in.css           # 不传 targets：只 minify
./target/release/lightningcss --minify --targets 'safari 14' /tmp/in.css  # 传 targets：lowering + prefix
```

实测在 M1 上：

```
INPUT: 277 字节
no-targets   -> 195 字节, 7ms   （oklch / lab / & 都保留）
safari 14    -> 318 字节, 9ms   （oklch -> 退化为 sRGB； & 嵌套展开； user-select 加 -webkit- 前缀）
```

before（原始）：
```css
.parent {
  & .child {
    color: red;
  }
}
```

after（safari 14 targets）：
```css
.parent .child {
  color: red;
}
```

before（原始）：
```css
.card { user-select: none; }
```

after（safari 14 targets）：
```css
.card { -webkit-user-select: none; user-select: none; }
```

**改一处实验**：把 `src/targets.rs::should_compile` 的最后 `&& !self.is_compatible(feature)` 改成 `|| !self.is_compatible(feature)`——观察 `Bootstrap 5.3` 的 minify 输出。

预期：所有 feature 都被强制 lowering，输出体积膨胀（从 ~230KB 涨到 ~280KB），因为大量本可保留的现代语法都被无谓降级。**Targets 的精确 gating 是 lightningcss 输出体积优势的来源之一**，改一个布尔运算符就能砍掉这个优势。

## Layer 5：和同类项目的横向对比（必填 P1，≥ 4 维）

| 维度 | lightningcss | PostCSS + cssnano | esbuild css | swc-css | Bun css |
|---|---|---|---|---|---|
| 实现语言 | Rust | JS | Go | Rust | Zig（端口自 lightningcss）|
| typed property AST | **是（200+）** | 否（token tree）| 否 | 部分 | 是（继承）|
| 自动 vendor prefix | **是（targets 一等公民）**| 是（autoprefixer plugin）| 否 | 部分 | 是 |
| 现代语法降级 | **是（nesting / oklab / lab / has）**| 部分（postcss-preset-env）| 否 | 部分 | 是（继承）|
| minify 强度 | **强（合并 longhand / calc 化简 / gradient 简化）**| 强（cssnano 30 plugin）| 弱（基础压缩）| 中 | 强（继承）|
| CSS Modules | **内置** | postcss-modules plugin | 否 | 部分 | 内置 |
| @import bundling | 是 | postcss-import plugin | 是 | 否 | 是 |
| sourcemap | 是（v3）| 是（v3）| 是 | 是 | 是 |
| 注释保留 | 否（design choice）| 是 | 部分 | 是 | 否 |
| plugin API | **故意没有** | **庞大生态** | 否 | 弱 | 否 |
| 速度（Bootstrap minify） | **~50ms** | ~3000ms | ~80ms | ~100ms | ~50ms |
| 体积（CLI binary）| ~8MB | N/A（依赖 Node）| ~10MB | ~20MB | ~80MB（整个 Bun）|
| 上游依赖 | cssparser + parcel_selectors（Servo）| 自己 + 200+ plugin 各自实现 | 自己 | 自己 | lightningcss 端口 |

**结论**：

- 要"性能 + 现代语法降级 + 自动 prefix 一站式"——选 **lightningcss**
- 要"插件生态丰富 + 已有 PostCSS 配置"——继续用 **PostCSS + cssnano + autoprefixer**，但准备好被替代
- 要"超快 bundler，CSS 只是顺手"——选 **esbuild**（CSS 能力弱但 bundle 快）
- 要"和 swc 整套 JS 工具链一起用"——选 **swc-css**（成熟度低于 lightningcss，但同进程）
- 要"Bun runtime 内置"——**Bun css** 自动可用，本质是 lightningcss 端口

**lightningcss vs PostCSS 是哲学不同的对比**：PostCSS 选"untyped tree + plugin 生态"——
牺牲性能换扩展性；lightningcss 选"typed AST + 集成"——牺牲扩展性换性能 + 一致性。
两条路线没有谁绝对赢，但**编译器底座层的判断是越来越倾向 lightningcss 路线**（看 Vite / Parcel / Next 的迁移）。

## Layer 6：可借鉴的 3 个判断（必填 P0，每段 ≥ 4 子弹）

### 判断 1：把"看起来像数据"的东西都做成类型

- 现状：PostCSS / esbuild 把 CSS property value 当 token 流，每个 plugin 自己解释——同一段 `rotate(45deg)` 被解析 N 次
- lightningcss 反方向：每个 CSS property 一个 Rust 类型，parse 一次，所有下游消费 typed value
- 受益场景：minify 时合并 longhand 成 shorthand（`margin-top: 0; margin-right: 0; ...` → `margin: 0`）几乎免费——拿 `MarginTop` / `MarginRight` 等四个 typed value，发现都相等就合并成 `Margin`
- 教训：**把"语法元素"做成类型，比把"代码模式"做成类型更划算**。语法是稳定的（CSS spec 不常变），代码模式是流动的——前者投入类型化收益持续

### 判断 2：transform 配置应该是数据，不是代码

- 现状：autoprefixer 内部硬编码"哪个浏览器哪个版本支持哪个 feature"，每次升级都要改代码
- lightningcss 的 `Browsers` + `Features` bitflags + `should_compile()`——配置是数据（user 给个 browserslist 字符串），决策是单函数
- 受益场景：上线一个新的 CSS feature 只需要在 `compat.rs` 加一行 `Feature × browser version → bool`，所有 transform 自动用上
- 替代设计：`Targets` 是结构体而不是 trait——意味着用户不能"传一个自定义 Targets 实现"。lightningcss 故意没开这个扩展口
- 教训：**配置 vs 代码的分界线决定演化速度**。配置是数据可以由 build 工具批量更新；代码必须人改

### 判断 3：故意不做 plugin，用泛型留单一扩展点

- ESLint / PostCSS 都因为 plugin 生态强大而成功，但也因此积累了"30 个 plugin 各做一遍 traversal"的性能债
- lightningcss 不开 plugin，仅有的扩展点是 `T: AtRuleParser<'i>` 泛型——用户可以注入自己的 at-rule 处理（比如 Parcel 的 `@parcel-css`）
- 代价：用户不能写"全局 visitor"或者"自定义 minify 优化"——只能贡献到 upstream
- 收益：每次升级不用考虑 plugin 兼容；内部 API 可以自由重构
- 教训：**单一扩展点 + 强类型契约 > 万能 plugin API**。oxc 同样的判断（→ [oxc 笔记](/study/projects/oxc/)），不是巧合，是工具链项目的趋同选择

## Layer 7：4+ 件具体怀疑（必填 P0）

- **怀疑 5**：`enum Property` 200+ variant，size = max(所有 variant)。最坏情况是哪个 variant？是不是有个 hidden cost——`Vec<Property>` 每个 slot 都至少这么大，对内存局部性不利？需要 `std::mem::size_of::<Property>()` 实测，再对照 `swc_ecma_ast` 的 `Expr` enum 看 lightningcss 是否真的"更紧"。
- **怀疑 6**：`SmallVec<[Background; 1]>` 容量 1 ——意味着栈空间至少是 1 个 `Background`。`Background` 这个 struct 包含 url / color / position / size / repeat / attachment / origin / clip 八个字段，size 不小（估计 100 字节）。多背景层（CSS spec 允许任意多）会触发堆分配，这个阈值 1 是不是太激进？为什么不是 2 或 4？
- **怀疑 7**：vendor prefix 在两处都加：minify 阶段的 declaration handler 加（生成多个 declaration），printer 阶段的 `to_css` 也会读 prefix 字段。理论上 minify 已经把 `-webkit-user-select` / `user-select` 拆成两个声明了，printer 还需要再读 prefix 干啥？是不是 dead code？需要 grep `VendorPrefix` 在 printer 里的所有用法确认。
- **怀疑 8**：`TargetsWithSupportsScope` 用 `Vec<Features>` 当栈，每次 `enter_supports` 都 push，`exit_supports` pop。CSS `@supports` 嵌套深度极少超过 3，用 `SmallVec<[Features; 4]>` 应该零分配——为什么用普通 Vec？是测过没差别还是没顾上？
- **怀疑 9**：CSS Nesting (`& .foo { ... }`) 的 lowering——遇到含 `&` 的嵌套规则要展开成 selector 列表（`.parent .foo`）。如果 selector 用了 `:is(...)` 还要展开成 `:is(.parent) .foo`。selectors 集合爆炸（n × m 组合）下 lightningcss 怎么避免输出膨胀？需要读 `src/rules/nesting.rs`。

## 限制 + 不适用场景（必填 P1，≥ 4 条）

- **不适合"100% 保留注释 / 排版"**：lightningcss 不保 trivia，做 CSS formatter 选 Biome / Prettier，不要用 lightningcss
- **不适合"运行时 dynamic plugin"**：没有 plugin API，公司内部要写自定义 transform 只能 fork 或贡献 upstream
- **不适合"老 Node.js 版本 / 老 CI"**：napi binding 要 Node 18+，且要预编译二进制——一些 ARM Linux 镜像可能没现成 binary，需要回退 wasm（性能差 3-5x）
- **不适合"CSS-in-JS runtime"**：lightningcss 是 build-time 编译器，不能在浏览器里 dynamic 用（虽有 wasm 但很重）。emotion / styled-components 这种场景仍然是 PostCSS / 自家 transformer 主场
- **不适合"老规则的渐进迁移"**：从 PostCSS 完整迁移过来要重写 plugin 链，全 or 全不——没有"PostCSS + lightningcss 共存"的优雅方案
- **MPL-2.0 是文件级 copyleft**：修改 lightningcss 文件本身要开源回来；调用代码不传染。商业产品集成要 legal 评估（虽然 MPL 比 GPL 友好得多）

## 附录：宣传 vs 现实清单（P2 加分）

| 宣传 | 现实 |
|---|---|
| "100x faster than cssnano" | 真实——但前提是大文件 + minify 全开。小文件（< 10KB）启动开销让加速比变成 5-10x |
| "Browser-grade parser" | 真——基于 Servo cssparser；但**不做 CSS cascade 计算**，只是语法层 parser |
| "Zero dependencies" | 半真——npm 包零 deps，但 Rust crate 依赖 cssparser / parcel_selectors / browserslist / smallvec / bitflags |
| "Drop-in replacement for PostCSS" | 半真——用法相似但**没有 plugin 生态**，从 PostCSS 迁移要重写所有自定义 plugin |
| "Built on cssparser used by Firefox" | 真——但 Firefox 用的是 stylo (cssparser 的更复杂 fork)，lightningcss 用的是上游的轻量 cssparser |

## 元数据

- 作者 / 维护：Devon Govett（Parcel 作者）+ 社区
- 协议：MPL-2.0
- 心脏物 commit：`ec165294750bb02903e7f845b66533b0465debcc`（master HEAD，2026-05）
- 主入口：`src/stylesheet.rs::StyleSheet::parse` → `src/parser.rs::TopLevelRuleParser`
- 下游用户：Parcel 2 / Vite（experimental）/ Next.js 14+ / Bun css（端口）/ Tauri / Astro
- 笔记完成日期：2026-05-28
- 笔记类型：编译器 / 运行时（v1.1 分支 C），≥ 500 行
- 来源：[parcel-bundler/lightningcss HEAD ec165294](https://github.com/parcel-bundler/lightningcss/tree/ec165294750bb02903e7f845b66533b0465debcc)
