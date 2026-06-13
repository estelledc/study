---
title: regl — 函数式 WebGL 封装
来源: 'https://github.com/regl-project/regl'
日期: 2026-06-06
分类: 图形学
子分类: 渲染与图形
难度: 中级
---

## 是什么

regl 是一个**把混乱的 WebGL 状态机包装成纯函数式命令对象**的 JavaScript 库。日常类比：原生 WebGL 像手动操作一台旧式调音台——你必须先拨开关、转旋钮、再按播放，而且每个旋钮都会影响下一首歌的声音；regl 则让你每次"演奏"前把所有参数一次性写在乐谱上，调音台隐身了。

你用原生 WebGL 画一个三角形，需要：绑定缓冲区、绑定着色器、设置 uniform、启用顶点属性、绘制，每一步都在修改全局状态，前后顺序搞错就静默出错。用 regl，你只需要声明一个"命令对象"，把所有参数放进去，调用它就绘制——调用前后没有任何残留状态。

regl 由 Mikola Lysenko 于 2016 年发布，在 Observable 数据可视化社区被广泛使用，FiveThirtyEight、Allen Institute 脑科学图谱、deepscatter 十亿点散点图都用它驱动渲染层。项目零依赖，MIT 协议，Star 数约 5500。

## 为什么重要

不理解 regl，下面这些事情都没法解释：

- 为什么 Observable 笔记本里几十行代码就能渲染出流畅的粒子动画，而用原生 WebGL 几百行还在调 bug
- 为什么"批量绘制一万个物体"在 regl 里只是传一个数组，而在原生 WebGL 里是手写循环逐个 draw call
- 为什么科学可视化项目（deepscatter、Allen Brain Atlas）选它而不是 Three.js——因为 Three.js 封装得太高层，直接操控着色器反而绕路
- 为什么 regl 能做 GPU 通用计算（流体模拟、神经网络推理）而不只是画图形

## 核心要点

1. **命令即函数，调用即绘制**：regl 里一切渲染操作都是"命令（command）"——用 `regl({...})` 声明，返回一个普通 JS 函数。调用这个函数就执行绘制，没有副作用，没有状态泄漏。类比：每道菜是一张写好食材和步骤的菜单，厨房状态与上一道菜完全隔离。

2. **动态参数三件套——prop / context / this**：并非所有参数都是写死的。regl 提供三种"占位符"：`regl.prop('color')` 在调用时从参数里取值，`regl.context('time')` 从绘制上下文取，`regl.this('model')` 从命令对象自身取。这三个懒求值机制让命令既可以"编译期内联优化静态参数"，又可以"运行时灵活传动态数据"。类比：菜单里写"加两勺盐"是静态的；写"加客人指定量的盐"则是动态的——厨房根据不同订单分别处理。

3. **批处理与作用域命令**：传一个数组给命令，regl 自动展开成多次绘制，不需要写循环——这就是批处理（batch rendering）。作用域命令（scoped command）则像函数的"词法作用域"：在一个 `regl({...})(function() { ... })` 块内，所有子命令自动继承父作用域设置的着色器、相机矩阵等参数，外面不受影响。

## 实践案例

### 案例 1：最小三角形——告别状态机噩梦

原生 WebGL 画三角形：createBuffer → bindBuffer → bufferData → createShader → shaderSource → compileShader → createProgram → attachShader → linkProgram → useProgram → getAttribLocation → enableVertexAttribArray → vertexAttribPointer → drawArrays。十几步，顺序不能错。

用 regl：

```js
const regl = require('regl')()

const drawTriangle = regl({
  vert: `
    attribute vec2 position;
    void main() { gl_Position = vec4(position, 0, 1); }
  `,
  frag: `
    precision mediump float;
    uniform vec4 color;
    void main() { gl_FragColor = color; }
  `,
  attributes: {
    position: [[-1, -1], [0, 1], [1, -1]]
  },
  uniforms: {
    color: regl.prop('color')
  },
  count: 3
})

regl.frame(() => {
  regl.clear({ color: [0, 0, 0, 1] })
  drawTriangle({ color: [1, 0.5, 0, 1] })
})
```

**逐部分解释**：`vert` 和 `frag` 是 GLSL 着色器字符串（GLSL 是专门在 GPU 上运行的着色器编程语言，控制每个顶点位置和每个像素颜色）；`attributes` 声明顶点位置；`uniforms` 里 `regl.prop('color')` 表示颜色在每次调用时从参数动态读取；`regl.frame` 是 requestAnimationFrame 的封装，自动传入 `tick`、`time` 等上下文。整个声明是一次定义多次复用的纯函数。

### 案例 2：批量绘制一千个粒子

```js
const N = 1000
const positions = Array.from({ length: N }, () => [
  Math.random() * 2 - 1,
  Math.random() * 2 - 1
])

const drawParticles = regl({
  vert: `
    attribute vec2 position;
    uniform float pointSize;
    void main() {
      gl_Position = vec4(position, 0, 1);
      gl_PointSize = pointSize;
    }
  `,
  frag: `
    precision mediump float;
    void main() { gl_FragColor = vec4(0.2, 0.8, 1.0, 0.8); }
  `,
  attributes: { position: regl.prop('pos') },
  uniforms:   { pointSize: 4.0 },
  primitive: 'points',
  count: 1
})

regl.frame(() => {
  regl.clear({ color: [0, 0, 0, 1] })
  // 传数组 → regl 自动批量绘制 N 次
  drawParticles(positions.map(pos => ({ pos: [pos] })))
})
```

**逐部分解释**：`drawParticles` 接收一个数组，regl 内部把它展开为 N 次独立绘制调用，每次用不同的 `pos`。不需要手写 `for` 循环，也不需要担心状态泄漏——每次调用是独立的。

### 案例 3：GPGPU——用 GPU 做物理模拟

GPU 本质上是一个拥有数千个小核心的并行计算器。"framebuffer"是 GPU 渲染的离屏画布——可以把计算结果写进去而不是显示在屏幕上；"纹理（texture）"是 GPU 能并行读写的二维数组，每个像素存一个数值。把这两者结合起来，就能用 GPU 做任意迭代计算。

```js
const W = 512, H = 512

// 两块离屏画布（浮点纹理），轮流作为"输入"和"输出"
const state = Array(2).fill(null).map(() =>
  regl.framebuffer({
    color: regl.texture({ type: 'float', width: W, height: H })
  })
)

// 全屏四边形顶点着色器：把一个铺满屏幕的矩形传给片段着色器
const fullscreenVert = `
  precision highp float;
  attribute vec2 position;
  void main() { gl_Position = vec4(position, 0, 1); }
`

const updateStep = regl({
  vert: fullscreenVert,
  frag: `
    precision highp float;
    uniform sampler2D prev;
    uniform vec2 resolution;
    void main() {
      vec2 uv = gl_FragCoord.xy / resolution;
      vec4 c = texture2D(prev, uv);
      // 每个像素独立计算，GPU 数千核心并行跑这一行
      gl_FragColor = c * 0.99;  // 简单的衰减；替换为扩散方程就是流体
    }
  `,
  attributes: {
    position: [[-1,-1],[1,-1],[-1,1],[-1,1],[1,-1],[1,1]]
  },
  uniforms: {
    prev:       ({ tick }) => state[tick % 2],       // 上一帧纹理
    resolution: [W, H]
  },
  framebuffer: ({ tick }) => state[(tick + 1) % 2], // 写入另一块画布
  count: 6
})

regl.frame(() => {
  updateStep()
})
```

**逐部分解释**：`state` 是两块 framebuffer，每帧交替充当"读"和"写"（ping-pong 乒乓技巧）。片段着色器对每个像素并行执行——512×512 = 26 万个像素同时计算。`({ tick })` 从 regl 上下文解构帧计数器，奇偶帧交替读写两块画布，避免读写同一块产生竞争。这个模式可以实现流体动力学、粒子系统、Game of Life 等。

## 踩过的坑

1. **浮点纹理扩展不是默认开启的**：做 GPGPU 时需要先检查 `OES_texture_float` 扩展（WebGL 的可选功能模块）是否可用；移动端 WebGL 1 支持率不一，直接 `regl.texture({ type: 'float' })` 在某些设备上会静默失败，建议先 `regl.hasExtension('OES_texture_float')` 检查。

2. **prop / context 只在命令执行时求值**：如果你在命令定义时用了 `regl.prop('x')` 但调用时忘记传 `x`，regl 返回 `undefined`，GLSL 会收到意外值而不是报错。调试时要检查传参是否完整。

3. **framebuffer 尺寸改变时必须重建**：resize 窗口后旧 framebuffer 尺寸不会自动更新，需要手动 `.resize()` 或重新创建。忘掉这一步会导致渲染输出比屏幕小一半但不报错。

4. **regl.frame 的 tick 计数器不会暂停**：即使窗口失焦，`regl.frame` 回调仍然每帧运行（取决于浏览器节流策略）。需要动画暂停时，要手动保存 `cancel` 句柄并调用它。

## 适用 vs 不适用场景

**适用**：
- 科学数据可视化（散点图超十万点、神经科学图谱、地理热力图）
- 需要直接控制着色器的自定义渲染效果
- GPGPU 通用计算（流体模拟、粒子物理、图像处理）
- Observable 笔记本里的交互式 WebGL demo
- 不想引入 Three.js 全量但需要高效 WebGL 的场景

**不适用**：
- 需要完整 3D 场景管理（摄像机、灯光、材质系统、物理引擎） → 用 Three.js / Babylon.js
- 团队 WebGL 经验薄弱，需要高层抽象 → 用 Three.js 或 Pixi.js
- WebGL 2.0 特性（实例化绘制的高级用法、变换反馈） → 需评估 regl 支持程度
- 需要 WebGPU 支持 → regl 仅针对 WebGL，考虑 wgpu / WebGPU 原生

## 历史小故事（可跳过）

- **2015 年前后**：Mikola Lysenko 在 stack.gl 生态（模块化 WebGL 工具箱）工作，发现 WebGL 状态机模型导致每个项目都要重写大量样板代码，错误难以调试。
- **2016 年**：regl 发布，核心思想来自函数式编程——命令是不可变对象，调用是纯操作，状态隔离。第一个版本就有完整测试套件（最终超过 30000 个单元测试）。
- **2017-2020 年**：Observable 平台崛起，regl 成为其数据可视化社区的标准底层渲染库；deepscatter 用 regl 实现了浏览器内十亿点散点图的流畅渲染。
- **Howard Hughes Medical Institute 资助**：Freeman Lab 用 regl 构建 Allen Institute ABC Atlas（小鼠脑细胞类型图谱），驱动了真实神经科学研究，体现了一个底层图形库如何进入严肃科学工作流。
- **至今维护**：项目以维护态为主，Mikola Lysenko 后续精力更多在 ndarray / gl-matrix 等生态上，但 regl 的 API 足够稳定，老版本代码今天仍可运行。

## 学到什么

1. **状态机 vs 命令对象**：WebGL 本质上是状态机，但把状态封装进不可变命令对象，可以消灭 90% 的调试地狱——这是函数式思想在图形学的一次成功实践
2. **动态代码生成的价值**：regl 在内部将命令编译成优化的 JS 代码，静态参数内联为字面量，零运行时解释开销——证明"声明式 API"和"高性能"不必是矛盾
3. **GPU 是通用并行计算器**：framebuffer + float texture 的 ping-pong 技巧说明，只要把"读"和"写"的纹理分开，GPU 就能运行任意迭代算法，不只是画图形
4. **小而精的库能在大生态里存活**：regl 5000 星、零依赖、专注 WebGL 命令模型这一件事，却支撑了从 Observable 数据可视化到神经科学图谱的广阔应用——领域库不必大而全

## 延伸阅读

- 官方文档：[regl API 参考](https://github.com/regl-project/regl/blob/master/API.md)（命令、资源、上下文完整说明）
- 交互示例：[regl 官方 gallery](http://regl.party/examples)（50+ 可在线运行的 demo）
- GPGPU 教程：[regl GPGPU 文档](https://github.com/regl-project/regl/blob/master/API.md#framebuffers)（framebuffer ping-pong 模式详解）
- deepscatter 案例：[Nomic deepscatter](https://github.com/nomic-ai/deepscatter)（十亿点散点图实现，regl 实际大规模应用）
- [[webgl-fundamentals]] —— 理解 WebGL 状态机原理，再看 regl 封装价值更清晰
- Observable 生态：[Observable Plot 与 regl 对比](https://observablehq.com/)（高层 vs 底层渲染选型参考）

## 关联

- [[three-js]] —— Three.js 是更高层的 3D 引擎，regl 比它更底层、更直接操控着色器
- [[d3]] —— D3 负责数据绑定和 SVG，regl 负责 WebGL 渲染；二者经常配合做大规模数据可视化
- [[webassembly]] —— regl 命令可以调用 WASM 计算结果作为顶点数据，形成 CPU+GPU 协同管线
- [[observable-plot]] —— Observable 生态里 regl 是底层渲染引擎，Observable Plot 是高层图表库
- [[ndarray]] —— Mikola Lysenko 同时维护的多维数组库，与 regl 配合做科学计算数据传输
- [[glsl]] —— regl 的着色器用 GLSL 编写，理解 GLSL 是用 regl 的前提
- [[gpu-computing]] —— regl 的 framebuffer GPGPU 模式是 GPU 通用计算在浏览器端的直接体现

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[d3]] —— D3.js — 不是图表库，是写图表库的乐高
- [[glslify]] —— glslify — Browserify 风格 GLSL 模块
- [[luma-gl]] —— luma.gl — vis.gl WebGL2/WebGPU 抽象
- [[observable-plot]] —— Observable Plot — 你说想看哪两列的关系，库自己画图
- [[picogl]] —— PicoGL.js — 极简 WebGL2 包装

