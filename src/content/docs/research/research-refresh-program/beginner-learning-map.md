---
title: "14 类研究的零基础学习地图"
sidebar:
  hidden: true
---
# 14 类研究的零基础学习地图

## 先说结论

这 14 类不是一门必须从第 1 章读到第 147 章的课程。它们更像一张技术城市地图：

- 类别是城区；
- 201 个项目是具体建筑；
- README 是地铁图；
- 最小实验是第一次下车步行；
- 源码锚点是门牌号；
- E0-E3 是“这条信息亲自验证到哪一步”的标记。

零基础读者每次只做一件事：

```text
选一个问题
  -> 读一个类别入口
  -> 跑一个最小实验
  -> 精读一个锚点项目
  -> 做一个新场景迁移题
```

不要先安装 201 个项目，也不要把“文档看完”当成掌握。

## 五个共通概念

### 1. 输入与输出

任何系统先问：

```text
它收到什么
  -> 中间怎样变形
  -> 最后产出什么
```

例如：

- Agent Runtime：message → model/tool loop → events/result；
- 文档解析：PDF → blocks/Markdown/JSON；
- 视频 AI：video → timestamp evidence → answer/rubric；
- Tutor：learner attempt → feedback/mastery evidence。

### 2. 状态

状态（state）是系统需要记住、以后还要继续使用的信息。

日常类比：快递单上的“已揽收、运输中、已签收”。如果只在聊天里说“已经运输”，
进程重启后就无法恢复。

### 3. 身份

身份（identity）回答“这是同一个什么”：

- 同一个 run；
- 同一个文档 block；
- 同一个 learner attempt；
- 同一个视频证据；
- 同一个 canonical upstream。

没有稳定身份，重试、去重、恢复和比较都会混乱。

### 4. Gate

Gate 是可执行的通过条件，不是“看起来差不多”：

```text
输入是否合法
状态是否允许
证据是否齐全
输出是否符合 schema
外部操作是否获授权
```

### 5. 证据等级

| 等级 | 你真的做了什么 | 可以怎样表述 |
|---|---|---|
| E0 | 只读项目自述 | “README 声称……” |
| E1 | 检查固定源码 | “该提交中的代码表明……” |
| E2 | 本机真实运行 | “命令运行得到……” |
| E3 | 有 PR/Issue/部署/用户结果 | “外部流程显示……” |

最大的学习误区，是把 E0/E1 说成 E2/E3。

## 路线选择

### 路线 A：我完全不知道 Agent 怎样工作

```text
中国独立开发者列表
  -> Provider 切换
  -> Coding Agent Runtime
  -> Agent Skills
  -> Trellis / Harness
  -> LangGraph
```

你会依次理解：

1. Markdown 也可以是数据；
2. 配置、进程和流量是三种不同状态；
3. Agent 本质是 model-tool loop；
4. Skill 是可安装的自然语言软件资产；
5. Harness 把自然语言流程变成状态、工件和 gate；
6. Graph 把分支、并行、恢复和人工暂停显式化。

### 路线 B：我想理解生产级长期 Agent

前置：先完成 Coding Agent Runtime 的最小 loop。

```text
Coding Agent Runtime
  -> LangGraph
  -> LambChat
  -> Hermes Agent
  -> 系统提示词泄露与防御
```

重点不是“Agent 越多越好”，而是：

- durable state；
- idempotency；
- tenant / credential / tool boundary；
- lease、receipt、uncertain outcome；
- prompt 公开后仍成立的权限控制。

### 路线 C：我想做 AI 研究或教学系统

```text
MinerU / 文档解析
  -> ResearchStudio
  -> DeepTutor
```

你会依次理解：

1. 来源文档怎样变成可引用结构；
2. 研究 run 怎样由 artifact、provenance 和 gate 组成；
3. 系统完成、当题正确、mastery 和 learning gain 为什么不是一件事。

### 路线 D：我想理解图片与视频 AI

前置：知道 token 和 Transformer 只需基础直觉，不要求先学训练数学。

```text
MinerU / 文档解析
  -> FastVLM
  -> 多模态视频 AI
```

重点依次是：

- 文本、顺序、结构和坐标证据；
- 视觉 encoder、projector、LLM prefill 的成本位置；
- 视频的时间轴、问题驱动回看和跨模态冲突。

### 路线 E：我只想提高证据与安全意识

```text
中国独立开发者列表
  -> ResearchStudio
  -> 系统提示词泄露与防御
```

三步分别训练：

- 公开仓状态与自动化结果不能混写；
- artifact 存在与 gate 通过不能混写；
- prompt 文本、secret 和授权边界不能混写。

## 14 类第一站

每一行都是一个独立的 30 分钟起点。

| 类别 | 先建立的直觉 | 第一个实验 | 30 分钟通过标准 |
|---|---|---|---|
| [中国独立开发者列表](../chinese-independent-developer-study/00-final-reader-map.md) | Markdown 可以同时是数据库和协作界面 | [只读数据探针](../chinese-independent-developer-study/01-hands-on-lab.md) | 能解释条目、状态、重复和 Routine 失败是四类证据 |
| [Provider 切换](../switch-tools-study/00-final-synthesis.md) | 配置源、运行投影和代理流量不是同一层 | [验证实验](../switch-tools-study/09-beginner-verification-lab.md) | 能说明切换成功至少要验证哪些状态 |
| [Coding Agent Runtime](../coding-agent-runtime-study/00-final-reader-map.md) | Agent 是可取消、可结算的 model-tool loop | [最小 loop](../coding-agent-runtime-study/13-beginner-runtime-lab.md) | 能画出 message → model → tool → event → settle |
| [Agent Skills](../agent-skills-ecosystem-study/README.md) | Skill 是内容、触发、权限和发布共同组成的软件资产 | [生命周期实验](../agent-skills-ecosystem-study/08-beginner-skill-lifecycle-lab.md) | 能分开 Parse、Route、Act、Outcome |
| [Trellis / Harness](../trellis-agent-harness-ecosystem-study/README.md) | Harness 把“记得做”变成状态和 gate | [最小 SDD/Harness](../trellis-agent-harness-ecosystem-study/12-beginner-sdd-harness-lab.md) | 能解释机器状态和上下文合同为什么要同时检查 |
| [LangGraph](../langgraph-ecosystem-study/README.md) | 图是共享状态上的受控转移，不是画流程图 | [StateGraph 实验](../langgraph-ecosystem-study/09-beginner-stategraph-lab.md) | 能解释 reducer、checkpoint 和 exactly-once 的边界 |
| [LambChat](../lambchat-ecosystem-study/README.md) | 生产平台比 Agent loop 多身份、队列、凭证和恢复 | [最小平台](../lambchat-ecosystem-study/11-beginner-production-agent-platform-lab.md) | 能区分 run、event、operation 和 tenant identity |
| [Hermes Agent](../hermes-agent-ecosystem-study/README.md) | 长期 Agent 的关键是持续运行合同，不是长 prompt | [长期 Agent 实验](../hermes-agent-ecosystem-study/09-beginner-durable-agent-lab.md) | 能解释 lease、memory admission 和 skill rollback |
| [ResearchStudio](../researchstudio-ecosystem-study/README.md) | 研究完成权属于通过 gate 的 artifact | [artifact-first 实验](../researchstudio-ecosystem-study/07-beginner-artifact-first-research-lab.md) | 能区分 contract、environment、execution、scientific failure |
| [DeepTutor](../deeptutor-ecosystem-study/README.md) | “课程完成”不等于“学会” | [教学证据实验](../deeptutor-ecosystem-study/08-beginner-evidence-tutor-lab.md) | 能区分 answer、mastery estimate 和 independent transfer |
| [MinerU](../mineru-ecosystem-study/README.md) | PDF 提取不是只有“字符多不多”一个指标 | [同文档实验](../mineru-ecosystem-study/08-beginner-document-parser-lab.md) | 能分开 Text、Order、Structure、Provenance、Operations |
| [FastVLM](../fastvlm-ecosystem-study/00-final-reader-map.md) | 少 token 的位置决定真正省掉哪段成本 | [端侧预算实验](../fastvlm-ecosystem-study/07-beginner-edge-vlm-budget-lab.md) | 能区分 vision、projector、prefill、decoder pruning |
| [多模态视频 AI](../multimodal-video-ai-open-source-study/README.md) | 检索负责定位，原始时间窗负责确认 | [视频证据实验](../multimodal-video-ai-open-source-study/08-beginner-video-evidence-lab.md) | 能处理缺步骤、乱序、ASR/视觉冲突和 frame provenance |
| [系统提示词泄露](../system-prompt-leak-ecosystem-study/00-final-reader-map.md) | Prompt 是岗位手册，不是保险箱和门禁 | [离线防御实验](../system-prompt-leak-ecosystem-study/11-beginner-prompt-defense-lab.md) | 能分开来源、secret、canary、tenant 和 approval |

## 掌握等级

每个类别都用同一套五级标准，避免“看完了”这种模糊状态。

| 等级 | 证据 |
|---|---|
| M0 定位 | 能用一句话说它解决什么问题，不与相邻类别混淆 |
| M1 运行 | 能运行最小实验，解释每行输出 |
| M2 追踪 | 能从入口沿 3-8 步主链找到源码锚点 |
| M3 取舍 | 能比较两种方案的收益、代价和不适用场景 |
| M4 迁移 | 面对新案例，能选择 gate、证据和失败分类 |

本材料提供到 M1-M3 的路径。M4 必须由你在新场景中的独立表现证明，不能由文档替你
宣布。

## 每次学习的 45 分钟模板

### 0-5 分钟：主动回忆

不看正文，先写：

1. 输入是什么？
2. 输出是什么？
3. 最怕哪种失败？

### 5-15 分钟：建立直觉

只读类别 README 的结论和路线，不展开所有项目。

### 15-30 分钟：运行实验

记录：

```text
command
actual output
evidence level
what it does not prove
```

### 30-40 分钟：追一个源码锚点

只追一条控制流，不同时打开多个仓。

### 40-45 分钟：迁移题

把实验变量改一个：

- 重复输入；
- 中途崩溃；
- 缺字段；
- 跨 tenant；
- 上游漂移；
- 同值但不同 ownership。

先预测，再运行或查证。

## 选择项目的规则

每个类别可能有 1-27 个项目。选择顺序：

1. **先选锚点项目**：理解类别主链。
2. **再选一个相反方案**：理解 trade-off。
3. **最后选业务相近项目**：做迁移。

例如 FastVLM：

```text
FastVLM
  -> FastV（不同成本位置）
  -> MiniCPM-V Apps（不同 runtime/产品边界）
```

不是把 21 个仓库从 A 到 Z 顺序读完。

## 失败分诊

实验失败时先分类：

| 类型 | 例子 | 下一步 |
|---|---|---|
| Contract | schema、字段、路径不符 | 修输入或调用协议 |
| Environment | 缺依赖、GPU、账号 | 记录 blocker，做本地替代实验 |
| Execution | timeout、crash、竞态 | 收集日志、最小复现 |
| Evidence | 文件存在但 hash/source/gate 不足 | 补 provenance 或验证 |
| Scientific/Product | 代码运行但效果不成立 | 保留负结果，修改假设 |

不要用“多试几次”掩盖类别错误。

## 全局完成证据

本轮研究范围由以下文件共同冻结：

- [研究合同](README.md)
- [覆盖矩阵](coverage-matrix.md)
- [机器清单](manifest.json)
- `completion_audit.py`

运行：

```bash
cd src/content/docs/research/research-refresh-program
PYTHONDONTWRITEBYTECODE=1 \
  python3 completion_audit.py --check-worktrees
```

它检查：

- 14 个类别；
- 209 个类别成员关系；
- 202 张唯一项目卡；
- 201 个 canonical upstream；
- 204 个本地副本；
- 160 个 `research/repos` clone；
- 44 个旧 `projects/` 正式副本；
- 每类入口、实验、自测、答案检查和项目来源提及；
- 14/14 覆盖矩阵；
- 204/204 正式源码工作树。

这个审计证明“学习包结构和冻结范围闭合”，不证明 201 个上游在所有硬件、账号和
真实业务中都运行成功。每个类别的 E2/E3 边界仍以各自 README 为准。
