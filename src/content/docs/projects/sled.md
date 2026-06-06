---
title: sled — Rust 现代 BTree + LSM 混合嵌入式 KV
来源: https://github.com/spacejam/sled
日期: 2026-06-01
子分类: 存储与查询
分类: 数据库
难度: 中级
provenance: pipeline-v3
---

## 是什么

sled 是一个**纯 Rust 写的嵌入式键值数据库**——和 [[bbolt]] / [[badger]] 一样不起服务、不监听端口，cargo add 进项目调 API 就能用。它的 slogan 是 "the champagne of beta embedded databases"，定位是**给 Rust 生态一个现代、零依赖、API 像 BTreeMap 的持久化 KV**。

日常类比：sled 像一本**带活页夹的笔记本**——平时翻页（读）极快，因为页都是连续装订；写新页时不撕旧页，先在末尾草稿区写好，再把目录指过去（log-structured）；想把哪段抽出来重抄一份（compaction）随时可以。

核心创新点是**B+ 树 + log-structured 存储混合**——上层逻辑像 [[bbolt]] / [[lmdb]] 那样按 B+ 树组织索引，但底层物理存储是**追加日志 + 后台 GC**（像 LSM）。设计目标：拿 B+ 树的读延迟，配 LSM 的写吞吐。

作者 Tyler Neely（spacejam）从 2017 年开始独立开发，目标是替代 Rust 生态里 [[rocksdb]] FFI 绑定那条 cgo 路线。约 8k stars，至今仍是 **0.34 beta**——作者明确说"格式还可能变"，正式 1.0 没发布。

## 为什么重要

不理解 sled，下面这些事都讲不通：

- 为什么 Rust 生态里"嵌入式 KV"长期处于尴尬期——cgo 绑 [[rocksdb]] 跨平台麻烦，纯 Rust 选项要么不成熟要么 API 别扭
- 为什么"B+ 树 vs LSM 二选一"不是终极答案——sled 试图把两者各取所长，证明混合架构在工程上可行
- 为什么一个 0.x 版本的库能被几百个 Rust 项目当核心依赖——API 设计（像 BTreeMap）足够好就有人愿意承担风险
- 为什么"嵌入式 KV"这条赛道在 2020s 仍有创新空间——硬件（NVMe / 大内存）变了，老设计的假设要重检验

## 核心要点

sled 的工作模型可以拆成 **四点**：

1. **API 像 BTreeMap**——`db.insert(k, v)` / `db.get(k)` / `db.range(..)`，几乎是标准库 `BTreeMap` 的持久化版。Rust 工程师零学习成本上手。

2. **逻辑层是 B+ 树**——所有键按 B+ 树组织，点查 log(N) 跳转到叶子，范围扫描沿叶子链顺序前进。这部分和 [[bbolt]] / [[lmdb]] 思路一致。

3. **物理层是 log-structured**——B+ 树的页**不原地改**，所有写都追加到日志末尾；老页通过后台线程 GC 回收。这部分像 [[leveldb]] / [[rocksdb]]。

4. **lock-free 并发**——sled 大量用 epoch-based reclamation（crossbeam-epoch）做无锁数据结构。多 writer 不互锁，多核扩展性比 [[bbolt]] 的"单 writer 硬天花板"好得多。

整个设计的核心权衡：**用工程复杂度换"两边好处都要"**——B+ 树的读优势（点查少跳转 / 范围快） + log-structured 的写优势（顺序追加 / 多 writer）。代价是代码量大、bug 面广、格式还在演化。

## 相比 bbolt / RocksDB 改了什么

[[bbolt]] 走纯 B+ 树 + COW：读快、写放大大、单 writer。
[[rocksdb]] 走纯 LSM：写快、读放大大、后台 compaction 抖动。

sled 试图**两边都拿**：

- **读延迟接近 B+ 树**——逻辑层就是 B+ 树，点查没有 LSM 那种 MemTable + 多层 SST 的 fanout
- **写吞吐接近 LSM**——物理层追加日志，多 writer 并发，避免 B+ 树原地更新的同步开销
- **API 体验远好于 RocksDB**——纯 Rust 无 cgo，类型安全，Send/Sync 明确，编译器替你管线程安全
- **单文件可读性差**——和 [[bbolt]] 单文件不同，sled 用一整个目录（多个段文件 + 元数据），cp 不如 [[bbolt]] 直观

一句话：**sled 要做 Rust 时代的"通用嵌入式 KV"**——不强调某一面极致，而是把两条路线的长处都拿一些。

## 三种放大：混合派的曲线

LSM 的写/读/空间放大三角是经典话题，B+ 树派把曲线翻过来。sled 的混合架构试图让三个数都不极端：

- **写放大**：低于 [[bbolt]] 的"COW 一路到根"——追加日志接近 1 倍 WAL，靠后台 GC 平滑回收
- **读放大**：低于 [[rocksdb]] 的多层 SST——B+ 树点查 1–3 跳到叶子，没有 LSM 的层级 fanout
- **空间放大**：取决于 GC 调度——后台没追上时旧版本会堆积，追上后稳定。比 [[bbolt]] 的 freelist 复用不确定，但好于 [[rocksdb]] 大 compaction 时的尖峰

简单说：**全面温和**。每项都不是冠军，但没有哪项是短板。代价是工程复杂度——同时要做对 B+ 树并发、log-structured GC、epoch 回收、崩溃恢复。

## 实践案例

### 案例 1：作为 Rust 服务的本地状态存储

很多 Rust CLI / 守护进程需要"重启不丢"的 KV。引 [[rocksdb]] 要 cgo 编译头疼、引 [[sqlite]] 要 SQL 层。sled 的吸引力：cargo add 一行依赖、API 和 BTreeMap 几乎一样、纯 Rust 跨平台编译无障碍。

### 案例 2：作为 P2P / 区块链节点的本地数据库

iroh（IPFS Rust 实现的子集）、部分 substrate 实验链曾把 sled 当本地存储。理由是嵌入式 + 纯 Rust + Send/Sync 类型安全——多线程访问时编译器替你守边界。

### 案例 3：作为缓存 / 索引层

需要"比内存大、比 [[rocksdb]] 简单"的中间层时，sled 是合适候选。例如本地搜索索引、模型推理结果缓存。`db.range(prefix..)` 的范围扫描接近 B+ 树原生速度。

### 案例 4：教学和原型

sled 的源码相对 [[rocksdb]] 友好——纯 Rust、模块清晰、有大量注释。想学"现代嵌入式 KV 怎么设计"，sled 是比 [[leveldb]]（C++）更易读的入口。

## 踩过的坑

1. **0.34 beta 不是玩笑**——作者公开警告磁盘格式可能变，升级版本可能要重建数据库。生产环境要锁版本 + 备份策略。

2. **内存占用比 [[bbolt]] 高**——log-structured + 后台 GC + epoch 回收都需要额外簿记。小数据集场景内存开销可能让人意外。

3. **后台线程 IO 抖动**——和 LSM 一样，GC 触发时会有 IO 尖峰。延迟敏感场景要测试 p99 / p999。

4. **崩溃恢复时间随日志长度增长**——重启时要扫日志重建内存索引。日志没及时 GC 时启动会变慢。

5. **大 value 表现一般**——和 [[bbolt]] 类似的问题，建议 value 控制在 KB 级。再大用文件系统外存 + sled 存路径。

6. **没有 SQL / 二级索引**——只是 KV。需要二级索引得自己在应用层维护。

7. **作者维护节奏不稳**——独立开发者项目，长期更新依赖个人精力。重度使用前看一下最近 commit 频率。

8. **文档相对 [[rocksdb]] 单薄**——API 文档够用，但深入调优 / 内部架构的资料散在 issue 和博客。问题排查比 [[rocksdb]] 找答案难。

## 适用 vs 不适用场景

**适用**：

- Rust 项目要嵌入式持久化 KV、不想引 cgo、不想要 SQL
- 中小数据集（GB 级以内），读写都有需求但都不是极致
- 单进程多线程访问，需要 Send/Sync 类型安全
- 原型 / 内部工具 / 教学——锁版本可以容忍 0.x 风险

**不适用**：

- 生产关键路径要求格式稳定 → 选 [[bbolt]] 的 etcd 久经考验路线，或 [[rocksdb]] cgo 绑定
- 数据集 TB 级 + 极端写吞吐 → [[rocksdb]] 经过更多工业打磨
- 需要 SQL / ACID 事务超出 KV 范围 → [[sqlite]]
- 多进程共享数据库 → sled 用文件锁不让多开

## 历史小故事（可跳过）

- **2017 年**：Tyler Neely 受 [[rocksdb]] 启发但不满 cgo 体验，开始写 sled，目标是"Rust 时代的 BTreeMap-like 持久化 KV"
- **2018–2020 年**：架构定型为 B+ 树 + log-structured 混合，引入 epoch-based reclamation，API 稳定到接近 BTreeMap
- **2020 年前后**：进入 0.30 系列，部分 Rust 生态项目（iroh / 一些区块链节点）开始当核心依赖
- **2022 年**：作者公开承认"1.0 还没准备好"——格式可能还要变，建议 beta 用户做好迁移预期
- **2023–2026 年**：维护节奏放缓，仍在 0.34 系列。社区出现 fjall / redb 等新选项分担工作负载，但 sled 的 API 仍是公认最像 BTreeMap 的

## 学到什么

1. **B+ 树和 LSM 不是非此即彼**——sled 证明工程上可以混合，逻辑层取一边、物理层取另一边
2. **纯 Rust 嵌入式 KV 这条路线值得**——Send/Sync 类型安全 + 无 cgo + cargo add 一行的开发体验，足以让人愿意承担 0.x 风险
3. **0.x 长期 beta 不是失败**——作者诚实承认格式未冻结好过假装稳定。但用户要做好版本锁 + 备份预案
4. **API 像 BTreeMap 是杀手锏**——`db.insert / db.get / db.range` 让 Rust 工程师零学习成本，比"先学 [[rocksdb]] options"友好得多
5. **混合架构的代价是复杂度**——同时做对 B+ 树并发、log-structured GC、epoch 回收、崩溃恢复，bug 面比纯 B+ 树或纯 LSM 大一圈

## 延伸阅读

- [[bbolt]] —— B+ 树派单文件 KV 的对照组，思路截然不同
- [[badger]] —— Go 生态 LSM 嵌入式 KV，sled 的 LSM 版精神同行
- [[rocksdb]] —— 工业 LSM 标杆，sled 想用纯 Rust 替代的目标
- [[leveldb]] —— LSM 思想工业起点，sled 的物理层灵感来源之一
- [[lmdb]] —— mmap + COW + B+ 树的精神祖宗，sled 的逻辑层灵感来源之一

## 关联

- [[bbolt]] —— Go 嵌入式 B+ 树 KV，sled 的"读优先"路线对照
- [[badger]] —— Go 嵌入式 LSM KV，sled 的"写优先"路线对照
- [[rocksdb]] —— LSM 工业标杆，sled 想替代的 cgo 依赖
- [[leveldb]] —— LSM 思想工业起点
- [[lmdb]] —— B+ 树 + mmap + COW 的祖宗

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[badger]] —— Badger — Go 写的键值分离 LSM
- [[bbolt]] —— bbolt — Go 嵌入式 B+ 树 KV
- [[lmdb]] —— LMDB — 闪电内存映射嵌入式 KV 库
- [[mongo]] —— MongoDB — 文档数据库服务端开源实现
- [[rocksdb]] —— RocksDB — 嵌入式 LSM 引擎
- [[sqlite]] —— SQLite — 嵌入式 SQL 数据库

