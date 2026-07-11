---
title: asdf — 一个 CLI 管 Node/Python/Ruby 等几十种版本
来源: https://github.com/asdf-vm/asdf
日期: 2026-05-31
分类: 基础设施
难度: 入门
---

## 是什么

asdf（读作 "as-dee-eff"，没有特别含义）是一个**多语言的开发环境版本管理器**。

日常类比：

- 想象厨房里每种食材都有自己的称：电子秤称米、量杯量水、勺子量盐——三套工具
- 老式做法：装 `nvm` 切 Node、`pyenv` 切 Python、`rbenv` 切 Ruby——每种语言一个工具，命令各不一样
- asdf 是一把"通用秤"：一个 CLI 通过插件支持几十种语言/工具，命令统一

在项目根放一份 `.tool-versions` 文件（每行一个工具+版本），下次 `cd` 进这个目录，asdf 自动把对的版本切上去。

仓库：`github.com/asdf-vm/asdf`，**MIT** 协议，2014 年 Akash Manohar 创建，最初用 **Bash** 写，2025 年的 v0.16 重写为 **Go**。

## 为什么重要

不用 asdf（或类似工具）做多语言开发，会撞上四类痛：

1. **多项目多版本冲突**：项目 A 用 Node 18，项目 B 用 Node 22，系统装一个都不对。
2. **每种语言一个工具**：nvm / pyenv / rbenv / goenv… 命令风格不一致，shell 启动慢。
3. **新人入坑成本**：README 写"先装 Node 18.17、Python 3.11、Ruby 3.2"——挨个装。有 `.tool-versions` 时只要 `asdf install` 一行。
4. **CI 与本地不一致**：`.tool-versions` 进 git，CI 用 `asdf-vm/actions/install`，与本地同源。

更关键的是：asdf **定义了"通用版本管理器插件协议"的事实标准**。后来出现的 `mise` / `rtx` 都兼容 asdf 插件——整个生态因 asdf 而存在。

## 核心要点

asdf 的世界由 **5 个概念**撑起来：

| 概念 | 是什么 | 类比 |
|------|--------|------|
| Plugin | 一个 git 仓库，定义"怎么装这门语言" | 给"通用秤"加一个新刻度盘 |
| `.tool-versions` | 项目根的版本声明文件 | 项目的环境清单 |
| Shim | `~/.asdf/shims/node` 这种假可执行 | 替身演员，调用时再找真版本 |
| Global / Local | 家目录是全局回退；项目内是局部覆盖 | 家里默认值 / 工作时改写 |
| `asdf install` | 读 `.tool-versions` 把所有版本装上 | 一键备料 |

最重要的三步：`asdf plugin add nodejs`（装插件） → `asdf install nodejs 20.10.0`（装版本） → `asdf set nodejs 20.10.0`（写进 `.tool-versions`）。

## 实践案例

### 案例 1：新项目装 Node + Python

```bash
# 一次性装两个插件
asdf plugin add nodejs
asdf plugin add python

# 在项目目录里声明版本
cd my-project
asdf set nodejs 20.10.0
asdf set python 3.11.7

# 看看生成了什么
cat .tool-versions
# nodejs 20.10.0
# python 3.11.7

# 真正下载 + 编译
asdf install
```

之后这个目录里跑 `node --version` 就是 20.10.0；`cd` 出去回到默认值。

### 案例 2：shim 是怎么工作的

执行 `node app.js` 时背后的链路：

1. shell 找到 `~/.asdf/shims/node`（PATH 第一个）
2. shim 是个小脚本，它读取**当前目录往上找**到的第一个 `.tool-versions`
3. 找到 `nodejs 20.10.0`，跳到 `~/.asdf/installs/nodejs/20.10.0/bin/node`
4. 把所有参数原样转发

类比：你打公司前台电话，前台查工位表，再把电话转给真人。shim 就是前台。

### 案例 3：插件协议的简洁

asdf 的插件就是一个 git 仓库，里面几个 shell 脚本：

```
bin/list-all       # 列出这个工具有哪些版本可装
bin/download       # 下载源码或二进制
bin/install        # 装到 ~/.asdf/installs/<tool>/<version>/
bin/list-bin-paths # 告诉 asdf 这个版本里哪些目录有可执行
```

写一个新插件 = 写这 4 个 shell 脚本。生态因此爆发——asdf 官方插件库收了 500+ 工具。

## 踩过的坑

1. **Bash 版 shim 启动慢**：每次调用 `node` 都要 fork 一次 shell 解析 `.tool-versions`，在 monorepo 里叠加上百个 shim 体感卡顿。v0.16（2025）改 Go 后改善。
2. **PATH 顺序问题**：忘了在 `.zshrc` 里 `source ~/.asdf/asdf.sh`，shim 不在 PATH，`node` 找不到——典型新手坑。
3. **v0.16 行为变化**：旧 Bash 版的 `ASDF_DIR` 等环境变量在 Go 版里有变，升级时旧脚本可能失效，要看 changelog。
4. **插件质量参差**：冷门语言（如某些小众 lisp 方言）的插件可能停止维护，装版本时报错。
5. **Windows 原生不支持**：要走 WSL，原生 Windows 用户用 mise 或 scoop 更顺。

## 适用 vs 不适用场景

**适用**：

- polyglot 项目：一个 monorepo 既有 Node 后端又有 Python 脚本又有 Go 工具
- 多版本测试：Ruby 库要在 2.7 / 3.0 / 3.2 都跑一遍
- 团队入职：README 写 `asdf install`，几分钟环境齐
- CI：用 `asdf-vm/actions/install` 直接读 `.tool-versions`

**不适用**：

- 单语言简单项目：装个 nvm / pyenv 就够，没必要全家桶
- Windows 原生开发（不走 WSL）：用 mise / scoop / winget
- 追求"包括系统库"的可重现性：用 [[nix]]，asdf 只管语言运行时
- 容器化部署：CI 镜像里 `FROM node:20` 更直接

## 历史小故事（可跳过）

- **2014 年**：Akash Manohar 发布 asdf，目标是把 nvm、rbenv、pyenv 这类单语言版本管理器统一到一个命令入口。
- **2016-2018 年**：插件机制稳定下来，社区开始把 Node、Python、Ruby、Elixir 等常见运行时都接进同一套 `.tool-versions` 文件。
- **2020-2023 年**：polyglot monorepo 变多，asdf 因为“一个仓库锁多种工具版本”被大量团队放进 onboarding 和 CI。
- **2025 年**：v0.16 改用 Go 重写主程序，保留插件协议和目录结构，重点解决 Bash 版本启动慢、维护困难的问题。

## 替代品

| 工具 | 特点 | 何时选 |
|------|------|--------|
| **mise** | Rust 重写版，启动比 asdf 快 10×，兼容 asdf 插件 | 嫌 asdf 慢，又想要插件生态 |
| **Homebrew** | 装一个最新版，没切换概念 | 只用一个版本就够 |
| **[[nix]]** | 函数式包管理，连系统库一起锁 | 要"绝对可重现"，能接受陡学习曲线 |
| **Docker** | 整个环境装容器里 | 部署同源，不想污染本机 |
| **手动 nvm/pyenv** | 每语言一个工具 | 老项目里已经在用，不想动 |

## 学到什么

1. **shim 是把"动态选择"塞进 PATH 的经典套路**：与 [[homebrew]] 的 `Cellar/<formula>/<version>/` + symlink 是不同思路（asdf 选 shim、homebrew 选 symlink）。
2. **插件协议越简单，生态越大**：4 个 shell 脚本就能写一个 asdf 插件——门槛低，所以 500+ 插件。
3. **Bash → Go 重写不是"重新发明"**：v0.16 保留了协议、目录结构、`.tool-versions` 格式——升级时数据可继承。
4. **"事实标准"比"官方标准"更顽强**：asdf 没出过 RFC，但因为 mise 兼容它的插件，整个版本管理生态都按它的格式走。

## 延伸阅读

- 官方文档：[asdf-vm.com](https://asdf-vm.com)（Getting Started 10 分钟读完）
- 插件列表：[github.com/asdf-vm/asdf-plugins](https://github.com/asdf-vm/asdf-plugins)（500+ 插件清单）
- v0.16 重写背景：[asdf v0.16.0 release notes](https://github.com/asdf-vm/asdf/releases)（Bash → Go 动机）
- [[mise]] —— Rust 重写版，更快，兼容 asdf 插件
- [[homebrew]] —— macOS 包管理器，思路对照（symlink vs shim）
- [[nix]] —— 函数式包管理，"可重现"的另一极

## 关联

- [[mise]] —— asdf 的 Rust 后继者，启动快 10×，插件协议兼容
- [[homebrew]] —— 同样管"装多个版本"，但用 symlink 而非 shim
- [[nix]] —— 同样追求"项目环境描述化"，但管到系统库一层

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[papers/scoop]] —— Scoop — Windows 上像 Homebrew 一样装命令行工具
- [[dive]] —— dive — 看清 Docker 镜像每一层加了什么文件的 TUI
- [[projects/nvm]] —— nvm — 在同一台机器上轻松切换 Node 版本
- [[pyenv]] —— pyenv — 用 shim 把 python 命令拦截后路由到指定版本
- [[projects/scoop]] —— Scoop — Windows 上的 Homebrew 风格命令行包管理器
- [[volta]] —— Volta — cd 进项目就自动换 Node 版本的工具链管理器
