---
title: Hydra — 实时视觉合成 livecoding
来源: 'https://github.com/ojack/hydra'
日期: 2026-07-09
分类: graphics
难度: 初级
---

## 是什么

Hydra 是一个直接跑在浏览器里的实时视觉合成器：你一边写 JavaScript，一边让屏幕上的图案立刻变化。

日常类比：它像一台没有实体旋钮的录像合成台。以前艺术家要把摄像头、振荡器、调色器和混合器用线接起来；Hydra 把这些线换成代码里的点号。

最小例子是：

```js
osc(20, 0.1, 0.8).rotate(0.8).out()
```

这行代码可以读成：先造一个条纹振荡器，再把它旋转一点，最后送到屏幕输出。

官方文档说它用 JavaScript 写接口，底层编译到 WebGL；所以新手看到的是短链式代码，浏览器真正执行的是 GPU 上的像素计算。

## 为什么重要

不理解 Hydra，下面这些事很难解释：

- 为什么一行 `osc().out()` 就能生成动态视觉，而不是先准备一堆素材文件
- 为什么现场演出的人可以边敲代码边改画面，而不是提前导出视频
- 为什么摄像头、屏幕共享、图片、视频和另一个浏览器窗口都能变成视觉输入
- 为什么 WebGL、shader、视频反馈这些听起来很硬的概念，可以被包装成适合初学者试错的玩具

## 核心要点

1. **从 source 开始**：Hydra 的每条视觉链通常从 `osc()`、`noise()`、`shape()`、`src()` 这样的来源开始。类比：先拿到一盆颜料，再谈怎么搅拌。

2. **用点号串变换**：`.rotate()`、`.kaleid()`、`.pixelate()`、`.color()` 像一串滤镜，每个函数接住前一步的画面再改一下。类比：手机修图时先裁切、再调色、再加特效，只是 Hydra 可以每秒重复做很多次。

3. **输出缓冲区让画面能互相喂回去**：Hydra 默认有 `o0` 到 `o3` 四个输出缓冲区，既能显示，也能被 `src(o0)` 重新读回来。类比：把电视摄像头对准电视本身，会出现反馈隧道；Hydra 把这种反馈变成可控代码。

## 实践案例

### 案例 1：官方入门的条纹、旋转、万花筒

```js
osc(5, -0.126, 0.514)
  .rotate(0, 0.2)
  .kaleid()
  .repeat()
  .out()
```

**逐部分解释**：

- `osc(5, -0.126, 0.514)` 生成会移动的条纹，三个数字分别影响频率、同步和颜色偏移。
- `.rotate(0, 0.2)` 让画面持续旋转，第二个参数像一个转速旋钮。
- `.kaleid()` 把画面折成万花筒，适合快速制造对称纹理。
- `.repeat()` 把画面平铺，像把一张图案墙纸铺满屏幕。
- `.out()` 是最后一步：没有它，链条只是在描述画面，还没有送到屏幕。

这个案例来自官方 getting started / video synth basics：新手先改数字，就能看到每个参数如何改变画面。

### 案例 2：把摄像头变成万花筒输入

```js
s0.initCam()
src(s0)
  .color(-1, 1)
  .kaleid()
  .out()
```

**逐部分解释**：

- `s0.initCam()` 请求浏览器打开摄像头，把它放进 `s0` 这个 source buffer。
- `src(s0)` 的意思是"把 s0 里的真实视频当作画面来源"。
- `.color(-1, 1)` 改变颜色通道，让摄像头画面不再只是普通录像。
- `.kaleid()` 把人脸、手势或现场灯光折成对称图案。
- 这个案例来自 README 和 external sources 文档，代表 Hydra 最常见的 VJ 用法：拿现场信号做实时变形。

### 案例 3：让音乐频谱控制画面

```js
a.setBins(5)
osc(20, 0.1, 2)
  .saturate(() => 1 - a.fft[4])
  .rotate(() => a.fft[0])
  .kaleid()
  .out()
```

**逐部分解释**：

- `a.setBins(5)` 把麦克风听到的声音频谱切成 5 段。
- `a.fft[0]` 通常更靠低频，适合跟鼓点、低音相关联。
- `a.fft[4]` 更靠高频，适合跟嘶声、镲片、尖锐声音相关联。
- 参数位置放函数 `() => ...`，表示每一帧都重新读一次声音，而不是只读固定数字。
- 这个案例来自官方 audio-reactivity guide，说明 Hydra 不只是画图工具，也能把现场声音变成视觉控制信号。

## 踩过的坑

1. **忘写 `.out()`**：前面的链条只是生成纹理描述，没输出就不会显示到屏幕。

2. **把普通网页链接塞给 `initVideo()`**：YouTube / Vimeo 页面不是直接视频文件，Hydra 需要 `.mp4`、`.webm` 或 `.ogg` 这类可被浏览器直接读取的资源。

3. **外部图片和视频被 CORS 拦住**：浏览器会拒绝没有跨域许可的素材，演出前要先测试素材来源。

4. **音频反应太抖或太弱**：不同麦克风音量差很多，需要用 `a.setSmooth()`、`a.setCutoff()`、`a.setScale()` 校准。

## 适用 vs 不适用场景

**适用**：

- 想快速做抽象视觉、舞台背景、VJ loop、浏览器里的互动艺术
- 想学习 WebGL / shader / 视频反馈，但还没有能力直接写 GLSL
- 想把摄像头、屏幕共享、图片、视频、p5.js、Three.js 画布混到一起
- 想在 workshop 或课堂里让零基础同学通过改数字理解生成艺术

**不适用**：

- 精确剪辑、调音轨、导出长视频成片，这些更适合专业视频软件
- 需要稳定广播级链路的商业演播室，Hydra 的网络流和浏览器权限要提前验证
- 需要离线批处理成千上万个视频文件的后端任务
- 完全没有 WebGL 的旧设备或受限浏览器环境

## 历史小故事（可跳过）

- **1970s**：模拟视频合成器和 Sandin Image Processor 这类设备让艺术家用电子信号改造图像，Hydra 借用了这种"接线"直觉。
- **1977 年**：Satellite Arts Project 用卫星连接远距离表演，Hydra 的浏览器串流也延续了"远程共同表演"这条线。
- **1984 年**：Jim Crutchfield 的 video feedback 研究把反馈图像当作复杂系统来观察，README 把它列为灵感之一。
- **2010s 后期**：Olivia Jack 创建 Hydra，把 livecoding、WebGL、浏览器编辑器和网络视频源放到一个开源项目里。
- **2025 年**：新版官方文档继续维护 quick start、function reference、learning guides 和社区资源，项目已经不只是代码库，也是一个教学入口。

## 学到什么

- Hydra 的关键不是"会很多函数"，而是理解 source → transform → output 这条数据流。
- 图像可以像音频合成一样被 patch：每个函数都是模块，点号就是线。
- 浏览器不只是网页容器，也能访问摄像头、麦克风、屏幕和 GPU，成为实时创作环境。
- 真正做现场前，权限、CORS、音频校准、网络流稳定性比炫技代码更重要。

## 延伸阅读

- 官方 README：[ojack/hydra](https://github.com/ojack/hydra)（项目动机、快捷键、摄像头、WebRTC、p5.js、Three.js 示例）
- 官方文档入口：[What is Hydra?](https://hydra.ojack.xyz/docs/)（一句话定位和学习路径）
- 入门教程：[Getting started with hydra](https://hydra.ojack.xyz/docs/docs/learning/getting-started/)（适合第一次打开编辑器）
- 函数索引：[Hydra functions](https://hydra.ojack.xyz/docs/docs/reference/)（source、geometry、color、blend、modulate 五大类）
- 音频教程：[Audio-reactivity explained](https://hydra.ojack.xyz/docs/docs/learning/guides/audio/)（解释 `a.fft`、平滑和阈值）
- [[regl]] —— Hydra 底层使用的函数式 WebGL 抽象之一，理解它有助于理解"链式描述最后变 GPU 绘制"

## 关联

- [[regl]] —— Hydra README 列出的底层工具，负责把绘制命令组织成浏览器里的 WebGL 调用
- [[threejs]] —— Hydra 可以加载 Three.js，把 3D canvas 作为 `src` 输入继续做视频合成
- [[babylonjs]] —— 同属浏览器 3D / WebGL 生态，适合对比"场景图 3D 引擎"和"视频合成器"的边界
- [[glslify]] —— shader 模块化工具，和 Hydra 背后的 GLSL 片段拼装思路相邻
- [[picogl]] —— 轻量 WebGL 抽象，能帮助理解 Hydra 为什么要把像素计算交给 GPU
- [[shader-park]] —— 也是用代码生成视觉，但更偏 3D signed distance field，Hydra 更偏实时视频 patch
- [[heckbert-1986-texture-survey]] —— 纹理采样、坐标变换和贴图思想，是理解 Hydra `src()` / `modulate()` 的图形学背景

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
