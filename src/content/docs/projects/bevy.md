---
title: Bevy — 用 Rust 写游戏的现代 ECS 引擎
来源: 'https://github.com/bevyengine/bevy'
日期: 2026-06-24
分类: 图形
难度: 中级
---

## 是什么

Bevy 是一个用 Rust 写的**数据驱动游戏引擎**，核心设计围绕 ECS（Entity-Component-System）架构。日常类比：想象一个大型乐高工厂——工厂里有很多零件（Component），每个成品编号（Entity）只是一张清单，告诉你它由哪些零件组成，而流水线工人（System）每次只关心"所有带轮子零件的成品"，把它们统一装轮胎。Bevy 就是这个工厂的管理系统：你只管定义零件和流水线，引擎替你调度一切。

和传统面向对象游戏引擎（Unity / Unreal 的 GameObject 继承树）不同，Bevy 把数据和行为彻底拆开：数据是 Component，行为是 System，引擎自动决定哪些 System 可以并行跑。

## 为什么重要

不理解 Bevy 及其 ECS 架构，下面这些事都没法解释：

- 为什么现代游戏引擎要从"继承树"转向"组合优于继承"——OOP 继承树一深就改不动，ECS 天然是组合
- 为什么 Rust 的所有权系统和 ECS 是天作之合——System 声明自己要读/写哪些 Component，编译器就能保证无数据竞争
- 为什么 Bevy 能在不加锁的情况下自动并行调度上百个 System
- 为什么 render graph（渲染图）比传统固定管线更灵活——Bevy 用图结构描述渲染流程，节点可以自由组合
- 为什么一个纯社区驱动、无商业公司的开源引擎能拿到 42k+ star

## 核心要点

ECS 三要素：

1. **Entity**：只是一个 ID（u64），本身不存任何数据。类比：学生学号，学号不是学生，但所有信息都挂在学号下面。

2. **Component**：纯数据结构，挂在 Entity 上。一个 Entity 可以同时拥有 `Position`、`Velocity`、`Sprite` 等多个 Component。类比：学号下面挂的各科成绩。

3. **System**：一个普通函数，通过参数声明自己需要哪些 Component。引擎自动把符合条件的 Entity 喂进来。类比：统计老师只要"有数学成绩的学生"，引擎自动把名单筛好递过去。

Bevy 在此基础上还有几个关键设计：

- **Plugin 系统**：功能按 Plugin 打包（渲染、音频、UI 各一个），用 `app.add_plugins(DefaultPlugins)` 一行启用全套，也可以只挑需要的
- **Resource**：全局唯一的数据，比如窗口大小、当前关卡。和 Component 的区别是：Component 挂在 Entity 上可以有很多份，Resource 全局只有一份
- **Schedule / Stage**：System 按阶段分组执行（Startup 只跑一次，Update 每帧跑），同阶段内引擎自动检测依赖关系做并行
- **Render Graph**：渲染管线拆成图节点，每个节点是一个渲染 pass，节点间用边连接表示数据依赖。想加后处理特效？加个节点就行

## 实践案例

### 案例 1：最小 Bevy 程序——一个移动方块

```rust
use bevy::prelude::*;

// 1. 定义 Component
#[derive(Component)]
struct Speed(f32);

// 2. 定义 System：自动查询所有有 Transform + Speed 的 Entity
fn move_right(mut query: Query<(&mut Transform, &Speed)>, time: Res<Time>) {
    for (mut tf, speed) in &mut query {
        tf.translation.x += speed.0 * time.delta_secs(); // 每帧右移
    }
}

// 3. 启动
fn main() {
    App::new()
        .add_plugins(DefaultPlugins)
        .add_systems(Startup, setup)
        .add_systems(Update, move_right)
        .run();
}

fn setup(mut commands: Commands) {
    commands.spawn(Camera2d::default());
    commands.spawn((
        Sprite::from_color(Color::srgb(0.2, 0.7, 1.0), Vec2::new(50.0, 50.0)),
        Speed(100.0),
    ));
}
```

关键点：`Query<(&mut Transform, &Speed)>` 这一行就是 ECS 的精髓——你声明"我要所有同时拥有 Transform 和 Speed 的 Entity"，引擎自动帮你筛选和迭代。

### 案例 2：Plugin 打包复用

```rust
pub struct EnemyPlugin;

impl Plugin for EnemyPlugin {
    fn build(&self, app: &mut App) {
        app.add_systems(Startup, spawn_enemies)
           .add_systems(Update, enemy_ai);
    }
}
// 主程序只需 app.add_plugins(EnemyPlugin);
```

Plugin 的好处：功能边界清晰，测试时可以单独加载，不用的时候一行删掉。

### 案例 3：Resource 管全局分数

```rust
#[derive(Resource, Default)]
struct Score(u32);

fn add_point(mut score: ResMut<Score>) {
    score.0 += 1;
}

fn main() {
    App::new()
        .insert_resource(Score::default())
        .add_systems(Update, add_point)
        .run();
}
```

逐步看：`Score` 不是挂在某个角色身上的 Component，而是全局只有一份的 Resource；`insert_resource` 把它放进世界；System 用 `ResMut<Score>` 声明"我要改全局分数"，调度器就知道不能让另一个也写 `Score` 的 System 同时跑。

## 踩过的坑

1. **Component 忘记 derive**：写了 `struct Position { x: f32, y: f32 }` 但忘了 `#[derive(Component)]`，编译报错一大堆泛型约束，新手完全看不懂。记住：Bevy 的 Component 必须 derive 对应 trait。

2. **System 参数顺序不影响逻辑但影响并行**：两个 System 都写了 `&mut Transform`，引擎检测到写冲突就串行跑。解决办法是用 `Without<T>` 过滤器让两个 System 操作不同的 Entity 子集，引擎就能并行。

3. **Resource 和 Component 混淆**：新手常把全局唯一的东西（比如分数）做成 Component 挂到某个 Entity 上，后面查询变得很别扭。全局数据用 `Res<Score>` / `ResMut<Score>` 访问才自然。

4. **热重载和动态加载**：Bevy 的 asset 系统支持热重载，但 Rust 本身不支持代码热重载。换贴图、换模型可以实时生效，换逻辑必须重新编译。不要指望像 Unity 那样改完脚本立刻看效果。

## 适用 vs 不适用场景

**适用**：

- 想用 Rust 写游戏或交互式图形应用，享受内存安全和零成本抽象
- 学习现代 ECS 架构的最佳实践——Bevy 的实现是教科书级别
- 需要高并行性能的模拟/可视化项目（粒子系统、物理模拟）
- 想要模块化、可插拔的引擎——用多少加多少，不用的不编译

**不适用**：

- 需要成熟编辑器和可视化工具链——Bevy 目前没有 Unity/Godot 那样的 GUI 编辑器（社区在做，但还不成熟）
- 需要立刻上线的商业项目——Bevy 还没到 1.0，API 每个版本都在改
- 团队不熟悉 Rust——Rust 的学习曲线加上 ECS 的思维转换，双重门槛
- 需要大量现成第三方资源（商店、插件）——Unity/Unreal 的生态远超 Bevy

## 历史小故事（可跳过）

- **2020 年**：Bevy 0.1 发布，目标是做一个数据驱动、插件化、完全开源的 Rust 游戏引擎。
- **2021–2022 年**：ECS 调度、渲染管线和资产系统快速迭代，社区用很多小 demo 验证"Rust 写游戏"不是玩具。
- **2023 年**：新的调度 API 稳定下来，`add_systems(Startup/Update, ...)` 成为教学里的主写法。
- **2024 年之后**：编辑器、场景系统、渲染后端继续补齐；项目仍未到 1.0，但已经能支撑不少独立游戏和可视化项目。

## 学到什么

1. **组合优于继承不是口号**——ECS 用 Component 组合替代 class 继承，解决了"钻石继承"和"上帝类"两大面向对象老问题
2. **声明式并行**——System 只声明自己读写什么，调度器自动做依赖分析和并行。这比手动加锁安全得多
3. **Rust 所有权 + ECS 查询 = 编译期数据竞争检测**——把运行时 bug 提前到编译期是 Bevy 最大的架构优势
4. **Render Graph 把渲染管线变成可编程的图**——传统引擎的渲染流程像一条固定传送带，Bevy 的 render graph 像乐高积木，可以自由拼接

## 延伸阅读

- 官方入门：[Bevy Book](https://bevyengine.org/learn/quick-start/getting-started/) ——跟着做一个完整小游戏，从零到能跑
- ECS 概念讲解：[Bevy ECS 设计哲学](https://bevyengine.org/learn/quick-start/getting-started/ecs/) ——官方对 Entity/Component/System 的解释
- 社区示例集：[Bevy Examples](https://github.com/bevyengine/bevy/tree/main/examples) ——几百个小例子，按主题分类，新手最好的学习资源
- Rust 游戏开发生态：[arewegameyet.rs](https://arewegameyet.rs/) ——Rust 游戏开发资源汇总
- ECS 架构对比：[Sander Mertens 的 ECS FAQ](https://github.com/SanderMertens/ecs-faq) ——跨引擎的 ECS 概念解释和对比

## 关联

- [[actix-web]] —— 同为 Rust 生态的高性能框架，展示 Rust 在不同领域的表现力
- [[candle]] —— Rust 写的 ML 推理库，和 Bevy 一样利用 Rust 零成本抽象做高性能计算
- [[axum]] —— Rust async web 框架，同样体现"声明式 + 类型驱动"设计
- [[cocos2d-x]] —— 传统 C++ 游戏引擎，对比 ECS vs OOP 继承体系
- [[panda3d]] —— Python/C++ 3D 引擎，适合对比不同语言生态的游戏引擎设计
- [[embassy]] —— Rust 嵌入式 async 框架，同样展示 Rust 在系统级编程的能力
- [[halide]] —— 数据和调度分离的图像处理 DSL，和 Bevy 的"数据与行为分离"哲学一脉相承

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[defold]] —— Defold — King 出品的 Lua 跨平台游戏引擎
- [[heaps]] —— Heaps — Haxe 跨平台高性能游戏引擎
- [[love2d]] —— LÖVE — 用 Lua 写 2D 游戏的轻量框架
- [[luxcorerender]] —— LuxCoreRender — 物理光线追踪
- [[minetest]] —— Minetest (Luanti) — 开源世界的 Minecraft
- [[ogre]] —— OGRE — 老牌 C++ 3D 渲染引擎
- [[openrct2]] —— OpenRCT2 — 用逆向工程让 20 年前的游戏复活
- [[rapier]] —— Rapier — Rust 现代 2D/3D 物理引擎
- [[raylib]] —— raylib — 极简 C 游戏库
- [[tiled]] —— Tiled Map Editor — 通用 2D 关卡编辑
