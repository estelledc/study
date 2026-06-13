---
title: "Anthropic Financial Services — 零基础学习笔记"
来源: https://github.com/anthropics/financial-services
日期: 2026-06-13
分类: 其他
子分类: 工程文化
provenance: pipeline-v3
---

# Claude for Financial Services — 零基础学习笔记

## 一、一句话概括

这是一个由 Anthropic 官方开源的**金融工作智能体（Agent）集合**，专门面向投行、股权研究、私募和财富管理这些金融场景。

它不是某一个单一的程序，而是一套"模板包"——你把需要的组件装好，Claude 就能帮你做财务模型、写研究报告、对账、KYC 审查……

> 重要提示：这些 Agent **不会替你做投资决策**，它们只是起草分析师的工作成果（模型、备忘录、研究笔记），最终都需要人类专业人员审核签字。

## 二、一个日常类比：金融部门里的"超级实习生"

想象你在一家投行工作。你的团队有 20 个人，每天要：

- 找同行业的公司做比较分析（可比公司分析）
- 读上市公司的财报和电话会议纪要
- 搭建三张表财务模型（利润表、资产负债表、现金流量表）
- 做 DCF（现金流折现）估值
- 准备投资人路演的 PPT
- 做每月的账务核对

以前，这些活都是 junior analyst（初级分析师）熬夜做的。

这个项目的思路是：**给 Claude 一个"实习生"，它懂所有这些流程**。你告诉它"帮我做一家公司的 DCF 估值"，它就自动：

1. 通过数据连接器（MCP）去拉取实时财务数据
2. 搭建模型
3. 生成带格式的 Excel 文件
4. 把结果呈给你审阅

关键区别是：这个"实习生"不会犯错（至少不会像人类那样犯低级错误），而且可以同时帮好几个人。

## 三、核心概念拆解

### 3.1 三层架构

这个仓库里的东西分为三层，从大到小：

| 层级 | 叫什么 | 它是什么 | 类比 |
|------|--------|----------|------|
| 1 | **Agents（智能体）** | 端到端的工作流，自带系统提示和所需的全部技能 | 一个"完整岗位"，比如" pitch deck 专员" |
| 2 | **Skills（技能）** | 领域专业知识、约定和分步方法 | 具体技能，比如"会做 DCF 估值" |
| 3 | **Commands（命令）** | 你手动触发的斜杠命令 | 快捷键，比如敲 `/dcf` 就启动 DCF |

**运行方式：**

- Skills 是**源头在垂直插件**（`vertical-plugins`），每个 Agent 安装时会自动打包一份它需要的 Skills 副本
- Commands 是你**主动触发**的（如 `/comps`），Skills 是 Claude **自动判断何时使用**的

### 3.2 安装/部署的两条路

同一个东西，两种运行方式：

**方式 A — Claude Cowork（桌面插件）**

最轻量。在 Cowork 的设置里添加插件，选你需要的 Agent 或垂直技能即可。适合个人日常使用。

**方式 B — Claude Managed Agents API（云端部署）**

更重量级。把你的 Agent 部署到云端，通过 API 调用，适合机构内部集成到自己的工单/工作流系统里。

### 3.3 MCP 数据连接器

MCP（Model Context Protocol）是这个项目的**数据管道**。Claude 本身不"懂"金融数据，它需要连接外部的数据源：

- Morningstar（晨星）—— 基金和股票数据
- S&P Global / Kensho —— 标普全球分析
- FactSet —— 金融数据终端
- Moody's（穆迪）—— 信用评级
- PitchBook —— 私募数据
- LSEG（伦敦证券交易所集团）—— 债券、外汇、利率数据
- Daloopa、Egnyte、Box —— 内部文档和数据库

所有连接器集中在 `financial-analysis` 核心插件里，其他垂直插件共享使用。

### 3.4 九种垂直领域

| 垂直插件 | 管什么 |
|----------|--------|
| **financial-analysis**（核心） | 可比公司分析、DCF、LBO、三表模型、PPT 质检 |
| **investment-banking** | 投行材料：CIM、teaser、买方名单、 merger model |
| **equity-research** | 股权研究：财报分析、研报、晨间笔记 |
| **private-equity** | 私募：项目 sourcing、尽调清单、IC 备忘录 |
| **wealth-management** | 财富管理：客户回顾、财务规划、税务亏损收割 |
| **fund-admin** | 基金运营：总账核对、应计项目、NAV 核对 |
| **operations** | 运营：KYC 文档解析、规则引擎 |
| **lseg**（合作） | LSEG 数据上的债券、利率、外汇分析 |
| **sp-global**（合作） | S&P Capital IQ 上的 tear sheets、盈利预览 |

## 四、完整工作流示例

### 示例一：搭建一个 DCF 估值模型

假设你是股权研究员，需要给苹果（AAPL）做一个现金流折现估值。

**步骤 1：安装核心插件**

```bash
# 添加市场源
claude plugin marketplace add anthropics/financial-services

# 安装核心金融分析技能（包含所有数据连接器）
claude plugin install financial-analysis@claude-for-financial-services

# 安装股权研究垂直技能（可选，但推荐）
claude plugin install equity-research@claude-for-financial-services
```

**步骤 2：在 Claude 会话中使用**

```
你: /dcf AAPL

Claude 会自动：
1. 通过 MCP 连接器从 Morningstar/FactSet 拉取 AAPL 的财务数据
2. 计算 WACC（加权平均资本成本）
3. 预测未来 5-10 年的自由现金流
4. 计算终值（Terminal Value）
5. 做敏感性分析（不同折现率下的估值区间）
6. 生成一份完整的 Excel 文件，内含模型和图表
```

### 示例二：跑一个可比公司分析（Comps）

假设你要评估一家 SaaS 公司，需要找同行业可比公司。

```bash
# 安装投资银行技能（含 comps 分析能力）
claude plugin install investment-banking@claude-for-financial-services
```

```
你: /comps 找一家ARR 5000万美元、增速40%的SaaS公司

Claude 会自动：
1. 通过 PitchBook / S&P 数据源筛选可比公司
2. 提取每家公司的关键估值倍数（EV/Revenue、EV/EBITDA 等）
3. 生成一个可比公司对比表
4. 输出到 Excel，包含图表
```

### 示例三：Managed Agent 云端部署

如果你需要在机构内部自动运行这些 Agent：

```bash
# 设置 API Key
export ANTHROPIC_API_KEY=sk-ant-xxx

# 部署一个 GL Reconciler（总账核对 Agent）—— 全自动
scripts/deploy-managed-agent.sh gl-reconciler

# 这个脚本会：
# 1. 读取 managed-agent-cookbooks/gl-reconciler/ 下的配置
# 2. 解析文件引用，上传 Skills
# 3. 创建 leaf-worker 子智能体
# 4. 通过 POST 请求把编排器注册到 /v1/agents 端点
```

部署后，Agent 会自动运行：当有对账差异时，它自己找原因、追踪根因、然后把结果路由给人审核。

## 五、仓库结构一览

```
plugins/
  agent-plugins/                ← 命名 Agent（每个自包含一个完整工作流）
    pitch-agent/                ←   路演 PPT 全流程
    market-researcher/          ←   行业研究
    earnings-reviewer/          ←   财报审阅
    model-builder/              ←   财务模型构建
    gl-reconciler/              ←   总账核对
    kyc-screener/               ←   KYC 审查
    ...
  vertical-plugins/             ← 按垂直领域分类的技能+命令包
    financial-analysis/         ←   核心：建模技能 + 11个数据连接器
    investment-banking/         ←   投行技能
    equity-research/            ←   股权研究技能
    ...
  partner-built/                ← 合作伙伴插件（LSEG、S&P Global）
managed-agent-cookbooks/        ← Managed Agent 的 YAML 配置模板
claude-for-msft-365-install/    ← MS Office 插件的 IT 部署工具
scripts/                        ← 部署脚本：check.py, validate.py, orchestrate.py
```

## 六、斜杠命令速查

最常用的几个命令：

| 命令 | 功能 | 所属领域 |
|------|------|----------|
| `/comps` | 可比公司分析 | 金融分析 |
| `/dcf` | DCF 估值 | 金融分析 |
| `/lbo` | LBO 模型 | 金融分析 |
| `/3-statement-model` | 三表模型 | 金融分析 |
| `/earnings` | 财报后季度更新 | 股权研究 |
| `/sector` | 行业全景报告 | 股权研究 |
| `/ic-memo` | 投委会备忘录 | 私募 |
| `/rebalance` | 资产组合再平衡 | 财富管理 |
| `/cim` | 保密信息备忘录 | 投行 |

## 七、自定义你的 Agent

这些都是参考模板，真正有价值的是**根据你的机构定制**：

1. **替换数据源** —— 把 `.mcp.json` 指向你自己的数据提供商
2. **加入机构上下文** —— 把你们的术语、流程、格式标准写进 skill 文件
3. **导入品牌模板** —— `/ppt-template` 可以让 Claude 使用你们公司的 PPT 模板
4. **调整 Agent 范围** —— 编辑 `agents/<slug>.md` 匹配你们团队的实际工作方式
5. **自己加** —— 复制现有结构，为你们独有的工作流创建新 Agent

## 八、关键术语表

| 术语 | 解释 |
|------|------|
| **Agent** | 一个完整的、端到端的工作流，自带提示词和技能 |
| **Skill** | 某项专业能力（如 DCF 建模），可被多个 Agent 复用 |
| **Command** | 你主动触发的斜杠命令，如 `/dcf` |
| **MCP** | Model Context Protocol，Claude 连接外部数据的标准协议 |
| **Cowork** | Claude 的桌面插件运行环境 |
| **Managed Agent** | 通过 API 部署的云端智能体 |
| **Comps** | Comparable Company Analysis，可比公司分析 |
| **DCF** | Discounted Cash Flow，现金流折现估值 |
| **LBO** | Leveraged Buyout，杠杆收购模型 |
| **CIM** | Confidential Information Memorandum，保密信息备忘录 |
| **IC Memo** | Investment Committee Memo，投委会备忘录 |
| **NAV** | Net Asset Value，净资产价值 |
| **KYC** | Know Your Customer，客户身份验证 |
