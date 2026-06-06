---
title: melonJS — 轻量 JS 2D 引擎
来源: 'https://github.com/melonjs/melonjs'
日期: 2026-06-06
分类: 图形学
子分类: 渲染与图形
难度: 初级
---

## 是什么

melonJS 是一个**现代轻量 HTML5 2D 游戏引擎**，用纯 JavaScript/TypeScript 编写，压缩后约 100KB，**零运行时依赖**，只要求浏览器支持 HTML5。日常类比：Phaser 像一整套带装修手册的精装公寓，melonJS 更像一辆轻便自行车——零件少、上手快，但 Tiled 地图、物理、音频、输入这些"轮子"都装好了，你可以直接骑出去。

它的渲染 API 刻意模仿 HTML5 Canvas2D（`save`、`restore`、`translate`、`fillRect` 等），如果你写过 Canvas 绘图，melonJS 的绘制代码读起来几乎一样；引擎在底层自动选择 WebGL 或 Canvas2D，WebGL 不可用时无缝回退。和 [[phaser]] 最大的差异在于体量：melonJS 单包 tree-shake 后极小，且**深度集成 Tiled 地图编辑器**——正交、等距、六边形地图、碰撞多边形、对象属性都能原生解析，不需要额外插件拼接。

```javascript
import { Application, Text } from "https://cdn.jsdelivr.net/npm/melonjs/+esm";

const app = new Application(800, 600, {
    parent: "screen",
    scale: "auto",
    backgroundColor: "#202020",
});

app.world.addChild(new Text(400, 300, {
    font: "Arial",
    size: 48,
    fillStyle: "#FFFFFF",
    textAlign: "center",
    textBaseline: "middle",
    text: "Hello melonJS!",
}));
```

## 为什么重要

不理解 melonJS，下面这些事都没法解释：

- 为什么有些 indie 团队选"小引擎"而不是 Phaser——100KB 包体对嵌入网页小游戏、教学 demo 更友好
- 为什么 Tiled 地图可以直接拖进项目跑起来，而不必手写 JSON 解析器和碰撞层逻辑
- 为什么同一套游戏代码能在 WebGL 和 Canvas2D 之间切换，而开发者只写一份 Canvas 风格的绘制代码
- 为什么 2011 年就开始的 HTML5 引擎至今仍活跃——ES6 模块化重写 + 插件体系让它跟上了现代前端工具链

## 核心要点

1. **Canvas2D 风格 API + 双渲染后端**

   渲染层对开发者暴露的是熟悉的 Canvas 指令集，不是复杂的 render graph 或 shader pipeline。引擎在运行时检测 WebGL 能力：有则用 WebGL 批量绘制，无则退回 Canvas2D。类比：像同一份中文菜单，厨房可以选燃气灶（WebGL）或电磁炉（Canvas2D），顾客点的菜名不变。

2. **Tiled 是一等公民**

   TMX/TSX 地图格式内建于核心：多层 tileset、动画帧、翻转旋转 tile、对象层自定义属性（字符串/数字/布尔/颜色/类类型）、碰撞多边形自动三角剖分。在 Tiled 里画好关卡，melonJS 的 `loader` + `level.load` 就能解析并渲染，Entity 工厂可注册自定义 Tiled 类名处理器。

3. **完整 2D 栈，可插拔物理**

   内置 SAT 多边形碰撞 + QuadTree 粗筛，覆盖输入（键鼠/触屏/手柄）、音频（基于 Howler 的 Web Audio）、摄像机（多视口、跟随、震屏/淡入淡出）、Tween、粒子、UI 拖拽。自 v19.5 起提供 `PhysicsAdapter` 接口，可切换到 matter-js 或 planck.js（Box2D 移植）而不改游戏主逻辑。

## 实践案例

### 案例 1：最小 Hello World——验证环境

```javascript
import { Application, Text } from "melonjs";

const app = new Application(800, 600, {
    parent: "screen",      // 挂载到 id="screen" 的 DOM 节点
    scale: "auto",         // 按容器自动缩放，适配手机
    backgroundColor: "#1a1a2e",
});

app.world.addChild(new Text(400, 300, {
    font: "Arial",
    size: 64,
    fillStyle: "#e94560",
    textAlign: "center",
    textBaseline: "middle",
    text: "Hello World!",
}));
```

**逐部分解释**：
- `Application` 是现代入口，替代旧版 `me.video.init` + `me.game.init` 组合
- `scale: "auto"` 让同一套逻辑在不同分辨率下等比缩放，移动端不用重写布局
- `world.addChild` 把可渲染对象挂到场景树，类似 DOM 里 appendChild

### 案例 2：Tiled 平台跳跃——地图驱动关卡

下面示例统一使用 v19 的 `Application` 入口（不再混用旧版 `me.game` 全局对象）：

```javascript
import { Application, Entity, input, loader } from "melonjs";

// Application = 游戏窗口 + 场景根节点 + 物理世界
const app = new Application(640, 480, { parent: "screen" });

// Entity = 可碰撞的游戏对象（玩家、敌人、道具）
class Player extends Entity {
    constructor(x, y) {
        super(x, y, { image: "player", width: 32, height: 32 });
        this.body.setMaxVelocity(3, 15);   // 最大水平/垂直速度
        this.body.setFriction(0.4, 0);     // 地面摩擦力
    }
    update(dt) {
        // input.isKeyPressed 读取键盘；LEFT/RIGHT/JUMP 是引擎内置键名
        if (input.isKeyPressed("LEFT"))  this.body.force.x = -0.2;
        if (input.isKeyPressed("RIGHT")) this.body.force.x =  0.2;
        if (input.isKeyPressed("JUMP") && this.body.vel.y === 0)
            this.body.vel.y = -12;         // 仅在地面时跳跃
        super.update(dt);
    }
}

// loader.preload：先加载资源，全部完成后再进入关卡
loader.preload([
    { name: "map",    type: "tmx",   src: "data/map.tmx" },
    { name: "tiles",  type: "tsx",   src: "data/tileset.tsx" },
    { name: "player", type: "image", src: "img/player.png" },
], () => {
    // loadLevel 解析 TMX：渲染 tile 层 + 读取碰撞多边形
    app.loadLevel("map").then(() => {
        app.world.addChild(new Player(100, 100));
    });
});
```

**逐部分解释**：
- `loader.preload` 是异步的：TMX（地图）、TSX（图块集）、PNG（精灵）必须全部下载完才能 `loadLevel`
- 在 Tiled 对象层给玩家设 `type: Player` 并注册工厂后，引擎可自动在对应坐标生成 Entity，上面手动 `addChild` 是简化写法
- `body.force` / `vel` 走内置 SAT 物理；若需要旋转关节或弹簧约束，可换 `@melonjs/matter-adapter`

### 案例 3：摄像机后处理——WebGL 特效

WebGL 是浏览器调用显卡做硬件加速绘图的接口；以下代码仅在 WebGL 后端生效：

```javascript
import { Application, Sprite, CRTEffect, ShaderEffect } from "melonjs";

const app = new Application(960, 540, { renderer: "WebGL" });

// 先创建并挂载一个精灵，后处理才会作用到画面里的内容
const hero = new Sprite(100, 100, { image: "hero" });
app.world.addChild(hero);

// postEffects：整帧渲染完成后叠加全屏 shader（CRT 扫描线 + 暗角）
app.camera.postEffects.push(new CRTEffect({
    scanlineIntensity: 0.3,
    vignette: 0.2,
}));

// ShaderEffect：只给 hero 这一个精灵加片段着色（此处简单增亮）
hero.effects.push(new ShaderEffect({
    fragment: `
        uniform sampler2D uSampler;
        varying vec2 vTextureCoord;
        void main() {
            vec4 color = texture2D(uSampler, vTextureCoord);
            gl_FragColor = vec4(color.rgb * 1.2, color.a);
        }
    `
}));
```

**逐部分解释**：
- `Sprite` 是带纹理的可渲染对象，必须先 `addChild` 到 `app.world`，摄像机才有东西可拍
- `postEffects` 作用于整屏，适合复古 CRT、色差；`hero.effects` 只改单个角色外观
- 若浏览器不支持 WebGL 而回退 Canvas2D，上述特效不会生效——发布前应在目标设备上实测

## 踩过的坑

1. **社区体量小于 Phaser**：官方示例和 Wiki 质量高，但第三方教程、资产包、招聘市场都小一圈，复杂问题常需上 Discord 提问。

2. **PhysicsAdapter 迁移**：v19.5 之后物理行为因适配器而异（内置 SAT vs matter vs planck），旧博客若写 `me.body` 细节，复制粘贴可能踩 API 差异。

3. **WebGL 特效静默失效**：在禁用 WebGL 的环境（某些旧版移动浏览器、企业安全策略）下，ShaderEffect 和 postEffects 不会报错但效果消失，需在 `Application` 构造时显式检测并降级 UI 提示。

4. **压缩 Tiled 地图缺插件**：TMX 使用 zlib/gzip/zstd 压缩时必须安装 `@melonjs/tiled-inflate-plugin`，否则 loader 报解析错误，官方 Platformer 教程默认用未压缩格式容易让人忽略这点。

## 适用 vs 不适用场景

**适用**：
- **轻量浏览器 2D 游戏**：横版跳跃、塔防、Whac-A-Mole 类小游戏，包体敏感或需嵌入现有网页
- **Tiled 工作流团队**：关卡设计师在 Tiled 画地图，程序只写 Entity 逻辑，管线几乎零胶水代码
- **Canvas 背景开发者**：已熟悉 HTML5 Canvas API，不想学 Phaser Scene 或 Pixi Container 抽象
- **教学/demo 项目**：CDN ESM 一行 import 即可跑，无 webpack 也能 Hello World

**不适用**：
- 需要 **3A 级编辑器生态** 和海量 Asset Store——选 [[phaser]] 或 Unity WebGL 导出
- **重度 3D** 主玩法——melonJS 虽有 3D mesh 支持，但核心仍是 2D 引擎，复杂 3D 选 [[heaps]] 或 Three.js
- **多人实时对战** 框架——引擎不含网络层，需自建 WebSocket/WebRTC 同步
- 团队已深度绑定 **React/Vue 组件树**——melonJS 自有场景图，与 SPA 状态管理集成需额外封装

## 历史小故事（可跳过）

- **2011 年前后**：Olivier Biot 发起 melonJS，目标是在 HTML5 Canvas 时代给 web 游戏一个开箱即用的 2D 引擎
- **2014—2016 年**：加入 WebGL 渲染路径，开始支持 Tiled 地图与等距视角示例
- **2018 年前后**：社区增长，Platformer 官方教程成为入门标配，Alex4 等 demo 游戏在 GitHub Pages 长期在线
- **2020 年代**：重写为 ES6 模块化 melonJS 2，esbuild 打包，TypeScript 类型内置；插件体系扩展 Spine、Capacitor、压缩 Tiled
- **2024—2025 年**：引入 PhysicsAdapter（matter/planck）、3D mesh、Trail 渲染、Aseprite 原生 tileset 支持；GitHub stars 突破 6k

## 学到什么

1. **"轻量"不等于"简陋"**：100KB 内仍可打包物理、音频、UI、多摄像机——关键是 tree-shaking 和统一 API，而不是堆依赖
2. **渲染抽象的最佳接口往往是开发者已会的**：melonJS 选 Canvas2D 语义而非发明新 DSL，降低了从原生 Canvas 迁移的门槛
3. **关卡编辑器集成是 2D 引擎的乘数**：Tiled 生态成熟后，引擎原生支持 TMX 比手写地图格式省下的时间，往往超过引擎本身的 learning curve
4. **双后端策略是 Web 游戏的现实选择**：WebGL 性能高但不保证可用，自动回退 Canvas2D 是面向真实用户环境的工程决策

## 延伸阅读

- 官方入门：[Platformer Tutorial](https://melonjs.org/tutorial/)（从零搭 Tiled 地图 + 玩家控制）
- API 文档：[melonJS Online API](https://melonjs.github.io/melonJS/)
- 在线示例：[Examples Gallery](https://melonjs.github.io/melonJS/examples/)（Platformer、Isometric RPG、Shader Effects 等）
- 脚手架：`npm create melonjs my-game`（Vite + TypeScript + debug 插件）
- Wiki：[Third-party Tools](https://github.com/melonjs/melonJS/wiki#third-party-tools-usage)（TexturePacker、Aseprite、Spine 工作流）
- [[phaser]] —— 功能更全的 JS 2D 框架，社区更大，适合中大型项目

## 关联

- [[phaser]] —— 同为浏览器 2D 引擎，Phaser 生态更大；melonJS 更轻、Tiled 集成更深
- [[pixi]] —— 专注 2D WebGL 渲染的库，无内置物理/关卡；melonJS 是完整游戏栈
- [[heaps]] —— Haxe 跨平台引擎，适合 2D+3D 原生发布；melonJS 锁定 Web 且更轻
- [[anime]] —— DOM 时间线动画库；melonJS Tween 处理游戏内对象插值，分工不同
- [[blinn-1977]] —— 经典 Blinn 着色模型；melonJS 内置 normal-map 2D 光照与之同属实时渲染范畴
- [[catmull-1974-zbuffer]] —— 深度缓冲是 3D 渲染基础；melonJS 3D mesh 模式同样依赖 Z-buffer 硬件测试

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）

