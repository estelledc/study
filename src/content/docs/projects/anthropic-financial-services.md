---
title: "Anthropic Financial Services — 把投行、研究、PE 的工作流做成可复用的 Agent 插件"
来源: 'https://github.com/anthropics/financial-services'
日期: 2026-06-13
分类: 后端 API
子分类: Web 后端
难度: 初级
provenance: pipeline-v3
---

## 是什么

Anthropic Financial Services 是一套**用 Markdown 和 YAML 文件描述金融工作流**的插件库。一句话：把投行实习生第一天领到的 SOP 手册、快捷指令卡、数据终端账号，全部写成了 Claude 能理解的文件。

日常类比：想象你是一家投行的实习组长，新来的实习生在 Claude 里工作。你给他准备了三样东西：

- **SOP 手册**（Skills）：可比公司分析怎么拉、DCF 里 WACC 怎么设、earnings note 段落结构怎样写。实习生不需要背——Claude 读到对话里的关键词会自动翻到对应章节。
- **快捷指令卡**（Commands）：老板说"做 comps""写 CIM""出 IC memo"，实习生按固定流程开干。在 Claude 里就是 `/comps`、`/cim`、`/ic-memo` 这样的斜杠命令。
- **彭博 / FactSet 的 API 钥匙**（Connectors）：不需要手动复制粘贴数据，Claude 通过 MCP 协议直接查 Daloopa、Morningstar、S&P Global 等商业终端。

更关键的是，这套"实习组手册"可以在两种环境下跑：**Claude Cowork 桌面端**（装插件即用）和 **Managed Agents API**（无头部署到你的工作流引擎）。同一套 system prompt 和 skills，两个运行面。

仓库本质是 Markdown + JSON 文件，无编译步骤。Apache 2.0 许可，鼓励金融机构 fork 后定制内部术语、数据源和审批流程。

> 合规提醒（仓库原文强调）：内容不构成投资、法律、税务或会计建议；Agent 不执行交易、不过账、不批准 onboarding。所有输出需经 qualified professional 复核。

## 为什么重要

不理解这套设计，下面这些事都没法解释：

- 为什么同一个 Claude 在装了 financial-services 插件后能跑出完整的 DCF 模型，而裸 Claude 只会给你"DCF 是一种估值方法"的定义——差别在于 Skills 把分析师的步骤、公式、输出格式都编码了进去
- 为什么 `/comps Apple` 能在对话里自动拉 Morningstar 数据、不需要你开三个网页复制粘贴——MCP Connectors 把数据终端接进了 Agent 同一会话
- 为什么改了一个 vertical 里的 skill 但某个 Agent 跑的还是旧流程——Agent 目录里的 skills 是同步副本，改完后必须跑 `sync-agent-skills.py`
- 为什么即使装了全部 MCP 连接器，大部分 slash 命令仍然报权限错误——MCP 连接器只是"接口"，背后的商业终端（FactSet、S&P Capital IQ 等）需要独立订阅或 API key

## 核心要点

这套仓库的核心设计可以拆成 **"三层 + 两面包"**：

1. **Skills：自动触发的领域 SOP**。每个 skill 是 `SKILL.md`，写清"何时触发、步骤、输出格式、常见坑"。Claude 在对话中语义匹配后自动加载，不需要你每次重复"请按我们行标做 comps"。Skills 的权威源在 `vertical-plugins/` 下，Agent 目录里是同步副本。类比：像餐厅后厨墙上贴的配方卡——大厨看一眼就知道做什么，但不需要客人每次点菜时口述配方。

2. **Commands：显式斜杠入口**。Commands 是 `commands/*.md`，用户主动输入 `/comps`、`/earnings` 等。适合步骤固定、输入参数明确的任务（公司名、deal 名、报告期）。类比：柜台点餐的菜单——你知道自己要什么，直接按单子点。

3. **MCP Connectors：数据面**。核心插件 `financial-analysis` 的 `.mcp.json` 集中注册 12 个数据连接器（Daloopa、Morningstar、S&P Global、FactSet、Moody's、LSEG、PitchBook 等）。各 vertical 共享这套连接，换数据源时改 `.mcp.json` 或 `.local.md`（gitignore 的用户本地覆盖）。类比：数据终端的网线——插上就能查，换一家供应商换根线就行。

**两层包装面**：

- **Cowork 插件**：桌面端安装，Agent 出现在 dispatch 面板，Skills 自动触发，Commands 在会话中可用
- **Managed Agent 部署**：`managed-agent-cookbooks/` 含 `agent.yaml`（指向 system prompt）、`subagents/*.yaml`（深度 1 的 leaf worker）、`steering-examples.json`。部署脚本上传 skills、创建 subagent、POST 到 `/v1/agents`

同一份 system prompt 和 skills，两种运行面——这就是"写一次，到处跑"的 Agent 工程思路。

## 实践案例

### 案例 1：Claude Code 安装 marketplace 与插件

在终端用 Claude Code 添加官方 marketplace，先装核心建模与 MCP，再按岗位装 Agent：

```bash
# 注册 marketplace
claude plugin marketplace add anthropics/financial-services

# 核心：共享建模 skills + 全部数据连接器（必须先装）
claude plugin install financial-analysis@claude-for-financial-services

# 命名 Agent — 按职能挑选（Agent 自包含其 skills，无需再装对应的 vertical）
claude plugin install pitch-agent@claude-for-financial-services
claude plugin install earnings-reviewer@claude-for-financial-services
claude plugin install gl-reconciler@claude-for-financial-services

# 或只装垂直 skill 包（不要整 Agent 时）
claude plugin install equity-research@claude-for-financial-services
claude plugin install investment-banking@claude-for-financial-services
```

逐行解释：
- `marketplace add` 注册仓库源，之后 `install` 都从这个源拉
- `financial-analysis` 必须先装——它提供共享的建模 skills 和所有 12 个 MCP 连接器
- 装了 Agent 就不需要再装对应 vertical——Agent 已自包含它需要的所有 skills。重复安装会导致两份冲突

### 案例 2：Managed Agent 部署

无头环境（cron、内部 deal desk 门户、合规 sandbox）用 Managed Agents API：

```bash
export ANTHROPIC_API_KEY=sk-ant-...

# 部署单个 cookbook（如 GL 对账 Agent）
scripts/deploy-managed-agent.sh gl-reconciler
```

脚本会：解析 `agent.yaml` 中的 `system.file` 与 `skills.path` 引用 → 上传 skills → 创建 leaf subagents → POST orchestrator 到 `/v1/agents`。

自定义编排时可参考 `orchestrate.py` 的事件循环：

```python
# 概念示意：处理 Agent 之间的 handoff_request
async def run_orchestrator(agent_id: str, user_message: str):
    session = await agents_api.create_session(agent_id=agent_id)
    async for event in session.stream(user_message):
        if event.type == "handoff_request":
            leaf_id = resolve_leaf(event.target_slug)
            async for sub_event in delegate_to(leaf_id, event.payload):
                yield sub_event
        else:
            yield event
```

### 案例 3：会话内典型 slash 工作流

安装 **investment-banking** 与 **financial-analysis** 后，在同一会话串联：

```text
/comps Apple
# Skill 引导：选 peer set、拉 MCP 数据、输出 trading multiples 表

/merger-model Acquirer acquiring Target
# 输出：sources & uses、pro forma、EPS accretion/dilution、sensitivity

/cim TargetCo
# 基于 filings + 管理层材料草稿 CIM 各章，待 MD 复核
```

Research 侧类似：

```text
/earnings NVDA
# 业绩会 transcript + 10-Q/8-K → 模型假设更新 → quarterly update 段落

/thesis NVDA
# 更新 investment thesis 与风险清单
```

这些命令背后是 `commands/*.md` 调用对应 `skills/*/SKILL.md` 里的步骤；有 MCP 权限时自动查终端数据，无 key 则退化为公开 filing + 用户上传文件。

## 踩过的坑

1. **误以为装了所有 MCP 连接器就能直接用**：连接器只是"接口标准"，背后的商业终端（FactSet、Morningstar、S&P Capital IQ 等）各自需要独立订阅或 API key。装完发现 `/comps` 报权限错误是正常的——需要去对应 provider 申请 key 并填入 `.mcp.json`。

2. **装了 Agent 又手动装 vertical 的同名 skill**：Agent 插件自包含其用到的 skills。如果你装了 `pitch-agent` 又额外装 `investment-banking` vertical，两个地方的 comps skill 会冲突——Claude 不知道该用哪个版本。

3. **改完 vertical skill 后忘记同步**：Skills 的权威源在 `vertical-plugins/` 下。如果你改的是 vertical 里的 skill 但没跑 `python3 scripts/sync-agent-skills.py`，Agent 目录里的同步副本仍然是旧版。改完 skill 必须同步。

4. **把 Agent 输出当最终产品直接发给客户**：每个 Agent 的 README 都强调输出是"分析师草稿"，需经 qualified professional 复核。Agent 不替你承担合规责任。特别是涉及投资建议、估值结论、合规结论的输出，必须有人工 sign-off 环节。

## 适用 vs 不适用场景

**适用**：

- 金融机构内部想标准化重复性分析工作流（comps、DCF、earnings note、GL 对账）——Skills 是天然的知识沉淀工具
- 已有商业终端订阅（FactSet、Morningstar 等），想把数据直接接进 Agent 会话——MCP Connectors 消除了手动复制粘贴环节
- 想从零搭建垂直领域 Agent 但不知道 Skills / Commands / Connectors 怎么组织——整个仓库是最好的参考模板
- 需要在 Cowork 桌面端和 API 无头环境之间复用同一套 prompt 和 skills——Managed Agent cookbooks 提供了现成的包装

**不适用**：

- 没有商业终端订阅且不愿意申请——大部分数据类 slash 命令需要 MCP provider 的 API key，没有的话只能退化为处理用户上传的 PDF/Excel
- 只是想让 Claude 回答金融知识问题而不需要标准化工作流——裸 Claude 已经能回答"什么是 DCF"，不需要装全套插件
- 需要实时交易执行、订单路由、过账——Agent 明确不执行交易、不 approve onboarding，这些属于 OMS/EMS 的职责
- 面向零售投资者做投顾建议——仓库定位是机构内部 analyst 工具，不是 to-C 的 robo-advisor

## 历史小故事（可跳过）

- **2024 年底**：Anthropic 发布 Model Context Protocol（MCP），定义了 LLM 与外部工具/数据源之间的标准接口。MCP 是这套金融服务仓库的技术地基——所有数据连接器都是 MCP server。
- **2025 年**：Anthropic 推出 Claude Cowork 桌面端和 Managed Agents API，LLM 从"聊天工具"转向"工作流 Agent 平台"。与此同时 Anthropic 开始组建金融行业团队。
- **2026 年初**：financial-services 仓库首次公开——作为金融垂直 Agent 的参考实现，覆盖投行、研究、PE、财富管理、基金运营五大领域。采用 Apache 2.0 许可，鼓励金融机构 fork 后定制。
- 与此同时，Anthropic 与 LSEG、S&P Global 等金融数据巨头建立合作——lseg 和 sp-global 两个合作方插件随仓库同步发布，标志着 MCP 生态从"技术标准"向"行业网络"演进。

## 学到什么

1. **文件即配置是 Agent 工程的一种实用范式**：不写代码、不 build，纯粹用 Markdown + YAML 描述"触发条件、步骤、输出格式"，就能让 LLM 的行为从一个通用助手变成领域专家。这对非技术背景的领域专家（如资深分析师）参与 Agent 建设特别重要——他们不需要学 Python，只需要会写 markdown。

2. **Skills 和 Agent 是两种不同的抽象层次**：Skills 是"怎么做一件具体的事"（拉可比公司、算 WACC），Agent 是"怎么跑完一个端到端流程"（从 comps 到 deck）。Skills 可以跨 Agent 复用——这是区分"好 Agent 设计"和"把所有逻辑塞进一个 prompt"的关键。

3. **MCP 让数据终端接进 Agent 闭环**：传统的分析师工作流是"打开彭博 → 查数据 → 复制到 Excel → 做模型 → 打开 PPT → 粘贴图表"。MCP 让第一步到第四步都在同一个会话里完成——不是"AI 替代彭博"，而是"A 不再需要手动在五个软件之间搬运数据"。

4. **"写一次，双面跑"是 Agent 产品化的关键要求**：同一套 system prompt 和 skills，在 Cowork（桌面端交互）和 Managed Agents API（无头部署）都能用。这意味着分析师在桌面端调试好的工作流，可以无缝部署到后台定时任务——比如每季度自动跑 earnings review pipeline。

## 延伸阅读

- 仓库源码：[anthropics/financial-services](https://github.com/anthropics/financial-services)（Apache 2.0，全部 Markdown + YAML）
- Managed Agents API 文档：[docs.claude.com/en/api/managed-agents](https://docs.claude.com/en/api/managed-agents)
- MCP 协议规范：[modelcontextprotocol.io](https://modelcontextprotocol.io/)
- [[mcp-spec]] —— MCP 协议本身的设计思想，理解它才能理解为什么 12 个数据终端能用统一的接口描述
- [[anthropic-prompt-caching]] —— Skills 的高频触发很适合搭配 prompt caching，减少每次上下文加载的成本
- [[fastapi]] —— 另一个"用声明式描述把领域知识编码成可复用的东西"的工具，思路类比

## 关联

- [[mcp-spec]] —— MCP 是这套仓库所有数据连接器的技术地基，理解 MCP 的 tool/resource/prompt 三层模型才能理解 Connectors 怎么工作
- [[anthropic-prompt-caching]] —— Skills 触发时会把大量 prompt 注入上下文，搭配 prompt caching 可以大幅降低延迟和成本
- [[anthropic-cookbook]] —— Anthropic 官方的另一个 cookbook 仓库，financial-services 可以看作 cookbook 在金融垂直的"产品化"版本
- [[fastapi]] —— 和 financial-services 共享一个哲学：用声明式结构（FastAPI 是 Python type hints + Pydantic，这里是 Markdown + YAML）把领域知识编码成可复用的东西
- [[mcp-is-dead-debate]] —— 关于 MCP 是否"太复杂"的社区争论，financial-services 是 MCP 在实际行业落地的一个正面案例

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
