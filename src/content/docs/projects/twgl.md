---
title: TWGL — 极薄 WebGL helpers
来源: 'https://github.com/greggman/twgl.js'
日期: 2026-07-08
分类: graphics
难度: 初级
---

## 是什么

TWGL 是一个**帮你少写 WebGL 样板代码的小工具库**。日常类比：WebGL 像手动布置舞台灯光、接线、调角度；TWGL 像给你一套标好接口的接线板，但灯怎么打、场景怎么动，还是你自己决定。

最小感觉大概是这样：

```js
const programInfo = twgl.createProgramInfo(gl, ["vs", "fs"]);
const arrays = { position: [-1, -1, 0, 1, -1, 0, -1, 1, 0] };
const bufferInfo = twgl.createBufferInfoFromArrays(gl, arrays);

gl.useProgram(programInfo.program);
twgl.setBuffersAndAttributes(gl, programInfo, bufferInfo);
twgl.setUniforms(programInfo, { u_time: performance.now() * 0.001 });
twgl.drawBufferInfo(gl, bufferInfo);
```

它没有把 WebGL 包成一个完整引擎，也不替你设计场景树、材质系统、相机组件。它只把最容易重复、最容易写错的几步收起来：编译 shader、建 buffer、绑定 attribute、传 uniform、创建 texture、创建 framebuffer。

所以 TWGL 的定位很窄：**你想学和控制 WebGL 本身，但不想每个 demo 都先写一大坨固定代码**。

## 为什么重要

不理解 TWGL 这种“薄 helper”，下面这些事会很难解释：

- 为什么直接写 WebGL 时，一个简单方块也会被 `getUniformLocation`、`vertexAttribPointer`、`texParameteri` 淹没。
- 为什么 three.js 很快能出效果，但有时你不知道底层 shader、buffer、framebuffer 到底发生了什么。
- 为什么教学、实验、shader demo 常常需要“少一点样板、多一点控制”，而不是一整个 3D 引擎。
- 为什么同样是封装，TWGL 更像工具箱，[[threejs]]、[[playcanvas]] 更像装修公司。

## 核心要点

TWGL 的核心可以拆成 **三件事**：

1. **把名字对上**：shader 里写 `attribute position`、`uniform u_time`，JavaScript 里也用这些名字。类比：快递单上的姓名和门牌号对上，包裹才能送到。

2. **把重复动作打包**：`createProgramInfo` 负责 program 和 setter，`createBufferInfoFromArrays` 负责 WebGLBuffer，`setUniforms` 负责按类型调用正确的 `gl.uniform*`。类比：厨房备菜不是替你做菜，而是把切菜、洗菜、摆盘这些固定动作先安排好。

3. **保留 WebGL 原味**：你仍然拿着 `gl`，仍然写 GLSL，仍然要理解坐标、纹理、帧缓冲。类比：自动挡车省掉频繁换挡，但路怎么开、什么时候刹车还是司机的事。

## 实践案例

### 案例 1：把一个 shader demo 画出来

README 的 tiny example 用 TWGL 画一个由 shader 控制的画面，核心流程是“建程序 → 建几何数据 → 每帧传 uniform → draw”。

```js
const gl = document.querySelector("canvas").getContext("webgl");
const programInfo = twgl.createProgramInfo(gl, ["vs", "fs"]);
const bufferInfo = twgl.createBufferInfoFromArrays(gl, {
  position: [-1, -1, 0, 1, -1, 0, -1, 1, 0, 1, 1, 0],
});

function render(time) {
  twgl.resizeCanvasToDisplaySize(gl.canvas);
  gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
  gl.useProgram(programInfo.program);
  twgl.setBuffersAndAttributes(gl, programInfo, bufferInfo);
  twgl.setUniforms(programInfo, {
    time: time * 0.001,
    resolution: [gl.canvas.width, gl.canvas.height],
  });
  twgl.drawBufferInfo(gl, bufferInfo, gl.TRIANGLE_STRIP);
  requestAnimationFrame(render);
}
requestAnimationFrame(render);
```

逐部分解释：

- `createProgramInfo`：编译 shader，并把 attribute / uniform 的位置和 setter 记好。
- `createBufferInfoFromArrays`：把普通数组变成 GPU 能读的 buffer。
- `resizeCanvasToDisplaySize` + `viewport`：让画布像素尺寸和显示尺寸对齐，不然画面会糊或被拉伸。
- `setUniforms`：把时间和分辨率交给 shader，shader 才能每帧算出不同颜色。

### 案例 2：一次性创建多种纹理

官方文档展示过 `createTextures`：它可以把图片、canvas、cubemap、小数组纹理统一写成一个对象。

```js
const textures = twgl.createTextures(gl, {
  clover: { src: "images/clover.jpg" },
  checker: {
    mag: gl.NEAREST,
    min: gl.LINEAR,
    src: [
      255, 255, 255, 255,
      192, 192, 192, 255,
      192, 192, 192, 255,
      255, 255, 255, 255,
    ],
  },
  skybox: {
    target: gl.TEXTURE_CUBE_MAP,
    src: ["px.jpg", "nx.jpg", "py.jpg", "ny.jpg", "pz.jpg", "nz.jpg"],
  },
});
twgl.setUniforms(programInfo, { u_diffuse: textures.clover });
```

逐部分解释：

- `clover`：普通 2D 图片纹理，适合贴在模型表面。
- `checker`：直接从 JavaScript 数组造一个 2x2 小纹理，适合调试 UV。
- `skybox`：六张图组成 cubemap，适合天空盒或反射。
- `setUniforms`：sampler uniform 可以直接拿 WebGLTexture，TWGL 会帮你绑定到纹理单元。

### 案例 3：离屏渲染到 framebuffer

官方 framebuffer 文档给出的典型用法是先创建 `FramebufferInfo`，再在渲染时绑定它；它会同时记住 framebuffer、附件和尺寸。

```js
const attachments = [
  { format: gl.RGBA, type: gl.UNSIGNED_BYTE, minMag: gl.NEAREST },
];
const fbi = twgl.createFramebufferInfo(gl, attachments, 512, 512);

twgl.bindFramebufferInfo(gl, fbi);
gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
twgl.setBuffersAndAttributes(gl, programInfo, bufferInfo);
twgl.drawBufferInfo(gl, bufferInfo);

twgl.bindFramebufferInfo(gl, null);
twgl.setUniforms(screenProgramInfo, { u_scene: fbi.attachments[0] });
```

逐部分解释：

- `createFramebufferInfo`：创建 framebuffer 和颜色附件，返回一个能继续复用的对象。
- `bindFramebufferInfo`：绑定 framebuffer 的同时设置 viewport，这是很多新人会漏掉的一步。
- `attachments[0]`：离屏画出的结果本质上是一张 texture，可以再拿去做后处理。
- `null`：绑定回 canvas，后续才会画到屏幕上。

## 踩过的坑

1. **以为 TWGL 会替你学 WebGL**：它只是少写样板，坐标系、shader、深度测试、纹理过滤仍然要懂。

2. **attribute 名字对不上**：数组里的 `position` 必须能匹配 shader 里的 attribute 名；名字不一致，TWGL 没法猜你的意思。

3. **uniform 数组想只改一个叶子值**：官方 issue 里讨论过，像 `"lights[1].nearFar[1]"` 这种叶子数组下标不是通用写法，通常要传整个 `nearFar` 数组。

4. **framebuffer incomplete 不一定是 TWGL 错**：真实 issue 里有人用 float framebuffer 做计算，最后发现格式支持和 clip space 都要自己确认；必要时还要 `gl.checkFramebufferStatus`。

## 适用 vs 不适用场景

**适用**：
- 你正在学 WebGL，想把注意力放在 shader、buffer、uniform 的机制上。
- 你在写小型 shader demo、教学示例、可视化实验，不需要完整场景引擎。
- 你希望保留底层控制权，同时减少“查 location、绑 buffer、传 uniform”的重复代码。

**不适用**：
- 你想快速做完整 3D 应用、灯光材质、模型加载、相机控制；这时 [[threejs]] 或 [[playcanvas]] 更合适。
- 你完全不想碰 GLSL、坐标空间、纹理参数；TWGL 不会把这些概念藏起来。
- 你需要大型工程的实体组件系统、资源管线、编辑器，或极复杂的 WebGL2 uniform block 封装；这时 TWGL 不够。

## 历史小故事（可跳过）

- **2010s 前后**：WebGL 让浏览器能直接调用 GPU，但原生 API 很啰嗦，学习曲线陡。
- **Gregg Tavares**：也就是 greggman，长期维护 WebGL Fundamentals，用大量小例子教人理解 WebGL。
- **TWGL 出现**：它的目标不是“替代 WebGL”，而是让 WebGL 示例少一点噪音，尤其少写重复绑定代码。
- **设计取舍**：README 直接提醒：想快速做东西用 three.js；想低层控制 WebGL，再考虑 TWGL。

## 学到什么

1. **薄封装也很有价值**：不是所有库都要变成大框架；有时只包住重复动作，就能让学习更顺。
2. **命名就是契约**：TWGL 能省事，前提是 shader 名字、数组字段、uniform 字段互相对得上。
3. **helper 不等于魔法**：framebuffer 是否完整、clip space 是否正确、纹理格式是否支持，仍然是 WebGL 规则。
4. **选工具要看目标**：想理解底层选 TWGL；想快速做产品效果选 [[threejs]]；想函数式组织 draw call 可以看 [[regl]]。

## 延伸阅读

- 官方仓库：[greggman/twgl.js](https://github.com/greggman/twgl.js)
- 官方文档：[twgljs.org/docs](https://twgljs.org/docs/module-twgl.html)
- 官方示例：[twgljs.org/examples](https://twgljs.org/examples/)
- 背景教程：[WebGL Fundamentals](https://webglfundamentals.org/)
- 真实坑点：[float 32 framebuffer incomplete issue](https://github.com/greggman/twgl.js/issues/68)
- [[regl]] —— 另一种把 WebGL draw call 组织成声明式对象的思路

## 关联

- [[threejs]] —— 更高层的 3D 引擎，适合快速做完整场景。
- [[regl]] —— 同样面向 WebGL，但更强调声明式 draw command。
- [[pixi]] —— 偏 2D 渲染和游戏 UI，抽象层比 TWGL 高。
- [[playcanvas]] —— 带编辑器和运行时的 Web 3D 引擎，和 TWGL 的“薄 helper”相反。
- [[d3]] —— 都常用于可视化，但 D3 管数据到 DOM / SVG，TWGL 管 GPU 绘制。
- [[jax]] —— 都有“把重复底层细节交给工具”的味道，只是 JAX 面向数值计算，TWGL 面向浏览器 GPU。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[glsl-canvas]] —— glslCanvas — Book of Shaders 配套库
- [[glslify]] —— glslify — 给 GLSL 用的 npm 模块系统
