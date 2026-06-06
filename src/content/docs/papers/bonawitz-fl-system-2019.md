---
title: Bonawitz FL System 2019 — Google 工业级联邦学习系统设计
来源: 'Bonawitz et al., "Towards Federated Learning at Scale: System Design", MLSys 2019'
日期: 2026-06-06
分类: 安全与隐私
子分类: 安全与隐私
难度: 中级
---

## 是什么

联邦学习（Federated Learning，FL）是一种**数据留在设备上、只传模型参数增量**的分布式机器学习方法。日常类比：像一场"闭卷考试"——每个学生在自己的草稿纸上做题，老师只收答卷（梯度更新），看不到草稿纸（原始数据）。

这篇论文描述的是 Google 在 Android 设备上落地这套系统的完整工程设计：从手机端如何感知"现在可以开始训练"，到服务器端如何协调数百万台设备同步一轮训练，再到怎么在服务器侧保证即使是聚合服务器也看不到某一台手机的具体梯度。

本文是工业界首个公开的大规模联邦学习生产系统描述，部署在 1000 万+ 日活 Android 设备上，支持 Gboard 键盘等真实应用。

## 为什么重要

不理解这篇论文，下面这些事都没法解释：

- 为什么 Gboard（Google 输入法）能在不上传你打字记录的情况下持续变得更准——FL 系统使数据从不离开手机
- 为什么"联邦学习"不只是算法问题，还是系统设计问题——掉线恢复、版本碎片、设备异质性全是工程挑战
- 为什么即使是服务器管理员也看不到单台设备的梯度——Secure Aggregation 用多方计算协议保证了这一点
- 为什么 FL 系统难以扩展：Secure Aggregation 的计算复杂度随参与人数二次增长，实践中限制单次聚合规模

## 核心要点

1. **三阶段轮次协议（Selection → Configuration → Reporting）**：每轮训练分三步——服务器从数万台联网设备里选几百台（Selection），下发 FL 计划和全局模型（Configuration），等设备上报梯度更新后聚合（Reporting）。类比快递站：大仓库不给所有用户发货，先筛"今天在家"的收货人，再统一配送。掉线的设备直接被忽略，不阻塞整轮。

2. **Actor 模型服务器架构（Coordinator → Selector → Aggregator）**：服务器用 Actor 模型横向扩展。Coordinator 管全局同步；Selector 分布在多个数据中心就近接受设备连接；Aggregator 做实际的梯度聚合。所有 Actor 状态在内存里，轮次结束即销毁——这避免了"梯度被持久化到磁盘被攻击者读走"的风险。

3. **Secure Aggregation（安全聚合）**：基于秘密共享的四轮 MPC 协议，让服务器只能看到所有设备梯度的**和**，看不到任何单台设备的梯度。类比：每人在信封里放一个数字，所有信封统一开拆才能知道总和，中途任何一人单独的数字对外不可见。实现代价是服务器计算复杂度随参与人数二次增长，系统把它分摊到多个 Aggregator actor 上。

## 实践案例

### 案例 1：Gboard 键盘下一词预测

Gboard 是 Google 的 Android 键盘。用户打字记录属于高度敏感的个人数据，绝不能上传到服务器。FL 的做法（以 PyTorch 风格写出最小可运行版本）：

```python
import copy, torch, torch.nn as nn

def fl_task(local_dataset, global_model: nn.Module, lr=0.01, steps=5):
    """
    local_dataset: 设备上的打字记录（torch.utils.data.Dataset）
    global_model:  服务器下发的全局模型权重
    返回: delta（本地更新量，只发这个，不发原始数据）
    """
    local_model = copy.deepcopy(global_model)        # 本地副本，不改原始全局模型
    optimizer = torch.optim.SGD(local_model.parameters(), lr=lr)
    criterion = nn.CrossEntropyLoss()
    loader = torch.utils.data.DataLoader(local_dataset, batch_size=32)

    for step, (inputs, labels) in enumerate(loader):
        if step >= steps:
            break
        optimizer.zero_grad()
        loss = criterion(local_model(inputs), labels)
        loss.backward()
        optimizer.step()

    # 返回"增量"= 更新后权重 - 原始权重，不返回任何输入数据
    delta = {k: local_model.state_dict()[k] - global_model.state_dict()[k]
             for k in global_model.state_dict()}
    return delta
```

**逐部分解释**：
- `copy.deepcopy`：在本地克隆一份全局模型，设备训练不影响服务器原始权重
- `steps=5`：对应 FedAvg 里的本地 epoch 数（E），控制"每轮在设备上跑多少步"
- `delta`：发回的是权重变化量（梯度的积分），不包含任何 `local_dataset` 中的原始打字内容
- 服务器用 FedAvg 把数百台手机的 delta 加权平均，更新全局模型

Gboard 用 FL 训练了一个含 140 万参数的 RNN 做次词预测，历经 3000 轮、1.5M 用户、5 天收敛，A/B 实验优于服务端训练的同款模型。

### 案例 2：Pace Steering 流控——避免"雷鸣羊群"

```
场景：全球 1000 万台设备，每天凌晨 2 点都空闲，全部同时发起 checkin

没有 Pace Steering → 服务器被 1000 万并发请求击垮
有 Pace Steering   → 服务器告诉设备"你在 2:00~2:07 之间随机重连"

### 案例 3：Secure Aggregation 下的设备失联恢复

Secure Aggregation（SecAgg）解决的问题：服务器技术上能看到每台设备的梯度更新，这是隐私漏洞。SecAgg 用**遮蔽密钥（masking key）**技术来挡住这个漏洞——类比是"每个设备在自己的答案上加一层只有自己知道的随机扰动（mask），而这些扰动在相加时神奇地互相抵消，服务器只看到原始答案的总和，看不到任何单人的答案"。

```
Round 流程（含 SecAgg，以下为简化描述）：
  Phase 1 - 交换公钥:   每台设备生成 Diffie-Hellman 密钥对，互相分享公钥，
                        借此与每一对设备协商出一个共享随机种子（即"mask 来源"）
  Phase 2 - 分发碎片:   把自己的私钥碎片（Shamir 秘密分享）发给"备份设备"，
                        即使自己掉线，别人也能帮服务器还原自己的 mask
  Phase 3 - 提交带噪梯度: 提交 gradient + sum(所有与自己相关的 mask)
                        （所有设备的 mask 两两对消，只剩纯净的梯度总和）
  Phase 4 - 去遮蔽:    服务器用掉线设备的碎片还原其 mask，从聚合值里扣除
  → 服务器最终只得到 sum(updates)，无法推断任何单设备的 update
```

**逐部分解释**：
- Phase 2 里的"碎片"来自 Shamir 秘密分享：把密钥切成 n 份，任意 k 份可还原，少于 k 份则无法还原——这样设计保证了抗掉线
- 若掉线设备数 > 阈值（可配置的 `min_fraction`），无法收集足够碎片，本轮失败，Coordinator 重启
- 这就是为什么 Secure Aggregation **必须同步**：异步模式下无法维持两两 mask 对消的数学关系

## 踩过的坑

1. **Secure Aggregation 二次复杂度限制规模**：MPC 协议的服务端计算量随参与人数 O(n²) 增长，实践中单次聚合被限制在数百设备；系统须在每个 Aggregator actor 内独立跑一个 Secure Aggregation 实例来横向扩展。

2. **Commit 阶段掉线导致整轮失败**：Secure Aggregation 分四轮，第三轮（Commit）后如有设备掉线但未完成第四轮（Finalization），整个聚合可能崩溃；系统通过选取 130% 目标数量设备来对冲，但参数需针对每个 FL population 手动调优。

3. **选择偏差与代表性问题**：只有"充电中+WiFi+闲置"的设备才参与训练，导致部分地区（无 WiFi 普及率）的用户几乎从不参与；所训模型可能对这些人群效果更差，需在 A/B 实验阶段特别监控。

4. **设备版本碎片化**：生产机队运行从几个月前到最新的各种 TF 版本，图变换兼容方案约每季度失效一次（出现无法用变换修复的算子不兼容），此时须绕过或等待设备 OTA 升级。

## 适用 vs 不适用场景

**适用**：
- 数据高度敏感且不能离开用户设备（键盘输入、健康记录、相册）
- 需要在数百万~数十亿异质设备上做分布式训练
- 已有完善的 Android/iOS 设备管理和 JobScheduler 机制
- 能容忍"训练速度比数据中心慢 7 倍"，以换取隐私保护

**不适用**：
- 数据量极小或模型极简单——中心化训练更快且无需工程投入
- 设备网络不稳定到轮次完成率极低（如物联网传感器）——轮次失败率过高
- 需要精细 debug 单条训练样本——FL 系统中个体数据对服务器不可见，难以排查单样本问题
- 对收敛速度要求极高的研究场景——FL 轮次慢，难以快速迭代

## 历史小故事（可跳过）

- **2017 年**：McMahan 等人在 Google 发表 FedAvg（[[mcmahan-fedavg-2017]]），提出"在设备上跑多步 SGD 再聚合"的算法框架，但没有系统层实现细节。
- **2017 年（同年）**：Bonawitz 等人发表 Secure Aggregation 协议，解决了"服务器如何在不看单设备更新的情况下聚合所有设备"的密码学问题——这是本文系统集成的核心安全原语。
- **2018 年**：Google 把 DP-SGD（[[abadi-dpsgd-2016]]）集成进 FL pipeline，形成"SecAgg + DP"双层保护架构，此后逐步在 Gboard 等产品上线（确切时间线未在论文中公开）。
- **2019 年**：本文在 MLSys 2019 发表，首次公开 Google 生产级 FL 系统的完整架构——包括 Coordinator/Selector/MasterAggregator 的分层设计、Pace Steering 流控、多租户支持，以及开放问题（选择偏差、数据投毒、通信压缩）。
- **2019 年（同年）**：[[kairouz-advances-fl-2019]] 发布，梳理联邦学习全领域开放问题，被视为 FL 学术方向的路线图，大量引用本文的工程实践。

## 学到什么

1. **隐私保护 = 系统设计约束**：Secure Aggregation 不是可选的加分项，而是决定了整套架构（同步轮次、Actor 内存聚合、禁止持久化梯度）的核心约束
2. **弹性 > 可靠性**：在 10M 设备上根本无法保证每台可靠，系统设计的核心是"容忍掉线、继续推进"而非"等所有人到齐"——130% 超选、丢弃 straggler、失败轮次重试
3. **领域专用框架胜过通用框架**：FL 设备是自主 Actor，与 MapReduce 的 Mapper 本质不同——数据由设备"拥有"，Server 是"邀请者"，这个语义差异驱动了全新的架构
4. **监控即安全底线**：设备不可控、数据不可见，唯一感知系统健康的途径是精细的匿名聚合日志和 ASCII 状态序列可视化

## 延伸阅读

- 论文 PDF：[Bonawitz et al. 2019 — MLSys](https://arxiv.org/pdf/1902.01046.pdf)（建议配合 Section 6 Secure Aggregation 和 Appendix A 操作数据一起看）
- Secure Aggregation 协议原文：[Bonawitz et al. CCS 2017](https://research.google/pubs/practical-secure-aggregation-for-privacy-preserving-machine-learning/)
- [[mcmahan-fedavg-2017]] —— FedAvg 算法原文，理解 FL 训练过程的数学基础
- [[kairouz-advances-fl-2019]] —— FL 开放问题综述，100 页覆盖本文所有未解问题
- [[abadi-dpsgd-2016]] —— DP-SGD，与本文 Secure Aggregation 互补的差分隐私方案

## 关联

- [[mcmahan-fedavg-2017]] —— 本文系统落地的算法基础，FedAvg 是系统跑的主要训练协议
- [[abadi-dpsgd-2016]] —— DP-SGD 与 Secure Aggregation 互补：前者在梯度上加噪、后者加密聚合
- [[kairouz-advances-fl-2019]] —— 同年发布的 FL 综述，系统性梳理本文工程设计留下的开放问题
- [[dwork-calibrating-noise-2006]] —— 差分隐私的数学基础，本系统可选启用 DP 作为额外隐私层
- [[diffie-hellman-1976]] —— Secure Aggregation 的密钥协商基于 DH 协议族
- [[borg]] —— Google 的集群调度系统，FL 服务器的 Actor actor 运行于其上
- [[bigtable-2006]] —— FL 服务器的持久化存储基础设施参考，Actor 内存聚合刻意避开了它

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[abadi-dpsgd-2016]] —— DP-SGD — 深度学习差分隐私训练
- [[erlingsson-rappor-2014]] —— RAPPOR — 本地差分隐私随机响应采集
- [[mcmahan-fedavg-2017]] —— FedAvg — 联邦学习奠基算法
- [[mironov-renyi-dp-2017]] —— Rényi 差分隐私 — 隐私会计统一框架

