---
title: Matter.js — 2D 刚体世界里最轻的“物理白板”
来源: 'https://github.com/liabru/matter-js'
日期: 2026-07-08
分类: 开源工具
难度: 中级
---

## 是什么

Matter.js 是一个**给网页前端加真实物理行为的轻量引擎**：刚体会下落、弹跳、碰撞、受约束、串联成复合结构。日常类比：你在桌上摆一堆磁铁和小木块，推一块后其它块也会晃；Matter.js 就是把这种规则数学化，放进画布里让浏览器每一帧自动算出结果。

大多数前端动画库给的是“位移插值”；Matter.js 不同，它要你写的是**状态更新方程**。你只定义 Bodies、Constraints、World，把 `Engine.update(world, delta)` 挂上 tick，就能得到受力后的坐标。它非常像你给物理老师下了一个题：现在有一颗球、三堵墙、一条弹簧绳子，请告诉我每 16ms 后它们的位置。

它的价值不在“写 3D”——更多在于做小游戏、可视化教学、交互练习场景时，把手工算位移的逻辑外包给成熟引擎。

## 为什么重要

不理解 Matter.js 的设计，以下现象会变成长期困惑：

- 你明明知道“速度 = 路程/时间”，却还是要先自己把碰撞法线算一遍
- 连续动画在慢设备上会抖动，却以为是渲染器问题
- 同一组参数在不同帧率下表现差异巨大
- 想做链条/绳索/轮子的场景总是到处修 bug

Matter.js 最核心的意义是：把“交互中的物理一致性”从“经验调参”变成“引擎保障”。

## 核心要点

1. **引擎与世界分层**：`Engine` 管理时间步，`World` 承载全部 body。你改参数，它做求解；你读结果，它可复现。

```js
import { Engine, Render, Runner, Bodies, World, Events } from 'matter-js';

const engine = Engine.create();
const world = engine.world;

World.add(world, [
  Bodies.rectangle(400, 600, 810, 60, { isStatic: true }),
  Bodies.circle(100, 100, 20),
]);

const runner = Runner.create();
Runner.run(runner, engine);
```

2. **刚体是有状态对象**：每个 body 有位移、速度、角速度、摩擦、恢复系数；你改这些数值就能调“真实感”。

3. **约束让世界可控**：`Constraint`/`MouseConstraint` 让对象不只是自由落体，而是能被链条、铰链、拖拽共同约束。

## 实践案例

### 案例 1：用摩擦与恢复系数做“吸附/反弹”节奏

```js
const floor = Bodies.rectangle(400, 610, 810, 60, { isStatic: true, friction: 0.01, restitution: 0.9 });
const ball = Bodies.circle(220, 40, 24, { restitution: 0.95, friction: 0.001 });
World.add(world, [floor, ball]);

Events.on(engine, 'afterUpdate', () => {
  // 每帧可读速度，用于 UI 音效联动
  const v = ball.speed;
  if (v > 15) hitSfx(v);
});
```

核心点：`restitution` 决定碰撞后反弹幅度，`friction` 决定滑移损耗，参数不对会出现“像漂移玩偶”。

### 案例 2：连杆摆模拟轨道输入

```js
const arm = Bodies.rectangle(300, 300, 260, 18);
const bob = Bodies.circle(410, 300, 22, { mass: 5 });
const spring = Constraint.create({
  bodyA: arm,
  bodyB: bob,
  length: 220,
  stiffness: 0.01,
  damping: 0.1,
});
World.add(world, [arm, bob, spring]);
```

同样的摆动，在高帧率下更平滑；关键是 `timeScale` 调整必须与 `Runner.tick` 匹配。

### 案例 3：可交互拖拽 + 鼠标约束

```js
import { Mouse, MouseConstraint, MouseConstraintOptions } from 'matter-js';
const mouse = Mouse.create(render.canvas);
const mouseConstraint = MouseConstraint.create(engine, {
  mouse,
  constraint: {
    stiffness: 0.2,
    render: { visible: false },
  },
} as MouseConstraintOptions);
World.add(world, mouseConstraint);
```

这让用户可以“直接抓起”物体，不需要写复杂 pointer collision；拖拽路径会实时回写到 body 位移。

## 踩过的坑

1. **时间步不一致**：默认 60fps 假设和你 requestAnimationFrame 不一致时，行为抖动；要固定 `engine.timing.timeScale` 与 `Runner.fps`。
2. **单位混乱**：Canvas 像素和物理尺寸混着用会让重力系数失真；建议建立统一单位（例如 1 单位=1px）。
3. **过度优化导致穿透**：提高速度上限会产生 tunneling，尤其高速小球；需要合适的子步或改碰撞分辨策略。
4. **事件监听泄漏**：每次重建关卡都忘记销毁 `afterUpdate` 监听，运行十分钟内存会慢涨。

## 适用 vs 不适用场景

**适用**：
- 教育演示、物理小游戏、数据可视化中的约束运动
- 需要“碰撞 + 力学”而非 3D 的产品原型
- 需要可解释参数（摩擦、密度、重力）便于手调

**不适用**：
- 高精度工程仿真（建议专门物理库）
- 大规模 3D/复杂刚体堆栈（性能和 API 重心不匹配）
- 需要严格 deterministic 的科研级仿真

## 历史小故事（可跳过）

- **2011**：Matter.js 从轻量引擎思路起步，主打网页可玩性和可扩展 API。
- **2014**：加入更多碰撞和约束案例，社区用来做教学小游戏与 demo。
- **2017**：与 Phaser 等框架结合，成为前端物理的低门槛入口。
- **2019**：文档与演示页体系化，`examples` 成为新手最重要入门素材。
- **2021 以后**：社区分支与 plugin 生态把传感器、约束、复合体推向稳定应用。

## 学到什么

- 物理引擎不是“替你写动画”，而是把可复现的受力世界模型外包出去。
- 约束系统决定复用性：你后续加玩法很可能只是改约束参数。
- 时间步与渲染分离是关键；先确保物理稳定再追求画面花哨。
- 真实感可以先做出来，再逐步压缩参数到你想要的体验。

## 延伸阅读

- 官方网站和文档：[matter-js.com](https://brm.io/matter-js/)
- 官方演示页（按示例理解模块化设计）
- Matter.js 官方 Wiki（issue / plugin / FAQ）
- 约束系统原理：`Constraints` 小节
- [[box2d]] —— 2D 物理路线的经典对照

## 关联

- [[phaser]] —— 2D 游戏框架，常与 Matter.js 联动
- [[box2d]] —— 另一套 2D 物理思路
- [[rapier]] —— Rust/游戏物理可借鉴的设计语言
- [[collision]] —— 浏览器碰撞优化实践
- [[vite]] —— 前端交互项目常见运行时链路

## 反向链接

- [[physics]] —— 物理引擎的基础建模
- [[gamedev]] —— 入门级互动系统工程方法
