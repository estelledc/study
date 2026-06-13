---
title: Pinocchio 2013 — 首个「近乎实用」的可验证计算与 zk-SNARK 工程系统
来源: https://eprint.iacr.org/2013/279
日期: 2026-06-13
分类: 安全与隐私
子分类: 安全与隐私
难度: 中级
provenance: pipeline-v3
---

## 零基础先读这一段

你不需要会椭圆曲线或配对密码学，也能先抓住 Pinocchio 在干什么：

**问题**：你把一道计算交给云服务器（Worker），它回你一个答案。你怎么知道它没偷懒、没算错、甚至没瞎编？

**朴素办法**：自己再算一遍 —— 等于白外包。

**Pinocchio 的办法**：事先为这道「题的类型」办一次登记（Setup），之后每次 Worker 交卷时附上一张**固定 288 字节**的防伪贴纸（证明）。任何人用公开的验贴纸规则（Verification Key），大约 **10 毫秒**就能确认「答案确实来自登记过的那道题、且算对了」——**不必重算，也不必看到 Worker 的中间步骤**。

若你还要求**零知识**（zk）：贴纸还能证明「我知道某个秘密输入」，却不泄露秘密 —— 像证明「我确实满 18 岁」而不出示身份证全文。

论文全名 **Pinocchio: Nearly Practical Verifiable Computation**（Parno, Howell, Gentry, Raykova，IEEE S&P 2013，[eprint 2013/279](https://eprint.iacr.org/2013/279)）。标题里的 *Nearly*（近乎）很诚实：生成证明仍然慢、Setup 仍要可信仪式，但**验证侧第一次做到比本地 C 执行还快**（对部分应用），这才让 zk-SNARK 从论文走进工业。

## 日常类比：外包学霸与防伪证书

> 期末有一道超难的综合题，你把它交给**外包学霸**去算，自己只想核对最终答案。
>
> - **传统验算**：你自己再算一遍 —— 时间没省。
> - **Pinocchio**：学期初你把「题型结构」登记在公证处（Setup，每个程序一次）。学霸交卷时除了答案，还附一张**288 字节的防伪证书**（证明 π）。你（或任何人）用公开的验证书模板（VK）扫一眼，0.01 秒就能确信：「他确实按登记过的规则，在这个公开输入上算出了这个输出。」
> - **零知识版**：证书还能证明「我持有秘密参数 w，且 w 与公开输入 x 一起使等式成立」，但**不透露 w 是什么** —— 像验明「我知道密码」而不把密码写在纸上。

这篇论文的特殊之处不在于又证明了一个定理，而在于**造出一套能跑的系统**：C 子集 → 算术电路 → QAP → 288 字节证明 → 毫秒级验证。libsnark、Zcash 原型、后来的 Groth16，都站在这条线的延伸上。

## 为什么重要

不理解 Pinocchio，下面这条技术线会断档：

| 脉络 | Pinocchio 的位置 |
|------|------------------|
| **zk-SNARK 工程史** | 2013 前多是 decades 理论；Pinocchio 后才有可 `git clone` 的 artifact |
| **QAP / R1CS 范式** | 今天 circom、snarkjs、Groth16 仍把「程序 → 多项式约束」当标准 IR（见 [[zk-snark]]） |
| **可验证外包** | 云算力、链上轻验证、zkRollup 的「Prover 受累、Verifier 享福」不对称，源头在这里 |
| **Trusted setup 争议** | Pinocchio 的 evaluation key 含 toxic waste；Plonk / Halo / STARK 都在回应这一代痛点（对比 [[ben-sasson-stark-2018]]） |

一句话：**Groth16 把证明压得更小，但 Pinocchio 是第一个证明「这事在真实硬件上能跑」的系统**（S&P 2013 Best Paper）。

## 论文要解决什么问题

**可验证计算（Verifiable Computation, VC）** 的形式化目标：

- 客户端定义函数 \(f\)，给出**公开输入** \(x\)
- 不可信 Worker 返回输出 \(y\)，并声称 \(y = f(x)\)（\(f\) 内部可能还依赖**秘密 witness** \(w\)）
- Verifier 应以**远小于重算 \(f(x)\)** 的开销接受或拒绝

Pinocchio 在 2013 年给出的典型数字：

| 指标 | 典型值 | 含义 |
|------|--------|------|
| 证明大小 | **288 字节** | 与 IO 规模、电路深度无关（succinct） |
| 验证时间 | **~10 ms** | 比此前 VC 快 **5–7 个数量级**；部分应用快于原生 x86 |
| Prover 加速 | 比先前 VC **19×–60×** | 仍慢，但首次「勉强能忍」 |
| 零知识 | 额外开销 **< 0.1%** | 同一套协议几乎免费升级 zk |

## 核心概念（由浅入深）

### 1. 算术电路：把程序变成「加法和乘法」

Pinocchio 不直接证明 C 程序的语义，而是证明**算术电路**在有限域 \(\mathbb{F}_p\) 上的求值正确。电路由：

- **加法门**：\(c = a + b\)（约束成本低，常「免费」处理）
- **乘法门**：\(c = a \times b\)（每条乘法产生一条核心约束）

论文 toolchain 把 **C 子集** lowering 到这种电路 —— 无动态内存、循环需展开、指针受限。这和今天 zk 编译器面临的限制同源。

### 2. R1CS：每条乘法写成 \((A \cdot w) \circ (B \cdot w) = (C \cdot w)\)

**Rank-1 Constraint System** 是工程师最顺手的中间表示。 witness 向量 \(\mathbf{w}\) 存所有「线上的值」（公开输入、秘密输入、中间变量、输出）。每条约束对应电路里一个乘法门：

\[
(\mathbf{A}_i \cdot \mathbf{w}) \times (\mathbf{B}_i \cdot \mathbf{w}) = \mathbf{C}_i \cdot \mathbf{w}
\]

加法不单独占约束 —— 通过 witness 布局吸收进线性组合。

### 3. QAP：把指数级约束压成多项式

GGPR（EuroCrypt 2013，同作者组）提出 **Quadratic Arithmetic Program**：为电路构造三组多项式 \(\{v_k(x)\}, \{w_k(x)\}, \{y_k(x)\}\) 和目标多项式 \(t(x)\)，使得：

\[
p(x) = \Big(\sum_k c_k v_k(x)\Big)\Big(\sum_k c_k w_k(x)\Big) - \sum_k c_k y_k(x)
\]

当且仅当 witness \((c_1,\ldots,c_m)\) 满足所有乘法门约束时，\(t(x)\) 整除 \(p(x)\)。

直觉：**逐门检查**是 \(O(\text{门数})\)；**多项式整除**在 Prover 侧用一次商多项式 \(h(x)=p(x)/t(x)\) 打包，Verifier 侧用**常数次配对**检查 —— 这是「288 字节 + 10ms」的数学根源。

Pinocchio 相对 GGPR 的改进：用 **regular QAP** 而非 strong QAP，避免把 QAP 度数翻三倍，从而把 key 生成与 Prover 工作量再砍 **60%+**。

### 4. 三阶段协议与两把钥匙

```
Setup（每个电路/程序一次，成本 ≈ 本地执行一遍该电路）
  输入：电路 C 的描述
  输出：evaluation key (EK)  → 仅 Prover 需要，体积 ∝ 电路规模
        verification key (VK) → 公开，体积小

Prove（每个输入实例一次，Prover/Worker 执行）
  输入：EK，公开 x，秘密 w
  计算 y = C(x,w)，生成证明 π（288 字节）

Verify（任何人，极快）
  输入：VK，公开 x，声称的 y，证明 π
  输出：接受 / 拒绝（~10ms，与电路规模基本无关）
```

**Succinct** 的精确含义：**证明大小**和**验证时间**与计算规模无关（或仅弱相关）；**Setup** 和 **Prove** 仍很贵 —— 别搞反了。

### 5. 配对（Pairing）与知识假设

Pinocchio 用双线性配对 \(e: \mathbb{G}_1 \times \mathbb{G}_2 \to \mathbb{G}_T\) 把 QAP 检查压缩到少量群元素运算。288 字节 ≈ **3 个群元素**的编码。

安全性在**通用群模型**下论证，依赖 **q-type 假设**（非无条件安全）。eprint 页面注明对 verification procedure 有**勘误** —— 读实现应对照最新 PDF，勿用早期幻灯片公式。

### 6. 零知识：同一协议加随机掩码

论文 §5 在 base VC 上加 blinding 即得 **zk-SNARK**：Verifier 除「陈述为真」外学不到 witness。实测 zk 只增加约 **213 µs**（< 0.1%），说明协议设计时 homomorphism 接口预留充分。

### 7. 与 Groth16 的关系（读时间线用）

| 维度 | Pinocchio (2013) | Groth16 (2016) |
|------|------------------|----------------|
| 证明大小 | ~288 B | ~192 B（3 个 \(\mathbb{G}_1\) 元素） |
| 端到端 toolchain | **有**（C → 证明） | 通常接 circom/libsnark 生态 |
| QAP | 直接使用，优化 regular QAP | 更激进的配对布局 |

把 Pinocchio 当「第一代工程落地」，Groth16 当「证明体积极致版」，读 [[zk-snark]] 时时间线就不会乱。

## 代码示例

### 示例 1：把 \(x^3 + x + 5 = 35\) 拆成 R1CS（理解编译第一步）

证明「我知道秘密 \(x\) 使等式成立」时，不能写一条 \(x^3\) 约束 —— **每条 R1CS 只允许一次乘法**。要引入中间 wire：

```python
# 公开: out = 35
# 秘密 witness: x = 3
# 中间 wire: y = x*x, z = y*x  => z = x^3

witness = {
    "x": 3,      # 秘密
    "y": 9,
    "z": 27,
    "out": 35,   # 公开
}

def check_r1cs(w):
    # 约束 1: y = x * x
    assert w["y"] == w["x"] * w["x"]
    # 约束 2: z = y * x
    assert w["z"] == w["y"] * w["x"]
    # 约束 3: out = z + x + 5  （加法可通过 witness 布局编码）
    assert w["out"] == w["z"] + w["x"] + 5

check_r1cs(witness)  # True
# Pinocchio C 编译器自动做这种拆分 × 成千上万，再升到 QAP 多项式
```

这一步对应 toolchain 的「前端」：高级逻辑 → 约束系统。SHA-256 一个哈希就**数万**条类似约束 —— zk 工程常态。

### 示例 2：Setup / Prove / Verify 的数据流（教学占位，非真实密码学）

真实系统用 libsnark 的 `r1cs_ppzksnark` 与椭圆曲线配对；下面用 Python **只保留 API 形状**，方便记忆三阶段分工：

```python
from dataclasses import dataclass
from hashlib import sha256

@dataclass
class Keys:
    ek: bytes   # evaluation key —— Prover 专用，∝ 电路大小
    vk: bytes   # verification key —— 公开

@dataclass
class Proof:
    pi: bytes   # 论文中固定约 288 字节

class PinocchioToy:
    """演示数据流；群运算与 pairing 用哈希占位，不可用于生产。"""

    def setup(self, circuit_id: str) -> Keys:
        seed = sha256(circuit_id.encode()).digest()
        return Keys(ek=seed + b":ek", vk=seed + b":vk")

    def prove(self, keys: Keys, public_x: int, witness_w: int, y: int) -> Proof:
        assert self._eval(public_x, witness_w) == y
        raw = sha256(
            keys.ek + str((public_x, y)).encode() + str(witness_w).encode()
        ).digest()
        return Proof(pi=raw[:288].ljust(288, b"\x00"))

    def verify(self, vk: bytes, public_x: int, y: int, proof: Proof) -> bool:
        return len(proof.pi) == 288 and vk.endswith(b":vk")

    def _eval(self, x: int, w: int) -> int:
        return x * w + 1  # 玩具 f(x,w) = x*w + 1

toy = PinocchioToy()
keys = toy.setup("circuit_mul_add_v1")
x, w, y = 7, 3, 22
pi = toy.prove(keys, x, w, y)
assert toy.verify(keys.vk, x, y, pi)
```

论文在 **7 个应用**（矩阵乘法、编辑距离、线性规划等）上测得：证明恒 **288 B**，验证 **毫秒级** —— 玩具代码只帮你记「谁拿 EK、谁拿 VK、Verify 不碰 witness」。

### 示例 3：论文 toolchain 的 C 子集输入（概念形态）

```c
// Pinocchio 支持固定宽度整数、受限控制流的 C 子集
// 编译产物：算术电路 + prover/verifier 可执行代码

int compute(int x, int y) {
    int z = x * y;
    return z + x;
}

// 客户端：Setup(compute) → EK + VK（一次性，≈ 本地跑一遍 compute）
// Worker：对 (x,y) 运行 → (result, 288-byte proof)
// 任何人：Verify(VK, x, y, result, proof) → 接受/拒绝
```

今天同类路径：C/Rust → circom / Noir / Risc0 zkVM → R1CS/QAP → snarkjs / Groth16 prover。问题形态**40 年不变**：高级语言 → 约束 → 短证明。

## 论文实验结果（精读对照表）

| 应用类型 | 验证时间量级 | 相对先前 VC |
|----------|--------------|-------------|
| 矩阵乘法等 | ~10 ms | 验证快 **5–7 个数量级** |
| 多种 benchmark | 部分 **< 原生 C 执行** | 首次 general-purpose VC 达成 |
| Prover | 仍 ≫ 原生 | 但比旧方案少 **19×–60×** |
| 证明 | **288 B** 恒定 | 略大于 RSA-2048 签名 |
| zk 模式 | +213 µs 级 | 几乎可忽略 |

这些数字在 2013 年足够震撼，标题才敢写 *Nearly Practical*。

## 常见误区（零基础易踩）

1. **「288 字节很轻」≠ 全流程便宜**  
   Succinct 指的是**验证侧**。Prover 可能要 GB 级内存、分钟级时间；Setup 成本正比于电路规模。

2. **Setup 不是一次性万能**  
   每个**不同**的电路要重新 Setup。EK 生成用的秘密随机数（toxic waste）若泄露，攻击者可伪造任意假证明。这是后来 Plonk universal setup、STARK 透明证明要解决的痛点。

3. **电路 ≠ 原程序**  
   `if`/`while`/指针要在编译期展开或编码；约束数随程序复杂度爆炸。别指望「把任意 Python 丢进去就自动 zk」。

4. **验证公式有勘误**  
   实现 libsnark 时对照 [eprint 2013/279](https://eprint.iacr.org/2013/279) 最新版，勿抄旧幻灯片。

5. **与 STARK 别混威胁模型**  
   Pinocchio 系：证明极小、验证极快，但要 trusted setup，且配对非后量子。STARK：证明大、验证较慢，但透明且更抗量子（见 [[ben-sasson-stark-2018]]）。

## 适用 vs 不适用

**适用**：

- 向第三方证明「计算正确」，且 Verifier 资源受限（手机、链上合约、轻节点）
- **电路固定**、**实例频繁**（同一函数证明成千上万次输入）
- 需要 zk：证明知道 witness 而不泄露（隐私交易、凭证）

**不适用**：

- 电路经常变（每次变都要重新 Setup）
- Prover 延迟敏感（实时交互 API）
- 不能容忍 trusted setup 或配对假设
- 必须后量子安全

## 历史位置

| 年份 | 里程碑 |
|------|--------|
| 1985 | Goldwasser–Micali–Rackoff：零知识证明 |
| 2007 | GKR：可验证计算多项式时间 Prover（仍不实用） |
| 2013 | GGPR QAP 理论 + **Pinocchio 系统**（本文） |
| 2013 | libsnark 开源 |
| 2016 | Groth16；Zcash 采用 zk-SNARK |
| 2019+ | Plonk、zkRollup 爆发 |

## 学到什么

1. **工程里程碑有时比常数优化重要**：从「理论上存在」到「288 B + 10 ms」改变的是产品形态。
2. **QAP/R1CS 是长期资产**：2013 年的编码，2020 年代 rollup 仍在用；理解 QAP = 拿到 zk 编译器的「汇编」。
3. **不对称设计要算清谁是 Verifier**：链上验证明、手机验云 —— Pinocchio 为 Verifier 优化，Prover 慢是刻意权衡。
4. **zk 可以是附加开关**：同一 VC 协议几乎免费加零知识，说明协议层预留了 homomorphism 结构。

## 延伸阅读

- 论文 PDF：[eprint.iacr.org/2013/279](https://eprint.iacr.org/2013/279)（含验证流程修正）
- Vitalik 科普：[ZK-SNARKs 入门](https://vitalik.eth.limo/general/2017/01/14/zk_snarks.html)（QAP 讲给程序员）
- libsnark：`r1cs_ppzksnark` 示例（Pinocchio 协议开源延续）
- GGPR 原论文：*Quadratic Span Programs and Succinct NIZKs without PCPs*

## 关联

- [[zk-snark]] —— zk-SNARK 工程史总览；Groth16 / Plonk 在后继节点
- [[ben-sasson-stark-2018]] —— 透明证明路线；附录 PGHR 一页协议即 Pinocchio 系 SNARK
- [[rsa-1978]] —— 288 字节证明在协议带宽中的角色，可类比短数字签名
- [[cook-levin]] —— NP 完全性；VC 典型目标是证明 NP 陈述的成员资格

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[ben-sasson-stark-2018]] —— Scalable, Transparent, and Post-Quantum Secure Computational Integrity
- [[cook-levin]] —— Cook-Levin 定理 — NP-完全性的诞生
- [[zk-snark]] —— zk-SNARK 零知识证明

