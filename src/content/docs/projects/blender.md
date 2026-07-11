---
title: Blender — 全流程 3D 创作套件
来源: 'https://github.com/blender/blender'
日期: 2026-07-08
分类: editors
难度: 初级
---

## 是什么

Blender 是一个把建模、材质、动画、模拟、渲染、合成、运动跟踪和视频剪辑放在同一个工作台里的开源 3D 创作套件。日常类比：它像一间共享影棚，里面同时有泥塑台、灯光架、摄影机、剪辑台和渲染农场入口。

最小例子不是先学复杂界面，而是让 Blender 在后台打开一个 `.blend` 文件并渲染第 1 帧：

```bash
blender --background scene.blend --render-output //renders/frame_ --render-frame 1
```

这条命令里的 `--background` 表示不打开界面，`scene.blend` 是项目文件，`--render-output` 先指定输出路径，`--render-frame 1` 再真正开始渲染。它说明 Blender 不只是 GUI，也能被脚本和流水线调用。

GitHub 仓库是官方镜像，README 把它定位为完整 3D pipeline 的免费开源实现；官方手册、Python API 和仓库 `doc/python_api/examples` 则展示了命令行、脚本、插件与自定义工具的入口。

## 为什么重要

不理解 Blender，会卡在这些地方：

- 你会把 3D 创作误以为只能靠单一建模软件，忽略了从资产到成片其实是一条流水线。
- 你会以为 GUI 工具不能自动化，错过 `--background`、`--python`、`--command` 这类批处理能力。
- 你会分不清"场景数据"和"界面操作"，写脚本时把 `bpy.data`、`bpy.ops`、上下文混成一团。
- 你会低估开源创作工具的生态力量：插件、节点、格式导入导出和社区资产都围着同一个 `.blend` 数据库转。

## 核心要点

1. **一份场景数据库**：`.blend` 文件像一个仓库账本，里面记录对象、网格、材质、灯光、相机、动画曲线和合成节点。GUI 按钮和 Python 脚本都在改同一份数据，所以自动化和手工操作可以互相接力。

2. **多工作区但同一条流水线**：建模、雕刻、材质、动画、渲染、合成、视频剪辑看起来是不同房间，但交付物都回到场景和时间轴。类比做短片：先搭布景，再摆灯，再拍摄，再剪辑，Blender 把这些步骤放在同一个工程里。

3. **Python 是扩展胶水**：官方 API 让脚本能读写数据、调用工具、创建 UI 面板和注册命令。类比 Excel 宏：界面负责让人看得见，脚本负责把重复劳动变成按钮或命令。

## 实践案例

### 案例 1：后台渲染单帧

官方命令行手册列出 `--background`、`--render-output` 和 `--render-frame`，适合把 Blender 接进 CI、夜间任务或渲染队列：

```bash
blender --background shot.blend --render-output //out/shot_ --render-frame 42
```

逐部分解释：

- `--background`：不启动完整 UI，节省图形界面开销。
- `shot.blend`：先加载场景文件，后面的渲染命令才知道要渲染什么。
- `--render-output //out/shot_`：`//` 表示相对当前 `.blend` 文件的路径。
- `--render-frame 42`：渲染第 42 帧并保存。

这里最容易踩的点是顺序：官方手册提醒命令按出现顺序执行，所以输出路径要放在真正渲染之前。

### 案例 2：用 Python 改场景数据

官方 Python API overview 给出 `import bpy` 后直接改对象数据的例子。把它扩成一个入门脚本：

```python
import bpy

cube = bpy.data.objects["Cube"]
cube.location.x += 1.0

mat = bpy.data.materials.new("WarmClay")
mat.diffuse_color = (0.8, 0.45, 0.25, 1.0)
cube.data.materials.append(mat)
```

逐部分解释：

- `bpy.data.objects["Cube"]`：从当前 `.blend` 数据库按名字取对象。
- `cube.location.x += 1.0`：移动对象，界面里的视图会跟着变。
- `bpy.data.materials.new(...)`：新建材质要通过 `bpy.data` 集合，不是直接调用类构造器。
- `append(mat)`：把材质挂到对象的网格数据上。

这类脚本适合批量改资产、统一材质命名、给几十个镜头补相机参数。

### 案例 3：把脚本变成命令行工具

仓库里的官方 `bpy.utils.register_cli_command` 示例展示了自定义命令。简化后可以写成：

```python
import bpy

def hello(argv):
    print("Blender", bpy.app.version_string)
    return 0

def register():
    bpy.utils.register_cli_command("hello", hello)

if __name__ == "__main__":
    register()
```

运行方式：

```bash
blender --background --python cli_tools.py --command hello
```

逐部分解释：

- `--python cli_tools.py`：先执行脚本，让命令注册进 Blender。
- `register_cli_command("hello", hello)`：把 Python 函数暴露成 `--command hello`。
- `hello(argv)`：接收剩余命令行参数，返回 `0` 表示成功。
- 这种模式适合资产检查、批量导出、打印环境信息或给团队封装统一工具。

## 踩过的坑

1. **参数顺序写反**：`--render-frame` 一出现就开始渲染，放在 `--render-output` 前面会导致输出路径没生效。
2. **把 `bpy.ops` 当普通函数库**：很多 operator 依赖当前界面上下文；上下文不对时会触发 `poll()` 失败。
3. **直接 new 类型失败**：网格、材质、对象这类 Blender 数据要通过 `bpy.data.*.new()` 创建，因为生命周期由主数据库管理。
4. **后台线程乱碰 `bpy`**：官方 gotchas 明确说 Python 线程不安全，线程没结束就继续访问 Blender API 可能导致崩溃。

## 适用 vs 不适用场景

**适用**：

- 独立创作者或小团队需要从建模到成片的一体化工具。
- 需要把 3D 资产处理接入脚本、CI、渲染队列或批量导出流程。
- 想学习现代 3D 软件的数据模型、节点系统、渲染管线和插件机制。
- 需要开源、可扩展、可长期保存工程文件的创作环境。

**不适用**：

- 只做简单 2D 平面排版或照片修图，专门图像工具更轻。
- 大型影视公司已经深度绑定专有 DCC、资产管理和渲染农场流程，迁移成本很高。
- 只想写实时游戏逻辑，游戏引擎比 Blender 更适合作运行时。
- 完全不愿学习 3D 基础概念的人，入门曲线会比轻量剪辑器陡。

## 历史小故事（可跳过）

- **1989 年**：Ton Roosendaal 在荷兰动画工作室 NeoGeo 做内部 3D 工具，这是 Blender 的土壤。
- **1994 年 1 月 2 日**：官方历史把第一批名为 Blender 的源码文件视为项目生日。
- **2002 年 5 月**：Blender Foundation 成立，目标是把停摆的商业软件救回社区。
- **2002 年 10 月 13 日**：Free Blender 筹款后，Blender 以 GPL 形式开源。
- **之后**：开源电影项目不断反哺软件能力，GitHub 镜像也成长为万星级项目。

## 学到什么

- 一个强工具不一定只解决单点问题，Blender 的价值在于把 3D 创作链路收进同一份数据模型。
- GUI 和脚本不是对立面：界面让人探索，Python 让流程重复、检查和规模化。
- `bpy.data` 管数据，`bpy.ops` 调工具，命令行管批处理；分清三者，学习成本会下降很多。
- 开源创作软件的护城河来自社区作品、插件、文档和长期兼容，而不只是功能清单。

## 延伸阅读

- 官方仓库：[blender/blender](https://github.com/blender/blender)
- 官方手册：[Command Line Arguments](https://docs.blender.org/manual/en/latest/advanced/command_line/arguments.html)
- 官方 API：[Blender Python API Quickstart](https://docs.blender.org/api/current/info_quickstart.html)
- 官方历史：[Blender's History](https://docs.blender.org/manual/en/latest/getting_started/about/history.html)
- [[ffmpeg]] —— 理解 Blender 视频输入输出背后的编解码世界。
- [[shotcut]] —— 对比"完整 3D 套件"和"专注剪辑器"的边界。

## 关联

- [[ffmpeg]] —— Blender 的视频读写、转码和剪辑输出会遇到同一类编解码问题。
- [[shotcut]] —— Shotcut 专注时间线剪辑，Blender 则把剪辑放进更大的 3D pipeline。
- [[comfyui]] —— 两者都重视节点式工作流，只是 ComfyUI 面向扩散模型，Blender 面向 3D/合成/材质。
- [[panda3d]] —— Panda3D 更像运行时引擎，Blender 更像资产创作和前期制作工具。
- [[cocos2d-x]] —— Cocos2d-x 面向 2D 游戏运行时，Blender 可为游戏提供 3D 资产。
- [[gazebo-classic]] —— Gazebo 也处理 3D 场景，但目标是机器人仿真而不是艺术创作。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[aframe]] —— A-Frame — 用 HTML 搭 Web VR 场景
- [[appleseed]] —— appleseed — 物理渲染器
- [[assimp]] —— Assimp — 把 3D 模型格式统一成 aiScene 的导入库
- [[colmap]] —— COLMAP — 多视图 SfM/MVS 重建
- [[draco]] —— Draco — Google 3D 网格压缩
- [[freecad]] —— FreeCAD — 参数化 CAD
- [[gimp]] —— GIMP — GNU 图像处理程序
- [[gltf-transform]] —— glTF Transform — glTF 资产工具链
- [[godot]] —— Godot — 开源游戏引擎和编辑器
- [[inkscape]] —— Inkscape — 矢量图形编辑器
- [[kdenlive]] —— Kdenlive — KDE 非线性视频剪辑
- [[kicad]] —— KiCad — 电子电路 CAD
- [[krita]] —— Krita — 数字绘画专业编辑器
- [[librecad]] —— LibreCAD — 2D 工程绘图
- [[luxcorerender]] —— LuxCoreRender — 物理光线追踪
- [[mitsuba3]] —— Mitsuba 3 — 研究向可微渲染器
- [[ogre]] —— OGRE — 老牌 C++ 3D 渲染引擎
- [[open3d]] —— Open3D — 现代点云 / 几何库
- [[openscad]] —— OpenSCAD — 脚本式 CAD
- [[pcl]] —— PCL — 点云算法的学术工具箱
- [[raylib]] —— raylib — 极简 C 游戏库
