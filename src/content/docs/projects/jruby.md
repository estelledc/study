---
title: JRuby — JVM 上的 Ruby
description: 在 Java 虚拟机上运行 Ruby，与 Java 互操作、真并行线程与 JVM 生态
来源: 'https://github.com/jruby/jruby'
日期: 2026-06-13
分类: 编译器
子分类: 语言运行时
provenance: pipeline-v3
---

## 是什么

**JRuby** 是 [jruby/jruby](https://github.com/jruby/jruby) 维护的 **Ruby 语言在 JVM（Java Virtual Machine）上的实现**。它不是「把 Ruby 语法翻译成 Java 源码再编译」，而是在 JVM 上实现完整的 Ruby 语义：解析 Ruby 代码、执行 Ruby 对象模型、加载 gem，同时让你能 **直接调用 Java 类库**，或把 JRuby **嵌入 Java 应用** 当脚本引擎。

日常类比：如果把 **CRuby（MRI）** 想成一辆 **自带发动机与底盘的整车**——Ruby 解释器、GC、线程模型全绑在一起，那 **JRuby** 更像把 **同一套 Ruby 驾驶舱** 装到 **JVM 这辆重型卡车的底盘** 上：

- **发动机换了**——不再用 MRI 的 C 解释器与 GIL（Global Interpreter Lock，全局解释器锁），而是跑在 HotSpot / OpenJ9 等 JVM 上，享受 JVM 的 **JIT 编译** 与 **多种 GC 算法**；
- **公路网换了**——你能直接开上 **Maven 仓库、Spring、JDBC、Kafka Java 客户端** 这条「Java 高速」，不必先找 Ruby 封装；
- **载客规则不同**——MRI 里 `Thread` 受 GIL 限制，CPU 密集时多线程难真并行；JRuby 的 Ruby 线程映射到 **原生 JVM 线程**，可真正并行（仍要注意 Ruby 对象自身的同步）；
- **外观仍是 Ruby**——`bundle install`、`rails server`、大部分 gem 在兼容范围内可以 **不改源码** 直接跑，这是 JRuby 与「Ruby 语法编译成 Java」路线最根本的差异。

JRuby 自 2001 年起步，2006 年起支撑 **Rails** 生产部署，是除 MRI 外 **部署最广的 Ruby 实现**。当前主线版本 **JRuby 9.4** 面向 **Ruby 3.1** 兼容（并持续向 3.4 推进）；**JRuby 10** 要求 **Java 17/21+**，目标完整 **Ruby 3.4** 与 Prism 解析器。运行 JRuby 需要 **JRE/JDK 21 或更高**（以官方 README 为准）。

## 为什么重要

不懂 JRuby，下面这些场景很难选型或排障：

- **为什么有的公司「Ruby on Rails + 巨量并发」选 JRuby**——要 JVM 级线程与成熟监控（JMX、VisualVM、async-profiler），又不想重写 Rails 业务
- **如何在 Java 企业系统里嵌 Ruby DSL**——用 `ScriptingContainer` 或 `require 'java'` 双向调用，比 JNI 手写胶水省得多
- **为什么某些 C 扩展 gem 在 JRuby 上装不上**——MRI 扩展直接摸 VM 内部 API；JRuby 需要 **Java 移植版** 或走 **FFI / Fiddle**
- **JRuby vs TruffleRuby vs CRuby**——JRuby 走「完整 Ruby + Java 互操作」；TruffleRuby 走 GraalVM 多语言 JIT；CRuby 走 C 生态与最新语言特性首发
- **启动慢、预热慢**——JVM 冷启动 + Ruby 解释层双重预热，是架构权衡，不是「JRuby 坏了」

一句话：**JRuby 让你用 Ruby 写逻辑，用 JVM 扛规模、接 Java 世界。**

## 核心概念

### 1. Ruby 实现谱系中的位置

| 实现 | 宿主 | 线程模型 | Java 互操作 | 典型场景 |
|------|------|----------|-------------|----------|
| **CRuby (MRI)** | 原生 C 运行时 | GIL，多进程常见 | 无（需 JNI 等） | 默认生态、最新特性 |
| **JRuby** | JVM | 真并行 Ruby 线程 | 一等公民 `require 'java'` | Rails on JVM、Java 嵌脚本 |
| **TruffleRuby** | GraalVM | 多线程 | Polyglot 互操作 | Graal 栈内多语言 |
| **mruby** | 嵌入 C | 单 VM 实例 | 无 | 固件、游戏脚本 |

JRuby 的定位是 **「Ruby 实现优先，JVM 语言其次」**：兼容性、gem、Rails 行为先于「像不像 Java」。

### 2. 执行管线：从 .rb 到 JVM 字节码

```
Ruby 源码 (.rb)
    → 解析器（C 移植版 / Prism）
    → JRuby AST / IR
    → 解释执行（前期）
    → JIT：热点方法编译为 JVM bytecode
    → HotSpot C2 / JIT 再优化为机器码
```

- **invokedynamic（indy）**：JRuby 大量使用 JDK 7+ 的 `invokedynamic` 做动态派发，让 JVM 能内联、去虚化 Ruby 方法调用
- **无 GIL**：多个 Ruby 线程可同时执行 Ruby 代码；共享可变状态仍需 `Mutex`、`java.util.concurrent` 等同步
- **预热曲线**：冷启动时「Ruby 解释 → JVM 解释 → 逐步 JIT」，峰值性能往往出现在运行一段时间后

### 3. Java 集成：`require 'java'`

在 Ruby 文件顶部 `require 'java'` 后，可：

- 用 `java_import` 简化类名
- 直接 `Java::java.util.ArrayList.new`
- 实现 Java 接口：Ruby 块可 **proc-to-interface** 转成 `Runnable`、`Callable` 等
- 在 Java 侧用 `org.jruby.Ruby` / `ScriptingContainer` 嵌入 JRuby

包名前缀 `java`、`javax`、`org`、`com` 在集成上下文中自动解析，无需逐个 import。

### 4. 扩展与原生库：JNR 与 FFI

MRI 生态大量 **C 扩展**（`.so` / `.bundle`）。JRuby **不能** 直接加载针对 MRI 编译的扩展，而依赖：

- **纯 Ruby gem**——通常可直接运行
- **Java 实现的替代 gem**（如 jruby-openssl）
- **FFI / Fiddle**——通过 **JNR（Java Native Runtime）** 调 C 库，比传统 JNI 胶水更可控
- **扩展移植**——维护者为 JRuby 写 Java 版扩展

选型 gem 时先查 [JRuby wiki 兼容性列表](https://github.com/jruby/jruby/wiki) 或 gem 说明里的 `java` platform。

### 5. 部署与工具链

| 方式 | 说明 |
|------|------|
| `jruby` / `jirb` | 类似 `ruby` / `irb` 的 CLI |
| `gem` / `bundle` | 与 MRI 相同的包管理体验（部分 native gem 除外） |
| WAR 部署 | `warbler` 等把 Rails 打成 servlet 容器可部署的 WAR |
| Docker / SDKMAN / rbenv | 官方与社区安装渠道 |
| Maven / Gradle | Java 项目依赖 `org.jruby:jruby-complete` 嵌入 |

### 6. 版本与 Java 基线（2024–2026）

- **JRuby 9.4.x**：Ruby 3.1 兼容，Java 8+，维护至 EOL 过渡期
- **JRuby 10.x**：Ruby 3.4、Prism 解析器、**Java 17 或 21 最低**，利用 Loom 虚拟线程、Panama FFI、Leyden/CRaC 等现代 JVM 特性

升级前核对：**目标 Ruby 版本、JDK 版本、关键 gem 的 Java 平台支持**。

## 代码示例

### 示例 1：在 JRuby 里调用 Java 标准库

下面脚本演示 `require 'java'`、`java_import`、以及 Ruby 与 Java 类型之间的自动转换（`java.lang.String` ↔ Ruby `String`）：

```ruby
# hello_java.rb — 用 jruby hello_java.rb 运行
require 'java'

java_import 'java.util.ArrayList'
java_import 'java.lang.System'

list = ArrayList.new
%w[JRuby JVM Ruby].each { |word| list.add(word) }

puts "JVM: #{System.getProperty('java.version')}"
puts "列表大小: #{list.size}"

list.each do |item|
  puts "- #{item} (#{item.class})"
end

# 静态方法
System.out.println('来自 java.lang.System 的 println')
```

预期行为：在终端看到 JVM 版本、列表元素及类型信息。`list` 在 Ruby 里像普通对象一样用，底层是 **真正的 `java.util.ArrayList`**，可传给任何接受 `List` 的 Java API。

### 示例 2：Ruby 块实现 Java 接口（嵌入与并发）

JRuby 支持把 **Ruby Proc 转成 Java 函数式接口**，适合 `ExecutorService`、Swing 监听器、回调等：

```ruby
require 'java'
java_import 'java.util.concurrent.Executors'
java_import 'java.util.concurrent.TimeUnit'

pool = Executors.newFixedThreadPool(3)

3.times do |i|
  # 块 → java.lang.Runnable
  pool.submit do
    thread_name = java.lang.Thread.currentThread.getName
    puts "[#{thread_name}] task #{i} on JRuby #{JRUBY_VERSION}"
  end
end

pool.shutdown
pool.awaitTermination(5, TimeUnit::SECONDS)
puts 'done'
```

要点：

- `JRUBY_VERSION` 是 JRuby 提供的常量
- 多个任务可 **并行** 执行（取决于 JVM 线程调度），无 MRI 式 GIL 串行化
- 在 Java 应用里可用 `ScriptingContainer` 加载同一段 Ruby，无需改业务逻辑

### 示例 3（可选）：Java 嵌入 JRuby 的骨架

在 Java 侧（需 `jruby-complete` 等依赖），典型嵌入模式如下——便于理解「谁宿主、谁脚本」：

```java
import org.jruby.Ruby;
import org.jruby.RubyRuntimeAdapter;
import org.jruby.javasupport.JavaEmbedUtils;

public class EmbedJRuby {
    public static void main(String[] args) {
        Ruby runtime = JavaEmbedUtils.initialize(new String[] {});
        RubyRuntimeAdapter adapter = new RubyRuntimeAdapter(runtime);
        Object result = adapter.eval(runtime.getCurrentContext(), "40 + 2");
        System.out.println("Ruby says: " + result);
        JavaEmbedUtils.terminate(runtime);
    }
}
```

Ruby 是「客人」，JVM 进程是「主人」；与示例 1、2 中 JRuby 作为进程入口相反，但互操作机制相同。

## 与 CRuby 的差异清单

| 主题 | CRuby | JRuby |
|------|-------|-------|
| 解释器 | C + YARV 字节码 | JVM + JIT |
| 并行 | GIL 限制 CPU 并行 | 原生线程并行 |
| `fork` | 常用（Unicorn 等） | **不支持**；用线程/进程池替代 |
| C 扩展 | 直接加载 | 需 Java 版或 FFI |
| 信号处理 | Unix 信号惯用 | JVM 语义，差异需注意 |
| 启动速度 | 通常更快 | JVM 冷启动较慢 |
| 峰值吞吐 | IO 友好 | 长运行、JIT 预热后常有优势 |

迁移 Rails 应用到 JRuby 时，重点排查：**依赖 C 扩展的 gem、`fork` 架构、不可移植的 `ObjectSpace` 黑魔法**。

## 常见坑与排障

1. **gem 安装失败**——看是否只有 `extconf.rb` 的 C 扩展；搜 `jruby-*` 替代或 `platform: java` 变体
2. **`LoadError: cannot load such file -- openssl`**——使用 `gem install jruby-openssl` 或 Bundler 的 java 平台锁文件
3. **内存看起来比 MRI 大**——JVM 堆 + Ruby 堆双层；用 `-Xmx`、JMX 观察，勿与 MRI RSS 直接比
4. **部署用 Unicorn（fork）**——改用 **Puma 多线程**、TorqueBox、或 WAR + 应用服务器
5. **字符编码**——JRuby 在 JVM 上统一走 Java 字符模型；与 CRuby 3.x 默认行为大多一致，边界 case 查 issue

## 学习路径建议

1. **安装**：JDK 21+ → [jruby.org/download](https://www.jruby.org/download) 或 `sdk install jruby`
2. **验证**：`jruby -v`、`jruby -S irb`，跑通示例 1
3. **读 wiki**：[CallingJavaFromJRuby](https://github.com/jruby/jruby/wiki/CallingJavaFromJRuby)、[Getting Started](https://github.com/jruby/jruby/wiki/Getting-started)
4. **互操作**：在一个小 Rails 或 Sinatra 项目里加一个 Java JDBC 调用
5. **对比**：同一 CPU 密集脚本在 `ruby` 与 `jruby` 下用 `time` 与线程数对比（理解预热）

## 和本仓库其他笔记的关系

- **[mruby](./mruby.md)**：嵌入式、裁剪 Ruby，无 JVM
- **[pypy](./pypy.md)**：另一门动态语言（Python）的 JIT 实现，问题域类似而生态不同
- **[graalvm](./graalvm.md)** / **TruffleRuby**：同在 JVM 上，但 JIT 与互操作模型不同
- **[openjdk](./openjdk.md)**：JRuby 的底层运行时

## 小结

| 要点 | 一句话 |
|------|--------|
| 本质 | JVM 上的完整 Ruby 实现，不是 Ruby→Java 源码翻译器 |
| 核心价值 | Java 互操作 + 真线程 + JVM 工具链与部署 |
| 代价 | 冷启动、预热、C 扩展生态与 `fork` 缺失 |
| 上手 | `require 'java'` + `jruby` CLI，与 MRI 体验接近 |

JRuby 适合 **已有 JVM 投资、需要 Ruby 表达力或 Rails 资产** 的团队。若你只需「语法像 Ruby 的 JVM 语言」，那是别的路线；若你要 **「我的 .rb 和 gem 尽量不动，但跑在 JVM 上」**，JRuby 仍是经过二十年生产验证的默认答案。
