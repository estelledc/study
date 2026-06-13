---
title: "ViMax：一个导演+编剧+制片人的AI视频生成系统"
来源: https://github.com/HKUDS/ViMax
日期: 2026-06-13
分类: 机器学习
子分类: 模型与训练
provenance: pipeline-v3
---

# ViMax：一个导演+编剧+制片人的AI视频生成系统

## 一、开场类比：拍电影需要几个人？

假设你要拍一部短片，你需要：

1. **编剧**：把"一只猫和一只狗是好朋友"这个想法，写成有情节、有人物的故事
2. **导演**：设计分镜、决定每个镜头的角度和节奏
3. **制片人**：准备角色设定图、背景参考图、保证角色从头到尾长得一样
4. **摄影师**：实际拍摄（生成）每一个画面和镜头

传统 AI 视频工具只做了第 4 步——你给一段描述，它生成几秒视频。角色会突然变脸、场景会凭空消失、没有声音和故事。

**ViMax 做的事情是：把这四个角色全部用 AI Agent 实现，你只需要说一句"我要拍什么"，剩下的全部自动化。**

这个项目来自香港大学数据科学实验室（HKUDS），GitHub 上已经接近 10,000 星。

---

## 二、核心概念：多 Agent 流水线

ViMax 的核心设计是一个 **Agent 流水线**（Pipeline），每个 Agent 负责一个专业环节，像工厂的流水线一样一个接一个工作。

```
用户想法 → [编剧Agent] → [角色提取Agent] → [角色绘图Agent]
                              → [分镜Agent] → [场景图生成Agent] → [视频生成Agent]
                                                              → [拼接成完整视频]
```

每一步的输出都是下一步的输入，中间结果会保存到 `.working_dir` 目录，这样就算中途断了也能断点续传。

---

## 三、ViMax 的三种工作模式

### 1. Idea2Video（想法→视频）

你给一个"脑洞"，它帮你完成所有步骤。

```python
# main_idea2video.py
from pipelines.idea2video_pipeline import Idea2VideoPipeline

idea = """
一只猫和一只狗是好朋友，它们遇到了一只新猫会怎样？
"""
user_requirement = """
给小朋友看的，不超过3个场景。"""
style = "Cartoon"

pipeline = Idea2VideoPipeline.init_from_config(config_path="configs/idea2video.yaml")
await pipeline(idea=idea, user_requirement=user_requirement, style=style)
```

运行之后，ViMax 会依次调用：
- **Screenwriter**：把"脑洞"扩展成一个有起承转合的完整故事
- **CharacterExtractor**：从故事中提取所有角色（名字、外貌、穿着）
- **CharacterPortraitsGenerator**：为每个角色画正面/侧面/背面三视图
- **StoryboardArtist**：设计每个场景的分镜
- **VideoGenerator**：逐镜头生成视频，最后拼接

### 2. Script2Video（剧本→视频）

如果你已经有了写好的剧本，可以直接进入场景到视频的生成环节。

```python
# main_script2video.py
script = """
EXT. 学校体育馆 - 白天
一群学生正在体育馆练习篮球。约翰（18岁，高个，运动员体型）是主力球员，
正在练习运球和投篮。简（17岁，矮个，运动员体型）是助理教练，
在帮助约翰练习。其他学生在观看并为他加油。
约翰：（运球）我要进球了！
简：（微笑）干得好，约翰！
"""
user_requirement = """
节奏快，不超过20个镜头。"""
style = "Animate Style"

pipeline = Script2VideoPipeline.init_from_config(config_path="configs/script2video.yaml")
await pipeline(script=script, user_requirement=user_requirement, style=style)
```

### 3. Agent TUI（交互式对话）

ViMax 还提供了一个命令行交互界面，你可以和 Agent 对话、迭代、修改，直到满意为止。

```bash
# 先配置模型
vimax tui new

# 或者回复之前的对话
vimax tui resume <session_id>

# 对话中压缩上下文
/compact
```

---

## 四、关键技术细节

### 角色一致性：ViMax 的杀手锏

最头疼的问题是：AI 生成的视频里，角色第1帧穿红衣服，第10帧变成蓝衣服了。

ViMax 的做法是：

1. **提取角色**：用 LLM 从故事中抽取每个角色的静态特征（身高、发色、体型）和动态特征（穿着、配饰）
2. **三视图生成**：为每个角色生成正面、侧面、背面三张参考图，存为 `front.png`、`side.png`、`back.png`
3. **智能参考选择**：生成每个镜头时，自动从前面的帧中挑选最匹配的参考图，保证角色一致性
4. **一致性检查**：用视觉模型（VLM）批量生成多张图，选出最一致的那张

```python
# CharacterExtractor 用 Pydantic 保证输出结构化
class ExtractCharactersResponse(BaseModel):
    characters: List[CharacterInScene] = Field(
        ...,
        description="从剧本中提取的所有角色列表"
    )
```

### 技术栈

| 组件 | 工具 |
|------|------|
| Agent 框架 | LangChain（ChatModel + Pydantic 输出解析） |
| 重试机制 | Tenacity（指数退避重试） |
| 环境管理 | uv（类似 pip 但更快） |
| 环境要求 | Python 3.12+ |

---

## 五、配置文件示例

ViMax 的模型配置在 YAML 文件中：

```yaml
# configs/idea2video.yaml
chat_model:
  init_args:
    model: google/gemini-2.5-flash-lite-preview-09-2025
    model_provider: openai
    api_key: YOUR_API_KEY
    base_url: https://openrouter.ai/api/v1
  max_requests_per_minute: 500
  max_requests_per_day: 2000

image_generator:
  class_path: tools.ImageGeneratorNanobananaGoogleAPI
  init_args:
    api_key: YOUR_IMAGE_API_KEY
  max_requests_per_minute: 10

video_generator:
  class_path: tools.VideoGeneratorVeoGoogleAPI
  init_args:
    api_key: YOUR_VIDEO_API_KEY
  max_requests_per_minute: 2
```

支持多种模型提供者：OpenAI、Google、OpenRouter 等，灵活切换。

---

## 六、总结

ViMax 的本质思路是：**把拍电影的流程拆解成多个专业 Agent，每个 Agent 只做好一件事，串联起来就是一部完整的短片。**

它解决的不是"能不能生成视频"，而是"能不能生成一个角色一致、有故事、有结构、有音频的完整作品"。

对零基础学习者来说，理解 ViMax 的关键是抓住两点：

1. **流水线思维**：复杂问题 → 拆分成小步骤 → 每步专业化解决
2. **结构化输出**：用 Pydantic 保证 Agent 的输出格式固定，让下游 Agent 能直接消费

---

*下一问：你觉得这个流水线中，哪个环节最难设计？为什么？*
