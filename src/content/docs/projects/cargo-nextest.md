---
title: cargo-nextest — Rust 并行测试运行器
来源: https://github.com/nextest-rs/nextest
日期: 2026-06-13
子分类: 测试工具
分类: Rust 工具链
难度: 初级
provenance: pipeline-v3
---

## 是什么

**cargo-nextest** 是 Rust 的下一代测试运行器，用来替换 `cargo test`。它把每个测试装进独立的进程跑，所有测试同时并行，跑完给你一份结构清晰的报告。

日常类比：想象一个食堂只有一个收银台，100 个人排队结账，每个人买的东西再快也要等前面 99 个人。这就是 `cargo test`——所有测试二进制**一个接一个地跑**，即使你的 CPU 有 16 个核也白搭。

cargo-nextest 的做法是：把 100 个人**同时分到 16 个收银台**，每个收银台独立处理一个人，互不干扰。谁先结完谁走，不用等"同一组"的人全部结完。

底层基石：

- **process-per-test（每个测试独立进程）**：一个测试崩了不会拖垮同文件的其他测试
- **list + run 两阶段**：先列出所有测试，再统一调度并行执行
- **Tokio 异步运行时**：用 async Rust 同时管理成百上千个测试进程

仓库由 5 个 crate 组成：`cargo-nextest`（CLI）、`nextest-runner`（核心引擎）、`nextest-filtering`（DSL 解析器）、`nextest-metadata`（公开 API）、`quick-junit`（JUnit 报告）。

## 为什么重要

不做测试跑得慢这件事，Rust 项目越大越痛：

- **大 workspace 测试串行跑**：`cargo test` 按二进制逐个执行，一个 10 秒的长测试堵住整个二进制里 50 个短测试，加起来白白浪费几分钟
- **一个测试 panic 污染全二进制**：线程模型下，同一个二进制里一个测试写了全局状态没清，后面的测试全受影响——这种"偶发挂掉"最难排查
- **CI 看不到结构化结果**：`cargo test` 只给 exit code，哪个测试挂了、挂了多久、是不是偶发 flaky，全靠 grep 日志
- **想区分"真 bug"和"偶尔抽风"**：没有内置重试机制，flaky test 反复打断 CI，团队慢慢对测试结果麻木

cargo-nextest 把这些痛点一次性解决：

- **速度**：实测比 `cargo test` 快 1.96x 到 3.38x（Tokio 2.09x、Reqwest 2.48x、Crucible 3.38x），workspace 越大优势越明显
- **隔离**：每个测试独立进程，一个崩了不影响邻居，彻底消灭"全局状态污染"
- **结构化输出**：每个测试的 pass/fail/耗时 单独记录，JUnit XML 直接喂 CI dashboard
- **内置重试**：`retries` 配置区分"偶发失败"和"确定性 bug"，失败原因写进报告

## 核心要点

整个工具的心智模型是 **"先盘点所有测试，再统一调度并行跑"**，四步：

1. **安装**：`cargo install cargo-nextest --locked`，然后 `cargo nextest --version` 验证
2. **跑测试**：`cargo nextest run`，比 `cargo test` 多一个 `e` 字母，习惯成本为零
3. **配规则**：在项目根目录创建 `.config/nextest.toml`，定义 profile、重试策略、test-groups
4. **读报告**：终端有进度条 + 实时通过/失败计数，CI 输出 JUnit XML

关键能力清单：

- **process-per-test**：每个测试独立进程，panic 不传染，全局状态天然隔离
- **内置重试 + 退避**：支持固定次数和指数退避 + 抖动（jitter），失败后自动重试并标记 flaky
- **test groups**：按资源类型限制并行度——比如"mysql 测试一次只跑 1 个"防止数据库连接池爆掉
- **filter DSL**：`-E 'test(auth) and not test(slow_)'` 这种表达式精准选测试子集
- **slow-timeout**：慢测试自动超时杀，防止 CI 被一个死循环挂住 30 分钟
- **Perfetto 追踪**：生成 trace 文件，用 Perfetto UI 图形化看每个测试的执行时间线
- **CI profiles**：本地和 CI 用不同配置（本地不重试快速反馈，CI 重试 2 次 + JUnit 输出）

### 为什么 process-per-test 更快

`cargo test` 的瓶颈不是"单条测试慢"，而是**串行调度**：

```
cargo test:
  二进制A ────→ 二进制B ────→ 二进制C ────→
  ┌─────────────────────────────┐
  │ test_a1  test_a2 ... test_aN │  线程并行，但必须等 A 全跑完才能跑 B
  └─────────────────────────────┘

cargo nextest:
  二进制A ─┐
  二进制B ─┼─→ 所有测试同时跑，谁先结束谁释放槽位
  二进制C ─┘
  ┌──────────────────────────────────────┐
  │ test_a1  test_b1  test_c1  test_a2 ...│  跨二进制并行，16 核全用上
  └──────────────────────────────────────┘
```

核心差异：nextest 的 **list phase** 先把所有二进制编译好、把所有测试列出来，然后 **run phase** 统一调度，16 个 CPU 核跑 16 个测试进程。

## 实践案例

### 案例 1：安装 + 第一次跑

```bash
# 安装（首次约 2-3 分钟编译）
cargo install cargo-nextest --locked

# 确认装好
cargo nextest --version

# 在任意 Rust 项目里跑
cd my-rust-project
cargo nextest run
```

第一次跑的终端输出和 `cargo test` 很像，但多了进度条和实时计数：

```
    Finished test [unoptimized + debuginfo] target(s) in 0.15s
    Starting 42 tests across 12 binaries
        PASS [   0.012s] my_crate::tests::test_add
        PASS [   0.008s] my_crate::tests::test_sub
        PASS [   0.023s] my_crate::tests::test_mul
        ...
------------
     Summary [   0.8s] 42 tests run: 42 passed, 0 skipped
```

### 案例 2：配置 `.config/nextest.toml`——本地 + CI 双 profile

```toml
# .config/nextest.toml

# ===== 本地开发：快速反馈，不重试 =====
[profile.default]
retries = 0
fail-fast = false
slow-timeout = { period = "30s", terminate-after = 2 }

# ===== CI：重试 + JUnit 报告 =====
[profile.ci]
retries = { backoff = "exponential", count = 2, delay = "1s", jitter = true }
fail-fast = true
slow-timeout = { period = "60s", terminate-after = 2 }

[profile.ci.junit]
path = "target/nextest/ci/junit.xml"

# ===== 资源隔离：数据库测试串行跑 =====
[test-groups]
mysql = { max-threads = 1 }
redis-integration = { max-threads = 2 }

# ===== 针对特定测试的覆盖配置 =====
[[profile.default.overrides]]
filter = "test(::mysql::)"
test-group = "mysql"
retries = { count = 3, backoff = "exponential", delay = "3s" }

[[profile.default.overrides]]
filter = "test(::redis::)"
test-group = "redis-integration"

[[profile.default.overrides]]
filter = "test(/\btest_network_/)"
retries = 4
```

配置文件放在项目根目录，选定 profile 用 `--profile` 或 `-P` 参数：

```bash
# 本地用 default
cargo nextest run

# CI 用 ci profile
cargo nextest run --profile ci
```

### 案例 3：filter DSL——精准选测试

nextest 的 filter 表达式比 `cargo test` 的字符串匹配强大得多：

```bash
# 跑名字包含 auth 的测试
cargo nextest run -E 'test(auth)'

# 跑名字包含 auth 但不包含 slow_ 前缀的
cargo nextest run -E 'test(auth) and not test(/\bslow_/)'

# 只跑集成测试（#[test] 在 tests/ 目录下）
cargo nextest run -E 'kind(test)'

# 只跑单元测试（#[cfg(test)] mod tests {...}）
cargo nextest run -E 'kind(lib)'       # 库单元测试
cargo nextest run -E 'kind(bin)'       # 二进制单元测试

# 跑某个包的所有测试 + 它依赖的包的测试
cargo nextest run -E 'deps(my-core-crate)'

# 跑特定二进制的测试
cargo nextest run -E 'binary(my-app)'

# 排除慢测试
cargo nextest run -E 'not test(/\b(slow|bench)_/)'
```

filter DSL 支持的谓词：`test(name)`、`kind(test|lib|bin|proc-macro)`、`binary(name)`、`package(name)`、`deps(crate)`、`platform(expr)`。用 `and`/`or`/`not` 组合。

### 案例 4：GitHub Actions CI 集成

```yaml
name: Test
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable

      - name: Install nextest
        uses: taiki-e/install-action@v2
        with:
          tool: nextest

      - name: Run tests with nextest
        run: cargo nextest run --profile ci --all-features

      - name: Run doctests (nextest 不支持)
        run: cargo test --doc

      - name: Upload JUnit report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: junit-report
          path: target/nextest/ci/junit.xml
```

注意：nextest 不支持 doctest，CI 脚本里必须单独跑 `cargo test --doc`，两条命令缺一不可。

## 踩过的坑

1. **忘了 doctests**：nextest 不跑 `///``` 注释里的代码示例。切 nextest 后 CI 少了 doctest 这关，`cargo test --doc` 单独补一刀。

2. **`.config/nextest.toml` 路径放错了**：配置文件必须从 **workspace 根目录**算 `.config/nextest.toml`，不是从 crate 目录。如果你只有一个 crate 且 workspace root = crate root，那就放项目顶层 `.config/nextest.toml`。

3. **Windows 上进程启动慢**：Windows 创建进程的开销比 Linux/macOS 大，极小项目（测试跑 < 0.5s）可能反而比 `cargo test` 慢。但 workspace 稍大就补回来了。

4. **test-groups 名字写错不会报错**：`[test-groups]` 定义的名字和 `overrides` 里引用的名字不一致时，nextest 静默忽略 override，测试照常并行跑——发现不了，直到数据库连接池爆掉。建议定义后 grep 确认引用一致。

5. **retries 计数含首次**：`retries = 3` 的意思是"最多跑 3 次"（首次 + 2 次重试），不是"失败后重试 3 次"。第一次过了就不重试。

## 适用 vs 不适用

**适用**：

- workspace 里 3+ 个 crate 的 Rust 项目，`cargo test` 串行等得难受
- CI 需要结构化测试报告（JUnit XML）和 flaky test 追踪
- 测试里有共享资源（数据库、Redis、临时文件），需要 test-groups 串行化
- 想用 filter DSL 精准选测试子集，比 `cargo test test_name` 灵活得多

**不适用**：

- 单 crate 且测试不到 20 条的微型项目——nextest 的进程启动 overhead 可能比测试本身还久
- doctests 是主力测试手段的项目——nextest 完全不支持 doctest
- 已经深度定制了 `cargo test` harness 的项目——nextest 的"厚二进制"接口可能不兼容自定义 harness

## 学到什么

1. **串行瓶颈往往不在"单条测试慢"而在调度**——`cargo test` 的问题不是线程不够，是二进制之间必须排队，nextest 用 list-then-run 两阶段打破了这个限制
2. **process-per-test 是用"进程开销"换"隔离确定性"**——进程启动比线程慢，但换来每个测试的"干净环境"，值
3. **配置分层是工业级工具的标志**：profile → override → env var → CLI arg，四层优先级让本地和 CI 各跑各的不用改代码
4. **filter DSL 本质上是对测试元数据的查询语言**——test name、kind、binary、package 都是字段，and/or/not 是组合子。学会了这个，其他工具的 filter 语法（k8s label selector、SQL WHERE）也能类比理解

## 延伸阅读

- 官方文档：[nexte.st](https://nexte.st)（设计文档、配置参考、benchmarks）
- GitHub 仓库：[nextest-rs/nextest](https://github.com/nextest-rs/nextest)
- 架构详解：[How it works](https://nexte.st/docs/design/how-it-works/) —— list phase / run phase / dispatcher-executor 模式
- 为什么 process-per-test：[Why process-per-test?](https://nexte.st/docs/design/why-process-per-test/)
- 性能基准：[Benchmarks](https://nexte.st/docs/benchmarks/) —— 7 个真实项目的速度对比数据
- Filter DSL 完整参考：[Filtersets](https://nexte.st/docs/filtersets/)
- IDE 集成：[RustRover 2026.1 原生支持](https://blog.jetbrains.com/rust/2026/04/03/rustrover-2026-1-professional-testing-with-native-cargo-nextest-integration/)
- [[cargo-test]] —— Rust 内置测试框架，和 nextest 互补
- [[tokio]] —— nextest 底层的异步运行时

## 关联

- [[cargo-test]] —— 互补关系：cargo test 负责 doctest + 简单场景，nextest 负责大 workspace 并行 + CI
- [[tokio]] —— nextest 用 Tokio 异步运行时管理成百上千个测试进程
- [[rust-testing]] —— Rust 测试全景：单元测试、集成测试、doctest、property-based testing
- [[ci-cd]] —— nextest 的 JUnit XML + retries + profiles 都是为 CI pipeline 设计的
