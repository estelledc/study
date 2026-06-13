---
title: Matter.js — JS 2D 刚体物理
来源: 'https://github.com/liabru/matter-js'
日期: 2026-06-13
子分类: 渲染与图形
分类: 图形学
provenance: pipeline-v3
难度: 初级
---

## 是什么

**Matter.js** 是由 Liam Brummitt（liabru）维护的**开源 JavaScript 2D 刚体物理引擎**，MIT 协议，GitHub 仓库 [liabru/matter-js](https://github.com/liabru/matter-js) 约 18k star。它不负责游戏逻辑、UI 或网络，只回答一个问题：**给定质量、形状、力和约束，下一帧每个物体该在哪里、转多少度**。

日常类比：把 Matter.js 想成**浏览器里的弹珠台裁判**。你在画布上摆好挡板（静态刚体）、弹珠（动态刚体）、橡皮筋（约束），裁判按牛顿力学每帧推进世界，并把新坐标交还给你的 `<canvas>` 或 DOM 精灵。你画美术、写玩法；物理引擎管碰撞、摩擦、弹跳和连锁倒塌——弹弓益智、堆箱子、牛顿摆、布偶 ragdoll 的底层都是这类 2D 求解器。

与 C++ 的 Box2D 不同，Matter.js 是**原生 JavaScript 实现**（不是移植），零编译、CDN 一行 `<script>` 或 `npm install matter-js` 即可在浏览器与 Node.js 中运行。内置 Canvas 渲染器与 `Runner` 循环，也支持完全自定义渲染与 `requestAnimationFrame` 游戏循环。

## 为什么重要

不了解 Matter.js，下面这些事都难以解释：

- 为什么 HTML5 弹弓游戏、教育演示、数据可视化里的「可拖拽积木」可以**共用同一套物理 API**——刚体 + 复合体 + 约束是通用积木
- 为什么前端选型时经常在 **Matter.js、p2.js、box2d.js** 之间比较——Matter 自带渲染与事件，上手曲线更平缓
- 为什么物理坐标要用**合理尺度**而不是把 800 像素宽的角色直接当 800「米」——引擎按真实质量/惯量调参，极端尺寸会导致堆叠不稳或穿透
- 为什么 `Runner` 的固定时间步与页面帧率要分离——`Engine.update` 用离散积分，大 `delta` 会让高速物体**隧道穿透**（tunneling）
- 为什么「约束（Constraint）」和「碰撞」在引擎里是同一类问题——接触与弹簧、铰链都由**顺序冲量求解器**迭代处理

## 核心要点

### 1. 引擎（Engine）与世界（World）

`Matter.Engine.create()` 创建仿真核心，其中 `engine.world` 是根 **Composite**（复合体），持有本帧所有 **Body**。每调用一次 `Engine.update(engine, delta)`，内部大致顺序为：

1. **Broad-phase（粗检测）**：用网格或树结构筛出可能接触的刚体对
2. **Narrow-phase（细检测）**：精确求交，生成接触流形
3. **Solver（求解器）**：对接触与约束施加冲量，修正速度
4. **Integration（积分）**：用新速度更新位姿

类比：粗检测像快递按区域分拣；细检测像逐件称重；求解器像调解员决定两辆车擦碰后各退多少。

`engine.gravity` 默认 `{ x: 0, y: 1 }`（向下），可按场景改为 `{ x: 0, y: 0 }` 做太空模式，或用 `engine.gravity.scale` 微调强度。

### 2. 刚体（Body）与工厂（Bodies）

| 概念 | 职责 |
|------|------|
| **Body** | 位置、角度、线/角速度；`isStatic: true` 时不受力（地面、墙） |
| **Bodies** | 工厂方法：`rectangle`、`circle`、`polygon`、`trapezoid` 等 |
| **Vertices** | 凸包顶点；支持 `fromVertices` 从 SVG 路径生成凹形（自动凸分解） |

创建套路：`Bodies.rectangle(x, y, width, height, options)` → `Composite.add(world, body)`。常用选项：

| 选项 | 含义 |
|------|------|
| `density` | 密度，影响质量与转动惯量 |
| `friction` | 库仑摩擦，多在 0～1 |
| `restitution` | 恢复系数（弹性），0 = 不弹，1 = 完全弹性 |
| `isStatic` | 静态体，用于地面与固定障碍 |
| `chamfer` | 圆角，减少尖角卡住 |

一个 **Body** 可包含多个 **Part**（复合形状），`Bodies.rectangle` 返回的即是带 `parts` 数组的刚体。

### 3. 复合体（Composite / Composites）

**Composite** 是「容器」：可嵌套 body 与其他 composite，形成层次结构。`engine.world` 是根容器；`Composites.stack`、`Composites.pyramid`、`Composites.car` 等提供批量生成演示场景的快捷方法。

类比：Composite 像文件夹，Body 像文件——删除文件夹可一次清空关卡，事件也可挂在 composite 上批量监听。

### 4. 约束（Constraint）

**Constraint** 把两个 body（或 body 与空间锚点）用弹簧/杆连接：长度、刚度 `stiffness`、阻尼 `damping`。常见用途：

- 两点间固定距离 → 绳索、链条、摆锤
- `pointA` / `pointB` 为局部坐标锚点
- `length: 0` + 高刚度 → 近似焊接（weld）

与 Box2D 的 Joint 类似，但 API 更扁平：`Constraint.create({ bodyA, bodyB, ... })`。

### 5. 运行与渲染（Runner / Render）

| 模块 | 作用 |
|------|------|
| **Runner** | 内置 `requestAnimationFrame` 循环，自动调用 `Engine.update` |
| **Render** | 基于 Canvas 的调试/演示渲染，支持矢量与贴图 sprite |

二者**均可选**：生产游戏常只用 `Engine`，用 PixiJS、Phaser、Three.js（正交相机）或纯 DOM 自行绘制。官方 Wiki 的 [Running](https://github.com/liabru/matter-js/wiki/Running) 与 [Rendering](https://github.com/liabru/matter-js/wiki/Rendering) 页说明如何接管循环。

### 6. 事件（Events）

`Matter.Events.on(engine, 'collisionStart', callback)` 等可监听碰撞生命周期。引擎级事件包括 `beforeUpdate`、`afterUpdate`；body 级可监听 `sleepStart` / `sleepEnd`（休眠优化静止物体簇）。

### 7. 查询与其它能力

- **Query.ray**：射线检测，用于点击选中、子弹命中
- **Query.region**：矩形区域内有谁
- **Sleeping**：静止岛休眠，大堆刚体更省 CPU
- **插件**：`Matter.use` 扩展管线；生态含 [matter-tools](https://github.com/liabru/matter-tools) 调试器

## 实践案例

### 案例 1：最小可运行示例——两箱落地

与官方 [Getting started](https://github.com/liabru/matter-js/wiki/Getting-started) 同构，适合零基础验证环境：

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <title>Matter.js 最小示例</title>
  <script src="https://cdn.jsdelivr.net/npm/matter-js@0.20.0/build/matter.min.js"></script>
</head>
<body>
  <script>
    const { Engine, Render, Runner, Bodies, Composite } = Matter;

    const engine = Engine.create();
    const render = Render.create({
      element: document.body,
      engine,
      options: { width: 800, height: 600, wireframes: false }
    });

    const boxA = Bodies.rectangle(400, 200, 80, 80);
    const boxB = Bodies.rectangle(450, 50, 80, 80);
    const ground = Bodies.rectangle(400, 580, 810, 60, { isStatic: true });

    Composite.add(engine.world, [boxA, boxB, ground]);

    Render.run(render);
    Runner.run(Runner.create(), engine);
  </script>
</body>
</html>
```

**要点**：脚本放在 `</body>` 前，确保 DOM 已就绪；`isStatic: true` 的地面不会被撞飞；`Runner` 与 `Render` 各跑各的循环，演示够用，正式项目建议合并到统一 game loop。

### 案例 2：自定义循环 + 碰撞事件——弹弓发射计分

不用内置 `Render`，在 `requestAnimationFrame` 里步进物理并同步到 DOM；碰撞时打日志或播音效：

```javascript
import Matter from 'matter-js';

const { Engine, Bodies, Composite, Events, Body, Vector } = Matter;

const engine = Engine.create({ gravity: { x: 0, y: 1 } });
const world = engine.world;

const ground = Bodies.rectangle(400, 590, 800, 40, { isStatic: true });
const target = Bodies.rectangle(700, 520, 60, 60, {
  label: 'target',
  render: { fillStyle: '#e74c3c' }
});
const ball = Bodies.circle(120, 480, 20, {
  label: 'projectile',
  restitution: 0.4,
  density: 0.002
});

Composite.add(world, [ground, target, ball]);

Events.on(engine, 'collisionStart', (event) => {
  for (const pair of event.pairs) {
    const labels = [pair.bodyA.label, pair.bodyB.label];
    if (labels.includes('projectile') && labels.includes('target')) {
      console.log('命中目标！');
      Body.setStatic(target, true); // 简化：命中后定住
    }
  }
});

// 弹弓：拖拽松手时给球冲量
function launchBall(pointer) {
  const force = Vector.sub({ x: 120, y: 480 }, pointer);
  Body.applyForce(ball, ball.position, Vector.mult(force, 0.0008));
}

let last = performance.now();
function loop(now) {
  const delta = Math.min(now - last, 50); // 封顶，防后台标签页暴冲
  last = now;
  Engine.update(engine, delta);

  // 同步到 DOM 或 canvas：读 ball.position、ball.angle
  const el = document.getElementById('ball');
  if (el) {
    el.style.left = `${ball.position.x - 20}px`;
    el.style.top = `${ball.position.y - 20}px`;
    el.style.transform = `rotate(${ball.angle}rad)`;
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
```

**要点**：`Engine.update` 的 `delta` 单位是毫秒；冲量用 `Body.applyForce` 或 `Body.setVelocity`；用 `label` 区分角色比比较 `id` 更易读；`collisionStart` 只触发一次，持续接触用 `collisionActive`。

### 案例 3：约束摆锤（牛顿摆雏形）

```javascript
const anchor = Bodies.circle(400, 100, 5, { isStatic: true });
const bob = Bodies.circle(400, 300, 30);
const rod = Matter.Constraint.create({
  bodyA: anchor,
  bodyB: bob,
  length: 200,
  stiffness: 0.9
});

Composite.add(world, [anchor, bob, rod]);
// 给 bob 初速度后释放，摆锤按约束长度摆动
Body.setVelocity(bob, { x: 8, y: 0 });
```

## 安装与集成

**CDN（最快体验）**：

```html
<script src="https://cdn.jsdelivr.net/npm/matter-js@0.20.0/build/matter.min.js"></script>
```

**npm + 打包器**：

```bash
npm install matter-js
```

```javascript
import Matter from 'matter-js';
// 或按需：import { Engine, Bodies } from 'matter-js';
```

**与游戏框架**：Phaser 3 可用 `matter` 物理插件；PixiJS 只负责画，每帧读 `body.position` 更新 `sprite`；React 项目注意在 `useEffect` 里创建/销毁 engine，避免 Strict Mode 双挂载泄漏。

## 常见坑

1. **忘记把 body 加入 world**：只 `Bodies.rectangle` 不 `Composite.add`，物体永远不会参与仿真。
2. **静态体被推动**：地面若未设 `isStatic: true` 会被撞飞。
3. **delta 过大**：标签页切后台再切回，`performance.now()` 跳变会导致一帧穿透；对 `delta` 设上限（如 50 ms）或固定 16.67 ms 子步。
4. **凹多边形直接当刚体**：需 `Bodies.fromVertices` 或拆成多个凸 part；复杂 SVG 要检查 `removeCollinear` 等选项。
5. **每帧硬改动态体位置**：`Body.setPosition` 可用于传送，但频繁覆盖会与求解器冲突；运动学物体用 `isStatic` 或 `Body.setVelocity` 更合理。
6. **与 Box2D 教程混读**：API 名称相似（Body、World）但调用方式不同；Matter 没有 Fixture 概念，形状焊在 Body 上。
7. **Webpack 开发模式变慢**：官方 Wiki 提到部分 webpack 默认配置会影响热更新，见仓库 issue 中的 workaround。

## 学习路径

1. 打开官方 [Demo 页](https://brm.io/matter-js/demo)，点 Slingshot、Newton's Cradle、Bridge，对照 [Demo.js](https://github.com/liabru/matter-js/blob/master/examples/demo.js) 读实现
2. 手敲「地面 + 两箱」最小 HTML，确认箱子下落并碰撞
3. 去掉 `Render`，改用 `requestAnimationFrame` + `Engine.update`，把坐标画到自有 canvas
4. 加 `Events.on` 碰撞回调，做一个「击中目标得分」小交互
5. 读 [API 文档](https://brm.io/matter-js/docs/) 的 Engine、Body、Constraint、Query 四章
6. 若要做关卡编辑：试用 [matter-tools](https://github.com/liabru/matter-tools) 或导出 `engine.world` 的 JSON 状态

## 与其他方案对比

| 方案 | 维度 | 特点 |
|------|------|------|
| **Matter.js** | 2D JS | 原生 JS、内置渲染/Runner、API 扁平，Web 教育/原型首选 |
| **p2.js** | 2D JS | 更偏数值刚体，复合体强，需自绘 |
| **box2d.js / planck.js** | 2D JS | Box2D 移植，关节模型与 C++ 一致，包体较大 |
| **Box2D** | 2D C++ | 性能上限高，需绑定或非浏览器环境，见 [Box2D 笔记](./box2d.md) |
| **Phaser Arcade** | 2D 游戏 | AABB 简化物理，非刚体旋转，适合平台跳跃轻量场景 |

## 延伸阅读

- 官方仓库：<https://github.com/liabru/matter-js>
- API 文档（0.20.0）：<https://brm.io/matter-js/docs/>
- Getting started Wiki：<https://github.com/liabru/matter-js/wiki/Getting-started>
- 交互 Demo：<https://brm.io/matter-js/demo>
- 调试工具：<https://github.com/liabru/matter-tools>
- 作者 CodePen 示例：<https://codepen.io/collection/Fuagy/>
