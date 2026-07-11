---
title: FedAvg 2017 — 让手机本地训练模型再上传平均值
来源: 'McMahan et al., "Communication-Efficient Learning of Deep Networks from Decentralized Data", AISTATS 2017'
日期: 2026-06-24
分类: 安全与隐私
难度: 中级
---

## 是什么

FedAvg（Federated Averaging）是一种**让数据留在用户手机上、只把模型参数汇总到服务器**的分布式训练方法。日常类比：想象全国 1000 家火锅店各自改良锅底配方（本地训练），每周把各自的"配方改进笔记"寄给总部（上传模型更新），总部把所有改进取平均值，发回新的通用配方（全局模型）。原料（用户数据）从头到尾没离开店。

核心循环只有三步：

1. 服务器把当前全局模型广播给被选中的一批客户端
2. 每个客户端用自己的本地数据跑若干轮 SGD（不止一步）
3. 服务器收集各客户端更新后的模型参数，按数据量加权平均，得到新的全局模型

这篇 2017 AISTATS 论文首次把这个循环写成算法并大规模实验验证，成为联邦学习领域的奠基论文。

## 为什么重要

不理解 FedAvg，下面这些场景都没法解释：

- 为什么 Apple 的输入法预测、Google 的 Gboard 能持续变聪明，但苹果/谷歌声称"没看你打过什么字"
- 为什么医院之间想联合训练 AI 诊断模型，但各方数据又不能出院——联邦学习是合规的基础框架
- 为什么差分隐私（[[abadi-dpsgd-2016]]）和安全聚合经常跟联邦学习一起出现——FedAvg 定义了"只传梯度/参数"的通信模式，后续隐私技术在此基础上叠加
- 为什么分布式训练从"数据中心里几十台 GPU"扩展到了"几百万台手机"——FedAvg 解决了通信瓶颈

## 核心要点

FedAvg 的设计解决了三个矛盾：

**矛盾 1：隐私 vs 可用性**。传统做法是把数据集中到服务器再训练。FedAvg 证明：只要客户端本地多跑几步 SGD（而不是只算一步梯度就上传），训练质量可以接近集中式训练——数据不动，模型在动。

**矛盾 2：通信带宽 vs 收敛速度**。手机网络慢且贵。论文提出两个旋钮：增大本地 epoch 数 E（每轮多跑几遍本地数据）和增大本地 batch size B。实验表明 E=5、B=10 时通信轮数可比 FedSGD（E=1）减少 10-100 倍。

**矛盾 3：数据异构（Non-IID）vs 模型质量**。现实中每个人的打字习惯天差地别（统计上叫 non-IID）。论文实验发现即使在 non-IID 分布下，FedAvg 仍能收敛，虽然最终精度略低于 IID 场景。

## 算法伪代码

```python
# 服务器端
def fedavg_server(global_model, clients, rounds, C, E, B, lr):
    for t in range(rounds):
        # 每轮随机选 C 比例的客户端
        selected = random_sample(clients, fraction=C)
        local_models = []
        for client in selected:
            # 客户端本地训练
            updated = client.local_train(global_model, E, B, lr)
            local_models.append((client.data_size, updated))
        # 按数据量加权平均
        total = sum(n for n, _ in local_models)
        global_model = sum(n/total * w for n, w in local_models)
    return global_model

# 客户端
def local_train(global_model, E, B, lr):
    model = copy(global_model)
    for epoch in range(E):
        for batch in DataLoader(local_data, batch_size=B):
            model -= lr * gradient(loss(model, batch))
    return model.parameters()
```

关键变量：C（参与比例）、E（本地 epoch）、B（本地 batch size）、通信轮数 T。

## 实践案例

### 案例 1：Google Gboard 下一词预测

Gboard 用 FedAvg 训练下一词预测。夜间充电 + WiFi 时，一台手机会走完这四步：

1. **下载**：拿到当前全局语言模型参数（体积远小于你的打字日志）
2. **本地训**：用当天输入记录跑 E=1 轮 SGD，只在本机算梯度
3. **上传差值**：把"新参数 − 旧参数"加密后交给安全聚合，不传原文
4. **服务器平均**：几百万台手机的加权平均写出下一版全局模型

谷歌只见过平均值，没见过你打了什么字。

### 案例 2：医院联合训练影像诊断

三家医院各有 CT，但不能出院（HIPAA / 数据安全法）。联合训练按 FedAvg 拆开：

1. 中心服务器广播同一份初始诊断网络
2. 每家医院在内网用本地 CT 跑若干 epoch（可叠加 [[abadi-dpsgd-2016]] 噪声）
3. 只回传参数更新；中心按各院样本量加权平均
4. 重复多轮，直到验证集指标达标

中心始终看不到任何一张 CT，只看到参数平均值。

### 案例 3：用 [[pytorch]] 的 Flower 框架 5 分钟跑通

```python
# pip install flwr torch torchvision
import flwr as fl

class MnistClient(fl.client.NumPyClient):
    def fit(self, parameters, config):
        set_params(model, parameters)          # 写入服务器下发的权重
        train(model, trainloader, epochs=5)    # 本地 E=5，对应论文旋钮
        return get_params(model), len(trainloader.dataset), {}

fl.client.start_numpy_client(
    server_address="localhost:8080", client=MnistClient())
```

逐部分：`NumPyClient.fit` 就是 FedAvg 的客户端；返回值里的 `len(dataset)` 供服务器做加权；`set_params` / `get_params` 是把 list[np.ndarray] 写进 / 读出 `model.state_dict()` 的两行胶水。换模型只改 `train()`。

## 踩过的坑

1. **Non-IID 极端情况下不收敛**：如果每个客户端只有一个类别的数据（比如手机 A 只出现猫、手机 B 只出现狗），FedAvg 的平均操作会让模型在两个方向之间反复摇摆。后续工作 FedProx、SCAFFOLD 加了正则项来缓解。

2. **本地 epoch 太大反而有害**：E 增大减少通信，但每个客户端模型"跑偏"幅度也增大（client drift）。极端情况下各客户端收敛到各自的局部最优，平均值谁也不代表。经验做法：E=1~5 之间调。

3. **通信压缩不是免费的**：实际部署时会量化或稀疏化上传的参数（比如只传 top-1% 的梯度）。但压缩引入额外噪声，需要更多轮数补偿。论文本身没解决这个问题，后续 SignSGD、Sketched SGD 等工作接力。

4. **隐私保证需要额外机制**：FedAvg 本身不提供数学意义上的隐私保证。攻击者如果能观察到客户端上传的模型更新，理论上可以反推训练数据（梯度反演攻击）。必须叠加差分隐私（[[abadi-dpsgd-2016]]、[[mironov-renyi-dp-2017]]）或安全聚合才能真正保护隐私。

## 适用 vs 不适用场景

**适用**：

- 数据天然分散在终端设备（手机、IoT）且不能集中——隐私法规或用户体验要求
- 通信带宽远小于计算能力（手机 GPU 强但上传慢）
- 参与方数量大（万级以上设备）、每个设备数据量小
- 模型规模中等（论文验证到 CNN + LSTM，百万级参数）

**不适用**：

- 数据已经在同一数据中心——直接用 [[pytorch]] / [[tensorflow]] 分布式训练更快更简单
- 需要严格隐私保证但不想加额外机制——FedAvg 本身不防梯度反演
- 超大模型（LLM 级别，千亿参数）——上传/下载整个模型参数不现实，需要 LoRA 联邦化等变体
- 客户端数据分布极端 non-IID 且精度要求极高——需要 FedProx / SCAFFOLD / FedMA 等改进

## 历史小故事（可跳过）

- **2015 年**：Google 内部开始研究"不收集数据也能训练模型"，Brendan McMahan 团队提出 Federated Learning 概念
- **2016 年**：概念论文 arXiv 上线，首次定义"联邦学习"术语；同年 [[abadi-dpsgd-2016]] 给出差分隐私 SGD 的理论框架
- **2017 年 AISTATS**：本篇 FedAvg 论文正式发表，给出算法 + 大规模实验；被引超 20000 次
- **2019 年**：Google 在生产环境部署 FedAvg 训练 Gboard；Apple 跟进，用类似方法训练 Siri 和输入法
- **2020 年后**：联邦学习成为独立研究方向，FedAvg 是几乎所有后续工作的 baseline

## 与其他技术的关系

| 技术 | 关系 |
|------|------|
| [[abadi-dpsgd-2016]] | 在 FedAvg 客户端本地训练时加噪声，提供 (ε,δ)-DP 保证 |
| [[mironov-renyi-dp-2017]] | 更紧的隐私分析工具（Rényi DP），用于追踪多轮 FedAvg 的累计隐私损失 |
| [[duchi-local-dp-2013]] | Local DP 让每个客户端在上传前就加噪，比 central DP 更强但精度代价更大 |
| [[erlingsson-rappor-2014]] | Google RAPPOR 是 Local DP 的工程落地，FedAvg + RAPPOR 精神一致：数据不出设备 |
| [[pytorch]] / [[tensorflow]] | FedAvg 的客户端本地训练就是标准的 PyTorch/TF 训练循环 |
| 安全聚合 (SecAgg) | 密码学协议，让服务器只能看到聚合后的平均值，看不到单个客户端更新 |
| FedProx / SCAFFOLD | FedAvg 的改进算法，解决 non-IID 下的 client drift 问题 |

## 学到什么

1. **通信是分布式学习的第一瓶颈**——FedAvg 的核心洞见是"多做本地计算、少通信"，用 E 和 B 两个旋钮换取 10-100x 通信节省
2. **隐私不是免费的**——不传数据只传参数听起来安全，但梯度反演攻击表明"参数也能泄密"，必须叠加 DP 或安全聚合
3. **简单平均意外有效**——在各客户端模型偏移不大时，加权平均是一个出奇好用的聚合策略，这为后续更复杂的聚合方法提供了 baseline
4. **Non-IID 是联邦学习的核心难题**——现实世界的数据从来不是均匀分布的，FedAvg 能工作但不最优，整个子领域在为此奋斗

## 延伸阅读

- 论文原文：[McMahan et al. 2017 (arXiv)](https://arxiv.org/abs/1602.05629)
- Google AI Blog 科普：[Federated Learning: Collaborative ML without Centralized Training Data](https://ai.googleblog.com/2017/04/federated-learning-collaborative.html)
- Flower 框架教程：[flower.dev/docs](https://flower.dev/docs/)（5 分钟跑通 FedAvg）
- [[abadi-dpsgd-2016]] —— 差分隐私 SGD，FedAvg 的隐私增强搭档
- [[duchi-local-dp-2013]] —— 本地差分隐私的理论基础
- [[erlingsson-rappor-2014]] —— Google RAPPOR，Local DP 的工程实现

## 关联

- [[abadi-dpsgd-2016]] —— 给 FedAvg 的本地训练加噪声，从"不传数据"升级到数学可证的隐私保证
- [[duchi-local-dp-2013]] —— 定义了 Local DP 的信息论下界，是 FedAvg 隐私分析的理论参照
- [[erlingsson-rappor-2014]] —— Google 最早的 Local DP 工程落地，与 FedAvg 同属"数据不出设备"哲学
- [[mironov-renyi-dp-2017]] —— 提供 Rényi DP 组合定理，精确追踪 FedAvg 多轮迭代的总隐私开销
- [[pytorch]] —— FedAvg 客户端本地训练的标准实现框架
- [[tensorflow]] —— TensorFlow Federated (TFF) 是 Google 官方的联邦学习框架，直接实现 FedAvg

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[bonawitz-fl-system-2019]] —— Bonawitz 2019 — Google 联邦学习的工业级系统设计
- [[cheon-ckks-2017]] —— CKKS — 让加密数据也能做浮点运算
- [[gentry-fhe-2009]] —— Gentry 2009 — 第一个全同态加密方案
- [[kairouz-advances-fl-2019]] —— Kairouz 2019 — 联邦学习 58 个开放问题路线图
- [[shokri-mia-2017]] —— Shokri MIA 2017 — 判断一条数据是否被模型见过
