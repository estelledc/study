---
title: "OpenStreetMap — 开源世界地图"
来源: https://github.com/openstreetmap/iD
日期: 2026-06-13
子分类: geographic-information-systems
分类: 其他
难度: 零基础
provenance: pipeline-v3
---

## 是什么

OpenStreetMap（简称 **OSM**）是一个像维基百科一样的在线地图项目——任何人都能编辑，任何人都能用。日常类比：Google Maps 是出版社编的地图（你只能看、不能改），OSM 是班级手抄报（全班同学一起画、一起改）。

它从 2004 年开始，由 Steve Coast（英国程序员）发起，现在已经有超过 300 万志愿者在维护全球地图数据。你可以在上面看到街道、餐馆、公交站、甚至一棵古树的位置。

## 核心概念

OSM 的数据模型非常简洁，只有三种基本元素：

| 概念 | 类比 | 说明 |
|------|------|------|
| **Node（节点）** | 一个点 | 记录一个地理位置（经纬度），比如一个公交站 |
| **Way（路径）** | 一条线或一个圈 | 一串有序的点连起来，比如一条路、一栋楼的轮廓 |
| **Relation（关系）** | 一组东西的组合 | 把多个 node/way 绑在一起，比如一条公交线路经过哪些站点 |

每个元素都可以挂 **标签（Tag）**，格式是 `key=value`，用来描述"这是什么"。比如：

```
highway=residential    → 这是一条居民区道路
name=长安街            → 这条路叫长安街
amenity=restaurant     → 这是一个餐馆
```

这就是 OSM 的全部数据模型——点、线、面和它们的属性标签。

## 怎么编辑：iD 编辑器

OSM 没有"后台数据库给你连"，它提供一个叫 **iD** 的网页编辑器（就是 GitHub 上那个 `openstreetmap/iD` 项目）。你打开 `openstreetmap.org` 就能用，不需要安装任何东西。

iD 的工作流程：

1. 打开地图 → 看到底图是卫星图或街道图
2. 点击空白处 → 添加一个新节点（点）
3. 给它加标签 → 告诉 OSM 这是个什么
4. 保存 → 你的修改会提交到 OSM 服务器

代码层面的数据格式（GeoJSON-like 的 OSM JSON）：

```json
{
  "version": 2,
  "features": [
    {
      "type": "node",
      "id": 123456789,
      "lat": 39.9042,
      "lon": 116.4074,
      "tags": {
        "amenity": "cafe",
        "name": "星巴克"
      }
    },
    {
      "type": "way",
      "id": 987654321,
      "nodes": [123456789, 123456790, 123456791],
      "tags": {
        "highway": "residential",
        "name": "南锣鼓巷"
      }
    }
  ]
}
```

上面这段就是 OSM 数据的"骨架"——一个 node 代表咖啡馆的位置，一个 way 代表南锣鼓巷这条路的走向。

## OSM 数据怎么被用到

OSM 本身只提供"原始地图数据"，真正让你看到地图的是各种**消费方**。最常见的用法是把 OSM 数据加载到前端地图库里。

### 示例 1：用 Leaflet 加载 OSM 瓦片

OSM 把地图切成一张张方形小图（瓦片），按缩放层级编号。任何地图库都能直接请求这些瓦片：

```js
import L from 'leaflet'

const map = L.map('map').setView([39.9042, 116.4074], 13)

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map)
```

`{z}` 是缩放级别，`{x}` `{y}` 是瓦片坐标。这三个变量拼出来的 URL 就像：

```
https://a.tile.openstreetmap.org/13/2845/1893.png
```

每一张就是 256x256 像素的小地图块，浏览器把它们拼在一起就是一张完整的地图。

### 示例 2：用 OSM 数据创建一个标记点

```js
import L from 'leaflet'

const map = L.map('map').setView([39.9042, 116.4074], 13)

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map)

// 在某个位置放一个标记
L.marker([39.9042, 116.4074])
  .addTo(map)
  .bindPopup('<b>北京</b><br>纬度 39.9042, 经度 116.4074')
  .openPopup()
```

这个 marker 的位置 `[39.9042, 116.4074]` 就是 OSM 里 node 的经纬度。你可以把 OSM 导出的所有 node 数据循环遍历，批量生成 marker。

## 为什么重要

不理解 OSM，下面这些事都没法解释：

- 为什么 Uber、Facebook Places、Strava 这些大厂都用了 OSM 数据——因为免费、开放、全球覆盖
- 为什么灾后救援（地震、洪水）第一张地图往往来自 OSM——志愿者能实时添加道路损毁信息
- 为什么"同一个地址在 Google Maps 和某 App 上显示不同"——因为那个 App 可能用的是 OSM 而不是 Google
- 为什么有些小众地点（山间小路、村口小店）在 Google Maps 上没有，在 OSM 上有——因为当地志愿者填的

## 踩过的坑

1. **瓦片服务器有访问限制**：`tile.openstreetmap.org` 是免费的公共服务器，不建议在生产项目里直接用。应该用 CDN 镜像（如 CartoCDN）或自建瓦片服务。
2. **坐标顺序是 [纬度, 经度] 不是 [经度, 纬度]**：OSM 和大多数地图库用 `[lat, lng]`，但 GeoJSON 标准是 `[lng, lat]`，混用会导致位置偏移几千公里。
3. **标签没有统一强制规范**：任何人都可以写 `my_tag=hello`，导致数据质量参差不齐。社区有一套 [Key-valley 规范](https://wiki.openstreetmap.org/wiki/Keys) 推荐遵循，但不是强制的。
4. **iD 编辑器的"变化集"（Changeset）机制**：每次保存编辑必须带一个 changeset 注释，描述你改了什么。不改注释会被拒绝提交。

## 适用 vs 不适用场景

**适用**：

- 需要免费、开放的底图数据
- 社区协作标注（如灾后地图、本地 POI 补充）
- 离线地图（下载 OSM 原始数据 + 自建瓦片服务）
- 任何想用"众包地图"代替商业地图服务的场景

**不适用**：

- 需要高精度卫星影像 → OSM 的底图是街道图，不是航拍
- 需要实时交通信息 → OSM 不内置交通数据
- 需要导航路线规划 → OSM 只提供数据，不提供导航引擎（但有 OSRM 等第三方工具）

## 历史小故事（可跳过）

- **2004 年**：Steve Coast 在英国散步时发现 GPS 数据无法自由使用，萌生了"开源地图"的想法
- **2006 年**：OSM 项目正式成立，同年创建了 wiki 和编辑器
- **2008 年**：Google 在海地地震后请求使用 OSM 数据做救灾地图，OSM 一战成名
- **2012 年**：iD 编辑器上线——之前编辑 OSM 要用复杂的 Potlatch（Flash 编辑器），iD 让普通人也能上手
- **至今**：超过 300 万贡献者，覆盖全球 200+ 国家和地区，数据被 Facebook、Uber、Apple Maps（部分）等使用

## 学到什么

1. **开源地图 ≠ 低质量地图**——300 万志愿者的贡献量在某些地区已经超过商业地图
2. **数据模型极简**——点（node）、线（way）、关系（relation）+ 键值标签，这就是全部
3. **瓦片机制是互联网地图的通用语言**——不管用什么地图库，最终都是请求 `{z}/{x}/{y}.png` 这种格式的瓦片
4. **开放数据的力量**——灾后救援、社区共建，OSM 证明了"众人拾柴"在地理信息领域的可行性

## 延伸阅读

- 官方网站：[openstreetmap.org](https://www.openstreetmap.org)（打开即用）
- iD 编辑器：[github.com/openstreetmap/iD](https://github.com/openstreetmap/iD)（3800+ stars，JavaScript + D3.js）
- 数据下载：[download.geofabrik.de](https://download.geofabrik.de)（按国家/地区下载完整 OSM 数据）
- 标签规范：[wiki.openstreetmap.org/wiki/Key](https://wiki.openstreetmap.org/wiki/Key)（社区约定的标签字典）
- Overpass API：[overpass-turbo.eu](https://overpass-turbo.eu)（用类似 SQL 的语法查询 OSM 数据）

## 关联

- [[openlayers]] —— 专业 GIS 前端库，能加载 OSM 瓦片做深度地理分析
- [[leaflet]] —— 轻量地图库，加载 OSM 瓦片最常用选择
