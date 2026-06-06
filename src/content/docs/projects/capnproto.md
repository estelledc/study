---
title: Capn Proto — 数据布局即 wire format 的零拷贝序列化 + RPC
来源: 'https://github.com/capnproto/capnproto'
日期: 2026-05-30
子分类: Web 后端
分类: 后端 API
难度: 中级
provenance: pipeline-v3
---

## 是什么

Cap'n Proto 是一套**让数据在内存里长什么样、在网线上传出去就长什么样**的二进制格式，再外加一个**调用还没回来就能用『未来结果』继续调用**的 RPC 系统。日常类比：

- 普通序列化（JSON / Protobuf）像**搬家打包**——每件东西要装箱（serialize）、卸车要拆箱（deserialize）
- Cap'n Proto 像**集装箱标准化**——东西从一开始就放在标准箱里，搬到哪儿都是直接读箱子，**不开箱**

举个具体的：

```capnp
struct Person {
  name @0 :Text;
  age @1 :UInt16;
  friends @2 :List(Person);
}
```

C++ 里读这个 buffer：

```cpp
auto person = msg.getRoot<Person>();
auto name = person.getName();   // 直接指向 buffer 内偏移，没有 memcpy
```

`getName()` 不分配内存、不解码——它就是个**带类型的指针运算**。

## 为什么重要

不理解 Cap'n Proto，下面这些事就解释不了：

- 为什么 Cloudflare Workers 跨 isolate 调用比"绕一圈 JSON"快几个数量级
- 为什么"零拷贝"在网络协议圈被反复吹，到底省了哪一步
- 为什么 RPC 老问题（多跳串行 = 多次 RTT）有比 batch API 更优雅的解
- 为什么 schema 演化比想象的难——Cap'n Proto 严格到能让你切身感受到

## 核心要点

Cap'n Proto 的两条主线：**wire format** 和 **RPC**。

1. **内存布局 = wire format**：没有 varint（Protobuf 那种"小数字省字节"的编码），所有字段对齐到 8 字节边界。指针字段存的是**相对偏移**，可以直接当指针用。代价：占空间稍多；收益：**省整个解码步骤**。

2. **Schema 编译生成绑定**：写 `.capnp` 文件 → `capnp compile` → 生成 C++ / Rust / TS / Go / Python 头文件，类型安全、字段 ID 显式（`@0` / `@1`）。

3. **Promise pipelining（时间旅行）**：客户端调 `a = server.foo()`，**不等结果**就调 `b = a.bar()`。两次调用打包成一个 RPC 请求一次发出去，服务端在 `foo` 返回的瞬间立即用结果调 `bar`。N 次串行调用从 N 个 RTT 压成 1 个。

三块加起来：序列化几乎免费 + 多跳 RPC 几乎免费。

## 实践案例

### 案例 1：Cloudflare Workers 跨 isolate 调用

Workers 里你写：

```ts
const result = await env.MY_KV.get("key");
```

底层不是 HTTP，是 Cap'n Proto RPC。请求方把"调用 KV 的 get 方法"打包成一个 Cap'n Proto buffer，跨 isolate 边界传过去；KV 的 isolate 直接 mmap 这块 buffer，**没有 JSON parse、没有反射**。一次调用的开销从微秒级压到纳秒级。

### 案例 2：本地缓存落盘

把数据库行序列化成 Cap'n Proto 写文件：

```cpp
capnp::MallocMessageBuilder msg;
auto user = msg.initRoot<User>();
user.setName("Jason");
user.setAge(25);
writeMessageToFd(fd, msg);
```

重启进程时 `mmap` 这个文件，**不用反序列化**：

```cpp
capnp::PackedFdMessageReader reader(fd);
auto user = reader.getRoot<User>();
// 读 user.getName() 直接走文件 mmap 区
```

10GB 缓存重启时间从 30 秒（JSON parse）降到 0.1 秒（mmap）。

### 案例 3：游戏房间状态同步

服务器在 100 个房间之间转发玩家状态。状态结构体定义在 `.capnp`，每帧产生一个 buffer。转发时**不拷贝 / 不解码**，buffer 直接通过 socket 写出。10 万 QPS 下 CPU 占用从 60% 降到 10%。

## 踩过的坑

1. **Schema 演化比 Protobuf 严格**：字段 ID（`@N`）一旦发布**绝不能改**，类型也不能换；新增字段只能在末尾。Protobuf 还允许"重命名 + 同 ID 继续兼容"，Cap'n Proto 这条更死板。

2. **"零拷贝"是营销词**：反序列化省了，但**跨进程/跨网络该拷贝还是拷贝**。如果你以为 Cap'n Proto 让网络传输也变零拷贝，会失望。

3. **RPC 生态远不如 gRPC**：`capnp-rpc` 在 C++ / Rust 上能用，TS / Go / Python 客户端质量参差。生产上很多团队只用 wire format，RPC 自己包一层 HTTP。

4. **Promise pipelining 调试难**：错误堆栈跨好几个未完成的 promise，定位"到底哪一跳挂了"比同步调用难得多。新人常被绕晕。

## 适用 vs 不适用场景

**适用**：

- 同机进程间 / 跨 isolate 高频通信（Cloudflare Workers 是教科书案例）
- 需要把序列化成本压到接近零的热路径（游戏、HFT、实时分析）
- 有"先调 A、用 A 的结果调 B"这种链式 RPC 模式
- 数据持久化到磁盘需要快速冷启动加载（mmap 直读）

**不适用**：

- 需要人类可读 / curl 能调 → 用 JSON
- 需要丰富的工具链 / 大量第三方库 / 多语言客户端齐全 → 用 Protobuf + gRPC
- 数据量小、延迟不敏感的普通后端 API → 优化错地方了
- schema 经常变、需要频繁字段重命名 → Cap'n Proto 死板会扎手

## 历史小故事（可跳过）

- **2008 年前后**：Kenton Varda 在 Google 主导 Protobuf v2，把 Protobuf 推成内部默认 RPC 格式
- **2013 年**：Varda 离职做 Sandstorm（个人服务器平台），实现时嫌 Protobuf 解码太慢，造了 Cap'n Proto
- **2017 年**：Sandstorm 商业化失败，Varda 加入 Cloudflare
- **2018 年**：Cloudflare Workers 上线，跨 isolate 通信底层就是 Cap'n Proto
- **至今**：Workers 每天处理万亿级请求，每条都在跑 Cap'n Proto——这套格式间接成了"互联网半壁江山的 RPC 底层"

## 学到什么

1. **"数据布局 = wire format" 是值得记住的设计哲学**——只要能接受字段对齐的空间代价，就能换来"免费序列化"
2. **Promise pipelining 把『时间』当成可优化对象**——这是同步调用永远做不到的事，本质上是**让代码描述依赖图，让运行时压平 RTT**
3. **Schema 严格度是双刃剑**：演化困难是代价，但它换来的是"二进制兼容性可以靠编译器保证而不是靠口头约定"
4. **架构决定生态**：Cap'n Proto 技术上比 Protobuf 优雅，但 gRPC 的生态势能让它始终是小众工具

## 延伸阅读

- 官网首页有完整 wire format 图解：[capnproto.org](https://capnproto.org/)
- 作者博文《Cap'n Proto: Infinity Times Faster》——营销梗的来源，但解释 RPC pipelining 很到位
- Cloudflare 博客《How Workers Sandbox is Built》——讲 Cap'n Proto 在 isolate 间怎么用
- [[grpc-go]] —— 对比对象：成熟生态 vs 极致性能
- [[connect-rpc]] —— 现代 RPC 协议另一种思路（HTTP/JSON 友好）

## 关联

- [[grpc-go]] —— 同生态位竞品；gRPC 胜在工具链，Cap'n Proto 胜在零开销和 pipelining
- [[thrift]] —— Facebook 出品的更老一辈跨语言 RPC，定位类似 Protobuf
- [[quic]] —— 网络层面减少 RTT；Cap'n Proto 在应用层做同样的事（pipelining）
- [[connect-rpc]] —— 让 gRPC 兼容 HTTP/JSON 的协议；与 Cap'n Proto 是相反方向的取舍
- [[hewitt-actor-model]] —— Cap'n Proto 的 capability RPC 模型本质上是 actor 思想的工程化
- [[raft]] —— 分布式系统底层；Cap'n Proto 常被用作 Raft 节点间的消息编码

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[grpc-go]] —— gRPC-Go — Google RPC 框架的官方 Go 实现
- [[hewitt-actor-model]] —— Hewitt Actor 模型 — 把计算拆成一群只会发消息的小邮筒
- [[quic]] —— QUIC — 把可靠传输从内核搬到用户空间
- [[raft]] —— Raft — 易理解的共识算法
- [[thrift]] —— Thrift — 写一份 IDL 自动生成 28 种语言的 RPC 代码

