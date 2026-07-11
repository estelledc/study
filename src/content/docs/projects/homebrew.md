---
title: Homebrew — macOS 上一行命令装好软件的包管理器
来源: https://github.com/Homebrew/brew
日期: 2026-05-31
分类: 基础设施
难度: 入门
---

## 是什么

Homebrew 是 macOS 和 Linux 上最流行的**命令行包管理器**。

日常类比：

- 在手机上你装 App 走 App Store，一键搞定，不用想"装到哪"、"依赖什么"
- 在 macOS 上想装命令行工具（git / node / postgres），如果没有 Homebrew，你得自己下安装包、配 PATH、调依赖、出问题手动卸
- Homebrew 就是 macOS 上**给程序员用的 App Store**，一行 `brew install <名字>` 解决全部

仓库地址：`github.com/Homebrew/brew`，**BSD-2-Clause** 协议，2009 年 Max Howell 用 Ruby 写的，到今天仍是 macOS 装软件的事实标准。

## 为什么重要

不学 Homebrew 直接在 macOS 上做开发，会撞上四类痛：

1. **macOS 没原生包管理器**：Apple 不给你 `apt-get`、`yum`、`dnf` 这种东西。你想装 `wget` 都没地方装。Homebrew 是这个空缺的填补者。

2. **依赖手动管理是地狱**：装 PostgreSQL，它要 `openssl`、`readline`、`icu4c`。手动下源码编译，三层依赖到一半你就崩溃。`brew install postgresql` **一条命令把依赖树整棵装好**。

3. **PATH 与库路径不踩坑**：Homebrew 把所有东西装到一个统一的目录（`/opt/homebrew/`），自动在你的 shell 里加好 PATH。不会出现"装了但找不到"。

4. **不需要 sudo**：所有写入都在你自己的 prefix 目录里，**没有权限污染系统盘**。卸载也干净。

学会 Homebrew 等于学会"在 macOS 上不再为装软件浪费时间"。

## 核心要点

Homebrew 的世界由 **6 个概念**撑起来：

| 概念 | 是什么 | 类比 |
|------|--------|------|
| Formula | 描述一个软件包的 Ruby 脚本（URL / 依赖 / 编译方式） | 菜谱 |
| Cask | 装 GUI app（`.app` 写到 `/Applications`） | 装 macOS 桌面软件的子系统 |
| Bottle | 预编译好的二进制 tarball | 速食包，下载即用，不本地编译 |
| Cellar | 实际装好的文件夹（`/opt/homebrew/Cellar/`） | 仓库本身 |
| Prefix | Homebrew 的根目录 | Apple Silicon 是 `/opt/homebrew/`，Intel 是 `/usr/local/` |
| Tap | 第三方 Formula 仓库 | App Store 之外的"第三方应用市场" |

最重要的两个动词是 `install` 和 `upgrade`，剩下的命令围绕这两个转。

## 实践案例

### 案例 1：初次装 Homebrew

打开终端，跑官方一行脚本：

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

装完以后，按提示把 brew 加进 PATH（Apple Silicon 的 zsh 用户）：

```bash
echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
eval "$(/opt/homebrew/bin/brew shellenv)"
```

跑 `brew --version` 看到版本号就成功了。

### 案例 2：装一个命令行工具

```bash
brew install wget       # 装
brew info wget          # 看版本/依赖/路径
brew list               # 看已装哪些包
brew uninstall wget     # 卸
```

`brew install` 第一次下载会花 30 秒到 2 分钟（取决于依赖大小）。第二次起，因为有 Bottle 缓存，秒装。

### 案例 3：装一个 GUI 软件（Cask）

```bash
brew install --cask visual-studio-code
brew install --cask google-chrome
```

跟手动下 `.dmg`、拖图标到 `/Applications/` 完全等效，但**写一行就完事**，且后续 `brew upgrade` 自动跟着升级——比每个软件单独点"检查更新"省事得多。

### 案例 4：用 Brewfile 把整台机器配置成代码

在项目根目录写一个 `Brewfile`：

```ruby
brew "git"
brew "node"
brew "postgresql@16"
cask "visual-studio-code"
cask "rectangle"
```

然后：

```bash
brew bundle install
```

新机器一行复制全部环境。这是 [[ansible]] / [[nix]] 思想的轻量版——把"装了什么"从口头描述变成可提交的文件。

## 踩过的坑

1. **Apple Silicon 路径坑**：M 系列芯片 macOS 的 prefix 是 `/opt/homebrew/`，不是 Intel 时代的 `/usr/local/`。**搜到的老教程很多是 `/usr/local/`，照抄会让命令找不到**。判断方法：跑 `brew --prefix`，看输出。

2. **公司网络拦 GitHub raw**：`brew install` 会从 GitHub 下载 bottle，公司网络可能限速或拦截。解决：换中科大 / 清华镜像源（搜"Homebrew 镜像"有完整步骤），换完 `brew update` 一次重新拉索引。

3. **`brew upgrade` 一升升一片**：不带参数跑会升级**所有**已装包。如果你只想升一个，写 `brew upgrade <pkg>`。否则可能把不打算动的依赖一起升级，破坏现有项目。

4. **卸载不彻底**：`brew uninstall postgresql` 不会删 `~/Library/Application Support/Postgres/`、不会删 dotfile 里的配置。彻底清理要手动跟一遍 `~/Library/` 和 `~/.config/`。

5. **`brew services` 只对当前用户生效**：用 `brew services start postgresql` 启的服务，不会跟系统启动自动跑（除非加 launchd），重启电脑后要 `brew services start` 一次。

6. **Ruby 版本飘移**：Homebrew 自带 Ruby 解释器，**不要**用 `brew install ruby` 装的 Ruby 去开发——那是给 brew 自己用的工具链。开发用 Ruby 走 [[mise]] / `rbenv`。

## 适用 vs 不适用场景

**适用**：

- macOS 装命令行工具（git / wget / jq / 各种语言运行时）
- macOS 装常用 GUI 软件（VS Code / Chrome / Slack / Postman）
- 个人或团队用 Brewfile 标准化新机器配置
- Linux 开发机想避开 apt/yum 的旧版本（Linuxbrew 给最新版）

**不适用**：

- **生产服务器装包** → 用 [[ansible]] / [[docker]] / [[nix]]，Homebrew 是开发机工具
- **多版本 runtime 频繁切换**（要在 node 18 / 20 / 22 之间来回切）→ 用 [[mise]] / nvm。brew 虽有 `node@20` 这类 versioned formula，能并存，但默认链接与 PATH 切换不如版本管理器顺手
- **可重现构建**（同样输入必须出同样输出）→ 用 [[nix]]，brew 不保证
- **Windows** → 不支持，用 [[chocolatey]] / Scoop / winget

## 历史小故事（可跳过）

- **2009-05**：Max Howell 在 GitHub 上发布第一个版本，Ruby 写
- **2014**：引入 **Bottles**（预编译二进制），从"本地编译"变"下载即用"——速度提升 10 倍
- **2016**：v1.0，**Cask 官方合并**到主仓库（之前是社区 fork）
- **2019**：Apple 官方在 WWDC 推荐 Homebrew 给开发者
- **2021**：Apple Silicon 适配，prefix 从 `/usr/local/` 改 `/opt/homebrew/`
- **2023**：v4.0 引入**集中式 API**，索引下载从 `git pull` 整个仓库变成一个 JSON 请求——`brew update` 提速 10 倍以上

## 学到什么

1. **包管理器 = 把"装软件"这件事工程化**——依赖、路径、卸载、升级，全部脚本化
2. **声明式 vs 命令式**：`Brewfile` 是声明式（"我要这些"），`brew install` 是命令式（"立刻装一个"）。两个都好用，配合更强
3. **不需要 sudo 的设计哲学**：把所有东西装在用户自己的目录，避开系统污染——这是现代包管理器的共同原则（[[nix]] / [[mise]] 都这样）
4. **社区驱动 + 官方协作**：Homebrew 是社区项目但被 Apple 官方推荐——开源能赢的最佳模式

## 延伸阅读

- 官方文档：[docs.brew.sh](https://docs.brew.sh/)
- Formula Cookbook：[docs.brew.sh/Formula-Cookbook](https://docs.brew.sh/Formula-Cookbook)（学怎么写自己的 Formula）
- 仓库本身：[Homebrew/brew](https://github.com/Homebrew/brew)
- Brewfile 规范：[homebrew-bundle](https://github.com/Homebrew/homebrew-bundle)
- [[mise]] —— 多版本 runtime 管理，与 brew 互补
- [[nix]] —— 更严格的声明式包管理，学习曲线陡但可重现性强
- [[ansible]] —— 把"装软件"从开发机扩展到一整队服务器

## 关联

- [[mise]] —— 管 runtime 多版本，brew 管基础工具，两者搭配是 macOS 标配
- [[nix]] —— Homebrew 的"严肃版本"，可重现 + 声明式
- [[ansible]] —— 服务器集群级的包管理，与 brew 处理的尺度不同
- [[docker]] —— 容器化把"环境装好"变成镜像，比 brew 更彻底

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
