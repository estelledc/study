---
title: TimelineJS — 一张 Google Sheet 直接变成交互时间轴
来源: NUKnightLab/TimelineJS3 (GitHub, 10k+ stars), Zach Wise 2012
日期: 2026-06-01
分类: 基础设施
难度: 入门
---

## 是什么

TimelineJS 是 Northwestern 大学 Knight Lab 出的一个**前端组件**：你在 Google Sheet 里填几行（年月日、标题、正文、配图），把表格链接贴到它的页面上，它就给你生成一条**可拖动、可嵌入、可展开图文**的横向时间轴。

日常类比：像把 Excel 当成"内容管理系统"，下班前老板说"明天要个新闻专题时间轴"，你不用写代码，**填表 → 复制 iframe**，就能上线。

它解决的问题是：**让不会写代码的记者、老师、学生也能做出能看的交互时间轴**。

## 为什么重要

不理解 TimelineJS 这类工具，下面这些事都没法解释：

- 为什么 NYT、Le Monde、BBC 这种大新闻机构的"事件回顾"页面长得很像——很多就是 TimelineJS 同款
- 为什么"把表格当后端"是 2010 年代前端工具的一个常见套路（Google Sheet / Airtable / Notion 都被这么用过）
- 为什么"零代码工具 + 一段 iframe 嵌入"能让一个工具横扫教育和新闻业 10 年
- 为什么 Knight Lab 出的几样东西（TimelineJS / StoryMapJS / SoundciteJS）都遵循同一个产品哲学

## 核心要点

TimelineJS 的设计可以拆成 **四层**：

1. **数据层 = Google Sheet**：一张表，每行一个时间点。列固定：Year / Month / Day / Headline / Text / Media（媒体 URL）/ Caption。Sheet 公开发布到 Web 后会暴露成可读 JSON。

2. **取数层 = JS 拉表**：浏览器里跑一段 JS，把 Sheet 当 API 拉下来，转成内部数据模型。**没有自己的后端**——这是它能"零运维"的关键。

3. **渲染层 = 原生 JS + CSS**：横向滚动条 + 上下分栏（上：日期轴；下：当前事件的图文）。键盘左右键、鼠标拖动、点缩略图都能切换。**没用任何 React / Vue 框架**，纯 vanilla JS（2012 年的产物）。

4. **嵌入层 = iframe**：托管版给你一段 `<iframe src="cdn.knightlab.com/...">`，直接贴进任何 CMS / 博客 / 富文本编辑器。

四层加起来：填表 → 复制 URL → 粘贴 iframe → 完成。

## 实践案例

### 案例 1：5 分钟做一个"实习经历时间轴"

1. 打开 [timeline.knightlab.com](https://timeline.knightlab.com/)，点 "Make a Timeline"
2. 复制官方 Google Sheet 模板到自己账户
3. 填几行：
   ```
   2024 | 9  | 1  | 入学 | 第一次远离家乡    | (空)
   2025 | 6  | 15 | 实习 | 加入某团队做后端  | https://github.com/...
   2026 | 5  | 31 | 毕业 | 答辩通过          | (空)
   ```
4. Sheet → 文件 → 共享 → 发布到网络
5. 把发布链接粘回 Knight Lab 的页面，点生成
6. 拷贝 iframe 代码，贴到博客 / 个人主页

整个过程**没写一行 JS**。

### 案例 2：媒体嵌入的"魔法"在哪

填 Media 列的时候，URL 可以是：

- YouTube / Vimeo 视频 → 自动内嵌播放器
- Twitter / X 推文链接 → 渲染成原生卡片
- Wikipedia 词条 → 抓 summary + 缩略图
- Google Maps 链接 → 嵌入小地图
- Flickr / SoundCloud / Spotify → 各自的播放器

它的秘密：**对每个 URL 跑一遍 oEmbed 协议**——一种通用规范，让任何站点对外暴露"我这条 URL 应该被怎么嵌入"。TimelineJS 不为每家平台单独写代码，而是讲一种通用语言。

### 案例 3：自托管 = 跳过 Google Sheet

如果不想依赖 Google：

```html
<link rel="stylesheet" href="timeline3/css/timeline.css">
<script src="timeline3/js/timeline.min.js"></script>
<div id="timeline-embed"></div>
<script>
  const data = {
    title: { text: { headline: "我的时间轴" } },
    events: [
      { start_date: { year: 2024 }, text: { headline: "事件 1", text: "正文" } },
      { start_date: { year: 2025 }, text: { headline: "事件 2", text: "正文" } }
    ]
  };
  new TL.Timeline('timeline-embed', data);
</script>
```

直接喂 JSON。这条路适合"想内嵌进自家系统、又不想暴露 Google Sheet"的场景。

## 踩过的坑

1. **Google Sheet 必须设为"发布到网络"**：仅"任何人可看"不够。点 文件 → 发布到网络，才能拿到供 JS 拉取的 CSV/JSON。新人 90% 卡在这一步。

2. **Google API 历史上断过几次**：2020 年前后 Google 改了 Sheet 公开数据接口，老版 TimelineJS 大批失效。Knight Lab 推 V3 改用新接口才修好。**强依赖第三方平台是这套架构的脆弱点**。

3. **超过 50 条事件性能下降**：横向轴会变得拥挤，缩略图加载也慢。官方建议控制在 20–50 条之间。如果是**百年级**的历史时间轴，要分章节做几条。

4. **不支持垂直时间轴 / 分支**：只能横向单线。需要"分支并行多条线"的，要找 Vis.js 或自己写 D3。

5. **iframe 嵌入会被 CSP 拦**：现代网站常加 Content-Security-Policy `frame-src` 限制。如果 iframe 不显示，先看浏览器控制台错误。

## 适用 vs 不适用场景

**适用**：

- 新闻专题（事件追踪、人物生平、政策演进）
- 教学项目（历史课、文学课、科学史课的可视化作业）
- 个人作品集 / 履历的视觉化呈现
- 产品演进时间轴（公司创立、版本发布、里程碑）

**不适用**：

- **数据敏感**场景——Google Sheet 是公开的，私有数据不能放
- **超大数据量**（>100 事件）——卡，且体验差
- **需要复杂交互**（筛选、搜索、跨时间轴对比）——做不了
- **高度定制视觉**——CSS 能改但有限，要彻底改样式不如自己写
- **不能依赖 Google 的环境**（中国大陆部分网络 / 内网部署）——要么走自托管 JSON，要么换工具

## 历史小故事（可跳过）

- **2012 年**：Northwestern 大学新闻学院的 Knight Lab 成立，目标是"把数字工具做得让记者也能用"。Zach Wise（前 NYT 多媒体记者）开发第一版 TimelineJS。
- **2013–2016 年**：在 NYT、Time、Radiolab、Le Monde 等大媒体扩散，成为新闻业事实标准之一。
- **2017 年**：发布 V3 (TimelineJS3)，重写为 ES6，改用 Google Sheets v4 API，性能和移动端体验大幅提升。
- **2020 年**：Google 改 API 又一次让老站点失效，社区催 Knight Lab 修；同期 oEmbed 嵌入也因为 Twitter / Instagram 政策变化做了补丁。
- **至今**：仍在维护（每年若干次小更新），是 Knight Lab "新闻工具家族" 的旗舰产品。

## 学到什么

1. **"表格当后端"是低代码工具的经典套路**——Google Sheet / Airtable / Notion 都被这么用，本质是"把 SaaS 当 DB"
2. **oEmbed 是被低估的协议**——一段 URL 自描述自己应该怎么嵌入，让平台间互通无需 N×M 写胶水代码
3. **零运维 = 别有自己的后端**——TimelineJS 不存任何用户数据，只在用户浏览器里跑，所以 Knight Lab 一个小团队能维护它 10+ 年
4. **iframe 嵌入仍然是 Web 跨站集成最稳的方案**——比 Web Component / micro-frontend 都简单，CMS 时代以来就没变过
5. **限制 = 设计**——只支持横向、只支持 Google Sheet、只支持 ~50 条，正是这些限制让它"5 分钟上手"

## 延伸阅读

- 官网 + 在线生成器：[timeline.knightlab.com](https://timeline.knightlab.com/)
- 源码：[github.com/NUKnightLab/TimelineJS3](https://github.com/NUKnightLab/TimelineJS3)（MPL-2.0 协议）
- oEmbed 规范：[oembed.com](https://oembed.com/)（理解 TimelineJS 媒体嵌入的底层协议）
- 同家族工具：StoryMapJS（地图叙事）/ JuxtaposeJS（图片对比滑块）/ SoundciteJS（行内音频）

## 关联

- [[gantt-chart-1910]] —— 都是"时间维度可视化"的祖师爷血脉，但 Gantt 关注任务并行，TimelineJS 关注事件叙事
- [[d3-2011]] —— 灵活度高 100 倍但门槛也高 100 倍；TimelineJS 是 D3 时代之外的"零代码"那一极
- [[oembed-protocol]] —— TimelineJS 媒体嵌入背后的协议
- [[google-sheets-api]] —— 它把 Sheet 当后端的关键依赖

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
