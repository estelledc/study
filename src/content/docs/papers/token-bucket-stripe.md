---
title: Stripe Rate Limiters — 工业级令牌桶长什么样
来源: Paul Tarjan, Stripe Engineering Blog, 2017（持续更新）
日期: 2026-05-31
分类: 后端工程
难度: 中级
---

## 是什么

Stripe（全球最大支付 API 之一）公开了他们生产环境怎么防止单个用户/客户端把 API 打爆。核心一句话：**不是装一个 token bucket 就完事，而是把 4 种限流器叠在一起用**。

日常类比：超市收银台。一个收银员（worker，处理请求的进程）能同时服务的人有上限——光看"每分钟来多少人"不够，还得看"有没有一个客人结账太慢卡住别人"，过载时还得"先服务付钱的，再服务问路的"。Stripe 的限流体系就是把这几件事拆开管。

这篇博客是后端选型里常被引用的实战参考（本仓库 [[adr5-rate-limiting]] 也据此把 token bucket 定为默认算法）。

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

1. **请求速率限流（token bucket）**：每用户 N req/s（按流量调），突发桶容量 = 平均速率 × 短时窗口。类比：发号机每秒补 N 张票。用 Redis + Lua（在 Redis 里一次跑完的小脚本）原子执行，超限返 429。
2. **并发请求限流**：单个 user 同时在跑的请求数 ≤ N。类比：收银台同时服务人数上限。防止"速率没超但每个请求很慢"打满 worker 池。
3. **全局负载降级（fleet load shedder）**：按关键度分桶——创建 charges 等关键写 > 列表查询。整个 fleet 过载时从低优先级 reject。类比：火警时先保收银台。
4. **Worker 利用率降级**：单机吃紧时按 critical → POST → GET → test mode 逐级 shed。类比：收银员忙不过来先停试吃活动。

token bucket 工业实现关键：**不存事件队列**，只存 `(last_timestamp, balance)`，每次请求按时间差**重算余额**。1 亿用户也只占几百 MB Redis。（GCRA 等变体见延伸阅读，原文用的是 token bucket。）

## 实践案例

### 案例 1：Redis + Lua 原子更新（伪代码）

```lua
-- KEYS[1] = "ratelimit:user:42"
-- ARGV[1]=now(ms), ARGV[2]=rate, ARGV[3]=burst
local last, balance = unpack(redis.call('HMGET', KEYS[1], 'last', 'balance'))
local rate = tonumber(ARGV[2])
local burst = tonumber(ARGV[3])
last = tonumber(last) or 0
balance = tonumber(balance) or burst
local elapsed = (tonumber(ARGV[1]) - last) / 1000
balance = math.min(burst, balance + elapsed * rate)
if balance < 1 then return 0 end
redis.call('HMSET', KEYS[1], 'last', ARGV[1], 'balance', balance - 1)
return 1
```

**逐部分解释**：
- `tonumber`：把 Redis 传来的字符串变成数字，否则算术会炸
- `elapsed * rate`：按过去多久补多少 token，再 `math.min` 封顶到 burst
- 整段在 Redis 单线程跑完，多 worker 抢同一 key 不会撕裂

### 案例 2：并发限流为什么是第二道防线

1. user A 速率合规（例如 80 req/s < N）
2. 每个请求是重查询，50 个并发占满 worker 池
3. token bucket **无感**——所以再放 concurrency limiter（如上限 20），第 21 个直接 reject

### 案例 3：worker load shedder 的优先级（原文四档）

```
critical methods（创建 charges 等）—— 真金白银，尽量放行
POSTs                              —— 写操作次之
GETs                               —— 读操作，过载可先扔
test mode traffic                  —— 测试流量，最先 shed
```

Fleet 级 shedder 更粗：只分 critical vs non-critical，并预留一部分容量给关键请求。过载时返 503，保支付。

### 案例 4：客户端 retry 必须带 jitter

错：`sleep(2 ** i)`——十万客户端整齐踏步回来。对：full jitter，在 `[0, 2^i]` 随机：

```python
time.sleep(random.random() * (2 ** i))
```

Stripe 官方 SDK 默认带 jitter，不要自己重写。

## 踩过的坑

1. **没限流的 cron 事故**：误配 cron 每秒打几千次 list，P99 从 50ms 飙到 5s——内部脚本也要走限流。
2. **Redis 用 GET/SET 两步**：中间被插入会多发/少发 token——必须 Lua 或事务。
3. **限流 key 粒度错**：纯 IP 误伤 NAT 公司；纯 user_id 挡不住未登录探测——生产常 IP + user + API token 多维并行。
4. **429 不带 Retry-After**：客户端乱重试或干等——写清 `Retry-After: 2`。
5. **限流器自己挂了**：Stripe 选 fail-open——限流是次要保护，主流程不能因 Redis 挂掉。

## 适用 vs 不适用场景

**适用**：
- 公网 API 防滥用（日均有脚本扫接口）
- 多租户 SaaS，user 之间要资源隔离
- 推理服务按 user 限并发，避免一人打满 GPU 队列
- 内部服务也建议——bug 调用方往往比外部攻击更狠

**不适用**：
- 日均 QPS < 10、可信度高的内网工具（杀鸡用牛刀）
- 需要"毫秒级精确放行"——token bucket 是平均速率，允许 burst ≈ rate × window
- 按地域/账号等级细分定价——应走专门 quota，而非限流器

## 历史小故事（可跳过）

- **1980s**：电信网络发明 leaky bucket / token bucket 控制 ATM 信元速率
- **1990s**：算法移植到 IP 网络，成为 QoS 工具栏标配（Cisco IOS 的 `policer`）
- **2000s**：互联网公司开始在应用层用——多为单机内存版，分布式各家自造
- **2017**：Stripe 博客把"分布式 token bucket + 4 层组合"完整公开，成后端面试标配
- **2020s**：AWS API Gateway / Cloudflare / Envoy 都内置类似设计，本地手写越来越少

## 学到什么

1. **限流是防御纵深**——速率 + 并发 + 优先级 + 利用率，4 层组合
2. **工业 token bucket ≠ 教科书**——核心是 Redis Lua + 压缩状态，不存事件
3. **限流器要 fail-open**——保护层不是主路径，挂了不能拖死业务
4. **客户端 retry 也是系统一部分**——无 jitter 的退避会把限流变成放大器
5. **过载时丢什么**比"丢不丢"更重要——优先级表是事故时的救命表

## 延伸阅读

- 原文：[Stripe Engineering — Scaling your API with rate limiters](https://stripe.com/blog/rate-limiters)
- GCRA 算法解析：[Brandur — Rate Limiting, Cells, and GCRA](https://brandur.org/rate-limiting)
- 实现参考：[redis-cell（Redis 模块版 GCRA）](https://github.com/brandur/redis-cell)
- 算法对比：[[token-bucket-vs-leaky-bucket]] —— 两种经典限流算法的差别
- 配套理论：[[adr5-rate-limiting]] —— 本仓库 ADR5 决策记录

## 关联

- [[redis]] —— Stripe 限流的存储引擎，Lua 脚本原子性是核心依赖
- [[envoy]] —— 现代 service mesh 的限流 filter 也是这套思路
- [[circuit-breaker]] —— 限流的兄弟模式，专管"下游挂了别再打"
- [[graceful-degradation]] —— load shedder 是降级策略的具体落地
- [[backpressure]] —— 并发限流本质上是给上游施加反压

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[envoy]] —— Envoy — 把网络通信从业务代码里抠出来的代理进程
- [[jwt-rfc-7519]] —— JWT RFC 7519 — 把身份证装进一段可校验的字符串
- [[redis]] —— Redis — 内存键值数据库
