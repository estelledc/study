---
title: PicoGL.js — WebGL2 的轻量图形封装
来源: https://github.com/tsherif/picogl.js
日期: 2026-07-08
分类: 图形
难度: 中级
---

## 是什么

PicoGL.js 是一个把 WebGL 2 常见样板代码收口的轻量 JS 库。

日常类比：原生 WebGL 像自己开一家小五金店——每颗螺丝、每把扳手都要亲手点名、亲手摆放；PicoGL 不替你设计家具，只把货架标签和取货流程统一好，让你更快进入「画什么」而不是「怎么绑缓冲」。

它不替你做 3D 引擎，也不替你决定渲染算法。它做的是：把上下文、Program（着色器程序）、缓冲区、纹理这些边界封好，让你更快进入场景和 shader 逻辑。

## 为什么重要

- 纯 WebGL 学习曲线陡，初始化代码多，容易出错。
- 真实项目里你更关心的是「把模型画出来并维护状态」，不是反复写绑定。
- WebGPU 兴起前后都仍有大量 WebGL2 资产，轻量封装有复用价值。

PicoGL 帮你把「硬件 API 细节」与「业务可见逻辑」分离：你仍要懂管线，但少写重复样板。

## 核心要点

1. **App 管状态**：`PicoGL.createApp(canvas)` 创建应用对象，统一清屏色、viewport、深度测试等 GL 状态。类比：店里只有一个收银台，状态改动都从这里走。

2. **资源有构造函数**：`createProgram` / `createPrograms`、`createVertexBuffer`、`createVertexArray`、`createTexture2D` 把常见对象收成工厂方法。类比：原材料进同一仓库，标签统一，排错路径更短。

3. **DrawCall 是组合单元**：真正绘制前，用 `createDrawCall(program, vertexArray)` 把「用哪套着色器 + 喂哪些顶点」绑成一次可复用的绘制调用，再挂 uniform / 纹理。类比：备菜清单写好后，出餐只需按清单执行，不必每次重排厨房。

## 实践案例

### 案例 1：创建 App 并清屏

```javascript
import PicoGL from "picogl";

const canvas = document.querySelector("canvas");
const app = PicoGL.createApp(canvas)
  .clearColor(0.1, 0.1, 0.1, 1)
  .clear();
```

**逐部分解释**：

- `createApp` 拿到 WebGL2 上下文并包成 App
- `clearColor` 设定 RGBA 清屏色（这里偏深灰）
- `clear()` 清颜色缓冲，避免上一帧残影

### 案例 2：Program + 顶点缓冲 + VertexArray

```javascript
const positions = app.createVertexBuffer(
  PicoGL.FLOAT, 2,
  new Float32Array([-0.5, -0.5, 0.5, -0.5, 0.0, 0.5])
);
const vertexArray = app.createVertexArray()
  .vertexAttributeBuffer(0, positions);

app.createPrograms([vsSource, fsSource]).then(([program]) => {
  const drawCall = app.createDrawCall(program, vertexArray);
  app.clear();
  drawCall.draw();
});
```

**逐部分解释**：

- `createVertexBuffer`：每顶点 2 个 float，三个点组成三角形
- `createVertexArray`：把 attribute location 0 绑到该缓冲
- `createPrograms`：异步编译着色器；再 `createDrawCall` 组合后 `draw()`

### 案例 3：纹理与 uniform

```javascript
const tex = app.createTexture2D(image);
const drawCall = app.createDrawCall(program, vertexArray)
  .texture("uTex", tex)
  .uniform("uScale", 1.0);
app.clear();
drawCall.draw();
```

**逐部分解释**：

- 先有 `program` 与 `vertexArray`，再创建 `drawCall`
- `.texture("uTex", tex)` 把采样器名和纹理对象对齐
- `.uniform(...)` 传标量/向量；名称必须与 shader 声明一致，否则常静默失败

## 踩过的坑

1. **忘记 resize / DPR**：`canvas.width/height` 与 CSS 尺寸、`devicePixelRatio` 不一致会糊。改尺寸后调用 `app.viewport(0, 0, w, h)`，通常比重建全部资源便宜。
2. **Shader 变量未对齐**：attribute location、uniform / sampler 名称或类型不一致时，WebGL 往往不抛可读异常。先用简化色 shader 验证 DrawCall，再加纹理。
3. **每帧 new Program**：Program / Buffer 应在初始化创建并复用；热路径只改 uniform 与 `draw()`，否则对象泄露、编译卡顿。
4. **忽略 context lost**：页面切后台或 GPU 复位后上下文可能丢失，需监听 `webglcontextlost` / `restored` 并重建资源。

## 适用 vs 不适用场景

**适用**：

- 你懂（或愿意学）WebGL2 管线，但讨厌每次手写绑定样板
- 小型可视化、教学 demo、单场景实验：几十到几百次 DrawCall/帧通常够用
- 需要直接控制 shader 与 GPU 状态，又不想引入完整场景图

**不适用**：

- 要场景图、材质系统、编辑器级资源管线 → 看 [[three-js]] / [[babylon-js]]
- 只要 2D sprite 批处理 → [[pixi-js]] 更合适
- 希望「完全不碰 shader」的业务页；PicoGL 假设你自己写 GLSL

## 历史小故事（可跳过）

- **2010s 中期**：WebGL1/2 普及后，大量教程仍从原始 `gl.bindBuffer` 起步，样板很长。
- **2017 年前后**：Tarek Sherif 发布 PicoGL.js，定位「懂管线的人用的最小 WebGL2 封装」，并配有教程与 API 文档。
- **设计取舍**：刻意不做场景图；唯一偏高层的抽象是 DrawCall。
- **今天**：WebGPU 兴起后，PicoGL 仍适合 WebGL2 资产维护与教学对照。

## 学到什么

1. 封装不是为了隐藏知识，而是减少认知噪音。
2. WebGL2 上手难点不全在算法，更多在状态管理。
3. DrawCall 把「程序 + 顶点布局 + 资源绑定」收成可复用单位。
4. 小而稳定的 API 让性能优化更容易聚焦到 GPU 与资源生命周期。
5. 先固定一条「清屏 → 编译 → 缓冲 → DrawCall → draw」路径，再扩展纹理与多 pass。

## 延伸阅读

- 官方仓库：[PicoGL.js](https://github.com/tsherif/picogl.js)
- API 文档：[PicoGL.js Docs](https://tsherif.github.io/picogl.js/docs/)
- 作者教程：[WebGL 2 development with PicoGL.js](https://tsherif.wordpress.com/2017/07/26/webgl-2-development-with-picogl-js/)
- MDN：[WebGL API](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API)
- [[webgl]] —— WebGL 生态与状态模型
- [[three-js]] —— 高层场景图封装对照

## 关联

- [[webgl]] —— WebGL2 API 的底座和状态模型
- [[shader]] —— 着色器逻辑和数据喂入关系
- [[graphics-pipeline]] —— 从顶点到片元的执行路径
- [[visualization]] —— 图形化数据展示实践
- [[opengl]] —— WebGL 与 OpenGL 的语义衔接
- [[three-js]] —— 高层图形库的替代方案
- [[babylon-js]] —— 更完整 3D 生态的图形引擎
- [[pixi-js]] —— 2D 批处理路线，和 PicoGL 的定位对照

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
