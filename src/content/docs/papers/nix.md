---
title: Nix — 把每个软件包当成纯函数的输出
来源: Dolstra, "The Purely Functional Software Deployment Model", PhD thesis, Utrecht University, 2006
日期: 2026-05-31
分类: 包管理 / 系统
难度: 中级
---

## 是什么

Nix 是一个**把"装软件"当成纯函数来做**的包管理器。日常类比：传统包管理器像把书堆在同一书架上，新书覆盖旧书；Nix 像图书馆给每本书一个唯一编号——要哪本就按编号取，永不覆盖。

每个包的最终路径长这样：

```
/nix/store/abc123...xyz-python-3.11.4/
```

前面那串 32 字符是哈希，由"源码 + 依赖 + 构建脚本"算出来。**输入一变，哈希就变，路径就变**。所以同一台机器上 Python 2.7 / 3.9 / 3.11 可以同时存在，互不干扰。

## 为什么重要

不理解 Nix，下面这些事都没法解释：

- 为什么 NixOS 用户敢说"升级翻车？切回上一个 generation，1 秒搞定"
- 为什么 10 年前的 Nix 表达式今天还能 build 出 bit-for-bit 一样的二进制
- 为什么 `nix-shell -p python3 nodejs ffmpeg` 能凭空给你一个干净 shell，退出后不留痕
- 为什么函数式思想能从类型推导（HM）一路扩散到部署、构建、CI

## 核心要点

Nix 的整套设计可以拆成 **三件事**：

1. **Store path**：每个包住在 `/nix/store/<哈希>-<名字>` 下，**只读**。哈希由所有输入（源码 + 依赖 + 构建脚本 + 编译参数）决定，类比"内容寻址"——和 Git 的 object id、IPFS 的 CID 一个思路。哈希一变路径一变，同名不同版本不打架。

2. **Derivation（.drv 文件）**：描述"如何造一个包"的纯函数定义——输入是什么、构建脚本是什么、输出名字叫什么。Nix 求值器读完 .drv 就能算出**最终 store path 哈希**，连构建都不用真跑（如果 binary cache 里已经有结果就直接拉）。

3. **Profile / generation**：你**当前在用**的包集合。每次安装/升级/切换都生成一个新版本号（generation），旧版本不删。**回滚就是把 `~/.nix-profile` 这个符号链接指回上一代**。整个系统都在符号链接的迷宫里运作。

三件事加起来：**同输入同输出 + 不可变 + 多版本共存**。这就是"纯函数式部署"——你输入一份描述，Nix 像执行纯函数一样产出确定结果。

## 实践案例

### 案例 1：回滚一秒钟

```bash
nix-env -u           # 升级所有包（万一翻车了）
nix-env --rollback   # 切回上一个 generation
```

底层只是把 `~/.nix-profile` 这个符号链接指回旧 store path。**没有 reinstall，没有降级**——旧版本的文件本来就还在。

### 案例 2：临时 shell

```bash
nix-shell -p python3 nodejs ffmpeg
```

进去之后这三样都在 PATH 里。`exit` 退出，**系统干干净净**——这些包没"装"过，只是临时挂进了 PATH。一次性脚本特别好用。

### 案例 3：声明式系统配置（NixOS）

```nix
# /etc/nixos/configuration.nix
{
  services.postgresql.enable = true;
  environment.systemPackages = with pkgs; [ vim git ];
  users.users.alice = { isNormalUser = true; };
}
```

`nixos-rebuild switch` 一下，整台机器达到这个状态。**重装系统？把这个文件 copy 过去再 rebuild，机器一字不差**——包括服务、用户、内核参数全部一致。这是把"系统状态"也当成纯函数输出的极端做法。

### 案例 4：Nix 怎么算哈希

```
输入：python-3.11 源码 tarball
   + glibc 的 store path（已经是哈希）
   + openssl 的 store path（已经是哈希）
   + 构建脚本 default.nix
   ↓ SHA-256
输出：/nix/store/h7q8...x9-python-3.11.4
```

所有输入都已经被哈希过，所以**整条依赖图都是内容寻址**。修改 openssl 一个字符，python 的哈希也变——这叫"传染性重建"，缺点是改底层库要重 build 半个世界，优点是依赖污染零可能。

## 踩过的坑

1. **学习曲线很陡**：Nix 表达式语言是另一门函数式语言。新手第一次看到 `pkgs.callPackage ./foo.nix { }` 配上 `let ... in` 直接劝退。准备好啃几天文档。

2. **磁盘占用大**：多版本共存的代价是 `/nix/store` 几十 GB 起步。要定期 `nix-collect-garbage` 回收没在用的旧版本。

3. **Flakes 是 experimental，但教程一半新一半旧**：旧教程用 `nix-env` / `nix-shell`，新教程用 `nix flake` / `nix develop`。新手两边乱抄会卡住——**先认准一套**（推荐 Flakes，是未来）。

4. **macOS 安装麻烦**：要单独划分一个 APFS volume 给 `/nix`，因为 macOS 系统盘只读不让动根目录。Determinate Systems 的安装器把这步自动化了。

5. **Bus factor**：团队里只有你一个人懂 Nix，你休假时同事改不动。引入前先问"这套学习成本组里愿意付吗"。

6. **报错可读性差**：构建失败要读 `.drv` 和 builder 脚本，不像 `apt` 那样一句 error 就能看懂。新手常常 build 半小时然后挂在某个奇怪的 cmake flag 上。

## 适用 vs 不适用场景

**适用**：

- 多版本共存的开发环境（同一项目同时跑 Node 18 和 Node 20 测试）
- 可重现 CI（一份 flake.nix，所有机器结果一致）
- 声明式系统管理（NixOS：整机配置一份文件）
- 替代 Docker 做轻量 dev shell（启动比容器快）

**不适用**：

- 只想快速 `brew install <thing>` 的日常场景——Nix 心智成本远高于 Homebrew
- Windows 原生环境（只有 WSL 里能跑）
- 团队里只有你懂 Nix——一个人扛不动一套基础设施
- 闭源专有软件——传统 FHS 假设和 Nix store 路径冲突，要 `buildFHSEnv` 包一层

## 历史小故事（可跳过）

- **2003 年**：Eelco Dolstra 在乌特勒支大学开始博士研究，前导论文 ICSE 2004 / LISA 2004
- **2006 年**：博士论文 *The Purely Functional Software Deployment Model* 答辩通过，Nix 命名定型
- **2008 年**：NixOS 1.0 发布——一个完全用 Nix 模型搭起来的 Linux 发行版
- **2012 年**：Guix 项目成立，借用 Nix 模型，把表达式语言换成 Scheme
- **2021 年**：Flakes 实验性引入，目标是给 Nix 一个稳定可锁定的项目格式
- **2026 年**：Flakes 仍在 experimental 状态，社区在 stable 化路上

## 学到什么

1. **纯函数思想能跨域迁移**：从类型推导（HM）到部署（Nix）到构建（Bazel），思路一致——同输入同输出换可预测性
2. **内容寻址 + 不可变** 是分布式系统反复出现的设计模式，Git / IPFS / Nix 同源
3. **声明式 > 命令式**：你描述"要什么状态"，工具负责怎么到达；比一步步 `apt install` 可重现得多
4. **好工具有代价**：陡峭学习曲线 + 高磁盘占用换"回滚一秒 + 零依赖污染"——是不是值，看场景

## 延伸阅读

- 博士论文 PDF：[Dolstra 2006](https://edolstra.github.io/pubs/phd-thesis.pdf)（240 页，第 2 章是核心）
- 小步教程：[Nix Pills](https://nixos.org/guides/nix-pills/)（20 多 pill，从零到能写 derivation）
- 现代入门：[Zero to Nix](https://zero-to-nix.com/)（Determinate Systems 出品，主推 Flakes）
- 官网：[NixOS](https://nixos.org/)
- [[hindley-milner]] —— 同样是函数式思想跨域迁移：HM 推类型，Nix 推依赖

## 关联

- [[hindley-milner]] —— 函数式思想跨域：一个推类型，一个推依赖路径
- [[lambda-calculus]] —— Nix 表达式语言核心是 lambda + 惰性求值
- [[mccarthy-lisp]] —— 函数式祖先；Nix 的 attribute set 借鉴 Lisp 思路
- [[standard-ml]] —— 同时代另一个把"函数式 + 工程"绑到一起的尝试

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[asdf]] —— asdf — 一个 CLI 管 Node/Python/Ruby 等几十种版本
- [[buildroot]] —— Buildroot — 30 分钟从零搭出一个嵌入式 Linux
- [[dagger]] —— Dagger — 用真正的编程语言写 CI pipeline
- [[earthly]] —— Earthly — 把 Make 和 Dockerfile 揉一起的构建工具
- [[hindley-milner]] —— Hindley-Milner — 编译器自己猜变量类型
- [[homebrew]] —— Homebrew — macOS 上一行命令装好软件的包管理器
- [[just]] —— just — 把 make 拆成两半，只留 ‘命令编排’ 那一半
- [[lambda-calculus]] —— λ-演算 — 用三条规则表达所有可计算函数
- [[mccarthy-lisp]] —— McCarthy LISP 1960
- [[mise]] —— mise — 一条命令切换项目用的 Node/Python/Go 版本
- [[nix]] —— Nix — 把每个软件包当成纯函数的输出
- [[scoop]] —— Scoop — Windows 上的 Homebrew 风格命令行包管理器
- [[standard-ml]] —— Standard ML — 让编译器替你把类型补完
- [[zephyr]] —— Zephyr — 一份代码树跑遍所有嵌入式芯片的开源 RTOS

