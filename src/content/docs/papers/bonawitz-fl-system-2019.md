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

### 案例 1：Gboard 下一词预测

```python
# 设备端（伪代码）：FL runtime 在手机空闲充电时被唤醒
def on_device_training(fl_plan, example_store):
    # fl_plan 是服务器下发的 TensorFlow 图 + 超参
    model = fl_plan.load_model()
    local_data = example_store.query(fl_plan.data_selector)

    # 本地训练多个 epoch（数据从不离开设备）
    for batch in local_data.batches(fl_plan.batch_size):
        model.train_step(batch)

    # 只上报权重增量（delta），不上报原始数据
    delta = model.weights - fl_plan.global_weights
    return delta  # 经 Secure Aggregation 加密后上传
```

**逐部分解释**：
- `example_store`：设备本地存储的用户输入历史（如打字记录），只供 FL runtime 访问
- `fl_plan`：由服务器编译生成的训练配置，包含 TensorFlow 计算图
- `delta`：梯度增量，而非原始数据；配合 Secure Aggregation 在聚合前无法被服务器单独读取

Gboard 用 FL 训练了一个含 140 万参数的 RNN 做次词预测，历经 3000 轮、1.5M 用户、5 天收敛，A/B 实验优于服务端训练的同款模型。

### 案例 2：Pace Steering 流控——避免"雷鸣羊群"

```
场景：全球 1000 万台设备，每天凌晨 2 点都空闲，全部同时发起 checkin

没有 Pace Steering → 服务器被 1000 万并发请求击垮
有 Pace Steering   → 服务器告诉设备"你在 2:00~2:07 之间随机重连"

算法（无状态，服务器不保存每台设备状态）：
  p = target_devices / total_eligible_devices
  device.next_checkin = now + random_delay(p)
```

**逐部分解释**：
- Pace Steering 让"雷鸣羊群"变成"均匀涓流"——服务器无需维护每台设备的状态
- 日常类比：演唱会散场不让所有人同时出门，而是按区域分批放行
- 兼顾时区日照周期：晚间设备可用率是白天的 4 倍，pace steering 动态调窗口

### 案例 3：版本化 FL Plan——应对 TensorFlow 算子碎片化

```
问题：设备 A 运行 TF 2.3，设备 B 运行 TF 2.6，模型引用了 TF 2.5 才有的算子

解法：
  fl_plan_v2.3 = graph_transform(fl_plan_default, target_version="2.3")
  fl_plan_v2.5 = fl_plan_default

部署检查（必须全过才能上线）：
  1. 代码已通过 peer review
  2. fl_plan 在模拟器上通过 unit test
  3. 资源消耗在安全范围内（RAM / CPU）
  4. 每个声明支持的 TF 版本都在 Android 模拟器上通过测试
```

**逐部分解释**：
- 约每 3 个月出现一次不兼容算子变更，系统通过图变换自动兜底
- 服务器根据设备上报的 TF 版本号下发对应版本化 plan
- 版本化 plan 与默认 plan 必须语义等价，通过同一套测试

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

- **2017 年**：McMahan 等人发表 FedAvg 算法，提出"设备本地跑多步 SGD、只上传模型增量"，首次让分布式训练在高延迟低带宽网络上可行。
- **2017 年**：Bonawitz 等人同年发表 Secure Aggregation 协议（CCS 2017），解决"服务器如何在看不到单台梯度的情况下聚合所有梯度"。
- **2019 年**：本文在 SysML（现 MLSys）发表，是前两篇论文的工程结合：将 FedAvg + Secure Aggregation 真正在 1000 万台 Android 设备上跑通。同年 Kairouz 等人发布长达 100 页的综述"Advances and Open Problems in FL"，与本文共同定义了 FL 领域。
- **2020 年后**：本文描述的"Federated Computation"愿景延伸为 Federated Analytics，允许在不上传原始日志的情况下统计设备端指标，Google 将其用于 Chrome 和 Android 的匿名遥测。

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

