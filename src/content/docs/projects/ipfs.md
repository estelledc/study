---
title: IPFS / Kubo — 按内容哈希定位的去中心化文件系统
来源: 'https://github.com/ipfs/kubo'
日期: 2026-05-30
子分类: 链与合约
分类: 区块链
难度: 中级
provenance: pipeline-v3
---

## 是什么

IPFS（InterPlanetary File System）是一套**让文件不再用 URL、改用"内容指纹"定位**的去中心化文件系统，**Kubo** 是它的主流 Go 实现（约 16.5k stars）。日常类比：传统 HTTP 像快递地址（"北京朝阳区某某路 5 号"）——地址变了或楼塌了就拿不到东西；IPFS 像"指纹查找"——你要的那本书有自己的指纹，谁有这本书都能给你，原来那家书店倒了不要紧。

每份数据被切成块，每块算一个哈希（SHA-256），合起来生成一个 **CID（Content Identifier）**。你拿 CID 去网络上喊一声"谁有？"——任何 pin 了这块的节点都能给你，给完你能用 CID 自己校验"对不对"。

Kubo 是 IPFS 的第一个实现，也是目前部署最多的。NFT 元数据、ENS 域名内容、Filecoin 的链下层基本都是它在跑。

```bash
$ ipfs add hello.txt
added QmXgZAUWd8yo4tvjBETqzUy3wLx5YRzuDwUQnBwRGrAmAo hello.txt
```

那串 `Qm...` 就是 CID。文件改一个字 CID 就完全变。

## 为什么重要

不理解 IPFS，下面这些事都没法解释：

- 为什么 NFT 元数据 / 图片大多放 IPFS——链上存大文件太贵，但又不能放公司服务器（公司倒了 NFT 就废了）
- 为什么 Filecoin / Arweave / web3 存储项目都把 IPFS 当底座
- 为什么 ENS 域名能解析到一个网站但没有传统服务器
- 为什么 IPFS 链接 `ipfs://<CID>/...` 永远不会"换内容"——CID 一变就是另一个文件
- 为什么去中心化前端能"抗审查"——IPFS 节点遍布全球，封一个仍然能从别处拿

## 核心要点

IPFS 的工作流可以拆成 **三件事**：

1. **CID（内容地址）**：把文件切块（默认 256 KiB 一块）、每块算 SHA-256 哈希、组成 MerkleDAG（像 Git 的 tree 对象），根哈希就是 CID。类比：每页书都印了页面指纹，整本书的指纹是所有页指纹的指纹。改一字 CID 就完全变。

2. **Bitswap（块交换协议）**：节点之间互相喊"我要 CID xxx 的块"、"我有 CID yyy 的块"，像 BitTorrent 的对等交换，但每块都带可验证的哈希——拿到块自己一算就知道对方有没有骗你。

3. **DHT（分布式哈希表）**：用 Kademlia 变体（IPFS 叫 Amino DHT），所有节点共同维护一张"谁有哪个 CID"的查找表，没有中央索引服务器。底层网络全靠 **libp2p**——这层后来被独立成单独项目，被 Ethereum 2.0 等采用。

三者合起来：CID 解决"叫什么"、Bitswap 解决"怎么换"、DHT 解决"找谁"。

把传统 HTTP 的"位置 + 信任"换成"内容 + 校验"，是 IPFS 最核心的概念跳变。

## 实践案例

### 案例 1：上传一张图，从浏览器拿回来

```bash
$ ipfs add cat.png
added bafybeigdy... cat.png

$ ipfs pin add bafybeigdy...   # 防止本地 GC 删
```

打开浏览器访问公共网关：

```
https://ipfs.io/ipfs/bafybeigdy...
```

**逐部分解释**：
- `ipfs add` 把图切块、上 MerkleDAG、算出 CID
- `ipfs.io` 是 Protocol Labs 跑的网关，它内部跑 Kubo daemon，替不懂 IPFS 的浏览器去网络上把这张图捞回来
- 任何人跑自己的网关（如 cf-ipfs.com）也能拉同一份图——内容地址全网通用

### 案例 2：NFT 项目把元数据扔进 IPFS

```solidity
// 合约里只存 CID 字符串，不存图
function tokenURI(uint256 id) returns (string) {
  return string.concat("ipfs://", baseCID, "/", toString(id), ".json");
}
```

合约里 32 字节存不下一张图，但能存下一个 CID。前端读到 `ipfs://<CID>` 自动通过网关拉 JSON——这就是 OpenSea / Foundation 上 NFT 的标准玩法。

### 案例 3：本地 daemon 当团队 LAN 缓存

```bash
$ ipfs daemon                         # 启动节点
$ ipfs add big-dataset.tar            # A 同事上传，告诉 B CID
$ ipfs cat <CID> > big-dataset.tar    # B 从 A 拉，C 又从 A+B 拉
```

跑起 daemon 后，团队几个人都把 CID pin 住，第二个人拉的时候 Bitswap 优先从 LAN 同事那拿——比从 GitHub Release 下载快十倍。这也是 IPFS Cluster 的常见用法：把多台机器组成一个集群同步 pin 同一批 CID，避免单点。

## 踩过的坑

1. **不 pin 就被 GC 删**：默认只有"你 add 进去的内容"会被 pin，从别人那拉的内容是缓存，过几天 GC 就清了——以为放进去就永久存了，结果一周后 `ipfs cat` 拉不到。
2. **CID 不是 URL，无法"更新"**：内容变一字节 CID 就完全变了，不能像传统网站那样原地改。要更新只能发新 CID，再用 IPNS 或 ENS 做"指针"。
3. **Pinset 大了内存爆**：单节点 pin 超过 2000 万条后 reproviding（向 DHT 重新声明）需要 1 GiB+ 内存，很容易 OOM 重启，社区在做"分片 reprovide"修这个。
4. **去中心化不等于数据永生**：如果全网没人 pin 这个 CID，过一段时间真的就没了。Filecoin 的存在就是为了"花钱让矿工保证 pin"——光跑 IPFS 不付费没人替你长期存。
5. **网关不是 IPFS**：很多人通过 https 网关访问就以为是 IPFS，但若网关挂了或被封，本地节点照样能拉——区分"协议层"和"网关便利"。

## 适用 vs 不适用场景

**适用**：
- 不可变的公开数据：NFT 元数据、学术论文、开源软件镜像、公开数据集
- 内容寻址 + 可校验是核心需求的场景（Web3、去中心化前端 dApp）
- 团队内部大文件分发——LAN 互相传比从远端拉快

**不适用**：
- 经常更新的私有数据 → 用传统数据库 / S3 + 鉴权
- 隐私数据 → IPFS 是公开网络，CID 一传出去全网都能拉（除非自己加密 + 不公开 CID）
- 低延迟读 → DHT 路由可能秒级，不能做 CDN 替代品（除非用 Pinata / Cloudflare 这类专门网关）
- 想"永久存"但不付费 → 用 Filecoin / Arweave 的激励层
- 海量小文件场景 → 每个文件一个 CID + DHT 路由开销大，更适合"把它们打包成一个目录 CID"

## 历史小故事（可跳过）

- **2014 年**：Juan Benet 发表 IPFS 白皮书，把 BitTorrent + Git + DHT + Self-Certifying Filesystem 几个老想法揉一起。
- **2015 年**：Protocol Labs 成立，go-ipfs（后来的 Kubo）开始开发，是 IPFS 第一个能跑的实现。
- **2017 年**：Filecoin ICO 募资 2.57 亿美元，目标是给 IPFS 加激励层（"花钱让矿工 pin 你的数据"）。
- **2020 年**：libp2p 被独立成单独项目，Ethereum 2.0 / Polkadot 等都拿它当 P2P 网络层。
- **2022 年**：go-ipfs 改名 Kubo，避免与协议本身（IPFS）混淆——现在 IPFS 有 Kubo（Go）、Helia（JS）、iroh（Rust）多个实现。
- **2024 年**：DHT 改名 Amino DHT，public-good 网关 ipfs.io 默认开启 Trustless Gateway（拉块时客户端校验），减小网关被信任的范围。

## 学到什么

- **内容寻址改了什么**：URL 是"你去这家店"，CID 是"我要这个东西"——前者依赖位置和所有权，后者只依赖数据本身
- **去中心化不是免费午餐**：节点没激励就不会替你 pin 数据，Filecoin 的存在就是这个洞的修补
- **协议拆分的力量**：libp2p 从 IPFS 抽出来后被无数 web3 项目复用——好的子层值得独立
- **Web3 存储分层**：链上存 CID（小、贵但永久），链下 IPFS 存内容（大、廉但要 pin），共生关系
- **多实现的好处**：现在 IPFS 有 Kubo（Go）、Helia（JS）、iroh（Rust）三家齐头并进，协议规范因此被持续打磨

## 延伸阅读

- 视频：[IPFS in 100 Seconds](https://www.youtube.com/watch?v=5Uj6uR3fp-U)（Fireship 的 100 秒入门）
- 官方文档：[https://docs.ipfs.tech](https://docs.ipfs.tech)（概念、CLI、HTTP API 全在这）
- 白皮书：[Juan Benet, "IPFS - Content Addressed, Versioned, P2P File System" (2014)](https://github.com/ipfs/papers)
- 入门教程：[ProtoSchool — Anatomy of a CID](https://proto.school/anatomy-of-a-cid)（交互式拆 CID 字段）
- [[bitcoin-core]] —— 同样用哈希做地址，但 Bitcoin 哈希指向交易，IPFS 哈希指向任意内容
- [[web3-js]] —— 前端调智能合约时常拿到 CID，再通过 IPFS 网关展示

## 关联

- [[bitcoin-core]] —— 比 IPFS 早 6 年的 P2P 系统，启发了它"靠哈希 + DHT 找数据"的设计
- [[web3-js]] —— 前端读合约里的 CID 后通常通过 IPFS 网关展示资源
- [[aave-v3]] —— DeFi 协议前端常托管在 IPFS 以避免单点关停
- [[arbitrum]] —— L2 项目把元数据 / 配置上传 IPFS 减少链上成本
- [[aptos-core]] —— 同为去中心化基础设施，但 Aptos 重点是共识与执行，IPFS 是存储
- [[anchor]] —— Solana 上的合约框架，元数据上传 IPFS 是常见姿势

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[aave-v3]] —— Aave V3 — 借贷协议旗舰
- [[anchor]] —— Anchor — Solana 合约开发框架
- [[aptos-core]] —— Aptos — Move 系高性能 L1
- [[arbitrum]] —— Arbitrum Nitro — Offchain Labs 的 Optimistic Rollup 客户端
- [[arweave]] —— Arweave — 一次付费、永远存着的区块链
- [[bitcoin-core]] —— Bitcoin Core — 比特币参考实现
- [[filecoin]] —— Filecoin / Lotus — IPFS 之上的去中心化存储市场
- [[sia]] —— Sia / Renterd — 主机持续打卡才能拿钱的去中心化云存储
- [[snapshot]] —— Snapshot — DAO 不花 Gas 也能投票的链下治理前端
- [[storj]] —— Storj — S3 兼容的去中心化对象存储
- [[web3-js]] —— web3.js — 老牌 EVM JavaScript 客户端库

