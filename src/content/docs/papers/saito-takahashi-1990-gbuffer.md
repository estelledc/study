---
title: Saito-Takahashi 1990 — 第一次提出 G-buffer 的论文
来源: Saito & Takahashi, "Comprehensible Rendering of 3-D Shapes", SIGGRAPH 1990
日期: 2026-05-31
分类: 图形学
难度: 中级
---

## 是什么

这篇 1990 年的 SIGGRAPH 论文第一次提出 **G-buffer**（Geometric Buffer，几何缓冲）这个名字和这个用法。

日常类比：你画一幅油画。传统画法是看着模型一遍画完——光、影、轮廓全在一笔里搞定。**G-buffer 画法**是先用铅笔把"每个像素离视点多远""每个像素朝哪个方向""每个像素属于哪个物体"分别画在三张透明纸上，然后把纸叠起来，再做后期上色、加轮廓、勾边。

作者 Saito 和 Takahashi 的本意**不是**做现代游戏的延迟渲染。他们想解决的是"技术插画"问题——怎么让计算机生成的 3D 图看起来像工程手册里那种带轮廓线的示意图。但他们随手发明的 G-buffer 思路，30 年后变成了几乎所有 AAA 游戏渲染器的地基。

## 为什么重要

不理解 G-buffer，下面这些事都没法解释：

- 为什么 Killzone 2（2009）能在一个画面里点 100 个动态光源，老引擎只能点 8 个
- 为什么 Crysis（2007）的 SSAO（屏幕空间环境光遮蔽）能跑实时——它就是从 G-buffer 里读 depth 和 normal
- 为什么现代游戏的 SSR（屏幕空间反射）、TAA（时序抗锯齿）、动态模糊都建在同一套缓冲上
- 为什么 1990 年一篇本来想解决"画轮廓线"的论文，反而成了"光照渲染"的奶奶

## 核心要点

G-buffer 思路可以拆成 **两步**：

1. **几何 pass（pencil 阶段）**：把场景里所有 3D 物体光栅化到屏幕，但**不算光照**。每个像素只记几何信息——离视点的距离 z、表面法向量、属于哪个物体的 ID、可能还有材质参数。这一步的代价跟物体数量成正比。

2. **图像 pass（color 阶段）**：现在屏幕上是一堆 2D 缓冲区。后续所有处理都在 2D 像素层面做——画轮廓线、加阴影、算光照、做反射。这一步的代价跟屏幕分辨率和效果数量成正比，**和原本 3D 物体数量无关了**。

把两步分开的最大好处：**复杂度从乘法变加法**。传统前向渲染算一个像素的光照是 O(物体数 × 光源数)，G-buffer 之后是 O(物体数) + O(光源数 × 像素数)。光源多的时候差距巨大。

## 实践案例

### 案例 1：Saito-Takahashi 论文里的原始用法

作者想画"工程示意图"。他们的 G-buffer 存了：

- z（深度）
- 法向量 n
- 物体 ID
- 表面参数（一阶/二阶微分量）

然后在 2D 图像上跑边缘检测：**z 值突变** = 物体边缘；**法向量突变** = 同一物体上的折线（比如立方体的棱）。

```
传统做法：从 3D 模型里硬算哪些边是轮廓线（O(三角形数)，复杂、易错）
G-buffer 做法：先光栅化，再在 2D 缓冲上跑 Sobel 滤波（O(像素数)，简单、稳定）
```

### 案例 2：Killzone 2 的延迟渲染

20 年后，Guerrilla Games 把同一个思路扩展成 **deferred shading**（延迟着色）。跟做三步：

1. **几何 pass**：把颜色、法线、材质参数写到多张全屏图（MRT，多渲染目标）；真实引擎常只写 depth，世界坐标在光照时再重建，不一定单独存 `gPosition`
2. **光照 pass**：每个动态光源画一个全屏四边形，按像素读这些图再算光
3. **结果**：100 个光源 ≈ 100 次全屏读图，几何只光栅化一遍

```glsl
// Pass 1: 几何 — 只写属性，不算光照
layout(location = 0) out vec4 gAlbedo;
layout(location = 1) out vec4 gNormal;
layout(location = 2) out vec4 gMaterial; // roughness, metallic, ...

void main() {
    gAlbedo   = texture(albedoTex, uv);
    gNormal   = vec4(normalize(worldNormal), 1.0);
    gMaterial = vec4(roughness, metallic, 0, 0);
}

// Pass 2: 光照 — 每个光源一个全屏 quad
void main() {
    vec3 albedo   = texture(gAlbedo, uv).rgb;
    vec3 normal   = texture(gNormal, uv).rgb;
    vec3 worldPos = reconstructWorldPos(uv, depth); // 从 depth 重建
    fragColor = computeLight(albedo, normal, worldPos, lightPos);
}
```

### 案例 3：SSAO / SSR —— 后处理也吃同一套缓冲

**SSAO**（屏幕空间环境光遮蔽，Crysis 2007 带火）：① 读 G-buffer 的 depth + normal；② 在像素周围采约 16 个邻域点；③ 看有多少被挡住，比例越大越暗。**SSR**（屏幕空间反射）：① 读法线推出反射方向；② 在屏幕上沿该方向步进并查 depth；③ 撞到表面就把那点颜色当反射。两者都把 3D 问题压成 2D；代价是屏幕外的几何反射/遮挡不出来。

## 踩过的坑

1. **G-buffer 吃显存带宽**：4 到 6 张全屏 HDR 渲染目标，1080p 一帧就是几十 MB 写入。带宽密集型工作负载。手机 GPU（tile-based）上代价更夸张。

2. **MSAA 不好做**：传统多重采样抗锯齿在前向渲染里几乎免费，G-buffer 时代每个属性都要存 N 倍样本，开销爆炸。后来用 **TAA**（时序抗锯齿）/ **FXAA** 绕过去。

3. **透明物体得另开一条 pass**：G-buffer 存的是"每像素一个表面"，遇到半透明就崩——一个像素其实有多个表面叠加。所以现代引擎是"deferred 不透明 + forward 透明"混合架构。

4. **材质多样性受限**：早期 deferred 的材质参数槽是定死的（diffuse + specular + roughness）。要加新材质（皮肤次表面散射、布料 BRDF）就得加缓冲。后来 **clustered forward+** / **visibility buffer** 部分回潮。

## 适用 vs 不适用场景

**适用**：

- 光源数量多（几十上百个动态点光源）的场景——延迟渲染的甜蜜点
- 屏幕空间后处理多（SSAO / SSR / DOF / 动态模糊）——本来就在 2D 里玩
- 非真实感渲染（NPR）/ 技术插画 / 卡通渲染——这正是 Saito-Takahashi 的本意

**不适用**：

- 显存带宽极紧张（移动 GPU、低端集显）→ 用 forward+ / clustered
- 透明物体为主的场景（粒子、玻璃、烟雾） → forward 更合适
- 极致材质多样性 → visibility buffer / forward+
- VR 高分辨率（带宽更紧）→ 视场景而定

## 历史小故事（可跳过）

- **1980 年代**：渲染界主流是 ray tracing（Whitted 1980）和 radiosity（Goral 1984），都很慢，离实时遥远。光栅化是给"画一遍就完事"的工程图用的。
- **1988 年前后**：Pixar 的 RenderMan / Reyes 架构已经在用"分阶段处理像素"思路（Cook 1987），但那是为离线胶片渲染设计的。
- **1990 年**：Saito 和 Takahashi 在东京大学发表这篇论文，目标是技术插画——给计算机生成的图加轮廓线、剖面线，让它看起来像机械工程手册里画的那种图。他们要解决的核心问题是"轮廓线在 3D 里怎么找"，结果发现"先光栅化到 2D 再做后处理"反而最简单。
- **2000 年代**：GPU 可编程 pipeline 成熟，多渲染目标（MRT）普及，G-buffer 能在硬件上实时跑。
- **2001 / 2005**：Xbox《Shrek》(2001) 已是早期全 deferred 商业作；GPU Gems 2（约 2005）的 S.T.A.L.K.E.R. 章把 deferred 推给更广的开发者（游戏本体约 2007 发售）。
- **2007 年**：Crytek 的 Crysis 上线 SSAO，玩家第一次直观看到"拐角变暗"的屏幕空间后处理——核心就是读 G-buffer 的 depth+normal。
- **2007–2009**：Guerrilla 在 Develop 2007 讲 Killzone 2 的 deferred；2009 发售并把这套推到 AAA 主流认知。
- **2013 年前后**：visibility buffer 作为反命题出现——只存三角形 ID，光照再回查几何，在带宽紧的平台回潮。

## 学到什么

1. **降维打击**——把 3D 问题压成 2D 问题再算，复杂度从乘法变加法
2. **作者的目的不一定是技术的最终用途**——为画轮廓线发明的东西，最后被光照渲染抢去当主战场
3. **缓冲区 = 中间表示**——G-buffer 是渲染管线的"IR"（中间表达），把"几何"和"着色"两个本不相关的关注点解耦
4. **复杂度换内存**——少算一些，多存一些；在显存带宽富余的年代是赚的，在带宽紧张的设备（移动）上得换思路
5. **三十年前的论文今天还在跑**——基础研究的回报周期比想象的长

## 延伸阅读

- 论文 PDF：[Comprehensible Rendering of 3-D Shapes](https://dl.acm.org/doi/10.1145/97879.97901)（SIGGRAPH 1990，10 页）
- 现代实践：[LearnOpenGL — Deferred Shading](https://learnopengl.com/Advanced-Lighting/Deferred-Shading) 一步步写一个 deferred 渲染器
- 工业案例：[Deferred Rendering in Killzone 2](https://www.guerrilla-games.com/read/deferred-rendering-in-killzone-2)（Develop Conference 2007，Valient）看 PS3 上怎么排 G-buffer
- 反向思考：[The Visibility Buffer](https://jcgt.org/published/0002/02/04/) 2013 论文，G-buffer 的"反命题"：只存三角形 ID，光照阶段再回去查
- [[kajiya-1986-rendering-equation]] —— G-buffer 解决的是"怎么高效算渲染方程"的工程侧
- [[whitted-1980]] —— 同期的另一条路（光线追踪），思路和 G-buffer 完全相反

## 关联

- [[kajiya-1986-rendering-equation]] —— 渲染方程定义"该算什么"，G-buffer 是"怎么算得快"的一种工程答案
- [[whitted-1980]] —— 光线追踪走"每像素追每条光线"的路，与 G-buffer 的"先光栅再后处理"形成对照
- [[disney-brdf-2012]] —— Disney BRDF 的材质参数（roughness / metallic）正是 G-buffer 里要存的那几张图
- [[cook-torrance-1982]] —— 微表面 BRDF 模型，G-buffer 存的法向量 + 粗糙度就是为它服务的

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[catmull-1974-zbuffer]] —— Catmull 1974 Z-buffer — 用一张深度图解决谁挡谁的问题
- [[cook-torrance-1982]] —— Cook-Torrance 1982 — 把镜面反射拆成微面元 × 几何遮挡 × Fresnel
- [[curless-levoy-1996-tsdf]] —— Curless-Levoy TSDF — 把多次扫描融成一个干净的 3D 模型
- [[disney-brdf-2012]] —— Disney Principled BRDF 2012 — 11 个滑块封装 Cook-Torrance 全家桶
- [[kajiya-1986-rendering-equation]] —— Kajiya 渲染方程 — 把所有渲染算法统一成一个积分方程
- [[whitted-1980]] —— Whitted 1980 — 让光线在场景里递归跑三种次级射线

