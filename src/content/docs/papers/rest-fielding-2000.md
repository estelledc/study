---
title: REST — Fielding 2000 给 Web API 写下的设计宪法
来源: Roy T. Fielding, Architectural Styles and the Design of Network-based Software Architectures, UC Irvine PhD Dissertation, 2000
日期: 2026-05-31
分类: 后端
难度: 中级
---

## 是什么

REST（**Re**presentational **S**tate **T**ransfer）是 Roy Fielding 在 2000 年博士论文里命名并系统化的一种**网络应用架构风格**。日常类比：它不是某个具体框架，而像是建房子的**建筑规范**——告诉你"承重墙不能砸""窗户最好朝南"，但不规定你用什么砖。

Fielding 不是空想出来的。他是 HTTP/1.0、HTTP/1.1、URI 这几份核心标准的共同作者。他先把 Web 设计了出来，再回头总结**为什么这些选择能撑住整个互联网**——这个总结就是 REST。

REST 的核心是 **六条约束**：

- 客户端-服务器分离
- 无状态（每个请求自带全部上下文）
- 可缓存
- 统一接口（资源 / 表示 / 自描述消息 / 超媒体驱动）
- 分层系统（中间可以插网关、代理、CDN）
- 按需代码（可选）

## 为什么重要

不读 Fielding 原文，下面这些事都说不清：

- 为什么所有 HTTP API 都自称 RESTful，但其中 95% 只是 "HTTP + JSON + CRUD"
- 为什么 web 能横向扩展到全球而 RPC 系统经常卡在某台机器
- 为什么浏览器、CDN、网关都能在中间动手脚而不告诉服务器
- 为什么 GraphQL、gRPC 出现时，社区会下意识拿"是不是 REST"来对比
- 为什么 HATEOAS 这个看起来怪的字母组合其实是 REST 的灵魂

## 核心要点

REST 把 Web 的好处拆成 **六条独立约束**，每加一条就换一份能力：

1. **Client-Server**：把界面和数据切开。结果——前端可以独立演化（浏览器升级不用动后端）。
2. **Stateless（无状态）**：每个请求自带完整上下文，服务器**不记**会话。结果——任何一台机器都能接任何请求，水平扩展立刻成立。
3. **Cache**：响应自己说"能不能缓存、缓存多久"。结果——同样的请求不用每次都打到源站。
4. **Uniform Interface（统一接口）**：所有资源用同一套语义（GET / POST / PUT / DELETE + URI）。结果——一份客户端代码能访问千万个不同服务。
5. **Layered System（分层）**：客户端不知道自己在跟源站还是跟一个网关说话。结果——你可以在中间塞负载均衡、CDN、鉴权层而不破坏协议。
6. **Code-on-Demand（按需代码，可选）**：服务器可以下发可执行代码（JavaScript 就是）。这是六条里**唯一可选**的。

第 4 条"统一接口"还能拆四小条：**资源标识**（每个东西有 URI）/ **通过表示操纵资源**（你拿到的是 JSON / HTML，不是数据库行）/ **自描述消息**（Content-Type 等头自己说明格式）/ **HATEOAS**（响应里附带"下一步能去哪"的链接）。

## 实践案例

### 案例 1：无状态 vs 有状态——扩容三步

```
有状态：服务器 A 记着用户 token，重启就丢，加一台机器还要 sticky session
无状态：每个请求自带 Authorization 头，A/B/C 三台机器都能接，任意一台死了流量自动飘
```

**逐步拆解**：

1. **有状态扩容失败**：会话只在 A 上，加 B 必须 sticky session（流量粘住原机器），A 挂了会话全丢。
2. **改成无状态**：每个请求自带 `Authorization`（或等价凭证），服务器不记会话。
3. **流量可飘**：A/B/C 任一台都能接；死一台，负载均衡把请求转到活着的机器。

这是云原生默认无状态的来源——直接继承 REST 第 2 条约束。

### 案例 2：HATEOAS 是什么样

非 HATEOAS（多数 API）：

```json
{ "id": 42, "status": "pending" }
```

HATEOAS：

```json
{
  "id": 42, "status": "pending",
  "_links": {
    "approve": { "href": "/orders/42/approve" },
    "cancel":  { "href": "/orders/42/cancel" }
  }
}
```

**为什么这样写**：客户端不硬编码 URL 规则，只跟 `_links` 走；服务器改路径时旧客户端仍能发现"下一步"。GitHub API、PayPal API 是少数真正这么做的。

### 案例 3：识别"伪 REST"

```
POST /api/getUser?id=42
POST /api/deleteUser
```

这是 RPC 套着 HTTP 的皮。真 REST 应该：

```
GET /users/42
DELETE /users/42
```

**为什么这样写**：URI 是名词（资源），动作放 HTTP 方法里——同一资源用同一 URI，缓存和网关才能按方法语义工作。

## 踩过的坑

1. **以为 REST 就是 JSON + 四个动词**：原文从没说必须 JSON，HTML / XML / Protobuf 都行。REST 是关于**约束**，不是关于格式。

2. **把 HATEOAS 当装饰**：很多团队选择"先做 CRUD、HATEOAS 以后再说"，结果客户端永远硬编码 URL，永远没法独立演化——这正好破坏了 REST 想守护的能力。

3. **滥用 PUT vs PATCH**：PUT 是**整体替换**（幂等），PATCH 是**部分更新**。混用会让缓存和重试逻辑出错。

4. **会话状态偷偷塞进服务端 + cookie**：技术上能跑，但破坏无状态约束——扩容要 sticky session，机器挂了会话丢；若再缓存带会话的响应且未正确 `Vary`，还会串用户视图。

5. **只看 fielding 论文摘要**：核心干货在第 5 章（六约束推导）和第 6 章（HTTP 应用），跳过这两章基本没读懂。

## 适用 vs 不适用场景

**适用**：

- 公开的、长期演化的 web API（GitHub / Stripe / Twilio）
- 需要 CDN、网关、缓存层介入的高扇出系统
- 客户端类型多样且独立发布（浏览器 / 移动端 / 第三方）的系统

**不适用**：

- 强一致分布式事务 → 用专用协议（2PC / Saga）
- 实时双向通信 → WebSocket / gRPC streaming
- 内部低延迟 RPC → gRPC / Thrift 经常更合适
- 查询形状高度可变 → GraphQL 解决得更直接

## 历史小故事（可跳过）

- **1994**：Fielding 加入 W3C 早期工作，参与 HTTP 设计。
- **1996–1999**：他在 IETF 推进 HTTP/1.1；REST 作为内部设计标签逐步成形，公开完整论述要等到论文。
- **1999**：HTTP/1.1（RFC 2616）发布，Fielding 是主作者之一。
- **2000**：博士论文出版——**REST 第一次在公开文献里被系统命名并推导**。
- **2008 后**：Web 2.0 让 RESTful 变成营销词，多数实现偏离原意。Fielding 本人多次写博客抗议"你们这不叫 REST"。

## 学到什么

1. **架构风格是约束集合**——你不是在选框架，你在选"放弃什么换什么"。这是 Fielding 给软件架构最大的方法论贡献。
2. **每条约束都有代价**：无状态换来扩展性，但损失了"服务器记住你"的便利；统一接口换来通用客户端，但损失了"为某场景特化"的性能。
3. **Web 的成功不是偶然**，是六条约束叠加出来的涌现属性。
4. **理论 → 标准 → 工程**：和 Hindley-Milner 一样，先有数学/方法论，再有标准，最后工业铺开。

## 延伸阅读

- 论文全文（HTML）：[Fielding 2000 dissertation](https://www.ics.uci.edu/~fielding/pubs/dissertation/top.htm)（重点读第 5、6 章）
- Fielding 的吐槽博客：[REST APIs must be hypertext-driven](https://roy.gbiv.com/untangled/2008/rest-apis-must-be-hypertext-driven)（讲清楚什么不是 REST）
- 实践对照：[Richardson Maturity Model](https://martinfowler.com/articles/richardsonMaturityModel.html)（把 REST 拆成四个台阶 0-3，业界共识工具）
- [[hindley-milner]] —— 同样是"理论 → 标准 → 工程"路径
- [[turing-1936]] —— 计算理论的源头，REST 处理的是"分布式计算"层面的约束推导

## 关联

- [[hindley-milner]] —— 都是"先做出能跑的东西，再回头数学化"的代表作
- [[turing-1936]] —— 计算可行性的祖师，REST 是分布式可行性的近代版
- [[lambda-calculus]] —— 都用极少的核心规则推导丰富后果

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[caesar-rexford-2005]] —— Caesar-Rexford 2005 — 你的包为什么绕了大半个地球
- [[couchdb]] —— Apache CouchDB — Erlang 写的文档数据库
- [[fielding-rest-2000]] —— Fielding 2000 — 用约束推导法把 Web 的成功讲成了一门方法
- [[gao-2001-as-relations]] —— Gao 2001 — 用算法猜出互联网上 AS 之间谁给谁付钱
- [[hindley-milner]] —— Hindley-Milner — 编译器自己猜变量类型
- [[jwt-rfc-7519]] —— JWT RFC 7519 — 把身份证装进一段可校验的字符串
- [[lambda-calculus]] —— λ-演算 — 用三条规则表达所有可计算函数
- [[mcp-spec]] —— MCP — 让一个 LLM 客户端能插任何外部能力的 USB 协议
- [[nfs-1985]] —— NFS 1985 — 让远程磁盘看起来像本地磁盘
- [[oauth-2.1-rfc]] —— OAuth 2.1 — 把十年 OAuth 实战经验收口成一份能直接用的规范
- [[pouchdb]] —— PouchDB — 浏览器里的 CouchDB
- [[r-bgp-2007]] —— R-BGP 2007 — 故障切换前先把备份路径塞进邻居口袋
- [[saltzer-1984-e2e]] —— End-to-End Arguments — 把功能尽量推到端上做
- [[skip-locked-postgres-9.5]] —— SKIP LOCKED — 让 Postgres 当任务队列用
- [[subramanian-2002-internet-hierarchy]] —— Subramanian 2002 — 用多个观察点把互联网切成 5 层
- [[tao-2013]] —— TAO — Facebook 给十亿人好友列表造的专用图数据库
- [[turing-1936]] —— Turing 1936 可计算性
- [[xtrace-2007]] —— X-Trace — 比 Dapper 早 3 年的跨层跨协议追踪框架

