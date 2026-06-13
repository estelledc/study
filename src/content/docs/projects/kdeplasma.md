---
title: QGIS 零基础入门笔记
来源: https://github.com/qgis/QGIS
日期: 2026-06-13
分类: 其他
子分类: geographic-information-systems
provenance: pipeline-v3
---

# QGIS 零基础入门笔记

## 什么是 QGIS？

想象一下，你有一叠透明的胶片。第一层画着道路，第二层标着河流，第三层标注了学校的位置。把它们叠在一起放在灯箱上，你就能看到一张完整的城市地图。

QGIS（Quantum GIS）就是这样一个"透明胶片叠加系统"——只不过它是数字化的。它是一个免费、开源的桌面地理信息系统（GIS），可以在 Windows、macOS 和 Linux 上运行。

核心能力就三件事：

1. **看地图** — 把各种数据变成可视化地图
2. **改地图** — 编辑、创建地理要素（点、线、面）
3. **分析地图** — 用工具挖掘空间数据背后的规律

最新版本是 QGIS 4.0（2025 年发布），由全球社区驱动开发，采用 GNU GPLv2+ 许可证。

## 核心概念

### 1. 图层（Layer）

图层是 QGIS 最基本的组织单元。就像 Photoshop 里的图层一样，每个图层承载一种类型的地理数据：

- **矢量图层（Vector）** — 用点、线、面表示现实世界的事物。比如：城市的坐标是点，道路是线，行政区划边界是面
- **栅格图层（Raster）** — 用像素网格表示连续数据。比如：卫星影像、高程模型、温度分布图

### 2. 要素（Feature）

一个图层由多个"要素"组成。每个要素包含两部分：

- **几何信息** — 这个东西在哪里、是什么形状
- **属性信息** — 这个东西是什么、有什么特征

举个例子：一条名为"长安街"的道路要素，几何信息是它的坐标轨迹，属性信息包括名字、长度、车道数等。

### 3. 坐标系（Coordinate Reference System, CRS）

地球是圆的，地图是平的。要把球面展平到屏幕上，就需要一个"投影规则"。这就是 CRS 的作用。

- 每个图层都有自己的 CRS
- 如果两个图层 CRS 不同，QGIS 会自动进行"动态转换"把它们对齐显示
- 常用的 CRS 编码如 `EPSG:4326`（经纬度）、`EPSG:3857`（Web 地图常用）

### 4. 项目文件（.qgz / .qgs）

QGIS 的项目文件保存的是"配置"而非原始数据——哪些图层加载了、怎么着色、比例尺是多少。原始数据仍然存放在磁盘上。

### 5. 处理框架（Processing Framework）

QGIS 内置了一个强大的分析工具箱，可以把多个工具串联成自动化工作流。支持 GDAL、GRASS GIS 等第三方工具集成。

## 安装与启动

```
# macOS（通过 Homebrew）
brew install --cask qgis

# Linux（Ubuntu/Debian）
sudo apt install qgis

# Windows
# 前往 https://qgis.org/download/ 下载安装程序

# 启动
qgis
```

启动后你会看到三个主要区域：左侧是图层面板（列出所有图层），中间是地图画布（显示地图），右侧是工具面板和属性窗口。

## PyQGIS：用 Python 操控 QGIS

QGIS 内置了 Python 支持（PyQGIS），可以用脚本自动化一切操作。打开菜单 `插件` → `Python 控制台` 即可使用。

### 示例一：加载图层并查询属性

这段代码演示如何加载一个矢量图层，遍历其中的要素，打印出每个要素的属性：

```python
# 加载一个矢量图层（例如 GeoJSON 文件）
layer = iface.addVectorLayer("/path/to/cities.geojson", "城市数据", "ogr")

# 检查图层是否加载成功
if not layer:
    print("图层加载失败！")
else:
    print(f"图层名称: {layer.name()}")
    print(f"要素数量: {layer.featureCount()}")
    print(f"字段列表: {[f.name() for f in layer.fields()]}")

    # 遍历所有要素，打印名称和人口
    for feature in layer.getFeatures():
        print(f"  城市: {feature['name']}, 人口: {feature.get('population', '未知')}")
```

逐行解释：

- `iface.addVectorLayer(...)` 是 QGIS 提供的接口，第一个参数是文件路径，第二个是图层显示名，第三个是数据源类型（`ogr` 表示通用矢量格式）
- `layer.fields()` 返回所有列名，类似数据库的表头
- `layer.getFeatures()` 逐条返回要素，`feature['字段名']` 获取属性值

### 示例二：按条件筛选并高亮显示

这段代码演示如何筛选出人口超过 1000 万的城市，并在地图上高亮它们：

```python
from qgis.core import QgsSymbol, QgsRendererCategory

# 获取刚才加载的城市图层
layer = iface.activeLayer()

# 方法一：用表达式筛选（SQL 风格的 WHERE 子句）
expression = "\"population\" > 10000000"
filtered_features = layer.getFeatures(QgsFeatureRequest().setFilterExpression(expression))

large_cities = []
for feature in filtered_features:
    large_cities.append(feature['name'])

print(f"人口超 1000 万的城市: {large_cities}")

# 方法二：用符号化突出显示（按人口分级着色）
field = "population"
symbols = [
    QgsSymbol.defaultSymbol(layer.geometryType()),
    QgsSymbol.defaultSymbol(layer.geometryType()),
    QgsSymbol.defaultSymbol(layer.geometryType()),
]
categories = [
    QgsRendererCategory(0, symbols[0], "0 - 100万"),
    QgsRendererCategory(1000000, symbols[1], "100万 - 1000万"),
    QgsRendererCategory(10000000, symbols[2], "1000万以上"),
]
renderer = QgsCategorizedSymbolRenderer(field, categories)
layer.setRenderer(renderer)
layer.triggerRepaint()  # 刷新地图显示
```

关键概念：

- `QgsFeatureRequest().setFilterExpression(...)` 接受类似 SQL 的表达式，`"population" > 10000000` 中的引号是因为字段名包含特殊字符
- `QgsCategorizedSymbolRenderer` 根据字段值给不同范围的数据分配不同颜色，实现分级设色效果
- `layer.triggerRepaint()` 告诉 QGIS 重新绘制地图画布以应用新的样式

### 示例三：执行空间分析——缓冲区分析

这段代码演示如何为一个城市图层生成 50 公里缓冲区（即每个城市周围 50km 范围内的区域）：

```python
from qgis.core import QgsGeometry, QgsProject

# 获取当前活动图层
layer = iface.activeLayer()

# 创建一个新图层用于存放缓冲区结果
buffer_layer = QgsVectorLayer(
    "Polygon?crs=epsg:4326",
    "城市缓冲区_50km",
    "memory"
)

# 添加与原图层相同的属性字段
buffer_layer.dataProvider().addAttributes(layer.fields())
buffer_layer.updateFields()

# 为每个要素生成 50 公里缓冲区（注意：EPSG:4326 是经纬度单位，
# 实际项目中应切换到投影坐标系如 EPSG:3857 以获得正确的米制距离）
features = []
for feature in layer.getFeatures():
    geom = feature.geometry()
    buffer_geom = geom.buffer(50000, 5)  # 50000米，5段近似曲线
    new_feature = feature
    new_feature.setGeometry(buffer_geom)
    features.append(new_feature)

buffer_layer.dataProvider().addFeatures(features)
QgsProject.instance().addMapLayer(buffer_layer)
print(f"已生成 {len(features)} 个缓冲区")
```

这里 `geom.buffer(50000, 5)` 是核心调用——`50000` 表示缓冲半径（单位：米），`5` 表示用 5 段直线近似一段圆弧。生成的结果是一个新的内存图层，自动添加到地图中。

## 常用数据格式

| 格式 | 类型 | 说明 |
|------|------|------|
| `.shp` (Shapefile) | 矢量 | ESRI 标准格式，最广泛兼容 |
| `.geojson` | 矢量 | Web 友好，JSON 格式 |
| `.gpkg` (GeoPackage) | 矢量/栅格 | OGC 开放标准，单文件存储 |
| `.tif` (GeoTIFF) | 栅格 | 带地理信息的 TIFF 图片 |
| `.gml` | 矢量 | XML 格式的地理标记语言 |
| `.img` (ERDAS IMG) | 栅格 | 遥感影像常用格式 |

## 下一步学什么

掌握了以上概念后，建议按以下顺序深入学习：

1. **图层样式与标注** — 学习如何让地图更美观（符号选择器、标签设置、缓冲区文字）
2. **属性表操作** — 学习查询、排序、计算新字段
3. **坐标系管理** — 深入理解 CRS 选择和转换
4. **处理工具箱** — 学习使用叠加分析、缓冲区、裁剪等工具
5. **打印布局** — 制作可打印的专业地图（加图例、比例尺、指北针）
6. **插件生态** — QGIS 有数千个插件可扩展功能（https://plugins.qgis.org）

官方文档（https://docs.qgis.org）提供了非常详尽的用户手册和 PyQGIS 开发者指南，适合边查边学。
