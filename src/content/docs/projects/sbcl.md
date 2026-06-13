---
title: "SBCL 零基础学习笔记 — Steel Bank Common Lisp"
来源: https://github.com/sbcl/sbcl
日期: 2026-06-13
分类: 编译器
子分类: 语言运行时
provenance: pipeline-v3
---

# SBCL — Steel Bank Common Lisp

## 一、它是什么？一句话类比

想象你在写程序。大多数语言（比如 Python）像是"现场翻译"：你每说一句话，解释器就当场翻译执行。而 SBCL 像是一个工厂里的质检员——它先把你写的代码"编译"成机器能直接跑的二进制指令，然后再执行。编译后运行，速度比解释执行快很多。

SBCL（Steel Bank Common Lisp）是目前最流行、性能最好的 Common Lisp 编译器。它是开源的，遵循宽松许可证，从 1990 年代的 CMUCL 项目演化而来。SBCL 支持 Linux、macOS、Windows、BSD 等多个平台，最新版本 2.6.5 发布于 2026 年 5 月。

## 二、Common Lisp 是什么？

Lisp 是 1958 年诞生的第二古老编程语言（仅次于 Fortran），以"代码即数据"的独特哲学闻名。Common Lisp 是 Lisp 的一个标准化版本（ANSI X3.226-1994），统一了多种 Lisp 方言，提供了完整的工业级语言特性：

-  garbage collection（垃圾回收，自动管理内存）
-  first-class functions（函数是一等公民，可以像数字一样传递）
-  macros（宏系统，可以在编译时修改代码本身）
-  CLOS（Common Lisp Object System，完整的面向对象系统）
-  REPL（交互式开发环境，边写边跑边调试）

## 三、SBCL 的核心特性

### 1. 编译器而非解释器

SBCL 本质上是一个"编译器优先"的实现。当你输入 `(eval 1+1)` 时，它实际上先调用 `compile` 把代码编译成函数，再调用 `funcall` 执行。这使得 `functionp` 和 `compiled-function-p` 在默认配置下基本等价。

### 2. 强大的开发工具链

SBCL 自带一整套开发者工具：
- 交互式调试器（Debugger）
- 统计分析型 Profiler（`sb-sprof`）
- 精确到函数的 Profiler（`sb-profile`）
- 代码覆盖率工具（`sb-cover`）
- 原生多线程支持

### 3. 可导出为独立可执行文件

通过 `sb-ext:save-lisp-and-die`，SBCL 可以把当前运行状态连同 SBCL 运行时一起打包成一个独立的二进制文件，直接分发给没有 Lisp 环境的用户。

### 4. FFI（外部函数接口）

通过 `sb-alien` 包，SBCL 可以直接调用 C 语言函数、加载共享库（.so/.dll），这让它能桥接庞大的 C 生态。

## 四、代码示例

### 示例 1：Hello World + REPL 交互

打开终端，输入 `sbcl` 进入 SBCL 的交互式环境（REPL），然后一行一行输入：

```lisp
;; 定义一个简单的函数，计算阶乘
(defun factorial (n)
  (if (<= n 1)
      1
      (* n (factorial (- n 1)))))

;; 调用它
(factorial 10)
;; => 3628800

;; 定义一个带格式的打印函数
(defun greet (name)
  (format t "Hello, ~A! Welcome to SBCL.~%" name))

(greet "Jason")
;; 输出: Hello, Jason! Welcome to SBCL.
```

**解读**：
- `defun` 用来定义命名函数。括号里的 `n` 是参数名。
- `if` 是最基本的条件判断：条件满足时执行第一个分支，否则执行第二个。
- `*` 是乘法，`-` 是减法——Lisp 的数学运算符都是函数。
- `format` 的 `t` 表示输出到标准输出，`~A` 是占位符，会被后面的参数替换。
- `;` 后面是注释，类似很多语言的 `#`。

### 示例 2：用 SBCL 的特色——宏（Macro）

宏是 Common Lisp 最强大的特性之一。它允许你在编译时"生成代码"。先看一个日常类比：宏就像是在你写食谱之前，先让一个助手帮你把重复的步骤自动化写出来。

```lisp
;; 定义一个宏：when-let，当变量有值时才执行某段代码
(defmacro when-let ((var value) &body body)
  `(if ,value
       (let ((,var ,value))
         ,@body)
       nil))

;; 使用这个宏
(when-let (x (find 5 '(1 2 3 4 5 6)))
  (format t "Found: ~A~%" x))
;; 输出: Found: 5

;; 如果找不到，就不执行 body
(when-let (x (find 99 '(1 2 3)))
  (format t "This won't print.~%"))
```

**解读**：
- `defmacro` 定义的是"代码生成器"，而不是普通函数。它接收的是**未求值的代码**（符号和列表本身）。
- `` ` ``（反引号）表示"模板"，`,` 表示"在这里插入求值结果"，`,@` 表示"展开后面的列表"。
- 上例中，`find 5 '(1 2 3 4 5 6)` 在编译时被宏展开为 `if` 条件判断，如果找到值就绑定到 `x` 再执行 body。
- 这相当于在代码跑起来之前就"写好了代码"，是 Lisp 元编程的核心。

### 示例 3：使用 SBCL 的统计 Profiler

```lisp
;; 加载 profiler 模块
(require 'sb-sprof)

;; 定义一个稍重的计算
(defun fibonacci (n)
  (if (< n 2)
      n
      (+ (fibonacci (- n 1))
         (fibonacci (- n 2)))))

;; 开始统计
(sb-sprof:with-profiling (:report :summary)
  (fibonacci 30))

;; 输出类似：
;; Total seconds (minimum-accuracy) ... 0.842000
;; GC count: 1
;; %   Total   Self   Name
;; 90.0  0.758  0.758  FIBONACCI
;; 10.0  0.084  0.084  CONS
;; ...
```

**解读**：
- `require` 加载 SBCL 的可选模块，`sb-sprof` 是统计分析型性能分析器。
- `with-profiling` 包裹你要分析的代码。
- `:report :summary` 让 profiler 在结束后输出一个汇总表。
- 从输出可以看到 `FIBONACCI` 函数占了 90% 的时间——这对优化代码位置很有帮助。

## 五、SBCL 与其他语言的关系

| 对比维度 | SBCL | Python | JavaScript (V8) | Rust |
|---------|------|--------|----------------|------|
| 类型系统 | 动态类型（有类型声明优化） | 动态类型 | 动态类型（编译时优化） | 静态类型 |
| 内存管理 | 自动生成回收（GC） | GC | GC | 无 GC（所有权系统） |
| 编译方式 | AOT 编译（提前编译为机器码） | 字节码解释 | JIT 编译 | AOT 编译 |
| 运行速度 | 接近 C（经过优化） | 较慢 | 快 | 最快 |
| 开发方式 | 交互式 REPL 为主 | 交互式 REPL 为主 | Node 交互式 | 编译-运行循环 |
| 宏系统 | 真正的代码生成宏 | 无 | 无 | 过程宏 |

## 六、如何安装

### macOS（使用 Homebrew）

```bash
brew install sbcl
```

安装后在终端输入 `sbcl` 即可进入交互式环境。

### 从源码编译

```bash
# 下载源码
wget https://sourceforge.net/projects/sbcl/files/sbcl/2.6.5/sbcl-2.6.5-source.tar.bz2
tar -xjf sbcl-2.6.5-source.tar.bz2
cd sbcl-2.6.5

# 编译（需要 C 编译器）
sh make.sh

# 安装
sh install.sh
```

编译需要 `gcc` 或 `clang` 以及 `make` 工具。

## 七、学习路径建议

1. **先熟悉 REPL**——在 SBCL 中一行一行试，像做实验一样
2. **掌握基本语法**——`defun`、`let`、`if`、`format`、列表操作
3. **理解函数式编程思维**——函数是一等公民，列表是核心数据结构
4. **学习 CLOS 面向对象**——多重分派（multiple dispatch）是 Lisp 独有的
5. **探索宏系统**——这是 Lisp 的"杀手级特性"
6. **使用 SLIME**——Emacs + SLIME 是 SBCL 的黄金搭档开发环境

## 八、关键术语速查

| 术语 | 含义 |
|-----|------|
| REPL | 读-求值-输出循环，交互式编程环境 |
| S-表达式 | Lisp 的基本语法单位，用括号表示的树形结构 |
| 词法作用域 | 变量的作用域由代码的书写位置决定 |
| 动态作用域 | 变量的作用域由调用链决定（Common Lisp 中特殊变量 `*foo*`） |
| FASL | SBCL 的字节码文件格式，用于保存编译后的代码 |
| Core image | SBCL 的内存快照，保存后可快速重启 |
| ASDF | SBCL 社区的事实标准包管理系统 |

## 九、总结

SBCL 不是"又一个新语言"，而是 Lisp 家族中工业级、高性能的代表。它的核心竞争力在于：

1. **速度快**——接近 C 的编译性能
2. **交互强**——REPL 驱动的即时开发体验
3. **元编程强**——宏系统让你能在编译时操作代码本身
4. **工具全**——调试器、Profiler、覆盖率分析器一应俱全
5. **生态稳**——从 1990 年代延续至今，社区成熟

学习 SBCL 最大的挑战不是语法（S 表达式可能让人不习惯），而是思维方式从"命令式编程"转向"函数式 + 元编程"。一旦跨过去，你会看到一个完全不同的编程世界。
