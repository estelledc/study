---
title: "01. 范围、方法与仓库清单"
sidebar:
  hidden: true
---
# 01. 范围、方法与仓库清单

## 1. 研究范围

本轮研究对象是“可长期运行、拥有工具和跨会话状态、能通过记忆或
Skill 从经验中适应的开源个人 Agent / Agent harness”，主对象为
[NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent)。

不是所有名字里含 `agent`、`hermes` 或 `claw` 的项目都属于同一类。
本轮至少要求满足以下一项强关系：

- Hermes 官方仓库、官方扩展或明确针对 Hermes 的架构改造；
- Hermes 的完整语言重写、直接分支或完整认知/记忆替代层；
- 能运行完整个人 Agent 主链，而不是单个工具、Skill 或 UI；
- 对 gateway、长期记忆、自演化、隔离或权限作出有代表性的架构选择；
- 代码公开、可 clone、有可识别的核心实现和近期维护证据。

## 2. 筛选原则

优先纳入：

- canonical 上游，而不是普通镜像 fork；
- 有明确 agent loop、状态边界和工具执行链；
- 近一年活跃，或虽小众但对 Hermes 有直接设计关系；
- 能形成互补对比，例如“轻量 vs 完整”“容器 vs WASM”“记忆优先
  vs gateway 优先”“Skill 外部化 vs 参数训练”。

不把 star 当质量分数。高 star 可能来自产品传播，低 star 项目也可能
包含很清晰的实验性架构。star 只用于描述社区规模。

## 3. 22 个正式研究对象

### 3.1 主项目与直接生态

| 项目 | 2026-07-16 star | pinned commit | 入选原因 |
|---|---:|---|---|
| NousResearch/hermes-agent | 215.8k | `336620447422` | 主研究对象；完整 Agent、gateway、memory、Skill、cron、subagent |
| NousResearch/hermes-agent-self-evolution | 4.7k | `0a929e3aa20e` | 官方 DSPy + GEPA Skill 优化外循环 |
| 0xNyk/awesome-hermes-agent | 4.7k | `3981a1a7bd49` | Hermes 生态索引，覆盖插件、记忆、UI、部署和衍生项目 |
| Lumio-Research/hermes-agent-rs | 71 | `9a145877cacf` | Rust 重写；trait 化 provider/tool/channel/memory |
| 519lab/thoth-agent | 2 | `563f9ac73ec9` | Hermes 衍生；PostgreSQL cognitive substrate |
| mnemosyne-oss/mnemosyne | 1.5k | `e5adea1aed9b` | Hermes-first 的 BEAM SQLite 记忆提供者 |
| atxgreene/Mnemosyne | 2 | `4f9942f552b7` | 独立六层认知 harness 与规则型自改进实验 |
| nativ3ai/hermes-agent-camel | 192 | `8652f9829083` | Hermes 的 CaMeL 信任边界实验 |
| howdymary/hermes-agent-metaharness | 101 | `b16ffed1cbb1` | Hermes benchmark harness 的外层搜索/比较工具 |

### 3.2 完整运行时与同类对照

| 项目 | 2026-07-16 star | pinned commit | 主要对照价值 |
|---|---:|---|---|
| openclaw/openclaw | 383.1k | `0340d7c0c143` | gateway/control-plane 优先的完整个人 Agent 平台 |
| HKUDS/nanobot | 45.7k | `6519737860a4` | Python 小核心、显式 turn state machine |
| nanocoai/nanoclaw | 30.3k | `e926e30eb74c` | 每 Agent group 容器隔离，复用 Claude Agent SDK |
| sipeed/picoclaw | 29.8k | `85dcfccad66d` | Go 单体，面向边缘设备与跨平台渠道 |
| zeroclaw-labs/zeroclaw | 32.3k | `0528f98936d1` | Rust 可替换微内核、风险 profile 与多 sandbox |
| nearai/ironclaw | 12.5k | `0b3b3fcc8e8d` | WASM 工具沙箱、宿主注入凭证、安全优先 |
| agent0ai/agent-zero | 18.4k | `fddcc3deea3d` | Docker Linux 工作台、可编辑 prompt/tool/plugin |
| letta-ai/letta-code | 2.9k | `3bd543dc6425` | stateful Agent、MemFS、git 化上下文和 mods |
| alien-id/lethe | 125 | `35e860ae8f6a` | Rust Actor 认知架构、持久未完成任务、主动通知 |
| lsdefine/GenericAgent | 13.5k | `804155475a4a` | 极简 loop、原子工具、分层 SOP 记忆 |
| wangziqi06/724-office | 1.0k | `96561ce79789` | 纯 Python 生产型个人 Agent，结构化 nudge |
| aiming-lab/MetaClaw | 3.5k | `922caf3a1cd0` | 透明代理上的 Skill 注入、记忆与 LoRA/RL 慢更新 |
| tamler/odigos | 2 | `7e9976937567` | 结构化记忆、异步 specialist、trial promote/revert |

`atemerev/lethe` 在研究过程中已迁移到 `alien-id/lethe`；本地
`upstream` 已改为 canonical 新地址。

## 4. GitHub fork 与本地 clone 结果

- GitHub 个人账号：`estelledc`。
- 21 个新 fork 创建成功；`estelledc/nanobot` 原已存在并复用。
- 两个同名 Mnemosyne 使用不同 fork 名：
  - `estelledc/mnemosyne` 对应 `mnemosyne-oss/mnemosyne`；
  - `estelledc/mnemosyne-harness` 对应 `atxgreene/Mnemosyne`。
- 每个本地仓库：
  - `origin` 指向 `git@github.com:estelledc/<fork>.git`；
  - `upstream` 指向 canonical 上游；
  - 保留独立 `.git`；
  - 工作树在研究完成时均为 clean。

本地路径统一为：

```text
projects/<name>/
```

其中 `projects/nanobot/` 是此前已有 clone，其余 21 个为本轮新增。

## 5. clone 约束

本轮严格沿用本仓第三方源码约定：

1. 父仓 `.gitignore` 对每个 `projects/<name>/` 精确忽略。
2. clone 参数统一为：

```bash
git clone \
  --depth=1 \
  --filter=blob:none \
  --sparse \
  --single-branch \
  --no-tags \
  git@github.com:estelledc/<fork>.git \
  projects/<name>
```

3. 先 materialize 根目录，再按研究问题只展开核心源码。
4. 不运行第三方安装脚本，不创建仓内虚拟环境，不下载模型或测试数据。
5. 第三方源码只读；研究材料写在当前目录。
6. GitHub fork 保存服务端历史，本地 commit 是本轮可重复定位的快照。

这项约束尤其重要：

- Hermes GitHub API 标称约 491 MiB；
- OpenClaw 标称约 1.9 GiB；
- Thoth 标称约 155 MiB；
- 全量 clone 还可能触发测试 fixture、图片、前端和 vendored 依赖。

部分 clone 让本轮只展开入口、agent、memory、skills、security、gateway、
cron 和测试等关键路径，而不是把所有对象一次下载到本机。

## 6. 逐仓源码采样模板

每个项目使用同一组问题：

1. **入口**：消息怎样进入系统？
2. **控制流**：Agent loop 是 while loop、状态机、Actor 还是 SDK 包装？
3. **状态**：会话、记忆、任务和中断怎样持久化？
4. **扩展**：工具、Skill、插件、MCP、provider 怎样注册？
5. **并发**：工具、子 Agent、渠道和定时任务怎样隔离？
6. **安全**：审批、命令守卫、容器、WASM、凭证边界在哪里？
7. **自我改进**：更新的是记忆、Skill、prompt、控制逻辑还是模型参数？
8. **验证**：候选更新是否有测试、benchmark、admission gate 和 rollback？
9. **组织**：目录结构是否与运行时边界一致？
10. **成熟度**：哪些是代码事实，哪些只是文档目标？

## 7. 候选池与排除项

以下项目在搜索中出现，但不进入逐仓深度样本：

| 类型 | 示例 | 不纳入原因 |
|---|---|---|
| UI / 控制面 | AionUi、Hermes Studio、hermes-workspace | 主要包装已有 Agent，不拥有完整推理主链 |
| Skill 集合 | wondelai/skills、gstack、awesome-openclaw-skills | 研究对象是能力包，不是完整运行时 |
| 单一插件 | rtk-hermes、hermes-snow-search、hermes-bus | 只补一个能力面 |
| 部署模板 | Helm chart、Railway、AWS Bedrock sample、Nix module | 主要研究部署，不改变 Agent 架构 |
| 普通 Hermes fork | 大量未形成独立设计的 `hermes-agent` fork | 与上游差异不足 |
| 托管产品 | Manus、Claude Cowork、Perplexity Computer | 核心源码不可审计 |
| 通用 Agent 库 | LangGraph、CrewAI、AutoGen | 是构建库，不是本轮的长期个人 Agent 产品形态 |
| 纯 memory 基础设施 | mem0、Hindsight、Honcho、OpenViking | 作为生态层引用；本仓已有 mem0 研究，避免扩散范围 |
| 低证据新仓 | 大量 0-3 star 的“self-evolving agent” | 缺少可验证核心、测试或明确差异 |

这不表示它们没有价值，只表示本轮需要一个能逐仓验证、能形成稳定
横向比较的固定语料集。

## 8. 风险与限制

- 稀疏 clone 下的文件数和代码行只代表已 materialize 的研究切片，
  不能当完整仓库规模。
- 本轮未安装依赖，因此没有把 README 中的可运行声明当成实测结论。
- 项目方 benchmark 未做统一硬件、模型、提示和任务集对齐，不能横向排名。
- 同名词可能含义不同，例如 OpenClaw 的 dreaming、Hermes 的 background
  review、Mnemosyne 的 sleep/consolidation 不是同一个算法。
