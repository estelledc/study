---
title: browser-use — 让 LLM 用「DOM 索引清单」操作浏览器的 Python agent 框架
来源: https://github.com/browser-use/browser-use
日期: 2026-05-29
分类: AI agent infra
难度: 中级
---

## 是什么

browser-use 是一个 **Python 框架**，让大语言模型（LLM）像人一样操作浏览器——点按钮、填表单、抓数据。日常类比：你雇了一个不会读屏幕的助理，所以你先把网页翻译成一份编号清单（"1 号是搜索框、2 号是登录按钮、3 号是商品图..."），他报"点 2 号"，你替他点。

你写：

```python
from browser_use import Agent, ChatBrowserUse
agent = Agent(task="搜 NeurIPS 2024 前 5 篇论文标题", llm=ChatBrowserUse())
await agent.run()
```

agent 自动开浏览器、抽 DOM、喂 LLM、执行动作，循环直到 LLM 说"完成"。截至 2026-05-26，96k stars / 10.7k forks / MIT，主打"让网页对 AI 可访问"。

## 为什么重要

不理解 browser-use 的设计选择，下面这些事都没法解释：

- 为什么 Anthropic Computer Use（让 LLM 看截图点像素）和 browser-use（让 LLM 看 DOM 选编号）是两种完全不同的 agent 路线
- 为什么"把 HTML 喂给 LLM"听起来简单，真做起来要压缩 95% 才装得进上下文
- 为什么 LLM agent 项目都长得像（main loop + tool registry + provider 抽象），背后是同一套 reactor pattern
- 为什么 2024-2026 浏览器自动化的明星不是 Playwright 升级版，而是套在 Playwright 之上的"翻译层"

## 核心要点

browser-use 的设计可以拆成 **三条**：

1. **DOM 索引而非像素**：不让 LLM 输出 `(x=456, y=312)`，而是输出"点 2 号元素"。类比：跟服务员点菜不报"右下角第三盘"，而是说"3 号套餐"。网页改版 selector 还在、像素全错——容错率差一个数量级。

2. **每步压缩成清单 + tool 调用**：DOM service 把整页几十万 token 压缩到 5k token 的 indexed 列表（`[1] <input> [2] <button> ...`），喂给 LLM；LLM 用 Pydantic 校验过的 tool call 选动作。类比：把整本字典缩成单页菜单，让人选条目而不是默写。

3. **三阶段 step 循环**：每步 `prepare`（抓 DOM）→ `get_action`（问 LLM）→ `execute`（调 Playwright）→ `post`，直到 LLM 返回 `done` 或撞 500 步上限。类比：洗碗洗一只→冲一只→晾一只→洗下一只，不堆批量。

三条加起来叫 **「视觉简化器 + 动作分发器」**——不发明智能 planner，靠"压缩输入 + 受控输出"让 LLM 表现稳定。

## 实践案例

### 案例 1：5 分钟跑通

```bash
pip install browser-use
playwright install chromium
export ANTHROPIC_API_KEY=...
```

```python
from browser_use import Agent, ChatBrowserUse
import asyncio

agent = Agent(
    task="去 hackernews 取首页前 3 条标题",
    llm=ChatBrowserUse(),
)
asyncio.run(agent.run(max_steps=20))
```

运行时会弹一个 Chromium 窗口，**你能亲眼看 LLM 一步步在页面上点**——比无头模式直观 10 倍，是 debug 好属性。

### 案例 2：DOM 序列化长这样

agent 喂给 LLM 的不是原始 HTML，而是简化清单：

```
[1] <input placeholder="Search">
[2] <button>Search</button>
[3] <a href="/news">News</a>
...
[hidden] 12 elements below viewport, scroll 2 pages
```

**逐部分解释**：

- 编号 `[1] [2] ...` 是框架重新分配的，对 LLM 稳定（即使 DOM 顺序变化也保留映射）
- 标签后是 role / placeholder / 可见文本——足够 LLM 选目标
- viewport 外的元素只给"个数 + 滚动距离"hint，省 token
- 整页几十万 token → 5k token，**压缩比 95%+**

### 案例 3：注册自定义动作

```python
from browser_use import Controller
from pydantic import BaseModel

controller = Controller()

class HighlightParams(BaseModel):
    index: int

@controller.action("Highlight an element by index", param_model=HighlightParams)
async def highlight(params: HighlightParams, browser_session):
    js = f"document.querySelectorAll('*')[{params.index}].style.outline='3px solid red'"
    await browser_session.execute_script(js)
```

一次注册之后，LLM 工具菜单里就有 `highlight(index=int)`，自动学会调用。**Pydantic 模型 = LLM tool schema**——这是整个项目最巧的复用。

## 踩过的坑

1. **DOM 路线在 Canvas / WebGL 站点失效**：Figma / Excalidraw 的"按钮"不是 DOM 元素，索引为空，LLM 看不见。fallback 到 vision 模式（传截图）只是补丁。
2. **每步重建 CDP 连接**：源码里有 TODO 写明每步握手 50-200ms，500 步累计 30-100s 纯握手开销。性能敏感场景要打 patch。
3. **`max_steps=500` 默认偏大**：典型任务 20 步内完成，500 是为应对极端 case。失控时一次任务能烧 2.5M token（约 $7-15 一次）。生产用建议收紧到 30-50。
4. **scroll hint 不保证 LLM 走对距离**：「下方还有 12 个隐藏元素 / scroll 2 pages」LLM 经常多滚一次或少滚一次。token 经济和控制精度永远在打架。

## 适用 vs 不适用场景

**适用**：

- 让 LLM 抓网页数据 / 填表 / 做电商比价
- 标准 HTML 网站（电商 / 新闻 / SaaS dashboard）
- LLM provider 要可换——原生支持 Anthropic / OpenAI / Gemini / Ollama 本地模型
- 调试需求大——"看 LLM 在页面上点哪里"对 production agent 是刚需

**不适用**：

- Canvas / WebGL / 复杂 React Server Component（Figma / Excalidraw / 游戏化 UI）
- 已知 selector + 不需要 LLM 决策——直接 [[playwright]] 更省成本
- desktop app / OS 层任务——用 Anthropic Computer Use
- 高频 agent（每秒一步以上）——CDP 重连开销吃不消

## 历史小故事（可跳过）

- **2024 年初**：Magnus Müller 在 ETH Zurich 黑客松上写第一版，目标是"让 GPT 自动填学校选课表"。
- **2024 年底**：开源后两个月窜到 30k stars，成为 LLM agent infra 标杆。
- **2025 年**：进入 Y Combinator W25 batch，公司化，主打 cloud sandbox + 1000+ 集成。
- **2026 年 5 月**：v0.12.9，96k stars，加入 vision 模式（双轨：DOM + 截图），承认单 DOM 路线在某些站点不够。

→ 知道这个时间线才理解 browser-use 不是研究院产品，是"黑客松到 YC 公司"的快速迭代产物——基因决定它代码风格务实大于优雅。

## 学到什么

- **DOM 索引 vs 像素坐标**是 LLM 浏览器自动化的两条主路线，前者更精、后者更通用
- **Pydantic Union schema + tool calling** 是把任意 Python 函数喂给 LLM 的通用模板，任何 agent 项目都能抄
- **三阶段 step（prepare / action / execute / post）** 是 reactor pattern 在 agent 上的标准翻译
- **token 经济 vs 控制精度**永远在打架——viewport_threshold / max_actions_per_step / max_steps 都是这场博弈的旋钮

## 延伸阅读

- [browser-use 官方文档](https://docs.browser-use.com/) —— 安装、参数、cloud 入门
- [Pydantic 文档](https://docs.pydantic.dev/) —— Union 类型 + tool schema 生成的底层依赖
- [Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/) —— 底层操作浏览器的协议
- [Anthropic Computer Use 介绍](https://www.anthropic.com/news/3-5-models-and-computer-use) —— 哲学不同的对手路线
- [[playwright]] —— 执行后端的零基础解读
- [[stagehand]] —— 同流派 TS 实现

## 关联

- [[playwright]] —— 浏览器自动化 SDK，browser-use 在它之上加 LLM agent 层
- [[stagehand]] —— TS 版同类框架，思路相似但绑定 Playwright Page API
- [[midscene]] —— 中文社区类似产品，更偏视觉路线（截图 + LLM）
- [[nanobrowser]] —— Chrome 扩展形态的 LLM agent，部署模式不同
- [[steel-browser]] —— 给 LLM agent 用的远程浏览器云
- [[mcp-ts-sdk]] —— browser-use 也通过 MCP 协议把自己暴露给其他 agent
- [[vercel-ai]] —— LLM provider 抽象的另一个流派（TS 生态）

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[midscene]] —— midscene — 用自然语言代替 selector 的浏览器自动化框架
- [[nanobrowser]] —— nanobrowser — 把 Chrome 扩展本身当成 AI agent 的运行沙箱
- [[patchright]] —— patchright — 给 Playwright 打 patch 让浏览器自动化在反 bot 站点继续工作
- [[stagehand]] —— stagehand — Playwright 加 LLM 的混血框架
- [[steel-browser]] —— Steel Browser — 把 Chromium 包成 LLM agent 用的远端服务
