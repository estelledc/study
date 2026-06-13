---
title: "零知识证明学习笔记"
来源: "https://github.com/matter-labs/awesome-zero-knowledge-proofs"
日期: "2026-06-13"
分类_原始: 密码学
分类: 安全与隐私
子分类: 密码与零知识
provenance: "pipeline-v3"
---

# 零知识证明学习笔记

## 什么是零知识证明？

零知识证明（Zero-Knowledge Proof, ZKP）是一种加密方法，它允许一方（证明者）向另一方（验证者）证明某个陈述是真的，而**不透露任何额外信息**。

### 日常类比：神秘的彩色球

想象你有两个球，一个红色、一个蓝色。你想向你的朋友证明这两个球颜色不同，但又不想告诉他哪个是红的、哪个是蓝的。

你可以这样做：把两个球分别握在左右手中，让他随机选择"换"或"不换"。如果他猜对了球的摆放位置，你把球收回重新随机放置，再来一轮。重复多次后，如果他每次都能猜对，他就不得不相信这两个球确实颜色不同——但他始终不知道哪个球是哪个颜色。

这就是零知识证明的核心思想：**证明某件事为真，同时不泄露任何秘密**。

## 核心概念

### 三个基本属性

1. **完备性**（Completeness）：如果陈述是真的，诚实的验证者通常能说服证明者
2. **合理性**（Soundness）：如果陈述是假的，欺骗者无法说服诚实的验证者
3. **零知识性**（Zero-Knowledge）：验证者除了"陈述为真"这个事实外，学不到任何东西

### 零知识证明家族的主要成员

awesome-zero-knowledge-proofs 仓库整理了几大类 ZKP 系统：

| 类型 | 全称 | 证明大小 | 验证速度 | 需要可信设置 | 抗量子 |
|------|------|---------|---------|------------|-------|
| zk-SNARK | Succinct Non-interactive ARguments of Knowledge | ~200 字节 | ~O(1) | 需要 | 否 |
| zk-STARK | Scalable Transparent ARguments of Knowledge | ~45 KB | poly-log | 不需要 | 是 |
| Bulletproofs | — | ~1.5 KB | O(N) | 不需要 | 否 |

### zk-SNARK

全称是 **S**uccinct **N**on-interactive **AR**guments of **K**nowledge（简洁的非交互知识论证）。

- 证明非常短（约 200 字节）
- 验证极快（常数时间）
- 需要一次性的"可信设置"（trusted setup），如果设置过程中产生的"有毒废料"被泄露，就能伪造证明
- 不抗量子计算

### zk-STARK

全称是 **S**uccinct (**S**calable) **T**ransparent **AR**guments of **K**nowledge（简洁的可扩展透明知识论证）。

- 不需要可信设置，所以更"透明"
- 抗量子计算攻击
- 证明比 SNARK 大（约 45KB）
- 基于哈希函数，安全性假设更少

## 代码示例

### 示例一：用 Circom 编写一个简单的算术电路

Circom 是一种用于编写零知识证明电路的领域特定语言。下面这个例子证明你知道两个数相乘的结果，但不需要告诉别人这两个数是什么：

```circom
// 证明者知道 a * b = c，但不泄露 a 和 b
template MultiplyCircuit() {
    // 信号：电路中的变量
    signal input secretA;  // 秘密输入：a
    signal input secretB;  // 秘密输入：b
    signal output publicC; // 公开输出：c = a * b

    // 约束：secretA * secretA = publicC
    secretA * secretB === publicC;
}

// 实例化电路
component main = MultiplyCircuit();
```

这段电路的意思是：我证明我知道两个数 `secretA` 和 `secretB`，它们的乘积等于 `publicC`。验证者能看到 `publicC` 的值，但看不到 `secretA` 和 `secretB`。

### 示例二：用 gnark（Go 语言）生成和验证证明

gnark 是 Go 语言中流行的 ZKP 库：

```go
package main

import (
    "fmt"
    "github.com/consensys/gnark-crypto/ecc"
    "github.com/consensys/gnark/backend/groth16"
    "github.com/consensys/gnark/constraint/r1cs"
    "github.com/consensys/gnark/frontend"
)

// 电路：知道 x 使得 hash(x) == y
type AnonymousCircuit struct {
    Secret frontend.Secret `gnark:"secret"`
    Pub    frontend.Public   `gnark:"pub"`
}

// Define 定义电路逻辑
func (c *AnonymousCircuit) Define(api frontend.API) error {
    // 计算 secret 的哈希
    hashed := api.SHA256(c.Secret)
    // 约束：哈希值必须等于公开输出
    api.AssertIsEqual(hashed, c.Pub)
    return nil
}

func main() {
    // 1. 编译电路
    circuit := new(AnonymousCircuit)
    cs, _ := frontend.Compile(ecc.BN254.ScalarField(), r1cs.NewBuilder, circuit)

    // 2. 设置（生成证明者密钥和验证者密钥）
    pk, vk, _ := groth16.Setup(cs)

    // 3. 创建赋值（证明者知道 secret = "my-hidden-value"）
    assignment := AnonymousCircuit{
        Secret: "my-hidden-value",
        Pub:    [32]byte{ /* SHA256 of "my-hidden-value" */ },
    }

    // 4. 生成证明
    proof, _ := groth16.Prove(cs, pk, assignment)

    // 5. 验证证明
    publicAssignment := AnonymousCircuit{Pub: assignment.Pub}
    err := groth16.Verify(proof, vk, publicAssignment)
    fmt.Println("验证结果:", err == nil) // true
}
```

这段代码展示了完整的 ZKP 流程：定义电路 → 设置密钥 → 生成证明 → 验证证明。整个过程不泄露 `Secret` 的值。

## 实际应用

零知识证明已经在多个场景中得到应用：

- **隐私加密货币**：Zcash、Monero 用 ZKP 隐藏交易金额和发送方/接收方信息
- **以太坊扩容**： zkSync、StarkNet 等 zkRollup 方案在链下计算，在链上用 ZKP 验证
- **身份认证**：证明你年满 18 岁，但不透露你的出生日期
- **投票系统**：证明你的票已正确计票，但不泄露你投给了谁
- **机器学习**：证明模型训练正确，但不泄露训练数据

## 学习路线建议

从 awesome-zero-knowledge-proofs 仓库出发，推荐的学习顺序：

1. 先读 Matthew Green 的 [ illustrated primer](https://blog.cryptographyengineering.com/2014/11/27/zero-knowledge-proofs-illustrated-primer/)，建立直观理解
2. 看 ZK Hack 的 [白板课程](https://zkhack.dev/whiteboard/)，从 SNARK 讲到 STARK
3. 读 Vitalik 的 SNARK/STARK 系列博客，理解底层数学
4. 动手实践：用 Circom 或 gnark 编写简单的电路
5. 深入理论：学习 Groth16、PLONK、FRI 等具体协议

## 总结

零知识证明是密码学的"圣杯"之一。它的核心理念很简单：证明你知道某个东西，而不需要说出它是什么。从数学角度看，它涉及多项式承诺、椭圆曲线配对、哈希函数等深奥的工具。但从应用角度看，它能解决隐私和信任的根本矛盾。

对于初学者，建议从类比和直观理解入手，再逐步深入到数学细节。awesome-zero-knowledge-proofs 这个仓库就是这样一个很好的起点，它把分散的学习资源整理在一起，覆盖了从入门到研究的各个层次。
