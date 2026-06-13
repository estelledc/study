---
title: github/docs 零基础入门笔记
来源: https://github.com/github/docs
日期: 2026-06-13
分类: 后端 API
子分类: Web 后端
provenance: pipeline-v3
---

# github/docs 零基础入门笔记

## 一、日常类比：把 docs 想象成一个"大型连锁图书馆"

想象一下，你负责运营一个巨大的连锁图书馆（docs.github.com）。这个图书馆里有几百万本书，内容涵盖所有与 GitHub 产品相关的知识。

但这个图书馆有三大特点，让它和普通图书馆完全不同：

1. **任何人都能当图书管理员** —— 不只是内部员工，世界各地的开发者都可以提交"我要改一本书的内容"的请求
2. **书的内容就是代码仓库本身** —— 每本书其实就是一个 Markdown 文件，存在 Git 仓库里
3. **两本"主书库"保持同步** —— 一个公开的仓库给外部人改，一个私有的仓库给 GitHub 员工改，两边定期自动同步

`github/docs` 就是这个公开主书库的代码仓库。它是 [docs.github.com](https://docs.github.com) 网站的内容来源，用开源的方式让全世界一起维护。

## 二、核心概念

### 2.1 仓库结构（图书馆的建筑布局）

```
github/docs/
├── content/          ← 所有文档的 Markdown 原文（图书馆的书架）
├── data/             ← 可复用的数据片段（比如"标准插图"仓库）
├── src/              ← 网站构建代码（图书馆的装修和运营系统）
├── config/           ← 配置文件
├── assets/           ← 图片、样式等资源
└── package.json      ← 项目依赖清单
```

- **`content/`** 是按产品分目录的，比如 `actions/`、`repositories/`、`get-started/` 等
- 每个产品目录下有一个 `index.md` 作为目录页，列出该类别下所有子页面

### 2.2 Frontmatter（每本书的"版权页"）

每个 Markdown 文件顶部都有一个 YAML 块，叫 **Frontmatter**，相当于每本书的版权页，告诉系统"这本书该怎么摆放"：

```yaml
---
title: 我的文档标题
versions:
  fpt: '*'          # 适用于自由专业版（免费版）
  ghes: '>=2.20'    # 适用于企业服务器版 2.20 及以上
redirect_from:
  - /old-path/      # 旧链接跳转到这个页面
layout: default     # 页面布局类型
---
```

关键字段：

| 字段 | 作用 | 必填 |
|------|------|------|
| `title` | 页面标题 | 否（有默认值） |
| `versions` | 声明适用于哪些产品版本 | **是** |
| `redirect_from` | 旧 URL 跳转到本页 | 否 |
| `layout` | 页面布局模板 | 否 |
| `children` | 目录页的子页面列表 | 目录页必填 |

### 2.3 Versioning（同一本书有多个版本）

GitHub 产品有不同版本，文档也要跟着变：

- **FPT** (Free, Pro, Team)：GitHub 免费版/专业版/团队版
- **GHEC** (GitHub Enterprise Cloud)：企业云版
- **GHES** (GitHub Enterprise Server)：企业本地部署版

文档用 `versions` 字段声明适用性，用 Liquid 模板语法在正文中做条件渲染。

### 2.4 Liquid 模板（文档里的"智能标签"）

Liquid 是一种模板语言，类似 HTML 模板。在文档中可以写条件逻辑：

```liquid
{% ifversion fpt %}
这一段只对免费版显示。
{% endif %}

{% ifversion ghes %}
这一段只对企业本地版显示。
{% endif %}
```

这让同一份文档源码能生成多个产品版本的页面。

### 2.5 Reusables（可复用的文档积木）

如果一段文字在多个页面中出现（比如"创建仓库的步骤"），就提取成一个单独的文件放在 `data/reusables/` 目录下，然后用 `{% data reusables.xxx.yyy %}` 引用。这样改一处，所有引用处自动更新。

## 三、工作流：怎么贡献一个文档修改

整个过程就像在图书馆"提交一本书的修订稿"：

```
1. Fork 仓库 → 复制一本"空白笔记本"到自己名下
2. 创建分支 → 准备一个独立的修改空间
3. 修改内容 → 编辑 Markdown 文件
4. 本地预览 → 在 localhost:4000 查看效果
5. 提交 PR → 把修订稿提交给管理员审核
6. 审核通过 → 管理员合并后，变更立即上线
```

### 三步速上手

```bash
# 第一步：克隆仓库到本地
git clone https://github.com/github/docs
cd docs

# 第二步：安装依赖并构建
npm ci
npm run build

# 第三步：启动本地开发服务器
npm start
# 浏览器打开 http://localhost:4000 即可预览
```

本地修改文件后，页面会自动热重载（nodemon 监听变化）。

## 四、代码示例

### 示例 1：写一篇新文档

在 `content/get-started/` 目录下创建一个新文件 `hello-github.md`：

```yaml
---
title: Hello, GitHub!
shortTitle: Hello GitHub
versions:
  fpt: '*'
  ghes: '*'
contentType: tutorial
layout: bespoke
intro: 欢迎来到 GitHub 世界的第一步。
---

# Hello, GitHub!

欢迎来到 GitHub！这是你的第一篇文档。

## 什么是 GitHub？

GitHub 是一个代码托管平台，你可以：

- 存储和管理代码
- 与他人协作开发
- 追踪问题和功能请求

## 下一步

- [创建你的第一个仓库](/get-started/start-and-explore/create-a-repo)
- [学会使用分支](/get-started/start-and-explore/create-a-branch)
```

这个文件做了四件事：

1. **Frontmatter** 定义了标题、适用版本和内容类型
2. **Markdown 正文** 用标题（`#`）、列表（`-`）组织内容
3. **内部链接** 用 `(/path/...)` 格式，系统会自动加上语言前缀 `/en/`
4. **内容类型** 声明为 `tutorial`（教程），会影响页面显示样式

### 示例 2：用 Liquid 做多版本条件渲染

假设你要写一个关于 GitHub Actions 的教程，但某个功能只在企业版中可用：

```liquid
---
title: 使用 GitHub Actions
versions:
  fpt: '*'
  ghes: '>=3.9'
---

# 使用 GitHub Actions

GitHub Actions 让你可以在仓库中自动化工作流程。

{% ifversion fpt %}
> **提示**：免费版每月有 2,000 分钟的 Actions 运行时间。
{% endif %}

{% ifversion ghes %}
> **企业版提示**：GitHub Enterprise Server 3.9+ 支持自托管 Runner。
{% endif %}

## 创建你的第一个 workflow

在你的仓库中创建一个 `.github/workflows/main.yml` 文件：

```yaml
name: CI
on: [push]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: echo "Hello, world!"
```

{% ifversion ghes %}
**自托管 Runner**：企业版管理员可以部署自己的 Runner 机器，放在内网中执行任务。
{% endif %}
```

这个示例展示了：

- `versions` 声明页面同时适用于 FPT 和 GHES >= 3.9
- `{% ifversion fpt %}` 条件块只在 FPT 版本中渲染
- `{% ifversion ghes %}` 条件块只在企业版中渲染
- 一份 Markdown 源码输出多个产品版本的页面

### 示例 3：使用 Reusables 复用内容

先创建一个可复用片段 `data/reusables/actions/basic-runners.md`：

```markdown
## 可用的 Runner

GitHub 提供以下类型的 Runner：

- **GitHub-hosted**：GitHub 提供的云服务器
- **Self-hosted**：你自己管理的服务器（企业版功能）

选择 Runner 类型会影响工作流的运行速度和安全性。
```

然后在任何文档中引用它：

```markdown
---
title: Actions 入门
versions:
  fpt: '*'
---

# Actions 入门

## Runner 类型

{% data reusables.actions.basic-runners %}

## 下一步

...
```

这样改一处，所有引用处同步更新。

## 五、关键技术选型

理解这些技术有助于你快速上手：

| 技术 | 用途 | 类比 |
|------|------|------|
| **Node.js + Express** | 本地开发服务器 | 图书馆的后台管理系统 |
| **Next.js** | 页面渲染框架 | 前台展示系统 |
| **Liquid** | 模板语言 | 智能标签，控制内容显隐 |
| **Markdown** | 文档编写格式 | 图书的文字部分 |
| **YAML** | Frontmatter 元数据 | 图书的版权页 |
| **TypeScript** | 网站构建代码 | 图书馆的运营规则 |
| **Elasticsearch** | 全文搜索 | 图书馆的检索系统 |
| **Git** | 版本控制和协作 | 图书馆的修订流程 |

## 六、贡献类型

`github/docs` 接受多种贡献：

- **修复错别字**：最简单也最有价值
- **修正技术错误**：命令、步骤、链接等
- **扩展现有内容**：补充遗漏的步骤或说明
- **填写重要空白**：新增有价值的主题

不接受的：

- 纯粹为了"改善语气"的修改
- 太 niche 或个人偏好的主题
- 网站基础设施代码的修改（这些在私有仓库中）

## 七、学习路线建议

作为零基础学习者，建议按以下顺序了解：

1. **先浏览 docs.github.com** —— 体验成品，知道文档长什么样
2. **阅读 CONTRIBUTING.md** —— 了解贡献规范
3. **找一个 typo 提交 PR** —— 最小化实操，体验完整流程
4. **学习 Markdown + Frontmatter** —— 掌握文档编写基础
5. **了解 Liquid 模板** —— 学会做多版本内容
6. **尝试写一篇新文章** —— 从 `get-started` 目录开始

## 八、关键链接

- 仓库地址：https://github.com/github/docs
- 贡献指南：https://docs.github.com/en/contributing
- 本地开发：`npm start` → http://localhost:4000
- 在线文档：https://docs.github.com
- Markdown + Liquid 语法参考：https://docs.github.com/en/contributing/syntax-and-versioning-for-github-docs
- 两个仓库关系：`github/docs`（公开）↔ `github/docs-internal`（私有，员工用）

## 九、总结

`github/docs` 最核心的设计理念只有三个词：

1. **内容即代码** —— Markdown 文件存 Git，享受版本控制和代码审查
2. **开放协作** —— 任何人都可以提交修改，经过审核后上线
3. **一份源码，多个版本** —— Liquid 模板 + versioning 系统让多产品文档维护变得简单

理解这三点，你就理解了整个项目的骨架。其余的语法、工具、流程，都是在这三个原则之上的具体实现。
