---
title: Nix — 把每个软件包当成纯函数的输出
来源: https://github.com/NixOS/nix
日期: 2026-05-31
分类: 包管理 / 系统
难度: 中级
---

## 是什么

Nix 是**用纯函数式思想做出来的包管理器**——把"装一个软件"看成"算一个函数"：输入（源码、依赖、构建脚本）经过哈希，得到一个**唯一不可变**的路径 `/nix/store/<32 字符哈希>-<name>-<version>`。同一输入永远算出同一路径；输入变了路径就跟着变。

日常类比：传统包管理器（apt、Homebrew）像把所有书堆在同一书架上，新书直接覆盖旧书；Nix 像图书馆给每本书一个唯一编号，永远不覆盖，要哪本就按编号取。新版本来了不是替换，而是新加一本——旧的还在，随时翻回去。

截至 2026-05，Nix 仓库 13k+ stars，NixOS 基于它做了一整套 Linux 发行版。

## 为什么重要

不理解 Nix 的"纯函数"内核，下面这些事都没法解释：

- 为什么 `nix-env --rollback` 一秒钟就能把翻车的升级回滚——而 `apt` 翻车后只能重装系统
- 为什么同一台机器上 Python 2.7 / 3.9 / 3.11 可以并存不打架——共享路径的包管理器做不到
- 为什么 Nix 表达式 10 年前写的、今天 build 出来的二进制可以**逐字节相同**——内容寻址保证
- 为什么"声明式系统"是真东西不是营销词——NixOS 把整台机器写在一个文件里，重装即生效

## 核心要点

Nix 的设计可以拆成 **三条**：

1. **内容寻址 store**：每个包装在 `/nix/store/<hash>-<name>` 里，hash 由"全部输入"算出。同输入同 hash，不同输入不同 hash。类比：每本书自带 ISBN，按号上架，永不冲突。

2. **derivation 是构建配方**：`.drv` 文件描述"怎么从输入造出这个包"——纯文本、可读、可哈希。Nix 不存"构建过程"，存"配方 + 结果"，配方一致就跳过重建。类比：菜谱（derivation）+ 成品照片（store path），下次照菜谱做出来一样就直接拿照片。

3. **profile / generation 切换**：用户当前用的包集合是一组**符号链接**，每次安装/升级都生成一个新版本。回滚就是把符号链接指回旧 generation——因为旧 store path 还在，**没被覆盖**。

这三条加起来叫 **"纯函数式部署"** 的判断——和 Hindley-Milner 把"类型推导"变成纯函数同源（[[hindley-milner]]）。

## 实践案例

### 案例 1：临时 shell 不污染系统

```bash
nix-shell -p python3 nodejs ffmpeg
# 进入一个 shell，三样工具都能用
which python3
# /nix/store/abc123...-python-3.11.6/bin/python3
exit
# 退出后系统什么都没装
```

**逐部分解释**：

- `-p` 后面是想要的包，Nix 现场算出每个包的 store path
- shell 内 `$PATH` 临时指向这些 path，所以工具能用
- 退出 shell 后这些路径**还在 store 里**（下次 `nix-shell` 直接用，不重下），但 `$PATH` 没了 → 系统视角"什么都没装过"

### 案例 2：升级翻车 1 秒回滚

```bash
nix-env -iA nixpkgs.firefox       # 装 firefox（generation N）
nix-env -u                         # 全量升级（generation N+1）
firefox                            # 翻车，新版有 bug
nix-env --rollback                 # 一秒钟回到 generation N
firefox                            # 旧版回来了
```

为什么这么快：旧 generation 的 store path 从来没被删——升级不是覆盖，是**新增 + 切链接**。回滚只切链接。

### 案例 3：可重现构建

```nix
# default.nix
{ pkgs ? import <nixpkgs> {} }:
pkgs.stdenv.mkDerivation {
  name = "hello-world";
  src = ./.;
  buildInputs = [ pkgs.gcc ];
  buildPhase = "gcc hello.c -o hello";
  installPhase = "mkdir -p $out/bin; cp hello $out/bin/";
}
```

```bash
nix-build               # 在我的机器
# /nix/store/xyz789...-hello-world

# 同一份 default.nix 在另一台机器、3 年后跑
nix-build
# /nix/store/xyz789...-hello-world  ← 同一个 hash
```

只要输入（源码 + nixpkgs commit + 构建脚本）一致，输出 hash 必然一致。**没装 Docker，没用容器，靠的是输入闭包**。

## 踩过的坑

1. **学习曲线陡**：Nix 表达式语言是另一门函数式 DSL。新手看 `let { ... } in pkgs.callPackage ./pkg.nix {}` 会直接劝退——它和 Python/JS 都不像。
2. **磁盘占用大**：`/nix/store` 多版本共存的代价是几十 GB 起步。`nix-collect-garbage` 能清没引用的，但要主动跑。
3. **第一次拉包慢**：依赖 binary cache（cache.nixos.org）；离线环境或网络差的地方等下载等到怀疑人生。
4. **Flakes 半新半旧**：2021 年发布、至今 experimental。教程里一半是旧 `nix-env` 一半是新 `nix flake`，新手分不清两套命令谁是谁。
5. **macOS 安装复杂**：要单独划一个 APFS volume 给 `/nix`，比 Linux 多几步——苹果 SIP 的限制不是 Nix 的锅，但要踩。
6. **调试构建失败要读 `.drv` 和 builder 脚本**——不像 `apt install` 失败那样一句报错就能看懂。

## 适用 vs 不适用场景

**适用**：

- 多版本共存的开发环境（前后端 + 数据库 + 工具链一起切）
- 可重现的 CI 构建（同一表达式在任何机器上结果一致）
- 声明式系统管理（NixOS：整台机器配置写一个文件，重装即生效）
- 替代 Docker 做轻量 dev shell——`nix-shell` 启动比容器快几倍

**不适用**：

- 只想 `brew install <thing>` 就完事——Nix 心智成本远高于 Homebrew
- Windows 原生（只有 WSL 里能跑）
- 团队里只有你一个人懂 Nix——Bus factor 1 是真问题
- 打包闭源专有软件（FHS 假设和 Nix store 路径冲突，要 `buildFHSEnv` 包一层）

## 历史小故事（可跳过）

- **2003 年**：Eelco Dolstra 在 Utrecht 大学开始博士研究，前导论文 ICSE 2004 / LISA 2004 提出"内容寻址 + 不可变 store"思路
- **2006 年**：博士论文 *The Purely Functional Software Deployment Model*，Nix 名字定型
- **2008 年**：NixOS 1.0 发布——基于 Nix 的 Linux 发行版，把"声明式系统"推到操作系统层
- **2012 年**：Guix 项目成立，借用 Nix 模型 + Scheme 语言重做了一套
- **2021 年**：Flakes 实验性发布，目标给 Nix 一个稳定可锁定的项目格式（类似 npm 的 `package-lock.json`）
- **2026 年**：Flakes 仍是 experimental，社区在 stable 化路上

→ 知道这个背景才理解：Nix 不是"凭空发明的工程工具"，是**把博士论文的纯函数模型落到操作系统**——理论先 3 年，工程才铺开。

## 学到什么

- **纯函数思想能跨域迁移**：HM 把类型推导变纯函数（[[hindley-milner]]），Nix 把部署变纯函数，Bazel 把构建变纯函数——同一思路换战场
- **内容寻址 + 不可变** 是分布式系统反复出现的设计模式：Git（commit hash）/ IPFS（内容 CID）/ Nix（store path）同源
- **声明式 > 命令式**：你描述"要什么状态"，工具负责怎么到达；比一步步 `apt install` 可重现得多
- **好工具的代价**：陡峭学习曲线 + 高磁盘占用换来"回滚 1 秒"和"零依赖污染"——是不是值，取决于你需求

## 延伸阅读

- [Nix Pills](https://nixos.org/guides/nix-pills/) —— 小步教程，20 多 pill 从零讲到能写 derivation
- [Zero to Nix](https://zero-to-nix.com/) —— DetSys 团队写的现代入门，主推 Flakes 路径
- [Dolstra PhD 论文 PDF](https://edolstra.github.io/pubs/phd-thesis.pdf) —— 240 页，第 2 章是核心模型
- [NixOS 官网](https://nixos.org/) —— 发行版 + 包索引（10 万+ 包）
- [[hindley-milner]] —— 同样是函数式思想跨域迁移的样本

## 关联

- [[hindley-milner]] —— 同源思路：HM 推类型，Nix 推依赖，都靠"同输入同输出"换可预测性
- [[lambda-calculus]] —— Nix 表达式语言核心是 lambda + 惰性求值
- [[mccarthy-lisp]] —— 函数式祖先；Nix 的 attribute set 思路借鉴了 Lisp
- [[standard-ml]] —— ML 是 HM 的第一个工业宿主，函数式工程化的早期样本

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[hindley-milner]] —— Hindley-Milner — 编译器自己猜变量类型
- [[homebrew]] —— Homebrew — macOS 上一行命令装好软件的包管理器
- [[lambda-calculus]] —— λ-演算 — 用三条规则表达所有可计算函数
- [[mccarthy-lisp]] —— McCarthy LISP 1960
- [[standard-ml]] —— Standard ML — 让编译器替你把类型补完

