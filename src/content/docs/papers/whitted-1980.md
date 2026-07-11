---
title: Whitted 1980 — 让光线在场景里递归跑三种次级射线
来源: Turner Whitted, "An Improved Illumination Model for Shaded Display", CACM Vol.23 No.6, June 1980
日期: 2026-05-31
分类: 图形学
难度: 进阶
---

## 是什么

Whitted 1980 把"渲染一个像素"从**只看一个表面**升级成**让光线在场景里递归地走**。日常类比：你站在一面镜子前，镜子里又有一面镜子。Phong 1975 / Blinn 1977 只能告诉你这面镜子表面是什么颜色——但镜子里映出的另一面镜子，它们束手无策。Whitted 说：那就让光线**自己走进去**。

算法只有 5 行：

```
trace(ray, depth):
    hit = 求交(ray, 场景)
    color = Phong 局部着色(hit)               # 老办法
    if 表面是镜面 and depth < MAX:
        color += k_r · trace(reflection_ray, depth+1)   # 镜子里看一眼
    if 表面是透明 and depth < MAX:
        color += k_t · trace(refraction_ray, depth+1)   # 透过去看一眼
    for 每个光源:
        if not trace(shadow_ray, 0).hit_anything:        # 光源被挡住吗
            color += Phong 高光项
    return color
```

**三根次级射线**——reflection（反射）、refraction（折射）、shadow（阴影）——这套范式从 1980 年起 46 年没变。今天 RTX 游戏里的「RT 反射 / RT 阴影」开关，本质上还是在发这几类次级射线；硬件 API 怎么把它们拆成回调，见案例 3。

## 为什么重要

不理解 Whitted，下面这些事都没法解释：

- 为什么现代渲染器都先「打光线求交再着色」——递归求交骨架来自 Whitted；完整全局光照则是 Kajiya 等后继
- 为什么 NVIDIA 2018 年从光栅卡突然变成"RTX"——他们把 BVH（包围盒层次树）遍历和三角形求交做成了硬件单元
- 为什么 Quake II RTX、Cyberpunk 2077 的 "RT Reflection / RT Shadow" 选项是**分开**的——对应 Whitted 三根次级射线之一
- 为什么 Whitted 1980 那张 chrome 球 + glass 球 + 棋盘地板的图，今天每本图形学教材都印——它是早期把**反射 + 折射 + 阴影**算在同一帧里的标志图

之前 Appel 1968 的 ray casting 只找可见性，没法递归；Phong / Blinn 给局部着色，但玻璃球必须靠环境贴图骗。Whitted 把"递归"这一刀切下去，整个**真实感渲染**领域从此分成了 Whitted 之前和之后。

## 核心要点

三根次级射线，每根回答一个不同的物理问题：

1. **Reflection ray（反射射线）**——回答"镜子里映出什么"。从交点沿镜面反射方向（入射角 = 反射角）继续 trace，递归返回的颜色乘 `k_r` 加到当前色。chrome 球能映出周围场景就是这个。

2. **Refraction ray（折射射线）**——回答"透过玻璃看到什么"。Snell 定律算折射方向（依赖折射率比 `n1/n2`），递归 trace，乘 `k_t` 加到当前色。玻璃球后面的世界扭曲就是这个。注意全反射（total internal reflection）：临界角以外光线全部反射回去，要 if 切换。

3. **Shadow ray（阴影射线）**——回答"光源到我这条直线被挡了吗"。从交点指向光源，求交，**只要碰到任何东西**就说明被挡，光源不贡献 Phong 高光/漫反射项。**不递归**，单层。

递归终止两条件：`depth >= MAX`（一般 5）或贡献系数 `k_r · k_t · ... < ε`。否则玻璃缸里玻璃球会**指数爆栈**。

## 实践案例

### 案例 1：经典 chrome + glass 那张图怎么算出来

Whitted 1979 在 VAX 11/780 上渲染：512×512，单帧 **74 分钟**。每像素一根主光线，最多递归到 `depth=4`。chrome 球 `k_r=0.85, k_t=0`，glass 球 `k_r=0.1, k_t=0.85, n=1.5`。

一根碰到 glass 球的主光线展开成：

```
主光线 → glass 表面 (depth=0)
  ├── reflection ray → chrome 球表面 (depth=1)
  │     └── reflection ray → 棋盘地板 (depth=2) → 命中色
  └── refraction ray (Snell) → glass 内壁 (depth=1)
        └── refraction ray (再 Snell) → 棋盘地板 (depth=2) → 命中色
  + 每个光源一根 shadow ray，看是否被 chrome 球挡
```

一像素最坏情况 `2^4 = 16` 根次级射线。今天 RTX 4090 这种场景实时跑。

### 案例 2：教学版 raytracer（三根次级射线）

```js
function trace(ray, depth) {
  if (depth > MAX) return BLACK;
  const hit = scene.intersect(ray);
  if (!hit) return SKY_COLOR;
  let color = phongShade(hit);
  if (hit.material.kr > 0) {                         // 1) 反射
    const r = reflect(ray.dir, hit.normal);
    color = color.add(trace(new Ray(hit.point, r), depth + 1).mul(hit.material.kr));
  }
  if (hit.material.kt > 0) {                          // 2) 折射（全反射则改走反射）
    const t = refract(ray.dir, hit.normal, hit.material.ior);
    if (t) color = color.add(trace(new Ray(hit.point, t), depth + 1).mul(hit.material.kt));
  }
  for (const light of scene.lights) {                 // 3) 阴影
    const origin = hit.point.add(hit.normal.mul(0.001)); // epsilon，防自阴影
    if (!scene.intersectAny(new Ray(origin, light.dir)))
      color = color.add(specularTerm(hit, light));
  }
  return color;
}
```

逐步读：先局部 Phong；有 `kr` 就沿镜面再 trace；有 `kt` 就按折射率 `ior` 折射（`refract` 返回空则全反射）；最后对每个灯发一根不递归的 shadow ray。`0.001` 偏移是防 self-shadow acne 的第一坑。

### 案例 3：RT Core / DXR 怎么对应 Whitted

1. **Shader 发射线**：ray-generation 发主光线；closest-hit 里再发 reflection / refraction / shadow——对应 `trace()` 的递归调用。
2. **硬件只加速求交**：Turing RT Core 做 BVH 遍历 + 三角求交（量级约 10 Giga Rays/s）；miss / any-hit 仍是软件回调。
3. **颜色怎么回来**：次级射线命中后把颜色乘 `kr`/`kt` 加回，和 1980 的累加式一样——API 换皮，递归次级射线范式没换。

## 踩过的坑

1. **递归深度无控制 → 爆栈**：玻璃缸里玻璃球，光线在两层玻璃间来回反射可以无限。工程上 `depth >= 5` 强制终止，或贡献系数 `< 1e-3` 提前剪枝。

2. **shadow ray 自相交（self-shadow acne）**：交点直接发射 shadow ray，浮点误差让光线和自己求交得到 t≈0，整个面变黑。修法：起点沿法线偏移 epsilon（`hit.point + 0.001 · normal`）。

3. **能量不守恒**：Whitted 是经验模型，`k_a + k_d + k_s + k_r + k_t` 加起来可能 > 1，材质参数自己得守纪律。Kajiya 1986 rendering equation 才把能量守恒数学化。

4. **硬阴影 only**：单根 shadow ray 假设光源是点，得到的阴影边缘锐利刺眼。软阴影（penumbra）要 Cook 1984 distributed ray tracing 在面光源上随机采样。

5. **走样（aliasing）**：每像素一根主光线没抗锯齿，斜边会出现锯齿。Cook 1984 才 supersample。Whitted 论文里没解决。

## 适用 vs 不适用场景

**适用**：

- 镜面主导场景（金属、玻璃、水、冰），递归深度通常 `depth ≤ 5`
- 教学与实时局部增强（RTX 的 RT 反射 / RT 阴影）
- 离线里只要硬阴影 + 镜面/折射、不要求间接漫反射时

**不适用**：

- 间接漫反射贡献大时画面发黑（无 GI）→ Kajiya 1986 path tracing
- 焦散（相机反向追不到「灯→玻璃→地板」）→ Jensen 1996 photon mapping
- 软阴影 / 景深 / 运动模糊 → Cook 1984 distributed
- 次表面散射、毛发、烟雾 → 体积渲染，几何光线不够

## 历史小故事（可跳过）

- **1968**：Arthur Appel 发明 ray casting，只找可见性（"哪根光线碰到哪个面"），不递归
- **1979 SIGGRAPH**：Turner Whitted 在 Bell Labs 演讲，放出 chrome + glass 球视频，全场震惊
- **1980-06**：CACM 14 页论文正式发表
- **1984**：Robert Cook distributed ray tracing，软阴影 / 景深 / 运动模糊
- **1986**：Jim Kajiya 提出 rendering equation，path tracing，能量守恒
- **1997**：Eric Veach MIS（多重重要性采样），现代离线渲染基石
- **2018-08**：NVIDIA Turing 架构 RT Core，硬件 BVH + 三角求交
- **2019–2020**：Quake II RTX（2019）、Cyberpunk 2077（2020）用 DXR 做实时反射/阴影

从论文到硬件约 **38 年**；采样与材质早已演进，但**递归次级射线范式**仍在——图形学里最长寿的骨架之一。

## 学到什么

1. **递归是个好抽象**：把"光线碰到表面"和"从表面再发出新光线"统一成同一个 `trace()` 函数自调用。代码 5 行覆盖了 reflection / refraction / shadow 三种物理现象。
2. **算法形状决定硬件形状**：Whitted 算法把"求交"从着色里独立出来，所以 38 年后硬件能精确针对**这一件事**做加速单元。如果 1980 年没把算法切成"求交 + 着色"两层，今天就没有 RT Core。
3. **经验模型 → 物理模型是渐进的**：Whitted 把局部着色升到全局递归，但能量不守恒、只硬阴影、无 GI——这些坑后辈论文一个一个填。每个坑值一篇 SIGGRAPH。
4. **简洁的算法长寿**：5 行算法 46 年不过时。复杂的算法（如各种 hack 出来的 fake reflection）反而早被淘汰。

## 延伸阅读

- 论文 PDF：[Whitted 1980 — An Improved Illumination Model for Shaded Display](https://dl.acm.org/doi/10.1145/358876.358882)（CACM 14 页）
- 教程：[Peter Shirley — Ray Tracing in One Weekend](https://raytracing.github.io/books/RayTracingInOneWeekend.html)（一个周末用 C++ 写出 Whitted，零基础最适合）
- 工业版：[NVIDIA — DirectX Raytracing (DXR) Functional Spec](https://microsoft.github.io/DirectX-Specs/d3d/Raytracing.html)（看 Whitted 算法在硬件 API 里长什么样）
- [[phong-1975]] —— 局部着色前辈，Whitted 的内层 `phongShade(hit)` 调用它
- [[blinn-1977]] —— Phong 高光的兄弟改进，Whitted 也用
- [[cook-torrance-1982]] —— 同年代物理 BRDF，Whitted 算法可直接换上 Cook-Torrance 着色

## 关联

- [[phong-1975]] —— Whitted 的内层着色器，递归走到底用它给一个表面上色
- [[blinn-1977]] —— Phong 高光的实用化版，Whitted 实现里通常用这个
- [[cook-torrance-1982]] —— 同年代物理 BRDF，可在 Whitted 框架里替代 Phong
- [[3d-gaussian-splatting]] —— 现代实时渲染的另一条路，用大量光斑代替光线追踪

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[cohen-1985-hemicube]] —— Cohen-Greenberg 1985 Hemicube — 把渲染硬件挪去算辐射度积分
- [[cook-1984-distributed-ray-tracing]] —— Distributed Ray Tracing — 把所有"模糊"效果统一成随机采样
- [[goldsmith-1987-bvh]] —— Goldsmith-Salmon 1987 — 让计算机自己给场景搭层次包围盒
- [[goral-1984-radiosity]] —— Goral 1984 Radiosity — 把建筑工程的辐射热传导算法搬进图形学
- [[hanrahan-1991-hierarchical-radiosity]] —— Hanrahan 1991 Hierarchical Radiosity — 让 radiosity 从 O(n²) 跌到 O(n)
- [[karras-2012-parallel-bvh]] —— Karras 2012 — 让每个 BVH 内部节点独立算自己（O(N) 全并行 GPU 构建）
- [[lafortune-1993-bdpt]] —— Lafortune-Willems 1993 — 从相机和光源同时撒光线再"接龙"
- [[marching-cubes-1987]] —— Marching Cubes 1987 — 把体数据切成立方体查表生成三角网格
- [[reyes-1987]] —— Reyes 1987 — 把电影级渲染拆成可流水线处理的小砖块
- [[saito-takahashi-1990-gbuffer]] —— Saito-Takahashi 1990 — 第一次提出 G-buffer 的论文
- [[wald-2007-sah-bvh]] —— Wald 2007 — 把 SAH BVH 构建从分钟级砍到秒级的 binned 近似法
