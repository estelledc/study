---
title: "DPDK 零基础学习笔记"
来源: https://www.dpdk.org/
日期: 2026-06-13
分类: 操作系统
子分类: 内核与虚拟化
provenance: pipeline-v3
---

# DPDK 学习笔记

## 一、DPDK 是什么？用一个日常类比理解

想象一下，你是一家快递公司的分拣主管。

**传统的做法**：每个包裹到达时，都要经过前台登记 → 主管查看 → 贴上标签 → 放入对应区域的架子。前台（类比 Linux 内核网络栈）每次都要走一堆流程，处理一个包裹要花好几秒。

**DPDK 的做法**：你干脆把前台关了，在包裹到达的传送带旁直接雇了一排工人。包裹一来，工人一看就知道该往哪放，根本不用经过前台。结果呢？原来每秒能处理 100 个包裹，现在每秒能处理 100 万个。

DPDK（Data Plane Development Kit，数据面开发工具包）就是干这件事的。它是一个开源框架，让网络程序**绕过 Linux 内核的网络栈**，直接在用户态操作网卡，从而把网络吞吐量从"每秒几十万包"提升到"每秒千万甚至上亿包"。

它由 Intel 在 2010 年发起，现在由 Linux Foundation 托管，已经 15 岁了，运行在云平台、电信网络、金融交易所等对速度极度敏感的场景中。

## 二、核心概念

### 1. 用户态 vs 内核态

Linux 网络处理默认在内核态进行。每次收发包都要在内核和用户空间之间切换，这个切换开销不小。DPDK 把所有东西都搬到用户态——网卡驱动、包处理、内存管理，全在你的程序里跑。

### 2. 轮询模式驱动（PMD, Poll Mode Driver）

传统网卡驱动靠中断通知 CPU"有包到了"。中断本身有开销，而且大量小包时中断会淹没 CPU。PMD 不同——它不停地"轮询"网卡，看看有没有新数据包。就像保安不靠门铃，而是每隔一秒就瞄一眼门口。没有中断开销，处理速度大幅提升。

### 3. 大页内存（Hugepages）

CPU 有一个叫 TLB（转换后备缓冲器）的缓存，用来加速虚拟地址到物理地址的转换。TLB 容量很小，处理大量小内存页时会频繁 miss。DPDK 使用 2MB 的大页（而非标准的 4KB 页），大幅减少 TLB miss，就像用大箱子装箱货物，比用小箱子少搬很多次。

### 4. Run-to-Completion 模型

每个数据包到达后，由一个核心从头到尾处理完——解析、查找、修改、发送。不交出控制权，不和其他包交错处理。这样缓存友好， predictable，性能好。

### 5. 关键库组件

| 库名 | 作用 |
|------|------|
| librte_eal | 环境抽象层，管理硬件资源、内存、日志 |
| librte_mbuf | 数据包缓冲区管理 |
| librte_mempool | 内存池，高效分配和回收 mbuf |
| librte_ring | 无锁环形队列，进程间通信 |
| librte_ethdev | 网卡设备 API，收发数据 |
| librte_net | 网络协议辅助函数 |

## 三、代码示例

### 示例 1：最简单的 DPDK 程序骨架

这是一个最小化的 DPDK 程序，展示初始化、注册回调、启动收包的完整流程：

```c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <signal.h>
#include <rte_eal.h>
#include <rte_ethdev.h>
#include <rte_mbuf.h>
#include <rte_mempool.h>

#define NUM_MBUFS         8191
#define MBUF_CACHE_SIZE   250
#define BURST_SIZE        32

// 全局变量
static struct rte_mempool *mbuf_pool;

// 数据包接收回调函数
static void packet_forward_callback(__rte_unused uint16_t port_id,
                                    __rte_unused struct rte_mbuf *buf,
                                    __rte_unused uint32_t seq,
                                    __rte_unused void *user_args)
{
    /* 在这里处理收到的数据包 */
    /* buf 就是收到的数据包，类型为 struct rte_mbuf */
}

int main(int argc, char *argv[])
{
    int ret;

    // 1. 初始化 EAL（环境抽象层）
    // RTE 参数需要在使用前由 EAL 处理
    ret = rte_eal_init(argc, argv);
    if (ret < 0)
        return -1;

    // 2. 创建 mbuf 内存池
    mbuf_pool = rte_pktmbuf_pool_create("mbuf_pool", NUM_MBUFS,
                                        MBUF_CACHE_SIZE, 0,
                                        RTE_MBUF_DEFAULT_BUF_SIZE,
                                        rte_socket_id());
    if (mbuf_pool == NULL)
        return -1;

    printf("DPDK 初始化成功！\n");
    printf("内存池已创建，可分配 %d 个 mbuf\n", NUM_MBUFS);

    // 3. 启动端口，注册包接收回调
    // 每个端口注册一个回调，收到包时自动调用
    ret = rte_eth_macaddr_get(0, NULL);
    if (ret != 0) {
        printf("端口 0 未就绪\n");
        return -1;
    }

    // 4. 主循环 - 从网卡收发数据包
    struct rte_mbuf *pkts[BURST_SIZE];
    uint16_t port = 0;

    while (1) {
        // 从端口接收一批包（最多 BURST_SIZE 个）
        uint16_t nb_rx = rte_eth_rx_burst(port, 0, pkts, BURST_SIZE);

        if (nb_rx > 0) {
            // 对每个包做处理，然后转发
            for (uint16_t i = 0; i < nb_rx; i++) {
                // 这里可以解析、修改、丢弃数据包
                // 简单转发：直接发回原端口
                rte_eth_tx_burst(port, 0, &pkts[i], 1);
            }
        }
    }

    return 0;
}
```

**逐行解释**：

- `rte_eal_init()` — 初始化 DPDK 运行时。它会扫描系统中可用的网卡，预留 hugepages 内存，设置 CPU 亲和性。你传给它的参数（比如 `-l 0-2` 指定用哪些 CPU 核）在这里被处理掉。
- `rte_pktmbuf_pool_create()` — 创建内存池。mbuf 是 DPDK 的数据包载体，就像 Go 里的 `[]byte` 一样重要。提前创建好 8191 个，用的时候直接取，不用临时分配。
- `rte_eth_rx_burst()` — 批量收包。一次调用最多收 32 个包，放入 `pkts` 数组。`burst`（爆发式）的意思是 DPDK 习惯一批一批处理，而不是一块一块处理。
- `rte_eth_tx_burst()` — 批量发包。把处理好的包一口气发出去。

### 示例 2：双向端口转发器

这个例子更实用——创建两个端口之间的双向转发，展示端口配置和统计：

```c
#include <stdio.h>
#include <rte_eal.h>
#include <rte_ethdev.h>
#include <rte_mbuf.h>
#include <rte_mempool.h>
#include <rte_timer.h>

#define MAX_PORTS       2
#define NUM_MBUFS       16384
#define RX_PORTESSIVE   0
#define TX_PORTSTRIDE   1

static struct rte_mempool *pool;

// 配置单个端口
int port_setup(uint16_t port)
{
    struct rte_eth_conf port_conf = {0};
    struct rte_eth_dev_info dev_info;
    int ret;

    // 获取设备信息
    rte_eth_dev_info_get(port, &dev_info);

    // 配置端口为默认模式（支持 RSS、CRC 剥离等）
    port_conf.rxmode.max_rx_pkt_len = ETHER_MAX_LEN;

    // 停止端口（配置前必须先停止）
    ret = rte_eth_dev_stop(port);
    if (ret < 0)
        return ret;

    ret = rte_eth_dev_configure(port, 1, 1, &port_conf);
    if (ret < 0)
        return ret;

    // 配置 RX 队列：每个队列 512 个 mbuf
    ret = rte_eth_rx_queue_setup(port, 0, 512,
                                 rte_eth_dev_socket_id(port),
                                 NULL, pool);
    if (ret < 0)
        return ret;

    // 配置 TX 队列
    ret = rte_eth_tx_queue_setup(port, 0, 512,
                                 rte_eth_dev_socket_id(port),
                                 NULL);
    if (ret < 0)
        return ret;

    // 启动端口
    ret = rte_eth_dev_start(port);
    if (ret < 0)
        return ret;

    printf("端口 %u 已启动\n", port);
    return 0;
}

int main(int argc, char *argv[])
{
    rte_eal_init(argc, argv);
    uint16_t nb_ports = rte_eth_dev_count_avail();

    // 创建共享内存池
    pool = rte_pktmbuf_pool_create("pool", NUM_MBUFS,
                                   256, 0, RTE_MBUF_DEFAULT_BUF_SIZE,
                                   0);

    // 配置所有端口
    for (uint16_t i = 0; i < nb_ports; i++) {
        if (port_setup(i) < 0) {
            rte_eth_dev_stop(i);
            rte_eth_dev_close(i);
        }
    }

    printf("开始转发...\n");

    // 主转发循环
    while (1) {
        for (uint16_t i = 0; i < nb_ports; i++) {
            struct rte_mbuf *pkts[BURST_SIZE];
            uint16_t nb_rx = rte_eth_rx_burst(i, 0, pkts, BURST_SIZE);

            if (nb_rx == 0)
                continue;

            // 转发到另一个端口
            uint16_t dst = (i + 1) % nb_ports;
            uint16_t nb_tx = rte_eth_tx_burst(dst, 0, pkts, nb_rx);

            // 丢弃未能转发的包
            for (uint16_t j = nb_tx; j < nb_rx; j++) {
                rte_pktmbuf_free(pkts[j]);
            }
        }
    }

    return 0;
}
```

这个程序实现的功能：端口 0 收到的包转发到端口 1，端口 1 收到的包转发回端口 0。这就是最基础的网络路由器/交换机的工作方式。

## 四、DPDK 的典型应用场景

- **电信网络**：5G 基站的 vEPC、vBBB 网元
- **NFV（网络功能虚拟化）**：虚拟防火墙、虚拟负载均衡器
- **内容分发网络（CDN）**：边缘节点的高速内容分发
- **金融交易**：毫秒必争的撮合引擎
- **路由器/防火墙**：软件定义网络（SDN）设备

## 五、一句话总结

DPDK 的核心思想就一句话：**绕过内核，直接操作硬件，批量处理，能快多快**。它用空间换速度（预分配内存、轮询代替中断），用批量换效率（一次收/发多个包），用亲和性换缓存命中率（每个 CPU 核处理固定端口）。

理解了这三点，你就理解了 DPDK 的设计哲学。
