---
title: Umbra: A Disk-Based System with In-Memory Performance
来源: https://www.cidrdb.org/cidr2020/papers/p29-neumann-cidr20.pdf
日期: 2026-06-13
分类: 数据库
子分类: 现代数据库
provenance: pipeline-v3
---

# Umbra: 一个拥有内存性能的磁盘数据库

## 一、从"快递柜"说起

想象你有一个巨大的快递柜（这就是你的电脑内存 / RAM），快递柜里能放下的包裹，你可以伸手直接拿到。但如果包裹太多，快递柜放不下怎么办？

传统数据库的做法是：在快递柜旁边再堆一堆纸箱（硬盘）。每次要取包裹，你得先翻纸箱，找到后再搬到快递柜里，这个过程很慢。

Umbra 的核心思想就一句话：**把快递柜做大一点，把搬箱子的手速也练快一点**。具体来说：

- 快递柜（内存）放不下时，用固态硬盘（SSD）当"超级大纸箱"
- SSD 的读取速度已经快到每秒几个 GB，接近内存了
- 设计一个聪明的缓冲管理器，让"从 SSD 取数据"这件事几乎感觉不到延迟

论文作者 Thomas Neumann 来自德国慕尼黑工业大学。Umbra 是他之前写的纯内存数据库 HyPer 的"升级版"——从纯内存变成了"内存 + SSD"混合架构。

## 二、核心概念拆解

### 概念 1：可变大小页面（Variable-Size Pages）

传统数据库的缓冲管理器使用固定大小的页面（比如每个页面都是 8KB）。这就好比快递柜里每个格子都一样大——大包裹塞不进，小包裹又浪费空间。

Umbra 的缓冲管理器支持不同大小的页面，从 64KB 到 512KB 不等，按"尺寸等级"（size class）组织。大对象直接存大页面，不需要拆散。

```
Size Class 0: 512 KB 页面
Size Class 1: 256 KB 页面
Size Class 2: 128 KB 页面
Size Class 3: 64 KB 页面
```

每个尺寸等级在自己的虚拟地址空间里预留一块区域，这样虚拟地址空间不会碎片化。物理内存是否碎片化则由操作系统来处理。

### 概念 2：乐观锁（Optimistic Latching）

传统数据库里，多个线程同时读同一个页面时，每个线程都要排队等锁。Umbra 用了"乐观锁"——不排队，直接读！

具体做法：读的时候记一下页面的版本号。读完释放锁时，检查一下版本号变没变。如果没变，说明没人改过，读取有效。如果变了，说明有人并发修改了，那就重新读一遍。

```
乐观锁的工作流程：

1. 线程 A 开始读页面 X
   → 记录当前版本号 = 42
   → 不获取任何锁，直接读数据

2. 线程 B 修改页面 X
   → 获取排他锁，修改数据
   → 版本号递增为 43
   → 释放锁

3. 线程 A 读完，释放乐观锁
   → 检查版本号：现在是 43，不是 42！
   → 说明有人改过了，重新读一遍
```

### 概念 3：字符串的三段式存储

数据库里的字符串（文字）长度不一。Umbra 把字符串分成两部分：

- **头部（16字节）**：存元数据，放在列式布局的开头
- **主体**：存实际文字内容，放在页面末尾

短字符串（12字符以内）直接存在头部里，不需要额外指针。长字符串则分三种存储类别：

| 类别 | 有效期 | 例子 |
|------|--------|------|
| Persistent（持久） | 整个数据库运行期间 | 查询常量 |
| Transient（临时） | 当前工作单位期间 | 从表里读出的字符串 |
| Temporary（暂存） | 查询执行期间 | UPPER() 函数生成的字符串 |

## 三、关键代码示例

### 示例 1：版本化Latch的结构

Umbra 用一个 64 位的版本化 latch 来控制对页面的并发访问：

```
|------------------ 59 bits ------------------|---- 5 bits ----|
|              Version Counter                |    State Bits   |
```

- **Version Counter（59位）**：每次页面被修改就加 1，用于乐观锁验证
- **State Bits（5位）**：编码 latch 的状态
  - `0` = 未锁定
  - `1` = 排他锁定（独占）
  - `n+1`（n>=1）= 共享锁定（n 个线程在读）

```python
# 伪代码：乐观读取一个页面
def optimistic_read(page):
    # 1. 记录版本号（不获取任何锁）
    version = page.latch.version_counter

    # 2. 直接读取数据（零竞争！）
    data = read_page_content(page)

    # 3. 释放时验证版本号
    if page.latch.version_counter != version:
        # 并发修改发生了，重新读
        data = read_page_content(page)

    return data
```

对比传统锁的方式：

```python
# 传统方式：每个读线程都要排队等共享锁
def traditional_read(page):
    page.latch.acquire_shared()      # 排队等待！
    data = read_page_content(page)   # 拿到数据
    page.latch.release_shared()      # 释放锁
    return data
```

### 示例 2：字符串头部的结构设计

Umbra 的字符串头部只有 16 字节，但巧妙地处理了短串和长串：

```
短字符串（<= 12 字符）：
+----------+----------------------------------+
| Length   | Inline Data (最多12个字符)           |
| 4 bytes  | 12 bytes                           |
+----------+----------------------------------+

长字符串（> 12 字符）：
+----------+----------+----------------------------+
| Length   | Prefix   | Offset or Pointer (8 bytes)  |
| 4 bytes  | 4 bytes  | 前4个字符 + 定位信息         |
+----------+----------+----------------------------+
```

```python
# 伪代码：字符串比较时利用前缀快速短路
def compare_strings(str_a, str_b):
    header_a = str_a.header
    header_b = str_b.header

    # 先比长度
    if header_a.length != header_b.length:
        return header_a.length - header_b.length

    # 短字符串：头部里就有完整数据，直接比
    if header_a.inline:
        return header_a.data[:header_a.length] < header_b.data[:header_b.length]

    # 长字符串：头部前4个字符就能排除很多情况
    if header_a.prefix != header_b.prefix:
        return header_a.prefix < header_b.prefix

    # 前缀相同，再去读完整数据细比
    full_a = read_string_body(str_a)
    full_b = read_string_body(str_b)
    return full_a < full_b
```

### 示例 3：缓冲管理器的页面换入换出

Umbra 用 `pread` / `pwrite` 系统调用在 SSD 和内存之间搬运数据，用 `madvise` 告诉操作系统哪些物理内存可以回收：

```python
# 伪代码：页面换入（从 SSD 读到内存）
def pin_page(frame, page_id):
    # 1. 用 pread 直接从 SSD 读到预留的虚拟地址
    pread(fd, frame.virtual_address, offset=page_id * page_size)

    # 2. 此时操作系统自动建立虚拟地址到物理内存的映射

# 伪代码：页面换出（从内存写回 SSD）
def unpin_page(frame):
    # 1. 用 pwrite 把脏页写回 SSD
    pwrite(fd, frame.virtual_address, offset=frame.page_id * page_size)

    # 2. 告诉内核：这块物理内存可以回收了
    madvise(frame.virtual_address, page_size, MADV_DONTNEED)

    # MADV_DONTNEED 几乎零开销——虚拟地址还在，
    # 但物理内存立即释放。下次读时映射到全零页，
    # 不会分配新物理内存。
```

## 四、执行模型的调整

除了缓冲管理器，Umbra 还做了不少其他改动：

### 自适应编译策略

HyPer（前身）一上来就把查询编译成机器码，但编译本身很耗时。Umbra 采用"先解释、后编译"的策略：

1. 首次执行：把 IR 翻译成字节码，用虚拟机解释执行
2. 并行步骤的运行时引擎跟踪进度
3. 如果发现某个步骤反复执行，再交给 LLVM 编译成机器码

这样避免了"编译时间比执行时间还长"的问题。

### 轻量级 IR

Umbra 没有直接用 LLVM IR，而是实现了一个自定义的轻量级 IR。因为 LLVM 是为通用场景设计的，很多功能 Umbra 用不上，反而带来开销。自定义 IR 可以更高效地生成代码。

## 五、实验结果要点

作者在 Intel Core i7-7820X（8核16线程，64GB RAM）上，用三星 960 EVO SSD 做了测试：

- 冷数据读取吞吐量：**1.15 GB/s**（绕过缓冲管理器）
- 使用缓冲管理器后：**1.13 GB/s**（几乎无损耗）
- 当工作集全部在内存中时，性能与纯内存数据库 HyPer 相当
- 当数据超出内存时，依然能充分利用 SSD 带宽

关键结论：**瓶颈在存储吞吐量，不在缓冲管理器本身**。多加几块 SSD 就能继续提升性能。

## 六、总结

Umbra 解决了一个很实际的问题：纯内存数据库虽然快，但内存太贵且增长放缓；纯磁盘数据库便宜但慢。Umbra 找到了中间路线——

- 可变大小页面 + 乐观锁 + madvise 技巧 = 低开销缓冲管理器
- 字符串三段式存储 = 避免长字符串跨页
- 自适应编译 = 平衡编译时间和执行时间
- 最终效果：缓存命中时媲美内存数据库，未命中时也能优雅地利用 SSD 带宽

这篇论文的价值在于它证明了：**只要设计得当，磁盘数据库也可以很快，快到用户几乎感觉不到区别。**
