---
title: Godot Engine — 开源游戏引擎 + 编辑器
来源: 'https://github.com/godotengine/godot'
日期: 2026-06-13
分类: CLI
子分类: 前端框架
provenance: pipeline-v3
难度: 初级
---

## 是什么

Godot Engine 是一个**完全免费、开源**的 2D/3D 游戏引擎，自带可视化编辑器。日常类比：它像一间「自带工具台的乐高工作室」——不仅有积木（节点），还有图纸（场景）、接线板（信号）和整面墙的工作台（编辑器）。你拖积木、连线路、写几行脚本，就能从空白项目跑到可玩的原型。

和「只给 API、自己搭编辑器」的框架不同，Godot 把**引擎运行时**和**场景编辑器**打包在一起。游戏由**场景（Scene）**组成，场景是**节点（Node）**的树；脚本挂在节点上，节点之间用**信号（Signal）**通信。项目文件以 `.tscn`（场景）和 `.gd`（GDScript）为主，一键导出到 Windows、macOS、Linux、Android、iOS 和 Web。

GitHub 主仓库 [godotengine/godot](https://github.com/godotengine/godot) 超过 10 万 star，采用 MIT 协议，无分成、无订阅费，商业发行也不额外收费。当前稳定线以 **Godot 4.6.x** 为主（Vulkan 3D、独立 2D 渲染器、移动端编辑器也在迭代）。

## 为什么重要

不了解 Godot，下面这些事都难以解释：

- 为什么 indie 开发者能在**零授权费**前提下做出接近商业品质的 2D/3D 游戏——引擎与编辑器一体，迭代成本极低
- 为什么「场景可嵌套、可实例化」能替代大量复制粘贴——一个 `Player.tscn` 拖进关卡就能生成多个玩家实例
- 为什么游戏逻辑推荐**信号驱动**而非到处 `get_node()`——松耦合让改 UI 布局时不必重写半个项目
- 为什么 Godot 4 用 **Vulkan** 做 3D、独立 **2D 渲染器**——2D 用真实像素坐标，不和 3D 管线硬绑

## 核心要点

### 1. 节点（Node）——最小积木

节点是 Godot 里最小的功能单元。每个节点只做一件事：`Sprite2D` 显示图片，`AudioStreamPlayer` 播放声音，`CollisionShape2D` 定义碰撞形状。节点按父子关系组成**树**：子节点继承父节点的变换（位置、旋转、缩放）。

典型 2D 角色场景结构：

```
Player (CharacterBody2D)     ← 根节点，负责移动与物理
├── Sprite2D                 ← 显示角色贴图
├── CollisionShape2D         ← 碰撞体积
└── Camera2D                 ← 跟随玩家的镜头（也可放在关卡里）
```

### 2. 场景（Scene）——可复用的蓝图

把一棵节点树保存下来，就得到一个场景文件（`.tscn`）。场景既是「关卡」，也是「预制件」：玩家、敌人、子弹、主菜单都可以是独立场景。在编辑器里把 `Enemy.tscn` 拖进 `Level.tscn`，会生成一个**实例**——改蓝图会影响所有实例，但每个实例也能单独改属性。

### 3. 场景树（Scene Tree）——运行时的整棵世界

游戏启动时，Godot 加载**主场景（Main Scene）**，把它挂到根 `Viewport` 下，整棵树的节点进入「激活」状态，开始接收 `_process`、绘制、输入和物理。`get_tree()` 可以暂停游戏、切换场景、按组（Group）批量找节点。

### 4. 信号（Signal）——事件广播

节点在特定事件发生时**发射信号**（如按钮 `pressed`、角色 `died`）。其他节点**连接**到这个信号，绑定回调函数，无需硬编码引用路径。类比：不是挨家敲门通知，而是在小区群里发一条「Boss 已击败」，谁订阅了谁就响应。

### 5. 资源（Resource）——可序列化的数据块

Resource 是 Godot 里**不挂在场景树上、但可以保存到磁盘**的数据对象：贴图（`Texture2D`）、音频（`AudioStream`）、自定义角色属性表都可以是 Resource。类比：节点是「舞台上的演员」，Resource 是「演员档案卡」——多张卡可以分给多个演员，改档案会影响所有引用它的对象。

自定义 Resource 可在编辑器里当资产拖拽使用：

```gdscript
# stats.gd — 新建 Resource，保存为 stats.tres
class_name CharacterStats
extends Resource

@export var max_hp: int = 100
@export var attack: int = 10
```

在 Player 节点的检查器里把 `stats.tres` 拖给 `@export var stats: CharacterStats`，策划调数值不用碰代码。Resource 也适合替代「全局 Autoload 里堆一堆变量」——数据可版本管理、可复用、静态类型友好。

### 6. GDScript——为游戏定制的脚本语言

GDScript 语法接近 Python，但为 Godot 节点生命周期设计。脚本以 `extends SomeNode` 开头，表示「挂在这个节点类型上」。Godot 4 起支持可选静态类型（`: float`、`-> void`），编辑器补全和报错更准。常用生命周期：

| 回调 | 何时调用 |
|------|----------|
| `_ready()` | 节点进入场景树，且子节点都 ready 之后（只一次） |
| `_process(delta)` | 每帧调用，`delta` 是秒数，用于帧率无关移动 |
| `_physics_process(delta)` | 固定物理帧率，移动角色时应优先用它 |
| `_input(event)` | 有输入事件时 |

## 实践案例

### 案例 1：键盘控制 2D 角色移动

下面脚本挂在 `CharacterBody2D` 根节点上，用方向键移动，并处理与墙壁的碰撞（引擎内置 `move_and_slide`）。

```gdscript
# player.gd — 挂在 Player (CharacterBody2D) 上
extends CharacterBody2D

@export var speed: float = 300.0   # 在检查器里可调的速度（像素/秒）

func _physics_process(delta: float) -> void:
    var direction := Vector2.ZERO
    if Input.is_action_pressed("ui_right"):
        direction.x += 1
    if Input.is_action_pressed("ui_left"):
        direction.x -= 1
    if Input.is_action_pressed("ui_down"):
        direction.y += 1
    if Input.is_action_pressed("ui_up"):
        direction.y -= 1

    if direction != Vector2.ZERO:
        direction = direction.normalized()   # 斜向移动不加速

    velocity = direction * speed
    move_and_slide()   # 自动滑墙、处理碰撞
```

**逐部分解释**：

- `@export`：把变量暴露到编辑器「检查器」，策划不用改代码就能调速度。
- `_physics_process`：与物理引擎同步，比 `_process` 更适合角色位移。
- `move_and_slide()`：`CharacterBody2D` 专用 API，碰墙时沿切线滑动，避免卡进墙角。
- `ui_*` 是 Godot 内置输入动作，可在「项目 → 项目设置 → 输入映射」里改成 WASD。

### 案例 2：用信号解耦——按钮开始游戏

主菜单里有一个 `Button`，游戏管理器在别处监听「开始」事件，两边互不 `get_node` 硬连。

```gdscript
# main_menu.gd — 挂在 MainMenu (Control) 根节点
extends Control

signal start_game_requested   # 自定义信号：有人点了开始

func _ready() -> void:
    $StartButton.pressed.connect(_on_start_pressed)

func _on_start_pressed() -> void:
    start_game_requested.emit()
```

```gdscript
# game_manager.gd — 挂在自动加载（Autoload）单例上
extends Node

func _ready() -> void:
    var menu := get_tree().get_first_node_in_group("main_menu")
    if menu:
        menu.start_game_requested.connect(_on_start_game)

func _on_start_game() -> void:
    get_tree().change_scene_to_file("res://scenes/level_01.tscn")
```

**逐部分解释**：

- `signal` / `emit()`：菜单只负责「广播意图」，不关心关卡怎么加载。
- `pressed.connect(...)`：Godot 4 推荐用 `connect` 绑定 Callable，类型更安全。
- `change_scene_to_file`：整场景切换是 Godot 换关卡的常规方式；旧场景节点会 `_exit_tree` 并释放（除非 `queue_free` 前被引用）。
- 把 `GameManager` 设为 **Autoload** 后，全局存在一份，任何场景都能访问。

### 案例 3：检测敌人进入区域（内置信号）

`Area2D` 节点在其它物体进入/离开时自动发信号，适合制作伤害区、拾取物、触发剧情。

```gdscript
# hazard_zone.gd — 挂在 Area2D 上
extends Area2D

func _ready() -> void:
    body_entered.connect(_on_body_entered)

func _on_body_entered(body: Node2D) -> void:
    if body.is_in_group("player"):
        body.take_damage(10)   # 假设 Player 脚本实现了 take_damage
```

在玩家节点上勾选「节点 → 组 → 添加 `player`」，无需记住节点路径，用组名解耦。

## 编辑器工作流速览

1. **新建项目**：选 2D / 3D / 移动模板，渲染器默认 Forward+（3D）。
2. **建场景**：场景面板点「+」选根节点类型，保存为 `player.tscn`。
3. **挂脚本**：选中节点 → 附加脚本 → 选 GDScript → 生成 `player.gd`。
4. **设主场景**：项目 → 项目设置 → 应用 → 主场景，选你的入口 `.tscn`。
5. **运行**：F5 运行项目，F6 只运行当前编辑的场景（快速测单个预制件）。
6. **导出**：项目 → 导出，添加目标平台，一次性打 Windows/macOS/Android 等包。

资源路径以 `res://` 开头，表示项目根目录；运行时不要用绝对磁盘路径。

## 踩过的坑

1. **在 `_ready` 之前用 `@onready` 以外的节点引用**：子节点可能还没进树。用 `@onready var sprite = $Sprite2D` 或把逻辑放到 `_ready` 里。
2. **每帧 `get_node("../../Player")`**：改场景层级就全断。改用信号、组（`add_to_group`）、或 Autoload 单例。
3. **在 `_process` 里写物理移动**：和 `CharacterBody2D` 的碰撞不同步，会穿墙或抖动。角色移动放 `_physics_process`。
4. **忘记设主场景**：F5 报错或黑屏。每个可运行项目必须有且仅有一个主场景。
5. **2D 坐标原点在左上角**：和数学课笛卡尔坐标（y 向上）相反；向下移动应**增加** `position.y`。

## 适用 vs 不适用场景

**适用**：

- 2D 独立游戏、像素风、视觉小说、塔防——专用 2D 引擎体验顺滑
- 中小型 3D 项目、原型验证——Godot 4 的 3D 已可商业，但超大开放世界仍要权衡
- 教育、Game Jam、个人作品集——安装小、启动快、无版权焦虑
- 需要**完全掌控源码**的团队——C++ 核心可 fork，GDExtension 可接 Rust/C++
- 多平台一次开发——同一项目导出桌面与移动端

**不适用**：

- 超大规模 3A 开放世界——工具链与中间件生态仍弱于 Unreal
- 团队已深度绑定 Unity 资产管线——迁移成本需单独评估
- 重度依赖特定主机 SDK 的独占功能——任天堂等需官方/port 中间件支持，Godot 社区有方案但非「开箱即用」
- 纯 Web 小游戏、广告变现极轻量——Godot Web 导出体积偏大，有时 Phaser 更轻

## 历史小故事（可跳过）

- **2007 年**：阿根廷开发者 Juan Linietsky 与 Ariel Manzur 开始内部项目，目标是用统一编辑器做 2D 游戏，摆脱当时商业引擎授权束缚。
- **2014 年**：Godot 1.0 开源发布，MIT 协议，社区开始形成插件与教程生态。
- **2016–2021 年**：Godot 3.x 成熟期，GLES2/3 渲染、可视化脚本、C# 支持，成为 indie 首选之一。
- **2022 年**：Godot 4.0 重大版本——Vulkan 3D、新 TileMap、GDScript 2.0 静态类型、改进的光照与导航。
- **2024–2026 年**：4.x 持续迭代（4.2+ 稳定 C#、4.7 在测），Steam 上 Godot 作品数量持续增长，与 Unity 授权风波后更多团队评估迁移。

## 学到什么

1. **场景 + 节点树是 Godot 的中心隐喻**：不是「先写 main 再堆类」，而是「先拼场景再挂行为」，和编辑器思维一致，降低设计与代码的裂缝。
2. **信号是默认的松耦合机制**：比单例到处拉引用更可维护；习惯「发射事件」而非「找到谁」。
3. **`delta` / 物理帧与渲染帧分离**：`_physics_process` + `move_and_slide` 是 2D 平台游戏的标准组合，理解后能套到大部分动作游戏。
4. **开源一体引擎降低「从 0 到可玩」的门槛**：和 LÖVE、raylib 比，Godot 多编辑器；和 Unity/Unreal 比，Godot 更轻、更透明，适合零基础建立完整游戏工程观。
5. **Resource 与 Autoload 分工**：持久化配置、角色模板用 Resource；跨场景流程（切关、全局音效）用 Autoload——避免把所有东西都塞进单例。

## 延伸阅读

- 官方文档：[Godot 4 文档（中文）](https://docs.godotengine.org/zh-cn/4.x/getting_started/introduction/index.html)
- 核心概念：[Overview of Godot's key concepts](https://docs.godotengine.org/en/stable/getting_started/introduction/key_concepts_overview.html)
- 视频：[GDQuest — Learn 2D Game Dev with Godot 4](https://www.gdquest.com/)（免费章节质量极高）
- 资产库：[Godot Asset Library](https://godotengine.org/asset-library/asset)
- 社区：[Godot Forum](https://forum.godotengine.org/) / [r/godot](https://www.reddit.com/r/godot/)

## 关联

- [[love2d]] —— 同为轻量 2D 路线，LÖVE 无编辑器纯代码，Godot 全功能场景树
- [[minetest]] —— 同为开源游戏平台，Luanti 专注体素沙盒，Godot 通用 2D/3D
- [[raylib]] —— 极简 C API 游戏库，适合学底层；Godot 适合完整产品级迭代
- [[phaser]] —— 浏览器 2D 引擎，与 Godot 2D 节点思维有相似处
- [[playcanvas]] —— 另一开源/Web 友好引擎，对比可理解不同场景树设计

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[assimp]] —— Assimp — Open Asset Import Library 统一 3D 模型导入
- [[blender]] —— Blender — 全流程 3D 创作套件
- [[cocos2d-x]] —— Cocos2d-x — 一份 C++ 代码把 2D 手游跑遍 iOS / Android
- [[defold]] —— Defold — King 出品 Lua 引擎，移动优先 + 一键跨平台打包
- [[inkscape]] —— Inkscape — 矢量图形编辑器
- [[krita]] —— Krita — 数字绘画专业编辑器
- [[love2d]] —— LÖVE — Lua 2D 游戏框架
- [[minetest]] —— Luanti / Minetest — 给自己造一个开源体素游戏引擎
- [[phaser]] —— Phaser — 在浏览器里写 2D 游戏的完整工具箱
- [[playcanvas]] —— PlayCanvas — 浏览器里跑的 3D 游戏引擎
- [[raylib]] —— raylib — 极简 C 游戏库，10 行代码跑起带窗口动画

