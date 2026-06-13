---
title: EvoArena — Tracking Memory Evolution for Robust LLM Agents in Dynamic Environments
来源: https://arxiv.org/abs/2606.13681
日期: 2026-06-13
分类: 机器学习
子分类: LLM记忆
provenance: pipeline-v3
---

# EvoArena：在动态环境中追踪记忆演化的 LLM Agent

## 0 为什么你需要读这篇

假设你在一家公司做运维。第一天你写了一整套部署脚本，一切正常运行。
三个月后，公司的安全策略改了：所有文件必须移到新目录，部署命令换了参数，权限规则收紧。
你还用第一天的记忆去执行部署，就会处处碰壁。

LLM Agent（用大模型做决策的智能体）目前也面临同样的问题。
现有的评测基准（如 SWE-bench、GAIA、WebArena）几乎全是"静态快照"——环境一次性设定好，答案永远不变。
但真实世界的环境会持续演化：API 会改版、用户偏好会变、代码库会迭代。
EvoArena 这篇论文要回答的核心问题是：**Agent 能不能在环境持续变化的情况下依然保持可靠？**

## 1 EvoArena：一个"演化竞技场"基准

### 1.1 核心思想

EvoArena 把每个评测环境变成一个**版本链**：同一个目标，但接口、规则、代码、偏好会随版本逐步变化。
Agent 必须做到三点：

- 解决当前版本的任务
- 识别哪些更新影响了任务
- 不要复用已经过时的旧行为

### 1.2 三个子基准

| 子基准 | 领域 | 什么在变 |
|---|---|---|
| Terminal-Bench-Evo | 终端工作流 | 依赖版本、CLI 参数、文件路径、权限规则 |
| SWE-Chain-Evo | 软件工程 | 代码库的里程碑迭代 |
| PersonaMem-Evo | 社交偏好 | 用户偏好随时间演化 |

以 Terminal-Bench-Evo 为例：
一个任务是"将 hello.html 推送到服务器并在 8080 端口提供服务"。
这个最终目标在所有版本中保持不变，但每个版本会改变一个关键约束：

- v1：直接部署到 /var/www
- v2：部署路径改为 /srv/www
- v3：需要额外的权限确认
- v4：切换到 Git 分支策略

Agent 如果只记住 v1 的路径，在 v2 就会失败。如果 v3 的权限覆盖了 v1 的旧规则，但 v1 的规则在其他场景仍然有效，Agent 也需要知道这一点。

### 1.3 关键指标

- **Step Accuracy**：每个版本化任务的平均正确率
- **Chain Accuracy**：整个版本链中所有版本都必须答对才算通过

当前最强的 Agent 在 EvoArena 上的平均准确率只有 **39.6%**，说明"静态时代"的 Agent 在面对演化环境时非常脆弱。

## 2 核心问题：状态坍塌（State Collapse）

### 2.1 什么是状态坍塌

大多数现有的 Agent 记忆系统把记忆维护成**单一最新状态**。
比如你记了一条记忆"部署路径是 /var/www"，后来环境变了变成 /srv/www，
记忆系统就用新值**覆盖**旧值。旧的记忆彻底丢失。

这就是"状态坍塌"——Agent 既丢失了旧行为，也丢失了**旧行为何时有效**的背景信息。

类比：你的日记本上只保留今天的天气，昨天的记录被直接涂掉了。
如果某天你想查"上周六为什么带了伞"，日记本里已经找不到答案。

### 2.2 论文里的一个具体例子

一条工作流权限更新可能会覆盖早期规则，但那条早期规则可能在另一个组织、另一个旧版本、或者未来回滚时仍然适用。
传统的"最新即正确"策略在这里会失效。

## 3 EvoMem：像 Git 一样管理记忆

论文提出的核心解决方案叫 **EvoMem**，灵感来自 Git 的版本管理。

### 3.1 核心概念：Patch（补丁）

传统记忆系统是"覆盖式"更新：

```
记忆 = {部署路径: /var/www}
       ↓ 环境更新后覆盖
记忆 = {部署路径: /srv/www}   ← 旧值 /var/www 丢失
```

EvoMem 是"补丁式"更新，每次变化都追加一条记录：

```
记忆 = {部署路径: /var/www}

+ 补丁 #1:
  之前: {部署路径: /var/www}
  之后: {部署路径: /srv/www}
  原因: 安全策略更新，部署目录统一迁移
  证据: "部署路径应迁移至 /srv/www"

+ 补丁 #2:
  之前: {需要权限: false}
  之后: {需要权限: true}
  原因: 新增权限校验要求
  证据: "所有部署需经管理员审批"
```

每条补丁包含四个字段：

1. **pre** — 更新前的状态
2. **post** — 更新后的状态
3. **rationale** — 为什么更新
4. **evidence** — 触发的上下文证据

### 3.2 关键特性

- **只追加（Append-only）**：补丁一旦写入永不修改，保证可追溯
- **版本感知检索**：默认检索最新状态；当查询涉及被覆盖的状态、冲突证据或旧版本时，主动检索相关补丁
- **与 Agent 解耦**：EvoMem 可以集成到 Terminus2、OpenHands、Memento-Skill、A-Mem 等多种 Agent 框架中

### 3.3 代码示例：EvoMem 的数据结构

```python
class Patch:
    """一条记忆补丁 — 类似 Git commit"""
    def __init__(self, patch_id, field, pre_value, post_value, rationale, evidence):
        self.patch_id = patch_id       # 补丁编号
        self.field = field             # 受影响的记忆字段
        self.pre_value = pre_value     # 更新前的值
        self.post_value = post_value   # 更新后的值
        self.rationale = rationale     # 为什么更新
        self.evidence = evidence       # 触发证据

class EvoMem:
    """EvoMem 记忆系统 — 像 Git 一样追踪记忆演化"""

    def __init__(self):
        self.patches = []              # 只追加的补丁历史
        self.state = {}                # 当前最新状态（由补丁推导）
        self.next_id = 1

    def apply(self, field, post_value, rationale, evidence):
        """应用一条记忆更新，生成补丁"""
        pre_value = self.state.get(field)
        if pre_value == post_value:
            return  # 值没变，不生成补丁

        patch = Patch(
            patch_id=self.next_id,
            field=field,
            pre_value=pre_value,
            post_value=post_value,
            rationale=rationale,
            evidence=evidence,
        )
        self.patches.append(patch)
        self.state[field] = post_value
        self.next_id += 1

    def retrieve_patches_for(self, field):
        """检索某个字段的所有演化补丁"""
        return [p for p in self.patches if p.field == field]

    def get_history(self):
        """获取某字段的完整演化历史"""
        patches = self.retrieve_patches_for("deployment_path")
        history = []
        for p in patches:
            history.append({
                "patch_id": p.patch_id,
                "from": p.pre_value,
                "to": p.post_value,
                "why": p.rationale,
            })
        return history
```

### 3.4 代码示例：EvoMem 在 Agent 中的使用

```python
# === 第一轮：部署路径是 /var/www ===
evomem = EvoMem()
evomem.apply(
    field="deployment_path",
    post_value="/var/www",
    rationale="初始部署配置",
    evidence="任务要求将文件部署到 /var/www",
)

# 此时 agent 记忆状态: { "deployment_path": "/var/www" }

# === 第二轮：安全策略更新，路径改为 /srv/www ===
evomem.apply(
    field="deployment_path",
    post_value="/srv/www",
    rationale="安全策略更新：部署目录统一迁移",
    evidence="通知：所有部署路径应迁移至 /srv/www",
)

# 此时 agent 记忆状态: { "deployment_path": "/srv/www" }

# === Agent 执行任务时 ===
# 传统 Agent 只看到最新的 /srv/www — 丢失了之前的上下文
# EvoMem Agent 可以检索完整历史：
history = evomem.get_history()

for entry in history:
    print(f"补丁 #{entry['patch_id']}: {entry['from']} -> {entry['to']}")
    print(f"  原因: {entry['why']}")

# 输出:
# 补丁 #1: None -> /var/www
#   原因: 初始部署配置
# 补丁 #2: /var/www -> /srv/www
#   原因: 安全策略更新：部署目录统一迁移
```

### 3.5 检索策略

EvoMem 在推理时有两种检索模式：

1. **默认模式**：从最新状态检索（和普通记忆系统一样快）
2. **增强模式**：当查询涉及被覆盖的状态、冲突证据、或需要理解演化脉络时，额外检索相关补丁

这保证了 EvoMem 的额外开销很小——只在需要时才查"旧版本"。

## 4 实验结果

### 4.1 EvoArena 上的表现

- 现有 Agent 平均准确率：**39.6%**
- EvoMem 带来平均 **+1.5%** 的提升
- 在 Chain Accuracy（整个版本链全部答对）上提升 **+3.7%**

Chain Accuracy 的提升特别值得注意——说明 EvoMem 帮助 Agent 在处理一连串相关的演化子任务时表现更好。

### 4.2 在传统基准上也有效

EvoMem 不仅在 EvoArena 上有效，在标准长程 Agent 基准上也有提升：

- **GAIA**：+6.1%
- **LoCoMo**：+4.8%

这表明 EvoMem 的记忆追溯能力对通用 Agent 任务都有帮助。

### 4.3 机制分析

论文做了机制分析，发现 EvoMem 有效的关键原因：

- **PersonaMem-Evo**上，EvoMem 在"时间轨迹"和"多模式综合"问题上提升最大——这些任务需要记住分散在不同时间的偏好变化
- **行级证据捕获**改善：补丁更好地保留了推理所需的完整状态信息
- **Terminal-Bench-Evo**上，当检索到的过渡信息被实际用于执行时，EvoMem 效果最好

## 5 关键对比：EvoArena vs 现有基准

| 基准 | 什么在变 | 持久演化 | 隐性变化 | 链式评估 |
|---|---|---|---|---|
| SWE-bench | 静态问题 | ✗ | ✗ | ✗ |
| GAIA | 静态任务 | ✗ | ✗ | ✗ |
| GAIA2 | 异步事件 | △ | ✓ | ✗ |
| HorizonBench | 偏好变化 | △ | ✓ | ✗ |
| **EvoArena** | **动态环境** | **✓** | **✓** | **✓** |

PE = Persistent Environment Evolution（持久环境演化）
IC = Implicit Change（隐性变化）
CE = Chain Evaluation（链式评估）

EvoArena 是首个同时支持这三个特性的基准。

## 6 一句话总结

> 传统 Agent 记忆像一篇只保留当前版本的 Word 文档；EvoMem 把它变成了带完整版本历史的 Git 仓库。

## 7 学习思考

1. **Patch 的粒度**：论文没有明确定义"什么变化值得记为一条补丁"。如果每个微小的状态变化都记一条，补丁会不会膨胀？如何筛选有意义的变化？

2. **与 RAG 的区别**：RAG 也是"检索额外信息"，但 RAG 检索的是外部知识库，EvoMem 检索的是记忆自身的演化历史。两者可以互补。

3. **实际部署成本**：Append-only 意味着记忆数据随时间线性增长。长期运行的 Agent 是否需要定期"压缩"补丁历史？

## 8 参考资料

- arXiv: [2606.13681](https://arxiv.org/abs/2606.13681)
- 项目页面: [https://aiden0526.github.io/EvoArena/](https://aiden0526.github.io/EvoArena/)
- 代码: [https://github.com/Aiden0526/EvoArena](https://github.com/Aiden0526/EvoArena)
- 数据集: [HuggingFace Collection](https://huggingface.co/collections/Aiden0526/evoarena)
- 作者: Jundong Xu, Qingchuan Li, Zhiyuan Hu 等（新加坡国立大学等）
