---
title: Ceramic — 去中心化事件流协议入门
来源: https://github.com/ceramicnetwork/js-ceramic
日期: 2026-06-13
分类: 区块链
子分类: blockchain-and-crypto
provenance: pipeline-v3
---

# Ceramic — 去中心化事件流协议入门

## 一、从"共享日志本"说起

想象一下，你和几个朋友共用一本日志本。

每个人都可以往本子里写东西。但你只能写自己负责的那一页，别人写的你不能改。每写一笔就翻页，所以顺序永远固定，写过的内容也删不掉。这本日志会被复印，复印本发给所有参与的人，大家手里的本子慢慢变得一样。

这就是 Ceramic 的核心思想：**一个所有人共享、不可篡改、按顺序记录事件的数据网络**。

在传统互联网里，每个应用都有自己的数据库，数据被困在围墙里。Ceramic 想打破这堵墙——把数据变成一种"流"，任何应用都可以订阅、消费、组合这些数据，而不需要自己管数据库。

## 二、Ceramic 是什么

Ceramic 是一个**去中心化的事件流协议**（event streaming protocol），专门为 Web3 应用提供可扩展、可验证、可组合的数据基础设施。

简单来说，它做三件事：

1. **存储事件** — 你把数据写成"事件"发布到 Ceramic 网络
2. **排序事件** — 每个事件流都有全局一致的顺序
3. **锚定到区块链** — 事件会定期锚定到以太坊等链上，获得不可篡改的时间戳

项目地址：[github.com/ceramicnetwork/js-ceramic](https://github.com/ceramicnetwork/js-ceramic)

- 语言：TypeScript（99.3%），新一代节点用 Rust 重写叫 Ceramic One
- 许可：MIT + Apache 2.0 双重许可
- 状态：已上线主网，有 ComposeDB 等上层工具简化开发

## 三、核心概念

### 3.1 事件（Event）

事件是 Ceramic 里最小的数据单元。它包含：

- **data** — 实际的负载数据（通常是 JSON）
- **签名** — 由创建者用 DID 签名，保证来源可信
- **链式哈希** — 每个事件指向它的前一个事件，形成不可篡改的历史链

一旦发布，事件不可修改、不可删除。

### 3.2 流（Stream）

流是一组相关事件的有序序列。你可以把它想象成 Git 仓库里的一个文件：

- 每个流有一个唯一的 StreamID
- 流由"初始事件"（init event）创建，定义了谁可以写入
- 后续事件通过哈希链接到前一个事件，保证完整性

### 3.3 兴趣（Interest）

 Ceramic 网络上有海量的流，你的应用不可能也不需要全部监听。**兴趣（Interest）** 就是你告诉 Ceramic："我只关心这些流"。

你可以按用户 ID、数据模型、或其他维度设置兴趣过滤器。这就像 RSS 订阅——只推送你需要的内容。

### 3.4 生产者与消费者（Producer / Consumer）

- **生产者** — 用 DID 身份向流中写入事件的实体。DID 类似账号，但不是由中心化机构发放的
- **消费者** — 订阅感兴趣的流、处理事件的实体。可以是应用、数据库、分析服务等

### 3.5 模型（Model）与模型实例文档（MID）

模型定义数据的结构和约束，类似数据库的表结构定义。Ceramic 支持三种模型类型：

| 类型 | 含义 | 类比 |
|------|------|------|
| `single` | 每个用户只能创建一个实例 | 用户个人资料 |
| `set` | 每个用户在某个字段上只能创建一个实例 | 每个商品一条评价 |
| `list` | 用户可以创建无限个实例 | 论坛帖子 |

### 3.6 数据管道（Data Pipeline）

原始事件进入网络后，会经过一系列转换生成可查询的结构化数据：

```
raw_events → conclusion_events → event_states → stream_tips → stream_states
```

管道会把数据导出为 Parquet 文件存入 S3，开发者可以用 Flight SQL 查询。

### 3.7 自锚定（Self-Anchoring）

Ceramic 节点可以把流的状态定期锚定到 EVM 区块链上，获得链上时间戳。这意味着任何人都可以在以太坊上验证某个事件确实存在以及它被创建的时间。

## 四、代码示例

### 示例一：创建模型并写入数据

这是用 Ceramic SDK 定义一个用户资料模型，并创建一个实例的完整流程。

```typescript
import { CeramicClient } from "@ceramic-sdk/http-client"
import { ModelClient } from "@ceramic-sdk/model-client"
import { ModelInstanceClient } from "@ceramic-sdk/model-instance-client"
import { getAuthenticatedDID } from "@didtools/key-did"

// 1. 连接 Ceramic 节点并认证身份
const authenticatedDID = await getAuthenticatedDID(new Uint8Array(32))
const ceramic = new CeramicClient({ url: "http://localhost:5101" })

// 2. 创建 ModelClient
const modelClient = new ModelClient({
  ceramic,
  did: authenticatedDID,
})

// 3. 定义模型结构（类似数据库的表结构定义）
const model = {
  version: "2.0",
  name: "Profile",
  description: "A simple user profile",
  accountRelation: { type: "single" },  // 每个用户只能有一个 Profile
  schema: {
    type: "object",
    properties: {
      firstName:  { type: "string", maxLength: 50 },
      lastName:   { type: "string", maxLength: 50 },
      userName:   { type: "string", maxLength: 30 },
      bio:        { type: "string" },
    },
    required: ["userName"],
    additionalProperties: false,
  },
}

// 4. 创建模型流（把模型注册到 Ceramic 网络）
const modelStream = await modelClient.createDefinition(model)

// 5. 用 ModelInstanceClient 创建模型实例文档
const modelInstanceClient = new ModelInstanceClient({
  ceramic,
  did: authenticatedDID,
})

const profileStream = await modelInstanceClient.createSingleton({
  model: modelStream,
  controller: authenticatedDID.id,
})

// 6. 更新数据
await modelInstanceClient.updateDocument({
  streamID: profileStream.baseID.toString(),
  newContent: {
    firstName: "Ada",
    lastName: "Lovelace",
    userName: "ada_lovelace",
    bio: "The first computer programmer",
  },
  shouldIndex: true,
})
```

**代码在说什么？**

1. 连上 Ceramic 节点（本地运行或接入主网）
2. 用 DID 做身份认证
3. 定义了一个 Profile 模型，规定有哪些字段、哪些是必填的
4. 把模型注册到 Ceramic 上，获得一个 modelStream
5. 用这个模型创建了一个具体的个人资料文档
6. 更新了资料内容——这个更新也是一个事件，被追加到流中

### 示例二：发布列表类型模型（论坛帖子）

`list` 类型的模型允许用户创建无限个实例，非常适合论坛帖子、笔记等场景。

```typescript
import { CeramicClient } from "@ceramic-sdk/http-client"
import { ModelClient } from "@ceramic-sdk/model-client"
import { ModelInstanceClient } from "@ceramic-sdk/model-instance-client"
import { getAuthenticatedDID } from "@didtools/key-did"
import { StreamID } from "@ceramic-sdk/identifiers"

const authenticatedDID = await getAuthenticatedDID(new Uint8Array(32))
const ceramic = new CeramicClient({ url: "http://localhost:5101" })

// 定义一个论坛帖子模型
const postModel = {
  version: "2.0",
  name: "ForumPost",
  description: "A post in a decentralized forum",
  accountRelation: { type: "list" },  // 用户可以创建无限个帖子
  schema: {
    type: "object",
    properties: {
      title:   { type: "string", maxLength: 200 },
      body:    { type: "string", maxLength: 5000 },
      tags:    { type: "array",  items: { type: "string" } },
    },
    additionalProperties: false,
  },
}

const modelClient = new ModelClient({
  ceramic,
  did: authenticatedDID,
})

const modelStream = await modelClient.createDefinition(postModel)

// 创建帖子实例（list 类型允许在创建时直接传入内容）
const modelInstanceClient = new ModelInstanceClient({
  ceramic,
  did: authenticatedDID,
})

const postStream = await modelInstanceClient.createInstance({
  model: modelStream,
  content: {
    title: "Hello, Ceramic!",
    body: "This is my first post on a decentralized forum.",
    tags: ["hello", "ceramic", "web3"],
  },
  shouldIndex: true,
})

// 读取帖子当前状态
const state = await modelInstanceClient.getDocumentState(postStream.baseID)
console.log(state.content)

// 更新帖子
await modelInstanceClient.updateDocument({
  streamID: postStream.baseID.toString(),
  newContent: {
    title: "Hello, Ceramic! (Updated)",
    body: "This is my first post on a decentralized forum. I've updated it!",
    tags: ["hello", "ceramic", "web3", "update"],
  },
  shouldIndex: true,
})

// 通过 StreamID 读取任意帖子的当前状态
const anotherPostStreamId = StreamID.fromString(
  "kjzl6hvfrbw6c922l9w7tdox6s15ael7s12v31rgdo1tl08969gq8w90h43b3i8"
)
const anotherState = await modelInstanceClient.getDocumentState(anotherPostStreamId)
console.log(anotherState.content)
```

## 五、为什么要用 Ceramic

| 问题 | 传统方案 | Ceramic 方案 |
|------|---------|-------------|
| 数据孤岛 | 每个 App 独立数据库 | 数据流化，跨应用共享 |
| 用户锁定 | 数据在平台手上 | 用户用 DID 控制自己的数据 |
| 不可篡改 | 中心化数据库可任意改 | 事件不可变，链上锚定可验证 |
| 性能 | 关系数据库查询快但扩展难 | 事件流天然水平扩展 |
| 组合性 | 数据不能直接跨 App 使用 | 任何应用都可以消费同一份数据流 |

## 六、架构概览

```
用户 / 应用
  │
  ▼
DID 身份认证
  │
  ▼
发布事件 → Ceramic 节点网络（P2P 同步）
  │
  ▼
数据管道转换 → Parquet → S3 存档
  │
  ▼
Flight SQL 查询 / 应用消费
  │
  ▼
定期锚定到以太坊区块链
```

## 七、进一步学习

- **官方文档**：[developers.ceramic.network](https://developers.ceramic.network)
- **协议详解**：[Protocol Overview](https://developers.ceramic.network/docs/introduction/protocol-overview)
- **概念入门**：[Ceramic Concepts](https://developers.ceramic.network/docs/protocol/ceramic-one/concepts)
- **Ceramic One**（Rust 重写版）：[Getting Started](https://developers.ceramic.network/docs/protocol/ceramic-one)
- **DID 认证**：[Decentralized Identifiers](https://developers.ceramic.network/docs/dids/introduction)
- **社区论坛**：[forum.ceramic.network](https://forum.ceramic.network)
- **Discord**：[chat.ceramic.network](https://chat.ceramic.network)
