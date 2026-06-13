---
title: UI-TARS — 原生 GUI Agent 视觉语言模型
来源: 'https://github.com/bytedance/UI-TARS'
日期: 2026-06-13
子分类: 模型与训练
分类: 机器学习
provenance: pipeline-v3
---

## 是什么

UI-TARS 是字节跳动 Seed 团队开源的**原生 GUI Agent 视觉语言模型（VLM）**——不是「Playwright 外面再套一层 prompt」的胶水框架，而是把**感知、推理、定位（grounding）、记忆**都训进同一个多模态模型里，端到端输出「下一步该怎么点屏幕」。

日常类比：传统 GUI 自动化像给盲人配一本**超厚的操作手册**——「第 3 页第 2 段，把鼠标移到坐标 (240, 380) 单击」。手册里任何一个坐标写错，或者软件改版把按钮挪了，整条流程就废。UI-TARS 的做法更像雇一个**真的会看屏幕的实习生**：你给他一张当前桌面的截图，说「帮我把这份 PDF 存到桌面」，他先在心里想一遍（Thought），再告诉你「我要点左上角 File 菜单」（Action + 坐标），你的电脑执行器再去动鼠标键盘。

整条链路可以压成四步：

```text
截图 → UI-TARS 模型 → "Thought + Action" 文本 → action_parser → pyautogui / 系统输入
```

仓库主体是**模型权重 + 推理/后处理工具**（`pip install ui-tars`），不是开箱即用的桌面 App。想零配置在本机用，应看同生态的 [[ui-tars-desktop]]；想在浏览器里用，社区常见接法是 [[midscene]]。

当前公开主线版本包括 UI-TARS-1.5（强化学习增强的「先想再做」推理）、以及 2025 年 9 月发布的 UI-TARS-2（GUI / 游戏 / 代码 / 工具调用一体化）。Hugging Face 上提供 2B / 7B / 72B 等规格，桌面场景官方推荐 **7B-DPO** 或 **72B-DPO**。

## 为什么重要

如果你关心「AI 怎么真的去操作电脑」，下面几件事绕不开 UI-TARS 这条技术路线：

- **「原生 Agent 模型」vs「框架拼模型」**：[[stagehand]]、[[browser-use]] 等多是「通用 LLM + 专用 prompt / DOM 解析」；UI-TARS 从训练数据阶段就把 GUI 动作空间、坐标体系、历史轨迹写进模型，OSWorld、AndroidWorld 等在线基准上 1.5 版曾达到当时 SOTA 水平（例如 OSWorld 100 步 **42.5%** 成功率）。
- **Thought-Action 双流输出**：1.5 引入类 System-2 推理——模型先输出 `Thought:` 解释意图，再输出 `Action:`。Minecraft 等长程任务上，带 Thought 的版本明显优于纯动作版，说明「多想一步」对 GUI 任务同样有效。
- **统一动作空间跨平台**：同一套语义动作（`click`、`type`、`scroll`、`drag`…）可映射到桌面；移动端另有 `long_press`、`press_home` 等扩展。框架开发者不必为每个 OS 单独设计 planner。
- **生态分叉清晰**：模型仓库（本 repo）→ 桌面壳（UI-TARS-desktop / Agent TARS）→ 浏览器 SDK（Midscene）。学 UI-TARS 等于理解这条链的「大脑」层，而不是某个单一产品 UI。

## 核心要点

零基础先把下面五个概念对齐，后面读代码和论文都不会晕。

### 1. 原生 GUI Agent（Native Agent）

传统方案常见流水线：`OCR/元素检测 → 规则或 LLM 规划 → 脚本执行`，模块多、误差累积。UI-TARS 论文的核心主张是：**一个 VLM 同时负责看界面、想步骤、出动作**，减少手工规则和预定义 workflow。代价是模型体量大、部署要吃 GPU，且幻觉会直接变成误点。

### 2. Thought + Action 输出格式

模型典型单行或多行文本，结构固定：

```text
Thought: 我看到登录页，需要先点邮箱输入框。
Action: click(start_box='(512,340)')
```

- `Thought`：可解释性 + 推理链，评测和 debug 时非常有用；生产环境也可选择剥离（`GROUNDING` 模板只出 Action）。
- `Action`：受限语法 DSL，如 `click`、`double_click`、`type`、`hotkey`、`scroll`、`drag` 等，参数里带 `start_box` / `end_box` 坐标或文本内容。

### 3. 坐标体系与 `factor=1000`

UI-TARS 基于 Qwen2.5-VL 系，使用**绝对像素坐标**，且训练时常把坐标归一化到 0–1000 的相对网格，再按**原图宽高**映射回真实屏幕。后处理时必须传入：

- `origin_resized_height` / `origin_resized_width`：喂给模型前截图 resize 后的尺寸（通常与模型输入一致）
- `image_height` / `image_width`：执行点击时的真实屏幕分辨率

坐标搞错一位，表现就是「模型明明说点了按钮，鼠标却飞到角落」——这是 UI-TARS 集成里**第一大坑**，官方单独写了 `README_coordinates.md`。

### 4. 三套 Prompt 模板

`codes/ui_tars/prompt.py` 里按场景选模板，不要混用：

| 模板 | 场景 | 特点 |
|------|------|------|
| `COMPUTER_USE` | Windows / macOS / Linux 桌面 | 鼠标、键盘、拖拽、滚动 |
| `MOBILE_USE` | 手机 / 模拟器 | `long_press`、`open_app`、`press_back` 等 |
| `GROUNDING` | 评测 / 训练 | 只输出 Action，不要 Thought，延迟更低 |

对话历史里要交替塞入「用户任务 + 截图」与「助手 Thought/Action」，形成多步 agent loop。

### 5. 部署与后处理分工

| 阶段 | 做什么 | 常用工具 |
|------|--------|----------|
| 部署推理 | 加载 7B/72B 权重，OpenAI 兼容 API | vLLM、HuggingFace Inference Endpoints |
| 后处理 | 解析 Action 字符串 → 结构体 → 可执行代码 | `ui_tars.action_parser` |
| 执行 | 真机点击 / 浏览器自动化 | pyautogui、Playwright、UI-TARS-desktop |

**模型只负责「说」；「做」要靠外层 executor。** 这和 Anthropic Computer Use、[[midscene]] 的分工类似，但 UI-TARS 的动作语法是专有的。

## 实践案例

### 案例 1：把模型输出解析成 pyautogui 代码

安装官方后处理包后，最小闭环如下（摘自仓库 README，略作注释）：

```python
from ui_tars.action_parser import (
    parse_action_to_structure_output,
    parsing_response_to_pyautogui_code,
)

# 模型返回的原始字符串（通常来自 chat completion）
response = (
    "Thought: Click the submit button\n"
    "Action: click(start_box='(100,200)')"
)

# 喂给模型前的截图尺寸（与推理时 resize 一致）
original_image_width, original_image_height = 1920, 1080

parsed_dict = parse_action_to_structure_output(
    response,
    factor=1000,
    origin_resized_height=original_image_height,
    origin_resized_width=original_image_width,
    model_type="qwen25vl",
)
print(parsed_dict)

# 映射到真实屏幕分辨率，生成可 exec 的 pyautogui 片段
parsed_pyautogui_code = parsing_response_to_pyautogui_code(
    responses=parsed_dict,
    image_height=original_image_height,
    image_width=original_image_width,
)
print(parsed_pyautogui_code)
# 典型输出类似： pyautogui.click(192, 216, button='left')
```

这段代码解决的是：**字符串 Action → 像素坐标 → 宿主环境输入 API**。集成任何 executor（不限 pyautogui）都应先走 `parse_action_to_structure_output`。

### 案例 2：用 vLLM 起 OpenAI 兼容服务并跑一步推理

本地有 GPU 时，官方 README_v1 推荐 vLLM（`vllm>=0.6.1`）。7B 模型一般 `-tp 1`，72B 常用 `-tp 4`：

```bash
python -m vllm.entrypoints.openai.api_server \
  --served-model-name ui-tars \
  --model ByteDance-Seed/UI-TARS-1.5-7B \
  --limit-mm-per-prompt image=5 \
  -tp 1
```

客户端用 OpenAI SDK，把截图 base64 塞进 multimodal message，并套上 `COMPUTER_USE` 系统 prompt（仓库 `prompt.py` 中有完整模板）。伪代码骨架：

```python
import base64
from openai import OpenAI

client = OpenAI(base_url="http://127.0.0.1:8000/v1", api_key="EMPTY")

with open("screen.png", "rb") as f:
    b64 = base64.b64encode(f.read()).decode()

messages = [
    {"role": "system", "content": COMPUTER_USE_PROMPT},
    {
        "role": "user",
        "content": [
            {"type": "text", "text": "任务：打开浏览器并访问 example.com"},
            {
                "type": "image_url",
                "image_url": {"url": f"data:image/png;base64,{b64}"},
            },
        ],
    },
]

resp = client.chat.completions.create(
    model="ui-tars",
    messages=messages,
    temperature=0.0,
    max_tokens=400,
)
raw = resp.choices[0].message.content
# 再把 raw 交给案例 1 的 action_parser
```

HuggingFace Endpoints 部署时，官方还建议设置 `CUDA_GRAPHS=0`、`PAYLOAD_LIMIT=8000000`，避免大图请求失败——这是云部署常见的「能起服务但一截图就 413」问题。

### 案例 3：多步 Agent 循环（概念伪代码）

真实任务很少一步完成。外层要维护**截图 → 推理 → 执行 → 再截图**循环，并把历史 Thought/Action 写回对话：

```python
history = []
for step in range(max_steps):
    screenshot = capture_screen()  # 与 origin_resized_* 对齐
    history.append(user_message(task, screenshot))
    raw = call_ui_tars_api(history)
    history.append({"role": "assistant", "content": raw})

    actions = parse_action_to_structure_output(raw, ...)
    execute_on_host(actions)  # pyautogui / desktop operator

    if task_done(raw) or same_screen_stuck(screenshot):
        break
```

UI-TARS-desktop、OSWorld 官方 `run_uitars.py`、[[midscene]] 的 UI-TARS provider 本质上都是这个 loop 的不同工程封装。

## 踩过的坑

1. **坐标系不一致是头号 bug**：模型按 resize 后尺寸归一化，执行器按物理分辨率点击——少传 `origin_resized_*` 或 Retina 屏 DPI 翻倍，就会出现系统性偏移。
2. **7B 与满血 1.5 能力差距大**：公开 7B 偏通用桌面；游戏、复杂推理场景官方明确说仍不如完整 1.5。别用 7B 跑 Minecraft 然后得出「UI-TARS 不行」的结论。
3. **Thought 增加 token 与延迟**：推理时 scaling 友好，但在线产品每步多几百 token；`GROUNDING` 或剥离 Thought 是常见优化。
4. **安全与滥用**：论文和 README 都提到 CAPTCHA、未授权自动化等风险——生产环境要有人工确认、速率限制、审计日志，别裸放公网 API。
5. **幻觉仍然存在**：按钮认成相邻图标、在错误窗口上点击，在陌生软件或深色主题下更明显；需要外层校验（截图 diff、关键步骤 assert）。
6. **算力成本**：72B-DPO 效果最好，但单卡很难跑；云 Endpoint L40S 48G 是 7B 的参考配置，预算要先算清楚。

## 适用 vs 不适用场景

**适用**：

- 研究 GUI Agent、复现 OSWorld / AndroidWorld / ScreenSpot 论文数字
- 自托管多模态 agent，希望**动作语法统一**且可换 executor
- 桌面自动化原型（配合 UI-TARS-desktop 或自写 pyautogui loop）
- 浏览器自动化且愿用 [[midscene]] 等已集成 UI-TARS 的 SDK
- 需要 **Thought 链** 做可解释 demo 或强化学习数据收集

**不适用**：

- 只想稳定跑 CI e2e、毫秒级反馈（应用 [[playwright]] + 传统 selector，或 [[stagehand]] 的确定性优先路线）
- 无 GPU、不愿买云推理——每次截图调 7B 多模态成本远高于纯文本 LLM
- 强合规场景不允许模型看见全屏敏感信息（银行、医疗终端）
- 期望「pip install 就能自动操作一切」——本仓库是模型 + 解析器，不是开箱产品

## 历史小故事（可跳过）

- **2025-01**：论文 *UI-TARS: Pioneering Automated GUI Interaction with Native Agents*（arXiv:2501.12326）发布，提出原生 agent 训练范式。
- **2025-03**：OSWorld 官方仓库合并 `run_uitars.py`，社区可复现桌面 agent 基准。
- **2025-04**：UI-TARS-1.5 开源，强调 RL 增强的 Thought-Action 与游戏场景；7B 权重上 Hugging Face。
- **2025-09**：UI-TARS-2 技术报告，向 GUI + 游戏 + 代码 + Tool Use 一体化扩展。
- **生态**：UI-TARS-desktop 与 Agent TARS 分家又统一在 `UI-TARS-desktop` monorepo；浏览器侧 [[midscene]] 把 UI-TARS 列为内置 VLM 之一。

## 学到什么

- **「原生」指的是训练目标，不是魔法**：模型仍可能幻觉；工程上 executor、坐标映射、循环控制一样不能省。
- **坐标是 GUI Agent 的隐形接口**：比 prompt 工程还值得单独写单元测试；Retina、多显示器、窗口缩放都会破坏 grounding。
- **Thought 是精度与成本的旋钮**：研究/长任务偏向保留；低延迟产品偏向 `GROUNDING` 或蒸馏掉 Thought。
- **模型 repo ≠ 产品**：零基础用户应从 UI-TARS-desktop 或 Midscene 入手；本仓库适合「我要看懂大脑怎么工作」的人。
- **与 DOM 路线互补而非替代**：复杂 SPA 用 DOM 有时更省 token；canvas、跨平台、游戏画面则 VLM 原生路线更自然——和 [[midscene]] vs [[browser-use]] 的争论是同一光谱。

## 延伸阅读

- 论文：[UI-TARS arXiv:2501.12326](https://arxiv.org/abs/2501.12326)
- UI-TARS-2 报告：[arXiv:2509.02544](https://arxiv.org/abs/2509.02544)
- 模型权重：[Hugging Face ByteDance-Seed](https://huggingface.co/ByteDance-Seed)
- 部署指南：仓库 `README_deploy.md`（HuggingFace Endpoints）
- 坐标说明：仓库 `README_coordinates.md`
- 桌面产品：[UI-TARS-desktop](https://github.com/bytedance/UI-TARS-desktop)
- 博客：[Seed UI-TARS-1.5 发布说明](https://seed.bytedance.com/en/blog/bytedance-seed-agent-model-ui-tars-1-5-open-source-achieving-sota-performance-in-various-benchmarks)

## 关联

- [[midscene]] —— 浏览器自动化 SDK，内置 UI-TARS 作为 VLM 后端之一
- [[playwright]] —— 常见执行层；UI-TARS 负责「看+想」，Playwright 负责「点」
- [[stagehand]] —— Playwright + LLM 混血框架，默认不绑定 UI-TARS 权重
- [[browser-use]] —— DOM 树索引路线，与 UI-TARS 截图原生路线对比鲜明
- [[openai-codex-cli]] —— 另一类「agent 操作计算机」产品形态，偏终端与代码而非 GUI 坐标
- [[vllm]] —— 本地部署 UI-TARS 的常用推理引擎
