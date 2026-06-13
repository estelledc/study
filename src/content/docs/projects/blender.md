---
title: Blender — 全流程 3D 创作套件
来源: https://github.com/blender/blender
日期: 2026-06-13
子分类: 编辑器与 IDE
分类: CLI
provenance: pipeline-v3
---

## 是什么

**Blender** 是由 Blender Foundation 维护的**免费开源 3D 创作套件**，覆盖建模、雕刻、绑定、动画、物理模拟、渲染、合成、视频剪辑乃至 2D 动画（Grease Pencil）的完整管线。源码托管于 [blender/blender](https://github.com/blender/blender)，桌面版跨 Windows / macOS / Linux，也可作为 Python 模块 `bpy` 嵌入自动化流水线。

日常类比：如果把做 3D 内容比作**拍一部电影**，Blender 不是只负责「摄影棚」或「后期机房」的单一工具——它更像**自带摄影棚、道具间、化妆间、剪辑台和放映厅的综合制片厂**。你可以在同一个 `.blend` 项目文件里：捏一个杯子（建模）→ 给它上釉（材质）→ 让它从桌上滚下来（物理/动画）→ 打光渲染成 4K 静帧或 MP4（Cycles / EEVEE）→ 再叠一层字幕和调色（合成/视频编辑），全程不用换软件。

最小「程序化建一个立方体」脚本（在 Blender 脚本编辑器或 `--python` 运行）：

```python
import bpy

# 清空默认场景里的立方体、相机、灯光（可选）
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()

# 添加一个 2m 边长的立方体，位置抬高 1m
bpy.ops.mesh.primitive_cube_add(size=2, location=(0, 0, 1))
cube = bpy.context.active_object
cube.name = "MyCube"
```

四行有效操作 = 一个可渲染的 3D 物体出现在场景里。GUI 里按 `Shift+A` 做的事，脚本里用 `bpy.ops` 同样能做。

## 为什么重要

零基础学 3D，绕不开 Blender 的几个现实理由：

- **零授权成本**：个人、教育、商业项目均可免费使用（GPL 许可），不像 Maya / 3ds Max 按年订阅
- **全流程在一个文件里**：小团队不用在 DCC、渲染器、合成软件之间来回导出 FBX/OBJ
- **Python 一等公民**：界面里能点的按钮，几乎都能用 `bpy` 自动化——批量导入、程序化资产、渲染农场脚本
- **生态与就业**：教程、插件（Add-ons）、[[godot]] / Unity 工作流文档极多；建筑可视化、独立游戏、短视频特效常见 Blender 出身
- **实时与离线渲染兼备**：EEVEE（实时）快速预览，Cycles / 未来 Hydra 路径追踪出成片

## 核心要点

Blender 的心脏概念可以按「从空场景到成片」顺序理解：

### 1. 场景图：Object + Data

Blender 用 **Object（物体）** 包装 **Data-block（数据块）**。一个 `Object` 是场景里的「实例」——位置、旋转、缩放；背后的 `Mesh`、`Curve`、`Camera` 等才是几何/镜头数据。多个 Object 可以共享同一份 Mesh（类似游戏引擎的 prefab 实例）。

### 2. 三种编辑模式

| 模式 | 类比 | 做什么 |
| --- | --- | --- |
| **Object Mode** | 搬动展厅里的展品 | 整体移动、旋转、缩放 |
| **Edit Mode** (`Tab`) | 改展品本身的 clay | 改顶点/边/面拓扑 |
| **Sculpt Mode** | 数字泥巴捏形 | 高细分网格雕刻 |

### 3. 修改器栈（Modifiers）

非破坏性操作链：Mirror、Subdivision Surface、Array、Boolean… 像 Photoshop 图层一样可 reorder、可关掉预览。工业硬表面建模几乎离不开 **Mirror + SubD**。

### 4. 材质与节点（Shader Nodes）

Blender 4.x+ 默认 **Principled BSDF** 物理材质：Base Color、Roughness、Metallic 几个滑块就能出 plausible 结果。复杂效果用节点图（Noise → Bump → Mix Shader）拼装，和 [[unreal-engine]] / Unity Shader Graph 思路同源。

### 5. 动画：关键帧 + NLA + 约束

时间轴上 `I` 键插入 keyframe；**Armature（骨骼）** + **Weight Paint** 做角色绑定；**NLA** 把多段动作块叠在一起。物理（Rigid Body、Cloth、Fluid）可烘焙成缓存再渲染。

### 6. 渲染引擎

- **EEVEE Next**：实时 raster + 屏幕空间效果，适合预览、游戏资产、短视频
- **Cycles**：路径追踪，适合产品静帧、建筑可视化
- **Workbench**：无材质快速查看拓扑

输出：`F12` 渲染单帧，或 `Output Properties` 里设帧范围输出 PNG 序列 / FFmpeg 视频。

### 7. Geometry Nodes（几何节点）

Blender 3.0+ 的程序化建模/散布系统：用节点图生成实例、曲线、体积，类似 Houdini 的轻量入口。做草地、建筑群、参数化装置特别高效。

### 8. Python API 三件套

| 模块 | 作用 |
| --- | --- |
| `bpy.data` | 读写场景库：物体、材质、网格、动作 |
| `bpy.context` | 当前选中、活动物体、模式——跟 UI 状态同步 |
| `bpy.ops` | 调用操作符：建模、渲染、导入导出 |

## 实践案例

### 案例 1：批量创建一排彩色球体

适合理解 `bpy.ops` + 材质赋值：

```python
import bpy

colors = [
    (1.0, 0.2, 0.2, 1.0),
    (0.2, 0.8, 0.3, 1.0),
    (0.2, 0.4, 1.0, 1.0),
]

for i, rgba in enumerate(colors):
    x = i * 2.5
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.8, location=(x, 0, 0.8))
    obj = bpy.context.active_object
    obj.name = f"Ball_{i}"

    mat = bpy.data.materials.new(name=f"Mat_{i}")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = rgba
    obj.data.materials.append(mat)
```

**要点**：`default_value` 是 RGBA 四元组；每个物体可以独占一份 Material，也可以共享。

### 案例 2：给默认立方体做 120 帧旋转动画并渲染

```python
import bpy

obj = bpy.data.objects.get("Cube")
if obj is None:
    bpy.ops.mesh.primitive_cube_add(location=(0, 0, 1))
    obj = bpy.context.active_object

scene = bpy.context.scene
scene.frame_start = 1
scene.frame_end = 120
scene.render.fps = 24

# 第 1 帧：0°
scene.frame_set(1)
obj.rotation_euler = (0, 0, 0)
obj.keyframe_insert(data_path="rotation_euler", frame=1)

# 第 120 帧：绕 Z 转一整圈
scene.frame_set(120)
obj.rotation_euler = (0, 0, 6.283185307)  # 2*pi
obj.keyframe_insert(data_path="rotation_euler", frame=120)

# 可选：命令行无 UI 渲染
# blender scene.blend --python this_script.py -- --render-anim
# bpy.ops.render.render(animation=True)
```

**要点**：`keyframe_insert` 等价于用户在 UI 按 `I`；渲染前记得有 **Camera** 和 **Light**，否则全黑。

### 案例 3：命令行批处理（工作室常见）

不打开界面，在 CI 或渲染农场跑：

```bash
blender -b myscene.blend -o //render/frame_#### -F PNG -f 1
blender -b myscene.blend -a
```

`-b` 后台；`-o` 输出路径（`//` 表示相对 .blend 文件）；`-f 1` 只渲第 1 帧；`-a` 渲整个动画范围。

### 案例 4：导出 glTF 给 Web / 游戏引擎

```python
import bpy

bpy.ops.export_scene.gltf(
    filepath="/tmp/export.glb",
    export_format='GLB',
    export_apply=True,  # 应用修改器
    export_materials='EXPORT',
)
```

[[playcanvas]]、Three.js、[[godot]]、Unity 都原生吃 glTF/GLB；Blender 是免费 DCC 里 glTF 导出最成熟的之一。

## 界面与零基础上手路径

第一次打开 Blender 不要被默认立方体吓到。推荐 7 步闭环：

1. **熟悉视口导航**：中键旋转、Shift+中键平移、滚轮缩放；小键盘 `.` 聚焦选中物体
2. **Object Mode 下 G/R/S**：移动、旋转、缩放；`Ctrl+Z` 撤销
3. **Edit Mode 挤出（E）**：从一个面拉出厚度，做简单杯子/桌子
4. **Subdivision Surface 修改器**：让硬边变平滑
5. **Shading 工作区**：拖 Roughness / Metallic，加 HDRI 环境光
6. **Layout + 时间轴**：插两个 keyframe，空格播放
7. **F12 渲染一张图**：建立「我做出了成片」的正反馈

进阶再拆分支：硬表面（Boolean、Bevel）、角色（Retopo、Rigify 插件）、程序化（Geometry Nodes）、影视（Compositor、Video Sequencer）。

## 踩过的坑

1. **单位与尺度**：默认 1 Blender Unit = 1 米；物理模拟对尺度敏感——硬币大小的物体别按建筑尺寸建模
2. **法线方向**：面反了会出现黑块或 Boolean 失败；Edit Mode 里 `Alt+N` → Recalculate Outside
3. **应用缩放（Ctrl+A）**：绑骨、物理、导出 glTF 前常需 **Apply Scale**，否则行为诡异
4. **Cycles 渲太慢**：先 EEVEE 确认构图，再切 Cycles；降噪开 OpenImageDenoise，采样 128–512 视场景而定
5. **脚本在 Blender 外跑**：`pip install bpy` 可装独立模块，但版本与完整 Blender 不完全一致；生产自动化优先用官方 `blender --background --python`
6. **GPL 与插件**：链接 Blender Python API 的插件通常也需 GPL 兼容；闭源商业插件要读 license FAQ

## 适用 vs 不适用场景

**适用**：

- 个人/小团队 3D 资产、动画、静帧、短视频特效
- 游戏资产制作（低模 + UV + PBR 贴图 + glTF 导出）
- 建筑可视化、产品渲染、科普动画
- 程序化/批量场景生成（Python + Geometry Nodes）
- 学习 3D 全流程概念（拓扑、UV、绑定、渲染）

**不适用**：

- 超大规模影视 VFX 流水线（常配合 Houdini/Nuke，Blender 作环节之一可以）
- 需要官方 Autodesk 生态（Maya 绑定插件、Arnold 管线）的大厂标准
- 仅 2D 矢量/排版——用 Figma / Illustrator 更直接
- 实时 AAA 游戏**引擎**本身——Blender 是 DCC，运行游戏用 [[godot]] / Unity / Unreal

## 与其他工具的关系

| 工具 | 分工 |
| --- | --- |
| [[playcanvas]] / Three.js | 浏览器**运行** glTF 场景；Blender **制作** 场景 |
| [[godot]] | 游戏逻辑 + 实时运行；Blender 出模型/动画 |
| [[ffmpeg]] | 渲染出的 PNG 序列可再 `-i frame_%04d.png` 合成 MP4 |
| [[opencv]] | 读视频帧做 CV；Blender 做 3D 合成或生成训练用合成数据 |
| Maya / 3ds Max | 商业 DCC，流程类似；概念可迁移到 Blender |

## 学习资源

- 官方手册：[docs.blender.org/manual](https://docs.blender.org/manual/en/latest/)
- Python API：[docs.blender.org/api/current](https://docs.blender.org/api/current/)
- Blender Studio 开源电影项目（Spring、Coffee Run 等）——可下载 `.blend` 源文件拆解
- 入门：Blender Guru「Donut Tutorial」系列（经典甜甜圈）

## 小结

Blender 把 3D 制片厂塞进一个免费软件：Object/Data 场景图、修改器非破坏建模、节点材质、关键帧动画、EEVEE/Cycles 渲染、Python `bpy` 自动化，构成从零到成片的主干。零基础先用 GUI 走通「建模型 → 材质 → 灯光 → 渲染」闭环，再用脚本做批量与程序化，是性价比最高的学习路径。
