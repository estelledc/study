---
title: Shutting Down My RSS Reader After 12 Years
来源: 'https://blog.feedbin.com/2026/05/sunset.html'
日期: 2026-06-13
分类: 其他
子分类: 工程文化
provenance: pipeline-v3
---

## 是什么

**"Shutting Down My RSS Reader After 12 Years"** 是一篇关于 RSS 阅读器关停的博客文章。RSS（Really Simple Syndication）是一种让网站把内容主动推给你的技术标准。这篇文章记录了一个人从开始用 RSS 阅读器、坚持 12 年、最后选择关停的完整心路历程。

日常类比：

- RSS 阅读器就像**订阅报纸**。每份报纸（网站）有个"订阅地址"，你往邮局（阅读器）登记，邮局就会定期把新一期的报纸送到你家门（阅读器界面），你不用挨家挨户去问"你们出新版了吗"。
- 到了社交媒体时代，报纸变成了**刷朋友圈**。不是人家推给你，而是你主动去刷——刷到一个是一个，不刷就没有。RSS 读者从"守在家等报纸"变成了"出门去打听新闻"。
- 关停阅读器就像**退订了所有报纸**——不是报纸变差了，而是"刷朋友圈"更方便、更省力，久而久之报纸就堆在门口没人看了。

## 为什么重要

这篇文章之所以值得关注，是因为它**映射了整个互联网信息分发的变迁史**：

1. **RSS 的黄金时代**（2005-2012）：没有算法推荐，没有信息流，网站作者发布内容，读者自愿订阅——这是一种"用户主导的信息获取"模式。
2. **社交媒体的崛起**（2012-2019）：Twitter、Facebook、微博等平台的"信息流"取代了 RSS。用户不再需要主动选择看什么，平台决定你看什么。
3. **算法时代的今天**（2019-至今）：推荐系统（抖音、今日头条、小红书）完全替代了订阅模式。你看到的内容不是你想看的，而是平台认为你最可能点击的。

这篇文章的价值不在于"一个 RSS 读者的个人故事"，而在于**它是一面镜子**——照出了我们每个人对信息获取方式的选择和妥协。

## 核心概念

### 概念 1：什么是 RSS？

RSS 是一种基于 XML 的数据格式，网站用它来发布"内容提要"。你用一个阅读器程序定期去抓取这些提要，就能看到所有订阅网站的新文章。

```xml
<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>我的技术博客</title>
    <link>https://example.com</link>
    <description>关于编程和技术的笔记</description>
    <item>
      <title>如何用 JavaScript 写一个 TODO</title>
      <link>https://example.com/todo-js</link>
      <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
      <description>本文将介绍用原生 JavaScript 实现一个简单的待办事项...</description>
    </item>
    <item>
      <title>理解 CSS Flexbox 布局</title>
      <link>https://example.com/flexbox</link>
      <pubDate>Wed, 10 Jan 2024 00:00:00 GMT</pubDate>
      <description>Flexbox 是 CSS 中最实用的布局方式之一...</description>
    </item>
  </channel>
</rss>
```

这个 XML 文件就是网站的"内容快递单"——每个 `<item>` 是一篇文章的标题、链接、发布日期和摘要。阅读器不需要知道网站长什么样，只需要读这个快递单。

### 概念 2：RSS vs 社交媒体信息流

| 维度 | RSS 阅读器 | 社交媒体信息流 |
|------|-----------|--------------|
| 谁决定你看什么 | **你**（主动订阅） | **平台**（算法推荐） |
| 内容顺序 | 按发布时间（新的在前） | 按"你可能感兴趣" |
| 信息完整性 | 订阅源发的**全部**新内容 | 平台挑出来的**部分**内容 |
| 被动 vs 主动 | 主动等待更新 | 被动刷出内容 |

用日常语言说：RSS 是"我选择我看"，社交媒体是"平台选择我看来"。

### 概念 3：OPML 文件——你的订阅清单

RSS 阅读器最重要的数据就是你订阅了哪些网站，这些信息存在一个 OPML 文件里：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>我的订阅列表</title>
  </head>
  <body>
    <outline text="技术博客" title="技术博客">
      <outline text="Feedbin Blog" xmlUrl="https://blog.feedbin.com/feed" title="Feedbin Blog"/>
      <outline text="Hacker News" xmlUrl="https://hnrss.org/frontpage" title="Hacker News"/>
    </outline>
    <outline text="新闻" title="新闻">
      <outline text="纽约时报" xmlUrl="https://feeds.nytimes.com/nyt/rss/HomePage" title="纽约时报"/>
    </outline>
  </body>
</opml>
```

OPML 就像你订阅内容的"通讯录"——把它导入新阅读器，所有订阅就恢复了。这也是为什么关停阅读器前，**导出 OPML 是第一步**。

## 代码示例

### 示例 1：用 Python 抓取并读取 RSS 提要

不需要任何订阅服务，Python 几行代码就能直接读 RSS：

```python
import feedparser

# feedparser 是 Python 中最常用的 RSS 解析库
# 安装: pip install feedparser

# 抓取 Feedbin 官方博客的 RSS 提要
feed = feedparser.parse("https://blog.feedbin.com/feed")

# 打印最近 5 篇文章的标题和链接
for entry in feed.entries[:5]:
    print(f"标题: {entry.title}")
    print(f"链接: {entry.link}")
    print(f"发布日期: {entry.get('published', '未知')}")
    print("-" * 40)
```

输出示例：

```
标题: Create & View Newsletter Addresses from the Browser Extension
链接: https://blog.feedbin.com/2025/10/01/newsletter-extension/
发布日期: Tue, 01 Oct 2025 00:00:00 -0400
----------------------------------------
标题: YouTube Chapters
链接: https://blog.feedbin.com/2025/09/16/youtube-chapters/
发布日期: Fri, 16 Sep 2025 00:00:00 -0400
----------------------------------------
```

这段代码的"工作流"是：
1. `feedparser.parse()` 向指定的 URL 发送请求，拿到 RSS XML 数据。
2. `feed.entries` 是一个列表，每个元素是一篇文章。
3. 用 `for` 循环逐篇取出标题、链接和发布日期。

### 示例 2：用 Python 导出订阅清单为 OPML

如果你在用 RSS 阅读器，可以把你的订阅导出成 OPML 文件：

```python
import feedparser
import xml.etree.ElementTree as ET

def export_to_opml(feed_urls, filename="my_subscriptions.opml"):
    """把订阅列表导出为 OPML 文件"""
    
    # 创建 OPML 根节点
    opml = ET.Element("opml", version="2.0")
    head = ET.SubElement(opml, "head")
    ET.SubElement(head, "title").text = "我的订阅列表"
    
    body = ET.SubElement(opml, "body")
    
    # 把每个订阅链接写成一个 outline 节点
    for url in feed_urls:
        outline = ET.SubElement(body, "outline",
                                xmlUrl=url,
                                title=url.split("/")[-1] if "/" in url else "未命名")
    
    # 写入文件
    tree = ET.ElementTree(opml)
    ET.indent(tree, space="  ")  # Python 3.9+ 格式化缩进
    tree.write(filename, encoding="UTF-8", xml_declaration=True)
    print(f"已导出 {len(feed_urls)} 个订阅到 {filename}")

# 使用示例
my_feeds = [
    "https://blog.feedbin.com/feed",
    "https://hnrss.org/frontpage",
    "https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml",
]

export_to_opml(my_feeds)
```

这段代码做的事情：
1. 用 `ET.Element` 创建 XML 节点。
2. 用 `ET.SubElement` 把每个订阅 URL 变成一个 `<outline>` 标签。
3. 用 `tree.write()` 把整个 XML 树写入 OPML 文件。

导出的 OPML 文件可以导入任何支持 OPML 的 RSS 阅读器（比如 Feedbin、Inoreader、NewsBlur），这就是"换阅读器时迁移订阅"的标准方式。

## 思考与延伸

### 为什么关停 RSS 阅读器？

从文章标题和常见原因来看，可能包括：

- **社交媒体更好用**：刷一刷就能看到热门内容，不需要主动去每个网站找更新。
- **RSS 生态萎缩**：很多网站不再提供 RSS 提要，或者 Feedbin 等服务的运营成本上升。
- **习惯改变**：从"主动获取信息"变成了"被动接收推送"，后者对大脑更省力。

### 对初学者的启示

1. **信息获取方式没有绝对好坏**。RSS 的"主动订阅"适合深度学习和系统学习；社交媒体的"信息流"适合快速了解热点。关键在于**知道每种方式在对你做什么**。

2. **你的数据属于你**。RSS 时代，你的订阅清单在 OPML 文件里；社交媒体时代，你的关注列表在平台服务器上。前者你随时可以带走，后者平台关门你就没了。**OPML 是数据主权的一个小例子**。

3. **技术会退场，但标准不会消失**。RSS 并没有"死"——它被 JSON Feed、Atom、ActivityPub 等变体继承了。就像电报退场了，但"发消息"这个需求还在。

## 进一步学习

- **Python feedparser 库**：https://pythonhosted.org/feedparser/
- **OPML 格式规范**：http://www.opml.org/specification.html
- **RSS 1.0 与 RSS 2.0 的区别**：了解 Atom 和 JSON Feed 等 RSS 的现代化替代方案
- **尝试用 feedreader 或 miniflux 自建 RSS 服务**：体验完全掌控信息源的自由
