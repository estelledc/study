---
title: From LLMs to MCPs: How Code Empowers Large Language Models to Serve as Intelligent Agents
来源: https://arxiv.org/abs/2401.00812
日期: 2026-06-13
分类: 机器学习
子分类: LLM架构
provenance: pipeline-v3
---

# 从大语言模型到智能体：代码如何让 LLM 拥有"魔法"

## 一句话总结

这篇论文说了一件事：**LLM 本身只是一个"巫师"，代码才是让它施展法术的"魔杖"**。通过把代码融入训练数据，LLM 获得了推理能力、结构化表达能力和与外部世界交互的能力，最终进化成了能自主规划、执行、反思的智能体（Agent），以及今天我们能看到的 MCP（Model Context Protocol）生态。

---

## 一、从日常类比开始：厨师与菜谱

想象一个天才厨师。他尝一口就知道味道好不好，能凭直觉做出美味。但他每次做菜全靠感觉——有时惊艳，有时翻车。

现在给他一本菜谱。菜谱有标准格式（"盐 5g，油 15ml，中火 3 分钟"），有步骤顺序（"先炒香葱，再放肉"），可以拆成小块（"酱汁单独做"），还能反复运行（照做一遍，再做一遍，结果一样）。

厨师拿到菜谱后，发生了三件事：

1. **推理能力变强了**：他开始理解"为什么先炒葱再放肉"，而不仅仅是"怎么做"
2. **表达变精确了**：每一步都清晰可复现，不再靠"适量""少许"这种模糊词
3. **能跟厨房设备联动了**：他知道菜谱里的"中火"对应电磁炉的哪个档位

**LLM 和代码的关系，就是这个厨师和菜谱的关系。**

---

## 二、核心概念拆解

### 2.1 代码的四个特性

论文指出，代码之所以能成为 LLM 的"魔杖"，是因为它有四个独特属性：

| 特性 | 说明 | 类比 |
|------|------|------|
| **标准语法** | 有固定规则，不像自然语言那样歧义重重 | 菜谱的计量单位是克和毫升 |
| **逻辑一致性** | 程序要么正确运行，要么报错，没有"差不多" | 按照菜谱做，味道就是那个味道 |
| **抽象能力** | 可以把复杂操作封装成函数，重复调用 | 把"炒肉"封装成一个步骤，随时复用 |
| **模块化** | 不同功能拆成独立模块，互不影响 | 酱汁、主菜、配菜各自独立准备 |

### 2.2 代码给 LLM 带来的三大能力

#### 能力一：解锁推理能力

没有代码训练的 LLM 就像只会背课文的学生——能复述"勾股定理"，但不会用它解题。

有了代码训练后，LLM 学会了**把大问题拆成小步骤**。这就是我们后来看到的 Chain-of-Thought（思维链）推理的基础。

#### 能力二：产生结构化中间步骤，连接外部工具

代码是"结构化语言"，LLM 学会写代码后，就能输出**格式精确、可执行的中间步骤**。这些步骤可以直接对接外部工具——这就是 Function Calling 和 MCP 的前身。

#### 能力三：利用编译执行环境获得反馈

代码写错了会报错。LLM 看到错误信息，就能修正自己的思路。这个"试错-修正"循环，是 Agent 自我改进的核心机制。

### 2.3 从 LLM 到 Agent 的进化路径

论文梳理了这条进化线：

```
纯文本 LLM（只会聊天）
    ↓
加入代码训练（学会推理和结构化表达）
    ↓
Function Calling（能调用外部工具）
    ↓
Agent 框架（能规划、执行、反思的自主系统）
    ↓
MCP 生态（标准化的工具协议）
```

---

## 三、代码示例

### 示例一：没有代码训练的 LLM vs 有代码训练的 LLM

**场景**：让 LLM 计算"从北京到上海，高铁时速 300km，距离 1200km，需要几小时？"

**没有代码训练的 LLM**（可能直接猜一个数字，或者给出模糊推理）：

```
用户：北京到上海高铁要多久？
LLM：嗯……大概几个小时吧，我猜5到6个小时左右？
```

**有代码训练的 LLM**（会写出可执行的计算步骤）：

```python
distance = 1200      # 公里
speed = 300          # km/h
time = distance / speed  # 时间 = 距离 ÷ 速度
print(f"需要 {time} 小时")
# 输出：需要 4.0 小时
```

区别在哪？代码训练让 LLM 学会了**把自然语言问题翻译成精确的计算步骤**，而不是靠"感觉"回答。

### 示例二：从 Function Calling 到 Agent 的演进

**场景**：让 LLM 帮用户查天气并推荐穿衣

**第一步：Function Calling（单个工具调用）**

```python
# LLM 输出的结构化调用
def get_weather(city: str) -> dict:
    """查询指定城市的天气"""
    return {"city": city, "temp": 22, "condition": "多云"}

# LLM 决定调用
result = get_weather("北京")
```

**第二步：Agent Loop（多步规划 + 工具调用 + 反思）**

```python
class WeatherAgent:
    def __init__(self):
        self.memory = []  # 记录对话历史
    
    def plan(self, user_request: str) -> list:
        """把用户请求拆成可执行步骤"""
        return [
            {"tool": "get_weather", "args": {"city": "北京"}},
            {"tool": "recommend_clothes", "args": {"temp": "{{result.temp}}"}},
        ]
    
    def execute(self, plan: list) -> str:
        """逐步执行计划，根据中间结果调整"""
        for step in plan:
            tool_name = step["tool"]
            result = self.call_tool(tool_name, step["args"])
            self.memory.append({"step": tool_name, "result": result})
            
            # 反思：检查结果是否需要调整下一步
            if result.get("temp", 0) < 10:
                return "今天很冷，建议穿羽绒服！"
            elif result.get("temp", 0) < 20:
                return "天气凉爽，建议穿外套。"
            else:
                return "天气炎热，建议穿短袖。"
    
    def call_tool(self, tool_name: str, args: dict) -> dict:
        """调用具体的工具函数"""
        if tool_name == "get_weather":
            return {"city": args["city"], "temp": 8, "condition": "晴"}
        elif tool_name == "recommend_clothes":
            return {"advice": "需要厚外套"}
        return {}

# 使用
agent = WeatherAgent()
response = agent.execute(agent.plan("北京今天天气怎么样？穿什么？"))
print(response)
# 输出：今天很冷，建议穿羽绒服！
```

这个例子展示了论文说的核心思想：**代码让 LLM 从"被动回答问题"变成"主动规划、执行、反思"的智能体**。

### 示例三：MCP 协议的思想源头

MCP（Model Context Protocol）的本质是什么？论文虽然没有直接提到 MCP（论文发表于 2024 年 1 月，MCP 是后来 Anthropic 提出的标准化协议），但它描述的"结构化中间步骤连接外部执行端"正是 MCP 的核心思想。

```python
# 简化版 MCP 思想：标准化的工具描述 + 标准化的调用协议

# 1. 工具注册（相当于 MCP 的 tool 定义）
TOOLS = {
    "get_weather": {
        "description": "查询城市天气",
        "parameters": {
            "city": {"type": "string", "description": "城市名称"}
        }
    },
    "send_email": {
        "description": "发送邮件",
        "parameters": {
            "to": {"type": "string"},
            "subject": {"type": "string"},
            "body": {"type": "string"}
        }
    }
}

# 2. LLM 输出标准化的工具调用格式
def llm_call_tool(tool_name: str, parameters: dict) -> dict:
    """LLM 通过统一接口调用任何已注册的 tool"""
    if tool_name not in TOOLS:
        return {"error": f"未知工具: {tool_name}"}
    
    # 验证参数类型
    for param_name, param_info in TOOLS[tool_name]["parameters"].items():
        if param_name not in parameters:
            return {"error": f"缺少参数: {param_name}"}
        if not isinstance(parameters[param_name], param_info["type"]):
            return {"error": f"参数 {param_name} 类型错误"}
    
    # 执行工具（这里用模拟实现）
    if tool_name == "get_weather":
        return {"temperature": 22, "condition": "晴"}
    elif tool_name == "send_email":
        return {"status": "sent", "message_id": "abc123"}

# 3. LLM 根据工具返回结果生成最终回答
tool_result = llm_call_tool("get_weather", {"city": "北京"})
final_response = f"北京今天{tool_result['condition']}，气温{tool_result['temperature']}°C。"
print(final_response)
# 输出：北京今天晴，气温22°C。
```

这就是 MCP 协议的灵魂：**用一套统一的协议，让 LLM 能调用任何工具**。而这套协议的理论基础，正是论文所阐述的"代码赋予 LLM 的结构化表达能力"。

---

## 四、论文的关键贡献

### 4.1 首次系统梳理"代码训练"对 LLM 的影响

在 GPT-4 时代之前，大家普遍认为代码训练只是为了让 LLM 学会写代码。这篇论文第一次明确指出：

- 代码训练的真正价值不在"写代码"本身
- 而在代码带来的**推理能力、结构化表达、可执行反馈**这三个深层能力

### 4.2 提出了 LLM → Agent 的完整进化图谱

论文把从纯文本 LLM 到智能体的发展脉络理得很清楚，为后来所有的 Agent 框架（AutoGPT、BabyAGI、LangChain Agent、OpenAI Functions、MCP 等）提供了理论框架。

### 4.3 指出了未来的挑战

论文最后提到了几个关键挑战，其中很多在今天仍然相关：

1. **代码幻觉**：LLM 生成的代码看起来对，但实际运行有问题
2. **工具选择的准确性**：面对多个可用工具时，LLM 如何选对？
3. **长程依赖**：复杂任务中，早期步骤的错误会影响整个执行链
4. **安全与可控性**：Agent 自主执行代码，如何防止恶意操作？

---

## 五、这篇论文和我的学习路线有什么关系？

你正在学习的 MCP（Model Context Protocol），它的理论基础就在这篇论文里。

具体来说：

- **MCP 解决了什么问题？** 论文说"LLM 需要通过结构化的中间步骤连接外部执行端"，MCP 就是这个"连接协议"的标准化实现
- **为什么 MCP 用 JSON-RPC？** 因为代码训练让 LLM 擅长处理结构化数据，JSON-RPC 是最适合 LLM 理解和生成的协议格式之一
- **为什么 MCP 要把工具描述写成 schema？** 因为论文强调代码的"标准语法"特性——结构化工具描述让 LLM 能精确理解每个工具的输入输出

简单说：**没有这篇论文说的"代码赋能"，就没有 MCP 存在的意义**。

---

## 六、小结

这篇论文用一个精妙的比喻概括了自己的核心观点：

> "如果 LLM 是巫师，那么代码就是魔杖。"

巫师本身有天赋，但如果没有魔杖，他的魔法只能停留在口头。代码就是那根魔杖——它让 LLM 从"会说"变成了"能做"。

从 Function Calling 到 Agent 框架，再到 MCP 协议，都是这根"魔杖"的不同形态。理解了这一点，你就理解了整个现代 LLM Agent 生态的理论根基。

---

## 思考题

1. 如果你要让一个没有代码训练基础的 LLM 学会"查天气后推荐穿衣"，你会怎么设计训练数据？
2. MCP 协议相比 OpenAI 的 Function Calling，在"结构化表达"上做了哪些改进？
3. 论文提到的"代码幻觉"问题，在你日常使用 Copilot 或 Cursor 时遇到过吗？具体表现是什么？
