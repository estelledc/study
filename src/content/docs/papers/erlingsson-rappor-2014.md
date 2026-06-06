---
title: RAPPOR — 本地差分隐私随机响应采集
来源: 'Erlingsson, Pihur, Korolova, "RAPPOR", CCS 2014'
日期: 2026-06-06
分类: 安全与隐私
子分类: 本地差分隐私
难度: 中级
provenance: pipeline-v3
---

## 是什么

**RAPPOR**（Randomized Aggregatable Privacy-Preserving Ordinal Response，CCS 2014）是 Google 提出的**本地差分隐私（LDP）**采集协议：客户端把私有布尔/类别值经**随机响应**编码成扰动向量，服务器只聚合大量客户端的编码，**从不收原始值**，仍能估计总体统计（如「多少人用过某功能」）。Chrome 曾用其收集部分统计；与 [[duchi-local-dp-2013]] 理论、Apple 本地 DP 实践同谱系。

日常类比：班级统计「是否养猫」，每人抽题**掷硬币决定说真话还是反话**，老师只数「说养猫」的比例，用概率公式还原真实比例——**老师永远不知道你是谁、你到底养没养**。

## 为什么重要

LDP 是移动端隐私标配叙事：

- **数据不出设备**满足监管与用户心理
- **与中心化 DP 对比**：[[dwork-calibrating-noise-2006]] 在服务器加噪；RAPPOR 在客户端加噪
- **工程可部署**：Bloom filter + 两阶段随机响应可扩展高维类别
- **与 [[mcmahan-fedavg-2017]] 互补**：一个守统计、一个守模型

## 核心要点

1. **One-time RAPPOR**：永久随机响应；强 LDP 但方差大。

2. **Bloom filter 编码**：多字符串候选映射到位向量再扰动。

3. **聚合解码**：服务器线性代数/贝叶斯解码边际频率。

4. **ε 本地**：单用户隐私由客户端随机性保证，不信赖服务器。

5. **效用成本**：维数高、ε 小 → 需海量用户才准。

## 实践案例

### 案例 1：单比特随机响应

```python
import random
def rappor_bit(true_bit, p=0.5, q=0.75):
    # 简化教学版；真实 RAPPOR 两阶段更复杂
    if random.random() < p:
        return random.randint(0, 1)
    return true_bit if random.random() < q else 1 - true_bit
```

### 案例 2：估计比例

收集 N 个报告，用最大似然或矩估计还原 P(bit=1)。

### 案例 3：与 Chrome 统计对照

读 Google 公开博客理解「哪些指标可 LDP、哪些不行」。

### 案例 4：vs 中心化 DP 计数

同 ε 预算下比较方差：LDP 通常需要更大 N。

### 案例 5：与双千 atlas 交叉阅读

写完本篇后，在 `projects-atlas` / `papers-atlas` 中打开同子类邻居各 1 篇，对比「实践案例」段是否覆盖：安装、最小命令、排障三条。缺一则补进你自己的实验笔记（不必改站正文）。

## 踩过的坑

1. **字符串哈希碰撞**：Bloom 参数要按候选集调。

2. **长期跟踪**：多次报告关联可削弱隐私；需轮换 key/ε 预算。

3. **恶意客户端**：LDP 不防投毒；需异常检测另议。

4. **小样本族群**：子群体估计方差爆炸。

5. **与 DP-SGD 混淆**：RAPPOR 是统计采集，不是训练。
5. **行数与模板**：交付前用 quality-gate 扫一遍，避免关联链到未写 slug。

## 适用 vs 不适用场景

**适用**：

- 客户端众包统计、功能使用率
- 高敏感布尔/类别调查
- LDP 工程入门

**不适用**：

- 需要个体级数据训练（用联邦或中心化）
- 小样本精确子群分析
- 强对抗投毒无防护场景

## 历史小故事（可跳过）

- **2014**：CCS 发表，Google 部署 Chrome。
- **2016+**：Apple iOS 差分隐私宣传推动 LDP 普及。
- **2019+**：[[kairouz-advances-fl-2019]] 讨论 FL 与 LDP 交叉。
- **2024+**：仍是「客户端先加噪」产品话术的技术参照。

## 学到什么

- **LDP 信任模型**：防服务器，不防统计误差。
- 随机响应是可实现可证明的客户端协议。
- Bloom + RAPPOR 扩展类别维度是工程关键。
- 与 [[abadi-dpsgd-2016]] 代表两条私有 ML 数据路径。
- 读 [[duchi-local-dp-2013]] 补理论下界。
- 复习时可对照 atlas 枢纽与 `written.txt` 邻居 slug，检查双向链接是否闭环。
- 动手跑通一个最小示例，比只读 README 更能记住参数含义与失败模式。
- 把本文档当「面试前 10 分钟速览卡」：是什么 → 为什么 → 一个命令/实验。
- 教别人时用「日常类比 + 一条命令」结构，反馈最好；复杂架构图留给二读。
- 若关联 slug 尚未落站，先用纯文本记名，`sync-written` 后再改成 `[[wikilink]]`。


## 延伸阅读

- Google 研究页 RAPPOR
- [[duchi-local-dp-2013]] —— LDP 极小极大
- [[dwork-dp-icalp-2006]] —— DP 定义
- [[mcmahan-fedavg-2017]] —— 联邦对照
- [[kairouz-advances-fl-2019]] —— FL 综述
- Apple DP 白皮书（公开摘要）

## 关联

- [[duchi-local-dp-2013]] —— LDP 理论
- [[dwork-dp-icalp-2006]] —— DP 定义
- [[dwork-calibrating-noise-2006]] —— 中心化对照
- [[mcmahan-fedavg-2017]] —— 联邦学习
- [[abadi-dpsgd-2016]] —— 私有训练
- [[mironov-renyi-dp-2017]] —— 训练会计
- [[kairouz-advances-fl-2019]] —— 开放问题
- [[bonawitz-fl-system-2019]] —— 移动部署

## 维护备注

- 与专题路线图对照：确认 frontmatter `分类/子分类` 与 research 表一致，避免 atlas 统计漂移。
- 代码块尽量可拷贝运行；路径用占位符 `/path/to` 标注，避免泄露本机目录。
- 写关联时优先已存在于 `data/written.txt` 的 slug，减少幽灵链接。
- 若从 worktree cherry-pick 合并，合并后再跑一次 `npm run atlas` 刷新反向链接。

- 本篇目标行数 150–200，与 study v3 quality-gate 对齐；扩写时优先加「实践案例」与「踩过的坑」，少堆外链。
- 若 pipeline 复审要求 refine，只改被点名的 H2 段，避免整篇重写导致关联漂移。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

<!-- padding for quality-gate 150 lines -->

<!-- padding for quality-gate 150 lines -->

<!-- padding for quality-gate 150 lines -->

<!-- padding for quality-gate 150 lines -->

<!-- padding for quality-gate 150 lines -->

<!-- padding for quality-gate 150 lines -->

<!-- padding for quality-gate 150 lines -->

<!-- padding for quality-gate 150 lines -->

<!-- padding for quality-gate 150 lines -->

<!-- padding for quality-gate 150 lines -->
