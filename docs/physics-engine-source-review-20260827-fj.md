# Box2D + cannon-es source review (writer FJ)

> 用途：记录 `box2d` 与 `cannon-es` 项目页迁移所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。后缀 `-fj` 标记 2026-08-27 平行 writer FJ，避免与同日其他审查文档撞名。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer FJ
- assigned pair：box2d + cannon-es
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与文档阅读
- not executed：未编译 Box2D、未安装 cannon-es 依赖、未运行任一侧 test / samples / WASM、未测步进耗时或刚体规模
- worktrees：本机 `research-worktrees/`（gitignored），blob-filtered + sparse + depth 1
- slugs：仓库笔记 slug 仍为 `box2d` 与 `cannon-es`；未发明新页面

## 选题

- `data/project-standard-audit.json` 与 `origin/main` 均有这两页，状态 `needs-evidence`，canonical 分别为 `erincatto/box2d` 与 `pmndrs/cannon-es`。
- 未占用本波其他 writer 的 slug，也没有既有 `docs/*-source-review-20260827-*.md` 覆盖这两页。

## Box2D

- canonical source：`https://github.com/erincatto/box2d`
- tag：`v3.1.1`（lightweight tag，object type `commit`）
- revision：`8c661469c9507d3ad6fbd2fea3f1aa71669c2fe3`
- package / CMake：`project(box2d VERSION 3.1.1)`
- license：MIT
- also observed：`main` HEAD `617d32ab02570930625bbcb8479f54be9bf8d045`（2026-08-21，Tunable CCD / `b2BodyDef::safetyFactor`）；未绑定 HEAD
- inspected：
  - `README.md`
  - `CMakeLists.txt`
  - `docs/hello.md`
  - `include/box2d/box2d.h`
  - `include/box2d/id.h`
  - `include/box2d/types.h`
  - `src/types.c`
  - `src/constants.h`
  - `src/core.c`（`b2_lengthUnitsPerMeter`）
  - `src/world.c`（世界表与 `B2_MAX_WORLDS`）
- observed：
  - 库本体是 portable C17；samples 才要 C++20。公开对象是 opaque id（`b2WorldId` / `b2BodyId` / `b2ShapeId` / `b2JointId`），零初始化视为 null。
  - 定义结构必须走 `b2DefaultWorldDef` / `b2DefaultBodyDef` / `b2DefaultShapeDef`；注释写明 C 没有构造函数，零初始化不合法。
  - 默认世界重力 `{0, -10}`，`enableSleep` / `enableContinuous` 为 true，`contactHertz=30`，`contactDampingRatio=10`，`maximumLinearSpeed=400`（乘 `b2_lengthUnitsPerMeter`，core.c 默认为 1）。
  - 默认 body 是 `b2_staticBody`；动态体必须显式 `b2_dynamicBody`。默认 shape 密度 1、摩擦 0.6、`updateBodyMass=true`。
  - `b2World_Step(worldId, timeStep, subStepCount)`；hello 文档建议 `1/60` 与 4 个子步。没有 2.x 的 velocity/position iteration 三参 `Step`。
  - 形状直接挂在 body 上，没有 fixture 类型。传感器是 `b2ShapeDef.isSensor`；传感器事件默认关。
  - 接触 / 传感器 / body 事件在步进后拉取，数据 transient，不能存指针。
  - 进程内最多 `B2_MAX_WORLDS` 128 个世界；世界表是 `b2_worlds[B2_MAX_WORLDS]`。
  - 关节入口：distance / motor / mouse / filter / prismatic / revolute / weld / wheel。

## cannon-es

- canonical source：`https://github.com/pmndrs/cannon-es`
- tag：`v0.20.0`（annotated tag object `987f3b1e0c5aa17ec1cb9405184a3968baca3cd4` → peeled commit）
- revision：`8b147715d5f7ec69da2211611daa236d80e88933`
- package：`cannon-es@0.20.0`（MIT，`sideEffects: false`）
- npm：`cannon-es@0.20.0` latest，无 `gitHead`；`homepage` 仍写 `https://github.com/schteppe/cannon.js`
- also observed：`master` HEAD `dd971c4a604acdbb211955382e7a80de1f31edfb`（2024-01-06，`chore: build docs`）；未绑定 HEAD
- inspected：
  - `package.json`
  - `readme.md`
  - `src/cannon-es.ts`
  - `src/world/World.ts`
  - `src/objects/Body.ts`
  - `src/objects/Spring.ts`
  - `src/material/Material.ts`
  - `src/material/ContactMaterial.ts`
  - `src/solver/GSSolver.ts`
  - `src/math/Quaternion.ts`
- observed：
  - TypeScript 维护 fork，扁平 ESM/CJS 导出；默认 `NaiveBroadphase` + `GSSolver`（`iterations=10`，`tolerance=1e-7`）。
  - `World.allowSleep` 默认 false；`Body.allowSleep` 默认 true。世界不打开 sleep 时，刚体自己的 allowSleep 不会让仿真休眠。
  - `World.step(dt)` 是无插值固定步；`step(dt, timeSinceLastCalled, maxSubSteps=10)` 才走 accumulator，并在超时或子步用尽后 `accumulator %= dt`，再 lerp/slerp 到 `interpolatedPosition` / `interpolatedQuaternion`。
  - `fixedStep()` 用 `performance.now()` 填 `timeSinceLastCalled`。
  - `Body` 默认 `mass=0` → `STATIC`；`mass > 0` 才是 `DYNAMIC`。`isTrigger` 默认 false：仍发 collide，不改力。
  - `new Material('glass')` 只设置已弃用的 name，摩擦/弹性仍是 `-1`（回落到 ContactMaterial / `defaultContactMaterial`）。
  - `ContactMaterial` 默认 friction/restitution 都是 0.3，刚度 `1e7`，relaxation 3。
  - `Spring` 不是 `Constraint`：必须在 `postStep` 里自己 `applyForce()`。`F = -k*(x-L) - D*u`。
  - `applyImpulse` / `applyForce` 相对刚体中心；对 sleep 中的 body 会唤醒。
  - Cylinder 绕 Y 轴；`type` 为 `Shape.types.CYLINDER`。另有 `World.hasActiveBodies` 与可选 `frictionGravity`。
