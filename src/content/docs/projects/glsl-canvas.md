---
title: glslCanvas — Book of Shaders 配套库
来源: 'https://github.com/patriciogonzalezvivo/glslCanvas'
日期: 2026-06-13
分类: 图形学
子分类: 渲染与图形
provenance: pipeline-v3
---

## 是什么

**glslCanvas** 是一个轻量级 JavaScript 库，把 GLSL 片段/顶点着色器加载到 HTML `<canvas>` 上，自动创建 WebGL 上下文、编译 shader、驱动动画循环。Patricio Gonzalez Vivo 为 [The Book of Shaders](https://thebookofshaders.com) 和 [glslEditor](https://editor.thebookofshaders.com) 编写，是「在浏览器里跑着色器教程」的默认运行时。

日常类比：

> 学钢琴时，你关心的是乐谱（GLSL 代码），而不是每次自己组装钢琴、调音、接电源。glslCanvas 就像 **带自动演奏功能的电子琴**：你把乐谱塞进去（`data-fragment` 或 `.load()`），它负责 WebGL 初始化、uniform 注入、逐帧刷新。Book of Shaders 里每个可交互示例背后，基本都是 `<canvas class="glslCanvas">` 在干活。

与 [glslify](/docs/projects/glslify) 的分工：glslify 在 **构建阶段** 把 `#pragma glslify` 模块打包成字符串；glslCanvas 在 **运行时** 把字符串（或 URL）变成屏幕上的像素。二者可组合——先用 glslify 打包，再把结果交给 glslCanvas 渲染。

## 为什么重要

不理解 glslCanvas，下面几件事都说不通：

- 为什么 Book of Shaders 第 4 章「Running your shader」只写一行 `<canvas class="glslCanvas" data-fragment-url="...">` 就能跑
- 为什么教程里的 shader 可以直接写 `uniform float u_time`，不用自己写 `requestAnimationFrame` 去更新
- 为什么同一套 GLSL 还能在 glslViewer（命令行/Raspberry Pi）、glslEditor（在线 IDE）里跑——它们共享 **uniform 命名约定** 和 shader 结构
- 为什么做 shader 原型时，不必先搭 Three.js / regl 整套渲染管线

## 核心概念

### 1. 声明式 HTML  vs  命令式 JS

两种入口，目标相同：

| 方式 | 典型场景 | 关键 API |
|------|----------|----------|
| **HTML 属性** | 静态教程页、Markdown 嵌入示例 | `class="glslCanvas"` + `data-fragment-url` |
| **JavaScript 构造** | 动态换 shader、接 UI 控件 | `new GlslCanvas(canvas)` + `.load()` |

页面加载后，所有带 `glslCanvas` class 的 canvas 会被自动扫描；实例缓存在 `window.glslCanvases` 数组里，方便调试或多实例管理。

### 2. Shader 加载属性

通过 data 属性把 GLSL 源传给 canvas：

| 属性 | 含义 |
|------|------|
| `data-fragment` | 内联片段着色器字符串 |
| `data-fragment-url` | 片段着色器文件 URL |
| `data-vertex` / `data-vertex-url` | 顶点着色器（可选；默认全屏四边形） |
| `data-textures` | 逗号分隔纹理 URL，依次绑定到 `u_tex0`, `u_tex1`, … |

**注意**：`data-fragment` 里的换行在 HTML 属性中很难写对；生产环境更推荐 `data-fragment-url` 或 JS 的 `.load()`。Stack Overflow 上常见「Django 模板注入 data-fragment 不工作」，就是因为 HTML 转义破坏了 GLSL 源码——应改用 JS `sandbox.load(code)`。

### 3. 内置 Uniform（约定优于配置）

glslCanvas 自动注入一批 uniform，与 glslViewer 生态对齐，Book of Shaders 示例直接可用：

| Uniform | 类型 | 来源 |
|---------|------|------|
| `u_time` | `float` | 自启动以来的秒数 |
| `u_resolution` | `vec2` | canvas 宽高（像素） |
| `u_mouse` | `vec2` | 鼠标位置，可用 `.setMouse({x,y})` 设置 |
| `u_tex0`, `u_tex1`, … | `sampler2D` | `data-textures` 或 `.setUniform('u_tex0', url)` |

自定义 uniform 用 `.setUniform(name, ...values)`：传数字按 float/vec2/vec3/vec4 推断；传 **字符串** 则当作纹理 URL 异步加载。

### 4. 运行时 API 速览

```javascript
sandbox.load(fragmentSource)              // 仅换 fragment
sandbox.load(fragmentSource, vertexSource) // fragment + vertex
sandbox.setUniform('u_brightness', 0.5)
sandbox.setUniform('u_color', 1, 0, 0)    // vec3 红色
sandbox.setUniform('u_texture', 'img.jpg') // sampler2D
sandbox.setMouse({ x: 0.5, y: 0.5 })      // 归一化或像素坐标视实现而定
```

库内部维护 animation loop，shader 编译成功后持续 `draw`；换 shader 时重新 compile/link，适合教学和小型 demo，不适合大规模引擎级资源管理。

### 5. 与 glsl 生态的关系

```
Book of Shaders (教程)
       │
       ├── glslCanvas  ← 浏览器 / WebGL
       ├── glslEditor  ← 在线编辑 + 预览（内嵌 glslCanvas）
       └── glslViewer  ← 终端 / OpenGL ES / Raspberry Pi
```

同一 fragment 在浏览器用 glslCanvas，在树莓派用 glslViewer 批处理，在 OpenFrame 上屏——**shader 源码可移植**，换的是运行时壳。

### 6. 安装与引入

**CDN（教程常用）：**

```html
<script src="https://rawgit.com/patriciogonzalezvivo/glslCanvas/master/dist/GlslCanvas.js"></script>
```

**npm：**

```bash
npm install glslCanvas
```

TypeScript 社区有 [actarian/glsl-canvas](https://github.com/actarian/glsl-canvas) 等移植版，API 与 data 属性基本兼容，并扩展了 `mode`（flat/box/sphere/torus/mesh）、`.play()` / `.pause()` 等——若只做 Book of Shaders 级别学习，原版 glslCanvas 足够。

## 代码示例

### 示例 1：HTML 一行跑 Book of Shaders 风格渐变

**index.html** —— 与官方 README / Book of Shaders 第 4 章相同模式：

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <script src="https://rawgit.com/patriciogonzalezvivo/glslCanvas/master/dist/GlslCanvas.js"></script>
</head>
<body>
  <canvas
    class="glslCanvas"
    data-fragment-url="gradient.frag"
    width="512"
    height="512"
  ></canvas>
</body>
</html>
```

**gradient.frag** —— 使用内置 `u_time` 与 `u_resolution`：

```glsl
#ifdef GL_ES
precision mediump float;
#endif

uniform float u_time;
uniform vec2 u_resolution;

void main() {
    vec2 st = gl_FragCoord.xy / u_resolution;
    vec3 color = vec3(st.x, st.y, abs(sin(u_time)));
    gl_FragColor = vec4(color, 1.0);
}
```

无需手写 WebGL boilerplate：页面加载 → 自动 WebGL 上下文 → 编译 → 动画。改 `.frag` 文件刷新即可迭代。

### 示例 2：JavaScript 动态加载 + 自定义 Uniform + 纹理

适合接滑块、音频分析等交互：

```html
<canvas id="demo" width="600" height="400"></canvas>
<script src="https://rawgit.com/patriciogonzalezvivo/glslCanvas/master/dist/GlslCanvas.js"></script>
<script>
  const canvas = document.getElementById('demo');
  const sandbox = new GlslCanvas(canvas);

  const frag = `
#ifdef GL_ES
precision mediump float;
#endif
uniform float u_time;
uniform vec2 u_resolution;
uniform float u_brightness;
uniform sampler2D u_tex0;

void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution;
    vec4 tex = texture2D(u_tex0, uv);
    float wave = sin(uv.x * 10.0 + u_time) * 0.5 + 0.5;
    vec3 color = tex.rgb * wave * u_brightness;
    gl_FragColor = vec4(color, 1.0);
}
`;

  sandbox.load(frag);
  sandbox.setUniform('u_brightness', 0.8);
  sandbox.setUniform('u_tex0', 'photo.jpg');

  // 可选：同步鼠标到 u_mouse
  canvas.addEventListener('mousemove', (e) => {
    sandbox.setMouse({ x: e.offsetX, y: canvas.height - e.offsetY });
  });
</script>
```

等价 HTML 写法：`data-textures="photo.jpg"` 会把第一张图绑到 `u_tex0`；`u_brightness` 仍需 JS `.setUniform`。

### 示例 3：最小「Hello World」纯色（验证环境）

```javascript
const canvas = document.createElement('canvas');
canvas.width = canvas.height = 256;
document.body.appendChild(canvas);

const sandbox = new GlslCanvas(canvas);
sandbox.load(`
void main() {
    gl_FragColor = vec4(1.0, 0.2, 0.4, 1.0);
}
`);
```

若屏幕出现粉红色方块，说明 WebGL 与 glslCanvas 链路正常；再逐步加上 `u_time`、噪声函数等 Book of Shaders 章节内容。

## 学习路径建议

1. **跟 Book of Shaders 走**：第 0–4 章搞清 fragment shader、`uniform`、`gl_FragColor`，直接用站内 live examples。
2. **本地复现**：复制 `data-fragment-url` 指向的 `.frag`，用静态服务器打开（避免 `file://` CORS）。
3. **加交互**：用示例 2 的模式接 `setUniform` / `setMouse`，理解 CPU→GPU 数据流。
4. **需要模块复用时**：引入 glslify 在构建期打包，runtime 仍用 glslCanvas `.load(bundleString)`。
5. **上强度时**：复杂 3D、多 pass FBO 考虑 regl、Three.js ShaderMaterial 或 luma.gl；glslCanvas 定位是 **教学与原型**，不是游戏引擎。

## 常见问题

| 现象 | 可能原因 | 处理 |
|------|----------|------|
| 黑屏无报错 | WebGL 被禁用或 shader 编译失败 | 打开浏览器控制台；检查 `#ifdef GL_ES` 与 precision |
| `data-fragment` 不生效 | HTML 属性中换行/引号被转义 | 改用 `.load()` 或 `data-fragment-url` |
| 纹理全黑 | 跨域或未加载完成 | 纹理需 CORS；URL 正确；uniform 名 `u_tex0` 与声明一致 |
| 与 Shadertoy 代码不兼容 | Shadertoy 有 `mainImage` 等约定 | 需改入口为 `main()` 并适配 uniform 名 |

## 与相关项目对比

| 项目 | 定位 |
|------|------|
| **glslCanvas** | 浏览器、零配置、Book of Shaders 默认 |
| **glslEditor** | 完整 IDE（CodeMirror + 预览） |
| **glslViewer** | CLI / 嵌入式 Linux / 管道图像处理 |
| **glslify** | 构建期 GLSL 模块打包 |
| **regl / Three.js** | 生产级 WebGL 应用框架 |

## 小结

glslCanvas 把「在 canvas 上跑 GLSL」压缩成 **一个 class 名或一行 `new GlslCanvas`**，并统一提供 `u_time`、`u_resolution`、`u_mouse` 等教程级 uniform。零基础学 shader 时，优先掌握：**HTML 声明式加载**、**内置 uniform 约定**、**JS 动态 `.load()` / `.setUniform()`** 三条线；再按需扩展到 glslify 模块化与更重型的 WebGL 框架。

## 参考链接

- 仓库：<https://github.com/patriciogonzalezvivo/glslCanvas>
- Demo：<https://patriciogonzalezvivo.github.io/glslCanvas/>
- Book of Shaders — Running your shader：<https://thebookofshaders.com/04/>
- glslEditor：<https://editor.thebookofshaders.com>
