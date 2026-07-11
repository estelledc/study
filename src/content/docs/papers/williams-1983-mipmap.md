---
title: Williams 1983 mipmap — 提前烤好金字塔，纹理过滤变 O(1)
来源: 'Lance Williams, "Pyramidal Parametrics", SIGGRAPH 1983'
日期: 2026-05-31
分类: 计算机图形
难度: 入门
---

## 是什么

把一张纹理（比如砖墙贴图）**预先生成一组从大到小的副本**：原图 1024×1024、半尺寸 512×512……一直缩到 1×1。这一摞图叫 **mipmap**（金字塔）。论文正式题名是 *Pyramidal Parametrics*（SIGGRAPH 1983）。

日常类比：像 Google Maps 提前烤好世界地图的不同缩放层级。你滑滚轮时，地图不是每次重拍卫星照，而是从烤好的瓦片里挑一层换上去——快、稳、不抖。

3D 里近处一格地砖占屏幕 200 像素，远处只占 2 像素。若都从 1024 原图采样，远处那 2 像素要"代表"原图一大片 texel（纹理像素）——只取中间一个会闪、会抖、会出摩尔纹（aliasing）。Williams 的方案：**离线把每层平均值算好，运行时挑接近的层**，从每像素 O(n²) 积分降到 O(1) 查找。

MIP 不是缩写——是拉丁语 **multum in parvo**（"小空间装大量东西"），Williams 特意起的名。

## 为什么重要

不理解 mipmap，下面这些事都没法解释：

- 为什么 3D 游戏远处地面不闪、不抖、贴图过渡平滑
- 为什么贴图采样在 GPU 上几乎"免费"——它是硬件采样器指令
- 为什么显卡纹理内存通常比原图大约 33%（金字塔 = 4/3 倍）
- 为什么深度学习的 Feature Pyramid Network 看起来眼熟——多尺度"预算好再取层"的思路同源

一篇 SIGGRAPH 1983 的 7 页论文，40 年后仍是每块 GPU 硬件采样器的标配。

## 核心要点

mipmap 把"采样"拆成 **三步**：

1. **离线建金字塔**：原图 level 0；每 2×2 平均得半尺寸 level 1，再往上直到 1×1。总内存约原图的 4/3（多 33%）。类比：提前烤好每一级地图瓦片。

2. **运行时选层**：屏幕上挪一格像素，纹理坐标跳了多远？用偏导数 du/dx、dv/dy（"屏幕一格 → UV 跳多远"）算 λ = log2(max(|du|, |dv|))。λ=0 取最清晰层，λ=3 取更糊的一层。

3. **三线性插值**：λ 常不是整数（如 2.7），就在相邻两层各做双线性（4 点），再按小数部分混两层——共 8 次取样。Williams 同篇已描述这一过程。

本质：**用 33% 内存换每像素 O(1) 过滤**——1983 年能塞进实时管线的关键妥协。

金字塔示意（每上一层分辨率减半、像素数变 1/4）：

```
level 0: 1024×1024  （原图，最清晰）
level 1:  512×512   （2×2 平均一次）
level 2:  256×256
...
level 10:   1×1     （整张图的平均颜色）
```

## 实践案例

### 案例 1：远处地板反走样（开 / 关对照）

```glsl
// 关 mipmap：远处每像素只取 1 个 texel → 闪烁
vec4 sharp = texture(texNearest, uv);
// 开 mipmap + 三线性：硬件按覆盖面积选层并过滤
vec4 smooth = texture(texMip, uv);
```

**逐部分解释**：

1. `texNearest` 只有原图，远处一像素覆盖很多 texel 却只取一点 → aliasing
2. `texMip` 已建金字塔；覆盖约 16×16 texel 时会选更高层，一次取样≈大块平均
3. 肉眼差：关=雪花闪，开=稳但略糊（糊是诚实的低频）

### 案例 2：显式 LOD（无屏幕偏导数时）

```glsl
// 片元着色器：texture() 靠 2×2 quad 差分自动算 λ
vec4 a = texture(tex, uv);
// compute / 自定义光线：没有自然 quad，必须手写层号
vec4 b = textureLod(tex, uv, 4.0); // 强制 level 4
```

**逐部分解释**：

1. `texture`：GPU 用相邻像素 UV 差估算覆盖，再选层 + 三线性
2. `textureLod`：你指定 lod，跳过自动导数——compute shader 里该用这个
3. 硬件完成过滤是**一条采样指令**（吞吐高；不要理解成"单周期延迟"）

### 案例 3：多尺度思路借到检测（FPN）

Lin 2017 的 FPN：CNN 每下采样一层得 C2…C5，小目标用浅层、大目标用深层。

**和 mipmap 同构的只有一句**：多尺度预算好，按需取层。区别很大——mipmap 是颜色 box filter；FPN 是学出来的语义特征，还有横向连接。这是图形学"金字塔"抽象被 ML 借用，不是同一算法。

## 踩过的坑

1. **各向同性假设**：斜视地板时 footprint 是长条，mipmap 按长边选层 → 过度模糊；补丁是 anisotropic filtering（控制面板 AF 16x）。厂商还有 "Trilinear Optimization" 可偷懒关层间插值。
2. **以为变糊=画质损失**：模糊拒绝了 aliasing 的假高频；不开看起来更锐，但是骗你的。
3. **多 33% 内存不免费**：UI 1:1 像素对齐可关 mipmap；3D 场景贴图边长 ≥64 且会缩到远小于原尺寸时必须开。
4. **依赖 quad 偏导数**：compute 里没有 2×2 quad，用 `texture` 结果未定义，改 `textureLod`。
5. **生成时颜色空间**：sRGB 上直接 2×2 平均会偏暗；应线性空间平均再转回。

## 适用 vs 不适用场景

**适用**：

- 静态纹理的 3D 渲染（游戏 / 影视 / CAD / AR）；边长 ≥64 且会明显缩小的贴图
- 3D 纹理 / cube map（每维 2 倍下采样）
- 高度图、法线、阴影贴图等"按距离自动选分辨率"的数据

**不适用**：

- 程序化 noise（无原图可烤）→ fwidth / 解析式 AA
- 视差极强的斜面 → 各向异性过滤，单靠 mipmap 不够
- 路径追踪次级射线（无连续 du/dx）→ cone tracing 或显式 footprint
- 纯 UI 1:1 小图标 → nearest，避免无意义层切换

## 历史小故事（可跳过）

- **1977**：Frank Crow 提出 summed-area table，同目标、不同内存/形状权衡。
- **1983**：Lance Williams 在 NYIT 发表 *Pyramidal Parametrics*；同实验室后来走出一批 Pixar 核心人物。
- **1986**：Heckbert Survey of Texture Mapping 系统化各向异性（EWA），点明 mipmap 局限。
- **1990s**：SGI / 3dfx / NVIDIA 把 mipmap + 三线性硬化进采样器。
- **2017**：FPN 把"多尺度金字塔"抽象搬进目标检测。

## 学到什么

1. **预计算 > 运行时积分**——存得下就把 O(n²) 干到 O(1)；阴影贴图、环境贴图同套路。
2. **离散选层 + 插值过渡**——LOD / imposter 等分级桥接术的原型。
3. **简单胜过精确**：EWA 更准，但 mipmap 便宜到能进硬件——工程胜利常压过学术最优。
4. **好名字能用 40 年**：mipmap 从论文一路进 OpenGL / DirectX / Vulkan，一字未改。

## 延伸阅读

- 论文：[Pyramidal Parametrics](https://dl.acm.org/doi/10.1145/800031.808600)（ACM，7 页）
- 书：[Real-Time Rendering — Texture Filtering](https://www.realtimerendering.com/)
- 实操：[LearnOpenGL — Mipmaps](https://learnopengl.com/Getting-started/Textures)
- 各向异性：[Heckbert 1986 Survey](https://www.cs.cmu.edu/~ph/texsurv.pdf)
- ML 借用：[Lin 2017 FPN](https://arxiv.org/abs/1612.03144)

## 关联

- [[3d-gaussian-splatting]] —— 现代实时渲染底层仍用纹理采样/过滤
- [[ampere-architecture-2020]] —— 现代 GPU 的 TMU 就是 mipmap 的硬件实现
- [[garland-heckbert-1997-qem]] —— 同年代"预计算简化"思路（网格版金字塔）
- [[heckbert-1986-texture-survey]] —— 系统化各向异性过滤，点明 mipmap 各向同性局限
- [[catmull-1974-zbuffer]] —— 更早的可见性预计算，同属"烤好再查"的图形学模板
- [[perlin-1985-noise]] —— 程序化纹理路线；无原图可烤时不能靠 mipmap，要解析式 AA
- [[phong-1975]] —— 着色奠基；纹理过滤建立在真实感着色管线之上

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[3d-gaussian-splatting]] —— 3D Gaussian Splatting — 用一堆 3D 模糊光斑重建场景
- [[garland-heckbert-1997-qem]] —— QEM — 给三角网格『瘦身』时算每一刀的代价
