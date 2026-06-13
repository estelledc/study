---
title: Shader Park — 程序化 SDF 着色器 DSL
来源: 'https://github.com/shader-park/shader-park-core'
日期: 2026-06-13
子分类: 渲染与图形
分类: 图形学
provenance: pipeline-v3
---

## 是什么

**Shader Park** 是一个 JavaScript 库（`shader-park-core`），让你用接近「搭积木」的语法描述 **3D/2D 程序化图形**，在运行时自动编译成 GLSL 着色器，通过 **Raymarching（光线步进）** 在 GPU 上实时渲染。作者 Torin Blankensmith 与 Peter Whidden 维护，MIT/Apache-2.0 协议，官网 [shaderpark.com](https://shaderpark.com) 提供在线编辑器与数百个社区作品。

日常类比：

> 传统 GLSL 像 **自己造相机、调暗房、冲胶片**：你要写顶点着色器、片段着色器、uniform 绑定、WebGL 状态机，还要手写 SDF 求交与步进循环。Shader Park 则像 **乐高 + 3D 打印机的说明书**：你说「这里放一个球，那里挖一个环，再整体涂上金属感」，库负责把说明书翻译成 GPU 能执行的 GLSL，并替你完成 Raymarching 管线。你专注「形状与动画逻辑」，而不是底层图形 API。

与 [glslCanvas](/docs/projects/glsl-canvas) 的分工：glslCanvas 把 **已有 GLSL 字符串** 画到 canvas；Shader Park 把 **JavaScript DSL** 转成 GLSL。与 [regl](/docs/projects/regl) 的分工：regl 封装 WebGL 状态机；Shader Park 站在更高层，内置 SDF 图元、CSG 布尔运算、噪声与材质，面向 **算法艺术 / 生成式 3D** 而非通用网格渲染。

## 为什么重要

不理解 Shader Park，下面几件事都说不通：

- 为什么 [shaderpark.com/explore](https://shaderpark.com/explore) 上大量作品只有几十行 JS，却能在浏览器里实时旋转复杂有机体
- 为什么 **Signed Distance Field（SDF，有符号距离场）** 可以用 `union` / `difference` 做布尔建模，而不需要网格布尔运算
- 为什么同一套「雕塑代码」可以导出到 Three.js、离线 HTML、TouchDesigner，甚至用于网格化（`toRawSDF4Meshing`）
- 为什么 p5.js、Three.js 教程里会出现 `createShaderPark` / `createSculptureWithGeometry`——它们把 SP 当作 **可嵌入的着色器生成器**

## 核心概念

### 1. JS → GLSL：Sculpt（雕塑）即着色器

你在编辑器或 npm 项目里写的一段函数体，在 Shader Park 术语里叫 **sculpture（雕塑）**。核心库解析 JS 调用序列（`sphere`、`difference`、`color`…），生成完整的 Raymarching 片段着色器。内置全局量包括 `time`（动画时间）、`mouse`（指针）、`getSpace()`（当前采样点空间坐标）、`getRayDirection()`（视线方向）等。

**Raymarching 直觉**：从相机沿像素方向「迈步」，每步问 SDF「离表面还有多远？」，距离足够小就着色。SP 隐藏了循环与法线估计，你只描述 **距离场本身**。

### 2. SDF 与图元（Primitives）

SDF 在任意点返回 **到最近表面的有符号距离**（内部为负、外部为正）。Shader Park 内置图元：

| 函数 | 含义 |
|------|------|
| `sphere(r)` | 半径 r 的球 |
| `box(size)` | 轴对齐盒子 |
| `torus(R, r)` | 大半径 R、管径 r 的环 |
| `cylinder(h, r)` | 圆柱 |
| `plane(n, h)` | 平面 |
| `cone(h, r)` | 圆锥 |

图元调用即「在当前空间位置放置一个距离场贡献」。默认 **并集模式**（`union`，可省略）：后画的形状与已有场景合并。

### 3. 构造模式（Construction Modes / CSG）

类似 CAD 里的布尔运算，用 **栈式指令** 组合距离场：

| 模式 | 作用 |
|------|------|
| `union()` | 合并（默认行为，显式调用也可） |
| `difference()` | 从当前形状减去接下来画的形状 |
| `intersect()` | 只保留交集 |
| `blend(f)` | 平滑混合（f 控制过渡锐度） |
| `mixGeo(t)` | 在两种几何之间插值（t 常接 `input()` uniform） |

### 4. `shape()`：作用域与复用

`shape(fn)` 把颜色、位移、构造模式封装在函数内，返回可重复调用的「子雕塑」。类比：给乐高子组件单独一个袋子，里面的改动不会污染外面。

### 5. 空间变换与修饰

| 类别 | 代表 API |
|------|----------|
| 位移 | `displace(x,y,z)`、`setSpace(fn)` |
| 旋转 | `rotateX/Y/Z(angle)` |
| 对称 | `mirrorX/Y/Z`、`repeat(vec3)` |
| 变形 | `expand(d)`（膨胀）、`shell(t)`（抽壳） |
| 噪声 | `noise(p)`、`fractalNoise(p)` |

### 6. 材质与光照

`color(vec3)` 设 albedo；`metal(t)`、`shine(t)` 控制 PBR 感；`lightDirection(vec3)` 改主光方向；`backgroundColor` 设背景。可配合 `normal`（内置法线）做简单着色。

### 7. 外部输入：`input()` 与 Uniform

在 Three.js / 自定义宿主里，通过 `input()` 声明 **可从 JS 更新的 uniform**（如音频分析、点击状态）。编辑器内则自动注入 `time`、`mouse` 等。

### 8. 质量与性能

| API | 用途 |
|------|------|
| `setStepSize(s)` | Raymarching 步长，越小越精细、越慢 |
| `setGeometryQuality(n)` | 几何质量，artifact 时可增大 |
| `setMaxIterations(n)` | 最大步进次数 |

文档 FAQ：若形状出现 **条纹/失真**，优先调高 `setGeometryQuality`。

### 9. 集成与导出

- **Web**： [shaderpark.com/new](https://shaderpark.com/new) 在线编辑
- **npm**：`npm install shader-park-core`
- **Three.js**：`createSculptureWithGeometry(geometry, spCodeString, uniformsFn)`
- **p5.js**：`createShaderPark(() => { ... })`（见 shader-park-p5 构建物）
- **CLI**：`npm run toThreeJS`、`toOffline`、`toRawSDF4Meshing` 将雕塑转为不同目标

## 实践案例

### 案例 1：最小雕塑——球体挖环（理解 difference）

在 [在线编辑器](https://shaderpark.com/new) 中，默认模板即可改为：

```js
// 大球
sphere(0.7);
// 切换到「减法」模式：接下来画的形状会从当前场景挖掉
difference();
rotateX(1);
rotateZ(PI / 2 + time);  // time 内置，环会随时间旋转
torus(0.7, 0.1);
```

**逐行解释**：

1. `sphere(0.7)` — 在原点放置半径 0.7 的球体距离场。
2. `difference()` — 栈模式切换：下一图元做 **布尔减**。
3. `rotateX(1)` / `rotateZ(PI/2 + time)` — 在 **当前空间** 旋转坐标系后再画环；`time` 驱动动画。
4. `torus(0.7, 0.1)` — 环的几何被从球中减去，得到「套环球」或甜甜圈孔效果。

这是 SDF-CSG 的典型心智模型：**先放主体，再声明运算，再放工具形状**。

### 案例 2：封装子形状 + 噪声位移 + 多球 blend

稍复杂结构：把「挖环球」存成组件，加噪声扰动，再 blend 小卫星球（改编自社区 p5/Shader Park 教程模式）：

```js
setStepSize(0.4);

let scale = input();        // 宿主传入：噪声尺度
let noiselvl = input();     // 宿主传入：噪声强度

let n = noiselvl * noise(getSpace() * scale + time);
let c = vec3(n) * 0.5 + 0.5 + normal + vec3(0.4, 0, 0);

let ringBall = shape(() => {
  color(c);
  shine(0.8);
  sphere(0.7 + n * 0.1);
  difference();
  rotateX(getSpace().x * 4);
  rotateZ(PI / 2 + time);
  torus(0.7 + n * 0.1, 0.1 + n * 0.1);
});

ringBall();

blend(0.2);
displace(sin(time * 2.3) / 1.3, 0, cos(time) / 1.3);
color(c);
shine(0.8);
sphere(0.2 + n * 0.1);
reset();

displace(cos(time * 2.3) / 1.3, sin(time) / 1.3, 0);
sphere(0.3 + n * 0.1);
```

**要点**：

- `shape(() => { ... })` 返回 `ringBall`，调用 `ringBall()` 才绘制。
- `getSpace()` 提供当前 Raymarching 采样点，乘 scale 后喂给 `noise`，实现 **空间扭曲**。
- `blend(0.2)` 后画的小球与主体 **平滑并集**，不是硬切。
- `displace` + `reset` 成对使用：移动坐标系画卫星，再 `reset` 回世界空间。
- `input()` 需在 p5/Three 宿主里通过 uniform 回调传入具体数值。

### 案例 3：嵌入 Three.js（音频/交互）

Codrops 教程模式：用 `createSculptureWithGeometry` 替换普通 Mesh 材质：

```js
import { createSculptureWithGeometry } from 'shader-park-core';

export function spCode() {
  return `
    let pointerDown = input();
    let audio = input();
    setMaxIterations(5);

    let s = getSpace();
    let r = getRayDirection();
    let n = noise(s + vec3(0, 0, audio * 0.1));

    metal(n * 0.5 + 0.5);
    shine(n * 0.5 + 0.5);
    displace(mouse.x * 2, mouse.y * 2, 0);
    color(normal * 0.1 + vec3(0, 0, 1));
    boxFrame(vec3(2), abs(n) * 0.1 + 0.04);
    mixGeo(pointerDown);
    sphere(n * 0.5 + 0.8);
  `;
}

// 在 Three.js 场景中：
const mesh = createSculptureWithGeometry(geometry, spCode(), () => ({
  time: clock.getElapsedTime(),
  mouse: mouseVec,
  pointerDown: isPointerDown ? 1 : 0,
  audio: analyserAverage,
}));
scene.add(mesh);
```

**要点**：雕塑代码是 **字符串**（或模板函数返回字符串）；uniform 对象键名与 `input()` 变量对应；`mixGeo(pointerDown)` 在 boxFrame 与 sphere 之间插值，实现点击切换形态。

## 与相关工具对比

| 维度 | Shader Park | 手写 GLSL + Raymarching | Three.js 网格工作流 |
|------|-------------|-------------------------|---------------------|
| 学习曲线 | 低（声明式 API） | 高（需懂 SDF + 步进） | 中（场景图 + 材质） |
| 布尔/有机形 | CSG 一行切换 | 手写 `min`/`max` 组合 | 需建模软件或 CSG 库 |
| 动画/交互 | `time`、`input()` 内置 | 自行传 uniform | AnimationMixer 等 |
| 导出网格 | CLI 网格化 | 不直接支持 | 原生强项 |
| 2D | `enable2D()` 等 | 可写 | 通常用平面/正交相机 |

## 已知限制（官方 FAQ 摘要）

- **不要用 `if (time > 100)` 这类分支** 依赖内置变量——会破坏编译/优化；改用 `smoothstep`、`mix` 等连续函数。
- `length`、`distance`、`dot`、`normalize` 等 **仅 vec3**；`pow`、`mod` 等 **仅 float**——与 GLSL 类型严格一致。
- 没有内置 `scale()`——文档建议用 `setSpace` 做非均匀缩放，因简单 scale 易扭曲距离场。
- `glslSDF()` 可嵌入自定义 GLSL 距离函数，但 **不支持 GL ES 3** 环境。

## 学习路径建议

1. **零基础**：打开 [shaderpark.com/new](https://shaderpark.com/new)，改 `sphere` / `box` / `torus` 参数，试 `difference` 与 `blend`。
2. **读 API**：[Interactive Documentation](https://docs.shaderpark.com/references-js/) 按 Geometry → Construction Modes → Material 顺序浏览。
3. **模板项目**：克隆 [shader-park-examples](https://github.com/shader-park/shader-park-examples) 的 `es6-starter-template` 或 `es6-three-starter-template`。
4. **理论基础**：补 SDF 与 Raymarching（Inigo Quilez 文章）；与 [glslCanvas](/docs/projects/glsl-canvas) 对照理解「DSL 生成 shader」vs「直接写 shader」。
5. **进阶**：CLI 导出 Three.js 场景；TouchDesigner 节点；社区 [Discord](https://discord.gg/vuBnVuBvvK) 交流。

## 小结

Shader Park 把 **程序化 SDF 建模、CSG、噪声、PBR 材质** 封装成一套 JavaScript DSL，降低实时 3D 算法艺术的门槛。你描述的是「空间里有什么形状、如何组合、如何上色」，库负责编译 GLSL 与 Raymarching。适合快速原型、教学演示、音频可视化与生成艺术；若目标是传统游戏资产管线，仍需配合网格导出或与其他 DCC 工具衔接。

## 参考链接

- 源码与 README：[shader-park/shader-park-core](https://github.com/shader-park/shader-park-core)
- 在线编辑：[shaderpark.com](https://shaderpark.com)
- API 文档：[docs.shaderpark.com](https://docs.shaderpark.com/references-js/)
- 示例模板：[shader-park-examples](https://github.com/shader-park/shader-park-examples)
- npm：[shader-park-core](https://www.npmjs.com/package/shader-park-core)
