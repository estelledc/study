---
title: Lunatic — WASM 原生 Actor 运行时
来源: https://github.com/lunatic-solutions/lunatic
日期: 2026-06-13
分类: 基础设施
子分类: wasm-toolchain
provenance: pipeline-v3
---

# Lunatic — WASM 原生 Actor 运行时

## 一、一个日常类比

想象一家大型餐厅。

传统服务器（比如 Node.js 的单线程事件循环）就像一位服务员——他一个人同时照看所有桌子。客人点菜后，他去厨房下单，然后等着。如果某道菜要等 30 分钟，他就干站着。在这 30 分钟里，他不能去服务别的桌子。

Go 语言的 goroutine 像是雇了一百个服务员——每人负责几张桌子，互相之间不干扰。好多了，但每个服务员仍然有自己的"个人空间"（内存），如果其中一个犯了错（比如打翻汤锅），可能会殃及整片区域。

Lunatic 的做法更极端：它给每张桌子配一个**完全独立的迷你餐厅**——有独立的厨房、独立的冰箱、独立的服务员。如果一个迷你餐厅里的服务员把厨房炸了，其他桌子完全不受影响。而且这些迷你餐厅创建起来极其便宜——不是雇人，而是像变魔术一样"变"出来一个完整的餐厅。

这就是 Lunatic 的核心思想：**Actor 模型 + WebAssembly 沙箱 = 超轻量、完全隔离的并发单元。**

## 二、Lunatic 是什么

Lunatic 是一个受 Erlang 启发的通用运行时，运行在 WebAssembly (WASM) 之上。它让你能用任何能编译到 WASM 的语言（目前主要支持 Rust 和 AssemblyScript）来构建**快速、健壮、可扩展**的后端应用。

关键定位：

- **灵感来源**：Erlang 的 Actor 模型（OTP 体系）
- **运行载体**：WebAssembly（而非 JVM、CLR 等传统虚拟机）
- **核心优势**：每个进程完全隔离（独立栈、堆、系统调用），一个崩溃不影响全局
- **调度机制**：基于 Tokio 的 work-stealing 异步执行器，写阻塞代码也能自动非阻塞

为什么这很重要？因为传统并发模型的痛点是：要么共享内存导致竞态条件（多线程），要么消息传递复杂难调试（分布式系统）。Lunatic 用 WASM 的天然沙箱能力，把"隔离"做到了进程级别——你不需要写分布式代码，就能获得分布式的容错性。

## 三、核心概念

### 3.1 Actor（进程）

Lunatic 中的"进程"（process）就是 Actor。每个 Actor 拥有：

- 独立的栈和堆内存
- 独立的系统调用上下文
- 独立的权限集（文件系统、网络等都可以精细控制）

创建成本极低——不是操作系统级别的线程（通常几 MB 栈），而是 WASM 级别的绿色线程，开销接近零。你可以轻松同时运行数十万甚至上百万个 Actor。

### 3.2 消息传递（Mailbox）

Actor 之间通过**邮箱（Mailbox）**通信。一个 Actor 可以向另一个 Actor 发送消息，接收方从自己的邮箱中按顺序取消息处理。这是典型的 Actor 模型，避免了共享状态带来的锁和竞态问题。

### 3.3 进程监督（Supervision）

受 Erlang OTP 启发，Lunatic 支持进程间的监督关系。父进程可以"链接"到子进程，子进程崩溃时父进程能收到通知并决定是否重启。这构成了"让它们崩溃"（let it crash）的容错哲学的基础。

### 3.4 预emptive 调度

即使你写的是同步阻塞代码，Lunatic 的运行时也会在等待 I/O 时自动切换其他任务，不会阻塞底层线程。这得益于底层的 work-stealing 异步执行器。你写起来像同步代码，跑起来像异步代码。

## 四、代码示例

### 示例 1：创建一个最简单的 Actor

这是最基础的用法——定义一个入口函数，标记为 `#[lunatic::main]`，然后通过 `spawn_link!` 创建一个新进程：

```rust
use lunatic::{spawn_link, Mailbox};

#[lunatic::main]
fn main(_: Mailbox<()>) {
    // 创建一个子进程，使用 @task 宏
    let child = spawn_link!(@task || {
        // 这段闭包运行在一个全新的进程中
        // 拥有独立的栈和堆，无法访问父进程的内存
        println!("Hello from child process!");
    });

    // 等待子进程完成，并获取其返回值
    let _result = child.result();
}
```

要点：

- `#[lunatic::main]` 替代了标准的 `fn main()`，告诉 Lunatic 运行时这里是一个 Actor 的入口
- `spawn_link!` 宏创建一个新 Actor，`@task` 表示这是一个后台任务
- 闭包内的代码**完全隔离**——它有自己的内存空间，不能读取或写入父进程的数据
- `child.result()` 等待子进程结束并获取返回值

### 示例 2：进程间消息传递

Actor 之间通过 Mailbox 发送和接收消息：

```rust
use lunatic::net::TcpListener;
use lunatic::process::Process;
use std::io::Read;

#[lunatic::main]
fn main(mailbox: Mailbox<()>) {
    // 启动一个 TCP 监听器
    let listener = TcpListener::bind("0.0.0.0:8080").unwrap();

    // 为每个连接创建一个独立的 Actor
    loop {
        let mut stream = listener.accept().unwrap();
        let mailbox = mailbox.clone();

        // 每个连接都是一个独立的 Actor
        spawn_link!(@task move || {
            let mut buffer = [0; 1024];
            if let Ok(n) = stream.read(&mut buffer) {
                let response = "HTTP/1.1 200 OK\r\nContent-Length: 13\r\n\r\nHello, World!";
                stream.write_all(response.as_bytes()).unwrap();
            }
        });
    }
}
```

要点：

- 每个 TCP 连接都会生成一个**完全独立的 Actor**
- 即使某个连接的处理逻辑崩溃了（比如内存错误），也不会影响其他连接
- 由于 WASM 的沙箱特性，即使连接处理的代码包含 C 语言编写的漏洞，影响也被限制在该 Actor 内部
- 这是 Lunatic 特别适合高并发服务端场景的核心原因

### 示例 3：带权限控制的精细隔离

Lunatic 可以在进程级别控制资源访问权限：

```rust
use lunatic::{spawn_link, config::Config};
use lunatic::net::TcpListener;

#[lunatic::main]
fn main(_: Mailbox<()>) {
    // 创建一个只允许网络访问、不允许文件系统的配置
    let net_only_config = Config::default()
        .with_network(true)
        .with_file_system(false);

    // 这个进程只能做网络操作
    spawn_link!(@task config=net_only_config || {
        let listener = TcpListener::bind("0.0.0.0:3000").unwrap();
        // 如果在这里尝试打开文件，会被运行时拒绝
    });
}
```

要点：

- 每个进程可以有**不同的权限配置**
- 权限检查在系统调用层面强制执行
- 这让你可以把不可信的第三方代码放在受限进程中运行，即使它被攻破也不会影响系统其他部分

## 五、与传统方案的对比

| 维度 | Node.js | Go | Erlang | Lunatic |
|------|---------|----|--------|---------|
| 并发模型 | 单线程事件循环 | goroutine | BEAM 虚拟机 Actor | WASM Actor |
| 隔离级别 | 无（单进程） | 进程级（较重） | BEAM 进程级 | WASM 进程级（极轻） |
| 崩溃影响 | 整个服务挂掉 | 单个 goroutine 影响同进程 | 仅影响该 Actor | 仅影响该 Actor |
| 创建百万级并发 | 不支持 | 资源耗尽 | 支持 | 支持 |
| 多语言 | JS/TS | Go | Erlang/Elixir | 任何 WASM 语言 |
| 沙箱安全 | 无 | 无 | 弱 | 强（WASM 天然沙箱） |

## 六、实际应用场景

1. **HTTP/WebSocket 服务器**：每个连接一个 Actor，天然隔离，崩溃不扩散
2. **微服务网关**：不同服务的请求路由到不同权限的 Actor
3. **不可信代码沙箱**：用户上传的代码在受限 Actor 中运行，即使包含 C 扩展也不影响宿主
4. **后台任务队列**：邮件发送、图像处理等耗时任务各自独立，互不阻塞
5. **分布式节点**：Lunatic 原生支持分布式节点通信

## 七、安装与运行

```bash
# 安装 Lunatic 运行时
cargo install lunatic-runtime

# 或使用 Homebrew (macOS)
brew tap lunatic-solutions/lunatic
brew install lunatic
```

开发时配置 `.cargo/config.toml` 后即可用熟悉的 `cargo run` 命令：

```toml
[build]
target = "wasm32-wasi"

[target.wasm32-wasi]
runner = "lunatic"
```

## 八、小结

Lunatic 的本质是把 Erlang 经过数十年验证的 Actor 并发模型，搬到了 WASM 这个更通用的载体上。它的创新在于：

- **隔离即安全**：WASM 的沙箱让每个 Actor 天然隔离，不需要额外的安全边界
- **轻量即规模**：极低的进程创建开销，让"百万并发"成为现实而非理论
- **通用即灵活**：不绑定单一语言，任何能编译到 WASM 的语言都能享受这套并发模型

对于正在学习并发编程的人来说，Lunatic 提供了一个很好的思维实验：如果不用共享内存，如果每个任务都是完全独立的宇宙，我们会如何设计系统？这个问题的答案，可能就是未来分布式系统的模样。
