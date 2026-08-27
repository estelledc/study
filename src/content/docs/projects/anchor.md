---
title: Anchor — Solana 合约开发框架
来源: 'https://github.com/otter-sec/anchor'
日期: 2026-08-27
分类: 区块链
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: system
  canonical_source: https://github.com/otter-sec/anchor
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 24035e2b0035c87e321acc1c05f97793829a87f1
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 1.1.2
---

## 是什么

Anchor 是 **Solana 程序（链上合约）的开发框架**：用 Rust eDSL 写指令，编译期生成账户校验、8 字节默认 discriminator 路由，并吐出 IDL；TypeScript 客户端再按 IDL 组交易。日常类比：你只写“这个房间必须能签字、必须可写、钥匙由这两颗种子算出”，框架在进门前把海关单核对完。

固定 `1.1.2` 的仓库现在由 OtterSec 托管。`github.com/coral-xyz/anchor` 仍会重定向到同一仓；npm 在 1.0 把客户端从 `@coral-xyz/anchor` 改名为 `@anchor-lang/core`。旧笔记里的 0.30 包名不能直接抄到 1.1.2。

```rust
use anchor_lang::prelude::*;

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
mod counter {
    use super::*;
    pub fn increment(ctx: Context<Increment>) -> Result<()> {
        ctx.accounts.counter.count += 1;
        Ok(())
    }
}
```

## 为什么重要

不按固定 1.1.2 源码读，下面这些印象会对不上：

- 为什么 `new Program(idl, programId, provider)` 这种三参数构造已经不是当前入口——`programId` 来自 `idl.address`
- 为什么继续 `npm i @coral-xyz/anchor@latest` 会停在 `0.32.1`，而 Rust crate / `@anchor-lang/core` 已经是 `1.1.2`
- 为什么默认会拒绝“同一个可变账户出现两次”，除非显式 `dup`
- 为什么 `space` 仍要自己加 discriminator 宽度，`InitSpace` 只算数据体

## 核心架构与流程

固定提交的主链可以拆成五步：

1. **`#[program]` 登记指令**：属性宏扫模块里的 `pub fn`，为每条指令生成 discriminator 常量。默认预镜像是 `global:{fn_name}`，再取 SHA-256 的前 8 字节。v0.31 起长度可以覆盖；IDL 生成不允许空 discriminator。

2. **`dispatch` 按前缀路由**：运行时看 instruction data 是否 `starts_with` 某条指令的 discriminator，命中就把剩余字节交给对应 handler。都未命中则走 fallback；没有 fallback 就返回 `InstructionFallbackNotFound`。自 1.0 起，链上 legacy IDL 指令只在 `#[program(legacy_idl)]` 时才编进 dispatch。

3. **`#[derive(Accounts)]` 做进门安检**：结构体字段上的 `init` / `mut` / `signer` / `seeds` / `bump` / `has_one` 在 `try_accounts` 里展开成校验。类比海关申报单：填错直接拦下。`Context` 还带上算好的 `bumps`，handler 不必重算 PDA bump。

4. **IDL 是前后端契约**：`idl-build` feature 让宏把指令、账户、类型打印进构建图。1.0 起 IDL 管理改走 Program Metadata，不再默认编进那组 legacy IDL 指令。

5. **TS 客户端读 `idl.address`**：`@anchor-lang/core` 的 `Program` 构造是 `(idl, provider?, coder?, resolver?)`。`program.methods.increment().accounts(...).rpc()` 是推荐链；`program.rpc` / `instruction` / `transaction` 仍在，但已标 deprecated。Node 引擎声明 `>=20.18`。

## 实践示例

### 案例 1：README 里的 Counter

固定 README 的最小例子用 `has_one` 锁 authority，并用手工 `space = 48`（8 字节 discriminator + 32 字节 pubkey + 8 字节 `u64`）：

```rust
#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer = authority, space = 48)]
    pub counter: Account<'info, Counter>,
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Increment<'info> {
    #[account(mut, has_one = authority)]
    pub counter: Account<'info, Counter>,
    pub authority: Signer<'info>,
}
```

漏写 `mut` 时，handler 里改账户数据会在运行期失败，而不是编译期红线。

### 案例 2：PDA + InitSpace

`InitSpace` 只给出数据体长度。`derive/space` 自己的文档示例仍要求你加上 discriminator：

```rust
#[account]
#[derive(InitSpace)]
pub struct Vault {
    pub owner: Pubkey,
    pub amount: u64,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(
        init,
        payer = user,
        space = 8 + Vault::INIT_SPACE,
        seeds = [b"vault", user.key().as_ref()],
        bump
    )]
    pub vault: Account<'info, Vault>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}
```

合约 `seeds` 与客户端 `findProgramAddressSync` 必须用同一套字节。一边写 `b"vault"`、一边少编码，校验会报 seeds 约束失败。

### 案例 3：1.1.2 的 TypeScript 调用

```ts
import { Program } from "@anchor-lang/core"

const program = new Program(idl, provider)
await program.methods
  .increment()
  .accounts({ counter: counterPda })
  .rpc()
```

`idl.address` 必须是程序 pubkey。`accounts()` 只接受“解析器补不出来的账户”；能自动解析的要用 `accountsPartial`，或改走 `accountsStrict` 全手填。

## 踩过的坑

1. **继续装 `@coral-xyz/anchor`**：npm latest 停在 `0.32.1`，没有 1.x。1.1.2 客户端是 `@anchor-lang/core@1.1.2`，`gitHead` 与本页绑定提交一致。
2. **三参数 `new Program(idl, programId, provider)`**：1.1.2 第二参是 `provider`。程序地址只从 `idl.address` 读。
3. **`space` 只写数据体**：`InitSpace` 不含 discriminator。固定文档示例是 `8 + Type::INIT_SPACE`。
4. **重复可变账户**：1.0 默认禁止同一可变账户出现两次，要用 `dup` 才放行。
5. **升级后 IDL 没跟上**：discriminator / 指令参数对不上会走到 fallback；没有 fallback 就是 `InstructionFallbackNotFound`。1.0 还删掉了 `idl init` / `idl upgrade` 的 program id 参数。

## 适用 vs 不适用场景

**适用**：

- 需要账户约束 DSL + IDL 生成客户端的 Solana 程序
- 能接受固定 1.1.2 的 Solana 3.x crate、Rust MSRV 1.89、Node `>=20.18`
- 愿意把安全检查写成编译期约束，而不是纯手写 `AccountInfo`

**不适用**：

- 仍按 `@coral-xyz/anchor@0.32` 或 0.30 教程改 1.1.2 工程
- 需要把静态阅读写成“已在 devnet / mainnet 跑通”——本文没有这样做
- 极致 CU 手写路径：宏生成代码的开销必须以目标集群实测为准，不能套用未绑定的“多几百 CU”
- 非 Solana 运行时——Anchor 不提供跨链合约 DSL

## 固定版本边界

- 本文绑定 `otter-sec/anchor@24035e2b0035c87e321acc1c05f97793829a87f1`。annotated tag `v1.1.2` 解引用到该提交；`VERSION` 与 workspace version 均为 `1.1.2`。
- npm `@anchor-lang/core@1.1.2` / `@anchor-lang/cli@1.1.2` 的 `gitHead` 与该提交一致。`@coral-xyz/anchor@0.32.1` 是另一条旧线，未绑定。
- 上游另有 `v2.0.0-rc.1`；README 的 AVM 安装 URL 仍写 `solana-foundation/anchor`。两者都不在本页合同内。
- 未安装依赖、未编译、未部署、未跑测试或 fuzz，状态保持 `UNVERIFIED`。

## 学到什么

1. **框架的默认值才是安全合同**——账户约束和 discriminator 路由把“记得检查”变成“不写就进不去”。
2. **IDL 地址是客户端的程序身份证**——1.x 不再把 program id 当 `Program` 构造参数。
3. **包名和托管组织会变，SHA 不会**——coral-xyz / solana-foundation / otter-sec 是同一 git 历史的不同门牌。
4. **空间计算仍是两段式**——`InitSpace` 管数据，discriminator 宽度要显式加。

## 应用型自测

1. 在 1.1.2 里写 `new Program(idl, programId, provider)`，`programId` 还会被当成程序地址吗？
2. `#[derive(InitSpace)]` 之后写 `space = Vault::INIT_SPACE`，少了什么？
3. `npm view @coral-xyz/anchor version` 若打印 `0.32.1`，能否当作本页的 1.1.2 客户端？

检查点：

1. 不会。第二参是 `provider`；地址来自 `idl.address`。
2. 少了默认 8 字节 discriminator。固定示例是 `8 + Vault::INIT_SPACE`。
3. 不能。1.1.2 客户端是 `@anchor-lang/core@1.1.2`。

## 延伸阅读

- 文档：[anchor-lang.com](https://www.anchor-lang.com/)
- 固定源码：[otter-sec/anchor](https://github.com/otter-sec/anchor) —— 本文绑定提交 `24035e2b0035c87e321acc1c05f97793829a87f1`
- 旧入口仍重定向：[coral-xyz/anchor](https://github.com/coral-xyz/anchor)
- [[solana]] —— 账户模型、PDA、租金是底层，Anchor 只是包了一层
- [[ape-framework]] —— Python / EVM 侧的对照框架

## 关联

- [[solana]] —— Anchor 跑在 Solana 上，账户、PDA、租金都是 Solana 概念
- [[foundry]] —— EVM 世界的工具链对照：Foundry 偏测试和部署，Anchor 偏合约 DSL
- [[cairo-lang]] —— Starknet 侧自己造语言，而不是 Rust eDSL
- [[ape-framework]] —— Python 系 EVM 开发框架，跨生态对照
- [[remix-ide]] —— EVM 在线 IDE，工作流和 Anchor CLI 不同
- [[uniswap-v3]] —— 以太坊主流 DeFi 合约，技术栈对照
- [[safe-contracts]] —— EVM 多签合约工程化的另一极

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[aptos-core]] —— Aptos — Move 系高性能 L1
- [[cosmos-sdk]] —— Cosmos SDK — 应用链开发框架
- [[cosmwasm]] —— CosmWasm — Cosmos 上的 wasm 智能合约
- [[ipfs]] —— IPFS / Kubo — 按内容哈希定位的去中心化文件系统
- [[move-language]] —— Move — 资源型智能合约语言
- [[openzeppelin-contracts]] —— OpenZeppelin Contracts — 以太坊智能合约的事实标准库
- [[sui]] —— Sui — 把链上资产拆成一个个独立对象的 L1
- [[viem]] —— viem — 现代 TypeScript EVM 库
