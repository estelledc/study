---
title: nvm — 在同一台机器上轻松切换 Node 版本
来源: https://github.com/nvm-sh/nvm
日期: 2026-05-31
子分类: 命令行工具
分类: CLI
难度: 入门
provenance: pipeline-v3
---

## 是什么

nvm（**N**ode **V**ersion **M**anager）是一个让你在同一台机器上**装多个 Node.js 版本，并随时切换**的工具。日常类比：像家里换灯泡——同一个灯座（你的电脑），可以换 5W、10W、20W 不同灯泡（不同 Node 版本），不用拆整盏灯。

你敲：

```bash
nvm install 20      # 装 Node 20
nvm install 18      # 再装一个 Node 18
nvm use 18          # 当前终端切到 18
node -v             # → v18.x.x
```

nvm 本身**不是一个二进制**，而是一个被 source 进 shell 的 bash 脚本。它的全部魔法只是修改 `PATH` 环境变量，把"当前要用的 Node 版本"目录排在最前面。

GitHub 上有 81k star，是 Node 生态的事实标准。

## 为什么重要

不懂版本管理器，下面这些事都搞不定：

- 老项目用 Node 14、新项目用 Node 20，不能切换就只能开两台机器
- 团队 `.nvmrc` 写死了 18.17.1，本地用 20 跑出来的结果可能和 CI 不一致
- 想试 Node 22 新特性，又怕装上去把工作搞挂
- 看 GitHub issue 时别人贴 `nvm use && npm test` 你不知道是什么

## 核心要点

1. **靠 PATH 切换，不动系统 Node**：每个版本装在 `~/.nvm/versions/node/v20.10.0/` 这种独立目录里。`nvm use 20` 只是把这个目录前置到 `PATH` 最前。

2. **per-shell 生效，不是全局**：A 终端 `nvm use 18`，B 终端依然是默认版本。这是 PATH 的天然属性——环境变量只对当前进程生效。

3. **`.nvmrc` 锁定项目版本**：项目根目录放一个文件 `.nvmrc` 内容写 `18.17.1`，团队每个人 `cd` 进来后跑 `nvm use` 就自动切到 18.17.1。CI 也读它。

4. **bash 脚本，不是编译型**：意味着每次开新 shell 都要 source 一遍 `nvm.sh`（约 20KB bash），冷启动可能加 100-300ms。

## 实践案例

### 案例 1：装好后第一次用

```bash
# 装 nvm（一次性）
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.4/install.sh | bash

# 重开终端后
nvm install --lts        # 装最新 LTS
nvm install 20           # 装 Node 20
nvm ls                   # 列已装版本
nvm alias default 20     # 把 20 设为新终端的默认
```

### 案例 2：项目级版本锁定

```bash
cd my-project
echo "18.17.1" > .nvmrc      # 团队约定用 Node 18.17.1
nvm use                       # nvm 读 .nvmrc 自动切
# 输出：Now using node v18.17.1
```

CI 里也能用：GitHub Actions 的 `actions/setup-node` 直接读 `.nvmrc`，零配置。

### 案例 3：临时用某版本跑一次命令

```bash
nvm exec 16 npm test     # 当前 shell 不切，用 16 跑一次 test
```

适合"我只想验证下这个 bug 在 Node 16 上是否存在"的快速检查。

## 踩过的坑

1. **shell 启动变慢**：source `nvm.sh` 是 bash 脚本，开新终端冷启动加 100-300ms。重度用户用 lazy-load wrapper（在第一次调 `nvm` 时才真正 source）能缓解。

2. **`.nvmrc` 不会自动触发 `use`**：单纯 `cd` 进项目目录不会切版本，需要手敲 `nvm use`，或在 zsh `chpwd` hook 里挂自动切换。新人最常踩。

3. **Homebrew 装的 nvm 不被官方支持**：`brew install nvm` 装出来的版本路径与官方安装脚本不同，PATH 容易乱。官方文档明确说"用 curl 安装脚本，不要用 brew"。

4. **`~/.npmrc` 里写 `prefix` 会破坏 nvm**：老教程会让你设 npm prefix，但这会让 npm 全局包装到 nvm 目录之外，切版本就找不到了。删掉 prefix 就行。

5. **Windows 原生不支持**：`nvm-sh/nvm` 只支持 macOS/Linux/WSL。Windows 用户要用名字像但完全独立的 [nvm-windows](https://github.com/coreybutler/nvm-windows)（Go 写的），命令兼容但实现不同。

## 适用 vs 不适用场景

**适用**：

- 个人开发，需要同时维护多个 Node 版本的项目
- 团队约定 `.nvmrc` 锁版本
- 想试新版 Node 又不想覆盖系统版本
- macOS / Linux / WSL 环境

**不适用**：

- Windows 原生（用 nvm-windows 或 fnm）
- shell 启动速度敏感（fnm / volta 更合适，编译型二进制零启动开销）
- 项目级版本钉死且不想手敲 `use`（volta 在 `package.json` 里写 `volta.node` 自动钉死）
- 容器化场景（直接 `FROM node:20` 即可，不需要切换）

## 同类对比

| 工具 | 实现 | 卖点 | 缺点 |
|------|------|------|------|
| **nvm** | bash 脚本 | 81k star 事实标准、生态最成熟 | shell 启动慢、Windows 不原生 |
| **fnm** | Rust 二进制 | 启动快 30-100 倍、兼容 `.nvmrc` | 较新、生态稍弱 |
| **volta** | Rust 二进制 | 项目级版本钉死，无需 `use` | 生态较小 |
| **n** | bash 脚本 | 最简单粗暴，直接装到 `/usr/local` | 不靠 PATH 切换，会污染系统 |
| **asdf** | bash 脚本 | 多语言版本管理（Node/Python/Ruby/...） | 配置复杂 |

零基础推荐：先 nvm 入门，遇到 shell 启动慢问题再换 fnm。

## 历史小故事（可跳过）

- **2010 年**：Tim Caswell 在 GitHub 发布第一版 nvm（在 Creationix 命名空间下）。当时 Node.js 才 1 岁，版本变化飞快，用户急需切换工具。
- **2014 年**：项目搬到 nvm-sh 组织，社区接管维护。
- **2018 年**：Schniz 发布 fnm（Fast Node Manager），Rust 实现，启动速度快 30-100 倍。
- **2019 年**：LinkedIn 团队发布 volta，主打项目级版本钉死。
- **2026-01-29**：nvm v0.40.4 发布，仍是事实标准。

## 学到什么

1. **环境变量 `PATH` 是 shell 切版本的底层机制**——nvm 只是给 PATH 操作套了个友好接口
2. **bash 脚本工具的代价**：功能强但启动慢；现代趋势是用 Rust/Go 重写（fnm/volta）
3. **per-shell 生效不是 bug 是 feature**：让你能在不同终端开不同版本同时工作
4. **生态地位 ≠ 技术先进**：nvm bash 实现并不"现代"，但 81k star 的工具链整合（CI、教程、IDE）让它依然是首选

## 延伸阅读

- 官方仓库 README：[nvm-sh/nvm](https://github.com/nvm-sh/nvm)（安装、命令、FAQ 都在这一页）
- 性能优化：[lazy-load nvm 加快 shell 启动](https://github.com/nvm-sh/nvm#deeper-shell-integration)
- 替代方案：[fnm](https://github.com/Schniz/fnm) / [volta](https://volta.sh)
- [[pnpm]] —— 包管理器层面的"按需安装"，与 nvm 在工具链光谱上互补
- [[homebrew]] —— macOS 包管理器；提示：**不要**用它装 nvm

## 关联

- [[pnpm]] —— 同样属于 Node 工具链；nvm 管 Node 版本，pnpm 管包
- [[homebrew]] —— macOS 包管理器；nvm 官方反对用 brew 安装自己
- [[asdf]] —— nvm 的多语言泛化版本，能管 Python/Ruby/Erlang 等

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[mach-vm-1987]] —— Mach VM — 把虚拟内存抽象成"对象"，与硬件解耦
- [[persistent-memory-2014]] —— PMFS — 第一个为字节寻址持久内存设计的文件系统
- [[pnpm]] —— pnpm — 全机器只存一份的 Node 包管理器
- [[pyenv]] —— pyenv — 用 shim 把 python 命令拦截后路由到指定版本

