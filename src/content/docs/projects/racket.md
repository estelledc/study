---
title: Racket — 教学与研究双优的 Scheme 后裔
来源: https://github.com/racket/racket
日期: 2026-06-13
分类: 编译器
子分类: 语言运行时
provenance: pipeline-v3
---

# Racket — 教学与研究双优的 Scheme 后裔

## 什么是 Racket？

想象一下，你走进一家餐厅。大多数编程语言像是"固定菜单"——厨师给你什么你就吃什么。但 Racket 是一家"你可以自己开厨房"的餐厅：它不仅让你做菜，还允许你重新设计厨房、发明新的厨具、甚至创造全新的菜系。

Racket 是一门从 Scheme 家族演化而来的通用编程语言。它诞生于 20 世纪 80 年代末，由 Matthew Flatt 等人领导开发，如今已成长为拥有 5200+ GitHub Star 的成熟项目。它最特别的地方在于：它同时服务于两个看似矛盾的目标——**教学**（让零基础的人学会编程）和**研究**（让语言学家探索全新的语言设计）。

## 为什么 Racket 能同时做好这两件事？

### 教学端：从"画图"到"写网页"，循序渐进

Racket 家族里有一门叫 **BSL（Beginner Student Language）** 的语言，专门为中学生和大学生初学者设计。它移除了所有让人困惑的概念（比如递归、高阶函数），让学生从最基本的函数调用开始，逐步建立编程直觉。然后他们可以用 Racket 画动画、做游戏，在乐趣中自然过渡到更复杂的语言层级。

### 研究端：语言可以像乐高一样搭建

Racket 有一个被称为"面向领域的语言编程"（Domain-Specific Language Oriented Programming）的能力。你不需要安装任何额外工具，打开一个编辑器窗口，几行代码就能定义一门全新的语言。这门新语言可以有自己的语法、关键字、缩进规则，然后立刻在新窗口里用它写代码。

这就是 Racket 的核心武器：**宏系统（Macro System）**。它不是简单的文本替换，而是直接在代码的结构（语法树）上做手术。

## 核心概念

### 1. 代码即数据：S 表达式

Lisp 家族最著名的特征是"S 表达式"（S-expression），也叫"括号表示法"。在其他语言里，代码长这样：

```javascript
if (x > 0) {
  return x * 2;
}
```

在 Racket 里，同样的逻辑是：

```racket
(if (> x 0)
    (* x 2)
    0)
```

看起来全是括号，对吧？但请想一下：这其实是一种非常**均匀**的表达方式。每个操作都是"函数名 + 参数"的模式，嵌套只是多套了几层括号。就像俄罗斯套娃，每一层都是一个完整的"东西"。

为什么这很重要？因为在这种表示法下，**代码本身就是一种数据结构**。你可以用编写数据的同样方式来编写、转换和操作代码。这就是 Racket 宏系统的根基。

### 2. `#lang`：语言切换器

Racket 的每一段代码都以 `#lang` 开头，声明"这段代码用什么语言来理解"。默认是 `#lang racket`，但你可以换成：

- `#lang typed/racket` — 带类型检查的版本
- `#lang sicp` — 配合经典教材《计算机程序的构造和解释》
- `#lang web-server` — 写网页服务器
- 或者你自己定义的任何语言

这就像是给同一段身体换上不同的大脑。

### 3. 函数是一等公民

在 Racket 里，函数和其他数据类型（数字、字符串、列表）没有区别。你可以：

- 把函数当作参数传给另一个函数
- 让函数返回另一个函数
- 把函数存在变量里

这在学术上叫"高阶函数"（Higher-Order Functions），听起来很高深，其实用起来很直观。

### 4. 模式匹配：像拼图一样匹配数据

Racket 提供了强大的模式匹配功能。你可以描述"我想要什么样的数据形状"，然后直接提取其中的各个部分。这比传统的 `if-else` 层层判断清晰得多。

## 代码示例

### 示例 1：基础语法与函数

这是最基础的 Racket 代码，展示了变量定义、函数定义、条件判断和递归：

```racket
#lang racket

;; 定义一个变量
(define greeting "Hello, Racket!")
(displayln greeting)

;; 定义一个函数：计算阶乘
(define (factorial n)
  (if (<= n 1)
      1
      (* n (factorial (- n 1)))))

;; 调用函数
(displayln (factorial 5))  ; 输出: 120
(displayln (factorial 10)) ; 输出: 3628800

;; 函数可以赋值给变量
(define double (lambda (x) (* x 2)))
(displayln (double 21))    ; 输出: 42

;; 匿名函数也可以直接用
((lambda (x y) (+ x y)) 3 4)  ; 输出: 7
```

逐行拆解：

- `(define greeting "...")` — 定义一个变量并赋值。注意 `define` 在最外层，后面跟着变量名和内容。
- `(define (factorial n) ...)` — 定义一个名为 `factorial` 的函数，参数是 `n`。函数体里的 `if` 是条件判断：如果 `n <= 1` 就返回 1（递归终止条件），否则返回 `n` 乘以 `factorial` 的自身调用（递归步骤）。
- `(displayln ...)` — 打印内容到屏幕并换行。
- `(lambda (x) ...)` — 创建一个匿名函数（没有名字的函数）。`lambda` 是 Lisp 家族中表示"匿名函数"的关键词，源自数学中的 λ 演算。

### 示例 2：列表操作与高阶函数

Racket 的列表操作是函数式编程的典型场景。我们用高阶函数来处理数据，而不是写循环：

```racket
#lang racket

;; 定义一个学生列表（每个元素是一个关联列表，模拟对象）
(define students
  '((name . "Alice")   (score . 95) (grade . "A"))
   ((name . "Bob")     (score . 72) (grade . "C"))
   ((name . "Carol")   (score . 88) (grade . "B"))
   ((name . "Dave")    (score . 91) (grade . "A"))
   ((name . "Eve")     (score . 65) (grade . "D"))))

;; 用 filter 筛选出及格的学生
(define passed
  (filter (lambda (student)
            (>= (assoc-ref student 'score) 60))
          students))

(displayln "=== 及格的学生 ===")
(for ([s passed])
  (displayln (assoc-ref s 'name)))

;; 用 map 提取所有分数
(define all-scores
  (map (lambda (student)
         (assoc-ref student 'score))
       students))
(displayln (string-append "所有分数: " (string-join (map number->string all-scores) ", ")))

;; 用 fold 计算平均分
(define total
  (foldl + 0 all-scores))
(define average (/ total (length all-scores)))
(displayln (string-append "平均分: " (number->string average)))

;; 用 for/list 生成一个新列表：成绩等级表
(define grade-report
  (for/list ([s students]
             #:when (>= (assoc-ref s 'score) 80))
    (string-append (assoc-ref s 'name) " -> " (assoc-ref s 'grade))))
(displayln "=== 优秀成绩单 ===")
(for-each displayln grade-report)
```

这段代码展示了四个核心高阶函数：

| 函数 | 作用 | 类比 |
|------|------|------|
| `filter` | 从列表中挑出符合条件的元素 | 筛子里漏掉小的，留下大的 |
| `map` | 对列表每个元素做变换 | 工厂传送带，每个产品经过同一个加工站 |
| `foldl` | 从左到右累积合并列表 | 滚雪球，越滚越大 |
| `for/list` | 用声明式语法生成新列表 | 菜谱，告诉你"选哪些食材、做什么菜" |

### 示例 3：自定义语言（宏的力量）

这是 Racket 最令人兴奋的功能——定义你自己的语言。下面创建了一个简单的"数学表达式"语言：

```racket
#lang racket

;; 导入宏系统工具
(require (for-syntax syntax/parse))

;; 定义一个新语法：times 相当于 *
(define-syntax (times stx)
  (syntax-parse stx
    [(_ a b) #'(* a b)]))

;; 现在可以用 times 了
(displayln (times 6 7))  ; 输出: 42

;; 再定义一个：say 相当于 displayln
(define-syntax (say stx)
  (syntax-parse stx
    [(_ msg) #'(displayln msg)]))

(say "Hello from my custom syntax!")
```

这只是一个微小的例子。在实际项目中，Racket 程序员用它创建了：

- `typed/racket` — 带类型系统的 Racket（论文发表于 ICFP 2012）
- `datalog` — 逻辑查询语言（类似 SQL 但用规则推导）
- `scribble` — 文档标记语言（Racket 自己的文档就是用这个写的）
- `web/server` — 网页服务器框架

所有这些都不是 Racket 内核的一部分，而是以**包（package）**的形式存在，用宏系统实现。

## 生态系统概览

Racket 的生态可以用"小而全"来形容：

- **DrRacket IDE** — 自带的交互式开发环境，有语法高亮、错误提示、代码折叠，还有独特的"箭头追踪"功能：鼠标悬停在变量上，它会画出箭头指向定义处
- **raco 命令行工具** — 包管理器、构建工具、代码格式化器，一条命令搞定
- **包仓库** — 数千个第三方包，涵盖 Web 开发、数据库、数学、图形、教育软件等
- **跨平台 GUI** — 内置图形界面工具箱，一套代码跑 Windows / macOS / Linux
- **打包发布** — 可以把程序打包成独立的可执行文件，分发给没有安装 Racket 的用户

## 与其他 Scheme 方言的比较

| 特性 | Racket | Scheme (R7RS) | Clojure |
|------|--------|---------------|---------|
| 语法 | 类 Lisp 括号 | 类 Lisp 括号 | 类 Lisp 括号 |
| 宏系统 | 语法级宏（极其强大） | 有限宏 | 宏系统 |
| 类型系统 | 渐进式类型（Typed Racket） | 无 | 动态类型 |
| 并发模型 | 轻量级进程（纤程） | 无标准 | 软件事务内存 |
| 主要用途 | 教学 + 语言研究 | 嵌入式 + 学术 | Web + 并发 |
| 包管理 | raco pkg | 无统一标准 | Leiningen |

Racket 的独特之处在于它把"语言工程"变成了普通程序员也能使用的工具。其他语言社区往往认为"造一门新语言"是顶级专家的事，但在 Racket 里，这是入门课程的一部分。

## 学习路线建议

对于零基础学习者，推荐的顺序是：

1. 下载 Racket（官网 download.racket-lang.org），安装后打开 DrRacket
2. 选择 `BSL`（Beginner Student Language）开始，只学最基本的函数和条件
3. 完成《How to Design Programs》（htdp）的前几章，这本书是全球多所大学采用的教材
4. 切换到 `#lang racket`，学习列表操作、递归、高阶函数
5. 尝试写一个小项目：命令行计算器、猜数字游戏、待办事项列表
6. 进阶：了解宏系统和自定义语言

## 总结

Racket 不是一门"用来找工作"的语言，而是一门**用来理解编程本质**的语言。它像一面镜子，照出了其他语言中那些"理所当然"的设计选择背后的原因。当你学会了用 Racket 的视角看世界，再回到 JavaScript、Python 或 Java 时，你会看到以前看不到的结构和可能性。

正如 Racket 的设计者所说："Racket 不是另一种编程语言，它是编程语言家族的集合。"
