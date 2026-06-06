---
title: Phaser — 在浏览器里写 2D 游戏的完整工具箱
来源: 'https://github.com/phaserjs/phaser'
日期: 2026-06-06
分类: 图形学
子分类: 渲染与图形
难度: 初级
---

## 是什么

Phaser 是一个**在浏览器里运行 2D 游戏的开源框架**，同时支持 WebGL 和 Canvas 两种渲染模式，覆盖桌面和手机浏览器。日常类比：就像乐高积木——你不用从头制作每一块零件，而是直接把"物理引擎块"、"精灵动画块"、"地图块"拼在一起，几百行代码就能跑出一个完整游戏。

WebGL 是浏览器里调用显卡的硬件加速接口（渲染更快，能跑复杂特效），Canvas 是浏览器内置的 2D 画布 API（API 简单，适合调试）。Phaser 会在启动时自动选一个：如果显卡支持就用 WebGL，否则退回 Canvas——你只需要写 `type: Phaser.AUTO`，不用关心底层细节。

它由 Phaser Studio Inc 商业维护，从 2013 年开始活跃开发，目前已超过 10 年历史，GitHub Stars 约 37k，是目前最受欢迎的 JavaScript/TypeScript 2D 游戏引擎之一。

Phaser 4 重写了整个 WebGL 渲染管线，采用节点化架构。和浏览器里手写 Canvas 不同，Phaser 帮你封装了：**Scene 场景管理、物理碰撞、Tween 补间动画、Tilemap 地图、粒子系统、摄像机、资源加载**——这些组合起来才是"游戏引擎"的核心价值。

```ts
import Phaser from 'phaser';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,   // 自动选 WebGL 或 Canvas
  width: 800,
  height: 600,
  physics: { default: 'arcade', arcade: { gravity: { y: 300 } } },
  scene: { preload, create, update }
};

new Phaser.Game(config);

function preload(this: Phaser.Scene) {
  this.load.image('sky', 'assets/sky.png');
  this.load.spritesheet('dude', 'assets/dude.png', { frameWidth: 32, frameHeight: 48 });
}
function create(this: Phaser.Scene) {
  this.add.image(400, 300, 'sky');
  this.physics.add.sprite(100, 450, 'dude');
}
function update(this: Phaser.Scene) {}
```

## 为什么重要

不了解 Phaser，下面这些事都没法解释：

- 为什么用原生 Canvas 写游戏会发现自己在手写碰撞检测、帧调度、资源管理，而 Phaser 把这些全包了
- 为什么 HTML5 游戏能一键发布为 YouTube Playables、Discord Activities、Steam（通过第三方工具打包）
- 为什么 Phaser 4 中百万粒子渲染不掉帧——`SpriteGPULayer` 把数据放在 GPU Buffer 里单帧一次 Drawcall 完成（Drawcall = CPU 通知 GPU "帮我把这批东西全画了" 的一条指令，次数越少性能越好）
- 为什么 WebGL 游戏文件 8MB 但实际传输只有 345KB——大部分是 JSDoc 注释，gzip 后 min 包不到 350KB

## 核心要点

1. **Scene 是游戏的基本单元**：每个 Scene 有 `preload → create → update` 三个生命周期钩子。`preload` 加载资源，`create` 布置场景，`update` 每帧调用（游戏以 60fps 运行时每帧约 16ms）。类比：一个场景就是一幕戏，`preload` 是布景，`create` 是演员就位，`update` 是演出本身。多个 Scene 可以同时激活（如 HUD 叠在游戏上方）。注：**WebGL** 是浏览器提供的底层绘图接口，相当于让 GPU 直接画图的遥控器；`Phaser.AUTO` 会自动选用 WebGL 或退回到普通 Canvas，你不需要手动接触 WebGL。

2. **物理引擎选型决定游戏上限**：Phaser 内置两套物理：`Arcade`（轴对齐矩形碰撞，轻量快速，适合平台跳跃）和 `Matter.js`（多边形刚体，支持约束和软体，适合复杂机关）。类比：Arcade 是乒乓球规则，Matter.js 是台球室的物理桌。你在 `config.physics.default` 里选一个就好，两者不建议混用。

3. **Tween 和 AnimationManager 不是同一件事**：`Tween` 是补间——把一个属性从 A 平滑变到 B（位移、缩放、透明度），像 CSS transition。`AnimationManager` 管理帧序列动画——把精灵图里的帧按顺序播放，像 GIF。两者配合才是角色"边跑边动"的完整效果。Phaser 4 的 `SpriteGPULayer` 把大量精灵数据存进 GPU 缓冲区，每帧只发一条 **Draw Call**（即"让 GPU 一次性画出一批对象的命令"），比逐个上传快约 100 倍。

## 实践案例

### 案例 1：平台跳跃游戏 — Arcade Physics + Tilemap

```ts
class GameScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private platforms!: Phaser.Physics.Arcade.StaticGroup;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;

  create() {
    // 1. 用 Tilemap 加载地图，自动生成碰撞层
    const map = this.make.tilemap({ key: 'map' });
    const tiles = map.addTilesetImage('tiles', 'tileset');
    const layer = map.createLayer('Ground', tiles)!;
    layer.setCollisionByProperty({ collides: true });

    // 2. 创建玩家精灵，开启物理体
    this.player = this.physics.add.sprite(100, 300, 'player');
    this.player.setBounce(0.2).setCollideWorldBounds(true);

    // 3. 玩家和地图层碰撞
    this.physics.add.collider(this.player, layer);

    // 4. 注册跑步动画
    this.anims.create({
      key: 'run',
      frames: this.anims.generateFrameNumbers('player', { start: 0, end: 7 }),
      frameRate: 10,
      repeat: -1
    });

    // 5. 在 create() 里创建一次，update() 复用同一个对象，避免每帧重复分配
    this.cursors = this.input.keyboard!.createCursorKeys();
  }

  update() {
    if (this.cursors.left.isDown) {
      this.player.setVelocityX(-160);
      this.player.anims.play('run', true);
    } else if (this.cursors.right.isDown) {
      this.player.setVelocityX(160);
    } else {
      this.player.setVelocityX(0);
    }
    if (this.cursors.up.isDown && this.player.body!.blocked.down) {
      this.player.setVelocityY(-400);
    }
  }
}
```

逐部分解释：`setCollisionByProperty` 让 Tiled 地图编辑器导出的 collides 属性自动生效；`body!.blocked.down` 判断角色站在地面上才能跳，避免空中二段跳。

### 案例 2：弹幕射击 — 对象池 + SpriteGPULayer

```ts
class BulletScene extends Phaser.Scene {
  private bulletPool!: Phaser.GameObjects.Group;

  create() {
    // 用 Group 做对象池，避免频繁 new/destroy
    this.bulletPool = this.add.group({
      classType: Phaser.GameObjects.Image,
      maxSize: 200,
      runChildUpdate: true
    });

    // 定时射击
    this.time.addEvent({
      delay: 100,
      callback: this.fireBullet,
      callbackScope: this,
      loop: true
    });
  }

  fireBullet() {
    const bullet = this.bulletPool.get(400, 300, 'bullet') as Phaser.GameObjects.Image;
    if (!bullet) return;
    bullet.setActive(true).setVisible(true);
    // 用 Tween 推进子弹，结束时归还对象池
    this.tweens.add({
      targets: bullet,
      y: -50,
      duration: 1000,
      onComplete: () => { this.bulletPool.killAndHide(bullet); }
    });
  }
}
```

关键点：`Group` 对象池让 200 颗子弹反复复用，不触发 GC（垃圾回收——JavaScript 自动释放不再使用的内存，触发时会短暂卡顿导致掉帧）；`killAndHide` 让对象回池等待重用，而不是 `destroy()`。

### 案例 3：大世界地图 — TilemapGPULayer + 摄像机跟随

```ts
class WorldScene extends Phaser.Scene {
  create() {
    const map = this.make.tilemap({ key: 'world' });
    const tileset = map.addTilesetImage('world-tiles', 'world-tileset')!;

    // TilemapGPULayer：单 Drawcall 渲染整个地图，代价是 per-pixel 而非 per-tile
    // 适合 4096×4096 级别的大地图，无论 tile 数量多少性能恒定
    const layer = map.createLayer('Ground', tileset)!;

    // 摄像机世界边界 = 地图大小
    this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels);

    // 摄像机跟随玩家
    const player = this.physics.add.sprite(400, 300, 'hero');
    this.cameras.main.startFollow(player, true, 0.1, 0.1); // lerp 平滑跟随

    // 晃动效果（受伤时）
    this.cameras.main.shake(500, 0.02);
  }
}
```

`startFollow` 的第三、四参数是 lerp（线性插值）系数，0.1 表示每帧向目标移动 10%，实现平滑的摄像机跟随效果。

## 踩过的坑

1. **在 `preload` 外做资源加载**：Phaser 的资源加载是异步的，只有 `preload` 中调用的 `this.load.*` 才会在 `create` 前保证就绪；在 `create` 或 `update` 中加载会导致 `undefined` 纹理。

2. **忘记销毁物理体导致内存泄漏**：调用 `sprite.destroy()` 时，若不传 `fromScene: true` 或不显式 `sprite.body.destroy()`，Arcade/Matter 物理体会继续占用内存，长时间运行场景切换会爆内存。

3. **拿 `phaser.js` 文件大小吓跑自己**：原始 `phaser.js` 有 8MB，其中 84% 是 JSDoc 注释；真实的 `phaser.min.js` gzip 后只有 345KB，比大多数封面图还小。生产环境用 min 包或按需 tree-shaking 构建。

4. **从 Phaser 3 迁移 v4 踩 API 破坏性变更**：v4 移除了 `Mesh`、`BitmapMask`、`Point` 类；FX 和 Mask 统一成 `Filter` 系统；`Shader` 配置接口完全重写。直接从 v3 复制代码会遇到大量运行时错误，需对照 Migration Guide 逐项检查。

## 适用 vs 不适用场景

**适用**：

- HTML5 2D 游戏（平台跳跃、弹幕射击、RPG、休闲益智）
- 需要同时兼容桌面/移动浏览器的跨平台发布
- YouTube Playables、Discord Activities 等互动内容嵌入
- TypeScript 开发团队（完整类型定义，AI 辅助开发友好）
- 需要 Tween 动画、Tilemap 大地图、粒子特效的项目

**不适用**：

- 3D 游戏（用 Three.js / Babylon.js / Unity WebGL）
- 需要复杂 3D 物理（用 Rapier.js / Cannon.js）
- 极简 2D 渲染需求（用 [[pixi]] 更轻量，Phaser 全功能包较大）
- 原生移动 App（用 Unity / Godot 导出原生包性能更好）

## 历史小故事（可跳过）

- **2013 年**：Richard Davey（网名 photonstorm）受 Flixel/Flashpunk 启发，个人发布了 Phaser 第一版。起初只是他自己做游戏用的工具集，没想到 GitHub 上迅速积累了几千 Star。
- **2018 年**：Phaser 3 发布，完全重写渲染架构，引入 Scene 系统和新的物理引擎集成，成为版本史上最大的一次重构。
- **2020-2023 年**：Phaser 在 COVID 居家期间 HTML5 小游戏热潮中迎来高速增长，Discord / YouTube 游戏活动带来大量商业需求。
- **2024 年**：Phaser Studio Inc 成立，以商业实体维护框架。同年 Phaser 4 发布，新增节点化 WebGL 渲染管线、`SpriteGPULayer`（百万 Sprite 单帧渲染）、`TilemapGPULayer`（GPU 驱动的 per-pixel 大地图渲染）。
- **现在（2026）**：~37k Stars，是 GitHub 上最多 Star 的 JavaScript 2D 游戏引擎，支持超 40 个前端框架集成，配套 AI Agent Skills 让大语言模型可以直接生成 Phaser 游戏代码。

## 学到什么

1. **游戏引擎的价值是封装"时间和空间"**：帧循环（时间）+ 场景图和物理世界（空间）是游戏最难手写的两块，Phaser 把它们都包好了
2. **对象池是游戏性能的第一课**：频繁 new/destroy 会触发 GC 抖动，复用对象是实时渲染场景的基本功
3. **渲染模式决定上限**：Canvas 易调试，WebGL 高性能；Phaser 的 `Phaser.AUTO` 帮你在运行时自动选择
4. **Scene 架构让复杂游戏可维护**：把 Boot、Loading、Menu、Game、HUD 分成独立 Scene，各自只关注自己的生命周期，远比一个大 update 函数可维护

## 延伸阅读

- 官方入门教程：[Making your first Phaser Game](https://phaser.io/tutorials/making-your-first-phaser-3-game)（30 分钟跑出第一个平台游戏）
- 免费书籍：[Phaser by Example](https://phaser.io/news/2024/04/phaser-by-example-book)（500 页，PDF 免费下载）
- API 文档：[docs.phaser.io](https://docs.phaser.io/)（完整 API 参考，支持全文搜索）
- 示例合集：[phaser.io/examples](https://phaser.io/examples)（2000+ 可运行示例，含源码）
- v3 → v4 迁移指南：[Migration Guide](https://github.com/phaserjs/phaser/blob/master/changelog/v4/4.0/MIGRATION-GUIDE.md)

## 关联

- [[pixi]] —— PixiJS 是更轻量的 WebGL 2D 渲染库，只做渲染不含物理/音频，适合需要控制体积的场景
- [[vite]] —— Phaser 官方 `create-phaser-game` 脚手架默认用 Vite 构建，热更新快速开发体验好
- [[react]] —— Phaser 4 支持与 React/Vue/Svelte 集成，UI 层用前端框架，游戏层用 Phaser

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[defold]] —— Defold — King 出品 Lua 引擎，移动优先 + 一键跨平台打包
- [[heaps]] —— Heaps — 用 Haxe 一次编写、发布到任何平台的游戏引擎
- [[love2d]] —— LÖVE — Lua 2D 游戏框架
- [[melonjs]] —— melonJS — 轻量 JS 2D 引擎
- [[pixi]] —— PixiJS — 浏览器里画 2D 的高性能 GPU 引擎
- [[react]] —— React UI 组件库
- [[threejs]] —— three.js — Web 3D 事实标准
- [[vite]] —— Vite — 浏览器自己加载源码的构建工具

