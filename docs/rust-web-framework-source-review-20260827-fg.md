# Rust web framework source review FG

> 用途：记录 axum、Actix Web 项目页迁移所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：parallel FG
- evidence：GitHub tag / annotated-tag peel、固定提交静态源码与文档阅读
- not executed：未安装两仓依赖，未运行上游 test、HTTP 服务、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，blob-filtered + sparse + `--depth 1`，不进入 Git
- crates.io：公开 API 返回 403，未用 crates.io `gitHead` 交叉核验；版本以 tag 名与 crate `Cargo.toml` 为准

## axum

- canonical source：`https://github.com/tokio-rs/axum`
- revision：`c59208c86fded335cd85e388030ad59347b0e5ae`
- crate：`axum@0.8.9`
- tag：annotated `axum-v0.8.9`（tag object `31872e2e543b9cbb0e671ca7d678448b38cfb4c7` 解引用到上述 commit）
- 同提交还挂：`axum-macros-v0.5.1`、`axum-extra-v0.12.6`
- rust-version：workspace `1.80`
- inspected：
  - `Cargo.toml`
  - `axum/Cargo.toml`
  - `axum/CHANGELOG.md`
  - `axum/src/lib.rs`
  - `axum/src/routing/mod.rs`
  - `axum/src/routing/path_router.rs`
  - `axum/src/handler/mod.rs`
  - `axum/src/extract/mod.rs`
  - `axum/src/docs/extract.md`
  - `axum/src/docs/routing/with_state.md`
  - `axum/src/docs/routing/without_v07_checks.md`
  - `axum/src/extract/state.rs`
  - `axum/src/extract/rejection.rs`
  - `axum/src/json.rs`
  - `axum/src/serve/mod.rs`
  - `axum-core/src/ext_traits/request.rs`
- observed：
  - crate 描述是 HTTP routing / request-handling library，不是独立 runtime；兼容目标写明 tokio + hyper，runtime 无关不是目标；
  - 默认 features 含 `http1` / `json` / `tokio`，`http2` 与 `tower-http` 都不是默认依赖（`tower-http` 只在 `__private_docs`）；
  - 路由语法默认禁止 `:name` / `*rest`，要写 `{name}` / `{*wildcard}`；`without_v07_checks()` 才能注册旧写法，否则 panic；
  - 最后一个参数必须实现 `FromRequest`，其余实现 `FromRequestParts`，因此 body extractor 只能有一个且必须最右，否则编译失败；
  - `Json` 用 `serde_json::Deserializer::from_slice` + `serde_path_to_error`；`JsonSyntaxError` 是 400，`JsonDataError` 是 422，缺 `Content-Type: application/json` 是 415；
  - `Bytes` / `String` / `Json` / `Form` 默认 body 上限 `2_097_152`；
  - `Router<S>` 表示还缺状态 `S`；只有 `Router<()>` 实现 `Service` 并能交给 `axum::serve`；漏写 `with_state` 是编译期错误，不是运行期 500；
  - `Handler::Future` 要求 `Send + 'static`；
  - `axum::serve` 注释写明配置面刻意很薄，复杂配置应直接用 hyper / hyper-util。

## Actix Web

- canonical source：`https://github.com/actix/actix-web`
- revision：`5723cf486522d47aad26390cf5b02e95654ae225`
- crate：`actix-web@4.15.0`
- tag：lightweight `web-v4.15.0` 直接指向上述 commit
- rust-version：workspace `1.88`（`CHANGES.md` 写 4.13.0 起 MSRV 为 1.88）
- inspected：
  - `Cargo.toml`
  - `actix-web/Cargo.toml`
  - `actix-web/CHANGES.md`
  - `actix-web/README.md`
  - `actix-web/src/lib.rs`
  - `actix-web/src/server.rs`
  - `actix-web/src/app.rs`
  - `actix-web/src/data.rs`
  - `actix-web/src/extract.rs`
  - `actix-web/src/web.rs`
  - `actix-web/src/rt.rs`
  - `actix-web/src/types/json.rs`
  - `actix-web/src/error/mod.rs`
  - `actix-web/src/middleware/mod.rs`
- observed：
  - `HttpServer::workers()` 默认按 `std::thread::available_parallelism()`；`run()` 文档另写 “physical cores”，两处措辞不完全相同，本文按 `workers()` 合同写；
  - factory 至少每个 worker 实例化一次，实例次数是 workers × 成功 bind 的地址数；
  - 每个 worker 使用单线程 Tokio runtime（`actix-rt`）；`web::block` 转到 `actix_rt::task::spawn_blocking`；
  - `web::Data<T>` 内部是 `Arc`；共享可变状态应在 `HttpServer::new` 闭包外构造；未注册对应 `Data<T>` 时 extractor 返回 500；
  - payload 只能被一个 extractor 消费；`Json` 默认 limit 也是 `2_097_152`；overflow 是 413，deserialize / content-type 是 400，serialize 失败是 500；
  - `wrap()` 后注册的中间件先处理请求；
  - HTTP 路径可用 `#[actix_web::main]` 或 `#[tokio::main]`；`actix` actor 与 `actix-web-actors` WebSocket 仍要求 `System`，因此仍要 `#[actix_web::main]`；
  - 4.15.0 增加 `Error::add_response_mapper()`，并移除实验 feature `experimental-io-uring`。
