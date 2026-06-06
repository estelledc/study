---
title: Safe — 多签智能账户合约
来源: 'https://github.com/safe-global/safe-smart-account'
日期: 2026-05-30
子分类: 链与合约
分类: 区块链
难度: 中级
provenance: pipeline-v3
---

## 是什么

Safe（前 Gnosis Safe）是以太坊上**部署最广**的智能合约多签钱包。一句话定义：把"一把私钥控全部资产"换成**"N 个 owner、必须收齐 M 个签名才放行"**的可编程账户。日常类比：普通钱包像**一个保险箱配一把钥匙**，钥匙丢了或主人冲动按下"全部转出"就完蛋；Safe 像**银行金库的双钥匙制度**——必须有 3 位董事同时插钥匙转动，门才会开，而且这套规则可以按需扩展（加临时陪审员、加每日限额、加事后回放摄像头）。

它本身不是一个钱包应用，而是一组 **Solidity 合约**：一份 `Safe.sol` 单例（singleton）+ 给每个用户用 CREATE2 部署的轻量 Proxy。Proxy 通过 `delegatecall` 把所有调用转发给 singleton，自己只存数据：owner 链表、threshold、nonce、modules、guard。这就让"开一个新多签"在链上极便宜（≈ 几万 gas），又能让所有 Safe 共享同一份审计过的逻辑代码。

> 名词四件套：**owner**（持签名权的地址）、**threshold**（需要凑齐的签名数 M）、**module**（可以绕过 threshold 直接发交易的扩展）、**guard**（每笔交易的事前/事后钩子）。

## 为什么重要

不理解 Safe 在做什么，下面这些事都说不清楚：

- 为什么 DAO 国库、做市商、机构托管几乎默认上 Safe——它把"门限授权"做成了基础设施级标准
- 为什么 ERC-4337 账户抽象出来后 Safe 还活得好好的——module 机制比 EntryPoint 更早实现"可编程账户"，且兼容
- 为什么"多签被盗"新闻很少是合约 bug、多是配置错误——理解 owner / threshold / module 才能看懂事故复盘
- 为什么链上调用一笔 Safe 交易要走 `execTransaction(...)` 加一串签名拼接——这是它和普通 EOA 转账最大的区别

## 核心要点

Safe 跑通的关键是 **三件套**：

1. **Owner + Threshold 的门限校验**：执行任何操作前，合约要把交易内容打成 EIP-712 typedDataHash，逐个比对外部签名，凑齐 M 个有效 owner 签名才往下走。类比：金库门有 N 把锁，必须 M 把同时拧到位；少一把就停。

2. **Singleton + Proxy 复用一份逻辑**：所有 Safe 实例都是 Proxy，`delegatecall` 跳进同一份 Singleton，自己只存数据。类比：城里所有银行金库都用同一份"金库操作手册"，但各家自己保管账本——升级手册可以切到新版本，账本不动。

3. **Module 与 Guard 两条扩展轴**：module 是**事前授权的旁路**（绕过 threshold 直接调 `execTransactionFromModule`，做社交恢复、限额、ERC-4337 入口）；guard 是**强制钩子**（pre/post 检查每笔 execTransaction，做白名单、合规扫描）。类比：module 是"院长发的免检卡"，guard 是"出门前必经的安检台"。

三件套合在一起，Safe 不只是多签——它是一个**可编程的合约账户基座**，DAO 国库到企业财务都能套这一层。

## 实践案例

### 案例 1：3/5 DAO 国库一笔提案上链

最常见的场景。DAO 5 名核心成员各持一个 owner 地址，规则 3/5。提案前端的伪流程：

```javascript
// 1. 拼出要执行的内部调用
const tx = {
  to: usdc, value: 0, data: erc20.transfer(grantee, "100000000"),
  operation: 0, safeTxGas: 0, baseGas: 0, gasPrice: 0,
  gasToken: ZERO_ADDRESS, refundReceiver: ZERO_ADDRESS,
  nonce: await safe.nonce(),
}

// 2. 链下用 EIP-712 签名（每个 owner 在 Safe 前端钱包里签）
const txHash = await safe.getTransactionHash(...Object.values(tx))
const sigs = await collectSignatures(txHash, owners) // owner 地址升序拼接

// 3. 凑齐 3 个签名后任何人都能上链 execTransaction
await safe.execTransaction(...Object.values(tx), sigs)
```

**逐部分**：第 2 步签名收集是**链下完成的**，不耗 gas；第 3 步任何路人都能把签名拼起来上链，gas 由提交者付。`sigs` 必须按 **owner 地址升序**拼接成 `r1 s1 v1 r2 s2 v2 ...`，乱序会让 `checkSignatures` revert。这就是 Safe 高效的关键：链下协调、链上一次落账。

### 案例 2：用 Allowance Module 给运营子账户开日限额

DAO 主多签管的是大额拨款，每天给运营 1k USDC 这种小钱不想三人凑签。装 [Allowance Module](https://github.com/safe-global/safe-modules)：

```solidity
// 主 Safe 一次性配置（仍需 3/5 签名）
allowance.setAllowance(
  delegate: opsAddr,    // 子账户
  token:    usdc,
  amount:   1_000e6,    // 每日 1k USDC
  resetTimeMin: 1440,   // 每 24h 自动重置
  resetBaseMin: 0
)

// 之后 opsAddr 自己直接调 module，绕过 3/5
allowance.executeAllowanceTransfer(safe, usdc, recipient, 500e6, ...)
```

**逐部分**：`enableModule` 把 module 写进 Safe 的 modules 链表后，`execTransactionFromModule` 是**绕过 threshold 的快速通道**——module 自己负责权限判断（这里是按日限额）。**风险**：module 等于第二把万能钥匙，必须只装审过的官方 module，自己写的要严审。

### 案例 3：counterfactual 部署省 gas

Safe 用 CREATE2 + 公式让你**先算出地址**再决定何时部署：

```javascript
import { calculateProxyAddress } from "@safe-global/protocol-kit"

const predictedAddr = await calculateProxyAddress({
  factory:    safeProxyFactory,
  singleton:  safeL2Singleton,
  initializer: setupCalldata,  // owners + threshold 全部塞 setup 参数
  saltNonce:  "0x42"
})
// 此地址链上还不存在，但已经能收钱
// 第一次需要发交易时再 createProxyWithNonce 部署
```

**逐部分**：地址由 `keccak256(proxyFactory ++ saltNonce ++ initCode)` 决定，参数固定结果就固定。资金可以先打进这个**还不存在的地址**，等真要动钱时一笔交易里同时完成 deploy + execute，gas 比"先部署再转账"省一半。这是 Safe 为大批量场景（空投托管、Vesting）准备的省钱秘籍。

## 踩过的坑

1. **threshold = 1 等于退化成 EOA**：新人配 Safe 图省事写成 1/3，所有"多签"承诺立刻失效，单点失败照样存在。生产环境必须 ≥ 2，且 ≥ ceil(N/2) 才有意义。
2. **module 当后门偷资产**：启用 module 后该 module 拥有 `execTransactionFromModule` 权限相当于无限额钥匙；2022 年某 DAO 装了未审计的 module 被直接清空。审计严格才能 enable。
3. **签名顺序错导致 revert**：`checkSignatures` 用线性扫描 + 地址递增校验，乱序拼接当场 revert。前端必须按 owner 地址升序排序，调试不熟容易反复浪费 gas。
4. **fallbackHandler 写错覆盖 owner**：自定义 fallbackHandler 时若 storage slot 算错，写进去的数据会**叠到 owners 链表上**直接清空多签，资金对外裸奔。改 handler 必须先在 testnet 跑 storage layout 验证。

## 适用 vs 不适用场景

**适用**：

- DAO 国库 / 做市商热钱包 / 项目方 vesting 合约——需要门限授权 + 可审计执行的场景
- 想做"社交恢复 / 限额子账户 / 白名单合规"的钱包产品——直接装 module / guard 就行，[[argent-x]] 那条路是另一种实现
- ERC-4337 账户抽象的过渡方案——Safe + 4337 Module 让现有多签直接接入 EntryPoint
- 与 [[hardhat]] / [[foundry]] / [[ape-framework]] 集成做端到端测试——SDK 完善

**不适用**：

- 单人小额日常用——开 Safe 部署费 + 每笔 gas 比 EOA 高，[[metamask]] 类 EOA 钱包更顺
- 需要原生协议级 AA 的链——Starknet / zkSync 协议层就支持账户合约，[[argent-x]] 形态更直接
- 极致低延迟链上交易（高频 MM）——多签 + EIP-712 校验额外 gas 在敏感场景吃不消
- 非 EVM 链（[[bitcoin-core]] / Solana / Cosmos）——Safe 是 EVM 专属，对应链有各自方案

## 历史小故事（可跳过）

- **2017 年**：Gnosis 团队上线 **Gnosis MultiSig 1.0**，纯 owners + threshold 的多签合约，DAO 大火后被广泛 fork。
- **2018 年**：**Gnosis Safe** 发布，引入 Singleton + Proxy + Module + Guard 抽象，把多签升级为"可编程账户基座"。
- **2020-2021 年**：DeFi summer + DAO 兴起，Safe 成 DAO 国库与机构热钱包默认选择，托管数十亿美金。
- **2022 年**：项目从 Gnosis 独立运营，更名 **Safe**（safe.global），开放 SafeDAO 治理，去掉 Gnosis 商标。
- **2023 年**：增设 **4337 Module**，现有 Safe 实例可直接接入 ERC-4337 EntryPoint，兼容账户抽象基础设施（[[besu]] 之类节点都能跑）。
- **2024-2025 年**：Safe 成事实标准——OP Stack / Arbitrum 等大量 L2 默认部署同一份 Singleton，跨链同地址同合约。

## 学到什么

- **门限授权是合约层的"权力分立"**——把"谁能签"和"凑几个才生效"分开存，组织治理就能直接编码
- **Singleton + Proxy 模式是合约复用的标杆**——所有 Safe 共享同一份审计过的逻辑，单点修复全网受益
- **module 是双刃剑**——它带来扩展性也带来攻击面，"装哪个 module"等于"开哪扇门"，比 threshold 更要命
- **counterfactual 部署是 AA 的省钱秘籍**——预算地址 + 延后部署，让大批量托管场景成本降一半

## 延伸阅读

- 官方站：[safe.global](https://safe.global/) 与 [docs.safe.global](https://docs.safe.global/)
- GitHub：[safe-global/safe-smart-account](https://github.com/safe-global/safe-smart-account)（合约源码）
- 模块仓：[safe-global/safe-modules](https://github.com/safe-global/safe-modules)（Allowance / Recovery / 4337）
- 协议解读：[Smart Account Overview](https://docs.safe.global/advanced/smart-account-overview)
- ERC-4337：[Safe + 4337 Module 集成指南](https://docs.safe.global/home/4337-overview)
- 视频：[What is a Smart Contract Wallet — Safe explainer](https://www.youtube.com/results?search_query=safe+smart+contract+wallet)

## 关联

- [[argent-x]] —— 同样是合约账户，但在 Starknet 上协议原生支持，对照可看"协议层 AA vs 应用层多签"
- [[metamask]] —— 主流 EOA 钱包，Safe 经常作为 MetaMask 之上的第二层（owner 用 MetaMask 签，门限在 Safe）
- [[walletconnect]] —— Safe 前端通过它接 dApp，不直接管 RPC
- [[hardhat]] —— 测试 Safe 与自定义 module / guard 的常用框架
- [[foundry]] —— 同样常用于 Safe 合约开发与 fuzz 测试
- [[ape-framework]] —— Python 系合约测试框架，Safe 集成测试可选
- [[besu]] —— 企业 EVM 节点，常作为机构跑 Safe 的私链或测试网

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[anchor]] —— Anchor — Solana 合约开发框架
- [[ape-framework]] —— Ape Framework — Python 智能合约开发一条龙
- [[aragon]] —— Aragon OSx — 一份内核合约管所有 DAO 的乐高套件
- [[arbitrum]] —— Arbitrum Nitro — Offchain Labs 的 Optimistic Rollup 客户端
- [[argent-x]] —— Argent X — 让账户本身就是一个合约的 Starknet 钱包
- [[axelar]] —— Axelar — 通用跨链 gateway
- [[balancer]] —— Balancer V2 — 通用 AMM 与权重池
- [[besu]] —— Hyperledger Besu — 用 Java 写的以太坊客户端
- [[bitcoin-core]] —— Bitcoin Core — 比特币参考实现
- [[curve]] —— Curve — 稳定币低滑点兑换协议
- [[ethers-js]] —— ethers.js — 浏览器和 Node 都能用的以太坊客户端库
- [[foundry]] —— Foundry — Paradigm 出品的 Rust 合约工具链
- [[hardhat]] —— Hardhat — Nomic Foundation 的 JS 合约框架
- [[ledger-app-sdk]] —— Ledger App SDK — 在硬件钱包里写应用的 C 框架
- [[makerdao]] —— MakerDAO — 用抵押 ETH 铸出锚定美元的 DAI
- [[metamask]] —— MetaMask — 装在浏览器里的以太坊钱包
- [[openzeppelin-contracts]] —— OpenZeppelin Contracts — 以太坊智能合约的事实标准库
- [[optimism]] —— Optimism — 以太坊 L2 旗舰栈，把交易搬到便宜车道再回主网结算
- [[snapshot]] —— Snapshot — DAO 不花 Gas 也能投票的链下治理前端
- [[thirdweb-sdk]] —— thirdweb SDK — 一站式 Web3 全家桶
- [[walletconnect]] —— WalletConnect — dApp 与钱包之间的加密对讲机

