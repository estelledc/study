---
title: "OSMnx 入门 — 用一行代码下载和分析城市街道网络"
source: "https://github.com/gboeing/osmnx"
date: "2026-06-13"
category: "地理空间"
subcategory: "Python 工具"
provenance: "pipeline-v3"
分类: 其他
子分类: geographic-information-systems
---

## 从一张地图说起

想象你有一张任意城市的街道地图，而且你想知道：这个城市有多少个路口？平均每条街多长？从你家到最近的咖啡馆步行要多久？

OSMnx 就是一个帮你"下载世界地图、把它变成可计算的网络、然后回答这些问题"的 Python 工具。

它的数据来自 [OpenStreetMap (OSM)](https://www.openstreetmap.org)——一个全球志愿者维护的免费地图数据库。OSMnx 通过 OSM 的 API 自动下载数据，把街道变成一个"图"（Graph），然后用图论的方法来分析。

一句话总结：**输入一个城市名，输出一个可分析的城市街道网络。**

---

## 核心概念

### 1. 图（Graph）

在 OSMnx 里，整个城市街道就是一个 **MultiDiGraph**（多重有向图）：

| 术语 | 类比 | OSMnx 中的含义 |
|------|------|----------------|
| **节点 (Node)** | 路口或巷口 | 一个具体的地理坐标（经纬度） |
| **边 (Edge)** | 连接两个路口的街道段 | 一段有方向的路，包含长度、是否单行等信息 |
| **有向 (Directed)** | 单行道 | 从 A 到 B 和从 B 到 A 是两条不同的边 |
| **多重 (Multi)** | 两条平行的高架路 | 两个路口之间可能有超过一条路 |

为什么用"有向图"？因为现实中有单行道——从东往西能走，但从西往东不能。

### 2. 拓扑简化（Simplification）

OSM 原始数据中，一条弯曲的街道会被拆成几十个节点（因为每个拐点都是一个节点）。OSMnx 会自动"简化"：把中间的拐点去掉，只保留真正的路口和死胡同，但保留街道的弯曲形状作为边的属性。

### 3. GeoDataFrame

OSMnx 的输出经常是 **GeoDataFrame**——你可以理解为"带地图的 Excel 表格"。每一行是一个地理要素（比如一栋楼、一个路口），每一列是它的属性（名字、类型、坐标等）。

### 4. 查询方式

OSMnx 支持多种查询方式：

- `graph_from_place("Beijing, China")` — 按城市名
- `graph_from_point((39.9, 116.4), dist=1000)` — 按坐标 + 距离
- `graph_from_bbox((min_lon, min_lat, max_lon, max_lat))` — 按经纬度方框
- `features_from_address("...")` — 下载兴趣点（餐厅、学校等）

---

## 安装

```bash
pip install osmnx
```

依赖：NetworkX（图计算）、GeoPandas（地理数据处理）、Matplotlib（绘图）。

---

## 代码示例 1：下载并分析一个城市的街道网络

这段代码下载成都市的步行网络，然后算一堆统计数字：

```python
import osmnx as ox

# 配置：日志级别 + 缓存
ox.settings.log_console = True
ox.settings.use_cache = True

# 1. 下载成都的步行网络（dist=5000 表示从市中心向外 5 公里）
city = "Chengdu, Sichuan, China"
graph = ox.graph_from_place(city, network_type="walk", dist=5000)

# 2. 统计基本信息
num_nodes = len(graph.nodes)
num_edges = len(graph.edges)
print(f"节点数（路口）: {num_nodes}")
print(f"边数（街道段）: {num_edges}")

# 3. 计算更多统计指标
stats = ox.basic_stats(graph)
print(f"街道密度（边/节点）: {stats['street_density']:.2f}")
print(f"平均度（每个路口连几条街）: {stats['mean_street_degree']:.2f}")

# 4. 转成 GeoDataFrame 方便查看
nodes_gdf, edges_gdf = ox.convert.graph_to_gdfs(graph)
print(edges_gdf.head())

# 5. 画图
fig, ax = ox.plot_graph(graph, fig_height=10, fig_width=10)
```

**关键函数解读：**

- `graph_from_place`：输入城市名，自动地理编码（查坐标），然后从 OSM 下载街道网络
- `network_type`：可选 `"walk"`（步行）、`"bike"`（骑行）、`"drive"`（驾车）、`"all"`（全部）
- `ox.basic_stats()`：一键算 20+ 个指标，包括路口密度、环量（circuity，衡量绕路程度）、连通性等
- `ox.plot_graph()`：直接把图画出来

---

## 代码示例 2：下载兴趣点 + 最短路径计算

这个例子做两件事：找成都IFS附近的所有咖啡馆，然后算一条从春熙路到武侯祠的步行路线：

```python
import osmnx as ox
import networkx as nx

# ---------- 第 1 部分：找咖啡馆 ----------

# 成都IFS的坐标
center = (30.6500, 104.0850)

# 下载 IFS 周围 800 米内的所有咖啡馆
tags = {"amenity": "cafe"}
cafes = ox.features.features_from_point(center, tags, dist=800)

print(f"找到 {len(cafes)} 家咖啡馆")
print(cafes[["amenity", "name"]].head(10))

# ---------- 第 2 部分：最短路径 ----------

# 下载步行网络
G = ox.graph_from_point(center, dist=2000, network_type="walk", simplify=True)

# 起点：春熙路附近；终点：武侯祠附近
origin = (30.6550, 104.0780)
destination = (30.6450, 104.0380)

# 找离起点和终点最近的图节点
orig_node = ox.distance.nearest_nodes(G, origin[0], origin[1])
dest_node = ox.distance.nearest_nodes(G, destination[0], destination[1])

# 算最短路径（按距离最短）
route = nx.shortest_path(G, orig_node, dest_node, weight="length")

# 算总距离
total_length = sum(G.edges[u, v]["length"] for u, v in zip(route[:-1], route[1:]))
print(f"路线长度: {total_length / 1000:.2f} 公里")

# 画图：在图上画出路线
fig, ax = ox.plot_graph_route(G, route, route_color="red", route_width=4,
                               node_color="gray", fig_size=(12, 10))
```

**关键函数解读：**

- `features_from_point`：按坐标和半径下载 OSM 兴趣点，返回 GeoDataFrame
- `tags` 参数：用 OSM 标签过滤，`{"amenity": "cafe"}` 表示"所有咖啡馆"
- `nearest_nodes`：给你一个任意坐标，找到图上最近的路口节点
- `nx.shortest_path`：NetworkX 内置的最短路径算法（Dijkstra），按 `length` 权重算
- `plot_graph_route`：在地图上把路线用红线标出来

---

## 还能做什么？

OSMnx 的能力远不止上面两个例子：

- **高程数据**：接入手坑数据，算每条街的坡度（对骑行、机器人导航有用）
- ** travel time**：推算每段路的行驶时间，算通勤时间
- **等时线图**：画"从某点出发 10 分钟/20 分钟/30 分钟能到多远的区域"
- **方向罗盘图**：分析城市街道的朝向分布
- **保存/加载**：把图存为 GraphML 文件，下次直接加载不用重新下载
- **交互式地图**：用 Folium 生成可以在浏览器里看的互动地图

---

## 使用限制

OSMnx 用的是 OSM 的免费 API（Nominatim 和 Overpass），有使用频率限制：

- 不要高频调用（建议两次请求之间间隔 ≥ 1 秒）
- 大数据量请求建议搭自己的 Overpass 实例
- 详细规则：[Nominatim Usage Policy](https://operations.osmfoundation.org/policies/nominatim/)

---

## 学习路线

1. **先跑通示例**：从 [OSMnx Examples Gallery](https://github.com/gboeing/osmnx-examples) 挑一个跑起来
2. **理解 NetworkX**：OSMnx 的图基于 NetworkX，了解基本图论概念会事半功倍
3. **学 GeoPandas**：处理 GeoDataFrame 是日常操作，掌握基础查询和筛选
4. **查文档**：完整 API 参考在 [osmnx.readthedocs.io](https://osmnx.readthedocs.io/en/stable/user-reference.html)

---

## 关键函数速查

| 函数 | 作用 |
|------|------|
| `ox.graph_from_place()` | 按城市/地区名下载街道网络 |
| `ox.graph_from_point()` | 按坐标+距离下载 |
| `ox.features_from_point()` | 下载兴趣点（POI） |
| `ox.basic_stats()` | 计算基础统计指标 |
| `ox.convert.graph_to_gdfs()` | 图 → GeoDataFrame |
| `ox.distance.nearest_nodes()` | 找最近的节点 |
| `ox.plot_graph()` | 绘制网络图 |
| `ox.io.save_graphml()` | 保存图到文件 |
