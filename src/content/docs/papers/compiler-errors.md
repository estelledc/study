---
title: Compiler Error Messages — 让编译报错有用
来源: 'Marceau et al., "Mind your language: on novices'' interactions with error messages", Onward! 2011 / Becker et al., "Compiler error messages considered unhelpful", ITiCSE 2019'
日期: 2026-05-29
分类: 编程语言 / 编译器
难度: 中级
---

## 是什么

Compiler error messages（**CEM**，编译器报错信息）这条研究线，研究的是"编译器报错为什么对新手如此不友好"+"怎么让它好用"。

日常类比：老师批改卷子有两种风格——

- **冷漠版**："第 3 题错了"
- **友好版**："第 3 题错在你忘了带负号；提示：负数乘负数得正数"

冷漠版让你不知道错哪、怎么改；友好版让你立即知道哪里错、为什么错、怎么修。**compiler errors 这条研究线就是把语言工具从"冷漠版"改造成"友好版"**。

这条线影响了 Rust 的 `help:` / `hint:`、Elm 的彩色 type error、TypeScript 的 "Did you mean?"——你今天写代码时遇到的每一条"友好报错"，背后都是这条研究线的产物。

## 为什么重要

不理解这条研究线，下面这些事都没法解释：

- 为什么 **Rust / Elm / TypeScript / Haskell** 的报错优化文档都会引用这条线
- 为什么 **Elm 敢喊 "no runtime exceptions"** 这种标语——来自这条线"让用户在编译期看懂错误"的理念
- 为什么 **Rust 报错里有 `help:` 和 `hint:` 行**——是直接受研究启发的产物
- 为什么 **编程教学门槛在 2015 年后降低**——新手看得懂报错，挫败感下降，学习曲线变缓

简单说：你今天能"自己 debug"的体验，2010 年前的程序员是没有的。

## 核心要点

研究线把"好的报错"拆成 **三件事**：

1. **Diagnostic（诊断）vs Error（错误）**：传统报错只说"出错了 + 错在哪一行"；diagnostic 进一步**解释为什么错**。类比：老师写"错"和老师写"忘了带负号"的差别。

2. **Suggestion / Hint（建议）**：在解释之上再给一条"是不是想写……"的具体修复建议。让用户从"知道错了"直接跳到"知道怎么改"。

3. **Span（精确定位）+ Did you mean（拼写校正）**：报错不只指向一整行，而是**精确高亮出错的那一段字符**；并自动校正常见 typo——`pirntln` → `println`。

三件事加起来，就是"现代友好报错"的全部内核。

## 实践案例

### 案例 1：Rust 的 `did you mean`

```rust
let x = 1;
println!("{}", y);
```

报错：

```
error[E0425]: cannot find value `y` in this scope
 --> src/main.rs:2:20
  |
2 |     println!("{}", y);
  |                    ^ help: a local variable with a similar name exists: `x`
```

逐部分看：

- `error[E0425]`——分类 + 错误码（`rustc --explain E0425` 能看详细解释）
- `--> src/main.rs:2:20`——精确到行+列的 span
- `^` 高亮——指向错误的具体字符
- `help: ... similar name exists: x`——拼写校正建议

一条报错把"分类 + 定位 + 修复建议"全给了。

### 案例 2：Elm 用颜色和措辞让 type error 不可怕

```elm
add : Int -> Int -> Int
add x y = x ++ y
```

Elm 的报错（彩色版的纯文本简化）：

```
-- TYPE MISMATCH ----------------------------------- src/Main.elm

The (++) operator cannot append these two values:

3|   add x y = x ++ y
                 ^
This `x` value is a:    Int
But (++) needs the left side to be:    String

Hint: Want to add two numbers? Use the (+) operator instead.
```

Elm 把术语"换成人话"——不是 "type mismatch in operand"，而是 "Want to add two numbers? Use (+) instead"。

### 案例 3：TypeScript 的属性拼写建议

```ts
type Bar = { baz: number };
const b: Bar = { baz: 1 };
console.log(b.foo);
```

报错：

```
Property 'foo' does not exist on type 'Bar'. Did you mean 'baz'?
```

短、定位、给修复——三件事齐了。

## 踩过的坑

1. **不是"长 + 详细 = 友好"**：早期研究试过把报错变长（多解释、多例子），结果用户**仍然不读**。Becker 2019 大样本验证了：长报错被跳过率反而上升。**短 + actionable** 才是关键。

2. **"友好报错"对新手和老手都有用**：直觉上以为只有新手需要友好报错，老手"自己懂"。实证数据反过来——老手也只看 30% 时间在报错上，**所有人**都嫌长。

3. **stack trace 是反友好的典型**：Java NPE 默认抛 20+ 行 stack，框架内部 frame 占 80%——用户被无关信息淹没。Rust panic 默认压到 5-10 帧 user-relevant 内容是更好的设计。

4. **error code（如 `E0425`）需要配合 `--explain` 才有用**：光有 code 用户记不住；Rust 的 `rustc --explain E0425` 让 code 变成可查询的索引，是 code 系统能用的前提。

## 适用 vs 不适用场景

**适用**：
- 设计新 PL 的 error UX（Rust / Elm 模板）
- 改造现有 linter / type checker 的报错（短 + actionable + 含 code 片段）
- LLM agent 工具反馈设计（tool error 短 + 折叠 stack）
- 教学场景的编译器选型——选 Elm / Rust 而非 C++ 老 gcc

**不适用**：
- 不能简单照搬一种语言的报错风格到另一种（Rust E0382 vs Java NPE 性质不同）
- 不要把"短"等同于"好"——超短报错（如 Go 的 `undefined: foo`）虽然好读但定位慢
- 不要在所有场景做拼写校正——大型项目里 "did you mean X" 列出 50 个候选反而更糟

## 历史小故事（可跳过）

- **2011 年**：Marceau et al. 在 Brown 做"Mind your language"研究——发现新手看不懂传统报错，**enhanced error message** 概念诞生。但当时只在教育场景试。
- **2014 年**：Elm 0.16 完全重写报错系统，第一次把"plain English + 颜色 + 修复建议"做成主流语言的默认。Evan Czaplicki 的"友好编译器"理念点燃工业界。
- **2016 年**：Rust 1.0 引入 diagnostic system——`error[E0425]` + span + help + suggestion 一套件。后续 rustc team 持续投入，成为现代友好报错的标杆。
- **2019 年**：Becker et al. 用 N=1965 大样本 survey 验证 Marceau 等人的结论——"长报错没人读"在跨语言、跨经验级别都成立。
- **2024 年**：LLM 开始给报错加自然语言解释。rustc 在试 LLM-augmented error；TypeScript 在 IDE 里集成 Copilot inline fix，把"展示问题"推到"立刻给修复方案"。

13 年走完"理论 → 工业实践 → 大样本验证 → AI 增强"四步。

## 学到什么

1. **报错是 UX**，不是技术日志——设计跟 dialog / toast 一样重要
2. **短 + actionable + 含 source 片段** 是现代友好报错的三件套
3. **新手 ≈ 老手**：友好报错对所有人都有用，不是教学专属
4. **error code + `--explain`** 是把"短报错"和"详细解释"分层的关键模式

## 延伸阅读

- [Rustc error code index](https://doc.rust-lang.org/error_codes/error-index.html)（每个 error code 都有详细解释 + 修复示例）
- [Elm — Compiler Errors for Humans](https://elm-lang.org/news/compiler-errors-for-humans)（Evan 2015 经典博文，宣告友好报错时代）
- [Marceau 2011 PDF](https://cs.brown.edu/~sk/Publications/Papers/Published/mfk-mind-lang-novice-inter-error-msg/)（学术起点，新手编程报错的第一个 systematic study）
- [Becker 2019 大样本 survey](https://dl.acm.org/doi/10.1145/3313831.3376442)（N=1965 跨语言验证）

## 关联

- [[hindley-milner]] —— 类型推导能拿到精确错误，但报错呈现是另一回事
- [[lambda-calculus]] —— 类型系统的理论根，type error 概念的源头
- [[llvm]] —— 现代编译器后端，diagnostic 也是它致力优化的一部分

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[andersen-pointer-analysis]] —— Andersen 指针分析 — 让编译器自己算出 p 可能指向谁
- [[ast-grep]] —— ast-grep — 按语法树搜代码、改代码的命令行工具
- [[beck-tdd]] —— Beck TDD — 用红绿重构循环让设计自己长出来
- [[debugging-dichotomy]] —— Debugging Dichotomy — 程序员真实 debug 行为分两轨
- [[helium-type-errors]] —— Helium — 让类型错误说人话的教学版 Haskell
- [[hindley-milner]] —— Hindley-Milner — 编译器自己猜变量类型
- [[kildall-dataflow]] —— Kildall 数据流框架 — 用一套格论统一所有全局编译优化
- [[lambda-calculus]] —— λ-演算 — 用三条规则表达所有可计算函数
- [[llvm]] —— LLVM — 模块化编译器框架
- [[peg-packrat-ford]] —— PEG / Packrat — 用'有序选择'+'记忆化'写线性时间解析器
- [[plotkin-sos]] —— Plotkin SOS — 用规则讲清楚程序"走一步"是什么
- [[pottier-merr]] —— Pottier LR(1) Reachability — 让 LR 解析器的错误消息覆盖完整
- [[programmer-interruption]] —— Programmer Interruption — IDE 数据告诉你被打断后多久才能继续敲代码
- [[sillito-questions]] —— Sillito 44 问题 — 程序员改代码时到底在问什么
- [[steensgaard-pointer]] —— Steensgaard 指针分析 — 用等价合并把指针分析压到几乎线性
- [[tomita-glr]] —— Tomita GLR — 让 LR 解析器扛得住歧义文法
- [[vellvm]] —— Vellvm — 在 Coq 里给 LLVM IR 写一份机器证明的语义

