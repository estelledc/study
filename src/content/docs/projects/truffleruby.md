---
title: TruffleRuby — GraalVM 上的 Ruby
来源: https://github.com/oracle/truffleruby
日期: 2026-06-13
分类: 编译器
子分类: 语言运行时
provenance: pipeline-v3
---

# TruffleRuby — GraalVM 上的 Ruby

## 从生活场景理解

假设你有一辆丰田汽车（这叫 MRI Ruby，即 Ruby 的官方实现，C 语言写的，跑了几十年）。

现在有人造了一辆性能更强的车，发动机原理完全不同——它不用传统活塞，而是用一种叫 GraalVM 的新型引擎技术——但开起来还是 Toyota 的品牌、挂挡方式、方向盘位置完全一样。

TruffleRuby 就是这样一辆车：换了一种底层引擎实现，但 Ruby 代码不用改，照样能跑，而且跑得更快。

## 它是什么

TruffleRuby 是 Oracle 维护的一个 Ruby 实现，建立在 GraalVM 之上。

GraalVM 是 Oracle 的一个"多语言运行时平台"。你可以把它想象成一个万能翻译官：同一个房间里，说中文的、说英文的、说法语的人可以无障碍交流。GraalVM 让 Ruby、Java、Python、JavaScript、WebAssembly 等不同语言在同一进程内共存和互相调用。

TruffleRuby 就是这个平台上的"Ruby 翻译官 + 引擎"。

## 核心概念

### 概念 1：JIT 编译器

传统解释器是一行一行读代码、一行一行执行。JIT（Just-In-Time）编译器会在程序运行时，把经常跑到的代码"提前编译成机器码"，后续再跑直接执行机器码，不用每次都解释。

MRI 也有 JIT（从 Ruby 3.0 开始），但 TruffleRuby 的 JIT 能力更强——它在 GraalVM 的 Truffle 框架上构建了整套编译器优化基础设施。

### 概念 2：无全局解释器锁（GIL）

MRI Ruby 有一个"GIL"（Global Interpreter Lock），同一时刻只允许一个线程跑 Ruby 代码。这意味着多核 CPU 在 MRI 下只能用到一个核心来跑 Ruby。

TruffleRuby 没有 GIL，多个 Ruby 线程可以同时跑在不同核心上。只要你的 C 扩展也是线程安全的，就能充分利用多核。

### 概念 3：两种运行模式

TruffleRuby 有两套"包装"：

- **Native 模式**（默认）：用 LLVM 把代码编译成本地机器码。启动速度快，接近 MRI，峰值性能也不错。
- **JVM 模式**（`--jvm`）：运行在 Java 虚拟机上。启动稍慢、最终性能更强，而且跟 Java 互操作最顺畅。

### 概念 4：多语言互通（Polyglot）

这是 TruffleRuby 最独特也最核心的卖点：它可以在 Ruby 代码里直接调用 Python 代码、JavaScript 代码、Java 类，反之亦然。

### 概念 5：版本对齐

TruffleRuby 的版本号 `AB.C.D` 对应 CRuby `A.B`。比如 TruffleRuby 34.0.0 对标 CRuby 3.4。这样可以保持语义化版本控制。

## 代码示例

### 示例 1：基本 Ruby 代码

TruffleRuby 和 MRI 的 Ruby 代码 100% 兼容，下面是最基本的 Ruby：

```ruby
# 定义一个类
class Counter
  def initialize
    @count = 0
  end

  def increment
    @count += 1
    @count
  end
end

# 使用
counter = Counter.new
3.times { puts counter.increment }
# 输出:
# 1
# 2
# 3
```

这段代码在 MRI 和 TruffleRuby 上一模一样地运行。

### 示例 2：多线程并行计算（展示无 GIL 优势）

```ruby
require 'parallel'

# 定义一个计算密集型任务
def sum_of_squares(n)
  total = 0
  i = 1
  while i <= n
    total += i * i
    i += 1
  end
  total
end

# 在多个线程上同时运行
threads = 4.times.map do |i|
  Thread.new do
    result = sum_of_squares(10_000_000)
    puts "线程 #{i} 结果: #{result}"
  end
end

threads.each(&:join)
```

在 MRI 上，这四个线程仍然受 GIL 限制，同一时间只有一个真的在跑 CPU。在 TruffleRuby 上，这四个线程真正并行，充分利用多核。

### 示例 3：多语言互操作 — 在 Ruby 里调用 JavaScript

前提是安装 JVM 版本的 TruffleRuby 并装了 GraalVM 的 JavaScript 语言：

```ruby
require 'polyglot'

# 在 Ruby 里直接 eval 一段 JavaScript 代码
greet = Polyglot.eval("js", "function(name) { return 'Hello, ' + name + '!'; }")

# 把 Ruby 的字符串传给 JavaScript 函数
message = greet.call("Jason")
puts message  # 输出: Hello, Jason!
```

反过来，JavaScript 也可以用 Ruby 对象：

```ruby
ruby_greeting = "你好，世界！"
Polyglot.export("greeting", ruby_greeting)

js_result = Polyglot.eval("js", "greeting + ' 欢迎来到 TruffleRuby'")
puts js_result  # 输出: 你好，世界！ 欢迎来到 TruffleRuby
```

### 示例 4：访问 Java 类

```ruby
# 获取 Java 的 String 类
StringClass = Java.type('java.lang.String')

# 创建 Java 字符串
java_str = StringClass.new('Hello from Java!')

# 调用 Java 方法
puts java_str.length   # 输出: 16
puts java_str.toUpperCase  # 输出: HELLO FROM JAVA!

# 反过来，Ruby 对象也能传给 Java
java_list = Java.type('java.util.ArrayList').new
ruby_array = [1, 2, 3]
ruby_array.each { |n| java_list.add(n) }
puts java_list  # 输出: [1, 2, 3]
```

## 性能对比的直观理解

如果把 MRI Ruby 比作一辆家用轿车的日常驾驶表现：

- MRI：日常够用，但在 CPU 密集型计算（大量数学运算、循环）上比较慢
- TruffleRuby：在 yjit-bench 等基准测试中，TruffleRuby 远超 MRI、JRuby，是目前最快的 Ruby 实现
- 代价：需要"预热"（warmup），跑一段时间后才达到最佳性能，就像涡轮增压发动机需要转速上来才最有劲儿

## 安装方式

最推荐的方式是用 Ruby 版本管理器（rbenv、asdf、mise 等）：

```bash
# 使用 rbenv 安装 Native 版本
rbenv install truffleruby-34.0.0
rbenv global truffleruby-34.0.0

# 使用 rbenv 安装 JVM 版本（支持多语言）
rbenv install truffleruby+graalvm-34.0.0

# 验证
ruby --version
# => truffleruby 34.0.0 (graalvm 25.0.x, native, llvm 23.0.0-dev)
```

也可以用 Docker：

```bash
docker pull ghcr.io/truffleruby/truffleruby:latest
docker run --rm ghcr.io/truffleruby/truffleruby:latest ruby -e 'puts "Hello from TruffleRuby!"'
```

## 兼容性现状

- 通过约 98% 的 ruby/spec 测试，高于所有其他替代实现
- 能跑 Rails，支持大多数 gem（包括 C 扩展）
- 不完全兼容 CRuby 4.0（官方声明）
- 大多数场景下可以当作 MRI 的"无缝替换"

## 你需要知道的限制

- Native 版本不支持安装额外语言（如 JavaScript、Python 多语言互通），要用的话必须选 JVM 版本
- JVM 版本启动速度比 Native 和 MRI 都慢
- 部分 C 扩展可能需要适配
- 如果你只需要纯粹的 Ruby 运行环境、不在乎多语言互通，MRI + YJIT 可能更简单

## 总结

TruffleRuby 的核心价值一句话概括：**用完全不同的底层技术栈实现 Ruby，同时保持 Ruby 代码 100% 不变，带来更快的执行速度和多语言互通能力。**

| 特性 | MRI | TruffleRuby (Native) | TruffleRuby (JVM) |
|------|-----|---------------------|-------------------|
| 启动速度 | 最快 | 接近最快 | 较慢 |
| 峰值性能 | 中等 | 很高 | 最高 |
| 多线程 | 有 GIL 锁 | 无 GIL | 无 GIL |
| 多语言互通 | 无 | 有限 | 完整 |
| C 扩展兼容 | 完整 | 良好 | 良好 |
| ruby/spec 通过率 | 100% | ~98% | ~98% |

适合的场景：
- 计算密集型任务需要更高性能
- 需要 Ruby 和 Java / Python / JavaScript 混合编程
- 想在不改代码的情况下获得更快的 Ruby 运行速度
- CI/CD 中需要多线程并行执行 Ruby 测试
