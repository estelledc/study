---
title: ratatui — Rust 的立即模式 TUI 库，tui-rs 弃坑后社区接住
来源: https://github.com/ratatui-org/ratatui
日期: 2026-05-31
子分类: 命令行工具
分类: CLI
难度: 入门
provenance: pipeline-v3
---

## 是什么

ratatui 是 **Rust 写的终端图形界面库**，给命令行工具一个"在终端里画面板、画表格、画进度条"的能力。它管两件事：把当前帧的字符 / 颜色算出来；把和上一帧不一样的位置写到终端。**事件循环、状态管理、键盘输入处理一律不管**——你自己拿 crossterm 收键盘、自己决定什么时候 redraw。

日常类比：

- ratatui 像**画板 + 标尺**——你说"这块 30%、那块 70%"，它替你算出每格在哪、写哪个字符
- 但**谁来按节拍画下一帧**它不管，你得自己装一个心跳

它的前身叫 **tui-rs**（Florian Dehau 2016 年开始写），2023 年原作者停维护，社区在 ratatui-org 重启 fork，名字从"tui"换成 ratatui（一道法国炖菜，logo 也是只老鼠厨师）。截至 2026-05，20.8k stars，被 15.1k 个 Rust 仓库依赖——[[gitui]] / [[bottom]] / [[bandwhich]] / [[dua-cli]] / atuin / iamb 全是它画的。

## 为什么重要

不理解 ratatui 这套设计哲学，下面这些事都没法解释：

- 为什么 Rust 圈一堆 TUI 工具长得像（多面板 / vim 键位 / 单字母触发）——它们共享 ratatui 的 Layout + 控件库，"自然就长这样"
- 为什么 ratatui 和 [[bubbletea]] 是同时代两条不同路线——bubbletea 强制 TEA（Model/Update/View）架构，ratatui 只画图、不管架构，灵活但要写更多胶水
- 为什么 [[ink]]（Go 圈的 TUI 库）和 ratatui 性能拉得开——ink 走 React 风格 diff 整棵 vdom，ratatui 直接 diff 字符 buffer
- 为什么"立即模式"在 GUI 圈是少数派、在 TUI 圈是主流——终端只有几千个格子，每帧重画的成本可忽略

## 核心要点

ratatui 的设计可以拆成 **4 件事**：

1. **立即模式（immediate mode）渲染**：你不是"创建一个 Button 对象、改它的 .text"，而是每帧从 app state 重新构建整个 UI。代码长这样：

   ```rust
   loop {
       terminal.draw(|f| {
           let block = Block::default().title("Hello").borders(Borders::ALL);
           f.render_widget(block, f.size());
       })?;
   }
   ```

   每次 `draw` 都重新算一遍。控件没生命周期，状态全在你这边。

2. **Buffer 双缓冲 + diff**：内部存两张 `Buffer`（一张终端的旧状态、一张本帧新画的）。`draw` 完成后，ratatui 只把**变化的 cell** 用 ANSI 序列写到 stdout——一帧只动几个字符就只发几个字符，不重画整屏。这是它在 60 FPS 心跳下不烧 CPU 的根本原因。

3. **Layout + Constraint 约束求解**：把一块矩形按 `Length(N)` / `Percentage(N)` / `Min(N)` / `Max(N)` / `Ratio(a, b)` / `Fill(N)` 的约束切分成几块。底层是 Cassowary 风格的简化求解器（同样的算法 macOS Auto Layout 也用）。写法像这样：

   ```rust
   let chunks = Layout::default()
       .direction(Direction::Vertical)
       .constraints([Constraint::Length(3), Constraint::Min(0)])
       .split(area);
   ```

4. **Backend 三选一**：crossterm（默认，跨 Unix + Windows）/ termion（纯 Unix，零依赖）/ termwiz（wezterm 同一个作者写的，特性最全但生态小）。换 backend 改一行 `use` 不改业务代码。

## 实践案例

### 案例 1：[[gitui]] 怎么用 ratatui 画 Status 面板

gitui 的主屏分四块（Status / Diff / Log / Branches），用 `Layout` 把屏幕切成 2x2。每块是一个自定义 `Widget`，实现 `render(area: Rect, buf: &mut Buffer)` 方法——你拿到一块矩形和一张白纸，自己往上画字符。

异步部分（git fetch、blame）扔给 tokio 后台线程，结果通过 channel 推回 UI 线程；UI 线程 30ms 一个心跳重 draw。这种"后台算 + UI 立即模式"是 ratatui 应用的标准结构。

### 案例 2：[[bandwhich]] 用 Sparkline 画带宽实时图

```rust
let sparkline = Sparkline::default()
    .block(Block::default().title("rx bytes"))
    .data(&recent_bytes_per_sec)
    .style(Style::default().fg(Color::Yellow));
f.render_widget(sparkline, area);
```

`recent_bytes_per_sec` 是个滑动窗口（最近 60 秒）。每秒抓一次包、算一次和、push 进窗口、redraw。控件本身是无状态的，所有数据都在你的 `Vec<u64>` 里。

### 案例 3：最小可用骨架（30 行跑出一个空面板）

```rust
use ratatui::{prelude::*, widgets::*};
use crossterm::{event, terminal};

fn main() -> std::io::Result<()> {
    terminal::enable_raw_mode()?;
    let mut term = Terminal::new(CrosstermBackend::new(std::io::stdout()))?;
    loop {
        term.draw(|f| {
            let block = Block::default().title("hello").borders(Borders::ALL);
            f.render_widget(block, f.size());
        })?;
        if event::poll(std::time::Duration::from_millis(30))? {
            if let event::Event::Key(_) = event::read()? { break; }
        }
    }
    terminal::disable_raw_mode()?;
    Ok(())
}
```

这 20 行已经覆盖了 ratatui 应用的标准结构：raw mode 开关 / draw 闭包 / 事件 poll 心跳。所有更复杂的应用（gitui / bottom）骨架都是这个，只是 widget 多、state 大。

## 踩过的坑

1. **没有事件循环要自己写**：第一次写 ratatui 应用最容易卡的是"控件画好了，怎么响应键盘"——因为 ratatui **完全不管**。你得装 crossterm 的 `event::read()` 在另一个线程或 select! 分支里，自己决定什么时候 break、什么时候 redraw。bubbletea / Textual 这些都把这一套封死了。

2. **状态管理全靠自己**：app state 大了之后没有 store / 没有 reducer，自己用 struct + 方法管。社区有 `tui-realm`（TEA 风格封装）、`cursive`（retained 模式）这些更高层的库，但生态分裂——选 ratatui 就是选"自由 + 自己卷"。

3. **从 tui-rs 迁过来要改 import**：所有 `tui::` 改 `ratatui::`，部分 widget API 微调（如 `List` 的 `highlight_style`）。2024 年绝大多数项目已迁完，但你 fork 老仓库时仍可能踩到。

4. **immediate mode 不等于"性能免费"**：每帧重建 Layout + 重渲染 widget 仍然消耗 CPU。大表（万行）要自己做虚拟滚动，不能 naive 全画。

## 适用 vs 不适用场景

**适用**：

- Rust 写的 CLI 工具想加交互界面（监控类 / git 类 / 文件管理类）
- 已经在用 tokio / crossterm 异步栈，想要"画图层"而不是"全套框架"
- 想精确控制每个 cell 的字符 / 颜色（终端艺术、ASCII 动画、自定义图表）

**不适用**：

- 想要"一行写完一个表单"的低代码体验 → [[bubbletea]] / Textual / Ink 更省心
- 不想写事件循环 / 不想管状态管理 → 用 cursive 或 tui-realm 封装层
- 非 Rust 项目 → Go 圈 [[bubbletea]]，Python 圈 Textual，JS 圈 [[ink]]

## 历史小故事（可跳过）

- **2016 年**：Florian Dehau 看着 Python 的 urwid 想"Rust 也该有一个"，写了 tui-rs。当时 Rust 1.13，async 都还没稳定。
- **2018–2022 年**：tui-rs 是 Rust TUI 事实标准，[[bottom]] / gitui / bandwhich 全建在它上面。Florian 单人维护，提交越来越稀。
- **2023 年 2 月**：Florian 在 issue 里写 "I don't have time to maintain this anymore"。社区炸锅。
- **2023 年 3 月**：几位重度用户（包括 gitui 作者 Stephan Dilly）在 ratatui-org 开 fork，第一周合并积压 PR 200+，名字从"tui"换成"ratatui"避免和原项目混淆。
- **2024–2025**：crossterm 设为默认 backend，widgets 拆出 ratatui-widgets 子 crate，文档站 ratatui.rs 上线，stars 从 6k 涨到 20k。

## 学到什么

1. **立即模式在 TUI 是合理选择**：终端只有几千 cell，每帧重画的成本远低于"维护一棵 vdom"。GUI 圈选 retained mode 是因为 GPU + 像素多；TUI 反过来。
2. **库要不要管事件循环是哲学分水岭**：管了 → 上手快、迁移难；不管 → 上手慢、组合自由。ratatui 选了后者，bubbletea 选了前者。
3. **维护者倦怠是开源系统性风险**：tui-rs 单人维护 7 年最后停摆，下游 6k stars 项目悬空。社区接住的关键是**有几个重度下游用户愿意当新维护者**——不是所有项目都这么幸运。

## 延伸阅读

- 文档站：[ratatui.rs](https://ratatui.rs/) —— 官方教程 + 控件库 + Recipes
- 仓库：[ratatui-org/ratatui](https://github.com/ratatui-org/ratatui)
- 例子集：[awesome-ratatui](https://github.com/ratatui-org/awesome-ratatui) —— 30+ 真实项目按品类列出来
- [[bubbletea]] —— Go 圈对照组，TEA 强制架构 vs ratatui 不强制
- [[ink]] —— React 风格的 TUI（Node.js），同期另一种思路

## 关联

- [[bubbletea]] —— 同期 Go 圈 TUI 库；TEA 架构 vs ratatui 立即模式是两条路线
- [[ink]] —— React + JSX 写 CLI，diff 整棵 vdom
- [[gitui]] —— ratatui 重度用户，作者也是 ratatui-org 共同维护者
- [[bottom]] —— 系统监控 TUI，从 tui-rs 迁到 ratatui 的标志案例
- [[bandwhich]] —— 网络流量 TUI，Sparkline 控件实战
- [[dua-cli]] —— 磁盘占用 TUI，ratatui + crossterm 的最小可用样例
