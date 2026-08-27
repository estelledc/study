---
title: Cannon-es — 把浏览器里的“重力+碰撞”变成可复用规则
来源: https://github.com/pmndrs/cannon-es
日期: 2026-07-08
分类: 开源工具
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/pmndrs/cannon-es
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 8b147715d5f7ec69da2211611daa236d80e88933
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 0.20.0
---

## 是什么

cannon-es 是 pmndrs 维护的 **cannon.js TypeScript fork**：一份扁平 ESM/CJS bundle，把 3D 刚体步进从渲染循环里拆出来。日常类比：Three.js 负责把椅子画出来，cannon-es 负责算椅子什么时候碰到地板、会不会再弹起来。

```js
import { World, Body, Sphere, Vec3 } from 'cannon-es'

const world = new World({ gravity: new Vec3(0, -9.82, 0) })
const ball = new Body({ mass: 1, shape: new Sphere(0.5), position: new Vec3(0, 10, 0) })
world.addBody(ball)
world.step(1 / 60)
```

固定 `0.20.0` 的 `package.json` 写 `sideEffects: false`，零运行时依赖。npm `homepage` 仍指向原版 `schteppe/cannon.js`；canonical 仓库是 `pmndrs/cannon-es`。

## 为什么重要

不按 0.20.0 源码读，下面这些前端物理问题会对不上：

- 为什么只写 `world.step(1/60)` 时没有内置插值，而三参数 `step` 才会累加 accumulator
- 为什么 `new Body({})` 默认是静态的（`mass` 默认 0）
- 为什么 `new Material('glass')` 几乎不改触感
- 为什么 `Spring` 加了世界却不动——它根本不是 `Constraint`

## 核心要点

固定 0.20.0 的主链：

1. **世界默认不休眠**：`World.allowSleep` 默认 false，`broadphase` 默认 `NaiveBroadphase`，`solver` 默认 `GSSolver`（`iterations=10`，`tolerance=1e-7`）。刚体自己的 `allowSleep` 默认 true，但世界开关关上时仿真不会睡。

2. **两种步进**：`step(dt)` 只跑一次 `internalStep`。`step(dt, timeSinceLastCalled, maxSubSteps=10)` 才把墙钟塞进 `accumulator`，子步用尽或单次调用墙钟超过 `dt` 秒就 bail，然后 `accumulator %= dt`，再 lerp/slerp 到 `interpolatedPosition` / `interpolatedQuaternion`。`fixedStep()` 用 `performance.now()` 填第二参。

3. **质量决定类型**：`mass <= 0` → `STATIC`，`mass > 0` → `DYNAMIC`；也可显式 `type: Body.KINEMATIC`。`isTrigger` 默认 false：仍派发 `collide`，不改力。

4. **材质对才是触感**：`ContactMaterial` 默认 friction/restitution 都是 0.3。`Material` 的摩擦/弹性默认 `-1`，表示“用 ContactMaterial / `defaultContactMaterial`”。字符串构造只填已弃用的 `name`。

5. **弹簧要自己加力**：`Spring` 不进 `world.constraints`。必须在 `postStep` 里 `applyForce()`，公式是 `F = -k*(x-L) - D*u`。默认 `restLength=1`、`stiffness=100`、`damping=1`。

## 实践示例

### 案例 1：地面 + 落球

```js
import { World, Body, Box, Sphere, Vec3 } from 'cannon-es'

const world = new World({ gravity: new Vec3(0, -9.82, 0) })
world.addBody(new Body({
  mass: 0,
  shape: new Box(new Vec3(5, 0.5, 5)),
  position: new Vec3(0, -1, 0),
}))
const ball = new Body({
  mass: 1,
  shape: new Sphere(0.5),
  position: new Vec3(0, 10, 0),
})
world.addBody(ball)
world.step(1 / 60)
```

`mass: 0` 与省略 `mass` 一样是静态。渲染应读 `position`（无插值模式）或 `interpolatedPosition`（三参数步进）。

### 案例 2：成对材质，而不是名字

```js
import { Material, ContactMaterial, Plane, Quaternion } from 'cannon-es'

const glass = new Material({ friction: 0.05, restitution: 0.85 })
const rubber = new Material({ friction: 0.8, restitution: 0.4 })
world.addContactMaterial(new ContactMaterial(glass, rubber, {
  friction: 0.05,
  restitution: 0.85,
}))
const floor = new Body({ mass: 0, material: glass, shape: new Plane() })
floor.quaternion.setFromEuler(-Math.PI / 2, 0, 0)
world.addBody(floor)
```

`new Material('glass')` 不会把摩擦变成玻璃。`Plane` 默认朝 +Z，地面要绕 X 转 `-π/2`。

### 案例 3：弹簧不是约束

```js
import { Spring } from 'cannon-es'

const spring = new Spring(a, b, { restLength: 2, stiffness: 50, damping: 1 })
world.addEventListener('postStep', () => { spring.applyForce() })
```

`addConstraint` 收的是 `DistanceConstraint` / `HingeConstraint` 等。漏掉 `postStep`，弹簧系数为 0。

## 踩过的坑

1. **以为 `step(1/60)` 已经固定帧率**：那是无插值单步。要对墙钟追赶，得传 `timeSinceLastCalled` 或用 `fixedStep()`。
2. **`new Body({ shape })` 却想让它掉**：默认 `mass=0` → static。
3. **材质只写了字符串名字**：`Material('glass')` 的 friction/restitution 仍是 `-1`。
4. **把 `Spring` 当 `Constraint`**：不会进 solver，必须 `applyForce`。
5. **世界没开 `allowSleep` 却怪刚体不睡**：世界默认 false。
6. **把未测的“两千刚体 / AAA 手感”写成事实**：固定源码没有这种保证。

## 适用 vs 不适用场景

**适用**：

- 浏览器 / WebGL 场景需要 3D 刚体、车辆（`RaycastVehicle` / `RigidVehicle`）或触发器
- 能接受默认 naive broadphase，并自己换 SAP / Grid
- 和 `@react-three/cannon` / `use-cannon` 对接时，先认这份 0.20.0 合同

**不适用**：

- 需要 3.x Box2D 那种 C 内核与子步求解器
- 零重力还想靠默认摩擦——应设 `world.frictionGravity`
- 要把未发布的 `master` 文档构建提交当成 0.20.0
- 用未绑定的刚体数量或帧耗时做选型

## 固定版本边界

- 本文绑定 `pmndrs/cannon-es@8b147715d5f7ec69da2211611daa236d80e88933`，annotated tag `v0.20.0` 解引用到此提交。
- npm `cannon-es@0.20.0` latest，无 `gitHead`。`master` 在 2024-01-06 另有 `dd971c4a...`（`chore: build docs`）；未绑定。
- 未安装依赖、未跑 Jest、未接 Three.js，状态保持 `UNVERIFIED`。

## 学到什么

1. **步进 API 的第二参才打开 accumulator**——单参 `step` 不会替你追帧。
2. **质量默认值就是类型默认值**——0 是静态。
3. **触感在 ContactMaterial，不在名字字符串**。
4. **Spring 是力发生器，Constraint 才进 solver**。

## 应用型自测

1. `new Body({ shape: new Sphere(0.5) })` 会在默认重力下落吗？
2. `world.step(1/60)` 会更新 `interpolatedPosition` 吗？
3. `new Spring(a, b)` 之后只 `world.addBody`，弹簧会拉吗？

检查点：

1. 不会。默认 `mass=0`，类型是 `STATIC`。
2. 不会。无第二参时只跑一次 `internalStep`，不做 lerp。
3. 不会。必须在 `postStep` 里 `applyForce()`。

## 延伸阅读

- 文档：[pmndrs.github.io/cannon-es/docs](https://pmndrs.github.io/cannon-es/docs/)
- 固定源码：[pmndrs/cannon-es](https://github.com/pmndrs/cannon-es) —— 本文绑定提交 `8b147715d5f7ec69da2211611daa236d80e88933`
- 原版对照：[schteppe/cannon.js](https://github.com/schteppe/cannon.js)
- React 封装：[pmndrs/use-cannon](https://github.com/pmndrs/use-cannon)（以该仓固定 revision 为准）
- [[box2d]] —— C17 2D 子步求解器对照
- [[cannon]] —— 未 fork 的旧 cannon.js 页

## 关联

- [[box2d]] —— 2D C 内核 vs 3D JS 世界
- [[three-js]] —— 常见渲染层
- [[matter-js]] —— 2D JS 物理
- [[rapier]] —— 另一条可编译到 WASM 的路线
- [[ammo-js]] —— Bullet 绑定方向

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[aframe]] —— A-Frame — 用 HTML 搭 Web VR 场景
- [[planck]] —— planck.js — 纯 JS Box2D 生态
