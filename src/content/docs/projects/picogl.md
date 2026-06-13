---
title: PicoGL.js — 极简 WebGL2 包装
来源: 'https://github.com/tsherif/picogl.js'
日期: 2026-06-13
子分类: 渲染与图形
分类: 图形学
provenance: pipeline-v3
难度: 中级
---

## 是什么

PicoGL.js 是一个**只包装 WebGL 2、不造 3D 引擎**的 JavaScript 渲染库。日常类比：原生 WebGL 2 像一间没有标签的配电房——每根线对应一个全局开关，你必须记住「先开哪路、再合哪闸」，顺序错一步整栋楼可能静默黑屏；PicoGL 则在配电房外面贴好名牌、把常用操作收成链式按钮，你仍然亲手接线，但不再对着裸铜线发呆。

库由 Tarek Sherif（BioDigital）于 2017 年发布，MIT 协议，零依赖，gzip 后约十几 KB。它**不是** Three.js 那种场景图引擎：没有 GameObject、没有材质系统、没有摄像机抽象。概念模型几乎一一对应 WebGL 2 原生对象——Program、VAO、UBO、FBO、Transform Feedback——唯一稍高层的封装是 **DrawCall**，把一次绘制所需的 program、顶点数组、uniform、纹理绑在一起。

目标用户是**已经理解 WebGL 2 管线**、想要少写样板代码、又不愿被高层引擎挡在着色器之外的人。官网提供从三角形到延迟渲染、SSAO、布料模拟等大量示例，npm 包名 `picogl`，每周下载约千次量级。

## 为什么重要

不理解 PicoGL，下面几件事很难讲清楚：

- 为什么 WebGL 2 的 VAO、UBO、Transform Feedback 在原生 API 里又臭又长，而 PicoGL 用链式调用就能串起来
- 为什么 regl 适合 WebGL 1 函数式命令，而 PicoGL 专精 WebGL 2 的「对象 + 状态追踪」模型——二者是同一问题的两代解法
- 为什么科学可视化、医学 3D（BioDigital Human）团队选「薄封装」而不是 Three.js：需要直接操控 GLSL 3.00 ES、实例化、多渲染目标
- 为什么「DrawCall 对象」能避免 draw 前漏绑 uniform block 或纹理单元——状态被收进对象里，而不是散落在全局 GL 上下文

## 核心概念

1. **App — 全局 GL 管家**：`PicoGL.createApp(canvas)` 创建 WebGL 2 上下文并追踪 clear 颜色、viewport、framebuffer 绑定等全局状态。链式调用 `.clearColor()`、`.drawFramebuffer()`、`.clear()` 都在 App 上完成。类比：App 是配电房总控面板，DrawCall 是各楼层分闸。

2. **Program — 链式编译的着色器程序**：`createProgram(vert, frag)` 同步编译链接；`createPrograms([...])` 返回 Promise，在支持的平台上**并行编译**多个 program，适合启动时批量加载 shader。PicoGL 还把 WebGL 枚举挂到 `PicoGL.FLOAT`、`PicoGL.DEPTH_TEST` 等常量上，少记一层 `gl.` 前缀。

3. **VertexBuffer + VertexArray（VAO）**：VertexBuffer 存顶点/实例数据；VertexArray 把「哪个 buffer 绑到哪个 attribute location」固化下来。`.vertexAttributeBuffer(0, pos)` 是 per-vertex；`.instanceAttributeBuffer(1, offset)` 是 per-instance，配合 instanced draw。VAO 的意义：切换网格时只 bind 一个 VAO，而不是重新 pointer 一遍——像给每套家具贴好「插头对应表」，搬家时整表换插。

4. **UniformBuffer（UBO）**：WebGL 2 允许把多个 uniform 打包成一块 std140 布局的 GPU 内存，一次绑定整个 block。PicoGL 用 `.createUniformBuffer([PicoGL.FLOAT_MAT4, ...]).set(0, matrix).update()` 描述布局与赋值，DrawCall 上 `.uniformBlock("BlockName", ubo)` 绑定。适合 MVP 矩阵、材质参数等「每帧改、多 shader 共享」的数据。

5. **DrawCall — 一次绘制的快照**：`createDrawCall(program, vertexArray)` 创建后链式设置 `.uniform()`、`.uniformBlock()`、`.texture()`、`.transformFeedback()`，最后 `.draw()` 或 `.drawInstanced()`。DrawCall 内部记住当前 program、VAO、纹理单元分配，减少「忘了 active texture unit」类 bug。

6. **Framebuffer + 多渲染目标（MRT）**：离屏渲染、延迟渲染、后处理都依赖 FBO。PicoGL 的 `createFramebuffer().colorTarget(0, tex0).colorTarget(1, tex1).depthTarget(depthTex)` 对应 WebGL 2 的 multiple render targets，比 WebGL 1 的 hack 干净得多。

7. **Transform Feedback**：顶点着色器输出可以写回 buffer，用于 GPU 粒子、布料、物理迭代。PicoGL 在 `createPrograms` 第三参数传 varying 名列表，再 `createTransformFeedback().feedbackBuffer(0, dest)` 挂到 DrawCall 上。

## 与 regl / Three.js 怎么选

| 维度 | PicoGL.js | regl | Three.js |
|------|-----------|------|----------|
| API 代数 | WebGL **2** 专用 | WebGL **1** 为主 | 高层场景图 |
| 抽象程度 | 薄：对象 ≈ GL 对象 | 中：命令函数 | 厚：Mesh/Scene/Camera |
| 着色器 | 手写 GLSL 3.00 ES | 手写 GLSL 1.0/3.0 | 可选 ShaderMaterial |
| 典型场景 | WebGL2 demo、医学 3D、教学 | Observable 可视化、GPGPU ping-pong | 通用 3D 产品 |

若你已会 WebGL 2 管线、想要 regl 那种「少样板」但**必须用到 UBO/TF/instancing**，PicoGL 是更对口的选择。

## 实践案例

### 案例 1：最小三角形 + Uniform Buffer

下面示例对应官网 README：创建 App → 异步编译 program → VBO/VAO → UBO 存两个 vec4 颜色 → DrawCall 绘制。

```js
import PicoGL from 'picogl'

const canvas = document.querySelector('#gl')
const app = PicoGL.createApp(canvas).clearColor(0, 0, 0, 1)

const vert = `#version 300 es
  layout(location = 0) in vec2 position;
  void main() {
    gl_Position = vec4(position, 0.0, 1.0);
  }
`

const frag = `#version 300 es
  precision highp float;
  layout(std140) uniform ColorUniforms {
    vec4 colorA;
    vec4 colorB;
  };
  out vec4 outColor;
  void main() {
    outColor = mix(colorA, colorB, gl_FragCoord.x / 800.0);
  }
`

app.createPrograms([[vert, frag]]).then(([program]) => {
  const positions = app.createVertexBuffer(
    PicoGL.FLOAT,
    2,
    new Float32Array([-0.5, -0.5, 0.5, -0.5, 0.0, 0.5])
  )

  const vertexArray = app.createVertexArray().vertexAttributeBuffer(0, positions)

  const uniformBuffer = app
    .createUniformBuffer([PicoGL.FLOAT_VEC4, PicoGL.FLOAT_VEC4])
    .set(0, new Float32Array([1, 0, 0, 0.3]))
    .set(1, new Float32Array([0, 0, 1, 0.7]))
    .update()

  const drawCall = app
    .createDrawCall(program, vertexArray)
    .uniformBlock('ColorUniforms', uniformBuffer)

  function frame() {
    app.clear()
    drawCall.draw()
    requestAnimationFrame(frame)
  }
  frame()
})
```

**逐段解释**：`#version 300 es` 声明 WebGL 2 着色器；`layout(location=0)` 与 VAO 的 attribute 0 对应；UBO 里 `layout(std140) uniform ColorUniforms` 必须与 JS 侧 block 名一致；`.update()` 才把 CPU 侧修改推到 GPU——忘记调用是常见坑。`createPrograms` 用数组包一层是为了将来并行编译多组 shader。

### 案例 2：实例化绘制 — 一次 draw 画多个三角形

实例化（instancing）让 GPU 用同一套顶点数据、不同的 per-instance 属性（偏移、颜色）批量绘制。PicoGL 用 `instanceAttributeBuffer` 区分 per-vertex 与 per-instance：

```js
const app = PicoGL.createApp(canvas).clearColor(0.1, 0.1, 0.12, 1)

// 单个三角形的局部坐标（每顶点一份）
const positions = app.createVertexBuffer(
  PicoGL.FLOAT,
  2,
  new Float32Array([-0.3, -0.3, 0.3, -0.3, 0.0, 0.3])
)

// 三个实例的世界偏移（每实例一份）
const offsets = app.createVertexBuffer(
  PicoGL.FLOAT,
  2,
  new Float32Array([-0.5, 0.0, 0.0, 0.2, 0.5, 0.0])
)

const vertexArray = app
  .createVertexArray()
  .vertexAttributeBuffer(0, positions)
  .instanceAttributeBuffer(1, offsets)

const drawCall = app.createDrawCall(program, vertexArray).instances(3)

app.clear()
drawCall.draw() // 等价于 gl.drawArraysInstanced(...)
```

**逐段解释**：attribute 0 走 `vertexAttribPointer` 语义，每顶点步进；attribute 1 走 `vertexAttribDivisor(1, 1)`，同一实例内所有顶点共享一份 offset。`.instances(3)` 告诉 DrawCall 画 3 个实例。若把 offsets 错绑成 `.vertexAttributeBuffer`，你会看到三个三角形叠在同一位置而不是排开。

### 案例 3（选读）：离屏 FBO + 后处理 pass

多 pass 渲染的标准模式：pass A 画到 FBO 纹理，pass B 全屏四边形采样该纹理。

```js
const colorTarget = app.createTexture2D(app.width, app.height)
const depthTarget = app.createTexture2D(app.width, app.height, {
  internalFormat: PicoGL.DEPTH_COMPONENT16,
})

const framebuffer = app
  .createFramebuffer()
  .colorTarget(0, colorTarget)
  .depthTarget(depthTarget)

// Pass 1：离屏
app.drawFramebuffer(framebuffer).clear()
sceneDrawCall.draw()

// Pass 2：屏幕，把 FBO 颜色绑到 sampler
app.defaultDrawFramebuffer().clear()
postDrawCall.texture('sceneColor', colorTarget).draw()
```

**要点**：`drawFramebuffer` / `defaultDrawFramebuffer` 切换写入目标；`postDrawCall.texture` 自动分配 texture unit。resize 窗口后需重建与 `app.width/height` 匹配的 texture，否则画面拉伸或采样错位。

## 踩过的坑

1. **忘记 `uniformBuffer.update()`**：`.set()` 只改 CPU 侧镜像，不调用 `update()` GPU 读到的仍是旧值，表现像「uniform 传不进去」。

2. **WebGL 2 上下文创建失败**：Safari 旧版、未开实验特性的环境会拿不到 WebGL 2。PicoGL 没有 WebGL 1 回退，需先检测 `canvas.getContext('webgl2')`。

3. **std140 对齐**：UBO 里 `vec3` 后接 `float` 会插入 padding。布局与 GLSL `layout(std140)` 不一致会导致矩阵「看起来转了 90°」——用官网 Uniform Buffer 示例的布局表对照。

4. **Transform Feedback 与 rasterizer**：捕获 varying 时往往要关闭 rasterizer 或写空 fragment shader，否则仍走正常光栅化。PicoGL 示例里会配合 `RASTERIZER_DISCARD` 等状态。

5. **上下文丢失**：PicoGL 提供 `App.restorePrograms()` 等在 context loss 后批量恢复资源；移动端切后台可能触发，需在 `webglcontextrestored` 里重建 VAO/纹理。

## 适用 vs 不适用

**适用**：

- 学习 WebGL 2 管线，希望 API 比裸 `gl.*` 友好但仍「看得见」底层对象
- 需要 UBO、instancing、MRT、Transform Feedback 的 demo 或科研可视化
- 已有 GLSL 3.00 ES shader，不想被 Three.js 材质系统包一层
- 与 regl 类似体量的小工具：医学 3D、自定义后处理、WebGL 课程作业

**不适用**：

- 需要完整 3D 引擎（动画、物理、加载 glTF 一条龙）→ Three.js / Babylon.js
- 只需 WebGL 1 或要兼容极老浏览器 → regl 或 twgl
- 团队完全零基础 3D → 先 Three.js，再读 PicoGL 理解底层
- 目标 WebGPU → 考虑 wgpu 或原生 WebGPU API

## 历史小故事（可跳过）

- **2016–2017**：WebGL 2 规范落地，VAO/UBO/TF 进浏览器，但样板代码比 WebGL 1 更多。Tarek Sherif 在 BioDigital 做人体 3D 可视化，需要直接操控 WebGL 2，于是抽出 PicoGL。
- **Khronos Meetup**：作者做过「WebGL 2 Development with PicoGL.js」分享，核心信息是「只简化状态管理，不隐藏管线」。
- **示例库膨胀**：官网 Advanced Examples 涵盖延迟渲染、OIT、SSAO 等，证明薄封装也能搭重型渲染技术栈——关键是 shader 与 pass 设计，不是引擎品牌。
- **与 regl 并存**：regl 偏函数式命令、WebGL 1 生态；PicoGL 偏 WebGL 2 对象模型。二者都是「懂 GL 的人用的便利层」，不是竞品关系而是代数不同。

## 学到什么

1. **薄封装的价值**：当团队已经理解管线，最缺的往往是状态追踪与链式 API，而不是又一个 SceneGraph。
2. **DrawCall 作为边界**：把一次 draw 所需状态收进一个对象，等价于在代码里画一条「提交前检查清单」。
3. **WebGL 2 的 UBO/VAO 是标配**：现代浏览器内做 instancing 和后处理，应默认按 WebGL 2 设计；PicoGL 把这条路径铺平了。
4. **并行编译 shader**：启动时 `createPrograms` 批量编译，能缩短首帧黑屏——小库也可以做平台级优化。

## 延伸阅读

- 官方站点：[PicoGL.js 首页与示例](https://tsherif.github.io/picogl.js/)
- API 文档：[JSDoc 完整参考](https://tsherif.github.io/picogl.js/docs/)
- 作者教程：[WebGL 2 Development with PicoGL.js](https://tsherif.wordpress.com/2017/07/26/webgl-2-development-with-picogl-js/)
- npm：[picogl 包](https://www.npmjs.com/package/picogl)
- 仓库：[github.com/tsherif/picogl.js](https://github.com/tsherif/picogl.js)

## 关联

- [[regl]] —— 函数式 WebGL 1 封装，与 PicoGL 的 WebGL 2 对象模型形成对照
- [[three-js]] —— 高层 3D 引擎；PicoGL 适合「只要 GL 便利层」的场景
- [[playcanvas]] —— 完整游戏引擎路线，与 PicoGL 的极简定位相反
- [[webgl-fundamentals]] —— 理解 VAO、UBO、管线阶段后再读 PicoGL 事半功倍
- [[d3]] —— 2D 数据可视化常配 D3；大规模 GL 点云可下沉到 PicoGL/regl 层

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[d3]] —— D3.js — 不是图表库，是写图表库的乐高
- [[luma-gl]] —— luma.gl — vis.gl WebGL2/WebGPU 抽象
- [[playcanvas]] —— PlayCanvas — 浏览器里跑的 3D 游戏引擎
- [[regl]] —— regl — 函数式 WebGL 封装

