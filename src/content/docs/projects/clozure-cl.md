---
title: Clozure CL — 苹果系 Common Lisp
来源: https://github.com/Clozure/ccl
日期: 2026-06-13
分类_原始: 编程语言
分类: 编译器
子分类: 语言运行时
provenance: pipeline-v3
---

# Clozure CL — 苹果系 Common Lisp

## 一、CCL 是什么？

Clozure CL（简称 CCL）是一套免费的 Common Lisp 实现。它最早源自 1990 年代 Apple 公司开发的 Macintosh Common Lisp（MCL），1998 年从 MCL 分支出来，最初叫 OpenMCL，后来改名为 Clozure CL。

为什么叫"苹果系"？因为它和 Apple 的渊源极深。MCL 是 Apple 在 1980 年代末为 Mac 写的 Lisp 系统，后来在 Apple 内部被用来开发了一些早期软件。分支出来后，Clozure Associates 公司继续开发它，并把它打造成了一套运行在 macOS、Linux、FreeBSD 和 Windows 上的高性能 Lisp 实现。

## 二、日常类比

把 Clozure CL 想象成一栋大楼：

- **Lisp Kernel（Lisp 内核）** 是大楼的钢筋混凝土框架和电梯——最底层的支撑结构，负责内存分配、垃圾回收、异常处理这些"体力活"。它是用 C 语言和汇编写的。
- **Heap Image（堆镜像）** 是大楼里已经装修好、摆好家具的楼层——包含了所有已编译好的 Lisp 代码、库函数、运行环境。它像一个压缩过的存档文件，启动时直接被"加载到内存里"。

启动 Clozure CL 的过程就是：先启动内核（框架和电梯），再把堆镜像映射进内存，一切就绪，你就能看到 `?` 提示符，开始写代码了。

## 三、核心特点

1. **极快的编译速度** — CCL 的编译器几乎在"实时"工作，你写完代码，它立刻变成机器码
2. **原生多线程** — 每个线程都是操作系统级别的，能自动分配到多核 CPU 上运行
3. **精准的垃圾回收** — 分代回收器（generational GC），新创建的对象放在"新生代"，回收速度快到毫秒级
4. **C 语言互操作** — 强大的 FFI（Foreign Function Interface），可以从 Lisp 里直接调用 C 函数
5. **macOS Cocoa 集成** — 在 Mac 上能用 Lisp 直接调用 Objective-C 和 Cocoa 框架
6. **自举编译** — CCL 本身就是用 Lisp 写的，可以用一个已有的 CCL 来编译自己

## 四、安装和运行

在 macOS 上，你下载解压后会有一个 `ccl` 目录，里面有可执行文件 `dx86cl64`（64 位 Intel Mac）或 `dx64cl` 等。

```bash
$ ccl
```

或者直接用平台特定的可执行文件：

```bash
$ ./dx86cl64
```

启动后会看到类似这样的提示符：

```
?
```

这就是 REPL（读取-求值-输出循环），你可以在这里直接输入 Lisp 表达式，按回车就会得到结果。

## 五、Lisp 基础语法速览

Common Lisp 的所有代码都写成"表达式"，格式是：

```
(函数名 参数1 参数2 参数3)
```

整个程序就是"套括号"。别怕，我们下面用代码来感受。

## 六、代码示例

### 示例 1：定义和使用函数

Lisp 里定义函数用 `defun`，它的格式是：

```lisp
(defun 函数名 (参数列表)
  "文档字符串（可选的描述）"
  函数体...)
```

来看一个实际的例子：

```lisp
;; 定义一个计算阶乘的递归函数
(defun factorial (n)
  "计算 n 的阶乘，即 1*2*3*...*n"
  (if (<= n 1)
      1
      (* n (factorial (1- n)))))

;; 调用函数
(factorial 5)
;; => 120

(factorial 10)
;; => 3628800
```

这里 `(factorial 5)` 的执行过程是：

```
(factorial 5)
  => (* 5 (factorial 4))
    => (* 5 (* 4 (factorial 3)))
      => (* 5 (* 4 (* 3 (factorial 2))))
        => (* 5 (* 4 (* 3 (* 2 (factorial 1)))))
          => (* 5 (* 4 (* 3 (* 2 1))))
            => 120
```

### 示例 2：多线程

CCL 最亮眼的特性之一就是原生线程支持。下面这段代码展示了如何创建和使用线程：

```lisp
;; 创建一个线程，让它执行一个简单任务
(let ((thread (bt:make-thread
               (lambda ()
                 (dotimes (i 5)
                   (format t "线程说: 你好 ~A~%" i)
                   (sleep 1))
                 "任务完成！"))))

  ;; 主线程继续做别的事
  (format t "主线程已启动工作线程: ~A~%" thread)

  ;; 等待线程结束并获取结果
  (bt:join-thread thread))
;; => "任务完成！"
```

`bt:make-thread` 来自 Boron Threads 库（CCL 自带的多线程库），`bt:join-thread` 用来等线程跑完。

### 示例 3：调用 C 语言函数（FFI）

CCL 的 FFI 让你可以从 Lisp 直接调用系统库中的 C 函数：

```lisp
;; 调用 C 语言的 strlen 函数
(require 'cffi)

;; 用 CFFI 声明并调用 C 函数
(cffi:defcfun ("strlen" c-strlen) :uint
  (s :string))

(c-strlen "Hello, Clozure CL!")
;; => 18

;; 调用 C 的数学库函数 sqrt
(cffi:defcfun ("sqrt" c-sqrt) :double-float
  (x :double-float))

(c-sqrt 2.0)
;; => 1.4142135623730951
```

### 示例 4：使用 CLOS（面向对象系统）

Common Lisp 有一个叫 CLOS 的面向对象系统，比 Java 的类系统强大得多：

```lisp
;; 定义一个类
(defclass person ()
  ((name :initarg :name :accessor person-name)
   (age :initarg :age :accessor person-age)))

;; 创建实例
(make-instance 'person :name "小明" :age 25)

;; 定义一个通用的方法
(defgeneric greet (person)
  (:documentation "打招呼"))

(defmethod greet ((p person))
  (format t "你好，我是 ~A，今年 ~A 岁~%"
          (person-name p)
          (person-age p)))

;; 调用
(greet (make-instance 'person :name "小红" :age 22))
;; => 你好，我是小红，今年 22 岁
```

## 七、CCL 独有的亮点

### 1. 应用保存（save-application）

CCL 允许你把当前整个 Lisp 环境（所有代码、数据、状态）打包成一个独立的可执行文件：

```lisp
(ccl:save-application "my-app"
                      :server t
                      :prepend-kernel t)
```

生成的 `my-app` 就是一个独立的程序，不需要额外安装 Lisp 就能运行。这在构建 Lisp 服务器应用时非常有用。

### 2. 代码覆盖（Code Coverage）

CCL 内置了代码覆盖检测功能，可以可视化地看到哪些代码被执行了、哪些没有：

```lisp
(ccl:start-code-coverage)
;; 运行你的代码...
(ccl:stop-code-coverage)
(ccl:display-code-coverage)
```

### 3. 内存映射文件

CCL 支持将文件直接映射到 Lisp 向量，无需先将文件内容读入内存，适合处理大文件：

```lisp
;; 将文件映射为只读向量
(let* ((vec (map-file-to-ivector "/path/to/bigfile" :int)))
  (svref vec 0))  ;; 直接读取文件内容，零拷贝
```

## 八、学习建议

1. **从 REPL 开始** — 不要急着写文件，直接在 `?` 提示符下尝试每一个概念
2. **多练习"套括号"** — 初期括号数错了是常态，Lisp 的编辑器（如 CCL 自带的 Cocoa IDE 或 Emacs + SLIME）能帮你自动匹配
3. **理解函数式思维** — Lisp 鼓励用递归而非循环，用不可变数据而非修改状态
4. **利用 CCL 的 FFI** — 你可以用 Lisp 快速写脚本，同时调用现成的 C 库，这是 Lisp 的巨大优势

## 九、社区和资源

- 源码仓库：https://github.com/Clozure/ccl（GitHub Stars 900+）
- 官网：http://ccl.clozure.com/
- 邮件列表：ccl-devel@clozure.com
- IRC 频道：#ccl on libera.chat
- 最新版本：1.13（2024 年 8 月发布）
- 许可证：Apache License 2.0
