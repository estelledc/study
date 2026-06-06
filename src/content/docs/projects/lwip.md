---
title: lwIP — ~40KB ROM 跑完整 TCP/IP 的嵌入式网络栈
来源: 'https://github.com/lwip-tcpip/lwip'
日期: 2026-06-06
分类: 操作系统
子分类: 嵌入式
难度: 中级
---

## 是什么

lwIP（Lightweight IP）是一个**专为内存极度受限的嵌入式系统设计的 TCP/IP 协议栈**。日常类比：普通路由器是一栋写字楼——每个协议住独立楼层、有宽敞走廊；lwIP 是同一家公司搬进的集装箱——功能一个不少，占地只剩二十分之一。

具体数字：约 40KB 代码 ROM、几十 KB RAM，就能跑完整的 IPv4/IPv6 + TCP + UDP + DHCP + DNS + ARP。这让一块只有 256KB Flash 的 STM32 或 ESP32 也能成为真正的网络节点。

lwIP 由瑞典计算机科学研究所（SICS）的 Adam Dunkels 于 2001 年创作，以 BSD 协议开源，现为 FreeRTOS、Zephyr、ESP-IDF 等主流嵌入式生态的默认网络栈。它既可以跑在有 RTOS 的环境里，也可以完全裸机运行。

## 为什么重要

不理解 lwIP，下面这些事都没法解释：

- 为什么 STM32、ESP32 这类微控制器能直接跑 HTTP/MQTT，却不需要 Linux 网络子系统
- 为什么 FreeRTOS 和 Zephyr 的网络层默认都选了 lwIP 而不是自己造轮子
- 为什么嵌入式网络代码里常出现 pbuf、netif、tcpip_thread 这些词，它们是什么抽象
- 为什么同样是"TCP 客户端"，lwIP Raw API 和 Socket API 写法差异这么大，性能也差这么多

## 核心要点

1. **pbuf：报文的原子单位**
   lwIP 用链式 pbuf（packet buffer）管理网络报文。每个 pbuf 带引用计数，可以链接成链表表示分片报文。类比：快递包裹用一张"条形码标签"追踪，不同快递员接力时只传递标签、不复制包裹内容——pbuf 的 `ref` 计数就是这张标签，`pbuf_free()` 减到 0 才真正释放内存。正是这个机制让 lwIP 在极少内存里实现近零拷贝。

2. **三层 API：从极速到易用**
   lwIP 提供三种编程接口，越往上越简单但性能开销越大：
   - **Raw API**：回调驱动，单线程，无阻塞，性能最高；适合裸机或对延迟要求苛刻的场景
   - **Netconn API**：面向连接的阻塞 API，需要 OS 支持；在 RTOS 任务里写同步收发
   - **Socket API**：BSD socket 兼容层，可移植性最好；方便从 Linux 代码移植到嵌入式

3. **lwipopts.h：静态裁剪一切**
   所有功能特性都通过 `lwipopts.h` 在编译期开关。不需要 IPv6？`#define LWIP_IPV6 0`；不用 SNMP？关掉。内存池大小（`MEMP_NUM_TCP_PCB`、`MEM_SIZE`）也在这里硬编码。类比：宜家家具出厂时带全套零件，你在 `lwipopts.h` 里决定装几条腿——多余的零件根本不进 ROM。

## 实践案例

### 案例 1：FreeRTOS + lwIP 做 HTTP 客户端（OTA 升级场景）

```c
// 在 tcpip 线程里创建 netconn，拉取固件
struct netconn *conn = netconn_new(NETCONN_TCP);
netconn_connect(conn, &server_ip, 80);

// 发送 HTTP GET 请求
const char *req = "GET /firmware.bin HTTP/1.0\r\nHost: ota.example.com\r\n\r\n";
netconn_write(conn, req, strlen(req), NETCONN_COPY);

// 循环读取响应
struct netbuf *buf;
while (netconn_recv(conn, &buf) == ERR_OK) {
    void *data; u16_t len;
    netbuf_data(buf, &data, &len);
    flash_write(offset, data, len);  // 写进 Flash
    offset += len;
    netbuf_delete(buf);
}
netconn_close(conn);
netconn_delete(conn);
```

**逐部分解释**：
- `netconn_new(NETCONN_TCP)` 在 lwIP 内部分配一个 TCP PCB（协议控制块）
- `netconn_write(..., NETCONN_COPY)` 把请求字符串复制进 pbuf 发送；如果用 `NETCONN_NOCOPY` 则调用方必须保证 buf 在发送完之前不被释放
- `netbuf_delete(buf)` 释放 lwIP 分配的 pbuf，忘记调用会造成内存池耗尽

### 案例 2：Raw API + MQTT over TCP（低延迟传感器上报）

```c
// Raw API 回调驱动，适合对延迟敏感的场景
static err_t recv_callback(void *arg, struct tcp_pcb *pcb,
                           struct pbuf *p, err_t err) {
    if (p == NULL) { /* 连接关闭 */ return ERR_OK; }
    // 直接操作 pbuf 数据，零拷贝
    mqtt_handle_incoming((uint8_t*)p->payload, p->len);
    tcp_recved(pcb, p->tot_len);  // 告知 lwIP 窗口可以扩大
    pbuf_free(p);                 // 必须 free！
    return ERR_OK;
}

// 建立连接
struct tcp_pcb *pcb = tcp_new();
tcp_recv(pcb, recv_callback);      // 注册接收回调
tcp_connect(pcb, &broker_ip, 1883, connected_callback);
```

**逐部分解释**：
- Raw API 完全在 lwIP 的 `tcpip_thread` 里运行，**不能在回调里阻塞**（没有 OS 调度）
- `tcp_recved()` 必须在读完数据后调用，否则 TCP 窗口不增长，对端会被流控卡住
- `pbuf_free(p)` 是这里最容易忘的一步，也是最常见的内存泄漏来源

### 案例 3：自定义 netif 驱动适配工业以太网 MAC

```c
// 实现 netif 的 output 函数，把 pbuf 送进硬件 DMA
static err_t ethernetif_output(struct netif *netif,
                               struct pbuf *p) {
    struct pbuf *q;
    uint8_t *dma_buf = dma_alloc(p->tot_len);
    uint16_t offset = 0;
    // pbuf 可能是链表，逐段拷贝
    for (q = p; q != NULL; q = q->next) {
        memcpy(dma_buf + offset, q->payload, q->len);
        offset += q->len;
    }
    eth_mac_send_dma(dma_buf, p->tot_len);
    return ERR_OK;
}

// 注册到 lwIP
netif_add(&my_netif, &ip_addr, &netmask, &gw,
          NULL, ethernetif_init, tcpip_input);
```

**逐部分解释**：
- `pbuf` 链表遍历 `q = q->next` 是处理分片报文的标准写法
- `tcpip_input` 作为 `input` 回调，确保收包在 tcpip 线程里处理，避免多线程竞争
- 真实项目中通常用 DMA + 中断触发 `pbuf_alloc`，做到真正零拷贝入栈

## 踩过的坑

1. **在 Raw API 回调里阻塞**：Raw API 回调在 lwIP 唯一的 `tcpip_thread` 里执行，任何 `vTaskDelay`、`while(等待)` 都会挂死整个协议栈，所有 TCP 连接同时超时。改法：把阻塞操作交给应用层任务，通过消息队列/信号量和回调通信。

2. **pbuf_free() 漏掉**：每个 `recv_callback` 里收到的 `pbuf *p` 如果不调用 `pbuf_free(p)` 会一直占着内存池。表现是运行几小时后断连，打日志发现 `memp_malloc` 返回 NULL。解法：在回调末尾加 `pbuf_free(p)`，用 LWIP_STATS 宏开启内存统计做定期检查。

3. **lwipopts.h 未按平台调整 MEM_SIZE**：默认 `MEM_SIZE` 往往为 1600 字节堆，远不够同时开多个 TCP 连接。表现是建第 2 个连接时 `tcp_new()` 返回 NULL。解法：根据最大并发连接数 × 单连接缓冲估算，一般 8~16KB 是嵌入式实际值。

4. **多线程直接调用 lwIP 内部函数**：lwIP 核心不是线程安全的。在非 tcpip_thread 线程里直接调 `tcp_write()`、`netif_set_up()` 会有竞态条件。正确做法：用 `LOCK_TCPIP_CORE()` / `UNLOCK_TCPIP_CORE()` 包住，或通过 `tcpip_callback()` 把操作 post 到 tcpip_thread。

## 适用 vs 不适用场景

**适用**：
- RAM < 512KB 的 MCU（STM32F4、ESP32、nRF5340）需要完整 TCP/IP
- RTOS 项目（FreeRTOS / Zephyr）需要可移植的、社区活跃的网络栈
- 工业设备：Modbus TCP、EtherNet/IP、MQTT 这类单点协议，并发连接数 ≤ 10
- 需要裁剪掉不用的协议（只留 IPv4+TCP+DHCP，关掉其余）来压 ROM

**不适用**：
- 并发连接数 > 100，或需要完整 HTTP/2 / TLS 1.3 高吞吐场景（考虑 Linux + 内核协议栈）
- 对网络安全要求极高：lwIP 的 TLS 依赖 mbedTLS 外挂，不是内建的
- 需要原生 IPv6 only 栈且关心 RFC 合规细节（smoltcp 对 Rust 生态更友好）
- 有丰富 Linux 生态的 MPU 平台（Cortex-A + Linux），直接用内核协议栈性价比更高

## 历史小故事（可跳过）

- **2001 年**：Adam Dunkels 在瑞典计算机科学研究所（SICS）读博期间发布 lwIP 第一版，同年发表论文《Design and Implementation of the lwIP TCP/IP Stack》。目标是让连 40KB ROM 都嫌多的嵌入式设备也能跑完整 TCP/IP。
- **2002 年**：Dunkels 在 lwIP 基础上又写了更精简的 uIP（micro IP），专门面向只有几 KB RAM 的 8-bit MCU。uIP 是 lwIP 的"弟弟"，不是前辈。
- **2007 年**：Dunkels 博士毕业，lwIP 移交给社区，项目转至 Savannah GNU 托管，开发节奏放缓但持续稳定。
- **2010 年代**：物联网大爆发，ESP8266 芯片出货量过亿，lwIP 成为其默认网络栈，知名度随之飙升。
- **2016 年**：lwIP 2.0 发布，引入原生 IPv6 支持和新版 API，`ALTCP` 抽象层让 TLS 透明插入。
- **2018 年**：lwIP 2.1 完善多核支持，`SYS_ARCH` 层更清晰，正式进入 Zephyr RTOS 标准组件。

## 学到什么

1. **极致资源约束是设计驱动力**：pbuf 引用计数、静态内存池、单线程 Raw API——每一个设计决策都指向"少占内存 + 少复制"。先理解约束，才能理解机制。
2. **三层 API 反映性能与可移植性的权衡**：Raw API 最快但最难用，Socket API 最像 Linux 但开销最大。选哪层取决于你的并发量和开发速度要求。
3. **lwipopts.h 是你和协议栈的契约**：不读它就写嵌入式网络代码，等于不看说明书装家具。每个 `MEM_` 和 `LWIP_` 宏都是一个决策点。
4. **零拷贝在资源受限系统里不是优化，是生存需求**：pbuf 的设计哲学是"数据只复制一次"，这在桌面系统是优化，在只有 64KB RAM 的 MCU 上是生死线。

## 延伸阅读

- 文档：[lwIP Application Developers Manual](https://www.nongnu.org/lwip/2_1_x/group__lwip__opts.html)（lwipopts.h 完整参数说明）
- 论文：Adam Dunkels, "Design and Implementation of the lwIP TCP/IP Stack", SICS Technical Report, 2001（原始设计文档，讲清楚每个设计决策背后的约束）
- 视频：[lwIP with FreeRTOS — Embedded.fm 系列](https://embedded.fm/episodes/209)（实战经验分享）
- [[freertos]] —— lwIP 最常见的搭档 RTOS
- [[smoltcp]] —— Rust 写的类 lwIP 嵌入式网络栈，设计上更现代
- [[zephyr]] —— 把 lwIP 作为默认网络栈的 RTOS

## 关联

- [[freertos]] —— FreeRTOS + lwIP 是嵌入式 TCP/IP 的黄金组合，FreeRTOS 提供任务调度，lwIP 提供 tcpip_thread
- [[zephyr]] —— Zephyr 把 lwIP 封装成 BSD socket 层，上层代码可以用标准 socket 接口
- [[smoltcp]] —— Rust 生态的对标方案，类似 lwIP 的轻量设计但提供更严格的内存安全保证
- [[tcp]] —— lwIP 的核心协议实现，包含拥塞控制（Reno）、RTT 估算、快速重传
- [[tcp-vegas-1995]] —— TCP Vegas 的拥塞控制思想影响了 lwIP TCP 的延迟估算设计
- [[mptcp-2012]] —— MPTCP 多路径 TCP 是 lwIP 单路径 TCP 的扩展方向，了解对比有助于理解 lwIP 的设计边界

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）

