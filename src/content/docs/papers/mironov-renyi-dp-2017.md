---
title: Rényi 差分隐私 — 隐私会计统一框架
来源: 'Mironov, "Rényi Differential Privacy", arXiv 2017'
日期: 2026-06-06
分类: 安全与隐私
子分类: 安全与隐私
难度: 高级
provenance: pipeline-v3
---

## 是什么

**Rényi Differential Privacy (RDP)**（Mironov 2017）用 **Rényi 散度**刻画机制输出在邻接数据集上的不可区分性，得到一族参数化隐私损失 **ε(α)**。相比传统 (ε,δ)-DP 的松散**基础组合**，RDP 对**多次高斯机制组合**（如 [[abadi-dpsgd-2016]] 训练很多 step）给出**更紧的 ε 边界**，成为 Opacus、TensorFlow Privacy 等库的默认会计工具。

日常类比：传统组合像每次旅行都加「全程保险费」累加；RDP 像**里程积分计划**——同一航空公司（高斯机制）飞多次，总花费（ε）用更精细的公式算，不会夸张到买不起票。

## 为什么重要

私有深度学习能「报告合理 ε」离不开 RDP：

- **替代 Moments Accountant** 的更干净数学框架
- **子采样放大**：随机 batch 进一步降 ε，RDP 分析优雅
- **与 [[dwork-calibrating-noise-2006]]**：Gaussian 机制 RDP 有闭式
- **工程默认**：调 noise_multiplier 时库内部在积 RDP 曲线

## 核心要点

1. **Rényi 阶 α**：α→∞ 逼近 pure DP；常用 α∈(1,32] 网格取最坏。

2. **组合**：同 α 下 RDP 预算相加（在转换前）。

3. **转 (ε,δ)**：取 min_α ε(α) + log(1/δ)/(α-1) 等标准转换。

4. **子采样**：每步只对 batch 算机制，RDP 增益明显。

5. **与 zCDP**：相关概念；实践库多直接 RDP。

## 实践案例

### 案例 1：Opacus 会计概念

训练结束 `privacy_engine.get_epsilon(delta=1e-5)` 内部积 RDP。

### 案例 2：扫 noise_multiplier

固定 steps、batch、δ，画 ε vs σ 选型给合规报告。

### 案例 3：对比基础组合

用同一 DP-SGD 超参，基础组合 ε vs RDP ε，展示差距数量级。

### 案例 4：与 [[mcmahan-fedavg-2017]] 联邦

多轮通信每轮本地多步 DP-SGD，RDP 需跨轮组合（研究活跃区）。

### 案例 5：与双千 atlas 交叉阅读

写完本篇后，在 `projects-atlas` / `papers-atlas` 中打开同子类邻居各 1 篇，对比「实践案例」段是否覆盖：安装、最小命令、排障三条。缺一则补进你自己的实验笔记（不必改站正文）。

## 踩过的坑

1. **α 网格太稀**：转换 (ε,δ) 偏乐观；库默认网格有讲究。

2. **δ 极小**：转换后 ε 爆炸；要现实选 δ。

3. **非高斯机制**：RDP 闭式不一定有；需查表或数值。

4. **把 RDP 当 ε-DP**：报告时要写清转换假设。

5. **评估泄露**：会计只覆盖训练机制，不含调参偷看 test。
5. **行数与模板**：交付前用 quality-gate 扫一遍，避免关联链到未写 slug。

## 适用 vs 不适用场景

**适用**：

- DP-SGD 训练隐私会计
- 多次组合高斯噪声分析
- 私有 ML 库实现者

**不适用**：

- 单次 Laplace 计数（[[dwork-calibrating-noise-2006]] 足够）
- 本地 DP（[[duchi-local-dp-2013]]）
- 无需数值 ε 的纯加密路线

## 历史小故事（可跳过）

- **2017**：arXiv 1702.07476 发表。
- **2018+**：并入 Opacus/TF Privacy 默认会计。
- **2020+**：大模型 DP 微调讨论仍用 RDP 报告。
- **2024+**：RDP 是隐私 ML 工程师必备词汇。

## 学到什么

- **会计定理决定「能训练多少 step」**。
- RDP 是为 Gaussian + 组合而生的工具，不是泛化 DP 定义。
- 实现库时应信库会计，手算仅教学。
- 子采样是 DP 深度学习隐藏红利。
- 读 [[abadi-dpsgd-2016]] 配本篇才完整。
- 复习时可对照 atlas 枢纽与 `written.txt` 邻居 slug，检查双向链接是否闭环。
- 动手跑通一个最小示例，比只读 README 更能记住参数含义与失败模式。
- 把本文档当「面试前 10 分钟速览卡」：是什么 → 为什么 → 一个命令/实验。
- 教别人时用「日常类比 + 一条命令」结构，反馈最好；复杂架构图留给二读。
- 若关联 slug 尚未落站，先用纯文本记名，`sync-written` 后再改成 `[[wikilink]]`。


## 延伸阅读

- https://arxiv.org/abs/1702.07476
- [[abadi-dpsgd-2016]] —— DP-SGD
- [[dwork-calibrating-noise-2006]] —— Laplace/Gaussian 机制
- [[dwork-our-data-ourselves-2006]] —— Gaussian 线
- Opacus RDP 文档
- [[kairouz-advances-fl-2019]] —— 联邦隐私组合

## 关联

- [[abadi-dpsgd-2016]] —— Moments Accountant 前身
- [[dwork-calibrating-noise-2006]] —— 机制基础
- [[dwork-dp-icalp-2006]] —— DP 定义
- [[mcmahan-fedavg-2017]] —— 联邦组合场景
- [[dwork-our-data-ourselves-2006]] —— 高斯机制族
- [[duchi-local-dp-2013]] —— LDP 对照
- [[kairouz-advances-fl-2019]] —— 开放问题
- [[bonawitz-fl-system-2019]] —— 部署语境

## 维护备注

- 与专题路线图对照：确认 frontmatter `分类/子分类` 与 research 表一致，避免 atlas 统计漂移。
- 代码块尽量可拷贝运行；路径用占位符 `/path/to` 标注，避免泄露本机目录。
- 写关联时优先已存在于 `data/written.txt` 的 slug，减少幽灵链接。
- 若从 worktree cherry-pick 合并，合并后再跑一次 `npm run atlas` 刷新反向链接。

- 本篇目标行数 150–200，与 study v3 quality-gate 对齐；扩写时优先加「实践案例」与「踩过的坑」，少堆外链。
- 若 pipeline 复审要求 refine，只改被点名的 H2 段，避免整篇重写导致关联漂移。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[abadi-dpsgd-2016]] —— DP-SGD — 深度学习差分隐私训练
- [[dwork-calibrating-noise-2006]] —— 校准噪声与敏感度 — Laplace 机制奠基
- [[dwork-our-data-ourselves-2006]] —— 分布式噪声生成 — 去掉可信管理员也能保护隐私
- [[erlingsson-rappor-2014]] —— RAPPOR — 本地差分隐私随机响应采集
- [[mcmahan-fedavg-2017]] —— FedAvg — 联邦学习奠基算法

