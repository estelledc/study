---
title: Heaps — Haxe 跨平台游戏引擎
来源: 'https://github.com/HeapsIO/heaps'
日期: 2026-06-06
分类: 图形学
子分类: 渲染与图形
难度: 中级
---

## 是什么

Heaps 是一个用 Haxe 语言编写的**跨平台高性能游戏引擎**，由 Haxe 语言原作者 Nicolas Cannasse 创建。日常类比：像一家可以同时出产中文版、英文版、日文版书籍的出版社——作者写一份稿子，出版社自动排成不同格式；Heaps 里你写一份 Haxe 代码，引擎自动编译出 Web / 桌面 / 手机 / 游戏主机四个版本。

Heaps 的核心由四个包组成：**h2d**（2D 渲染与 UI）、**h3d**（3D 模型渲染）、**hxd**（跨平台资源管理）和 **hxsl**（着色器语言）。配合 HashLink 虚拟机，Haxe 代码可以编译成高效的原生机器码。Dead Cells（Motion Twin）和 Northgard、Wartales（Shiro Games）等商业成功大作均以此为基础构建，GitHub 约 3.6k stars。

这和 Unity / Godot 最大的不同在于：Heaps 没有编辑器，它是**纯代码驱动**的引擎——如果你喜欢用代码精确控制每一帧发生了什么，它是一个极为干净的选择。

## 为什么重要

不理解 Heaps，下面这些事都没法解释：

- 为什么 Dead Cells 在 Switch 和 PC 上表现如此一致——一份 Haxe 代码同时编译到 HashLink 和 C，性能和逻辑完全对齐
- 为什么 hxsl 着色器可以既在浏览器里跑 WebGL GLSL、又在 DirectX 上跑 HLSL，而开发者只写一份
- 为什么 Northgard 一款 3D 策略游戏能把内存控制在 500MB 以内——HashLink VM 的浮点和面向对象优化
- 为什么小团队能用 Haxe 做跨平台独立游戏而不需要引擎授权费——Heaps 完全开源，无版税

## 核心要点

1. **Haxe 编译多目标：一份代码发布所有平台**

   Haxe 编译器是 Heaps 跨平台的核心。同一份 `Game.hx` 可以被编译成 JavaScript（浏览器 WebGL）、HashLink 字节码（桌面/移动原生）、C 代码（游戏主机 Switch/PS4/Xbox）。类比：这就像 Java 的"Write Once, Run Anywhere"，但不是靠 JVM 抹平差异，而是直接输出目标平台的原生代码，性能上限更高。

2. **HashLink VM：游戏性能的秘密武器**

   HashLink 是专为 Haxe 设计的高性能虚拟机，类似 .NET CLR，但针对游戏场景（大量浮点运算、深度继承树）做了优化。HashLink 字节码还能进一步编译成 C 代码来支持游戏主机平台。它让 Haxe 代码的运行速度接近原生，是 Northgard 3D 实时策略游戏能流畅运行的关键。

3. **场景图架构 + hxsl 统一着色器**

   Heaps 基于**场景图（Scene Graph）**架构：所有可渲染的东西都是 `h2d.Object` 或 `h3d.Object`，挂在一棵树上，父节点变换会自动传递到子节点。渲染管线完全可替换——可以为特定游戏写全自定义渲染器。hxsl 着色器语言在编译期自动翻译为目标平台的 GLSL（WebGL）或 HLSL（DirectX），开发者无需维护两份 shader 代码。

## 实践案例

### 案例 1：2D 精灵游戏——Dead Cells 风格横版动作

```haxe
class Main extends hxd.App {
    var hero : h2d.Bitmap;
    var anim : h2d.Anim;

    override function init() {
        // 加载精灵图集
        var tile = hxd.Res.sprites.hero.toTile();
        // 静态图片
        hero = new h2d.Bitmap(tile, s2d);
        hero.x = 100; hero.y = 200;

        // 帧动画：切割图集中的帧
        var frames = [for (i in 0...8) tile.sub(i * 64, 0, 64, 64)];
        anim = new h2d.Anim(frames, 12, s2d); // 12 fps
    }

    override function update(dt : Float) {
        // 响应键盘输入
        if (hxd.Key.isDown(hxd.Key.RIGHT)) hero.x += 200 * dt;
    }

    static function main() new Main();
}
```

**逐部分解释**：
- `hxd.App` 是所有 Heaps 程序的入口，`init()` 初始化场景，`update(dt)` 每帧调用
- `s2d` 是内置的 2D 场景根节点，所有 2D 对象挂上去就能渲染
- `h2d.Anim` 接收帧数组和帧率，自动处理帧切换，不需要手写计时器

### 案例 2：3D 策略游戏——Northgard 风格地图渲染

```haxe
class Map3D extends hxd.App {
    override function init() {
        // 加载 FBX 格式的地形模型
        var res = hxd.Res.models.terrain;
        var obj = res.toHmd().makeObject(s3d);

        // PBR 材质
        var mat = obj.getMaterials()[0];
        mat.mainPass.setPassName("pbr");

        // 添加平行光（太阳光）
        var dir = new h3d.scene.DirLight(
            new h3d.Vector(1, -2, -1), s3d
        );
        dir.color.set(1, 0.9, 0.7);

        // 相机定位
        s3d.camera.pos.set(0, -10, 8);
        s3d.camera.target.set(0, 0, 0);
    }
    static function main() new Map3D();
}
```

**逐部分解释**：
- `toHmd()` 把 FBX 转为 Heaps 的内部格式 HMD，包含几何体、骨骼和动画
- `setPassName("pbr")` 开启 PBR（基于物理的渲染），配合 `DirLight` 实现真实感光照
- HashLink 编译后这段代码在桌面以原生速度运行，内存占用通常低于同类 Unity 场景

### 案例 3：自定义着色器——hxsl 跨平台发光效果

```haxe
class GlowShader extends hxsl.Shader {
    static var SRC = {
        @param var glowColor : Vec3;
        @param var intensity : Float;

        var pixelColor : Vec4;

        function fragment() {
            // 叠加发光颜色
            pixelColor.rgb += glowColor * intensity;
        }
    };
}

// 使用时：
var shader = new GlowShader();
shader.glowColor.set(0, 0.8, 1); // 青色发光
shader.intensity = 0.5;
sprite.addShader(shader);
```

**逐部分解释**：
- `hxsl.Shader` 的 `SRC` 静态块是跨平台 shader 的定义，编译器自动翻译为 GLSL/HLSL
- `@param` 标记的字段暴露给 Haxe 代码控制，不需要手动绑定 uniform
- `addShader()` 支持多个 shader 叠加，渲染管线按顺序组合所有效果

## 踩过的坑

1. **Haxe 生态远小于 Unity/Godot**：Haxe 社区活跃但规模有限，可用的现成资产包（角色模型、音效、UI 组件）比主流引擎少很多，招聘有 Haxe 经验的开发者也更难。

2. **HashLink 调试工具链不成熟**：HashLink 没有像 Unity 那样的可视化 Profiler，崩溃时调用栈有时显示为内部字节码而非 Haxe 源码行号，排查困难。

3. **游戏主机发布门槛高**：编译到 Switch/PS4/Xbox 需要先通过官方注册成为授权开发者，申请流程耗时数月，对独立开发者不友好。

4. **文档和代码不同步**：官方 API 文档和 wiki 更新速度落后于代码库，尤其是 h3d 渲染管线部分，新手容易踩到已废弃的 API 或过时示例。

## 适用 vs 不适用场景

**适用**：
- 需要**真正跨平台**（Web + 桌面 + 主机）且不想维护多套代码库的独立游戏团队
- **代码驱动**偏好者：不想要拖拽式编辑器，希望用代码精确控制渲染管线的开发者
- **高性能 2D 游戏**：横版动作、策略、Rogue-like——Dead Cells 是最好的参考基准
- 对引擎授权费敏感的小团队（Heaps 完全免费，无版税）

**不适用**：
- 依赖**大量现成资产市场**的项目（Unity Asset Store 有数万资产，Heaps 生态暂无）
- 需要**可视化关卡编辑器**的设计师主导工作流（Heaps 没有内置编辑器）
- 大型 AAA 工作室——无官方商业支持，社区文档深度不够
- 移动端超休闲游戏——React Native Game Engine / Godot Mobile 生态更成熟

## 历史小故事（可跳过）

- **2002 年前后**：Nicolas Cannasse 在游戏公司 Motion Twin 工作时，因需要高效跨平台开发，创建了 Haxe 语言（从早期的 MTASC 工具演化而来）
- **2012 年**：Cannasse 离开 Motion Twin 创立 Shiro Games，将 Heaps 引擎开源，并用它制作第一款作品 Evoland
- **2014—2018 年**：Motion Twin 用 Haxe/Heaps 开发 Dead Cells，2018 年正式发售，销量突破 500 万份，让这个小众引擎进入大众视野
- **2017—2022 年**：Shiro Games 相继发布 Northgard（2017）、Darksburg（2020）、Wartales（2022），三款产品均基于 Heaps，证明引擎在 3D 策略场景的商业可行性
- **2022 年**：GitHub 上关于 Heaps 的讨论引发 Hacker News 热议，社区重新发现这个被多款商业大作验证的小众引擎

## 学到什么

1. **"一次编写，多平台发布"不只是 Java 的口号**——Haxe 编译到原生代码的方案证明，跨平台和高性能可以兼得，关键在于编译器目标而非运行时抽象层
2. **小生态 + 高质量验证 > 大生态 + 普通验证**：Heaps 用户少，但 Dead Cells 这样的案例比任何文档都有说服力；选技术栈时，已有的生产验证比 stars 数更重要
3. **场景图是游戏渲染的通用抽象**：不论 Unity 的 GameObject、Godot 的 Node 还是 Heaps 的 Object，树形结构 + 变换传递是游戏渲染的基础设计，理解它能迁移到任何引擎
4. **着色器跨平台的本质是编译期翻译**：hxsl 的思路（用一种 DSL 描述意图，编译器负责翻译到 GLSL/HLSL）与 SPIR-V（Vulkan 的中间表示）异曲同工，是现代图形编程的主流方向

## 延伸阅读

- 官方文档：[Heaps.io Getting Started](https://heaps.io/documentation/home.html)（涵盖 h2d/h3d/hxd/hxsl 四个包的入门教程）
- 视频教程：[Heaps Tutorial Series — YT](https://www.youtube.com/results?search_query=heaps.io+tutorial)（社区出品，涵盖从 Hello World 到完整游戏循环）
- Dead Cells 技术分享：[Haxe Summit 2018 — Motion Twin](https://haxe.org/videos/conferences/haxe-summit-us-2018/)（开发团队讲 Dead Cells 跨平台实战）
- HashLink 设计文档：[HashLink VM](https://hashlink.haxe.org/)（了解 VM 架构和 HL/C 编译流程）
- [[three-js]] —— 同样基于 WebGL 的 3D 渲染库，偏 Web 端，无原生编译能力
- [[wgpu]] —— Rust 的现代 GPU API 抽象，与 hxsl 的跨后端目标相似

## 关联

- [[three-js]] —— 同样做跨平台 WebGL 渲染，但局限于 Web；Heaps 多出了原生编译路径
- [[wgpu]] —— Rust 版 GPU 抽象层，hxsl 的跨 GLSL/HLSL 编译与 wgpu 跨后端的思路一脉相承
- [[opengl]] —— Heaps 在桌面端的底层渲染后端之一，理解 OpenGL 有助于调试 h3d 场景
- [[anime]] —— 同样服务于实时视觉效果，anime.js 处理 DOM 动画，h2d.Anim 处理游戏帧动画
- [[hashlink]] —— Heaps 的原生运行时 VM，Dead Cells / Northgard 性能的直接来源

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[anime]] —— anime.js — 一行 JS 让网页元素按时间线动起来

