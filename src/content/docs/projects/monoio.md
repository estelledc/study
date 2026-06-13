---
title: monoio — 字节跳动的 io_uring 运行时
来源: https://github.com/bytedance/monoio
日期: 2026-06-13
分类: 编译器
子分类: 语言运行时
provenance: pipeline-v3
---

# monoio — 字节跳动的 io_uring 运行时

## 一、为什么要造这个轮子

想象一家餐厅，有 16 张桌子（CPU 核心），每张桌子配一名专属服务员。

传统做法（Tokio 的模型）是所有服务员共用一个对讲机系统——任何服务员接到订单都要通过对讲机呼叫厨房，厨房做好后再通过对讲机通知"哪张桌子的菜好了"。服务员之间还要不断协调："我这桌忙完了，去帮那桌收一下盘子"。这套机制叫 **work-stealing（工作窃取）**，灵活但 overhead 很大。

monoio 的做法更简单粗暴：每张桌子只有一名服务员，他负责到底。客人来了是他接待，点餐是他记录，厨房出菜了他直接端上去。服务员不需要跟别人商量（没有跨线程调度），他手里的订单永远不会跑到别的桌子上去。这就是 **thread-per-core（每核一线程）** 模型。

monoio 的核心创新在于：它不只用传统的 epoll 叫菜，而是用了 Linux 5.6+ 引入的 **io_uring** ——一个能让程序以零拷贝、异步方式跟磁盘和网络打交道的新接口。epoll 像是服务员去厨房门口排队问"菜好了没"；io_uring 像是给厨房装了个铃铛，菜好了铃铛自己响。

## 二、核心概念

### 1. Thread-per-Core（每核一线程）

这是 monoio 最核心的设计理念。每个 CPU 核心绑定一个运行时线程，该线程上的所有任务永远在这条线程上执行，不会跑到其他线程去。带来的好处：

- **不需要 Send + Sync**：Tokio 的 Task 必须实现 `Send`（因为可能被换到别的线程），monoio 不需要，这意味着可以直接使用线程局部存储（TLS），性能更高
- **缓存友好**：数据不会被搬运，CPU 缓存命中率更高
- **无锁通信**：线程间通信可以用无锁队列，减少锁竞争

代价是：如果某张桌子特别闲而另一张桌子排长队，闲的那张桌子没法帮忙。这就是为什么 monoio 说自己是"在特定场景下追求极致性能"，而不是通用方案。

### 2. io_uring / epoll / kqueue 三驱动

monoio 根据平台和内核版本自动选择 IO 驱动：

- **Linux 5.6+**：优先使用 `io_uring`，退化为 `epoll`
- **macOS**：使用 `kqueue`
- **Windows**：实验性支持中

io_uring 是 Linux 5.1 引入、5.6 成熟的异步 IO 接口。它的工作方式是：用户态和内核态各维护一个环形缓冲区（ring buffer），用户把 IO 请求往 ring 里塞，内核处理完把结果放回 ring，用户态再来取。整个过程只需要两次系统调用（提交 + 获取），而 epoll 至少需要三次。

### 3. 无拷贝 IO 抽象

monoio 重新设计了 IO API，目标是尽量减少数据拷贝。传统的 async IO 往往是"读到 buffer A，再写到 buffer B"，monoio 通过所有权转移的方式让数据直接流过各个阶段，减少不必要的内存复制。

## 三、代码示例

### 示例 1：最简单的 Echo 服务器

这是 monoio 官方文档里的入门示例，实现了一个 TCP echo 服务——客户端发来什么，服务器就原样回什么。

```rust
use monoio::io::{AsyncReadRent, AsyncWriteRentExt};
use monoio::net::{TcpListener, TcpStream};

#[monoio::main]
async fn main() {
    // 在 127.0.0.1:50002 上监听连接
    let listener = TcpListener::bind("127.0.0.1:50002").unwrap();
    println!("server listening on 50002");

    // 无限循环接受新连接
    loop {
        let incoming = listener.accept().await;
        match incoming {
            Ok((stream, addr)) => {
                println!("new connection from {}", addr);
                // 为每个连接 spawn 一个协程处理
                monoio::spawn(echo(stream));
            }
            Err(e) => {
                eprintln!("accept failed: {}", e);
                return;
            }
        }
    }
}

// 处理单个连接的 echo 逻辑
async fn echo(mut stream: TcpStream) -> std::io::Result<()> {
    let mut buf: Vec<u8> = Vec::with_capacity(8 * 1024);
    loop {
        // 读取数据 —— 注意返回值是 (Result<usize>, Vec<u8>)
        // buf 所有权被转移到 read，读完又传回来
        let (res, buf) = stream.read(buf).await;
        let n = res?;
        if n == 0 {
            // 客户端关闭了连接
            return Ok(());
        }

        // 把读到的数据原样写回去
        let (res, buf) = stream.write_all(buf).await;
        res?;

        // 清空缓冲区准备下一次读取
        buf.clear();
    }
}
```

运行后，在另一个终端执行 `nc 127.0.0.1 50002` 就能测试。

关键观察：`stream.read(buf)` 的签名很特别——它接收 `buf` 的所有权并返回 `(Result, buf)`。这跟 Tokio 的 `buf: &mut [u8]`（借用）完全不同。monoio 用所有权转移实现了零拷贝，读出来的数据直接喂给 `write_all`，中间不经过额外的 buffer。

### 示例 2：带超时的 HTTP 风格请求

```rust
use monoio::net::TcpStream;
use monoio::time::{timeout, Duration};

#[monoio::main]
async fn main() {
    // 给整个操作设置 5 秒超时
    let result = timeout(Duration::from_secs(5), fetch_data()).await;

    match result {
        Ok(Ok(data)) => println!("got {} bytes", data.len()),
        Ok(Err(e)) => eprintln!("request failed: {}", e),
        Err(_) => eprintln!("request timed out after 5 seconds"),
    }
}

async fn fetch_data() -> std::io::Result<Vec<u8>> {
    let mut stream = TcpStream::connect("httpbin.org:80").await?;

    // 构造一个简单的 HTTP GET 请求
    let request = b"GET /get HTTP/1.1\r\nHost: httpbin.org\r\n\r\n";
    stream.write_all(request.to_vec()).await?.0;

    // 读取响应
    let mut buf = vec![0u8; 4096];
    let (res, buf) = stream.read(buf).await;
    let n = res?;

    Ok(buf[..n].to_vec())
}
```

这里展示了 monoio 的定时器能力——`timeout` 函数可以给任何 async 操作加超时保护。底层由 io_uring 的定时器机制驱动，精度比传统的 epoll 定时更高。

## 四、monoio vs Tokio vs Glommio

| 维度 | Tokio | Glommio | monoio |
|------|-------|---------|--------|
| 调度模型 | Work-stealing | Thread-per-core | Thread-per-core |
| IO 驱动 | epoll/io_uring(kqueue) | liburing | io_uring/epoll/kqueue |
| Send + Sync 要求 | 必须 | 不需要 | 不需要 |
| 通用性 | 极高，生态丰富 | 中等 | 较低，偏服务器场景 |
| 单核性能 | 好 | 好 | 好 |
| 多核扩展性 | 随核数增加单核性能下降 | 线性扩展 | 线性扩展最佳 |
| 16 核峰值 | 基线 | ~2x | ~3x |

Tokio 像是一个万能选手，什么场景都能用，生态极其丰富。Glommio 和 monoio 则是专项选手，在 thread-per-core 场景下追求极致性能。根据字节跳动的基准测试，16 核环境下 monoio 的峰值性能约为 Tokio 的 3 倍。

## 五、使用门槛

1. **Rust 工具链**：需要 nightly（1.75+），因为用了一些 unstable features 如 GAT
2. **Linux 内核**：5.6+ 才能用 io_uring，低版本退化为 epoll
3. **memlock 配置**：io_uring 需要足够的内存锁定配额，需要手动调整
4. **适用场景**：最适合 IO 密集型的网络服务（如代理、网关、负载均衡），不适合计算密集型或负载极度不均的场景

## 六、生态与展望

monoio 周边项目包括：
- **local-sync**：线程内 channel 实现，用于 thread-per-core 间的无锁通信
- **monoio-tls**：TLS 加密支持
- **monoio-codec**：编解码工具

HTTP 框架和 RPC 框架也在开发中。整体来看，monoio 是字节跳动在高性能网络服务领域的重要基础设施探索，代表了 Rust 异步运行时中"为特定场景极致优化"这一路线的最新成果。
