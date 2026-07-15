---
title: 'Privacy Practices of Browser Agents — 浏览器 Agent 的隐私行为盘点'
description: '用 Privacy Practices of Browser Agents 理解浏览器 agent 为什么是高风险隐私边界，而不只是自动点击工具。'
来源: 'arXiv:2512.07725'
日期: 2026-07-15
分类: AI Agent / Privacy
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: paper
  note_type: paper
  canonical_source: https://arxiv.org/abs/2512.07725v1
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-07-15'
  publication_id: arXiv:2512.07725
  source_version: arXiv:2512.07725v1
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-07-15'
  review_after: null
  applicable_version: arXiv v1
---

## 是什么

Privacy Practices of Browser Agents 是一篇系统评估浏览器 agent 隐私行为和属性的论文。它关注的是：浏览器 agent 自动浏览网页、读取页面、填写表单、跨站操作时，会如何处理用户敏感数据。

类比：普通浏览器像你自己开车；浏览器 agent 像你把车钥匙、通讯录、路线和钱包都交给代驾。代驾很方便，但它能看到和操作的东西也更多。

本卡只基于 arXiv v1 和论文静态阅读整理，没有复现实验，也没有测试任何真实浏览器 agent。所有结论保持 `UNVERIFIED`。

## 问题是什么

浏览器 agent 的能力越强，隐私风险越高。它可能访问登录态网页、读取邮箱、看到地址和支付信息、自动提交表单、把页面内容发给远端模型，甚至在任务中跨站汇总数据。

这篇论文的问题是：现有浏览器 agent 在隐私实践上到底做得怎样？它们对数据收集、传输、存储、权限、用户可见性和控制权有没有清晰边界？

这补足了前几轮缺口：[[browsergym]]、[[webarena]]、[[assistantbench]] 关注能力和评测；这篇把视角转到用户隐私和产品责任。

## 为什么重要

- 浏览器 agent 天然接触用户最敏感的网页上下文。
- 自动化能力会放大一次误读或一次注入的后果。
- 隐私风险不只来自模型，也来自浏览器扩展、日志、服务器和第三方工具。
- 用户很难知道 agent 看到了什么、发走了什么、保存了什么。
- 企业部署浏览器 agent 前必须回答这些问题。

## 核心方法

| 维度 | 要问的问题 | 工程含义 |
|---|---|---|
| data access | agent 能看到哪些网页和字段 | 最小权限 |
| data transfer | 数据是否发给远端服务 | 网络边界 |
| data retention | 日志和轨迹是否保存 | 存储边界 |
| user control | 用户能否撤销和审计 | 可控性 |
| policy clarity | 隐私说明是否具体 | 合规与信任 |

这类评估的关键不是“agent 能不能完成任务”，而是“完成任务时是否过度收集、过度上传、过度保存”。

## 论文地形

1. 引言说明浏览器 agent 是高风险隐私节点。
2. 方法章节定义评估维度和样本范围。
3. 实证章节比较多个流行浏览器 agent 的隐私行为。
4. 分析章节讨论常见风险：数据外传、日志保留、权限不透明等。
5. 建议部分提出更清晰的用户控制和隐私实践。

读这篇时，我会把它当作 browser agent 产品 checklist，而不是单纯安全论文。

## 手工 toy 复现

任务：用户让浏览器 agent “帮我比较两家银行信用卡优惠”。

| agent 可能看到的数据 | 隐私问题 |
|---|---|
| 当前银行登录态 | 是否应允许访问 |
| 账户余额或交易记录 | 是否被上传到模型服务 |
| 页面截图 | 是否包含个人信息 |
| 操作轨迹日志 | 是否长期保存 |
| 自动填写申请表 | 是否需要二次确认 |

如果 agent 把整个页面 DOM 和截图都发给远端模型，即使任务完成，也可能已经过度暴露了用户信息。

## 评测读法

浏览器 agent 隐私评估要看三层：

1. **声明层**：隐私政策说了什么。
2. **实现层**：实际传输了什么、保存了什么。
3. **控制层**：用户能否限制、查看、删除和确认。

很多产品只在声明层说“重视隐私”，但真正关键是实现层和控制层。

## 踩过的坑

1. **不要把浏览器 agent 当普通聊天机器人**：它能看到登录态网页。
2. **不要默认截图安全**：截图可能包含地址、姓名、余额、验证码。
3. **不要忽略轨迹日志**：操作日志本身就是敏感数据。
4. **不要把用户同意做成一次性授权**：高风险动作需要分级确认。
5. **不要只管模型供应商**：浏览器扩展、代理服务器和分析系统也会接触数据。

## 与当前工作的连接

今天就能用：任何 browser agent 设计都应先画数据流图：页面数据从浏览器到模型、日志、服务器分别经过哪里。

下个月可以用：做内部 agent eval 时，把隐私检查加入验收：是否最小化页面内容、是否脱敏日志、是否对敏感动作二次确认。

不要照搬：论文评估的是公开浏览器 agent，内部产品要结合自己的权限系统、数据分类和审计规则。

## 学到什么

- 浏览器 agent 的隐私边界比普通 Web 自动化更复杂。
- 能力越强，越需要最小权限和可审计轨迹。
- 这篇和 [[agentdojo]]、[[injecagent]] 是互补关系：一个看隐私实践，一个看注入攻击。
- 对 study 图谱来说，它把 agent eval 从功能扩展到用户数据保护。

## 延伸阅读

- 原文：<https://arxiv.org/abs/2512.07725>
- 本卡使用版本：<https://arxiv.org/abs/2512.07725v1>
- [[browsergym]]：浏览器 agent 评测生态。
- [[assistantbench]]：真实耗时 Web 任务。
- [[agentdojo]]：工具型 agent prompt injection 攻防。
- [[injecagent]]：间接 prompt injection benchmark。

## 关联

- [[browsergym]]
- [[assistantbench]]
- [[agentdojo]]
- [[injecagent]]
- [[webarena]]

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
