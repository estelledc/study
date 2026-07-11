---
title: TCP Vegas 1995 — 不等丢包，靠 RTT 早一步看见拥塞
来源: 'Brakmo & Peterson, "TCP Vegas: New Techniques for Congestion Detection and Avoidance", IEEE JSAC, Feb 1995'
日期: 2026-06-01
分类: 网络
难度: 中级
---

## 是什么

1988 年 Jacobson 给 TCP 装上的拥塞控制（Tahoe / Reno）有一个核心假设：**丢包 = 路上堵了**。所以 **cwnd**（拥塞窗口，一次最多允许多少个包还在路上飞）一路涨到撞墙、丢包、砍半，再涨——典型的"锯齿"曲线。

Brakmo 和 Peterson 1995 年问了一句反话：**为什么非要等丢包？包还没丢之前，RTT 已经在悄悄变长了——队列在路由器里慢慢堆起来，每个包多等一会，往返时间就开始爬。看 RTT，就能在丢包之前先一步看出拥塞**。

这套算法被叫做 **TCP Vegas**（作者在 Arizona，命名学 Reno、Tahoe 的地名传统）。它不靠丢包反馈，而是把"理论上该有的吞吐"和"实测吞吐"做差，差出来的部分就是路由器队列里多余的包数。

日常类比：高速公路堵车前，你能感觉到车速从 120 慢慢降到 100、90——不用等真的刹停，提前减速就能避免堵成一锅。Vegas 就是这种"先看车速，再决定油门"的开法。

## 为什么重要

不理解 Vegas，下面这些事都说不清：

- 为什么 BBR（Google 2016）说自己"看带宽不看丢包"听起来很新——它和 Vegas **同属丢包前的早期信号一脉**，不是同一套公式
- 为什么 Linux 内核里 Reno、CUBIC、BBR、Vegas 可以**插拔切换**——拥塞控制是开放接口
- 为什么"丢包派 vs 时延派"反复出现——Reno/CUBIC 一边、Vegas/BBR 一边
- 为什么数据中心有人用 DCTCP（靠 ECN 标记队列）——也是"别等丢包"的早期信号，和 Vegas 思路同族、机制不同

## 核心要点

Vegas 的灵魂只有一个量：**Expected − Actual**（理论吞吐减实测吞吐）。

1. **测一个 BaseRTT**：记下见过的最小 RTT，当作"路上完全不堵时一个包来回多久"。类比：空荡荡公路上的巡航时间。

2. **每个 RTT 算一次差值**：窗口打满时可用教学近似 `Expected = cwnd / BaseRTT`、`Actual = cwnd / RTT`（论文原文按发送字节/耗时测吞吐）。两者相减再乘 `BaseRTT`，就是**这一刻队列里多塞了多少包**。

3. **三档调速（α / β）**：差值在 `[α, β]`（论文取 1 和 3）就稳住；低于 α → cwnd +1；高于 β → cwnd −1。**线性微调，不砍半**。副产品：重传可不等 3 个重复 ACK（dup-ACK），用更细的 RTT 判断；慢启动每隔一个 RTT 测差值，超阈值 γ 就提前切到拥塞避免——像油门还没踩满就先看车速是否开始掉。

## 实践案例

### 案例 1：Linux 内核切到 Vegas

```bash
# 若列表里没有 vegas，先试：sudo modprobe tcp_vegas
sysctl net.ipv4.tcp_available_congestion_control
sudo sysctl -w net.ipv4.tcp_congestion_control=vegas
iperf3 -c <server> -t 30
ss -tin state established | grep cwnd
```

**逐部分解释**：

- `modprobe` / `available`：确认内核编进了 Vegas；没有就装不上，别硬切
- `tcp_congestion_control=vegas`：只影响本机新建连接的拥塞算法
- 再跑 iperf3，用 `ss` 看 cwnd——Vegas 常见走势是"指数 → 线性 → 平台期 → ±1 微调"，不像 Reno 的锯齿

### 案例 2：Vegas 和 Reno 同台会输

两台机器同时打同一 server：一台设 `tcp_congestion_control=vegas`，另一台设 `=reno`，各跑 `iperf3 -c server -t 60`，对比双方报告的吞吐。

**逐部分解释**：

- Vegas 见 RTT 涨就主动让步；Reno 继续涨到丢包才砍半
- 共享瓶颈时，礼让的流吞吐会被压下去
- 这是 1990 年代部署测试栽跟头、Linux 默认长期留 Reno/CUBIC 的关键原因

### 案例 3：手算 Expected − Actual

设 cwnd = 12 包，BaseRTT = 12ms，当前 RTT = 42ms（窗口打满时的教学近似）：

```
Expected = 12 / 12 = 1 包/ms
Actual   = 12 / 42 ≈ 0.286 包/ms
Diff     = (1 - 0.286) * 12 ≈ 8.6 个包
```

**逐部分解释**：

- Diff ≈ 9 表示大约 9 个包堆在路由器队列里，远超 β=3
- Vegas 本拍把 cwnd 减 1，下个 RTT 再算，直到差值落回 [1, 3] 才稳住
- 全程不必丢包——反馈来自"RTT 变长了"，不是"包没了"

## 踩过的坑

1. **BaseRTT 漂移**：路径切换（移动、BGP 改道）后真实最小 RTT 变了，旧记忆让差值全错；Vegas+ / FAST 会周期性重置。
2. **和丢包派同台吃亏**：见 RTT 涨就让，Reno 不让，带宽被抢走。
3. **α、β 无普适答案**：论文 1/3 面向 1995 年几十毫秒 RTT、几 Mbit/s；今日数据中心微秒级 RTT、10G/100G 必须重调。
4. **路由器策略干扰**：公平排队或 AQM（主动队列管理，路由器提前丢包/标记）时，堆积不在你这条流上，差值会失真。
5. **不是"无丢包"**：只是把丢包推后；极端仍会撞 buffer 上限。

## 适用 vs 不适用场景

**适用**：

- 单边可控链路（自家机房、专线 VPN）——节点都跑 Vegas，没人抢
- 实时应用（游戏、视频会议）——队列短，单包延迟更稳
- 长肥管道研究——RTT 信号比丢包敏感，便于建模
- 想先理解 BBR/DCTCP 的"早期信号"直觉时——Vegas 公式更短、更好手算

**不适用**：

- 公网混跑 Reno/CUBIC——礼让会被欺负，吞吐往往明显偏低
- 无线/卫星等高度抖动链路——RTT 噪声让差值不可信，容易误加减窗
- 短连接（HTTP 单请求、握手后只传几 KB）——BaseRTT 样本不足连接就关了，算法还没进入稳态

## 历史小故事（可跳过）

- **1994**：Arizona 实验对比 Reno，写出 SIGCOMM 1994 会议版
- **1995-02**：JSAC 期刊版正式叫 TCP Vegas（约 14 页），吞吐比 Reno 高约 37%–71%，丢包低数倍
- **1990 年代后期**：Reno/NewReno 成 BSD/Linux 默认，Vegas 因礼让吃亏未成主流
- **2003**：FAST TCP（Caltech）沿 Vegas 思路做高速精细版；Linux 保留 Vegas 可选模块
- **2016**：Google BBR 把"不靠丢包"工程化进主流互联网

## 学到什么

1. **拥塞信号可多选**：丢包、RTT、ECN、显式反馈——选哪个决定协议脾气
2. **正确不等于流行**：数学更优也可能输给"会抢"的混跑纳什均衡
3. **早期信号 vs 晚期信号**：丢包是事后硬反馈，RTT 是事前软信号；BBR、DCTCP 越来越倾向软信号
4. **AIMD 不是唯一解**：线性 ±1 或 pacing 模型，只要稳定+公平能证明即可

## 延伸阅读

- 论文 PDF：[Brakmo & Peterson, TCP Vegas, IEEE JSAC 1995](https://www.cs.cornell.edu/people/egs/615/vegas.pdf)
- [FAST TCP, Caltech 2003](https://www.cs.caltech.edu/~weixl/research/fast/fast-infocom.pdf) — 高速链路上的精细化
- [BBR, ACM Queue 2016](https://queue.acm.org/detail.cfm?id=3022184) — "不靠丢包"如何进主流
- [[jacobson-1988]] —— 丢包派开山，Vegas 的反面命题
- [[tcp]] —— 协议本身；Vegas 是拥塞控制插件
- [[red-1993]] —— 路由器侧提前丢包，和端侧看 RTT 对照着读

## 关联

- [[jacobson-1988]] —— 丢包派祖师；Vegas 正面反驳"必须等丢包"
- [[tcp]] —— 拥塞控制是 TCP 可热插拔子模块
- [[red-1993]] —— 路由器侧早期信号（提前丢包）；Vegas 是端侧早期信号（看 RTT）
- [[clark-1988]] —— 端到端哲学：拥塞由端主机判断
- [[saltzer-1984-e2e]] —— 端到端原则在拥塞控制里的落地

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
