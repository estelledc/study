---
title: Mio — Rust 跨平台 I/O 多路复用
来源: 'https://github.com/tokio-rs/mio'
日期: 2026-06-13
分类: 其他
子分类: rust-tools
provenance: pipeline-v3
---

## 是什么

**Mio**（读作 /maɪ.oʊ/，名字来源于"Metal I/O"——意思是"贴近金属的 I/O"）是 Rust 生态中最底层的**跨平台 I/O 多路复用库**。它的名字听起来简单，但它做的事情非常核心：让一个线程能同时管理成百上千个网络连接，而不需要为每个连接开一个线程。

Mio 由 Tokio 团队维护（也就是那个把异步 Rust 推向主流的团队），当前版本 1.x，在 GitHub 上有 7000+ star。它是 Tokio 异步运行时底层 I/O 能力的直接构建者——可以说，**Tokio 的 I/O 能力大约 80% 直接来自 Mio**。

日常类比：

- 想象一个餐厅里只有**一个服务员**（这就是你的主线程），他要同时照顾**100 张桌子**（100 个网络连接）。如果没有 Mio，服务员得跑到每张桌子问一句"您需要点什么吗？"——跑一圈下来，第一张桌子的菜早就凉了。Mio 做的事就是：服务员把一张"呼叫铃"发到每张桌子，哪张桌子按铃了（有数据可读或可写），服务员就只去处理那张桌子。这在计算机科学中叫"**事件驱动**"模型
- 更精确地说：Mio 是操作系统上 epoll（Linux）、kqueue（macOS/BSD）、IOCP（Windows）这几个系统级 API 的统一封装。操作系统内核会监控所有文件描述符的状态，当某个描述符"准备好了"，内核告诉 Mio："3 号桌按铃了"， Mio 再告诉你

## 核心概念

### 1. Poll —— 事件轮询器

`Poll` 是 Mio 的心脏。它代表一个**事件轮询器**，负责向操作系统注册"我关心哪些资源的状态变化"，然后阻塞等待事件发生。在 Linux 上它内部调用 `epoll`，在 macOS 上调用 `kqueue`，在 Windows 上调用 `IOCP`——但你不需要知道这些细节，Mio 帮你统一了接口。

可以把它理解成餐厅服务员的**耳朵**——它一直"听着"所有桌子是否有呼叫。

### 2. Registry —— 资源注册表

`Registry` 负责**注册和注销**你想要监控的文件描述符（socket、文件等）。每个注册的资源都需要一个**Token**（令牌），用来在事件发生时识别"这是哪个资源的信号"。

继续类比：这就是服务员给每张桌子**发呼叫铃**的动作——每张桌子拿到一个铃，按铃时服务员就知道是哪张桌子在呼叫。

### 3. Token —— 事件标识符

每次向 Poll 注册一个资源时，你都要给它分配一个 Token。当事件发生时，你通过 Token 就能知道是哪个 socket 有活动了。Token 只是一个整数，你可以把它理解成桌号。

### 4. Interest —— 关心的事件类型

注册时你需要告诉 Poll：你关心这个 socket 的什么事件。Mio 定义了两种：

- `READABLE`：socket 上有数据可读（比如对方发了消息，或者连接已建立）
- `WRITABLE`：socket 可以写入数据而不阻塞（比如发送缓冲区有空闲空间）

也可以同时关心两者：`READABLE | WRITABLE`。

### 5. Events —— 事件容器

`Poll::poll()` 调用后会得到一个 `Events` 容器，里面装满了本次轮询中**所有准备好的事件**。你遍历这个容器，根据 Token 分发处理逻辑。

类比：这就是服务员**听到的所有铃声列表**——可能同一时刻 3 张桌子同时按铃，列表里就有 3 个事件。

### 6. Waker —— 跨线程唤醒

`Waker` 允许你从**另一个线程**唤醒正在 `Poll::poll()` 中阻塞的主线程。比如：后台线程收到了一条消息，需要通知主线程来处理。

类比：即使没有桌子按铃，经理也可以**拍一下服务员的肩膀**说"别等了，有紧急情况"——这就是跨线程唤醒。

### 7. 平台后端 —— 为什么跨平台不容易

Mio 之所以重要，是因为它把不同操作系统的 I/O 多路复用 API 统一成了同一套 Rust 接口：

| 操作系统 | 内核 API | Mio 使用 |
|---|---|---|
| Linux | epoll | 直接封装 |
| macOS / iOS / BSD | kqueue | 直接封装 |
| Windows | IOCP + wepoll | 通过 AFD 系统调用 |

这意味着你用同一套 Rust 代码，可以在所有主流平台上运行，不需要写任何平台特定的代码。

## 代码示例

### 示例一：最简 TCP 服务器（理解 Poll + Registry 的工作流程）

这是 Mio 官方 README 中的例子，展示了一个最基本的"注册 → 轮询 → 处理"循环：

```rust
use std::error::Error;
use mio::net::{TcpListener, TcpStream};
use mio::{Events, Interest, Poll, Token};

// 给每个 socket 分配一个 Token（就像桌号）
const SERVER: Token = Token(0);
const CLIENT: Token = Token(1);

fn main() -> Result<(), Box<dyn Error>> {
    // 1. 创建 Poll 实例（服务员戴上了他的"耳朵"）
    let mut poll = Poll::new()?;
    // 2. 创建事件容器，预分配 128 个事件的空间
    let mut events = Events::with_capacity(128);

    // 3. 绑定并监听端口
    let addr = "127.0.0.1:13265".parse()?;
    let mut server = TcpListener::bind(addr)?;
    // 4. 向 Poll 注册 server socket，只关心 READABLE（有新连接来了）
    poll.registry()
        .register(&mut server, SERVER, Interest::READABLE)?;

    // 5. 创建客户端 socket 并连接
    let mut client = TcpStream::connect(addr)?;
    // 注册客户端 socket，同时关心 READABLE 和 WRITABLE
    poll.registry()
        .register(&mut client, CLIENT, Interest::READABLE | Interest::WRITABLE)?;

    // 6. 进入事件循环——这是核心模式
    loop {
        // poll() 会阻塞，直到至少有一个事件发生
        // 发生的事件被填入 events 容器
        poll.poll(&mut events, None)?;

        // 7. 遍历所有发生的事件
        for event in events.iter() {
            match event.token() {
                SERVER => {
                    // 服务端 socket 有活动 = 有新客户端连接
                    let connection = server.accept();
                    drop(connection);
                }
                CLIENT => {
                    if event.is_writable() {
                        // 客户端 socket 可以写入了
                    }
                    if event.is_readable() {
                        // 客户端 socket 有数据可读
                    }
                    return Ok(());
                }
                _ => unreachable!(),
            }
        }
    }
}
```

这段代码虽然简单，但包含了**所有异步 I/O 程序的核心模式**：

1. 创建 `Poll` → 创建 `Events` 容器
2. 绑定/创建 socket → 向 `Poll` 注册（带 Token 和 Interest）
3. 进入 `loop` → 调用 `poll.poll()` 阻塞等待 → 遍历 `events` 分发处理

**关键点**：
- `poll.poll()` 是**阻塞调用**——它会一直等到有事件发生才返回。这就是"多路复用"的意义：一个线程通过操作系统内核的机制，同时等待多个 socket 的状态变化，而不是为每个 socket 开一个线程去阻塞等待
- `Interest::READABLE | Interest::WRITABLE` 表示同时关心读和写两种事件，用 `|` 按位或组合
- `poll.registry()` 返回一个 `Registry`，它是 `Poll` 的一部分，只负责注册/注销，不负责轮询

### 示例二：多客户端 echo 服务器（真正体现多路复用的价值）

这个示例展示了 Mio 的真正威力——一个线程管理多个客户端连接：

```rust
use std::collections::HashMap;
use std::error::Error;
use std::io::Read;
use mio::net::{TcpListener, TcpStream};
use mio::{Events, Interest, Poll, Token};

// 为每个客户端分配递增的 Token
fn next_client_token(last: Token) -> Token {
    Token(last.0 + 1)
}

const MIN_TOKEN: Token = Token(1000);
const MAX_TOKEN: Token = Token(10000);

fn main() -> Result<(), Box<dyn Error>> {
    let mut poll = Poll::new()?;
    let mut events = Events::with_capacity(1024);

    // 服务端 socket
    let addr = "127.0.0.1:8080".parse()?;
    let mut server = TcpListener::bind(addr)?;
    poll.registry()
        .register(&mut server, Token(0), Interest::READABLE)?;

    // 存储每个客户端的 socket 和 Token 的映射
    let mut clients: HashMap<Token, Token> = HashMap::new();

    println!("Echo server listening on {}", addr);

    loop {
        poll.poll(&mut events, None)?;

        for event in events.iter() {
            match event.token() {
                Token(0) => {
                    // 服务端收到新连接请求
                    loop {
                        match server.accept() {
                            Ok((socket, addr)) => {
                                println!("New client: {}", addr);

                                // 为这个客户端分配一个 Token（1000 开始）
                                let last_token = *clients.values().last().unwrap_or(&(MIN_TOKEN.0 - 1));
                                let token = next_client_token(Token(last_token));

                                // 注册到这个客户端 socket
                                poll.registry()
                                    .register(&mut socket, token, Interest::READABLE)?;

                                // 记录映射关系
                                clients.insert(token, token);

                                // 同时关注可写事件，这样收到数据后可以回写
                                poll.registry()
                                    .reregister(&mut socket, token, Interest::READABLE | Interest::WRITABLE)?;

                                // 注意：socket 需要转移到事件循环中，
                                // 这里用 HashMap 存储以持有所有权
                            }
                            Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                                // 没有更多连接可接受了
                                break;
                            }
                            Err(e) => return Err(Box::new(e)),
                        }
                    }
                }
                Token(t) if t >= MIN_TOKEN.0 && t <= MAX_TOKEN.0 => {
                    // 某个客户端有事件
                    if event.is_writable() {
                        // 这里可以把缓存的数据写出去
                    }

                    if event.is_readable() {
                        // 从客户端读取数据并回写（echo）
                        let mut socket = TcpStream::connect(format!("127.0.0.1:8080")).unwrap();
                        let mut buf = [0u8; 4096];
                        match socket.read(&mut buf) {
                            Ok(0) => {
                                // 客户端断开连接
                                println!("Client {} disconnected", t);
                                let _ = clients.remove(&Token(t));
                            }
                            Ok(n) => {
                                // 收到数据，可以回写给客户端
                                println!("Client {} sent {} bytes", t, n);
                            }
                            Err(_) => {
                                println!("Client {} error", t);
                                let _ = clients.remove(&Token(t));
                            }
                        }
                    }
                }
                _ => unreachable!(),
            }
        }
    }
}
```

这个例子展示了几个 Mio 多路复用的关键实践：

- **动态注册**：每来一个客户端就 `register()` 一个 socket，移除客户端时注销。事件循环的结构不变，变化的只是注册的资源数量
- **Token 空间规划**：服务端用 Token(0)，客户端从 Token(1000) 开始，这样在处理 `events.iter()` 时可以用范围判断区分服务端事件和客户端事件
- **WouldBlock 处理**：`server.accept()` 可能返回 `WouldBlock` 错误，意味着"当前没有更多连接可接受"——这不是真正的错误，而是正常情况，应该 break 内层循环回到 `poll.poll()` 继续等待
- **Reregister**：注册后如果需要改变关心的事件类型（比如从只关注 READABLE 改为同时关注 READABLE | WRITABLE），用 `reregister()` 而不是重新 register

## 为什么 Mio 重要

1. **Tokio 的底层基石**：Tokio 的 `tokio::net` 模块直接基于 Mio 构建。如果你用 Tokio 写异步 Rust，你就已经在用 Mio 了——只是被 Tokio 的抽象层挡住了
2. **极致轻量**：Mio 号称"zero allocations at runtime"（运行时零分配），除了你创建的对象外不分配任何内存。这是因为它直接包装操作系统 API，没有中间层
3. **跨平台统一**：Linux 的 epoll、macOS 的 kqueue、Windows 的 IOCP 三个完全不同的 API，在 Mio 里变成了完全一样的 Rust 接口。这让 Rust 网络库可以真正跨平台
4. **构建更高抽象的基础**：除了 Tokio，async-std、quinn（QUIC 实现）、libp2p 等知名库都依赖 Mio 做底层 I/O
5. **学习异步编程的最佳入口**：如果你觉得 Tokio 的抽象太高、不知道异步运行时底层在做什么，直接读 Mio 的代码和文档——它几乎就是异步 I/O 的原貌

## 与 Tokio 的关系

很多人会混淆 Mio 和 Tokio。简单来说：

- **Mio** = 只负责"监听 socket 有没有数据可读/可写"，是最底层的事件通知
- **Tokio** = 基于 Mio 构建的完整异步运行时，提供了 async/await、任务调度、timer、线程池等**一切**

类比：Mio 是汽车的发动机，Tokio 是一辆完整的车（有方向盘、座椅、空调……）。你可以只买发动机自己造车，但大多数人直接用整车。

## 快速上手清单

| 步骤 | 命令/操作 |
|---|---|
| 添加依赖 | `cargo add mio --features "os-poll net"` |
| 创建轮询器 | `let mut poll = Poll::new()?` |
| 创建事件容器 | `let mut events = Events::with_capacity(128)` |
| 注册 socket | `poll.registry().register(&mut socket, Token(0), Interest::READABLE)?` |
| 阻塞等待事件 | `poll.poll(&mut events, None)?` |
| 遍历事件 | `for event in events.iter() { match event.token() { ... } }` |
| 换平台 | 不需要改任何代码，Cargo 自动选择正确的后端 |

## 进一步学习

- 官方仓库：https://github.com/tokio-rs/mio
- API 文档：https://docs.rs/mio
- Tokio 团队 Discord：https://discord.gg/tokio
- 如果你觉得 Mio 太底层，下一步看 Tokio：https://tokio.rs
