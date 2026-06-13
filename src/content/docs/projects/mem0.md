---
title: Mem0 — 给 AI 助手装一个"长久记忆"
来源: https://github.com/mem0ai/mem0
日期: 2026-06-13
分类: 机器学习
子分类: 数据科学与 AI
provenance: pipeline-v3
---

## 从"金鱼记忆"说起

你用过 ChatGPT 吗？它有一个问题：每次打开新对话，它就彻底失忆了。它不记得你昨天说过"我不吃辣"，也不记得上周你提到自己在学 Python。

这种"聊完就忘"的现象，在 AI 领域叫没有**长期记忆（Long-Term Memory）**。

Mem0（读作"mem-zero"）要做的事很简单：给 AI 装一个记忆系统。就像你真的有个朋友，虽然隔了一周没见，但他依然记得你的喜好、你上次的决定、你提过的目标。

Mem0 由 Y Combinator S24 孵化，开源协议是 Apache 2.0。

## 核心概念

### 1. 三层记忆（Multi-Level Memory）

Mem0 把记忆分成三层，每一层对应不同的范围：

| 层级 | 类比 | 说明 |
|------|------|------|
| **User Memory** | 你的个人档案 | 跨所有对话持久存储的用户偏好、习惯、身份 |
| **Session Memory** | 一次聊天的上下文 | 当前会话内的临时记忆，会话结束自动清理 |
| **Agent Memory** | 助手自己的经验 | AI 助手从执行任务中学到的决策和事实 |

### 2. 信息提取 → 冲突解决 → 存储

Mem0 存储记忆不是简单地把对话原文存起来，而是走一个三步流水线：

1. **信息提取（Inference）**：LLM 从对话中"读懂"关键事实。比如你说"我最近在减肥"，Mem0 会提取出"正在减肥"这个结构化记忆，而不是存整句话。
2. **冲突解决（Conflict Resolution）**：如果新信息和旧记忆矛盾，取最新的。比如你之前说"我喜欢咖啡"，后来又说"我不喝咖啡了"，Mem0 会更新。
3. **向量化存储（Vector Storage）**：提取的记忆存入向量数据库（如 Qdrant），这样未来可以用语义搜索找到相关记忆。

### 3. 混合搜索（Multi-Signal Retrieval）

找记忆时，Mem0 不只是做语义匹配，而是同时用三种信号：

- **语义搜索**：理解意思相近（"不爱吃辣" ≈ "口味清淡"）
- **BM25 关键词匹配**：精确匹配关键词
- **实体链接**：识别"张三"、"北京"等实体，跨记忆关联

三种信号并行打分、融合，找到最相关的记忆。

### 4. 时间感知（Temporal Reasoning）

Mem0 能理解"现在"和"过去"。比如你"去年养了一只猫，但今年把它送人了"，当被问到"你有什么宠物"，Mem0 会根据时间判断——你现在没有宠物了。

## 代码示例

### 示例一：用 Python 快速上手

这是最基础的用法：初始化记忆、添加记忆、搜索记忆。

```python
import os
from mem0 import Memory

# 设置你的 OpenAI API Key（开源版默认用 OpenAI）
os.environ["OPENAI_API_KEY"] = "sk-xxxx"

# 创建记忆实例
memory = Memory()

# 第一步：添加一段对话，Mem0 会自动提取关键事实
messages = [
    {"role": "user", "content": "我不吃猪肉，而且对海鲜过敏。"},
    {"role": "assistant", "content": "好的，我会记住你的饮食偏好。"}
]
memory.add(messages, user_id="alice")
# 返回: ["ate_no_pork", "allergic_to_seafood"] — 提取出的记忆 ID

# 第二步：再加一条新信息
messages2 = [
    {"role": "user", "content": "我最近在学 Python，目标是三个月内写完一个小项目。"},
    {"role": "assistant", "content": "很棒的计划！我会帮你记录这个目标。"}
]
memory.add(messages2, user_id="alice")

# 第三步：搜索相关记忆
results = memory.search("Alice 有什么饮食限制？", filters={"user_id": "alice"})
print(results["results"])
# 输出包含: "不吃猪肉"、"对海鲜过敏" 两条记忆
```

### 示例二：把记忆接入 AI 对话

这是 Mem0 最有价值的用法——让 AI 在每次回答时"想起"用户的信息。

```python
from openai import OpenAI
from mem0 import Memory

openai = OpenAI()
memory = Memory()

def chat_with_memory(user_message, user_id="alice"):
    # 1. 从记忆中检索相关信息
    memories = memory.search(
        user_message,
        filters={"user_id": user_id},
        top_k=3
    )
    memory_list = "\n".join(
        f"- {entry['memory']}" for entry in memories["results"]
    )

    # 2. 把记忆拼入 system prompt
    system_prompt = (
        "你是一个贴心的 AI 助手。"
        "在回答问题时，请参考以下用户信息：\n"
        f"{memory_list}\n"
        "如果记忆和用户当前问题相关，请优先使用这些信息进行个性化回答。"
    )

    # 3. 发送给 LLM 生成回答
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_message}
    ]
    response = openai.chat.completions.create(
        model="gpt-5-mini", messages=messages
    )

    # 4. 记住这次对话（下次还能想起来）
    assistant_reply = response.choices[0].message.content
    memory.add(
        [
            {"role": "user", "content": user_message},
            {"role": "assistant", "content": assistant_reply}
        ],
        user_id=user_id
    )

    return assistant_reply

# 效果演示：
# print(chat_with_memory("今晚吃什么好？"))
# → AI 会想起"不吃猪肉、对海鲜过敏"，给出适合的推荐
```

### 示例三：平台版（Cloud 托管）

如果你不想自己部署基础设施，Mem0 提供托管服务，用法更简单：

```python
from mem0 import MemoryClient

# 只需一个 API Key
client = MemoryClient(api_key="your-mem0-api-key")

# 添加记忆
client.add(
    messages=[
        {"role": "user", "content": "我住在北京，喜欢科幻电影。"},
        {"role": "assistant", "content": "记住了！"}
    ],
    user_id="bob",
    metadata={"category": "profile"}  # 可选：打标签方便筛选
)

# 搜索记忆（支持复杂过滤器）
results = client.search(
    "bob 的喜好是什么？",
    filters={"user_id": "bob"}
)

# 更新记忆
client.update("bob", "14e1b28a-...", memory="开始健身了")

# 删除记忆
client.delete("bob", "14e1b28a-...")
```

## 三种使用方式

Mem0 提供三种部署模式，像乐高一样按需选择：

| 方式 | 适合场景 | 运维成本 |
|------|---------|---------|
| **Library（pip / npm）** | 本地测试、原型验证 | 零，纯代码 |
| **Self-Hosted（Docker）** | 团队内部部署，数据自控 | 中，需要维护向量数据库 |
| **Cloud Platform** | 生产环境，不想管运维 | 低，即开即用 |

## 一句话总结

Mem0 的本质 = 一个中间件层，截获你和 AI 的对话，自动提取关键信息存在向量库里，下次对话时帮你"找回"相关信息拼进 prompt。它不关心你用什么 LLM、什么框架，只要输入对话、输出记忆，是个可以插到任何 AI 应用里的"记忆插件"。
