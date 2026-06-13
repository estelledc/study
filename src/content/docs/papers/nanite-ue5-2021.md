---
title: Virtualized Geometry: Nanite Technology
来源: https://dev.epicgames.com/community/learning/tutorials/Yx5
日期: 2026-06-13
分类: 图形学
子分类: 渲染与图形
provenance: pipeline-v3
---

# Virtualized Geometry: Nanite Technology

## 一、日常类比：把整座山装进口袋

想象一下你去爬山。传统 3D 电影的做法，是有人预先沿着山路铺好了几级台阶——你只能在这些台阶上走，台阶之外的地方是空的，什么都看不到。如果山变得更大更精细，台阶就得铺得越来越多，最后连铺台阶的工人都累垮了。

Nanite 的做法完全不同：**它把整座山打成无数块大小不一的石头，每块石头都可以无限放大**。当镜头离得远时，它只给你看远处看起来够用的几块大石头；当你凑近看某块石头时，它瞬间把那块石头放大、展开成更高精度的版本——就像用投影仪把一幅地图从迷你版放大到铺满整面墙。

关键问题就来了：**怎么知道你"凑近"到了什么程度？怎么只渲染你看得到的那部分而不浪费资源？** Nanite 的答案是一套叫"虚拟几何体"（Virtualized Geometry）的架构。

## 二、核心概念拆解

### 2.1 从三角形到微图块（Micro-Blocks）

传统 3D 模型由三角形（triangles）构成。一个角色模型可能有 10 万个三角形，一座山可能有上亿个三角形。GPU 每次渲染都要处理所有这些三角形——不管你是不是只看其中一小块。

Nanite 首先把所有三角形打包成更小的单元：**微图块（micro-texels）**。你可以把它想象成把一张大海报切成一块块小方格，每一块小方格里都记录了颜色、深度、法线等所有渲染需要的信息。

```
传统三角形网格          Nanite 微图块网格
┌──────────────┐     ┌──┬──┬──┬──┐
│   /\         │     ├──┼──┼──┼──┤
│  /  \        │     │██│██│░░│░░│  ██=高精度  ░░=低精度
│ /    \       │     ├──┼──┼──┼──┤
│/______\      │     │██│░░│░░│░░│
│          10万  │     │░░│░░│░░│░░│
│       个三角   │     └──┴──┴──┴──┘
└──────────────┘     可动态切换精度层次
```

### 2.2 层次化 LOD 结构（Hierarchical LOD）

这是 Nanite 最核心的想法。把微图块像俄罗斯套娃一样一层层打包：

```
Level 0（最高精度）:  ████ ████ ████ ████    ← 原始几何数据
Level 1:             ████████ ████░░░░        ← 每 2x2 合并为 1 块
Level 2:             ████████████░░░░         ← 每 2x2 再合并
Level 3（最低精度）:  ██████████████████       ← 只剩很少的大块
```

每一层都是一张**虚拟纹理（virtual texture）**，GPU 只需要加载你当前需要的那几块到显存里。这就像浏览网页时，只有滚动到的区域才会加载高清图片。

### 2.3 虚拟纹理流送（Virtual Texture Streaming）

传统纹理：整张图全部塞进显存 → 显存爆了，画面就崩了。
Nanite 虚拟纹理：**按需加载，只加载需要的图块（page）**。

```
屏幕看到的区域        GPU 显存中的实际数据
                    ┌─────────────────┐
                    │  [页A] [页B]    │  ← 只加载了屏幕可见的图块
                    │                 │
镜头视锥体          │  [页C] [空闲]   │  ← 不可见的地方不加载
  ╲                 └─────────────────┘
   ╲  ╱
    ╲╱
```

判断"需不需要加载"的标准很简单：**这块几何体在屏幕上占多少个像素？** 如果只占 0.1 个像素（几乎看不见），就没必要加载高精度版本。

## 三、工作流程详解

### 3.1 离线处理：把资产"编译"成 Nanite 格式

Nanite 的计算量不在运行时，而在**离线预处理阶段**。当你把高模导入虚幻引擎 5 时：

```python
# 伪代码：Nanite 资产编译过程
# 输入：高多边形网格（可能是上亿个三角形）
# 输出：虚拟几何体资产（.virtualasset）

def compile_nanite_asset(high_poly_mesh):
    # 第 1 步：网格细分
    micro_blocks = split_into_microtexels(high_poly_mesh, target_size=8)

    # 第 2 步：构建层次 LOD 金字塔
    lod_levels = [micro_blocks]
    for level in range(1, num_lod_levels):
        # 合并上一层的相邻微图块
        combined = merge_adjacent_blocks(lod_levels[-1], factor=2)
        lod_levels.append(combined)

    # 第 3 步：生成虚拟纹理
    for i, lod in enumerate(lod_levels):
        compress(lod, target_bitrate=factor(4, i))  # 精度随层级递减

    # 第 4 步：生成边界包围盒
    bounds = compute_bounding_volumes(lod_levels)

    return VirtualAsset(
        levels=lod_levels,
        bounds=bounds,
        streaming_policy=adaptive
    )
```

### 3.2 运行时：GPU 自适应调度

运行时几乎不跑 CPU 逻辑——**一切都放在 GPU 上**。GPU 根据当前帧的情况自动决定：

```glsl
// 伪 GLSL：Nanite 渲染时的动态 LOD 选择逻辑
// 每个微图块在 GPU 上自主决定用哪一层 LOD

struct NanitePayload {
    vec2 screen_coverage;  // 在屏幕上覆盖的像素数
    float depth;           // 深度值
    uint desired_lod;      // 根据覆盖面积计算的 LOD 层级
};

void nanite_shader(inout NanitePayload payload) {
    // 核心判断：屏幕上占多少个像素？
    float pixel_area = payload.screen_coverage.x * payload.screen_coverage.y;

    // 根据像素面积选择 LOD 层级（值越大 = 精度越低）
    if (pixel_area > 10000) {
        payload.desired_lod = 0;     // 很远，用最高精度
    } else if (pixel_area > 1000) {
        payload.desired_lod = 1;
    } else if (pixel_area > 100) {
        payload.desired_lod = 2;
    } else if (pixel_area > 10) {
        payload.desired_lod = 3;
    } else {
        payload.desired_lod = MAX_LOD;  // 很近，可以用更低精度节省带宽
    }

    // GPU 只从对应 LOD 层级读取微图块数据
    // 自动跳过当前帧不可见的部分（视锥裁剪 + 遮挡剔除）
}
```

## 四、Nanite vs 传统 LOD 对比

| 特性 | 传统 LOD | Nanite |
|------|---------|--------|
| 切换方式 | 手动设置多个模型，切换时有" popping "突变感 | 自动连续切换，无跳帧 |
| 显存占用 | 所有 LOD 版本都需加载 | 按需加载，只加载可见部分 |
| CPU 开销 | 每帧 CPU 做距离判断和切换 | 全部 GPU 处理，CPU 几乎无负担 |
| 资产制作 | 艺术家手工制作每个 LOD 层级 | 一键自动从超高模生成 |
| 切换平滑度 | 有可见的突变（pop-in/pop-out） | 视觉上连续，无明显跳变 |

## 五、关键优势总结

**第一，消除了 LOD 切换的视觉瑕疵。** 你不再需要担心角色走近时突然"弹"出一个新版本——Nanite 的过渡是完全连续的，因为它是从纹理粒度层面逐步切换的。

**第二，把美术师从繁重的 LOD 制作中解放出来。** 以前你需要为同一个角色做 5-8 个不同精度的模型，每个都要手动减面、重做 UV、重新烘焙法线。现在：导入一个超高模，引擎自动处理。

**第三，显存效率极高。** 传统做法下，如果你场景里有 1000 个物体，每个都有 8 个 LOD，GPU 可能要把 8000 个模型版本都塞进内存。Nanite 只加载你在屏幕上能看到的部分——其他的全是虚拟的，不占显存。

**第四，CPU 零负担。** 传统引擎每帧都要遍历场景中所有物体、计算距离、做 LOD 判断。Nanite 把这些全部卸载到 GPU，CPU 不需要做任何决策。

## 六、学习小结

Nanite 的本质思想可以用一句话概括：**把几何体变成像纹理一样按需流送的东西。**

纹理早就做到了"只加载屏幕上可见的部分"，Nanite 让几何体也具备了这种能力。它不需要你手工准备 LOD，也不需要 CPU 做决策，更不会有切换时的跳帧感——因为它本质上不是在"切换模型"，而是在"切换分辨率"，就像你放大缩小一张数码照片，边缘始终是平滑的。

理解了"虚拟纹理"这个概念，你就理解了 Nanite 的 80%。剩下的 20% 是关于如何高效地构建层次化 LOD 金字塔、如何在 GPU 上做快速的可见性判定、以及如何处理法线和光照数据——这些是工程细节，但核心思想就是：让几何体和纹理共享同一套按需流送的架构。

## 七、延伸阅读

- Unreal Engine 5 官方文档：Nanite Virtualized Geometry
- Epic Games 技术博客：GDC 2021 Nanite 技术演讲
- 相关论文概念参考：Virtual Geometry (2021)
- 对比学习：传统 Mipmap 纹理技术（Williamson, 1983）
