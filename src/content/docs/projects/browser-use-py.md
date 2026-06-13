---
title: browser-use — 给 AI 装上眼睛和手
来源: https://github.com/browser-use/browser-use
日期: 2026-06-13
子分类: 智能体与 LLM
分类: Agent
provenance: pipeline-v3
---

## 是什么

**browser-use** 是一个 Python 库，让 AI 模型能像人一样打开浏览器、看页面、点按钮、填表单、读文字，完成各种网页上的任务。

日常类比：想象你请了一个实习生帮你上网办事。以前 AI 只能"读文字"（比如聊天），它看不见屏幕、碰不了鼠标。browser-use 就是这个实习生的"眼睛 + 双手"——给它一个网页、告诉它你要做什么，它自己打开浏览器、看懂页面上有什么、然后帮你一步步点到位。

## 核心概念

### 1. Agent（智能体）

Agent 是整个系统的"大脑"。你给它一个自然语言任务（比如"帮我找到 star 数最多的 Python 项目"），它就会自己规划步骤、操作浏览器、直到完成任务。

### 2. LLM（大语言模型）

Agent 需要"脑子"来做决策。browser-use 支持多种 LLM 后端——你可以用 OpenAI 的 GPT、Anthropic 的 Claude、Google 的 Gemini，也可以用它们自己优化的模型。你只给一句话，LLM 会把它翻译成浏览器操作。

### 3. Browser（浏览器）

browser-use 底层用 Playwright 驱动一个真实的 Chromium 浏览器。它不是模拟请求，而是**真正打开一个浏览器窗口**，像人一样在页面上点击、输入、滚动。

### 4. Tools（工具）

除了基本的点击和输入，你可以给 Agent 装"自定义工具"，让它能调用你写的函数，比如查询数据库、发送邮件、读取文件等。

### 架构流程

```
你给 Agent 发任务
  -> LLM 看懂任务
  -> LLM 决定下一步操作（点击哪里 / 输入什么）
  -> Playwright 在真实浏览器里执行操作
  -> 浏览器截图和页面信息反馈给 LLM
  -> LLM 判断是否完成，没完成继续下一步
  -> 循环直到任务完成
```

## 安装和第一个例子

### 安装

```bash
pip install "browser-use[core]"
```

你需要 Python 3.11 或以上版本。

### 例子 1：最简单的 Agent —— 查找 GitHub 上的 star 数

```python
from browser_use.beta import Agent, BrowserProfile, ChatBrowserUse
import asyncio

async def main():
    agent = Agent(
        task="Find the number of stars of the browser-use repo",
        llm=ChatBrowserUse(model='openai/gpt-5.5'),
        browser_profile=BrowserProfile(
            headless=False,  # False 表示显示浏览器窗口，方便你看着它操作
            allowed_domains=["*.github.com"],  # 只允许访问 GitHub 相关域名
        ),
    )
    history = await agent.run()
    print(history.final_result())

if __name__ == "__main__":
    asyncio.run(main())
```

**这段代码做了什么？**
1. 创建一个 Agent，任务是"找到 browser-use 仓库的 star 数"
2. 用 GPT-5.5 作为大脑
3. `headless=False` 让浏览器窗口弹出来，你能看到它每一步操作
4. `allowed_domains` 限制了 Agent 只能访问 GitHub 域名，防止它跑去别的地方
5. `agent.run()` 开始执行，Agent 会自动打开浏览器、搜索、读取页面、提取 star 数
6. 完成后输出最终结果

### 例子 2：带自定义工具的 Agent —— 查询天气

```python
from browser_use import Agent, Tools
from browser_use.beta import ChatBrowserUse
import asyncio

# 第一步：创建工具集
tools = Tools()

# 第二步：写一个自定义工具 —— 模拟查询天气
@tools.action(description="Get the weather for a given city.")
def get_weather(city: str) -> str:
    weathers = {"北京": "晴 22°C", "上海": "多云 25°C", "深圳": "小雨 28°C"}
    return weathers.get(city, "暂不支持该城市")

# 第三步：创建 Agent 并使用工具
async def main():
    agent = Agent(
        task="北京和上海今天的天气哪个更好？",
        llm=ChatBrowserUse(model='openai/gpt-5.5'),
        tools=tools,  # 把自定义工具交给 Agent
    )
    history = await agent.run()
    print(history.final_result())

if __name__ == "__main__":
    asyncio.run(main())
```

**这段代码做了什么？**
1. 用 `Tools()` 创建一个工具集
2. 用 `@tools.action` 装饰器把一个普通函数变成 Agent 可用的工具，描述告诉 Agent "这是查天气的"
3. 创建 Agent 时传入 `tools=tools`，Agent 就知道可以调用查天气的工具了
4. 你只需要说"北京和上海天气哪个更好"，Agent 会自动调用 `get_weather` 函数，拿到两个城市的天气后自己比较

## 实际能做什么

| 场景 | 你只需要说一句 |
|------|---------------|
| 自动填表 | "用我的简历信息填写这个求职申请表" |
| 网购比价 | "把这份购物清单加到 Instacart 购物车" |
| 信息搜集 | "帮我找一个能装 4090 显卡的电脑机箱" |
| 数据抓取 | "找到所有价格在 100 元以下的 Python 书籍" |

## CLI 快速操作

除了写代码，browser-use 还提供了命令行工具，可以交互式地操作浏览器：

```bash
browser-use open https://example.com    # 打开网页
browser-use state                       # 列出页面上所有可点击的元素
browser-use click 5                     # 点击第 5 个元素
browser-use type "你好"                 # 在输入框打字
browser-use screenshot page.png         # 截图保存
browser-use close                       # 关闭浏览器
```

CLI 模式下浏览器会一直保持打开状态，每条命令之间不会重启，适合快速迭代测试。

## 本地 vs 云端

**用开源版（本地运行）：**
- 完全免费，MIT 开源协议
- 需要自己管理浏览器实例
- 适合需要深度定制、自定义工具的场景
- 需要搭配 LLM 的 API 密钥（OpenAI / Anthropic / Google 等）

**用云端版（browser-use.com）：**
- 更强大的模型，完成复杂任务成功率更高
- 内置反检测（stealth）、代理轮换、验证码解决
- 1000+ 集成（Gmail、Slack、Notion 等）
- 适合生产环境大规模使用

## 下一步可以探索

- [自定义工具](https://docs.browser-use.com/customize/tools/basics)：深入 learn 如何编写更强的工具
- [浏览器配置](https://docs.browser-use.com/open-source/customize/browser/remote)：远程浏览器、隐身模式
- [支持的模型](https://docs.browser-use.com/supported-models)：用不同的 LLM 后端
- [更多示例](https://docs.browser-use.com/examples)：表单填写、网购、个人助理等完整案例
