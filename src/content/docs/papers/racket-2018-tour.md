---
title: The Racket Manifesto — 零基础学习笔记
来源: https://www.cs.utah.edu/plt/publications/snapl15-fffkbmt.pdf
日期: 2026-06-13
分类: 编程语言
子分类: 类型与 PL 理论
provenance: pipeline-v3
---

# The Racket Manifesto — 零基础学习笔记

## 一、为什么要学 Racket？

想象一下，你正在学做菜。大多数编程语言就像「预制菜」——厨师（语言设计者）已经帮你把菜谱定好了，你只能照着做：煎、炒、炖、煮，不能改。

Racket 的理念完全不同。它说：**你为什么不自己发明一道新菜？**

Racket 不只是一个编程语言，它是一个「编程语言工厂」。你可以在 Racket 里创造一种全新的语言，让它看起来和用起来都像 Racket 天生就支持的一样。

这就是 The Racket Manifesto 的核心主张：**编程语言不应该是一成不变的，而应该是可以组合、可以扩展的库。**

## 二、核心概念

### 1. 语言即库（Languages as Libraries）

这是整个宣言最重要的概念。

在大多数语言里，语法是硬编码的。你想加一个 `for-each` 循环？对不起，得等语言设计者更新编译器。

但在 Racket 里，语法可以通过「宏」（macro）系统来扩展。宏不是简单的文本替换，而是一种**编译时的程序**。你可以写一段代码，这段代码在编译时运行，生成新的代码结构。

类比：宏就像是乐高积木的说明书。你可以用现有的积木块拼出全新的形状，而不仅仅是说明书上画的那几种。

### 2. 卫生宏（Hygienic Macros）

Racket 的宏系统是「卫生」的。什么意思？

想象你在写一个宏，定义了一个变量叫 `temp`。如果这个宏被用在其他地方，恰好也有一个 `temp` 变量，会不会冲突？卫生宏保证不会。它会自动给变量加上唯一的「标签」，就像给每个人发不同编号的工牌。

### 3. `#lang` 指令

Racket 用 `#lang` 来决定一个文件用什么语言来运行。这看起来简单，但威力巨大。

```racket
#lang racket
```

上面这行告诉 Racket：用标准的 Racket 语言来运行这个文件。

但你可以换成：

```racket
#lang typed/racket
```

这就变成了「有类型检查的 Racket」。或者：

```racket
#lang lazy
```

这就变成了「惰性求值的 Racket」。

甚至，你可以写：

```racket
#lang my-custom-language
```

然后 Racket 就会去找一个叫 `my-custom-language` 的语言定义来运行你的代码。**这意味着你可以完全自定义一门语言。**

### 4. 契约系统（Contracts）

Racket 有一个独特的功能叫「契约」。你可以给函数加上「合同」，规定输入必须是什么类型、输出必须满足什么条件。如果有人违反了合同，Racket 会立刻报错并告诉你谁违约了。

类比：契约就像快递的保价服务。寄件人承诺包裹完好，收件人承诺及时签收。任何一方违约，系统都知道责任在哪一方。

## 三、代码示例

### 示例 1：最简单的 Racket 程序

```racket
#lang racket

;; 计算阶乘
(define (factorial n)
  (if (zero? n)
      1
      (* n (factorial (- n 1)))))

;; 调用并打印结果
(displayln (factorial 5))
;; 输出: 120
```

这段代码展示了 Racket 的基本语法：

- `#lang racket` 声明使用标准 Racket 语言
- `define` 用来定义函数
- `if` 是条件表达式，格式为 `(if 条件 真值 假值)`
- 所有表达式都用括号包围，这是 Lisp 家族的标志性语法
- `displayln` 用来打印输出

理解要点：Racket 没有 `return` 关键字。每个函数最后表达式的值就是返回值。

### 示例 2：用宏创建一个新的控制结构

这是最能体现 Racket 威力的例子。我们来自己造一个 `unless` 语句：

```racket
#lang racket

;; 定义一个宏：unless（除非...否则...）
(define-syntax unless
  (syntax-rules ()
    [(_ condition body ...)
     (if (not condition)
         (begin body ...))]))

;; 使用我们刚创造的 unless
(unless (> 5 10)
  (displayln "5 不大于 10，所以执行这里"))

;; 输出: 5 不大于 10，所以执行这里
```

解释：

- `define-syntax` 定义了名为 `unless` 的新语法
- `syntax-rules` 是宏的模式匹配规则
- `[(_ condition body ...)]` 表示匹配 `unless` 后面跟一个条件和任意数量的 body 代码
- `(if (not condition) (begin body ...))` 表示：如果条件为假，就执行 body 里的所有代码

通过这个宏，我们创造了一个 Racket 原本没有的关键字！而且它看起来和用起来就像内置的一样。

### 示例 3：带类型检查的 Typed Racket

```racket
#lang typed/racket

;; 定义一个有类型的阶乘函数
(: fact (Integer -> Integer))
(define (fact n : Integer) : Integer
  (if (zero? n)
      1
      (* n (fact (- n 1)))))

;; 调用
(displayln (fact 6))
;; 输出: 720
```

Typed Racket 允许你在需要的地方加上类型注解。它不是像 Java 那样要求所有变量都有类型，而是「渐进式」的——你可以只给关键函数加类型，其余代码保持动态类型。

## 四、Racket 的实际应用

| 应用场景 | 说明 |
|---------|------|
| 计算机科学教育 | ProgramByDesign 项目用 Racket 教高中生编程 |
| 领域特定语言 | 可以用 Racket 快速创建专门解决某个问题的语言 |
| Web 开发 | Hacker News 网站就是用 Arc（基于 Racket）写的 |
| 游戏脚本 | Naughty Dog（《最后生还者》开发商）用 Racket 做游戏脚本语言 |
| 文档生成 | Scribble 是 Racket 自带的文档系统，用代码写文档 |

## 五、关键人物

The Racket Manifesto 的作者团队包括：

- **Matthias Felleisen** — PLT Inc. 创始人，Racket 项目的核心推动者
- **Matthew Flatt** — Racket 核心系统的长期维护者
- **Robert Bruce Findler** — 契约系统和类型系统的贡献者
- **Shriram Krishnamurthi** — 编程语言教育和宏系统研究者
- **Eli Barzilay** — Lazy Racket 和 Scribble 的创建者
- **Jay McCarthy** — 模块系统和包管理器的设计者
- **Sam Tobin-Hochstadt** — Typed Racket 的主要作者

## 六、学习建议

1. **先安装 Racket**：去 racket-lang.org 下载安装，它会同时安装 DrRacket IDE
2. **从 DrRacket 开始**：它有一个「语言级别」功能，可以逐步解锁更高级的特性，非常适合零基础
3. **不要怕括号**：Lisp 家族的括号看起来吓人，但它们是语法的一部分，就像中文的标点符号一样自然
4. **动手写宏**：当你掌握了基本语法后，试着写一个简单的宏，比如 `when`（当...时执行），你会感受到 Racket 的真正力量

## 七、一句话总结

Racket 不是一个让你「写程序」的语言，它是一个让你「设计语言」的平台。它的哲学是：如果你想要的功能不在语言里，那就自己造一个。
