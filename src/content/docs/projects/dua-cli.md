---
title: dua-cli — 并发扫目录占用，再在 TUI 里标记后删除或进废纸篓
description: 介绍 dua-cli 如何用自带工作窃取线程池扫描目录树，并在 TUI 里把标记、删除和废纸篓拆开
来源: https://github.com/Byron/dua-cli
日期: 2026-08-27
分类: cli
难度: 入门
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: tool
  canonical_source: https://github.com/Byron/dua-cli
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 7baa9266a593fd6b7f7568c741798d76660eb3ab
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 2.43.0
---

## 是什么

dua-cli 是 Sebastian Thiel（Byron）写的磁盘占用分析器。日常类比：GNU `du` 像一个人挨个开抽屉称重量；`dua` 把开抽屉这件事派给一组工人，称完再给你一张可点的家具地图。

二进制名是 `dua`，crate 名是 `dua-cli`。固定 2.43.0 把扫描引擎拆到同仓的 `dua-core` 3.2.0：自己做工作窃取线程池，不再依赖 jwalk / rayon。

```bash
dua                 # 默认聚合当前目录子项
dua i /var          # 进入交互 TUI
dua aggregate -d 2  # 打印两层缩进树
```

## 为什么重要

不看固定源码，旧印象很容易把 dua 说成另一套 `jwalk + json-lines`：

- 为什么现在扫目录的是 `dua-core` 的 Injector / LIFO worker，而不是 rayon
- 为什么 `-f` 管的是字节单位，不是 JSON
- 为什么 `d` 只是标记，永久删除和进废纸篓要到 Mark 窗按 `Ctrl+r` / `Ctrl+t`
- 为什么 Linux 默认会跳过 `/proc` `/dev` `/sys` `/run`

一句话：dua 的产品判断是**先并发出一份内存树，再在树上决定删还是留**。

## 核心要点

固定 2.43.0 的主链可以拆成五步：

1. **选命令**：无子命令或 `aggregate`/`a` 走一次性打印；`interactive`/`i` 进 ratatui + crossterm TUI；另有 `completions` 和 `config`。
2. **配置 WalkOptions**：线程数、`apparent_size`、硬链接是否每次都算、是否跨文件系统、`--ignore-dirs` 与 `--ignore-from`。线程写成 `0` 时按逻辑 CPU 数展开；macOS 默认是 8。
3. **`dua-core` 并发 walk**：根目录进共享 Injector；工人读目录、按 4 条一批补 metadata（Unix），再把子目录塞回队列。`Order::ParentFirst` 保证父目录先于子孙发出。符号链接只报告、不跟随。
4. **按 inode 去重再聚合**：`InodeFilter` 用 `(dev, ino)` 记住硬链接；默认只计第一次。`-A` 改用 `metadata.len()` 的逻辑大小。
5. **打印或进 TUI**：聚合路径按大小排序输出；交互路径把整棵树放进 `petgraph` 的 `StableGraph`，之后浏览不再重新扫盘。

## 实践案例

### 案例 1：先出一层占用，再决定要不要进 TUI

```bash
dua /var
dua i /var
```

无子命令时，dua 会把单一目录参数当成新的 cwd，再枚举其中的子项做聚合。`i` 是 `interactive` 的别名，要求 stderr 连着终端。

### 案例 2：深度树和火焰图栈，而不是 JSON Lines

```bash
dua aggregate -d 2 /var
dua aggregate --stack /var
```

`-d` 限制缩进树深度，输入本身算第 1 层。`--stack` 输出 folded stacks，给火焰图工具用。固定源码里**没有** `--format=json-lines`；`-f` / `--format` 只选 `metric` / `binary` / `bytes` / `GB` / `Gib` / `MB` / `Mib`。

### 案例 3：标记后分开删除和进废纸篓

```bash
dua i
# 主列表：d 或空格切换标记，x 标记并下移
# 切到 Mark 窗：Ctrl+t 进废纸篓，Ctrl+r 永久删除
```

`d` 不会直接删文件。`Ctrl+d` 是下翻 10 行。永久删除走 `delete_directory_recursively`，可复用扫描线程数；废纸篓走 `trash::delete`。本轮没有实际按这些键。

## 踩过的坑

1. **把 `d` 当成“扔进废纸篓”**：主窗 `d` 只 toggle 标记；废纸篓是 Mark 窗的 `Ctrl+t`，永久删除是 `Ctrl+r`。
2. **把 `-f` 当成机器可读 JSON**：它是人读的字节格式。机器侧更接近 `--stack`，不是 json-lines。
3. **以为引擎还是 jwalk + rayon**：2.43.0 的 `Cargo.toml` 只有 `dua-core` 和 `crossbeam`；工作窃取写在 `crates/dua-lib`。
4. **Linux 扫根目录却看到空的伪文件系统**：默认 `--ignore-dirs` 含 `/proc` `/dev` `/sys` `/run`；显式当作输入时仍会扫。
5. **把 README 的“比 du / rm 更快”当成本轮测量**：本文没有跑扫描或删除基准。

## 适用 vs 不适用场景

**适用**：

- 多核本机或服务器上先看目录树，再在 TUI 里确认后删除
- 需要硬链接去重、APFS clone 去重或 gitignore 式排除
- 要把占用导出成火焰图 folded stacks

**不适用**：

- 只要一张只读条形图、不需要删除 → 看 [[dust]]
- 需要离线快照拷回另一台机器分析 → 看 [[ncdu]] 的 `-o` / `-f`；dua 没有这套导出
- 只看挂载点而不是目录树 → 看 [[duf]]
- 不能接受“整棵树留在内存里”的超大目录扫描

## 固定版本边界

- 本文绑定 `Byron/dua-cli@7baa9266a593fd6b7f7568c741798d76660eb3ab`，tag `v2.43.0` 与 `dua-core-v3.2.0` 同指此提交。
- crate `dua-cli@2.43.0` 依赖路径 crate `dua-core@3.2.0`；workspace 清单版本仍写 `2.42.0`。
- 默认 feature 含 `tui-crossplatform` 与 `trash-move`；TUI 用 ratatui 0.30.2。
- 本文只做静态源码审查，未安装 Rust 依赖、未运行上游测试、未测扫描速度，状态保持 `UNVERIFIED`。

## 学到什么

1. **并发目录遍历可以自己做工作窃取**，不必绑定 rayon。
2. **删除键和标记键必须分开**，否则 `Ctrl+d` 这种翻页键会被误读成销毁。
3. **`--format` 的名字会骗人**——这里是单位，不是序列化格式。
4. **默认忽略名单也是产品判断**：Linux 伪文件系统默认不进报告。

## 应用型自测

1. 固定 2.43.0 里，`dua --format=json-lines` 会输出每行一个 JSON 对象吗？
2. 主列表按 `d` 会立刻把当前项送进废纸篓吗？
3. 扫描引擎还走 jwalk + rayon 吗？

检查点：

1. 不会。`-f` 只选字节单位；没有 json-lines 开关。
2. 不会。`d` 只切换标记；废纸篓是 Mark 窗 `Ctrl+t`。
3. 不会。walk 在 `dua-core` 的 crossbeam 工作窃取池里。

## 延伸阅读

- 固定源码：[Byron/dua-cli](https://github.com/Byron/dua-cli) —— 本文绑定提交 `7baa9266a593fd6b7f7568c741798d76660eb3ab`
- crate：[crates.io/crates/dua-cli](https://crates.io/crates/dua-cli)
- 并发遍历库：同仓 `crates/dua-lib`（`dua-core` 3.2.0）
- [[dust]] —— 只读条形图对照；不提供删除
- [[ncdu]] —— 单线程 TUI 前辈，带离线快照

## 关联

- [[dust]] —— 同一问题域的只读可视化对照
- [[ncdu]] —— 离线快照与单线程扫描对照
- [[gdu]] —— Go 并发 TUI 竞品，本页不改它的正文
- [[duf]] —— 看挂载点，不看目录树
- [[btop]] —— 实时资源仪表盘，不是一次性占用快照
- [[ratatui]] —— 交互界面用的立即模式 TUI 库

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[gdu]] —— gdu — Go 写的并发 du 替代，单二进制扔到服务器扫满盘几秒钟出 TUI
- [[ratatui]] —— ratatui — Rust 的立即模式 TUI 库，tui-rs 弃坑后社区接住
