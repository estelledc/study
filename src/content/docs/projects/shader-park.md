---
title: Shader Park — 程序化 SDF 着色器 DSL
来源: https://github.com/shader-park/shader-park-core
日期: 2026-07-09
分类: graphics
难度: 初级
---

## 是什么

Shader Park 是一个**用 JavaScript 写程序化 2D / 3D 着色器**的工具。日常类比：普通 GLSL 像让你直接和显卡讲外语；Shader Park 像一个懂显卡话的翻译，你用更像 p5.js 的 JavaScript 描述形状、颜色、时间和鼠标，它替你变成 GLSL。

它最适合描述 SDF 场景。SDF 可以先理解成“每个空间点到最近表面的距离表”：距离为 0 的地方就是物体表面，距离大于 0 说明还在外面。

所以你写的不是“这里放一个网格模型”，而是“空间里有一个球、一个盒框、它们怎么混合、怎么随时间变形”。Shader Park 把这段描述编译到 GPU 上实时运行，让算法艺术不必从一整套 raymarching 样板开始。

## 为什么重要

不理解 Shader Park，很难解释下面这些事：

- 为什么很多算法艺术作品看起来像 3D 模型，但并没有传统建模软件导出的 mesh。
- 为什么 `sphere()`、`box()`、`blend()` 这种普通 JS 调用，最后会在显卡里变成 GLSL。
- 为什么 Three.js 里一个几何体可以只当“承载空间”，真正的形状由 shader 决定。
- 为什么生产构建会想把 Shader Park 预编译成 GLSL，避免把完整编译器塞进浏览器。

它的价值不是“让着色器不用学”，而是把第一步门槛降下来：先学会用代码组织形状，再慢慢补 SDF、GLSL、raymarching 的底层知识。

## 核心要点

1. **DSL 像菜谱**：你写的是“旋转、上色、放球、混合盒子”的步骤。Shader Park 读完这份菜谱，再替你生成显卡能执行的 GLSL。

2. **SDF 像地形测距仪**：每个点都能问“离表面还有多远”。raymarching 就按这个距离一步步向前走，走到距离接近 0 时认为撞到物体。

3. **目标后端像不同舞台**：同一段雕塑代码可以送到最小 canvas renderer、Three.js、TouchDesigner 或预编译构建。舞台变了，核心场景描述尽量不变。

## 实践案例

### 案例 1：官方基础模板把 DSL 画到 canvas

官方 `es6-starter-template` 的关键路径很短：`spCode()` 写雕塑，`sculptToMinimalRenderer()` 把它挂到页面 canvas。

```js
import { sculptToMinimalRenderer } from 'shader-park-core'
import { spCode } from './spCode.js'

const canvas = document.querySelector('.my-canvas')
sculptToMinimalRenderer(canvas, spCode)
```

逐部分看：

- `spCode` 不是普通业务函数，它会被 Shader Park 读取并转换。
- `canvas` 是最终画布，浏览器只需要知道画在哪里。
- `sculptToMinimalRenderer` 做了“编译 + 创建 WebGL renderer + 连到 canvas”的胶水工作。

对应的雕塑代码可以长这样：

```js
export function spCode() {
  rotateY(mouse.x * PI / 2 + time * 0.5)
  metal(0.5)
  shine(0.4)
  color(getRayDirection() + 0.2)
  boxFrame(vec3(0.4), 0.02)
  blend(nsin(time) * 0.6)
  sphere(0.2)
}
```

这段代码里，`time` 和 `mouse` 让作品动起来、跟鼠标有关；`boxFrame` 和 `sphere` 是形状；`blend` 决定两个形状如何融合。

### 案例 2：Three.js 里把雕塑当成一个 Mesh

官方 Three.js 模板展示了另一个真实用法：Three.js 负责相机、场景、轨道控制器，Shader Park 负责生成材质里的空间逻辑。

```js
import { createSculpture } from 'shader-park-core'
import { spCode } from './spCode.js'

const params = { time: 0 }
const mesh = createSculpture(spCode, () => ({
  time: params.time,
}))
scene.add(mesh)
```

逐部分看：

- `createSculpture` 会自动创建一个可渲染对象，适合先跑通作品。
- 第二个参数返回 uniforms，`time` 每帧更新，但 shader 不需要重新编译。
- `scene.add(mesh)` 说明它已经进入 Three.js 世界，可以和相机、灯光、控制器一起工作。

如果你已经有 Three.js 几何体，也可以换成 `createSculptureWithGeometry(geometry, spCode, ...)`。这时几何体更像“容器边界”，Shader Park 的 SDF 负责真正看到的形状和材质。

### 案例 3：Vite 预编译把 DSL 提前变成 GLSL

官方 `es6-vite-prebuild-three-template` 解决的是生产环境问题：开发时写 Shader Park，构建时生成 GLSL，浏览器运行时不再带完整编译链。

```js
import generatedShader from './spCode.sp'

const material = new ShaderMaterial({
  uniforms: uniformDescriptionToThreeJSFormat(generatedShader.uniforms),
  vertexShader: generatedShader.vert,
  fragmentShader: generatedShader.frag,
  transparent: true,
  side: BackSide,
})
```

逐部分看：

- `spCode.sp` 是 Shader Park 源文件，Vite 插件在构建阶段把它变成 shader 数据。
- `generatedShader.vert` 和 `generatedShader.frag` 已经是 Three.js 能吃的源码。
- `uniforms` 仍然保留可更新输入，所以交互没有因为预编译消失。

对应的 `.sp` 里仍然像在写算法雕塑：

```js
let exampleExternalInput = input()
const s = getSpace()
const rtp = getSpherical()
const rots = 80 * nsin(time) + 10
repeatRadial(rots)
color((normal * exampleExternalInput) * 0.5 + 0.5)
box(0.15, 0.15, 0.03)
```

这就是 Shader Park 的核心取舍：创作者写高层 DSL，工程构建把它落成更轻、更安全的 GLSL。

## 踩过的坑

1. **把它当 Three.js 替代品**：Shader Park 主要管 SDF shader，场景组织、相机和复杂交互仍常交给 Three.js。
2. **以为 JS 分支都能随便写**：官方文档提示，引用 `time`、`vec3`、`input` 等内置值的 `if` 分支有限制，因为它们最终要映射到 shader 表达式。
3. **忽略几何质量设置**：SDF 作品出现破面或扭曲时，常常不是形状错了，而是需要调高 geometry quality 或步进参数。
4. **运行时编译塞进生产包**：直接在浏览器里带完整 `shader-park-core` 更方便，但包更重，还可能涉及 `eval`；生产更适合预编译路线。

## 适用 vs 不适用

**适用**：

- 算法艺术、现场视觉、音乐可视化这类“形状随时间和输入变化”的作品。
- 想学习 SDF / GLSL，但一开始不想手写完整 raymarching boilerplate。
- 已有 Three.js 项目，需要快速尝试程序化材质或空间变形。
- TouchDesigner、网页或创意编码环境里需要把 shader 逻辑做成可移植片段。

**不适用**：

- 传统游戏关卡建模，主要对象是大量 mesh、骨骼动画和物理碰撞。
- 对 GLSL 每一行输出都要完全手控的图形底层研究。
- 大型工程里所有视觉都已由美术资产管线、材质编辑器和渲染规范锁定。
- 只想画普通图表或 UI 动效，用 Canvas / SVG / CSS / D3 通常更直接。

## 历史小故事（可跳过）

- **2021 年前后**：Shader Park 围绕网页 live coding 和程序化雕塑展开，核心思路是“JS → Shader”。
- **随后**：`shader-park-core` 把能力拆成库，开始支持最小 renderer、Three.js、Hydra、TouchDesigner 等目标。
- **官方文档阶段**：项目把 `sphere`、`box`、`blend`、`input`、`mouse`、`time` 这些函数整理成交互式参考，让新人能边改边看。
- **工程化阶段**：Vite 预编译模板出现，说明项目不只服务现场实验，也开始照顾生产包体、首屏速度和安全边界。
- **现在**：核心仓库稳定在数百 Star 量级，定位更像创意编码里的“着色器入门桥”，不是通用渲染引擎。

## 学到什么

- **DSL 的意义是收窄表达面**：不让新人先背完整 GLSL，而是先用有限积木搭出可见结果。
- **SDF 把建模变成函数问题**：物体不一定来自三角面片，也可以来自“距离场怎么组合”。
- **编译时机是工程取舍**：开发期运行时编译最快试错，生产期预编译更轻、更稳。
- **创作工具也有架构边界**：Shader Park 擅长描述程序化形状，但不负责替代完整场景引擎。

## 延伸阅读

- 官方仓库：[shader-park-core](https://github.com/shader-park/shader-park-core)（看项目定位、目标后端和转换入口）
- 官方文档：[References JS](https://docs.shaderpark.com/references-js/)（按几何、材质、输入、数学函数组织）
- 官方示例：[shader-park-examples](https://github.com/shader-park/shader-park-examples)（基础模板、Three.js 模板、预编译模板）
- 官方 GLSL 说明：[References GLSL](https://docs.shaderpark.com/references/)（理解 `surfaceDistance`、`shade` 与 raymarching 样板）
- 教程案例：[Audio Reactive Shaders with Three.js and Shader Park](https://tympanus.net/codrops/2023/02/07/audio-reactive-shaders-with-three-js-and-shader-park/)（音频输入和 Three.js 集成）

## 关联

- [[threejs]] —— Shader Park 常把输出挂进 Three.js 场景里，由 Three.js 管相机和渲染循环。
- [[glslify]] —— 都在降低 GLSL 组织成本，但 glslify 更像模块打包，Shader Park 更像高层 DSL。
- [[vite]] —— 预编译模板依赖 Vite 插件，把 `.sp` 文件提前转成 shader。
- [[d3]] —— 都是“用代码生成视觉”，但 D3 偏数据图形，Shader Park 偏 SDF 空间和材质。
- [[mermaid]] —— 同样是 DSL 思路：文本描述高层结构，再生成视觉结果。
- [[raylib]] —— 对照图形入门路线：raylib 教你直接画和管循环，Shader Park 教你用函数描述空间。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
