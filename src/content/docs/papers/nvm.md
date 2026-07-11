---
title: nvm — 在同一台机器上轻松切换 Node 版本
来源: nvm-sh/nvm GitHub 仓库（Tim Caswell 2010 首发，nvm-sh 社区维护）
日期: 2026-05-31
分类: 前端工具链
难度: 入门
---

## 是什么

nvm（**Node Version Manager**）是一个 bash 脚本，让你能在同一台机器上**装多个 Node.js 版本**，并随时按 shell 会话切换。日常类比：像衣柜里挂着几件不同尺码的衣服，出门前选一件穿——不用每次买新的再扔旧的。

你输入：

```bash
nvm install 20
nvm use 18
node --version    # v18.19.0
```

这台机器上**两个 Node 都在**。一个项目用 18，另一个用 20，互不干扰。

这件事看起来平平无奇，但前端开发里几乎没人能绕开它。

## 为什么重要

不用 nvm 之前，前端工程师常被这些问题困扰：

- 老项目锁了 Node 14，新项目要 Node 20——**全局只能装一个**怎么办
- 团队里有人 Node 16、有人 Node 18，跑出来结果不一样——**怎么对齐**
- 想试试 Node 22 新特性，但又怕**装坏了系统的 Node**
- CI 上要用某个特定版本，本地复现不了——**根因是版本不一致**

nvm 一句 `nvm use 14` 全部解决。它是 Node 生态里**最早被广泛接受**的版本管理工具，至今仍是事实标准。

## 核心要点

nvm 干的事可以拆成 **三步**：

1. **每个 Node 装在独立目录**：`~/.nvm/versions/node/v20.10.0/`、`~/.nvm/versions/node/v18.19.0/`……每个版本一个完整的 Node 安装，互不覆盖。

2. **改 PATH 实现切换**：`nvm use 18` 不挪文件，只是把当前 shell 的 `PATH` 环境变量改成 `~/.nvm/versions/node/v18.../bin:其它路径`。从此 shell 里输入 `node` 时，OS 沿 `PATH` 查到的第一个就是 Node 18。

3. **它不是程序而是 shell 函数**：nvm 必须被 `source` 进 shell（写在 `~/.zshrc` 或 `~/.bashrc` 里）。因为只有 shell 函数才能改父进程的环境变量——一个外部命令做不到这件事。

理解第三点，你就懂为什么 nvm "**只对当前 shell 生效**"——开个新终端可能就回到默认版本了。

## 实践案例

### 案例 1：项目锁定 Node 版本

在项目根目录创建 `.nvmrc`：

```
18.19.0
```

然后 `cd` 进项目，执行：

```bash
nvm use
# Found '/path/to/.nvmrc' with version <18.19.0>
# Now using node v18.19.0
```

团队里每个人 `cd` 进来 `nvm use` 一下，**版本立刻对齐**。CI 里也读这个文件，本地和线上彻底一致。

### 案例 2：临时跑命令不切全局

```bash
nvm exec 16 npm test
```

这条命令**只**在 Node 16 下跑 `npm test`，跑完 shell 还是原来的版本。比 `nvm use 16 → npm test → nvm use default` 三步省事。

### 案例 3：装最新长期支持版

```bash
nvm install --lts
nvm alias default lts/*
```

第一行装最新 LTS，第二行把它设为默认。以后开新 shell 自动用这个版本。

## 踩过的坑

1. **shell 启动变慢**：nvm.sh 有 1000+ 行 bash，每开一个终端都 source 一次，可能加 100-300ms 延迟。解决办法：用 lazy-load 包装，第一次输入 `nvm` / `node` / `npm` 时再加载。

2. **`~/.npmrc` 里设 prefix 会破坏 nvm**：很多老教程教你 `npm config set prefix ~/.npm-global`，这会让全局包装到 nvm 接管的目录之外，一切混乱。装 nvm 前先删掉这一行。

3. **Homebrew 装的 nvm 是坑**：官方明确不支持。Homebrew 把 nvm 装到 `/usr/local/opt/nvm`，但 nvm 自己希望在 `$HOME/.nvm`。混着用 PATH 会乱。建议用官方 install 脚本。

4. **fish shell 不原生支持**：nvm 是 bash 函数，fish 语法不兼容。要么换 fnm，要么装 fish-nvm 之类的 plugin。

5. **`.nvmrc` 不会自动 use**：进项目目录不会自动切版本。要么手动 `nvm use`，要么在 `~/.zshrc` 加 `chpwd` hook。

6. **Apple Silicon 老版本要 Rosetta**：Node 14 之前没出 ARM64 二进制，M1/M2/M3 上装 14 需要先开 Rosetta 2。

## 适用 vs 不适用场景

**适用**：

- macOS / Linux / WSL 上管理多个 Node 版本
- 团队用 `.nvmrc` 对齐版本
- 想试新版 Node 不想动系统的

**不适用**：

- **Windows 原生**：nvm 是 bash 脚本，原生 Windows 跑不了。用 nvm-windows（同名但完全不同的 Go 项目）或 fnm。
- **shell 启动速度敏感**：fnm（Rust 编译的二进制）启动快 30-100 倍。
- **项目级钉死版本**：volta 在 `package.json` 里写 `volta.node` 字段，进项目自动切，免手动 `use`。
- **容器里**：直接 `FROM node:20-alpine`，nvm 反而是负担。
- **多语言版本管理**：需要同时管 Python / Ruby / Erlang 时，asdf 一个工具搞定全部。

## 历史小故事（可跳过）

- **2010 年**：Tim Caswell（早期 Node.js 核心贡献者，也是 howtonode.org 作者）在 GitHub 上 Creationix 命名空间下发布第一版 nvm。原始动机就是他自己同时在维护几个 Node 项目，受不了反复重装。
- **2014 年前后**：项目搬到 `nvm-sh` 组织，社区接管维护。
- **2018 年**：以色列开发者 Schniz 用 Rust 写了 fnm，启动开销近乎为零，兼容 `.nvmrc`，开始抢 nvm 的份额。
- **2019 年**：LinkedIn 团队公开 Volta（也是 Rust 写的），主打 `package.json` 里钉死版本，进项目自动切。
- **2026-01-29**：nvm 发布 v0.40.4。尽管有 fnm / volta / asdf 等更现代的替代品，nvm 仍是**最广为人知**的那个——大量教程、CI 模板、Dockerfile 默认就用它。

## 学到什么

1. **PATH 是 Unix 最强的"配置开关"**：不动文件、不改全局，只改环境变量就能让"哪个 node 是 node"换人。这个思路在 pyenv / rbenv / asdf / direnv 上反复出现。

2. **shell 函数 vs 二进制的区别**：一个外部程序**改不了**调用它那个 shell 的环境变量（子进程改环境不影响父进程）。这就是 nvm 必须 source 不能直接执行的根本原因。

3. **"够用就是事实标准"**：nvm 性能不是最好、设计不是最优雅、Windows 还不支持，但**它最早出现 + 文档够全 + 装起来简单**，就一直是默认选项。fnm / volta 技术上更好但份额超不过它。

4. **工具链的代际更替很慢**：2018 年 fnm 比 nvm 快 30 倍，但 2026 年仍有大半项目用 nvm。开发者迁移成本远比想象大。

## 延伸阅读

- 官方仓库：[nvm-sh/nvm](https://github.com/nvm-sh/nvm)（README 极详细，遇到问题先查这里）
- fnm（Rust 替代品）：[Schniz/fnm](https://github.com/Schniz/fnm)
- volta（项目级钉死）：[volta.sh](https://volta.sh/)
- 启动加速 lazy-load：搜 "lazy load nvm zsh" 有大量配置片段
- [[homebrew]] —— Homebrew 装 nvm 不被官方支持的原因
- [[pnpm]] —— Node 包管理器现代选择，nvm 管 Node 版本，pnpm 管包

## 关联

- [[homebrew]] —— macOS 包管理器；很多人会用 Homebrew 装 nvm，但官方不推荐
- [[pnpm]] —— nvm 管 Node 版本，pnpm 管 npm 包，两者职责不重叠
- [[react-server-components]] —— RSC 对 Node 版本要求严格（Node 18.17+），是 nvm 价值的典型场景
- [[nix]] —— 把"包管理 + 版本管理"做成纯函数；思想上是 nvm 的"扩大无数倍"版本

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[mach-vm-1987]] —— Mach VM — 把虚拟内存抽象成"对象"，与硬件解耦
