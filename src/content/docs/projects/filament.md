---
title: Filament — Google 跨平台 PBR 渲染引擎
来源: 'https://github.com/google/filament'
日期: 2026-06-06
分类: 图形学
子分类: 渲染与图形
难度: 高级
---

## 是什么

Filament 是 Google 开源的**跨平台实时物理渲染引擎**（PBR，Physically Based Rendering），支持 Android、iOS、Linux、macOS、Windows 和 WebGL。日常类比：它像一个懂物理的"光影翻译官"——你告诉它材质是金属还是橡皮、光从哪里来，它就按真实世界的物理规律计算出每个像素该有多亮、多有光泽。

引擎核心是 **Cook-Torrance 微面元 BRDF**（双向反射分布函数）的完整实现：把物体表面视为无数微小镜面的统计集合，用粗糙度（roughness）、金属度（metallic）、底色（baseColor）三个参数描述几乎一切真实材质，从哑光陶瓷到抛光钢铁。配合**基于图像的照明**（IBL，Image-Based Lighting）——把环境光预处理成辐射度贴图和 DFG 积分表——Filament 能在移动端跑出接近离线渲染的效果。

同一套 C++ API，通过 Vulkan/Metal/OpenGL ES/WebGPU 六个后端，让你写一次渲染逻辑在所有主流平台复用。Google Maps 3D 视图和多个 ARCore 应用已在生产中使用它。

## 为什么重要

不理解 Filament，下面这些事就没法解释：

- 为什么手机上的 3D 场景能出现真实质感的金属和皮革，而不是塑料感十足的"phong shading"
- 为什么 IBL 需要"预积分"步骤——没有 cmgen 离线处理，直接把 HDR 贴上去灯光就是错的
- 为什么 Google 要专门写 200 页文档配合这个引擎——PBR 数学推导不简单，matc 材质系统不直观
- 为什么"跨平台渲染"不是"改几行 if 语句"——Vulkan/Metal/WebGL 的同步模型、资源管理完全不同

## 核心要点

1. **Cook-Torrance BRDF = 微面元统计**：光打到粗糙表面，不是"一个镜面"，而是无数随机朝向小镜面的集合。法线分布函数（GGX）决定有多少小镜面"正好"反射向相机；几何遮蔽函数（Smith）决定有多少被旁边的小镜面挡住；菲涅尔项（Schlick 近似）决定掠射角的反射增强。三项相乘就是高光。类比：磨砂玻璃里有无数小棱面，斜着看才会出现强烈光晕——这就是菲涅尔。

2. **IBL 流水线 = 把环境预积分两次**：直接用 HDR 全景图做环境光，每帧计算代价太高。Filament 的工具 `cmgen` 把 HDR 贴图拆成两张：辐射度立方贴图（高光用，按粗糙度分 mip 级）和 irradiance 球谐系数（漫反射用）。运行时查表而非积分，同样效果、百倍加速。类比：提前把菜谱里所有材料切好备好，炒菜时直接下锅，而不是临时去超市买。

3. **Clustered Forward Renderer = 把灯光分格子**：传统 Forward 渲染每个像素对所有光源循环，100 个光源 = 100 次着色计算；Deferred 渲染把几何信息写入 G-Buffer（多张大纹理），移动 GPU 带宽吃不消。Clustered Forward 把视锥切成 3D 格子，**预计算**每个格子包含哪些光源，像素着色时只查自己格子的列表——通常每格只有个位数光源。结果：支持数百个实时光源的同时，G-Buffer 内存开销为零，对半透明物体友好（半透明物体无法写入 G-Buffer）。

## 实践案例

### 案例 1：Android 端加载 glTF 模型并渲染 IBL 场景

```java
// Gradle 依赖
implementation 'com.google.android.filament:filament-android:1.71.5'
implementation 'com.google.android.filament:gltfio-android:1.71.5'

// 初始化引擎
Filament.init();
Engine engine = Engine.create();
SwapChain swapChain = engine.createSwapChain(surface);
Renderer renderer = engine.createRenderer();

// 创建场景
Camera camera = engine.createCamera(EntityManager.get().create());
View view = engine.createView();
Scene scene = engine.createScene();
view.setCamera(camera);
view.setScene(scene);
```

**逐部分解释**：
- `Filament.init()` 在 Android 上必须第一个调用，加载 native 库
- `SwapChain` 绑定到 `Surface`（来自 SurfaceView/TextureView），是 GPU 和屏幕之间的缓冲队列
- `View` = 一次渲染通道的配置（分辨率、后处理开关）；`Scene` = 渲染对象的容器；两者解耦

### 案例 2：编写并编译自定义材质

```glsl
// my_material.mat（Filament 材质描述语言）
material {
    name : "CustomMetal",
    shadingModel : lit,
    parameters : [
        { type : sampler2d, name : albedoMap },
        { type : float,     name : roughness  }
    ]
}

fragment {
    void material(inout MaterialInputs m) {
        m.baseColor = texture(materialParams_albedoMap, getUV0());
        m.roughness = materialParams.roughness;
        m.metallic  = 1.0;
    }
}
```

```bash
# 用 matc 编译成平台无关字节码
matc -a opengl -o my_material.filamat my_material.mat
```

**逐部分解释**：
- `shadingModel: lit` 启用完整 PBR 光照；还有 `unlit`、`cloth`、`subsurface` 等模型
- `materialParams` 在 GLSL 中自动生成，对应 `.mat` 里声明的参数
- `.filamat` 是二进制字节码，运行时 Filament 按后端翻译成 GLSL/MSL/SPIR-V

### 案例 3：用 cmgen 预处理 IBL 环境贴图

```bash
# 从 HDR 全景图生成 IBL 资产（辐射度 cubemap + irradiance 球谐）
cmgen -x ./ibl_output --format=ktx --size=256 my_environment.hdr

# 生成文件：
# ibl_output/my_environment_ibl.ktx   ← 高光用（含 mip 链）
# ibl_output/my_environment_skybox.ktx ← 天空盒
```

**逐部分解释**：
- `--size=256` 是辐射度贴图分辨率，手机上 128 或 256 够用，桌面可到 512
- 生成的 `.ktx` 在 C++ 里用 `IndirectLight::Builder` 加载，与场景的 `IndirectLight` 绑定
- 不运行 cmgen 直接用原始 HDR 会导致 IBL 错误：高光全黑或漫反射过曝

## 踩过的坑

1. **matc 版本和运行时必须完全一致**：编译材质用了 1.70 的 matc，运行时库是 1.71，材质 blob 格式变了，直接崩溃——每次更新 Filament 版本都要重新编译所有 `.filamat`。

2. **IBL 不预处理、光照全错**：直接把 `.hdr` 贴到 `IndirectLight` 不生效，必须先跑 `cmgen` 生成 radiance/irradiance，否则高光不出现或漫反射异常亮。

3. **WASM 后端功能有限**：WebGL 2.0 后端不支持 MSAA，部分高级阴影（PCSS、EVSM）降级或关闭；`filamat` 材质编译在浏览器内存消耗极大，生产环境必须服务端离线编译。

4. **Clustered Forward 光源上限**：每个 cluster 格子能存的光源列表有上限（默认约 64 个/格），场景里超过几百个实时点光源时会出现 cluster overflow，远处灯光丢失——要么拆分场景，要么升高 cluster 精度（内存换正确性）。

## 适用 vs 不适用场景

**适用**：
- 移动端（Android/iOS）需要产品级 PBR 效果，追求小体积高效率
- 跨平台（PC/Mobile/Web）用同一套渲染逻辑，通过后端切换复用代码
- 学习 PBR 数学：配套的 filament.io 文档是最详细的免费 PBR 推导参考
- AR/XR 应用（Google ARCore 生态，真实感物体融入实拍画面）
- glTF 2.0 场景加载和展示

**不适用**：
- 需要完整游戏引擎功能（物理、脚本、编辑器 UI）——考虑 Godot / Bevy / Unity
- 离线渲染/影视 VFX（路径追踪、全局光照不在 Filament 设计范围）
- 纯 2D 游戏/动画——用 Pixi.js 或 PixiJS 更轻量
- 已经深度绑定 Unity/Unreal 工具链的团队，迁移成本高于收益

## 历史小故事（可跳过）

- **2018 年 Google I/O**：Google 随 Sceneform AR SDK 一起开源 Filament，同时发布 200 页 PBR 技术文档，这份文档被图形程序员社区迅速标记为"最好的免费 PBR 教材"。
- **2019-2020 年**：Vulkan 后端稳定，Metal 后端改进，Google Maps 开始将 Filament 用于 3D 地图渲染。
- **2021 年**：WebGPU 实验性后端上线，开始替换老旧的 WebGL 路径，支持更现代的 GPU 特性。
- **2022-2024 年**：AMD FidelityFX FSR 动态分辨率支持并入主线，TAA 抗锯齿和屏幕空间反射（SSR）完善，后处理管线（色调映射、景深、镜头光晕）持续丰富。
- **目前**：17k+ GitHub Stars，是移动端开源渲染引擎里功能最完整、文档最好的选项之一。

## 学到什么

1. **PBR 的核心是参数化物理模型**：roughness + metallic + baseColor 三个参数统一了几乎所有材质，比老式"漫反射/高光/光泽度"三张独立贴图更物理准确、更易直觉调整。
2. **跨平台 = 抽象层 + 后端工厂**：不是"条件编译"，而是定义统一 API（Engine/Renderer/Material），每个后端独立实现——Filament 的 backend/ 目录是优秀的跨平台图形 API 设计案例。
3. **IBL 预积分是实时 PBR 可行的关键**：把昂贵的半球积分拆成离线预计算 + 运行时查表，是"以空间换时间"在图形学的经典应用。
4. **工具链是引擎的一半**：matc、cmgen、filamesh 这些工具决定了资产管线能不能工作——没有好工具链，再好的运行时也难用。

## 延伸阅读

- 官方 PBR 推导文档：[Filament — 物理渲染数学推导](https://google.github.io/filament/Filament.html)（200 页，包含 BRDF 积分推导、IBL 预积分、色彩管理）
- 材质系统文档：[Filament Materials](https://google.github.io/filament/Materials.html)（matc 编译器用法、所有 shading model 参数）
- 视频：[Physically Based Rendering in Filament — Google Developers](https://www.youtube.com/watch?v=DbK5K4MxL9o)
- 学术背景：Walter et al. 2007 "Microfacet Models for Refraction through Rough Surfaces"（GGX 分布原始论文）
- [[threejs]] —— WebGL 渲染库，JavaScript 生态里的主流选择，比 Filament 更易上手但 PBR 深度较浅

## 关联

- [[threejs]] —— 同为跨平台 3D 引擎，Filament 走 PBR 精度路线，Three.js 走易用性路线
- [[babylonjs]] —— 功能更全的 Web 3D 引擎，与 Filament 的 WebGL 路径有竞争关系
- [[bevy]] —— Rust 游戏引擎，PBR 渲染架构受 Filament 影响，ECS 设计哲学不同
- [[panda3d]] —— Python 游戏引擎，渲染深度远不及 Filament，但教学/快速原型友好
- [[raylib]] —— 轻量级 C 图形库，不做 PBR，和 Filament 是不同用途的工具
- [[3d-force-graph]] —— 基于 Three.js 的图可视化库，用 WebGL 做节点图展示，场景简单无 PBR 需求
- [[pixi]] —— 专注 2D WebGL 渲染，和 Filament 3D PBR 完全不同赛道

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[babylonjs]] —— Babylon.js — 微软开源的企业级 Web 3D 引擎
- [[bevy]] —— Bevy — Rust 数据驱动 ECS 游戏引擎
- [[panda3d]] —— Panda3D — Disney/CMU 出品的开源 3D 游戏引擎
- [[pixi]] —— PixiJS — 浏览器里画 2D 的高性能 GPU 引擎
- [[raylib]] —— raylib — 极简 C 游戏库，10 行代码跑起带窗口动画
- [[threejs]] —— three.js — Web 3D 事实标准

