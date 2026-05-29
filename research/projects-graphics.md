---
title: 项目候选 — 游戏引擎 / 图形工具 / 3D 渲染
日期: 2026-05-29
---

# 游戏引擎 / 图形工具 / 3D 渲染 项目候选

候选 60 个，按子类分组（游戏引擎 6 / 2D 游戏框架 6 / 3D 引擎与渲染框架 5 / WebGL·WebGPU 库 5 / 物理引擎 6 / 着色器与调试 5 / 3D 资产与几何 5 / 动画与骨骼 3 / AR·VR 4 / CAD·工程建模 4 / 离线 CG 渲染器 3 / 图像·视频编辑 4 / 游戏工具与像素艺术 4）。

已过滤现存"Canvas / 图像处理"主题：sharp / jimp / fabric-js / konva / pixi（5 个，均已收录），以及 blender（在 editors 候选）/ penpot / excalidraw（已在 projects）。本表只收"游戏引擎 / 3D 渲染 / 图形 API 库 / 物理 / 着色器 / CAD / 离线渲染 / 数字内容创作"等成品工具与运行时。

闭源（Unity / Unreal / Cocos Creator 二进制 / GameMaker / Construct / ImpactJS / Cursor 类编辑器、Substance / ZBrush、SolidWorks / AutoCAD、Houdini、Maya、Cinema4D、Pico-8、Procreate、SpriteKit / SceneKit、Adobe 全家桶、Spline / Vectary 等）一律跳过。Stars 量级为 2025-2026 区间近似值，仅作影响力参考。

## 游戏引擎（6 个）

| Slug | 项目 | Stars 量级 | 一句话价值 | URL |
|---|---|---|---|---|
| `godot` | Godot Engine — 节点树游戏引擎 | ~100k | GDScript + 自带编辑器 + 一键多平台导出，独立游戏开源旗舰 | https://github.com/godotengine/godot |
| `cocos2d-x` | Cocos2d-x — C++ 跨平台 2D/3D 引擎 | ~17k | 中国手游半壁江山起点，MIT 协议 + Lua/JS 绑定，理解 SceneGraph 范本 | https://github.com/cocos2d/cocos2d-x |
| `panda3d` | Panda3D — Disney/CMU 出品 3D 引擎 | ~5k | Python 优先 + C++ 内核，Disney 早期 MMO 战役坐骑，研究教育常用 | https://github.com/panda3d/panda3d |
| `bevy` | Bevy — Rust 数据驱动 ECS 游戏引擎 | ~42k | 纯 Rust + ECS + render graph，现代游戏引擎架构教科书 | https://github.com/bevyengine/bevy |
| `minetest` | Minetest / Luanti — 开源 Minecraft 替代 | ~10k | C++ 体素引擎 + Lua mod 系统，已更名 Luanti 仍是社区 voxel 范本 | https://github.com/minetest/minetest |
| `openrct2` | OpenRCT2 — 过山车大亨 2 重实现 | ~14k | 把 RCT2 用 C++ 完整重写并加多人，逆向 + 老游戏现代化经典案例 | https://github.com/OpenRCT2/OpenRCT2 |

## 2D 游戏框架（6 个）

| Slug | 项目 | Stars 量级 | 一句话价值 | URL |
|---|---|---|---|---|
| `phaser` | Phaser — HTML5 2D 游戏框架 | ~37k | TS 实现的 Web 2D 游戏首选，Tween/Physics/Tilemap 全栈 | https://github.com/phaserjs/phaser |
| `love2d` | LÖVE — Lua 2D 游戏框架 | ~3.5k | C++ 内核 + Lua 脚本，"五分钟显示一只小马"教学最佳入门 | https://github.com/love2d/love |
| `defold` | Defold — King 出品 Lua 引擎 | ~3.7k | 移动优先 + 一键打包，King（Candy Crush 母公司）2020 开源 | https://github.com/defold/defold |
| `heaps` | Heaps — Haxe 跨平台游戏引擎 | ~3.6k | Dead Cells / Northgard 同款，Haxe 编译多平台 + 高性能渲染 | https://github.com/HeapsIO/heaps |
| `melonjs` | melonJS — 轻量 JS 2D 引擎 | ~5.7k | 纯 JS 无依赖，Tiled 直接读取，作为对照 Phaser 的极简实现 | https://github.com/melonjs/melonjs |
| `raylib` | raylib — 极简 C 游戏库 | ~22k | 单头文件 + 80 个 examples + 多语言绑定，零基础入门图形编程标杆 | https://github.com/raysan5/raylib |

## 3D 引擎与渲染框架（5 个）

| Slug | 项目 | Stars 量级 | 一句话价值 | URL |
|---|---|---|---|---|
| `threejs` | three.js — Web 3D 事实标准 | ~108k | mrdoob 出品，几乎所有 WebGL 教程从它开始，组件化 Scene API 范式 | https://github.com/mrdoob/three.js |
| `babylonjs` | Babylon.js — 微软 Web 3D 引擎 | ~24k | TypeScript-first + 完整 PBR + WebXR + 节点编辑器，企业级 Web 3D | https://github.com/BabylonJS/Babylon.js |
| `playcanvas` | PlayCanvas — Web 3D 引擎 + 编辑器 | ~10k | 引擎 OSS + 在线编辑器商业，运行时极小，移动 web 游戏首选 | https://github.com/playcanvas/engine |
| `filament` | Filament — Google 跨平台 PBR 引擎 | ~17k | C++ + Vulkan/Metal/WebGL，IBL 流水线参考实现，渲染论文落地教材 | https://github.com/google/filament |
| `ogre` | OGRE — 老牌 C++ 3D 渲染引擎 | ~3.6k | 二十年场景图渲染抽象，Torchlight / Knights 早期商业项目用过 | https://github.com/OGRECave/ogre |

## WebGL / WebGPU 库（5 个）

| Slug | 项目 | Stars 量级 | 一句话价值 | URL |
|---|---|---|---|---|
| `regl` | regl — 函数式 WebGL 封装 | ~6.1k | Mikola Lysenko 出品，"调用即绘制"无副作用，Observable 数据可视化常用 | https://github.com/regl-project/regl |
| `twgl` | twgl.js — 极薄 WebGL helpers | ~2k | greggman（WebGL Fundamentals 作者）出品，去样板代码不抽象掉 API | https://github.com/greggman/twgl.js |
| `picogl` | PicoGL.js — 极简 WebGL2 包装 | ~1.6k | "把 WebGL2 写成像 OpenGL"的一千行实现，理解 GL 调用单元最佳 | https://github.com/tsherif/picogl.js |
| `luma-gl` | luma.gl — vis.gl WebGL2/WebGPU 抽象 | ~3k | Uber vis.gl 团队出品，deck.gl 基座，跨 WebGL2/WebGPU 统一层 | https://github.com/visgl/luma.gl |
| `deck-gl` | deck.gl — Uber 大规模数据可视化 | ~12k | 千万级点 + 地理坐标 + 分层 API，把 GIS 渲染做成声明式 | https://github.com/visgl/deck.gl |

## 物理引擎（6 个）

| Slug | 项目 | Stars 量级 | 一句话价值 | URL |
|---|---|---|---|---|
| `bullet` | Bullet — C++ 经典 3D 物理引擎 | ~13k | Erwin Coumans 出品，刚体 / 软体 / 布料一应俱全，影视游戏通吃 | https://github.com/bulletphysics/bullet3 |
| `box2d` | Box2D — Erin Catto C++ 2D 物理 | ~7.7k | 2D 物理算法之父，Angry Birds 同款，所有 JS 端口都从它派生 | https://github.com/erincatto/box2d |
| `matter-js` | matter.js — JS 2D 刚体物理 | ~17k | Web 端最易上手物理引擎，rigid body + constraint + 直接渲染 | https://github.com/liabru/matter-js |
| `cannon-es` | cannon-es — pmndrs 维护的 cannon.js 续 | ~2.4k | three.js 生态默认 3D 物理，原 cannon.js 停滞后社区接手 | https://github.com/pmndrs/cannon-es |
| `planck` | planck.js — Box2D 纯 JS 移植 | ~4.6k | 不依赖 Emscripten 的纯 JS Box2D，便于阅读源码学物理算法 | https://github.com/piqnt/planck.js |
| `rapier` | Rapier — Rust 现代物理引擎 | ~4.5k | 2D/3D 同源 + 确定性 + WASM 优秀，bevy/three.js 都能用 | https://github.com/dimforge/rapier |

## 着色器与图形调试（5 个）

| Slug | 项目 | Stars 量级 | 一句话价值 | URL |
|---|---|---|---|---|
| `glslify` | glslify — Browserify 风格 GLSL 模块 | ~2.4k | 把 require() 引入 shader 世界，npm 上百个着色器函数可即插即用 | https://github.com/glslify/glslify |
| `glsl-canvas` | glslCanvas — Book of Shaders 配套库 | ~1.5k | Patricio Gonzalez Vivo 出品，把 Shadertoy 写法直接嵌进网页 | https://github.com/patriciogonzalezvivo/glslCanvas |
| `shader-park` | Shader Park — 程序化 SDF 着色器 DSL | ~700 | JS DSL 描述 SDF 场景，自动编译 GLSL，让算法艺术更易写 | https://github.com/shader-park/shader-park-core |
| `hydra-synth` | Hydra — 实时视觉合成 livecoding | ~2.7k | Olivia Jack 出品，浏览器里写 chain API 即生成动态视觉，VJ 圈宠 | https://github.com/ojack/hydra |
| `spectorjs` | Spector.js — WebGL/WebGPU 调试器 | ~2.7k | BabylonJS 团队出品，一键抓取每帧 GL 调用并可视化，调试必备 | https://github.com/BabylonJS/Spector.js |

## 3D 资产与几何处理（5 个）

| Slug | 项目 | Stars 量级 | 一句话价值 | URL |
|---|---|---|---|---|
| `assimp` | Assimp — Open Asset Import Library | ~11k | 50+ 种 3D 格式统一为 aiScene，FBX/OBJ/glTF 通吃，引擎导入标配 | https://github.com/assimp/assimp |
| `draco` | Draco — Google 3D 网格压缩 | ~7k | 顶点 / UV / 法线压缩到 5-10x，Google Maps / glTF 默认压缩方案 | https://github.com/google/draco |
| `gltf-transform` | glTF Transform — glTF 资产工具链 | ~1.6k | Don McCurdy 出品，命令行 + JS API 优化 / 转换 / 检查 glTF | https://github.com/donmccurdy/glTF-Transform |
| `open3d` | Open3D — 现代点云 / 几何库 | ~12k | C++ 内核 + Python 接口，深度学习友好，激光雷达 / SLAM 工程默认 | https://github.com/isl-org/Open3D |
| `pcl` | PCL — Point Cloud Library | ~10k | 学术界点云算法集大成，KdTree / VoxelGrid / RANSAC 全家桶 | https://github.com/PointCloudLibrary/pcl |

## 动画与骨骼运行时（3 个）

| Slug | 项目 | Stars 量级 | 一句话价值 | URL |
|---|---|---|---|---|
| `spine-runtimes` | Spine Runtimes — 2D 骨骼动画运行时 | ~3.7k | Esoteric Software 出品，配套商业编辑器但运行时 OSS，10+ 引擎适配 | https://github.com/EsotericSoftware/spine-runtimes |
| `dragonbones` | DragonBones — 国产开源骨骼动画 | ~1k | Egret 出品，Spine 国产对位 + 网格变形 + 多语言运行时 | https://github.com/DragonBones/DragonBonesCPP |
| `rive` | Rive — 交互动画运行时 | ~7k | 状态机 + 矢量动画 + 跨平台 runtime，把动画做成可交互组件 | https://github.com/rive-app/rive-runtime |

## AR / VR（4 个）

| Slug | 项目 | Stars 量级 | 一句话价值 | URL |
|---|---|---|---|---|
| `aframe` | A-Frame — Web VR 框架 | ~17k | Mozilla 系出品，HTML 标签写 VR 场景，three.js 上面的声明式层 | https://github.com/aframevr/aframe |
| `mind-ar-js` | MindAR — Web 图像/人脸 AR | ~2.6k | 纯 JS 实现的图像追踪 + 人脸 AR，无需 ARKit/ARCore | https://github.com/hiukim/mind-ar-js |
| `ar-js` | AR.js — Web AR 标记追踪 | ~5.5k | 浏览器里跑 marker / location AR，移动端 60fps + 不用 App | https://github.com/AR-js-org/AR.js |
| `openxr-sdk` | OpenXR SDK — Khronos VR/AR 标准 | ~1k | 多家头显厂商共同后端，VR/AR 跨设备 API 标准，参考实现仓库 | https://github.com/KhronosGroup/OpenXR-SDK-Source |

## CAD / 工程建模（4 个）

| Slug | 项目 | Stars 量级 | 一句话价值 | URL |
|---|---|---|---|---|
| `openscad` | OpenSCAD — 脚本式 CAD | ~8k | "代码即模型"的程序员 CAD，3D 打印社区默认工具 | https://github.com/openscad/openscad |
| `freecad` | FreeCAD — 参数化 CAD | ~22k | 全功能参数化 CAD，PartDesign / 装配 / 工程图，对标 SolidWorks | https://github.com/FreeCAD/FreeCAD |
| `librecad` | LibreCAD — 2D 工程绘图 | ~2.2k | Qt 写的 AutoCAD-like 2D，DXF 原生，制图教学起点 | https://github.com/LibreCAD/LibreCAD |
| `kicad` | KiCad — 电子电路 CAD | ~2.5k | 原理图 + PCB + 3D 预览，CERN 加持的开源 EDA 旗舰 | https://github.com/KiCad/kicad-source-mirror |

## 离线 CG 渲染器（3 个）

| Slug | 项目 | Stars 量级 | 一句话价值 | URL |
|---|---|---|---|---|
| `appleseed` | appleseed — 物理渲染器 | ~2.3k | 现代离线渲染器，BVH / OSL / 光谱采样齐全，Maya/Blender 插件接入 | https://github.com/appleseedhq/appleseed |
| `luxcorerender` | LuxCoreRender — 物理光线追踪 | ~1.1k | LuxRender 续作，PathTracing + BiPathTracing + GPU，研究友好 | https://github.com/LuxCoreRender/LuxCore |
| `mitsuba3` | Mitsuba 3 — 研究向可微渲染器 | ~2.2k | EPFL 出品，可微渲染 + JIT 编译，神经辐射场 / 逆渲染论文实现常见基线 | https://github.com/mitsuba-renderer/mitsuba3 |

## 图像 / 视频编辑（4 个）

| Slug | 项目 | Stars 量级 | 一句话价值 | URL |
|---|---|---|---|---|
| `krita` | Krita — KDE 数字绘画 | ~1.4k | C++/Qt 出品，CMYK / 笔刷引擎专业级，对标 Painter，插画师首选 OSS | https://github.com/KDE/krita |
| `inkscape` | Inkscape — 矢量图形编辑器 | ~8k | C++ 实现的 SVG 原生编辑器，Illustrator 开源对标 | https://github.com/inkscape/inkscape |
| `gimp` | GIMP — GNU 图像处理程序 | ~1.4k | C 写的 Photoshop 开源对标，30 年老树，脚本 + 滤镜 + 图层栈 | https://github.com/GNOME/gimp |
| `kdenlive` | Kdenlive — KDE 非线性视频剪辑 | ~750 | MLT 框架 + Qt UI，免费视频剪辑首选之一，多轨 / 滤镜 / 关键帧全 | https://github.com/KDE/kdenlive |

## 游戏工具与像素艺术（4 个）

| Slug | 项目 | Stars 量级 | 一句话价值 | URL |
|---|---|---|---|---|
| `tiled` | Tiled Map Editor — 通用 2D 关卡编辑 | ~11k | Tile/Object/Group 标准化 2D 地图格式，几乎所有 2D 引擎都能读 | https://github.com/mapeditor/tiled |
| `aseprite` | Aseprite — 像素艺术 / 动画编辑器 | ~33k | 像素图 + 时间线动画工业标准，源码公开（许可受限），独立游戏首选 | https://github.com/aseprite/aseprite |
| `piskel` | Piskel — Web 像素艺术编辑器 | ~11k | 浏览器即开即画，Google 工程师出品的 Aseprite 网页轻量版 | https://github.com/piskelapp/piskel |
| `libsdl` | SDL — Simple DirectMedia Layer | ~10k | 跨平台多媒体层，几乎所有开源游戏的窗口 / 输入 / 音频底层 | https://github.com/libsdl-org/SDL |

## 备选 / 后续可补

下列项目质量同样在线，本轮配额已满或与已选有相邻替代关系，可作为替补：

- **游戏引擎**：urho3d（已归档，架构教学好材料）/ jmonkeyengine（Java 3D ~3.7k）/ stride（C# 3D，~6.5k）/ openttd（Transport Tycoon Deluxe 重实现 ~6k）/ flax-engine（C# + C++ 商业引擎部分 OSS）
- **2D 框架**：pyxel（Python 复古游戏 ~14k）/ kaplay（kaboom.js 后继 ~2k）/ solar2d（Corona 后继 ~3k）/ kiwijs（停滞）/ pygame（Python 2D ~7k，绑定 SDL）/ libgdx（Java 跨平台 2D ~22k）
- **3D 引擎**：bgfx（C++ 多 API 渲染抽象 ~15k）/ raylib 已收录于 2D 一栏，3D 部分同源 / Magnum（C++14 图形库 ~5k）/ flax-engine
- **WebGL / WebGPU**：wgpu（Rust WebGPU 实现 ~13k）/ litegl.js（极简 ~600）/ ogl（小三 ~3.5k）/ orillusion（中国国产 WebGPU 引擎 ~4.5k）/ tres-three（Vue3 + three.js 封装）
- **物理**：ammo.js（Bullet 的 Emscripten 端口）/ jolt-physics（Horizon Forbidden West 同款 ~6k）/ liquidfun（Box2D 软体扩展，已归档）/ pymunk（Python Chipmunk 封装 ~1k）
- **着色器**：naga（gfx-rs WGSL/SPIR-V 互转，含于 wgpu 仓库）/ glslang（Khronos GLSL 参考前端 ~3.3k）/ shaderc（Google GLSL/HLSL 编译器 ~2.5k）/ tooll3（节点式视觉 ~3k）
- **3D 资产**：MeshLab（点云 / 三角网处理 ~5k）/ openusd（Pixar USD 通用场景 ~6k）/ tinygltf / tinyobjloader（轻量 loader ~3k 各）
- **动画**：theatre-js（JS 时间线动画 ~10k，更偏 web）/ joints.js（结构化骨骼库）/ skeleton-mesh-baker
- **AR/VR**：threejs-xr / 8th-wall-bridge（闭源跳）/ webxr-samples / handtrack-js
- **CAD**：openrocket（火箭模拟 ~1k）/ qcad（部分 OSS）/ build123d（Python OCP CAD 包装 ~2k）/ cadquery（Python OCP CAD ~3k）
- **渲染器**：pbrt-v4（PBR 教科书配套 ~3k）/ tungsten（小型研究 ~1k）/ yafaray（Blender 插件渲染 ~250）/ embree（Intel BVH SDK ~2.5k）
- **图像 / 视频**：darktable（摄影 RAW 处理 ~10k）/ rawtherapee（RAW ~2k）/ shotcut（视频 ~10k）/ openshot（视频 ~5k）/ libresprite（aseprite OSS 分叉 ~3k）
- **游戏工具**：libgdx（已在 2D 备选）/ mapbox-gl-native（已被 maplibre 接续）/ maplibre-native（Mapbox OSS 替代 ~1.5k）/ harp.gl（Here 出品 web 3D 地图 ~3k）/ lottie（已在 projects）

## 选取与避坑说明

- **重复检查**：与 `src/content/docs/projects/*.md` 的 163 个现存 slug 做过 diff，本表 60 个 slug 全部新增，与已有 sharp / jimp / fabric-js / konva / pixi / excalidraw / penpot / blender（在 editors 候选）/ d3 / echarts / observable-plot / visx / recharts / lottie / gsap / framer-motion / react-spring / motion-one / anime / sortablejs / dnd-kit 等无重叠。godot / krita / inkscape 同时出现在 `projects-editors.md` 候选，若两表都被采纳应去重，仅取一处。
- **库 vs 引擎边界**：游戏引擎（A）= 完整编辑器 + 场景图 + 一键打包；2D 框架（B）= 纯代码运行时；3D 引擎与渲染框架（C）= 较大库或带编辑器的渲染层；WebGL/WebGPU 库（D）= 直接对应图形 API。学习时按"能写多少行就上手"的密度从 D → C → B → A 渐进。
- **闭源排除**：Unity / Unreal / GameMaker / Construct 3 / ImpactJS / Cocos Creator 二进制 / Houdini / Maya / Cinema4D / 3ds Max / SolidWorks / Substance / ZBrush / Pico-8 / Procreate / Spline / Vectary / Vrooli / Tencent / NetEase 内部引擎一律不收。aseprite 源码公开但许可受限（"shared-source"），保留收录但在备选注明 libresprite 作为纯 OSS 替代。
- **归档项目处理**：cocos2d-x（事实上 maintenance 模式，新版本 Cocos Creator 闭源）/ minetest（已更名 Luanti，老仓库仍指向新代码）/ urho3d（已归档，仅在备选）属于"维护中或更名但社区资料完整"的情况，作为成熟教学样本保留。
- **冷门控制**：所有候选都能搜到中文 / 英文一手文档 + 设计 blog / paper / 项目 wiki，可写 130-200 行入门词条。其中 godot / threejs / babylonjs / phaser / freecad / inkscape / gimp / blender 是中文社区资料最丰富的 8 项，适合做章节首发。
- **跨主题归属**：godot / krita / inkscape 与 editors 候选重叠，本表保留是因为它们的"图形渲染 / 场景图 / 笔刷引擎"维度更适合放在图形主题学；blender 同样属于图形领域但已在 editors 提案，避免双开就让 editors 优先。filament / bgfx / Magnum 等 C++ 多平台渲染层倾向放图形主题；libsdl / SDL_image 这类底层多媒体层也归这里。
- **学习路径建议**：Web 方向 → threejs → babylonjs → playcanvas → regl/twgl 看底层；C++ 方向 → raylib → ogre/filament → 物理引擎（box2d/bullet）→ 着色器（glsl-canvas + shader-park）；研究方向 → mitsuba3 / luxcorerender + open3d / pcl + draco / gltf-transform 走渲染论文复现路。
