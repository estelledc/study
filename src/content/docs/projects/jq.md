---
title: jq — 把 JSON 当成流来过滤的命令行处理器
description: 把 JSON 输入编译成过滤器字节码，再按值吐出结果流
来源: https://github.com/jqlang/jq
日期: 2026-08-27
分类: CLI / 命令行工具
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: tool
  canonical_source: https://github.com/jqlang/jq
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 34f7186b86743a083a589741b6cea95293524108
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 1.8.2
---

## 是什么

jq 是一个用 C 写的命令行 JSON 处理器。日常类比：awk 认识“行和字段”，jq 认识对象、数组和嵌套路径，并把每条过滤器当成“一个 JSON 值进去，零到多个 JSON 值出来”。

```bash
jq '{name, stars: .stargazers_count}' repo.json
```

`.` 是当前值，`|` 把上一步的每个结果交给下一步。固定标签 `jq-1.8.2` 的入口在 `src/main.c`：先编译过滤器，再对每个输入值跑一遍。

## 为什么重要

不看固定 1.8.2 源码，旧笔记容易把三件事写错：

- 以为 1.7 加了 `--decimal` 开关。usage 里没有这个选项；数字字面量走 `jv_number_with_literal`，计算路径仍可能落到 `double`
- 以为 `select` 失败会留下 `null`。`builtin.jq` 写的是 `if f then . else empty`
- 以为默认解析是流式的。整值解析才是默认；`--stream` 才打开 `JV_PARSE_STREAMING`

它和 [[fx]] 也不是互替：jq 负责稳定批处理，fx 负责先看清结构。

## 核心要点

固定 1.8.2 的主链可以拆成五步：

1. **编译过滤器**：`jq_compile_args` 做 `load_program` → `builtins_bind` → `block_compile`，再做 peephole `optimize`。`-f` 从文件读程序，并拒绝嵌入 NUL。
2. **按值取输入**：默认 `jv_parser` 读出下一个完整 JSON 值。`--slurp` 收成数组；`-n` 只提供一个 `null`；`--stream` 改成路径/值事件。
3. **对每个输入启动一次**：`process()` 调用 `jq_start(jq, value)`，把输入压进栈。
4. **向后取出结果流**：循环 `jq_next` 直到 invalid。一个过滤器可以对一个输入吐出多个值，也可以一个都不吐。
5. **打印或 halt**：字符串加 `-r` 时不带引号；`halt` / `halt_error` 走另一条退出码路径。TTY 且未给程序时，若 stdin/stdout 至少有一端不是 TTY，默认程序是 `.`。

`jv` 用引用计数。`jvp_array_write` 只在 `jvp_refcnt_unshared` 时原地写，否则分配新数组。所以 `.a = 1` 看起来像赋值，语义是返回改过路径的新值。

## 实践示例

### 案例 1：构造对象，而不是改原文件

```bash
jq '{name, stars: .stargazers_count, lang: .language}' repo.json
```

`{name}` 是 `name: .name` 的简写。这一句只往 stdout 写新对象。

### 案例 2：`select` 会让值消失

```bash
echo '[1,2,3]' | jq '.[] | select(. > 5)'
```

`select` 失败走 `empty`，所以这里没有任何输出，不是 `null`。后面的 `|` 也收不到值。

### 案例 3：`=` 和 `|=` 不是同一条更新

```bash
echo '{"n":1}' | jq '.n = 2'
echo '{"n":1}' | jq '.n |= . + 1'
```

`=` 走 `_assign` / `setpath`，右边是常量。`|=` 走 `_modify`，右边看当前路径上的旧值。

## 踩过的坑

1. **把 `--decimal` 当成 1.7 之后的开关**：1.8.2 的 help 没有这个 flag。字面量能否保住取决于 `USE_DECNUM` 与 `jv_number_with_literal`；本轮未编译发行包，不能把“任意大整数默认精确”写成已验证事实。
2. **shell 双引号**：过滤器必须单引号包起来。`$` 和反引号会被 shell 先展开。
3. **默认把整个值读进内存**：几个 GB 的 JSON 要改用 `--stream`，过滤写法会变成路径/值对，不能直接复用 `.foo.bar`。
4. **`tonumber` 不再容忍空白**：1.8.0 起前导/尾随空白会失败；要先 `trim`。`indices` 改成码点下标，不是字节下标。
5. **绑定 tag 的提交说明是 CI bump**：`jq-1.8.2` 轻量 tag 指向 `34f7186b...`，commit message 是 `actions/checkout` 依赖更新；`NEWS.md` 仍把该点标成 1.8.2 安全补丁发布。本页绑定这个可达 tag，不另猜更“干净”的提交。

## 适用 vs 不适用场景

**适用**：

- shell / CI 里从 API、kubectl、Docker inspect 抽字段或重塑 JSON
- 需要 `select` / `map` / `reduce` / `group_by` 这类稳定过滤器，而不是临时 REPL
- 输入是 JSON 或 ndjson，输出还要继续进管道

**不适用**：

- 先看清陌生大 JSON 的结构——应先用 [[fx]]
- YAML / TOML / XML 直接处理——看 [[yq]] / [[dasel]]
- 必须做 schema 校验——jq 不提供这层合同
- 把 `sanack/node-jq` 的 npm `gitHead` 当成这个 C 仓库的 revision

## 固定版本边界

- 本文绑定 `jqlang/jq@34f7186b86743a083a589741b6cea95293524108`，发布标签 `jq-1.8.2`。
- 1.8.2 相对 1.8.1 主要是安全与缺陷修复，并把最大打印深度从 256 提到 10000；1.8.0 起数组/对象元素上限为 `2^29`。
- 官方文档入口是 [jqlang.org](https://jqlang.org)，在线试用是 [play.jqlang.org](https://play.jqlang.org)。
- 本文未编译 jq、未跑 `make check`、未测吞吐，状态保持 `UNVERIFIED`。

## 学到什么

1. **过滤器是“值 → 流”，不是“值 → 值”**——`empty` 会让后续管道失去输入。
2. **编译一次，按输入值反复 `jq_start` / `jq_next`**——程序对象和输入值是分开的。
3. **不可变来自写时拷贝，不是口号**——共享 `jv` 被写入时会换新存储。
4. **发布 tag 和“看起来像功能提交”可以不是一回事**——要同时读 tag、`NEWS.md` 和实际 help。

## 应用型自测

1. `echo '[1,2,3]' | jq '.[] | select(. > 5)'` 会打印 `null` 吗？
2. 1.8.2 的 `--help` 里有没有 `--decimal`？
3. `.a = 1` 和 `.a |= . + 1` 哪一条会读取旧值？

检查点：

1. 不会。`select` 失败是 `empty`，没有输出。
2. 没有。数字字面量走 `jv_number_with_literal`。
3. 只有 `|=` 走 `_modify`，会看见旧值。

## 延伸阅读

- 手册：[jqlang.org/manual](https://jqlang.org/manual/)
- 在线试用：[play.jqlang.org](https://play.jqlang.org/)
- 固定源码：[jqlang/jq](https://github.com/jqlang/jq) —— 本文绑定提交 `34f7186b86743a083a589741b6cea95293524108`
- [[fx]] —— 先看结构的 TUI / JS 管道对照

## 关联

- [[fx]] —— 交互查看与 JS 表达式管道，不是 jq DSL
- [[yq]] —— YAML 入口；需要 jq 批处理时常先转 JSON
- [[ripgrep]] —— `--json` 输出常再交给 jq
- [[fd]] —— 按扩展名找出 JSON 再交给 jq
- [[miller]] —— 更偏表格 / CSV / ndjson
- [[dasel]] —— 多格式选择器，合同比 jq 宽、DSL 不同

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[curlie]] —— curlie — curl 的能力 + HTTPie 的语法
- [[dasel]] —— dasel — 一把刀同时切 JSON / YAML / TOML / XML / CSV
- [[fx]] —— fx — JSON 的交互式查看器（jq 的 TUI 表亲）
- [[gron]] —— gron — 把 JSON 拍平成 grep 能吃的赋值行
- [[httpie]] —— HTTPie — curl 的人话版本
- [[jc]] —— jc — 把 100+ Unix 命令的输出一键 JSON 化
- [[miller]] —— Miller (mlr) — 懂 CSV/JSON 表头的 awk
- [[xh]] —— xh — HTTPie 的 Rust 重写版
- [[yq]] —— yq — YAML 的 jq（也吃 XML/TOML/properties）
