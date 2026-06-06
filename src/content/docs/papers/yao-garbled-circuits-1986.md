---
title: Yao 混淆电路 — 让两人合算函数却互不泄密
来源: 'Andrew C. Yao, "How to Generate and Exchange Secrets", FOCS 1986'
日期: 2026-06-06
分类: 安全与隐私
子分类: 安全与隐私
难度: 高级
---

## 是什么

Yao 混淆电路（Garbled Circuits）是一种让 **两个互不信任的人合作计算一个函数，却不泄露各自输入** 的协议。日常类比：两位商人想比谁的报价更低，但谁都不想先开口——混淆电路就是那个"让他们同时喊价但谁都只听到结果"的神奇信封。

核心想法：把函数编译成布尔电路，然后把每个逻辑门的真值表用加密"打乱"（garble）——只有拿到正确密钥的那一行才能解开，Evaluator 像盲人摸象，一步步解密，最终只看到答案，中间值全程不可见。

这个思想发表于 1982 年 FOCS（"Protocols for Secure Computations"）和 1986 年 FOCS（完整 garbled circuits 构造），今天被叫做"安全两方计算（2PC）"的奠基论文。Andrew Yao 因此在 2000 年获得图灵奖。

## 为什么重要

不理解混淆电路，下面这些事都没法解释：

- 为什么"隐私保护机器学习"（Secure Inference）能让你把模型和数据分别放在两台服务器，任何一方都无法单独读取另一方的秘密
- 为什么现代 MPC（多方安全计算）库（如 MP-SPDZ、MOTION）都把 garbled circuit 作为核心原语之一
- 为什么"百万富翁问题"——比较大小而不透露数字——到今天还是密码协议的教科书例子
- 为什么"去中心化联合学习"和"隐私竞价拍卖"能在不信任的节点间算出聚合值

## 核心要点

1. **混淆（Garbling）**：Alice（Garbler）把布尔电路的每个门替换为 4 行加密真值表——对每种输入组合，用对应的两把密钥双重加密输出密钥，生成的 4 行乱序打包。Bob（Evaluator）只能解开"当前输入对应的那一行"，看不到其他三行。类比：抽屉里有 4 个锁着的盒子，你只有一把钥匙，打开一个就拿到下一层的钥匙，永远不知道其他盒子里装什么。

2. **不经意传输（Oblivious Transfer，OT）**：Bob 的私有输入需要通过 OT 协议取到对应密钥——Alice 不知道 Bob 选择了哪条，Bob 只拿到自己选的那条。这是协议的关键"交叉点"：Garbler 知道所有密钥但不知道 Bob 的输入，Evaluator 知道自己的输入但不知道密钥和其他门的值。

3. **逐门求值（Evaluation）**：Bob 拿到 Alice 发来的混淆电路和自己的输入密钥，从输入层到输出层逐门"试解"——每次用两把密钥尝试解密 4 行，唯一能成功的行就是正确答案。整个过程只产生输出密钥，不产生中间明文。最后 Alice 告诉 Bob 哪个输出密钥对应 0/1。

## 实践案例

### 案例 1：隐私保护机器学习推理

> 以下为协议流程伪码，展示步骤顺序；真实实现可用 [EMP-toolkit](https://github.com/emp-toolkit/emp-ot)（C++）或 [CrypTen](https://github.com/facebookresearch/CrypTen)（Python）。

```python
# Alice 持有模型权重（不希望泄露给 Bob）
# Bob 持有输入样本（不希望泄露给 Alice）

# Step 1: Alice 把 ReLU 层（非线性，需要布尔电路）编译为门电路
circuit = compile_to_boolean_circuit(model.relu_layers)

# Step 2: Alice 混淆（garble）这个电路，得到加密真值表 + 标签集合
garbled_circuit, alice_labels = garble(circuit, alice_weights)

# Step 3: Bob 通过 OT 取到自己输入对应的标签（Alice 不知道 Bob 选了哪个）
bob_labels = oblivious_transfer(alice_pub_labels, bob_input)

# Step 4: Bob 用两组标签逐门解密，得到输出标签
output_label = evaluate(garbled_circuit, alice_labels, bob_labels)

# Step 5: Alice 公开"标签→0/1"的映射，Bob 解读最终结果
result = decode(output_label, alice_output_map)
```

这就是 CrypTen 等框架的核心：线性层用算术秘密共享（快），ReLU 等非线性层用混淆电路（精确但慢），混合搭配压成本。

### 案例 2：隐私竞价拍卖

```python
# 两家公司比报价，只公开谁更低，不透露具体数字
# 即 Yao 1982 的"百万富翁问题"

# 函数：f(alice_price, bob_price) = (alice_price < bob_price)
# Alice 报价 350, Bob 报价 420

# Alice garbles 比较电路（比较两个 32-bit 整数大小）
gc, a_labels = garble(comparison_circuit)

# Bob 通过 OT 取到 bob_price=420 对应的 input labels
b_labels = ot_receive(a_labels.bob_side, bob_price=420)

# Bob 求值，只得到 True/False
result = evaluate(gc, a_labels.alice_side(alice_price=350), b_labels)
# result = True （350 < 420）

# 双方都知道"Alice 报价更低"，但谁都不知道对方的具体数字
```

这个构造每次比较的通信量是 O(bit_length)，比朴素的"双盲第三方托管"高效得多。

### 案例 3：基因隐私匹配

场景：医院持有患者 SNP 数据，基因数据库持有风险位点索引，双方用 2PC 计算风险得分而不泄露任何原始数据。

```text
输入：
  Hospital: patient_snp = [0,1,1,0,1,...] (n bits)
  DB:       risk_loci   = [1,0,1,1,0,...] (n bits)

函数：
  f = popcount(patient_snp AND risk_loci)
  -- 计算有多少风险位点命中

协议执行：
1. DB garbles 一个 n-bit AND + popcount 电路
2. Hospital 通过 OT 取到自己 SNP 对应的标签
3. Hospital 本地求值，得到命中数（0~n 之间的整数）
4. 结果只有 Hospital 知道，DB 看不到患者数据
```

实际系统（如 GWAS 协作研究）已在此基础上部署，每轮计算仅需几秒钟。

## 踩过的坑

1. **半诚实 vs 恶意模型混淆**：密码协议里的"模型"是指我们对攻击者行为的假设方式。原始 garbled circuit 仅在"半诚实"模型下安全——也就是说，Alice 和 Bob 都按协议走，只是可能偷偷分析看到的数据。若 Alice 存心捣乱（恶意模型）、故意发一个乱编的电路，Bob 毫无察觉，会算出错误结果。恶意模型需要"cut-and-choose"（生成多个 GC，随机验证一半，剩下一半真正用）或结合零知识证明，通信量至少翻倍。

2. **电路规模爆炸**：把浮点运算或循环体展开为布尔电路，门数量极为惊人——一个 128-bit 乘法约 10,000 个 AND 门。实践中混合使用"算术秘密共享（加减乘高效）+ garbled circuit（比较 / 非线性函数）"，否则速度无法接受。

3. **OT 是瓶颈，必须扩展**：每个 Evaluator 输入比特都要一次 OT，朴素实现代价是公钥操作。实践中必须用"OT 扩展"（如 IKNP 协议）将成本摊薄：用少量基础 OT 生成大量"批量 OT"，每次 OT 仅剩下几十个字节的对称加密。

4. **Free XOR 和 Half-Gates 不能随意混搭**：Kolesnikov-Schneider 2008 提出"Free XOR"——XOR 门无需传输任何数据，零通信量；Zahur-Rosulek-Evans 2015 提出"Half Gates"——AND 门从 4 行压到 2 行。两种优化都要求密钥生成满足特定的代数结构，随意混搭会使安全性证明失效，工程实现时必须先读文档确认使用哪套方案。

## 适用 vs 不适用场景

**适用**：
- 双方持有私有输入，需要计算任意布尔函数，输出共享（Millionaires / 隐私拍卖）
- 联合查询：两个数据库做私有集合求交（Private Set Intersection）
- 安全外包计算：客户不信任服务器，要求计算结果正确且不泄露输入
- 与 MPC 框架混合使用：处理非线性层（ReLU、sigmoid 近似）

**不适用**：
- 超大函数（数百万 AND 门）且网络带宽有限——通信量正比于电路大小
- 三方或多方场景——原始 Yao 是两方协议，扩展到 MPC 需要 GMW 编译器
- 需要可验证输出（抗恶意攻击）而又无法承受 cut-and-choose 开销的场景
- 实时低延迟系统——即使有 OT 扩展和 Free XOR，一次握手仍需数十毫秒

## 历史小故事（可跳过）

- **1976 年**：Diffie 和 Hellman 发表"密码学新方向"，提出公钥加密概念，成为 Yao 协议的数学基础。
- **1982 年 FOCS**：Yao 发表扩展摘要"Protocols for Secure Computations"，正式提出"百万富翁问题"和三种解法，并证明任意函数在半诚实模型下可安全计算（多条核心定理）。
- **1986 年 FOCS**：Yao 发表完整论文"How to Generate and Exchange Secrets"，给出了基于布尔电路混淆的完整构造——也就是今天我们说的 garbled circuit，真正使协议变得可实现。
- **2000 年**：Yao 获图灵奖，是首位获此奖的中国大陆出生学者，表彰包括通信复杂度下界、电路复杂度和 2PC 在内的一系列奠基性贡献。
- **2008 年至今**：Free XOR（Kolesnikov-Schneider）、Half Gates（Zahur et al.）、OT Extension（IKNP）、以及 EMP-toolkit、MP-SPDZ 等工业级 MPC 框架，让 garbled circuit 从理论走向了秒级实用。

## 学到什么

1. **函数 = 电路 = 可安全计算**：任何可用布尔电路表达的计算都能安全执行，通信量正比于电路大小——这是一个惊人的普适性结论
2. **加密 + OT = 隐私的两条腿**：Garbled Circuit 解决"Garbler 的私密"，Oblivious Transfer 解决"Evaluator 的私密"，缺一不可
3. **半诚实 → 恶意的代价很大**：从假设"对手诚实执行协议"到"对手可能作弊"，通信量和计算量通常至少翻倍，工程上要仔细权衡威胁模型
4. **协议设计要指定计算模型**：garbled circuit 里的"安全"只在明确的形式化模型（模拟范式、理想/现实范式）下有意义，脱离模型谈"安全"没有意义

## 延伸阅读

- [Yao 1982 原文（OCR 版 PDF）](https://research.cs.wisc.edu/areas/sec/yao1982-ocr.pdf) — 6 页，密度极高，每个定理值得反复读
- [Mike Rosulek — The Joy of Cryptography（第 12 章 Garbled Circuits）](https://joyofcryptography.com/) — 最友好的现代教材，有伪代码和安全证明框架
- [EMP-toolkit](https://github.com/emp-toolkit/emp-ot) — 工业级 C++ OT + GC 实现，Half Gates + Free XOR 均已支持
- [[ot-1989]] — Oblivious Transfer 协议，Yao 混淆电路的关键子协议
- [[diffie-hellman-1976]] — 公钥密码学奠基，Yao 协议的数学地基
- [[ben-sasson-stark-2018]] — 零知识证明另一条路：不用交互，只要简洁证明

## 关联

- [[ot-1989]] —— Oblivious Transfer，混淆电路协议的必要子协议，解决 Evaluator 输入密钥获取问题
- [[diffie-hellman-1976]] —— 公钥密码学基础，Yao 协议的单向函数假设来源于此
- [[rsa]] —— RSA 单向函数，Yao 1982 第一种解法用到公钥置换族
- [[aes]] —— 对称加密原语，现代 garbled circuit 实现用 AES 做门加密（比公钥快 1000 倍）
- [[shannon-1948]] —— 信息论基础，密钥长度与加密安全性的底层数学
- [[ben-sasson-stark-2018]] —— STARK 零知识证明，与 garbled circuit 共享"证明计算正确性而不泄露输入"的目标
- [[bunz-bulletproofs-2018]] —— Bulletproofs，另一条隐私计算路线，适合区块链场景的范围证明

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
