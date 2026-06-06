---
title: Heaps — 用 Haxe 一次编写、发布到任何平台的游戏引擎
来源: 'https://github.com/HeapsIO/heaps'
日期: 2026-06-06
分类: 图形学
子分类: 游戏引擎
难度: 中级
---

## 是什么

Heaps 是一个用 Haxe 语言编写的**跨平台高性能游戏引擎**，由 Haxe 语言的原始作者 Nicolas Cannasse 创建并开源。日常类比：像一个能把同一份手稿自动翻译成中、英、日、法四种语言印刷的出版社——你只写一次 Haxe 代码，它帮你"翻译"成 WebGL、原生桌面、iOS/Android 甚至游戏主机。

Heaps 的结构分为四个核心包：

- **h2d**：2D 渲染、精灵、动画、UI
- **h3d**：3D 模型加载与渲染、光照
- **hxd**：跨平台资源管理（图片、音频、字体……）
- **hxsl**：Heaps Shader Language——写一次着色器，自动翻译为 WebGL GLSL 或 DirectX HLSL

配合 **HashLink** 虚拟机，Haxe 代码编译后在桌面上的性能接近 C++，而同一份代码也可直接跑在浏览器里。Dead Cells（Motion Twin）、Northgard、Darksburg（Shiro Games）等销量破百万的商业游戏都以此为基础构建。

## 为什么重要

不理解 Heaps，下面这些事都没法解释：

- 为什么 Dead Cells 这款帧动画极度流畅的横版动作游戏能同时在 Switch 和浏览器里以 60fps 运行——背后是 Haxe 编译到不同目标的机制
- 为什么 Northgard 这款实时策略游戏在运行数百个单位时内存占用仍低于 500MB——HashLink VM 对 GC 开销的极度克制
- 为什么 Unity/Godot 之外还存在生产可用的引擎——Heaps 证明小型团队用自研引擎也能做商业 AAA 品质的游戏
- 为什么游戏引擎要抽象"渲染管线"——Heaps 的架构让你完全替换渲染器，无需改业务逻辑

## 核心要点

1. **Haxe 多目标编译**：Haxe 编译器把同一份代码编译为 JavaScript（浏览器）、HashLink 字节码（桌面/移动）或 C（主机）。这像是一个通才翻译官——你说中文，它根据听众自动切换语言。不同目标共享相同的游戏逻辑，只有底层渲染和 IO 层会换掉。

2. **场景图架构（Scene Graph）**：所有可渲染的对象（精灵、模型、UI）都是节点，挂在一棵树上。父节点的变换会自动传递给子节点——就像现实里移动一辆车，车上的乘客自然跟着动。渲染管线和光照系统完全可替换，Shiro Games 为每款游戏定制了专属的渲染效果。

3. **hxsl 跨平台着色器**：你用一种统一语法写 shader，编译时自动翻译为目标平台的原生着色器语言（WebGL 用 GLSL，DirectX 用 HLSL）。这解决了跨平台游戏开发中"一份 shader 代码维护两套"的痛点。类比：就像 TypeScript 被 Babel 编译成不同版本的 JavaScript，hxsl 被 Heaps 翻译成不同的 GPU 语言。

## 实践案例

### 案例 1：最小 2D 精灵程序

```haxe
class Main extends hxd.App {
    var bmp: h2d.Bitmap;

    override function init() {
        // 加载图片资源（hxd 统一管理，路径在 res/ 目录下）
        var tile = hxd.Res.mySprite.toTile();
        bmp = new h2d.Bitmap(tile, s2d);  // s2d 是当前 2D 场景根节点
        bmp.x = 100;
        bmp.y = 80;
    }

    override function update(dt: Float) {
        bmp.rotation += dt * 0.5;  // 每帧旋转，dt 是帧间隔秒数
    }

    static function main() hxd.App.run(Main);  // 启动入口
}
```

**逐部分解释**：
- `hxd.App` 是所有 Heaps 应用的基类，提供 `init()`（初始化）和 `update(dt)`（每帧回调）
- `s2d` 是 Heaps 自动创建的 2D 根场景，把 `bmp` 挂上去就能渲染
- `hxd.Res` 是跨平台资源管理器，同一行代码在 HTML5 和桌面上都能正确加载图片
- `dt`（delta time）是两帧之间的时间差，用它做运动保证帧率无关

### 案例 2：用 h2d.Interactive 响应鼠标点击

```haxe
override function init() {
    var tile = h2d.Tile.fromColor(0xFF5500, 80, 80);  // 创建纯色矩形 tile
    var bmp = new h2d.Bitmap(tile, s2d);
    bmp.x = 200; bmp.y = 150;

    // 创建交互区域，宽高匹配 tile
    var interact = new h2d.Interactive(80, 80, bmp);
    interact.onClick = function(e) {
        bmp.alpha = (bmp.alpha < 1) ? 1.0 : 0.3;  // 点击切换透明度
    };
    interact.onOver = function(e) {
        bmp.setScale(1.1);  // 鼠标悬停放大
    };
    interact.onOut = function(e) {
        bmp.setScale(1.0);
    };
}
```

**逐部分解释**：
- `h2d.Tile.fromColor` 动态创建纯色矩形，无需外部图片文件——开发初期快速原型的利器
- `h2d.Interactive` 是 Heaps 的事件层，它挂在普通的 h2d.Object 上，不侵入渲染逻辑
- `onClick / onOver / onOut` 是函数属性，直接赋值即可，这是 Haxe 的函数式风格
- 这套机制在 HTML5 和 HashLink 桌面版行为完全一致，无需平台判断

### 案例 3：hxsl 自定义着色器

```haxe
class WaveShader extends hxsl.Shader {
    // uniform 变量：从 CPU 侧传入 GPU
    @param var time: Float;
    @param var amplitude: Float;

    // vertex 着色器：修改顶点位置实现波浪效果
    var output: { position: Vec4, uv: Vec2 };

    function vertex() {
        // 根据 x 坐标和时间计算 y 偏移
        output.position = vec4(
            input.position.x,
            input.position.y + amplitude * Math.sin(input.position.x * 0.1 + time),
            0, 1
        );
        output.uv = input.uv;
    }
}

// 使用时：
var shader = new WaveShader();
shader.time = 0.0;
shader.amplitude = 10.0;
myBitmap.addShader(shader);

// 每帧更新：
override function update(dt: Float) {
    shader.time += dt;
}
```

**逐部分解释**：
- `hxsl.Shader` 是 Heaps 的跨平台着色器基类，这份代码会自动编译到 WebGL GLSL 或 DirectX HLSL
- `@param` 标记的变量是从 CPU 侧更新的参数，Heaps 自动处理 uniform 上传
- `Math.sin` 在 hxsl 里被翻译为各平台对应的 `sin()` 函数
- 整个着色器用类型安全的 Haxe 语法写，比手写 GLSL 字符串更不容易出错

## 踩过的坑

1. **Haxe 学习曲线陡峭**：Haxe 语法介于 Java、TypeScript 和 ActionScript 之间，有自己的宏系统和抽象类型，已知 JS/Python 的开发者需要额外 2-4 周适应期，不要低估这个成本。

2. **资源路径在 HashLink 和 HTML5 不同**：`hxd.Res` 加载本地文件时，HashLink 直接读文件系统，HTML5 需要额外的打包步骤。刚开始跨平台测试时很容易遇到"桌面 OK，浏览器 404"的问题。

3. **hxsl 类型错误信息难读**：着色器里类型不匹配时，报错信息来自编译后的 GLSL/HLSL，行号和变量名已被混淆，几乎无法直接定位问题。调试着色器时要善用"注释掉一半代码"的二分法。

4. **主机编译需要特殊授权**：Nintendo Switch / PS4 / Xbox 的编译目标需要先向任天堂/索尼/微软申请开发者资质，整个流程可能需要数周甚至更长时间，不要等到项目后期才考虑主机发布。

## 适用 vs 不适用场景

**适用**：
- 需要同时发布 Web + 桌面 + 移动 + 主机的小型独立游戏团队
- 希望对渲染管线有极细粒度控制（如自定义光照、后处理）的项目
- 愿意学习 Haxe 并享受其语言特性（宏、抽象类型）的开发者
- 对性能要求高但不想用 C++ 的 2D/3D 游戏

**不适用**：
- 需要大量第三方资产、插件生态的项目——Unity/Godot 社区资产多出几个数量级
- 团队成员已有 GDScript/C# 或 Blueprints 经验，切换到 Haxe 成本太高
- 需要成熟 IDE 集成、可视化场景编辑器的项目——Heaps 的编辑器工具较为简陋
- VR/AR 游戏——Heaps 对 VR 设备的支持几乎为零

## 历史小故事（可跳过）

- **2002 年前后**：Nicolas Cannasse 在法国游戏公司 Motion Twin 工作，为了解决跨平台开发痛点，开始研发 Haxe 语言（当时叫 haXe）。
- **2012 年**：Cannasse 离开 Motion Twin 创立 Shiro Games，将游戏引擎 Heaps 开源，并用它制作了像素风 RPG Evoland。
- **2014–2018 年**：留在 Motion Twin 的团队用 Haxe + Heaps 开发 Dead Cells，2018 年正式发售后销量超 500 万份，成为 Heaps 最有力的"活广告"。
- **2017–至今**：Shiro Games 相继用 Heaps 发布 Northgard（实时策略，百万销量）、Darksburg（2020）、Wartales（2022），证明引擎能撑起长线运营的商业项目。
- **2022 年**：Heaps 在 Hacker News 被重新发现，开发者惊讶地发现"我玩了几百小时的游戏原来是这个写的"——对一个只有 3.6k star 的引擎而言，这是极不寻常的认可。

## 学到什么

1. **编译目标 ≠ 运行时**：Haxe 的设计哲学是"语言只负责逻辑，目标平台只负责执行"，这让 Heaps 在多平台之间的移植成本极低——改平台时基本不改游戏代码
2. **场景图是渲染的通用语言**：无论 2D 还是 3D，把"可见物体挂到树上"的抽象足够通用，Heaps、Three.js、Cocos2d-x 都在用同一套心智模型
3. **小生态 ≠ 不成熟**：Heaps 社区比 Unity 小得多，但背后有多个百万销量游戏验证——选择工具时，"有没有大项目落地"比 GitHub star 数更重要
4. **自研引擎的代价是工具链**：Heaps 在渲染性能和跨平台上无可挑剔，但可视化编辑器、调试工具、IDE 集成明显弱于 Unity/Godot——自研意味着你要自己补这些"配套"

## 延伸阅读

- 官方文档：[Heaps.io Documentation](https://heaps.io/documentation/home.html)（API 参考 + 入门指南）
- 官方样例：[Heaps Live Samples](https://heaps.io/samples/)（可直接在浏览器跑的代码示例）
- Shiro Games 技术栈介绍：[Full Stack — Heaps.io](https://heaps.io/documentation/fullstack.html)（Dead Cells / Northgard 背后的完整技术架构）
- HashLink VM：[hashlink.haxe.org](https://hashlink.haxe.org/)（Heaps 的原生运行时，JIT + GC 细节）
- [[bevy]] —— Rust 写的 ECS 架构游戏引擎，与 Heaps 的场景图架构是两种不同哲学
- [[phaser]] —— 纯 HTML5/JS 的 2D 游戏框架，Heaps 的 h2d 在浏览器端是它的竞品

## 关联

- [[phaser]] —— 同为跨平台 2D 游戏框架，Phaser 锁定 Web，Heaps 多目标编译走得更远
- [[pixi]] —— PixiJS 专注浏览器 2D 渲染，Heaps 的 h2d/WebGL 目标与它重叠
- [[bevy]] —— Bevy 用 ECS 数据驱动架构，Heaps 用传统场景图，两种引擎设计哲学的典型对比
- [[love2d]] —— LÖVE 用 Lua 做跨平台 2D，Heaps 用 Haxe，相似的"轻量但强大"定位
- [[cocos2d-x]] —— Cocos2d-x 也走跨平台路线，主攻移动端；Heaps 更偏桌面和主机
- [[anime]] —— Anime.js 处理 Web 动画，Heaps 的 h2d.Anim 是游戏帧动画的对应物

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
