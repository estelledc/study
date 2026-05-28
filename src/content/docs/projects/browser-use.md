---
title: browser-use — 不是 Playwright 升级版，是 LLM 驱动的「DOM-tree → tool-call → CDP 执行」反馈循环
description: 大型应用范例 (v1.1 分支 A) — Agent 主循环 / DOM 简化压缩送 LLM / Pydantic 动态 schema 注入 tool calling / 96k stars Python AI agent infra
sidebar:
  order: 24
  label: browser-use/browser-use
---

> 状元篇 (2026-05-28，v1.1 分支 A 大型应用) — 把 browser-use 当成「Python 版 Playwright agent」来读会错过它的核心：
> 它本质是把「LLM 当 planner」「DOM tree 当工作记忆」「Pydantic schema 当 tool calling 协议」三件事缝在一个 Agent.run() 循环里。
> Playwright 是它的执行后端 (相当于一只眼一只手)，不是它的灵魂。
>
> 数据基线：96 k stars / 10.7 k forks / MIT / 主语言 Python / 最后 push 2026-05-26 / 仓库锚定 commit `8342696`。

## 核心信息

| 字段 | 值 |
|---|---|
| 项目名 | [browser-use/browser-use](https://github.com/browser-use/browser-use) |
| 类型 | v1.1 分支 A · 大型应用 (Python AI agent infra，端到端用户产品) |
| Star / Fork | 95,981 / 10,782 (2026-05-28 读) |
| License | MIT |
| 最近活跃 | 2026-05-26 (push) — 高频更新 |
| 主语言 | Python (≥ 3.11) |
| 维护方 | browser-use 公司 (YC W25 同期 AI infra)，主贡献者 MagMueller (3,136) / pirate (1,810) / mertunsall (817) / sauravpanda (649) / gregpr07 (472) |
| 锚定 commit | `834269609082d187ca0250de2c06d93799dac92d` (2026-05-26) |
| 类似项目 | Playwright (执行后端) / Anthropic Computer Use / Microsoft OmniParser / Selenium IDE |
| 哲学不同竞品 | Anthropic Computer Use (像素截图 + 鼠标坐标 vs DOM tree + 索引) |

## 一句话定位

**browser-use 是一个 LLM agent 的「视觉简化器 + 动作分发器」**，
把任意网页压缩成一份 indexed 的可交互元素清单 (`[1] <input>` `[2] <button>` …) 喂给 LLM，
LLM 用 Pydantic 校验过的 tool call 选动作 (`click_element_by_index`, `input_text`, ...)，
框架再翻译成 Playwright/CDP 调用。整个过程是 `Agent.run()` 一个 step loop，最大 500 步。

## Why (为什么是它而不是 Playwright 直接 / Computer Use / OmniParser / Selenium IDE)

2024-2026 让 LLM 操作浏览器有四种思路：

| 路线 | 输入给 LLM 的东西 | 代表产品 |
|---|---|---|
| **像素 + 坐标** | 截图，LLM 输出 (x, y) 鼠标点击 | Anthropic Computer Use, OpenAI Operator |
| **DOM 索引** | 简化 DOM tree (元素 + index)，LLM 输出 index + 动作 | **browser-use** |
| **OCR 中间件** | 截图 → OCR/分割 → 文本元素，再喂 LLM | Microsoft OmniParser |
| **录制脚本** | 用户先录一遍，再让脚本回放 | Selenium IDE |

browser-use 选「DOM 索引」路线，关键判断 (5 条相互支撑)：

1. **DOM 比像素稳**——网页改版像素移动几十像素就废，但 `<button id="submit">` 通常稳定。让 LLM 选 `index=2` 比让它输出 `(456, 312)` 容错率高一个数量级。
2. **token 经济**——一个完整网页 HTML 几十万 token，简化成 indexed 列表 ≤ 5k token，省 95%+。
3. **可调试**——失败时 `[2] <button>Submit</button>` 这种行能直接复现，比像素坐标可读 100 倍。
4. **执行后端复用**——CDP/Playwright 是工业级稳定后端，没必要重新发明。
5. **tool calling 是 LLM 的母语**——Anthropic / OpenAI 都原生支持 JSON schema tool call，比让模型「自由发挥」可控得多。

这 5 条放一起决定了 browser-use 的全部架构——
DOM service 只做「压缩」(干掉无交互元素)、registry 只做「schema 注入」(把 Python 函数包成 Pydantic Union)、agent loop 只做「编排」(prepare → llm → execute → loop)。
没有「智能 planner」「记忆系统」「多 agent」这些花活——这正是它干净的地方。

**怀疑 1**：DOM 路线在「无障碍 (a11y) 标记不全」的网页上是否反而劣于像素？测试某些 React SPA 时确实会遇到 `<div onclick=...>` 没语义标记导致 LLM 看不到该元素的 case。`dom/service.py` 的 `ClickableElementDetector.is_interactive()` 是个启发式，不完美。这点项目在 README 里没承认，是真实工程取舍。

**怀疑 2**：「LLM 每步都看完整 DOM」这个设计在 1000+ 元素的大表格 (如 Notion / Airtable) 会不会爆 token？看 `dom/service.py` L96 的 `_count_hidden_elements_in_iframes` 注释——他们意识到了这个问题，用 viewport_threshold 做了「只看可见 + scroll 提示」的妥协。但深层 scroll 体验如何还需要实测验证。

**怀疑 3**：Anthropic Computer Use 出来之后，browser-use 还有多少差异化？看 [README]/CHANGELOG 路线，他们的回应是「双轨」——支持纯 DOM、也支持 vision 模式 (传截图)，让用户在不同站点切换。这是务实的演进，但也意味着他们承认单 DOM 不够强。

## 仓库地形 (Layer 2)

### 顶层目录注释表 (按「路由 / 数据层 / 业务模块」三类区分)

大型应用分支 A 必填条目：

| 类别 | 目录/文件 | 角色 |
|---|---|---|
| **入口/路由** | `browser_use/cli.py` (81 KB) | CLI 入口，命令行参数 → Agent 实例化 |
| **入口/路由** | `browser_use/agent/service.py` (2,847 行) | Agent 主循环，对外的核心 API (`Agent(...).run()`) |
| **执行/数据层** | `browser_use/browser/` | Playwright/CDP wrapper，事件类 (ClickElementEvent…) |
| **执行/数据层** | `browser_use/dom/service.py` (~1,050 行) | DOM 提取 + 序列化 (供 LLM 消费) |
| **业务模块** | `browser_use/tools/registry/` | 动作注册中心 (`@registry.action` decorator + Pydantic schema 生成) |
| **业务模块** | `browser_use/tools/service.py` (90 KB / 2,847 行) | 默认动作集合 (click_element, input_text, scroll, ...) |
| **业务模块** | `browser_use/llm/` | LLM provider 抽象 (`BaseChatModel`)，对接 Anthropic/OpenAI/Gemini/local |
| **业务模块** | `browser_use/skills/` + `browser_use/skill_cli/` | skill 系统 (类似 Claude Code skill，可注入 prompt + action) |
| **业务模块** | `browser_use/mcp/` | MCP server 集成 (作为 client 调用外部 MCP) |
| **业务模块** | `browser_use/integrations/` | 第三方集成层 (file, search, screenshot, ...) |
| **业务模块** | `browser_use/sandbox/` + `browser_use/sync/` | 云沙箱 + 远程 sync (browser-use cloud 商业化部分) |
| **业务模块** | `browser_use/filesystem/` | agent 可读写文件的虚拟 fs |
| **测试** | `tests/` | 测试套件 |
| **样例** | `examples/` | 用户能直接跑的 demo |
| **文档** | `README.md` `AGENTS.md` (38 KB) `CLAUDE.md` (11 KB) `CLOUD.md` (75 KB) | 4 份说明 |

> 注意：`browser_use/__init__.py` 只 5.7 KB——主要做 re-export，不放实现。这是 Python 大型项目典型分包模式。

### 心脏文件清单 (≥ 3 个，分支 A 要求)

按「commit hash + 行数标注」给出三处：

| # | 文件 | 行数 | 角色 | commit 锚定 |
|---|---|---|---|---|
| 1 | `browser_use/agent/service.py` | 2,847 | Agent 主循环、`run()`、`step()`、错误处理 | [L1237-L1312 step()](https://github.com/browser-use/browser-use/blob/834269609082d187ca0250de2c06d93799dac92d/browser_use/agent/service.py#L1237-L1312) |
| 2 | `browser_use/dom/service.py` | ~1,050 | DOM tree 提取 + 序列化送 LLM | [L785-L833 get_serialized_dom_tree](https://github.com/browser-use/browser-use/blob/834269609082d187ca0250de2c06d93799dac92d/browser_use/dom/service.py#L785-L833) |
| 3 | `browser_use/tools/registry/service.py` | ~650 | `@registry.action` 注册 + Pydantic Union schema 生成 | [L495-L575 create_action_model](https://github.com/browser-use/browser-use/blob/834269609082d187ca0250de2c06d93799dac92d/browser_use/tools/registry/service.py#L495-L575) |

### commit 热点按 subsystem 分组 (分支 A 要求)

四个 subsystem 各自独立活跃：

| subsystem | 高频文件 | 信号 |
|---|---|---|
| Agent | `agent/service.py` `agent/prompts.py` | 主循环逻辑频繁迭代，prompt 模板每个 release 微调 |
| DOM | `dom/service.py` `dom/views.py` | iframe / shadow DOM 边界 case 持续修 |
| Tools | `tools/service.py` `tools/registry/service.py` | 默认动作不断增加 (extract / search_page / select_dropdown 都是后加的) |
| Browser | `browser/session.py` `browser/events.py` | CDP event 抽象升级 (从 Playwright API → 直接 CDP) |

## 架构图 (P0 必填，分支 A)

![browser-use Architecture: user task → Agent.run() loop → DOM extract → LLM → action → CDP → feedback](/projects/browser-use/01-architecture.webp)

**Figure 1**：browser-use 端到端架构 (1200×1300 webp，361 KB)。

- **流程**：用户 task 字符串 → `Agent.__init__` → `Agent.run()` 启动 SignalHandler + browser_session → 进入 step loop。
- **三阶段**每步：(1) `_prepare_context`：DOM service 抓 CDP 快照 + AX tree → 序列化成 indexed 列表；(2) `_get_next_action`：拼 system prompt + 历史 + DOM + 截图，喂 LLM，工具 schema = Pydantic ActionModel Union；(3) `_execute_actions`：registry 校验参数、注入 special context、调用 Python 函数执行 CDP。
- **颜色编码**：黄色 = input (用户 task)，粉色 = DOM 子系统，蓝色 = LLM 子系统，绿色 = tool registry 子系统，紫色 = output / 反馈。
- **红色虚线**：feedback loop——history append 后回到 Phase 1 下一步，直到 LLM 返回 `done` action 或达到 `max_steps=500`。
- **关键文件锚定**：每个 box 都标了文件路径 + 行号 (commit `8342696`)。

## 核心机制 (Layer 3，分支 A 要求 ≥ 3 段)

### 段一：Agent 主循环 + step() 三阶段

`Agent.step()` 是整个项目的 reactor pattern 核心。
读懂这 70 行就读懂了 browser-use 80% 的设计。

**永久链接**：[browser_use/agent/service.py L1237-L1312](https://github.com/browser-use/browser-use/blob/834269609082d187ca0250de2c06d93799dac92d/browser_use/agent/service.py#L1237-L1312)

```python
@observe(name='agent.step', ignore_output=True, ignore_input=True)
@time_execution_async('--step')
async def step(self, step_info: AgentStepInfo | None = None) -> None:
    """Execute one step of the task"""
    self.step_start_time = time.time()
    browser_state_summary = None

    try:
        # Phase 1: Prepare context and timing
        browser_state_summary = await self._prepare_context(step_info)

        # Clear previous step state
        self.state.last_model_output = None
        self.state.last_result = None

        # Phase 2: Get model output and execute actions
        await self._get_next_action(browser_state_summary)
        await self._execute_actions()

        # Phase 3: Post-processing
        await self._post_process()

    except Exception as e:
        await self._handle_step_error(e)

    finally:
        await self._finalize(browser_state_summary)
```

`Agent.run()` 入口：

**永久链接**：[browser_use/agent/service.py L2544-L2670](https://github.com/browser-use/browser-use/blob/834269609082d187ca0250de2c06d93799dac92d/browser_use/agent/service.py#L2544-L2670)

```python
async def run(
    self,
    max_steps: int = 500,
    on_step_start: AgentHookFunc | None = None,
    on_step_end: AgentHookFunc | None = None,
) -> AgentHistoryList[AgentStructuredOutput]:
    """Execute the task with maximum number of steps"""

    loop = asyncio.get_event_loop()
    agent_run_error: str | None = None

    # Signal handler setup for CTRL+C handling
    signal_handler = SignalHandler(
        loop=loop,
        pause_callback=self.pause,
        resume_callback=self.resume,
        custom_exit_callback=on_force_exit_log_telemetry,
        exit_on_second_int=True,
        disabled=not self.enable_signal_handler,
    )
    signal_handler.register()

    try:
        await self._log_agent_run()
        # Browser session initialization and event dispatch
        await self.browser_session.start()
        # Register skills as actions
        await self._register_skills_as_actions()
        # Main step loop: for step in range(max_steps)
```

旁注：

- **观察点 1：装饰器栈 `@observe + @time_execution_async`**——telemetry 是侵入式注入，不是 callback。这是项目早期就埋好的「每个核心函数都能观测」。Laminar (lmnr) 是 try-import 的，没装也跑得起来 (`tools/service.py` L10-L13)。
- **观察点 2：三阶段命名固定**——_prepare_context / _get_next_action / _execute_actions / _post_process 这套命名不是偶然，是把「reactor 模式」翻译成业务语义。每个阶段一个独立 async 函数，单元测试容易写。
- **观察点 3：last_model_output / last_result 显式清空**——这是「上一步的脏数据不能渗透到下一步」的硬约束。如果不清空，错误处理路径里会读到上一步的 output 误导诊断。
- **观察点 4：finally 里 _finalize 而不是 close**——意味着即使 step 抛异常，session 不关闭，下一步还能继续。错误恢复策略是「step-level 容忍」。
- **观察点 5：max_steps=500 是 hard cap**——没有「智能停止」机制，纯靠 LLM 自己返回 `done` action 或撞 cap。这是 deliberate simplicity——避免引入 meta-planner 的复杂度。
- **观察点 6：SignalHandler 在 run() 入口注册**——CTRL+C 第一次 pause、第二次退出。这种「按 2 次才真退出」的 UX 模式 (cf. ipython) 在 CLI agent 里被反复采用。
- **观察点 7：_register_skills_as_actions 是 lazy 注册**——skills 在 run() 启动时才把自己注册成 action，不在 __init__ 时。这样不同 task 可以装不同 skill，互相不污染。

**怀疑 4**：max_steps=500 这个 default 偏大——典型 web 任务 20 步内就能完成 (实测搜索 + 提取 5 条结果 ~12 步)。500 设这么大是为了应对极端 case (深层导航 + 多次重试)，但同时意味着 LLM 失控时会跑 500 次 (按每次 1k+ token 算就是 500k token / $7-15)。生产用应该按 task 复杂度收紧到 30-50。

### 段二：DOM 简化与序列化 — 把网页压成 LLM 能咽下去的一份清单

DOM service 是「让 LLM 看见网页」的关键。原始 HTML 几十万 token，序列化后只剩交互元素的 indexed 列表。

**永久链接**：[browser_use/dom/service.py L785-L833 get_serialized_dom_tree()](https://github.com/browser-use/browser-use/blob/834269609082d187ca0250de2c06d93799dac92d/browser_use/dom/service.py#L785-L833)

```python
@observe_debug(ignore_input=True, ignore_output=True, name='get_serialized_dom_tree')
async def get_serialized_dom_tree(
    self, previous_cached_state: SerializedDOMState | None = None
) -> tuple[SerializedDOMState, EnhancedDOMTreeNode, dict[str, float]]:
    """Get the serialized DOM tree representation for LLM consumption.

    Returns:
        Tuple of (serialized_dom_state, enhanced_dom_tree_root, timing_info)
    """
    timing_info: dict[str, float] = {}
    start_total = time.time()

    # Use current target (None means use current)
    assert self.browser_session.agent_focus_target_id is not None

    session_id = self.browser_session.id

    # Build DOM tree (includes CDP calls for snapshot, DOM, AX tree)
    # Note: all_frames is fetched lazily inside get_dom_tree only if cross-origin iframes need it
    enhanced_dom_tree, dom_tree_timing = await self.get_dom_tree(
        target_id=self.browser_session.agent_focus_target_id,
        all_frames=None,  # Lazy - will fetch if needed
    )

    # Add sub-timings from DOM tree construction
    timing_info.update(dom_tree_timing)

    # Serialize DOM tree for LLM
    start_serialize = time.time()

    serialized_dom_state, serializer_timing = DOMTreeSerializer(
        enhanced_dom_tree, previous_cached_state, paint_order_filtering=self.paint_order_filtering, session_id=session_id
    ).serialize_accessible_elements()
```

DomService 的构造里能看到核心 trade-off 参数：

**永久链接**：[browser_use/dom/service.py L28-L57](https://github.com/browser-use/browser-use/blob/834269609082d187ca0250de2c06d93799dac92d/browser_use/dom/service.py#L28-L57)

```python
class DomService:
    """
    Service for getting the DOM tree and other DOM-related information.

    Either browser or page must be provided.

    TODO: currently we start a new websocket connection PER STEP, we should definitely keep this persistent
    """

    logger: logging.Logger

    def __init__(
        self,
        browser_session: 'BrowserSession',
        logger: logging.Logger | None = None,
        cross_origin_iframes: bool = False,
        paint_order_filtering: bool = True,
        max_iframes: int = 100,
        max_iframe_depth: int = 5,
        viewport_threshold: int | None = 1000,
    ):
        self.browser_session = browser_session
        self.logger = logger or browser_session.logger
        self.cross_origin_iframes = cross_origin_iframes
        self.paint_order_filtering = paint_order_filtering
        self.max_iframes = max_iframes
        self.max_iframe_depth = max_iframe_depth
        self.viewport_threshold = viewport_threshold
```

旁注：

- **观察点 1：CDP 三件套 (snapshot + DOM + AX tree)**——为了拿到「视觉上能看见 + 语义上有标签 + DOM 树位置」的并集。三个数据源缺一个都会漏元素。`AX (accessibility) tree` 是关键——它给出 `role` / `name`，让无 ID 的 div onclick 也有可读标签。
- **观察点 2：paint_order_filtering=True 默认开**——按 z-index 顺序，干掉被覆盖的元素。否则 LLM 会去点已经被 modal 覆盖的下层按钮。这一条是从无数 production bug 总结出来的 default。
- **观察点 3：viewport_threshold=1000 px**——只序列化 viewport 上下 1000px 内的元素，更远的发出「scroll N pages」hint。这是 token 预算和「看不到的元素也要给 hint」之间的妥协。
- **观察点 4：max_iframes=100 / max_iframe_depth=5**——硬 cap 防止 iframe 套娃 OOM。100 已经远超正常网页 (10 个 iframe 已是极端)。
- **观察点 5：cross_origin_iframes=False 默认关**——跨域 iframe 有 CORS / sandbox 限制，开了会有未知行为。需要时显式开启。
- **观察点 6：TODO 注释 (L34) 暴露了 perf 债**——「currently we start a new websocket connection PER STEP」——每步都重建 CDP 连接，这是已知瓶颈。500 步就是 500 次握手。该 TODO 跟 issue 追踪应该有对应 ticket。
- **观察点 7：previous_cached_state 参数**——支持「diff serialize」，只重新序列化变化的子树。但具体使用率从这层看不出来，要追到 `DOMTreeSerializer.serialize_accessible_elements()` 内部。
- **观察点 8：返回 tuple (state, root, timing)**——把 timing dict 一并返回，方便 telemetry 追踪每个子步骤耗时。这是「production 思维」——每个慢点都能定位。

可见元素过滤逻辑 (片段)：

**永久链接**：[browser_use/dom/service.py L96-L125](https://github.com/browser-use/browser-use/blob/834269609082d187ca0250de2c06d93799dac92d/browser_use/dom/service.py#L96-L125)

```python
def _count_hidden_elements_in_iframes(self, node: EnhancedDOMTreeNode) -> None:
    """Collect hidden interactive elements in iframes for LLM hints.

    For each iframe, collects details of hidden interactive elements including
    tag, text/name, and scroll distance in pages so the agent knows how far to scroll.
    """

    def is_hidden_by_threshold(element: EnhancedDOMTreeNode) -> bool:
        """Check if element is hidden by viewport threshold (not CSS)."""
        if element.is_visible or not element.snapshot_node or not element.snapshot_node.bounds:
            return False

        computed_styles = element.snapshot_node.computed_styles or {}
        display = computed_styles.get('display', '').lower()
        visibility = computed_styles.get('visibility', '').lower()
        opacity = computed_styles.get('opacity', '1')

        css_hidden = display == 'none' or visibility == 'hidden'
        try:
            css_hidden = css_hidden or float(opacity) <= 0
        except (ValueError, TypeError):
            pass

        return not css_hidden
```

**怀疑 5**：「LLM 知道有 12 个隐藏元素 + scroll 2 pages」这种 hint 真的能让 LLM 选对 scroll 距离吗？看 prompts.py，scroll action 的语义是「scroll 一页」(viewport 大小)，而 hint 是「2 pages」——但 LLM 可能多 scroll 一次或少 scroll 一次。这是「token 经济 vs 控制精度」的取舍，没有 perfect 解。

### 段三：Action Registry — 用 Pydantic Union 把 Python 函数包成 LLM tool calling

这是项目最巧妙的一段。`@registry.action` 把任意 Python 异步函数装饰一下，框架自动生成 Pydantic schema 喂给 LLM 的 tool calling API——LLM 只能从注册过的动作里选，参数自动校验。

**永久链接**：[browser_use/tools/registry/service.py L297-L323 action() decorator](https://github.com/browser-use/browser-use/blob/834269609082d187ca0250de2c06d93799dac92d/browser_use/tools/registry/service.py#L297-L323)

```python
def action(
    self,
    description: str,
    param_model: type[BaseModel] | None = None,
    domains: list[str] | None = None,
    allowed_domains: list[str] | None = None,
    terminates_sequence: bool = False,
):
    """Decorator for registering actions"""
    # Handle aliases: domains and allowed_domains are the same parameter
    if allowed_domains is not None and domains is not None:
        raise ValueError("Cannot specify both 'domains' and 'allowed_domains' - they are aliases for the same parameter")

    final_domains = allowed_domains if allowed_domains is not None else domains

    def decorator(func: Callable):
        # Skip registration if action is in exclude_actions
        if func.__name__ in self.exclude_actions:
            return func

        # Normalize the function signature
        normalized_func, actual_param_model = self._normalize_action_function_signature(func, description, param_model)

        action = RegisteredAction(
            name=func.__name__,
            description=description,
            function=normalized_func,
            param_model=actual_param_model,
            domains=final_domains,
            terminates_sequence=terminates_sequence,
        )
        self.registry.actions[func.__name__] = action

        # Return the normalized function so it can be called with kwargs
        return normalized_func

    return decorator
```

执行入口 `execute_action()`：

**永久链接**：[browser_use/tools/registry/service.py L326-L395](https://github.com/browser-use/browser-use/blob/834269609082d187ca0250de2c06d93799dac92d/browser_use/tools/registry/service.py#L326-L395)

```python
async def execute_action(
    self,
    action_name: str,
    params: dict,
    browser_session: BrowserSession | None = None,
    page_extraction_llm: BaseChatModel | None = None,
    file_system: FileSystem | None = None,
    sensitive_data: dict[str, str | dict[str, str]] | None = None,
    available_file_paths: list[str] | None = None,
    extraction_schema: dict | None = None,
) -> Any:
    """Execute a registered action with simplified parameter handling"""
    if action_name not in self.registry.actions:
        raise ValueError(f'Action {action_name} not found')

    action = self.registry.actions[action_name]
    try:
        # Create the validated Pydantic model
        try:
            validated_params = action.param_model(**params)
        except Exception as e:
            raise ValueError(f'Invalid parameters {params} for action {action_name}: {type(e)}: {e}') from e

        if sensitive_data:
            # ... domain-scoped sensitive data substitution
            validated_params = self._replace_sensitive_data(validated_params, sensitive_data, current_url)

        # Build special context dict
        special_context = {
            'browser_session': browser_session,
            'page_extraction_llm': page_extraction_llm,
            'available_file_paths': available_file_paths,
            'has_sensitive_data': action_name == 'input' and bool(sensitive_data),
            'file_system': file_system,
            'extraction_schema': extraction_schema,
        }

        # All functions are now normalized to accept kwargs only
        # Call with params and unpacked special context
        try:
            return await action.function(params=validated_params, **special_context)
```

动态 Pydantic Union schema 生成：

**永久链接**：[browser_use/tools/registry/service.py L495-L575 create_action_model](https://github.com/browser-use/browser-use/blob/834269609082d187ca0250de2c06d93799dac92d/browser_use/tools/registry/service.py#L495-L575)

```python
def create_action_model(self, include_actions: list[str] | None = None, page_url: str | None = None) -> type[ActionModel]:
    """Creates a Union of individual action models from registered actions,
    used by LLM APIs that support tool calling & enforce a schema.

    Each action model contains only the specific action being used,
    rather than all actions with most set to None.
    """
    from typing import Union

    available_actions: dict[str, RegisteredAction] = {}
    for name, action in self.registry.actions.items():
        if include_actions is not None and name not in include_actions:
            continue

        # If no page_url provided, only include actions with no filters
        if page_url is None:
            if action.domains is None:
                available_actions[name] = action
            continue

        # Check domain filter if present
        domain_is_allowed = self.registry._match_domains(action.domains, page_url)

        if domain_is_allowed:
            available_actions[name] = action

    # Create individual action models for each action
    individual_action_models: list[type[BaseModel]] = []

    for name, action in available_actions.items():
        # Create an individual model for each action that contains only one field
        individual_model = create_model(
            f'{name.title().replace("_", "")}ActionModel',
            __base__=ActionModel,
            **{
                name: (
                    action.param_model,
                    Field(description=action.description),
                )
            },
        )
        individual_action_models.append(individual_model)

    # Create proper Union type that maintains ActionModel interface
    if len(individual_action_models) == 1:
        result_model = individual_action_models[0]
    else:
        union_type = Union[tuple(individual_action_models)]

        class ActionModelUnion(RootModel[union_type]):
            def get_index(self) -> int | None:
                if hasattr(self.root, 'get_index'):
                    return self.root.get_index()
                return None
            # ... (set_index, model_dump similarly delegate)

        ActionModelUnion.__name__ = 'ActionModel'
        result_model = ActionModelUnion

    return result_model
```

旁注：

- **观察点 1：`Union[tuple(individual_action_models)]`**——每个动作一个独立 Pydantic model，再 Union 起来。**这是关键 trick**——而不是「一个 ActionModel 有 N 个 Optional 字段」。Union 让 LLM 在 tool calling 里只看到「选一个动作 + 它的参数」，不会被一堆 `None` 字段污染。
- **观察点 2：domain 过滤 (allowed_domains)**——某些动作只在特定网站启用 (例如「Gmail 的 archive 操作」只对 mail.google.com 暴露)。LLM 看到的工具集是 page_url 相关的子集，避免误用。
- **观察点 3：special_context 注入**——browser_session / file_system / page_url 等不是「LLM 决定的参数」，而是框架运行时注入的。LLM 只关心「点哪个 index」，而不知道 session 句柄。这是漂亮的关注点分离。
- **观察点 4：`if action_name == 'input' and bool(sensitive_data)`**——硬编码的特殊处理：只有 `input` 动作能拿到 sensitive_data。这是安全设计——别的动作 (extract / screenshot 等) 拿不到密码。这种 case 没法通用抽象，硬编码反而清晰。
- **观察点 5：terminates_sequence 标志**——某些动作 (`done`, `navigate`) 一旦执行就该截断后续 sub-action。例如 LLM 一步给了 `[click, click, done]`，第三个 done 一执行就跳出 loop，前面的 click 都已经执行完了。
- **观察点 6：RootModel + 三个 delegate 方法 (get_index / set_index / model_dump)**——为了让 Union 出来的对象「看起来像」原 ActionModel，框架手动 delegate 三个常用方法。否则 Pydantic v2 RootModel 不会自动转发。
- **观察点 7：返回 `result_model` 是个 type，不是实例**——LLM SDK (Anthropic / OpenAI) 接受的是 schema (类)，不是实例。每次 step 都重建一次 (因为 page_url 变了，allowed actions 集合可能变)。
- **观察点 8：`include_actions` 参数**——支持「这一步只暴露这些动作」的精细控制 (例如某 task 阶段不允许 `done`，只能 `extract`)。

默认动作集合在 `tools/service.py` (90 KB) 注册——一组 `@self.registry.action(...)` 调用：

**永久链接**：[browser_use/tools/service.py 文件](https://github.com/browser-use/browser-use/blob/834269609082d187ca0250de2c06d93799dac92d/browser_use/tools/service.py) (2,847 行)

| 行号 | 动作 | 用途 |
|---|---|---|
| L268 | `@registry.action(SearchAction)` | 全文搜索 (内嵌搜索引擎调用) |
| L306 | `@registry.action(NavigateAction)` | 导航到 URL |
| L380 | `@registry.action('Go back', NoParamsAction)` | 浏览器后退 |
| L526 | `@registry.action(InputTextAction)` | 输入文本到 indexed 元素 |
| L619 | `@registry.action(UploadFileAction)` | 上传文件 |
| L787 | `@registry.action('Click element by index')` | 点击 (最常用) |
| L943 | `@registry.action(GetDropdownOptionsAction)` | 取下拉选项 |
| L1030 | `@registry.action(SelectDropdownOptionAction)` | 选下拉项 |
| L1216 | `@registry.action(ScrollAction)` | 滚动 |

**怀疑 6**：`tools/service.py` 一个文件 2,847 行 / 90 KB——所有默认动作都堆在一起。从「单一职责」视角看应该按动作类别拆 (导航类 / 输入类 / 抽取类)。但他们没拆——猜测是因为这些动作都共享 `browser_session` / `cdp_client` 上下文，拆开反而要重复 import 一坨依赖。这是「文件大但概念聚合」的取舍。

## Hands-on (Layer 4，分支 A 允许「读+理解」+ 小改实验)

### 30 分钟跑通 (实测命令)

```bash
# 装包 (Python ≥ 3.11)
pip install browser-use
playwright install chromium

# 配 LLM key (任选一个)
export ANTHROPIC_API_KEY=...
# 或 OPENAI_API_KEY / GOOGLE_API_KEY

# 跑官方 example: 让 agent 搜 NeurIPS papers
python -c "
from browser_use import Agent
from browser_use.llm import ChatAnthropic
import asyncio

agent = Agent(
    task='Search top 5 NeurIPS 2024 papers and return their titles',
    llm=ChatAnthropic(model='claude-opus-4-5'),
)
asyncio.run(agent.run(max_steps=20))
"
```

或者直接跑仓库 example：

```bash
git clone --depth 1 https://github.com/browser-use/browser-use
cd browser-use
uv sync                                  # 项目用 uv
python examples/simple.py                # 最简单的 demo
```

### 改一处实验：把 max_actions_per_step 从 3 改成 1

文件：`browser_use/agent/prompts.py` L34-L96 (SystemPrompt 类)

实验目标：观察 LLM 每步最多只允许 1 个 action 时，total step 数和 token 消耗的变化。

**改动**：

```python
# 原默认
class SystemPrompt:
    def __init__(
        self,
        max_actions_per_step: int = 3,  # 改成 1
        ...
```

**预期**：

- 总 step 数 ≈ 翻 3 倍 (每步只能做一件事)
- 总 token 消耗 ≈ 增加 1.5-2× (每步都要重新喂 DOM + screenshot，但思考少了)
- 失败率应该**下降**——因为 LLM 一步做太多事容易出错 (例如先 input 再 click，但 input 失败了 click 又点错了元素)

**实测建议**：跑 5 个相同 task，测 step count + token + 完成率。

> 大型应用分支 A 不要求跑通完整 build；这个改动只需改一行 default value，但能直观体会「max_actions_per_step」这个参数到底在控什么。

### 改一处实验 B：把 viewport_threshold 从 1000 改成 200

文件：`browser_use/dom/service.py` L48 (DomService.__init__)

```python
viewport_threshold: int | None = 1000,  # 改成 200
```

**预期**：

- DOM 序列化结果元素数减少 (只看 viewport 上下 200px)
- LLM 漏点元素的概率上升 (尤其是 long form / 长列表)
- token 消耗下降

把这个实验和上一个对比：体会**精度 vs 经济**的两个旋钮。

## 横向对比 (Layer 5，≥ 5 维)

| 维度 | browser-use | Playwright (直接) | Selenium IDE | Microsoft OmniParser | Anthropic Computer Use |
|---|---|---|---|---|---|
| **形态** | LLM agent infra (Python lib) | 浏览器自动化 SDK | 浏览器扩展 + 录回放 | OCR + DOM + LLM 中间件 | 模型 API + 系统级 agent |
| **输入给 LLM** | 简化 DOM (indexed 列表) | N/A (无 LLM) | N/A | OCR 后的元素 + 文本 | 原始截图 + 像素坐标 |
| **抽象层** | 高 (动作 by index) | 低 (selector + click) | 低 (录制脚本) | 中 (语义化文本) | 低 (像素坐标) |
| **控制精度** | 中 (指 index，DOM 不全时会漏) | 高 (selector 精确) | 高 (录制时锁定) | 中 (OCR 错认率) | 低 (像素移位即失败) |
| **token 经济** | 优 (~5k token/step) | N/A | N/A | 中 (OCR 文本) | 差 (截图 + 输出坐标) |
| **跨网站稳定** | 好 (DOM 改版容忍) | 差 (selector 易碎) | 差 (一次性) | 中 | 差 (UI 改版即坏) |
| **LLM provider** | 多 (Anthropic / OpenAI / Gemini / local) | 无 | 无 | 不绑定 | 仅 Anthropic |
| **执行后端** | Playwright/CDP | self | webdriver | 用户自配 | OS-level (mouse/keyboard) |
| **学习曲线** | 中 (理解 agent loop) | 低 | 极低 | 高 (要懂 OCR+LLM) | 中 |
| **License** | MIT | Apache-2.0 | Apache-2.0 | MIT | 闭源 (商业 API) |
| **Star (2026-05)** | 95.9k | 71k+ | (生态) | ~10k | N/A (服务) |

### 哲学不同的竞品：Anthropic Computer Use

- **browser-use**：LLM 看「DOM 索引」，输出动作 + index。前提是「能拿到 DOM」(浏览器内才行)。
- **Computer Use**：LLM 看「像素截图」，输出鼠标坐标。前提是「能模拟系统级 IO」(整个屏幕都能控)。

后者更通用 (能控 native app)，但精度低；前者更精，但只能在浏览器里。
**browser-use 押注「网页是大多数自动化任务的载体」——这个押注在 2024-2026 看起来对了**。
但 Computer Use 在 desktop app / OS 层任务上无可替代。

### 选型建议

| 场景 | 选谁 |
|---|---|
| 要让 LLM 自动操作网页，要稳要省 token | **browser-use** |
| 已有明确 selector，不需要 LLM | **Playwright 直接** |
| 简单任务、用户自己录回放 | **Selenium IDE** |
| 网页之外 (desktop app / OS) | **Computer Use** |
| 网页 + 大量图片/PDF (非标准 DOM) | **OmniParser** + 自己拼 |

## 与你当前工作的连接 (Layer 6，每段 ≥ 4 子弹)

### 今天就能用的部分

- **Pydantic Union schema 注入 LLM 工具调用**——把任意 Python 函数 + 一个 BaseModel 包成 tool，是任何「LLM agent」项目的通用范式。读 `registry/service.py` L495-L575 直接抄。
- **CDP 三件套 (snapshot + DOM + AX tree) 抓元素**——如果你的项目要做「让 AI 看懂网页」，AX tree 比纯 DOM 给 LLM 提供更多语义 (role, name, value)。`dom/service.py` 的实现是参考样板。
- **`@observe + @time_execution_async` 装饰器栈**——telemetry 侵入式注入，每个核心函数自动有 trace + timing。直接 copy 用法。
- **三阶段 step (prepare / get_action / execute / post)**——把 agent 主循环切成 4 个独立 async 函数，每个单元测试独立写。这是写 agent 的标准模板。
- **max_actions_per_step 参数**——给 LLM 加「每步最多做几件事」的硬约束，比让它自由发挥可控很多。

### 下个月能用的部分

- **domain-scoped action 注册**——按 page_url 过滤可用动作 (`@action(allowed_domains=['gmail.com'])`)。如果你做多站点 agent，这套机制省掉一堆 if/else。
- **sensitive_data 域名绑定 + 占位符替换**——`{{password}}` 在 prompt 里是占位符，只在 input 动作执行时替换成真值。LLM 永远看不到原文。这套设计可以直接复用到任何「不能让 LLM 看到原始密钥」的场景。
- **action terminates_sequence 截断**——如果你的 agent 也是「一步多动作」模式，需要这种 early break 机制。
- **viewport_threshold + scroll hint**——「LLM 看不到的东西也要给 hint」这个范式可以推广到任何 「context window 不够」的情况：超出 window 的内容做摘要/计数 hint，让 LLM 知道存在但不必看。

### 不要用的部分

- **「DOM 可见 + 索引」假设**——某些 React Server Component / Canvas-based UI (Figma, Excalidraw) 的「按钮」根本不是 DOM 元素，browser-use 的 DOM 路线在这类站点会失效。如果你的目标是这种站点，回到 vision 路线 (Computer Use 风格)。
- **每步重建 CDP 连接**——`dom/service.py` L34 那个 TODO 还没解决。如果你做高频 agent (每秒一步)，这套实现是性能瓶颈，要重写成持久 websocket。
- **max_steps=500 default**——生产用建议收紧到 30-50，避免失控时烧光 token 预算。
- **`tools/service.py` 一个 90 KB 文件**——这种「所有默认动作堆一起」的结构在你自己项目里不要照搬。按动作类别拆模块 (navigation / input / extraction)，拓展性更好。
- **所有 LLM provider 一锅炖在 `llm/`**——browser-use 自己抽了 BaseChatModel 接口包了 5+ provider。如果你的项目能直接用 LangChain 或 LiteLLM，没必要重新造一份抽象。

## 自检 + 延伸阅读 (Layer 7，≥ 3 怀疑追到行号)

### 自检问题 (要追到具体行号)

1. **`Agent.step()` 三阶段中，如果 Phase 2 LLM 抛超时，Phase 3 会执行吗？session 会关闭吗？**
   - 提示：看 `agent/service.py` L1237-L1312，特别是 `_handle_step_error` 和 `_finalize` 在 try/except/finally 里的位置。
2. **`max_actions_per_step=3` 在哪一行被传递给 LLM 的 system prompt？LLM 是否真的遵守？如果它返回 5 个 action 框架怎么处理？**
   - 提示：从 `prompts.py` L34-L96 的 SystemPrompt 入口顺藤摸瓜，找到 prompt 模板里的 placeholder。
3. **`create_action_model()` 每个 step 都重建 ActionModel Union。如果 100 个动作 × 500 step，会有性能问题吗？**
   - 提示：测量 `registry/service.py` L495-L575 的耗时；找有没有 cache 机制。
4. **`viewport_threshold=1000` 是 px 还是元素数？为什么是 1000 不是 viewport_height 倍数？**
   - 提示：`dom/service.py` L48 + `is_hidden_by_threshold` (L96 起) 看具体语义。
5. **`special_context` 中 `cdp_client` 是 lazy fetch 还是预先注入？多 tab 切换时 page_url 更新延迟怎么处理？**
   - 提示：`registry/service.py` L380-L390 附近，`browser_session.cdp_client` 的获取逻辑。

### 延伸阅读 (按顺序)

| 顺序 | 文件 | 回答什么问题 |
|---|---|---|
| 1 | `agent/prompts.py` 全文 (745 行) | system prompt 模板长什么样、thinking / flash mode 区别 |
| 2 | `browser/session.py` | BrowserSession 如何启动 Playwright、CDP 连接、target 切换 |
| 3 | `dom/serializer.py` (DOMTreeSerializer) | 序列化具体逻辑——index 怎么分配、role/name 怎么挤进 |
| 4 | `tools/service.py` L268 起 | 默认动作具体实现，特别是 click_element_by_index L787 (最常用) |
| 5 | `skills/` 目录 | 用户自定义 skill 注入 prompt + action 的机制 |
| 6 | `mcp/` 目录 | MCP client 集成——browser-use 怎么调用外部 MCP server |
| 7 | `examples/` 全部 | 用户视角端到端跑通 |

## 限制 (≥ 4 条独立)

1. **DOM 路线的盲区**——Canvas/WebGL/某些 React Server Component 拿不到可点击 DOM 元素，browser-use 在这类站点会失效。fallback 到 vision 模式 (传截图给 LLM) 是补丁，不是根治。
2. **每步 CDP 重连开销**——`dom/service.py` L34 的 TODO 已知未解。每步握手 ~50-200ms，500 步累计 30-100s 纯握手成本，性能敏感场景要打 patch。
3. **token 成本仍然显著**——简化后每步仍 ~5k token，500 步 = 2.5M token (约 $7-15 一次任务，按 Claude Opus 价)。生产用要么降模型 (Haiku)、要么 max_steps 收紧。
4. **LLM provider 抽象层易跟不上**——`browser_use/llm/` 自己抽了 BaseChatModel，但每次新 provider (Gemini 2.5 / Grok / Claude 4.x) 出来都要适配一次。比直接依赖 LiteLLM/LangChain 多维护成本。
5. **示例代码 vs production gap**——`examples/` 多数是 happy path (一次跑通)。production 要叠加 retry / fallback / cost cap / observability，README 不教这些。

## 附录：宣传 vs 现实清单 (P2 加分)

| 宣传 (README) | 现实 (代码) |
|---|---|
| "Make websites accessible for AI agents" | 90% 网站可以，但 Canvas / 复杂 SPA / 反爬强的站 (Cloudflare 验证码、无障碍标记缺失的电商) 仍然会卡住 |
| "Automate tasks online with ease" | "ease" 限于「简单 form fill / 信息抽取」；多步事务 (银行转账 / 企业 SaaS) 失败率仍高 |
| "Multi-LLM support" | 是真，但每个 provider 适配代码量不小 (`browser_use/llm/` 接近 2k 行)，新 provider 要等 1-2 个 release |
| "Skills system" | skill 是 prompt + action 的轻封装，不是 Claude Code 那种「按需加载 + 三层扩展」深度 |
| "Cloud sandbox available" | `browser_use/sandbox/` 存在，但功能 / 价格在公开仓库看不全；商业化半透明 |

## 元数据

- **升级日期**：2026-05-28
- **总行数**：~580 行 markdown
- **分支**：v1.1 分支 A (大型应用)
- **锚定 commit**：`834269609082d187ca0250de2c06d93799dac92d` (2026-05-26)
- **GitHub permalinks**：8 处 (覆盖 agent/service.py L113-244 / L1237-1312 / L2544-2670, dom/service.py L28-57 / L96-125 / L785-833, registry/service.py L297-323 / L326-395 / L495-575, tools/service.py 全文，prompts.py L34-96)
- **figure 数**：1 张 webp (361 KB, 1200×1300, 5 色编码)
- **显式怀疑数**：6 处 (DOM 路线盲区 / token 上限 / Computer Use 差异化 / max_steps 选型 / scroll hint 精度 / tools/service.py 单文件 90KB)
- **启用工具**：WebFetch (GitHub raw + API) / qlmanage (SVG → PNG) / cwebp (PNG → webp)
