---
title: Matter.js — 2D 刚体世界里最轻的“物理白板”
来源: 'https://github.com/liabru/matter-js'
日期: 2026-07-08
分类: 开源工具
难度: 中级
---

## 是什么

Matter.js 是一个**给网页前端加真实物理行为的轻量引擎**：刚体会下落、弹跳、碰撞、受约束、串联成复合结构。日常类比：你在桌上摆一堆磁铁和小木块，推一块后其它块也会晃；Matter.js 就是把这种规则数学化，放进画布里让浏览器每一帧自动算出结果。

大多数前端动画库给的是“位移插值”（你规定从 A 滑到 B）；Matter.js 不同——你**只声明**有哪些物体（Bodies）、约束（Constraints）和世界（World），再让引擎按固定时间步推进。它像给物理老师出题：一颗球、三堵墙、一条弹簧，请告诉我每 16ms 后它们在哪。

它的价值不在“写 3D”——更多在于做小游戏、可视化教学、交互练习时，把手工算位移的逻辑外包给成熟引擎。

## 为什么重要

不理解 Matter.js 的设计，以下现象会变成长期困惑：

- 你明明知道“速度 = 路程/时间”，却还是要先自己把碰撞法线算一遍
- 连续动画在慢设备上会抖动，却以为是渲染器问题
- 同一组参数在不同帧率下表现差异巨大
- 想做链条/绳索/轮子的场景总是到处修 bug

Matter.js 最核心的意义是：把“交互中的物理一致性”从“经验调参”变成“引擎保障”。

## 核心要点

1. **引擎与世界分层**：`Engine` 管时间步与求解，`world` 装着全部 body。你改参数，它做碰撞与约束求解；你读 `body.position` 拿结果。

```js
import Matter from 'matter-js';
const { Engine, Render, Runner, Bodies, Composite } = Matter;

const engine = Engine.create();
const render = Render.create({
  element: document.body,
  engine,
  options: { width: 800, height: 600, wireframes: false },
});
Composite.add(engine.world, [
  Bodies.rectangle(400, 590, 810, 20, { isStatic: true }), // 地面
  Bodies.circle(400, 100, 20),
]);
Render.run(render);
Runner.run(Runner.create(), engine);
```

2. **刚体是有状态对象**：每个 body 有位置、速度、角速度、摩擦、恢复系数（`restitution`）；调这些数就能改“弹不弹、滑不滑”。

3. **约束让世界可控**：`Constraint` / `MouseConstraint` 把物体连成链条、铰链，或让鼠标拖拽——不只是自由落体。

## 实践案例

### 案例 1：摩擦与恢复系数——先看球怎么弹

```js
const floor = Bodies.rectangle(400, 590, 810, 20, {
  isStatic: true, friction: 0.8, restitution: 0.2,
});
const ball = Bodies.circle(220, 40, 24, { restitution: 0.9, friction: 0.01 });
Composite.add(engine.world, [floor, ball]);

Matter.Events.on(engine, 'afterUpdate', () => {
  if (ball.speed > 15) console.log('重击', ball.speed.toFixed(1));
});
```

步骤：① 建静态地面与圆球；② `restitution` 接近 1 更弹、接近 0 更“闷”；③ `friction` 大则落地后少滑；④ 在 `afterUpdate` 读 `ball.speed` 做音效/UI。参数反了会出现“像漂移玩偶”。

### 案例 2：弹簧约束——摆锤跟读

```js
const pivot = Bodies.circle(300, 120, 8, { isStatic: true });
const bob = Bodies.circle(300, 320, 22, { mass: 5 });
const spring = Matter.Constraint.create({
  bodyA: pivot, bodyB: bob, length: 200, stiffness: 0.05, damping: 0.05,
});
Composite.add(engine.world, [pivot, bob, spring]);
// 给 bob 一个初速度，就能看到摆动
Matter.Body.setVelocity(bob, { x: 8, y: 0 });
```

步骤：① 固定支点 + 质量块；② `Constraint` 的 `length`/`stiffness`/`damping` 决定绳长与软硬；③ 用 `Body.setVelocity` 推一把观察周期。物理步长由 `Runner` 固定推进；不要用“渲染帧率”直接当物理 `dt`，否则慢设备上摆动会变慢或抖。

### 案例 3：鼠标拖拽——最小可玩闭环

```js
const mouse = Matter.Mouse.create(render.canvas);
const mouseConstraint = Matter.MouseConstraint.create(engine, {
  mouse,
  constraint: { stiffness: 0.2, render: { visible: false } },
});
Composite.add(engine.world, mouseConstraint);
render.mouse = mouse; // 让滚轮/坐标与画布对齐
```

步骤：① 先有 `Render.create` 拿到 `canvas`；② `Mouse.create` 绑画布；③ `MouseConstraint.create` 挂进 world；④ 页面上即可拖物体。无需手写 pointer 碰撞。

## 踩过的坑

1. **时间步与渲染绑死**：用 `requestAnimationFrame` 的真实间隔当物理 `dt` 会抖；优先 `Runner` 固定步，或自己固定 `delta`（如 1000/60）。
2. **单位混乱**：Canvas 像素和“米”混用会让重力失真；入门可统一 1 单位=1px，再调 `engine.gravity.scale`。
3. **高速穿透（tunneling）**：小球速度过大一步跨过薄墙；降速、加厚静态体，或提高引擎迭代/子步。
4. **事件监听泄漏**：每次重建关卡都 `Events.on` 却不 `off`，跑久了回调堆叠、内存慢涨。

## 适用 vs 不适用场景

**适用**：
- 教育演示、2D 小游戏、可视化里的约束运动（大约几十到几百个 body）
- 需要“碰撞 + 力学”而非 3D 的产品原型
- 需要可解释参数（摩擦、密度、重力）便于手调

**不适用**：
- 上千密集堆叠、要严格确定性回放——换 Box2D / Rapier 更稳
- 高精度工程/科研仿真（连续碰撞、单位制、可复现性要求更高）
- 大规模 3D 刚体世界（API 与性能重心都不在这）

## 历史小故事（可跳过）

- **作者**：Liam Brummitt（GitHub `liabru`）把 Matter.js 做成浏览器可直接跑的 2D 刚体库，文档站在 [brm.io/matter-js](https://brm.io/matter-js/)。
- **定位**：相对 Box2D 的 C++/asm 路线，Matter.js 主打纯 JS、API 浅、examples 多，适合教学与原型。
- **生态**：Phaser 等 2D 框架可接 Matter 物理；官方 `examples` 仍是最快的入门路径。
- **API 演进**：老教程常见 `World.add`；现行推荐 `Composite.add(engine.world, …)`，语义是“往复合体里加孩子”。

## 学到什么

- 物理引擎不是“替你写动画”，而是外包一个可复现的受力世界模型。
- 约束系统决定复用性：加玩法往往只是改约束参数。
- 时间步与渲染分离是关键；先稳定物理再追求画面。
- 真实感可以先做出来，再把参数压到想要的手感。

## 延伸阅读

- 官方文档与演示：[Matter.js](https://brm.io/matter-js/)
- 仓库与 issue：[liabru/matter-js](https://github.com/liabru/matter-js)
- 官方 `examples`（按模块看 Bodies / Constraints / Mouse）
- [[box2d]] —— 2D 物理路线的经典对照
- [[phaser]] —— 常与 Matter 联动的 2D 游戏框架

## 关联

- [[phaser]] —— 2D 游戏框架，常与 Matter.js 联动
- [[box2d]] —— 另一套 2D 物理思路
- [[rapier]] —— Rust 物理引擎，适合要性能/确定性时对照
- [[collision]] —— 浏览器碰撞优化实践
- [[vite]] —— 前端交互项目常见运行时链路

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[box2d]] —— Box2D — Erin Catto C++ 2D 物理
- [[cannon-es]] —— Cannon-es — 把浏览器里的“重力+碰撞”变成可复用规则
- [[phaser]] —— Phaser — HTML5 2D 游戏框架
- [[planck]] —— planck.js — 纯 JS Box2D 生态
- [[rapier]] —— Rapier — Rust 现代 2D/3D 物理引擎
