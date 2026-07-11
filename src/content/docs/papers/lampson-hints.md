---
title: Lampson Hints — 把做系统的隐式品味写成 27 条经验法则
来源: 'Butler W. Lampson, "Hints for Computer System Design", ACM SIGOPS Operating Systems Review 17(5): 33-48, October 1983 (SOSP keynote)'
日期: 2026-05-30
分类: 系统设计
难度: 中级
---

## 是什么

Lampson Hints 是 1983 年 Butler Lampson 在 SOSP 主题演讲里给出的 **27 条系统设计经验法则**。日常类比：像一位老师傅把 10 年带徒弟时反复说的口诀写下来——不是公式，是"踩过坑才知道该这样做"的小段建议。

Lampson 把 27 条按"想优化什么属性"分成三大类：

- **functionality**（做什么 / 不做什么）——比如 KISS、不要泛化、把决定权留给客户
- **performance**（做得多快）——比如缓存、批处理、后台计算、过载时主动拒绝
- **correctness**（做对没有）——比如端到端原则、动作要原子或可重启、名字要指对象不指路径

Lampson 自己在论文第一段就写："These are not theorems, they are heuristics."——这些**不是定理**，是有反例的启发式。

## 为什么重要

不理解 Lampson hints，下面这些事都没法解释：

- 为什么 K8s 文档里反复说 "names refer to objects"——这是 hint 6.4，1983 年就写下来了
- 为什么 HTTP PUT 和 DELETE 设计成可以安全重试，POST 却不能——hint 6.3 atomic-or-restartable
- 为什么资深架构师看到 "通用业务服务" 就皱眉——hint 4.2 不要预先泛化
- 为什么 1983 年的 16 页论文 40 年后还在被 Russ Cox / K8s SIG / etcd 文档引用

## 核心要点

Lampson 把 27 条 hints 按 **三大决策维度** 组织：

1. **functionality 维度**（设计阶段决定"做什么"）：先做最小可用版本再扩展（KISS）；不要为想象中的需求预先泛化；把策略和机制分开，机制内置、策略让客户决定。

2. **performance 维度**（运行阶段决定"做得多快"）：能缓存就缓存，但要管好失效协议（caching is king）；硬件每年加速 60%，简单的 brute force 常比花哨算法划算；能后台跑就别阻塞前台；批处理摊薄固定开销；过载时主动 shed load 比硬扛崩溃强。

3. **correctness 维度**（失败时决定"还对不对"）：能在端点做的事别塞进中间层（end-to-end）；动作要么原子要么幂等可重启；错误要么在能恢复的层处理要么直接 panic，最坏是中间层吞掉；名字要指稳定对象，不要指访问路径。

三大类不是互斥的——shed load 既是 performance 也是 correctness。Lampson 的分类是"主导动机"，不是分类学。

## 实践案例

### 案例 1：写 Kubernetes operator 时套 KISS

刚开始写 controller 的人很容易一上来就设计 finalizer + GC + leader election + 多 worker 池。这就是 Lampson 警告的 "second system effect"。

```go
// ❌ 错：第一版 reconciler 就预设所有可能的扩展点
func (r *MyReconciler) Reconcile(ctx context.Context, req Request) (Result, error) {
    if err := r.handleFinalizer(ctx, req); err != nil { return Result{}, err }
    if err := r.acquireLeaderLock(ctx); err != nil { return Result{}, err }
    // ... 还没写主逻辑
}

// ✅ 对：先做 happy path，跑起来再加
func (r *MyReconciler) Reconcile(ctx context.Context, req Request) (Result, error) {
    obj := &MyCRD{}
    if err := r.Get(ctx, req.NamespacedName, obj); err != nil {
        return Result{}, client.IgnoreNotFound(err)
    }
    return r.ensureDesiredState(ctx, obj)
}
```

KISS 的精髓是**先让最简单的版本工作**，需求暴露后再加功能。

### 案例 2：etcd 的 watchable store 是 caching + invalidation 的工业落地

etcd 的 watcher 池把 hint 5.1（caching）和 hint 5.3（background compute）一起用上：

```go
// 简化版：etcd watchableStore 的核心结构
type watchableStore struct {
    synced   watcherGroup  // 已追上当前 rev 的 watcher
    unsynced watcherGroup  // 落后于当前 rev、后台慢慢追的 watcher
}
```

`synced` 是缓存当前事件的池，`unsynced` 是后台异步追赶的池。当 rev 推进时按需把 watcher 在两个池之间挪——这就是 invalidation 协议。前台 read/write 完全不阻塞 compaction，那是 hint 5.3 的实例。

### 案例 3：HTTP 设计里的 atomic-or-restartable

Lampson hint 6.3 说动作要么原子（all-or-nothing）要么幂等可重启。HTTP 标准把这条直接编进了方法语义：

```http
PUT /users/42  Content-Type: application/json
{"name": "Ada"}
```

PUT 是 idempotent——重复发 5 次，最终状态和发 1 次一样。客户端在网络抖动时可以安全 retry。

```http
POST /orders  Content-Type: application/json
{"item": "book", "qty": 1}
```

POST 不 idempotent——重复发 5 次会创建 5 个订单。所以 Stripe / Shopify 的 API 都要求 POST 带 `Idempotency-Key` 头，由服务端用 key 去重。这就是把"原子或幂等"塞回 POST 的工程修补。

## 踩过的坑

1. **把 hints 当定理**：Lampson 自己警告过——KISS（4.1）和 plan-for-change（6.5）会冲突，caching（5.1）和 brute force（5.2）也会冲突。junior 工程师没有判断品味，容易用一条 hint 否定另一条。正确做法：每条 hint 都先问"它的反例是什么"。

2. **把 KISS 当 '不写抽象'**：结果代码一坨 if/else 没有结构。Lampson 的 KISS 不是"不要分层"，是"不要为想象中的需求预先分层"——区别在你**已经看到的重复** vs **怕将来会重复**。

3. **caching 不管 invalidation**：把任何贵的结果都缓存，但不写失效协议——结果用户看到 5 分钟前的旧数据。Lampson 论文 §3.1 直接列出 caching 三大坑：invalidation / capacity / coherence。任何 caching 设计都要先写清这三条。

4. **leave-to-client 极端化**：什么都让客户决定就成了"无设计"。Lampson 原话："The hard part is knowing **which** decisions to leave." 一般经验：**机制留在框架，策略让客户填**——比如 Linux VFS 留 inode_operations 接口（机制），ext4/xfs 各自决定怎么实现（策略）。

## 适用 vs 不适用场景

**适用**：
- 单机 / 局部系统设计的 mental model（OS 内核、数据库引擎、编译器、Web 框架）
- 给团队建立"设计决策共同语言"——code review 时能直接说"这违反了 hint 4.2"
- 资深工程师做架构 trade-off 时的助记符
- 教学：让新人通过反例学习"为什么这个设计是错的"

**不适用**：
- 分布式一致性 / 共识——Lampson 没覆盖 Paxos / Raft 类问题，要补 [[lamport-1978]]、Paxos 系列
- 安全 / 威胁模型——除了 6.1 end-to-end 几乎没讲，要看 Saltzer-Schroeder 1975
- 测试策略——hints 完全没提 testing，要补 [[beck-tdd]]
- 项目管理 / 团队协作——这是 Brooks《人月神话》的领域，Lampson 是系统设计层

## 历史小故事（可跳过）

- **1972 年**：Lampson 加入 Xerox PARC CSL，参与 Alto 个人计算机 / Bravo 文字处理 / Ethernet / Pilot OS 的设计。
- **1977 年**：Pilot OS 上线，6 种"打开模式"配置组合 → 3 年里只用了 2 种 → 剩下 4 种是 bug 农场。这成了 Lampson hint 4.2 "不要泛化"的活教材。
- **1983 年 6 月**：Xerox CSL-83-7 预印本流出。
- **1983 年 10 月**：SOSP keynote 正式宣讲，发表在 ACM SIGOPS OSR 17(5)，pp. 33-48，共 16 页 27 条 hints。
- **1992 年**：Lampson 获图灵奖（Personal Distributed Computing 领域奠基贡献）。

之后 40 年，Bentley《Programming Pearls》延续了"hints 列表 + 反例"的写作形式；Hennessy-Patterson 把多条 hints 量化进《Computer Architecture》；Russ Cox 在 Go modules 设计文档明确引用 "leave it to the client"；K8s API conventions 引用 hint 6.4 "names refer to objects, not paths"。

## 学到什么

1. **设计经验可以显式传承**——Lampson 证明了"做系统的品味"不必只能靠师徒口传，写下来配上反例就能跨代传播。
2. **hints 不是定理，是启发式**——记得每条 hint 都有反例和边界，judgement 是看到反例后还能决定该不该用。
3. **三大决策维度可以套用**——遇到设计选择时按 functionality / performance / correctness 分别问一遍，比"凭感觉"系统得多。
4. **机制 vs 策略分离是接口设计的根**——Linux VFS / Go io.Reader / K8s CRD 都是这条 hint 的现代实现。

## 延伸阅读

- 论文 PDF：[Lampson 1983 — Hints for Computer System Design](https://www.bradrun.com/papers/hints.pdf)（16 页，原文极易读，强烈推荐通读）
- Saltzer, Reed, Clark — End-to-End Arguments in System Design（TOCS 1984）：Lampson hint 6.1 的源头
- Bentley — Programming Pearls（1986）：算法版的 Lampson hints
- Russ Cox — Go Modules Reference（golang.org/ref/mod）：continuity hint 在工具链层落地
- [[gray-1981-transaction]] —— atomic-or-restartable hint 的事务版完整哲学
- [[knuth-taocp]] —— 早期算法智慧的代表，hints 风格的另一种形态

## 关联

- [[gray-1981-transaction]] —— Lampson hint 6.3 atomic-or-restartable 的事务理论展开
- [[tcp]] —— end-to-end argument（hint 6.1）在传输层的标志性应用
- [[kubernetes]] —— names-refer-to-objects（hint 6.4）+ 声明式 API 的现代代表
- [[etcd]] —— watchable store 是 caching + background compute 两条 hints 的合奏
- [[hoare-logic]] —— 与 Lampson 同代，但走形式化路线，正好和 hints 的"经验路线"互补
- [[beck-tdd]] —— 补上 Lampson 没讲的测试策略
- [[programmer-interruption]] —— 软件工程经验 + 认知科学经验合读

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[distserve]] —— DistServe — 把 prefill 和 decode 拆到不同 GPU 上跑
- [[eros-1999]] —— EROS — 让 capability 内核跑得跟 Linux 一样快
- [[great-swe]] —— Great SWE — 资深工程师"伟大"的标准是 humble + always learning
- [[hydra-1974]] —— HYDRA — 用 capability 把整个内核重做成对象 + 票据
- [[lampson-hints-1983]] —— Lampson Hints 1983 — 系统设计思维起点
- [[multics-1965]] —— MULTICS 1965 — 把计算机做成像电力一样的公共服务
- [[papers/vllm]] —— vLLM — 把操作系统的分页搬进 GPU KV cache
