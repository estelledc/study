---
title: BDI-LLM Self-Evolving Agents — 让 agent 自己改自己源代码
来源: 'Marco Robol, Paolo Giorgini, "Self-Evolving Software Agents", AAMAS 2026 Extended Abstract, arXiv:2604.27264'
日期: 2026-06-01
分类: agents
难度: 高级
---

## 是什么

Self-Evolving Software Agents 是一种**让 agent 既能像人一样推理（信念-愿望-意图），又能像编程一样自己改自己代码**的架构。日常类比：像一个员工不只会按 SOP 干活，还会自己写新 SOP，并把过期的删掉。普通 LLM agent 是按预设 prompt 反应，BDI-LLM agent 是会重写自己 prompt 和工具的，而且重写时还会做自检测确保没破坏旧能力。

BDI 是 1980 年代多智能体系统（MAS）的经典框架——Belief（信念，agent 知道什么）、Desire（愿望，agent 想达成什么）、Intention（意图，agent 当前在执行哪条计划）。它的优点是**显式推理**——agent 的决策可被读出来。缺点是规则要人手写，agent 自己学不到新东西。

LLM 进来填这个缺：把 LLM 接在 BDI 的 evolution module 上，让它读 agent 自己的执行历史，**合成新的 desire / intention / 可执行代码**。整套系统的核心动作是"agent 在跑业务的同时，后台还在改自己"。论文原型在 Deliveroo.js 风格的动态多 agent 配送环境里，展示了从极少先验知识出发，自主发现目标并生成可执行行为。

## 为什么重要

不理解 BDI-LLM 这条路线，下面这些事都没法解释：

- 为什么"prompt-based agent" 走到一定程度就遇到瓶颈——prompt 是人写死的，agent 改不动
- 为什么 multi-agent 系统的协调能力受限于"协议必须事先定义"的传统假设
- 为什么"自我修改的程序"在 1980 年代提过但近几年才能跑——LLM 是缺的最后一块拼图
- 为什么"行为继承"（behavioral inheritance）是 self-evolving agent 的稳定性核心问题

## 核心要点

BDI-LLM agent 的运作可以拆成 **三步**：

1. **BDI 推理循环**：每个决策回合（tick）agent 检查 beliefs 和 desires，按既定 plan library（计划库）选择 intentions 执行。这层相对结构化，相当于 agent 的"骨架"——决策路径可被读出来。骨架先稳住，演化发生在它之上。

2. **Evolution module（LLM 驱动）**：与推理循环**并行、隔离**的后台模块，监控经验，识别"当前知识/目标/动作库覆盖不了的需求"，再走 variation → selection → inheritance 的演化周期，合成新的目标、推理结构或可执行 plan。类比：前台按 SOP 接单，后台另开一间"改制度办公室"。

3. **环境筛选，而非完备门禁**：新行为靠与环境交互验证——成功的保留复用，无效的丢弃。论文把 **behavioural inheritance**（旧能力在演化后是否还在）列为开放限制，而不是声称已有完备 invariant 测试套件。类比：新 SOP 上线后靠实操试错，老板还没写出"所有旧业务必须仍能办"的完整检查表。

## 实践案例

### 案例 1：配送 agent 从零发现「取货→送货」目标

论文原型：agent 只拿到环境文字说明 + 最小 API，没有预置领域目标。按三步跟：

1. **感知卡住**：看到地图上有包裹/骑手，但当前 belief/desire 结构解释不了「该干什么」→ evolution module 触发。
2. **LLM 合成**：生成新 desire（如「把包裹从餐厅送到顾客」）和可执行 plan（调用移动/取货/交付 API）。
3. **环境筛选**：plan 在仿真里跑一遍；能完成交付就保留进 plan library，失败则丢弃。

```python
def deliver_order(beliefs):
    # 演化后才出现的 plan：先取后送
    if beliefs.has_package_at_restaurant:
        return Intention("pickup_then_move_to_customer")
    if beliefs.carrying_package:
        return Intention("dropoff_at_customer")
```

这是「骨架先稳（BDI 循环），肌肉后长（LLM 写 plan）」的最小可跟版本。

### 案例 2：和 prompt-based agent 对照着改一处

假设你要加「雨天优先室内取货点」：

1. **prompt-based**：改系统 prompt 加一句规则 → 黑盒，难审计，也难保证旧规则还在。
2. **BDI-LLM**：evolution module 产出一条新 plan（雨天改取货点），仍挂在显式 plan library 里；推理循环继续按 BDI 选 intention。
3. **对照检查**：打开 plan diff，看新增的是哪条、旧的取货 plan 是否还在——这就是「可审计」比纯 prompt 强的地方。

| 维度 | prompt-based | BDI-LLM |
|---|---|---|
| 决策 | 一次 LLM 推理 | BDI 循环 + 并行 evolution |
| 可审计 | 弱 | plan library 显式 |
| 自我演化 | 人手改 prompt | 自动合成 plan/目标 |
| 稳定性 | 无结构保证 | 环境筛选；inheritance 仍开放 |

### 案例 3：多 agent 协作时的协调演化（教学推演）

两个配送 agent：A 取货、B 交接。运行中 A 常把易碎品直接丢给 B。教学上可拆三步（论文 outlook 也提到集体/协作演化，原型本身仍偏单 agent 发现目标）：

1. A 侧 evolution 生成 plan：「易碎品加 `fragile` flag」。
2. 通知/共享后，B 侧加 plan：「见 flag 则换包装动作」。
3. 若只改 A 不改 B，协议不一致 → deadlock；需要协调，否则各演化各的。

### 案例 4：失败模式——新行为冲掉旧能力（对应论文限制）

教学推演（非论文原实验）：agent 学到「优先紧急单」，但把「紧急」定义过宽，普通单全卡住。环境交互可能仍显示「能处理订单」，却丢了公平/顺序这类旧期望。论文用 preliminary results 指出：复杂度上升时 **behavioural inheritance** 与稳健性不足——难题是「如何保住旧能力」，不是「LLM 会不会写新代码」。

## 踩过的坑

1. **新代码冲掉旧能力**：LLM 生成的 plan 看起来对，却和现有 plan 冲突；论文明确指出 behavioural inheritance / 稳健性是当前最大限制。
2. **把「环境试错」当成「完备证明」**：原型靠交互筛选成功行为，并不等于形式化 invariant 门禁——复杂度一升就漏。
3. **multi-agent 各演化各的**：A 改了协议 B 没改，容易 deadlock；集体/协作演化仍是 outlook，不是已交付能力。
4. **plan library 膨胀 + 代码安全**：演化久了选择变慢；自我修改若生成绕过约束的代码，sandbox 仍是 open problem。

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

- agent 架构有"骨架 vs 肌肉"之分——骨架是 BDI / plan library，肌肉是 LLM 合成；evolution 与推理循环隔离是关键设计
- 单纯 prompt-based agent 缺显式骨架，长期演化难审计
- self-evolving 的核心难题不是"如何生成新代码"而是"如何继承旧行为、稳住复杂度"
- 论文原型证明「从极少先验发现目标」可行；多 agent 集体演化仍是下一步
- 1987 年的 BDI 框架在 2026 年因 LLM 被重新接上 evolution layer，老想法常在等另一项技术成熟

## 延伸阅读

- arXiv 2604.27264 — 原 Extended Abstract（AAMAS 2026）
- Bratman 1987 《Intention, Plans, and Practical Reason》——BDI 哲学源头
- Rao & Georgeff 1995 《BDI Agents: From Theory to Practice》——形式化 BDI
- [[self-evolving-agents-survey]] — 综述里 architecture-driven evolution 章节
- [[code-as-agent-harness]] — code-as-action 的另一种自我修改方式
- [[misevolution-2509]] — 反例：演化缺少稳住机制会怎样

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

