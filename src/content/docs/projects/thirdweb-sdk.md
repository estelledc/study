---
title: thirdweb SDK — 一站式 Web3 全家桶
来源: 'https://github.com/thirdweb-dev/js'
日期: 2026-05-30
分类: 区块链工具
难度: 初级
---

## 是什么

thirdweb SDK 是 thirdweb 公司出的 **Web3 开发者全家桶**：你想发一个 NFT、想让网页弹出"连接钱包"按钮、想让用户用信用卡买 token、想给用户做 gas 代付——这些零散需求**一个 SDK 全包**。日常类比：以太坊原生工具像**裸厨房**（你得自己买锅碗瓢盆 = ethers.js 调 RPC、OpenZeppelin 抄合约、wagmi 接钱包），thirdweb 像一台**大集成厨电**——锅炉、烤箱、冰箱、抽油烟机一柜搞定，零基础也能开火。

它的实体是一个 monorepo `thirdweb-dev/js`，里面塞了 5 件套：合约模板（ERC-721A drop / Marketplace / Token）、Connect（钱包 UI + 邮箱社交登录）、Engine（后端服务，托管 KMS 钱包 + gas 赞助）、Pay（法币入金 + 跨链 swap）、Insight（链上数据 API）。2024 年发布 v5 SDK 完全重写，老 v4（`@thirdweb-dev/sdk`）和新 v5（`thirdweb` 单包）**API 不兼容**，搜教程要看清。

> 名词三件套：**Connect**（前端连钱包 + 登录），**Engine**（后端发交易 + 代付），**Pay**（法币桥 + 跨链 swap）。

## 为什么重要

不理解 thirdweb 在做什么，下面这些事说不清楚：

- 为什么 2022 起出现一批"无代码发 NFT"项目方——thirdweb 仪表盘点几下就能部署一份审计过的 ERC-721A drop 合约
- 为什么"邮箱登录的 Web3 钱包"突然普及——thirdweb in-app wallet 用 MPC 把私钥拆两片，邮箱 OTP 验证就能签名，新人不用记助记词
- 为什么 [[wagmi]] / [[viem]] 占据底层但 thirdweb 还能站住——它卖的不是协议，是**整合度**：连接 + 合约 + 后端 + 法币四件事一次点
- 为什么很多游戏 / 消费类 dApp 选 thirdweb 而非 [[hardhat]] / [[foundry]]——后两者面向合约工程师，thirdweb 面向产品经理 + 全栈

## 核心要点

thirdweb 的产品线可以拆成 **三层结构**：

1. **合约层（模板 + 仪表盘部署）**：thirdweb 维护一套审计过的 Solidity 合约（ERC-721A drop / Marketplace v3 / Token / Vote / Split / Edition Drop），通过 Dashboard 网页或 CLI 一键部署到任意 EVM 链。类比：**预制菜**——不用自己写 Solidity，挑个口味直接上菜。

2. **客户端层（v5 SDK + Connect UI）**：JS / React / React Native 三个绑定，统一靠 `createThirdwebClient({ clientId })` 起步。Connect 提供 `<ConnectButton />` 一键弹 350+ 钱包列表，包含 in-app wallet（邮箱 / Google / Apple 登录）和 ERC-4337 smart account。类比：**统一遥控器**——所有钱包一个按钮，用户感受不到底层差异。

3. **服务层（Engine + Pay + Insight + RPC）**：Engine 是托管后端（你部 docker 或用 SaaS），可以代用户发交易 / 代付 gas / 批量空投；Pay 接信用卡和跨链 swap；Insight 是链上索引 API；底下还有 thirdweb 自家 RPC 池覆盖 2000+ EVM 链。类比：**后厨补给线**——前台点菜，后厨真正出菜。

三层叠在一起，用户拿到的是"从合约到 UI 到后端到收单"的**端到端 SaaS**，而不是只一段调用代码。

## 实践案例

### 案例 1：发一个 NFT drop（最经典用法）

新项目方用 thirdweb 最常见的 5 分钟流程：

```
1. dashboard.thirdweb.com → "Deploy NFT Drop"
2. 填名字 / 描述 / 图片 / supply → 选链（Polygon / Base / Arbitrum）
3. 钱包签 1 笔部署交易 → 拿到合约地址
4. 在前端写：
```

```jsx
import { createThirdwebClient, getContract } from "thirdweb";
import { polygon } from "thirdweb/chains";
import { ConnectButton, useActiveAccount } from "thirdweb/react";
import { claimTo } from "thirdweb/extensions/erc721";

const client = createThirdwebClient({ clientId: "xxx" });
const contract = getContract({ client, chain: polygon, address: "0x..." });

function MintButton() {
  const account = useActiveAccount();
  return (
    <>
      <ConnectButton client={client} />
      <button
        onClick={() =>
          account &&
          claimTo({ contract, to: account.address, quantity: 1n })
        }
      >
        mint
      </button>
    </>
  );
}
```

**逐部分**：Dashboard 选的合约模板就是仓库里 audited 的 `DropERC721`；`claimTo` 是 v5 extension，知道怎么调这份合约的 `claim`。**踩坑**：v5 写法是 `import from "thirdweb"`，老教程的 `useContract` 是 v4，按版本号读文档。

### 案例 2：邮箱登录的 in-app wallet

这是 thirdweb 让"非 crypto 用户"上手的杀手锏：

```jsx
import { inAppWallet } from "thirdweb/wallets";

const wallets = [
  inAppWallet({ auth: { options: ["email", "google", "apple"] } }),
];

<ConnectButton client={client} wallets={wallets} />
```

**逐部分**：用户点按钮 → 选"用邮箱登录" → 填邮箱 + OTP 验证码 → thirdweb 后台用 MPC 把私钥拆两片（自己存一片 + 用户登录态一片），用户**无感知地拥有了一个 EVM 地址**。这是 thirdweb 业务的关键——把"先有钱包再玩 dApp"的顺序倒过来。**踩坑**：MPC 一片在 thirdweb 服务器，意味着 thirdweb 服务挂了用户暂时签不了；做高价值资产托管要慎选这条路。

### 案例 3：用 Engine 代发交易（后端 gasless）

游戏 / 商品空投场景：你不想让玩家付 gas，想让自家服务器代发：

```bash
# 自部 Engine（docker） + 配 AWS KMS 钱包
docker run -p 3005:3005 thirdweb/engine
# 调用 API 代用户发空投
curl -X POST http://engine/contract/137/0xNFT/erc721/claim-to \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"receiver":"0xUser","quantity":1}'
```

**逐部分**：Engine 在后端拿着一个 KMS 托管的 thirdweb 钱包（gas 余额由你充），收到 HTTP 请求就替用户发交易。前端只要调你自家 API，不用让用户签名。**用法**：批量空投、邀请奖励、游戏内成就解锁都是这个模式。**踩坑**：Engine 不是免代码 SaaS，要自部 + 配置 + 监控；运维成本不小，玩具项目用不上。

## 踩过的坑

1. **v4 / v5 API 完全不兼容**：v4 包名 `@thirdweb-dev/sdk`，v5 包名 `thirdweb`；v4 的 `useContract` / `useNFTDrop` hook 在 v5 里全没了，改成 `getContract` + extension 函数。Google 搜到的 2023 年教程多半是 v4，对着抄会 import 失败——**永远先看官方文档版本切换**。
2. **多链没显式声明就默认主网**：`createThirdwebClient` 不声明 chains，`<ConnectButton>` 只让用户切到 mainnet；做多链 dApp 要传 `supportedChains: [polygon, base, arbitrum]`，否则用户切链时按钮报错。
3. **免费层 RPC 配额一晚就跑光**：thirdweb client 默认走自家 RPC，免费层每秒几十次；上线后流量稍大就 429 被限流。**生产环境必须升级到付费层**，或者在 client 里 override 私有 RPC URL。
4. **smart account 在便宜链才合算**：开 `smartWallet({ gasless: true })` 听起来很美——其实每笔交易要多一层合约调用 + 部署费，主网 gas 高时反而比 EOA 贵 2 倍。Polygon / Base / Arbitrum 这种 cent 级 gas 链才适合默认 smart account。

## 适用 vs 不适用场景

**适用**：

- 想快速发 NFT / Token / Marketplace 的 Web3 项目，无需从零写 Solidity（ERC-721A drop 是最常用模板）
- 需要邮箱 / 社交登录入门的 dApp（in-app wallet 解决助记词门槛，对消费类项目刚需）
- 需要 gas 赞助 / 批量发交易 / 后端签名（Engine + smart account 一条龙）
- EVM 多链 dApp（2000+ 链统一接口，比自己维护 RPC pool 省心）
- 需要法币入金的 NFT 商店或游戏内购（Pay onramp 一行代码接信用卡）

**不适用**：

- 纯 Solidity 合约工程师做底层协议研究 → [[foundry]] / [[hardhat]] 更合适，thirdweb 是上层封装
- Solana / Aptos / 比特币等非 EVM 生态 → 主线 focus EVM；非 EVM 不是一等公民（曾有/现有部分能力，别当通用多链 SDK）
- 极致最小依赖偏好 → [[viem]] 几 KB 即可，thirdweb 全家桶安装下来体积大
- 完全离线 / 自建 RPC / 不接受 SaaS → Engine 和 Pay 强依赖 thirdweb 服务，断网就废
- 高价值资产托管（DeFi 千万级） → in-app wallet 的 MPC 一片在 thirdweb 服务器，硬件钱包仍是更稳的选择

## 历史小故事（可跳过）

- **2021 年**：Furqan Rydhan（Bebo / AppLovin 早期 CTO）+ Steven Bartlett 创立，主打"无代码发 NFT"切入市场，那时 NFT drop 项目方多用 [[hardhat]] 自己写脚本，门槛高
- **2022 年**：开放 SDK + Dashboard，靠 NFT drop 模板 + ContractKit 扩展模式占住消费类 Web3 项目方
- **2023 年**：Connect SDK 整合多钱包入口；推出 Engine 面向企业，开始往 B 端走
- **2024 年**：v5 SDK 完全重写，单包 `thirdweb` 替代多个 `@thirdweb-dev/*` 子包，ESM-first、tree-shakable，对齐 [[viem]] 时代的工程审美
- **2024 年**：Pay 上线，把法币 onramp 和跨链 swap 收进同一个组件，让"刷卡买 NFT"可以一行代码搞定

## 学到什么

- **整合度本身是产品**——单看任何一块（钱包 UI、合约模板、后端、法币），thirdweb 都不是同领域最强；但**四块缝在一起**，对零基础全栈是降维打击
- **MPC in-app wallet 改变了入口顺序**——传统 Web3 是"先有钱包再用 dApp"，thirdweb 让"先用 dApp 再无感知拥有钱包"，这是消费 Web3 能起量的前提
- **v4 → v5 重写**说明 SDK 团队愿意丢历史包袱：tree-shaking + ESM + 单包入口是 [[viem]] 时代的工程标准，thirdweb 跟上了
- **后端服务（Engine）是企业护城河**——前端 SDK 谁都能写，但托管 KMS + gas 赞助 + 批量发送的 SaaS 后端竞品少，这是 thirdweb 估值的支点

## 延伸阅读

- 官方文档：[portal.thirdweb.com](https://portal.thirdweb.com)（v5 SDK 全套指南，记得切版本）
- GitHub：[thirdweb-dev/js](https://github.com/thirdweb-dev/js)（monorepo 主仓）
- v5 迁移指南：[Migrate from v4](https://portal.thirdweb.com/typescript/v5/migrate)（老项目升级必看）
- Engine 文档：[Engine docs](https://portal.thirdweb.com/engine)（自部 + KMS 配置）
- 视频：YouTube 搜 "thirdweb v5 tutorial"（社区有很多 5 分钟发 NFT 演示）

## 关联

- [[viem]] —— v5 SDK 内部许多模式致敬 viem，工程审美对齐
- [[wagmi]] —— React Web3 钱包栈，是 thirdweb Connect 的对照组（只到连接 vs 全家桶）
- [[ethers-js]] —— 老牌 RPC 库，thirdweb v4 时代曾是底层依赖
- [[hardhat]] —— EVM 合约开发框架，与 thirdweb 是上下游关系（合约写完才上架）
- [[foundry]] —— Paradigm 出品的 Rust 合约工具链，与 thirdweb 互补
- [[uniswap-v3]] —— 一个不靠 thirdweb 的 DeFi 协议典型，对照看不同复杂度项目的工具选型
- [[argent-x]] —— Starknet AA 钱包，与 thirdweb 的 EVM smart account 在"账户即合约"理念上呼应
- [[safe-contracts]] —— 多签合约钱包，是 thirdweb smart account 的同类参考

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
