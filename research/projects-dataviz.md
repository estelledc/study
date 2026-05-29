---
title: 项目候选 — 数据可视化
日期: 2026-05-29
---

# 数据可视化 项目候选

候选 60 个，按子类分组（图表库 6 / 声明式语法 Vega 系 5 / 统计科学 Python 5 / 地图 GIS 6 / 笔记本 Dashboard BI 应用 6 / 网络图 图论 6 / 时间线 Gantt 4 / 流程图 白板 节点编辑器 5 / 数据网格 表格 5 / 自助 BI 报表平台 5 / PDF 打印 报表生成 4 / AntV 移动 大屏 3）。

已过滤 study 站现存 5 个数据可视化主题：`d3` / `echarts` / `observable-plot` / `recharts` / `visx`。同时跳过已收录在 `projects-graphics.md` 候选的 WebGL/3D 通用层（`threejs` / `deck-gl` / `regl` / `twgl` / `luma-gl` / `babylonjs`）和 `projects-editors.md` 候选的笔记本（`jupyter-notebook` / `jupyterlab` / `marimo`）。本表只收"图表 / 地图 / 仪表板 / 网络 / 表格 / BI / 报表 / 流程图 / 时间线"等成品工具与运行时。

闭源（Tableau / Power BI / Looker / Spotfire / Qlik / DataDog Dashboards / 高德地图 SDK / 百度地图 SDK / GoJS 商业版 / FineBI / FineReport / DataV 等）一律跳过。Stars 量级为 2025-2026 区间近似值，仅作影响力参考；许可证以仓库声明为准（部分项目核心 OSS、企业版闭源，会在备注中注明）。

## 图表库（6 个）

| Slug | 项目 | Stars 量级 | 一句话价值 | URL |
|---|---|---|---|---|
| `plotly-js` | Plotly.js — 浏览器端交互图表全家桶 | ~17k | 40+ 图表类型 + 缩放/悬停/导出，Python/R/Julia 同名库共用同一份 schema | https://github.com/plotly/plotly.js |
| `chart-js` | Chart.js — Canvas 渲染入门级图表 | ~64k | 8 种基础图 + 极简 API + 响应式 + 插件机制，前端首选教学库 | https://github.com/chartjs/Chart.js |
| `nivo` | nivo — React + d3 组件化图表 | ~13k | SSR 友好、Storybook 文档完备，把 d3 包装成"props 驱动"的 React 组件 | https://github.com/plouc/nivo |
| `chartist` | Chartist — 极简 SVG 图表 | ~13k | 无依赖 + 响应式 + CSS 主题化，对照 Chart.js 学 SVG vs Canvas 渲染差异 | https://github.com/chartist-js/chartist |
| `amcharts5` | amCharts 5 — TypeScript 重写的商业级库 | ~1.1k | 主题系统 + 时序 / 股票 / 地图全覆盖，开源核心 + 商业 logo 商用 | https://github.com/amcharts/amcharts5 |
| `billboard-js` | billboard.js — Naver 出品的 d3 v7 封装 | ~5.7k | 在 c3.js 停滞后接续，TS 重写 + 大量 example，企业看板常用 | https://github.com/naver/billboard.js |

## 声明式语法 / Vega 系（5 个）

| Slug | 项目 | Stars 量级 | 一句话价值 | URL |
|---|---|---|---|---|
| `vega` | Vega — JSON 描述的可视化语法 | ~11k | UW 出品的 grammar of graphics 实现，Observable Plot / Vega-Lite 都构建在它之上 | https://github.com/vega/vega |
| `vega-lite` | Vega-Lite — 高层声明式可视化语法 | ~4.7k | 把 mark / encoding / transform 三段式收口为最小 JSON，几行写出复合图 | https://github.com/vega/vega-lite |
| `altair` | Altair — Python 上的 Vega-Lite 绑定 | ~9.6k | "PyData 版 ggplot"，链式 API 编译为 Vega-Lite spec，在 Jupyter 里即所见即所得 | https://github.com/vega/altair |
| `plotnine` | plotnine — Python 复刻 R 的 ggplot2 | ~4.1k | 严格按 Hadley Wickham 的 grammar of graphics 实现，统计师无缝迁移 | https://github.com/has2k1/plotnine |
| `antv-g2` | AntV G2 — 阿里出品的语法可视化 | ~12k | 把 Wilkinson grammar 落到 JS，G2Plot / G6 / X6 都基于它，中文社区最完整 | https://github.com/antvis/G2 |

## 统计 / 科学 Python（5 个）

| Slug | 项目 | Stars 量级 | 一句话价值 | URL |
|---|---|---|---|---|
| `matplotlib` | matplotlib — Python 绘图基石 | ~20k | pyplot / Figure / Axes 三层 API，所有 Python 数据科学论文图表的源头 | https://github.com/matplotlib/matplotlib |
| `seaborn` | seaborn — 统计图表高层封装 | ~13k | 基于 matplotlib，把箱线图 / 热力图 / 分类图统一成一行调用 | https://github.com/mwaskom/seaborn |
| `bokeh` | Bokeh — 浏览器端交互式 Python 图 | ~19k | 输出 BokehJS 渲染，可挂 Server 做实时数据流，对照 Plotly 学 Pythonic 交互范式 | https://github.com/bokeh/bokeh |
| `plotly-py` | Plotly.py — Plotly.js 的 Python 端 | ~16k | DataFrame 直接 → JSON spec，跟 Dash 配套做企业内部仪表板 | https://github.com/plotly/plotly.py |
| `holoviews` | HoloViews — "数据即可视化"的高阶库 | ~2.7k | 一行声明 → matplotlib / Bokeh / Plotly 多后端切换，研究界探索性分析常用 | https://github.com/holoviz/holoviews |

## 地图 / GIS（6 个）

| Slug | 项目 | Stars 量级 | 一句话价值 | URL |
|---|---|---|---|---|
| `leaflet` | Leaflet — 轻量交互式地图 | ~41k | 38KB 核心 + 插件生态，OSM 默认前端，移动端友好的事实标准 | https://github.com/Leaflet/Leaflet |
| `openlayers` | OpenLayers — 全功能 GIS 前端 | ~11k | WebGL + Canvas + SVG 多渲染层，GIS 工程师选项之一，比 Leaflet 重但更专业 | https://github.com/openlayers/openlayers |
| `mapbox-gl-js` | Mapbox GL JS — 矢量瓦片 + WebGL 地图 | ~12k | v2+ 转商业许可证，但学习矢量瓦片 / style spec 仍是黄金教材 | https://github.com/mapbox/mapbox-gl-js |
| `maplibre-gl` | MapLibre GL — Mapbox 的 OSS 分叉 | ~6.7k | 在 Mapbox 改 license 后社区分叉，BSD-3 + 完整兼容 style spec，矢量地图新事实标准 | https://github.com/maplibre/maplibre-gl-js |
| `cesium` | CesiumJS — 三维地球 / 地理信息可视化 | ~13k | 基于 WebGL 的 3D 地球 + 时间动画 + glTF 模型，国家空管 / 卫星轨迹常用 | https://github.com/CesiumGS/cesium |
| `kepler-gl` | kepler.gl — Uber 大规模地理数据探索 | ~10.6k | 基于 deck.gl + Mapbox，把上百万点的 GIS 数据做成拖拽式探索界面 | https://github.com/keplergl/kepler.gl |

## 笔记本 / Dashboard / BI 应用（6 个）

| Slug | 项目 | Stars 量级 | 一句话价值 | URL |
|---|---|---|---|---|
| `streamlit` | Streamlit — Python 几行写 Web 应用 | ~38k | `st.write` / `st.slider` 把脚本变 web app，AI demo / 内部工具最快路径 | https://github.com/streamlit/streamlit |
| `gradio` | Gradio — ML 模型 demo 框架 | ~36k | HuggingFace 收购，5 行代码暴露模型为 web，Spaces 平台底层 | https://github.com/gradio-app/gradio |
| `dash` | Dash — Plotly 的 Python 仪表板框架 | ~22k | React + Flask 双层，企业 BI 替代 Tableau 的常见路径，Dash Enterprise 商业化 | https://github.com/plotly/dash |
| `panel` | HoloViz Panel — 多后端 Python dashboard | ~5.2k | 同时支持 Bokeh / Plotly / matplotlib / Vega，探索性 + 生产可部署的中间路线 | https://github.com/holoviz/panel |
| `voila` | Voila — 把 Jupyter Notebook 变 web app | ~5.5k | 隐藏 cell 只保留输出，最低成本把现有 Notebook 发布给非技术用户 | https://github.com/voila-dashboards/voila |
| `observable-framework` | Observable Framework — 静态站数据应用 | ~2.9k | 把 Observable Notebook 思想搬到本地 Markdown，编译期跑 SQL/Python，零后端 | https://github.com/observablehq/framework |

## 网络图 / 图论可视化（6 个）

| Slug | 项目 | Stars 量级 | 一句话价值 | URL |
|---|---|---|---|---|
| `cytoscape-js` | Cytoscape.js — 图论可视化与分析库 | ~10.5k | 100+ 内置布局 + 完整图算法 API，生物信息 / 知识图谱学术标配 | https://github.com/cytoscape/cytoscape.js |
| `vis-network` | vis-network — 物理引擎驱动的网络图 | ~3k | barnesHut / 弹簧布局 + 拖拽，vis.js 家族中最稳定的子项目 | https://github.com/visjs/vis-network |
| `sigma-js` | Sigma.js — 大规模图渲染（WebGL） | ~11k | 专攻"上万节点仍流畅"，配合 graphology 做交互探索 | https://github.com/jacomyal/sigma.js |
| `graphology` | graphology — JS 图数据结构与算法库 | ~1.3k | "可视化无关"的 Graph 类 + Pagerank / 社区检测，Sigma.js 默认搭档 | https://github.com/graphology/graphology |
| `3d-force-graph` | 3d-force-graph — 三维力导向图 | ~3k | three.js + d3-force，把网络拓扑搬到 3D 空间，节点 / 边 / 标签都可定制 | https://github.com/vasturiano/3d-force-graph |
| `antv-g6` | AntV G6 — 阿里图可视化引擎 | ~12k | 内置 30+ 布局 + 行为系统，国内知识图谱 / 关系挖掘项目首选 | https://github.com/antvis/G6 |

## 时间线 / Gantt（4 个）

| Slug | 项目 | Stars 量级 | 一句话价值 | URL |
|---|---|---|---|---|
| `vis-timeline` | vis-timeline — 可拖拽时间线组件 | ~1.4k | 项目时间线 / 日程 / 历史事件三合一，自带分组与缩放 | https://github.com/visjs/vis-timeline |
| `frappe-gantt` | Frappe Gantt — 极简 SVG Gantt | ~5.5k | 200 行核心，ERPNext 母公司出品，是入门 Gantt 数据结构的最佳样本 | https://github.com/frappe/gantt |
| `dhtmlx-gantt` | DHTMLX Gantt — 全功能 Gantt 组件 | ~2k | GPL + 商业双许可，依赖 / 关键路径 / 工时 / 资源齐全，对照 Frappe 看复杂度 | https://github.com/DHTMLX/gantt |
| `timelinejs` | TimelineJS — Northwestern 新闻时间线 | ~10k | Knight Lab 出品，Google Sheet 直接驱动，新闻报道 / 教学项目常见 | https://github.com/NUKnightLab/TimelineJS3 |

## 流程图 / 白板 / 节点编辑器（5 个）

| Slug | 项目 | Stars 量级 | 一句话价值 | URL |
|---|---|---|---|---|
| `mermaid` | Mermaid — Markdown 风格图表 DSL | ~74k | 流程图 / 时序图 / ER / Gantt / 思维导图，GitHub README 原生支持 | https://github.com/mermaid-js/mermaid |
| `react-flow` | React Flow / xyflow — 节点编辑器框架 | ~26k | LangChain / Dify / n8n 同款，做 AI 工作流 / 数据管道编辑器的事实选择 | https://github.com/xyflow/xyflow |
| `drawio` | drawio (diagrams.net) — 离线版 Visio | ~42k | mxGraph 内核，本地 / 浏览器 / 桌面 全形态，作为 BPMN / UML 工具教学起点 | https://github.com/jgraph/drawio |
| `tldraw` | tldraw — Web 白板与画布 SDK | ~38k | 完整白板交互范式 + AI 集成示例 + SDK 模式，新一代 Excalidraw 替代 | https://github.com/tldraw/tldraw |
| `flowchart-js` | flowchart.js — 文本生成流程图 | ~3.7k | 比 Mermaid 老的 ASCII 风 DSL，源码不到 2000 行，看"如何把文本编译成 SVG" | https://github.com/adrai/flowchart.js |

## 数据网格 / 表格（5 个）

| Slug | 项目 | Stars 量级 | 一句话价值 | URL |
|---|---|---|---|---|
| `ag-grid` | AG Grid Community — 高性能数据网格 | ~13k | MIT 核心 + 企业版，百万行虚拟滚动 + 透视表，金融行业事实标准 | https://github.com/ag-grid/ag-grid |
| `glide-data-grid` | Glide Data Grid — Canvas 渲染网格 | ~4k | Glide.com 出品，6kHz 滚动 + 富单元格，对照 ag-grid 学 Canvas vs DOM 取舍 | https://github.com/glideapps/glide-data-grid |
| `handsontable` | Handsontable — 类 Excel 数据表格 | ~20k | 公式引擎 + 合并单元格 + 撤销栈，AGPL/商业双许可，是"web 版 Excel"教科书 | https://github.com/handsontable/handsontable |
| `tabulator` | Tabulator — 纯 JS 交互式表格 | ~7k | 30+ 列类型 + 编辑 + 树形 + 分组，无依赖，企业内部工具最低门槛选项 | https://github.com/olifolkerd/tabulator |
| `canvas-datagrid` | canvas-datagrid — 单 Canvas 网格 | ~1.4k | 全部用一张 Canvas 实现行列 / 选区 / 编辑，看"为何要这样画"绝佳样本 | https://github.com/TonyGermaneri/canvas-datagrid |

## 自助 BI / 报表平台（5 个）

| Slug | 项目 | Stars 量级 | 一句话价值 | URL |
|---|---|---|---|---|
| `superset` | Apache Superset — 开源 BI 平台 | ~63k | Airbnb 出品后捐 ASF，SQL Lab + 30+ 可视化 + 多数据源，对标 Tableau | https://github.com/apache/superset |
| `metabase` | Metabase — 让非技术人查数 | ~39k | "Question + Dashboard"模型，问答式查 SQL，中小团队入门 BI 首选 | https://github.com/metabase/metabase |
| `redash` | Redash — SQL 查询与仪表板 | ~26k | 50+ 数据源 + Query 调度 + Alert，被 Databricks 收购但仓库仍 OSS 维护 | https://github.com/getredash/redash |
| `lightdash` | Lightdash — 基于 dbt 的现代 BI | ~3.5k | 在 dbt model 上直接定义 metric / dimension，把数据建模和可视化合并 | https://github.com/lightdash/lightdash |
| `evidence` | Evidence — Markdown + SQL 静态报告 | ~5k | 写 .md + 嵌 SQL → 编译为静态站，分析师友好的"BI as code"范式 | https://github.com/evidence-dev/evidence |

## PDF / 打印 / 报表生成（4 个）

| Slug | 项目 | Stars 量级 | 一句话价值 | URL |
|---|---|---|---|---|
| `pdfmake` | pdfmake — JSON DSL 描述 PDF | ~12k | 跨浏览器 / Node 输出 PDF，把表格 / 列 / 字体 / 页眉抽象为对象树 | https://github.com/bpampuch/pdfmake |
| `pdfkit` | PDFKit — Node.js 经典 PDF 库 | ~10k | 命令式 API（绘制矢量 / 文本 / 图像），是 pdfmake 的底层选项之一 | https://github.com/foliojs/pdfkit |
| `jspdf` | jsPDF — 浏览器端生成 PDF | ~30k | "前端导出 PDF"事实库，搭配 html2canvas 做 DOM → PDF 截图最常用 | https://github.com/parallax/jsPDF |
| `pdfme` | pdfme — TypeScript 模板化 PDF | ~3.8k | 模板编辑器 + 表单填充 + Designer 组件，电商 / 财务发票场景上手最快 | https://github.com/pdfme/pdfme |

## AntV / 移动 / 大屏（3 个）

| Slug | 项目 | Stars 量级 | 一句话价值 | URL |
|---|---|---|---|---|
| `antv-f2` | AntV F2 — 移动端可视化方案 | ~8k | 5KB 核心，专门针对手机的 Canvas 图表，G2 同语法在移动端的子集 | https://github.com/antvis/F2 |
| `antv-x6` | AntV X6 — 图编辑引擎 | ~10k | 把 mxGraph 思路移植到 JS，BPMN / DAG / ER 编辑器底层，配合 G6 看图算法 + 编辑器分层 | https://github.com/antvis/X6 |
| `apexcharts` | ApexCharts — 现代交互式 SVG 图表 | ~14k | 自带响应式 + 注解 + Sparkline，配 Vue/React/Angular wrapper 完备 | https://github.com/apexcharts/apexcharts.js |

## 备选 / 后续可补

下列项目质量同样在线，本轮配额已满或与已选有相邻替代关系，可作为替补：

- **图表库**：`apache-ecahrts-extension`（已通过 echarts 覆盖）/ `g2plot`（AntV G2 高层封装 ~2.5k）/ `lightweight-charts`（TradingView 金融图 ~10k）/ `victory`（Formidable React 图表 ~11k）/ `chartjs-react`（社区 wrapper）
- **声明式 / Vega 系**：`lets-plot`（Kotlin 多语言 ggplot ~1.6k）/ `vega-fusion`（DataFusion 后端加速 Vega）/ `mosaic-core`（UW 新交互式数据语法）
- **统计 Python**：`pandas-profiling` / `ydata-profiling`（自动报告 ~13k）/ `missingno`（缺失值矩阵 ~4k）/ `joypy`（脊线图 ~600）/ `pygal`（SVG ~2.7k）
- **地图**：`arcgis-js-api`（Esri 闭源跳过）/ `tangram`（mapzen 矢量地图 ~2k 已归档）/ `react-map-gl`（Uber Mapbox 包装 ~8k）/ `pixi-overlay`（Leaflet + PixiJS 大规模散点）
- **Dashboard**：`streamlit-component-template`（教学框架）/ `holoviz-bokeh-server`（已含于 Bokeh）/ `panel-react`（Panel 组件库实验）/ `solara`（React 风 Python UI ~2k）/ `reflex`（曾名 Pynecone ~22k）
- **网络图**：`vivagraphjs`（前 sigma.js 作者新尝试 ~3.7k）/ `react-force-graph`（vasturiano 全家桶 React 版）/ `gephi-lite`（浏览器版 Gephi ~1k）/ `arbor-js`（停滞）
- **时间线 / Gantt**：`gantt-task-react`（React Gantt ~1k）/ `gantt-schedule-timeline-calendar`（AGPL 大全）/ `react-google-charts`（Google Charts 包装）
- **流程图 / 白板**：`elkjs`（Eclipse Layout Kernel JS 移植 ~1.6k）/ `dagre`（DAG 自动布局 ~2.5k 已归档）/ `bpmn-js`（BPMN 2.0 ~8k）/ `gojs-samples`（商业）
- **数据网格**：`material-react-table`（MUI 表格 ~1.5k）/ `revogrid`（虚拟列表 ~3k）/ `mui-x-data-grid`（商业版）/ `vue-good-table`
- **BI / 报表**：`preset-cli`（Superset 配套）/ `cube`（语义层 ~17k）/ `growthbook`（实验平台 ~6k，含分析视图）/ `briefer`（笔记本 + 仪表板）
- **PDF / 报表**：`puppeteer-pdf`（DOM → PDF 通用方案）/ `gotenberg`（Chrome headless 服务化 ~6k）/ `react-pdf`（React → PDF ~14k）/ `wkhtmltopdf`（已归档）

## 选取与避坑说明

- **重复检查**：与 `src/content/docs/projects/*.md` 的 200 个现存 slug 做过 diff，本表 60 个 slug 全部新增，与已有 d3 / echarts / observable-plot / recharts / visx / sharp / jimp / fabric-js / konva / pixi / excalidraw / penpot / lottie / gsap / framer-motion / react-spring / motion-one / anime / sortablejs / dnd-kit 等无重叠。`projects-graphics.md` 候选已收录的 threejs / deck-gl / regl / luma-gl / twgl / babylonjs 也未重复入选。
- **图表 vs 渲染框架边界**：图表库（A 节）= 给定数据画统计图；声明式语法（B 节）= 把图表抽象成 spec，编译到 A 节的库去画；统计 Python（C 节）= 数据科学栈里负责绘图的部件。学习路径推荐 A → B → C，先看 chart-js / nivo 这类"用就完了"的库，再读 Vega-Lite spec 学声明式范式，最后回到 matplotlib / plotnine 看 grammar of graphics 在 Python 落地。
- **闭源排除**：Tableau / Power BI / Looker / Spotfire / Qlik / 高德 / 百度 / DataV / FineReport / FineBI / GoJS 商业版 / DHTMLX 企业版 / amCharts 商业 / Handsontable 商业 / AG Grid Enterprise / Mapbox v2+ / ArcGIS / Procreate / Sketch 等一律不收。Mapbox GL JS v1 是 BSD，v2+ 改了协议但仓库代码仍 OSS 可读，作为"对照 MapLibre 学协议变更"样本保留。
- **AGPL / GPL 项目**：DHTMLX Gantt / Handsontable / Apache Superset / Metabase / Lightdash / Evidence / drawio / tldraw 等含 AGPL 或 GPL 条款，自学没问题，写词条时需要标明许可证（学习站不考虑商用，只为提醒读者）。
- **归档项目处理**：vis-timeline / vis-network 来自 vis.js 主仓库拆分后的子模块，主仓库已停滞但子项目仍维护；TimelineJS3 来自 Knight Lab 学院项目，更新频率不高但教学样本完整；canvas-datagrid 维护者主要是单人但代码质量高。属于"成熟但低活跃"的教学样本，保留收录。
- **冷门控制**：所有候选都能搜到中文 / 英文一手文档 + 设计 blog / paper / 项目 wiki，可写 130-200 行入门词条。其中 d3（已收）/ echarts（已收）/ Mermaid / matplotlib / Streamlit / Leaflet / Cesium / Superset / Metabase / AntV G2 是中文社区资料最丰富的几项，可作为子主题首发。
- **跨主题归属**：threejs / babylonjs / deck-gl / luma-gl / regl 这些 WebGL/3D 通用层放在 graphics 主题更合理，本表只保留 `3d-force-graph` 和 `cesium` 这种"3D 专门用于数据展示"的项目。`kepler-gl` 实际依赖 deck-gl，但其交互界面才是数据可视化主题学习的对象，与底层 deck-gl 不冲突。
- **学习路径建议**：图表方向 → chart-js → plotly-js → echarts → d3 看底层；声明式方向 → Vega-Lite → Vega → AntV G2 → ggplot2 / plotnine；地图方向 → Leaflet → MapLibre → kepler-gl → Cesium 走 2D 到 3D；笔记本 / BI 方向 → Streamlit → Dash → Superset / Metabase 看从快速 demo 到企业 BI 的演进；流程图 / 白板方向 → Mermaid → React Flow → tldraw / drawio。
