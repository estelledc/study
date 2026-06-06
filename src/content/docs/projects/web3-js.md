---
title: web3.js — 老牌 EVM JavaScript 客户端库
来源: 'https://github.com/web3/web3.js'
日期: 2026-05-30
子分类: 链与合约
分类: 区块链
难度: 初级
provenance: pipeline-v3
---

## 是什么

web3.js 是**最早一批**让 JavaScript 跟以太坊节点说话的库，由以太坊基金会孵化、后由 ChainSafe 接手维护。日常类比：像一个**话务总机**——你说"给我接 0x1234... 这个地址的余额"，它把你的话翻成 JSON-RPC 协议发去节点，再把节点回来的 16 进制串翻成普通 JS 数据。

它把所有交互聚合到**一个 `Web3` 主入口**，下面挂一堆模块：

```js
import Web3 from "web3";

const web3 = new Web3("https://eth.llamarpc.com");
const balance = await web3.eth.getBalance("0xd8dA...96045");
console.log(web3.utils.fromWei(balance, "ether"), "ETH");
```

v4 版本（2023+）由 ChainSafe 完全用 TypeScript 重写，废掉自家 BN.js 改用原生 bigint，并加入 plugin 系统让第三方在 `web3.<plugin>.xxx` 命名空间下扩展。**仓库于 2025-03 archived**，停止活跃开发，但仍是历史最大教程语料库的来源。

## 为什么重要

不理解 web3.js，下面这些事都没法解释：

- 为什么 2017-2022 几乎所有 DApp 教程开头都是 `const web3 = new Web3(...)`——它当时是事实唯一选项
- 为什么很多老 DApp 代码用 `.methods.foo().call()` 这种链式调用——这是 web3.js 的合约 API 风格
- 为什么 wei / gwei / ether 的单位换算名字这么奇怪——这套命名就是 web3.utils 定义并扩散到全行业的
- 为什么新项目都迁向 ethers / viem——v4 archived 后只剩维护模式，bundle 体积也比新库大

## 核心要点

web3.js v4 可以拆成 **一个主类 + 五个模块 + 一个 plugin 钩子**：

1. **`Web3` 主类——总机入口**：`new Web3(provider)` 一次实例化挂上所有子模块。类比：万能遥控器，电视空调音响一个按钮分开按。这是跟 ethers.js 最大的风格差异——ethers 让你显式 `new JsonRpcProvider / Wallet / Contract` 三件套各管各的。

2. **`web3.eth`——读链 + 发交易**：`getBalance / getBlock / sendTransaction / Contract`。Contract 实例用 `.methods.foo(arg).call()`（只读）和 `.methods.foo(arg).send({ from })`（写）的链式风格，不是 ethers 的"合约方法当 JS 方法"。

3. **`web3.eth.accounts`——本地签名**：`accounts.create()` 生成密钥对、`accounts.signTransaction(tx, pk)` 离线签 + `eth.sendSignedTransaction(rawTx)` 广播。私钥不离开客户端这一原则跟 ethers 一致。

4. **`web3.utils`——单位 + 编码工具**：`fromWei / toWei / sha3 / hexToNumber / isAddress`。这层 API 命名最先定型，整个 EVM JS 生态后续都跟着叫。

5. **`web3.providers` + plugin 系统**：v4 新增 `web3.registerPlugin(new MyPlugin())`，插件能在 web3 实例上挂自定义命名空间（如 `web3.zksync.xxx`），让链特定扩展不污染核心包。ethers 里没有等价机制，扩展靠 ESM 模块拼装。

## 实践案例

### 案例 1：查地址余额 + wei 换算

```js
import Web3 from "web3";

const web3 = new Web3("https://eth.llamarpc.com");

const wei = await web3.eth.getBalance("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045");
console.log(wei);                                 // 1234567890000000000n  (bigint)
console.log(web3.utils.fromWei(wei, "ether"));    // "1.23456789"
```

注意 v4 返回的是 `bigint`（v1 是字符串），`fromWei` 接收 string/number/bigint 都行，把 18 位小数换算成人类可读字符串。这步对应 ethers 里的 `provider.getBalance + formatEther`。

### 案例 2：调 ERC20 合约只读方法

```js
const erc20Abi = [
  { name: "balanceOf", type: "function", stateMutability: "view",
    inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { name: "decimals", type: "function", stateMutability: "view",
    inputs: [], outputs: [{ type: "uint8" }] }
];

const usdc = new web3.eth.Contract(erc20Abi, "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");

const decimals = await usdc.methods.decimals().call();
const raw = await usdc.methods.balanceOf("0xd8dA...96045").call();
console.log(Number(raw) / 10 ** Number(decimals), "USDC");
```

`.methods.foo(args).call()` 是 web3.js 的招牌写法——`methods` 是合约方法的命名空间，`.call()` 表示只读不发交易。如果要写链就换 `.send({ from: addr })`。这跟 ethers 的 `usdc.balanceOf(addr)` 一行直调风格差别明显。

### 案例 3：本地签名后广播交易

```js
const account = web3.eth.accounts.privateKeyToAccount(process.env.PRIVATE_KEY);

const signed = await account.signTransaction({
  to: "0xRecipient...",
  value: web3.utils.toWei("0.01", "ether"),
  gas: 21000,
  gasPrice: await web3.eth.getGasPrice(),
  nonce: await web3.eth.getTransactionCount(account.address)
});

const receipt = await web3.eth.sendSignedTransaction(signed.rawTransaction);
console.log("mined block:", receipt.blockNumber);
```

签名和广播分两步：`accounts.signTransaction` 在内存里做 secp256k1 签名拿到 rawTx，再用 `eth.sendSignedTransaction` 推到网络。Provider 不持有私钥，所以 nonce / gasPrice 要自己拼齐。ethers 里 `wallet.sendTransaction` 一行就帮你做完。

## 踩过的坑

1. **v1 → v4 数字类型从 string 变 bigint**——`getBalance` v1 返回 `"1234567890..."`，v4 返回 `1234567890n`。直接 `Number(balance)` 可能溢出，`balance + balance` 字符串拼接也不再有效。迁移要全文搜接收点。

2. **Callback + Promise 双模式遗留**——v1 大量方法既能 `.then` 又能 `(err, result) => {}` 回调，传错参数会静默不返回。v4 强制 Promise，但抄 v1 老教程时 `getBalance(addr, callback)` 这种签名直接 TypeError。

3. **BN.js 跟 bigint 不能混用**——v1 utils 返回自家 `BN` 实例，要 `.toString()`；v4 改 bigint。npm 同时安装两个 web3 大版本会冲突，必须选一个。

4. **bundle 体积大**——web3 v1 全包打进去 ~600KB，前端 H5 嵌入痛。v4 拆模块后稍好，但还是远大于 ethers v6 (~144KB) 和 viem (~30KB)。生产前端推荐换库或激进 tree-shake。

## 适用 vs 不适用场景

**适用**：

- 维护已有 web3.js 代码库——大量 DApp 后端、教程、SDK 还跑在 v1/v4 上
- 需要 plugin 扩展自定义链——`registerPlugin` 是 ethers 没有的机制，链特定厂商常发 `web3-plugin-xxx`
- 跟旧版 truffle / 老 solidity 教程对齐——历史代码都是 web3.js 风格

**不适用**：

- 新项目从零起步——选 ethers v6 或 viem，社区惯性 + 体积都更优
- 极致 bundle 敏感的 H5 / 小程序内嵌——viem tree-shake 后 ~30KB 完胜
- 类型从 ABI 自动推导——viem + abitype 能在编译期推出方法签名，web3.js 不行
- 长期项目——仓库已 archived，未来不会跟新 EIP

## 历史小故事（可跳过）

- **2015**：以太坊基金会发布 web3.js 0.x，作为官方 JS 客户端，伴随主网发布
- **2017**：DApp 大爆发，几乎所有 ICO 前端 / 钱包 SDK 都基于 web3.js
- **2018**：ricmoo 启动 ethers，目标"比 web3.js 更轻、ESM 友好"，逐步分流
- **2022**：维护权移交 ChainSafe，启动 v4 全面 TypeScript 重写
- **2023**：v4 GA，引入 plugin 系统、bigint、模块化包
- **2025-03**：仓库 archived，停止活跃开发，进入维护模式

## 学到什么

1. **"一个主类挂全部"vs"显式三件套"是 SDK 设计哲学的两条路**——web3.js 收敛到 `Web3` 实例，ethers.js 让你显式组合 Provider/Signer/Contract，前者好上手后者好做权限边界
2. **官方钦定不等于长期赢家**——web3.js 占了"官方"的先发，但 ethers 靠类型友好和体积反超，纯生态竞争证明工程品味比血统重要
3. **plugin 系统是迟到的好设计**——v4 才加的 `registerPlugin` 让链特定扩展可拼装，可惜赶上 archived 没时间普及
4. **archived 不等于死亡，等于停时钟**——历史代码库还会用十年，但写新代码不该再选

## 延伸阅读

- 官方文档：[docs.web3js.org](https://docs.web3js.org)（v4 完整 API + 迁移指南）
- 视频：[Dapp University — web3.js Tutorial](https://www.youtube.com/c/DappUniversity)（v1 时代经典入门系列）
- 对比文章：[ethers.js vs web3.js — A Complete Comparison](https://chainstack.com/ethers-js-vs-web3-js/)（社区视角差异）
- ChainSafe 公告：[Web3.js v4 Release](https://blog.chainsafe.io/announcing-web3-js-v4)（v4 设计动机）

## 关联

- [[ethers-js]] —— 同代竞品，API 风格更显式，体积更小，新项目首选
- [[metamask]] —— 浏览器钱包，web3.js 用 `new Web3(window.ethereum)` 接它
- [[hardhat]] —— Solidity 开发框架，原生支持 ethers 和 web3.js 两套 runtime
- [[foundry]] —— Rust 写的 Solidity 工具链，跟 web3.js 是不同语言里的同类
- [[uniswap-v3]] —— 经典合约调用案例，老 DApp 前端用 web3.js 调 Pool/Router
- [[remix-ide]] —— 浏览器 Solidity IDE，运行环境内置 web3.js 全局对象
- [[axios]] —— 同样是 transport 层抽象，web3.js 是 EVM 链的 transport

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[axios]] —— axios — 浏览器和 Node 都能用的 HTTP 客户端
- [[ethers-js]] —— ethers.js — 浏览器和 Node 都能用的以太坊客户端库
- [[foundry]] —— Foundry — Paradigm 出品的 Rust 合约工具链
- [[hardhat]] —— Hardhat — Nomic Foundation 的 JS 合约框架
- [[ipfs]] —— IPFS / Kubo — 按内容哈希定位的去中心化文件系统
- [[metamask]] —— MetaMask — 装在浏览器里的以太坊钱包
- [[remix-ide]] —— Remix IDE — 浏览器内 Solidity IDE
- [[uniswap-v3]] —— Uniswap V3 — 集中流动性 AMM 核心合约
- [[viem]] —— viem — 现代 TypeScript EVM 库

