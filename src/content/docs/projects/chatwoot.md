---
title: chatwoot — 把 11 种外部聊天渠道归一到同一张消息表
来源: 'chatwoot/chatwoot, MIT License, v4.14.1 (2026-05)'
日期: 2026-05-29
分类: 客服平台
难度: 中级
---

## 是什么

chatwoot 是一套**开源的客服平台**，可以替代 Intercom / Zendesk 这类闭源 SaaS。日常类比：像一家便利店的总服务台——不管顾客是打电话来、写邮件来、还是从某个购物 app 私信来，店员永远在同一个柜台后面接待，所有对话都记到同一本台账上。

技术上它用 Rails 7 写后端、Vue 3 写前端，把 web 聊天框、邮件、WhatsApp、Facebook Messenger、Instagram、Telegram、Line、SMS、API 等 **11 种外部渠道**都翻译进同一张 `messages` 数据表，再统一推给客服后台。代码 MIT 协议，可自托管。

## 为什么重要

不理解 chatwoot 的设计，下面这些事都没法解释：

- 为什么一个 30k star 的客服平台**不引入 Kafka / RabbitMQ** 也能做"一条消息触发 10 个动作"
- 为什么"加一个新聊天渠道"在 chatwoot 里只要新写一个 webhook controller，不用改主流程
- 为什么 Intercom 卖 SaaS 卖得这么贵，但开源替代品依然能在同一个市场活下来
- 为什么"实时聊天"和"客服工单"在传统认知里是两套系统，到 chatwoot 这里却是同一行 Postgres

## 核心要点

chatwoot 的工程价值可以拆成 **三招**：

1. **反向归一**：不是定义"统一接口让所有渠道实现"，而是**每个渠道自己写一个 webhook controller**，把外部消息塞进统一的 `messages` 表。类比：不是要求所有快递公司用同款包装盒，而是在收件处装一个翻译员，谁来都拆成一样的内容。

2. **after_commit 事件总线**：消息一旦存进数据库，Rails 的 `after_commit` 钩子触发一个全局 `Dispatcher`，它再把事件分发给一堆 listener（推 WebSocket、发 Slack、跑自动化规则……）。类比：邮局一封信送到分拣中心，分拣员同时通知收件人、寄件人、统计员，互不干扰。

3. **pubsub_token 实时推送**：每个用户和访客都有一个私有 token，前端用它订阅一条 ActionCable WebSocket 流。后端推消息时只需算出"哪些 token 关心这条"，broadcast 出去。类比：每个人办了张专属频道券，电台只对持券人广播。

## 实践案例

### 案例 1：一条访客消息怎么实时到客服界面

访客在网页聊天框打 "hello" 按发送，链路如下：

```
widget → POST /api/v1/widget/messages
       → MessageBuilder.save!（写 messages 表）
       → after_commit → Dispatcher.dispatch(MESSAGE_CREATED)
       → ActionCableListener.broadcast(tokens, payload)
       → Redis pub/sub
       → 客服 dashboard 的 WebSocket 收到 → Vuex ADD_MESSAGE → UI 重渲
```

关键在第 4 步：listener 是**平行**的，同一事件会同时触发"推 ws"、"发邮件通知"、"跑自动化规则"，互不阻塞。

### 案例 2：Dispatcher 的 23 行代码

```ruby
class Dispatcher
  include Singleton
  attr_reader :async_dispatcher, :sync_dispatcher

  def self.dispatch(event_name, timestamp, data, async = false)
    Rails.configuration.dispatcher.dispatch(event_name, timestamp, data, async)
  end

  def initialize
    @sync_dispatcher = SyncDispatcher.new
    @async_dispatcher = AsyncDispatcher.new
  end

  def dispatch(event_name, timestamp, data, _async = false)
    @sync_dispatcher.dispatch(event_name, timestamp, data)
    @async_dispatcher.dispatch(event_name, timestamp, data)
  end
end
```

**逐部分解释**：

- `include Singleton` 让全 app 共用一个实例
- 同时跑 `sync_dispatcher`（请求线程内立即执行，比如推 ws）和 `async_dispatcher`（推到 Sidekiq 后台跑，比如调三方 API）
- listener 注册时按"事件名 → 同名方法"约定，新增事件类型只要加个常量 + 在感兴趣的 listener 加方法

### 案例 3：消息列表的 cursor 分页

```ruby
def messages_before(before_id)
  messages.reorder('created_at desc').where('id < ?', before_id).limit(20).reverse
end

def messages_after(after_id)
  messages.reorder('created_at asc').where('id > ?', after_id).limit(100)
end
```

不传"第几页"，传"我已经看到的最后一条 id"。在百万级 message 表里 `OFFSET` 翻页延迟会爆炸，cursor 始终走主键索引，O(log n)。三个方向（before / after / between）limit 不同，是体验和后端压力的工程妥协。

## 踩过的坑

1. **状态机用整数 enum**：`status: { open: 0, resolved: 1, pending: 2, snoozed: 3 }` 一行写完，但加新状态必须追加在末尾，改顺序会让历史数据错位——代码里留了 5 年的 `# FIXME: implement state machine with aasm` 是诚实的技术债。
2. **10 个 concern 全 include 进 Conversation**：grep 主类查不到方法定义，IDE 跳转、新人理解都付额外成本，新项目用更显式的 service object 更好。
3. **`destroy_async` 依赖 Sidekiq 健康**：删一个对话级联删 messages / attachments / blobs 全走 ActiveJob，Sidekiq 阻塞会让孤儿数据堆在数据库里。
4. **dev 与生产架构不一致**：`docker compose up` 起的是 ActionCable on Puma，生产真上规模要换 AnyCable + 独立 PG / Redis 实例，学习时不要假设你看到的就是生产实际。

## 适用 vs 不适用

**适用**：
- 自托管 / 内网部署 / 合规要求严格的客服场景
- 需要扩展自定义渠道（比如插一个内部 IM）
- 团队规模 < 100 客服，AI 助手不是核心 KPI
- Rails + Postgres + Redis 栈已经在用、不想再加新中间件

**不适用**：
- AI assistant 是产品核心 → 选 Intercom（Fin 比 chatwoot Captain 成熟）
- 大型企业 ITIL 工单流 → 选 Zendesk
- 需要事件溯源 / 跨服务回放 → after_commit 撑不住，要上 Kafka
- 完全 SaaS 不愿运维 → chatwoot 也有 cloud 版，但生态不如闭源大厂

## 历史小故事（可跳过）

- **2017 年**：印度班加罗尔的 Sojan Jose 看不下去 Intercom 的按 user 计费，开始写一个"可自托管的 live chat"。
- **2021 年**：项目进 Y Combinator W21 批，公司更名 Chatwoot Inc.，主动 pivot 到完全开源（MIT），拿"开源 + cloud 双轨"商业模式。
- **2022-2024 年**：把功能从 live chat 扩到 omni-channel desk，加进 WhatsApp / Instagram / SMS / Email 适配器，进入"不止聊天还做工单"的版图。
- **2026 年**：发布 v4 系列，加进 Captain AI 集成（基于 OpenAI 适配），star 数稳定在 30k 区间。

## 学到什么

- **Rails 自带的 `after_commit` + Sidekiq + ActionCable 三件套足以撑 30k star 体量**，不要一上来就引入 Kafka / NATS——除非业务真的需要"事件溯源 + 跨服务回放"。
- **多渠道集成的"反向归一"比"统一接口"扩展性更好**：每个新渠道自己写 webhook，归一到同一张表，比定义一个抽象基类让所有渠道继承更便宜。
- **乐观更新 + ws 收敛 dedupe** 是实时聊天界面流畅的关键：前端按发送先建 pending 消息，后端 ws 推回真实消息时按 id 替换，体验上感觉"零延迟"。
- **私有 pubsub_token 模型** 让前端不用知道"我属于哪个频道"，后端 broadcast 时算 token 列表并集——这是 ActionCable 比 Socket.IO 更 Rails-idiomatic 的关键差异。

## 延伸阅读

- 视频教程：[chatwoot 官方 Architecture Deep Dive](https://www.youtube.com/results?search_query=chatwoot+architecture)（团队官方分享，1 小时讲完事件总线设计）
- 官方文档：[chatwoot.com/docs](https://www.chatwoot.com/docs)（部署 / API / SDK 全套）
- ActionCable 入门：[Rails Guides — Action Cable Overview](https://guides.rubyonrails.org/action_cable_overview.html)
- 仓库地址：[github.com/chatwoot/chatwoot](https://github.com/chatwoot/chatwoot)
- [[redis]] —— chatwoot 用 Redis 同时做缓存 / 队列 / pub/sub 三合一
- [[vue]] —— dashboard 前端基于 Vue 3 + Vuex

## 关联

- [[redis]] —— Redis 是 chatwoot 的瑞士军刀：缓存 / Sidekiq backend / ActionCable adapter / OnlineStatusTracker 全靠它
- [[vue]] —— dashboard SPA 用 Vue 3 + Vuex，cursor 分页和 ws 推送的前端响应都在 store mutation 里
- [[postgresql]] —— `messages` / `conversations` / `inboxes` 全在 PG，display_id 用触发器生成
- [[supabase]] —— 同样是"开源 + 自托管 + Postgres 中心"哲学，但 supabase 主打 BaaS、chatwoot 主打 SaaS 替代
- [[express]] —— 对比 Node/Express 写同类系统，chatwoot 的 Rails after_commit + Singleton 写法更"约定优于配置"
- [[excalidraw]] —— 同为开源工具替代闭源 SaaS 的范式，但 excalidraw 是纯前端、chatwoot 是全栈
- [[fastapi]] —— FastAPI 用 Pydantic 做 schema validation，chatwoot 用 Rails 模型 callback，两种风格代表两个生态

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[appwrite]] —— Appwrite — 自己能装一遍的开源 Firebase
- [[botpress]] —— Botpress — 把对话画成流程图加 LLM 节点的开源 chatbot 平台
- [[conduit]] —— Conduit — Rust 写的极简 Matrix homeserver，单二进制 + 嵌入式数据库
- [[synapse]] —— Synapse — Matrix 协议的参考 homeserver，让聊天像电邮一样能跨服务器互通
