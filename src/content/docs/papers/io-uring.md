---
title: io_uring — Linux 让 N 次 IO 摊销到 1 次 syscall
来源: 'Jens Axboe, "Efficient IO with io_uring", kernel.dk 白皮书 2019; Linux 5.1 mainline 2019-05'
日期: 2026-05-30
分类: 操作系统
难度: 高级
---

## 是什么

io_uring 是 Linux 在 2019 年加的一套**异步 IO 接口**，它让用户程序和内核**共享两条传送带**——用户把 IO 请求放上去、内核取走做、做完把结果再放回另一条带子上。日常类比：餐厅放两条传菜带——客人把订单卡放上行带，厨师从下行带送回成品菜，**只在带子要满或要空时按一下铃**。

两条传送带的正式名字：

- **SQ ring**（Submission Queue）：用户写、内核读，放"我要做什么 IO"
- **CQ ring**（Completion Queue）：内核写、用户读，放"做完了，结果是什么"

```c
// 准备一个 read 请求，不进内核
struct io_uring_sqe *sqe = io_uring_get_sqe(&ring);
io_uring_prep_read(sqe, fd, buf, 4096, 0);
io_uring_submit(&ring);  // 一次 syscall 提交一批
```

传统写法每次 read/write 都要进内核（一次 syscall），10000 个并发 IO 就要 10000+ 次。io_uring 让用户在共享内存里直接写"订单卡"，内核读到一批一起做，syscall 数砍到几百甚至零。这是 ScyllaDB、Tokio（可选）和 PostgreSQL 18（`io_method=io_uring`）愿意接它的核心原因。

## 为什么重要

不理解 io_uring，下面这些事都没法解释：

- 为什么 PostgreSQL 18 在 Linux 上提供 `io_method=io_uring`（默认仍是 `worker`），ScyllaDB / Tokio 也把它做成可选高性能后端
- 为什么 Android / ChromeOS 默认**关掉** io_uring（CVE 多）—— 性能和安全的权衡
- 为什么 epoll 是"通知接口"而 io_uring 是"完成接口"，差一个字差很大
- 为什么"共享内存代替 syscall"是这十年系统编程最重要的范式转移之一

## 核心要点

io_uring 把"提交 IO 请求"这件事拆成 **三步**：

1. **共享内存代替 syscall**：用户进程 mmap 三段内核内存——SQ ring（请求队列）/ CQ ring（完成队列）/ SQE 数组。类比：放在邻居家厨房里的两个篮子，不用敲门也能放菜取菜。

2. **批量提交 + 异步完成**：用户写完一批 SQE 后，调一次 io_uring_enter 告诉内核"快看看篮子"。内核取走、做完后把结果写到 CQ ring，用户再批量取。类比：每攒满一篮子才按铃，不是每放一个菜都按一次。

3. **SQPOLL：连铃都不按**：开 IORING_SETUP_SQPOLL 后，内核会启一个线程**自己定期看 SQ ring 篮子**有没有新订单，用户连那一次 enter syscall 都省了——稳态下 syscall 数 = 0。

三件事加起来，让 Linux 第一次拥有"真正可以摊销到零"的异步 IO 接口。

## 实践案例

### 案例 1：cat 改写成 io_uring 版

```c
struct io_uring ring;
io_uring_queue_init(8, &ring, 0);
struct io_uring_sqe *sqe = io_uring_get_sqe(&ring);
io_uring_prep_read(sqe, fd, buf, BUF_SZ, offset);
io_uring_submit(&ring);          // 一次 syscall 提交
struct io_uring_cqe *cqe;
io_uring_wait_cqe(&ring, &cqe);  // 阻塞等结果（也可批量等）
write(STDOUT_FILENO, buf, cqe->res);
io_uring_cqe_seen(&ring, cqe);   // 告诉内核"我处理完这个 CQE 了"
```

`strace -c` 数 syscall：传统 cat 每读一块一次 read，io_uring 版每 N 块才一次 io_uring_enter。文件越大、buffer 越小，差距越明显——这是 io_uring 在数据库 / 日志场景受益的根源。

### 案例 2：开 SQPOLL 把 syscall 砍到 0

```c
struct io_uring_params p = { .flags = IORING_SETUP_SQPOLL,
                             .sq_thread_idle = 1000 };
io_uring_queue_init_params(256, &ring, &p);
// 之后 io_uring_submit 内部判断 SQPOLL 已开，直接返回，不进内核
```

内核启一个 thread 自己轮询 SQ tail，**用户态 submit 是纯内存操作**。代价：那个内核线程会 100% 占一个 CPU 核（idle 1s 后才睡），所以小机器别用。Axboe 实测 Optane SSD 4k 随机读：默认模式 1.7M IOPS，开 SQPOLL 到 2.4M，再加 fixed buffers 到 3.2M。

### 案例 3：multishot accept 一次 SQE 接所有连接

```c
sqe = io_uring_get_sqe(&ring);
io_uring_prep_multishot_accept(sqe, listen_fd, NULL, NULL, 0);
io_uring_submit(&ring);
// 之后每来一个新连接，内核就写一个 CQE 进 CQ ring
// 用户循环消费 CQE，不需要再 prep_accept
while (io_uring_wait_cqe(&ring, &cqe) == 0) {
    int conn_fd = cqe->res;  // 新连接的 fd
    // ... 派发 worker 处理 ...
    io_uring_cqe_seen(&ring, cqe);
}
```

CQE 带 `IORING_CQE_F_MORE` 标记表示"还会有更多 CQE 来"。比 epoll + accept 写法省掉所有重新提交的开销，echo server 实测吞吐翻倍。multishot recv 也是同理——接收端一次 prep，内核每收到一段数据就推一个 CQE。

## 踩过的坑

1. **SQE 64 字节里多个 union**：opcode 写错时内核按当前 opcode 重新解释 addr/len，**没有报错只是无声 garbage**——读了半成品数据自己都不知道，liburing helper 是兜底。
2. **CQE 完成顺序 ≠ SQE 提交顺序**：先提交的可能后完成（IO 调度 + 网络乱序），必须靠 sqe->user_data 这个 64-bit 不透明值关联请求和完成，依赖顺序写代码会偶发出错。
3. **SQPOLL 烧一个核**：内核 poll 线程 idle 1s 后才睡，2 核机器开了反而拖慢；且 5.13+ 限制只有 root 才能开（Spectre 后的安全收紧），容器环境多半用不了。
4. **老 kernel 大量 op 退化成同步**：< 5.6 很多 op 在内核 worker thread 里跑 sync 调用，看起来像异步实则不是；RHEL 8 (4.18) 完全没有 io_uring，部署前必须看清 kernel 版本。

## 适用 vs 不适用场景

**适用**：

- 高 IOPS 磁盘（OLTP / KV 存储 / 日志）—— 配合 fixed buffers + SQPOLL
- 高并发网络 server（>100k cps）—— multishot accept/recv 减 SQE 数量
- 自己控制调度的 thread-per-core runtime（Tokio / monoio / seastar）

**不适用**：

- 多租户 / 安全敏感场景（Android / ChromeOS / 公有云）—— attack surface 大
- CPU-bound 工作流 —— syscall 不是瓶颈，io_uring 复杂度不值
- 需要在老 kernel（< 5.10）跑 —— op 支持碎片化，性能不稳
- 小 IO（< 4k）+ 低并发 —— epoll + non-blocking 简单且差距不大

## 历史小故事（可跳过）

- **2002**：Davide Libenzi 加 epoll，解决 select/poll 的 O(N) 扫描问题，但 epoll 只通知不做 IO。
- **2003**：Suparna Bhattacharya（IBM）加 native aio（io_submit/io_getevents），但只支持 O_DIRECT，buffered IO 退化成同步——Axboe 后来直接说"native aio is fundamentally broken"。
- **2018**：Jens Axboe 开始 io_uring 原型设计；他是 fio benchmark 作者 + Linux block layer 维护者 20+ 年，看遍了所有异步 IO 烂路。
- **2019-01**：发表白皮书 "Efficient IO with io_uring"，2019-05 Linux 5.1 mainline 合入（commit 2b188cc1bb85）。
- **2020-2024**：5 年持续演化——5.6 全 op 异步化、5.8 buffered IO、5.18 multishot accept/recv、6.1 zero-copy send。
- **2025**：PostgreSQL 18 引入异步 IO 子系统，Linux 上可选 `io_method=io_uring`（默认 `worker`）。一个人推动了 Linux 异步 IO 历史上最大一次重构。

## 学到什么

1. **共享内存可以代替 syscall** —— 这是过去十年系统编程最重要的范式转移之一，eBPF / DPDK / io_uring 都在这条线上，方向高度一致
2. **批量化几乎总是赢** —— N 次操作摊销到 1 次入口（io_uring_enter），是性能优化的通用法宝，跨领域都好使
3. **接口好不好用 ≠ 设计好不好** —— io_uring 设计目标是 "easy to use, hard to misuse"，但 SQE union 字段实际让它 "hard to use, easy to misuse"
4. **性能和安全经常打架** —— Google 拒绝 io_uring 不是没道理，CVE 数量和性能收益要权衡，多租户场景要慎重

## 延伸阅读

- 白皮书原文：[Efficient IO with io_uring](https://kernel.dk/io_uring.pdf)（19 页，Axboe 亲笔，必读）
- LWN 系列：[/Articles/776703 Ringing in a new asynchronous I/O API](https://lwn.net/Articles/776703/)（同期介绍）
- 官方用户态库：[axboe/liburing](https://github.com/axboe/liburing) examples 目录跑通是入门第一步
- man page：[io_uring_setup(2)](https://man7.org/linux/man-pages/man2/io_uring_setup.2.html)（API 权威参考）
- 视频：[Jens Axboe — io_uring deep dive](https://www.youtube.com/watch?v=-5T4Cjw46ys)（设计者本人讲设计动机）

## 关联

- [[ebpf]] —— 同样是"用户态写、内核态读共享数据结构"范式，安全模型不同（eBPF 有 verifier，io_uring 没有）
- [[tcp]] —— io_uring 网络异步化的目标对象，多 TCP 连接场景受益最大
- [[tls-1.3]] —— TLS 握手 + 数据 IO 都可放进 io_uring，端到端零 syscall 路径
- [[nginx]] —— 经典 epoll 用户，io_uring 后端到 2024 仍是 experimental，没默认开
- [[postgresql]] —— 18 版起 Linux 可设 io_method=io_uring（默认仍是 worker）
- [[postgres-js]] —— 客户端走 epoll，与服务端 io_uring 互补成完整异步链

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[arrakis-2014]] —— Arrakis 2014 — 让操作系统退出数据路径
- [[demikernel-2021]] —— Demikernel 2021 — 微秒级数据中心的 LibOS 架构
- [[exokernel-1995]] —— Exokernel — 把抽象推到用户态的极致设计
- [[ffs-1984]] —— FFS — 把磁盘几何写进文件系统
- [[flexsc-2010]] —— FlexSC — 把系统调用从同步陷入改成异步队列
- [[ix-2014]] —— IX 2014 — 用硬件保护做高吞吐低延迟的数据面 OS
- [[michael-scott-queue]] —— Michael-Scott Queue — 用 CAS 做高性能并发队列
- [[nvme-protocol-2017]] —— NVMe — 为 SSD 重写的存储协议
- [[quic]] —— QUIC — 把可靠传输从内核搬到用户空间
- [[snap-2019]] —— Snap 2019 — Google 把网络栈搬到用户态微内核
- [[tigerbeetle]] —— TigerBeetle — 只能记账但把记账做到极致的金融数据库
