---
title: Anthropic Cookbook — Claude API 实战示例
来源: 'Anthropic, Claude Cookbooks (formerly anthropic-cookbook), MIT License, https://github.com/anthropics/claude-cookbooks'
日期: 2026-05-29
分类: AI
难度: 中级
---

## 是什么

Anthropic Cookbook（现在仓库名是 Claude Cookbooks）是 Claude 官方维护的 **API 用法示例集**，以 Jupyter Notebook + Python 为主，每个 notebook 是一个独立可跑的小项目。

日常类比：

- **Claude 官方文档** = 说明书（讲每个参数干什么）
- **Anthropic Cookbook** = 菜谱（给你具体场景的代码：做 agent / 接 RAG / 读图表 / 调工具）

你打开一个 `.ipynb`，`pip install` 几个包，填 API key，**整个 demo 就能跑起来**——不用自己摸索调用顺序、参数组合、错误处理。

仓库地址：`github.com/anthropics/claude-cookbooks`，**MIT License**，可商用、可改、可贴自己代码里。

## 为什么重要

学 Claude 工程化，Cookbook 是**最快的路径**。原因有四：

1. **官方实例 + 完整注释**：每个 notebook 上面有"这个 demo 解决什么问题"，下面有"为什么这样写"。不是 README 上那种半截代码片段，是**端到端能跑的脚本**。

2. **特性的 reference impl**：Function Calling、Vision、Computer Use、Extended Thinking 这些新特性出来时，Cookbook 第一时间出范例。看 Cookbook 的实现 = 看 Anthropic 工程师本人怎么写。

3. **与最新 model 同步**：Claude 升级 model（比如从 Sonnet 3.5 → Sonnet 4），Cookbook 会跟进示例。社区博客经常滞后半年，Cookbook 不会。

4. **MIT License 可商用**：你 fork 一份当起步代码，改成自己业务，**授权约束很轻**。这一点对企业项目特别关键。

不读 Cookbook 直接看文档的代价：你会重新发明一遍轮子，且大概率漏掉边界情况（重试、token 限制、tool schema 写法等）。

## 核心要点

仓库结构按**主题文件夹**组织，每个文件夹 5-15 个 notebook：

| 文件夹 | 主题 |
|--------|------|
| `misc/` | 杂项实战（extended thinking / batch API / pdf 处理等） |
| `multimodal/` | 图像处理（OCR / 图表 / vision 用法） |
| `tool_use/` | Function Calling 与 agent loop |
| `skills/` | RAG / classification / summarization |
| `third_party/` | 第三方库集成（LangChain / LlamaIndex 等） |
| `patterns/` | 进阶组合范式（agent 编排 / 多步推理） |

三个共性特征：

1. **每个 notebook 是独立可跑的**——不依赖别的目录、不依赖共享配置；`pip install anthropic` + 几个 demo 用包就够
2. **Best practices 全文档化**——prompt engineering 章节有 Anthropic 内部用的 prompt 范本（XML tag 包裹、few-shot 写法等）
3. **从简单到复杂**——`misc/basic_usage.ipynb` 30 行入门，`patterns/agents/` 几百行做 customer service agent

## 实践案例

### 案例 1：multimodal/reading_charts.ipynb — 让 Claude 读图表

给 Claude 一张柱状图截图，让它**输出表格化数据**。核心代码：

```python
import anthropic, base64
client = anthropic.Anthropic()
with open("chart.png", "rb") as f:
    image_data = base64.standard_b64encode(f.read()).decode("utf-8")

msg = client.messages.create(
    model="claude-sonnet-4-20250514",
    max_tokens=1024,
    messages=[{"role": "user", "content": [
        {"type": "image", "source": {
            "type": "base64", "media_type": "image/png", "data": image_data}},
        {"type": "text", "text": "把这张图的数据转成 markdown 表格"},
    ]}],
)
print(msg.content[0].text)
```

跑起来你立刻看到 vision API 的真实效果——比读文档快 10 倍。

### 案例 2：tool_use/customer_service_agent.ipynb — 完整 agent loop

这个 notebook 演示**最经典的 agent 范式**：

1. 定义工具 schema（`get_customer_info` / `get_order_details` / `cancel_order`）
2. 把工具列表传给 Claude
3. Claude 决定调哪个工具，返回 `tool_use` 块
4. 你执行工具、把结果回传
5. 循环直到 Claude 给最终回答

这是 [[claude-code]] / Cursor / 各种 agent 框架背后的**核心循环**。读一遍 200 行注释清晰的实现，胜过看 10 篇 agent 综述。

### 案例 3：misc/extended_thinking.ipynb — Sonnet 4 的扩展思考

Claude Sonnet 4 推出 extended thinking 后第一时间出的示例。展示如何用 `thinking` 参数让模型**先内部推理再回答**：

```python
msg = client.messages.create(
    model="claude-sonnet-4-20250514",
    max_tokens=16000,
    thinking={"type": "enabled", "budget_tokens": 10000},
    messages=[{"role": "user", "content": "证明 √2 是无理数"}],
)
```

返回内容会有两个块：`thinking`（内部推理过程）和 `text`（最终答案）。这是 Cookbook 把新特性"翻译成代码"的速度优势——文档发布**当天**就有跑通的例子。

## 踩过的坑

1. **API key 配置**：环境变量 `ANTHROPIC_API_KEY` 必须设置，否则 `client = Anthropic()` 直接抛错。建议用 `.env` 文件 + `python-dotenv`，别硬编码。

2. **Token 用量大**：一些 demo（特别是 vision + 长文档）跑完会消耗几美元。**学习时先用便宜 model（如 Haiku 系列）替代大 model**，验证流程后再切换到 Sonnet / Opus。

3. **模型版本会变**：早期 notebook 可能写 `claude-3-opus-20240229`，但这个版本已经下线。跑之前**先看 [docs.anthropic.com/en/docs/about-claude/models](https://docs.anthropic.com/en/docs/about-claude/models) 上的 active model 列表**，把模型名替换成当前可用的。

4. **依赖版本飘移**：`anthropic` SDK 升级会破坏老 notebook 的 API。`pip install "anthropic>=0.40"` 时如果报错，看顶上 import 部分的 SDK 版本注释，pin 住对应版本即可。

5. **与同类工具区分**：
   - Cookbook = **lib 用法集**，给程序员写代码用
   - [[claude-code]] = **CLI 客户端**，给程序员写代码时调 Claude 用
   - [[continue]] = **IDE 插件**，给 VSCode 内嵌 AI 编程
   三者都用 Claude API，但服务对象完全不同。Cookbook 是**底层教学**，后两个是**上层产品**。

## 适用 vs 不适用场景

**适用**：

- 学 Claude API 工程化（特别是新接触的开发者）
- 实现 vision / tool use / RAG / agent 等场景前找 reference
- 企业项目接 Claude API，找一个起步代码 fork 改造
- 跟进 Anthropic 新特性（extended thinking / computer use / batch 等）

**不适用**：

- 学 prompt 写作艺术——Cookbook 重在 API 用法，prompt 范本看 docs 的 prompt-engineering 章节更全
- 学 LLM 原理——Cookbook 不讲 transformer / attention / RLHF，那是 [[transformer]] / [[deep-learning]] 的范畴
- 找 production 级 agent 框架——Cookbook 是**教学**示例，不是 framework；要 framework 看 LangChain / LlamaIndex

## 历史小故事（可跳过）

- **2024 年初**：Anthropic 开源 Cookbook，最早只有几个基础 notebook
- **2024-08**：Claude 3.5 Sonnet 发布，加入对应示例（function calling 大幅完善）
- **2024-12**：Computer Use 发布（让 Claude 操作鼠标键盘），Cookbook 出 demo
- **2025 年**：MCP（Model Context Protocol）集成，Cookbook 加 MCP 客户端范例
- **持续节奏**：每次新 model / 新特性发布，Cookbook 1-2 周内跟进

## 学到什么

1. **官方 example 是最高 ROI 的入门资源**——5 分钟跑通比 5 小时读文档管用
2. **Notebook 是 AI 库的事实标准教学媒介**——可执行 + 可注释 + 可分享，三合一
3. **MIT License + 官方维护 = 企业可用的起步代码**，避免授权和过时双重风险
4. **跟 Claude 新特性最快的姿势是订阅 Cookbook 仓库**——比看博客 / 推特都快

## 延伸阅读

- 仓库本身：[anthropics/claude-cookbooks](https://github.com/anthropics/claude-cookbooks)
- Anthropic 官方文档：[docs.anthropic.com](https://docs.anthropic.com/)
- [[claude-code]] —— Anthropic 官方 CLI 客户端，把 Cookbook 思想变成日常工具
- [[transformer]] —— Claude 背后的模型架构

## 关联

- [[claude-code]] —— Cookbook 教 API 用法，claude-code 是用法的产品化形态
- [[continue]] —— IDE 内嵌 AI 编程，底层调用与 Cookbook 同款 API
- [[transformer]] —— Claude 的模型架构基础，Cookbook 是其上层应用层

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
