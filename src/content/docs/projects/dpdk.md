---
title: "DPDK 零基础学习笔记"
来源: https://www.dpdk.org/
日期: 2026-06-13
分类_原始: 网络
分类: 网络协议
子分类: 高性能网络开发
provenance: pipeline-v3
---

# DPDK 零基础学习笔记

## 一、DPDK 是什么

DPDK 全称 **Data Plane Development Kit**（数据平面开发工具包），由 Intel 在 2010 年发起，现在由 Linux Foundation 托管。你可以把它理解为一套让普通 CPU 跑网卡性能的"超级工具包"。

## 二、日常类比

### 为什么需要 DPDK？

想象你在邮局寄信：

- **没有 DPDK（传统方式）**：每个信封（网络数据包）都要经过前台登记 → 保安检查 → 分拣员分类 → 投递员送达，每一步都要排队等待。信封到收件人手里可能花了 10 毫秒。
- **有了 DPDK**：你在邮局里开了一条绿色通道，跳过所有前台和保安，分拣员直接坐在收发之间，信封一进门就当场处理。1000 个信封可能只要 0.1 毫秒。

传统 Linux 网络栈就像那个排队办事的邮局。DPDK 的做法是：**绕过操作系统内核，让用户态程序直接控制网卡**。

> 内核（Kernel）：操作系统的核心部分，负责管理硬件。传统网络包处理都走内核，但内核的通用性导致了大量开销。
> 用户态（User space）：应用程序运行的空间，不直接碰硬件。

DPDK 打破了这个限制，让应用程序"自己开门拿快递"。

## 三、核心概念

### 3.1 Poll Mode Driver（PMD，轮询模式驱动）

传统驱动：网卡收到数据包 → 发中断给 CPU → CPU 暂停手头工作去处理中断。频繁中断就像快递员不停按门铃，CPU 会被累死。

PMD 驱动：CPU 自己主动去网卡"检查有没有新包"，不靠中断。就像你每隔几秒去看看门口有没有快递，而不是被门铃折磨。在高速网络下，主动检查比频繁中断更高效。

### 3.2 Huge Pages（大页内存）

普通内存页是 4KB。DPDK 把内存页放大到 2MB（Huge Page），减少 TLB（Translation Lookaside Buffer，页表缓存）miss 的次数。

类比：你每天要查 1000 次地图（小页），每次查一个街区。换成大页地图后，一次能看清一个城区，查 10 次就够了。

### 3.3 Mbuf（数据包缓冲区）

DPDK 用 `mbuf` 表示网络数据包。每个 mbuf 包含两部分：

- **mbuf 结构体**：记录数据包的元信息（长度、协议类型等）
- **数据缓冲区**：实际存储数据包内容的内存

### 3.4 Mempool（内存池）

mbuf 创建和销毁有开销。DPDK 用 mempool 预分配一批 mbuf，需要时直接从池子里拿，用完放回去，像借书还书一样。

### 3.5 Lcore（逻辑核心）

DPDK 把 CPU 核心分成两类：

- **Lcore**：运行你的数据处理程序的主力
- **Service core**：跑 DPDK 内部管理任务

每个 Lcore 独立处理自己绑定的网卡队列，互不干扰，像多条独立的高速公路。

### 3.6 EAL（Environment Abstraction Layer）

EAL 是 DPDK 的"启动器"。程序启动时，EAL 负责：

- 初始化 Huge Pages
- 绑定 Lcore 到物理 CPU 核
- 发现并挂载网卡设备
- 提供日志、内存管理等基础设施

## 四、代码示例

### 示例 1：最小化 DPDK 初始化（EAL + 打印）

```c
#include <stdio.h>
#include <rte_eal.h>
#include <rte_ethdev.h>

int main(int argc, char **argv)
{
    // 1. 初始化 EAL — 解析 -c (核心掩码) 等参数
    // -c7 表示使用 core 0, 1, 2
    int ret = rte_eal_init(argc, argv);
    if (ret < 0) {
        rte_exit(EXIT_FAILURE, "EAL init failed\n");
    }

    // 2. 只在主核（master lcore）上执行
    if (!rte_eal_is_master())
        return 0;

    // 3. 打印网卡信息
    printf("DPDK initialized successfully!\n");
    printf("Number of Ethernet ports available: %d\n", rte_eth_dev_count_avail());

    // 4. 清理并退出
    rte_eal_cleanup();
    return 0;
}
```

编译命令：

```bash
meson setup build
ninja -C build
./build/app/dpdk-testpmd -c7 -- -i
```

### 示例 2：最简单的两端口包转发程序

```c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <signal.h>
#include <rte_eal.h>
#include <rte_ethdev.h>
#include <rte_mbuf.h>
#include <rte_mempool.h>
#include <rte_ip.h>

#define MAX_PORTS 2
#define PKT_BURST 32
#define MEMPOOL_SIZE 4096

static volatile int run = 1;

// 收到 Ctrl+C 时停止转发
void signal_handler(int signum)
{
    printf("\nReceived signal %d, stopping...\n", signum);
    run = 0;
}

int main(int argc, char *argv[])
{
    struct rte_mempool *mp;
    struct rte_mbuf *pkts[PKT_BURST];
    int port_id;
    uint16_t i, nb_rx, nb_tx;
    struct rte_ether_addr addr;

    signal(SIGINT, signal_handler);

    // 1. 初始化 EAL
    int ret = rte_eal_init(argc, argv);
    if (ret < 0)
        rte_exit(EXIT_FAILURE, "EAL init failed\n");

    if (!rte_eal_is_master())
        return 0;

    // 2. 创建 mbuf 内存池
    mp = rte_mempool_create("pkt_pool", MEMPOOL_SIZE,
                            sizeof(struct rte_mbuf),
                            32, 0, NULL, NULL, NULL, NULL,
                            rte_socket_id(), 0);
    if (!mp)
        rte_exit(EXIT_FAILURE, "Mempool create failed\n");

    // 3. 初始化所有端口
    for (port_id = 0; port_id < MAX_PORTS; port_id++) {
        ret = rte_eth_dev_configure(port_id, 1, 1);
        if (ret < 0)
            rte_exit(EXIT_FAILURE, "Port %d configure failed\n", port_id);

        ret = rte_eth_rx_queue_setup(port_id, 0, 128, rte_eth_dev_socket_id(port_id),
                                     NULL, mp);
        if (ret < 0)
            rte_exit(EXIT_FAILURE, "Port %d RX queue setup failed\n", port_id);

        ret = rte_eth_tx_queue_setup(port_id, 0, 128, rte_eth_dev_socket_id(port_id),
                                     NULL);
        if (ret < 0)
            rte_exit(EXIT_FAILURE, "Port %d TX queue setup failed\n", port_id);

        ret = rte_eth_dev_start(port_id);
        if (ret < 0)
            rte_exit(EXIT_FAILURE, "Port %d start failed\n", port_id);

        printf("Port %d started\n", port_id);
    }

    // 4. 主循环：从端口 0 收包，转发到端口 1
    printf("Starting packet forwarding...\n");
    while (run) {
        // 从端口 0 批量接收最多 PKT_BURST 个包
        nb_rx = rte_eth_rx_burst(0, 0, pkts, PKT_BURST);
        if (nb_rx == 0)
            continue;

        // 批量转发到端口 1
        nb_tx = rte_eth_tx_burst(1, 0, pkts, nb_rx);

        // 丢弃没发出去的包
        for (i = nb_tx; i < nb_rx; i++)
            rte_pktmbuf_free(pkts[i]);
    }

    // 5. 清理
    for (port_id = 0; port_id < MAX_PORTS; port_id++)
        rte_eth_dev_stop(port_id);

    rte_eal_cleanup();
    printf("Done.\n");
    return 0;
}
```

### 代码关键 API 对照表

| API | 作用 | 类比 |
|-----|------|------|
| `rte_eal_init()` | 初始化 DPDK 环境 | 启动邮局系统，分配资源 |
| `rte_mempool_create()` | 创建 mbuf 池 | 提前准备好空白信封 |
| `rte_eth_dev_configure()` | 配置网卡端口 | 设置邮局收发窗口 |
| `rte_eth_rx_queue_setup()` | 设置接收队列 | 打开收件通道 |
| `rte_eth_tx_queue_setup()` | 设置发送队列 | 打开寄件通道 |
| `rte_eth_dev_start()` | 启动网卡 | 邮局开门营业 |
| `rte_eth_rx_burst()` | 批量收包 | 一次搬一整筐快递 |
| `rte_eth_tx_burst()` | 批量发包 | 一次发出一整筐 |
| `rte_pktmbuf_free()` | 释放 mbuf 回池 | 把用完的信封放回架子 |

## 五、DPDK 为什么快

1. **无内核零拷贝**：数据包不进内核协议栈，没有从内核态到用户态的拷贝
2. **批量处理**：一次收/发多个包（burst），减少系统调用次数
3. **CPU 绑定**：每个核心只处理自己队列的包，避免锁竞争
4. **大页内存**：减少 TLB miss，加快地址翻译
5. **缓存友好**：内存连续分配，CPU 缓存命中率更高

## 六、典型应用场景

- **虚拟网络功能（VNF）**：虚拟化防火墙、负载均衡器（如 VPP、OVS-DPDK）
- **电信核心网**：5G 基站的前传和中传处理
- **金融交易**：毫秒级高频交易系统
- **内容分发**：CDN 边缘节点的快速包转发

## 七、学习路线建议

1. 先跑通 testpmd 示例应用（`dpdk-testpmd`），直观感受收发包
2. 读懂 `examples/hello_world` 示例，理解 EAL 初始化流程
3. 学习 `examples/packet_ordering` 或 `examples/l3fwd`，理解完整的数据面逻辑
4. 阅读官方 Programmer's Guide 中 Memory 和 Packet Processing 章节
5. 尝试用 DPDK 写一个简单的 IP 路由器

## 八、参考资源

- 官方网站：https://www.dpdk.org/
- 代码仓库：https://github.com/DPDK/dpdk
- 官方文档：https://core.dpdk.org/doc/
- 快速开始：https://core.dpdk.org/doc/quick-start/
- 开发者邮件列表：dev@dpdk.org
