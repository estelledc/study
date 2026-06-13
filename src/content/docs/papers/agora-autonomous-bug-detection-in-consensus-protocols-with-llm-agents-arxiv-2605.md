---
title: Agora — 用 LLM Agent 自主检测共识协议的 Bug
来源: 'https://arxiv.org/abs/2605.29910'
日期: 2026-06-13
分类: 分布式系统
子分类: 共识与复制
provenance: pipeline-v3
---

## 是什么

Agora 是一个**用多个 LLM Agent 自动发现分布式共识协议里深层逻辑 Bug 的系统**。

日常类比：想象你是一家工厂的安全质检员。普通的代码审查工具像一个走马灯——只能看到"这个螺丝拧歪了"（内存泄漏、空指针）。但 Agora 派了三个质检员：一个总指挥（Orchestrator）、一个场景设计师（Strategy）、一个测试工程师（TestGen）。总指挥说："上次发现停机后再启动会导致数据不一致，这次试试两台同时停机呢？"场景设计师根据共识协议的特性设计出一个"三台节点互相干扰"的复杂场景。测试工程师写代码让这个场景跑起来——如果系统出了错，就找到了一个连资深工程师都可能忽略的深层逻辑 Bug。

## 为什么重要

共识协议是分布式系统的**心脏起搏器**——Raft 被 etcd、K8s 用；Paxos 变种被 Google Spanner 用；HotStuff 被区块链系统用。它们的目标是让一群机器对"当前状态是什么"达成一致。

**核心矛盾**：共识协议的正确性取决于安全性（safety）和活性（liveness）。一旦实现中出现违反安全性的 Bug——比如两台机器同时宣称自己"赢了投票"——后果不是程序崩溃，而是**数据静默损坏**。在金融和区块链场景里，这意味着真金白银的损失。

现有的 LLM 做代码分析时，只能找到实现级别的 Bug（越界访问、空指针）。但共识协议的真正危险在于**协议级别的逻辑 Bug**——多个执行阶段之间的状态依赖出了问题。Agora 是第一个把"共识协议的领域知识"和"多 Agent 协作"结合起来的系统。

## 核心概念

### 1. 假设驱动测试（Hypothesis-Driven Testing, HDT）

传统测试回答："这个功能正常工作吗？"
HDT 回答：**在什么条件下，这个功能会失败？**

一个漏洞假设用四个部分组成：

| 符号 | 含义 | 类比 |
|------|------|------|
| C | 前置条件 | 需要满足什么前提 |
| A | 动作序列 | 做什么操作 |
| E | 期望的 Bug 行为 | 希望观察到什么异常 |
| O | 验证断言 | 用什么来确认 Bug 存在 |

### 2. 两类 Bug：实现级 vs 协议级

```
实现级 Bug（浅层）：内存越界、整数溢出、空指针
  → 程序崩溃，但不影响数据一致性

协议级 Bug（深层）：安全属性被违反
  → 两台机器对"谁赢了投票"有不同答案
  → 数据静默损坏，系统"看似正常运行"
```

### 3. 五大协议级 Bug 模式

1. **Recovery & Execution Divergence**：节点重启后执行路径和之前不同
2. **Persistence & Monotonicity Violation**：持久化数据不单调
3. **Dependency & Topology Flaw**：消息依赖关系出错
4. **Message Binding & Signature Violation**：消息签名绑定不对
5. **Resource & Operational Visibility Violation**：资源可见性不一致

### 4. CFT vs BFT

- **CFT**（Crash Fault-Tolerant）：节点只会"挂掉"，不会"作恶"。比如 Raft、EPaxos。
- **BFT**（Byzantine Fault-Tolerant）：节点可能"作恶"（发送虚假信息）。比如 HotStuff、BullShark。
- Agora 的亮点：**同一套框架同时支持两种类型**，因为它们对 Bug 的约束条件完全不同。在 CFT 里假设节点作恶是没有意义的，会浪费计算资源。

## Agora 的架构

Agora 由三个 Agent 组成，每个 Agent 有明确分工：

```
┌─────────────────────────────────────────────────┐
│                  Agora 系统                      │
│                                                  │
│  ┌─────────────┐    ┌─────────────┐             │
│  │ Orchestrator │───▶│  Strategy   │             │
│  │ (总指挥)     │◀───│ (场景设计师) │             │
│  └──────┬──────┘    └──────┬──────┘             │
│         │                  │                     │
│         ▼                  ▼                     │
│  ┌──────────────────────────────────┐           │
│  │        TestGen (测试工程师)       │           │
│  │   写测试 → 执行 → 分析 → 反思     │           │
│  └──────────────────────────────────┘           │
│                                                  │
│  知识库：Bug 模式 + 协议约束条件                   │
└─────────────────────────────────────────────────┘
```

**总指挥（Orchestrator）**：管流程、管记忆。它做了两件事：
- 回顾之前发现的 Bug，指导下一个搜索方向
- 维护全局状态，防止重复搜索同一类场景

**场景设计师（Strategy）**：懂协议特性。它分析了：
- 当前协议的约束条件（CFT 还是 BFT）
- 已有的 Bug 模式
- 然后生成具体的攻击场景（比如"节点在投票中途崩溃"）

**测试工程师（TestGen）**：写测试代码来验证攻击场景。它有一个**反思循环**：
- 生成测试 → 执行测试 → 分析结果 → 如果失败就改写测试，直到成功或达到最大重试次数

## 工作流程

整个流程遵循 12 步循环：

```
Orchestrator:
  Step 1 - 分析历史 Bug，确定搜索方向
  Step 2 - 分析全局状态，避免重复
  Step 3 - 把分析结果发给 Strategy

Strategy:
  Step 4 - 分析协议约束条件
  Step 5 - 结合历史 Bug 和全局状态
  Step 6 - 生成攻击场景（控制节点行为：加入、离线、崩溃、消息乱序）
  Step 7 - 把攻击场景发给 Orchestrator

TestGen:
  Step 9 - 根据攻击场景生成单元测试
  Step 10 - 执行测试
  Step 11 - 分析结果（成功=发现 Bug → 进入 12；失败→回到 9 重写测试）
  Step 12 - 把发现的 Bug 报告给 Orchestrator
```

### 代码示例 1：Agora 的伪代码工作流

```python
# Agora 主循环 —— 算法 1
def agora_workflow(
    knowledge_repo: KnowledgeBase,   # 共识协议代码库
    bug_patterns: set[BugPattern],   # 已知 Bug 模式
    constraints: ProtocolConstraints  # CFT/BFT 约束条件
) -> set[Bug]:
    global_state = {}                  # 全局状态记忆

    while 还有探索预算:
        # ── Orchestrator Agent ──
        historical_bugs = bug_exploitation(global_state)  # 回顾历史
        state_summary = state_analyzer(global_state)       # 分析全局状态

        # ── Strategy Agent ──
        attack_scenario = Strategy.generate(
            historical_bugs,    # 之前发现的 Bug
            state_summary,      # 当前全局状态
            constraints,        # CFT/BFT 约束
            bug_patterns,       # 已知的 Bug 模式
            knowledge_repo      # 代码库知识
        )

        Orchestrator.send(global_state, attack_scenario)

        # ── TestGen Agent（带反思循环）──
        for _ in range(MAX_RETRIES):
            # 写测试代码
            test_code = TestGen.generate_unit_tests(
                attack_scenario,
                knowledge_repo
            )

            # 执行测试
            result = execute_and_analyze(test_code)

            if result.success:
                # 找到了 Bug！
                Orchestrator.report(result)
                break

            # 失败了？反思并改写测试
            if _ == MAX_RETRIES - 1:
                # 这个攻击场景无效，让 Strategy 生成新的
                break

    return global_state.detected_bugs
```

### 代码示例 2：一个具体的协议级 Bug

Agora 在 EPaxos 中发现了 9 个协议级 Bug。下面是一个简化版的概念说明——展示什么是"协议级逻辑 Bug"：

```rust
// 这是一个简化版的共识协议状态机伪代码
// 展示"Recovery & Execution Divergence"类型的 Bug

struct ProposalStateMachine {
    current_view: u64,        // 当前视图号
    proposed_value: Option<Vec<u8>>,  // 提议的值
    committed: bool,           // 是否已提交
}

impl ProposalStateMachine {
    // ── 正常流程：节点 A 收到提议 ──
    fn on_propose(&mut self, value: Vec<u8>) {
        self.proposed_value = Some(value.clone());
        // 发送提议给其他节点，等待投票
        broadcast(&self.encode_proposal(&value));
    }

    // ── Bug 场景：节点在投票完成后、持久化之前崩溃重启 ──
    // 这就是 "Recovery & Execution Divergence"

    // 节点 A 的视角：
    //   1. 收到多数派投票（quorum），认为提议已通过
    //   2. 但还没来得及把"已提交"写入磁盘就崩溃了
    // 3. 重启后，磁盘上没有"已提交"的记录
    // 4. 另一个节点 B 也收到了相同的投票，也认为已提交
    // 5. 但 A 和 B 的"已提交"状态不一致！

    fn on_recovery(&mut self) {
        // 从磁盘恢复状态
        let saved = read_from_disk();  // 可能没有"已提交"记录！

        // Bug：如果 saved.committed == false
        // 但 quorum 实际上已经形成
        // 协议就违反了安全性：不同节点对"这个值是否已提交"
        // 有矛盾的认知
        if !saved.committed {
            // 错误地重新开始，导致与已认为"已提交"的节点
            // 产生分歧
            self.start_new_round();
        }
    }

    // ── 安全性断言（Agora 会验证这个）──
    fn safety_check(&self) -> bool {
        // 如果两个节点对同一个值有不同的"committed"状态，
        // 安全性被违反
        true  // Bug 场景下这个返回 false
    }
}
```

### 代码示例 3：LLM Agent 的协作 prompt 结构

```
# Orchestrator 的 prompt 示例 —— 指导 Strategy 下一步做什么：

"我们已经发现了 3 类 Bug：
  1. 节点在投票期间崩溃（Recovery Divergence）
  2. 消息乱序导致重复投票
  3. 视图号增长时旧提议没有被清理

现在请分析 HotStuff 协议的约束条件：
  - 这是 BFT 系统（允许恶意节点）
  - 使用阈值签名
  - 有 PrePrepare、Prepare、Commit 三个阶段

请生成一个攻击场景，要满足：
  - 不被已发现的 Bug 模式覆盖
  - 利用 BFT 特有的约束（恶意节点行为）
  - 能触发安全性属性被违反
  - 用 HDT 格式输出：(C, A, E, O)
"

# Strategy 的回复 —— 生成攻击场景：

"攻击场景：Future-Flooding
  C（前置条件）: 存在一个恶意节点 M，M 能提前发送未来视图的消息
  A（动作序列）:
    1. 正常节点 R0 在视图 v 发起提议
    2. 恶意节点 M 向 R1、R2 发送视图 v+10 的预提交消息
    3. R1、R2 接受并响应
    4. 视图 v 的正常提議被 M 的"未来投票"干扰
  E（期望行为）: R1 在视图 v+10 提交了本不该提交的值
  O（验证断言）: 检查视图 v 的 commit-log 中是否存在不属于该视图的值
"
```

## 实验结果

Agora 在四个共识协议上做了实验（Raft、EPaxos、HotStuff、BullShark），用了四个最先进的大模型（GPT-5.2、Gemini 3.0 Pro、Claude Sonnet 4.5、Qwen3 Coder 480B）：

**关键发现**：
- 同样的四个大模型**直接使用时**，一个协议级逻辑 Bug 都没找到
- 但用 Agora 框架引导后：
  - GPT-5.2 找到了 8 个
  - Gemini 3.0 Pro 找到了 11 个
  - Claude Sonnet 4.5 找到了 6 个
  - Qwen3 Coder 480B 找到了 9 个
  - **总共 15 个零日（zero-day）协议级 Bug**
- 而且 Agora 找到的全是**协议级逻辑 Bug**，0 个实现级 Bug

这说明：**光有大模型不够，需要正确的框架来引导它**。

## 消融实验：每个组件都不可或缺

| 去掉什么 | 发现 Bug 数 | 说明 |
|---------|-----------|------|
| 无 bug-exploitation（不回顾历史） | 3/15 | 少了 80% |
| 无 state-analyzer（无全局状态） | 0/15 | 一个都找不到 |
| 无 constraints-analyzer（不懂 CFT/BFT 约束） | 1/15 | 基本废了 |
| 无 scenario-generator（不生成攻击场景） | 0/15 | 完全停摆 |
| 无 reflection-loop（测试不反思） | 0/15 | 完全停摆 |

**结论**：去掉任何一个组件，Agora 的效果都会下降 73%-100%。每个组件都至关重要。

## 关键洞察

1. **大模型不笨，但需要"结构化思维框架"**。Agora 的 HDT 假设驱动框架让 LLM 从"随便看看代码"变成了"有目的地验证假设"。

2. **多 Agent 不是为了让系统变复杂，而是为了"职责分离"**。一个 Agent 管流程，一个 Agent 懂协议，一个 Agent 写测试——避免了"一个 Agent 什么都想干但都干不好"的问题。

3. **领域知识不是可选的附加项**。知识库里的"Bug 模式"和"CFT/BFT 约束条件"是 Agora 能成功的关键。没有这些，LLM 就失去了搜索的"指南针"。

4. **反思循环（Reflection Loop）是减少误报的关键**。TestGen 不是一次写完测试就结束，而是"写 → 跑 → 分析 → 改写"的循环，直到测试真正能触发 Bug 或者确认测试无效。

## 思考

Agora 的核心思想——用多 Agent 协作 + 领域知识 + 假设驱动测试——是否可以推广到其他领域？比如操作系统内核、编译器、加密库？

一个值得思考的问题：如果 Agora 能自动发现共识协议的 Bug，那么**协议的设计者是否还需要人工审计**？还是说以后共识协议的验证可以交给 Agent 系统来做？
