---
title: Sia / Renterd — 主机持续打卡才能拿钱的去中心化云存储
来源: 'https://github.com/SiaFoundation/renterd'
日期: 2026-05-30
分类: blockchain / 中文
难度: 中级
---

## 是什么

Sia 是一条专门做**去中心化云存储**的区块链。日常类比：像把硬盘租给隔壁邻居存东西，但**邻居每周得拍一张"我还在保管"的照片**才能领下周房租，不拍就罚他押金。

你（renter）想存 100 GB 文件，把钱（SiaCoin）押到链上，软件自动从全球几百个 host 里挑 30 个，把文件**纠删码切片**分发出去。host 只有定期向链上**提交存储证明**（storage proof），合约里的钱才会按区块分给他；漏交一次，押金扣掉。

Renterd 是 Sia Foundation 用 Go 重写的现代客户端，替代 2015 年那套老旧的 `siad`：自带 web UI、autopilot 自动选主机/续约、纯 HTTP API：

```bash
renterd --http :9980 --network mainnet
# 浏览器开 http://localhost:9980 → 设 allowance → 上传文件
```

## 为什么重要

- 不理解 host 持续付费模型，无法解释 Sia 为什么便宜：S3 一份钱存"永远"，Sia 一份钱只租"几个月"，到期得续
- 不理解纠删码 + storage proof，无法解释为什么单 host 跑路文件还在
- 不理解 file contract 抵押机制，无法解释 host 凭什么不删数据然后骗租金
- 不理解 renterd autopilot，无法解释为什么自部署节点比 IPFS pin 服务省心

## 核心要点

Sia 让"陌生人帮你存数据"靠谱，靠 **三层机制**：

1. **纠删码切片**：用 Reed-Solomon (默认 m=10, n=30) 把文件切成 30 片，任意 10 片就能恢复。类比：把一张菜谱抄成 30 张明信片，谁手里有 10 张就能拼回原版——20 个邮差弄丢明信片都不怕。

2. **链上 file contract**：renter 和 host 在 SiaCoin 链上签合同，双方各押一笔抵押金。合约写明：存多少 GB / 多久 / 每区块多少租金 / 几个区块查一次证明。链是裁判，不是中介。

3. **storage proof**：host 每隔约 1000 个区块（~1 周）必须上链提交一个 Merkle 证明（像抽查仓库某一箱货的封条路径）——证明它仍持有合约里那段数据。链随机选一个数据块要它的路径，host 要现场算才答得出。漏交：押金被罚给 renter。

三层加起来：**经济激励压住作恶动机**——host 想拿钱就必须真存，删了就赔。

## 实践案例

### 案例 1：单节点自部署存家庭照片

最简单的姿势——一台 NAS 上跑 renterd：

```bash
docker run -d -p 9980:9980 \
  -v /data/renterd:/data \
  ghcr.io/siafoundation/renterd:latest
```

打开 web UI，钱包充值约 200 SC（足够 100 GB × 3 个月），设 allowance（预算上限），autopilot 自动选 30 个 host 形成合约。点上传，文件自动纠删码切片分发：

```bash
curl -u :password -X PUT \
  http://localhost:9980/api/worker/objects/photo.jpg \
  --data-binary @photo.jpg
```

**逐部分解释**：镜像挂数据目录；UI 设预算后 autopilot 签合约；`PUT .../objects/` 走 worker API 切片上传；到期前会 renew/migrate。

### 案例 2：cluster 模式做大容量

bus / worker / autopilot 拆到多机，应对 TB 级：

```bash
# 机 A：默认起 bus（元数据/合约/SQLite）
renterd --http :9980
# 机 B：worker 连远程 bus，关掉本机 autopilot
renterd --bus.remoteAddr http://bus:9980/api/bus \
  --autopilot.enabled=false --http :9981
# 机 C：只跑 autopilot，关掉本机 worker
renterd --bus.remoteAddr http://bus:9980/api/bus \
  --worker.enabled=false
```

**逐部分解释**：

- **bus**：管 contract / 元数据 / SQLite，先起它
- **worker**：CPU 密集的切片与传输，可水平加机器
- **autopilot**：给 host 打分并续约；反向代理把多个 worker 当同一入口

### 案例 3：用 HTTP API 当冷存储后端

renterd 暴露与对象存储相近的 HTTP API（不是虚构 SDK）：

```bash
# 上传
curl -u :password -X PUT \
  http://localhost:9980/api/worker/objects/bucket/file.bin \
  --data-binary @file.bin
# 下载
curl -u :password -o file.bin \
  http://localhost:9980/api/worker/objects/bucket/file.bin
```

**逐部分解释**：`-u :password` 是 API 密码；路径即对象键；读时要从多 host 拉片重组，延迟常比 S3 高一个数量级，适合图床冷数据/备份，不适合 CDN 热读。

## 踩过的坑

1. **钱包余额不够 2× allowance**：autopilot 续约时要锁新合约的押金，钱不够就续不上，老合约到期数据就 migrate 不走甚至丢失。官方建议**始终留 2 倍 allowance** 在 wallet。

2. **备份不停机就备份**：renterd 用 SQLite + 上传 buffer，运行中拷贝数据库会拷到半截事务。备份前必须 `systemctl stop renterd` 再 `cp -r /data/renterd /backup/`。

3. **consensus 没同步就上传**：链没同步完时 contract 形成会静默失败，UI 只显示"forming"卡住不动。先看 consensus tip 是不是追上 mainnet 高度，再操作。

4. **autopilot 默认偏激进**：默认参数会持续 split wallet output 来形成新合约，钱包输出不够时反复失败刷日志。新手装好先把 autopilot 调成手动模式跑一周，再放它自动。

## 适用 vs 不适用场景

**适用**：
- 冷数据归档（备份、家庭照片、监控录像）—— 比 S3 便宜 5-10 倍
- 需要抗审查 / 抗封号的内容（链上合约谁也封不了）
- 有自部署能力、能管钱包和合约续约的开发者
- 中等容量（GB 到 TB），愿意接受秒级读延迟

**不适用**：
- 热数据 / 低延迟读（CDN 场景请用 S3 + CloudFront）
- 不会管钱包私钥的小白用户（钱丢了数据也没了）
- 需要永久存储且不想再续费 → 用 [[arweave]]（一次付费）
- 需要内容寻址但不要付费机制 → 用 [[ipfs]]
- 需要 PoSt + 可证空间 + 大主网生态 → 用 [[filecoin]]

## 历史小故事（可跳过）

- **2014 年**：MIT 学生 David Vorick 在 HackMIT 写了 Sia 原型，灵感来自 BitTorrent 但加了链上付费
- **2015 年 6 月**：Sia 主网上线；PoW 用 Blake2b（刻意不同于比特币 SHA-256，防 merge mining），SiaCoin 开始流通
- **2021 年**：成立 Sia Foundation 非营利组织，接手协议开发
- **2022-2024 年**：用 Go 从零重写——renterd / hostd / walletd，告别老旧 siad 单体
- **2024 年**：renterd v1.0 发布，纯 HTTP API + autopilot，主推自部署友好

## 学到什么

1. **持续付费 vs 永久付费是两种存储哲学**——Sia / Filecoin 是租，Arweave 是买断
2. **storage proof 让"陌生人不删数据"成为博弈最优解**——经济惩罚比信任更管用
3. **纠删码不是炫技**：m=10, n=30 要扛住约 2/3 host 同时跑路
4. **autopilot 说明链上原语不够用**——选 host / 续约得有人替用户做决策
5. **简单胜过复杂**：Sia 的 Blake2b PoW 朴素，公开记录未见重大共识事故，复杂度压在客户端

## 延伸阅读

- 官方文档：[Sia 101](https://docs.sia.tech/)（renter 视角入门）
- renterd README：[github.com/SiaFoundation/renterd](https://github.com/SiaFoundation/renterd)（cluster 部署最详细）
- 白皮书：[Sia: Simple Decentralized Storage](https://sia.tech/sia.pdf)（Vorick 2014，10 页）
- 对比博客：[Storage Wars: Sia vs Filecoin vs Arweave](https://blog.sia.tech/)（付费模型差异）
- 视频：David Vorick 在 Devcon 关于 Sia 经济模型的演讲，讲了 host 抵押系数为何选 2 倍
- [[ipfs]] —— 内容寻址协议，Sia 不用 IPFS 但思想类似
- [[filecoin]] —— 同样靠抵押 + 证明的存储链，但叠在 IPFS 上

## 关联

- [[ipfs]] —— 内容寻址 P2P 文件系统，无付费机制只解决寻址
- [[filecoin]] —— Sia 的最大竞品，IPFS 之上的存储市场，PoSt 证明更复杂
- [[arweave]] —— 一次付费永久存，靠捐赠基金和递归证明，与 Sia 持续付费哲学相反
- [[reed-solomon-1960]] —— Sia 用的纠删码本体，60 年的老数学还在打工
- [[bitcoin-core]] —— 同为 PoW 独立链，但 Sia 用 Blake2b 而非 SHA-256
- [[go-ethereum]] —— 同类去中心化系统的 Go 实现参考

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[storj]] —— Storj — S3 兼容的去中心化对象存储
