---
title: Notepad++ — 比记事本多两个加号的 Windows 编辑器
来源: 'https://github.com/notepad-plus-plus/notepad-plus-plus'
日期: 2026-06-24
分类: 编辑器
难度: 初级
---

## 是什么

Notepad++ 是 Windows 上最流行的免费源码编辑器，用来替代系统自带的"记事本"（Notepad）。日常类比：Windows 自带的记事本像一张白纸——能写字但没有尺子、没有彩笔、不能分栏。Notepad++ 就是把白纸换成了一本活页笔记本：有行号、有彩色标记、能同时打开好几页、还能装各种文具进去。

你双击一个 `.py` 文件，Notepad++ 打开后自动给关键字上色：

```
def hello():        # 蓝色——关键字
    print("hi")     # 红色——字符串
    return 42       # 行号显示在左侧
```

这个“上色”能力来自它内部嵌入的 Scintilla 编辑组件——一个用 C++ 写的开源文本编辑引擎。Scintilla 自己不是一个完整的编辑器，它更像一个“编辑器零件”，提供文本渲染、语法着色、折叠、自动补全等基础能力，需要被别的程序嵌入才能变成用户能用的产品。

Notepad++ 本身也用 C++ 写成，只调用 Windows 原生 API（Win32）和 STL，不依赖 .NET、Java 或 Electron，所以启动极快、体积极小（安装包不到 5 MB）。这个体积对比一下：VS Code 安装包约 100 MB，JetBrains IDE 约 800 MB。

## 为什么重要

在 Windows 生态里，Notepad++ 的地位类似于 macOS 上的 TextEdit，但能力强得多。不理解它，下面这些事都不好解释：

- 为什么一个 2003 年诞生的编辑器到今天还有超过 2500 万次下载——Windows 生态里"够用就是最好用"的典范
- 为什么 VS Code 出来之后 Notepad++ 依然有大量用户——它解决的是"轻量快速打开一个文件看一眼改一行"这个需求，VS Code 启动太重
- 为什么学编辑器绕不开 Scintilla——Geany、SciTE、Notepad++ 都用同一个引擎，理解它等于理解一整个编辑器家族
- 为什么一个个人开源项目能跑 20 年不断更——作者 Don Ho 坚持的“只做 Windows、只做编辑器”策略
- 为什么很多公司 IT 部门把 Notepad++ 当作标配装机工具——无需管理员权限安装便携版、体积小、可干的活多

## 核心要点

Notepad++ 的设计可以拆成三层：

1. **Scintilla 引擎**：负责文本渲染、语法着色、代码折叠、自动补全、行号显示等“编辑器核心”。Scintilla 内置支持超过 80 种编程语言的语法高亮。日常类比：这是笔记本里预装的格子纸——你买来就有横线和行号，不用自己画。Scintilla 是一个独立项目（由 Neil Hodgson 维护），Notepad++ 只是它最出名的用户之一。

2. **Win32 壳**：负责窗口管理、菜单栏、多标签页、文件对话框、查找替换等用户交互。日常类比：这是笔记本的封面和活页环——决定了你怎么翻页、怎么加页、怎么贴标签。Notepad++ 不用任何跨平台框架，直接调 Windows API，所以在 Windows 上启动比 Electron 应用快一个量级。但这也意味着它永远不会有官方 macOS / Linux 版本。

3. **插件体系**：通过 C++ DLL 接口暴露扩展点，社区可以写插件加功能。常用插件包括 Compare（文件差异对比）、NppFTP（直接编辑远程文件）、JSON Viewer（格式化和树状查看 JSON）等。日常类比：笔记本里的插袋——你可以往里塞尺子、量角器、便签贴，但插袋大小有限，不能把整个工具箱塞进去。

三层之间的分工很清晰：Scintilla 不知道自己被谁嵌入，Win32 壳不知道有哪些插件，插件不能替换 Scintilla 引擎。这种「各管各」的设计让 Notepad++ 20 年没出过架构级的破坏性变更。

值得一提的是 Notepad++ 的「双视图」（Dual View）功能：窗口可以左右分屏，同时打开两个文件对比查看，或者同一个文件的两个位置。这个就是用 Scintilla 实例化了两次，很巧妙。

## 实践案例

### 案例 1：正则替换批量改文件内容

你有 200 个 HTML 文件，要把所有 `<b>` 标签换成 `<strong>`。打开 Notepad++ → Ctrl+H 打开替换 → 勾选"正则表达式"：

```
查找: <b>(.*?)</b>
替换: <strong>\1</strong>
```

点“在所有打开的文件中替换”——200 个文件一次搞定。Windows 记事本连正则都没有。这个功能是很多人坚持用 Notepad++ 而不用记事本的最大原因。

### 案例 2：查看和转换文件编码

你从同事那拿到一个 CSV 文件，Excel 打开全是乱码。用 Notepad++ 打开 → 右下角状态栏显示 `ANSI`（这就是乱码原因：文件编码不是 UTF-8）→ 菜单“编码 → 转为 UTF-8” → 保存 → Excel 再开就正常了。

这个操作在 Windows 记事本里要到 2019 年以后的版本才支持。Notepad++ 还能显示换行符类型（Windows CRLF vs Unix LF），并一键转换——跨平台开发时经常需要这个功能。

### 案例 3：用宏自动化重复编辑

你要给 50 行日志每行头部加一个时间戳前缀。录制宏（菜单 → 宏 → 开始录制）→ Home 键跳到行首 → 输入 `[2026-06-24] ` → 按下箭头换行 → 停止录制 → "运行宏多次" → 输入 50 → 完成。不用写脚本、不用开终端。

### 案例 4：列编辑模式——竖着选、竖着改

你有一份 SQL 导出的数据，想在每行前面加一个 `INSERT INTO t VALUES (` 前缀。按住 Alt 键 + 鼠标从第一行拖到最后一行的同一列位置——这时光标变成了一条竖线，选中了每一行的行首。直接打字，所有行同时出现你输入的内容。这叫「列编辑」（Column Editing），在批量加前缀、对齐注释、删除固定位置的字符时极其好用，很多人用了几年 Notepad++ 都不知道有这个功能。

## 踩过的坑

1. **插件只能用 32 位或 64 位之一**：Notepad++ 有 32 位和 64 位两个版本，插件 DLL 必须匹配。很多新手装了 64 位 Notepad++ 却去下 32 位插件，装完没反应也不报错。
解决方法：用内置的“插件管理器”（Plugins Admin）装，它会自动匹配架构。

2. **默认不是 UTF-8 会埋雷**：早期版本新建文件默认用 ANSI 编码，写中文保存后换台机器可能乱码。
建议第一件事去“设置 → 新建 → 编码”改成 UTF-8（无 BOM）。现在新版默认已改，但如果打开旧文件还是要留意右下角的编码标识。

3. **大文件（> 500 MB）会卡死**：Scintilla 把整个文件加载到内存里做渲染，文件太大就吃光内存。
遇到 GB 级日志文件不要双击打开，改用 `Large File Viewer` 插件或命令行工具（如 `less`、`grep`）。这个限制是 Scintilla 架构决定的，Notepad++ 无法解决。

4. **自动更新有时覆盖自定义配置**：升级 Notepad++ 时如果选了“覆盖安装”，`%APPDATA%/Notepad++` 下的 `shortcuts.xml`（快捷键）和 `stylers.xml`（配色）可能被还原。
建议升级前手动备份这两个文件，或者用便携版（Portable）避免此问题。便携版把所有配置放在同一文件夹，U 盘拷走即可。

## 适用 vs 不适用场景

**适用**：

- 快速查看 / 编辑单个文件（配置、日志、脚本），不想等 IDE 启动
- Windows 环境下的文本批处理（正则替换、编码转换、列编辑）
- 教学场景：零依赖、免安装（便携版），适合给初学者做第一个代码编辑器
- 运维 / DBA 日常：快速看一段 nginx 配置、改一行 crontab、检查一份 CSV 的编码

**不适用**：

- 需要 LSP 补全 / 调试 / Git 集成的日常开发 → 用 [[vscode]] 或 JetBrains
- macOS / Linux 用户 → Notepad++ 只原生支持 Windows（Wine 可以跑但体验差），用 [[helix]] 或 [[neovim]]
- 需要浏览器内嵌编辑器 → 用 [[codemirror]] 或 [[monaco-editor]]
- 超大文件浏览（> 几百 MB）→ 用命令行工具或专门的日志查看器
- 需要现代异步插件生态 → Notepad++ 的 C++ DLL 插件写起来门槛远高于 VS Code 的 JS 扩展

## 历史小故事（可跳过）

- **2003 年**：法国程序员 Don Ho（越南裔）因为不满 Windows 记事本的功能匮乏，用 C++ 和 Scintilla 写了 Notepad++，发布在 SourceForge 上。名字里的 `++` 取自 C 语言的自增运算符，意思是「比记事本多一步」
- **2010 年**：Notepad++ 成为 SourceForge 年度最佳开发工具，下载量突破 2800 万次
- **2015 年**：仓库从 SourceForge 迁移到 GitHub，结束了在 SF 上 12 年的旅程
- **2019 年**：Don Ho 发布了以“自由香港”命名的 7.8.1 版本，引发政治争议但也让项目获得更多关注
- **2020 年起**：支持暗色主题（Dark Mode），跟上了现代编辑器的视觉标准
- **至今**：Don Ho 仍是唯一核心维护者，坚持只做 Windows 平台，拒绝跨平台。GitHub 上约 25k star

## 学到什么

1. **“够用”也是一种设计哲学**——Notepad++ 没有 LSP、没有调试器、没有内置终端，但正因为不做这些，它能保持 5 MB 体积和亚秒启动，在“快速看一眼文件”这个场景里无可替代。产品设计里“不做什么”往往比“做什么”更重要
2. **引擎和壳分离是长寿秘诀**——Scintilla 只负责编辑，Notepad++ 只负责壳和集成。Scintilla 升级了 Notepad++ 跟着升，Notepad++ 的 bug 不影响 Scintilla 其他用户
3. **Win32 API 的性能优势**——不用 Electron、不用 Qt、不用 .NET，直接调系统 API 的结果是启动快、内存少。代价是绑死 Windows
4. **个人项目靠纪律存活 20 年**——Don Ho 一个人维护至今，靠的是"不做跨平台、不做 IDE、只做编辑器"这三条边界
5. **GPL 许可证是一种态度**——Notepad++ 用 GPL v2，意味着任何基于它改的版本也必须开源。对个人维护者来说，GPL 是防止被闭源 fork 吸血的保护伞。对比 VS Code 的 MIT 许可证，后者允许闭源 fork（所以才有了 Cursor 这样的商业产品）

## 延伸阅读

- 仓库：[notepad-plus-plus/notepad-plus-plus](https://github.com/notepad-plus-plus/notepad-plus-plus)
- 官网与下载：[notepad-plus-plus.org](https://notepad-plus-plus.org/)（提供安装版和便携版，建议下载 64 位便携版先体验）
- Scintilla 引擎文档：[scintilla.org](https://www.scintilla.org/)（理解 Notepad++ 的编辑能力上限就看这个）
- 官方用户手册：[npp-user-manual.org](https://npp-user-manual.org/)（全部功能的详细说明，包括正则、宏、插件开发）
- 插件列表：[Notepad++ Plugin List](https://github.com/notepad-plus-plus/nppPluginList)
- 对比文章：Stack Overflow 年度开发者调查中编辑器使用排名变迁（搜 "Stack Overflow Developer Survey IDE" 即可找到历年数据）

## 关联

- [[vscode]] —— 功能远超 Notepad++ 但启动重 10 倍，两者解决的问题域不同
- [[codemirror]] —— 同样基于"引擎做核心、壳做集成"思路，但跑在浏览器里
- [[neovim]] —— 终端派编辑器，与 Notepad++ 同属"轻量不做 IDE"阵营，但跨平台
- [[helix]] —— Rust 写的终端编辑器，同样追求小而快
- [[lite-xl]] —— 不到 3 MB 的 GUI 编辑器，与 Notepad++ 精神类似但跨平台
- [[vscodium]] —— 去微软遥测的 VS Code，体积和启动速度介于 Notepad++ 和 VS Code 之间
- [[shellcheck]] —— 写 shell 脚本时用 Notepad++ 编辑、用 ShellCheck 检查语法，是 Windows 上常见的搭配

## 一句话记忆

Notepad++ = Scintilla 引擎 + Win32 原生壳 + C++ DLL 插件。三层分离、只做 Windows、拒绝膨胀，所以 5 MB 跑 20 年。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[codemirror]] —— CodeMirror — 编辑器不是一个类，是一组扩展的合奏
- [[geany]] —— Geany — 用 C 写的轻量级 GTK 编辑器
- [[lite-xl]] —— Lite-XL — 不到 3MB 的编辑器也能扩展出花样
- [[monaco-editor]] —— monaco-editor — 把 VSCode 编辑器搬进浏览器的 SDK
- [[vscode]] —— VS Code — 把编辑/调试/扩展捏成一个跨平台壳
- [[vscodium]] —— VSCodium — 去微软遥测的 VS Code 干净构建

