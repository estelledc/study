---
title: Anthropic Prompt Caching — 让长 prompt 只算一次，后续只付 10%
来源: Anthropic Docs, "Prompt caching", https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
日期: 2026-05-31
分类: AI 工程
难度: 入门
---

## 是什么

Prompt caching 是 Anthropic 的一项 API 特性：**把一段 prompt 标记成"可缓存"，下次请求只要前缀一字不差地相同，模型就直接复用，不重新计算**。日常类比：每天去咖啡店点同一杯咖啡，店员把你的常用配方记在小本子上，下次只问"还是老样子？"就行——不用重新听你念一遍配方。

具体做法：在请求里给某个内容块加 `"cache_control": {"type": "ephemeral"}`，从请求开头到这个块（含）就是被缓存的范围。

```python
client.messages.create(
    model="claude-sonnet-4",
    system=[
        {"type": "text", "text": "<很长的系统 prompt>",
         "cache_control": {"type": "ephemeral"}},
    ],
    messages=[{"role": "user", "content": "今天的问题..."}],
)
```

## 为什么重要

不理解 prompt caching，下面这些事都没法解释：

- 为什么 agent 把一长串系统 prompt + 工具定义塞进去，**第二次请求账单只有第一次的零头**
- 为什么"在 system 里塞整本文档"突然变成了一个划算的 RAG 替代方案
- 为什么 Claude Code 这种长上下文应用敢让你"持续对话"——它在背后悄悄复用缓存

一句话：**prompt caching 把"长 prompt 重复成本"从 1× 砍到 0.1×**，整个 LLM 应用的成本结构都会被它改写。

## 核心要点

记住四组数字（**ADR-4 全章铁律**）：

1. **4 个断点上限**：一个请求最多 4 个 `cache_control` 节点。超过会被忽略最早的——这意味着你必须想清楚"哪 4 个边界最值得"。
2. **1.25× 写入**：第一次缓存（cache miss）按基础输入价的 1.25 倍计费——多付 25% 换"以后便宜"。
3. **0.1× 读取**：命中（cache hit）只按基础价的 10% 计费——便宜 90%。
4. **5 分钟 TTL**（默认）：5 分钟内没人再请求就过期；命中会续期（sliding window）。想要更久？加 beta header `extended-cache-ttl-2025-04-11` 用 1 小时 TTL，但写入费翻到 2×。

最低门槛：**Opus / Sonnet 至少 1024 token**，**Haiku 至少 2048 token**，短于此不会真的缓存。

可缓存的块：system prompt / 工具定义 / messages / 图片 / tool_use 结果。

**前缀语义**：缓存是"从开头到带 cache_control 的块"这一整段的 hash。命中条件是**前缀完全一样**——多一个空格都算 miss。所以断点位置 = 你为这段前缀"立了一个存档点"。

**4 个断点怎么用**：典型摆法是 tools 末尾 1 个 + system 末尾 1 个 + messages 中段 1~2 个。前 3 个标记"几乎不变"的层，最后 1 个标记"对话历史"这种慢变层。

## 实践案例

### 案例 1：Agent 的标准摆法

Agent 通常有一长段固定指令 + 一堆工具 + 用户的当前问题。命中率最高的摆法：

```python
system=[{"type": "text", "text": SYSTEM_PROMPT,
         "cache_control": {"type": "ephemeral"}}]
tools=[..., {"name": "...", ..., "cache_control": {"type": "ephemeral"}}]
messages=[{"role": "user", "content": user_question}]
```

**前面静态、后面动态**。每次只改 `user_question`，前缀不变，缓存命中。

### 案例 2：算笔账

假设 system + tools 一共 20000 token，用户问题 200 token。基础输入价记为 P。

- 第一次请求：写入 20000 × 1.25 × P + 200 × P ≈ **25200 P**
- 第二次请求（5 分钟内）：读取 20000 × 0.1 × P + 200 × P ≈ **2200 P**

第二次起便宜 **88%**。如果一天调 100 次，缓存能让账单降到不缓存的 **~13%**。

### 案例 3：踩坑——前缀变了一个字符

```python
SYSTEM_PROMPT = f"今天是 {date.today()}\n你是一个助手..."
```

**坏。** 每天日期变，前缀就变了，缓存永远 miss。改成：

```python
SYSTEM_PROMPT = "你是一个助手..."
messages = [{"role": "user", "content": f"今天是 {date.today()}\n{question}"}]
```

把时间戳挪到动态部分。前缀稳了，命中才能拿到。

### 案例 4：怎么读响应字段判断有没有命中

API 响应的 `usage` 里有三个字段：

```json
{
  "usage": {
    "input_tokens": 200,
    "cache_creation_input_tokens": 0,
    "cache_read_input_tokens": 20000
  }
}
```

- `cache_read_input_tokens` 大 = 命中（按 0.1× 收费）
- `cache_creation_input_tokens` 大 = miss + 写入（按 1.25× 收费）
- 两个都为 0 = 没用缓存（纯按 1× 收费）

**调试 prompt 缓存的唯一靠谱办法就是看这三个数。**

## 踩过的坑

1. **改一个字符前缀就失效**：cache miss 还要付 1.25× 写入费——比不缓存还贵。每次升级 prompt 前都要算一下："这次改动值不值整批用户重写一次缓存？"
2. **断点放在动态内容后面**：把 `cache_control` 加在用户问题块上，等于把动态内容也塞进缓存——命中率永远 0。**断点只能放在静态/动态边界**。
3. **不到最低 token 数**：Sonnet 下放 800 token 加 cache_control，API 不报错也不真缓存——你以为命中了，其实每次都是新算。日志看 `cache_creation_input_tokens` 和 `cache_read_input_tokens` 两个字段确认。
4. **5 分钟静默就死**：晚上没人用，第二天早上第一个请求是 cache miss + 1.25× 写入。流量稀疏的应用要么用 1h TTL（更贵），要么定时 ping 续期。
5. **多个用户共用同一个缓存？**：缓存按 organization 隔离，但只要前缀一字不差，所有用户共享同一份——这是好事（命中率高），也意味着**敏感数据别乱放**。

## 适用 vs 不适用场景

**适用**：

- Agent / Claude Code / 长系统 prompt + 工具定义
- RAG 把固定文档塞 system 反复问
- Few-shot：长例子段落整段缓存
- 多轮对话：历史挂在固定断点

**不适用**：

- 每次 prompt 都不一样（如批量翻译不同句子）→ 缓存不会命中，反而每次多付 25%
- 内容短于最低 token 数 → 标了也白标
- 流量极稀疏 + 接受不了 1h TTL 的写入翻倍 → 直接不缓存更划算

## 学到什么

1. **缓存的钱不是凭空省的**：写入贵 25%，读取省 90%——只有命中率足够高才赚。**经验阈值：> 2 次复用就回本**。
2. **断点是"静态/动态边界"的标记**：放对位置才有意义，不是越多越好。把 4 个断点想成 4 个"存档点"，每多一个 = 多一道前缀。
3. **API 厂商在用经济杠杆引导你写正确的 prompt**：把不变的放前面、变的放后面——这本来就是好工程。Anthropic 用价格让你不得不照做。
4. **看可观测字段**：`cache_creation_input_tokens` / `cache_read_input_tokens` / `input_tokens` 三件套是判断缓存有没有真用的唯一办法。任何 prompt 改动后第一件事是看这三个字段——光看响应没用。
5. **TTL 选 5m 还是 1h 是流量稀疏度的函数**：QPS > 1（5 分钟内必有下次请求）选 5m；流量稀疏选 1h 但要算账——1h 的写入贵 2×，得复用更多次才回本。

## 延伸阅读

- 官方文档：[Prompt caching - Anthropic Docs](https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching)
- 官方 cookbook：[Anthropic Cookbook - Prompt Caching](https://github.com/anthropics/anthropic-cookbook)
- [[claude-api]] —— 整个 Anthropic SDK 的入口，prompt caching 是其中一块
- [[attention]] —— 模型为什么有"前缀计算可复用"这种结构性可能（KV-cache 是底层）

## 关联

- [[attention]] —— Transformer 的 KV-cache 是 prompt caching 在底层硬件上能成立的根因
- [[claude-api]] —— SDK 用法层面 cache_control 怎么传
- [[anthropic-circuits]] —— 同一家公司的另一类研究（机制可解释性），但与 caching 无关，只是同源

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[mcp-spec]] —— MCP — 让一个 LLM 客户端能插任何外部能力的 USB 协议
