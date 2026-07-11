---
title: Autograph 2004 — 自动给蠕虫写内容签名
来源: 'Kim and Karp, "Autograph: Toward Automated, Distributed Worm Signature Detection", USENIX Security 2004'
日期: 2026-07-09
分类: security-privacy
难度: 中级
---

## 是什么

日常类比：小区保安发现有人在每栋楼门口乱刷门禁，就先把这个人列进“可疑名单”；接着看他随身带的包裹里，哪些包装纸、标签和胶带在很多次闯门里反复出现；最后把最常见、又不太像正常快递的那段标签贴到黑名单上。

Autograph 做的就是这件事，只不过对象从小区换成网络边界，从包裹标签换成 TCP payload 里的字节串。

它是一套自动蠕虫签名生成系统：先用“端口扫描行为”筛出可疑 TCP 流，再在这些流的 payload 里找反复出现的内容块，把高频字节序列发布成 IDS 可以使用的签名。

这篇论文的关键价值是：它不需要人先读蠕虫样本，也不需要懂 HTTP、RPC 这类应用协议语义；它只利用两个事实：蠕虫会大量传播，感染 payload 里通常有一段内容反复出现。

## 为什么重要

不理解 Autograph，下面这些事都很难解释：

- 为什么早期蠕虫防御最怕“人来写签名”：Code Red 这类蠕虫传播速度比人工分析快得多。
- 为什么只封端口太粗暴：如果蠕虫打的是 80 端口，直接封 80 等于把整个 Web 一起关掉。
- 为什么内容签名比源 IP 黑名单更能延缓传播：payload 跟着蠕虫走，源 IP 会不断变化。
- 为什么自动安全系统总在“早发现”和“少误报”之间拉扯：越早下判断，背景噪声里越容易混进正常流量。

## 核心要点

1. **先缩小池子**：Autograph 不对所有流量做昂贵分析，而是先找端口扫描者。类比：不是检查小区每个包裹，而是先盯经常刷错门的人。

2. **再找重复内容**：进入可疑池后，它把 payload 切成内容块，统计哪些块出现在许多不同可疑流里。类比：多个可疑包裹都贴着同一段奇怪胶带，这段胶带就值得怀疑。

3. **最后用覆盖率选签名**：它优先选 prevalence 最高的内容块，并持续选择，直到签名集合覆盖足够比例的可疑流。类比：先抓最常见的假证模板，再补几个变体模板。

这三步合起来，就是“行为筛选 + 内容流行度 + 贪心覆盖”。Autograph 的新意不在某个单点算法，而在把这三件事串成能在 DMZ 边界运行的系统。

## 实践案例

### 案例 1：先把端口扫描者放进可疑名单

```python
failed_targets = {}
suspicious_sources = set()

def observe_failed_connect(src_ip, dst_ip):
    failed_targets.setdefault(src_ip, set()).add(dst_ip)
    if len(failed_targets[src_ip]) > scan_threshold:
        suspicious_sources.add(src_ip)
```

**逐部分解释**：

- `failed_targets` 记录某个外部 IP 连过多少个不存在或无服务的内部目标。
- `scan_threshold` 是论文里的 `s`，阈值越低越敏感，也越容易误把正常错误连接当扫描。
- 一旦来源进入 `suspicious_sources`，后续来自它的成功 TCP 流才会进入可疑流量池。

### 案例 2：用 COPP 把 payload 切成内容块

```python
def copp(payload, avg_size, min_size, max_size):
    start = 0
    for pos in range(4, len(payload)):
        hit = rabin(payload[pos-4:pos]) % avg_size == breakmark
        too_long = pos - start >= max_size
        if (hit or too_long) and pos - start >= min_size:
            yield payload[start:pos]
            start = pos
```

**逐部分解释**：

- 固定长度分块怕插入一个字节后全体错位，COPP 用内容决定边界，错位影响会小很多。
- `rabin(...)` 是 Rabin fingerprint，适合滑动窗口高效计算。
- `min_size` 和 `max_size` 限制块太短或太长：太短容易误报，太长又不抗变形。

### 案例 3：按 prevalence 贪心选签名

```python
remaining = list(suspicious_flows)
signatures = []

while covered(signatures) < w * len(suspicious_flows):
    block = most_prevalent_block(remaining)
    signatures.append(block)
    remaining = [flow for flow in remaining if block not in flow]
```

**逐部分解释**：

- `most_prevalent_block` 选“出现在最多可疑流里的内容块”。
- `w` 是想覆盖的可疑流比例；越高越能抓住少数变体，也越可能把正常噪声选进签名。
- 选中一个 block 后，把它已经覆盖的流从候选池拿掉，下一轮寻找还没被解释的剩余模式。

## 踩过的坑

1. **把“可疑流”当成“恶意流”**：可疑池只是筛选结果，里面一定会混进正常流量，所以后面的 prevalence 和 blacklist 很关键。

2. **以为短签名总是更好**：短字节串更容易命中多种变体，但也更容易匹配正常 HTTP 头、尾部或常见路径。

3. **忽视 hit-list worm**：如果蠕虫不随机扫描，而是拿着提前准备好的受害者名单传播，端口扫描启发式就抓不到前置行为。

4. **只看单点监控**：单个边界网络早期可能碰不到足够 payload，分布式 monitor 互相通报扫描源，才能更早攒够样本。

## 适用 vs 不适用场景

**适用**：

- TCP 蠕虫、随机扫描传播、payload 有稳定公共片段的场景。
- IDS / 边界 DMZ 监控，需要自动产生 Bro、Snort 一类系统可消费的内容签名。
- 想研究“行为异常筛选”和“内容签名生成”如何组合的安全系统。
- 需要在应用协议未知时仍然做初步防御的场景。

**不适用**：

- hit-list worm、低速潜伏传播，或者没有明显失败连接的传播方式。
- payload 几乎完全变形、没有足够长公共字节串的强 polymorphic worm。
- 对误报零容忍且没有人工 vetting / blacklist 兜底的生产拦截。
- 加密流量占主体的现代协议环境；payload 看不到，内容签名就失去材料。

## 历史小故事（可跳过）

- **2001 年**：Code Red 爆发，互联网看到随机扫描蠕虫可以在短时间内打爆大量服务器。
- **2002 年**：研究者量化 Code Red 传播过程，证明早期干预比事后清理重要得多。
- **2003 年**：Honeycomb、EarlyBird 等系统开始尝试自动从可疑流量里生成内容签名。
- **2004 年**：Autograph 在 USENIX Security 提出“端口扫描筛选 + payload prevalence + 分布式 tattler”的系统化方案。
- **2005 年后**：TaintCheck 等工作把程序语义引入签名生成，弥补纯内容重复方法不懂漏洞机制的短板。

## 学到什么

- **安全自动化先要缩小搜索空间**：全流量直接做内容分析太贵，先用便宜启发式把候选池变小。
- **prevalence 是蠕虫的统计指纹**：自传播带来重复出现，重复出现又给了自动签名生成可利用的信号。
- **参数就是安全策略**：`s`、`w`、`m`、`a`、`θ` 不是调参细节，它们直接决定敏感性、特异性和检测时机。
- **分布式监控解决样本稀缺**：早期每个站点只看到一点点，多个站点共享扫描源能显著加快 payload 积累。

## 延伸阅读

- 原文 PDF：[Kim and Karp 2004 — Autograph](https://www.usenix.org/legacy/event/sec04/tech/full_papers/kim/kim.pdf)（重点看第 3 节系统设计和第 5 节分布式评估）
- 相关系统：Singh et al. EarlyBird（同样用内容 prevalence，但先找 packet 内容再过滤噪声）
- 相关系统：Kreibich and Crowcroft Honeycomb（用 honeypot 收集可疑流量，再找共同子串）
- [[newsome-taintcheck-2005]] —— 用动态污点分析补上“哪些字节真的参与利用”的语义证据。
- [[tcp]] —— Autograph 面向 TCP 流量，理解重组 flow payload 要先懂 TCP 字节流。

## 关联

- [[tcp]] —— Autograph 生成的是 TCP flow payload 内容签名，流重组是系统前提。
- [[newsome-taintcheck-2005]] —— TaintCheck 从程序执行语义生成签名，和 Autograph 的内容统计形成对照。
- [[rfc-3833-dns-threats]] —— 同样体现安全系统先画清威胁边界，再决定方案能防什么。
- [[pastry-2001]] —— tattler 假设可用应用层 multicast，论文引用 Scribe / Pastry 这类覆盖网络。
- [[tor-2004]] —— 同年 USENIX Security 的网络安全系统论文，可对比威胁模型和部署取舍。
- [[aflgo-2017]] —— 都是在安全场景里用启发式缩小搜索空间，只是一个找签名，一个找目标代码路径。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[newsome-taintcheck-2005]] —— TaintCheck — 给不可信输入贴追踪标签
