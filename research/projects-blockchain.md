---
title: 项目候选 — 区块链 / Web3 / 加密生态
日期: 2026-05-29
---

# 区块链 / Web3 / 加密生态项目候选

候选 60 个，按子类分组（节点 9 / 合约工具链 4 / 钱包密钥 6 / DeFi 6 / L2 6 / 跨链桥 4 / 预言机 2 / NFT 3 / 非 EVM 链 7 / 加密库 4 / 去中心化存储 5 / DAO 治理 2 / 隐私链 2）。

现有 atlas 中区块链 / Web3 主题完全空白：bitcoin 当前以论文形式收录（papers），projects 一侧零覆盖。本文件 60 个 slug 与现有 200 个 projects slug 全部互斥。

Stars 量级为 2025-2026 区间近似值，用于影响力参考；候选门槛为 ≥ 500 stars 或同等生态地位（如 Safe / Argent X / Ledger SDK 等基础设施 repo）。

## 总览

- **总数**：60 个
- **挑选维度**：链节点客户端 / 合约开发工具链 / 钱包与密钥管理 / DeFi 协议 / L2 扩容方案 / 跨链与预言机 / NFT 工具 / 非 EVM 链 / 加密原语库 / 去中心化存储 / 治理 / 隐私链
- **过滤**：闭源（Coinbase Wallet 客户端 / Trust Wallet 客户端核心 / Manifold Studio 编辑器）跳过；归档项目（Truffle 已 deprecated）跳过；OFAC 制裁标的（tornado-cash-classic）跳过

### 子类分布

| 子类 | 数量 |
|---|---:|
| [区块链节点客户端](#1-区块链节点客户端) | 9 |
| [智能合约 / 工具链](#2-智能合约--工具链) | 4 |
| [钱包 / 密钥管理](#3-钱包--密钥管理) | 6 |
| [DeFi 协议](#4-defi-协议) | 6 |
| [L2 扩容方案](#5-l2-扩容方案) | 6 |
| [跨链桥](#6-跨链桥) | 4 |
| [预言机](#7-预言机) | 2 |
| [NFT 标准 / 工具](#8-nft-标准--工具) | 3 |
| [Solana / 非 EVM 链](#9-solana--非-evm-链) | 7 |
| [加密原语库](#10-加密原语库) | 4 |
| [去中心化存储](#11-去中心化存储) | 5 |
| [DAO / 治理](#12-dao--治理) | 2 |
| [隐私链](#13-隐私链) | 2 |

---

## 1. 区块链节点客户端

| Slug | 项目 | Stars 量级 | 一句话价值 | URL |
|---|---|---|---|---|
| `bitcoin-core` | Bitcoin Core — 比特币参考实现 | ~80k | C++ 全节点，UTXO 模型 + PoW 共识的活态规范 | https://github.com/bitcoin/bitcoin |
| `go-ethereum` | Geth — 以太坊主流 Go 客户端 | ~48k | 执行层最久负盛名实现，Account 模型 + EVM 教科书 | https://github.com/ethereum/go-ethereum |
| `besu` | Hyperledger Besu — Java EVM 客户端 | ~1.6k | 企业级 Apache 2.0 实现，PoA / IBFT 共识可插拔 | https://github.com/hyperledger/besu |
| `nethermind` | Nethermind — .NET EVM 客户端 | ~1.4k | C# 全节点，性能调优文档丰富，多链兼容 | https://github.com/NethermindEth/nethermind |
| `erigon` | Erigon — 存储优化型以太坊客户端 | ~3.3k | 重构 trie 与同步阶段，归档节点磁盘占用降至 1/4 | https://github.com/ledgerwatch/erigon |
| `lighthouse` | Lighthouse — Sigma Prime 的 Rust 共识层客户端 | ~3.1k | beacon chain + 分片 + Slasher，安全审计模型 | https://github.com/sigp/lighthouse |
| `prysm` | Prysm — Prysmatic Labs 的 Go 共识层客户端 | ~3.5k | 主流 PoS 客户端，validator 工具链最完整 | https://github.com/prysmaticlabs/prysm |
| `lodestar` | Lodestar — ChainSafe 的 TypeScript 共识层客户端 | ~1.1k | 唯一 TS 实现，浏览器 light client + libp2p | https://github.com/ChainSafe/lodestar |
| `teku` | Teku — ConsenSys 的 Java 共识层客户端 | ~744 | 企业级 PoS 客户端，与 Besu 同栈互补 | https://github.com/Consensys/teku |

---

## 2. 智能合约 / 工具链

> 已剔除：Truffle（2023 年 ConsenSys 官方归档，Hardhat 接棒）、Brownie（维护模式，Ape 接棒）。

| Slug | 项目 | Stars 量级 | 一句话价值 | URL |
|---|---|---|---|---|
| `foundry` | Foundry — Paradigm 出品的 Rust 合约工具链 | ~9k | forge / cast / anvil 三件套，编译测试部署 fuzz 一气呵成 | https://github.com/foundry-rs/foundry |
| `hardhat` | Hardhat — Nomic Foundation 的 JS 合约框架 | ~7.5k | 插件生态最全、本地调试 console.log，前端集成主流方案 | https://github.com/NomicFoundation/hardhat |
| `ape-framework` | ApeWorx — Python 合约开发框架 | ~895 | Brownie 精神继承者，pytest 风格测试 + 多链账户管理 | https://github.com/ApeWorX/ape |
| `remix-ide` | Remix IDE — 浏览器内 Solidity IDE | ~3.6k | 官方 Web IDE，零安装入门 Solidity 教学首选 | https://github.com/ethereum/remix-project |

---

## 3. 钱包 / 密钥管理

> 已剔除：Coinbase Wallet 客户端（核心闭源）、Trust Wallet 客户端核心。Manifold Studio 编辑器主体闭源不在 NFT 收录。

| Slug | 项目 | Stars 量级 | 一句话价值 | URL |
|---|---|---|---|---|
| `metamask` | MetaMask — 最大 EVM 浏览器钱包 | ~12.7k | provider 注入 + EIP-1193 标准实现，Web3 入口事实标准 | https://github.com/MetaMask/metamask-extension |
| `rabby-wallet` | Rabby — DeBank 出品的 EVM 钱包 | ~1.7k | 多链余额聚合、签名前模拟交易，安全感优于 MetaMask | https://github.com/RabbyHub/Rabby |
| `walletconnect` | WalletConnect — 钱包通信协议 | ~2.3k | DApp 与移动钱包的 RPC 桥接标准，v2 多链多会话 | https://github.com/WalletConnect/walletconnect-monorepo |
| `argent-x` | Argent X — Starknet 智能合约钱包 | ~325 | account abstraction 范本，社交恢复 + 多签内置 | https://github.com/argentlabs/argent-x |
| `safe-contracts` | Safe — 多签智能账户合约 | ~2k | 前 Gnosis Safe，模块化执行 + guard，DAO 国库标配 | https://github.com/safe-global/safe-smart-account |
| `ledger-app-sdk` | Ledger App SDK — 硬件钱包应用开发框架 | ~520 | C 写 BOLOS 应用必备，签名隔离与 secure element 实践 | https://github.com/LedgerHQ/ledger-secure-sdk |

---

## 4. DeFi 协议

> 注：Uniswap V3 / Aave V3 / Compound V3 主合约采用 BUSL（Business Source License），属于"源代码可读但限期商用"，仍可作为研究学习对象。

| Slug | 项目 | Stars 量级 | 一句话价值 | URL |
|---|---|---|---|---|
| `uniswap-v3` | Uniswap V3 Core — 集中流动性 AMM | ~4.5k | tick + concentrated liquidity 范式，DeFi 数学最深的合约 | https://github.com/Uniswap/v3-core |
| `aave-v3` | Aave V3 — 借贷协议旗舰 | ~1.4k | 跨链 Portal + isolation mode，借贷协议风险分层教科书 | https://github.com/aave/aave-v3-core |
| `compound-v3` | Compound III (Comet) — 单抵押借贷重构 | ~720 | 单 base asset 模型，简化清算逻辑，与 V2 对比读 | https://github.com/compound-finance/comet |
| `makerdao` | MakerDAO — DAI 稳定币系统 | ~1.6k | CDP / Vault + Spell governance，链上稳定币机制鼻祖 | https://github.com/makerdao/dss |
| `curve` | Curve — 稳定币 stableswap | ~1.4k | 自定义不变量曲线 + ve 锁仓投票，Vyper 写的 DeFi 老炮 | https://github.com/curvefi/curve-contract |
| `balancer` | Balancer V2 — 通用 AMM 与权重池 | ~840 | Vault 单合约 + 多池模型，weighted / stable / composable 池范式 | https://github.com/balancer/balancer-v2-monorepo |

---

## 5. L2 扩容方案

| Slug | 项目 | Stars 量级 | 一句话价值 | URL |
|---|---|---|---|---|
| `optimism` | Optimism — Optimistic Rollup 旗舰栈 | ~6.4k | OP Stack 模块化（rollup-node / batcher / proposer）开放共建样板 | https://github.com/ethereum-optimism/optimism |
| `arbitrum` | Arbitrum Nitro — Offchain Labs 的 OR 客户端 | ~750 | WASM-based 欺诈证明 + Geth 复用，吞吐与 EVM 兼容性双优 | https://github.com/OffchainLabs/nitro |
| `scroll` | Scroll — 字节码级 zkEVM | ~580 | Type-2 zkEVM，zk-trie + GPU 友好电路，零知识 EVM 范例 | https://github.com/scroll-tech/scroll |
| `polygon-zkevm` | Polygon zkEVM — Polygon 的 zk Rollup | ~1k | EVM 等价 + zkProver，研究字节码 → 多项式转换的工程范本 | https://github.com/0xPolygonHermez/zkevm-node |
| `cairo-lang` | Cairo — Starknet 的 zk 友好语言 | ~1.6k | 一阶 STARK-friendly 编程语言，从语法到证明系统全公开 | https://github.com/starkware-libs/cairo |
| `zksync-era` | zkSync Era — Matter Labs 的 zkRollup | ~830 | LLVM 后端编译 Solidity / Yul / Vyper 到 zkEVM 字节码 | https://github.com/matter-labs/zksync-era |

---

## 6. 跨链桥

| Slug | 项目 | Stars 量级 | 一句话价值 | URL |
|---|---|---|---|---|
| `layerzero` | LayerZero V2 — 通用消息传递协议 | ~620 | UltraLight 节点 + DVN 验证模型，跨链消息抽象层范例 | https://github.com/LayerZero-Labs/LayerZero-v2 |
| `wormhole` | Wormhole — 多链通用消息层 | ~1.1k | Guardian 多签 + VAA 标准，跨 30+ 链的消息广播协议 | https://github.com/wormhole-foundation/wormhole |
| `axelar` | Axelar — 通用跨链 gateway | ~270 | GMP（General Message Passing）+ EVM gateway 合约，跨链调用范式 | https://github.com/axelarnetwork/axelar-cgp-solidity |
| `chainlink-ccip` | Chainlink CCIP — 预言机网络的跨链协议 | ~860 | 风险管理网络 + 双 OCR 共识，预言机机构跨链方案 | https://github.com/smartcontractkit/ccip |

---

## 7. 预言机

> 已剔除：API3（市占小）、Band Protocol（活跃度下滑）。

| Slug | 项目 | Stars 量级 | 一句话价值 | URL |
|---|---|---|---|---|
| `chainlink` | Chainlink — 行业事实标准预言机 | ~1.6k | OCR 报价聚合 + VRF + Automation，去中心化预言机范式 | https://github.com/smartcontractkit/chainlink |
| `pyth` | Pyth Network — 低延迟金融预言机 | ~470 | first-party 数据提供 + Pull oracle 模型，HFT 友好设计 | https://github.com/pyth-network/pyth-client |

---

## 8. NFT 标准 / 工具

> 已剔除：Manifold Studio（编辑器主体闭源）。

| Slug | 项目 | Stars 量级 | 一句话价值 | URL |
|---|---|---|---|---|
| `opensea-js` | OpenSea SDK — 最大 NFT 市场 SDK | ~1.4k | TS SDK + Seaport 协议，NFT 交易 / 上架 / 出价 API 范式 | https://github.com/ProjectOpenSea/opensea-js |
| `reservoir-sdk` | Reservoir SDK — 跨市场 NFT 聚合 | ~140 | 多市场流动性聚合 + 工具集，"OpenSea 之外"的备选方案 | https://github.com/reservoirprotocol/reservoir-kit |
| `thirdweb-sdk` | thirdweb SDK — 全栈 Web3 SDK | ~5.5k | 合约模板 + Wallet + RPC 全包，新手友好的 Web3 入口 | https://github.com/thirdweb-dev/js |

---

## 9. Solana / 非 EVM 链

| Slug | 项目 | Stars 量级 | 一句话价值 | URL |
|---|---|---|---|---|
| `solana` | Solana — Rust 写的高性能 PoH 链 | ~13k | Sealevel 并行执行 + Gulf Stream 转发，65k+ TPS 设计目标 | https://github.com/solana-labs/solana |
| `anchor` | Anchor — Solana 合约开发框架 | ~3.7k | IDL 自动生成 + macro-driven 账户校验，Solana 版 Hardhat | https://github.com/coral-xyz/anchor |
| `cosmos-sdk` | Cosmos SDK — 应用链开发框架 | ~6.4k | module-based 应用链构建，Tendermint 共识 + IBC 标准 | https://github.com/cosmos/cosmos-sdk |
| `cosmwasm` | CosmWasm — Cosmos 上的 wasm 智能合约 | ~1.1k | Rust 写合约编译到 wasm，actor 模型 + 多链部署 | https://github.com/CosmWasm/cosmwasm |
| `aptos-core` | Aptos — Move 系高性能 L1 | ~6.6k | Block-STM 并行执行 + Move 语言，Diem 团队延续 | https://github.com/aptos-labs/aptos-core |
| `sui` | Sui — Mysten Labs 的对象模型链 | ~6.1k | 对象中心 + 因果序列 vs 全局排序，并行交易范式创新 | https://github.com/MystenLabs/sui |
| `move-language` | Move — 资源型智能合约语言 | ~2k | linear types + module 系统，Aptos / Sui 共同基础语言 | https://github.com/move-language/move |

---

## 10. 加密原语库

> 已剔除：forge-std（Foundry 子集，独立学习价值有限）。

| Slug | 项目 | Stars 量级 | 一句话价值 | URL |
|---|---|---|---|---|
| `ethers-js` | ethers.js — TypeScript EVM 交互库 | ~7.9k | provider / signer / contract 三层抽象，DApp 前端事实标准 | https://github.com/ethers-io/ethers.js |
| `web3-js` | web3.js — 老牌 EVM JS 库 | ~19k | EIP-1193 之前的 RPC 封装，BIP / EIP 全套实现 | https://github.com/web3/web3.js |
| `viem` | viem — 现代 TypeScript EVM 库 | ~2.6k | tree-shakable + 强类型，wagmi 底座，ethers 的现代替代 | https://github.com/wevm/viem |
| `openzeppelin-contracts` | OpenZeppelin Contracts — 合约模板库 | ~25k | ERC20 / ERC721 / Access Control / Upgradeable，安全合约样板 | https://github.com/OpenZeppelin/openzeppelin-contracts |

---

## 11. 去中心化存储

| Slug | 项目 | Stars 量级 | 一句话价值 | URL |
|---|---|---|---|---|
| `ipfs` | Kubo — IPFS 主流 Go 实现 | ~16.5k | content addressing + DHT + Bitswap，去中心化存储基础设施 | https://github.com/ipfs/kubo |
| `filecoin` | Lotus — Filecoin 主流实现 | ~2.9k | IPFS 之上的激励层，PoRep / PoSt 证明 + 链上市场 | https://github.com/filecoin-project/lotus |
| `arweave` | Arweave — 永久存储链 | ~890 | blockweave 数据结构 + 一次付费永久存储，存证场景实测过 | https://github.com/ArweaveTeam/arweave |
| `sia` | Sia — Renterd 存储市场 | ~4k | 分布式云存储，主机租约 + 文件分片合约，自部署友好 | https://github.com/SiaFoundation/renterd |
| `storj` | Storj — Tardigrade 分布式云 | ~4.4k | S3 兼容 + 客户端加密 + 多节点纠删码，企业级开源对象存储 | https://github.com/storj/storj |

---

## 12. DAO / 治理

> 已剔除：Tally（前端为主，后端多数闭源）。

| Slug | 项目 | Stars 量级 | 一句话价值 | URL |
|---|---|---|---|---|
| `snapshot` | Snapshot — 链下投票协议 | ~1.7k | IPFS + 签名投票零 Gas，DAO 治理事实标准前端 | https://github.com/snapshot-labs/snapshot |
| `aragon` | Aragon OSx — DAO 框架 | ~360 | DAO 工厂 + 插件系统，权限管理 vs 简单多签的进阶范式 | https://github.com/aragon/osx |

---

## 13. 隐私链

> 已剔除：tornado-cash-classic（OFAC 制裁标的，公开学习站合规风险高）。

| Slug | 项目 | Stars 量级 | 一句话价值 | URL |
|---|---|---|---|---|
| `zcash` | Zcash — zk-SNARKs 隐私链 | ~5.1k | Sapling / Orchard 协议，第一个落地的零知识隐私链 | https://github.com/zcash/zcash |
| `monero` | Monero — Ring Signatures 隐私链 | ~10.3k | 环签名 + 隐身地址 + Bulletproofs，默认隐私的 PoW 链 | https://github.com/monero-project/monero |

---

## 与现有 atlas 的去重确认

已扫过 `src/content/docs/projects/` 下 200 个 slug：

- 区块链 / Web3 主题完全空白，bitcoin 仅以 paper 形式收录于 papers 一侧
- 唯一同名项 `elysia.md` 是 Bun 上的 web 框架，与本文件 60 个 slug 无关
- 本文件 60 个候选 slug 与现有 200 个全部互斥

## 备注

### 调整说明（用户原始 68 项 → 60 项）

按"严禁闭源跳过 + 归档项目跳过 + 法律风险跳过"原则剔除 8 项：

1. **truffle**：2023 年 ConsenSys 官方归档（archived），Hardhat 已接棒，留作历史不入 atlas
2. **brownie**：维护模式（minimal updates），Ape Framework 是其精神继承者，已收录
3. **manifold-studio**：Studio 编辑器主体闭源（仅合约模板开源），违反"闭源跳过"
4. **tornado-cash-classic**：OFAC 制裁标的，公开学习站列入合规风险
5. **api3**：oracle 市占小，去重保留 chainlink + pyth 两大主流
6. **band-protocol**：活跃度下滑，理由同 api3
7. **forge-std**：Foundry 子集，独立学习价值有限
8. **tally**：前端 UI 项目为主，治理协议层 snapshot + aragon 已覆盖

### License 说明

DeFi / L2 主合约普遍采用 BUSL（Business Source License）：

- BUSL 属于"源代码可读 + 限期商用"，**不是闭源**，到期自动转 GPL
- 学习与研究用途完全允许
- 涉及条目：uniswap-v3 / aave-v3 / compound-v3 / arbitrum / chainlink-ccip
- 严格 OSS（MIT / Apache / GPL）条目占比约 45/60

### Stars 量级声明

- Stars 数为 2025 末 - 2026 初估算，前后浮动 < 15%
- 部分基础设施类（safe-contracts / argent-x / ledger-app-sdk / aragon-osx）stars 偏低但生态地位关键，按"同等知名度"原则保留

### 优先级建议（如需压缩到 30）

按生态地位 + stars + 学习价值综合排：bitcoin-core / go-ethereum / lighthouse / foundry / hardhat / metamask / walletconnect / safe-contracts / uniswap-v3 / aave-v3 / makerdao / optimism / arbitrum / cairo-lang / zksync-era / wormhole / chainlink / opensea-js / solana / anchor / cosmos-sdk / aptos-core / sui / move-language / ethers-js / viem / openzeppelin-contracts / ipfs / filecoin / monero
