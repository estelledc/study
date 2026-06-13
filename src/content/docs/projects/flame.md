---
title: Flame — Flutter 上的 2D 游戏引擎
来源: flame-engine/flame
日期: 2026-06-13
子分类: 移动端
分类: 后端 API
难度: 中级
provenance: pipeline-v3
---

## 日常类比：Flame 是「Flutter 游乐园里的游乐设施调度中心」

你已经会用 Flutter 搭界面——按钮、列表、路由都像商场里的固定店铺，顾客点哪开哪。  
但**游戏**不一样：角色要每帧移动、子弹要实时碰撞、敌人要定时刷新，整栋楼得有一个**中央调度台**不停喊「下一帧开始了，各就各位」。

**Flame** 就是这个调度台。它跑在 Flutter 之上，提供游戏循环、组件树、碰撞检测、输入、粒子、音效等 2D 游戏专用能力。日常类比：

- **Flutter `Widget` 树** → 商场装修图纸，改一次要整页重画  
- **Flame `Component` 树** → 游乐园里的设施清单，每个设施自己更新位置、自己画自己  
- **`GameWidget`** → 把游乐园嵌进 Flutter App 的那块地  
- **`FlameGame`** → 调度中心主任，掌管 tick 时钟和全场组件

你仍然用 Dart 写逻辑、仍然能热重载、仍然能打包 iOS / Android / Web / Desktop——只是从「做 App」切换成「做游戏」。

| 维度 | 数据 |
|---|---|
| GitHub | [flame-engine/flame](https://github.com/flame-engine/flame) |
| 文档 | [docs.flame-engine.org](https://docs.flame-engine.org/) |
| 协议 | MIT |
| 语言 | Dart（依赖 Flutter SDK） |
| 定位 | 轻量 2D 游戏引擎，不是 3D 引擎 |
| 生态 | `flame_audio`、`flame_tiled`、`flame_forge2d`（物理）、`flame_riverpod` 等 Bridge 包 |

---

## 解决什么问题：Flutter 默认不管「实时游戏」

Flutter 的强项是**声明式 UI**：`build()` 根据状态描述界面，框架负责 diff 和重绘。这对表单、信息流、仪表盘很合适，但对游戏有三个硬伤：

1. **没有稳定的高频游戏循环**  
   游戏需要以固定节奏（通常 60fps）反复执行「算物理 → 改坐标 → 画画面」。Flutter 的 `AnimationController` 能驱动局部动画，却不会像引擎那样统一管理全局 tick。

2. **没有面向游戏的对象模型**  
   Widget 不可变、重建成本高；游戏里却有几十上百个会动、会死、会碰撞的实体。每个实体都需要 `update(dt)` 和 `render(canvas)`，而不是 `setState()`。

3. **缺少碰撞、精灵、相机、粒子等游戏原语**  
   自己用 `CustomPainter` + 定时器也能拼，但 Hitbox 管理、碰撞回调、精灵表动画、世界坐标与相机变换，全是重复劳动。

Flame 把这些抽成 **Flame Component System（FCS）**：

- `FlameGame` 持有一棵 Component 树，每帧遍历调用 `update` / `render`  
- `SpriteComponent`、`PositionComponent`、`TextComponent` 等开箱即用  
- `HasCollisionDetection` + `CollisionCallbacks` 提供 Hitbox 与碰撞事件  
- `CameraComponent` / `World` 分离「游戏世界」与「镜头」  
- 可与 Flutter `Overlay` 混用——游戏里打怪，菜单用 Material 按钮

一句话：**Flutter 给你跨平台画布，Flame 在上面铺游戏跑道。**

---

## 核心概念

### 1. Component — 游戏里的「自更新零件」

Component 是 Flame 的基本单元，类似 Flutter 的 Widget，但语义不同：

| 对比 | Flutter Widget | Flame Component |
|---|---|---|
| 生命周期 | `build()` 描述 UI | `onLoad()` 异步加载资源 |
| 每帧行为 | 被动等框架重建 | 主动 `update(dt)` 改状态 |
| 绘制 | RenderObject 管线 | `render(canvas)` 或子类自带绘制 |
| 组合 | `child:` 嵌套 | `add(child)` 挂到树上 |

常见子类：

- `SpriteComponent` — 贴图精灵  
- `PositionComponent` — 带位置、尺寸、旋转的容器  
- `TextComponent` — 游戏内文字（分数、提示）  
- `World` — 游戏世界容器，默认挂在 `FlameGame.world`  
- `CameraComponent` — 镜头，决定「看世界的哪个角落」

组件通过 `add()` / `remove()` 动态进出场景。`onLoad()` 里适合 `await loadSprite()`、`add(CircleHitbox())` 等一次性初始化——类比演员上台前化妆，而不是每帧重画。

优先级 `priority` 控制绘制顺序：数值大的后画，压在下面。

### 2. GameLoop — 驱动一切的 tick 时钟

游戏循环是两步交替：

```
update(dt)  →  根据上一帧经过的秒数 dt 推进逻辑（移动、计时、AI）
render()    →  把当前状态画到 Canvas
```

`dt`（delta time）至关重要：位移应写成 `position += velocity * dt`，这样 30fps 和 120fps 设备上角色速度一致——和 LÖVE、Unity 同一道理。

Flame 的 `GameLoop` 模块抽象了上述循环，所有 `Game` 实现都依赖它。`FlameGame` 每 tick 会：

1. 调 `updateTree(dt)` — 递归更新所有 mounted 组件  
2. 调 `renderTree(canvas)` — 按 priority 递归绘制  

生命周期顺序（简化）：

```
onGameResize → onLoad → onMount → (update → render)* → onRemove
```

`GameWidget(game: myGame)` 把 `FlameGame` 嵌进 Flutter 树。注意：**不要在 `build()` 里每次 `new FlameGame()`**，应缓存实例或用 `GameWidget.controlled`，否则热重载/重建会丢游戏状态。

### 3. 碰撞检测 — Hitbox + 回调，不管「碰撞后发生什么」

几乎所有游戏都要回答：「这两个物体重叠了吗？」没有碰撞检测，玩家穿墙、子弹打不中、金币捡不到。

Flame 的做法：

1. 在 `FlameGame` 上混入 `HasCollisionDetection` — 引擎维护可碰撞组件列表  
2. 在实体上 `add(RectangleHitbox())` / `CircleHitbox()` / `PolygonHitbox()` — 定义物理边界  
3. 在实体上混入 `CollisionCallbacks` — 接收 `onCollisionStart` / `onCollision` / `onCollisionEnd`  

要点：

- **可见 ≠ 可碰撞**：贴了图还要加 Hitbox，引擎才知道边界在哪  
- **检测与响应分离**：Flame 只告诉你「谁碰了谁」，扣血、反弹、销毁由你在回调里写  
- **每帧扫描**：碰撞在 `update` 阶段检测；用 `onCollisionStart` 可避免重叠期间每帧重复触发 Game Over  
- **大量物体**：可换 `HasQuadTreeCollisionDetection` 做空间划分优化  
- **屏幕边缘**：`add(ScreenHitbox())` 让物体碰边时收到回调

Hitbox 形状越贴合物体，检测越准，但计算越贵。平台游戏常用矩形，弹球、轨道类用圆形。

---

## 最小可运行骨架

`pubspec.yaml` 添加依赖后，入口通常长这样：

```dart
import 'package:flame/game.dart';
import 'package:flutter/material.dart';

void main() {
  runApp(
    GameWidget(
      game: StarCollectorGame(),
    ),
  );
}

class StarCollectorGame extends FlameGame {
  @override
  Future<void> onLoad() async {
    // 加载精灵、添加玩家/敌人/相机/摇杆……
  }
}
```

`FlameGame` 约等于 Flutter 里的 `MaterialApp`：一切的根。子组件加在 `world`（默认 `World` 实例）或 `camera` 上，取决于要不要随镜头移动。

---

## 实践案例

### 案例 1：弹球碰壁 — 理解 GameLoop + Component + 碰撞

Google Codelab「Brick Breaker」式最小示例：球在矩形场地内弹跳，碰墙反弹，碰底销毁。

```dart
import 'package:flame/collisions.dart';
import 'package:flame/components.dart';
import 'package:flame/game.dart';
import 'package:flutter/material.dart';

class BounceGame extends FlameGame with HasCollisionDetection {
  @override
  Future<void> onLoad() async {
    add(PlayArea());
    add(Ball(velocity: Vector2(180, -140))..position = size / 2);
  }
}

/// 场地边界——只提供碰撞形状，不负责画
class PlayArea extends PositionComponent with CollisionCallbacks {
  @override
  Future<void> onLoad() async {
    size = parent!.size;
    add(RectangleHitbox());
  }
}

class Ball extends CircleComponent
    with CollisionCallbacks, HasGameReference<BounceGame> {
  Ball({required this.velocity}) : super(radius: 10);

  Vector2 velocity;

  @override
  Future<void> onLoad() async {
    paint = Paint()..color = const Color(0xFF1E6091);
    add(CircleHitbox());
  }

  @override
  void update(double dt) {
    position += velocity * dt; // dt 保证各帧速度一致
  }

  @override
  void onCollisionStart(
    Set<Vector2> intersectionPoints,
    PositionComponent other,
  ) {
    if (other is PlayArea) {
      final p = intersectionPoints.first;
      if (p.y <= 0 || p.y >= game.size.y) velocity.y = -velocity.y;
      if (p.x <= 0 || p.x >= game.size.x) velocity.x = -velocity.x;
      if (p.y >= game.size.y) removeFromParent(); // 落底出局
    }
  }
}
```

**逐段解释**：

- `HasCollisionDetection` 挂在 Game 上，全局开启碰撞系统  
- `Ball.update(dt)` 每帧改 `position`，这是 GameLoop 驱动的逻辑层  
- `CircleHitbox` 让圆「有实体」，否则引擎当它是幽灵  
- `onCollisionStart` 读交点坐标判断碰的是哪条边，改 `velocity` 实现反弹  
- 碰撞响应（反弹/销毁）写在你手里，Flame 只报相交

### 案例 2：轨道吃豆 — 定时刷怪 + 碰撞 Game Over + Flutter Overlay

改编自社区教程「Neon Orbit」思路：玩家沿圆轨道运动，点击切换内外轨，敌人撞上即暂停并弹出 Flutter 重开按钮。

```dart
import 'dart:math';
import 'package:flame/collisions.dart';
import 'package:flame/components.dart';
import 'package:flame/events.dart';
import 'package:flame/game.dart';
import 'package:flutter/material.dart';

class OrbitGame extends FlameGame with TapCallbacks, HasCollisionDetection {
  late Player player;
  double spawnTimer = 0;

  @override
  Future<void> onLoad() async {
    player = Player();
    add(player);
  }

  @override
  void update(double dt) {
    super.update(dt);
    spawnTimer += dt;
    if (spawnTimer > 1.2) {
      spawnTimer = 0;
      add(Enemy()..position = Vector2(size.x / 2, 40));
    }
  }

  @override
  void onTapDown(TapDownEvent event) => player.toggleOrbit();
}

class Player extends CircleComponent
    with CollisionCallbacks, HasGameReference<OrbitGame> {
  double angle = 0;
  double orbitRadius = 120;
  final double speed = 2.5;

  @override
  Future<void> onLoad() async {
    radius = 14;
    paint = Paint()..color = Colors.cyanAccent;
    add(CircleHitbox());
  }

  @override
  void update(double dt) {
    angle += speed * dt;
    position = Vector2(
      game.size.x / 2 + cos(angle) * orbitRadius,
      game.size.y / 2 + sin(angle) * orbitRadius,
    );
  }

  void toggleOrbit() => orbitRadius = orbitRadius == 120 ? 200 : 120;

  @override
  void onCollisionStart(
    Set<Vector2> intersectionPoints,
    PositionComponent other,
  ) {
    if (other is Enemy) {
      pauseEngine();
      game.overlays.add('GameOver'); // Flutter Overlay，不是 Flame 组件
    }
  }
}

class Enemy extends CircleComponent with CollisionCallbacks {
  @override
  Future<void> onLoad() async {
    radius = 10;
    paint = Paint()..color = Colors.orange;
    add(CircleHitbox());
  }

  @override
  void update(double dt) {
    position.y += 80 * dt;
    if (position.y > parent!.size.y + 20) removeFromParent();
  }
}
```

`main.dart` 里用 `GameWidget.controlled` 注册 overlay：

```dart
GameWidget<OrbitGame>.controlled(
  gameFactory: OrbitGame.new,
  overlayBuilderMap: {
    'GameOver': (context, game) => Center(
      child: ElevatedButton(
        onPressed: () {
          game.overlays.remove('GameOver');
          game.resumeEngine();
          game.children.whereType<Enemy>().forEach((e) => e.removeFromParent());
        },
        child: const Text('再来一局'),
      ),
    ),
  },
)
```

**要点**：

- `update` 里用 `dt` 累加刷怪计时器——游戏逻辑的「心跳」  
- `pauseEngine()` / `resumeEngine()` 冻结 GameLoop，菜单仍可用 Flutter 画  
- `overlays` 是 Flame 与 Flutter 的桥梁：HUD、暂停页、结算页用 Widget 更合适  
- 双方都有 `CircleHitbox` 才能碰撞；`onCollisionStart` 只触发一次，避免连续扣血

---

## 生态与扩展包

Flame 本体保持精简，复杂能力由官方 Bridge 包补充：

| 包 | 用途 |
|---|---|
| `flame_audio` | BGM / 音效 |
| `flame_tiled` | 读取 Tiled 编辑器导出的 `.tmx` 地图 |
| `flame_forge2d` | Box2D 刚体物理（重力、关节、复杂碰撞） |
| `flame_riverpod` / `flame_bloc` | 与常用状态管理集成 |
| `flame_spine` | Spine 骨骼动画 |

选型建议：简单 AABB / 圆形碰撞用内置 `collision_detection` 足够；需要堆叠、弹射、绳索用 `forge2d`。

---

## 与同类方案对比

| 方案 | 优势 | 劣势 |
|---|---|---|
| **Flame + Flutter** | 同一技术栈做 App 内小游戏、全平台、热重载 | 包体积随 Flutter；重度 3D 不适合 |
| **Unity / Godot** | 成熟编辑器、3D、资源商店 | 与 Flutter 主工程割裂，嵌入成本高 |
| **纯 Flutter CustomPainter** | 零额外依赖 | 循环、碰撞、精灵全要自己造 |
| **LÖVE / MonoGame** | 轻、专注 2D | 不能复用 Flutter UI 与发布流水线 |

若你已经在做 Flutter App，要在设置页塞一个小游戏、或做教育类互动关卡，Flame 几乎是最顺手的增量。

---

## 上手路径（零基础到可发布）

1. **环境**：`flutter create my_game` → `pubspec.yaml` 加 `flame: ^1.x`  
2. **第一个场景**：`GameWidget` + 空 `FlameGame`，`onLoad` 里 `add(TextComponent(text: 'Hello Flame'))`  
3. **动起来**：自定义 `PositionComponent`，在 `update(dt)` 里改 `position`  
4. **贴图**：`await loadSprite('player.png')` → `SpriteComponent`  
5. **输入**：混入 `TapCallbacks` / `KeyboardHandler` / `JoystickComponent`  
6. **碰撞**：`HasCollisionDetection` + Hitbox + `CollisionCallbacks`  
7. **关卡**：`flame_tiled` 导入地图碰撞层  
8. **打磨**：`flame_audio` 音效、`ParticleSystemComponent` 粒子、`Effect` 做闪烁淡入  
9. **发布**：走正常 `flutter build apk/ios/web` 流程

官方资源：

- [Flame 文档](https://docs.flame-engine.org/)  
- [Google Codelab: Brick Breaker](https://codelabs.developers.google.com/codelabs/flutter-flame-brick-breaker)  
- [Ember Quest 平台跳跃教程](https://docs.flame-engine.org/latest/tutorials/platformer/platformer.html)  
- [examples 仓库](https://github.com/flame-engine/flame/tree/main/examples) 含碰撞、相机、粒子等可运行 demo

---

## 常见坑

1. **在 `build()` 里创建 `FlameGame`** — 每次重建丢状态；用成员变量或 `GameWidget.controlled`  
2. **忘了 `dt`** — 写 `position += velocity` 帧率越高越快  
3. **有图无 Hitbox** — 视觉上重叠，引擎不触发回调  
4. **`onCollision` 里做一次性逻辑** — 重叠期每帧触发；用 `onCollisionStart`  
5. **资源路径** — 精灵放 `assets/images/`，`pubspec.yaml` 声明 `assets:`，`onLoad` 里异步加载  
6. **坐标系** — Flame 默认原点在左上，y 向下；相机 `viewfinder` 可改锚点

---

## 小结

Flame 把 Flutter 变成能跑实时 2D 游戏的平台：**`FlameGame` 掌管 GameLoop，`Component` 树承载可更新实体，`HasCollisionDetection` + Hitbox 解决「谁碰到谁」**。你专注玩法和手感，引擎负责 tick、绘制顺序和碰撞扫描。

从「会 Flutter」到「会做小游戏」，通常只差一个 `GameWidget` 和第一个 `update(dt)`。
