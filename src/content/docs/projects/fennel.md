---
title: Fennel — 编译到 Lua 的 Lisp
来源: https://github.com/bakpakin/Fennel
日期: 2026-06-13
分类: 编译器
子分类: 语言运行时
provenance: pipeline-v3
---

# Fennel — 编译到 Lua 的 Lisp

## 什么是 Fennel？

想象一下，你手里有一把瑞士军刀（Lua），它小巧、轻便、到处都能用。但你觉得每次打开不同的刀片都很麻烦，不如有一把"一键弹出"的刀来得爽快。

Fennel 做的事情就是这样：它给了 Lua 一套 Lisp 风格的语法外壳。你写的是 Lisp 风格的代码（括号包裹、前缀表达式），但编译器在后台把它翻译成 Lua 代码来运行。

说白了，Fennel = Lisp 语法 + Lua 引擎。

## 为什么要搞这个？

Lua 本身是一门非常简洁的语言，但它的语法有几个让人头疼的地方：

- 写函数要 `function` 关键字，写 `if` 后面不能直接取值
- 循环和迭代需要记住各种库函数名
- 代码读起来像"命令列表"，不容易表达"数据管道"

Lisp 的解决方案很优雅：代码就是数据，括号包裹一切，表达式有返回值。Fennel 把这套理念搬到了 Lua 上，同时保持了 Lua 零运行时开销的特点——编译出来的 Lua 代码和手写的几乎一样快。

## 核心概念

### 1. 一切都在括号里

Lisp 最著名的特征就是括号语法。在 Fennel 里：

- `()` 括号：调用函数，就像其他语言写 `func(a, b)`
- `{}` 花括号：键值对字典（对应 Lua 的 table）
- `[]` 方括号：有序列表（对应 Lua 的数组）

```fennel
;; 其他语言写：print("hello")
;; Fennel 写：
(print "hello")

;; 其他语言写：result = a + b
;; Fennel 写（前缀表达式）：
(+ a b)

;; 嵌套调用也一目了然：
(print (+ 1 2))
;; 先算 (+ 1 2) 得到 3，再打印 3
```

### 2. 定义函数

用 `fn` 关键字。参数列表用方括号包裹，函数体内最后一个表达式的值就是返回值。

```fennel
(fn greet [name]
  (print "hello" name))
```

### 3. 局部变量

用 `let` 引入局部作用域的变量。

```fennel
(let [x 10
      y 20]
  (+ x y))
;; -> 30
```

## 代码示例

### 示例一：基础数据操作

这段代码展示了 Fennel 处理数据的基本方式——定义数据结构、函数、局部变量和条件判断。

```fennel
(fn describe-animal [animal]
  "根据动物类型返回描述"
  (let [kind (animal :kind)
        name (animal :name)]
    (if (= kind :cat)
        (.. name "是一只可爱的猫")
        (= kind :dog)
        (.. name "是一只忠诚的狗")
        (.. name "是一只未知的动物 " kind))))

(local my-cat {:name "小白" :kind :cat})
(describe-animal my-cat)
;; -> "小白是一只可爱的猫"
```

这里可以看到几个关键模式：

- `{}` 定义字典，`:` 前缀表示键是字符串
- `animal :kind` 用 `.` 语法访问字典字段
- `if` 接受多组条件-返回值对，最后一组充当 `else`
- `..` 是字符串拼接运算符

### 示例二：迭代和数据处理

Fennel 提供了强大的迭代和数据处理能力。`icollect` 可以过滤和转换列表中的元素。

```fennel
;; 定义一个学生数据列表
(local students [
  {:name "小明" :grade 85 :subject :math}
  {:name "小红" :grade 92 :subject :math}
  {:name "小刚" :grade 60 :subject :english}
  {:name "小丽" :grade 78 :subject :english}
])

;; 用 icollect 筛选数学成绩及格的学生
(local math-pass
  (icollect [_ student (ipairs students)]
    (if (and (= (: student :subject) :math)
             (> (: student :grade) 60))
        (: student :name))))

(print math-pass)
;; -> ["小明" "小红"]

;; 计算某科目的平均分
(fn avg-grade [subject students]
  (accumulate [total 0 count 0
               student students]
    (if (= (: student :subject) subject)
        (values (+ total (: student :grade)) (+ count 1))
        (values total count))))

;; 注意 accumulate 返回的是累积值本身
;; 上面的写法需要稍作调整，实际使用如下：
(fn avg-grade [subject students]
  (let [[total count]
        (accumulate [sum 0 cnt 0
                     student students]
          (if (= (: student :subject) subject)
              (values (+ sum (: student :grade)) (+ cnt 1))
              (values sum cnt)))]
    (if (= count 0)
        0
        (/ total count))))

(print (avg-grade :math students))
;; -> 88.5
```

`icollect` 类似于其他语言中的 `filter` + `map`：遍历列表，如果 body 返回 `nil` 就跳过该项，否则加入结果列表。`accumulate` 则类似 `reduce`/`fold`，逐步累积一个值。

### 示例三：模式匹配

Fennel 支持模式匹配，这是 Lisp 系语言的强项。

```fennel
(local result [1 "hello" 3.14])

(case result
  [1 a b] (print "整数开头" a b)
  [x y z] (print "三个值:" x y z)
  _ (print "不匹配"))
;; -> 整数开头 hello 3.14
```

第一个模式 `[1 a b]` 会匹配以 `1` 开头的三元组，并把第二、第三项绑定到 `a` 和 `b`。

## 与 Lua 的关系

这是理解 Fennel 最关键的一点：**Fennel 编译出的 Lua 代码和手写的一样高效**。

你可以从 Fennel 直接调用任何 Lua 库，也可以从 Lua 中调用 Fennel 编写的函数。两者互相透明。这意味着你不需要"从零开始"，可以直接利用 Lua 生态中已有的丰富库和工具。

| 特性 | Fennel | Lua |
|------|--------|-----|
| 语法 | Lisp 括号风格 | C 风格 |
| 运行环境 | 编译为 Lua，在 Lua 虚拟机运行 | 原生 Lua |
| 性能 | 零额外开销，与手写 Lua 相同 | 原生 |
| 大小 | 编译器本身仅一个文件 | 语言本身 |
| 模块系统 | 共享 Lua 的 `require` | `require` |

## 总结

Fennel 的核心价值可以用一句话概括：用 Lisp 的简洁语法写代码，用 Lua 的广泛部署来运行。

它适合以下场景：
- 想用 Lisp 风格但需要部署到 Lua 生态（游戏引擎、Nginx 等）
- 需要写宏或元编程
- 喜欢表达式编程，希望代码有返回值
- 追求极致轻量（编译后的代码可以小到 300KB）

Fennel 的设计哲学很明确：不要有运行时开销，不要引入新虚拟机，就做一个"语法糖编译器"。这种克制反而让它成为 Lisp 家族中最务实的存在之一。
