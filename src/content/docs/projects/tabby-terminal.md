---
title: Tabby Terminal — 把终端、SSH 与串口捏进一个可扩展壳
来源: 'Eugeny, "Tabby", https://github.com/Eugeny/tabby'
日期: 2026-06-13
子分类: 命令行工具
分类: CLI
provenance: pipeline-v3
---

## 是什么

Tabby（前身 **Terminus**）是一款跨平台（Windows / macOS / Linux）的**终端模拟器 + SSH 客户端 + 串口终端**，用 Electron + Angular 写成，底层终端渲染基于 **XTerm.js**。日常类比：

> 以前你运维一台服务器，桌面上要摆三样东西：系统自带黑窗口跑本地命令、PuTTY 记 SSH 密码和跳板、SecureCRT 偶尔连串口调交换机。
> Tabby 像一间**带前台登记处的联合办公区**——本地 Shell、远程 SSH、串口会话都开成标签页，连接信息存在同一套 Profile 里，分屏、主题、快捷键一次配好到处用。

它不是新 Shell，也不是 MinGW/Cygwin 替代品；官方也明说**不是轻量选手**——若你追求几十 MB 内存占用，应看 [Alacritty](https://github.com/alacritty/alacritty) 或 Windows Terminal。Tabby 换的是**功能密度与可配置性**：内置连接管理、Vault 加密凭据、插件市场、Quake 模式侧栏、进程完成通知等。

## 为什么重要

不理解 Tabby 的定位，下面这些事容易选错工具或配错文件：

- **Windows 用户告别「PuTTY + CMD」双开**：同一窗口里 WSL、PowerShell、Git-Bash、SSH 会话 Tab 切换，字体连字与 True Color 开箱即用
- **SSH 不止于 `ssh user@host`**：Jump Host 自动链、端口转发预配置、Agent 转发、登录脚本、Zmodem 传文件——这些在 Tabby 里是连接 Profile 的一级公民，不必再维护一份平行 `~/.ssh/config`（当然两者可以并存）
- **配置即代码**：`config.yaml` 可版本管理；旁边还可放 `ssh-profiles.yaml` 批量导入静态 SSH 列表（类似 iTerm2 Dynamic Profiles）
- **插件架构**：连接类型（SSH / Local / Serial / Telnet）本身就是插件；社区还有 Docker 进容器、MCP Server 接 Cursor、配置同步到 Gist 等扩展
- **与作者生态联动**：Tabby 作者还维护 [Warpgate](https://github.com/warp-tech/warpgate)（智能 SSH/HTTP bastion），有 `web-auth-handler` 插件专门对接浏览器内认证

## 核心要点

Tabby 可以拆成四层理解：

### 1. 终端引擎（XTerm.js）

负责 VT220 及扩展仿真：24 位真彩色、Bracketed Paste、多行粘贴警告、连字（ligatures）、Nerd Fonts、高速输出不卡顿。日常类比：这是**显示屏**——不管你后面接的是本机 bash 还是远端 sshd，画面规则一致。

### 2. 连接类型（Connection Plugins）

| 类型 | 典型用途 | 亮点 |
|------|----------|------|
| **Local** | 本机 Shell | PowerShell / WSL / zsh / fish；可检测当前工作目录 |
| **SSH** | 远程服务器 | Jump Host、X11、端口转发、登录脚本、Zmodem |
| **Serial** | 路由器、嵌入式 | 十六进制收发、换行转换、自动重连 |
| **Telnet** | 老旧设备 | 与 SSH 共用连接管理器 UI |

每种连接保存为 **Profile**，可绑定快捷键一键打开。

### 3. 工作区 UI

- **标签页**：可置顶/置底/置侧；崩溃或误关后可恢复会话状态
- **分屏（Split Panes）**：嵌套拆分，布局可存成 Profile
- **Quake 模式**：全局热键从屏幕边缘滑出，类似游戏里按 `` ` `` 呼出控制台
- **进度检测**：编译、下载等任务跑完可系统通知

### 4. 配置与 Vault

主配置文件位置（因平台而异）：

| 平台 | 路径 |
|------|------|
| Linux | `~/.config/tabby/config.yaml` |
| macOS | `~/Library/Application Support/tabby/config.yaml` |
| Windows | `%APPDATA%\tabby\config.yaml` |

**Vault** 是写在 `config.yaml` 里的加密容器，用你设的口令解锁；迁移机器时复制整个配置目录即可带走加密后的凭据（需记得同一 Vault 密码）。若把密码交给 macOS Keychain，则还需单独迁移钥匙串。

同目录下可放 **`ssh-profiles.yaml`**，与 GUI 里建的 SSH Profile 字段一致，适合 Git 管理服务器清单（密钥路径仍建议用本机映射，可配合 `ssh-keymap` 插件）。

## 实践案例

### 案例 1：用 `config.yaml` 定义本地开发 Shell Profile

在设置里改外观会写回 YAML；也可以直接编辑文件（**先退出 Tabby 或接受 GUI 覆盖风险**）：

```yaml
# ~/.config/tabby/config.yaml（片段）
terminal:
  font: JetBrains Mono
  fontSize: 13
  ligatures: true
  copyOnSelect: true
  bracketedPaste: true
  scrollback: 50000

profiles:
  - type: local
    name: Dev — zsh
    group: Local
    options:
      command: /bin/zsh
      args: ['-l']
      cwd: /Users/you/projects
      env:
        EDITOR: nvim
    terminalColorScheme:
      name: Catppuccin Mocha
```

**逐段解释**：

- `terminal` 段是**全局默认**——字体、滚动缓冲区、选中即复制等行为
- `profiles` 里 `type: local` 表示本机 Shell；`cwd` 让每次打开落在固定项目根目录
- `terminalColorScheme` 可引用已安装主题插件里的配色名

### 案例 2：用 `ssh-profiles.yaml` 批量导入 SSH 连接

在 `config.yaml` **同级目录**创建 `ssh-profiles.yaml`（Tabby 启动时自动合并）：

```yaml
# ~/.config/tabby/ssh-profiles.yaml
- name: prod-web-01
  group: Production
  options:
    host: 10.0.1.11
    port: 22
    user: deploy
  weight: 10

- name: staging via bastion
  group: Staging
  options:
    host: 10.0.2.50
    user: ubuntu
    jumpHost: bastion.example.com
    jumpHostUser: jumpuser
    agentForward: true
    forwardPorts:
      - name: grafana
        host: 127.0.0.1
        port: 3000
        targetHost: 127.0.0.1
        targetPort: 3000
```

**要点**：

- `jumpHost` 不必手写 `ProxyJump`——Tabby SSH 插件会组链
- `forwardPorts` 把常用隧道写进 Profile，点连接即自动建立本地端口转发
- 在 UI 里新建测试 Profile 后，从 `config.yaml` 里**复制 `options` 块**是查字段名的最快办法

### 案例 3：Quake 模式与分屏快捷键（YAML 片段）

```yaml
hotkeys:
  toggle-window:
    - Ctrl-Shift-`
  split-horizontal:
    - Ctrl-Shift-D
  split-vertical:
    - Ctrl-Shift-E
  focus-pane-up:
    - Ctrl-Alt-Up
  focus-pane-down:
    - Ctrl-Alt-Down

enableQuakeMode: true
quakeMode:
  animationDuration: 200
  hideOnBlur: true
```

按 `Ctrl-Shift-`` ` 从屏幕边缘唤出/隐藏 Tabby，适合「偶尔敲一条命令」而不占常驻窗口。分屏后配合 `focus-pane-*` 热键在 pane 间跳转，多数场景**不必再开 tmux**（重度远端持久会话除外）。

### 案例 4：安装插件扩展工作流

设置 → **Plugins** 可搜索安装，例如：

- **quick-cmds**：向当前或全部标签广播预设命令（批量 `git pull`）
- **save-output**：把终端输出落盘，方便留审计日志
- **sync-config**：把 `config.yaml` 同步到 Gist / Gitee（注意 Vault 与密钥路径）
- **mcp-server**：让 Cursor / Windsurf 通过 MCP 驱动 Tabby 会话

插件本质是 npm 包，Tabby 动态加载；开发自定义插件见官方 [API 文档](https://docs.tabby.sh/)。

## 安装速查

```bash
# macOS（Homebrew）
brew install --cask tabby

# Debian/Ubuntu（官方仓库，见 packagecloud 说明）
# curl 安装脚本后 apt install tabby-terminal

# 任意平台：GitHub Releases 下载 .dmg / .exe / .AppImage
# https://github.com/Eugeny/tabby/releases/latest
```

Windows **便携版**：在 `Tabby.exe` 旁新建 `data` 文件夹，配置与插件数据会写在目录内，适合 U 盘携带。

## 踩过的坑

1. **GUI 与手写 YAML 互相覆盖**：在设置面板点保存会整文件写回；想 Git 管理配置时，约定「只改 YAML」或改完重启 Tabby，避免两边同时编辑。
2. **Vault 密码遗忘 = 凭据全丢**：Vault 加密块无法暴力恢复；迁移前用备份口令解锁验证一次。
3. **SSH 私钥路径跨机不一致**：笔记本与台式机用户名不同，`IdentityFile` 绝对路径会失效；用 **ssh-keymap** 插件把逻辑名映射到本机路径。
4. **个别版本 GUI 保存 SSH Profile 失败**：社区反馈过 v1.0.231 附近「复制 Profile 后点 Save 无反应」；可临时直接编辑 `config.yaml`，或降到修复版本（issue #11188）。
5. **内存占用**：Electron 底座 + 多标签 + 大 scrollback 会显著吃 RAM；开发机 16GB 以上较舒适，低配机请减小 `scrollback` 或选 Alacritty。
6. **与系统 OpenSSH 配置关系**：Tabby 自带 SSH 栈，不强制读 `~/.ssh/config`；复杂 `Match` 规则若以 Tabby 为主，建议在 Profile 里显式写 `jumpHost` / `forwardPorts`，避免「命令行能连、Tabby 不能」的双轨困惑。

## 与其他终端怎么选

| 工具 | 定位 | 何时选 Tabby | 何时不选 |
|------|------|--------------|----------|
| **Windows Terminal** | 系统级轻量多标签 | 要内置 SSH 管理、串口、Vault | 只要本机 Shell、要微软官方集成 |
| **iTerm2** | macOS 老牌 | 要跨平台同一套 UI + SSH | 仅 macOS、已深度投资 iTerm 配置 |
| **PuTTY** | Windows SSH 经典 | 要现代 UI、True Color、插件 | 嵌入式环境只要单文件绿色版 |
| **Alacritty** | GPU 极简 | 要一体化运维工作台 | 要极致性能与低内存 |
| **WezTerm** | Rust 跨平台 | 要 Lua 配置 + 多路复用 | 更偏好 WezTerm 的 mux 模型 |

一句话：**Tabby = 终端界的「瑞士军刀」**——功能多、可插件、略重；适合每天开很多 SSH、又想要漂亮字体和统一快捷键的开发者与运维。

## 延伸阅读

- 官网与功能列表：[tabby.sh](https://tabby.sh/about/features)
- 源码与插件列表：[Eugeny/tabby](https://github.com/Eugeny/tabby)
- 插件开发：[docs.tabby.sh](https://docs.tabby.sh/)
- Web 版（可自托管）：[tabby.sh/app](https://tabby.sh/app) · [tabby-web](https://github.com/Eugeny/tabby-web)
- 同作者 bastion：[Warpgate](https://github.com/warp-tech/warpgate)
- 配置迁移（macOS）：复制 `~/Library/Application Support/tabby` 整目录并解锁 Vault
