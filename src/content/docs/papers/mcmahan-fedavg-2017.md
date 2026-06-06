---
title: FedAvg — 联邦学习奠基算法
来源: 'McMahan et al., "Communication-Efficient Learning of Deep Networks from Decentralized Data", AISTATS 2017'
日期: 2026-06-06
分类: 安全与隐私
子分类: 安全与隐私
难度: 中级
provenance: pipeline-v3
---

## 是什么

**Federated Learning (FedAvg)**（McMahan 等，AISTATS 2017）提出：在数据留在各客户端的前提下，服务器反复**下发全局模型**，客户端本地训练若干 epoch，上传**模型增量（权重差）**，服务器按样本数**加权平均**聚合。论文用 Gboard 输入法场景论证「通信效率 + 隐私收益」——数据不集中上传，只传梯度/权重。

日常类比：各班老师不改学生作文原件，只交**班级平均分修正稿**给教研室合并——原件（数据）不出校，教研室（服务器）拼出全国版范文（全局模型）。

## 为什么重要

联邦学习叙事与系统的起点：

- **Google Gboard** 等产品线技术溯源
- **与 [[abadi-dpsgd-2016]]**：本地 DP + FedAvg 是「私有联邦」常见配方
- **与 [[bonawitz-fl-system-2019]]**：算法落地到 Android 规模的系统设计
- **与 [[kairouz-advances-fl-2019]]**：综述 58 个开放问题，FedAvg 是默认基线

## 核心要点

1. **本地多步 SGD**：客户端 `E` 个 epoch 再上传，减通信轮次。

2. **加权平均**：按各客户端样本数加权聚合，纠正非 IID 不平衡。

3. **非 IID 挑战**：标签分布偏斜时收敛慢；催生 FedProx 等变体（综述中讨论）。

4. **安全聚合**：上传权重可被窃听；需加密聚合（后文系统论文）。

5. **隐私非自动**：权重仍可能泄露；需 DP 或安全计算补强。

## 实践案例

### 案例 1：极简 FedAvg 一轮

```python
# server weights w; client k returns w_k after local train
w_new = sum(n_k * w_k for k in clients) / sum(n_k for k in clients)
```

### 案例 2：通信预算

对比「每步上传」vs「本地 E=5 再上传」的 bytes/round vs 精度。

### 案例 3：+ DP-SGD

客户端本地 [[abadi-dpsgd-2016]]，服务器只收已加噪更新；ε 组合要小心。

### 案例 4：与中心化训练对照

同数据 IID 集中训练 vs FedAvg 非 IID，画收敛曲线理解代价。

### 案例 5：与双千 atlas 交叉阅读

写完本篇后，在 `projects-atlas` / `papers-atlas` 中打开同子类邻居各 1 篇，对比「实践案例」段是否覆盖：安装、最小命令、排障三条。缺一则补进你自己的实验笔记（不必改站正文）。

## 踩过的坑

1. **客户端掉线**：聚合分母变；需 [[bonawitz-fl-system-2019]] 式容错。

2. **权重非 IID 不加权**：小客户端被淹没或带偏全局。

3. **本地 epoch 过大**：客户端漂移，全局发散。

4. **以为 FedAvg = 隐私**：梯度反演可攻击；要 DP/加密。

5. **评估集泄露**：全局 test 若来自某客户端分布，指标偏乐观。
5. **行数与模板**：交付前用 quality-gate 扫一遍，避免关联链到未写 slug。

## 适用 vs 不适用场景

**适用**：

- 移动/边缘数据不能出域
- 通信带宽比算力更贵
- 联邦研究基线算法

**不适用**：

- 数据可合法集中（直接分布式训练更简单）
- 强实时全局模型（多轮通信延迟高）
- 极小客户端算力（本地训练不可行）

## 历史小故事（可跳过）

- **2016**：arXiv 1602.05629 首版。
- **2017**：AISTATS 正式发表，命名 Federated Learning。
- **2019**：[[bonawitz-fl-system-2019]] 描述生产系统。
- **2024+**：大模型联邦微调仍用 FedAvg 族聚合思想。

## 学到什么

- **联邦 = 数据不动 + 模型动**，通信是核心成本。
- 加权平均是处理非 IID 的第一道简单修复。
- 隐私与安全要额外层，FedAvg 本身不提供。
- 系统论文与算法论文要配对读。
- FedAvg 是 [[kairouz-advances-fl-2019]] 讨论一切变体的参照点。
- 复习时可对照 atlas 枢纽与 `written.txt` 邻居 slug，检查双向链接是否闭环。
- 动手跑通一个最小示例，比只读 README 更能记住参数含义与失败模式。
- 把本文档当「面试前 10 分钟速览卡」：是什么 → 为什么 → 一个命令/实验。
- 教别人时用「日常类比 + 一条命令」结构，反馈最好；复杂架构图留给二读。
- 若关联 slug 尚未落站，先用纯文本记名，`sync-written` 后再改成 `[[wikilink]]`。


## 延伸阅读

- https://arxiv.org/abs/1602.05629
- [[bonawitz-fl-system-2019]] —— 系统实现
- [[kairouz-advances-fl-2019]] —— 综述
- [[abadi-dpsgd-2016]] —— 私有 SGD
- [[erlingsson-rappor-2014]] —— 另一隐私采集路径
- Flower / TensorFlow Federated 文档

## 关联

- [[abadi-dpsgd-2016]] —— 本地 DP 训练
- [[bonawitz-fl-system-2019]] —— Google FL 系统
- [[kairouz-advances-fl-2019]] —— FL 综述
- [[dwork-calibrating-noise-2006]] —— DP 机制
- [[mironov-renyi-dp-2017]] —— 隐私会计
- [[duchi-local-dp-2013]] —— LDP 理论
- [[erlingsson-rappor-2014]] —— 客户端随机响应
- [[dwork-dp-icalp-2006]] —— 隐私定义

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
- [[erlingsson-rappor-2014]] —— RAPPOR — 本地差分隐私随机响应采集
- [[mironov-renyi-dp-2017]] —— Rényi 差分隐私 — 隐私会计统一框架

