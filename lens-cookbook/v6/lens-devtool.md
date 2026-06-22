---
schema_version: 6
lens: devtool
lens_id: devtool
title: lens-devtool
domain: lens
version: 6
layer: app
status: active
owner: jason
verified_at: 2026-05-31
review_quarter: 2026Q2
total_budget_chars: 3000
hardware_assumption: 个人/1-2 人开源；横切层（CLI/单二进制/含 LLM 本地工具）；零托管；用户=hacker；预算 $0-20/月；LLM 走单机栈
ring_summary: { adopt: 14, trial: 7, assess: 1, hold: 4 }
excludes: [glossary, sources+reading_list, getting_started, what_is_not]
wikilinks: [commander, oclif, yargs, ollama, llama-cpp, bun, sqlite-2022, drizzle, vitepress, starlight, changesets, ink, esbuild, duckdb]
out_of_corpus: [pkg, deno-compile, sqlite-vss, lancedb, transformers-js, mlx, candle, semantic-release, goreleaser, mdbook, better-sqlite3, tauri, electron, chromadb-local]
provider_coverage_checklist:
  - commander（≤20 命令默认 / 冷启 30ms）
  - oclif（≥30 命令 / 插件 / auto-update）
  - Bun compile（单二进制 50MB / 五平台）
  - Ollama（Modelfile + REST 11434）
  - llama.cpp（GGUF / Q4_K_M Q5_K_M / 嵌入式）
  - sqlite-vss / lancedb / DuckDB+VSS
sources:
  - commander / oclif / yargs README
  - Bun compile / Deno compile / vercel/pkg archive
  - Ollama / llama.cpp / Transformers.js / mlx
  - sqlite-vss / lancedb / DuckDB VSS
  - changesets / semantic-release / goreleaser
  - VitePress / Starlight / mdBook / Tauri v2
open_questions:
  - Bun vs Deno compile 在 Win arm64 2025 稳定度缺统一回归集
  - sqlite-vss 1M+ IVF 重建延迟+内存峰值无系统数据
  - Ollama vs llama.cpp 并发 token/s 2026 缺权威 benchmark
  - changesets vs semantic-release monorepo 10+ 包实战盘点缺
  - Tauri v2 在 Win 旧版 GPO 禁 WebView2 兜底路径不明
---

## 候选表

verified 2026-05-31。layer 全=app。

| 候选 | ring | 立场 | 触发条件 | layer |
|---|---|---|---|---|
| commander | adopt | commander: ≤20 命令默认 | 单文件 CLI | app |
| oclif | trial | oclif: 插件+auto-update | ≥30 命令 | app |
| yargs | adopt | yargs: 复杂 flag | 脚本兼容 | app |
| Bun compile | adopt | Bun: 单二进制 50MB | 三平台 | app |
| Deno compile | trial | Deno: permission 严 | TS 原生 | app |
| pkg | hold | pkg: 2024 archived | 迁出 | app |
| Ollama | adopt | Ollama: REST+Modelfile | runtime ok | app |
| llama.cpp | adopt | llama.cpp: GGUF 量化 | 嵌入二进制 | app |
| sqlite-vss | adopt | sqlite-vss: SQL+load_ext | ≤100k 向量 | app |
| lancedb | adopt | lancedb: HNSW 50ms | ≥100k 向量 | app |
| DuckDB+VSS | trial | DuckDB+VSS: SQL | 已用 DuckDB | app |
| changesets | adopt | changesets: monorepo | 显式 PR | app |
| goreleaser | adopt | goreleaser: Go 一锅 | Go 项目 | app |
| VitePress | adopt | VitePress: Vue+Vite | Vue 栈 | app |
| Starlight | adopt | Starlight: i18n+a11y | 多语言 | app |
| mdBook | adopt | mdBook: Rust 二进制 | Rust 项目 | app |
| better-sqlite3 | adopt | bs3: 同步+5× | load_ext | app |
| Drizzle | adopt | Drizzle: 编译期 SQL | type-safe | app |

trial：Transformers.js / mlx / semantic-release / chromadb / Docusaurus / np。assess：candle。hold：Mintlify / Prisma / esbuild。

## ADR 索引

**ADR-1 commander vs oclif** (vendor-selection)

### context
≤20 命令+冷启 30ms=commander；≥30+插件+auto-update=oclif。Go=cobra，Py=Click。

### decision
默认 commander；≥30+插件+auto-update→oclif；脚本+Bun→Bun shell。

### alternatives
yargs（拒：新项目无优势）；clipanion（拒：社区小）。

### consequences
commander 0 学习+冷启快。oclif 脚手架+auto-update+冷启 150ms。回滚：每命令 ~1h。

**ADR-2 Ollama vs llama.cpp** (vendor-selection)

### context
本地 7B-14B。Ollama 一键+REST 11434+量化拉取；llama.cpp GGUF+Q4_K_M ~4GB+二进制嵌入。

### decision
默认 Ollama（丝滑+~500MB runtime）；嵌入二进制→llama.cpp+GGUF mmap。

### alternatives
candle（拒：模型生态弱）；vLLM（拒：服务端不重叠）。

### consequences
Ollama+OpenAI 兼容；默认串行。llama.cpp 体积可控；无 REST。回滚：换 spawn。

**ADR-3 sqlite-vss vs lancedb** (vendor-selection)

### context
本地 RAG。sqlite-vss=bs3+load_ext+SQL+<100k 50ms；lancedb=Rust+Arrow+HNSW+百万级<50ms。

### decision
≤100k+SQL→sqlite-vss；≥100k 或 ANN<50ms→lancedb；已用 DuckDB→DuckDB+VSS。

### alternatives
chromadb local（拒：起 server 非嵌入）；Faiss 自管（拒：代价不值）。

### consequences
sqlite-vss 能 join 业务表；Win dll 偶坑。lancedb Arrow 强但不能 join SQLite。回滚：一次性重建索引。

**ADR-4 Bun compile 参数化** (implementation-tuning)

### context
单二进制。target/minify/bytecode 影响体积+启动+平台。

### decision
compile_targets = ["bun-darwin-arm64","bun-darwin-x64","bun-linux-x64-musl","bun-linux-arm64","bun-windows-x64"], minify = true, bytecode = true, sourcemap = "external", external_modules = [].

### rationale
五平台 99%；minify 减 30%；bytecode 启动 80→55ms；用 bun:sqlite 替 bs3 保单二进制。

### consequences
GH Release ~250MB；CI 5 job × 2min。回滚：减到 darwin-arm64+linux-x64，Win 改建 WSL2。

**ADR-5 单二进制 CLI vs Tauri/Electron** (architecture)

### context
CLI 60MB+工程师；Tauri 30-50MB Rust+Vite；Electron 200MB+兼容 Win7。

### decision
默认 CLI；图表预览/普通用户→Tauri；Win 旧版+GPO 禁 WebView2→Electron。

### consequences
CLI 1 周 v0.1+brew/scoop。Tauri/Electron 多 1-2 周加自动更新。

### rollback
条件：无 GUI 流失>30%/季。CLI→Tauri 加 webview 非破坏；Electron→Tauri 重写。

## 决策树

```
Q0 cost-gate：个人/1-2 人+0 预算+不托管？
  Y → 单机栈（Ollama+sqlite-vss+commander+Bun compile+GH Release+VitePress on Pages）
  N → Q1
Q1 产物？CLI→Q2；GUI→Win 旧版?Electron/Tauri（ADR-5）；npm 库→Q5
Q2 子命令？≤20→commander；≥30+插件→oclif（ADR-1）；Go→cobra；Py→Click
Q3 LLM？丝滑→Ollama；嵌入→llama.cpp+GGUF（ADR-2）
Q4 向量？≤100k+SQL→sqlite-vss；≥100k→lancedb（ADR-3）
Q5 Release？monorepo→changesets；Go→goreleaser；个人→np
Q6 文档？Vue→VitePress；多语言→Starlight；Rust→mdBook
```

## 外迁 excludes

- sources/devtool.md
- reading_list/devtool.md
- getting_started/devtool.md
- what_is_not/devtool.md
