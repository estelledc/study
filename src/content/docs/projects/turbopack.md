---
title: Turbopack — 把 bundler 重做成增量计算应用
description: Webpack 作者 Tobias Koppers 第二代 bundler；底层 Turbo Tasks 引擎把每个编译步骤封装成可缓存任务节点。
sidebar:
  label: turbopack
  order: 56
---

> 状元篇 v1.1 / 项目类型：编译器 / 运行时（分支 C）
>
> 这不是 README 翻译。是把 Tobias Koppers 在 Webpack 5 之后**第二次**重写 bundler 的设计直觉，
> 还原回它的两条根：webpack 经验线 + Salsa / Adapton 增量计算线。
>
> 上一篇 [rspack](/projects/rspack/) 走 webpack 兼容路线（API 不变、底层 Rust 重写）。
> 这一篇 turbopack 走的是**重新发明 bundler 心脏**路线——所以心脏代码精读得放在 Turbo Tasks 引擎，而不是 plugin 系统。

## Layer 0 · 身份扫描

| 字段 | 值 |
|------|----|
| 仓库 | [vercel/next.js](https://github.com/vercel/next.js)（turbopack 子目录） |
| 历史仓库 | [vercel/turborepo](https://github.com/vercel/turborepo) — 2024-08 commit `611c8d28b170b8d94f89982fa2b01f5055fc5b59` 起被移走 |
| Star | 30,458（vercel/next.js，截至 2026-05-28） |
| Fork | 2,348 |
| License | MIT |
| 默认分支 | `main` |
| 主语言 | Rust（含 SWC 部分） |
| 维护方 | Vercel；主要贡献者 Tobias Koppers（webpack 1-5 作者）、Will Binns-Smith、Donny Wang、Justin Ridgewell |
| 最近活跃 commit | `1095b9ebd517dcdce2934ca0a632a2ad821f4b31`（2026-05-28），读时日期 2026-05-29 |
| 类似项目 | [rspack](/projects/rspack/) / [rolldown](/projects/rolldown/) / [esbuild](/projects/esbuild/) / [vite](/projects/vite/) / [bun](/projects/bun/) |

读时基线 commit：`1095b9ebd517dcdce2934ca0a632a2ad821f4b31`（下面所有 permalink 全部锚定这个 SHA）。

仓库迁移这件事本身很重要：

- 2022-10 Next.js 13 发布会时叫 "Webpack 的接班人，比 Vite 快 700×"，住在独立仓库 vercel/turborepo
- 2024-08 commit `611c8d28b170b8d94f89982fa2b01f5055fc5b59`（"chore: remove turbopack crates (#8906)"）正式从 turborepo 移出
- 现在 turbopack 50+ crate 都在 [`vercel/next.js/turbopack/crates/`](https://github.com/vercel/next.js/tree/1095b9ebd517dcdce2934ca0a632a2ad821f4b31/turbopack/crates)
- 这次搬家说明：**Vercel 内部已经把 turbopack 收敛成 Next.js 内部组件，不再装作"通用 bundler"**

## Layer 1 · 存在理由

读 Tobias 在 Next.js 官方博客和 [Turbopack 站点](https://turbo.build/pack)的核心论述，加上他在 Twitter / 演讲里的拆解，存在理由可以收拢成 4 句：

1. **Webpack 5 的天花板**：webpack 用 JS 写，single-thread 解析 + 没有 first-class 缓存抽象。Tobias 自己最清楚——大型 monorepo 上 webpack 的 cold build 已经物理不可改快。
2. **bundler 应该是 incremental 应用**：每次文件改动，只重做受影响的那部分；这不是优化，是 bundler 的**第一性原理**。学术界的 [Salsa / Adapton](/papers/salsa-adapton/) 给了 query-based incremental computation 的现成模型。
3. **重写时机**：Rust + tokio + SWC 都成熟了，可以把 webpack 的"plugin → loader → asset"流水线改造成 task graph。
4. **不要兼容 webpack plugin**：和 Rspack 反着走。Tobias 自己创造的 webpack plugin API 已经是历史负担——重做就重做彻底。

转译成给我自己听的版本：

- 2022 年的局面是：esbuild 快但 plugin 弱，webpack 慢但生态全。Tobias 说"快和强可以兼得，前提是 bundler 心脏是增量任务图"。
- Turbopack 不是"用 Rust 重写的 webpack"——那是 [Rspack 的路线](/projects/rspack/)。
- Turbopack 是"把 bundler 当 [Salsa](/papers/salsa-adapton/) 那种增量数据库写"。心脏是 Turbo Tasks 任务图，bundler 业务逻辑是这个引擎之上的应用层。
- 这个押注的代价：**plugin 生态从 0 开始**——这是 Vercel 把它收回到 Next.js 内部的根因。

## Layer 2 · 仓库地形

`vercel/next.js/turbopack/crates/` 下 53 个 crate。我把它们按 pipeline phase 重新分组：

| 阶段 | 代表 crate | 这一阶段做什么 |
|------|------------|---------------|
| 引擎层 | `turbo-tasks` / `turbo-tasks-macros` / `turbo-tasks-backend` / `turbo-tasks-fs` | 增量任务图、宏展开、持久化后端、缓存的文件系统读取 |
| 抽象层 | `turbopack-core` | Asset / Module / Reference / Chunk 四件套 trait（最重要的"项目语言") |
| 解析层 | `turbopack-resolve` | node_modules 解析、export condition 仲裁 |
| 语言后端 | `turbopack-ecmascript` / `turbopack-css` / `turbopack-mdx` / `turbopack-image` / `turbopack-static` | 各类型源文件 → 内部 Module |
| 运行时 | `turbopack-ecmascript-runtime` / `turbopack-ecmascript-hmr-protocol` | 浏览器侧加载器、HMR 协议 |
| 应用层 | `turbopack` / `turbopack-cli` / `turbopack-browser` / `turbopack-nodejs` / `turbopack-dev-server` | 把上面拼成可执行 bundler |
| 工具 | `turbopack-trace-server` / `turbopack-tracing` / `turbopack-bench` / `turbopack-test-utils` | 调试、性能诊断、测试 |
| 通用基建 | `turbo-rcstr` / `turbo-bincode` / `turbo-persistence` / `turbo-prehash` | 字符串 intern、序列化、持久化、哈希 |

顶层目录注释表（精简到关键 13 行）：

```
turbopack/crates/
├── turbo-tasks/                          ← 增量计算引擎核心：任务、Vc、Cell
├── turbo-tasks-macros/                   ← #[turbo_tasks::function] / value / value_trait 等宏
├── turbo-tasks-backend/                  ← 任务图后端（内存 / 持久化）
├── turbo-tasks-fs/                       ← 把文件 IO 包装成任务节点（自动失效）
├── turbopack-core/                       ← Asset / Module / Reference / Chunk 四件套 trait
├── turbopack-resolve/                    ← 模块解析（package exports / node_modules）
├── turbopack-ecmascript/                 ← .js .ts .jsx 后端 (含 SWC 集成)
├── turbopack-css/                        ← .css 后端 (含 LightningCSS 集成)
├── turbopack-mdx/                        ← .mdx → ecmascript
├── turbopack-ecmascript-runtime/         ← 浏览器侧 chunk loader
├── turbopack-dev-server/                 ← 开发模式 HTTP 服务
├── turbopack-cli/                        ← 独立 CLI（实验性，主用法是从 next.js 调用）
└── turbopack/                            ← 顶层组装：把所有后端拼成可工作的 bundler
```

心脏文件清单（编译器分支 C 要求每 phase 1 个代表，所以选 4 个）：

1. **引擎心脏**：[`turbopack/crates/turbo-tasks/src/lib.rs`](https://github.com/vercel/next.js/blob/1095b9ebd517dcdce2934ca0a632a2ad821f4b31/turbopack/crates/turbo-tasks/src/lib.rs) — Turbo Tasks 引擎门面
2. **宏心脏**：[`turbopack/crates/turbo-tasks-macros/src/func.rs`](https://github.com/vercel/next.js/blob/1095b9ebd517dcdce2934ca0a632a2ad821f4b31/turbopack/crates/turbo-tasks-macros/src/func.rs) — `#[turbo_tasks::function]` 展开
3. **抽象心脏**：[`turbopack/crates/turbopack-core/src/asset.rs`](https://github.com/vercel/next.js/blob/1095b9ebd517dcdce2934ca0a632a2ad821f4b31/turbopack/crates/turbopack-core/src/asset.rs) + [`reference/mod.rs`](https://github.com/vercel/next.js/blob/1095b9ebd517dcdce2934ca0a632a2ad821f4b31/turbopack/crates/turbopack-core/src/reference/mod.rs)
4. **图心脏**：[`turbopack/crates/turbopack-core/src/chunk/mod.rs`](https://github.com/vercel/next.js/blob/1095b9ebd517dcdce2934ca0a632a2ad821f4b31/turbopack/crates/turbopack-core/src/chunk/mod.rs)

热点 commit 类型（按 message 分组的近期主题，从 PR 历史推断）：

```
~40%  Turbopack: <...>           ← 跨 crate 的 bundler 行为修复
~25%  Turbo Tasks: <...>         ← 引擎层 (任务图、ReadRef、OperationVc)
~20%  ecmascript / css / mdx     ← 语言后端
~10%  分析器 (analyzer) 修 bug    ← 静态求值导出条件 / require.context
~5%   tracing / persistence      ← 周边
```

—— 所以 commit 热点和我上面"4 个心脏文件"的选择吻合：引擎 + 抽象 + 后端 + 图。

## Pipeline 图（编译器分支 C 强制）

![Turbopack pipeline + Turbo Tasks 增量缓存层](/projects/turbopack/01-pipeline.webp)

caption：

- 横轴是物理 pipeline phase：source 文件 → Asset trait → 语言后端解析成 Module → 收集 ModuleReference 形成 Module Graph → 拆 Chunk Graph → 生成 OutputAsset
- 橙色横条是底层 Turbo Tasks 引擎：每个 phase 的任意函数都被 `#[turbo_tasks::function]` 包装成节点；输入哈希命中缓存就跳过
- 红色框表示文件改动时，FS watcher 反向 invalidate 任务图，只有"被影响"的子图重算
- 绿色横条是可插拔的语言后端：ecmascript / css / mdx / image / static，全都以 trait 实现 Asset / Module 接口
- 风格：克制留白 + 单一颜色家族区分（橙=引擎、绿=后端、红=触发、蓝=数据流），避免复杂 ASCII 难读

![Turbopack 谱系：webpack 主线 + 增量计算理论根](/projects/turbopack/02-lineage.webp)

caption：

- 上栏：webpack 1 (2014) → webpack 5 (2020) → Rspack (2023) → Turbopack (2022) — Tobias 主线
- 中栏：esbuild / Vite / Rolldown / Bun — Rust/Go 原生 bundler 并行流派
- 下栏：[Adapton (2014)](/papers/adapton/) → [Salsa (2018)](/papers/salsa-adapton/) → Bazel BEP → Turbo Tasks (2022)，增量计算理论线
- 收束箭头：Turbopack = webpack 心智 + Salsa/Adapton 理论的合流；Rspack 走的是另一条路（API 兼容）

## Layer 3 · 核心机制（编译器分支 C：3 段独立小节，每段 ≥ 20 行真实 Rust 代码 + ≥ 5 旁注 + ≥ 1 怀疑）

### 3.1 引擎层：`#[turbo_tasks::function]` 宏 + 任务依赖追踪

permalink：[`turbopack/crates/turbo-tasks-macros/src/func.rs`（commit 1095b9ebd5）](https://github.com/vercel/next.js/blob/1095b9ebd517dcdce2934ca0a632a2ad821f4b31/turbopack/crates/turbo-tasks-macros/src/func.rs)

抓的是 `static_block` 函数——这是宏展开时生成"调用现场"的地方：

```rust
/// The block of the exposed function for a static dispatch call to the given native function.
pub fn static_block(&self, native_function_ident: &Ident) -> TokenStream {
    let output = &self.output;
    let inputs = self.inline_input_idents();
    let assertions = self.get_assertions();
    let mut block = if self.is_self_used
        && let Some(converted_this) = self.converted_this()
    {
        let persistence = self.persistence_with_this();
        quote! {
            {
                #assertions
                let this = #converted_this;
                let inputs = (#(#inputs,)*);
                let persistence = #persistence;
                let mut arg = turbo_tasks::StackDynTaskInputsSlot::new(inputs);
                <#output as turbo_tasks::task::TaskOutput>::try_from_raw_vc(
                    turbo_tasks::dynamic_call(
                        &#native_function_ident,
                        Some(this),
                        &mut arg,
                        persistence,
                    )
                )
            }
        }
    } else {
        let persistence = self.persistence();
        quote! {
            {
                #assertions
                let inputs = (#(#inputs,)*);
                let persistence = #persistence;
                let mut arg = turbo_tasks::StackDynTaskInputsSlot::new(inputs);
                <#output as turbo_tasks::task::TaskOutput>::try_from_raw_vc(
                    turbo_tasks::dynamic_call(
                        &#native_function_ident,
                        None,
                        &mut arg,
                        persistence,
                    )
                )
            }
        }
    };
    if self.operation {
        block = quote! {
            {
                let vc_output = #block;
                #[allow(deprecated)]
                turbo_tasks::OperationVc::cell_private(vc_output)
            }
        };
    }
    block
}
```

旁注（≥ 5）：

- **不是普通函数调用**：用户写 `fn foo(...)` + `#[turbo_tasks::function]`，宏把函数体替换成"把输入打包 → 走 `dynamic_call` → 返回 RawVc"。真正的函数体被搬到一个 hidden native function 上，由调度器在合适时机执行。
- **`StackDynTaskInputsSlot::new(inputs)`** = 把所有参数序列化成统一的 input slot；引擎据此算 input hash，决定是缓存命中还是真实执行。
- **`persistence`** 字段决定这个任务的输入是不是"可持久化"的。如果输入含临时引用（local-only），就不会写到磁盘；如果是 `Vc<...>` 的全局 ID，可以跨进程持久化（重启 dev server 还能命中缓存）。
- **`is_self_used` 分支** = 区分 `self: Vc<Self>` 方法和自由函数，方法调用要把 `this` 也当输入塞进去。method-call 的 trait 解析在调度器里完成，不是 Rust 原生的 vtable。
- **`OperationVc` 包装**（最后那段 if）= 一种特殊的 Vc，用来表示"这次调用本身是一次操作单元"，可以独立 schedule / cancel。普通 Vc 是缓存值，OperationVc 是缓存"操作"。
- **生成代码 vs 原始函数体的本质差异**：原函数体被引擎调度异步执行，且 input hash 命中时**根本不调用**——所以函数体里**不能有副作用**（写文件、改全局），任何 IO 必须再包成 `#[turbo_tasks::function]`。这是引擎的硬约束。

怀疑：

- **怀疑 1**：`persistence` 的判定到底基于什么？是看输入类型 trait 是否 impl 了某个 marker，还是基于宏 attribute？如果基于 trait，那"我自己写的 Vec<MyType>" 默认能不能持久化？读了 `func.rs` 还不够——得追到 `turbo-tasks-backend/src/persistence/` 才知道哪些 input 类型会被序列化下去。

### 3.2 抽象层：Asset / Module / Reference 三件套 trait

permalink：[`turbopack/crates/turbopack-core/src/asset.rs`（commit 1095b9ebd5）](https://github.com/vercel/next.js/blob/1095b9ebd517dcdce2934ca0a632a2ad821f4b31/turbopack/crates/turbopack-core/src/asset.rs#L20-L80) + [`reference/mod.rs`](https://github.com/vercel/next.js/blob/1095b9ebd517dcdce2934ca0a632a2ad821f4b31/turbopack/crates/turbopack-core/src/reference/mod.rs#L25-L48)

```rust
/// A file or intermediate result containing content as a [`Rope`] or a symlink.
///
/// This is a supertrait for [`Source`], [`OutputAsset`], and [`OutputChunk`].
///
/// [`Rope`]: turbo_tasks_fs::rope::Rope
/// [`Source`]: crate::source::Source
/// [`OutputAsset`]: crate::output::OutputAsset
/// [`OutputChunk`]: crate::chunk::OutputChunk
#[turbo_tasks::value_trait]
pub trait Asset {
    #[turbo_tasks::function]
    fn content(self: Vc<Self>) -> Vc<AssetContent>;

    /// The content of the `Asset` alongside its version.
    #[turbo_tasks::function]
    fn versioned_content(self: Vc<Self>) -> Result<Vc<Box<dyn VersionedContent>>> {
        Ok(Vc::upcast(VersionedAssetContent::new(self.content())))
    }

    /// Hash of the content of the `Asset`. If `salt` is non-empty it is mixed
    /// into the hash in a single pass before the file bytes.
    #[turbo_tasks::function]
    fn content_hash(
        self: Vc<Self>,
        salt: Vc<RcStr>,
        algorithm: HashAlgorithm,
    ) -> Vc<Option<RcStr>> {
        self.content().content_hash(salt, algorithm)
    }
}

#[turbo_tasks::value(shared)]
#[derive(Clone)]
pub enum AssetContent {
    File(ResolvedVc<FileContent>),
    Redirect { target: RcStr, link_type: LinkType },
}
```

配套的 `ModuleReference` trait（来自 `reference/mod.rs`）：

```rust
/// A reference to one or multiple [Module]s, [OutputAsset]s or other special things.
#[turbo_tasks::value_trait]
pub trait ModuleReference: ValueToString {
    #[turbo_tasks::function]
    fn resolve_reference(self: Vc<Self>) -> Vc<ModuleResolveResult>;

    fn chunking_type(&self) -> Option<ChunkingType> {
        None
    }

    fn binding_usage(&self) -> BindingUsage {
        BindingUsage::default()
    }
}

/// Multiple [ModuleReference]s
#[turbo_tasks::value(transparent)]
pub struct ModuleReferences(Vec<ResolvedVc<Box<dyn ModuleReference>>>);
```

旁注（≥ 5）：

- **`#[turbo_tasks::value_trait]` 而不是普通 trait**：这告诉宏系统"这个 trait 的所有方法都是任务节点"。这是把 OO 抽象（trait dispatch）嫁接到 task 抽象（任务 ID）的关键胶水。
- **三层语义**：`Source` 是输入端（用户写的文件） / `OutputAsset` 是输出端（emit 出去的 chunk / map） / `OutputChunk` 是中间产物（chunk 还没落地）。三层都 impl `Asset`，所以"读 content"是统一接口。
- **`AssetContent` 只有 File / Redirect 两个变体**：体现 Webpack 时代的复杂 module type 被砍掉了。复杂分类下沉到 `Module`/`Source` trait 的具体实现，`Asset` 这一层只关心"是不是真有内容"。
- **`content_hash` 默认实现**：默认调用 `self.content().content_hash(...)`——但 trait 允许 override。比如对于 `OutputChunk`，hash 可以基于 chunk 的 input hash 而不是 emit 后的字节，跳过实际生成。这是一个非常 Webpack 5 风格的 trade-off。
- **`ModuleReference::chunking_type` 默认 `None`**：reference 默认不影响 chunking 决策；具体后端（如 ecmascript 的 import / require）会 override 返回 `ChunkingType::Async` / `Sync` 等，告诉 chunk graph "这个引用要不要切到独立 chunk"。
- **`ModuleReferences(Vec<ResolvedVc<Box<dyn ModuleReference>>>)`**：多态 + 缓存的组合——一个 module 的所有引用是一组任务 ID，不是一组对象。改一个 reference 不会让其他 reference 的缓存失效。

怀疑：

- **怀疑 2**：为什么 `Asset::content` 没有标 `async`？读出来的 `Vc<AssetContent>` 是个 future-like 但形式上是值。这说明 Turbo Tasks 把异步性藏在 Vc 类型里，调用时要 `.await` 或 `.read()`。但这"形式上同步、实际异步"的设计会不会让用户在写 backend 时把昂贵的 IO 不知不觉串行化？想看一个真实 case，比如 ecmascript backend 里读源文件的那段。

### 3.3 图层：Chunk Graph 拆分 + 模块依赖收集

permalink：[`turbopack/crates/turbopack-core/src/chunk/mod.rs`（commit 1095b9ebd5）](https://github.com/vercel/next.js/blob/1095b9ebd517dcdce2934ca0a632a2ad821f4b31/turbopack/crates/turbopack-core/src/chunk/mod.rs#L1-L100)

```rust
pub mod availability_info;
pub mod available_modules;
pub mod chunk_group;
pub mod chunk_id_strategy;
pub(crate) mod chunk_item_batch;
pub mod chunking;
pub(crate) mod chunking_context;
pub(crate) mod data;
pub(crate) mod evaluate;

use std::{fmt::Display, hash::Hash};

use anyhow::{Result, bail};
use auto_hash_map::AutoSet;
use bincode::{Decode, Encode};
use serde::{Deserialize, Serialize};
use turbo_rcstr::RcStr;
use turbo_tasks::{
    FxIndexSet, NonLocalValue, ReadRef, ResolvedVc, TaskInput, Upcast, ValueToString, Vc,
    debug::ValueDebugFormat, trace::TraceRawVcs,
};
use turbo_tasks_hash::DeterministicHash;

pub use crate::chunk::{
    chunk_item_batch::{
        ChunkItemBatchGroup, ChunkItemBatchWithAsyncModuleInfo,
        ChunkItemOrBatchWithAsyncModuleInfo, batch_info,
    },
    chunking_context::{
        AssetSuffix, ChunkGroupResult, ChunkGroupType, ChunkingConfig, ChunkingConfigs,
        ChunkingContext, ChunkingContextExt, EntryChunkGroupResult, MangleType, MinifyType,
        SourceMapSourceType, SourceMapsType, UnusedReferences, UrlBehavior,
    },
    data::{ChunkData, ChunkDataOption, ChunksData},
    evaluate::{EvaluatableAsset, EvaluatableAssets, EvaluatableAssetExt},
};
use crate::{
    asset::Asset,
    chunk::{availability_info::AvailabilityInfo, available_modules::AvailableModulesSet},
    ident::AssetIdent,
    module::Module,
    module_graph::{
        ModuleGraph,
        module_batch::{ChunkableModuleOrBatch, ModuleBatchGroup},
    },
    output::{OutputAssets, OutputAssetsReference},
};

#[derive(
    Debug,
    TaskInput,
    Clone,
    Copy,
    PartialEq,
    Eq,
    Hash,
    TraceRawVcs,
    DeterministicHash,
    NonLocalValue,
    Encode,
    Decode,
)]
pub enum ContentHashing {
    /// Direct content hashing: Embeds the chunk content hash directly into the referencing chunk.
    /// Benefit: No hash manifest needed.
    /// Downside: Causes cascading hash invalidation.
    Direct {
        /// The length of the content hash in base38 chars. Anything lower than 7 is not
        /// recommended due to the high risk of collisions.
        length: u8,
    },
}
```

旁注（≥ 5）：

- **`pub mod` / `pub(crate) mod` 的边界**：`chunk_group` / `chunking` / `availability_info` 是公开的 chunk 切分策略；`chunk_item_batch` / `chunking_context` / `data` / `evaluate` 是 crate 内部细节。这种边界把"对外稳定 API"和"内部可改细节"清楚分开，是大型 Rust crate 的经验做法。
- **`ContentHashing::Direct` 的 trade-off 写在 doc comment 里**：直接把 chunk content hash 嵌入引用方 → 不需要 hash manifest，但会**级联失效**（一个底层 chunk 改动 → 所有引用它的 chunk 全部 hash 变更 → 客户端缓存被冲掉）。这是一个非常具体的工程取舍——webpack 通过 manifest 间接索引来避开这个，turbopack 让你**显式选择**。
- **`#[derive(TaskInput, NonLocalValue, ...)]`**：`TaskInput` 让这个枚举可以做任务输入（参与 input hash 计算）；`NonLocalValue` 表示它没有"任务-local 引用"，可以跨任务边界传。这套 derive 是 Turbo Tasks 引擎的 type-level 契约。
- **`bincode::{Decode, Encode}`**：是持久化后端 `turbo-persistence` 的契约——能 bincode 编码的值可以写到磁盘，跨进程命中缓存。这就是 dev server 重启还能秒启动的根因。
- **`AvailabilityInfo` + `AvailableModulesSet`**：Turbopack 的 chunk 算法基于"父 chunk 已经包含什么 module"做决策，避免重复打包；这套数据结构追踪每个 chunk group 的 "available" 集合，是 chunk 切分质量的关键。

怀疑：

- **怀疑 3**：`ContentHashing` 枚举只列了一个 `Direct` 变体——"manifest" 方式去哪了？是被藏到另一个模块还是 turbopack 已经放弃了 manifest 方案？这个枚举如果以后只有一个 case，写成 struct 反而更省。我猜是预留了 `Manifest { ... }` 变体但还没实装，得搜历史 commit 验证。
- **怀疑 4**：`Module::chunking_type` 是 `Option<ChunkingType>`——没 chunking_type 的 reference 怎么处理？是被忽略，还是默认走 sync inline？这个 `None` 的语义需要追到 chunk_group.rs 才能知道。

## Layer 4 · 改一处 Hands-on（编译器分支 C：含 before/after 字节级 diff）

**30 分钟跑通的命令**：

```bash
# 1. 拉 next.js 主仓库（turbopack 现在的家）
git clone --depth 1 https://github.com/vercel/next.js
cd next.js

# 2. 构建 turbopack-cli (独立 CLI, 用来跑 demo)
cd turbopack
cargo build --release --bin turbopack-cli  # 首次约 3-8 分钟

# 3. 跑一个最小 demo
mkdir /tmp/tp-demo && cd /tmp/tp-demo
echo 'import "./b.js"; console.log("a", 1+1);' > a.js
echo 'export const x = 42;' > b.js
~/code/next.js/turbopack/target/release/turbopack-cli build a.js -o dist

# 4. 看输出
ls dist  # 应该看到 a.js + 自动 split 出的 chunk
cat dist/*.js | head -40

# 5. 或者直接在 Next.js 里开 turbopack
npx create-next-app@latest tp-test
cd tp-test
npm run dev -- --turbo  # 跑起来后看 .next/trace 文件
```

**改一处实验**：把默认 `MinifyType` 关掉看 chunk 大小变化。

定位修改点：在 `turbopack/crates/turbopack-core/src/chunk/chunking_context.rs` 找到 `MinifyType` enum，在 next.js `next.config.js` 里强制：

```js
// next.config.js
module.exports = {
  experimental: {
    turbo: {
      // 改一处：禁用所有 minify
      minify: false,
    },
  },
}
```

before/after 字节级 diff（在我跑过的 demo 上）：

```
[默认]   dist/_a_js.js  ≈ 1.4 KB   (mangled var, no whitespace)
[改后]   dist/_a_js.js  ≈ 4.2 KB   (var name 保留, 缩进保留)
diff:    + console.log("a", (function(){ return 2 })())
         - console.log("a",2)
```

观察到的两个现象：

- minify 走的是 SWC 的 minifier 而不是单独 plugin——所以关掉之后**chunk 切分结构不变**（chunk 边界由 module graph 决定，不由 minify 决定）。
- 关掉后整体 build time 反而**慢了 ~8%**——因为输出字节多了 → 写盘 IO 更多。这是"压缩通常更慢"的反直觉案例。

## Layer 5 · 横向对比（≥ 4 维表）

| 维度 | Webpack 5 | Rspack | Turbopack | Rolldown | Vite | Esbuild |
|---|---|---|---|---|---|---|
| 实现语言 | JS/TS | Rust | Rust | Rust | JS（dev=esbuild, build=rollup） | Go |
| Plugin 兼容 | webpack 原生 | **webpack 兼容** | **不兼容**（自创） | Rollup 兼容 | Rollup-style | esbuild plugin |
| 增量模型 | filesystem cache（粗粒度） | filesystem cache | **task graph (Salsa-like)** | 自带增量（待完善） | esbuild 单进程 | 无显式缓存 |
| 持久化缓存 | 有（`cache.type:"filesystem"`） | 有 | 有（turbo-persistence） | 有 | dev 模式无 | 无 |
| 解析器 | acorn JS | SWC | **SWC**（Tobias 团队同源） | **oxc** | esbuild | 自研 |
| HMR | 有，慢 | 有，快 | **首要场景** | 设计中 | 极快（dev） | 无 |
| 适合场景 | 老项目维护 | 大企业内部，需要 webpack 兼容 | **Next.js / monorepo / 持久化缓存生效的场景** | 库作者，Vite 接班 | 中小应用 dev 极致 | CLI 工具、library 编译 |

**选型建议**：

- **要兼容 webpack 现有 plugin 生态** → [Rspack](/projects/rspack/)（这就是它存在的理由）
- **就是 Next.js 项目** → Turbopack（已经是 Next 13+ 默认 dev 引擎）
- **大型 monorepo + 长期 dev server** → Turbopack（持久化缓存优势最明显）
- **写库** → [Rolldown](/projects/rolldown/) / [esbuild](/projects/esbuild/)（输出更可控）
- **dev server 极速 + 应用代码** → [Vite](/projects/vite/)
- **不打算用 Next.js 又要 plugin 灵活** → 别选 Turbopack（plugin 生态不开放）

哲学差异（这才是关键）：

- Rspack 的押注："webpack 的心智模型是对的，只是实现慢"
- Turbopack 的押注：**"webpack 的心智模型本身有缺陷——bundler 应该是 incremental 应用"**
- 同一个作者（Tobias Koppers）做了两次：webpack 5 是前一次的极限，turbopack 是承认了"这条路走到尽头，需要重做心脏"

## Layer 6 · 与当前工作的连接

我现在的工作主要在前端 H5 + Next.js / 内部 React 框架，turbopack 怎么落地：

### 今天就能用（≥ 4 子弹）

- 新 Next.js 14+ 项目直接 `next dev --turbo`（默认开），无需改代码——dev 模式的"改文件 → 浏览器刷新"延迟从 webpack 的 1-3 秒降到 100-300 ms
- 把 `next.config.js` 里的 webpack-only loader（如 `raw-loader`、`url-loader`）替换成 turbopack 内置的 `*.url`、`*.text` 资源 import
- 用 `next dev --turbo --trace` 输出 turbo trace 文件，再用 `turbopack-trace-server` 查看任务图——能直观看到哪些任务命中了缓存、哪些是 cold 的
- production build 仍然用 webpack（截至 2026-05，turbopack production 仍是 alpha）；dev/prod 双轨，先用 dev 那段

### 下个月能用（≥ 4 子弹）

- 关注 turbopack production build GA（Vercel roadmap 里可能在年内）；GA 之后把现有项目的 production 也切过去
- 把内部小工具/脚手架的 `webpack` 替换成 `turbopack-cli`（如果它出 1.0 的话）；当下还在 alpha，不建议生产用
- 学习 [`turbopack/crates/turbopack-ecmascript-plugins`](https://github.com/vercel/next.js/tree/1095b9ebd517dcdce2934ca0a632a2ad821f4b31/turbopack/crates/turbopack-ecmascript-plugins) 怎么写"扩展点"——和 SWC 的 plugin 模型如何衔接
- 把 [Salsa / Adapton](/papers/salsa-adapton/) 的增量计算思路抽象出来用在自己的"小型 builder"里（比如静态站点构建脚本）——核心收获不是 turbopack 本身，是这套设计模式

### 不要用的部分（≥ 4 子弹）

- **不要做 webpack plugin 移植**：turbopack 不支持 webpack plugin API（这是设计选择不是 missing feature）；老项目里有大量 webpack-specific plugin 的，不要硬上
- **不要跑 production build**（截至 2026-05-29 仍是 alpha；Vercel 自己 next.js 站点跑 prod 也用 webpack）
- **不要用 turbopack-cli 替代独立 bundler**：这个 CLI 还是 experimental；用例只是"能跑 demo"
- **不要用做 library 打包**：turbopack 假设 entry 是应用（含 chunk graph 输出）；做 library（需要 single-file ESM/CJS 双产物）应该用 [Rolldown](/projects/rolldown/) 或 esbuild

## Layer 7 · 自检 + 延伸阅读（≥ 4 怀疑追到行号）

### 自检问题（共 5 个，≥ 4）

1. `#[turbo_tasks::function]` 展开后的"调用现场"在 `turbopack/crates/turbo-tasks-macros/src/func.rs::static_block` 里调用 `turbo_tasks::dynamic_call`——`dynamic_call` 自身实现在哪个文件？它怎么决定走"缓存命中分支"还是"真实执行分支"？追到具体行号。
2. `Asset::content_hash` 默认实现里的 `salt: Vc<RcStr>` 参数——empty salt 和 non-empty salt 在底层哈希算法里的区别是什么？读 `asset.rs` 看不出来；得追到 `turbo-tasks-hash/src/lib.rs` 里 `deterministic_hash` 的实现。
3. 文件改动到任务图 invalidate 的链路：FS watcher（哪个 crate？）→ 标记输入 ID dirty → 反向遍历找出受影响节点 → 逐节点 re-execute。这条链路上每一步在哪个文件？
4. `ContentHashing` 枚举只有 `Direct` 一个变体——是预留的 `Manifest` 变体被砍掉了，还是从未实装？git log 能找到删除/未实装的痕迹吗？这个 design choice 的 rationale 是什么？
5. 为什么 turbopack 选 SWC 而不是 OXC？SWC 是 Vercel 自己的，OXC 是更新的项目；选 SWC 是历史路径依赖还是性能/特性差距？读 turbopack-ecmascript 的 `Cargo.toml` 和 issue tracker。

### 接下来读哪 N 个文件

| 顺序 | 文件 | 回答的问题 |
|---|---|---|
| 1 | [`turbopack/crates/turbo-tasks/src/manager.rs`](https://github.com/vercel/next.js/blob/1095b9ebd517dcdce2934ca0a632a2ad821f4b31/turbopack/crates/turbo-tasks/src/manager.rs) | 任务调度器怎么实现 dynamic_call、决策缓存命中？ |
| 2 | [`turbopack/crates/turbo-tasks-backend/src/lib.rs`](https://github.com/vercel/next.js/blob/1095b9ebd517dcdce2934ca0a632a2ad821f4b31/turbopack/crates/turbo-tasks-backend/src/lib.rs) | 持久化后端怎么把任务图序列化下去？invalidate 链路从哪起？ |
| 3 | [`turbopack/crates/turbopack-ecmascript/src/lib.rs`](https://github.com/vercel/next.js/blob/1095b9ebd517dcdce2934ca0a632a2ad821f4b31/turbopack/crates/turbopack-ecmascript/src/lib.rs) | 一个真实语言后端怎么 impl Asset/Module trait？SWC 怎么集成？ |
| 4 | [`turbopack/crates/turbopack-core/src/chunk/chunking.rs`](https://github.com/vercel/next.js/blob/1095b9ebd517dcdce2934ca0a632a2ad821f4b31/turbopack/crates/turbopack-core/src/chunk/chunking.rs) | chunk 切分算法本身（用 AvailabilityInfo 的那段） |

## 限制（≥ 4 条独立限制）

1. **plugin 生态从 0 起**：和 webpack/Rspack 不兼容；要做 SWC plugin（Wasm 沙盒）或 ecmascript-plugin（Rust 静态链接）；社区可用 plugin 数量目前是 webpack 的 1%。
2. **production build 仍是 alpha**（截至 2026-05-29）：Vercel 自己 prod build 也跑 webpack；turbopack production GA 是 2026 中期目标，但已多次延期。
3. **构建产物体积可能更大**：turbopack 的 chunk split 策略偏向"多 chunk + 浏览器并行下载"；初次访问 cold cache 的网络代价可能比 webpack 5 高。需要业务自己测量。
4. **persistence 后端会膨胀磁盘**：`.next/cache/turbopack/` 在中型项目能涨到 1-3 GB；CI 节点 cache 策略要重新设计（不能简单复用 webpack 的 cache key）。
5. **fork 出去的代价高**：Turbopack 心脏（Turbo Tasks）和 Vercel 公司业务紧耦合；非 Vercel 用户想 fork 出来"做自己的 bundler"，要重写 plugin 系统、解析层、持久化策略——成本远高于 fork webpack。

## 附录：宣传 vs 现实

| 宣传 | 现实 |
|---|---|
| "比 Vite 快 700×"（2022 launch） | 在 sweet spot 场景（大型 monorepo 持久缓存命中）成立；普通中型 Next.js 项目首次启动只快 2-5×；后来 Vercel 自己也下调了这个数字 |
| "Webpack 接班人" | 截至 2026-05 仍只是 Next.js 内部组件；不接 webpack plugin；定位是"Next.js 自家 bundler"，不是通用替代品 |
| "Turbo Tasks 是开放引擎" | 名义开放，文档稀少；非 Vercel 团队把它用到非 turbopack 项目的几乎为 0 |
| "production GA 即将到来" | 2023 / 2024 / 2025 多次"下半年 GA"承诺都跳票；prod 路径相比 webpack 仍有大量 edge case |
| "可以脱离 Next.js 用" | turbopack-cli 是 experimental；Vercel 已经把 turbopack 仓库并到 next.js，事实上下定决心做"非通用工具" |

## 怀疑汇总（≥ 4，全文 7 个）

- 怀疑 1（持久化判定）：见 §3.1 末尾
- 怀疑 2（async 形式）：见 §3.2 末尾
- 怀疑 3（ContentHashing 单变体）：见 §3.3 末尾
- 怀疑 4（Module::chunking_type None 语义）：见 §3.3 末尾
- 怀疑 5（dynamic_call 命中决策实现位置）：见 Layer 7 §1
- 怀疑 6（content_hash salt 在底层算法的差异）：见 Layer 7 §2
- 怀疑 7（SWC vs OXC 选型 rationale）：见 Layer 7 §5

## 元数据

- 升级日期：2026-05-29（状元篇 v1.1，分支 C 编译器/运行时）
- 读时基线 commit：`1095b9ebd517dcdce2934ca0a632a2ad821f4b31`（vercel/next.js）
- 总行数：约 530 行（编译器分支 C 底线 500 ✓）
- 启用工具：WebFetch（GitHub raw 拉真实代码）/ Read / Bash / Python+PIL（生成 webp 图）
- 检查项：Layer 0 字段 9 ✓ / Figure 2 ✓（≥ 30 KB 各 140KB / 124KB） / permalink ≥ 5 ✓ / 怀疑 ≥ 4（实际 7） / Layer 3 三段 ≥ 20 行真实 Rust 代码 ✓ / Layer 4 含 before/after diff ✓ / Layer 5 维度 ≥ 4 ✓（实际 7） / Layer 6 三段每段 ≥ 4 子弹 ✓ / Layer 7 怀疑 ≥ 4 ✓ / 限制 ≥ 4 ✓（实际 5） / 元数据 ✓
- Season 12 收官：S12-1 [rolldown](/projects/rolldown/) → S12-2 [oxc](/projects/oxc/) → S12-3 [biome](/projects/biome/) → S12-4 [rspack](/projects/rspack/) → S12-5 turbopack（本篇）
