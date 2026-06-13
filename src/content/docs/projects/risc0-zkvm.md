---
title: RISC Zero zkVM 零基础学习笔记
来源: https://github.com/risc0/risc0
日期: 2026-06-13
分类: 安全与隐私
子分类: 密码与零知识
provenance: pipeline-v3
---

# RISC Zero zkVM 零基础学习笔记

## 一、从日常类比开始

想象你有一个朋友，他算数学题特别快，但你不信任他。你想验证他的答案是否正确。

传统做法有两种：
- 你自己重新算一遍（慢，但放心）
- 他告诉你每一步的过程，你逐行检查（还是得自己动脑）

零知识证明解决的问题是：**让对方证明他算对了，但不用告诉我任何中间步骤或原始数据。**

RISC Zero zkVM 就是把「运行一段程序」这件事，变成一个可以用数学证明「确实正确执行过」的东西。你不需要知道程序跑了什么数据、中间状态是什么，只需要验证最终生成的「证明」，就能 100% 确定程序是按预期执行的。

## 二、核心概念

### 1. 零知识证明（Zero-Knowledge Proof）

零知识证明是一种密码学协议，证明方可以说服验证方「某件事是真的」，而不泄露任何额外信息。好比你能证明你知道一个密码，但不用把密码告诉你朋友。

### 2. zkVM（零知识虚拟机）

zkVM 是一种虚拟机，它能让任意程序在其上运行时自动生成一个密码学证明，证明这段程序确实被正确执行了。RISC Zero 的 zkVM 模拟的是 RISC-V 架构。

### 3. Host（主机）与 Guest（来宾）

- **Host**：运行在你的电脑上的正常程序，负责启动 zkVM、发送输入、获取结果
- **Guest**：在 zkVM 内部运行的程序，它的执行过程会被自动证明

你可以把 Host 想成「老板」，Guest 想成「打工的」。老板把任务交给 Guest 去做，Guest 做完后交回结果和一个「证明」。老板验证证明即可确信结果正确，而不用知道 Guest 用了什么中间数据。

### 4. Receipt（收据）

收据是 zkVM 执行完成后生成的「证明包」，包含两部分：

- **Journal（日志）**：Guest 程序中通过 `env::commit()` 公开写出的数据，任何拿到收据的人都能看到
- **Seal（封印）**：密码学签名数据，无法伪造。验证者靠它确认程序确实被正确执行过

### 5. Image ID

Image ID 是 Guest 程序的「密码学指纹」。验证收据时必须提供正确的 Image ID，否则收据无效。这确保了证明对应的就是那个特定的程序，没有被偷梁换柱。

### 6. Dev Mode（开发模式）

开发时每次生成真实证明都等很久。Dev Mode 跳过证明生成过程，快速运行代码。设置环境变量 `RISC0_DEV_MODE=1` 即可切换。

## 三、代码示例

### 示例一：Hello World — 证明两个数相乘

这是一个最简单的例子：程序接收两个数作为输入，在 zkVM 内部计算它们的乘积，然后输出结果。任何人都可以用收据验证「乘积确实是这两个数算出来的」，但不知道这两个数具体是多少（除非你把它们写到 journal 里）。

**Guest 程序**（在 zkVM 内部运行，会被证明的部分）：

```rust
use risc0_zkvm::guest::env;

// 告诉 zkVM 从哪里开始执行
risc0_zkvm::guest::entry!(main);

fn main() {
    // 从 Host 读取两个输入数
    let a: u64 = env::read();
    let b: u64 = env::read();

    // 验证输入不是平凡的（排除 1 * x 这种无聊情况）
    if a == 1 || b == 1 {
        panic!("Trivial factors");
    }

    // 计算乘积
    let product = a.checked_mul(b).expect("Integer overflow");

    // 把结果写入 Journal（变成公开输出）
    env::commit(&product);
}
```

**Host 程序**（你的电脑上运行的正常代码）：

```rust
use hello_world::multiply;
use hello_world_methods::MULTIPLY_ID;

fn main() {
    // 选两个数，比如 17 和 23
    let (receipt, result) = multiply(17, 23);

    // 验证收据 — 如果程序执行有误，这里会 panic
    receipt.verify(MULTIPLY_ID).expect(
        "Code you have proven should successfully verify",
    );

    println!("I know the factors of {}, and I can prove it!", result);
}

pub fn multiply(a: u64, b: u64) -> (Receipt, u64) {
    // 构建执行环境，把输入发给 Guest
    let env = ExecutorEnv::builder()
        .write(&a)
        .unwrap()
        .write(&b)
        .unwrap()
        .build()
        .unwrap();

    // 获取默认证明器
    let prover = default_prover();

    // 执行并生成收据（包含证明）
    let receipt = prover.prove(env, MULTIPLY_ELF).unwrap().receipt;

    // 从收据的 Journal 中解码输出结果
    let c: u64 = receipt.journal.decode().expect(
        "Journal output should decode to u64",
    );

    (receipt, c)
}
```

运行成功会输出：`I know the factors of 391, and I can prove it!`

### 示例二：证明你知道一个密码（但不告诉别人）

这个例子展示零知识的真正威力：程序验证一个密码是否正确，但密码本身不会出现在输出中。

**Guest 程序**：

```rust
use risc0_zkvm::guest::env;

risc0_zkvm::guest::entry!(main);

fn main() {
    // 从 Host 接收一个尝试的密码
    let guess: String = env::read();

    // 在 zkVM 内部硬编码一个正确密码（也可以从其他地方读取）
    let secret = "supersecret123";

    // 验证密码是否正确
    if guess == secret {
        // 只写入「验证通过」的标志，不写入密码本身
        env::commit(&true);
    } else {
        // 验证失败
        env::commit(&false);
    }
}
```

**Host 程序**：

```rust
use risc0_zkvm::{default_prover, ExecutorEnv, Receipt};

fn main() {
    // 我想知道「我是否知道密码」，但不想让任何人看到我输入的密码
    let guess = "supersecret123".to_string();

    let env = ExecutorEnv::builder()
        .write(&guess)
        .unwrap()
        .build()
        .unwrap();

    let prover = default_prover();
    let receipt = prover.prove(env, GUEST_ELF).unwrap().receipt;

    // 验证证明
    receipt.verify(GUEST_IMAGE_ID).expect("Verification failed");

    // 从 Journal 读取结果
    let is_valid: bool = receipt.journal.decode().expect("Decode failed");

    if is_valid {
        println!("密码验证通过！而且没有人知道我输入了什么密码。");
    } else {
        println!("密码错误。");
    }
}
```

在这个例子中，第三方拿到收据后只能看到「验证通过」的结果，完全不知道密码是什么。这就是「零知识」的含义。

## 四、工作流程总结

```
1. 编译 Guest 程序 → 生成 RISC-V ELF 文件 + Image ID（密码学哈希）
2. Host 准备输入 → 通过 ExecutorEnv 发送给 Guest
3. Guest 在 zkVM 中运行 → 执行代码，通过 env::commit() 写入结果到 Journal
4. 生成 Receipt → 包含 Journal（公开输出）+ Seal（密码学证明）
5. 验证 Receipt → 用 Image ID 验证 Seal，确认程序确实被正确执行过
```

## 五、实际应用场景

- **区块链扩容**：把大量计算移到链下 zkVM 中执行，只把证明提交到链上验证，大幅降低 gas 费用
- **隐私交易**：证明交易合法但隐藏金额、发送方、接收方
- **可信 AI**：证明 AI 模型确实按预期权重运行过，而不用公开模型参数
- **隐私数据查询**：证明你有权访问某条数据，但不泄露你是谁、数据是什么
- **游戏和 NFT**：证明你在游戏中取得了某个成就，同时隐藏游戏策略

## 六、关键技术参数

- **底层加密**：基于 zk-STARK 协议 + Groth16 递归证明系统，三层递归架构
- **安全级别**：默认参数下达到 98 比特的推测安全强度
- **零知识属性**：完美零知识（perfect zero-knowledgeness）
- **支持语言**：Rust（首选）、C、C++（需编译为 RISC-V 目标）
- **许可协议**：Apache-2.0 或 MIT

## 七、学习路径建议

1. 先安装 `rzup` 工具链
2. 用 `cargo risczero new` 创建第一个项目
3. 在 Dev Mode 下快速迭代开发
4. 切换到真实证明模式体验生成过程
5. 阅读 examples 目录下的 JSON、Chess 等进阶示例

## 八、参考资料

- 官方文档：https://dev.risczero.com
- GitHub 仓库：https://github.com/risc0/risc0
- Rust 文档：https://docs.rs/risc0-zkvm
- Discord 社区：https://discord.gg/risczero
- 递归证明系统讲解视频：https://www.youtube.com/watch?v=wkIBN2CGJdc
