---
title: ghostwriter — Qt 干净 Markdown 写作器
来源: https://github.com/wereturtle/ghostwriter
日期: 2026-06-13
子分类: 编辑器与 IDE
分类: CLI
provenance: pipeline-v3
---

## 日常类比：打字机 + 校对窗，而不是 Word 画布

想象你在一家安静的咖啡馆写博客：左手边是一台 **老式打字机**——你敲什么字，纸上就出什么字，没有花哨工具栏打断思路；右手边立着一块 **小预览屏**，每打一行，排版后的成品立刻出现在屏幕上，方便确认标题层级、链接、代码块有没有写错。

**ghostwriter 就是这种「双区协作」的 Markdown 写作器。** 左侧编辑区始终显示 **纯 Markdown 源码**（`# 标题`、`**粗体**`、围栏代码块），右侧 **Live Preview** 实时渲染 HTML。它和 MarkText、Typora 的「所见即所得单画布」不同：你 **看得见标记语言本身**，预览只是辅助——更像程序员写 LaTeX 时左边源码、右边 PDF，而不是 Word 里直接改字号。

项目由 Megan Conkle（GitHub 账号 [wereturtle](https://github.com/wereturtle)）于 2015 年发起，现已成为 **KDE 官方应用**（仓库迁移至 [KDE/ghostwriter](https://github.com/KDE/ghostwriter)，主页 [ghostwriter.kde.org](https://ghostwriter.kde.org)）。技术栈是 **Qt + KDE Frameworks + C++**，内置 **cmark-gfm** 处理器；若系统 PATH 里装了 **Pandoc / MultiMarkdown / cmark**，启动时会自动检测并扩展导出与预览能力。GPL-3.0 开源，支持 **Windows、Linux**；macOS 安装包在 KDE Binary Factory 规划中。

零基础路径：**安装 → 写第一篇带标题与代码块的笔记 → 开 Focus / Hemingway 模式体验心流 → 用 Pandoc 导出 PDF 或 HTML 完成闭环**。

---

## 这个项目解决什么问题

### 痛点 1：富文本编辑器太重，分神

Word、LibreOffice Writer 功能堆叠，改个标题可能误触样式、页眉页脚。**ghostwriter 刻意做减法**：默认界面干净、可全屏、可 **Focus Mode**（只高亮当前句/段/行，其余淡出）， slogan 就是 *No excuses. No distractions. Just write.*

### 痛点 2：纯记事本没有结构感

`.txt` 无法表达标题层级、链接、列表；后期排版痛苦。Markdown 是 **plain text + 轻量标记**，可进 Git、可 diff、可被任何工具打开。ghostwriter 在 plain text 之上加了 **语法高亮、大纲导航、实时 HTML 预览**，写作与校对同屏完成。

### 痛点 3：预览与导出依赖不同「Markdown 方言」

GitHub 用 GFM，学术圈用 Pandoc，旧项目用 MultiMarkdown——各家的表格、脚注、数学公式语法不完全一样。ghostwriter **内置 cmark-gfm** 保证开箱预览；安装 Pandoc 等后可在 **导出对话框** 里换处理器，同一篇 `.md` 可出 HTML、PDF、ODT、Word 等，而不必手敲命令行（当然 Pandoc 仍可在终端单独用）。

### 痛点 4：长文写作时迷失结构

侧边栏 **Outline（大纲）** 从标题自动生成目录，点击可跳转编辑区或预览区对应位置；`Ctrl+J` 可键盘快速跳节。底部 **实时字数**，侧边栏还有 **Document Statistics / Session Statistics**，适合 NaNoWriMo、日更博客等需要量化进度的场景。

---

## 核心概念拆解

### 1. 双栏模型：Editor + HtmlPreview

架构上，`MarkdownEditor`（继承 Qt `QPlainTextEdit`）负责输入与存储；`HtmlPreview`（基于 `QWebEngineView`）把当前文档交给 Markdown 处理器转成 HTML 展示。你改一个字，预览会增量更新——2.2 起预览侧用 **React 只重绘变化部分**，长文档也不易卡死。

这与「WYSIWYG Markdown」的本质区别：

| 维度 | ghostwriter | MarkText / Typora |
|------|-------------|-------------------|
| 编辑区显示 | 始终 Markdown 源码 | 渲染后的视觉效果 |
| 学习曲线 | 需记住 `#`、`*` 等语法 | 更像 Word，语法可后学 |
| 适合人群 | 程序员、技术写作者、Git 用户 | 通用写作者、博客新手 |

### 2. Markdown 处理器链（Processor）

默认 **cmark-gfm**（CommonMark + GitHub Flavored Markdown：表格、任务列表、删除线、围栏代码块等）内置于应用，无需配置。

可选外置处理器（需在系统 `PATH` 中）：

| 处理器 | 典型用途 |
|--------|----------|
| **Pandoc** | 学术引用、复杂表格、LaTeX 数学、导出 PDF/DOCX |
| **MultiMarkdown** | 脚注、元数据、部分兼容语法 |
| **cmark** | 严格 CommonMark 环境 |

启动时自动检测；**预览与导出共用当前选中的处理器**，避免「编辑器里一种渲染、导出另一种」的意外——但若原文用了 Pandoc 专有语法而预览仍用 cmark-gfm，预览可能不完整，这时应切换处理器或安装 Pandoc。

### 3. 语法高亮：cmark-gfm AST 驱动

`MarkdownHighlighter` 不是简单正则涂色，而是借助 **cmark-gfm 解析 AST**，按节点类型（标题、强调、代码块、引用等）应用主题色。嵌套列表、跨行代码块识别比纯正则更准确。主题（Theme）为 **浅色 + 深色** 双配色方案，可在状态栏一键切换 Dark Mode。

### 4. 心流辅助：Focus Mode 与 Hemingway Mode

- **Focus Mode**：淡化非当前区域，可配置高亮 **当前行 / 句 / 段 / 三行**，适合长文续写。
- **Hemingway Mode**：禁用 Backspace 与 Delete，强迫 **只往前写、不回头删**，模拟打字机；适合头脑风暴、初稿冲刺（定稿前记得关掉）。

### 5. 文档生命周期：DocumentManager

`DocumentManager` 负责打开、保存、**自动保存（Autosave）**、备份与草稿。配合 **拖放图片** 到编辑区，会自动插入相对路径的 `![](...)` 语法——图片与 `.md` 同目录管理时，迁移项目文件夹不会断链。

### 6. 侧边栏四件套

| 标签 | 作用 |
|------|------|
| **Outline** | 标题树状导航 |
| **Document Statistics** | 字符、词数、阅读时间等 |
| **Session Statistics** | 本次会话写作量 |
| **Cheat Sheet** | 按 `F1` 查看 Markdown 速查 |

### 7. 命令行与特殊选项

```bash
ghostwriter my-article.md      # 直接打开文件
ghostwriter --disable-gpu      # 关闭 GPU 加速（Windows + Qt6 全屏菜单 bug 规避）
```

---

## 安装与第一次打开

### Linux（推荐，KDE Gear 打包）

```bash
# Debian / Ubuntu
sudo apt update && sudo apt install ghostwriter

# Fedora
sudo dnf install ghostwriter
```

较旧发行版可参考原作者 PPA / Copr（见 [KDE/ghostwriter README](https://github.com/KDE/ghostwriter)）。

### Windows

从 [KDE Binary Factory](https://binary-factory.kde.org/) 获取安装包或 nightly；若全屏下菜单无法弹出，使用 `--disable-gpu`。

### 可选：安装 Pandoc 解锁导出

```bash
# macOS
brew install pandoc

# Ubuntu
sudo apt install pandoc
```

安装后重启 ghostwriter，**Settings → Preferences** 里可确认是否检测到 Pandoc。

**建议第一次：**

1. 新建 `notes/welcome.md`，写三级标题与一段列表。
2. 打开右侧预览，观察 GFM 渲染。
3. 点右下角 **Focus**，试写两段感受淡出效果。
4. `Ctrl+J` 从大纲跳到某一节。
5. 若有 Pandoc：**File → Export** 试导出 HTML。

---

## 代码示例 1：技术博客骨架（GFM + 任务列表）

ghostwriter 对 GFM 开箱友好；下列结构可直接粘贴进编辑区，左侧看源码、右侧看博客效果。

```markdown
---
title: "用 ghostwriter 写第一篇技术笔记"
date: 2026-06-13
tags: [markdown, kde, writing]
---

# 用 ghostwriter 写第一篇技术笔记

## 为什么选双栏而不是 WYSIWYG

- 源码可进 Git，diff 清晰
- 预览只负责「看起来像不像成品」
- 快捷键 `Ctrl+B` / `Ctrl+I` 可包选中文字，不必手敲星号

## 本周 TODO

- [ ] 安装 Pandoc 并试导出 PDF
- [x] 打开 Focus Mode 写完本节
- [ ] 把图片拖进编辑器测相对路径

## 一段带语法高亮的代码

```python
def word_count(text: str) -> int:
    return len(text.split())
```

## 引用块

> ghostwriter 的 Hemingway Mode 适合初稿：
> **禁止删除**，逼自己先写完再改。

---

*最后更新：2026-06-13*
```

**操作提示：** 选中多行待办，按 `Ctrl+T` 可批量转为 `- [ ]` 任务项；在任务行按 `Ctrl+D` 切换 `[x]` 完成状态——比手改括号快。

---

## 代码示例 2：Pandoc 扩展——脚注、GFM 表格与数学

安装 Pandoc 并在 ghostwriter 中选用 Pandoc 处理器后，可使用下列 **扩展语法**（cmark-gfm 单独预览时脚注可能行为不同，以导出为准）。

```markdown
# 文献阅读笔记：注意力与写作工具

现代写作工具常在「功能」与「专注」之间取舍。[^1]

[^1]: Newport, *Deep Work* — 深度工作需减少上下文切换。

## 三种编辑器对照

| 类型           | 代表          | 编辑区所见     |
|----------------|---------------|----------------|
| 双栏源码+预览  | ghostwriter   | Markdown 源码  |
| 单栏 WYSIWYG   | MarkText      | 渲染后样式     |
| 学术工作台     | Zettlr        | 可分屏 + 引用  |

## 行内与块级公式（需 Pandoc + MathJax 预览）

欧拉公式 $e^{i\pi} + 1 = 0$ 常作为排版 smoke test。

$$
\int_0^1 x^2 \, dx = \frac{1}{3}
$$

## 导出命令等价物（终端侧）

若不用 GUI 导出，同一文件在终端可：

```bash
pandoc reading-notes.md -o reading-notes.pdf --pdf-engine=xelatex
pandoc reading-notes.md -o reading-notes.docx
```

ghostwriter 的 Export 对话框本质上封装了这类调用，并记住上次路径与格式。
```

**图片插入：** 将 `diagram.png` 拖入编辑区，可能生成：

```markdown
![](./diagram.png)
```

若文档尚未保存，会使用 `file://` 绝对路径；保存到项目目录后建议改为相对路径，便于协作。

---

## 常用快捷键速查

| 快捷键 | 作用 |
|--------|------|
| `Ctrl+B` | 粗体 `**...**` |
| `Ctrl+I` | 斜体 `*...*` |
| `Ctrl+K` | 删除线 |
| `Ctrl+.` | 当前行变引用 `>` |
| `Ctrl+8` / `Ctrl+Shift+-` | 无序列表 `*` / `-` |
| `Ctrl+1` | 有序列表 `1.` |
| `Ctrl+T` | GFM 任务列表 |
| `Ctrl+D` | 切换任务完成 `[x]` |
| `Shift+Enter` | Markdown 硬换行（行尾两空格效果） |
| `Ctrl+J` | 大纲快速跳转 |
| `F1` | 侧边栏 Markdown 速查 |
| `F11` | 全屏（视平台而定） |

可在 **Settings → Preferences → Editor** 开启 **自动配对括号/引号/星号**，选中文字后输入 `(`、`[`、`` ` `` 等会自动包裹。

---

## 与同类工具怎么选

| 场景 | 更合适的工具 |
|------|----------------|
| 要看见 Git diff 里的 Markdown 原文，偶尔预览 | **ghostwriter** |
| 完全不想学 `#` 语法，要 Word 式体验 | MarkText、Typora |
| 论文 + Zotero + 多格式 Pandoc 导出 | Zettlr |
| 已在 VS Code 里写 docs + CI | 继续 VS Code + 插件 |

ghostwriter 的甜区是：**KDE/Qt 原生体验、Linux 桌面、技术向长文、强调专注与双栏预览**。它不是 IDE，不做插件生态，但 **轻、快、GPL 自由**。

---

## 架构一瞥（给想读源码的人）

```
MainWindow
├── DocumentManager     # 打开/保存/自动保存/备份
├── MarkdownEditor      # QPlainTextEdit + 列表/引用智能回车
│   └── MarkdownHighlighter  # cmark-gfm AST 着色
├── HtmlPreview         # QWebEngineView 实时 HTML
└── Sidebar
    ├── OutlineWidget
    ├── Statistics
    └── CheatSheet
```

2.2 重要变更：**HUD 改为侧边栏**、默认处理器从 Sundown 换为 **cmark-gfm**、预览用 **React 增量更新**、主题支持 **SASS 风格变量** 的 QSS/CSS。若你从 wereturtle 旧版升级，习惯界面位置可能略有不同。

构建依赖 Qt 6（仍兼容 Qt 5）、KDE Frameworks、`cmake`；Linux 下典型流程：

```bash
git clone https://invent.kde.org/office/ghostwriter.git
cd ghostwriter && mkdir build && cd build
cmake .. && make && sudo make install
```

---

## 常见问题

**Q：预览和 Typora 渲染不一致？**  
A：检查当前处理器。GFM 表格、任务列表用内置 cmark-gfm 一般一致；Pandoc 脚注、div 语法需选 Pandoc 并保证文法匹配。

**Q：Windows 全屏后菜单点不出来？**  
A：Qt 6 + OpenGL + `QWebEngineView` 已知问题，用 `ghostwriter --disable-gpu` 或暂不全屏。

**Q：原 wereturtle/ghostwriter 和 KDE/ghostwriter 什么关系？**  
A：同一项目演进；新 bug 与发布请跟 [KDE Bugzilla](https://bugs.kde.org) 与 [invent.kde.org](https://invent.kde.org/office/ghostwriter)。笔记 frontmatter 保留经典入口 [github.com/wereturtle/ghostwriter](https://github.com/wereturtle/ghostwriter) 便于检索旧资料。

**Q：能写小说吗？**  
A：可以。Hemingway Mode + Focus + Session Statistics 对 NaNoWriMo 类长篇友好；最终仍建议按章节拆多个 `.md` 文件，用 Git 管理版本。

---

## 小结

| 要点 | 一句话 |
|------|--------|
| 定位 | Qt/KDE 双栏 Markdown 写作器，专注、轻量、GPL |
| 编辑哲学 | 写源码、看预览，而非隐藏标记 |
| 内置引擎 | cmark-gfm；可选 Pandoc / MMD / cmark |
| 心流功能 | Focus、Hemingway、全屏、大纲、统计 |
| 适合谁 | Linux 用户、技术博主、偏爱 plain text 写作者 |

下一步：用本文 **代码示例 1** 建仓库 `writing/` 目录，每日一篇 `.md`；需要交 PDF 时再装 Pandoc，走 **代码示例 2** 的导出路径——**先写起来，格式后补**，正是 ghostwriter 的设计初衷。

---

## 参考链接

- 项目主页：<https://ghostwriter.kde.org>
- Markdown 速查文档：<https://ghostwriter.kde.org/documentation>
- KDE 应用页：<https://apps.kde.org/ghostwriter/>
- 源码（KDE）：<https://github.com/KDE/ghostwriter>
- 历史仓库：<https://github.com/wereturtle/ghostwriter>
- John Gruber Markdown 规范：<https://daringfireball.net/projects/markdown/>
- cmark-gfm：<https://github.com/github/cmark-gfm>
- Pandoc：<https://pandoc.org>
