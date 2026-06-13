---
title: StarkNet 零基础入门笔记
来源: https://github.com/starkware-libs/starknet-core
日期: 2026-06-13
分类: 区块链
子分类: blockchain-and-crypto
provenance: pipeline-v3
---

# StarkNet 零基础入门笔记

## 一、什么是 StarkNet？——从快递分拣中心说起

想象你住在一个小区（以太坊主网），每家快递到门口都要保安（矿工/验证者）逐一检查、登记，速度很慢、费用很高。

StarkNet 就像是这个小区外面建了一个大型快递分拣中心：

1. 所有包裹先进入分拣中心（链下批量处理）
2. 分拣员把成百上千个包裹打包、归类（执行交易）
3. 最后，分拣中心给整批包裹生成一张"总检查单"（零知识证明），证明"这批包裹全部合法"
4. 物业（以太坊）只需要验证这张总检查单，就默认整批包裹没问题

这就是 **Validity Rollup**（有效性质性滚动层）的核心思想：不逐一验证每笔交易，而是验证一个数学证明。

StarkNet 由以色列公司 **StarkWare** 开发，基于他们自研的 **STARK** 证明系统（Scalable Transparent Argument of Knowledge）。它通过数学而非算力来保证安全，因此：

- 手续费极低（比以太坊主网便宜 100-1000 倍）
- 吞吐量极高（每秒可处理数万笔交易）
- 安全性继承自以太坊（证明在以太坊上验证）

## 二、核心概念

### 2.1 Cairo 语言

StarkNet 的合约用 **Cairo** 语言编写。Cairo 是 StarkWare 专门为零知识证明设计的编程语言，它保证程序执行可以被转换成一个可验证的证明。

简单理解：普通语言写的代码，别人无法快速验证你是否真的跑过了；Cairo 写的代码，生成证明后，任何人看一眼证明就知道你确实跑了。

### 2.2 账户抽象（Account Abstraction）

在以太坊上，你的钱包是一个固定模式的账户。在 StarkNet 上，**你的账户本身就是一个智能合约**——这意味着：

- 可以设置多重签名
- 可以用面容/指纹登录（Passkey）
- 可以设置每日转账限额
- 可以由朋友代付手续费

所有这些，都不需要修改协议本身，写进账户合约就行。

### 2.3 STARK 证明

STARK 是 StarkNet 的安全基石。与比特币/以太坊依赖"算力竞赛"不同，STARK 依赖的是数学：

- 交易在链下执行
- 生成一个证明，证明"我的计算没错"
- 把证明提交到以太坊验证
- 验证通过，交易生效

### 2.4 STRK 代币

- **用途 1：** 支付交易手续费（gas fee）
- **用途 2：** 质押给验证者，参与网络安全
- **代币标准：** ERC-20 兼容（在以太坊上）

## 三、代码示例

### 示例 1：HelloStarknet 合约（Cairo）

这是 StarkNet 官方教程中的最小合约示例，用 Cairo 编写。它演示了 StarkNet 合约的基本结构。

```cairo
/// 合约接口定义
/// 这个接口定义了合约对外暴露的函数
#[starknet::interface]
pub trait IHelloStarknet<TContractState> {
    /// 增加合约余额
    fn increase_balance(ref self: TContractState, amount: felt252);
    /// 查询合约余额
    fn get_balance(self: @TContractState) -> felt252;
}

/// 合约实现
#[starknet::contract]
mod HelloStarknet {
    use core::starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};

    // 存储状态定义
    #[storage]
    struct Storage {
        balance: felt252,  // felt252 是 StarkNet 的基础数据类型（252位字段元素）
    }

    // 接口实现
    #[abi(embed_v0)]
    impl HelloStarknetImpl of super::IHelloStarknet<ContractState> {
        fn increase_balance(ref self: ContractState, amount: felt252) {
            assert(amount != 0, '金额不能为 0');
            // 读取当前余额 + 新增金额，写回存储
            self.balance.write(self.balance.read() + amount);
        }

        fn get_balance(self: @ContractState) -> felt252 {
            self.balance.read()  // 读取并返回余额
        }
    }
}
```

代码说明：

- `#[starknet::contract]`：标记这是一个 StarkNet 合约
- `#[starknet::interface]`：定义合约的公共接口
- `#[storage]`：声明合约的持久化状态
- `felt252`：StarkNet 的核心数据类型，代表一个 252 位的大整数
- `read()` / `write()`：读写链上存储的方法

### 示例 2：用 TypeScript SDK 部署合约

在链下，开发者使用 **Starkzap**（TypeScript SDK）与 StarkNet 交互。以下展示了连接钱包、发送交易的典型流程：

```typescript
// 安装依赖: npm install @starknet-io/types-js starknet

import { Account, Contract, RpcProvider, stark } from 'starknet';

// 步骤 1：连接到 StarkNet 节点（Sepolia 测试网）
const provider = new RpcProvider({
  nodeUrl: 'https://starknet-sepolia.public.blastapi.io',
});

// 步骤 2：创建账户实例（需要私钥或钱包连接器）
const account = new Account(provider, {
  address: '0xYOUR_ACCOUNT_ADDRESS',
  key: '0xYOUR_PRIVATE_KEY',
});

// 步骤 3：编译后的合约 ABI 和字节码
const abi = [
  {
    type: 'function',
    name: 'increase_balance',
    inputs: [{ name: 'amount', type: 'felt252' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'get_balance',
    inputs: [],
    outputs: [{ type: 'felt252' }],
  },
];

// 步骤 4：部署合约
const deployResult = await account.deploy(
  {
    contract: COMPILED_CONTRACT,  // 编译后的 Cairo 合约
    abi: abi,
  },
  {
    nonce: 0,  // 交易序号
    maxFee: 'auto',  // 自动估算手续费
  }
);

await deployResult.waitForExecution();
console.log('合约地址:', deployResult.contractAddress);

// 步骤 5：与合约交互 — 增加余额
const contract = new Contract(abi, deployResult.contractAddress, provider);
const tx = await contract.increase_balance({ amount: 100 }, { maxFee: 'auto' });
await tx.wait();
console.log('交易已上链！');

// 步骤 6：查询余额
const balance = await contract.get_balance();
console.log('当前余额:', balance.balance);
```

这个流程展示了 StarkNet 开发的标准路径：

1. 连接节点 → 2. 创建账户 → 3. 部署合约 → 4. 调用合约方法 → 5. 查询状态

## 四、StarkNet 与其他 Layer 2 对比

| 特性 | StarkNet | Optimism | Arbitrum |
|------|----------|----------|----------|
| 证明类型 | STARK（后量子安全） | Validium（欺诈证明） | Fraud Proof |
| 编程语言 | Cairo | Solidity | Solidity |
| 证明时间 | ~1 小时 | 7 天挑战期 | 7 天挑战期 |
| 账户模型 | 原生账户抽象 | 外部账户 | 外部账户 |

## 五、总结

StarkNet 的核心价值可以用一句话概括：**用数学证明代替逐一验证，在保持以太坊安全性的前提下实现无限扩展。**

对于学习者来说，建议按以下顺序深入：

1. 理解 Cairo 语言基础（[Cairo Book](https://book.cairo-lang.org/)）
2. 用 `Scarb`（Cairo 包管理器）创建第一个合约
3. 在 Sepolia 测试网部署
4. 学习 Starknet 的交易生命周期和 Fee 机制
