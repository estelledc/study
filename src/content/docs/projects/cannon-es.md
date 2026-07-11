---
title: Cannon-es — 把浏览器里的“重力+碰撞”变成可复用规则
来源: 'https://github.com/pmndrs/cannon-es'
日期: 2026-07-08
分类: 开源工具
难度: 中级
---

## 是什么

Cannon-es 是一个纯 JavaScript 的 3D 物理引擎，偏向浏览器、WebGL 场景和前端交互。你可以把它理解成“游戏里替你做力学算术的后台核算器”。

日常类比：你在桌面拼图，如果每块拼图都按碰撞、重力、摩擦自然落下，手工算一遍会很累；Cannon-es 就是那台帮你自动算“碰到谁、反弹多少、滑多少”的小机器。

它的价值不在“画出世界”，而在于把“世界里对象怎么运动”从 JS 业务逻辑里剥离出来，让你把精力放到游戏规则和交互。

## 为什么重要

不了解 Cannon-es 时，前端工程里物理问题常常会被误解为“只是写几个常量”：

- 为什么角色会穿模？因为没固定步进、或碰撞体与可视 Mesh 不匹配。
- 为什么同样场景在高帧和低帧下行为不一致？因为时间步和积分方式没对齐。
- 为什么一个参数调得很“看起来对”，另一台设备又崩？因为 damping、restitution、shape 半径和单位体系没统一。
- 为什么项目后期 bug 多在“物理同步”？因为渲染层和物理层更新节奏不一致。

Cannon-es 正是在这个层面提供标准化答案：世界、刚体、形状、材质、约束、步进。

## 核心要点

1. **世界(World)是统一时钟**：`World` 负责步进、重力、solver 迭代。你每帧调用 `world.step(dt)`，它负责统一推进。

2. **Body 与 Shape 解耦**：刚体（`Body`）定义质量、速度、阻尼等状态；形状（`Sphere`、`Box`、`Cylinder`）定义“几何边界”。

3. **材质 & 接触约束**：两个 body 接触时，材质上的摩擦/弹性决定“滑不滑、跳不跳”。通过 `ContactMaterial` 能做系统化的物理体验统一。

4. **事件驱动调试**：`addEventListener('collide')` 这种碰撞回调是“行为触发点”，可用于音效、粒子、得分与连锁反应。

5. **可升级的性能策略**：低端设备下减少迭代步数、加大固定步长、降低碰撞体复杂度，往往比追求“最真实”更重要。

## 实践案例

### 案例 1：基础落体场景

```js
import * as CANNON from 'cannon-es'

const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) })
const ground = new CANNON.Body({
  mass: 0,
  shape: new CANNON.Box(new CANNON.Vec3(5, 0.5, 5)),
  position: new CANNON.Vec3(0, -1, 0),
})
world.addBody(ground)

const ball = new CANNON.Body({
  mass: 1,
  shape: new CANNON.Sphere(0.5),
  position: new CANNON.Vec3(0, 10, 0),
})
world.addBody(ball)

world.step(1 / 60)
console.log('ball y', ball.position.y)
```

这段代码把“重力世界 + 地面 + 小球”搭好。关键不是行数，而是你学会了思维分离：渲染只是把 ball.position 画出来。

### 案例 2：摩擦和反弹控制触感

```js
const mat1 = new CANNON.Material('glass')
const mat2 = new CANNON.Material('rubber')
world.addContactMaterial(new CANNON.ContactMaterial(mat1, mat2, {
  friction: 0.05,
  restitution: 0.85,
}))

const floor = new CANNON.Body({
  mass: 0,
  material: mat1,
  shape: new CANNON.Plane(),
})
floor.quaternion.setFromEuler(-Math.PI / 2, 0, 0)
world.addBody(floor)
```

- 反弹（restitution）高低影响掉落后回弹幅度。
- 摩擦低一点适合光滑表面；高一点适合“抓地感”游戏。
- 视觉上很容易把 0.4 和 0.8 的差别看错，建议每个参数都做回归测试。

### 案例 3：两个球做弹簧约束

```js
const a = new CANNON.Body({
  mass: 1,
  position: new CANNON.Vec3(0, 4, 0),
  shape: new CANNON.Sphere(0.5),
})
const b = new CANNON.Body({
  mass: 1,
  position: new CANNON.Vec3(2, 4, 0),
  shape: new CANNON.Sphere(0.5),
})
world.addBody(a)
world.addBody(b)

const spring = new CANNON.Spring(a, b, {
  restLength: 2,
  stiffness: 50,
  damping: 1,
  localAnchorA: new CANNON.Vec3(0, 0, 0),
  localAnchorB: new CANNON.Vec3(0, 0, 0),
})

world.addEventListener('postStep', () => {
  spring.applyForce()
})
```

弹簧约束可表达绳索、摆、牵引等交互。类比上：两个挂篮之间用弹簧绳一连，系统自动处理拉扯。

## 踩过的坑

1. **时间步没有固定**：帧率抖动时会抖出穿透。先固定 step 并用 accumulator 累积，不要随便 `delta` 放大。 
2. **Shape 和模型尺寸不一致**：视觉模型半径 1，碰撞球半径 0.9，用户永远会遇到“明明没碰到却碰到了”。
3. **渲染层与物理层直接耦合**：在同一帧重复拉取大量 body 状态会卡；渲染只读快照即可。
4. **约束参数误调**：`stiffness` / `damping` 一起调很容易引入爆炸能量，建议先慢步进观察再加。

## 适用 vs 不适用场景

**适用**：
- 需要 3D 物理、但不想维护 C++/Rust 物理内核的前端项目。
- 快速原型、可视化、教育场景中对准确到亚毫米级不要求。
- Three.js / React Three Fiber 场景中需要统一的刚体行为。

**不适用**：
- AAA 级高保真物理（竞技竞速、精细破坏）
- 纯服务端物理计算（缺少无头仿真分发能力）
- 超大规模刚体数 > 2000 且要跨千人在线实时同步

## 历史小故事（可跳过）

- **早期**：许多 JS 项目在同类问题上用手写 ODE，维护成本很高。
- **fork 时代**：Cannon 的 fork 社区把 TypeScript 与更清晰 API 放在前端生态更容易接入。
- **PMNDRS 演进**：cannon-es 作为更轻量的社区版本，和 react-three 系列工具链接得较紧。
- **现在**：前端项目越来越多地把物理从图形层抽离成独立系统，cannon-es 常作为中间方案。

## 学到什么

1. 物理问题本质是状态同步，不是“算得越复杂越准”。
2. 世界 step 与渲染帧解耦，让体验更稳定。
3. shape 参数和材质参数是产品体验的“质感预算”。
4. 遇到跨设备抖动，先看时间步、质量单位、约束参数，再看模型。

## 延伸阅读

- 官方仓库：[pmndrs/cannon-es](https://github.com/pmndrs/cannon-es)
- 示例项目：官方示例中有约束、材质、碰撞的组合参考
- 与三维引擎结合：`@react-three/cannon` 的生态接入路径
- 性能建议：减少复杂形状与频繁销毁创建
- [[cannon]] —— 经典旧版 cannon 的对照

## 关联

- [[three-js]] —— 你先有渲染，再把物理交给 cannon-es
- [[matter-js]] —— 2D 物理与 3D 物理的解题方式对照
- [[rapier]] —— Rust 生态的另一种高性能方案
- [[ammo-js]] —— 复杂物理与大规模场景的另一个方向
- [[ode]] —— 老牌物理库思想血统

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[aframe]] —— A-Frame — 用 HTML 搭 Web VR 场景
- [[planck]] —— planck.js — 纯 JS Box2D 生态
