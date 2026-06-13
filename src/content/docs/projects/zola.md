---
title: Zola — 零基础学习笔记
来源: https://github.com/taiki-e/zola
日期: 2026-06-13
分类: 其他
子分类: security-tools
provenance: pipeline-v3
---

# Zola — 零基础学习笔记

## 一、它是什么：从"手工做网站"说起

想象一下，你开了一家小书店。

**动态网站**（比如 WordPress）就像一家"人工书店"：每个客人来时，店员要现场去仓库翻书、找货、包装。人少的时候没问题，人一多就乱了。

**静态网站**就像"印好装订好的书"：在开业前全部印好放在货架上，客人来直接拿。不需要店员，不怕客人多。

**Zola 的作用**：它就是一个"印书工厂"。你把用 Markdown（一种简易的排版语言）写好的文章内容交给 Zola，Zola 快速把它们变成一堆纯 HTML 文件，然后你可以随便丢到任何地方去托管。

Zola 用 Rust 写成，只有一个几 MB 的可执行文件，不需要安装 Node.js、Python 或数据库。官网自称"one-stop static site engine"——一个二进制搞定一切。

---

## 二、核心概念

### 1. 站点根目录与配置文件

每个 Zola 站点的根目录放一个 `zola.toml`（类似 package.json 的站点版），里面写站点名、作者、语言等基本信息。

### 2. 目录结构

Zola 的站点由几个固定文件夹组成：

```
myblog/
├── zola.toml        ← 站点配置文件
├── content/         ← 放你的文章（Markdown 文件）
├── templates/       ← 放 HTML 模板
├── static/          ← 放图片、CSS、JS 等静态资源
├── sass/            ← 放 Sass 样式文件（可选）
└── themes/          ← 放主题（可选）
```

### 3. Section（章节）和 Page（页面）

这是 Zola 里两个最重要的概念：

- **Page**：一篇普通文章，比如 `content/blog/first.md`
- **Section**：一个"内容分组"，用一个 `_index.md` 文件表示，比如 `content/blog/_index.md`。Section 本身也是一个页面，用来列出它下面的所有文章

### 4. 模板引擎（Tera）

Zola 用 Tera 模板引擎，语法和 Django/Jinja2 很像。核心标记就三种：

- `{{ variable }}` — 输出变量值
- `{% if condition %}...{% endif %}` — 条件判断
- `{% for item in list %}...{% endfor %}` — 循环遍历

模板里用 `{% extends %}` 和 `{% block %}` 做模板继承，和 Python 的模板思路完全一样。

### 5. 内置特性

Zola 开箱即用地支持：Sass 编译、代码高亮（基于 Silo）、目录自动生成、站内搜索索引、图片处理、多语言站点。这些在传统 SSG 里通常需要装一堆插件，Zola 全部打包进了一个二进制文件。

---

## 三、动手开始

### 安装（macOS 用户）

一行命令搞定：

```bash
brew install zola
```

### 创建站点

```bash
zola init myblog
```

它会问几个问题：

```
> 站点 URL？（按回车用默认值）
> 要启用 Sass 编译吗？[Y/n]  → 按回车选 Y
> 要启用代码高亮吗？[y/N]    → 按回车选 N（默认即可）
> 要构建搜索索引吗？[y/N]    → 按回车选 N（默认即可）
```

### 启动开发服务器

进入项目目录并运行：

```bash
cd myblog
zola serve
```

你会看到：

```
Building site...
Checking all internal links with anchors.
-> Successfully checked 0 internal link(s) with anchors.
-> Creating 0 pages (0 orphan) and 0 sections
Done in 13ms.

Web server is available at http://127.0.0.1:1111
Listening for changes in .../myblog/{zola.toml,content,sass,static,templates}
```

打开浏览器访问 `http://127.0.0.1:1111`，就能看到你的主页了。修改文件后页面会自动刷新。

---

## 四、代码示例

### 示例 1：写一篇文章 + 创建章节

**文件：`content/blog/_index.md`**

这是一个 Section（章节）文件，告诉 Zola "blog" 是一个分组：

```markdown
+++
title = "我的博客文章"
sort_by = "date"
template = "blog.html"
page_template = "blog-post.html"
+++
```

- `title`：章节标题
- `sort_by = "date"`：文章按日期排序
- `template`：列出文章的页面用什么模板
- `page_template`：单篇文章用什么模板

**文件：`content/blog/first.md`**

这是一篇普通文章：

```markdown
+++
title = "第一篇文章"
date = 2026-01-15
+++

这是我的第一篇 Zola 博客文章。

Zola 非常快，一个二进制文件就能搞定整个网站的生成。
```

### 示例 2：写模板

**文件：`templates/base.html`**

这是所有页面的基础模板：

```html
<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="utf-8">
  <title>{{ config.title }}</title>
</head>
<body>
  <nav>
    <a href="{{ get_url(path='') }}">首页</a>
    <a href="{{ get_url(path='blog/') }}">博客</a>
  </nav>
  <hr>
  {% block content %}{% endblock content %}
</body>
</html>
```

- `{{ config.title }}`：读取 `zola.toml` 里配置的站点标题
- `{{ get_url(path='') }}`：生成一个内部链接 URL
- `{% block content %}`：留给子模板填充内容

**文件：`templates/index.html`**

首页模板，继承 base：

```html
{% extends "base.html" %}

{% block content %}
<h1>欢迎来到我的博客</h1>
<p>这里记录了我的学习笔记和项目实践。</p>
{% endblock content %}
```

**文件：`templates/blog.html`**

博客列表页，循环展示所有文章：

```html
{% extends "base.html" %}

{% block content %}
<h1>{{ section.title }}</h1>
<ul>
  {% for page in section.pages %}
  <li>
    <a href="{{ page.permalink | safe }}">{{ page.title }}</a>
    <span> — {{ page.date }}</span>
  </li>
  {% endfor %}
</ul>
{% endblock content %}
```

- `section.title`：当前章节的标题（来自 `_index.md`）
- `section.pages`：当前章节下的所有文章列表
- `page.permalink`：文章的永久链接地址
- `| safe`：过滤器，告诉 Zola 这个值不需要 HTML 转义

**文件：`templates/blog-post.html`**

单篇文章模板：

```html
{% extends "base.html" %}

{% block content %}
<h1>{{ page.title }}</h1>
<p><strong>发布于：</strong>{{ page.date }}</p>
{{ page.content | safe }}
{% endblock content %}
```

- `page.content`：Markdown 文件正文渲染后的 HTML

---

## 五、常用命令速查

| 命令 | 作用 |
|------|------|
| `zola init 目录名` | 创建新站点 |
| `zola build` | 构建全站，输出到 `public/` |
| `zola serve` | 本地开发服务器，带自动刷新 |
| `zola check` | 检查站点链接是否有效 |
| `zola --version` | 查看版本 |

---

## 六、部署

Zola 生成的就是纯 HTML 文件，部署极其简单：

- **GitHub Pages**：把 `public/` 文件夹推上去就行
- **Netlify / Vercel**：连上 GitHub 仓库，构建命令写 `zola build`，输出目录写 `public`
- **任何 Web 服务器**：Nginx、Apache、S3 Bucket 都能直接托管

没有数据库、没有运行时、没有依赖——这就是静态网站的核心优势。

---

## 七、总结

Zola 适合谁？

- 写博客、文档站、个人作品集
- 讨厌配置一堆 Node.js 依赖的人
- 想要"写了 Markdown 就能出站"的极简体验
- 对网站加载速度敏感的人

核心就一句话：**用 Markdown 写内容，用 HTML 模板定义样子，用一行命令生成全部页面。** 其余交给 Zola。

---

## 延伸学习

- 官方文档：https://www.getzola.org/documentation/
- 主题市场：https://www.getzola.org/themes/
- 论坛讨论：https://zola.discourse.group/
