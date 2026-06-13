---
title: Aleo 零基础学习笔记
来源: https://github.com/AleoHQ/aleo
日期: 2026-06-13
分类: 区块链
子分类: blockchain-and-crypto
provenance: pipeline-v3
---

# Aleo 零基础学习笔记

## 一、从日常类比开始：什么是零知识证明？

想象你在参加一场考试。传统方式下，你想向别人证明"我考了 90 分以上"，你得把试卷完全展示给对方看。但零知识证明（Zero-Knowledge Proof, ZKP）就像有一种魔法：你可以只告诉对方"我通过了"，对方也能百分之百确认你说的是真话，却完全看不到你的试卷内容。

区块链领域里，绝大多数公链（如比特币、以太坊）的交易是公开的——任何人可以看到谁给谁转了多少钱。Aleo 的核心创新就在于：**它让交易可以证明"合法"，但隐藏"细节"**。

## 二、Aleo 是什么？

Aleo 是一个**以隐私为核心设计的区块链网络**。它使用零知识证明技术，让每个交易默认都是私有的：

- 金额是加密的
- 发送方和接收方的身份是隐藏的
- 但任何人都能验证这笔交易是符合规则的

它的关键特点包括：

1. **默认隐私** — 不需要额外配置，交易天然保密
2. **可编程隐私** — 可以用自己的语言编写智能合约（称为 Leo 语言）
3. **合规可控** — 虽然默认隐私，但可以通过零知识证明向监管机构"选择性披露"信息
4. **快速便宜** — 相比以太坊，Gas 费极低，交易确认快

## 三、核心概念

### 1. 零知识证明（ZKP）

这是 Aleo 的底层技术。简单说就是：证明者能让验证者相信某个陈述是真的，而无需透露陈述本身的具体信息。Aleo 使用的是 zk-SNARK 类型，特点是验证速度极快。

### 2. Leo 语言

Leo 是 Aleo 专门为编写隐私保护智能合约而设计的新编程语言。它类似于 Solidity（以太坊的合约语言），但每一个变量默认都是"私有的"。

### 3. Record（记录）

Aleo 不直接使用"账户余额"的概念。取而代之的是"记录"——每条记录代表一笔不可分割的代币。转账实际上是"销毁旧记录 + 创建新记录"的过程。

### 4. 账户体系

Aleo 的账户由**私钥 → 视图密钥 → 计算密钥**派生而来：

- **私钥**：控制资产，必须严格保密
- **视图密钥**：只能查看交易内容，不能转移资产
- **计算密钥**：可以代写证明，适合硬件钱包场景

### 5. Prover（证明者）

Aleo 网络中有专门的角色叫 Prover——他们负责生成零知识证明。用户可以将证明生成的任务委托给远程服务，无需本地高性能计算。

## 四、代码示例

### 示例一：用 Leo 语言写一个简单的隐私代币合约

下面是一个极简的 Leo 合约，定义了"转账"功能。注意变量前缀：`private` 表示隐私数据，`public` 表示公开数据。

```leo
// 文件: transfer.leo
// 定义一个隐私代币合约

program transfer.aleo;

// 定义一个结构化数据类型：转账记录
struct Transfer {
    from: address,
    to: address,
    amount: u64,
    nonce: u64
}

// 验证一笔转账交易
// private 变量是隐私的，对所有人隐藏
// public 变量是公开的，网络可见
fn verify_transfer(
    private sender: address,
    private amount: u64,
    private input_record: Transfer,
    public output_record: Transfer
) -> Transfer {
    // 检查发送者是否是记录的持有者
    assert_eq!(input_record.from, sender);
    // 检查新记录金额不大于输入金额
    assert_leq!(output_record.amount, input_record.amount);
    // 返回创建的新记录
    output_record
}
```

这个合约的核心逻辑是：
- `private` 变量（发送者地址、金额、输入记录）只有授权视图密钥持有者能看到
- `public` 变量（输出记录）可以在链上公开验证
- `assert_eq!` 和 `assert_leq!` 是验证约束，证明交易合法

### 示例二：用 Provable SDK（JavaScript/TypeScript）创建 Aleo 账户

Aleo 提供了 JavaScript/TypeScript SDK，让前端开发者可以直接在浏览器或 Node.js 中构建隐私应用。

```typescript
// 文件: demo.ts
// 使用 Provable SDK 创建 Aleo 账户并查询余额

import { Account, Network, Provable } from "@provablehq/sdk";

// 1. 创建一个新的 Aleo 账户
const account = await Account.create();

// 打印账户地址（公开展示的地址）
console.log("账户地址:", account.address);
// 输出类似: aleo1...（以 aleo1 开头的地址）

// 2. 导出私钥（务必安全存储！）
const privateKey = account.privateKey.toString();
console.log("私钥:", privateKey);

// 3. 用私钥恢复账户
const restored = Account.fromPrivateKey(privateKey);
console.log("恢复的地址:", restored.address);

// 4. 连接到 Aleo 网络并查询余额
const network = new Network("mainnet.aleo.org");

// 查询指定地址的未花费记录（余额）
const records = await network.records.queryByOwner(restored.address);
console.log("未花费记录数:", records.length);

// 5. 执行一笔隐私转账
// 先编译 Leo 合约
const program = await network.programs.compile(`
program demo.aleo;
record Credit {
    owner: address,
    amount: u64,
    marker: u8
};
transition transfer Credit to Credit {
    input.add u64 into amount;
}
`);

// 6. 部署合约到链上
const deployment = await network.programs.deploy(program);
console.log("合约部署成功，交易 ID:", deployment.transaction_id);
```

这段代码展示了 Provable SDK 的能力：
- 创建/恢复账户（不需要记忆种子短语，直接管理私钥）
- 查询链上记录（Aleo 用"记录"代替"账户余额"）
- 编译和部署 Leo 合约

## 五、Aleo 的技术架构

Aleo 的生态由几个核心组件构成：

| 组件 | 说明 |
|------|------|
| **Leo 语言** | 编写隐私智能合约的高级语言 |
| **snarkVM** | Aleo 的虚拟机，负责执行合约和生成证明 |
| **snarkOS** | Aleo 操作系统，管理节点、验证器和证明者 |
| **Provable SDK** | JavaScript/TypeScript SDK，用于前端开发 |
| **Aleo Explorer** | 区块浏览器，查看公开数据和交易 |
| **Aleo Shield** | 隐私钱包应用 |

## 六、应用场景

Aleo 的隐私设计特别适合以下场景：

1. **隐私支付** — 跨境支付、发薪，金额和双方身份都保密
2. **合规稳定币** — 稳定币转账默认隐私，但可向监管方选择性披露（USDCx 等）
3. **身份验证** — 证明自己"超过 18 岁"，无需暴露真实出生日期
4. **游戏** — 玩家的得分、资产持有情况保密，但游戏公平性可验证
5. **DeFi** — 链上交易的金额和方向隐私保护

## 七、学习资源

- Leo 语言官方文档：https://www.leo-lang.org/
- Aleo 开发者文档：https://developer.aleo.org/guides/introduction/getting_started
- Provable SDK GitHub：https://github.com/ProvableHQ/sdk
- Aleo Explorer：https://explorer.aleo.org
- Leo Playground（在线 IDE）：https://leo-lang.org

## 八、小结

Aleo 试图解决区块链领域一个长期矛盾：**透明度 vs 隐私**。比特币和以太坊选择了"完全透明"，Monero 选择了"完全隐私"，而 Aleo 走了一条中间路线——默认隐私 + 合规可验证。对于学习零知识证明的开发者来说，Leo 语言的直观性和 TypeScript SDK 的友好度，让这一前沿技术变得比以往更容易上手。
