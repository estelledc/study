---
title: sled — Rust 现代 BTree + LSM 混合嵌入式 KV
来源: https://github.com/spacejam/sled
日期: 2026-06-01
分类: 数据库 / 存储引擎
难度: 中级
---

## 是什么

sled 是一个**纯 Rust 写的嵌入式键值数据库**——和 [[bbolt]] / [[badger]] 一样不起服务、不监听端口，`cargo add sled` 进项目调 API 就能用。它的 slogan 是 "the champagne of beta embedded databases"，定位是**给 Rust 生态一个现代、零依赖、API 像 BTreeMap 的持久化 KV**。

日常类比：sled 像一本**带活页夹的笔记本**——平时翻页（读）极快，因为页都是连续装订；写新页时不撕旧页，先在末尾草稿区写好，再把目录指过去（log-structured）；想把哪段抽出来重抄一份（compaction / GC）随时可以。

核心创新点是**B+ 树 + log-structured 存储混合**——上层逻辑像 [[bbolt]] / [[lmdb]] 那样按 B+ 树组织索引，但底层物理存储是**追加日志 + 后台 GC**（像 LSM）。设计目标：尽量拿 B+ 树的读延迟，配上接近 LSM 的写吞吐——是工程折中，不是两边都已登顶。

作者 Tyler Neely（spacejam）从 2017 年开始独立开发，目标是替代 Rust 生态里 [[rocksdb]] 的 **FFI/bindgen** 绑定路线（不是 Go 的 cgo）。约 8k stars，至今仍是 **0.34 beta**——作者明确说"格式还可能变"，正式 1.0 没发布。

## 为什么重要

不理解 sled，下面这些事都讲不通：

- 为什么 Rust 生态里"嵌入式 KV"长期尴尬——绑 [[rocksdb]] 要跨语言 FFI、编译与部署麻烦，纯 Rust 选项要么不成熟要么 API 别扭
- 为什么"B+ 树 vs LSM 二选一"不是唯一答案——sled 试图把两者各取所长，证明混合架构在工程上可行
- 为什么一个 0.x 库仍被不少 Rust 项目当依赖——API 像 `BTreeMap` 时，有人愿意承担格式未冻结的风险
- 为什么"嵌入式 KV"在 2020s 仍有创新空间——NVMe / 大内存改变了老设计的假设

## 核心要点

sled 的工作模型可以拆成 **四点**：

1. **API 像 BTreeMap**——`db.insert(k, v)` / `db.get(k)` / `db.range(..)`，几乎是标准库 `BTreeMap` 的持久化版。类比：同一本通讯录，只是合上电脑再打开内容还在。

2. **逻辑层是 B+ 树**——键按树组织，点查大约 log(N) 跳到叶子，范围扫描沿叶子链前进。类比：字典按字母分册，先翻到对的册再顺序读。

3. **物理层是 log-structured**——页**不原地改**，写追加到日志末尾；老页由后台 GC 回收。类比：不涂改旧页，新内容写在本子末尾，空了再整理。

4. **lock-free 并发**——大量用 epoch-based reclamation（可先记成「过期世代回收」：读者走完再回收内存，类似 crossbeam-epoch）做无锁结构。多 writer 不互锁，多核扩展性好过 [[bbolt]] 的单 writer 天花板。

核心权衡：**用工程复杂度换「两边好处都要一点」**。代价是代码量大、bug 面广、磁盘格式仍在演化。

## 相比 bbolt / RocksDB 改了什么

[[bbolt]] 走纯 B+ 树 + COW：读快、写放大偏大、单 writer。
[[rocksdb]] 走纯 LSM：写快、读放大偏大、compaction 可能抖动。

sled 试图**两边都拿一些**：

- **读路径像 B+ 树**——点查没有 LSM 那种 MemTable + 多层 SST（可记成「内存表 + 多层排序文件」）的层层 fanout
- **写路径像日志追加**——避免 B+ 树原地更新的同步开销；但仍有 GC/页重写，**不是**「写放大≈1」
- **API 体验好于 RocksDB FFI**——纯 Rust、类型安全、`Send`/`Sync` 明确
- **不是单文件**——目录里多个段文件 + 元数据，`cp` 不如 [[bbolt]] 直观

## 三种放大：混合派的曲线

- **写放大**：通常低于 [[bbolt]]「COW 一路改到根」的尖峰；追加为主，但 GC 重写页仍会放大，需实测
- **读放大**：通常低于 [[rocksdb]] 多层 SST；B+ 树点查约 1–3 跳到叶子
- **空间放大**：取决于 GC 是否跟上——落后时旧版本堆积，追上后回落

一句话：**全面偏温和**，每项未必冠军，也少极端短板；代价是同时做对 B+ 树并发、日志 GC、epoch 回收与崩溃恢复。

## 实践案例

### 案例 1：本地状态——open / insert / get

```rust
use sled::Db;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let db: Db = sled::open("/tmp/sled-demo")?;
    db.insert(b"config:port", b"8080")?;
    let v = db.get(b"config:port")?;
    assert_eq!(v.as_deref(), Some(b"8080".as_slice()));
    db.flush()?; // 尽量把缓冲落盘
    Ok(())
}
```

**逐部分解释**：

- `sled::open` 打开（或创建）一个**目录**当数据库，不是单文件。
- `insert` / `get` 的键值都是字节；教学上用 `b"..."` 即可。
- `flush` 降低掉电丢最近写入的概率；生产路径还要结合你的耐久性要求测试。

### 案例 2：前缀范围扫描

```rust
fn scan_users() -> sled::Result<()> {
    let db = sled::open("/tmp/sled-range")?;
    db.insert(b"user:1", b"ada")?;
    db.insert(b"user:2", b"bob")?;
    db.insert(b"z:other", b"skip")?;

    for item in db.range(b"user:"..b"user:~") {
        let (k, v) = item?;
        println!("{:?} => {:?}", k, v);
    }
    Ok(())
}
```

**逐部分解释**：

- `range(start..end)` 按字典序扫一段键，类似 `BTreeMap` 的范围视图。
- `user:` .. `user:~` 是常见前缀技巧：`~` 在 ASCII 里较大，用来框住 `user:` 开头的键。
- 也可用 `scan_prefix(b"user:")`；逻辑层是 B+ 树叶子链，所以前缀扫描通常比「多层 SST 合并读」直观。

### 案例 3：事务一次改多键

```rust
fn transfer_pair() -> Result<(), Box<dyn std::error::Error>> {
    let db = sled::open("/tmp/sled-tx")?;
    db.transaction(|tx| {
        tx.insert(b"a", b"1")?;
        tx.insert(b"b", b"2")?;
        Ok(())
    })?;
    Ok(())
}
```

**逐部分解释**：

- `transaction` 把多次写入绑成一组：要么一起可见，要么一起失败回滚（教学级理解即可）。
- 闭包里用 `tx` 而不是 `db`，避免和外部并发写搅在一起。
- 仍要记住：这是 **0.x** 嵌入式库，格式与语义以当前文档为准，升级前先备份。

## 踩过的坑

1. **0.34 beta 不是玩笑**——磁盘格式可能变，升级常要重建库；生产要锁版本 + 备份。
2. **内存占用常高于 [[bbolt]]**——日志 GC + epoch 簿记都要额外内存。
3. **后台 GC 会抖 IO**——延迟敏感场景要看 p99 / p999。
4. **恢复时间随未回收日志变长**——重启要扫日志重建索引。
5. **大 value 不擅长**——建议 KB 级；更大放文件，sled 只存路径。
6. **没有 SQL / 二级索引**——需要就自己在应用层维护。
7. **默认不适合多进程共享**——多进程同开一个库容易踩文件锁/一致性问题。
8. **维护节奏看作者精力**——重度使用前先看最近 commit 与 issue。

## 适用 vs 不适用场景

**适用**：

- Rust 项目要嵌入式 KV、不想引 RocksDB FFI、也不想上 SQL
- 中小数据（大约 GB 级以内），读写都有但都不极端
- 单进程多线程，需要 `Send`/`Sync` 类型边界
- 原型 / 内部工具 / 教学——能锁版本、能接受 0.x

**不适用**：

- 生产关键路径要求格式长期稳定 → [[bbolt]] / [[rocksdb]] 等更久经考验的选项
- TB 级 + 极端写吞吐 → [[rocksdb]] 工业打磨更多
- 需要 SQL 或超出 KV 的事务模型 → [[sqlite]]
- 多进程共享同一数据库文件/目录 → 换支持多进程的引擎或外置服务

## 历史小故事（可跳过）

- **2017 年**：Tyler Neely 受 [[rocksdb]] 启发但不满 FFI 体验，开始写 sled
- **2018–2020 年**：定型为 B+ 树 + log-structured，引入 epoch 回收，API 贴近 `BTreeMap`
- **2020 年前后**：进入 0.30 系列；部分项目（如早期 iroh 等）试用为本地存储
- **2022 年**：作者公开表示 1.0 未就绪，格式仍可能变
- **2023–2026 年**：维护放缓，仍在 0.34 系列；社区另有 fjall / redb 等选项，但 sled 的 API 仍常被当作「最像 BTreeMap」的参照

## 学到什么

1. **B+ 树和 LSM 可以混合**——逻辑层取一边、物理层取另一边，是合法工程路线
2. **纯 Rust 嵌入式 KV 有真实价值**——无 FFI、cargo 一行依赖、类型安全，足以吸引早期用户
3. **长期 0.x 要诚实对待**——格式未冻结不是失败，但用户必须锁版本 + 备份
4. **API 像 BTreeMap 是杀手锏**——学习成本往往比「先啃 RocksDB options」低
5. **混合架构的代价是复杂度**——并发、GC、恢复任一环节都比「纯一种结构」更难做对

## 延伸阅读

- [[bbolt]] —— B+ 树派单文件 KV 对照
- [[badger]] —— Go 生态 LSM 嵌入式 KV
- [[rocksdb]] —— 工业 LSM 标杆，sled 想用纯 Rust 避开的 FFI 依赖
- [[leveldb]] —— LSM 思想工业起点之一
- [[lmdb]] —— mmap + COW + B+ 树，逻辑层灵感来源之一

## 关联

- [[bbolt]] —— Go 嵌入式 B+ 树 KV，读优先路线对照
- [[badger]] —— Go 嵌入式 LSM KV，写优先路线对照
- [[rocksdb]] —— LSM 工业标杆与 FFI 绑定对照
- [[leveldb]] —— LSM 思想工业起点
- [[lmdb]] —— B+ 树 + mmap + COW 的祖宗之一

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
