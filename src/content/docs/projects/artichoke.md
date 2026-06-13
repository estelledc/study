---
title: Artichoke — 用 Rust 写的 Ruby 实现
来源: https://github.com/artichoke/artichoke
日期: 2026-06-13
分类: 编译器
子分类: 语言运行时
provenance: pipeline-v3
---

# Artichoke — 用 Rust 写的 Ruby 实现

## 一、从"换引擎的汽车"说起

想象你有一辆汽车，它的品牌标志上写着"Ruby"。大多数时候，我们开的 Ruby 车用的是 MRI（Matz's Ruby Interpreter）引擎——这是 Ruby 发明者 Matz 亲自打造的原厂引擎。

Artichoke 做的事情很简单：**把同一辆 Ruby 车的引擎拆下来，换成另一群人用 Rust 重新造的引擎**。车身外观（你写的 Ruby 代码）完全不变，但内部动力来源完全不同了。

这个项目由 Ryan Lopopelo 发起，在 GitHub 上获得了超过 3000 颗星星，代码 91.5% 是 Rust，剩下 7.9% 是 Ruby。它已经归档（2025 年 11 月），但作为一个"用另一种语言重新造一个语言运行时"的实验，非常值得学习。

## 二、为什么要造一个"新引擎"？

MRI 引擎运行得不错，但它有几个历史包袱：

1. **GIL（全局解释器锁）**：MRI 同一时间只能用一个 CPU 核心跑代码，多核电脑白白浪费。
2. **部署麻烦**：要在服务器上跑 Ruby，你得先装 Ruby 环境，像搬家要先搬家具一样。
3. **WebAssembly 不支持**：你想让 Ruby 在浏览器里跑？MRI 做不到。

Rust 语言的几个特性恰好能解决这些问题：内存安全、没有 GC 停顿、能编译成 WebAssembly、天生支持多线程。Artichoke 就是想看看，用 Rust 重造 Ruby 引擎能带来什么。

## 三、核心架构：三层楼的房子

Artichoke 的代码组织像一个三层建筑：

**第一层（前台）**：`artichoke` crate
- 提供两个命令行工具：`artichoke`（相当于 `ruby`）和 `airb`（相当于 `irb`，交互式 REPL）
- 这是用户直接接触的部分

**第二层（引擎室）**：`artichoke-backend` crate
- 当前使用 mruby 的虚拟机（一个轻量级 Ruby 实现）作为底层
- 通过 FFI（函数调用接口）让 Rust 代码能指挥 mruby 干活
- 未来计划：替换成纯 Rust 实现的虚拟机

**第三层（地基）**：`artichoke-core` + `spinoso-*` crates
- `artichoke-core`：定义"一个合格的 Ruby 引擎必须具备哪些能力"的接口规范
- `spinoso-*`：逐个实现 Ruby 的核心数据类型（数组、字符串、正则表达式等）

这种分层的好处是：你可以只换一个引擎室（backend），而不用重建整栋房子。

## 四、代码示例

### 示例 1：在 Rust 代码中嵌入 Ruby 解释器

这是 Artichoke 最核心的用法——在你的 Rust 程序里"养"一个 Ruby 引擎：

```rust
use artichoke::prelude::*;

fn main() -> Result<(), Box<dyn Error>> {
    // 创建一个 Ruby 解释器实例
    let mut interp = artichoke::interpreter()?;

    // 在解释器里执行一行 Ruby 代码
    let result = interp.eval(b"[1, 2, 3].map { |n| n * 2 }")?;

    // 把 Ruby 结果转回 Rust 类型
    let array: Vec<i64> = result.try_convert(&interp)?;
    println!("{:?}", array); // 输出: [2, 4, 6]

    Ok(())
}
```

这行 `interp.eval(b"...")` 就是"把 Ruby 代码扔进引擎室点火"的动作。`eval` 接收一段字节，交给 mruby 虚拟机解析、执行，然后把结果包装成一个 `Value` 对象返回给你。

### 示例 2：通过命令行运行 Ruby 脚本

安装 Artichoke 之后（`cargo install artichoke`），用法跟普通 Ruby 几乎一样：

```bash
# 直接执行一行代码
$ artichoke -e 'puts "Hello from Artichoke!"'
Hello from Artichoke!

# 运行一个 .rb 文件
$ artichoke hello.rb

# 进入交互式 REPL（airb = artichoke IRB）
$ airb
>> [1, 2, 3].sum
=> 6
>> "hello".upcase
=> "HELLO"
```

注意：Artichoke 目前还不完全兼容 MRI Ruby——很多标准库方法还没实现，所以不能跑完整的 Rails 应用。它的定位是"实验性引擎"，不是"生产替代品"。

## 五、关键概念总结

**Strangler Fig 模式（绞杀榕模式）**：Artichoke 不会一次性重写整个 MRI。它像绞杀榕包裹宿主树那样，逐步用 Rust 实现 Ruby 核心功能，同时让 mruby 继续运转。每当一个功能（比如 `String#upcase`）在 Rust 里实现了，就把对应的 mruby C 函数"绞杀"掉。

**no_std 设计**：Spinoso 系列库尽量不依赖 Rust 标准库，这样它们可以在嵌入式环境甚至 WebAssembly 中运行。这就像造发动机时要求"不挑汽油标号"。

**WebAssembly 目标**：Artichoke 可以编译成 `.wasm` 文件，直接在浏览器里跑 Ruby。你在 [artichoke.run](https://artichoke.run) 就能看到一个在线的 Ruby REPL——那是 Artichoke 编译成 WebAssembly 后的版本。

## 六、学习收获

Artichoke 展示了 Rust 的一个强大方向：**不只是写更快的系统程序，还可以重新实现各种语言运行时**。类似的项目还有 Cruby（用 C 写 Ruby 教学实现）、Natalie（用 C++ 写 Ruby）、Rubinius（用 Ruby 写 Ruby）等。

每个项目回答的问题不同：
- Cruby：Ruby 到底是怎么工作的？（教学）
- Artichoke：Ruby 用 Rust 重实现能怎样？（工程实验）
- Natalie：能不能让 Ruby 编译成本地机器码？（AOT 编译）

理解这些"语言实现"项目，能帮你真正搞懂编程语言不是魔法——它们就是一堆解析器、虚拟机和内存管理的组合。

## 七、安装方式速查

Artichoke 提供好几种安装渠道，你挑一个方便的就行：

```bash
# 方式 1：通过 Cargo（需要 Rust 和 clang 工具链）
$ cargo install --git https://github.com/artichoke/artichoke --branch trunk --locked artichoke

# 方式 2：通过 rbenv（需要先装 ruby-build）
$ rbenv install artichoke-dev

# 方式 3：通过 Docker（最快的体验方式）
$ docker run -it docker.io/artichokeruby/artichoke airb
```

Docker 方式最快，因为不需要装任何依赖，一条命令就能进交互式环境。

## 八、项目现状与启示

Artichoke 在 2025 年 11 月被归档为只读仓库。归档不等于失败——它的核心目标（验证用 Rust 实现 Ruby 技术路线的可行性）已经基本达成了。

对你这个学习者的启示：

1. **语言实现是理解编程语言的最好方式**。看完 Artichoke 的代码结构，你再写 Ruby 时会清楚知道 `def`、`class`、`module` 这些语法背后发生了什么。
2. **Rust 适合做底层基础设施**。内存安全 + 零成本抽象 + 跨平台编译，这三个特性让 Rust 成为重写语言运行时的热门选择。
3. **渐进式重构比推翻重来更现实**。Strangler Fig 模式是工程上的智慧：不停机、不重写、逐步替换。
4. **实验项目的价值不在"能不能商用"，而在"能学到什么"**。Artichoke 即使不再活跃维护，它提供的知识遗产已经足够了。

## 九、延伸阅读

- Artichoke 官方文档：[artichoke.github.io/artichoke](https://artichoke.github.io/artichoke/artichoke/)
- Rubyspec 项目（Ruby 兼容性测试套件）：[github.com/ruby/spec](https://github.com/ruby/spec)
- mruby 官方文档：[mruby.github.io](https://mruby.github.io)
- 绞杀榕模式原文：Martin Fowler 的博客 [martinfowler.com/bliki/StranglerFigApplication.html](https://martinfowler.com/bliki/StranglerFigApplication.html)
- 在线 Playground：[artichoke.run](https://artichoke.run)
