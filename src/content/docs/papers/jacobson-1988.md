---
title: Jacobson 1988 — 让互联网不再被自己塞死
来源: 'Van Jacobson, "Congestion Avoidance and Control", SIGCOMM 1988'
日期: 2026-05-31
子分类: 网络协议
分类: 网络协议
难度: 中级
provenance: pipeline-v3
---

## 是什么

1986 年 10 月，加州大学伯克利校园到劳伦斯实验室之间一条 32 kbit/s 的链路，吞吐忽然从正常水平塌到 **40 bit/s**——掉了一千倍。这就是后来被叫作"互联网拥塞崩溃"的事件。

Van Jacobson 在两年后的 SIGCOMM 1988 论文里，给 TCP 加了 **四样东西**：慢启动（slow start）、拥塞避免（AIMD）、快速重传（fast retransmit）、新的 RTT 估计。这套算法被 BSD 4.3 实现出来，叫做 **TCP Tahoe**。

日常类比：高速公路出口堵车，车继续往里挤会越堵越死。Jacobson 给每辆车装了一套规则——刚上路慢慢加速、看到刹车灯立刻减半、确认前路畅通才慢慢加速回来。今天每一条 TCP 连接的内核代码里，仍跑着这套思想的直系后代。

## 为什么重要

不理解这篇论文，下面这些事都没法解释：

- 为什么 `iperf` 测速时前几秒慢、几秒后才到峰值——你看到的是 slow start 在爬
- 为什么丢一个包后吞吐会突然跌一半再慢慢回来——AIMD 在动手
- 为什么 WiFi 弱信号下网页变慢不是因为带宽不够——TCP 把无线丢包当成了"路上堵了"
- 为什么 BBR、CUBIC、Reno 这些拥塞控制算法名字都在说"下一代"——它们的祖宗就是这篇

## 核心要点

Jacobson 把"网络不能崩"拆成 **四个机制**：

1. **慢启动（Slow Start）**：新连接刚建立时，不知道网络能扛多少，**cwnd 从 1 个 MSS 起步，每收到一个 ACK 翻倍**。指数爬升听起来快，但起点是 1，所以前几个 RTT 里实际很慢。类比：陌生路段先开 20 码试试，没事就加到 40、80、160。

2. **拥塞避免（AIMD）**：cwnd 涨到一个阈值（ssthresh）后切换——**每个 RTT 只加 1 个 MSS（线性加），一旦丢包立刻砍半（乘性减）**。这就是 Additive Increase Multiplicative Decrease。类比：油门慢慢踩、刹车一脚踩死。数学上能证明这种"慢加快减"的策略让多条流公平共享带宽。

3. **快速重传（Fast Retransmit）**：原来的 TCP 等 RTO 超时（上百毫秒）才重传，太慢。Jacobson 的观察：**收到 3 个重复 ACK 就说明那个包大概率丢了**，立刻重传，别等。类比：朋友连说三遍"上一句没听清"，你直接重复，不用等他挂电话。

4. **RTT 估计：均值 + 方差**：原来的 RTO 公式只用 RTT 均值乘 2，遇到网络抖动会误判。Jacobson 改成 **均值 + 4 倍方差**，自动适应抖动大小。类比：判断"还要多久到"，不光看平均通勤时间，还要看波动——晚高峰方差大，预算就要多留。

四个机制合起来就是 **TCP Tahoe**。

## 实践案例

### 案例 1：用 ss 看 cwnd 实时变化

```bash
# 一边发数据一边看 cwnd
while true; do
  ss -tin state established | grep cwnd
  sleep 0.5
done
```

你会看到 `cwnd:1` → `cwnd:2` → `cwnd:4` → `cwnd:8`（slow start 翻倍）→ 切换到线性 → 突然降到一半（碰到丢包）。这就是论文里的算法在你机器内核里实时跑。

### 案例 2：丢包后吞吐曲线长什么样

用 `iperf3` 跑一条长连接，再用 `tc qdisc` 人为注入 1% 丢包：

```bash
sudo tc qdisc add dev eth0 root netem loss 1%
iperf3 -c <server> -t 30
```

吞吐曲线会出现典型的"锯齿"——线性爬升碰到丢包瞬间砍半再爬。这条锯齿就是 AIMD 的指纹。1988 年 Jacobson 在论文图 2 里画出来过。

### 案例 3：3-dup-ACK 在抓包里长什么样

```
seq=1000, len=500  →
seq=1500, len=500  → 这一段丢了
seq=2000, len=500  →   ack=1500（说"我等 1500"）
seq=2500, len=500  →   ack=1500（重复 ACK 1）
seq=3000, len=500  →   ack=1500（重复 ACK 2）
seq=3500, len=500  →   ack=1500（重复 ACK 3）→ 触发快速重传
```

发送方不等 RTO 超时，看到 3 个 dup-ACK 立刻重发 seq=1500。这就是论文第 4 节的算法在 Wireshark 里的样子。

### 案例 4：iperf 抓出来的"先指数后线性"曲线

```
t=0.0s  cwnd=1   每 RTT × 2
t=0.1s  cwnd=2
t=0.2s  cwnd=4
t=0.3s  cwnd=8   ← 进入 slow start
t=0.4s  cwnd=16
...
t=0.9s  cwnd=512 ← 撞到 ssthresh
t=1.0s  cwnd=513 ← 切到 AIMD，每 RTT +1
t=1.1s  cwnd=514
...
t=2.5s  cwnd=720 ← 突然丢包
t=2.6s  cwnd=360 ← 砍半，重新线性爬
```

整张曲线先指数、再线性、再锯齿——这是 1988 年算法的"心电图"。

## 踩过的坑

1. **无线丢包不等于拥塞**：Jacobson 假设"丢包 = 路上堵"，这在 1988 年的有线网络成立。WiFi / 4G 链路的丢包大多是信号问题，TCP Tahoe 一砍 cwnd 反而让吞吐塌掉。后来的 CUBIC、BBR 都在试图修这个洞。

2. **慢启动其实不慢，但起点真的慢**：cwnd 从 1 起步意味着前几个 RTT 几乎不发包。短连接（HTTP 一次请求）大量时间花在爬坡上。Google 后来推 IW=10（initial window 改成 10）就是为了让 HTTP 别一直在慢启动里。

3. **ssthresh 第一次设多少没标准答案**：论文给的初值是 65535 字节，意思是"先一路 slow start 到撞墙"。这导致第一次连接经常会冲过头丢包，再砍半找平衡。

4. **多条流共享时不一定公平**：AIMD 数学上证明了"线性加 + 乘性减"会收敛到公平点，但前提是所有流 RTT 一样。RTT 差异大时短 RTT 的流会抢到更多带宽——这就是 RTT 不公平问题。

5. **Tahoe 丢包后回到 cwnd=1**：原始 Tahoe 一遇丢包就重启 slow start，太狠。一年后的 Reno 改成"砍半但不归零"（fast recovery），效率高很多。所以今天读 Linux 内核看到的更像 NewReno 而不是 Tahoe。

## 适用 vs 不适用场景

**适用**：

- 有线骨干网 / 数据中心内 TCP（丢包基本就是拥塞，假设成立）
- 长连接、大文件传输（slow start 爬完后能稳定运行 AIMD）
- 需要多条流公平共享带宽的场景

**不适用**：

- 高丢包率无线链路（4G / WiFi 弱信号）→ 用 BBR 这种基于带宽估计的算法
- 高带宽、大 BDP 链路（10G/100G + 跨洲）→ 用 CUBIC
- 实时音视频（不能容忍 cwnd 砍半的吞吐塌陷）→ 用 UDP + 应用层 QoS

## 历史小故事（可跳过）

- **1986 年 10 月**：伯克利到劳伦斯实验室那条 32 kbit/s 链路吞吐塌到 40 bit/s。Jacobson 拿示波器一样的工具盯着包看，发现重传雪崩——丢包触发重传，重传又加重拥塞，正反馈崩溃。
- **1986–1988**：Jacobson 在 BSD 内核里改 TCP，先加 slow start，再加 AIMD，最后加快速重传。每加一样都先在校园网实测。
- **1988 年 8 月**：SIGCOMM 论文发表，**11 页**。同年 BSD 4.3 Tahoe 发布带这套算法的 TCP，后来的 Reno、NewReno、SACK 都是在这个基础上改。
- **1990 年代**：互联网从研究网变成商业网，连接数指数增长。Jacobson 这套算法被证明能扛住——直到今天，所有主流 OS 的 TCP 栈起手式仍是 slow start + AIMD。

## 学到什么

1. **拥塞控制不是单点优化，是分布式协议**——每台主机各自看自己的 RTT 和丢包，决定本地行为；亿万台机器加起来涌现出"网络稳定"
2. **AIMD 的数学美**：慢加快减不是拍脑袋，是稳定性 + 公平性的解析解
3. **3-dup-ACK 这种工程启发**：不等超时、看信号自己说话——后来很多协议（QUIC、BBR）都借这个思路
4. **理论 + 实测 + 内核落地**，每一步都不能省。Jacobson 用示波器调内核的姿态值得学

## 延伸阅读

- 论文 11 页 PDF：[Van Jacobson, Congestion Avoidance and Control, SIGCOMM 1988](https://ee.lbl.gov/papers/congavoid.pdf)
- 视频讲解：[Stanford CS144 — Congestion Control](https://www.youtube.com/watch?v=6CWiH3uAsoo)（45 分钟把 AIMD 推一遍）
- 后续算法对比：[BBR Paper, ACM Queue 2016](https://queue.acm.org/detail.cfm?id=3022184)（看 Google 怎么不用丢包做信号）
- [[tcp]] —— RFC 793 是协议本身，本文是协议怎么不崩的算法
- [[quic]] —— 现代版 TCP，拥塞控制可以应用层选

## 关联

- [[tcp]] —— Jacobson 的算法跑在 TCP 栈里，是它的"自我保护机制"
- [[cerf-kahn-1974]] —— TCP/IP 设计哲学，Jacobson 的算法是这套哲学的具体落地
- [[saltzer-1984-e2e]] —— 端到端原则的体现：拥塞控制由端主机做，不靠路由器
- [[metcalfe-boggs-1976]] —— 以太网 CSMA/CD 也是"看到冲突退避"思想，AIMD 是它的精神延伸
- [[quic]] —— QUIC 把拥塞控制从内核搬到用户态，可以热插拔不同算法

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[bbr-2017]] —— BBR 2017 — 用瓶颈带宽和最小 RTT 替代丢包当拥塞信号
- [[cerf-kahn-1974]] —— Cerf-Kahn 1974 — 用网关把异构网络拼成一个互联网
- [[cubic-2008]] —— CUBIC 2008 — Linux 默认拥塞控制，三次曲线把千兆带宽喂饱
- [[metcalfe-boggs-1976]] —— Metcalfe-Boggs 1976 — 一根线上几百台电脑怎么不打架
- [[mockapetris-1988-dns]] —— Mockapetris 1988 DNS — 设计者亲口讲为什么 DNS 长这样
- [[quic]] —— QUIC — 把可靠传输从内核搬到用户空间
- [[red-1993]] —— RED — 让路由器在队列还没塞满时就提前丢包
- [[rtp-rfc-1889]] —— RTP RFC 1889 — 让 UDP 也能跑实时音视频
- [[saltzer-1984-e2e]] —— End-to-End Arguments — 把功能尽量推到端上做
- [[tcp]] —— TCP — 在不可靠的 IP 上凿出一条 reliable 字节流
- [[tcp-vegas-1995]] —— TCP Vegas 1995 — 不等丢包，靠 RTT 早一步看见拥塞

