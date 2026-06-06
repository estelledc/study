---
title: discord.py — 用 Python 写 Discord 机器人的事实标准
来源: 'https://github.com/Rapptz/discord.py'
日期: 2026-05-31
子分类: 实时通信
分类: 通信
难度: 初级
provenance: pipeline-v3
---

## 是什么

discord.py 是一个 **Python 写的 Discord API 客户端库**——你在文件里定义几个 async 函数，加个装饰器，它们就会被 Discord 服务器推过来的事件触发。日常类比：你雇了一个永远在线的"群管理员"，事先告诉他"看到有人发 hello 就回 hi"，剩下的连接、心跳、断线重连都不用你管。

最小能跑的代码长这样：

```python
import discord

client = discord.Client(intents=discord.Intents.default())

@client.event
async def on_message(msg):
    if msg.author == client.user:
        return
    if msg.content == 'hello':
        await msg.channel.send('hi')

client.run('YOUR_BOT_TOKEN')
```

跑起来，群里有人发 `hello`，bot 就回 `hi`。你**没碰任何 WebSocket、HTTP、心跳协议**——这些 discord.py 都包了。

## 为什么重要

不理解 discord.py 在 Python Discord bot 圈的位置，下面这些事会很奇怪：

- 为什么搜"Python Discord bot 教程"九成都用 discord.py 而不是直接调 REST API
- 为什么 2021 年作者宣布停更引发整个社区分裂出一堆 fork（nextcord/disnake/py-cord）
- 为什么 14.5k stars 一个第三方库会成为 Discord 自己都默认推荐的客户端
- 为什么"async + 装饰器 + 类型注解"这套写法在 Python 网络库里反复出现（FastAPI / aiohttp 同款风格）

## 核心要点

discord.py 的工作方式可以拆成 **三层**：

1. **底层：Client + Gateway**：Discord 用 WebSocket 推事件（有人发消息、有人加表情、有人进语音），discord.py 维护这个长连接、做心跳、断线自动重连。你只需要 `client.run(token)`。

2. **中层：events**：`@client.event async def on_message(msg)` 这种装饰器把你的函数注册成事件回调。Discord 推一条消息过来，库就 `await` 你的函数。事件名称固定（on_message / on_ready / on_member_join 等）。

3. **高层：commands.Bot + Cog + App Commands**：写命令机器人时用 `commands.Bot`（继承自 `Client`），把一组相关命令打包进 `Cog` 类做模块化。2.0 版本后原生支持 **slash command**（用 `@app_commands.command` 装饰器），这是 Discord 官方主推的命令形式。

三层加起来：你写业务逻辑（Cog 里的几个 async 方法），库扛网络协议。

## 实践案例

### 案例 1：传统 prefix 命令（用 `!` 触发）

```python
from discord.ext import commands
import discord

intents = discord.Intents.default()
intents.message_content = True   # 必须开！否则收不到消息文本
bot = commands.Bot(command_prefix='!', intents=intents)

@bot.command()
async def ping(ctx):
    await ctx.send('pong')

bot.run('YOUR_BOT_TOKEN')
```

群里发 `!ping`，bot 回 `pong`。注意 `intents.message_content = True` 这行——2022 年后 Discord 强制把"读消息文本"列为 privileged intent，不开就只能收到空字符串。

### 案例 2：slash command（Discord 官方推的现代写法）

```python
from discord import app_commands
import discord

class MyBot(discord.Client):
    def __init__(self):
        super().__init__(intents=discord.Intents.default())
        self.tree = app_commands.CommandTree(self)

    async def setup_hook(self):
        await self.tree.sync()   # 把命令注册到 Discord

bot = MyBot()

@bot.tree.command(description='打个招呼')
async def hello(interaction: discord.Interaction, name: str):
    await interaction.response.send_message(f'hi {name}')

bot.run('YOUR_BOT_TOKEN')
```

用户在 Discord 输入 `/`，UI 自动列出 `hello` 命令并提示填 `name` 参数。比 prefix 命令体验好得多，新项目都该用这个。

### 案例 3：Cog 把命令分组打包

```python
from discord.ext import commands

class Greetings(commands.Cog):
    def __init__(self, bot):
        self.bot = bot

    @commands.command()
    async def hi(self, ctx):
        await ctx.send(f'hi {ctx.author.mention}')

async def setup(bot):
    await bot.add_cog(Greetings(bot))
```

把这个文件放进 `cogs/greetings.py`，用 `await bot.load_extension('cogs.greetings')` 加载。**热重载** `await bot.reload_extension('cogs.greetings')` 不重启就能改代码——线上 bot 不能因为改一行而下线。

## 踩过的坑

1. **Privileged Intents 必须手动开**：`message_content` / `members` / `presences` 三个 intent 在 Discord 开发者后台默认关，不勾选就拿不到消息文本、成员列表、在线状态。新人最常遇到"为什么我的命令没反应"——99% 是 intent 没开。

2. **网上 1.x 教程坑死人**：2021-2022 停更期间作者复活后 API 大改（async setup_hook、app_commands、Intent 强制），但搜索结果前几页还是老教程。看到 `bot = commands.Bot(command_prefix='!')` 没传 intents 的就是 1.x 写法。

3. **slash command sync 要等**：`tree.sync()` 全局同步要 Discord 后台传播 1 小时；本地开发时用 `tree.sync(guild=discord.Object(id=YOUR_GUILD))` 单服同步是即时的。

4. **作者停更过一次**：2021-08 Rapptz 发 gist 说不干了，理由是 Discord 强推 slash command + message_content 政策让他失去动力。社区当时分裂出 nextcord / disnake / py-cord 几个 fork。2022-04 作者撤回决定发了 2.0。**老项目可能停在 fork 上**，迁回主线要看清版本。

## 适用 vs 不适用场景

**适用**：

- Python 写 Discord bot——99% 的场景这是默认选择
- 社群运营自动化（欢迎、违规过滤、定时通知、抽奖）
- 游戏战队工具（查战绩、ELO、对线安排）
- LLM 接群聊（Discord 是 AI 圈最活跃的实验场）

**不适用**：

- 其他 IM 平台（Slack / Telegram / 飞书）——协议完全不同，用对应库
- 必须纯同步代码风格——discord.py 全 async，混同步会卡事件循环
- 大量 verified bot 业务（>100 服务器）——message_content 要 Discord 人工审核，不通过就只能切 slash command 范式

## 历史小故事（可跳过）

- **2015**：Rapptz（Danny）开始写 discord.py，当时 Discord API 还很新
- **2018**：1.0 完成全面迁移到 asyncio
- **2021-08**：作者发 gist 宣布停更，社区震动，分裂出 nextcord / disnake / py-cord 等 fork
- **2022-04**：作者撤回决定，发布 2.0，原生支持 slash command / buttons / modals / select menus
- **至今**：仍是 Python 圈 Discord bot 的事实第一选择，14.5k stars

## 学到什么

1. **网络协议库的价值在"屏蔽下层"**：心跳、重连、限流、shard 这些细节用户根本不该碰，库的职责就是把它们封进黑盒
2. **"装饰器注册回调"是 Python 网络库的通用范式**——FastAPI 路由、aiohttp 处理器、discord.py 事件都用同样的写法
3. **API 政策能杀死/复活一个生态**：Discord 强推 message_content intent 直接逼出社区 fork，作者复活后又把生态拉回来
4. **Cog + 热重载是长跑型 bot 的设计核心**——线上服务不能为改一行代码下线

## 延伸阅读

- 官方文档：[discordpy.readthedocs.io](https://discordpy.readthedocs.io)（API 参考 + 完整 quickstart）
- 视频教程：[Indently — discord.py v2 现代写法](https://www.youtube.com/results?search_query=discord.py+v2+slash+command)
- [[errbot]] —— 多 IM 平台的 chatops 框架，可挂 Discord 后端
- [[fastapi]] —— 同样用 Python type hint 的 async 框架，写法风格几乎一样

## 关联

- [[errbot]] —— Errbot 也能挂 Discord 后端，但抽象层更高
- [[fastapi]] —— async + 装饰器 + 类型注解的 Python 网络库范式同源
- [[botpress]] —— 多平台低代码 bot，对比"代码优先"的 discord.py
