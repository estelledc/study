---
title: WezTerm — Rust 写的 GPU 加速终端，配置用 Lua 还自带多路复用
来源: https://github.com/wez/wezterm
日期: 2026-05-31
分类: 命令行基础设施
难度: 入门
---

## 是什么

WezTerm 是一个**终端模拟器**（terminal emulator）——就是你每天看到的那个黑底白字、能敲命令的窗口。日常类比：终端模拟器是"打字纸"，你敲的字符在上面显示，shell（bash/zsh/fish）才是真正帮你跑命令的"秘书"。

它和 macOS 自带的 Terminal.app、iTerm2、Alacritty、Kitty 是同一类东西，都是"画字符"的窗口程序。WezTerm 选了一组挺有特色的取舍：

- 用 **Rust** 写的（性能没 GC 抖动）
- 文字渲染走 **GPU**（每一帧字都是显卡画的，所以滚日志不卡）
- 配置文件用 **Lua**（不是 yaml/toml，是真脚本，可以写函数）
- **内置多路复用**——不装 tmux 也能开 tab、分屏、远程会话挂起

一句话：把 Alacritty 的"快"、iTerm2 的"全"、tmux 的"多路复用"揉到一个跨平台二进制里。

## 为什么重要

不理解 WezTerm 的取舍，下面这些事会很困惑：

- 为什么有人说"我换了终端，cargo build 看着都快了"——其实编译没变快，是滚日志的渲染快了
- 为什么 Lua 写配置看着像炫技——其实是因为 yaml 写不出"早上用浅色主题、晚上自动换深色"
- 为什么明明有 tmux 还要"内置 mux"——跨机器场景下原生 SSH + mux 协议比层层 wrap 顺手
- 为什么 macOS / Linux / Windows 三个平台能用同一份配置——跨平台的终端模拟器其实很少

## 核心要点

WezTerm 的世界由这几个概念组成，从外到内：

1. **window（窗口）**：操作系统级别的窗口，可以多开
2. **tab（标签页）**：窗口里的标签，类比浏览器多 tab
3. **pane（面板）**：tab 内的分屏块，可以上下左右切
4. **domain（域）**：会话所在的"地方"——本地、SSH、Unix socket、串口都算一种 domain
5. **multiplexer（多路复用器）**：让会话**脱离窗口存在**的机制——关掉窗口会话还在，下次连回来继续。和 tmux 的"detach/attach"是同一类东西

特色机制：

- **GPU 渲染**：把每个字符当成图形交给显卡画。用 wgpu crate（Rust 生态的 GPU 抽象层）对接 Metal/Vulkan/DX12；也可用 OpenGL 前端，远程/弱 GPU 环境可退到 Software
- **Lua 配置**：`~/.config/wezterm/wezterm.lua` 返回一张配置表，可以写函数、监听事件
- **图片协议三件套**：iTerm2 inline、Kitty graphics、Sixel 都原生支持
- **连字（ligature）**：用 harfbuzz，让 `=>` `!=` `->` 显示成连起来的符号
- **内置 SSH**：`wezterm ssh user@host` 走自带的 libssh2，不依赖系统 ssh 命令

## 实践案例

### 案例 1：第一次启动

```bash
brew install --cask wezterm    # macOS
# 或下载 .dmg / .msi / .deb
```

1. 打开 WezTerm，默认字体偏大、配色偏暗——先别急着卸载
2. 下一步去写 `wezterm.lua`（案例 2），改 font + color_scheme 后观感会正常很多

### 案例 2：最小可用配置

`~/.config/wezterm/wezterm.lua`：

```lua
local wezterm = require 'wezterm'
local config = wezterm.config_builder and wezterm.config_builder() or {}

config.font = wezterm.font 'JetBrains Mono'
config.font_size = 14
config.color_scheme = 'Catppuccin Mocha'
config.window_background_opacity = 0.95
config.hide_tab_bar_if_only_one_tab = true

return config
```

返回值是一张 Lua 表，wezterm 启动时读它。改完保存，窗口会热重载。

### 案例 3：按系统外观切主题 + 启用 unix mux

完整可粘贴（含 mux 域；不要用并不存在的 `wezterm serve`）：

```lua
local wezterm = require 'wezterm'
local config = wezterm.config_builder and wezterm.config_builder() or {}

local function scheme_for_appearance(appearance)
  if appearance:find 'Dark' then
    return 'Catppuccin Mocha'
  end
  return 'Catppuccin Latte'
end

config.color_scheme = scheme_for_appearance(wezterm.gui.get_appearance())
config.unix_domains = { { name = 'unix' } }
return config
```

然后：`wezterm connect unix`（缺 server 时会自动拉起 `wezterm-mux-server --daemonize`）。查看会话：`wezterm cli list`；在 unix 域开窗格：`wezterm cli spawn --domain-name unix`。

## 踩过的坑

1. **Lua 上手门槛**：零基础以为会像 yaml 那么直白，结果第一次改配置查了半小时文档。值得花一晚上学 Lua 表语法
2. **默认外观不讨喜**：字号、字距、配色都偏开发者审美。改完 font + color_scheme 之后才正常
3. **GPU 在远程 X11 / 虚拟机里退化**：通过 X-forwarding 或在 VM 里跑时，GPU 优势消失，OpenGL fallback 反而比纯 CPU 终端慢
4. **mux 协议跨版本不兼容**：服务端和客户端版本差太多连不上；brew 自动升级后可能突然连不上自己开的 daemon
5. **Windows ConPTY 历史 bug**：早期版本偶发换行吞字、光标错位，新版好多了但仍偶发

## 适用 vs 不适用场景

**适用**：

- 跨平台一致体验——macOS / Linux / Windows 用同一份 Lua 配置
- 字体连字、emoji、CJK 字符都要好看
- 想要内置 multiplex 但不想装 tmux/zellij
- 想要程序化配置（按时间/项目/主机切主题、键位）

**不适用**：

- 只用 macOS + 已经习惯 iTerm2，迁移收益小
- 极简主义——只要"画字符的窗口"就够，Alacritty 更对味
- 不愿学 Lua——改个配置都觉得累
- 主力机器没像样 GPU（远程 X11 / 老虚拟机）

## 替代品对比

- **Alacritty**：同样 Rust+GPU 但极简——不带 tab、不带 mux、yaml 配置。"快但少"
- **Kitty**：C+Python，性能接近，Python 配置；macOS/Linux 体验好但 Windows 缺席
- **iTerm2**：仅 macOS，特性最齐；不跨平台
- **tmux + Alacritty**：把 mux 拆出来，组合更纯粹但要多装一层

经验法则：跨三平台选 WezTerm；只用 macOS + 已配好 iTerm2 留着用；要极致性能选 Alacritty + tmux。

## 学到什么

1. **GPU 渲染文本**是过去十年终端模拟器的范式转移——Alacritty 起头，Kitty 跟进，WezTerm 把它做成跨平台默认
2. **Lua 当配置语言**：比 yaml 灵活十倍，比写真插件门槛低十倍，是个被低估的中间形态
3. **跨平台一致体验**值钱——一套配置三处用，远超"在每台机器上重新配"的成本
4. **把多个工具揉一锅**（终端 + mux + SSH 客户端）是产品取舍——你失去模块化，换来开箱即用

## 历史小故事（可跳过）

- **2018 年**：Wez Furlong（彼时 Facebook 工程师）开始写 WezTerm，名字就是 Wez+Term
- **2019 年**：第一个公开版本，OpenGL 渲染
- **2020 年**：加入 multiplexer server 模式
- **2022 年**：加入 wgpu / WebGpu 前端（与 OpenGL 并存，默认曾在两者间切换）
- **现在**：GitHub 2 万+ star，是 macOS 上 iTerm2 的主要跨平台替代候选

## 延伸阅读

- 官方仓库：[wez/wezterm](https://github.com/wez/wezterm)
- 官网与文档：[wezterm.org](https://wezterm.org/)（Lua API 参考很全）
- 多路复用：[wezterm.org/multiplexing.html](https://wezterm.org/multiplexing.html)
- Lua 配置入门：[wezterm.org/config/files.html](https://wezterm.org/config/files.html)
- [[zellij]] —— Rust 写的多路复用器，对照组
- [[tmux]] —— 30 年老牌 multiplexer

## 关联

- [[zellij]] —— 同样 Rust 写的 mux，但只做 mux 不画像素
- [[tmux]] —— 经典多路复用器，WezTerm 内置 mux 时常被对比
- [[nushell]] —— 同样用 Rust 重写老工具的代表，设计取舍对照
- [[kitty]] —— 另一款 GPU 终端，配置语言与平台覆盖对照
- [[warp]] —— 另一款现代终端产品，功能打包与跨平台取舍对照
- [[starship]] —— 跨 shell 提示符，常和 WezTerm 一起配出统一开发环境

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
