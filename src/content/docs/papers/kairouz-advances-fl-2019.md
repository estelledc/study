---
title: 联邦学习综述 — 60+ 作者合写的联邦学习百科与 58 道开放题
来源: 'Kairouz et al., "Advances and Open Problems in Federated Learning", Foundations and Trends in Machine Learning 2021'
日期: 2026-06-06
分类: 安全与隐私
子分类: 安全与隐私
难度: 中级
---

## 是什么

**联邦学习（Federated Learning，FL）**是一种让许多客户端（手机、医院、银行）在**数据不出本地**的前提下协同训练机器学习模型的框架。日常类比：想象一个班级要评出"全班最好的作文思路"——每位同学只把"修改意见"发给老师，原稿留在自己手里，老师汇总所有人的意见后更新统一标准，再发回去。

本文是 60+ 名研究者在 2019 年 Google 研讨会后联合写成的全景综述，发表于 *Foundations and Trends in Machine Learning* 2021 年卷（224 页）。它并非教学入门文章，而是一张**路线图**：现在能做什么、哪 58 个问题还没解决。它首次系统区分了两类场景：

- **Cross-device**：客户端是亿级手机，数据极度分散，每台设备可能只参与训练一次
- **Cross-silo**：客户端是数十家机构（医院、银行），数量少但每家数据量大、可信度高

## 为什么重要

不理解联邦学习，下面这些事都没法解释：

- 为什么手机输入法（Gboard）能"越用越懂你"，却又说绝对不上传你的输入记录——FL 的产品化就是答案
- 为什么多家医院可以"共建一个癌症筛查模型"却不共享患者病历——cross-silo FL 的典型场景
- 为什么"不共享数据"并不等于"保护隐私"——梯度更新本身就可能泄露训练样本（梯度反演攻击）
- 为什么联邦场景比普通分布式训练难得多——Non-IID 数据 + 通信瓶颈 + 拜占庭攻击三座大山同时存在

## 核心要点

1. **Non-IID 数据是万恶之源**：普通分布式训练假设各节点数据同分布（IID），联邦场景恰恰相反。你的手机聊天记录和我的完全不同；某家医院只有罕见病患者。这导致 FedAvg 在各客户端本地多步更新后，局部模型会"漂移"到完全不同的方向，平均后的全局模型对所有人来说都不是最优。类比：让 10 个人各自独立优化一道菜的配方，最后把所有配方取平均，结果可能谁都不爱吃。

2. **隐私保护需要双重防线**：光靠"不发原始数据"远不够。论文系统化了两条路线：
   - **差分隐私（DP）**：在梯度上加校准噪声，使攻击者无法推断某条训练样本是否存在（参见 [[abadi-dpsgd-2016]]）
   - **安全聚合（Secure Aggregation）**：用密码学协议让服务器只能看到所有人梯度之和，看不到个体梯度

   两者都有代价：DP 降低模型精度，SecAgg 增加通信和计算开销。如何在隐私-效用之间找平衡是核心开放题。

3. **系统异构性远超想象**：Cross-device 场景的 "设备" 包括低端 Android 手机（1 GB RAM）到高端 iPhone（8 GB RAM），网络从 2G 弱连接到 Wi-Fi，设备随时离线或被杀进程。这意味着：传统优化算法假设的"同步等待所有节点"在这里根本走不通——必须容忍掉队者（stragglers）、设计**异步聚合**和**通信压缩**（梯度量化/稀疏化）。

## 实践案例

### 案例 1：Gboard——手机上的 Cross-Device FL

Google 键盘（Gboard）使用 FL 在不上传用户输入的条件下改善下一词预测。训练流程：

```
服务器广播全局模型
       ↓
设备在充电 + Wi-Fi 时下载模型
       ↓
在本地用用户打字历史训练几步（本地 SGD）
       ↓
只上传 梯度差值（Δ = 本地模型 - 全局模型）
       ↓
服务器用 FedAvg 聚合所有梯度差，更新全局模型
       ↓
循环（每轮只用一小批设备，每台设备训练一次就不再参与本轮）
```

关键工程细节：每轮只选 ~100 台设备（从亿级里随机抽），原始数据永不离开手机，梯度在传输前用 Secure Aggregation 混合。

### 案例 2：医院联邦建模——Cross-Silo FL

假设 10 家医院联合训练糖尿病早期筛查模型，每家数据分布差异大（不同地区人群）。以下为伪代码，真实实现可参考 [Flower（flwr）](https://flower.dev/) 或 TensorFlow Federated 库：

```python
# 伪代码（参考 Flower 框架结构）：cross-silo 一轮训练
for round_num in range(num_rounds):
    global_weights = server.get_global_model()   # 服务器下发当前全局模型

    local_updates = []
    for hospital in hospitals:  # 每家机构都参与（不随机抽样，cross-silo 特性）
        local_model = hospital.train(
            init_weights=global_weights,
            local_data=hospital.private_dataset,
            local_epochs=5,
            dp_noise_multiplier=1.1  # 差分隐私噪声强度（见案例 3 说明）
        )
        local_updates.append(local_model - global_weights)  # 只发梯度差

    # FedAvg：按各家数据量加权平均，数据多的医院权重大
    global_weights += weighted_average(local_updates, weights=[h.data_size for h in hospitals])
```

与 cross-device 的区别：每家医院都是受信任机构，可以参与更多轮次；引入激励机制（谁贡献更多数据，谁获得更高质量模型使用权）是这个场景的重要开放问题。

### 案例 3：差分隐私 + 安全聚合组合使用

以下展示隐私保护的两层逻辑（使用 NumPy 可直接运行）：

```python
import numpy as np

# 层 1：差分隐私（客户端本地执行）
def dp_clip_and_noise(gradient, clip_norm=1.0, noise_multiplier=1.0):
    """
    裁剪梯度范数后加高斯噪声。
    noise_multiplier 越大 → 隐私越强 → 模型精度越低。
    工程常用值：noise_multiplier=0.5~1.5，对应 ε ≈ 3~10（一般业务场景）。
    高隐私要求（如医疗）通常取 ε < 1，需要 noise_multiplier > 2。
    """
    grad_norm = np.linalg.norm(gradient)
    clipped = gradient / max(1.0, grad_norm / clip_norm)          # 梯度裁剪
    noise = np.random.normal(0, noise_multiplier * clip_norm, size=clipped.shape)
    return clipped + noise

# 层 2：安全聚合（服务器端，密码学保证）
# 服务器看到的是：SUM(client_1_gradient + mask_1, client_2_gradient + mask_2, ...)
# 其中各客户端的 mask 两两抵消，服务器只能得到梯度之和，看不到个体梯度
```

**关键权衡**：ε（epsilon）是差分隐私的"隐私预算"，ε 越小代表保护越强——攻击者越难推断某条训练样本是否存在。噪声越大 ε 越小，但模型精度损失越大。本文指出如何在隐私预算与模型效用间找平衡是目前尚无完美解的开放问题。

## 踩过的坑

1. **把"不共享数据"等同于"安全"**：梯度反演攻击（gradient inversion）可以从梯度中几乎完美重建原始图片，仅不发原始数据根本不够——必须配合 DP 或 SecAgg。

2. **用普通 FedAvg 处理 Non-IID 数据**：如果各客户端数据分布差异大（例如手写数字识别：某客户端只有"1"和"2"，另一个只有"8"和"9"），标准 FedAvg 收敛极慢甚至发散，需要 FedProx / SCAFFOLD 等改进算法。

3. **忽略拜占庭攻击**：一小撮恶意客户端可以发送精心构造的毒化梯度，让全局模型在特定触发词上输出错误结果（后门攻击）。普通 FedAvg 对此毫无防御——需要鲁棒聚合算法（Krum、Trimmed Mean、Bulyan）。

4. **通信瓶颈被低估**：在 Cross-device 场景，上行带宽（客户端→服务器）往往只有几 MB/s，而 BERT/GPT 级别模型的梯度是 GB 级别的，不压缩根本无法落地。必须引入梯度量化（int8/float16）或稀疏化（只传 top-k 梯度）。

## 适用 vs 不适用场景

**适用**：
- 数据因法规/竞争原因无法集中（医疗、金融、政府数据）
- 推理/预测需要在端侧完成（手机、边缘设备）的场景
- 多机构间有合作意愿但没有数据共享信任基础的 cross-silo 建模
- 希望在训练阶段保护用户隐私的消费类产品

**不适用**：
- 模型精度要求极高且容不下任何隐私噪声的场景（DP 代价太大）
- 数据量极小的客户端（本地训练几步效果甚至不如什么都不做）
- 客户端网络极差且模型极大（通信开销无法接受）
- 需要频繁访问全局数据分布做复杂分析的任务（联邦版本难以支持）

## 历史小故事（可跳过）

- **2016 年（arXiv）/ 2017 年（AISTATS 正式发表）**：Google 的 McMahan 等人发表 FedAvg，首次提出"联邦学习"这一术语，用于 Gboard 的下一词预测——这是 FL 的奠基论文（参见 [[mcmahan-fedavg-2017]]）。
- **2019 年 6 月**：在 Google 西雅图举办的"联邦学习与分析研讨会"上，来自 Google、CMU、Stanford、INRIA 等机构的 60+ 名研究者聚在一起，发现这个领域缺少一份系统综述，于是决定合作写一篇。
- **2019 年 12 月**：arXiv 第一版发布（428 KB），迅速引爆学界，成为 FL 领域最重要的参考文献。
- **2021 年**：修订版（909 KB，翻倍）正式发表于 *Foundations and Trends in Machine Learning* Vol.14，成为 224 页的鸿篇巨制，引用量超过 1000+。
- **意义**：本文中首次系统化的 cross-device/cross-silo 分类、58 个开放问题、以及隐私-效用权衡框架，至今仍是 FL 研究者的必读文献和引用起点。

## 学到什么

1. **隐私不是免费的**——差分隐私保护越强，模型精度损失越大；安全聚合越严，通信开销越高。工程上永远是权衡，没有完美方案。
2. **Non-IID 才是联邦学习的本质难点**——不是分布式训练加了个隐私就叫联邦学习；数据异构性带来的算法、优化、公平性问题才是真正的挑战。
3. **系统设计优先于算法创新**——再好的优化算法，如果在 2G 网络的亿级手机上跑不起来，也没有实用价值；通信效率和系统异构性是落地的第一道门。
4. **58 个开放问题 = 一张研究地图**——本文最大的贡献不是解决了什么，而是把"还有哪些没解决"写清楚了，是进入 FL 研究领域的最佳导引。

## 延伸阅读

- 视频讲解：[Federated Learning: Challenges, Methods, and Future Directions (CMU 2021)](https://www.youtube.com/watch?v=oxchqsfuKWE)——系统介绍 FL 算法和挑战
- TensorFlow Federated：[TFF 官方文档](https://www.tensorflow.org/federated)——Google 开源的 FL 框架，可以本地模拟 cross-device 训练
- PySyft / Flower：FL 实验常用框架，Flower 支持 cross-silo 场景
- 论文 PDF：[arXiv 1912.04977](https://arxiv.org/abs/1912.04977)——原版 224 页，Section 4（隐私）和 Section 3（优化）是阅读重点
- [[abadi-dpsgd-2016]] —— 差分隐私 + SGD 的结合，FL 隐私保护的算法基石
- [[mcmahan-fedavg-2017]] —— FedAvg 原论文，本文所有优化讨论的起点

## 关联

- [[mcmahan-fedavg-2017]] —— FedAvg 是 FL 的核心算法，本综述所有效率/优化讨论都以它为基准
- [[abadi-dpsgd-2016]] —— DP-SGD 给联邦学习提供了差分隐私的理论工具，本文 Section 4 大量引用
- [[byzantine-generals-1982]] —— 拜占庭容错问题的起源，FL 中的恶意客户端攻击是它在 ML 场景的现代演化

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[abadi-dpsgd-2016]] —— DP-SGD — 深度学习差分隐私训练
- [[byzantine-generals-1982]] —— 拜占庭将军问题 — 节点能撒谎时怎么达成一致
- [[dwork-calibrating-noise-2006]] —— 校准噪声与敏感度 — Laplace 机制奠基
- [[erlingsson-rappor-2014]] —— RAPPOR — 本地差分隐私随机响应采集
- [[mcmahan-fedavg-2017]] —— FedAvg — 联邦学习奠基算法
- [[mironov-renyi-dp-2017]] —— Rényi 差分隐私 — 隐私会计统一框架

