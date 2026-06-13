---
title: Plausible Analytics OSS 学习笔记
来源: https://plausible.io/
日期: 2026-06-13
分类: 后端 API
子分类: Web 后端
provenance: pipeline-v3
---

# Plausible Analytics OSS 学习笔记

## 一、什么是 Plausible？日常类比

想象你要开一家小店，想知道每天有多少顾客进门、他们从哪条路来、在哪件商品前停下来看了很久。

传统做法是在门口装一个摄像头，记录每个人的脸、手机号、走了哪些路线——这就像 **Google Analytics (GA)**，功能强大但收集大量个人信息，还需要贴一张"我们正在监控您"的告示（Cookie 同意弹窗）。

Plausible 的做法是在门口放一个计数器：它只记"今天来了多少人"、"大多数人从哪个方向来"，但不记你是谁、不存你的个人信息、不需要你同意——这就像一家注重隐私的小店，既知道生意好不好，又尊重每一位顾客。

Plausible 是一个 **开源、隐私优先的 Web 网站分析工具**，2018 年诞生于爱沙尼亚，完全由用户订阅资金驱动（不接受投资、不做广告），GitHub 上有 27,000+ Star。

## 二、核心概念

### 2.1 隐私优先，零 Cookie

Plausible 不收集个人身份信息（PII），不存储 IP 地址，不使用 Cookie 或持久化标识符。它的独特之处在于：

- **不追踪个人**：只统计聚合数据（总访客数、页面浏览量）
- **不存储 IP**：IP 用于计算唯一访客数后立即丢弃原始值
- **合规无需同意横幅**：符合 GDPR、CCPA、PECR
- **数据留在欧盟**：所有数据存储在欧盟境内的服务器上

### 2.2 轻量级脚本

Plausible 的追踪脚本只有 **几 KB**（比 Google Analytics 小 54 倍），加载后不会影响网页速度或 Core Web Vitals。对于一个有 10 万月访问量的网站，每年可节省约 4 公斤 CO2 排放。

### 2.3 两种部署方式

| 方式 | 说明 |
|------|------|
| **Plausible Cloud（托管版）** | 注册即用，2 分钟搞定，自动处理 CDN、备份、安全 |
| **Community Edition（自建版）** | 开源免费（AGPL-3.0），自己部署在自己的服务器上 |

### 2.4 技术栈

- **后端**：Elixir + Phoenix（处理高并发流量）
- **数据库**：PostgreSQL（通用数据）+ ClickHouse（分析数据）
- **前端**：React + TailwindCSS

## 三、如何接入 Plausible

### 3.1 方式一：插入追踪脚本（最常见）

在你的网站每个页面的 `<head>` 标签中加入一段 JS 代码：

```html
<!-- 把 plausible.example.com 换成你在 Plausible 后台看到的域名 -->
<script
  defer
  data-domain="yourdomain.com"
  src="https://plausible.example.com/js/script.js"
></script>
```

就这么一行代码，不需要配置 Cookie 横幅，不需要用户同意。

### 3.2 方式二：Events API（服务端/移动端）

如果你无法在页面中插入 JS（比如移动 App 或纯服务端渲染），可以直接通过 HTTP API 发送事件：

```bash
curl -X POST https://plausible.example.com/api/event \
  -H 'User-Agent: Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)' \
  -H 'X-Forwarded-For: 192.168.1.100' \
  -H 'Content-Type: application/json' \
  --data '{
    "name": "pageview",
    "url": "https://yourdomain.com/blog/hello",
    "domain": "yourdomain.com",
    "referrer": "https://google.com",
    "props": {
      "category": "technology"
    }
  }'
```

这里的关键点：

- `User-Agent` 和 `X-Forwarded-For` 用于计算唯一访客（没有这两个，统计数据会不准）
- `name: "pageview"` 表示一次页面浏览，也可以自定义事件名（如 `"purchase"`）
- `props` 可以附加自定义属性，最多 30 个键值对

## 四、核心功能详解

### 4.1 仪表盘

打开 Plausible 后台，一个页面就能看到所有关键指标：

- **页面浏览量（Pageviews）**：所有页面被访问的次数
- **访客数（Visitors）**：去重后的独立访客数量
- **跳出率（Bounce Rate）**：只看了一个页面就离开的比例
- **平均访问时长**：每次会话停留的时间
- **进入页面 / 退出页面**：用户从哪里来、从哪里走

没有层层菜单、不需要构建自定义报表。

### 4.2 Goals（转化目标）

你可以把任何页面设为"目标"来追踪转化。例如：

- 注册成功页 → 追踪"注册用户数"
- 购买确认页 → 追踪"销售额"
- 文件下载链接 → 追踪"下载量"

还支持 **无代码目标**：自动追踪外链点击、表单提交、404 错误页。

### 4.3 Funnels（漏斗分析）

测量用户在一个固定流程中的流失情况。比如电商的"浏览商品 → 加入购物车 → 结算 → 付款"，可以看到每一步有多少人放弃。

### 4.4 实时仪表盘

每 30 秒自动刷新，可以看到当前正在访问你网站的有多少人。

### 4.5 集成能力

- **Google Search Console**：直接在 Plausible 中查看搜索关键词排名
- **Stats API**：通过 API 查询历史数据，可以做自定义报表
- **Looker Studio**：连接器可以把 Plausible 数据导入 Looker 做可视化
- **邮件/Slack 周报**：定期收到流量报告

## 五、Stats API 使用示例

Plausible 提供了一个统一的 Stats API 端点 `/api/v2/query`，可以用 POST 请求查询各种维度的统计数据。

### 5.1 查询最近 7 天的总访客数

```bash
curl -X POST https://plausible.example.com/api/v2/query \
  -H 'Authorization: Bearer YOUR_API_KEY' \
  -H 'Content-Type: application/json' \
  --data '{
    "site_id": "yourdomain.com",
    "metrics": ["visitors", "pageviews", "bounce_rate"],
    "date_range": "7d"
  }'
```

### 5.2 按国家/城市分组，查看访客分布

```bash
curl -X POST https://plausible.com/api/v2/query \
  -H 'Authorization: Bearer YOUR_API_KEY' \
  -H 'Content-Type: application/json' \
  --data '{
    "site_id": "yourdomain.com",
    "metrics": ["visitors", "pageviews"],
    "date_range": "30d",
    "dimensions": ["visit:country_name", "visit:city_name"],
    "order_by": [["visitors", "desc"]]
  }'
```

返回结果类似：

```json
{
  "results": [
    {"metrics": [99, 98], "dimensions": ["Estonia", "Tallinn"]},
    {"metrics": [98, 82], "dimensions": ["Brazil", "Sao Paulo"]},
    {"metrics": [97, 77], "dimensions": ["Germany", "Berlin"]}
  ],
  "meta": {}
}
```

### 5.3 按时间序列查看每日趋势

```bash
curl -X POST https://plausible.example.com/api/v2/query \
  -H 'Authorization: Bearer YOUR_API_KEY' \
  -H 'Content-Type: application/json' \
  --data '{
    "site_id": "yourdomain.com",
    "metrics": ["visitors", "pageviews"],
    "date_range": "91d",
    "dimensions": ["time:day"]
  }'
```

## 六、Plausible vs Google Analytics 对比

| 特性 | Plausible | Google Analytics |
|------|-----------|-----------------|
| 脚本大小 | ~1KB | ~54KB |
| Cookie | 不需要 | 需要 |
| Cookie 横幅 | 不需要 | 需要（GDPR 地区） |
| 数据隐私 | 不收集个人信息 | 收集大量用户数据 |
| 学习曲线 | 5 分钟上手 | 需要培训 |
| 开源 | AGPL-3.0 | 闭源 |
| 价格 | 付费订阅（$9/月起） | 免费（数据被 Google 用于广告） |
| 自定义维度 | 支持（Custom Properties） | 支持但复杂 |
| 实时数据 | 每 30 秒刷新 | 有延迟 |

## 七、为什么 Plausible 不是免费的？

这是一个常见疑问。Google Analytics 免费是因为 **Google 用你的用户数据来做广告**，本质上是"你用数据换产品"。

Plausible 选择的是 **订阅制**：你付钱，我们继续开发和维护产品。你的用户数据不会被任何第三方获取。Plausible 的团队只有 10 人，完全靠 19,000+ 付费用户的订阅资金运营，是一个自给自足的独立项目。

简单说：**你要么为产品付钱，要么你的用户数据就是货币。**

## 八、总结

Plausible 的核心价值可以用一句话概括：**用极简的方式，获得你真正需要的网站洞察，同时尊重每一位访问者的隐私。**

对于中小网站、博客、创业公司来说，它几乎是不二之选。对于需要极其细粒度数据分析的大型企业，可能需要更专业的方案。

如果你厌倦了 GA 的复杂性和 Cookie 弹窗的烦恼，Plausible 是最值得尝试的替代品之一。
