---
title: lwIP — 嵌入式系统的轻量级 TCP/IP 协议栈
来源: 'https://github.com/lwip-tcpip/lwip'
日期: 2026-06-24
分类: embedded
难度: 中级
---

## 是什么

lwIP（Lightweight IP）是一个专为资源受限嵌入式系统设计的**开源 TCP/IP 协议栈**。日常类比：普通 TCP/IP 协议栈像一辆大巴车——功能全但体积大，lwIP 像一辆电动滑板车——只保留核心交通能力，能在窄路（几十 KB RAM + 40 KB ROM）上跑起来。

它由瑞典计算机科学院的 Adam Dunkels 在 2001 年开发，目标是在保持 TCP 协议主要功能的前提下，把 RAM 占用压到极限。今天 FreeRTOS、Zephyr、RT-Thread 等主流 RTOS 都默认内置 lwIP 作为网卡协议栈。

## 为什么重要

不理解 lwIP，下面这些事都没法解释：

- 为什么一块只有 64 KB RAM 的 MCU 也能跑 HTTP 服务器、MQTT 客户端——因为 lwIP 把完整 TCP/IP 压进了几十 KB
- 为什么嵌入式网络应用有三种写法（Raw API / Netconn / Socket）——这是 lwIP 的三层 API 设计
- 为什么 FreeRTOS + ESP32 项目一联网就能 ping 通——底层就是 lwIP 在干活
- 为什么物联网设备既能跑 IPv4 又能跑 IPv6 而不炸内存——lwIP 的模块化裁剪机制

## 核心要点

1. **零拷贝 pbuf 链**：lwIP 用 pbuf（packet buffer）结构管理网络数据包，数据可以链式串联而不需要整块连续内存。类比：像用多节火车厢运货，不需要一辆超长卡车。支持 RAM / ROM / REF / POOL 四种分配策略，适配不同场景。

2. **双线程模型可选**：`NO_SYS=1` 时单线程裸跑（主循环轮询），`NO_SYS=0` 时多线程运行（tcpip_thread 处理核心逻辑）。类比：小餐馆一个人前厅后厨全包（单线程），大餐厅前台点单、后厨做菜分开（多线程）。

3. **编译时裁剪一切**：通过 `lwipopts.h` 头文件，每个协议（TCP / UDP / IPv6 / DHCP / DNS）都可以开关。不需要的功能编译时直接消失，ROM 占用可以从 40 KB 压到 20 KB 以下。

## 实践案例

### 案例 1：裸机上跑 TCP Echo 服务器（Raw API）

```c
#include "lwip/tcp.h"

static err_t echo_recv(void *arg, struct tcp_pcb *pcb, struct pbuf *p, err_t err) {
    if (p == NULL) { tcp_close(pcb); return ERR_OK; }
    tcp_write(pcb, p->payload, p->len, TCP_WRITE_FLAG_COPY);
    pbuf_free(p);
    return ERR_OK;
}

static err_t echo_accept(void *arg, struct tcp_pcb *newpcb, err_t err) {
    tcp_recv(newpcb, echo_recv);  // 注册回调
    return ERR_OK;
}

void echo_init(void) {
    struct tcp_pcb *pcb = tcp_new();
    tcp_bind(pcb, IP_ADDR_ANY, 7);       // 端口 7
    pcb = tcp_listen(pcb);               // 进入监听状态
    tcp_accept(pcb, echo_accept);        // 注册接受回调
}
```

逐部分解释：Raw API 是事件驱动的——你注册回调函数，lwIP 收到数据时调你的 `echo_recv`。没有线程、没有阻塞，适合裸机 MCU。

### 案例 2：FreeRTOS 上用 Socket API 发 HTTP 请求

```c
#include "lwip/sockets.h"

int sock = socket(AF_INET, SOCK_STREAM, 0);
struct sockaddr_in addr = { .sin_family = AF_INET, .sin_port = htons(80) };
inet_aton("93.184.216.34", &addr.sin_addr);
connect(sock, (struct sockaddr*)&addr, sizeof(addr));
char *req = "GET / HTTP/1.0\r\nHost: example.com\r\n\r\n";
send(sock, req, strlen(req), 0);
char buf[512];
recv(sock, buf, sizeof(buf), 0);
close(sock);
```

逐部分解释：Socket API 和 Linux 的 BSD socket 几乎一模一样。需要 RTOS 支持（`NO_SYS=0`），每个连接占一个线程栈，但写起来简单直观。

### 案例 3：lwipopts.h 裁剪配置

```c
// 关闭不需要的协议，节省 ROM
#define LWIP_IPV6       0    // 不需要 IPv6
#define LWIP_DNS        1    // 需要 DNS 解析
#define LWIP_DHCP       1    // 需要 DHCP 获取 IP
#define LWIP_UDP        1
#define LWIP_TCP        1

// 内存池大小调优
#define MEM_SIZE        (8 * 1024)   // 堆 8KB
#define MEMP_NUM_TCP_PCB      5      // 最多 5 个 TCP 连接
#define PBUF_POOL_SIZE        8      // 8 个 pbuf 池块
```

逐部分解释：每个宏都是编译开关。`MEMP_NUM_TCP_PCB=5` 意味着最多同时 5 个 TCP 连接——超过就拒绝，但省了内存。这就是"用配置换资源"的嵌入式哲学。

## 踩过的坑

1. **Raw API 里忘记释放 pbuf**：回调收到 pbuf 后必须 `pbuf_free(p)`，否则内存池很快耗尽，表现为新连接被拒绝。
2. **Socket API 在裸机上用不了**：Socket 和 Netconn API 依赖 RTOS 线程模型（`NO_SYS=0`），裸机只能用 Raw API。
3. **`lwipopts.h` 没定义就用默认值**：`opt.h` 里的默认值对桌面开发友好但对 MCU 太大，不覆盖的话 RAM 会爆。
4. **中断里直接调 lwIP 函数**：lwIP 核心不是线程安全的，网卡中断收到包后只能投递到队列，不能直接调 `tcp_write`。

## 适用 vs 不适用场景

**适用**：
- 资源受限 MCU（几十 KB RAM）需要联网——ESP32、STM32、nRF52
- RTOS 项目需要完整 TCP/IP（FreeRTOS / Zephyr / RT-Thread 默认集成）
- 物联网设备跑 MQTT / HTTP / CoAP 等应用层协议
- 需要同时支持 IPv4 和 IPv6 但内存预算紧张

**不适用**：
- Linux / Windows 等有完整内核协议栈的系统——直接用系统自带的就好
- 需要高吞吐（>100 Mbps）的场景——lwIP 优化方向是省内存而非高性能
- 需要完整 BSD socket 语义（如 `select` 跨大量 fd）——lwIP 的 socket 实现是子集
- 安全要求极高的场景——lwIP 本身不含 TLS，需要外挂 mbedTLS

## 历史小故事（可跳过）

- **2001 年**：Adam Dunkels 在瑞典计算机科学院（SICS）发布 lwIP 0.1，目标是让 8 位 / 16 位 MCU 能跑 TCP/IP
- **2004 年**：lwIP 被 FreeRTOS 生态采纳，成为嵌入式网络事实标准
- **2007 年**：加入 IPv6 支持，跟上物联网 IPv6 化趋势
- **2017 年**：加入 altcp 层，允许透明叠加 TLS（mbedTLS）
- **至今**：GitHub 镜像约 2.6k stars，Savannah 主仓持续维护，ESP-IDF / Zephyr / RT-Thread 全部内置

## 学到什么

- **嵌入式网络的核心矛盾是"功能完整 vs 资源有限"**——lwIP 通过编译时裁剪 + 内存池 + 零拷贝 pbuf 同时满足两端
- **三层 API 设计是经典权衡**：Raw API 最省资源但难写，Socket API 最易用但需要 RTOS，Netconn 居中
- **协议栈可以和 OS 解耦**：`NO_SYS=1` 模式证明 TCP/IP 不必依赖操作系统，只要有定时器和主循环就能跑
- **配置即架构**：`lwipopts.h` 一个头文件决定了整个协议栈的能力边界和内存预算

## 延伸阅读

- 官方文档：[lwIP Wiki on Savannah](https://savannah.nongnu.org/projects/lwip/)
- 视频教程：[正点原子 lwIP 入门到精通](https://www.bilibili.com/video/BV1z4411C7LP)（中文，配 STM32 实战）
- 书籍：《嵌入式网络那些事——lwIP 协议深度剖析与实战演练》——朱升林著
- 架构解析：[DeepWiki lwIP Overview](https://deepwiki.com/lwip-tcpip/lwip)
- [[freertos]] —— lwIP 最常见的搭档 RTOS
- [[smoltcp]] —— Rust 写的类似定位协议栈，可对比学习

## 关联

- [[freertos]] —— lwIP 最常用的宿主 RTOS，两者组合是嵌入式联网标准方案
- [[smoltcp]] —— Rust 生态的轻量 TCP/IP 栈，设计理念相似但语言不同
- [[zephyr]] —— 新一代 RTOS，内置 lwIP 作为可选网卡栈
- [[rt-thread]] —— 国产 RTOS，同样集成 lwIP
- [[embassy]] —— Rust 异步嵌入式框架，用 smoltcp 替代 lwIP 的位置
- [[tcp]] —— lwIP 实现的核心协议，含拥塞控制 / 快重传 / SACK
- [[nuttx]] —— 另一个嵌入式 OS，自带协议栈但也可选 lwIP

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
