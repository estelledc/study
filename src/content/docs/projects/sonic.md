---
title: Sonic — 极简前缀搜索引擎
来源: https://github.com/valeriansaliou/sonic
日期: 2026-06-01
分类: 数据库 / 搜索
难度: 中级
---

## 是什么

Sonic 是法国 Crisp 公司的工程师 Valerian Saliou 用 **Rust** 写的"超轻量"搜索后端。一句话：**几十 MB 内存就能搜几十万条文档**。

日常类比：

- [[elasticsearch]] 像超市大型货架——什么都摆得下，但要租大仓库
- [[meilisearch]] 像便利店——挑着摆，但门店还是得几百平
- Sonic 像随身书包——只能装少量东西，但装得下、走得动、扔哪都能跑

定位关键词：**schema-less / 前缀搜索 / 自动补全 / 几 MB 级内存占用**。

不是给"全公司日志检索"准备的，是给"客服聊天搜索 / 应用内搜联系人 / IoT 本地索引"准备的。

## 为什么重要

不理解 Sonic 的设计取舍，下面这些事会困惑：

1. **极致轻量**：起步 5 MB 堆内存，百万条目也就几十 MB——给小 SaaS 和嵌入式一个新选项
2. **FST 工程化典范**：BurntSushi 的 `fst` crate 在工业搜索里怎么用，读 Sonic 一遍就懂
3. **写慢读快的极端例子**：consolidation 机制把"FST 不可变"的代价摊到后台，前台读起来飞快
4. **轻量服务端组件三件套**：Rust + 自定义文本协议 + 嵌入式 KV 是这个时代很多基础组件的标配

## 核心要点

Sonic 的"为什么这么省内存"可以拆成 **三件事**：

### 1. FST 自动机做词典

所有索引过的词被压进一个**有限状态转换器**（FST，Finite State Transducer）。可以理解成把字典里所有词共享前缀和后缀都合并的一棵图。

类比：日常的 trie 是"词共享前缀"，FST 是"词共享前缀 + 共享后缀"。比如 `running` / `runner` / `run` 共享 `run`，`running` / `singing` 共享 `ing` 后缀。结果是**几十万词压成几 MB**。

FST 还自带一个能力：**Levenshtein 自动机**——查"和某词差 1 个编辑距离的所有词"是 O(查询长度)，于是拼写容错和模糊搜索几乎免费。

### 2. RocksDB 存"词到文档"的映射

FST 只存"哪些词存在"，真正的**倒排索引**（词 → 文档 ID 列表）放在 RocksDB 里。两层分工：

- FST = 词典查找层（in-memory、超紧凑、不可变）
- RocksDB = 文档关联层（持久化、可写、嵌入式 KV）

读流程：用户搜 `mat`，先在 FST 里找前缀匹配的所有词（`matrix` / `material` / ...），然后去 RocksDB 拿这些词对应的文档 ID 集合，合并返回。

### 3. consolidation：用"重建"换"不可变"

FST 不可变意味着新加一个词必须**重建整个 FST**。Sonic 的解决方案：

- 新 push 的词先落在内存里的 **pending**（未 consolidate 前不进主 FST 文件）
- 定时（默认 **180 秒**）触发 **consolidation**——把 pending 合并进主 FST，整图重建落盘
- 查询可同时看「主 FST + pending」；重建吃 CPU，大图时前台会感觉卡顿

这就是 Sonic"写慢读快"的根因——写不是立即可见，但读主要是 O(查询长度) 的 FST 查找。

## 实践案例

### 案例 1：起服务 + push 文档

```bash
# 用官方 Docker 镜像，配一份 config.cfg
docker run -p 1491:1491 valeriansaliou/sonic:v1.4.0
```

通过 Sonic Channel 协议（telnet 友好的文本协议）push 文档：

```
> START ingest SecretPassword
< CONNECTED <sonic-server v1.4.0>
> PUSH messages user-1 conv-42 "hello, can you help with my order"
< OK
```

三层命名空间：`messages`（collection）/ `user-1`（bucket）/ `conv-42`（object ID）。文档内容是最后那串字符串，引擎自己分词、入索引。

### 案例 2：search 和 suggest

```
> START search SecretPassword
< CONNECTED
> QUERY messages user-1 "help orde"
< EVENT QUERY xxx conv-42
> SUGGEST messages user-1 "hel"
< EVENT SUGGEST xxx hello help helper
```

`QUERY` 是全文搜索（命中文档 ID），`SUGGEST` 是前缀补全（命中词）。两者都走 FST，但出口不同：QUERY 再去 RocksDB 取文档 ID，SUGGEST 直接返回 FST 里的匹配词。

### 案例 3：等 consolidate 才搜得到

1. PUSH 一条新词后立刻 QUERY → 常搜不到（还在 pending）。
2. 控制通道发 `TRIGGER consolidate`（或等默认 180 秒）→ pending 并进主 FST。
3. 再 QUERY → 命中。`consolidate_after` 调短=更及时但更费 CPU；冷数据可调长。

```ini
# config.cfg 片段（官方默认）
[store.fst.pool]
inactive_after = 300
[store.fst.graph]
consolidate_after = 180
```

## 踩过的坑

1. **写入不是立刻可见**：默认 **180 秒**才 consolidate。PUSH 完立刻 QUERY 可能空；调短 `consolidate_after` 或 `TRIGGER consolidate`。
2. **不支持 BM25 等相关性评分**：返回顺序近乎 FST 遍历，不是相关度；要排序得自己后处理。
3. **中文需要预分词**：自带 tokenizer 走 rust-stemmers，对中文基本无效；客户端先分词或改源码接 jieba。
4. **schema-less 的代价**：不能"只搜 title"，只能在 collection / bucket 层切；更细就拆 collection。
5. **consolidation 吃 CPU**：大图重建可能卡几秒，不是无限 STW，但生产要盯延迟尖峰。

## 适用 vs 不适用场景

**适用**：

- 客服聊天 / 站内消息搜索（作者本职场景就是 Crisp 客服系统）
- 中小博客 / 文档站搜索（< 10 万条目，预算 < 64 MB 内存）
- 自动补全场景（IDE / 搜索框前缀建议）
- IoT 设备本地索引（内存极紧）

**不适用**：

- 需要复杂相关性排序 / facet / 聚合 → 用 [[meilisearch]] 或 [[elasticsearch]]
- 中文为主的全文搜索（不预分词不可用）
- 写入要求秒级可见 → 改 [[meilisearch]]
- 需要 SQL 风格条件过滤 → 任意一个都比 Sonic 合适

## 历史小故事（可跳过）

- **2019 年**：Crisp 工程师 Valerian Saliou 开源 Sonic，定位「几 MB 内存的 ES 替代」，服务客服聊天搜索。
- **同一时期**：站在 BurntSushi `fst` crate 与 RocksDB 上，用自定义 Sonic Channel 文本协议做 ingest / search / control。
- **之后**：功能刻意不加 BM25 / facet；社区把它当「前缀补全 + 轻量全文」组件，而不是通用搜索中台。

## 学到什么

1. **"功能少换资源省"是合理取舍**——不是所有场景都需要 ES 全功能
2. **FST 是轻量词典/前缀/模糊查找的利器**，压缩率极高
3. **不可变结构 + 后台重建** 适合读多写少（思路近 [[lsm-tree]]）
4. **自定义文本协议** 仍有市场：telnet 可调、解析便宜、客户端简单
5. **Rust + 嵌入式 KV + 内存自动机** 是当代轻量基础组件常见组合

## 延伸阅读

- 仓库：[valeriansaliou/sonic](https://github.com/valeriansaliou/sonic)
- 作者发布博客：[Announcing Sonic — A super light alternative to Elasticsearch](https://journal.valeriansaliou.name/announcing-sonic-a-super-light-alternative-to-elasticsearch/)
- FST crate：[BurntSushi/fst](https://github.com/BurntSushi/fst)（读完这个再读 Sonic 几乎无门槛）
- Sonic Channel 协议规范：仓库 `protocol.md`
- BurntSushi 关于 FST 的长文：[Index 1,600,000,000 Keys with Automata and Rust](https://blog.burntsushi.net/transducers/)（教科书级）

## 关联

- [[meilisearch]] —— 同样 Rust 写、定位"开发者友好搜索"，但功能更全代价是内存大几倍
- [[elasticsearch]] —— 工业级全功能搜索，Sonic 是其轻量替代
- [[the-silver-searcher]] —— 命令行版的"轻量搜索"，思路一脉相承
- [[minisearch]] —— JS 实现的迷你前缀搜索库，思路同样是 FST 的弱化版
- [[opensearch]] —— ES fork，重量级全文搜索

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[essentia]] —— Essentia — 音乐信息检索的 C++/Python 工具箱
