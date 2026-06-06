---
title: Argent X — 让账户本身就是一个合约的 Starknet 钱包
来源: 'https://github.com/argentlabs/argent-x'
日期: 2026-05-30
子分类: 链与合约
分类: 区块链
难度: 初级
provenance: pipeline-v3
---

## 是什么

Argent X 是 Argent Labs 出的 **Starknet 浏览器扩展钱包**，最大的差异点是：你在它里面建的每个"账户"，**本身就是一份部署在链上的智能合约**，而不是以太坊上那种"一对私钥就当账户用"。日常类比：MetaMask 像**一把私人钥匙**，钥匙丢了门就再也开不了；Argent X 更像**一台带门禁系统的保险柜**——你能设"备用持有人"（guardian）、"每天限额"、"两人同签"，钥匙丢了门禁系统还能让你换锁。

它装好之后看起来跟 MetaMask 没差——浏览器右上角弹窗、显示余额、签 dApp 请求。但**第一次往里面打钱**时你会发现：要先付一笔 gas 把"你的账户合约"部署上链，账户才真正存在。这就是和 EOA 钱包最大的体感区别。

源码 TypeScript 写，monorepo 三个包：`extension`（扩展本体）、`get-starknet`（让 dApp 连钱包的 npm 模块）、`dapp`（官方示例）。靠 [starknet.js](https://github.com/0xs34n/starknet.js) 做 RPC 调用与签名，Chrome / Firefox 都能装。

> 名词三件套：**Cairo 合约账户**（账户是 Cairo 语言写的合约）、**guardian**（社交恢复用的备用签名方）、**session key**（给 dapp 临时签名权的子钥匙）。

## 为什么重要

不理解 Argent X 在做什么，下面这些事说不清楚：

- 为什么 Starknet 一直被吹成"原生支持 account abstraction"——它把以太坊上要靠 EIP-4337 + bundler 才能凑出的能力，下沉到协议层
- 为什么"账户抽象"不是空话：Argent X 让普通用户**真正用上**多签、社交恢复、批量交易，而不只停留在白皮书
- 为什么以太坊钱包总在做"加复杂度"（[[metamask]] 加 Snap、[[rabby-wallet]] 加 Pre-sign 模拟），而 Argent X 把这些直接写进账户合约
- 为什么 2024 年起 Starknet 用户首选就是 Argent X 和 Braavos——两家都把 AA 当默认体验，新人感知不到"难"

## 核心要点

Argent X 能跑通的关键是 **三层结构**：

1. **协议层下沉的 AA**：Starknet 没有 EOA，**所有账户都是合约**。一笔交易由账户合约的 `__execute__` 入口发起，签名校验、nonce 管理、gas 抽象全都由合约自己实现。类比：以太坊是"先有钥匙再有门"，Starknet 是"先有保险柜再配钥匙"，门是可编程的。

2. **Argent 自家 Cairo account class**：Argent X 部署的不是任意合约，是 Argent 自审、社区验证过的固定 Cairo 类（class hash），里面写好了 owner / guardian / multisig 升级路径。类比：Argent 给你出厂一台"型号统一的保险柜"，安全审计可复用。

3. **前端通过 starknetkit 暴露 starknet.js 接口**：dApp 调用 `connect()` 拿到一个 starknet.js `Account` / `Provider`，签名时弹窗给用户确认。和以太坊 EIP-1193（`window.ethereum`）思路类似，但 RPC 走 Starknet sequencer / RPC node。

三层加起来，用户拿到的不是"私钥 + 余额"，而是**一台可编程的小型保险柜**——它能社交恢复、能批量调用、能给 dapp 颁发临时通行证。

## 实践案例

### 案例 1：第一次部署账户合约的"陷阱"

新人最常见踩坑场景。装好 Argent X、创建账户后看到一个 0x 开头的 64 位地址，跑去交易所提币：

```
1. 安装 Argent X 扩展，记下助记词
2. 点 "新建账户" → 看到地址 0x05ab...
3. 从 Starknet 桥接 0.01 ETH 到该地址（一定要走 bridge，不要从 L1 直接发）
4. Argent X 弹窗："您的账户尚未部署，下次发交易时将自动部署（需 ~0.0005 ETH gas）"
5. 第一次发任何 tx → 钱包先部署账户合约 → 再执行你的转账
```

**逐部分**：地址在第 2 步就有了，但**链上根本不存在这个合约**——它的地址是从 class hash + salt + 公钥**预计算**出来的（counterfactual deployment）。第 3 步打钱进去，地址链上余额会显示，但合约还没部署。第 5 步第一笔交易会触发部署 + 实际操作合并，gas 比单纯转账高 50%。**踩坑提醒**：余额 0 时无法部署，转钱进去前永远要确认 Starknet bridge 通到位。

### 案例 2：dapp 用 starknetkit 连钱包并发批量交易

这是 dapp 开发者视角。用 starknetkit 写一段连钱包代码：

```javascript
import { connect } from "starknetkit"

// 让用户选钱包（点按钮触发）
const starknet = await connect()
if (!starknet) throw Error("用户拒绝连接")

await starknet.enable()  // 触发 Argent X 弹窗

// 一笔 tx 里同时 approve + swap（multicall）
await starknet.account.execute([
  { contractAddress: usdc, entrypoint: "approve",
    calldata: [router, "1000000", "0"] },
  { contractAddress: router, entrypoint: "swap",
    calldata: [usdc, eth, "1000000"] },
])
```

**逐部分**：`execute` 接收的是**数组**，意思是"在一笔交易里按顺序调多个合约"——这是 EVM EOA 钱包做不到的（要拆两笔交易，gas 翻倍且中间有失败风险）。账户合约在 `__execute__` 里依次调用每个 call，全部成功才整体落账。这种"原生 multicall"是 Argent X 让 dapp 体验顺滑的关键。

### 案例 3：用 guardian 在主设备丢失后恢复

社交恢复是 Argent 的看家功能。流程示意：

```
正常时：
  Argent X 主账户：你的浏览器扩展（owner key）
  Guardian：你的 Argent Mobile App / 邮件 2FA 服务

主设备丢了：
  1. 在新机器装 Argent X，导入助记词 → 失败（私钥已被攻击者掌握）
  2. 不导助记词，走 "Recover wallet" 流程
  3. Argent 服务器要求 guardian 共签一笔 "change owner" 交易
  4. 你的手机收到 push → 确认
  5. 主账户的 owner key 改成新设备生成的私钥 → 攻击者旧私钥失效
```

**用法**：恢复用的不是密码学奇迹，**是合约里写死的"双签换 owner"逻辑**——guardian 共签一笔 change_owner，账户合约就接受新公钥。比起 EOA 钱包"丢钥即死"，这是**质的飞跃**。**踩坑**：guardian 自己也丢了就两难——所以 Argent 默认 guardian 是 Argent Mobile + 一个邮件备份服务，两条路同时坏的概率才足够低。

## 踩过的坑

1. **把 Argent X 当 MetaMask 装好就开始转账**：账户合约第一次发 tx 前**没部署**，余额 0 时无法部署。新人提币到地址、然后转账失败、以为钱丢了——其实只是没付部署 gas。永远先确认有少量 ETH 才去用。
2. **跨链地址混淆**：Starknet 地址是 0x + 64 hex，长得像以太坊地址但**互不通用**。把 ETH 从交易所**直接**发到 Argent X 的 Starknet 地址（走 L1 网络）= 钱进黑洞。**必须走官方 bridge**（StarkGate / Orbiter）。
3. **session key 当永久授权**：dApp 申请 session key 是为了让你之后不必每次签名（限定时间 / 限定方法）；很多人忘记 revoke，相当于给 dApp 留了一道侧门。建议每周清一次 session 列表。
4. **guardian 选错或忘记是谁**：guardian 是恢复时的"另一把钥匙"——选了陌生服务、对方关停或自己忘记，恢复就废。Argent 默认绑定 Argent Mobile + 邮件，**自己再记一份**最稳。

## 适用 vs 不适用场景

**适用**：

- 想体验 account abstraction 又不想自己搭 ERC-4337 bundler 的人——Argent X 是最低门槛入口
- Starknet dApp 用户（DeFi / 游戏 / NFT），与 [[walletconnect]] / starknetkit 生态打通顺畅
- 重视"丢私钥不等于丢资产"的用户——社交恢复是 EOA 钱包给不了的
- 开发者想测 multicall / session key 等 AA 模式——Argent X 暴露 starknet.js 完整接口，可配 [[hardhat]] / [[foundry]] 风格的本地 devnet 测

**不适用**：

- 只用以太坊主网或 L1 EVM 链（Polygon / Arbitrum / Optimism）→ Argent X 不支持，要装 [[metamask]] 或 [[rabby-wallet]]
- 比特币 / Solana / Cosmos 等非 EVM 非 Starknet 生态 → 必须换钱包，[[bitcoin-core]] 这种节点也无关
- 极致安全场景（千万级资产）→ 仍建议硬件钱包配套；Argent X 支持 Ledger 但仍是浏览器扩展，攻击面比纯硬件大
- 服务器自动化交易 → 浏览器扩展没 headless，自动化要走 starknet.js + [[ape-framework]] 风格 SDK 直接签，不通过 Argent X

## 历史小故事（可跳过）

- **2018 年**：Argent Labs 创立，做 Argent Mobile——一个以太坊上的智能合约钱包 App，把"账户是合约"理念早于 ERC-4337 标准做成产品。
- **2020-2021 年**：Argent Mobile 在以太坊上摸出社交恢复 + meta-transaction 模式，但受限于 EVM gas 高 / 部署成本高，体验仍重。
- **2022 年**：Starknet alpha 主网上线，协议层原生支持 AA（账户都是合约），Argent Labs 把同一套思路平移到 Starknet，发布 Argent X 浏览器扩展。
- **2023 年**：starknetkit 库发布，统一 Argent X / Braavos 的 dApp 连接接口，Starknet 生态整体启动。
- **2024 年**：Starknet 主网放量、空投预期推高用户数，Argent X 和 Braavos 并列成 Starknet 钱包入口；Argent Mobile 也开始支持 Starknet 账户。
- **2025 年**：Argent 在 [[zk-snark]] 类 zkRollup 生态里继续做"账户即合约"标准制定者，账户类升级路径透明、社区可审。

## 学到什么

- **AA 不是新协议、是体验视角**——同样的"多签 / 社交恢复 / 批量交易"，在以太坊上要靠 EIP-4337 多层堆叠，在 Starknet 上协议直接给；用户感受才是终点
- **账户是合约带来的不是更复杂、是更可编程**——升级路径、guardian、session key、限额都能写进合约，这才是钱包能做差异化的地方
- **协议层选择决定钱包形态**——以太坊主网长期 EOA 主导，钱包只能在弹窗 UI 上卷（[[rabby-wallet]] 那条路）；Starknet 协议给了空间，Argent X 能在"账户能力"上卷
- **预计算地址 + 延迟部署**是 AA 钱包的关键技巧——地址链下能算出来，部署费可以推迟到第一次用，新用户体验更顺

## 延伸阅读

- 官方站：[Argent X 官网](https://www.argent.xyz/argent-x)（下载链接 + 功能介绍）
- GitHub：[argentlabs/argent-x](https://github.com/argentlabs/argent-x)（monorepo + 三个 package + 示例 dApp）
- starknetkit：[argentlabs/starknetkit](https://github.com/argentlabs/starknetkit)（dApp 接钱包的统一库）
- starknet.js：[0xs34n/starknet.js](https://github.com/0xs34n/starknet.js)（底层 RPC + 签名库，类似以太坊的 ethers.js）
- 协议视角：[Starknet 文档 — Account Abstraction](https://docs.starknet.io/architecture-and-concepts/accounts/introduction/)（理解为什么协议层就支持 AA）
- 视频：[Argent — How AA Wallet Works](https://www.youtube.com/results?search_query=argent+account+abstraction)（多个社区讲座）

## 关联

- [[metamask]] —— 以太坊主网最大的 EOA 钱包，Argent X 的对照组（EOA vs 合约账户）
- [[rabby-wallet]] —— 同样在 EVM 上做"安全性升级"，但只能在 UI 层卷，对比能看出协议层 AA 的价值
- [[walletconnect]] —— 移动端 dApp 连钱包的协议，Argent Mobile 也支持
- [[hardhat]] —— EVM 合约开发框架，与 Argent X 不在同生态但是开发者熟悉的对照
- [[foundry]] —— 同上，对应 Starknet 生态会用 starkli / scarb / [[ape-framework]] 类工具
- [[bitcoin-core]] —— Argent X 不支持比特币，写在这里是为了划清生态边界
- [[zk-snark]] —— Starknet 是 ZK Rollup，Argent X 间接受益于 ZK 的低成本

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[ape-framework]] —— Ape Framework — Python 智能合约开发一条龙
- [[bitcoin-core]] —— Bitcoin Core — 比特币参考实现
- [[cairo-lang]] —— Cairo — Starknet 的 zk 友好编程语言
- [[foundry]] —— Foundry — Paradigm 出品的 Rust 合约工具链
- [[hardhat]] —— Hardhat — Nomic Foundation 的 JS 合约框架
- [[ledger-app-sdk]] —— Ledger App SDK — 在硬件钱包里写应用的 C 框架
- [[metamask]] —— MetaMask — 装在浏览器里的以太坊钱包
- [[optimism]] —— Optimism — 以太坊 L2 旗舰栈，把交易搬到便宜车道再回主网结算
- [[rabby-wallet]] —— Rabby Wallet — 签名前先告诉你"会变成什么样"的 EVM 钱包
- [[safe-contracts]] —— Safe — 多签智能账户合约
- [[thirdweb-sdk]] —— thirdweb SDK — 一站式 Web3 全家桶
- [[walletconnect]] —— WalletConnect — dApp 与钱包之间的加密对讲机
- [[zk-snark]] —— zk-SNARK 零知识证明
- [[zksync-era]] —— zkSync Era — Matter Labs 的 zkEVM L2

