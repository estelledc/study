---
title: Scoop — Windows 上像 Homebrew 一样装命令行工具
来源: Luke Sampson, https://github.com/ScoopInstaller/Scoop, 2013
日期: 2026-05-31
分类: 工具与基础设施
难度: 入门
---

## 是什么

Scoop 是 **Windows 上的命令行装包工具**，写 `scoop install git` 就把 git 装好。日常类比：像 Mac 的 Homebrew、Linux 的 apt——一行命令搞定一个工具，不用上网下载、双击安装包、点 next next finish。

它装的东西全部放在 **用户自己的家目录**（`C:\Users\你\scoop`），不要管理员权限、不弹 UAC（Windows 那个"是否允许此应用更改你的设备"的黑屏窗口）、不会污染系统 PATH。

```powershell
scoop install nodejs python git
```

这一行下去，三个工具自动装好、PATH 自动配好，命令行直接能用。

## 为什么重要

不知道 Scoop，下面这些事在 Windows 上特别痛：

- 装一个 `jq`（处理 JSON 的命令行工具）要去 GitHub releases 找 .exe、放到某个目录、再手动改 PATH——一套下来 5 分钟
- 装 Node.js 默认走 .msi 安装向导，弹一堆"需要管理员权限"
- 公司电脑没管理员密码，想装个 ripgrep 都装不上
- 重装系统后所有命令行工具都要从头来一遍，没法脚本化

Scoop 把这些痛点一次解决：**所有命令行工具用一个 JSON 清单（manifest）描述怎么装**，社区维护这些清单，你只用 `scoop install`。

## 核心要点

Scoop 的设计可以拆成 **三层**：

1. **Manifest（清单）**：每个软件包对应一个 JSON 文件，写清楚下载链接、解压后哪个 .exe 是入口、要不要加 PATH。比如 `nodejs.json` 大概 30 行。

2. **Bucket（桶）**：一组 manifest 打包成一个 git 仓库。默认装 `main` 桶（开发者常用工具），想要 GUI 软件加 `extras` 桶，想要游戏加 `games` 桶。日常类比：bucket 就像 App Store 里的"分类"。

3. **用户目录安装**：所有东西装在 `~/scoop/apps/<软件>/<版本>/`，shim（垫片）放在 `~/scoop/shims/`，PATH 只加这一个目录。卸载就是删文件夹，干干净净。

写成一行：**JSON 描述 + git 分发 + 用户目录隔离**。

## 实践案例

### 案例 1：第一次装 Scoop 自己

```powershell
# PowerShell 里跑
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
irm get.scoop.sh | iex
```

`irm` 是 `Invoke-RestMethod` 的简写——下载远程文件并解析，相当于 `curl`。`iex` 是 `Invoke-Expression`——把字符串当 PowerShell 命令执行，相当于 bash 的 `eval`。两个加起来：**下载安装脚本，立刻跑**。

30 秒后 `scoop` 命令就能用了，**全程不要管理员**。

装完看一眼装在哪：

```powershell
scoop which scoop  # 显示 ~/scoop/shims/scoop.ps1
```

shim（垫片）是 Scoop 的关键设计——所有命令对外的入口都在 `~/scoop/shims/`，PATH 只加这一个目录。新装一个软件就在 shims 里多一个 .exe 转发文件，干净。

### 案例 2：装一个开发常用工具链

```powershell
scoop install git nodejs python ripgrep fd jq
scoop bucket add extras
scoop install vscode
```

第一行装 6 个 CLI 工具，第二行加 `extras` 桶（带 GUI 软件的），第三行装 VS Code。装完直接打开终端 `node -v` 就能看到版本号。

### 案例 3：批量重装（脚本化）

```powershell
scoop export > apps.json              # 导出已装列表（含版本/桶）
# ... 换台电脑 ...
scoop import apps.json                # 一行装回
```

把已装软件列表导成文件，新机器一行命令全部装回。这是 Scoop 比双击 .exe 强的核心场景——**配置即代码**。配合 dotfiles 仓库，重装系统从一天压到 20 分钟。

### 案例 4：看一个 manifest 长啥样

```powershell
scoop cat ripgrep
```

会打印一个 JSON 文件，大概 20 行：版本号、下载 URL、SHA256、解压后哪个 .exe 加 shim、卸载脚本。**完全人类可读**，自己想加一个公司内部工具也只是写一份这样的 JSON。

## 踩过的坑

1. **PowerShell 执行策略默认禁脚本**：第一次跑 `irm get.scoop.sh | iex` 报红，必须先 `Set-ExecutionPolicy RemoteSigned -Scope CurrentUser`。这是 Windows 安全策略，不是 Scoop 的锅。

2. **公司代理环境装不上**：Scoop 从 GitHub 下载 manifest 和软件，如果公司网封 GitHub raw 链接，整个体系跑不起来。解决：配 `scoop config proxy` 或自己镜像 bucket。

3. **bucket 是 git 仓库**：`scoop update` 慢的话，多半是 git pull 卡了。可以 `cd ~/scoop/buckets/main && git config core.compression 0` 关压缩。

4. **不要混用 Scoop 和 Chocolatey 装同一个软件**：两者 PATH 顺序不同，会出现 `node -v` 显示一个版本但跑的是另一个目录的 node。**一个工具只用一个包管理器**。

5. **GUI 软件不是 Scoop 的强项**：装 Chrome、Office 这种，extras bucket 也支持，但更新不如 Chocolatey/winget 及时。**Scoop 是 CLI 工具优先**，GUI 用 winget 更省心。

## 适用 vs 不适用场景

**适用**：

- 开发机想要可复现的 CLI 工具链（Git/Node/Python/Rust 等）
- 公司机器没管理员权限但要装命令行工具
- 想脚本化新员工开发环境（导出 list 一行装回）
- 喜欢 Linux/Mac 风格的"轻量、干净、可组合"

**不适用**：

- 装大量 GUI 软件（Office/Photoshop 之类）→ winget 或 Chocolatey
- IT 运维管理几百台机器 → Chocolatey 企业版有审计/许可
- 完全离线/内网环境 → 自建 bucket 镜像才能用
- 不想学 PowerShell 任何一点点 → winget 有 GUI 前端 UniGetUI

## 历史小故事（可跳过）

- **2010 年代初**：Windows 没有像样的包管理器。装个 wget 都要 SourceForge 上找 .exe，一半链接还失效。
- **2011 年**：Rob Reynolds 写了 Chocolatey，基于 NuGet 体系，是第一个 Windows 包管理器。但它要管理员、装在系统目录、风格偏 IT 运维。
- **2013 年**：Luke Sampson 觉得装个 CLI 工具凭什么要管理员，用 PowerShell 写了 Scoop，明确模仿 Homebrew：用户目录、JSON manifest、git bucket。
- **2020 年**：微软发布 winget（基于收购的 AppGet，曾引发争议——AppGet 作者 Keivan Beigi 公开抱怨被微软"问完一圈面试就拷走想法"），官方承认 Windows 需要原生包管理。
- **现在**：三者各有地盘——**Scoop 给开发者、Chocolatey 给运维、winget 给普通用户**，老手机器上常常三个都装。Luke Sampson 把 Scoop 维护权移交给社区组织 ScoopInstaller，2025 年版本到 0.5.3，仓库 24k stars，活跃度稳定。

## 关键事实速览

- 包数量：Scoop 主桶约 1000+，加上 extras/games/java 等社区桶共约 5000+
- Chocolatey 约 10000+ 包；winget 约 6000+ 包
- Scoop 用 PowerShell 5.1+ 跑，Windows 10 自带 PowerShell 5.1，老 Windows 7 需要先升级
- License 是 Unlicense（公共领域）或 MIT 双重授权，可商用

## 学到什么

1. **包管理器的本质是"清单 + 分发渠道"**——Scoop 的 manifest 是 JSON、bucket 是 git 仓库，整套体系能跑就是因为这两件事都标准化
2. **不要管理员权限是一个深度设计选择**——Scoop 把所有东西放用户目录，PATH 只加一处，卸载就是 rm -rf。这种"隔离"思路也出现在 Nix、conda 这些工具里
3. **Windows 的安全策略（UAC）是把双刃剑**——保护普通用户，也让开发者痛。Scoop 通过"全装到自己家目录"绕过这个点，是工程上的取巧
4. **三个包管理器并存不奇怪**——就像 Mac 上 Homebrew/MacPorts/Nix 共存。每个有侧重，混用就是你的事

## 延伸阅读

- 官网：[scoop.sh](https://scoop.sh)（30 秒看完上手）
- 主 bucket：[ScoopInstaller/Main](https://github.com/ScoopInstaller/Main)（看 JSON manifest 长啥样）
- 对比文章：[Scoop vs Chocolatey vs winget](https://www.makeuseof.com/scoop-vs-chocolatey-vs-winget/)（什么场景用哪个）
- [[nix]] —— 同样靠 manifest + 用户目录隔离的思路，但走得更彻底
- [[homebrew]] —— Scoop 的精神原型（如果存在该笔记）

## 关联

- [[nix]] —— 同样把"包"看作纯函数输出，比 Scoop 更彻底地隔离
- [[asdf]] —— 跨语言版本管理器，定位类似但聚焦运行时切换
- [[clearml]] —— 工具链可复现思路同源（实验环境 vs 开发环境）

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
