---
title: Efficient IO with io_uring — Linux 异步 IO 的环形队列革命
来源: 'https://kernel.dk/io_uring.pdf'
日期: 2026-06-13
分类: 操作系统
子分类: 内核与虚拟化
难度: 中级
provenance: pipeline-v3
---

## 是什么

Jens Axboe 在 2019 年发表的这篇白皮书，介绍了 Linux 新一代异步 IO 接口 **io_uring**。它的核心思想可以用一句日常类比概括：

> 传统 IO 像**每次点外卖都要打电话**给餐厅确认订单；io_uring 则是在你和厨房之间放**两条共享传送带**——你把订单卡放上去，厨师做完菜把回执放下来，**只有带子快满或你要催单时才按一次门铃**（syscall）。

两条传送带在文档里的正式名称是：

| 名称 | 谁写 | 谁读 | 放什么 |
|------|------|------|--------|
| **SQ ring**（Submission Queue） | 应用程序 | 内核 | 「我要做什么 IO」——Submission Queue Entry（SQE） |
| **CQ ring**（Completion Queue） | 内核 | 应用程序 | 「做完了，结果是…」——Completion Queue Event（CQE） |

io_uring 在 Linux 5.1（2019 年 5 月）合入主线。作者 Axboe 是 Linux block layer 长期维护者，也是磁盘压测工具 **fio** 的作者——他比任何人都清楚旧接口哪里不够用。

## 为什么需要它：旧接口哪里不行

Linux 做文件 IO 的方式很多：`read`/`write`、`pread`/`pwrite`、向量版 `preadv`/`pwritev`……但它们有一个共同点：**同步**——syscall 返回时，数据已经读完或写完。

想要异步，POSIX 有 `aio_read`/`aio_write`，性能往往很差；Linux 还有原生 **libaio**（`io_submit`/`io_getevents`），白皮书列举了它的致命缺陷：

1. **只支持 O_DIRECT**：普通 buffered IO（走 page cache 的读写）在 libaio 里**退化成同步**，大多数应用根本用不了。
2. **提交路径不确定**：元数据 IO、设备 request slot 满时，提交本身可能阻塞——你以为在「异步提交」，实际上还在等。
3. **内存拷贝开销大**：每次提交拷贝 64+8 字节、每次完成拷贝 32 字节，对小块 IO 很亏。
4. **至少两次 syscall**：一次 submit、一次 wait——在 Spectre/Meltdown 之后，syscall 本身就更贵了。

当 NVMe SSD 延迟压到 10µs 以下、单盘 IOPS 破百万时，这些开销从「能忍」变成「卡脖子」。Axboe 最初尝试修补 libaio，发现只能解决其中一个问题，代码还变得更乱——于是**从零设计 io_uring**。

## 设计目标（白皮书 §3）

按重要性从低到高，白皮书列了五条：

1. **易用、难误用** —— 接口直觉清晰。
2. **可扩展** —— 不只服务块设备，还要覆盖网络和未来新 IO 类型。
3. **功能丰富** —— 不让每个应用自己造 IO 线程池。
4. **高效** —— 单请求开销要低，512B～4KB 的小 IO 也要划算。
5. **可扩展（scalability）** —— 单核能榨干现代存储的峰值 IOPS。

这五条看似互相矛盾（高效 + 易用往往冲突），io_uring 用**共享内存 + 环形队列**把矛盾压到最低。

## 核心概念

### 1. 双环 = 生产者-消费者模型

异步 IO 有两类动作：**提交请求**和**收割完成**。

- 提交时：应用是生产者，内核是消费者 → **SQ ring**
- 完成时：内核是生产者，应用是消费者 → **CQ ring**

每个环都是 **SPSC ring buffer**（单生产者单消费者环形缓冲区）：用 `head`/`tail` 两个计数器协调，**不需要和内核抢同一把锁**，靠内存屏障（memory barrier）保证可见性即可。

环大小必须是 **2 的幂**；用 `index = tail & mask` 定位槽位，计数器自然回绕，不必维护「环已满」标志。

### 2. SQE 与 CQE：两张「订单卡」

**SQE**（64 字节，Submission Queue Entry）描述一次 IO 请求：

```c
struct io_uring_sqe {
    __u8  opcode;      // 操作码，如 IORING_OP_READV
    __u8  flags;
    __u16 ioprio;
    __s32 fd;
    __u64 off;         // 文件偏移
    __u64 addr;        // 缓冲区地址或 iovec 指针
    __u32 len;
    /* ... opcode 专用 flags union ... */
    __u64 user_data;   // 内核原样抄到 CQE，用于关联请求
};
```

**CQE**（Completion Queue Event）描述完成结果：

```c
struct io_uring_cqe {
    __u64 user_data;   // 从 SQE 原样带回
    __s32 res;         // 类似 syscall 返回值：成功=字节数，失败=负 errno
    __u32 flags;
};
```

关键约定：**完成顺序 ≠ 提交顺序**。网络乱序、磁盘调度都会让 CQE 乱序到达——必须用 `user_data` 把 SQE 和 CQE 配对，不能假设「第 3 个提交的一定第 3 个完成」。

### 3. SQ 环的间接索引

CQ 环直接索引 CQE 数组；SQ 环则多一层：**环里存的是 SQE 数组的下标**，不是 SQE 本身。这样应用可以把 SQE 嵌进自己的结构体里，批量提交时不必保证 SQE 在内存中连续——迁移老代码更自然。

### 4. 三个 syscall + 三段 mmap

| 步骤 | 系统调用 / 操作 | 作用 |
|------|-----------------|------|
| 创建实例 | `io_uring_setup(entries, &params)` | 返回 fd；`entries` 必须是 2 的幂，1～4096 |
| 映射共享内存 | `mmap(..., IORING_OFF_SQ_RING/CQ_RING/SQES)` | 应用直接读写环和 SQE 数组 |
| 提交 / 等待 | `io_uring_enter(fd, to_submit, min_complete, flags, ...)` | 一次 syscall 可同时「提交 N 个 SQE」和「等 M 个 CQE」 |
| 高级注册 | `io_uring_register(...)` | 预注册 fd、固定 buffer 等（白皮书 §8，后续内核版本扩展） |

`IORING_ENTER_GETEVENTS` 标志告诉内核：如果 CQ 里还没有足够的 CQE，就阻塞等待。但应用也可以**只读 CQ tail**——内核写完 CQE 会直接改 tail，不必每次都 enter。

### 5. 内存屏障：为什么写 tail 前要「栅栏」

CPU 和编译器可能重排写入顺序。如果你先更新了 SQ tail、后写完 SQE 字段，内核可能读到**半张订单卡**。

白皮书规定的模式：

```c
/* 1. 填 SQE 各字段 */
sqe->opcode = IORING_OP_READV;
sqe->fd = fd;
sqe->user_data = (uintptr_t)ctx;
/* 2. 写 SQ 环 array[index] = sqe_index */
io_smp_mb();   /* write barrier：SQE 写入对内核可见 */
sqring->tail = sqring->tail + 1;
io_smp_wmb();  /* 确保 tail 更新最后可见 */
```

读 CQ 时则在读 `cqring->tail` 前加 `read_barrier()`。日常用 **liburing** 库即可，它会按架构选好屏障指令；直接操作 raw ring 才需要自己管。

### 6. 高级特性（白皮书后续章节）

- **IOSQE_IO_DRAIN**：排空 SQ，等前面所有 IO 完成再提交后续 SQE——适合「一堆 write 之后 fsync」。
- **IOSQE_IO_LINK**：链式 SQE，前一个成功才启动下一个——适合有序写或 read→write 管道。
- **IORING_OP_TIMEOUT**：在 CQ 上设超时或完成计数触发器。
- **SQPOLL / IOPOLL**（后续内核版本）：内核线程轮询 SQ，或轮询块设备完成——syscall 数可趋近零。

## 代码示例

### 示例 1：用 liburing 读一个文件（入门）

大多数应用应通过 [liburing](https://github.com/axboe/liburing) 入门，它封装了 setup、mmap、屏障和 enter：

```c
#include <liburing.h>
#include <fcntl.h>
#include <unistd.h>
#include <stdio.h>
#include <string.h>

#define QD 8
#define BSZ 4096

int main(int argc, char **argv) {
    struct io_uring ring;
    char buf[BSZ];
    int fd;

    if (argc < 2) return 1;
    fd = open(argv[1], O_RDONLY);
    if (fd < 0) return 1;

    io_uring_queue_init(QD, &ring, 0);

    struct io_uring_sqe *sqe = io_uring_get_sqe(&ring);
    io_uring_prep_read(sqe, fd, buf, BSZ, 0);
    sqe->user_data = 1;

    io_uring_submit(&ring);           /* 一次 syscall 提交 */

    struct io_uring_cqe *cqe;
    io_uring_wait_cqe(&ring, &cqe);   /* 等完成 */
    if (cqe->res < 0)
        fprintf(stderr, "read err: %s\n", strerror(-cqe->res));
    else
        write(STDOUT_FILENO, buf, cqe->res);

    io_uring_cqe_seen(&ring, cqe);
    close(fd);
    io_uring_queue_exit(&ring);
    return 0;
}
```

对比传统 `read(fd, buf, BSZ)`：这里 **submit 和 wait 可以分开**——submit 后 CPU 可以去干别的，完成后再 `wait_cqe`。批量读文件时，可以在一个 submit 里塞多个 read SQE，syscall 数从「每块一次」降到「每批一次」。

### 示例 2：批量提交 + 循环收割 CQE（白皮书思路）

下面模拟白皮书 §4.2 的流程：先攒一批 SQE，一次 enter，再批量消费 CQE（伪代码风格，展示 ring 语义）：

```c
#include <liburing.h>

#define BATCH 32

void read_file_batch(struct io_uring *ring, int fd, char *bufs[BATCH], off_t base) {
    /* --- 提交阶段：填满 SQ --- */
    for (int i = 0; i < BATCH; i++) {
        struct io_uring_sqe *sqe = io_uring_get_sqe(ring);
        io_uring_prep_read(sqe, fd, bufs[i], 4096, base + i * 4096);
        sqe->user_data = i;   /* 用槽位号关联完成事件 */
    }
    int submitted = io_uring_submit(ring);
    /* submitted 可能 < BATCH：SQ 环满时需先收割再提交 */

    /* --- 完成阶段：head != tail 就有 CQE --- */
    int completed = 0;
    while (completed < submitted) {
        struct io_uring_cqe *cqe;
        if (io_uring_peek_cqe(ring, &cqe) != 0)
            io_uring_wait_cqe(ring, &cqe);  /* CQ 空则 enter 等待 */

        int slot = (int)cqe->user_data;
        if (cqe->res > 0)
            process_chunk(slot, bufs[slot], cqe->res);
        else
            handle_error(slot, cqe->res);

        io_uring_cqe_seen(ring, cqe);
        completed++;
    }
}
```

要点：

- **CQ 默认是 SQ 的 2 倍大**——允许应用短暂「提交快、收割慢」；若 CQ 溢出会计入 overflow 计数。
- `io_uring_peek_cqe` 不阻塞，适合事件循环里先扫一遍已有完成再决定是否 wait。
- 同一 fd 的多个 read **可以并行完成**，顺序由存储栈决定，不是由提交顺序决定。

## 与 epoll 的区别（零基础常混）

| | epoll | io_uring |
|---|-------|----------|
| 角色 | **通知**「fd 可读了」 | **完成**「读操作做完了，数据在这」 |
| 谁做 IO | 应用收到通知后自己 `read` | 内核按 SQE 直接执行 read/write |
| syscall | `epoll_wait` + N 次 `read` | 批量 submit + 批量 reap，可合并 |
| 类比 | 餐厅喊「你的菜好了请自己来端」 | 传菜带直接把菜送到你桌上 |

很多高性能服务器以前用 epoll + 非阻塞 IO；io_uring 把「等就绪 + 做 IO + 拿结果」整条链收进共享环里，尤其在 **高 IOPS 磁盘** 和 **multishot 网络**（一次 SQE 持续产出多个 CQE）场景优势更大。

## 适用 vs 不适用

**适合**：

- 数据库 / KV / 日志等磁盘密集型服务（PostgreSQL 17+、ScyllaDB、RocksDB 生态）
- 自研 thread-per-core 或 runtime（Tokio、monoio）控制调度
- Linux 5.10+ 且你能接受较新的内核依赖

**不太适合**：

- 多租户 / 高安全场景——io_uring 暴露的内核攻击面曾引发 Google 在 Android/ChromeOS 上默认禁用
- CPU 已是瓶颈、IO 很少的小工具——复杂度不值
- 必须跑老内核（RHEL 7/8 早期）——要么没有 io_uring，要么 op 支持残缺

## 历史脉络

- **2003**：Linux native aio（libaio）进内核，但 O_DIRECT 限制埋下祸根。
- **2010**：Axboe 等人尝试扩展 libaio 支持 buffered IO，未成功。
- **2018 末**：Axboe 放弃修补 libaio，开始 io_uring 原型（当时叫 scqring）。
- **2019-01**：发表白皮书 *Efficient IO with io_uring*（本文来源 PDF）。
- **2019-05**：Linux 5.1 合入主线（commit `2b188cc`）。
- **2020–2025**：持续演进——buffered read/write、SQPOLL、multishot accept/recv、零拷贝 send、io_uring 上的 `openat`/`statx` 等，接口从「块 IO 加速器」长成「通用异步 syscall 管道」。

## 学到什么

1. **共享内存 + 无锁环** 可以替代大量 syscall——这是 io_uring、eBPF ring buffer、DPDK 的共同方向。
2. **批量摊销** 永远有效：N 次 IO 合并成 1 次 `io_uring_enter`，是白皮书强调的首要效率来源。
3. **完成语义 ≠ 就绪语义**：从 epoll 思维切到 io_uring，要想「操作已完成」而不是「现在可以调 read 了」。
4. **新接口也要看版本**：白皮书描述的是 2019 基础 API；具体 op 列表和性能特性以当前内核 man page 为准。

## 延伸阅读

- 白皮书原文：[Efficient IO with io_uring (PDF)](https://kernel.dk/io_uring.pdf)
- LWN 导读：[Ringing in a new asynchronous I/O API](https://lwn.net/Articles/776703/)
- 用户态库：[axboe/liburing](https://github.com/axboe/liburing) 与 `examples/` 目录
- man page：[io_uring(7)](https://man7.org/linux/man-pages/man7/io_uring.7.html)、[io_uring_setup(2)](https://man7.org/linux/man-pages/man2/io_uring_setup.2.html)
- 视频：[Kernel Recipes 2019 — Faster IO through io_uring](https://www.youtube.com/watch?v=-5T4Cjw46ys)

## 关联

- [[io-uring]] —— 本仓库另一篇 io_uring 实践向笔记（multishot、SQPOLL 性能数字）
- [[ebpf]] —— 同样是用户态/内核共享数据结构，但安全模型不同
- [[nvme-protocol-2017]] —— 把磁盘延迟压到 10µs 级，放大旧 aio 的 syscall 瓶颈
- [[postgresql]] —— PG 17 起在 Linux 上推荐 io_uring 作为异步 IO 后端
- [[quic]] —— 用户态网络栈与 io_uring 网络 op 的演进方向
- [[flexsc-2010]] —— 更早的「syscall 异步化」思路，io_uring 是 Linux 主线上的落地

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
