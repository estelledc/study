---
title: BDI-LLM Self-Evolving Agents — 让 agent 自己改自己源代码
来源: 'Marco Robol, Paolo Giorgini, "Self-Evolving Software Agents", arXiv:2604.27264, 2026'
日期: 2026-06-01
子分类: 智能体与 LLM
分类: Agent
难度: 高级
schema_version: legacy-short
provenance: legacy-migrated
---

## 是什么

Self-Evolving Software Agents 是一种**让 agent 既能像人一样推理（信念-愿望-意图），又能像编程一样自己改自己代码**的架构。日常类比：像一个员工不只会按 SOP 干活，还会自己写新 SOP，并把过期的删掉。普通 LLM agent 是按预设 prompt 反应，BDI-LLM agent 是会重写自己 prompt 和工具的，而且重写时还会做自检测确保没破坏旧能力。

BDI 是 1980 年代多智能体系统（MAS）的经典框架——Belief（信念，agent 知道什么）、Desire（愿望，agent 想达成什么）、Intention（意图，agent 当前在执行哪条计划）。它的优点是**显式推理**——agent 的决策可被读出来。缺点是规则要人手写，agent 自己学不到新东西。

LLM 进来填这个缺：把 LLM 接在 BDI 的 evolution module 上，让它读 agent 自己的执行历史，**合成新的 desire / intention / 可执行代码**。整套系统的核心动作是"agent 在跑业务的同时，后台还在改自己"。论文的实验在多 agent 环境里展示了 desire / reasoning / executable code 三种东西的同时演化。

## 为什么重要

不理解 BDI-LLM 这条路线，下面这些事都没法解释：

- 为什么"prompt-based agent" 走到一定程度就遇到瓶颈——prompt 是人写死的，agent 改不动
- 为什么 multi-agent 系统的协调能力受限于"协议必须事先定义"的传统假设
- 为什么"自我修改的程序"在 1980 年代提过但近几年才能跑——LLM 是缺的最后一块拼图
- 为什么"行为继承"（behavioral inheritance）是 self-evolving agent 的稳定性核心问题

## 核心要点

BDI-LLM agent 的运作可以拆成 **三步**：

1. **BDI 推理循环**：每个 tick agent 检查 beliefs 和 desires，按既定 plan library 选择 intentions 执行。这层是确定性的，相当于 agent 的"骨架"——可以被审计、可以保证某些 invariant。骨架不变，只在它之上演化。

2. **Evolution module（LLM 驱动）**：后台进程读 agent 最近 N 次执行轨迹，识别"反复失败的 desire"或"未覆盖的场景"，调用 LLM 生成新的 plan / desire / code patch。这一步等于 agent 给自己加了"自学能力"，但学的内容受 BDI 骨架约束。

3. **Behavioral inheritance check**：新代码进入 plan library 之前，跑一遍 invariant 测试——agent 之前能完成的核心任务是否还能完成。失败则 reject。类比：员工写新 SOP 时，老板要确认新 SOP 不会让原来已经能办的事办不成。论文坦言这一步设计还很初级，invariant 集合的完备性是开放问题。

## 实践案例

### 案例 1：能源管理 agent 自己加新规则

agent 初始只会"温度 > 25 度时关空调"。运行一段时间后发现"温度 22 度但湿度 80% 用户也热"。Evolution module 读到这种 case，调 LLM 生成新 desire："感知热不只看温度还看湿度"，并自动写出对应 plan 代码：

```python
def maintain_comfort(beliefs):
    if beliefs.temp > 25 or (beliefs.temp > 22 and beliefs.humidity > 75):
        return Intention("turn_off_ac")
```

新 plan 进入 plan library 之前，invariant test 跑一遍："原来 30 度时仍然会关空调吗？" 通过则正式接入。这种"骨架先稳，再加肌肉"的设计是 BDI-LLM 区别于纯 prompt agent 的关键。

### 案例 2：和 prompt-based agent 的对比

| 维度 | prompt-based agent | BDI-LLM agent |
|---|---|---|
| 决策机制 | LLM 一次推理 | BDI 循环 + LLM evolution |
| 可审计 | 弱（黑盒） | 强（plan library 显式） |
| 自我演化 | 改 prompt（人手） | 改 plan code（自动） |
| 稳定性保证 | 无 | invariant test |
| 实现复杂度 | 低 | 高 |
| 适合场景 | 短期 / 探索性 | 长期 / 高合规 |
| 调试难度 | 难（看 prompt 改写） | 中（看 plan diff） |

### 案例 3：multi-agent 协调时的演化

两个 agent A 和 B 协作处理订单。A 负责拣货 B 负责打包。运行中发现 A 经常把易碎品丢给 B 摔坏。Evolution module 在 A 这边生成新 plan："给易碎品加 fragile flag"，同时通知 B 加新 plan："看到 fragile flag 时换包装方法"。两个 agent **协调演化**——这是 BDI-LLM 比单 agent self-instruct 更强的地方。

### 案例 4：失败案例——LLM 生成的 plan 破坏了原有能力

agent 学到一个新 plan："优先处理紧急订单"。LLM 写的 plan 把 "紧急" 定义得过宽——所有订单都被标紧急。结果非紧急订单全部排队卡住。这条 plan 没被 invariant test 拦下来（因为 invariant 只检查"能不能处理"不检查"FIFO 顺序"）。论文用这个案例论证 invariant 设计本身就是难题——怎么把"系统应有的所有性质"形式化是 self-evolving 还没解决的硬骨头。

## 踩过的坑

1. **新代码破坏旧能力**：LLM 生成的 plan 看起来对，但和现有 plan 冲突。invariant test 不全的话漏检——论文坦白这是当前最大限制，作者称之为 "behavioral inheritance" 问题。
2. **multi-agent 协调演化的同步问题**：A 改了 B 没改，B 还按老协议跑，结果整个系统 deadlock。需要全局 evolution coordinator，但这个设计还没成熟。
3. **plan library 膨胀**：演化久了 plan 太多，BDI 选择时变慢；要做 plan deduplication / merging，但合并语义不平凡。
4. **LLM 生成的代码安全性**：自我修改的程序如果生成恶意代码（如绕过监管）很危险；论文用 sandbox 但仍是 open problem，作者列为未来工作。

## 适用 vs 不适用场景

适用：

- 长期运行、环境会变化的 agent（如 IoT 控制、个人助理、智能家居）
- 需要审计推理过程的合规场景——BDI 的 plan library 是显式的
- multi-agent 系统需要协议自适应的场景
- 学术研究——验证 self-evolving 架构的设计空间
- 边缘设备需要离线演化（LLM 推理 + BDI 执行可解耦部署）

不适用：

- 短期任务 / 一次性 agent——演化优势体现不出来
- 不允许 agent 自我修改的强合规场景（如医疗 / 金融核心决策）
- 没有足够执行历史的冷启动场景——LLM 没东西学
- 资源紧张的环境——BDI 循环 + evolution 双线程开销大
- 团队没有 BDI 经验——直接 prompt-based 起步更现实

## 历史小故事（可跳过）

- 1987：Bratman 提出 BDI 哲学框架，最初是研究人类意向性的
- 1995：Rao & Georgeff 把 BDI 形式化为 agent 架构（PRS 系统）
- 2000s：JADE / Jason 等 BDI 框架成熟，但应用受限于"规则要人写"
- 2010s：MAS 研究小众化，工业界转向消息中间件 + 微服务
- 2023：LLM 工具调用爆发，agent 研究主流转向 prompt-based
- 2025：研究者反思纯 LLM agent 的可审计性问题，BDI 重新被提及
- 2026：Robol & Giorgini 把 LLM 接回 BDI 的 evolution layer，BDI 复活

## 学到什么

- agent 架构有"骨架 vs 肌肉"之分——骨架是 BDI / plan library / invariant，肌肉是 LLM 推理
- 单纯 prompt-based agent 没"骨架"，所以稳定性差
- self-evolving 的核心难题不是"如何生成新代码"而是"如何确保新代码不破坏旧能力"
- multi-agent 协调演化是下一个研究前沿——单 agent self-instruct 已被验证，多 agent 还没
- 1987 年的 BDI 框架在 2026 年因为 LLM 复活，提醒我们老论文里的好想法可能等的是另一项技术成熟

## 延伸阅读

- arXiv 2604.27264 — 原论文
- Bratman 1987 《Intention, Plans, and Practical Reason》——BDI 哲学源头
- Rao & Georgeff 1995 《BDI Agents: From Theory to Practice》——形式化 BDI
- [[self-evolving-agents-survey]] — 综述里 BDI-LLM 章节
- [[code-as-agent-harness]] — code-as-action 的另一种自我修改方式
- [[apex-policy-exploration]] — policy 演化的 RL 视角
- [[memcoder-co-evolution]] — 工程实战中的 self-evolving 案例

## 关联

- [[self-evolving-agents-survey]] —— 综述把 BDI-LLM 列为"architecture-driven evolution"
- [[code-as-agent-harness]] —— 同样让 agent 改代码，但没有 BDI 骨架
- [[apex-policy-exploration]] —— policy evolution 的 RL 版，与 BDI evolution 互补
- [[evo-memory-2511]] —— 长期记忆是 evolution module 的输入
- [[memcoder-co-evolution]] —— 工程视角的 self-evolving，关注 commit 历史
- [[misevolution-2509]] —— 反例：evolution 没 invariant 检查会怎样
- [[eve-agent-evidence]] —— evidence-grounded 训练在 BDI 里可作为 desire 的源
- [[llm-wiki-retrieval-reasoning]] —— retrieval as reasoning 是 BDI 中 belief 更新的兄弟问题

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[apex-policy-exploration]] —— APEX — 给自进化 agent 配一张"策略图"防止它走老路
- [[code-as-agent-harness]] —— Code as Agent Harness — 把代码当 agent 的"骨架"来重新看 agentic AI
- [[eve-agent-evidence]] —— EVE-Agent — 自我训练前先把证据钉在桌上
- [[evo-memory-2511]] —— Evo-Memory — 给"会自己长记性"的 agent 出一份统一考卷
- [[llm-wiki-retrieval-reasoning]] —— LLM-Wiki — 把外部知识编译成 agent 自己的"维基"
- [[memcoder-co-evolution]] —— MemCoder — code agent 跟着你 git commit 一起成长
- [[misevolution-2509]] —— Misevolution — 自进化 agent 也会"越改越坏"，连顶配模型也躲不过
- [[self-evolving-agents-survey]] —— 自进化 AI agent 综述 — 给"会自己升级"的 agent 画一张统一地图

