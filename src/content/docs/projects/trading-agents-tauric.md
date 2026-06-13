---
title: TradingAgents — 用一支 AI 投研团队来做决策
来源: https://github.com/TauricResearch/TradingAgents
日期: 2026-06-13
分类: 机器学习
子分类: 模型与训练
provenance: pipeline-v3
---

# TradingAgents — 用一支 AI 投研团队来做决策

## 一、从"找专家开会"说起

想象你要投资一只股票。最靠谱的方式不是自己一个人拍脑袋，而是找一群专家一起开会讨论：

- **基本面分析师**看公司财报，评估企业内在价值
- **情绪分析师**读新闻、社交媒体，判断市场大众情绪
- **技术分析师**看 K 线、RSI、MACD 这些技术指标
- **新闻分析师**盯全球宏观事件，比如利率变化、地缘冲突
- **多空研究员**分别从看好和看空的角度辩论
- **风控官**评估风险有多大
- **投资组合经理**听完所有人的报告后，做最终决定

TradingAgents 做的事情，就是把上面的"专家会议"用 AI 来实现。它是一套用大型语言模型（LLM）驱动的**多智能体量化交易框架**。

> 核心一句话：把复杂的投资决策拆解成多个 AI 角色，每个角色专精一块，最后通过讨论达成共识。

## 二、核心概念

### 2.1 什么是"多 Agent 框架"

传统量化策略通常是写死规则（比如"RSI 低于 30 就买入"）。TradingAgents 的做法完全不同——它用 LLM 当"大脑"，每个 Agent 承担一个职能角色。

你可以把它理解成一个**有组织的团队**：

| 层级 | 角色 | 职责 |
|------|------|------|
| 分析师团队 | Fundamentals Analyst | 看财报，评估企业价值 |
| | Sentiment Analyst | 聚合新闻、StockTwits、Reddit 情绪 |
| | News Analyst | 监控全球宏观新闻和事件 |
| | Technical Analyst | 用 MACD、RSI 等技术指标分析走势 |
| 研究团队 | Bullish Researcher | 从看多角度批判性分析 |
| | Bearish Researcher | 从看空角度批判性分析 |
| 决策层 | Trader | 综合所有报告做交易决定 |
| | Risk Manager | 评估风险，提出风控建议 |
| | Portfolio Manager | 最终拍板：通过或拒绝交易 |

### 2.2 LangGraph — 团队运行的"操作系统"

这些 Agent 之间的协作不是随意的，而是通过 **LangGraph** 来组织。LangGraph 是一个用来构建有状态多智能体应用的框架，它可以定义：

- 每个 Agent 做什么（节点）
- 信息如何在 Agent 之间流转（边）
- 什么时候结束、什么时候循环（比如辩论可以设置最大轮次）

### 2.3 记忆与恢复机制

TradingAgents 有两个重要特性：

- **决策日志**：每次分析结果自动保存到 `~/.tradingagents/memory/trading_memory.md`。下次再分析同一只股票时，系统会自动读取之前的决策和实际回报，生成反思注入到下一次分析中。
- **断点续跑（Checkpoint）**：如果分析中途崩溃，重新启动时可以从上一个成功的节点继续，不用从头再来。

### 2.4 模型支持

TradingAgents 支持非常多的 LLM 供应商：OpenAI（GPT-5.5 等）、Google（Gemini）、Anthropic（Claude）、xAI（Grok）、DeepSeek、Qwen（通义千问，含国际和中国双端）、GLM（智谱）、MiniMax、OpenRouter，以及本地部署的 Ollama。企业级还可以用 Azure OpenAI。

## 三、代码示例

### 示例 1：最简用法 — 分析一只股票

这是 TradingAgents 最基本的用法。你只需要传入股票代码和分析日期，剩下的所有分析、讨论、决策都由 Agent 团队自动完成。

```python
from tradingagents.graph.trading_graph import TradingAgentsGraph
from tradingagents.default_config import DEFAULT_CONFIG

# 1. 创建分析引擎，使用默认配置
ta = TradingAgentsGraph(debug=True, config=DEFAULT_CONFIG.copy())

# 2. 向前传播 — 分析 NVDA 在 2026-01-15 的市场情况
#    返回值：(中间状态字典, 最终决策)
_, decision = ta.propagate("NVDA", "2026-01-15")

# 3. 查看决策结果
print(decision)
```

这里 `propagate()` 方法触发了整个 Agent 团队的协作流程：四个分析师先各自出报告 → 多空研究员辩论 → 风控官评估 → 投资组合经理做最终决定。

### 示例 2：自定义配置 — 换模型、控辩论

你可以通过修改配置字典来控制每一个细节，比如用什么模型、辩论几轮、温度参数等。

```python
from tradingagents.graph.trading_graph import TradingAgentsGraph
from tradingagents.default_config import DEFAULT_CONFIG

# 复制默认配置，然后按需修改
config = DEFAULT_CONFIG.copy()

# 选择 LLM 供应商
# 支持：openai, google, anthropic, xai, deepseek, qwen, qwen-cn,
#       glm, glm-cn, minimax, minimax-cn, openrouter, ollama, azure
config["llm_provider"] = "openai"

# 复杂推理用更强的模型
config["deep_think_llm"] = "gpt-5.5"

# 简单任务用更快的模型（省钱省时间）
config["quick_think_llm"] = "gpt-5.4-mini"

# 辩论最多进行 2 轮
config["max_debate_rounds"] = 2

# 创建分析引擎
ta = TradingAgentsGraph(debug=True, config=config)

# 分析腾讯港股
_, decision = ta.propagate("0700.HK", "2026-06-10")
print(decision)
```

### 示例 3：开启断点续跑

对于耗时的分析任务，开启 checkpoint 可以避免意外中断后从头再来。

```python
from tradingagents.graph.trading_graph import TradingAgentsGraph
from tradingagents.default_config import DEFAULT_CONFIG

config = DEFAULT_CONFIG.copy()
config["checkpoint_enabled"] = True  # 开启断点续跑

ta = TradingAgentsGraph(debug=True, config=config)

# 如果上次中断，这里会自动从断点恢复；
# 如果是全新任务，则正常从头执行
_, decision = ta.propagate("SPY", "2026-06-13")
print(decision)
```

## 四、支持的市场

TradingAgents 支持 Yahoo Finance 覆盖的任何市场，只需要用交易所后缀的股票代码：

- **美股**：`AAPL`、`SPY`
- **港股**：`0700.HK`（腾讯）、`9988.HK`（阿里）
- **A 股**：`600519.SS`（茅台，上海）、`000858.SZ`（五粮液，深圳）
- **加密**：`BTC-USD`、`ETH-USD`
- **东京**：`7203.T`、**伦敦**：`AZN.L`、**印度**：`RELIANCE.NS`

系统会根据股票代码自动识别市场、公司身份和基准指数（如美股用 SPY 做 alpha 对比）。

## 五、CLI 命令行使用

如果你不想写 Python 代码，也可以用命令行直接启动：

```bash
# 安装后直接用
tradingagents

# 或者从源码目录运行
python -m cli.main
```

启动后会进入交互界面，让你选择股票代码、分析日期、LLM 供应商、研究深度等。运行过程中会实时显示每个 Agent 的分析进度和结果。

## 六、需要注意的事

1. **这不是投资建议** — TradingAgents 定位为研究工具，不是投资顾问。实际表现受模型选择、温度参数、数据质量等多种因素影响。
2. **结果不一定可复现** — 因为 LLM 本身具有随机性（sampling），两次同样的分析可能得到不同结果。降低 temperature 可以提高一致性，但推理模型（reasoning models）对温度不敏感。
3. **需要 API Key** — 使用任何 LLM 供应商都需要配置对应的 API Key，通过环境变量或 `.env` 文件设置。

## 七、总结

TradingAgents 的核心创新点在于把传统的"单策略量化"转变成了"多 Agent 协作"：

- **模拟真实投行团队**：分析师、研究员、风控、投资组合经理，各司其职
- **LLM 作为大脑**：不依赖死规则，而是用自然语言理解和分析
- **辩论机制**：多空研究员互相批判，避免一面之词
- **记忆系统**：每次决策自动记录，越用越聪明
- **高度可配置**：支持几乎所有主流 LLM 供应商

对于一个刚接触 AI 和量化的学习者来说，这个项目展示了 LLM 在金融领域的实际应用场景——不只是聊天对话，而是真正可以组成一个"团队"来解决问题。

---

**参考**：
- GitHub: https://github.com/TauricResearch/TradingAgents
- arXiv 论文: https://arxiv.org/abs/2412.20138
- 论文作者：Yijia Xiao, Edward Sun, Di Luo, Wei Wang
