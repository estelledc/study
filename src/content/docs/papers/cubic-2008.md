---
title: CUBIC 2008 — Linux 默认拥塞控制，三次曲线把千兆带宽喂饱
来源: 'Ha, Rhee, Xu, "CUBIC: A New TCP-Friendly High-Speed TCP Variant", ACM SIGOPS Operating Systems Review, July 2008'
日期: 2026-06-01
分类: 网络
难度: 中级
---

## 是什么

CUBIC 是 Linux 内核从 2.6.19（2006）起就用的**默认 TCP 拥塞控制算法**。它解决一个具体问题：1990 年代设计的 Reno/NewReno 在今天的高带宽长延迟链路上**爬不动**——千兆链路 + 跨洲 100ms RTT，Reno 想从掉窗一半涨回满速要好几个小时。

CUBIC 的核心技巧：把 cwnd 随时间的增长函数从 Reno 的"线性 +1"换成**一条三次曲线**。曲线在上一次撞墙的位置（W_max）附近**走得很慢**（小心翼翼怕再撞），离 W_max 越远**走得越快**（远了说明带宽变了，要赶紧跟上）。

日常类比：开车上下班遇到一段总在 80km/h 处堵的路。Reno 司机每次都从龟速一路慢慢加到 81 撞墙、再降到 40、再慢慢加；CUBIC 司机记得"上次到 80 才撞"，于是先快速冲到 75、慢慢逼近 80、试探一下没堵就继续往 90 顶。

## 为什么重要

不理解 CUBIC，下面这些事都解释不清：

- 为什么家用宽带从 100M 涨到 1G 后，下载一个文件几秒就跑满——背后是 CUBIC 在工作
- 为什么 Linux 默认拥塞控制至今（2026）还是 CUBIC，BBR 没能完全取代它
- 为什么"长肥管道"（Long Fat Network，BDP > 几 MB）是网络协议反复要解决的硬骨头
- 为什么 [[tcp-vegas-1995]] 被 CUBIC 压制——丢包派+三次曲线在公网混跑里赢过 RTT 派

## 核心要点

CUBIC 的所有秘密都在一个公式里：

```
W(t) = C * (t - K)^3 + W_max
```

逐部分解释：

1. **W_max**：上次因丢包减窗时的窗口大小。这是"上次撞墙的高度"，CUBIC 记住它。
2. **t**：从减窗那一刻开始的真实时间（秒）。注意是真实时间不是 RTT。
3. **K**：从减窗后回到 W_max 需要多久。公式 `K = (W_max * β / C)^(1/3)`，β=0.2 是减窗比例（CUBIC 砍 20%，比 Reno 砍 50% 温和），C=0.4 是缩放系数。
4. **三次曲线形状**：t < K 时曲线凹（接近 W_max 时变缓），t > K 时曲线凸（超过 W_max 后越来越快地探测新带宽）。

关键性质：**窗口增长只看真实时间 t，不看 RTT**。这一点带来 RTT 公平性——RTT 短的流和 RTT 长的流，一秒钟内都按同一条曲线涨，不再像 Reno 那样"RTT 短的吃光带宽"。

兜底机制：当算出来的 CUBIC 窗口比同条件下 Reno 还小，CUBIC 就退化成 Reno 行为。这叫 **TCP-friendly 模式**，保证它在低 BDP 场景不抢传统流的带宽。

## 实践案例

### 案例 1：看自己机器上的 CUBIC

```bash
# 看默认拥塞控制
sysctl net.ipv4.tcp_congestion_control
# net.ipv4.tcp_congestion_control = cubic

# 看可用算法
sysctl net.ipv4.tcp_available_congestion_control
# = reno cubic bbr vegas

# 看一条连接当前 cwnd
ss -tin state established | head -5
```

只要机器是 Linux（包括 Android、容器宿主、绝大多数云服务器），默认就是 CUBIC。macOS 自 Yosemite（2014）起默认也是 CUBIC；更早的 Mac 才用 NewReno。

### 案例 2：手算曲线高度

假设上次 W_max = 100 个包，丢包后 cwnd 砍到 80。算 K：

```
K = (100 * 0.2 / 0.4)^(1/3) = 50^(1/3) ≈ 3.68 秒
```

意思：从减窗那一刻起，需要约 3.68 秒重新爬回 100。爬的轨迹（公式基底始终是 W_max=100）：

| 时间 t | W(t) = 0.4*(t−K)^3 + 100 ≈ |
|--------|--------|
| 0 秒   | 100 + 0.4*(−3.68)^3 ≈ 80（凹底）|
| 1 秒   | 100 + 0.4*(1−3.68)^3 ≈ 92（接近 W_max）|
| 3.68 秒| 100 |
| 5 秒   | 100 + 0.4*(5−3.68)^3 ≈ 101（开始探测新带宽，慢）|
| 10 秒  | 100 + 0.4*(10−3.68)^3 ≈ 201（远离 W_max，探测加速）|

凹+凸两段拼起来：靠近上次撞墙处小心，远离时激进。

### 案例 3：长肥管道下 Reno vs CUBIC

链路：1Gbps，RTT = 100ms，BDP = 12.5 MB ≈ 8333 个 1500 字节包。

- Reno：丢一次包 cwnd 砍半，每个 RTT +1 个包，要 4166 * 0.1s ≈ **7 分钟**才能爬回满速
- CUBIC：丢一次包 cwnd 砍 20%（W_max=8333 → 6666），按曲线 K = (8333 * 0.2 / 0.4)^(1/3) ≈ 16 秒爬回满速

7 分钟 vs 16 秒，差 25 倍。这就是 CUBIC 在 2006 年被 Linus 拍板设为默认的直接原因。

### 案例 4：切回 Reno 体验差距

```bash
sudo sysctl -w net.ipv4.tcp_congestion_control=reno
# 跑大文件下载
curl -o /dev/null https://speedtest.tele2.net/1GB.zip
# 切回 cubic 再跑一次
sudo sysctl -w net.ipv4.tcp_congestion_control=cubic
curl -o /dev/null https://speedtest.tele2.net/1GB.zip
```

跨洲链路上能直接看到吞吐差，本地 LAN 看不出（BDP 太小，CUBIC 退化成 Reno）。

## 踩过的坑

1. **不是真的"消除丢包"**：CUBIC 仍然是丢包派——靠丢包做减窗信号。和 [[tcp-vegas-1995]] 的"看 RTT 提前减"是两条路线。
2. **C 和 β 是经验常数**：C=0.4、β=0.2 是论文实测调出来的。真换成数据中心微秒级 RTT 场景，得重新调参（DCTCP 路线）。
3. **不公平的另一面**：CUBIC 对长 RTT 流公平，但对 Reno 流"略凶"——同一瓶颈上 CUBIC 会把 Reno 流挤到更小份额。这是 CUBIC 推广中真实争议过的问题。
4. **HyStart 不是 CUBIC 本体**：Linux CUBIC 实现里附带的 HyStart（混合慢启动）是另一个补丁，2008 年 SIGOPS 原文没讨论，看代码时别混淆。
5. **t 是减窗后真实时间**：实现里要细心维护，连接刚建或迁移路径会重置时间原点，否则曲线算飞。

## 适用 vs 不适用场景

**适用**：

- 高 BDP 链路（千兆/万兆 + 跨地域 RTT）——CUBIC 设计出来就是干这个
- 公网混跑流量——TCP-friendly 兜底让它不欺负 Reno
- 服务器对客户端默认配置（Linux 服务器、Android 客户端）

**不适用**：

- 数据中心微秒 RTT 场景——参数失配，应该用 DCTCP / DCQCN
- 无线/移动网络——丢包不全是拥塞造成的，CUBIC 会误判减窗（BBR 在这种场景表现更好）
- 实时游戏/会议——CUBIC 仍允许队列堆积带来缓冲膨胀（bufferbloat），延迟敏感场景偏好 BBR

## 历史小故事（可跳过）

- **2004 年**：Rhee 团队在北卡州立大学发表 BIC-TCP，用二分搜索找新 W_max。Linux 2.6.8 短暂用过 BIC 当默认。
- **2006 年**：同团队把 BIC 的分段函数改成单一三次多项式，更平滑——CUBIC 诞生。Linux 2.6.19 把默认从 BIC 切到 CUBIC。
- **2008 年 7 月**：Ha、Rhee、Xu 在 SIGOPS Operating Systems Review 发表正式论文，**11 页**，把"已经在生产跑两年的算法"补上学术档案。
- **2010 年代**：Windows / iOS 都跟进类似的高速 TCP 算法，CUBIC 思想（三次曲线 + W_max 记忆）成为行业共识。
- **2016 年**：Google 推出 BBR，挑战丢包派路线。但十年后（2026），Linux 默认仍是 CUBIC，BBR 主要在 Google 自家服务器和 YouTube 上跑。

## 学到什么

1. **协议设计要看部署环境演化**：Reno 1988 年很合理，2006 年合不上千兆链路——20 年带宽涨千倍，算法必须重写
2. **真实时间 vs RTT 时间**：把增长函数与 RTT 解绑，是 CUBIC 拿到 RTT 公平性的关键技巧
3. **凹+凸两段曲线讲一个故事**：先小心、再激进——这是探测未知带宽的通用模式
4. **TCP-friendly 兜底是部署博弈**：算法再先进，也得在公网和老算法共存时不"耍流氓"，否则没人敢部署

## 延伸阅读

- 论文 11 页 PDF：[Ha-Rhee-Xu, CUBIC, SIGOPS OSR 2008](https://www.cs.princeton.edu/courses/archive/fall16/cos561/papers/Cubic08.pdf)
- 前身：[BIC-TCP, INFOCOM 2004](https://www.cs.princeton.edu/courses/archive/fall16/cos561/papers/BICTCP04.pdf) — CUBIC 的二分搜索版祖先
- 对手：[BBR, ACM Queue 2016](https://queue.acm.org/detail.cfm?id=3022184) — 丢包派之后的带宽-RTT 路线
- [[tcp-vegas-1995]] —— RTT 派的开山，CUBIC 把丢包派推到了顶
- [[tcp]] —— 底层协议，CUBIC 只是它的拥塞控制插件

## 关联

- [[tcp]] —— 拥塞控制是 TCP 的可插拔模块，CUBIC 是当前默认
- [[tcp-vegas-1995]] —— 同时代的 RTT 派对手，公网部署里输给丢包派
- [[jacobson-1988]] —— Reno 的祖师，CUBIC 解决的就是 Reno 在高 BDP 下的局限
- [[red-1993]] —— 路由器侧的早期信号，和端侧的 CUBIC 形成互补

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[bbr-2017]] —— BBR 2017 — 用瓶颈带宽和最小 RTT 替代丢包当拥塞信号
- [[gcc-webrtc-2016]] —— GCC (WebRTC) — 让视频通话不卡的拥塞控制算法
