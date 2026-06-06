---
title: PlayCanvas — 浏览器里跑的 3D 游戏引擎
来源: 'https://github.com/playcanvas/engine'
日期: 2026-06-06
分类: 图形学
子分类: 渲染与图形
难度: 中级
---

## 是什么

PlayCanvas 是一套**在浏览器里跑的完整 3D 游戏引擎**，底层用 WebGL2 / WebGPU 驱动，配套一个云端可视化编辑器。

日常类比：把 Unity 塞进一个网页标签页——你能拖拽场景、写脚本、实时预览，最后发布到任意 URL，用户打开链接就能玩，不用装客户端。

引擎本体极轻量（gzip 后约 450 KB），内置实体-组件（Entity-Component）系统、PBR 渲染、物理引擎（ammo.js）、动画状态机、3D 音效、WebXR 支持。资产采用 glTF 2.0 + Draco 压缩 + Basis 纹理异步流加载，首帧渲染快、内存峰值低，移动端 60fps 可达。

```js
import { Application, Entity, Color, FILLMODE_FILL_WINDOW, RESOLUTION_AUTO } from 'playcanvas';

const canvas = document.createElement('canvas');
document.body.appendChild(canvas);

const app = new Application(canvas);
app.setCanvasFillMode(FILLMODE_FILL_WINDOW);
app.setCanvasResolution(RESOLUTION_AUTO);
window.addEventListener('resize', () => app.resizeCanvas());

// 创建旋转方块
const box = new Entity('cube');
box.addComponent('render', { type: 'box' });
app.root.addChild(box);

const camera = new Entity('camera');
camera.addComponent('camera', { clearColor: new Color(0.1, 0.2, 0.3) });
camera.setPosition(0, 0, 3);
app.root.addChild(camera);

const light = new Entity('light');
light.addComponent('light');
light.setEulerAngles(45, 0, 0);
app.root.addChild(light);

app.on('update', dt => box.rotate(10 * dt, 20 * dt, 30 * dt));
app.start();
```

这 30 行就能在浏览器里得到一个旋转的方块，完整 3D 场景、灯光、相机一应俱全。

## 为什么重要

不了解 PlayCanvas，下面这些事很难解释：

- 为什么 Snap、Disney 的网页广告里能出现实时 3D 模型，而不是预渲染视频
- 移动浏览器里 3D 游戏为什么能跑到 60fps，轻量运行时怎么做到的
- WebXR 体验（VR/AR）为什么能"即点即玩"，不需要独立 App
- 为什么"开源引擎 + 商业云编辑器"这种组合可以持续运营十年以上

## 核心要点

**1. Entity-Component 是一切的骨架**

Entity 是场景中的空节点，Component 是能力插件（render / camera / light / script / collision…）。想让一个物体既能碰撞又能发声？给它 `addComponent('collision')` 和 `addComponent('sound')`。类比：Entity 是乐高底板，Component 是各种积木块，想要什么功能就插什么块，互不干扰。

**2. 渲染管线：PBR + Gaussian Splatting + WebXR 三驾马车**

PlayCanvas 默认使用基于物理的渲染（PBR），金属度/粗糙度工作流与 glTF 2.0 规范对齐。2023 年率先在 WebGL 引擎中集成 3D Gaussian Splatting，能在浏览器实时渲染由数百万高斯点构成的场景。WebXR 会话管理内置，两行代码进入 VR 模式。

**3. Script 系统：TypeScript 写游戏逻辑**

游戏行为封装在 ScriptType 子类里，引擎在每帧调用 `update(dt)`、在碰撞时调用 `onCollisionStart` 等生命周期钩子。类比：像 Unity 的 MonoBehaviour，但运行在浏览器里，可以直接访问 DOM、fetch API、WebSocket。

```ts
import { ScriptType } from 'playcanvas';

export class Rotator extends ScriptType {
  static scriptName = 'rotator';
  speed = 30; // degrees/s

  update(dt: number) {
    this.entity.rotate(0, this.speed * dt, 0);
  }
}
```

## 实践案例

### 案例 1：移动端互动广告（3D 产品展示）

品牌商需要在 H5 页面里展示可 360° 旋转的鞋子模型，要求首帧 < 3 秒。

```js
// 资产预配置（编辑器里设置好 Draco + Basis 压缩）
app.assets.loadFromUrl('/assets/shoe.glb', 'container', (err, asset) => {
  if (err) return;
  const entity = asset.resource.instantiateRenderEntity();
  app.root.addChild(entity);

  // 触摸拖拽旋转
  let lastX = 0;
  app.mouse.on('mousemove', e => {
    if (e.buttons[0]) entity.rotate(0, (e.x - lastX) * 0.5, 0);
    lastX = e.x;
  });
});
```

Draco 压缩把 glTF 几何体缩小 70%，Basis 纹理 GPU 直接解压，加载快且内存省。首帧时间从未压缩的 6 秒降到 2.1 秒。

### 案例 2：WebXR 虚拟展厅

美术馆想让用户用 VR 头显参观 3D 画廊，点击墙上的画跳出详情。

```js
// 检测 XR 支持并启动沉浸式会话
if (app.xr.supported) {
  document.getElementById('enter-vr').addEventListener('click', () => {
    app.xr.start(camera.camera, pc.XRTYPE_VR, pc.XRSPACE_LOCALFLOOR);
  });
}

// 控制器射线拾取
app.xr.input.on('select', inputSource => {
  const hit = app.xr.input.hitTest(inputSource);
  if (hit?.entity?.tags.has('artwork')) {
    showArtworkDetail(hit.entity.name);
  }
});
```

PlayCanvas 把 WebXR Session API 封装成事件模型，开发者不必手写 `requestAnimationFrame` 的 XR 变体，直接在 `update` 里拿 pose 数据。

### 案例 3：轻量多人 .io 游戏

用 WebSocket 实现 30 人同场的坦克竞技，PlayCanvas 负责渲染，自定义网络层负责同步。

```js
// 服务端推来的状态 → 更新实体位置
ws.onmessage = ({ data }) => {
  const state = JSON.parse(data);
  state.players.forEach(p => {
    let tank = tanks.get(p.id);
    if (!tank) {
      tank = createTankEntity();
      tanks.set(p.id, tank);
    }
    // 插值平滑
    tank.setPosition(p.x, 0, p.z);
    tank.setEulerAngles(0, p.angle, 0);
  });
};
```

Entity-Component 让"动态创建 / 销毁坦克实体"变成几行代码；事件系统解耦网络逻辑与渲染逻辑。

## 踩过的坑

1. **update 循环里 new Vec3() / new Color() 触发频繁 GC**——应在 initialize 里预分配，复用对象。
2. **销毁实体前忘记解绑事件**——`app.mouse.off` / `app.keyboard.off` 不调用，监听器泄漏，内存持续增长。
3. **超过 4 个动态光源移动端帧率崩**——移动 GPU 着色器分支爆炸；解法是烘焙 Lightmap 或用 Clustered Lighting（引擎支持但需手动开启）。
4. **编辑器里改了脚本但忘记点 Publish**——本地 `npm run serve` 看到最新效果，云端用户还跑旧版本，两边表现不一致。

## 适用 vs 不适用场景

**适用：**

- 需要在浏览器里交付的 3D 游戏、互动广告、产品可视化
- 移动 Web 游戏（H5）：轻量运行时 + 资产压缩组合拳
- 快速原型：云编辑器开箱即用，不需要本地环境搭建
- WebXR 项目：内置 XR 会话管理，开发成本低

**不适用：**

- 大型单机 / 主机游戏：原生引擎（Unreal / Godot）更合适，不需要 Web 约束
- 超复杂物理场景：ammo.js 是 Bullet 的 WebAssembly 移植，性能上限低于原生
- 已有重度 Three.js / Babylon.js 代码库：迁移成本高，不如在现有生态加深
- 离线优先应用：PlayCanvas 编辑器依赖云端，断网下本地工作流受限

## 历史小故事（可跳过）

- **2011 年**：Will Eastcott 和 Dave Evans 在伦敦创立 PlayCanvas，当时 WebGL 刚在主流浏览器普及，市场空白。
- **2014 年**：核心引擎在 GitHub 开源（MIT 协议），云端编辑器保持商业 SaaS；开源引擎 + 商业工具的双轨模式沿用至今。
- **2018 年**：WebXR 标准草案稳定，PlayCanvas 第一批集成 WebXR，让 VR/AR 内容可直接在浏览器里发布。
- **2023 年**：率先在 WebGL 引擎中支持实时 3D Gaussian Splatting 渲染，NeRF 社区大量开发者涌入试用。
- **2024 年**：发布 `@playcanvas/react` 和 `@playcanvas/web-components`，让前端开发者用声明式语法搭 3D 场景，进一步降低入门门槛。

## 学到什么

- **Entity-Component 是通用抽象**：游戏引擎、ECS 框架甚至某些后端服务都在用这个思路——数据（Entity）和行为（Component/System）分离，组合优于继承。
- **运行时大小是 Web 的第一公民**：450 KB 的引擎能做完整 3D，是因为每个功能模块都可按需导入；Tree-shaking 不是锦上添花，是设计哲学。
- **压缩格式决定加载速度天花板**：glTF + Draco + Basis 这三层压缩是组合拳，缺任何一层都会在移动端出现明显瓶颈。
- **开源引擎 + 商业云编辑器**可以同时服务两类用户：开发者用开源版本自由扩展，团队用云编辑器协作迭代，不互相排斥。

## 延伸阅读

- [PlayCanvas 官方文档 User Manual](https://developer.playcanvas.com/user-manual/engine/)
- [API Reference](https://api.playcanvas.com/engine/)
- [PlayCanvas Examples（在线可编辑）](https://playcanvas.com/examples/)
- [Awesome PlayCanvas 项目列表](https://github.com/playcanvas/awesome-playcanvas)
- [3D Gaussian Splatting 官方 Demo](https://playcanvas.com/viewer)
- [[threejs]] —— 同为 WebGL 封装，更底层更灵活，社区生态更大

## 关联

- [[threejs]] —— 同样封装 WebGL，Three.js 更底层、无编辑器，PlayCanvas 更"全栈"
- [[babylonjs]] —— 竞品引擎，功能对标，BabylonJS 有更强的 TypeScript 优先设计
- [[phaser]] —— 专注 2D 游戏的 Web 框架，与 PlayCanvas 的 3D 定位互补
- [[pixi]] —— 高性能 2D 渲染器，适合 UI 动效和 2D 游戏，不做 3D
- [[cocos2d-x]] —— 跨平台游戏引擎，国内市场占有率高，原生端更强
- [[d3]] —— 数据可视化库，WebGL 渲染路线不同但都在浏览器做图形
- [[echarts]] —— 同在浏览器做 3D 可视化（ECharts GL），目标场景是数据图表而非游戏

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[babylonjs]] —— Babylon.js — 微软开源的企业级 Web 3D 引擎
- [[d3]] —— D3.js — 不是图表库，是写图表库的乐高
- [[echarts]] —— Apache ECharts — 给一个 JSON 就能画图的可视化库
- [[phaser]] —— Phaser — 在浏览器里写 2D 游戏的完整工具箱
- [[pixi]] —— PixiJS — 浏览器里画 2D 的高性能 GPU 引擎
- [[threejs]] —— three.js — Web 3D 事实标准

