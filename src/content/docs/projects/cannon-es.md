---
title: cannon-es — pmndrs 维护的 cannon.js 续作
来源: 'https://github.com/pmndrs/cannon-es'
日期: 2026-06-13
分类: 图形学
子分类: 渲染与图形
provenance: pipeline-v3
难度: 初级
---

## 是什么

**cannon-es** 是 [pmndrs](https://github.com/pmndrs) 社区维护的**开源 JavaScript 3D 刚体物理引擎**，MIT 协议，GitHub 仓库 [pmndrs/cannon-es](https://github.com/pmndrs/cannon-es) 约 2k star。它是 Stefan Hedman 原版 [cannon.js](https://github.com/schteppe/cannon.js) 的**现代化续作**：TypeScript 重写、ESM/CJS 双格式 flat bundle、支持 tree shaking，API 与 three.js 生态高度契合。

日常类比：把 cannon-es 想成**三维弹珠台的后台裁判**。你在 WebGL 场景里摆好球（Sphere）、箱子（Box）、地面（Plane），裁判按 SI 单位（米、千克、秒）每帧推进牛顿力学，并把「球现在在哪儿、朝哪转」写进 `Body.position` 与 `Body.quaternion`。你负责用 Three.js、Babylon.js 或 React Three Fiber 把 mesh 画出来；cannon-es **不负责渲染**，只算数学。

与 C++ 的 Bullet 或 WASM 的 ammo.js 相比，cannon-es 的定位是**纯 JS、零编译、包体小**：适合浏览器里的交互 3D、教育 demo、原型和 `@react-three/cannon` 等上层封装。设计灵感来自 three.js 的简洁 API，算法 lineage 可追溯到 Bullet / ammo.js，但用法更像「在 JS 里直接 new 一个 World」。

```js
import * as CANNON from 'cannon-es'

const world = new CANNON.World({
  gravity: new CANNON.Vec3(0, -9.82, 0), // m/s²，接近地球重力
})

const radius = 1
const sphereBody = new CANNON.Body({
  mass: 5,
  shape: new CANNON.Sphere(radius),
})
sphereBody.position.set(0, 10, 0)
world.addBody(sphereBody)

const groundBody = new CANNON.Body({
  type: CANNON.Body.STATIC,
  shape: new CANNON.Plane(),
})
groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0)
world.addBody(groundBody)

function animate() {
  requestAnimationFrame(animate)
  world.fixedStep()
  console.log(`y = ${sphereBody.position.y.toFixed(2)}`)
}
animate()
```

上面是官方 [getting-started](https://github.com/pmndrs/cannon-es/blob/master/getting-started.md) 的最小闭环：建 `World` → 加动态球与静态地面 → 每帧 `fixedStep()`。

## 为什么重要

不了解 cannon-es，下面这些事都难以解释：

- 为什么 three.js 教程里常见 `cannon-es` 或 `@react-three/cannon`——它是 Web 3D 里**默认的轻量物理后端**之一
- 为什么原 cannon.js 停更后 pmndrs 要 fork——旧库无 ESM、无类型、与 modern bundler 不兼容；cannon-es 补上了 **tree shaking 与 TS 类型**
- 为什么物理坐标要用**米**而不是把 Three.js 里「1 单位 = 1 像素」——引擎按 MKS 调参，把角色设成 180「米」高会导致堆叠不稳、穿透或数值爆炸
- 为什么 `fixedStep()` 与 `requestAnimationFrame` 帧率要分离——固定 1/60 s 子步避免大 dt 导致高速物体**隧道穿透**（tunneling）
- 为什么 `applyForce` / `applyImpulse` 在 cannon-es 里相对**物体质心**——这是相对原版 cannon.js 的 breaking change，写玩法逻辑时必须读文档

## 核心要点

### 1. 物理世界（World）

`CANNON.World` 是一帧 3D 仿真的总容器，持有所有 `Body`、约束与接触。常用配置：

| 属性 | 含义 |
|------|------|
| `gravity` | 全局重力向量，默认 `(0, -9.82, 0)` |
| `frictionGravity` | 可选；零重力场景下仍要摩擦时可单独设 |
| `hasActiveBodies` | 是否还有未休眠的刚体；全休眠时可跳过渲染/物理以省电 |

推进仿真的两种方式：

- **`world.fixedStep(timeStep?)`**：推荐。内部记录上次调用时间，自动按固定步长（默认 1/60 s）推进，**与显示器帧率解耦**
- **`world.step(timeStep, dt?, maxSubSteps?)`**：手动传入距上一帧的 `dt`，适合自定义时间轴或与服务器 tick 对齐

类比：`fixedStep` 像节拍器——无论动画卡不卡，物理始终按 60 Hz 走；`step` 像指挥家自己数拍子。

### 2. 刚体（Body）与形状（Shape）

| 类型 | 条件 | 行为 |
|------|------|------|
| **Dynamic** | `mass > 0` | 受力、碰撞、积分 |
| **Static** | `mass === 0` 或 `type: Body.STATIC` | 固定不动，作地面/墙 |
| **Kinematic** | `type: Body.KINEMATIC` | 不受力，但可设 `velocity` 推动其它物体 |

常见 **Shape**：

| Shape | 用途 |
|-------|------|
| `Sphere` | 球体 |
| `Box` | 轴对齐半Extents 盒子，`new Box(new Vec3(hx, hy, hz))` |
| `Plane` | 无限平面，需用四元数旋转成「地面」 |
| `Cylinder` | 圆柱 |
| `ConvexPolyhedron` | 凸多面体 |
| `Trimesh` | 三角网格（静态碰撞，部分配对未实现） |
| `Heightfield` | 高度图地形 |

一个 Body 可挂多个 Shape（复合碰撞体）。材质相关常用字段：`material`（摩擦/弹性）、`linearDamping`、`angularDamping`、`allowSleep`（休眠优化静止簇）。

### 3. 材质与接触（Material / Contact）

`CANNON.Material` 定义 `friction`（摩擦）与 `restitution`（恢复系数，0 = 不弹，1 = 完全弹性）。两材质相遇时可用 `CANNON.ContactMaterial` 覆盖默认组合行为，并 `world.addContactMaterial(...)` 注册。

事件：`world.addEventListener('postStep', ...)` 或 body 级 `collide` 回调可响应碰撞，用于播放音效、计分、销毁物体。

### 4. 约束（Constraint）

`PointToPointConstraint`、`HingeConstraint`、`LockConstraint` 等把两个 Body 用关节连接，适合门铰、摆锤、布偶 ragdoll 简化版。用法模式：`new HingeConstraint(bodyA, bodyB, { pivotA, axisA, ... })` → `world.addConstraint(constraint)`。

### 5. 与渲染器同步（Three.js 模式）

cannon-es **不画任何东西**。标准模式：

1. 为每个 `Body` 建对应 `THREE.Mesh`
2. 每帧 `world.fixedStep()` 之后 `mesh.position.copy(body.position)`、`mesh.quaternion.copy(body.quaternion)`
3. 再 `renderer.render(scene, camera)`

上层封装 [@react-three/cannon](https://github.com/pmndrs/use-cannon)（包名 use-cannon）用 React hooks 自动完成 body ↔ mesh 绑定，但底层仍是 cannon-es。

### 6. cannon-es 相对 cannon.js 的改进

- **ESM + TypeScript**：`import { World, Body, Sphere } from 'cannon-es'` 可 tree shake
- **`World.hasActiveBodies`**：静止场景跳过更新
- **`World.frictionGravity`**：零重力仍可有摩擦
- **力/冲量参考系修正**：`applyForce` / `applyImpulse` 相对 body 质心
- 持续维护，与 pmndrs / R3F 生态对齐

## 实践案例

### 案例一：最小落球（纯 cannon-es）

```js
import * as CANNON from 'cannon-es'

const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) })

const ball = new CANNON.Body({
  mass: 1,
  shape: new CANNON.Sphere(0.5),
})
ball.position.set(0, 5, 0)
world.addBody(ball)

const floor = new CANNON.Body({
  type: CANNON.Body.STATIC,
  shape: new CANNON.Plane(),
})
floor.quaternion.setFromEuler(-Math.PI / 2, 0, 0)
world.addBody(floor)

for (let i = 0; i < 120; i++) {
  world.fixedStep(1 / 60)
}
// 约 2 s 后 ball.position.y 接近 0.5（球半径），贴地静止
```

### 案例二：Three.js 同步 + 盒子堆叠

```js
import * as THREE from 'three'
import * as CANNON from 'cannon-es'

const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100)
camera.position.set(0, 5, 10)
const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setSize(innerWidth, innerHeight)
document.body.appendChild(renderer.domElement)

const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) })
world.defaultContactMaterial.friction = 0.4
world.defaultContactMaterial.restitution = 0.2

// 地面：物理 Plane + 视觉 Box
const groundBody = new CANNON.Body({
  type: CANNON.Body.STATIC,
  shape: new CANNON.Plane(),
})
groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0)
world.addBody(groundBody)

const groundMesh = new THREE.Mesh(
  new THREE.BoxGeometry(20, 0.2, 20),
  new THREE.MeshStandardMaterial({ color: 0x444444 })
)
groundMesh.position.y = -0.1
scene.add(groundMesh)

// 三个叠放的动态盒子
const boxes = []
const size = 1
for (let i = 0; i < 3; i++) {
  const body = new CANNON.Body({
    mass: 1,
    shape: new CANNON.Box(new CANNON.Vec3(size / 2, size / 2, size / 2)),
  })
  body.position.set(0, size / 2 + i * size + 0.01, 0)
  world.addBody(body)

  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(size, size, size),
    new THREE.MeshStandardMaterial({ color: 0x4488ff })
  )
  scene.add(mesh)
  boxes.push({ body, mesh })
}

const light = new THREE.DirectionalLight(0xffffff, 1)
light.position.set(5, 10, 5)
scene.add(light, new THREE.AmbientLight(0x404040))

function animate() {
  requestAnimationFrame(animate)
  world.fixedStep()

  for (const { body, mesh } of boxes) {
    mesh.position.copy(body.position)
    mesh.quaternion.copy(body.quaternion)
  }

  renderer.render(scene, camera)
}
animate()
```

要点：视觉地面用薄 Box 即可，物理仍用无限 `Plane`；堆叠时给微小 y 间隙（`+ 0.01`）减少初始穿透。每帧**先** `fixedStep()` **再** copy 位姿。

### 案例三：施加冲量（第一人称「推箱子」）

```js
import * as CANNON from 'cannon-es'

const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) })
const crate = new CANNON.Body({
  mass: 10,
  shape: new CANNON.Box(new CANNON.Vec3(0.5, 0.5, 0.5)),
})
world.addBody(crate)

// 在物体局部 +Z 方向施加冲量（cannon-es：相对质心）
crate.applyImpulse(new CANNON.Vec3(0, 0, 5), new CANNON.Vec3(0, 0, 0.5))

world.fixedStep(1 / 60)
// crate.velocity 在 z 方向获得增量，随后重力与摩擦共同作用
```

`applyImpulse(force, relativePoint)` 的第二个参数是作用点相对质心的偏移；设为 `(0,0,0.5)` 可产生轻微扭矩，箱子会边滑边转。

## 与相关项目对比

| 引擎 | 维度 | 语言/运行时 | 典型场景 |
|------|------|-------------|----------|
| **cannon-es** | 3D | 纯 JS | Web 原型、Three.js、R3F |
| **Matter.js** | 2D | 纯 JS | Canvas 2D 游戏、教育 |
| **Box2D** | 2D | C++ / 移植 | 成熟 2D 手游、平台跳跃 |
| **ammo.js** | 3D | Bullet → WASM | 需要 Bullet 全特性、较大场景 |
| **Rapier** | 2D/3D | Rust → WASM | 新项目、性能敏感 Web 3D |

选型口诀：**浏览器里快速接 Three.js → cannon-es 或 Rapier**；**只要 2D → Matter.js / Box2D**；**要与桌面 Bullet 管线一致 → ammo.js**。

## 常见坑

1. **单位混乱**：Three.js 常用「任意单位」，cannon-es 默认按**米-千克-秒**。1 个 Three 单位当 1 米通常最稳。
2. **Plane 方向**：默认 Plane 法线为 +Z，地面需 `quaternion.setFromEuler(-Math.PI / 2, 0, 0)` 旋到 +Y 朝上。
3. **只 step 不 sync**：物理在跑但 mesh 不动——忘记 copy `position` / `quaternion`。
4. **Trimesh 与 Box 碰撞**：官方矩阵标注部分配对为 `(todo)`，复杂关卡先用 Convex / Compound 或简化碰撞体。
5. **大 dt 穿透**：勿用可变 `dt` 直接替代固定步；优先 `fixedStep()` 或 `step` 的多子步。
6. **从 cannon.js 迁移**：检查 `applyForce` 参考系、导入路径 `cannon` → `cannon-es`、CJS 全局 `CANNON` 改为 ESM。

## 安装与资源

```bash
npm install cannon-es
# 或配合 Three / R3F
npm install three cannon-es
npm install @react-three/cannon @react-three/fiber three cannon-es
```

| 资源 | 链接 |
|------|------|
| 官方文档 | https://pmndrs.github.io/cannon-es/docs/ |
| Getting Started | https://github.com/pmndrs/cannon-es/blob/master/getting-started.md |
| 交互示例 | https://pmndrs.github.io/cannon-es/ |
| three.js 示例源码 | https://github.com/pmndrs/cannon-es/blob/master/examples/threejs.html |
| React 封装 | https://github.com/pmndrs/use-cannon |

## 小结

cannon-es 是 **Web 端轻量 3D 刚体物理**的事实标准之一：World 装场景，Body + Shape 描述物体，每帧 `fixedStep()` 推进，再把位姿同步给渲染器。它不负责画面，却能让 Three.js 里的箱子、球体、多米诺骨牌「真的」受重力、碰撞和摩擦。零基础路径：**官方落球示例 → 接 Three.js copy 位姿 → 读 ContactMaterial 与 Constraint → 需要 React 时再上 @react-three/cannon**。
