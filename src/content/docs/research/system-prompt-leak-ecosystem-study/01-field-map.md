---
title: "领域地图：从隐藏指令到安全工程"
sidebar:
  hidden: true
---
# 领域地图：从隐藏指令到安全工程

## 1. 基本概念

可以把 LLM 应用类比成一个新员工：

- **模型权重**像长期训练形成的能力和习惯。
- **系统提示词**像当天上岗前拿到的岗位手册。
- **用户输入**像客户临时提出的需求。
- **工具定义**像员工可以使用的内部系统清单。
- **外部 guardrail**像门禁、审批和审计系统。

类比边界：模型并不真正“理解权限”；它是在同一上下文里预测文本或工具调用。因此岗位手册和客户话语即使角色不同，最终仍进入同一个生成机制。

### 核心术语

| 术语 | 技术定义 |
|---|---|
| System prompt | 由模型提供方或应用方放在高优先级消息中的行为、角色、工具和格式说明 |
| Prompt injection | 用输入改变模型原定行为，范围比“泄露 prompt”更大 |
| Jailbreak | 重点绕过安全和内容限制的一类 prompt injection |
| Prompt extraction / leaking | 诱导模型披露隐藏提示词的全部或片段 |
| Prompt stealing | 不一定逐字披露，而是从输入输出推断一个功能等价 prompt |
| Ground truth | 用于评测的真实原始 prompt |
| Oracle | 可直接比较抽取结果的可信真值来源 |
| Soft extraction | 文本不相同，但能复现原 prompt 的功能或行为 |

## 2. 生态四层

```text
来源/采集
  官方发布 | 开源源码 | 客户端逆向 | 对话抽取 | 输出反演
      ↓
档案/治理
  厂商目录 | 日期版本 | source 字段 | license | diff
      ↓
产品/协作
  搜索站 | 对比页 | 请求 | 社区验证 | leaderboard
      ↓
研究/防御
  attack taxonomy | benchmark | optimizer | evaluator | guardrail
```

这四层不是成熟度排名：

- 官方仓可能只有 12 个文件，却是最高质量 ground truth。
- 大型档案可能有数千文件，却高度重复且来源质量参差。
- 学术仓可能方法严谨，但代码只是一次性实验脚本。

## 3. 2023 到 2026 的发展

### 2023：现象和数据集

- 社区开始收集 ChatGPT、自定义 GPT、Bing、Claude 等隐藏指令。
- Effective Prompt Extraction 把“偶然成功”变成可批量评测的问题。
- 关键进步：不仅生成候选，还训练 DeBERTa 从多次结果中判断哪次更像真实 prompt。

### 2024：攻击基准与机制分析

- PLeak 用 shadow model 和 HotFlip 优化通用 adversarial query。
- Raccoon 建立 14 类攻击、compound attack、defended/defenseless 四象限。
- PromptExtractionEval 研究模型规模、prompt 长度、显式/隐式意图、注意力路径和 soft extraction。
- 社区认识到翻译、编码和可逆变换可以绕过简单重叠过滤。

### 2025：功能复制与平台化

- PRSA 把威胁从“逐字偷 prompt”扩展到“从有限样例复制功能”。
- 档案项目开始带搜索站、自动索引、来源元数据和长期版本线。
- OWASP LLM Top 10 2025 把 System Prompt Leakage 单列为 LLM07。

### 2026：Agent 化与防御转向

- JustAsk 把抽取建模成在线探索：分层技能、UCB、长期规则和一致性奖励。
- System Prompt Open 把提取结果和 oracle 比较做成公开数据产品。
- LeakHub 尝试用独立用户提交的一致性建立社区共识。
- 防御研究出现 ProxyPrompt 一类“保持功能、改变可被抽取语义”的方向。
- AWS 和 OWASP 的工程共识是：无法保证永不泄露，应从架构上降低泄露后果。

## 4. 主要威胁模型

| 威胁模型 | 攻击者知道什么 | 想得到什么 | 代表项目 |
|---|---|---|---|
| 黑盒直接抽取 | 只能发对话请求 | 原 prompt 文本 | Effective Prompt Extraction、Raccoon |
| shadow model 优化 | 有相似模型和 prompt 数据集 | 可迁移攻击查询 | PLeak |
| 自适应多轮 | 能根据每轮回复改变下一步 | 高防御模型的 prompt | JustAsk |
| 输出反演 | 只看到少量输入输出 | 功能等价 prompt | PRSA |
| 受控防御评测 | 知道 ground truth | 比较攻击和防御 | SPE-LLM、PromptExtractionEval |
| 社区考证 | 有多个公开来源 | 判定候选真实性 | LeakHub、jujumilk3 |

## 5. 关键矛盾

### 帮助性与保密性

模型越能解释自己的能力、工具和边界，就越可能在追问中重建系统说明。JustAsk 把这种“帮助性与安全约束的张力”作为可探索攻击面。

### 行为一致性与文本保密

即使不逐字输出，攻击者也能通过大量输入观察规则。这就是为什么 PRSA 和 soft extraction 把功能一致性加入评测。

### 可观察性与防滥用

公开 prompt 有利于审计、学习和透明度，但也可能帮助绕过过滤。工程上应把真正的安全控制放在 prompt 外，使透明度不直接导致越权。

### 版本速度与来源质量

越追求“最新”，越容易收录未经验证内容；越要求官方 ground truth，覆盖面越窄。档案系统需要同时记录 `captured_at`、`product_version` 和 `evidence_grade`。

## 6. 当前发展现状

截至 2026-07-16：

- **档案已经非常丰富，但标准不统一。** 命名、source、版本、完整性和 license 都不一致。
- **科研指标仍未完全统一。** EM、ROUGE、n-gram、embedding 和功能一致性回答不同问题。
- **模型和产品变化快于论文周期。** 2024 年某 checkpoint 的 ASR 不能直接代表 2026 年产品。
- **Agent 扩大了泄露面。** prompt 不再只是人格说明，还可能含工具 schema、MCP、权限、工作流和动态提醒。
- **没有单一完全防御。** 当前主流是防御纵深、最小权限、输入输出检测和持续红队。

## 7. 研究这个领域真正能学什么

1. **Context engineering**：角色、工具、格式、动态上下文如何共同塑造行为。
2. **数据治理**：版本、来源、真实性、重复和 license 如何管理。
3. **安全评测**：威胁模型、ground truth、攻击预算和指标如何定义。
4. **Agent 架构**：自适应策略、记忆、探索/利用和终态验证如何组织。
5. **产品工程**：如何把文本档案做成可检索、可比较、可协作的系统。
