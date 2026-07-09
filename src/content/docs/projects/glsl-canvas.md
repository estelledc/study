---
title: glslCanvas — Book of Shaders 配套库
来源: https://github.com/patriciogonzalezvivo/glslCanvas
日期: 2026-07-09
分类: projects / graphics
难度: 初级
---

## 是什么

glslCanvas 是一个**把 GLSL shader 放进网页 `<canvas>` 里运行**的小型 JavaScript 库。日常类比：你已经有一张电子画布，glslCanvas 像一个临时投影师，负责把你的光影小短片投到画布上。

普通 WebGL 入门很像自己搭舞台：找画布、申请 WebGL 上下文、编译 vertex shader、编译 fragment shader、传 uniform、开动画循环。glslCanvas 把这些重复动作先打包好，让初学者把注意力放在 fragment shader 的颜色公式上。

它由 Patricio Gonzalez Vivo 维护，和《The Book of Shaders》、在线 glslEditor 的学习体验同源。GitHub 约 1.5k star，定位不是大而全的 3D 引擎，而是**让一段 shader 能快点在浏览器里亮起来**。

要注意：它不是完整 Shadertoy 克隆。Shadertoy 常用 `iTime`、`iResolution`、`mainImage`；glslCanvas 默认给的是 `u_time`、`u_resolution`、`main()`。但你可以用几行宏把两边名字接起来。

## 为什么重要

不理解 glslCanvas，下面这些事很难解释：

- 为什么《The Book of Shaders》里的代码可以边改边看，而不用每次手写一堆 WebGL 样板代码
- 为什么 fragment shader 学习常从一整块全屏 canvas 开始，而不是先画复杂 3D 模型
- 为什么 `u_time`、`u_resolution`、`u_mouse` 这种变量总在 shader 教程里反复出现
- 为什么艺术网页、交互海报、shader 草稿需要的工具和 [[threejs]] 这种完整 3D 引擎不一样

## 核心要点

glslCanvas 的核心可以拆成 **三件事**：

1. **把 canvas 变成 shader 舞台**：它读取 `<canvas>` 上的 `data-fragment` 或 `data-fragment-url`。类比：你把剧本贴在舞台门口，工作人员自动拿去排练。

2. **替你准备常见输入**：它会维护 `u_time`、`u_resolution`、`u_mouse`，也能把图片塞进 `sampler2D`。类比：演员每一秒都能知道现在几点、舞台多大、观众手指在哪里。

3. **允许热更新 shader**：JS 里可以 `sandbox.load(newCode)` 重新编译 fragment shader。类比：导演现场改台词，灯光师不用拆掉整座剧场，只换正在演的脚本。

从源码看，它默认画一个覆盖全屏的矩形，fragment shader 才是真正决定每个像素颜色的部分。这就是为什么它特别适合 Book of Shaders 那种“从像素颜色公式学图形”的路线。

## 实践案例

### 案例 1：把一个 fragment 文件挂到 canvas 上

```html
<script src="https://cdn.jsdelivr.net/npm/glslCanvas@0.2.6/dist/GlslCanvas.min.js"></script>
<canvas
  class="glslCanvas"
  data-fragment-url="/shaders/gradient.frag"
  width="500"
  height="500">
</canvas>
```

```glsl
#ifdef GL_ES
precision mediump float;
#endif
uniform vec2 u_resolution;
void main() {
  vec2 st = gl_FragCoord.xy / u_resolution.xy;
  gl_FragColor = vec4(st.x, st.y, 0.8, 1.0);
}
```

**逐部分解释**：`class="glslCanvas"` 和 `data-fragment-url` 让库知道这块画布要跑哪个 shader；`u_resolution` 是画布尺寸；`gl_FragCoord` 是当前像素位置。这个案例对应 README 的“声明式挂载”用法，但这里换成了更小的渐变例子。

### 案例 2：做一个能实时改 shader 的小编辑器

```html
<textarea id="editor">void main(){ gl_FragColor = vec4(1.0); }</textarea>
<canvas id="preview" width="640" height="360"></canvas>
<script>
const sandbox = new GlslCanvas(document.getElementById("preview"));
const editor = document.getElementById("editor");
sandbox.load(editor.value);
editor.addEventListener("input", () => sandbox.load(editor.value));
sandbox.setUniform("u_brightness", 0.6);
</script>
```

**逐部分解释**：`new GlslCanvas(canvas)` 创建一个 sandbox；`load()` 把 textarea 里的字符串当 shader 重新编译；`setUniform()` 把 JS 世界里的参数传给 GPU。Book of Shaders 的“边写边看”体验，本质就是这种热更新闭环。

### 案例 3：用纹理和 buffer 做会动的水波

```html
<canvas
  id="glslCanvas"
  data-textures="data/moon.jpg"
  data-fragment="...water shader..."
  width="800"
  height="600">
</canvas>
<script>
const sandbox = new GlslCanvas(document.getElementById("glslCanvas"));
</script>
```

```glsl
uniform sampler2D u_tex0;
uniform sampler2D u_buffer0;
uniform sampler2D u_buffer1;
#if defined(BUFFER_0)
  /* 先把上一帧的水波状态写进 buffer */
#else
  /* 再用水波偏移去采样月球纹理 */
#endif
```

**逐部分解释**：`data-textures` 会把图片按顺序绑定成 `u_tex0`；`BUFFER_0` / `BUFFER_1` 是官方 buffers demo 里的多 pass 思路；主画面再读取 buffer，做出鼠标点水后的波纹。这个例子说明 glslCanvas 不只会画静态渐变，也能做需要上一帧状态的效果。

## 踩过的坑

1. **把它当完整 Shadertoy 会踩坑**：变量名和入口函数不完全一样，通常要自己把 `iTime` 映射到 `u_time`。

2. **canvas 尺寸和 CSS 尺寸可能不一致**：CSS 拉伸只改变显示大小，真正像素尺寸仍要同步，否则画面会糊或坐标不准。

3. **GLSL 类型很严格**：`1` 和 `1.0` 不是一回事，新手最常因为少写小数点导致编译失败。

4. **纹理加载是异步的**：图片没加载完时 shader 先跑，第一帧可能是黑的，真实项目要处理加载状态。

## 适用 vs 不适用场景

**适用**：
- 学 Book of Shaders、GLSL fragment shader、生成艺术
- 在博客、作品集、课程页面里嵌一个交互 shader
- 快速试 `u_time`、`u_mouse`、纹理采样、简单多 pass 效果
- 想理解 WebGL 最小闭环，但暂时不想写完整 WebGL 样板

**不适用**：
- 复杂 3D 场景、模型加载、材质系统、相机控制——用 [[threejs]] 或 [[playcanvas]]
- 大型 2D 游戏、精灵管理、碰撞和关卡——用 [[pixi]] 或游戏引擎
- 精细控制 WebGL 状态、buffer、VAO、draw call——看 [[regl]]、[[twgl]]、[[picogl]]
- 生产级可视化组件库——glslCanvas 更像学习和创作草稿本

## 历史小故事（可跳过）

- **2009 年左右**：WebGL 开始进入浏览器，网页终于能直接调用 GPU 画图。
- **2013 年前后**：Shadertoy 让“一个 fragment shader 生成整幅画”的创作方式流行起来。
- **2015 年**：glslCanvas 开源，目标是把 fragment shader sandbox 变成一段网页里能复用的库。
- **之后几年**：《The Book of Shaders》把它用于交互式教学，让读者改一行代码就看到颜色变化。
- **今天**：它仍适合当 shader 入门桥梁；更复杂的工程会继续走向 WebGL 框架或 WebGPU。

## 学到什么

1. **shader 学习的第一步不是 3D，而是像素**：先理解“每个像素都跑一次颜色函数”，再谈模型、光照和材质。

2. **glslCanvas 的价值是省掉样板，不是隐藏 GPU**：你仍然要理解 `uniform`、纹理、fragment shader，只是不用一开始写全部 WebGL 管线。

3. **Book of Shaders 的交互感来自热更新**：编辑器改字符串，`load()` 重新编译，动画循环继续跑。

4. **小库也能有清晰边界**：glslCanvas 专心做 shader sandbox，不抢 [[threejs]] 这类引擎的工作。

## 延伸阅读

- 仓库：[patriciogonzalezvivo/glslCanvas](https://github.com/patriciogonzalezvivo/glslCanvas)
- 官方演示页：[glslCanvas demo](https://patriciogonzalezvivo.github.io/glslCanvas/)
- 配套教材：[The Book of Shaders](https://thebookofshaders.com/)
- WebGL 基础：[WebGL Fundamentals](https://webglfundamentals.org/webgl/lessons/webgl-fundamentals.html)
- [[owens-2007-gpgpu-survey]] —— 早期“把计算塞进 shader”的历史背景
- [[deering-1988-triangle-processor]] —— fragment shader 出现前，图形硬件怎样一步步可编程化

## 关联

- [[picogl]] —— 更底层的 WebGL2 封装，适合理解 glslCanvas 省掉了哪些步骤
- [[twgl]] —— 同样减少 WebGL 样板，但目标是通用 WebGL 程序而非 shader 草稿
- [[regl]] —— 把 WebGL 状态声明化，适合和 glslCanvas 的极简 sandbox 对比
- [[threejs]] —— 完整 3D 引擎；glslCanvas 只负责把 shader 跑起来
- [[pixi]] —— 浏览器高性能 2D 渲染库，抽象层比 glslCanvas 更偏产品工程
- [[playcanvas]] —— Web 3D 引擎路线，适合需要编辑器和场景系统的项目
- [[canvas-datagrid]] —— 同样基于 canvas，但它用 2D 绘图做表格，不走 GLSL shader

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
