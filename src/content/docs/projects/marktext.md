---
title: MarkText — 实时预览 Markdown 编辑器
来源: https://github.com/marktext/marktext
日期: 2026-06-13
子分类: 编辑器与 IDE
分类: CLI
provenance: pipeline-v3
---

## 日常类比：Word 的「所见即所得」，但底层是 Markdown

如果你用过 Microsoft Word，一定熟悉这种体验：输入标题，字号立刻变大；加粗、斜体、列表，屏幕上马上变成排版后的样子，而不是一堆格式按钮的「源码」。

**MarkText 就是把这种体验搬到 Markdown 上。** 你仍然写的是 `# 标题`、`**粗体**`、`- 列表项` 这类轻量标记语言，但编辑器会在你敲完的瞬间把标记「吃掉」，只留下排版后的成品——这叫 **WYSIWYG（What You See Is What You Get，所见即所得）** 或 **实时预览**。和 Typora 同属这一派：专注写作、界面干净、少分心。

与「左边写 Markdown、右边看 HTML 预览」的分屏编辑器（如部分 VS Code 插件）不同，MarkText **只有一块画布**：光标所在行像 Word 一样直接显示效果，需要看原始语法时可切 **Source Code 模式**。文件保存的仍是 `.md` 纯文本，可进 Git、可被任何 Markdown 工具打开——**显示层像 Word，存储层像记事本**。

MarkText 是 MIT 许可的开源桌面应用，支持 **Linux、macOS、Windows**；官方仓库 [marktext/marktext](https://github.com/marktext/marktext) 在 GitHub 上有约 5.7 万 star。2026 年原作者恢复维护并发布 **v0.19.0**（TypeScript 迁移、渲染器沙箱加固等），官网为 [marktext.me](https://marktext.me)。

零基础学习路径：**安装 → 打开文件夹写第一篇 → 熟悉三种编辑模式 → 用 front matter / 数学公式 / 导出 PDF 完成一篇完整文档**。

---

## 这个项目解决什么问题

### 痛点 1：分屏预览打断写作心流

传统流程是：左边改 `# 标题`，眼睛要扫到右边确认渲染对不对，再跳回左边继续写。MarkText 把预览合并进编辑区，**视线不用在两栏之间来回跳**，适合写博客、读书笔记、技术文档等长文。

### 痛点 2：想要纯文本，又不想学复杂 IDE

Markdown 本质是 plain text，适合版本管理；但很多人被 VS Code + 插件的配置门槛劝退。MarkText **开箱即用**：安装后双击 `.md` 或拖文件夹进来就能写，没有 `settings.json` 也能完成 90% 日常写作。

### 痛点 3：需要导出、公式、任务清单等「正经文档」能力

它支持 **CommonMark**、**GitHub Flavored Markdown（GFM）** 以及部分 **Pandoc** 语法；扩展包括 **KaTeX 数学公式**、YAML **front matter**、emoji、脚注、高亮、任务列表等。可 **导出 HTML / PDF**，也可从剪贴板 **粘贴图片** 自动保存到本地并插入引用。

### 痛点 4：Linux 上缺少好看的本地 Markdown 编辑器

许多 Linux 用户长期把 MarkText 当作「平台上最好看的 Markdown 编辑器之一」。跨平台安装方式统一：macOS 有 `.dmg` / Homebrew，Windows 有 `.exe` / Winget / Chocolatey，Linux 按官方说明安装各发行版包。

---

## 核心概念拆解

### 1. 实时预览（Realtime Preview / WYSIWYG）

你在编辑器里输入 Markdown 标记；MarkText 在后台解析并 **立即渲染成排版后的 DOM**。输入 `#` 后接空格，该行会变成一级标题样式，井号不再占屏。这与 **marked**、**markdown-it** 等「字符串进、HTML 出」的库不同：MarkText 是 **带 UI 的完整应用**，负责光标、撤销、主题、导出整条链路。

理解这一点有助于排查「编辑器里看起来和导出的 PDF 不一致」类问题——例如 [Markdown Guide](https://www.markdownguide.org/tools/mark-text/) 指出：只按一次 Enter 在编辑区可能换行，但导出 HTML/PDF 时不一定产生 `<br>`，需用行尾空格或反斜杠 `\` 强制换行。

### 2. 三种编辑模式

| 模式 | 作用 | 类比 |
|------|------|------|
| **默认 WYSIWYG** | 边写边看成品 | Word 普通视图 |
| **Source Code 模式** | 显示原始 Markdown 源码 | Word 的「显示段落标记」+ 纯文本 |
| **Typewriter 模式** | 当前行居中，上下行变淡 | 打字机聚焦当前句 |
| **Focus 模式** | 只高亮当前段落/块 | 禅模式写作 |

快捷键可在偏好设置里查看；写作长文时 Typewriter / Focus 能减少页面其余内容的视觉干扰。

### 3. Markdown 方言与扩展

MarkText 声明支持：

- **CommonMark**：Markdown 的事实标准子集，保证基础语法行为可预期。
- **GFM**：GitHub 扩展——表格、任务列表 `- [ ]`、删除线 `~~`、围栏代码块等。
- **选择性 Pandoc**：部分 Pandoc 特有语法（如某些 div 类扩展）在兼容范围内可用。

额外扩展：**数学**（`$...$` / `$$...$$` + KaTeX）、**front matter**（文档顶部的 YAML 元数据）、**emoji**（短码或粘贴）。

### 4. 主题与导出

内置 **Cadmium Light、Material Dark** 等多套主题，分别控制编辑区配色与代码高亮。导出时生成独立 **HTML** 或 **PDF**，适合发邮件、打印、静态托管。复制时可选 **Markdown / HTML / 纯文本** 三种剪贴板格式——写技术博客时经常「在 MarkText 里写好 → 复制 HTML 贴进 CMS」。

### 5. 项目结构与维护状态

应用基于 **Electron** 构建（渲染进程已加强沙箱：`contextIsolation`、`nodeIntegration: false`）。v0.19.0 起主代码库 **迁移到 TypeScript**，并用 **Pinia** 管理偏好等状态。若你只想「用」而不是「改」，知道它是 Electron 即可——安装包体积会比纯原生编辑器大，但换来跨平台 UI 一致。

---

## 安装与第一次打开

### macOS

```bash
# Homebrew Cask（需 macOS 11+）
brew install --cask mark-text
```

或从 [Releases](https://github.com/marktext/marktext/releases) 下载 `marktext-mac-arm64-*.dmg` / `x64` 对应架构。

### Windows

```powershell
winget install marktext
# 或
choco install marktext
```

### Linux

按仓库 [Linux 安装说明](https://github.com/marktext/marktext#linux) 选择 AppImage、deb 等格式。

**第一次使用建议：**

1. 启动 MarkText → **File → Open Folder** 打开你的笔记目录（侧边栏会列出文件夹树）。
2. 新建 `hello.md`，输入下面「示例 1」的内容，观察标题、列表如何即时变成排版。
3. **Preferences** 里选主题、默认图片保存路径、是否开启 Vim 键位（如有需要）。

---

## 代码示例 1：一篇带 front matter 的技术笔记

MarkText 支持 YAML front matter，适合静态站点生成器（Hugo、Jekyll、Eleventy）或本仓库这类带元数据的文档。

```markdown
---
title: 用 MarkText 写第一篇笔记
tags: [markdown, 入门]
date: 2026-06-13
---

# 用 MarkText 写第一篇笔记

## 为什么选 Markdown

- **纯文本**：Git diff 友好，不怕专有格式锁死。
- **易学**：十分钟能覆盖 80% 日常语法。
- **可迁移**：同一份 `.md` 可在 MarkText、VS Code、Obsidian 间切换。

## 任务清单（GFM）

- [x] 安装 MarkText
- [ ] 写完示例并导出 PDF
- [ ] 把图片粘贴进文档

> 提示：在 MarkText 里输入 `>` 加空格，块引用会立刻变成左侧竖线样式。

行内代码：`npm install` 这样的片段用反引号包起来。

| 列 A | 列 B |
|------|------|
| 实时预览 | 少分心 |
| 导出 PDF | 适合分享 |
```

保存后，侧边栏文件名旁不会出现 front matter 的 `#` 号——元数据块通常被编辑器折叠或按主题渲染为文档属性区（视版本与主题而定）。导出 HTML 时，front matter 是否出现在输出里取决于导出逻辑；写静态站时 front matter 常由后续构建工具读取，而非直接给读者看。

---

## 代码示例 2：数学公式、代码块与脚注

技术写作常需要公式和高亮代码块。MarkText 用 **KaTeX** 渲染数学，围栏代码块带语法高亮。

````markdown
# 算法笔记：二分查找

时间复杂度满足：

$$
T(n) = O(\log n)
$$

行内公式：设中点 $mid = \lfloor (left + right) / 2 \rfloor$。

```python
def binary_search(arr: list[int], target: int) -> int:
    lo, hi = 0, len(arr) - 1
    while lo <= hi:
        mid = (lo + hi) // 2
        if arr[mid] == target:
            return mid
        if arr[mid] < target:
            lo = mid + 1
        else:
            hi = mid - 1
    return -1
```

脚注示例：二分查找要求数组有序[^1]。

[^1]: 无序数组需先排序，或改用线性扫描。

---

~~废弃写法~~：递归版二分在极深数组上可能栈溢出；工程上更常用上面的迭代写法。
````

**使用要点：**

- 块级公式用 `$$` 独占行；行内用单个 `$`（复杂表达式注意与货币符号冲突）。
- 代码块首行写语言名（如 `python`）以启用高亮。
- 脚注 `[^1]` 在 GFM 扩展下支持；导出 PDF 前建议在 MarkText 里预览脚注链接是否正确。

---

## 代码示例 3：图片与链接（含粘贴工作流）

```markdown
# 截图说明

![MarkText 界面示意](./assets/marktext-screenshot.png)

参考官方仓库：[marktext/marktext](https://github.com/marktext/marktext)

自动链接：<https://marktext.me>

<!-- 部分版本支持 HTML 注释，导出行为因目标格式而异 -->
```

**粘贴图片：** 截图后 `Ctrl/Cmd + V`，MarkText 会把图片存到偏好设置指定的目录（如 `./assets`），并插入相对路径的 Markdown 图片语法。这比手动「保存文件 → 写路径」快很多，适合写教程、Bug 报告。

**已知小差异：** Markdown Guide 提到，编辑区里尖括号 URL `<https://...>` 有时字面显示尖括号，但 **导出 HTML/PDF 后链接通常正确**；若以导出结果为准，以浏览器或 PDF 为准即可。

---

## 快捷键与效率习惯（常见默认，以实际版本为准）

| 意图 | 典型快捷键 |
|------|------------|
| 加粗 | `Ctrl/Cmd + B` |
| 斜体 | `Ctrl/Cmd + I` |
| 插入链接 | `Ctrl/Cmd + K` |
| 切换 Source Code | 命令面板或菜单 **View** |
| 导出 | **File → Export** |

段落快捷键：行首输入 `#`、`-`、`*`、`1.` 等，MarkText 会识别并切换块类型——和 Notion、Typora 类似，**用键盘完成结构，比鼠标点工具栏快**。

---

## MarkText 与相邻工具怎么选

| 工具 | 定位 | 和 MarkText 的关系 |
|------|------|-------------------|
| **Typora** | 商业 WYSIWYG Markdown | 体验相近；Typora 收费，MarkText 开源免费 |
| **Obsidian** | 知识库 + 双向链接 | 图关系、插件生态更强；MarkText 更偏「单文件线性写作」 |
| **VS Code + 插件** | 程序员通用 IDE | 适合边写代码边改 README；MarkText 更轻、写作 UX 更专注 |
| **marked / markdown-it** | JS 解析库 | 无 UI；MarkText 内部需要解析器，但用户不直接调用 API |

若你的目标是 **本仓库 `src/content/docs` 这类 Markdown 文档**：MarkText 足够胜任；front matter 字段与正文分离清晰，配合 Git 提交即可。

---

## 支持语法速查（基于 Markdown Guide 整理）

| 元素 | 支持 | 备注 |
|------|------|------|
| 标题、段落、引用、列表 | 是 | 基础 CommonMark |
| 表格、任务列表、删除线 | 是 | GFM |
| 围栏代码块 + 高亮 | 是 | 指定语言名 |
| 脚注、上下标、高亮 | 是 | 扩展语法 |
| 数学 KaTeX | 是 | `$` / `$$` |
| HTML 嵌入 | 是 | 导出时注意消毒/兼容性 |
| Heading ID `{#id}` | 否 | 需后处理或其它工具 |
| Definition List | 否 | 可改用普通列表 |

---

## 常见问题

### 换行和段落有什么区别？

Markdown 里 **空一行** 才是新段落；段内换行要用行尾两空格、`\\` 或 `<br>`。MarkText 编辑区对单次 Enter 的反馈可能与最终 HTML 不一致——**以导出结果为准**，养成「要硬换行就加 `\`」的习惯。

### 文件存在哪里？会不会锁死在专有格式？

全是 `.md`  UTF-8 文本，用任何编辑器都能打开。卸载 MarkText **不会**加密你的文件。

### 项目还维护吗？

2026 年 5 月发布 **v0.19.0**，原作者在 [Issue #4191](https://github.com/marktext/marktext/issues/4191) 说明恢复维护：合并 PR、修 IME 输入法、更新文档与发布流程。长期仍建议关注 Release 页面；关键文档应有 Git 备份。

### 和命令行工具如何配合？

MarkText 不负责 `git commit`；习惯可以是：MarkText 写作 → 终端 `git diff` Review → 提交。也可配置外部打开：在 MarkText 里用系统默认程序打开图片文件（v0.19 相关改进）。

---

## 动手练习（约 30 分钟）

1. **十分钟入门**：新建 `journal.md`，写三段：标题、无序列表、一段引用；切换 Source Code 模式对比源码与渲染。
2. **十分钟进阶**：在同一文件加入表格、任务清单、一段 `python` 代码块；导出 PDF 检查代码高亮是否保留。
3. **十分钟扩展**：新建 `note-math.md`，写两个 KaTeX 公式（行内 + 块级）；粘贴一张截图，确认 `assets` 目录生成图片且相对路径正确。

完成三项后，你应能解释：**WYSIWYG 预览、GFM 扩展、front matter、导出链路** 四个核心概念，并独立产出一篇可提交 Git 的 Markdown 文档。

---

## 延伸资源

- 官方仓库：[github.com/marktext/marktext](https://github.com/marktext/marktext)
- 官网与下载：[marktext.me](https://marktext.me)
- 语法对照：[Markdown Guide — MarkText](https://www.markdownguide.org/tools/mark-text/)
- 维护说明：[Maintenance Recovery & Future Plans #4191](https://github.com/marktext/marktext/issues/4191)
- 最新变更：[Release v0.19.0](https://github.com/marktext/marktext/releases/tag/v0.19.0)

---

## 小结

MarkText 把 **Word 式即时排版** 和 **Markdown 纯文本** 结合在一起：写作时少分心，保存时仍是最通用的 `.md` 格式。掌握实时预览、三种焦点模式、GFM 扩展与导出，就足够应对博客、读书笔记、项目文档等日常场景。作为零基础者的第一台 Markdown 编辑器，它的学习曲线主要是 **Markdown 语法本身**——而 MarkText 的职责，是让这套语法在屏幕上尽量「隐形」。
