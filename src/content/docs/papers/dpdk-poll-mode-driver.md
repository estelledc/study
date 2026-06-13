---
title: Data Plane Development Kit (DPDK) Architecture — 用户态线速网络栈零基础导读
来源: https://www.dpdk.org/wp-content/uploads/sites/35/2014/09/DPDK-SFSummit2014-HighPerformanceNetworkingLeveragingDPDK-Brief.pdf
日期: 2026-06-13
子分类: 内核与虚拟化
分类: 操作系统
provenance: pipeline-v3
---

## 先想成什么事

想象一家**超繁忙的快递分拣中心**：

- **传统内核网络栈**像「电话通知制」：每来一车货，分拣员放下手头工作接电话、跑去门口接货、登记入库、再回来继续——**中断（interrupt）** 打断了流水线，而且登记处（内核协议栈）要经过多层审批，小包多时 CPU 全耗在「接电话」上。
- **DPDK** 的做法是：在分拣中心门口派一个**专职盯传送带的人**（poll mode），**不接电话、不等人叫**，而是每隔几微秒抬头看一眼「皮带上有没有新包裹」——有就一把抓一批（burst），没有就继续看。为了不被操作系统打扰，这个人还**独占一个工位**（绑核）、用**超大号托盘**搬货（hugepage）、和隔壁工位用**无锁传送带**递包裹（lockless ring）。

Intel 在 2014 年 SF Summit 的 briefing《High Performance Networking Leveraging DPDK》里概括了这套思路的起源：数据中心流量爆炸，**10G/40G 线速**要求每包 CPU 预算降到几十纳秒级，而传统「中断 + 内核拷贝 + 系统调用」的路径在百万 PPS 下根本撑不住。DPDK（Data Plane Development Kit）把**网卡驱动、内存管理、无锁队列**整套搬到**用户态**，用 **Poll Mode Driver（PMD）** 轮询收发包，成为 NFV、5G UPF、云网关、负载均衡器的工业标准底座。

> 定位澄清：DPDK **不是**一个完整的 TCP/IP 协议栈，而是**数据面基础设施**——你仍然可以叠 F-Stack、VPP、OVS-DPDK 或自研 L3/L4 逻辑在它上面。

## 为什么需要 DPDK

### 内核网络栈的瓶颈

| 问题 | 具体表现 |
|------|----------|
| 中断开销 | 高频小包下，CPU 时间耗在中断上下文切换，而非业务逻辑 |
| 内核拷贝 | sk_buff 分配、协议栈层层拷贝，cache miss 严重 |
| 锁竞争 | 多核共享 socket、qdisc、路由表，锁与 cache line 乒乓 |
| 调度不确定性 | 线程被内核抢占，延迟尾（p99/p999）拉长 |
| 每包 syscall | `read`/`send` 路径无法批量摊薄固定成本 |

### DPDK 的取舍

| 得到 | 付出 |
|------|------|
| 线速收发包（单核百万 PPS 级） | 需**独占 CPU 核心**做 poll，空载也占满一核 |
| 用户态直接操作 DMA 描述符 | 绕过内核网络栈，**失去** socket API、iptables 等现成设施 |
| 预分配内存池、零拷贝倾向 | 启动时吃满 hugepage，内存占用「看起来很大」 |
| 可预测的微秒级延迟 | 应用要自己处理多核模型、NUMA、丢包策略 |

Briefing 强调：DPDK 的目标不是替代 Linux，而是让**数据面**（forwarding、分类、封装）从**控制面**（路由协议、管理面 CLI）里拆出来——这与后来的 Arrakis、IX、VPP 控制/数据分离一脉相承。

## 整体架构

```text
┌─────────────────────────────────────────────────────────────┐
│                    你的应用 (l2fwd / VPP / OVS / 自研)         │
├─────────────────────────────────────────────────────────────┤
│  librte_ethdev (PMD API)  │  librte_mbuf  │  librte_ring     │
│  librte_mempool           │  librte_hash  │  librte_lpm ...  │
├─────────────────────────────────────────────────────────────┤
│              EAL — Environment Abstraction Layer             │
│   绑核 / hugepage / PCI 映射(UIO/VFIO) / 日志 / 定时器 / IPC   │
├─────────────────────────────────────────────────────────────┤
│   Poll Mode Drivers (ixgbe / i40e / mlx5 / virtio ...)       │
├─────────────────────────────────────────────────────────────┤
│        网卡硬件 (RX/TX rings, DMA, RSS, checksum offload)     │
└─────────────────────────────────────────────────────────────┘
         ▲ 绕过传统内核网络栈（数据面在用户态）
         │ 控制面仍可走 Linux（配置 IP、路由、BGP…）
```

## 核心概念

### 1. EAL — 环境抽象层

EAL 是 DPDK 的「开机固件」。应用启动时第一个调用 `rte_eal_init()`，由它完成：

- 解析命令行：`-l` 绑定逻辑核、`-n` 内存通道、`--socket-mem` 按 NUMA 预分配、`--huge-dir` 指定大页挂载点；
- 通过 **VFIO/UIO** 把 PCIe 网卡 BAR 空间 **mmap** 进用户态；
- 在 **hugetlbfs** 上分配物理连续、TLB 友好的内存；
- 区分 **master lcore**（做全局初始化）与 **worker lcore**（跑数据面循环）。

没有 EAL，后面的 mempool、PMD、ring 都无法在「裸金属式」环境里落地。

### 2. PMD — Poll Mode Driver

PMD 是 DPDK 的名片：**不用 RX 中断**（链路状态变化中断除外），由应用在循环里调用 `rte_eth_rx_burst()` / `rte_eth_tx_burst()` **批量**拉取或提交报文。

关键设计原则（官方 PMD 架构文档与 2014 briefing 一致）：

- **Burst-oriented**：一次处理 32/64 个包，摊薄函数调用与 PCIe 门铃开销；
- **零拷贝倾向**：DMA 直接写入 `rte_mbuf` 数据区，驱动填好 descriptor 元数据；
- **Per-queue 独占**：典型部署「一核一网卡队列」，避免跨核抢锁；
- **硬件 offload**：RSS、checksum、TSO、VLAN strip 的结果写进 `rte_mbuf` 元数据字段。

两种主流编程模型：

| 模型 | 行为 | 适用 |
|------|------|------|
| **Run-to-completion** | 同一核上收包 → 处理 → 发包 | 简单转发、L2/L3 网关 |
| **Pipeline** | RX 核把 `rte_mbuf` 指针经 `rte_ring` 扔给 worker 核 | 复杂处理、多阶段流水线 |

### 3. rte_mempool 与 rte_mbuf

**mempool** 是预分配的**对象池**（通常是 `rte_mbuf`），启动时一次性从 hugepage 切好，运行时 **O(1)** 借还，避免 `malloc` 与内核伙伴系统。

**mbuf**（`struct rte_mbuf`）是 DPDK 的「快递单 + 包裹」：

- **metadata**：包长、端口、RSS hash、VLAN、offload 标志、引用计数；
- **data buffer**：实际帧字节，带 `RTE_PKTMBUF_HEADROOM` 便于封装头部；
- **chaining**：大包可分多个 segment 链表；
- **indirect mbuf**：克隆/广播时共享同一块数据区，避免复制。

mbuf 从哪个 pool 分配，释放时就回哪个 pool——**无 GC**，路径确定性极高。

### 4. rte_ring — 核间无锁 FIFO

`rte_ring` 是实现 pipeline 的「传送带」：**多生产者 / 多消费者** 的无锁环形队列（基于 CAS 更新 head/tail）。相比内核 pipe 或 mutex 队列，它针对 **bulk enqueue/dequeue** 优化，且要求运行在 **DPDK 绑定的非抢占 lcore** 上（否则 preempt 会破坏无锁假设）。

mempool 内部也用 ring 管理空闲对象；应用层则用它做 **producer → consumer** 报文传递。

### 5. NUMA 与本地内存

Briefing 与后续文档反复强调：**网卡、内存、处理核应在同一 NUMA node**。跨 node 访问远程内存会让 PCIe 吞吐白白损失。实践规则：

- 在 `socket_id = rte_eth_dev_socket_id(port)` 对应的 node 上 `rte_pktmbuf_pool_create()`；
- RX/TX descriptor ring 里的 mbuf 全部来自该本地 pool；
- `rte_eth_dev_configure()` 的 `rx_queues` / `tx_queues` 与 lcore 一一绑定。

### 6. Hugepage

默认 4KiB 页：百万级 mbuf 会让 TLB **疯狂 miss**。DPDK 默认走 **2MB / 1GB hugepage**，把 TLB 压力降一个数量级。部署前通常需要：

```bash
# Linux 示例：预留 1024 个 2MB 大页（约 2GB）
echo 1024 | sudo tee /sys/kernel/mm/hugepages/hugepages-2048kB/nr_hugepages
sudo mkdir -p /mnt/huge
sudo mount -t hugetlbfs nodev /mnt/huge
```

应用通过 EAL 参数 `--socket-mem=2048` 等在这些大页上建 mempool。

## 代码示例一：最小 EAL 初始化 + 端口配置骨架

下面片段展示典型 DPDK 应用的**启动序列**（改编自官方 `basicfwd` / `l2fwd` 样例结构，省略错误处理细节）：

```c
#include <rte_eal.h>
#include <rte_ethdev.h>
#include <rte_mbuf.h>

#define RX_RING_SIZE 1024
#define TX_RING_SIZE 1024
#define NUM_MBUFS 8191
#define MBUF_CACHE_SIZE 250
#define BURST_SIZE 32

static const struct rte_eth_conf port_conf_default = {
    .rxmode = { .max_lro_pkt_len = RTE_ETHER_MAX_LEN },
};

int main(int argc, char **argv)
{
    struct rte_mempool *mbuf_pool;
    uint16_t portid;

    /* 1. EAL：绑核、hugepage、PCI 探测 */
    int ret = rte_eal_init(argc, argv);
    if (ret < 0)
        rte_exit(EXIT_FAILURE, "EAL init failed\n");

  argc -= ret;
  argv += ret;

    /* 2. 检查可用以太网端口 */
    if (rte_eth_dev_count_avail() == 0)
        rte_exit(EXIT_FAILURE, "No Ethernet ports\n");

    /* 3. 在网卡所在 NUMA node 创建 mbuf 池 */
    mbuf_pool = rte_pktmbuf_pool_create(
        "MBUF_POOL", NUM_MBUFS, MBUF_CACHE_SIZE, 0,
        RTE_MBUF_DEFAULT_BUF_SIZE, rte_socket_id());

    /* 4. 配置每个端口：1 RXQ + 1 TXQ，挂接 mbuf pool */
    RTE_ETH_FOREACH_DEV(portid) {
        struct rte_eth_rxconf rxq_conf =
            dev_info.default_rxconf;
        struct rte_eth_txconf txq_conf =
            dev_info.default_txconf;

        ret = rte_eth_dev_configure(portid, 1, 1, &port_conf_default);
        ret = rte_eth_rx_queue_setup(portid, 0, RX_RING_SIZE,
            rte_eth_dev_socket_id(portid), &rxq_conf, mbuf_pool);
        ret = rte_eth_tx_queue_setup(portid, 0, TX_RING_SIZE,
            rte_eth_dev_socket_id(portid), &txq_conf);
        ret = rte_eth_dev_start(portid);
        rte_eth_promiscuous_enable(portid);
    }

    /* 5. 各 worker lcore 进入 lcore_launch 跑收发包循环 */
    rte_eal_mp_remote_launch(lcore_main, NULL, CALL_MAIN);
    rte_eal_mp_wait_lcore();
    return 0;
}
```

要点：**EAL init → mempool → eth_dev configure/queue setup → start → 绑核循环**。任何一步漏掉 NUMA 对齐，性能都会「看起来能跑、一压测就塌」。

## 代码示例二：Run-to-completion 收发包循环

这是 PMD **poll 模式**的心脏——没有 `select`，没有阻塞 `read`，只有持续的 **rx_burst → 处理 → tx_burst**：

```c
static int lcore_main(void *arg)
{
    const uint16_t portid = 0;   /* 简化：单端口 */
    const uint16_t queueid = 0;
    struct rte_mbuf *bufs[BURST_SIZE];
    const uint16_t nb_ports = rte_eth_dev_count_avail();

    printf("Core %u forwarding packets\n", rte_lcore_id());

    for (;;) {
        /* 轮询 RX：一次最多收 BURST_SIZE 个包 */
        uint16_t nb_rx = rte_eth_rx_burst(portid, queueid,
                                          bufs, BURST_SIZE);
        if (unlikely(nb_rx == 0))
            continue;

        for (uint16_t i = 0; i < nb_rx; i++) {
            struct rte_mbuf *m = bufs[i];
            /* 读 L2 头示例：以太网目的 MAC 在 buf_addr + data_off */
            struct rte_ether_hdr *eth =
                rte_pktmbuf_mtod(m, struct rte_ether_hdr *);
            (void)eth; /* 实际应用：ACL、meter、改写 TTL… */
        }

        /* 简易 L2 转发：从 port 0 收到，从 port 1 发出 */
        const uint16_t dst_port = (portid + 1) % nb_ports;
        uint16_t nb_tx = 0;
        while (nb_tx < nb_rx) {
            uint16_t sent = rte_eth_tx_burst(dst_port, queueid,
                &bufs[nb_tx], nb_rx - nb_tx);
            nb_tx += sent;
        }

        /* 未发完的 mbuf 必须释放，否则泄漏 pool */
        if (unlikely(nb_tx < nb_rx)) {
            for (uint16_t i = nb_tx; i < nb_rx; i++)
                rte_pktmbuf_free(bufs[i]);
        }
    }
    return 0;
}
```

注意 `rte_eth_tx_burst()` **可能一次发不完**——网卡 TX ring 满时要重试或释放未发送的 mbuf。生产代码还会统计 `imissed`、`ierrors`、做 QoS 限速。

## Pipeline 模型补充：rte_ring 传递 mbuf

当单核跑不完复杂逻辑时，RX 核只做「收包入队」：

```c
struct rte_ring *ring = rte_ring_create("RX_TO_WORKER",
    4096, rte_socket_id(), RING_F_SP_ENQ | RING_F_SC_DEQ);

/* RX lcore */
uint16_t n = rte_eth_rx_burst(port, q, bufs, BURST_SIZE);
rte_ring_sp_enqueue_bulk(ring, (void **)bufs, n, NULL);

/* Worker lcore */
uint16_t m = rte_ring_sc_dequeue_burst(ring, (void **)bufs, BURST_SIZE, NULL);
/* …处理后再 tx_burst 或转发到下一级 ring… */
```

`SP`/`SC`（单生产者单消费者）模式最快；多 worker 时用默认 MP/MC 模式。

## 与内核栈、XDP、io_uring 的对比

| 维度 | 内核网络栈 | DPDK PMD | Linux XDP | io_uring（网络扩展） |
|------|-----------|----------|-----------|---------------------|
| 运行态 | 内核 | 用户态 | 内核最早 hook | 用户态提交、内核执行 |
| 触发方式 | 中断驱动为主 | 轮询为主 | 可中断可 busy-poll | 事件驱动 |
| API 风格 | socket | `rte_eth_*` burst | BPF + redirect | 环形队列 |
| 隔离性 | 进程间强隔离 | 需信任应用 | 有 verifier | 依赖内核 |
| 典型场景 | 通用服务器 | NFV/网关/UPF | 可编程早期过滤 | 通用异步 IO |

eBPF/XDP 适合「在现有栈里加可编程钩子」；DPDK 适合「**整块数据面搬出内核**换极致吞吐」。二者也常组合：XDP 做早期丢弃，DPDK 做 heavy forwarding。

## 部署与运维要点

1. **CPU 隔离**：`isolcpus` + `taskset` 或 cgroup cpuset，防止 Linux 调度器把其他进程塞进 DPDK 核。
2. **大页预留**：容器里跑 DPDK 需挂载 hugepage volume（K8s `emptyDir medium: HugePages`）。
3. **VFIO 而非 UIO**：现代部署优先 `vfio-pci`，IOMMU 隔离更安全。
4. **链路状态**：PMD 对链路 up/down 可能用中断回调；数据面仍是 poll。
5. **功耗**：纯 poll 空转费电；低流量时可切 **interrupt mode** 或 **rte_power** 降频（有性能代价）。

## 生态与后续影响

2014 briefing 发布时，DPDK 主要由 Intel 主导，驱动覆盖 1G/10G/40G；如今（DPDK 26.x）已演进为 **Linux Foundation 开源项目**，驱动涵盖 mlx5、AWS ENA、virtio-user、crypto、eventdev、GPU DMA 等。

下游项目：

- **OVS-DPDK** / **VPP** — 开源虚拟交换与路由；
- **SPDK** — 同一套 EAL + hugepage 思路用于 NVMe 存储；
- **FD.io VPP、Open vSwitch、TRex** 流量发生器；
- 云厂商 **智能网卡（SmartNIC）** 把部分 PMD 逻辑下沉硬件。

学术上，IX（OSDI'14）用 DPDK 做数据面、Arrakis 强调控制面分离、Demikernel 统一 RDMA/DPDK——**「用户态数据面 + 内核控制面」** 成为数据中心共识。

## 学习路径建议

1. 读官方 [DPDK Programmer's Guide — Overview](https://doc.dpdk.org/guides/prog_guide/overview.html) 与 [Poll Mode Driver](https://doc.dpdk.org/guides/prog_guide/poll_mode_drv.html)。
2. 跑通 `dpdk/examples/l2fwd` 与 `rxtx_callbacks`，用 `testpmd` 熟悉 burst 与 offload 标志位。
3. 用 `perf` / `rte_eth_stats_get()` 观察 `ipackets`、`imissed`、`rx_nombuf`（pool 耗尽信号）。
4. 读 **IX、Arrakis** 笔记，理解 DPDK 在「数据面 OS」大图里的位置。

## 小结

DPDK 的本质不是「又一个网卡驱动」，而是一套**为用户态线速转发定制的运行时**：EAL 屏蔽 OS 差异，hugepage + mempool 消灭分配抖动，mbuf 统一报文元数据，rte_ring 连接流水线各段，PMD 用 **burst poll** 把 PCIe 与 CPU cache 喂饱。代价是独占核心、放弃内核 socket 语义、直面 NUMA 与内存预分配——**用运维复杂度换每包纳秒级成本**，这正是 100G 时代 NFV 和云原生网关愿意买单的原因。

## 参考

- [High Performance Networking Leveraging DPDK (SF Summit 2014 Briefing PDF)](https://www.dpdk.org/wp-content/uploads/sites/35/2014/09/DPDK-SFSummit2014-HighPerformanceNetworkingLeveragingDPDK-Brief.pdf)
- [DPDK Programmer's Guide — Overview](https://doc.dpdk.org/guides/prog_guide/overview.html)
- [DPDK Poll Mode Driver Architecture](https://doc.dpdk.org/guides/prog_guide/poll_mode_drv.html)
- [DPDK Mbuf Library](https://doc.dpdk.org/guides/prog_guide/mbuf_lib.html)
- [DPDK Ring Library](https://doc.dpdk.org/guides/prog_guide/ring_lib.html)
- [IX: A Protected Dataplane Operating System (OSDI'14)](/papers/ix-2014)
