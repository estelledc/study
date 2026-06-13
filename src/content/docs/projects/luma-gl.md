---
title: luma.gl — vis.gl WebGL2/WebGPU 抽象
来源: 'https://github.com/visgl/luma.gl'
日期: 2026-06-13
子分类: 渲染与图形
分类: 图形学
provenance: pipeline-v3
难度: 中级
---

## 是什么

luma.gl 是 vis.gl 生态里的**可移植 GPU 工具包**——同一套 TypeScript API 可以跑在 WebGL 2 或 WebGPU 上，底层通过可插拔的 Adapter 切换。日常类比：原生 WebGL/WebGPU 像两家不同品牌的相机，镜头卡口、菜单、存储卡全不一样；luma.gl 则给你一支**通用机身**：你仍然自己调光圈快门（写 shader、管 buffer），但换镜头时不用重学整套操作，同一卷「底片格式」两边都能冲印。

项目 2015 年从 PhiloGL 分叉，2019 年由 Uber 捐给 Linux Foundation，2022 年进入 OpenJS Foundation。它是 **deck.gl**、kepler.gl、streetscape.gl 的渲染地基：上层做地理可视化与大数据图层，luma.gl 负责 Device、Model、着色器模块与动画循环。当前主线 v9.3，全库 TypeScript strict，npm 包按职责拆分：`@luma.gl/core`（便携 GPU API）、`@luma.gl/engine`（Model / AnimationLoop）、`@luma.gl/shadertools`（着色器拼装）、`@luma.gl/webgl` 与 `@luma.gl/webgpu`（后端适配器）。

与 Three.js 不同，luma.gl **不藏 shader**：概念上贴近 WebGPU/WebGL 原生对象（Device、Buffer、RenderPass、RenderPipeline），适合要直接操控 GPU、又希望一份代码双后端的数据可视化团队。

## 为什么重要

不理解 luma.gl，下面几件事很难讲清楚：

- 为什么 deck.gl 能在同一套图层 API 下，既吃 WebGL2 扩展又逐步接 WebGPU，而不必 fork 两套渲染栈
- 为什么「一份 GLSL + 一份 WGSL」可以写在同一个 `Model` 里——便携层在编译期选后端，而不是运行时硬翻译
- 为什么 vis.gl 系列选「薄抽象 + 着色器模块库」，而不是再包一层场景图——大数据可视化要的是百万点 draw call 效率与可定制 shader
- 为什么 Uniform Buffer、Shader Hook、Instancing 在 luma.gl 里是**一等公民**，与 Engine API 的 `Model.draw()` 绑在一起

## 核心概念

1. **三层 API 分工**
   - **Core API**（`@luma.gl/core`）：`Device`、`Buffer`、`Texture`、`CommandEncoder`、`RenderPass`——与 WebGPU 概念对齐的便携资源层。
   - **Shader API**（`@luma.gl/shadertools`）：`ShaderAssembler`、shader modules、hooks——把可复用 GLSL/WGSL 片段拼装进完整着色器。
   - **Engine API**（`@luma.gl/engine`）：`Model`、`AnimationLoop` / `AnimationLoopTemplate`、`BufferTransform`、`TextureTransform`——把一次 draw 所需的 pipeline、attribute、binding 收成对象。

2. **Adapter 与 Device**：`webgpuAdapter`、`webgl2Adapter` 是单例后端描述符。`makeAnimationLoop(Template, { adapters: [webgpuAdapter, webgl2Adapter] })` 会优先尝试 WebGPU，不可用则回退 WebGL 2。`Device` 是整棵资源树的工厂：创建 buffer、编译 shader、开 render pass。

3. **Model = 一次绘制的完整快照**：类比 regl 的 command object，或 PicoGL 的 DrawCall，但跨后端。`Model` 持有 vs/fs（或 WGSL `source`）、`bufferLayout`、`attributes`、`bindings`（纹理、UBO）、`vertexCount` / `instanceCount`，对 `RenderPass` 调用 `.draw()` 即提交。

4. **AnimationLoopTemplate 生命周期**：类式模板：`constructor` 里创建 GPU 资源并挂到 `this` 字段；`onRender` 每帧 `beginRenderPass` → draw → `end`；`onFinalize` 统一 `destroy()`。比纯回调的 `AnimationLoop` 更适合 TypeScript 非空字段推断。

5. **Shader Modules 与 Hooks**：模块可声明 uniform、注入 `vs:HOOK_NAME(...)` 钩子，在不动主 shader 源码的情况下改顶点/片元行为——deck.gl 图层复用 lighting、project 等模块都靠这套机制。

6. **CanvasContext 与默认 Framebuffer**：`createCanvasContext: true` 时，`device.beginRenderPass()` 无参调用即清屏并画到 swapchain；离屏则显式传 `framebuffer`。

## 与 regl / PicoGL / Three.js 怎么选

| 维度 | luma.gl | regl | PicoGL.js | Three.js |
|------|---------|------|-----------|----------|
| 后端 | WebGL2 **+** WebGPU | WebGL 1/2 | 仅 WebGL2 | WebGL/WebGPU（抽象层厚） |
| 抽象 | 中：贴近 GPU API | 中：函数式命令 | 薄：≈ GL 对象 | 厚：Scene/Mesh |
| 语言 | TypeScript 一等 | JavaScript | JavaScript | TypeScript |
| 生态位 | deck.gl 地基、大数据 Viz | Observable、GPGPU | WebGL2 教学/demo | 通用 3D 产品 |
| Shader | GLSL + WGSL 双份或 source | GLSL | GLSL 3.00 ES | ShaderMaterial 可选 |

若你要**同一代码双后端**、且与 deck.gl / loaders.gl 同栈，luma.gl 是默认答案；若只写 WebGL2 小 demo，PicoGL/regl 更轻；若要完整 3D 编辑器体验，仍选 Three.js。

## 实践案例

### 案例 1：Hello Triangle — 双着色器、零顶点缓冲

官方教程最小例：顶点位置写在 shader 里（`gl_VertexID` / `@builtin(vertex_index)`），同时提供 WGSL 与 GLSL，证明便携层如何选路。

```typescript
import {AnimationLoopTemplate, AnimationProps, Model, makeAnimationLoop} from '@luma.gl/engine';
import {webgl2Adapter} from '@luma.gl/webgl';
import {webgpuAdapter} from '@luma.gl/webgpu';

const WGSL_SHADER = /* WGSL */ `
@vertex fn vertexMain(@builtin(vertex_index) vertexIndex: u32) -> @builtin(position) vec4<f32> {
  var positions = array<vec2<f32>, 3>(
    vec2(0.0, 0.5), vec2(-0.5, -0.5), vec2(0.5, -0.5)
  );
  return vec4<f32>(positions[vertexIndex], 0.0, 1.0);
}
@fragment fn fragmentMain() -> @location(0) vec4<f32> {
  return vec4<f32>(1.0, 0.0, 0.0, 1.0);
}`;

const VS_GLSL = /* glsl */ `#version 300 es
const vec2 pos[3] = vec2[3](vec2(0,0.5), vec2(-0.5,-0.5), vec2(0.5,-0.5));
void main() { gl_Position = vec4(pos[gl_VertexID], 0.0, 1.0); }`;

const FS_GLSL = /* glsl */ `#version 300 es
precision highp float;
layout(location = 0) out vec4 outColor;
void main() { outColor = vec4(1.0, 0.0, 0.0, 1.0); }`;

class App extends AnimationLoopTemplate {
  model!: Model;

  constructor({device}: AnimationProps) {
    super();
    this.model = new Model(device, {
      source: WGSL_SHADER,
      vs: VS_GLSL,
      fs: FS_GLSL,
      topology: 'triangle-list',
      vertexCount: 3,
      shaderLayout: {attributes: [], bindings: []}
    });
  }

  override onFinalize() {
    this.model.destroy();
  }

  override onRender({device}: AnimationProps) {
    const renderPass = device.beginRenderPass({clearColor: [1, 1, 1, 1]});
    this.model.draw(renderPass);
    renderPass.end();
  }
}

makeAnimationLoop(App, {adapters: [webgpuAdapter, webgl2Adapter]}).start();
```

**要点**：`source` 供 WebGPU 路径编译 WGSL；`vs`/`fs` 供 WebGL2。无 attribute buffer 时 `shaderLayout.attributes` 为空。每帧 `beginRenderPass` → `draw` → `end` 是 luma.gl 渲染环的标准三步。

### 案例 2：Instancing — 一次 draw 画四个彩色三角

大数据可视化的缩影：几何只上传一份，per-instance 颜色与偏移走独立 buffer，`instanceCount` 控制实例数。

```typescript
import {Buffer} from '@luma.gl/core';
import {AnimationLoopTemplate, AnimationProps, Model} from '@luma.gl/engine';

// colorShaderModule 省略：把 instanceColor 从顶点传到片元

class InstancingDemo extends AnimationLoopTemplate {
  model!: Model;
  positionBuffer!: Buffer;
  colorBuffer!: Buffer;
  offsetBuffer!: Buffer;

  constructor({device}: AnimationProps) {
    super();
    this.positionBuffer = device.createBuffer(
      new Float32Array([-0.2, -0.2, 0.2, -0.2, 0.0, 0.2])
    );
    this.colorBuffer = device.createBuffer(
      new Float32Array([1,0,0, 0,1,0, 0,0,1, 1,1,0])
    );
    this.offsetBuffer = device.createBuffer(
      new Float32Array([0.5, 0.5, -0.5, 0.5, 0.5, -0.5, -0.5, -0.5])
    );

    this.model = new Model(device, {
      vs, fs, modules: [colorShaderModule],
      bufferLayout: [
        {name: 'position', format: 'float32x2'},
        {name: 'instanceColor', format: 'float32x3', stepMode: 'instance'},
        {name: 'instanceOffset', format: 'float32x2', stepMode: 'instance'}
      ],
      attributes: {
        position: this.positionBuffer,
        instanceColor: this.colorBuffer,
        instanceOffset: this.offsetBuffer
      },
      vertexCount: 3,
      instanceCount: 4,
      parameters: {depthWriteEnabled: true, depthCompare: 'less-equal'}
    });
  }

  override onRender({device}: AnimationProps) {
    const renderPass = device.beginRenderPass({clearColor: [0, 0, 0, 1]});
    this.model.draw(renderPass);
    renderPass.end();
  }
}
```

**要点**：`stepMode: 'instance'` 标记 per-instance attribute；`bufferLayout` 与 WebGPU vertex buffer layout 对齐，WebGL 后端自动映射到 VAO。deck.gl 散点/路径图层底层就是类似的 instanced draw。

### 案例 3（选读）：Shader Hook + UniformStore

两个 `Model` 共享同一份三角形 buffer，通过 shader module 的 `OFFSET_POSITION` hook 左右平移，UBO 传不同颜色——展示模块组合而非复制 shader 全文。

```typescript
import {UniformStore} from '@luma.gl/core';
import {ShaderAssembler} from '@luma.gl/shadertools';

const assembler = ShaderAssembler.getDefaultShaderAssembler();
assembler.addShaderHook('vs:OFFSET_POSITION(inout vec4 position)');

const uniformStore = new UniformStore({
  app: {uniformTypes: {color: 'vec3<f32>'}}
});

// model1: modules: [offsetLeftModule], bindings: { app: redUbo }
// model2: modules: [offsetRightModule], bindings: { app: blueUbo }
// onRender: model1.draw(pass); model2.draw(pass);
```

Hook 在**编译期**把模块代码缝进主 shader，运行时仍是一次 `Model` 一次 pipeline 缓存，适合 deck.gl 那种「图层堆叠、每图层只改一小段逻辑」的架构。

## 模块安装与最小工程

```bash
npm i @luma.gl/engine @luma.gl/webgl @luma.gl/webgpu
npm i -D vite typescript
```

`index.html` 入口用 `makeAnimationLoop` 注入 adapter 列表；Vite + TypeScript 是官方教程默认工具链。只跑 WebGL2 时可只装 `@luma.gl/webgl` 并传 `[webgl2Adapter]`，减小包体。

## 踩过的坑

1. **只写 GLSL 不写 WGSL**：在 `adapters` 含 `webgpuAdapter` 时，WebGPU 路径需要 `source` 或等价 WGSL；否则设备创建成功但 shader 编译失败。开发期可暂时只用 `webgl2Adapter` 排错。

2. **忘记 `renderPass.end()` 与 `device.submit()`**：`beginRenderPass` 开启一帧的编码；仅 `draw` 不 `end` 时命令不完整。部分路径还需显式 `submit` 才把命令提交给 GPU（与 WebGPU 语义一致）。

3. **`onFinalize` 漏 destroy**：`Model`、`Buffer` 不会随页面关闭自动释放；长时间运行的 dashboard 会涨 GPU 内存。

4. **bufferLayout 与 shader attribute 名不一致**：`Model` 靠名字绑定；拼写差一个字母表现为「全黑屏、无 GL 报错」——用 `device.features` 与 shader 反射交叉核对。

5. **DynamicTexture 未就绪就 draw**：`Model.draw()` 在纹理异步加载完成前返回 `false`；需在 `onRender` 里判断或监听加载完成，避免闪屏。

6. **把 luma.gl 当场景图用**：没有内置 Camera、Light、骨骼动画；这些在 deck.gl 或自研层解决。硬套 Three.js 心智会反复撞墙。

## 适用 vs 不适用

**适用**：

- 与 deck.gl / loaders.gl / math.gl 同栈的可视化、地理空间、自动驾驶 XVIZ
- 需要 **WebGL2 与 WebGPU 双后端** 的产品，愿意维护 GLSL+WGSL 或分后端 shader
- 要写自定义图层、compute pass、GPGPU（`BufferTransform`、`Computation`）
- 团队熟悉 GPU 管线，想要 TypeScript 类型安全的便携 Device API

**不适用**：

- 零基础只想快速出 3D 产品 → Three.js / Babylon.js
- 纯 WebGL1 或极老环境 → regl / twgl
- 不做可视化、不需要双后端 → PicoGL 或裸 WebGL2 更轻
- 拒绝写 shader、只要配置式图表 → ECharts / Observable Plot

## 历史小故事（可跳过）

- **2015**：从 PhiloGL 分叉，Uber 内部地理可视化需要可维护的 WebGL 层。
- **2016–2018**：与 deck.gl 深度耦合，shader module 体系成型，支撑百万级点渲染。
- **2019**：捐给 Linux Foundation，与 deck.gl 一起开源治理。
- **2022**：进入 OpenJS Foundation；v9 起 Core API 便携化，拆分 `@luma.gl/webgpu` 实验后端。
- **2024–2026**：官方示例默认 **双后端** 跑通；Chrome WebGPU 特性通过 `DeviceFeatures` 持续对齐。

## 学到什么

1. **便携 GPU API 的正确粒度**：抽象到 Device/Pass/Pipeline，而不是抽象到「场景」——知识可与原生 WebGPU 文档互译。
2. **Adapter 模式解耦后端**：业务代码依赖 `@luma.gl/core` 类型，测试时可换 mock adapter，CI 可只跑 WebGL headless。
3. **Model 是可视化框架的单元**：deck.gl 的 `Layer` 最终落到 luma.gl 的 draw；理解 Model 就理解图层如何变成 GPU 命令。
4. **Shader 模块 + Hook 是复用正路**：比复制粘贴整份 fragment shader 更易维护，也比运行时字符串拼接更安全。

## 延伸阅读

- 官方文档：[luma.gl Docs](https://luma.gl/docs)
- API 总览：[API Overview](https://luma.gl/docs/api-guide)
- 教程：[Setup](https://luma.gl/docs/tutorials)、[Hello Triangle](https://luma.gl/docs/tutorials/hello-triangle)、[Hello Instancing](https://luma.gl/docs/tutorials/hello-instancing)
- 仓库：[github.com/visgl/luma.gl](https://github.com/visgl/luma.gl)
- 姊妹项目：[deck.gl](https://deck.gl/)（高层图层 API）、[loaders.gl](https://loaders.gl/)（数据加载）

## 关联

- [[regl]] —— 函数式 WebGL 命令；luma.gl 的 Model 可类比为跨后端的 command 对象
- [[picogl]] —— 仅 WebGL2 的薄封装；luma.gl 多一层便携 Core + Engine
- [[d3]] —— 2D 可视化；海量地理点下沉 deck.gl + luma.gl
- [[observable-plot]] —— SVG 图表；万级交互点需 GL 路线
- [[playcanvas]] —— 完整游戏引擎，与 luma.gl 的数据 Viz 地基定位不同

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[d3]] —— D3.js — 不是图表库，是写图表库的乐高
- [[deck-gl]] —— deck.gl — Uber 大规模数据可视化
- [[glslify]] —— glslify — Browserify 风格 GLSL 模块
- [[observable-plot]] —— Observable Plot — 你说想看哪两列的关系，库自己画图
- [[picogl]] —— PicoGL.js — 极简 WebGL2 包装
- [[playcanvas]] —— PlayCanvas — 浏览器里跑的 3D 游戏引擎
- [[regl]] —— regl — 函数式 WebGL 封装

