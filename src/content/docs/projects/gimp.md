---
title: GIMP — GNU 图像处理程序
来源: 'https://github.com/GNOME/gimp'
日期: 2026-07-09
分类: graphics
难度: 初级
---

## 是什么

GIMP 是一个开源的位图图像编辑器，全名是 GNU Image Manipulation Program。日常类比：如果 [[inkscape]] 像用尺子和圆规画可无限放大的工程图，GIMP 更像一张带很多透明胶片的工作台——照片、文字、阴影、蒙版各放一层，最后叠成一张图。

最小使用姿势可以简单到一条命令：

```bash
gimp-3.0 poster.xcf logo.png
```

这会启动 GIMP，并把已有工程文件和一张图片一起打开。真正的价值不在"能打开图片"，而在它把图层、选区、画笔、滤镜、脚本和插件都放进同一个桌面应用里，让个人创作者不用买商业套件也能做修图、合成、图标、游戏贴图和批量处理。

它的主仓库主要用 C 写，围绕 GTK、GEGL、libgimp 和 Script-Fu / Python 插件体系演化。GitHub 镜像约 1.4k stars，但真实开发主要在 GNOME / GitLab 生态里进行。

## 为什么重要

不理解 GIMP，下面这些事都不好解释：

- 为什么一个"修图软件"会有命令行 batch mode、Procedure Browser 和插件 API——它不只是 GUI，也是可脚本化的图像处理环境
- 为什么开源设计工具常常分工明显：GIMP 管像素，[[inkscape]] 管矢量，[[blender]] 管 3D，而不是一个工具包打天下
- 为什么图层、蒙版、混合模式这些概念是所有图像编辑器的共同语言——GIMP 是学习这套心智模型的低成本入口
- 为什么 30 年老项目还能活着：它把 C 核心、插件进程、脚本语言和用户界面拆开，慢慢替换底层也不必推倒重来

## 核心要点

GIMP 的能力可以拆成 **三层**：

1. **图层栈**：每个图层像一张透明胶片，顺序、透明度、混合模式和蒙版共同决定最终画面。类比：做海报时先铺背景，再放人物，再加文字，再贴阴影，任意一层都能单独改。

2. **PDB / 插件体系**：GIMP 把很多操作登记进 Procedural DataBase（PDB），插件和脚本可以像查菜单一样调用这些操作。类比：厨房不是只给厨师用，也给机器人手臂开放了"切菜、加热、装盘"接口。

3. **GEGL 滤镜管线**：现代 GIMP 的很多像素处理交给 GEGL，把"对每个像素做什么"组织成操作节点。类比：照片走一条流水线，先调曝光，再模糊，再锐化，每一步都能独立替换。

这三层合起来，让 GIMP 同时适合手工修图、脚本批处理和插件扩展。

## 实践案例

### 案例 1：不用打开界面，批量给 PNG 锐化

官方 Batch Mode 教程展示了一个真实需求：一整个目录的图片都要套同一个 Unsharp Mask 滤镜。可以先写一个 Script-Fu 函数，再用 `-i -b` 调起来：

```scheme
(define (batch-unsharp-mask pattern radius amount threshold)
  (let* ((filelist (cadr (file-glob pattern 1))))
    (while (not (null? filelist))
      (let* ((filename (car filelist))
             (image (car (gimp-file-load RUN-NONINTERACTIVE filename filename)))
             (drawable (car (gimp-image-get-active-layer image))))
        (plug-in-unsharp-mask RUN-NONINTERACTIVE image drawable radius amount threshold)
        (gimp-file-save RUN-NONINTERACTIVE image drawable filename filename)
        (gimp-image-delete image))
      (set! filelist (cdr filelist)))))
```

```bash
gimp -i -b '(batch-unsharp-mask "*.png" 5.0 0.5 0)' -b '(gimp-quit 0)'
```

**逐部分解释**：`-i` 表示不启动图形界面；`-b` 后面接要执行的 Script-Fu 表达式；`file-glob` 找到当前目录所有 PNG；`plug-in-unsharp-mask` 调用现成滤镜；最后 `gimp-quit` 让批处理进程退出。

这就是 GIMP 和普通"点按钮修图软件"的差别：菜单里能点的许多动作，也能被脚本成批调用。

### 案例 2：写一个 Python 插件，把文字层插进当前图片

GIMP 3 的开发者教程给了 Python 3 插件路线。核心动作是：声明插件、创建 text layer、插入图像、交给 `Gimp.main()` 注册。

```python
#!/usr/bin/env python3
import gi, sys
gi.require_version('Gimp', '3.0')
from gi.repository import Gimp

def run(procedure, run_mode, image, drawables, config, data):
    text = config.get_property('text')
    layer = Gimp.TextLayer.new(image, text, 'Sans-serif', 32, Gimp.Unit.pixel())
    image.undo_group_start()
    image.insert_layer(layer, None, 0)
    image.undo_group_end()
    return procedure.new_return_values(Gimp.PDBStatusType.SUCCESS, None)

class HelloText(Gimp.PlugIn):
    def do_query_procedures(self):
        return ['plug-in-demo-hello-text']

Gimp.main(HelloText.__gtype__, sys.argv)
```

```bash
chmod u+x py3-hello-text.py
```

**逐部分解释**：`gi.require_version` 选择 GIMP 3 绑定；`Gimp.TextLayer.new` 创建文字图层；`undo_group_start/end` 让用户一次撤销整个插件动作；`Gimp.main` 把这个 Python 文件变成 GIMP 能发现的插件进程。

这个案例说明：GIMP 的"可扩展"不是只改配置，而是能把自定义功能塞进菜单、PDB 和批处理流程。

### 案例 3：用 C 写插件，并用 gimptool 编译

官方 C 插件教程展示了更底层的路线：插件是独立进程，通过 libgimp 和主程序通信。最小 Hello World 插件会注册一个 PDB procedure，然后用 `gimptool` 构建。

```c
#include <libgimp/gimp.h>
#define PLUG_IN_PROC "plug-in-demo-hello-world"

static GimpValueArray *
hello_world_run (GimpProcedure *procedure, GimpRunMode run_mode,
                 GimpImage *image, GimpDrawable **drawables,
                 GimpProcedureConfig *config, gpointer data)
{
  gimp_message ("Hello World!");
  return gimp_procedure_new_return_values (procedure, GIMP_PDB_SUCCESS, NULL);
}
```

```bash
gimptool --build-noui c-hello-world.c
```

**逐部分解释**：`libgimp` 提供插件 API；`PLUG_IN_PROC` 是 PDB 里的稳定名字；`gimp_message` 把结果反馈到 GIMP；`--build-noui` 表示这个插件不需要链接图形界面库。

这个案例说明：GIMP 的复杂功能可以放在插件进程里跑，插件崩了也不应该把正在编辑的图片一起带崩。

## 踩过的坑

1. **Save 和 Export 不是一回事**：`.xcf` 保存图层、蒙版、路径和编辑状态；PNG / JPEG 是导出结果，很多编辑信息会被压扁或丢掉。

2. **批处理示例可能直接覆盖原图**：官方 batch 教程为了简单会原路径保存；真实工作流应该写到 `out/` 目录或先复制输入文件。

3. **旧教程和 GIMP 3 API 会错位**：GIMP 2 时代的 Python-Fu、旧 Script-Fu 路径和插件目录，到了 GIMP 3 经常要改成 Python 3 / GObject Introspection / 新解释器。

4. **图层模式不是对底层全局生效**：混合模式只影响当前层和下面可见层的组合；最底层或组内 pass-through 场景下，新手很容易以为按钮失灵。

## 适用 vs 不适用场景

**适用**：

- 修照片、抠图、合成海报、做游戏贴图、处理截图这种"像素级"工作
- 需要图层、蒙版、混合模式，但预算或许可证不适合商业软件的个人 / 小团队
- 想把重复图像处理脚本化，比如批量锐化、批量改尺寸、批量套滤镜
- 想学习桌面软件如何把 C 核心、插件进程和脚本语言接在一起

**不适用**：

- 矢量 logo / 图标系统设计——优先用 [[inkscape]]
- 数字绘画为主、需要完整笔刷体验——优先看 [[krita]]
- 3D 建模、动画、材质和渲染——这是 [[blender]] 的主场
- 专业印刷全流程、严格 CMYK / 专色 / 出血管理——GIMP 不是完整排版印前系统

## 历史小故事（可跳过）

- **1995 年**：Spencer Kimball 和 Peter Mattis 在加州大学伯克利开始写 GIMP，最初是学生项目。
- **1998 年**：GIMP 1.0 发布，逐渐成为 GNU / Linux 桌面上最重要的图像编辑器之一。
- **2000s**：插件、Script-Fu、GTK 生态一起成长，GIMP 变成很多发行版默认会打包的创作工具。
- **2018 年**：GIMP 2.10 把 GEGL / 高位深处理推到主线，老项目开始补现代图像处理能力。
- **2025 年后**：GIMP 3 系列迁移到 GTK 3 和新插件体系，长期目标是把老接口债慢慢还掉。

## 学到什么

1. **图像编辑的核心不是"一张图"，而是一叠可组合的状态**：图层、蒙版、混合模式让修改保持可回退。
2. **桌面 GUI 也可以有自动化入口**：PDB、batch mode 和插件 API 让 GIMP 同时服务鼠标用户和脚本用户。
3. **开源项目长寿靠边界清晰**：GIMP 专注位图编辑，不抢 [[inkscape]] 的矢量工作，也不抢 [[blender]] 的 3D 工作。
4. **老项目的难点是迁移，不是重写**：GIMP 3 的价值在于把 30 年生态带到新 API，而不是丢掉历史重新开始。

## 延伸阅读

- 官方仓库：[GNOME/gimp](https://github.com/GNOME/gimp)（GitHub 镜像，README 指向 GNOME 开发资源）
- 用户手册：[GIMP 3.0 Documentation](https://docs.gimp.org/3.0/en/)
- 官方教程：[GIMP Batch Mode](https://www.gimp.org/tutorials/Basic_Batch/)（命令行批处理入门）
- 插件开发：[How to write a plug-in](https://developer.gimp.org/resource/writing-a-plug-in/)
- 社区教程：[GIMP Tutorials](https://www.gimp.org/tutorials/)（图层蒙版、曲线、抠图等）
- [[krita]] —— 同类开源创作工具，但更偏数字绘画

## 关联

- [[krita]] —— 同属开源图像创作工具，Krita 更像画室，GIMP 更像修图台
- [[inkscape]] —— 矢量图形编辑器，和 GIMP 的像素编辑形成互补
- [[blender]] —— 3D 创作套件，常把渲染图或贴图交给 GIMP 做后期处理
- [[ffmpeg]] —— 命令行多媒体处理工具，和 GIMP batch mode 都体现"GUI 之外的自动化"
- [[pixi]] —— 浏览器 2D 渲染引擎，GIMP 常用于产出它要加载的贴图资源
- [[handbrake]] —— 同样把复杂媒体处理包装成普通用户能操作的桌面工具

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
