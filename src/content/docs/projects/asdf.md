---
title: asdf — 一个 CLI 管 Node/Python/Ruby 等几十种版本
来源: https://github.com/asdf-vm/asdf
日期: 2026-08-27
分类: 基础设施
难度: 入门
trust:
  version: study-v2
  source_kind: project
  note_type: tool
  canonical_source: https://github.com/asdf-vm/asdf
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 150aaf051b3b88ac9ad73136d7e629bbdf332bd6
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 0.20.0
---

## 是什么

asdf 是一个**多运行时版本管理器**：一个 CLI，靠插件装 Node / Python / Ruby 等工具，再用 `.tool-versions` 按目录选版本。日常类比：以前每种语言一把秤（nvm、pyenv、rbenv）；asdf 是一把通用秤，刻度盘由插件提供。

固定 `v0.20.0` 的主程序是 Go 二进制，不再是塞进 shell 的函数。`cmd/asdf/main.go` 把版本写成 `0.20.0`；仓库根目录 `version.txt` 仍是 `0.15.0`，不能当发布号。

```bash
asdf plugin add nodejs
asdf set nodejs 20.10.0
asdf install
```

`asdf set` 默认在当前目录写 `.tool-versions`。`--home` / `-u` 写用户主目录；`--parent` / `-p` 改最近的父目录版本文件。两者不能同时开。

## 为什么重要

不按 0.16 之后的 Go 源码读，下面这些旧习惯会直接失败：

- 继续 `source ~/.asdf/asdf.sh`——升级文档要求改把 `$ASDF_DATA_DIR/shims` 放到 PATH 前面
- 继续写 `asdf local` / `asdf global` / `asdf shell` / `asdf update`——这些命令在 0.16 起删除或改成报错
- 以为 shim 已经变成纯 Go——`Write()` 仍生成 `#!/usr/bin/env bash` 脚本，最后一行是 `exec asdf exec "name" "$@"`

## 核心要点

固定 0.20.0 的主链可以拆成五步：

1. **插件是 Git 仓库**：`asdf plugin add <name>` 无 URL 时，向默认索引 `https://github.com/asdf-vm/asdf-plugins.git` 查短名；有 URL 则直接 `git clone --depth 1`。插件名只允许小写字母、数字、`_`、`-`。
2. **装版本是回调，不是 asdf 自己编译**：`InstallOneVersion` 先可选跑 `bin/download`，再必须跑 `bin/install`。`system` 与 `path` 版本不能装。成功后 `shims.GenerateAll`。
3. **选版本先看环境变量**：`resolve.Version` 先读 `ASDF_<TOOL>_VERSION`（工具名大写，连字符变下划线），再从当前目录往上找 `.tool-versions`，最后回退到家目录。`.nvmrc` 这类 legacy 文件默认关，要在 `.asdfrc` 打开 `legacy_version_file`。
4. **shim 只是跳板**：PATH 上的 `node` 是 bash 小脚本；它把控制权交给 `asdf exec`，再由 `FindExecutable` 按当前目录解析真实二进制。
5. **核心是二进制，升级靠包管理器**：`asdf update` 只打印「已移除」并返回错误。数据目录默认 `~/.asdf`，可用 `ASDF_DATA_DIR` 覆盖。

插件文档把 `bin/list-all` 与 `bin/install` 标成 required，`bin/download` 与 `bin/list-bin-paths` 是常见可选回调。没有 `list-bin-paths` 时，可执行目录默认 `bin/`。

## 实践示例

### 案例 1：声明并安装

```bash
asdf plugin add nodejs
asdf plugin add python
cd my-project
asdf set nodejs 20.10.0
asdf set python 3.11.7
cat .tool-versions
asdf install
```

`asdf install` 无参数时，对当前目录解析到的每个已安装插件版本逐个 `Install`。已装过的版本返回 `VersionAlreadyInstalledError`，不会当致命失败单独中断整批。

### 案例 2：shim 实际做了什么

生成的 shim 形态是：

```bash
#!/usr/bin/env bash
# asdf-plugin: nodejs 20.10.0
exec asdf exec "node" "$@"
```

`asdf exec` 用当前工作目录调用 `FindExecutable`：读 shim 头里的插件/版本注释，再和目录向上解析出的版本求交，最后 `exec` 真实文件。类比：前台只记「谁能接这个分机」，真正接线的是 `asdf exec`。

### 案例 3：家目录回退 vs 当前目录

```bash
asdf set --home nodejs 22.11.0
asdf set nodejs 20.10.0
```

第一行写 `$HOME/.tool-versions`，第二行写当前目录。进入项目目录时，解析器先命中当前文件，不会用家目录值盖住它。环境变量 `ASDF_NODEJS_VERSION` 比两种文件都更优先。

## 踩过的坑

1. **升级后还 source `asdf.sh`**：0.16+ 要求 PATH 指向 shims 目录；旧函数入口会让你以为命令不存在或仍是 Bash 版。
2. **把 `asdf set` 当成旧的 global**：默认只写当前目录。要写家目录必须 `--home`。
3. **`asdf update` 自升级**：命令还在，但固定文本说明已移除，退出为错误。
4. **插件短名仓库被关掉**：`disable_plugin_short_name_repository` 为真且没给 Git URL 时，`plugin add` 直接失败。
5. **把 `version.txt` 当成 0.20.0**：发布号以 `cmd/asdf/main.go` 的 `version` 与 tag `v0.20.0` 为准。

## 适用 vs 不适用场景

**适用**：

- 一个仓库要锁多种运行时，并用同一份 `.tool-versions`
- 团队/CI 用同一套插件回调装版本
- 已有 asdf 插件生态，并接受「shim → `asdf exec`」这条路径

**不适用**：

- 只要一种语言、已经在用 nvm / pyenv，没有统一入口的需求
- 原生 Windows：FAQ 只承诺 WSL2 且工作目录在 Unix 盘；WSL1 明确不官方支持
- 要把系统库和编译工具一并锁死——那是 [[nix]] 的合同，不是 asdf 插件协议
- 需要把「比 mise 快/慢多少」写成事实——本文没有测启动时间

## 固定版本边界

- 本文绑定 `asdf-vm/asdf@150aaf051b3b88ac9ad73136d7e629bbdf332bd6`。lightweight tag `v0.20.0` 指向该提交；`go.mod` 为 `go 1.26.3`。
- 0.16.0 起主程序改为 Go；0.20.0 的 changelog 只记录 `ASDF_TOOL_VERSIONS_FILENAME` 无效值警告、插件浅克隆和 nushell completion，不改变上述主链。
- LICENSE 仍是 2014 Akash Manohar J 的 MIT；CLI `Copyright` 字段写的是 2024 Trevor Brown。
- 未安装二进制、未跑插件回调或上游测试，状态保持 `UNVERIFIED`。

## 学到什么

1. **「一个 CLI 管多语言」靠的是插件回调，不是核心认识每种语言**。
2. **Go 重写删的是 shell 函数能力**（改当前 shell 环境、自升级），不是 `.tool-versions` 或 shim 协议。
3. **版本解析是有序回退**：环境变量 → 目录向上 → 家目录，没有真正的全局锁定。
4. **发布号要以 tag 与 `main.go` 为准**——仓库里可能留下过期的 `version.txt`。

## 应用型自测

1. 在 0.20.0 里运行 `asdf local nodejs 20.10.0` 还会写 `.tool-versions` 吗？
2. shim 文件本身会打开 `.tool-versions` 并 `exec` 真实 `node` 吗？
3. `ASDF_NODEJS_VERSION=18.20.0` 存在时，当前目录的 `.tool-versions` 还会生效吗？

检查点：

1. 不会。`local` / `global` 已删除；应使用 `asdf set`。
2. 不会。shim 只 `exec asdf exec "node" "$@"`，解析发生在 Go 的 `FindExecutable`。
3. 不会。`resolve.Version` 先读环境变量并直接返回。

## 延伸阅读

- 官方文档：[asdf-vm.com](https://asdf-vm.com)
- 固定源码：[asdf-vm/asdf](https://github.com/asdf-vm/asdf) —— 本文绑定提交 `150aaf051b3b88ac9ad73136d7e629bbdf332bd6`
- 0.16 升级说明：[Upgrading to 0.16.0](https://asdf-vm.com/guide/upgrading-to-v0-16.html)
- 插件脚本：[Create a Plugin](https://asdf-vm.com/plugins/create.html)
- [[mise]] —— 兼容插件协议的另一种实现；快慢对比不在本文范围内
- [[nvm]] / [[pyenv]] —— 单语言对照

## 关联

- [[mise]] —— 同样吃 asdf 插件，实现与性能主张以 mise 固定源码为准
- [[nvm]] —— 只管 Node
- [[pyenv]] —— 同样用 shim，但是单语言
- [[homebrew]] —— 用 Cellar + symlink，不是按目录解析 `.tool-versions`
- [[nix]] —— 锁到系统依赖一层

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[papers/scoop]] —— Scoop — Windows 上像 Homebrew 一样装命令行工具
- [[dive]] —— dive — 看清 Docker 镜像每一层加了什么文件的 TUI
- [[projects/nvm]] —— nvm — 在同一台机器上轻松切换 Node 版本
- [[pyenv]] —— pyenv — 用 shim 把 python 命令拦截后路由到指定版本
- [[projects/scoop]] —— Scoop — Windows 上的 Homebrew 风格命令行包管理器
- [[volta]] —— Volta — cd 进项目就自动换 Node 版本的工具链管理器
