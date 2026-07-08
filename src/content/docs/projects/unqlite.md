---
title: UnQLite — C 写的嵌入式 NoSQL 双模数据库
来源: 'https://github.com/symisc/unqlite'
日期: 2026-07-08
分类: embedded
难度: 中级
---

## 是什么

UnQLite 是一个**塞进 C/C++ 程序里的 NoSQL 数据库引擎**：不用起数据库服务，不用连端口，把 `unqlite.c` 和 `unqlite.h` 跟自己的程序一起编译，就能在一个文件里存数据。

日常类比：[[sqlite]] 像一个随身账本，但账本按表格写；UnQLite 像一个随身收纳盒，既能按"标签 → 物品"放任意字节，也能按 JSON 文档放一组对象。

最小例子：

```c
unqlite *db = 0;
unqlite_open(&db, ":mem:", UNQLITE_OPEN_CREATE);
unqlite_kv_store(db, "hello", -1, "world", 5);
unqlite_close(db);
```

这里 `:mem:` 表示先放内存；换成 `app.db` 就会落到磁盘文件。UnQLite 的特别点是**双模**：底层是 key/value，上一层还有 Jx9 脚本驱动的 JSON 文档库。

## 为什么重要

不理解 UnQLite，下面这些事会很难判断：

- 你会以为"数据库"一定要先部署一个服务，其实嵌入式库也能给本地应用做持久化
- 你会分不清 [[sqlite]]、[[leveldb]]、[[mongodb]] 的边界：UnQLite 刚好站在 SQL、KV、文档库中间
- 你会低估"单文件发布"的工程价值：边缘设备、桌面工具、小型 CLI 常常不想带一堆依赖
- 你会把 Jx9 当成普通 JSON 解析器；它其实是嵌入式脚本 VM，能在数据库内部跑文档操作

## 核心要点

1. **嵌入式进程内引擎**：UnQLite 不是 client/server 数据库。类比：不是去银行柜台办业务，而是钱包里自带一个小账本；好处是部署简单，代价是跨机器复制、权限、运维都要自己在上层做。

2. **KV + Document 双层接口**：KV 层把 key 和 value 都当字节数组，所以字符串、二进制 blob、整份文件都能放。Document 层用 Jx9 操作 JSON 文档，像给收纳盒加了一套"按字段查人名、年龄、邮箱"的脚本语言。

3. **存储引擎和 pager 分层**：官方架构把上层 API、KV/Document 层、可替换存储引擎、pager、VFS 分开。类比：前台负责收单，仓库负责放货，电梯和门禁负责把货安全搬到不同楼层。

## 实践案例

### 案例 1：样例 `samples/1.c` 做最基础 KV 存取

官方 README 建议从 `samples/1.c` 入手，它演示 `store / append / fetch / cursor` 这条主线。

```sh
cc -O2 -std=c99 -I. samples/1.c unqlite.c -o unqlite_kv_intro
./unqlite_kv_intro demo.db
```

核心代码可以缩成这样：

```c
unqlite *db = 0;
unqlite_open(&db, "demo.db", UNQLITE_OPEN_CREATE);
unqlite_kv_store(db, "date", -1, "2026-07-08", -1);
unqlite_kv_append(db, "log", -1, "start;", 6);
unqlite_kv_fetch_callback(db, "date", -1, print_bytes, 0);
unqlite_close(db);
```

**逐部分解释**：

- `unqlite_open` 拿到数据库句柄，后续 API 都围绕这个句柄工作
- `unqlite_kv_store` 是覆盖式写入，`unqlite_kv_append` 是往已有 value 后面追加
- `unqlite_kv_fetch_callback` 不强迫你一次性分配大 buffer，而是把数据分块喂给回调

### 案例 2：样例 `samples/unqlite_tar.c` 把数据库当文件包

官方样例把 UnQLite 做成一个 TAR-like archive：文件名做 key，文件内容做 value。

```sh
cc -O2 -std=c99 -I. samples/unqlite_tar.c unqlite.c -o unqlite_tar
./unqlite_tar assets.db -w config.json logo.png
./unqlite_tar assets.db -r logo.png
./unqlite_tar assets.db -i
```

核心动作是：

```c
void *view = 0;
unqlite_int64 size = 0;
unqlite_util_load_mmaped_file(path, &view, &size);
unqlite_kv_store(db, path, -1, view, size);
unqlite_util_release_mmaped_file(view, size);
```

**逐部分解释**：

- `load_mmaped_file` 把目标文件映射成只读内存视图，不必手写读文件循环
- `kv_store` 直接把整段二进制作为 value 存进去，图片、配置、音频都只是字节
- `-i` 通过 cursor 遍历所有 key，所以这个数据库同时像文件包和索引表

### 案例 3：官方入门页用 Jx9 存 JSON 文档

文档层不是在 C 里手写 JSON 字符串拼接，而是编译一段 Jx9 脚本，让脚本调用 `db_create`、`db_store` 这些内置函数。

```text
if (!db_exists('users')) {
  db_create('users');
}
db_store('users', { name: 'alex', age: 19, mail: 'alex@example.com' });
print db_total_records('users'), JX9_EOL;
```

C 侧大概长这样：

```c
unqlite_vm *vm = 0;
unqlite_compile(db, script, script_len, &vm);
unqlite_vm_config(vm, UNQLITE_VM_CONFIG_OUTPUT, print_bytes, 0);
unqlite_vm_exec(vm);
unqlite_vm_release(vm);
```

**逐部分解释**：

- `unqlite_compile` 把 Jx9 脚本变成 VM，编译错了要读 `UNQLITE_CONFIG_JX9_ERR_LOG`
- `db_store` 存的是 JSON-like 文档，比 KV 层更适合用户资料、配置对象、事件记录
- `vm_release` 必须释放 VM，最后还要 `unqlite_close`，否则会泄漏资源或留下坏数据库映像

## 踩过的坑

1. **以为默认线程安全**：FAQ 说要定义 `UNQLITE_ENABLE_THREADS` 编译选项，才能确认线程安全；不确定时还要调用 `unqlite_lib_is_threadsafe()`。

2. **把它当 MongoDB 服务用**：UnQLite 是进程内库，不负责网络协议、用户权限、复制集、分片；这些不是它的目标。

3. **忘记关闭句柄和 VM**：`unqlite_close` 是数据库句柄的析构动作，Jx9 VM 也要 `unqlite_vm_release`；少一步就容易泄漏或提交状态不清。

4. **大 value 全部拉进内存**：KV fetch 有 callback 版本，官方样例也提醒大数据可能分多次回调；新手直接 `fetch` 到一个大 buffer 会把内存打爆。

## 适用 vs 不适用场景

**适用**：

- C/C++ 桌面应用、CLI、边缘设备，需要一个本地文件保存状态
- 想同时要 KV 和 JSON 文档，不想起 [[mongodb]] / [[redis]] 这类外部服务
- 需要把配置、缓存、小文件、离线数据打包到单个可移动数据库文件
- 想读 C 存储引擎分层：API、pager、VFS、存储引擎边界都比较清楚

**不适用**：

- 需要 SQL、JOIN、二级索引、复杂事务查询，优先选 [[sqlite]] 或 [[postgresql]]
- 需要分布式复制、分片、高可用，应该看 [[mongodb]]、[[tikv]] 或上层系统
- 团队主要语言不是 C/C++，且不想维护 binding / FFI
- 写入量巨大、需要成熟 LSM 调优旋钮，优先研究 [[leveldb]]、[[rocksdb]] 或 [[badger]]

## 历史小故事（可跳过）

- **2013 前后**：Symisc Systems 推出 UnQLite，把"SQLite 式嵌入体验"和 NoSQL 数据模型放在一起。
- **早期定位**：它强调 self-contained、serverless、zero-configuration，明显是在服务化数据库之外给本地应用一个选择。
- **架构选择**：KV 层负责原始字节；Document 层交给 Jx9，这让它不像纯 KV，也不像只会 SQL 的嵌入式库。
- **社区演进**：GitHub 仓库约 2.3k stars，样例集中在 C API、Jx9、cursor、大量插入、文件包这些实用路径。
- **近年状态**：README 标注 public release 1.2.1，并把官方文档迁到 `unqlite.symisc.net`。

## 学到什么

1. **嵌入式数据库是一种部署形态**：它的第一价值不是"功能最多"，而是少一个服务、少一段运维链路。
2. **KV 和文档是两层抽象**：KV 适合原始字节，文档层适合结构化 JSON；两者混在一个引擎里是 UnQLite 的独特卖点。
3. **callback 是大数据友好接口**：存储系统常用"给你一块就处理一块"来避免一次性吃满内存。
4. **小型 C 库也有完整数据库分层**：VFS、pager、transaction、cursor 这些概念并不只属于大型数据库。

## 延伸阅读

- 官方 README：[symisc/unqlite](https://github.com/symisc/unqlite)
- 官方入门：[UnQLite in 5 Minutes or Less](https://unqlite.symisc.net/intro.html)
- 官方 API 导览：[An Introduction to the UnQLite C/C++ Interface](https://unqlite.symisc.net/api_intro.html)
- 官方架构：[The Architecture of the UnQLite Database Engine](https://unqlite.symisc.net/arch.html)
- 同类对照：[[sqlite]]、[[leveldb]]、[[mongodb]]、[[redis]]

## 关联

- [[sqlite]] —— 同样是嵌入式单文件数据库，但 SQLite 走 SQL / B 树路线
- [[leveldb]] —— 同样是嵌入式 KV，重点在 LSM 写入路径而不是文档层
- [[rocksdb]] —— LevelDB 的工程化后继，适合高写入和大量调优
- [[badger]] —— Go 生态嵌入式 KV，代表键值分离路线
- [[mongodb]] —— 文档数据库服务化代表，和 UnQLite 的 Jx9 文档层形成对照
- [[redis]] —— KV/数据结构服务，说明"KV"可以是库，也可以是网络服务
- [[postgresql]] —— 关系型数据库代表，用来对照 SQL、事务和复杂查询能力

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
