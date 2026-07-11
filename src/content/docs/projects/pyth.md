---
title: Pyth Network — 一手数据上链的低延迟预言机
来源: 'https://github.com/pyth-network/pyth-client'
日期: 2026-05-30
分类: blockchain
难度: 中级
---

## 是什么

Pyth Network 是一套**让交易所和做市商把自己的盘口报价直接签名上链**的预言机系统。日常类比：传统预言机像派外卖小哥到各家餐厅前台拍菜单，再带回单一价位；Pyth 是直接让厨师本人把今天的价目表盖章扔到一个公共柜子里，谁要谁取。

为什么换这种姿势？区块链衍生品 / 永续合约 / 高频清算这类应用要的不是"5 分钟前的均价"，而是"现在这一刻 BTC 是多少、波动有多大"。传统 Push 模型的预言机由独立节点去外部 API 拉数据，延迟到分钟级，数据本身也是二手转抄。Pyth 把数据来源（**publisher**，含 Jane Street、Jump、Cboe、Binance 等 ~120 家）变成第一方——它们手里的报价就是市场报价，签个名直接发出去。

整个网络分两块：聚合发生在一条叫 **Pythnet** 的 Solana fork 应用链上，每 ~400ms 出一轮中位数 + 置信区间；其他链通过 [[wormhole]] 桥把这份签名报告以 **Pull 模型**按需取下来用。当前覆盖 400+ 资产、跨 90+ 条链。

## 为什么重要

不理解 Pyth，下面这些事都没法解释：

- 为什么 Solana 生态的永续 DEX（Drift / Mango / Jupiter Perp）默认用 Pyth 而不是 [[chainlink]]——它们要的是次秒级延迟
- 为什么 Pyth 给的不是单价而是 `price ± confidence`——剧烈行情时这个置信带是清算合约的安全阀
- 为什么消费者合约要"自己付 gas 更新"，而不是预言机主动推过来——这是 Pull 模型省成本的核心
- 为什么 Pyth 的安全上限被钉在 Wormhole 守护人集合上——跨 EVM 链时数据要靠 Wormhole 签名搬

## 核心要点

Pyth 的设计可以拆成 **三层**：

1. **Publishers（一手数据层）**：~120 家做市商 / 交易所跑各自的 publisher 程序，把它们交易系统里的实时报价 + 置信区间签名发到 Pythnet。每家发的是它**自己看到的市场**，不是去抄别人。

2. **Pythnet 聚合层（应用链）**：Pythnet 是一条 Solana 代码 fork 出来的专用链，~400ms 一个 slot。链上的聚合程序对所有 publisher 报价取**中位数 + 置信带**，去除离群点，产出每个资产一条权威的 PriceFeed。

3. **跨链分发层（Pull 模型 + Wormhole）**：聚合好的 PriceFeed 由 Wormhole 守护人集合签名打包成 **VAA（Verified Action Approval）**。EVM / Aptos / Sui 等链上的消费者合约**主动**调用 `updatePriceFeeds(vaa)` 把这份签名验完写上链，再 `getPriceUnsafe()` 读出来。不调就不写——gas 由用，谁省。

三层加起来：**一手签名 + 链上聚合 + 按需 Pull**，用 Solana 的速度做共识，用 Wormhole 的桥做分发。

## 实践案例

### 案例 1：EVM 合约 Pull 一份 BTC/USD 喂价

```solidity
import "@pythnetwork/pyth-sdk-solidity/IPyth.sol";

contract PerpEngine {
    IPyth pyth;
    bytes32 constant BTC_USD = 0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43;

    function settle(bytes[] calldata vaa) external payable {
        uint fee = pyth.getUpdateFee(vaa);
        pyth.updatePriceFeeds{value: fee}(vaa);             // 自费更新
        PythStructs.Price memory p = pyth.getPriceNoOlderThan(BTC_USD, 10); // ≤10s
        require(p.conf * 100 < uint64(p.price), "spread too wide");
    }
}
```

**逐部分解释**：

- 调用方传入 VAA（链下从 Pyth Hermes API 拿），自己付 gas 调 `updatePriceFeeds`
- `getPriceNoOlderThan(id, 10)` 拒绝老于 10 秒的价，过期直接 revert
- `p.conf` 是置信区间，**生产合约必须用它过滤**——例如要求 conf < 1% 才允许清算

### 案例 2：Solana 程序直接读 PriceAccount

```rust
use pyth_sdk_solana::load_price_feed_from_account_info;

let feed = load_price_feed_from_account_info(price_account)?;
let p   = feed.get_price_no_older_than(clock.unix_timestamp, 30)
              .ok_or(ErrorCode::Stale)?;
require!(p.conf as u64 * 100 < p.price as u64, ErrorCode::Wide);
```

Solana 上**不需要 Wormhole**，因为 Pythnet 是 Solana 代码 fork，账户结构兼容。合约直接把 Pyth 的 PriceAccount 作为 `AccountInfo` 传进来反序列化，延迟 ≈ Solana 出块时间（400ms），置信区间 + EMA 价同样可读。这是 Pyth"原生主场"，比跨链拿快很多，没有 Pull 自更新的负担——账户随 Pythnet 持续被中继上 Solana。

### 案例 3：永续合约 DEX 把清算判定从分钟降到秒

老协议用 [[chainlink]] 喂价（心跳 1 小时或偏差触发），剧烈行情时清算延迟会让坏账爆掉。永续 DEX 切到 Pyth 后，标记价 `mark = pyth.price`，每笔下单 / 清算前先 Pull 一次：

```text
用户提交订单 →
  前端从 Hermes 拉最新 VAA →
  合约调用 updatePriceFeeds(VAA) →
  读取 mark price + conf →
  执行成交或清算
```

延迟从"分钟级心跳"降到"实时刷新"，代价是用户每次都要付一份小额更新 gas（被均摊到 maker/taker fee 里）。这就是为什么 Solana 永续 DEX 默认 Pyth、EVM 借贷协议默认 Chainlink——前者吃延迟、后者吃稳。

## 踩过的坑

1. **Pull 模型必须配套自更新**——合约只读不更新会拿到上次别人留下的陈旧价。最常见 bug 是新人照搬 Chainlink 写法直接 `getPriceUnsafe()`，结果读到几小时前的快照。生产代码要么 `updatePriceFeeds` 后读，要么用 `getPriceNoOlderThan` 强制 staleness 上限。

2. **conf 不是装饰**——Pyth 返回 `price ± conf`，行情剧烈时 conf 会自动拉宽到几个百分点。盲信 price 等于把不确定性当真理。规则是 `conf / price < 阈值` 才用，否则 revert 或退化处理。

3. **Wormhole 桥风险继承**——跨 EVM 链时数据靠 Wormhole 守护人签名搬。2022 年 Wormhole 主合约漏洞被盗 3.2 亿美元事件证明这条桥不是无懈可击。Pyth 安全 ≤ Wormhole 安全，重资产场景要做兜底（多源喂价 / 阈值校验）。

4. **getPriceUnsafe vs getPriceNoOlderThan**——前者无 staleness 检查，后者用了不更新就 revert。教程例子常用 unsafe 方便讲解，主网部署忘改是常见踩坑。

## 适用 vs 不适用场景

**适用**：
- 永续合约 / 期权 / 衍生品类 DeFi（需要次秒延迟的标记价）
- 高频清算 / 限价单类策略（[[aave-v3]] 这类秒级清算受益）
- Solana 生态原生应用（不走桥，最快路径）
- 跨链多资产覆盖（400+ 资产 / 90+ 链统一 ID）

**不适用**：
- 不需要高频的喂价（每小时心跳就够的清算阈值类，[[chainlink]] 的 Push 模型 + 现成集成更省事）
- 完全去信任场景（仍依赖 publisher 集合 + Wormhole 守护人多数诚实）
- 链上随机数 / 任意 API（Pyth 只做价格类数据，VRF / Functions 类需求看 Chainlink）
- 不愿让用户付更新 gas 的产品（Pull 模型把成本转给消费者）

## 历史小故事（可跳过）

- **2021 年**：芝加哥做市商 Jump Trading 系工程师在 Solana 上做出 Pyth v1，主打"做市商把内部价直接发上链"。
- **2022 年 1 月**：通过 Wormhole 桥首次跨到 EVM。同年 2 月 Wormhole 被盗 3.2 亿美元，桥被及时修补和补偿。
- **2022 年中**：Pyth 推出 Pull 模型 + Pythnet 应用链，把聚合从 Solana 主网搬到专属环境，避开主网拥堵和成本。
- **2023 年 11 月**：原生代币 PYTH 上线，启动质押治理（Oracle Integrity Staking），让 publisher 抵押代币背书报价质量。
- **2024–2025 年**：跨链覆盖扩到 90+ 条链，资产数过 400，与 [[chainlink]] 在永续 DEX 喂价市场正面竞争。

## 学到什么

1. **一手数据 vs 二手转抄是预言机分水岭**——Pyth 让数据生产者直接签名，省掉中间节点环节；这是 Chainlink Push 模型之外的另一条路径，各有适用场景。
2. **Pull 模型把 gas 成本和延迟同时优化了**——不消费就不上链，谁要谁付，喂价频率不再受预算约束。代价是消费者代码复杂度上升。
3. **置信区间是预言机的"安全带"**——单价 + 置信带比单价多了一维信息，让消费合约能在波动加大时自动收紧风控。
4. **应用链（Pythnet）+ 跨链桥**这套组合，是把"高频共识"和"广泛分发"解耦的工程模式，在其他高频链下应用里会反复出现。

## 延伸阅读

- 官方文档：[Pyth Network Docs](https://docs.pyth.network)（Pull / Push 模型对比 + SDK 教程齐全）
- 白皮书：[Pyth Network Whitepaper](https://pyth.network/whitepaper.pdf)（一手数据 + 聚合 + 分发完整设计）
- Hermes API：[hermes.pyth.network](https://hermes.pyth.network)（链下拿 VAA 的 HTTP/WS 端点）
- [[chainlink]] —— Push 模型预言机标准实现，Pyth 的主要对手
- [[wormhole]] —— Pyth 跨链分发的底层桥

## 关联

- [[chainlink]] —— 同类预言机，Push vs Pull 路径不同；Pyth 主打高频，Chainlink 主打稳定通用
- [[chainlink-ccip]] —— Chainlink 的跨链消息子产品，对应 Pyth 用 Wormhole 的位置
- [[wormhole]] —— Pyth 跨 EVM 链时的跨链桥，安全上限取决于此
- [[aave-v3]] —— 借贷协议清算价场景；高频衍生品借贷会接 Pyth
- [[uniswap-v3]] —— DEX 自给报价为主，但衍生品集成时常用 Pyth
- [[arbitrum]] —— L2 上 Pyth 通过 Wormhole VAA 提供同套喂价

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
