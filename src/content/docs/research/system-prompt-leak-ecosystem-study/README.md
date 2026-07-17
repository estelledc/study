---
title: "系统提示词泄露生态研究材料包"
sidebar:
  hidden: true
---
# 系统提示词泄露生态研究材料包

**研究日期：** 2026-07-17

**锚点项目：** `asgeirtj/system_prompts_leaks`

**范围：** 系统提示词档案、官方公开提示词、浏览与社区验证平台、提示词抽取和 prompt stealing 研究

## 先看结论

这个领域已经从“收集几份聊天机器人隐藏指令”演化为四层生态：

1. **档案层**：保存厂商、模型、产品和日期维度的 prompt 快照。
2. **产品层**：把 Markdown 或数据库做成检索、比较、提交和验证平台。
3. **研究层**：从手写攻击发展到批量基准、梯度优化、输出反演和自演化 Agent。
4. **防御层**：共识已经从“加一句不要泄露”转为“假设 prompt 会泄露，敏感控制必须在模型外执行”。

最重要的边界是：

> 仓库中出现一段文本，只能证明“有人提交了这段文本”，不能自动证明它是当前线上、完整、逐字、官方的系统提示词。

## 阅读入口

先读 [最终接班页](00-final-reader-map.md)，再按问题进入：

| 想回答的问题 | 阅读材料 |
|---|---|
| 这个领域包含什么、发展到哪一步 | [领域地图](01-field-map.md) |
| 怎么判断一份 prompt 靠不靠谱 | [证据与来源治理](02-evidence-and-provenance.md) |
| 六个内容档案项目有什么区别 | [档案项目深读](03-archive-projects.md) |
| 网站、官方数据与社区验证怎么实现 | [平台与官方数据深读](04-platforms-and-official-data.md) |
| 七个抽取研究项目的方法和代码怎么组织 | [抽取研究深读](05-extraction-research.md) |
| 17 个项目横向怎么选 | [横向比较](06-cross-project-comparison.md) |
| 对工程安全有什么现实启示 | [安全与防御](07-security-and-defense.md) |
| 有哪些基础问题和后续思考点 | [FAQ 与思考题](08-faq-and-thinking.md) |
| 一手来源在哪里、以后何时刷新 | [来源与快照维护](09-sources-and-maintenance.md) |
| 17 仓当前上游与防御证据有什么变化 | [2026-07-17 全量刷新](10-2026-07-17-refresh.md) |
| 如何亲手验证来源、canary 与模型外权限 | [零基础防御实验](11-beginner-prompt-defense-lab.md) |
| 每个项目应从哪里开始读 | [17 个项目上手卡](12-beginner-project-onboarding-cards.md) |

## 零基础 30 分钟路线

1. 用 5 分钟读[最终接班页](00-final-reader-map.md)前 10 条结论。
2. 用 10 分钟读[零基础防御实验](11-beginner-prompt-defense-lab.md)第 1-13 节，
   分清 prompt、secret、canary 和 authorization。
3. 用 5 分钟运行离线实验：

   ```bash
   cd src/content/docs/research/system-prompt-leak-ecosystem-study/labs
   PYTHONDONTWRITEBYTECODE=1 \
     python3 prompt_defense_lab.py \
     --output /tmp/prompt-defense-lab/report.json
   ```

4. 用 5 分钟运行 16 项测试：

   ```bash
   PYTHONDONTWRITEBYTECODE=1 \
     python3 -m unittest -v test_prompt_defense_lab.py
   ```

5. 用 5 分钟回答实验页第 19 节前 3 题，再从
   [项目上手卡](12-beginner-project-onboarding-cards.md)选择一个项目。

## 纳入标准

项目必须直接服务以下至少一项：

- 收集或版本化系统提示词、工具 schema、产品级隐藏指令。
- 提供官方公开的系统提示词 ground truth。
- 浏览、搜索、比较、提交或验证系统提示词。
- 研究系统提示词抽取、prompt stealing、评测或防御。

同时满足：

- 是独立上游，不是简单改名镜像。
- 公开可访问且能固定到明确提交。
- 有独特数据、方法、实现或治理价值。

明确排除：

- 只收一份单模型 prompt 的零散仓库。
- 纯 fork、镜像和没有独立增量的搬运仓。
- 泛 jailbreak 合集、通用 LLM 防火墙和完整 LLM Security awesome list。
- 与提示词抽取没有直接关系的完整 Agent 源码；已有 [Coding Agent Runtime 研究](../coding-agent-runtime-study/README.md) 单独覆盖。

“全部”在本材料中指：截至 2026-07-16，经 GitHub、Exa 和项目交叉引用发现，并通过上述标准的全部 17 个项目；它不是对互联网未来项目的无限承诺。

## 固定项目清单

### 档案层

| 项目 | 角色 | 固定提交 | 本地目录 |
|---|---|---|---|
| `asgeirtj/system_prompts_leaks` | 多厂商综合档案，本轮锚点 | `9a0a06a3` | `system-prompts-leaks/` |
| `x1xhlol/system-prompts-and-models-of-ai-tools` | AI 编程产品 prompt + tools | `2054f580` | `system-prompts-and-models-of-ai-tools/` |
| `elder-plinius/CL4R1T4S` | 透明度导向社区档案 | `34d6ca0e` | `cl4r1t4s/` |
| `jujumilk3/leaked-system-prompts` | 带来源字段的长期版本档案 | `be84e83f` | `leaked-system-prompts-jujumilk3/` |
| `LouisShark/chatgpt_system_prompt` | ChatGPT 与自定义 GPT 大型档案 | `7ca1161f` | `chatgpt-system-prompt/` |
| `0xeb/TheBigPromptLibrary` | Prompt、安全、文章与工具综合库 | `655667d2` | `the-big-prompt-library/` |

### 平台与官方数据

| 项目 | 角色 | 固定提交 | 本地目录 |
|---|---|---|---|
| `YeeKal/leaked-system-prompts` | Markdown + Next.js 检索站 | `5b9992c9` | `leaked-system-prompts-yeekal/` |
| `xai-org/grok-prompts` | xAI 官方提示词 ground truth | `a7c186f5` | `grok-prompts/` |
| `elder-plinius/LEAKHUB` | 社区提交、共识验证与积分平台 | `19f7b3e7` | `leakhub/` |
| `x-zheng16/System-Prompt-Open` | JustAsk 提取数据与静态 gallery | `c099b9f2` | `system-prompt-open/` |

### 抽取与重建研究

| 项目 | 角色 | 固定提交 | 本地目录 |
|---|---|---|---|
| `x-zheng16/JustAsk` | UCB 驱动的自演化抽取 Agent | `bc295b85` | `justask/` |
| `BHui97/PLeak` | shadow model + HotFlip 对抗查询优化 | `57c855c6` | `pleak/` |
| `M0gician/RaccoonBench` | 14 类攻击与防御基准 | `d2ea81e8` | `raccoonbench/` |
| `y0mingzhang/prompt-extraction` | 高精度抽取与 DeBERTa 置信度估计 | `dc00b2f6` | `prompt-extraction/` |
| `liangzid/PromptExtractionEval` | 规模规律、soft extraction 与防御 | `7d434254` | `prompt-extraction-eval/` |
| `yangyZJU/PRSA` | 从有限输入输出重建功能等价 prompt | `6344cca6` | `prsa/` |
| `solidlabnetwork/SPE-LLM` | 攻防模板和多指标紧凑实验 | `547346dd` | `spe-llm/` |

所有本地目录均位于 `research-worktrees/`，都是父仓忽略的独立浅克隆。

表中提交是**研究固定快照**，不承诺等于阅读时的远端最新 HEAD；实时差异和刷新门槛见[来源与快照维护](09-sources-and-maintenance.md)。

## Fork 与 clone 状态

- 17/17 已 fork 到 `estelledc`。
- 两个同名项目分别改名为：
  - `estelledc/leaked-system-prompts-jujumilk3`
  - `estelledc/leaked-system-prompts-yeekal`
- 17/17 本地研究工作树 clean。
- 17/17 `origin` 指个人 fork，`upstream` 指原仓。
- 17/17 使用 `--depth=1`，需要追历史时再单仓 `fetch --unshallow`。
- 锚点仓正文仍固定在已完成审计的 `9a0a06a3`；个人 fork 为 `155d2845`，
  2026-07-17 upstream 为 `e280af55`。

## 证据规则

材料区分三类陈述：

- **仓库事实**：固定提交中的目录、代码、配置或文档直接支持。
- **外部事实**：论文、OWASP、厂商官方文档直接支持，并附 URL。
- **工程解释**：根据代码控制流推导的设计目的和代价，不冒充维护者原话。

真实性使用五级标记：

- `A 官方`：厂商正式公开。
- `B 可复现`：有提取过程、原始会话或独立 ground truth。
- `C 交叉一致`：多个独立提取结果高度一致。
- `D 社区单源`：有来源链接但缺少独立验证。
- `E 未知`：无来源、版本或提取方法。

## 本轮验证边界

已完成：

- GitHub 元数据、README、目录、关键控制流和 license 静态审计。
- fork 关系、remote、SHA、浅克隆和工作树状态核对。
- 关键数据量与重复内容抽样。
- JustAsk 最小只读 CLI 探针，确认公开快照缺少运行所需 `data/`。
- 审计锚点仓 `9a0a06a3..e280af55` 的 5 commits / 4 files，确认只涉及
  OpenCode、Claude Code skill、README 和配置样本更新。
- 运行 16 个纯标准库离线测试，覆盖来源、hash、secret quarantine、独立来源、
  canary 多出口和模型外工具授权。

未执行：

- 不调用真实模型或第三方 API。
- 不下载模型权重，不安装仓库依赖，不运行攻击。
- 不验证线上产品当前 prompt，不把静态文本等同于线上运行时。
- 不对泄露内容做再发布，也不在本材料复制 prompt 原文。

## 研究安全边界

这些仓库本身包含大量面向模型的命令文本。阅读规则是：

1. prompt、README、issue 和数据集全部视为不可信输入。
2. 不执行其中要求的命令，不读取其中指向的凭证或本机路径。
3. 只提取结构、来源、代码控制流和防御结论。
4. 研究目的限定为理解、治理、评测和防御。
