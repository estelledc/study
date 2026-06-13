---
title: Overleaf — 在线 LaTeX 协作
来源: https://github.com/overleaf/overleaf
日期: 2026-06-13
子分类: 编辑器与 IDE
分类: CLI
provenance: pipeline-v3
---

## 日常类比：多人共用的「排版云厨房」

想象你和导师、同学要合写一本精装论文，但每人电脑上的 Word 版本、字体、公式插件都不一样，来回发邮件改第 17 版 PDF 会疯掉。

**Overleaf** 就像一间 **开在浏览器里的共享排版厨房**：

- **LaTeX 源码**（`.tex`）是统一菜谱——所有人改的是同一份「脚本」，不是各自改 PDF。
- **云端编译** 是中央烤箱——你点 **Recompile**，服务器上的 TeX Live 帮你生成 PDF，左边写、右边即时预览，不用在本机装几个 GB 的 TeX 发行版。
- **实时协作** 像 Google Docs，但底层是 **Operational Transformation（OT）+ WebSocket**：多人同时改同一段，服务器每隔几秒合并编辑，大家最终看到同一版本。
- **Share / Track Changes / Comments** 则是审稿流程：邀请合作者、追踪谁改了什么、在段落旁留言，而不是在 PDF 上截图圈红。

它和「本地 TeXstudio + 邮件传 zip」完全不同：**零安装、任意设备登录、协作与版本在同一项目里完成**。开源社区版 [overleaf/overleaf](https://github.com/overleaf/overleaf) 也可自托管；官方云服务见 [overleaf.com](https://www.overleaf.com)。文档：[Overleaf docs](https://docs.overleaf.com/)。

零基础路径：**注册 → 新建 Blank/Example 项目 → 改 `main.tex` → Recompile 看 PDF → 邀请一位合作者试协同编辑**。

---

## 这个项目解决什么问题

### 痛点 1：本地 LaTeX 环境难装、难统一

TeX Live 体积大，Windows/macOS/Linux 路径与宏包版本各不同。Overleaf 在服务端提供 **完整 TeX Live**，项目内可选编译器（pdfLaTeX、XeLaTeX、LuaLaTeX 等）与 **TeX Live 版本**，组员无需各自折腾环境。

### 痛点 2：协作靠「发 zip + 注释 PDF」

传统流程：A 改完打包 → B 合并冲突 → 再编译看效果。Overleaf 支持 **多人同时编辑**、**项目内评论**、付费档 **Track Changes（修订追踪）** 与 **History（版本历史）**，把「写—改—审」收进一个 URL。

### 痛点 3：新手被 LaTeX 语法吓退

**Visual Editor** 提供类 Word 的富文本界面，插入章节、公式、表格不必先背 `\section`；随时可切回 **Code Editor** 看底层 LaTeX，适合「先产出 PDF，再学语法」。

### 痛点 4：离线、CI、与 Git 工作流脱节

Premium 功能支持 **Git clone/push/pull**（把 Overleaf 项目当 remote）和 **GitHub 双向同步**，方便本地用 VS Code/Vim 改完推回，或与 GitHub Actions 衔接。自托管 Server Pro 4.0+ 也可启用 Git-bridge。

---

## 核心概念拆解

### 1. 三层结构：账户 → 项目 → 文件树

| 层级 | 含义 | 典型内容 |
|------|------|----------|
| **Account** | 你的 Overleaf 账号与套餐 | 免费版协作人数、编译超时、History 保留时长 |
| **Project** | 一篇论文/报告/幻灯片的容器 | 多个 `.tex`、图片、`.bib`、样式文件 |
| **File tree** | 项目内左侧文件树 | `main.tex`（主文档）、`chapters/`、`figures/`、`refs.bib` |

一个 Project 对应 **一次完整编译上下文**；多文件时需在菜单中指定 **Main document**（主 `.tex`），否则 `\input` 子文件时编译入口会错。

### 2. 双编辑器：Code Editor vs Visual Editor

- **Code Editor**：传统 LaTeX 源码编辑，语法高亮、自动补全、符号面板（Premium）。
- **Visual Editor**：WYSIWYG 式编辑，背后仍生成 LaTeX；适合入门，也适合快速改格式。

两者 **同一套源文件**；切换不会复制两份内容。熟练后建议在 Visual 里搭骨架，在 Code 里精调宏包与自定义命令。

### 3. 云端编译（Recompile）

- 点击 **Recompile** 或 **Ctrl/Cmd + Enter** 触发编译。
- **Auto Compile**（Recompile 下拉菜单）可在输入时自动刷新 PDF，类似「保存即预览」。
- 编译在 Overleaf 服务器执行；免费版有 **Compile timeout** 上限，复杂 TikZ/大 Bib 项目可能需拆分或升级套餐。
- **Logs and output files** 面板可看 `.log`、缺失宏包提示；与本地 `pdflatex` 报错逻辑一致。

常用编译器选择（Project → Settings 或 Recompile 旁菜单）：

| 编译器 | 典型场景 |
|--------|----------|
| **pdfLaTeX** | 英文 article、多数模板默认 |
| **XeLaTeX / LuaLaTeX** | 中文（`ctex`、`fontspec`）、系统字体 |
| **LaTeX** | 少数 legacy 模板 |

### 4. 实时协作的技术与权限

Overleaf 用 **OT** 合并并发编辑，用 **WebSocket** 推送他人改动。协作权限在 **Share** 菜单配置：

| 角色 | 能力 |
|------|------|
| **Editor** | 改源码、编译 |
| **Reviewer** | 可配合 Track Changes 审阅 |
| **Viewer** | 只读（免费版可无限 Viewer） |

免费账户通常 **仅 1 名 Editor 协作者**；Student/Standard/Pro 等 Premium 可提高人数并解锁 Track Changes、完整 History 等（以 [Premium features](https://docs.overleaf.com/getting-started/free-and-premium-plans/premium-features) 为准）。**项目级 Premium**：若项目 Owner 是付费用户，受邀免费用户在该项目内也可使用 Track Changes、完整 History 等。

### 5. Track Changes、Comments、History

- **Comments**：选中文字添加评论与回复，适合异步审稿。
- **Track Changes**（Premium）：切换到 Reviewing 模式，显示插入/删除，可逐条或批量 Accept/Reject。
- **History**：查看按时间戳保存的版本；可 **Label** 里程碑、对比两版 diff、**Restore** 整项目或单文件。免费版通常仅 **24 小时** 内历史 + 已打 Label 的版本；完整 History 需 Premium。

复制项目时：**Tracked changes 会在副本中被自动接受**；副本 **不继承** 原项目 History。

### 6. 模板、参考文献与集成

- **New Project → Templates** 提供 ACM、IEEE、论文、Beamer 等起点。
- **`.bib` + `\cite`**：可上传 bib 文件；Premium 可链 **Zotero / Mendeley / Papers** 并 **Advanced reference search** 边写边搜 cite key。
- **Git / GitHub**（Premium）：Integrations 菜单获取 `git clone` URL；认证用 Account Settings 里的 **Git authentication token**（用户名填 `git`，密码填 token）。GitHub Sync 仅支持 **github.com**，且通常需「从 GitHub 建新 Overleaf 项目」或「从 Overleaf 建新 GitHub 仓库」，**不能**把两个已有仓库直接 link。

### 7. 自托管：Overleaf Community Edition

GitHub 仓库 [overleaf/overleaf](https://github.com/overleaf/overleaf) 提供 **Community Edition**（Docker Compose 部署），适合学校/实验室内网。与 Overleaf Cloud 功能集不完全相同；Server Pro 才有 Git-bridge 等企业特性。学习协作流程时，**先用官方免费云账号** 最快。

---

## 注册与第一个项目

### 第一步：创建账户

访问 [overleaf.com/register](https://www.overleaf.com/register)，用邮箱或机构 SSO 注册。机构订阅 **Overleaf Commons** 的用户用学校邮箱登录可自动获得 Premium 能力。

### 第二步：新建项目

Dashboard → **New Project**：

- **Blank Project**：空 `main.tex` 骨架。
- **Example Project**：带 figure 与 bibliography 的样例，适合对照学习。
- **Templates**：从会议/期刊模板起步。

### 第三步：第一次编译

打开项目后默认 **Code Editor**，编辑 `main.tex`，点击 **Recompile**。右侧 PDF 面板出现即表示云端 TeX 环境可用。可开启 **Auto Compile** 体验实时预览。

---

## 代码示例 1：Example 项目风格的英文短文

在 Blank 项目中把 `main.tex` 替换为以下内容（或对照 Example 项目修改）：

```latex
\documentclass[11pt,a4paper]{article}
\usepackage[utf8]{inputenc}
\usepackage{amsmath,amsfonts,amssymb}
\usepackage{graphicx}
\usepackage{hyperref}

\title{My First Overleaf Project}
\author{Alice \and Bob}
\date{\today}

\begin{document}
\maketitle

\begin{abstract}
We write \LaTeX{} in the browser and let Overleaf compile the PDF.
\end{abstract}

\section{Introduction}
Collaborators can edit this file at the same time.
Share the project URL from the \textbf{Share} menu.

\section{An equation}
Overleaf's preview updates after you click \textbf{Recompile}:
\begin{equation}
  E = mc^2.
  \label{eq:einstein}
\end{equation}
Equation~\eqref{eq:einstein} is famous.

\end{document}
```

**练习**：开启 Auto Compile，改 `\author` 中名字，观察 PDF 标题页是否自动更新；用 **Share** 邀请一位朋友为 Editor，两人同时改 `\section{Introduction}` 一段，体验无冲突合并。

---

## 代码示例 2：中文论文（XeLaTeX + ctex）

中文项目需换编译器。菜单 **Menu → Settings → Compiler** 选 **XeLaTeX**（或 LuaLaTeX），然后使用：

```latex
\documentclass[UTF8,a4paper,12pt]{ctexart}

\title{Overleaf 中文协作示例}
\author{张三 \and 李四}
\date{\today}

\begin{document}
\maketitle

\begin{abstract}
在 Overleaf 中写中文无需本地安装 \CTeX{} 套装，只需选对编译器与文档类。
\end{abstract}

\section{协作要点}
\begin{itemize}
  \item 用 \texttt{Share} 邀请导师为 Editor 或 Reviewer
  \item 重要节点在 \texttt{History} 里打 Label
  \item 图片上传到项目根目录或 \texttt{figures/}，用 \verb|\includegraphics| 引用
\end{itemize}

\section{公式与引用}
贝叶斯公式：
\begin{equation}
  P(A \mid B) = \frac{P(B \mid A)\,P(A)}{P(B)}.
  \label{eq:bayes}
\end{equation}
见式~(\ref{eq:bayes})。参考文献可在同项目上传 \texttt{refs.bib} 并使用 \verb|\cite{}|。

\end{document}
```

若编译报字体或宏包错误，在 **Logs** 里查看；Overleaf 云环境通常已含 `ctex`。本地与云端差异时，可在 Settings 里 **固定 TeX Live 年份** 以保持可复现。

---

## 代码示例 3：多文件项目结构

学位论文常用 `\input` 拆分章节。在 Overleaf 文件树中 **New Folder** `chapters`，新建 `main.tex` 与片段：

主文件 `main.tex`：

```latex
\documentclass[12pt, a4paper]{report}
\usepackage{graphicx}
\usepackage{amsmath}

\title{Thesis on Overleaf}
\author{Candidate}

\begin{document}
\maketitle
\tableofcontents

\input{chapters/intro}
\input{chapters/related}

\bibliographystyle{plain}
\bibliography{refs}

\end{document}
```

`chapters/intro.tex`（注意：**不要**写 `\documentclass`）：

```latex
\chapter{Introduction}
\label{ch:intro}

This chapter lives in \texttt{chapters/intro.tex}.
Cross-reference Chapter~\ref{ch:intro} from anywhere in the project.
```

在 **Menu → Main document** 中确认选中 `main.tex`，再 Recompile。上传 `refs.bib` 并在导言区前准备好 `\bibliography{refs}` 即可启用文献。

---

## 典型工作流（从零到定稿）

```text
1. New Project (Template 或 Blank)
2. 设定 Compiler（中文 → XeLaTeX）
3. 上传 figures/、refs.bib，Organize 文件树
4. 写作：Code 或 Visual Editor；开启 Auto Compile
5. Share → 邀请合作者（Editor / Reviewer / Viewer）
6. Reviewing：Comments + Track Changes（Premium）
7. History：Label「送审版」「终稿」；必要时 Restore
8. 导出：Menu → Download PDF 或 Download as source (.zip)
9. （可选）Git push 到本地仓库或 GitHub Sync
```

### 常用操作速查

| 操作 | 入口 |
|------|------|
| 重新编译 | Recompile / Ctrl+Enter |
| 自动编译 | Recompile ▼ → Auto Compile |
| 切换 Visual/Code | 编辑器顶部切换按钮 |
| 分享 | 顶部 Share |
| 版本历史 | History 图标（预览栏上方） |
| 修订模式 | 右上角模式 → Reviewing |
| Git 地址 | Menu → Integrations → Git |
| 主文档 | Menu → Main document |

---

## 与其他工具怎么选

| 工具 | 定位 | 与 Overleaf 关系 |
|------|------|------------------|
| **TeXstudio / TeXworks** | 本地 IDE + 本机 TeX | 离线、隐私、编译无超时；协作需 Git |
| **VS Code + LaTeX Workshop** | 通用编辑器 + 本地/远程 TeX | 极客友好；Overleaf 可通过 Git 同步 |
| **LyX** | 可视化 LaTeX | 非浏览器；Overleaf Visual Editor 更轻 |
| **Google Docs** | 富文本协作 | 不适合论文级公式、Bib、交叉引用 |
| **Overleaf CE 自托管** | 私有云 | 数据留在校内；运维成本更高 |

简单决策：**要多人实时改 LaTeX、不想装 TeX → Overleaf**；**要完全离线或自定义宏包沙箱 → 本地 TeXstudio**；**两者可经 Git 并用**。

---

## 常见问题与排查

### 编译超时（Compile timeout）

项目过大（大量 TikZ、minted  shell escape 等）会触达套餐时限。对策：拆文件、用 `\includegraphics` 替代实时 TikZ、升级 Premium  compile time，或迁到自托管 Server Pro。

### 找不到 `\cite` 或参考文献为空

确认：已 Recompile **多次**（BibTeX 需多轮）、`refs.bib` 在项目中、主文件有 `\bibliography{refs}`、cite key 拼写正确。Logs 里搜 `undefined citations`。

### 中文乱码

Compiler 必须是 **XeLaTeX 或 LuaLaTeX**，文档类用 `ctexart`/`ctexrep` 或 `xeCJK`；勿用纯 pdfLaTeX 写 UTF-8 中文。

### Git push 认证失败

使用 Account Settings 生成的 **Git authentication token**，用户名 **`git`**，勿再用旧版密码登录。Collaborator 需被 Share 进项目后 **各自** 生成 token。

### 免费版 History 不够用

对关键版本手动 **Add label**；定稿前 **Download as source (.zip)** 留档；或请 Premium Owner 创建项目。

---

## 进阶方向（学完基础之后）

1. **Track Changes 审稿流**：Owner 设 Reviewer 权限，改稿 Accept/Reject 后 Label「Revision 1 submitted」。
2. **Zotero/Mendeley 联动**：Premium 导入 `.bib` 并保持 cite key 与桌面文献库一致。
3. **GitHub Sync**：从模板 Repo 创建 Overleaf 项目，改完 Push to GitHub 触发 CI 检查。
4. **Beamer / TikZ / 学校 `.cls`**：上传校模板到项目根，Main document 指向 `thesis.tex`。
5. **自托管 CE**：读 [overleaf/overleaf](https://github.com/overleaf/overleaf) 的 Docker 文档，服务实验室统一协作。
6. **Overleaf AI**（官方新特性）：在限额内辅助解释报错、改写段落；敏感稿件注意数据政策。

---

## 小结

| 概念 | 一句话 |
|------|--------|
| **Overleaf** | 浏览器里的 LaTeX IDE + 云端编译 + 实时协作 |
| **Project / File tree** | 一篇文档的所有 tex、图、bib |
| **Recompile / Auto Compile** | 服务器生成 PDF 与刷新预览 |
| **Code / Visual Editor** | 源码写作 vs 富文本入门 |
| **Share / OT** | 多人同时编辑同一项目 |
| **Track Changes / History** | 审阅修订与版本回滚（Premium 增强） |
| **Git / GitHub** | 与本地或 GitHub 同步（Premium） |
| **Community Edition** | 开源可自托管的 Overleaf 内核 |

Overleaf 把 LaTeX 最难的「环境 + 协作 + 出 PDF」三步收到一个链接里。零基础可先 **Example 项目 + Visual Editor** 跑通第一篇 PDF，再切 Code Editor 学 `\section`、`\cite`、`\ref`，最后按需上 Share、History 与 Git——与本地 TeXstudio 形成互补，而不是二选一。

---

## 参考链接

- 项目仓库：<https://github.com/overleaf/overleaf>
- 官网：<https://www.overleaf.com/>
- 官方文档：<https://docs.overleaf.com/>
- 入门：<https://docs.overleaf.com/getting-started/your-first-project>
- 协作：<https://docs.overleaf.com/collaborating/collaborating-in-overleaf>
- Git 集成：<https://docs.overleaf.com/integrations-and-add-ons/git-integration-and-github-synchronization/git-integration>
- Premium 功能：<https://docs.overleaf.com/getting-started/free-and-premium-plans/premium-features>
