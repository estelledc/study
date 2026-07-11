---
title: Nix — 函数式声明式包管理与可重复构建
来源: 'https://github.com/NixOS/nix'
日期: 2026-06-05
分类: CLI
难度: 高级
---

## 是什么

**Nix** 是 Linux/macOS 等 Unix 上的**纯函数式包管理器**：每个包装在唯一路径 `/nix/store/<hash>-name` 下，输入变了 hash 就变，从而**可重复、可回滚、多版本并存**。常与 **nixpkgs**（巨型软件仓库）和 **NixOS**（用 Nix 声明整台系统的发行版）搭配。

日常类比：apt/brew 像「家具城买现货」；Nix 像**宜家按同一张图纸每次 CNC 同一件家具**——图纸（Nix 表达式）和原材料哈希不变，产物就一致；旧版本不会被子升级覆盖。

四个词先用人话桥接：

| 概念 | 人话 |
|------|------|
| nix store | 只读仓库，路径里带着内容指纹 |
| derivation | 一张「怎么构建」的配方单（`.drv`） |
| flake | 现代入口：钉死 nixpkgs 版本，并露出 devShell/packages |
| nix develop | 一键走进项目依赖齐备的临时壳 |

## 为什么重要

不懂 Nix，现代「可复现开发环境」讨论会缺一块硬核选项：

- **解决「我机器上能跑」**：devShell 把编译器、库、工具链锁在同一闭包（closure）
- **与 [[docker]] 互补**：Nix 偏构建时确定性；Docker 偏运行时隔离
- **nixpkgs 体量极大**：Repology 等统计里常居开源包集合前列
- **曲线陡但回报高**：flake + home-manager 成熟后，连 dotfiles 都能声明式管理

## 核心要点

1. **纯函数式构建**：沙箱里不能随便写 `/usr`；副作用要显式声明。类比：厨房只准用菜谱上的原料，做出的菜才能复现。

2. **flake.lock 钉输入**：`inputs.nixpkgs.url` + lock 让 CI 与同事用同一 nixpkgs commit——别靠 `--impure` 蒙混。

3. **分层别搅成一锅**：Nix 管软件包；NixOS module 管系统服务；home-manager 管用户配置——别全塞进一个 legacy `config.nix`。

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

**逐部分解释**：

- `inputs` 声明从哪拉 nixpkgs；首次会生成 `flake.lock` 钉 commit
- `mkShell` + `buildInputs` 列出进壳就有的工具
- 适合把系统库版本和同事锁死，避免「宿主机漂移」

### 案例 2：nix-shell 一次性环境

```bash
nix-shell -p python312 nodejs_22 git --run "python --version"
```

**逐部分解释**：

- `-p` 临时拉取几个包进 PATH，跑完即弃
- 适合试命令；长期项目仍推荐 flake + lock

### 案例 3：nix run 不装进 profile

```bash
nix run nixpkgs#ffmpeg -- -version
nix run nixpkgs#jq -- '.name' package.json
```

**逐部分解释**：

- 不写入用户 profile，只拉 closure 执行一次
- CI 脚本里「只要 ffmpeg 一锤子」时很干净

## 踩过的坑

1. **单用户 vs 多用户安装**：macOS 上 multi-user 权限与 daemon 不同——装错后 store 权限修复很痛苦。

2. **flakes 未默认启用**：需在 `nix.conf` 加 `experimental-features = nix-command flakes`。

3. **第一次 build 极慢**：没配 binary cache 时，本地编译 ffmpeg 级大包可能要数十分钟——先配 `substituters` 信任官方 cache。

4. **与 brew 混用 PATH 污染**：nix develop 壳里若仍 source brew 的 pkg-config，会 link 错库——进壳用 `--pure` 或先清 PATH。

## 适用 vs 不适用场景

**适用：**

- 科研/ML 复现：需要 pin CUDA、Python、系统 lib 到同一闭包
- 跨 Linux/macOS 团队统一 dev env（lock 文件对齐）
- NixOS 服务器声明式运维；能接受 store 占数 GB～数十 GB 磁盘

**不适用：**

- 只想 `apt install` 五分钟上手（学习曲线按天计，不是按小时）
- Windows 原生（需 WSL）；无 cache 时首次构建可能 >30 分钟
- 磁盘紧张又不愿意做 `nix-collect-garbage` 的场景

## 历史小故事（可跳过）

- **2003–2006**：Eelco Dolstra 博士论文提出 Purely Functional Software Deployment Model（学位约 2006）
- **2008+**：Nixpkgs 社区包数量爆发
- **2020s**：flakes 成事实标准；nix.dev 文档站上线
- **今**：与 [[homebrew]]、[[docker]] 并列，成为「可复现环境」常见对照选项

## 学到什么

1. **可复现 = 输入哈希 + 沙箱构建 + lock**，不是「依赖列表写得够长」
2. **Nix 表达式是一门语言**，不是 YAML 套壳——值得专门学几天
3. **devShell 对系统依赖多的栈最省心**：编译器、动态库、CLI 一次锁齐
4. **和容器分工**：Nix 管「构建确定性」，Docker 管「运行隔离」，可以组合不必二选一
5. **回滚是一等公民**：旧 store path 还在，切换配置不必怕「升坏了回不去」

## 延伸阅读

- nix.dev 安装与 First Steps：https://nix.dev/
- Nix 手册：https://nix.dev/reference/nix-manual
- nixpkgs 仓库：https://github.com/NixOS/nixpkgs
- Dolstra 论文线索：Purely Functional Software Deployment Model（博士论文，约 2006）
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
