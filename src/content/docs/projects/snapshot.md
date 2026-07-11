---
title: Snapshot — DAO 不花 Gas 也能投票的链下治理前端
来源: 'https://github.com/snapshot-labs/snapshot'
日期: 2026-05-30
分类: blockchain
难度: 初级
---

## 是什么

Snapshot 是一个**让 DAO 在链下投票、却仍可被任何人验证**的开源治理前端。日常类比：像班级用问卷星投票决定出游地点——票不刷在公告栏（链上），但每个人都用学生证签名（钱包签名），结果可以晒出来给所有人核对。

你打开 `snapshot.box`，进入某个 DAO 的"空间"（space），看到一条提案"是否把协议费率从 0.3% 改成 0.25%"。你点投票，钱包弹出一条结构化消息，你签名——**没有花一分钱 Gas**。

签名后，提案文本和你的投票被存到 IPFS（去中心化存储），投票权重通过读取**某个区块高度**的链上代币余额计算出来。结果谁都能拿原始数据复算，运营方改不了。

## 为什么重要

不理解 Snapshot，下面这些事都没法解释：

- 为什么 Uniswap、Aave 这种百亿美元协议的治理却"不上链"——投票全在 Snapshot 上跑
- 为什么 DAO 治理参与率从"千分之几"涨到"百分之十几"——零 Gas 才让小户敢投
- 为什么"链下投票 + 链上执行"成了 Web3 治理的标准两段式架构
- 为什么大家说 "Snapshot 是 DAO 的 GitHub Pages"——免费、托管、人人可用

## 核心要点

Snapshot 的运作可以拆成 **三块**：

1. **签名而不交易**：投票用 EIP-712 结构化消息签名，钱包识别为"普通签名"，不广播到链上，所以零 Gas。类比：在合同上盖章但不去公证处备案。

2. **IPFS 存内容 + 链上读权重**：提案文本、投票记录走 IPFS（内容寻址，谁都能拉）；投票权重在提案创建瞬间锁定一个 `snapshot` 区块号，读这一刻的链上余额。

3. **Strategy 是权重函数**：`erc20-balance-of`、`erc721`、`delegation`、`quadratic` 等几十种插件，决定"一个地址有多少票"。DAO 可以叠多个 strategy 满足复杂规则。

三块拼起来：**签名收意愿 + IPFS 保不可篡改 + Strategy 算权重**。

## 实践案例

### 案例 1：Uniswap 用 UNI 余额投票

Uniswap DAO 的 Snapshot space 配置（简化）：

```json
{
  "name": "Uniswap",
  "strategies": [
    { "name": "erc20-balance-of",
      "params": { "address": "0x1f9840...", "symbol": "UNI", "decimals": 18 } }
  ],
  "voting": { "type": "single-choice", "period": 432000 }
}
```

**逐部分解释**：

- `erc20-balance-of` 表示"权重 = 你在快照区块的 UNI 余额"
- `period: 432000` 是 5 天，提案截止后结果固化
- 一人不限一票——你 1000 UNI 就是 1000 票，体现治理代币本意

### 案例 2：Gitcoin 用平方投票分配拨款

```json
{
  "strategies": [
    { "name": "balance-of-with-min", "params": { "min": 100 } }
  ],
  "voting": { "type": "quadratic" }
}
```

- 三步对照：① 对余额开平方 → ② 鲸鱼边际话语权被压低 → ③ 拨款更分散到多数小户支持的项目
- 数字感：100 票 → 10 实际权重，10000 票 → 100；鲸鱼花 100 倍代币只换约 10 倍话语权
- Gitcoin 用它做"哪个公共物品项目应该拿多少 ETH 拨款"

### 案例 3：链下投票 + 链上执行（SafeSnap）

```
Snapshot 提案通过 → SafeSnap 模块读取结果
                 → Reality.eth 仲裁 7 天异议期
                 → 没人挑战 → Gnosis Safe 自动执行交易
```

这一套让"民意调查"变成"真实操作"——金库转账、合约升级、参数修改都能由链下投票触发。Snapshot 自己不动钱，但通过 SafeSnap / oSnap / Zodiac 这些执行器把决议落到链上。

执行器还会加一段"异议期"：任何人可以在 7 天内挑战结果，挑战要质押保证金，仲裁通过 Reality.eth 这种乐观仲裁机制。这一层让"链下投票快但可被作弊"和"链上交易慢但可信"之间多了个**乐观执行**的折中带。

## 踩过的坑

1. **结果不会自动上链**：很多新 DAO 以为提案过了就万事大吉，其实只是"民意公示"。要执行必须接 SafeSnap 或人工多签转账，否则成空头支票。

2. **鲸鱼主导默认严重**：`erc20-balance-of` 一票一币，单个大户能压倒全部散户。需要叠 `quadratic` 或委托代理来缓和。

3. **快照区块可被预知抢票**：提案一发布，区块号就公开，鲸鱼可以闪电借贷在那一瞬间堆满票仓再还回去——历史上 Beanstalk、Build Finance 都被这套路偷过家。

4. **签名钓鱼比普通钓鱼更隐蔽**：链下签名不消耗 Gas，用户警惕度低；钓鱼站把恶意 EIP-712 typed-data 套成"投票"，签了实际是授权 NFT 转账。MetaMask 早期版本对 typed-data 显示混乱，2023 年才慢慢加上明显的"这是签名不是交易"提示。

## 适用 vs 不适用场景

**适用**：
- 持币人多、单次投票成本敏感的 DAO（Uniswap、Aave、ENS）——单次链上投票 Gas 常 >$5–50 时，零 Gas 链下更划算
- 民意调查 / 信号收集（不需要即时执行）
- 多链 DAO 治理——Snapshot 不绑定单一链
- 实验性投票机制（quadratic / conviction / weighted）想低成本试

**不适用**：
- 要求**强不可逆 + 即时执行**的核心金库操作 → 用 [[safe-contracts]] 多签或链上 Governor
- 法律层面需要原子性证据的合规投票 → 链下签名仲裁链路长
- 需要硬性匿名（Snapshot 投票公开可见每个地址投了什么）→ 用 zk-voting 方案
- 投票权计算依赖私有数据（KYC、链下身份）→ Snapshot strategy 都基于公链数据

## 历史小故事（可跳过）

- **2020 年 6 月**：Balancer 被攻击后，DeFi 圈开始正视治理参与度。Fabien Marino（常用名 Fabien）为 Balancer 写了第一版 snapshot.page，开源给所有 DAO 用。
- **2020 下半年**：Yearn 第一个大规模采用 Snapshot 投票，"链下投票 + 多签执行"模式成型。
- **2021 年 DeFi 治理热潮**：Aave、Sushi、Uniswap 全部接入，Snapshot 一年承载几千个 space。
- **2022 年**：SafeSnap 上线，链下结果第一次能自动触发链上多签。
- **2024 年**：品牌升级为 Snapshot.box，引入原生执行器和更多投票类型；累计 30000+ space，事实上的 DAO 治理标准。
- **2025 年**：Snapshot X 推出，把"提案 + 投票"也搬上 L2 链（Starknet 等），让"链下省 Gas"和"链上可执行"逐步合流，前者只是前端选项之一。

## 学到什么

1. **Web3 不等于一切上链**——内容寻址（IPFS）+ 链上余额做权重快照，已经够构造可信投票
2. **签名是被低估的密码学原语**——不广播交易也能产生密码学意义上"你说过的话"
3. **去中心化是层级的**：投票内容去中心、权重源去中心、执行可中心化（多签）——按需选择
4. **基础设施会自然分层**：Snapshot 管"投票"，SafeSnap 管"执行"，Tally 管"链上替代品"，各司其职
5. **零 Gas 不是真的零成本**——它把成本从"每个投票者"转嫁到"运行 IPFS 节点和前端的 Snapshot Labs"，去中心化程度因此打折扣

## 延伸阅读

- 官方文档：[Snapshot Docs](https://docs.snapshot.box/)（strategy 列表 + space 配置完整指南）
- 视频教程：[Patrick Collins — Building DAOs with Snapshot](https://www.youtube.com/watch?v=X_QKZzd68ro)
- 历史长文：[Coopahtroopa — DAO Tooling Landscape](https://newsletter.thedefiant.io/p/dao-tooling-landscape)
- [[ipfs]] —— Snapshot 的提案 / 投票存储底座
- [[uniswap-v3]] —— 治理用 Snapshot 的最大用户之一

## 关联

- [[ipfs]] —— 提案文本和签名都存 IPFS，保证不可篡改
- [[ethers-js]] —— Snapshot 前端用 ethers 让钱包签 EIP-712 消息
- [[metamask]] —— 用户最常用的签名入口，弹窗显示 typed-data
- [[uniswap-v3]] —— 协议层标的之一，UNI 持币者通过 Snapshot 投票
- [[compound-v3]] —— 早期把 Snapshot 投票作为治理预热阶段
- [[makerdao]] —— 用 Snapshot 做 MIP 民意阶段，再走链上 chief 执行
- [[safe-contracts]] —— 多签执行器，常和 SafeSnap 一起把链下投票落到链上

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[aragon]] —— Aragon OSx — 一份内核合约管所有 DAO 的乐高套件
