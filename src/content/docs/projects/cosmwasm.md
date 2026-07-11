---
title: CosmWasm — Cosmos 上的 wasm 智能合约
来源: 'https://github.com/CosmWasm/cosmwasm'
日期: 2026-05-30
分类: blockchain
难度: 中级
---

## 是什么

CosmWasm 是 Cosmos 生态的**智能合约平台**：你用 Rust 写合约，编译成 `.wasm` 字节码，扔到链上，链就帮你跑。日常类比：像把"App"装进一台公共手机——手机（链）保证每个人看到的执行结果完全一致，App（合约）只能用手机给的那几个 API。

它解决的事是：Cosmos SDK 链原本只能写"模块"（Go 写的链原生功能），普通人改不了。CosmWasm 加了一个 `x/wasm` 模块，**任何人**都能上传 Wasm 合约，链就有了图灵完备的合约能力。

最小骨架：

```rust
#[entry_point]
pub fn instantiate(deps: DepsMut, env: Env, info: MessageInfo, msg: InstantiateMsg)
    -> Result<Response, ContractError> { /* 创建时跑一次 */ }

#[entry_point]
pub fn execute(deps: DepsMut, env: Env, info: MessageInfo, msg: ExecuteMsg)
    -> Result<Response, ContractError> { /* 改状态 */ }

#[entry_point]
pub fn query(deps: Deps, env: Env, msg: QueryMsg) -> StdResult<Binary> { /* 读状态 */ }
```

三个 entry point + 一份 schema，就是一个完整合约。

## 为什么重要

不理解 CosmWasm，下面这些事都没法解释：

- 为什么 Osmosis / Juno / Neutron 这些 Cosmos 链上的 DeFi 合约都是 Rust 写的，不是 Solidity
- 为什么同一份合约代码能"一份编译，多链部署"——Cosmos 多链生态的合约可移植性靠它
- 为什么 CosmWasm 合约不能像 EVM 那样直接 `call` 别的合约——actor 模型把"调用"换成了"发消息"
- 为什么 Wasm 沙箱里禁了浮点、时间、随机数——任何不确定性都会让全链共识失败

## 核心要点

CosmWasm 跑合约的过程可以拆成 **三件事**：

1. **三个入口**：`instantiate` / `execute` / `query`，分别对应"建合约时跑一次"、"改状态"、"读状态"。每次调用都是**无状态函数**——传 `deps`（存储 + API + querier）+ `env`（块高时间戳）+ `info`（发起人 + 转的代币）。类比：每次接到电话都从"什么都不记得"开始，靠存储里的字节自己回忆。

2. **actor 模型**：合约 A 想调合约 B，**不能**像 EVM 那样直接拿返回值。A 在 `Response` 里塞一条 `SubMsg`，链替你发出去；B 跑完，链再把结果送回 A 的 `reply` 入口。类比：寄信、等回信，不是当面拿东西。

3. **沙箱 + host import**：合约只能调链给的几个函数（读 KV 存储、查地址、验签名）。读文件、随机数、当前时间——全禁。类比：手机 App 只能用系统给的 API，不能直接读你硬盘。

三件事加起来：**确定性 + 隔离 + 消息驱动**。

## 实践案例

### 案例 1：最小 cw20 token 合约

cw20 是 CosmWasm 版的 ERC20 标准。`InstantiateMsg` 设初始供给，`ExecuteMsg::Transfer` 转账：

```rust
pub fn execute_transfer(
    deps: DepsMut, env: Env, info: MessageInfo,
    recipient: String, amount: Uint128,
) -> Result<Response, ContractError> {
    let rcpt = deps.api.addr_validate(&recipient)?;
    BALANCES.update(deps.storage, &info.sender, |b|
        b.unwrap_or_default().checked_sub(amount))?;
    BALANCES.update(deps.storage, &rcpt, |b|
        Ok::<_, ContractError>(b.unwrap_or_default() + amount))?;
    Ok(Response::new().add_attribute("action", "transfer"))
}
```

`BALANCES` 是 `Map<&Addr, Uint128>`，`cw-storage-plus` 包替你处理字节序。`Response::new()` 返回的是这次调用产生的事件，**不是**返回值。

### 案例 2：跨合约调用 + reply

主合约想调子合约，得这样写：

```rust
let sub = SubMsg::reply_on_success(
    WasmMsg::Execute {
        contract_addr: child.into(),
        msg: to_binary(&ChildMsg::DoWork {})?,
        funds: vec![],
    },
    REPLY_ID_DO_WORK,
);
Ok(Response::new().add_submessage(sub))
```

链跑完子合约，会再调主合约的 `reply` 入口，带 `Reply { id, result }`。你在 `reply` 里读 `result.events` 才能拿到子合约结果。**不是**同步返回值。

### 案例 3：cw-storage-plus 管状态

裸 `deps.storage` 只认字节，写错前缀就读不出来。用 `Item` / `Map` 包装：

```rust
const CONFIG: Item<Config> = Item::new("config");
const BALANCES: Map<&Addr, Uint128> = Map::new("balance");

CONFIG.save(deps.storage, &cfg)?;
let b = BALANCES.may_load(deps.storage, &addr)?.unwrap_or_default();
```

字符串 `"config"` 是 storage 的命名空间前缀，不能两个数据结构撞。

## 踩过的坑

1. **入口函数无状态**：`instantiate/execute/query` 每次都从零反序列化 `deps/env/info`，**不能**依赖 `static mut` 或全局变量；任何"上次记得什么"必须落到 storage。

2. **跨合约调用拿不到返回值**：新人想 `let result = call(child)`——CosmWasm 没这个语法。必须 `SubMsg` + `reply` 两步走，否则编译过但行为完全错。

3. **浮点 / 时间 / 随机数禁用**：`f64::sqrt` 编译过但上链跑会 trap；要时间用 `env.block.time`；要随机用 oracle 或 commit-reveal，**绝对不能**用任何系统级随机。

4. **migrate 入口是后门**：`migrate` 让 admin 能换合约代码——能修 bug，也能让管理员偷换逻辑跑路。上线前要么交给 governance，要么 `clear-admin` 让合约不可变。

## 适用 vs 不适用场景

**适用**：

- Cosmos SDK 链上的合约（Osmosis / Juno / Neutron / Stargaze 等）
- 想用 Rust 类型系统替你拦下大半 bug 的复杂金融合约
- 多链部署同一份合约（Wasm 字节码跨 Cosmos 链通用）
- IBC + 合约的组合（CosmWasm 原生支持 IBC 入口）

**不适用**：

- 以太坊主网或 EVM L2（那边走 Solidity / Vyper，不接 Wasm）
- Solana 这种带账户模型 + BPF 的链（用 [[anchor]] / Rust BPF）
- 需要浮点 / 真随机 / 系统时间的逻辑（沙箱不允许）
- 想用 Move 语言的资源类型（Aptos / Sui 是另一套世界）

## 历史小故事（可跳过）

- **2018 年**：Confio 团队（Ethan Frey 主导）启动 CosmWasm，把 WebAssembly 智能合约引入 Cosmos 生态。
- **2019 年**：发 0.1，最早的 Wasm 合约能在测试链跑起来；同期还在和 Substrate ink! 互相参考。
- **2020 年**：x/wasm 模块合并进 Cosmos SDK 生态，成为标准合约层。
- **2022 年**：Osmosis / Juno 等主网启用 CosmWasm，合约真正进入生产；cw-plus 标准合约库成熟。
- **2024-2026**：Neutron 这种"专用 CosmWasm 链"出现，CosmWasm 已是 Cosmos 主流合约平台。

## 学到什么

1. **Wasm 是 EVM 之外的另一条合约路线**——不绑死语言，谁能编 Wasm 就能写合约
2. **actor 模型 vs 同步调用**：CosmWasm 选 actor 是为了让"调子合约失败"也能可控回滚
3. **确定性 > 表达力**：链上禁浮点/时间/随机不是技术不足，是必须如此，否则共识崩
4. **标准合约 + 工具链**才是生态成败：cw20/cw721/cw-multi-test 这些"周边"决定了 CosmWasm 用着舒不舒服

## 延伸阅读

- 官方文档：[CosmWasm Docs](https://docs.cosmwasm.com/)（从入门到 IBC 全套）
- 标准合约库：[cw-plus](https://github.com/CosmWasm/cw-plus)（cw20/cw721/cw3 治理等）
- 代码教程：[Area-52 学习路径](https://area-52.io/)（社区维护的合约教程）
- 视频：[Ethan Frey — CosmWasm Origins](https://www.youtube.com/results?search_query=ethan+frey+cosmwasm)
- [[cosmos-sdk]] —— CosmWasm 寄生在 Cosmos SDK 的 x/wasm 模块里
- ink!（Substrate 合约语言）—— 同样走 Rust+Wasm，但本仓库的 `[[ink]]` 是终端 UI 库，不能混链

## 关联

- [[cosmos-sdk]] —— x/wasm 模块的宿主链框架，没有它 CosmWasm 跑不起来
- [[move-language]] —— Aptos/Sui 的资源类型合约语言，和 CosmWasm 的 Rust/Wasm 路线形成对照
- [[cairo-lang]] —— StarkNet 用的合约语言，另一条非 EVM 路线，但走 zk
- [[anchor]] —— Solana 上的 Rust 合约框架，账户模型不同但工程体验类似
- [[arbitrum]] —— EVM L2，对比理解为什么 CosmWasm 选 Wasm 而不是兼容 EVM
- [[optimism]] —— EVM L2，作为"另一条非 Wasm 路线"对照
- [[solana]] —— BPF 而非 Wasm 的合约链，对比沙箱选型差异

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[anchor]] —— Anchor — Solana 合约开发框架
- [[arbitrum]] —— Arbitrum Nitro — Offchain Labs 的 Optimistic Rollup 客户端
- [[cairo-lang]] —— Cairo — Starknet 的 zk 友好编程语言
- [[ink]] —— ink — 用 React 组件树写终端 CLI
- [[optimism]] —— Optimism — 以太坊 L2 旗舰栈，把交易搬到便宜车道再回主网结算
- [[solana]] —— Solana — Rust 写的高性能 PoH 链

