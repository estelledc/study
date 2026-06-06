---
title: Sia / Renterd — 主机持续打卡才能拿钱的去中心化云存储
来源: 'https://github.com/SiaFoundation/renterd'
日期: 2026-05-30
子分类: 链与合约
分类: 区块链
难度: 中级
provenance: pipeline-v3
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

3. **storage proof**：host 每隔约 1000 个区块（~1 周）必须上链提交一个 Merkle 证明——证明它仍持有合约里那段数据。链随机选一个数据块要它的路径，host 要现场算才答得出。漏交：押金被罚给 renter。

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

到期前 autopilot 会自动 renew 或 migrate 到更便宜的 host。

### 案例 2：cluster 模式做大容量

bus / worker / autopilot 三个角色拆到多台机器，应对 TB 级：

- **bus**：管 contract / 元数据 / SQLite
- **worker**：管上传下载 + 纠删码计算（CPU 密集）
- **autopilot**：管 host 评分 + 续约决策

3 台 worker 横向扩展上传带宽，bus 单点存元数据。每个 worker 的 HTTP API 一致，反向代理（caddy/nginx）做负载均衡即可。

### 案例 3：当 S3 后端替代

renterd 的 HTTP API 设计接近 S3：

```js
// 应用代码
const renterd = new RenterdClient({ url, password })
await renterd.put('bucket/file.bin', buffer)
const data = await renterd.get('bucket/file.bin')
```

加层适配器就能把现有 S3 SDK 调用导到 renterd——比如博客图床、备份脚本、数据湖冷数据。便宜是真便宜，但读延迟（要从多个 host 拉切片重组）比 S3 高一个数量级。

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
- **2015 年 6 月**：Sia 主网上线，PoW 共识（和比特币同算法但不同币种），SiaCoin 开始流通
- **2021 年**：成立 Sia Foundation 非营利组织，接手协议开发
- **2022-2024 年**：用 Go 从零重写整套软件——renterd（renter）/ hostd（host）/ walletd（钱包），告别老旧的 siad 单体架构
- **2024 年**：renterd v1.0 发布，纯 HTTP API + autopilot，主推自部署友好

## 学到什么

1. **持续付费 vs 永久付费是两种存储哲学**——Sia / Filecoin 是租，Arweave 是买断；冷数据成本前者赢，永久存档后者赢
2. **storage proof 让"陌生人不删数据"成为博弈最优解**——经济惩罚比信任更管用
3. **纠删码不是炫技**：m=10, n=30 是工程权衡，要扛住 2/3 host 同时跑路
4. **autopilot 的存在说明链上原语不够用**——选 host / 续约这些"应用层 UX"得有人替用户做决策
5. **去中心化程度有梯度**：IPFS 只去中心化寻址，Filecoin 去中心化寻址+市场，Sia 去中心化全套并自带链
6. **简单胜过复杂**：Sia 的 PoW 链朴素到无聊，但十年没出过共识事故，复杂度全压在客户端

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
- [[bitcoin-core]] —— Sia 的 PoW 共识抄自比特币，但独立链
- [[go-ethereum]] —— 同类去中心化系统的 Go 实现参考

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[arweave]] —— Arweave — 一次付费、永远存着的区块链
- [[bitcoin-core]] —— Bitcoin Core — 比特币参考实现
- [[filecoin]] —— Filecoin / Lotus — IPFS 之上的去中心化存储市场
- [[go-ethereum]] —— Go-Ethereum (Geth) — 以太坊主流 Go 客户端
- [[ipfs]] —— IPFS / Kubo — 按内容哈希定位的去中心化文件系统
- [[reed-solomon-1960]] —— Reed-Solomon 编码
- [[storj]] —— Storj — S3 兼容的去中心化对象存储

