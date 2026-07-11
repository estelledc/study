---
title: Arweave — 一次付费、永远存着的区块链
来源: 'https://github.com/ArweaveTeam/arweave'
日期: 2026-05-30
分类: blockchain
难度: 中级
---

## 是什么

Arweave 是一条**主打"永久存储"的公链**：你交一次钱，网络承诺把这份数据**保留几百年**。日常类比：像花一次性的"陵园永久管理费"——和按月付的云盘相反，钱付完后子孙后代都能继续访问。

它不是普通的区块链。普通链（比特币、以太坊）核心目标是记账，存储是副产品；Arweave 反过来——**链本身就是为了存数据而生**。

最小直觉例子：你把一张图片提交给 Arweave，付几分钱 AR 代币，几分钟后这张图片得到一个**永久不变的 URL**：

```
https://arweave.net/<txid>
```

只要 Arweave 网络还在，这个 URL 就一直能打开。哪怕你死了、项目跑路了、AWS 倒闭了。

## 为什么重要

不理解 Arweave，下面这些事都没法解释：

- 为什么很多 NFT 把图片存到 Arweave 而不是 IPFS——IPFS 没人 pin 数据就掉
- 为什么"永久前端"（permaweb）能让 dApp 在团队解散后还活着
- "一次付费 200 年"是真的还是营销话术——背后是**捐赠基金 + 硬盘降价假设**两个支柱
- 为什么矿工愿意存别人的数据——SPoRA 共识把"持有历史数据"变成挖矿前提

## 核心要点

Arweave 的设计可以拆成 **三块**：

1. **Blockweave（编织链）**：和比特币只链接前一块不同，Arweave 每个新块同时链接**前一块** + **一个随机历史块**（叫 recall block）。类比：账本不是一根直链而是一张网，越往后织越密。这逼矿工**真的存历史**，不能只追新。

2. **SPoRA 共识**：要挖出新块，矿工得证明自己**能随机访问任何历史块**（Succinct Random Proofs of Access）。类比：图书馆考试不让你背书目录，让你随机抽一页朗读——背不出来就没资格出新题。结果：磁盘大、数据全的矿工胜率高。

3. **Endowment（捐赠基金）**：用户付的钱不是直接给当下的矿工，**大部分进入一个基金池**，按 Kryder 定律（硬盘价格每年下降）摊算未来 200 年的存储成本，每块再从池里释放一小部分付当期矿工。

三块加起来 = "存得起 + 愿意存 + 能验证存了"。

## 实践案例

### 案例 1：把一张图片永久上链

用 `arweave-js` 客户端：

```js
import Arweave from 'arweave';
const ar = Arweave.init({ host: 'arweave.net', port: 443, protocol: 'https' });

const tx = await ar.createTransaction({ data: imgBuffer }, wallet);
tx.addTag('Content-Type', 'image/png');
await ar.transactions.sign(tx, wallet);
await ar.transactions.post(tx);

console.log(`https://arweave.net/${tx.id}`);  // 永久 URL
```

**逐部分解释**：

- `createTransaction` 把数据 + 元信息打包成一笔交易
- `addTag` 加标签，gateway 用它来过滤检索（比如"只列我项目的图片"）
- `sign + post` 用钱包签名后广播到网络
- 几分钟后矿工把它打进块，URL 永久生效

### 案例 2：永久前端（permaweb）

把一个 React app 编译产物整目录上传：

```bash
npx arkb deploy ./dist --wallet=wallet.json
# → permawebUrl: https://arweave.net/abc123/index.html
```

部署一次，团队解散后 dApp 仍然能访问——前端不依赖任何中心服务器。常见用法：DeFi 协议把交易界面放 Arweave，避免被监管下架时用户连合约都没法调。

### 案例 3：NFT 永久元数据

OpenSea 上很多大项目的 metadata URI 长这样：

```
ar://Tx9k3L...PqR  ← 直接指向 Arweave，不依赖任何中心服务
```

对比传统做法：HTTP 链接（项目跑路就 404）、IPFS（没人 pin 就掉）。Arweave 的优势是**协议层保证**——只要付了那一次钱，网络结构本身有激励继续保存。

## 踩过的坑

1. **200 年永存依赖 Kryder 定律继续成立**：endowment 的数学模型假设硬盘价格每年降 X%，万一某年技术撞墙不再降价，基金会提前烧光。这是协议级风险，没人能逃。

2. **检索默认走 gateway**：用户访问 `arweave.net/<txid>` 实际是访问一个中心化网关。网关全挂或被封，普通用户读不到数据。AR.IO 在做去中心化网关网络但还在早期。

3. **写入费按现货 AR 价格波动**：牛市时一次写入贵到劝退小数据。常见对策：用 Bundlr/IRYS 把多笔小写入打包成一笔，分摊费用。

4. **写入到上链确认要分钟级**：高频场景（聊天、日志）直接用会卡顿，必须套打包层（IRYS 等）。开发新人常以为 `post` 完就能立刻读，实际要等矿工打包确认。

## 适用 vs 不适用场景

**适用**：
- NFT / SBT 元数据需要几十年仍可访问
- DApp 前端永久托管（permaweb），不希望团队解散后界面消失
- 学术存证、法律证据、维基快照——需要"将来还能验证内容"的场景
- 写一次、读多次的冷数据（图片 / PDF / 静态站点）

**不适用**：
- 高频写入 / 删改频繁——上链是 append-only，不能改不能删
- 隐私数据——链上所有人都能读，加密只能你自己做
- 大文件即时分发（视频流）——延迟和带宽都不如 CDN
- 临时缓存——付了永久费用却只用一周，浪费

## 历史小故事（可跳过）

- **2017 年**：Sam Williams 发表白皮书，最初叫 **Archain**——目标是"让区块链记录人类历史本身"。
- **2018 年**：主网上线，引入 blockweave 数据结构 + Wildfire 节点评分（互相打分鼓励合作）。
- **2019-2020 年**：升级到 **SPoRA** 共识，让大硬盘矿工更占优势，数据冗余度上升；Bundlr（后改名 IRYS）出现，做高吞吐打包层。
- **2022-2024 年**：AR.IO 推出**去中心化 gateway 网络**，试图修补"gateway 中心化"这个长期短板；链上数据量超过 200 TB。

## 学到什么

1. **永久存储是经济问题不是技术问题**——只要把激励对齐，普通硬盘就能堆出"永久"
2. **Blockweave + SPoRA** 把"存历史"变成挖矿前提，比"靠社区善意 pin"更可持续
3. **Endowment 模型** 用基金 + 摩尔/Kryder 定律假设把一次性付费摊到长期，是金融工程而非密码学
4. **Permaweb** 的真正意义不是"永久网页"，而是**让前端不依赖运营方继续存在**
5. **共识可以为应用定制**——比特币的 PoW 是为账本，Arweave 改造成 SPoRA 就是为存储

## 延伸阅读

- 视频：[Sam Williams — Arweave 原理 30 分钟讲解](https://www.youtube.com/watch?v=JNgULA9V0Ds)（创始人亲自讲 blockweave 和 endowment）
- 黄皮书 PDF：[Arweave Yellow Paper](https://www.arweave.org/yellow-paper.pdf)（密度高但权威）
- 文档：[Arweave Cookbook](https://cookbook.arweave.dev/)（动手 demo，从 hello world 到 permaweb）
- [[ipfs]] —— 同样去中心化存储但没自带激励，常被对比
- [[filecoin]] —— IPFS 之上加经济层，但合同有期、不承诺永久

## 关联

- [[ipfs]] —— 协议互补：IPFS 寻址 + Arweave 永久托管
- [[filecoin]] —— 同样给存储加经济层，但走"按时长付费"路线
- [[bitcoin]] —— blockweave 借鉴比特币 PoW 但改造成 SPoRA
- [[ethereum]] —— 很多 NFT 元数据从 ethereum 链上指向 Arweave
- [[solana]] —— solana 历史快照 / 状态压缩也用 Arweave 存档
- [[uniswap-v3]] —— 部分 DeFi 前端用 permaweb 部署防下架
- [[ledger-app-sdk]] —— 硬件钱包签 AR 交易要走 ledger-app-sdk 一类的 SDK

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[sia]] —— Sia / Renterd — 主机持续打卡才能拿钱的去中心化云存储
- [[storj]] —— Storj — S3 兼容的去中心化对象存储
