---
title: Williams 1983 mipmap — 提前烤好金字塔，纹理过滤变 O(1)
来源: Lance Williams, "Pyramidal Parametrics", SIGGRAPH 83
日期: 2026-05-31
子分类: 渲染与图形
分类: 图形学
难度: 入门
provenance: pipeline-v3
---

## 是什么

把一张纹理（比如砖墙贴图）**预先生成一组从大到小的副本**：原图 1024x1024、半尺寸 512x512、再半 256x256……一直缩到 1x1。这一摞图叫 **mipmap**（金字塔）。

日常类比：像 Google Maps 提前烤好世界地图的不同缩放层级。你滑滚轮缩放时，地图不是每次都重新拍一遍卫星照，而是从烤好的瓦片里挑一层换上去——快、稳、不抖。

3D 渲染里贴图就是这个问题：摄像机近处一格地砖占屏幕 200 像素，远处只占 2 像素。如果都从 1024x1024 原图采样，远处那 2 像素要"代表"原图的 500x500 个 texel——只取中间一个会闪、会抖、会出摩尔纹（aliasing）。

Williams 1983 的方案：**离线把每个层级的平均值算好存起来，运行时直接挑接近的层取**。从每像素 O(n²) 积分降到 O(1) 表查找。

MIP 不是缩写——是拉丁语 **multum in parvo**（"小空间装大量东西"），Williams 在论文里特意起的名。

## 为什么重要

不理解 mipmap，下面这些事都没法解释：

- 为什么 3D 游戏远处地面不闪、不抖、贴图过渡平滑
- 为什么贴图采样在 GPU 上几乎"免费"——它是硬件指令
- 为什么显卡的纹理内存占用通常比原图大 33%（金字塔 = 4/3 倍）
- 为什么 2017 年深度学习的 Feature Pyramid Network 看起来眼熟——它就是把 1983 年的金字塔思路搬到卷积特征上

一篇 SIGGRAPH 1983 的 7 页论文，40 年后仍是每块 GPU 硬件采样器的标配。

## 核心要点

mipmap 把"采样"问题拆成 **三步**：

1. **离线建金字塔**：原图叫 level 0，把它每 2x2 像素平均一下得到 level 1（半尺寸）；level 1 再 2x2 平均得 level 2……最顶层是 1x1。所有 level 加起来比原图多 33%（几何级数 1 + 1/4 + 1/16 + ... = 4/3）。

2. **运行时选层**：屏幕上一个像素覆盖纹理多大？GPU 用屏幕空间偏导数 du/dx 和 dv/dy 算出 lambda = log2(max(|du|, |dv|))。lambda = 0 取 level 0，lambda = 3 取 level 3。

3. **三线性插值**：lambda 通常不是整数（比如 2.7），就在 level 2 和 level 3 各做一次双线性插值（4 点平均），再在两层之间线性插值——共 8 次取样、7 次插值，硬件一拍出结果。Williams 在同一篇里把这个过程也提了。

整套机制的本质：**用 33% 内存换每像素 O(1) 的过滤计算**——这是 1983 年那台机器（VAX 时代）能做出实时渲染的关键妥协。

金字塔结构示意：

```
level 0: 1024 x 1024  （原图，最清晰）
level 1:  512 x 512   （2x2 平均一次）
level 2:  256 x 256
level 3:  128 x 128
...
level 10:   1 x 1     （整张图的平均颜色）
```

每往上一层，分辨率减半、像素数变 1/4，所以总开销是几何级数和，不会爆炸。

## 实践案例

### 案例 1：远处地板的反走样

不开 mipmap：远处地板每像素只取一个 texel，相邻像素跳着采，结果像电视雪花一样闪烁——这就是 texture aliasing。

开 mipmap：远处地板的每个屏幕像素覆盖纹理 16x16 个 texel，GPU 选 lambda = 4，从 level 4 取一个已经是 16x16 平均的值——一次取样代表了 256 个 texel 的平均，不闪。

### 案例 2：GPU 硬件指令

GLSL / HLSL 里写 `texture(tex, uv)` 这一行，GPU 内部干了：

1. 取相邻 2x2 像素的 uv，算 du/dx du/dy（quad shader 同步差分）
2. 算 lambda
3. 在 level floor(lambda) 和 ceil(lambda) 各做双线性
4. 两层结果按 lambda 小数部分线性混

整套是单条 sample 指令，**1 个时钟周期产出**。1983 的算法 → 2025 的电路。

### 案例 3：深度学习的 Feature Pyramid Network

Lin 2017 的 FPN：CNN 主干网每下采样一次得到一张特征图（C2/C3/C4/C5），形成特征金字塔；检测小目标用浅层（高分辨率），检测大目标用深层（低分辨率）。

思路和 1983 几乎一模一样——**多尺度预算好，按需取层**。区别是 mipmap 的特征是颜色平均，FPN 的特征是 CNN 学出来的语义。这是图形学思想反向影响 ML 的经典案例。

### 案例 4：你能在显卡控制面板里看到的开关

NVIDIA / AMD 控制面板有两个相邻设置：

- **Texture Filtering — Trilinear Optimization**：是否在远处偷懒只做双线性（省一半工作量但偶尔会看到 mipmap 层切换的"接缝"）
- **Anisotropic Filtering 1x / 2x / 4x / 8x / 16x**：补 mipmap 各向同性的洞，数字越大斜视的远处地面越清晰

你能调这两个开关，是因为 1983 那篇论文把整套机制定义清楚了，硬件厂商才有"开 / 关 / 折中"的余地。

## 踩过的坑

1. **mipmap 是各向同性的**：它假设屏幕像素覆盖的 texel 区域是方块。摄像机斜视地板时区域会拉成长条（u 方向 16 个 texel、v 方向 1 个 texel），mipmap 会按最大边选层，结果**过度模糊**。补丁是 anisotropic filtering（各向异性过滤），GPU 控制面板里那个 "AF 16x" 就是这事。

2. **以为 mipmap 让画面变糊**：游戏玩家看到远处贴图模糊，常以为"画质损失"。其实**模糊是诚实的**——它拒绝了 aliasing 制造的虚假高频。不开 mipmap 看起来"更锐"，但那个锐是骗你的。

3. **memory 多 33% 不是免费**：移动端显存紧张时，开发者会权衡——要不要给某些只用大尺寸的贴图省略 mipmap。一般规则：UI 贴图不需要 mipmap，3D 场景必须开。

4. **GPU 自动算偏导数依赖 quad**：屏幕空间偏导数靠"同 2x2 像素之间差分"。在 compute shader 里没有自然的 2x2 quad，得手动指定 mip level（用 `textureLod` 而不是 `texture`），否则结果未定义。

5. **mipmap 生成本身可能引入 bug**：默认 box filter（2x2 平均）在颜色空间不对的纹理上会偏色——比如 sRGB 颜色直接平均会变暗。正确做法是先转线性空间再平均、再转回 sRGB。许多老引擎不做这步，远处贴图会比近处偏暗。

## 适用 vs 不适用场景

**适用**：

- 任何静态纹理的 3D 渲染（游戏、影视、CAD、AR/VR）
- 体素 / 三维纹理（3D mipmap，每层用 2x2x2 平均，cube map 也类似）
- 高度图 / 法线贴图 / 阴影贴图——只要"按距离/视角自动选分辨率"的场景都受益
- ML 多尺度特征处理（FPN 直接借用）

**不适用**：

- 程序化生成的纹理（运行时算的 noise，没有"原图"可烤）→ 用 fwidth 自适应或解析式 anti-aliasing
- 视差极强的斜面采样 → 用各向异性过滤补 mipmap 各向同性的洞
- 体积渲染 / 光线追踪的次级射线 → 没有连续的 du/dx，需要光线锥（cone tracing）扩展，或显式追踪 footprint
- 极小尺寸的纹理（小于 mipmap 一层切换的临界）→ 直接用 nearest filter，反而避免无意义的层切换抖动

## 历史小故事（可跳过）

- **1977 年**：Frank Crow 提出 summed-area table（积分图），同样目标——预算积分实现 O(1) 区域平均。但内存代价高、只能做长方形过滤。和 mipmap 思路不同但目标相同，两条路并存到今天。
- **1983 年**：Lance Williams 在 NYIT（纽约理工电脑图形实验室）发表 Pyramidal Parametrics。NYIT 那年正好聚集了一批日后 Pixar 创始人（Catmull、Smith），是计算机图形学的黄金温室。Williams 的论文配图相当朴素（ASCII + 黑白照片），但思想极锋利。
- **1986 年**：Heckbert 在 IEEE CG&A 上发表 Survey of Texture Mapping，把各向异性过滤数学化（EWA — elliptical weighted average），mipmap 的局限第一次被系统讨论。
- **1992 年起**：SGI 工作站、3dfx Voodoo、NVIDIA 早期显卡把 mipmap + 三线性硬化进采样器。从此每块 GPU 都"自带 Williams 1983"。
- **2017 年**：Lin 等提出 FPN（Feature Pyramid Networks），把金字塔思路搬进深度学习目标检测。一个 1983 的图形学算法借由"多尺度"这层抽象，34 年后回到了机器学习。

这条时间线的有趣之处：**算法 → 硬件 → 跨学科借用** 隔了几乎正好 10 年一步。

## 学到什么

1. **预计算 > 运行时积分**——只要存得下，提前算好就把每像素 O(n²) 干到 O(1)。这是图形学最常用的"用空间换时间"模板：阴影贴图、环境贴图、light probe 都是这个套路。
2. **离散选层 + 插值过渡**——1983 的"两层之间线性混"成了图形学几十年里反复出现的范式（LOD 模型切换、imposter、neural radiance cache 都用类似分级 + 插值的桥接术）。
3. **简单胜过精确**：mipmap 不是"最优"过滤（EWA 更准），但它**便宜到能塞进硬件**——一条采样指令一个时钟周期出结果。这才是它统治 40 年的原因。学术指标和工程胜利经常不一致。
4. **图形学的算法会反向喂养 ML**：FPN 的种子早在 1983 就埋下了。这提示一个学习策略——读图形学经典论文经常能看到 ML 现在正在做的事的"前世"。
5. **一个名字能用 40 年**：Williams 给金字塔取名 mipmap（multum in parvo），从 SIGGRAPH 论文 → OpenGL API → DirectX → Vulkan，名字一字未改。好名字本身就是设计的一部分。

## 延伸阅读

- 论文 7 页 PDF：[Pyramidal Parametrics](https://dl.acm.org/doi/10.1145/800031.808600)（密度高但配图清晰，强烈建议看，是计算机图形学最易读的奠基论文之一）
- 教程：[Real-Time Rendering 第 6 章 Texture Filtering](https://www.realtimerendering.com/)（标准教科书，把 mipmap、anisotropic、ripmap 摆一起对比）
- OpenGL 实操：[LearnOpenGL — Mipmaps](https://learnopengl.com/Getting-started/Textures)（开 / 关 mipmap 自己看差异）
- 各向异性过滤补丁：[Heckbert 1986 — Survey of Texture Mapping](https://www.cs.cmu.edu/~ph/texsurv.pdf)
- ML 借用：[Lin 2017 — Feature Pyramid Networks](https://arxiv.org/abs/1612.03144)
- 现代 GPU 实现细节：[NVIDIA Texturing Guide](https://developer.nvidia.com/)（讲 quad shader 偏导数、bindless texture）

## 关联

- [[3d-gaussian-splatting]] —— 现代实时渲染另一支路线，仍在底层用 mipmap 处理纹理
- [[ampere-architecture-2020]] —— 现代 GPU 架构里纹理采样器（TMU）就是 mipmap 的硬件实现
- [[garland-heckbert-1997-qem]] —— 同年代图形学"预计算简化"思路（mesh 简化版本的金字塔思想）

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[3d-gaussian-splatting]] —— 3D Gaussian Splatting — 用一堆 3D 模糊光斑重建场景
- [[garland-heckbert-1997-qem]] —— QEM — 给三角网格『瘦身』时算每一刀的代价

