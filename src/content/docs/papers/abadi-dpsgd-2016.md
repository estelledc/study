---
title: DP-SGD — 深度学习差分隐私训练
来源: 'Abadi et al., "Deep Learning with Differential Privacy", CCS 2016'
日期: 2026-06-06
分类: 安全与隐私
子分类: 安全与隐私
难度: 高级
provenance: pipeline-v3
---

## 是什么

**Deep Learning with Differential Privacy**（Abadi 等，CCS 2016）提出 **DP-SGD**：在随机小批量梯度下降中，对**每条样本梯度裁剪**到范数 C，再对平均梯度加**高斯噪声**，使整次训练满足 (ε,δ)-差分隐私。论文还给出 **Moments Accountant** 紧于基础组合定理的隐私会计，使 MNIST/CIFAR 级模型在可用精度下达到可报告 ε。

日常类比：全班交作业算平均分（梯度），但**每人答案先涂黑敏感句（clip）**，再**往平均分里撒一把沙子（noise）**——外人看不出你换没换作业本。

## 为什么重要

私有 ML 工业栈的实操起点：

- **TensorFlow Privacy / Opacus / JAX Privacy** 都实现 DP-SGD 变体
- **与 [[dwork-calibrating-noise-2006]]**：clip 控敏感度，高斯机制加噪
- **与 [[mironov-renyi-dp-2017]]**：现代库多用 RDP 会计替代 Moments Accountant
- **大模型微调隐私**讨论仍引用 DP-SGD 权衡曲线

## 核心要点

1. **Per-sample gradient**：要对每条样本算梯度才能 clip；实现成本高。

2. **Clip 范数 C**：限制单样本对更新的 L2 影响上界 → 敏感度。

3. **噪声 σ**：与 C、batch size、ε、δ 联动；σ 大隐私强、精度跌。

4. **Moments Accountant**：跟踪隐私损失矩生成函数，组合更紧。

5. **(ε,δ)-DP**：δ 通常取 1/|数据集| 量级极小失败概率。

## 实践案例

### 案例 1：Opacus 伪代码概念

```python
# 概念流程：per-sample grad → clip → mean → add Gaussian noise → step
for x, y in loader:
    grads = per_sample_gradients(model, x, y)
    grads = [clip(g, max_norm=C) for g in grads]
    mean_g = sum(grads) / len(grads)
    mean_g += torch.randn_like(mean_g) * noise_multiplier * C / batch_size
    optimizer.step(mean_g)
```

### 案例 2：ε 与精度曲线

固定架构，扫 noise_multiplier，画 test acc vs ε 报告给合规。

### 案例 3：与联邦学习

[[mcmahan-fedavg-2017]] + 本地 DP-SGD → 联邦私有训练原型（注意组合会计）。

### 案例 4：LLM 微调争议

全参数 DP 微调大模型 ε 往往很大或精度崩；读论文知**理论可行≠产品默认**。

### 案例 5：与双千 atlas 交叉阅读

写完本篇后，在 `projects-atlas` / `papers-atlas` 中打开同子类邻居各 1 篇，对比「实践案例」段是否覆盖：安装、最小命令、排障三条。缺一则补进你自己的实验笔记（不必改站正文）。

## 踩过的坑

1. **忘记 per-sample grad**：普通 PyTorch backward 是平均梯度，不能直接 clip。

2. **batch size 影响噪声**：大 batch 降噪声方差但也改变会计。

3. **δ 任意选**：过大虚假安全；过小噪声爆炸。

4. **评估泄露**：test set 反复调参不算 DP；需 hold-out 或额外预算。

5. **非凸理论**：DP-SGD 收敛保证弱于凸问题；工程靠实验。
5. **行数与模板**：交付前用 quality-gate 扫一遍，避免关联链到未写 slug。

## 适用 vs 不适用场景

**适用**：

- 小规模敏感表格/图像训练要可审计 ε
- 理解私有 ML 工具默认行为
- 与中心化 DP 发布对比

**不适用**：

- 纯推理加密（[[gentry-fhe-2009]]）
- 本地 DP 采集（[[erlingsson-rappor-2014]]）
- 无隐私合规需求的常规训练

## 历史小故事（可跳过）

- **2016**：CCS 发表，Google 作者群。
- **2018+**：Opacus、TF Privacy 开源。
- **2020+**：联邦+DP 成为移动键盘标配叙事。
- **2024+**：LLM 时代重新审视 DP 微调可行性。

## 学到什么

- **私有训练 = clip + noise + 会计**，不是魔法加密。
- per-sample gradient 是工程主要成本。
- ε 必须与业务精度一起报告。
- Moments Accountant 启发了 [[mironov-renyi-dp-2017]] 等后续会计。
- DP-SGD 与 [[mcmahan-fedavg-2017]] 结合是联邦隐私常见故事线。
- 复习时可对照 atlas 枢纽与 `written.txt` 邻居 slug，检查双向链接是否闭环。
- 动手跑通一个最小示例，比只读 README 更能记住参数含义与失败模式。
- 把本文档当「面试前 10 分钟速览卡」：是什么 → 为什么 → 一个命令/实验。
- 教别人时用「日常类比 + 一条命令」结构，反馈最好；复杂架构图留给二读。
- 若关联 slug 尚未落站，先用纯文本记名，`sync-written` 后再改成 `[[wikilink]]`。


## 延伸阅读

- https://arxiv.org/abs/1607.00133
- [[dwork-calibrating-noise-2006]] —— 机制基础
- [[mironov-renyi-dp-2017]] —— RDP 会计
- [[mcmahan-fedavg-2017]] —— 联邦学习
- Opacus 文档
- [[kairouz-advances-fl-2019]] —— FL 隐私开放问题

## 关联

- [[dwork-dp-icalp-2006]] —— DP 定义
- [[dwork-calibrating-noise-2006]] —— 敏感度与加噪
- [[mironov-renyi-dp-2017]] —— 现代会计
- [[mcmahan-fedavg-2017]] —— FedAvg
- [[bonawitz-fl-system-2019]] —— 联邦系统
- [[duchi-local-dp-2013]] —— LDP 对照
- [[erlingsson-rappor-2014]] —— 客户端 LDP
- [[kairouz-advances-fl-2019]] —— 联邦隐私综述

## 维护备注

- 与专题路线图对照：确认 frontmatter `分类/子分类` 与 research 表一致，避免 atlas 统计漂移。
- 代码块尽量可拷贝运行；路径用占位符 `/path/to` 标注，避免泄露本机目录。
- 写关联时优先已存在于 `data/written.txt` 的 slug，减少幽灵链接。
- 若从 worktree cherry-pick 合并，合并后再跑一次 `npm run atlas` 刷新反向链接。

- 本篇目标行数 150–200，与 study v3 quality-gate 对齐；扩写时优先加「实践案例」与「踩过的坑」，少堆外链。
- 若 pipeline 复审要求 refine，只改被点名的 H2 段，避免整篇重写导致关联漂移。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[bohme-aflfast-2016]] —— AFLFast — 灰盒 Fuzz 的马尔可夫调度
- [[cheon-ckks-2017]] —— Homomorphic Encryption for Arithmetic of Approximate Numbers
- [[duchi-local-dp-2013]] —— Local Privacy and Statistical Minimax Rates
- [[dwork-calibrating-noise-2006]] —— 校准噪声与敏感度 — Laplace 机制奠基
- [[dwork-our-data-ourselves-2006]] —— 分布式噪声生成 — 去掉可信管理员也能保护隐私
- [[erlingsson-rappor-2014]] —— RAPPOR — 本地差分隐私随机响应采集
- [[gentry-fhe-2009]] —— Gentry FHE — 全同态加密开山
- [[mcmahan-fedavg-2017]] —— FedAvg — 联邦学习奠基算法
- [[mironov-renyi-dp-2017]] —— Rényi 差分隐私 — 隐私会计统一框架

