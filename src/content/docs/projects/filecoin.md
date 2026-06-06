---
title: Filecoin / Lotus — IPFS 之上的去中心化存储市场
来源: 'https://github.com/filecoin-project/lotus'
日期: 2026-05-30
子分类: 链与合约
分类: 区块链
难度: 中级
provenance: pipeline-v3
---

## 是什么

Filecoin 是一条**专门为存储交易服务的区块链**：用户出钱让矿工把文件存在硬盘里，链上账本记录交易，矿工每隔一段时间要交一份"我还在存着"的数学证明，否则就被罚抵押币。Lotus 是 Protocol Labs 用 Go 写的官方实现。

日常类比：像一个**全球公共仓库 + 摄像头自查系统**。你租别人家车库放箱子（存储交易），房东每周要拍一张箱子还在的照片上传公告板（PoSt 周期证明），如果没拍就扣他的押金。整个过程没有平台方，规则全部写在链上的智能合约里。

它和 IPFS 是同一家公司的姐妹项目：IPFS 解决"按内容找文件"，但节点没动力长期保存；Filecoin 在 IPFS 之上加上**钱 + 惩罚**，让长期保存变成有利可图的生意。两个项目可以分别使用，但合在一起才能闭环。

## 为什么重要

不理解 Filecoin，下面这些事都没法解释：

- 为什么 IPFS 的文件经常下不动——节点没激励长期保存，缓存说丢就丢
- 为什么有人会买几千块硬盘搭机房当"矿工"——存储算力直接换出块权
- 为什么 Web3 圈讨论"冷数据存档 / NFT 元数据持久化"绕不开 Filecoin
- 为什么"区块链存储"这个赛道做了 5 年还没几个能跑——证明系统工程化太难

## 核心要点

Filecoin 解决"如何相信远程节点真的还在存我的数据"分成 **三招**：

1. **PoRep（Proof of Replication，复制证明）**：矿工接单后要做一次叫"密封"的操作——把文件用一种慢函数加密成独特的副本写到磁盘，再上传一个证明。类比：警察让你在指定纸上手写一份合同，伪造比写还慢。这一步保证你不能用同一份数据骗多份订单的钱。

2. **PoSt（Proof of Spacetime，时空证明）**：链上每 24 小时随机挑战矿工"把第 X 个字节读出来给我看"，矿工必须能立即返回，证明数据没被删。类比：仓库随机抽查货架编号。挑战是公开可验证的，任何节点都能复算。

3. **EC 共识（Expected Consensus）**：出块权由 storage power 概率加权——你存了越多有效数据（封过的扇区），越可能被选为出块矿工。类比：你养的羊越多，村长越可能找你议事。这把"出块权"和"真实存储贡献"绑在一起，相比 PoW 烧电更有意义。

## 实践案例

### 案例 1：跑一个 Lotus 全节点同步链

```bash
make all
./lotus daemon
./lotus sync wait
```

**逐部分解释**：

- `make all` 编译 lotus / lotus-miner / lotus-worker 三个二进制——节点、矿工、封装工人
- `lotus daemon` 启动主进程，开始从其他节点拉链头
- `lotus sync wait` 阻塞直到追平最新区块（主网首次同步要十几小时，因为账本几百 GB）

跑完你就有一个能查任何存储交易的本地节点。

### 案例 2：作为客户挂一笔存储 deal

```bash
lotus client import ./photo.jpg
lotus client deal <data-cid> <miner-id> 0.0001 518400
```

**逐部分解释**：

- `client import` 把本地文件切片建索引，得到内容地址（CID）
- `client deal` 发起交易：出价 0.0001 FIL / 区块，存 518400 个区块（约半年）
- 矿工接单后会做密封，几小时后链上 deal 状态从 `Proposed` 变 `Active`，钱才扣

整个过程**不需要可信第三方**——证明在链上，作弊会被自动罚。

### 案例 3：lotus-miner 和 lotus-worker 分离

```bash
# 主机：管理扇区生命周期 + 提交证明
lotus-miner run

# 旁挂多台机器：只跑 CPU 密集的密封
lotus-worker run --listen 0.0.0.0:2345
```

**逐部分解释**：

- `lotus-miner` 单点保存矿工身份和密钥，处理链上交互和挑战
- `lotus-worker` 是无状态计算节点，专门跑慢函数密封——可以横向扩到几十台
- 工业级矿场常见拓扑：1 miner + N workers + 共享 NFS / Ceph 存扇区
- Worker 之间互不感知，miner 通过 RPC 派发任务并收回扇区文件

这种拆分是 Filecoin 工程的核心妥协——证明计算太重，单机扛不住，必须横向化。

## 踩过的坑

1. **把 Filecoin 当 IPFS 的付费版**：IPFS 是寻址协议，节点缓存非强约束；Filecoin 是激励链，矿工签了 deal 就必须按时交证明，否则被 slash（扣押金）。两者层次完全不同。

2. **扇区密封极慢极吃资源**：32 GiB 扇区单封要几小时，需要 128 GB 内存 + 多核 CPU + GPU 加速，消费级机器跑矿基本亏本。

3. **PoSt 错过窗口直接被罚**：每个矿工有 24 小时一轮的挑战窗口，漏交（cron 挂了 / 网络抖动 / 节点崩溃）抵押币立刻扣，新人在测试网经常忽视监控就血亏。

4. **master 是开发分支，主网用 stable tag**：`git checkout master` 跑出来的二进制可能与主网协议不一致，必须 `git checkout v1.x.x` 拿稳定 release，否则共识不一致直接孤立。

## 适用 vs 不适用场景

**适用**：
- 长期冷归档（科研数据 / 区块链历史快照 / NFT 媒体文件）需要密码学保证还在
- 去中心化应用需要分布式存储后端，又不想信任单一云厂商
- 想了解 PoRep / PoSt 这类存储证明工程化怎么做的研究者
- 跨地理冗余备份——网络全球分布，数据在不同司法辖区天然多活

**不适用**：
- 高频读写 / 低延迟场景——挂 deal 到上链要几小时，读延迟也比 S3 高
- 需要细粒度访问控制 / 加密分享的私密文件（要在客户端先加密再存）
- 单文件 < 几 MB 的小文件——扇区是 32 GiB 起步，小文件浪费严重
- 法律合规要求数据可被随时彻底删除——链上交易记录不可撤销

## 历史小故事（可跳过）

- **2014**：Juan Benet 写 Filecoin 白皮书，构想"激励化的 IPFS"，与 IPFS 同出 Protocol Labs。
- **2017-08**：Filecoin ICO 募 2.57 亿美元，创当时纪录，主网原计划 2018 上线。
- **2018-2020**：PoRep / PoSt 工程化卡了三年，密封算法多次重写，证明大小从 GB 降到 KB。
- **2020-10**：mainnet 正式启动，第一个区块由 zkSNARK 证明守护，矿工开始扩张存力。
- **2023-**：Filecoin 接入 EVM（FVM），让智能合约直接调存储 deal，从纯存储链向通用链扩展。

## 学到什么

1. **共识可以不只是 PoW / PoS**——"有用的工作"（证明真的存了数据）也能当共识依据，这是 Filecoin 最大的设计创新，给后来的 Proof of Useful Work 系列开了头
2. **激励层和寻址层要分离**——IPFS 管"怎么找到"，Filecoin 管"为什么愿意保留"，分层让两边都能各自演进，工程上耦合最少
3. **加密学慢函数 + 链上抽查** 是远程不可信存储的通用模板——后来很多 DA（数据可用性）方案都在抄这套思路
4. **密码学论文到能跑要 5 年**——白皮书 → 工程实现的鸿沟极宽，PoRep 改了七八版才有性能可用，这是 Web3 项目延期的常态

## 延伸阅读

- 官方 Spec：[Filecoin Protocol Specification](https://spec.filecoin.io/)（PoRep / PoSt / EC 共识三大块的权威定义）
- 视频：[Juan Benet — Filecoin Mainnet Launch](https://www.youtube.com/watch?v=EClPAFPeXIQ)（创始人讲设计哲学，1 小时）
- 论文：[Filecoin: A Decentralized Storage Network](https://filecoin.io/filecoin.pdf)（2017 白皮书 36 页）
- 新手起步：[Lotus Docs](https://lotus.filecoin.io/)（怎么跑节点 / 怎么挂 deal / 怎么当矿工）
- [[ipfs]] —— Filecoin 的存储底座，先懂内容寻址才好理解上层激励
- [[bitcoin]] —— 共识激励的鼻祖，和 Filecoin 对比能看出"无用 PoW vs 有用证明"的差别

## 关联

- [[ipfs]] —— Filecoin 的内容寻址底层，所有文件最终用 CID 标识
- [[bitcoin]] —— 共识 + 激励的最早实践，Filecoin 把 PoW 换成"证明你存了数据"
- [[bitcoin-core]] —— 同样是某条链的官方参考实现，可对比客户端架构
- [[go-ethereum]] —— 另一个 Go 写的链节点，状态树 / P2P 层有许多通用做法
- [[chainlink]] —— 链下数据上链的预言机，与 Filecoin 链下存储上链是镜像问题
- [[paxos]] —— 传统分布式共识，与 Filecoin EC 概率共识的"确定 vs 概率"差异是经典对照
- [[raft]] —— 强一致协议，和 Filecoin 这种"概率最终一致"形成思想对照
- [[gfs]] —— 中心化的存储系统经典，与 Filecoin 去中心化拓扑形成端点对比

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[arweave]] —— Arweave — 一次付费、永远存着的区块链
- [[bitcoin]] —— Bitcoin 白皮书
- [[bitcoin-core]] —— Bitcoin Core — 比特币参考实现
- [[chainlink]] —— Chainlink — 智能合约的"感官系统"
- [[gfs]] —— GFS — 编译器决定不做哪些事
- [[go-ethereum]] —— Go-Ethereum (Geth) — 以太坊主流 Go 客户端
- [[ipfs]] —— IPFS / Kubo — 按内容哈希定位的去中心化文件系统
- [[paxos]] —— Paxos — 分布式共识算法
- [[raft]] —— Raft — 易理解的共识算法
- [[sia]] —— Sia / Renterd — 主机持续打卡才能拿钱的去中心化云存储
- [[storj]] —— Storj — S3 兼容的去中心化对象存储
- [[zcash]] —— Zcash — 让转账在链上"既能被验证，又看不见内容"

