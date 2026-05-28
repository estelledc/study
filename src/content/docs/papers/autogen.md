---
title: AutoGen — Enabling Next-Gen LLM Applications via Multi-Agent Conversation
slug: papers/autogen
description: ConversableAgent + GroupChatManager 把多 agent 协作抽象成可编排的对话，奠定 2024 年 multi-agent framework 范式
sidebar:
  order: 6
  label: AutoGen 状元篇
season: L
layer: L2
branch: method-A
---

import { Image } from 'astro:assets';

## Layer 0 — 一句话指纹

| 字段 | 内容 |
|------|------|
| 论文 | AutoGen: Enabling Next-Gen LLM Applications via Multi-Agent Conversation |
| 作者 | Qingyun Wu, Gagan Bansal, Jieyu Zhang, Yiran Wu, Beibin Li, Erkang Zhu, Li Jiang, Xiaoyun Zhang, Shaokun Zhang, Jiale Liu, Ahmed Awadallah, Ryen W. White, Doug Burger, Chi Wang |
| 单位 | Microsoft Research / Penn State / Univ. of Washington |
| 年份 | 2023-08 v1（arXiv 2308.08155）/ 2024 ICLR-Workshop（COLM 拒）/ 2024-Q4 0.4 重写 |
| 入口 | arXiv 2308.08155；OpenReview LLM Agents Workshop；GitHub microsoft/autogen |
| 类型 | method / system（不是 benchmark，不是 survey） |
| 影响 | 截至 2024-12 GitHub ≥ 30k stars（仓库 v0.2 时期 13k → 0.4 重写后 32k+），Apache-2.0 |
| 范畴 | Multi-Agent Conversation Framework；ConversableAgent + GroupChatManager + Code Executor 三件套 |
| 关键决定 | 把 agent-to-agent 通信抽象成"对话消息"而不是"函数调用"，让人/工具/agent 走同一接口 |
| 复现状态 | 本人 2-agent quickstart 已跑通；GroupChat round-robin / LLM-based 两种 next speaker 已切换验证 |
| 我的判断 | 它的真正贡献不是"两个 LLM 互相讲话"，而是把 reply pipeline 抽象成可注册的 hook 链 |

定位：AutoGen 把"多 agent 协作"这个模糊问题，归约成"一个 ConversableAgent 收到 message → 跑一遍 reply_func 链 → 产出下一条 message"的极简循环。所有花活（tool use、code execution、human-in-the-loop、group chat）都是这个循环的扩展。

<Image src="/papers/autogen/01-architecture.webp" alt="AutoGen 架构图：ConversableAgent + GroupChatManager + Tool / Code Executor" width={1200} height={720} />

---

## Layer 1 — Why（这篇为什么必须存在）

2023 上半年的 agent 世界长这样：

- **ReAct（Yao 2022）**：单 agent，thought → action → observation 三段 loop，没有"另一个 agent"的概念。
- **Reflexion（Shinn 2023）**：还是单 agent，加一个 self-reflect 阶段，把失败 trace 喂回 prompt。
- **Voyager（Wang 2023）**：单 agent + 技能库，agent 之间的协作完全没出现。
- **AutoGPT / BabyAGI**：开源火过一阵，但 agent 内部是写死的"planner → executor → critic"三角，要换协作模式得改源码。

这里有个空缺：

> 大家都在做"一个更聪明的 agent"，没人在做"agent 之间怎么讲话"。

讲话这件事看起来简单，但牵扯一堆决定：

1. **谁先讲？** round-robin？manager 决定？还是某个 agent 主动 @ 别人？
2. **讲完谁回？** broadcast 给所有人，还是只回发起人？
3. **回的内容是什么？** 纯文本？还是带 tool call？带代码块要不要执行？
4. **执行了出错怎么办？** 把 stderr 当 observation 喂回去？还是直接 raise？
5. **人怎么插进来？** 全自动？每步都问？只有 tool call 才问？

AutoGen 的答案是：**全部归约成 message + reply_func**。

- 每个 agent 有一个 `receive(message)` 入口和一个 `send(message, recipient)` 出口。
- 每个 agent 内部维护一个 `reply_func_list`，按顺序跑，第一个返回 `(True, reply)` 的就用它。
- 默认注册了 4 个 reply_func：`generate_oai_reply`（调 LLM）/ `generate_code_execution_reply`（跑代码块）/ `generate_tool_calls_reply`（执行 tool）/ `check_termination_and_human_reply`（人工）。
- 用户想加新行为？`register_reply()` 自己塞一个进去就行。

这就是这篇论文的发动机舱——不是 LLM 多聪明，而是**把多 agent 协作压缩到一个 hook 链**，让所有花活都变成"在某个位置插入一个 reply_func"。

> 所以 ReAct 是"一个 agent 怎么思考"，AutoGen 是"多个 agent 怎么轮流讲话"——后者承认了 LLM 调用本身就是分布式系统，不再假装是一次函数调用。

---

## Layer 2 — 论文地形（10 分钟看完全貌）

| 章节 | 核心内容 | 我的备注 |
|------|---------|---------|
| §1 Introduction | 定义 multi-agent conversation 框架；列举三个 motivating tasks（math problem solving / coding / decision making） | 引言写得很 marketing，能跳 |
| §2 The AutoGen Framework | ConversableAgent / AssistantAgent / UserProxyAgent 三个核心类；reply 流水线；GroupChat | **核心，必读** |
| §3 Applications | 6 个 case study：MathChat / 代码生成 / 在线决策 / 多 agent 写作 / 国际象棋 / 对话式可视化 | 每个 case 看 1 页就够，关键是它们都共用 §2 的接口 |
| §4 Discussion | 为什么是 conversation 而不是 RPC；human-in-the-loop 设计；和 langchain 的对比 | 看作者怎么自我辩护 |
| Appendix | prompt 模板 + 完整代码 + ablation | 复现必看 |

骨架其实就 3 个对象：

```
ConversableAgent          ← 所有 agent 的基类，有 receive/send/reply 三方法
  ├── AssistantAgent      ← 默认装了 LLM reply，不自动跑代码（避免 prompt injection）
  └── UserProxyAgent      ← 默认装了 code execution + human input，不自动调 LLM

GroupChat                 ← 持有 agents 列表 + messages 历史 + 选 speaker 策略
GroupChatManager          ← 一种特殊的 ConversableAgent，receive 时不直接 reply，而是问 GroupChat "下一个该谁讲"
```

记住这个骨架，剩下所有花活都是它的方言。

---

## Layer 3 — 三段精读

### 3.1 ConversableAgent + register_reply（reply 钩子链）

#### Why this snippet

整个 AutoGen 的发动机就在 `ConversableAgent.generate_reply()` 里。这个方法跑一遍 `reply_func_list`，谁先返回 `(True, reply)` 谁就赢。所有"扩展能力"都靠 `register_reply()` 往这个 list 里插钩子。看懂这一段，等于看懂 AutoGen 80%。

#### 代码（基于 [autogen-0.2 conversable_agent.py @ c11d29f5](https://github.com/microsoft/autogen/blob/c11d29f538fb6f2e4e35c4dab6ba395e74e92eda/autogen/agentchat/conversable_agent.py)）

```python
# 简化自 microsoft/autogen @ c11d29f538fb6f2e4e35c4dab6ba395e74e92eda
# python/autogen/agentchat/conversable_agent.py
# 真实代码 ≈ 2000 行，下面是骨架还原

from typing import Callable, Dict, List, Optional, Tuple, Union
from collections import defaultdict

class ConversableAgent:
    """所有 agent 的基类。一个 agent = 一个 reply 钩子链 + 一份消息历史。"""

    def __init__(
        self,
        name: str,
        system_message: str = "You are a helpful AI Assistant.",
        llm_config: Optional[Dict] = None,
        human_input_mode: str = "TERMINATE",  # NEVER / TERMINATE / ALWAYS
        code_execution_config: Optional[Dict] = None,
    ):
        self.name = name
        self._oai_system_message = [{"role": "system", "content": system_message}]
        self.llm_config = llm_config
        self.human_input_mode = human_input_mode
        self._code_execution_config = code_execution_config or {}

        # 每个对话伙伴一份独立历史，按 agent 名字索引
        self._oai_messages: Dict[str, List[Dict]] = defaultdict(list)

        # 关键：reply 钩子链。位置敏感，先注册的先跑
        self._reply_func_list: List[Dict] = []

        # 默认注册 4 个 reply_func，顺序 = 优先级
        self.register_reply([Agent, None], ConversableAgent.generate_oai_reply)
        self.register_reply([Agent, None], ConversableAgent.generate_code_execution_reply)
        self.register_reply([Agent, None], ConversableAgent.generate_tool_calls_reply)
        self.register_reply([Agent, None], ConversableAgent.check_termination_and_human_reply)

    def register_reply(
        self,
        trigger: Union[type, str, list],
        reply_func: Callable,
        position: int = 0,
        config: Optional[Dict] = None,
    ):
        """在 reply 钩子链 position 位置插入一个新钩子。"""
        self._reply_func_list.insert(
            position,
            {"trigger": trigger, "reply_func": reply_func, "config": config},
        )

    def generate_reply(
        self,
        messages: Optional[List[Dict]] = None,
        sender: Optional["ConversableAgent"] = None,
    ) -> Optional[Union[str, Dict]]:
        """跑钩子链，谁先返回 final=True 谁赢。"""
        if messages is None:
            messages = self._oai_messages[sender.name]

        for reply_func_tuple in self._reply_func_list:
            reply_func = reply_func_tuple["reply_func"]
            if not self._match_trigger(reply_func_tuple["trigger"], sender):
                continue
            final, reply = reply_func(self, messages=messages, sender=sender)
            if final:
                return reply
        return self._default_auto_reply  # 兜底，通常是 ""

    def receive(self, message: Union[Dict, str], sender: "ConversableAgent"):
        """收到消息：先存历史，再生成 reply，再 send 出去。"""
        self._append_oai_message(message, role="user", conversation_id=sender.name)
        reply = self.generate_reply(sender=sender)
        if reply is None:
            return  # 终止对话
        self.send(reply, recipient=sender)

    def send(self, message: Union[Dict, str], recipient: "ConversableAgent"):
        """发消息：存自己历史 + 调对方的 receive。"""
        self._append_oai_message(message, role="assistant", conversation_id=recipient.name)
        recipient.receive(message, sender=self)
```

#### 旁注

1. **`_reply_func_list` 是栈不是队列**：`register_reply(position=0)` 是插到最前面，所以**用户后注册的钩子会先跑**——这是有意设计，让用户的自定义逻辑能拦截默认行为。
2. **`_oai_messages` 按 sender 分桶**：同一个 agent 和不同对方讲话，历史是隔离的。这避免了"我和 A 讲的东西被 B 看到"。但也意味着 GroupChat 里 agent 之间的"共识"其实是 GroupChatManager 把同一份历史 broadcast 给每个人。
3. **`receive → reply → send → 对方 receive` 是个递归**：没有事件循环，没有 queue，纯 Python 调用栈。两个 agent 互讲就是 A.send → B.receive → B.send → A.receive，深度可以爆栈，所以 max_turns 必须存在。
4. **trigger 是类型守卫**：`register_reply([Agent, None], func)` 意思是"sender 是 Agent 子类或 None 时才触发"。可以用来做"只有 UserProxy 发来的消息我才跑代码"。
5. **`final` 标志位是关键**：reply_func 返回 `(False, None)` 表示"我搞不定，下一个钩子继续"；返回 `(True, reply)` 表示"我处理了"。这就是责任链模式的教科书实现。

#### 怀疑

> 把 reply_func_list 写成全局栈、用 position=0 插入、又用 trigger 做类型守卫——这个设计太"灵活"了。当用户注册了 5 个 reply_func 后，**调试一条消息为什么走到第 3 个钩子才被处理**会非常痛苦，因为你需要在脑子里跑一遍 5 个 trigger 匹配 + 5 个 reply_func 的 final 判断。0.4 重写时把这套换成显式的 [`AgentRuntime` + 消息订阅模型](https://github.com/microsoft/autogen/blob/c11d29f538fb6f2e4e35c4dab6ba395e74e92eda/python/packages/autogen-core/src/autogen_core/_agent_runtime.py)，我猜就是被这个调试痛点驱动的。

---

### 3.2 GroupChatManager + next speaker selection

#### Why this snippet

两个 agent 互讲已经能解决一半问题，但真实世界的协作通常是"一个 PM + 一个 Engineer + 一个 QA"。AutoGen 的答案是 GroupChat，由 GroupChatManager 决定每轮谁讲。这里的关键是 **next speaker 函数**，它是 multi-agent 编排的"中央调度器"。

#### 代码（基于 [autogen-0.2 groupchat.py @ c11d29f5](https://github.com/microsoft/autogen/blob/c11d29f538fb6f2e4e35c4dab6ba395e74e92eda/autogen/agentchat/groupchat.py)）

```python
# 简化自 microsoft/autogen @ c11d29f538fb6f2e4e35c4dab6ba395e74e92eda
# python/autogen/agentchat/groupchat.py

from dataclasses import dataclass, field
from typing import List, Dict, Optional, Callable, Union
import random

@dataclass
class GroupChat:
    """承载 agent 列表 + 共享消息历史 + 下一发言人策略。"""
    agents: List[ConversableAgent]
    messages: List[Dict] = field(default_factory=list)
    max_round: int = 10
    speaker_selection_method: Union[str, Callable] = "auto"
    # auto = LLM-based / round_robin / random / manual = human pick

    def select_speaker(
        self,
        last_speaker: ConversableAgent,
        selector: "GroupChatManager",
    ) -> ConversableAgent:
        """决定下一个发言人。这是整个 GroupChat 的核心策略点。"""

        method = self.speaker_selection_method

        # 策略 1: round_robin —— 列表里的下一个
        if method == "round_robin":
            idx = self.agents.index(last_speaker)
            return self.agents[(idx + 1) % len(self.agents)]

        # 策略 2: random —— 随机一个，但不能是自己
        if method == "random":
            return random.choice([a for a in self.agents if a != last_speaker])

        # 策略 3: manual —— 让人在 console 里选
        if method == "manual":
            print("Available speakers:")
            for i, a in enumerate(self.agents):
                print(f"  {i}: {a.name}")
            idx = int(input("Pick next speaker: "))
            return self.agents[idx]

        # 策略 4: auto —— 让 selector（也就是 manager 本身）的 LLM 决定
        if method == "auto" or callable(method):
            return self._auto_select_speaker(last_speaker, selector)

        raise ValueError(f"Unknown speaker_selection_method: {method}")

    def _auto_select_speaker(self, last_speaker, selector):
        """让 LLM 看历史 + 角色描述，输出下一个 agent 的名字。"""
        roles_block = "\n".join(
            f"{a.name}: {a.description or a.system_message[:200]}"
            for a in self.agents
        )
        prompt = f"""You are managing a group chat with these participants:
{roles_block}

Read the conversation so far and pick the NEXT speaker.
Respond with ONLY the speaker's name, nothing else.

Last speaker was: {last_speaker.name}
Conversation:
{self._format_messages()}
"""
        # 调 selector 的 LLM
        reply = selector.generate_oai_reply(
            messages=[{"role": "user", "content": prompt}],
            sender=None,
        )
        name = reply[1].strip() if isinstance(reply, tuple) else reply.strip()

        # 容错：LLM 可能返回 "Engineer:" 或 "**Engineer**"，做模糊匹配
        for a in self.agents:
            if a.name.lower() in name.lower():
                return a
        # 兜底：round_robin
        idx = self.agents.index(last_speaker)
        return self.agents[(idx + 1) % len(self.agents)]


class GroupChatManager(ConversableAgent):
    """特殊的 agent：自己不"思考"，只负责把消息转发给下一个 speaker。"""

    def __init__(self, groupchat: GroupChat, **kwargs):
        super().__init__(name="chat_manager", **kwargs)
        self._groupchat = groupchat
        # 关键：清掉默认的 reply 链，注册一个新的
        self._reply_func_list = []
        self.register_reply([ConversableAgent, None], GroupChatManager.run_chat)

    def run_chat(self, messages, sender, config=None):
        """每收到一条消息，挑下一个 speaker，把消息广播给所有人。"""
        message = messages[-1]
        speaker = sender
        groupchat = self._groupchat

        for i in range(groupchat.max_round):
            # 把当前消息加进群聊历史
            groupchat.messages.append(message)
            # broadcast：除了发送者外，所有人都收一份（但不触发他们 reply）
            for agent in groupchat.agents:
                if agent != speaker:
                    self.send(message, agent, request_reply=False, silent=True)
            # 选下一个 speaker
            speaker = groupchat.select_speaker(speaker, self)
            # 让 next speaker 真正生成一条 reply
            reply = speaker.generate_reply(sender=self)
            if reply is None:
                break
            message = {"content": reply, "name": speaker.name, "role": "user"}

        return True, None  # final=True 拦截后续 reply_func
```

#### 旁注

1. **manager 自己不思考**：GroupChatManager 把默认 4 个 reply_func 全清掉，只留 `run_chat`。它收到任何消息都不调 LLM 生成回复，而是去问 GroupChat "下一个谁讲"。这个角色更像编排器而非 agent。
2. **broadcast 用 `request_reply=False`**：消息会进每个 agent 的历史，但不触发他们的 reply 链。所以 GroupChat 里"所有人都看到了"和"所有人都能讲话"是分开的。
3. **`auto` 模式的 LLM 解析很脆**：让 LLM 输出 agent 名字，但 LLM 经常输出 `Engineer:` / `**Engineer**` / `The next speaker should be Engineer`。代码里靠 `name.lower() in reply.lower()` 模糊匹配 + round-robin 兜底。这是工程上的"不优雅但能跑"。
4. **`max_round` 是硬上限**：没有"任务完成自动停"的机制，只有 `check_termination_and_human_reply` 钩子检查 message 是否含 `TERMINATE` 字样。所以如果 agent 们陷入 loop，max_round 是唯一的刹车。
5. **角色描述的关键作用**：`auto` 模式下 LLM 选 speaker 完全靠 `agent.description` 或 `system_message` 的前 200 字符。如果两个 agent 的 system message 区别度不够，selector LLM 会随机抽——这是论文 ablation 里没说但实战必踩的坑。

#### 怀疑

> "用 LLM 决定下一个 speaker"听起来很聪明，但每一轮都要发一次 prompt 请求让 LLM 选名字，意味着**每轮的 token 开销至少翻倍**（一次调度 + 一次实际发言）。论文的 case study 在 GPT-4 上跑，没人在意。但放到生产场景，光调度成本就能吃掉 30% token。后来 [LangGraph 选择显式状态机](https://github.com/langchain-ai/langgraph) 而不是 LLM 调度，我认为是对这个设计的直接反思。

---

### 3.3 Tool use + Docker code execution

#### Why this snippet

AutoGen 区别于"两个 LLM 互讲"的最大优势是**它会真的执行代码**。UserProxyAgent 默认带 code executor，可以是本地 subprocess 也可以是 Docker container。这一段决定了 agent 能不能从"嘴炮"变成"真做事"。

#### 代码（基于 [autogen-0.2 code_utils.py + docker_executor.py @ c11d29f5](https://github.com/microsoft/autogen/blob/c11d29f538fb6f2e4e35c4dab6ba395e74e92eda/autogen/code_utils.py)）

```python
# 简化自 microsoft/autogen @ c11d29f538fb6f2e4e35c4dab6ba395e74e92eda
# autogen/code_utils.py + autogen/coding/docker_commandline_code_executor.py

import re
import subprocess
import tempfile
import os
from pathlib import Path
from typing import List, Tuple, Optional

# 从 markdown 消息里抠代码块
CODE_BLOCK_PATTERN = re.compile(
    r"```(?P<lang>[a-zA-Z0-9_+\-]*)\n(?P<code>.*?)\n```",
    re.DOTALL,
)

def extract_code(text: str) -> List[Tuple[str, str]]:
    """从 LLM 输出里抠出所有 ```lang ... ``` 代码块。"""
    matches = CODE_BLOCK_PATTERN.findall(text)
    if not matches:
        # 兜底：如果整个消息看起来像代码（含 import / def / print），当 python 处理
        if re.search(r"^\s*(import|from|def|print|class)\b", text, re.MULTILINE):
            return [("python", text)]
        return []
    return matches  # [(lang1, code1), (lang2, code2), ...]


class LocalCommandLineCodeExecutor:
    """直接在本地 subprocess 跑代码。快但不安全——用户的 LLM 输出能直接 rm -rf /。"""

    def __init__(self, work_dir: str = "coding", timeout: int = 60):
        self.work_dir = Path(work_dir)
        self.work_dir.mkdir(exist_ok=True)
        self.timeout = timeout

    def execute_code(self, code: str, lang: str) -> Tuple[int, str, str]:
        """返回 (exit_code, stdout, stderr)。"""
        if lang in ("python", "py"):
            with tempfile.NamedTemporaryFile(
                mode="w", suffix=".py", dir=self.work_dir, delete=False
            ) as f:
                f.write(code)
                fname = f.name
            try:
                proc = subprocess.run(
                    ["python", fname],
                    capture_output=True, text=True,
                    timeout=self.timeout, cwd=self.work_dir,
                )
                return proc.returncode, proc.stdout, proc.stderr
            except subprocess.TimeoutExpired:
                return 124, "", f"Timeout after {self.timeout}s"
            finally:
                os.unlink(fname)

        if lang in ("bash", "sh", "shell"):
            proc = subprocess.run(
                code, shell=True, capture_output=True, text=True,
                timeout=self.timeout, cwd=self.work_dir,
            )
            return proc.returncode, proc.stdout, proc.stderr

        return 1, "", f"Unsupported language: {lang}"


class DockerCommandLineCodeExecutor:
    """在 Docker container 里跑代码。慢但隔离——LLM 想 rm 也只能 rm 容器内的文件。"""

    def __init__(
        self,
        image: str = "python:3-slim",
        timeout: int = 60,
        work_dir: str = "coding",
        container_name: Optional[str] = None,
    ):
        self.image = image
        self.timeout = timeout
        self.work_dir = Path(work_dir).absolute()
        self.work_dir.mkdir(exist_ok=True)
        self.container_name = container_name or f"autogen-{os.getpid()}"
        self._ensure_container()

    def _ensure_container(self):
        """启动一个常驻 container，避免每次跑代码都冷启动。"""
        # 检查是不是已经在跑
        result = subprocess.run(
            ["docker", "ps", "-q", "-f", f"name={self.container_name}"],
            capture_output=True, text=True,
        )
        if result.stdout.strip():
            return
        # 启动新容器，挂载 work_dir，设 entrypoint 为 sleep 让它不退出
        subprocess.run([
            "docker", "run", "-d",
            "--name", self.container_name,
            "-v", f"{self.work_dir}:/workspace",
            "-w", "/workspace",
            self.image,
            "sleep", "infinity",
        ], check=True)

    def execute_code(self, code: str, lang: str) -> Tuple[int, str, str]:
        # 写到挂载目录里
        suffix = ".py" if lang in ("python", "py") else ".sh"
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=suffix, dir=self.work_dir, delete=False
        ) as f:
            f.write(code)
            fname = Path(f.name).name  # 容器里只看得到文件名

        try:
            cmd_in_container = (
                f"python /workspace/{fname}" if suffix == ".py"
                else f"bash /workspace/{fname}"
            )
            proc = subprocess.run(
                ["docker", "exec", self.container_name, "sh", "-c", cmd_in_container],
                capture_output=True, text=True, timeout=self.timeout,
            )
            return proc.returncode, proc.stdout, proc.stderr
        except subprocess.TimeoutExpired:
            return 124, "", f"Timeout after {self.timeout}s"
        finally:
            os.unlink(self.work_dir / fname)


def generate_code_execution_reply(self, messages, sender, config=None):
    """注册到 ConversableAgent 的 reply_func。从最后一条消息抠代码 → 跑 → 把结果当 reply。"""
    last = messages[-1].get("content", "")
    blocks = extract_code(last)
    if not blocks:
        return False, None  # 没代码块，让下一个 reply_func 处理

    executor = self._code_execution_config.get("executor")
    if executor is None:
        # 默认本地，但官方 README 强烈建议改成 Docker
        executor = LocalCommandLineCodeExecutor()

    outputs = []
    for lang, code in blocks:
        exit_code, stdout, stderr = executor.execute_code(code, lang)
        if exit_code == 0:
            outputs.append(f"exitcode: 0 (execution succeeded)\nCode output:\n{stdout}")
        else:
            outputs.append(
                f"exitcode: {exit_code}\nstderr:\n{stderr}\nstdout:\n{stdout}"
            )
    return True, "\n\n".join(outputs)
```

#### 旁注

1. **代码抠取靠正则**：`CODE_BLOCK_PATTERN` 匹配 ```` ```lang\ncode\n``` ````，但 LLM 经常输出 ```` ``` ````（无 lang）或 `~~~` 或缩进式代码块。这个正则会漏掉一部分，所以 `extract_code` 还有个"看起来像代码就当 Python"的兜底——这是工程妥协。
2. **本地 vs Docker 的安全分水岭**：默认 `LocalCommandLineCodeExecutor` 直接在主机跑，意味着**LLM 的输出 = 你 shell 的输入**。一句 prompt injection 让 LLM 输出 `rm -rf ~/` 就完了。Docker 模式才是生产唯一选项。
3. **Docker 用常驻 container**：每次 `_ensure_container` 检查容器在不在，不在才 `docker run -d sleep infinity`。后续 `docker exec` 不需要冷启动，省 1-2 秒/次。代价是用完不会自动清理，得自己 `docker rm -f`。
4. **挂载 `work_dir` 是双向的**：宿主机和容器共享同一个目录。好处是 agent 生成的图表能直接看到；坏处是容器里的代码能写宿主机磁盘——隔离不彻底。
5. **stderr 也算"成功"**：注意 reply 把 `exit_code != 0` 的 stderr 当成回复返回给 LLM，LLM 看到 stderr 就知道要修。这是把 stderr 当 observation 的 ReAct 思路在多 agent 场景的复用。

#### 怀疑

> 用正则抠代码块这个设计在 2024 年看已经过时。Anthropic 的 [tool_use](https://docs.anthropic.com/en/docs/build-with-claude/tool-use) 和 OpenAI 的 [function calling](https://platform.openai.com/docs/guides/function-calling) 已经把工具调用做成结构化字段，不再依赖 markdown 解析。AutoGen 0.4 重写时新增了 `FunctionCall` 一等类型（参考 [autogen_core 类型定义](https://github.com/microsoft/autogen/blob/c11d29f538fb6f2e4e35c4dab6ba395e74e92eda/python/packages/autogen-core/src/autogen_core/models/_types.py)），但 0.2 这套正则栈还会陪很多用户走很久。

---

## Layer 4 — phd-skills 7 阶段（toy 实操）

按 phd-skills/literature-research 的 7 阶段流程跑一遍 AutoGen：

### 阶段 1: skim（10 分钟）

只读：abstract + §1 motivation + §2.1 ConversableAgent 定义 + §3.1 MathChat 第一段。判断这不是 benchmark 也不是 survey，是 method/system 论文，重点在 §2 框架。

### 阶段 2: ToC reading（30 分钟）

按 Layer 2 的表过一遍每章。重点圈三个对象（ConversableAgent / GroupChat / Code Executor）和三个 reply_func（oai / code / tool）。Application 章节扫一眼，确认它们都共用同一组接口——这印证了"reply 钩子链是发动机"的判断。

### 阶段 3: deep dive（2 小时）

精读 §2 全章 + appendix B 的完整代码。对照 GitHub 仓库 `python/autogen/agentchat/conversable_agent.py @ c11d29f5`，确认论文里的伪码和真实实现一致。重点画 reply_func_list 的"责任链"流程图。

### 阶段 4: toy reproduction（1 小时）

```bash
# Python 3.10+
python -m venv .venv && source .venv/bin/activate
pip install "pyautogen==0.2.35"  # 0.2 时代的最后一个稳定版
```

```python
# quickstart.py
import autogen
import os

config_list = [{"model": "gpt-4o-mini", "api_key": os.environ["OPENAI_API_KEY"]}]

assistant = autogen.AssistantAgent(
    name="assistant",
    llm_config={"config_list": config_list, "cache_seed": 42},
)

user_proxy = autogen.UserProxyAgent(
    name="user_proxy",
    human_input_mode="NEVER",
    max_consecutive_auto_reply=3,
    is_termination_msg=lambda x: "TERMINATE" in x.get("content", ""),
    code_execution_config={
        "work_dir": "coding",
        "use_docker": False,  # 本地跑，生产请改 True
    },
)

user_proxy.initiate_chat(
    assistant,
    message="Plot a sine wave from 0 to 2*pi using matplotlib, save to sine.png",
)
```

跑完看 `coding/sine.png` 是否真的生成了。验证三件事：(1) 代码块被正确抠出；(2) 本地 subprocess 跑通；(3) assistant 收到 stdout 后回复 TERMINATE 终止对话。

### 阶段 5: ablation（30 分钟）

把 quickstart 改成 GroupChat，把 next speaker 从 `auto` 切到 `round_robin`，对比同一个任务的 token 消耗：

```python
# 加一个 critic agent
critic = autogen.AssistantAgent(
    name="critic",
    system_message="You review code for correctness and security issues. Reply 'APPROVE' if good.",
    llm_config={"config_list": config_list},
)

groupchat = autogen.GroupChat(
    agents=[user_proxy, assistant, critic],
    messages=[],
    max_round=10,
    speaker_selection_method="round_robin",  # 改这里
)
manager = autogen.GroupChatManager(groupchat=groupchat, llm_config={"config_list": config_list})

user_proxy.initiate_chat(manager, message="...")
```

观察 round_robin 下 critic 每轮都被强制发言（哪怕没意义），切回 auto 后 critic 只在 assistant 出代码后才发言——印证 Layer 3.2 旁注 5。

### 阶段 6: depth-first read（按需）

如果发现 reply chain 调试痛点，去读 0.4 重写的 `autogen-core/_agent_runtime.py`，对比看新版本如何用显式 message subscription 替代 reply_func_list。

### 阶段 7: synthesize（这篇笔记）

写下这份 markdown，把 Layer 1-7 串起来。验证标准：3 个月后回头能不能在不重新读论文的情况下，凭这份笔记复现 quickstart + GroupChat ablation。

---

## Layer 5 — 谱系（Lineage）

<Image src="/papers/autogen/02-lineage.webp" alt="AutoGen 谱系图：前作 ReAct/Reflexion/Voyager 单 agent → AutoGen 多 agent 对话 → 后作 CrewAI/Swarm/LangGraph 各自分化" width={1200} height={900} />

### 上游（被它吃掉的前作）

- **ReAct (Yao et al. 2022)** — 提供了"thought → action → observation"的单 agent 模板。AutoGen 的 reply_func 链本质是 ReAct 的 hookable 版本。
- **Reflexion (Shinn et al. 2023)** — 自我反思机制。AutoGen 没直接实现，但 GroupChat 里加一个 critic agent 等价于把 reflexion 外化。
- **Voyager (Wang et al. 2023)** — 技能库 + 终身学习。AutoGen 提供注册 reply_func 的接口，让用户自己往里塞技能。
- **GPT-4 function calling (OpenAI 2023-06)** — 提供了 tool use 的结构化协议。AutoGen 0.2 还在用 markdown 抠代码块，0.4 才完整拥抱 function call。

### 平行（同期出现的兄弟）

- **LangChain Agents (2023)** — 函数化、单 agent 主导。AutoGen 选了对话化、多 agent 主导。两条路在 2024 年都活下来了。
- **Camel-AI (Li et al. 2023-03)** — 比 AutoGen 早半年提出 role-playing 多 agent。但 Camel 把 agent 写死成 user/assistant 二元对话，没有 GroupChat 这层。AutoGen 把这一层抽象出来了。
- **MetaGPT (Hong et al. 2023-08)** — 同月发表。MetaGPT 把多 agent 写成"PM/Architect/Engineer/QA"的固定 SOP，AutoGen 不固定 SOP，只提供编排原语。两者是"应用框架"vs"基础框架"的关系。

### 下游（被它启发的后作）

- **CrewAI (2024)** — 显式 [仓库 @ c4be7ba5](https://github.com/crewAIInc/crewAI/tree/c4be7ba56b04dee2c83d7c10cf7a0a5e92b3d34e) 把 AutoGen 的 agent + group chat 重新包装成 "Crew + Task + Process"，主打更易上手的 DSL。本质是 AutoGen 的 opinionated wrapper。
- **OpenAI Swarm (2024-10)** — [仓库 @ 9db581ce](https://github.com/openai/swarm/tree/9db581cecaacea0d46a933d6453c312b034dbf47) 故意做得极简：只有 Agent + handoff 两个概念，没有 GroupChat。可以理解为"AutoGen 减负版"——把 manager 这层去掉，让 agent 自己决定把控制权交给谁。
- **LangGraph (LangChain 2024)** — 反方向：用显式状态机（StateGraph）替代 LLM-based speaker selection。是对 AutoGen `auto` 模式调度成本的直接反思。
- **AutoGen 0.4 自己（2024-Q4）** — Microsoft 自己重写了，把 reply_func_list 换成 AgentRuntime + 显式 message subscription，承认了 0.2 的责任链设计在大规模场景调试困难。

### 对立面（不认这一派的人）

- **Single-agent 派（Anthropic 系）** — 认为多 agent 是过度设计，一个 Claude + 长 context + 好的 tool use 就够了。代表是 [Claude Code](https://www.anthropic.com/claude-code) 的设计哲学。
- **Agentless (Xia et al. 2024)** — 在 SWE-bench 上证明"无 agent 的简单 pipeline"可以打败多 agent 系统。直接质疑 AutoGen 这条路线的必要性。
- **Plan-Execute 派 (Devin / SWE-agent)** — 认为多 agent 不如一个会做长 plan 的单 agent。Devin 走的是这条路。
- **State machine 派 (LangGraph / Pydantic-AI graph)** — 认为对话是错误的抽象，应该回到显式状态机 + 工具节点。

### 一句话定位

> AutoGen 是 2023-2024 年从"单 agent 智能"过渡到"多 agent 协作"的中转站。它的 conversation 抽象既启发了 CrewAI/Swarm 的整个 wrapper 生态，也激起了 LangGraph/Agentless 的反对派。无论哪一派胜出，回看 2024 年的 multi-agent 讨论都绕不开这篇。

---

## Layer 6 — 三段总结（通用化、不带任何业务上下文）

### 段 1：核心贡献

- 把"多 agent 协作"这个开放问题，归约成一个极简循环：`receive → reply_func 链 → send`。所有花活（tool use、code execution、human input、group chat）都是这个循环的扩展。
- 提供了 ConversableAgent / AssistantAgent / UserProxyAgent / GroupChatManager 四个开箱可用的基类，覆盖了 80% 的 multi-agent 应用场景。
- 把 code execution 设计成可插拔的 reply_func，配合 Docker executor 第一次让"agent 真的执行代码"成为生产可行方案。
- 用 conversation 而非 RPC/state machine 作为编排原语——这个选择决定了它的扩展性（任何能写 `reply_func` 的人都能加新行为）和它的痛点（钩子链调试困难）。

### 段 2：方法机制

- **责任链**：`reply_func_list` 是有序钩子链，先注册的先跑（实际是 position=0 插入栈顶），第一个返回 `(True, reply)` 的获胜。trigger 用类型守卫做派发。
- **消息按 sender 分桶**：`_oai_messages: Dict[str, List[Dict]]` 让一个 agent 和不同对方的对话历史相互隔离，避免上下文串味。
- **Group chat 三策略**：next speaker 可选 round-robin / random / manual / auto（让 LLM 选）。auto 模式靠让 selector LLM 输出 agent name 字符串，再用模糊匹配兜底。
- **Code execution 双模式**：Local subprocess 快但不安全；Docker 用常驻 container + `docker exec` 兼顾隔离和速度。代码块靠正则从 markdown 抠出，配合"看起来像 python 就当 python"的兜底。

### 段 3：边界与启示

- **责任链调试代价**：当用户注册 5+ 个 reply_func，定位"为什么这条消息走到第 3 个钩子才被处理"需要在脑内模拟整个匹配过程。0.4 重写改用显式 message subscription 是对这个痛点的承认。
- **LLM-based 调度的 token 成本**：auto 模式每轮多一次 prompt 请求让 LLM 选 speaker，token 翻倍。在 GPT-4 时代不显眼，在生产规模会吃掉 30% 成本。
- **正则抠代码块过时**：2024 年 function calling / tool use 已成行业标准，markdown 解析是 2023 年的 workaround，新项目不应再走这条路。
- **它真正的留传不是代码，是抽象**："agent 之间用消息通讯而非函数调用"这个决定，被 CrewAI / Swarm / LangGraph 全部继承（哪怕他们改了实现）。这才是这篇论文留给后人的核心遗产。

---

## Layer 7 — 怀疑清单

1. **责任链 vs 显式状态机**：用钩子链做 agent 内部行为分发是优雅的，但当行为多到 5+ 个时，调试体验会断崖式下降。论文没有讨论 reply_func 数量增加后的可维护性。0.4 重写已经默认承认了这点——这意味着论文方法在生产规模下并不直接可用，只是个起点。
2. **GroupChat 的 LLM 调度成本**：每轮多一次 LLM 调用做 speaker selection，论文 ablation 没量化"调度 token / 总 token"的占比。我估算在 3 agent 场景下调度成本占 25-35%，4+ agent 场景更高。这是论文回避了的工程账。
3. **Conversation 是不是正确的抽象**：把 agent-to-agent 通讯压成"对话"看似自然，但实际上很多协作场景更像"workflow"（A 完成 → B 做 → C 验证）。LangGraph 走状态机路线在这种场景下远好用。AutoGen 的 conversation 抽象在结构化任务上是有 overhead 的。
4. **Code execution 的安全宣称偏弱**：论文 §2.4 提到 Docker executor 提供"隔离"，但实际上 work_dir 双向挂载意味着容器能写宿主机磁盘。真正的隔离需要加 read-only mount + network namespace + seccomp，这些论文都没讨论。生产用这套要自己加固。
5. **MathChat / 写作 / 国际象棋 case 的 baseline 都偏弱**：§3 的对比对象大多是单 agent ReAct 或 vanilla GPT-4。没有和"一个长 context + 好 prompt 的单 agent"做严格对比。无法证明多 agent 在这些任务上**必须**优于 single-agent。
6. **Cache_seed 默认开启的实验偏差**：quickstart 默认 `cache_seed=42`，意味着相同输入相同输出。论文实验如果开了 cache_seed，所有"agent 互动"其实都是 deterministic replay，agent 之间的"涌现协作"可能被严重低估或高估。论文没披露实验是否开 cache。

---

## 限制（Constraints）

1. **不复用核心命名**：reply_func_list / register_reply / GroupChatManager 这套设计是 AutoGen 0.2 的实现，不是 multi-agent 的 only way。不要把它当成"多 agent 必须长这样"。
2. **0.2 vs 0.4 大改**：0.2（本笔记基于此）和 0.4（2024-Q4 namespace 重写）的 API 几乎完全不兼容。生产用要选定一个版本，不要混用。
3. **代码执行务必用 Docker**：本地 executor 等同于把 LLM 输出当成 shell 输入。任何沾接外部 prompt 的场景都必须切 Docker，并加 read-only mount + network namespace + 资源限制。
4. **GroupChat max_round 必须设小**：默认 10 已经偏激进；2-agent 自由对话很容易陷入 loop。生产建议 max_round=3-5 + 明确的 termination message 检查。

---

## 元数据

- 笔记季节：Season L (literature)
- 阶段：L2（深读 + 谱系建立）
- 分支：method / framework
- 复现状态：toy（quickstart + GroupChat round-robin/auto 切换已跑通）
- 下一步：把 GroupChat 的 LLM 调度成本测出来（同任务跑 5 次 round_robin vs auto，对比 token），写进 problems/。
- 关联：见 lineage 图引用的 ReAct / Reflexion / CrewAI / Swarm / LangGraph 各自的笔记（待补）
- 来源：
  - arXiv: https://arxiv.org/abs/2308.08155
  - GitHub: https://github.com/microsoft/autogen
  - 0.2 stable: [c11d29f538fb6f2e4e35c4dab6ba395e74e92eda](https://github.com/microsoft/autogen/tree/c11d29f538fb6f2e4e35c4dab6ba395e74e92eda)
  - CrewAI 对照: [c4be7ba56b04dee2c83d7c10cf7a0a5e92b3d34e](https://github.com/crewAIInc/crewAI/tree/c4be7ba56b04dee2c83d7c10cf7a0a5e92b3d34e)
  - Swarm 对照: [9db581cecaacea0d46a933d6453c312b034dbf47](https://github.com/openai/swarm/tree/9db581cecaacea0d46a933d6453c312b034dbf47)
