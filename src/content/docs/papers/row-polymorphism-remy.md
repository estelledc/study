---
title: Row Polymorphism — 让记录类型可扩展又不丢类型安全
来源: 'Rémy, "Type Inference for Records in a Natural Extension of ML", 1989'
日期: 2026-06-06
分类: 编程语言
子分类: 类型与 PL 理论
难度: 高级
provenance: pipeline-v3
---

## 是什么

Row polymorphism（**行多态**）是 Didier Rémy 1989 年提出的类型系统扩展：让 ML 风格的记录（record）类型既能说「至少有字段 `x:int`」，又能说「可能还有别的字段」，并且**类型推导仍然可判定**。

日常类比：普通记录类型像一张**封闭名单**——「这个人只有姓名和年龄两栏」。行多态像一张**活页表格**——「至少有姓名这一栏，后面还可以插新栏，但插之前系统得检查别跟已有栏冲突」。OCaml 的对象类型、PureScript / Elm 的可扩展 record 都靠这套思想。

核心技术是 **row variable（行变量）** ρ：在类型 `{ lab1:t1; ...; ρ }` 里，ρ 代表「其余未知字段」。

若你熟悉 [[hindley-milner]] 里的普通多态 `α`，可以把 ρ 想成「**字段层面的类型变量**」——统一方程时解的不只是「这个值是什么类型」，还有「这个记录后面还能挂什么标签」。

## 为什么重要

不理解 row polymorphism，下面这些事说不清：

- 为什么 OCaml 能写 `{ x: int; y: string }` 又能写「接受任何带 `x` 字段的记录」而不掉进 [[hindley-milner]] 的封闭记录限制
- 为什么 Elm / PureScript 的 extensible records 语法看起来像魔法——底层是 row variable + 统一（unification）
- 为什么「宽度子类型」（记录多几个字段也算子类型）在 ML 家族里要特别设计——HM 默认记录类型是精确的，不能多不能少
- 为什么现代前端配置对象、JSON 补丁、API schema 演进会借用「开放记录」概念——行多态是类型论里的干净版本

## 核心要点

Rémy 的系统围绕 **三个机制**：

1. **行变量 ρ**：类型 `{ name: string; age: int; ρ }` 表示「肯定有 name、age，另有 ρ 描述的其它字段」。ρ 在推导里像 [[hindley-milner]] 的类型变量 α 一样被求解。

2. **扩展（extension）与收缩（restriction）**：
   - **扩展**：在记录上安全地加字段，要求新标签不与 ρ 里已有标签冲突。
   - **收缩**：投影 `r.l` 时，类型里去掉 `l` 或标记为已访问——保证访问不存在的字段是类型错误。

3. **与 HM 算法 W 合体**：行约束也是方程，用 unification 解；保持可判定性——不像 System F 那样推导半可判定。这是「自然扩展 ML」标题里 natural 的含义。

## 实践案例

### 案例 1：OCaml 对象类型的行多态味道

```ocaml
(* 闭合记录 — 普通 ML *)
type person = { name : string; age : int }

(* 对象 — 行多态/open object *)
let greet (o : < name : string >) = o#name
(* 任何有 name 方法的对象都能传进来，不管还有没有其它方法 *)
```

`< name : string >` 读作「**至少**有 `name`，可能还有更多」——这就是行多态在 OCaml 对象里的表面语法。

### 案例 2：PureScript 可扩展 record

```purescript
-- ρ 是行变量
type Person r = { name :: String | r }

greet :: forall r. Person r -> String
greet p = p.name

-- { name, age } 和 { name, email } 都能传给 greet
```

管道 `|` 右边是「其余字段」占位符——和 Rémy 论文里的 ρ 同一角色。

### 案例 3：为什么需要行变量而不是普通子类型

```text
需要：f : {x:int} -> int  能接受  {x:int; y:string}
HM 记录：类型必须完全一致 → 拒绝
行多态：{x:int; ρ} 与 {x:int; y:string} 可统一，ρ = {y:string} → 接受
```

没有 ρ，你只能为每种字段组合写一个 `f`，组合爆炸。

### 案例 4：行统一失败时长什么样

```text
Error: cannot unify
  { x : int | ρ1 }
with
  { x : int; y : string | ρ2 }
because label y present in both but conflict...
```

看到 `ρ` 出现在报错里，说明推导器在解**行方程**而不是普通类型变量——调试方向是「是否多写了冲突标签」。

## 踩过的坑

1. **与宽度子类型混淆**：行多态不是任意结构子类型——标签冲突、访问未声明字段仍要报错。

2. **行变量逃逸**：若让 ρ 出现在不当位置（如可变引用里），会破坏类型安全——现代语言用限制（如 OCaml 对象行仅在某些位置多态）。

3. **推导顺序敏感**：扩展和投影混用时，错误信息可能指向「行统一失败」——新人难读，需要习惯 row constraint 报错。

4. **和 GADT/模块混用时边界复杂**：Rémy 1989 只管记录核心；完整工业语言还要叠 effect、模块、functor。

5. **把开放记录当「任意 JSON」**：行多态仍要求标签不冲突、访问已知字段；不能绕过类型系统动态塞任意 key。

## 适用 vs 不适用场景

**适用**：
- 需要「开放记录」又不要掉进动态类型的 API 设计
- 编译器/语言实现课讲 HM 之后的第一堂扩展课
- 理解 OCaml 对象、Elm records、Scala 结构类型的理论源头

**不适用**：
- 纯封闭 ADT 就够用的业务模型——行多态是额外复杂度
- 需要任意深度子类型（如 OO 继承层次）→ 更接近名义子类型系统
- 依赖类型/证明助手里的记录——往往用更强的依赖记录而非 Rémy 风格
- 动态语言 JSON 随便塞字段——运行时检查已足够，静态行变量收益低

## 历史小故事（可跳过）

- **1989**：Rémy 博士论文章节奠定 row polymorphism，回答「ML 记录能否自然扩展」。
- **1990s**：OCaml 对象系统吸收行多态思想；SML/NJ 有实验扩展。
- **2010s**：Elm extensible records、PureScript `{ | ρ }` 把论文概念带给前端开发者。
- **今天**：JSON API 演进、配置合并仍借用「开放字段 + 静态检查」——行多态是干净的理论版。

## 学到什么

1. **记录不一定要封闭**——用行变量 ρ 可以既精确又开放。
2. **HM 的可扩展性**有边界，但在记录这一维 Rémy 给出了可判定答案。
3. 读 OCaml `< ... >` 对象类型、Elm `|` record 时，背后都是同一套 row unification。
4. 类型系统论文的价值往往在 10 年后才进入工业语法——行多态是典型案例。
5. 行多态与 [[hindley-milner]] 的 **let-polymorphism** 正交——一个管记录形状，一个管函数泛化。

## 延伸阅读

- 论文 PDF：[Rémy 1989 taoop1](http://gallium.inria.fr/~remy/ftp/taoop1.pdf)
- [[hindley-milner]] —— 行多态扩展的母体算法
- [[trees-that-grow]] —— 另一路「让 AST/类型随阶段生长」的 PL 设计
- OCaml Manual — Objects chapter
- PureScript Records 文档 —— `|` row polymorphism 语法

## 关联

- [[hindley-milner]] —— 基础类型推导；行多态是记录在 HM 上的自然延伸
- [[trees-that-grow]] —— 同属「让类型/结构可扩展」的 PL 思想
- [[bidirectional-typing]] —— 现代语言常结合双向检查处理更复杂扩展
- [[system-f-reynolds-1974]] —— 另一大 HM 扩展方向（多态 λ），对比学习
- [[standard-ml]] —— 原始 ML 记录模型偏封闭，衬托 Rémy 扩展动机

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）

