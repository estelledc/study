---
title: Racket v9.2 Release 学习笔记
来源: https://blog.racket-lang.org/2026/05/racket-v9-2.html
日期: 2026-06-13
分类: 编程语言
子分类: 类型与 PL 理论
provenance: pipeline-v3
---

# Racket v9.2 Release 学习笔记

## 一、什么是 Racket？

想象一下，你有一盒乐高积木。大多数编程语言像是给你一套固定形状的积木——长方形的、正方形的，你只能用这些形状来搭建东西。

Racket 不一样。它给你的是一套"可以自定义形状的积木"。你可以发明属于自己的积木形状，然后用来搭建任何东西。这就是 Racket 最核心的理念：**语言导向编程**（Language-Oriented Programming）——你不是在"使用"一种语言写程序，而是在"设计"一种语言来解决你的问题。

Racket 属于 Lisp/Scheme 家族，它的代码长得像这样：

```racket
(+ 1 2 3)
```

看起来奇怪对吧？这其实就是在做 1+2+3。在 Racket 里，所有的操作都是"先写运算符，再写操作数"。就像你说"加法：1、2、3"而不是"1 加 2 加 3"。

## 二、Racket v9.2 是什么？

Racket v9.2 于 2026 年 5 月 27 日发布，由 Stephen De Gabrielle 和 John Clements 牵头。这是一个包含多项修复和改进的版本，主要关注以下几个方面：

- 模式匹配（match）的严格化
- Typed Racket 的类型系统改进
- Unicode 17.0 支持
- 底层语法形式的扩展
- 大量文档和小修复

## 三、核心概念与代码示例

### 3.1 模式匹配（match）—— 更严格的检查

**类比：** 想象你在玩拼图。以前，如果你把同一块拼图标记为"A"用了两次，即使两块拼图的形状不一样，系统也不会提醒你。v9.2 之后，系统会仔细检查——如果同一个变量名出现了两次，那它们代表的部分必须真的相同。

**什么是"非线性模式"？** 当一个变量在模式中出现多次时，就叫非线性模式。比如你想匹配一个列表，要求第一个元素和最后一个元素相同：

```racket
#lang racket

;; 旧版本可能不会检查这两处是否真的相等
(match '(1 2 3 1)
  [(list x _ _ x) (displayln "首尾相同！")]
  [_ (displayln "首尾不同")])
;; 输出: 首尾相同！

;; v9.2 会拒绝这种不一致的模式
(match '(1 2 3 4)
  [(list x _ _ x) (displayln "首尾相同！")]
  [_ (displayln "首尾不同")])
;; 输出: 首尾不同
```

v9.2 还增加了一个重要规则：如果一个变量在模式中有的地方和 `...`（表示"重复"）一起用，有的地方不用，这种混合用法会被拒绝。这防止了非常隐蔽的 bug。

### 3.2 Typed Racket —— 数学函数的类型安全

**类比：** 想象你在做三角函数计算。`asin`（反正弦）和 `acos`（反余弦）这两个函数，输入值如果在 -1 到 1 之间，结果是实数；但如果输入超出这个范围，结果会变成复数（包含虚部的数）。之前的 Typed Racket 没有正确处理这种情况，可能导致类型错误。

v9.2 修复了这个问题：

```racket
#lang typed/racket

;; asin 和 acos 现在能正确处理复数结果
(define (safe-asin [x : Float]) : (U Float Complex)
  (asin x))

;; 正常情况：输入 0.5，得到实数
(safe-asin 0.5)
;; => 0.5235987755982989

;; 超出范围：输入 2.0，得到复数（v9.2 之前这里类型不安全）
(safe-asin 2.0)
;; => 1.5707963267948966 + 1.3169578969248166i

;; acos 同理
(define (safe-acos [x : Float]) : (U Float Complex)
  (acos x))

(safe-acos 2.0)
;; => 0.0 + 1.3169578969248166i
```

这个修复意味着：如果你的代码依赖 `asin`/`acos` 的类型信息来做优化，v9.2 可能会在编译时发现之前被忽略的问题并报错——这是好事，因为它帮你提前发现了隐患。

### 3.3 #%foreign-inline —— 底层外部访问

Racket v9.2 引入了一个新的核心语法形式 `#%foreign-inline`，它提供了一种"不安全"的方式来访问 Racket 实现底层（linklet 层）的功能。

**类比：** 这就像给你的程序开了一个后门，可以直接访问操作系统级别的资源。平时不建议用，但在写高性能库或者需要调用底层 C 代码时会很有用。

```racket
#lang racket

;; #%foreign-inline 是一个底层语法形式
;; 通常不直接在普通代码中使用
;; 它主要用于 Racket 实现者和库作者

;; 举个简化的例子，展示其意图：
;; 通过 #%foreign-inline 可以直接访问 linklet 层提供的功能
;; 这比普通的 FFI（外部函数接口）更高效，但也更危险

;; 如果你在处理所有核心语法形式的代码（比如编译器、宏系统），
;; 需要更新以识别这个新的语法形式。
```

### 3.4 terminal-file-position —— 终端字节计数

v9.2 新增了一个实用函数 `terminal-file-position`，它可以统计写入到终端端口（如 `stdin` 和 `stderr`）的字节数。

```racket
#lang racket

;; 这个函数可以追踪写入终端的字节数量
;; 对于需要精确控制输出量的场景很有用

;; 例如，在一个日志系统中，你可能想统计总共输出了多少字节：
(define (log-message msg)
  (define before (terminal-file-position (current-error-port)))
  (fprintf (current-error-port) "[LOG] ~a~n" msg)
  (define after (terminal-file-position (current-error-port)))
  (printf "本次输出 ~a 字节~n" (- after before)))

(log-message "Hello, Racket v9.2!")
;; 本次输出 20 字节（具体数字取决于消息长度）
```

### 3.5 其他值得注意的变化

| 变化 | 说明 |
|------|------|
| Unicode 17.0 | 字符和字符串操作现在支持最新的 Unicode 标准 |
| 交叉阶段持久模块 | 允许更多类型的 `quote`d 数据跨模块共享 |
| 内部实现重写 | `member`、`memw`、`when`、`unless`、`let/ec`、`cond` 改用 `racket/kernel` 语法实现 |
| impersonator 增强 | 新增 `impersonator-property-predicate-procedure?` 函数 |
| Typed Racket 打印 | 多态结构体类型现在用类型参数打印，如 `(Array Byte)`，不再暴露内部表示 |
| Stepper 数字显示 | 步进器的数字显示更好地匹配语言设置 |
| Scribble 移动端适配 | 非手册样式的文档默认 `initial-scale` 为 1.0；窄屏下边注默认内联显示 |
| Big-bang 修复 | .dmg 分发的 Big-bang 程序现在正确处理 `close-on-stop` 特性 |

## 四、升级注意事项

v9.2 有几个**可能导致现有代码不再编译**的变化：

1. **match 的严格化** — 如果你使用了非线性的 `...` 模式，且匹配的值部分不相等，现在会报错
2. **Typed Racket 的 asin/acos** — 如果你的代码依赖之前不安全的类型信息，编译时可能会报错

如果你升级后遇到编译错误，检查是否涉及上述两处。大多数普通代码不受影响。

## 五、总结

Racket v9.2 是一个以"修复和加固"为主的版本。它没有带来翻天覆地的新功能，但解决了几个关键问题：

- 模式匹配更安全了
- 类型系统更严谨了
- 底层访问能力更强了
- Unicode 和文档体验更好了

对于初学者来说，这意味着你的 Racket 代码会更少出现隐蔽的 bug。对于高级用户来说，`#%foreign-inline` 和 FFI2 的内部支持为未来更强大的底层交互打下了基础。

如果你想了解更多，官方社区在 [Discourse](https://racket.discourse.group/invites/VxkBcXY7yL) 和 [Discord](https://discord.gg/6Zq8sH5) 上都很活跃。
