---
title: 'Btrfs — Linux 上"写时复制 B-tree"的工业级文件系统'
来源: 'Ohad Rodeh et al., "BTRFS: The Linux B-Tree Filesystem", ACM TOS 2013'
日期: 2026-06-01
子分类: 内核与虚拟化
分类: 操作系统
难度: 中级
provenance: pipeline-v3
---

## 是什么

Btrfs（B-Tree File System，常念作"butter FS"）是 **Linux 内核里的一种文件系统**，定位是"取代 ext4，给 Linux 一个能和 Solaris ZFS 掰手腕的现代方案"。

它的核心做法只有两条，但几乎决定了它的所有特性：

1. **所有东西都存在 B-tree 里**——文件数据、目录结构、空闲块表、扩展属性、配额，全是 B-tree 节点
2. **永不原地覆盖**（Copy-on-Write，CoW）——任何修改都先在新位置写一份，最后改根指针

日常类比：传统文件系统像在纸上用橡皮改字，改坏就回不去；Btrfs 像每次改都另抄一份，旧版本完整保留，要回退只要把"指向哪一份"的便签换回去。

## 为什么重要

Linux 早期文件系统（ext2/3/4、XFS）走的是 1970 年代 Unix 的老路——inode + 间接块。这套路线干净、稳，但有几件事天然做不动：

- **快照贵**：要么停机 dd 整盘，要么靠 LVM 在块层做（管理粒度粗）
- **数据校验缺位**：磁盘静默错位（bit rot）没人查
- **管理多盘麻烦**：RAID 在块层、文件系统在上层，两边都不知道对方在想什么

ZFS 在 2003 年用"CoW + 端到端校验 + 卷管理一体化"把这些一次性解决，但 ZFS 因为许可证（CDDL）进不了 Linux 主线。Btrfs 的使命就是**在 Linux 里把这件事重做一遍**。

理解 Btrfs 等于理解：现代文件系统怎么把"快照、克隆、校验、多盘"全部塞进一颗 B-tree。

## 核心要点

### 1. 一颗 B-tree 装下整个文件系统

传统文件系统里，目录、inode、free block bitmap 各有各的格式。Btrfs 把它们**全部统一成键值对**，塞进同一种 B-tree（叫 **B+ tree** 的一个变体）。

每个键长这样：

```
(对象 ID, 类型, 偏移)
```

- "对象 ID = 257, 类型 = INODE_ITEM"  → 文件 257 的元数据
- "对象 ID = 257, 类型 = EXTENT_DATA, 偏移 = 4096" → 文件 257 第 4KB 起的数据指针

**为什么这样设计**：所有访问都变成"在 B-tree 里查一个键"，代码路径统一了，CoW 也只要为这一种结构实现一次。

### 2. 写时复制（CoW）：从不原地改

修改一个 4KB 的数据块，传统 fs 直接覆盖原位置；Btrfs 的做法是：

1. 在新位置写新数据
2. 它的父节点（B-tree 中间节点）也要指向新位置 → 父节点也复制一份
3. 一路冒泡到根节点，根节点也换新

类比：文件系统是一棵树，改一片叶子要"从叶子到树根整条路径都换新"，旧的整条路径保留——这就是后面快照"几乎免费"的关键。

代价是**写放大**：改一个 4KB 可能引发数 KB 的元数据写入。Btrfs 用日志树（log tree）+ 批量提交摊薄。

### 3. 子卷（Subvolume）：多棵共享底盘的文件树

一个 Btrfs 文件系统里可以有多个**子卷**，每个子卷是一棵独立的 B-tree（有自己的根）。但它们**共享同一个空闲块分配器和同一组物理盘**。

类比：一栋大楼里有多个独立公寓，水电（存储分配）走同一套基础设施，但每户独立装修（独立的目录树、可独立 mount/卸载）。

### 4. 快照 = 复制一个根指针

因为每棵 B-tree 都靠"根节点指针"定位，快照就是：

1. 复制一份根节点指针，指向**同一棵树**
2. 树上每个节点的引用计数 +1
3. 之后任何写都触发 CoW，新旧分叉

**整个过程 O(1)**，不抄数据、不抄元数据。

### 5. 引用计数 + 反向引用

CoW 树共享节点 → 必须知道"还有谁指着这个节点"才敢回收。Btrfs 用一棵专门的 **extent tree** 记每个数据/元数据块的引用计数，并用**反向引用**（back reference）记"这个块被哪几个文件、哪几个子卷引用着"。

反向引用让"这个块属于谁"可枚举——RAID 修复、平衡（balance）、增量发送（send/receive）都靠它。

## 实践案例

### 案例 1：秒级整盘快照

```bash
# 创建一个子卷
btrfs subvolume create /mnt/data
echo "v1" > /mnt/data/note.txt

# 快照——瞬间完成，不论里面多少 TB
btrfs subvolume snapshot /mnt/data /mnt/data-snap

echo "v2" > /mnt/data/note.txt   # 改原版
cat /mnt/data-snap/note.txt      # 还是 v1
```

后台机制：`snapshot` 只复制了根指针 + 增加引用计数，**没动任何文件数据**。

### 案例 2：增量备份（btrfs send）

```bash
btrfs send /mnt/data-snap-monday | ssh remote btrfs receive /backup
btrfs send -p /mnt/data-snap-monday /mnt/data-snap-tuesday | \
    ssh remote btrfs receive /backup
```

第二条命令只发**周一到周二的 diff**，靠 B-tree 比较根节点 + 反向引用算出变化集合，比 rsync 快一个量级。

### 案例 3：开发环境多分支并行

很多开发者把 `/home` 做成 Btrfs，每开一个 feature 分支就 snapshot 一份"干净环境"，跑坏了直接删快照。代价只有改动文件的差量空间。

## 踩过的坑

1. **RAID 5/6 写洞问题**：Btrfs 的 RAID 5/6 在 2013 论文之后多年都被认为不够稳（电源中断可能导致条带不一致）。生产环境直到近年才被认为可用，但社区习惯仍偏向"RAID 1 + Btrfs"或上 ZFS。

2. **小文件碎片化严重**：CoW 让随机改写产生大量小 extent。数据库（PostgreSQL/MySQL）默认装在 Btrfs 上会越跑越慢，要 `chattr +C` 关 CoW 或用 nodatacow 挂载选项。

3. **ENOSPC 误报**：Btrfs 的空间是分块（chunk）分配的——元数据和数据各占独立 chunk。看 `df` 还有空间，但元数据 chunk 满了就写不进去。要懂 `btrfs filesystem usage` 才能诊断。

4. **快照不是备份**：快照和原数据**在同一组盘上**，盘坏全完。要离机备份必须配合 send/receive。

## 适用 vs 不适用场景

**适用**：
- 桌面 / 工作站 Linux（openSUSE 默认就是 Btrfs，靠快照实现"系统更新失败一键回滚"）
- 单机大量快照需求（容器镜像存储——Docker overlay2 之外的另一条路）
- 需要数据校验的归档存储

**不适用**：
- 生产数据库主存储（CoW + 小写放大对随机写不友好）
- 需要极致性能的 NVMe 工作负载（XFS 仍是首选）
- 需要 ZFS 那种成熟 RAID-Z（Btrfs RAID 5/6 历史包袱重）

## 历史小故事（可跳过）

- **2007 年**：Chris Mason 在 Oracle 启动 Btrfs，目标是"Linux 的 ZFS"。设计灵感来自 Ohad Rodeh 2007 年的论文 *B-trees, Shadowing, and Clones*——讲怎么把 B-tree 做成 CoW。
- **2009 年**：合并进 Linux 主线（2.6.29），但默认警告"实验性"。
- **2013 年**：本论文（ACM TOS）正式发表，是 Btrfs 设计的官方权威描述。
- **2014 年**：Facebook 上线 Btrfs 到生产环境（Josef Bacik 团队），后来 Meta 仍是 Btrfs 最大用户之一。
- **至今**：openSUSE / SUSE Enterprise 默认根文件系统；Fedora 33+ 默认；Synology NAS 默认。

## 学到什么

1. **统一抽象的力量**：把目录、inode、空闲块、配额全压到一颗 B-tree 上，CoW、快照、send 这些功能就只用实现一次
2. **CoW 是工程取舍**：换来快照、校验、增量备份；代价是写放大和碎片化
3. **快照便宜的本质是"共享 + 引用计数"**——和 Git、ZFS、LMDB 是同一套思想
4. **反向引用是 RAID/balance/send 的基础**——没有它，CoW 共享块根本回收不了
5. **理论 → 工程 → 生产**：Rodeh 2007 论文 → 2009 进主线 → 2014 进生产，整整 7 年

## 延伸阅读

- 论文 PDF：[BTRFS: The Linux B-Tree Filesystem (TOS 2013)](https://dl.acm.org/doi/10.1145/2501620.2501623)（Btrfs 设计的权威描述，30 页）
- Rodeh 前作：[B-trees, Shadowing, and Clones (2008)](https://dl.acm.org/doi/10.1145/1326542.1326544)（CoW B-tree 的数学基础）
- 实战手册：[Btrfs Wiki](https://btrfs.readthedocs.io/)（社区文档，命令 + 故障排查最全）
- 视频：[Chris Mason — Btrfs Filesystem (LCA 2014)](https://www.youtube.com/watch?v=hxWuaozpe2I)（作者亲讲设计动机）
- [[zfs-2003]] —— Btrfs 的精神祖先，端到端校验 + 卷管理一体化
- [[lfs-1991]] —— 日志结构文件系统，"永不原地写"的更早版本
- [[comer-1979-btree]] —— B-tree 的原始论文，Btrfs 的数据结构地基

## 关联

- [[zfs-2003]] —— ZFS 在 Solaris 上做的事，Btrfs 在 Linux 上重做
- [[lfs-1991]] —— LFS 把"写日志当数据存储"，CoW 文件系统精神先驱
- [[comer-1979-btree]] —— B-tree 数据结构理论基础
- [[aries-1992]] —— ARIES 也是日志结构思想，但在数据库层
- [[rocksdb-2017]] —— LSM-tree 是 CoW 思想在 KV 存储的另一种体现

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[aries-1992]] —— ARIES 1992 — 数据库崩溃后怎么把账目对回来
- [[comer-1979-btree]] —— Comer 1979 — B-Tree 综述：为什么这棵树到处都有
- [[lfs-1991]] —— LFS 1991 — 把整个磁盘当日志写
- [[rocksdb-2017]] —— RocksDB 2017 — 把 LSM-Tree 的"空间放大"压到极低的工业经验
- [[zfs-2003]] —— ZFS — 把磁盘当成水池，每滴水都贴标签

