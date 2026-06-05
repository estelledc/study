---
title: Haystack — Facebook 十亿张照片怎么存
来源: 'Beaver et al. "Finding a Needle in Haystack: Facebook Photo Storage". OSDI 2010'
日期: 2026-06-06
分类: 数据库
子分类: 存储与查询
难度: 中级
---

## 是什么

Haystack 是 Facebook 2010 年设计的 **专用照片对象存储系统**。当时 Facebook 有**数十亿张**小图片，传统「磁盘文件系统 + NFS + 独立图片服务器」架构里，**元数据（inode、目录项）** 比照片本身还占内存，读一张图要多次 I/O。

日常类比：图书馆如果每本书单独一个房间、一张登记表，书越多管理成本爆炸。Haystack 把成千上万张照片**打包进大文件**，用一张紧凑的「索引卡」就能定位任意一张——像把明信片塞进一本厚相册，而不是每张单独一个文件夹。

## 为什么重要

不懂 Haystack，下面这些事说不清：

- 为什么「通用文件系统不够用」不是口号——十亿小文件的 inode 能把内存吃光
- 为什么对象存储（S3、MinIO）和 Haystack 是同一思想脉络
- 为什么 CDN 回源布局要和存储格式一起设计
- 为什么 [[milvus-2021]] 这类 purpose-built 系统总在重复「专用 > 通用」的故事

## 核心要点

1. **小文件噩梦**：每个文件在 ext3/NFS 上有 inode、目录项、块指针——文件越小，元数据开销占比越高。类比：寄一封信却用一个大箱子装运单。

2. **Haystack 文件布局**：多个照片**顺序追加**进大 container 文件，用固定大小的 needle 记录（offset + size + key）定位。读一张图 ≈ **一次 I/O**。

3. **与 CDN 协同**：存储格式考虑边缘节点回源效率——专用存储不是孤立设计，而是和访问路径绑在一起。

## 实践案例

### 案例 1：传统路径 vs Haystack 读图

```text
# 传统 NFS 路径（简化）
open("/photos/user123/abc.jpg")  → 查目录项 → 查 inode → 读数据块  (多次 I/O + 元数据)

# Haystack 路径
lookup(photo_id) → 读 needle 头得 offset → 一次 read(container, offset, size)
```

### 案例 2：needle 记录结构（概念示意）

```c
struct needle {
    uint64_t key;      // 照片 ID
    uint32_t offset;   // 在 container 中的位置
    uint32_t size;     // 字节长度
    uint32_t checksum;
};
// 百万张照片的索引 ≈ 百万条固定大小记录，可 mmap 常驻内存
```

**解释**：固定大小索引让内存占用可预测，远小于百万个完整 inode。

### 案例 3：与向量库的 purpose-built 类比

```text
通用 FS 存小图  ≈  PostgreSQL 存十亿向量   → 元数据/索引爆炸
Haystack        ≈  Milvus purpose-built     → 为访问模式重新设计布局
```

同一设计哲学，不同数据类型（见 [[milvus-2021]]）。

## 踩过的坑

1. **把 Haystack 当可随意改写的 POSIX FS**：追加写友好，原地改小文件不友好。

2. **忽略删除与垃圾回收**：逻辑删除要 compaction，否则 container 膨胀。

3. **跨机房不复制索引**：needle 映射要和 container 一致性维护。

4. **以为 S3 已经解决一切**：S3 是 API 层；Haystack 讲的是**底层布局**为何必须专用。

## 适用 vs 不适用场景

**适用**：
- 海量小文件、读多写少（照片、缩略图、图标）
- 需要极低延迟随机读
- 愿意牺牲 POSIX 语义换吞吐

**不适用**：
- 大文件流媒体（用对象存储分片即可）
- 频繁原地更新的小记录
- 单机小规模——ext4 足够

## 历史小故事（可跳过）

- **2000s**：Web 2.0 照片站爆发，NFS + 图片服务器成标配。
- **2010 OSDI**：Facebook 发表 Haystack，元数据问题被系统性解决。
- **之后**：对象存储普及，S3/MinIO 吸收类似思想。
- **今天**：仍是「专用存储」课程必读书，与 [[milvus-2021]] 并列案例。

## 学到什么

1. **访问模式决定存储格式**——十亿小文件不是「大文件缩小版」
2. **元数据往往是真正的瓶颈**，不是磁盘带宽
3. **一次 I/O 读完整对象是核心 KPI**
4. **purpose-built 思想可迁移到向量、日志、时序等场景**

## 延伸阅读

- 论文 PDF：[OSDI 2010 Haystack](https://www.usenix.org/legacy/event/osdi10/tech/full_papers/Beaver.pdf)
- [[milvus-2021]] —— 另一类 purpose-built：向量检索
- [[haystack]] —— 相关项目/工具条目
- 书：《Designing Data-Intensive Applications》对象存储章节

## 关联

- [[milvus-2021]] —— 同样「通用不够用，专用重来」
- [[haystack]] —— 名称相关的检索/工具生态
- [[milvus]] —— 现代向量专用存储代表

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
