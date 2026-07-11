---
title: Blinn 1977 — 用半角向量 H 把高光算量减半
来源: James F. Blinn, "Models of Light Reflection for Computer Synthesized Pictures", SIGGRAPH 1977 (Computer Graphics Vol.11 No.2)
日期: 2026-05-31
分类: 图形学
难度: 初级
---

## 是什么

Blinn 1977 是一个**对 Phong 高光公式的小改动**：把『反射方向 R 和视线 V 多接近』换成『半角向量 H 和法线 N 多接近』。日常类比：你照镜子，原本要先算镜子里反射出去的光线落在哪（R），再看你眼睛在不在那条线上（V）；新办法是直接算光源和眼睛的中点方向（H），看那个中点是不是正对着镜面（N）。

Phong 1975 写：

```
specular = ks · (R·V)^n
```

Blinn 1977 改成：

```
H = normalize(L + V)
specular = ks · (N·H)^n
```

其中 `L` 是光源方向，`V` 是视线方向，两者相加再归一化就是『半角向量 H』——光线和视线连线的角平分线方向。

看起来只是换了两个字母，效果是：**算量减半 + 物理意义更对**。

## 为什么重要

不理解 Blinn-Phong，下面这些事都解释不了：

- 为什么 1992 年 OpenGL 固定流水线、2000 年 DirectX 8 默认 specular 都是这个公式
- 为什么 WebGL 教程到 2026 年还在演示 `MeshPhongMaterial`（其实内部跑的是 Blinn-Phong）
- 为什么手机游戏 fallback shader 至今保留它——便宜
- 为什么后来 Cook-Torrance 1982 和 Disney GGX 2012 都从 H 出发，不再回到 R——H 是微面元理论的天然表达

## 核心要点

三件事说清楚：

1. **算量为什么减半**：Phong 算 `R = 2(N·L)N - L` 要乘加再归一化，再点乘 V；Blinn 只要 `L + V` 加法 + 一次归一化。固定流水线时代每帧每像素省下来的指令乘以百万像素，差距巨大。

2. **物理上为什么更对**：微面元理论（Torrance-Sparrow 1967）说，表面是无数小镜面组成的。**只有那些法线正好等于 H 的微面，才能把 L 反射到 V**。所以 `N·H` 直接表示『朝向 H 的微面密度』——这是物理量，不是几何凑数。

3. **指数 n 不能直接搬**：(N·H)^n 比 (R·V)^n 高光更宽更柔。要让两者看起来差不多，**Blinn 的 n 取 Phong 的 4 倍**左右。直接把 Phong 的 n=10 拿来跑 Blinn，高光会显得糊。

## 实践案例

### 案例 1：OpenGL 1.x 固定流水线默认行为

```c
glLightModeli(GL_LIGHT_MODEL_LOCAL_VIEWER, GL_FALSE);
```

这个默认 `FALSE`（不开本地视点）的设置直接受益于 Blinn-Phong。当观察者假设在无穷远（V 为常数），又用平行光（L 为常数），那 `H = normalize(L + V)` 就是**全场景常数**，可以预算一次而不是每像素算。

Phong 模型做不到这件事：R 依赖每个顶点的 N，没法预算。

### 案例 2：现代 WebGL 教程里的简化 shader

```glsl
vec3 N = normalize(vNormal);
vec3 L = normalize(uLightPos - vWorldPos);
vec3 V = normalize(uCameraPos - vWorldPos);
vec3 H = normalize(L + V);

float diffuse  = max(dot(N, L), 0.0);
float specular = pow(max(dot(N, H), 0.0), uShininess);

gl_FragColor = vec4(diffuse * baseColor + specular * vec3(1.0), 1.0);
```

注意 specular 只用 N、H、shininess 三项，没出现 R。这就是 Blinn-Phong 的标准长相。三大 JS 3D 库（three.js / Babylon.js / PlayCanvas）的『Phong material』内部都是这段。

### 案例 3：n 倍率不能照搬的踩坑

```
Phong: shininess = 32  →  视觉效果 A
Blinn: shininess = 32  →  视觉效果比 A 更糊
Blinn: shininess = 128 →  视觉效果接近 A
```

迁移 Phong 项目到 Blinn-Phong shader 时，材质参数表里的 shininess 通常要乘 4。不调就会觉得『所有金属都变塑料了』。

### 案例 4：固定流水线时代的代价对照表

| 操作         | Phong (R·V)^n           | Blinn (N·H)^n          |
|--------------|--------------------------|--------------------------|
| 反射向量     | 4 mul + 2 add 算 R       | 不需要                   |
| 半角向量     | 不需要                   | 1 add + normalize 算 H   |
| 点乘         | dot(R, V)                | dot(N, H)                |
| 远光远视优化 | 不可                     | H 全场景常数，可预算     |

每像素差几条指令——百万像素 60 帧，这就是 1990s GPU 的预算上限。

## 踩过的坑

1. **半角向量必须归一化**：`L + V` 不是单位向量；漏掉 `normalize` 高光位置全错。

2. **Blinn-Phong 不能量守恒**：某些角度反射出去的光比入射多，物理上不可能。1977 年没人在意，后来 PBR 时代必须修——归一化 Blinn-Phong 会补 `(n+2)/(2π)` 这类系数，Cook-Torrance / GGX 则用法线分布、几何遮挡和 Fresnel 分项约束能量。

3. **掠射角仍不准**：当光线和视线都几乎和表面平行时，真实材质会有明显的菲涅尔效应（边缘变亮），Blinn-Phong 完全不模拟。GGX 才正确。

4. **历史名字混乱**：很多教科书把 Blinn-Phong 直接叫 Phong；很多 API 文档把 OpenGL 的 specular 写成 `pow(dot(R, V), n)` 但实际实现是 H 版。看代码别只看注释。

## 适用 vs 不适用场景

**适用**：

- 移动端 / WebGL / 嵌入式渲染——便宜
- 卡通渲染 / NPR——本来就不追求物理正确
- 教学：从 Phong 推到 Blinn 是理解微面元的最小台阶
- 老游戏移植 / 复古风格

**不适用**：

- 真实感渲染（影视、AAA 主机游戏）→ 用 GGX + Cook-Torrance
- 金属高光、车漆、皮肤——必须能量守恒 + 菲涅尔
- 任何标榜 PBR 的项目

## 历史小故事（可跳过）

- **1975 年**：Phong（越南留美博士）发表 `(R·V)^n`，把图形从 Gouraud 时代的死板带到有高光的世界。
- **1977 年**：Blinn 在犹他大学（计算机图形学的发源地）发表本论文，提出三个改进：
  1. R 换成 H（本笔记主角）
  2. 引入 Trowbridge-Reitz 分布（30 多年后被叫做 GGX，2007 年由 Walter 等人重新推导）
  3. Torrance-Sparrow 微面元模型推广到计算机图形
- **1980-1990s**：硬件 transform-and-lighting 单元固化为 Blinn-Phong 模型，从此成为图形 API 默认。
- **2012 年**：Disney 在 SIGGRAPH 公布 Principled BRDF（GGX 为核心），PBR 正式取代 Blinn-Phong 成为业界标准。
- **2026 年**：Blinn-Phong 仍在 mobile fallback、WebGL 教程、卡通渲染、和数百万行老 shader 里活着。

## 学到什么

1. **小数学技巧也能拿 SIGGRAPH**：把 R 换成 H 是初等向量运算，但省了一半算量 + 给出微面元解释，影响 30 年。
2. **公式要为硬件写**：H 在远光远视下是常数——这是为固定流水线量身定制的。
3. **物理动机比几何动机命长**：N·H 因为有微面元解释而活下来，并直接通向 Cook-Torrance 和 GGX。
4. **不能量守恒的模型在能量守恒时代必死**：Blinn-Phong 退场不是因为算量，是因为不符合物理。

## 延伸阅读

- 论文 PDF：[Blinn 1977 — Models of Light Reflection](https://dl.acm.org/doi/10.1145/563858.563893)（11 页，比 Phong 1975 更厚但同样可读）
- LearnOpenGL 教程：[Blinn-Phong 章节](https://learnopengl.com/Advanced-Lighting/Advanced-Lighting)（带图对比 R 和 H 两版差异）
- 视频：[Cem Yuksel — Introduction to Computer Graphics, Lecture 13](https://www.youtube.com/watch?v=VuhAVxBPZZ4)（讲 Blinn-Phong 几何推导）
- [[phong-1975]] —— 直接前作，理解 R·V 才能理解为什么换成 N·H

## 关联

- [[phong-1975]] —— Blinn-Phong 的母模型，本论文是它的 H 版改造
- [[cook-levin]] —— 同年代另一个『一篇论文奠基整个领域』的例子（不同领域）

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[cook-levin]] —— Cook-Levin 定理 — NP-完全性的诞生
- [[cook-torrance-1982]] —— Cook-Torrance 1982 — 把镜面反射拆成微面元 × 几何遮挡 × Fresnel
- [[disney-brdf-2012]] —— Disney Principled BRDF 2012 — 11 个滑块封装 Cook-Torrance 全家桶
- [[monaghan-1992-sph]] —— SPH — 把流体拆成一群带核的粒子
- [[phong-1975]] —— Phong 1975 — 把光照拆成环境+漫反射+高光三项
- [[stam-1999-stable-fluids]] —— Stable Fluids — 让流体模拟时间步随便给都不爆
- [[whitted-1980]] —— Whitted 1980 — 让光线在场景里递归跑三种次级射线

