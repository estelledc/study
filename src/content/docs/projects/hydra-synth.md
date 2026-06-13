---
title: Hydra — 实时视觉合成 Livecoding
来源: 'https://github.com/ojack/hydra'
日期: 2026-06-13
子分类: 渲染与图形
分类: 图形学
provenance: pipeline-v3
---

## 是什么

**Hydra** 是一套在浏览器里 **实时编写、即时渲染** 的视听合成工具，由 Olivia Jack（ojack）发起，灵感来自模拟模块化合成器（Moog、Buchla）与 Sandin Image Processor 等模拟视频反馈系统。你在网页编辑器里敲几行 JavaScript，画面立刻变化——这叫 **livecoding（现场编程）**：像 DJ 打碟时实时拧旋钮，只不过你拧的是代码里的数字和函数链。

日常类比：

> 把 Hydra 想成 **视频版的乐高 + 调音台**。`osc()`、`shape()` 是「音源模块」；`.rotate()`、`.kaleid()` 是「效果器」；`.blend()`、`.modulate()` 是「混音台推子」。模块之间不用物理线缆，用 **点号 `.` 串成一条信号链**，最后接到 `.out()` 这个「主输出」。四个虚拟输出 `o0`–`o3` 像四路 Aux 发送，可以分屏预览，也可以叠在一起做 VJ 演出。

在线入口：[hydra.ojack.xyz](https://hydra.ojack.xyz)。核心渲染引擎拆成独立 npm 包 [hydra-synth](https://github.com/ojack/hydra-synth)，底层用 **WebGL**（通过 [regl](/docs/projects/regl)）在 GPU 上合成纹理；多窗口协作靠 **WebRTC**（rtc-patch-bay）。与 [Shader Park](/docs/projects/shader-park) 的分工：Shader Park 用 JS 描述 SDF 再 Raymarch；Hydra 用 **2D 纹理流水线** 做振荡器、噪声、摄像头与视频混合，更贴近传统 VJ / 模拟合成思维。

## 为什么重要

不理解 Hydra，下面几件事都说不通：

- 为什么 Algorave、livecoding 演出里有人只改一行 `osc(10).rotate(0.1)` 就能让全场画面突变
- 为什么 **modulate** 用另一路纹理的 RGB 去扭曲几何，效果像透过毛玻璃看摄像头
- 为什么同一套 sketch 可以通过 URL 参数分享、上传 gallery，甚至两个浏览器窗口互相当视频源
- 为什么 Hydra 社区作品常只有十几行，却能叠加 kaleidoscope、diff 混合、音频频谱驱动

## 核心概念

### 1. 模块化信号链（Source → Transform → Out）

Hydra 的编程模型极其统一：

1. **Source（源）**：`osc()`、`shape()`、`noise()`、`gradient()`，或外部 `src(s0)`
2. **Geometry（几何变换）**：`.rotate()`、`.scale()`、`.pixelate()`、`.kaleid()`、`.repeat()`
3. **Color（颜色变换）**：`.color()`、`.saturate()`、`.invert()`、`.posterize()`
4. **Blend（混合）**：`.blend()`、`.diff()`、`.mult()`、`.add()`——类似 Photoshop 图层混合模式
5. **Modulate（调制）**：`.modulate()`、`.modulateRotate()`——用 B 纹理的亮度/色相去扭曲 A 纹理的坐标
6. **输出**：`.out()` 默认写到 `o0`；`.out(o1)` 写到其他 buffer

链式写法：

```js
osc(20, 0.1, 0.8).rotate(0.8).pixelate(20, 30).out()
```

读法：振荡器 → 旋转 → 像素化 → 显示。函数括号里的数字就像合成器旋钮的刻度。

### 2. 多路 Framebuffer：`o0`–`o3` 与 `s0`–`s3`

| 变量 | 角色 |
|------|------|
| `o0`–`o3` | **输出缓冲**：各自渲染一条链的结果，可 `render()` 四分屏或 `render(o2)` 单路全屏 |
| `s0`–`s3` | **输入缓冲**：摄像头、视频、图片、屏幕捕获、远程 WebRTC 流 |

初始化外部源示例：

```js
s0.initCam()           // 摄像头 → s0
s0.initVideo(url)      // 视频 URL → s0
s0.initImage(url)      // 静态图 → s0
s0.initScreen()        // 桌面/标签页捕获 → s0
s0.initStream(name)    // 另一 Hydra 窗口的命名流 → s0
```

用 `src(s0)` 把缓冲当作链的起点，后面照常接 `.kaleid(4).out()`。

### 3. 混合 vs 调制

- **Blend**：两路纹理的 **颜色** 按算术混合（`diff` 类似差值，`mult` 正片叠底）
- **Modulate**：用调制源的红/绿通道当作 **x/y 位移场**，扭曲被调制源的 UV，像透过波纹玻璃看画面；**不改变色相逻辑，只弯几何**

这是 Hydra 最有「模拟味」的部分，也是 VJ 做出流动、熔化质感的关键。

### 4. 时间与交互

全局变量 `time`（页面加载后的毫秒）可驱动任意参数：

```js
osc(() => 10 + Math.sin(time * 0.002) * 8).out()
```

音频对象 `a`（基于 Meyda FFT）可读 `a.fft[0]` 等频段；实验性 **MIDI**、鼠标坐标也可接入。保留函数 `update` 会在每帧渲染前执行，适合挂 Three.js / p5 画布再 `s0.init({ src: canvas })` 喂给 Hydra。

### 5. 网络协作（WebRTC）

窗口 A：`pb.setName("myGraphics")`  
窗口 B：`s0.initStream("myGraphics")` 然后 `src(s0).out()`  

任意网页也可通过 rtc-patch-bay 变成 Hydra 的远程纹理源——适合分布式演出或多人 jam。

## 编辑器速查

| 快捷键 | 作用 |
|--------|------|
| `Ctrl+Enter` | 运行当前行 |
| `Ctrl+Shift+Enter` | 运行全部代码 |
| `Alt+Enter` | 运行当前块 |
| `Ctrl+Shift+H` | 隐藏/显示代码层 |
| `Ctrl+Shift+F` | Prettier 格式化 |
| `Ctrl+Shift+S` | 截图下载 |

运行后 URL 会编码当前 sketch，便于分享；也可点 **upload to gallery** 公开作品。

## 实践案例

### 案例 1：从零到第一条视觉振荡器

关闭欢迎层后，清空编辑器，输入：

```js
// 视觉振荡器：频率、同步、RGB 偏移
osc(20, 0.1, 0.8).out()
```

`Ctrl+Shift+Enter` 运行，应看到滚动条纹。改 `osc(10)` 改变密度；加 `.rotate(0.05, 0.1)` 让条纹斜向流动；加 `.color(1, 0.2, 3)` 调色相。

进阶 kaleidoscope：

```js
osc(10, 0.03, 1.2)
  .rotate(0.2, 0.05)
  .kaleid(5)
  .out()
```

**要点**：始终保证链末有 `.out()`；报错时看左下角红色语法提示（常见是多点、少括号）。

### 案例 2：摄像头 + 振荡器调制（典型 VJ 起手式）

```js
s0.initCam()

osc(21, 0, 0.8)
  .rotate(0, 0.1)
  .out(o1)

src(s0)
  .modulate(o1, 0.15)
  .color(1.2, 0.5, 2)
  .out()
```

**逐行解释**：

- `s0.initCam()` 点亮摄像头并写入 `s0`（此时屏幕还不会显示，除非 `src(s0).out()`）
- 第一链把快转的 `osc` 渲染到 **离屏缓冲** `o1`，当作「位移贴图」
- `src(s0).modulate(o1, 0.15)` 用 `o1` 的 RG 扭曲摄像头 UV，第二参数控制扭曲强度
- `.color()` 再整体调色

可把 `0.15` 改成 `() => a.fft[0] * 0.5`（需先 `a.show()` 校准 FFT）做 **音频反应** 演出。

### 案例 3：双缓冲混合演出

```js
shape(4, 0.5)
  .rotate(0, 0.02)
  .mult(osc(8))
  .out(o0)

noise(3, 0.1)
  .diff(o0)
  .blend(o0, 0.4)
  .out(o1)

render(o1)
```

`shape` 生成几何图形；`mult` 与振荡器正片叠底；第二路 `noise` 与 `o0` 做 `diff` 再 `blend` 叠回；`render(o1)` 全屏显示最终合成。现场可只改 `render(o0)` / `render(o1)` 切换镜头。

### 案例 4：嵌入 p5.js 画布（扩展管线）

```js
p5 = new P5()

p5.draw = () => {
  p5.background(0)
  p5.fill(p5.mouseX / 5, 200, 255, 120)
  p5.rect(p5.mouseX, p5.mouseY, 40, 200)
}

s0.init({ src: p5.canvas })
src(s0).repeat(3, 3).modulateRotate(osc(8), 0.3).out()
```

p5 负责交互绘图，Hydra 负责后处理——分工类似「前期拍摄 + 现场调色台」。

## 函数族一览（入门 subset）

| 类别 | 常用函数 |
|------|----------|
| Source | `osc`, `shape`, `noise`, `gradient`, `solid`, `voronoi` |
| Geometry | `rotate`, `scale`, `pixelate`, `kaleid`, `repeat`, `scrollX`, `scrollY` |
| Color | `color`, `saturate`, `contrast`, `invert`, `posterize`, `thresh` |
| Blend | `blend`, `add`, `mult`, `diff`, `layer` |
| Modulate | `modulate`, `modulateRotate`, `modulateScale`, `modulatePixelate` |

完整交互参考：[hydra 函数文档](https://hydra.ojack.xyz/docs/docs/funcs/)；源码在 [hydra-synth glsl-functions.js](https://github.com/ojack/hydra-synth/blob/master/src/glsl/glsl-functions.js)。

## 生态与相关项目

| 项目 | 关系 |
|------|------|
| [hydra-synth](https://github.com/ojack/hydra-synth) | 可嵌入任意网页的 npm 引擎 |
| [atom-hydra](https://github.com/ojack/atom-hydra) | Atom 编辑器内 livecoding |
| [rtc-patch-bay](https://github.com/ojack/rtc-patch-bay) | WebRTC 视频路由，可独立使用 |
| [Lumen](https://lumen-app.com/) | macOS 桌面视频合成，概念相近 |
| [VEDA](https://veda.gl/) | Atom 内的 VJ 系统 |

学习路径建议：官方 [Getting started](https://hydra.ojack.xyz/docs/docs/learning/getting-started/) → 随机 sketch（工具栏骰子）→ [Hydra Book](https://github.com/ojack/hydra/tree/master/docs) / 社区 [@hydra_patterns](https://twitter.com/hydra_patterns) → 自己演出时从 `osc().out()` 改一个参数开始。

## 局限与注意

- **浏览器**：文档写明目前以 **Chrome / Chromium + WebGL** 体验最佳；Safari/Firefox 部分功能可能受限
- **许可**：在线版与主仓库多为 **AGPL-3.0**；嵌入商业产品前需读 license
- **性能**：高分辨率 + 多路 `modulate` + 摄像头会吃 GPU；演出前在目标机器上试跑
- **远程流**：`initStream` 建立连接有几秒延迟，控制台可看 `pb.list()` 排障

## 小结

Hydra 把 **模拟合成器的接线思维** 搬进了浏览器：源 → 变换 → 混合/调制 → 输出，用点号链起来就能 livecoding。零基础只需记住 `osc().out()` 和 `Ctrl+Shift+Enter`；进阶再玩 `o0`–`o3` 多缓冲、`modulate` 扭曲摄像头、FFT/MIDI 驱动参数，以及 WebRTC 多窗协作。它与 regl（WebGL 封装）、Shader Park（SDF 雕塑）形成互补：一个管 **实时 2D 纹理 VJ**，一个管 **底层 GPU**，一个管 **程序化 3D 距离场**——按演出需求选型即可。
