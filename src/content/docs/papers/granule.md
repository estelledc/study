---
title: Granule — 让类型系统同时数次数、看安全级、追副作用
来源: 'Orchard, Liepelt & Eades III, "Quantitative Program Reasoning with Graded Modal Types", ICFP 2019'
日期: 2026-05-30
分类: 编程语言
难度: 高级
---

## 是什么

Granule 是一门函数式语言，它的类型系统会在每个值的类型上**贴一张数字标签**，告诉你这个值会被用几次、在哪种安全等级、跑过哪些副作用。日常类比：像快递面单——同一个包裹除了"是什么"，还要写"称几公斤、保不保密、要不要冷藏"，每条信息独立但都印在同一张单上。

你写：

```granule
foo : Int [2] -> Int
foo [x] = x + x
```

类型 `Int [2]` 读作"一个会被用 2 次的整数"。`x` 在函数体里用了 2 次，类型检查通过；如果只写 `x` 或写 `x + x + x` 都会报错。

把"2"换成`Public` / `Private`就是信息流；换成`{Read, Write}`就是副作用集。一种类型机制，多种属性。

## 为什么重要

不理解 graded modal types，下面这些事都没法解释：

- 为什么线性类型、信息流、effect tracking 看起来都"很像"，但每个语言都要重造一遍
- 为什么 Rust 的"借用 / 移动"和差分隐私的"敏感度"看起来风马牛不相及，却都能用 graded / quantitative types 统一刻画
- 为什么 Idris、F\* 这些依赖类型语言开始引入 grade / quantity 字段
- 为什么类型系统能从"对不对"演进到"对多少"

## 核心要点

Granule 的核心是 **graded modal type `[r]A`**，可以拆成 3 步理解：

1. **modal 是个套子**：`[r]A` 不是 A，是"被装在一个标记 r 的盒子里的 A"。类比：礼物盒上贴标签，标签独立于礼物内容。

2. **r 来自一个半环**：r 不能乱取，必须属于某个**半环**（semiring）。别被名字吓到——就是一套带两种运算的标签规则：用 ℕ 就能数次数；用 {Public ≤ Private} 安全格就能查泄露；用 effect 集合就能追副作用。

3. **类型检查靠半环算术**：接回快递面单——**加法 = 两条路合并标签**（if 两边各用一次 → 合计 1+1）；**乘法 = 嵌套使用把次数叠乘**（外层调用把内层用量乘上去）。SMT 求解器 Z3 在背后帮你解这些约束。

三步合起来：换个半环就换一种属性追踪，**底层类型规则不变**。

## 实践案例

### 案例 1：用 ℕ 半环数变量被用了几次

```granule
dup : forall a . a [2] -> (a, a)
dup [x] = (x, x)
```

**逐部分解释**：

- `a [2]` 表示"必须用 2 次的 a"
- 函数体把 `x` 放进二元组的两个位置——刚好用 2 次
- 写成 `(x, x, x)`（用 3 次）或 `(x, 0)`（用 1 次）都过不了类型检查

类比：你借了 2 张电影票，必须用且只能用 2 次。

### 案例 2：用安全格做信息流追踪

```granule
hash : String [Private] -> String [Public]
-- 类型检查器拒绝这个签名：Private 不能悄悄降成 Public
```

把 Private 数据"降级"成 Public 是不允许的（除非显式声明 declassify）。

```granule
-- stdout 通常视为 Public 通道：把 Private 字符串直接 putStr 出去会被拒
leak : String [Private] -> () <{IO}>
leak [s] = putStr s   -- 拒绝：高密级流向低密级通道

-- 只有显式 declassify（或接收端也是 Private）才放行
```

`{Public, Private}` 是一个偏序半环，类型系统拒绝把高密级流向低密级。这就是编译期的信息流控制。

### 案例 3：用 effect 半环跟踪副作用集

```granule
readFile : String -> String <{Read}>
writeFile : String -> () <{Write}>

copy : String -> () <{Read, Write}>
copy path = let s = readFile path in writeFile s
```

**解释**：

- `<{Read}>` 表示这个函数走读副作用
- `copy` 调用了两个函数，effect 集**自动并起来**变成 `{Read, Write}`
- 比 Haskell 的单一 `IO` monad 精细得多——你能在类型上看到"这函数到底碰了什么"

## 踩过的坑

1. **选错半环就废**：用 ℕ 想做信息流不行，用安全格想数次数也不行。半环要先选对，全套类型规则才能对接得上。

2. **grade 推断不完全自动**：简单情况 SMT 能解，但复杂多态、嵌套高阶函数时常需手动标 grade，不像 HM 那样几乎全自动。

3. **没法直接用现有库**：Granule 是研究语言，不能 import Haskell / OCaml 库。所有依赖要重写成带 grade 的版本，这是阻挡工程落地的最大墙。

4. **表达力 vs 可判定的拉扯**：半环越精细（比如带依赖类型的 grade），SMT 越可能解不动甚至不可判定。学术上漂亮，工程上要权衡。

## 适用 vs 不适用场景

**适用**：

- 资源敏感场景（嵌入式、加密协议）——精确数读写次数
- 信息流安全（医疗、金融数据流）——编译期防泄露
- effect tracking 研究和教学——比传统 monad 更细
- 想统一多种类型扩展的研究语言设计

**不适用**：

- 工业项目当主语言——库生态空白
- 全自动类型推断需求——需要手标 grade
- 性能敏感的快速编译场景——SMT 调用慢
- 不熟悉半环 / 范畴语言的团队——学习曲线陡

## 历史小故事（可跳过）

- **2014 年**：Petricek、Orchard、Mycroft 提出 [[coeffect-petricek]]，把"上下文需求"作为类型一等公民——这是 graded 思想的种子。
- **同 2014 年**：Brunel 等人独立提出 dℓPCF，用半环跟踪复杂度——另一条线索。
- **2017 年前后**：研究者意识到 coeffect / linear / effect / 信息流其实是同一个数学结构（graded comonad）的不同实例。
- **2019 年**：Orchard、Liepelt、Eades III 把这个洞见落成完整语言 Granule 并在 ICFP 发表。
- **2020 年后**：Idris 2、Agda、Rust 借鉴 quantity / grade，graded 思想从论文走入主流语言设计讨论。

## 学到什么

1. **类型系统能从"对不对"升到"对多少"**——这是过去十年最重要的扩展方向之一
2. **半环是个朴素但强力的抽象**：一个加法 + 一个乘法 + 几条公理，就把使用次数 / 安全等级 / 副作用统一了
3. **统一比新颖更难**：发明第 N 种 effect tracking 容易，把已有的 N 种放进同一个框架才是真贡献
4. **研究语言的现实代价**：哪怕设计完美，没有库生态就没有用户，工程化和学术贡献是两件事

## 延伸阅读

- 论文 PDF：[ICFP 2019](https://dl.acm.org/doi/10.1145/3341714)（核心 12 页 + 附录）
- Granule 项目主页：[granule-project.github.io](https://granule-project.github.io/)（含 tutorial、安装、实例）
- 视频讲解：[Dominic Orchard ICFP 2019 talk](https://www.youtube.com/watch?v=hrgTQ0u-d5Y)（30 分钟把 graded 讲清楚）
- [[coeffect-petricek]] —— graded 思想的最早期源头
- [[linear-types]] —— graded 的特殊情况，r 只有 1 / ω
- [[frank-effects]] —— effect tracking 的另一条思路对比

## 关联

- [[coeffect-petricek]] —— 上下文需求作为一等公民，graded modal 的直接前身
- [[linear-types]] —— graded 在 r∈{1,ω} 退化时就是线性类型
- [[frank-effects]] —— effect handler 视角下追踪副作用的另一条路
- [[effect]] —— 工业 TS 库里 effect tracking 的实践版本
- [[bidirectional-typing]] —— Granule 实现采用双向类型检查作为推断骨架
- [[idris-brady]] —— 依赖类型语言中也引入了 quantity（grade 思想的工业落地）
- [[hindley-milner]] —— graded 在 grade=trivial 时退化为传统 HM

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
