---
title: Box2D — Erin Catto C++ 2D 物理
来源: 'https://github.com/erincatto/box2d'
日期: 2026-06-13
分类: 图形学
子分类: 渲染与图形
provenance: pipeline-v3
难度: 初级
---

## 是什么

**Box2D** 是由 Erin Catto 创建并长期维护的**开源 2D 刚体物理引擎**，MIT 协议，GitHub 仓库 [erincatto/box2d](https://github.com/erincatto/box2d) 约 9.7k star。它不负责渲染、音频或 UI，只回答一个问题：**给定质量、形状、力和约束，下一帧每个物体该在哪里、转多少度**。

日常类比：把 Box2D 想成**桌游店里的弹珠轨道裁判**。你在桌上摆好挡板（静态形状）、弹珠（动态刚体）、铰链（关节），裁判每帧按牛顿力学推进世界，并把新坐标交还给你的精灵绘制代码。你画美术、写玩法；物理引擎管碰撞、摩擦、弹跳和连锁倒塌——《Angry Birds》式的抛物与结构坍塌，底层就是这类 2D 求解器（业界常把 Box2D 当作该品类的参考实现）。

历史上 Box2D 以 **C++** 闻名并催生了大量语言移植（JavaScript 的 box2d.js、C# 的 Farseer 等）。**当前主线是 Box2D 3.x**：核心库用 **C17** 重写，采用数据导向设计、多线程与 SIMD；API 从 `b2World*` 指针风格改为 **`b2WorldId` 等不透明句柄**。samples 仍用 C++20 + GLFW + imgui 演示。零基础学习时，先掌握「世界 → 刚体 → 形状 → 步进」闭环，再读 [Migration Guide](https://github.com/erincatto/box2d/blob/main/docs/migration.md) 对照旧教程即可。

```c
#include "box2d/box2d.h"

// 最小闭环：建世界 → 加地面与箱子 → 模拟若干步
b2WorldDef worldDef = b2DefaultWorldDef();
worldDef.gravity = (b2Vec2){0.0f, -10.0f};
b2WorldId worldId = b2CreateWorld(&worldDef);

// 静态地面（type 默认为 static）
b2BodyDef groundDef = b2DefaultBodyDef();
b2BodyId groundId = b2CreateBody(worldId, &groundDef);
b2ShapeDef groundShapeDef = b2DefaultShapeDef();
b2Segment groundSegment = {{ -20.0f, 0.0f }, { 20.0f, 0.0f }};
b2CreateSegmentShape(groundId, &groundShapeDef, &groundSegment);

// 动态箱子
b2BodyDef boxDef = b2DefaultBodyDef();
boxDef.type = b2_dynamicBody;
boxDef.position = (b2Vec2){0.0f, 4.0f};
b2BodyId boxId = b2CreateBody(worldId, &boxDef);
b2ShapeDef boxShapeDef = b2DefaultShapeDef();
boxShapeDef.density = 1.0f;
b2Polygon box = b2MakeBox(0.5f, 0.5f);
b2CreatePolygonShape(boxId, &boxShapeDef, &box);

for (int i = 0; i < 120; i++) {
  b2World_Step(worldId, 1.0f / 60.0f, 4);
}
```

上面与官方 samples 同构：先 `b2DefaultWorldDef()` 设重力，再创建 body 并挂 shape，最后循环 `b2World_Step`。

## 为什么重要

不了解 Box2D，下面这些事都难以解释：

- 为什么 2D 平台游戏、弹弓益智、车辆侧视关卡可以**共用同一套物理 API**——刚体 + 关节 + 接触约束是通用积木
- 为什么《Angry Birds》之后大量 HTML5/移动游戏都出现「box2d」字样——它是 2D 物理的**事实标准**与移植源头
- 为什么物理坐标要用**米**而不是像素——引擎按 MKS（米-千克-秒）调参，用像素当米会导致物体像摩天大楼一样不稳定
- 为什么固定时间步（1/60 s）和渲染帧率要分离——`b2World_Step` 用离散积分，大 dt 会导致高速物体**隧道穿透**（tunneling）
- 为什么 Erin Catto 在 GDC 连年讲 **Constraints**——关节、接触、摩擦在数学上都是「约束」，由同一类**顺序冲量求解器**迭代求解

## 核心要点

### 1. 物理世界（World）

`b2WorldId` 是一帧仿真的总容器，持有所有 body、shape、joint 和自动生成的 contact。每调用一次 `b2World_Step(worldId, deltaTime, subStepCount)`，内部大致顺序为：

1. **Broad-phase（粗检测）**：用动态树（dynamic tree）筛出可能接触的 shape 对
2. **Narrow-phase（细检测）**：精确求交，生成接触流形
3. **Solver（求解器）**：对接触约束与关节约束施加冲量，修正速度
4. **Integration（积分）**：用新速度更新位姿

类比：粗检测像邮局按邮编分拣；细检测像逐件称重；求解器像调解员决定两辆车擦碰后各退多少。

Box2D 3 还提供 **接触事件**（begin/end）、**传感器事件**、**body 运动事件**，可在步进结束后查询，用于播放音效、计分或触发机关。

### 2. 刚体（Body）与形状（Shape）

| 概念 | 职责 |
|------|------|
| **Body** | 质心位置、旋转、线/角速度；类型分 static / kinematic / dynamic |
| **Shape** | 碰撞几何 + 材质（密度、摩擦、恢复系数）；一个 body 可挂**多个** shape |

创建套路永远是：**先 body，后 shape**。密度写在 `b2ShapeDef` 上，引擎据此累加 body 质量与转动惯量。静态体不需要密度；动态体至少应有一个带正密度的 shape。

Body 类型速查：

| 类型 | 行为 |
|------|------|
| `b2_staticBody` | 不动，参与碰撞（地面、墙） |
| `b2_kinematicBody` | 由代码设速度/位姿，几乎不受力影响，可推动动态体 |
| `b2_dynamicBody` | 受力、碰撞、关节约束，完全模拟 |

### 3. 单位制：米，不是像素

官方明确建议：**运动物体尺寸保持在 0.1 m～10 m**（罐头到公交车），重力常取 `(0, -10)` 近似地球。若把 200 像素宽的角色直接当 200「米」，引擎会认为你在模拟一栋 45 层高楼，碰撞会发飘。

正确做法：逻辑层用米，渲染层乘 `PTM_RATIO`（pixels-to-meters，常见 32 或 50）画精灵。Cocos2d-x、libGDX 集成文档都强调这一换算。

### 4. 关节（Joint）——铰链、活塞、轮子

关节把两个 body 的相对自由度限制住。Box2D 3 支持 distance、revolute（旋转铰）、prismatic（滑块）、weld、wheel、mouse、motor、filter 等。关节可配置：

- **Limit**：限制活动范围（如肘关节角度）
- **Motor**：目标角速度/线速度 + 最大力矩/力（可当马达或刹车）
- **Spring**：刚度与阻尼（用 Hz 表示，与质量解耦）

常见用途：revolute → 门、摆锤、轮子；prismatic → 电梯、活塞；distance → 绳索、链条近似；wheel → 车辆悬挂。

### 5. 约束与求解器（Erin Catto 的核心）

从 GDC 讲义视角，**接触**也是一种约束：禁止两刚体沿法向穿透，并模拟摩擦与恢复系数。**关节**是用户显式添加的约束。**求解器**用 **Sequential Impulses（顺序冲量）** 迭代求各约束的冲量 λ，再在积分阶段更新位置——复杂度约 O(N)，适合实时游戏。

Box2D 3 的 **Soft Step** 求解器 + **连续碰撞（CCD）** 用于缓解高速物体穿透；另有 **sleeping islands**：静止物体簇休眠，不再参与求解，大堆刚体场景更省 CPU。

### 6. 查询 API（不跑物理也能用）

除刚体模拟外，`include` 目录下的碰撞例程可单独使用：**重叠查询、射线投射（ray cast）、形状投射（shape cast）**。做点击选中、视线检测、子弹命中时，不必手写几何相交。

## 实践案例

### 案例 1：读取动态体位置——同步到精灵

物理在「米」里算，绘制在「像素」里画，每帧步进后读 body 位姿：

```c
#include "box2d/box2d.h"
#include <stdio.h>

#define PTM 50.0f  // 50 像素 = 1 米

void syncSprite(b2BodyId bodyId) {
  b2Vec2 pos = b2Body_GetPosition(bodyId);
  b2Rot rot = b2Body_GetRotation(bodyId);
  float angle = b2Rot_GetAngle(rot);

  float pixelX = pos.x * PTM;
  float pixelY = pos.y * PTM;
  float pixelAngle = angle;  // 弧度，绘制 API 若用度再转换

  printf("sprite at (%.1f, %.1f) rad=%.2f\n", pixelX, pixelY, pixelAngle);
  // drawTexture(pixelX, pixelY, pixelAngle);
}

int main(void) {
  b2WorldDef def = b2DefaultWorldDef();
  def.gravity = (b2Vec2){0.0f, -10.0f};
  b2WorldId world = b2CreateWorld(&def);

  b2BodyDef bodyDef = b2DefaultBodyDef();
  bodyDef.type = b2_dynamicBody;
  bodyDef.position = (b2Vec2){0.0f, 5.0f};
  b2BodyId ball = b2CreateBody(world, &bodyDef);

  b2ShapeDef shapeDef = b2DefaultShapeDef();
  shapeDef.density = 1.0f;
  shapeDef.material.friction = 0.3f;
  shapeDef.material.restitution = 0.6f;
  b2Circle circle = { {0.0f, 0.0f}, 0.25f };
  b2CreateCircleShape(ball, &shapeDef, &circle);

  for (int i = 0; i < 180; i++) {
    b2World_Step(world, 1.0f / 60.0f, 4);
    if (i % 30 == 0)
      syncSprite(ball);
  }
  b2DestroyWorld(world);
  return 0;
}
```

**要点**：`material.restitution` 控制弹性（0 = 不弹，1 = 完全弹性碰撞）；`friction` 为库仑摩擦系数，多在 [0, 1]。不要每帧 `b2Body_SetPosition` 去「硬拽」动态体，除非你知道在写 kinematic 或 teleport 逻辑。

### 案例 2：旋转铰（Revolute Joint）——门或摆锤

两节刚体共用世界空间中的一个锚点，允许相对旋转；可限制角度范围：

```c
// 假设 world、groundId、doorId 已创建，门竖直挂在地面边缘
b2RevoluteJointDef jointDef = b2DefaultRevoluteJointDef();
jointDef.bodyIdA = groundId;
jointDef.bodyIdB = doorId;
jointDef.localAnchorA = (b2Vec2){2.0f, 0.0f};   // 地面上的铰点（局部坐标）
jointDef.localAnchorB = (b2Vec2){-0.5f, 0.0f};  // 门板上的铰点
jointDef.enableLimit = true;
jointDef.lowerAngle = -0.25f * B2_PI;  // 约 -45°
jointDef.upperAngle = 0.5f * B2_PI;    // 约 +90°
jointDef.enableMotor = false;

b2JointId hingeId = b2CreateRevoluteJoint(world, &jointDef);

// 游戏循环内
b2World_Step(world, 1.0f / 60.0f, 4);
// 可对 doorId 施加初速度或外力，门会绕铰摆动并受 limit 约束
```

**要点**：锚点用**各 body 的局部坐标**表达；`referenceAngle` 在复杂装配时可对齐「零度」姿态。需要主动推门时，可对 `doorId` 用 `b2Body_ApplyTorque` 或打开 motor 设 `motorSpeed` / `maxMotorTorque`。

### 案例 3：射线检测——鼠标点击选物体

```c
b2Vec2 origin = {3.0f, 5.0f};
b2Vec2 translation = {0.0f, -10.0f};  // 向下 cast 10 米
b2RayResult result = b2World_CastRay(world, origin, translation);

if (result.hit) {
  b2BodyId hitBody = b2Shape_GetBody(result.shapeId);
  b2Vec2 p = result.point;
  // 在 p 处高亮，或对 hitBody 施加冲量
}
```

## 编译与集成

**CMake 构建**（Linux / macOS / Windows 通用）：

```bash
git clone https://github.com/erincatto/box2d.git
cd box2d
mkdir build && cd build
cmake ..
cmake --build . --config Release
cmake --install .   # 可选
```

在自己的 CMake 项目里：

```cmake
find_package(box2d CONFIG REQUIRED)
target_link_libraries(my_game PRIVATE box2d::box2d)
```

仓库自带 **samples**（需 C++20 编译器 + OpenGL）：构建后运行可交互查看关节、车辆、堆积与性能场景。学习时优先改 samples 里的 test，比从零搭窗口省事。

**与游戏引擎的关系**：Box2D 不绑定引擎。Unity 有官方 2D Physics（不同实现）；Godot 内置 2D 物理；Cocos2d-x、LÖVE（通过 love.physics 绑定）、libGDX 等可直接嵌 Box2D 或其二进制移植。集成模式都是：**步进物理 → 读 body transform → 写回节点/精灵**。

## 常见坑

1. **像素当米**：最常见错误。务必引入 `PTM_RATIO`，并在思维里区分「模拟坐标」与「屏幕坐标」。
2. **动态体没有密度**：忘记设 `shapeDef.density` 会导致质量为 0，物体不受重力正确影响。
3. **静态体被推动**：质量来自形状密度；地面若误建成 dynamic，会被撞飞。检查 `bodyDef.type`。
4. **大时间步**：单帧 `deltaTime` 过大时，即使 CCD 也可能出问题。累积时间后分多次 `b2World_Step(..., 1/60f, ...)` 更稳。
5. **关节断开感**：锚点局部坐标设错、或两 body 初始重叠，都会让关节「爆开」。先用 debug draw 核对铰点在世界空间是否重合。
6. **旧教程 API 对不上**：网上大量 `b2World*`、`CreateFixture` 是 **Box2D 2.x**；读 [migration.md](https://github.com/erincatto/box2d/blob/main/docs/migration.md) 再对照 3.x 的 `b2CreatePolygonShape` 等 C API。
7. **缩放整个世界**：极端大地图（>12 km）浮点精度会让模拟发飘；应切块或缩小逻辑单位。

## 学习路径

1. 构建并运行官方 **samples**，用 GUI 切换场景，观察睡眠、CCD、关节参数
2. 手敲「地面 + 箱子」最小 C 程序，确认循环 `b2World_Step` 后 y 坐标下降
3. 加 **revolute** 或 **prismatic** 关节，理解 anchor / limit / motor
4. 读 [box2d.org/documentation](https://box2d.org/documentation/) 的 *Units*、*Ids and Definitions*、*Joints* 三章
5. 看 Erin Catto GDC 讲义 [*Understanding Constraints*](https://box2d.org/files/ErinCatto_UnderstandingConstraints_GDC2014.pdf) 理解求解器在做什么
6. 若维护旧项目：先确认版本是 2.x 还是 3.x，再选对应 API 与移植绑定

## 与其他方案对比

| 方案 | 维度 | 特点 |
|------|------|------|
| **Box2D** | 2D | 轻量、久经考验、关节丰富，嵌入式首选 |
| **Chipmunk2D** | 2D | 另一套 C 2D 引擎，API 风格不同，iOS 早期常用 |
| **Bullet** | 3D | 刚体 + 软体，复杂度高，见本库 [Bullet 笔记](./bullet.md) |
| **Godot Physics 2D** | 2D | 引擎内置，节点式，不直接暴露 Box2D API |
| **LiquidFun** | 2D | Google 基于 Box2D 2.x 的粒子流体分支，已停更 |

## 延伸阅读

- 官方仓库：<https://github.com/erincatto/box2d>
- 在线手册（3.x）：<https://box2d.org/documentation/>
- 2.x → 3.x 迁移：<https://github.com/erincatto/box2d/blob/main/docs/migration.md>
- Erin Catto GDC 约束讲义：<https://box2d.org/files/ErinCatto_UnderstandingConstraints_GDC2014.pdf>
- 社区教程（2.x API，概念仍有用）：<https://iforce2d.net/b2dtut/>
- 旧版 C++ 源码归档：Box2D 2.4 仍可在 release 页获取，便于对照历史文章
