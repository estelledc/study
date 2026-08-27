---
title: PixiJS — 浏览器 2D 场景图与多后端渲染器
来源: https://github.com/pixijs/pixijs
日期: 2026-05-30
分类: projects / 图形渲染
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/pixijs/pixijs
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 3b6b5635deb9edd09f3eafd548b1e82685853ea7
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 8.20.1
---

## 是什么

PixiJS 是一棵 2D **Container 树**加上可替换的渲染后端。日常类比：原生 Canvas 像你拿铅笔一笔一笔画；Pixi 先把“要画什么”挂到 `app.stage` 上，再由 `BatcherPipe` / `RenderPipe` 翻译成 WebGL、WebGPU 或 Canvas 指令。

```ts
import { Application, Sprite, Assets } from 'pixi.js'

const app = new Application()
await app.init({ width: 800, height: 600, background: '#1099bb' })
document.body.appendChild(app.canvas)

const tex = await Assets.load('/bunny.png')
const bunny = new Sprite(tex)
app.stage.addChild(bunny)
```

固定 8.20.1 起，构造函数不再接受 options；debug 构建会提示改走 `await app.init()`。`app.view` 已弃用，挂到页面上的是 `app.canvas`。

## 为什么重要

不读固定 8.20.1 源码，v8 很容易被 v7 教程带跑：

- 为什么 `new Application({ width: 800 })` 不会得到可用 renderer——options 必须进 `init()`
- 为什么默认不是 WebGPU——`autoDetectRenderer` 的优先级是 `webgl → webgpu → canvas`
- 为什么 `ParticleContainer.addChild(sprite)` 会抛错——粒子容器只收 `addParticle`
- 为什么 `ticker.deltaTime` 不能当毫秒用——它是无量纲标量，约 60 FPS 时 ≈ 1

## 核心要点

固定版本可以看成五步：

1. **异步装配**：`init()` 调用 `autoDetectRenderer`，再按注册顺序初始化 Application plugins。`TickerPlugin` 默认 `autoStart: true`，之后一般不必手写 `app.render()`。

2. **选后端**：无 `preference` 时按 `['webgl', 'webgpu', 'canvas']` 探测。字符串 preference 会插到队首并保留其余回退；数组则只尝试列出的后端。

3. **Container 树**：普通显示对象用 `addChild`。父节点变换会累到子节点。短周期隐藏用 `visible = false`，不要反复拆挂。

4. **资源**：`Assets.load` 走 Resolver + Loader + Cache。进度回调不能代替返回的 Promise。

5. **专用管线**：共享系统里有 `BatcherPipe`、`RenderGroupPipe`、`FilterPipe`。`ParticleContainer` 与 filter 各有自己的限制，不能按普通 Sprite 树外推。

## 实践示例

### 案例 1：最小闭环与 ticker 标量

```ts
import { Application, Sprite, Assets } from 'pixi.js'

const app = new Application()
await app.init({ width: 800, height: 600, background: '#1099bb' })
document.body.appendChild(app.canvas)

const bunny = new Sprite(await Assets.load('/bunny.png'))
bunny.anchor.set(0.5)
app.stage.addChild(bunny)

app.ticker.add((ticker) => {
  bunny.rotation += 0.01 * ticker.deltaTime
})
```

`deltaTime = deltaMS * Ticker.targetFPMS`。60 FPS 时它接近 1，不是 16.6。把 `0.01 * deltaTime` 理解成“每毫秒转 0.01”会错一个数量级。

### 案例 2：ParticleContainer 不收 Sprite

```ts
import { ParticleContainer, Particle, Assets } from 'pixi.js'

const tex = await Assets.load('/star.png')
const pc = new ParticleContainer({
  dynamicProperties: { position: true, rotation: true },
})
for (let i = 0; i < 1000; i++) {
  pc.addParticle(new Particle({
    texture: tex,
    x: Math.random() * 800,
    y: Math.random() * 600,
  }))
}
app.stage.addChild(pc)
```

`addChild` / `addChildAt` 会抛「Please use ParticleContainer.addParticle()」。默认只动态更新 `position`；要转、要变色、要改 UV，必须在 `dynamicProperties` 里打开对应开关。

### 案例 3：filter 是离屏目标，不是一行特效

```ts
import { Container, BlurFilter } from 'pixi.js'

const wheel = new Container()
wheel.filters = [new BlurFilter({ strength: 2 })]
app.stage.addChild(wheel)
```

`FilterSystem` 从 `TexturePool` 取离屏纹理再画回。源码写明：RenderGroup 与 filter 不兼容；需要 blending 的嵌套 filter 也有已知限制。不断开关 filter 时，更稳的是改 `filter.enabled`，而不是每帧换新数组。本文没有测量移动端耗时。

## 踩过的坑

1. **把 v7 构造函数抄到 v8**：`new Application(options)` 在 8.20.1 只触发弃用警告，不会完成 renderer 装配。必须 `await init()`。
2. **`app.view` 当 canvas**：`view` getter 已标 `v8_0_0` 弃用，请用 `app.canvas`。
3. **默认后端当成 WebGPU**：没有 `preference` 时先试 WebGL。数组 `preference: ['webgpu']` 才会排除 WebGL。
4. **Graphics 继续 `beginFill().drawRect()`**：固定版本路径是 `rect().fill()`。
5. **把 `deltaTime` 当毫秒**：它是按 `targetFPMS` 归一化的标量。物理积分若当毫秒用，速度会差几十倍。

## 适用 vs 不适用场景

**适用**：

- 同屏大量 2D 精灵、粒子、营销页动效，需要场景图而不是 DOM
- 数据可视化里“算坐标用别的库、画点用 Pixi”
- 想显式选择 WebGL / WebGPU / Canvas，而不是绑死一种后端

**不适用**：

- 3D 场景与透视相机 → [[threejs]]
- 静态信息图或普通页面布局 → CSS / SVG
- 需要开箱即用的物理、输入和关卡流程 → [[phaser]] 一类游戏框架
- 把 filter 叠在 RenderGroup 上，或把嵌套 blending filter 当成已保证行为

## 固定版本边界

- 本文绑定 `pixijs/pixijs@3b6b5635deb9edd09f3eafd548b1e82685853ea7`，tag 与 npm latest 均为 `8.20.1`。
- GitHub annotated tag 与 npm `gitHead` 指向同一提交。
- 生产依赖包括 `eventemitter3`、`earcut`、`tiny-lru` 等，不是零依赖核心。
- 默认探测顺序把 WebGL 放在 WebGPU 前面；这是源码优先级，不是性能测试结论。
- 本文未安装依赖、运行 unit/visual tests、创建 WebGL 上下文或测量 FPS，状态保持 `UNVERIFIED`。

## 学到什么

1. **v8 的入口是异步合同**——构造只建空壳，`init()` 才选 renderer、装 plugin。
2. **默认后端是安全优先**——WebGL 先于 WebGPU，数组 preference 才是白名单。
3. **场景图 API 不是统一的**——Sprite 走 `addChild`，粒子走 `addParticle`。
4. **时间单位写在字段名里也不一定是毫秒**——`deltaTime` 是标量，`deltaMS` / `elapsedMS` 才是毫秒。

## 应用型自测

1. `const app = new Application({ width: 800, height: 600 })`，不调用 `init()`。`app.canvas` 能用吗？
2. `new ParticleContainer().addChild(sprite)` 在固定 8.20.1 会怎样？
3. `await app.init()` 不传 `preference`。探测顺序的第一项是 WebGPU 吗？

检查点：

1. 不能当可用 canvas。构造函数不再装配 renderer；`canvas` getter 读的是 `this.renderer.canvas`。
2. 抛错。必须 `addParticle`，不能把 Sprite 当粒子子节点。
3. 不是。默认优先级第一项是 `webgl`，然后才是 `webgpu` 与 `canvas`。

## 延伸阅读

- 官方文档：[pixijs.com](https://pixijs.com/)
- 固定源码：[pixijs/pixijs](https://github.com/pixijs/pixijs) —— 本文绑定提交 `3b6b5635deb9edd09f3eafd548b1e82685853ea7`
- [[threejs]] —— 同主题 3D 场景图对照
- [[phaser]] —— 带游戏循环与物理的 HTML5 框架

## 关联

- [[threejs]] —— 3D 场景图 / 相机 / PBR 对照
- [[phaser]] —— 更完整的 2D 游戏框架
- [[konva]] —— Canvas2D 场景图对照
- [[gsap]] —— 常与 Pixi 搭配的补间层，不是渲染器

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[aseprite]] —— Aseprite — 像素艺术 / 动画编辑器
- [[cocos2d-x]] —— Cocos2d-x — 一份 C++ 代码把 2D 手游跑遍 iOS / Android
- [[defold]] —— Defold — King 出品的 Lua 跨平台游戏引擎
- [[dragonbones]] —— DragonBones — 国产开源 2D 骨骼动画运行时
- [[excalidraw]] —— Excalidraw — 手绘风协作白板
- [[gimp]] —— GIMP — GNU 图像处理程序
- [[glsl-canvas]] —— glslCanvas — Book of Shaders 配套库
- [[godot]] —— Godot — 开源游戏引擎和编辑器
- [[heaps]] —— Heaps — Haxe 跨平台高性能游戏引擎
- [[lottie]] —— lottie-web — 把 AE 动画变成网页可播放的 JSON
- [[love2d]] —— LÖVE — 用 Lua 写 2D 游戏的轻量框架
- [[melonjs]] —— melonJS — 轻量 JS 2D 游戏引擎
- [[mind-ar-js]] —— MindAR — 不装原生 SDK 的浏览器图像/人脸 AR
- [[phaser]] —— Phaser — HTML5 2D 游戏框架
- [[piskel]] —— Piskel — Web 像素艺术编辑器
- [[planck]] —— planck.js — 纯 JS Box2D 生态
- [[regl]] —— regl — 函数式 WebGL 封装
- [[rive]] —— Rive — 把矢量动画做成可交互组件的运行时
- [[spectorjs]] —— Spector.js — WebGL/WebGPU 调试器
- [[spine-runtimes]] —— Spine Runtimes — 2D 骨骼动画运行时
- [[tiled]] —— Tiled Map Editor — 通用 2D 关卡编辑
- [[twgl]] —— TWGL — 极薄 WebGL helpers
