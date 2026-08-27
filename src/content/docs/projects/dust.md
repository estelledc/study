---
title: dust — 把 du 的数字收成按占比着色的目录树
description: 介绍 dust 如何用 rayon 并行 walk，再用最大堆截顶并画占比条形图
来源: https://github.com/bootandy/dust
日期: 2026-08-27
分类: cli
难度: 入门
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: tool
  canonical_source: https://github.com/bootandy/dust
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 8a846f6689f2db6be6ef595239a21ec784d62b57
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 1.2.5
---

## 是什么

dust 是 Andy Boot 写的 `du` 可视化替代。日常类比：`du` 给你一列要自己排序的数字；dust 直接按占比画出带方块条的树，最大的分支持默认出现在上方。

crate 名是 `du-dust`，二进制名是 `dust`。固定 1.2.5 用 rayon 并行读目录，再用最大堆截出终端能放下的 top N，最后用 Unicode 块字符画条。

```text
 5.4G ┌── node_modules     │██████████████████████████│ 64%
 1.8G ├── .git             │█████████░░░░░░░░░░░░░░░░░│ 22%
 8.4G ┴ ./
```

```bash
dust ~
dust -d 2 .
dust -n 30 /var
```

## 为什么重要

不看固定源码，很容易把 dust 说成“带颜色的 du”，却说不清合同：

- 为什么默认不是把整棵树打完，而是按终端高度减 10 截行
- 为什么 `-b` 关掉的是百分比条，不是“按字节显示”
- 为什么 `-j` 的 clap 文案写“输出到当前目录”，实现却是 `println!` 到 stdout
- 为什么极深目录要 `-S` 加大栈，而不是再加一层 rayon

一句话：dust 的差异在**截取 + 画条**，walk 本身仍是递归并行 `read_dir`。

## 核心要点

固定 1.2.5 的主链可以拆成四步：

1. **解析 CLI 与可选 config**：`clap` 读深度、行数、过滤、颜色、进度条和输出格式；配置文件里的 `display_apparent_size` 可以和 `-s` 一起打开逻辑大小。
2. **安装 rayon 池再 walk**：`walk_it` 对每个根调用递归 `walk`；目录项走 `par_bridge()`。默认在 64 位且内存够时把栈加到 1 GiB，避免很深的嵌套爆栈。
3. **按 inode 去重再向上累加**：`clean_inodes` 用 `(inode, device)` 去重。未开 `-s` 时，第二次看到同一 inode 直接丢掉；开了 apparent size 则每个硬链接都计入。
4. **最大堆截顶再渲染**：`get_biggest` 把节点放进 `BinaryHeap`，弹出最大的，直到填满 `number_of_lines`。默认行数是终端高度减 10；设了 `-d` 或 `-j` 则改为 `usize::MAX`。条形用 `█▓▒░` 按占父节点比例着色。

## 实践案例

### 案例 1：先看家目录谁最胖

```bash
dust ~
dust -n 30 ~
```

不传路径时默认 `.`。`-n` 覆盖“按终端高度截行”。本轮没有实际跑这条命令，也没有测量耗时。

### 案例 2：限深看 monorepo，或改看最大文件

```bash
dust -d 2 .
dust -F -d 4 ~/Downloads
```

`-d` 限制展示深度。`-F` 打开 `only_file`：堆里只保留没有 children 的节点，再扁平重建，用来找大文件而不是大目录。

### 案例 3：JSON 是 stdout，不是写进当前目录

```bash
dust -j /var/lib/docker > disk-snapshot.json
```

`-j` 把同一棵 `DisplayNode` 交给 `serde_json::to_string` 后打印。clap help 写过“to the current directory”，实现并没有 `fs::write`。无 TTY 或设了 `NO_COLOR` 时默认不上色。

## 踩过的坑

1. **把 `-b` 当成字节模式**：它是 `--no-percent-bars`。要逻辑大小用 `-s`；要固定单位用 `-o b/k/m/g`。
2. **把 `-P` 当成 physical / 硬链接策略**：它只关进度条。硬链接去重由“是否 apparent size”决定。
3. **以为 JSON 会落盘**：必须自己重定向。漏掉 `>` 时，JSON 会直接打到终端。
4. **极深嵌套仍可能爆栈**：walk 是递归的；`-S` 改 rayon 栈，或 `-d` 先减展示深度。32 位默认不加 1 GiB 栈。
5. **snap 安装版只能看 `/home`**：上游 README 写明沙箱限制；换 cargo / brew 包装的非 snap 构建。

## 适用 vs 不适用场景

**适用**：

- 交互式看“哪一层最重”，只要一次快照、不要删除
- 用 `-n` / `-d` / `-F` 把输出收成能扫一眼的树
- 把 stdout JSON 交给自己的脚本做 diff

**不适用**：

- 看到大文件就要当场删 → 用 [[dua-cli]] 或 [[ncdu]]
- 精确对账、必须复现 `du -b` 的每一字节 → 直接 `stat` / `du`，不要经过可视化截取
- 实时监视目录膨胀 → dust 是单次 walk
- 终端不支持 Unicode / 颜色，又不想加 `-c` / `-R`

## 固定版本边界

- 本文绑定 `bootandy/dust@8a846f6689f2db6be6ef595239a21ec784d62b57`，tag `v1.2.5`，`Cargo.toml` 版本同为 `1.2.5`。
- crate 名 `du-dust`，避免和其它叫 dust 的包冲突；许可证 Apache-2.0。
- 默认 `reverse` 关闭时，内部 `is_reversed` 为 true，最大项画在树顶。
- 本文只做静态源码审查，未安装依赖、未运行 CLI 或测试，状态保持 `UNVERIFIED`。

## 学到什么

1. **可视化工具的合同常常在截取层**，不在 `stat` 算法。
2. **同名短选项会继承 `du` 的错误预期**，`-b` / `-P` 就是例子。
3. **并行 walk 仍可能是递归的**，栈大小和线程数是两件独立的事。
4. **机器可读输出要以实现为准**：help 文案和 `println!` 可以不一致。

## 应用型自测

1. `dust -b` 会改成按字节打印占用吗？
2. 默认（不设 `-n`、不设 `-d`、不是 JSON）大约显示多少行？
3. 未开 `-s` 时，第二次碰到同一 inode 还会计入吗？

检查点：

1. 不会。它关掉百分比条。
2. 终端高度减 10；没有 TTY 时退回 30。
3. 不会。`clean_inodes` 会丢掉重复 inode。

## 延伸阅读

- 固定源码：[bootandy/dust](https://github.com/bootandy/dust) —— 本文绑定提交 `8a846f6689f2db6be6ef595239a21ec784d62b57`
- 安装：`cargo install du-dust` / `brew install dust`
- [[dua-cli]] —— 同一问题域，但保留交互删除
- [[ncdu]] —— 交互 TUI 前辈
- [[ripgrep]] —— 另一条“重做 Unix 工具”的对照，不是磁盘工具

## 关联

- [[dua-cli]] —— 并发扫描 + 可删除的对照
- [[ncdu]] —— 交互删除与离线快照
- [[duf]] —— 看挂载点占用
- [[ripgrep]] —— Rust 重做核心工具的相邻样本
- [[fd]] —— `find` 的 Rust 重做
- [[bat]] —— `cat` 的输出层升级

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[bottom]] —— bottom — Rust 写的跨平台终端进程监控（widget 自由拼）
- [[broot]] —— broot — 把 tree 命令升级成会过滤、能 cd、显大小、看 git 的交互树
- [[duf]] —— duf — df 的彩色表格替代，按设备分组自动忽略伪文件系统
- [[htop]] —— htop — top 的彩色交互替代（鼠标点选 / 树视图 / 过滤）
- [[sd]] —— sd — 直觉语法的 sed 替代品（Rust 写的 find-and-replace）
