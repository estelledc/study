---
title: Nix — 函数式声明式包管理与可重复构建
description: 纯函数式部署模型；nix-shell/devShell、flake 与 nixpkgs 超 12 万软件包的可复现环境
来源: 'https://github.com/NixOS/nix'
日期: 2026-06-05
分类: CLI
子分类: 命令行工具
难度: 高级
provenance: manual-read
---

## 是什么

**Nix** 是 Linux/macOS 等 Unix 上的**纯函数式包管理器**：每个包在唯一 store path（`/nix/store/...-package-version`）下构建，输入哈希决定输出路径，从而保证**可重复、可回滚、多版本并存**。常与 **nixpkgs**（巨型软件仓库）和 **NixOS**（声明式 Linux 发行版）搭配使用。

日常类比：如果 apt/brew 像「在家具城买现货」，Nix 像**宜家按图纸每次 CNC 同一件家具**——图纸（Nix 表达式）+ 原材料哈希不变，产物比特级一致；旧版本不会被子升级覆盖。

核心概念：

| 概念 | 含义 |
|------|------|
| nix store | 只读包存储，路径含内容 hash |
| derivation | 构建描述（.drv 文件） |
| flake | 现代入口：pin nixpkgs + 暴露 devShell/packages |
| nix-shell / nix develop | 一键进入项目依赖环境 |

## 为什么重要

不懂 Nix，现代「可复现 dev env」讨论会缺一块硬核选项：

- **解决「我机器上能跑」**：devShell 把 compiler、库、工具链锁在同一 closure
- **与 [[docker]] 互补**：Nix 偏构建时确定性；Docker 偏运行时隔离——NixOS 甚至能用 Nix 声明容器
- **nixpkgs 是最大开源包集合之一**：Repology 统计常居榜首
- **学习曲线陡峭但 payoff 高**：flake + home-manager 生态成熟后，dotfiles 也可声明式

## 核心要点

1. **纯函数式构建**：构建过程不能随意写 `/usr`（sandbox 限制），保证可复现；副作用要显式声明。

2. **flake.lock pin 输入**：`inputs.nixpkgs.url` + lock 文件让 CI 与同事用同一 nixpkgs commit——别 `--impure` 糊过去。

3. **home-manager / NixOS 分层**：Nix 管 package；NixOS module 管 systemd/用户；home-manager 管用户级配置——别混在一坨 legacy config.nix 里。

## 实践案例

### 案例 1：flake devShell 进项目

```nix
# flake.nix（简化）
{
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  outputs = { self, nixpkgs }: {
    devShells.x86_64-linux.default = with nixpkgs.legacyPackages.x86_64-linux; mkShell {
      buildInputs = [ python312 rustc cargo ffmpeg ];
    };
  };
}
```

```bash
nix develop   # 进入 shell，自带 python/rust/ffmpeg
```

Video-LLM 项目可 pin [[ffmpeg]]、[[decord]] 系统库版本，避免宿主机漂移。

### 案例 2：nix-shell 经典（无 flake）

```bash
nix-shell -p python312 nodejs_22 git --run "python --version"
```

临时一次性环境；长期项目推荐 flake + lock。

### 案例 3：安装 Nix 并查手册

```bash
# 安装见 https://nix.dev/tutorials/install-nix
nix --version
nix search nixpkgs ffmpeg
man nix-store
```

官方 nix.dev 教程比零散博客可靠。

### 案例 4：用 nix run 临时跑工具

```bash
# 不安装到 profile，一次性拉取 closure 执行
nix run nixpkgs#ffmpeg -- -version
nix run nixpkgs#jq -- '.name' package.json
```

适合 CI 脚本里「只要 ffmpeg 一锤子」而不污染全局环境。

## 踩过的坑

1. **单用户 vs 多用户安装**：macOS 上 multi-user 安装权限与 daemon 不同——装错后 store 权限修复很痛苦。

2. **flakes 未默认启用**：需在 `nix.conf` 加 `experimental-features = nix-command flakes`。

3. **第一次 build 极慢**：无 binary cache 时要本地编译 [[ffmpeg]] 等级别——配置 `substituters` 信任 hydra cache。

4. **与 brew 混用 PATH 污染**：nix develop  shell 里仍 source 了 brew 的 pkg-config 会导致 link 错库——进 shell 前清 PATH 或 `--pure`。

## 适用 vs 不适用场景

**适用：**

- 科研/ML 复现（pin CUDA、Python、系统 lib）
- 跨 Linux/macOS 团队统一 dev env
- NixOS 服务器声明式运维

**不适用：**

- 只想 `apt install` 五分钟的初学者（曲线太陡）
- Windows 原生（需 WSL）
- 不愿接受 store 体积膨胀（多版本并存占磁盘）

## 历史小故事（可跳过）

- **2003–2006**：Eelco Dolstra 博士论文提出 Purely Functional Software Deployment Model
- **2008+**：Nixpkgs 社区爆发
- **2020s**：flakes 成为事实标准；nix.dev 文档站上线
- **今**：与 [[homebrew]]、[[docker]] 形成 macOS 开发者三件套讨论

## 学到什么

- 可复现 = 输入哈希 + 沙箱构建 + lock 文件，不是「requirements.txt 够长」
- Nix 表达式是语言，不是 YAML 套壳——值得专门学半周
- devShell 对 Video AI 这种系统依赖多的栈尤其省心

## 延伸阅读

- nix.dev 安装与 First Steps
- Nix 手册：https://nix.dev/reference/nix-manual
- nixpkgs 仓库：https://github.com/NixOS/nixpkgs
- [[homebrew]] —— macOS 另一包管理对照
- [[docker]] —— 运行时隔离对照

## 关联

- [[homebrew]] —— macOS 传统包管理
- [[docker]] —— 容器化对照
- [[ffmpeg]] —— nixpkgs 常用来 pin 的版本
- [[just]] —— 任务 runner，可与 nix develop 组合
- [[direnv]] —— 若存在则自动进 devShell
- [[starship]] —— prompt；nix 用户常一起 dotfiles
- [[gitui]] —— 终端工具也可由 nixpkgs 提供

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[asdf]] —— asdf — 一个 CLI 管 Node/Python/Ruby 等几十种版本
- [[bevy]] —— Bevy — Rust 数据驱动 ECS 游戏引擎
- [[dagger]] —— Dagger — 用真正的编程语言写 CI pipeline
- [[decord]] —— Decord — Video-LLM 数据管线的高效视频解码库
- [[earthly]] —— Earthly — 把 Make 和 Dockerfile 揉一起的构建工具
- [[ffmpeg]] —— FFmpeg — 多媒体转码与封装瑞士军刀
- [[fish-shell]] —— fish-shell — 友好交互式命令行 Shell
- [[homebrew]] —— Homebrew — macOS 上一行命令装好软件的包管理器
- [[just]] —— just — 把 make 拆成两半，只留 ‘命令编排’ 那一半
- [[kakoune]] —— Kakoune — 多光标优先模态编辑器
- [[mise]] —— mise — 一条命令切换项目用的 Node/Python/Go 版本
- [[scoop]] —— Scoop — Windows 上的 Homebrew 风格命令行包管理器
- [[zephyr]] —— Zephyr — 一份代码树跑遍所有嵌入式芯片的开源 RTOS

