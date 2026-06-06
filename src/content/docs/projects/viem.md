---
title: viem — 现代 TypeScript EVM 库
来源: 'https://github.com/wevm/viem'
日期: 2026-05-30
子分类: 链与合约
分类: 区块链
难度: 初级
provenance: pipeline-v3
---

## 是什么

viem 是 wevm 团队（也是 wagmi 作者）2023 年发布的**新一代以太坊 JavaScript 客户端库**。日常类比：像一台**模块化拼装的电话总机**——你不用买整套机柜，需要"打电话"才取一个话筒，需要"录音"再加一个录音机。每件配件单独发货、单独计费。

它把所有跟链的交互拆成 **三件可插拔的零件**：

```ts
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import { getBalance } from "viem/actions";

const client = createPublicClient({ chain: mainnet, transport: http() });
const bal = await getBalance(client, { address: "0xd8dA...96045" });
```

- **Client**（PublicClient / WalletClient / TestClient）：负责"我是谁、我要干嘛"
- **Transport**（http / webSocket / custom / fallback）：负责"我怎么把字节送出去"
- **Chain**：负责"我连的是哪条链"——内置 200+ EVM 链定义

完全用 TypeScript 写，从合约 ABI 字面量自动推导出方法签名和返回类型，~35kb 压缩 bundle，**wagmi 2.0（2024）默认底座**。

## 为什么重要

不理解 viem，下面这些事都没法解释：

- 为什么 wagmi 2.x 教程不再 `import { ethers } from "ethers"`——底层从 ethers 切到了 viem
- 为什么新 DApp 项目首选不是用了 8 年的 ethers 而是这个 2 岁多的库——bundle 小 4 倍 + 类型强很多
- 为什么写 `contract.read.balanceOf([addr])` 编辑器能直接提示出 `bigint` 返回类型——viem 把 ABI 当编译期信息推
- 为什么"按 action 引入"（functional）会重新成为前端库主流——tree-shake + 强类型组合拳

## 核心要点

viem 的设计可以拆成**四个对照决策**：

1. **Client 三联 vs ethers Provider/Signer 二联**：viem 拆出 PublicClient（只读）/ WalletClient（签名+发交易）/ TestClient（本地测试链调试），职责更细。

2. **Transport 抽象（组合）vs ethers 内嵌**：transport 独立成对象，可以 `fallback([http(a), http(b)])` 自动重试切节点，也能塞 mock 测试。

3. **Actions（函数）vs ethers Methods（OO）**：调链用 `getBalance(client, args)`，不是 `client.getBalance(args)`。函数能 tree-shake——没用到的不打包。

4. **ABI 字面量类型推导**：要求你写 `const abi = [...] as const`。一旦写了，`contract.read.balanceOf` 会自动得到正确的入参/返回类型，整个 DApp 不用手写一个合约方法签名。

四点合起来：**bundle 小、类型强、可组合、可测试**。

## 实践案例

### 案例 1：连主网读余额（最小例子）

```ts
import { createPublicClient, http, formatEther } from "viem";
import { mainnet } from "viem/chains";

const client = createPublicClient({ chain: mainnet, transport: http() });
const balance = await client.getBalance({ address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" });
console.log(formatEther(balance), "ETH");
```

这里 `client.getBalance` 是把 action 挂在 client 上的便捷写法。也能 `import { getBalance } from "viem/actions"` 后 `getBalance(client, {...})`，这种写法更适合 tree-shake。

### 案例 2：从 ABI 自动推合约方法类型

```ts
import { createPublicClient, http, getContract } from "viem";

const usdcAbi = [
  { type: "function", name: "balanceOf", stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ type: "uint256" }] },
] as const;  // 关键：const 断言

const usdc = getContract({ address: "0xa0b8...", abi: usdcAbi, client });
const bal = await usdc.read.balanceOf(["0xd8dA..."]);
//    ^? bigint  — 编辑器自己推出来
```

viem 在编译期把 `as const` 的 ABI 当类型信息读，自动织出 `read.balanceOf` 这种方法 + 入参/返回类型。**忘了 `as const` 类型立刻退化成 any**——这是新人头号坑。

### 案例 3：发交易 + 等回执

```ts
import { createWalletClient, http, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const account = privateKeyToAccount("0x..." as `0x${string}`);
const wallet = createWalletClient({ account, chain: mainnet, transport: http() });
const hash = await wallet.sendTransaction({ to: "0x...", value: parseEther("0.01") });
const receipt = await client.waitForTransactionReceipt({ hash });
```

注意：`sendTransaction` / `writeContract` 只**返回 hash 不等回执**，你必须显式 `waitForTransactionReceipt`。这点和某些 ethers 写法不一样，新人容易忘。

## 踩过的坑

1. **import 路径多容易导错**：viem / viem/actions / viem/chains / viem/accounts / viem/utils 各管一摊。新人常 `import { mainnet } from "viem"` 然后 undefined。**记住：链定义在 `viem/chains`**。

2. **ABI 必须 `as const`**：忘了断言，TypeScript 把数组当成 `{ type: string }[]`，所有方法签名退化成 `any`。配合 ESLint rule `@wagmi/no-abi-without-as-const` 兜底。

3. **writeContract 不自动等回执**：拿到 hash 就返回，链上还没确认。要么显式 `waitForTransactionReceipt`，要么用 wagmi 的 `useWaitForTransactionReceipt` hook。

4. **RPC 单点风险**：写死 `http("https://mainnet.infura.io/v3/...")`，节点挂了整个 DApp 挂。改用 `fallback([http(infura), http(alchemy)])` 让 viem 自动切。

5. **bigint vs number**：余额、wei、gas 全是 `bigint`。用 `+`/`-` 时不能跟 `number` 混算，`balance + 1` 报错，必须 `balance + 1n`。新人最容易在这翻车。

## 与 ethers.js / web3.js 对比

| 维度 | viem (2023+) | ethers v6 (2023+) | web3.js v4 (2023+，2025-03 archived) |
|------|--------------|-------------------|--------------------------------------|
| Bundle（压缩） | ~35 kb | ~144 kb | ~240 kb |
| API 风格 | actions 函数 + Client/Transport/Chain 组合 | OO 三件套：Provider / Signer / Contract | 单 `Web3` 主入口 + 模块挂载 |
| 类型来源 | 从 ABI 字面量自动推 | 手写 TypedContract / typechain 生成 | 类型基本手写或弱类型 |
| 大数 | 原生 `bigint` | 原生 `bigint`（v6 改） | 原生 `bigint`（v4 改） |
| Tree-shake | 友好（按 action import） | 一般（OO 类难拆） | 较差（主入口聚合） |
| 维护状态 | 活跃，wagmi 2 默认 | 活跃，事实标准 | 仓库 archived，进入维护期 |

## 适用 vs 不适用场景

**适用**：
- 新 DApp 项目首选——wagmi 2 默认底座
- Bundle size 敏感的浏览器端（C 端钱包/交易所前端）
- 需要从 ABI 自动推合约方法类型，省手写
- 想用 functional 风格、按 action 引入

**不适用**：
- 已有大量 ethers v5/v6 代码且无重构预算——先用 ethers 别折腾
- 需要兼容大量 web3.js v1 老教程或第三方插件
- 非 EVM 链（Solana/Aptos/Sui 各有自己的 SDK）

## 历史小故事（可跳过）

- **2022 年**：wagmi 团队在做 React DApp hook 库时发现 ethers v5 在前端 bundle 接近 200kb、TypeScript 类型不够强，于是决定造轮子
- **2023 年**：viem 1.0 发布，完全 TypeScript 重写，提出 "Client + Transport + Chain" 三件套
- **2024 年**：wagmi 2.0 把默认底层从 ethers 切到 viem，下游被动迁移
- **2025 年**：在新建 DApp 项目里超越 ethers 成为首选，github 仓库 stars 持续上涨

## 学到什么

1. **OO 不是唯一答案**：actions（函数）+ tree-shake 在浏览器场景能砍掉 4× bundle，前提是有强类型撑住组合性
2. **类型可以从数据推**：ABI 是 JSON，加一个 `as const` 就成了编译期类型源——把"运行期数据"变"类型信息"是 TS 高级用法的核心范式
3. **Transport 解耦的好处**：mock / fallback / 多 RPC 切换全在同一抽象下，写测试和写生产几乎一样
4. **生态绑定 = 默认决策**：wagmi 2 一切到 viem，整个 React DApp 圈跟着搬家——库的成败常常不在代码本身

## 延伸阅读

- 官方文档：[viem.sh](https://viem.sh) — 入门 5 分钟，每个 action 都有 runnable 例子
- wagmi v1 → v2 迁移：[wagmi.sh/react/guides/migrate-from-v1-to-v2](https://wagmi.sh)
- 与 ethers 对比 benchmark：viem 仓库 README 有 size/perf 表
- [[ethers-js]] —— 上一代以太坊 JS 标准
- [[web3-js]] —— 最早一代以太坊 JS 库
- [[uniswap-v3]] —— 用 viem/ethers 跟其交互的典型 DeFi 合约

## 关联

- [[ethers-js]] —— viem 的直接对手，OO 风格、~144kb
- [[web3-js]] —— 最早一代，2025 archived；viem 是它隔代后继
- [[uniswap-v3]] —— DApp 端常用 viem 调用
- [[aave-v3]] —— 借贷合约，前端常配 viem
- [[anchor]] —— Solana 端的 SDK 风格对照（非 EVM）

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[aave-v3]] —— Aave V3 — 借贷协议旗舰
- [[anchor]] —— Anchor — Solana 合约开发框架
- [[ethers-js]] —— ethers.js — 浏览器和 Node 都能用的以太坊客户端库
- [[thirdweb-sdk]] —— thirdweb SDK — 一站式 Web3 全家桶
- [[uniswap-v3]] —— Uniswap V3 — 集中流动性 AMM 核心合约
- [[web3-js]] —— web3.js — 老牌 EVM JavaScript 客户端库

