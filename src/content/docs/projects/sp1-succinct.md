---
title: SP1 - 零知识虚拟机入门
来源: https://github.com/succinctlabs/sp1
日期: 2026-06-13
分类: 安全与隐私
子分类: 密码与零知识
provenance: pipeline-v3
---

# SP1 - 零知识虚拟机入门

## 一、从日常类比开始

想象你请了一位朋友帮你算一道非常复杂的数学题。算完之后，他告诉你答案是 42。

你会相信他吗？最保险的方式是自己重新算一遍——但如果这道题要花你一整天呢？

**零知识证明（Zero-Knowledge Proof, ZKP）** 就是这样一个魔法：你的朋友可以给你一张"证明纸条"，让你一眼就确认他的答案是对的，而你完全不需要自己重算，也不需要知道他是怎么算出来的。

**SP1** 就是这个魔法世界的"计算器"。它是一个零知识虚拟机（zkVM），让你可以用普通的编程语言（主要是 Rust）写程序，然后自动生成一张"证明纸条"，告诉任何人："这段代码确实按预期执行了，结果是正确的。"

## 二、什么是 zkVM？

zkVM 全称 Zero-Knowledge Virtual Machine，翻译过来就是"零知识虚拟机"。

类比一下：

- **普通虚拟机（如 JVM）**：运行你的代码，产出结果
- **zkVM**：运行你的代码，产出结果，同时产出一张"数学证明"，证明代码确实是按预期跑的

SP1 的核心能力就一句话：**证明任意 RISC-V 程序的执行是正确的。**

这意味着你可以用 Rust、C、C++ 写程序，编译成 RISC-V 格式，然后 SP1 就能为它的执行过程生成一个加密证明。

## 三、SP1 的核心概念

### 3.1 ELF 文件

Rust 程序不能直接塞进 zkVM。第一步是把它编译成一个 **ELF** 文件（可执行与可链接格式），这是 RISC-V 架构的标准可执行文件格式。

### 3.2 证明密钥（Proving Key）与验证密钥（Verifying Key）

每次为一个程序生成证明之前，需要先"注册"这个程序：

- **pk（proving key）**：用来生成证明，相当于"印章"
- **vk（verifying key）**：用来验证证明，相当于"验钞机"

### 3.3 公共值（Public Values）

程序执行过程中，有些输出是"公开的"——任何人都可以看到。比如斐波那契数列的第 20 项是多少。这些值被绑定到证明上，验证者可以通过它们确认证明对应的是哪个输入和输出。

### 3.4 STARK 与 FRI

SP1 底层使用的证明系统是 **STARK**（Scalable Transparent Argument of Knowledge）。简单来说，它把程序执行的每一步变成一组代数方程，然后用 **FRI**（Fast Reed-Solomon Interactive Oracle Proof of Proximity）协议来证明这些方程全部成立。

STARK 的优势：

- 透明（不需要可信设置）
- 量子安全
- 证明速度快

### 3.5 Hypercube（V6 版本）

SP1 V6 引入了名为 Hypercube 的新型多项式证明系统，通过更先进的多项式承诺方案和优化的递归机制，大幅提升了证明性能。

### 3.6 证明类型

SP1 支持多种证明类型，最常用的两种是：

- **Compressed Proof（压缩证明）**：体积更小，适合链上验证
- **Proof（标准证明）**：更大但验证更快

## 四、SP1 的工作流程

整个流程可以概括为四个步骤：

1. **定义（Define）**：用 Rust 写程序
2. **编译（Compile）**：编译成 RISC-V ELF 文件
3. **证明（Prove）**：生成证明
4. **验证（Verify）**：验证证明是否正确

## 五、代码示例

### 示例一：编写一个可在 zkVM 中运行的斐波那契程序

这是写在 `program/src/main.rs` 中的程序。注意 SP1 提供了特殊的输入输出接口 `sp1_zkvm::io`。

```rust
use sp1_zkvm::io;

fn main() {
    // 从输入中读取要计算的斐波那契项数 n
    let n = io::read::<u32>();

    // 计算第 n 项斐波那契数
    let mut a: u32 = 0;
    let mut b: u32 = 1;

    for _ in 0..n {
        let temp = a + b;
        a = b;
        b = temp;
    }

    // 将结果写入公共输出
    io::commit(&a);
    io::commit(&b);
}
```

关键点：

- `io::read::<T>()` 从输入流中读取数据
- `io::commit(&value)` 将值标记为"公共输出"，验证者可以看到
- 整个程序就是普通的 Rust，没有奇怪的领域特定语言（DSL）

### 示例二：用 Rust SDK 生成和验证证明

这是写在 `script/src/main.rs` 中的证明脚本，使用 `sp1_sdk` crate。

```rust
use sp1_sdk::{ProverClient, ClientExt};

// 嵌入编译好的 ELF 文件
includeElf!("fibonacci-elf");

#[tokio::main]
async fn main() {
    // 初始化日志
    sp1_sdk::utils::console_subscriber();

    // 准备输入：计算第 20 项斐波那契数
    let mut stdin = sp1_sdk::SP1Stdin::new();
    stdin.write(&20u32);

    // 创建证明客户端
    let client = ProverClient::new();

    // 第一步：执行（不生成证明，只验证程序正确性）
    let (public_values, report) = client
        .execute(&ELF)
        .run(&stdin)
        .unwrap();

    println!("执行完成！输出: {:?}", public_values);

    // 第二步：生成压缩证明
    let (proof, vk) = client
        .setup(&ELF)
        .prove_compressed(&stdin)
        .unwrap();

    println!("证明已生成！");

    // 第三步：验证证明
    client.verify(&proof, &vk).unwrap();

    println!("证明验证通过！");
}
```

关键点：

- `includeElf!` 宏把 ELF 文件嵌入到 Rust 代码中
- `execute()` 用于开发调试，非常快，但不生成证明
- `prove_compressed()` 生成压缩证明，适合链上验证
- `verify()` 验证证明的有效性

## 六、项目结构

用 `cargo prove new --bare fibonacci` 创建项目后，会得到这样的结构：

```
fibonacci/
├── program/                # zkVM 程序（被证明的部分）
│   ├── Cargo.toml
│   └── src/
│       └── main.rs         # 你的 Rust 代码
├── script/                 # 证明生成脚本
│   ├── Cargo.toml
│   ├── build.rs            # 自动编译 program
│   └── src/
│       └── bin/
│           ├── prove.rs    # 生成证明
│           └── vkey.rs     # 获取验证密钥
└── rust-toolchain
```

两个 crate 分工明确：

- `program`：被证明的代码，运行在 zkVM 里
- `script`：控制证明流程的代码，运行在你的机器上

## 七、SP1 的典型应用场景

| 场景 | 说明 |
|------|------|
| 链上验证 | 在以太坊等链上验证大规模计算结果，降低 Gas 费 |
| 轻客户端 | 构建可验证的其他链状态轻客户端，实现跨链互操作 |
| 协处理器 | 将链上计算外包给链下证明器 |
| 隐私交易 | 实现链上隐私功能，如隐藏金额的转账 |
| 预言机 | 对链上数据进行大规模计算并验证 |

实际项目包括 OP Succinct（OP Stack 的证明引擎）、SP1 Tendermint（以太坊上的 Tendermint 轻客户端）、RSP（基于 Rust 的 zkEVM）。

## 八、开发建议

1. **先用 execute 调试**：生成证明很慢，开发阶段只调用 `execute()` 检查输出是否正确
2. **大程序用证明网络**：对于超过 100 万周期的程序，推荐使用 Succinct Prover Network（云端分布式证明）
3. **正常 Rust 即可**：大多数标准库 crate 可以直接使用，不需要学专门的 DSL
4. **关注 cycle 数**：每个程序执行消耗的"周期数"决定了证明成本，可以用 `report.total_cycles` 查看

## 九、总结

SP1 让零知识证明变得像写普通代码一样简单。你只需要：

1. 写 Rust 程序
2. 编译成 ELF
3. 一行命令生成证明
4. 一行命令验证证明

不需要懂复杂的密码学，不需要设计电路，不需要可信设置。这就是 zkVM 的魅力——把零知识证明变成了每个开发者都能用的工具。

---

参考文档：
- SP1 官方文档：https://docs.succinct.xyz/docs/sp1/introduction
- SP1 GitHub：https://github.com/succinctlabs/sp1
- SP1 快速开始：https://docs.succinct.xyz/docs/sp1/getting-started/quickstart
