---
title: Row Polymorphism — 让函数不必知道 record 的全部字段
来源: 'Rémy. "Type Inference for Records in a Natural Extension of ML". INRIA Research Report 1989'
日期: 2026-06-24
分类: 编程语言
难度: 中级
---

## 是什么

Row polymorphism 是一种让类型系统表达"我只关心这个 record 有某些字段，其余随便"的多态方式。日常类比：你去前台说"帮我找一个有阳台的房间"，至于房间是大是小、朝南朝北，你不关心——"其余字段"由一个**行变量**（row variable）ρ 统一代表。

Rémy 1989 年的论文把这个想法变成了完整的类型推导算法：给 ML 加一种新的"行"（row）结构，让 record 类型能被 Hindley-Milner 式推导，不需要子类型（subtyping），也不需要为每种 record 形状单独写类型定义。

核心洞见：把 record 类型 `{ x : Int, y : Bool }` 看成一个"行"——一串 label-type 对，末尾可以是空行 `·` 或者一个行变量 `ρ`。如果末尾是 `ρ`，这个 record 类型就是"开放的"，能和更大的 record 统一。整套机制只添加一种新的 kind（Row kind），算法 W 几乎不用改。

## 为什么重要

- OCaml 对象类型里的 `..`（row variable）直接来自这篇论文，是 OCaml 结构化子类型的引擎
- PureScript 的 record 系统和 effect 系统都基于 row polymorphism，是其类型系统最有辨识度的特征
- Elm 的 extensible record 语法 `{ a | x : Int }` 是 Rémy 方案的简化版，让前端开发者直觉感受到行多态的好处
- 它证明"多余字段"不用子类型也能处理，类型推导照样完备——这改变了语言设计的思路

## 核心要点

1. **行变量吸收多余字段**：写 `{ x : Int | ρ }` 表示"至少有字段 x，其余字段打包在 ρ 里"。类比：快递单上写"内含手机一台，其余物品见附页"——ρ 就是那张附页。

2. **统一（unification）代替子类型**：传统做法是说"有更多字段的 record 是子类型"（宽度子类型规则）。Rémy 的做法是让行变量参与等式统一——和 HM 推导用的是同一套解方程机制，不需要额外的子类型判断。类比：不是说"大房间包含小房间"，而是说"这两个房间的公共部分相同、其余部分各存各的变量"。

3. **lacks 约束保证安全**：当你写 `{ x : Int | ρ }` 时，系统隐含一条约束"ρ 里不能再有 x"。这条"缺失约束"防止字段重复冲突，保证选取字段时无歧义。类比：信封上写"收件人：张三"，附页不能再出现第二个张三，否则邮局不知道送给谁。

这三点合在一起，使得 row polymorphism 不需要像 Java/C# 那样定义接口层次就能实现"只关心部分结构"的多态，而且类型推导仍然是完全自动的。

从形式化角度看，row 的语法为：`ρ ::= · | r | l : τ, ρ`——要么是空行 `·`，要么是一个行变量 `r`，要么是一个 label-type 对接上另一个 row。Record 类型 `{ ρ }` 只是把 row 包了一层外壳。统一两个 row 时，算法会"重写"行变量，把需要暴露的 label 提到前面——这就是 Rémy 论文里的 row rewriting 规则。

## 实践案例

### 案例 1：多态字段选取器

```ocaml
(* OCaml 对象类型展示 row variable 的效果 *)
let get_name obj = obj#name
(* 推导出的类型：< name : 'a; .. > -> 'a *)
(* .. 就是 row variable，表示"其余方法随便" *)

(* 两种不同的对象都能传入 *)
let _ = get_name (object method name = "Alice" method age = 30 end)
let _ = get_name (object method name = "Bob" method dept = "PL" end)
```

编译器推出 `get_name` 能接受任何拥有 `name` 方法的对象，不管它还有什么别的方法。这就是 row polymorphism 在 OCaml 里的日常呈现。你可以把它用在 `{ name = "Alice"; age = 30 }` 上，也可以用在 `{ name = "Bob"; dept = "PL" }` 上——行变量 `..` 分别被实例化为不同的"剩余方法集"。

### 案例 2：PureScript 中 record 作为函数参数

```purescript
getName :: forall r. { name :: String | r } -> String
getName rec = rec.name

-- 下面两个调用都合法：
getName { name: "Alice", age: 30 }
getName { name: "Bob", role: "dev", active: true }
```

`r` 是行变量，编译器自动推导出调用者传入的 record 可以有任意额外字段。无需定义接口、无需类型转换。对比 TypeScript 的做法：TS 虽然也能写 `{ name: string } & Record<string, unknown>`，但一旦加了 `Record<string, unknown>` 就丢失了精确字段追踪。Row polymorphism 不丢。

### 案例 3：record 扩展（添加字段）

```elm
-- Elm extensible record 语法
addZ : { a | x : Float, y : Float } -> { a | x : Float, y : Float, z : Float }
addZ point = { point | z = 0.0 }

-- 调用：
addZ { x = 1.0, y = 2.0, color = "red" }
-- 结果类型：{ x : Float, y : Float, z : Float, color : String }
```

行变量 `a` 保证了 `color` 字段不会在操作过程中丢失——"进来的额外字段，出去时原封不动"。这种"行保持"（row-preserving）性质是 row polymorphism 区别于子类型的关键优势：子类型系统里向上转型后，编译器就忘了多余字段的存在。

## 踩过的坑

1. **混淆 row polymorphism 和子类型**：row polymorphism 用等式统一、不丢信息；子类型用不等式、会丢"多余字段在哪"的信息。两者解决类似问题但机制完全不同。如果你在 TypeScript 里习惯了"宽类型可以赋值给窄类型"，切到 PureScript 时需要重新理解。

2. **忘记 lacks 约束导致字段冲突**：往一个已经有 `x` 字段的 record 再加 `x`，编译器会报错。初学者看到 "row does not lack label x" 的报错容易懵——根因是行变量已经包含了同名字段。解决办法是先 restrict（删掉旧字段）再 extend（加新字段）。

3. **以为行变量等于"任意类型"**：行变量 ρ 的 kind 是 Row，不是 Type。你不能把一个行变量放到需要普通类型的位置，它只能出现在 record 类型的"尾巴"处。

4. **record 拼接（concatenation）不在基本系统里**：Rémy 的原始系统支持选取、扩展、删除，但不支持把两个 record 直接合并。合并需要额外约束（两边字段不重名），后续工作才补上。要拼接两个 record，你得证明它们的 row 没有重叠字段——这在实际场景中比想象的更难。

5. **类型报错信息难读**：当 row 统一失败时，编译器报的往往是"某个 row 和另一个 row 不匹配"，夹杂大量行变量名。初学者需要学会从报错中找到"哪个字段缺了"或"哪个字段重了"。

## 适用 vs 不适用场景

**适用**：

- 函数只关心 record 的部分字段，其余透传（middleware、lens、管道、配置对象层层传递）
- 需要类型安全的"鸭子类型"又不想定义接口继承层次——structural typing 的精确版本
- effect 系统建模：把 effect 集合当作 row，用行变量表示"剩余未处理的 effect"
- 数据库 schema 演化：添加列后旧函数无需修改类型签名，行变量自动吸收新字段

**不适用**：

- 需要名义类型（nominal typing）区分同构但含义不同的 record——比如 `UserId` 和 `OrderId` 结构相同但语义不同
- 需要把两个来源不明的 record 合并——基本系统缺少完整的 concatenation 支持，需要证明两边无重名字段
- 运行时需要反射全部字段名——row polymorphism 是编译期抽象，运行时不保留行变量信息
- 语言本身不支持（Java / Go 的 struct 系统没有行变量概念，只能靠接口近似模拟）

## 历史小故事（可跳过）

- **1987**：Mitchell Wand 提出用类型变量表达 record 的"开放尾巴"，发表 "Complete Type Inference for Simple Objects"，但推导算法不完整
- **1989**：Didier Rémy 在 INRIA 发表本论文，给出完整的推导算法和主类型性证明，解决了 Wand 遗留的问题
- **1992**：Rémy 在 POPL 发表 "Typing Record Concatenation for Free"，补上了 record 合并操作
- **1995**：Rémy 的方案被融入 OCaml 的对象系统（`< method : type; .. >`），成为工业实践
- **2012**：PureScript 把 row polymorphism 作为 record 和 effect 的核心设计
- **2016**：Elm 采用简化版 extensible record，让前端开发者也能享受行多态
- **2019**：Dolan 等人在 POPL 发表新一代 row 系统研究，row polymorphism 仍是活跃方向

## 学到什么

- "多余字段"不是无法处理的噪音，而是可以被一个变量精确追踪的结构信息
- 等式统一比不等式子类型更容易做推导——HM 的解方程机制直接复用，不需要额外的宽度子类型规则
- 好的类型系统设计往往是做减法：Rémy 选择不要子类型，换来完整推导和主类型性（principal types）
- 同一个 row 机制既能建模 record 也能建模 effect（Koka、PureScript），说明抽象选对了就能一石多鸟
- row polymorphism 对工程的启示：好的抽象不是"能表达一切"，而是"刚好够用且能自动推导"

## 延伸阅读

- Rémy 1989 原论文 PDF：[INRIA RR-1431](https://inria.hal.science/inria-00075129v1/file/RR-1431.pdf)（约 20 页，前 10 页可读性不错）
- Rémy 后续工作：[Typing Record Concatenation for Free (POPL 1992)](https://pauillac.inria.fr/~remy/publications.html)——补上了 record 合并的类型规则
- Stephen Diehl 的 Typechecker Zoo Row Poly 章节：用 Haskell 实现可跑的推导器
- PureScript by Example 第 4 章：row polymorphism 实战（pattern matching + records）
- Elm Guide — Records 一节：extensible record 的用户侧体验，零门槛入门
- Cambridge L28 讲义 rows.pdf：形式化 row 的 kind 系统和 lacks 约束

## 关联

- [[hindley-milner]] —— row polymorphism 复用 HM 的统一算法做推导
- [[standard-ml]] —— ML 是 Rémy 扩展的宿主语言，但 SML 本身未采用 row 方案
- [[system-f-reynolds-1974]] —— row 变量是对 System F 类型变量的扩展（kind 从 Type 变成 Row）
- [[effect-handlers]] —— 现代 effect 系统用 row 表达"剩余 effect 集合"
- [[gradual-typing]] —— 另一种处理"部分已知类型"的思路，但走子类型路线
- [[gadt-pjones]] —— GADT 让构造子携带更精确的类型，和 row 互补增加表达力
- [[coeffect-petricek]] —— coeffect 用 row-like 结构追踪"需要多少上下文资源"
- [[local-type-inference]] —— 局部推导是 row polymorphism 在工程实现中常用的折中方案

---

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
