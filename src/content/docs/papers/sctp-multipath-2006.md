---
title: SCTP 多路径并发传输 — 在 MPTCP 之前，用多宿主实现多链路同时发数据
来源: 'Iyengar, Amer, Stewart. "Concurrent Multipath Transfer Using SCTP Multihoming Over Independent End-to-End Paths". IEEE/ACM Transactions on Networking, 2006'
日期: 2026-06-24
分类: 网络协议
难度: 中级
---

## 是什么

想象你住的小区有两个门——东门和南门。平时快递只走东门，南门留着以防东门堵了才绕路。
这篇论文提出的 CMT（Concurrent Multipath Transfer）说：两个门同时收快递，吞吐量能翻倍。

SCTP 天生支持「多宿主」（multihoming）——一台主机可绑定多个 IP，因而有多条端到端路径。
但标准 SCTP（RFC 4960）只选一条「主路径」发新数据，其余路径仅做故障切换备份。
CMT 打破限制：发送端把新数据块分散到所有可用路径上并发传输，把多条路径带宽聚合起来。

与后来的 MPTCP 不同，CMT 不改 TCP 栈，直接利用 SCTP 已有的多宿主地址协商，
只需在发送端加调度与拥塞控制逻辑即可工作。

一句话：**CMT = 在标准 SCTP 多宿主之上，把「备份路径」升级成「同时干活的路径」。**

## 为什么重要

不理解 CMT，下面这些事会很难解释：

- 为什么传输层多路径并发研究在 2006 年就系统化了，比 MPTCP（2011 年 RFC 6824）早五年
- 为什么后来 MPTCP、QUIC 多路径都要面对「接收缓冲区阻塞」这一核心难题
- 为什么仅改发送端逻辑就能用现有 SCTP 多宿主能力提吞吐，无需中间设备配合
- 为什么五种重传策略对比，成了后续多路径数据调度实验的方法论起点

## 核心要点

论文发现朴素并发会产生三个副作用，并一一修正：

1. **Split Fast Retransmit（SFR）——各门自己数迟到包裹。**
   不同路径 RTT 不同，后发的块可能先到，接收端出现「缺口」并发重复 SACK（选择性确认）。
   标准 SCTP 见 3 个重复 SACK 就快速重传，其实只是乱序。SFR 为每条路径独立计 TSN（传输序号）缺口，
   只有同一路径报告的缺口才计入该路径计数器。类比：东门迟到不怪南门。

2. **Cwnd Update for CMT（CUC）——哪条路新确认了，就给哪条路加窗口。**
   标准 SCTP 收到 SACK 往往只为主路径涨 cwnd（拥塞窗口）。CMT 下数据在多路上，
   CUC 按各 destination 新确认的 TSN，独立更新该路径 cwnd，让每条路像单独跑一样增长。
   类比：东门签收了就给东门加配额，不要把南门的签收算到东门账上。

3. **Delayed Ack for CMT（DAC）——乱序成常态时别立刻回执风暴。**
   接收端遇乱序本应立即发 SACK；多路径下乱序常态会导致反向路径拥塞。
   DAC 让接收端稍等再发（类似 TCP 延迟确认）。类比：两门同时进货时，门卫先攒几单再统一回执。

## 实践案例

### 案例 1：发送端按路径轮询调度（迷你伪代码）

```text
paths = [wifi, lte]          # 两条独立端到端路径
for chunk in data_stream:
    p = pick_path_with_room(paths)   # 选还有 cwnd 余量的路径
    send(chunk, via=p)
    track_tsn_on(p, chunk.tsn)       # 该路径自己的 TSN 账本
```

**逐部分解释**：

- `pick_path_with_room`：有发送配额才发，避免把慢路径塞爆。
- `track_tsn_on`：为 SFR 准备——缺口计数必须按路径分开。
- 这就是「两门同时收快递」在发送端的最小实现骨架。

### 案例 2：丢包时选哪条路重传

```text
if chunk.lost:
    # RTX-LOSSRATE：发到当前丢包率最低的另一条路径
    alt = argmin(paths, key=loss_rate) excluding chunk.orig_path
    retransmit(chunk, via=alt)
```

**逐部分解释**：

- 论文对比了 RTX-SAME / ASAP / CWND / SSTHRESH / LOSSRATE 五种策略。
- 结论倾向：发到另一条可用路径通常优于原路径（原路径可能正拥塞）。
- `ssthresh` 可理解为该路径的「慢启动阈值」——历史吞吐能力的粗指标。

### 案例 3：手机 Wi‑Fi + 蜂窝双接入

手机同时有 Wi‑Fi 与 4G 两个 IP。CMT 思路直接启发了后来 Apple 在 iOS 7+ 用 MPTCP
做 Wi‑Fi/蜂窝切换与带宽聚合。电信信令网双归属节点也可让主备链路同时跑信令。

**逐步理解**：① 协商多地址 → ② 新数据按路径分散 → ③ 各路径独立拥塞控制 → ④ 接收端按序交付。

数据中心多网卡场景里，CMT 在**单个连接内按块分路径**，与网络层 ECMP「按流选路」互补：
ECMP 不会拆开同一条流，CMT 可以。

## 踩过的坑

1. **接收缓冲区阻塞（rbuf blocking）**：快路径数据到了却不能交给应用，因为慢路径前序块未到（SCTP 保序）；缓冲区满后通告窗口卡住，整连接停顿。后续工作（2007）提出 CMT-PF：连续超时的路径标为「可能失败」，暂停向其发新数据。

2. **路径带宽差极大时吞吐退化**：如 100Mbps vs 1Mbps，朴素轮询把数据堆在慢路径，快路径数据在接收端排队无法交付；需按 cwnd/RTT 加权调度。

3. **NAT/防火墙不认 SCTP**：协议号 132 常被拦，多宿主地址在 NAT 后难映射——公网难部署，CMT 多留在学术与电信专网。

4. **共享瓶颈时白忙**：两个 IP 走同一根上行线缆时，并发不增带宽，只增乱序开销。

## 适用 vs 不适用场景

**适用：**
主机确有多条独立端到端路径（不共享瓶颈）——电信信令双归属、数据中心多网卡、手机 Wi‑Fi+蜂窝。
需要高吞吐或快速故障切换时收益最大。

**不适用：**
路径共享瓶颈；对延迟极敏感的实时交互（游戏、VoIP）——乱序重组引入抖动；
公网 NAT 穿越困难时不如 MPTCP/QUIC 多路径；单路径已够用的轻量请求（DNS、小 REST）不值得上多路径。
路径 RTT/带宽差过大时，吞吐甚至可能低于只用快路径。

## 历史小故事（可跳过）

- **2000**：RFC 2960 定义 SCTP，为 SS7 信令迁 IP 而生，多宿主主要是容灾。
- **2006**：Iyengar 在 Delaware 的博士工作与 ToN 论文系统提出「备用路径也用来传数据」即 CMT。
- **2007**：RFC 4960 更新 SCTP；同团队论文分析有界接收缓冲与 CMT-PF。
- **2011+**：IETF MPTCP（RFC 6824）把多路径思想工程化进 TCP 生态；子流独立拥塞控制可追溯到 CMT 教训。

## 学到什么

- 多路径不是「拆开发到多条路」这么简单：拥塞控制要按路径独立、重传判断不能跨路径混淆、接收端要容忍大范围乱序。
- 「按路径独立管理状态」是第一原则——MPTCP 子流与 CMT 路径独立 cwnd 一脉相承。
- 取舍是吞吐 vs 延迟 vs 公平性三角：CMT 用乱序等待换吞吐，适合批量传输。
- 部署能力与设计优劣同等重要——SCTP 技术上多处优于 TCP，却因 NAT 难在公网普及。

## 延伸阅读

- RFC 4960：SCTP 标准，多宿主、四次握手与心跳
- RFC 6824 / RFC 8684：MPTCP，CMT 思想在 TCP 生态的工程化
- Iyengar et al. 2007：有界接收缓冲与 CMT-PF
- IETF draft-tuexen-tsvwg-sctp-multipath：把 SFR/CUC/DAC 写入规范草案
- Wischik et al. 2011：MPTCP 拥塞控制，可与 CUC 对照
- [[mptcp-2012]] —— 手机同时用 Wi‑Fi 和蜂窝传数据的后续主线

## 关联

- [[tcp]] —— SCTP 继承并扩展了 TCP 的可靠传输与拥塞控制
- [[quic]] —— QUIC 多路径扩展同样面对接收缓冲阻塞与调度
- [[jacobson-1988]] —— CMT 的 cwnd 管理基于 Jacobson 拥塞避免
- [[ron-2001]] —— 弹性覆盖网也用多路径，但在应用层
- [[bbr-2017]] —— 基于带宽估计的拥塞控制，路径调度也需容量探测
- [[mptcp-2012]] —— CMT 经验教训在 TCP 多路径上的工程落地

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[mptcp-2012]] —— MPTCP — 让手机同时用 Wi-Fi 和 4G 传数据
