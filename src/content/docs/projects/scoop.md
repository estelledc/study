---
title: Scoop — Windows 上的 Homebrew 风格命令行包管理器
来源: https://github.com/ScoopInstaller/Scoop
日期: 2026-05-31
分类: 基础设施
难度: 入门
---

## 是什么

Scoop 是 Windows 上的**命令行包管理器**，用 PowerShell 写，思路抄自 macOS 的 Homebrew。

日常类比：

- 老办法装软件：去官网找下载页、点 .exe 安装包、一路下一步、UAC 弹窗、装完桌面多一堆图标，卸载还卸不干净
- Scoop 的办法：在终端敲一行 `scoop install git`，几秒钟后 `git` 命令就能用，卸载也是一行 `scoop uninstall git`，环境干干净净

仓库：`github.com/ScoopInstaller/Scoop`，**24.2k stars**，协议是 **Unlicense 或 MIT（双许可）**，当前版本 **0.5.3（2025-08）**。默认安装到 `%USERPROFILE%\scoop`（也就是 `C:\Users\你\scoop`），**不要管理员权限**，**不弹 UAC**。

## 为什么重要

Windows 长期没有"像样的命令行包管理器"。开发者从 macOS / Linux 来到 Windows，会撞上四类痛：

1. **每装一个工具就开一次浏览器**：node 去 nodejs.org，python 去 python.org，jq 去 GitHub Releases。下载 + 双击 + 下一步循环。
2. **PATH 被各种安装器污染**：装完十个工具，环境变量乱成一锅粥，A 工具的依赖被 B 工具覆盖。
3. **卸载不干净**：注册表残留、Program Files 残留、AppData 残留。
4. **没有"可复现的开发环境"**：换台电脑要重新走十遍下一步。

Scoop 的回答是：**把每个软件当成一个 JSON 描述文件，下载、解压、加 PATH、加快捷方式都按描述脚本化**。装在用户目录，不碰系统，卸载就是删一个文件夹。

它不是 Windows 包管理器的唯一答案——还有 **Chocolatey**（老牌、要管理员）和 **winget**（微软官方、偏应用商店生态）。但对**纯命令行工具开发者**来说，Scoop 摩擦最小。

## 核心要点

Scoop 的世界由 **4 个概念**撑起来：

| 概念 | 是什么 | 类比 |
|------|--------|------|
| Manifest | 一个 JSON 文件，描述"怎么装这个软件" | 食谱卡片 |
| Bucket | 一堆 manifest 的 git 仓库 | 食谱合集书 |
| Shim | `~/scoop/shims/git.exe` 这种小转发器 | 替身演员，被调用时去找真程序 |
| Install path | 所有东西都装在 `~/scoop/apps/<name>/<version>/` | 一人一格抽屉 |

**装一个软件背后发生什么**（以 `scoop install fd` 为例）：

1. 从默认 bucket（`main`）找到 `fd.json` manifest
2. 下载 manifest 里写的 `url`，校验 `hash`
3. 解压到 `~/scoop/apps/fd/8.7.0/`
4. 在 `~/scoop/shims/` 生成 `fd.exe`（一个小转发器，调用时去找抽屉里的真程序）
5. `~/scoop/shims` 早就在 PATH 里 → `fd` 命令立即可用

**升级**：`scoop update fd` 装新版本到 `~/scoop/apps/fd/8.8.0/`，shim 指向新版。**老版本保留**，可以 `scoop reset fd@8.7.0` 一键回滚。

**卸载**：`scoop uninstall fd` 删抽屉、删 shim。系统其他地方零残留。

## 实践案例

### 案例 1：第一次在 Windows 上装 Scoop

PowerShell 里两行（注意第一行解决执行策略问题）：

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
irm get.scoop.sh | iex
```

装完直接 `scoop install git nodejs python ripgrep fd jq`，一气呵成。

### 案例 2：加 bucket 装小众工具

默认 `main` bucket 只有"最常见 + 完全开源 + CLI"工具。装 GUI 应用要 `extras`，装游戏要 `games`：

```powershell
scoop bucket add extras
scoop install vscode obsidian
```

bucket 本质就是 git 仓库，`scoop bucket list` 看已加的，`scoop bucket known` 看官方推荐的。

### 案例 3：多版本共存

旧版 Node 通常不在默认 `main` 里，先加 **versions** bucket，再按版本号装：

```powershell
scoop bucket add versions
scoop install versions/nodejs18   # 或 nodejs-lts@<具体版本>
scoop install nodejs-lts          # 当前 LTS 仍可从 main 装
scoop reset nodejs18              # shim 切到 18 抽屉
scoop reset nodejs-lts            # 再切回 LTS
```

`reset` 只改 shim 指向哪个抽屉，不动 PATH。比 nvm-windows 干净。可复现环境靠 `scoop export > apps.json` / `scoop import apps.json`。

### 案例 4：自己写一份 manifest

manifest 就是一个 JSON：

```json
{
  "version": "1.0.0",
  "url": "https://example.com/mytool-1.0.0.zip",
  "hash": "sha256:abc...",
  "bin": "mytool.exe",
  "autoupdate": {
    "url": "https://example.com/mytool-$version.zip"
  }
}
```

放进自建 bucket（一个 git 仓库），团队就能 `scoop bucket add internal <repo-url>` 然后 `scoop install mytool`。这是公司基建里很常见的场景。

## 踩过的坑

1. **PowerShell 执行策略默认 Restricted**：第一次跑安装脚本会报错，必须先 `Set-ExecutionPolicy RemoteSigned -Scope CurrentUser`。Windows 安全机制，不是 Scoop 的锅。

2. **GitHub Releases 在国内慢**：Scoop 大量软件直接拉 GitHub Releases 包，没代理时容易超时。配 `scoop config proxy 127.0.0.1:7890` 或 `$env:HTTPS_PROXY` 救场。

3. **`-g` 全局安装的副作用**：`scoop install -g <name>` 装到 `C:\ProgramData\scoop`，**需要管理员**且会污染所有用户。除非真的要给所有账号共用，否则别加 `-g`。

4. **bucket 加多了 `update` 慢**：每个 bucket 都是 git pull。装了 10 个 bucket 的人，`scoop update` 要等几十秒。原则：用什么加什么。

5. **shim 只支持单文件可执行**：GUI 程序（带配套 dll、资源文件）要靠快捷方式（Start Menu）启动，不能直接 `myapp.exe` 在终端调起。

## 适用 vs 不适用场景

**适用**：

- Windows 上做开发，要装一堆 Linux 风 CLI 工具（git / fd / ripgrep / jq / curl / make）
- 想在多台机器复刻同一套工具集（一行 `scoop import config.json`）
- 团队内部工具分发——自建 bucket，新人 `scoop install company-cli` 入职即可用
- 多版本共存（Node / Python / Java JDK）

**不适用**：

- 装大型商业软件（Photoshop / Office / IDE 全家桶）→ 走官方安装器或 winget
- 需要系统级驱动 / 服务（VPN 客户端 / 杀毒软件）→ 这些必须管理员，超出 Scoop 设计目标
- 不是开发者的普通用户 → Microsoft Store + winget 摩擦更低

## 与 Chocolatey / winget 的对比

| 维度 | Scoop | Chocolatey | winget |
|------|-------|------------|--------|
| 默认权限 | 用户态、不弹 UAC | 管理员 | 用户态 |
| 包格式 | JSON manifest | nuspec（NuGet） | YAML manifest |
| 仓库模型 | 多个 bucket（git） | 中心仓库 community.chocolatey.org | 微软官方源 |
| 主打人群 | CLI 开发者 | 系统管理员、企业 IT | 普通用户 + 应用商店 |
| 安装位置 | `~/scoop/apps/...` | `C:\ProgramData\chocolatey\` | 各软件原始路径 |

简化记忆：**Scoop 是给开发者的，Chocolatey 是给运维的，winget 是给所有人的**。三者可以共存。

## 学到什么

1. **包管理器的本质是"声明式安装脚本 + 路径管理"**——把"装什么"和"装在哪"分开
2. **shim 是个朴素但优雅的多版本切换技巧**——不动 PATH，只动 shim 指向
3. **manifest 仓库 = git 仓库** 是关键设计——任何人能 fork、贡献、自建私有源
4. **不要管理员权限**这条约束撬动了一切——所以 Scoop 装在用户目录，所以可以无痛卸载

## 延伸阅读

- 官方文档：[Scoop Wiki](https://github.com/ScoopInstaller/Scoop/wiki)
- manifest 格式说明：[App-Manifests](https://github.com/ScoopInstaller/Scoop/wiki/App-Manifests)
- 自建 bucket 教程：[Buckets](https://github.com/ScoopInstaller/Scoop/wiki/Buckets)
- [[homebrew]] —— Scoop 的精神前辈，macOS 上同思路
- [[asdf]] —— 多语言版本管理器，与 Scoop 思路有重叠

## 关联

- [[homebrew]] —— Scoop 直接学 Homebrew 的 formula/tap 模型，把 Ruby DSL 换成 JSON
- [[asdf]] —— 多语言运行时管理器，shim 思路与 Scoop 完全一致
- [[nix]] —— 同样是"用户态包管理 + 不污染系统"，但走纯函数路线，复杂度高得多
- [[pnpm]] —— 同样有"硬链接到统一抽屉"的思路（Scoop 是按版本分目录，pnpm 是按内容寻址）

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
