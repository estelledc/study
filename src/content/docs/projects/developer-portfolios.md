---
title: developer-portfolios — 24000+ 开发者的"求职作品集目录"
来源: https://github.com/emmabostian/developer-portfolios
日期: 2026-06-13
分类: CLI
子分类: 编辑器与 IDE
难度: 入门
provenance: pipeline-v3
---

## 是什么

**developer-portfolios** 是一个纯文本目录型仓库：里面没有代码项目、没有应用框架，只有一份按字母 A-Z 排列的 Markdown 列表，收录了全球开发者的个人作品集网站链接，目前已经超过 24,000 条。

日常类比：想象一个"开发者作品集的 IMDb"——你想知道某个领域的人怎么做网站、找灵感，直接打开这个目录，按首字母翻就行。它不像一个产品，更像一张"活的地图"，记录着全球开发者愿意公开展示自己的位置。

这个仓库由 Emma Bostian 创建，灵感来自 Twitter 上的一条推文，鼓励大家公开自己的 portfolio 页面。任何人可以通过提交 Pull Request（PR）把自己的作品加进去。

## 仓库结构

仓库本身极其轻量：

```
developer-portfolios/
├── README.md          ← 主体：A-Z 字母索引的链接列表
├── feed.json          ← 自动生成：所有条目的结构化 JSON
├── CONTRIBUTING.md    ← 贡献指南（如何提交 PR）
├── FEED_JSON.md       ← feed.json 的格式说明
├── run_tests.py       ← 链接健康检查脚本
├── src/               ← 处理脚本（字母排序、feed 生成）
├── tests/             ← 测试代码
├── assets/            ← 原始推文截图
└── .github/           ← 自动化工作流（每周链接检查）
```

## 核心概念

### 概念一：目录型仓库（Directory-style Repo）

和大多数代码仓库不同，这个仓库的**核心资产不是代码**，而是一份按字母顺序组织的数据列表。README.md 本身就是数据文件——每一行代表一条记录。

这种模式的价值在于**零门槛参与**：你不需要编译、不需要部署、不需要理解任何框架，只要会写一行 Markdown 链接就能贡献。

```markdown
# 一条记录的格式
- [姓名](作品集链接) [职位/专长]

# 实际例子
- [Brittany Chiang](https://brittanychiang.com)
- [Chris Coyier](https://chriscoyier.net) [Co-Founder Of Codepen]
```

### 概念二：自动化治理（Automated Governance）

24,000+ 条链接手动维护是不可能的，所以仓库建立了几道自动化防线：

1. **字母排序**：`src/alphabetical.py` 脚本自动把新条目排到正确位置
2. **链接健康检查**：每周六自动运行 `run_tests.py`，检测死链并标记
3. **结构化数据同步**：`feed.json` 自动从 README 提取，供第三方使用

看 `run_tests.py` 里的链接检查逻辑：

```python
import urllib.request
import json

# 读取 feed.json，检查每个链接是否存活
with open("feed.json", "r") as f:
    portfolios = json.load(f)

broken_links = []
for entry in portfolios:
    url = entry["url"]
    try:
        request = urllib.request.Request(url, method="HEAD")
        response = urllib.request.urlopen(request, timeout=5)
        if response.status != 200:
            broken_links.append(entry["name"])
    except Exception as e:
        broken_links.append(entry["name"])

if broken_links:
    print(f"Found {len(broken_links)} broken links:")
    for name in broken_links:
        print(f"  - {name}")
else:
    print("All links are healthy! ✅")
```

### 概念三：feed.json——从 Markdown 到结构化数据

README.md 是人类阅读的，`feed.json` 是机器读的。脚本 `src/generate_feed.py` 解析 Markdown 链接，提取出结构化的 JSON：

```python
import re
import json

# 从 README.md 解析所有 portfolio 条目
with open("README.md", "r", encoding="utf-8") as f:
    content = f.read()

# 用正则匹配 Markdown 链接格式
# 匹配模式: - [姓名](链接) [可选标签]
pattern = r"- \[([^\]]+)\]\(([^)]+)\)\s*\[([^\]]*)\]"
matches = re.findall(pattern, content)

portfolios = []
for name, url, tagline in matches:
    entry = {"name": name, "url": url}
    if tagline.strip():
        entry["tagline"] = tagline.strip()
    portfolios.append(entry)

# 写入 feed.json
with open("feed.json", "w", encoding="utf-8") as f:
    json.dump(portfolios, f, indent=2, ensure_ascii=False)

print(f"Generated {len(portfolios)} portfolio entries")
```

生成的 `feed.json` 结构：

```json
[
  {
    "name": "Brittany Chiang",
    "url": "https://brittanychiang.com"
  },
  {
    "name": "Chris Coyier",
    "url": "https://chriscoyier.net",
    "tagline": "Co-Founder Of Codepen"
  }
]
```

有了结构化数据，第三方就可以做很多事情——按职位过滤、做搜索、做统计。仓库还专门提供了一个演示网站：https://6e87v.hatchboxapp.com

## 为什么重要

对零基础学习者来说，这个仓库至少有三层价值：

### 第一层：找灵感

想建个人作品集但不知道从何开始？这个目录里 24,000+ 个真实作品是最好的参考。你可以按字母翻、可以用随机按钮（https://s111ew.github.io/random-button-redirector），能看到不同级别开发者的呈现方式。

### 第二层：学 Git 协作

这个仓库是学习 GitHub PR 流程的**教科书级案例**。它的 CONTRIBUTING.md 写得极其详细：Fork → Clone → 分支 → 修改 → PR，每一步都有命令。24,000+ 条贡献者通过这条路径完成过第一次 PR，社区对新手非常友好。

### 第三层：理解"数据即产品"

一个没有服务器、没有前端、没有 API 的仓库，靠一份 Markdown 和自动化工具，积累了 24,000+ 贡献者和 24,000+ Star。这说明了**好的数据结构和自动化**可以让一个极简仓库产生巨大的影响力。

## 关键数字

| 指标 | 数值 |
|------|------|
| Star 数 | 24,000+ |
| Fork 数 | 4,700+ |
| 收录条目 | 24,000+（持续增长） |
| 提交次数 | 6,100+ |
| 自动化链接检查 | 每周六运行 |

## 延伸学习

想进一步探索，可以从这几个方向入手：

- **学 Markdown 解析**：研究 `src/alphabetical.py` 和 `src/generate_feed.py` 的实现
- **学 GitHub Actions**：看 `.github/workflows/` 目录，了解自动化链接检查怎么配置
- **学数据提取**：用 Python 或 JavaScript 写一个自己的 README 解析器
- **学 PR 流程**：跟着 CONTRIBUTING.md 提交一次你自己的 portfolio

## 小结

developer-portfolios 展示了开源社区最简单也最强大的模式：**一份数据 + 一套规则 + 自动化治理 = 一个持续增长的公共资源**。它不需要复杂的架构，但它教会了你做项目最重要的三件事：降低参与门槛、建立自动化流程、让数据自己说话。
