---
title: Geany — 用 C 写的轻量级 GTK 编辑器
来源: 'https://github.com/geany/geany'
日期: 2026-06-24
分类: 编辑器
难度: 初级
---

## 是什么

Geany 是一个用 C 语言写的**轻量级集成开发环境**——介于"纯文本编辑器"和"重型 IDE"之间的中间地带。

日常类比：VS Code 像一家大型连锁健身房，器材齐全、私教课丰富，但月费高、停车远；Notepad++ 像家门口的露天单杠，免费快捷但功能有限；Geany 就是一家社区小型健身房——有跑步机、哑铃和淋浴间，够你认真锻炼，但不会让你迷失在 200 台器材里。

你双击打开一个 `.py` 文件，Geany 几乎瞬间启动，左侧出现符号列表（函数名、类名），底部有终端，按 F5 直接跑当前文件。这三件事——**语法高亮、符号导航、一键编译运行**——就是 Geany 和纯文本编辑器的核心差别。

技术上，Geany 基于 GTK3 图形工具包构建界面，用 Scintilla 引擎负责文本渲染和编辑（和 Notepad++ 用的是同一个引擎）。它只依赖 GTK 运行时库，不依赖 KDE、GNOME 或任何桌面环境，所以几乎所有装了 GTK 的系统都能跑。GitHub 上约 3k star，最新版本是 2025 年发布的 Geany 2.1。

## 为什么重要

不理解 Geany 的定位，下面这些事都不好解释：

- 为什么 Linux 发行版的"推荐开发工具"列表里总有它——因为它是 GTK 生态中少数"安装即用、不吃资源"的 IDE 级工具
- 为什么编程入门课常推荐 Geany 而不是 VS Code——新手不需要扩展生态和远程开发，需要的是"写完按一个键就能跑"，Geany 的内置编译系统开箱就提供这个
- 为什么 Raspberry Pi OS 和很多教育发行版预装 Geany——在 1GB 内存的设备上，VS Code 都打不开，Geany 跑起来只要几十 MB
- 为什么 Scintilla 这个编辑引擎出现在那么多不同的编辑器里——Geany 和 Notepad++ 都证明了"嵌入一个成熟的编辑组件比自己从零写更划算"

## 核心要点

Geany 的设计目标可以用三个关键词概括：**快、轻、够用**。

1. **快**：启动时间以毫秒计。原因很直接——Geany 是原生 C 程序，直接调 GTK 画窗口，没有 Electron、没有 JVM、没有 Node.js。打开一个文件不需要加载几百个内置扩展。冷启动通常在 0.5 秒以内，和 VS Code 的 2-3 秒形成明显对比。

2. **轻**：安装包约 10-20 MB（取决于平台），运行时内存占用通常在 30-60 MB。对比 VS Code 安装包约 100 MB、运行内存 300 MB+，JetBrains 系列安装包 800 MB+。Geany 的轻来自两个设计决策：只依赖 GTK 运行时（不捆绑浏览器引擎），以及只内置最常用功能（不内置终端模拟器等重型组件，用系统的）。

3. **够用**：支持 50+ 种编程语言的语法高亮，有符号列表（相当于简化版的"大纲视图"），有代码折叠、自动补全、片段（snippets）、自动关闭 XML/HTML 标签、调用提示（call tips），还有内置的编译/构建系统——你在菜单里配好编译命令，按一个快捷键就能编译运行当前文件。这些功能加在一起，刚好跨过了"纯编辑器"的门槛，变成一个轻量 IDE。

Geany **不做**的事同样重要：没有 LSP 支持（核心里没有），没有 Git 集成（核心里没有），没有远程开发、没有 AI 补全、没有 notebook。这些要么通过插件补，要么干脆交给别的工具——Geany 只守自己的"轻量 IDE"边界。

## 实践案例

### 案例 1：写一个 Python 脚本并运行

```
打开 Geany → File → New → 输入：

  print("Hello from Geany")

File → Save As → hello.py
按 F5（或菜单 Build → Execute）
```

底部弹出终端窗口，显示 `Hello from Geany`。整个过程不需要配置任何东西——Geany 识别到 `.py` 后缀后自动关联 Python 解释器。

对比 VS Code：你也可以按 F5 运行，但 VS Code 可能弹出一个"选择调试配置"对话框让你先配 `launch.json`。Geany 的思路是"不需要调试就别问"。

### 案例 2：用符号列表导航大文件

打开一个几百行的 C 文件，左侧"Symbols"面板自动列出所有函数名、结构体名、宏定义。点击任意一个，光标跳到对应位置。

这不是 LSP 驱动的——Geany 用的是一个内置的简化版 ctags 解析器，叫做 **tagmanager**。它不像 LSP 能做跨文件跳转或重构，但对于"在当前文件里快速定位函数"这个需求，够了，而且零配置。

### 案例 3：配置 C 项目的编译命令

```
Build → Set Build Commands

Compile: gcc -Wall -c "%f"
Build:   gcc -Wall -o "%e" "%f"
Execute: ./%e
```

`%f` 是当前文件名，`%e` 是去掉后缀的文件名。配好后按 F8 编译、F5 运行。错误信息出现在底部"Compiler"面板，双击错误行可以跳到对应源码位置。

这就是 Geany 的"轻量 IDE"感——不是一个完整的 CMake/Meson 项目管理系统，但对单文件或小项目来说，比命令行来回切换方便得多。

## 踩过的坑

1. **符号解析不能跨文件**：Geany 的 tagmanager 只解析当前打开的文件。你在 `main.c` 里调用 `utils.c` 的函数，点击跳转不过去。这不是 bug，是设计取舍——完整跨文件解析需要 LSP 或 ctags 外部索引。解决办法是装 GeanyCtags 插件，让它读外部 ctags 数据库。

2. **插件生态不如预期丰富**：Geany 有官方的 geany-plugins 仓库，包含约 30 个插件，但和 VS Code 的 30000+ 扩展不在一个量级。很多现代开发需求（ESLint 集成、Docker、远程开发）在 Geany 里无解。选 Geany 就是接受"够用就好"。

3. **GTK 版本迁移导致主题混乱**：Geany 从 GTK2 迁移到 GTK3 后，一些旧的颜色主题不再兼容。在 geany.org/download/themes 下载的主题需要确认是 GTK3 版本。旧主题放进去不会报错，但颜色可能完全不对。

4. **Windows 版功能缺失**：官方明确说 Windows 版缺少部分功能（比如虚拟终端集成、某些 Unix 特有的编译链调用）。如果你的主力平台是 Windows，Notepad++ 可能是更成熟的选择。

## 适用 vs 不适用场景

**适用**：

- 编程初学者想要一个"写完按 F5 就跑"的环境——不需要配 launch.json、不需要装扩展
- Linux 日常开发，项目规模中小（单文件到几十个文件）——Geany 有简单的项目管理功能
- 资源受限设备（树莓派、老电脑、虚拟机里 1GB 内存的 Linux）——Geany 30MB 内存就跑得起来
- 想要一个 GUI 编辑器但不想装 Electron——Geany 是原生 GTK 应用，和 Linux 桌面环境视觉风格一致

**不适用**：

- 需要 LSP 级别的代码智能（跨文件跳转、重构、类型推导）——用 VS Code 或 Neovim
- 需要深度版本控制集成（diff 视图、blame、merge 工具）——Geany 核心没有，插件能力有限
- 大型项目（几千个文件的 monorepo）——Geany 的项目管理是文件列表级别，不支持 workspace 概念
- 需要远程开发（SSH 到服务器上编辑代码）——没有 VS Code Remote 那样的方案
- 团队要求统一开发环境和调试配置——Geany 没有 devcontainer 生态

## 架构简述

Geany 的内部结构可以拆成四层：

1. **编辑引擎层（Scintilla）**：处理所有文本渲染、光标移动、语法着色、代码折叠。Scintilla 是一个独立的开源项目，用 C++ 写成，Geany 把它作为组件嵌入。这意味着 Geany 的文本编辑体验和 Notepad++、SciTE 等使用同一引擎的编辑器非常接近。

2. **符号解析层（tagmanager）**：Geany 内置了一个简化版的 ctags 解析器，能从源码里提取函数名、变量名、类名等符号，用于符号列表和自动补全。它不像 LSP 那样理解语义（不能做"查找所有引用"或"安全重命名"），但对常见语言的符号提取足够。

3. **UI 层（GTK3）**：菜单栏、工具栏、侧边栏（文件列表 + 符号列表）、底部面板（编译输出 + 消息 + 终端）都用 GTK3 构建。这让 Geany 在 GNOME、Xfce、MATE 等桌面环境下看起来是"原生应用"。

4. **插件层（C API + libgeany）**：Geany 导出一个 C 语言的插件 API（通过 libgeany 共享库），第三方可以用 C 或者支持 C FFI 的语言写插件。官方维护的 geany-plugins 仓库包含约 30 个插件，涵盖版本控制（GeanyVC）、拼写检查（SpellCheck）、项目管理（ProjectOrganizer）等。

## 历史小故事（可跳过）

- **2005 年**：Enrico Troeger 发布 Geany 0.1。当时 Linux 桌面上的选择很两极——要么是 Kate/KDevelop（KDE 系，重），要么是 gedit（GNOME 系，纯编辑器），要么是 Eclipse/NetBeans（Java 系，更重）。Enrico 想要一个"中间地带"：有符号列表和编译功能，但不吃 200 MB 内存。

- **2008-2012 年**：Geany 进入稳定发展期，版本号从 0.14 到 1.22。插件系统成型，geany-plugins 仓库建立。Nick Treleaven、Colomban Wendling 等核心开发者加入。

- **2023 年**：Geany 2.0 发布，完成了从 GTK2 到 GTK3 的迁移。这次升级拖了多年，因为 GTK2 到 GTK3 的 API 变化不小，而 Geany 团队只有几个人。2.0 还初步支持了 Meson 构建系统，取代了之前的 Autotools。

- **2025 年**：Geany 2.1 发布，持续改进 UI 和文件类型支持。项目已经 20 年了，团队规模始终维持在 5-7 个核心贡献者，是典型的"小而稳"的开源项目。

## 和 Scintilla 的关系

Geany 的文本编辑能力几乎完全来自 Scintilla——一个由 Neil Hodgson 从 1999 年开始维护的开源编辑组件。理解这层关系很重要，因为它解释了很多 Geany 的行为和限制。

Scintilla 提供的能力包括：文本缓冲区管理、语法着色（通过 lexer）、代码折叠、行号显示、多光标、正则搜索替换、自动补全弹窗。Geany 不自己实现这些——它调用 Scintilla 的 API 来完成。

这种"嵌入编辑组件"的模式在编辑器世界很常见：Notepad++ 嵌入 Scintilla，VS Code 嵌入 Monaco Editor（自研），Lite-XL 自己用 C 写渲染层。好处是编辑器开发者可以专注于上层功能（项目管理、构建系统、插件），不用重新发明文本渲染。坏处是你被绑定在组件的能力范围内——Scintilla 不支持的东西（比如 Tree-sitter 级别的增量解析），Geany 也做不到。

## 学到什么

1. **"中间地带"是一种有意义的产品定位**——不是每个工具都要往"功能最全"或"最极简"两极走。Geany 证明了"比编辑器多一点、比 IDE 少一点"这个位置有真实的用户群，而且能活 20 年

2. **嵌入成熟组件比自己造轮子更务实**——Geany 把文本编辑交给 Scintilla、把符号解析交给 ctags 思路的简化版、把界面交给 GTK。自己只写胶水层和上层功能，所以几个人就能维护一个完整 IDE

3. **"够用就好"和"可扩展"之间的张力**——Geany 选择了"够用就好"：核心不做 LSP、不做 Git、不做远程开发。这让它保持轻量，但也意味着天花板明确。对比 VS Code 选择了"全部可扩展"，代价是复杂度和资源占用

4. **小团队开源项目的生存之道**——20 年、5-7 个核心贡献者、从不追热点、稳定发版。Geany 不是明星项目，但它从未中断维护，这种持久性本身就有价值

5. **GTK 生态的代价**——从 GTK2 到 GTK3 的迁移耗费了 Geany 团队多年精力，GNOME 对 GTK API 的频繁变更让小团队维护者疲于应付。这是选择平台框架时需要考虑的长期成本

## 延伸阅读

- [Geany 官方网站](https://www.geany.org/)——下载、文档、主题、插件列表
- [Geany 官方手册](https://www.geany.org/documentation/manual/)——从安装到自定义构建命令的完整指南
- [geany-plugins 仓库](https://github.com/geany/geany-plugins)——官方维护的 30+ 个插件
- [Scintilla 项目](https://www.scintilla.org/)——Geany 和 Notepad++ 共用的编辑引擎
- [Geany Themes](https://www.geany.org/download/themes/)——社区颜色主题集合

## 关联

- [[vim]] —— 终端里的模态编辑器，和 Geany 的 GUI 路线完全不同，但同样追求"轻量"
- [[emacs]] —— 另一个长寿编辑器，但走"扩展即一切"路线，和 Geany 的"够用就好"相反
- [[vscode]] —— 现代编辑器的标杆，功能全面但资源占用高，是 Geany 最常被对标的对象
- [[atom]] —— 用 Electron 做编辑器的先驱，催生了 VS Code，Geany 证明了"不用 Electron 也能做好用的编辑器"
- [[textmate]] —— macOS 上的轻量编辑器，和 Geany 在各自平台上的定位相似
- [[sublime-text]] —— 同样追求启动速度的编辑器，但闭源商业授权，Geany 是 GPL 自由软件
- [[notepad-plus-plus]] —— 共用 Scintilla 引擎的 Windows 编辑器，和 Geany 是同一思路的不同平台实现
- [[lite-xl]] —— 更极端的轻量路线（3MB），用 Lua 扩展，和 Geany 的 C 插件 API 形成对比

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
