---
title: immudb — 不可变数据库
来源: https://github.com/codenotary/immudb
日期: 2026-06-13
子分类: databases-storage
分类: 数据库
难度: 初级
provenance: pipeline-v3
---

## 是什么

immudb 是 Codenotary 公司开源的**不可变（immutable）数据库**，用 Go 写成。日常类比：银行的保险柜日志。

你去银行保险柜取东西，柜员拿出一个日志本——每一次的存取记录都写在上面，不能擦掉、不能撕掉、不能涂改。你要证明某个东西确实在柜子里，翻日志本就能找到"某年某月某日，你存入了某物"的记录。后来的任何修改只会**追加**一条新记录，不会覆盖旧记录。

immudb 就是这个"日志本"：数据只能追加（append），不能删除或修改。任何一步操作都有**密码学证明**（Merkle 树 + SHA-256），客户端可以自己验证"这个数据确实没被篡改过"——不需要信任数据库本身。

这区别于你熟悉的 [[mysql]] / [[postgresql]]：那些数据库里的 UPDATE 和 DELETE 是真的把旧数据覆盖了。而 immudb 里不存在覆盖——你看到的是一条不断增长的、带有数字签名的记录链。

核心技术栈：**Merkle 树 + 追加事务日志 + B 树索引**。支持三种数据模型：KV（键值）、SQL（关系型）、Document（文档型）。能通过 PostgreSQL 协议连接，所以你用 `psql`、JDBC、SQLAlchemy 等任何 Postgres 工具都能操作它。

## 为什么重要

immudb 解决的是传统数据库一个隐藏前提：**你信任数据库管理员**。

如果你的数据库被入侵了，攻击者在 [[postgresql]] 里 `UPDATE` 了某条记录——除了备份日志，你没其他办法证明"这条记录被改过"。immudb 反过来：**客户端不信任数据库**。每次读数据都附带一个密码学证明（inclusion proof），客户端用本地存的 32 字节 Merkle root 就能独立验证"这条数据是否被篡改"。

这个能力让 immudb 适用于以下场景：

- **合规审计**：银行、保险、医疗等需要保留完整操作记录。每笔交易不可删除，审计员随时可以验证某条记录从写入到今天从未被改动
- **零信任存储**：数据存在第三方云上，但不需要信任云厂商。自己的加密验证机制确保完整性
- **软件供应链安全**：记录每个发布版本的 hash，建立可验证的软件交付链
- **合同/证书存证**：合同的每一版修改都留下不可抹除的痕迹

技术上，它也是理解"密码学数据结构如何在数据库层面落地"的最佳学习入口——Merkle 树、追加日志、一致性证明、快照隔离，这些概念在 immudb 里都有清晰的工程实现。8.9k+ GitHub Stars，Go 生态中不可变存储的事实标准。

## 核心要点

### 1. 三件套架构（自底向上）

```
┌──────────────────────────────────┐
│       SQL 层（可选）              │  ← PostgreSQL 协议兼容
├──────────────────────────────────┤
│   索引 KV 层（B 树）              │  ← 异步构建，可跳过
├──────────────────────────────────┤
│  Merkle 树 + 一致性证明           │  ← 密码学防篡改核心
├──────────────────────────────────┤
│  追加事务日志                     │  ← 不可变基础；ACID + 快照隔离
└──────────────────────────────────┘
```

- **追加日志**：最底层。所有写操作只追加到文件末尾，从不覆盖。提供了时间旅行能力——你可以回到任何一个历史时间点看当时的数据。类比：一台永远不换胶卷的摄像机——想回顾 3 天前的画面，往回倒带就行
- **Merkle 树**：把每笔交易的 hash 组织成一棵树。叶子节点是单条数据的 hash，父节点是子节点 hash 再 hash，一路算到根（root hash）。**改任何一条数据，root hash 就变了**——所以 root hash 被称为整个数据库的"指纹"，只有 32 字节
- **B 树索引**：异步构建，加速 key 查找。可以跳过（纯追加模式）换取更高写入吞吐

### 2. 两种密码学证明

immudb 提供了两种证明，客户端可以独立验证：

- **包含证明（Inclusion Proof）**：回答"记录 X 确实存在，并且属于当前数据库状态"。客户端向 immudb 请求一条记录时，顺便拿到从该记录到 Merkle root 路径上的所有"兄弟节点 hash"，自己重算一遍——算出来的 root 和本地存的 root 一致，就说明数据没被篡改
- **一致性证明（Consistency Proof）**：回答"版本 B 的数据库包含了版本 A 的全部数据，且顺序未变"。如果数据库被删了某条记录，它**无法**生成有效的一致性证明，所有连接的客户端都会立刻检测到

日常类比：包含证明是"这本书的第 37 页确实属于这本书（书脊编码对得上）"。一致性证明是"第二版确实包含了第一版的全部内容，没有被人偷偷撕掉几页"。

### 3. 数据模型：KV + SQL + Document

immudb 同一个数据库引擎支持三种数据模型，所有模型共享同一套 Merkle 验证层：

| 模型 | 使用方式 | 典型场景 |
|------|----------|----------|
| KV（键值） | gRPC API：`Set`/`Get`/`VerifiedSet`/`VerifiedGet` | 配置存储、证书管理、简单状态 |
| SQL（关系型） | PostgreSQL 协议，标准 SQL 语法 | 业务数据、报表、已有应用迁移 |
| Document（文档） | 无 schema 的文档存储 | 日志、JSON 配置、灵活数据结构 |

KV 层面有"3D 访问"——你需要指定交易 ID + key 才能定位到某个历史版本的值。类比：你去图书馆找一本书，不仅要告诉它书名（key），还要告诉它"我要看第 3 次修订版（tx=3）"。

## 实践案例

### 案例 1：Docker 启动 + SQL 建表 + 时间旅行

```bash
# 启动 immudb（暴露 gRPC 3322 和管理界面）
docker run -d --name immudb \
  -p 3322:3322 -p 8080:8080 \
  codenotary/immudb:latest

# 下载 CLI 客户端连接
./immuclient -a localhost -p 3322
```

进入客户端后：

```sql
-- 登录（默认账号 immudb / immudb）
login immudb
use defaultdb

-- 建表
CREATE TABLE IF NOT EXISTS audit_log (
    id        INTEGER AUTO_INCREMENT,
    user_name VARCHAR[60],
    action    VARCHAR[255],
    detail    VARCHAR,
    created   TIMESTAMP,
    PRIMARY KEY (id)
);

-- UPSERT 追加记录（immudb 没有真正的 UPDATE，每次都是追加新版本）
UPSERT INTO audit_log (user_name, action, detail, created)
VALUES ('alice', 'LOGIN', '登录成功', NOW());

UPSERT INTO audit_log (user_name, action, detail, created)
VALUES ('alice', 'EXPORT', '导出数据', NOW());

-- 查询当前状态
SELECT id, user_name, action, detail, created FROM audit_log;

-- 时间旅行：查看某一笔交易之前的数据库状态
SELECT id, user_name, action, detail
FROM audit_log BEFORE TX 3;
```

### 案例 2：Go SDK — 带密码学验证的 KV 读写

```go
package main

import (
	"context"
	"fmt"
	"log"

	immudb "github.com/codenotary/immudb/pkg/client"
)

func main() {
	ctx := context.TODO()

	// 1. 连接并登录
	opts := immudb.DefaultOptions().
		WithAddress("localhost").
		WithPort(3322)

	client := immudb.NewClient().WithOptions(opts)
	err := client.OpenSession(ctx,
		[]byte("immudb"),  // 用户名
		[]byte("immudb"),  // 密码
		"defaultdb",       // 数据库名
	)
	if err != nil {
		log.Fatal(err)
	}
	defer client.CloseSession(ctx)

	// 2. 写入带密码学验证的 KV（VerifiedSet = Set + Merkle 证明）
	vtx, err := client.VerifiedSet(ctx,
		[]byte("contract:001"),
		[]byte(`{"signer":"Alice","amount":50000,"currency":"CNY"}`),
	)
	if err != nil {
		log.Fatal(err)
	}
	fmt.Printf("已写入并验证: tx=%d\n", vtx.Id)

	// 3. 读取带验证（VerifiedGet = Get + 自动校验 Merkle 证明）
	entry, err := client.VerifiedGet(ctx, []byte("contract:001"))
	if err != nil {
		log.Fatal(err)
	}
	fmt.Printf("验证通过: key=%s value=%s tx=%d\n",
		entry.Key, entry.Value, entry.Tx)

	// 4. 如果 immudb 服务器被入侵、数据被篡改
	//    VerifiedGet 会直接返回 error——客户端不需要信任服务器
}
```

关键差异：`Set` vs `VerifiedSet` —— 前者只写入，后者额外返回 Merkle 证明让 SDK 自动验证。生产环境中应始终使用 `Verified` 系列方法。

安装依赖：`go get -u github.com/codenotary/immudb`

### 案例 3：Python SDK — SQL 事务 + 时间旅行验证

```python
from immudb.client import ImmudbClient
from uuid import uuid4

client = ImmudbClient("localhost:3322")
client.login("immudb", "immudb", database=b"defaultdb")

# 建表
client.sqlExec("""
    CREATE TABLE IF NOT EXISTS contracts (
        uid        VARCHAR[64],
        signer     VARCHAR[60],
        amount     INTEGER,
        created    TIMESTAMP,
        PRIMARY KEY (uid)
    );
""")

# 事务性写入：一个 sqlExec 里多条语句 = 一次原子操作
uid = str(uuid4())
resp = client.sqlExec("""
    BEGIN TRANSACTION;

    INSERT INTO contracts (uid, signer, amount, created)
        VALUES (@uid, 'Alice', 50000, NOW());
    INSERT INTO contracts (uid, signer, amount, created)
        VALUES ('cont-002', 'Bob', 30000, NOW());

    COMMIT;
""", {"uid": uid})

tx_id = resp.txs[0].header.id
print(f"写入事务 ID: {tx_id}")

# 查看当前数据
result = client.sqlQuery(
    "SELECT uid, signer, amount FROM contracts"
)
for row in result:
    print("当前行:", row)

# 时间旅行：查看这笔事务之前的状态（新写入的不在结果里）
result_before = client.sqlQuery(
    f"SELECT uid, signer, amount FROM contracts BEFORE TX {tx_id}"
)
records_before = list(result_before)
print(f"事务前记录数: {len(records_before)}")  # Alice 不在！

# KV 层密码学验证（Python 验证走 KV，SQL 层暂不自动校验）
key = "contract:003".encode("utf8")
value = "contract_value_data".encode("utf8")
resp = client.verifiedSet(key, value)
assert resp.verified == True  # 写入已通过 Merkle 证明验证

readback = client.verifiedGet(key)
assert readback.verified == True
print(f"验证读取: {readback.value.decode()} @ tx={readback.id}")
```

安装：`pip install immudb-py`。注意 Python SDK 的密码学验证目前仅在 KV 层可用（`verifiedSet`/`verifiedGet`），SQL 层的时间旅行用 `BEFORE TX` 语法实现。

## 踩过的坑

- **UPSERT 不是 UPDATE**：immudb 没有真正的 DELETE 或 UPDATE——每次"修改"其实是在追加一条新记录。历史数据永远占据磁盘，不会释放。大规模写场景要做定期 compaction 或归档
- **Merkle 树重建在高吞吐下有开销**：每次写操作都要从叶子节点重新计算到 root 的整条路径。写吞吐极高时（每秒数百万条），Merkle 树计算会成为瓶颈——immudb 用"线性证明链"（Linear Proof）当作中间缓冲：先拉链，后异步补树
- **Python SDK 校验能力不完整**：Python SDK 的 `sqlExec`/`sqlQuery` 目前不会自动验证 Merkle 证明。需要完整密码学校验的场景建议用 Go SDK，或者在关键数据上用 KV 层的 `verifiedGet` 做读取验证
- **默认端口是 gRPC，不是 HTTP**：immudb 主端口 3322 走 gRPC 协议，用 curl 调不动。调试时可以用自带的 Web Dashboard（8080 端口）或 `immuclient` CLI 工具
- **PostgreSQL 协议兼容但不完全**：虽然能用 psql 连接，但不是所有 PG 功能都可用——PL/pgSQL、自定义函数、触发器等高级特性不可用。迁移现有 Postgres 应用前要做兼容性检查
- **单机性能：读非常快，写受 Merkle 树影响**：纯追加模式（跳过 B 树索引）写入约 1.8M 条/秒，开启全量索引后降到约 0.8M 条/秒。取决于你更看重"写入速度"还是"查询速度"

## 学到什么

- **"不可变"是一种安全设计模式，不是技术限制**：传统数据库里 UPDATE/DELETE 是便利性设计——让你能随时改；immudb 把所有修改变成"追加+新版本"，换来的能力是"任何篡改都可检测"。这是零信任架构在存储层的核心思想
- **密码学不贵**：SHA-256 在 CPU 上计算极快（现代 CPU 有 SHA 指令集加速），immudb 的 Merkle 验证大部分场景下开销不到 5%。这就是为什么它敢说"每个读写都带密码学证明"——因为成本真不高
- **时间旅行不只是噱头**：`BEFORE TX` 语法让你可以在 SQL 查询里回到过去。这对审计场景是必需品——"三天前这个字段的值是什么？"在 immudb 里是原生功能，在 [[postgresql]] 里要靠备份和 Point-in-Time Recovery
- **追加日志是数据库的通用基础**：immudb、[[etcd]]、RocksDB、[[kafka]] 都用追加日志——不是巧合。因为顺序写是磁盘最快操作（无磁盘寻道），理解了追加日志 = 理解了一半的现代数据库设计
- **PostgreSQL 协议兼容 = 生态继承**：immudb 不要求你学新 API——任何能连 PG 的 ORM/客户端/工具都能连它。这个设计决策降低了采用门槛，代价是协议兼容层的维护成本
- **不同 SDK 成熟度不一致**：Go SDK 支持全量密码学验证，Python SDK 目前 SQL 层不带自动验证。做安全关键的应用要选 Go SDK，日常探索用 Python 足够

## 延伸阅读

- [immudb 官方文档](https://docs.immudb.io) — 入门指南、SDK 参考、SQL 语法完整文档
- [immudb GitHub 仓库](https://github.com/codenotary/immudb) — 8.9k+ Stars，源码、Issues、Release Notes
- [How Are Records Stored in immudb](https://immudb.io/blog/how-are-records-stored-in-immudb) — 追加日志 + Merkle 树的底层存储机制详解
- [Proof of Untampered Records in immudb](https://immudb.io/blog/proof-of-untampered-records-in-immudb) — 包含证明和一致性证明的数学原理
- [immudb Client Examples](https://github.com/codenotary/immudb-client-examples) — 官方 Go/Python/Java/Node.js/.NET SDK 示例

## 关联

- [[postgresql]] —— immudb 兼容 PG 协议，但核心设计理念相反（可变 vs 不可变）
- [[etcd]] —— 也用追加日志 + Raft 共识，但侧重分布式一致性，而非密码学防篡改
- [[redis]] —— 同为 KV，redis 是内存型+可覆盖，immudb 是磁盘型+不可变
- [[kafka]] —— 追加日志作为存储引擎的原型
- [[sqlite]] —— 嵌入式小型数据库，但 sqlite 允许 UPDATE/DELETE，immudb 不可变

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）

