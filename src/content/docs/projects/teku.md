---
title: Teku — 用 Java 写的以太坊共识层客户端
来源: 'https://github.com/Consensys/teku'
日期: 2026-05-30
分类: blockchain
难度: 中级
---

## 是什么

Teku 是一个**用 Java 写的以太坊共识层（Consensus Layer / CL）客户端**——让一台机器参与以太坊 PoS 网络投票、维护账本的程序。日常类比：以太坊从"挖矿"切到"投票"以后，每个想参与的人都要装一个"投票客户端"。Teku 就是其中一个，专门给 JVM 阵营（Java/Kotlin/Scala）的团队用的。

跑起来其实是两个角色协作：

```bash
teku \
  --ee-endpoint=http://localhost:8551 \
  --ee-jwt-secret-file=jwt.hex \
  --checkpoint-sync-url=https://beaconstate.info \
  --rest-api-enabled=true
```

上面这条命令启的是**信标节点（beacon node）**——只听全网投票、维护共识，不自己投。要真正参与投票还得另起一个 **validator client**，用私钥签消息。两者协作就能在主网做 staking。

## 为什么重要

不理解 Teku（以及它和 Besu/Geth 的关系），下面这些事都没法解释：

- 为什么 PoS 之后跑一个以太坊全节点要装**两份程序**——执行层（EL）+ 共识层（CL）
- 为什么 staking 圈一直强调"客户端多样性"——少一种就有协调风险
- 为什么企业级 staking pool（Coinbase、Kraken）愿意选 Teku，而不是更主流的 Lighthouse
- 为什么 **Engine API**（EL 和 CL 之间专用的本地 RPC 接口）的 `jwt-secret` 这么关键——它是两层唯一的握手凭证

## 核心要点

Teku 干的事可以拆成 **三块**：

1. **跟执行层握手**：通过 Engine API + JWT 与 Besu / Geth 等 EL 客户端通讯，把交易打包结果交给共识层投票。类比：财务（CL）跟仓库（EL）每小时核账，凭印章（JWT）才认。

2. **参与共识协议**：通过 **libp2p gossipsub**（一种 P2P 消息广播协议）收发其他节点的消息，按 **Gasper**（以太坊的投票规则，由 GHOST 选链 + Casper FFG 终局合体而成）给区块投票（attestation）和提议区块。类比：开会时听别人发言，到点举手。

3. **管理验证者**：拿着私钥（或委托给 Web3Signer 远程签）按时给出投票，错过一次就少拿一份基础奖励（base reward 的零头）；若网络长时间无法最终确定，不在线的验证者还会被 **inactivity leak**（不活跃渗漏）持续扣余额。类比：开会忘举手扣当轮工资；整场会开不下去时，缺席的人还要被持续罚款。

三块加起来叫 **beacon node + validator client**。Teku 可以两者合一进程跑（方便），也可以拆两个进程（生产推荐）。

## 实践案例

### 案例 1：本地起一个 beacon node 连接 Besu

最小命令行——本机 Besu 已经跑在 8551 端口，jwt 秘钥在 `~/jwt.hex`：

```bash
teku \
  --network=mainnet \
  --ee-endpoint=http://localhost:8551 \
  --ee-jwt-secret-file=~/jwt.hex \
  --checkpoint-sync-url=https://mainnet-checkpoint-sync.attestant.io \
  --rest-api-enabled=true \
  --metrics-enabled=true
```

**逐部分解释**：`--network=mainnet` 选主网；`--ee-endpoint` 是 EL 的 Engine API；`--ee-jwt-secret-file` 必须和 EL 用同一份 jwt；`--checkpoint-sync-url` 让你 5 分钟内同步完成（不写就要 1-2 周）。

### 案例 2：分离部署 + 外部签名器

生产标配——validator 不直接持私钥，而是把签名请求转发给 Web3Signer：

```bash
# Beacon node
teku --network=mainnet --ee-endpoint=http://el:8551 --ee-jwt-secret-file=jwt.hex

# Validator client
teku validator-client \
  --network=mainnet \
  --beacon-node-api-endpoint=http://beacon:5051 \
  --validators-external-signer-url=http://signer:9000 \
  --validators-external-signer-public-keys=external-signer \
  --validators-proposer-default-fee-recipient=0xYour20ByteAddress
```

私钥永远不离开 Web3Signer 容器，beacon 升级也不拖垮 validator。这条在干什么：把「听共识」和「持钥签名」拆开，生产标配。

### 案例 3：测试网 + Builder API（MEV）

**MEV** 是 "Maximal Extractable Value"——验证者通过排序 / 包含 / 排除交易能拿到的额外收益。**builder** 是帮你把这些机会打包成最优区块的第三方服务（如 MEV-Boost）。Holesky 已于 2025 年 sunset，验证者测试请用 **Hoodi**：

```bash
teku --network=hoodi \
  --validators-builder-registration-default-enabled=true \
  --builder-endpoint=http://mev-boost:18550 \
  --validators-proposer-default-fee-recipient=0xYour20ByteAddress
```

这条在干什么：出块前先问 builder 要"打包好的最优区块"，再把 tip 打到 `fee-recipient`。注意：地址必须是 **20 字节有效以太坊地址**（如 `0x742d35Cc...`）；主网 validator 若不配 `fee-recipient` 会直接拒启。

## 踩过的坑

1. **Java 25 之前的 JDK 跑不动**：官方编译版只能在编译时同等或更新版本的 JVM 上跑，向下不兼容。新人用 Java 17 跑会直接 `UnsupportedClassVersionError`。

2. **EL 和 CL 的 jwt-secret 必须一模一样**：Besu 启动时生成一份，Teku 必须读同一份；不一致表现是 beacon node 启动正常但永远不出块。

3. **单进程合并跑导致 missed attestation**：`teku` 一个进程同时跑 beacon + validator 时，节点重启 / 升级会让验证者也停掉，每错过一次 attestation 罚约 0.00002 ETH。生产必须拆两进程。

4. **没配 checkpoint-sync 冷启很慢**：默认从创世块同步要 1-2 周；忘加 `--checkpoint-sync-url` 是新人最常见的"为什么我节点同步不动"。

## 适用 vs 不适用场景

**适用**：

- 团队已经用 JVM 栈（Spring Boot / Kotlin），运维监控都是 Prometheus + Grafana
- 企业级 staking pool，想要稳定 / 审计友好 / 低事故率
- 需要和 Web3Signer 深度集成（远程签名 / HSM）
- 客户端多样性贡献——不希望大家都跑 Lighthouse

**不适用**：

- 只想最低资源跑 home staking → 选 [[lighthouse]]（Rust，内存占用更低）
- 想用 Go 生态 → 选 [[prysm]]
- 不需要共识层、只读链上数据 → 直接用 [[go-ethereum]] 或 [[besu]] 的 RPC
- 单机内存 < 8 GB → JVM 启动开销过大，跑不起来

## 历史小故事（可跳过）

- **2018 年**：ConsenSys 启动 Artemis 项目，用 Java 实现 eth2 phase 0 规范，是当时唯一的 JVM 客户端
- **2020 年 4 月**：Artemis 改名 Teku，进入主网准备阶段，与 Prysm / Lighthouse / Nimbus 并列 4 大 CL 客户端
- **2020 年 12 月**：Beacon Chain 上线，Teku 第一天就在创世里跑
- **2022 年 9 月**：The Merge，PoW 切换到 PoS，Teku 与 Besu/Geth 配合无事故过渡
- **2023 年至今**：在 Lido / Coinbase / Kraken 等大户里持续承担 10-15% 客户端份额

## 学到什么

1. **客户端多样性不是口号**——任一实现超 1/3 就可能阻碍最终确定，超 2/3 则 bug 时可带偏整条链；所以"用 Teku"本身就是价值贡献
2. **EL + CL 双栈**是 PoS 之后以太坊节点的新形态，理解 Engine API + JWT 是入门门槛
3. **企业 staking 的痛点**不在性能，在审计 / 合规 / 远程签名——Teku 的设计完全围绕这些转
4. **Java 在区块链不是边缘**——只要语言生态足够大，总有"工具够用"那一档需要被覆盖

## 延伸阅读

- 官方文档：[docs.teku.consensys.io](https://docs.teku.consensys.io/)（部署 / 配置 / 监控 全覆盖）
- 视频：[Ethereum Client Diversity 解释](https://www.youtube.com/results?search_query=ethereum+client+diversity)（理解为什么不该都用同一个客户端）
- Engine API 规范：[github.com/ethereum/execution-apis](https://github.com/ethereum/execution-apis)（EL 和 CL 之间到底说了什么）
- [[besu]] —— 同样是 ConsenSys 的 Java 执行层客户端，与 Teku 一对
- [[prysm]] —— 最主流的 CL 客户端，Go 写的
- [[lighthouse]] —— Rust 写的 CL 客户端，Home staker 首选

## 关联

- [[besu]] —— ConsenSys 的 Java 执行层客户端，常和 Teku 配对成"全 Java 全节点"
- [[prysm]] —— Go 实现的 CL 客户端，主网占比最高，是 Teku 最直接的对手
- [[lighthouse]] —— Rust 实现的 CL 客户端，Home staker 首选，和 Teku 互补
- [[nethermind]] —— .NET 实现的 EL 客户端，和 Teku 一样面向企业
- [[go-ethereum]] —— Go 实现的 EL 客户端（geth），可以做 Teku 的执行层后端
- [[erigon]] —— 注重存储优化的 EL 客户端，可与 Teku 配对追求最小磁盘占用
- [[bitcoin-core]] —— 比特币参考实现，区块链客户端的"祖宗"

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[foundry]] —— Foundry — Paradigm 出品的 Rust 合约工具链
- [[lodestar]] —— Lodestar — JS/TS 生态里的以太坊共识层客户端
- [[metamask]] —— MetaMask — 装在浏览器里的以太坊钱包
- [[rabby-wallet]] —— Rabby Wallet — 签名前先告诉你"会变成什么样"的 EVM 钱包
- [[remix-ide]] —— Remix IDE — 浏览器内 Solidity IDE
