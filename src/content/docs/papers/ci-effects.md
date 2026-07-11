---
title: CI Effects — 持续集成不是免费午餐，价值看实现细节
来源: 'Ståhl & Bosch, "Modeling Continuous Integration Practice Differences in Industry Software Development", JSS 2014'
日期: 2026-05-29
分类: 软件工程
难度: 初级
---

## 是什么

**持续集成（Continuous Integration, CI）效应研究**——把过去 6 年（2008-2013）业界 22 项 "我们组上了 CI 之后……" 的报告汇总起来，问一个朴素问题：**CI 真的有用吗？什么情况下有用？**

日常类比：像消费者协会做"22 款空气炸锅评测"——你不能听一家广告说"很好吃"就买，要看大样本平均结果，还要看是哪种食材、什么火力下好吃。

Ståhl 和 Bosch（爱立信 + 查尔默斯理工大学）的结论很反直觉：

- CI 倡导者吹的好处大多**没有数据支撑**
- 真正决定 CI 有没有用的，是两件具体事——**构建多快**、**测试可靠不可靠**

## 为什么重要

不理解这篇论文，下面这些事都没法解释：

- 为什么有的团队上了 CI 反而更慢，"流程是对的，但人都在等"
- 为什么 Google / Netflix 谈 CI 永远先谈 build farm 投入，而不是工具选型
- 为什么 DORA 报告（State of DevOps）2018 年才有真正的大样本数据——这篇是它的"问题清单"
- 为什么"上 CI"在嵌入式 / 安全关键行业（航空、汽车）至今争议很大

## 核心要点

CI 价值取决于 **三件具体事**，不是流程本身：

1. **构建时间（build time）**：超过 10 分钟，开发者就切去做别的事，CI 的"即时反馈"卖点就死了。类比：烤箱响铃要在你还在厨房的时候响，等你出门遛狗才响就废了。

2. **测试可靠性（test reliability）**：测试时通时不通过（flaky），团队会学会忽略失败邮件，真 bug 就埋在噪声里。类比：天天误报的烟雾报警器，等真起火那天没人理。

3. **团队文化匹配（team culture）**：CI 嵌在分支模型 / 提交频率 / 部署频率里，照搬 web 团队的 CI 配置到嵌入式不会有同样收益。类比：健身房的力量训练计划照搬给瑜伽教室，学员练废。

把这三件事调好，CI 才有正收益；任一件不达标，CI 是负收益。

## 实践案例

### 案例 1：Build time 10 分钟阈值

论文 Section 5.2 把 22 项研究里有具体构建时间的 9 项画成一张曲线：

```
Build Time vs CI Value
    +++ │ ●●●●  ← ≤ 5 min：开发者不切换，反馈最强
      + │      ●●●●  ← 5-10 min：尚可
      0 │           ●●●  ← 10-30 min：临界，已开始下个任务
      - │              ●●●●●  ← > 30 min：变成异步 batch，"持续"二字消失
        └──────┬────┬─────┬──────→
              5min  10   30  build time
```

**逐部分解释**：

- 5 分钟内：开发者还在等 build，看到失败立即修
- 10 分钟外：开发者已切去看 Slack / 邮件，注意力被打断成本巨大（[[programmer-interruption]] 量化过这个切换成本）
- 30 分钟外：开发者已开始下一个任务，CI 失败信号被埋

### 案例 2：Flaky test 比慢 build 更致命

| 来源团队 | 测试通过率 | flaky 处理 | 团队信任度 |
|---|---|---|---|
| Stolberg 2009（Web 12 人） | 99.5% | 立即修 | 高 |
| Vasilescu 2013（开源 30+） | 87% | 忽略 | 低 |
| Goodman 2008（嵌入式 50+） | 78% | 不修 | 极低 |

**论文原话**：a flaky CI is worse than no CI（一个不可靠的 CI 比没有 CI 更糟）。

机制：人对低概率信号会脱敏（base rate neglect），95% 的失败是 flaky 时，剩下 5% 真 bug 看不出来。

### 案例 3：Web 团队 vs 嵌入式团队同样上 CI 收益差 10 倍

```
Web 团队（Stolberg）：
  trunk-based + 每人每天 5-8 commit + 测试全员写 + 多次/天部署
  → CI 失败 1 小时内修，绿条 = 真"可发布"

嵌入式团队（Goodman）：
  feature branch + 每人每天 0.5 commit + QA 专职写测试 + 季度部署
  → CI 失败拖几天，绿条 ≠ "可发布"，CI 名存实亡
```

**逐部分解释**：CI 工具本身只是冰山一角，水下是分支模型、提交粒度、所有权文化。改工具最简单，改文化最难——这是 90% 失败 CI 转型的根因。

## 踩过的坑

1. **把 CI 当 silver bullet**：基础（build < 10 min + test > 95% pass）不到位时，CI 是负收益（[[no-silver-bullet]] 早就预言过这种"过程优化天花板"）
2. **照抄"deploy 多次/天"指标**：医疗 / 航空 / 汽车有合规审计，强行高频部署反而违规
3. **只测 build 速度不测 flaky 率**：投入产出比上 reliability > speed，先修 flaky 再优化构建
4. **2026 年还硬套 10 分钟阈值**：当年 Jenkins 自建 build farm，现在 GitHub Actions 让 < 5 min 几乎免费，阈值应收紧到 5 分钟
5. **把"22 项研究"当 meta-analysis**：论文做的是 narrative synthesis（叙事综合），没算 effect size，结论仍带主观判断

## 适用 vs 不适用

**适用**：

- 评估自己团队"要不要上 / 要不要继续投资 CI"——先用论文 5 维度自检
- 对推 DevOps 转型的人讲 trade-off，反驳"CI 永远好"的口号
- 学系统综述（systematic literature review, SLR）方法——这是 CI 领域第一份

**不适用**：

- 找具体实施手册——这篇是综述，不教你配 Jenkins
- 找 2018 年后的大规模数据——用 DORA / Accelerate 续读
- 安全关键系统的 CI 落地——DO-178C / ISO 26262 合规约束论文没覆盖

## 历史小故事（可跳过）

- **1995 年**：微软 "Daily Build and Smoke Test" 是 CI 祖先，daily 不是 continuous
- **1999 年**：Kent Beck 在 XP 里整合 build automation + test-first（[[beck-tdd]]）
- **2006 年**：Martin Fowler 写 Continuous Integration 文章，定义概念，但是 advocacy，没数据
- **2014 年**：Ståhl & Bosch 给 Fowler 2006 做"实证审计"——这就是本文
- **2018 年**：Forsgren / Humble / Kim 的 Accelerate 用 30000+ 数据点把这篇 2014 提的"gap"填上
- **2020 年代**：GitOps / Argo CD / Vercel Preview deploy 把"集成"概念扩展到"代码 + 环境一起合"，论文的 5 维度框架仍然适用，只是数字阈值要收紧

## 学到什么

1. **流程改进的价值不是流程本身，是它依赖的具体条件**——CI 需要 build time + test reliability + culture 三件事到位
2. **"声称"和"证据"之间有大 gap**——8 个 CI 倡导收益里，论文系统评下来只有 2 个有强证据
3. **系统综述（SLR）比单个案例研究更可信**——但 22 项异质性太大，narrative synthesis 没算 effect size，结论仍带主观判断
4. **改工具一周，改文化一年**——任何"上 X 流程"决策都该问"prerequisites 满足吗 + culture 匹配吗"
5. **2014 年的阈值在 2026 已过时**——云原生 CI 把基础设施成本压到接近零，但论文的"价值取决于实现细节"框架仍然成立

## 延伸阅读

- 视频：[Dave Farley — Continuous Delivery in 5 Minutes](https://www.youtube.com/watch?v=NnyJfXmpwwQ)（CI/CD 概念 5 分钟入门）
- 文章：[Martin Fowler — Continuous Integration (2006)](https://martinfowler.com/articles/continuousIntegration.html)（CI 概念定义，advocacy 经典）
- 书：Forsgren / Humble / Kim, *Accelerate* (2018)（DORA 大规模量化版的 Ståhl-Bosch）
- 论文 PDF：[Ståhl & Bosch JSS 2014](https://www.sciencedirect.com/science/article/abs/pii/S0164121214001514)（18 页，重点看 Section 4-6）
- [[great-swe]] —— 软件工程实证研究方法论
- [[copilot-rct]] —— 软工实证研究的另一范式（随机对照试验 vs 系统综述）

## 关联

- [[no-silver-bullet]] —— Brooks 1986 早就说没有任何流程能解决本质复杂性，CI 也不例外
- [[beck-tdd]] —— TDD 是 CI 的前提，没 test 谈不上 CI
- [[programmer-interruption]] —— 量化"超过 10 分钟构建"为什么破坏开发者注意力
- [[cognitive-load-theory]] —— 解释 context switch 成本来自工作记忆耗散
- [[great-swe]] —— 软件工程实证研究的方法学背景
- [[copilot-rct]] —— 用随机对照试验测软工干预效果，本文用的是系统综述
- [[pair-programming]] —— 同样是 XP 实践，数据基础同样比想象的薄

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[coeffect-petricek]] —— Coeffects — 让类型系统追踪「需要多少上下文」
- [[frank-effects]] —— Frank — 让 effect handler 写得就像普通函数
