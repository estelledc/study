---
title: Cook-Torrance 1982 — 把镜面反射拆成微面元 × 几何遮挡 × Fresnel
来源: Robert L. Cook & Kenneth E. Torrance, "A Reflectance Model for Computer Graphics", ACM TOG Vol.1 No.1, January 1982
日期: 2026-05-31
分类: 图形学
难度: 进阶
---

## 是什么

Cook-Torrance 1982 给屏幕上的"金属和塑料"写了一个**有物理依据**的反射公式。日常类比：你拿一个抛光铜壶。Phong 1975 只能告诉你"亮处有个白点"，但铜壶的高光是**橘黄色**，而且**侧着看高光会变亮**。这两件事 Phong 都解释不了。Cook-Torrance 把高光那一项拆成三个有物理含义的乘子：

```
f_specular = (D · G · F) / (4 · (N·L) · (N·V))
```

逐项读：

- `D` —— **微面元法线分布**：表面其实由无数小镜子组成，D 描述这些小镜子朝向有多集中
- `G` —— **几何衰减**：相邻小镜子互相挡，G 把被挡住那部分扣掉
- `F` —— **Fresnel 反射比**：光打到表面时多少被反射、多少进入物体，随入射角变化（这就是为什么湖面平视时像镜子，俯视时能看见水底）

`N·L`、`N·V` 是常见点乘，分母里的 4 是从立体角换算来的固定系数。

## 为什么重要

不理解 Cook-Torrance，下面这些事都没法解释：

- 为什么 Disney/UE/Unity 现在都用 **metallic + roughness** 两个滑块——这套工作流是 Cook-Torrance 的工业封装
- 为什么 glTF 2.0 资产格式以 metallic-roughness 为标准——同源
- 为什么金属高光是金属本身的颜色（金子是黄高光），而塑料高光永远是光源色——Fresnel 项决定
- 为什么"湖面侧看像镜子、俯看见水底"和"金子在屏幕上看起来像金子"是**同一个公式**

这是计算机图形学**第一个把光学物理搬进 BRDF** 的工业级模型。在它之前，Phong 用经验 `cos^n` 凑高光；之后所有 PBR (Physically Based Rendering) 都长得像 Cook-Torrance。

## 核心要点

把镜面项拆成 D × G × F 三个**正交、可独立替换**的物理量：

1. **D — 微面元法线分布 (Beckmann 1963)**：原文假设表面由无数小镜子组成，每个小镜子朝某方向。粗糙度 `m` 是唯一参数，`m=0.1` 抛光金属，`m=0.6` 拉丝铜。后续 Walter 2007 用 GGX/Trowbridge-Reitz 替代 Beckmann，长尾更真实，今天 99% 引擎用 GGX。

2. **G — 几何衰减 (Torrance-Sparrow 1967)**：小镜子站在一起会**互相遮挡**和**自阴影**。原文沿用 V 形槽假设，给出一个 min(...) 公式。Smith 2004 推出更精确的 G2，今天主流。

3. **F — Fresnel 反射比 (1820s)**：1820 年 Augustin Fresnel 推导的菲涅尔方程，告诉你光线打到介质边界时多少反射、多少折射。垂直入射时反射比叫 `F0`，掠射角时反射比 → 1 (这就是镜面湖效果)。Schlick 1994 给出便宜的 5 次方近似 `F0 + (1-F0)(1-cosθ)^5`，今天实时渲染都用它。

关键洞见：**金属和电介质** (dielectric，塑料/玻璃) 在 F0 上根本不同：

- 电介质：F0 ≈ 0.04，单通道，无颜色（塑料、皮革、陶瓷、水）
- 金属：F0 是 RGB 三通道颜色（金子 0.95黄、铜 0.95橙、银 0.97灰）

这一刀切让美术工作流变成"选金属 or 非金属，选粗糙度"——这就是今天 metallic-roughness 工作流的物理来源。

## 实践案例

### 案例 1：Three.js 里的 Cook-Torrance 后裔

```js
const material = new THREE.MeshStandardMaterial({
  color: 0xffd700,    // baseColor 基色
  metalness: 1.0,     // 金属度：1 = 金属，0 = 电介质
  roughness: 0.2,     // 粗糙度，对应 D 项的 m
});
```

`metalness=1` 时 F0 取 `color` 的 RGB；`metalness=0` 时 F0 = 0.04 不变。
这两个滑块把 Cook-Torrance 公式参数化了——美术不用懂 D/G/F，调两滑块就够。

### 案例 2：拆解一个金属像素

铜壶某像素，光从左上来，相机正前看：

```
F0 = (0.95, 0.64, 0.54)         # 铜的 F0，RGB 三通道，橘黄
roughness m = 0.3
N·L = 0.7, N·V = 0.9, N·H = 0.85, V·H = 0.8

D (Beckmann, m=0.3, N·H=0.85)  ≈ 1.8
G (Torrance-Sparrow)            ≈ 0.78
F (Schlick, V·H=0.8)            ≈ (0.95, 0.65, 0.55)

f_specular = (1.8 · 0.78 · F) / (4 · 0.7 · 0.9)
           ≈ (0.53, 0.36, 0.31)         # 高光本身就带橘黄
```

注意高光是**橘黄色**，不是白色——这就是金属看起来像金属的原因。Phong 给金属也只能涂白高光。

### 案例 3：Fresnel 让侧看变镜子

水面 F0 = 0.02，正视看几乎全透（看见水底鱼）。掠射角 (cosθ → 0) 时 Schlick 给：

```
F = 0.02 + (1 - 0.02) · (1 - 0.05)^5 ≈ 0.02 + 0.76 ≈ 0.78
```

反射比从 2% 跳到 78%——这就是为什么远看湖面是镜子。Phong 的 `cos^n` 完全没这个性质。

## 踩过的坑

1. **能量不守恒**：D 项必须积分归一化到 1，新人写完发现"越粗糙越亮"——D 公式忘了归一化常数。

2. **G 项掠射角崩溃**：原文 V 槽 G 在 N·V → 0 时跳到 0 留黑边，工程上要么 `max(0.001, N·V)`，要么直接换 Smith G2。

3. **F0 金属/电介质混用**：把电介质 F0=0.04 喂给金属，金属变成灰色橡胶；反过来把金黄 F0 给塑料，塑料变带色金属。Disney 用 `metalness` 滑块在 shader 内部插值绕开这个坑。

4. **Beckmann vs GGX 不可混用**：D 选 Beckmann 时 G 也要配 Beckmann 版 Smith，混用能量不守恒。今天默认 GGX + GGX-Smith 整套。

5. **分母 4(N·L)(N·V) 除零**：掠射角一定要 clamp，否则单个像素亮度爆炸破坏 tone mapping。

## 适用 vs 不适用场景

**适用**：

- 实时 PBR (UE/Unity/Three.js MeshStandardMaterial)
- 离线物理渲染 (Pixar RenderMan / Arnold / Cycles 全部基于 Cook-Torrance 派生)
- 金属、塑料、陶瓷、油漆——任何不透光的固体
- 教学：理解所有现代 BRDF 的共同祖先

**不适用**：

- 半透明 (玻璃/水透射) → 需要 BSDF 加上透射项
- 次表面散射 (皮肤、蜡、玉、牛奶) → 需要 BSSRDF
- 各向异性 (拉丝金属、毛发) → 需要 anisotropic D
- 薄膜干涉 (肥皂泡彩色) → 需要波动光学，几何光学不够

## 历史小故事（可跳过）

- **1820s**：Augustin Fresnel 推导菲涅尔反射方程，那是 162 年前
- **1963**：Beckmann 在雷达散射论文里给出微面元法线分布
- **1967**：Torrance & Sparrow 在光学杂志组合出 D × G × F 雏形（光学领域）
- **1981**：Robert Cook 在 SIGGRAPH 把光学界这套搬进图形学
- **1982-01**：ACM TOG 创刊号，Cook-Torrance 占首篇位置
- **1994**：Schlick 给 Fresnel 项 5 次方近似，实时渲染门槛降低
- **2007**：Walter et al 用 GGX 替代 Beckmann，长尾更真
- **2012**：Disney Burley 在 SIGGRAPH 课程发布 Principled BRDF，metallic + roughness 工作流定调
- **2014 之后**：UE4 / Unity Standard / glTF 2.0 都跟进 Disney metallic-roughness

从论文发表到工业普及等了 **30 年**——硬件、美术、标准都得追上。

## 学到什么

1. **物理乘法分解就是好设计**：把"金属高光"这个无法直接计算的量拆成 D × G × F，每项独立可换。今天换 D 不影响 G，换 F 不影响 D——这种正交性是 PBR 能演化 30 年的根本。
2. **经验模型让位给物理模型，画质提升不大但可解释性大幅提升**：Phong 美术调到接近 Cook-Torrance 也能看，但 Cook-Torrance 给你一组**可以从光谱仪测出来**的参数 (F0)，跨场景跨光照都对。
3. **金属/电介质二分法是 Cook-Torrance 给世界的礼物**：metallic 滑块只有 1 个浮点，但背后是 Fresnel 在金属和电介质行为根本不同这件物理事实。
4. **算法领先时代 30 年不一定是好事**：1982 论文太超前，硬件 30 年后才追上，期间靠 Phong/Blinn-Phong 顶着。说明工程落地需要硬件 + 美术 + 标准三者都到位。

## 延伸阅读

- 论文 PDF：[Cook & Torrance 1982 — A Reflectance Model for Computer Graphics](https://dl.acm.org/doi/10.1145/357290.357293)（TOG 创刊号 25 页）
- 工业版：[Burley 2012 — Physically-Based Shading at Disney](https://blog.selfshadow.com/publications/s2012-shading-course/burley/s2012_pbs_disney_brdf_notes_v3.pdf)（30 年后的工业封装）
- Schlick 近似原文：[Schlick 1994 — An Inexpensive BRDF Model for Physically-based Rendering](https://www.cs.virginia.edu/~jdl/bib/appearance/analytic%20models/schlick94b.pdf)
- 教程：[LearnOpenGL — PBR Theory](https://learnopengl.com/PBR/Theory)（边讲边写 GLSL，零基础最适合）
- [[phong-1975]] —— 前辈，经验 cos^n 高光，Cook-Torrance 替代它
- [[blinn-1977]] —— 兄弟，半角向量 H，Cook-Torrance 公式里 H 直接沿用
- [[lambert-cosine]] —— 漫反射部分仍然用 Lambert（如有）

## 关联

- [[phong-1975]] —— 经验高光模型，被 Cook-Torrance 在物理基础上替代
- [[blinn-1977]] —— Blinn 的半角向量 H 是 Cook-Torrance 微面元法线对齐的关键工具
- [[3d-gaussian-splatting]] —— 现代实时渲染的另一条路，但着色仍是 PBR 思路
- [[bidirectional-typing]] —— 与 Cook-Torrance 无关，仅作命名学示例

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[catmull-clark-1978]] —— Catmull-Clark 1978 — 让任意拓扑网格收敛成光滑曲面
- [[cook-1986-stochastic-sampling]] —— Cook 1986 — 用噪声换掉锯齿
- [[disney-brdf-2012]] —— Disney Principled BRDF 2012 — 11 个滑块封装 Cook-Torrance 全家桶
- [[phong-1975]] —— Phong 1975 — 把光照拆成环境+漫反射+高光三项
- [[saito-takahashi-1990-gbuffer]] —— Saito-Takahashi 1990 — 第一次提出 G-buffer 的论文
- [[whitted-1980]] —— Whitted 1980 — 让光线在场景里递归跑三种次级射线
