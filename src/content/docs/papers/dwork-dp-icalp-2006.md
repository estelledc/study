---
title: 差分隐私 — ε 与邻接数据集不可区分
来源: 'Cynthia Dwork, "Differential Privacy", ICALP 2006'
日期: 2026-06-06
分类: 安全与隐私
子分类: 安全与隐私
难度: 中级
---

## 是什么

**差分隐私（Differential Privacy, DP）** 是 Cynthia Dwork 在 **ICALP 2006** 提出的隐私定义：发布统计结果时，**无论你的记录是否在数据库里，输出分布都几乎一样**——用参数 **ε（epsilon）** 量化「多暴露了多少风险」。它回应 1977 年 Dalenius「数据库不应泄露个人」的理想，并证明该理想在形式化语义安全意义下**不可能完美实现**，于是换用「**参与数据库带来的额外风险有上界**」这一可操作标准。

日常类比：医院公布「本地区流感比例」时，你不希望邻居能反推出「张三是否就诊」。DP 像给公布数字加**可控噪声**：有人参加统计和没人参加，外人看到的报告几乎分不出差别——ε 越小，噪声越大、隐私越强、精度越差。

本篇是后续 Laplace 机制、Gaussian 机制、DP-SGD、Apple/Google 本地 DP 的**概念入口**。

## 为什么重要

不理解 DP 定义，隐私工程容易空谈：

- **「匿名化」不等于安全**：去标识后仍可能被联动攻击，DP 给可证明边界
- **ε 是全行业通用旋钮**：普查、联邦学习、私有 ML 都谈 ε，含义必须统一
- **邻接（adjacent）数据集是核心**：通常指「相差一条个人记录」的两个库
- **后续整本隐私会计都站在这一定义上**：Rényi DP、Moments Accountant 都是 ε 的扩展会计

## 核心要点

1. **形式化直觉**：机制 \(\mathcal{M}\) 是 \((\varepsilon,\delta)\)-DP，若对任意邻接 \(D,D'\) 和任意输出集合 \(S\)，有 \(\Pr[\mathcal{M}(D)\in S] \le e^\varepsilon \Pr[\mathcal{M}(D')\in S] + \delta\)。类比：两个几乎相同的输入，输出概率比被 \(e^\varepsilon\) 限制。

2. **ε 的含义**：ε=0 理想相等（难实用）；ε 小（如 0.1–1）强隐私；ε 大隐私弱。是**对数级别的风险倍增上界**，不是「百分比泄露」。

3. **不可能性结果**：Dwork 证明 Dalenius 式「零知识」语义安全做不到；甚至**不在库中的人**也可能因背景知识受损——所以改用 DP 度量「参与」的边际风险。

4. **组合与后处理**：DP 机制输出后再做任意不窥视原数据的处理，隐私不恶化；多次查询 ε **累加**（需高级组合定理），部署要预算会计。

## 实践案例

### 案例 1：计数查询 + Laplace 噪声（概念）

```python
import random

def dp_count(true_count, sensitivity=1, epsilon=1.0):
    # 单次计数：改一条记录最多让计数变 1 → L1 敏感度 = 1
    scale = sensitivity / epsilon
    noise = random.laplace(0, scale)
    return round(true_count + noise)

# 发布 dp_count(42) 而非 42
# ε 越小 scale 越大 → 噪声越大
```

Laplace 机制细节见后继 `dwork-calibrating-noise-2006`（候选池）；本篇先掌握「敏感度 / ε → 噪声尺度」。

### 案例 2：邻接数据集举例

```text
D  = {Alice: 流感+, Bob: 流感-, Carol: 流感+}  → 阳性率 2/3
D' = {Alice: 流感+, Bob: 流感-}               → 去掉 Carol，阳性率 1/2

DP 要求：外人看到发布结果，猜 Carol 是否在库里的优势有限
若直接发布精确 2/3 vs 1/2，可能泄露 Carol 存在 → 需随机化输出
```

### 案例 3：ε 在产品中的读法

| 场景 | 典型 ε 量级 | 备注 |
|------|-------------|------|
| 学术机制设计 | 0.1–10 | 要报敏感度与组合次数 |
| 人口普查 | 小 ε + 大 δ 讨论 | 国家统计权衡精度 |
| 私有 ML (DP-SGD) | 按迭代会计 | 见 abadi-dpsgd-2016 候选 |

**永远不要**只报 ε 不报查询次数、敏感度、δ。

## 踩过的坑

1. **把 ε 当「泄露百分比」**：它是概率比上界，需结合邻接定义读。

2. **忽略 δ**：\((\varepsilon,\delta)\)-DP 允许极小失败概率，大 δ 可能毁保证。

3. **多次查询不会计**：每问一次 ε 消耗，总预算爆炸。

4. **以为匿名 ID 就够**：联动攻击与 DP 威胁模型不同，不能替代。

## 适用 vs 不适用场景

**适用**：
- 统计发布、数据售卖、联邦聚合需要**可证明隐私界**
- 设隐私预算、选型 Laplace/Gaussian 机制前的概念课
- 读 DP-SGD、RAPPOR、本地 DP 论文前的入口

**不适用**：
- 要求绝对零泄露的理想化场景（定义上已证明不可行）
- 不涉及个人数据的纯公开数据（DP 约束无意义）
- 只防黑客入侵、不防统计推断的传统网络安全（见 [[tor-2004]] 等）

## 历史小故事（可跳过）

- **1977**：Dalenius 提出统计数据库隐私理想。
- **2006**：Dwork ICALP 证明不可能性并提出差分隐私；同年还有校准噪声与分布式噪声论文（候选池三联）。
- **2016+**：DP-SGD 把 DP 带入深度学习训练；Apple/Google 本地 DP 大规模部署。

## 学到什么

- **隐私要用可证明定义**，不能用「感觉匿名」代替。
- **ε 是参与数据库的边际风险上界**，全领域通用语言。
- **邻接数据集 + 机制随机化**是 DP 的两根支柱。
- **后处理安全，组合要会计**——工程落地难点在预算管理。
- **本篇是概念入口**，机制细节与部署读后继 DP 候选链。
- **参与 vs 不参与的边际风险**比「绝对保密」更诚实，也更可工程化。

读 census / 医疗统计隐私白皮书时，见到 ε 请回到本篇邻接定义核对；不同论文邻接（加/删一条、换一条）假设不同，ε 不可横向比。

ICALP 2006 原文 Springer 收录；Microsoft Research 页面提供摘要与引用，适合作为课程第一周阅读。后续 TCC/Eurocrypt 2006 姊妹篇在同一候选池形成机制三连读。

## 延伸阅读

- 原文：[Microsoft Research 页面](https://www.microsoft.com/en-us/research/publication/differential-privacy/)
- 机制：候选 `dwork-calibrating-noise-2006`（Laplace）、`dwork-our-data-ourselves-2006`（Gaussian）
- 部署：候选 `abadi-dpsgd-2016`、`erlingsson-rappor-2014`
- 基础密码：[[diffie-hellman]]、[[rsa]]、[[aes]]
- 主题站：`research/papers-security-privacy.md`

## 关联

- [[diffie-hellman]] —— 现代密码学交换基础（不同威胁模型）
- [[rsa]] —— 公钥加密奠基
- [[aes]] —— 对称加密标准
- [[bitcoin]] —— 公开账本无 DP，隐私目标相反
- [[zk-snark]] —— 零知识证明另一条隐私路线
- [[tor-2004]] —— 匿名通信网络
- [[caesar-rexford-2005]] —— 网络策略与数据流（非 DP，但常同课）

> 维护提示：
> - 本篇是 DP **定义**入口；Laplace/Gaussian 机制见候选 `dwork-calibrating-noise-2006` 等。
> - 报 ε 必须同时报：邻接定义、查询次数、敏感度、δ（若用）。
> - 主题候选池 `research/papers-security-privacy.md`；与 [[zk-snark]] 零知识路线对照。
> - ε 不是泄露百分比；勿向非技术方简化成「1% 隐私」。
> - 多次查询要做隐私会计；组合定理误用是工程最常见事故。
> - DP 威胁模型是统计推断，不替代传输加密（[[tls]]）或访问控制。
> - 关联 `[[slug]]`；分类「安全与隐私」来自 taxonomy。
> - 读 DP-SGD 前先掌握本篇邻接数据集直觉。
> - Dalenius 不可能性说明「完美匿名」幻想需放弃。
> - 站内密码学奠基：[[diffie-hellman]]、[[rsa]]、[[aes]] 并行阅读。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[abadi-dpsgd-2016]] —— DP-SGD — 深度学习差分隐私训练
- [[bitcoin]] —— Bitcoin 白皮书
- [[bohme-aflfast-2016]] —— AFLFast — 灰盒 Fuzz 的马尔可夫调度
- [[cadar-klee-2008]] —— KLEE — 符号执行自动生成高覆盖测试
- [[caesar-rexford-2005]] —— Caesar-Rexford 2005 — 你的包为什么绕了大半个地球
- [[diffie-hellman]] —— Diffie-Hellman 密钥交换
- [[dwork-calibrating-noise-2006]] —— 校准噪声与敏感度 — Laplace 机制奠基
- [[dwork-differential-privacy-2006]] —— 校准噪声与敏感度 — 差分隐私的 Laplace 机制
- [[dwork-our-data-ourselves-2006]] —— 分布式噪声生成 — 去掉可信管理员也能保护隐私
- [[erlingsson-rappor-2014]] —— RAPPOR — 本地差分隐私随机响应采集
- [[gentry-fhe-2009]] —— Gentry FHE — 全同态加密开山
- [[lee-keystone-2020]] —— Keystone — 开源可定制 RISC-V TEE 框架
- [[machanavajjhala-l-diversity-2007]] —— l-多样性 — k-匿名之后的隐私保护
- [[madry-pgd-2017]] —— Madry PGD 2017 — 用最强对手训练最强防御
- [[mcmahan-fedavg-2017]] —— FedAvg — 联邦学习奠基算法
- [[mironov-renyi-dp-2017]] —— Rényi 差分隐私 — 隐私会计统一框架
- [[rsa]] —— RSA 公钥密码
- [[tor-2004]] —— Tor 洋葱路由 — 让你的网络请求穿上三层马甲
- [[zk-snark]] —— zk-SNARK 零知识证明

