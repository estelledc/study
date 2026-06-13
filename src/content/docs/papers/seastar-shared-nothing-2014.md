---
title: Seastar — Shared-Nothing 异步框架（每核一线程 + Future 驱动）
来源: https://seastar.io/shared-nothing/
日期: 2026-06-13
分类: 操作系统
子分类: 内核与虚拟化
难度: 中级
provenance: pipeline-v3
---

## 是什么

**Seastar** 是 ScyllaDB 团队开源的 C++14 服务器框架，核心口号是 **Shared-Nothing（无共享）**：每个 CPU 核跑**恰好一个**应用线程（shard），内存、数据结构、连接与任务队列都按核切分；核与核之间**不抢同一把锁**，需要数据时走显式消息传递。

日常类比：传统多线程服务器像**一家大超市只有一个收银台队伍**——所有顾客（请求）挤在同一排货架（共享哈希表）前，收银员要不断喊「别插队」（加锁），还要互相让路（cache line 颠簸）。Seastar 则是**每家分店只服务自己街区的顾客**：每个核是独立门店，有自己的库存和收银机；若顾客要买的东西在隔壁店，店员用对讲机下单（`smp::submit_to`），等回执（`future`）到了再结账——**店内零锁，跨店才通信**。

Seastar 用这套模型支撑了 ScyllaDB（Cassandra 重写，号称 10× 吞吐）、Redpanda（Kafka 兼容 broker）、Starlette 系存储等。官方 shared-nothing 页面与 [Asynchronous Programming with Seastar](https://docs.seastar.io/master/tutorial.html) 教程是入门主文档。

## 为什么需要它：硬件变了，线程模型没跟上

现代机器有两条残酷趋势，Seastar 文档把它们写得很直白：

| 趋势 | 后果 |
|------|------|
| **核数涨、主频不涨** | 性能越来越依赖多核扩展；粗粒度锁争用、细粒度锁的无争用开销都会拖垮扩展性 |
| **网卡/SSD 越来越快** | 10Gbps 上处理 1024 字节包，2GHz CPU 每包只剩约 **1670 个时钟周期**（Intel DPDK 估算）——内核协议栈 + 多次拷贝 + 线程切换很容易吃光预算 |

经典「每连接一线程/一进程」的**同步**模型写起来舒服，但 C10K 之后 event-loop + 非阻塞 IO 成为主流。可纯手写 epoll 回调会把代码变成**状态机意大利面**；更麻烦的是，像早期 Cassandra 用 `mmap` 读盘会在不可预期处阻塞，逼着你又回到多线程。

Seastar 试图同时拿到：

1. **异步/event-driven 的高并发**（单核一个 reactor，不阻塞）
2. **Future/continuation 的可组合性**（比裸回调好读、好测）
3. **Shared-nothing 的线性扩展**（避免跨核锁与 false sharing）
4. **C++ 的零开销抽象**（相对 Java/Go 更可控的内存与指令）

## 核心概念

### 1. Shard = 核 = 一个 Reactor（引擎）

每个 shard 上跑一个 **reactor**（事件循环）：轮询网卡队列、定时器、完成态 IO，调度协作式微任务。默认 `app_template` 会占满机器上所有硬件线程（可用 `-c N` 限制）。线程与核的绑定类似 `taskset`，且会尽量避免把两个 shard 钉在同一物理核的两个超线程上。

**关键约束**：在 shard 内，你的代码应像写单线程程序一样思考——没有 mutex 保护的全局 `std::unordered_map`，除非你愿意接受性能悬崖。

### 2. Shared-Nothing 内存

每个 shard **预分配**一大块本地内存（默认吃掉除 OS 保留外的几乎全部 RAM，可用 `-m` 限制）。`malloc`/`new` 只在这块区域内分配，利于 NUMA 本地性与分配器优化。跨 shard 访问别人的指针是**未定义行为级别的设计错误**。

### 3. Future 与 Continuation

异步操作返回 `future<T>`：值可能尚未就绪。用 `.then()` 挂 continuation（通常是 lambda），在 future 就绪时由 reactor 调度执行。`sleep()`、`read()`、`submit_to()` 都统一成 future，便于链式组合并行 IO。

若 future **已经就绪**再 `.then()`，continuation 往往**同步立即执行**（快路径优化）。

### 4. 协作式调度与抢占

没有 OS 线程抢占你的业务逻辑；长时间不算 IO 的 CPU 循环会**饿死 reactor**（文档称 reactor stall，>20ms 就很危险）。Seastar 在循环构造器里插入抢占点，也可手动 `seastar::maybe_yield()`；C++20 协程在每次 `co_await` 也会检查。注意：**`.then()` 链之间默认没有抢占点**，递归 future 环可能卡死事件循环。

### 5. 连接如何分片、数据如何分片

- **连接**：现代网卡可为每队列定向 RSS；Seastar 自研 TCP 栈时，新连接会落到特定 shard，之后固定在该核处理（类似连接亲和）。
- **数据**：框架**不能**替你自动分片。常见策略：
  - **按 key 哈希**到低比特选 shard（KV 主键访问）
  - **全核复制** + 本地读、写时广播（小且读多写少元数据）
  - **与集群分片对齐**（节点间 partition + 节点内 shard）

### 6. 跨核通信 API

| API | 作用 |
|-----|------|
| `smp::submit_to(cpu, lambda)` | 在目标 shard 执行 lambda，返回其结果的 `future` |
| `smp::invoke_on_all` | 广播到所有 shard |
| `map_reduce` 族 | 各 shard 计算后聚合 |

底层走共享内存上的无阻塞消息队列，比「全局锁 + 条件变量」便宜一个数量级，但仍比本地访问贵——设计时要**减少跨 shard 跳转**。

### 7. 自研 TCP 栈与 DMA 存储 API

Seastar 可用内核 TCP，也提供与 shard 模型匹配的**用户态协议栈**，支持双向零拷贝（直接在栈缓冲区上解析，或把应用缓冲区交给发送路径）。存储侧同样强调 DMA 式接口，减少 memcpy。这与 DPDK/SPDK 思路同族，但和 future 编程模型焊在一起。

## 代码示例

### 示例 1：最小程序与跨核 `submit_to`

下面综合官方 shared-nothing 页与 tutorial 的「Hello + 读邻居 shard 数据」模式（逻辑示意，非完整可编译工程）：

```cpp
#include <seastar/core/app-template.hh>
#include <seastar/core/reactor.hh>
#include <seastar/core/smp.hh>
#include <seastar/core/print.hh>
#include <unordered_map>
#include <string>

// 每个 shard 私有一份；绝不跨核直接读别人的 map
static thread_local std::unordered_map<std::string, seastar::sstring> local_database;

seastar::future<> demo_cross_shard(seastar::sstring key) {
    unsigned me = seastar::this_shard_id();
    unsigned neighbor = (me + 1) % seastar::smp::count;

    // 在 neighbor 核上执行 lambda，返回 future<sstring>
    return seastar::smp::submit_to(neighbor, [key] {
        auto it = local_database.find(key);
        if (it == local_database.end()) {
            return seastar::make_ready_future<seastar::sstring>("<missing>");
        }
        return seastar::make_ready_future(it->second);
    }).then([key, neighbor](seastar::sstring value) {
        seastar::print("key=%s on shard %u is %s (queried from shard %u)\n",
                       key, neighbor, value, seastar::this_shard_id());
        return seastar::make_ready_future<>();
    });
}

int main(int argc, char** argv) {
    seastar::app_template app;
    return app.run(argc, argv, [] {
        local_database["user:42"] = "alice";
        return demo_cross_shard("user:42");
    });
}
```

多线程等价物要在 `local_database` 外包 `std::mutex` 或 `shared_mutex`：无争用时原子/缓存一致性仍有成本，高争用时还会上下文切换。Seastar 把「锁」换成「把活派给数据主人」。

### 示例 2：Future 链式 sleep + 并行 echo 服务骨架

Tutorial 中的 sleep 与 TCP echo 模式展示了 continuation 组合与**故意不等待**连接处理 future 以实现并发：

```cpp
#include <seastar/core/sleep.hh>
#include <seastar/core/reactor.hh>
#include <seastar/core/stream.hh>
#include <seastar/core/temporary_buffer.hh>
#include <seastar/net/api.hh>
#include <iostream>

// --- 2a: 三个并行 sleep，1 秒后一起结束 ---
seastar::future<> parallel_sleeps() {
    using namespace std::chrono_literals;
    return seastar::when_all(
        seastar::sleep(1s),
        seastar::sleep(1s),
        seastar::sleep(1s)
    ).discard_result();
}

// --- 2b: 每连接一个异步 fiber；accept 不阻塞在 handle 上 ---
seastar::future<> handle_connection(seastar::connected_socket conn) {
    auto in = conn.input();
    auto out = conn.output();
    return seastar::repeat([in = std::move(in), out = std::move(out)]() mutable {
        return in.read().then([out = std::move(out)](seastar::temporary_buffer<char> buf) mutable {
            if (buf.empty()) {
                return seastar::make_ready_future<seastar::stop_iteration>(
                    seastar::stop_iteration::yes);
            }
            return out.write(std::move(buf)).then([out = std::move(out)]() mutable {
                return out.flush().then([] {
                    return seastar::make_ready_future<seastar::stop_iteration>(
                        seastar::stop_iteration::no);
                });
            });
        });
    });
}

seastar::future<> service_loop() {
    seastar::listen_options lo;
    lo.reuse_address = true;
    return seastar::do_with(
        seastar::listen(seastar::make_ipv4_address({1234}), lo),
        [](seastar::server_socket& listener) {
            return seastar::keep_doing([&listener] {
                return listener.accept().then([](seastar::accept_result res) {
                    // 故意不 return：让 handle 与下一次 accept 并行
                    (void)handle_connection(std::move(res.connection));
                    return seastar::make_ready_future<>();
                });
            });
        });
}
```

`keep_doing` 上一次迭代返回的 future 一 resolve 就发起下一次 `accept`；若 `return handle_connection(...)`，则会变成**串行 accept**（吞吐暴跌）。这是 Seastar 里「fire-and-forget future」的标准惯用法。

## Shared-Nothing 的收益与代价

**收益**（官方 SMP wiki 与 shared-nothing 页归纳）：

- **局部性**：分配、访问、淘汰都在本核完成，对 L1/L2 cache 与 NUMA 友好
- **锁极少**：同一数据结构的访问隐式串行化在单 shard 上
- **扩展路径清晰**：与分布式系统「先分节点、再分片」一致，节点内再加 shard

**代价**：

- 并非所有负载都能按 key 均匀切分；热点 key 会导致单 shard 过热
- 会话状态、跨行事务、全局计数器都要重新设计（显式迁移或复制）
- 编程模型陡峭：future 组合、生命周期、`handle_exception`、关闭顺序都要习惯
- 与阻塞式生态（部分磁盘 API、`mmap`、老式库）不合，需要线程隔离或改写

## 与相近技术对照

| 方案 | 并发模型 | 跨核共享 | 典型场景 |
|------|----------|----------|----------|
| **Seastar** | 每核 reactor + future | 消息传递，无共享数据结构 | ScyllaDB、Redpanda、低延迟 RPC |
| **DPDK** | 轮询 + 每核队列 | 同左，但更偏包处理 | 转发、防火墙、UPF |
| **io_uring** | 内核异步 IO 环 | 应用仍常多线程共享内存 | 通用 Linux 高 IOPS |
| **Go net/http** | goroutine + 阻塞写法 | 共享堆 + GC | 业务 Web，延迟要求宽 |
| **Tokio** | 多线程 runtime 抢任务 | 工作窃取，共享内存 | 通用 Rust 服务 |

Seastar 可以看作把 **DPDK 式 per-core 纪律** 和 **future 组合性** 焊进同一框架，并补上 TCP/定时器/内存分配整套服务器设施。

## 运行与调优提示

- **内存**：生产务必设 `-m` 或 `--reserve-memory`，否则默认吃掉几乎全部物理内存，混部会 OOM。
- **核数**：`-c` 不超过物理硬件线程；绑核策略影响超线程争用。
- **延迟**：关注 reactor stall；用 Seastar 的 stall detector 与调度统计（`reactor::get_sched_stats`）找长任务。
- **关闭**：用 future 决定应用生命周期，不要裸调 `exit()`，否则 reactor 与连接清理会跳过后续步骤。

## 进一步阅读

- [Shared-nothing Design](https://seastar.io/shared-nothing/) — 动机与 `smp::submit_to` 片段
- [Seastar Tutorial](https://docs.seastar.io/master/tutorial.html) — Avi Kivity 著，future/reactor/网络全本
- [SMP / Sharding Wiki](https://github.com/scylladb/seastar/wiki/SMP) — 连接与数据分片策略
- ScyllaDB 技术博客 — 看真实系统如何把 LSM、Raft 嵌进 shard 模型

## 小结

Seastar 回答的问题是：**当核数很多、网卡很快、锁很便宜但不够便宜时，怎样写复杂服务器而不回到回调地狱？** 它的答案是 **shard 级 shared-nothing + 统一 future API + 可选用户态网络栈**。零基础读者可先记住三句话：（1）**数据跟核走，不要跨核指指针**；（2）**异步用 future 链，别阻塞 reactor**；（3）**跨核只走 `submit_to` 等显式通道**。做到这三点，再读 Scylla/Redpanda 源码时，线程模型就不会像一团乱麻了。
