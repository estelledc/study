---
title: PixiJS — 浏览器里画 2D 的高性能 GPU 引擎
来源: 'https://github.com/pixijs/pixijs'
日期: 2026-05-30
子分类: projects / 图形渲染
分类: 图形学
难度: 中级
provenance: pipeline-v3
---

## 是什么

PixiJS 是一个**让浏览器用显卡画 2D 图形的引擎**。日常类比：原生 Canvas 像你拿铅笔一笔一笔画；PixiJS 像把图片塞进打印机一次喷一沓——它把"要画什么"翻译成 GPU 看得懂的指令，一帧能稳定画几千个动来动去的小图。

你写的代码长这样：

```ts
import { Application, Sprite, Assets } from 'pixi.js';
const app = new Application();
await app.init({ width: 800, height: 600 });
const tex = await Assets.load('/bunny.png');
const bunny = new Sprite(tex);
app.stage.addChild(bunny);
```

它管你叫上的所有图片 / 文字 / 几何形状叫 **Container 树**——你往树里挂东西，它每帧把整棵树遍历一遍，翻译成 GPU 调用。在 H5 抽奖转盘、互动数据可视化、广告创意这些场景，PixiJS 是事实标准；npm 周下载量 ~150k。

## 为什么重要

不理解 PixiJS，下面这些事都不好解释：

- 为什么同样的"几千个会动的小方块"，原生 Canvas 卡成幻灯片，PixiJS 能稳 60FPS
- 为什么前端工程师做 H5 互动需求时，第一反应不是写 CSS 动画而是装 Pixi
- 为什么 Adobe Animate 导出 HTML5 默认走 PixiJS 后端
- 为什么"渲染管线"这个游戏引擎术语会跑到 web 工具库里——它就是从 GPU 编程那边借来的

## 核心要点

PixiJS 的能力可以拆成 **三步**：

1. **Container 树**：所有要画的东西按父子关系挂在 stage 下面。类比：俄罗斯套娃，外层动了里面跟着动（transform 自动累乘到子节点）。

2. **批处理（Batching）**：每帧遍历 Container 树时，把"同一张贴图、同一种混合模式"的小图凑成一组，**一次** drawCall 就发给 GPU。类比：寄快递，把同一个收件人的 100 个包裹打成一捆，比寄 100 次便宜得多。

3. **多后端抽象**：v8 起，同一份 scene graph 代码 WebGL2 / WebGPU / Canvas2D 都能跑。Pixi 替你把 GPU 后端的差异藏起来。

三件事加起来，让"在浏览器里画几千个动态图形"从奢侈变成默认。

## 实践案例

### 案例 1：最小可跑闭环——一只转动的兔子

```ts
import { Application, Sprite, Assets } from 'pixi.js';
const app = new Application();
await app.init({ width: 800, height: 600, background: '#1099bb' });
document.body.appendChild(app.canvas);
const tex = await Assets.load('/bunny.png');
const bunny = new Sprite(tex);
bunny.x = 400; bunny.y = 300; bunny.anchor.set(0.5);
app.stage.addChild(bunny);
app.ticker.add((time) => { bunny.rotation += 0.01 * time.deltaTime; });
```

**逐部分解释**：`Application` 帮你建好 canvas + renderer + ticker；`Assets.load` 把图片转成 GPU texture；`Sprite` 是包着 texture 的 Container；`ticker.add` 注册每帧回调。整个闭环 10 行就够了。

### 案例 2：1000 个粒子的极限——ParticleContainer

```ts
import { ParticleContainer, Sprite, Assets } from 'pixi.js';
const tex = await Assets.load('/star.png');
const pc = new ParticleContainer(2000, { position: true, rotation: true });
for (let i = 0; i < 1000; i++) {
  const s = new Sprite(tex);
  s.x = Math.random() * 800; s.y = Math.random() * 600;
  pc.addChild(s);
}
app.stage.addChild(pc);
```

**逐部分解释**：`ParticleContainer` 比普通 Container 更激进——所有子节点共享同一张 texture，**不支持** filter / mask / 嵌套。代价换来的是：1000 个 sprite 走 1 次 drawCall，移动端也 60FPS。

### 案例 3：带模糊滤镜的转盘

```ts
import { Container, Sprite, BlurFilter } from 'pixi.js';
const wheel = new Container();
wheel.addChild(...sprites);
wheel.filters = [new BlurFilter(2)];
app.stage.addChild(wheel);
app.ticker.add(() => { wheel.rotation += 0.02; });
```

**逐部分解释**：`filters` 数组里每个 filter 都会触发一次"把 Container 渲染到一张离屏纹理 → 用 shader 处理 → 再贴回屏幕"。看着只多一行，但移动端 Safari 上 RT 切换每帧多 5-10ms。Jason 在 H5 项目里踩过这个坑。

## 踩过的坑

1. **v7 → v8 升级是破坏性的**：`Application` 初始化变成 async（要 `await app.init()`），老的 `Loader` 被 `Assets` 替换，`Graphics` API 从 `beginFill().drawRect()` 改成 `rect().fill()`。教程和 Stack Overflow 答案大多还是 v7 风格，新人容易抄错。

2. **Filter 和 mask 都是 RT 切换**：每多一层 filter 等价多一次"渲染到离屏纹理 + 切回主帧缓冲"。移动端 Safari 老版本上 RT 切换尤其慢，几个 BlurFilter 叠起来直接掉到 30FPS。

3. **频繁 addChild / removeChild 比你想的贵**：每次 addChild 都会触发数组操作 + dirty flag 沿父链传播。短周期 toggle 显示请用 `visible = false`，长周期复用请用 ObjectPool 模式，别把节点真的销毁。

4. **scene graph 不是数据层**：常见反模式是把业务字段（hp / 角色 ID / 关卡数据）直接塞进 Container 属性。正确的做法是 Container 只作"数据 → 渲染"的投影，业务数据自己有 store（Zustand / MobX / 自写）。

## 适用 vs 不适用场景

**适用**：

- H5 互动游戏 / 广告创意 / 抽奖转盘 / 盲盒动效——同屏图形多、要动起来
- 数据可视化里的"几千个点的散点图 / 力导图"——D3 算坐标，Pixi 负责渲染
- 教育课件 / 数字孪生（digital twin）的 2D 视图层
- 想自己控制渲染管线、不要游戏引擎那一堆模板

**不适用**：

- 3D 场景——用 [[react]] 生态里的 Three.js / Babylon.js
- 静态信息图 / 普通页面布局——CSS + SVG 就够了，引 Pixi 是杀鸡用牛刀
- 富文本编辑器 / 表格——这些是 DOM 的舒适区，Pixi 没有 a11y 支持
- 需要开箱即用的"游戏引擎"（物理 / 输入 / 状态机）——选 Phaser 更直接

## 历史小故事（可跳过）

- **2013 年**：Mat Groves 在英国伦敦的 Goodboy Digital 工作室孵化，第一版只是给广告创意做高性能 Canvas
- **2016 年**：Adobe Animate 选 PixiJS 作为 HTML5 导出后端，进入主流视野
- **2020 年**：v6 完整切 TypeScript，类型可用度大幅提高
- **2024 年**：v8 完整重写——renderer 抽象层 / RenderPipe / RenderGroup，铺路 WebGPU
- **2025 年起**：Mat 在 roadmap 里提 Rust core 重写预研，把 batcher / matrix math 编译到 wasm

## 学到什么

1. **GPU 加速 2D 渲染的本质是"少 drawCall"**——批处理是 Pixi 跟其它 2D 库拉开差距的核心
2. **scene graph 是个抽象，不是数据层**——它只负责"画"，业务数据要单独 store
3. **激进重写 vs 渐进迭代**：v8 把渲染管线抽象成多后端友好，长期是对的，短期成本是生态 catch-up 慢
4. **工具库的边界是一种价值**——Pixi 不做物理 / 状态机 / 音频，组合自由，但学习曲线对游戏新手不友好

## 延伸阅读

- 官方文档：[pixijs.com](https://pixijs.com/) 的 v8 guide，含交互式 playground
- 视频教程：[Coding with Adam — PixiJS v8 crash course](https://www.youtube.com/results?search_query=pixijs+v8+tutorial)（YouTube 1 小时把核心 API 跑一遍）
- 仓库 README：[pixijs/pixijs](https://github.com/pixijs/pixijs) 主仓库，issue tracker 是 v8 迁移问题的最佳答案库
- [[konva]] —— 同位 2D 库，纯 Canvas2D 实现，对比 Pixi 看 GPU 加速差距
- [[fabric-js]] —— 也走 Canvas2D，但定位是图形编辑器（图层/选区/控制点）
- [[lottie]] —— 矢量动画播放器，底层后端可以选 Pixi

## 关联

- [[konva]] —— 同位 2D 库，Canvas2D 实现；性能上限低于 Pixi 但 API 更声明式
- [[fabric-js]] —— 同位 Canvas2D 工具，定位"图形编辑器"，重交互而非高性能
- [[lottie]] —— 矢量动画播放器；可以用 Pixi 当后端
- [[anime]] —— 动画库；常和 Pixi 搭配做时间轴控制
- [[gsap]] —— Tween 引擎；Pixi 周边动画的事实标准搭档
- [[d3]] —— 数据计算 + DOM 渲染；大数据量散点 / 力导图改用 Pixi 渲染层
- [[jimp]] —— Node 端图像处理；Pixi 是浏览器端 GPU 渲染，互补不竞争

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[anime]] —— anime.js — 一行 JS 让网页元素按时间线动起来
- [[cocos2d-x]] —— Cocos2d-x — 一份 C++ 代码把 2D 手游跑遍 iOS / Android
- [[d3]] —— D3.js — 不是图表库，是写图表库的乐高
- [[excalidraw]] —— Excalidraw — 手绘风协作白板
- [[fabric-js]] —— Fabric.js — 给 Canvas 加一层"对象模型"，让画布图形可以拖
- [[gsap]] —— GSAP — GreenSock 高性能动画
- [[heaps]] —— Heaps — 用 Haxe 一次编写、发布到任何平台的游戏引擎
- [[jimp]] —— jimp — 哪都能跑的纯 JS 图像处理库
- [[konva]] —— Konva — 给 HTML5 Canvas 装一棵会响应的节点树
- [[melonjs]] —— melonJS — 轻量 JS 2D 引擎
- [[minetest]] —— Luanti / Minetest — 给自己造一个开源体素游戏引擎
- [[phaser]] —— Phaser — 在浏览器里写 2D 游戏的完整工具箱
- [[react]] —— React UI 组件库
- [[threejs]] —— three.js — Web 3D 事实标准

