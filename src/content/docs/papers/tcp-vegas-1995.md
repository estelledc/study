---
title: TCP Vegas 1995 — 不等丢包，靠 RTT 早一步看见拥塞
来源: 'Brakmo & Peterson, "TCP Vegas: New Techniques for Congestion Detection and Avoidance", IEEE JSAC, Feb 1995'
日期: 2026-06-01
分类: 网络
难度: 中级
---

## 是什么

1988 年 Jacobson 给 TCP 装上的拥塞控制（Tahoe / Reno）有一个核心假设：**丢包 = 路上堵了**。所以 cwnd 一路涨到撞墙、丢包、砍半，再涨——典型的"锯齿"曲线。

Brakmo 和 Peterson 1995 年问了一句反话：**为什么非要等丢包？包还没丢之前，RTT 已经在悄悄变长了——队列在路由器里慢慢堆起来，每个包多等一会，往返时间就开始爬。看 RTT，就能在丢包之前先一步看出拥塞**。

这套算法被叫做 **TCP Vegas**（论文作者在 Arizona 大学，命名学 Reno、Tahoe 的"内华达地名"传统）。它不靠丢包反馈，而是把"理论上该有的吞吐"和"实测吞吐"做差，差出来的部分就是路由器队列里多余的包数。

日常类比：高速公路堵车前，你其实能感觉到车速从 120 慢慢降到 100、90——不用等真的刹停，提前减速就能避免堵成一锅。Vegas 就是这种"先看车速，再决定油门"的开法。

## 为什么重要

不理解 Vegas，下面这些事都说不清：

- 为什么 BBR（Google 2016）说自己"看带宽不看丢包"，听起来是新东西，其实 Vegas 1995 就这么干过
- 为什么 Linux 内核里 Reno、CUBIC、BBR、Vegas 这些算法可以**插拔切换**——拥塞控制是一个开放接口
- 为什么"丢包派 vs 时延派"是网络协议里反复出现的二选一——Reno/CUBIC 一边、Vegas/BBR 一边
- 为什么数据中心里有人愿意用 DCTCP 这种"改 ECN 不靠丢包"的算法——它和 Vegas 是同源思路

## 核心要点

Vegas 的所有秘密只有一个量：**Expected − Actual**（理论吞吐减实测吞吐）。

1. **测一个 BaseRTT**：连接建立后记下你见过的最小 RTT。这就是"路上完全不堵时，一个包来回要多久"的基线。

2. **每个 RTT 算一次差值**：当前 cwnd 下，理论吞吐 `Expected = cwnd / BaseRTT`，实测吞吐 `Actual = cwnd / RTT`。两者相减乘 `BaseRTT`，结果是**这一刻路由器队列里我塞了多少包**。

3. **三档调速（α / β）**：差值落在区间 `[α, β]`（论文取 1 和 3）就稳着不动；低于 α，说明队列空着——cwnd +1；高于 β，说明队列开始堆——cwnd −1。**线性微调，不砍半**。

类比：你给水管加压（cwnd），看水龙头出水量（Actual）。如果加压但出水量没涨，多出来的水都憋在管里（队列），就该松一点；管里没憋水就再加一点。

副产品：Vegas 还顺手改了**重传时机**（不等 3 个 dup-ACK，用更细的 RTT 判断）和**慢启动**（每隔一个 RTT 测差值，超 γ 就提前切到拥塞避免）。但灵魂还是那一个差值公式。

## 实践案例

### 案例 1：Linux 内核里切到 Vegas

```bash
# 看当前可用的拥塞控制算法
sysctl net.ipv4.tcp_available_congestion_control
# tcp_available_congestion_control = reno cubic bbr vegas

# 切到 Vegas
sudo sysctl -w net.ipv4.tcp_congestion_control=vegas

# 起一个长连接看 cwnd 走势
ss -tin state established | grep cwnd
```

切完后再跑 `iperf3 -c <server> -t 30`，观察 `cwnd` 走势——和 Reno 的"指数 → 线性 → 锯齿"不一样，Vegas 是"指数 → 线性 → 一段平台期 → 微调 ±1"，曲线明显更平。

### 案例 2：Vegas 和 Reno 同台共存会输

```bash
# 一台机器开 Vegas
sudo sysctl -w net.ipv4.tcp_congestion_control=vegas
iperf3 -c server -t 60 &

# 同一时刻另一台机器开 Reno
sudo sysctl -w net.ipv4.tcp_congestion_control=reno
iperf3 -c server -t 60
```

实测 Vegas 那条流吞吐会被 Reno 压下去——**因为 Vegas 看到 RTT 涨就主动让步，而 Reno 还在猛涨直到撞包**。礼让的反而吃亏。这是 Vegas 在公网没普及的关键原因。

### 案例 3：用 ss 看 Vegas 的 BaseRTT

```bash
ss -tin -e | grep -A2 vegas
# rtt:42.3/8.5  vegas: bw_est=12Mbps  baseRTT=12 ms
```

`baseRTT=12ms` 是连接建立以来见过的最小 RTT。当 `rtt` 上涨到 `42.3ms`，差值 `(1/12 - 1/42.3) * cwnd * 12 ≈` 8 个包卡在队列里——超过 β=3，Vegas 就把 cwnd 减 1。

### 案例 4：手算一遍 Expected − Actual

假设 cwnd = 60 个包，BaseRTT = 10ms，当前 RTT = 30ms：

```
Expected = 60 / 10 = 6 包/ms
Actual   = 60 / 30 = 2 包/ms
Diff     = (6 - 2) * 10 = 40 个包
```

40 个包都堆在路由器队列里——远超 β=3。Vegas 这一拍就会把 cwnd 减 1，下一个 RTT 再算一次，直到差值落回 [1, 3] 才稳住。整个过程不需要丢一个包，纯靠"我感觉 RTT 涨了"做反馈。

## 踩过的坑

1. **BaseRTT 漂移**：路径切换（移动场景、BGP reroute）会让真实最小 RTT 变化，但 Vegas 记忆里还是旧值，差值算出来全错。后来的改进（Vegas+、FAST TCP）会周期性重置 BaseRTT。

2. **和丢包派同台吃亏**：上面案例 2 演示过——Vegas 见 RTT 涨就让，Reno 不让，结果 Vegas 拿不到带宽。1990 年代部署测试就是栽在这里，Linux 默认才一直留 Reno/CUBIC。

3. **α、β 取多少没普适答案**：论文给 α=1、β=3 是 1995 年那种 RTT 几十毫秒、链路几 Mbit/s 的环境。今天数据中心 RTT 几十微秒、带宽 10G/100G，参数要重调，否则灵敏度全错。

4. **路由器策略影响判断**：如果路径上有 fair queueing 或 AQM，队列堆积根本不在你这条流上，Vegas 算出来的差值会失真。RED（先丢包通知）和 Vegas（看 RTT）其实是两种 AQM 思路，只是发生在不同点。

5. **Vegas 不是"无丢包"**：很多人误以为 Vegas 完全不丢包，其实只是把丢包推后——队列没溢出之前先减速，但极端情况仍会撞到 buffer 上限。

## 适用 vs 不适用场景

**适用**：

- 单边可控的链路（自家数据中心、专线 VPN）——所有节点都跑 Vegas，没人抢
- 实时性要求高的应用（游戏、视频会议）——Vegas 队列短，单包延迟更稳
- 长肥管道学术研究——RTT 信号比丢包敏感，便于建模

**不适用**：

- 公网混跑 Reno/CUBIC 流的环境——Vegas 礼让会被欺负
- 高度抖动链路（无线、卫星）——RTT 噪声会让差值无意义
- 短连接（HTTP 单请求）——还没测出 BaseRTT 连接就关了

## 历史小故事（可跳过）

- **1994 年**：Brakmo 和 Peterson 在 Arizona 大学做实验，对比 Reno 和自家算法，写出 SIGCOMM 1994 的会议版
- **1995 年 2 月**：JSAC 期刊版发表，正式叫 TCP Vegas，**论文 14 页**，实测吞吐比 Reno 高 37%–71%，丢包率低三到五倍
- **1990 年代后期**：Internet 商用化爆发，Reno/NewReno 抢先成为 BSD/Linux 默认，Vegas 因为"礼让吃亏"始终没成为主流
- **2000 年代**：FAST TCP（Caltech, 2003）用更精细的控制理论沿着 Vegas 思路做高速版，Linux 把 Vegas 留作可选模块
- **2016 年**：Google 推 BBR，把"看 RTT + 看带宽"工程化到 YouTube 服务器，Vegas 的精神 21 年后真正进了主流互联网

## 学到什么

1. **拥塞信号有多种选择**：丢包、RTT、ECN、显式反馈——选哪个决定了协议的脾气
2. **正确不等于流行**：Vegas 数学上更优，但部署博弈输给"会抢"的 Reno；协议设计要考虑混跑的纳什均衡
3. **早期信号 vs 晚期信号**：丢包是出事后的硬反馈，RTT 是出事前的软信号；现代系统（BBR、DCTCP）越来越倾向软信号
4. **AIMD 不是唯一解**：Vegas 用线性 ±1，BBR 用 pacing rate 模型；只要稳定 + 公平能证明，曲线长什么样都可以

## 延伸阅读

- 论文 14 页 PDF：[Brakmo & Peterson, TCP Vegas, IEEE JSAC 1995](https://www.cs.cornell.edu/people/egs/615/vegas.pdf)
- 后续工作：[FAST TCP, Caltech 2003](https://www.cs.caltech.edu/~weixl/research/fast/fast-infocom.pdf) — Vegas 思路在高速链路上的精细化
- 现代继承者：[BBR Paper, ACM Queue 2016](https://queue.acm.org/detail.cfm?id=3022184) — 看 Google 怎么把"不靠丢包"做成主流
- [[jacobson-1988]] —— 丢包派的开山，Vegas 是它的反面命题
- [[tcp]] —— 协议本身，Vegas 只是它的一个拥塞控制插件

## 关联

- [[jacobson-1988]] —— 丢包派祖师，Vegas 提出时正面反驳"必须等丢包"
- [[tcp]] —— 拥塞控制是 TCP 的子模块，可热插拔
- [[red-1993]] —— 路由器侧的早期信号（提前丢包），Vegas 是端侧的早期信号（看 RTT），思路同源
- [[clark-1988]] —— 端到端设计哲学：拥塞由端主机判断，Vegas 把这一步做得更精
- [[saltzer-1984-e2e]] —— 端到端原则在拥塞控制里的具体落地

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[bbr-2017]] —— BBR 2017 — 用瓶颈带宽和最小 RTT 替代丢包当拥塞信号
- [[clark-1988]] —— Clark 1988 — TCP/IP 七大目标的优先级，决定了 Internet 长成今天这样
- [[cubic-2008]] —— CUBIC 2008 — Linux 默认拥塞控制，三次曲线把千兆带宽喂饱
- [[gcc-webrtc-2016]] —— GCC (WebRTC) — 让视频通话不卡的拥塞控制算法
- [[jacobson-1988]] —— Jacobson 1988 — 让互联网不再被自己塞死
- [[mogul-1995-persistent-http]] —— Mogul 1995 — 为什么 HTTP 必须改成"一根连接复用多次请求"
- [[salsify-2018]] —— Salsify — 让编码器和传输层一起商量怎么发视频
- [[saltzer-1984-e2e]] —— End-to-End Arguments — 把功能尽量推到端上做
- [[tcp]] —— TCP — 在不可靠的 IP 上凿出一条 reliable 字节流

