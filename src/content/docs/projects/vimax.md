---
title: ViMax — 从"一个想法"到完整视频的 AI 导演团队
来源: https://github.com/HKUDS/ViMax
日期: 2026-06-13
分类: 机器学习
子分类: 模型与训练
provenance: pipeline-v3
---

# ViMax — 从"一个想法"到完整视频的 AI 导演团队

## 一、从日常类比开始

想象你要拍一部微电影。传统方式下，你需要：

- **编剧**写剧本
- **分镜师**画分镜
- **美术**设计角色和场景
- **摄影**安排镜头
- **剪辑**把素材拼成片子

每一个环节都要人盯人，角色穿什么、场景在哪、上一场戏的对话怎么接到下一场，全靠人工协调。

**ViMax 做的事情，就是把这一整个团队"装进一个 AI 系统里"。**

你只需要给它一句话，比如："一只猫和一只狗是最好的朋友，它们遇到新猫时会发生什么？"，ViMax 就会自动完成：

1. 写故事剧本（编剧 Agent）
2. 设计分镜和镜头（分镜 Agent）
3. 生成角色参考图（美术 Agent）
4. 生成每一帧画面（画面生成 Agent）
5. 检查角色和场景是否一致（质检 Agent）
6. 拼成完整视频（导演 Agent）

整个过程像流水线一样，每个环节都有专门的 Agent 负责，它们之间会互相沟通、互相检查。

---

## 二、核心概念

### 2.1 多 Agent 协作框架

ViMax 的核心思想是 **多 Agent 协作**。它不是用一个模型做所有事情，而是把任务拆成多个角色，每个角色用一个专门的 Agent 来做：

- **Director（导演 Agent）**：统筹全局，决定拍什么、怎么拍
- **Screenwriter（编剧 Agent）**：根据想法写剧本
- **Producer（制片 Agent）**：管理参考图、资源、一致性
- **Video Generator（视频生成 Agent）**：把画面变成视频

这些 Agent 通过一个 **中央协调器（Central Orchestration）** 来沟通，决定谁在什么时候做什么。

### 2.2 端到端视频生成流程

ViMax 的输入可以是一个简单的想法（Idea），也可以是一个已有的剧本（Script），甚至可以是一本小说（Novel）。输出是完整的视频。

流程大致是：

```
输入（想法/剧本/小说）
  → 脚本生成（长脚本）
    → 分镜设计（Storyboard）
      → 参考图选择（Reference Images）
        → 画面生成（Image Generation）
          → 一致性检查（Consistency Check）
            → 视频生成（Video Generation）
              → 输出完整视频
```

### 2.3 关键创新点

- **RAG（检索增强生成）**：处理长剧本时，用 RAG 保证故事的连贯性
- **依赖感知的一致性机制**：跟踪角色和环境在不同场景之间的状态
- **VLM 指导的质检**：用视觉语言模型检查生成的画面是否合理
- **并行处理**：同一镜头的多个画面可以并行生成，提高效率

---

## 三、代码示例

### 3.1 从想法生成视频（Idea2Video）

这是最简单的使用方式。你只需要提供一个想法和风格要求：

```python
# main_idea2video.py

idea = """
If a cat and a dog are best friends, what would happen when they meet a new cat?
"""

user_requirement = """
For children, do not exceed 3 scenes.
"""

style = "Cartoon"
```

配置信息写在 `configs/idea2video.yaml` 里：

```yaml
chat_model:
  init_args:
    model: google/gemini-2.5-flash-lite-preview-09-2025
    model_provider: openai
    api_key: <YOUR_API_KEY>
    base_url: https://openrouter.ai/api/v1

image_generator:
  class_path: tools.ImageGeneratorNanobananaGoogleAPI
  init_args:
    api_key: <YOUR_API_KEY>

video_generator:
  class_path: tools.VideoGeneratorVeoGoogleAPI
  init_args:
    api_key: <YOUR_API_KEY>

working_dir: .working_dir/idea2video
```

运行：

```bash
uv run python main_idea2video.py
```

ViMax 就会自动走完整个流程：编剧 → 分镜 → 画面 → 视频。

### 3.2 从已有脚本生成视频（Script2Video）

如果你已经有剧本了，可以用 Script2Video：

```python
# main_script2video.py

script = """
EXT. SCHOOL GYM - DAY
A group of students are practicing basketball in the gym.
John (18, male, tall, athletic) is the star player.
Jane (17, female, short, athletic) is the assistant coach.

John: (dribbling) I'm going to score a basket!
Jane: (smiling) Good job, John!
John: (shooting) Yes!
"""

user_requirement = """
Fast-paced with no more than 20 shots.
"""

style = "Animate Style"
```

运行：

```bash
uv run python main_script2video.py
```

### 3.3 交互式 TUI（文本界面）

ViMax 还提供了交互式的命令行界面，你可以逐步指导 Agent 工作：

```bash
# 启动 TUI
vimax tui

# 开始新对话
vimax tui new

# 恢复上次对话
vimax tui resume

# 恢复指定会话
vimax tui resume <session_id>
```

TUI 的配置在 `configs/agent.local.yaml`：

```yaml
llm:
  model_provider: openai
  model: <YOUR_LLM_MODEL>
  base_url: <YOUR_LLM_BASE_URL>
  api_key: <YOUR_API_KEY>

image:
  model: <YOUR_IMAGE_MODEL>
  base_url: <YOUR_IMAGE_BASE_URL>
  api_key: <YOUR_API_KEY>

video:
  model: <YOUR_VIDEO_MODEL>
  base_url: <YOUR_VIDEO_BASE_URL>
  api_key: <YOUR_API_KEY>
```

---

## 四、系统架构概览

ViMax 的系统可以分成四层：

```
┌─────────────────────────────────────────┐
│         输入层 (Input Layer)             │
│  想法 / 剧本 / 小说 / 参考图 / 风格指令  │
├─────────────────────────────────────────┤
│      中央协调器 (Orchestration)          │
│  任务调度 / 阶段切换 / 资源管理 / 重试   │
├─────────────────────────────────────────┤
│         Agent 工作层                     │
│  脚本理解 → 分镜设计 → 资产管理 → 生成   │
│  一致性检查 → 视频合成                    │
├─────────────────────────────────────────┤
│         输出层 (Output Layer)            │
│  画面 / 视频片段 / 日志 / 工作目录文件   │
└─────────────────────────────────────────┘
```

关键组件说明：

| 组件 | 作用 |
|---|---|
| 脚本理解 | 提取角色、环境、场景边界、风格意图 |
| 分镜设计 | 根据目标生成镜头列表和关键帧 |
| 资产管理 | 选择和管理参考图，建立索引 |
| 一致性机制 | 跨场景跟踪角色和环境状态 |
| 画面生成 | 根据参考图和提示词自动生成画面 |
| VLM 质检 | 用视觉语言模型检查画面质量 |
| 并行生成 | 同一镜头的多画面并行处理 |

---

## 五、四种使用模式

ViMax 提供了四种不同的使用方式，覆盖从创意到成品的完整链条：

**Idea2Video（想法→视频）**：输入一个简单想法，自动完成整个创作流程。适合快速原型。

**Novel2Video（小说→视频）**：输入一本小说，自动提取叙事线索，生成剧集式视频。适合文学改编。

**Script2Video（剧本→视频）**：输入已有剧本，按需生成视频。适合有明确创作意图的场景。

**AutoCameo（自拍客串）**：上传自己的照片，把自己变成视频中的角色。适合创作互动式个人视频。

---

## 六、技术栈

- **语言**：Python 3.12+，使用 uv 管理环境
- **许可证**：MIT
- **论文**：arXiv:2606.07649 (2026-06-02)
- **作者**：Lingxuan Huang, Sizhe He, Hengji Zhou, Liqiang Nie, Lianghao Xia, Chao Huang（香港大学数据科学实验室）
- **依赖**：LLM API（OpenAI / Google Gemini 等）、图像生成 API、视频生成 API

---

## 七、总结

ViMax 的核心贡献在于：**把视频创作的复杂性从"人工协调"变成了"Agent 自动协作"**。

它不追求用一个大模型搞定一切，而是承认视频创作包含多个专业环节，每个环节由专门的 Agent 处理，再通过中央协调器统一管理。这种设计让系统能够处理长视频、保持角色一致性、并且可以灵活替换各个环节的模型。

对于初学者来说，理解 ViMax 的关键是记住一句话：**它不是一个视频生成模型，而是一个指挥多个 AI 模型一起拍视频的"导演系统"。**

---

## 思考题

1. ViMax 的多 Agent 架构和直接用一个大模型生成视频，各有什么优缺点？
2. 为什么 ViMax 要用 RAG（检索增强生成）来处理长剧本？
3. 角色一致性检查在视频生成中为什么难？ViMax 是怎么解决的？
