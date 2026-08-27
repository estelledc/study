# Anchor + Ape Framework source review (writer FQ)

> 用途：记录 `anchor` 与 `ape-framework` 项目页迁移所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。后缀 `-fq` 标记 2026-08-27 平行 writer FQ。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer FQ
- assigned pair：`anchor` + `ape-framework`
- evidence：GitHub metadata、npm / PyPI 包元数据、固定 tag 源码树静态阅读
- not executed：未安装上游依赖，未编译 Solana 程序，未跑 `anchor test` / `ape test`，未连 RPC / fork，未测 compute units、gas 或吞吐
- worktrees：GitHub tag tarball 解压到本机 `research-worktrees/`（gitignored），不进入 Git
  - Anchor tarball `v1.1.2` ≈ 73MB
  - Ape tarball `v0.8.51` ≈ 708KB（完整 git 体积约 1.75GB，已跳过整仓 clone）

## Anchor

- canonical source：`https://github.com/otter-sec/anchor`
- also reachable：`https://github.com/coral-xyz/anchor`（GitHub 重定向到同一仓库）
- ownership observed in npm `repository` field：`coral-xyz`（0.32 / 1.0.0-rc.2）→ `solana-foundation`（1.0.0–1.0.2）→ `otter-sec`（1.1.x）
- revision：`24035e2b0035c87e321acc1c05f97793829a87f1`
- provenance：
  - annotated tag `v1.1.2` → tag object `0984d7a19ae6cfea19d78fab228b2af016b63021` → peeled commit `24035e2b...`
  - that commit `VERSION` 与 workspace `package.version` 均为 `1.1.2`
  - npm `@anchor-lang/core@1.1.2` 与 `@anchor-lang/cli@1.1.2` 的 `gitHead` 均为 `24035e2b...`
  - npm `@coral-xyz/anchor` latest 仍为 `0.32.1`（`gitHead` `1ebbe581...`，2025-10-10）；无 1.x 版本，未绑定
  - 上游另有 `v2.0.0-rc.1`，未绑定
- license：Apache-2.0（根 `LICENSE`）；TS 包声明 `(MIT OR Apache-2.0)`
- inspected：
  - `VERSION`、`Cargo.toml`、`README.md`、`LICENSE`、`CHANGELOG.md`（1.0 / 1.1 段）
  - `lang/src/lib.rs`、`lang/src/context.rs`
  - `lang/syn/src/hash.rs`、`lang/syn/src/codegen/program/common.rs`、`lang/syn/src/codegen/program/dispatch.rs`
  - `lang/syn/src/parser/accounts/constraints.rs`
  - `lang/attribute/program/src/lib.rs`
  - `lang/derive/space/src/lib.rs`
  - `ts/packages/anchor/package.json`
  - `ts/packages/anchor/src/program/index.ts`
  - `ts/packages/anchor/src/program/namespace/methods.ts`
- observed：
  - `#[program]` 把 `pub fn` 编成指令；默认 discriminator 是 `SHA256("global:{name}")` 的前 8 字节；dispatch 按 `data.starts_with(DISCRIMINATOR)` 路由，未命中则 `InstructionFallbackNotFound`（除非定义 fallback）
  - v0.31 起 `Discriminator` 长度可覆盖；IDL 不允许空 discriminator
  - `#[derive(Accounts)]` 解析 `mut` / `signer` / `seeds` / `bump` / `has_one` / `init` 等约束
  - `InitSpace` 只算数据体；文档示例仍写 `space = 8 + ExampleAccount::INIT_SPACE`
  - 1.0 把 TS 包从 `@coral-xyz/anchor` 改名为 `@anchor-lang/core`；`Program` 构造为 `(idl, provider?, coder?, resolver?)`，`programId` 取 `idl.address`
  - `program.rpc` / `instruction` / `transaction` 已 deprecated，推荐 `program.methods.<ix>(...).accounts(...).rpc()`
  - `engines.node` 为 `>=20.18`；`anchor-lang` MSRV 在 1.1.0 changelog 记为 `1.89`
  - workspace 依赖 Solana 3.x crate（`solana-program = "3.0.0"`）
  - 1.0 起默认禁止重复可变账户，需 `dup` 约束才放行；legacy on-chain IDL 指令需 `#[program(legacy_idl)]`
  - README 安装脚本仍指向 `solana-foundation/anchor` 的 AVM nightly URL

## Ape Framework

- canonical source：`https://github.com/ApeWorX/ape`
- revision：`dde11f1b975d691c15e62ee03293fff3a7cff00b`
- package：`eth-ape==0.8.51`
- provenance：
  - lightweight tag `v0.8.51` 直接指向该提交
  - 提交说明：`fix(Test): eth_call fails when base fee exceeds 1 gwei (#2803)`
  - PyPI `eth-ape` 0.8.51 未 yank；`requires-python` 为 `>=3.10,<4`；`project.urls.Repository` 为该仓
  - 版本由 setuptools_scm 动态读取，根 `pyproject.toml` 无静态 version 字段
- license：Apache-2.0
- inspected：
  - `pyproject.toml`、`README.md`、`LICENSE`
  - `src/ape/__init__.py`、`src/ape/_cli.py`
  - `src/ape/api/__init__.py`、`src/ape/api/compiler.py`
  - `src/ape/plugins/__init__.py`
  - `src/ape/managers/__init__.py`、`src/ape/managers/accounts.py`、`src/ape/managers/networks.py`
  - `src/ape/pytest/plugin.py`、`src/ape/pytest/config.py`、`src/ape/pytest/fixtures.py`
  - `src/ape_ethereum/ecosystem.py`（`default_network`）
  - `src/ape/utils/misc.py`（`LOCAL_NETWORK_NAME`）
  - `src/ape_plugins/_cli.py`、`src/ape/plugins/_utils.py`
- observed：
  - 顶层懒加载对象：`Contract` / `Project` / `accounts` / `chain` / `compilers` / `config` / `convert` / `fixture` / `networks` / `project` / `reverts`
  - Manager 层：Account / Chain / Compiler / Config / Conversion / Network / Plugin / Project / Query
  - 插件 hook：Account / Compiler / Config / Conversion / Dependency / Ecosystem / Explorer / Network / Project / Provider / Query
  - CLI 由 `ape._cli:cli` 经 `ape_cli_subcommands` entry points 装核心子命令；`recommended-plugins` extra 列出 10 个包（solidity / vyper / foundry / hardhat / alchemy / infura / etherscan / ens / tokens / template）
  - `ape plugins install foundry` 会把名字规范化为 PyPI `ape-foundry`
  - 网络选择是 `ecosystem:network:provider`；缺省 ecosystem 默认 `ethereum`，ethereum 的 `default_network` 是 `local`，不是 mainnet
  - 一段选择只给 ecosystem 时走该 ecosystem 的 default network + default provider；两段缺 provider 时用该 network 的 default provider
  - pytest fixture `accounts` / `chain` / `project` / `networks` / `Contract` 为 session scope；`accounts` 返回 `account_manager.test_accounts`
  - 默认注入 `_function_isolation`：先 `chain.snapshot()`，teardown `restore`；`--disable-isolation` 关闭；provider 不支持 snapshot 时只警告
  - `--gas` / `--coverage` 是独立开关，不是 `ape test` 默认行为
  - `accounts["0x…"]`：AccountManager 找不到本地账户时回落到 `test_accounts`，后者在 provider 支持 `unlock_account` 时做 impersonation
  - `requires-python` 为 `>=3.10,<4`；classifiers 含 3.10–3.14；README 仍写 3.10–3.13 与 Linux/macOS + WSL，未核验原生 Windows

## 未执行

- 未 `cargo` / `pnpm` / `pip` 安装任一上游
- 未部署 Solana 程序、未发交易、未 fork 主网
- 未跑上游测试、fuzz、gas report 或 coverage
- 未测量 CU、gas、clone 后的运行时性能
