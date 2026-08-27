---
title: dprint — 把格式化做成可插拔宿主，而不是又一个语言 formatter
description: 用 Rust 写的可插拔格式化宿主，通过 WASM 或 process plugin 统一多语言 fmt/check。
来源: https://github.com/dprint/dprint
日期: 2026-08-27
分类: 前端工具链
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: tool
  canonical_source: https://github.com/dprint/dprint
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 760591dedde9e7a3f2ee75c917a22413b39cc756
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 0.56.1
---

## 是什么

dprint 是一个用 Rust 写的**代码格式化宿主**。日常类比：它是打印店前台，不自己排版每一种文件；真正动语法树的是按需加载的 plugin。

你写一份 `dprint.json`，列出 plugin，然后：

```bash
dprint fmt
dprint check
```

`fmt` 把文件写成稳定输出；`check` 只比较、不写盘。固定源码里宿主 crate 版本是 `0.56.1`，核心库是 `dprint-core 0.69.1`。语言能力不在这个二进制里，而来自 WASM 或 process plugin。

## 为什么重要

不把 dprint 看成“又一个 Prettier”，下面这些事会对不上：

- 为什么一份配置能同时管 TypeScript、JSON、Markdown、Dockerfile，甚至再挂 rustfmt
- 为什么它能包一层 Biome / Oxc / Prettier / Ruff，却仍然自己决定文件发现、并行和缓存
- 为什么它和 [[xo]] 能组成 lint/format 对，而不必再回到 ESLint + Prettier，也不必换成 [[biome]] / oxlint 那种一体化工具
- 为什么 `check` 通过不等于“再 format 一次也一定不变”——两条命令的稳定化合同不同

## 核心要点

固定 `760591de...` 的执行链可以拆成五步：

1. **先解析配置和 plugin scope**：`fmt` / `check` 都走 `resolve_plugins_scope_and_paths`。没有 plugin，宿主不会假装会格式化。

2. **按 plugin 分组再并行**：`run_parallelized` 把文件按 plugin 集合切开，用 semaphore 限制线程。process plugin 会额外占运行时线程，所以可用线程会先减掉它们。

3. **增量缓存看内容 hash，也看 plugin hash**：`IncrementalFile` 存 `plugins_hash` 和文件字节 hash。plugin 集合变了就整表作废；内容没变则直接跳过。

4. **单文件可以串联多个 plugin，也可以回叫宿主**：一次 pass 里每个匹配 plugin 依次 `format_text`。plugin 可通过 `on_host_format` 让宿主再格式化嵌套片段，例如 Markdown 里的代码块。

5. **写盘前可以选择稳定化，检查路径默认不稳定化**：`fmt` 把 `EnsureStableFormat` 交给 CLI 的 `enable_stable_format`；不稳定时最多再跑 5 次。`check` 显式传 `EnsureStableFormat(false)`，只比较一次输出。另有一条启发式：原文 trim 后超过 300 字符、结果却变成空文本时，宿主会拒绝，避免 plugin 把文件清掉。

## 实践示例

### 案例 1：最小配置 + check / fmt

```json
{
  "lineWidth": 80,
  "plugins": [
    "npm:@dprint/typescript@0.96.1",
    "npm:@dprint/json@0.23.0"
  ]
}
```

```bash
echo 'const x=1;' > demo.ts
dprint check demo.ts   # 未格式化则非 0
dprint fmt demo.ts     # 写回稳定文本
```

**逐部分解释**：

1. 宿主读 `plugins`，按 `npm:` specifier 解析包，而不是内建 TS parser
2. `check` 发现差异时提示跑 `dprint fmt`；`list_different` 只打印路径
3. 本仓自己的 `dprint.json` 还挂了 markdown / toml / dockerfile / malva，并用 `exec` plugin 调 `rustfmt`

### 案例 2：exec plugin 把外部 CLI 接进同一条管道

固定仓库的配置把 Rust 文件交给 process plugin：

```json
{
  "exec": {
    "cwd": "${configDir}",
    "commands": [{
      "command": "rustfmt --edition 2024 --config imports_granularity=item",
      "exts": ["rs"]
    }]
  },
  "plugins": [
    "npm:@dprint/exec@0.7.3/plugin.json@704701df449dd7e942a71144773778ac529d68c2e4657bfc236d393b898b9a67"
  ]
}
```

这不是“dprint 会 rustfmt”，而是 exec plugin 按扩展名调用外部命令。specifier 末尾的 SHA-256 用来校验 tarball；缺校验时升级 plugin 更容易 silently drift。

### 案例 3：和 XO 分家，不要让两边同时管风格

```json
// xo.config.js —— 只做 lint，不做 Prettier
export default [{ prettier: false }]
```

```json
// dprint.json —— 只做 format
{ "plugins": ["npm:@dprint/typescript@0.96.1"] }
```

XO 默认就不开 Prettier。把风格规则留给 dprint，XO 只保留语义 / 最佳实践规则，才是这对组合的分界，而不是再开 `prettier: true`。

## 踩过的坑

1. **把宿主当成语言 formatter**：没写 `plugins`，`dprint fmt` 对 `.ts` 什么也不会做。
2. **以为 `check` 和 `fmt` 合同相同**：`check` 不做 stable format；某个 plugin 二次输出会变时，CI 可能绿、本地再 `fmt` 却继续改文件。
3. **incremental 缓存被理解成“文件路径缓存”**：它缓存的是内容 hash。你改 plugin 版本会重建；只改路径但字节相同，仍可能被当成已格式化。
4. **`dprint init` 不会帮你选 process plugin**：初始化扫描最多 1000 个文件 / 1000 个目录，而且只预填 WASM plugin。

## 适用 vs 不适用场景

**适用**：

- 仓库里不止一种语言，想用一份配置调度多个 formatter
- 已经选定 [[xo]] 做 JS/TS lint，不想再引入 Prettier 或一体化 toolchain
- 需要把 rustfmt、Ruff、甚至任意 CLI 接进同一条 `fmt` / `check`

**不适用**：

- 只要一个二进制同时 lint + format，并且接受该工具的规则集 → 看 [[biome]] 或 oxc/oxlint
- 必须 100% 复现某个现有 Prettier 输出，又还没对目标文件实测 → 不要从 README 推断兼容性
- 需要自定义 lint 规则而不是格式化 → dprint 不是 linter

## 固定版本边界

- 本文绑定 `dprint/dprint@760591dedde9e7a3f2ee75c917a22413b39cc756`，crate / npm 版本为 `0.56.1`。
- GitHub tag `0.56.1` 与 npm `gitHead` 指向同一提交。
- 宿主支持 WASM 与 process 两类 plugin；`dprint-core` 固定为 `0.69.1`。
- 本文只做源码/配置静态审查，没有下载 plugin、运行 `dprint fmt` 或测速度，状态保持 `UNVERIFIED`。

## 学到什么

1. **格式化平台和语言 formatter 不是同一层**——宿主管发现、并行、缓存和回叫；AST 重写留给 plugin
2. **CI 的 `check` 不等于可重放的 `fmt`**——稳定化开关会改变“再跑一次是否还变”
3. **plugin 校验和 plugin 列表同样属于合同**——`npm:` specifier 可以带 checksum，升级时要一起钉
4. **lint 与 format 可以分家**——XO 默认不开 Prettier，正好把版式交给 dprint

## 应用型自测

1. `dprint check` 通过后，立刻再跑一次 `dprint fmt`，文件还可能被改写吗？
2. 只把 TypeScript plugin 写进 `dprint.json`，对 `.rs` 跑 `fmt`，会得到 rustfmt 结果吗？
3. 升级了一个 plugin 版本，但源文件字节没变。incremental cache 还会跳过这个文件吗？

检查点：

1. 可能。`check` 关闭 stable format；`fmt` 可以再跑最多 5 次直到稳定。
2. 不会。没有匹配 plugin 就不会格式化；rustfmt 要靠 exec / 其他 process plugin。
3. 不会按旧表跳过。`plugins_hash` 变了会重建 incremental 文件。

## 延伸阅读

- 官方文档：[dprint.dev](https://dprint.dev)
- 固定源码：[dprint/dprint](https://github.com/dprint/dprint) —— 本文绑定提交 `760591dedde9e7a3f2ee75c917a22413b39cc756`
- 共享审查记录：仓库内 `docs/lint-format-source-review-20260827-dk.md`
- [[xo]] —— 本批配对的 JS/TS linter；默认不做 Prettier
- [[biome]] —— 对照：同一二进制里同时做 lint + format
- [[oxc]] —— 对照：共享 AST 的 lint/format 工具链
- [[wadler-prettier]] —— 现代 pretty-printer 的代数布局源头

## 关联

- [[xo]] —— lint 侧搭档：ESLint wrapper，风格规则可交给 dprint
- [[biome]] —— 一体化对照项，不是本批目标
- [[oxc]] —— 另一条 Rust 工具链对照
- [[shfmt]] —— 单语言 AST formatter，用来对照“宿主 vs 语言工具”
- [[wadler-prettier]] —— 布局算法背景，不证明 dprint 的具体输出

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[xo]] —— XO — 把 ESLint 收成一份意见，而不是再发明一个 lint 引擎
