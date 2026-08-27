---
title: fd — 默认按正则扫文件名的现代 find
description: 把 find 的高频文件名查找收成默认正则、ignore 并行遍历和 smart case。
来源: https://github.com/sharkdp/fd
日期: 2026-08-27
分类: CLI
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: tool
  canonical_source: https://github.com/sharkdp/fd
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 4f81778774463bf414a184cbe6d5219ad2229646
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 10.5.0
---

## 是什么

fd 是一个用 Rust 写的文件系统查找器，crate 名是 `fd-find`，二进制叫 `fd`。日常类比：`find` 是要自己写条件的老式检索台；`fd` 把“当前目录、文件名、跳过噪音”设成默认，你只丢一个模式进去。

```bash
fd readme
fd -e md . docs
fd -t d node_modules -x rm -rf
```

固定 10.5.0 里，第一条默认按**未锚定正则**去匹配**文件名**（不是完整路径）。`readme` 能命中 `README.md`，是因为正则本来就是子串匹配，再加上 smart case，不是另做了一套 glob。

## 为什么重要

不读固定源码，旧笔记会把三件事说错：

- 把默认模式写成“substring API”——默认是 regex；字面子串要 `-F`，整名精确匹配要 `--exact`
- 把并行写成 rayon——`Cargo.toml` 没有 rayon，遍历走 `ignore::WalkParallel`
- 以为 `.gitignore` 随时生效——默认还要求探测到 git 仓库（`require_git`）

它和 [[ripgrep]] 分工清楚：fd 找名字，rg 找内容。和 [[fzf]] 搭配时，常被设成 `FZF_DEFAULT_COMMAND`。

## 核心要点

固定 10.5.0 的主链是：

1. **先规范化模式**：`build_pattern_regex` 默认原样当正则；`--glob` 经 `globset` 转正则且 `literal_separator=true`；`--fixed-strings`/`-F` 做 `regex::escape`；`--exact` 再锚成 `^{escaped}$`。`--and` 追加的模式必须全部命中。

2. **smart case**：`pattern_has_uppercase_char` 解析 regex HIR。字面大写、或字符类两端是大写，就改成大小写敏感；`\x6F` 这种转义不算。

3. **默认只看文件名**：没有 `--full-path`/`-p` 时，模式里出现 `/` 会直接报错，避免把路径当成永远匹配不到的文件名。要按路径搜，显式加 `-p`。

4. **ignore + 并行遍历**：`WalkBuilder` 默认跳过点文件、读 `.gitignore` / `.ignore` / `.fdignore` / 全局 `fd/ignore`，并 `require_git`。线程数是 `available_parallelism().min(64)`。结果先缓冲最多约 100ms / 1000 条，超时改流式打印。

5. **过滤与副作用分开**：`-e` 在文件名上做大小写不敏感的扩展名正则；`-t` 走 `FileTypes`；`--exclude` 变成 ignore Override 的 `!pattern`；`-x` 每个结果并行执行，`-X` 整批交给一个命令。`-x` 的执行顺序不作保证。

## 实践示例

### 案例 1：默认正则 + smart case

```bash
fd readme
fd README
fd -s readme
```

`readme` 大小写不敏感；模式里出现字面大写后切到敏感。要强制敏感用 `-s`，强制不敏感用 `-i`。

### 案例 2：扩展名是过滤，路径是第二位置

```bash
fd -e md docs
fd -e md . docs
```

`fd [OPTIONS] [pattern] [path...]`。只写 `fd -e md docs` 时，`docs` 是文件名模式；要在 `docs/` 下找所有 Markdown，pattern 写成 `.` 再跟路径。

### 案例 3：并行执行与批处理

```bash
fd -t d node_modules -x rm -rf
fd -e rs -X wc -l
```

`-x`/`--exec` 是 `ExecutionMode::OneByOne`，按 `threads` 开作业线程；`-X`/`--exec-batch` 把路径攒进一条命令。需要串行时用 `--threads=1`。

## 踩过的坑

1. **把默认模式当成 glob**：`fd '*.rs'` 会按正则解释 `*`。要 glob 用 `-g`，要字面星号用 `-F`。

2. **模式里带了路径分隔符**：没有 `-p` 时，`fd src/main.rs` 会报“不会有结果”，应写成 `fd . src` 或 `fd --full-path src/main.rs`。

3. **默认看不见点文件和 ignore 条目**：找 `.env.example` 常要 `-H` 或 `-I`；`-u` 是 `--no-ignore --hidden`。

4. **Debian 二进制不叫 `fd`**：README 写明 `apt install fd-find` 装出的是 `fdfind`，因为 `fd` 已被其他包占用。

5. **把“并行”理解成 rayon 或固定耗时**：本页未跑 walk benchmark，也未测量 home 目录扫描时间。

## 适用 vs 不适用场景

**适用**：

- 按文件名 / 扩展名 / 类型在仓库里定位，并接受默认 ignore
- 用 `-x`/`-X` 对匹配结果执行命令
- 给 [[fzf]] 或 [[ripgrep]] 提供文件列表

**不适用**：

- 按文件内容搜——那是 [[ripgrep]]
- 需要 `find` 的复杂谓词组合（inode、多层 `-o`/`-a`）
- 不能接受默认正则、或必须在非 git 目录也套用 `.gitignore`（要加 `--no-require-git`）
- 把静态阅读写成“已测比 find 快一个数量级”

## 固定版本边界

- 本文绑定 `sharkdp/fd@4f81778774463bf414a184cbe6d5219ad2229646`，轻量 tag `v10.5.0`，`Cargo.toml` version 为 `10.5.0`。
- crate 名是 `fd-find`，`rust-version = 1.90.0`，edition 2024。
- 非 Windows / 非 macOS 等目标可选用 `tikv-jemallocator`；macOS 在该提交里仍被排除。
- 本文未编译、未跑测试、未测遍历耗时，状态保持 `UNVERIFIED`。

## 学到什么

1. **“短命令”的代价是默认合同**——正则、文件名、ignore、并行都是默认，不是后加的优化开关。
2. **并行来自 ignore walker，不是 rayon**——读依赖表比读口碑更准。
3. **smart case 看的是正则 HIR，不是用户是不是按了 Shift**——转义字节不会触发敏感。
4. **文件名模式和搜索根不是同一个位置**——第二个位置才是 path。

## 应用型自测

1. 不传任何匹配开关时，`fd '*.rs'` 会按 glob 还是按正则解释？
2. `fd src/lib.rs` 在没有 `--full-path` 时会怎样？
3. 默认并行遍历用的是 rayon 还是 `ignore::WalkParallel`？

检查点：

1. 按正则。`*` 是正则量词；glob 要 `-g`。
2. 报错退出，因为模式含路径分隔符且默认只匹配文件名。
3. `ignore::WalkParallel`。`Cargo.toml` 没有 rayon。

## 延伸阅读

- 仓库 README：[github.com/sharkdp/fd](https://github.com/sharkdp/fd)
- 固定源码：`sharkdp/fd` 提交 `4f81778774463bf414a184cbe6d5219ad2229646`
- [[ripgrep]] —— 内容搜索的对照；ignore 语义相近
- [[fzf]] —— 常用 fd 的文件列表做交互筛选

## 关联

- [[ripgrep]] —— 文件名 vs 文件内容
- [[fzf]] —— 列表筛选 UI
- [[bat]] —— 常被拿来预览 fd/fzf 选中的文件
- [[the-silver-searcher]] —— 更早的“尊重 ignore 的搜索”参照

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
