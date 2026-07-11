---
title: opensea-js — NFT 二级市场的官方 SDK
来源: 'https://github.com/ProjectOpenSea/opensea-js'
日期: 2026-05-30
分类: blockchain
难度: 中级
---

## 是什么

opensea-js 是 OpenSea 官方维护的 **TypeScript SDK**，让你**用几行代码就能在最大的 NFT 二级市场挂单、出价、成交、取消订单**。日常类比：像闲鱼的"代发货 SDK"，你给商品和价格，它帮你贴标签、放到货架、对接物流。

底层从早期的 Wyvern Protocol 升级到了 2022 年发布的 Seaport 协议——一套**专门为 NFT 撮合优化**的合约。SDK 把三件脏活封装好：

```ts
const order = await sdk.createListing({
  asset: { tokenAddress, tokenId },
  startAmount: 1,        // 1 ETH 起拍
  expirationTime,
  accountAddress: seller // 卖家钱包
});
```

这一行背后：SDK 帮你算订单 hash、用 EIP-712 让钱包弹窗签名、把签名提交到 OpenSea 中央订单簿。挂单本身**不上链、不花 Gas**，只在买家成交时一笔交易完成。

## 为什么重要

不理解 opensea-js，下面这些事都没法解释：

- 为什么挂单不花 Gas，但取消订单又要花——签名是链下的，撤销得让 Seaport 合约忘掉这个签名
- 为什么 OpenSea 上 offer（出价）必须是 WETH 而不是 ETH——智能合约只能"拉"ERC-20，没法主动"拉"原生代币
- 为什么有时候点了"接受报价"还要再点"授权"才能成交——Seaport 需要 NFT 合约 setApprovalForAll
- 为什么同一个钱包在 Polygon 上的挂单到了 Mainnet 就失效——签名里写死了 chainId

## 核心要点

1. **链下签名 + 链上履约的混合订单簿**。挂单只是一份用户私钥签过的 Seaport Order 结构体，存在 OpenSea API 里。买家点"立即购买"时，链上合约同时验签、转 NFT、扣买家钱，原子完成。类比：寄存柜的小票——单独一张纸没用，但配上柜子和钥匙就能换出东西。
2. **Order = offer + consideration**。Seaport 把"我给什么"（offer）和"我要换什么"（consideration）都写成数组，因此一笔订单可以包含多个 NFT、多个 ERC-20、多个收款地址（版税分账自然落到 consideration 里）。类比：送礼清单 + 回礼清单。
3. **SDK 主要四类 API**：createListing（卖单）/ createOffer（出价）/ fulfillOrder（成交）/ cancelOrder（取消）。前两个只签名不上链；后两个上链，谁触发谁付 Gas。这个分摊设计让卖家挂一万个东西成本仍是 0。

## 实践案例

### 案例 1：挂一个 1 ETH 卖单

```ts
import { OpenSeaSDK, Chain } from "opensea-js";
import { ethers } from "ethers";

const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
const sdk = new OpenSeaSDK(wallet, { chain: Chain.Mainnet, apiKey: KEY });

const listing = await sdk.createListing({
  asset: { tokenAddress: "0xBC4C...", tokenId: "42" },
  startAmount: 1,
  accountAddress: wallet.address,
  expirationTime: Math.floor(Date.now() / 1000) + 86400 * 7,
});
```

钱包会弹一次 EIP-712 签名框。注意 `expirationTime` 是 Unix 秒，写错成毫秒会立刻过期。

返回的 `listing` 里有 `orderHash`，可用它去 OpenSea 后台查这个订单状态、谁出过价、何时成交。挂单本身没花一滴 Gas，因为只是把签名结构体推到了 OpenSea 的 REST API。

### 案例 2：批量给某个 collection 出 floor price 的报价

```ts
const offer = await sdk.createCollectionOffer({
  collectionSlug: "boredapeyachtclub",
  amount: 25,                          // 25 WETH
  quantity: 5,                         // 同一报价覆盖 5 个 token
  accountAddress: buyer,
  expirationTime,
});
```

这种 "collection offer" 是 NFT 市场最常见的撸毛策略：扫整个系列地板价。前提是钱包里有 ≥ 125 WETH 且已经 approve OpenSea Seaport 合约。

注意 `quantity: 5` 表示这一份签名可被任意 5 个 token 共同满足，并不是发 5 笔订单。任何一个 token 持有人接受报价，扣掉 25 WETH，剩余报价仍然有效，直到 5 个名额都用完或者过期。

### 案例 3：监听到持仓变化后自动撤单

```ts
provider.on(transferFilter, async (log) => {
  const tokenId = parseTokenId(log);
  await sdk.cancelOrder({ order: myOrders.get(tokenId) });
});
```

机器人场景：一旦某个 NFT 已经被卖出（Transfer 事件触发），立刻取消其它平台的同一挂单，避免被双花套利。`cancelOrder` 会发一笔上链交易，因此要预留足够 ETH 做 Gas。

更轻量的替代是 `offchainCancelOrder`，OpenSea 接受一个签名声明、立刻把订单从 API 撤下，不上链，但只对自家平台有效——别的聚合器仍可能拿旧签名去 Seaport 合约成交。两种取消方式各有取舍，机器人通常优先用 offchain，再周期性兜底用上链 cancel。

## 踩过的坑

1. **WETH 余额不够时 createOffer 静默失败**——SDK 不会在前端校验余额，订单提交了但永远成交不了；要自己先查 ERC-20 balance。
2. **漏 setApprovalForAll**——卖家挂单成功，买家点购买时 Seaport revert "NOT_AUTHORIZED"；SDK v6 加了自动检测但旧版要手动调一次。
3. **chain 参数错配**——同一个 wallet 在 Polygon 用 `Chain.Mainnet` 实例化 SDK，签出来的订单 chainId = 1，到 Polygon 任何人都成交不了。
4. **API rate limit 命中后 SDK 不重试**——批量挂单要自己包一层 p-queue 限速 4 req/s，否则后半截订单全丢。
5. **EIP-712 domain 在 Seaport 升级时换过几次**——v1.4 / v1.5 / v1.6 的 domain separator 不同，老旧 SDK 签出来的订单走新版合约会 InvalidSignature；保持 SDK 跟链上合约同步升级。

## 适用 vs 不适用场景

**适用**：

- 个人卖家用脚本批量挂/撤单
- 做市机器人扫地板价、对冲不同市场价差
- DApp 集成 NFT 交易功能而不想自己写撮合协议

**不适用**：

- 需要自定义版税分配规则（OpenSea API 强制走平台版税）
- 完全去中心化场景（订单簿仍依赖 OpenSea 中央 API）
- 非 EVM 链（Solana / Aptos 上的 NFT 要换别的 SDK）

## 历史小故事（可跳过）

- 2017 年 OpenSea 成立，订单基于 Wyvern Protocol——一个通用以太坊撮合协议，挂单要上链花 Gas。
- 2021 年 NFT 大热，Wyvern 暴露出 Gas 高、不支持组合订单等问题。
- 2022 年 6 月联合社区开发 Seaport 协议并开源，多种交易模式统一成 offer/consideration。
- 2022 年 9 月 opensea-js v3 全面切到 Seaport，挂单 Gas 降为 0，整体撮合 Gas 较 Wyvern 降约 35%。
- 2024 年起 SDK 支持多链（Polygon / Arbitrum / Base / Zora 等十余条 L2），订单簿仍由 OpenSea 中心化聚合。

## 学到什么

- **链下签名 + 链上结算**是 Web3 订单簿的主流范式，opensea-js 是这个范式最成熟的范例。
- 把"承诺"和"履约"分开，能把高频但低概率成交的挂单成本从链上转移到链下。
- 一个好的市场 SDK 要把签名结构、合约调用、approval 检查、API 限速全包好——任何一步泄漏给上层都会被开发者抱怨。
- Web3 SDK 的最大复杂度往往不在加密学，而在"多链 + 多状态 + 多协议版本"的兼容矩阵。

## 延伸阅读

- 文档主页：https://docs.opensea.io/reference/api-overview
- Seaport 协议白皮书：https://github.com/ProjectOpenSea/seaport/blob/main/docs/SeaportDocumentation.md
- EIP-712 typed data 规范：https://eips.ethereum.org/EIPS/eip-712
- 视频教程 "Build an NFT marketplace bot" by Patrick Collins
- [[uniswap-v3]] —— 同样用链下签名做 Permit2 授权
- [[metamask]] —— 钱包侧 EIP-712 签名 UI 由它统一

## 关联

- [[metamask]] —— SDK 通过它弹窗让用户签 Seaport 订单
- [[uniswap-v3]] —— DeFi 现货撮合的代表，对比 NFT 撮合的差异（连续 vs 离散）
- [[hardhat]] —— 本地分叉主网测试 SDK 调用前的常用工具
- [[foundry]] —— 用 forge 模拟 fulfillOrder 的链上行为
- [[uniswap-v3]] —— Permit2 是 Seaport approval 模型的近亲

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[reservoir-sdk]] —— Reservoir SDK — 跨市场 NFT 聚合
