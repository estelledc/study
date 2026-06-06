---
title: Thrift — 写一份 IDL 自动生成 28 种语言的 RPC 代码
来源: 'https://github.com/apache/thrift'
日期: 2026-05-30
子分类: Web 后端
分类: 后端 API
难度: 中级
provenance: pipeline-v3
---

## 是什么

Apache Thrift 是一套**写一份"接口定义文件"，自动生成 28 种语言的客户端和服务端代码**的 RPC 框架。日常类比：像翻译事务所——你交一份中文合同，他同时给你出英文、日文、法文、德文……每份都和原稿严格对应，谁拿到都能用。

你写一份 `.thrift` 文件：

```thrift
service UserService {
  User getUser(1: i64 id)
}
struct User { 1: i64 id, 2: string name }
```

跑一行 `thrift --gen py user.thrift && thrift --gen go user.thrift`，得到 Python 服务端 stub 和 Go 客户端 stub。Go 进程能直接调 Python 进程的 `getUser`，参数和返回值都是强类型，传输是紧凑二进制——比 JSON 小 5-10 倍。

这就是 2007 年 Facebook 解决"内部 Java/Python/Ruby/C++ 服务相互调用"问题的方案，也是 gRPC 出现之前最主流的多语言 RPC 框架。

## 为什么重要

不理解 Thrift，下面这些事都没法解释：

- 为什么 2010 年代 Hadoop / Cassandra / HBase 全靠它对外暴露接口
- 为什么 gRPC 出现后大家说"换个皮"——因为核心思想（IDL + codegen + 二进制协议）都是 Thrift 早做的
- 为什么 schema 演进（加字段、删字段）有"字段编号"这种约定——Thrift / protobuf 的共同发明
- 为什么后端面试聊"序列化"绕不开 TBinaryProtocol vs TCompactProtocol

## 核心要点

Thrift 的工程价值可以拆成 **三件事**：

1. **IDL 是契约源真相**：所有语言版本从同一份 `.thrift` 文件生成。类比：建筑图纸先画一份，所有施工队照着盖，不会有人偷加一面墙。

2. **三层正交设计**：Protocol（编码：Binary / Compact / JSON）+ Transport（传输：Socket / HTTP / Framed）+ Processor（业务分发）三层独立。类比：寄快递——内容怎么打包、走哪家物流、谁来签收，三件事互不绑定。

3. **字段编号 + 可选字段 = 向前向后兼容**：每个字段有数字 tag（`1:`, `2:`），新版本加字段不破坏旧客户端，只要别动旧编号。类比：考卷加新题不影响老题答题卡的对位。

三件事加起来：跨语言、跨版本、跨网络。

## 实践案例

### 案例 1：写最小 IDL → 生成代码 → 跨语言调用

`user.thrift` 文件：

```thrift
namespace py demo
namespace go demo

struct User {
  1: required i64 id,
  2: optional string name,
}

service UserService {
  User getUser(1: i64 id),
}
```

**逐部分解释**：

- `namespace py demo` 告诉编译器生成 Python 包名 `demo`
- `1: required i64 id` ——字段编号 1，64 位整数，必填（**生产中尽量别用 required**，见踩坑 2）
- `service UserService { ... }` 定义一个 RPC 服务，里面每个方法变成 stub 上的同名函数

跑 `thrift --gen py user.thrift` → 生成 `demo/UserService.py`，里面已有 `Iface`（接口）和 `Client`（客户端）两个类，直接 import 就能用。

### 案例 2：Cassandra 0.x 时代的 Thrift API

Cassandra 1.x 之前所有 client driver 都直接调 Thrift 接口，比如 Python 的 `pycassa`：

```python
client = Cassandra.Client(protocol)
client.set_keyspace('mydb')
client.insert('row1', col_parent, column, ConsistencyLevel.ONE)
```

后来 Cassandra 2.x 推 CQL（类 SQL 语法）取代 Thrift，原因是 Thrift API 太底层（要手写 column family 操作），用户难学。这是经典的 **"协议太透明反而不好用"** 教训——RPC 暴露内部数据结构，会让 API 演进绑死实现。

### 案例 3：TBinaryProtocol vs TCompactProtocol 字节对比

同一个 `User { id=1, name="alice" }`：

- **TBinaryProtocol**：~25 字节（每个字段 type tag 1 字节 + field id 2 字节 + 长度 4 字节 + 数据）
- **TCompactProtocol**：~10 字节（type 和 id 压到 1 字节，整数用 zigzag varint 变长编码）

Compact 用 zigzag varint：小数字（0-127）只占 1 字节，负数也短。代价是编解码 CPU 略高。结论：**外网 / 移动端用 Compact，内网高并发可保留 Binary**。

## 踩过的坑

1. **字段编号一旦上线永远不能改**：删字段后编号要保留注释，新字段必须用全新编号；改了等于让旧客户端读到错位字节，类型对不上直接崩。
2. **required 字段是不可逆地雷**：早期默认 required，一旦发布就回不到 optional，全公司客户端被迫同步升级；社区共识是**永远只用 optional**。
3. **Protocol/Transport 不匹配会诡异 hang**：服务端 TFramedTransport 客户端 TBufferedTransport，TCP 握手成功但帧头读不出来，请求永远阻塞——三层正交的代价。
4. **跨语言枚举默认值不一**：Java 默认 0，Go/Python 是 nil/None；新增枚举值时老客户端拿到默认 0 当成有效值，业务逻辑悄悄走错分支。

## 适用 vs 不适用场景

**适用**：

- 多语言混合的内部服务（Java + Python + Go + C++ 同时调）
- 高并发低延迟、需要紧凑二进制协议的场景
- 已有 Thrift 生态的项目（Hadoop / HBase / 老 Cassandra driver）
- 自定义传输层（嵌入式、共享内存、定制 socket）

**不适用**：

- 现代 HTTP/2 多路复用 / streaming → 用 gRPC（基于 HTTP/2，原生流式 + interceptor）
- 浏览器 Web 前端 → Thrift 浏览器支持差，用 connect-rpc / REST + JSON
- 单语言项目 → IDL + codegen 是负担，直接用语言原生 RPC 更轻
- 需要 schema registry / 演进治理的大型 ecosystem → protobuf 工具链更成熟

## 历史小故事（可跳过）

- **2007 年**：Mark Slee 在 Facebook 开发 Thrift，灵感来自 Adam D'Angelo（后来 Quora 创始人）的内部工具 pillar + Google 刚开源不久的 Protocol Buffers
- **2008 年**：Facebook 把 Thrift 捐给 Apache 孵化器
- **2010 年**：Apache Thrift 顶级项目毕业；同期 Cassandra / HBase / Hive 都把 Thrift 作为对外协议
- **2015 年**：Google 开源 gRPC（HTTP/2 + protobuf），新项目逐渐倒向 gRPC；Cassandra 也从 Thrift 切到 CQL
- **至今**：Thrift 仍在 Hadoop 生态、老系统、嵌入式领域运转，是研究 RPC 设计史绕不开的一站

## 学到什么

1. **IDL + codegen** 是跨语言协作的根本解药——比手写 HTTP+JSON 客户端可靠十倍
2. **三层正交（Protocol / Transport / Processor）** 是好框架的范式：每一层能换、能组合、能扩展
3. **schema 演进的代价** 在出生第一天就要想好——字段编号、optional、null 默认值都是十年后才会还的债
4. **协议太透明反而绑死实现**——Cassandra 把 Thrift 换成 CQL 是经典教训，RPC 不该暴露存储引擎细节

## 延伸阅读

- 官方文档：[Apache Thrift Documentation](https://thrift.apache.org/docs/) —— Tutorial 章节有完整 IDL → 多语言例子
- 论文：Mark Slee, Aditya Agarwal, Marc Kwiatkowski — "Thrift: Scalable Cross-Language Services Implementation" (2007 Facebook 白皮书)
- [[grpc-go]] —— gRPC 是 Thrift 的精神后继，HTTP/2 + protobuf
- [[connect-rpc]] —— 现代 Thrift/gRPC 替代，原生支持浏览器
- [[cassandra]] —— 早期靠 Thrift 暴露 API，2.x 后切到 CQL

## 关联

- [[grpc-go]] —— 同样的 IDL+codegen 思路，HTTP/2 取代裸 socket，protobuf 取代 thrift binary
- [[connect-rpc]] —— 在 gRPC 之上做 Web 友好封装；Thrift 当年缺的就是浏览器支持
- [[cassandra]] —— 经典的 "Thrift 暴露过透明 → 改为高层 CQL" 教训
- [[kafka]] —— 同年代 LinkedIn 出品，但只解决消息总线一件事，没做通用 RPC
- [[envoy]] —— 现代 Service Mesh 数据面，原生支持 Thrift / gRPC / HTTP 多协议
- [[etcd]] —— 早期用 gRPC 而非 Thrift；对比能看出 2014 年后云原生选型偏好的转移
- [[nginx]] —— L7 反向代理，可作 Thrift 前端但需要 ngx_thrift_module，远不如 Envoy 原生

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[capnproto]] —— Capn Proto — 数据布局即 wire format 的零拷贝序列化 + RPC
- [[envoy]] —— Envoy — 把网络通信从业务代码里抠出来的代理进程
- [[etcd]] —— etcd — 分布式键值数据库
- [[grpc-go]] —— gRPC-Go — Google RPC 框架的官方 Go 实现
- [[nginx]] —— nginx — 高性能 Web 服务器

