---
title: ghostwriter — Qt 干净 Markdown 写作器
来源: 'https://github.com/wereturtle/ghostwriter'
日期: 2026-07-07
分类: editors
难度: 初级
---

## 是什么

ghostwriter 是一个给 Markdown 长文准备的桌面写作器。日常类比：普通编辑器像一张堆满按钮的办公桌，ghostwriter 像把桌面清空，只留下纸、笔、字数表和一个随时能打开的预览窗。

它用 Qt / KDE 技术栈写成，目标不是替代 IDE，而是让你专心写博客、论文草稿、小说章节、会议记录这类纯文本长文。

最小使用方式很朴素：

```bash
ghostwriter myfile.md
```

这行命令的意思是：用 ghostwriter 打开一个 Markdown 文件。文件仍然是普通 `.md`，离开 ghostwriter 后也能被 GitHub、Pandoc、Obsidian、VS Code 继续读取。

它的特别之处在于：暗色/亮色主题、Focus Mode、Hemingway Mode、实时 HTML 预览、文档大纲、字数统计、自动保存，都围绕“写作时少分心”服务。

## 为什么重要

不理解 ghostwriter，下面这些事就容易想偏：

- 会把 Markdown 写作误解成“必须在代码编辑器里忍受一堆开发按钮”，其实长文写作需要更安静的界面节奏
- 会低估“专注模式”的价值：它不是花哨滤镜，而是帮大脑只盯住当前句子、段落或三行文字
- 会以为实时预览一定会拖慢长文，ghostwriter 专门优化了大文档预览，避免每打一个字都卡住
- 会把 Markdown 工具当成格式转换器；ghostwriter 更像写作前台，Pandoc / cmark-gfm / MultiMarkdown 是后台处理器

## 核心要点

ghostwriter 的设计可以拆成三件事：

1. **干净编辑区**：界面尽量少打扰，像写字时把手机翻过去。全屏、暗色主题和 Focus Mode 都是为了减少视觉噪音，让当前段落成为唯一主角。

2. **实时反馈**：右侧预览、大纲、字数和会话统计像跑步手表。它们不替你写，但会告诉你“写了多少、结构到哪、导出后大概长什么样”。

3. **Markdown 处理器可替换**：内置 cmark-gfm，也能自动发现 Pandoc、MultiMarkdown 或 cmark。类比：前台还是同一个写字台，后厨可以换成不同排版师，决定表格、脚注、数学公式等扩展怎么渲染。

这三点组合起来，ghostwriter 适合“写作先于排版”的工作流：先把想法写出来，再处理格式细节。

## 实践案例

### 案例 1：从终端打开当天草稿

你在项目目录里已经有一篇草稿：

```bash
ghostwriter daily-note.md
```

逐部分解释：

- `ghostwriter` 是应用入口，适合从终端直接拉起桌面窗口
- `daily-note.md` 是普通 Markdown 文件，不是 ghostwriter 专有格式
- 这个用法来自 README 的命令行说明，适合“终端里管理文件，图形界面里专心写”的人

如果 Windows 上 Qt6 全屏时菜单打不开，README 还给了一个绕过 GPU 的命令：

```bash
ghostwriter --disable-gpu
```

这不是性能优化开关，而是一个兼容性逃生门：遇到 QtWebEngine / OpenGL 全屏菜单问题时才考虑。

### 案例 2：写带表格和数学公式的技术文章

ghostwriter 会自动检测 PATH 里的 Pandoc、MultiMarkdown、cmark 或 cmark-gfm；装好处理器后，实时预览和导出能力会跟着增强。

一篇文章里可以这样写：

```markdown
# 训练记录

损失函数写成 $L = \sum_i (y_i - \hat{y_i})^2$。

| epoch | loss |
| --- | --- |
| 1 | 0.42 |
| 2 | 0.31 |
```

逐部分解释：

- `$...$` 是很多 Markdown 处理器支持的数学写法，ghostwriter 的 MathJax 场景更依赖 Pandoc
- 表格语法在 cmark-gfm / MultiMarkdown / Pandoc 里都常见，但细节可能不完全一样
- ghostwriter 负责“边写边看”，真正的扩展语法解释由选中的 Markdown 处理器完成

这个案例的坑在于：预览能不能正确显示数学和表格，不只看 ghostwriter，也看你机器上到底有哪些处理器。

### 案例 3：把长文拆成能导航的章节

项目站说明，侧边栏大纲可以跳到任意章节；quick reference 也列了常用 Markdown 快捷键。长文可以先搭骨架：

```markdown
# 第一章：为什么开始写

## 1. 旧流程的问题

- [ ] 收集例子
- [ ] 写结论

![草图](./images/draft.png)
```

逐部分解释：

- `#` 和 `##` 会进入文档大纲，按 `Ctrl` + `J` 可以快速跳章节
- `- [ ]` 是任务列表，文档里可用 `Ctrl` + `D` 切换完成状态
- 拖拽图片进编辑器时，ghostwriter 会插入类似 `![](../../relative/path/to/file.png)` 的图片链接

这适合写教程、复盘、小说章节：先用标题搭结构，再用 Focus Mode 只盯当前段落，最后用 Hemingway Mode 暂时禁止退格和删除，逼自己先写完再修改。

## 踩过的坑

1. **把 ghostwriter 当 IDE**：它没有代码补全、调试器和项目索引，因为目标是 Markdown 写作，不是软件开发。

2. **误以为所有预览问题都是编辑器 bug**：数学公式、脚注、表格经常取决于 Pandoc / cmark-gfm 等处理器是否安装和被识别。

3. **Windows Qt6 全屏菜单问题**：README 明确提到 QtWebEngine 触发 OpenGL 后可能让全屏菜单显示异常，必要时用 `--disable-gpu`。

4. **大段删除或 Unicode 高亮曾经踩坑**：CHANGELOG 里多次修过大文档冻结、中文预览、Unicode 高亮偏移等问题，说明长文编辑器的“不卡”和“不错位”都要专门工程化。

## 适用 vs 不适用场景

**适用**：

- 写博客、学习笔记、课程论文、小说章节、会议纪要等长篇 Markdown
- 喜欢暗色主题、全屏、Focus Mode、Hemingway Mode 的专注写作者
- 需要一边写一边看 HTML 预览、大纲和字数统计
- 希望文件仍然保持普通 `.md`，方便交给 Git、Pandoc 或其他编辑器

**不适用**：

- 写代码为主，需要补全、跳转定义、调试和项目级搜索
- 需要 Obsidian 那种双链知识库、插件市场和图谱视图
- 需要在线多人协作、评论、修订记录
- 需要精细排版到出版级 PDF，后段仍应交给 Pandoc、LaTeX 或排版软件

## 历史小故事（可跳过）

- **2015 年**：项目站标注 ghostwriter “Est. 2015”，定位从一开始就围绕“少借口、少打扰、直接写”。
- **早期**：项目由 wereturtle 维护，仓库后来进入 KDE 生态，README 的旧地址会重定向到 KDE/ghostwriter。
- **2021 年 2.0.0**：默认处理器切到 cmark-gfm，实时预览改成只更新变化部分，大文档预览体验明显改善。
- **2022 年 2.1.x**：围绕 MathJax、Pandoc、Qt6、GPU、主题可访问性修了很多边缘问题，说明“写作体验”背后有不少工程细节。
- **2024 年 24.08.0**：项目随 KDE Gears 节奏继续演进并迁到 Qt6，GitHub 星标约 4.9k。

## 学到什么

1. **写作工具的核心不是功能多，而是干扰少**：ghostwriter 把界面收窄到“写、预览、统计、导航”四件事。
2. **Markdown 是文件格式，不是某个应用的领地**：ghostwriter 保存普通文本，所以迁移成本低。
3. **桌面应用也可以分前台和后台**：ghostwriter 管编辑体验，Pandoc / cmark-gfm 管语法和导出。
4. **长文体验靠细节堆出来**：Focus Mode、自动保存、Unicode 修复、大文档预览优化，都是让作者不断流的工程工作。

## 延伸阅读

- 官方项目站：[ghostwriter.kde.org](https://ghostwriter.kde.org/)（功能巡览、截图、下载入口）
- 官方 quick reference：[Documentation](https://ghostwriter.kde.org/documentation/)（Markdown 语法、快捷键、图片拖拽示例）
- 项目 README：[KDE/ghostwriter](https://github.com/KDE/ghostwriter)（命令行、处理器、构建和兼容性说明）
- 相关工具：[[pandoc]] —— 把 Markdown 转成 HTML、PDF、docx 等格式
- 相关工具：[[obsidian]] —— 面向双链知识库的 Markdown 应用

## 关联

- [[markdown]] —— ghostwriter 编辑的核心文件格式，语法简单但生态很大
- [[pandoc]] —— ghostwriter 可自动发现的外部处理器，决定很多导出能力
- [[obsidian]] —— 同样写 Markdown，但重点从“专注写作”转向“知识库连接”
- [[vscode]] —— 也能写 Markdown，更适合代码项目里的文档，不如 ghostwriter 安静
- [[qt]] —— ghostwriter 的桌面 GUI 技术基础，QtWebEngine 也带来预览与 GPU 相关坑点
- [[kde]] —— ghostwriter 现在所在的应用生态，发布节奏和贡献流程受 KDE 影响

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
