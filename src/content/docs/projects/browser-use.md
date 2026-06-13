---
title: browser-use — 用自然语言让 AI Agent 操控浏览器
来源: 'https://github.com/browser-use/browser-use'
日期: 2026-06-13
子分类: AI与自动化
分类: 其他
难度: 高级
provenance: pipeline-v3
season: 6
---

## 日常类比：雇一个会自己查地图的实习生

想象你要让实习生帮你办一件杂事：「去招聘网站搜 Python 远程岗，把前 5 条标题和薪资抄到表格里」。你不会给他写 47 步操作手册（先点这里、再等 3 秒、再 XPath 那个按钮）。你会**用一句话交代目标**，让他自己打开浏览器、找搜索框、翻页、复制——中间遇到弹窗自己关，找不到就换关键词。

**browser-use 干的就是这件事**，只不过「实习生」是大语言模型（LLM），「浏览器」由程序在后台或通过 CDP 驱动。你写 `task="..."`，Agent 循环执行：**看页面 → 想下一步 → 点/填/滚/提取 → 再观察**，直到任务完成或达到步数上限。

和 [[playwright]] 手写脚本的区别：Playwright 像你把每一步都录成宏；browser-use 像你把 KPI 交给 agent，它自己规划路径。项目地址：[browser-use/browser-use](https://github.com/browser-use/browser-use)，GitHub 约 9.6 万 Stars（2026 年中），MIT 开源，另有 [Browser Use Cloud](https://cloud.browser-use.com) 托管浏览器与反检测能力。

---

## 解决什么问题

### 痛点 1：网页自动化脚本 brittle（一改版就挂）

传统 [[selenium]] / Playwright 脚本绑死 CSS selector、DOM 结构。产品改个 class 名，CI 全红。browser-use 让 LLM 根据**当前页面的语义描述**（按钮文字、输入框 placeholder、可见元素索引）决策，对小幅 UI 变动更耐受——不是魔法，但少写大量维护 selector 的代码。

### 痛点 2：任务描述是自然语言，不是状态机

「帮我在这个 SaaS 后台导出上月报表并上传到 Drive」涉及多步、分支、异常（登录过期、二次验证）。手写状态机成本高。browser-use 把**任务规划**交给 LLM：每步从内置 action 集合里选 `click`、`input`、`scroll`、`extract` 等，形成隐式 plan。

### 痛点 3：需要「AI 能用的浏览器」，而不只是「人能用的浏览器」

纯截图 + 像素点击（Computer Use 路线）通用但贵、慢、易点偏。browser-use 主路线是 **DOM 索引 + 可选 Vision**：把页面压缩成带编号的可交互元素清单喂给模型，token 更省、动作更准；复杂布局再开 `use_vision=True` 补截图理解。

### 痛点 4：从原型到生产缺一层基础设施

开源库负责 Agent 循环；Cloud 提供 stealth 浏览器、住宅代理、CAPTCHA、会话持久化（cookies/profile）。同一套 `Agent` API 可本地 Chromium，也可接远程 CDP / 云端沙箱。

---

## 核心概念

browser-use 文档把架构拆成三块：**Agent**、**Browser**、**Tools**。理解这三者，就理解「AI 怎么控浏览器」。

### 1. Agent —  orchestrator（编排者）

`Agent` 是入口类：持有 `task`（自然语言目标）、`llm`（决策模型）、`browser`（浏览器会话）、`tools`（可调用动作注册表）。

执行 `await agent.run(max_steps=100)` 时进入**步进循环**（官方称 step）：

1. **Observe**：Browser 通过 CDP 抓取 DOM、可选截图，序列化成 LLM 可读状态
2. **Plan / Act**：LLM 输出结构化动作（一次可多个，`max_actions_per_step` 控制上限）
3. **Execute**：Tools 层调用 `click`、`navigate`、`input` 等
4. **Evaluate**：检查是否达成 task、是否失败需重试（`max_failures`）
5. 未结束则回到 1，直到 `done` 或步数用尽

这就是 **task planning**：不是事先写死计划，而是 **ReAct 式** 每步重新规划。可选 `use_thinking=True` 让模型显式写出推理；`flash_mode=True` 跳过部分评估以换速度（适合简单重复任务）。

```python
# Agent 生命周期里的关键 API（概念示意）
history = await agent.run(max_steps=50)

if history.is_done():
    print(history.final_result())      # 最终文本结果
    print(history.urls())              # 访问过的 URL
    print(history.action_names())      # 执行过的动作名

await agent.add_new_task("把结果保存到 notes.txt")  # 同会话追加任务
await agent.stop()   # 优雅停止
await agent.kill()   # 强制清理
```

### 2. Action / Tools —  agent 的「手」

**Action** 是 agent 能调用的原子操作。框架内置一整套（导航、点击、输入、滚动、标签页、文件上传、`extract` 用 LLM 抽结构化数据等），注册在默认 `Tools` 里。

你可以用装饰器扩展 **自定义 action**，例如调内部 API、读 2FA、问人类：

```python
from browser_use import Agent, Tools, ActionResult, BrowserSession

tools = Tools()

@tools.action("Ask human for help with a question")
async def ask_human(question: str, browser_session: BrowserSession) -> ActionResult:
    # 参数名必须是 browser_session，类型 BrowserSession —— 框架按名注入
    answer = input(f"{question} > ")
    return ActionResult(extracted_content=f"The human responded with: {answer}")

agent = Agent(task="遇到验证码时向人类求助", llm=llm, tools=tools)
```

自定义 action 与内置 action 对 LLM 来说都在**同一张工具菜单**里；Pydantic 模型定义参数 schema，减少胡编字段。

**initial_actions** 是特例：在 LLM 介入**之前**确定性执行的动作列表（例如先 `navigate` 到登录页、注入 cookie），格式 `[{"navigate": {"url": "https://..."}}]`，不消耗 LLM 步数做「已知路径」。

### 3. Task Planning —  从一句话到多步执行

| 层次 | 谁负责 | 例子 |
|------|--------|------|
| 任务（Task） | 你 | `"在 HN 找 AI 相关热度最高的帖子"` |
| 计划（Plan） | LLM 每步更新 | 「先 navigate → 搜索 → scroll → click 第 3 条 → extract」 |
| 动作（Action） | Tools 执行 | `click(index=7)`, `input(text="AI", index=2)` |
| 状态（State） | Browser | 当前 URL、DOM 索引表、标签页、下载文件 |

规划质量取决于：**task 是否具体**、**LLM 能力**、**max_steps / max_failures**、**是否开 vision**。生产上常配合 `output_model_schema`（Pydantic 模型）约束最终输出为 JSON，便于下游 pipeline 消费。

### 4. Browser —  CDP 上的自动化层

`Browser`（别名 `BrowserSession`）管理 Chromium 生命周期：本地 headless/有头、连接已有 CDP URL、或使用 Cloud 远程浏览器。底层走 **Chrome DevTools Protocol**，不是 Selenium WebDriver；同时提供 **Actor API**，语义接近 Playwright 的 `page.click()`，供确定性脚本与 agent 混用。

---

## 安装与最小示例

**环境**：Python 3.11+ 推荐，需要 LLM API Key（或 Browser Use 的 `ChatBrowserUse` + `BROWSER_USE_API_KEY`）。

```bash
pip install browser-use
# 本地 Chromium（若不用 Cloud 远程浏览器）
playwright install chromium
```

```python
# 示例 1：最小 Agent —— 自然语言任务 + 默认工具集
import asyncio
from dotenv import load_dotenv
from browser_use import Agent, ChatBrowserUse

load_dotenv()

async def main():
    agent = Agent(
        task="打开 Hacker News，找到首页第一条帖子的标题和链接",
        llm=ChatBrowserUse(),  # 官方推荐：针对浏览器任务优化的模型
    )
    history = await agent.run(max_steps=30)
    print("完成:", history.is_successful())
    print("结果:", history.final_result())

if __name__ == "__main__":
    asyncio.run(main())
```

运行时可设 `Browser(headless=False)` 看着 agent 操作，调试体验远好于纯无头。

---

## 示例 2：Browser 配置 + 初始动作 + 自定义工具

```python
import asyncio
from browser_use import Agent, Browser, ChatBrowserUse, Tools, ActionResult, BrowserSession

tools = Tools()

@tools.action("Save text snippet to local file")
async def save_snippet(content: str, filename: str, browser_session: BrowserSession) -> ActionResult:
    path = f"/tmp/{filename}"
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    return ActionResult(extracted_content=f"Saved to {path}")

async def main():
    browser = Browser(
        headless=False,
        window_size={"width": 1280, "height": 720},
        minimum_wait_page_load_time=1.0,
    )

    agent = Agent(
        task="在已打开的页面上找到关于 LLM 的教程，提取标题和摘要，调用 save_snippet 存成 summary.txt",
        llm=ChatBrowserUse(),
        browser=browser,
        tools=tools,
        use_vision=True,           # 布局复杂时结合截图
        max_actions_per_step=5,    # 一步内可连续填多个表单字段
        initial_actions=[
            {"navigate": {"url": "https://news.ycombinator.com"}},
        ],
    )

    history = await agent.run(max_steps=40)
    for step in history.model_thoughts():
        print(step)  # 可选：查看每步推理

if __name__ == "__main__":
    asyncio.run(main())
```

要点：`initial_actions` 负责「开场确定性导航」；`tools` 把文件 IO 等 LLM 不擅长的活交给 Python；`use_vision` 在 DOM 索引不够时补视觉理解。

---

## 示例 3：结构化输出（对接下游系统）

```python
from pydantic import BaseModel
from browser_use import Agent, ChatBrowserUse

class JobPosting(BaseModel):
    title: str
    company: str
    salary_range: str | None = None
    url: str

class JobList(BaseModel):
    jobs: list[JobPosting]

async def scrape_jobs():
    agent = Agent(
        task="搜索 remote Python developer 岗位，收集前 3 条有效招聘信息的标题、公司、薪资（若有）、链接",
        llm=ChatBrowserUse(),
        output_model_schema=JobList,
    )
    history = await agent.run(max_steps=50)
    if history.is_successful():
        # final_result 经 Pydantic 校验
        data = JobList.model_validate_json(history.final_result())
        for job in data.jobs:
            print(job.title, job.company)
```

这比解析自由文本稳定，适合 ETL、RPA 入库。

---

## 与 Playwright / Selenium 对比

| 维度 | Playwright | Selenium | browser-use |
|------|------------|----------|-------------|
| **控制方式** | 你写代码逐步操作 | 你写代码逐步操作 | 你写**任务**，LLM 逐步决策 |
| **选择器** | 手写 locator，精确可控 | 手写 locator，生态老 | DOM 索引 + 语义，少维护 selector |
| **协议** | CDP / 自有驱动 | WebDriver（W3C） | 主要 CDP；Cloud 可接 Playwright/Puppeteer/Selenium 远程 |
| **规划** | 无（除非自己接 LLM） | 无 | 内置 task planning 循环 |
| **成本** | 仅机器时间 | 仅机器时间 | 机器 + **每步 LLM token** |
| **确定性** | 高，可重复 | 中高 | 中，需 max_steps、schema、initial_actions 约束 |
| **适用** | E2E 测试、已知流程 RPA | 遗留 WebDriver 栈 | 探索性抓取、多变 UI、agent 产品原型 |

**关系不是替代，是分层**：

- **Selenium**：最老牌，WebDriver 抽象；慢、 flaky 相对多，但在 Java/遗留 CI 里仍常见。browser-use **不依赖** Selenium WebDriver；Cloud 文档提到可通过 CDP 让 Selenium 连到 stealth 浏览器，那是托管层能力，不是开源 agent 默认路径。
- **Playwright**：现代 E2E 首选，API 干净、自动等待。browser-use 与它**互补**：Actor API 提供 Playwright 风格操作；agent 层负责「看懂页面并决定点哪」。固定回归测试仍应 Playwright；「帮我订一张最便宜的机票」类任务更适合 browser-use。
- **browser-use**：在浏览器之上加 **LLM + Tools + 步进循环**，把「脚本作者」换成「任务描述者」。代价是 latency 和 token 账单；收益是开发速度和 UI 变更容忍度。

一句话：**Playwright/Selenium 是方向盘；browser-use 是告诉司机「去机场」**。

---

## 内置 Action 速览（Tools 默认菜单）

官方内置动作按类划分，LLM 从中挑选组合成 plan：

- **导航**：`search`（DuckDuckGo/Google/Bing）、`navigate`、`go_back`、`wait`
- **交互**：`click`、`input`、`upload_file`、`scroll`、`find_text`、`send_keys`
- **内容**：`extract`（LLM 辅助结构化抽取）
- **标签页 / JS**：多 tab 管理、`evaluate` 执行脚本
- **完成**：任务结束标记与结果汇总

完整列表见 [Tools 文档](https://docs.browser-use.com/customize/tools/basics)。

---

## 配置旋钮（生产必看）

| 参数 | 作用 |
|------|------|
| `max_steps` | 总步数上限，默认偏大；生产建议 30–50 先试 |
| `max_failures` | 单步失败重试次数 |
| `max_actions_per_step` | 一步内连续动作数（填表场景可加大） |
| `use_vision` | `True` / `False` / `"auto"` — token vs 准确度 |
| `flash_mode` | 跳过部分推理，快但只适合简单任务 |
| `sensitive_data` | 占位符注入密码，避免进 prompt 明文 |
| `page_extraction_llm` | 单独用小模型做 extract，省主 LLM 成本 |

Cloud 侧另有 profile（持久登录）、代理、stealth、MCP Server（给 Cursor/Claude 接浏览器工具）。

---

## 适用 vs 不适用

**适用**：

- 快速验证「AI 能否帮用户完成这个网页流程」
- 结构多变的数据采集、竞品监控、内部运营自动化
- 需要 **human-in-the-loop**（自定义 `ask_human` action）
- 与 [[mcp-ts-sdk]] / OpenClaw 等 agent 栈集成（官方有 MCP 与集成教程）

**不适用**：

- 毫秒级高频、步步确定的 CI E2E → 用 [[playwright]]
- Canvas / 重度 WebGL UI（DOM 索引为空）→ 需 vision 或换 Computer Use 路线
- 零 LLM 预算、完全离线 → 传统 RPA
- 强合规审计要求逐步可追溯且**无 LLM 随机性** → 手写脚本 + 快照更合适

---

## 踩坑备忘

1. **自定义 tool 参数必须叫 `browser_session`**，类型 `BrowserSession`，否则注入失败且难排查。
2. **task 越模糊，plan 越飘**——写清输出格式、站点、语言、步数预期。
3. **token 账单**：复杂站点 + vision + 高 max_steps 单次可至美元级；先用小步数试跑。
4. **本地 vs Cloud**：反 bot、登录态、IP 地域问题在本地 Chromium 上很常见，生产常迁 Cloud stealth + profile。
5. **DOM 索引路线**在 Shadow DOM、跨 iframe 极深场景仍可能漏元素；开 vision 或 `initial_actions` 缩小范围。

---

## 延伸阅读

- [Browser Use 开源文档](https://docs.browser-use.com/) — Agent / Browser / Tools 完整参数
- [llms.txt 索引](https://docs.browser-use.com/llms.txt) — 给 AI 读的全站目录
- [Browser Use Cloud Quickstart](https://docs.browser-use.com/cloud/quickstart) — 托管浏览器与 API v3
- [Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/) — 底层协议
- [[stagehand]] — TypeScript 侧「Playwright + LLM」同类方案
- [[playwright]] — 确定性浏览器自动化基座
- [[midscene]] — 偏视觉 + 自然语言的中文社区方案

---

## 关联

- [[playwright]] — browser-use 执行层与 Actor API 的精神兄弟；测试仍选 Playwright
- [[selenium]] — WebDriver 老栈；与 browser-use 的 CDP 主路径不同
- [[stagehand]] — TS 生态的 LLM 浏览器自动化
- [[steel-browser]] — 远程 Chromium，常与本类 agent 搭配
- [[nanobrowser]] — Chrome 扩展形态的 agent，部署模型不同
- [[mcp-ts-sdk]] — browser-use Cloud 提供 MCP，可接入 Cursor 等
- [[vercel-ai]] — 另一条 LLM 应用抽象（偏 TS 对话，非浏览器专用）

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[mcp-ts-sdk]] —— MCP TS SDK — Model Context Protocol TypeScript 实现
- [[midscene]] —— midscene — 用自然语言代替 selector 的浏览器自动化框架
- [[nanobrowser]] —— nanobrowser — 把 Chrome 扩展本身当成 AI agent 的运行沙箱
- [[patchright]] —— patchright — 给 Playwright 打 patch 让浏览器自动化在反 bot 站点继续工作
- [[playwright]] —— Playwright — 跨浏览器自动化测试
- [[stagehand]] —— stagehand — Playwright 加 LLM 的混血框架
- [[steel-browser]] —— Steel Browser — 把 Chromium 包成 LLM agent 用的远端服务
- [[vercel-ai]] —— Vercel AI SDK — 多 LLM Provider 统一 SDK

