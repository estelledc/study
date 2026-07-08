---
title: Godot — 开源游戏引擎和编辑器
来源: 'https://github.com/godotengine/godot'
日期: 2026-07-08
分类: editors
难度: 初级
---

## 是什么

Godot 是一个把 2D、3D、脚本、动画、物理、导出都放在同一个编辑器里的开源游戏引擎。

日常类比：如果做游戏像开一家小剧场，Godot 就是舞台、灯光台、演员调度表和排练室合在一起；你不用先租十个工具，先把角色放上舞台跑起来。

它最特别的入口不是“先写一堆框架代码”，而是“先搭节点树”：一个角色、摄像机、碰撞框、文字按钮，都可以是节点。

最小脚本长这样：

```gdscript
extends Sprite2D

func _process(delta):
    rotation += PI * delta
```

这段代码的意思是：这个脚本挂在 `Sprite2D` 节点上，每一帧把图片转一点；`delta` 用来抵消不同电脑帧率差异。

## 为什么重要

不理解 Godot，下面这些事会很难解释：

- 为什么很多独立游戏开发者可以一个人从原型做到导出，而不是先搭庞大的自研工具链。
- 为什么 Godot 项目常说“节点和场景”，而不是一上来就说“类继承树”或“ECS”。
- 为什么 GDScript 看起来像 Python，却能直接操作编辑器里的节点、信号、动画和物理对象。
- 为什么开源游戏引擎的许可证会影响商业游戏：Godot 用 MIT 许可证，没有版税绑定。

## 核心要点

1. **节点是零件**：`Sprite2D` 显示图片，`Area2D` 负责检测区域，`Timer` 定时触发事件。类比：搭积木时每块积木功能很窄，组合起来才像房子。

2. **场景是可复用的小舞台**：玩家、怪物、按钮菜单都可以各自做成场景，再被主场景实例化。类比：先排好一个演员的动作模板，上台时复制一个演员实例。

3. **信号让对象少互相硬绑**：按钮按下、身体进入碰撞区、定时器到点，都可以发信号。类比：门铃响了，屋里的人决定开门；门铃不需要知道谁会来开。

## 实践案例

### 案例 1：让一个图片每帧移动

官方“第一个脚本”教程用 `Sprite2D` 展示了最小的游戏循环：

```gdscript
extends Sprite2D

var speed = 400
var angular_speed = PI

func _process(delta):
    rotation += angular_speed * delta
    var velocity = Vector2.UP.rotated(rotation) * speed
    position += velocity * delta
```

逐部分解释：

- `extends Sprite2D`：说明脚本挂在一个图片节点上。
- `_process(delta)`：每一帧都会被引擎调用。
- `Vector2.UP.rotated(rotation)`：先取“向上”的方向，再按当前旋转角度转过去。
- `position += ... * delta`：按时间移动，不按帧数移动，低帧率时也不会慢一半。

这个案例适合理解 Godot 的第一层：节点不是死素材，脚本挂上去以后它就会在场景树里“活起来”。

### 案例 2：读取方向键移动玩家

官方 2D 入门游戏里，玩家节点用输入动作控制移动：

```gdscript
extends Area2D

@export var speed = 400
var screen_size

func _ready():
    screen_size = get_viewport_rect().size

func _process(delta):
    var velocity = Vector2.ZERO
    if Input.is_action_pressed("move_right"):
        velocity.x += 1
    if Input.is_action_pressed("move_left"):
        velocity.x -= 1
    if Input.is_action_pressed("move_down"):
        velocity.y += 1
    if Input.is_action_pressed("move_up"):
        velocity.y -= 1

    if velocity.length() > 0:
        velocity = velocity.normalized() * speed
    position += velocity * delta
    position = position.clamp(Vector2.ZERO, screen_size)
```

逐部分解释：

- `@export var speed = 400`：把速度暴露到编辑器 Inspector，方便不改代码调参数。
- `Input.is_action_pressed(...)`：读取项目设置里的输入动作，而不是死写某个键盘键。
- `normalized()`：斜着走时也保持同样速度，不会因为 x 和 y 同时有值而更快。
- `clamp(...)`：把玩家限制在屏幕范围内，避免跑出可见区域。

这个案例是真实游戏开发里最常见的姿势：用编辑器配置资源，用脚本描述行为。

### 案例 3：用场景实例化刷怪

官方 2D 入门游戏的主场景会在定时器触发时生成怪物：

```gdscript
@export var mob_scene: PackedScene

func _on_mob_timer_timeout():
    var mob = mob_scene.instantiate()
    var spawn = $MobPath/MobSpawnLocation
    spawn.progress_ratio = randf()
    mob.position = spawn.position
    add_child(mob)
```

逐部分解释：

- `PackedScene`：不是一个已经在场上的怪物，而是一张“怪物蓝图”。
- `instantiate()`：按蓝图造出一个新的怪物实例。
- `$MobPath/MobSpawnLocation`：从当前节点按路径找到子节点。
- `add_child(mob)`：把新怪物放进场景树；不加入树，它就不会参与更新和绘制。

这个案例说明 Godot 的核心设计：做一份场景模板，在运行时把它变成很多个游戏对象。

## 踩过的坑

1. **节点名大小写写错**：`$AnimatedSprite2D` 找的是精确节点路径，名字不一致就会得到空对象。

2. **忘记乘 `delta`**：每帧直接 `position += speed` 会让高帧率机器跑得更快，因为移动和帧数绑死了。

3. **碰撞回调里立刻改物理状态**：物理系统正在结算时直接关碰撞可能报错，常见做法是用延迟设置。

4. **把所有逻辑塞进一个主节点**：短期看省事，后面换关卡、复用敌人、测试 UI 都会互相牵连。

## 适用 vs 不适用场景

**适用**：

- 独立游戏、Game Jam、教学项目，需要快速把想法变成可玩的原型。
- 2D 游戏，尤其是角色移动、碰撞、TileMap、UI 和动画都需要一起做的项目。
- 想要完整编辑器，但又希望引擎本身开源、无版税、社区可参与。
- 小团队同时做脚本、关卡、动画和导出，不想自己维护一整套工具链。

**不适用**：

- 已经深度绑定某个商业引擎生态、资产商店和团队管线的大型项目。
- 需要最顶级写实 3D 渲染、重资产电影级流程，且团队已有成熟专用工具。
- 只想写一个极小网页动画或普通业务 UI，游戏引擎反而会太重。
- 完全不愿意理解节点树、信号和资源导入流程，只想写纯代码脚本。

## 历史小故事（可跳过）

- **多年前**：Juan Linietsky 和 Ariel Manzur 先把 Godot 当内部引擎使用，服务外包游戏项目。
- **2014 年**：Godot 开源，社区开始围绕编辑器、文档、示例和平台导出持续扩展。
- **后来**：Godot Foundation 支撑项目治理，开发逐渐变成社区驱动的长期协作。
- **到 2026 年**：GitHub 上已经是十万 star 量级项目，README 也强调 2D/3D 统一界面、MIT 许可证和多平台导出。

## 学到什么

- Godot 的入口是“把游戏拆成节点和场景”，不是先背一套庞大的引擎术语。
- GDScript 的价值在于贴近编辑器对象：节点、信号、资源、Inspector 都能顺着脚本连起来。
- 场景实例化让“做一个怪物模板，再生成很多怪物”变成一等公民。
- 开源许可证和社区治理不是背景信息，它们会影响商业发布、学习成本和长期可维护性。

## 延伸阅读

- 官方仓库：[godotengine/godot](https://github.com/godotengine/godot)
- 官方文档：[Godot Docs](https://docs.godotengine.org)
- 入门教程：[Your first 2D game](https://docs.godotengine.org/en/latest/getting_started/first_2d_game/index.html)
- 官方示例：[godot-demo-projects](https://github.com/godotengine/godot-demo-projects)
- [[phaser]] —— Web 2D 游戏框架，适合和 Godot 的编辑器路线对照。

## 关联

- [[phaser]] —— 都服务游戏开发，但 Phaser 更偏浏览器 2D 代码框架。
- [[pixi]] —— Pixi 负责 Web 2D 渲染，Godot 则把编辑器、物理和导出也包进来。
- [[unity]] —— 同样是游戏引擎，对比能看出商业生态和开源治理的差异。
- [[blender]] —— 都是创作者工具，Godot 偏运行时游戏，Blender 偏建模和动画资产。
- [[ecs]] —— Godot 官方更偏节点树和面向对象组合，不强制 ECS 思路。
- [[gdscript]] —— Godot 的贴身脚本语言，围绕节点、信号和资源设计。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
