---
title: Bitcoin 白皮书
来源: 'Satoshi Nakamoto, "Bitcoin: A Peer-to-Peer Electronic Cash System", 2008-10-31'
日期: 2026-05-29
分类: 分布式系统 / 密码学
难度: 中级
---

## 是什么

Bitcoin 是 2008 年一个化名"中本聪"的人发出的 9 页 PDF，里面提出了一种**没有中央银行也能发行的钱、没有第三方也能完成的转账**。

日常类比：想象**全村人手里各拿一本一样的账本**。任何一笔交易（"张三给李四 100 块"）都要朝全村大喊一遍，每个人都把它抄到自己账本上。只要大家**抄账的方法一样**，就算少数几本账本被涂改，多数人对账后还是能查出真账。

中本聪要解决的就是"抄账方法怎么定才不会乱"——这套方法他叫 **PoW + 最长链 + UTXO**，下面会逐个拆。

## 为什么重要

不理解 Bitcoin，下面这些事都没法解释：

- **第一个真的能跑起来的去中心化数字货币**——之前 Chaum 的 e-Cash、Adam Back 的 Hashcash、戴维的 b-money 都尝试过，全部失败
- 它启发了**以太坊 / DeFi / NFT / Web3 整个赛道**——你可以不信这些方向，但 17 年的资金和工程量是事实
- 它把 6-7 项独立技术（**工作量证明 + UTXO + Merkle 树 + ECDSA 数字签名 + P2P 网络 + 经济激励**）拼成一个**实际工作的系统**——单看每一项都不新，组合起来才是真创新
- 它给了 1980 年代理论问题"**拜占庭将军问题**"（[[lamport-1978]]）一个**公开网络下的工程解**——之前所有方案都假设节点身份已知

## 核心要点

Bitcoin 的核心可以拆成 **三件互相支撑的事**：

1. **UTXO 模型**：账本上记的不是"张三有多少钱"，而是一堆**还没被花掉的"零钱"**（Unspent Transaction Output）。每次转账都是"消耗几张旧零钱、产生几张新零钱"，找零自己变一张新 UTXO 给自己。

2. **工作量证明（PoW）**：要把新一页账本加到全村账本上，必须**先做一道很费电的算术题**——找一个数字，让区块的哈希前面有足够多的 0。算这道题平均要 10 分钟，谁先算出来谁就有权写这一页。

3. **最长链规则**：如果同一时刻有两个人都算出了答案，全村就**先各抄各的**；接下来谁的链先长出新一页，大家就跟谁。短的那一支被废弃。**累积算力最多的那条链 = 真账本**。

这三件事缺一不可：UTXO 让"哪笔钱能花"清楚；PoW 让"谁能记账"和**物理算力**绑定（伪造身份不顶用，要伪造算力要电费）；最长链规则让暂时分歧**最终收敛到一条**。

## 实践案例

### 案例 1：Alice 给 Bob 转 0.5 BTC 怎么发生

```
Alice 之前收过两笔 UTXO:  0.3 BTC + 0.4 BTC
要转给 Bob:                0.5 BTC

Alice 构造一笔交易：
  输入: [UTXO_a (0.3 BTC), UTXO_b (0.4 BTC)]   <- 必须用旧的
  输出: [Bob 的新 UTXO (0.5 BTC),
         Alice 自己的找零 UTXO (0.2 BTC - 手续费)]
  签名: 用 Alice 的私钥签整笔交易

广播 → 矿工打包 → 6 个区块后 Bob 可以认为这笔基本不会被翻盘
```

注意 **Alice 的两张旧 UTXO 整张消耗**——零钱只能整张花，多的部分自己找零回来。这跟现金的"两张 50 找你 20"完全一样。

### 案例 2：一个区块长什么样

每个区块头是 **80 字节**，结构很简单：

```
版本号       (4 字节)
前一个块的 hash  (32 字节)   <- 链式结构靠这里
所有交易的 Merkle 根 (32 字节)  <- 把成千上万笔交易压成 32 字节
时间戳       (4 字节)
难度目标     (4 字节)
nonce        (4 字节)        <- 矿工要暴力试的就是它
```

矿工干的事：**改 nonce，算 SHA-256，看 hash 够不够小**。算到了就广播，全网验证，进入新一块。

### 案例 3：51% 攻击为什么贵

要重写历史，攻击者必须**比全网剩下的人加起来算得还快**。Bitcoin 全网算力大概等于**几百个核电站满负荷**——你要超过它，意味着：

- 几十亿美元的 ASIC 矿机（造完只能挖 BTC，不能干别的）
- 全球范围找便宜电（多数地区一年电费就几十亿）
- 攻击成功的当天币价崩盘，你的矿机和持币一起亏

**经济上没人愿意干**，这是 Bitcoin 真正的安全防线，不是密码学。

## 踩过的坑

1. **UTXO 不是余额**——钱包要自己跟踪所有 UTXO 才能告诉你"还剩多少钱"。早期钱包代码 bug 经常报错余额、丢币；新人迁移钱包不导 UTXO 集合就找不到钱。

2. **私钥丢了 = 钱没了**——Bitcoin 没有"忘记密码点重置"。2013 年英国一位早期挖矿玩家把含 7500 BTC 的硬盘扔进垃圾场，至今没找回；这种故事不止一个。**不像银行，没人能帮你**。

3. **6 个确认 ≠ 绝对安全**——主网 BTC 6 个块（约 1 小时）后基本不可逆，但**小币种**（BTG、ETC）历史上发生过 22 块、3000 块的 reorg，攻击者租算力就能干。即时支付（咖啡店扫码）等不起 1 小时，所以 BTC 实际不适合日常买咖啡。

4. **PoW 浪费电**——估算 130-180 TWh/年（巴拉圭一国电网），这是 PoS 派的主要批评点，也直接导致 Ethereum 2022 转 PoS。

## 适用 vs 不适用场景

**适用**：
- 大额跨境转账（不依赖银行 / SWIFT，结算几小时内完成）
- 价值储存（"数字黄金"叙事，对抗法币通胀）
- 需要无许可发行的资产（任何人能挖、能持、能转）
- 抗审查支付（监管难以冻结私钥控制的钱包）

**不适用**：
- 日常小额支付（7 TPS，1 小时确认，咖啡店等不起）→ 用 Lightning 等 L2
- 智能合约 / DeFi（Bitcoin 脚本无循环，表达力弱）→ 用 Ethereum
- 隐私交易（链上完全公开，地址可追溯）→ 用 Monero / Zcash
- 高频交易场景（确认延迟 + 手续费波动）→ 任何区块链都不适合

## 历史小故事（可跳过）

- **1982 年**：David Chaum 发表盲签名论文，1990s 商业化产品 DigiCash 1998 破产——**败在中心化银行宕机**
- **1997 年**：Adam Back 提出 Hashcash 用 PoW 防垃圾邮件——**没有账本概念**
- **1998 年**：Wei Dai 写 b-money，第一次提出"分布式账本 + PoW 出币"——**没解决双花**
- **2005 年**：Nick Szabo 写 bit-gold，链式 PoW + 时间戳——**没解决经济激励**
- **2008-10-31**：化名"Satoshi Nakamoto"的人把 9 页 PDF 发到 cryptography mailing list
- **2009-01-03**：创世区块挖出，coinbase 留言 "Chancellor on brink of second bailout for banks"——既是时间戳证据，也是政治表态
- **2010-05-22**：程序员 Laszlo 用 1 万 BTC 买了两个披萨——**第一笔已知现实交易**
- **2011 年**：中本聪在论坛发完最后一帖后**永久消失**，至今身份不明
- **2026 年**：BTC 仍在跑，中本聪那 100 万枚 BTC 一枚没动过

## 学到什么

1. **组合远胜原创**——Hashcash + Merkle 树 + ECDSA + UTXO 单看都已经存在十年以上，把它们装进一个**自洽闭环**才是真贡献
2. **经济激励是真正的安全锚**——密码学只能保证"伪造贵"，让"诚实更划算"靠的是 block reward + 币价
3. **理论 → 工程 30 年**——Lamport 1978 拜占庭将军是理论，2008 Bitcoin 是工程化解；中间隔了整整 30 年
4. **白皮书 ≠ 完整规范**——9 页 PDF 留了大量工程细节（reorg 时 UTXO 怎么恢复、签名编码、难度调整边界），后续 Bitcoin Core 代码才把它们补完

## 延伸阅读

- 白皮书 9 页 PDF：[bitcoin.org/bitcoin.pdf](https://bitcoin.org/bitcoin.pdf)（密度高，但不长）
- 视频教程：[3Blue1Brown — How Does Bitcoin Actually Work?](https://www.youtube.com/watch?v=bBC-nXj3Ng4)（25 分钟把 PoW 和签名讲清）
- 入门书：Andreas Antonopoulos *Mastering Bitcoin*（O'Reilly，作者把代码层和概念层都讲到位）
- [[lamport-1978]] —— 拜占庭将军问题原始论文，Bitcoin 解决的就是它在公开网络的版本
- [[rsa]] —— 公钥密码学的奠基，ECDSA 签名是它的椭圆曲线表亲

## 关联

- [[lamport-1978]] —— 拜占庭将军问题，Bitcoin 是它在 permissionless 场景下的工程解
- [[rsa]] —— Bitcoin 用 ECDSA 签名，思想同源（公钥密码学）
- [[diffie-hellman]] —— 公钥密码学家族另一个经典，Bitcoin 钱包地址生成与之相关
- [[paxos]] —— 已知节点列表下的共识，PBFT / Raft 是它的徒孙；Bitcoin 走了完全不同的 PoW 路径
- [[raft]] —— 工程化的 Paxos；和 Bitcoin 的对比能看出"封闭集群 vs 开放网络"两种共识风格

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[aave-v3]] —— Aave V3 — 借贷协议旗舰
- [[ape-framework]] —— Ape Framework — Python 智能合约开发一条龙
- [[arweave]] —— Arweave — 一次付费、永远存着的区块链
- [[bitcoin-core]] —— Bitcoin Core — 比特币参考实现
- [[byzantine-generals-1982]] —— 拜占庭将军问题 — 节点能撒谎时怎么达成一致
- [[compound-v3]] —— Compound III (Comet) — 单抵押借贷重构
- [[diffie-hellman]] —— Diffie-Hellman 密钥交换
- [[dwork-dp-icalp-2006]] —— 差分隐私 — 让统计结果有用但查不到任何一个人
- [[erigon]] —— Erigon — 存储优化型以太坊客户端
- [[filecoin]] —— Filecoin / Lotus — IPFS 之上的去中心化存储市场
- [[foundry]] —— Foundry — Paradigm 出品的 Rust 合约工具链
- [[go-ethereum]] —— Go-Ethereum (Geth) — 以太坊主流 Go 客户端
- [[lamport-1978]] —— Lamport 1978 — 分布式系统里没有"绝对的同时"
- [[ledger-app-sdk]] —— Ledger App SDK — 在硬件钱包里写应用的 C 框架
- [[makerdao]] —— MakerDAO — 用抵押 ETH 铸出锚定美元的 DAI
- [[paxos]] —— Paxos — 分布式共识算法
- [[raft]] —— Raft — 易理解的共识算法
- [[reed-solomon-1960]] —— Reed-Solomon 编码
- [[remix-ide]] —— Remix IDE — 浏览器内 Solidity IDE
- [[rsa]] —— RSA 公钥密码
- [[solana]] —— Solana — Rust 写的高性能 PoH 链
- [[sui]] —— Sui — 把链上资产拆成一个个独立对象的 L1
- [[uniswap-v3]] —— Uniswap V3 — 集中流动性 AMM 核心合约
- [[zcash]] —— Zcash — 让转账在链上"既能被验证，又看不见内容"

