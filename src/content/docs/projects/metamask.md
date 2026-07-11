---
title: MetaMask — 装在浏览器里的以太坊钱包
来源: 'https://github.com/MetaMask/metamask-extension'
日期: 2026-05-30
分类: 区块链工具
难度: 初级
---

## 是什么

MetaMask 是一个**浏览器扩展**（Chrome / Firefox / Edge / Brave），装上之后，浏览器就多了一个能保管私钥、能签交易、能让网页和以太坊聊天的小窗口。日常类比：像装了一个**带密码本的钱包 + 一张万能 IC 卡**——网页（DApp）一刷卡，它就弹出来问你"这笔签不签"。

你访问一个 NFT 网站，它说"请连接钱包"，你点一下 MetaMask 图标，授权，网站就拿到了你的地址。下一步它请求你签一笔铸造交易，MetaMask 弹窗显示"花 0.01 ETH + gas"，你点"确认"，签名+广播一气呵成，整个过程你**没碰到一次私钥**。

它还是事实上的 Web3 入口——大多数以太坊 DApp 的"接入钱包"按钮，第一选项就是 MetaMask。月活用户超过 3000 万，接入 DApp 1.7 万+。

> 名词三件套：**地址**（相当于银行账号，公开）、**私钥**（盖章用的印鉴，绝不能泄露）、**助记词**（12 / 24 个英文单词，用来恢复私钥的"种子"）。

## 为什么重要

不理解 MetaMask，下面这些事说不清楚：

- 为什么 DApp 网页里写 `window.ethereum.request(...)` 就能跟链交互——这个 `window.ethereum` 是 MetaMask 注入的
- 为什么同一个浏览器装两个钱包扩展会打架——它们抢同一个全局变量
- 为什么钱包安装后让你"抄写 12 个英文单词"——那是助记词，丢了不可恢复
- 为什么"钱包"和"私钥"听起来一样但其实不一样——钱包是私钥的**管理界面**

## 核心要点

MetaMask 在浏览器里能跑通的关键是 **三层结构**：

1. **Provider 注入层**：扩展往每个网页里注入一段脚本，挂上 `window.ethereum` 对象，实现 **EIP-1193**（以太坊 RPC 提供者标准）。类比：给每个网页发一根"对讲机"，频道统一。

2. **Background Service**：一个常驻后台的 service worker，里面有 **KeyringController**（管私钥，加密存本地）和 **NetworkController**（路由 RPC 请求到 Infura 或用户自定义节点）。UI 和后台通过浏览器扩展的 port 通信。类比：钱包"前台"是弹窗 UI，"后台"是真正保管钱箱的人。

3. **Snaps 扩展系统**：让第三方写 JS 模块跑在沙箱 VM 里，扩展能力（支持非以太坊链、自定义签名提示、隐私协议）。类比：手机的 App Store——核心钱包是系统，Snap 是装上去的小程序。

## 实践案例

### 案例 1：DApp 检测并连接钱包

最常见的接入起点。检测 `window.ethereum` 是否存在，然后请求账户：

```js
async function connectWallet() {
  if (!window.ethereum) {
    alert('请先安装 MetaMask')
    return
  }
  const accounts = await window.ethereum.request({
    method: 'eth_requestAccounts',
  })
  console.log('连上了，地址：', accounts[0])
}
```

**逐部分**：`window.ethereum` 是 MetaMask 注入的对象；`eth_requestAccounts` 是 EIP-1193 标准方法；浏览器会弹 MetaMask 授权窗，用户点同意才返回地址。注意 **生产代码现在更建议走 EIP-6963**——通过 `window.dispatchEvent(new Event('eip6963:requestProvider'))` 列出所有钱包让用户选，避免直接抓全局变量被覆盖。

### 案例 2：发起一笔 ETH 转账

```js
const txHash = await window.ethereum.request({
  method: 'eth_sendTransaction',
  params: [{
    from: accounts[0],
    to: '0xRecipient...',
    value: '0xDE0B6B3A7640000', // 1 ETH，单位 wei，hex
  }],
})
```

调用后 MetaMask 自动估算 gas，弹窗让用户确认。用户点"确认"才签名+广播；返回的 `txHash` 可以拿去 Etherscan 查状态。**用户全程不接触私钥**。

### 案例 3：监听账户和网络切换

DApp 里用户随时可能在 MetaMask 改账户或切链，UI 必须跟上：

```js
window.ethereum.on('accountsChanged', (accounts) => {
  console.log('账户切换为:', accounts[0])
  // 重新拉余额、重新订阅事件
})
window.ethereum.on('chainChanged', (chainId) => {
  // 推荐做法：直接 location.reload()
  window.location.reload()
})
```

**提醒**：`chainChanged` 后官方文档建议直接刷新页面——因为很多缓存（合约地址、余额）和链强绑定，懒得逐项失效。

## 踩过的坑

1. **助记词只在创建时显示一次**：截图丢了 = 钱永远找不回来。不像账号密码能 reset，链上没有"忘记密码"，所有恢复流程都是"用助记词重建"。
2. **`window.ethereum` 是全局共享的**：装两个钱包扩展会互相覆盖，EIP-6963（多钱包发现协议）就是 2024 年为了解这个引入的——DApp 应该走 EIP-6963 而不是直接拿全局对象。
3. **`eth_sign` 是历史毒瘤**：这个老方法签的是任意 hash，恶意 DApp 能塞一笔转账让你"无意中签了"。新版默认禁用，但老代码还有用，碰到立刻拒绝，改用 `personal_sign` 或 `eth_signTypedData_v4`。
4. **默认 RPC 是 Infura 公共配额**：刷链刷得猛会被限速，开发本地测试网必须在网络设置里加自定义 RPC，不然 `eth_call` 全 429（rate limit）。

## 适用 vs 不适用场景

**适用**：

- 个人用户日常持币、转账、玩 DApp（DeFi / NFT / 游戏）
- DApp 开发期接入测试，与 [[hardhat]] / [[foundry]] 本地链一起用
- 中等量交互的 Web3 站点（用 wagmi / ethers.js 包一层 provider）
- 需要硬件钱包安全 + 软件钱包便利的混合场景（MetaMask 当 Ledger 的 UI）

**不适用**：

- 需要极致 UX（弹窗+确认体验差），现在更多 DApp 走 social login + 嵌入式钱包（Privy、Web3Auth）
- 高安全场景（大额持币）→ 必须配硬件钱包（Ledger / Trezor），MetaMask 只做交互前端
- 服务器端签名 / 自动化机器人 → MetaMask 是浏览器交互工具，没 headless 模式
- 非 EVM 链（Solana / Cosmos / Bitcoin） → 原生不支持，要靠 Snaps 第三方扩展或换钱包

## 历史小故事（可跳过）

- **2016 年**：Aaron Davis 在 ConsenSys 内部启动 MetaMask，最初只是个 Chrome 扩展，把以太坊从"全节点"门槛降到"装个插件"。
- **2018 年**：EIP-1193 由 MetaMask 团队推动成为以太坊 provider 接口标准，从此 `window.ethereum` 是统一约定，DApp 不必为每个钱包写适配。
- **2020 年**：移动端 iOS / Android App 上线，扫码连 DApp 走 WalletConnect 协议。
- **2022 年**：Snaps 系统进入 beta，第三方可以写沙箱 JS 模块扩展核心钱包能力（多链、自定义签名提示、隐私协议）。
- **2024 年**：EIP-6963（多钱包发现）落地，解决了浏览器装多钱包互相覆盖的老坑，DApp 现在能列出"你装了哪几个钱包"让用户选。

## 学到什么

- **钱包不是"装钱"，是"装钥匙的工具"**——所谓"加密钱包"只在本地保存私钥，钱在链上账户里，丢钱包没事，丢助记词才是真丢钱
- **浏览器扩展是 Web3 第一公里**——把节点门槛抹掉的不是技术突破而是 UX 设计
- **标准化 RPC 接口比某个钱包重要**——EIP-1193 / EIP-6963 让 DApp 不绑死任一钱包
- **私钥管理 = 钱包的全部责任**——做错一次，资产消失，没有兜底，所以"keyring + 加密存本地 + 弹窗确认每笔"是核心流程

## 延伸阅读

- 官方文档：[MetaMask Developer Docs](https://docs.metamask.io/)（EIP-1193 / Snaps / SDK 入口齐全）
- EIP-1193 标准：[EIP-1193 Ethereum Provider JavaScript API](https://eips.ethereum.org/EIPS/eip-1193)
- EIP-6963 多钱包发现：[EIP-6963 Multi Injected Provider Discovery](https://eips.ethereum.org/EIPS/eip-6963)
- 视频：[Patrick Collins — Connect a Wallet to a Website](https://www.youtube.com/watch?v=pdsYCkUWrgQ)（30 分钟手把手）
- Snaps 入门：[MetaMask Snaps Tutorial](https://docs.metamask.io/snaps/get-started/quickstart/)
- [[hardhat]] —— 本地开发链，常配 MetaMask 调试合约
- [[foundry]] —— 另一个开发框架，cast wallet 也能配 MetaMask 共享账户

## 关联

- [[hardhat]] —— 本地链 8545 端口，MetaMask 加自定义网络就能连
- [[foundry]] —— 开发链 anvil 同样是 MetaMask 的常见对手
- [[remix-ide]] —— 浏览器 IDE，原生集成 MetaMask 部署合约
- [[bitcoin-core]] —— 比特币全节点，MetaMask 不直接支持比特币（需 Snap）
- [[besu]] —— 企业以太坊节点，MetaMask 可作为前端
- [[teku]] —— 共识客户端，跟 MetaMask 不在一层但都是 ETH 生态
- [[ape-framework]] —— Python 智能合约框架，对应 MetaMask 的 JS 生态

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[argent-x]] —— Argent X — 让账户本身就是一个合约的 Starknet 钱包
- [[ethers-js]] —— ethers.js — 浏览器和 Node 都能用的以太坊客户端库
- [[ledger-app-sdk]] —— Ledger App SDK — 在硬件钱包里写应用的 C 框架
- [[makerdao]] —— MakerDAO — 用抵押 ETH 铸出锚定美元的 DAI
- [[opensea-js]] —— opensea-js — NFT 二级市场的官方 SDK
- [[rabby-wallet]] —— Rabby Wallet — 签名前先告诉你"会变成什么样"的 EVM 钱包
- [[safe-contracts]] —— Safe — 多签智能账户合约
- [[snapshot]] —— Snapshot — DAO 不花 Gas 也能投票的链下治理前端
- [[walletconnect]] —— WalletConnect — dApp 与钱包之间的加密对讲机
- [[web3-js]] —— web3.js — 老牌 EVM JavaScript 客户端库
