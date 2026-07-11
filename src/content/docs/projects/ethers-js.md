---
title: ethers.js — 浏览器和 Node 都能用的以太坊客户端库
来源: 'https://github.com/ethers-io/ethers.js'
日期: 2026-05-30
分类: blockchain
难度: 初级
---

## 是什么

ethers.js 是一个**让 JavaScript 代码跟以太坊网络说话**的库。日常类比：像一座**翻译亭**——你说"查一下这个地址多少钱"，它把你的话翻成区块链节点能听懂的 JSON-RPC 协议；节点回一串 16 进制乱码，它再翻回成普通 JS 数字给你。

它把所有跟链的交互整理成 **三层抽象**：

```js
import { ethers } from "ethers";

const provider = new ethers.JsonRpcProvider("https://mainnet.infura.io/v3/<key>");
const wallet = new ethers.Wallet(privateKey, provider);
const contract = new ethers.Contract(address, abi, wallet);
```

- **Provider**：只读连接——查余额、读区块、看合约状态
- **Signer**（Wallet 是它的一种）：拿着私钥，能**签名**和**发交易**
- **Contract**：把合约 ABI 包成普通对象，调方法就像调本地函数

v6 版本（2023+）全面 ESM-first、原生 TypeScript 类型、用 JS 内置 BigInt 替换了老 BigNumber，~144KB 压缩 bundle，是 DApp 前端事实标准之一。

## 为什么重要

不理解 ethers.js，下面这些事都没法解释：

- 为什么 React/Vue DApp 教程几乎一开头都是 `import { ethers } from "ethers"`
- 为什么写"签名"和"读链"要分两个对象（Signer vs Provider）——这是安全模型，不是 API 设计意外
- 为什么 ETH 余额永远是个一长串数字——单位是 wei，1 ETH = 10^18 wei，必须 formatEther 才能展示
- 为什么 v5 老教程抄到 v6 项目就报"BigNumber is not exported"——v6 是破坏性重写

## 核心要点

ethers.js 的核心可以拆成 **三层 + 一个编码器**：

1. **Provider — 链的只读窗口**：抽象 JSON-RPC（HTTP / WebSocket / 注入的 window.ethereum）。类比：图书馆查询机，能看任何书但不能写。常用 `JsonRpcProvider` / `BrowserProvider`（包浏览器钱包）。

2. **Signer — 能签字的笔**：持有私钥（或委托给硬件钱包），调用链时把交易用 secp256k1 算法签名。`Wallet` 是带本地私钥的 Signer；MetaMask 注入的是无密钥 Signer（签名时弹窗）。私钥**不能**离开客户端这一原则，由这层守住。

3. **Contract — 把 ABI 翻成对象**：你给它合约地址 + ABI（JSON 或 Human-Readable 字符串），它返回一个对象，合约里每个方法都成了 JS 方法。背后帮你做 calldata 编码、返回值解码、事件监听。

4. **utils — 单位换算和编码工具**：`parseEther("1.0")`、`formatEther(wei)`、`keccak256(data)`、`hexlify(bytes)`。v6 里大部分工具被拍平到顶层 `ethers.*`。

## 实践案例

### 案例 1：Provider 查地址余额 + ENS 反查

```js
import { ethers } from "ethers";

const provider = new ethers.JsonRpcProvider("https://eth.llamarpc.com");

const balanceWei = await provider.getBalance("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045");
console.log(ethers.formatEther(balanceWei), "ETH");   // "1234.56 ETH"

const ensName = await provider.lookupAddress("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045");
console.log(ensName);   // "vitalik.eth"
```

只读用 Provider，不需要私钥。`formatEther` 把 wei 换算成人类可读的 ETH 字符串。ENS 反查（地址 → 名字）由 Provider 内置支持。

### 案例 2：Wallet 发原生 ETH 转账

```js
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

const tx = await wallet.sendTransaction({
  to: "0xRecipient...",
  value: ethers.parseEther("0.01")
});
console.log("tx hash:", tx.hash);

const receipt = await tx.wait(1);   // 等 1 个确认
console.log("mined in block", receipt.blockNumber);
```

`Wallet` 拿到私钥就能签名。`sendTransaction` 返回一个**未确认**的 tx 对象；`tx.wait(n)` 阻塞到链上有 n 个确认才返回 receipt。主网重要操作建议等 ≥6 个确认。

### 案例 3：Contract 调 ERC20 余额查询

```js
const erc20Abi = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function transfer(address to, uint256 amount) returns (bool)"
];

const usdc = new ethers.Contract(
  "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",   // USDC
  erc20Abi,
  provider
);

const decimals = await usdc.decimals();
const raw = await usdc.balanceOf(wallet.address);
console.log(ethers.formatUnits(raw, decimals), "USDC");
```

**Human-Readable ABI**——直接写 Solidity 函数签名字符串，不用塞整个 JSON。`view` 函数走 Provider 不花 gas；要 `transfer` 时把第三参换成 `wallet`（Signer）就能写链。

## 踩过的坑

1. **v5 → v6 破坏性改名**：`BigNumber` 没了，改用原生 `bigint`；`ethers.utils.parseEther` 变成 `ethers.parseEther`；`providers.JsonRpcProvider` 变成 `JsonRpcProvider`。网上一半教程是 v5 的，照抄会报"is not a function"。

2. **getDefaultProvider 共享 key 限流**：`ethers.getDefaultProvider("mainnet")` 用社区共享的 Infura/Alchemy key，被全网共用，限流极严。生产环境必须自己注册 key 用 `new JsonRpcProvider(url)`。

3. **不 `await tx.wait()` 就读后续状态**：发完交易立刻去查"转账后余额"，会读到没扣钱的旧值——交易还没上链。所有依赖交易结果的读操作必须等 `wait(n)`。

4. **wei 单位忘记换算**：`balanceOf()` 返回的是最小单位（USDC 是 6 位小数，ETH 是 18 位）。直接 `Number(raw)` 当美元用，会把 1.5 USDC 显示成 1500000。一律配 `formatUnits(raw, decimals)`。

## 适用 vs 不适用场景

**适用**：

- 浏览器 DApp 前端——MetaMask 注入 + 合约调用的标准搭档
- Node 脚本/CLI——批量发交易、监控合约事件、机器人
- 测试环境——配 anvil/Hardhat 本地节点跑端到端
- 需要 TypeScript 类型——v6 内置完整 .d.ts，IDE 提示丝滑

**不适用**：

- 极致 bundle 敏感（小程序内嵌 H5）→ 用 viem，tree-shake 后核心 ~30KB
- 需要"类型从 ABI 自动推导"→ viem + abitype 类型推断比 ethers 更深
- Solana / Aptos / Sui 链 → ethers 只支持 EVM 兼容链，其他链各有官方 SDK
- 后端高 QPS 节点服务 → 直接用 `axios` + JSON-RPC 更轻，不必 ethers 抽象

## 历史小故事（可跳过）

- **2016**：ricmoo 启动 ethers，目标"比 web3.js 更轻、类型更友好、ESM 友好"
- **2019**：v5 GA，CommonJS + 自带 BN.js BigNumber，逐渐成为 DApp 前端事实标准
- **2023**：v6 发布，全面 ESM-first、用原生 BigInt 替换 BigNumber、TypeScript 重写
- **2024**：viem 崛起，ethers 失去"唯一选择"地位但靠生态惯性继续主流
- **2025–2026**：v6.x 持续维护（如 6.17），npm 周下载进入百万级，与 viem 并立两强

## 学到什么

1. **Provider / Signer 分离 = 安全模型不是 API 装饰**——只读不暴露私钥，签名时才组合，权限边界由对象类型守住
2. **ABI 是合约的"翻译字典"**——同一个地址 + 同一个 ABI = 同一份接口；ABI 是真相，源码可丢
3. **Human-Readable ABI 是绝佳 DX**——把 Solidity 函数签名当字符串写，比塞 JSON 直观 10 倍
4. **大版本破坏性改名很贵**——v5 → v6 的迁移痛拉了两年，教程生态至今没追上

## 延伸阅读

- 官方文档：[docs.ethers.org/v6](https://docs.ethers.org/v6/)（v6 完整 API + 迁移指南）
- 视频：[Patrick Collins — ethers.js Crash Course](https://www.youtube.com/c/patrickcollins)（DApp 前端经典视频，从零讲到实战）
- 对比文章：[viem vs ethers.js](https://viem.sh/docs/comparisons.html)（viem 团队视角的差异）
- [[hardhat]] —— 本地开发 + ethers 测试合约的最常组合
- [[metamask]] —— 浏览器钱包，ethers 用 BrowserProvider 接它

## 关联

- [[hardhat]] —— Solidity 开发框架，原生集成 ethers 做单测和脚本
- [[foundry]] —— Rust 写的 Solidity 工具链，cast/forge 跟 ethers 是不同语言里的同类
- [[metamask]] —— 浏览器钱包，window.ethereum 注入后 ethers 用 BrowserProvider 包它
- [[uniswap-v3]] —— 经典合约调用案例，ethers 是前端调 Pool/Router 的标准方式
- [[aave-v3]] —— 借贷协议合约，前端用 ethers 读利率发交易
- [[safe-contracts]] —— 多签钱包合约，需要 ethers 做交易签名和组合
- [[axios]] —— 同样是 transport 层抽象，ethers 是 EVM 链的"axios"

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[aragon]] —— Aragon OSx — 一份内核合约管所有 DAO 的乐高套件
- [[lodestar]] —— Lodestar — JS/TS 生态里的以太坊共识层客户端
- [[openzeppelin-contracts]] —— OpenZeppelin Contracts — 以太坊智能合约的事实标准库
- [[snapshot]] —— Snapshot — DAO 不花 Gas 也能投票的链下治理前端
- [[thirdweb-sdk]] —— thirdweb SDK — 一站式 Web3 全家桶
- [[viem]] —— viem — 现代 TypeScript EVM 库
- [[web3-js]] —— web3.js — 老牌 EVM JavaScript 客户端库
