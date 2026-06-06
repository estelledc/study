---
title: bbolt — Go 嵌入式 B+ 树 KV
来源: https://github.com/etcd-io/bbolt
日期: 2026-06-01
子分类: 存储与查询
分类: 数据库
难度: 中级
provenance: pipeline-v3
---

## 是什么

bbolt 是一个**嵌入到 Go 进程里的键值数据库**——和 [[badger]] 一样不起服务、不监听端口，import 进来调 API 就能存取。底层用 **B+ 树 + 内存映射（mmap）+ 写时复制（COW）**，整个数据库就一个文件，崩溃后无需恢复日志直接可用。

日常类比：Bolt 像一本**写好的参考手册**——目录、章节、页码全在一个装订好的文件里；读的时候手一翻就到（OS 直接把文件映到内存）；写的时候不许撕页，只能把改过的章节抄到末尾、最后翻一页"目录"指过去。所以崩溃恢复 = 看哪一份目录有效。

它的前身是 **BoltDB**，作者 Ben Johnson 2013 年开始写、2017 年宣布**项目已完成**并归档（不再接受新功能）。但 etcd 团队当时正深度依赖它，于是 fork 出 **bbolt**（"better bolt" 或 "bolt by etcd"），延续维护至今。约 9k stars。

[[etcd]]、[[consul]]、InfluxDB v1 等系统都把它当作底层 KV 状态机存储。

## 为什么重要

不理解 bbolt，下面这些事都讲不通：

- 为什么 [[etcd]] 这种"分布式协调系统"底下藏着一个**单机单文件**的 KV——上面是 raft 共识，下面是 bbolt 存状态
- 为什么 Go 生态里"嵌入式 KV"分两派：**B+ 树派（bbolt）** vs **LSM 派（[[badger]] / Pebble）**——两边的取舍正好相反
- 为什么 [[lmdb]] 和 bbolt 长得这么像（都 mmap、都 COW、都 B+ 树）——bbolt 就是 [[lmdb]] 的 Go 版精神后继
- 为什么"读多写少 + 强一致 + 单文件部署"这种需求挑不出更合适的方案

## 核心要点

bbolt 的工作模型可以拆成 **四点**：

1. **mmap 整个文件**——bbolt 不维护自己的 buffer pool，而是把数据库文件 mmap 进进程地址空间，让 OS page cache 全权负责。读 = 直接内存解引用，没有"从磁盘读到 buffer"这一步。

2. **B+ 树组织**——所有数据按 4KB 页存储，分四种页：**meta**（元数据，固定两份）/ **freelist**（空闲页表）/ **branch**（B+ 树内部节点）/ **leaf**（叶子，存键值）。

3. **写时复制（COW）**——任何修改不**原地改**已有页，而是把要改的页复制一份、改完写到文件末尾的空白页。一路 COW 直到根。最后**原子地切换 meta 页**指向新根——这一步是事务提交的关键。

4. **一写多读**——同时只允许一个写事务，但读事务可以任意多。读事务拿到的是"提交那一刻的 meta 指针"，之后无论别人怎么写都不会动它看到的页。本质上是 **MVCC**，但极其朴素——靠 COW 自动保留旧版本。

整个设计的核心权衡：**简化崩溃恢复**——不需要 WAL、不需要 redo/undo log，重启时只看两份 meta 哪一份校验和对就用哪一份。代价是**写放大**——改一个 byte 也要 COW 一整页 + 一路 COW 上去。

## 相比 LSM（[[badger]] / [[rocksdb]]）改了什么

LSM 的强项是**写吞吐**：日志追加 + 后台 compaction，写延迟均匀低。代价是**读放大**和**后台 IO 抖动**。

B+ 树（bbolt）走相反的路：

- **读优先**——B+ 树点查 1–2 次磁盘访问就到叶子；LSM 至少要查 MemTable + 多层 SST。bbolt 因为 mmap，热数据点查几乎是纯内存
- **范围扫描极快**——叶子页之间有指针，顺序遍历就是顺序读 mmap，CPU cache 友好
- **写吞吐弱**——单 writer，加上 COW 写放大，写多场景明显比 LSM 慢
- **空间放大稳定**——COW 用过的旧页进 freelist 给下次复用，不像 LSM 需要后台 GC 追赶
- **崩溃恢复零成本**——meta 双份 + 校验和，挂了重启不用重放日志

一句话：**bbolt 是给"读多写少 + 强一致 + 单进程"场景设计的**；写多就该看 [[badger]] / [[rocksdb]]。

## 三种放大：B+ 树派的曲线

LSM 调优永远在三个放大之间挪动，B+ 树派把曲线拉到了**几乎反过来**的位置：

- **写放大**：bbolt 是"COW 一路到根"，每次提交触发 log(N) 个页改写——比 LSM 的 1 倍 WAL 高。改 1 个字段大概 8–32KB 实写
- **读放大**：极低——B+ 树点查 1–3 次磁盘访问到叶子，加上 mmap 热数据全在 page cache，热查几乎纯 RAM
- **空间放大**：稳定——COW 旧页进 freelist 复用，没有 LSM 那种"等 GC 追上"的不确定性

简单说：**写放大换读延迟和确定性**。读密集 + 想要稳定延迟的场景，bbolt 赢；写密集 + 不在乎尾延迟，LSM 赢。

## 实践案例

### 案例 1：[[etcd]] 把它当 KV 状态机底层

[[etcd]] 上层是 raft 共识，每条提案过半数后要 apply 到状态机——这个"状态机"就是 bbolt。读多写少（配置/服务发现型负载）、要求强一致（COW 提交即持久）、要求单文件好备份（直接 cp）——bbolt 全都满足。

### 案例 2：[[consul]] 存 KV + ACL

和 [[etcd]] 类似的定位。HashiCorp 选 bbolt 的另一个理由：**纯 Go**，单二进制交叉编译到 Linux/macOS/Windows 全无障碍。

### 案例 3：InfluxDB v1 的元数据存储

时序数据本身落 TSM 文件，但**索引和元数据**（measurement、tag、retention policy）放在 bbolt 里——典型的"读多写少 + 数据集小"。

### 案例 4：作为 Go 服务的本地配置/缓存

很多 Go 工具（CLI、桌面应用、轻量服务端）需要"重启不丢的本地存储"。引一个 [[badger]] 体量太大、引 SQLite 要 cgo——bbolt 的 API 极简（Bucket / Key / Value 三层）、依赖零，最低成本满足需求。

## 踩过的坑

1. **mmap 不适合数据集 >> 内存**——bbolt 把整个文件 mmap，理论上最大 256TB（64 位），但实际上数据集远超物理内存时 page fault 频发、性能塌方。规模上去考虑切 LSM。

2. **单 writer 是硬天花板**——再多核也只能一个写事务。写密集场景下 CPU 远没跑满磁盘就先饱和了。这不是 bug，是设计。

3. **长读事务阻塞 freelist 回收**——读事务还在引用某些旧页时，那些页不能进 freelist。如果有人开了读事务忘记关，数据库文件会持续膨胀，看起来像漏改不掉。

4. **大 value 写入慢**——COW 一整页 + 一路 COW 到根，value 越大越亏。建议 value 控制在 KB 级，再大考虑外存（文件系统 + bbolt 存路径）。

5. **`db.Close()` 之前必须等所有事务结束**——否则 panic 或数据损坏。多协程退出时容易漏掉某个长事务。

6. **没有内置加密 / 压缩**——和 [[badger]] 不一样，bbolt 不管这两件事。要加密只能在调用方自己 encrypt 后再 Put。

7. **32 位平台地址空间限制**——mmap 全文件意味着 32 位机最多 ~2GB。生产部署 64 位是隐含前提。

8. **freelist 序列化在大库上是瓶颈**——v1 默认用 array 格式，几十 GB 库的 freelist 自己就是 MB 级。bbolt 后来加了 `FreelistType: FreelistMapType` 改成 hashmap 格式，启动和提交都快很多。新人常用默认值就上线。

## 适用 vs 不适用场景

**适用**：

- Go 服务的嵌入式持久化 KV，特别是 etcd/consul 这类**读多写少、强一致、单文件部署**
- 数据集小于物理内存（GB 级以内），mmap 收益最大
- 需要"配置即数据库"——单文件好备份、好版本控制、好分发
- 不想引 cgo（SQLite / [[rocksdb]]）的项目

**不适用**：

- 写多场景（高并发写入、日志类负载）→ 看 [[badger]] / Pebble
- 数据集远大于内存 → mmap 抖动严重，看 LSM
- 需要 SQL / 二级索引 / 全文搜索 → 看 [[sqlite]] 或专门的搜索引擎
- 多进程共享一个数据库 → bbolt 用文件锁不让多开

## 历史小故事（可跳过）

- **2013 年**：Ben Johnson 看了 [[lmdb]]（C 写的、mmap + COW + B+ 树）想要一个 Go 等价物，开始写 BoltDB
- **2014 年**：CoreOS 把 BoltDB 选为 [[etcd]] v3 的底层存储，从此和 etcd 绑定
- **2017 年**：Ben Johnson 宣布 BoltDB **已完成**——不再接收新特性，只修严重 bug。理由：嵌入式 KV 的核心问题已解决，加更多功能会破坏简洁性
- **2017 年**：etcd 团队 fork 出 bbolt，继续维护：修 bug、加测试、改进 freelist 性能
- **2020s**：bbolt 持续作为 [[etcd]] 的底层，没有大改架构——证明了 Ben Johnson 当年的判断"已完成"是对的

## 学到什么

1. **mmap + COW + B+ 树** 三件套是经典"读优先嵌入式 KV"的最优解，[[lmdb]] / bbolt 殊途同归
2. **崩溃恢复可以不要 WAL**——只要原子切换一个 meta 指针，文件系统的"页写要么全成要么全失败"由硬件保证就够
3. **"项目已完成"是合法状态**——开源不一定要永远迭代。Ben Johnson 归档 BoltDB 是负责的做法，etcd fork 也是负责的延续
4. **B+ 树 vs LSM** 不是谁更好，是负载形状决定——读多写少选 B+ 树，写多读少选 LSM
5. **单 writer + MVCC 读** 是简化并发的有效手段——避免了 B+ 树并发分裂这个学术界折磨了几十年的问题

## 延伸阅读

- [[lmdb]] —— bbolt 的精神祖宗，C 实现，思路几乎一致
- [[badger]] —— 同样 Go 嵌入式 KV，走 LSM 路线，正好对照
- [[rocksdb]] —— LSM 的工业标杆，bbolt 的负载反面
- [[etcd]] —— bbolt 最大的下游，KV 状态机靠它
- [[sqlite]] —— 同样"嵌入式单文件"，但有 SQL 层

## 关联

- [[lmdb]] —— bbolt 的设计原型，几乎一样的 mmap + COW + B+ 树
- [[badger]] —— 同 Go 生态的 LSM 对照组
- [[rocksdb]] —— LSM 工业标杆，写优化路线代表
- [[etcd]] —— bbolt 最重要的使用方
- [[sqlite]] —— 嵌入式单文件数据库的另一种解法（有 SQL）
- [[leveldb]] —— LSM 思想的工业起点

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[badger]] —— Badger — Go 写的键值分离 LSM
- [[etcd]] —— etcd — 分布式键值数据库
- [[rocksdb]] —— RocksDB — 嵌入式 LSM 引擎
- [[sled]] —— sled — Rust 现代 BTree + LSM 混合嵌入式 KV
- [[sqlite]] —— SQLite — 嵌入式 SQL 数据库

