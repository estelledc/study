---
title: WalletConnect — dApp 与钱包之间的加密对讲机
来源: 'https://github.com/WalletConnect/walletconnect-monorepo'
日期: 2026-05-30
子分类: 链与合约
分类: 区块链
难度: 中级
provenance: pipeline-v3
---

## 是什么

WalletConnect（2024 年改名 **Reown**）是**让网页 dApp 和手机 / 浏览器钱包安全说话的开放协议**。日常类比：像两个不在同一房间的人之间架的**加密对讲机**——dApp 在客厅按"请求签名"按钮，钱包在卧室"叮咚"响一下，按确认后回话回来，全程不用互相直接握手。

最常见的体验：你在电脑打开 Uniswap，点 "Connect Wallet"，弹出二维码；用 MetaMask 手机版扫一下，电脑端立刻显示连上了。后续每次 swap，电脑发起、手机弹窗确认、电脑收到签名结果——这就是 WalletConnect 在工作。

它源码 TypeScript 写，monorepo 里有 protocol / SDK / examples 几十个包，约 2.3k star，是 Web3 生态里几乎**所有非浏览器扩展钱包**接入 dApp 的事实标准。

> 名词三件套：**Pairing**（一次扫码建立的长期配对，可复用）、**Session**（一次连接里的具体会话，含权限和链）、**Relay**（中继 WebSocket 服务器，只转密文，看不到内容）。

## 为什么重要

不理解 WalletConnect 在做什么，下面这些事说不清楚：

- 为什么手机钱包能给电脑 dApp 签名——私钥从未离开手机，传的只是"已签好的字符串"
- 为什么 v2 出来后能"一次连接横跨多链"，v1 时代切链得断重连——v2 引入了 namespaces
- 为什么自建钱包要在 https://cloud.reown.com 注册拿 Project ID——relay 加了配额鉴权
- 为什么 2023 年 6 月开始很多老 dApp 突然连不上钱包——v1 bridge 服务器停服

## 核心要点

WalletConnect 能跑通的关键是 **三层结构**：

1. **Relay 中继层**：一台 WebSocket 服务器（IRN 协议）存储转发密文消息。它**看不到内容**——只看到 topic 和加密 envelope。类比：邮局只看信封地址，不拆信。Project ID 是 dApp 在 relay 上的"账户"。

2. **Pairing + Session 双 topic**：扫码时建立 **pairing topic**（长期可复用），dApp 在它上面发 `session_propose`，钱包确认后建 **session topic**（一次会话）。后续所有 RPC 都走 session topic。类比：先建一条专线（pairing），再在专线上谈具体事情（session）。

3. **端到端对称加密**：URI 里携带 symKey（X25519 派生的对称密钥），两端用 ChaCha20-Poly1305 加密所有 envelope。Relay 即使被攻破也读不到内容。类比：你只把信钥匙交给对方，邮局拿到信但没钥匙开不了。

三层加起来，钱包私钥不出本机，dApp 也能让用户签字。

## 实践案例

### 案例 1：用 AppKit 给 React dApp 加 Connect 按钮

dApp 侧最常见姿势，3 行代码完成连接：

```ts
import { createAppKit } from '@reown/appkit/react'
import { mainnet, polygon } from '@reown/appkit/networks'

createAppKit({
  projectId: 'YOUR_PROJECT_ID',  // 在 cloud.reown.com 注册
  networks: [mainnet, polygon],
})
// JSX 里：<appkit-button />
```

**逐部分**：`projectId` 是 relay 鉴权令牌，没它会静默超时；`networks` 列出 dApp 支持的链；`<appkit-button />` 是 Web Component，点击自动弹二维码 + 钱包列表。背后 SDK 已经把 pairing / session / 跨链切换都封装了，开发者基本不用碰底层 topic。

### 案例 2：用 WalletKit 给自研钱包加扫码连 dApp

钱包侧的对偶——监听 dApp 发来的请求并弹窗给用户：

```ts
import { WalletKit } from '@reown/walletkit'

const kit = await WalletKit.init({ projectId: '...', metadata: {...} })

kit.on('session_proposal', async (proposal) => {
  // 弹窗给用户："Uniswap 想连接，要权限 eth_sendTransaction"
  const session = await kit.approveSession({
    id: proposal.id,
    namespaces: { eip155: { accounts: ['eip155:1:0xYourAddr'], methods: [...], events: [...] } }
  })
})
```

**逐部分**：`session_proposal` 是 dApp 发来的"我要连"事件；`approveSession` 时必须填 namespaces，告诉 dApp"我能签哪几条链、支持哪些方法"。如果 dApp 要 eip155:1 但你只填了 eip155:137，dApp 会立刻收到拒绝。

### 案例 3：手撕一个 WalletConnect URI

理解协议最快的方式是看一眼 URI 长什么样：

```
wc:7f6e504...12@2?relay-protocol=irn&symKey=587949...e3
```

**逐部分**：`wc:` 是 scheme；`7f6e504...12` 是 **pairing topic**（32 字节十六进制）；`@2` 表示 v2；`relay-protocol=irn` 指定中继协议（v1 是别的）；`symKey` 是这次 pairing 用的对称密钥。钱包扫到这串后，连上 relay 订阅 topic、用 symKey 解密 dApp 发来的 `session_propose`，整个握手就此开始。**踩坑提醒**：URI 是一次性的，dApp 重新点 Connect 必须生成新的，复用旧 URI 钱包会拒。

## 踩过的坑

1. **URI 过期或复用**：WalletConnect URI 内含的 pairing 有 5 分钟超时，dApp 用 React 写时常因 useEffect 重渲染发了多个 URI，用户扫到第一个但 dApp 早换了，表现是"扫了没反应"——每次连接前清旧 URI、生成新的。
2. **Project ID 没填或填错**：v2 强制 relay 鉴权，没在 https://cloud.reown.com 注册或填的 ID 不对，连接时 WebSocket 直接 401，但 SDK 可能只在控制台抛个 warning，UI 表现是"二维码扫了一直转圈"。
3. **Namespaces 不匹配**：dApp 申请 eip155:1（主网）+ eip155:137（Polygon），但钱包只放 eip155:1 进 approveSession，dApp 会立刻 reject，且错误码是 `5100 Unsupported chains` 不直观——双方 chains 数组要算并集。
4. **移动 deeplink 没配 universal link**：浏览器 dApp 想唤起 iOS 上的钱包 App，钱包必须配 https:// 形式的 universal link 而不是 myapp:// scheme，否则签完不会自动跳回浏览器，用户以为卡死——iOS 14 起的限制。

## 适用 vs 不适用场景

**适用**：

- 网页 dApp 接非浏览器扩展钱包（手机版 [[metamask]] / Trust / Rainbow / imToken）
- 多链 dApp 需要跨链一次签名授权——v2 namespaces 一次表达多条链
- 钱包开发者想接入整个 Web3 生态——实现 WalletKit 比为每个 dApp 写适配器划算
- 桌面 dApp / 游戏想接钱包但不能内嵌浏览器——relay 提供平台无关传输

**不适用**：

- 同浏览器内 dApp ↔ 扩展钱包通信——用 EIP-1193 注入的 `window.ethereum` 更直接，[[rabby-wallet]] / [[metamask]] 扩展走这条路
- 完全离线签名（air-gapped 硬件钱包）——需要 USB / QR-code-only 流程，WalletConnect 依赖在线 relay
- 服务器对服务器自动签名——WalletConnect 设计上要求人工确认，没 headless 模式
- 单链非 EVM 且生态太小——namespaces 虽支持任意链，但钱包侧实现稀少时不如直接走原生 SDK

## 历史小故事（可跳过）

- **2018 年**：Pedro Gomes 在以太坊柏林黑客松开源 WalletConnect v1，用单点 bridge.walletconnect.org 中转 JSON 字符串。
- **2020-2021 年（DeFi Summer）**：v1 被 Uniswap / Aave / Compound 大量采用，bridge 服务器多次过载。
- **2021 年底**：v2 alpha 发布，引入 WebSocket 中继 + 端到端加密 + 多链 namespaces，架构彻底重写。
- **2023 年初**：v2 GA，强制 Project ID 鉴权 relay；开发者要去 cloud 注册才能用。
- **2023 年 6 月**：v1 bridge 服务器停服，老 dApp 必须升级到 v2 SDK。
- **2024 年 3 月**：项目改名 **Reown**，老 SDK Web3Modal → AppKit，Sign Client → WalletKit；协议本身保持向后兼容。
- **2025 年**：AppKit 加入 social login / passkey 一键钱包创建，进一步降低非加密用户门槛。

## 学到什么

- **传输协议的价值是平台无关**——WalletConnect 让手机 / 桌面 / 游戏 / 硬件四种环境都能连同一个 dApp
- **双 topic 结构是性能 vs 安全的折中**——pairing 长期复用省扫码，session 短期一次性限权
- **加密在传输层做比应用层做好**——relay 即使被买通也读不到内容，开发者不用各自发明加密
- **强制 Project ID 是反滥用机制**——v1 bridge 被大量爬虫和测试代码烧穿，配额鉴权是必然演进
- **协议改名不等于不兼容**——Reown 重写了 SDK 但 wc:// URI 协议保持向后兼容，老钱包不用动

## 延伸阅读

- 官方站：[Reown 官网](https://reown.com)（前 walletconnect.com，文档入口）
- GitHub：[WalletConnect/walletconnect-monorepo](https://github.com/WalletConnect/walletconnect-monorepo)（v2 协议 + SDK）
- 规范：[WalletConnect v2 Sign 协议规范](https://specs.walletconnect.com/2.0)（topic / encryption / RPC 全细节）
- Cloud：[Reown Cloud](https://cloud.reown.com)（注册 Project ID）
- 视频：[Pedro Gomes — WalletConnect v2 deep dive](https://www.youtube.com/results?search_query=walletconnect+v2+pedro+gomes)（创始人讲架构）
- EIP-1193：[Ethereum Provider JavaScript API](https://eips.ethereum.org/EIPS/eip-1193)（理解扩展钱包用什么做对比）

## 关联

- [[metamask]] —— 最大用户量钱包，移动版连 dApp 走 WalletConnect，扩展版走 EIP-1193
- [[rabby-wallet]] —— EVM 扩展钱包，浏览器内不用 WalletConnect，但移动版同样接入
- [[hardhat]] —— 本地开发链，dApp 在 hardhat 节点上调试时 WalletConnect 同样适用
- [[foundry]] —— anvil 本地链，配合 WalletConnect 可在真实钱包上测试合约调用
- [[remix-ide]] —— 浏览器 IDE，部署合约可选 WalletConnect 让手机钱包签
- [[go-ethereum]] —— ETH 执行客户端，WalletConnect 转发的最终 RPC 落到 geth 之类节点
- [[bitcoin-core]] —— 比特币节点，WalletConnect namespaces 理论支持但生态钱包少

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[argent-x]] —— Argent X — 让账户本身就是一个合约的 Starknet 钱包
- [[bitcoin-core]] —— Bitcoin Core — 比特币参考实现
- [[foundry]] —— Foundry — Paradigm 出品的 Rust 合约工具链
- [[go-ethereum]] —— Go-Ethereum (Geth) — 以太坊主流 Go 客户端
- [[hardhat]] —— Hardhat — Nomic Foundation 的 JS 合约框架
- [[ledger-app-sdk]] —— Ledger App SDK — 在硬件钱包里写应用的 C 框架
- [[metamask]] —— MetaMask — 装在浏览器里的以太坊钱包
- [[rabby-wallet]] —— Rabby Wallet — 签名前先告诉你"会变成什么样"的 EVM 钱包
- [[remix-ide]] —— Remix IDE — 浏览器内 Solidity IDE
- [[safe-contracts]] —— Safe — 多签智能账户合约

