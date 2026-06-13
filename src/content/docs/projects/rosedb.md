---
title: RoseDB — Go Bitcask KV 引擎
来源: https://github.com/rosedblabs/rosedb
日期: 2026-06-13
分类: 数据库
子分类: databases-storage
provenance: pipeline-v3
---

# RoseDB — Go Bitcask KV 引擎

## 1. 一句话：RoseDB 是什么

RoseDB 是用 Go 语言写的一个 **轻量级 KV（键-值）存储引擎**，它的底层存储模型叫 **Bitcask**。

你可以把它理解成一个"超级有条理的记事本"——你往里写 `key: value`（比如 `"用户名": "jason"`），它保证你随时能快速读回来、能快速删掉、而且写入速度极快。

它不是像 MySQL 那样的关系型数据库，而是一个 **单线程追加写入** 的嵌入式数据库，通常嵌入到你的 Go 程序里直接跑，不单独起服务。

## 2. 核心概念：Bitcask 模型

### 2.1 日常类比：一本只写不擦的笔记本

想象你有一本笔记本，规则很简单：

- **你只能往后面写，不能往前面改**。每个新 key-value 都追加到最后面。
- **如果你想修改一个 key**（比如把 `"用户名": "jason"` 改成 `"用户名": "jason2"`），你不会在原来的地方涂改，而是在新的一页重新写一遍。
- **如果你想删除一个 key**，你也不是把那一页撕掉，而是在后面写一个特殊的标记："key=用户名，操作=删除"。
- **笔记本旁边有一本目录（索引）**，记录了每个 key 当前在笔记本的哪一页。这样不管笔记本多厚，你翻到对应页永远只要找一次目录。

### 2.2 关键设计要素

**追加写入（Append-Only）**：数据永远只往文件末尾追加，不做原地修改。这避免了磁盘碎片的产生，也让写入性能接近理论极限。

**内存索引（In-Memory Index）**：所有 key 的内存索引都保存在内存中，指向磁盘上的具体位置（哪个文件、偏移量多少）。读取时直接根据索引定位，最多一次磁盘 IO。

**预写日志（WAL — Write-Ahead Log）**：写入操作先写到日志文件里，确保断电不会丢数据。RoseDB 底层使用了自己写的 WAL 库（`github.com/rosedblabs/wal`），支持分块和 CRC 校验。

**日志合并（Log Compaction / Roll）**：随着写入越来越多，被覆盖的旧数据和已删除的 key 会堆积在磁盘上。RoseDB 会自动触发一个"合并"过程——把所有最新的、有效数据写到新文件，然后删掉旧文件。这就像整理笔记：把有用的内容誊抄到新本子，把旧本子扔了。

### 2.3 优缺点

**优势**：

- **写入极快**：追加写入 = 顺序 IO，磁盘不怕碎片化，速度接近硬盘理论极限
- **读取稳定**：一次内存查找 + 一次磁盘 seek（很多时候靠 OS 缓存连 seek 都不需要）
- **崩溃恢复快**：重启时按顺序扫描日志文件，验证 CRC 即可恢复，不会丢失已提交的数据
- **备份简单**：因为文件是追加写入的，直接用 `cp` 或任何文件备份工具就能安全备份
- **批处理保证原子性**：一个 batch 操作里的所有写入要么全部成功，要么全部失败

**缺点**：

- **key 必须全部放进内存**：如果你的 key 有上亿个，内存会吃不消。这是 Bitcask 模型的根本限制，不像 RocksDB 那样能把 key 分层放到磁盘上。

## 3. 核心数据结构

RoseDB 的核心由几个部分组成：

**内存索引（In-Memory Index）**

- 本质上是一个 `map[string]*ValueMeta`，key 是字符串，value 包含数据的文件编号、偏移位置、过期时间等信息
- 启动时从磁盘日志文件重建，关闭时也持久化到磁盘，避免下次启动重新扫描

**WAL 日志文件**

- 每个文件是一个独立的"段（segment）"，按顺序编号（000001.log、000002.log …）
- 文件内部格式：`[CRC(4字节)] [Payload长度(2字节)] [类型(1字节)] [数据]`
- 多个记录打包成一个 block（默认 32KB），减少磁盘 IO 次数

**活跃文件 vs 只读文件**

- RoseDB 同时只有一个"活跃文件"用于写入
- 当活跃文件达到设定大小（默认 64MB），就关闭它，变成只读文件，然后打开一个新的活跃文件
- 合并时，只读文件中的旧数据会被清理

## 4. 代码示例

### 示例 1：基本操作

这是一个最基础的 RoseDB 使用场景：打开数据库、写入、读取、删除。

```go
package main

import (
	"fmt"
	"log"

	"github.com/rosedblabs/rosedb/v2"
)

func main() {
	// 1. 配置选项：指定数据存放的目录
	options := rosedb.DefaultOptions
	options.DirPath = "/tmp/rosedb_test"

	// 2. 打开（或创建）数据库
	// 如果目录里已经有数据，会自动重建内存索引
	db, err := rosedb.Open(options)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	// 3. 写入一个键值对
	// Put 的参数是 []byte，所以字符串要转换
	err = db.Put([]byte("name"), []byte("rosedb"))
	if err != nil {
		log.Fatal(err)
	}

	// 4. 读取刚才写入的值
	val, err := db.Get([]byte("name"))
	if err != nil {
		log.Fatal(err)
	}
	fmt.Println("读到的值:", string(val)) // 输出: 读到的值: rosedb

	// 5. 删除这个键
	err = db.Delete([]byte("name"))
	if err != nil {
		log.Fatal(err)
	}

	// 6. 再次读取，会发现 key 不存在了
	val, err = db.Get([]byte("name"))
	if err != nil {
		fmt.Println("key 已删除:", err)
	}
}
```

**运行流程拆解**：

1. `Open` 时，RoseDB 会扫描 `/tmp/rosedb_test` 下的所有 `.log` 文件
2. 从每个文件中重建内存索引（key -> 文件偏移位置）
3. `Put` 操作把数据追加到当前活跃 WAL 文件末尾，同时更新内存索引
4. `Get` 先从内存索引找到位置，再从磁盘读取
5. `Delete` 不是真的删文件，而是写入一个"删除标记"，并更新索引指向这个删除标记

### 示例 2：批处理 + 过期时间

这个例子展示了 RoseDB 的 **批处理原子性** 和 **key 过期** 功能。

```go
package main

import (
	"fmt"
	"log"
	"time"

	"github.com/rosedblabs/rosedb/v2"
)

func main() {
	options := rosedb.DefaultOptions
	options.DirPath = "/tmp/rosedb_batch"

	db, err := rosedb.Open(options)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	// 创建批处理对象
	batch := db.NewBatch(rosedb.DefaultBatchOptions)

	// 在批处理里写入多个键值对
	// 这些写入在 Commit 之前只存在于内存中，没有落盘
	batch.Put([]byte("user:1:name"), []byte("alice"))
	batch.Put([]byte("user:1:email"), []byte("alice@example.com"))
	batch.Put([]byte("user:2:name"), []byte("bob"))
	batch.Put([]byte("user:2:email"), []byte("bob@example.com"))

	// 写入一个带过期时间的 key
	// 这个 key 会在 5 秒后被自动标记为删除
	expiredVal := &rosedb.Item{
		Value:    []byte("temp-data"),
		ExpireAt: time.Now().Add(5 * time.Second),
	}
	_ = batch.PutWithExpiry([]byte("session:token"), expiredVal)

	// 在批处理里做一个删除
	batch.Delete([]byte("user:2:email"))

	// 提交批处理：要么全部成功落盘，要么全部失败回滚
	err = batch.Commit()
	if err != nil {
		log.Fatal(err)
	}

	// 验证写入结果
	name, _ := db.Get([]byte("user:1:name"))
	fmt.Println("用户1名字:", string(name)) // alice

	email, err := db.Get([]byte("user:2:email"))
	if err != nil {
		fmt.Println("用户2邮箱已被删除") // 确认删除生效
	}

	// 等待 5 秒后，过期 key 会被自动清理
	fmt.Println("等待 5 秒后过期 key 将被自动清理...")
	time.Sleep(5 * time.Second)

	// 合并过程会自动清理过期的和已删除的记录
	// 不需要手动触发，RoseDB 会在后台定期检查
}
```

**关键点**：

- 批处理中的写入 **先缓存在内存**，`Commit` 时才一次性写入 WAL 文件，且只占一次磁盘 seek
- 如果 `Commit` 中途失败，所有写入全部回滚，保证了 **原子性（Atomicity）**
- `PutWithExpiry` 为 key 设置过期时间，过期后会被自动清理（合并时）
- 即使不手动清理，过期 key 也会在磁盘合并时被移除

### 示例 3：迭代器扫描

RoseDB 支持从任意 key 开始的正向和反向扫描：

```go
package main

import (
	"fmt"
	"log"

	"github.com/rosedblabs/rosedb/v2"
)

func main() {
	options := rosedb.DefaultOptions
	options.DirPath = "/tmp/rosedb_iter"

	db, err := rosedb.Open(options)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	// 先写入一些数据
	db.Put([]byte("apple"), []byte("苹果"))
	db.Put([]byte("banana"), []byte("香蕉"))
	db.Put([]byte("cherry"), []byte("樱桃"))
	db.Put([]byte("date"), []byte("枣"))

	// 创建一个正向迭代器，从 "banana" 开始扫描
	iter := db.NewIterator(false) // false = 正向
	iter.Seek([]byte("banana"))

	for ; iter.Valid(); iter.Next() {
		fmt.Printf("%s -> %s\n", string(iter.Key()), string(iter.Value()))
	}
	// 输出:
	// banana -> 香蕉
	// cherry -> 樱桃
	// date -> 枣

	// 创建一个反向迭代器，从 "cherry" 开始回扫
	iter2 := db.NewIterator(true) // true = 反向
	iter2.Seek([]byte("cherry"))

	for ; iter2.Valid(); iter2.Prev() {
		fmt.Printf("%s -> %s\n", string(iter2.Key()), string(iter2.Value()))
	}
	// 输出:
	// cherry -> 樱桃
	// banana -> 香蕉
	// apple -> 苹果

	iter.Close()
	iter2.Close()
}
```

## 5. 和 Redis、RocksDB 的对比

| 特性 | RoseDB (Bitcask) | Redis | RocksDB (LSM) |
|------|------------------|-------|---------------|
| 存储引擎 | 只追加 WAL 文件 | 内存为主+RDB/AOF | LSM 树（多层 SSTable） |
| 读写延迟 | 写入极低，读取稳定 | 极低（纯内存） | 写入低，读取随层级变化 |
| 数据量 | key 必须全在内存 | key + value 在内存 | 可以远超内存 |
| 适用场景 | 嵌入式日志/事件存储 | 缓存/消息队列 | 通用嵌入式 KV |
| 崩溃恢复 | 扫描日志，很快 | RDB 快照 + AOF 重写 | Compaction + WAL |

简单说：

- **比 Redis 省内存**，因为数据都在磁盘上（Redis 全放内存）
- **比 RocksDB 简单**，没有多级 LSM 树的 compaction 开销
- **和 Redis 互补**：Redis 做热缓存，RoseDB 做持久化日志/事件存储

## 6. 内部工作流程

### 写入流程

```
你的程序调用 Put(key, value)
    |
    v
写入当前活跃 WAL 文件末尾（追加）
    |
    v
更新内存索引：key -> {fileId, offset, size, expireAt}
    |
    v
如果 WAL 文件超过阈值（如 64MB）
    -> 关闭当前文件，标记为只读
    -> 打开新文件作为活跃文件
```

### 读取流程

```
你的程序调用 Get(key)
    |
    v
在内存索引中查找 key
    |
    v
找到后，根据索引里的偏移量直接去磁盘读取
    |
    v
返回数据（通常 OS 缓存命中，不用真的读磁盘）
```

### 合并（Compaction）流程

```
后台检测到旧文件中的大量过期/被覆盖的 key
    |
    v
扫描所有只读文件，找出每个 key 的最新版本
    |
    v
把有效数据写入新文件
    |
    v
更新内存索引指向新文件
    |
    v
删除旧文件
```

## 7. 总结

RoseDB 的核心设计哲学可以用一句话概括：**用空间换时间，用简单换可靠**。

它选择了一条相对"激进"的路径——把所有 key 放在内存里，数据只往磁盘追加写。这带来了极致的写入性能和稳定的读取延迟，代价是内存占用。

对于一个零基础的学习者，我建议记住三个关键词：

1. **追加写**：数据从不原地修改，永远往末尾追加
2. **内存索引**：key 的目录全在内存里，读取只需一次查找
3. **日志合并**：定期清理旧数据，保持磁盘整洁

理解这三个词，就理解了 RoseDB 的整个架构。
