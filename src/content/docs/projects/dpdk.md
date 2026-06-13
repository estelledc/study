---
title: DPDK 零基础学习笔记
来源: https://www.dpdk.org/
日期: 2026-06-13
分类: 网络协议
子分类: 数据包处理
provenance: pipeline-v3
---

# DPDK 零基础学习笔记

## 一、什么是 DPDK？从邮局说起

想象你是一家大型邮局的局长。邮局每天要处理成千上万封信件。

普通的做法是：每个邮递员（CPU 核心）收到一封信，先去前台登记（操作系统内核），前台再安排分类、盖章、配送。前台虽然专业，但它要同时服务所有人，每个邮递员都得排队等它。

DPDK（Data Plane Development Kit，数据平面开发套件）的做法完全不同：

> **DPDK 给每个邮递员一条直通大门的通道，让他们直接取信、直接分类、直接配送，完全跳过前台登记这一步。**

跳过前台（操作系统内核网络栈）意味着：
- 延迟从毫秒级降到微秒级甚至纳秒级
- 每秒钟能处理的信件从几万封飙升到上千万封
- CPU 算力全部用在"处理信件"上，不浪费在"排队登记"上

DPDK 是 Intel 在 2010 年发起的开源项目，现在由全球数百个贡献者共同维护，最新稳定版本已经到 26.07。它是目前工业界最高性能数据包处理的事实标准，被用于：
- 运营商级防火墙和负载均衡器
- 5G 核心网（vEPC、vRAN）
- 虚拟网络功能（VNF）和 NFV
- SDN 数据面

官方网址：https://www.dpdk.org/

## 二、核心概念：四大支柱

理解 DPDK，要掌握四个核心概念。它们之间是环环相扣的。

### 1. EAL（Environment Abstraction Layer，环境抽象层）

EAL 是 DPDK 的门面和起点。任何 DPDK 程序启动时，第一件事就是初始化 EAL。

EAL 帮你做三件事：
- **大页内存（Hugepages）管理**：把物理内存按 2MB 或 1GB 的大块分配，减少 TLB 缺页中断。类比：邮局不再每次只搬一封信，而是每次用大纸箱搬整批信件。
- **CPU 核心绑核（Core Laming）**：把指定的 CPU 核心分配给你的程序独占使用，不让操作系统把其他任务调度过来。类比：给每个邮递员分配专属柜台，别人不能占用。
- **硬件驱动绑定**：把网卡从内核驱动（如 ixgbe）切换到用户态驱动（如 vfio-pci），让用户态程序直接操控网卡。类比：邮递员不再经过前台，直接从仓库门口拿货。

### 2. mbuf（Memory Buffer，内存缓冲）

mbuf 是 DPDK 中数据包的内部分身。你从网卡收到的每一帧网络数据，都会被包装成一个 mbuf 对象。

mbuf 的设计特点：
- 它是一个**链表结构**，可以挂载多个片段（支持 jumbo frame 超大帧）
- 头部预留了足够的空间，方便协议栈逐层剥壳（L2 -> L3 -> L4）
- 每个 mbuf 有引用计数，支持零拷贝共享

### 3. 轮询式数据路径（Poll Mode Driver, PMD）

传统网络驱动是**事件驱动**的：网卡收到数据包，产生中断，操作系统唤醒内核处理。

DPDK 采用**轮询式**：你的程序主动去查网卡"有没有新包？"，有就拿走，没有就继续干别的事。

类比：
- 事件驱动 = 门铃响了才开门拿快递，没响就等着，来回切换状态很累
- 轮询模式 = 每隔几秒去门口看一眼，顺手就拿了，状态切换极少

没有中断就没有上下文切换，这就是 DPDK 高性能的核心原因之一。

### 4. 流水线处理（Pipeline）

DPDK 程序通常以流水线方式处理数据包：收包 -> 解析 -> 匹配 -> 转发/丢弃 -> 发包。

每个数据包流经处理管道的每一个阶段，没有随机内存访问，没有分支预测失败（通过 lpm 查找表等优化），CPU 缓存命中率极高。

## 三、第一个代码示例：最小收发程序

下面这个极简程序演示了 DPDK 程序从初始化到收发包的最少代码。

```c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <rte_eal.h>
#include <rte_ethdev.h>
#include <rte_mbuf.h>
#include <rte_ip.h>

#define NB_RX_DESC   1024
#define NB_TX_DESC   1024
#define RX_MBUF_POOL_SIZE  8192
#define BURST_SIZE   32

// 创建 mbuf 内存池（存放数据包的容器）
struct rte_mempool *mbuf_pool;

int main(int argc, char *argv[])
{
    // 1. 初始化 EAL（解析命令行参数、大页内存、绑核等）
    int ret = rte_eal_init(argc, argv);
    if (ret < 0) {
        fprintf(stderr, "EAL init failed\n");
        return -1;
    }

    // 2. 创建 mbuf 内存池
    mbuf_pool = rte_mempool_create(
        "mbuf_pool",           // 池名称
        RX_MBUF_POOL_SIZE,     // 缓冲区数量
        RTE_MBUF_DEFAULT_BUF_SIZE,  // 每个 mbuf 大小
        0,                     // 对象私有数据大小
        sizeof(struct rte_pktmbuf_pool_private),
        rte_pktmbuf_pool_init, // 池初始化回调
        rte_pktmbuf_init,      // 对象初始化回调
        NULL,                  // 私有数据
        rte_eal_get_affinity(),// CPU 亲和性
        0                      // socket ID
    );
    if (!mbuf_pool) {
        fprintf(stderr, "mbuf pool create failed\n");
        return -1;
    }

    // 3. 初始化第一个网络端口
    struct rte_eth_dev_info dev_info;
    rte_eth_dev_info_get(0, &dev_info);

    struct rte_eth_conf port_conf = {0};
    port_conf.rxmode.max_rx_pkt_len = RTE_ETHER_MAX_LEN;
    rte_eth_dev_configure(0, 1, 1, &port_conf);

    struct rte_eth_txconf txconf = dev_info.default_txconf;
    rte_eth_tx_queue_setup(0, 0, NB_TX_DESC,
                           rte_eth_dev_socket_id(0), &txconf);

    struct rte_eth_rxconf rxconf = dev_info.default_rxconf;
    rte_eth_rx_queue_setup(0, 0, NB_RX_DESC,
                           rte_eth_dev_socket_id(0), &rxconf, mbuf_pool);

    rte_eth_dev_start(0);
    printf("Port 0 started, ready to receive packets\n");

    // 4. 主循环：收包 -> 直接转发（不修改）
    while (1) {
        struct rte_mbuf *pkts[BURST_SIZE];

        // 轮询收包：从端口 0 最多取 BURST_SIZE 个包
        int nb_rx = rte_eth_rx_burst(0, 0, pkts, BURST_SIZE);
        if (nb_rx == 0)
            continue;

        // 批量发回：原路转发，不检查 IP 地址
        rte_eth_tx_burst(0, 0, pkts, nb_rx);
    }

    return 0;
}
```

这个程序做的事情很简单：收到包，马上原封不动地发回去。但背后包含了 DPDK 编程的核心模式：

| 步骤 | API | 说明 |
|------|-----|------|
| 初始化 | `rte_eal_init()` | 启动 DPDK 运行时环境 |
| 分配 | `rte_mempool_create()` | 创建 mbuf 内存池 |
| 配置 | `rte_eth_dev_configure()` | 配置端口收发队列 |
| 收包 | `rte_eth_rx_burst()` | 从网卡批量取包（轮询模式） |
| 发包 | `rte_eth_tx_burst()` | 批量发包到网卡 |

运行方式（需要 root 权限或配置大页）：

```bash
# 编译
make
# 运行：指定 1 个核心，绑定网卡 PCIe 地址
sudo ./app -l 0 -n 4 -- -i
```

## 四、第二个代码示例：带 IP 解析的简单路由器

下面这个程序演示了如何解析 IP 地址并做简单的路由转发：

```c
#include <stdio.h>
#include <rte_eal.h>
#include <rte_ethdev.h>
#include <rte_mbuf.h>
#include <rte_ip.h>
#include <rte_tcp.h>
#include <rte_udp.h>

#define BURST_SIZE   32

int main(int argc, char *argv[])
{
    rte_eal_init(argc, argv);

    struct rte_mempool *mbuf_pool = rte_mempool_lookup("mbuf_pool");
    if (!mbuf_pool) {
        fprintf(stderr, "Failed to find mbuf pool\n");
        return -1;
    }

    // 配置端口 0 收、端口 1 发（模拟两个网段之间的路由）
    rte_eth_dev_configure(0, 1, 1, NULL);
    rte_eth_dev_configure(1, 1, 1, NULL);

    rte_eth_tx_queue_setup(0, 0, 1024, rte_eth_dev_socket_id(0), NULL);
    rte_eth_rx_queue_setup(0, 0, 1024, rte_eth_dev_socket_id(0), NULL, mbuf_pool);

    rte_eth_tx_queue_setup(1, 0, 1024, rte_eth_dev_socket_id(1), NULL);
    rte_eth_rx_queue_setup(1, 0, 1024, rte_eth_dev_socket_id(1), NULL, mbuf_pool);

    rte_eth_dev_start(0);
    rte_eth_dev_start(1);

    printf("Simple router running on ports 0 <-> 1\n");

    // 简化路由：端口 0 收到就发到端口 1，反之亦然
    while (1) {
        struct rte_mbuf *rx_pkts[BURST_SIZE];

        // 从端口 0 收包
        int n = rte_eth_rx_burst(0, 0, rx_pkts, BURST_SIZE);
        if (n > 0) {
            for (int i = 0; i < n; i++) {
                struct rte_ipv4_hdr *ip_hdr = rte_pktmbuf_mtod_offset(
                    rx_pkts[i], struct rte_ipv4_hdr, sizeof(struct ether_hdr));

                if (ip_hdr) {
                    // 打印源和目的 IP（网络字节序）
                    uint8_t *src = (uint8_t *)&ip_hdr->src_addr;
                    uint8_t *dst = (uint8_t *)&ip_hdr->dst_addr;
                    printf("  %d.%d.%d.%d -> %d.%d.%d.%d\n",
                           src[0], src[1], src[2], src[3],
                           dst[0], dst[1], dst[2], dst[3]);
                }
            }
            // 直接转发到端口 1
            rte_eth_tx_burst(1, 0, rx_pkts, n);
        }

        // 从端口 1 收包
        n = rte_eth_rx_burst(1, 0, rx_pkts, BURST_SIZE);
        if (n > 0) {
            rte_eth_tx_burst(0, 0, rx_pkts, n);
        }
    }

    return 0;
}
```

这段代码展示了几个 DPDK 数据面编程的常见模式：

- `rte_pktmbuf_mtod_offset()`：把 mbuf 数据缓冲区转成指针，并偏移一定字节数到达目标协议头。类比：从信封里拿出一封信。
- 网络字节序处理：IP 地址在内存中是大端存储的，代码中逐字节取出再拼接。
- 零拷贝转发：mbuf 本身不拷贝数据，只是修改指针偏移，整个转发过程只有内存访问，没有数据移动。

## 五、DPDK vs 传统内核网络栈对比

| 维度 | 传统内核网络栈 | DPDK |
|------|--------------|------|
| 数据包路径 | 网卡 -> 内核 -> 用户程序 | 网卡 -> 用户程序 |
| 中断 | 每个包或批量触发中断 | 无中断，轮询 |
| 上下文切换 | 用户态<->内核态多次切换 | 无切换，全用户态 |
| 内存拷贝 | 多次 DMA + 内核拷贝 | 一次 DMA，零拷贝转发 |
| 吞吐量 | 百万包/秒（Mpps）级 | 千万包/秒（10+ Mpps）级 |
| 延迟 | 10-100 微秒 | 0.5-2 微秒 |
| CPU 占用 | 高（大量中断处理） | 低（核心专用于业务） |

## 六、学习 DPDK 的建议路径

1. 先跑通 `testpmd` 示例程序（DPDK 自带的交互式测试工具），不用写代码就能看到收发包
2. 读 `examples/hello_world`，理解 EAL 初始化和 mbuf 池
3. 读 `examples/pktgen`，学习发包
4. 读 `examples/l2-forward` 和 `examples/ip-forward`，学习收包和转发
5. 深入阅读 Programmer's Guide 的 architecture 章节，理解 PMD 驱动、mempool、flow 框架

## 七、关键术语表

| 术语 | 含义 |
|------|------|
| EAL | Environment Abstraction Layer，DPDK 的程序启动环境和资源管理层 |
| mbuf | 数据包在用户态的内存表示，链表结构 |
| PMD | Poll Mode Driver，轮询驱动，DPDK 的核心收发包方式 |
| Hugepage | 大页内存，2MB 或 1GB 一块，减少 TLB 缺失 |
| NFV | Network Functions Virtualization，网络功能虚拟化 |
| vNIC | 虚拟网卡，虚拟化环境中的网络接口 |
| bond | 多网卡聚合，DPDK 支持 4 种链路聚合模式 |
| vfio-pci | 用于用户态直通网卡的 IOMMU 驱动 |
