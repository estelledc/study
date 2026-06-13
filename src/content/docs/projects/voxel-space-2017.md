---
title: Voxel Space (Comanche-style raycaster, 2017)
来源: https://s-macke.github.io/VoxelSpace/
日期: 2026-06-13
分类: 图形学
子分类: 渲染与图形
provenance: pipeline-v3
---

# Voxel Space — Comanche 风格的射线投射地形渲染

## 一、日常类比：一张有起伏的桌布

想象你手里有一张巨大的塑料桌布，上面印着山川河流的图案。现在你在桌布的下面撑起很多根柱子——有的柱子高，桌布就被顶起来形成山；有的柱子矮，桌布就只是微微隆起。

Voxel Space 渲染的地形，本质上就是这张"被柱子撑起来的桌布"。只不过：

- 柱子的高度存在一张 **高度图（height map）** 里，每个格子存一个 0-255 的值
- 桌布的颜色存在一张 **颜色图（color map）** 里，每个格子存一个颜色值
- 你的"眼睛"（摄像机）在桌布上方飞，往下看

关键洞察：**颜色图里已经包含了阴影和光照效果**。引擎不需要实时计算光线——它只是把颜色图上的像素"贴"到屏幕上。这就像桌布上的图案本身就是画家画好光影的成品，你只需要把它正确地显示出来。

## 二、核心概念拆解

### 2.1 什么是"2.5D"？

现代 3D 引擎（如 Unity、Unreal）用**多边形**建模：把地形切成无数个小三角形，再给 GPU 算光照。

Voxel Space 是 **2.5D** —— 它只用两张 2D 贴图（高度图 + 颜色图），通过一种叫 **射线投射（ray casting）** 的方法"画"出 3D 效果。它不能做悬空建筑或树木（因为一个地面位置只能有一个高度值），但在 1992 年的 CPU 上，这已经是魔法了。

### 2.2 两个核心数据结构

| 数据结构 | 大小 | 含义 |
|---------|------|------|
| 高度图 (height map) | 1024 x 1024，每格 1 字节 | 记录地形每个点的高度 |
| 颜色图 (color map) | 1024 x 1024，每格 1 字节 | 记录地形每个点的颜色（含阴影） |

这两张图是 **周期性的**：走到图的右边会从左边出来，就像在一个无限延伸的世界上飞行。

### 2.3 渲染流程：从后往前画

Voxel Space 的渲染逻辑可以概括为 6 步：

1. 清屏
2. 从远处往近处画（保证遮挡关系正确）
3. 根据摄像机位置和视角，计算屏幕上每一列对应地图上哪一条线
4. 把这条线"切片"成屏幕宽度的若干段
5. 对每一段，查高度图和颜色图
6. 做透视投影，画一条垂直线

## 三、代码示例

### 示例 1：最简渲染循环（无旋转）

这是 Voxel Space 引擎的核心，不到 15 行伪代码：

```python
def render(p, height, horizon, scale_height, distance, screen_width, screen_height):
    """
    p         = 摄像机在地图上的 (x, y) 位置
    height    = 摄像机的海拔高度
    horizon   = 地平线在屏幕上的 y 坐标（越大越靠下）
    scale_height = 高度缩放因子（控制山的"陡峭程度"）
    distance  = 最大渲染距离
    """
    # 从远到近：z 从 distance 递减到 2
    for z in range(distance, 1, -1):
        # 计算当前深度 z 对应的屏幕左边缘和右边缘在地图上的坐标
        # 这对应 90 度视野角
        pleft  = Point(-z + p.x, -z + p.y)
        pright = Point( z + p.x, -z + p.y)

        # 把这条线分成 screen_width 段
        dx = (pright.x - pleft.x) / screen_width

        # 对屏幕的每一列画一条垂直线
        for i in range(0, screen_width):
            # 透视投影：离得越远(z越大)，同样的高度差看起来越小
            # 所以除以 z
            h = heightmap[pleft.x, pleft.y]
            height_on_screen = (height - h) / z * scale_height + horizon

            # 查颜色图，画垂直线
            color = colormap[pleft.x, pleft.y]
            DrawVerticalLine(i, height_on_screen, screen_height, color)

            # 移动到下一个采样点
            pleft.x += dx
            pleft.y += dx  # 90度视野时 dx == dy

# 调用：摄像机在 (0,0)，高度 50，地平线在 120，缩放 120，最远渲染 300
render(Point(0, 0), 50, 120, 120, 300, 800, 600)
```

**逐行理解：**

- `(height - h) / z` 是透视投影的核心公式。想象你站在山顶：远处的山谷看起来比近处的浅谷"压缩"得更厉害。除以 `z` 就是这个效果。
- `horizon` 是地平线位置。如果地平线在屏幕中间（比如 120/600），那屏幕下半部分就是地面，上半部分是天空。
- 从 `z = distance` 画到 `z = 2`（从远到近），这叫 **画家算法（painter's algorithm）**——先画远的，近的会遮住远的，自然产生遮挡关系。

### 示例 2：加入旋转 + 从近到远优化

实际游戏中你需要 360 度旋转视角。加入旋转后，核心变化是用 **正弦和余弦** 旋转坐标：

```python
def render_rotated(p, phi, height, horizon, scale_height, distance, screen_width, screen_height):
    """
    phi = 摄像机朝向的角度（弧度制）
    """
    # 预计算角度参数（循环外算一次，性能关键！）
    sinphi = math.sin(phi)
    cosphi = math.cos(phi)

    # 从近到远画，配合 ybuffer 优化性能
    ybuffer = np.zeros(screen_width)  # 每列已渲染的最高 y 值
    for i in range(screen_width):
        ybuffer[i] = screen_height

    dz = 1.0
    z = 1.0
    while z < distance:
        # 用旋转矩阵变换地图坐标
        pleft = Point(
            (-cosphi * z - sinphi * z) + p.x,
             ( sinphi * z - cosphi * z) + p.y)
        pright = Point(
             ( cosphi * z - sinphi * z) + p.x,
            (-sinphi * z - cosphi * z) + p.y)

        dx = (pright.x - pleft.x) / screen_width
        dy = (pright.y - pleft.y) / screen_width

        for i in range(screen_width):
            h = heightmap[pleft.x, pleft.y]
            height_on_screen = (height - h) / z * scale_height + horizon

            # 只画 ybuffer 之上未被遮挡的部分
            DrawVerticalLine(i, height_on_screen, ybuffer[i], colormap[pleft.x, pleft.y])

            # 更新遮挡记录
            if height_on_screen < ybuffer[i]:
                ybuffer[i] = height_on_screen

            pleft.x += dx
            pleft.y += dy

        # 远距离增大步距 = Level of Detail 优化
        z += dz
        dz += 0.2  # 越远步距越大，减少远处的绘制量

render_rotated(Point(0, 0), 0, 50, 120, 120, 300, 800, 600)
```

**这段代码的两个关键优化：**

1. **Y-Buffer 遮挡剔除**：从近到远画时，每一列记住"已经画到了多高"。后面的线如果比之前画的低，就不用画了——因为它被前面的山挡住了。这省掉了大量"从远到近"方案中不必要的底部填充。

2. **动态步距（Level of Detail）**：`dz += 0.2` 意味着离得越远，每次跳的深度越大。远处的地形用更少的扫描线渲染，近处用更密集的扫描线。这是一种粗糙的 LOD，但在 1992 年的 CPU 上非常有效。

## 四、为什么这个算法在当年是突破？

1992 年的 CPU 速度只有今天的约千分之一，而且没有 GPU。在这个条件下：

- **传统 3D 方法**：用多边形建模，需要大量的浮点运算做矩阵变换、光照计算、纹理映射——当时的 CPU 根本跑不动
- **Voxel Space 方法**：只需要查两张表（高度图和颜色图）、做一次除法（透视投影）、画几条垂直线——全部可以用整数运算完成

颜色图中预烘焙的光照和阴影是最大的聪明之处：**把最贵的光照计算提前做完了，运行时只负责"贴上去"**。

## 五、局限性与现代意义

**局限性：**
- 一个地面位置只能有一个高度值，不能有悬空结构、洞穴或建筑
- 无法动态改变地形（除非重新生成颜色图）
- 分辨率受限于贴图大小（原始 Comanche 是 1024x1024）

**现代意义：**
- 这种"从 2D 贴图生成 3D 地形"的思想在现代游戏引擎中依然常见（如 Unity 的 Terrain 系统也使用高度图）
- ray casting 技术在 Wolfenstein 3D（1992）中也有类似应用
- VoxelSpace 项目在 2017 年用 Web 技术重新实现了这个经典算法，让我们能在浏览器里直观地学习和交互

## 六、动手试试

VoxelSpace 项目提供了一个在线演示：https://s-macke.github.io/VoxelSpace/VoxelSpace.html

打开后你可以：
- 用鼠标控制飞行方向和高度
- 看到地形随着视角旋转而变化
- 感受这个 25 年前的算法在今天的浏览器里依然流畅运行

建议边玩边回想上面的公式：`(height - h) / z * scale_height + horizon`——这就是整个 3D 世界的核心。
