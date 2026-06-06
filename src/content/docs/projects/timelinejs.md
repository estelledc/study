---
title: TimelineJS — 把 Google Sheet 一键变成新闻时间线
来源: 'https://github.com/NUKnightLab/TimelineJS3 + Knight Lab 官方文档 https://timeline.knightlab.com/docs/'
日期: 2026-06-01
子分类: 数据可视化
分类: 数据可视化
难度: 入门
provenance: pipeline-v3
---

## 是什么

TimelineJS 是 **Northwestern Knight Lab 出品的"填表格就能发时间线"工具，记者填一份 Google Sheet，粘贴 URL，拿到一段 iframe，嵌进文章就完事**。日常类比：像在线 PPT 模板——你不写代码、不管样式，只负责把"哪一年发生了什么、配哪张图"填进单元格，剩下的渲染、缩放、媒体嵌入工具都包了。

最小用法（不写一行代码）：

1. 复制 Knight Lab 官方 [Google Sheet 模板](https://docs.google.com/spreadsheets/d/1cWqzqFAFySFjxK--zhfqNygJBhhWFmDIpY7RfIb9zj0/copy)，每一行填一个事件
2. 文件 → 共享 → 发布到网络
3. 把 Sheet URL 粘进 [timeline.knightlab.com](https://timeline.knightlab.com/) 的生成器
4. 拿到一段 `<iframe src="cdn.knightlab.com/...">`，贴进任何博客 / CMS

整个 pipeline 就是 **Sheet → Knight Lab 服务器拉数据转 JSON → CDN 上的 JS 在浏览器渲染**。开发者要更可控可以走第二种模式：跳过 Sheet，直接给前端一份 JSON 配置，组件照样跑。这是它和 [[vis-timeline]] 这种"纯组件"最大的区别——TimelineJS **自带托管 + 无代码入口**，目标用户是记者和老师不是前端。

## 为什么重要

不理解 TimelineJS，下面这些事都没法解释：

- 为什么很多英语世界的报纸做"事件长河"专题，**底下嵌入的源都是 cdn.knightlab.com**——一个无代码工具吃掉了大半新闻业的时间线需求
- 为什么"无代码工具 + iframe 嵌入" 在新闻业能比"自己请前端写一个"活得久——记者会用 Excel，但不会用 React
- 为什么 Google Sheets API 一变更，全世界几千个新闻时间线一夜之间集体显示"无法加载"——他们的 pipeline 第一步就锁死在 Sheets 上
- 为什么这种工具的"上限"看着低却覆盖了一大片需求：图文 + 时间 + 媒体嵌入这三件事 90% 的故事讲述都够了

## 核心要点

TimelineJS 的设计可以拆成 **三句话**：

1. **数据格式即文档**：Sheet 的列名（`Year` / `Month` / `Day` / `Headline` / `Text` / `Media` / `Type` / `Group` / `Background`）就是 schema。记者不读文档，**列名自身就是说明书**——这是无代码工具的关键设计。

2. **TimeNav + StorySlider 双区域**：底部一条 **TimeNav** 是缩略时间轴（拖动跳跃），上方 **StorySlider** 是大画面（一屏一个事件，左右翻）。两块共享同一份 JSON，靠"当前 slide index"同步。

3. **媒体类型自动识别**：`Media` 列贴一个 URL，组件根据域名匹配 handler——YouTube → 嵌播放器，Wikipedia → 抓摘要，Google Maps → 嵌地图。**记者不挑格式，组件认得**。

## 实践案例

### 案例 1：最小 Sheet（一行就能跑）

| Year | Month | Day | Headline           | Text                | Media                                     | Type  |
|------|-------|-----|--------------------|---------------------|-------------------------------------------|-------|
| 2026 | 5     | 28  | 项目 Kickoff       | 全员到齐第一次会议  |                                           | title |
| 2026 | 6     | 1   | 需求评审           | 评审 12 条主线需求  | https://i.imgur.com/example.jpg           |       |
| 2026 | 6     | 15  | 灰度上线           | 5% 流量切到新版本   | https://www.youtube.com/watch?v=demo      |       |

第一行 `Type=title` 是封面 slide，没有时间点；后续行按日期自动排序。`Media` 列贴 YouTube 链接，组件自动嵌成播放器——**记者写一条 URL，组件替你想 30 行 embed 代码**。

### 案例 2：直接给 JSON（开发者模式）

```html
<link rel="stylesheet" href="https://cdn.knightlab.com/libs/timeline3/latest/css/timeline.css">
<script src="https://cdn.knightlab.com/libs/timeline3/latest/js/timeline.js"></script>
<div id="timeline-embed" style="width: 100%; height: 600px"></div>
<script>
  const data = {
    title: { text: { headline: '产品里程碑' } },
    events: [
      { start_date: { year: 2026, month: 6, day: 1 },
        text: { headline: 'v1 发布', text: '首次公开版本' },
        media: { url: 'https://i.imgur.com/example.jpg' } },
    ],
  };
  new TL.Timeline('timeline-embed', data);
</script>
```

绕开 Google Sheets，直接喂 JSON。**生产环境强烈推荐这条路**——Sheet 那条 pipeline 多一个 Google API 依赖，多一处可能挂。自己掌控 JSON，可以从 CMS / 数据库直出，构建期生成静态文件。

### 案例 3：分组（Group）做并行赛道

```json
{
  "events": [
    { "start_date": {"year": 2026, "month": 6}, "group": "前端",
      "text": {"headline": "改版上线"} },
    { "start_date": {"year": 2026, "month": 6}, "group": "后端",
      "text": {"headline": "鉴权迁移"} },
    { "start_date": {"year": 2026, "month": 7}, "group": "前端",
      "text": {"headline": "性能优化"} }
  ]
}
```

`group` 字段让事件分轨道展示——TimeNav 底部会拆成多行，每个 group 一行。新闻报道里常用来做"前后端进度对比"或"产品 vs 营销节奏对照"这种多线并行叙事。

## 踩过的坑

1. **Google Sheet 必须"发布到网络"，不是"共享"**：很多人把 Sheet 设成"任何人有链接可查看"就贴 URL，结果一直报无法加载。**File → Share → Publish to web** 才是正路。两个权限是不同 API。

2. **Sheet 列名大小写敏感**：`headline` 和 `Headline` 工具只认后者。记者复制别人的 Sheet 改时容易把表头改小写，整列数据被忽略。

3. **`Media` 列的 URL 必须是直链，不能是分享页**：贴 YouTube 是 `watch?v=` 没问题；但贴 Google Drive 的"分享链接"会被 iframe 沙箱拦掉。记者常踩——以为图床和分享页都一样能用。

4. **iframe 嵌入的样式覆写很难**：宿主页面的 CSS 进不去 iframe 内部。想换字体 / 主色，要么改 Sheet 的 `Background` 列改单条 slide 背景，要么自托管走 npm 包改 SCSS 重打包——前者改皮，后者改骨。

5. **Google API 历史遗留地雷**：v3 早期用 `gviz` 端点拉 Sheet，2020 年后 Google 多次变更 API，老 timeline 间歇性挂。Knight Lab 一直在追这个 moving target，但出事时记者只看到"加载中"转圈圈。

## 适用 vs 不适用场景

**适用**：

- 新闻报道的"事件长河"专题（俄乌战争 / 疫情时间线 / 选举节点回顾）
- 中小学 / 大学历史课程作业（学生填 Sheet，老师批阅）
- 公司里程碑墙、博物馆展品的数字陪同
- 个人项目年表 / 简历可视化

**不适用**：

- 万级事件 → 一屏一 slide 的设计撑不住，切 [[vis-timeline]] 这种轨道式组件
- 需要双向交互（点击事件回写后端）→ TimelineJS 是只读展示，不带表单
- 严格隔离 / 内网部署 → CDN 模式依赖外网，自托管要走 npm + 自己跑构建
- 复杂日历视图（月格子） → 用 [[fullcalendar]] 或专门日历库，TimelineJS 是横向流不是日历

## 历史小故事（可跳过）

- **2012 年**：Northwestern University 的 Knight Lab（由 Knight 基金会资助，做"新闻 + 技术"交叉研究）启动 TimelineJS v1，目标是"让记者不写代码就能做交互式时间线"。
- **2013 年**：v1 在芝加哥论坛报、华盛顿邮报等机构试用，迅速走红。同时期 Knight Lab 还出了 StoryMapJS（地图叙事）、Soundcite（音频引用）等姐妹工具，统称 Knight Lab Studio。
- **2017 年前后**：v3 重写——抛弃 jQuery、模块化拆分、ES module 化、媒体 handler 解耦。仓库改名 TimelineJS3。
- **2020-2024 年**：Google Sheets API 变更多次，社区抱怨"老 timeline 时不时就挂"。仓库提交节奏放缓但仍在维护，issue 列表里"Sheet 加载失败"是常驻话题。

## 学到什么

1. **"列名即 schema"是无代码工具的灵魂**——把数据结构暴露成 Excel 的表头，用户的"心智模型"就是表格，零学习成本
2. **托管 + iframe 嵌入** 的分发模式让一个工具同时服务"想自托管的开发者"和"只会复制粘贴的记者"，但代价是绑死外部 CDN 和 API
3. **Google Sheet 当数据库** 是双刃剑：上手快、协作免费，但 API 不稳定 / 配额限制 / 权限模型混乱，**生产严肃场景应转 JSON 直喂**
4. **新闻业的工具栈和互联网产品的工具栈不一样**——记者要的是"发布即用"，不是"灵活可扩展"。理解用户画像比堆功能重要

## 延伸阅读

- 官方主页 + 在线生成器：[timeline.knightlab.com](https://timeline.knightlab.com/)
- 官方文档：[timeline.knightlab.com/docs/](https://timeline.knightlab.com/docs/)（含 JSON schema 完整字段表）
- GitHub 仓库：[github.com/NUKnightLab/TimelineJS3](https://github.com/NUKnightLab/TimelineJS3)
- 姐妹项目 [StoryMapJS](https://storymap.knightlab.com/) —— 同一作者的"地图叙事"版
- [[vis-timeline]] —— 纯组件路线对照，目标用户是前端不是记者

## 关联

- [[vis-timeline]] —— 纯组件方案，无托管 / 无 iframe，目标受众完全不同
- [[d3]] —— 底层造轮选项；TimelineJS 是把"时间轴 + 媒体嵌入 + 缩放"全打包好的高层方案
- [[fullcalendar]] —— 日历视图（月格子）的对照，TimelineJS 是横向流
- [[date-fns]] —— 时间运算的现代库；TimelineJS 内部的日期处理也曾依赖 moment
- [[temporal-polyfill]] —— JS 原生时间标准的备胎，未来这类组件的基础

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[d3]] —— D3.js — 不是图表库，是写图表库的乐高
- [[date-fns]] —— date-fns — 不造新类型，给原生 Date 配 200+ 个独立函数
- [[temporal-polyfill]] —— temporal-polyfill — 给 JavaScript 装上现代日期时间标准的备胎
- [[vis-timeline]] —— vis-timeline — 时间轴 / 日程 / 历史事件三合一组件

