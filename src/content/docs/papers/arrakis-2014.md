---
title: Arrakis 2014 — 让操作系统只管规则、硬件直接服务应用
来源: 'Simon Peter et al., "Arrakis: The Operating System is the Control Plane", OSDI 2014'
日期: 2026-06-06
分类: 操作系统
子分类: 内核与虚拟化
难度: 中级
---

## 是什么

Arrakis 是一个把操作系统内核**彻底踢出 I/O 数据路径**的操作系统设计。日常类比：传统 OS 像一个每次传话都要经过的翻译官——你说一句话，翻译官转达，对方再说，翻译官再传。Arrakis 让双方直接打电话，翻译官只在开始时"设好通话权限"，之后就坐在旁边喝茶不插手。

传统 Linux 内核在每次网络收发包、磁盘读写时都要介入：验证权限、拷贝数据、切换特权级。这对 2000 年代的慢速硬件没问题，但当 10 GbE 网卡单包延迟只有几微秒、NVMe SSD 写延迟只有 15 µs 时，Linux 内核自己的开销（3.36 µs/包）反而比数据传输本身还重。

Arrakis 的做法是把内核拆成两半：
- **控制平面**（Arrakis kernel）：只做一次性配置——给应用分配虚拟网卡（VNIC）/虚拟存储接口（VSIC）、设置过滤规则、安装速率限制器。
- **数据平面**（用户态 libos）：应用直接通过 SR-IOV 硬件把包写进 NIC 描述符队列，零系统调用，零内核切换。

结果：Redis 写延迟从 163 µs 降到 31 µs，写吞吐量提升 9 倍，且仍有与 Linux 同等的进程隔离保证。

## 为什么重要

不理解 Arrakis，下面这些事都没法解释：

- 为什么 DPDK、SPDK 这类"内核旁路"库能让网络/存储服务性能飙升——它们把 Arrakis 的思想工程化了
- 为什么现代云数据库（ClickHouse、Redis Cluster）要用用户态网络栈而不是直接 socket
- 为什么 SR-IOV、IOMMU 这些 PCIe 硬件特性在高性能场景里如此关键——Arrakis 是第一个把它们系统化用起来的 OS 原型
- 为什么"安全隔离"和"零拷贝高性能"过去被认为不可兼得，而 Arrakis 证明它们可以共存

## 核心要点

1. **控制平面 vs 数据平面分离**：内核只在应用启动时配置硬件过滤器（谁能收哪些端口的包、写哪块磁盘），之后 I/O 完全绕过内核。类比：高速公路收费站只在进站时验票，进入之后随便开——不需要每隔 100 米再查一次票。

2. **SR-IOV + IOMMU 是硬件基础**：SR-IOV 让一块物理 NIC 在硬件层模拟出多个独立虚拟网卡（VNIC，以 Intel 82599 为例最多 64 个），每个 VNIC 有自己的 DMA 队列（DMA = Direct Memory Access，硬件绕过 CPU 直接把数据写进内存的机制）、过滤器和中断向量，可以直接映射到不同应用的地址空间；IOMMU（I/O 内存管理单元）确保一个应用的 DMA 不能越界访问别的应用的内存，提供硬件级隔离。

3. **POSIX 兼容层与原生零拷贝接口并存**：Arrakis/P 保留 socket/read/write 语义——已有应用无需改代码，性能已提升 2×；Arrakis/N 暴露原生队列 API，应用直接管理包缓冲区的所有权，实现真零拷贝，吞吐再提升 1.7×。两者由同一套硬件驱动支撑，上层接口可按需选择。

## 实践案例

### 案例 1：Redis 持久化写入提速 9 倍

Redis 每次写操作需要：网络收包 → 日志写盘 → fsync → 回包。在 Linux 上，fsync 平均 137 µs，占总延迟的 85%。

Arrakis 的做法：
1. 用控制平面给 Redis 进程分配一个 VSIC，绑定到磁盘的一个虚拟存储区（VSA）；
2. Redis 直接调用 Caladan 持久化库（Arrakis 自带），向 VSIC 描述符队列写命令；
3. 存储控制器异步完成写入，通过"doorbell"中断通知 Redis——不需要 fsync 系统调用。

```c
// Arrakis 原生持久化接口（概念示意）
caladan_log_append(log, entry, entry_len, on_persist_cb);
// 立即返回；on_persist_cb 在硬件确认写入后被调用
// 无系统调用、无内核上下文切换
```

结果：fsync 延迟从 137 µs → 24 µs（剩余延迟是 SSD 硬件本身），写吞吐提升约 9×。

### 案例 2：Memcached 用 VNIC 过滤器实现多核线性扩展

传统 Linux 下，多个 Memcached 进程共享内核 TCP 栈——网络软中断、socket 锁是扩展瓶颈，6 核时吞吐接近饱和。

Arrakis 做法：

```text
# 控制平面：为每个 Memcached 实例分配独立 VNIC
create_filter(RECV, peer_list=clients, port=11211+i)
# 硬件直接把该端口的包打到对应 VNIC 队列
# 每核一个 Extaris 栈实例，无全局锁
# （Extaris = Arrakis 自带的用户态 TCP 协议栈库）
```

1. 每个进程有独立 VNIC，包在 NIC 内部就被分流到对应队列；
2. Extaris（Arrakis 自带的用户态 TCP 协议栈库）在目标 CPU 核上本地处理，缓存命中率极高；
3. 无 RSS（Receive-Side Scaling，网卡把包散发到不同队列的机制）开销，无 socket 锁竞争。

结果：4 核时达到 10 GbE 线速，吞吐为同核 Linux 的 1.7×；Linux 在 2 核后趋于饱和。

### 案例 3：IP 层中间件利用硬件过滤器多核扩展

自研负载均衡中间件（raw IP socket 重写目标 IP/端口）在 Linux 上无法多核扩展——raw socket 没有连接信息，每核都要检查所有包。

```python
# Arrakis 方案（伪代码）
# 控制平面按 5-tuple（源IP/目标IP/源端口/目标端口/协议）hash 把流分配给不同核
N = num_cores  # 把 hash 空间均分给 N 个核
for core_id in range(N):
    create_filter(direction=RECV,
                  src_hash_range=(core_id/N, (core_id+1)/N),
                  dst_any=True)
# 每核独立处理自己 1/N 的连接，无跨核通信
```

结果：Arrakis 版中间件吞吐为 Linux 的 2.6×，且在 2 核时已触及 NIC 带宽上限；Linux 版随核数增加吞吐反而下降（锁竞争）。

## 踩过的坑

1. **NIC 过滤能力不足**：Intel 82599 只能按 MAC/VLAN 过滤，无法做任意包头谓词。Arrakis 原型里每个 VNIC 用不同 MAC 地址区分，再在软件里二次过滤，引入额外延迟。Solarflare 等更新的网卡才支持任意字段过滤。

2. **VSIC 仍是软件模拟**：论文发表时现有存储控制器（MegaRAID RS3DC040）不支持 SR-IOV 虚拟存储功能，Arrakis 用专用 CPU 核软件模拟 VSIC，带来约 3 µs 额外延迟。真正的硬件 VSIC 支持要等到 NVMe 多队列特性成熟之后。

3. **POSIX 兼容层仍有拷贝开销**：Arrakis/P 提供 POSIX socket 语义，但 NIC 收到的包必须先放入网络缓冲区再拷贝到用户指定地址（read buffer），消除不了这次拷贝。只有用 Arrakis/N 原生 API 才能真正零拷贝——需要改写应用代码。

4. **虚拟函数数量上限限死多租户密度**：82599 最多 64 个 VF，VSIC 也限 64 个。在每容器独占 VNIC 的场景下，单台服务器最多 64 个独立租户，超过后只能降级到软件模拟路径。

## 适用 vs 不适用场景

**适用**：
- 高并发低延迟服务（KV 存储、消息队列、API 网关）——每次请求节省的 µs 乘以百万 QPS 就是真金白银
- 网络功能虚拟化（NFV）中间件——防火墙、负载均衡器、监控探针，包处理逻辑在用户态更灵活
- 多核服务器上要线性扩展的 I/O 密集型应用——绕过内核锁自然扩展
- 需要精细 QoS 控制的多租户环境——VNIC 速率限制器在硬件层实施

**不适用**：
- 通用桌面/单机开发场景——内核性能不是瓶颈，复杂度不值得
- 应用层计算密集而 I/O 轻的工作负载——CPU 才是瓶颈，绕过内核省下的几微秒无法体现
- 不支持 SR-IOV 的旧硬件——必须软件模拟，失去大部分性能优势
- 需要全 POSIX 兼容且不愿改代码——Arrakis/P 能兼容但性能增益有限；Arrakis/N 需要修改应用

## 历史小故事（可跳过）

- **1995 年**：U-Net 论文（von Eicken et al.）第一次在 ATM 网络时代演示"用户态网络"，但商业上失败——当时硬件不支持，只能软件模拟，性能收益不明显。
- **2006–2010 年**：SR-IOV 标准由 PCI-SIG 制定并写入各大网卡（Intel 82599 等）；IOMMU（Intel VT-d）进入主流服务器芯片，"安全 + 直通"终于有了硬件基础。
- **2012–2013 年**：Dune（OSDI 2012）用 VT-x 嵌套页表给进程提供用户态特权，Barrelfish（SOSP 2009）做了用户态驱动的多核微内核原型——为 Arrakis 提供了实现底座。
- **2014 年**：Arrakis 在 OSDI 2014 获最佳论文，同年 IX OS（同一会议）也独立提出类似思想，二者相互印证。同年 Intel DPDK 开始被数据中心工程师大规模采用，标志着"内核旁路"从学术走向工业。
- **2016 年后**：SPDK（Storage Performance Development Kit）把 Arrakis 的存储侧设计工程化；DPDK 成为电信 NFV 的标准底座；RDMA over Ethernet（RoCE）在数据中心普及——Arrakis 证明的设计原则全部工业落地。

## 学到什么

1. **"不插手"本身就是一种设计**：OS 能做的最好的事有时不是优化代码路径，而是退出数据路径——控制平面与数据平面的分离是高性能系统架构中反复出现的模式（SDN 也是如此）。
2. **硬件虚拟化能力决定软件抽象的边界**：SR-IOV + IOMMU 的成熟让"安全 + 零拷贝"同时可行；没有合适的硬件，再好的 OS 设计也只是空中楼阁。
3. **POSIX 兼容层是推广的命门**：性能极限需要新 API，但工程上先提供 POSIX 兼容层让已有应用受益，再用新 API 挖掘上限——两层接口的策略在 DPDK/io_uring 里都有体现。
4. **微秒级优化在高并发下才能显现价值**：单次节省 2 µs 毫无感觉，但 1M QPS × 2 µs = 每秒节省 2 秒 CPU 时间——性能优化必须乘以访问频率才能判断意义。

## 延伸阅读

- USENIX 演讲视频：[Arrakis OSDI 2014](https://www.usenix.org/conference/osdi14/technical-sessions/presentation/peter)（含 slides）
- 论文全文 PDF：[osdi14-paper-peter_simon.pdf](https://www.usenix.org/system/files/conference/osdi14/osdi14-paper-peter_simon.pdf)
- Intel DPDK 官方文档：[DPDK Programmer's Guide](https://doc.dpdk.org/guides/prog_guide/)——Arrakis 思想的工程化版本
- [[barrelfish-2009]] —— Arrakis 的实现底座，用户态驱动的多核 OS
- [[exokernel-1995]] —— 20 年前的先驱，提出"把 OS 策略交给应用"，被 Arrakis 用硬件虚拟化实现了

## 关联

- [[barrelfish-2009]] —— Arrakis 直接基于 Barrelfish 代码库实现，借用其用户态驱动架构
- [[exokernel-1995]] —— 同样主张应用定制 OS 服务，Arrakis 是硬件虚拟化时代的重新实现
- [[xen-2003]] —— Xen hypervisor 提供了 SR-IOV 的早期概念验证，Arrakis 把同样技术用于进程级隔离
- [[gpudirect-rdma-2014]] —— RDMA 是另一条"绕过内核"路线，Arrakis 在论文中讨论了两者的异同
- [[hyperkernel-2017]] —— 同样致力于精简内核，用形式化验证保证安全，与 Arrakis 互为补充
- [[nvme-protocol-2017]] —— NVMe 多命令队列标准是 Arrakis VSIC 硬件模型的工业实现
- [[mach-1986]] —— 微内核先驱，把 OS 服务移到用户态，Arrakis 在高性能 I/O 方向延续这一思路

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
