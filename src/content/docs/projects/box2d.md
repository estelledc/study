---
title: Box2D — C17 2D 刚体物理
来源: https://github.com/erincatto/box2d
日期: 2026-07-08
分类: graphics
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/erincatto/box2d
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 8c661469c9507d3ad6fbd2fea3f1aa71669c2fe3
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 3.1.1
---

## 是什么

Box2D 3.x 是 Erin Catto 写的 **2D 刚体物理库**，库本体是 portable C17，公开对象是按值传递的 opaque id。日常类比：你不再“new 一个世界对象再对它调方法”，而是拿一张编号牌去柜台办事——`b2WorldId` / `b2BodyId` / `b2ShapeId` 本身不持有内存。

```c
b2WorldDef worldDef = b2DefaultWorldDef();
worldDef.gravity = (b2Vec2){0.0f, -10.0f};
b2WorldId worldId = b2CreateWorld(&worldDef);
b2World_Step(worldId, 1.0f / 60.0f, 4);
b2DestroyWorld(worldId);
```

固定 `v3.1.1` 的 CMake 项目版本是 `3.1.1`。samples 才要求 C++20；绑定 C++ class 的旧笔记（`b2World::Step(dt, velIters, posIters)`、fixture）对不上这条线。

## 为什么重要

不按 3.1.1 的 C API 读，下面这些 2.x 印象会直接编不过：

- 世界、刚体、形状不再是 C++ 对象，零初始化的 id 是 null
- `b2WorldDef` 必须先走 `b2DefaultWorldDef()`，不能 `{0}` 当默认
- 默认 body 是 static；忘了写 `b2_dynamicBody` 就会“掉不下来”
- 没有 fixture：形状直接 `b2CreatePolygonShape(bodyId, &shapeDef, &box)`
- 接触回调改成步进后拉取 transient 事件数组

## 核心要点

固定 3.1.1 可以拆成五层：

1. **定义必须带 secret cookie**：`b2DefaultWorldDef()` 默认重力 `{0, -10}`、`enableSleep` / `enableContinuous` 为 true、`contactHertz=30`、`contactDampingRatio=10`、`maximumLinearSpeed=400`（再乘 `b2_lengthUnitsPerMeter`，`core.c` 默认为 1）。漏掉 default helper 会让 `internalValue` 对不上。

2. **世界是全局表里的槽**：`b2CreateWorld` 最多同时占用 `B2_MAX_WORLDS`（128）个槽。每个世界独立，注释写明可以并行模拟。

3. **步进是时间步 + 子步**：`b2World_Step(worldId, timeStep, subStepCount)`。hello 文档建议 `1/60` 和 4 个子步（子步 240Hz）。没有 2.x 那对 velocity/position iteration 计数。

4. **形状挂在 body 上**：`b2DefaultShapeDef()` 密度 1、摩擦 0.6、`updateBodyMass=true`。`isSensor` 只产生 overlap、不产生碰撞响应；`enableSensorEvents` 即使对传感器也默认 false。

5. **事件是拉模型**：`b2World_GetContactEvents` / `GetSensorEvents` / `GetBodyEvents` 返回当前步的 transient 数据，不能存引用。要自己在步进后拷走。

## 实践示例

### 案例 1：hello 落地盒

```c
b2WorldDef worldDef = b2DefaultWorldDef();
b2WorldId worldId = b2CreateWorld(&worldDef);

b2BodyDef groundDef = b2DefaultBodyDef();
groundDef.position = (b2Vec2){0.0f, -10.0f};
b2BodyId groundId = b2CreateBody(worldId, &groundDef);
b2Polygon groundBox = b2MakeBox(50.0f, 10.0f);
b2ShapeDef groundShape = b2DefaultShapeDef();
b2CreatePolygonShape(groundId, &groundShape, &groundBox);

b2BodyDef bodyDef = b2DefaultBodyDef();
bodyDef.type = b2_dynamicBody;
bodyDef.position = (b2Vec2){0.0f, 4.0f};
b2BodyId bodyId = b2CreateBody(worldId, &bodyDef);
b2Polygon box = b2MakeBox(1.0f, 1.0f);
b2ShapeDef shapeDef = b2DefaultShapeDef();
b2CreatePolygonShape(bodyId, &shapeDef, &box);

b2World_Step(worldId, 1.0f / 60.0f, 4);
b2Vec2 p = b2Body_GetPosition(bodyId);
```

`b2MakeBox` 吃的是半宽半高。地面默认 static。动态盒必须设 `type`。

### 案例 2：中心冲量

```c
b2Body_ApplyLinearImpulseToCenter(bodyId, (b2Vec2){20.0f, 0.0f}, true);
```

第三个参数 `wake` 为 true 会唤醒。注释写明冲量适合一次性动作；持续力应走 `b2Body_ApplyForce*`，更贴合子步求解器。睡着的 body 会忽略冲量，除非你先唤醒。

### 案例 3：步进后读接触

```c
b2World_Step(worldId, 1.0f / 60.0f, 4);
b2ContactEvents events = b2World_GetContactEvents(worldId);
/* events 只在这一步有效，下一拍再取会换一批 */
```

不要在回调里改拓扑。3.x 没有 2.x 那种 `b2ContactListener` 虚函数。

## 踩过的坑

1. **继续写 `world.Step(dt, 8, 3)`**：那是 2.x C++。3.1.1 只有 `b2World_Step(id, dt, subStepCount)`。
2. **零初始化 `b2WorldDef`**：hello 写明 C 没有构造函数，必须 `b2Default*Def()`。
3. **默认 body 当动态用**：`b2DefaultBodyDef().type` 是 `b2_staticBody`。
4. **把 fixture 当必须层**：形状直接创建在 body 上；filter / 密度 / 摩擦在 `b2ShapeDef`。
5. **存事件指针跨步**：`Get*Events` 数据 transient。
6. **把 `main` 上的 CCD `safetyFactor` 写成 3.1.1 合同**：那是 2026-08-21 的未发布提交。

## 适用 vs 不适用场景

**适用**：

- 2D 游戏 / 教学需要刚体、关节、传感器和查询（ray / shape cast / overlap）
- 能接受 C17 头文件 + 自己写渲染同步
- 需要同一进程里多个独立世界（上限 128）

**不适用**：

- 仍按 2.4 fixture / `b2World` 类写新代码
- 3D 或柔体为主的仿真
- 要把未跑过的堆叠规模、SIMD 加速比写成选型结论
- 准备跟 `main` 的 Tunable CCD 走，却仍按 3.1.1 推理

## 固定版本边界

- 本文绑定 `erincatto/box2d@8c661469c9507d3ad6fbd2fea3f1aa71669c2fe3`，lightweight tag `v3.1.1`。
- `main` 在 2026-08-21 已有 `617d32ab...`（CCD `safetyFactor`）；未绑定。
- 未编译、未跑 samples / test、未测步进耗时，状态保持 `UNVERIFIED`。

## 学到什么

1. **3.x 的单位是 id，不是对象**——零 id 就是 null，销毁世界会带走其上的 body/shape/joint。
2. **子步替代了 2.x 的双迭代计数**——调的是 `subStepCount`，不是 vel/pos iters。
3. **默认值藏在 `b2Default*Def`**——尤其是 static body 和 0.6 摩擦。
4. **事件要自己拷**——拉模型，下一步就失效。

## 应用型自测

1. `b2BodyDef def = {0}; b2CreateBody(worldId, &def);` 在固定头文件合同里可靠吗？
2. 不改 `bodyDef.type` 时，盒子会在重力下落吗？
3. `b2World_Step` 的第三参还是 velocity iteration 吗？

检查点：

1. 不可靠。定义必须 `b2DefaultBodyDef()`，否则 `internalValue` 对不上。
2. 不会。默认 `b2_staticBody`。
3. 不是。第三参是 `subStepCount`。

## 延伸阅读

- 手册：[box2d.org/documentation](https://box2d.org/documentation/)
- 固定源码：[erincatto/box2d](https://github.com/erincatto/box2d) —— 本文绑定提交 `8c661469c9507d3ad6fbd2fea3f1aa71669c2fe3`
- 迁移说明在仓库 `docs/migration.md`（以你检出的 revision 为准）
- [[planck]] —— JS 侧的 Box2D 生态，不是这份 C17 源码
- [[matter-js]] —— 另一条 JS 2D 刚体路线
- [[cannon-es]] —— 浏览器 3D 刚体的对照

## 关联

- [[cannon-es]] —— 3D JS 世界 / accumulator / Spring 对照
- [[chipmunk2d]] —— 另一条 C 2D 物理
- [[matter-js]] —— JS 2D
- [[planck]] —— Box2D 的 JS 移植线
- [[rapier]] —— Rust 2D/3D

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[bullet]] —— Bullet — C++ 经典 3D 物理引擎与 PyBullet 仿真工具
- [[matter-js]] —— Matter.js — 2D 刚体世界里最轻的“物理白板”
- [[planck]] —— planck.js — 纯 JS Box2D 生态
- [[rapier]] —— Rapier — Rust 现代 2D/3D 物理引擎
