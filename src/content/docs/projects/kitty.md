---
title: kitty — GPU 加速终端，把分屏和图片协议焊在一个二进制里
来源: https://github.com/kovidgoyal/kitty
日期: 2026-05-31
分类: CLI 工具
难度: 入门
---

## 是什么

**kitty** 是一个跨平台的终端模拟器，用 C + Python 写成，在 GitHub 拿了 33k 星。

日常类比：传统终端像一台老式电视，CPU 是它的显像管，每画一个字都得它亲自描；kitty 把活儿丢给显卡（GPU），显卡平时就是画游戏画面的，画几千个字符不在话下。

它的不同点是把三件平时要装三个工具才能做的事，焊在了一个二进制里：

1. **终端模拟器**（画字符、跑 shell）
2. **multiplexer**（一个窗口里开多个分屏 / tab，传统得另装 tmux）
3. **图片协议**（终端里直接显示 PNG / SVG / matplotlib 图，传统得用 iTerm2 的 imgcat hack）

作者是 Kovid Goyal，也是电子书管理软件 Calibre 的作者。许可证 GPLv3。

## 为什么重要

不理解 kitty，下面这些观察都说不通：

- 为什么 4K 屏 / 高刷屏上滚日志，iTerm2 / 系统终端会卡，kitty 不卡——因为它**用 GPU 画字符**
- 为什么有人说 "我装了 kitty 之后 tmux 就卸了"——因为 kitty 自带 multiplexer
- 为什么 nvim 里能直接看图片预览（image.nvim 插件）——靠的就是 kitty 的图形协议
- 为什么 2024 年 ghostty 一出现就被拿来跟 kitty 比——因为它们都属于 "GPU 终端 + 富功能" 这一派

学一次 kitty，相当于一口气搞懂 "终端为什么越来越像 IDE" 这件事。

## 核心要点

kitty 的架构可以拆成三层：

1. **底层 C 代码**（约 60%）：负责跟操作系统打交道——开 PTY（伪终端）、跟 GPU 通过 OpenGL 通信、解析终端控制序列。这层追求快。

2. **中层 GLSL**（约 5%）：着色器代码，告诉 GPU "怎么画一个字符"。每个字符在 GPU 看来就是一个贴着字形纹理的小矩形。

3. **上层 Python**（约 35%）：写配置、写 kittens（小工具）、写远程控制逻辑。这层追求灵活。

中间还有两个关键概念：

- **kittens**：kitty 自己的 "插件" 机制。每个 kitten 是一段 Python 脚本，跑在子进程里，通过 socket 跟主进程对话。比如 `kitty +kitten ssh` 就是一个内置 kitten。
- **图形协议**（kitty graphics protocol）：一套约定好的 escape sequence（终端控制字符序列），让任何程序都能告诉终端 "请在这个位置画这张 PNG"。nvim、mpv、matplotlib 都已经适配。

## 实践案例

### 案例 1：替代 tmux 的原生分屏

```bash
# 在当前 tab 横向分屏
ctrl+shift+enter
# 切换 layout（堆叠 / 平铺 / fat / tall）
ctrl+shift+l
# 新开 tab
ctrl+shift+t
```

不装 tmux，不写 `.tmux.conf`，开箱就有分屏。代价：远程 ssh 时需要把 multiplexing 跟 ssh session 解耦——这是 kitty 的弱项，tmux 在这点更成熟。

### 案例 2：终端里直接看图

```bash
# 内置 icat kitten：把 PNG 画进终端（最稳的路径）
kitty +kitten icat photo.png

# matplotlib 默认仍可能弹外部窗口；要终端内嵌需显式走 kitty 后端，例如：
#   pip install matplotlib
#   然后在代码里用 kitty 兼容后端，或先存成 PNG 再 icat
python -c "import matplotlib.pyplot as plt; plt.plot([1,2,3]); plt.savefig('/tmp/p.png')"
kitty +kitten icat /tmp/p.png
```

第一行是开箱即用的看图方式。matplotlib 想"直接 `plt.show()` 画进终端"需要额外配置后端，**不是装了 kitty 就自动生效**。

### 案例 3：用配置实现自定义快捷键

`~/.config/kitty/kitty.conf`：

```conf
font_family       JetBrains Mono
font_size         14
background_opacity 0.9
map ctrl+shift+e launch --type=tab
```

注意配置语法**不是 yaml / toml**，是 kitty 自家的简化格式（key value，井号注释）。从 alacritty.toml 迁移时容易踩。

## 踩过的坑

1. **kittens 远程时权限问题**：通过 ssh 用 `kitty +kitten` 时，子进程通过 socket 找主进程，远端权限链一断就报错。修法是先用 `ssh -t` 强制分配 PTY。

2. **Wayland 上偶发渲染 bug**：Linux Wayland 早期版本下偶尔字符错位 / 闪烁。X11 更稳，遇到问题先回退试试。

3. **图片协议的兼容性陷阱**：你以为开了图形协议就能在 nvim 里看图——其实 nvim 还需要装 image.nvim 插件，并且依赖 ImageMagick。光装 kitty 不够。

4. **配置文件不是 toml**：从 alacritty / wezterm 迁移过来的人最容易踩，把 `font_family = "..."` 写成 `font_family "..."`（kitty 不要等号）。

## 适用 vs 不适用场景

**适用**：

- 4K / 高刷屏用户，对滚屏流畅度敏感
- 想用一个工具替代 "alacritty + tmux + imgcat" 三件套
- 数据科学 / 机器学习场景（matplotlib / 图片输出多）
- Linux + macOS 双平台，且对一致性有要求

**不适用**：

- 只用 macOS 且依赖 iTerm2 老插件生态（Shell Integration、Hotkey Window 等）
- Windows 用户（kitty 不支持 Windows 原生，得走 WSL）
- 需要稳定 ssh + 远程 multiplexing 的服务器运维场景（tmux 仍然更稳）
- 公司 IT 严格管控的环境，装非签名二进制困难

## 生态位

GPU 终端这条赛道目前是四足鼎立：

- **alacritty**（Rust）：极简派，只做渲染，分屏靠 tmux
- **kitty**（C+Python）：富功能派，把分屏和图片焊进来
- **wezterm**（Rust）：跟 kitty 最像的对手，Lua 配置
- **ghostty**（Zig，2024 新出）：主打 native 体验，分屏起步晚

kitty 在 "图形协议" 上是先发者（2018 年），其他几家或多或少都在跟它的协议兼容。

## 历史小故事（可跳过）

- **2017 年**：Kovid Goyal 自己 4K 屏上用 iTerm2 觉得滚屏卡，本着 "不爽就自己写" 的精神动手做了 kitty。第一版只有渲染，没有 multiplexer 也没图片协议。
- **2018 年**：Kovid 发布 kitty graphics protocol，把 "在终端里画图" 这件事从 iTerm2 私有方案推成开放协议。两年后 wezterm 跟进兼容。
- **2020 年**：multiplexer 功能（tab + window + layout）成熟，开始有用户公开说 "卸了 tmux"。
- **2024 年**：ghostty 发布，"GPU 终端" 类目从三足变四足。kitty 因为 GPLv3 + Python 上层的设计选择，社区相对其他几家更稳定但生长更慢。

作者 Kovid Goyal 是个特殊存在：他单人维护 Calibre（电子书管理）+ kitty 两个大项目超过十年，靠开源捐赠和 Calibre 商业版生存。kitty 的代码风格、文档风格都明显带他个人印记——务实、反对花哨、不接 PR 容易留下争议。

## 学到什么

1. **GPU 不是只能画游戏**：把字符当贴图扔给 GPU，终端就能在 4K 屏流畅滚日志
2. **multiplexer 内嵌的代价**：tmux 解耦得好，远程稳；kitty 内嵌简单，但 ssh 场景吃亏
3. **协议比工具更长寿**：kitty 写出图形协议后，就算 kitty 不流行了，协议本身还会被 wezterm / ghostty 复用
4. **C + Python 的搭法**：底层追求快用 C，上层追求灵活用 Python，是一类工具的经典分工

## 延伸阅读

- 官方文档：[sw.kovidgoyal.net/kitty/](https://sw.kovidgoyal.net/kitty/)
- 图形协议规范：[sw.kovidgoyal.net/kitty/graphics-protocol/](https://sw.kovidgoyal.net/kitty/graphics-protocol/)
- 写 kittens 教程：[sw.kovidgoyal.net/kitty/kittens/custom/](https://sw.kovidgoyal.net/kitty/kittens/custom/)

## 关联

- [[wezterm]] —— Rust 写的同类对手，Lua 配置 vs kitty.conf
- [[tmux]] —— kitty 想替代的对象，但远程场景仍然更稳
- [[warp]] —— 另一种 "终端越来越像 IDE" 的实现思路（AI 命令补全派）
