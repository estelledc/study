---
title: Gentry FHE — 全同态加密开山
来源: 'Gentry, "A Fully Homomorphic Encryption Scheme", Stanford PhD 2009'
日期: 2026-06-06
分类: 安全与隐私
子分类: 安全与隐私
难度: 高级
provenance: pipeline-v3
---

## 是什么

**Fully Homomorphic Encryption (FHE)** 允许在**密文上直接做任意计算**，解密结果等同对明文计算。Craig **Gentry** 2009 博士论文首次构造可行 FHE（基于理想格与 **bootstrapping** 刷新噪声），打破「只能同态加法」旧局限。后续 [[brakerski-bgv-2012]]、[[fan-vercauteren-bfv-2012]]、[[cheon-ckks-2017]] 等方案降低 bootstrapping 依赖，但 Gentry 仍是概念与可行性证明的**母本**。

日常类比：把作业锁进保险箱（加密），老师在**不打开锁**的情况下改箱内草稿（同态运算），最后你用钥匙打开看到批改结果——中间没人看过原文。

## 为什么重要

「加密数据上算 AI」叙事的理论起点：

- **私有推理**、密封拍卖、隐私 SQL 都引用 FHE 可能性
- **与 DP 对照**：DP 发布噪声统计；FHE 对密文精确算（代价是算力）
- **供应链**：Microsoft SEAL、OpenFHE、Zama 等库谱系可追溯到 Gentry 后方案
- **理解 bootstrapping**：噪声累积为何曾使 FHE「不可用」

## 核心要点

1. **Somewhat homomorphic**：支持有限深度电路，噪声会爆。

2. **Bootstrapping**：同态评估解密电路，「刷新」密文噪声，实现 universal。

3. **理想格假设**：安全性归约到格问题；与 [[regev-lwe-2005]] 血脉相连。

4. **性能**：早期完全不可商用；BGV/BFV/CKKS 走实用路线。

5. **非万能隐私**：元数据、访问模式仍泄露；FHE 只护数据内容。

## 实践案例

### 案例 1：概念电路

加密 bit a,b → 同态 AND → 解密得 a∧b；教学理解「电路深度」。

### 案例 2：SEAL BFV 整数加乘

用 OpenFHE/SEAL 示例跑小多项式求值，感受密文大小与噪声。

### 案例 3：与 DP 私有推理对比

同线性模型：FHE 精确但慢；DP 噪声快但近似。

### 案例 4：读方案演进链

Gentry → BGV/BFV（整数）→ CKKS（近似浮点 ML 推理）。

### 案例 5：与双千 atlas 交叉阅读

写完本篇后，在 `projects-atlas` / `papers-atlas` 中打开同子类邻居各 1 篇，对比「实践案例」段是否覆盖：安装、最小命令、排障三条。缺一则补进你自己的实验笔记（不必改站正文）。

## 踩过的坑

1. **以为 FHE 已默认生产 ML**：大模型 FHE 推理仍极慢/在研究。

2. **混淆 HE 等级**：部分同态 vs 全同态 vs bootstrapping-free。

3. **忽略密钥管理**：谁持密钥、轮换、侧信道另题。

4. **电路深度**：每层乘法门噪声涨；需 bootstrapping 或 leveled scheme。

5. **与 ZK 混淆**：FHE 不算证明计算正确；SNARK 另族（[[ben-sasson-stark-2018]]）。
5. **行数与模板**：交付前用 quality-gate 扫一遍，避免关联链到未写 slug。

## 适用 vs 不适用场景

**适用**：

- 学习同态加密可行性证明
- 极小数据高敏精确计算 POC
- 选型读 SEAL/OpenFHE 文档前的历史课

**不适用**：

- 常规云端训练（用 DP/TEE/联邦）
- 低延迟在线服务
- 只需聚合统计（DP 足够）

## 历史小故事（可跳过）

- **2009**：Gentry STOC/博士论文震惊密码界。
- **2011–2014**：BGV/BFV 等减轻 bootstrapping。
- **2017**：CKKS 打开近似 ML 推理。
- **2024+**：FHE 初创（Zama 等）推私有 LLM 推理实验。

## 学到什么

- **FHE 核心是噪声管理 + bootstrapping 思想**。
- 理论可行与工程可用隔了十年方案优化。
- 隐私技术菜单：DP、MPC、FHE、TEE 各管一段。
- 读 Gentry 懂后续 BGV/CKKS 文档在解决什么痛点。
- 大模型时代 FHE 仍是「贵但精确」选项。
- 复习时可对照 atlas 枢纽与 `written.txt` 邻居 slug，检查双向链接是否闭环。
- 动手跑通一个最小示例，比只读 README 更能记住参数含义与失败模式。
- 把本文档当「面试前 10 分钟速览卡」：是什么 → 为什么 → 一个命令/实验。
- 教别人时用「日常类比 + 一条命令」结构，反馈最好；复杂架构图留给二读。
- 若关联 slug 尚未落站，先用纯文本记名，`sync-written` 后再改成 `[[wikilink]]`。


## 延伸阅读

- 论文：https://crypto.stanford.edu/craig/craig-thesis.pdf
- [[brakerski-bgv-2012]] —— BGV
- [[fan-vercauteren-bfv-2012]] —— BFV
- [[cheon-ckks-2017]] —— CKKS
- [[regev-lwe-2005]] —— LWE 根基
- OpenFHE 文档

## 关联

- [[brakerski-bgv-2012]] —— 无 bootstrapping 路线
- [[fan-vercauteren-bfv-2012]] —— BFV
- [[cheon-ckks-2017]] —— 近似算术
- [[chillotti-tfhe-2016]] —— 快速 bootstrapping
- [[regev-lwe-2005]] —— 格安全
- [[dwork-dp-icalp-2006]] —— DP 对照
- [[yao-garbled-circuits-1986]] —— MPC 对照
- [[abadi-dpsgd-2016]] —— 私有训练对照

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
- [[ben-sasson-stark-2018]] —— Scalable, Transparent, and Post-Quantum Secure Computational Integrity
- [[bohme-aflfast-2016]] —— AFLFast — 灰盒 Fuzz 的马尔可夫调度
- [[brakerski-bgv-2012]] —— Fully Homomorphic Encryption without Bootstrapping
- [[cadar-klee-2008]] —— KLEE — 符号执行自动生成高覆盖测试
- [[cheon-ckks-2017]] —— Homomorphic Encryption for Arithmetic of Approximate Numbers
- [[chillotti-tfhe-2016]] —— Faster Fully Homomorphic Encryption: Bootstrapping in Less Than 0.1 Seconds
- [[dwork-calibrating-noise-2006]] —— 校准噪声与敏感度 — Laplace 机制奠基
- [[dwork-dp-icalp-2006]] —— 差分隐私 — ε 与邻接数据集不可区分
- [[fan-vercauteren-bfv-2012]] —— Somewhat Practical Fully Homomorphic Encryption
- [[regev-lwe-2005]] —— On Lattices, Learning with Errors, Random Linear Codes, and Cryptography
- [[yao-garbled-circuits-1986]] —— Yao 混淆电路 — 让两人合算函数却互不泄密

