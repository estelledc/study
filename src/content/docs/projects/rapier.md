---
title: Rapier — Rust 现代 2D/3D 物理引擎
来源: 'https://github.com/dimforge/rapier'
日期: 2026-07-08
分类: graphics
难度: 中级
---

## 是什么

Rapier 是 Dimforge 出品的**开源实时物理引擎**，用 Rust 写成，同时提供 2D 与 3D（`rapier2d` / `rapier3d`，以及 `f64` 高精度变体）。日常类比：它像游戏世界里的「物理裁判」——你只摆好箱子、球和地面，每帧吹一次哨，它告诉你谁掉下去、谁撞上、谁弹开。

它不算画面：不负责贴图、灯光或相机。它只负责刚体位置、速度、碰撞形状和关节约束。除了原生 Rust，还有官方 JavaScript/TypeScript 包（`@dimforge/rapier*`），Python 绑定也在推进中。抓住一句话：Rapier 回答的是「下一小拍物体在哪」，不是「这一帧怎么画出来」。

和「自己写 if 撞了就弹开」相比，它把接触点、冲量、睡眠岛（不动的物体先睡）这些脏活收进库里，你只维护集合并每帧 `step`。

## 为什么重要

不理解 Rapier，下面这些事会很难解释：

- 为什么 Rust 游戏（尤其 [[bevy]]）常选它做物理，而不是自己手写重力与碰撞
- 为什么「模型很漂亮」仍可能穿模：物理看的是 collider 外壳，不是三角面片外观
- 为什么 Web 小游戏也能用同一套物理：Rapier 有 WASM/JS 绑定，逻辑可跨端复用
- 为什么选型时要和 [[bullet]]、[[box2d]]、[[matter-js]] 对比：语言、维度、生态绑定不同

## 核心要点

1. **刚体（RigidBody）管运动，碰撞体（Collider）管外形**。类比：人是刚体，衣服轮廓是碰撞体。质量、速度挂在 body 上；球、方块、胶囊等形状挂在 collider 上，并用 `insert_with_parent` 绑到父刚体。

2. **世界靠 `PhysicsPipeline::step` 往前走**。类比：每 1/60 秒吹一次哨。一步里会做粗筛（broad phase）、精确接触（narrow phase）、约束求解，再更新位置。

3. **2D/3D 与精度是四套 crate，不是一个万能开关**。类比：同一裁判规则，换场地尺寸。选 `rapier2d` / `rapier3d`，需要更高数值稳定时再考虑 `*-f64`。游戏常用 `f32`；科学向或大尺度场景才优先想 `f64`。

## 实践案例

### 案例 1：2D 里让球落到地面

```rust
use rapier2d::prelude::*;

let mut bodies = RigidBodySet::new();
let mut colliders = ColliderSet::new();

colliders.insert(ColliderBuilder::cuboid(50.0, 0.1).build());

let ball = bodies.insert(
    RigidBodyBuilder::dynamic().translation(vector![0.0, 10.0]).build(),
);
colliders.insert_with_parent(
    ColliderBuilder::ball(0.5).restitution(0.7).build(),
    ball,
    &mut bodies,
);
```

**逐部分解释**：

- 地面是静态 collider（无动态刚体），球是 `dynamic` 刚体
- `restitution(0.7)` 控制弹性；`insert_with_parent` 让碰撞体跟着球走
- 之后每帧调用 `physics_pipeline.step(...)` 才会真正下落
- 单位约定要自洽：这里把「1」当成米量级；模型和重力别混用两套尺度

### 案例 2：最小步进循环（概念骨架）

```rust
let gravity = vector![0.0, -9.81];
let params = IntegrationParameters::default();
let mut pipeline = PhysicsPipeline::new();
// island_manager / broad_phase / narrow_phase / joints / ccd_solver 等一并准备

for _ in 0..200 {
    pipeline.step(
        &gravity, &params, &mut islands, &mut broad_phase, &mut narrow_phase,
        &mut bodies, &mut colliders, &mut impulse_joints, &mut multibody_joints,
        &mut ccd_solver, &(), &(),
    );
    println!("y = {}", bodies[ball].translation().y);
}
```

**逐部分解释**：

- `step` 是主循环；漏掉任一集合通常编不过或行为异常
- 打印 `translation().y` 可验证球是否下落并弹起
- 完整参数列表以 [官方 User Guide](https://rapier.rs/docs/) 为准

### 案例 3：只检测、不模拟（查询）

```rust
let ball = ColliderBuilder::ball(0.5).sensor(true).build();
```

**逐部分解释**：

- `sensor(true)` 像感应门：能报告重叠，不产生推挤冲量
- 适合触发区、拾取物、伤害判定；需要真实碰撞反弹时不要开 sensor
- 事件要靠 `EventHandler` 或查询 API 读出来；只建 sensor 不读事件等于白建

## 踩过的坑

1. **忘了 `insert_with_parent`**：collider 漂在世界里，刚体飞了形状还在原地。
2. **时间步和渲染帧绑死又不稳定**：掉帧时一次追太多物理时间会爆炸；用固定 `dt` 或限制子步。
3. **用渲染网格当碰撞体**：凹网格又慢又抖；优先 cuboid / ball / capsule / convex。
4. **2D/3D crate 混用心智**：API 很像，向量维度不同；Bevy 里要用对应的 `bevy_rapier2d` / `bevy_rapier3d`。
5. **CCD 默认心智不清**：高速子弹可能隧穿薄墙；关键物体要按文档打开连续碰撞相关选项，而不是只减小 `dt` 碰运气。

## 适用 vs 不适用

**适用**：

- Rust 游戏 / 工具需要可靠刚体、关节与连续碰撞（CCD）
- 与 [[bevy]] 集成，或需要同一物理核心上的 JS/WASM 演示
- 中小到中等规模实时场景，重视内存安全与可维护 API
- 想要 2D/3D API 形状尽量对称、文档路径清晰的学习曲线

**不适用**：

- 只要浏览器里快速 2D 原型、且团队只会 JS → [[matter-js]] / [[planck]] 往往更轻
- 需要成熟机器人/RL 仿真生态与大量 URDF → 先看 [[bullet]]（PyBullet）
- 只要软体、流体、布料电影级效果 → Rapier 主线是刚体与关节，不是全能解算器
- 完全不想碰 Rust/WASM 工具链、只要引擎一键物理 → [[godot]] 内置方案更省事

## 历史小故事（可跳过）

- Dimforge（Sébastien Crozet 等）早年维护 nphysics；社区要更快、更现代的 Rust 物理栈。
- 约 2020 年起 Rapier 作为性能向重写推进，碰撞几何侧能力沉淀在姊妹库 Parry。
- 随后补齐官方文档、示例、JS/NPM 包，并成为 Bevy 生态常见物理后端之一。
- 仓库同时维护 `rapier2d` / `rapier3d` 与对应 `f64` 变体，避免「一个 crate 里用 feature 硬切维度」。
- 项目保持开源；近年 README 也写明部分绑定与文档会在人工审阅下使用 AI 辅助维护。

## 学到什么

1. **物理引擎 = 每帧推进的状态机**，不是「画得像真」的渲染器
2. **Body 管动力学，Collider 管形状**；父子绑定错了，调试会非常痛苦
3. **选型看语言与生态**：Rust/Bevy → Rapier；经典 C++/Python 仿真 → Bullet；纯 Web 2D → Matter/Planck
4. **稳定来自固定时间步 + 合适碰撞形状**，不是堆更高的模型面数
5. **sensor / 动态刚体 / 静态几何** 三种角色要分清，混用是穿模和「撞了没反应」的常见根因

## 延伸阅读

- 官方用户指南：[rapier.rs/docs](https://rapier.rs/docs/)（Rust / JS 分册）
- 仓库与示例：[dimforge/rapier](https://github.com/dimforge/rapier)（`examples2d/` / `examples3d/`）
- crates.io：`rapier2d` / `rapier3d` 文档页（看 `RigidBodyBuilder`、`ColliderBuilder`）
- 对比阅读：[[bullet]] —— C++/PyBullet 仿真路线；[[box2d]] —— 经典 2D 刚体
- Bevy 集成：`bevy_rapier` 插件说明（按你用的 Bevy 大版本选）
- [[matter-js]] —— 浏览器 2D 物理的轻量对照

## 关联

- [[bevy]] —— Rust ECS 游戏引擎，常与 Rapier 搭配做物理
- [[bullet]] —— 另一条主流 3D 物理/仿真路线（含 PyBullet）
- [[box2d]] —— 2D 刚体物理的经典参照
- [[matter-js]] —— Web 端 2D 物理，API 心智可对照
- [[planck]] —— Box2D 的 JS 移植，适合纯前端 2D
- [[godot]] —— 自带物理后端的完整引擎，对比「引擎内置 vs 库接入」
- [[threejs]] —— 负责渲染；若在 Web 演示物理，常与 Rapier JS 绑定分工

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
