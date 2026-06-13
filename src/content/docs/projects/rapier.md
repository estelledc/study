---
title: Rapier — Rust 现代物理引擎
来源: 'https://github.com/dimforge/rapier'
日期: 2026-06-13
分类: 图形学
子分类: 渲染与图形
provenance: pipeline-v3
难度: 初级
---

## 是什么

**Rapier** 是由 Dimforge 组织用 **Rust** 编写的开源 **2D/3D 刚体物理引擎**，Apache 2.0 协议，GitHub 仓库 [dimforge/rapier](https://github.com/dimforge/rapier) 约 5k+ star。它不负责渲染、网络或 UI，只回答一个问题：**给定质量、碰撞形状、力和关节约束，下一帧每个物体该在哪里、转多少度**。

日常类比：把 Rapier 想成**Rust 游戏工作室里的「力学调度中心」**。你在场景里摆好地板（静态碰撞体）、箱子（动态刚体）、门铰链（旋转关节）、电梯导轨（棱柱关节），调度中心每帧按牛顿力学推进世界，并把新位姿交还给你的渲染层（Bevy、macroquad、Three.js via WASM 等）。你画精灵、写玩法；Rapier 管碰撞、摩擦、弹跳、布偶 ragdoll 和机械臂约束——和 Box2D、PhysX 是同一类「幕后裁判」，但源码 100% Rust，且同一套 API 同时覆盖 2D 与 3D。

Rapier 是 nphysics 的继任者，2020 年由 Dimforge 正式发布，设计目标就是**性能优先**：可选 SIMD（`simd-stable` / `simd-nightly`）、可选多线程（`parallel`）、可选跨平台确定性（`enhanced-determinism`）。官方还提供 **JavaScript/TypeScript NPM 包**（`@dimforge/rapier2d`、`@dimforge/rapier3d`），可在浏览器 Web Worker 里跑物理，渲染仍由 PixiJS、Three.js 等负责。

Crates 一览：

| Crate | 用途 |
|-------|------|
| `rapier2d` | 2D 仿真，默认 `f32` |
| `rapier3d` | 3D 仿真，默认 `f32` |
| `rapier2d-f64` / `rapier3d-f64` | 高精度 `f64` 仿真（机器人、科学场景） |

```toml
# Cargo.toml — 2D 示例，可按需打开 feature
[dependencies]
rapier2d = { version = "0.22", features = ["simd-stable"] }
```

```rust
use rapier2d::prelude::*;

fn main() {
    let mut rigid_body_set = RigidBodySet::new();
    let mut collider_set = ColliderSet::new();

    // 静态地面：不挂 RigidBody，直接插入 ColliderSet
    let ground = ColliderBuilder::cuboid(100.0, 0.1).build();
    collider_set.insert(ground);

    // 动态球：刚体 + 碰撞体父子绑定
    let ball_body = RigidBodyBuilder::dynamic()
        .translation(vector![0.0, 10.0])
        .build();
    let ball_collider = ColliderBuilder::ball(0.5).restitution(0.7).build();
    let ball_handle = rigid_body_set.insert(ball_body);
    collider_set.insert_with_parent(ball_collider, ball_handle, &mut rigid_body_set);

    // 仿真管线所需结构（官方 basic example 同构）
    let gravity = vector![0.0, -9.81];
    let integration_parameters = IntegrationParameters::default();
    let mut physics_pipeline = PhysicsPipeline::new();
    let mut island_manager = IslandManager::new();
    let mut broad_phase = DefaultBroadPhase::new();
    let mut narrow_phase = NarrowPhase::new();
    let mut impulse_joint_set = ImpulseJointSet::new();
    let mut multibody_joint_set = MultibodyJointSet::new();
    let mut ccd_solver = CCDSolver::new();

    for _ in 0..200 {
        physics_pipeline.step(
            &gravity,
            &integration_parameters,
            &mut island_manager,
            &mut broad_phase,
            &mut narrow_phase,
            &mut rigid_body_set,
            &mut collider_set,
            &mut impulse_joint_set,
            &mut multibody_joint_set,
            &mut ccd_solver,
            &(),
            &(),
        );
        let y = rigid_body_set[ball_handle].translation().y;
        println!("Ball altitude: {y:.3}");
    }
}
```

上面是官方 [Getting started](https://rapier.rs/docs/user_guides/rust/getting_started) 的最小闭环：地面 + 弹性球 + `PhysicsPipeline::step` 循环 200 步。注意 Rapier 把**刚体（RigidBody）**与**碰撞体（Collider）**拆成两个集合，比「Body 上直接挂 Fixture」的 Box2D 风格更灵活——一个刚体可挂多个 collider，静态环境也可以只有 collider 没有 body。

## 为什么重要

不了解 Rapier，下面这些事都难以解释：

- 为什么 Bevy 生态里 `bevy_rapier` 是物理插件的事实选择——Rust 游戏栈需要**同语言、同内存模型**的物理后端，避免 C++ FFI 与 WASM 胶水
- 为什么同一团队还能维护 **nalgebra、parry、Avian** 等 crate——Dimforge 用 Rapier 把碰撞（parry）、线性代数（nalgebra）串成完整仿真管线
- 为什么浏览器里也能跑「接近原生」的物理——官方 WASM 绑定 + Worker 线程，性能在 JS 物理引擎中处于第一梯队
- 为什么机器人/动画管线会关心 **enhanced-determinism**——回放、网络同步、自动化测试需要「同输入同输出」，Rapier 可选 IEEE 754 严格跨平台确定性
- 为什么 2D 平台游戏和 3D 第三人称可以共用学习曲线——API 设计镜像（`rapier2d` ↔ `rapier3d`），从 2D 原型迁到 3D 成本低

## 核心要点

### 1. 仿真结构：不是只有一个 World

与 Box2D 的单一 `b2World` 不同，Rapier 把职责拆成多个**显式集合 + 管线**：

| 结构 | 职责 |
|------|------|
| `RigidBodySet` | 所有刚体位姿、速度、质量属性 |
| `ColliderSet` | 所有碰撞形状（可独立存在，也可挂到 body 上） |
| `ImpulseJointSet` / `MultibodyJointSet` | 冲量关节、多体链（ragdoll、机械臂） |
| `PhysicsPipeline` | 每帧串联：粗检测 → 细检测 → 约束求解 → 积分 → CCD |
| `IslandManager` | 休眠（sleeping）与活跃岛划分，跳过已静止物体 |
| `IntegrationParameters` | 时间步长、求解器迭代次数、CCD 子步等 |
| `QueryPipeline` | 射线、形状扫描、相交测试（每帧从 broad-phase 临时构建） |

类比：`PhysicsPipeline` 像工厂总控室；`RigidBodySet` / `ColliderSet` 是原材料仓库；`IslandManager` 是「这条流水线已停工的工位清单」，避免对静止堆叠的箱子空算。

每调用一次 `physics_pipeline.step(...)`，内部大致顺序为：

1. **Broad-phase**：BVH 等结构筛出可能接触的 collider 对
2. **Narrow-phase**：精确求交，生成接触流形
3. **Solver**：对接触约束与关节约束施加冲量
4. **Integration**：更新位姿；可选 **CCD** 缓解高速穿透

若只需碰撞检测、不做动力学，可用 `CollisionPipeline` 替代 `PhysicsPipeline`——但不要两者同时对同一场景做完整步进，物理管线已内含碰撞。

### 2. 刚体（RigidBody）与碰撞体（Collider）

| 类型 | 说明 |
|------|------|
| **Dynamic** | 受力、受碰撞，质量由 collider 密度或显式质量决定 |
| **Kinematic** | 由代码驱动位姿/速度，「推」动动态体但不反向被推动 |
| **Fixed / Static** | 不动；可直接插入无 body 的 collider 表示静态环境 |

常见形状构造（2D/3D API 对称）：

- `ColliderBuilder::ball(radius)` — 圆/球
- `ColliderBuilder::cuboid(hx, hy)` / `cuboid(hx, hy, hz)` — 盒
- `ColliderBuilder::capsule_y(half_height, radius)` — 胶囊（角色常用）
- `ColliderBuilder::convex_hull(&points)` — 点集凸包
- `ColliderBuilder::heightfield(heights, scale)` — 高度场地形

**传感器（Sensor）**：collider 可设为 sensor，不参与力学响应，但触发 **intersection events**——用于拾取物、触发器、视野检测。

物理单位建议与 Box2D 相同：用 **MKS（米-千克-秒）**。把 800 像素宽的角色当 800 m 会导致数值不稳定；通常 `1 世界单位 = 1 米`，渲染时再乘像素比例。

### 3. 关节（Joints）与自由度

关节限制两个刚体之间的**相对自由度（DOF）**：

| 关节 | 2D 剩余 DOF | 3D 剩余 DOF | 典型用途 |
|------|-------------|-------------|----------|
| Fixed | 0 | 0 | 焊接；多 collider 同一 body 更高效 |
| Revolute / Spherical | 1 旋转 | 3 旋转 | 门铰、钟摆、肩关节 |
| Prismatic | 1 平移 | 1 平移 | 活塞、电梯、抽屉 |
| GenericJoint | 自定义 | 自定义 | 组合约束 |

Revolute、Prismatic、Spherical 支持 **motor**（PD 控制器）：可设目标角速度/位置，模拟驱动轮、伺服电机。

```rust
use rapier2d::prelude::*;

fn pendulum_with_motor() {
    let mut bodies = RigidBodySet::new();
    let mut colliders = ColliderSet::new();
    let mut joints = ImpulseJointSet::new();

    // 固定锚点（静态）
    let anchor = bodies.insert(RigidBodyBuilder::fixed().translation(vector![0.0, 5.0]).build());
    colliders.insert_with_parent(
        ColliderBuilder::ball(0.1).build(),
        anchor,
        &mut bodies,
    );

    // 摆锤臂（动态）
    let bob = bodies.insert(RigidBodyBuilder::dynamic().translation(vector![0.0, 2.0]).build());
    colliders.insert_with_parent(
        ColliderBuilder::cuboid(0.15, 1.0).build(),
        bob,
        &mut bodies,
    );

    // 旋转关节：只允许绕锚点旋转
    let joint = RevoluteJointBuilder::new()
        .local_anchor1(point![0.0, 0.0])
        .local_anchor2(point![0.0, 1.0])
        .motor_velocity(0.5, 0.4); // 目标角速度 + 阻尼
    joints.insert(anchor, bob, joint, true);

    // 后续在 game loop 里与其他集合一并传入 physics_pipeline.step(...)
}
```

### 4. 事件、查询与钩子

- **EventHandler**：监听 contact start/stop、sensor enter/exit，用于音效、计分、伤害判定
- **PhysicsHooks**：过滤碰撞对、修改接触（如 one-way platform、自定义摩擦）
- **QueryPipeline**：`cast_ray`、`intersect_shape` 等，用于子弹射线、鼠标点选、AI 视线

步进后可用 `island_manager.active_bodies()` 迭代**本帧仍活跃**的刚体，只更新动了的对象到渲染层——与 Bevy 的 `Transform` 同步时这是常见优化点。

### 5. Feature 与性能取舍

| Feature | 作用 | 注意 |
|---------|------|------|
| `simd-stable` | stable Rust 下的 SIMD | 平台支持有限 |
| `simd-nightly` | nightly SIMD，覆盖面更广 | 需 nightly 工具链 |
| `parallel` | rayon 并行宽相位/求解 | 小场景可能更慢 |
| `enhanced-determinism` | 跨平台确定性 | 与 `parallel`/SIMD 互斥 |
| `serde-serialize` | 快照序列化 | 存档、回放 |
| `wasm-bindgen` | WASM 绑定 | 浏览器部署 |

官方 benchmark 显示：Release 模式下 Rapier 可比 nphysics 快数倍，2D 与 Box2D 同量级，3D 接近 CPU 版 PhysX——具体取决于场景复杂度与 feature 组合。

## 与 Bevy 集成（概念）

游戏引擎通常不直接手写全部 `*Set`，而是用封装 crate：

```toml
[dependencies]
bevy = "0.15"
bevy_rapier2d = "0.28"  # 版本需与 bevy 对齐，以 crates.io 为准
```

`bevy_rapier2d` 把 Rapier 的集合映射为 ECS 组件与插件系统：你 spawn 带 `RigidBody`、`Collider` 的实体，引擎在每帧 `PhysicsSet` 里自动 `step`，再用 `ReadTransform` 等系统把结果写回 `Transform`。底层仍是同一套 Rapier API，只是省掉手动管理 `RigidBodySet` 的样板代码。

## 常见坑

1. **忘记每帧调用 `step`**：物理世界不会自动推进；固定 `dt`（如 1/60）通常比可变帧长更稳。
2. **静态地面只建 body 不建 collider**（或反之）：静态环境可直接 `collider_set.insert(ColliderBuilder::...)` 无 parent body。
3. **用 FixedJoint 拼一个复合体**：多个形状同一刚体 + 多 collider 更高效；FixedJoint 适合需要读「关节力」并动态拆断的场景。
4. **CCD 未开仍高速移动**：薄墙穿透需调 `IntegrationParameters`、启用 CCD 或缩小时间步。
5. **determinism 与 parallel 同时开**：编译/feature 层面互斥，规划网络同步时要提前选型。
6. **版本漂移**：Rapier 尚未 1.0，minor 升级可能有 breaking change，生产项目应锁版本并读 [changelog](https://github.com/dimforge/rapier/blob/master/CHANGELOG.md)。

## 学习路径

1. 读 [User Guides — Rust](https://rapier.rs/docs/user_guides/rust/getting_started) 跑通球落地示例
2. 克隆仓库运行 `cargo run --release --bin all_examples2` / `all_examples3` 对照源码
3. 按需阅读 Colliders、Joints、Character controller、Scene queries 章节
4. 若用 Bevy：跟官方 `bevy_rapier` 示例做 2D 平台或 3D 堆箱子
5. 若做 Web：用 `@dimforge/rapier2d-compat` 在 Worker 里 step，主线程只渲染

## 相关链接

- 官网与文档：[rapier.rs](https://rapier.rs/)
- 源码：[github.com/dimforge/rapier](https://github.com/dimforge/rapier)
- Dimforge 博客（发布文）：[Announcing Rapier](https://dimforge.com/blog/2020/08/25/announcing-the-rapier-physics-engine/)
- 同生态： [parry](https://github.com/dimforge/parry)（碰撞）、[nalgebra](https://nalgebra.org/)（线性代数）
- 对比阅读：本库 [Box2D](/docs/projects/box2d)、[Planck.js](/docs/projects/planck)、[Bevy](/docs/projects/bevy)
