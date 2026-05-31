---
title: Stripe Rate Limiters — 工业级令牌桶长什么样
来源: Paul Tarjan, Stripe Engineering Blog, 2017（持续更新）
日期: 2026-05-31
分类: 后端工程
难度: 中级
---

## 是什么

Stripe（全球最大支付 API 之一）公开了他们生产环境怎么防止单个用户/客户端把 API 打爆。核心一句话：**不是装一个 token bucket 就完事，而是把 4 种限流器叠在一起用**。

日常类比：超市收银台。一个收银员（worker）能同时服务的人有上限——光看"每分钟来多少人"不够，还得看"有没有一个客人结账太慢卡住别人"，过载时还得"先服务付钱的，再服务问路的"。Stripe 的限流体系就是把这几件事拆开管。

这篇博客是 ADR5 选 token bucket 作为工业默认算法的最常被引用的实战参考。

## 为什么重要

不读这篇你会以为：
- "令牌桶" = 装个 nginx 的 `limit_req` 就行
- 限流就是"每秒 N 个请求"，跟其他系统设计没关系
- Redis 存请求计数器写写就完了

读完才知道：
- 教科书的 token bucket 在分布式环境**根本跑不起来**——多 worker 抢一个桶要原子操作
- "每秒 N 个" 只是入口，背后还要管**并发**（同时跑多少）+ **优先级**（过载先杀谁）
- 客户端 retry 实现错（无 jitter）会**自我加剧**故障，限流器变成放大器

## 核心要点

Stripe 在生产用 **4 类限流器叠加**，依次拦截不同形态的滥用：

1. **请求速率限流（token bucket）**：每用户 ~100 req/s，突发桶容量 = 平均速率 × 短时窗口。Redis + Lua 脚本原子执行，超限返 429。
2. **并发请求限流（concurrency limit）**：单个 user 同时在跑的请求数 ≤ N。防止"速率没超但每个请求很慢"的情况打满 worker 池。
3. **全局负载降级（fleet load shedder）**：按业务关键度分桶——核心支付 > dashboard 查询 > 文档页。整个 fleet 过载时从低优先级 reject。
4. **Worker 利用率降级**：单 worker CPU/内存吃紧时主动拒绝非关键请求，把容量留给正在进行的事务。

token bucket 在 Redis 里的工业实现关键：**不存事件队列**，只存 `(last_timestamp, balance)` 两个值，靠 GCRA（Generic Cell Rate Algorithm）变体在每次请求时按时间差**重算余额**。这样 1 亿用户也只占几百 MB Redis。

## 实践案例

### 案例 1：Redis + Lua 原子更新（伪代码）

```lua
-- KEYS[1] = "ratelimit:user:42"
-- ARGV[1] = now（毫秒）, ARGV[2] = rate（每秒 token 数）, ARGV[3] = burst
local last, balance = unpack(redis.call('HMGET', KEYS[1], 'last', 'balance'))
last = tonumber(last) or 0
balance = tonumber(balance) or ARGV[3]

-- 按时间差补 token
local elapsed = (ARGV[1] - last) / 1000
balance = math.min(ARGV[3], balance + elapsed * ARGV[2])

if balance < 1 then
  return 0  -- 拒绝，返 429
end
redis.call('HMSET', KEYS[1], 'last', ARGV[1], 'balance', balance - 1)
return 1  -- 放行
```

**关键**：整个脚本在 Redis 单线程里跑完，多 worker 并发拿同一个 key 不会撕裂。

### 案例 2：并发限流为什么是第二道防线

假设 user A 速率没超（80 req/s），但每个请求是 `charge.list?limit=10000` 要扫 10w 行 DB。50 个并发就把 worker 池占了。

token bucket 此时**完全无感**——速率合规。所以 Stripe 在 token bucket 之外再放一个 concurrency limiter（per-user 上限例如 20）：第 21 个请求进来就 reject。

### 案例 3：load shedder 的优先级表

```
Tier 1: charge / refund / payout       —— 真金白银，永远放行
Tier 2: customer / subscription read   —— 业务核心查询
Tier 3: dashboard / analytics          —— 内部使用，过载先扔
Tier 4: docs / marketing site          —— 静态内容，CDN 兜底
```

Fleet 过载时从 Tier 4 → Tier 1 逐级 reject 503。永远保支付能成功。

### 案例 4：客户端 retry 必须带 jitter

错的写法：

```python
for i in range(5):
    r = api_call()
    if r.status == 429:
        time.sleep(2 ** i)  # 1s, 2s, 4s, 8s, 16s
```

10 万客户端同时被限流后会**整齐踏步**回来——服务刚恢复又被同一波打挂。正确：

```python
time.sleep((2 ** i) + random.random() * (2 ** i))  # 加 jitter
```

Stripe 官方 SDK 默认带 jitter，不要自己重写。

## 踩过的坑

1. **没限流的 cron 事故**：Stripe 团队亲身经历——一个误配的 cron 每秒打几千次 list endpoint，整个 API P99 从 50ms 飙到 5s。从此所有内部脚本默认走限流通道。

2. **Redis 没用 Lua，用 GET/SET 两步**：并发下两次操作之间被插入，token 被多发或少发。必须 Lua 脚本或 `WATCH/MULTI/EXEC` 事务。

3. **限流 key 选错粒度**：用 IP 限流会误伤 NAT 后整个公司；用 user_id 限流又挡不住未登录探测。生产里通常**多维度 key 同时跑**：IP + user + API token。

4. **429 不带 Retry-After**：客户端不知道等多久，要么立刻重试（更糟）要么等几分钟（体验差）。Header 写清楚 `Retry-After: 2` 才是闭环。

5. **限流器自己挂了**：Redis 不可用时是 fail-open（全放）还是 fail-close（全拒）？Stripe 选 fail-open——限流是次要保护，主流程不能因它挂掉。

## 适用 vs 不适用场景

**适用**：
- 公网 API 防滥用（每天有人写脚本试用你的接口）
- 多租户 SaaS，user 之间需要资源隔离
- 推理服务（vllm）需要按 user 限并发，避免一个 user 打满 GPU 队列
- 内部服务之间也建议——一个 bug 调用方比外部攻击者更可能打挂你

**不适用**：
- 流量极小、可信度高的内网工具（杀鸡用牛刀）
- 强实时场景需要"毫秒级精确放行"（token bucket 是平均速率，会有 burst）
- 需要"按地理位置/账号等级"细分定价的场景——要走专门的 quota 系统而非限流器

## 历史小故事（可跳过）

- **1980s**：电信网络发明 leaky bucket / token bucket 控制 ATM 信元速率
- **1990s**：算法移植到 IP 网络，成为 QoS 工具栏标配（Cisco IOS 的 `policer`）
- **2000s**：互联网公司开始在应用层用——但都是单机内存版，分布式版各家自己造
- **2017**：Stripe 这篇博客把"分布式 token bucket + 4 层组合"的工业实践第一次完整公开，从此成为后端面试题标配
- **2020s**：AWS API Gateway / Cloudflare / Envoy 都内置类似设计，本地手写的越来越少

## 学到什么

1. **限流不是单个算法，是一套防御纵深**——速率 + 并发 + 优先级 + 利用率，4 层组合
2. **token bucket 的工业实现 ≠ 教科书版**——核心是 Redis Lua + GCRA 状态压缩，不存事件
3. **限流器自己要 fail-open**——它是保护层不是主路径，挂了不能拖死业务
4. **客户端 retry 是限流系统的一部分**——没有 jitter 的指数退避会把限流变成放大器
5. **过载时丢什么**比"丢不丢"更重要——load shedder 的优先级表是事故时的救命表

## 延伸阅读

- 原文：[Stripe Engineering — Scaling your API with rate limiters](https://stripe.com/blog/rate-limiters)
- GCRA 算法解析：[Brandur — Rate Limiting, Cells, and GCRA](https://brandur.org/rate-limiting)
- 实现参考：[redis-cell（Redis 模块版 GCRA）](https://github.com/brandur/redis-cell)
- 算法对比：[[token-bucket-vs-leaky-bucket]] —— 两种经典限流算法的差别
- 配套理论：[[adr5-rate-limiting]] —— 我自己的 ADR5 决策记录

## 关联

- [[redis]] —— Stripe 限流的存储引擎，Lua 脚本原子性是核心依赖
- [[envoy]] —— 现代 service mesh 的限流 filter 也是这套思路
- [[circuit-breaker]] —— 限流的兄弟模式，专管"下游挂了别再打"
- [[graceful-degradation]] —— load shedder 是降级策略的具体落地
- [[backpressure]] —— 并发限流本质上是给上游施加反压

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
