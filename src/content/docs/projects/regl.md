---
title: regl — 函数式 WebGL 封装
来源: 'https://github.com/regl-project/regl'
日期: 2026-07-08
分类: 图形渲染
难度: 中级
---

## 是什么

regl 是一套**把 WebGL 画图动作包成普通 JavaScript 函数**的库。日常类比：原生 WebGL 像厨房里所有锅碗瓢盆都散在台面上，你每炒一道菜都要重新找锅、开火、调火；regl 像把"炒这道菜"写成一张固定菜谱，之后只要喊一次菜谱名。

最小直觉是：先创建一个 `regl` 实例，再把 shader、顶点、uniform、绘制数量写成一个命令，最后调用这个命令。

```js
const regl = require('regl')()
const drawTriangle = regl({
  frag: `precision mediump float;
  void main() { gl_FragColor = vec4(1, 0, 0, 1); }`,
  vert: `precision mediump float;
  attribute vec2 position;
  void main() { gl_Position = vec4(position, 0, 1); }`,
  attributes: { position: [[-1, 0], [0, -1], [1, 1]] },
  count: 3
})
drawTriangle()
```

它不是 Three.js 这种 3D 引擎，也不替你设计场景树、相机系统、材质系统。它更像"WebGL 的函数式外壳"：把原来靠全局状态拼出来的一次 draw call，收进一个可复用、可检查、可优化的命令。

## 为什么重要

不理解 regl，下面这些事都没法解释：

- 为什么 WebGL 新手常被 `bindBuffer`、`useProgram`、`vertexAttribPointer` 的顺序坑住，而 regl 可以把这些状态收进一个局部命令里
- 为什么浏览器里做大规模散点、粒子、GPGPU 小实验时，很多项目宁愿用 regl 而不是重型 3D 引擎
- 为什么"声明式"不一定意味着慢：regl 会把命令提前分析，再生成优化过的 JavaScript 执行路径
- 为什么它能同时服务教学 demo、数据可视化、GPU 计算玩具和长期维护的 WebGL 应用

## 核心要点

regl 的核心可以拆成 **三件事**：

1. **命令（command）**：一次绘制需要的 WebGL 状态被装进一个函数。类比：把"画三角形"做成按钮，按钮内部记住该用哪个 shader、哪份顶点、画几个点。
2. **资源（resource）**：buffer、texture、framebuffer 这些住在 GPU 里的东西用句柄管理。类比：仓库里放原料，命令只拿仓库编号，不每次都重新搬货。
3. **动态输入（props / context / this）**：颜色、位置、时间、视口大小这些会变的值，在调用命令时传进去。类比：菜谱不变，但今天的辣度、份量和摆盘可以临时指定。

三件事合起来，解决的是 WebGL 最大的心智负担：**全局状态太多，错一步就黑屏**。regl 把状态收成局部对象，再让你用函数调用的方式画画。

## 实践案例

### 案例 1：官方 basic 示例，先画出一个红三角形

官方 `example/basic.js` 展示的第一件事，是把一次 draw call 写成声明式对象：

```js
const regl = require('regl')()
regl.clear({ color: [0, 0, 0, 1], depth: 1 })
regl({
  frag: `precision mediump float;
  uniform vec4 color;
  void main () { gl_FragColor = color; }`,
  vert: `attribute vec2 position;
  void main () { gl_Position = vec4(position, 0, 1); }`,
  attributes: { position: [[-1, 0], [0, -1], [1, 1]] },
  uniforms: { color: [1, 0, 0, 1] },
  count: 3
})()
```

**逐部分解释**：
- `frag` 决定每个像素是什么颜色，这里固定成红色
- `vert` 决定每个顶点放到屏幕哪里，这里直接用二维坐标
- `attributes.position` 是三角形的三个角，`count: 3` 表示画 3 个顶点
- 最后的 `()()` 很关键：前一个 `regl({...})` 是"造命令"，后一个 `()` 是"执行命令"

### 案例 2：官方 batch 示例，一条命令画九个三角形

`example/batch.js` 演示：同一个命令可以接收一组 props，regl 会按数组逐个执行。

```js
const draw = regl({
  vert: `attribute vec2 position;
  uniform vec2 offset;
  void main () {
    gl_Position = vec4(position + offset, 0, 1);
  }`,
  frag: `precision mediump float;
  uniform vec4 color;
  void main () { gl_FragColor = color; }`,
  attributes: { position: [[0, 0], [0.2, 0], [0, 0.2]] },
  uniforms: {
    offset: regl.prop('offset'),
    color: regl.prop('color')
  },
  count: 3
})
draw([
  { offset: [-0.8, -0.8], color: [1, 0, 0, 1] },
  { offset: [0, 0], color: [0, 1, 0, 1] },
  { offset: [0.8, 0.8], color: [0, 0, 1, 1] }
])
```

**逐部分解释**：
- `regl.prop('offset')` 表示"每次调用时从 props 里取 offset"
- `draw([...])` 不是画一个对象，而是对数组里每个对象画一次
- 真实示例里还会用 `batchId` 和 `tick` 做动画，说明 batch 不是复制代码，而是共享命令、换数据

### 案例 3：官方 life 示例，用 framebuffer 做生命游戏

`example/life.js` 把 Conway 生命游戏放到 GPU 上跑。它的关键不是三角形，而是两个 framebuffer 轮流读写，像两张草稿纸交替更新。

```js
const state = [0, 1].map(() => regl.framebuffer({
  color: regl.texture({ radius: 512, data: initial, wrap: 'repeat' }),
  depthStencil: false
}))
const updateLife = regl({
  frag: `precision mediump float;
  uniform sampler2D prevState;
  varying vec2 uv;
  void main () {
    float s = texture2D(prevState, uv).r;
    gl_FragColor = vec4(vec3(s), 1);
  }`,
  uniforms: { prevState: ({tick}) => state[tick % 2] },
  framebuffer: ({tick}) => state[(tick + 1) % 2]
})
regl.frame(() => updateLife())
```

**逐部分解释**：
- `regl.framebuffer(...)` 创建 GPU 上的"离屏画布"，不直接显示在屏幕上
- `prevState` 读上一帧，`framebuffer` 写下一帧，避免一边读一边改同一张图
- `regl.frame(...)` 每帧跑一次更新，这就是很多粒子系统、模糊、后处理和 GPGPU demo 的基本结构

## 踩过的坑

1. **在 `regl.frame` 里新建命令**：命令创建很贵，官方 Tips 明确建议命令声明一次、调用很多次；每帧新建会把优化收益吃掉。
2. **调试构建丢了错误信息**：browserify 默认会移除运行时检查和报错，开发时要开 `--debug` 或用会保留调试信息的开发服务器，否则黑屏时只剩沉默。
3. **每帧重新创建 buffer / texture**：GPU 资源要复用，动态数据用 `subdata` 或 `subimage` 更新；反复分配会制造卡顿和显存压力。
4. **直接碰 `regl._gl` 后忘记刷新状态**：底层 WebGL 是 escape hatch，改了原生状态必须 `regl._refresh()`，否则 regl 以为状态还在自己掌控中，渲染结果会乱。

## 适用 vs 不适用场景

**适用**：
- 想学 WebGL，但又不想第一天就被几十个全局状态 API 淹没
- 数据可视化、科学可视化、粒子、shader demo 这类"我知道要怎么画，只缺一个薄封装"的场景
- 需要 framebuffer、instancing、multiple render targets 等 WebGL 能力，但不需要完整游戏引擎
- 长期维护的 WebGL 小系统，想要更清晰的命令边界和输入边界

**不适用**：
- 想快速搭一个完整 3D 场景、相机、灯光、材质、模型加载器 → 用 [[threejs]] 或 PlayCanvas 更省心
- 只画常规柱状图、折线图、饼图 → 用 [[chart-js]]、[[observable-plot]]、[[plotly-js]] 更直接
- 团队没人愿意读 GLSL，甚至不知道 vertex shader / fragment shader 是什么
- 需要 DOM 级无障碍、文本排版、表单交互，WebGL 不是这些问题的默认答案

## 历史小故事（可跳过）

- **2016 年**：regl 以 MIT 许可证开源，README 写明项目得到 Freeman Lab 和 Howard Hughes Medical Institute 支持。
- **早期定位**：它没有做成 3D 引擎，而是坚持"移除 WebGL 共享状态"，把 draw call 变成 command。
- **社区扩散**：README 的 projects 列表里能看到 Bokeh、Deepscatter、Allen Institute ABC Atlas 这类数据可视化和科研项目。
- **维护取向**：官方强调单元测试、兼容性、语义化版本和无依赖，说明它更在意长期稳定而不是堆功能。
- **今天看**：GitHub 上有 5k+ stars，仍是理解"薄封装 WebGL"的代表项目。

## 学到什么

1. **WebGL 难，不是因为画三角形难，而是因为状态散**：regl 的主线就是把状态收进局部命令。
2. **声明式也能快**：只要把声明提前编译、复用命令，运行时可以少做很多重复判断。
3. **薄封装有边界**：regl 不替你设计世界，它只让你更稳地调用 GPU。
4. **资源生命周期很重要**：buffer、texture、framebuffer 都是 GPU 资源，复用、更新、销毁要有意识。

## 延伸阅读

- 仓库主页：[regl-project/regl](https://github.com/regl-project/regl)
- API 文档：[REGL API](https://github.com/regl-project/regl/blob/main/API.md)
- 官方示例：[regl example directory](https://github.com/regl-project/regl/tree/main/example)
- 在线画廊：[regl gallery](https://regl-project.github.io/regl/www/gallery.html)
- 对比阅读：[[pixi]] —— 更偏 2D 渲染引擎；[[threejs]] —— 更偏完整 3D 引擎

## 关联

- [[threejs]] —— regl 更底层；Three.js 替你处理场景、相机、材质和模型
- [[pixi]] —— 都跑在 WebGL 上，但 PixiJS 面向 2D 精灵和游戏式渲染
- [[d3]] —— D3 负责数据到图形的映射，regl 负责更底层的 GPU draw call
- [[observable-plot]] —— 面向"我要快速看数据"，和 regl 的"我要控制 shader"站在不同层级
- [[kepler-gl]] —— 大规模地图可视化也依赖 WebGL 思路，可用来对照上层产品化封装
- [[chart-js]] —— 常规 canvas 图表库，适合业务图表；regl 适合自定义 GPU 管线
- [[owens-2007-gpgpu-survey]] —— regl 的 framebuffer/GPGPU demo 可以放进更长的 GPU 通用计算历史里理解

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
