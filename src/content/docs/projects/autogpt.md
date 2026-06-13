---
title: AutoGPT 学习笔记 —— 让 AI 自己干活
来源: https://github.com/Significant-Gravitas/AutoGPT
日期: 2026-06-13
分类: 机器学习
子分类: 数据科学与 AI
provenance: pipeline-v3
---

## 什么是 AutoGPT

想象你有一个实习生，你说一句"帮我调研一下最近 Reddit 上关于 AI 的热门话题，做成一份简报"，这个实习生会自己上网搜索、阅读、整理、写成文档，全程不用你盯着。

AutoGPT 就是这样一种工具 —— 它让大语言模型（LLM）不再只是"你说一句、它回一句"的聊天机器人，而是能**自己决定下一步做什么、一直干到完成目标**的"智能体"（Agent）。

核心仓库：https://github.com/Significant-Gravitas/AutoGPT，GitHub Star 超过 18 万。

## 核心概念

AutoGPT 的核心思想可以拆成四个字：**目标驱动**。

传统聊天机器人的工作流程是线性的：你提问，它回答。AutoGPT 的工作流程是一个循环，叫 "Act-Observation-Reason" 循环：

1. **感知**：拿到当前状态（有什么文件、搜索结果、网页内容）
2. **决策**：问自己"下一步该做什么"
3. **行动**：执行一个具体操作（搜索、读文件、写文件、调 API）
4. **观察**：看行动的结果
5. 回到第 2 步，直到完成目标或达到上限

这个循环的关键在于：**每一步做什么，都由模型自己决定**，而不是写死的程序流程。

### 三大组件

| 组件 | 作用 | 类比 |
|------|------|------|
| 大脑（LLM） | 做决策、生成计划 | 实习生的脑子 |
| 工具箱（Commands） | 能做的事情的集合 | 搜索、写文件、调 API |
| 记忆（Memory） | 记住之前做过什么 | 实习生的小本本 |

## 两种形态

AutoGPT 现在有两套系统：

**AutoGPT Classic（原版）**：基于 `forge` 框架，用 Python 构建，适合想自己写智能体的开发者。你给它一个目标，它自己分解步骤、执行操作。

**AutoGPT Platform（新版）**：基于可视化的"积木"（Blocks）界面，拖拽连接就能创建智能体，不写代码也能用。

下面以 Classic 版本为例，看看怎么搭起来。

## 环境搭建

AutoGPT Classic 的运行依赖几个东西：

- Python 环境（推荐用 poetry 管理）
- 一个 OpenAI API Key（或者其他 LLM 提供商的 key）
- Docker（如果需要平台版本）

最简单的启动方式：

```bash
# 进入 classic 目录
cd classic

# 安装依赖
poetry install

# 配置 API Key
cp .env.example .env
# 编辑 .env，填入你的 OPENAI_API_KEY

# 启动
poetry run python -m forge
```

启动后，智能体服务运行在 `http://localhost:8000`。

## 权限系统 —— 给智能体划范围

AutoGPT 最聪明的设计之一是**权限控制**。你想让一个实习生做任务，你不会给它公司保险柜的密码。AutoGPT 同理：

```yaml
# .autogpt/autogpt.yaml（工作区级别的权限）
allow:
  - read_file({workspace}/**)        # 可以读工作区里的任何文件
  - write_to_file({workspace}/**)    # 可以写文件到工作区
  - list_folder({workspace}/**)      # 可以查看工作区目录
  - web_search(*)                    # 可以做任何网络搜索

deny:
  - read_file(**.env)               # 不能读 .env 文件（保护密钥）
  - read_file(**.key)               # 不能读密钥文件
  - execute_shell(rm -rf:*)         # 不能执行删除命令
  - execute_shell(sudo:*)           # 不能执行 sudo
```

权限检查的顺序是：先看"拒绝列表"，再看"允许列表"，最后如果都不匹配，就**停下来问用户**。这种设计保证了智能体不会越权操作。

## 代码示例

### 示例一：构建一个简单的智能体

下面是用 Forge 框架创建自定义智能体的核心代码：

```python
from forge.agent.base import BaseAgent, BaseAgentSettings
from forge.config.ai_profile import AIProfile

# 第一步：定义智能体的"人设"
state = BaseAgentSettings(
    name="代码审查员",                          # 名字
    description="专门审查 Python 代码的智能体",    # 描述
    ai_profile=AIProfile(
        ai_name="Reviewer",                      # AI 名称
        ai_role="Senior Python Code Reviewer",   # AI 角色
        ai_goals=[                               # AI 的目标
            "审查 Python 代码的质量和问题",
            "提出具体的改进建议",
        ],
    ),
    task="审查给定 Python 项目的代码质量",       # 当前任务
)

# 第二步：给智能体配置工具箱（组件）
self.system = SystemComponent()        # 提供"完成任务"指令
self.todo = TodoComponent()            # 管理多步骤任务
self.data_processor = DataProcessorComponent()  # 处理数据
self.http_client = HTTPClientComponent()        # 发起 HTTP 请求
```

这里的关键是 `ai_goals` —— 你不需要告诉智能体每一步怎么做，只需要告诉它**最终要达成什么目标**。智能体会自己拆解任务。

### 示例二：智能体的核心决策循环

智能体最核心的代码在 `execute_step` 方法里。简化版逻辑如下：

```python
async def execute_step(self, task_id: str, step_request: StepRequestBody) -> Step:
    """
    执行一个步骤：这是智能体循环的核心。
    每次被调用时，智能体需要做三件事：
    1. 看当前状态
    2. 决定下一步行动
    3. 执行并返回结果
    """
    # 获取当前任务信息
    task = await self.db.get_task(task_id)

    # 智能体的决策循环（简化版）：
    while not self.finished:
        # 感知：收集当前上下文
        messages = self._get_messages()          # 之前的对话历史
        memory = self._get_memory()              # 短期记忆
        commands = function_specs_from_commands(self.commands)  # 可用工具列表

        # 决策：让 LLM 决定下一步
        response = await self.llm.ask(
            prompt=ChatPrompt(messages=messages),
            functions=commands,       # 把可用工具传给模型
        )

        # 行动：执行模型选择的工具
        if response.function_call:
            result = await self._execute_command(
                response.function_call.name,
                response.function_call.arguments,
            )

            # 观察：把结果反馈给模型
            messages.append({
                "role": "function",
                "name": response.function_call.name,
                "content": str(result),
            })

    return Step(...)
```

这个循环展示了 AutoGPT 的核心：模型不是直接回答，而是**从工具列表中挑选一个来调用**，然后看结果，再决定下一个工具。就像一个人用 Google、打开文件管理器、写文档，反复循环直到任务完成。

## 关键术语表

| 术语 | 含义 |
|------|------|
| Agent | 智能体，即 AutoGPT 运行的 AI 程序 |
| Command | 命令，智能体能执行的具体操作（搜索、写文件等） |
| Component | 组件，封装一组相关功能的模块 |
| Workspace | 工作区，智能体的"办公室"，文件存在这里 |
| Forge | 构建智能体的框架/工具包 |
| Agent Protocol | 智能体协议，定义了任务创建和执行的 API 标准 |
| LLM | 大语言模型，即智能体的"大脑" |

## 学习小结

AutoGPT 的核心价值不在于"它比 ChatGPT 聪明"，而在于**它把一次性对话变成了一个自主的工作流**。你只需要说"做什么"，它自己决定"怎么做"。

对于零基础的初学者，理解这一点就够了：AI 正在从"问答工具"变成"做事工具"。AutoGPT 是目前这个方向最成熟的开源实现之一。

## 下一步

- 跑一遍 `poetry run python -m forge`，亲眼看看智能体怎么工作
- 读 Forge 教程系列：https://aiedge.medium.com/autogpt-forge-e3de53cc58ec
- 试试新版平台（https://docs.agpt.co），拖拽积木创建智能体
