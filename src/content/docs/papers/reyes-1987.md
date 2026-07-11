---
title: Reyes 1987 — 把电影级渲染拆成可流水线处理的小砖块
来源: 'Robert L. Cook, Loren Carpenter, Edwin Catmull, "The Reyes Image Rendering Architecture", SIGGRAPH Computer Graphics 1987'
日期: 2026-05-29
分类: 图形学
难度: 初级
---

## 是什么

Reyes 是一套**为电影画面服务的渲染架构**：先把复杂曲面切成比像素还小的微多边形，再统一做着色、可见性和采样。

日常类比：像拍一部大片时先把巨大的布景拆成一箱箱编号道具。导演不用关心道具原来来自木工、喷漆还是模型部门，只要每箱都能按镜头位置摆好、打光、拍摄。

它的名字常被解释为 "Renders Everything You Ever Saw"。论文真正重要的不是一个单点算法，而是把**曲面细分、微多边形、纹理局部性、随机采样、Z-buffer、分桶处理**组织成一条能扩展的生产管线。

## 为什么重要

不理解 Reyes，下面这些事都说不清：

- 为什么早期 RenderMan 能处理角色、毛发、位移贴图和复杂纹理，而不是只会画几个三角形。
- 为什么电影渲染不直接把所有几何都一次性塞进内存，而要分 bucket 一块块处理。
- 为什么微多边形适合曲面和位移贴图，却不是现代实时游戏主流。
- 为什么 Pixar 同期的随机采样、shade tree、shadow map 可以被装进同一条架构里。

## 核心要点

1. **统一成微多边形**：无论输入是球、双三次曲面、程序模型还是粒子，最后都尽量切成小四边形。类比：不同食材进厨房前先切成相近大小，后面的炒、煎、装盘就统一了。

2. **在合适坐标系做合适的事**：纹理在曲面自己的 `u/v` 坐标里处理，遮挡在屏幕坐标里处理。类比：裁布时按布料纹理量，拍照时按相机取景框量，不把两把尺子硬混在一起。

3. **用局部性换规模**：一次只展开当前对象或当前 bucket，纹理按连续块读取，Z-buffer 只保留需要的采样点。类比：仓库不把所有道具摊满操场，而是今天拍哪场就拉哪几箱。

## 实践案例

### 案例 1：一个曲面怎么被 dice 成微多边形

```txt
surface patch(u, v)
  bound = estimate_screen_size(patch)
  if bound is small enough:
    grid = dice(patch, target_size = 0.5 pixel)
    shade(grid)
  else:
    for child in split(patch):
      render(child)
```

**逐部分解释**：

- `estimate_screen_size` 先估计这个曲面在屏幕上有多大，大曲面继续拆，小曲面可以切格子。
- `dice` 沿曲面的自然 `u/v` 方向切，所以贴图和曲面网格对得上。
- `target_size = 0.5 pixel` 的意思是每个小块足够小，肉眼看不到曲面折线。

### 案例 2：bucket 为什么能省内存

```txt
for bucket in screen.tiles(16, 16):
  candidates = primitives_overlapping(bucket)
  for primitive in candidates:
    micropolygons = split_or_dice(primitive)
    put_overlapping_micropolygons_into_bucket(micropolygons)
  sample_and_zbuffer(bucket)
  discard(bucket)
```

**逐部分解释**：

- `screen.tiles` 把大画面切成小格子，一次只处理一格附近的内容。
- `put_overlapping_micropolygons_into_bucket` 让跨格子的微多边形被送到对应 bucket。
- `discard(bucket)` 是关键：算完就丢，内存压力不会随整部模型线性爆炸。

### 案例 3：微多边形和 Z-buffer 怎么合作

```txt
for sample in jittered_samples(pixel):
  hit = find_micropolygon_covering(sample)
  if hit.z < zbuffer[sample].z:
    zbuffer[sample] = { z: hit.z, color: hit.color }
pixel.color = filter(zbuffer.samples)
```

**逐部分解释**：

- `jittered_samples` 是随机抖动采样，用噪声替代锯齿和摩尔纹。
- `hit.z < zbuffer[sample].z` 是深度测试，谁更靠近相机谁赢。
- `filter` 把多个子采样点平均成最终像素，所以能自然支持抗锯齿。

## 踩过的坑

1. **把 Reyes 当成单个算法**：它更像厨房流水线，微多边形只是其中最显眼的一道工序。

2. **以为微多边形越小越好**：切太细会让着色和内存爆炸，论文专门用 diceable test 控制网格大小。

3. **忽略先着色再可见性的浪费**：被挡住的微多边形也可能已经着色，深度复杂度高的场景会多做很多无用功。

4. **把它和现代 path tracing 混为一谈**：Reyes 优先解决复杂几何和可控采样，现代路径追踪优先解决全局光照积分。

## 适用 vs 不适用场景

**适用**：

- 电影级离线渲染，尤其是曲面、位移贴图、复杂程序几何很多的镜头。
- 需要稳定抗锯齿、运动模糊、景深和可控纹理过滤的生产管线。
- 内存有限但模型巨大，必须靠分桶和局部性逐块处理的场景。

**不适用**：

- 现代实时游戏主渲染路径，因为 GPU 更擅长大批三角形光栅化和并行 shader。
- 强全局光照占主导的画面，单靠纹理和 shadow map 很难替代路径追踪。
- 大量透明、体积、粒子且难以给出紧致 bound 的对象，bucket 调度会变麻烦。

## 历史小故事（可跳过）

- **1982 年前后**：Lucasfilm 图形组已经在电影特效里探索随机采样、程序模型和曲面渲染。
- **1984 年**：Cook、Porter、Carpenter 的 distributed ray tracing 把运动模糊和景深变成采样问题。
- **1986 年**：Pixar 从 Lucasfilm 独立出来，短片《Luxo Jr.》展示了早期生产渲染能力。
- **1987 年**：Cook、Carpenter、Catmull 发表 Reyes 论文，把一组零散技巧整理成架构。
- **1988 年后**：RenderMan 把这套思想产品化，成为几十年电影特效管线的重要基础。

## 学到什么

- **架构的价值是组织复杂性**：Reyes 没靠一个魔法公式赢，而是把很多小技术排成可维护的流水线。
- **统一表示很强大**：所有对象变成微多边形后，后续模块就不用为每种几何写一套逻辑。
- **局部性是扩展性的前提**：能不能少翻磁盘、少占内存，决定了能不能渲染真正复杂的电影镜头。
- **工程取舍会过时，思想会留下**：今天主流离线渲染转向路径追踪，但 bucket、dicing、纹理局部性仍在影响生产系统。

## 延伸阅读

- 论文 PDF：[The Reyes Image Rendering Architecture](https://graphics.pixar.com/library/Reyes/paper.pdf)（原始 Pixar 技术库链接，当前可能跳转）
- DOI 页面：[ACM 10.1145/37401.37414](https://doi.org/10.1145/37401.37414)（SIGGRAPH 1987 正式记录）
- 相关论文：[[cook-1986-stochastic-sampling]] —— Reyes 里用于抗锯齿的随机采样基础
- 相关论文：[[catmull-1974-zbuffer]] —— Reyes 用 Z-buffer 管理每个采样点的可见性
- 相关论文：[[cook-1984-distributed-ray-tracing]] —— 同期把模糊效果统一成采样问题
- 现代对照：[[kajiya-1986-rendering-equation]] —— 解释现代路径追踪为什么后来接过电影渲染主线

## 关联

- [[catmull-1974-zbuffer]] —— Reyes 的采样点最后仍靠深度比较决定谁可见。
- [[cook-1986-stochastic-sampling]] —— Reyes 用 jittered samples 把锯齿转成更可接受的噪声。
- [[cook-1984-distributed-ray-tracing]] —— 同一批人把景深、动模糊、软阴影也组织成采样问题。
- [[catmull-clark-1978]] —— 细分曲面给 Reyes 提供了适合 dicing 的光滑几何输入。
- [[whitted-1980]] —— 光线追踪是 Reyes 当年刻意少用的另一条路线。
- [[kajiya-1986-rendering-equation]] —— 后来的路径追踪从全局光照角度重写了电影渲染主线。
- [[loop-1987-subdivision]] —— 同年提出的三角网格细分，和 Reyes 的曲面切分问题相邻。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[cook-1984-distributed-ray-tracing]] —— Distributed Ray Tracing — 把所有"模糊"效果统一成随机采样
- [[heckbert-1986-texture-survey]] —— Heckbert 1986 — 把"贴图"这件事讲清楚的第一篇综述
