---
title: Heaps — Haxe 跨平台高性能游戏引擎
来源: 'https://github.com/HeapsIO/heaps'
日期: 2026-07-08
分类: graphics
难度: 中级
---

## 是什么

Heaps 是一个**用 Haxe 写 2D / 3D 游戏的跨平台图形引擎**，目标是让同一套游戏逻辑跑到浏览器、桌面、移动端和主机。日常类比：像一套能换插头的专业摄影灯——灯头、支架和调光逻辑不变，只是根据片场换不同电源线。

最小例子长这样：

```haxe
class Main extends hxd.App {
  override function init() {
    var tf = new h2d.Text(hxd.res.DefaultFont.get(), s2d);
    tf.text = "Hello Heaps";
  }

  static function main() {
    new Main();
  }
}
```

`hxd.App` 帮你开窗口、建渲染循环和准备 `s2d` / `s3d` 两个根场景；`h2d.Text` 把文字对象挂到 2D 场景上；`new Main()` 才真正启动应用。你写的是 Haxe，但输出可以是 JavaScript/WebGL，也可以是 HashLink 桌面程序。

它和 [[phaser]]、[[love2d]] 这类入门框架不同：Heaps 更像“给会写代码的游戏团队用的渲染底座”，编辑器少一点，底层控制多一点。官方展示页列出 Dead Cells、Northgard、Dune: Spice Wars 等商业游戏，说明它不是玩具 demo，而是能扛真实项目的工程工具。

## 为什么重要

不理解 Heaps，下面这些事会很难解释：

- 为什么 Haxe 游戏团队能用一套语言同时面向 WebGL、桌面、移动端和主机，而不是每个平台重写一套。
- 为什么 2D 和 3D 可以放在同一个应用里：UI、地图、角色、模型共享资源系统和主循环。
- 为什么高性能游戏引擎不一定要从 Unity / Unreal 这种大编辑器开始，代码优先路线也能做商业作品。
- 为什么 shader、资源打包、平台 target 这些“底层脏活”会直接影响游戏能不能稳定上线。

## 核心要点

Heaps 的核心可以拆成 **三件事**：

1. **场景根节点**：`s2d` 是 2D 根场景，`s3d` 是 3D 根场景。类比：同一个剧场里有平面字幕层和立体舞台层，你把对象放到哪一层，引擎就按对应规则渲染。

2. **强类型资源入口**：图片、字体、声音、模型放进 `res/` 后，可以通过 `hxd.Res.logo.toTile()` 这种方式访问。类比：仓库管理员给每个素材贴好标签，拿错名字会在编译期或启动期暴露，而不是玩家点到某关才黑屏。

3. **多 target 编译**：README 给出的样例可以编到 JS/WebGL、HashLink、Flash，官方文档还分别讲 HTML5 和 HashLink。类比：同一份菜谱，厨房可以用电磁炉、燃气灶或烤箱，但食材清单和做法主线不变。

这三件事合起来，是 Heaps 的差异点：它不是只帮你“画出来”，还把跨平台、资源、shader 和性能优化都放到同一套 Haxe 工作流里。

## 实践案例

### 案例 1：官方 Hello World，先确认渲染链路通了

官方入门会先建 `compile.hxml`：

```hxml
-cp src
-lib heaps
-js hello.js
-main Main
-debug
```

再写入口：

```haxe
class Main extends hxd.App {
  override function init() {
    var tf = new h2d.Text(hxd.res.DefaultFont.get(), s2d);
    tf.text = "Hello World";
  }
  static function main() {
    new Main();
  }
}
```

**逐部分解释**：`-cp src` 告诉 Haxe 源码目录；`-lib heaps` 引入引擎；`-js hello.js` 选择浏览器输出；`-main Main` 指入口类。代码里 `init()` 只在应用准备好后跑一次，适合创建首屏对象；文字挂到 `s2d`，说明它走 2D 渲染树。

### 案例 2：Base2D，把多个 sprite 挂到一个父对象

官方 Base2D 示例展示了 2D 常见写法：

```haxe
override function init() {
  hxd.Res.initEmbed();
  var obj = new h2d.Object(s2d);
  obj.x = Std.int(s2d.width / 2);
  obj.y = Std.int(s2d.height / 2);

  var tile = hxd.Res.hxlogo.toTile().center();
  for (i in 0...15) {
    var bmp = new h2d.Bitmap(tile, obj);
    bmp.x = Math.cos(i * Math.PI / 8) * 100;
    bmp.y = Math.sin(i * Math.PI / 8) * 100;
    bmp.alpha = 0.1;
    bmp.blendMode = Add;
  }
}
```

**逐部分解释**：`initEmbed()` 初始化内嵌资源；`obj` 是一组 bitmap 的父节点，移动父节点就能带着整组一起动；`toTile().center()` 把图片转成可绘制 tile 并把锚点移到中心；循环里 15 个 bitmap 共用同一张 tile，减少重复加载。

### 案例 3：Base3D，在 `s3d` 里放 mesh、材质和灯光

官方 Base3D 示例展示了 3D 最小骨架：

```haxe
override function init() {
  var prim = new h3d.prim.Cube();
  prim.translate(-0.5, -0.5, -0.5);
  prim.unindex();
  prim.addNormals();
  prim.addUVs();

  var tex = hxd.Res.hxlogo.toTexture();
  var mat = h3d.mat.Material.create(tex);
  var cube = new h3d.scene.Mesh(prim, mat, s3d);

  var light = new h3d.scene.fwd.DirLight(
    new h3d.Vector(0.5, 0.5, -0.5),
    s3d
  );
  light.enableSpecular = true;
}
```

**逐部分解释**：`Cube()` 只给几何形状；`addNormals()` 让灯光知道每个面朝哪边；`addUVs()` 让贴图知道怎么贴上去；`Material.create(tex)` 把资源变成材质；`Mesh(..., s3d)` 才把立方体放进 3D 场景；灯光决定它不是一块平面色块。

## 踩过的坑

1. **忘记初始化资源系统**：直接写 `hxd.Res.logo.toTile()` 可能找不到资源；原因是 `hxd.Res.initEmbed()`、`initLocal()` 或自定义 loader 必须先建立资源入口。

2. **把 2D 对象挂到 3D 心智里理解**：`h2d.Bitmap` 属于 `s2d` 的显示树，不会自动参与 3D 灯光；原因是 Heaps 明确分了 `h2d` 和 `h3d` 两套渲染语义。

3. **HTML5 target 忘记 canvas**：只生成 `game.js` 不够，页面里还要有 `canvas#webgl` 并加载脚本；原因是浏览器输出需要一个 WebGL 画布承接渲染。

4. **HashLink 后端库选错**：桌面运行要在 `hxml` 里选择 `hlsdl` 或 `hldx`；原因是窗口、输入和图形后端不是 Haxe 标准库自带的。

## 适用 vs 不适用场景

**适用**：

- Haxe 团队做 2D / 3D 游戏，希望一套代码覆盖 Web、桌面、移动端和主机。
- 需要高性能渲染、shader、资源打包和自定义管线，但又不想被完整编辑器工作流绑住。
- 已经有自己的关卡编辑器、数据表、构建系统，只缺一个稳定的图形和运行时底座。
- 想学习游戏引擎底层：场景树、材质、mesh、资源 loader、WebGL / HashLink target。

**不适用**：

- 完全零基础、想拖拽节点和可视化拼场景，优先看 [[godot]] 或 Unity。
- 只做普通 Web 2D 小游戏，且团队主要会 JavaScript，[[phaser]] 或 [[pixi]] 更直接。
- 只想学 Lua 写小原型，[[love2d]] 的概念更少，反馈更快。
- 需要大型现成资产商店、可视化动画时间线和非程序策划深度参与，Unity / Unreal 更成熟。

## 历史小故事（可跳过）

- **Haxe 背景**：Heaps 的作者 Nicolas Cannasse 也是 Haxe 语言的重要创建者，所以它天然围绕 Haxe 的跨平台编译能力设计。
- **商业验证**：官方展示页列出 Dead Cells、Northgard、Dune: Spice Wars、Wartales 等游戏，说明 Heaps 经历过真实项目压力。
- **社区入口**：GitHub 仓库约 3.6k stars，README 指向社区论坛、Discord、在线 sample 和 API 文档。
- **版本演进**：仓库长期以 `master` 为主线，官方页面仍把 HTML5、HashLink、H2D、H3D、HXSL 分成独立文档区维护。
- **生态气质**：它不像 Unity 那样“编辑器先行”，更像 Shiro / Motion Twin 这类代码团队沉淀出的内部工具逐渐开放。

## 学到什么

- Heaps 的第一直觉不是“一个游戏编辑器”，而是“Haxe 代码里的跨平台渲染运行时”。
- `s2d` / `s3d` 是读代码的地图：看到对象挂到哪棵树，就知道它受哪套渲染规则影响。
- 资源系统是生产力核心：`hxd.Res` 把图片、字体、模型、声音变成有类型的入口，减少路径字符串乱飞。
- 跨平台不是免费午餐：HTML5 要 canvas 和 WebGL，HashLink 要后端库，主机还需要对应平台资格。

## 延伸阅读

- 官方仓库：[HeapsIO/heaps](https://github.com/HeapsIO/heaps) —— README 写清平台、sample 编译方式和社区入口。
- 官方文档首页：[Heaps documentation](https://heaps.io/documentation/home.html) —— 从 H2D、H3D、HXD、HXSL 到 target platform 的总目录。
- 官方入门：[Hello World](https://heaps.io/documentation/hello-world.html) —— 最小项目结构、`compile.hxml` 和第一段 `hxd.App` 代码。
- 官方示例：[Live samples with source code](https://heaps.io/samples/) —— Base2D、Base3D、Particles、Filters、Shadows 等可运行示例。
- 官方展示：[About Heaps](https://heaps.io/about.html) —— 看它被哪些商业游戏和 jam 游戏用过。
- [[phaser]] —— 浏览器 2D 游戏框架，对照“完整 2D 系统”和 Heaps 的跨平台底座。

## 关联

- [[phaser]] —— 同样做游戏，但 Phaser 主战场是浏览器 2D，Heaps 更强调 Haxe 跨平台和 2D/3D 并存。
- [[pixi]] —— Pixi 偏 2D WebGL 渲染库；Heaps 包含资源、3D、shader 和多 target 工作流。
- [[godot]] —— Godot 编辑器和节点系统更完整；Heaps 更代码优先，适合已有工程管线的团队。
- [[love2d]] —— 都适合代码型游戏开发，但 LÖVE 用 Lua 做轻量 2D，Heaps 用 Haxe 扛更重的跨平台渲染。
- [[bevy]] —— 都是现代游戏引擎路线；Bevy 强在 Rust ECS，Heaps 强在 Haxe target 和实战渲染管线。
- [[owens-2007-gpgpu-survey]] —— 理解 GPU 可编程渲染背景后，再看 Heaps 的 HXSL 和现代 GPU 取向会更顺。
- [[williams-1983-mipmap]] —— 贴图、采样和 mipmap 是 2D/3D 引擎共同的底层知识。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
