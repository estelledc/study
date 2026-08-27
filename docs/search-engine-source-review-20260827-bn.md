# Search engine source review (writer BN)

> 用途：记录 Meilisearch、Typesense 项目页迁移所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer BN
- evidence：GitHub release/tag metadata、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未编译上游二进制，未运行上游 test、Docker、HTTP 请求、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git
- excluded slugs：开放 PR 已占用的 slug；本轮只改 `meilisearch` 与 `typesense`

## Meilisearch

- canonical source：`https://github.com/meilisearch/meilisearch`
- revision：`577f7af28942b71782eab1e59f44ad8296ce0a92`
- package / workspace version：`1.53.1`（`Cargo.toml` `[workspace.package].version`）
- tag：`v1.53.1`（lightweight tag，直接指向上述 commit）
- inspected：
  - `Cargo.toml`
  - `LICENSE`
  - `crates/milli/src/criterion.rs`
  - `crates/milli/src/index.rs`
  - `crates/milli/src/search/new/mod.rs`
  - `crates/milli/src/update/new/indexer/guess_primary_key.rs`
  - `crates/milli/src/documents/primary_key.rs`
  - `crates/milli/src/sharding/community_edition.rs`
  - `crates/milli/src/vector/embedder/mod.rs`
  - `crates/meilisearch/src/option.rs`
  - `crates/meilisearch/src/main.rs`
  - `crates/meilisearch/src/routes/indexes/mod.rs`
  - `crates/meilisearch/src/routes/indexes/documents.rs`
  - `crates/meilisearch/src/routes/indexes/search.rs`
  - `crates/meilisearch/src/routes/indexes/settings.rs`
  - `crates/meilisearch/tests/settings/get_settings.rs`
  - `crates/meilisearch-auth/src/lib.rs`
- observed：
  - workspace license metadata 为 MIT；根 `LICENSE` 声明 `MIT AND BUSL-1.1`，EE 模块单独走 BUSL；
  - HTTP 默认 `localhost:7700`，默认环境 `development`；`master_key` 可选，production 必须提供且至少 16 字节；
  - 写文档返回 202 enqueued task；注释写明「index 不存在则创建」；
  - 未声明 primary key 时，从首份文档里找小写后缀为 `id` 的唯一字段；0 个或多个候选都会失败；
  - 默认 ranking：`words`、`typo`、`proximity`、`attributeRank`、`sort`、`wordPosition`、`exactness`；统一 `attribute` 仍可配置，但不再是默认；
  - 默认 typo：`enabled=true`，`oneTypo=5`，`twoTypos=9`；
  - 未设置 `searchableAttributes` 时，已出现字段都会进入可搜索集合；
  - search 注释写明只考虑查询前十个词；GET `/search` 被标为 discouraged；
  - Community Edition 的 `Shards::processing_shard` 固定返回 `None`；分片在 EE 路径；
  - milli 含 OpenAI / Hugging Face / Ollama / REST / composite / manual embedder。
- provenance：
  - GitHub latest release 为 `v1.53.1`，published 2026-08-13；
  - tag object 与 `commits/v1.53.1` 都解析到 `577f7af2...`；
  - 引擎本体不是 npm 包；本审查绑定可达 GitHub tag，不猜测 Docker digest。

## Typesense

- canonical source：`https://github.com/typesense/typesense`
- revision：`d45d46baf3996d1de8bf96a87f375cfb43691560`
- package / release：`30.2`
- tag：`v30.2`（lightweight tag，直接指向上述 commit）
- inspected：
  - `README.md`
  - `DESIGN.md`
  - `LICENSE.txt`
  - `include/tsconfig.h`
  - `include/field.h`
  - `include/collection.h`
  - `include/art.h`
  - `src/collection_manager.cpp`
  - `src/collection.cpp`
  - `src/index.cpp`
  - `src/raft_server.cpp`
  - `src/auth_manager.cpp`
  - `src/core_api.cpp`
- observed：
  - 服务端许可证为 GPL-3.0；
  - `tsconfig` 默认 `api_port=8108`；启动需要 `--data-dir` 与 bootstrap `--api-key`；
  - `create_collection` 强制 `name` 与 `fields`；`enable_nested_fields` 默认 false；
  - `field_types::AUTO` 注释写明「first field value indexed will determine the type」；这是显式 schema 内的 `auto`，不是 Meilisearch 式无 schema；
  - 非通配搜索在 `the_fields.empty()` 时返回 `Missing query_by parameter`；
  - 搜索参数默认 `num_typos={2}`、`min_len_1typo=4`、`min_len_2typo=7`、`prefixes={true}`、`per_page=10`；`q` 或 `voice_query` 必填；
  - HA 由 `braft` 实现：解析 `--nodes`/`peers`，选主失败会重试；`DESIGN.md` 仍写异步副本，与当前 Raft 源码不一致；
  - 文档落 RocksDB，倒排索引走 Adaptive Radix Tree；向量字段用 `num_dim`，关键词字段不要塞进 `query_by`；
  - `AuthManager` 区分 bootstrap key 与派生 scoped key。
- provenance：
  - GitHub latest release 为 `v30.2`，published 2026-04-19；
  - tag object 与 `commits/v30.2` 都解析到 `d45d46ba...`；
  - README 吞吐/内存数字只作 E0 自述，未复测。
