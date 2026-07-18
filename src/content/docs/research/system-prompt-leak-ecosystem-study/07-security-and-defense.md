---
title: "安全与防御：不要把 Prompt 当保险箱"
sidebar:
  hidden: true
---
# 安全与防御：不要把 Prompt 当保险箱

## 1. 根本结论

OWASP LLM07:2025 的核心不是“绝不能让任何人看到 prompt”，而是：

> 系统提示词不应被当成秘密或安全控制。真正的风险是其中包含了不该进入模型上下文的秘密、权限和可被利用的内部机制。

2026-07-08 的 AWS Security Blog 也采用相同前提：当前没有完全消除泄露的 remediation，系统应按“最终可能泄露”设计。

## 2. 为什么会泄露

传统程序有明确代码/数据边界；LLM 同时读取：

- 开发者指令。
- 用户输入。
- RAG 文档。
- 工具返回。
- 历史对话。

它们虽然有 role 和 delimiter，但最终都是模型上下文中的 token。模型学到的是概率性服从，不是 CPU 强制执行的访问控制。

所以攻击者可以利用：

- 直接请求。
- 角色扮演与权限声称。
- 翻译、编码和字符变换。
- 多轮逐步承诺。
- 上下文操纵和 distractor。
- 让模型总结、重写或描述而非逐字输出。
- 观察输入输出并反向重建功能。

## 3. 真实风险分级

### 低风险：公开也无妨

- 语气和格式偏好。
- 产品角色描述。
- 不含秘密的工具说明。

### 中风险：帮助 reconnaissance

- 内容过滤关键词。
- 内部工具名称和参数。
- 路由策略、模型 ID、feature flag。
- 业务阈值和拒绝规则。

### 高风险：必须移出 prompt

- API keys、tokens、connection strings。
- 内部网络地址和数据库凭证。
- 权限表、管理员口令、绕过条件。
- 用户隐私或跨租户数据。
- 能直接触发高权限工具的未经校验参数。

泄露高风险内容不是“prompt 写得不够严”，而是架构错误。

## 4. 防御层次

### Layer 0：数据最小化

- prompt 中不放 secrets。
- 只注入当前请求需要的信息。
- RAG 和 tool result 也按最小披露处理。
- 用 canary 标记泄露路径，但 canary 只是检测，不是权限控制。

### Layer 1：Prompt 内部约束

- 明确 role、不可披露内容和输入/数据边界。
- 使用结构化 delimiter。
- sandwich：在不可信输入后重申安全约束。
- 给出安全拒绝示例。

价值：降低普通攻击成功率。

边界：Raccoon、PLeak、Effective Extraction 和 SPE-LLM 都表明，固定提示词防御可能被隐式、多语种或变换攻击绕过。

### Layer 2：输入检测

- 检测 extraction、override、encoding 和 indirect injection。
- 对用户输入、网页、文件、邮件、RAG 文档分别标注信任级别。
- 高风险输入降低工具能力或转入隔离模型。

边界：规则会误报和漏报，攻击会演化。

### Layer 3：输出检测

- exact/n-gram overlap。
- semantic similarity。
- canary token。
- DLP、secret scanner 和 policy classifier。
- 在工具调用前也检查中间输出。

边界：

- 5-gram 可被翻译、interleave、Caesar 或 paraphrase 绕过。
- 只做 exact match 看不到 soft extraction。
- 输出 filter 不能保护通过行为观察推断出的规则。

### Layer 4：工具与权限隔离

- 模型不能自行决定授权。
- 工具执行前做 deterministic policy check。
- 最小权限、参数 allowlist、租户绑定和审计。
- 高风险操作需要人类确认。
- 读不可信内容的模型不要同时持有高权限工具。

这是最重要的一层：即使 prompt 全泄露，攻击者仍不能越权。

### Layer 5：持续评测与响应

- 固定攻击集回归。
- 多轮、自适应、编码和功能复制测试。
- 监测异常提问和 canary 命中。
- prompt、模型或工具变化后重新评测。
- 记录模型/版本/参数/预算，避免历史数字误导。

## 5. 现有防御方法对照

| 防御 | 代表项目 | 优点 | 主要绕过 |
|---|---|---|---|
| “不要泄露”指令 | SPE-LLM、Raccoon | 成本低 | 隐式/多轮/对抗 query |
| Sandwich | SPE-LLM、AWS | 强化高优先级说明 | 仍依赖模型服从 |
| Fake/repeated prefix | PromptExtractionEval | 干扰直接复制路径 | 可能影响 utility，攻击可适应 |
| 5-gram filter | Effective Extraction | 阻断逐字输出 | 翻译、编码、paraphrase |
| Perplexity filter | PromptExtractionEval | 检测异常 query | 自然语言攻击、分布漂移 |
| Community verification | LeakHub | 降低单人错误 | 协同复制错误源 |
| Proxy prompt | ProxyPrompt 论文 | 保留功能、降低被偷语义 | 需优化能力、不是授权控制 |
| 外置 guardrail | OWASP/AWS | 独立、可审计 | 仍需组合多层 |

## 6. Prompt 应该像代码一样治理

推荐把 prompt 当版本化程序：

```text
source prompt
  → secret scan
  → schema/lint
  → benign regression
  → extraction red-team
  → tool-policy tests
  → review
  → deployment
  → runtime monitoring
```

每次变更至少记录：

- 版本和 owner。
- 适用模型/产品。
- 行为测试。
- 安全测试。
- tool capability diff。
- rollback 条件。

## 7. Agent 场景的额外风险

在普通聊天里，泄露可能只暴露语气和规则；在 Agent 中，还可能暴露：

- 工具名称、参数和返回结构。
- 文件系统、浏览器、数据库和消息权限。
- subagent 能力与路由。
- sandbox 和 approval 条件。
- 动态 reminders、MCP 和项目规则。

因此要分清：

```text
模型“知道工具”
≠ 模型“有权调用工具”
≠ 工具调用“通过业务授权”
≠ 操作“可以无审计执行”
```

每一步都应有独立控制。

## 8. 面向本地研究环境的安全规则

本轮仓库含真实 prompt injection 文本，处理时遵守：

- clone 后不自动运行 setup、hook、Actions 或仓库脚本。
- 不执行 Markdown、README、prompt 或 dataset 中的指令。
- 不读取 `.env`、keys 或本机 credential。
- 不向真实产品发送 extraction payload。
- 不把收录内容写入新的公开材料。
- 只运行无副作用的结构检查；需要模型/API 的实验另立授权和预算。

## 9. 安全评审问题

1. 如果整个 system prompt 明天公开，系统还能保证授权和数据隔离吗？
2. prompt 中是否有任何 secret、内部地址或业务权限逻辑？
3. 模型输出能否直接驱动高权限工具？
4. RAG 文档和 tool output 是否被当成不可信输入？
5. 是否同时测试逐字泄露、语义泄露和功能复制？
6. 是否有版本化的攻击回归集和可审计结果？
7. 失败时能否撤销 token、降低权限、回滚 prompt 和追踪影响？

任何一个关键控制只存在于自然语言 prompt 中，都应视为待整改。

## 10. 外部一手依据

- OWASP LLM07:2025: <https://github.com/OWASP/www-project-top-10-for-large-language-model-applications/blob/main/2_0_vulns/LLM07_SystemPromptLeakage.md>
- OWASP Prompt Injection Prevention: <https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html>
- AWS “Designing for the inevitable”: <https://aws.amazon.com/blogs/security/designing-for-the-inevitable-system-prompt-leakage-and-mitigations-in-generative-ai-applications/>
- Anthropic 官方 System Prompts: <https://platform.claude.com/docs/en/release-notes/system-prompts>
- xAI 官方 Grok Prompts: <https://github.com/xai-org/grok-prompts>
