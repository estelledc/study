---
title: Notepad++ — Windows 国民文本编辑器
来源: 'https://github.com/notepad-plus-plus/notepad-plus-plus'
日期: 2026-06-06
分类: CLI
子分类: 编辑器与 IDE
难度: 初级
---

## 是什么

Notepad++（读作"Notepad plus plus"）是 Windows 上最流行的免费开源代码/文本编辑器，体积约 5MB，却能应对 80+ 种语言的语法高亮、多标签编辑和插件扩展。日常类比：就像一把瑞士军刀夹在 Windows 资源管理器的右键菜单里——记事本负责"能打开"，Notepad++ 负责"真的能用"。

它的核心是 **Scintilla** 渲染控件——一个专为代码编辑设计的跨平台组件，负责语法高亮、代码折叠、自动缩进、括号匹配。Notepad++ 本身用纯 C++ + Win32 API 编写，不依赖 MFC 或 Qt，可执行文件保持 5MB 以下，在 Windows XP 时代便能流畅运行。

简单说：**你只想改一行 nginx.conf，不想等 VS Code 3 秒启动时，Notepad++ 是正确答案。**

## 为什么重要

不了解 Notepad++，下面这些日常场景都会让你多走弯路：

- 为什么在 Windows 上用记事本保存的 UTF-8 文件部署到 Linux 后出现乱码——编码问题是经典陷阱
- 为什么运维同学用"快速打开 + 正则批量替换"处理日志比写 Python 脚本更快——对工具能力的理解
- 为什么 2003 年一个学生用业余时间写的工具，能在 VS Code 横扫之后依然保持 28k GitHub Stars
- 为什么文本编辑器的"轻量"本身是一个值得设计的工程目标，而不是功能缺失

## 核心要点

Notepad++ 的能力可以拆成 **三个层次**：

1. **Scintilla 引擎：把复杂渲染外包给专家**
   Notepad++ 自己不写高亮算法，而是复用 Scintilla——后者被 SciTE、Geany、Komodo 等编辑器共同维护。Scintilla 用"词法器"（lexer）处理语言识别，Notepad++ 只需在 XML 文件里声明每种语言的关键字和颜色方案。这是"站在巨人肩上"的经典工程策略。

2. **插件系统：DLL 热插拔**
   Notepad++ 的插件机制非常直白：将符合接口规范的 `.dll` 放进 `plugins/` 目录，下次启动自动加载。140+ 社区插件（Compare、HEX Editor、XML Tools……）无需安装程序，也无需 Node.js / Python 运行时。这个设计极大降低了企业内网环境的部署门槛。

3. **国际化：XML 语言包热加载**
   界面文字存在外部 XML 文件里，90 种语言本地化，切换无需重新编译。Don Ho 本人是法国人，多语言支持从第一版起就是第一公民。

## 实践案例

### 案例 1：日志批量清洗——5 分钟替代半小时脚本

场景：收到一批服务器日志，需要把所有 IPv4 地址替换成 `[REDACTED]`，再把时间戳格式从 `2024/01/15 14:30:00` 改成 ISO 8601 `2024-01-15T14:30:00`。

操作步骤：

1. `Ctrl+H` 打开 Find & Replace，勾选 **Regular expression**
2. 第一轮：Find `\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b` → Replace `[REDACTED]`
3. 第二轮：Find `(\d{4})/(\d{2})/(\d{2}) (\d{2}:\d{2}:\d{2})` → Replace `\1-\2-\3T\4`
4. 如果要扫整个目录：`Search → Find in Files`，设定目录 + 正则 + Replace All

整个操作不写一行代码，处理完随手关掉，下次打开文件还在最近列表里。

### 案例 2：分屏对比配置文件——Compare 插件的杀手级用法

场景：线上 nginx.conf 和测试环境 nginx.conf 有差异，需要精确找出哪里不同。

```
操作流程：
1. 安装 Compare 插件（Plugin Manager → Compare → Install）
2. 打开 nginx_prod.conf → View → Move to Other View（分屏）
3. 打开 nginx_test.conf
4. Plugins → Compare → Compare（快捷键 Alt+D）
5. 差异行自动高亮：新增行绿色，删除行红色，修改行黄色
6. 逐行 Next Diff / Prev Diff 导航
```

比 `diff` 命令友好十倍，比 WinMerge 轻量，比 VS Code 启动快三倍。

### 案例 3：宏录制——零代码批量格式化

场景：从数据库导出的 CSV，每行末尾有多余空格，字段顺序需要调换，不想写脚本。

```
步骤：
1. Macro → Start Recording
2. 手动对第一行执行所有操作（Trim whitespace、移动列等）
3. Macro → Stop Recording
4. Macro → Run a Macro Multiple Times → 选 "Run until end of file"
```

录制结束，整个文件批量处理完毕。这是 Notepad++ 最容易被忽略但最省时的功能。

## 踩过的坑

1. **编码陷阱 ANSI vs UTF-8**：Windows 默认 ANSI（GBK/CP936）打开文件。对方给你 UTF-8 without BOM 的文件，中文直接乱码。正确操作：打开文件后，`Encoding → UTF-8` 然后 `Encoding → Convert to UTF-8`（注意区分"设置解码方式"和"转换文件编码"是两个不同操作）。

2. **CRLF 换行符地雷**：Windows 上编辑的 shell 脚本或 Dockerfile，默认保存 CRLF。上传 Linux 执行时报 `\r: command not found`。预防：在设置里把新建文件默认换行符改成 Unix (LF)；已有文件用 `Edit → EOL Conversion → Unix (LF)`。

3. **32/64 位插件不匹配**：安装了 64 位 Notepad++，却下载了 32 位插件 DLL，启动时静默失败，不报错。检查方法：`?  → Debug Info`，确认 Architecture，再去插件官网对应版本下载。

4. **自动更新供应链风险**：2025 年有记录的案例是 APT 组织劫持了 `gup.exe`（Notepad++ 更新程序）。最佳实践是从官方 GitHub Releases 页面手动下载，用 `certutil -hashfile` 验证 SHA-256，不使用自动更新。

## 适用 vs 不适用场景

**适用**：
- 快速打开、查看、修改配置文件（无需 IDE 启动时间）
- 正则批量替换一次性处理任务（无需写脚本）
- 企业内网离线环境（无 npm/pip，只有 Windows）
- 教学场景：展示语法高亮但不想装复杂环境
- 处理编码/换行符格式转换问题

**不适用**：
- 大型项目开发（无 LSP、无 Git 集成、无调试器）
- macOS / Linux（原生不支持，Wine 下体验差）
- 需要智能补全 / Copilot 的场景（用 VS Code 或 Zed）
- 超大文件（>100MB）——Scintilla 在此场景下比 vim 卡

## 历史小故事（可跳过）

- **2003 年**：法国巴黎第七大学学生 Don Ho 不满公司在用的 Java 编辑器 JEXT 响应迟钝，用业余时间写了 Notepad++ 第一版，发布在 SourceForge。
- **2010 年**：SourceForge 要求配合美国出口限制对部分国家屏蔽下载，Don Ho 拒绝并迁移到法国 TuxFamily 服务器。
- **2015 年**：迁移到 GitHub；同年版本命名"Free Uyghur"引发广泛关注。历来版本名都带有政治表态：`Stand with Hong Kong`、`Declare variables not war`、`Free Kashgar`……
- **2016 年**：Stack Overflow 开发者调查连续第二年位列"最常用文本编辑器"第一，彼时 VS Code 刚满一岁，Sublime 正值巅峰。
- **2021 年后**：VS Code 全面崛起，Notepad++ 主动减少功能扩展，聚焦"极轻量"定位，下载量依然稳定在每月百万级。

## 学到什么

1. **轻量是设计目标，不是功能残缺**：5MB 体积 + 零依赖是主动选择的约束。在存储和内存昂贵的年代，这让它跑在任何 Windows 上；在 VS Code 横行的今天，这依然是差异化价值。
2. **复用胜于自研**：语法高亮外包给 Scintilla，插件能力外包给社区 DLL，作者专注核心壳体。"站在巨人肩上"不是偷懒，是工程判断。
3. **编码和换行符是每个 Windows 开发者的必修课**：ANSI/UTF-8/BOM、CRLF/LF 的坑几乎每个人都踩过；工具理解好了这一关，大量跨平台 bug 变透明。
4. **一个人的项目也能影响数亿人**：Don Ho 一个人起步，至今仍是主要维护者，证明了正确的架构选择（Scintilla + 插件 DLL）能让项目长寿。
5. **政治表态可以成为品牌资产**：每次版本命名都是一次公开立场，这让 Notepad++ 不只是工具，也是一种价值观的载体——这在开源项目里极为罕见。
6. **"不增加功能"也是产品决策**：VS Code 崛起后，Notepad++ 没有追加 LSP / AI 补全，而是坚守"秒开、5MB、无依赖"定位，这需要克制，比盲目堆功能更难。

## 延伸阅读

- 官方文档：[Notepad++ User Manual](https://npp-user-manual.org/)（功能详尽，搜索即用）
- Scintilla 项目：[scintilla.org](https://www.scintilla.org/)（理解 Notepad++ 渲染内核的起点）
- Don Ho 博客：[donho.github.io](https://donho.github.io/)（作者对编辑器设计哲学的思考）
- 插件列表：[GitHub npp-plugins](https://github.com/notepad-plus-plus/nppPluginList)（社区维护的插件注册表）
- [[vscode]] —— 同为文本编辑器，VS Code 用 Electron + LSP 走了另一条路
- [[neovim]] —— 极简主义路线的代表，Notepad++ 的 Unix 精神对应物

## 关联

- [[vscode]] —— 同类编辑器，用 Electron 换取跨平台和 LSP 生态，启动较慢
- [[neovim]] —— 终端编辑器，模式编辑 vs 菜单驱动，两套不同的效率哲学
- [[zed]] —— Rust 写的新生代编辑器，走"极速轻量"路线，是 Notepad++ 设计目标的现代诠释
- [[helix]] —— 内置 LSP 的模式编辑器，与 Notepad++ 同样无需配置即可使用
- [[kakoune]] —— 同为轻量编辑器，以"多游标优先"为核心设计理念
- [[biome]] —— Rust 工具链，与 Notepad++ 的 Find & Replace 是同类"无 LSP 快速处理"场景的不同工具
- [[shellcheck]] —— 配合 Notepad++ 编写 shell 脚本时，静态检查换行符/语法错误的好搭档

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[biome]] —— Biome — JS/TS 工具链一体化（Rust 写的 linter+formatter）
- [[geany]] —— Geany — GTK 轻量 IDE
- [[kakoune]] —— Kakoune — 多光标优先模态编辑器
- [[vscode]] —— VS Code — 把编辑/调试/扩展捏成一个跨平台壳

