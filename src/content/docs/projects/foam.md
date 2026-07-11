---
title: Foam — 把 VS Code 变成 Markdown 双链知识库
来源: 'https://github.com/foambubble/foam'
日期: 2026-07-07
分类: editors
难度: 初级
---

## 是什么

Foam 是一套跑在 VS Code 里的个人知识管理工具：你还是写普通 `.md` 文件，但多了 `[[双链]]`、反向链接、图谱、每日笔记和模板。日常类比：像把一叠散落的便签放进一张可搜索地图里，便签还是纸，地图帮你看见它们之间的路。

最小例子：

```markdown
# 阅读笔记

今天看了 [[Zettelkasten]]，想到它可以连接 [[VS Code]] 工作流。
```

在普通 Markdown 工具里，这只是文本；在 Foam 里，`[[Zettelkasten]]` 会变成可跳转的知识链接。如果目标笔记还不存在，Foam 会把它当成占位链接，等你以后点开再补内容。

它的关键不是"又发明一种笔记格式"，而是把 Roam / Obsidian 那类双链体验放回 VS Code 和 Git：内容是你自己的文件，编辑器是你已经熟悉的编辑器，同步和发布也可以继续用 GitHub。

## 为什么重要

不理解 Foam 的定位，下面这些事都没法解释：

- 为什么很多双链工具好用但让人担心迁移：数据库或私有格式越多，未来搬家越痛
- 为什么 VS Code 用户会想在同一个窗口里写代码、写笔记、查资料：上下文切换本身就很贵
- 为什么 `[[wikilink]]` 比文件夹层级更适合知识：一个想法常常同时属于多个主题
- 为什么 Git 对笔记很重要：Markdown 文本可以 diff、review、回滚，也能发布成站点

## 核心要点

Foam 的设计可以拆成 **三条**：

1. **文件优先**：所有内容都是 Markdown 文件。类比：它不是把书锁进特殊书柜，而是在普通纸页上贴标签；哪天不用 Foam，文件仍能被别的编辑器打开。

2. **链接优先**：你用 `[[note]]` 主动连出去，Foam 自动找谁又连回你。类比：写明信片时你只写收件人，邮局顺手给你做了一张通讯录。

3. **VS Code 优先**：图谱、补全、重命名同步、模板、每日笔记都走编辑器命令。类比：不是另买一张新桌子，而是给旧书桌加抽屉、索引卡和地图。

这三条合起来就是 **"知识库体验 + 普通文件底座"**：它想让人享受双链，但不把内容绑死在某个应用里。

## 实践案例

### 案例 1：从 Foam template 建一个私人知识库

官方文档推荐先用 foam-template 建仓库，再 clone 到本地：

```bash
git clone https://github.com/yourusername/my-second-brain.git
cd my-second-brain
code .
```

逐部分解释：

- `git clone`：把 GitHub 上的 Foam workspace 拉到本地，笔记从第一天就有版本历史
- `cd my-second-brain`：进入这个知识库文件夹，后续 `.md` 都在这里增长
- `code .`：用 VS Code 打开整个目录，Foam 扩展会识别 workspace 并提供链接补全

这个案例适合刚开始做第二大脑的人：先有一个能跑的模板，再慢慢改目录结构。

### 案例 2：用每日笔记承接临时想法

Foam 文档给了每日笔记命令、快捷键和模板做法。你可以建一个 `.foam/templates/daily-note.md`：

```markdown
---
type: daily-note
---

# Daily Note - $FOAM_DATE_YEAR-$FOAM_DATE_MONTH-$FOAM_DATE_DATE

## Tasks

- [ ]

## Notes
```

逐部分解释：

- `type: daily-note`：让这份模板专门服务每日笔记
- `$FOAM_DATE_YEAR` 这些变量：创建当天笔记时自动替换成日期
- `Tasks` 和 `Notes`：把"今天要做"和"临时捕获"分开，晚上复盘时更容易整理

之后按 `Alt+D` 或运行 `Foam: Open Daily Note`，Foam 会打开当天文件。它像一个固定收件箱，先让想法落地，再决定要不要拆成永久笔记。

### 案例 3：用模板给会议纪要固定骨架

Foam 支持 Markdown 模板和 JavaScript 模板。一个最朴素的会议模板可以放在 `.foam/templates/meeting.md`：

```markdown
# $FOAM_TITLE

日期：${FOAM_DATE_FORMAT:YYYY-MM-DD}

## 结论

- 

## 待办

- [ ] 

## 相关链接

- [[project-home]]
```

逐部分解释：

- `$FOAM_TITLE`：创建新笔记时让 Foam 询问标题，避免文件名和标题脱节
- `${FOAM_DATE_FORMAT:YYYY-MM-DD}`：把日期格式固定，后续搜索和排序更稳定
- `[[project-home]]`：会议纪要一出生就连到项目主页，反向链接会自动聚合历史会议

这个案例适合团队或实习记录：每次会议格式一致，后面翻旧账不会靠记忆硬找。

## 踩过的坑

1. **把 Foam 当成完整笔记 SaaS**：Foam 的底座是本地文件夹和 VS Code，原因是它优先保证可迁移，而不是提供账号、云同步、移动端全家桶。
2. **多个 workspace 分得太碎**：官方文档更推荐单一 workspace，原因是双链和图谱只有在同一知识空间里才容易发现关系。
3. **以为占位链接就是坏链接**：`[[还没写的主题]]` 会显示为 placeholder，原因是 Foam 鼓励先搭知识结构，再慢慢补内容。
4. **依赖图谱替代整理**：图谱能暴露孤岛和中心节点，但不会自动判断内容质量，原因是链接多不等于理解深。

## 适用 vs 不适用场景

**适用**：

- 已经长期使用 VS Code，想把学习笔记和工程上下文放在同一个工具里
- 想用纯 Markdown + Git 管理知识，重视可迁移和版本历史
- 需要 Zettelkasten、第二大脑、研究笔记、长文写作这些连接型知识库
- 团队愿意通过 GitHub repo 共享文档，并接受 Markdown 作为协作格式

**不适用**：

- 主要在手机上捕获和阅读，且不想折腾同步
- 需要 Notion 那种数据库视图、权限、评论和表格工作流
- 期待 Roam 那种以 block 为中心的实时大纲体验
- 不熟 VS Code，也不想维护扩展、设置和 Git 仓库

## 历史小故事（可跳过）

- **2020 年前后**：Roam Research 带火双链笔记，Foam 社区把类似体验搬进 VS Code，选择 Markdown 和 Git 作为长期底座。
- **早期定位**：Foam 明确强调 personal knowledge management and sharing system，不只做编辑器插件，还关心发布、共享和协作。
- **功能演进**：图谱、链接补全、重命名同步、反向链接、标签、每日笔记、模板陆续补齐，逐渐覆盖常见 PKM 工作流。
- **社区规模**：GitHub 页面显示项目约 1.7 万 stars，贡献者超过百人；这说明"普通文件 + 编辑器扩展"路线有稳定受众。
- **长期取舍**：README 仍提醒它是 work in progress，这不是坏事，而是在告诉用户：把内容放在 Markdown 里，工具不完美也不会锁死你。

## 学到什么

1. **好知识库先保护内容所有权**：Foam 最重要的设计不是图谱，而是笔记仍是普通 Markdown。
2. **双链是组织方式，不是魔法**：`[[link]]` 让关系可见，但真正的理解还要靠复盘和重写。
3. **编辑器平台能放大垂直工具**：Foam 借 VS Code 的命令面板、Git、扩展生态，少造很多基础轮子。
4. **迁移成本会影响学习习惯**：越容易带走的工具，越适合长期积累。

## 延伸阅读

- 官方仓库：[foambubble/foam](https://github.com/foambubble/foam)
- 官方文档：[Foam Documentation](https://docs.foam.md/)
- 入门工作区：[Creating Your First Workspace](https://docs.foam.md/getting-started/first-workspace/)
- 功能说明：[Wikilinks](https://docs.foam.md/features/wikilinks/) / [Backlinks](https://docs.foam.md/features/backlinking/)
- 同类工具：[[vscode]]、[[markdown-it]]、[[affine]]、[[marktext]]

## 关联

- [[vscode]] —— Foam 直接借用 VS Code 的扩展、命令面板和 Git 工作流
- [[markdown-it]] —— Foam 存的是 Markdown，最终仍要被 Markdown 渲染器解释
- [[marktext]] —— 同样围绕 Markdown 写作，但 MarkText 更像桌面写作台，Foam 更像知识网络
- [[prosemirror]] —— 富文本编辑器路线的代表，可对比"结构化文档模型 vs 纯文本文件"
- [[codemirror]] —— 浏览器编辑器内核路线，理解编辑器如何承载笔记应用
- [[github-actions]] —— Foam workspace 可用 GitHub 流水线发布或检查链接
- [[affine]] —— 本地优先知识工具的另一条路线，适合比较块编辑和 Markdown 双链

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[joplin]] —— Joplin — 开源 Evernote 替代
- [[logseq]] —— Logseq — 块结构离线知识库
- [[trilium]] —— Trilium — 树形层级笔记系统
