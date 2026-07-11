---
title: bottom — Rust 写的跨平台终端进程监控（widget 自由拼）
来源: 'https://github.com/ClementTsang/bottom'
日期: 2026-05-30
分类: cli
难度: 初级
---

## 是什么

bottom（**命令名 `btm`**）是一个**跨平台**的终端进程/系统监控工具，用 Rust 写。日常类比：像把"任务管理器"塞进终端，并且让你**自己拖动每个面板的位置和大小**。

你装完后敲：

```bash
btm
```

终端立刻变成一张仪表盘：左上角 CPU 时间序列折线，右上角内存条，左下角进程表，右下角网络 / 磁盘 / 温度。这个布局**默认值**已经够用，但你可以写一份 TOML 配置文件让它变成"只剩温度 + 电池 + 进程"三块——为笔记本能耗调试做的极简模板。

它的真正价值不是"又一个 htop"，而是 **htop 不支持 Windows、btop 在 Windows 上是社区移植、gotop / ytop 已经停维护**——bottom 是那个真正三端官方支持 + 可定制布局的现代终端监控。

## 为什么重要

不理解 bottom 的设计取舍，下面这些事都没法解释：

- 为什么 macOS 上 brew 装完没问题，Windows 上 update_rate 调到 250ms 反而 btm 自己吃 5% CPU
- 为什么 htop 那种"列表式 UI"和 bottom 那种"widget 网格"在大屏幕上观感差距巨大
- 为什么 ARM / 树莓派支持是 best-effort 而不是承诺
- 为什么 13.4k stars 一个工具能在三端 CI 上每周跑过百个测试不挂

## 核心要点

bottom 的工作可以拆成 **三件事**：

1. **跨平台采数**：通过 `sysinfo` crate 屏蔽差异——Linux 读 `/proc`，macOS 走 `sysctl`，Windows 调 PerfCounters。所有平台都给上层一个统一的 `CPU{usage, freq}` / `Process{pid, name, mem, cpu}` 结构。

2. **环形 buffer + 时间序列**：每个 update tick（默认 1s）把当前数值塞进一个**环形缓冲**，长度由"显示窗口 ÷ tick"决定。画图时直接读这个 buffer——这就是为什么你能左右拖动看历史。

3. **widget 网格 + TOML 布局**：屏幕被切成 row × col 的网格，每个格子是一个 widget（CPU / 内存 / 网络 / 磁盘 / 温度 / 电池 / 进程 / 基本信息）。用户写 TOML 描述网格，bottom 启动时把它解析成布局树。

三件事拼起来，bottom 就是一个**跨平台数据采集器 + 终端绘图引擎 + 可配置仪表盘**。

## 实践案例

### 案例 1：最简单的 htop 替代姿势

```bash
brew install bottom    # macOS
cargo install bottom   # 任何有 Rust 的平台
btm                    # 启动
```

进入界面后：

- 上下箭头切换进程
- `/` 进入搜索（按进程名过滤）
- `dd` 发 SIGTERM 杀选中进程
- `t` 切换树视图（看父子进程关系，类似 `pstree`）
- `q` 退出

零配置就能用，比 `ps aux | grep ... | kill` 一气呵成。

### 案例 2：自定义 layout 做能耗调试

写 `~/.config/bottom/bottom.toml`：

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

启动后整屏只剩三块：温度 + 电池 + 进程。**ratio 是相对权重**，30 + 70 表示上区域占 30%，下区域占 70%。这种 layout 笔记本插电 / 拔电对比时极好用。

### 案例 3：跨平台 CI 监控

bottom 在 GitHub Actions 上跑 Linux + macOS + Windows 三端，每条 PR 都触发。这个习惯很值得学——`sysinfo` 屏蔽了 OS 差异，但**真正能发现 Windows PerfCounters 慢、macOS 温度传感器路径不同**这种坑只有 CI 跑得到。

```yaml
strategy:
  matrix:
    os: [ubuntu-latest, macos-latest, windows-latest]
```

### 与 htop / btop 的差异（一张表）

| 工具 | 语言 | Windows | 自定义布局 | 时间序列图 | 现状 |
|---|---|---|---|---|---|
| htop | C | 不支持 | 几乎无 | 无 | 活跃 |
| btop | C++ | 社区移植 | 主题级 | 有 | 活跃 |
| gotop | Go | 支持但停维护 | 有 | 有 | 已停 |
| ytop | Rust | 支持但停维护 | 弱 | 有 | 已停 |
| **bottom** | Rust | **官方** | **TOML 网格** | **有** | **活跃** |

## 踩过的坑

1. **ARM / 树莓派偶尔传感器读不到**：温度 / 电池 widget 显示空白，因为 `sysinfo` 在 ARM 没覆盖某些 sysfs 路径。社区有 issue，多数靠"换 widget"绕过。

2. **Windows update_rate 调太低 btm 自己吃 CPU**：默认 1000ms 还行，调到 250ms 时 PerfCounters 调用太频繁，btm 反而占 5% CPU——监控工具自己变成第二大占用源。

3. **TOML layout 学习曲线陡**：`ratio` 和嵌套 `row.child` 写错经常导致整屏空白，但报错信息只说"layout invalid"，不指哪一行。新人常被劝退。

4. **终端不支持 truecolor 颜色糊**：在某些远程 SSH 终端 / Windows 经典 cmd 里，主题颜色变成模糊的灰块，需要 `--no-truecolor` 或在 TOML 里换 `nord` / `default-light` 主题。

## 适用 vs 不适用场景

**适用**：
- 跨平台日常系统监控（笔记本一份配置，三端通用）
- 需要时间序列回看（找一分钟前 CPU 尖峰是哪个进程）
- 笔记本能耗 / 温度调试（自定义 layout 只显示相关 widget）
- 替代已停维护的 gotop / ytop

**不适用**：
- 服务器集群级监控 → 用 Prometheus + Grafana
- 容器内监控 cgroups 详细资源 → 用 `ctop` / `kubectl top`
- 需要历史数据持久化（btm 重启就丢） → 用 netdata
- 需要 GPU 监控（btm 当前不支持 NVIDIA / AMD GPU widget） → 用 `nvitop` / `nvtop`

## 历史小故事（可跳过）

- **2018 年前**：终端监控生态主要是 htop（C, Linux/macOS）和 Windows 自带任务管理器，**没有跨三端的现代选项**。
- **2018 年**：Go 写的 gotop 出现，加了时间序列图、自定义 widget——但作者 2020 年停维护。
- **2019 年**：ytop（Rust 移植 gotop）出来填空，但作者也很快停维护。
- **2019-2020 年**：ClementTsang 启动 bottom，明确说**灵感来自 gotop / ytop / htop**，目标是"接住停维护的两个项目 + 真正官方支持 Windows"。
- **2024 年后**：从 tui-rs 迁到 ratatui（tui-rs 社区分叉，因为原作者也停维护了），13.4k stars。

整个故事是"Rust 终端 UI 生态成熟（tui-rs 出来）+ 前任停维护"两个条件碰上的产物。

## 学到什么

1. **"跨平台"不是免费的**——sysinfo / crossterm 这类抽象 crate 是 bottom 能存在的前提，没它每个 widget 都得三端各写一遍
2. **可定制布局是对"htop 美学"的反叛**——htop 假设"所有人想看的差不多"，bottom 假设"每个人能耗调试 / 服务器观察 / 容器监控的关注点不同"
3. **接住停维护项目是合法生态位**——gotop / ytop 用户量证明需求存在，bottom 没创造需求，只是接住
4. **CI 跑三端是验证跨平台的唯一办法**——不跑 Windows，永远不会发现 PerfCounters 慢

## 延伸阅读

- 项目主页：[ClementTsang/bottom](https://github.com/ClementTsang/bottom)（README 含 GIF 演示，最直观）
- 配置文档：[bottom.toml 完整参考](https://clementtsang.github.io/bottom/nightly/configuration/config-file/)
- 同类对比：[awesome-tuis](https://github.com/rothgar/awesome-tuis) 收录 100+ 终端 UI 工具
- [[htop]] —— bottom 的精神祖父，"列表式 UI"标杆
- [[btop]] —— bottom 的现代竞品，C++ 写，主题更花哨

## 关联

- [[htop]] —— C 写的进程监控经典，Linux/macOS only，bottom 想覆盖的"三端跨平台"是它做不到的
- [[btop]] —— C++ 写的现代竞品，主题级定制，但 Windows 是社区移植；bottom 走"布局级定制 + 三端官方"路线
- [[dust]] —— 同样是 Rust 写的命令行可视化工具（du 替代品），bottom 的"用 Rust 重写经典 CLI"思潮一员
- [[bat]] —— Rust 写的 cat 替代，与 bottom 同属"Rust CLI 复兴"代表
- [[fd]] —— Rust 写的 find 替代，同思潮
- [[ripgrep]] —— Rust 写的 grep 替代，证明 Rust + 终端 + 跨平台的组合可以打过 C 老兵
- [[fzf]] —— 终端模糊搜索，bottom 的进程过滤器在精神上向它致敬

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[bandwhich]] —— bandwhich — 按进程实时显示带宽占用的跨平台 TUI
- [[procs]] —— procs — ps 的现代替代，彩色 + 树视图 + 多列搜索
- [[ratatui]] —— ratatui — Rust 的立即模式 TUI 库，tui-rs 弃坑后社区接住
