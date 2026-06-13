---
title: "Amber: Decoupling Access Methods from Stable Storage"
来源: https://www.cs.cmu.edu/~pavlo/courses/fall2017/static/papers/amber.pdf
日期: 2026-06-13
分类: 数据库
子分类: 存储与查询
provenance: pipeline-v3
---

# Amber: 将访问方法从持久存储中解耦

## 1. 一个日常类比

想象你去图书馆找一本书。传统数据库的做法是：书架（磁盘）和找书的方法（索引）是绑在一起的。如果书架排列方式变了，整个找书系统都得推翻重来。

Amber 的想法很简单：把"怎么找书"（访问方法 / Access Method）和"书放哪里"（稳定存储 / Stable Storage）完全分开。索引不直接存数据，而是通过一个统一接口访问底层存储。想换 B+ 树？换 LSM-Tree？换哈希索引？只需替换一层，不用动底层。

## 2. 问题背景

传统数据库（如 PostgreSQL、MySQL）把索引结构和存储 tightly coupled：

- B+ 树的页直接映射到磁盘块
- 想换一种索引结构，需要修改大量存储层代码
- 不同的索引结构对存储有不同的假设（页大小、顺序读写偏好等）
- 新的 SSD/NVMe 硬件特性难以被现有结构利用

## 3. 核心架构：三层解耦

Amber 把存储引擎拆成三层：

```
+-------------------+
|   访问方法层       |  <-- B+Tree, LSM-Tree, Hash Index 等
+-------------------+
|      SAP 层       |  <-- Storage Abstraction for Persistent storage
+-------------------+
|   稳定存储层       |  <-- SSD, NAND Flash, 磁盘等
+-------------------+
```

### 3.1 访问方法层（Access Methods）

上层模块负责数据结构逻辑：搜索、插入、删除、范围扫描。它们**不直接操作磁盘**，而是通过 SAP 层的接口读写。

### 3.2 SAP 层（Storage Abstraction for Persistent storage）

这是 Amber 的核心贡献。SAP 提供统一的键值读写接口：

- **逻辑块（Logical Blocks）**：索引不关心物理块在哪，只通过逻辑块 ID 访问
- **块映射（Block Mapping）**：SAP 负责把逻辑块映射到物理设备上
- **垃圾回收（Garbage Collection）**：独立管理空间回收
- **刷盘策略（Flush Policy）**：控制何时把数据写到底层 NVMM/SSD

### 3.3 稳定存储层（Stable Storage）

最底层，就是 SSD 或内存等物理设备。Amber 针对 NVMM（Non-Volatile Main Memory）和 SSD 做了优化，特别是利用 NVM 的写放大特性。

## 4. 关键设计决策

### 4.1 逻辑块抽象

传统 B+ 树直接读写磁盘页。Amber 的 B+ 树读写的是**逻辑块**。SAP 维护一个块映射表（类似操作系统的虚拟内存页表），把逻辑块号映射到物理设备偏移。

这意味着你可以对同一套索引结构，底层换成不同的存储介质而无需修改索引代码。

### 4.2 写合并与刷盘策略

NVM/SSD 写操作昂贵（尤其是 NVM 的耐久性）。SAP 在写入时做合并：

- 多个小写操作可以合并为一个大的顺序写
- 刷盘不是立即落盘，而是按策略批量刷
- 垃圾回收在空闲时进行，避免写放大

### 4.3 独立垃圾回收

传统数据库中，垃圾回收往往和索引结构紧密耦合。Amber 中 GC 是 SAP 层独立管理的：

- 标记哪些逻辑块已过期（如被更新或删除的条目）
- 将活跃数据拷贝到新块
- 回收旧块供后续写入使用
- 对上层索引完全透明

## 5. 代码示例

### 示例 1：SAP 的统一键值接口

这是索引层通过 SAP 读写数据的典型方式：

```c
// 通过 SAP 接口写入一个键值对
// 索引层不需要知道数据写到了哪里
sap_status_t sap_put(sap_handle_t* sap,
                     const key_t* key,
                     const value_t* val,
                     uint32_t val_len) {
    // 1. 将键值写入 SAP（逻辑块抽象）
    sap_status_t st = sap_insert(sap, key, val, val_len);

    // 2. SAP 负责：
    //    - 分配逻辑块
    //    - 映射到物理设备
    //    - 处理刷盘策略
    // 索引层完全不用关心这些细节

    return st;
}

// 通过 SAP 接口读取一个键值对
sap_status_t sap_get(sap_handle_t* sap,
                     const key_t* key,
                     value_t* out_val,
                     uint32_t* out_len) {
    // SAP 负责将逻辑块地址转换为物理地址
    // 如果块不在缓存中，SAP 从底层设备读取
    return sap_lookup(sap, key, out_val, out_len);
}
```

### 示例 2：B+ 树通过 SAP 进行节点读写

传统 B+ 树的节点直接映射到磁盘页。Amber 中的 B+ 树通过 SAP 访问节点：

```c
// 传统方式（紧耦合）：
// void btree_page_read(BPage* page, disk_block_id_t block_id) {
//     read_sectors(page, block_id * SECTOR_SIZE, SECTOR_SIZE);
//     // 直接操作磁盘 —— 换索引就要换这段代码
// }

// Amber 方式（解耦）：
void btree_node_read(BNode* node, block_id_t node_id, sap_handle_t* sap) {
    // 通过 SAP 读取节点，SAP 负责逻辑块到物理块的映射
    sap_read(sap, node_id, node->data, NODE_SIZE);
    // 节点逻辑不关心这块数据实际在 SSD 的哪个物理位置
}

void btree_node_write(BNode* node, block_id_t node_id, sap_handle_t* sap) {
    // 通过 SAP 写入节点
    sap_write(sap, node_id, node->data, NODE_SIZE);
    // SAP 可能会合并这个写操作，优化到底层设备
    // 可能是顺序写、可能是批量刷盘 —— 索引层不知道也不关心
}
```

### 示例 3：垃圾回收在 SAP 层独立完成

```c
// SAP 独立管理的垃圾回收循环
void sap_gc_loop(sap_handle_t* sap) {
    while (1) {
        // 1. 找出过期的逻辑块（被更新或删除的数据）
        list_t* expired_blocks = find_expired_blocks(sap);

        // 2. 将活跃数据迁移到新块
        for each block in expired_blocks {
            list_t* live_entries = extract_live_data(block);
            block_id_t new_block = allocate_block(sap);
            for each entry in live_entries {
                sap_write_entry(sap, new_block, entry);
            }
            // 3. 更新块映射表：逻辑块 -> 新物理块
            update_block_map(sap, block, new_block);
        }

        // 4. 回收旧物理块
        release_physical_blocks(sap, expired_blocks);

        // 5. 如果没有太多垃圾，睡眠等待
        if (list_length(expired_blocks) == 0) {
            sleep(GC_COOLDOWN);
        }
    }
}
```

## 6. 实验结论（论文发现）

- **性能**：Amber 在 NVMM/SSD 上相比传统紧耦合方案有显著性能提升，特别是写密集型场景
- **灵活性**：更换访问方法（B+ Tree → LSM-Tree）无需修改存储层代码
- **硬件友好**：SAP 层的写合并和垃圾回收策略更好地利用了 NVM 特性，减少写放大
- **通用性**：同一套 SAP 接口支持多种访问方法，证明了**解耦优于紧耦合**

## 7. 个人思考

Amber 的核心洞察是"逻辑与物理的分离"——这和我们理解计算机分层的思想一致：

| 领域 | 逻辑层 | 物理层 |
|------|--------|--------|
| 操作系统 | 虚拟内存 | 物理内存/磁盘 |
| 文件系统 | 文件/目录 | 磁盘块 |
| 数据库（传统） | 索引 | 磁盘页（紧耦合） |
| 数据库（Amber） | 索引 | 稳定存储（解耦） |

Amber 本质上是把操作系统的"虚拟内存"思想引入了数据库索引层。这一思想后来影响了更多存储引擎设计，如 LevelDB/RocksDB 的分层架构。

## 8. 下一步学习方向

1. 对比学习 SAP 层的后续工作（如 Saphira、HySTOR 等）
2. 研究 RocksDB 的 LSM-Tree 实现，看它如何体现类似的解耦思想
3. 了解 NVM（非易失性内存）硬件特性如何影响数据库存储设计
