---
title: kepler.gl — 把百万点 GIS 数据拖进浏览器就出图
来源: 'Uber Open Source, "kepler.gl: a powerful open source geospatial analysis tool", 2018'
日期: 2026-05-31
分类: 基础设施
难度: 中级
---

## 是什么

kepler.gl（**Kepler**）是 Uber 2018 年开源的**地理空间可视化工具**：把一份 CSV 或 GeoJSON 拖进浏览器，三秒内就能把上百万个经纬度点画成可缩放、可过滤、可着色的地图。日常类比：像 Excel 透视表，只不过 X 轴是地球表面，Y 轴是地球表面，单元格里塞的是一千万次出租车上下车。

底下两块发动机：

- **deck.gl**：Uber 自家的 WebGL 图层引擎，负责把数据搬到 GPU 上画
- **Mapbox / MapLibre GL**：负责底图（街道、卫星图、地形）

Kepler 的工作是把这两者粘起来，再加一层可视化的拖拽 UI。你不写 JS、不开终端，只要会拖文件就能用。

## 为什么重要

不理解 kepler.gl，下面这些事都没法解释：

- 为什么 Uber / Lyft / Foursquare 这种"动辄一天几亿条 GPS"的公司能在浏览器里实时探索数据，而不是导进 ArcGIS Pro 跑半天
- 为什么 deck.gl 这种"声明式图层"会比传统 D3 + Canvas 在大数据下扩展性强一个数量级
- 为什么"地图可视化"逐步从 GIS 专家工具下沉到产品经理也能用——拖拽 + WebGL 是关键
- 为什么浏览器里渲染百万点不再是奇迹——这背后是 WebGL instancing 把 CPU-GPU 来回的开销压到一次

## 核心要点

Kepler 把"画地图"拆成 **四件事**：

1. **图层（Layer）**：点、六边形聚合、热力、弧线、轨迹、GeoJSON 等十几种。一份数据可以叠多种图层，比如同时画"出租车上车点的热力 + 路线弧线"。

2. **GPU 数据流**：原始数据**只传 GPU 一次**，后续过滤、着色、缩放都靠 attribute / uniform 直接在 shader 里算。CPU 不再循环每个点，这是百万点 60fps 的根因。

3. **Redux 大状态**：所有过滤器、图层配置、视角进 Redux store。store 可以序列化为 JSON，变成"地图配置文件"——拷给同事，他打开就是一模一样的地图。

4. **底图 / 数据层解耦**：Mapbox（或免费替代 MapLibre）渲染底图 canvas；deck.gl 在上面叠一层透明 WebGL canvas 画数据。两层各自独立刷新，互不打架。

## 实践案例

### 案例 1：把一年行程 CSV 变成热力图

```
1. 浏览器打开 kepler.gl
2. 把 trips_2024.csv （2,000,000 行，含 lat/lng/timestamp）拖进去
3. Kepler 自动识别经纬度列，3 秒后出点图
4. 点击"+ Add Layer" → 改成 Heatmap → 调半径
5. 拖时间过滤器看一天潮汐
```

整个过程**没写一行代码**。

### 案例 2：嵌入到自家 React 应用

```jsx
import KeplerGl from '@kepler.gl/components'
import {Provider} from 'react-redux'

function App() {
  return (
    <Provider store={myStore}>
      <KeplerGl
        id="map"
        mapboxApiAccessToken={MAPBOX_TOKEN}
        width={1280}
        height={720}
      />
    </Provider>
  )
}
```

**逐部分解释**：

- `Provider` 给 Kepler 它需要的 Redux store（你也可以塞业务 reducer 进去共用）
- `mapboxApiAccessToken` 是底图 token，免费版有限速，迁 MapLibre 可去掉
- 整个 Kepler UI 就是一个 React 组件，能放进任何 dashboard

### 案例 3：导出配置给同事

Kepler 右上角"Share → Export Map"导出 JSON，里面是 `{datasets, config}` 两块。同事拿到 JSON：

```js
dispatch(addDataToMap({datasets, config}))
```

立刻还原一模一样的视图。这个能力让"地图当配置传"成为可能，也是 BI 工具该有的样子。

### 案例 4：弧线图看跨城市迁徙

把"出发城市经纬度 + 到达城市经纬度"两列数据加进 Kepler，选 Arc Layer：

```
1. 上传 migration.csv （含 src_lat / src_lng / dst_lat / dst_lng）
2. Add Layer → Arc → 选起点列、终点列
3. 弧的颜色绑定"流向人数"，粗细绑定"日均班次"
```

百万条弧线在 GPU 里画成一团光路，缩放、旋转都不卡。同样的事用 D3 + SVG 做，5 万条就开始卡顿。

## 踩过的坑

1. **Mapbox token 限速** — 免费版超量后底图直接白屏，看 console 才发现 401。生产环境最好换 MapLibre + 自托管 tile server，没限速也不用付费。

2. **百万点是上限不是起点** — 官方宣传"百万点流畅"是真的，但**超过 5M 点**浏览器堆内存吃满，标签页崩溃。真正大数据要先在后端聚合（H3 六边形 / Tile38）再传前端。

3. **Redux store 体积爆炸** — 几百万行数据进 store，直接 `JSON.stringify` 可能 > 100MB。导出配置要做 schema 裁剪：只存 `config`（图层定义），数据走另外的下载链接。

4. **自定义图层要会 deck.gl** — 改 Kepler 配置只能调它内置图层；想画特殊形状（比如 3D 建筑挤出）必须懂 deck.gl 的 `Layer` 类、shader 模板、attribute 上传——学习曲线比 Kepler UI 陡得多。

5. **时间字段格式坑** — Kepler 用 `moment.js` 解析时间列，毫秒 / 秒 / ISO 字符串都识别，但**时区**默认按浏览器本地。混合了 `UTC` 和本地时间的数据会画错时间过滤器位置。建议导入前统一成 ISO 8601 + 显式 Z 后缀。

## 适用 vs 不适用场景

**适用**：

- 探索性地理数据分析（EDA）：50K-2M 点的 CSV / GeoJSON
- 嵌入产品做"地图模块"，让非技术用户拖一拖
- 需要跨团队传可复现的地图视图（导出 JSON）
- 时间序列地理数据的潮汐 / 动画展示

**不适用**：

- 超过 5M 点 — 必须后端聚合或换 Vector Tile 方案
- 需要复杂 GIS 分析（缓冲区、空间连接、栅格运算）— 用 PostGIS / QGIS
- 离线打印地图 — Kepler 是交互式工具，导出图片质量一般
- 要严格的版本控制 / 协作 — 它没有 Git 风格的协作，只能导出 JSON

## 历史小故事（可跳过）

- **2018 年 5 月**：Uber 在 FOSS4G NA 大会上开源 Kepler，作者团队在 SF 的可视化组
- **2019 年**：捐给 Linux Foundation 的 Urban Computing Foundation，与 deck.gl 同家
- **2021 年**：独立站点 kepler.gl 上线，归 OpenJS Foundation 治理
- **2024 年 v3**：大重构——全 TypeScript、MapLibre 一等支持、模块拆成可独立装的 npm 包

之后 Kepler 成了"地理可视化"领域的事实默认选项之一，与 CARTO / Mapbox Studio 三分天下。

## 学到什么

1. **拖拽 UI + WebGL 后端** 是把专业工具下沉的标准配方——BI 工具走过的路，地图工具又走一遍
2. **声明式图层 > 命令式绘图**：deck.gl 的 `Layer` 抽象让"百万点 60fps"变成默认能力，不靠手写优化
3. **状态可序列化** 是产品级可视化工具的护城河——能把视图当配置传才有协作价值
4. **底图 / 数据层解耦** 让两层各自演进：Mapbox 改样式不影响数据层，反之亦然

## 延伸阅读

- 官网交互 demo：[kepler.gl](https://kepler.gl)（直接拖文件试）
- 开源仓库：[uber/kepler.gl on GitHub](https://github.com/keplergl/kepler.gl)
- deck.gl 文档：[deck.gl](https://deck.gl)（理解 GPU 图层抽象的钥匙）
- [[deck-gl]] —— Kepler 的渲染发动机
- [[mapbox-gl]] —— 底图引擎
- [[h3-uber]] —— Uber 的六边形索引，常与 Kepler 搭配做大数据聚合
