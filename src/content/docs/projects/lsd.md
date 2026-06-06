---
title: lsd — 现代 ls 替代（LSDeluxe，主题化 + 图标，不押 git）
来源: 'https://github.com/lsd-rs/lsd'
日期: 2026-05-30
子分类: 命令行工具
分类: CLI
难度: 初级
provenance: pipeline-v3
---

## 是什么

lsd（**LSDeluxe**）是 **2018 年 Peltoche 用 Rust 写的现代 ls 替代**——把"ls 黑白一锅粥"升级成"彩色 + 图标 + 树视图 + YAML 主题"，单二进制跨 macOS/Linux/Windows。和 [[eza]] 同代但走不同路线：lsd 主打**主题化 + 跨平台稳定**，不内置 git 集成。

日常类比：

- **ls 是手抄目录清单**——文件名一行一个，黑白，没有任何上下文
- **lsd 是带图标的彩色目录牌 + 你自己的便签笔**——图标提示文件类型，颜色你自己用 YAML 定义（蓝色目录 / 红色压缩包 / 绿色可执行随你写）
- **eza 是同款目录牌但带 git 状态贴纸**——eza 押 git 列，lsd 押"主题随便改"

你在终端 `ls -l` 看一片单色文字；换成 `lsd -l --icon always`，瞬间得到带图标和分类颜色的目录视图，**而且颜色规则全是你 YAML 配的**，不是程序写死的。

```bash
# 装好后最小试用
brew install lsd
lsd -l --icon always   # long 视图 + 强制开图标
```

## 为什么重要

不只是"另一个 ls 替代"，它代表了 CLI 工具的一种设计选择：

- **主题化 = 你的颜色你做主**——lsd 把所有颜色 / 图标 / 排序规则交给 YAML，eza 是写死风格 + 少量主题；适合喜欢折腾配色的人
- **不绑定 git = 跨场景稳定**——容器里、远程服务器上、非 git 目录里跑 lsd 不会因为找 git 失败变慢；eza `--git` 在大仓库会慢
- **比 eza 早 4 年 = dotfiles 老牌选择**——很多 2019-2021 年的 dotfiles 模板默认推 lsd，是工具迭代史的"前一代"
- **它和 [[bat]] / [[fd]] / [[ripgrep]] / [[eza]] 是同代套件**——Rust 现代 CLI 工具链的"ls 那块"，lsd 是更老的那个分支

## 核心要点

lsd 的设计可以拆成 **3 件事**：

1. **一次扫描多种视图**：`lsd` 一次跑就把 stat / 扩展属性都拿了，再用同一份元数据渲染 grid（默认）、long（`-l`）、tree（`--tree`）。换视图不需要重读磁盘——和 eza 同思路。

2. **三个 YAML 文件分管三件事**：`config.yaml` 管行为（默认 flag、是否开图标），`colors.yaml` 管 ANSI 颜色（每种文件类型对应哪个 256 色码），`icons.yaml` 管图标（每种扩展名对应哪个 Nerd Font 码点）。三个文件分开是为了"只想换主题不想换行为"——但这也是新人最容易改错文件的地方。

3. **不押 git = 故意的留白**：作者明确不加 git 集成，理由是"基础工具应该轻量、跨场景稳定"。要看 git 状态就跑 `git status`——这是和 [[eza]] 最大的设计分歧。

三件事合起来，lsd 的定位是"**好看 + 可定制 + 永远能跑**"——它没赌"git 集成是 ls 的未来"，押的是"主题化和跨平台一致"才是 ls 该补的洞。

## 实践案例

### 案例 1：日常 ll 别名替代 ls

```bash
alias ls='lsd'
alias ll='lsd -l --group-dirs first'
alias la='lsd -la --group-dirs first'   # 含隐藏文件
alias lt='lsd --tree --depth 2'         # 树视图，限 2 层
```

`-l` 是 long 视图，`-la` 加隐藏文件，`--group-dirs first` 把目录排前面。`--tree --depth 2` 只展开 2 层（避免在 monorepo 里展成 10 屏）。日常 `ll` 一打就是带图标和颜色的目录视图，`lt` 替代 tree 命令——四条 alias 就把 ls/tree 都换掉了。

注意：**`alias ls=lsd` 在脚本场景会炸**（见踩坑 2），生产 dotfiles 建议只在 interactive shell 设。

### 案例 2：自定义 colors.yaml 主题

```yaml
# ~/.config/lsd/colors.yaml
user: 230
group: 187
permission:
  read: dark_green
  write: dark_yellow
  exec: dark_red
date:
  hour-old: 40
  day-old: 42
  older: 36
```

把这个文件丢到 `~/.config/lsd/colors.yaml`，下次跑 lsd 颜色立刻变——读权限是绿色、写是黄色、执行是红色，比默认主题更直观。256 色码可以查表（`echo -e "\e[38;5;230mhello"` 试色）。eza 也支持 theme.yml 但晚 lsd 几年；这是 lsd 的传统强项。

### 案例 3：tree 视图替代 tree 命令

```bash
lsd --tree --depth 3 --ignore-glob 'node_modules' --ignore-glob 'dist'
```

`--tree` 树视图，`--depth 3` 展开 3 层，`--ignore-glob` 跳过指定 glob（可重复）。比 [[eza]] 的 `--git-ignore` 笨一点（要手动列要忽略的目录），但**胜在不依赖当前在 git 仓库里**——容器里 / 解压的代码目录里都能跑。

输出（截取前几行）：

```
 src
├──  content
│   └──  docs
└──  components
    └──  Button.tsx
```

颜色 + 图标加持下，结构一眼可见。

## 踩过的坑

1. **icons 显示成方框 / 问号**——Nerd Font 没装，终端字体没图标。先装 [Nerd Fonts](https://www.nerdfonts.com/)（推荐 JetBrainsMono Nerd Font），iTerm/Terminal.app 切字体，再用 `--icon always`。这一步是 100% 新人会卡的地方，和 [[eza]] 一样。

2. **`alias ls=lsd` 让脚本炸**——`ls` 在 shell 脚本里被当默认调用，lsd 输出（颜色码 / icons）会让 `ls foo | wc -l` 这种解析挂掉。**正确做法**：alias 只在 interactive shell 设（`if [[ $- == *i* ]]`），或者用 `ll` 这种新别名，留 `ls` 给脚本。

3. **没 git 集成——别等了**——你想 `lsd --git` 看 git 状态？没有，lsd 作者不打算加。要看就 `git status` 或换 [[eza]]。这是设计哲学差异，不是缺失。

4. **三个 YAML 文件改错地方**——颜色不生效大概率是改了 `icons.yaml` 而不是 `colors.yaml`；或者 YAML 缩进错（YAML 对空格敏感）。`lsd --classic` 临时关所有定制对照看默认输出，再回头查配置。

## 适用 vs 不适用场景

**适用**：

- 喜欢折腾终端配色的人——lsd 的 YAML 主题比 eza 灵活
- 经常在容器 / 远程服务器 / 非 git 目录里工作——lsd 不依赖 git，跑哪都稳
- dotfiles 高频别名（`ll` / `tree`）——一行 alias 升级整个终端体验
- 跨平台需要统一行为——lsd 在 macOS / Linux / Windows 表现一致
- 教学场景给新人看目录结构——图标 + 颜色比纯文本对零基础友好得多

**不适用**：

- 重度依赖 git 状态——直接用 [[eza]] 的 `--git` 列，省事
- shell 脚本 / 自动化场景——保留系统 ls，输出格式稳定
- 极简环境（Alpine 容器、busybox 系统）——lsd 二进制 ~5 MB，没必要
- 终端字体不支持 Nerd Font——icons 退化成方框，体验崩
- 老终端（PuTTY / KiTTY / Konsole 旧版）——图标渲染会截字

## 历史小故事（可跳过）

- **2018 年**：Peltoche（Pierre Peltier）发起 lsd，灵感来自 Ruby 的 colorls（图标 + 颜色但慢），用 Rust 重写后单二进制 + 快得多
- **2019-2020**：lsd 进入 brew/apt/pacman/AUR，dotfiles 模板开始默认推它，star 数从几千升到 8k+
- **2022 年 8 月**：[[eza]] 作为 exa 的社区 fork 出现，主打 git 集成；lsd 和 eza 此后分流（lsd 主题化派，eza git 派）
- **2024 年起**：Peltoche 退居二线，社区维护者 Pochi 主导日常发版
- **2025 年 10 月**：v1.2.0 发布，项目进入稳定期，新功能放缓，主要做长尾完善（YAML 配置补全、终端兼容修复）

lsd 是"早期独立项目—被同类后起者分流—进入稳定期"的经典曲线——和 [[eza]]/exa 故事相似但角色互换：**lsd 是先来的**，eza 是后来者带新卖点抢一部分用户走。

## 学到什么

1. **CLI 工具的"留白"也是设计**——lsd 不加 git 是故意的，理由是"轻量 + 跨场景稳定"；不是所有功能都要堆，留白本身有价值
2. **配置文件分层是双刃剑**——三个 YAML 拆得清晰但新人容易改错；和"一个大配置 vs 多个小配置"的取舍是永恒话题
3. **同代竞品分流是正常生态**——lsd vs [[eza]] vs colorls 不是谁干掉谁，而是各占细分（主题派 / git 派 / Ruby 派）；用户按口味选
4. **Rust CLI 套件的护城河是单二进制**——brew install 一行，不依赖运行时，这是 lsd/eza/bat/fd/ripgrep 共同的传播加速器

## 延伸阅读

- 官方 README：[github.com/lsd-rs/lsd](https://github.com/lsd-rs/lsd)（含安装指南、配置说明）
- Nerd Fonts 安装：[nerdfonts.com](https://www.nerdfonts.com/)（不装这个 `--icon always` 就废了）
- 配置文件示例：[github.com/lsd-rs/lsd#config-file-content](https://github.com/lsd-rs/lsd#config-file-content)（colors/icons/config 三件套）
- lsd vs eza 对比讨论：搜 "lsd vs eza reddit"，社区帖很多角度（git 派 vs 主题派）
- colorls 原版：[github.com/athityakumar/colorls](https://github.com/athityakumar/colorls)（lsd 的灵感来源，Ruby 写的）

## 关联

- [[eza]] —— 同代竞品现代 ls 替代；eza 押 git，lsd 押主题化，2022 年后分流
- [[bat]] —— 现代 cat 替代；和 lsd 是同一脉，把"颜色 + 图标"塞进基础命令
- [[fd]] —— 现代 find 替代；David Peter 写的，和 lsd 常一起出现在 dotfiles
- [[ripgrep]] —— 现代 grep 替代；Rust CLI 套件的"搜索那块"
- [[fzf]] —— 命令行模糊查找；和 lsd 配合做交互式目录预览（`fzf --preview 'lsd --tree {}'`）
- [[claude-code]] —— 终端 AI 助手；和 lsd/eza/bat 同属"终端体验现代化"工具链不同层

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[bat]] —— bat — 现代 cat 替代
- [[broot]] —— broot — 把 tree 命令升级成会过滤、能 cd、显大小、看 git 的交互树
- [[claude-code]] —— Claude Code — Anthropic 终端编程助手
- [[eza]] —— eza — 现代 ls 替代（exa 的社区接管 fork）
- [[fzf]] —— fzf — 命令行模糊查找
- [[ripgrep]] —— ripgrep — Rust 写的现代 grep
- [[sd]] —— sd — 直觉语法的 sed 替代品（Rust 写的 find-and-replace）

