---
title: Reservoir SDK — 跨市场 NFT 聚合
来源: 'https://github.com/reservoirprotocol/reservoir-kit'
日期: 2026-05-30
子分类: 链与合约
分类: 区块链
难度: 高级
provenance: pipeline-v3
---

## 是什么

Reservoir SDK 是一组 TypeScript 包，让前端用**一个 API** 同时看到 OpenSea / Blur / LooksRare / X2Y2 / Sudoswap 这些 NFT 交易市场上的所有挂单和出价，并能在**一笔链上交易**里跨多个市场一起成交。

打个比方。携程把国航 / 东航 / 南航的航班搜到一起、能一次下单同一行程里多家航司的票——你不用每家航司都注册一个账号。Reservoir 就是 NFT 的"携程"：以前要买一个 collection 的 floor，要到 OpenSea 看一遍价格、再到 Blur 看一遍、再到 LooksRare 看一遍，挂单签名格式还各不相同；现在只调一次 `actions.buyToken`，SDK 自动找到这三家里最便宜的几张拼成最优订单。

代码层面三个核心包：`@reservoir0x/reservoir-sdk`（actions：buyToken / listToken / acceptOffer / placeBid / cancelOrder）、`@reservoir0x/reservoir-kit-ui`（开箱即用的 React 组件，BuyModal / ListModal / BidModal）、`@reservoir0x/relay-kit`（2024 后扩出来的跨链支付 kit）。SDK 不直接发交易——它先调 Reservoir 后端 API 拿一组"步骤"（approve / sign / transaction），再用 viem/ethers 钱包逐步执行。

最小心智模型：**后端索引器**（Reservoir 自己跑节点订阅各市场合约事件，把不同签名格式归一成统一 order）+ **Steps API**（execute/buy/v7 返回多步动作给 SDK 执行）+ **RouterV6 合约**（链上批量路由器，能在一笔交易里同时打到 Seaport / Blur / LooksRare 多个市场合约）。

## 为什么重要

- 不理解 Reservoir 的"统一 order 模型"，就解释不了为什么现代 NFT 前端能跨市场显示 floor 和 best bid
- 不理解 Steps API，就读不懂为什么 SDK 不接收 `(token, price, wallet)` 直接发交易，而是先 `await fetch`
- 不理解 RouterV6，就分析不出"一笔交易跨三家市场原子成交"是怎么做到的
- 不理解 marketplaceFees vs 协议费 vs royalties 三层分账，就配错前端聚合站的收费
- 不理解 Reservoir 是托管中心化服务这一事实，就低估了"API 挂了买不了"这种生产风险

## 核心要点

1. **统一 order 模型**：listings（asks）/ bids（offers）/ tokenSets（一组 NFT 的批量出价），不管底层市场是 Seaport 还是 Blur 自家协议都长成一样的 JSON 形状。后端索引器跑节点订阅各市场合约，把不同签名格式规范化后存到数据库。
2. **Steps API**：`/execute/buy/v7` 不直接返回 `(to, data, value)`，而是返回 `steps: [{ kind: 'transaction', items: [...] }]`。每个 step 可能是 ERC20 approve / NFT approve / EIP-712 签名 / 真正的 transaction，SDK 顺序执行并通过 `onProgress` 上报每一步状态。
3. **RouterV6 路由合约**：链上批量路由器，把多个市场的成交 calldata 拼到一笔。用户对 RouterV6 授权一次后，跨 OpenSea / Blur / LooksRare 都不用再次授权。`revertIfIncomplete: false` 允许 partial fill（其中一单失败不让整笔回滚）。
4. **Fees 三层**：协议费（Seaport 0.5%）+ 版税（按 collection royalties 配置）+ marketplaceFees（前端聚合站自己加的，给传 `marketplaceFees: ['0xfee:200']` 表示 2%）。SDK 自动按每个市场策略叠加。
5. **托管 + 自托管**：默认指向 `api.reservoir.tools`（托管 API，要 API key），也支持自跑 indexer 指向自己域名。生产侧前端绝大多数用托管。

## 实践案例

### 案例 1：买一张 NFT（最小调用）

```ts
import { getClient } from '@reservoir0x/reservoir-sdk'
import { createWalletClient, custom } from 'viem'

const client = getClient()  // 已通过 createClient({ chains, source }) 全局初始化
const wallet = createWalletClient({ account, chain: mainnet, transport: custom(window.ethereum) })

await client.actions.buyToken({
  items: [{ token: '0xBC4C...:1234', quantity: 1 }],
  wallet,
  onProgress: (steps) => {
    // steps[0].kind === 'transaction'，steps[0].items[0].status: 'incomplete' | 'complete'
    console.log(steps)
  }
})
```

`buyToken` 内部 `GET /execute/buy/v7?token=0xBC4C...:1234` 拿 step 数组：先 currency-approval（如果用 WETH 付）→ 再 sale（打到 RouterV6）。SDK 用 `wallet.writeContract` 发出去，等链上确认后回调 onProgress。

### 案例 2：跨市场扫地板（一笔吃 5 张最便宜）

```ts
await client.actions.buyToken({
  items: [
    { collection: '0xBC4C...', quantity: 5 }  // 不指定 token = 让 API 自动选最便宜 5 张
  ],
  wallet,
  options: { partial: true },  // 允许 partial fill
  onProgress: (steps) => { /* ... */ }
})
```

API 返回的 path 可能是：`[{source: 'opensea.io', price: 0.5}, {source: 'blur.io', price: 0.51}, {source: 'looksrare.org', price: 0.52}, ...]`。RouterV6 把这 5 张的 calldata 拼成一笔，user 一次签名一次确认。`partial: true` 时即使其中 1 张被人抢掉也不让整笔回滚，剩下 4 张照常完成。

### 案例 3：挂单（list）跨多市场同步发布

```ts
await client.actions.listToken({
  listings: [
    { token: '0xBC4C...:1234', weiPrice: '500000000000000000', orderbook: 'reservoir', orderKind: 'seaport-v1.5' },
    { token: '0xBC4C...:1234', weiPrice: '500000000000000000', orderbook: 'opensea',   orderKind: 'seaport-v1.5' },
    { token: '0xBC4C...:1234', weiPrice: '500000000000000000', orderbook: 'looks-rare-v2', orderKind: 'looks-rare-v2' }
  ],
  wallet,
  onProgress: (steps) => { /* ... */ }
})
```

同一张 NFT 同时挂到 3 个 orderbook。SDK 让 user 用 EIP-712 签名一组对应每家市场的不同结构（这是无法避免的——每家市场的合约只认它自己的 typed data），但 UI 上对 user 表现为"一个挂单流程"。

## 踩过的坑

1. **API 中心化**：默认指向 `api.reservoir.tools`，断了前端就买不了；做生产要么自跑 indexer，要么前端有 fallback（直连各家市场 SDK）。
2. **Blur 订单成交失败**：Blur 的订单需要 BETH（Blur 自有的包装 ETH）和专属签名格式，早期 SDK 会把 Blur listing 混到结果里但前端钱包不识别就成交失败；新版 SDK 已经把 Blur 单独标 source，前端可以 filter 掉。
3. **首次买的两步 transaction**：第一次买某 collection 时 `onProgress` 会先弹一个 NFT-approval / currency-approval（让 RouterV6 能拿走代币），然后才弹 sale。新人以为只要一次确认，结果 user 只签了第一步以为完了。
4. **marketplaceFees 配错被拒**：`marketplaceFees: ['0xfee']` 缺 BPS 部分（应该写 `'0xfee:200'` 表示 2%），API 直接 400。
5. **chainId mismatch**：`ReservoirKitProvider` 的 chains 配置和 wagmi/viem 的 chain 不一致（比如一个用 1 一个用 mainnet 但 id 不同），下单时 wallet.writeContract 会报 chainId 不匹配。
6. **手续费 sum 错**：`/execute/buy/v7` 返回的 path 跨多市场，每个 path 项有自己的 fees，前端展示总价要 sum 整组 path，不能只展示第一项。
7. **Royalty 不一致**：同一 NFT 在 OpenSea 默认强制版税、在 Blur 默认 0%。前端展示卖家"到手"金额时不能拿一个数填所有市场，要按 path source 分别算。

## 适用 vs 不适用场景

适用：
- NFT 交易市场前端（Magic Eden 多链版早期版本就用 Reservoir）
- 钱包内置 NFT tab（ZenGo / Argent 显示用户 NFT 与一键挂单）
- Portfolio / floor 监控工具（聚合多市场的 best bid / floor）
- 套利 / 扫货 bot（跨市场对冲，用 RouterV6 一次成交多张）

不适用：
- 完全去中心化要求（Reservoir 是托管 API，拒绝中心化依赖就要自跑 indexer）
- Solana / 非 EVM 链（Reservoir 只支持 EVM 系：以太坊主网 / Base / Polygon / Arbitrum / Optimism / Zora 等）
- 一手 mint（mint 阶段订单还没产生，要直接调 collection 合约的 mint 方法，Reservoir 提供 mintToken 但能力有限）
- 极致 gas 敏感场景（RouterV6 多一层调用，单笔比直连市场合约多 30~50k gas）
- 想要 Blur 全部功能（Blur 的 bidding pool / 积分系统 Reservoir 不完整支持，专做 Blur 用户要直接用 Blur SDK）

## 历史小故事（可跳过）

- 2022 年：Reservoir Labs 成立，主打 NFT 聚合 API，第一版只是查询接口
- 2022 末：RouterV1 上线，第一次实现一笔交易里跨 OpenSea + LooksRare 成交
- 2023 年：RouterV6 + Steps API v6 出来，确立"前端只调一个 action"的开发模式
- 2023 末：Blur 索引接入，Reservoir 成为少数同时桥接 Blur + OpenSea 的中立聚合器
- 2024 年：relay-kit 出来，扩到跨链支付（不止 NFT，普通代币也能跨链一键转）
- 2025 年：execute/buy/v7、execute/sell/v7 稳定，cancel/v3 优化批量取消
- 2026 年初：sdk / kit-ui 仍是 Magic Eden / Sound.xyz / Foundation 等下游的底层依赖

## 学到什么

- "聚合 + 路由"这套模式不是 NFT 独有：Uniswap 的 Universal Router 在 token 里做的事跟 RouterV6 在 NFT 里做的事完全同构——都是把多个底层协议的 calldata 拼到一笔
- Steps API 把"链上动作"显式建模成一个数组，让前端能精确显示 user 卡在哪一步、哪一步失败，比"一个大方法吞掉所有细节"友好得多
- 统一 order 模型证明：底层协议格式各异不是问题，只要中间层能把它们映射成统一形状，上游开发者就只需学一套 API
- 中心化 API + 去中心化结算 是当前 NFT / DeFi 工具层最现实的折中——纯链上索引太慢太贵，纯链下又失去无信任性，Reservoir 选了"路由器在链上、订单簿在链下"的组合
- 三层分账（协议费 + 版税 + 聚合站费）是一切聚合器的共同设计——同样的结构在 1inch / 0x / Jupiter 上都看得到，只是数字不同
- partial fill 这种"允许失败一部分但其他成功"的语义，在传统数据库一定是反模式（破坏原子性），但在交易聚合场景反而是产品体验的关键——user 一次想买 5 张，被人抢走 1 张时让另外 4 张照常成功比"全单回滚再让你重试"舒服得多
- 钱包授权的边界设计也是模式：让 user 对 RouterV6 一次性授权，是把"信任面"从"每个市场单独信任一次"收敛到"信任 RouterV6 一次"——这是设计聚合器永远绕不开的取舍，授权范围越广 UX 越好但单点风险越大

## 延伸阅读

- 官方文档：<https://docs.reservoir.tools>
- API 参考：<https://api.reservoir.tools/api>
- 源码：<https://github.com/reservoirprotocol/reservoir-kit>
- RouterV6 合约（Etherscan 已开源）：<https://etherscan.io/address/0xC2c862322E9c97D6244a3506655DA95F05246Fd8>
- Magic Eden 整合 Reservoir 的工程博客：<https://blog.reservoir.tools>
- 关联：[[uniswap-v3]] —— 同样是路由聚合范式，UniswapV3 路由 token，Reservoir 路由 NFT
- 关联：[[opensea-js]] —— Reservoir 索引的最大单家市场，OpenSea Seaport 是默认 orderKind
- 关联：[[axios]] —— SDK 内部用 fetch 风格 HTTP 调 Reservoir API

## 关联

- [[uniswap-v3]] —— 同生态路由思想，AMM 路由 token；Reservoir 路由 NFT 订单簿
- [[opensea-js]] —— OpenSea Seaport 的官方 SDK，Reservoir 的最大上游订单源
- [[aave-v3]] —— DeFi Pool 单入口设计，思路类似（一个 RouterV6 入口收敛多市场）
- [[go-ethereum]] —— RouterV6 跑在 EVM 上，钱包通过 geth 这类节点广播交易
- [[axios]] —— SDK 调 Reservoir API 走 HTTP，axios 风格的 fetch 包装
