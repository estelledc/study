---
title: UnQLite — 嵌入式 NoSQL 数据库
来源: https://github.com/symisc/unqlite
日期: 2026-06-13
子分类: 嵌入式
分类: 操作系统
provenance: pipeline-v3
---

## 是什么

UnQLite 是 Symisc Systems 用 C 写的**嵌入式 NoSQL 数据库引擎**——没有独立服务器进程，整个库链接进你的程序，读写直接落到普通磁盘文件上。日常类比：

- [[redis]] / MongoDB = **快递站**：要先有站点、再连 TCP、再寄件取件
- [[sqlite]] = **带表格的医疗手册**：结构化 SQL，表 + 行 + 列
- UnQLite = **抽屉里的双层收纳盒**：上层放 JSON 文档（像 MongoDB 的 collection），下层放任意字节的键值对（像 LevelDB / Berkeley DB），**一个 `.db` 文件装下全部**

官方把 UnQLite 定位成「自包含、无服务器、零配置、事务型 NoSQL 引擎」。和 SQLite 的「SQL as a library」平行，UnQLite 走的是 **NoSQL as a library**：单文件跨平台（32/64 位、大小端可互拷），BSD 许可，核心 + Jx9 脚本引擎可 amalgamation 成**一个约 1.8 MB 的 C 源文件**直接 `#include` 进项目。

## 为什么重要

嵌入式场景里，「要 NoSQL 但不要运维」的选择并不多：

- **IoT / 桌面工具 / 游戏存档**：不想起 Redis，也不想为简单 KV 引入 SQLite 的 SQL 层
- **单文件便携**：U 盘拷走 `app.db` 就是完整数据，含 JSON collection 和原始 blob
- **双模存储**：同一 `unqlite_open()` 句柄上，C 代码走 KV API，Jx9 脚本走 Document API，无需两套数据库
- **与 atlas 里 [[sqlite]] / [[redis]] 的区分**：SQLite 是关系型 SQL；Redis 是网络内存服务；UnQLite 是**进程内、磁盘持久、NoSQL 双接口**的 niche 选项

GitHub 星标不多（约 2k），但在 C/C++ 嵌入式 NoSQL 里资料完整、API 清晰，适合作为「轻量本地文档 + KV」的学习样本。

## 核心概念

UnQLite 的架构是**分层 + 可插拔存储引擎**，理解下面几条就能上手：

### 1. 嵌入式（Embedded）与单文件

`unqlite_open(&pDb, "test.db", UNQLITE_OPEN_CREATE)` 打开或创建数据库。所有 collection、KV 记录、元数据都在**一个文件**里；也支持纯内存库（`:mem:`）。没有配置文件、没有守护进程。

### 2. 两条 API 路线

| 路线 | 用途 | 典型接口 |
|------|------|----------|
| **Key/Value Store** | 原始字节：字符串、blob、甚至整文件 mmap 进去 | `unqlite_kv_store`, `unqlite_kv_fetch_callback`, `unqlite_kv_delete` |
| **Document Store** | JSON 对象/数组，collection 语义 | 编译 Jx9 脚本 → `unqlite_vm_exec`，脚本里 `db_create` / `db_store` / `db_fetch` |

两条路线**共用同一个 `unqlite*` 句柄**，可在同一事务里混用（注意错误处理与 rollback）。

### 3. Jx9 脚本语言

Document 层由 **Jx9** 驱动：语法接近 C/JavaScript，基于 JSON 类型，图灵完备。流程是 C 侧 `unqlite_compile()` 得到 `unqlite_vm*`，再 `unqlite_vm_exec()`。C 还可 `unqlite_create_function()` 注册原生函数供 Jx9 调用。

### 4. 事务（ACID）与并发

UnQLite 支持手动事务：`unqlite_begin`, `unqlite_commit`, `unqlite_rollback`。默认许多写操作在 `unqlite_close()` 时自动提交。引擎**线程安全、可重入**；多读者 + 单写者模型，适合嵌入而非高并发 Web 后端。

### 5. 存储引擎

内置两种 KV 引擎：

- **磁盘**：Virtual Linear Hash（VLH），宣称 O(1) 查找
- **内存**：哈希表或红黑树

可通过 `unqlite_lib_config(..., UNQLITE_LIB_CONFIG_STORAGE_ENGINE, ...)` 在运行时注册自定义引擎（Hash、B+Tree、LSM 等接口形态已定义）。

### 6. 游标（Cursor）

`unqlite_kv_cursor_init` 可顺序/逆序扫描全部 KV，适合导出、迁移、调试——不像纯 KV 库只能按 key 点查。

## 实践案例

### 案例 1：C 语言 KV — 存、追加、读、删

最小可运行流程（摘自官方「5 minutes」示例的精简版）：

```c
#include <stdio.h>
#include "unqlite.h"

static int print_value(const void *pData, unsigned int nDataLen, void *pUserData) {
    (void)pUserData;
    fwrite(pData, 1, nDataLen, stdout);
    putchar('\n');
    return UNQLITE_OK;
}

int main(void) {
    unqlite *pDb;
    int rc;

    rc = unqlite_open(&pDb, "test.db", UNQLITE_OPEN_CREATE);
    if (rc != UNQLITE_OK) return 1;

    /* 整值覆盖写入 */
    unqlite_kv_store(pDb, "greeting", -1, "Hello World", 11);

    /* 格式化写入（key 长度 -1 表示以 \\0 结尾的 C 字符串） */
    unqlite_kv_store_fmt(pDb, "date", -1, "Today: %d-%02d-%02d", 2026, 6, 13);

    /* append：同一 key 上拼接多段，适合日志式 value */
    unqlite_kv_append(pDb, "log", -1, "start ", 6);
    unqlite_kv_append_fmt(pDb, "log", -1, "pid=%d", 4242);

    /* 回调读：不把整段 value 一次性拷进用户缓冲区，适合大 blob */
    unqlite_kv_fetch_callback(pDb, "greeting", -1, print_value, NULL);

    unqlite_kv_delete(pDb, "greeting", -1);

    unqlite_close(pDb);  /* 自动 commit */
    return 0;
}
```

要点：

- key/value 都是**字节数组**，长度显式传入；`-1` 表示 key 是 C 字符串
- `unqlite_kv_append*` 与 `store` 不同：在已有 value 尾部追加
- 出错时可 `unqlite_config(pDb, UNQLITE_CONFIG_ERR_LOG, ...)` 取日志，必要时 `unqlite_rollback(pDb)`

### 案例 2：把多个文件打进一个「Tar 式」数据库

KV 层不限制 value 类型，官方示例用 mmap 整文件写入，O(1) 按文件名（key）取回：

```c
#include "unqlite.h"

int archive_files(unqlite *pDb, int argc, char **argv) {
    for (int i = 1; i < argc; i++) {
        void *pMap;
        unqlite_int64 iSize;
        const char *zName = argv[i];

        if (unqlite_util_load_mmaped_file(zName, &pMap, &iSize) != UNQLITE_OK)
            return -1;

        if (unqlite_kv_store(pDb, zName, -1, pMap, (int)iSize) != UNQLITE_OK) {
            unqlite_util_release_mmaped_file(pMap, iSize);
            return -1;
        }
        unqlite_util_release_mmaped_file(pMap, iSize);
    }
    return 0;
}
```

适合：嵌入式配置包、资源 bundle、离线素材库——**一个 db 文件替代 zip + 索引**。

### 案例 3：Jx9 Document Store — users collection

Jx9 脚本（由 C 编译执行）：

```javascript
/* 创建 collection */
if (!db_exists('users')) {
    if (!db_create('users')) { return; }
}

var users = [
    { name: 'james', age: 27, mail: 'dude@example.com' },
    { name: 'robert', age: 35, mail: 'rob@example.com' }
];

db_store('users', users);
db_store('users', { name: 'alex', age: 19, mail: 'alex@example.com' });

print "Total records: ", db_total_records('users'), JX9_EOL;

var row = db_fetch_by_id('users', 1);
print row.name, " -> ", row.mail, JX9_EOL;
```

C 侧骨架：

```c
const char *jx9_src = "/* 上面的脚本 */";
unqlite *pDb;
unqlite_vm *pVm;

unqlite_open(&pDb, "app.db", UNQLITE_OPEN_CREATE);
if (unqlite_compile(pDb, jx9_src, -1, &pVm) != UNQLITE_OK) {
    /* UNQLITE_CONFIG_JX9_ERR_LOG 查看编译错误 */
    return 1;
}
unqlite_vm_exec(pVm);
unqlite_vm_release(pVm);
unqlite_close(pDb);
```

Document 记录在磁盘上用 **fastJSON** 格式存储；查询、聚合逻辑写在 Jx9 里，C 只负责编译与执行。

### 案例 4：KV 游标逆序扫描

```c
unqlite_kv_cursor *pCur;
unqlite_kv_cursor_init(pDb, &pCur);
unqlite_kv_cursor_last_entry(pCur);

while (unqlite_kv_cursor_valid_entry(pCur)) {
    /* unqlite_kv_cursor_key() / unqlite_kv_cursor_data() 消费当前项 */
    unqlite_kv_cursor_prev_entry(pCur);
}
unqlite_kv_cursor_release(pCur);
```

用于审计、导出全库、测试环境清理。

## 与 SQLite / Redis 怎么选

| 维度 | UnQLite | SQLite | Redis |
|------|---------|--------|-------|
| 进程模型 | 库内嵌 | 库内嵌 | 独立服务 |
| 数据模型 | KV + JSON collection | 关系表 + SQL | 内存数据结构 |
| 典型延迟 | 本地磁盘 | 本地磁盘 | 网络 + 内存 |
| 生态 / 工具 | 小 | 极大 | 极大 |
| 许可 | BSD | Public Domain | BSD（服务端） |

**更适合 UnQLite**：C/C++ 程序要**单文件 NoSQL**、要 JSON 文档又不想嵌 MongoDB；配置/缓存/小工具数据。**不太适合**：复杂 SQL 分析、多机分布式、或已有成熟 ORM 的全栈 Web 主库。

## 踩过的坑

1. **Document 层必须走 Jx9**：不能指望纯 C API 插入 JSON；要么编译脚本，要么只用 KV 自己序列化 JSON 字符串。
2. **append 与 store 语义不同**：对同一 key 误用 `append` 会不断变长 value，迁移前要想清覆盖还是追加。
3. **错误码要显式处理**：`UNQLITE_BUSY`、`UNQLITE_COMPILE_ERR` 等分支官方示例都有；静默忽略会导致半写入状态。
4. **社区与周边少**：没有 PostgreSQL 级别的 GUI、备份生态；生产用要自行封装监控与迁移。
5. **与 SQLite 不是替代关系**：需要 JOIN、约束、成熟 SQL 工具链时仍应选 SQLite。

## 学习路径建议

1. 从 [UnQLite in 5 Minutes](https://unqlite.symisc.net/intro.html) 下载 amalgamation 单文件，编译案例 1。
2. 读 [API Intro](https://unqlite.symisc.net/api_intro.html) 区分 KV / Document / Cursor / Transaction 接口族。
3. 需要 Document 时读 [Introduction to Jx9](https://unqlite.symisc.net/jx9_intro.html)，在脚本里试 `db_fetch_all`。
4. 架构深入看 [Architecture](https://unqlite.symisc.net/arch.html) 里的存储引擎与 VM 分层。

## 小结

UnQLite 把 **Berkeley DB 式 KV** 和 **MongoDB 式 JSON collection** 塞进**一个嵌入式 C 库、一个数据库文件**里。零配置、ACID、跨平台单文件，是嵌入式 NoSQL 的清晰教科书实现；代价是生态小、Document 依赖 Jx9。零基础记住三句：**`unqlite_open` 打开抽屉；KV 用字节 API；JSON 用 Jx9 脚本。** 在此基础上再读游标、事务与自定义存储引擎，就够支撑小型本地数据项目。
