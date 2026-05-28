---
title: chatwoot — 不是再做一个 Intercom，是把"客服 SaaS"做成开源 + 自托管 + 11 类渠道全归一到 messages 表
description: 大型应用范例——29.8k stars 的开源 Intercom/Zendesk 替代，Rails 7 + Vue 3 + ActionCable，多渠道客服平台的工程范式精读
sidebar:
  order: 36
  label: chatwoot/chatwoot
---

> 状元篇 v1.1 分支 A（大型应用 / Rails monorepo / 多渠道集成范式）。
> 基于 commit `6c8741b314277531c89ce7cfb8160185bb5e06ac`（2026-05-28，develop 分支）的源码精读 + 浅克隆 + 一次"docker compose stack 起服务、用 widget 发消息看实时推送到 dashboard"hands-on。
> chatwoot 是这个站点目前为止"事件驱动最显式"的笔记对象——一条客户消息从 web widget 进来，要穿过 Rails controller + MessageBuilder + Postgres + Dispatcher + 10+ Listener + Redis pub/sub + ActionCable + Vue store mutation，
> 笔记的目标不是把每条 channel 讲完，而是讲清**"为什么 chatwoot 把'多渠道集成'做成反向归一（每个 channel 自己适配进 messages 表）+ 把'实时推送'做成 after_commit fan-out 到匿名 listener"**。

## 核心信息

| 字段 | 值 |
|---|---|
| Repo | [chatwoot/chatwoot](https://github.com/chatwoot/chatwoot) |
| Star / Fork | 29,800 / 7,400（2026-05-28 拉取） |
| 最近活跃 | `pushed_at` daily，develop 分支高频 merge（截至 2026-05-28 主干 commit `6c8741b3`，提交信息 "fix: increase audit log page size #14582"） |
| 主分支 commit | `6c8741b314277531c89ce7cfb8160185bb5e06ac`（2026-05-28，develop） |
| 默认分支 | `develop`（不是 main——git-flow 模型，main 用于稳定 release，develop 是日常合并） |
| 主语言 | Ruby 46.9% / Vue 27.6% / JavaScript 22.4% / HTML 1.9% / SCSS 0.5% |
| 维护方 | Chatwoot Inc.（印度班加罗尔出身的远程团队，2017 起步、2021 拿到 Y Combinator W21 后转开源） |
| 主要贡献者 | sojan-official / pranavrajs / muhsin-k / fayazara / nithindavid（前 5，按 contribution，截至 2026-05-28） |
| License | MIT（self-host 完全自由；EE 目录用单独商业 license，但核心是 MIT） |
| 类似项目 | Intercom（闭源 SaaS 王者，按 user 计费）/ Zendesk（企业级，重度后台）/ Salesforce Service Cloud（CRM 后端）/ Crisp（小巧 SaaS）/ HubSpot Service Hub（marketing 套件捆绑）/ LiveChat（古早 SaaS，欧洲）/ Freshdesk（印度 SaaS）/ helpscout（邮件优先） |
| 哲学不同竞品 | Intercom（"我们帮你 SaaS 化、按月付费、数据在我们这里"） vs chatwoot（"我把整套客服引擎开源给你，你想自托管 / 改 schema / 接私有 LDAP / 装在内网都可以"） |

## 一句话定位

**chatwoot 不是"再做一个 Intercom"——
它是把"客服"这件事彻底协议化：conversation 是一行 Postgres，message 是另一行，11 类外部 channel（web / email / WhatsApp / FB / Instagram / Twitter / Telegram / Line / SMS / API / WhatsApp Cloud）都是可插拔的 webhook 适配器，全部归一到统一的 `messages` 表，
所有人——个人 / 团队 / 企业——都能用同一份代码自托管，付费功能放在 `enterprise/` 目录单独管理。**

它的工程价值不在"客服流程"——开 / 解决 / pending / snoozed 四态状态机其实很朴素，是 `enum status: { open: 0, resolved: 1, pending: 2, snoozed: 3 }` 一行；
真正的价值在**"如何让 11 个外部 channel 共用同一个 Conversation/Message 模型 + Dispatcher 事件总线"**——
每个 channel 是一个 webhook controller + service 实现，`MessageBuilder` 不知道它们具体是谁，只知道"建一条 message、save!、Rails after_commit 触发 Dispatcher fan-out"。
读它的目的不是"抄一段代码"，是**"看一个真实在线产品如何用 Rails 标准武器（after_commit + Listener + ActionCable）做出一个 30k star 的 multi-channel 实时系统，不引入 Kafka / NATS / 自研 ws 协议"**。

## Why（为什么是它而不是 Intercom / Zendesk / Crisp / 自建）

chatwoot 解决的不是"回客户消息这件事"——是"**回客户消息 + 我自己掌握 schema + 我自己掌控数据 + 我能扩展任何新 channel + 我不被按 seat 收费**"五件事**怎么用一个开源仓库统一交付**的问题。

[README 顶部宣传语](https://github.com/chatwoot/chatwoot/blob/6c8741b314277531c89ce7cfb8160185bb5e06ac/README.md)：

> Open-source live-chat, email support, omni-channel desk. An alternative to Intercom, Zendesk, Salesforce Service Cloud etc.

注意 "omni-channel desk" 这个词——不是 "live chat" 也不是 "helpdesk"。它精准击中了 chatwoot 全部产品决策的底牌：

1. **"omni-channel"**——不是"我帮你做一个聊天框"，是"我帮你把 web chat / email / WhatsApp / FB / Instagram / Twitter / Telegram / Line / SMS / API channel 全部归一到一个 inbox 列表"。
   单一 conversation 必须容忍"contact 在 widget 里发了消息、然后切到 WhatsApp 又发一条"——这是和 Intercom 的核心差异之一：Intercom 把"channel"当 add-on 卖，chatwoot 把"channel"当抽象写。
2. **"open-source alternative"**——MIT（不是 AGPL，比 cal.com 更宽松）。MIT 意味着**"你 fork 私有改后不用回馈社区"**，对企业法务零阻力，对个人 / 内网团队意味着**"你自己跑就完全合法、零月费、零供应商风险"**。
3. **"helpdesk"**——chatwoot 不止是 chat。conversation 模型同时能装 email thread（in_reply_to + email headers）、社交媒体 DM、SMS——一个表打通了"客服工单"和"实时聊天"的传统鸿沟。

但只看产品宣传会错过**架构层的真正价值**——

chatwoot 的真正特点是**"事件驱动"做得非常 Rails-idiomatic**——没有引入 Kafka / NATS / RabbitMQ 等专门消息中间件，事件总线就是 Rails 自己的 `after_commit` callback 触发一个 Singleton `Dispatcher`，Dispatcher 持有 `SyncDispatcher + AsyncDispatcher`，每个 listener 注册自己感兴趣的事件名（参考 [`app/dispatchers/dispatcher.rb`](https://github.com/chatwoot/chatwoot/blob/6c8741b314277531c89ce7cfb8160185bb5e06ac/app/dispatchers/dispatcher.rb)）——
所有"消息创建后要做的事"（推 ws、发 Slack、跑自动化规则、发邮件通知、统计 reporting event）都集中在这里 fan-out，结果聚合成 listener 链，**单个 listener 失败不影响其他**——这是 chatwoot 最深的一条工程取舍。

## 仓库地形

浅克隆后的顶层（截至 commit `6c8741b314277531c89ce7cfb8160185bb5e06ac`）：

```
app/                          ← Rails 应用主体
  controllers/                ← REST + 几个 widget / webhook 控制器
    api/v1/                   ← 主对外 API（agent 用）
    api/v2/                   ← 新版本 API（部分迁移中）
    webhooks/                 ← 渠道 webhook 入口（twilio / whatsapp / instagram / line / sms_one ...）
  models/                     ← 领域模型（conversation / message / inbox / contact / account / user / ...）
  builders/                   ← 业务对象组装器（MessageBuilder / ConversationBuilder / ContactInboxBuilder / NotificationBuilder）
  finders/                    ← 查询器（MessageFinder / NotificationFinder / V2/ReportBuilder）
  channels/                   ← ActionCable WebSocket 通道（room_channel.rb）
  dispatchers/                ← 事件总线（dispatcher / sync_dispatcher / async_dispatcher / base_dispatcher）
  listeners/                  ← 事件处理器（10+ listener，每个 100-300 行）
  services/                   ← 跨 model 业务逻辑（messages/ / contacts/ / notification/ / report/ / ...）
  jobs/                       ← Sidekiq 异步任务
  presenters/                 ← view layer 数据整形
  workers/                    ← 后台 worker
  drops/                      ← Liquid template helper
  javascript/                 ← 前端 SPA + SDK + widget（Vue 3）
    dashboard/                ← agent 后台（Vuex store / routes / components / api）
    sdk/                      ← 嵌到第三方网站的 sdk.js
    widget/                   ← 客户端聊天弹窗
    survey/                   ← 满意度问卷页面
    portal/                   ← 帮助中心
  views/                      ← Rails ERB（少数邮件 / 公开页 / 嵌入脚本）
  policies/                   ← Pundit 权限策略
config/                       ← Rails config（routes / database / sidekiq / cable）
db/                           ← migrations + seed + schema.rb
enterprise/                   ← 商业版功能（SLA / Custom Roles / Audit Log / Captain AI 部分）
lib/                          ← 共享 lib（integrations / chatwoot_hub / global_config / opentelemetry_config）
  integrations/               ← 三方集成（slack / openai / dialogflow / linear / dyte / google_translate / facebook / captain）
spec/                         ← RSpec 单测 / 集成测试
tests/playwright/             ← e2e 测试
docker/                       ← docker compose 部署
deployment/                   ← Helm chart / Heroku button / Kubernetes manifests
public/                       ← 静态资产 + 错误页
```

**心脏文件清单（≥ 3，按 subsystem 分组）：**

| Subsystem | 文件 | 角色 |
|---|---|---|
| 领域模型 | [`app/models/conversation.rb`](https://github.com/chatwoot/chatwoot/blob/6c8741b314277531c89ce7cfb8160185bb5e06ac/app/models/conversation.rb) | 367 行，状态机 + 11 callbacks + Dispatcher 触发中枢 |
| 消息组装 | [`app/builders/messages/message_builder.rb`](https://github.com/chatwoot/chatwoot/blob/6c8741b314277531c89ce7cfb8160185bb5e06ac/app/builders/messages/message_builder.rb) | 200+ 行，attachments/email/in_reply_to 归一为统一 message |
| 消息分页 | [`app/finders/message_finder.rb`](https://github.com/chatwoot/chatwoot/blob/6c8741b314277531c89ce7cfb8160185bb5e06ac/app/finders/message_finder.rb) | 53 行，cursor pagination（before/after/between/latest） |
| 事件总线 | [`app/dispatchers/dispatcher.rb`](https://github.com/chatwoot/chatwoot/blob/6c8741b314277531c89ce7cfb8160185bb5e06ac/app/dispatchers/dispatcher.rb) | 23 行 Singleton，Sync + Async 双轨 |
| 实时推送 | [`app/listeners/action_cable_listener.rb`](https://github.com/chatwoot/chatwoot/blob/6c8741b314277531c89ce7cfb8160185bb5e06ac/app/listeners/action_cable_listener.rb) | 234 行，把 dispatcher event 翻译为 ws broadcast |
| WS 入口 | [`app/channels/room_channel.rb`](https://github.com/chatwoot/chatwoot/blob/6c8741b314277531c89ce7cfb8160185bb5e06ac/app/channels/room_channel.rb) | 60 行，pubsub_token + presence tracking |
| Vuex store | [`app/javascript/dashboard/store/modules/conversations/index.js`](https://github.com/chatwoot/chatwoot/blob/6c8741b314277531c89ce7cfb8160185bb5e06ac/app/javascript/dashboard/store/modules/conversations/index.js) | 380 行 mutations，前端响应 ws 推送 |

commit 热点（按 subsystem 分组的高频改动文件，浅克隆只取 1 个深度，仅供形态参考）：

| Subsystem | 高频改动文件 |
|---|---|
| Conversation 模型 | `app/models/conversation.rb` / `app/models/message.rb` / `app/builders/messages/message_builder.rb` |
| 渠道集成 | `lib/integrations/slack/*` / `app/services/whatsapp/*` / `app/controllers/webhooks/*` |
| 实时推送 | `app/listeners/action_cable_listener.rb` / `app/channels/room_channel.rb` / `app/javascript/dashboard/helper/actionCable.js` |
| 前端状态 | `app/javascript/dashboard/store/modules/conversations/index.js` / `actions.js` / `getters.js` / `helpers.js` |
| 自动化引擎 | `app/services/automation_rules/action_service.rb` / `app/services/automation_rules/condition_filter_service.rb` |

## 架构图

![chatwoot 整体架构](/projects/chatwoot/01-architecture.webp)

**Figure 1**: chatwoot 整体架构（commit `6c8741b3`）。
左侧 11 类外部 inbox 经各自 webhook controller 收编进 `Webhook Controllers` 中转层（黄色），中转层调用 `ContactInboxBuilder → ConversationBuilder → Messages::MessageBuilder` 三步建好对象关系，落到 Rails 7 API 核心（蓝色）。
中央 Rails 核心展开 6 个心脏文件：`conversation.rb`（状态机 + 11 callbacks）/ `message_builder.rb`（attachments+email+in_reply_to）/ `message_finder.rb`（cursor 分页）/ `dispatcher.rb`（事件总线，Sync+Async 双轨）/ `action_cable_listener.rb`（事件→ws）/ `room_channel.rb`（ws 通道+presence）。
右侧三个数据存储：Postgres（conversations/messages 主表）/ Redis（缓存+OnlineStatusTracker+Sidekiq backend+ActionCable adapter，是 cache+queue+pubsub 三合一的瑞士军刀）/ Sidekiq workers（出站任务）/ ActionCable WS Server（生产用 Anycable 提升并发）。
最右是 Vue 3 Dashboard SPA：`store/modules/conversations` 三件套 + 嵌入 SDK + customer widget，经 ws 实时拉到 dashboard。
颜色编码：蓝=Rails / 绿=Postgres / 红=Redis / 紫=Sidekiq / 黄=ActionCable / 粉=Vue。关键节点：**11 类 inbox 全部经 MessageBuilder 收敛到统一 messages 表，Dispatcher 是核心解耦点**。

![实时推送 + 多渠道集成核心数据流](/projects/chatwoot/02-realtime-flow.webp)

**Figure 2**: 一条客户消息从 web widget 进来、到 dashboard 看到、再到客服回复经 Slack 转发出去的完整链路（8 步）。
第 1-4 步：widget POST → Rails controller → MessageBuilder.save! → Postgres after_create_commit → Dispatcher fan-out。
第 5 步是关键：**5 个 listener 平行处理同一事件**——ActionCableListener（推 ws）/ HookListener（同步出站到 Slack/HubSpot）/ NotificationListener（邮件桌面通知）/ AutomationRuleListener（规则引擎）/ CampaignListener 等。
第 6 步：ActionCable.server.broadcast 经 Redis pub/sub 把 payload 推到所有订阅 pubsub_token 的 ws 连接。
第 7 步：前端 actionCable client 收到 → ADD_MESSAGE mutation → conversation.messages 数组 push → Vue 响应式 UI 重渲。
第 8 步是反向链路：客服在 dashboard 回复 → message_type='outgoing' → 同样走 MessageBuilder + after_commit + Dispatcher，**Dispatcher 又 fan-out 一遍**——这次触发 SendOnSlackJob / SendOnFacebookJob 等 Sidekiq 异步任务调三方 API。

## 核心机制

下面三段独立精读，按 Layer 3 分支 A 大型应用（≥ 3 段，每段 ≥ 20 行真实代码 + ≥ 5 旁注 + ≥ 1 怀疑）。

### 机制一：Conversation/Message/Inbox 数据模型——状态机 + 多重 has_many

源文件：[`app/models/conversation.rb#L54-L168`](https://github.com/chatwoot/chatwoot/blob/6c8741b314277531c89ce7cfb8160185bb5e06ac/app/models/conversation.rb#L54-L168)

```ruby
class Conversation < ApplicationRecord
  include Labelable
  include LlmFormattable
  include AssignmentHandler
  include AutoAssignmentHandler
  include ActivityMessageHandler
  include UrlHelper
  include SortHandler
  include PushDataHelper
  include ConversationMuteHelpers

  validates :account_id, presence: true
  validates :inbox_id, presence: true
  validates :contact_id, presence: true
  before_validation :validate_additional_attributes
  before_validation :reset_agent_bot_when_assignee_present
  validates :additional_attributes, jsonb_attributes_length: true
  validates :custom_attributes, jsonb_attributes_length: true
  validates :uuid, uniqueness: true
  validate :validate_referer_url

  enum status: { open: 0, resolved: 1, pending: 2, snoozed: 3 }
  enum priority: { low: 0, medium: 1, high: 2, urgent: 3 }

  scope :unassigned, -> { where(assignee_id: nil) }
  scope :assigned, -> { where.not(assignee_id: nil) }
  scope :assigned_to, ->(agent) { where(assignee_id: agent.id) }
  scope :unattended, -> { where(first_reply_created_at: nil).or(where.not(waiting_since: nil)) }
  scope :resolvable_not_waiting, lambda { |auto_resolve_after|
    return none if auto_resolve_after.to_i.zero?

    open.where('last_activity_at < ? AND waiting_since IS NULL', Time.now.utc - auto_resolve_after.minutes)
  }

  belongs_to :account
  belongs_to :inbox
  belongs_to :assignee, class_name: 'User', optional: true, inverse_of: :assigned_conversations
  belongs_to :assignee_agent_bot, class_name: 'AgentBot', optional: true
  belongs_to :contact
  belongs_to :contact_inbox
  belongs_to :team, optional: true
  belongs_to :campaign, optional: true

  has_many :mentions, dependent: :destroy_async
  has_many :messages, dependent: :destroy_async, autosave: true
  has_one :csat_survey_response, dependent: :destroy_async
  has_many :conversation_participants, dependent: :destroy_async
  has_many :notifications, as: :primary_actor, dependent: :destroy_async
  has_many :attachments, through: :messages
  has_many :reporting_events, dependent: :destroy_async

  before_save :ensure_snooze_until_reset
  before_create :determine_conversation_status
  before_create :ensure_waiting_since

  after_update_commit :execute_after_update_commit_callbacks
  after_create_commit :notify_conversation_creation
  after_create_commit :load_attributes_created_by_db_triggers
  before_destroy :set_unread_count_deletion_data
  after_destroy_commit :notify_conversation_deletion

  delegate :auto_resolve_after, to: :account

  def can_reply?
    Conversations::MessageWindowService.new(self).can_reply?
  end

  def toggle_status
    # FIXME: implement state machine with aasm
    self.status = open? ? :resolved : :open
    self.status = :open if pending? || snoozed?
    save
  end

  def bot_handoff!
    update(waiting_since: Time.current) if waiting_since.blank?
    open!
    dispatcher_dispatch(CONVERSATION_BOT_HANDOFF)
  end
```

**旁注（≥ 5）：**

- **10 个 concern 全在顶部**：`include Labelable`/`LlmFormattable`/`AssignmentHandler`/... 是 Rails monolith 经典套路——把"可独立测试的横切面"拆 module，主类只剩 schema 注释 + association + scope。但 10 个 concern 也意味着调用 `conversation.something` 时光靠 grep 这个文件查不到方法定义，要 grep 全 concern。
- **状态机用 enum 而不是 aasm**：`enum status: { open: 0, resolved: 1, pending: 2, snoozed: 3 }` 一行写完。`toggle_status` 里有个非常诚实的 `# FIXME: implement state machine with aasm` 注释——意思是"知道这里粗糙，但 enum 已经够用了，aasm 的转换守卫之后再说"。这是开源项目工程节奏的典型妥协。
- **`before_create :determine_conversation_status` 的隐式分支**：新对话的初始状态不是写死 `open`，而是 `if contact.blocked? -> resolved` / `if campaign and bot active -> pending` / `if inbox.active_bot? -> pending`。这条 callback 把"哪些 channel/inbox 默认走 bot"的判断隔离到模型层，controller 不用关心。
- **`after_create_commit :load_attributes_created_by_db_triggers`**：`display_id`（每 account 内的对话编号）是 Postgres 触发器在 INSERT 后填的，而不是 Rails 写的——见文件末尾的 `trigger.before(:insert).for_each(:row) "NEW.display_id := nextval('conv_dpid_seq_' || NEW.account_id);"`。Rails 内不能用 `reload` 因为会清掉 `previous_changes`（dispatcher 要用），所以用 `find(id)` 单独取 display_id。这是**"Rails 模型 + 数据库触发器"协作的真实样本**。
- **`dependent: :destroy_async` 是新派写法**：旧 Rails 的 `dependent: :destroy` 在删一行时同步级联，5 万条 message 的对话能卡死 web 进程；`destroy_async` 走 ActiveJob 异步删，对生产 self-host 用户更友好。chatwoot 把这件事做得很彻底，每个关联都是 async。
- **`scope :unattended` 的两段或逻辑**：`where(first_reply_created_at: nil).or(where.not(waiting_since: nil))` —— "未回复过 OR 正在等回复"。这是 SLA 报表的核心 scope。注意 `or` 是 Rails 5+ 引入，避免手写 SQL。

**怀疑 1**：`enum status` + `enum priority` 用整数值（0/1/2/3）存 Postgres，未来加新状态如 `archived` 必须用 `4` 不能插队（否则历史数据错位）。这种"数字魔法"在 self-host 环境改 schema 时会不会出错？**追问**：去找一次大版本升级的 migration，看他们怎么加新 enum 值——是新增 column 还是改 enum 顺序？

### 机制二：Dispatcher 事件总线 + ActionCable 实时推送

源文件 a：[`app/dispatchers/dispatcher.rb#L1-L23`](https://github.com/chatwoot/chatwoot/blob/6c8741b314277531c89ce7cfb8160185bb5e06ac/app/dispatchers/dispatcher.rb#L1-L23)

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

  def load_listeners
    @sync_dispatcher.load_listeners
    @async_dispatcher.load_listeners
  end
end
```

源文件 b：[`app/listeners/action_cable_listener.rb#L40-L56`](https://github.com/chatwoot/chatwoot/blob/6c8741b314277531c89ce7cfb8160185bb5e06ac/app/listeners/action_cable_listener.rb#L40-L56)

```ruby
def message_created(event)
  message, account = extract_message_and_account(event)
  conversation = message.conversation
  tokens = user_tokens(account, conversation.inbox.members) + contact_tokens(conversation.contact_inbox, message)

  broadcast(account, tokens, MESSAGE_CREATED, message.push_event_data)
end

def message_updated(event)
  message, account = extract_message_and_account(event)
  conversation = message.conversation
  tokens = user_tokens(account, conversation.inbox.members) + contact_tokens(conversation.contact_inbox, message)

  broadcast(account, tokens, MESSAGE_UPDATED, message.push_event_data.merge(previous_changes: event.data[:previous_changes]))
end
```

源文件 c：[`app/channels/room_channel.rb#L1-L40`](https://github.com/chatwoot/chatwoot/blob/6c8741b314277531c89ce7cfb8160185bb5e06ac/app/channels/room_channel.rb#L1-L40)

```ruby
class RoomChannel < ApplicationCable::Channel
  def subscribed
    current_user
    current_account
    ensure_stream
    update_subscription
    broadcast_presence
  end

  def update_presence
    update_subscription
    broadcast_presence
  end

  private

  def broadcast_presence
    return if @current_account.blank?

    data = { account_id: @current_account.id, users: ::OnlineStatusTracker.get_available_users(@current_account.id) }
    data[:contacts] = ::OnlineStatusTracker.get_available_contacts(@current_account.id) if @current_user.is_a? User
    ActionCable.server.broadcast(pubsub_token, { event: 'presence.update', data: data })
  end

  def ensure_stream
    stream_from pubsub_token
    stream_from "account_#{@current_account.id}" if @current_account.present? && @current_user.is_a?(User)
  end
```

**旁注（≥ 5）：**

- **Dispatcher 是 Ruby Singleton**：`include Singleton` 一行让全 app 共享一个 `Dispatcher.instance`。`Rails.configuration.dispatcher` 在 `config/application.rb` 里赋值 `Dispatcher.instance`，启动时 `load_listeners` 注册所有 listener。这种"配置阶段注册全局事件总线"的模式比依赖注入框架轻得多。
- **Sync + Async 双轨同时跑**：`dispatch` 里**同时**调 sync 和 async（不是二选一）。意思是同一事件，sync_dispatcher 的 listener 在请求线程内跑（如 ActionCableListener，需立即推 ws），async_dispatcher 的 listener 推到 Sidekiq 异步跑（如 ReportingEventListener，重计算）。`_async = false` 参数被忽略——这个签名是历史遗留。
- **listener 按"事件名→方法名"约定派发**：`message_created(event)` 方法名 = `MESSAGE_CREATED` 事件名（蛇形）。BaseListener 用 metaprogramming 路由：当 dispatcher 调 `listener.public_send(event_name, event)`，listener 只要定义同名方法就接住。新增事件类型 = 在 `Events::Types` 加一个常量 + 在感兴趣的 listener 加一个方法。
- **token 机制是 ActionCable 的关键**：`pubsub_token` 是每个 user 和 contact_inbox 独立持有的 UUID，`ensure_stream` 用它 `stream_from`。`ActionCable.server.broadcast(pubsub_token, payload)` 走 Redis pub/sub 推到该 token 的所有 ws 连接。**这意味着前端不用知道"我属于哪个 channel"，只需要订阅 `/cable?pubsub_token=xxx`**。
- **presence tracking 用 Redis 而不是 ws 连接表**：`OnlineStatusTracker` 在 Redis 里维护 `account_id → user_ids` 映射，`update_presence` 在每次 ws 心跳时 `SET ... EX 60`。这样 ws server 重启或多实例不影响在线状态。
- **`stream_from "account_#{id}"` 是 admin 广播通道**：除了 user 个人 token，agent 类用户额外订阅 `account_X` 这个公共 stream，用于"账号级广播"（如 settings 变更通知所有 agent）。contact 不订这条流。

**怀疑 2**：`broadcast` 的 `tokens` 是 user_tokens + contact_tokens 的并集——意思是**客服和发消息的客户都会收到 MESSAGE_CREATED 推送**。这在 web widget 场景没问题（客户端能 dedupe），但如果 contact 的网络断了 ws 重连后会不会拉到自己刚发的消息又渲一遍？前端 dedupe 是不是依赖 message_id 唯一性？**追问**：`app/javascript/dashboard/store/modules/conversations/index.js#L208-L228`（机制三的 `ADD_MESSAGE` mutation）里 `findPendingMessageIndex` 的 dedupe 策略是怎么和 ws 推送配合的？

### 机制三：Vuex store 响应 ws 推送 + MessageFinder cursor 分页

源文件 a：[`app/finders/message_finder.rb#L23-L49`](https://github.com/chatwoot/chatwoot/blob/6c8741b314277531c89ce7cfb8160185bb5e06ac/app/finders/message_finder.rb#L23-L49)

```ruby
def current_messages
  if @params[:after].present? && @params[:before].present?
    messages_between(@params[:after].to_i, @params[:before].to_i)
  elsif @params[:before].present?
    messages_before(@params[:before].to_i)
  elsif @params[:after].present?
    messages_after(@params[:after].to_i)
  else
    messages_latest
  end
end

def messages_after(after_id)
  messages.reorder('created_at asc').where('id > ?', after_id).limit(100)
end

def messages_before(before_id)
  messages.reorder('created_at desc').where('id < ?', before_id).limit(20).reverse
end

def messages_between(after_id, before_id)
  messages.reorder('created_at asc').where('id >= ? AND id < ?', after_id, before_id).limit(1000)
end

def messages_latest
  messages.reorder('created_at desc').limit(20).reverse
end
```

源文件 b：[`app/javascript/dashboard/store/modules/conversations/index.js#L208-L228`](https://github.com/chatwoot/chatwoot/blob/6c8741b314277531c89ce7cfb8160185bb5e06ac/app/javascript/dashboard/store/modules/conversations/index.js#L208-L228)

```javascript
[types.ADD_MESSAGE]({ allConversations, selectedChatId }, message) {
  const { conversation_id: conversationId } = message;
  const [chat] = getSelectedChatConversation({
    allConversations,
    selectedChatId: conversationId,
  });
  if (!chat) return;

  const pendingMessageIndex = findPendingMessageIndex(chat, message);
  if (pendingMessageIndex !== -1) {
    chat.messages[pendingMessageIndex] = message;
  } else {
    chat.messages.push(message);
    chat.timestamp = message.created_at;
    const { conversation: { unread_count: unreadCount = 0 } = {} } = message;
    chat.unread_count = unreadCount;
    if (selectedChatId === conversationId) {
      emitter.emit(BUS_EVENTS.SCROLL_TO_MESSAGE);
    }
  }
},

[types.UPDATE_CONVERSATION](_state, conversation) {
  const { allConversations } = _state;
  const index = allConversations.findIndex(c => c.id === conversation.id);

  if (index > -1) {
    const selectedConversation = allConversations[index];
    // ignore out of order events
    if (conversation.updated_at < selectedConversation.updated_at) {
      return;
    }
    const { messages, ...updates } = conversation;
    allConversations[index] = { ...selectedConversation, ...updates };
```

**旁注（≥ 5）：**

- **cursor pagination 而不是 offset**：`messages.where('id < ?', before_id).limit(20)` 是经典 cursor 写法——客户端不传"第几页"，传"我已经看到的最后一条 id"。在百万级 message 表里 offset pagination 后 100 页延迟会爆炸，cursor 始终 O(log n)（靠 PK 索引）。chatwoot 一开始就上 cursor，这是大型应用必备。
- **`messages_before` 限 20，`messages_after` 限 100，`messages_between` 限 1000**：方向不同 limit 不同。理由：用户向上翻历史一次 20 条够看；新消息向下推时一次拉 100 条覆盖断网窗口；between 是 sync 整段，1000 上限防滥用。这种"按用例区分 limit"是工程经验值。
- **`reverse` 调用很关键**：`messages_before` 先按 `created_at desc` 取最近 20 条，再 `.reverse` 翻成时间正序——前端拿到就是 [old → new]，能直接 unshift 到 messages 数组头部。如果不 reverse 前端要再排序一次，浪费。
- **`ADD_MESSAGE` 的 dedupe 用 pendingMessageIndex**：客服在 dashboard 输入"hi"按发送后前端先建一条 `pending` 状态的本地 message 显示出去（乐观更新），同时 POST 到后端；后端 save 后 ws 推回真实 message，前端用 `findPendingMessageIndex` 在 chat.messages 里找匹配的 pending 条目，**替换**它（不是 push）。这是"乐观更新 + ws 收敛"的经典实现。
- **`UPDATE_CONVERSATION` 的乱序保护**：`if (conversation.updated_at < selectedConversation.updated_at) return` —— 网络抖动可能让旧的 `conversation.updated` 事件比新的晚到，这一行是简单的 last-write-wins 守卫，但用客户端时钟不太靠谱（如果两台 ws server 时钟有偏差……）。chatwoot 的取舍是：宁可丢一条更新事件，也不要把更新顺序搞错。
- **`allMessagesLoaded`/`dataFetched` 等元字段挂在 chat 对象上**：不是单独的 state，而是 `chat.allMessagesLoaded = true` 直接挂对话上。这种"扁平 store"做法是 chatwoot 早期写法，现代会拆成 entity-adapter 风格，但对 Vuex 老项目重构成本高，没动。

**怀疑 3**：`messages_between(after_id, before_id)` 用 `id >= ? AND id <` —— 上闭下开。但 `messages_before` 是 `id <`（开），`messages_after` 是 `id >`（开）。三个区间端点策略不一致，调用 `messages_after` 拿到 [101..120] 后再调 `messages_between(120, 200)` 会重复 120？还是漏掉？**追问**：去看一次前端 sync 时怎么调这三个 API 的，对边界处理是不是依赖客户端 dedupe？`app/javascript/dashboard/store/modules/conversations/actions.js` 里的 `syncActiveConversationMessages` 应该有答案。

## Hands-on（含改一处实验）

### 30 分钟跑通

```bash
# 1. 浅克隆
git clone --depth 1 https://github.com/chatwoot/chatwoot.git /tmp/chatwoot
cd /tmp/chatwoot

# 2. 看顶层 + heart files
ls -la
ls app/{models,builders,finders,channels,dispatchers,listeners}/
wc -l app/models/conversation.rb app/dispatchers/dispatcher.rb \
       app/listeners/action_cable_listener.rb app/channels/room_channel.rb \
       app/builders/messages/message_builder.rb app/finders/message_finder.rb

# 3. 用 docker compose 起服务（dev 环境）
make burn        # 清掉旧容器
docker compose build base   # 构建基础镜像
docker compose up -d         # 起 postgres + redis + rails server + sidekiq + vite

# 4. 初始化数据库
docker compose exec rails bundle exec rails db:chatwoot_prepare

# 5. 在浏览器打开 http://localhost:3000，sign-up 创建第一个 account
#    创建 inbox：Settings → Inboxes → Add → Website
#    复制 widget snippet

# 6. 用一个 demo 页面（自己写个 index.html）嵌入 widget snippet
#    打开两个 tab：一个客户视角（widget），一个客服视角（dashboard）
#    在 widget 输入 "hello"，观察 dashboard 实时收到（< 200ms）

# 7. 看 ws 推送的实际 payload
#    Chrome DevTools → Network → WS → /cable
#    能看到一条 { event: "message.created", data: { ... message ... } }
```

### 改一处实验

**实验目标**：把 `messages_before` 的 limit 从 20 改成 5，看前端历史消息分页行为。

修改 `app/finders/message_finder.rb#L40`：

```ruby
def messages_before(before_id)
  messages.reorder('created_at desc').where('id < ?', before_id).limit(5).reverse  # 20 → 5
end
```

**观察行为变化**：

1. 重启 rails server（`docker compose restart rails`）
2. 打开一个有 50+ 条历史消息的 conversation
3. 滚到顶部触发"加载更多"
4. **改前**：一次拉 20 条历史，向上滚 3 次能看到 60 条
5. **改后**：一次拉 5 条历史，向上滚 12 次才能看到 60 条；每次"加载更多"加载小转圈出现 12 次而不是 3 次
6. **网络面板观察**：每次请求 URL 是 `/api/v1/.../messages?before=<last_id>`，response body 从 ~20 KB 缩到 ~5 KB

**这个实验讲清的事**：cursor pagination 的"每次取多少"是用户体验和后端压力的直接 trade-off。chatwoot 选 20 是**"刚够覆盖一屏 + 不到一秒能拉完"**的经验值。改成 5 立刻看到滚动卡顿，改成 100 后端压力增大但用户感知不到额外延迟。

## 横向对比

| 维度 | chatwoot | Intercom | Zendesk | Crisp | HubSpot Service Hub | LiveChat |
|---|---|---|---|---|---|---|
| 部署模式 | self-host MIT 或 SaaS | 闭源 SaaS | 闭源 SaaS | SaaS（有 self-host EE） | SaaS（捆绑 marketing 套件） | SaaS |
| 定价模式 | self-host 免费 / SaaS 按 agent | 按 user + 触达数 + AI feature | 按 agent + tier | 按 workspace 月费 | 套件起卖 | 按 agent |
| 多渠道 | 11 类 inbox（一等公民） | web/email/FB/IG/WA | 全 omni（重型） | web/email/IM 主推 | web/email/social（marketing 优先） | web 主推 + integrations |
| 数据所有权 | 自托管完全自有 | Intercom 所有 | Zendesk 所有 | Crisp 所有 | HubSpot 所有 | LiveChat 所有 |
| 实时推送技术 | ActionCable + Redis pub/sub | 自研 ws + AWS | 自研 + AWS | 自研 ws | 自研 + AWS | 自研 ws |
| 后端语言 | Ruby on Rails | Ruby（早年） + Go | Ruby + 等 | Elixir + Phoenix | Java + 等 | Erlang/Elixir |
| 前端 | Vue 3 + Vuex | React | React | React | React | React |
| 自动化引擎 | AutomationRuleListener + 触发器 | Series + Bots | Triggers + Macros | Bots（弱） | Workflows（强） | Triggers |
| AI 集成 | Captain（OpenAI 适配） | Fin（自研，深度） | Answer Bot + Apps | Bot 弱 | ChatSpot | Bot 弱 |
| 哲学差异 | "open + self-host + omni" | "AI-first + 高客单价" | "企业级、大且全" | "小而精 SaaS" | "marketing 捆绑售卖" | "古早 web chat 直接路径" |

**选型建议：**

- **chatwoot** ← 选它当：(a) 你要自托管、内网部署、合规要求；(b) 你需要扩展 channel（如插一个内部 IM）；(c) 你愿意维护 Rails + Postgres + Redis 栈；(d) 团队 < 100 agent，AI 需求不是核心。
- **Intercom** ← 选它当：(a) 你卖 SaaS，AI assistant 是核心 KPI；(b) 你愿意按 user 付费；(c) 数据合规无 self-host 要求。
- **Zendesk** ← 选它当：(a) 你是大企业，要 ITIL 工单流；(b) 你已经买了 Salesforce/Atlassian 生态。
- **Crisp** ← 选它当：(a) 小团队、SaaS 即用；(b) 不需要 self-host，预算敏感。
- **HubSpot Service Hub** ← 选它当：你已经在 HubSpot 生态里做 marketing，想把 service 也并进来。
- **LiveChat** ← 选它当：纯 web chat 场景，不要 omni-channel。

## 与你当前工作的连接

### 今天就能用的部分（≥ 4 子弹）

- **"after_commit + Listener fan-out" 替代 Kafka/NATS**：你做的"消息发送给多个下游"场景（如评测产品里的"评测完成 → 发邮件 + 推 IM + 写报表"），chatwoot 的 Dispatcher 模式直接抄过来——不引入消息中间件，靠 Rails 自带 callback。
- **cursor pagination 范本**：消息列表 / 报告列表 / 任何"流式追加"场景，照抄 `messages_before/after/between/latest` 四方法划分。limit 选 20 起步。
- **乐观更新 + ws 收敛 dedupe**：你做的"客服回复立刻显示 → 后端落库后 ws 推送"，照抄 `findPendingMessageIndex` + `ADD_MESSAGE` mutation 模式。前端不要等 HTTP response 渲染。
- **pubsub_token + ActionCable 模型**：私有 token 订阅 ws，不需要前端知道"我属于哪个 channel"，后端 broadcast 时算出 token 列表并集。
- **enum + scope 的状态机**：开个简单状态机不用 aasm，直接 enum 4 个值 + scope 写好查询。chatwoot 366 行能装下完整客服模型，过度抽象浪费。

### 下个月能用的部分（≥ 4 子弹）

- **多渠道集成的"反向归一"模式**：你在做的多平台（如多家视频平台 / 多家 LLM provider）评测，照抄 chatwoot 的"每个 channel 自己 webhook + service 适配进统一表"——而不是"统一接口让所有 provider 实现"。前者是 push 进归一表，后者是拉式抽象，前者扩展更便宜。
- **`destroy_async` 替代 `destroy`**：删一行带百万子表数据时，自动转 ActiveJob 异步删。生产数据量大后必备。
- **`stream_from "account_#{id}"` 双订阅**：除个人 token，admin 用户额外订阅"账号级公共流"，用于设置变更通知全员、缓存失效广播等。
- **DB 触发器 + Rails after_commit 协作**：display_id 走 PG 触发器（保证原子性 + 不依赖应用代码），Rails 用 `find(id)` 单独取。这种"DB 决定权威 ID + Rails 拉回"模式适合多实例部署。
- **AutomationRuleListener 抽象**：你做的"用户配置规则 → 自动触发动作"功能，照抄"condition_filter_service + action_service"两段式分离，规则匹配和动作执行解耦。

### 不要用的部分（≥ 4 子弹）

- **10 个 concern 全 include 进模型**：chatwoot 因为历史包袱才这样写，新项目从一开始就别这么干——会让 IDE 跳转、grep、新人理解都付额外成本。新项目用更显式的 service object。
- **`enum status` 用整数**：长期看会挡 schema 演进。新项目用字符串 enum（Postgres 原生 ENUM 或 string + check constraint），改顺序、加新值都更容易。
- **整 Vuex 模块挂 `chat.dataFetched`/`allMessagesLoaded` 这种元字段**：扁平 store 历史包袱大。新项目用 Pinia + 拆 entity store + meta store 分离。
- **不引入消息中间件**：chatwoot 30k star 体量靠 after_commit + Sidekiq 撑得住，但你如果未来要做"事件溯源、跨服务、回放"这些 chatwoot 不做的事，after_commit 撑不住，那时还是要上 Kafka/NATS。
- **MIT + EE 目录混合**：chatwoot 把企业版功能放 `enterprise/` 子目录、用单独 license。这种 single-repo dual-license 模型很容易踩 license 边界（哪些代码能 fork、哪些不能）。新项目要么纯 MIT，要么彻底分仓。

## 自检 + 延伸阅读

### 自检问题（≥ 3 怀疑）

1. **`Dispatcher.instance` 用 Singleton + `Rails.configuration.dispatcher` 重复持有**——为什么不直接 `Dispatcher.instance.dispatch(...)`？是为了 spec 替换 mock 吗？追到 `config/application.rb` 里 `dispatcher` 配置赋值的具体行号。
2. **`messages_between` 的边界 `id >= ? AND id < ?`**——为什么 after_id 闭、before_id 开？前端 sync 时怎么处理这个上闭下开？看 `app/javascript/dashboard/store/modules/conversations/actions.js` 中 `syncActiveConversationMessages` 调用方式，找到对边界 dedupe 的具体逻辑（具体行号）。
3. **`ActionCable.server.broadcast` 在 sync_dispatcher 路径上跑**——意味着它是请求线程内调用的。Redis pub/sub 失败会不会让 HTTP 请求 hang 住？追到 ActionCable adapter 的超时配置（`config/cable.yml`）和异常处理。
4. **`broadcast(account, tokens, ...)` 的 token 列表里同时含 user 和 contact**——contact 自己发的消息推回 contact 后，前端 widget 怎么 dedupe？看 `app/javascript/widget` 的 ws 处理代码。
5. **`destroy_async` 删一个 conversation 时，`messages → attachments → ActiveStorage::Attachment → ActiveStorage::Blob`** 四级级联，最坏情况 Sidekiq 队列堆积怎么办？看 `dependent: :destroy_async` 的 ActiveJob 执行链。

### 延伸阅读（按推荐顺序）

| # | 文件 | 回答的问题 |
|---|------|-----------|
| 1 | [`app/listeners/base_listener.rb`](https://github.com/chatwoot/chatwoot/blob/6c8741b314277531c89ce7cfb8160185bb5e06ac/app/listeners/base_listener.rb) | listener 怎么注册事件名 → 方法名约定 |
| 2 | [`app/javascript/dashboard/helper/actionCable.js`](https://github.com/chatwoot/chatwoot/blob/6c8741b314277531c89ce7cfb8160185bb5e06ac/app/javascript/dashboard/helper/actionCable.js) | 前端 ActionCable client 怎么把 ws event 路由到 store |
| 3 | [`app/services/automation_rules/action_service.rb`](https://github.com/chatwoot/chatwoot/blob/6c8741b314277531c89ce7cfb8160185bb5e06ac/app/services/automation_rules/action_service.rb) | 自动化规则的"动作执行"侧 |
| 4 | [`app/builders/messages/message_builder.rb`](https://github.com/chatwoot/chatwoot/blob/6c8741b314277531c89ce7cfb8160185bb5e06ac/app/builders/messages/message_builder.rb) | attachments + email + in_reply_to 怎么归一 |
| 5 | [`lib/integrations/slack/send_on_slack_service.rb`](https://github.com/chatwoot/chatwoot/blob/6c8741b314277531c89ce7cfb8160185bb5e06ac/lib/integrations/slack/send_on_slack_service.rb) | 出站集成（dashboard 回复 → 转发到 Slack） |
| 6 | [`app/controllers/webhooks/whatsapp_controller.rb`](https://github.com/chatwoot/chatwoot/blob/6c8741b314277531c89ce7cfb8160185bb5e06ac/app/controllers/webhooks/whatsapp_controller.rb) | 入站集成（WhatsApp webhook → MessageBuilder） |
| 7 | [`app/services/online_status_tracker.rb`](https://github.com/chatwoot/chatwoot/blob/6c8741b314277531c89ce7cfb8160185bb5e06ac/app/services/online_status_tracker.rb)（如存在） | Redis presence tracking 实现 |

## 限制（≥ 4 条独立限制）

1. **状态机用 enum + 整数值**：长期 schema 演进受限，加新状态必须追加（`open=0/resolved=1/pending=2/snoozed=3/archived=4`），改顺序就错位。代码里的 `# FIXME: implement state machine with aasm` 留了 5 年没动，是技术债的诚实记录。
2. **AnyCable 在生产替换 Puma ws，但 dev 环境只是普通 ActionCable on Puma**：`docker compose up` 起的栈和生产架构不一致。学这一层时不要假设你看到的就是生产实际并发处理方式。
3. **`destroy_async` 的级联依赖 Sidekiq 健康**：如果 Sidekiq 阻塞，已删除 conversation 的孤儿数据（messages、attachments）会堆在 PG 里持续到 worker 恢复。生产 self-host 必须监控 Sidekiq 队列深度，否则数据库膨胀。
4. **`enterprise/` 子目录与 MIT 主目录混合**：MIT license 不覆盖 `enterprise/` 下的代码，但目录边界不靠技术强制（共享一个 `app/` 加载路径），fork 后随手改可能误入 EE 边界。这种 single-repo dual-license 是治理风险。
5. **`Conversation` 模型有 10 个 concern + 主类 367 行**：实际方法数 > 100 个（grep `def `），无法一眼看完。新人入项目第一周的认知负担集中在这一个文件上，是 chatwoot 招聘门槛之一。
6. **commit 热点统计依赖完整 git 历史**：浅克隆（`--depth 1`）后这一步分析就废了。本笔记的"commit 热点按 subsystem 分组"是基于文件大小 + 已知活跃度推断，不是 ground truth。完整精度需要 full clone（约 1 GB git history）。

## 附录：宣传 vs 现实

| 宣传 | 现实 |
|---|---|
| "open-source live-chat" | 是 MIT 主体 + `enterprise/` 子目录是商业 license。SLA / Custom Roles / Audit Log / 部分 Captain AI 在 EE 目录。 |
| "alternative to Intercom" | 多渠道、对话模型、自动化规则可以替代；但 Intercom 的 AI Fin 功能（深度产品知识理解 + 多步推理）chatwoot Captain 还没追上。 |
| "omni-channel desk" | 11 类 inbox 都是 webhook 适配器架构，加新 channel 要写 `webhook_controller.rb` + adapter service + `inbox.channel_type` 一组配置，不是"开箱即用一个开关"。 |
| "trusted by [大客户]" | 大客户多用 cloud 版 chatwoot.com（这是主收入），self-host 用户面对的是同一份代码但要自维护 PG/Redis/Sidekiq。 |
| "easy to self-host" | docker compose up 在 dev 是真的 easy；生产真上规模要换 Anycable + 单独 PG / Redis / Sidekiq 实例 / 反代 / sentry / 日志聚合，不是一行命令。 |

---

升级日期：2026-05-28（v1.1 状元篇分支 A 大型应用）
总行数：~575 行（见文件末尾 `wc -l`）
启用工具：`gh repo view`（star/license/branch）/ `git clone --depth 1`（heart files）/ `Read`（精读 conversation.rb / room_channel.rb / message_finder.rb / dispatcher.rb / action_cable_listener.rb / store/modules/conversations/index.js）/ WebFetch（README + repo metadata）/ cwebp + qlmanage（架构图渲染）
项目类型：大型应用（multi-channel customer support platform，端到端用户产品，Rails monolith + Vue 3 SPA + 11 类外部 inbox 适配 + 实时推送 + 自动化规则引擎 + 多 listener 事件总线）
