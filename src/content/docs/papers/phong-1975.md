---
title: Phong 1975 — 把光照拆成环境+漫反射+高光三项
来源: Bui Tuong Phong, "Illumination for Computer Generated Pictures", CACM Vol.18 No.6, June 1975
日期: 2026-05-31
分类: 图形学
难度: 初级
---

## 是什么

Phong 1975 提出一个**让屏幕上的物体看起来像被光照过**的最小公式。日常类比：你画一个苹果，光打在上面。苹果**整体不死黑**（背面也能看清），**亮面有渐变**（侧面比正面暗一点），**最亮处有一个白点**（高光）——这三件事，Phong 拆成三项可计算的数学量。

公式只有 8 行：

```
I = ka·ia + Σ over lights [ kd·(L·N)·id + ks·(R·V)^n·is ]
```

逐项读：

- `ka·ia` —— **环境光**（ambient）：常数项，让背面别死黑
- `kd·(L·N)·id` —— **漫反射**（diffuse）：光源方向 L 和法线 N 的夹角越正，越亮
- `ks·(R·V)^n·is` —— **高光**（specular）：反射方向 R 和视线 V 越对齐，越闪

`L`、`N`、`R`、`V` 都是单位向量；`·` 是点乘（cos 夹角）；`n` 是**光泽度**（shininess），数值越大高光越尖。

## 为什么重要

不理解 Phong，下面这些事都无法解释：

- 为什么 Three.js 的标准材质叫 `MeshPhongMaterial`、`shininess`、`specular`——名字直接来自 1975 这篇
- 为什么所有图形入门课**第一个能跑的着色器**都是这 8 行
- 为什么 50 年后的 PBR（Cook-Torrance、GGX）还在沿用 `diffuse + specular` 这种拆法
- 为什么 OpenGL 固定管线默认就是 Phong 模型的简化版（实际是 Blinn-Phong，1977 年的优化）

这是计算机图形学**第一个进入工业**的真实感光照模型。在它之前，1971 年 Gouraud 已经能在多边形之间平滑过渡颜色，但**没有高光**——苹果看起来像橡皮泥。Phong 加上高光那一刻，CG 才开始像照片。

## 核心要点

三项每一项**对应一种物理现象的粗暴近似**：

1. **环境光 ka·ia**：现实里光会在房间里反弹无数次，每个角落都有一点散射光。Phong 说："太复杂，加个常数糊弄过去。"——这就是 ambient。物理上不存在，纯 fudge factor，但**没它背面就是死黑**。

2. **漫反射 kd·(L·N)·id**：粗糙表面（纸、墙、橡胶）把光均匀往四面八方散。Lambert 1760 年就推过：朝向光源越正（L·N 越大），单位面积接到的光越多。这一项**和视角无关**——你绕到侧面看，漫反射部分亮度不变。

3. **高光 ks·(R·V)^n·is**：光滑表面（金属、塑料、湿物）把光集中往**反射方向**弹。理想镜面只在 R 方向有亮，但真实表面有微小起伏，所以亮度按 cos 衰减。Phong 的关键创新就是这一项——**指数 n 控制衰减速度**，n=1 像橡皮，n=200 像镜子。这一项**强烈依赖视角**——你动一下头，高光就漂移。

三项加起来就是这个像素的颜色。每个光源都跑一遍 diffuse + specular，再加一次 ambient。

## 实践案例

### 案例 1：Three.js 里的 Phong 材质

```js
const material = new THREE.MeshPhongMaterial({
  color: 0xff0000,        // kd 漫反射颜色（红色苹果）
  specular: 0xffffff,     // ks 高光颜色（白色高光）
  shininess: 30,          // n 光泽度（30 = 塑料感）
});
```

`shininess` 这个字段名就是 Phong 1975 公式里的 `n`。改成 200 就像抛光金属，改成 1 就像哑光橡胶。

### 案例 2：手动拆解一个像素的颜色

红苹果某个像素，光从左上来，相机在正前：

```
ka = 0.1, ia = (1,1,1)            # 环境
kd = (0.8, 0.1, 0.1), id = (1,1,1) # 红色漫反射
ks = (1,1,1), is = (1,1,1), n = 50 # 白色高光

L·N = 0.7    # 光与法线夹角约 45°
R·V = 0.95   # 反射方向几乎对着相机

ambient  = 0.1 · (1,1,1)            = (0.10, 0.10, 0.10)
diffuse  = (0.8,0.1,0.1) · 0.7 · 1  = (0.56, 0.07, 0.07)
specular = (1,1,1) · 0.95^50 · 1    = (0.08, 0.08, 0.08)

I = (0.74, 0.25, 0.25)  # 偏红+一点白
```

这个像素是亮红色加一点白闪。换个角度让 R·V=0.5，0.5^50 ≈ 0.0000009，高光直接消失——这就是高光"会跟着视角跑"的感觉。

### 案例 3：Phong shading 与 Phong reflection 不是一回事

同一篇论文里两个东西容易混：

- **Phong reflection model**（本文主角）：上面那个 8 行公式
- **Phong shading**：在多边形顶点之间**插值法线**，每个像素重新算一次公式

对比 1971 年 Gouraud：Gouraud 在顶点算颜色，多边形内部插**颜色**——结果高光在多边形中心会丢失。Phong 改成插**法线**，每像素算一次完整公式，高光保住。代价是 GPU 要做 N 倍计算，1975 年根本跑不动，1990 年代硬件追上后才普及。

## 踩过的坑

1. **能量不守恒**：ka + kd + ks 可以随便填超过 1，物体看起来比光源还亮。现代 PBR 强制 kd + ks ≤ 1。

2. **金属不准**：Phong 假设高光是白色（光源同色）。但金属的高光带颜色——金子的高光是黄的。要画金属必须改成 ks 跟漫反射颜色挂钩，或者干脆换 Cook-Torrance。

3. **n 大了会闪**：n=500 时高光只占几个像素，相机一动高光就在像素之间跳——叫做 specular aliasing。解法是加 mipmap 或用 prefiltered environment map。

4. **R 算错方向**：R = 2(N·L)N - L。新人常写成 L 和 N 反向算，结果高光在背面出现。

5. **光强累加超出 1**：多个光源各自跑一遍后加起来颜色 > 1，需要 tone mapping 压回 [0,1]。

## 适用 vs 不适用场景

**适用**：

- 教学：图形学第一个能跑的真实感模型
- 移动端 forward 渲染（每像素几十次乘法即可）
- 风格化渲染（卡通渲染常基于 Phong 改）
- 不追求物理正确的实时场景

**不适用**：

- 物理正确渲染（PBR 流程必须用 Cook-Torrance / GGX）
- 金属、各向异性材质（拉丝金属）
- 间接光照（ambient 只是常数糊弄，需要 IBL / 球谐 / 路径追踪）
- 半透明、次表面散射（皮肤、蜡、玉）

## 历史小故事（可跳过）

- **1971**：Henri Gouraud 在 Utah 大学发表平滑着色，能在多边形间渐变颜色但没高光
- **1973**：Bui Tuong Phong 在 Utah 大学完成博士论文，导师是 David Evans；Ivan Sutherland 协作改进了法线插值着色
- **1975 年 6 月**：CACM 发表 6 页论文，把博士论文核心成果浓缩
- **1975 年 7 月**：Phong 因病去世（文献多记白血病，亦有 SCC 等说法），年仅 32 岁
- **1977**：Jim Blinn 用半角向量 H 替代 R，得到 Blinn-Phong，省一次反射计算，OpenGL 选它作默认
- **1982 年后**：Cook-Torrance 等物理模型出现，但 Phong 因为快、好教，一直活到今天

## 学到什么

1. **拆解就是减少**：把"画出真实光照"这个无法直接计算的目标，拆成三个**各自只有一行公式**的可计算项。这是工程学的基本功。
2. **经验模型也能赢 50 年**：Phong 不守恒、不物理，但 cos^n 那一项实在太聪明——一个参数从橡胶滑到镜子。
3. **命名很重要**：specular / diffuse / shininess / ambient 这四个词从 1975 用到现在，所有图形 API 都遵循。
4. **简单 + 早 = 教科书**：6 页论文 + 8 行公式 + 一个 cos^n，半个世纪没换。

## 延伸阅读

- 论文 PDF：[Phong 1975 — Illumination for Computer Generated Pictures](https://dl.acm.org/doi/10.1145/360825.360839)（CACM 6 页，密度极高）
- Scratchapixel 教程：[The Phong Model](https://www.scratchapixel.com/lessons/3d-basic-rendering/phong-shader-BRDF/phong-illumination-models-brdf.html)（每一步推导都有图）
- 视频：[LearnOpenGL — Basic Lighting](https://learnopengl.com/Lighting/Basic-Lighting)（边写代码边讲，最适合零基础）
- [[blinn-phong]] —— 1977 年用半角向量优化的版本（如有）
- [[cook-torrance-1982]] —— 第一个物理基础的 BRDF（如有）

## 关联

- [[gouraud-1971]] —— Gouraud 着色：Phong 的前辈，按颜色插值丢高光
- [[lambert-cosine]] —— Lambert 余弦定律：漫反射那一项的物理基础
- [[blinn-1977]] —— Blinn-Phong：用半角向量把高光算量减半
- [[3d-gaussian-splatting]] —— 现代实时渲染的另一支，但着色思想仍是 diffuse+specular

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[3d-gaussian-splatting]] —— 3D Gaussian Splatting — 用一堆 3D 模糊光斑重建场景
- [[blinn-1977]] —— Blinn 1977 — 用半角向量 H 把高光算量减半
- [[cook-torrance-1982]] —— Cook-Torrance 1982 — 把镜面反射拆成微面元 × 几何遮挡 × Fresnel
- [[disney-brdf-2012]] —— Disney Principled BRDF 2012 — 11 个滑块封装 Cook-Torrance 全家桶
- [[heckbert-1986-texture-survey]] —— Heckbert 1986 — 把"贴图"这件事讲清楚的第一篇综述
- [[perlin-1985-noise]] —— Perlin Noise — 让计算机生成的图像不再有"机器味"
- [[ssa]] —— SSA — 静态单赋值形式
- [[ward-1992]] —— Ward 1992 — 第一个能落地的各向异性反射模型
- [[whitted-1980]] —— Whitted 1980 — 让光线在场景里递归跑三种次级射线

