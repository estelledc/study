---
title: "redb — 纯 Rust 嵌入式 KV 存储"
来源: https://github.com/cberner/redb
日期: 2026-06-13
分类: 数据库
子分类: databases-storage
provenance: pipeline-v3
---

## 是什么

redb 是一个**纯 Rust 编写的嵌入式键值数据库**——你把它当成一个 Rust 库 crate 放进自己项目，直接在进程内运行，不需要安装任何数据库服务。它的设计灵感来自 lmdb，数据存在**拷贝写（copy-on-write）B+树**里。

日常类比：传统数据库像一个**带钥匙的抽屉柜**——每个抽屉有编号，你要改一条数据就得找到那个抽屉打开、替换、锁上。redb 的做法更像**透明玻璃文件柜**：每个抽屉的格子是玻璃做的，你要改东西时，不是把旧东西拿出来，而是**把整个格子复制一份新的**，换上修改后的内容，再挂一个新的编号。旧的玻璃格子不会被立即销毁，而是等着所有看过它的人（读事务）都走开后再回收。这种"改即复制"的方式天然保证了：**即使程序突然崩溃，旧的、完整的数据永远还在**，不会像传统数据库那样出现"写到一半断电"的损坏。

redb 目前稳定在 4.x 版本，文件格式已稳定，Apache-2.0 和 MIT 双协议开源，GitHub 4.6k stars。 benchmarks 显示它在单线程随机读上比 RocksDB 快 3-5 倍，在并发读场景下多线程扩展性远超竞品。

## 为什么重要

- **嵌入式场景正在爆炸**——浏览器引擎、区块链钱包、移动 App、IoT 设备都需要"库即数据库"，redb 是 Rust 生态里对标 lmdb/rocksdb 的纯血选择
- **零安全边界问题**——Rust 的内存安全保证意味着 B+树操作不会有 use-after-free、buffer overflow 这些传统 C/C++ 数据库的 CVE 黑洞
- **MVCC 并发模型**——单个写者、任意多读者，读不阻塞写、写不阻塞读，这比 SQLite 的 WAL 模式更精细
- **B+树 vs LSM 的路线之争**——LevelDB/RocksDB 选 LSM 树，redb 选 B+树。前者写快读慢，后者读写均衡。理解这个选择等于理解嵌入式存储的两种哲学

## 核心概念

### 1. Copy-on-Write B+树

这是 redb 的灵魂。普通 B+树修改节点时会原地更新，但 redb 修改任何节点都先分配一个新页面（page），改新页面、重建父指针链。旧页面因为可能有读事务正在用，所以不删。

类比：你有一本共享手册，第 37 页印错了。普通做法是派个人把第 37 页撕下来换上新的——但其他正在读第 37 页的人手里就只剩半页纸了。redb 的做法是：**复印整本手册**，只改第 37 页，然后公布新手册的页码。旧手册因为还有人拿着，所以不销毁。

### 2. MVCC（多版本并发控制）

redb 支持**一个写者 + 任意多读者的并发**。读事务开始时拿到当前 B+树根节点的引用，此后读操作只访问那些页面，不受写者影响。写者提交新事务时构建新版本的 B+树，通过翻转一个单字节（"god byte"）让读事务自动切换到新版本。

### 3. Savepoint（保存点）

类似 Git 的 snapshot。你可以在写事务中途创建一个保存点，如果后续操作出错，直接回滚到保存点状态，不用回滚整个事务。保存点有两种：**临时**（drop 就释放）和**持久**（跨重启存活）。

### 4. 提交策略

redb 提供三种提交方式：
- **Non-durable**：不 fsync，最快，崩溃会丢数据但不会损坏
- **1PC+C（默认）**：一次 fsync + checksum 校验，兼顾安全和速度
- **2PC**：两次 fsync，用于处理恶意输入的高安全场景

### 5. 零拷贝读取

redb 的 `get()` 返回的 `Value` 直接指向磁盘文件映射的内存（mmap），不做任何复制。这意味着读大 value 时几乎零开销。

## 代码示例

### 示例一：基础 CRUD

```rust
use redb::{Database, ReadableTable, TableDefinition, Error};

// 定义表结构：key 是 &str，value 是 u64
const ITEMS: TableDefinition<&str, u64> = TableDefinition::new("items");

fn main() -> Result<(), Error> {
    // 创建或打开数据库文件
    let db = Database::create("my_store.redb")?;

    // --- 写入 ---
    let write_txn = db.begin_write()?;
    {
        let mut table = write_txn.open_table(ITEMS)?;
        table.insert("apple", &1)?;
        table.insert("banana", &2)?;
        table.insert("cherry", &3)?;
    }
    write_txn.commit()?;

    // --- 读取 ---
    let read_txn = db.begin_read()?;
    let table = read_txn.open_table(ITEMS)?;

    // get() 返回 Option<Entry>，Entry.value() 拿真实值
    assert_eq!(table.get("apple")?.unwrap().value(), 1);

    // 遍历所有键值对（有序）
    for entry in table.iter()? {
        let (k, v) = entry?;
        println!("{} = {}", k.value(), v.value());
    }

    Ok(())
}
```

关键点：`TableDefinition` 是编译期常量，不需要运行时 Schema 注册。类型安全靠 Rust 泛型保证。

### 示例二：事务 + 保存点 + 范围查询

```rust
use redb::{Database, ReadableTable, TableDefinition, Error, TableHandle};

const USER_DATA: TableDefinition<&str, &[u8]> = TableDefinition::new("users");

fn main() -> Result<(), Error> {
    let db = Database::create("users.redb")?;

    let write_txn = db.begin_write()?;
    {
        let mut table = write_txn.open_table(USER_DATA)?;

        // 插入一批初始数据
        table.insert("alice", b"admin")?;
        table.insert("bob", b"user")?;

        // 创建保存点：这是"备份时刻"
        let savepoint = write_txn.get_savepoint()?;

        // 模拟操作：可能失败的批量更新
        table.insert("charlie", b"user")?;

        // 范围查询：scan() 返回有序迭代器
        let range = table.range("a".unwrap().."d".unwrap())?;
        assert_eq!(range.count(), 3); // alice, bob, charlie

        // 如果后面发现有问题，可以回滚到保存点
        // write_txn.rollback_to(&savepoint)?;
    }
    write_txn.commit()?;

    // --- 范围查询：找到名字以 "a" 开头的所有用户 ---
    let read_txn = db.begin_read()?;
    let table = read_txn.open_table(USER_DATA)?;
    let prefix = table.range("a"..="a\u{FFFD}")?;
    for entry in prefix {
        let (k, v) = entry?;
        println!("User: {}, Role: {}", k.value(), String::from_utf8_lossy(v.value()));
    }

    Ok(())
}
```

`range()` 的闭区间上限用 `\u{FFFD}`（替换字符）是 Rust redb 的惯例——因为字符串按 Unicode 码点排序，这个字符比任何合法字符都大，`"a"..="a\u{FFFD}"` 等价于 SQL 的 `LIKE 'a%'`。

### 示例三：多线程并发读

```rust
use redb::{Database, ReadableTable, TableDefinition, Error};
use std::sync::Arc;
use std::thread;

const COUNTER: TableDefinition<&str, u64> = TableDefinition::new("counter");

fn main() -> Result<(), Error> {
    let db = Arc::new(Database::create("counter.redb")?);

    // 单线程写入
    {
        let txn = db.begin_write()?;
        {
            let mut table = txn.open_table(COUNTER)?;
            table.insert("total", &42)?;
        }
        txn.commit()?;
    }

    // 多个线程并发读——互不阻塞
    let mut handles = vec![];
    for i in 0..8 {
        let db_clone = Arc::clone(&db);
        handles.push(thread::spawn(move) -> Result<(), Error> {
            let txn = db_clone.begin_read()?;
            let table = txn.open_table(COUNTER)?;
            let val = table.get("total")?.unwrap().value();
            println!("Thread {}: read {} = {}", i, "total", val);
            Ok(())
        });
    }

    for h in handles {
        h.join().unwrap()?;
    }

    Ok(())
}
```

`Database` 实现了 `Send + Sync`，可以安全地 `Arc` 共享给多个线程。每个线程调用 `begin_read()` 获得独立的 MVCC 快照，读操作之间完全无锁。

## redb vs LevelDB/RocksDB 的路线选择

| 维度 | redb (B+树) | LevelDB/RocksDB (LSM) |
|------|-------------|----------------------|
| 写入 | 每次写都复制页面，写放大略大 | 顺序追加 WAL + MemTable flush，写极快 |
| 读取 | B+树 O(log n)，单文件查找，读快 | 需查 MemTable + L0~L6，读路径长 |
| 删除 | 立刻标记不可达，随合并回收 | 写墓碑（tombstone），compaction 才真删 |
| 崩溃恢复 | COW 机制保证旧版本永存，天然 crash-safe | 依赖 WAL 重放，逻辑稍复杂 |
| 空间效率 | 未 compact 时旧页面堆积 | compaction 回收空间，但期间放大明显 |
| 适用场景 | 读多写少、需要稳健 crash recovery | 写多读少、需要极高写入吞吐 |

简单记忆：**B+树是"读写均衡的老实人"，LSM 是"写快读慢的偏科生"**。redb 选择了做老实人。

## 文件结构速览

redb 数据库文件以 **512 字节 super-header** 开头，包含两个"提交槽"（commit slot）实现双缓冲：

```
[ 64 字节数据库头 ] [ 128 字节提交槽0 ] [ 128 字节提交槽1 ] [ 填充区 ]
```

`god byte` 是核心：只有一位控制"当前读哪个槽"，翻转这个字节就是原子提交——这是整个数据库的"开关"。数据实际存在后续的**区域（region）**里，每个区域由页（page）组成，页的大小默认等于操作系统页大小（通常 4KB）。

## 关键 crate 特性速查

| 特性 | 说明 |
|------|------|
| ACID 事务 | 完整支持，可配置 1PC 或 2PC |
| MVCC | 单写多读，读不阻塞写 |
| Savepoint | 临时和持久两种，支持回滚 |
| 零拷贝读 | mmap + 直接返回文件映射引用 |
| 类型安全 | 编译期 Key/Value 类型约束 |
| 无外部依赖 | 纯 Rust，不链接 liblmdb/librocksdb |
| 文件稳定 | v3 文件格式已稳定，提供升级路径 |
| 修复能力 | 崩溃后可自动 repair，从 B+树重建分配器状态 |

## 延伸学习

- [redb 设计文档](https://github.com/cberner/redb/blob/master/docs/design.md)——详细的文件格式和 MVCC 实现
- [redb examples](https://github.com/cberner/redb/tree/master/examples)——官方例子里有索引、事务、savepoint 的完整用法
- [[leveldb]]——理解 LSM 路线作为对照
- [[rocksdb]]——LSM 的工业级集大成者
- [[bbolt]]——另一个用 B+树（实际上是 B-tree）的嵌入式 KV，Go 语言
