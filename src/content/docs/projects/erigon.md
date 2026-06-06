---
title: Erigon — 存储优化型以太坊客户端
来源: 'https://github.com/ledgerwatch/erigon'
日期: 2026-05-29
子分类: 链与合约
分类: 区块链
难度: 高级
provenance: pipeline-v3
---

## 是什么

Erigon 是一个**用 Go 写的以太坊客户端**，从 go-ethereum 分叉而来，目标是让"装一个完整以太坊节点"这件事**少占磁盘、快速同步**。日常类比：原版 geth 像把图书馆每本书都买一本回家自己读；Erigon 像直接买一份"已经按主题归档好的索引盒"，省一大半空间，找东西也快。

跑起来最小命令长这样：

```sh
git clone --branch release/3.x --single-branch https://github.com/erigontech/erigon.git
cd erigon && make erigon
./build/bin/erigon --datadir=/data/erigon --http --ws
```

跑完这条就有一个能 RPC 调用的全节点：约 4 小时同步主网到链尾，磁盘约 1.1TB（全节点档位），相比传统 geth archive 模式的 2TB+ 直接砍一半多。

## 为什么重要

不理解 Erigon 在做什么，就解释不了下面这些事：

- 为什么有人愿意维护 go-ethereum 的"性能 fork"——区块链客户端的瓶颈不是 CPU，是**磁盘 IO 与状态树膨胀**
- 为什么 Erigon 把"账户状态树"拆成扁平 KV 存储——**Merkle Patricia Trie 每查一次状态都要走 log(n) 层，IO 放大严重**
- 为什么"归档节点"曾经要 12TB+ 磁盘但 Erigon 1.6TB 就能存完——**历史数据可以做成不可变快照文件，不必塞进活跃数据库**
- 为什么以太坊有 4-5 个并行的客户端实现（geth / Erigon / Nethermind / Besu）——**多客户端是抗共识层 bug 的网络保险机制**

## 核心要点

Erigon 的省空间 + 快同步靠**三个机制**叠加：

1. **扁平 KV 存储（Flat KV）**：账户和存储不再用嵌套的 Patricia Trie 当主存，改成一张大表，键直接是地址 + slot。类比：原来查一个学生成绩要先翻"年级 → 班级 → 学号"三层抽屉，现在直接按身份证号一查就到。

2. **阶段化同步（Staged Sync）**：把同步拆成 12+ 个阶段（headers / bodies / senders / execution / hashing / ...），每阶段批量做完再进下一阶段，临时数据先攒在文件里再写库。类比：搬家不是一件件搬，先把同类东西打包成箱再一次装车。

3. **不可变快照（Snapshots `.seg`）**：历史数据切成一组只读 segment 文件，按 domain（state）/ history / index / accessor 四类分。冷数据可以放慢盘，热数据放 NVMe。类比：旧报纸进档案室上架，桌面只留本周的。

这三件事加在一起，让"全节点不再是天文级硬件门槛"。

## 实践案例

### 案例 1：跑一个主网全节点

最常见的姿势，给 dApp 后端做 RPC 来源：

```sh
./build/bin/erigon \
  --datadir=/data/erigon \
  --chain=mainnet \
  --http --http.api=eth,net,web3,erigon \
  --ws \
  --prune.mode=full
```

**逐部分解释**：

- `--datadir` 状态和快照都落在这；用 NVMe 不要用网盘
- `--prune.mode=full` 是 Erigon 3 的默认值，**只保留 The Merge 后区块**；要完整历史改 `archive`
- `--http.api` 启用的命名空间，`erigon` 命名空间是私有扩展（如 `erigon_getHeaderByNumber`）
- 不写 `--externalcl` 时，内置共识层 Caplin 自动启用，Engine API 可以省

### 案例 2：一台机器跑多链

研究方需要同时观察主网和 Sepolia，**不能让两个实例互相抢端口**：

```sh
# 主网
./build/bin/erigon --datadir=/data/eth --chain=mainnet \
  --port=30303 --http.port=8545 --authrpc.port=8551 --torrent.port=42069
# Sepolia
./build/bin/erigon --datadir=/data/sepolia --chain=sepolia \
  --port=30304 --http.port=8546 --authrpc.port=8552 --torrent.port=42070
```

**关键**：`port`（P2P）/ `http.port` / `authrpc.port` / `torrent.port` 四个全部要错开，少改一个就启动失败。这个坑值得专门列在公司 runbook 里。

### 案例 3：拆 RPC 出来单跑

生产里要让 JSON-RPC 流量不影响共识同步，把 rpcdaemon 拆成独立进程：

```sh
./build/bin/rpcdaemon \
  --datadir=/data/erigon \
  --http.api=eth,erigon,web3,net,debug,trace,txpool \
  --ws --http.port=8545
```

**逐部分解释**：

- rpcdaemon 直接读同一个 datadir 的 MDBX 数据库（**只读**），不抢主进程的写锁
- 可以放在另一台机器上，通过 gRPC 连主节点的 `--private.api.addr`
- `debug` 和 `trace` 命名空间是 Erigon 的强项，复杂回放交易比 geth 快很多

## 踩过的坑

1. **Erigon 3 默认不再是 archive**：从 v3 开始 `--prune.mode` 默认是 `full`，会丢掉合并前的区块体。需要完整历史必须显式 `--prune.mode=archive`，不然事后发现没数据要重同步。

2. **网盘性能踩雷**：MDBX 是 mmap 数据库，对随机 IO 极敏感；EBS / NFS / Ceph 等网络存储顺序吞吐还行，**随机读延迟会拖慢同步 10 倍以上**。要么本地 NVMe，要么至少把 chaindata 单独挂在快盘。

3. **磁盘临近满时性能崖式下跌**：SSD 在剩余空间 < 15% 时写放大暴涨，Erigon 的 staged sync 又是写入大户，**节点会突然卡 hours 不出块**。预留 200GB+ 余量是底线。

4. **JWT 认证文件位置**：和外部共识客户端（Lighthouse / Prysm）连接时要 `--authrpc.jwtsecret`，Erigon 默认生成在 `<datadir>/jwt.hex`，新人常误以为要自己生成 hex 字符串。

## 适用 vs 不适用场景

**适用**：

- 自建以太坊全节点 / archive 节点，磁盘紧张时首选
- 需要快速从零同步（4 小时 vs 几天）的研究 / 测试环境
- 跑 `debug_traceTransaction` 这类回放密集型 RPC，Erigon 的扁平存储优势明显

**不适用**：

- 只是想要个 RPC 入口、不想运维节点 → 直接用 Infura / Alchemy / QuickNode
- 跑 PoW 时代的 L1 fork（Erigon 3 已专注于 PoS 后链）
- 极受限的小机器（< 500GB 磁盘 / < 16GB 内存）→ 用更轻的 minimal 模式或不自建

## 历史小故事（可跳过）

- **2018 年**：Alexey Akhunov（Ledgerwatch）开始研究 Patricia Trie 的 IO 瓶颈，在 go-ethereum fork 上做实验，项目代号 **Turbo-Geth**
- **2020 年**：项目改名 **Erigon**（Akhunov 是俄裔，Erigon 在希腊神话里是黎明之神 Eos 之子的名字），强调"以太坊新一代"定位
- **2022 年**：The Merge 前后 Erigon 2 引入 staged sync + flat KV，确立差异化技术路线
- **2024 年**：Erigon 3 重构为不可变 snapshot 架构，per-tx history 取代 per-block，把全节点门槛压到 1TB 量级
- 维护组织从 ledgerwatch GitHub 账号迁到 erigontech 组织，但社区还沿用旧地址引用

## 学到什么

1. **数据结构选型决定可扩展性**：Merkle Patricia Trie 是密码学正确但 IO 不友好的设计，扁平 KV + 单独算 commitment 是更工程化的折中
2. **批处理比实时处理快**：staged sync 牺牲"任何时刻状态都最新"换"端到端吞吐"，对全节点同步这种 throughput-bound 场景是巨大胜利
3. **冷热分离值得做**：不可变 snapshot + 活跃 chaindata 的两层架构，让"既要历史完整又要查询快"不再二选一
4. **多客户端共存是网络韧性**：一个客户端的共识 bug 不会拖垮整条链，这是以太坊跟某些"单实现链"最大的健壮性差距

## 延伸阅读

- 视频：[Erigon's Architecture by Alexey Akhunov](https://www.youtube.com/watch?v=qFB6jknvsbg)（开发者本人讲 staged sync 设计动机）
- 文档：[Erigon Book](https://erigon.gitbook.io/erigon)（社区维护的运维指南）
- 论文风读物：[Mind the Gap — Ethereum State Growth](https://hackmd.io/@vbuterin/state_size_management)（Vitalik 谈状态膨胀，Erigon 解决的就是这类问题）
- [[go-ethereum]] —— 上游主线，对比理解 Erigon 的差异化决策
- [[besu]] —— Java 写的以太坊客户端，架构哲学完全不同

## 关联

- [[go-ethereum]] —— Erigon 是它的性能 fork 起点，理解差异先看主线
- [[besu]] —— 同样实现以太坊协议，但 Java + 企业链导向，对比看清"客户端多样性"
- [[nethermind]] —— .NET 写的客户端，又一个以太坊执行层独立实现
- [[bitcoin-core]] —— 类似定位的"参考客户端"，但比特币状态模型简单太多
- [[bitcoin]] —— 区块链原始论文，理解 Erigon 服务的协议层
- [[cassandra]] —— 同样靠 LSM-tree 思路解决"海量 KV + 不可变 segment"问题，存储设计哲学相通

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[besu]] —— Hyperledger Besu — 用 Java 写的以太坊客户端
- [[bitcoin]] —— Bitcoin 白皮书
- [[bitcoin-core]] —— Bitcoin Core — 比特币参考实现
- [[foundry]] —— Foundry — Paradigm 出品的 Rust 合约工具链
- [[go-ethereum]] —— Go-Ethereum (Geth) — 以太坊主流 Go 客户端
- [[nethermind]] —— Nethermind — .NET 写的高性能以太坊客户端
- [[teku]] —— Teku — 用 Java 写的以太坊共识层客户端

