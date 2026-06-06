---
title: CMT-SCTP 2006 — 让两条网络路径同时干活而不打架
来源: 'Iyengar, Amer & Stewart, "Concurrent Multipath Transfer Using SCTP Multihoming Over Independent End-to-End Paths", IEEE/ACM ToN 2006'
日期: 2026-06-06
分类: 网络协议
子分类: 网络协议
难度: 中级
---

## 是什么

CMT-SCTP（Concurrent Multipath Transfer）是一套扩展算法，让 SCTP 协议的"多宿主"特性**从热备切换升级为并发传输**——两条或更多路径同时搬运数据，而不是一条在跑、另一条坐等接班。

日常类比：快递公司同时派两辆货车跑两条不同的高速公路送同一批货。标准 SCTP 原本是"一辆车跑，另一辆在停车场备用"。CMT 的问题是——两辆车各自开到不同地方，收件人收到包裹的顺序就乱了，而旧算法会把"乱序"误认为"丢包"，引发一连串错误反应。

SCTP 本身在 2000 年为电话信令（SS7 over IP）而生，内建多宿主（一台主机绑多个 IP 地址）。多宿主最初只用于故障切换：主路径断了再走备份路径。CMT 这篇 2006 年的论文问：能不能**两条路同时用**？答案是"能，但要解决三个拦路虎"。

## 为什么重要

不理解 CMT-SCTP，下面这些事都没法解释：

- 为什么多宿主 ≠ 多路径并发：SCTP 有多路径能力，但默认只当故障备援，不做带宽聚合
- 为什么 MPTCP（2009 年后的标准）要单独设计拥塞控制——CMT 2006 已经踩过"路径间 cwnd 共用"的坑
- 为什么接收方"乱序"会让发送方错认丢包，从而把双倍好好的吞吐量浪费在假重传上
- 为什么多路径传输协议的核心难题是"调度 + 确认 + 拥塞"三件事要同时对齐，缺一不可

## 核心要点

CMT 需要解决三个相互耦合的问题：

1. **假快重传（False Fast Retransmit）**：每个数据块都有一个 TSN（Transmission Sequence Number，数据序列号，相当于快递单号）。多路径下包到达顺序天然乱，接收方收到乱序时会发出 SACK（Selective ACK，选择确认，相当于逐件打收据）。重复 SACK 和"真的丢包"产生的重复 SACK 长得一模一样。类比：两辆货车同时送货，收件人先收到单号 5 的箱子，再收到 1-4，于是误催发件方"1-4 丢了！"。修复方案是引入 **HTNA**（Highest TSN Newly Acknowledged，已被任意路径确认的最高序号）标记：只有数据空洞比 HTNA 更旧、**真的没被任何路径确认过**，才触发快重传。

2. **拥塞窗口过度保守（Overly Conservative cwnd Growth）**：cwnd（拥塞窗口，控制发送方每次最多在途多少数据）如果多条路径共用一个，某条路径拥塞减速时另一条也被拖慢，聚合带宽大打折扣。类比：两辆货车共享同一个"每小时允许出发多少件"的配额，任一辆堵路另一辆也不能多发。修复方案是**路径独立 cwnd**：每条路径自己维护、自己增减，互不干扰。

3. **ACK 流量激增（Increased ACK Traffic）**：并发传输下，接收方收到的数据块总是不连续，累积确认很难合并，导致 SACK 总量反而比单路径多出数倍。类比：两辆车送来的包裹全是"拼图碎片"，收件人每收一片就要单独打电话确认，而不是等凑齐一批再打。修复方案是**延迟 SACK 策略**：短暂等待、合并确认，减少不必要的 ACK 包。

## 实践案例

### 案例 1：双链路服务器聚合带宽

一台服务器同时连接两条 100 Mbps ISP 链路，使用 CMT-SCTP 向客户端并发传输大文件：

```
服务器（IP-A: 10.0.1.1, IP-B: 10.0.2.1）
    ├── 路径 1（通过 ISP-A）→ 客户端 IP-X
    └── 路径 2（通过 ISP-B）→ 客户端 IP-Y
```

CMT-SCTP 把数据块交替分配到两条路径：

```
发送端调度：
  TSN 1, 3, 5, 7 → 路径 1（ISP-A，快）
  TSN 2, 4, 6, 8 → 路径 2（ISP-B，稍慢）
接收端到达顺序（路径 1 先到）：
  收到：1, 3, 5, 7  →  HTNA = 7（任意路径确认的最高序号）
  未到：2, 4, 6, 8（路径 2 还在路上）
  标准 TCP 快重传：3 个 SACK 空洞 → 触发重传
  CMT-HTNA 判断：空洞序号 2/4/6/8 < HTNA=7 吗？是 → 不触发，等路径 2 自然到达
```

对应的最小伪代码（展示 HTNA 判定逻辑）：

```python
# 发送端：按路径独立 cwnd 调度
def cmt_send(chunk, path1, path2):
    p = path1 if path1.cwnd > path2.cwnd else path2
    p.send(chunk)

# 接收端：HTNA 抑制假快重传
htna = 0  # 追踪任意路径已确认的最高 TSN
def on_sack(gap_start, gap_end, newly_acked_tsn):
    global htna
    htna = max(htna, newly_acked_tsn)
    # 只有空洞比 HTNA 更旧，才是真的可疑丢失
    if gap_end < htna:
        return  # 不触发快重传，等路径 2 自然交付
    trigger_fast_retransmit(gap_start)
```

关键：每条路径的 cwnd 独立更新，总有效窗口 ≈ cwnd₁ + cwnd₂，理论上吞吐量可达单路径的 2 倍。

### 案例 2：移动设备双网络接入（CMT 早期思路）

手机同时接 4G（IP-A）和 Wi-Fi（IP-B），目标是利用两条独立链路加速大文件下载。这是 MPTCP 出现前，CMT-SCTP 探索的核心场景：

```
手机（SCTP association with server）
  主路径：Wi-Fi 链路（低延迟，20ms RTT）
  辅路径：4G 链路（较高延迟，60ms RTT）
```

路径延迟差异（20ms vs 60ms）会造成接收端严重乱序——Wi-Fi 上的包比 4G 上的包早 40ms 到达。CMT 的 HTNA 机制在此尤为关键：接收方对 4G 路径上还未到的包**不发重复 SACK**，避免误判丢包。

延迟 SACK 策略此时也帮了大忙：不必每收到一个乱序块就立刻回 ACK，等累积到一批再一起确认，减少 ACK 占用的上行带宽。

### 案例 3：电信核心网信令高可用

SCTP 诞生于 SS7 over IP（SIGTRAN 场景）。CMT 可以让核心网信令在两条物理线路上并发分发，既提升吞吐、又消除单点故障：

```python
# 伪代码：CMT 路径调度器逻辑
def cmt_schedule(data_chunk, paths):
    # 选拥塞窗口最大的路径发送
    best_path = max(paths, key=lambda p: p.cwnd - p.in_flight)
    best_path.send(data_chunk)
    best_path.in_flight += len(data_chunk)

# 接收端：HTNA 判定
def should_fast_retransmit(sack, htna):
    # 只有空洞比 HTNA 更"旧"，才可能是真丢包
    return sack.gap_ack_block.start < htna
```

核心网场景对可靠性要求极高，CMT 的路径独立 cwnd 保证单条链路拥塞不会把整个信令面拖垮。

## 踩过的坑

1. **共享 cwnd 导致吞吐量不升反降**：早期 CMT 实现直接复用 SCTP 的单 cwnd，路径 1 拥塞时 cwnd 缩减，路径 2 也跟着收缩，并发效益全部抵消。修复：强制每条路径维护独立 cwnd，切忌共用。

2. **不区分乱序与丢包触发海量重传**：3 个重复 SACK 在单路径 TCP 里是丢包的强信号，但在多路径下可能只是"另一条路径的包先到了"。不加 HTNA 检查直接套用快重传阈值，会把一半带宽浪费在不必要的重传上。

3. **ACK 策略不调整加剧 ACK 风暴**：多路径下接收方对每个乱序块都立即回 SACK，ACK 流量比单路径高 3-5 倍，反向链路成为瓶颈。延迟 SACK 是必须同时打开的配套开关，单独启用 CMT 而不调 SACK 策略只能拿到部分收益。

4. **路径调度忽略 RTT 差异导致缓冲区膨胀**：Round-Robin 调度不感知路径延迟，会把大量数据扔向慢路径，在接收端堆积超大乱序缓冲区。实际部署需用 RTT 感知调度（如 cwnd-based 或 delay-based 策略）替代简单轮询。

## 适用 vs 不适用场景

**适用**：
- 两端均有多宿主（多 IP）且物理路径独立的场景：数据中心双 ISP、移动设备双网络接入
- 大文件传输 / 批量数据同步——路径利用率提升效果明显
- 电信核心网（已用 SCTP）想做带宽聚合而非仅故障备援
- 研究多路径拥塞控制的基础：CMT 是 MPTCP 之前最完整的端到端实现与验证

**不适用**：
- 中间网络设备不支持 SCTP（NAT 穿越困难、防火墙过滤）——SCTP 在公网部署受限，CMT 的瓶颈往往不是算法而是协议支持度
- 短连接、低延迟交互场景（游戏、VoIP）——路径间乱序本身就是延迟来源，CMT 帮助有限
- 路径高度相关（共享同一物理链路）——独立路径是 CMT 吞吐增益的前提，相关路径只会放大竞争

## 历史小故事（可跳过）

- **2000 年**：IETF SIGTRAN 工作组发布 RFC 2960（SCTP），多宿主最初仅用于故障切换，无并发传输意图
- **2004 年**：Iyengar、Amer 等在 SPECTS 2004 提出 CMT 初稿，识别并发传输的理论可行性，尚无完整修复方案
- **2006 年**：IEEE/ACM Transactions on Networking 发表完整 CMT-SCTP 论文，定义 HTNA 算法、路径独立 cwnd 和延迟 SACK 三大修复，附 ns-2 模拟验证
- **2009 年**：IETF MPTCP 工作组正式立项，多路径回归 TCP——CMT 探索的拥塞控制思路（尤其"路径独立 cwnd"）深刻影响了 MPTCP 的 Linked Increase Algorithm 设计
- **2013 年后**：MPTCP 在 iOS（Siri）和 Linux 内核落地，CMT-SCTP 的学术影响以更广泛的形式传承下来

## 学到什么

1. **多宿主 ≠ 多路径并发**：有多条路径不代表能自动聚合带宽；并发传输需要专门解决乱序引起的假信号和拥塞窗口干扰问题
2. **协议扩展的三件套：调度 + 确认 + 拥塞控制**，三者必须协同设计——只改其中一项往往不升反降
3. **路径独立性是多路径增益的根本前提**：物理路径相关时，并发传输放大竞争而非聚合带宽
4. **理论先行，标准滞后**：CMT 2006 解决的问题，MPTCP 2013 才大规模工业落地，学术探索往往比协议标准早 7-10 年

## 延伸阅读

- RFC 4960（2007）：[SCTP 标准规范](https://www.rfc-editor.org/rfc/rfc4960)——CMT 所有扩展的基础协议定义
- RFC 8684（2020）：[MPTCP v1 规范](https://www.rfc-editor.org/rfc/rfc8684)——CMT 思想的 TCP 继承者，对比阅读可见演化脉络
- Iyengar 博士论文（2006）：《Concurrent Multipath Transfer Using SCTP Multihoming》——比期刊论文多 30 页细节，含完整 ns-2 实验数据
- [[tcp]] —— TCP 拥塞控制是 CMT 所有设计决策的对比基准
- [[tcp-vegas-1995]] —— Vegas 的延迟感知拥塞控制思路影响了 CMT 路径感知调度的设计

## 关联

- [[tcp]] —— TCP 是理解 CMT 拥塞控制改动的参照系；CMT 的 per-path cwnd 就是给每条路径单独跑一套 TCP
- [[tcp-vegas-1995]] —— Vegas 用 RTT 检测拥塞的思路，与 CMT 路径延迟感知调度一脉相承
- [[akamai-2002]] —— 内容分发也是"多条路径送同一份数据"的工程化；CMT 和 CDN 解的是不同层次的同一问题
- [[amplification-hell-2014]] —— 网络协议滥用多路径会引发放大攻击；CMT 的 SCTP 心跳机制是对应的路径验证手段
- [[afs-1988]] —— 分布式文件系统的可靠传输设计与多路径传输同样需要解决数据一致性与乱序问题

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）

