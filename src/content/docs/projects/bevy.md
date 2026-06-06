---
title: Bevy — Rust 数据驱动 ECS 游戏引擎
来源: 'https://github.com/bevyengine/bevy'
日期: 2026-06-06
分类: 图形学
子分类: 渲染与图形
难度: 中级
---

## 是什么

Bevy 是一个用 **Rust** 写的开源游戏引擎，核心理念是**数据驱动**——游戏逻辑以纯数据结构（Component）和普通函数（System）的形式表达，而不是把行为塞进对象方法里。

日常类比：把一张角色扮演游戏的角色卡拆成三堆卡片。第一堆写属性（`Position`、`Health`），第二堆写规则（移动规则、战斗规则），第三堆是代号（Entity ID 101 = 你的角色）。游戏运行时，引擎每帧把"有 Position + Velocity 属性"的代号找出来，全扔给移动规则处理一遍。这种"属性和行为分开、规则自动并行"的结构就是 ECS。

Bevy 用的 ECS 实现叫 **Bevy ECS**，一个特别之处是：Component 是普通 Rust 结构体（`#[derive(Component)]`），System 是普通 Rust 函数，Entity 是一个 `u64` 整数——不需要继承、不需要虚表、不需要宏魔法。这让 Bevy ECS 在同类 Rust ECS 里以"学习曲线最平"著称。

```rust
use bevy::prelude::*;

#[derive(Component)]
struct Velocity { x: f32, y: f32 }

#[derive(Component)]
struct Position { x: f32, y: f32 }

fn movement(mut query: Query<(&mut Position, &Velocity)>) {
    for (mut pos, vel) in &mut query {
        pos.x += vel.x;
        pos.y += vel.y;
    }
}

fn main() {
    App::new()
        .add_plugins(DefaultPlugins)
        .add_systems(Update, movement)
        .run();
}
```

上面这段代码的意思：每帧把"同时有 Position 和 Velocity 的实体"找出来，把 Velocity 加到 Position 上。`movement` 函数不知道也不关心是哪个实体——只要有这两个组件就会跑。

## 为什么重要

不理解 Bevy ECS，下面这些事都没法解释：

- 为什么 Unity 的 DOTS 和 Unreal 的 Mass Entity 都在往同一个方向走——「把游戏对象拆成纯数据」是现代引擎架构的共识，Bevy 是最纯粹的 Rust 落地
- 为什么同样的游戏逻辑用 ECS 写完之后 CPU 缓存命中率显著更高——相同类型的 Component 在内存里连续存储（AoS → SoA），和传统 OOP 的指针跳跃截然不同
- 为什么 Bevy 的 System 可以默认并行——引擎静态分析每个 System 读写哪些 Component，无数据依赖的 System 自动并发运行，不需要程序员手写线程
- 为什么 Rust 所有权模型和 ECS 天然契合——Component 的所有权归 World，System 通过 Query 借用数据，Rust 的借用检查器在编译期帮你排除大部分数据竞争

## 核心要点

Bevy 的三个核心设计决策：

1. **World 是唯一真相来源**：所有 Entity、Component、Resource（全局单例数据）都存在 `World` 里。没有"场景图"、没有"游戏对象树"，只有一张扁平的数据表。类比：关系数据库——Entity 是主键，Component 是各张表，System 是 SQL 查询。Query 就是 `SELECT`。

2. **Schedule 控制执行顺序**：System 被分配到不同的 Schedule（`Startup`、`Update`、`FixedUpdate`……）。Schedule 是一个有向无环图，Bevy 会自动推断哪些 System 可以并行、哪些必须串行。需要强制顺序时用 `.chain()` 或 `.before()`/`.after()`。类比：任务管理器——你只定义"A 在 B 之前"，系统帮你把任务分配给多个核。

3. **渲染与逻辑分离的 Render Graph**：Bevy 的渲染系统是一个独立的 ECS 世界（RenderWorld），每帧从主 World 提取数据（`Extract` 阶段）后独立运行。底层是 WGPU，支持 Vulkan / Metal / DX12 / WebGPU。类比：两条流水线平行——主逻辑线处理游戏状态，渲染线把当前帧的快照提交给 GPU，互不等待。

## 实践案例

### 案例 1：小行星射击游戏——ECS 基础拆解

用 Bevy 实现经典小行星游戏，展示 ECS 分工：

```rust
#[derive(Component)] struct Asteroid;
#[derive(Component)] struct Bullet;
#[derive(Component)] struct Velocity { dx: f32, dy: f32 }
#[derive(Component)] struct Position { x: f32, y: f32 }

// 移动系统：对所有有 Position + Velocity 的实体生效
fn move_entities(mut query: Query<(&mut Position, &Velocity)>) {
    for (mut pos, vel) in &mut query {
        pos.x += vel.dx;
        pos.y += vel.dy;
    }
}

// 碰撞系统：子弹 vs 小行星
fn check_collisions(
    bullets: Query<(Entity, &Position), With<Bullet>>,
    asteroids: Query<(Entity, &Position), With<Asteroid>>,
    mut commands: Commands,
) {
    for (bullet_e, bpos) in &bullets {
        for (asteroid_e, apos) in &asteroids {
            let dist = ((bpos.x - apos.x).powi(2) + (bpos.y - apos.y).powi(2)).sqrt();
            if dist < 20.0 {
                commands.entity(bullet_e).despawn();
                commands.entity(asteroid_e).despawn();
            }
        }
    }
}
```

**逐部分解释**：
- `With<Bullet>` 是过滤器：只查有 `Bullet` 标记的实体，即使它们也有 `Position`
- `commands.entity(...).despawn()` 不会立即销毁，Bevy 在本帧结束统一处理
- `move_entities` 和 `check_collisions` 会被 Bevy 自动并行（无共享可变数据）
- 碰撞检测用了 O(n²) 双重循环——教学简化版，实际项目通常接 `bevy_rapier` 等物理引擎做空间加速

### 案例 2：用 Resource 做全局状态——得分系统

`Resource` 是 ECS 世界里的"全局单例"，不属于任何 Entity：

```rust
#[derive(Resource, Default)]
struct Score(u32);

#[derive(Event)]
struct CollisionEvent;  // 需要 #[derive(Event)] 才能用 EventReader / EventWriter

fn update_score(
    mut score: ResMut<Score>,
    mut collision_events: EventReader<CollisionEvent>,
) {
    for _ in collision_events.read() {
        score.0 += 10;
    }
}

fn display_score(score: Res<Score>) {
    println!("当前得分: {}", score.0);
}

fn main() {
    App::new()
        .add_plugins(DefaultPlugins)
        .init_resource::<Score>()
        .add_event::<CollisionEvent>()
        .add_systems(Update, (update_score, display_score).chain())
        .run();
}
```

**逐部分解释**：
- `Res<Score>` 是只读访问，`ResMut<Score>` 是可写访问——Bevy 用类型区分读写
- `EventReader` + `EventWriter` 是 Bevy 的消息总线，System 之间解耦通信
- `.chain()` 保证 `update_score` 一定在 `display_score` 之前运行

### 案例 3：States 状态机——主菜单与游戏切换

以下代码基于 **Bevy 0.15+**（0.14 及更早版本用 `TextBundle::from_section` 替换 `Text::new`）：

```rust
#[derive(States, Default, Debug, Clone, PartialEq, Eq, Hash)]
enum GameState { #[default] Menu, Playing, Paused }

fn setup_menu(mut commands: Commands) {
    commands.spawn(Text::new("按空格开始"));  // Bevy 0.15+ API
}

fn start_game(
    keys: Res<ButtonInput<KeyCode>>,
    mut next: ResMut<NextState<GameState>>,
) {
    if keys.just_pressed(KeyCode::Space) {
        next.set(GameState::Playing);
    }
}

fn main() {
    App::new()
        .add_plugins(DefaultPlugins)
        .init_state::<GameState>()
        .add_systems(OnEnter(GameState::Menu), setup_menu)
        .add_systems(Update, start_game.run_if(in_state(GameState::Menu)))
        .run();
}
```

**逐部分解释**：
- `OnEnter(GameState::Menu)` 是进入状态时只跑一次的 System——类似构造函数
- `run_if(in_state(...))` 是 System 条件运行的过滤器，不在对应状态时直接跳过
- 切换状态后 Bevy 会自动清理带 `StateScoped` 标记的实体，防止场景残留

## 踩过的坑

1. **API 破坏性变更频繁**：Bevy 约每季度发一个含 breaking change 的版本。搜到的教程如果没写版本号很可能已经过时——优先看官方 Migration Guide，不要直接用两年前的示例代码。

2. **冷编译极慢**：第一次 `cargo build` 可能花 3-5 分钟，因为依赖树庞大。解决方案：在 `Cargo.toml` 里加 `bevy = { features = ["dynamic_linking"] }` 并用 `cargo run` 而非 `cargo build`，能把增量编译压到 5 秒以内。

3. **多个可变 Query 相同 Component 会 panic**：同一个 System 里两个 Query 都写同一个 Component，Bevy 在运行时检测到后会直接 panic（而非编译错误）。解法：把两个 Query 合并成一个，或用 `ParamSet` 显式声明它们不会同时借用。

4. **没有成熟可视化编辑器**：Bevy 目前无官方 Level Editor（0.15 时代），复杂场景需要手写场景描述文件或使用 `bevy_editor_pls` 等社区工具。游戏原型快速迭代时这是最大的痛点。

## 适用 vs 不适用场景

**适用**：
- 用 Rust 从零搭建独立游戏，尤其是 2D 像素游戏 / 策略游戏 / 模拟类游戏
- 非游戏的实时数据可视化工具（地图渲染、传感器可视化）
- 对性能敏感、希望精确控制并发调度的应用
- 学习 ECS 架构的工程师——Bevy 的 API 是目前最易读的 ECS 实现之一

**不适用**：
- 需要成熟编辑器工作流的 AAA 游戏开发——Unity / Unreal 的工具链成熟度差距巨大
- 团队没有 Rust 经验且时间紧——Rust 学习曲线 + Bevy API 变化双重压力
- 移动端首选——Bevy 的移动端支持（iOS / Android）仍在 alpha 阶段
- 需要大量现成 3D 资产管线（FBX 动画、骨骼蒙皮）——Bevy 的 3D 动画系统仍不完整

## 历史小故事（可跳过）

- **2020 年 8 月**：Carter Anderson 在博客宣布 Bevy 0.1，同一天 GitHub 冲上 Trending，单日获 3k Stars——当时 Rust 游戏社区为之沸腾，因为此前最成熟的 Rust 引擎 Amethyst 代码量巨大、上手极难
- **2021 年**：Bevy 1 周年，Stars 突破 10k，社区形成了"每季度发版 + Migration Guide"的稳定节奏，成为 Rust 游戏生态事实标准
- **2022-2023 年**：引入 Stageless Schedule（System 调度重构）、ECS relations 讨论激烈——这段时间 API 变化最剧烈，老教程失效率最高
- **2024 年**：Bevy 0.14 带来了 Required Components（必须依赖组件自动添加）、改善的 3D 照明——Stars 突破 35k，开始在独立游戏作品集里频繁出现
- **至今**：社区 crate 生态（bevy_rapier 物理、bevy_egui UI、Avian physics）形成完整插件层，插件模块化是 Bevy 最被称道的设计之一

## 学到什么

1. **数据和行为分离是可扩展性的关键**——ECS 强制你把"这个东西是什么"（Component）和"这个东西能做什么"（System）彻底解耦，新增功能时只加新的 Component + System，不用改已有代码
2. **内存布局决定性能上限**——相同类型 Component 连续存储（SoA 布局）让 CPU 缓存命中率显著提升，这是 ECS 相比传统 OOP 游戏对象在大量实体场景下快 5-10x 的根本原因
3. **类型系统可以是调度器**——Bevy 通过分析 System 函数签名里的 `Query` 类型参数，在编译期推断数据依赖图，自动调度并行——Rust 的类型系统不只是防 bug，还能干这种基础设施的活
4. **开源 + 模块化的边界效应**：Bevy 把引擎的每个子系统（渲染、窗口、输入、音频）都设计成独立 Plugin，用户可以替换任意一个。这种设计让 Bevy 成为了教材级的"如何设计可插拔系统"样本

## 延伸阅读

- 官方快速入门：[Bevy Quick Start Guide](https://bevy.org/learn/quick-start/introduction)（官方最权威，随版本更新）
- 社区书：[Unofficial Bevy Cheat Book](https://bevy-cheatbook.github.io/)（覆盖最全，中高阶问题首选查阅）
- ECS 理论背景：[Understanding ECS — Catherine West RustConf 2018](https://www.youtube.com/watch?v=aKLntZcp27M)（讲清楚为什么 ECS 比 OOP 更适合游戏，20 分钟）
- WGPU 底层：[wgpu 官方教程](https://sotrh.github.io/learn-wgpu/)（理解 Bevy 渲染层依赖的 GPU 抽象）
- [[sycl-cpp-2020]] —— SYCL 是另一种跨平台 GPU 抽象方案，对比 WGPU 理解 GPU 编程统一化趋势

## 关联

- [[sycl-cpp-2020]] —— WGPU（Bevy 的渲染后端）和 SYCL 都在解决"一份代码跑多种 GPU API"问题，路径不同
- [[warp]] —— 同为 Rust 生态的代表项目，Bevy 和 Warp 都展示了 Rust 类型系统如何成为框架设计语言
- [[nix]] —— Bevy 项目开发环境管理首选 Nix，可重现地锁定 Rust 工具链版本，避免 Bevy 升级时环境不一致

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[minetest]] —— Luanti / Minetest — 给自己造一个开源体素游戏引擎
- [[nix]] —— Nix — 函数式声明式包管理与可重复构建
- [[openrct2]] —— OpenRCT2 — 把一款 x86 汇编游戏彻底用 C++ 重写
- [[warp]] —— warp — Rust 里把请求处理拼成 Filter 积木的 web 框架

