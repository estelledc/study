---
title: ZFS — 不信任硬盘的「水池式」文件系统
来源: https://www.cs.hmc.edu/~rhodes/courses/cs134/papers/zfs.pdf
日期: 2026-06-13
子分类: 内核与虚拟化
分类: 操作系统
provenance: pipeline-v3
---

## 先想成什么事

想象你经营一家**大型自助仓储公司**（这就是 ZFS 管磁盘的方式）：

- 以前的做法：每块硬盘像一间独立仓库，要先租房间、再贴门牌、再登记账本——分区、格式化、挂载，三步缺一不可。
- ZFS 的做法：把所有硬盘倒进一个**大水池**（storage pool），客户（应用）只问「我要 10GB 放照片」，系统从池里划一块就行，不用关心水来自哪根管子。

更关键的是，这家仓储公司有一条铁律：**绝不相信仓库管理员（硬盘）口头汇报**。每件货物入库时当场称重贴条码（校验和），出库时再称一次；对不上就从备用副本里捞真货。Jeff Bonwick 等人在 2003 年 USENIX FAST 论文《The Zettabyte File System》里，把这套哲学写进了文件系统本体。

论文作者：Matt Ahrens、Jeff Bonwick、Val Henson、Mark Maybee、Mark Shellenbaum（Sun Microsystems）。2005 年随 OpenSolaris 开源，今天由 OpenZFS 社区维护，跑在 FreeBSD、Linux、macOS（间接通过 APFS 思想）和无数 NAS 上。

## 这篇论文在说什么

| 维度 | 内容 |
|------|------|
| 会议 | 1st USENIX Conference on File and Storage Technologies (FAST)，2003 年 3 月，旧金山 |
| 机构 | Sun Microsystems |
| 命名由来 | Zettabyte = 10²¹ 字节；论文用 128 位地址空间，容量远超当时任何现实需求 |
| 口号 | "The Last Word in File Systems" — 把卷管理、RAID、快照、校验合成一层 |

论文要回答的核心问题：

1. 当磁盘以 PB 计、廉价 SATA 盘静默坏块频发时，**文件系统还能假设「读到的就是写下的」吗？**
2. 能否**消灭 fsck**——让磁盘上的状态在任何时刻都自洽？
3. 能否把「分区 / 卷 / RAID / 文件系统」四层管理**压成一层 API**？

## 为什么值得读（零基础也能建立图景）

即使你从未装过 TrueNAS，这篇 2003 年的论文也能帮你理解今天存储栈里反复出现的模式：

- **APFS**（macOS）的快照、**Btrfs**（Linux）的子卷、**Docker** 的分层镜像——都能追溯到 ZFS 的写时复制（Copy-on-Write）。
- 云厂商强调的「端到端数据完整性」——ZFS 第一个把**每块数据的校验和**放进文件系统，而不是交给 RAID 卡或应用层。
- 「静默数据损坏」（silent data corruption / bit rot）成为运维术语——因为 ZFS 的 `zpool scrub` 让大家第一次**量**到了硬盘在撒谎。

## 核心概念一：池化存储（Pooled Storage）

传统路径：

```
磁盘 → 分区 → 卷（LVM）→ mkfs → mount → 目录
```

ZFS 路径：

```
磁盘 → zpool create → zfs create → 直接用
```

**日常类比**：传统方式像给每个应用单独买饮水机；ZFS 像整栋楼一根总水管，各户按流量计費。加硬盘 = 往水池注水，不必重新分区搬家。

论文强调：池化对存储的意义，类似虚拟内存对 RAM 的意义——应用不再绑定物理设备，管理员在池层面做冗余和扩容。

## 核心概念二：写时复制（Copy-on-Write）

ZFS 三条铁律（论文原文精神）：

1. **永不覆盖仍在使用的数据块**
2. **所有变更事务化**——相关元数据要么一起提交，要么一起回滚
3. **磁盘上任意时刻的状态都有效**——没有「写了一半」的窗口

写一个新版本的四步（论文 Figure）：

```
1. 初始块树          2. COW 数据块
        [root]              [root]
         / \                 / \
      [A] [B]             [A][B'][B]
3. COW 间接块         4. 原子重写 uberblock
     [root']              [root'']
      /  \                  /  \
   [A][B']            [A][B']
```

旧块 `[B]` 仍留在盘上，直到没有引用——**快照因此几乎零成本**：快照只是多一个指向旧树根的指针，不复制数据。

**对比日志文件系统（journaling）**：ext4 先写日志再写原位；ZFS 根本不原位写，所以**不需要单独 journal**。论文作者说，早期有人断言「不可能做出不需要 fsck 的文件系统」——这反而成了动力。

## 核心概念三：端到端校验和（Checksum Tree）

传统磁盘校验的问题：

| 方式 | 校验和存在哪 | 能发现什么 | 发现不了什么 |
|------|-------------|-----------|-------------|
| 磁盘块内自带 CRC | 和数据同一块 | 块内自洽 | phantom write、指错块 |
| **ZFS 父块指针** | 父块的 pointer 里 | 数据与地址均被验证 | — |

ZFS 把每个子块的 256-bit 校验和存在**父块**里，整棵树形成自验证的 **Merkle 树**。根叫 **uberblock**，原子切换。

论文列举可检测的故障路径：

- 位衰减（bit rot）
- 幽灵写（phantom writes）
- 读写指向错误 LBA（misdirected I/O）
- DMA 奇偶错误
- 驱动 bug
- 误覆盖

读路径：**先验 checksum，再信数据**。对不上就查镜像或 RAID-Z 副本——**自愈（self-healing）**在读取时自动完成，不必等管理员周末跑 fsck。

## 核心概念四：RAID-Z

传统 RAID-5 的「写洞」（write hole）：条带写到一半断电，数据与校验不一致，且无法判断哪块是旧的。

ZFS 的 RAID-Z 解法：

- **每个逻辑块是独立条带**——可变条带宽度（512 B – 128 KB）
- **每次写都是完整条带写**（full-stripe write）——配合 COW，没有 read-modify-write
- **校验和驱动的组合重建**——丢块时穷举候选，用 checksum 验证哪个组合正确

论文还提到单 parity 与双 parity（后来发展为 RAID-Z2/Z3）。口号：**ZFS loves cheap disks**——用软件栈集成替代昂贵 RAID 卡，因为完整性不依赖硬件声称的「可靠」。

## 核心概念五：快照、克隆与 Scrub

| 特性 | 机制 | 日常类比 |
|------|------|----------|
| **快照** | 保留旧块树根指针 | 给仓库拍一张库存清单，不复制货物 |
| **克隆** | 可写快照 | 从清单分叉出一个可改动的分仓 |
| **Scrub** | 后台遍历全池读+验 checksum | 盘点员每月走一圈，发现霉变立刻换副本 |
| **Resilver** | 换盘后只同步有效数据 | 新保安上岗只学「还在架上的货」，不复印历史垃圾 |

## 代码示例一：从零建池到快照回滚

以下命令在 FreeBSD / Linux（OpenZFS）上通用，展示论文「池化 + COW 快照」的用户态接口：

```bash
# 三块盘组成 RAID-Z 池（单盘奇偶，类似 RAID-5 但无写洞）
sudo zpool create -f tank raidz /dev/sda /dev/sdb /dev/sdc

# 在池上创建文件系统——无需 mkfs，空间按需增长
sudo zfs create tank/home
sudo zfs create tank/home/alice

# 写入一些数据
echo "important thesis draft" | sudo tee /tank/home/alice/thesis.txt

# 瞬间快照：不复制数据，只多一个块树引用
sudo zfs snapshot tank/home/alice@before-edit

# 模拟误删
sudo rm /tank/home/alice/thesis.txt

# 回滚到快照——COW 让旧块仍在
sudo zfs rollback tank/home/alice@before-edit
cat /tank/home/alice/thesis.txt   # 文件回来了

# 查看空间：快照只占「与当前版本的差异」
zfs list -t snapshot
```

`zfs snapshot` 在论文模型里对应「冻结一棵块指针树的根」；`rollback` 则是把活跃根指针指回旧 uberblock  lineage。

## 代码示例二：用 Python 模拟 COW 块树与校验

下面不是 ZFS 源码，而是帮助理解论文 Figure「四步 COW 提交」的极简模型：

```python
import hashlib
from dataclasses import dataclass, field
from typing import Dict, Optional

def checksum(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

@dataclass
class Block:
    data: bytes
    children: Dict[str, "Block"] = field(default_factory=dict)
    child_csums: Dict[str, str] = field(default_factory=dict)

    def verify_children(self) -> bool:
        for name, child in self.children.items():
            expected = self.child_csums.get(name)
            actual = checksum(child.data)
            if expected != actual:
                return False
        return True

def cow_update(root: Block, path: str, new_data: bytes) -> Block:
    """沿路径复制节点，叶子写入新数据——永不原地覆盖。"""
    if "/" not in path:
        new_root = Block(data=root.data, children=dict(root.children),
                         child_csums=dict(root.child_csums))
        new_leaf = Block(data=new_data)
        new_root.children[path] = new_leaf
        new_root.child_csums[path] = checksum(new_data)
        return new_root
    head, tail = path.split("/", 1)
    new_root = Block(data=root.data, children=dict(root.children),
                     child_csums=dict(root.child_csums))
    new_root.children[head] = cow_update(root.children[head], tail, new_data)
    new_root.child_csums[head] = checksum(new_root.children[head].data)
    return new_root

# 初始树：root -> docs -> file
leaf = Block(data=b"version-1")
mid = Block(data=b"inode", children={"file": leaf},
            child_csums={"file": checksum(leaf.data)})
root = Block(data=b"uber", children={"docs": mid},
             child_csums={"docs": checksum(mid.data)})

# COW 写入 version-2；root' 指向新叶子，旧叶子仍可被快照引用
root_v2 = cow_update(root, "docs/file", b"version-2")
assert root_v2.verify_children()
assert root.children["docs"].children["file"].data == b"version-1"  # 旧数据仍在
```

真实 ZFS 用 **uberblock 指针的原子 128-bit 切换**提交新根；上面省略了间接块层级和事务组（TXG），但抓住了论文核心：**改数据 = 建新树 + 换根，旧树自然成为历史**。

## 代码示例三：Scrub 与自愈（运维侧）

```bash
# 每月巡检：读遍池中每个块并验证 checksum
sudo zpool scrub tank

# 查看是否发现静默错误并已修复
sudo zpool status -v tank
# 典型输出片段：
#   scan: scrub repaired 8K in 02:15:00 with 0 errors on Sun Jun  1 03:00:00 2026

# 压缩与去重（论文后续版本扩展；生产环境 dedup 吃内存需谨慎）
sudo zfs set compression=lz4 tank/home
```

`scrub repaired` 一行正是论文「读取时自愈」的用户可见证据：镜像或 RAID-Z 副本提供了好块，坏块被透明替换。

## 性能设计（论文简述）

COW 听起来像「随机写变慢」，但 ZFS 用几招抵消：

- 随机写**聚合成顺序写**（新块追加分配）
- **动态条带化**横跨池内所有磁盘
- 可变块大小（512 B – 128 KB）匹配负载
- 流水线化 I/O 与优先级调度

论文测量显示，在典型企业负载下，集成栈的吞吐量可与传统 UFS + 硬件 RAID 竞争——代价是 RAM 用于 ARC 缓存和元数据。

## 踩过的坑（读论文时该知道的现实）

1. **内存**：ARC 缓存默认可占用大量 RAM；`zfs set dedup=on` 更凶，家用 NAS 常关闭 dedup。
2. **扩容语义**：早年不能给现有 RAID-Z vdev「加一块盘」；需加新 vdev 或整池重建（OpenZFS 近年才补齐部分 expansion 能力）。
3. **许可**：CDDL 与 Linux GPL 不兼容，ZFS 至今非 Linux 主线模块——这是 Btrfs 存在的政治原因，不是技术原因。
4. **小随机写延迟**：数据库单文件极致 IOPS 场景，有人仍选 XFS/ext4 + 硬件 RAID。

## 适用 vs 不适用

**适用**：

- 多盘 NAS、备份服务器、虚拟机存储（快照/克隆）
- 不能接受静默坏块的生产数据（配合 scrub）
- 需要「一条命令」管冗余 + 文件系统

**不适用**：

- 单盘嵌入式、RAM 极度受限
- 必须在 Linux 主线内核内零模块部署
- 纯顺序写带宽竞赛且不需快照

## 历史坐标

- **1991** [[lfs-1991]]：日志结构文件系统提出「顺序写、垃圾回收」——ZFS COW 的精神前辈
- **2003**：本篇论文，FAST 首届
- **2007**：Btrfs 启动，设计明显参考 ZFS
- **2017**：Apple APFS 发布，COW + 快照成为桌面默认
- **今天**：OpenZFS 2.x 统一 FreeBSD/Linux 分支

## 学到什么

1. **不信任硬件**是文件系统级的设计选择，不是运维口号——校验和必须在**离开 CPU 之前**就算好。
2. **COW + 事务 uberblock** 同时消灭了 fsck 窗口和廉价快照，这是同一枚硬币的两面。
3. **集成栈**（FS + 卷 + RAID 一体）让 RAID-Z 能做传统 RAID-5 做不到的全条带写——分层接口会锁住次优解。
4. 好技术 + 错误许可时机 = 别人抄思路抄市场；读论文也要读**生态**。

## 延伸阅读

- 论文 PDF：[The Zettabyte File System (Bonwick et al., FAST 2003)](https://www.cs.hmc.edu/~rhodes/courses/cs134/papers/zfs.pdf)
- USENIX 会议页：[FAST '03 ZFS](https://www.usenix.org/conference/fast-03/zettabyte-file-system)
- OpenZFS 文档：[https://openzfs.github.io/openzfs-docs/](https://openzfs.github.io/openzfs-docs/)
- Bonwick & Moore 访谈（设计原则原文）：[Conversation on ZFS](https://www.xigmanas.com/wiki/lib/exe/fetch.php?media=faq%3Aconversation_bonwick_moore.pdf)

## 关联

- [[zfs-2003]] —— 同主题姊妹笔记（侧重运维命令与踩坑）
- [[lfs-1991]] —— 日志结构文件系统，COW 的思想先驱
- [[gfs]] —— Google 在分布式侧用另一条路解决完整性
- [[hdfs-2010]] —— 块校验放在分布式文件系统层

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
