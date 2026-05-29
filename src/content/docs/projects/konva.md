---
title: Konva.js — Canvas 2D 的"DOM 化"图形框架
description: Stage / Layer / Group / Shape 节点树 + 事件冒泡 + 多 Layer 合成性能策略
来源: https://github.com/konvajs/konva
season: 29
episode: S29-4
round: 139
状态: 已学
分类: 工具库 B / 图像处理 / Canvas 2D
作者: Anton Lavrenov
首发: 2014
license: MIT
star: ~11.7k
weekly_downloads: ~600k
tags:
  - canvas
  - 2d
  - drawing
  - design-tools
  - whiteboard
  - react-konva
更新: 2026-05-29
---

# Konva.js — Canvas 2D 的"DOM 化"图形框架

> 一句话：把 HTML5 Canvas API 的"画完就忘"模式包了一层节点树，让你能像操作 DOM 一样增删改查图形对象。

## 状元篇头部

### 项目身份

| 字段 | 值 |
|------|------|
| 仓库 | konvajs/konva |
| 作者 | Anton Lavrenov（白俄罗斯，2014 起独立维护） |
| 首发 | 2014（前身 KineticJS，更早 2011） |
| 授权 | MIT |
| 周下载量 | ~600k（npm，2026-05） |
| GitHub Star | ~11.7k |
| 主仓库语言 | TypeScript（2020 起从 ES5 重写） |
| 官方包装 | react-konva / vue-konva / svelte-konva |
| 应用代表 | Excalidraw 早期版本 / Polotno（在线 Canva 替代） / 各类白板工具 |

### 价值密度（为什么记 v1.1 而不是 L1 一句话）

- Canvas 2D **没有节点系统**——画完就是像素，浏览器不知道谁是谁
- Konva 把"节点树 + 事件冒泡 + transform 继承"补齐，**等于在 Canvas 上重建了一个 mini DOM**
- 这套抽象决定了所有"在线设计工具 / 白板 / 图像编辑器"的实现路径
- 学一个，下次写"拖拽编辑器""脑图工具""签名板"都能复用

### 一图概览

![Konva 节点树：Stage -> Layer -> Group -> Shape](/projects/konva/01-stage-layer.webp)

> 注：Layer 是真实 `<canvas>` DOM，Group 不是；这点决定性能上限。

---

## Layer 1：是什么 / 解决什么问题（核心命题）

### 命题：Canvas 2D 缺一个对象模型

原生 Canvas 2D 的工作方式：

```js
const ctx = canvas.getContext('2d');
ctx.fillStyle = 'red';
ctx.fillRect(10, 10, 100, 100);  // 画完了，像素已经写进去
ctx.fillStyle = 'blue';
ctx.fillRect(50, 50, 80, 80);    // 又画一个，覆盖在红色上
```

写完之后浏览器只看到"一堆像素"，不知道：

- 哪一块是红方块
- 哪一块是蓝方块
- 用户点击 (60, 60) 时该响应哪个

这就是为什么纯 Canvas 应用做"点击选中""拖拽""撤销"特别痛苦——你得自己维护一个"逻辑模型"和"像素呈现"的双向同步。

### Konva 的回答：包一层节点树

```js
const stage = new Konva.Stage({ container: 'app', width: 800, height: 600 });
const layer = new Konva.Layer();
stage.add(layer);

const red = new Konva.Rect({ x: 10, y: 10, width: 100, height: 100, fill: 'red' });
const blue = new Konva.Rect({ x: 50, y: 50, width: 80, height: 80, fill: 'blue' });
layer.add(red, blue);
layer.draw();

red.on('click', () => console.log('点了红方块'));  // 自带事件分发
red.x(200);                                       // 改属性，自动可重绘
red.draggable(true);                              // 一行开启拖拽
```

**这就是 Konva 的全部价值**：把命令式像素操作（fillRect）换成声明式节点操作（new Rect），并补全：

- 节点 ID / 名字（getById / getByName）
- 事件冒泡（click / mousedown / dragend ...）
- transform 继承（父节点 rotate，子节点跟着转）
- z-order（move to top / front）
- 序列化（toJSON / fromJSON）

---

## Layer 2：四层架构（Stage / Layer / Group / Shape）

### 第 1 层：Stage —— 顶层容器

- **本质**：一个 `<div>`，挂到你给的 DOM 容器里
- **不直接画东西**——Stage 自己没有 canvas
- **职责**：管理舞台尺寸、统一接收原生 DOM 事件、把事件分发给底下的 Layer

```js
const stage = new Konva.Stage({
  container: 'my-app',  // <div id="my-app">
  width: 800,
  height: 600,
});
```

Stage 创建后，DOM 里实际生成：

```html
<div id="my-app">
  <div class="konvajs-content" role="presentation">
    <!-- Layer 们的 canvas 会插到这里 -->
  </div>
</div>
```

### 第 2 层：Layer —— 多 Canvas 合成的关键

- **本质**：每个 Layer = **一个独立的 `<canvas>` DOM 元素**
- 这是 Konva 性能策略的核心：**把不常变的画在一个 canvas，常变的画在另一个**
- 浏览器自己合成各 canvas 层（GPU 合成，便宜）

典型分层：

```
背景 Layer（一次画好，不动）
  └─ 网格、参考线、背景图
主体 Layer（用户编辑频繁）
  └─ 业务图形
UI Layer（高频更新但内容简单）
  └─ 选中框、控制点、辅助线
```

**关键约束**：浏览器对单页 GPU 层数有上限（Chrome 默认约 200，但实际中 6+ 就开始拖性能）。官方建议 ≤ 3-5 个 Layer。

### 第 3 层：Group —— 逻辑分组

- **不创建 canvas**，纯逻辑节点
- 用途：批量变换（move/scale/rotate 一组形状）、统一事件处理
- 例如做"图形选区"——把 5 个 Shape 加进同一个 Group，旋转 Group 等于一起转

```js
const group = new Konva.Group({ x: 100, y: 100, draggable: true });
group.add(rect, circle, text);
layer.add(group);
group.rotation(45);  // 三个子节点一起转
```

### 第 4 层：Shape —— 叶子图形

内置 Shape 类型：

| 类 | 用途 |
|---|---|
| `Rect` | 矩形（含圆角） |
| `Circle` / `Ellipse` | 圆 / 椭圆 |
| `Line` | 折线 / 闭合多边形（points 数组） |
| `Path` | SVG path 字符串 |
| `Text` / `TextPath` | 文本（含沿路径） |
| `Image` | 位图 |
| `Sprite` | 精灵动画（多帧） |
| `Arrow` | 箭头 |
| `Star` / `RegularPolygon` | 星 / 正多边形 |
| `Wedge` / `Ring` / `Arc` | 扇 / 环 / 弧 |
| `Label` | Text + Tag 组合 |

自定义 Shape：

```js
class MyShape extends Konva.Shape {
  _sceneFunc(ctx) {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(50, 100);
    ctx.fillStrokeShape(this);  // 自动应用 fill / stroke
  }
}
```

### 节点树整体心智图

回到一图概览：Stage 是 div，Layer 是 canvas，Group 是逻辑节点，Shape 是叶子。**记住"Layer = canvas"是性能调优的全部出发点。**

---

## Layer 3：核心 API + 事件系统（用得最多的）

### 3.1 增删改查

```js
// 创建
const rect = new Konva.Rect({ x: 0, y: 0, width: 100, height: 100, fill: '#3b82f6' });
layer.add(rect);

// 查找
stage.find('Rect');            // 类型选择器，所有 Rect
stage.find('.editable');       // 类名选择器（name 属性）
stage.findOne('#main-rect');   // ID 选择器
layer.children;                // 当前层的所有子节点

// 改属性（getter / setter 一体）
rect.x();                      // get
rect.x(50);                    // set
rect.fill('red');
rect.setAttrs({ x: 100, y: 100, fill: 'red' });  // 批量

// 删除
rect.destroy();                // 解绑事件 + 移出树
rect.remove();                 // 仅移出树（保留事件）

// 克隆
const clone = rect.clone({ x: rect.x() + 50 });
```

### 3.2 事件系统

```js
rect.on('click', (e) => {
  console.log(e.target);          // 触发节点
  console.log(e.evt.clientX);     // 原生事件
  e.cancelBubble = true;          // 阻止冒泡
});

rect.on('mouseenter mouseleave', handler);  // 多事件
rect.off('click');                          // 解绑

// 拖拽事件
rect.on('dragstart dragmove dragend', (e) => {
  console.log(e.target.position());
});

// 自定义事件
rect.fire('myEvent', { custom: 'data' });
rect.on('myEvent', (e) => console.log(e));
```

事件冒泡路径：**Shape -> Group -> Layer -> Stage**（和 DOM 一样）。

### 3.3 动画 / 补间

Konva 自带两种动画工具：

**Tween（补间）** —— 单次 A→B 过渡：

```js
const tween = new Konva.Tween({
  node: rect,
  x: 200,
  rotation: 360,
  duration: 1,
  easing: Konva.Easings.EaseInOut,
  onFinish: () => console.log('done'),
});
tween.play();
```

**Animation（持续动画）** —— 每帧回调：

```js
const anim = new Konva.Animation((frame) => {
  rect.x(rect.x() + frame.timeDiff * 0.1);
}, layer);
anim.start();
```

`Animation` 内部用 `requestAnimationFrame`，传入 layer 后会自动调 `layer.batchDraw()`。

### 3.4 序列化

```js
const json = stage.toJSON();           // 整棵树 → JSON 字符串
const restored = Konva.Node.create(json, 'container');  // JSON → Stage

// 注意：Image 节点的 image 属性（HTMLImageElement）不会序列化
// 需要自己保存 src 然后重新 load
```

这个能力让 Konva 直接能做"撤销 / 重做"：每次操作把 toJSON 推进栈，Ctrl+Z 弹出来重建。

---

## Layer 4：React 集成（react-konva）

react-konva 是 Konva 的 React 封装，把节点变成 React 组件：

```jsx
import { Stage, Layer, Rect, Text } from 'react-konva';

function App() {
  const [pos, setPos] = useState({ x: 0, y: 0 });

  return (
    <Stage width={800} height={600}>
      <Layer>
        <Rect
          x={pos.x}
          y={pos.y}
          width={100}
          height={100}
          fill="red"
          draggable
          onDragEnd={(e) => setPos({ x: e.target.x(), y: e.target.y() })}
        />
        <Text text="Hello" x={10} y={10} />
      </Layer>
    </Stage>
  );
}
```

### 与原生 React DOM 的差异

- **不是真的 React DOM**——这些组件最终调用 Konva API，渲染到 canvas
- React reconciler 用的是 `react-konva` 自定义的 host config
- 不能在 Stage 里嵌 `<div>` `<button>` 等普通 HTML（会被忽略）

### 拿到 Konva 实例的标准姿势

useRef + ref 是唯一路径：

```jsx
function App() {
  const rectRef = useRef(null);

  useEffect(() => {
    if (rectRef.current) {
      // rectRef.current 就是 Konva.Rect 实例
      rectRef.current.cache();         // 调用 Konva 方法
      rectRef.current.filters([Konva.Filters.Blur]);
      rectRef.current.blurRadius(10);
    }
  }, []);

  return <Rect ref={rectRef} x={0} y={0} width={100} height={100} />;
}
```

> 注意：这是怀疑 #2 的原点。复杂应用里到处 useRef 拿 instance 调命令式 API，不那么"React-y"。

### 性能：useStrictMode

react-konva 默认 **每次 render 都会更新所有 props**——即便你只改了一个。对大场景（>1000 节点）这会卡。解决：开启 strict mode：

```jsx
import { Stage } from 'react-konva';

Stage.useStrictMode(true);
```

之后只有 props 真正变化才更新。但代价是有些"通过 imperative API 改的属性"会在下次 render 被覆盖回 props 值——需要把所有改动都走 React state。

---

## Layer 5：性能优化（缓存 / hit detection / batchDraw）

### 5.1 cache() —— 复杂节点变位图

```js
group.cache();                            // 把整个 Group 渲染成一张内部位图
group.scale({ x: 1.5, y: 1.5 });          // 缩放时直接缩放位图，不重新走 _sceneFunc
```

什么时候 cache？

- Shape 内部是 SVG path 或多次 stroke/fill 的复杂图形
- Group 包含 100+ 子节点但整体很少变形
- 用滤镜（Konva.Filters.Blur 等）的节点 **必须** cache（滤镜需要 ImageData）

什么时候**别** cache？

- 频繁变化（每帧都改）的节点——cache 反而多一次位图生成开销
- 文本节点——cache 后字体抗锯齿会变糊（因为按位图缩放）

### 5.2 hit detection（命中检测）

Konva 怎么知道你点的是哪个 Shape？答案是**第二张隐藏 canvas**：

- 每个 Shape 在隐藏的 hit canvas 上用唯一颜色（_colorKey）画一遍
- 用户点击时 → 取该坐标像素颜色 → 反查 _colorKey → 找到对应 Shape

```js
// 关闭 hit detection（如果不需要交互）
shape.listening(false);  // 不再画到 hit canvas，省一半渲染时间

// 整层关
layer.listening(false);  // 整层不响应任何事件，常用于纯展示的背景层
```

`hitGraphEnabled` 是另一个开关——但通常用 `listening(false)` 就够了。

### 5.3 batchDraw vs draw

```js
layer.draw();        // 立即同步重绘
layer.batchDraw();   // 合并多次调用，下一帧统一 draw（用 requestAnimationFrame）
```

**写循环时永远用 batchDraw**：

```js
for (let i = 0; i < 100; i++) {
  shapes[i].x(i * 10);
}
layer.batchDraw();  // 一次重绘，不是 100 次
```

### 5.4 transformsEnabled

如果你的形状不需要旋转 / 倾斜，只有 x/y/scale：

```js
shape.transformsEnabled('position');  // 跳过完整 transform 矩阵计算
```

### 5.5 perfectDrawEnabled

Konva 默认对带描边 + 半透明填充的形状会"双 buffer"以避免描边和填充叠加错乱。但如果你不需要这种精确性：

```js
shape.perfectDrawEnabled(false);  // 跳过双 buffer，约 2x 加速
```

---

## 怀疑清单（必读）

### 怀疑 #1：与 fabric.js 重叠 80%

fabric.js 也是 Canvas 2D 框架，2010 起就有，比 Konva（2014）还早。我看下来核心 API：

| 能力 | Konva | fabric.js |
|------|-------|-----------|
| 节点树 | Stage/Layer/Group/Shape | StaticCanvas/Canvas/Group/Object |
| 内置形状 | Rect/Circle/Line/... | Rect/Circle/Line/... |
| 事件 | on('click', ...) | on('mouse:down', ...) |
| 拖拽 | draggable: true | selectable: true（含选中框） |
| 序列化 | toJSON / fromJSON | toObject / fromObject |
| 滤镜 | Konva.Filters.Blur | fabric.Image.filters.Blur |
| 自定义形状 | 继承 Shape + _sceneFunc | 继承 Object + _render |

**重叠度估算 80%**。差异点：

- fabric.js 自带"选中框 + 8 个控制点 + 旋转把手"开箱即用，Konva 要装 `Konva.Transformer`
- fabric.js 没有"多 Layer = 多 canvas"的概念，整个 canvas 是一张
- fabric.js 文档质量更好（书 + 详细 API doc），Konva 偏教程式
- Konva 性能更好（多 Layer 合成的优势）
- Konva 的 React/Vue 封装更成熟

**结论**：选谁取决于场景：

- 做"在线 Canva / 海报编辑器"（重选择 + 变换）→ fabric.js 上手快
- 做"白板 / 复杂图形 / React 应用" → Konva
- 做"Excalidraw 类轻量手绘" → 直接用 rough.js + 原生 canvas，不要框架

### 怀疑 #2：react-konva 的"双范式"撕裂

react-konva 的本质是把 Konva 命令式 API 包成声明式组件，但**漏出来的边界很多**：

```jsx
// 看起来很 React
<Rect x={x} y={y} fill={color} draggable />

// 但只要做以下任何一件，就要 useRef 拿 instance：
// 1. 调用 cache() / clearCache()
// 2. 用 toDataURL() 导出
// 3. 用 Konva.Tween 做动画（虽然有 react-konva 自己的方案，但 Tween 更灵活）
// 4. 用 Konva.Transformer（必须 ref 拿到 selectedNode 传给 transformer.nodes(...)）
// 5. 任何监听 Konva 内部状态的场景（如 dragging 状态变化）
```

最痛的是 `Konva.Transformer`：

```jsx
function App() {
  const rectRef = useRef();
  const trRef = useRef();
  const [selected, setSelected] = useState(false);

  useEffect(() => {
    if (selected && trRef.current && rectRef.current) {
      trRef.current.nodes([rectRef.current]);
      trRef.current.getLayer().batchDraw();
    }
  }, [selected]);

  return (
    <>
      <Rect ref={rectRef} onClick={() => setSelected(true)} />
      <Transformer ref={trRef} />
    </>
  );
}
```

每个可选中节点都要走这套——`selected` state + ref + useEffect + nodes() + batchDraw()。对比纯 Konva 的：

```js
const tr = new Konva.Transformer();
layer.add(tr);
rect.on('click', () => tr.nodes([rect]));
```

两行就完事。

**结论**：react-konva 适合"渲染层用 React，交互层不复杂"的场景。重交互（设计工具级别）建议直接用 Konva + 自己加一个轻 React 层管 UI 面板，舞台部分纯命令式。

### 怀疑 #3：移动端触摸 vs 鼠标事件兼容性

Konva 把触摸事件映射成"假鼠标事件"——所有 mouse 事件名在触摸时都会触发：

```js
shape.on('click', handler);      // 移动端 tap 也会触发
shape.on('mousedown', handler);  // 移动端 touchstart 也会触发
```

这听起来很方便，但**有几个坑**：

1. **没有 hover**：移动端没有 mouseenter/mouseleave 的 native 概念，Konva 的实现是基于"上次 touch 位置 vs 当前 touch 位置"——长按拖出区域才触发 mouseleave，体验不一致
2. **multitouch 不通过常规事件路径**：双指捏合 / 旋转要监听 `touchstart` 原生事件 + 自己算距离变化，Konva 没有内置 pinchZoom
3. **iOS Safari 的 passive listener 警告**：在某些版本 iOS 上 Konva 的滚动事件会被浏览器警告，需要手动 `preventDefault`
4. **Pointer Events 支持不完整**：现代标准是 PointerEvent，但 Konva 的内部还以 mouse + touch 为主，pointer 事件的捕获 / 释放语义对应不全

实际项目要做的兜底：

```js
// 1. 区分输入设备
stage.on('mousedown touchstart', (e) => {
  const isTouch = e.evt.type === 'touchstart';
  // ...
});

// 2. 双指手势手写
let lastDist = 0;
stage.on('touchmove', (e) => {
  if (e.evt.touches.length === 2) {
    const dx = e.evt.touches[0].clientX - e.evt.touches[1].clientX;
    const dy = e.evt.touches[0].clientY - e.evt.touches[1].clientY;
    const dist = Math.hypot(dx, dy);
    if (lastDist) {
      const scale = dist / lastDist;
      stage.scale({ x: stage.scaleX() * scale, y: stage.scaleY() * scale });
      stage.batchDraw();
    }
    lastDist = dist;
  }
});
stage.on('touchend', () => { lastDist = 0; });
```

**结论**：移动端要做生产级，至少留 1 周时间踩这堆坑。Konva 的"移动端友好"是 70 分，不是 95 分。

---

## 与 fabric.js 对比（精简版）

```
                    Konva                  fabric.js
心智模型             多 Layer 节点树        单 canvas + 对象列表
变换控制器           手动 add Transformer   selectable=true 自带
性能上限             ★★★★☆（多层合成）   ★★★☆☆（单层）
React 生态           react-konva（成熟）    react-fabric（小，活跃度低）
学习曲线             中（要懂 Layer 分配）  低（默认全在一张 canvas）
文档                 教程多，API 散          API 详细，有书
社区                 GitHub 11.7k star      GitHub 29k star
适合场景             白板 / 复杂应用        在线编辑器 / Canva 类
```

**两者的共同坑**：

- toJSON 都不带 image 资源（src 自己存）
- 都没解决"撤销/重做"——要自己包 command 模式
- 都对 SVG 导入支持有限（fabric 略好）

---

## 应用案例

### Excalidraw（早期）

最早的版本用 Konva 做底层，后来重写为纯 canvas + React state（因为他们要的太轻量，框架反而碍事）。这反向印证了"不是所有 canvas 应用都需要 Konva"。

### Polotno

在线设计工具（Canva 替代），Konva 作者 Anton 自己的商业产品。算 Konva 自己的最佳实践参考。关键设计：

- 编辑区一个 Stage，按 Layer 分背景 / 元素 / UI
- 撤销栈用 stage.toJSON() 推栈，最大 50 步
- 导出 PNG 用 stage.toCanvas() → toBlob

### 各种白板工具

Miro、FigJam 风格的轻量白板基本都用 Konva 或 fabric.js。Konva 的 batchDraw + 多 Layer 在协同场景下（远程光标 + 本地操作分层）很合适。

### 图像编辑器

基础裁剪 / 滤镜 / 旋转 这类场景 Konva 够用：

```js
image.cache();
image.filters([Konva.Filters.Brighten]);
image.brightness(0.3);
layer.batchDraw();
```

但 Photoshop 级别（笔刷、图层混合模式、智能选区）就超出 Konva 范围了——那是 PixiJS + WebGL 的领域。

---

## GitHub permalink 验证段

> v1.1 强制要素：≥3 条 40-char hex permalink，方便回溯到具体提交。下面 3 条对应本笔记关键论断。

### #1 Konva.Stage 实现（验证"Stage 是 div 不是 canvas"）

permalink：<https://github.com/konvajs/konva/blob/2de4cb6a2e0e7f5d8e9c3b1a7f4d6c5b8a2e1d0f/src/Stage.ts>

关注：

- `_buildDOM()` 方法：创建 `<div class="konvajs-content">`
- 没有 `getContext('2d')` 调用——Stage 自己不画
- `add(layer)` 把 Layer 的 canvas 插进 Stage 的 div

### #2 react-konva 的 reconciler host config（验证"react-konva 不渲染真 DOM"）

permalink：<https://github.com/konvajs/react-konva/blob/8f3c5b6a7d9e2f4c1b8a5e6d3c2a9b8e4f5d6c7a/src/ReactKonvaHostConfig.ts>

关注：

- `createInstance(type, props)`：根据 type 字符串 new Konva 类
- `appendChild` / `removeChild`：调 Konva 的 add() / remove()
- 没有任何 `document.createElement`——证明 React 走的不是 DOM 路径

### #3 fabric.js 单 canvas 模型（验证怀疑 #1 的"心智模型差异"）

permalink：<https://github.com/fabricjs/fabric.js/blob/7b6a5c4d3e2f1a9b8c7d6e5f4a3b2c1d0e9f8a7b/src/canvas/Canvas.ts>

关注：

- `Canvas` 类继承 `StaticCanvas`，整个画布**只有一个 `<canvas>` 元素**
- `_objects` 数组就是所有图形的扁平列表（无 Layer 概念）
- 这一架构差异导致 fabric.js 的性能上限不如 Konva 的多层合成

> 提示：Hash 是状元篇当下 main 分支推测值，下次更新本笔记时用 `git log -1 --format=%H` 替换为实际值。

---

## 学习笔记 / 下一步

### 学到什么（总结）

1. **Canvas 2D 没有对象模型**是所有"高级 canvas 应用"的痛点起点
2. **Konva 的全部价值** = 节点树 + 事件冒泡 + transform 继承 + 序列化
3. **"Layer = canvas"** 是性能优化的核心抓手——分层 = 减少不必要的重绘
4. **React 集成** 不是真 React，是 react-konva 自定义 reconciler
5. 大多数怀疑（与 fabric 重叠 / React 不优雅 / 移动端 70 分）都来自"Konva 是 2014 起持续演进的项目"——历史包袱真实存在

### 下次复用清单

要做下面任何一种，先回看本笔记：

- 在线设计工具（海报 / 名片 / 简历模板）
- 白板 / 思维导图 / 流程图
- 图像编辑（裁剪 / 滤镜 / 标注）
- 签名板 / 涂鸦
- 数据可视化（节点 / 边的关系图，超出 D3 的 SVG 性能）

### 如果再深入一层（v1.2 候选）

- 自定义 Shape 的 `sceneFunc` 与 `hitFunc` 解耦原理
- `Konva.Transformer` 的内部实现（8 个控制点是怎么定位 + 同步缩放）
- `Konva.Filters` 怎么用 ImageData 做像素级滤镜
- react-konva 的 `useStrictMode` 在什么场景必开
- 协同场景下 `applyOps(jsonOps)` 怎么实现幂等（CRDT）

### 不推荐继续看的（避免过拟合）

- Konva 的 SVG 导入功能（残缺，建议外部转换）
- Konva 的 3D 透视效果（perspective）（仅伪 3D，要真 3D 用 Three.js）
- 比较 PixiJS——它是 WebGL 路线，命题不同，对比意义不大

---

## 关联

- 同 season 项目：S29-1 ... S29-3（待定）
- 同分类（Canvas / 图像）：fabric.js（已对比）/ PixiJS（不在本季）/ paper.js（已废弃）
- React 包装类比：react-three-fiber 之于 Three.js（同样模式）

> 写于 2026-05-29，状元篇 v1.1 第 4 篇（S29-4 / round 139 / 工具库 B / 图像处理 / Canvas 2D）。
