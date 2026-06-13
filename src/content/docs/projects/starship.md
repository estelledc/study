---
title: Starship — 一份配置点亮所有 shell 的 prompt
来源: https://github.com/starship/starship
日期: 2026-05-31
子分类: DevOps 与运维
分类: 基础设施
难度: 入门
provenance: pipeline-v3
---

## 是什么

Starship 是一个**跨 shell 的命令行提示符（prompt）生成器**。日常类比：你家里有 bash、zsh、fish、PowerShell 四个不同牌子的灯，每个都有自己的开关面板。Starship 是一个统一的"智能灯控"——你只在一张面板（`starship.toml`）上写一次"灯怎么亮"，四个房间的灯就同步变化。

具体它做的事：

```
~/code/study  master ?2 !1 󰏗 v20.11.0  
❯
```

这一行就是 starship 渲染出来的 prompt。你能从中看到：

- 当前目录 `~/code/study`
- git 分支 `master`、未跟踪 2 个、修改 1 个
- Node.js 版本 `v20.11.0`
- 用 Rust 写、单二进制、启动到打印 < 200ms

你只需要在 shell 启动时加一行 `eval "$(starship init zsh)"`，原本朴素的 `$` 就升级成上面那种富信息行。

## 为什么重要

不用 starship 的痛点：

- 在公司用 zsh、家里用 fish、服务器只有 bash → 三套 prompt 配置语法不通用
- 想加"显示当前 git 分支"，每个 shell 写法不同（zsh 用 vcs_info、bash 要拼 PROMPT_COMMAND）
- powerlevel10k 只服务 zsh，oh-my-zsh 同理；想换 shell 就要全部重学
- 自己写 PROMPT 函数，每多加一个模块就慢 50ms，最后 prompt 变成"按回车要等半秒"

starship 把这堆问题一次解决：

1. **一份 `starship.toml` 配置走天下**：bash / zsh / fish / PowerShell / nushell / cmd 全部读同一份
2. **快**：Rust 单二进制，所有模块带超时（默认 500ms）防慢命令拖累
3. **模块化**：100+ 模块（语言版本 / 云上下文 / k8s namespace / 电池 / 任务时长）按需开关

## 核心要点

理解 starship 只要抓三件事：

1. **它是个外挂程序，不是 shell 插件**：shell 每次准备显示 prompt 时调用 `starship prompt`，starship 打印一段带 ANSI 颜色的字符串，shell 直接拿去显示。所以**任何能接收命令输出的 shell 都能用**。

2. **配置文件叫 `starship.toml`**：默认放 `~/.config/starship.toml`。里面用 TOML 写"哪些模块亮、什么颜色、什么图标"。改完不用重启 shell，下次回车就生效。

3. **format 字符串决定模块顺序**：顶层有个 `format = "..."` 串起所有模块，类似 `$directory$git_branch$nodejs$character`。你想调整顺序、加分隔、删模块，都改这一行。

## 实践案例

### 案例 1：30 秒装上

```bash
# macOS
brew install starship

# 加到 ~/.zshrc 末尾
eval "$(starship init zsh)"

# 重开终端，prompt 立刻变成默认主题
```

bash / fish / PowerShell 替换 init 后那个 `zsh` 字段即可。

### 案例 2：最小 starship.toml

```toml
# ~/.config/starship.toml
add_newline = false           # 命令之间不空一行
format = "$directory$git_branch$character"

[character]
success_symbol = "[➜](bold green)"
error_symbol = "[✗](bold red)"

[directory]
truncation_length = 3         # 路径只留最后 3 段

[git_branch]
symbol = " "
```

这份配置渲染结果：`~/intern-journal/learnings/vllm  master ➜`。出错时 `➜` 变成红色 `✗`——这就是"上一条命令成功还是失败"的视觉反馈。

### 案例 3：一个图都不显示？查 Nerd Font

第一次装完看到 prompt 里 `▒▒▒` 方块或问号，**不是 starship 坏了**，是终端字体没装 Nerd Font。两条解决路径：

```bash
# 路径 A：装 Nerd Font（推荐 FiraCode Nerd Font）
brew install --cask font-fira-code-nerd-font
# 然后在 iTerm/Terminal 设置里把字体切到 FiraCode Nerd Font

# 路径 B：用 plain-text preset 完全不用图标
starship preset plain-text-symbols -o ~/.config/starship.toml
```

## 踩过的坑

1. **`starship init` 必须加进 rc 文件**：很多人 `brew install starship` 完直接打开终端发现没变化——因为 init 这一行没写进 `~/.zshrc`。装完一定 `echo 'eval "$(starship init zsh)"' >> ~/.zshrc` 然后**重开终端**。

2. **Powerlevel10k 用户切换要清干净**：原来用 p10k 的人装 starship，要先把 `~/.zshrc` 里 p10k 相关三段（source p10k.zsh、ZSH_THEME、p10k init）注释掉，否则两套 prompt 打架。

3. **慢模块拖累整体启动**：`aws`、`gcloud`、`kubernetes` 这种要读云配置的模块，网络不好会触发超时。把不用的模块在 toml 里 `disabled = true` 关掉，prompt 立刻快回来。

4. **format 字符串里的空格会原样显示**：`format = "$directory $git_branch"` 里那个空格会真的渲染出来。想要更紧凑用 `${custom.spacer}` 或直接拼。

5. **改了 toml 不刷新？**：极少数情况 shell cache 了 prompt 函数。`exec zsh` 或重开终端兜底。

## 适用 vs 不适用场景

**适用**：

- 跨多个 shell（家里 fish、公司 zsh、服务器 bash）想要统一 prompt
- 想看到富信息（git 状态、语言版本、k8s context）但不愿意手写 200 行 shell 函数
- 现代终端 + 愿意装 Nerd Font
- 想用别人写好的 preset 一键变好看（pastel-powerline / tokyo-night 等）

**不适用**：

- 只用 zsh 且追求极致启动速度（< 50ms） → powerlevel10k 用 instant prompt 更快
- 只用 zsh 且喜欢极简（一个箭头就够）→ pure 更轻
- 受限服务器装不了二进制 → starship 装不上，回到原生 PS1
- 终端不支持 truecolor / Unicode → starship 渲染会糊

## 历史小故事（可跳过）

- **2019 年 7 月**：Matan Kushner 用 JavaScript 写出第一版（叫 starship.rs，但代码是 JS），定位"oh-my-posh 的 npm 替代"
- **2019 年 8 月**：因为 Node 启动慢（每次 prompt 要 100+ms），团队决定用 Rust 重写
- **2020 年**：Rust 版正式发布，启动时间砍到 30ms 内，star 数从几千冲上一万
- **2026 年**：稳定在 45k+ star，homebrew / scoop / cargo 三大包管直接装，是跨 shell prompt 事实标准

## 学到什么

1. **跨平台工具的杠杆**：写一次 prompt 渲染逻辑，所有 shell 都获益——这是 Unix 哲学"做一件事做好"的现代演绎
2. **TOML 配置 + 单二进制**是 Rust 命令行工具的黄金组合，对比 oh-my-zsh 那种 shell 函数堆栈维护成本低一个量级
3. **超时机制是必需品**：任何要查外部状态（git/云/k8s）的模块都要带超时，否则慢一次毁所有体验
4. **Nerd Font 是隐藏前提**：图标类工具的"装完不亮"问题 90% 是字体没到位，不是工具本身

## 延伸阅读

- 官网快速上手：[starship.rs](https://starship.rs/)（5 分钟教程 + preset 画廊）
- 配置文档：[Configuration](https://starship.rs/config/)（每个模块的字段都列出来）
- Preset 画廊：[Presets](https://starship.rs/presets/)（pastel-powerline / nerd-font-symbols / plain-text 等）
- Nerd Font 下载：[nerdfonts.com](https://www.nerdfonts.com/)
- [[ripgrep]] —— 同样是 Rust 命令行工具的代表，单二进制 + 极致速度
- [[fish-shell]] —— 现代 shell，和 starship 搭配最顺滑

## 关联

- [[ripgrep]] —— Rust 命令行工具的"快 + 单二进制"美学同源
- [[fish-shell]] —— 现代 shell，开箱即用配 starship
- [[zsh]] —— 老牌 shell，starship 替代了 oh-my-zsh / p10k 这层
- [[nerd-fonts]] —— 给等宽字体补图标的事实标准，starship 图标的前提
