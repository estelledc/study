---
title: bottom — Rust 写的跨平台终端进程监控（widget 自由拼）
来源: 'https://github.com/ClementTsang/bottom'
日期: 2026-05-30
分类: cli
难度: 初级
trust:
  version: study-v2
  source_kind: project
  note_type: tool
  canonical_source: https://github.com/ClementTsang/bottom
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: e22236a928eeb876b2ccaad2f3d1ce5f6450281a
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 0.14.9
---

## 是什么

bottom（**命令名 `btm`**）是一个跨平台终端系统监控器：采集线程按 tick 取 CPU / 内存 / 进程 / 磁盘 / 网络等，再由 ratatui 画成可拼的 widget 网格。日常类比：把任务管理器塞进终端，并且允许你用 TOML 重排面板。

```bash
btm
```

固定 `0.14.9` 的 crate 是 MIT，`default-run = "btm"`。默认 feature `deploy` 打开 `battery`、`nvidia` 和 `zfs`。源码自述灵感来自 gtop / gotop / htop。

## 为什么重要

不理解这三层，下面这些事会对不上：

- 为什么同一份 `bottom.toml` 能在 Linux / macOS / Windows 启动，但温度、磁盘、GPU 仍可能缺块
- 为什么把 `-r` 调到下限 250ms 时，帮助文本只警告「可能占用更多资源」，却没有给出固定百分比
- 为什么旧印象「btm 没有 GPU」和这个版本对不上
- 为什么时间轴能左右缩放，重启后历史却没了

## 核心要点

固定版本可以拆成四层：

1. **采集不是单一 crate**：`collection::Data` 汇总 CPU、load avg、内存、swap、温度、网络、进程、磁盘 I/O，以及可选电池 / ZFS ARC / GPU。底层混用钉死的 `sysinfo =0.39.6` 和平台代码（Linux `/proc` 与 cgroup、macOS sysctl/IOKit、Windows PDH）。NVIDIA 走 `nvml-wrapper`；Linux 另有 AMD 模块。

2. **时间序列是分块 SoA**：`TimeSeriesData` 用 `timeless::data::ChunkedData` 按字段存，时间是相对「现在」的反向偏移，并带修剪元数据。这不是定长环形数组。默认刷新 1000ms（下限 250ms），默认保留约 10 分钟（下限 1 分钟）。

3. **布局是 row → col → widget 树**：默认三行——`cpu`（ratio 30）、`mem` + `temp`/`disk`（40）、`net` + `proc`（30），进程格 `default=true`。用户 TOML 用 array-of-tables 写 `row` / `row.child` / `type` / `ratio`；省略 ratio 按 1。进程 widget 还会自动挂 sort 与 search 子格。

4. **输入与副作用分开**：crossterm 把键鼠送给 `App`。`/` 或 `Ctrl-f` 打开进程搜索（支持 `pid` / `cpu` / `mem` / `gpu%` 等查询）；`t` 或 `F5` 切树视图；`dd` / `F9` / `Delete` 打开杀进程对话框。Unix 默认可选信号，`--disable-advanced-kill` 时只发 SIGTERM（15）；Windows 走 `TerminateProcess`。`--read-only` 禁止这类动作。

## 实践示例

### 案例 1：零配置当进程监视器

```bash
btm
```

进入后：方向键或 `hjkl` 在表里移动，`/` 搜进程，`t` 切树，`q` / `Ctrl-c` 退出。默认选中的是进程格。这是阅读键位合同，不是本页实测过的操作录像。

### 案例 2：只留温度、电池和进程

```toml
[[row]]
  ratio = 30
  [[row.child]]
    type = "temp"
  [[row.child]]
    type = "batt"
[[row]]
  ratio = 70
  [[row.child]]
    type = "proc"
```

`ratio` 是相对权重。电池类型在默认 feature 下可用。配置文件优先已存在的 `$HOME/.config/bottom/bottom.toml`，否则 `dirs::config_dir()/bottom/bottom.toml`；macOS 还会看 `$XDG_CONFIG_HOME`。

### 案例 3：放慢刷新、打开只读

```bash
btm -r 2s --read-only
```

`-r` 接受毫秒数或 human duration。`--read-only` 让杀进程对话框不会真正发信号。

## 踩过的坑

1. **把 GPU 写成「当前不支持」**：`0.14.9` 默认打开 `nvidia`；进程表有 `gpu%` / GPU 内存列，内存图也会为 GPU 加行。没驱动或 feature 被裁掉时才会空白。AMD 路径只编进 Linux。
2. **把 250ms 写成固定「自己吃 5% CPU」**：帮助文本只说更小间隔可能增加资源占用；本页没有测 Windows PDH 或其它平台的占用。
3. **时间序列不是环形 buffer**：修剪按保留窗口做，缩放改的是显示时间范围（`+` / `-` / `=`），进程一退数据就没了。
4. **`t` 不是全局热键**：进程格里 `t`/`F5` 切树；温度表里 `t` 是按温度排序。先看当前 widget。
5. **layout 写错时错误很干**：解析失败走 `OptionError::Config`，不会指出「哪一行 ratio 嵌套错了」。

## 适用 vs 不适用场景

**适用**：

- 单机三端用同一份布局看 CPU / 内存 / 进程
- 需要短时时间序列回看（默认约 10 分钟窗口）
- 笔记本上自定义温度 / 电池 / 进程三块
- 默认构建里想顺便看 NVIDIA GPU 占用

**不适用**：

- 集群或长期存储——没有远端后端，重启即丢
- 容器 cgroup 细节作为主界面——虽有 Linux cgroup 采集，产品形态仍是本机 TUI
- 把未测的刷新开销、star 数或「每周测试数」写成结论
- 关闭 `nvidia` feature 的构建，却仍按默认 release 推断 GPU 列

## 固定版本边界

- 本文绑定 `ClementTsang/bottom@e22236a9...`，即 tag `0.14.9`，`Cargo.toml` 版本一致。
- 默认 feature：`battery` + `nvidia` + `zfs`；TUI 依赖 `ratatui 0.30.2` + `crossterm 0.29.0`。
- 刷新默认 1000ms、下限 250ms；保留窗口默认 10 分钟。
- 本文未运行 `btm`、未连 GPU / 电池、未测占用，状态保持 `UNVERIFIED`。

## 学到什么

1. **「跨平台」是采集门面，不是传感器保证**——统一 `Data` 结构下面仍是分 OS 的实现。
2. **默认 feature 也是合同**——GPU / 电池是否存在，先看构建开关，再看运行时设备。
3. **可拼布局把「所有人看同一屏」拆开**——htop 式固定列表和 TOML 网格是两种产品假设。
4. **杀进程是对话框 + 平台 syscall**——不要把 `dd` 直接等同于「一定 SIGTERM」。

## 应用型自测

1. 固定 `0.14.9` 默认构建里，进程表还有没有 GPU 相关列？
2. 默认刷新间隔和允许的最小值分别是多少？
3. `dd` 在 Unix 上是不是只能发 SIGTERM？

检查点：

1. 有。默认 `nvidia` feature 下进程列包含 `gpu%` 与 GPU 内存；没设备时是空数据，不是「功能不存在」。
2. 默认 1000ms，下限 250ms。
3. 不是。默认可开高级信号；只有 `--disable-advanced-kill` 才固定 SIGTERM=15。

## 延伸阅读

- 项目主页：[ClementTsang/bottom](https://github.com/ClementTsang/bottom) —— 本文绑定提交 `e22236a928eeb876b2ccaad2f3d1ce5f6450281a`
- 稳定文档：[bottom.pages.dev/stable](https://bottom.pages.dev/stable)
- 审查记录：仓库内 `docs/rust-cli-source-review-20260827-fi.md`
- [[htop]] —— 列表式进程监视的对照
- [[btop]] —— 另一条现代 TUI 监控路线
- [[ratatui]] —— 本版本的绘制库

## 关联

- [[htop]] —— C 写的经典列表式监视器
- [[btop]] —— C++ 现代竞品
- [[bat]] —— 同属 Rust CLI，阅读文件而不是监视系统
- [[procs]] —— 更偏 `ps` 替代的进程表
- [[ratatui]] —— TUI 绘制层

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[bandwhich]] —— bandwhich — 按进程实时显示带宽占用的跨平台 TUI
- [[procs]] —— procs — ps 的现代替代，彩色 + 树视图 + 多列搜索
- [[ratatui]] —— ratatui — Rust 的立即模式 TUI 库，tui-rs 弃坑后社区接住
