---
title: D4Vinci/Scrapling — 自适应网页爬虫框架
来源: https://github.com/D4Vinci/Scrapling
日期: 2026-06-13
分类: 后端 API
子分类: Web 后端
provenance: pipeline-v3
---

# D4Vinci/Scrapling — 自适应网页爬虫框架

## 什么是 Scrapling？（从日常类比开始）

想象你要从书店里抄录所有"Python"相关书籍的标题和价格。

最简单的做法：你走进书店，一本一本地看、抄。这叫 **HTTP 请求** —— 你让程序直接告诉服务器"给我网页"，服务器把 HTML 整页返回，你从一堆标签里挑出想要的文字。

但如果书店突然把书架搬到了二楼，原来的标签位置全变了，你的记录就全废了。Scrapling 的厉害之处在于：它有一个"自适应"的能力，即使书架位置变了，它也能自动找到新书的位置。这就像你记得的是"从收银台往右数第三排"而不是"A区5号架子"，不管书架怎么挪，你都能找到。

Scrapling 是一个 Python 网页爬虫框架，核心卖点就三个：

- **自适应爬取**：网站改版后，它还能找到你要的数据
- **反反爬**：内置隐身模式，能绕过 Cloudflare 等防护
- **一站式**：从单次抓取到大规模爬虫，一个库搞定

GitHub 上 6 万多星，是目前最火的 Python 爬虫库之一。

## 安装

```bash
pip install scrapling
pip install "scrapling[fetchers]"       # 如果需要浏览器抓取
pip install "scrapling[all]"            # 安装全部功能
scrapling install                       # 安装浏览器依赖
```

> 注意：`pip install scrapling` 只装解析引擎，如果要抓取网页需要额外安装 fetchers。

## 核心概念

### 1. 三种 Fetcher（抓取器）

Scrapling 提供了三种获取网页的方式，从快到慢：

| Fetcher | 速度 | 用途 |
|---------|------|------|
| `Fetcher` | 最快 | 普通 HTTP 请求，适合静态页面 |
| `DynamicFetcher` | 中等 | 模拟浏览器，适合需要 JavaScript 渲染的页面 |
| `StealthyFetcher` | 较慢 | 隐身模式，绕过反爬系统 |

### 2. 选择器（Selection）

拿到网页后，你需要从中提取数据。Scrapling 支持四种方式：

- **CSS 选择器**：`.quote .text` —— 像写 CSS 一样找元素
- **XPath**：`//span[@class="text"]/text()` —— 更强大的路径表达式
- **文本搜索**：`find_by_text("hello")` —— 按文字内容找
- **BeautifulSoup 风格**：`find_all('div', class_='quote')` —— 熟悉的用法

### 3. 自适应追踪（Adaptive Tracking）

这是 Scrapling 最核心的创新。当你用 CSS 选择器找到某个元素后，Scrapling 会保存它的"特征"。如果网站改版、类名变了，下次你传入 `adaptive=True`，Scrapling 会用相似度算法自动定位到新位置。

类比：你第一次找到了"张三"，记住了他戴红帽子。后来张三换了蓝帽子，你仍然能找到他。

### 4. Spider（爬虫）框架

Scrapling 提供了一个类似 Scrapy 的爬虫框架，支持并发、暂停恢复、流式输出等高级功能。

## 代码示例

### 示例 1：基础抓取 —— 从一句话语录网站提取数据

假设你要从 quotes.toscrape.com 抓取所有名言和作者：

```python
from scrapling.fetchers import Fetcher

# 第一步：获取网页
page = Fetcher.get('https://quotes.toscrape.com/')

# 第二步：用 CSS 选择器提取数据
# ::text 表示提取标签内的文字内容（类似 Scrapy 的语法）
quotes = page.css('.quote .text::text').getall()
authors = page.css('.quote .author::text').getall()

# 第三步：组合数据
for quote, author in zip(quotes, authors):
    print(f'"{quote}" — {author}')
```

这里的关键是 `css()` 方法返回的对象支持链式调用，你可以连续筛选：

```python
# 先找到所有 quote 容器
quotes = page.css('.quote')
# 从第一个 quote 里再找 text
first_quote_text = quotes[0].css('.text::text').get()
```

### 示例 2：隐身模式抓取 —— 绕过 Cloudflare 防护

有些网站有 Cloudflare 保护，普通请求会被拦截。用 `StealthyFetcher`：

```python
from scrapling.fetchers import StealthyFetcher

# 设置 adaptive=True，让 Scrapling 自动学习网页结构
page = StealthyFetcher.fetch(
    'https://quotes.toscrape.com/',
    headless=True,          # 无头浏览器模式（不弹出窗口）
    network_idle=True,      # 等待网络请求空闲后再获取
    solve_cloudflare=True,  # 自动处理 Cloudflare 验证
)

# 提取数据，即使网站改版也能自适应定位
quotes = page.css('.quote', adaptive=True)
for q in quotes:
    print(q.css('.text::text').get(), q.css('.author::text').get())
```

> 核心要点：`adaptive=True` 是精髓。第一次爬取时 Scrapling 会记录元素的特征，以后即使类名 `.quote` 变成 `.item` 之类的，它也能找到。

### 示例 3：编写一个完整爬虫（Spider）

```python
from scrapling.spiders import Spider, Response

class QuotesSpider(Spider):
    name = "quotes"                       # 爬虫名称
    start_urls = ["https://quotes.toscrape.com/"]  # 起始 URL
    concurrent_requests = 10              # 并发数

    async def parse(self, response: Response):
        # 遍历每条名言
        for quote in response.css('.quote'):
            yield {
                "text": quote.css('.text::text').get(),
                "author": quote.css('.author::text').get(),
            }

        # 自动追踪"下一页"按钮
        next_page = response.css('.next a')
        if next_page:
            yield response.follow(next_page[0].attrib['href'])

# 启动爬虫
result = QuotesSpider().start()
print(f"共抓取 {len(result.items)} 条名言")

# 导出为 JSON
result.items.to_json("quotes.json")
```

运行后，所有名言会被自动保存到 `quotes.json` 文件中。如果想暂停，按 `Ctrl+C`，下次从同一目录启动会自动恢复。

## 为什么比 BeautifulSoup 快？

下面是 Scrapling 官方提供的性能对比（提取 5000 个嵌套元素）：

| 库 | 耗时（毫秒） | 相对速度 |
|----|------------|---------|
| Scrapling | 2.02 | 1x |
| BS4 + Lxml | 1584.31 | 784x 慢 |
| BS4 + html5lib | 3391.91 | 1679x 慢 |

Scrapling 底层基于 Lxml，速度极快，而且内存占用更低。

## 关键概念总结

- **Fetcher**：获取网页的工具，有三种模式可选
- **Selector（选择器）**：从 HTML 中提取数据的方式，支持 CSS、XPath、文本搜索等
- **Adaptive（自适应）**：网站改版后自动定位元素，这是 Scrapling 的最大特色
- **Spider**：完整的爬虫框架，支持并发、暂停恢复、流式输出
- **Stealth（隐身）**：内置反反爬能力，能绕过 Cloudflare

## 下一步

如果你想继续深入，可以看看：

- 官方文档：https://scrapling.readthedocs.io/
- 交互式 Shell：运行 `scrapling shell` 直接进入爬取环境
- CLI 命令：`scrapling extract get 'https://example.com' output.md` 一行命令就能抓取
