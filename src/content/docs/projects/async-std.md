---
title: async-std — std 风格 API 的异步运行时
来源: https://github.com/async-rs/async-std
日期: 2026-06-13
分类: 编译器
子分类: 语言运行时
provenance: pipeline-v3
---

# async-std — std 风格 API 的异步运行时

## 一、从日常类比说起

想象你在一家餐厅工作。

**同步（sync）编程**就像只有一个服务员：他接单、跑去厨房下指令、然后一直站在厨房门口等着，菜做好了才端回来，再下一单。同一时间只能处理一件事。

**异步（async）编程**就像雇了一个聪明的经理：他同时给厨房好几个炉灶下指令，然后利用等待的时间去干别的事——等 A 灶的汤好了就去端，等 B 灶的肉烤好了就去切，等 C 灶的面好了就去装盘。整体效率大幅提升。

在 Rust 中，"同步变异步"最痛苦的地方是：API 完全不一样了。你用 `std::fs::read` 读文件，要用异步就得换成 `tokio::fs::read`，命名相似但模块不同，学两套 API 很累。

**async-std 的解决思路很简单**：给 `std` 库套一层"异步外壳"。`std::fs::read` 变成 `async_std::fs::read`，`std::net::TcpStream` 变成 `async_std::net::TcpStream`，`std::thread` 变成 `async_std::task`。你只需要把 `std` 换成 `async_std`，其他几乎不用改。

这就是它的核心理念：**你不需要学新 API，你只需要把 `use std::...` 改成 `use async_std::...`**。

> ⚠️ 重要现状：async-std 项目已于 2025 年停止维护，官方推荐迁移到 [smol](https://github.com/smol-rs/smol/)。但学习 async-std 依然有价值——它的设计理念深刻影响了 Rust 标准库中异步部分的设计方向。

## 二、核心概念

### 2.1 Future（未来值）

`Future` 是 Rust 异步编程的基础。你可以把它理解为"一个会在未来某个时刻给出结果的承诺"。

```rust
// 一个 Future 就像一个"待完成的作业"
// 你现在拿到它，但结果还没出来
// 等你 .await 它，它就会执行并给出结果
```

### 2.2 事件循环（Event Loop / Executor）

Rust 的异步需要"运行时"来调度任务。async-std 自带一个轻量级的运行时，负责：

- 管理后台线程池
- 调度 async 任务的执行
- 处理 I/O 事件（网络、文件等）

你不需要像 Tokio 那样手动配置运行时，async-std 开箱即用。

### 2.3 Task（轻量级任务）

async-std 用 `task` 代替了 `std::thread`。任务比线程更轻量——线程是操作系统级别的（几 MB 栈空间），任务是用户态级别的（几 KB），可以并发运行数百万个。

### 2.4 关键模块一览

| async_std 模块 | std 对应 | 作用 |
|---|---|---|
| `task` | — | 任务调度、sleep、block_on |
| `fs` | `std::fs` | 异步文件操作 |
| `net` | `std::net` | TCP/UDP 网络通信 |
| `io` | `std::io` | 异步 I/O 工具 |
| `channel` | `std::sync::mpsc` | 异步消息通道 |
| `sync` | `std::sync` | 异步同步原语（Mutex、Arc 等） |
| `future` | `std::future` | Future 组合子 |
| `stream` | — | 异步流迭代 |

## 三、代码示例

### 示例 1：基础 Hello World

这是最简单的异步程序。关键是 `#[async_std::main]` 属性宏，它会自动帮你启动运行时。

```rust
// Cargo.toml 中添加：
// [dependencies]
// async-std = { version = "1", features = ["attributes"] }

use async_std::task;

async fn say_hello(name: &str) {
    println!("Hello, {}!", name);
}

// 用属性宏替代手动 block_on，main 函数可以直接是 async 的
#[async_std::main]
async fn main() {
    say_hello("async-std").await;

    // 还可以用 block_on 手动运行 async 函数
    task::block_on(async {
        say_hello("block_on").await;
    });
}
```

**没有属性宏时的写法**（不推荐，但值得了解）：

```rust
use async_std::task;

async fn say_hello() {
    println!("Hello, world!");
}

fn main() {
    // 没有 #[async_std::main]，就要手动 block_on
    task::block_on(say_hello());
}
```

### 示例 2：并发读取多个文件

这个例子展示 async-std 的 `join` 组合子——让多个异步任务并发执行。

```rust
use async_std::fs;
use async_std::prelude::*; // 提供 join() 方法

#[async_std::main]
async fn main() -> std::io::Result<()> {
    // 假设你有三个文件需要同时读取
    let file_a = fs::read_to_string("a.txt");
    let file_b = fs::read_to_string("b.txt");
    let file_c = fs::read_to_string("c.txt");

    // join() 让三个读取操作并发执行
    // 如果三个文件各需要 1 秒，总耗时约 1 秒而不是 3 秒
    let (result_a, result_b, result_c) =
        file_a.join(file_b).join(file_c).await?;

    println!("a.txt: {}", result_a);
    println!("b.txt: {}", result_b);
    println!("c.txt: {}", result_c);

    Ok(())
}
```

**对比同步写法**（串行读取）：

```rust
// std 的写法——一个一个读，浪费时间
let a = fs::read_to_string("a.txt")?;
let b = fs::read_to_string("b.txt")?;
let c = fs::read_to_string("c.txt")?;
// 总耗时 = 三个文件读取时间之和
```

### 示例 3：异步 TCP 回显服务器

展示网络 I/O 的 async 写法，体会 `await` 在等待网络响应时不阻塞的特性。

```rust
use async_std::net::{TcpListener, TcpStream};
use async_std::prelude::*;
use async_std::io::{BufReader, BufWriter, ReadExt, WriteExt};

#[async_std::main]
async fn main() -> std::io::Result<()> {
    let listener = TcpListener::bind("127.0.0.1:8080").await?;
    println!("回显服务器启动，监听 127.0.0.1:8080");

    loop {
        // accept() 是异步的——没有连接时不会阻塞
        let (stream, addr) = listener.accept().await?;
        println!("新连接: {}", addr);

        // spawn 创建一个轻量级任务来独立处理每个连接
        // 主循环可以继续 accept 下一个连接，互不干扰
        async_std::task::spawn(async move {
            handle_client(stream).await;
        });
    }
}

async fn handle_client(stream: TcpStream) {
    let mut reader = BufReader::new(&stream);
    let mut writer = BufWriter::new(&stream);

    let mut buffer = [0u8; 1024];
    loop {
        match reader.read(&mut buffer).await {
            Ok(0) => break, // 客户端断开连接
            Ok(n) => {
                // 把收到的数据原样发回去（回显）
                writer.write_all(&buffer[..n]).await.unwrap();
                writer.flush().await.unwrap();
            }
            Err(_) => break,
        }
    }
}
```

用 curl 测试：

```bash
$ curl -X POST http://127.0.0.1:8080 -d "hello async-std"
hello async-std
```

### 示例 4：超时控制

异步场景下的超时，比同步的 `select` 优雅得多。

```rust
use async_std::future::timeout;
use async_std::task;
use std::time::Duration;

#[async_std::main]
async fn main() {
    // 模拟一个可能很慢的网络请求
    let slow_request = async {
        task::sleep(Duration::from_secs(5)).await;
        "数据终于拿到了"
    };

    // 给它设定 2 秒超时
    match timeout(Duration::from_secs(2), slow_request).await {
        Ok(result) => println!("成功: {}", result),
        Err(_) => println!("超时了！2 秒内没拿到数据"),
    }
}
// 输出: 超时了！2 秒内没拿到数据
```

## 四、async-std 与其他异步运行时对比

| 特性 | async-std | Tokio | async-io | smol |
|---|---|---|---|---|
| API 风格 | std 镜像 | 全新 API | 精简 I/O | 极简运行时 |
| 学习曲线 | 最低 | 较高 | 低 | 最低 |
| 性能 | 良好 | 极佳 | 良好 | 良好 |
| 生态 | 较小 | 最大 | 小 | 小 |
| 维护状态 | 已停更 | 活跃 | 活跃 | 活跃 |

**一句话总结**：如果你想要"最接近 std"的异步体验，async-std 是教科书；但做实际项目，Tokio 是工业首选，smol 是轻量替代。

## 五、关键收获

1. async-std = `std` 的异步版本，API 几乎一一对应，降低学习门槛
2. `#[async_std::main]` 自动启动运行时，无需手动 `block_on`
3. `task::spawn` 创建轻量级协程，比线程节省大量资源
4. `join()` 组合子让多个 Future 并发执行
5. `timeout()` 优雅地处理异步操作的超时
6. async-std 虽已停更，但其设计理念（std 镜像）证明了"异步也可以很简单"，这个思路被 Rust 标准库吸收，也影响了 smol 等项目

## 六、延伸思考

如果 async-std 的目标是证明"异步 API 可以和同步 API 一样直观"，那它的使命已经完成了——Rust 标准库中的 `std::future`、`async`/`await` 语法、以及 `std::task` 模块都体现了这种设计哲学。

async-std 像一座桥梁：它让同步 Rust 开发者看到，异步并不一定意味着复杂的宏、笨重的运行时和不熟悉的 API。这座桥虽然拆了，但它走过的路为后来者铺平了。
