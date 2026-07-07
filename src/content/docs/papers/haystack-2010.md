---
title: Haystack 2010 — Facebook 小文件照片存储
来源: 'Doug Beaver et al., "Finding a Needle in Haystack: Facebook''s Photo Storage", OSDI 2010. https://www.usenix.org/legacy/event/osdi10/tech/full_papers/Beaver.pdf'
日期: 2026-07-07
分类: 数据库
难度: 中级
---

## 是什么

Haystack 是 Facebook 为照片系统做的对象存储，目标很朴素：**让一张小照片被读出来时，磁盘只忙着读照片本身，而不是先翻一堆目录和 inode**。日常类比：普通文件系统像把每张照片单独装进一个信封，再把信封放进抽屉；Haystack 像把很多照片顺序贴进一本相册，再在桌上放一张目录卡，直接告诉你第几页第几厘米。

这篇论文的核心不是炫技，而是回答一个经典问题：为什么"通用文件系统"在海量小文件场景下不够用。通用系统要支持目录、权限、修改、随机写、各种边界情况；照片服务只需要写一次、读很多次、几乎不修改。

Haystack 的做法是把许多照片追加进一个大文件，给每张照片一个很小的内存索引：照片 id → 文件偏移量和大小。这样读图时先查内存，再 seek 到磁盘位置，少掉传统文件系统的元数据 I/O。

## 为什么重要

不理解 Haystack，下面这些事都不好解释：

- 为什么海量小文件会把文件系统拖慢：慢的常常不是数据本身，而是目录和 inode 元数据。
- 为什么对象存储经常牺牲 POSIX 语义：通用能力越多，单个请求背后的固定成本越高。
- 为什么 CDN 不能解决所有图片访问：热门图片能缓存，长尾老照片仍会打到后端存储。
- 为什么 [[f4-2014]] 要接在 Haystack 后面：Haystack 解决"热/温照片怎么快读"，f4 进一步解决"旧照片怎么省容量"。

## 核心要点

Haystack 的设计可以记成三句话：

1. **把小文件合成大文件**。类比：不要给每张发票单独买文件夹，而是按时间贴进一本账本。磁盘看到的是少量大文件，文件系统元数据就少很多。

2. **把寻址元数据压进内存**。类比：真正常用的是书签，不是整本书的装帧说明。Haystack 平均每张缩放后的照片只需要很少的内存索引，比传统 inode 轻得多。

3. **只支持刚好够用的操作**。类比：自助取餐窗口只负责出餐，不负责让你在窗口改菜谱。Store 主要支持 read、write、delete，修改照片用追加新 needle 处理。

这三个选择合起来，就是"用工作负载反推存储接口"：照片系统需要的是低成本高吞吐读图，不是一个万能文件系统。

## 读论文抓手

读这篇可以先抓住四个名词：

- **Directory**：像前台登记簿，记录逻辑卷到物理机器的映射，也负责把新写入分散到不同 Store。
- **Store**：像真正的仓库，磁盘上放大文件，内存里放照片位置索引。
- **Cache**：像店门口的热卖货架，只接住最近上传、很可能马上被看的照片。
- **Needle**：一张照片在大文件里的包装单元，包含 key、大小、数据、校验和、删除标记等字段。

先看这四个角色，再看读路径和写路径，整篇论文会清楚很多。

## 实践案例

### 案例 1：普通小文件为什么多做磁盘 I/O

```python
def read_photo_old(path):
    dir_block = disk.read("directory block")  # 找文件名
    inode = disk.read(dir_block.inode_of(path))  # 找位置
    return disk.read(inode.data_blocks)  # 读照片
```

逐部分解释：

- 第 1 次读目录，是为了把文件名翻译成 inode 编号。
- 第 2 次读 inode，是为了知道照片数据在磁盘哪里。
- 第 3 次才真正读照片；小图越多，前两步越浪费。

### 案例 2：Haystack 读图时怎么省掉元数据 I/O

```python
def read_photo_haystack(photo_id, kind):
    offset, size = memory_index[(photo_id, kind)]
    needle = volume_file.read_at(offset, size)
    assert checksum(needle.data) == needle.checksum
    return needle.data
```

逐部分解释：

- `memory_index` 是内存里的小目录，不需要先碰磁盘。
- `read_at` 直接跳到大文件里的偏移量。
- checksum 用来确认读出来的数据没有损坏。

### 案例 3：追加写如何处理"修改照片"

```python
def rotate_photo(photo_id, kind, new_bytes):
    old = memory_index[(photo_id, kind)]
    mark_deleted(old.offset)
    new_offset = volume_file.append(make_needle(photo_id, kind, new_bytes))
    memory_index[(photo_id, kind)] = (new_offset, len(new_bytes))
```

逐部分解释：

- Haystack 不原地覆盖旧照片，因为随机改写会让系统复杂。
- 新版本作为新 needle 追加到文件末尾。
- 旧空间暂时浪费，之后由 compaction 扫描并回收。

## 踩过的坑

1. **以为小文件慢是因为图片小**：真正问题是每张图片都带来目录、inode、权限等固定元数据成本。
2. **以为加缓存就够了**：CDN 和内部 Cache 对热门内容有效，但长尾请求大多还是会落到 Store。
3. **忽略删除和重复版本**：追加式系统必须有 compaction，否则被删除和被替换的 needle 会一直占空间。
4. **照搬到强更新业务**：如果对象频繁修改、随机写、要求 POSIX 语义，Haystack 的简化接口会变成限制。

## 适用 vs 不适用场景

**适用**：

- 海量小对象：图片、头像、缩略图、附件预览。
- 写一次、读很多次、几乎不原地修改的数据。
- 读请求很多，但能通过 id 精确定位对象的系统。
- 愿意用后台 compaction 和批量修复换取前台读写简单的团队。

**不适用**：

- 需要目录遍历、权限继承、rename、随机覆盖写的通用文件系统。
- 事务型数据库主存储，尤其是小范围频繁更新的 OLTP。
- 数据会被复杂查询扫描的场景，Haystack 只知道按 key 取对象。
- 集群很小、文件数量不多时，自研对象存储的维护成本不划算。

## 历史小故事（可跳过）

- **2000s 中期**：社交网站图片量爆炸，单纯依赖 NAS + NFS 开始被目录和 inode 元数据拖住。
- **2008 年前后**：Haystack 在 Facebook 生产环境使用，服务照片长尾请求，减少对外部 CDN 的依赖。
- **2010 年**：Beaver 等人在 OSDI 发表 Haystack 论文，公开"把小照片塞进大文件 + 内存索引"的设计。
- **2014 年**：[[f4-2014]] 发表，把已经变冷的旧照片迁到纠删码存储，继续压低容量成本。
- **之后**：SeaweedFS、图片对象存储、很多日志式小对象系统，都能看到 Haystack 的影子。

## 学到什么

1. **通用性有成本**：POSIX 文件系统为了支持所有场景，会为每个小文件携带很多照片服务用不上的元数据。
2. **瓶颈要按请求路径拆**：一次读图到底碰了几次磁盘，比"用了什么高级存储"更重要。
3. **少量内存能换大量磁盘 I/O**：把最小必要索引放进 RAM，可以让磁盘主要服务真实数据。
4. **系统设计来自工作负载**：Haystack 能成立，是因为照片写一次、读多次、很少修改；离开这个前提就要重算。

## 延伸阅读

- 论文 PDF：[Finding a Needle in Haystack: Facebook's Photo Storage](https://www.usenix.org/legacy/event/osdi10/tech/full_papers/Beaver.pdf)（14 页，重点看 2、3、4 节）
- USENIX 页面：[OSDI 2010 Haystack](https://www.usenix.org/legacy/event/osdi10/tech/)（会议论文入口）
- [[gfs]] —— 大文件、追加写、弱 POSIX 语义的另一条经典路线
- [[nfs-1985]] —— Haystack 之前方案依赖的网络文件系统背景
- [[f4-2014]] —— Facebook 后续把旧照片搬到更省空间的温数据存储
- [[silt-2011]] —— 同样关注"大量小对象的索引如何省内存"

## 关联

- [[gfs]] —— 都是从工作负载出发，主动放弃通用文件系统的一部分语义。
- [[nfs-1985]] —— Haystack 的反面教材：通用远程文件接口在海量小图下元数据成本太高。
- [[f4-2014]] —— Haystack 负责快读照片，f4 负责把冷下来的 BLOB 存得更省。
- [[hdfs-2010]] —— HDFS 更偏大文件批处理，Haystack 则瞄准大量小图片随机读。
- [[azure-storage-2011]] —— 云对象存储的另一种工业答案，强调强一致和多租户服务化。
- [[silt-2011]] —— 两者都把"索引能不能放进内存"当成核心设计问题。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

