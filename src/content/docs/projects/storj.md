---
title: Storj — S3 兼容的去中心化对象存储
来源: 'https://github.com/storj/storj'
日期: 2026-05-30
子分类: 链与合约
分类: 区块链
难度: 中级
provenance: pipeline-v3
---

## 是什么

Storj 是一套**让你像调 AWS S3 一样调用，但底层文件被切成碎片散到全球几千台陌生人硬盘上**的对象存储平台（约 4.4k stars，Storj Labs 主导）。日常类比：S3 像中央仓库——所有箱子都在亚马逊的仓库里；Storj 像把箱子撕成 80 片明信片寄给 80 个不同邮局，要的时候随便找回 29 片就能拼回原箱——任何 51 个邮局倒闭都不怕。

它没有自己的区块链。它的"协调员"叫 **Satellite**：一台普通服务器，记账"哪段碎片在哪些节点"、定期审计节点是否还在线、按月把 STORJ 代币结算给提供硬盘的人。客户端用 `uplink` SDK / CLI 调用，URL 长这样：

```
sj://my-bucket/cat.png
```

外面看起来就是一个 S3 endpoint，rclone / aws-cli / 任何 S3 库都能直接接上。

## 为什么重要

不理解 Storj，下面这些事都没法解释：

- 为什么"去中心化存储"也能做到 S3 的低延迟——把"账本"从链搬到 Satellite 是关键
- 为什么 Storj 单价比 S3 便宜 80% 还能盈利——硬盘成本外包给个人节点了
- 为什么 IPFS / Filecoin 都在用 IPFS-Storj gateway——Storj 把"长期保存"问题工程化解了
- 为什么 Storj 不像 Sia / Arweave 一样发链——发链就要解决共识，反而拖慢上传速度

## 核心要点

Storj 让"把文件交给陌生人"靠谱，靠 **三层设计**：

1. **客户端纠删码（Reed-Solomon 29-of-80）**：上传前在你电脑里把 64 MiB 一个 segment 切成 80 片，每片 ~2.3 MiB。下载时任意 29 片到位就能重建——冗余比只有 2.76x（S3 是 3x），但能扛掉 51 片同时挂掉。类比：菜谱抄成 80 张明信片，谁手上拿到 29 张就能拼回原版。

2. **Satellite 协调层（链下账本）**：Satellite 是个普通 PostgreSQL + Go 服务，存"哪个 object 切成了哪 80 片、每片在哪个 node"。它不参与共识、不跑挖矿——纯粹记账 + 调度。任一时刻一个 bucket 绑定一个 Satellite，类比：你选了哪家邮政局，所有寄件记录都查那家。

3. **端到端加密 + 路径加密**：Uplink 在客户端用 AES-GCM 加密文件块，密钥从用户 passphrase 派生，**Satellite 看不到明文也看不到路径文本**——它只知道"有这么个 object，加密后的路径 hash 是 xxx"。换句话说，托管 Satellite 的人也读不懂你存了什么。

三层加起来：**纠删码解决"碎片够不够"、Satellite 解决"碎片在哪"、客户端加密解决"碎片是不是隐私"**。

## 实践案例

### 案例 1：用 uplink CLI 上传一张图

```bash
uplink setup                       # 输 access grant（含 passphrase）
uplink mb sj://photos              # 建 bucket
uplink cp ./cat.png sj://photos/cat.png
uplink share --url sj://photos/cat.png
# → https://link.storjshare.io/s/<key>/photos/cat.png
```

**逐部分解释**：

- `setup` 把 access grant（包含 satellite 地址 + API key + passphrase）存到本地配置
- `cp` 内部做了三件事：AES-GCM 加密 → 切成 64 MiB segment → 每段做 RS 29-of-80 → 并发推 80 个节点
- `share --url` 让 Satellite 帮你做一次代理，临时给一个浏览器能直接访问的 HTTPS URL

### 案例 2：跑一个 storagenode 出租自家硬盘

```bash
docker run -d --restart unless-stopped \
  -p 28967:28967 -p 14002:14002 \
  -e WALLET=0xYourEthAddr \
  -e EMAIL=you@example.com \
  -e ADDRESS=mynode.example.com:28967 \
  -e STORAGE=2TB \
  -v /mnt/storj:/app/config \
  storjlabs/storagenode:latest
```

跑完 Satellite 会陆续给你扔加密碎片，每月按"存了多少 GB · 月 + 出了多少 GB 流量"结算 STORJ 代币（ERC-20）。但有门槛：99.3% 在线率、IPv4 公网、500 GB 起。掉线 / 删数据会扣 graceful exit 抵押金。

### 案例 3：用 rclone 把 Storj 当备份目标

```bash
rclone config   # 类型选 s3，provider 选 Storj，endpoint 填 https://gateway.storjshare.io
rclone sync ./local-dir storj:my-bucket --progress
```

整个流程**跟备份到 AWS S3 一模一样**。Storj 跑了一个 S3 兼容 gateway 翻译协议——这是它最大的工程价值：旧代码不用改，换个 endpoint 就能跑。

## 踩过的坑

1. **Satellite 是单点信任**：选错 satellite 等于把元数据托管错了人；社区 satellite 如果跑路，你的 bucket 列表就丢了——数据碎片本身还在节点那里但映射没了，等于丢。

2. **S3 兼容不是 100%**：multipart upload 的某些 ETag 行为、object lock、versioning 等高级 API 和 AWS 略有出入，老库（如旧版 boto3 + 自定义 hook）容易踩兼容坑。

3. **SNO 门槛比想象高**：500 GB 起、必须 IPv4、99.3% 在线率，graceful exit（正常退役）不走完流程会扣抵押金；家庭宽带掉线频繁基本赚不到钱。

4. **冷数据成本优势没那么大**：单价确实低于 S3（约 $4 vs $23 per TB · 月），但出口流量同样收费。**存了不读**才真划算；频繁拉的热数据省不了多少。

## 适用 vs 不适用场景

**适用**：

- 大量冷数据 / 长期归档（备份、视频原片、合规存档）
- 想用 S3 API 但不想被 AWS 锁死的中小团队
- 隐私敏感（端到端加密让 Satellite 也读不懂）
- 想"拿闲置硬盘换点钱"的个人节点运营者

**不适用**：

- 强一致 / 低延迟数据库存储（不是块存储，是对象存储）
- 需要监管合规的"数据驻留某国"场景（碎片散在全球节点）
- 完全不信任任何中心化协调者——选 Sia / Arweave / Filecoin
- 上传 < 几 KB 的极小对象（segment overhead 不划算）

## 历史小故事（可跳过）

- **2014**：Shawn Wilkinson 发布 Storj v1 白皮书，主张 P2P 加密存储市场，第一版基于以太坊代币
- **2017**：ICO 募资 3000 万美元，团队进入 Storj Labs 阶段，开始全职做工程实现
- **2018**：Storj v2 上线商用产品线 Tardigrade，但完全去中心化协调（DHT 找节点）效果不稳，下载经常超时
- **2018-19**：v3 重构，承认"链下协调"是必要妥协，发表第二版白皮书定义 Satellite 模型
- **2020**：v3 主网上线，正式 S3 兼容、29-of-80 纠删码，可用性达到企业级 SLA
- **之后**：陆续加 IPFS gateway、Edge Service、企业版 Satellite 自建支持，目标转向"开源 S3 替代品"

## 学到什么

1. **去中心化不等于上链**——Storj 把账本留在 Satellite（链下），换来 S3 级别的延迟和可用性，证明"协议层去中心化 + 协调层中心化"是个完全合理的设计点
2. **纠删码 > 副本**——RS 29-of-80 用 2.76x 冗余扛 51 片同时挂，S3 三副本 3x 冗余只能扛 2 个 region 挂；同样的钱买更多容错
3. **协议兼容是去中心化产品的护城河**——`endpoint=...storjshare.io` 一行配置就接上 rclone / boto3，让迁移成本归零，比"全新 SDK"路线友好十倍
4. **架构是权衡**：Satellite 引入了单点信任，但把"协调"工程问题降到了"运维一台 PostgreSQL"——比让节点跑共识便宜几个数量级

## 延伸阅读

- 官方白皮书 v3：[storj.io/storjv3.pdf](https://www.storj.io/storjv3.pdf)（70 页，Satellite 模型 + 纠删码细节都在）
- Reed-Solomon 直觉教程：[Backblaze — Reed-Solomon Coding](https://www.backblaze.com/blog/reed-solomon/)（看完就懂"碎成 80 片任意 29 片能拼回"是怎么做到的）
- 工程博客：[Storj — How storage nodes are paid](https://www.storj.io/blog/how-storage-node-operators-are-paid)（节点经济学）
- 视频：Storj 官方 YouTube 上 v3 架构 30 分钟讲解
- [[ipfs]] —— 内容寻址 + libp2p 的另一条路径
- [[filecoin]] —— 用区块链 + 抵押币逼节点保留数据
- [[sia]] —— 链上 file contract + storage proof 的最纯方案
- [[arweave]] —— 一次付费永久存储的极端选择

## 关联

- [[ipfs]] —— Storj 提供 IPFS gateway，CID 可解析到 Storj 后端做"持久层"补强
- [[filecoin]] —— 同样做"激励陌生人存数据"，但 Filecoin 用链 + PoSt 证明，Storj 用 Satellite + 审计；前者强、后者快
- [[sia]] —— 都用纠删码 + 经济激励，但 Sia 把账本上链，Storj 留在链下；Sia 更去中心、Storj 更易用
- [[arweave]] —— 走相反路：Arweave 一次付费永久存，Storj 按月计费可删；典型的"永久 vs 按用付费"二选一
- [[reed-solomon]] —— Storj 纠删码核心算法，所有"丢一半还能恢复"的故事都建立在这上面
- [[s3-api]] —— Storj 兼容的协议层；让旧代码零成本迁移，是商业落地的关键支点
- [[libp2p]] —— Storj 自研了类似的 P2P 层（叫 storj/drpc），刻意没用 libp2p，因为不想引入额外依赖

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[arweave]] —— Arweave — 一次付费、永远存着的区块链
- [[filecoin]] —— Filecoin / Lotus — IPFS 之上的去中心化存储市场
- [[ipfs]] —— IPFS / Kubo — 按内容哈希定位的去中心化文件系统
- [[sia]] —— Sia / Renterd — 主机持续打卡才能拿钱的去中心化云存储

