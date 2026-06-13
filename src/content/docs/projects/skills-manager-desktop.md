---
title: Skills Manager — 一个桌面 App，统一管理 15+ AI 编程工具的 Skills
来源: https://github.com/xingkongliang/skills-manager
日期: 2026-06-13
分类: CLI
子分类: 开发者工具
provenance: pipeline-v3
---

# Skills Manager — 一个桌面 App，统一管理 15+ AI 编程工具的 Skills

## 一、从"抽屉乱成一团"说起

想象一下：你家里有很多房间——卧室、客厅、书房、厨房。每个房间里都有一个抽屉，用来放不同的工具。

现在，你的电脑上装了不止一个 AI 编程助手：Claude Code、Cursor、GitHub Copilot、Codex……每个助手都有自己的"技能文件夹"（skills folder），里面放着各种 SKILL.md 配置文件。这些配置告诉 AI："遇到这类问题时，你应该怎么做。"

问题来了：

- 你在 Claude Code 里装了一个"代码审查"技能，想不想也在 Cursor 里用？手动复制一遍。
- 你想给 15 个工具都加上同一个新技能，难道一个个打开文件夹、一个个粘贴？
- 换了电脑，这些技能又要重新装一遍。

这就像你每个房间都单独买了一把相同的锤子——而不是在储藏室里放一把，哪个房间需要就拎到哪。

**Skills Manager 就是那个"智能储藏室"。** 一个桌面应用，让你在一个地方管理所有 AI 编程助手的技能，一键同步到任意工具。

## 二、项目概况

| 项目 | 说明 |
|------|------|
| 仓库 | [xingkongliang/skills-manager](https://github.com/xingkongliang/skills-manager) |
| Star 数 | 2.2k+ |
| 许可证 | MIT |
| 技术栈 | 前端：React 19 + TypeScript + Vite + Tailwind CSS；桌面层：Tauri 2；后端：Rust；存储：SQLite |
| 支持工具 | Cursor、Claude Code、Codex、Grok、OpenCode、Amp、Kilo Code、Roo Code、Goose、Gemini CLI、GitHub Copilot、Windsurf、TRAE IDE、Antigravity、Clawdbot、Droid，共 16+ 种 |

一句话总结：这是一个用 Rust + Tauri 构建的跨平台桌面应用，帮你把分散在各个 AI 工具里的技能统一收拢到一个中心仓库里管理。

## 三、核心概念

理解 Skills Manager，最关键的是搞懂下面四个概念。它们之间的关系就像"总仓库 — 分发站 — 项目包 — 配方"。

### 3.1 Central Library（中央库）

这是你的"总仓库"。默认位于 `~/.skills-manager/`。所有技能都从这里安装、更新、搜索。无论技能来自 Git 仓库、本地文件夹、压缩包，还是 skills.sh 市场，最终都存放在这里。

### 3.2 Global Workspace（全局工作区）

每个 AI 工具有自己的"全局技能文件夹"。比如 Claude Code 的全局路径是 `~/.claude/skills/`。全局工作区列出某个工具文件夹里的所有内容——包括你用 Skills Manager 安装的，也包括你手动放进去的。你可以从这里添加、移除技能，或者用"All Agents"概览同时管理所有工具。

### 3.3 Project Workspace（项目工作区）

有些技能只想在特定项目里生效。比如在 `my-project/.claude/skills/` 下的技能，只对 `my-project` 这个文件夹里的代码起作用。项目工作区就是管理这些"项目本地技能"的地方。

### 3.4 Preset（预设）

预设是"可复用的技能组合"。你可以把一组技能命名为"React 开发套件"，然后在任何工作区点击这个预设，就能一键激活所有这些技能。注意：应用预设是一次性复制，不是实时同步。

### 3.5 Tags（标签）

给技能打标签用于分组和筛选。比如给一些技能打上"web"、"frontend"标签，然后用标签过滤快速找到它们。

## 四、工作流程详解

### 4.1 安装技能

技能可以来自四个渠道：

1. **本地文件夹** — 你电脑上的某个目录
2. **Git 仓库** — 比如 `https://github.com/foo/bar.git`
3. **压缩包** — `.zip` 或 `.skill` 文件
4. **Marketplace** — [skills.sh](https://skills.sh) 在线市场，支持关键词搜索和 AI 搜索

安装后，技能进入中央库。但此时它还没有同步到任何 AI 工具——你需要通过全局工作区或预设来"推送"。

### 4.2 同步到工具

有两种同步模式：

- **Symlink（符号链接）** — 在工具的技能文件夹里创建一个指向中央库的快捷方式。节省空间，修改中央库即时生效。
- **Copy（复制）** — 把技能文件实际复制到工具的技能文件夹。适合需要隔离的场景。

每个技能卡片上会显示已启用的工具图标徽章。点击徽章即可为某个工具安装或移除该技能。

### 4.3 项目工作区同步

项目工作区可以把项目本地的技能与中央库做对比，然后双向同步——把中央库的新技能拉到项目里，或者把项目里特有的技能推回中央库。

## 五、CLI 使用示例

Skills Manager 除了桌面界面，还提供了一个命令行工具（CLI）。CLI 和桌面应用共享同一个 SQLite 数据库，所以两者可以同时使用。

### 示例 1：安装技能并同步到 Claude Code

```bash
# 第一步：从 Git 仓库安装一个技能到中央库（不同步到工具）
npm run cli -- skills install https://github.com/anthropics/agent-skills@best-practices

# 第二步：查看已安装的技能列表
npm run cli -- skills list

# 第三步：将这个技能同步到 Claude Code
npm run cli -- skills sync --tool claude_code
```

第一条命令把技能下载到中央库 `~/.skills-manager/`。第二条命令确认安装成功。第三条命令把技能复制或创建符号链接到 `~/.claude/skills/` 目录。

### 示例 2：创建并使用预设

```bash
# 列出所有预设
npm run cli -- presets list

# 预览名为 "Default" 的预设包含哪些技能
npm run cli -- presets preview Default

# 将 "Default" 预设应用到所有已启用的工具
npm run cli -- presets apply Default

# 给预设添加一个新技能
npm run cli -- presets add-skill Default react-best-practices

# 从预设中移除一个技能
npm run cli -- presets remove-skill Default legacy-auth

# 再次应用，让变更生效
npm run cli -- presets apply Default
```

预设的本质是一个命名好的技能集合。`apply` 命令会把预设中的所有技能一次性复制到目标工具的技能文件夹中。这不是一个"实时连接"——如果你之后从预设中添加或删除了技能，需要重新运行 `apply`。

### 示例 3：Git 备份与恢复

```bash
# 查看中央库的 Git 状态
npm run cli -- git status

# 拉取远程的最新版本
npm run cli -- git pull

# 提交当前变更
npm run cli -- git commit -m "chore: update skills"

# 推送到远程仓库
npm run cli -- git push

# 查看所有历史快照
npm run cli -- git versions

# 恢复到某个快照
npm run cli -- git restore <snapshot-tag>
```

每次成功同步都会创建一个带版本号的快照标签。你可以在桌面应用的 Library 页面中打开 Version History，查看时间线，并恢复到任意历史版本。

> 注意：SQLite 数据库（`skills-manager.db`）不会被纳入 Git 备份。它只存元数据，可以从技能文件本身重新扫描生成。

### 示例 4：采用已存在的技能

如果你在 `~/.claude/skills/` 里手动放过一些技能，想让 Skills Manager 也管理它们：

```bash
# 先看看哪些技能可以被"领养"
npm run cli -- skills adopt ~/.claude/skills --dry-run

# 正式领养
npm run cli -- skills adopt ~/.claude/skills
```

领养之后，这些技能就会出现在中央库里，享受统一的搜索、同步、备份等功能。

## 六、技术架构简析

Skills Manager 的技术选型很有意思：

```
┌─────────────────────────────────┐
│         前端层 (React 19)        │  ← TypeScript + Vite + Tailwind CSS
│         桌面外壳 (Tauri 2)       │  ← 把网页打包成桌面应用
├─────────────────────────────────┤
│         后端层 (Rust)            │  ← src-tauri/ 目录
│         数据存储 (SQLite)        │  ← rusqlite 库
└─────────────────────────────────┘
```

为什么用 Tauri + Rust？

- **轻量**：相比 Electron 动辄 200MB+ 的内存占用，Tauri 应用通常只有几 MB。因为它用的是操作系统自带的 WebView，而不是捆绑一个完整的 Chromium。
- **安全**：Rust 语言在编译时就避免了空指针、数据竞争等常见 Bug，减少了运行时崩溃的概率。
- **跨平台**：一套代码同时支持 macOS、Windows、Linux。

## 七、关键设计决策

### 预设是一次性复制，不是实时同步

这是初学者最容易误解的地方。`presets apply` 执行的是"快照式复制"——把预设中的技能复制到目标工具，之后就各自独立了。如果你想修改预设的内容并让它生效，需要重新运行 `apply`。

这跟 Git 的 `checkout` 有点像：你把代码签出到工作区后，两边的文件就不再关联了。

### 中央库 vs 工具本地文件夹

Skills Manager 采用"集中管理、按需分发"的模式：

- 中央库 = 你的技能仓库（只存一份）
- 工具本地文件夹 = 分发目标（可能有多份副本或符号链接）

这种设计的优点是节省磁盘空间、更新方便；缺点是如果同步失败，某个工具可能拿不到最新的技能。

### 为什么数据库不进 Git？

`skills-manager.db` 存的是元数据：技能的来源、标签、预设关系、同步状态等。这些信息都可以从技能文件的实际结构和文件名中推断出来。所以它被排除在 Git 备份之外——即使丢失了，重新扫描一遍技能文件夹就能重建。

## 八、实际使用场景

### 场景 1：新手入门

你刚开始学编程，安装了 Claude Code 和一个 IDE。你可以：

1. 从 Skills Manager 的市场浏览热门技能
2. 安装"代码规范"、"错误排查"等基础技能到中央库
3. 在 Global Workspace 中同时勾选 Claude Code 和你的 IDE
4. 一键同步，两个工具同时获得这些技能

### 场景 2：团队协作

你和同事一起做一个项目，你们希望项目中的 AI 助手使用统一的技能配置：

1. 在项目目录下创建一个 Project Workspace
2. 添加项目专用的技能（比如公司的代码规范）
3. 把这些技能推送到项目本地的技能文件夹
4. 用 Git 备份中央库，同事克隆后自动获得相同配置

### 场景 3：多机器同步

你在 Mac 和 PC 上都用同样的 AI 工具：

1. 在 Settings 中配置一个 Git 远程仓库地址
2. 在 Library 中点击"Start Backup"初始化远程仓库
3. 之后在任何一台机器上安装新技能，运行"Sync to Git"
4. 另一台机器上运行"Sync to Git"拉取最新配置

## 九、常见问题

**Q: 技能安装后，AI 工具立刻生效吗？**

A: 取决于工具。大多数工具会在下次启动或重新加载配置时读取新的技能文件。如果不确定，可以重启一下你的 AI 工具。

**Q: 删除一个技能会同时从所有工具中移除吗？**

A: 不会。Skills Manager 管理的是中央库中的技能。从中央库删除只会移除副本，已同步到各个工具的文件不受影响。你需要手动清理工具本地的技能文件夹。

**Q: 可以自定义工具路径吗？**

A: 可以。在 Settings 中可以添加自定义工具，指定它们的技能文件夹路径，也可以覆盖内置工具的默认路径。

**Q: macOS 第一次打开被阻止怎么办？**

A: 这是 macOS Gatekeeper 的安全机制。点击"Done"后，打开"系统设置 → 隐私与安全性"，点击"仍要打开"即可。如果是旧版（v1.19.0 之前），需要在终端运行 `xattr -cr /Applications/skills-manager.app`。

## 十、总结

Skills Manager 解决的是一个真实存在的问题：当你的 AI 编程工具超过一个时，技能管理的复杂度会线性增长。它的核心思路很简单——建一个中央仓库，用一个图形界面来管理，再提供 CLI 给脚本和自动化流程使用。

对于初学者来说，它最大的价值不在于技术深度，而在于让你直观地理解"配置集中管理"这个概念。这个概念在很多领域都有应用：包管理器（npm/pip）、配置文件管理（dotfiles）、基础设施即代码（Terraform）等等。理解了 Skills Manager 的工作方式，你就理解了"集中管理、按需分发"这一通用模式。
