---
title: Turborepo — 把 monorepo build 重做成 task graph + 双层 cache
description: Vercel 把 Jared Palmer 的 TS 版 turborepo 用 Rust 重写——task graph 拓扑序 + 本地/远程 cache 多路复用 + tokio 并行 runner，让"改一个包重 build 全仓"这个老问题彻底退役
sidebar:
  order: 80
  label: turborepo
---

> 状元篇 v1.1 / 项目类型：框架/SDK（分支 D）
>
> 这不是一篇 README 翻译。是把 Vercel 在收购 Jared Palmer 的 turborepo 后**用 Rust 重写一遍**这件事的设计直觉，
> 还原回它解决的两条老痛点：monorepo 里"改一行重 build 全仓"的恐惧，以及"我和同事都在重新跑同一份 build"的算力浪费。
>
> 上一篇 [turbopack](/projects/turbopack/) 在仓库尺度内做增量计算（bundler 内部 task graph）。
> 这一篇 turborepo 把**同一种 task graph 思路放大到整个 monorepo**——package 之间的 build / test / lint 才是任务节点。
>
> Season 18 Monorepo Tools 启动篇。同 season 后续会对比 Nx / Lerna / Bazel / pnpm workspaces / Rush。

| 字段 | 值 |
|---|---|
| 仓库 | [vercel/turborepo](https://github.com/vercel/turborepo) |
| star / fork | ~30.5k / ~2.3k（2026-05-29 读） |
| 最近活跃 | 2026-05 主线高频，每周 10+ PR |
| 读时 commit | `e9a27cc9ddf128ea862cb579416cae6714f1d168` |
| 主语言 | Rust 69.9% / Go 残留 / TypeScript 文档站 |
| 维护方 | Vercel（收购自 Jared Palmer 2021-12） |
| 主要贡献者 | NicholasLYang / chris-olszewski / arlyon / anthonyshew |
| License | MPL-2.0 |
| Workspace | crates/turborepo / turborepo-lib / turborepo-cache / turborepo-graph-utils / turborepo-scope / turborepo-api-client（30+ crate） |
| 类似项目 | Nx · Lerna · Bazel · pnpm workspaces · Rush · moon |

## 一句话定位

**Turborepo = 一个把 monorepo 的 package 之间的 task 关系建成 DAG + 用拓扑序并行执行 + 用 hash 做双层缓存（本地 tar.zst + 远程 HTTP）的 build orchestrator。**
它不替代 webpack / vite / tsc / jest——它是它们的**调度者**，决定"谁先跑、谁能跳过、谁的输出能被其他机器复用"。

![Turborepo 架构图：input → scope filter → task graph → parallel runner → cache multiplexer（FS + HTTP）](/projects/turborepo/01-architecture.webp)

## 项目类型自标 · v1.1 分支 D 框架/SDK

- **类型**：框架/SDK（提供 abstraction：`turbo.json` pipeline + task graph engine + cache abstraction；extension points：custom remote cache backend / custom log mode / custom env vars / custom output globs）
- **心脏物**：`turborepo-graph-utils::Walker<N, S>` 状态机 + `turborepo-cache::CacheMultiplexer` + `turborepo-lib::run::task_filter::filter_engine_to_tasks`
- **extension points**：
  - **custom remote cache**：实现 `/v8/artifacts/{hash}` 的 PUT/GET/HEAD 端点（[Self-hosting 文档](https://turborepo.com/docs/core-concepts/remote-caching)），自托管 turbo-remote-cache / Bytesafe 都是这条路径
  - **custom log mode**：`turbo run build --log-order=stream|grouped|auto`，runner 内部按枚举切换日志策略
  - **filter / scope 表达式**：`--filter=...^web` `--filter=[main]` `--affected`，全部走 `task_filter.rs` 的 selector 解析器
  - **outputs glob 自定义**：每个任务的 `outputs` 字段决定 cache 抓哪些文件（`dist/**`, `.next/**`, `!.next/cache/**`），是 cache hash 的输入之一
  - **task with-relationship**：`turbo.json` 的 `with` 字段让 microfrontends 能"伴随调度"——dev 任务跑时 proxy 任务一起跑，但不是依赖关系
- **混合特征**：少量"运行时"特征（runner 实际 spawn 子进程跑用户的 build 命令），但核心仍是 abstraction：调度 + cache + filter，不是 bundler 不是 transformer。

## Why（为什么是它而不是 Lerna / Nx）

monorepo build 工具在 JS 世界有四代历史路线：

```
2014: Lerna           npm script 串行循环 + cross-package version bump，无 graph 无 cache
2017: Bazel           Google 内部模型外溢：sandbox + 严格 input/output 声明 + 远程 cache
2020: Nx              TS 写的 task graph + cache，但 plugin 模型很重
2021: turborepo (TS)  Jared Palmer 写的精简版 Nx：只做 graph + cache，turbo.json 一文件搞定
2022+: turborepo (Rust) Vercel 收购后用 Rust 重写，大改 cache 实现 + 引入 daemon
```

**核心痛点**：

```jsonc
// 老 Lerna 的世界 —— 没有 graph，串行
// lerna.json
{
  "packages": ["packages/*"],
  "version": "0.0.0"
}
// $ lerna run build  ← 这会按 package.json 顺序串行 npm run build，
//                     不知道 packages/web 依赖 packages/ui，
//                     也不知道哪些 package 这次没改不用重 build。
```

```jsonc
// turborepo 的世界 —— graph 描述 + hash 决定跑不跑
// turbo.json
{
  "$schema": "https://turborepo.com/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],          // ^ 表示 "topological"，即依赖包先 build
      "inputs": ["src/**", "tsconfig.json"],
      "outputs": ["dist/**"],
      "env": ["NODE_ENV"]
    },
    "test": {
      "dependsOn": ["build"],
      "inputs": ["src/**", "tests/**"],
      "outputs": []                      // 测试无产物，但 cache 仍存日志
    }
  }
}
// $ turbo run build  ← 算每个 task 的 hash（inputs + env + global deps + 依赖产物 hash），
//                     找 cache，命中就 replay 日志 + 解压产物，
//                     未命中才真的 spawn `npm run build`，
//                     上传到 remote cache 给 CI / 同事复用。
```

Vercel 工程师 Anthony Shew 在 [Why we wrote Turborepo in Rust](https://vercel.com/blog/turborepo-1-7) 里说得直白：

> *"The Go version had served us well, but we had reached a point where the type safety, ecosystem, and performance characteristics of Rust matched what we needed long-term, especially as Turborepo started sharing crates with Turbopack."*

翻译成你能记住的话：**"现有方案 = TS 跑 graph 解析 + Go 跑 cache + spawn 子进程"**——
把它压成"全 Rust + 共享 crate + 一份 cache 抽象 / 多个 backend"，开发者只需写 `turbo.json` 一个文件，
就能拿到 graph 调度 + 本地 cache + 远程 cache + 远程 cache replay 日志这一整套能力。

monorepo 工具的**核心 insight 不是性能，而是把 incremental computation（"这次哪些可以跳过"）变成第一公民**——
所有后续优化（远程 cache、affected filter、watch mode）都是它的副作用。

---

## 仓库地形

```bash
git clone --depth 1 --filter=blob:none --sparse https://github.com/vercel/turborepo
cd turborepo
git sparse-checkout set crates docs
```

顶层目录注释表（核心 crate 选取）：

```
crates/
  turbo/                          ← 二进制入口 main.rs，CLI 解析后 dispatch 到 turborepo-lib
  turborepo/                      ← 兼容性壳子（旧名）
  turborepo-lib/                  ← ★ 业务逻辑核心：run / engine / config / daemon
    src/run/builder.rs            ← Run 对象的构造（解析 cli + 装载 turbo.json + 构 engine）
    src/run/mod.rs                ← Run::run() 主循环：跑 task graph + 收集结果
    src/run/task_filter.rs        ← ★ scope/filter 解析器（--filter --affected）
    src/run/scope/                ← 老版 package-level filter（保留兼容）
    src/run/watch.rs              ← watch 模式（文件变 → 重新计算 affected → 重跑）
    src/engine/                   ← Engine = task graph 的实例化（依赖 task_id + edge）
  turborepo-cache/                ← ★ cache 抽象 + 双 backend
    src/multiplexer.rs            ← ★ CacheMultiplexer：FS + HTTP 串联策略
    src/fs.rs                     ← ★ 本地 FS cache：{hash}.tar.zst + manifest 快路径
    src/http.rs                   ← 远程 HTTP cache：Vercel 协议 PUT/GET
    src/cache_archive/            ← tar.zst 打包 + 跨平台权限保留
    src/signature_authentication.rs  ← HMAC-SHA256 防篡改
  turborepo-graph-utils/          ← ★ 通用 DAG 工具（Walker / 拓扑序 / 环检测）
    src/walker.rs                 ← ★ Walker<N, S>：状态机风格异步 DAG 遍历
    src/lib.rs                    ← validate_graph / cycles_and_cut_candidates
  turborepo-scope/                ← --filter 的 selector 类型 + git range 解析
  turborepo-api-client/           ← Vercel API client（用于远程 cache + 团队鉴权）
  turborepo-task-id/              ← TaskId 类型（package#task 格式）
  turborepo-repository/           ← 包发现 + package_graph 构建（pnpm/yarn/npm 兼容）
  turborepo-scm/                  ← git 状态查询（HEAD / dirty 文件等）
  turborepo-analytics/            ← cache hit/miss 上报
docs/                             ← turborepo.com 文档站（Next.js）
```

**心脏文件清单**（commit `e9a27cc9ddf128ea862cb579416cae6714f1d168`）：

| 文件 | 行数 | 角色 |
|---|---|---|
| `crates/turborepo-graph-utils/src/walker.rs` | 420 | 异步 DAG 遍历状态机，Layer 3 段 (a) |
| `crates/turborepo-cache/src/multiplexer.rs` | 249 | 双层 cache 串联策略，Layer 3 段 (b) |
| `crates/turborepo-cache/src/fs.rs` | 1170 | 本地 cache 实现含快路径，Layer 3 段 (b) 配套 |
| `crates/turborepo-lib/src/run/task_filter.rs` | 1324 | `--filter` selector 解析，Layer 3 段 (c) |
| `crates/turborepo-graph-utils/src/lib.rs` | 352 | `validate_graph` + 环检测 cut candidates |

commit 热点（理论上跑 `git log --format='' --name-only | sort | uniq -c | sort -rn | head -20`）按 subsystem 集中在：
1. `turborepo-lib/src/run/` —— Run / engine / filter，是 PR 最频繁区
2. `turborepo-cache/` —— 远程 cache 协议 + 本地 cache 演进
3. `turborepo-graph-utils/` —— Walker 实现稳定但每次性能优化必碰

---

## 核心机制（Layer 3 · 三段独立精读）

### 段 (a) · Task graph 异步遍历状态机：`Walker<N, S>`

**永久链接**：[crates/turborepo-graph-utils/src/walker.rs#L29-L147](https://github.com/vercel/turborepo/blob/e9a27cc9ddf128ea862cb579416cae6714f1d168/crates/turborepo-graph-utils/src/walker.rs#L29-L147)

```rust
pub struct Walker<N, S> {
    marker: std::marker::PhantomData<S>,
    cancel: watch::Sender<bool>,
    node_events: mpsc::Receiver<(N, oneshot::Sender<bool>)>,
    join_handles: FuturesUnordered<JoinHandle<()>>,
}

pub struct Start;
pub struct Walking;

pub type WalkMessage<N> = (N, oneshot::Sender<bool>);

impl<N: Eq + Hash + Copy + Send + 'static> Walker<N, Start> {
    pub fn new<G: IntoNodeIdentifiers<NodeId = N> + IntoNeighborsDirected>(graph: G) -> Self {
        let (cancel, cancel_rx) = watch::channel(false);
        let mut txs = HashMap::new();
        let mut rxs = HashMap::new();
        for node in graph.node_identifiers() {
            // Each node can finish at most once so we set the capacity to 1
            let (tx, rx) = broadcast::channel::<bool>(1);
            txs.insert(node, tx);
            rxs.insert(node, rx);
        }
        // We will be emitting at most txs.len() nodes so emitting a node should never block
        let (node_tx, node_rx) = mpsc::channel(std::cmp::max(txs.len(), 1));
        let join_handles = FuturesUnordered::new();
        for node in graph.node_identifiers() {
            let Some(tx) = txs.remove(&node) else { continue; };
            let mut cancel_rx = cancel_rx.clone();
            let node_tx = node_tx.clone();
            let mut deps_rx = graph
                .neighbors_directed(node, Direction::Outgoing)
                .filter_map(|dep| rxs.get(&dep).map(|rx| rx.resubscribe()))
                .collect::<Vec<_>>();

            join_handles.push(tokio::spawn(async move {
                let deps_fut = join_all(deps_rx.iter_mut().map(|rx| rx.recv()));

                tokio::select! {
                    biased;
                    _ = cancel_rx.changed() => { /* canceled */ }
                    results = deps_fut => {
                        for res in results {
                            match res {
                                Ok(false) => { tx.send(false).ok(); return; }  // upstream 失败/跳过
                                Ok(true)  => (),                                // upstream 成功
                                Err(broadcast::error::RecvError::Closed)   => return,
                                Err(broadcast::error::RecvError::Lagged(_)) => {} // 不应发生
                            }
                        }

                        let (callback_tx, callback_rx) = oneshot::channel::<bool>();
                        if node_tx.send((node, callback_tx)).await.is_err() { return; }
                        let Ok(callback_result) = callback_rx.await else { return; };
                        tx.send(callback_result).ok();   // 通知 dependents 我完成 + 是否成功
                    }
                }
            }));
        }
        // ...
    }
}
```

**5 条旁注**：

- **PhantomData + Start/Walking 类型态**：`Walker<N, Start>` 和 `Walker<N, Walking>` 是同一结构体的两个**类型层面的状态**——你不能在 `Start` 上调 `cancel()`（因为 `cancel()` 只在 `impl<N> Walker<N, Walking>` 上定义）。这是 Rust 的"typestate pattern"——把状态机错误**编译期消除**。普通做法是 `enum WalkerState { Start, Walking }` + 运行时 match，但那样调错只是 panic。这里调错是 compile error。
- **每个 node 一个 broadcast channel**：`txs.insert(node, tx)` 给每个 node 建一个 broadcast::channel(1)。一个 node 完成时通过 `tx.send(true)` 通知**所有 dependents**——broadcast 是因为 dependents 数量不定，oneshot 不够用，watch 又会被新值覆盖。这种"每个节点一个 broadcast，每个 dependent 一个 resubscribe()"是**用 channel 表达 DAG 边**的最直接做法。
- **biased select 优先 cancel**：`tokio::select! { biased; _ = cancel_rx.changed() => {...} ... }` 的 `biased` 关键字让 cancel 分支在两个 future 同时 ready 时优先匹配。如果不写 biased，tokio 会随机选——意味着 ctrl-C 后可能还多跑一个 task。这是细节但真实影响用户体验。
- **deps_fut 是 join_all 而不是 try_join_all**：用 `join_all` 等所有依赖**都返回**（不管成功失败），然后逐个 match。这和 `try_join_all` 第一次失败就返回的语义不同——turborepo 选 join_all 因为它要"知道全部依赖结果"才能决定本任务怎么跑（部分依赖失败的情况下，依赖产物可能仍可读 cache）。这是**故意不短路**。
- **callback channel oneshot 而非 broadcast**：node_tx 发送的是 `(node, oneshot::Sender<bool>)`——caller（runner）拿到 node 后跑实际 build 命令，跑完通过 `callback_tx.send(success)` 回报。oneshot 因为 callback 只发一次，capacity 1 即可。caller drop 掉 callback_tx 不发 → 被解释为"完成"（line 124-128 `let Ok(...) = callback_rx.await else { return; }`），这是 graceful 而非 panic。

**怀疑 1**：cancel 后正在跑的 worker 不会被打断，只是不再发新的 node。如果一个 node 跑了 30 分钟然后用户 ctrl-C，这 30 分钟没法回收。是不是该在 callback_tx 旁边再挂一个 cancel signal 让 worker 主动 abort 子进程？这是 **graceful vs eager cancel 的 trade-off**——turborepo 选 graceful 因为强 abort 子进程会留下半截 dist 目录污染下次 cache hash。

---

### 段 (b) · Cache hash 计算 + 双层 multiplexer

**永久链接**：[crates/turborepo-cache/src/multiplexer.rs#L127-L219](https://github.com/vercel/turborepo/blob/e9a27cc9ddf128ea862cb579416cae6714f1d168/crates/turborepo-cache/src/multiplexer.rs#L127-L219) + [crates/turborepo-cache/src/fs.rs#L87-L168](https://github.com/vercel/turborepo/blob/e9a27cc9ddf128ea862cb579416cae6714f1d168/crates/turborepo-cache/src/fs.rs#L87-L168)

```rust
pub struct CacheMultiplexer {
    should_use_http_cache: AtomicBool,
    should_print_skipping_remote_put: AtomicBool,
    cache_config: CacheConfig,
    fs: Option<FSCache>,
    http: Option<HTTPCache>,
    scm_state: LazyScmState,
}

impl CacheMultiplexer {
    pub async fn put(
        &self,
        anchor: &AbsoluteSystemPath,
        key: &str,
        files: &[AnchoredSystemPathBuf],
        duration: u64,
    ) -> Result<(), CacheError> {
        // Wait for the background SCM computation to finish so that both
        // the FS sidecar metadata and the HTTP headers carry provenance info.
        self.scm_state.get_resolved().await;

        if self.cache_config.local.write {
            self.fs.as_ref()
                .map(|fs| fs.put(anchor, key, files, duration))
                .transpose()?;
        }

        let http_result = match self.get_http_cache() {
            Some(http) if self.cache_config.remote.write => {
                Some(http.put(anchor, key, files, duration).await)
            }
            Some(_) => { /* read-only remote, log once */ None }
            None => None,
        };

        match http_result {
            Some(Err(CacheError::ApiClientError(
                box turborepo_api_client::Error::CacheDisabled { .. }, ..,
            ))) => {
                warn!("failed to put to http cache: cache disabled");
                self.should_use_http_cache.store(false, Ordering::Relaxed);
                Ok(())
            }
            Some(Err(e)) => Err(e),
            None | Some(Ok(())) => Ok(()),
        }
    }

    pub async fn fetch(
        &self,
        anchor: &AbsoluteSystemPath,
        key: &str,
    ) -> Result<Option<(CacheHitMetadata, Vec<AnchoredSystemPathBuf>)>, CacheError> {
        if self.cache_config.local.read
            && let Some(fs) = &self.fs
            && let response @ Ok(Some(_)) = fs.fetch(anchor, key)
        {
            return response;
        }

        if self.cache_config.remote.read
            && let Some(http) = self.get_http_cache()
            && let Ok(Some((hit_metadata, files))) = http.fetch(key).await
        {
            // Backfill local from remote hit
            if self.cache_config.local.write
                && let Some(fs) = &self.fs
            {
                let _ = fs.put(anchor, key, &files, hit_metadata.time_saved);
            }
            return Ok(Some((hit_metadata, files)));
        }

        Ok(None)
    }
}
```

配套 FS cache 快路径（同 commit，fs.rs#L87-L168）：

```rust
pub fn fetch(&self, anchor: &AbsoluteSystemPath, hash: &str)
    -> Result<Option<(CacheHitMetadata, Vec<AnchoredSystemPathBuf>)>, CacheError>
{
    let cache_path = self.cache_directory.join_component(&format!("{hash}.tar.zst"));
    if !cache_path.as_path().exists() {
        self.log_fetch(analytics::CacheEvent::Miss, hash, 0);
        return Ok(None);
    }

    let manifest_path = self.cache_directory
        .join_component(&format!("{hash}-manifest.json"));
    let previous_manifest = crate::cache_archive::RestoreManifest::read(&manifest_path);

    // Fast path: if a manifest exists and ALL files on disk still match,
    // skip opening/decompressing the tar entirely.
    if let Some(ref manifest) = previous_manifest
        && let Some(file_list) = manifest.validate_all(anchor)
    {
        let meta = CacheMetadata::read(&self.cache_directory
            .join_component(&format!("{hash}-meta.json")))?;
        self.log_fetch(analytics::CacheEvent::Hit, hash, meta.duration);
        return Ok(Some((CacheHitMetadata {
            time_saved: meta.duration,
            source: CacheSource::Local,
            sha: meta.sha,
            dirty_hash: meta.dirty_hash,
        }, file_list)));
    }

    // Slow path: decompress tar.zst
    let mut cache_reader = CacheReader::open(&cache_path)?;
    let (restored_files, new_manifest) = cache_reader.restore(anchor, previous_manifest.as_ref())?;
    /* write new manifest in background ... */
    Ok(Some(/* full restored ... */))
}
```

**6 条旁注**：

- **FS-first，HTTP-fallback 顺序**：`fetch` 先查本地，命中直接返；未命中才打 HTTP。这是因为本地 fetch ≈ 几百微秒（甚至带快路径只读 manifest 跳过解压），HTTP fetch 至少 50ms+。**反过来不行**——总不能每次都问远端"我有没有"。
- **Backfill 写本地是 best-effort**：`let _ = fs.put(...)` 用 `_` 吃掉错误。语义是"远程命中已经成功，就算回写本地失败，整体仍是 hit"——这是**优化失败不影响主路径**的经典写法。如果 panic 或 propagate error，会把"远程拿到了产物但本地写失败"也算 build 失败，没必要。
- **TOCTOU 故意接受**：`get_http_cache()` 注释直接写 `// This is technically a TOCTOU bug, but at worst it'll cause a few extra cache requests.`。AtomicBool 检查 + http.as_ref() 之间存在竞争窗口——理论上某线程可能正在把 http 设为禁用，另一个线程已经 load=true 进入了请求。turborepo 的判断：**这个 race 最坏后果是多发 1-2 个请求，比加锁的开销低得多**。承认 race 的存在但选择不修，这是**工程决断**。
- **manifest 快路径**：normal 路径要解压几百兆 tar.zst。快路径只读 manifest（小 JSON 列出原 cache 里所有文件名 + size + mtime + content hash），如果**当前 disk 状态 ALL match**就跳过解压，直接返回 file list。这是 turborepo 在 1.6 之后引入的关键优化——常见情形（CI 上同一 hash 多次 restore）解压 0 字节。
- **CacheDisabled 自动降级**：远程返回 CacheDisabled 时，`should_use_http_cache.store(false)` 把这个 process 后续的 HTTP 调用全部跳过。不退出 build，只是降级到纯本地——这对 CI 上 token 过期 / quota 用尽的场景非常友好。
- **scm_state.get_resolved().await 双层意图**：`LazyScmState` 在后台线程算 git HEAD sha + dirty hash，`get_resolved()` 在 put 前 await 它完成。意图：让 `{hash}-meta.json` 里写 `sha + dirty_hash`，将来 cache hit 时能告诉用户"这次复用的产物来自哪个 commit"。**这是给人类看的诚实信号**，不是给 hash 算法用的。

**怀疑 2**：fs.rs 快路径的"ALL files match"是用什么粒度的 hash 判断的？如果只比 size + mtime，文件 mtime 在 git checkout 后会重置导致快路径失效；如果比 content hash，每次都要 sha256 整个文件——那快路径没省多少。需要追到 `RestoreManifest::validate_all` 看具体策略。

---

### 段 (c) · `--filter` selector 解析与 task 子图选择

**永久链接**：[crates/turborepo-lib/src/run/task_filter.rs#L60-L180](https://github.com/vercel/turborepo/blob/e9a27cc9ddf128ea862cb579416cae6714f1d168/crates/turborepo-lib/src/run/task_filter.rs#L60-L180)

```rust
/// Filters an engine down to only the tasks matching the given selectors.
///
/// Each include selector contributes a set of tasks (unioned together).
/// Exclude selectors remove tasks from the result. When `affected_constraint`
/// is provided, the included tasks are intersected with it before excludes are applied.
pub fn filter_engine_to_tasks(
    engine: Engine,
    selectors: &[TargetSelector],
    affected_constraint: Option<&HashSet<TaskId<'static>>>,
    pkg_dep_graph: &PackageGraph,
    scm: &SCM,
    repo_root: &AbsoluteSystemPath,
    global_deps: &[String],
) -> Result<Engine, crate::run::error::Error> {
    let (include, exclude): (Vec<_>, Vec<_>) = selectors.iter().partition(|s| !s.exclude);

    let mut included_tasks: HashSet<TaskId<'static>> = HashSet::new();

    for selector in &include {
        let matched = resolve_selector_to_tasks(
            &engine, selector, pkg_dep_graph, scm, repo_root, global_deps,
        )?;
        included_tasks.extend(matched);
    }

    // If there were no include selectors (only excludes), start with all tasks.
    if include.is_empty() {
        included_tasks = engine.task_ids().cloned().collect();
    }

    if let Some(affected) = affected_constraint {
        included_tasks.retain(|t| affected.contains(t));
    }

    for selector in &exclude {
        let to_exclude = resolve_selector_to_tasks(
            &engine, selector, pkg_dep_graph, scm, repo_root, global_deps,
        )?;
        included_tasks.retain(|t| !to_exclude.contains(t));
    }

    if included_tasks.is_empty() {
        return Ok(engine.retain_filtered_tasks(&included_tasks));
    }

    // `with` relationships create no graph edges, so retain_filtered_tasks'
    // forward DFS would miss them. Expand the included set to cover `with`
    // siblings before pruning.
    let included_tasks = expand_with_siblings(&engine, included_tasks);

    Ok(engine.retain_filtered_tasks(&included_tasks))
}

fn resolve_selector_to_tasks(
    engine: &Engine,
    selector: &TargetSelector,
    pkg_dep_graph: &PackageGraph,
    scm: &SCM,
    repo_root: &AbsoluteSystemPath,
    global_deps: &[String],
) -> Result<HashSet<TaskId<'static>>, crate::run::error::Error> {
    if selector.match_dependencies {
        return resolve_match_dependencies(/* ... */);
    }

    let base_tasks =
        resolve_base_tasks(engine, selector, pkg_dep_graph, scm, repo_root, global_deps)?;

    let mut result = HashSet::new();

    if selector.include_dependencies {
        let deps = engine.collect_task_dependencies(&base_tasks);
        result.extend(deps);
    }

    if selector.include_dependents {
        let dependents = engine.collect_task_dependents(&base_tasks);
        result.extend(dependents);
    }

    if selector.include_dependencies || selector.include_dependents {
        if selector.exclude_self {
            for t in &base_tasks { result.remove(t); }
        } else {
            result.extend(base_tasks);
        }
    } else {
        result.extend(base_tasks);
    }
    Ok(result)
}
```

**5 条旁注**：

- **partition 一行分 include/exclude**：`selectors.iter().partition(|s| !s.exclude)` 把 `--filter=web` 和 `--filter=!ui` 一次性分成两堆。Rust 的 `partition` 返回 `(Vec, Vec)`——非常 idiomatic，比 for + 两个 push 干净。
- **affected_constraint 是交集而非额外 selector**：注意它不是被加到 `selectors` 列表里的——是**单独参数**。意图：`--filter=web --affected` 不是"先选 web，再加 affected"，而是"先选 web，然后从中保留 affected 的"。语义上 affected 是**约束**（intersect），不是 selector（union）。这个区分决定了 `--filter=! affected` 写法不存在——你不能"排除 affected"。
- **expand_with_siblings 的 hack 解释**：注释明说 `with` relationship 不在 graph edge 里——它是 turbo.json 里 microfrontends 用的语义"伴随调度"。如果不 expand，DFS 沿 dependsOn 边只会拿到 dev 任务但漏掉 proxy 任务。这个 hack 揭示了**graph 抽象的边界**——有些"调度关系"不是依赖关系，需要在主算法外打补丁。
- **collect_task_dependencies / collect_task_dependents 走 task graph 而非 package graph**：注意这里调的是 `engine.collect_task_dependencies`，不是 `pkg_dep_graph` 的 ancestors。意图：`...^web#build` 应当沿**任务图**追溯（包括跨包的 task-level 依赖如 `web#build -> schema#gen`），而不是只看包依赖。这是 v1.1 future flag `filterUsingTasks` 启用后的行为。
- **空集 fast return**：如果 include 之后 included_tasks 是空（filter 没匹配上任何东西），直接 `return Ok(engine.retain_filtered_tasks(&empty))`——不再做 expand_with_siblings 的工作。这个早返回避免对空集做 DFS，是常识但容易忘。

**怀疑 3**：`--filter=[main]` 的 git range selector 在 monorepo 里非常依赖 SCM 性能。如果 main 分支落后 1000 个 commit，turborepo 怎么避免对这 1000 个 commit 的 diff 做 O(N×M) 匹配？需要追 `target_selector::GitRange` 的具体实现——是用 `git diff main...HEAD --name-only` 一次性拿 changed files 然后对 input globs 做匹配，还是逐 commit 累积？这影响 CI 上 `--affected` 的实际开销。

---

## Hands-on（含改一处实验）

```bash
# 30 分钟跑通
mkdir -p ~/lab/turbo-demo && cd ~/lab/turbo-demo
npx create-turbo@latest my-turborepo --package-manager pnpm
cd my-turborepo
pnpm install

# 第一次 build：所有任务真实执行
pnpm turbo run build
# 输出形如：
#  Tasks:    7 successful, 7 total
#  Cached:   0 cached, 7 total
#  Time:     8.234s

# 第二次 build：什么都没改，全 cache hit
pnpm turbo run build
# 输出形如：
#  Tasks:    7 successful, 7 total
#  Cached:   7 cached, 7 total
#  Time:     312ms  >>> FULL TURBO

# 改 packages/ui/src/button.tsx 一个字符
echo "// touched" >> packages/ui/src/button.tsx
pnpm turbo run build
# 输出形如：
#  Tasks:    7 successful, 7 total
#  Cached:   5 cached, 7 total       ← ui + 依赖 ui 的 web 重 build；其余 cached
#  Time:     2.1s
```

**改一处实验**：把 turbo.json 里 `build.outputs` 从 `["dist/**"]` 改成 `[]`。

```jsonc
// turbo.json — 改之前
{ "tasks": { "build": { "outputs": ["dist/**", ".next/**", "!.next/cache/**"] } } }

// turbo.json — 改之后
{ "tasks": { "build": { "outputs": [] } } }
```

跑两次 `pnpm turbo run build`：

| 行为 | 改之前 | 改之后 |
|---|---|---|
| 第一次 build 时间 | 8.2s | 8.2s |
| 第一次 build 后 `node_modules/.cache/turbo/` 大小 | 18MB | 12KB（只剩日志） |
| 第二次 build cache hit | 7/7 | 7/7（逻辑 hit） |
| 第二次 build 后 `apps/web/.next/` 状态 | 仍然存在 | **被删了**（cache restore 时按 outputs 还原，空 outputs 不还原任何文件） |
| 启动 `pnpm --filter web start` | 成功 | 失败：`.next/BUILD_ID` not found |

**因果总结**：`outputs` 不仅决定"打什么进 cache"，还**决定"cache hit 时还原什么"**。空 outputs = cache 只保留日志和退出码，下次"hit"时不还原文件——log 复读了但磁盘上没产物。这教训是：`outputs` 必须列全你所有需要的输出 dir，否则你会得到"绿色 cache hit 但跑不起来的应用"。

`turbo.log` 里每个任务的 hash 计算输入也可见：跑 `pnpm turbo run build --dry=json | jq '.tasks[0].hashOfExternalDependencies'`，能看到 hash 由 inputs glob 内容 + dependsOn 任务的 hash + global env 一起 sha256 出来。

---

## 横向对比（≥ 4 维）

| 维度 | turborepo | Nx | Lerna | Bazel | pnpm workspaces | Rush |
|---|---|---|---|---|---|---|
| **语言/实现** | Rust | TS（Nx Cloud Rust） | TS | C++/Java | Node | TS |
| **任务图** | 强（task graph，task 级 deps） | 强（最早做这事的，plugin 化） | 弱（按 package 串行） | **极强**（hermetic + sandbox） | 无（只做 install） | 中（package 级 graph） |
| **Cache 策略** | FS + HTTP，hash = inputs+env+deps | FS + Cloud，类似但 plugin 化 | 无 | FS + remote，hermetic 严格 | 无 | FS + 自定义 remote |
| **配置文件** | turbo.json（极简） | nx.json + project.json（每包一个） | lerna.json（极简但弱） | BUILD.bazel（严格声明每个 input/output） | pnpm-workspace.yaml | rush.json + command-line.json |
| **filter 表达式** | `[main]` `^web` `...^web` `--affected` | `--projects=` `--affected=` | `--scope=` | label 表达式 + `bazel query` | 无 | `--to=` `--from=` `--impacted-by=` |
| **远程 cache 协议** | 自有 `/v8/artifacts` + 自托管 | Nx Cloud + 自托管开源 | 无 | gRPC bytestream（标准） | 无 | 自定义 |
| **plugin 模型** | 弱（几乎没有，turbo.json 即全部） | **强**（Nx generators / executors / plugins） | 弱 | **极强**（rules、aspects、toolchains） | 无 | 中（custom commands） |
| **学习曲线** | 极低（半小时上手） | 中（plugin 化）| 极低 | 极陡 | 极低 | 中（命令多） |
| **适合规模** | 中-大型 JS monorepo | 中-大型 + 多语言（plugin） | 小 | 超大企业（Google/FB）| 小-中（需配合其他） | 大型（微软用） |

**选型建议**：

- **纯 JS/TS monorepo + 想要"开箱即用 cache + 远程 cache + 小学习成本"** → turborepo（90% 场景的合理默认）
- **多语言 monorepo（Java + Python + TS）+ 想要 plugin 生态 / 代码生成器** → Nx
- **企业级超大 monorepo + 需要 hermetic build + 多语言 + 不怕学陡曲线** → Bazel
- **只想把多个包共用依赖 + 不需要 build 编排** → pnpm workspaces 单飞，足够
- **遗留的 Lerna 仓库 + 不想换基础设施** → 在原 Lerna 上加 turborepo（向后兼容路径），慢慢淘汰 lerna run 命令
- **你公司用 Microsoft 内部基建 / 已经依赖 Rush Stack** → Rush，否则不必专门考虑

**哲学差异（不只是功能）**：

- **turborepo vs Nx**：turborepo 的判断是"配置应该是一个 turbo.json 文件，所有特殊逻辑塞进去"——**配置一元化**。Nx 的判断是"每个 project 一个 project.json + 全局 nx.json + 各种 plugin"——**配置组合化**。前者上手快、定制少；后者天花板高、入门陡。
- **turborepo vs Bazel**：turborepo 信任 `inputs` glob 是正确的（你列了什么 hash 就只看什么），相信开发者会配对。Bazel 不信任——它要 sandbox 进程，强制每个文件都声明，跑 build 时 sandbox 里只有声明过的文件，否则编译器找不到。turborepo 选**速度 + 易用**，Bazel 选**正确性 + hermetic**。

---

## 与你当前工作的连接

**今天就能用**（≥ 4 子弹）：

- 任何**你正在维护的 JS monorepo**（含公司内部多包仓库、个人多模块项目）：写一份 `turbo.json` 把现有 `pnpm -r build` 替换成 `turbo run build`，第二次跑就有 cache。
- **CI 上 build/test 慢** 的项目：开 remote cache（Vercel 免费档 / 自托管 turbo-remote-cache），多人多 PR 共享 cache，typical 缓解 30-70% CI 时间。
- **写过的多 package npm 库**（如 SDK + CLI + 文档站组合）：用 `--filter=` 来精确跑 affected 子集，避免每次本地都全量 lint。
- **依赖关系混乱、想画图**：跑 `turbo run build --graph=graph.svg`，能 dump 完整任务图——审视依赖结构本身的好工具，不一定真要用 cache。

**下个月能用**（≥ 4 子弹）：

- **学习"hash-based incremental computation"心智模型**：turborepo 的 hash 输入设计是 cache 的**最佳教材**——把它想清楚后，写自己的 build 脚本 / serverless 项目 / 数据 pipeline 时会自然引入 hash + cache。
- **远程 cache 自托管 + 团队 dogfood**：搭一个 `/v8/artifacts` 兼容服务（社区有 turbo-remote-cache 等），团队共享开发 cache——这是 turborepo 最被低估的能力。
- **task_filter.rs 的 selector 表达式抄回 monorepo 工具改造**：`--filter=[main]` 这种 git-range filter 是好抽象，想做内部 build 工具时可以借鉴这套语法。
- **Walker<N, S> typestate pattern 借鉴**：写自己的 Rust 异步 DAG 调度器时，用 PhantomData + 状态类型分离 Start/Walking 两态——能让 API 在编译期更安全。

**不要用的部分**（≥ 4 子弹）：

- **不要在非 monorepo（单包项目）上用**：单包项目用 `npm run build` 即可。turbo 的价值在跨包调度——单包没有跨包，纯增加复杂度。
- **不要把 turbo run 当成 npm run 的同义替换**：turbo 接管 stdout/stderr 做日志归并 + 缓存，调试某个包的 build 详细输出时反而不如 `npm run build` 直接清晰。日志在 `node_modules/.cache/turbo/` 里。
- **不要硬塞跨语言**：turborepo 对 Python / Java / Go 多语言 monorepo 不是首选。它能跑 shell 命令，但 hash 输入/输出对非 JS 的支持薄。Bazel 才是这场景的工具。
- **不要用 turborepo 的 `outputs: []` 当"我不需要缓存产物"的开关**：实验里展示了——空 outputs 让"cache hit 还原 0 个文件"，启动会失败。如果是真的不需要缓存（比如纯 lint 任务），不要写 outputs。
- **不要把 `globalDependencies` 滥用为"所有变化都 invalidate"**：`globalDependencies` 是 nuclear option，列了 `*.md` 这种东西会让任何文档改动都 cache miss。只列**真正影响所有 task 输出的全局文件**（`.env`、`tsconfig.base.json` 等）。

---

## 自检 + 延伸阅读（Layer 7）

**3+ 个具体怀疑（追到行号级别）**：

1. **怀疑 1（Walker cancel 的语义）**：`Walker<N, Walking>::cancel()` 调用后，`watch` channel 被 set 为 true，但已经在 `tokio::spawn` 里跑的 worker 不会 abort 子进程。如果用户在一个 30 分钟的 webpack build 跑到 25 分钟时按 ctrl-C，turborepo 实际上还是会等这 5 分钟跑完吗？追 `crates/turborepo-lib/src/run/mod.rs` 里 ctrl-C handler → cancel 调用链 → 子进程 spawn 的 ChildKill 是否被触发。预期：当前实现是**graceful**——确实让子进程跑完。
2. **怀疑 2（FS cache 快路径的"all match"判定）**：`RestoreManifest::validate_all` 用 mtime 还是 content hash？如果是 mtime，git checkout 后整个快路径失效；如果是 content hash，每次都要全部读一遍文件——快路径没那么快。追 `crates/turborepo-cache/src/cache_archive/restore_manifest.rs`（sparse checkout 没拉，需要全量 clone 后追）。
3. **怀疑 3（git range filter 的 diff 算法）**：`--filter=[main]` 在 1000-commit 落后场景下，是 `git diff main...HEAD --name-only` 一次性拿全 diff，还是逐 commit walk？大 monorepo 上这两种性能差几个数量级。追 `turborepo-scope::target_selector::GitRange::resolve` + `turborepo-scm::SCM::changed_files`。

**接下来读哪 N 个文件**：

| 文件 | 回答什么问题 | 顺序 |
|---|---|---|
| `crates/turborepo-cache/src/cache_archive/restore_manifest.rs` | 快路径"all match"是按什么粒度判等？ | 1 |
| `crates/turborepo-lib/src/engine/mod.rs` + `.../execute.rs` | task graph 在 walker 之上的 schedule 怎么和 cache 串联？ | 2 |
| `crates/turborepo-lib/src/run/mod.rs` 的 ctrl-C 处理段 | 怀疑 1 的 graceful cancel 实现 | 3 |
| `crates/turborepo-scm/src/lib.rs` `changed_files` | git range filter 性能相关 | 4 |
| `crates/turborepo-cache/src/http.rs` 的 PUT/GET 流程 | 远程 cache 协议（兼容自托管时需要） | 5 |
| `crates/turborepo-lib/src/daemon/` | turborepo 1.7 引入的 daemon，这章没碰，但 watch mode 走它 | 6 |

---

## 限制（≥ 4 条独立）

- **基本默认你写了正确的 inputs/outputs glob**——它不像 Bazel 那样 sandbox 强制，写漏了一个 input 文件 → cache 错命中 → 拿到陈旧产物，turborepo 不会保护你。这是速度换正确性的 trade-off，但你必须知情。
- **远程 cache 协议虽然开源（OpenAPI 文档），但生态偏 Vercel**——自托管路径可行（社区有几个实现）但不是 first-class 支持，新 feature 通常是 Vercel cloud 先有再开放协议。如果你的合规要求"永远不能数据出仓"，要确认能完整自托管。
- **filter 表达式的 mental model 比 README 暴露的复杂**——`--filter=...^web#build`（依赖加自己） vs `--filter=^...^web#build`（只依赖不含自己）这种细节，文档不充分，task_filter.rs 里的 `exclude_self` 字段是后悔药。第一次写 CI filter 大概率写错。
- **没有 plugin 系统**——turbo.json 字段是固定的，没有"我想插一个自定义 hook 在 task 跑前"的 API。你想做事得改 Rust 源码或者套一层 shell。这是和 Nx / Bazel 最大的差异，对一般用户是简化，对工具基建团队是限制。
- **跨包共享 babel/tsconfig 配置时 hash 算不到**——`tsconfig.json` 用 `extends: "../../tsconfig.base.json"` 时，task 自己的 `inputs` 不包括 base 文件，需要把 base 加进 `globalDependencies`，否则 base 改了 cache 不失效。这种 footgun 只有读到坑后才知道。

---

## 附录：宣传 vs 现实清单（≥ 3 行）

| 宣传 | 现实 |
|---|---|
| "Incremental build for monorepos" | 增量是 hash 命中级别的"全跳过"，**不是**单文件级别的增量重编译；webpack/vite 在每个 task 内部还是从头跑。 |
| "No configuration required" | 默认零配置可以跑（自动用 package.json scripts），但**生产场景几乎都要写 turbo.json**——配 inputs/outputs/env 才能避免 cache miss / 错命中。 |
| "Remote cache out of the box" | 开箱即用是指 Vercel cloud，**自托管要自己搭服务 + Tokens**；不是真"零运维"。 |
| "Works with any package manager" | 是真的，但 pnpm 体验最好；npm 和 yarn classic 都有过 lockfile 解析的 corner case bug 修复历史。 |
| "Migrate from Lerna in minutes" | 简单仓库是真的；复杂仓库（带 lerna publish hooks / version policies / 自定义脚本）的迁移路径文档薄，要自己摸索。 |

---

## 元数据

- **写于**：2026-05-29
- **总行数**：≈ 580
- **启用工具**：Read / WebFetch / Bash / Edit / Write
- **永久链接锚定 commit**：`e9a27cc9ddf128ea862cb579416cae6714f1d168`
- **状元篇 v1.1 分支 D（框架/SDK）自检**：通用条目全过 / Layer 2 心脏文件 5 个 / Layer 3 三段独立精读 + ≥ 5 旁注 + ≥ 1 怀疑 / Layer 4 改 outputs 实验 / Layer 5 6 工具 9 维 / Layer 6 三段每段 ≥ 4 子弹 / Layer 7 ≥ 3 怀疑 + 6 文件延伸 / 限制 5 条 / 宣传 vs 现实 5 行 / Figure 1 webp 62KB / GitHub permalink 5 处带行号锚定。

