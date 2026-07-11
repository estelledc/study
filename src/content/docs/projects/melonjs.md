---
title: melonJS — 轻量 JS 2D 游戏引擎
来源: 'https://github.com/melonjs/melonJS'
日期: 2026-07-08
分类: projects / graphics
难度: 初级
---

## 是什么

melonJS 是一个**用 JavaScript / TypeScript 在浏览器里做 2D 和轻量 2.5D 游戏的引擎**。日常类比：原生 Canvas 像一张空白画布，Phaser 像一座大型游乐场，melonJS 像一个轻便但完整的游戏工具箱：画面、输入、地图、碰撞、音频和状态切换都有，但不把你绑到很重的编辑器流程里。

最小代码长这样：

```js
import { Application, Text } from "melonjs";

const app = new Application(800, 600, {
  parent: "screen",
  scale: "auto"
});

app.world.addChild(new Text(400, 300, {
  font: "Arial",
  size: 48,
  textAlign: "center",
  text: "Hello World!"
}));
```

`Application` 一次性创建渲染器、世界容器、视口和游戏循环；`app.world.addChild(...)` 把文字、角色、地图、按钮这类对象放进世界里。官方 README 还强调它能在 WebGL 和 Canvas2D 之间自动切换，并且 Tiled 地图是一级支持对象，不需要自己写地图解析器。

它和 [[phaser]] 的区别不在"能不能做游戏"，而在气质：Phaser 更像大而全的框架，教程和插件生态更厚；melonJS 更像保留 Canvas 直觉的小引擎，适合想贴近底层、又不想从零写资源加载和碰撞的人。

## 为什么重要

不理解 melonJS，下面这些事都不好解释：

- 为什么浏览器 2D 游戏可以直接读取 Tiled 的 TMX / JSON 地图，而不是手写一堆二维数组
- 为什么同一份绘制代码可以优先跑 WebGL，设备不支持时再退回 Canvas2D
- 为什么小游戏里也需要 `state.PLAY`、`Stage`、对象池和资源预加载，而不是把所有代码塞进一个 `requestAnimationFrame`
- 为什么"轻量"不等于"只有画图"：melonJS 仍然内置物理、输入、音频、摄像机、粒子、UI 和插件系统

## 核心要点

melonJS 的能力可以拆成 **三层**：

1. **Application + World**：`Application` 像开店前一次性接好水电和灯，`world` 是真正摆放角色和道具的房间。它帮你启动游戏循环，每帧按顺序更新和绘制世界里的对象。

2. **Stage + State**：一款游戏通常有加载页、菜单页、游玩页、结束页。melonJS 用 `state.set(...)` 和 `state.change(...)` 切换这些阶段，类比剧场换布景，上一幕的道具可以收掉，下一幕重新摆好。

3. **Tiled / Renderable / Pool**：Tiled 负责把关卡画出来，`Renderable` 负责自定义画法，`pool` 负责复用子弹、金币、敌人这类频繁出现的对象。类比小餐馆：菜单、厨具、备菜台都有，厨师就能专心做菜。

三层合起来，melonJS 解决的是"我想在浏览器里做一个可玩的 2D 游戏，但不想先造半个引擎"。

## 实践案例

### 案例 1：官方 README 的 Hello World

```js
import { Application, Text } from "melonjs";

const app = new Application(1218, 562, {
  parent: "screen",
  scale: "auto",
  backgroundColor: "#202020"
});

app.world.addChild(new Text(609, 281, {
  font: "Arial",
  size: 160,
  fillStyle: "#FFFFFF",
  textBaseline: "middle",
  textAlign: "center",
  text: "Hello World !"
}));
```

**逐部分解释**：`parent: "screen"` 表示把 canvas 挂到页面里的 `#screen` 容器；`scale: "auto"` 让画面随容器缩放；`Text` 是一个可渲染对象，放到 `app.world` 后就会进入更新和绘制流程。这个案例来自 README 和官方 helloWorld 示例，重点是先建立最小闭环。

### 案例 2：Platformer 示例用 Tiled 加载关卡

```js
import { loader, level, state, Stage } from "melonjs";

const resources = [
  { name: "tileset", type: "image", src: "img/tileset.png" },
  { name: "map1", type: "tmx", src: "map/map1.tmx" }
];

class PlayScreen extends Stage {
  onResetEvent() {
    level.load("map1");
  }
}

loader.preload(resources, () => {
  state.set(state.PLAY, new PlayScreen());
  state.change(state.PLAY);
});
```

**逐部分解释**：`resources` 把图片和 Tiled 地图先登记好；`loader.preload` 等资源真的加载完再进游戏；`level.load("map1")` 把 Tiled 关卡变成世界里的图层、碰撞和对象。官方 Platformer 示例还会注册玩家、敌人、金币和关卡触发器，这样 Tiled 里放的对象能自动生成对应类。

### 案例 3：Graphics 示例自定义绘制对象

```js
import { Application, Renderable, video } from "melonjs";

const app = new Application(1024, 768, {
  parent: "screen",
  renderer: video.AUTO
});

class DebugShape extends Renderable {
  constructor() {
    super(0, 0, 1024, 768);
  }

  draw(renderer) {
    renderer.setColor("#40a0e0");
    renderer.fillRect(80, 80, 240, 120);
    renderer.setColor("#ffffff");
    renderer.strokeRect(80, 80, 240, 120);
  }
}

app.world.addChild(new DebugShape());
```

**逐部分解释**：`Renderable` 是"我自己知道怎么画"的对象；`draw(renderer)` 里的 API 很像 Canvas2D，但 melonJS 会在 WebGL / Canvas 后端之间做适配。官方 Graphics 示例用同一套入口画多边形、圆角矩形、遮罩、虚线和贝塞尔曲线，说明它不是只能放 sprite。

## 踩过的坑

1. **还在用 `video.init()` 当入口**：FAQ 说 `new Application(...)` 是 18.3 之后推荐方式；原因是它把 renderer、world、viewport 和销毁生命周期都挂在实例上，更适合 React / Vite 这类现代项目。

2. **游戏里大量使用 `Text`**：FAQ 建议频繁变化或大量文字优先用 `BitmapText`；原因是普通文本绘制成本高，尤其在 WebGL 游戏里容易拖慢帧率。

3. **`update()` 永远返回 `true`**：核心文档说只有对象真的移动或动画变化时才应该返回 `true`；原因是 melonJS 可以在没有变化时跳过绘制，乱返回会让优化失效。

4. **把 Tiled 碰撞切成很多薄片**：FAQ 提到高速物体可能穿过薄墙，相邻小碰撞形状也会卡角；原因是碰撞响应要用最短重叠方向修正，太碎的形状会制造很多边界问题。

## 适用 vs 不适用场景

**适用**：

- 2D Web 小游戏：平台跳跃、解谜、RPG 地图、互动演示、教育小游戏
- 已经用 Tiled 画关卡，希望地图、碰撞层、对象属性能直接进引擎
- 想保留 Canvas 风格绘制直觉，同时让 WebGL、资源加载和输入系统替你打底
- 需要轻量、可读、可扩展的浏览器游戏引擎，而不是完整编辑器工作流

**不适用**：

- 大型 3D 游戏或重编辑器流程：[[godot]]、Unity、Unreal 更适合
- 只想画高性能 2D，不需要游戏状态、物理和地图：[[pixi]] 更直接
- 需要最大教程数量、商业模板和第三方插件生态：[[phaser]] 更省心
- 普通网页 UI、表单、后台工具：DOM / CSS 已经够用，引游戏引擎会变重

## 历史小故事（可跳过）

- **2011 年起**：官方示例版权头覆盖 2011-2026，说明 melonJS 是 HTML5 游戏早期就开始演进的老项目。
- **ES6 / TypeScript 时代**：README 介绍它采用 ES6 class，并以现代模块方式分发，和早期全局变量式 H5 引擎拉开距离。
- **Tiled 工作流成熟后**：melonJS 把 Tiled 当成 2D 关卡的一等入口，支持正交、等距、六边形、对象属性和多种压缩格式。
- **近期版本**：README 提到 19.5 之后有 `PhysicsAdapter` 接口，可以在内置 SAT 之外接 Matter 或 Planck 这类刚体引擎。
- **现在**：GitHub 仓库约 6k star，官方 wiki、教程、示例站和插件包一起维护，定位从纯 2D 扩展到轻量 2.5D / glTF 场景。

## 学到什么

1. **轻量引擎也要有完整闭环**：资源预加载、状态切换、世界容器、输入和碰撞是游戏最小基础设施。
2. **Tiled 是 melonJS 的关键入口**：把关卡编辑和运行时代码分开，初学者更容易看懂"地图从哪来"。
3. **Renderer 抽象降低迁移成本**：你写的是 `draw(renderer)` 或 `world.addChild`，后端是 WebGL 还是 Canvas 不应该污染玩法代码。
4. **和 Phaser / Pixi 对比能看清边界**：Phaser 偏大而全，Pixi 偏渲染底座，melonJS 站在"小而完整的游戏引擎"这一格。

## 延伸阅读

- 官方仓库：[melonjs/melonJS](https://github.com/melonjs/melonJS) —— README 能快速了解定位、特性、示例和插件。
- 官方 wiki：[melonJS Wiki](https://github.com/melonjs/melonJS/wiki) —— FAQ、核心引擎、资源加载、渲染 API、Tiled 和部署指南都在这里。
- 官方教程：[Hacking a Platformer Game](https://melonjs.org/tutorial/) —— 从改造平台跳跃模板开始理解关卡和角色。
- 官方示例：[melonJS Examples](https://melonjs.github.io/melonJS/examples/) —— Platformer、Isometric RPG、Graphics、glTF、Shader Effects 都能直接跑。
- [[phaser]] —— 同类 HTML5 2D 游戏框架，对比"生态更大"和"引擎更轻"。
- [[pixi]] —— 同类浏览器 2D 渲染引擎，对比"只负责画"和"负责游戏闭环"。

## 关联

- [[phaser]] —— 都能做 2D Web 游戏；Phaser 生态更大，melonJS 更贴近轻量引擎和 Tiled 工作流。
- [[pixi]] —— Pixi 是高性能 2D 渲染底座，melonJS 在渲染之上还给状态、输入、地图和碰撞。
- [[godot]] —— 完整游戏引擎和编辑器，对比 melonJS 的浏览器原生、代码优先路线。
- [[cocos2d-x]] —— 同样服务 2D 游戏，但 Cocos2d-x 更偏跨端原生和 C++ 生态。
- [[defold]] —— 轻量游戏引擎代表；可对比"编辑器驱动"和"Web JS 库"两种开发体验。
- [[konva]] —— Canvas 对象模型库；适合图形编辑，缺少 melonJS 的游戏循环和物理语义。
- [[vite]] —— melonJS 脚手架使用现代前端开发体验，Vite 负责本地开发服务器和打包。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
