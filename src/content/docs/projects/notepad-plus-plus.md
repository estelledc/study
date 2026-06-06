---
title: Notepad++ — Windows 国民文本编辑器
来源: 'https://github.com/notepad-plus-plus/notepad-plus-plus'
日期: 2026-06-06
分类: CLI
子分类: 编辑器与 IDE
难度: 初级
---

## 是什么

Notepad++ 是 Windows 上最流行的免费开源代码/文本编辑器，由法国开发者 Don Ho 于 2003 年用纯 C++ 编写，基于 Scintilla 渲染内核。你可以把它理解为**系统自带记事本的涡轮增压版**：同样是双击就能打开，但多出了语法高亮、多标签页、正则搜索替换、宏录制和上百个插件。

安装包只有约 5MB，启动速度比任何 IDE 都快，不联网、不用账号、不收集数据。这是它在程序员、运维工程师和普通用户中长期霸榜的核心原因。

Scintilla 是一个专门为代码编辑器设计的渲染控件，负责语法高亮、代码折叠、行号显示等底层绘制；Notepad++ 在它之上只写了 Win32 UI 逻辑，整个项目连 MFC / Qt 都不依赖，可执行文件极小。2015 年 Stack Overflow 开发者调查中，34.7% 的受访者每天使用它，位列全球第一；2014 年 Lifehacker 读者调查中它以 40% 的票数拿下"最受欢迎文本编辑器"。

## 为什么重要

不理解 Notepad++，下面这些日常问题都很难解释清楚：

- 为什么把在 Windows 写的 shell 脚本上传到 Linux 服务器后，bash 报"command not found"——行尾 CRLF 换行符是罪魁祸首，而 Notepad++ 能一键转换
- 为什么"用记事本改配置文件"是新手噩梦：记事本不显示 UTF-8 BOM、不区分 CRLF/LF、不支持正则——Notepad++ 全解决
- 为什么运维工程师不需要 IDE 也能高效处理几百个日志文件：Find in Files + 正则替换让批量处理变成几秒钟的事
- 为什么一个 5MB 的编辑器能用 20 年不被淘汰：极简架构 + 稳定插件生态 + 零学习成本，解决了"够用就行"的大多数场景

## 核心要点

1. **Scintilla 内核**：Notepad++ 把语法高亮、代码折叠、基础词语补全等渲染细节全部委托给 Scintilla 控件，自己只负责菜单、工具栏、标签页等 Win32 UI。类比：Scintilla 是发动机，Notepad++ 是车身——换一套车身（如 SciTE、Code::Blocks）可以用同一台发动机。语言定义通过外部 XML 文件描述，新增一门语言无需重编译，用户可以自定义"用户自定义语言"（UDL）。

2. **正则 + 宏录制**：Find & Replace 支持完整的 Perl 风格正则（PCRE），包括捕获组、环视断言、换行匹配（用 `\n`）。Macro 录制则允许把一系列键盘/菜单操作录下来批量重放 N 次，不需要写任何脚本。两者组合起来，处理格式混乱的 CSV、日志文件、配置文件，效率是手动操作的十倍以上。

3. **插件生态**：通过 Plugin Admin 可以安装 140+ 社区插件，涵盖 Compare（分屏 diff）、NppFTP（直接在编辑器内编辑远程文件）、XML Tools（XML 格式化验证）、JSON Viewer 等高频工具。插件以 DLL 形式加载，注意 32/64 位必须匹配，部分老插件（如 TextFX）在 64 位版本中已停止维护。

## 实践案例

### 案例 1：批量清洗日志文件

```
场景：一目录下有 200 个 .log 文件，需要把所有 ISO 8601 时间戳
     2026-06-06T09:18:00Z 统一替换为标记字符串 TIMESTAMP
```

操作步骤：

1. Search → Find in Files，Directory 填日志目录，勾选"Regular expression"
2. Find What 填：`\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z`
3. Replace With 填：`TIMESTAMP`
4. 点 Replace in Files，结果直接写回磁盘

**逐部分解释**：
- `\d{4}` 匹配 4 位年份，`\d{2}` 匹配月/日/时/分/秒
- `T` 和 `Z` 是 ISO 8601 字面量分隔符
- "Find in Files"跨文件替换，不需要逐个打开文件，200 个文件 30 秒完成

### 案例 2：对比两个配置文件的差异

```
场景：nginx.conf 升级后怀疑某行被意外改动，需要和备份版本对比
```

操作步骤：

1. 打开两个文件分别在两个标签页
2. 安装 Compare 插件（Plugin Admin → Compare → Install）
3. 分别在两个标签页激活，点 Plugins → Compare → Compare
4. 差异行高亮显示：绿色为新增，红色为删除，黄色为修改

**补充说明**：Compare 插件底层用 Myers diff 算法，与 `git diff` 输出结果一致。分屏时双窗口同步滚动，适合逐段核对长配置。

### 案例 3：宏录制批量格式化

```
场景：100 行 CSV 每行格式为 "name,age,city"，需要把第 2 列移到最后
```

操作步骤：

1. Macro → Start Recording
2. 手动对第一行做一次正则替换：Find `^(\w+),(\d+),(.+)$` → Replace `\1,\3,\2`
   （`\1` 代表第 1 个括号匹配到的内容，`\3` 是第 3 个）
3. Macro → Stop Recording
4. Macro → Run a Macro Multiple Times → 99 次

**说明**：宏录制会记录所有键盘和菜单动作（包括正则替换的参数），重放时完全复现，不需要写 Python/awk 脚本，适合不会编程的用户。

## 踩过的坑

1. **编码陷阱**：收到对方给的"乱码"文件，大概率是 UTF-8 with BOM 被当成 ANSI 打开。解法：Encoding → Encode in UTF-8 BOM（或用自动检测）；永久解决：Settings → Preferences → New Document → Encoding 改为 UTF-8。

2. **换行符地雷**：在 Windows 上用默认设置写的文件行尾是 CRLF（`\r\n`），上传到 Linux 的 shell 脚本会在每行末尾有一个 `\r`，导致 bash 报错。解法：Edit → EOL Conversion → Unix (LF)，再保存。批量转换可用 Find in Files 正则 `\r\n` 替换 `\n`。

3. **插件 32/64 位不匹配**：Plugin Admin 里安装成功但启动报错"无法加载 DLL"，十有八九是插件的位数和 Notepad++ 主程序不一致。下载插件时注意仓库里 `x64/` 和 `x86/` 目录的区别，手动把正确版本的 dll 放进 `%APPDATA%\Notepad++\plugins\<PluginName>\` 目录。

4. **更新链供应链风险**：2025 年曾发生国家级攻击者（APT31）劫持 Notepad++ 自动更新程序（gup.exe）的事件，受影响版本为 8.8.8。建议始终从 GitHub Releases 页面手动下载，并用 GPG 公钥（Key ID: 0x8D84F46E）验证签名后再安装，不依赖自动更新。

## 适用 vs 不适用场景

**适用**：

- 快速查看和编辑各类文本文件（配置、日志、CSV、XML、JSON、Markdown）
- 正则批量替换跨目录文件，不想写脚本的场景
- Windows 环境下的轻量代码浏览（不需要调试、补全、重构）
- 运维日常：日志清洗、配置对比、编码转换、换行符修复
- 离线、受限网络环境（无需联网、无账号）

**不适用**：

- 需要智能补全（IntelliSense 级别）、调试器、单元测试集成 → 用 VSCode / IDE
- 大文件（>50MB）频繁编辑 → Notepad++ 在超大文件上会明显卡顿，专用日志查看器（如 glogg、LogExpert）更合适
- 跨平台团队协作（Linux / macOS 用户无法运行 Notepad++）→ 用 VSCode 或 Neovim
- 需要 LSP（Language Server Protocol）级别的静态分析 → Notepad++ 不支持 LSP

## 历史小故事（可跳过）

- **2003 年 11 月**：Don Ho 在法国一家公司上班时，对公司用的 JEXT（Java 写的编辑器）性能不满，业余时间用 C++ 重写了一个更快的版本，发布在 SourceForge，取名 Notepad++（来自 C++ 的后缀自增运算符）。
- **2010 年**：美国政府要求 SourceForge 屏蔽伊朗、古巴、朝鲜、叙利亚用户，Don Ho 认为这违背自由软件精神，将项目迁移到法国服务器 TuxFamily。
- **2014–2019 年**：每个版本发布都带有政治声明代号，如"Tiananmen June Fourth Incident Edition"、"Free Uyghur"、"Stand with Hong Kong"、"Declare variables, not war"，项目也因此多次遭遇 DDoS 和黑客攻击。
- **2015 年**：Stack Overflow 全球调查中，Notepad++ 以 34.7% 的使用率成为"世界第一文本编辑器"；同年彻底离开 SourceForge，迁到 GitHub。
- **2025–2026 年**：APT31 劫持更新链事件曝光，项目紧急迁移主机并加固更新验证机制，成为开源软件供应链安全的典型案例。

## 学到什么

1. **极简架构的生命力**：不用 MFC / Qt / Electron，只写 Win32 + STL，20 年后仍然是 5MB 秒开——"没有的依赖就不会出问题"是一种被低估的工程哲学；Electron 应用动辄 200MB，Notepad++ 的克制是一种主动选择
2. **委托专用内核**：把渲染交给 Scintilla，自己只做 UI 编排，与其他用 Scintilla 的编辑器（SciTE、Geany）形成差异靠的是插件生态和 UX 决策，而非重新发明渲染轮子；"找对已有的内核，做好集成层"是许多长寿项目的共同模式
3. **换行符和编码是永远的坑**：Windows CRLF / UTF-8 BOM 在跨平台协作中是高频踩坑点，了解它们的原理比记住"用 Notepad++ 转一下"更重要；每次"文件上传后脚本失效"，第一个排查点都应该是 EOL 格式
4. **供应链安全不只是大厂的问题**：一个 5MB 的开源工具也能成为国家级攻击者的跳板，GPG 签名验证和手动下载是最后一道防线；自动更新的便利性和安全性是一对永恒的张力

## 延伸阅读

- [Notepad++ 官方网站](https://notepad-plus-plus.org/) — 下载页 + 发布日志，每个版本都有政治声明值得一读
- [Scintilla 文档](https://www.scintilla.org/ScintillaDoc.html) — 了解 Notepad++ 底层渲染控件的 API 设计
- [GitHub Release + GPG 验证指南](https://github.com/notepad-plus-plus/notepad-plus-plus/releases) — 手动下载并验签的正确姿势
- [Compare 插件](https://github.com/pnedev/compare-plugin) — Notepad++ 最常用的 diff 插件，Myers 算法实现
- [[vscode]] —— 对比：VSCode 走 LSP + Electron 重量级路线，Notepad++ 走 Win32 + Scintilla 极简路线，两者互补

## 关联

- [[vscode]] —— 现代编辑器的代表，拥有 LSP / 调试 / 扩展市场，与 Notepad++ 分工为"重型 IDE 替代品"vs"轻量快开工具"；两者核心用户群体高度重合但使用场景几乎互不干扰
- [[shellcheck]] —— 在 Notepad++ 里写完 shell 脚本后，用 ShellCheck 检查语法错误，特别是 CRLF 换行符引发的隐藏 bug；Notepad++ 的 EOL 转换功能是把脚本从 Windows 发到 Linux 前的必做步骤
- [[github-actions]] —— Notepad++ 本身的 CI 用 GitHub Actions 构建 Windows 二进制（x86/x64/ARM64 三套），是纯 Win32 C++ 项目跨架构构建的参考案例；同时 Actions 也是开源项目防供应链攻击的重要环节
- [[gitui]] —— 轻量终端 Git UI，与 Notepad++ 搭配是 Windows 开发者不装任何重型工具也能高效工作的组合
- [[nix]] —— 与 Notepad++ 的"小即是美"形成对比：Nix 用声明式构建解决可重复性，Notepad++ 用极简依赖解决可靠性，方向不同但都是对"臃肿"的逆反

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）

