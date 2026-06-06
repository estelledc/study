---
title: oh-my-posh — 一份配置让所有 shell 都长一个样
来源: https://github.com/JanDeDobbeleer/oh-my-posh
日期: 2026-05-31
子分类: 命令行工具
分类: CLI
难度: 入门
provenance: pipeline-v3
---

## 是什么

oh-my-posh 是一个**用 Go 写的命令行提示符（prompt）引擎**。

日常类比：你家里有四个房间，每间灯开关接线方式都不一样（PowerShell 一种、bash 一种、zsh 一种、fish 一种）。oh-my-posh 像一个**统一遥控器**——你只配一份"我要这种灯光"，它替每个房间生成对应的接线脚本。

具体来说：

- 写一份 JSON / YAML / TOML 配置（决定 prompt 长什么样）
- 在 bash / zsh / fish / PowerShell / cmd / nushell 任何一个里运行 `oh-my-posh init <shell>`
- 它生成对应 shell 的 hook 脚本，你的提示符立刻变成你配置的样子

作者 Jan De Dobbeleer 2018 年最早用 PowerShell 写，2021 年第 3 个大版本整体**重写为 Go 单二进制**——这是它今天能跨所有 shell 的关键。

## 为什么重要

不是"prompt 漂亮"那么肤浅，三件事值得学：

1. **跨 shell 抽象**：bash / zsh / fish 钩 prompt 的 API 完全不同（bash 是 `PROMPT_COMMAND`，zsh 是 `precmd`，fish 是 `fish_prompt` 函数）。oh-my-posh 把"如何拿到当前目录、git 状态、退出码"抽象成 shell-agnostic 的中间层——这是**适配器模式**的真实工业案例。

2. **插件式架构**：100+ 个 segment（git 状态、kubectl context、node 版本、AWS profile、电池…）每个是一个独立 Go 文件，加新功能不动核心。读 `src/segments/` 一目了然：**怎么把"功能"做成可插拔积木**。

3. **配置即 DSL**：Go 的 `text/template` 直接暴露给用户，每个 segment 可以写自定义模板。这比"硬编码一堆开关"灵活十倍——是"少写代码、多让用户描述"思路的好例子。

约 18k GitHub stars，MIT 协议，主流社区配置之一。

## 核心要点

理解三层结构就够上手：

1. **block**：prompt 的位置容器。三种——`prompt`（左）、`rprompt`（右，行尾贴右）、`transient`（回车后简化版）。

2. **segment**：block 里的小积木。每个 segment 一个类型，比如：

```json
{
  "type": "git",
  "style": "powerline",
  "foreground": "#193549",
  "template": "{{ .HEAD }} {{ if .Working.Changed }}*{{ end }}"
}
```

3. **template**：用 Go `text/template` 决定 segment 怎么渲染。`.HEAD` `.Working.Changed` 这些字段由 segment 的 Go 代码暴露。

把这三层串起来：`config.json` 描述一棵 block → segment → template 的树，oh-my-posh 在每次按回车时遍历这棵树渲染一次。

## 实践案例

### 案例 1：装 + 跑默认主题（5 分钟）

mac 上：

```bash
brew install jandedobbeleer/oh-my-posh/oh-my-posh
echo 'eval "$(oh-my-posh init zsh)"' >> ~/.zshrc
source ~/.zshrc
```

立刻就能看到带颜色和 git 信息的 prompt。如果显示成方块，是 **Nerd Font 没装**——去 [nerdfonts.com](https://www.nerdfonts.com) 装一个 MesloLGS NF，终端字体改成它。

### 案例 2：换主题

oh-my-posh 自带 200+ 主题（仓库 `themes/` 目录）。看一眼挑一个：

```bash
oh-my-posh init zsh --config ~/.../themes/jandedobbeleer.omp.json
```

把主题 JSON 拷一份到自己的 dotfiles，改字段，效果立刻反馈——这是**最快感受 segment / template 关系**的方式。

### 案例 3：读源码学 Go 插件式架构

最值得读的两个文件：

- `src/segments/git.go`：最常用 segment，怎么实现 `Enabled()`（决定是否显示）和模板字段暴露
- `src/shell/init.go`：`oh-my-posh init bash` 输出的脚本怎么生成的——理解了这个就理解了"跨 shell"是怎么做到的

读完会明白：**oh-my-posh 不是在 shell 里运行，它是一个独立进程，每次按回车被 shell 调用一次输出一行字符串**。

### 案例 4：写一个自定义 segment

想加一个显示当前公网 IP 的 segment？流程大致：

1. 在 `src/segments/` 新建 `myip.go`，定义 struct 实现 `Enabled() bool` 和 `Template() string`
2. 在 `src/engine/segment.go` 的类型注册表里加一行
3. 重编 `go build`，配置里 `"type": "myip"` 就能用

100+ 现成 segment 都是同一个套路——读 5 个就完全摸到 pattern。

## 源码地图（要读的话从哪开始）

```
oh-my-posh/
  src/
    engine/         ← 渲染主循环，按 block → segment 顺序遍历
    segments/       ← 100+ 插件式模块，每个一个 .go 文件
    shell/          ← 为每个 shell 生成 hook 脚本
    template/       ← Go text/template 的薄包装
  themes/           ← 200+ 内置主题 JSON/YAML/TOML
  website/          ← ohmyposh.dev 文档站
```

读源码顺序建议：**main → engine → 一个 segment → shell init**。看懂这条主线再展开。

## 踩过的坑

1. **看到方块 / 问号**：99% 是 Nerd Font 没装。不是 oh-my-posh 的 bug，是字体问题。

2. **Windows Terminal 字体两个地方**：Windows Terminal 的字体设置 **不会** 自动同步到 PowerShell ISE 或 VS Code 终端。每个终端 app 单独设字体。

3. **PowerShell 改 `$PROFILE` 不生效**：必须 `. $PROFILE` 显式重载（点 + 空格 + 路径），或新开一个窗口。bash / zsh 习惯的 `source` 在 PowerShell 里要换写法。

4. **prompt 变慢**：segment 加多了（比如 kubectl + AWS + Azure 同时启用），每次回车都跑一堆命令拿状态。解决：用 `transient` 让历史行简化、关掉用不到的 segment、或只在特定目录启用某些 segment（segment 配置里 `enable_for_path`）。

## 适用 vs 不适用

**适用**：

- 你需要在 mac / Linux / Windows 多机同步一套 prompt 体验
- 你同时用多个 shell（公司 PowerShell、家里 zsh）
- 你想要表达力强的 prompt（条件渲染、自定义 template、多颜色组合）

**不适用**：

- 只用 zsh 且想要**最快启动速度** → 用 [powerlevel10k](https://github.com/romkatv/powerlevel10k)（zsh-only，Instant Prompt 优化好）
- 想要**最简配置** → 用 [starship](https://github.com/starship/starship)（Rust 写，TOML 配置更简洁）
- 受限环境无法装二进制 → 用 shell 内置 PS1 手写

## 学到什么

1. **"配置 + 模板"比"硬编码开关"灵活**——把表达力让给用户，核心代码反而更小
2. **跨 shell 抽象的关键不是统一 API，是统一中间表示**：oh-my-posh 把状态拿到自己进程内算，再生成各 shell 的 hook
3. **Go 单二进制的工程优势**：一份代码编出 mac / Linux / Windows 三套，分发简单
4. **插件目录 = 学源码入口**：100+ segment 都长一样，读懂一个就懂整体
5. **prompt 是 shell 的 hook 点**：每个 shell 都给了"按回车前调一下我"的接口，oh-my-posh 把这件事从"每个 shell 各写一份"统一成"我一个进程吐字符串"

## 延伸阅读

- 官方文档：[ohmyposh.dev](https://ohmyposh.dev)（配置字段、segment 列表都在这）
- Nerd Font 入门：[nerdfonts.com](https://www.nerdfonts.com)（字体不对一切都白搭）
- 同类对比：[starship](https://github.com/starship/starship) / [powerlevel10k](https://github.com/romkatv/powerlevel10k)
- 源码导读起点：`src/segments/git.go` + `src/shell/init.go`

## 关联

- [[starship]] —— Rust 写的同类，配置更简单但表达力更弱
- [[promptfoo]] —— 名字像，干的完全不一样（prompt 是 LLM prompt，不是 shell prompt）
