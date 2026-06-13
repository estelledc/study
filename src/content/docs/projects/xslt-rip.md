---
title: XSLT RIP — Google 要杀死一个 Web 标准
来源: https://xslt.rip/
日期: 2026-06-13
分类: 其他
子分类: 工程文化
难度: 入门
provenance: pipeline-v3
---

## 是什么

XSLT RIP 是一个**纪念页面**——用 XSLT 语言自己写成的。

日常类比：

- 假设你发明了一种语言，写了一辈子文档，结果 Google 说"这个不用了"——你就建了一个墓园页面，点一根蜡烛，说"安息吧"
- **XSLT RIP 就是 XSLT 的墓碑**，而且墓碑本身是用 XSLT 写的，算是程序员式的黑色幽默

它不是某个产品，不是某个框架。它是一个**信号**：有人在提醒整个社区，一个 Web 标准正在被杀死。

## 为什么重要

不理解 XSLT RIP，你就没法理解下面这几件事：

- **Google 为什么被称为"科技坟场"**——killedbygoogle.com 列了将近 300 个被 Google 砍掉的技术，XSLT 是最新一批
- **一个 Web 标准被杀意味着什么**——XSLT 是 W3C 标准，写入了 HTML 规范，政府网站在用，结果 Google 一句话就能让它消失
- **XSLT 本身的讽刺性**——XSLT RIP 这个页面本身就是用 XSLT 渲染的 XML，"用这个语言写一个悼念这个语言的页面"，递归到极点

一句话：**学 XSLT RIP，就是学"Web 标准是怎么死的"这门课。**

## 核心概念

### 1. XSLT 是什么

XSLT（Extensible Stylesheet Language Transformations）是一个**把 XML 变成其他格式的语言**。

类比：

- XML 是你家衣柜里叠好的衣服
- XSLT 是"叠衣服说明书"——告诉你怎么把衣服从折叠状态展开挂起来
- 输出可以是 HTML、纯文本、甚至另一个 XML 格式

它最大的应用场景就是 **RSS 订阅**。RSS 文件本质上是 XML，浏览器用 XSLT 把它渲染成你能看的网页。你点一下 RSS 图标就能看到文章列表——背后就是 XSLT 在干活。

### 2. Google 在做什么

2025 年 10 月 24 日，Google 在 Chromium 的开发者邮件列表里发布了一份 **"Intent to Deprecate and Remove: Deprecate and remove XSLT"**，正式宣布要在 2027 年前把 XSLT 从 Chrome 中移除。

这不是突然的决定。早在 **2013 年 7 月**，Google 就第一次尝试杀死 XSLT。十二年后再来一次，这次成功了。

Firefox（Mozilla）和 Safari（Apple）也表态会跟进。这意味着三个主流浏览器将**集体删除**一个 Web 标准。

### 3. XSLT RIP 这个页面本身

这个页面的设计非常巧妙——它不是一个普通的 HTML 文件，而是一个 **XML 文件**，通过 `<?xml-stylesheet?>` 声明让浏览器用 XSLT 模板来渲染它。

```xml
<!-- 这是 index.xml（你直接看到的是渲染后的 HTML）-->
<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet href="/index.xsl" type="text/xsl"?>
<html>
  <head>
    <title>XSLT.RIP</title>
  </head>
  <body>
    <h1>If you're reading this, XSLT was killed by Google.</h1>
    <p>Thoughts and prayers.</p>
    <p>Rest in peace.</p>
  </body>
</html>
```

然后浏览器会去找 `index.xsl`，这个文件才是真正"说人话"的部分：

```xml
<!-- index.xsl —— XSLT 模板文件 -->
<?xml version="1.0" encoding="utf-8"?>
<xsl:stylesheet version="3.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
  <xsl:output method="html" version="1.0" encoding="utf-8" indent="yes"/>
  <xsl:template match="/">
    <html xmlns="http://www.w3.org/1999/xhtml">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="stylesheet" href="main.css" />
        <title>XSLT.RIP - Google are killing XSLT!</title>
      </head>
      <body>
        <h1>
          <img alt="candle" src="/images/candle.gif" />
          XSLT.RIP
          <img alt="candle" src="/images/candle.gif" />
        </h1>
        <h2>
          <img alt="grim reaper" src="/images/reaper.gif" />
          Google are <em>killing XSLT!</em>
          <img alt="warning sign" src="/images/danger.gif" />
        </h2>
        <p class="intro">
          <strong>October 24th 2025:</strong>
          Google published the death note.
          Google will kill XSLT by 2027.
        </p>
      </body>
    </html>
  </xsl:template>
</xsl:stylesheet>
```

关键点：

- `<xsl:stylesheet>` 声明了这是一个 XSLT 样式表
- `<xsl:template match="/">` 匹配 XML 的根节点，也就是整篇文档
- `<xsl:output method="html">` 告诉浏览器"输出格式是 HTML"，不是 XML

**最讽刺的是**：要渲染 XSLT RIP 这个悼念页面，你**必须**使用支持 XSLT 的浏览器。等 Chrome 删了 XSLT，这个页面就真的没人能正常渲染了。它用自己的消亡来纪念自己的消亡。

### 4. Google 的"技术坟场"

[xslt.rip](https://xslt.rip/) 上引用了一个数据：截至 2025 年底，Google 已经杀死了近 **300 项技术**。包括但不限于：

- Google Reader（2013 年 3 月关闭）
- Google Plus
- Google Stadia（游戏云）
- Google Fiber（很多城市）
- Google Hangouts
- Google+

XSLT 的特别之处在于，它**不是 Google 自己的产品**，而是一个**开放标准**，写入了 WHATWG HTML 规范，被政府网站和立法机构使用。杀死它，意味着 Google 对 Web 平台的影响力和控制力。

## 代码示例

### 示例 1：一个简单的 RSS 渲染器

RSS 文件的 XML 结构（`feed.xml`）：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet href="style.xsl" type="text/xsl"?>
<feed>
  <title>Jason 的笔记</title>
  <entry>
    <title>XSLT RIP 学习笔记</title>
    <date>2026-06-13</date>
    <summary>Google 要在 2027 年前杀死 XSLT 标准。</summary>
  </entry>
  <entry>
    <title>Web 标准是怎么死的</title>
    <date>2026-06-10</date>
    <summary>从 RSS 到 XSLT，一篇关于技术生命周期的小文。</summary>
  </entry>
</feed>
```

对应的 XSLT 模板（`style.xsl`），把它渲染成 HTML 列表：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
  <xsl:output method="html" indent="yes"/>

  <!-- 匹配 feed 根节点 -->
  <xsl:template match="feed">
    <html>
      <head><title><xsl:value-of select="title"/></title></head>
      <body>
        <h1><xsl:value-of select="title"/></h1>
        <ul>
          <xsl:for-each select="entry">
            <li>
              <strong><xsl:value-of select="title"/></strong>
              <span> — <xsl:value-of select="date"/></span>
              <p><xsl:value-of select="summary"/></p>
            </li>
          </xsl:for-each>
        </ul>
      </body>
    </html>
  </xsl:template>
</xsl:stylesheet>
```

渲染后的 HTML 输出：

```html
<html>
  <head><title>Jason 的笔记</title></head>
  <body>
    <h1>Jason 的笔记</h1>
    <ul>
      <li>
        <strong>XSLT RIP 学习笔记</strong>
        <span> — 2026-06-13</span>
        <p>Google 要在 2027 年前杀死 XSLT 标准。</p>
      </li>
      <li>
        <strong>Web 标准是怎么死的</strong>
        <span> — 2026-06-10</span>
        <p>从 RSS 到 XSLT，一篇关于技术生命周期的小文。</p>
      </li>
    </ul>
  </body>
</html>
```

### 示例 2：XML 到 CSV 的转换

XSLT 不只是转 HTML，还能转任何文本格式。比如把一个 XML 日志转成 CSV：

输入 `logs.xml`：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet href="to-csv.xsl" type="text/xsl"?>
<records>
  <log>
    <level>ERROR</level>
    <message>Database connection failed</message>
    <timestamp>2026-06-13 10:30:00</timestamp>
  </log>
  <log>
    <level>WARN</level>
    <message>High memory usage detected</message>
    <timestamp>2026-06-13 10:35:00</timestamp>
  </log>
  <log>
    <level>INFO</level>
    <message>Server restarted</message>
    <timestamp>2026-06-13 10:40:00</timestamp>
  </log>
</records>
```

转换模板 `to-csv.xsl`：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
  <xsl:output method="text" encoding="utf-8"/>

  <!-- 先写 CSV 表头 -->
  <xsl:text>level,message,timestamp&#10;</xsl:text>

  <xsl:template match="records">
    <xsl:for-each select="log">
      <xsl:value-of select="level"/>
      <xsl:text>,</xsl:text>
      <xsl:value-of select="message"/>
      <xsl:text>,</xsl:text>
      <xsl:value-of select="timestamp"/>
      <xsl:text>&#10;</xsl:text>
    </xsl:for-each>
  </xsl:template>
</xsl:stylesheet>
```

输出 CSV：

```
level,message,timestamp
ERROR,Database connection failed,2026-06-13 10:30:00
WARN,High memory usage detected,2026-06-13 10:35:00
INFO,Server restarted,2026-06-13 10:40:00
```

## 一句话总结

XSLT RIP 是一个用 XSLT 写的、悼念 XSLT 死亡的页面——它本身就是一个递归的艺术品，也是"Web 标准有多脆弱"的最好教材。

## 延伸阅读

- [XSLT RIP 原站](https://xslt.rip/)
- [Killed by Google 完整列表](https://killedbygoogle.com)
- [Google 的 XSLT 废弃通知邮件列表存档](https://groups.google.com/a/chromium.org/g/blink-dev/c/CxL4gYZeSJA/m/yNs4EsD5AQAJ)
- [XSLT 维基百科](https://en.wikipedia.org/wiki/XSLT)
