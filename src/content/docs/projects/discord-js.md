---
title: discord.js — Node.js Discord API 客户端事实标准
来源: 'https://github.com/discordjs/discord.js'
日期: 2026-05-31
子分类: 实时通信
分类: 通信
难度: 初级
provenance: pipeline-v3
---

## 是什么

discord.js 是 **Node.js 上写 Discord 机器人的事实标准库**——把 Discord 的 WebSocket 网关、REST 接口、语音 WebRTC 全部封进一个 EventEmitter 风格的客户端。日常类比：你雇一个 24 小时在线的"群助理"，事先告诉他"看到 ping 就回 pong"，剩下的连线、心跳、断线重连、限流退避都不用你操心。

最小能跑的代码长这样：

```js
import { Client, GatewayIntentBits } from 'discord.js'

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] })

client.on('messageCreate', (msg) => {
  if (msg.author.bot) return
  if (msg.content === 'ping') msg.reply('pong')
})

client.login(process.env.DISCORD_TOKEN)
```

跑起来，群里有人发 `ping`，bot 回 `pong`。你**没碰任何 WebSocket、HTTP 请求、心跳协议、限流退避**——全是 discord.js 兜的。

## 为什么重要

不理解 discord.js 在 Node 生态里的位置，下面这些事会很奇怪：

- 为什么 Node.js 的 Discord 教程几乎全用它，而不是直接拼 REST 调用
- 为什么 25k stars 的第三方库会被 Discord 官方文档列为推荐客户端
- 为什么 v13 之后强制要求 `intents` 参数，新人一来就被这个挡住
- 为什么 v14 把 `MessageEmbed` 改名 `EmbedBuilder`、整套构造器都翻新——这背后是 Discord 平台规则的连锁反应

## 核心要点

discord.js 的工作方式可以拆成 **三层 + 一个 monorepo**：

1. **底层：Client + Gateway**：Discord 用 WebSocket 持续推事件（消息、表情、语音状态），discord.js 维护这条长连接、做心跳、断线重连、必要时自动 sharding（>2500 服务器时拆多条连接）。你只调 `client.login(token)`。

2. **中层：events**：`client.on('messageCreate', cb)` 这种 EventEmitter 写法把回调挂到事件上。事件名固定（`ready` / `messageCreate` / `interactionCreate` / `guildMemberAdd` 等），数据是预先包好的对象（`Message` / `Interaction` / `GuildMember`）。

3. **高层：Application Commands + Builders**：写命令机器人时用 `SlashCommandBuilder` 描述命令，再用 `@discordjs/rest` 的 `REST` 客户端注册到 Discord，运行时通过 `interactionCreate` 事件接收。这是 Discord 官方主推、新项目唯一该选的命令形式。

整个项目是一个 **monorepo**，核心 `discord.js` 之外还分出 `@discordjs/voice`（语音/WebRTC）/ `@discordjs/rest`（独立的 REST 客户端）/ `@discordjs/builders`（命令构造器）/ `@discordjs/collection`（带 filter/map/find 的 Map 子类）等独立包，各自可单用。

## 实践案例

### 案例 1：注册 slash command（v14 现代写法）

```js
import { REST, Routes, SlashCommandBuilder } from 'discord.js'

const commands = [
  new SlashCommandBuilder().setName('hello').setDescription('打个招呼')
    .addStringOption((o) => o.setName('name').setDescription('你的名字').setRequired(true))
].map((c) => c.toJSON())

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN)
await rest.put(Routes.applicationGuildCommands(APP_ID, GUILD_ID), { body: commands })
```

跑一次脚本，命令就出现在那个服务器的 `/` 菜单里。`applicationGuildCommands` 是单服注册（即时生效）；`applicationCommands` 是全局注册（Discord 后台传播最长 1 小时）。本地开发先用单服省时间。

### 案例 2：响应 slash command + 用 EmbedBuilder

```js
import { EmbedBuilder } from 'discord.js'

client.on('interactionCreate', async (i) => {
  if (!i.isChatInputCommand() || i.commandName !== 'hello') return
  const name = i.options.getString('name', true)
  const embed = new EmbedBuilder().setTitle('你好').setDescription(`hi ${name}`).setColor(0x5865f2)
  await i.reply({ embeds: [embed] })
})
```

`isChatInputCommand()` 这种**类型守卫**是 v14 新设计——同一个 `interactionCreate` 既会推 slash command 也会推按钮、菜单、modal，先用守卫窄化类型再访问字段。`EmbedBuilder` 是 v14 的新名字，v13 叫 `MessageEmbed`，老教程多是旧名。

### 案例 3：Collection 比原生 Map 多了一组高阶方法

```js
const human = client.users.cache.filter((u) => !u.bot)
const names = human.map((u) => u.username)
const first = client.guilds.cache.find((g) => g.name.startsWith('test'))
```

`client.users.cache` 等内置缓存全都是 `Collection` 实例（继承 `Map`），多了 `filter` / `map` / `find` / `random` / `first` 等方法。日常类比：原生 Map 像只能 `get/set` 的字典，Collection 把它升级成了"小型集合操作库"——很多场景不用拷出去再处理。

## 踩过的坑

1. **Intents 必须显式声明**：v13 起 `new Client({})` 没传 `intents` 直接报错；`MessageContent` / `GuildMembers` / `GuildPresences` 是 **privileged intent**，Discord 开发者后台默认关，不勾就拿不到消息正文和成员列表。新人 99% 的"为什么没反应"是这个。

2. **网上 v12 教程基本全废**：v13/v14 大改——`MessageEmbed` → `EmbedBuilder`、`MessageButton` → `ButtonBuilder`、命令注册流程换成 REST + Builders、`interaction.deferReply()` 取代 `interaction.acknowledge()`。看到 `client.commands` 直接挂在 client 上、或 `new MessageEmbed()` 的就是老代码。

3. **Sharding 不是你想自动就自动**：单进程默认连一条 WebSocket，到 2500 服务器 Discord 拒绝继续。要么用 `ShardingManager` 多进程拆，要么 `client.options.shards = 'auto'` 让库决定。小 bot 完全不用想。

4. **限流要靠库扛**：Discord REST 接口有 per-route 和 global 限流。`@discordjs/rest` 内置队列和退避，**不要自己 `fetch` 绕过**——一旦触发全局限流整个 bot 会停 5-30 秒。

5. **缓存默认全装内存**：`client.users.cache` / `client.guilds.cache` 等结构会随事件持续累积，bot 上规模后内存会涨得比预期快。v14 提供 `Sweepers` 选项做周期性清理，也可以在 `makeCache` 里限制单个 manager 的容量；上线前必须想清楚哪些缓存留、哪些扔。

6. **`reply` 必须 3 秒内回复**：interaction 收到后 Discord 给你 3 秒，超时整条会被标记失败。要做长任务先 `interaction.deferReply()` 拿到"思考中"状态，再 `editReply` 补内容；这是新人最常踩的"明明跑成功了用户那边却报错"。

## 适用 vs 不适用场景

**适用**：

- Node.js 写 Discord bot——几乎是默认选择
- TypeScript 项目（v14 的类型定义非常细，slash command 选项类型能精确推出来）
- 需要语音/音乐 bot（用 `@discordjs/voice` 接 ffmpeg / opus）
- 把 LLM 接进 Discord 聊天（社区案例最多的语言之一就是 Node）

**不适用**：

- 其他 IM 平台（Slack / Telegram / 飞书）——协议完全不同
- Python 项目——用 [[discord-py]]，写法理念相似但 API 完全独立
- Cloudflare Workers / Edge 环境——核心库依赖 Node 的 `ws` 和 `EventEmitter`，迁不过去；只用 slash command 的话可以单独用 `@discordjs/rest` + 直接处理 HTTP interaction

## 历史小故事（可跳过）

- **2015**：hydrabolt 开始写 discord.js，当时 Discord API 还是封闭测试
- **2018**：v11 / v12 演进期，社区快速壮大
- **2021-08**：Discord 强制 `MessageContent` 转 privileged，整个 bot 生态震动
- **2021-08**：v13 发布，强制 `intents` 参数，老代码不改一行跑不起来
- **2022-07**：v14 发布，整套 Builder API（`EmbedBuilder` / `ButtonBuilder` / `ModalBuilder`），monorepo 拆出 `@discordjs/voice` 等独立包
- **至今**：稳定迭代，仍是 Node 圈 Discord bot 的第一选择

## 学到什么

1. **网络协议库的价值在"屏蔽下层"**：心跳、重连、限流、sharding 这些细节用户不该碰，库的职责就是把它们封进黑盒
2. **EventEmitter 是 Node 网络库的通用范式**——和 Python 的"装饰器注册回调"是不同语言生态的同一种思想
3. **平台政策能逼整个库重写**：Discord 改一次 intent 规则，discord.js 一个大版本就被迫迁移；做客户端库要做好"上游一变全得跟"的心理准备
4. **Builder 模式 + 类型守卫**是 v14 的两个 TS 友好支柱——前者让命令定义有类型推断，后者让事件分发有窄化能力

## 延伸阅读

- 官方 Guide：[discordjs.guide](https://discordjs.guide)（从 0 到上线的完整教程，含 slash command 部署）
- 官方 API 文档：[discord.js.org](https://discord.js.org)
- [[discord-py]] —— Python 版的同位库，理念近、API 各自独立
- [[fastify]] —— Node.js 高性能 HTTP 框架，常和 discord.js 混用做后台

## 关联

- [[discord-py]] —— Python 版 Discord bot 库，写法理念相似
- [[fastify]] —— Node.js 服务端框架，bot 加 HTTP 接口时常配套用
- [[errbot]] —— 多 IM 平台的 chatops 框架，可挂 Discord 后端，抽象更高一层
