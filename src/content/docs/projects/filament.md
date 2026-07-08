---
title: Filament — Google 跨平台 PBR 引擎
来源: 'https://github.com/google/filament'
日期: 2026-07-08
分类: graphics
难度: 中级
---

## 是什么

Filament 是 Google 开源的**实时物理渲染引擎**：同一套 PBR 材质、灯光、相机和后处理，可以跑在 Android、iOS、桌面、WASM、WebGL/WebGPU 等环境。

日常类比：它像一个“便携摄影棚”。你把模型、材质、灯光和相机交给它，它负责把不同平台的显卡细节收进后台，让画面尽量保持同一种质感。

最小心智模型不是“调用一个画三角形函数”，而是搭一条渲染流水线：

```cpp
Engine* engine = Engine::create();
Scene* scene = engine->createScene();
View* view = engine->createView();
Renderer* renderer = engine->createRenderer();

view->setScene(scene);
if (renderer->beginFrame(swapChain)) {
    renderer->render(view);
    renderer->endFrame();
}
```

这里 `Engine` 管资源，`Scene` 放物体和灯，`View` 决定相机和输出，`Renderer` 每帧把它们真正画出来。

## 为什么重要

不用 Filament 或不了解它，下面这些事会很难解释：

- 为什么一个 3D 模型在 Android 上像塑料，在 Web 上像金属：底层 PBR、色彩空间和 IBL 没对齐。
- 为什么移动端做“真实光照”不能照搬离线渲染：每帧只有十几毫秒，必须用近似、预计算和查表。
- 为什么材质不是一段随便写的 shader：Filament 要先用 `matc` 编译成 `.filamat`，再按后端生成变体。
- 为什么 glTF 只是资产格式，不是完整引擎：加载模型之后还要处理相机、天空盒、间接光、曝光和后处理。

## 核心要点

1. **PBR 是统一语言**：Filament 用 baseColor、metallic、roughness、reflectance 这类参数描述材质。类比：大家都用同一套菜谱，Android、iOS、Web 只是灶台不同。

2. **资产先烘焙，运行时少算**：材质用 `matc` 编译，环境光用 `cmgen` 预过滤，运行时主要查纹理和提交命令。类比：餐厅开门前先熬汤，客人来时只需要组合上桌。

3. **后端抽象藏住平台差异**：同一份上层 API 可以选择 OpenGL、Metal、Vulkan、WebGL/WebGPU。类比：你只写“把照片打印出来”，打印机驱动决定喷墨还是激光。

三点合起来，Filament 的价值不是“API 很短”，而是把实时图形里最容易跑偏的材质、灯光和平台兼容收成一套可复用工程。

## 实践案例

### 案例 1：Android 上把一帧画进 SurfaceView

官方 Android `hello-triangle` 示例的主线可以缩成这样：

```kotlin
companion object { init { Filament.init() } }

val engine = Engine.create()
val renderer = engine.createRenderer()
val scene = engine.createScene()
val view = engine.createView()

view.scene = scene
view.camera = engine.createCamera(engine.entityManager.create())

if (renderer.beginFrame(swapChain, frameTimeNanos)) {
    renderer.render(view)
    renderer.endFrame()
}
```

逐部分解释：

- `Filament.init()` 先加载 JNI 和底层库；Android 上很多 API 在这一步之后才安全。
- `Engine / Scene / View / Renderer` 是四个基本角色，分别管资源、内容、观看方式和提交帧。
- `beginFrame()` 可能返回 false，意思是 GPU 还没准备好；正确做法是跳过这一帧，而不是硬画。

### 案例 2：把 HDR 环境图变成 IBL 资产

官方构建文档推荐用 `cmgen` 把环境图预处理成可部署的间接光：

```bash
cmgen -f ktx -x ./ibls/ studio.exr
```

在应用里再把生成的 KTX 接到场景上：

```kotlin
val ibl = KTX1Loader.createIndirectLight(engine, iblBuffer)
scene.indirectLight = ibl.indirectLight
scene.indirectLight!!.intensity = 30_000.0f
```

逐部分解释：

- `studio.exr` 是真实环境光照片，`cmgen` 会生成漫反射 SH、预过滤镜面反射和天空盒资源。
- `-f ktx` 让输出适合 GPU 直接加载，减少应用启动时的转换成本。
- `scene.indirectLight` 负责“周围环境给物体补光”，没有它时 PBR 模型会像站在黑房间里。

### 案例 3：写一个最小材质并用 matc 编译

Materials 文档里的最小套路是先写 JSONish 材质，再编译成二进制包：

```text
material { name : "Red metal", shadingModel : lit }

fragment {
    void material(inout MaterialInputs material) {
        prepareMaterial(material);
        material.baseColor.rgb = vec3(1.0, 0.0, 0.0);
        material.metallic = 1.0;
        material.roughness = 0.2;
    }
}
```

```bash
matc -p mobile -o red_metal.filamat red_metal.mat
```

逐部分解释：

- `shadingModel : lit` 表示让 Filament 的标准光照模型接管，不需要自己重写整套 BRDF。
- `prepareMaterial(material)` 是必需步骤，它会准备内部材质状态；忘了它，后面的输入可能不完整。
- `-p mobile` 只生成移动端需要的 shader 变体，包更小，加载也更干净。

## 踩过的坑

1. **运行库和工具版本混用**：`matc`、`cmgen` 和 runtime 最好来自同一个 release，否则材质包或 IBL 可能出现不可解释的问题。

2. **把 roughness 当普通线性值**：Filament 文档明确区分 `perceptualRoughness` 和内部 roughness，移动端还会为了 fp16 精度做夹取。

3. **忘记 color space**：baseColor 常常来自 sRGB 图片，但 shader 计算在线性空间；不转换会让材质发灰或过曝。

4. **只加载 glTF，不布置光照**：模型出现了不代表画面对了；没有 skybox、indirectLight、相机曝光和 tone mapping，PBR 结果会很怪。

## 适用 vs 不适用场景

**适用**：

- Android / iOS / Web 需要同一套 3D 资产预览，比如商品、工业模型、AR 预览。
- 想学习现代 PBR 工程落地：Cook-Torrance、IBL、tone mapping、材质编译都能看到真实实现。
- 团队需要比 three.js 更贴近原生移动端，又不想从 Vulkan/Metal 从零写起。
- 已经采用 glTF 2.0 资产，希望把材质、动画、环境光接进高质量实时渲染。

**不适用**：

- 只想在网页里快速画几个几何体，three.js 的学习成本更低。
- 要完整游戏引擎能力，比如物理、编辑器、脚本、场景管理，Godot 或 Unity 更完整。
- 要做严格离线光线追踪或科研级光传输仿真，pbrt、Mitsuba 这类工具更合适。
- 团队没有图形工程维护能力，却计划深改材质系统；Filament 的底层复杂度不低。

## 历史小故事（可跳过）

- **2018 年前后**：Filament 以 Android PBR 引擎的形态公开，核心作者包括 Romain Guy 和 Mathias Agopian。
- **早期目标**：在移动 GPU 上做高质量材质，同时保持库体积和运行成本可控。
- **文档路线**：项目把 PBR 原理、Materials、Material Properties 单独写成大文档，像一本实时渲染工程教材。
- **平台扩展**：后来能力从 Android 扩到 iOS、Linux、macOS、Windows、WASM，并加入 Vulkan、Metal、WebGPU 等后端。
- **当前状态**：GitHub stars 已到 2 万量级，常被当作开源 PBR、IBL 和 glTF 渲染的参考实现。

## 学到什么

- **实时图形靠取舍，不靠蛮算**：Filament 把材质编译、环境光预过滤、BRDF 近似组合起来，才有移动端质量。
- **好引擎也是好教材**：读它的文档能看到“为什么选这个公式、为什么放弃那个更贵方案”的工程解释。
- **资产流水线和 runtime 一样重要**：没有 `matc`、`cmgen`、KTX、glTF loader，渲染 API 再漂亮也落不了地。
- **跨平台抽象不是抹平差异**：它是把差异集中管理，让业务代码少直接碰 OpenGL、Metal、Vulkan 的细枝末节。

## 延伸阅读

- 官方仓库：[google/filament](https://github.com/google/filament)
- PBR 主文档：[Physically Based Rendering in Filament](https://google.github.io/filament/Filament.html)
- 材质系统：[Filament Materials Guide](https://google.github.io/filament/Materials.html)
- IBL 工具：[cmgen 文档](https://google.github.io/filament/dup/cmgen.html)
- Android 示例：[sample apps README](https://github.com/google/filament/tree/main/android/samples)
- [[karis-2014-ue4-pbr]] —— Filament 的 PBR 取舍和 UE4 工程笔记一脉相承。

## 关联

- [[karis-2014-ue4-pbr]] —— 都在讲把电影级 PBR 压进实时帧预算。
- [[kajiya-1986-rendering-equation]] —— PBR 的理论源头，Filament 是它的工程近似。
- [[debevec-1998-rendering-with-natural-light]] —— IBL 思路的经典来源，Filament 用 `cmgen` 做环境光资产。
- [[heckbert-1986-texture-survey]] —— 纹理采样、mipmap 和过滤是实时材质的底层基础。
- [[threejs]] —— Web 3D 更易上手；Filament 更像跨平台 PBR runtime。
- [[godot]] —— Godot 是完整游戏引擎，Filament 更专注渲染内核和资产显示。
- [[sycl-cpp-2020]] —— 都在试图用上层抽象减轻多硬件后端的心智负担。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
