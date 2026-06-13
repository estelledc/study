---
title: HyPer - A Hybrid OLTP and OLAP Main Memory DBMS
来源: https://db.in.tum.de/~kemper/papers/HyperICDE11.pdf
日期: 2026-06-13
分类: 数据库
子分类: 存储与查询
provenance: pipeline-v3
---

# HyPer：一个混合 OLTP 与 OLAP 的内存数据库

## 一、为什么要同时做 OLTP 和 OLAP？

想象一家电商公司。它的网站每天收到百万次请求——用户下单、查库存、付款，这些操作要求**极快响应**（毫秒级），每次只改动几条记录。这就是 OLTP（联机事务处理）。

同一时间，运营团队需要知道"上个月哪个地区的销售额最高"、"哪些商品经常一起被购买"，这类查询要扫描**整张表甚至多张大表**，做复杂的聚合和连接。这就是 OLAP（联机分析处理）。

在传统架构里，这两件事是分开的：

- OLTP 数据放在 MySQL / PostgreSQL 这类关系型数据库里
- 分析数据通过 ETL 定时同步到 Hive / ClickHouse 等分析引擎

中间隔着数据管道、延迟、不一致。HyPer 的核心思想就一句话：**同一份数据，同一个引擎，同时服务 OLTP 和 OLAP。**

## 二、核心概念拆解

### 2.1 列存 vs 行存：各有所长

在理解 HyPer 之前，必须先搞懂一个根本矛盾：

**行存储（Row Store）**——像一张 Excel 表格，一行一条记录完整地放在一起。

```
订单表（行存）：
| 订单ID | 用户ID | 金额  | 时间        |
|--------|--------|-------|-------------|
| 1001   | U1     | 299元 | 2024-01-01  |
| 1002   | U2     | 159元 | 2024-01-01  |
| 1003   | U1     | 499元 | 2024-01-02  |
```

适合 OLTP：你要改一条记录、查一条记录的某个字段，一行数据在内存里连续存放，CPU 缓存友好。

**列存储（Column Store）**——把每一列单独存。

```
订单表（列存）：
订单ID列: [1001, 1002, 1003]
用户ID列: [U1,     U2,     U1    ]
金额列:   [299元,  159元,  499元 ]
时间列:   [01-01,  01-01,  01-02 ]
```

适合 OLAP：你只需要"统计金额总和"，只需要读金额这一列，不用碰其他列，省了大量 IO。

**问题**：行存分析慢，列存更新慢。业界共识是"鱼与熊掌不可兼得"。

**HyPer 的答案**：两种格式**同时存在**，在运行时自动转换。

### 2.2 虚拟内存快照（Virtual Memory Snapshots）——HyPer 的杀手锏

这是这篇论文最核心的创新。

传统数据库做快照需要拷贝整个数据集，很慢。HyPer 利用操作系统的虚拟内存机制，几乎零成本地创建数据库快照：

**类比**：想象你在读一本很厚的书，突然需要停下来给别人展示"当前这本书的样子"。传统做法是把整本书复印一份。HyPer 的做法是给这本书打个标记："从这一刻起，这本书的内容不再改变"，然后给读者发一本"只读副本"的钥匙。因为操作系统负责追踪哪些页面被改写了（写时复制，Copy-on-Write），所以不需要预先拷贝任何东西。

具体实现：

1. 数据库的数据页映射到进程的虚拟地址空间
2. 当需要快照时，把相关页面的权限改为只读
3. 如果 OLTP 事务要修改某个页面，操作系统触发缺页中断，HyPer 捕获它，把那一页拷贝一份再修改
4. 快照里的数据保持不变，供分析查询使用

这个过程在**微秒级别**完成，而不是传统数据库的秒级甚至分钟级。

### 2.3 运行时转换（Runtime Conversion）

HyPer 的行存和列存之间可以互相转换：

- OLTP 事务主要在**行存**上执行（更新方便）
- OLAP 查询主要在**列存**上执行（扫描高效）
- 当有大量分析查询进来时，HyPer 在后台把行存**转换成列存**
- 转换过程中 OLTP 不受影响，继续在工作

转换完成后，分析查询切换到列存引擎执行。如果 OLTP 又变多了，可以再转回去。

### 2.4 自适应并发控制

HyPer 使用了一种叫 **Optimistic Concurrency Control（乐观并发控制）** 的策略：

- 事务执行时不加锁（假设不会冲突）
- 提交时才检查是否有冲突
- 有冲突就回滚重试

配合虚拟内存快照，不同版本的数据可以同时存在，互不干扰。

## 三、系统架构图（文字版）

```
                    ┌─────────────────────────────┐
                    │         SQL Parser           │
                    └──────────┬──────────────────┘
                               │
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
        ┌──────────┐   ┌──────────┐   ┌─────────────────┐
        │ OLTP     │   │ OLAP     │   │ Snapshot Engine │
        │ Planner  │   │ Planner  │   │ (VM Snapshots)  │
        └────┬─────┘   └────┬─────┘   └────────┬────────┘
             │              │                   │
             ▼              ▼                   ▼
        ┌──────────┐   ┌──────────┐    ┌──────────────────┐
        │ Row Store│   │Col Store │    │ Copy-on-Write    │
        │ Engine   │◄─►│ Engine   │    │ Page Manager     │
        └──────────┘   └──────────┘    └──────────────────┘
```

## 四、代码示例

### 示例 1：模拟虚拟内存快照的简易实现

下面用一个简化的 Python 代码演示 HyPer 快照的核心思想——写时复制：

```python
import copy

class VirtualMemorySnapshot:
    """
    简化版的 HyPer 虚拟内存快照机制。
    核心思路：快照创建时不拷贝数据，只在写入时才拷贝被修改的页面。
    """

    def __init__(self, num_pages=10):
        # 每个页面 4KB，模拟数据库的内存页
        self.pages = [bytearray(4096) for _ in range(num_pages)]
        # 记录每个页面是否已被复制（写时复制）
        self.copy_on_write_flags = [False] * num_pages

    def create_snapshot(self):
        """
        创建快照：把所有页面设为只读，记录版本号。
        实际成本：O(1)，只是设个标志位。
        """
        snapshot_version = len(self.snapshots)
        self.snapshots.append(snapshot_version)
        for i in range(len(self.pages)):
            self.copy_on_write_flags[i] = True  # 标记为只读
        return f"Snapshot v{snapshot_version} created"

    def modify_page(self, page_id, offset, data):
        """
        修改页面：如果该页面处于"只读"状态（有快照），
        先拷贝一份新的再修改。
        """
        if self.copy_on_write_flags[page_id]:
            # 写时复制：创建新页面副本
            self.pages[page_id] = bytearray(self.pages[page_id])
            self.copy_on_write_flags[page_id] = False

        self.pages[page_id][offset:offset + len(data)] = data

    def read_page(self, page_id):
        return self.pages[page_id]


# 演示
db = VirtualMemorySnapshot(num_pages=3)

# 写入初始数据
db.modify_page(0, 0, b"ORDER_ID=1001")
db.modify_page(1, 0, b"USER_ID=U1")
db.modify_page(2, 0, b"AMOUNT=299")

# 创建一个快照（相当于开启一个分析查询的视角）
print(db.create_snapshot())  # Snapshot v0 created

# OLTP 事务继续修改数据
db.modify_page(0, 0, b"ORDER_ID=1002")
db.modify_page(1, 0, b"USER_ID=U2")

# 快照中的数据不变，分析查询看到的是旧数据
print(db.read_page(0)[:15])  # b"ORDER_ID=1001"  -- 快照视角
print(db.read_page(0)[:15])  # b"ORDER_ID=1002"  -- 最新数据
```

### 示例 2：行存到列存的转换

这个示例演示 HyPer 如何在运行时把行存格式转换为列存格式：

```python
class RowColumnConverter:
    """
    简化版：演示 HyPer 的行存 <-> 列存运行时转换。
    实际 HyPer 的转换是增量式的，只转换脏页，且不影响正在执行的事务。
    """

    def __init__(self):
        # 行存格式：每条记录是一个字典
        self.row_store = []

    def insert(self, order_id, user_id, amount):
        """OLTP 插入操作——在行存中追加一条记录"""
        self.row_store.append({
            "order_id": order_id,
            "user_id": user_id,
            "amount": amount
        })

    def convert_to_columnar(self):
        """
        将行存转换为列存。
        转换后，OLAP 查询可以直接访问某一列而不需要遍历整条记录。
        """
        if not self.row_store:
            return {}

        columns = {
            "order_id": [],
            "user_id": [],
            "amount": []
        }
        for row in self.row_store:
            for col in columns:
                columns[col].append(row[col])
        return columns

    def aggregate_sum(self, column_name):
        """
        OLAP 聚合查询：计算某一列的总和。
        在列存上，这只需要扫描一个数组。
        """
        col_data = self.columnar_data.get(column_name, [])
        return sum(col_data)

    def set_columnar(self, columns):
        self.columnar_data = columns


# 演示
converter = RowColumnConverter()

# OLTP：大量插入操作
for i in range(1, 6):
    converter.insert(i, f"U{i}", i * 100)

print("行存数据:", converter.row_store)
# [{'order_id': 1, 'user_id': 'U1', 'amount': 100}, ...]

# 切换：行存 → 列存（HyPer 在后台做这件事）
columns = converter.convert_to_columnar()
converter.set_columnar(columns)

print("列存数据:", columns)
# {'order_id': [1,2,3,4,5], 'user_id': ['U1','U2','U3','U4','U5'], 'amount': [100,200,300,400,500]}

# OLAP：聚合查询——只扫描 amount 这一列
total = converter.aggregate_sum("amount")
print(f"总金额: {total}")  # 1500
```

## 五、性能对比（来自论文实验）

HyPer 在论文中展示了几个关键数据：

- **OLTP 性能**：与纯行存数据库（如 VoltDB）相当
- **OLAP 性能**：与纯列存数据库（如 MonetDB）相当
- **混合负载**：同时运行 OLTP + OLAP 时，性能下降远小于传统方案（传统方案中 OLTP 会因为 ETL 管道和分析查询而严重退化）

论文使用的 CH-benCHmark（混合基准测试）显示，在 OLTP:OLAP = 9:1 的混合负载下，HyPer 的总体吞吐量比分别部署两个系统还要高。

## 六、为什么这篇论文值得读（十年后）

这篇 2011 年的论文获得了 ICDE 2021 的**十年影响力论文奖**，原因如下：

1. **打破了行业共识**：当时普遍认为 OLTP 和 OLAP 必须分开，HyPer 用实验证明可以合一
2. **虚拟内存快照**这个想法极其优雅——不发明新算法，而是巧妙利用操作系统已有的机制
3. **启发了后续大量工作**：Google Spanner、Microsoft Hekaton、Snowflake 等现代数据库都在不同程度上吸收了类似思想
4. **工程上的勇气**：论文中的系统是完全可工作的原型，不是纸上谈兵

## 七、延伸思考

- HyPer 的方案依赖于 x86 的虚拟内存机制（写时复制），这在 ARM 或其他架构上是否需要调整？
- 现代数据库如 DuckDB、ClickHouse 也支持一定的 OLTP 能力，它们的方案和 HyPer 有什么异同？
- 云原生时代，存算分离架构下，"混合数据库"这个问题是否有了新的解法？

## 八、关键术语表

| 术语 | 英文 | 简单解释 |
|------|------|----------|
| OLTP | Online Transaction Processing | 短事务、高并发、低延迟的操作（如下单） |
| OLAP | Online Analytical Processing | 长查询、大批量、复杂分析（如报表） |
| 行存储 | Row Store | 按行组织数据，适合点查询和更新 |
| 列存储 | Column Store | 按列组织数据，适合聚合和扫描 |
| 写时复制 | Copy-on-Write | 延迟拷贝，只在真正写入时才复制数据 |
| 虚拟内存快照 | VM Snapshot | 利用操作系统虚拟内存机制创建的一致性快照 |
| 乐观并发控制 | OCC | 执行时不加锁，提交时检查冲突 |
| 运行时转换 | Runtime Conversion | 在程序运行时动态改变数据的内部表示 |
