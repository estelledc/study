---
title: FVM — 按项目锁定 Flutter SDK 版本
来源: https://github.com/leoafarias/fvm
日期: 2026-06-13
子分类: 移动端
分类: 后端 API
provenance: pipeline-v3
---

## 是什么

FVM（**F**lutter **V**ersion **M**anagement）是一个命令行工具，让你在**同一台机器上安装多个 Flutter SDK，并按项目切换版本**。日常类比：Flutter 项目像不同型号的螺丝刀——有的老项目必须用 3.16 的「十字头」，新项目要上 3.22 的「内六角」。FVM 不是让你买一整箱新工具，而是在工具柜里按项目标签取出对应型号，用完再放回，互不干扰。

和 Node 生态里的 nvm、Python 里的 pyenv 是同一类问题：官方 Flutter 安装通常只有「全局一份 SDK」。团队里 A 项目锁 3.16、B 项目跟 stable，CI 又要和 `.fvmrc` 一致——没有版本管理器就只能反复卸载重装，或者各开一台虚拟机。

典型用法：

```bash
cd my_flutter_app
fvm use 3.19.0          # 为当前项目钉住 Flutter 3.19.0
fvm flutter doctor      # 用项目版本跑 doctor
fvm flutter run         # 用项目版本编译运行
```

FVM 在 GitHub 上由 Leo Farias 维护（[leoafarias/fvm](https://github.com/leoafarias/fvm)），文档站 [fvm.app](https://fvm.app)，MIT 许可，Dart 实现，是 Flutter 社区事实上的 SDK 版本管理方案。

## 为什么重要

不写 FVM，下面这些场景都会踩坑：

- 本地 `flutter --version` 是 3.22，同事和 CI 用 3.19，你本地能跑、线上构建失败
- 想试 Flutter beta 新特性，又怕覆盖全局 SDK 把老项目搞挂
- 打开 IDE 后 Dart Analysis 报一堆错，其实是 IDE 指向了错误的 Flutter 路径
- 看团队 README 写「先 `fvm install` 再构建」，不知道 `.fvmrc` 和 `.fvm/flutter_sdk` 是干什么的
- Monorepo 里多个 App 需要不同 Flutter 版本，只能手动改 PATH

FVM 把「用哪个 Flutter」从个人习惯变成**可提交、可复现的项目配置**。

## 核心概念

### 1. 缓存目录 vs 项目链接

FVM 下载的 SDK 放在统一缓存里（默认类似 `~/.fvm/versions/`），不会每个项目各拷一份完整 SDK。`fvm use 3.19.0` 会在项目里创建 `.fvm/flutter_sdk` **符号链接**，指向缓存中的 3.19.0。类比：图书馆只有一套藏书（缓存），每个项目组领一张「指向第几排书架」的索引卡（symlink）。

### 2. `.fvmrc` — 项目的版本契约

在项目根目录运行 `fvm use` 后会生成 `.fvmrc`（或更新其中的 JSON），记录本项目应使用的 Flutter 版本，可含 flavors、是否自动改 VS Code 设置等：

```json
{
  "flutter": "3.19.0",
  "flavors": {
    "development": "beta",
    "production": "3.19.0"
  },
  "updateVscodeSettings": true,
  "updateGitIgnore": true,
  "runPubGetOnSdkChanges": true
}
```

团队应**提交 `.fvmrc`**，新人 `git clone` 后执行 `fvm install` 即可对齐版本。`.fvm/flutter_sdk`  symlink 体积小且会随 `fvm use` 重建，通常加入 `.gitignore`（FVM 可在 `updateGitIgnore: true` 时自动写入）。

### 3. `fvm flutter` 前缀 — 绕过全局 PATH

系统 `PATH` 里可能还有另一个 `flutter`。在项目目录应通过 `fvm flutter ...` 调用，或把 alias 写进 shell 配置：

```bash
alias flutter='fvm flutter'
alias dart='fvm dart'
```

这样当前目录有 FVM 配置时，命令自动走项目 SDK；没有配置时可回退全局（取决于你的 alias 写法）。

### 4. 全局默认 vs 项目级

- `fvm use 3.19.0`：仅当前项目（及子目录继承逻辑视 monorepo 结构而定）
- `fvm global 3.19.0`：设置机器级默认 Flutter，并把 `~/fvm/default` 链到该版本；需把 `$HOME/fvm/default/bin` 加入 PATH

个人建议：**生产项目一律 `fvm use` 钉版本**；`global` 只作为「新开空项目时的默认」，不要和团队锁定混为一谈。

### 5. Flavors — 同一仓库多套 SDK 策略

大型团队可能开发用 beta、发布用 stable。FVM 支持 flavor：

```bash
fvm use 3.19.0 --flavor development
fvm use 3.16.0 --flavor production
fvm flavor development flutter run
```

`.fvmrc` 里的 `flavors` 映射会一并保存。

### 6. Fork 与企业定制 Flutter

公司自维护 Flutter fork 时，可用 `fvm fork add` 注册远程仓库，再 `fvm install company/stable`。环境变量 `FVM_FLUTTER_URL` 也可全局指定官方 git 镜像或内网地址。

### 7. IDE 集成

- **VS Code**：`fvm use` 后常自动更新 `.vscode/settings.json` 里的 `dart.flutterSdkPath` 指向 `.fvm/flutter_sdk`
- **Android Studio / IntelliJ**：手动把 Flutter SDK 路径设为项目内 `.fvm/flutter_sdk` 的**绝对路径**；切换版本后可能要重新选路径并 Sync Gradle（IDE 有时会把 symlink 解析成真实路径缓存）

## 安装

macOS 推荐方式之一：

```bash
# 官方安装脚本（Linux/macOS 通用）
curl -fsSL https://fvm.app/install.sh | bash

# 或 Homebrew
brew tap leoafarias/fvm
brew install fvm
```

Windows 可用 Chocolatey：`choco install fvm`，或 Scoop bucket。也可用 `dart pub global activate fvm`，但若你打算用 FVM 管理**全局** Flutter，官方更推荐独立安装包而非 pub global。

安装后确认：

```bash
fvm --version
fvm doctor
```

## 实践案例

### 案例 1：新项目从零钉版本

```bash
cd ~/projects/shop_app

# 查看远端有哪些版本
fvm releases

# 安装并绑定 stable（或具体版本号）
fvm use stable --pin
# 等价于指定号：fvm use 3.19.0

# 验证
fvm flutter --version
fvm flutter pub get
fvm flutter run
```

执行 `fvm use` 后项目根目录会出现 `.fvm/` 和 `.fvmrc`。把 `.fvmrc` 提交到 Git；确认 `.gitignore` 已忽略 `.fvm/flutter_sdk`（FVM 可自动处理）。

### 案例 2：克隆同事项目并对齐 CI

```bash
git clone https://github.com/team/legacy_app.git
cd legacy_app

# 读 .fvmrc，下载缺失 SDK
fvm install

# 与 CI 相同的构建命令
fvm flutter pub get
fvm flutter test
fvm flutter build apk --release
```

GitHub Actions 示例片段：

```yaml
- name: Setup FVM
  run: dart pub global activate fvm

- name: Install Flutter SDK
  run: fvm install

- name: Build
  run: fvm flutter build apk --release
```

### 案例 3：跨版本回归测试

不必切换项目配置，可用 `spawn` 在指定 SDK 下跑一次性命令：

```bash
# 当前项目仍是 3.19.0
fvm spawn 3.16.0 test
fvm spawn beta analyze
```

适合验证「这个 bug 是不是新版本才出现」。

### 案例 4：清理磁盘

```bash
fvm list              # 看已安装版本
fvm remove 3.13.0     # 删单个
fvm remove --all      # 清空（慎用）
```

多个项目共享同一份缓存里的 3.19.0，删除前确认没有项目仍引用该版本。

## 常用命令速查

| 命令 | 作用 |
|------|------|
| `fvm install [version]` | 下载 SDK 到缓存（不绑定项目） |
| `fvm use <version>` | 为当前项目绑定版本 |
| `fvm list` | 列出已安装版本 |
| `fvm releases` | 列出可安装的发布版本 |
| `fvm global <version>` | 设置全局默认 |
| `fvm flutter <cmd>` | 用项目 SDK 执行 flutter |
| `fvm spawn <ver> <cmd>` | 临时用某版本执行命令 |
| `fvm doctor` | 检查环境与 IDE 配置 |
| `fvm config` | 查看/修改全局配置（缓存路径等） |

## 踩过的坑

1. **直接敲 `flutter` 没用 FVM**：PATH 里全局 Flutter 优先级更高，构建用的还是旧 SDK。团队规范应写清「本项目必须用 `fvm flutter` 或 alias」。

2. **没提交 `.fvmrc` 只口头说版本**：新人 `fvm install` 无从得知该装哪一版。版本契约必须进仓库。

3. **把 `.fvm/flutter_sdk` 提交进 Git**：symlink 在不同机器上目标路径不同，容易冲突；应只提交 `.fvmrc`。

4. **IDE 仍指向旧 SDK**：切换 `fvm use` 后 VS Code 需 Reload Window；Android Studio 可能要重新选 SDK 路径并 Invalidate Caches。

5. **CI 忘了 `fvm install`**：流水线只有 `flutter build` 会用 runner 自带 Flutter，与本地不一致。标准顺序：`activate fvm` → `fvm install` → `fvm flutter ...`。

6. **Monorepo 子模块未各自 `fvm use`**：每个 Flutter 包目录若需不同版本，要在对应目录执行 `fvm use`，IDE 模块也要指向各自的 `.fvm/flutter_sdk`。

## 适用 vs 不适用

**适用**：

- 多 Flutter 项目并行维护
- 团队需要与 CI 一致的 SDK 版本
- 需要在 stable / beta / 旧版之间频繁切换或做矩阵测试
- 使用自定义 Flutter fork 的企业环境

**不适用**：

- 整个机器只有一个 Flutter 项目且版本从不变（全局安装够用）
- 纯容器构建且镜像已 `FROM` 固定 Flutter 版本（镜像即版本契约，不必再套 FVM）
- 不愿在命令前加 `fvm` 且也不配置 alias 的团队（容易误用全局 SDK）

## 同类对比

| 工具 | 语言 | 定位 | 备注 |
|------|------|------|------|
| **FVM** | Dart | Flutter 专用，项目级 `.fvmrc` | Flutter 生态事实标准 |
| **asdf** | Shell | 多语言版本管理（含 flutter 插件） | 通用但 Flutter 体验不如 FVM 专精 |
| **手动 PATH** | — | 自己 export 不同目录 | 无项目级配置文件，难协作 |
| **nvm / pyenv** | — | Node / Python 版本管理 | 问题模型相同，语言不同 |

若你熟悉 [[nvm]]：把 Node 换成 Flutter、`node` 换成 `flutter`、`nvm use` 换成 `fvm use`、`.nvmrc` 换成 `.fvmrc`，心智模型几乎一致。

## 环境变量（选读）

| 变量 | 含义 |
|------|------|
| `FVM_CACHE_PATH` | Flutter SDK 缓存根目录 |
| `FVM_FLUTTER_URL` | 克隆 Flutter 的 git URL（镜像/fork） |
| `FVM_USE_GIT_CACHE` | 是否启用 git 引用缓存（加速安装） |
| `FVM_GIT_CACHE_PATH` | git 缓存路径 |

## 学到什么

1. **版本管理器的本质**：集中缓存 + 项目级指针（symlink/配置），避免重复下载和全局污染
2. **可复现构建**：`.fvmrc` 和 CI 里的 `fvm install` 把「我机器上能跑」变成「任何人、任何流水线都能跑」
3. **IDE 是第二战场**：CLI 对了但 IDE 仍指向错误 SDK，分析器和编译器会分裂
4. **与包管理分离**：FVM 管 SDK 版本；`pub get` 管 Dart 依赖——两者都要对齐

## 延伸阅读

- 官方仓库：[leoafarias/fvm](https://github.com/leoafarias/fvm)
- 文档：[fvm.app](https://fvm.app/documentation/getting-started)
- 工作流指南：[Common Workflows](https://fvm.app/documentation/guides/workflows)
- Flutter 官方安装（全局 SDK 背景）：[docs.flutter.dev](https://docs.flutter.dev/get-started/install)

## 关联

- [[nvm]] — Node 版本管理，概念平行
- [[pyenv]] — Python 版本管理，同为 per-project 钉版本
- [[expo]] — React Native 侧的工具链与 SDK 版本锁定（Expo SDK 与 RN 版本绑定）
- [[flutter-rust-bridge]] — Flutter 生态中的跨语言桥接项目

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[expo]] —— Expo — RN 的"开箱即用"工具链 + 云构建 + OTA 更新
- [[flutter-rust-bridge]] —— flutter-rust-bridge — Dart 调 Rust 像调本地函数
- [[nvm]] —— nvm — 在同一台机器上轻松切换 Node 版本
- [[pyenv]] —— pyenv — 用 shim 把 python 命令拦截后路由到指定版本

