---
title: Hacker News Frontpage Data Collection Framework
来源: https://news.ycombinator.com/
日期: 2026-06-13
分类: 其他
子分类: 系统工具
provenance: pipeline-v3
---

# Hacker News Frontpage Data Collection Framework

## 日常类比：菜市场挑菜

想象你每天早上去同一个菜市场，想买当天的"新鲜菜"——也就是每个市场里最受欢迎的几样。你不需要把整个市场都搬回家，只需要记下来：什么菜、谁买的、有多少人来过这个摊位、摊位旁贴了什么价签（评论数）。

Hacker News (HN) 的前端页面就是一个"技术菜市场"。每天有几百篇帖子被贴出来，用户用"上箭头"投票来表明哪些帖子值钱。HN Frontpage Data Collection Framework 做的事情，就是自动每天到这个"菜市场"里，把前 30 条帖子的关键信息拿回来，存成一个结构化的数据表，方便后续分析。

## 核心概念一：页面就是数据仓库

HN 的前端页面（`https://news.ycombinator.com/`）本质上是一个巨大的、每 5 分钟更新一次的"数据表格"。每条帖子就是一个"行"，每一行里有标题、链接、提交者、得分、评论数。

传统的数据采集方式（爬虫）就像拿一台小相机对着整个页面拍照，然后自己数格子。但 HN 的页面结构简单得像一本菜单——每个帖子在 HTML 里都有一个固定的模式，所以我们可以直接用代码"读"出这些数据，不需要拍照。

### 关键 HTML 结构

HN 前端页面的核心 HTML 结构如下：

```html
<!-- 每条帖子的 HTML 结构 -->
<tr class="athing">
  <td class="title">
    <span class="rank">1.</span>
    <a href="https://github.com/tensorzero/tensorzero" class="titlelink">
      AI OSS tool repo goes archived over night after raising $7.3M Seed
    </a>
  </td>
  <td class="subtext">
    <span class="score" id="score_48516504">57 points</span>
    by <a href="user?id=hek2sch" class="hnuser">hek2sch</a>
    <span class="age" title="2026-06-13T10:30:00Z">1 hour ago</span>
    <a href="item?id=48516504" class="hnuser">25 comments</a>
  </td>
</tr>
```

每条帖子都在一个 `<tr class="athing">` 标签里，标题在 `<a class="titlelink">` 里，得分在 `<span class="score">` 里。这种一致性让解析变得非常简单。

## 核心概念二：结构化提取

有了对 HTML 结构的理解，我们就可以写代码把这些信息变成 JSON 格式的数据。JSON 就像一张电子表格，每个字段都有明确的类型。

### 示例代码一：基础页面抓取

```python
import urllib.request
import re
import json

def fetch_frontpage():
    """
    抓取 HN 前端页面，返回原始 HTML。
    就像一个走进菜市场的观察者，先拍下一整页的内容。
    """
    url = "https://news.ycombinator.com/"
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (learning-pipeline-v3)"
    })
    response = urllib.request.urlopen(req)
    return response.read().decode("utf-8")
```

这个函数只做一件事：把网页的全部 HTML 文本拿回来。`User-Agent` 头是给服务器的一个自我介绍——告诉对方"我不是恶意爬虫，我只是一个学习用的程序"。

### 示例代码二：结构化数据提取

```python
def parse_frontpage(html):
    """
    从 HTML 中提取每条帖子的关键信息，返回一个字典列表。
    就像是把菜市场的照片变成了一张电子表格。
    """
    items = []
    # 找到所有帖子 tr 标签
    rows = re.findall(r'<tr class="athing">.*?</tr>', html, re.DOTALL)
    for row in rows:
        # 提取标题和链接
        title_match = re.search(r'<a href="([^"]+)"[^>]*>([^<]+)</a>', row)
        # 提取得分
        score_match = re.search(r'(\d+)\s*points', row)
        # 提取提交者
        by_match = re.search(r'by\s*<a[^>]*>([^<]+)</a>', row)
        # 提取评论数
        comments_match = re.search(r'(\d+)\s*comments?', row)

        if title_match:
            item = {
                "title": title_match.group(2).strip(),
                "url": title_match.group(1),
                "score": int(score_match.group(1)) if score_match else 0,
                "author": by_match.group(1) if by_match else "unknown",
                "comments": int(comments_match.group(1)) if comments_match else 0,
            }
            items.append(item)

    return items
```

`re.findall` 和 `re.search` 是正则表达式的工具，它们的作用像是在一堆乱麻中找特定的线头。`<tr class="athing">.*?</tr>` 匹配每一行帖子，`(\d+)\s*points` 从 "57 points" 中提取数字 "57"。

### 运行结果示例

```python
data = parse_frontpage(fetch_frontpage())
for item in data[:5]:
    print(json.dumps(item, indent=2, ensure_ascii=False))
```

输出：

```json
{
  "title": "AI OSS tool repo goes archived over night after raising $7.3M Seed",
  "url": "https://github.com/tensorzero/tensorzero",
  "score": 57,
  "author": "hek2sch",
  "comments": 25
}
```

## 进阶：利用 HN 官方 API

HN 提供了一个正式的 API（在 `https://github.com/HackerNews/API` 中有文档），可以直接按 ID 获取帖子详情。API 端点是 `https://hacker-news.firebaseio.com/v0/item/{id}.json`。

```python
import json
import requests

def get_item_details(item_id):
    """
    通过 HN 官方 API 获取单条帖子的完整信息。
    这比解析整个页面更高效——只拿你需要的那一个数据块。
    """
    url = f"https://hacker-news.firebaseio.com/v0/item/{item_id}.json"
    response = requests.get(url)
    return response.json()

# 获取一条帖子的完整详情
details = get_item_details(48516504)
print(f"Title: {details['title']}")
print(f"Points: {details['score']}")
print(f"Comments: {details['descendants']}")
```

## 核心概念三：流水线架构

一个完整的 HN 数据采集系统通常包含三个阶段：

1. **抓取阶段（Fetch）**：获取页面 HTML 或调用 API
2. **解析阶段（Parse）**：把 HTML 变成结构化数据
3. **存储阶段（Store）**：把数据保存到数据库或文件

这三个阶段可以独立运行、独立测试、独立扩展。这就是"流水线"的意思——水流过三段水管，每一段只做一个处理。

### 示例代码三：完整流水线

```python
import json
from datetime import datetime
from pathlib import Path

class HNFrontpagePipeline:
    """
    HN 前端数据采集流水线。
    三个阶段串联在一起，像一个自动化生产线。
    """

    def __init__(self, output_dir="data"):
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(exist_ok=True)

    def fetch(self):
        """阶段1：抓取页面"""
        url = "https://news.ycombinator.com/"
        req = urllib.request.Request(url, headers={
            "User-Agent": "Mozilla/5.0 (learning-pipeline-v3)"
        })
        response = urllib.request.urlopen(req)
        return response.read().decode("utf-8")

    def parse(self, html):
        """阶段2：解析页面"""
        items = []
        rows = re.findall(r'<tr class="athing">.*?</tr>', html, re.DOTALL)
        for row in rows:
            title_match = re.search(r'<a href="([^"]+)"[^>]*>([^<]+)</a>', row)
            score_match = re.search(r'(\d+)\s*points', row)
            by_match = re.search(r'by\s*<a[^>]*>([^<]+)</a>', row)
            comments_match = re.search(r'(\d+)\s*comments?', row)

            if title_match:
                # 从 ID 链接中提取帖子 ID（如 item?id=48516504 → 48516504）
                item_id = re.search(r'item\?id=(\d+)', row)
                items.append({
                    "id": int(item_id.group(1)) if item_id else None,
                    "title": title_match.group(2).strip(),
                    "url": title_match.group(1),
                    "score": int(score_match.group(1)) if score_match else 0,
                    "author": by_match.group(1) if by_match else "unknown",
                    "comments": int(comments_match.group(1)) if comments_match else 0,
                    "fetched_at": datetime.now().isoformat(),
                })
        return items

    def store(self, items):
        """阶段3：保存到文件"""
        today = datetime.now().strftime("%Y-%m-%d")
        filepath = self.output_dir / f"hn_frontpage_{today}.json"
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump({
                "date": today,
                "count": len(items),
                "items": items,
            }, f, indent=2, ensure_ascii=False)
        return filepath

    def run(self):
        """运行完整流水线"""
        print("[阶段1] 正在抓取页面...")
        html = self.fetch()

        print("[阶段2] 正在解析数据...")
        items = self.parse(html)

        print(f"[阶段3] 找到 {len(items)} 条帖子，正在保存...")
        filepath = self.store(items)

        print(f"完成！数据保存到: {filepath}")
        return items

# 运行
pipeline = HNFrontpagePipeline("data")
pipeline.run()
```

## 实际运行结果

运行上述代码，你会得到一个 JSON 文件，内容大致如下：

```json
{
  "date": "2026-06-13",
  "count": 30,
  "items": [
    {
      "id": 48516504,
      "title": "AI OSS tool repo goes archived over night after raising $7.3M Seed",
      "url": "https://github.com/tensorzero/tensorzero",
      "score": 57,
      "author": "hek2sch",
      "comments": 25,
      "fetched_at": "2026-06-13T12:00:00.000000"
    },
    {
      "id": 48515336,
      "title": "A low-carbon computing platform from your retired phones",
      "url": "https://research.google/blog/a-low-carbon-computing-platform-from-your-retired-phones/",
      "score": 102,
      "author": "vikas-sharma",
      "comments": 44,
      "fetched_at": "2026-06-13T12:00:00.000000"
    },
    ...
  ]
}
```

## 核心要点总结

1. **Hacker News 前端页面结构高度一致**：每条帖子都在 `<tr class="athing">` 中，标题在 `<a class="titlelink">` 中，这使得正则表达式解析非常可靠。

2. **页面解析 vs API 调用的权衡**：
   - 页面解析可以一次拿到前 30 条的概览，速度快但信息有限
   - API 可以获取单条帖子的完整详情（含全部评论 ID），但需要逐条调用

3. **流水线的核心价值**：抓取、解析、存储三个阶段彼此解耦。如果 HN 页面改版了，只需要改解析阶段，不需要改抓取和存储。

4. **数据来源**：本笔记分析的数据来源于 `https://news.ycombinator.com/` 实时前端页面，抓取时间为 2026 年 6 月 13 日。

## 延伸阅读方向

- HN 官方 API 文档：`https://github.com/HackerNews/API`
- 正则表达式进阶：尝试用 HTML 解析库（如 BeautifulSoup）替代正则
- 定时任务：使用 cron 每天自动运行这个流水线，积累历史数据
- 数据分析：对收集到的标题和分数做趋势分析或关键词统计
