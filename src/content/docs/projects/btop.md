---
title: btop — bashtop 三代 C++ 版，五面板一屏的彩色资源监控器
来源: https://github.com/aristocratos/btop
日期: 2026-05-30
分类: CLI
难度: 入门
---

## 是什么

btop 是 **Aristocratos 用 C++ 写的终端资源监控器**，把 CPU / 内存 / 磁盘 / 网络 / 进程**五个面板塞进一屏**——每块都有自己的彩色边框、独立的图形曲线、可缩可隐。它和 [[htop]] 是一类东西，但走的不是"top 加点交互"的克制路线，而是"把仪表盘做到极致花哨"。

日常类比：

- **htop 是车里的转速表**——只盯一根针，简洁好读
- **btop 是飞机驾驶舱**——CPU 一片仪表、内存一片仪表、网络一片仪表、磁盘一片仪表、进程一大列表，全部同屏

它最显眼的视觉特征是**用 Unicode 盲文字符（U+2800-U+28FF）画曲线**——盲文一格里有 2×4 八个点位，密度比方块或半角字符高一个量级，画 CPU 占用率曲线时近乎像素级，远看就是一条平滑波形。这套花哨视觉是它和 htop 拉开差距的地方。

## 为什么重要

不只是"htop 的彩色升级版"，它换了一种"资源监控"的思维：

- **五面板同屏** —— CPU 飙升时同时看到网络出口跑满，不用 htop + iftop 分两个 tmux 窗
- **全鼠标可点** —— 任何高亮键、任何菜单项、任何排序列头都能点；在不熟键盘的 Linux 用户里很受欢迎
- **GPU 监控合一** —— Linux 上挂 NVIDIA / AMD / Intel 三家驱动 SDK，把 nvtop / radeontop 的活也接了
- **自带主题系统** —— `~/.config/btop/themes/` 放 `.theme` 文件，下载就能换 dracula / solarized / TTY 等几十套

很多人装 btop 不是因为功能更强，是**因为它好看**——这是后 htop 时代第一个公开承认"美观也是工具价值"的系统监控器。

## 核心要点

btop 的设计可以拆成 **4 件事**：

1. **盒线分割面板**：屏幕被切成 5 块独立 box，每块有边框、标题、可独立缩放隐藏。按 `1/2/3/4` 切换显示哪些面板，按 `+/-` 调每块的高度比例——比 htop 那种"一栏到底"灵活得多。

2. **盲文曲线**：CPU 历史负载、网络吞吐、磁盘 IO 全用盲文字符（每格 2×4 = 8 个点）画。比 htop 的方块条形图密度高一个量级——同样宽度能看到 4 倍历史数据。也是它最容易出"曲线变方块"故障的原因（终端字体没盲文）。

3. **平台抽象层**：核心只画 UI，数据从 `src/<platform>/` 读：Linux 走 `/proc` + `/sys`，macOS 走 Mach API，FreeBSD 走 sysctl。GPU 部分单独包了 NVIDIA-ML / ROCm-SMI / Intel sysfs。这套抽象让它跨 4 种 Unix 还都能跑。

4. **配置即文件**：所有显示选项、面板布局、颜色、键位都写在 `~/.config/btop/btop.conf`——纯文本 KEY=VALUE 格式，可以提交进 dotfiles 团队共享。改完不用重启，btop 监听文件变化热加载。

## 实践案例

### 案例 1：五面板一屏排查全机问题

```bash
btop
# 启动后默认就是五面板：CPU / MEM / NET / DISK / PROC
# 按 1/2/3/4 切换隐藏面板（1=CPU, 2=MEM, 3=NET, 4=DISK）
```

某服务突然变慢，打开 btop——CPU 曲线飙到 95%、网络出口同时跑满 1Gbps、进程区某个 Node 进程吃了 70% CPU。三秒就看清"是这个进程在传大数据"，不需要切 htop 看 CPU、再切 iftop 看网络、再 ps 找进程。

### 案例 2：换显示符号和颜色

```bash
btop
# 按 m 循环切换 CPU / 网络的 graph 符号：
#   braille（盲文，最密集）→ block（方块）→ tty（最简单 +/- 字符）
# 按 c 进 options 菜单 → Themes → 选 dracula / matrix / TTY
```

终端字体不支持盲文（曲线变方块）时按 `m` 切到 `tty` 就好。SSH 进生产机或者老服务器只有 vt100 终端时，`tty` 模式才是能看的那个。

### 案例 3：把配置塞进 dotfiles

```bash
btop  # 按 c 进菜单调好布局、主题、字段后，配置自动写到下面
cat ~/.config/btop/btop.conf | grep -v '^#' | grep -v '^$'
# theme_background = False
# truecolor = True
# vim_keys = True
# proc_tree = True
# ...

# 提交到 dotfiles
cd ~/dotfiles && cp ~/.config/btop/btop.conf btop/
git add btop/btop.conf && git commit -m 'sync btop config'
```

新机器克隆 dotfiles 拷回去就直接复用了；和 [[fzf]] / [[zoxide]] / [[bat]] 走的是同一套 dotfiles 思路。

## 踩过的坑

1. **终端字体没盲文字符 → 曲线变方块或问号**：作者 README 明说 这不是 btop 的 bug 是终端字体问题。常见在 macOS 默认 Menlo / 老 iTerm 上。修复：换 Hack Nerd Font / FiraCode Nerd Font，或 `m` 键切到 `block` / `tty` 模式

2. **macOS 上要 sudo 才能看全部进程和温度**：默认非 root 启动只看到自己 shell + 一两个进程。homebrew 装的版本默认已经签好 task_for_pid 权限；自编译的要手动 codesign 加 entitlements。否则 btop 启动后进程区只有寥寥几行

3. **GPU 面板只在 Linux 工作**：macOS / BSD 上 GPU 面板永远空白——不是 bug 是平台限制（Apple 没开放 Metal 性能计数器给非系统进程）。Linux 上还要装 NVIDIA-ML / rocm-smi-lib，缺驱动 SDK 编译时 GPU 模块会被禁用

4. **启动占内存比 htop 大一个量级**：htop 跑起来 1-3 MB RES，btop 通常 10-30 MB（盲文渲染缓存 + GPU 探测）。低内存嵌入式机器（树莓派 zero、OpenWrt 路由器）上跑会被 OOM 干掉，那种地方还是用 htop 或 `top`

## 适用 vs 不适用场景

**适用**：

- 桌面 / 笔记本 / 工作站终端 —— 喜欢花哨界面又想看全机指标
- 日常排查多维度问题 —— CPU + 网络 + 磁盘 + 进程一屏看完
- Linux GPU 服务器临时看显卡负载 —— 不用专门装 nvtop
- dotfiles 默认装一份 —— 配置可分享，团队风格统一
- 写截图 / 录屏给别人演示性能问题 —— 视觉效果远好过 htop

**不适用**：

- 低内存机器（< 256 MB） —— 启动就吃十几 MB，可能直接 OOM；用 [[htop]] 或 `top`
- 老 vt100 / SSH 哑终端 —— 没 256 色没 Unicode，btop 全废；用 `top -H`
- 程序化采集指标 —— btop 没 batch 模式，要数据用 [[prometheus]] node-exporter 或 `cat /proc/loadavg`
- 容器内诊断（distroless 镜像）—— C++ 二进制 + 一堆运行时依赖装不进去；用 `kubectl top` / `crictl stats`
- 远程上千台机器统一监控 —— 别 SSH 进去开 btop，用 [[prometheus]] + [[grafana]]

## 历史小故事（可跳过）

- **2020 初**：Aristocratos 写出 **bashtop** —— 纯 Bash + tput，惊人地能跑但慢得离谱（一次刷新数百毫秒）。GitHub 一周涨了几千 star，证明 终端炫酷监控 是真有人买账
- **2020 5 月**：用 Python 重写成 **bpytop** —— 速度快了 5 倍，但仍受 GIL 拖累，加 GPU / 复杂图形时卡顿
- **2021 4 月**：用 C++ 第三次重写成 **btop** —— 再快一个量级，启动毫秒级，原生 `epoll` 抢断 IO；这一代正式破圈
- **2022-2024**：社区贡献加 GPU 监控（Linux 三家显卡）、扩 BSD 支持（FreeBSD / NetBSD / OpenBSD）、出 btop4win 独立 Windows 端口
- **特别之处**：三代版本同一个作者、几乎同样的逻辑，**纯靠"换语言越写越快"演化**——这种愿意一遍遍重写的耐心在开源界少见

## 学到什么

1. **美观本身是工具价值**——btop 没比 htop 多解决什么本质问题，但靠"五面板 + 盲文曲线 + 主题"在后 htop 时代杀出位置；好看让人想用
2. **重写不是失败而是优化**——bashtop → bpytop → btop 三次重写在工程界常被嘲笑"不务正业"，但每次都换来 5-10 倍性能；同一作者愿意推倒重来，是少有的纪律
3. **平台抽象 + 模块化是跨平台关键**——核心只画 UI，数据层 Linux / macOS / BSD 各写一份；GPU 也是独立模块，缺驱动就关掉。这种结构让它能稳定跨 4 种 Unix
4. **配置可分享是用户黏性的根**——和 [[fzf]] / [[zoxide]] / [[htop]] 一样，btop.conf 一行行 KEY=VALUE 进 dotfiles，新机器一拷就回到熟悉布局；用一次回不去
5. **盲文字符是被低估的渲染密度技巧**——一个盲文字符 8 个点位，比方块字符密 4 倍；同样思路也用在 spotify-tui / lazygit 等其他 TUI 项目里，是 ncurses 时代的隐藏小聪明

## 延伸阅读

- 官方 README：[github.com/aristocratos/btop](https://github.com/aristocratos/btop)（含截图、键位速查、主题列表）
- 主题画廊：[github.com/aristocratos/btop/tree/main/themes](https://github.com/aristocratos/btop/tree/main/themes)（数十款官方主题，下载到 `~/.config/btop/themes/` 即可）
- 同类对比：搜 "btop vs htop"——大多数评测结论是 看着花就用 btop，看着稳就用 htop
- 三代演化：作者在 bashtop / bpytop README 里写过为什么再重写一次的动机，值得回顾

## 关联

- [[htop]] —— 同类祖师爷，更克制更轻量；btop 是它的视觉继任者
- [[bat]] —— 终端体验现代化的另一支；和 btop 同属"老命令配新外观"流派
- [[fzf]] —— 模糊查找；和 btop 共享"配置即 dotfiles"思路
- [[broot]] —— 文件树 TUI；和 btop 同走"ncurses + 多面板"路线
- [[prometheus]] —— 历史指标体系；btop 看实时 1 秒级，prometheus 看分钟到天
- [[grafana]] —— 可视化面板；btop 是单机版"驾驶舱"，grafana 是集群版
- [[zoxide]] —— 同样靠"装一行回不去"建立黏性

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[bandwhich]] —— bandwhich — 按进程实时显示带宽占用的跨平台 TUI
- [[bottom]] —— bottom — Rust 写的跨平台终端进程监控（widget 自由拼）
- [[dua-cli]] —— dua-cli — Rust 写的并发 du 替代，按 i 进交互模式当场把大文件扔进废纸篓
- [[duf]] —— duf — df 的彩色表格替代，按设备分组自动忽略伪文件系统
- [[fx]] —— fx — JSON 的交互式查看器（jq 的 TUI 表亲）
- [[gdu]] —— gdu — Go 写的并发 du 替代，单二进制扔到服务器扫满盘几秒钟出 TUI
- [[gitui]] —— gitui — Rust 写的 git TUI，libgit2 直连让启动比 lazygit 快一个量级
- [[glances]] —— Glances — Python 写的全栈系统监控（终端 + Web + REST + 远程）
- [[lazydocker]] —— lazydocker — Go 写的 Docker TUI，五面板看容器 / 镜像 / 网络 / 卷
- [[lazygit]] —— lazygit — Go 写的全功能 git TUI，键盘驱动 stage / rebase / cherry-pick
- [[ncdu]] —— ncdu — du 的交互式 TUI，扫一次就能在终端里上下键钻目录删大文件
- [[procs]] —— procs — ps 的现代替代，彩色 + 树视图 + 多列搜索
