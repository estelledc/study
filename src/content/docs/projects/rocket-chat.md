---
title: Rocket.Chat — 开源 Slack 替代，Meteor + MongoDB 全栈实时聊天
来源: 'https://github.com/RocketChat/Rocket.Chat'
日期: 2026-05-30
子分类: 实时通信
分类: 通信
难度: 中级
provenance: pipeline-v3
---

## 是什么

Rocket.Chat 是**开源团队聊天平台**，俗称"自托管的 Slack"。日常类比：你买不起也信不过 Slack 的服务器，于是自己在公司机房搭一台，UI 看着像 Slack（频道、私信、线程、表情），但所有数据落在自家 MongoDB——这就是 Rocket.Chat。

它是一个 **Meteor + MongoDB + React** 的全栈应用：浏览器和服务端通过 **DDP**（Distributed Data Protocol，跑在 WebSocket 上）实时同步数据，客户端 subscribe 一个 collection，服务端 publish diff，UI 自动重渲染。这是 2015 年代表性的"reactive web app"写法。

最小用法：

```bash
# 30 分钟自建一台
docker compose up -d   # 起 mongo + rocketchat 两个容器
# 浏览器打开 http://localhost:3000，注册第一个账号即超管
```

特色是 **Omnichannel**：把客户官网挂件（LiveChat）、邮件、WhatsApp、微信、Twitter 等渠道汇到一个工作台，客服在 Rocket.Chat 内回，访客在自己渠道看到回复。这点是 [[element-web]] / [[signal-server]] 都不做的方向。

## 为什么重要

不理解 Rocket.Chat，下面这些事都没法解释：

- 为什么"自托管 IM"选型时它和 Mattermost 永远一起被提——一个 Meteor 路线（功能多）、一个 Go 路线（性能稳），代表两种工程取舍
- 为什么它和 [[element-web]] 是不同物种：Element 是 Matrix **协议**的客户端壳，Rocket.Chat 是**产品**——前者卖联邦互通，后者卖企业 omnichannel
- 为什么和 [[signal-server]] 也不是一回事：Signal 端到端加密是默认刚需，Rocket.Chat 的 E2EE 是可选项，因为客服场景不允许服务端"看不到内容"
- 为什么 Apps Engine 是早于 Slack apps 的插件市场雏形——理解一次"BaaS + 插件平台"该长什么样

## 核心要点

Rocket.Chat 的设计可以拆成 **四层**：

1. **Meteor 全栈 reactive**：客户端订阅服务端 MongoDB collection 的"实时视图"，DDP 协议在 WebSocket 上传 diff，UI 自动重渲染。类比：Excel 表格——你改一个 cell，所有引用它的 cell 立刻刷新；Rocket.Chat 把这个模型推到了"消息流"。

2. **MongoDB 当唯一数据库**：消息、用户、房间、订阅、权限全部 collection，没有关系型 join，靠应用层聚合查询。好处是 schema 弹性大、上手快；代价是百万级消息后索引调优、分片拆分非常头疼。

3. **Apps Engine 沙箱**：插件用 TypeScript 写，跑在独立的 Deno-like 沙箱里，能注册 slash command、消息钩子、外部 webhook。不需要 fork 主仓，App marketplace 直接装——这是它能做企业市场的关键。

4. **Omnichannel 一等公民**：LiveChat 小挂件嵌到客户官网（一段 JS），访客消息直接落到 Rocket.Chat 的客服工作台。这条链是 Rocket.Chat 区别于 [[matrix-js-sdk]] 系列的核心商业卖点。

## 实践案例

### 案例 1：30 分钟自建团队 IM

`docker-compose.yml` 里两个 service：`mongo` 和 `rocketchat`，端口映射 3000，环境变量配 `ROOT_URL` 和 `MONGO_URL`：

```yaml
services:
  rocketchat:
    image: rocket.chat:latest
    environment:
      ROOT_URL: https://chat.example.com
      MONGO_URL: mongodb://mongo:27017/rocketchat
```

启动后浏览器开 3000 端口，第一个注册的账号自动是超管。团队成员浏览器开网页就能用，消息全在你 MongoDB 里。

### 案例 2：在客户官网嵌 LiveChat

后台开启 LiveChat 后，官网 `<head>` 里粘一段 JS snippet：访客点页面右下气泡，消息直接落到 Rocket.Chat 的 omnichannel 工作台；客服在 Rocket.Chat 内回，访客在自己网页气泡看到回复。整条链路不需要客服侧装任何插件，是中小企业最常用的"售前对话"方案。

### 案例 3：用 Apps Engine 写个 GitLab webhook

App 用 TypeScript 写，注册一个 endpoint 监听 GitLab push event，把 commit 信息推到指定频道：

```ts
class GitLabApp extends App {
  public async executePostMessageSent(message, read, http, persistence, modify) {
    // 监听消息钩子，或注册外部 webhook 处理 GitLab 推过来的 payload
  }
}
```

打包 zip 上传到 Apps marketplace 即装好，**不用动主仓代码、不用重启服务**。

### 案例 4：读源码搞懂 DDP 怎么驱动 UI

入口在 `apps/meteor/client/`：客户端用 `Meteor.subscribe('messages', roomId)` 订阅一个 publication，服务端从 MongoDB 读 + 监听 oplog，把符合条件的文档变更通过 DDP 推回客户端。React 组件用 `useReactiveValue` 订阅 client-side minimongo，数据一变就重渲染。读这条链能搞懂"为什么 Meteor 时代不需要手写 WebSocket 协议"——它把 collection 直接镜像到了浏览器。

## 踩过的坑

1. **把它当"Slack 纯前端替代"**：它是全栈 Meteor 应用，DDP 长连接吃内存，500 并发就要做调优；不是套个 React 皮就完事。

2. **MongoDB 在大消息量下成瓶颈**：百万级消息的索引重建、分片拆分是企业部署最头疼的事。和 [[mongodb]] 那篇说的"document 模型友好"是一体两面。

3. **默认没 E2EE**：Rocket.Chat 有可选端到端加密但默认关闭，客服 omnichannel 场景**根本不能开**——服务端要能搜索、合规审计、AI 摘要。和 [[signal-server]] 这种"服务端零知识"出发点完全相反。

4. **Apps Engine SDK 升级常 breaking**：第三方 App 跟不上主版本是日常，部署生产时一定锁住 Rocket.Chat 主版本和 App 版本组合。

5. **和 Mattermost 撞型**：选型时常被一起评估。Mattermost 用 Go + Postgres，性能稳定、内存省；Rocket.Chat 胜在功能丰富度（omnichannel、Apps marketplace）。卷功能选 Rocket.Chat，卷性能选 Mattermost。

6. **DDP 长连接是双刃剑**：实时体验比传统轮询好很多，但代价是每个在线用户都吃一个 WebSocket + Meteor 服务端的内存上下文，水平扩缩容必须配 sticky session 或 Redis oplog 转发，比无状态 HTTP 复杂一档。

## 适用 vs 不适用场景

**适用**：

- 中小团队自托管 IM，对数据主权敏感、不想被 Slack 订阅锁定
- 客服 / 售前场景需要 omnichannel：官网挂件 + 邮件 + WhatsApp 汇到一个后台
- 想做企业内 IM 二次开发，用 Apps Engine 接入内部系统（OA、工单、CI）
- 学 Meteor + MongoDB 实时应用架构——这是该路线最完整的活样本

**不适用**：

- 强加密刚需（医疗、法务、记者）→ 用 Signal / Matrix（[[element-web]] + [[synapse]]）
- 跨组织联邦互通刚需 → 用 Matrix 系，Rocket.Chat 没有联邦协议
- 超大规模（同房间 10 万人 + 实时）→ Meteor + MongoDB 需要重度改造，不如商用方案
- 极简轻量需求 → 用 Mattermost 或干脆 Discord 商用

## 历史小故事（可跳过）

- **2015 年**：巴西公司 Konecty 开源 Rocket.Chat 0.0.1，目标做 Slack 的开源对位。
- **2016 年**：GitHub 突破万星，成早期开源 IM 标杆之一。
- **2018 年**：推 Apps Engine，把插件平台从概念变现实，对位 Slack apps。
- **2020 年**：疫情远程办公爆发，装机量暴涨，omnichannel 路线被市场验证。
- **2024 年起**：开始把后端从 Meteor 慢慢拆走，向 Node.js + microservices 迁移；但 MongoDB 仍是主库。这场迁移的动力之一是 Meteor 生态本身在收缩，Galaxy 之外的 Meteor 社区活跃度逐年下降。

10 年下来活成了"开源 IM 老兵"，41k stars 是开源团队聊天分类里数一数二的。和 Slack 同期开源、同期推 Apps，但走出了一条不一样的"自托管 + omnichannel"路。

## 学到什么

0. **同一个"开源 IM"赛道上有三种心智**：Rocket.Chat 是产品 + omnichannel，[[element-web]] 是协议 + 联邦，[[signal-server]] 是端到端零知识。看一个项目时先问它选了哪条路，再看代码就不会被表象迷惑

1. **产品优先 vs 协议优先是两条路**：Rocket.Chat 选产品（omnichannel、Apps），[[element-web]] 选协议（Matrix 联邦），看用户买的是哪一头
2. **Meteor 是 web 实时应用的"上一代主流"**：Reactive collection + DDP 让 2015 年的 web 第一次像桌面 IM 那样流畅；今天 React + WebSocket + state lib 把这套拆开重写了
3. **MongoDB 当主库的代价**：schema 弹性换来运维成本，百万消息后必须做索引和分片功课
4. **插件平台 = 长期生命力**：Apps Engine 让 Rocket.Chat 不靠主仓也能持续生长，这是企业产品的护城河
5. **E2EE 不是越多越好**：客服、合规、审计场景需要服务端能看见内容；安全是和业务匹配的，不是绝对越强越好

6. **企业 IM 的护城河是"接口"**：消息收发只是入口，真正粘性来自 LiveChat 集成、Apps marketplace、SSO/LDAP、合规审计——选型时如果只比"消息体验"必然忽略这些重头戏

## 延伸阅读

- 官方文档：[Rocket.Chat Docs](https://docs.rocket.chat/)（部署 + Apps 开发都看这里）
- Apps Engine 开发：[Rocket.Chat Apps Engine](https://developer.rocket.chat/)（写第一个 App）
- DDP 协议：[Meteor DDP Spec](https://github.com/meteor/meteor/blob/devel/packages/ddp/DDP.md)（理解 Meteor 怎么把 MongoDB 推到浏览器）
- [[element-web]] —— Matrix 协议参考客户端，对比"产品 vs 协议"两条路
- [[signal-server]] —— 端到端加密优先的 IM 后端，对比"零知识 vs omnichannel"两种选择
- [[mongodb]] —— Rocket.Chat 唯一数据库，理解它的 document 模型

## 关联

- [[element-web]] —— Matrix 协议旗舰客户端，和 Rocket.Chat 的"产品 vs 协议"是两条对位路线
- [[signal-server]] —— 服务端零知识 IM 后端，和 Rocket.Chat 的 omnichannel 思路完全相反
- [[matrix-js-sdk]] —— Matrix 客户端 SDK，对比"瘦壳 + 厚 SDK"和"全栈 Meteor"两种架构
- [[synapse]] —— Matrix 参考 homeserver，对比"联邦协议"和"单体产品"两种部署模型
- [[mongodb]] —— Rocket.Chat 的唯一数据库，理解它的优势和瓶颈
