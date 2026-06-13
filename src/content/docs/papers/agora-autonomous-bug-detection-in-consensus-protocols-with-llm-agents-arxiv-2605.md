---
title: "Agora — 用 LLM Agent 自主检测共识协议的 Bug"
来源: 'https://arxiv.org/abs/2605.29910'
日期: 2026-06-13
分类: 分布式系统
子分类: 共识与复制
provenance: pipeline-v3
---

## 是什么

Agora 是一个**用多个 LLM Agent 自动发现分布式共识协议里深层逻辑 Bug 的系统**，由 0G Labs 联合新加坡国立大学、北京大学、北京邮电大学开发，已被 ICML 2026 接收。

日常类比：想象你是一家工厂的安全质检员。普通的代码审查工具像一个走马灯 -- 只能看到"这个螺丝拧歪了"（内存泄漏、空指针）。但 Agora 派了三个质检员：一个总指挥（Orchestrator）、一个场景设计师（Strategy）、一个测试工程师（TestGen）。总指挥说："上次发现停机后再启动会导致数据不一致，这次试试两台同时停机呢？"场景设计师根据共识协议的特性设计出一个"三台节点互相干扰"的复杂场景。测试工程师写代码让这个场景跑起来 -- 如果系统出了错，就找到了一个连资深工程师都可能忽略的深层逻辑 Bug。

Agora 的核心方法叫**假设驱动测试**：不是"这个功能正常工作吗？"，而是**"在什么条件下，这个功能会失败？"**。它把这套思路编码进了三个 Agent 的分工协作中，让 LLM 从"随便看看代码"变成了"有目的地验证假设"。

最终成果：在 Raft、EPaxos、HotStuff、BullShark 四个共识协议的工业级实现中，发现了 **15 个此前完全未知的协议级逻辑 Bug**。作为对比，同样的四个单体大模型（GPT-5.2、Claude Sonnet 4.5、Gemini 3.0 Pro、Qwen3 Coder）直接使用时，一个这样的 Bug 都找不到。

## 为什么重要

共识协议是分布式系统的**心脏起搏器** -- Raft 被 etcd 和 Kubernetes 用；Paxos 变种被 Google Spanner 用；HotStuff 被区块链系统用；BullShark 被 Sui 公链用。它们的目标是让一群机器对"当前状态是什么"达成一致。

**核心矛盾**：共识协议的正确性取决于安全性（safety）和活性（liveness）。一旦实现中出现违反安全性的 Bug -- 比如两台机器同时宣称自己"赢了投票" -- 后果不是程序崩溃，而是**数据静默损坏**。在金融和区块链场景里，这意味着真金白银的损失。

不理解 Agora 背后的思路，下面这些事都没法解释：

- 为什么 GPT-5.2 和 Claude 4.5 这么强的大模型，面对协议级 Bug 却一个都找不到 -- 不是模型笨，是缺乏**结构化思维框架**和**领域知识**
- 为什么传统的模型检查（model checking）和 TLA+ 形式化验证搞了几十年，工业级共识协议里仍然有大量未被发现的 Bug -- 这些工具要求把协议"翻译"成形式化语言，翻译过程本身就容易遗漏
- 为什么多 Agent 不是噱头，而是解决复杂验证任务的**必要条件** -- 单一 Agent 既要想"测什么"、又要想"怎么测"，还要去"实际跑代码"，认知负载太高，必然顾此失彼
- 为什么"领域知识"对于 AI 代码分析不是可选的附加项，而是决定其能力上限的关键 -- 不懂 CFT 和 BFT 的区别，就不知道什么场景值得测、什么场景是浪费时间

## 核心要点

### 1. 假设驱动测试的四个要素

传统测试回答："这个功能正常工作吗？"假设驱动测试回答：**在什么条件下，这个功能会失败？**

一个漏洞假设用四个部分组成：

| 符号 | 含义 | 日常类比 |
|------|------|----------|
| C | 前置条件 | 需要满足什么前提 |
| A | 动作序列 | 做什么操作（击打哪里） |
| E | 期望的 Bug 行为 | 希望观察到什么异常 |
| O | 验证断言 | 用什么来确认 Bug 存在 |

### 2. 两类 Bug：实现级 vs 协议级

实现级 Bug（浅层）：内存越界、整数溢出、空指针
- 程序崩溃，但不影响数据一致性

协议级 Bug（深层）：安全属性被违反
- 两台机器对"谁赢了投票"有不同答案
- 数据静默损坏，系统"看似正常运行"

Agora 找到的全部 15 个都是协议级 Bug，0 个实现级 Bug。

### 3. 五大协议级 Bug 模式（Agora 知识库的核心）

1. **执行分歧**：节点重启后执行路径和之前不同
2. **单调性违反**：持久化数据不单调（比如 term 号回退了）
3. **拓扑缺陷**：消息依赖关系出错（比如跨分区的消息传递路径有环）
4. **签名绑定违规**：消息签名绑定不对（BFT 协议特有）
5. **资源可见性违规**：资源可见性不一致

### 4. CFT vs BFT -- 两种故障模型

- **CFT**（Crash Fault-Tolerant）：节点只会"挂掉"，不会"作恶"。比如 Raft、EPaxos。
- **BFT**（Byzantine Fault-Tolerant）：节点可能"作恶"（发送虚假信息）。比如 HotStuff、BullShark。
- Agora 的亮点：**同一套框架同时支持两种类型**，因为它们对 Bug 的约束条件完全不同。在 CFT 里假设节点作恶没有意义，会浪费计算资源；反过来在 BFT 里只假设节点崩溃，会漏掉最重要的攻击面。

### 5. 三 Agent 协作架构

```
                ┌─────────────────────────────────────────┐
                │               Agora 系统                 │
                │                                         │
                │  ┌───────────────┐   ┌──────────────┐  │
                │  │ Orchestrator  │──▶│   Strategy    │  │
                │  │ (总指挥)       │◀──│ (场景设计师)   │  │
                │  └───────┬───────┘   └──────┬───────┘  │
                │          │                  │          │
                │          ▼                  ▼          │
                │  ┌──────────────────────────────────┐  │
                │  │      TestGen (测试工程师)         │  │
                │  │  写测试 → 执行 → 分析 → 反思      │  │
                │  └──────────────────────────────────┘  │
                │                                         │
                │  领域知识库：Bug 模式 + CFT/BFT 约束条件  │
                └─────────────────────────────────────────┘
```

**Orchestrator** -- 总指挥：管流程、管记忆。做两件事：
- 回顾之前发现的 Bug，指导下一个搜索方向（bug exploitation）
- 维护全局状态，防止重复搜索同一类场景（state analyzer）

**Strategy** -- 场景设计师：懂协议特性。分析三件事：
- 当前协议的约束条件（CFT 还是 BFT）
- 已有的 Bug 模式
- 然后生成具体的攻击场景（比如"节点在投票中途崩溃，同时另一个节点发送未来视图的消息"）

**TestGen** -- 测试工程师：写测试代码来验证攻击场景。有一个**反思循环**：
- 生成测试 → 执行测试 → 分析结果 → 如果失败就改写测试，直到成功或达到最大重试次数
- 能跨 Go、Rust 等不同语言环境自适应运行

### 6. 12 步工作循环

```
Orchestrator:
  Step 1 - 分析历史 Bug，确定搜索方向
  Step 2 - 分析全局状态，避免重复
  Step 3 - 把分析结果发给 Strategy

Strategy:
  Step 4 - 分析协议约束条件
  Step 5 - 结合历史 Bug 和全局状态
  Step 6 - 生成攻击场景（控制节点行为：加入、离线、崩溃、消息乱序、恶意投票）
  Step 7 - 把攻击场景发给 Orchestrator

Orchestrator:
  Step 8 - 把攻击场景转发给 TestGen

TestGen:
  Step 9 - 根据攻击场景生成单元测试
  Step 10 - 执行测试
  Step 11 - 分析结果（成功=发现 Bug → 进入 12；失败→回到 9 重写测试）
  Step 12 - 把发现的 Bug 报告给 Orchestrator
```

## 实践案例

### 案例 1：Agora 主循环伪代码

```python
# Agora 主循环 -- 算法 1
def agora_workflow(
    knowledge_repo,    # 共识协议代码库
    bug_patterns,      # 已知 Bug 模式
    constraints        # CFT/BFT 约束条件
):
    global_state = {}  # 全局状态记忆

    while 还有探索预算:
        # ── Orchestrator Agent ──
        historical_bugs = bug_exploitation(global_state)  # 回顾历史
        state_summary = state_analyzer(global_state)       # 分析全局状态

        # ── Strategy Agent ──
        attack_scenario = Strategy.generate(
            historical_bugs,   # 之前发现的 Bug
            state_summary,     # 当前全局状态
            constraints,       # CFT/BFT 约束
            bug_patterns,      # 已知的 Bug 模式
            knowledge_repo     # 代码库知识
        )

        Orchestrator.send(global_state, attack_scenario)

        # ── TestGen Agent（带反思循环）──
        for attempt in range(MAX_RETRIES):
            test_code = TestGen.generate_unit_tests(
                attack_scenario,
                knowledge_repo
            )
            result = execute_and_analyze(test_code)

            if result.success:
                Orchestrator.report(result)
                break
            if attempt == MAX_RETRIES - 1:
                # 攻击场景无效，让 Strategy 生成新的
                break

    return global_state.detected_bugs
```

**逐部分解释**：

- `bug_exploitation(global_state)` -- 不是简单地"重放旧 Bug"，而是从已有 Bug 中提取**攻击模式**，指导下一个搜索方向。类比：警察破案时不是重复看案卷，而是从案卷里找出"作案手法"来预测下一个目标。
- `Strategy.generate(...)` -- 把领域知识（Bug 模式 + 协议约束）和 LLM 的生成能力结合起来。关键设计：LLM 负责"创造性发散"（想新场景），领域知识负责"约束收敛"（过滤掉不合逻辑的场景）。
- `TestGen` 的反思循环 -- 不是写一次测试就完事。写错了？看报错日志→改写→再跑，直到测试真正能触发 Bug 或确认测试无效。这一步是**减少误报**的关键。

### 案例 2：一个具体的协议级 Bug -- Recovery Divergence

Agora 在 EPaxos 中发现了 9 个协议级 Bug。下面用简化伪代码展示"执行分歧"类 Bug 的本质：

```rust
// 简化版共识协议状态机伪代码
// 展示 "Recovery & Execution Divergence" 类型的 Bug

struct ProposalStateMachine {
    current_view: u64,             // 当前视图号
    proposed_value: Option<Vec<u8>>, // 提议的值
    committed: bool,                // 是否已提交
}

impl ProposalStateMachine {
    // ── 正常流程：节点 A 收到提议 ──
    fn on_propose(&mut self, value: Vec<u8>) {
        self.proposed_value = Some(value.clone());
        broadcast(&self.encode_proposal(&value));
    }

    // ── Bug 场景：节点在投票完成后、持久化之前崩溃重启 ──
    //
    // 节点 A 的视角：
    //   1. 收到多数派投票（quorum），认为提议已通过
    //   2. 但还没来得及把"已提交"写入磁盘就崩溃了
    //   3. 重启后，磁盘上没有"已提交"的记录
    //   4. 另一个节点 B 也收到了相同的投票，也认为已提交
    //   5. 但 A 和 B 的"已提交"状态不一致！
    //   这就叫 "Recovery & Execution Divergence"

    fn on_recovery(&mut self) {
        let saved = read_from_disk();
        // Bug：如果 saved.committed == false
        // 但 quorum 实际上已经形成
        // 协议就违反了安全性：不同节点对"这个值是否已提交"
        // 有矛盾的认知
        if !saved.committed {
            self.start_new_round();  // 错误地重新开始
        }
    }

    // ── 安全性断言（Agora 会验证这个）──
    fn safety_check(&self) -> bool {
        // 如果两个节点对同一个值有不同的"committed"状态，
        // 安全性被违反
        true  // Bug 场景下返回 false
    }
}
```

**逐部分解释**：

- `on_recovery` 里的陷阱 -- 节点重启后只能相信磁盘上的数据。但"quorum 已形成"这件事可能还没来得及写入磁盘。如果恢复逻辑只检查磁盘数据而不查询其他节点，就会产生分歧。
- `safety_check` -- Agora 的 TestGen 在写测试时，会自动插入这种安全性断言。如果测试跑完后断言失败，就找到了一个 Bug。
- 为什么大模型直接分析找不到这个 Bug -- 因为它需要**跨越多个执行阶段**推理：正常提议 → 投票形成 quorum → 崩溃在持久化前 → 恢复后的状态 ≠ 其他节点的状态。单个 LLM 没有这种全局时序推理的结构化框架。

### 案例 3：LLM Agent 之间的协作提示结构

```
# Orchestrator 发给 Strategy 的消息示例：

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

# Strategy 的回复 -- 生成攻击场景：

"攻击场景：Future-Flooding
  C（前置条件）: 存在一个恶意节点 M，M 能提前发送未来视图的消息
  A（动作序列）:
    1. 正常节点 R0 在视图 v 发起提议
    2. 恶意节点 M 向 R1、R2 发送视图 v+10 的预提交消息
    3. R1、R2 接受并响应
    4. 视图 v 的正常提议被 M 的'未来投票'干扰
  E（期望行为）: R1 在视图 v+10 提交了本不该提交的值
  O（验证断言）: 检查视图 v 的 commit-log 中是否存在不属于该视图的值
"
```

### 案例 4：实验结果 -- 四个大模型在 Agora 框架下的表现对比

| 模型 | 独立使用时发现的协议级 Bug | 在 Agora 框架下发现的协议级 Bug |
|------|--------------------------|-------------------------------|
| GPT-5.2 | 0 | 8 |
| Gemini 3.0 Pro | 0 | 11 |
| Claude Sonnet 4.5 | 0 | 6 |
| Qwen3 Coder 480B | 0 | 9 |
| **合计（去重后）** | **0** | **15** |

此外：
- 真实 Bug 率（精确率）：73.9%（误报率仅 26.1%）
- 单个 Bug 的发现成本：约 5.32M tokens（约 $40）
- 跨 Go 和 Rust 两种语言的四个开源实现（包括 etcd 和 Sui 底层组件）

## 踩过的坑

1. **单体大模型面对协议级 Bug 完全失效**：GPT-5.2、Claude 4.5 等最强大模型直接使用时找到 0 个协议级逻辑 Bug。即使给它们配备 ReAct 动态工具链，它们也只能在低级实现 Bug（如内存泄漏、整数溢出）上打转，完全无法进行全局时序推理。这背后的原因是：单体模型缺乏**结构化思维框架**来跨多个执行阶段进行假设验证。

2. **去掉任何一个组件效果倒退 73%-100%**：

| 去掉什么组件 | 发现 Bug 数 | 相比全量倒退 |
|-------------|-----------|------------|
| 无 bug-exploitation（不回顾历史） | 3/15 | 80% |
| 无 state-analyzer（无全局状态） | 0/15 | 100% |
| 无 constraints-analyzer（不懂 CFT/BFT） | 1/15 | 93% |
| 无 scenario-generator（不生成攻击场景） | 0/15 | 100% |
| 无 reflection-loop（测试不反思） | 0/15 | 100% |

每一项都是必要条件，没有一个可以省略。尤其是 reflection-loop -- 没有它 TestGen 写出的测试要么跑不起来，要么验证不了正确的 Bug，完全失效。

3. **TestGen 的反思循环不是万能的**：如果攻击场景本身就不合理（比如在 CFT 协议里假设节点作恶），反思循环也救不了。所以 Strategy 的领域知识过滤必须在前，TestGen 的反思在后。

4. **跨语言环境的工程复杂度被低估**：Agora 需要能跑 Go（etcd/Raft 实现）和 Rust（Sui/BullShark 实现）的测试，意味着 TestGen 必须理解两种语言的测试框架和构建系统。论文没有详细展开这块的工程挑战。

## 适用 vs 不适用场景

**适用**：

- 共识协议（CFT/BFT）及其变种的实现级验证 -- 特别是工业级开源实现（etcd、Sui 等）
- 需要"跨多个执行阶段进行时序推理"的复杂系统验证
- 团队有分布式系统领域知识但缺乏形式化验证专业人才 -- Agora 把领域知识编码进 Agent，降低了使用门槛
- 预算敏感的场景 -- 单个 Bug 约 $40，比请安全审计团队便宜几百倍

**不适用**：

- 简单的实现级 Bug 检测（空指针、内存泄漏）-- 用传统 linter 或 fuzzer 就够了，不需要 LLM Agent
- 需要严格数学证明的安全属性（如"协议永远不会违反 X"）-- Agora 是测试工具，不是证明工具；它只能告诉你"这里有 Bug"，不能证明"这里没有 Bug"
- 没有可执行测试环境的协议规范阶段 -- Agora 需要能实际跑代码
- 小型协议或单文件实现 -- Agora 的开销（约 5M tokens / Bug）在太小的目标上不划算

论文作者提到 Agora 的架构可以"插拔式"推广到其他领域：数据库并发控制、操作系统内核、Web3 智能合约审计。但目前只在共识协议上验证过。

## 历史小故事（可跳过）

- **1990 年代**：Lamport 发表 Paxos（用希腊岛屿议会比喻），但分布式共识的正确性证明极其困难。Paxos 论文发表 8 年后才被社区广泛理解。之后的实现中不断发现各种 Bug。
- **2014 年**：Ongaro 发表 Raft -- 一个"为可理解性而设计"的共识协议。但即使 Raft，在 etcd 的实现中也在 2015-2022 年陆续发现了多个 Bug。2016 年一篇著名的论文用 TLA+ 形式化验证了 Raft，发现了原论文规范本身的歧义。
- **2010 年代**：形式化方法社区（Coq、TLA+、模型检查）成为共识协议验证的主流。但问题在于：**需要人工把协议"翻译"成形式化语言**，翻译过程本身就容易丢失细节。一个共识协议的 TLA+ spec 可能需要 500+ 行，只有极少数人写得对。
- **2023-2024 年**：LLM 开始在代码分析领域展现实力。但很快发现，最强大模型在"需要跨执行阶段推理"的复杂系统 Bug 上全面失败 -- 它们只能找到表面问题。
- **2026 年 5 月**：0G Labs 团队（在区块链共识协议落地中积累了丰富的生产级攻防经验）发布 Agora，把"分布式系统全局 invariants 逻辑推演知识"注入多 Agent 协同范式。论文被 ICML 2026 接收。
- **同一时段**：Anthropic 的 Glasswing 项目也瞄准类似问题，但走的是"重资产、高 Token 消耗的闭门合作"路线。Agora 开源平权，人人可用。

## 学到什么

- **大模型不笨，但需要"结构化思维框架"**：Agora 的 HDT 假设驱动框架让 LLM 从"随便看看代码"变成了"有目的地验证假设"。这不止适用于共识协议 -- 任何需要系统性排查 Bug 的领域都可能受益。

- **多 Agent 不是为了炫技，而是为了"职责分离"**：一个 Agent 管流程（Orchestrator），一个 Agent 懂协议（Strategy），一个 Agent 写测试（TestGen）。避免了"一个 Agent 什么都想干但都干不好"的常见陷阱。这和工程团队分工是完全一样的逻辑。

- **领域知识不是可选的附加项**：知识库里的"Bug 模式"和"CFT/BFT 约束条件"是 Agora 能成功的关键。没有这些，LLM 就失去了搜索的"指南针"。这意味着：用 AI 做专业领域任务时，投入在知识编码上的时间，比投入在优化 prompt 上的时间更值钱。

- **反思循环是减少误报的关键**：TestGen 不是一次写完测试就结束，而是"写→跑→分析→改写"的循环。这对应初学者常犯的错误 -- 写完代码就以为完了，其实跑一遍看到报错再改才是常态。

- **工程约束有时是创新的催化剂**：Agora 能在约 $40/Bug 的极低成本下工作，强迫团队设计了"极简 Agent 通信"和"Succinct Memory"机制来减少 Token 消耗。结果反而是这些约束让系统更模块化、更易推广。跟 3DGS 的十六进制 tile 类似：工程约束迫使了更好的设计。

## 延伸阅读

- 论文原文：[arXiv 2605.29910](https://arxiv.org/abs/2605.29910)（35 页、4 张图、ICML 2026）
- 开源代码：[github.com/0gfoundation/agora](https://github.com/0gfoundation/agora)（框架 + 测试用例）
- Raft 协议原论文：[In Search of an Understandable Consensus Algorithm](https://raft.github.io/raft.pdf)（Ongaro 2014）
- Raft 的 TLA+ 形式化验证：[J. R. Wilcox et al., "Verdi: A Framework for Implementing and Formally Verifying Distributed Systems", PLDI 2015](https://doi.org/10.1145/2737924.2737958)
- Paxos 原论文：[Lamport, "The Part-Time Parliament", 1998](https://lamport.azurewebsites.net/pubs/lamport-paxos.pdf)
- HotStuff 共识协议：[Yin et al., "HotStuff: BFT Consensus with Linearity and Responsiveness", PODC 2019](https://arxiv.org/abs/1803.05069)
- 对比项目 Anthropic Glasswing：面向生产级分布式系统的 AI 辅助验证框架（闭门合作路线）

## 关联

- [[raft-2014]] -- Raft 共识协议原论文
- [[paxos-1998]] -- Paxos 共识协议原论文
- [[distributed-consensus]] -- 分布式共识综述
- [[tla-plus]] -- TLA+ 形式化规范语言
- [[model-checking]] -- 模型检查基础
- [[llm-agents]] -- LLM Agent 综述
- [[multi-agent-systems]] -- 多 Agent 系统学习笔记
- [[bug-detection-survey]] -- Bug 检测技术综述

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）

