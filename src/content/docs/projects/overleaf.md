---
title: Overleaf — 在线 LaTeX 协作
来源: 'https://github.com/overleaf/overleaf'
日期: 2026-07-08
分类: editors
难度: 初级
---

## 是什么

Overleaf 是一个**在浏览器里写 LaTeX、多人同时改、右边立刻看 PDF**的协作编辑器。

日常类比：它像 Google Docs 之于 Word，只不过文档不是用鼠标排版，而是用 LaTeX 命令描述结构，机器负责排成论文级 PDF。

最小例子是一个 `main.tex` 文件：

```tex
\documentclass{article}
\begin{document}
Hello Overleaf.
\end{document}
```

左边写源码，右边点 Recompile 生成 PDF；同学、导师或合作者改同一份项目时，变化会通过服务器同步回来。

它和 [[texstudio]] 这类本地 LaTeX 编辑器的差别，不是“能不能写 LaTeX”，而是“项目、编译环境、协作和分享链接”都被放进同一个 Web 应用。

开源仓库提供 Community Edition，可用 Docker 自托管；官方云服务和 Server Pro 则补上更多协作、权限、历史和企业能力。

## 为什么重要

不理解 Overleaf，下面这些事很难解释：

- 为什么很多论文小组不再传 `paper_v7_final_final.tex`，而是一起改同一个在线项目。
- 为什么 LaTeX 新手不用先装 TeX Live、字体、编辑器、PDF 预览器，也能写出第一份 PDF。
- 为什么自托管 Community Edition 必须强调“只给可信用户用”，因为默认编译没有项目级沙箱。
- 为什么 Git、评论、历史版本和模板，对学术写作来说不是锦上添花，而是减少沟通损耗的基础设施。

## 核心要点

1. **浏览器编辑器 + PDF 编译链**：类比餐厅前台和后厨。前台是代码编辑器与预览界面，后厨是 LaTeX 编译服务；用户只提交 `.tex`、图片和 `.bib`，系统负责跑编译并吐出 PDF。

2. **实时协作靠操作同步**：类比多人同时改一张白板。Overleaf 文档说它用 OT 思路处理并发编辑，再用 WebSocket 把更新推给其他客户端；重点不是“谁最后保存”，而是让所有人最终看见同一版文本。

3. **自托管是一组容器服务**：类比把线上办公室搬到自己机房。Toolkit 用 `docker compose` 拉起主应用、MongoDB、Redis 等服务，配置放在 `config/`，数据挂到持久目录，适合需要本地部署的团队。

这三点拼起来，就是 Overleaf 的核心设计：把“写 LaTeX”从单机工具，变成一套多人在线文档系统。

## 实践案例

### 案例 1：从空白项目写第一篇短文

官方入门文档建议先建 Blank Project，然后编辑 `main.tex` 并重新编译。一个稍微完整的例子：

```tex
\documentclass[12pt]{article}
\title{My First Overleaf Note}
\author{Ada}
\begin{document}
\maketitle
This is a tiny paper draft.
\end{document}
```

逐部分解释：

- `\documentclass[12pt]{article}` 选择文章模板和字号。
- `\title`、`\author` 只是先存标题信息，真正显示要靠 `\maketitle`。
- `\begin{document}` 到 `\end{document}` 之间才是正文，Recompile 后会变成 PDF。

这个案例适合零基础：先感受“写源码 → 编译 → 看 PDF”的闭环，再慢慢加图片、引用和公式。

### 案例 2：用 Toolkit 跑一套本地 Overleaf

Overleaf README 把安装指向 Toolkit；Toolkit Quick Start 给出的常见启动路径可以概括成：

```sh
git clone https://github.com/overleaf/toolkit.git ./overleaf-toolkit
cd ./overleaf-toolkit
bin/init
bin/up
bin/doctor
```

逐部分解释：

- `git clone` 拉下管理脚本，不是拉一篇论文项目。
- `bin/init` 生成 `config/overleaf.rc`、`variables.env`、`version`，相当于第一次开店先写营业规则。
- `bin/up` 包装 `docker compose up`，拉起 Web、数据库和缓存等容器。
- `bin/doctor` 打印主机、依赖和配置状态，遇到问题先看它，比盲猜日志快。

这个案例适合实验室或课程服务器：大家访问同一台内网服务，但管理员要负责升级、备份和权限边界。

### 案例 3：把 Overleaf 项目当 Git 远端

Overleaf 的 Git integration 允许从项目里拿到 Git URL，再在本地编辑器里同步。官方示例的形状是：

```sh
git clone https://git.overleaf.com/1234567 paper
cd paper
git pull
git add main.tex refs.bib
git commit -m "revise introduction"
git push
```

逐部分解释：

- `https://git.overleaf.com/1234567` 对应某个 Overleaf 项目，不是普通 GitHub 仓库。
- `git pull` 把网页里别人改过的内容拉到本地，避免覆盖旧版本。
- `git push` 把本地修改推回 Overleaf，网页编辑器里的项目会更新。
- 这项能力在 Overleaf Cloud 属于付费能力，在 Server Pro 也需要相应版本和配置。

这个案例适合熟悉本地编辑器的人：平时用 Vim、VS Code 或脚本生成图表，最后仍把项目同步回 Overleaf 协作。

## 踩过的坑

1. **把 Community Edition 当隔离沙箱**：默认没有 Sandbox Compiles，不可信用户编译 LaTeX 时可能碰到容器资源。

2. **改配置后只 `bin/start`**：Toolkit 文档提醒，改 `overleaf.rc` 或 `variables.env` 后要用 `bin/up` 重建容器才会生效。

3. **忽略 MongoDB 和 Redis**：Overleaf 不是单个 Node 服务，缺数据库或缓存时，Web 页面可能起来了但项目状态会异常。

4. **以为 GitHub sync 能随便接已有仓库**：官方文档说明它是受限的同步流程，不等于任意两个现有仓库直接双向合并。

## 适用 vs 不适用场景

**适用**：

- 论文、课程报告、毕业设计、科研项目，需要 LaTeX 排版和多人协作。
- 新手学习 LaTeX，希望先绕开本地环境安装，把注意力放在文档结构上。
- 实验室或学校想提供统一在线 LaTeX 服务，且用户范围相对可信。
- 需要模板、评论、历史版本、Git 工作流一起服务写作流程。

**不适用**：

- 写自由排版海报、杂志视觉稿，LaTeX 的结构化排版反而会束手束脚。
- 需要严格隔离陌生用户的多租户平台，却只打算用 Community Edition。
- 只是本地单人写几页笔记，[[texstudio]] 或本机 LaTeX 可能更轻。
- 团队主要写 Word 文档或富文本协作，[[collabora-online]] 这类所见即所得工具更贴近习惯。

## 历史小故事（可跳过）

- **2011-2014**：Overleaf 的前身 WriteLaTeX 围绕“浏览器里写论文”成长，后来以 Overleaf 品牌服务科研写作。
- **2014 起**：开源仓库以 AGPL 发布 Community Edition，让团队可以自托管一套在线 LaTeX。
- **2017**：ShareLaTeX 加入 Overleaf，两边团队合并，目标是把两套协作 LaTeX 产品收束成一个平台。
- **2018 之后**：Overleaf v2 成为主线，云服务、Server Pro、自托管社区版形成不同部署层次。
- **2026 年看到的状态**：GitHub 主仓库约 17.9k stars，项目仍以 Web 协作 LaTeX 编辑器为核心定位。

## 学到什么

1. **好工具不是只替你省安装时间**：Overleaf 真正省的是协作、编译环境和版本沟通成本。
2. **LaTeX 的门槛可以被产品设计搬走一半**：先给可用闭环，再让用户逐步理解命令和包。
3. **开源自托管不等于自动安全**：是否有沙箱、谁能注册、数据怎么备份，都要单独设计。
4. **编辑器项目常常是系统项目**：看起来是一个输入框，背后其实有同步算法、容器、数据库、编译队列和权限模型。

## 延伸阅读

- 官方仓库：[overleaf/overleaf](https://github.com/overleaf/overleaf)（README 先看 Community Edition 和安全提示）
- Toolkit 文档：[Quick Start Guide](https://github.com/overleaf/toolkit/blob/master/doc/quick-start-guide.md)（自托管从这里开始）
- 官方教程：[Learn LaTeX in 30 minutes](https://www.overleaf.com/learn/latex/Learn_LaTeX_in_30_minutes)（边写边看 PDF）
- Git 文档：[Git integration](https://docs.overleaf.com/integrations-and-add-ons/git-integration-and-github-synchronization/git-integration)（理解本地编辑器如何接入）
- [[texstudio]] —— 本地 LaTeX 编辑器，对照 Overleaf 的在线协作路线
- [[collabora-online]] —— 浏览器里的办公文档协作，对照 LaTeX 与 WYSIWYG 的差别

## 关联

- [[codemirror]] —— 浏览器代码编辑器让 `.tex` 文件能在网页里舒服地写。
- [[yjs]] —— 现代协作编辑常见 CRDT 路线，可对照 Overleaf 文档提到的 OT 思路。
- [[sharedb]] —— 另一套基于 OT 的实时同步系统，适合理解多人编辑服务器。
- [[docker-compose]] —— Toolkit 用它组织 Overleaf、MongoDB、Redis 等容器。
- [[mongodb]] —— Overleaf 自托管依赖的主要数据库之一。
- [[redis]] —— Overleaf 自托管里的缓存和辅助服务组件。
- [[vscode]] —— Git integration 让习惯本地编辑器的人仍可参与 Overleaf 项目。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[hedgedoc]] —— HedgeDoc — 协作 Markdown 编辑
