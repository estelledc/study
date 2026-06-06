---
title: Sonic — 极简前缀搜索引擎
来源: https://github.com/valeriansaliou/sonic
日期: 2026-06-01
子分类: 存储与查询
分类: 数据库
难度: 中级
provenance: pipeline-v3
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

- 新 push 进来的数据先写到一个 **pending buffer**（也是 RocksDB）
- 定时（默认 60 秒）触发一次 **consolidation**——把 pending 里的词合并进主 FST，重建一份
- 重建期间查询走"主 FST + pending"两份，合并结果

这就是 Sonic"写慢读快"的根因——写不是立即可见，但读永远是 O(查询长度) 的 FST 查找。

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

### 案例 3：consolidation 时机

```bash
# 默认配置（config.cfg）
[store]
[store.kv]
path = "./data/store/kv/"
[store.fst]
path = "./data/store/fst/"
[store.fst.pool]
inactive_after = 300  # 5 分钟没读就从内存卸载
[store.fst.graph]
consolidate_after = 60  # 60 秒攒一次
```

`consolidate_after` 决定写入可见延迟。生产里如果写入很密，可以调短（更频繁重建，CPU 高一点），如果是冷数据可以调长。

## 踩过的坑

1. **写入不是立刻可见**：默认 60 秒才合并到主 FST。新数据 PUSH 完立即 QUERY 可能搜不到。要么调短 `consolidate_after`，要么主动调用 `TRIGGER consolidate`。

2. **不支持 BM25 等相关性评分**：返回的文档 ID 顺序基本是 FST 遍历顺序，不是按"相关性高低"。需要排序的场景必须自己后处理。

3. **中文需要预分词**：自带 tokenizer 走 rust-stemmers，对中文一窍不通。中文场景要么客户端先分词，要么改源码塞 jieba。

4. **schema-less 的代价**：没法做"只搜 title 字段"这种细粒度过滤，只能在 collection / bucket 层切。要更细就只能拆 collection。

5. **consolidation 时写入会停顿**：重建 FST 是 stop-the-world 的，几百万条目数据集会卡几秒。生产要监控。

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

## 学到什么

1. **"功能少 100 倍换资源省 100 倍"是合理工程取舍**——不是所有场景都需要 ES 那种全功能搜索
2. **FST 是搜索领域内存索引的银弹**：前缀 / 模糊 / 词典查找全靠它，且压缩率极高
3. **不可变数据结构 + 后台重建** 是处理"读多写少"工作负载的经典套路（参考 [[lsm-tree]] 思路也类似）
4. **自定义文本协议** 在专用服务里依然有市场——telnet 调试、低开销解析、客户端实现简单
5. **Rust + 嵌入式 KV + in-memory 自动机** 是当代轻量级基础组件的常见组合，值得套用

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

- [[elasticsearch]] —— Elasticsearch — 分布式搜索引擎
- [[meilisearch]] —— MeiliSearch — 开发者友好的搜索引擎
- [[minisearch]] —— minisearch — 浏览器里的小型全文搜索引擎
- [[the-silver-searcher]] —— the_silver_searcher (ag) — 比 grep/ack 快一个数量级的代码搜索

