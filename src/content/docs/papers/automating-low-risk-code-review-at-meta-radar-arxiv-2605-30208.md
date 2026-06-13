---
title: Automating Low-Risk Code Review at Meta RADAR
来源: https://arxiv.org/abs/2605.30208
日期: 2026-06-13
分类: 其他
子分类: 工程文化
provenance: pipeline-v3
---

# Automating Low-Risk Code Review at Meta: RADAR

## 一、引言：为什么要自动化代码审查

### 1.1 一个日常类比

想象你在一家大型超市工作，每天有成千上万的商品需要上架。过去，每个商品都要经理亲自检查一遍标签、价格、保质期。后来超市引入了自助扫描和 AI 摄像头，低风险的简单商品（比如一包已知品牌的盐）可以直接上架，只有异常商品（比如价格标签跟系统对不上）才需要经理介入。

RADAR 做的就是一件事：**把低风险代码变更自动通过代码审查**，让人类只关注真正有风险的部分。

### 1.2 背景与动机

Meta 的软件开发模式有几个关键特点：

- 使用 **Phabricator** 作为代码审查平台（类似 GitHub 的 PR 系统）
- 每个代码变更叫 **diff**（difference 的缩写）
- 代码必须经过 peer review（同事审查）+ 自动化测试 + 逐步部署
- 所有代码在**单体仓库（monorepo）**中管理

但 AI 编码工具改变了游戏规则：

| 指标 | 年增长率 |
|------|---------|
| 每次 diff 的有效代码行数 | +105.9% |
| 每个开发者每月 diff 数量 | +51% |
| agentic AI 贡献的增长 | >80% |

与此同时，24 小时内被及时审查的 diff 比例却在下降。这意味着：**代码的生产速度远超人类审查的能力**。

在这个背景下，Radish 论文提出三个研究问题：

1. **可行性（Feasibility）**：风险分级的自动化能否在大规模下运行？
2. **校准（Calibration）**：调整风险阈值如何影响自动化产出与安全性之间的权衡？
3. **影响（Impact）**：自动化审查能在多大程度上减少 AI 生成代码的端到端延迟？

## 二、核心概念拆解

### 2.1 RADAR 是什么

RADAR = **R**isk **A**ware **D**iff **A**uto **R**eview（风险感知 diff 自动审查）

它是一个**多阶段漏斗（multi-stage funnel）**，每一层都像安检一样逐步筛选：

```
diff 进入
  |
  +-> 第1层：作者身份分类（人类 / 机器）
  |
  +-> 第2层：准入资格检查（eligibility gates）
  |
  +-> 第3层：静态启发式规则（static heuristics）
  |
  +-> 第4层：Diff Risk Score（机器学习模型打分）
  |
  +-> 第5层：LLM 自动化代码审查（ACR）
  |
  +-> 第6层：确定性验证（deterministic validation）
  |
  +-> 通过：自动合入（auto-land）
  +-> 未通过：转人工审查
```

### 2.2 RACER：AI 代码生成工具

在讲 RADAR 之前，需要先认识它的"搭档"**RACER**（Risk-Aware Code Editing and Refactoring）：

- RACER 是一个 AI 工具，帮开发者自动生成代码变更
- 开发者写一个**runbook**（操作手册），告诉 RACER 要做什么
- RACER 在沙箱里生成 diff，跑验证，提交审查
- RACER 每天约生成 3,000 个 diff，其中 59% 不需要人类修改就落地

**关键关系**：RACER 生成的 diff 是 RADAR 的主要输入来源之一。

### 2.3 Diff Risk Score (DRS)：核心打分模型

DRS 是 RADAR 的心脏。它做的事情是：**预测一个 diff 有多大可能引发线上事故（Production Incident）**。

DRS 的打分方式是百分位制：

- **P5** = 只有最安全的 5% 的 diff 能通过
- **P20** = 最安全的 20% 能通过
- **P50** = 最安全的 50% 能通过

打个比方：学校考试，P5 就是"全班只有前 5% 的学生能及格"，P50 就是"全班前 50% 能及格"。P 值越低，门槛越严格。

DRS 原本是为代码冻结期（code freeze）低风险的 diff 能直接合入而开发的，现在已扩展到 Meta 约 20 个风险感知功能。

### 2.4 Automated Code Review (ACR)：LLM 做审查

ACR 是一个基于大语言模型的代码审查智能体：

- 它不仅看 diff 的元数据（文件路径、行数），还能**理解代码的实际语义**
- 它把 diff 中的每个变更分类为 **安全信号** 或 **风险信号**

**安全信号**的例子：

- 重构（不改行为）
- 删除死代码
- 增加防御性编程
- 添加日志
- 纯格式修改
- 文档/注释更新

**风险信号**的例子：

- 高复杂度变更（复杂度评分 >= 4）
- 重大结构性变更
- 识别出的 bug 或逻辑错误
- 性能风险
- 安全漏洞（密钥泄露、SQL 注入、认证绕过）

ACR 的 auto-accept 条件非常严格：

- 置信度 >= 8/10
- 所有变更都归类为安全类别
- 任何一个风险信号都会导致自动不合格

## 三、RADAR 的准入模型（Eligibility Model）

RADAR 最独特的设计在于：**不同的 diff 走不同的准入路径**。

### 3.1 第一层：作者分类

```
diff
  |
  +-- 人类写的 (Human authored)
  |     |
  |     +--> 进入 RADAR Verification + Approval 管道
  |
  +-- 机器写的 (Bot authored)
        |
        +-- 确定性 codemod (Deterministic codemod)
        |     |
        |     +--> Blanket AutoAccept（完全自动，无需逐 diff 审查）
        |
        +-- AI 生成的 codemod
              |
              +--> Conditional AutoAccept（需逐 diff 过 ACE 管道）
        |
        +-- RACER runbook
              |
              +--> 按 runbook 单独评估（最细粒度）
```

### 3.2 三种机器 diff 的准入方式

**方式 1：确定性 codemod → Blanket AutoAccept**

确定性 codemod 是那种"输入已知代码，输出确定代码"的转换，比如 API 迁移、import 整理。因为转换本身经过审核，所以 diff 可以**直接全量通过**，不需要逐 diff 审查。

**方式 2：AI 生成的 codemod → Conditional AutoAccept**

AI 生成的 codemod 每次输出的 diff 可能不同（因为 AI 会根据上下文生成），所以每个 diff 都要单独走 ACE 管道（包括 DRS 打分 + ACR 审查）。

**方式 3：RACER runbook → 逐 runbook 评估**

这是最细粒度的方式。每个 RACER runbook 要满足四个条件：

1. **风险历史**：过去 60 天内零线上事故、低回退率、低拒绝率
2. **每日限额**：防止单个 runbook 淹没提交队列
3. **DRS 阈值**：可信 runbook 用 P50，新 runbook 用 P20
4. **黑名单**：出过事故的 runbook 永久禁止自动合入

## 四、代码示例

### 4.1 示例 1：DRS 阈值配置（YAML）

不同 runbook 可以配置不同的 DRS 阈值：

```yaml
# 高风险 runbook：严格的 P20 阈值
runbook: "fix-dead-code-cleanup"
  risk_threshold: P20        # 只有最安全的 20% diff 能过
  daily_limit: 500           # 每天最多 500 个 diff
  allowlist: false           # 未列入白名单，用严格阈值

# 低风险 runbook：宽松的 P50 阈值
runbook: "api-migration-v2"
  risk_threshold: P50        # 最安全的 50% diff 能过
  daily_limit: 2000          # 每天最多 2000 个 diff
  allowlist: true            # 已列入白名单（60天零事故）

# 被拉黑的 runbook
runbook: "auth-module-refactor"
  status: BLOCKED            # 出过线上事故，永久禁止
  reason: "caused PI-2026-0315"
```

**设计意图**：同一个工具，不同 runbook 的待遇可以完全不同。安全记录好的 runbook 享受更宽松的阈值，出过问题的 runbook 被限制甚至拉黑。

### 4.2 示例 2：ACR 安全/风险信号分类

ACR 对 diff 中的每个变更做语义分类：

```python
# ACR 看到的 diff 片段
diff --git a/server/auth.py b/server/auth.py
@@ -42,6 +42,11 @@ def login(user, password):
+    if not user:
+        return {"error": "missing user"}
+
     hashed = hash_password(password)
     if not verify_signature(user, hashed):
         raise AuthenticationError("invalid credentials")
```

ACR 的分析结果：

```yaml
change_id: "auth.py:43-44"
  classification: SAFE
  signal: "defensive_programming_addition"  # 防御性编程
  confidence: 9.2
  description: "Added null check for user parameter"

change_id: "auth.py:46"
  classification: SAFE
  signal: "no_behavioral_change"             # 不影响行为
  confidence: 8.5
  description: "Whitespace-only formatting"
```

**总结**：所有变更都被分类为 SAFE，且置信度都 > 8，ACR 会给出 auto-accept 决策。

### 4.3 示例 3：一个被自动拒绝的 diff

```python
# ACR 看到的 diff 片段
diff --git a/api/payment.py b/api/payment.py
@@ -15,7 +15,7 @@ def process_payment(user_id, amount):
-    user = get_user(user_id)
+    user = get_user(request.params['user_id'])
```

ACR 的分析结果：

```yaml
change_id: "payment.py:18"
  classification: RISK
  signal: "potential_security_vulnerability"  # 潜在安全漏洞
  confidence: 9.1
  description: "Changed from trusted parameter to raw request param.
               Possible injection vector. Behavior change detected."
```

**总结**：检测到风险信号 → ACR 自动拒绝 → diff 转人工审查。

## 五、核心数据与成果

### 5.1 规模数据

| 指标 | 数值 |
|------|------|
| RADAR 审查的 diff 总数 | 535,000+ |
| 成功自动合入的 diff | 331,000+ |
| 日均处理 diff | 25,000+ |
| 当前 approve 率 | 60.31% |

### 5.2 安全性数据

| 指标 | RADAR diff | 非 RADAR diff | 对比 |
|------|-----------|--------------|------|
| 回退率 (Revert rate) | 低 | 基准 | 1/3 |
| 线上事故率 (PI rate) | 极低 | 基准 | 1/50 |

### 5.3 效率数据

| 指标 | 改善幅度 |
|------|---------|
| 中位关闭时间 (median time to close) | 减少 >330% |
| 中位审查等待时间 (median review wall time) | 减少 35% |

### 5.4 阈值调优实验

将 DRS 阈值从 P25（最安全的前 25%）放宽到 P50（最安全的前 50%）：

- approve 率上升到 **60.31%**
- 安全性指标（回退率/事故率）保持在可接受范围内
- 说明 **阈值调节是一个可控的安全-效率平衡旋钮**

## 六、两个管道的详细流程

### 6.1 AI / Bot diff 管道（ACE 管道）

```
Bot diff 进入
  |
  +-> 确定 codemod?
  |     +-- 是 -> Blanket AutoAccept -> 合入
  |     +-- 否 -> 进入 ACE 管道
  |
  +-> ACE 管道:
  |     |
  |     +-> DRS 打分 (P20 或 P50 取决于是否白名单)
  |     +-> ACR 审查 (语义分析, 安全/风险分类)
  |     +-> 确定性验证 (CI, 测试, 静态分析)
  |     +-> 全部通过 -> 自动合入
  |     +-> 任何一层失败 -> 转人工审查
```

### 6.2 人类 diff 管道（Verification + Approval 管道）

```
人类 diff 进入
  |
  +-> 作者资格检查
  |     |
  |     +-> 角色/经验是否达标?
  |     +-> 是否拥有此代码的运营权?
  |
  +-> 范围排除检查
  |     |
  |     +-> 是否涉及开源代码? -> 排除
  |     +-> 是否涉及 SOX 合规代码? -> 排除
  |
  +-> Diff 状态检查
  |     |
  |     +-> 不是 WIP?
  |     +-> 不是 RFC?
  |     +-> 不是之前被拒绝的?
  |     +-> 是最新版本?
  |
  +-> 内容检查
  |     |
  |     +-> 无黑名单关键词?
  |     +-> 不匹配黑名单文件后缀?
  |
  +-> 全部通过 -> 进入 RADAR Verification + Approval
        |
        +-> DRS P5 (最安全的前 5%)
        +-> ACR 审查
        +-> 全部通过 -> 自动合入（RADAR Approval）
        +-> 任何一层失败 -> 转人工审查
```

## 七、关键设计哲学

### 7.1 分层安检

RADAR 不是"用一个模型搞定一切"，而是层层递进：

1. **静态规则** 快速过滤（文件路径、大小、类型）
2. **DRS 模型** 做风险预测
3. **ACR 审查** 做语义理解
4. **确定性验证** 做最终保证

每一层都只把"足够确定"的 diff 放过去，把"拿不准"的交给下一层或人类。

### 7.2 渐进式部署

RADAR 支持**渐进式 rollout**：

- 先让低风险 runbook 跑
- 监控安全指标
- 确认没问题再放宽阈值
- 出问题时立即暂停某个 runbook

### 7.3 不同来源，不同信任度

这是 RADAR 最核心的创新之一：**不把所有 bot 一视同仁**。

- 确定性 codemod：信任最高（全量通过）
- 白名单 RACER runbook：信任中等（P50）
- 未白名单 AI 生成：信任较低（P20）
- 人类 diff：最严格（P5）

## 八、总结

RADAR 解决了一个所有大规模工程团队都会遇到的问题：**当 AI 让代码生产速度翻倍时，人类审查能力跟不上怎么办？**

它的核心答案是：

1. **风险分级**：不是所有代码变更都一样危险
2. **多层漏斗**：静态规则 + ML 评分 + LLM 审查 + 确定性验证
3. **差异化信任**：不同来源的 diff 用不同的准入标准
4. **渐进式部署**：安全优先，逐步放宽

最终成果：在 535K+ diff 的生产规模下，实现了 60.31% 的 approve 率，回退率仅为 1/3，线上事故率仅为 1/50，关闭时间减少了 330%。

---

## 九、我的思考

这篇论文最值得学习的点是**"分层过滤"**的设计思想。

第一层用最简单的静态规则快速过滤，第二层用 ML 模型做预测，第三层用 LLM 做深度理解，第四层用确定性验证做兜底。每一层都只解决自己能解决的部分问题，不试图用一个模型搞定一切。

这种思想在系统设计里很常见（比如 CDN -> 缓存 -> 后端），但把它应用到代码审查领域是一个很好的实践案例。
