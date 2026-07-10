---
title: Konva — 给 HTML5 Canvas 装一棵会响应的节点树
来源: 'https://github.com/konvajs/konva'
日期: 2026-05-30
分类: 前端图形 / Canvas 2D
难度: 中级
---

## 是什么

Konva 是一个在 HTML5 Canvas 上重建"对象模型"的 JavaScript 框架。日常类比：原生 Canvas 是一块**一次性白板**——你画了红方块就剩下"一些红色像素"，浏览器记不住"这是一个红方块"；Konva 给这块白板**配了一份花名册**，每个图形都有名字、有事件、能被找到、能被拖拽。

你写：

```js
const stage = new Konva.Stage({ container: 'app', width: 800, height: 600 });
const layer = new Konva.Layer();
const rect = new Konva.Rect({ x: 10, y: 10, width: 100, height: 100, fill: 'red', draggable: true });
layer.add(rect); stage.add(layer);
rect.on('click', () => console.log('点中了'));
```

四行就拿到一个**能拖、能点、能查**的红方块。原生 Canvas 想做同样的事，需要自己维护一个"逻辑模型 + 像素呈现"的双向同步——这正是 Konva 替你做的事。

## 为什么重要

- 不理解 Konva，做"在线设计工具 / 白板 / 签名板 / 图像编辑器"会撞同一面墙：Canvas 没有"对象"，点击和拖拽都得自己造轮子
- 不理解"Layer = 一个独立 canvas"，会把所有东西画在一层上，性能掉到 10fps 还找不到原因
- 不理解 react-konva 是"自定义 reconciler"，会以为它和 React DOM 一样而到处踩 ref 的坑
- 不理解 hit detection 用的是隐藏 canvas + 颜色编码，关不掉就一直多花一倍渲染时间

## 核心要点

1. **节点树四层**：Stage（一个 div，分发事件）→ Layer（一个 canvas，性能边界）→ Group（逻辑分组，不画东西）→ Shape（叶子图形）。类比家庭住址：省 → 市 → 街区 → 门牌。

2. **Layer 是性能开关**：每个 Layer 是真实 `<canvas>`，浏览器在 GPU 上合成各 Layer。把"不动的背景 / 高频变的主体 / 选中框 UI"分到 3 个 Layer，一个 Layer 重绘不会拖累另两个。但 Layer ≤ 5，多了反而拖性能。

3. **事件像 DOM 但不是 DOM**：Shape → Group → Layer → Stage 的冒泡路径，写起来和 DOM 一样；但底层是 Konva 自己用一张**隐藏 canvas + 颜色编码**做的命中检测——不需要交互的层用 `listening(false)` 关掉能省一半渲染。

4. **batchDraw 默认开**：循环里改 100 个属性别调 100 次 `draw()`，调一次 `batchDraw()` 让 Konva 用 `requestAnimationFrame` 合并成下一帧的一次重绘。

## 实践案例

### 案例 1：拖拽 + 选中 + 变换控制器

```js
const stage = new Konva.Stage({ container: 'app', width: 800, height: 600 });
const layer = new Konva.Layer(); stage.add(layer);
const rect = new Konva.Rect({ x: 50, y: 50, width: 100, height: 100, fill: '#3b82f6', draggable: true });
const tr = new Konva.Transformer();
layer.add(rect, tr);
rect.on('click', () => tr.nodes([rect]));    // 点中后绑定变换器
stage.on('click', (e) => { if (e.target === stage) tr.nodes([]); });  // 点空白取消
```

`Konva.Transformer` 是开箱即用的**8 个控制点 + 旋转把手**；`draggable: true` 一行开拖拽。原生 Canvas 这两个加起来要写 200 行。

### 案例 2：多 Layer 拆性能

```js
const bgLayer = new Konva.Layer(); bgLayer.listening(false);  // 背景层不响应事件
const mainLayer = new Konva.Layer();                          // 主体频繁变
const uiLayer = new Konva.Layer();                            // 选中框 UI 单放
stage.add(bgLayer, mainLayer, uiLayer);
bgLayer.add(grid); bgLayer.draw();        // 画一次，之后不动
// 拖动主体只重绘 mainLayer，bgLayer 不参与
```

`listening(false)` 让 bgLayer 不画 hit canvas，渲染开销直接砍半。这是大场景白板的标配模式。

### 案例 3：react-konva 拿实例做命令式操作

```jsx
import { Stage, Layer, Rect, Transformer } from 'react-konva';
function App() {
  const rectRef = useRef(null);
  const trRef = useRef(null);
  const [selected, setSelected] = useState(false);
  useEffect(() => {
    if (selected && trRef.current && rectRef.current) {
      trRef.current.nodes([rectRef.current]);   // 必须 ref 拿 instance
      trRef.current.getLayer().batchDraw();
    }
  }, [selected]);
  return (<Stage width={800} height={600}><Layer>
    <Rect ref={rectRef} x={10} y={10} width={100} height={100} fill="red" onClick={() => setSelected(true)} />
    <Transformer ref={trRef} />
  </Layer></Stage>);
}
```

react-konva 的"声明式表象 + 命令式底子"在 Transformer 这种地方漏出来——所有可选中节点都要走 ref + useEffect + nodes() + batchDraw 这一套。

## 踩过的坑

1. **Layer 超过 5 个反而掉帧**：每个 Layer 是真 canvas，GPU 合成层多了浏览器吃不消。官方建议 ≤ 3-5，超了就该用 Group 合并而不是再开 Layer。

2. **react-konva 默认是非 strict**：只把 render 里**真变化**的 props 写回节点；大场景靠这点省更新。若要强制每次对齐全部 props，用 `import { useStrictMode } from 'react-konva'; useStrictMode(true)`——代价是拖拽等命令式改动会被下一轮 render 的 props 覆盖回去。

3. **滤镜必须先 `cache()`**：`Konva.Filters.Blur` 等需要 ImageData，没 cache 直接挂滤镜不显示也不报错；但文本节点 cache 后字体抗锯齿会变糊。

4. **触摸事件被映射成假鼠标事件**：`click` / `mousedown` 在移动端 tap / touchstart 也会触发，但**双指捏合 / hover** 不在这套里——要监听原生 `touchstart/touchmove` 自己算手势。

## 适用 vs 不适用场景

**适用**：

- 在线设计工具（海报 / 名片 / 简历模板）、白板 / 思维导图 / 流程图
- 图像编辑器的基础裁剪 / 滤镜 / 标注、签名板 / 涂鸦
- 节点边超出 SVG 性能上限的关系图（500+ 节点）
- React/Vue 应用里的复杂 canvas 模块（生态成熟）

**不适用**：

- 极简手绘（如 Excalidraw 那种）→ 直接 rough.js + 原生 canvas，框架反而是负担
- Photoshop 级图像处理（笔刷 / 图层混合 / 智能选区）→ PixiJS + WebGL
- 重选择交互、要"开箱即用变换框"→ [[fabric-js]] 上手更快
- 真 3D / 游戏 → Three.js / PixiJS

## 历史小故事（可跳过）

- **2011 年**：Eric Rowell 发布 KineticJS，是 HTML5 Canvas 早期的"节点树"框架先驱之一
- **2014 年**：Anton Lavrenov fork KineticJS 改名 Konva，独立维护至今
- **2020 年前后**：从 ES5 重写成 TypeScript，类型可推、IDE 友好
- **同期**：作者自己用 Konva 做了 Polotno（在线设计工具，Canva 替代），相当于把它当自家产品的反复打磨场
- 现在 GitHub ~11.7k star、npm 周下载 ~600k，是 Canvas 2D 节点树框架里活跃度最高的之一

## 学到什么

1. **Canvas 2D 缺一个对象模型**——这是所有"高级 Canvas 应用"的痛点起点，Konva 给的就是这个补丁
2. **"Layer = canvas"** 是性能调优的全部出发点：分层 = 减少不必要的重绘 + 借浏览器 GPU 合成
3. **React 集成不是真 React**——react-konva 用自定义 reconciler 把节点变组件，遇到命令式 API 必须 ref 兜底
4. **框架选型看场景**：重选择 / 默认变换框选 fabric.js；多 Layer / React 重交互选 Konva；极简手绘别上框架

## 延伸阅读

- 官方文档：[konvajs.org](https://konvajs.org)（教程式，配可运行 demo）
- React 包装：[react-konva 仓库](https://github.com/konvajs/react-konva)
- 作者商业产品：[Polotno](https://polotno.com)（Konva 自己的最佳实践参考）
- [[fabric-js]] —— Konva 最直接的对手，单 canvas + 对象列表心智
- [[d3]] —— SVG 路线的可视化框架，命题不同但常被对比
- [[anime]] —— 动画引擎，可以驱动 Konva 节点的属性补间

## 关联

- [[fabric-js]] —— 同为 Canvas 2D 框架，单 canvas 心智、自带变换框，重叠 80%
- [[d3]] —— SVG 路线，节点超 500 后让位给 Konva
- [[echarts]] —— 图表库，底层也用 Canvas 但不暴露节点 API
- [[anime]] —— 通用动画引擎，可与 Konva.Tween 互补
- [[dnd-kit]] —— React 拖拽 toolkit，DOM 路线，和 Konva 的 draggable 是两个世界
- [[storybook]] —— 调 Konva 组件视觉时常用的隔离环境
- [[playwright]] —— canvas 应用做端到端测试的常用工具

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[anime]] —— anime.js — 一行 JS 让网页元素按时间线动起来
- [[cocos2d-x]] —— Cocos2d-x — 一份 C++ 代码把 2D 手游跑遍 iOS / Android
- [[d3]] —— D3.js — 不是图表库，是写图表库的乐高
- [[dnd-kit]] —— dnd-kit — React 现代拖拽 toolkit
- [[echarts]] —— Apache ECharts — 给一个 JSON 就能画图的可视化库
- [[excalidraw]] —— Excalidraw — 手绘风协作白板
- [[fabric-js]] —— Fabric.js — 给 Canvas 加一层"对象模型"，让画布图形可以拖
- [[pixi]] —— PixiJS — 浏览器里画 2D 的高性能 GPU 引擎
- [[playwright]] —— Playwright — 跨浏览器自动化测试
- [[react-spring]] —— react-spring — 用真实弹簧的物理写网页动画
- [[storybook]] —— Storybook — 给 UI 组件的独立工作台

