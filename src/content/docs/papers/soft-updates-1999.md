---
title: Soft Updates — 不写 journal 也能保证文件系统元数据一致
来源: 'Ganger, McKusick, Soules, Patt, "Soft Updates: A Solution to the Metadata Update Problem in File Systems", ACM TOCS, Feb 2000（SOSP 1994 短文延伸）'
日期: 2026-06-01
分类: 操作系统
难度: 进阶
---

## 是什么

Soft Updates 是 1999 年 Ganger 等四人提出的一种**不用 journal、也能保证文件系统崩溃后元数据始终一致**的写入策略。FreeBSD 在 1999 年把它集成进 UFS，并在后来的 UFS2 里设为默认。

日常类比：

- **同步写**（老 FFS）像每搬一件家具就立刻拍照存档——慢，但永远不会出错
- **Journaling**（ext3、NTFS、XFS）像写完每一步先在小本子上记一笔"我接下来要做这件事"，崩溃后照本子重做一遍——稳，但每件事写两次
- **Soft Updates** 像搬家时**安排顺序**——先把书柜搬进新房（保证有地方放），再把书放上去；如果不得不先放书，就先把书暂时放回箱子；结果是：**崩溃时拍下的快照永远是合法状态**，事后只是有些空箱子没扔（空间泄漏，不影响挂载）

它是在 journal 路线主导的 1990s 末，被工业界严肃考虑过的"第二条路"。

## 为什么重要

不理解 Soft Updates，下面这些事都解释不清：

- 为什么 FreeBSD 在 ext3 出现后**没有**跟着改用 journal——它有一套同样安全、不需要 journal 的方案
- 为什么 Linux 走了 journal 路线（[[aries-1992]] 思想下沉到 FS 层）——不是技术上更优，是工程上简单一个数量级
- 为什么 SU+J（2010）后来又给 Soft Updates 加了一小段 journal——不是为崩溃恢复，是为省掉后台清空间泄漏的 fsck
- 为什么"崩溃一致性"这个问题在 1990s 是文件系统的**头号议题**——磁盘越来越快、内存 cache 越来越大，崩溃时丢的字节越来越多

Soft Updates 是 crash consistency 设计里**最强调"盘上任意瞬间都合法"**的一条路——也是工程上最复杂的一条。

## 核心要点

Soft Updates 由三块拼起来。先记三个词：

- **inode**：文件的"身份证"——名字之外的身份、大小、指向数据的指针
- **bitmap**：磁盘座位表——哪块空闲、哪块已占
- **buffer cache**：内存里待寄出的包裹堆——脏块先堆在这，再按规则写盘

1. **依赖跟踪（per-block dependency）**：每个脏块挂一张依赖单——"写我之前谁必须先写"。新建 `foo`：先分配并初始化 inode（块 A），再在目录加 entry 指向它（块 B）。B 必须等 A；否则盘上目录指向未初始化 inode，挂载会读到垃圾。类比：先办好身份证，再把名字写进通讯录。

2. **rollback / rollforward（回滚再回填）**：内存紧、必须先写 B 时不硬挡——先在内存副本里把 entry 临时清成"空"再写盘，盘上仍合法；写完后 rollforward 恢复 entry，等 A 落盘再把含 entry 的 D 写一次。类比：书柜没到就先把书放回箱子，书柜到位再摆上。journal 靠"先记后做"事后补；Soft Updates 靠顺序 + 临时回滚，根本不需要补。

3. **循环依赖拆解**：真实依赖图会成环（目录互链、bitmap 互查）。检测到环就 rollback 切断一条边、写一次、再 rollforward、写另一条。这是复杂度根源——FreeBSD 实现约是 ext3 journal 的 3–5 倍代码量。

| 维度 | Journal (ext3) | Soft Updates (UFS2) |
|------|---------------|---------------------|
| 思路 | 先记后做，恢复时回放 | 安排顺序，盘上始终合法 |
| 写次数 | 元数据写 2 次（log + inplace） | 无 journal 双写；回滚时同一块可能多写 |
| 崩溃恢复 | 挂载前回放 log（数秒-数分钟） | 直接挂载，后台扫泄漏 |
| 代码复杂度 | 中（约 1000-2000 行） | 高（FreeBSD 实现 7000+ 行） |
| 数据保护 | data=journal 可保护 | 不保护文件数据 |

## 实践案例

### 案例 1：创建一个文件 foo 的依赖链

```
1. 分配 inode → 写 inode bitmap（脏块 A1）
2. 初始化 inode 内容 → 写 inode 块（脏块 A2）
3. 在父目录加 entry → 写目录块（脏块 B）
```

依赖：A1 → A2 → B（B 必须等 A2，A2 必须等 A1）。

崩溃时盘上可能出现的状态：

- 三块都没写：跟没创建一样，干净
- A1 写了、A2 没写：bitmap 标占用但 inode 没初始化——**空间泄漏**，但 dir 没指向它，安全
- A1+A2 写了、B 没写：inode 占用且初始化，但 dir 没指向——**孤儿 inode**，空间泄漏，安全
- 所有顺序非法的状态（如 B 先写）：被 rollback 拦住了，根本不会出现

**结论：盘上永远不会出现 dir 指向未初始化 inode 的悲剧**。

### 案例 2：删除文件的依赖反过来

删 `foo` 时 Soft Updates 强制顺序：

```
1. 从父目录删 entry → 写目录块（脏块 D）
2. 释放 inode → 写 inode 块 + inode bitmap（脏块 I）
3. 释放数据块 → 写 data bitmap（脏块 B）
```

依赖：D → I → B（绝不能颠倒）。若 B 先写、崩溃后：dir 仍指向 inode，inode 仍指向数据，但 bitmap 标"空闲"——**别的文件可能立刻覆盖这些块**。合法崩溃态最多是"目录已删、空间暂未回收"（泄漏），不会出现"指针还在、空间已给别人"。

### 案例 3：fsck 从"必须"变成"后台清扫"

传统 FFS 崩溃后必须先跑 fsck 全盘扫——可能数小时不可用。Soft Updates 后盘上始终一致，挂载零等待；fsck 退化成后台慢扫，回收"标占用但没人指"的孤儿块/inode。

### 案例 4：rollback 一次具体细节

内存紧、必须先写目录块 D，但 inode 块 I 未写：

```
1. 复制 D → D2；把 D2 里指向 inode N 的 entry 清零（rollback）
2. 写 D2——盘上像"目录里没有这条"，合法
3. 丢弃 D2；内存里原始 D（含 entry）仍待写
4. 等 I 写盘后，再把含 entry 的 D 写盘
```

rollback 只动内存副本：应用仍看见这条 entry，磁盘短暂不见——这是"盘上一致"与"内存一致"分离的关键技巧。

## 踩过的坑

1. **依赖图循环是实现地狱**：论文一半篇幅在讲怎么拆循环。FreeBSD 实现里 `ffs_softdep.c` 有 7000+ 行，是 UFS 模块里最大的一个文件。
2. **不保护文件数据**：Soft Updates 只管元数据。文件 `data` 块崩溃前没刷盘就丢了——和 journal 默认模式（ordered）一样不保护数据。要保护数据得用 journal data 模式或 ZFS。
3. **空间会"泄漏"**：崩溃后可能有些块/inode 被标占用但没人指——这些空间得后台回收。FreeBSD 早期靠 `bgfsck`（background fsck），慢且耗 IO。
4. **SU+J 是工程妥协**：2010 年 Jeff Roberson 在 Soft Updates 上叠了一小段 journal——只记 free-space 修复信息（约 16MB），崩溃后 5 秒内回放完，省掉 bgfsck。这才是 FreeBSD UFS2 现在的默认。

## 适用 vs 不适用场景

**适用**：

- 本地 UFS 类文件系统、元数据密集（大量 create/unlink），想避开 journal 每次元数据双写
- 团队能维护约 7000 行 softdep（`ffs_softdep.c` 量级），且内核可控 buffer cache 写出顺序
- 可接受崩溃后少量空间泄漏、靠后台回收，换取挂载零等待

**不适用**：

- 分布式文件系统（依赖跟踪跨节点爆炸）
- 必须严格保护文件 data → journal data 或 [[lfs-1991]] / ZFS / btrfs 的 copy-on-write
- 要代码量小、易维护 → 直接走 [[aries-1992]] 式 journal（约一个数量级更短）

## 历史小故事（可跳过）

- **1994**：Ganger & Patt 在 SOSP 发短文，提出 Soft Updates 思路
- **1999**：McKusick 等把实现并进 FreeBSD UFS，工业首次落地
- **2000**：完整长文发 ACM TOCS（本笔记主来源）
- **2010**：Roberson 的 SU+J 叠一小段 free-space journal，省掉 bgfsck；UFS2 默认至今

## 学到什么

1. **顺序就是一种保护**：安排写盘顺序 + 关键时刻临时回滚，磁盘任意快照都可合法，不必双写 journal
2. **正确性 vs 简洁性**：设计上更强调盘上始终合法，工程上输给 journal——Linux 选 ext3 是 7000 行 vs 约 700–2000 行
3. **崩溃一致性可以"事后清扫"**：盘上一致，孤儿块后台回收；挂载前数小时 → 零等待
4. **理论到默认要十六年**：1994 短文 → 1999 落地 → 2000 论文 → 2010 SU+J 妥协

## 延伸阅读

- 论文 PDF：[Ganger et al. 2000](https://www.mckusick.com/publications/softupdates.pdf)（约 28 页，节奏适中）
- McKusick 的回顾访谈：[A Conversation with Kirk McKusick](https://queue.acm.org/detail.cfm?id=1755774)（讲 SU 在 FreeBSD 的落地史）
- SU+J 设计文档：[McKusick & Roberson, "Journaled Soft-updates"](https://www.mckusick.com/BSDCan/bsdcan2010.pdf)
- [[aries-1992]] —— 数据库 WAL 思想，journal FS 的理论祖先
- [[ffs-1984]] —— FFS 是 Soft Updates 的宿主文件系统
- [[lfs-1991]] —— 走"全日志、永远顺序写"的另一条路

## 关联

- [[ffs-1984]] —— Soft Updates 是 FFS 的崩溃一致性补丁
- [[aries-1992]] —— ARIES 给 DB 提供 WAL 思想，journal FS 沿用；Soft Updates 是反方向尝试
- [[lfs-1991]] —— LFS 用 copy-on-write 顺序写绕过原地修改问题，思路和 SU 平行但不同
- [[gfs]] —— 分布式 FS 用主从 replica + 操作日志解决一致性，是另一种维度
- [[hdfs-2010]] —— HDFS 借鉴 GFS，元数据放 NameNode 内存 + edit log，与 SU 思路截然不同

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[aries-1992]] —— ARIES 1992 — 数据库崩溃后怎么把账目对回来
- [[gfs]] —— GFS — 编译器决定不做哪些事
- [[hdfs-2010]] —— HDFS — 把 GFS 用 Java 重写一遍并撑到 25 PB
- [[lfs-1991]] —— LFS 1991 — 把整个磁盘当日志写

