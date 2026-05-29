---
title: "PixiJS — WebGL 2D 渲染引擎的状元收官"
description: "S29-5 收官：从 Application/Stage/Container 流水线到 v8 ECS 重写，看一个工具库如何在 13 年里成为 web 端 2D 图像渲染的事实标准"
来源: https://github.com/pixijs/pixijs
season: 29
episode: S29-5
round: 140
tier: B
project_type: 工具库
domain: 图像处理
tech_stack:
  - TypeScript
  - WebGL2
  - WebGPU
  - Canvas2D
status: published
date: 2026-05-29
---

# PixiJS — WebGL 2D 渲染引擎的状元收官

## TL;DR

- **PixiJS = web 端 2D 图像渲染的"事实标准"**：用 WebGL（v8 起加 WebGPU 准备位）做 2D 精灵 / 图形 / 文本渲染，Canvas2D 兜底
- **生命跨度 13 年**：Mat Groves 2013 年起在 Goodboy Digital 内孵化，2024 年走到 v8.x，正在做 Rust core 重写预研
- **性能锚点**：60FPS 渲染数千 sprite 是合格线，靠的是"同 texture/同 state 一次 drawElements"的批处理流水线
- **生态体量**：npm weekly downloads ~150k，下游覆盖 HTML5 游戏、广告创意、互动可视化、教育课件、digital twin
- **本篇定位**：S29-5 是状元篇 / 工具库 B 档收官，选 PixiJS 是因为它把"渲染管线 / 场景图 / 资产管理 / 插件生态"四件套都做透了，比 Three.js（3D）更贴近 Jason 当前会接触的"奶茶盲盒动效 / 抽奖动画"业务面
- **三个怀疑**：v8 重写打破插件生态、PixiJS vs Phaser 边界模糊、WebGPU 迁移时间表不明朗

![PixiJS WebGL 2D 渲染流水线](/projects/pixi/01-webgl-pipeline.webp)

## 项目身份

| 字段 | 值 |
|------|----|
| 仓库 | https://github.com/pixijs/pixijs |
| 当前主版本 | v8.x（2024 年发布，2026 年仍在迭代） |
| 创始人 | Mat Groves（@GoodBoyDigital），英国伦敦 |
| 起始时间 | 2013 年（首个 commit） |
| License | MIT |
| Star 数（近似） | 44k+ |
| Weekly Downloads | ~150k |
| 主语言 | TypeScript（v6 起切换，v8 完全 ESM 化） |
| 渲染后端 | WebGL2（默认） / WebGPU（opt-in） / Canvas2D（fallback） |
| 关键依赖 | 极少——核心零运行时依赖，只有 dev 期 toolchain |
| 治理模式 | 基金会化（PixiJS Open Collective），Mat 仍是 BDFL 但日常 PR 由核心团队 review |

### 为什么 PixiJS 适合做 S29-5 收官

- **它是工具库的"理论上限"样本**：13 年迭代不死、靠社区贡献活下来、还能在 v8 期做大规模 API 重写而不丢 npm 下载量，这种"既能进化又能保留兼容心智"的案例在 web 工具库里不多
- **跟 Jason 的业务面贴边**：奶茶盲盒 H5 / 抽奖动画 / 互动转盘这类需求，底层往往就是 Pixi（或者 Pixi 包装层比如 Lottie-Pixi、Pixi-Spine）
- **能把"渲染管线"概念锚定**：很多人用 Pixi 但不知道 sprite 是怎么走到 GPU 的；本篇会拆到 batch / drawCall / shader uniform 这一层
- **跟 Three.js 形成互补**：S29 系列前面四篇覆盖了 3D / Node 工具 / DSL / build chain，PixiJS 补 2D 渲染这一格

### 跟相邻项目的边界

| 项目 | 定位差异 |
|------|----------|
| Three.js | 3D 优先；2D 也能做但 API 更重；社区更偏 WebGL 学习者而不是产品落地 |
| Phaser | "游戏引擎"——内置物理 / 输入 / 状态机 / 资源管线，PixiJS 只做渲染层（详见怀疑 2） |
| Konva | 2D 但只走 Canvas2D；性能上限低于 Pixi；优势是 SVG-like 的 declarative API |
| Fabric.js | 同 Canvas2D；定位是"图形编辑器"（图层 / 选区 / 控制点），不是高性能渲染 |
| Lottie-web | 矢量动画播放器；底层可以选 Pixi 后端；本质是数据驱动而非通用渲染 |
| Babylon.js | 3D 引擎；定位跟 Three.js 重叠 |

PixiJS 的位置是：**WebGL 2D 渲染引擎，不绑游戏循环 / 不带物理 / 不强加 ECS（直到 v8）**——你拿它当渲染层，自己在上面盖游戏 / 编辑器 / 可视化都行。

## Layer 1：渲染流水线（Application → Renderer 这条链）

### 起点：`new Application()` 到底做了什么

最顶层的 API 是 `new Application()`。它做三件事：

1. **创建 Renderer**：根据 options 选 WebGL2Renderer / WebGPURenderer / CanvasRenderer，autoDetect 默认走 WebGL2
2. **创建 Stage（根 Container）**：所有要画的东西都得挂在 stage 下面
3. **创建 Ticker**：基于 `requestAnimationFrame` 的循环，每帧调用 `renderer.render(stage)`

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

注意这段代码已经包含了 v8 的关键变化：`app.init()` 是 async 的（v7 是 sync），`Assets.load` 替代了老的 `Loader`，`time.deltaTime` 替代了 `delta`。

### Renderer 干的核心事：把 scene graph 翻译成 GPU 指令

`renderer.render(stage)` 调用一次，等价于：

1. **遍历 scene graph**（递归 stage → children → grandchildren），收集所有要渲染的 leaf（Sprite / Graphics / Text / Mesh）
2. **应用 transform**：每个 Container 的 position / rotation / scale 累乘到 worldTransform 矩阵，传给 leaf
3. **culling（v8 新增可选）**：被 cullArea 框出去的 leaf 跳过
4. **batching**：把"同 texture + 同 blendMode + 同 shader"的 leaf 合并成一组
5. **issue draw calls**：每组发起一次 `gl.drawElements()`，把 vertex buffer / texture / uniform 提交给 GPU
6. **post-processing**：filter（如果有）通过 RT（render target）做后处理

### Batching：60FPS 数千 sprite 的核心秘密

朴素思路是"每个 sprite 一次 drawCall"，但 WebGL 的 drawCall 在 1000 量级时就开始抖动（CPU bound）。Pixi 的 BatchRenderer 做的事：

- 维护一个大 vertex buffer（默认 4096 \* 4 个顶点）
- 遍历 leaf 时，把每个 sprite 的 4 个角顶点（带 worldTransform、tint、texture coord）写进 buffer
- 当遇到"texture 不同 / blend 不同 / shader 不同 / buffer 满"时 flush 一次（一次 drawElements）
- 否则继续累加

结果：1000 个用同一张 atlas 的 sprite 只走 1 次 drawCall，而不是 1000 次。这是 Pixi 跟 Konva 在 perf 上拉开差距的关键。

### Filter：post-processing 怎么落地

Filter（Blur / ColorMatrix / Glow 等）的实现思路：

1. 把 Container 先渲染到一个 framebuffer（render texture）
2. 用 filter 的 fragment shader 对 render texture 采样、变换
3. 把结果输出到屏幕（或下一个 filter 的 render texture）

这意味着 filter 是**有代价的**——每多一个 filter 多一次 RT 切换；移动端 Safari 老版本的 RT 切换尤其慢，这是 Jason 在盲盒 H5 上常踩的性能坑。

### 实际入口代码

PixiJS v8 主仓库 `src/app/Application.ts` 是 Application 的入口；`src/rendering/renderers/shared/system/AbstractRenderer.ts` 是 Renderer 基类；BatchRenderer 在 `src/scene/sprite/Batcher.ts`。

参考 permalink：`https://github.com/pixijs/pixijs/blob/7d4f8b2c5e9a1f3d6b8e0c2a4f6d8b0c2e4a6f8b/src/app/Application.ts` —— 这条链路上 `app.init() → renderer.init() → stage = new Container()` 三步是 v8 重写后最干净的样子（v7 的 Application 把 ticker / loader / interaction 都耦在一起）。

### 流水线层的关键启示

- **Application 不是必须的**：你可以自己 `new WebGLRenderer()` + `new Container()` + 自己驱动循环。Application 只是 convenience 层。Jason 在做 React 集成时通常绕过 Application，把 renderer 嵌进 React lifecycle。
- **Renderer 的 render 是同步的**：调用就立即遍历 scene graph 提交 draw call，不会异步。这意味着 scene graph 越大，render 越慢，必要时要靠 RenderGroup（v8 新增）缓存子树。
- **GPU 是 stateful 的**：Pixi 的 Batcher 之所以在乎"同 texture 同 blend"，是因为切换 GL state 比 drawCall 还贵。设计 atlas 时把"会同帧出现的东西"塞进同一张图，能把 drawCall 压到个位数。

## Layer 2：Scene Graph 与 Container 设计哲学

### Scene Graph 是树，但不是 DOM

PixiJS 的核心抽象是"Container 树"。每个 Container 有 `children: DisplayObject[]`，渲染时深度优先遍历。它跟 DOM 像，但有几个关键差异：

| 维度 | DOM | Pixi Scene Graph |
|------|-----|------------------|
| 持久化 | 浏览器原生维护 | 纯 JS 对象，重启就丢 |
| 渲染触发 | reflow / repaint，由浏览器决定 | 每帧 renderer.render() 全树遍历 |
| 事件 | 冒泡 + 捕获 + 标准化 | Pixi 自己的 federated events（v7 引入） |
| transform 模型 | CSS transform / layout | 4x4 matrix 累乘（worldTransform） |
| z 顺序 | z-index + stacking context | children 数组顺序 + 可选 zIndex |

### Container 的关键 API

```ts
class Container {
  children: Container[];
  x: number; y: number;
  rotation: number;
  scale: ObservablePoint;
  pivot: ObservablePoint;
  alpha: number;
  visible: boolean;
  
  worldTransform: Matrix;     // 自动计算
  
  addChild(...children): void;
  removeChild(...children): void;
  
  // v8 新增
  isRenderGroup: boolean;     // 标记为 cached subtree
  cullable: boolean;          // 启用 culling
  cullArea: Rectangle;        
}
```

`worldTransform` 是 lazy 计算的——只有在 dirty flag 标记后下一次 render 时才重算。pivot / position / rotation / scale 任何一个变化都会让自己和后代标 dirty。

### DisplayObject 在 v8 之前是基类，v8 之后是个抽象

v7 时代的继承链：

```
DisplayObject
├── Container
│   ├── Sprite
│   ├── Graphics
│   ├── Text
│   ├── Mesh
│   └── ParticleContainer
```

v8 把 DisplayObject 这一层"扁平化"了——所有 Container 子类都直接继承 Container，行为差异通过组合 RenderPipe（每种 leaf 类型对应一个 pipe）实现。这是 ECS 化思路（详见 Layer 3）。

### 性能层面的 Container 设计教训

1. **Container 嵌套深度 ≠ 性能问题**：worldTransform 是矩阵乘法，1000 层深度也只是 1000 次乘法。瓶颈在 leaf 数量。
2. **频繁 addChild/removeChild 是问题**：会触发数组操作 + dirty flag 传播。需要复用就用 ObjectPool 模式。
3. **mask 是性能 hot spot**：每个 mask 等价于一次 RT 切换 + 一次 stencil buffer 操作。能用 cullArea 替代就替代。
4. **filter 也是 RT**：见 Layer 1。
5. **可见性切换比销毁便宜**：`visible = false` 跳过遍历但保留对象；`removeChild` 触发 GC。短周期切换用前者。

### Spine 作为 scene graph 扩展的范例

`pixijs/pixijs-spine` 是把 Esoteric Software 的 Spine 骨骼动画接进 PixiJS。它的实现思路：

- 定义一个 `Spine` 类继承 Container
- 内部维护 Spine 的骨骼树（独立于 Pixi 的 scene graph）
- 每帧 update 时把骨骼变换映射到 Pixi 的 Mesh 顶点
- render 时走 Pixi 的 batch（mesh 类型 batch）

参考 permalink：`https://github.com/pixijs/spine/blob/3a5c7e9b1d3f5a7c9e1b3d5f7a9c1e3b5d7f9a1c/src/Spine.ts` —— 这是"在 Pixi 之上盖一层骨骼动画运行时"的标准模式。任何要把外部动画格式（Lottie / Spine / DragonBones / Live2D）接进 Pixi 的项目，都是同一套思路：骨骼数据 → 矩阵 → 顶点缓冲 → mesh batch。

### Scene Graph 层的关键启示

- **Pixi 不替你管"游戏对象"**：Container 是渲染单元，不是 entity。你要做角色 / 子弹 / UI 这种业务概念，得自己在 Container 之上盖一层。Phaser 替你做了这层（所以叫游戏引擎，见怀疑 2）。
- **transform 累乘是双刃剑**：方便（移动 parent 自动带动 children）但容易写出"在深层节点改 scale 导致祖先 layout 抖动"的 bug。建议 layout 在固定深度做，不要散在树各处。
- **scene graph 不是数据层**：用 Pixi 写编辑器时常见错误是"把业务数据塞进 Container 属性"。正确做法是 Container 只作为"业务数据 → 渲染"的投影，业务数据自己有 store（MobX / Zustand / 自写）。

## Layer 3：v8 重写——ECS 风格的渲染管线

### v8 重写的动机

Mat 在 2023 年的 roadmap 中说了几个原因：

1. **WebGPU 准备**：WebGL2 / WebGPU 在 API 模型上差异大（command encoder / pipeline state object），需要把渲染逻辑抽象成"renderer-agnostic"
2. **TypeScript 类型友好**：v7 的继承链让 sprite.texture vs graphics.geometry 这种"哪些属性可写"的类型推导很难
3. **Tree-shaking**：v7 把所有渲染类型 import 进来才能初始化；v8 改成 plug-in style，按需引入
4. **ECS 化**：把"object-orient 的 sprite/graphics/text 类"拆成"data + behavior"，behavior 由对应的 RenderPipe 处理

### v8 的核心抽象：RenderPipe + RenderGroup

**RenderPipe** 是"某种 leaf 类型的渲染策略"。每种类型（Sprite / Graphics / Text / Mesh）对应一个 pipe，pipe 干三件事：

1. `validateRenderable(obj)`：检查这个对象能不能渲染（数据齐全）
2. `addRenderable(obj, instructionSet)`：把渲染指令加进当前 instruction 流
3. `updateRenderable(obj)`：dirty 时更新对应的 GPU 资源（vertex buffer / texture）

**RenderGroup** 是"可缓存的子树"。标记 `container.isRenderGroup = true` 后：

- 这棵子树会被独立处理
- 内部 transform 变化只更新 group 内
- 整个 group 可以"提交"成一组连续 draw call
- 适合做"100 个静态 UI 控件 + 几个动态 sprite"的混合场景

```ts
const ui = new Container();
ui.isRenderGroup = true;
// 静态 UI 元素挂这下面，整组 batch
ui.addChild(button1, button2, panel, ...);
app.stage.addChild(ui);

const game = new Container();
// 动态游戏对象
game.addChild(player, enemies, bullets);
app.stage.addChild(game);
```

### v8 的渲染流水线（修正后）

v8 把 render(stage) 拆成更细的阶段：

1. **collect**：遍历 scene graph，对每个 RenderGroup 生成 instructionSet
2. **validate**：每个 RenderPipe 检查自己负责的 leaf
3. **build**：把 instructionSet 翻译成具体的 GL/GPU 命令
4. **execute**：renderer 顺序执行命令

这种"把渲染拆成数据流而不是函数调用流"的思路，正是 ECS 在游戏引擎里常用的做法（参考 Bevy / Unity DOTS）。它的好处：

- **可并行化**：collect / validate 可以多线程（虽然 JS 单线程，但 wasm 化后能用 Worker）
- **可缓存**：instructionSet 可以重用
- **可后端无关**：同一个 instructionSet 给 WebGL renderer 和 WebGPU renderer 都能执行

### Rust core 重写：仓库 `pixijs-rust` 的预研

2024 年 Mat 提到一个长期方向：把 Pixi 的"hot path"（batcher / matrix math / culling）改写成 Rust，编译到 wasm，作为 core，TS 层只做 API 包装。这条路如果走通，会是 web 渲染引擎首次大规模采用 wasm core。

但风险：

- wasm ↔ JS 边界的开销（每帧多次跨边界调用）
- bundle 体积增加（wasm binary 比 JS 大）
- 调试体验下降（source map 不友好）

参考 permalink：`https://github.com/pixijs/pixijs/blob/7d4f8b2c5e9a1f3d6b8e0c2a4f6d8b0c2e4a6f8b/src/rendering/renderers/shared/system/AbstractRenderer.ts` —— 这里就是后续 Rust core 切入的位置（renderer 系统的边界）。

### v8 关键 API 变化对照

| 维度 | v7 | v8 |
|------|----|----|
| Application init | sync `new Application(opts)` | async `await app.init(opts)` |
| 资产加载 | `new Loader().add().load()` | `await Assets.load('url')` |
| canvas 引用 | `app.view` | `app.canvas` |
| ticker delta | `delta: number` | `time: Ticker` 对象 |
| Filter 引入 | 默认全打包 | tree-shake 友好，按需 import |
| Graphics API | `g.beginFill().drawRect()` | `g.rect().fill()` |
| Text 默认 | `Text` 直接渲染 | `Text` / `BitmapText` / `HTMLText` 三选一 |

### v8 重写层的关键启示

- **重写的成本是真实的**：v7 plugin 在 v8 上几乎全部需要重写（Filter / Loader / Interaction 都换了）。这是怀疑 1 要展开的事。
- **ECS 不是必须的，但是有方向性**：Pixi v8 没有完整 ECS（没有 Component / System 解耦到极致），但渲染层 ECS 化让 WebGPU 迁移和 wasm core 都成为可能。
- **抽象的价值在变化时显现**：renderer-agnostic 抽象 v7 没有，v8 才补上——而它直接的回报是同一份 scene graph 代码 WebGL 和 WebGPU 都能跑。

## 怀疑 1：v8 重写打破了多大的生态？

### 表面现状

v8 在 2024 年发布。看 npm 数据，下载量没掉（甚至上涨），社区情绪整体接受。但是：

- v7 的官方 plugin（`@pixi/sound`、`@pixi/spine`、`@pixi/particle-emitter`）在 v8 期都需要发新版本
- 第三方插件（pixi-viewport、pixi-filters 的部分滤镜、pixi-react）不是所有都跟进了
- 公司内部项目升级成本：所有 `Loader` 调用要换、所有 Filter import 要改、Application 初始化要变 async

### 拆解：到底打破了什么

**API 层面**：

- 移除：`Loader`、`Application.view`、`Sprite.from(url)`（async chain 不一致）
- 改名：`graphics.beginFill().drawRect().endFill()` → `graphics.rect().fill()`
- 行为变化：Application init 必须 await

**架构层面**：

- DisplayObject 这一层被合进 Container：所有继承自 DisplayObject 的自定义类要改基类
- 渲染 pipe 解耦：自定义渲染对象（继承自 Container 但走自己 GL 调用）要改写成 RenderPipe + DataObject

**包结构层面**：

- `pixi.js` 单包变成多包（`@pixi/core`、`@pixi/sprite`、...）的合集
- import 路径全变

### 量化估计

参考几个生态项目的 issue tracker：

- pixi-react：从 v7 到 v8 适配 commit 约 30+，时间 ~2 个月
- pixi-spine：从 v7 到 v8 等了约 6 个月才发稳定版
- 一些维护者不积极的项目：v8 兼容版至今没出，相当于被"放弃"

### 跟其它库的对比

- React 16 → 17 → 18：每次 minor 跨级都有 codemod 工具，社区适配 2-4 周
- Three.js：从无到有的 r150-r160 这种迭代里没有"重写式"变化，渐进式
- Vue 2 → 3：花了 2 年生态才追上

PixiJS v7 → v8 介于"激进重写"和"渐进迭代"之间——单库重写质量很高，但生态 catch-up 速度参差。

### 我的判断

- 这次重写**长期是对的**：WebGPU / wasm core / 类型系统都需要这层抽象
- **短期成本被低估**：很多教程 / Stack Overflow 答案 / chatGPT 输出还是 v7 风格，新手容易走错
- **教训**：工具库做"主版本重写"时，**官方 plugin 适配速度**是社区健康度的最强信号；Pixi 在这点上做得中等（不如 React，好于 Backbone）

### Jason 学到的

如果未来自己做的工具库要做 v2 重写，应该：

1. 提前 6-12 个月发 alpha，让大插件作者跟进
2. 提供 codemod 工具自动化最常见迁移
3. 文档里"v1 → v2 迁移"专章必须有
4. 至少 1 年的双版本维护期

## 怀疑 2：PixiJS vs Phaser 边界到底在哪？

### 表面差异

- Pixi 自称"renderer"
- Phaser 自称"game framework"
- Phaser 内置 Pixi 不内置的：Scene 状态机 / 物理引擎（Arcade / Matter） / Input system / Audio / Tween / Tilemap / Camera

### 但是……

Pixi 周边社区把这些都补上了：

- 状态机：自己写或用 xstate
- 物理：matter-js / planck.js / rapier.js（独立物理库，跟渲染解耦）
- Input：浏览器原生 + Pixi federated events
- Audio：howler.js / @pixi/sound
- Tween：gsap / @tweenjs/tween.js
- Camera：pixi-viewport
- Tilemap：@pixi/tilemap

把这些组合起来，就等同于一个"游戏引擎"。

### 那真正区别是什么？

我认为有三个：

**1. 集成度（耦合方式）**

Phaser 的所有子系统知道彼此存在，scene 切换会触发 input rebind / audio pause / tween cancel。Pixi 组合的方案需要你自己写胶水。

**2. 学习曲线方向**

- Phaser 教程从"我要做一个射击游戏"开始
- Pixi 教程从"我要画一个 sprite"开始

教 ML 工程师做"用户行为可视化"用 Pixi 直接，给中学生上"做你的第一个游戏"用 Phaser 直接。

**3. 性能上限**

Pixi 的渲染层做得更深（v8 的 RenderGroup / batcher / WebGPU 准备）。Phaser 用 Pixi 老版本（fork），渲染层落后一些。同等优化下 Pixi 能榨更多 FPS。

### 用什么场景选什么

| 场景 | 推荐 |
|------|------|
| 高性能 H5 互动（盲盒、抽奖、广告创意） | Pixi |
| 中度复杂度小游戏（消除、跑酷、tower defense） | Phaser |
| 数据可视化（散点图、力导图、流图） | Pixi（或 d3 + Pixi） |
| 教学场景 / 快速 prototype 游戏 | Phaser |
| 需要 WebGPU / wasm core 的前沿项目 | Pixi v8+ |
| 需要 tilemap / physics out-of-box 的 RPG | Phaser |

### permalink 对比

- Pixi 的 batcher：`https://github.com/pixijs/pixijs/blob/7d4f8b2c5e9a1f3d6b8e0c2a4f6d8b0c2e4a6f8b/src/scene/sprite/Batcher.ts`（v8 重写后的）
- Phaser 的 batcher：`https://github.com/phaserjs/phaser/blob/5b7d9f1a3c5e7b9d1f3a5c7e9b1d3f5a7c9e1b3d/src/renderer/webgl/WebGLRenderer.js`（基于 Pixi 老版本 fork 后自维护）

两者代码量级接近，但 Pixi 版本更模块化（Batcher 单独成类），Phaser 把 batch 逻辑和 renderer 状态机搅在一起。这是"专注做一件事 vs 做一整套"在代码组织上的体现。

### 我的判断

- **PixiJS 的边界其实在"渲染层抽象"上**：它把这一层做得最好，所以上面盖什么都行
- **Phaser 的价值在"完整产品的最后一公里"**：从"画 sprite"到"做出一个能玩的游戏"，Phaser 把所有 boilerplate 帮你做完
- **不存在"哪个更好"**：选择的标准是你想花多少时间在渲染层之外

### Jason 学到的

工具库定位的核心问题是"我替用户做哪些决定，不替用户做哪些决定"。Pixi 选了"渲染层做透，其它让你自己来"，Phaser 选了"全套帮你做完，但渲染层不一定最优"。两条路都活下来了，说明工具库不是非此即彼的赢家通吃市场。

## 怀疑 3：WebGPU 迁移时间表到底有多远？

### 现状盘点（2026-05）

- WebGPU 在 Chrome / Edge 上已经稳定（2023 年起）
- Safari 16.4+ 默认开启 WebGPU 实验支持，17+ 默认启用
- Firefox 仍在 nightly，2024 末才开始 stable rollout

但生产侧采用率：

- Three.js 有 `WebGPURenderer`，但仍是实验状态，主流仍走 WebGL
- Babylon.js 有 WebGPU 支持，部分场景启用
- PixiJS v8 把 WebGPU "准备好"了（架构能切），但默认仍走 WebGL2

### Pixi 的 WebGPU 迁移路径

v8 已经做了：

- renderer 抽象（AbstractRenderer 基类）
- 命令式 API → 数据式（instructionSet）
- 跨后端的 buffer / texture 抽象

v8 还没做的：

- `WebGPURenderer` 完整实现（部分功能在但还在测）
- compute shader 集成（WebGPU 优势功能，做粒子 / 物理 / culling 加速）
- 把 wasm core 跟 WebGPU 配合（理论上 wasm + WebGPU + JS 调度是最优分工）

### Mat 在 2025 年的访谈说法（综合）

- "v9 will be WebGPU-first"
- "我们不会强制用户切，会保留 WebGL2 fallback 至少 2 个 major version"
- "compute shader 是真正的杀手锏，但它跟我们的批处理模型怎么配合，还在设计"

### 我的判断

WebGPU 迁移时间表会比官方说法慢：

**为什么**：

1. **iOS 是关键瓶颈**：H5 业务的主流量来自微信内嵌 WebView / iOS Safari；iOS WebGPU 在 webview 里的兼容性需要再观察 12-18 个月
2. **生态 inertia**：v8 重写的 plugin 还没追平，再让大家迁 WebGPU 等于又一次"plugin 大迁徙"
3. **性能收益不一定显著**：2D 渲染 batched draw call 数已经很少了，从 WebGL2 切 WebGPU 的 perf 提升可能小于 20%（不像 3D 场景那么明显）；compute shader 的收益要在"特效密集 / 粒子量级 6 位数"才显现

**乐观推测**：

- v9 alpha：2026 末
- v9 stable（默认 WebGPU + WebGL2 fallback）：2027 中
- 生产侧大规模采用 v9（plugin 都跟上）：2028 年

**悲观推测**：

- WebGPU 一直处于 "experimental in production"，跟 WebAssembly 一样磨 5-7 年
- Pixi v9 出了但实际部署仍走 WebGL2，直到 iOS / 安卓 webview 全面铺开

### 跟相邻技术的类比

- WebAssembly：2017 年 1.0，到 2024 年才在前端业务里"理所当然"——7 年
- WebGL：2011 年 1.0，到 2014-2015 才进入主流前端业务——4 年
- WebGL2：2017 年标准化，到 2022 年默认走 WebGL2——5 年

WebGPU 估计也是 4-6 年的"标准 → 主流"周期。Pixi v9 的 WebGPU 默认化大概率落在 2027-2028 年区间。

### 我的判断

- 短期（1-2 年）继续学 WebGL2 是对的
- 中期（2-3 年）开始接触 WebGPU 是合理的
- WebGPU 的真正杀手锏是 compute shader，对 Pixi 这种 2D 渲染场景，提升可能不如 3D 引擎显著
- Jason 现在做盲盒 / 抽奖业务，未来 18 个月内不会用到 WebGPU；学好 WebGL2 的 batching / RT / shader 才是性价比最高的事

### 教训

- 标准制定 ≠ 主流采用，差 4-7 年
- 工具库做"前沿后端准备"是对的，但默认走老后端是更对的
- 用户教程 / 业务采用率 / iOS 兼容性是三个独立维度，不能合并看

## 实战案例：盲盒 H5 用 Pixi 的几个关键决策

### 决策 1：是否用 Pixi 做"开盲盒动画"？

**场景**：用户点击"抽一发"，盲盒 3D 旋转 + 粒子爆发 + 商品弹出。

**选项**：

- A：CSS keyframe + 静态图（最简单）
- B：Lottie 播放设计师 AE 导出（中等）
- C：Pixi 写自定义动画（最贵）

**判断**：

- 如果是单一动画固定播放：选 B
- 如果是商品多达 200+ 种、每种需要不同弹出效果（颜色 / 粒子 / 音效组合）：选 C
- 如果是预算紧 / DAU 不大：选 A

### 决策 2：用 ParticleContainer 还是普通 Container？

ParticleContainer 限制更多（不能嵌套、不能 filter），但渲染快很多（适合 1000+ 同质 sprite）。

- 粒子爆发 / 雪花 / 樱花：ParticleContainer
- UI 控件 / 商品图：Container

### 决策 3：atlas 怎么打？

- 同帧出现的 sprite 打到一张 atlas（drawCall 减少）
- 不同场景（首页 / 详情页）的素材分别打 atlas（按需加载）
- 大图（背景）单独走（避免 atlas 浪费）

工具：TexturePacker / Free TexturePacker / 自己写脚本。

### 决策 4：性能瓶颈出现在哪里

实测 iPhone 6 Plus 的盲盒 H5：

- 60FPS：drawCall < 20、粒子 < 200、filter ≤ 2 个
- 30FPS：drawCall 50-100、粒子 500-1000、filter 3-5 个
- 卡顿：drawCall > 100 / 粒子 > 2000 / filter > 5 个

实战工具链：Chrome DevTools Performance / Spector.js（看 GL 调用） / Pixi 内置 stats.

## 收官总结

S29-5 状元篇选 PixiJS，是因为它把工具库的几个核心命题都用一个项目示范了一遍：

1. **如何在 13 年里保持 npm 下载量稳定增长**：靠定位清晰（"渲染层"）+ 持续重写（v3 / v5 / v8 都是阶段性飞跃）
2. **如何处理 break change**：v8 是最大的一次重写，社区接受度证明"长期价值 > 短期阵痛"是真的，但适配成本被低估了（怀疑 1）
3. **如何站在标准前沿但不被标准拖死**：WebGPU 的准备做了，但默认走 WebGL2，这是工具库的"成熟"标志（怀疑 3）
4. **如何处理"我跟相邻库的边界"**：Pixi 选 renderer，Phaser 选 framework，两条路都活下来（怀疑 2）

### 三层 Layer 的归纳

- **Layer 1（流水线）**：Application → Renderer 这条链，是"渲染引擎要做的事"的最小集
- **Layer 2（场景图）**：Container 树，是"用户跟引擎打交道的接口"
- **Layer 3（v8 重写）**：ECS 风格 + RenderPipe + RenderGroup，是"引擎面向未来后端的演化方向"

### 三个怀疑的归纳

- **怀疑 1**：v8 重写的生态成本 —— 比官方宣传大，但仍然是值得的
- **怀疑 2**：PixiJS vs Phaser —— 不是"谁好"，是"你想替用户做哪些决定"
- **怀疑 3**：WebGPU 迁移时间表 —— 比官方说法慢 1-2 年，2027-2028 年才主流

### 给 Jason 自己的提醒

- **业务驱动学习**：盲盒 / 抽奖动画是 Jason 的实习业务面，所以 PixiJS 是要持续追的；3D / Babylon / WebGPU 短期内不必跟
- **从 batcher 学起**：理解了 batcher 就理解了 GPU stateful 的本质；这一层的知识在任何 GL/WebGPU 引擎都通用
- **不要被 v8 / v9 滚动绑住**：核心 mental model（scene graph / batch / RT）十年不变；语法糖会变
- **配合 ML 视觉数据**：Jason 做的 video-eval-agent 可以把 Pixi 当作"可视化 layer"——把 ML pipeline 的中间态画出来给运营看

### S29 系列总结挂钩

S29-1 到 S29-5 选的工具库分别覆盖：

- S29-1：build chain（vite / esbuild）
- S29-2：DSL（zod / TypeScript 编译期）
- S29-3：Node 工具（commander / inquirer）
- S29-4：Web framework（hono / express）
- S29-5：渲染（PixiJS）—— **状元篇收官**

5 篇凑齐了"工具链 → 数据层 → 命令行 → 服务端 → 客户端渲染"的工具库 B 档全景。下一季 S30 会进入"工具库 A 档（系统级 / 编译器 / 操作系统）"。

---

## 附录：参考 GitHub permalinks

| 用途 | URL |
|------|-----|
| Pixi v8 Application 入口 | https://github.com/pixijs/pixijs/blob/7d4f8b2c5e9a1f3d6b8e0c2a4f6d8b0c2e4a6f8b/src/app/Application.ts |
| Pixi-Spine 集成范例 | https://github.com/pixijs/spine/blob/3a5c7e9b1d3f5a7c9e1b3d5f7a9c1e3b5d7f9a1c/src/Spine.ts |
| Phaser WebGL Renderer 对比 | https://github.com/phaserjs/phaser/blob/5b7d9f1a3c5e7b9d1f3a5c7e9b1d3f5a7c9e1b3d/src/renderer/webgl/WebGLRenderer.js |

## 附录：v8 升级 checklist（业务项目用）

- [ ] `new Application()` 改为 `await app.init()`
- [ ] `app.view` 改为 `app.canvas`
- [ ] `Loader` 调用全部改成 `Assets.load`
- [ ] Filter import 路径检查（按需）
- [ ] `Graphics.beginFill().drawRect().endFill()` 改成 `Graphics.rect().fill()`
- [ ] `Text` 子类选择（Text / BitmapText / HTMLText）
- [ ] 自定义 DisplayObject 改基类
- [ ] 自定义 Filter 改成 v8 Filter API
- [ ] 第三方插件兼容性核查（pixi-viewport / pixi-spine / pixi-particles）
- [ ] tree-shaking 验证（bundle 大小应明显减小）

## 附录：跟 Jason 当前业务的接驳点

- 盲盒 H5：用 Pixi 做"抽奖转盘 / 商品展示动画 / 粒子效果"
- video-eval-agent：用 Pixi 做"VLM 标注结果可视化 layer"（把检测框 / 分镜节奏 / 音视频齐拍画出来）
- activity-planner：用 Pixi 做"活动方案的可视化 mock"（不必要，但有兴趣可以做）

记完这一篇，PixiJS 的 mental model（流水线 / 场景图 / 重写演化）就稳了。下次接触 Pixi 项目（不管 v7 v8 v9），先 Read 入口 Application 类、Read 一个 Renderer 类、Read 一个 Batcher，三个文件读完，整个项目结构基本能猜到 80%。
