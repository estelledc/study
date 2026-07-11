---
title: MetaGPT — 多智能体软件公司
来源: 'Hong et al., "MetaGPT: Meta Programming for A Multi-Agent Collaborative Framework", ICLR 2024'
日期: 2026-05-29
分类: AI / Agent
难度: 中级
---

## 是什么

MetaGPT 是 DeepWisdom 2023 年开源的多 agent 框架——**模拟一个软件公司**：产品经理写 PRD（产品需求文档），架构师画设计图，工程师写代码，QA 跑测试，全流程由 LLM 协作完成。

日常类比对比：

- **[[autogen]]** 是给你一间会议室，扔进 5 个 AI，让他们自由聊出方案——可能聊得好，也可能聊跑题
- **MetaGPT** 是给你一个软件公司，每个工种有 SOP（标准作业流程），每个人只写规定文档，然后传给下一个工种

你输入一句话："做一个 2048 游戏"，MetaGPT 输出一个能跑的项目目录——一句话变成项目，全程没有人写代码。

## 为什么重要

不理解 MetaGPT，下面这些事都解释不通：

- 为什么"自由对话"派的多 agent 框架（[[autogen]]）跑出来稳定性不够
- 为什么 ChatDev / OpenHands / GPTeam 长得都有点像——同期多走 Role + 工作流，和 MetaGPT 形成对照而非单纯派生
- 为什么"agent 工作流"会在 2024 年成为比"agent 模型"还火的话题
- 为什么 GitHub 50k+ Star 的多 agent 项目，是这一个而不是别的

它的四点贡献：

- **SOP 驱动的多 agent 范式**——按工程流程一步步推进，把"对话即随机"变成"流程即可控"
- **AI 写完整应用工程化**——输入需求 → 输出可运行项目，端到端跑通
- **强类型契约**——agent 之间传 Pydantic 模型而非自由文本，schema 校验失败就重试
- **启发整个赛道**——后续多 agent 框架常对照 Role + 结构化产物这条线（与自由群聊派并列）

## 核心要点

MetaGPT 把多 agent 协作拆成三个支柱：

### 一、Role（角色）

每个 agent 是一个**有职业身份的状态机**——有 profile（你是谁）、goal（目标）、constraints（约束）、actions（能做什么）。

预设五个角色：

- **PM（产品经理）** — 把模糊需求变成结构化 PRD
- **Architect（架构师）** — 把 PRD 变成系统设计 + 类图
- **ProjectManager** — 把设计拆成可分配的任务
- **Engineer（工程师）** — 把任务变成 Python 代码
- **QA（测试）** — 给代码写测试，发现 bug 反馈给 Engineer

每个角色都有 `_think`（决定下一步做什么）和 `_act`（执行动作），类比员工的"想 → 做"循环。

### 二、SOP（标准作业流程）

软件公司怎么开发？瀑布模型——需求 → 设计 → 编码 → 测试。MetaGPT 把这个流程**硬编码进框架**：PM 不能跳过 Architect 直接写代码，必须先有 PRD 文档落地。

类比：餐厅后厨——切菜的不会去掌勺，掌勺的不会去摆盘。每个工序的输入输出固定。

### 三、Shared Memory（共享文档）

不同角色之间**不直接对话**，而是通过"文档"传递信息：

- PM 写 `prd.md` → Architect 读 `prd.md` 写 `design.md` → Engineer 读两份文档写 `main.py`
- 文档用 Pydantic schema 定义结构（PRD 必须有 user_stories / competitive_analysis / requirement_pool 等字段）
- 不符合 schema 就重试，多次失败才报错

好处：每一步产物可审查、可缓存、可单独重跑。代价：流程僵化。

## 实践案例

### 案例 1：从一句话到 2048 游戏

```bash
metagpt "Create a 2048 game using pygame"
```

逐步看流水线（每步产物进共享文档，下一步只读文档不闲聊）：

1. **Alice (PM)** 写 `docs/prd.md`：用户故事、UI 草图、需求池
2. **Bob (Architect)** 读 PRD → 写 `docs/system_design.md`：模块划分、类图
3. **Eve (ProjectManager)** 读设计 → 拆任务到 `docs/tasks.md`
4. **Alex (Engineer)** 按任务在 `2048_game/` 下写 Python 代码
5. **Edward (QA)** 写 `tests/`；失败则把 bug 反馈给 Engineer 再修

跑完 `python 2048_game/main.py`，弹出能玩的游戏窗口。

### 案例 2：Action 抽象 = 每个角色的"动作池"

每个角色身上挂着若干 Action：

```python
class Engineer(Role):
    def __init__(self):
        super().__init__(name="Alex", profile="Engineer")
        self.set_actions([WriteCode, ReviewCode, FixBug])
        self._watch([WriteDesign])  # 监听架构师产出
```

`_watch` 决定订阅谁的输出，`set_actions` 决定能做什么。下游消息一到，`_think` 选 Action，`_act` 执行——这就是 think-act 循环。

### 案例 3：MetaGPT vs [[autogen]]

| 维度 | MetaGPT | [[autogen]] |
| --- | --- | --- |
| 协作模式 | 流水线 SOP | 自由群聊 |
| 信息传递 | 结构化文档 | 自然语言消息 |
| 复现性 | 高（schema 强约束） | 低（每次跑不同） |
| 灵活性 | 低（流程固定） | 高（agent 自决） |
| 适用场景 | 已有 SOP 的成熟领域 | 探索性、开放性任务 |

一句话：MetaGPT 是流水线，[[autogen]] 是头脑风暴。

## 踩过的坑

- **强 schema 压创造力** — Pydantic 定 `product_goals` 必须 3 个，模型会硬凑第 3 个，常常是水的
- **token 成本 5-10 倍** — 5 个 agent 串行跑一次小项目消耗 30k-50k tokens，单 agent 一次 prompt 只要 5k
- **长项目漂移** — 超过 5k 行代码的项目，单份 PRD 装不下，MetaGPT 没有"模块化 SOP"机制
- **流程刚性** — 需求变更要从头跑，和敏捷开发冲突；本质是瀑布开发的复刻

## 适用 vs 不适用场景

**适用**：

- 已有标准 SOP 的成熟领域（软件开发、客服流程、报表生成）
- 需要可复现、可审查的 agent 系统（生产环境而非 demo）
- 中等复杂度项目（< 5k 行代码、< 10 个文件）

**不适用**：

- 探索性任务（科研、创意、新业务）→ 用 [[autogen]] 的自由对话更合适
- 单函数级问题（写个 Fibonacci）→ 一次 prompt 就够，多 agent 是过度工程
- 超大规模项目（> 100k 行）→ MetaGPT 的全局上下文装不下

## 历史小故事（可跳过）

- **2023-08**：MetaGPT 论文挂 arXiv，DeepWisdom（深度赋智）+ KAUST + 港中深合作发起
- **2023-10**：GitHub 开源后 2 个月冲到 30k Star，成为当年增速最快的 AI repo 之一
- **2024-01**：ICLR 2024 接收为 **Oral**（口头报告档；不是 Outstanding Paper 获奖名单）
- **2024 全年**：ChatDev / GPTeam / OpenHands 等同期项目与 MetaGPT 对照，多走 Role + 工作流抽象
- **2024-12**：MetaGPT 生态继续扩展视觉/操作能力（屏幕识别 + 鼠标等方向）
- **2025**：和 OpenAI Swarm 形成两条常见路线——MetaGPT 侧偏"重 SOP"，Swarm 侧偏"轻 handoff"

10 年后回看，MetaGPT 大概是"agent 工程化"这条路线的奠基论文之一——把 prompt engineering 提升到 workflow engineering，让 multi-agent 第一次有了工业级的样子。

## 学到什么

1. **契约比对话更可靠** — 多角色协作的关键不是"他们怎么聊"，而是"他们传什么数据结构"
2. **SOP 是工程化的捷径** — 照搬人类已有工作流程，比重新发明协作模式快得多
3. **可复现性是 agent 系统的隐藏维度** — 单次跑通容易，每次都跑通才是工业级要求
4. **强约束 vs 创造力的取舍** — schema 收敛随机性，但也压抑灵活性，要看场景

## 延伸阅读

- 论文：[arXiv 2308.00352](https://arxiv.org/abs/2308.00352)（25 页，第 3 节是核心可重点读）
- 代码：[geekan/MetaGPT](https://github.com/geekan/MetaGPT)（50k+ stars，活跃度极高）
- ICLR 评审：[OpenReview](https://openreview.net/forum?id=VtmBAGCN7o)（可看到审稿人提的疑问与作者回复）
- [[autogen]] — 自由对话派的多 agent 代表
- [[react]] — think-act 循环的发明者
- [[voyager]] — 技能库 / 自动课程的早期实证

## 关联

- [[autogen]] — 自由对话派的多 agent 代表，和 MetaGPT 形成两条路线
- [[react]] — think-act 循环的发明者，是 Role._think + Role._act 的直接源头
- [[voyager]] — 技能库 / 自动课程的早期实证，启发了 Action 列表设计

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[papers/autogen]] —— AutoGen — 多智能体对话框架
- [[openhands]] —— OpenHands — 开源 AI 软件工程师
- [[continue]] —— Continue — 让 AI code review 跑成 git 跟踪的 PR status check
