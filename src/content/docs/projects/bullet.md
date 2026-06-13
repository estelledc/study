---
title: Bullet — C++ 经典 3D 物理引擎
来源: 'https://github.com/bulletphysics/bullet3'
日期: 2026-06-13
分类: 图形学
子分类: 渲染与图形
provenance: pipeline-v3
难度: 中级
---

## 是什么

**Bullet Physics**（常简称 Bullet）是一套用 **C++** 写的开源 **3D 碰撞检测与刚体/软体动力学**库，由 Erwin Coumans 发起，采用 **Zlib 许可证**，可商用、可静态链接进闭源游戏。GitHub 仓库 `bulletphysics/bullet3` 超过 1 万 star，被 Unity、Unreal、Blender、PyBullet、Gazebo 等大量项目直接或间接使用。

日常类比：把 Bullet 想成**台球厅里的裁判 + 记分员**。你只管摆好球（碰撞形状、质量、初始位置），裁判每帧负责三件事——找出哪些球可能相撞（碰撞检测）、按物理规则算出新位置（积分与约束求解）、把结果写回给渲染器（MotionState / Transform）。你不需要手算抛物线或碰撞反弹，只要调用 `stepSimulation`，世界就按牛顿力学推进。

Bullet 不是完整游戏引擎，而是**可嵌入的物理模块**。它不管渲染、音频、UI；只提供 `btCollisionShape`、`btRigidBody`、`btDiscreteDynamicsWorld` 等类型，以及射线检测、车辆、角色控制器、布娃娃约束等扩展。

```cpp
#include "btBulletDynamicsCommon.h"

// 最小闭环：初始化世界 → 加地面和球 → 模拟 150 帧
btDefaultCollisionConfiguration* cfg = new btDefaultCollisionConfiguration();
btCollisionDispatcher* dispatcher = new btCollisionDispatcher(cfg);
btBroadphaseInterface* broadphase = new btDbvtBroadphase();
btSequentialImpulseConstraintSolver* solver = new btSequentialImpulseConstraintSolver();
btDiscreteDynamicsWorld* world = new btDiscreteDynamicsWorld(
    dispatcher, broadphase, solver, cfg);
world->setGravity(btVector3(0, -10, 0));

// ... 创建 btBoxShape 地面 + btSphereShape 球体，addRigidBody ...

for (int i = 0; i < 150; i++) {
  world->stepSimulation(1.f / 60.f, 10);
}
```

上面这段与官方 `examples/HelloWorld/HelloWorld.cpp` 同构：先搭**四件套**（配置、调度器、粗检测、求解器），再建 `btDiscreteDynamicsWorld`，最后循环 `stepSimulation`。

## 为什么重要

不了解 Bullet，下面这些事很难讲清楚：

- 为什么 Unity 的 PhysX 和许多开源引擎都能「换物理后端」——Bullet 提供了与引擎解耦的碰撞 + 动力学 API，是事实上的参考实现之一
- 机器人仿真（PyBullet、Gazebo）为什么能在 Python 里调 C++ 物理——Bullet 有稳定的 C API 绑定与 URDF 导入示例
- 「质量为 0」在物理引擎里代表什么——不是「没有重量」，而是**静态物体**（地面、墙），引擎不会对它积分，只把它当碰撞参考
- 为什么游戏要分 **Fixed Timestep**（固定 1/60s）和渲染帧率——`stepSimulation` 内部可多次子步，避免大 dt 导致穿透（tunneling）

## 核心要点

Bullet 的刚体管线可以拆成 **世界 → 形状 → 刚体 → 步进** 四层，以及碰撞检测的三阶段。

### 1. 动力学世界（Dynamics World）

`btDiscreteDynamicsWorld` 是一帧仿真的总调度。每调用一次 `stepSimulation(deltaTime, maxSubSteps)`，内部大致顺序为：

1. **Broadphase（粗检测）**：用 `btDbvtBroadphase` 等结构快速筛出「可能接触」的物体对，避免 O(n²) 全对全检测
2. **Dispatcher + Narrowphase（细检测）**：对候选对做精确接触，生成 **contact manifold**（接触流形）
3. **Constraint Solver**：解碰撞冲量、关节、摩擦、restitution（弹性），更新速度
4. **Integration**：把线速度、角速度积分成新的位姿

类比：粗检测像快递分拣中心按城市分堆；细检测像逐件开箱核对；求解器像调解员决定两辆车擦碰后各退多少。

### 2. 碰撞形状（Collision Shape）≠ 刚体（Rigid Body）

| 概念 | 典型类 | 职责 |
|------|--------|------|
| 形状 | `btBoxShape`, `btSphereShape`, `btConvexHullShape`, `btBvhTriangleMeshShape` | 纯几何，**可多个刚体共享**同一 shape 实例以省内存 |
| 刚体 | `btRigidBody` | 质量、惯性、摩擦、restitution、速度；继承 `btCollisionObject` 的 world transform |

创建动态刚体的固定套路：

```cpp
btCollisionShape* shape = new btSphereShape(1.f);
btScalar mass = 1.f;
btVector3 inertia(0, 0, 0);
shape->calculateLocalInertia(mass, inertia);  // 由形状 + 质量算惯性张量

btTransform start;
start.setIdentity();
start.setOrigin(btVector3(0, 10, 0));

btDefaultMotionState* motion = new btDefaultMotionState(start);
btRigidBody::btRigidBodyConstructionInfo info(mass, motion, shape, inertia);
btRigidBody* body = new btRigidBody(info);
world->addRigidBody(body);
```

**质量为 0** → 静态刚体；**质量 > 0** → 动态刚体，必须调用 `calculateLocalInertia`。Bullet 规定：**刚体的 origin 即质心**，形状设计错会导致「一边重一边轻」的诡异翻滚。

### 3. MotionState：物理与渲染的桥梁

`btDefaultMotionState` 保存「图形层该显示的变换」。模拟结束后从 `body->getMotionState()->getWorldTransform(trans)` 读位置，而不是每帧手改 `setWorldTransform`（除非 kinematic 物体，需同时更新 motion state，否则与动态体交互会异常）。

### 4. 约束（Constraints）

Bullet 支持铰链（`btHingeConstraint`）、滑块、6-DOF、布娃娃用的 cone-twist 等。约束把两个刚体的相对自由度限制住，由同一套 sequential impulse 求解器与碰撞一起迭代。

### 5. 软体与扩展模块

除 `BulletCollision` + `BulletDynamics` 外，还有 **BulletSoftBody**（布料、绳、可变形体）、**Bullet3** 多线程/OpenCL 实验分支、车辆 `btRaycastVehicle`、角色 `btKinematicCharacterController`。零基础先掌握刚体闭环，再按需深入。

## 实践案例

### 案例 1：Hello World — 球落向地面

完整流程对应官方示例：地面是大 `btBoxShape`，球是 `btSphereShape`，模拟 150 帧后球稳定在地面附近。

```cpp
#include "btBulletDynamicsCommon.h"
#include <stdio.h>

int main() {
  btDefaultCollisionConfiguration* cfg = new btDefaultCollisionConfiguration();
  btCollisionDispatcher* dispatcher = new btCollisionDispatcher(cfg);
  btBroadphaseInterface* broadphase = new btDbvtBroadphase();
  btSequentialImpulseConstraintSolver* solver = new btSequentialImpulseConstraintSolver();
  btDiscreteDynamicsWorld* world = new btDiscreteDynamicsWorld(
      dispatcher, broadphase, solver, cfg);
  world->setGravity(btVector3(0, -10, 0));

  btAlignedObjectArray<btCollisionShape*> shapes;

  // 静态地面：mass = 0
  btCollisionShape* groundShape = new btBoxShape(btVector3(50, 50, 50));
  shapes.push_back(groundShape);
  btTransform groundTf;
  groundTf.setIdentity();
  groundTf.setOrigin(btVector3(0, -56, 0));
  btRigidBody* ground = new btRigidBody(
      btRigidBody::btRigidBodyConstructionInfo(
          0.f, new btDefaultMotionState(groundTf), groundShape, btVector3(0, 0, 0)));
  world->addRigidBody(ground);

  // 动态球：mass = 1
  btCollisionShape* sphereShape = new btSphereShape(1.f);
  shapes.push_back(sphereShape);
  btScalar mass = 1.f;
  btVector3 inertia;
  sphereShape->calculateLocalInertia(mass, inertia);
  btTransform start;
  start.setIdentity();
  start.setOrigin(btVector3(2, 10, 0));
  btRigidBody* sphere = new btRigidBody(
      btRigidBody::btRigidBodyConstructionInfo(
          mass, new btDefaultMotionState(start), sphereShape, inertia));
  world->addRigidBody(sphere);

  for (int i = 0; i < 150; i++) {
    world->stepSimulation(1.f / 60.f, 10);
    btTransform trans;
    sphere->getMotionState()->getWorldTransform(trans);
    btVector3 p = trans.getOrigin();
    if (i % 30 == 0)
      printf("t=%d  sphere y=%.3f\n", i, p.y());
  }

  // 逆序释放：body → shape → world → solver → broadphase → dispatcher → cfg
  world->removeRigidBody(sphere);
  delete sphere->getMotionState();
  delete sphere;
  // ... 同理清理 ground 与各 shape、world 组件
  return 0;
}
```

**要点**：`stepSimulation(1/60, 10)` 表示「目标步长 1/60 秒，最多 10 次子步」。帧率低时 Bullet 会用更小步长多次推进，减少高速物体穿模。

### 案例 2：射线检测 — 从相机位置「开枪」

游戏里点击选中、子弹命中、地面放置物体，都常用 **raycast**。Bullet 在 `btCollisionWorld` 上提供 `rayTest`：

```cpp
#include "LinearMath/btVector3.h"
#include "LinearMath/btTransform.h"

void shootRay(btDiscreteDynamicsWorld* world,
              const btVector3& from, const btVector3& to) {
  struct RayResult : public btCollisionWorld::ClosestRayResultCallback {
    RayResult(const btVector3& a, const btVector3& b)
        : btCollisionWorld::ClosestRayResultCallback(a, b) {}
  } callback(from, to);

  world->rayTest(from, to, callback);

  if (callback.hasHit()) {
    btVector3 hit = callback.m_hitPointWorld;
    const btRigidBody* hitBody = btRigidBody::upcast(callback.m_collisionObject);
    printf("hit at (%.2f, %.2f, %.2f), fraction=%.3f\n",
           hit.x(), hit.y(), hit.z(), callback.m_closestHitFraction);
    if (hitBody)
      printf("  rigid body mass=%.2f\n", 1.f / hitBody->getInvMass());
  } else {
    printf("miss\n");
  }
}

// 用法：从 (0,5,0) 向 -Y 发射
shootRay(world, btVector3(0, 5, 0), btVector3(0, -100, 0));
```

**要点**：`ClosestRayResultCallback` 返回最近命中点与 `m_collisionObject`；静态体 `getInvMass()` 为 0，动态体可据此判断是否可推动。连续碰撞检测（CCD）需对 fast-moving 物体设置 `setCcdMotionThreshold` / `setCcdSweptSphereRadius`。

### 案例 3：读取接触点 — 落地音效与粒子

碰撞解算后，可从 `btDispatcher` 遍历 **persistent manifolds** 取接触点数量与法线，用于播放音效、生成火花：

```cpp
btManifoldResult contactPointProcessed; // 概念示意
btDispatcher* disp = world->getDispatcher();
int numManifolds = disp->getNumManifolds();

for (int i = 0; i < numManifolds; i++) {
  btPersistentManifold* manifold = disp->getManifoldByIndexInternal(i);
  const btCollisionObject* obA = manifold->getBody0();
  const btCollisionObject* obB = manifold->getBody1();
  int numContacts = manifold->getNumContacts();
  for (int j = 0; j < numContacts; j++) {
    btManifoldPoint& pt = manifold->getContactPoint(j);
    if (pt.getDistance() < 0.f) {  // 真正穿透/接触
      btVector3 normal = pt.m_normalWorldOnB;
      btScalar impulse = pt.getAppliedImpulse();
      // 用 impulse 大小触发 "砰" 一声
    }
  }
}
```

## 编译与集成

**CMake 一键构建**（官方推荐）：

```bash
git clone https://github.com/bulletphysics/bullet3.git
cd bullet3
cmake -S . -B build -DBUILD_SHARED_LIBS=ON -DBUILD_BULLET3=OFF
cmake --build build -j
sudo cmake --install build   # 可选，装到系统前缀
```

在自己的项目里：

```cmake
find_package(Bullet REQUIRED)
target_link_libraries(my_game BulletDynamics BulletCollision LinearMath)
target_include_directories(my_game PRIVATE ${BULLET_INCLUDE_DIRS})
```

仓库自带 **OpenGL3 Example Browser**，编译后运行可交互查看 ragdoll、软体、车辆等 demo；每个 example 也可去掉图形单独编译，适合对照学习。

## 常见坑

1. **忘记共享 CollisionShape**：同一 mesh 建几百个刚体时，应复用一个 `btCollisionShape*`，否则内存和 broadphase 开销暴涨。
2. **静态/动态质量搞反**：地面 mass 必须 0；动态体 mass 必须 > 0 且算 inertia。
3. **Kinematic 物体睡眠**：平台、电梯需 `CF_KINEMATIC_OBJECT` + `DISABLE_DEACTIVATION`，移动时**同时**更新 `setWorldTransform` 和 `MotionState`。
4. **单位制不统一**：Bullet 无内置「米/厘米」；1 个单位 = 1 米是常见约定，重力 `-10` 近似地球。若用厘米，重力应约为 `-980`。
5. **三角 mesh 当动态凸体**：凹网格默认不宜做动态凸包；动态物体优先 `btConvexHullShape` 或简单 primitive，静态环境用 `btBvhTriangleMeshShape`。

## 学习路径

1. 读并跑通 `examples/HelloWorld/HelloWorld.cpp`（无图形）
2. 打开 Example Browser，对照 `BasicDemo`、`RagdollDemo` 源码
3. 加一个 hinge：两节 `btRigidBody` + `btHingeConstraint` + `addConstraint`
4. 若做机器人：转 PyBullet 或导入 URDF（`examples/Importers/ImportURDFDemo`）
5. 深入：阅读 [Bullet Physics Manual](https://github.com/bulletphysics/bullet3/docs/BulletPhysicsManual.pdf) 的碰撞检测与求解器章节

## 与其他方案对比

| 方案 | 语言 | 特点 |
|------|------|------|
| **Bullet** | C++ | 开源、功能全（刚体+软体+约束），嵌入成本低 |
| **PhysX** | C++ | NVIDIA 维护，主机/PC 3A 常用，闭源（有 SDK） |
| **Jolt Physics** | C++ | 现代 C++、多线程友好，近年游戏采用增多 |
| **Box2D** | C | 2D 专用，结构更简单，适合平台游戏 |

## 延伸阅读

- 官方仓库与手册：<https://github.com/bulletphysics/bullet3>
- Hello World 源码：<https://github.com/bulletphysics/bullet3/blob/master/examples/HelloWorld/HelloWorld.cpp>
- 社区手册镜像：<https://cuppajoeman.github.io/bullet-physics-manual/>
- PyBullet（Python 绑定）：<https://github.com/bulletphysics/bullet3/tree/master/examples/pybullet>
