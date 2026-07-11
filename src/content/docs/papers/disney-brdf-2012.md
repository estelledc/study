---
title: Disney Principled BRDF 2012 — 11 个滑块封装 Cook-Torrance 全家桶
来源: Brent Burley, "Physically-Based Shading at Disney", SIGGRAPH 2012 Course Notes
日期: 2026-05-31
分类: 图形学
难度: 进阶
---

## 是什么

Disney Principled BRDF（下称 **Disney BRDF**）是 2012 年 Disney 动画工作室的 Brent Burley 在 SIGGRAPH 课程上发布的一套**给美术用的物理材质模板**。日常类比：Cook-Torrance 1982 像一台单反相机，旋钮多但每个都对应物理量；Disney BRDF 像一台手机相机，**只留 11 个滑块**，但底层还是那台单反。

11 个滑块是：

- baseColor（基色）/ metallic（金属度）/ roughness（粗糙度）
- specular（高光强度）/ specularTint（高光染色）
- sheen（绒毛感）/ sheenTint
- clearcoat（清漆层）/ clearcoatGloss
- anisotropic（各向异性）/ subsurface（次表面近似）

"Principled" 不是"物理最准"，而是 **有原则的取舍**：滑块在 0-1 任意组合都不出 artifact，物理上大致合理，美术调起来直观。

## 为什么重要

不理解 Disney BRDF，下面这些事都没法解释：

- 为什么 **UE / Unity / Blender / Godot / Substance** 的默认材质球长得几乎一样——它们都基于 Disney BRDF 派生
- 为什么 **glTF 2.0** 资产格式以 metallic-roughness 为标准——是 Disney BRDF 的简化封装
- 为什么 2013 年的 Real Shading in UE4（Karis）开篇致谢 Disney——UE4 直接抄它再砍简
- 为什么从 2013 年起一份模型可以在 Maya 建、Substance 上贴图、Blender 渲、UE 跑——靠的是同一份滑块语义

它在 [[cook-torrance-1982]] 之后用 30 年时间补上的最后一块拼图——**让美术不必懂 D/G/F**。

## 核心要点

Disney BRDF 在 Cook-Torrance 的 D × G × F 之上做四件事：

1. **重新参数化**：把"粗糙度 m"换成 `α = roughness²`。原因：用户感觉滑到 0.5 应该是"中等粗糙"，但物理上 m=0.5 已经接近最粗糙。平方映射让滑块感觉线性。

2. **D 项升级**：用 GTR（Generalized Trowbridge-Reitz），γ=2 即 GGX（用于主镜面），γ=1 即 Berry 分布（用于 clearcoat，长尾更宽，模拟车漆双层高光）。F 项继续用 Schlick 1994。G 项用 Smith G2。

3. **金属/电介质二分用 metallic 滑块插值**：metallic=0 时 F0=0.04（电介质，无色），metallic=1 时 F0=baseColor（金属本身的色）。中间值物理上不存在，但美术常用来做"生锈的铜"等过渡。

4. **漫反射不用 Lambert**：Burley diffuse 把粗糙表面在掠射角的 retro-reflection（朝光源方向变亮）也补上，比 Lambert 多一项 `(1 + (FD90 − 1)·(1 − cosθ)^5)`，FD90 由粗糙度决定。

加分项：sheen 项给绒布/天鹅绒，clearcoat 项给车漆/指甲油，anisotropic 项给拉丝金属，subsurface 项做廉价次表面近似（不是真 BSSRDF）。

## 实践案例

### 案例 1：Blender 里就是 Disney BRDF

Blender 的 **Principled BSDF** 节点直接照搬 Disney 2012 的 11 个参数（外加 2015 年补的 transmission）：

```
Base Color → baseColor
Metallic   → metallic
Roughness  → roughness
Specular   → specular
Sheen      → sheen
Coat       → clearcoat
Anisotropic→ anisotropic
Subsurface → subsurface
```

Blender 文档第一句话就写：基于 Disney/Pixar Principled BRDF。

### 案例 2：UE4 砍掉了什么

Karis 2013 在 Real Shading in UE4 里说：UE4 只保留 **baseColor / metallic / roughness / specular**。砍掉的：

- sheen / clearcoat / anisotropic / subsurface —— 用单独 shading model（Cloth / ClearCoat / Hair / Subsurface）替代

这是个重要工业经验：**11 滑块对实时太多**，所以给主流材质 4 滑块，特殊材质另起 shading model。

### 案例 3：金属滑块在底层做了什么

```glsl
// 简化版 UE/Disney 等价代码
vec3 F0 = mix(vec3(0.04), baseColor, metallic);  // 电介质 0.04 / 金属 baseColor
vec3 albedo = baseColor * (1.0 - metallic);      // 金属无漫反射
```

**两行代码就把 [[cook-torrance-1982]] 的金属/电介质二分法封装完了**——这是 Disney 给世界的礼物。美术调 metallic 滑块，底层自动切换 F0 取值和漫反射开关。

## 踩过的坑

1. **specular 滑块不是镜面强度开关**：它实际上控制电介质 F0 在 0-0.08 之间映射（默认 0.5 对应 F0=0.04）。新人调到 0 会得到完全无高光的塑料，调到 1 会得到玻璃级反射。

2. **metallic=1 时 specularTint 无效**：metallic=1 时 F0 已经是 baseColor，再染色没有意义。引擎里这条逻辑藏在 shader 内部，调参看不到反馈。

3. **subsurface 不是真 SSS**：它只是 Hanrahan-Krueger 简化的廉价近似。皮肤、蜡、玉这种强次表面散射场景**必须**另用 BSSRDF；用 subsurface 滑块做皮肤会看起来像泡过水的橡皮。

4. **anisotropic + clearcoat 同启重叠**：两个高光层在掠射角会互相争亮度，出现奇怪的双高光。一般约定：拉丝金属不加清漆。

5. **roughness=0 时数值爆炸**：α=0² 让 D 项趋于 delta 函数，分母 4(N·L)(N·V) 也容易掉到 0。引擎里要 clamp `roughness >= 0.045` 之类的下限。

## 适用 vs 不适用场景

**适用**：

- 实时引擎默认材质（UE / Unity / Godot / Filament）
- DCC 工具默认 shader（Blender Principled BSDF / Substance / Marmoset）
- glTF 2.0 跨工具资产标准
- 美术教学：metallic-roughness 工作流入门

**不适用**：

- 皮肤、蜡、玉等强次表面散射 → 改用 BSSRDF
- 肥皂泡、蝶翅、CD 表面彩色干涉 → 几何光学不够，需波动光学
- 真透明玻璃/水透射 → 需带 transmission 的 BSDF（Disney 2015 补了这块）
- 毛发 → 用 Marschner 头发模型
- 学术上需要严格能量守恒 → 用纯 Cook-Torrance + Smith G2 自己拼

## 历史小故事（可跳过）

- **1982**：[[cook-torrance-1982]] 给出 D × G × F 物理框架，超前 30 年
- **1994**：Schlick 给 Fresnel 5 次方近似，实时门槛降低
- **2007**：Walter GGX 替代 Beckmann，长尾真实
- **2012**：Burley 在 SIGGRAPH 课程发 Disney BRDF + BRDF Explorer 工具 + MERL 100 材质拟合数据，27 页 PDF；课程笔记写明该模型用在 *Wreck-It Ralph* 及后续制作
- **2013**：Karis 在 SIGGRAPH 2013 Course 发 Real Shading in UE4，把 Disney BRDF 砍成实时可用的 metallic-roughness 子集；BRDF Explorer 随后开源
- **2015**：Burley 在 SIGGRAPH 2015 补 Disney BSDF（加 transmission / 改 sheen 为 Charlie 分布）
- **2017**：glTF 2.0 把 metallic-roughness 写进资产格式标准
- **2024**：OpenPBR 行业标准草案，仍以 Disney 为骨架

从 1982 论文到 2017 跨工具标准，整整 35 年。

## 学到什么

1. **少而正交的参数胜过物理精确**：11 个滑块比 30 个参数好用，前提是滑块组合不出 artifact。这是产品思维进入图形学的代表作。
2. **二分法封装一刀切**：metallic 0/1 把"金属用 baseColor 当 F0、电介质用 0.04"封装成一个浮点。中间值物理不存在但美术爱用——这种"物理上撒谎、视觉上自洽"是工业级 BRDF 的精髓。
3. **Principled 不是 Physical**：Disney 的"有原则"是工程取舍——可调、可读、不崩、约等于物理。学术上不严，但 90% 场景够用。
4. **用工具而不只是论文推动行业**：Burley 同时开源 BRDF Explorer 和 MERL 拟合数据，让所有引擎都能复现。光发论文不够，工具才是落地推进器。
5. **算法领先到工业普及要有完整生态**：1982 论文 → 2012 封装 → 2017 标准 → 工具链—— 30 多年才走完，硬件、美术、格式、工具一个都不能少。

## 延伸阅读

- 课程笔记 PDF：[Burley 2012 — Physically-Based Shading at Disney](https://blog.selfshadow.com/publications/s2012-shading-course/burley/s2012_pbs_disney_brdf_notes_v3.pdf)（27 页，最权威一手资料）
- BRDF Explorer 开源工具：[github.com/wdas/brdf](https://github.com/wdas/brdf)（拖滑块看 D/G/F 实时变化）
- 工业封装案例：[Karis 2013 — Real Shading in UE4](https://blog.selfshadow.com/publications/s2013-shading-course/karis/s2013_pbs_epic_notes_v2.pdf)
- 零基础教程：[LearnOpenGL — PBR Theory](https://learnopengl.com/PBR/Theory)（边讲边写 GLSL，最适合入门）
- 现代 Google 引擎：[Filament 文档](https://google.github.io/filament/Filament.html)（系统讲解 PBR 整套实现）
- [[cook-torrance-1982]] —— 物理基础，Disney 在它之上做封装
- [[blinn-1977]] —— Blinn 半角向量 H，Disney 公式里 H 仍是 D 项的核心输入

## 关联

- [[cook-torrance-1982]] —— Disney BRDF 是 Cook-Torrance D × G × F 的工业级封装
- [[blinn-1977]] —— H = (L+V)/|L+V| 半角向量，Disney 算 D 项时直接用
- [[phong-1975]] —— Phong 经验高光，Disney 用物理基础彻底取代它
- [[3d-gaussian-splatting]] —— 现代实时渲染另一条路，但表面着色仍走 Disney 思路

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[3d-gaussian-splatting]] —— 3D Gaussian Splatting — 用一堆 3D 模糊光斑重建场景
- [[blinn-1977]] —— Blinn 1977 — 用半角向量 H 把高光算量减半
- [[cohen-1985-hemicube]] —— Cohen-Greenberg 1985 Hemicube — 把渲染硬件挪去算辐射度积分
- [[cook-torrance-1982]] —— Cook-Torrance 1982 — 把镜面反射拆成微面元 × 几何遮挡 × Fresnel
- [[debevec-1998-rendering-with-natural-light]] —— Debevec 1998 — 用真实世界的光照亮 CG 物体
- [[goral-1984-radiosity]] —— Goral 1984 Radiosity — 把建筑工程的辐射热传导算法搬进图形学
- [[hu-2018-mls-mpm]] —— MLS-MPM — 把 MPM 重写到"几百行能跑实时"的现代版本
- [[lafortune-1993-bdpt]] —— Lafortune-Willems 1993 — 从相机和光源同时撒光线再"接龙"
- [[loop-1987-subdivision]] —— Loop 1987 — 三角形网格的递归光滑细分
- [[marching-cubes-1987]] —— Marching Cubes 1987 — 把体数据切成立方体查表生成三角网格
- [[panda3d]] —— Panda3D — 用 Python 写 3D 游戏的老牌引擎
- [[phong-1975]] —— Phong 1975 — 把光照拆成环境+漫反射+高光三项
- [[saito-takahashi-1990-gbuffer]] —— Saito-Takahashi 1990 — 第一次提出 G-buffer 的论文
- [[sulsky-1994-mpm]] —— MPM — 让粒子背着自己的历史，借网格算一遍力
- [[veach-1995-mis]] —— Veach MIS — 用一行加权公式让多种采样策略各取所长

