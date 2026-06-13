---
title: Marginalia Search Engine — 零基础学习笔记
来源: https://search.marginalia.nu/
日期: 2026-06-13
分类_原始: 搜索引擎
分类: 后端 API
子分类: Web 后端
provenance: pipeline-v3
---

# Marginalia Search Engine — 零基础学习笔记

## 一、什么是 Marginalia Search？

想象一下：互联网是一座巨大的城市。Google 和 Bing 就像是城中心的几座超级商场——商品齐全、灯光明亮，但它们只把最热门、最赚钱的店铺放在显眼位置。那些藏在小巷子里的手工咖啡馆、独立书店、个人博客，几乎没人能找得到。

Marginalia Search 就是专门为这些"小巷里的店铺"而建的搜索引擎。它由瑞典开发者 Viktor Lofgren 独立开发运营，是一个开源的、非商业的替代搜索引擎。它的核心使命就一句话：**让那些被主流搜索引擎忽略的小网站、老网站、非商业网站重新被人看到。**

关键数据：
- 语言：Java（后端）+ HTML（前端）
- 许可证：AGPL 3.0
- Star：1.8k+（GitHub）
- 月运营成本：约 200 美元
- 资助来源：捐款、欧盟 NGI 基金

## 二、核心概念

### 2.1 传统检索 vs 自然语言搜索

搜索引擎发展有两个方向：

| 方向 | 例子 | 特点 |
|------|------|------|
| 传统信息检索（IR） | Marginalia、早期 Google | 返回原始网页链接，用户自己判断 |
| 自然语言搜索（NLP） | ChatGPT、Perplexity | 直接给你一段总结好的答案 |

Marginalia 选择坚守**传统信息检索**。为什么？因为它认为：越追求"像人一样回答问题"，搜索结果就越不"人"——算法替用户做了太多选择，反而让小众内容更难被发现。

类比：传统检索就像给你一张地图，你自己找路；自然语言搜索就像有个导游直接带你去某个店，但你永远不知道旁边还有多少好店。

### 2.2 搜索多样性的重要性

目前全球绝大多数"替代搜索引擎"实际上背后用的都是 Google 或 Bing 的 API。这意味着：

- 真正的搜索多样性几乎不存在
- 美国的文化偏见主导了全球搜索结果
- 信息审查可以轻易通过控制一两个上游实现

Marginalia 的目标不是取代 Google，而是成为一份"少数派报告"——保持它们诚实。

### 2.3 爬虫与索引架构

Marginalia 的系统由以下几个 Docker 容器组成：

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│  Query Service │──▶│ Index Nodes  │────▶│  MariaDB DB  │
│  (端口 8080)   │     │ (Node 1,2,...) │     │              │
└─────────────┘     └──────────────┘     └─────────────┘
        ▲                       ▲
        │                       │
┌─────────────┐     ┌──────────────┐
│ Control      │     │ Crawler      │
│ Service      │     │ (数据采集)    │
│ (端口 8081)   │     └──────────────┘
└─────────────┘
```

- **Index Node（索引节点）**：每个域名被分配到一个固定节点（node affinity），保证同一域的数据存在同一个地方
- **Query Service（查询服务）**：无状态服务，解析用户查询并向索引节点发起请求
- **Control Service（控制面板）**：管理界面，负责启动爬虫、添加域名等操作
- **Crawler（爬虫）**：自主爬取网页，构建索引数据

## 三、爬虫如何工作？

爬虫的工作流程分三步：

1. **播种（Bootstrapping）**：手动输入一批初始域名，告诉系统"先去这些地方看看"
2. **爬取（Crawling）**：从已知页面出发，沿着超链接不断发现新页面，最多每个站点爬 5 小时
3. **处理与加载（Processing & Loading）**：将抓到的网页提取文本、建立倒排索引，存入索引节点

版本采用日历版本号，例如 `24.10.0` 表示 2024 年 10 月抓取的数据。每 2-3 个月数据就会变旧，因为很多链接会失效。

## 四、使用示例

### 示例 1：通过 API 搜索（JSON 格式）

Marginalia 提供 REST API，可以用 curl 直接调用：

```bash
curl -H 'Accept: application/json' \
  'http://localhost:8080/search?q=marginalia&count=5'
```

参数说明：
- `q`：搜索关键词（必填）
- `count`：返回结果数量
- `set`：使用的排名集（ranking set）

返回的 JSON 结果大致结构如下：

```json
{
  "results": [
    {
      "title": "Marginalia Search",
      "url": "https://search.marginalia.nu/",
      "snippet": "Search the small, old and weird web..."
    }
  ],
  "total": 1234
}
```

### 示例 2：配置反向代理（nginx）

如果你要用 nginx 做反向代理，需要添加 `X-Public: 1` 头来防止内部 API 暴露：

```nginx
server {
    listen 80;
    server_name search.example.com;

    location / {
        proxy_pass http://localhost:8080;
        proxy_set_header X-Public 1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

注意：`X-Public: 1` 这个头很关键。没有它，请求只能访问 `/public` 前缀的接口；有了它，才能正常访问搜索接口。这是 Marginalia 的安全设计——防止误配置导致后台管理接口暴露在公网上。

### 示例 3：添加新域名到索引

通过控制面板的 Web 界面添加域名：

```
导航路径: Domains → Add Domains

表单字段:
  - Domain List: 输入要爬取的域名列表（一行一个）
    例如:
    example.com
    blog.personal-site.org
    wiki.small-project.net

  - Node Affinity: 留空则自动分配到下一个可用节点
```

也可以通过 API 方式添加（伪代码示意）：

```
POST /control/domains/add
Content-Type: application/x-www-form-urlencoded

domain_list=example.com&blog.personal-site.org&node_affinity=
```

## 五、Marginalia 的设计哲学

### 5.1 "你不去建，它就不存在"

Marginalia 的核心信念是：不要等别人来修复互联网的问题，自己动手建就好。不需要风投、不需要旧金山地址、不需要任何人批准。互联网上的一切都是有人建出来的——如果你想要什么存在，就去建它。

### 5.2 低成本运营

Marginalia 的月运营成本约 200 美元，这意味着即使资金完全断流，它也能维持基本运营。这种经济模型让它真正独立——没有贷款、没有投资人、没有任何附加条件。

### 5.3 隐私优先

- 不收集任何个人信息
- 不使用 Cookie（除了必要的功能型 Cookie）
- IP 日志最多保留 24 小时
- 不向第三方分享任何数据

## 六、技术栈一览

| 组件 | 技术 |
|------|------|
| 后端语言 | Java（50%）+ HTML（49%） |
| 构建工具 | Gradle |
| 部署方式 | Docker Compose |
| 数据库 | MariaDB（存储域名信息等辅助数据） |
| 反向代理 | Traefik（可替换为 nginx） |
| 许可证 | AGPL 3.0 |
| 文档站点 | Hugo |

## 七、总结

Marginalia Search 是一个有理想主义的搜索引擎项目。它不做 AI、不做广告、不追踪用户，只做一件事：**帮人们找到那些被主流搜索引擎遗忘的网站。**

对于学习者来说，理解 Marginalia 的关键在于理解它与传统搜索引擎的根本区别：

1. **目的不同**：不是最大化点击量，而是最大化发现多样性
2. **架构不同**：自建爬虫 + 自建索引，不依赖任何商业 API
3. **经济模式不同**：低成本运营 + 捐赠/资助，而非广告驱动

这或许不能取代 Google，但它证明了：在互联网上，小而美的替代方案不仅存在，而且值得被看见。

## 八、延伸阅读

- 项目源码：<https://git.marginalia.nu/>
- 项目文档：<https://docs.marginalia.nu/>
- 项目 Discord：<https://chat.marginalia.nu/>
- 开发者博客：<https://www.marginalia.nu/tags/search-engine/>
- 隐私声明：<https://about.marginalia-search.com/article/privacy/>
