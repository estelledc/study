---
title: Phaser — HTML5 2D 游戏框架
来源: 'https://github.com/phaserjs/phaser'
日期: 2026-07-08
分类: projects / graphics
难度: 初级
---

## 是什么

Phaser 是一个**用 JavaScript / TypeScript 在浏览器里做 2D 游戏的框架**。日常类比：如果原生 Canvas 像给你一张白纸和画笔，Phaser 像给你一套小型游戏工作台，里面已经放好舞台、角色、碰撞、键盘、动画、音效和资源加载器。

最小代码长这样：

```js
import Phaser from 'phaser';

new Phaser.Game({
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  scene: { preload, create, update }
});
```

`preload` 负责先把图片、音频、精灵图搬进仓库；`create` 负责把角色、地图、文字放到场景里；`update` 每帧执行，负责移动、碰撞和输入响应。官方 README 也把 Phaser 定位成可跑在桌面和移动浏览器上的 HTML5 游戏框架，并同时支持 WebGL 和 Canvas 渲染。

它不像 PixiJS 那样只专注"画得快"，而是把 2D 游戏常用零件都打包好：Scene、Loader、Arcade Physics、Matter.js、Animation、Input、Camera、Tilemap、Tween、Particle。你想做平台跳跃、弹幕、卡牌、消除、互动广告，Phaser 通常能让第一版更快跑起来。

## 为什么重要

不理解 Phaser，下面这些事都不好解释：

- 为什么浏览器也能做"角色会跳、星星会掉、炸弹会碰撞"的小游戏，而不是只能写普通网页
- 为什么很多 Web 小游戏不用自己写游戏循环、键盘监听、碰撞检测，直接交给框架
- 为什么同一份代码能通过浏览器、YouTube Playables、Discord Activities、Twitch Overlay，甚至再借第三方工具打包到移动端
- 为什么 2D 游戏框架和 2D 渲染库不是一回事：Phaser 管游戏规则，PixiJS 更偏渲染底座

## 核心要点

Phaser 的能力可以拆成 **三层**：

1. **Scene 场景**：一局游戏不是一坨全局代码，而是分成加载页、菜单页、关卡页、结算页。类比：剧场换布景，每个 Scene 有自己的灯光、道具和演员，切换时不必把整栋剧场拆掉。

2. **Game Object + 系统插件**：图片、文字、精灵、Tilemap 都是 Game Object；`this.load`、`this.add`、`this.physics`、`this.input` 是 Scene 里常用的工具入口。类比：你不是每次都造锤子，而是从工具墙上拿已经挂好的工具。

3. **每帧 update**：游戏的本质是"一秒钟重复几十次：读输入、改状态、画画面"。类比：动画片不是一张画，而是一叠画快速翻页；`update` 就是每翻一页前你能改动作的地方。

这三层合起来，让新人不用先学 WebGL、碰撞算法、资源缓存，也能写出一个可玩的 2D 原型。

## 实践案例

### 案例 1：从官方教程开始一块舞台

```js
const config = {
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  scene: { preload, create, update }
};

const game = new Phaser.Game(config);

function preload() {}
function create() {}
function update() {}
```

**逐部分解释**：`type: Phaser.AUTO` 让 Phaser 优先使用 WebGL，不行再回退到 Canvas；`width` 和 `height` 是画布大小；`scene` 里挂的三个函数就是这个关卡的生命周期。官方第一课就是用这个骨架往里加天空、平台、角色和星星。

### 案例 2：加载资源并显示背景

```js
function preload() {
  this.load.image('sky', 'assets/sky.png');
  this.load.image('star', 'assets/star.png');
}

function create() {
  this.add.image(400, 300, 'sky');
  this.add.image(400, 300, 'star');
}
```

**逐部分解释**：`'sky'` 和 `'star'` 是资源 key，后面创建对象时用它们，不直接用文件路径。`this.add.image(400, 300, 'sky')` 把图片放到 x=400、y=300 的位置；Phaser 默认按图片中心定位，所以 800x600 的背景放在 400x300 才会铺满画面。

### 案例 3：平台跳跃、收集星星、碰到炸弹

```js
function create() {
  platforms = this.physics.add.staticGroup();
  platforms.create(400, 568, 'ground').setScale(2).refreshBody();

  player = this.physics.add.sprite(100, 450, 'dude');
  player.setBounce(0.2);
  player.setCollideWorldBounds(true);
  this.physics.add.collider(player, platforms);

  cursors = this.input.keyboard.createCursorKeys();
}

function update() {
  if (cursors.left.isDown) player.setVelocityX(-160);
  else if (cursors.right.isDown) player.setVelocityX(160);
  else player.setVelocityX(0);
  if (cursors.up.isDown && player.body.touching.down) player.setVelocityY(-330);
}
```

**逐部分解释**：`staticGroup` 适合地面和平台，因为它们不被重力拉走；`physics.add.sprite` 创建带物理身体的角色；`collider` 让角色踩在平台上；`createCursorKeys` 直接给你上下左右键对象。官方教程后面还会加动态星星组、`overlap` 收集回调、炸弹碰撞和分数文本。

## 踩过的坑

1. **图片默认按中心点定位**：新人常把背景放在 `(0, 0)`，结果只看到右下角；原因是 Phaser 的 Game Object 默认 origin 是中心，想按左上角放要 `setOrigin(0, 0)`。

2. **静态物理体缩放后要刷新**：`setScale(2)` 只改了显示大小，物理身体不会自动同步；原因是 Arcade Physics 为了性能不会每帧重算静态碰撞盒，所以要 `refreshBody()`。

3. **Scene 里的动画是全局 Animation Manager 管的**：同名动画重复创建会报错或覆盖预期；原因是动画数据可以被多个精灵共享，不是每个角色私有一份。

4. **Phaser 3 和 Phaser 4 教程会混在一起**：README 说 v4 保留多数公开 API，但渲染器、滤镜、Shader、光照等底层变化很大；原因是网上旧教程多，复制代码前要看版本。

## 适用 vs 不适用场景

**适用**：

- 2D Web 游戏：平台跳跃、塔防、消除、弹幕、卡牌、节奏小游戏
- 需要开箱即用的游戏系统：资源加载、输入、物理、Tween、动画、摄像机、Tilemap
- 希望用 TypeScript 和现代前端工具链写游戏，同时还能接 React / Vue / Svelte 外壳
- 快速做可玩的原型：先验证手感和规则，再慢慢换素材、调性能

**不适用**：

- 3D 游戏或复杂空间渲染：用 Three.js、Babylon.js、Unity、Godot 更自然
- 只想画高性能 2D 图形，不需要物理和游戏状态：PixiJS 更轻
- 普通网页动效、表单、后台页面：CSS / DOM 就够了，引游戏框架会过重
- 对包体极端敏感的小组件：Phaser 功能全，压缩后仍比单用途库大

## 历史小故事（可跳过）

- **2013 年前后**：Rich Davey 发起 Phaser，把 Flash 时代的 2D 游戏开发经验搬到 HTML5 浏览器。
- **2010s 中期**：移动浏览器、Canvas 和 WebGL 成熟，Phaser 成为很多 Web 小游戏和互动广告的常见选择。
- **Phaser 3 时代**：Scene、Arcade Physics、Matter.js、Loader、Animation 等系统稳定下来，官方积累了大量示例。
- **Phaser 4**：README 介绍它换成新的 WebGL 渲染器，增加节点式渲染架构、统一 Filter、GPU Sprite / Tilemap Layer 等能力。
- **现在**：仓库接近四万 star，官方文档、示例站、Sandbox、模板 CLI 和社区插件一起形成了很完整的学习入口。

## 学到什么

1. **游戏框架先帮你搭舞台**：Scene、Loader、Input、Physics 这些是 2D 游戏的基础设施，不必每个项目重写。
2. **Phaser 的核心是生命周期**：先 preload，再 create，之后每帧 update；理解这个顺序，读大多数示例都不会迷路。
3. **物理系统是选择题**：Arcade Physics 简单快，适合平台跳跃；Matter.js 更真实，适合复杂碰撞，但心智成本更高。
4. **版本意识很重要**：Phaser 示例很多是优势，也是坑；看代码前先确认是 v3 还是 v4。

## 延伸阅读

- 官方仓库：[phaserjs/phaser](https://github.com/phaserjs/phaser) —— README 能快速了解定位、安装方式和 v4 变化。
- 官方第一课：[Making your first Phaser Game](https://docs.phaser.io/phaser/getting-started/making-your-first-phaser-game) —— 从空场景做出平台跳跃小游戏。
- 官方示例站：[Phaser Examples](https://phaser.io/examples) —— 按物理、输入、动画、Tilemap 分类查可运行代码。
- 官方 API：[docs.phaser.io](https://docs.phaser.io/) —— 查类、事件和 Game Object 的细节。
- [[pixi]] —— 更偏 2D GPU 渲染底座，适合和 Phaser 对比边界。
- [[godot]] —— 完整游戏引擎，对比"浏览器 2D 框架"和"编辑器驱动引擎"。

## 关联

- [[pixi]] —— 同属 2D 图形生态；Pixi 偏渲染，Phaser 偏完整游戏框架。
- [[godot]] —— 同样面向游戏开发，但 Godot 有独立编辑器、节点树和更完整的引擎工作流。
- [[three-js]] —— 3D Web 渲染常用选择；Phaser 主要服务 2D 游戏。
- [[matter-js]] —— Phaser 可接入的 2D 刚体物理引擎，适合更复杂碰撞。
- [[anime]] —— 时间轴动画库；理解 Tween 后再看 Phaser Tween 会更顺。
- [[vite]] —— Phaser 模板常和现代前端构建工具搭配，用来启动开发服务器和打包。
- [[typescript]] —— Phaser 提供类型定义，写大型游戏时能减少拼错 API 的成本。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

