---
title: STORM — 面向多智能体协作的状态导向管理
来源: 'Mengyang Liu et al., "Multi-agent Collaboration with State Management", arXiv:2605.20563, 2026; 代码 https://github.com/dreamyang-liu/STORM'
日期: 2026-06-13
子分类: 模型与训练
分类: 机器学习
provenance: pipeline-v3
---

## 从日常类比开始：多人改同一份文档，该隔离还是实时对齐？

想象一家创业公司只有**一份**产品需求文档（PRD），四个工程师同时开工：

- **方案 A：各抄一份（Git Worktree 隔离）**  
  每人拿 PRD 的副本在自己文件夹里改，互不打扰。两周后合并：A 把接口改成 REST，B 按 GraphQL 写完了客户端，C 的测试假设还是旧签名——**两边单独都能编译，合在一起却语义冲突**。合并冲突工具只能抓「同一行被改了两次」，抓不到「设计假设已经分叉」。

- **方案 B：共享在线文档 + 提交前校验（STORM 思路）**  
  大家编辑**同一份**仓库。每次要保存某段内容时，系统先问：「你写这段时依赖的章节，有人刚改过吗？」若 PRD 第三章已被同事更新，你的保存会被**拒绝**，并推送最新第三章让你**基于新基线重写**——冲突在**写入瞬间**暴露，而不是合并派对上才发现。

- **方案 C：在代码里留「便签」（Intent Annotation）**  
  工程师 A 改完共享模块，不仅在代码里改函数，还在旁边留结构化注释：`# {engineer_1: validate numeric inputs before summing}`。工程师 B 打开同一文件时，看到的不仅是 diff，还有**为什么这么改**——在必须碰同一文件的边界上，减少「各写各的、互不知情」。

STORM（**ST**ate-**OR**iented **M**anagement）论文（Liu et al., arXiv:2605.20563）的核心主张是：**多 Agent 并行写代码时，问题本质是状态管理**——每个 Agent 的「局部世界观」是否仍与共享工作区一致。用写入时校验 + 意图注释，比「一人一个 worktree、最后再 merge」更可靠、也更省事后补救成本。

---

## 是什么

**STORM** 是一个**架构无关**的多智能体状态管理框架，介于 LLM Agent 与共享文件工作区之间，**中介（mediate）所有文件读写**：

1. Agent 读取文件时，记录 `(文件路径, 当时版本号)` 进入**读快照** \(S_i\)。
2. Agent 发起写入前，STORM 检查：\(S_i\) 里每个文件的版本是否仍等于工作区当前版本。
3. 若一致 → **原子接受**写入，目标文件版本 +1。
4. 若不一致 → **拒绝写入**，把已变更文件的最新内容返回给 Agent，让其**从新基线重试**。
5. 可选：**Intent Annotation**——Agent 在修改处留下 `# {agent_id: 意图描述}` 注释，供后续读同一文件的 Agent 理解上下文。

论文在 **Commit0-Lite**（仓库级代码实现）和 **PaperBench Code-Dev**（论文复现代码）上评估，对比：

| 基线 | 思路 |
|------|------|
| **Single-Agent** | 一个 Agent 包办，无协调开销 |
| **GitWorktree** | 每 Agent 独立 worktree，完成后 merge |
| **STORM** | 共享工作区 + 写入时局部状态一致性 |

典型结果（Claude Sonnet 4.6，4 个 Engineer Agent）：

- Commit0-Lite：**82.5%** macro pass（GitWorktree 63.8%，Single 66.4%）
- PaperBench：**74.1** 分（GitWorktree 72.7，Single 68.7）
- 与 Single-Agent 组合（STORM-Combined）可达 **87.6 / 78.2** 最高分

代码开源：https://github.com/dreamyang-liu/STORM（基于 OpenHands SDK）。

---

## 为什么重要

### 1. 多 Agent 写代码的瓶颈不是「会不会写」，而是「会不会撞车」

并行 Agent 能分解大任务（不同模块、不同实验脚本），但共享代码库存在**跨文件依赖**：A 改接口、B 读旧接口写调用方、C 写测试——三者局部都「合理」，集成后 pytest 一片红。STORM 把「隐藏集成错误」变成**写入时的即时反馈**。

### 2. Worktree 隔离把冲突推迟到 merge，恢复代价高

Git merge 擅长文本冲突，不擅长**语义冲突**（两边各自通过编译，合并后行为错误）。Agent 在隔离分支里已经消耗大量 token 完成错误假设下的实现，merge 失败意味着**整段推理作废**。STORM 在 Agent **还没提交错误设计之前**就打断 stale write。

### 3. 不需要全局快照，只需「局部一致」

Agent 并不需要冻结整个仓库——它只需要**自己读过的文件**在推理期间未被他人修改。这比分布式事务的全局锁轻得多，非重叠文件上的工作仍可**完全并行**。

### 4. 可插拔

STORM 是文件 I/O 层的中介，不绑定特定编排拓扑（Manager–Engineer、对等 Agent 等均可）。论文强调可 **seamlessly plug into any multi-agent system**。

---

## 核心概念

### 1. 工作区与版本化文件

工作区 \(\mathcal{W} = \{(f, v_f) \mid f \in \mathcal{F}\}\)，每个文件 \(f\) 有单调递增版本号 \(v_f \in \mathbb{N}\)。每次成功写入使 \(v_f \leftarrow v_f + 1\)。

### 2. 任务分解与主文件集

Manager Agent 把任务 \(T\) 分解为子任务并分配给 Engineer：

\[
M: T \longrightarrow \{(\tau_i, F_i, a_i)\}_{i=1}^{k}, \quad F_i \cap F_j = \emptyset \ (i \neq j)
\]

\(F_i\) 是 Agent \(a_i\) 的**主文件集**（尽量不重叠），但实际访问集 \(A_i\) 常超出 \(F_i\)（读共享 util、import 等）。冲突只发生在 \(A_i \cap A_j \neq \emptyset\) 的**边界文件**上。

### 3. 读快照 \(S_i\)

Agent 每读一个文件 \(g\)，记录观测版本：

\[
S_i = \{(g, v_g^{\text{obs}}) \mid a_i \text{ 已读取 } g\}
\]

LLM 生成写入内容 \(c'\) 时，**只依赖** \(S_i\) 中的上下文，而非整个 \(\mathcal{W}\)——这是 STORM 利用的不对称性。

### 4. 写入有效性（Local State Consistency）

写入 \((a_i, f, c')\) **有效**当且仅当：

\[
\forall (g, v_g^{\text{obs}}) \in S_i:\; v_g^{\text{obs}} = v_g^{\text{cur}}
\]

即：Agent 读过的**每一个**文件，自读取以来都未被其他 Agent 修改。满足则原子应用；否则为**冲突写入**，拒绝并刷新 \(S_i\)。

冲突分两类：

- **直接冲突**：目标文件 \(f\) 本身版本已变（两人改同一文件）。
- **间接冲突**：依赖的上下文文件（如被 import 的模块）已变，但 Agent 仍基于旧内容推理。

### 5. Intent Annotation（意图注释）

在 Agent 修改的代码块**正上方**插入结构化注释，例如：

```python
# {engineer_1: validate numeric inputs before summing}
def add(a, b):
    if not isinstance(a, (int, float)):
        raise TypeError("a must be numeric")
    return a + b
```

后续 Agent 读该文件时，除代码外还看到**设计意图**，在共享边界上协调而无需额外消息通道。消融实验（Commit0-Lite, Sonnet 4.6）：有 annotation 时 weighted pass **46.2%**，无 annotation **26.6%**——意图传递对协作质量影响显著。

### 6. Manager–Engineer 编排（论文实现）

- **Manager**：分解任务、分配 `(engineer_id, file_path, functions_to_implement, instruction)`、轮次结束后审查、统一 commit。
- **Engineer**：在共享工作区实现指定函数；**不自行 git commit**；写入经 STORM 网关。
- 失败 commit → 同一任务重新分配；最终由 Manager 做集成审查（import 对齐、命名一致、无 hang 代码）。

---

## 与 Git Worktree 的对比

```text
GitWorktree 模式:
  Agent₁ → worktree₁ ──┐
  Agent₂ → worktree₂ ──┼──→ merge（事后冲突检测）
  Agent₃ → worktree₃ ──┘

STORM 模式:
  Agent₁ ──┐
  Agent₂ ──┼──→ 共享工作区 ←── STORM 写入网关（写入时版本校验）
  Agent₃ ──┘
              ↓ 冲突 → 拒绝 + 返回最新文件 → Agent 重试
```

| 维度 | Git Worktree | STORM |
|------|--------------|-------|
| 冲突发现时机 | Merge 阶段 | **Write 阶段** |
| Agent 是否看到他人进展 | 否（直到 merge） | **是**（读到的始终是最新已接受版本） |
| 语义冲突 | 难自动处理 | 通过 stale-write 拒绝 + 重读缓解 |
| 并行度 | 高（完全隔离） | 高（仅边界文件串行化） |
| 跨文件强依赖仓库 | Merge 后才发现 | **imapclient、marshmallow、babel** 等大幅提升 |

论文也指出：当任务边界与文件边界**完美对齐**时（如 PaperBench 的 sample-specific-masks），GitWorktree 可能不输——隔离本身无惩罚。STORM 优势集中在**跨文件依赖重**的仓库。

---

## 代码示例 1：最小 STORM 写入网关（教学用 Python）

下面是一个**不含 LLM** 的简化版，演示「读快照 + 写入时版本校验」核心逻辑：

```python
from dataclasses import dataclass, field
from typing import Dict, Set, Tuple

FileVersion = int
Content = str


@dataclass
class Workspace:
    """共享工作区：文件内容 + 单调版本号。"""
    files: Dict[str, Content] = field(default_factory=dict)
    versions: Dict[str, FileVersion] = field(default_factory=dict)

    def read(self, path: str) -> Tuple[Content, FileVersion]:
        v = self.versions.get(path, 0)
        return self.files.get(path, ""), v

    def _bump(self, path: str, content: Content) -> None:
        self.files[path] = content
        self.versions[path] = self.versions.get(path, 0) + 1


@dataclass
class AgentState:
    """Agent 的读快照 S_i。"""
    agent_id: str
    snapshot: Dict[str, FileVersion] = field(default_factory=dict)

    def observe(self, path: str, version: FileVersion) -> None:
        # 每次 read 都更新/记录观测版本
        self.snapshot[path] = version


class StormGate:
    """中介所有写入：局部状态一致性检查。"""

    def __init__(self, workspace: Workspace):
        self.ws = workspace

    def try_write(
        self, agent: AgentState, path: str, new_content: Content
    ) -> Tuple[bool, str]:
        # 写入前也确保目标文件在 snapshot 中（通常 Agent 会先 read）
        if path not in agent.snapshot:
            return False, f"[{agent.agent_id}] must read {path} before write"

        # 式 (3)：所有已读文件版本仍等于当前版本？
        for g, v_obs in agent.snapshot.items():
            v_cur = self.ws.versions.get(g, 0)
            if v_obs != v_cur:
                stale, _ = self.ws.read(g)
                return False, (
                    f"[{agent.agent_id}] stale context: {g} "
                    f"observed v{v_obs}, current v{v_cur}. "
                    f"Refresh and retry.\n--- latest {g} ---\n{stale}"
                )

        # 原子应用写入
        self.ws._bump(path, new_content)
        new_v = self.ws.versions[path]
        agent.snapshot[path] = new_v  # 更新自身对目标文件的观测
        return True, f"[{agent.agent_id}] write accepted → {path} v{new_v}"


# --- 演示：Agent B 基于 stale 快照写入会被拒绝 ---
ws = Workspace()
ws._bump("utils.py", "def add(a, b):\n    return a + b\n")

gate = StormGate(ws)
agent_a = AgentState("engineer_1")
agent_b = AgentState("engineer_2")

# 两人最初读到相同版本
content, v = ws.read("utils.py")
agent_a.observe("utils.py", v)
agent_b.observe("utils.py", v)

# A 先成功写入（加了类型检查）
new_a = (
    "# {engineer_1: validate numeric inputs}\n"
    "def add(a, b):\n"
    "    if not isinstance(a, (int, float)):\n"
    "        raise TypeError('a must be numeric')\n"
    "    return a + b\n"
)
ok, msg = gate.try_write(agent_a, "utils.py", new_a)
print(msg)  # write accepted

# B 仍持有旧 snapshot，尝试基于旧 utils 写 client.py 并引用旧 add
ok, msg = gate.try_write(agent_b, "utils.py", "def add(a, b): return a - b\n")
print(msg)  # stale context → 拒绝，B 必须 re-read utils.py 再决策
```

运行这段代码，你会看到 **Agent B 的第二次写入因 `utils.py` 版本不一致而被拒绝**——这正是 STORM 把 merge 冲突前移到 write 时刻的机制。

---

## 代码示例 2：Intent Annotation 的生成与保留规则

论文要求 Engineer 在**刚修改的代码块上方**插入意图注释，且读到他人注释时**默认保留**（除非任务明确要求改动）。下面是一个简化的「写入后自动插入 annotation + 合并读」辅助函数：

```python
import re
from textwrap import dedent

INTENT_PATTERN = re.compile(
    r"^#\s*\{([^:}]+):\s*(.+?)\}\s*$", re.MULTILINE
)


def attach_intent(
    agent_id: str,
    intent: str,
    original: str,
    patched_block: str,
) -> str:
    """在 patched_block 前插入 intent annotation。"""
    header = f"# {{{agent_id}: {intent}}}\n"
    # 若原文件该位置已有 annotation，由 Agent 提示词要求 preserve
    return original.replace(patched_block, header + patched_block, 1)


def merge_read_view(file_content: str) -> str:
    """
    供后续 Agent 使用的「代码 + 意图」视图。
    解析所有 intent 注释，便于 prompt 注入。
    """
    intents = INTENT_PATTERN.findall(file_content)
    summary = "\n".join(
        f"  - [{aid}] {desc}" for aid, desc in intents
    ) or "  (no intent annotations)"
    return dedent(f"""
    ## File with intent annotations
    ```python
    {file_content}
    ```
    ## Parsed intents
    {summary}
    """)


# 示例：engineer_2 读到 engineer_1 的意图后再改 test
utils_src = attach_intent(
    agent_id="engineer_1",
    intent="validate numeric inputs before summing",
    original="def add(a, b):\n    return a + b\n",
    patched_block="def add(a, b):\n    return a + b\n",
)
utils_src = utils_src.replace(
    "def add(a, b):\n    return a + b\n",
    dedent("""\
    def add(a, b):
        if not isinstance(a, (int, float)):
            raise TypeError("a must be numeric")
        return a + b
    """),
)

print(merge_read_view(utils_src))
# engineer_2 的 prompt 可包含 Parsed intents，避免写出与类型检查冲突的测试
```

Intent annotation **不是** STORM 一致性的数学条件，而是工程上降低「同一文件边界」语义摩擦的**软协调层**——论文 Table 9 显示去掉后 pass rate 明显下降。

---

## 实验要点（零基础速览）

### Commit0-Lite

- 16 个 Python 仓库，Agent 需实现测试要求的 API。
- STORM 在**跨文件依赖重**的仓库涨幅最大，例如 Sonnet 上：
  - **marshmallow**：0.0%（single）→ 82.3%（STORM）
  - **imapclient**：9.7% → 89.1%
  - **jinja**：0.0% → 47.1%
- 小且自洽的仓库（如 **chardet**）single-agent 仍可能更好——分解 + 协调开销不值得。

### PaperBench Code-Dev

- 20 篇 ML 论文的代码复现子任务。
- STORM 在需要**大量代码组织**的论文上领先（what-will-my-model-forget: 99.8 vs 82.9 single）。
- GitWorktree 在子任务与文件边界完美对齐时仍有 wins。

### 多模型

Sonnet 4.6、Qwen 3.6 Plus、DeepSeek V4 Pro 上 STORM 相对 GitWorktree 均有提升；**Qwen + babel** 从 0.2%（GitWorktree）→ 74.2%（STORM）尤为 dramatic。

---

## 局限与边界（论文 Appendix E）

STORM **不能保证**任务语义正确或最终测试通过——它只保证：**被接受的写入基于当前文件版本的一致快照**。

| 局限 | 说明 |
|------|------|
| **Terminal bypass** | 只中介 `file_editor` 类工具；`sed`、`echo >` 等 bash 直写无法 preventive 拒绝，仅能事后 diff 检测 |
| **无命令协调** | 两 Agent 并行跑 formatter 等 shell 副作用未串行化 |
| **文件级粒度** | 同文件不同函数也会触发 false-positive 拒绝；`__init__.py` 等热点文件成瓶颈 |
| **失败模式仍在** | scope drift、accepted same-file overlap、budget 耗尽等占失败运行大多数 |

失败分析表明：大量失败测试是 **assertion / missing API / type error**——写入已被接受为版本一致，但**任务切分或语义组合**仍错。STORM 解决的是**状态视图 staleness**，不是「Agent 永远写对」。

---

## 与相关工作的关系（简表）

| 方向 | 代表 | 与 STORM 的区别 |
|------|------|-----------------|
| 多 Agent 编码 | MetaGPT, ChatDev | 多强调角色分工，少显式文件版本一致性 |
| Worktree 并行 | 近期 SWE-agent 类系统 | 隔离 → 事后 merge |
| 乐观并发控制 | 数据库 OCC | STORM 将 OCC 思想搬到 **Agent 文件写入** |
| CRDT / OT | 协同编辑 | STORM 选择 **reject + retry** 而非自动 merge 语义 |

注意：Stanford 的 **STORM 维基百科写作系统**（检索 + 多视角问答）是**完全不同**的项目，勿混淆。本文笔记对应 arXiv:2605.20563 的 **State-Oriented Management**。

---

## 何时值得用 STORM 思想？

**适合：**

- 多个 Coding Agent **共享同一仓库**并行改不同模块
- 仓库**跨文件依赖密集**（import 链、共享 schema）
- 希望**尽早**暴露集成问题，避免 merge 后大规模返工
- 已有 OpenHands / 类似 Agent SDK，可在工具层加写入网关

**可能不必：**

- 任务天然按文件完美拆分、几乎无共享文件
- 单 Agent 预算足够且仓库小而自洽
- Agent 频繁通过 shell 绕过文件工具（STORM 覆盖不全）

---

## 动手清单（读完可以做什么）

1. **读论文**：[arXiv:2605.20563](https://arxiv.org/abs/2605.20563) Section 2（形式化）+ Figure 1（架构图）。
2. **Clone 代码**：`git clone --recursive https://github.com/dreamyang-liu/STORM.git`，按 README 跑 Commit0 / PaperBench 脚本。
3. **自实现 Mini Gate**：用「代码示例 1」包一层你现有 Agent 的 `write_file` 工具。
4. **加 Intent 规范**：在 Engineer system prompt 里固定 `# {id: ...}` 格式，观察并行改同一 module 时的冲突率。
5. **对比实验**：同一 repo 分别跑 single / worktree / STORM，记录 pytest pass 与 token 成本。

---

## 一句话总结

**STORM 把多 Agent 协作从「各自隔离、最后赌 merge」改成「共享工作区、写入时校验局部快照是否过期」**——冲突立刻变成可重试的反馈，再配合代码里的 intent 注释，在共享文件边界上传递「为什么这样改」。它不是银弹，但在跨文件依赖重的代码任务上，论文给出了比 Git Worktree 更稳的并行基础层。

---

## 参考

- Liu, M., Chen, T., Xu, Z., Jiang, X., & Dong, Y. (2026). *Multi-agent Collaboration with State Management*. arXiv:2605.20563. https://arxiv.org/abs/2605.20563
- 代码：https://github.com/dreamyang-liu/STORM
- Commit0：https://commit-0.github.io/
- PaperBench：Starace et al., arXiv:2504.01848
