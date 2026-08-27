---
title: browser-use — 让 LLM 用「DOM 索引清单」操作浏览器的 Python agent 框架
来源: https://github.com/browser-use/browser-use
日期: 2026-05-29
分类: AI agent infra
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/browser-use/browser-use
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: eb4126921bea3373f91afc49fb4b59d6eda7fed6
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 0.13.8
---

## 是什么

browser-use 是一个 **Python agent 库**：你给一句任务，它打开浏览器、把当前页压成带编号的 DOM 清单、问 LLM 下一步、再通过 Chrome DevTools Protocol 执行动作。日常类比：你雇了一个不看整页 HTML 的助理，先把可见控件翻译成菜单（“1 号是搜索框、2 号是登录按钮”），他只报“点 2 号”，框架替他点。

你写：

```python
from browser_use import Agent, ChatBrowserUse

agent = Agent(
    task="打开 Hacker News 并取出首页前 3 条标题",
    llm=ChatBrowserUse(),
)
history = await agent.run(max_steps=20)
```

未传 `llm` 时，固定 0.13.8 会构造 `ChatBrowserUse()`。`Controller` 只是 `Tools` 的别名。浏览器会话走 `BrowserSession` 的事件总线和 `cdp-use` 客户端，不是把 Playwright Page 当成默认驱动。

## 为什么重要

不理解这套合同，下面这些事会按旧印象写错：

- 为什么默认动作是“点编号”而不是“点像素”，但部分模型名又会打开坐标点击
- 为什么旧教程把 Playwright 写成执行后端，固定 0.13.8 的主链却是 CDP + 事件总线
- 为什么每一步都会抓截图，却不能把“有截图”理解成“一定把图喂给 LLM”
- 为什么 `max_steps=500` 仍在 `run()` 默认值里，生产任务却必须自己收紧

## 核心要点

固定 0.13.8 的一步可以拆成四段：

1. **准备上下文**：`step()` 先等 captcha watchdog（失败不致命），再 `_prepare_context()`。`get_browser_state_summary(include_screenshot=True)` 每步都抓图；`use_vision=False` 只影响是否把图放进模型消息。

2. **问模型**：`_get_next_action()` 用当前 message manager 调 LLM，超时取 `llm_timeout`（未显式传入时按模型名给 30/75/90 秒）。输出被裁到 `max_actions_per_step`（默认 5）。

3. **执行动作**：`_execute_actions()` → `multi_act()`。工具由 `Tools`/`Registry` 注册，Pydantic `param_model` 变成 tool schema；`browser_session`、`cdp_client`、`file_system` 等是注入的 special params。

4. **收尾**：`_post_process()` 更新下载、计划、循环检测和连续失败计数。`done` 结束任务；`run()` 默认最多 500 步，最后一步会把工具菜单收成只剩 `done`。

DOM 序列化给交互节点分配从 1 开始的 `selector_index`，文本形如 `[2]<button type=submit />`；新出现的节点加 `*`。iframe 里视口外的控件只留 hint，例如 `... (3 more elements below - scroll to reveal)`。

## 实践示例

### 案例 1：用默认 ChatBrowserUse 跑一步任务

```python
import asyncio
from browser_use import Agent, ChatBrowserUse

async def main():
    agent = Agent(
        task="打开 example.com 并读出页面标题",
        llm=ChatBrowserUse(),
    )
    await agent.run(max_steps=20)

asyncio.run(main())
```

这只是 API 形状。固定源码要求 Python `>=3.11,<4.0`；真正启动浏览器还依赖本机 Chromium / 远程 CDP / cloud profile。本文未安装、未启动、未调用任何模型。

### 案例 2：LLM 看到的不是原始 HTML

序列化器写出的是编号清单，而不是整页 markup：

```text
[1]<input placeholder="Search" />
*[2]<button type="submit" />
[3]<a href="/news">News
... (2 more elements below - scroll to reveal):
    <a> "Older" ~2 pages down
```

编号由本步 `selector_map` 分配，给 `click(index=2)` 用。`*` 表示相对上一步缓存是新节点。视口外元素只给滚动 hint，不保证模型滚对距离。

### 案例 3：自定义动作挂到 Tools，而不是重写 Agent

```python
from pydantic import BaseModel
from browser_use import Agent, ChatBrowserUse, Tools
from browser_use.agent.views import ActionResult

tools = Tools()

class NoteParams(BaseModel):
    text: str

@tools.action("Record a short operator note", param_model=NoteParams)
async def record_note(params: NoteParams):
    return ActionResult(extracted_content=params.text, long_term_memory=params.text)

agent = Agent(
    task="先记下当前目标，再打开文档首页",
    llm=ChatBrowserUse(),
    tools=tools,
)
```

`Tools.action` 转给 `Registry.action`。函数禁止 `**kwargs`；需要默认值时必须提供专用 `param_model`。`controller=` 仍可用，只是别名。

## 踩过的坑

1. **把 Playwright 当 0.13.8 默认后端**：`BrowserSession` 文档仍提到“CDP/Playwright 直调”作为底层可能，但本 revision 的启动与动作主链是 `bubus` 事件 + `cdp-use`。旧页的 Playwright 安装步骤不能当当前合同。

2. **以为 click 永远是编号**：默认 `ClickElementActionIndexOnly` 只收 `index`。模型名匹配 `claude-sonnet-4` / `claude-opus-4` / `claude-fable-5` / `gemini-3-pro` / `browser-use/` 时，`set_coordinate_clicking(True)` 才允许 `coordinate_x/y`，并且文档写明“只在没有 index 时用坐标”。

3. **把每步截图当成 vision 合同**：准备阶段无条件 `include_screenshot=True`；`use_vision` 默认 `True`，但设成 `False` 仍会抓图（注释写给 cloud sync）。`use_vision != 'auto'` 还会排除 `screenshot` 工具。

4. **把 `max_steps=500` 当推荐值**：这是 `run()` 默认上限，不是典型任务长度。撞上限时模型被强制只剩 `done`。连续失败默认 `max_failures=5`。

5. **忽略 DomService 的连接 TODO**：源码仍写“目前可能每步新开 websocket，应该改成持久连接”。本文没有测延迟，不能把它写成固定的 50–200ms。

## 适用 vs 不适用场景

**适用**：

- 标准 HTML 站点上的填表、抽取、多步导航
- 需要换 LLM provider：固定包导出 OpenAI / Anthropic / Google / Groq / Azure / Ollama 等 chat 封装，以及 `ChatBrowserUse`
- 要把 Python 函数注册成工具，并用 Pydantic 约束参数

**不适用**：

- 控件不在 DOM 里的 Canvas / WebGL 页面——编号清单会空；坐标点击只是部分模型的补丁，不是通用视觉 agent
- 已经有稳定 selector、不需要 LLM 决策的脚本——直接浏览器自动化更便宜
- 把 README 的 Cloud / Odysseys 数字当成本文结论——那些图和排行榜未在本 revision 复现
- 不能接受 Python 3.11+、CDP 或 `browser-harness==0.1.9` 这条依赖链

## 固定版本边界

- 本文绑定 `browser-use/browser-use@eb412692...`，GitHub tag 与 PyPI 均为 `0.13.8`。
- `pyproject.toml` 钉住 `cdp-use==1.4.5`、`browser-harness==0.1.9`、`pydantic==2.12.5`；`browser-use-core==0.13.3` 在 `core` extra。
- 审查时 `main` 已走到后续依赖 bump（`28670f72...`）；升级前需重新绑定 revision。
- 本文未安装依赖、启动浏览器、调用 LLM 或跑上游测试，状态保持 `UNVERIFIED`。

## 学到什么

1. **给 LLM 的不是页面，是菜单**——编号 DOM 把“选控件”变成 tool call，而不是让模型写 selector 或像素。
2. **截图存在 ≠ 视觉模式开启**——采集、上传和是否进入 prompt 是三条开关。
3. **别名会掩盖重命名**——`Controller`/`Browser` 仍能 import，源码真相是 `Tools` / `BrowserSession`。
4. **默认上限不是安全策略**——500 步、5 个动作/步、模型相关 timeout 都要按任务重写。

## 应用型自测

1. 调用 `await agent.run()` 且不传 `max_steps`，默认最多走多少步？
2. `Agent(task="...", llm=None)` 在固定 0.13.8 会用哪个默认模型封装？
3. 未打开坐标点击时，`click(coordinate_x=10, coordinate_y=20)` 是不是合法默认 schema？

检查点：

1. 500。`Agent.run` 的默认参数是 `max_steps: int = 500`。
2. `ChatBrowserUse()`。`llm is None` 且没有 `CONFIG.DEFAULT_LLM` 时走这条。
3. 不是。默认注册 `ClickElementActionIndexOnly`，必须给 `index`。

## 延伸阅读

- 文档：[docs.browser-use.com](https://docs.browser-use.com/)（安装、cloud、模型列表）
- 固定源码：[browser-use/browser-use](https://github.com/browser-use/browser-use) —— 本文绑定提交 `eb4126921bea3373f91afc49fb4b59d6eda7fed6`
- [[stagehand]] —— TypeScript 侧“浏览器 + LLM”的另一条实现
- [[midscene]] —— 更偏视觉/自然语言的浏览器自动化
- [Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/) —— 本 revision 实际驱动层

## 关联

- [[stagehand]] —— 同类“LLM 操作浏览器”，绑定的是另一套 Page API
- [[midscene]] —— 视觉/自然语言路线，可对照 DOM 索引路线
- [[nanobrowser]] —— Chrome 扩展形态的 agent 沙箱
- [[steel-browser]] —— 远端浏览器托管，给 agent 当执行环境
- [[vercel-ai]] —— 另一套 LLM provider 抽象（TS）

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[midscene]] —— midscene — 用自然语言代替 selector 的浏览器自动化框架
- [[nanobrowser]] —— nanobrowser — 把 Chrome 扩展本身当成 AI agent 的运行沙箱
- [[patchright]] —— patchright — 给 Playwright 打 patch 让浏览器自动化在反 bot 站点继续工作
- [[stagehand]] —— stagehand — Playwright 加 LLM 的混血框架
- [[steel-browser]] —— Steel Browser — 把 Chromium 包成 LLM agent 用的远端服务
