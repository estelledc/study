---
title: Errbot — 用 Python 类写一个能进 Slack/Discord 的聊天机器人
来源: 'https://github.com/errbotio/errbot'
日期: 2026-05-31
子分类: 实时通信
分类: 通信
难度: 初级
provenance: pipeline-v3
---

## 是什么

Errbot 是一个 **Python 写的 chatops 机器人框架**——你写一个普通的 Python 类，给方法加一个装饰器，它就能在 Slack / Discord / Telegram 等 IM 群里被 `@bot 命令` 触发执行。日常类比：像办公室的小助理，你和同事在群里说一句"小助理，帮我看下今天的部署状态"，它就跑去查、回来贴答案——它本身不会想问题，是你预先写好"听到 X 就做 Y"的脚本。

你写：

```python
from errbot import BotPlugin, botcmd

class Hello(BotPlugin):
    @botcmd
    def hello(self, msg, args):
        return f"hi {msg.frm.nick}"
```

把这个文件丢进 plugins 目录，重启 bot，群里发 `!hello`，bot 回 `hi jason`。你**没碰任何 IM 协议**——Slack 的 WebSocket、Discord 的 gateway、Telegram 的轮询，Errbot 都帮你包了。

## 为什么重要

不理解 Errbot 这种"插件即 Python 类"的风格，下面这些事会很奇怪：

- 为什么运维团队的 chatops（在群里 `!deploy prod`）能 5 分钟搭起来——bot 框架替你扛了 IM 协议
- 为什么 Hubot（Node 写）和 Lita（Ruby 写）都坚持"插件即代码文件"——这是 chatops 圈子的共同设计模式
- 为什么很多公司选 Errbot 而不是直接调 Slack Bolt SDK——Errbot 把"换 IM 平台不改业务代码"这件事做掉了
- 为什么 chatops 这个词 2013 年才出现——IM 群协作 + 自动化运维同时成熟才催生这个范式

## 核心要点

Errbot 的工作方式可以拆成 **三件事**：

1. **后端（Backend）抽象 IM 协议**：Slack、Discord、Telegram、IRC、Mattermost 各有各的 SDK，Errbot 在它们上面套一层统一接口（接收消息 → `Message` 对象，回消息 → `send`）。换 IM 只改 `config.py` 里 `BACKEND = 'Slack'` 一行。

2. **插件即 Python 类**：继承 `BotPlugin`，方法上加 `@botcmd` 就成了一条命令。装饰器会读方法名当命令名、读 docstring 当帮助文本。类比：海关的"申报单"——你只填一份表，分发到哪个窗口由系统决定。

3. **持久化和热重载**：`self['key'] = value` 自动写入持久化存储（默认 shelve，可换 Redis / PostgreSQL）；`!plugin reload Hello` 不重启 bot 就能换代码——这是给运维场景设计的，bot 不能因为改一行而下线。

三件事加起来，让"写一段 Python 脚本 → 群里能用"成了一条直线。

## 实践案例

### 案例 1：最小可跑的命令

```python
from errbot import BotPlugin, botcmd

class Math(BotPlugin):
    @botcmd
    def add(self, msg, args):
        a, b = map(int, args.split())
        return str(a + b)
```

群里发 `!add 3 5`，bot 回 `8`。`args` 是命令名后面的整段字符串，自己解析。

### 案例 2：带参数解析 + 帮助文本

```python
from errbot import BotPlugin, arg_botcmd

class Deploy(BotPlugin):
    @arg_botcmd('--env', type=str, default='staging')
    @arg_botcmd('service', type=str)
    def deploy(self, msg, env, service):
        """部署 service 到指定环境"""
        return f"deploying {service} to {env}"
```

群里发 `!deploy api --env prod`，Errbot 自动用 argparse 解析成 `service='api', env='prod'`。`!help deploy` 自动展示 docstring 和参数。

### 案例 3：webhook 接外部系统

```python
from errbot import BotPlugin, webhook

class CI(BotPlugin):
    @webhook('/ci/done', raw=True)
    def ci_done(self, request):
        data = request.get_json()
        self.send(self.build_identifier('#ops'),
                  f"build {data['build_id']} {data['status']}")
        return 'ok'
```

CI 系统打 `POST http://bot:3141/ci/done`，bot 把消息发到 `#ops` 频道。这让 bot 既是命令响应器，又是事件中转——chatops 的核心闭环。

## 踩过的坑

1. **Slack 后端要 Bot Token 和 App Token 两个**：Slack Socket Mode 需要 `SLACK_BOT_TOKEN`（xoxb-）和 `SLACK_APP_TOKEN`（xapp-），少一个连不上；新人常只配 bot token 然后困惑"为什么 bot 在线但收不到消息"。

2. **`self['key']` 不是普通 dict**：底层是 shelve，写入大对象（>1MB）会变慢；并发写没有锁，多线程插件要自己加锁——把它当"轻量配置存储"用，不要当数据库。

3. **`@botcmd` 和 `@arg_botcmd` 混用要注意**：`@botcmd` 把整个 args 当字符串给你，`@arg_botcmd` 走 argparse；同一方法不能两个都贴，错贴会让命令注册不上又不报错。

4. **热重载不是万能**：改了 `BotPlugin.activate()` 里的初始化逻辑，`!plugin reload` 不会重新跑——只重新加载方法定义。涉及初始化的改动还是要重启进程。

## 适用 vs 不适用场景

**适用**：

- 团队已经在 IM 群里协作，想把"看监控、跑部署、查状态"这类高频操作搬进群——chatops 的标准场景
- 需要同一份命令逻辑跨多 IM（公司用 Slack、外部用户群在 Telegram）——backend 抽象省去重写
- 运维 / DevOps 场景，bot 需要长期运行 + 支持热加载新命令而不下线

**不适用**：

- 只想做一个客服对话机器人（要意图识别、多轮对话、知识库）——选 [[rasa]] 或 LLM 驱动的方案，Errbot 没有 NLU
- 只在一个 IM 平台用且功能简单——直接用该平台 SDK（Slack Bolt、discord.py）更轻
- 团队没有 Python 栈——选 Hubot（Node）/ Lita（Ruby）按团队习惯走

## 历史小故事（可跳过）

- **2010 年**：Guillaume Binet 写了 **Err**，最初只支持 XMPP / Jabber，目标是给自己的服务器加一个能在 Jabber 群里跑命令的工具
- **2014 年前后**：项目改名 **Errbot**，插件 API 形式化，加入多后端架构（IRC 第二个，Hipchat 第三个）
- **2016 年起**：Slack / Telegram / Discord 后端陆续社区贡献，覆盖主流 IM
- **2020 年起**：webhook + 动态插件加载成熟，被各种 DevOps 团队拿去做 chatops 主力
- 同期对照：GitHub 的 Hubot（2011，CoffeeScript）和 Litaio 的 Lita（2013，Ruby）走类似路线，三者构成 chatops 工具链最早的代名词

## 学到什么

- **协议抽象是 bot 框架的核心价值**：写业务代码的人不该关心 WebSocket / 长轮询 / Webhook 的差异
- **插件即代码文件**：放进目录就能用，是运维场景对"低运维负担"的极致追求
- **chatops 的边界**：Errbot 这类工具是"群里跑确定性脚本"的最佳载体，不是"和你聊天"的 AI 助手——边界划清，需求才不打架
- **热重载是运维场景的硬约束**：bot 是长跑进程，"改一行代码就下线"在生产里不可接受

## 延伸阅读

- 官方文档：[Errbot 文档](https://errbot.readthedocs.io/)（从 hello world 到多后端配置都有）
- 源码仓库：[errbotio/errbot](https://github.com/errbotio/errbot)（plugin 系统的实现可以读读 `core_plugins/`）
- chatops 概念出处：[GitHub Hubot 项目主页](https://hubot.github.com/)（同期同思路的 Node 实现）
- [[rasa]] —— 对照看"对话理解"和"chatops 命令"两条不同路线
- [[playwright]] —— bot 经常调外部系统，浏览器自动化也是常见后端

## 关联

- [[rasa]] —— 对话机器人代表，对照看"NLU 驱动" vs "命令驱动"两种 bot 范式
- [[fastapi]] —— Errbot 的 webhook 让它在 chatbot 框架里兼具 web 端点能力，思路与 FastAPI 同源
- [[strawberry]] —— 同样以"装饰器读注解 / 装饰器读方法"为入口的 Python 库设计
- [[django]] —— 老牌 batteries-included 框架；Errbot 之于 chatops 类比 Django 之于 web

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[botbuilder-js]] —— Bot Framework SDK JS — 微软多渠道 chatbot 的 Adapter + Middleware 抽象
- [[discord-js]] —— discord.js — Node.js Discord API 客户端事实标准
- [[discord-py]] —— discord.py — 用 Python 写 Discord 机器人的事实标准
- [[django]] —— Django — 全功能 batteries-included 的 Python web 框架
- [[fastapi]] —— FastAPI — 用 Python 类型注解写 API
- [[playwright]] —— Playwright — 跨浏览器自动化测试
- [[rasa]] —— Rasa — 自己造一个能记住上下文的对话机器人
- [[strawberry]] —— Strawberry — 用 Python 类型注解直接生成 GraphQL schema

