---
title: 候选论文池 — 图形渲染 / GPU / 几何处理
description: 60 篇图形领域奠基与里程碑论文，按 12 个子主题分组，覆盖 1974-2022 跨度
状态: candidate
主题: graphics
来源: study 站候选池扩充（无与现有 143 篇重复）
---

> 本文件是 study 站论文候选池的"图形渲染 / GPU / 几何处理"分支。
> 现有 143 篇 papers 中此主题为空白（仅 3D Gaussian Splatting 一篇近邻 CV）。
> 选篇标准：SIGGRAPH / ToG / I3D / EGSR 顶级会议优先；理论 + 工程并重；PDF 可获取。

## 总览

- **总数**：60 篇
- **跨度**：1974-2022
- **子主题数**：12

### 按子主题分布

| 子主题 | 数量 |
|---|---:|
| [着色 / 光照模型](#着色--光照模型) | 5 |
| [光线追踪](#光线追踪) | 7 |
| [辐射度](#辐射度) | 3 |
| [几何处理](#几何处理) | 7 |
| [加速结构](#加速结构) | 5 |
| [GPU 架构](#gpu-架构) | 4 |
| [可微渲染与神经渲染](#可微渲染与神经渲染) | 5 |
| [物理仿真](#物理仿真) | 7 |
| [实时渲染](#实时渲染) | 5 |
| [几何重建](#几何重建) | 4 |
| [采样、纹理与抗锯齿](#采样纹理与抗锯齿) | 5 |
| [图像合成与光场](#图像合成与光场) | 3 |

---

## 着色 / 光照模型

| slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| phong-1975 | Phong, "Illumination for Computer Generated Pictures" | 1975 | 第一个把 ambient + diffuse + specular 拆成可计算项的着色模型；现代 BRDF 命名学起点；任何图形入门课无法绕开的 8 行公式 | https://dl.acm.org/doi/10.1145/360825.360839 |
| blinn-1977 | Blinn, "Models of Light Reflection for Computer Synthesized Pictures" | 1977 | 用半角向量 H 替换反射向量 R，一个数学技巧让 specular 计算量减半且更符合微面元理论；fixed-function 时代 OpenGL/DirectX 默认模型 | https://dl.acm.org/doi/10.1145/563858.563893 |
| cook-torrance-1982 | Cook & Torrance, "A Reflectance Model for Computer Graphics" | 1982 | 把微面元 + Fresnel + 几何衰减写成可工程实现的物理 BRDF；现代 PBR 教材每章引用；Disney/UE/Unity shader 直系祖先 | https://dl.acm.org/doi/10.1145/357290.357293 |
| ward-1992 | Ward, "Measuring and Modeling Anisotropic Reflection" | 1992 | 各向异性 BRDF 第一篇能落地的工程模型；拉丝金属、布料、木纹的真实感来源；归一化技巧仍被 Frostbite 引用 | https://dl.acm.org/doi/10.1145/142920.134078 |
| disney-brdf-2012 | Burley, "Physically-Based Shading at Disney" | 2012 | 工业界最具影响力的 principled BRDF：11 个艺术家可调参数封装 Cook-Torrance 全家桶；Unreal/Unity/Blender 都在抄它；2012 后 PBR 标准事实 | https://disneyanimation.com/publications/physically-based-shading-at-disney/ |

## 光线追踪

| slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| whitted-1980 | Whitted, "An Improved Illumination Model for Shaded Display" | 1980 | 递归光线追踪开山作；reflection + refraction + shadow 三种次级射线的范式至今未变；RT Core 硬件就是把它做成 BVH + intersection 单元 | https://dl.acm.org/doi/10.1145/358876.358882 |
| kajiya-1986-rendering-equation | Kajiya, "The Rendering Equation" | 1986 | 把所有渲染算法统一成一个积分方程 L = Le + ∫f·L·cosθ dω；后续 30 年 path tracing / BDPT / MLT / NeRF 都在解这个方程的不同近似 | https://dl.acm.org/doi/10.1145/15922.15902 |
| cook-1984-distributed-ray-tracing | Cook, Porter, Carpenter, "Distributed Ray Tracing" | 1984 | 把多重积分（motion blur / DOF / 软阴影 / glossy reflection）统一塞进 Monte Carlo 采样；现代 offline renderer 的"DOF 怎么实现"答案就在这 4 页 | https://dl.acm.org/doi/10.1145/964965.808590 |
| lafortune-1993-bdpt | Lafortune & Willems, "Bi-directional Path Tracing" | 1993 | 同时从摄像机和光源出发采样路径再连接，把 caustics / 间接照明的方差大幅降低；Veach 1997 BDPT 的算法雏形 | https://graphics.cornell.edu/~bjw/papers.html |
| veach-1995-mis | Veach & Guibas, "Optimally Combining Sampling Techniques for Monte Carlo Rendering" | 1995 | Multiple Importance Sampling 公式 wᵢ = (nᵢpᵢ)^β / Σ；今天每个 path tracer 在 light sampling 与 BSDF sampling 之间做的 power heuristic 都来自这里 | https://dl.acm.org/doi/10.1145/218380.218498 |
| veach-1997-mlt | Veach & Guibas, "Metropolis Light Transport" | 1997 | 把 MCMC 引入渲染：在路径空间做 Metropolis 游走可以攻克 BDPT 仍方差爆炸的难场景（强 caustics、点光源透过缝隙）；理论高度无人后续超越 | https://dl.acm.org/doi/10.1145/258734.258775 |
| jensen-1996-photon-mapping | Jensen, "Global Illumination using Photon Maps" | 1996 | 两 pass 算法：先撒光子建 kd-tree，再做密度估计；caustics + SSS 工业级答案；早于 BDPT 的工程方案，至今 V-Ray / Mental Ray / Corona 仍在用 | http://graphics.ucsd.edu/~henrik/papers/photon_map/global_illumination_using_photon_maps_egwr96.pdf |

## 辐射度

| slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| goral-1984-radiosity | Goral, Torrance, Greenberg, Battaile, "Modeling the Interaction of Light Between Diffuse Surfaces" | 1984 | 把建筑学辐射热传导引入图形学；视点无关的全局光照解；与 ray tracing 形成 1980s 两条平行线，现代 Light Probe 系统是其精神后继 | https://dl.acm.org/doi/10.1145/964965.808601 |
| cohen-1985-hemicube | Cohen & Greenberg, "The Hemi-cube: A Radiosity Solution for Complex Environments" | 1985 | 用 5 个正交投影面+硬件 z-buffer 算 form factor，把辐射度从纯几何计算变成 GPU 可加速；GPU 通用计算最早的范例之一 | https://dl.acm.org/doi/10.1145/325165.325171 |
| hanrahan-1991-hierarchical-radiosity | Hanrahan, Salzman, Aupperle, "A Rapid Hierarchical Radiosity Algorithm" | 1991 | 用 quadtree 自适应细分把 O(n²) form factor 计算降到 O(n)；多分辨率分析的图形版；今天 Lightmass / Enlighten 的算法谱系 | https://dl.acm.org/doi/10.1145/127719.122740 |

## 几何处理

| slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| marching-cubes-1987 | Lorensen & Cline, "Marching Cubes: A High Resolution 3D Surface Construction Algorithm" | 1987 | 体数据 → 三角网格的 256 case 查表算法；CT/MRI 重建、地形生成、流体可视化共同祖先；至今最被引图形论文之一 | https://dl.acm.org/doi/10.1145/37402.37422 |
| catmull-clark-1978 | Catmull & Clark, "Recursively Generated B-Spline Surfaces on Arbitrary Topological Meshes" | 1978 | 任意拓扑网格细分到 C² 极限曲面；Pixar 角色建模标准；OpenSubdiv / Maya / Blender 默认细分模式 | https://www.sciencedirect.com/science/article/abs/pii/0010448578901100 |
| loop-1987-subdivision | Loop, "Smooth Subdivision Surfaces Based on Triangles" (硕士论文) | 1987 | 三角网格的 box-spline 细分版；Catmull-Clark 的三角对偶；游戏引擎 LOD 系统常用方案 | https://www.microsoft.com/en-us/research/wp-content/uploads/2016/02/thesis.pdf |
| taubin-1995-mesh-smoothing | Taubin, "A Signal Processing Approach to Fair Surface Design" | 1995 | 把网格平滑当成低通滤波；λ\|μ 双步骤防止收缩；现代 mesh denoising 方法都参照其频域分析框架 | https://dl.acm.org/doi/10.1145/218380.218473 |
| desbrun-1999-implicit-fairing | Desbrun, Meyer, Schröder, Barr, "Implicit Fairing of Irregular Meshes using Diffusion and Curvature Flow" | 1999 | 把热扩散方程隐式离散到三角网；Cotangent Laplacian 公式至今是 SGP 必背；mesh smoothing / parameterization / shape analysis 共同基础 | https://dl.acm.org/doi/10.1145/311535.311576 |
| garland-heckbert-1997-qem | Garland & Heckbert, "Surface Simplification Using Quadric Error Metrics" | 1997 | 边折叠 + 二次型误差度量；游戏 LOD / GIS 地形 / mesh compression 默认算法；Nanite 的预处理也基于此变体 | https://dl.acm.org/doi/10.1145/258734.258849 |
| sorkine-2004-laplacian-editing | Sorkine, Cohen-Or, Lipman, Alexa, Rössl, Seidel, "Laplacian Surface Editing" | 2004 | 用拉普拉斯坐标做形状编辑：保细节同时变形把手；ARAP / Bounded Biharmonic Weights 的直接前作；如今 Houdini / Blender 仍在用 | https://igl.ethz.ch/projects/Laplacian-mesh-processing/Laplacian-mesh-editing/laplacian-mesh-editing.pdf |

## 加速结构

| slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| bentley-1975-kdtree | Bentley, "Multidimensional Binary Search Trees Used for Associative Searching" | 1975 | k-d tree 原始论文；ray tracing / nearest neighbor / photon map / KNN 全场景祖宗；CS 本科算法书绕不开 | https://dl.acm.org/doi/10.1145/361002.361007 |
| meagher-1982-octree | Meagher, "Geometric Modeling Using Octree Encoding" | 1982 | 八叉树空间剖分初次系统化；体绘制 / 碰撞检测 / SVO 全部基于它；Minecraft / 体素引擎背后的数据结构 | https://www.sciencedirect.com/science/article/abs/pii/0146664X82901046 |
| goldsmith-1987-bvh | Goldsmith & Salmon, "Automatic Creation of Object Hierarchies for Ray Tracing" | 1987 | 第一个用 surface area heuristic 自动构 BVH 的算法；现代 RTX / Embree / OptiX BVH 构建器的爷爷 | https://ieeexplore.ieee.org/document/4057057 |
| wald-2007-sah-bvh | Wald, "On Fast Construction of SAH-based Bounding Volume Hierarchies" | 2007 | 把 SAH BVH 构建从 O(N²) 降到 O(N log N) 的 binned approximation；Embree / pbrt-v3 默认 builder；实时 RT 工程基础 | https://www.sci.utah.edu/~wald/Publications/2007/FastBuild/download/fastbuild.pdf |
| karras-2012-parallel-bvh | Karras, "Maximizing Parallelism in the Construction of BVHs, Octrees, and k-d Trees" | 2012 | Morton code + LBVH 在 GPU 上 O(N) 并行构 BVH；NVIDIA OptiX / Embree GPU 路径都基于这套；动态场景 RT 工程关键 | https://research.nvidia.com/publication/2012-06_maximizing-parallelism-construction-bvhs-octrees-and-k-d-trees |

## GPU 架构

| slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| lindholm-2008-tesla | Lindholm, Nickolls, Oberman, Montrym, "NVIDIA Tesla: A Unified Graphics and Computing Architecture" | 2008 | 第一代统一 shader 架构 G80 的官方解析；SM / warp / SIMT 词汇表起点；理解所有现代 GPU 的入门读物 | https://ieeexplore.ieee.org/document/4523358 |
| nickolls-dally-2010-cuda-era | Nickolls & Dally, "The GPU Computing Era" | 2010 | CUDA 创始人写的回顾：为什么 GPU 适合做通用计算、SIMT 与 SIMD 的差异、未来异构架构方向；ML 加速器的源头思考 | https://ieeexplore.ieee.org/document/5446251 |
| owens-2007-gpgpu-survey | Owens et al., "A Survey of General-Purpose Computation on Graphics Hardware" | 2007 | CUDA 之前的 GPGPU 时代综述（Cg / GLSL pixel shader 黑魔法）；让你理解 CUDA 出现前 GPU 通用计算有多难；deep learning 兴起前夜的全景图 | https://onlinelibrary.wiley.com/doi/10.1111/j.1467-8659.2007.01012.x |
| burgess-2020-turing-rt | Burgess, "RT Cores: NVIDIA Turing Architecture" | 2020 | 硬件 ray-triangle 求交单元的官方设计文档；理解 RTX / DXR / Vulkan RT 性能上限的硬件依据；混合渲染时代基础 | https://ieeexplore.ieee.org/document/9007413 |

## 可微渲染与神经渲染

| slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| li-2018-redner | Li, Aittala, Durand, Lehtinen, "Differentiable Monte Carlo Ray Tracing through Edge Sampling" | 2018 | 第一个真正能反向传播过 visibility discontinuity 的可微 path tracer；inverse rendering / material recovery / NeRF 之前的关键里程碑 | https://people.csail.mit.edu/tzumao/diffrt/diffrt.pdf |
| nimier-david-2019-mitsuba2 | Nimier-David, Vicini, Zeltner, Jakob, "Mitsuba 2: A Retargetable Forward and Inverse Renderer" | 2019 | 用 Enoki 做 transparent JIT + autodiff；GPU/CPU/SIMD/可微同一份代码；研究级渲染器工程范式 | https://rgl.epfl.ch/publications/NimierDavid2019Mitsuba2 |
| nerf-2020 | Mildenhall, Srinivasan, Tancik, Barron, Ramamoorthi, Ng, "NeRF: Representing Scenes as Neural Radiance Fields" | 2020 | 用 MLP + positional encoding 拟合 5D 辐射场；2020 年后 view synthesis / 3D reconstruction 全部在向它致敬或反对它；3D-GS 的直接对手 | https://arxiv.org/abs/2003.08934 |
| mueller-2022-instant-ngp | Müller, Evans, Schied, Keller, "Instant Neural Graphics Primitives with a Multiresolution Hash Encoding" | 2022 | 5 秒训出 NeRF 的工程奇迹：multi-resolution hash grid + tiny MLP + tiny-cuda-nn；让神经渲染从研究 demo 走到产品 | https://nvlabs.github.io/instant-ngp/assets/mueller2022instant.pdf |
| plenoxels-2022 | Fridovich-Keil, Yu, Tancik, Chen, Recht, Kanazawa, "Plenoxels: Radiance Fields without Neural Networks" | 2022 | 证明 NeRF 的关键是体表达不是神经网络；spherical harmonics + sparse voxel grid 直接拟合；3D-GS 的精神先驱 | https://arxiv.org/abs/2112.05131 |

## 物理仿真

| slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| stam-1999-stable-fluids | Stam, "Stable Fluids" | 1999 | 半拉格朗日 + 算子分裂解 Navier-Stokes，不会爆炸的隐式格式；至今游戏烟雾 / 火焰 / 实时流体的算法骨架 | https://www.dgp.toronto.edu/public_user/stam/reality/Research/pdf/ns.pdf |
| monaghan-1992-sph | Monaghan, "Smoothed Particle Hydrodynamics" | 1992 | 天体物理出身的无网格流体方法；后被图形界改造成 PCISPH / DFSPH；游戏液体仿真主流路线 | https://www.annualreviews.org/doi/10.1146/annurev.aa.30.090192.002551 |
| sulsky-1994-mpm | Sulsky, Chen, Schreyer, "A Particle Method for History-Dependent Materials" | 1994 | Material Point Method 起源；粒子 + 网格混合表达让大变形材料（雪、沙、泥、果冻）仿真稳定；Disney 冰雪奇缘 → Houdini 标准模块 | https://www.sciencedirect.com/science/article/pii/0045782594901120 |
| hu-2018-mls-mpm | Hu, Fang, Ge, Qu, Zhu, Pradhana, Jiang, "A Moving Least Squares Material Point Method with Displacement Discontinuity" | 2018 | MPM 在图形学的现代化重写：MLS 形函数 + APIC 转移让 MPM 在 GPU 实时跑；Taichi 框架原型论文 | https://yuanming.taichi.graphics/publication/2018-mlsmpm/mls-mpm-cpic.pdf |
| mueller-2007-pbd | Müller, Heidelberger, Hennix, Ratcliff, "Position Based Dynamics" | 2007 | 跳过力 / 加速度，直接对位置做约束投影；游戏布料 / 软体 / 头发的事实标准；NVIDIA Flex / Houdini Vellum 都基于 PBD | https://matthias-research.github.io/pages/publications/posBasedDyn.pdf |
| macklin-2014-position-based-fluids | Macklin & Müller, "Position Based Fluids" | 2014 | 把 SPH 不可压约束塞进 PBD 框架，能与刚体 / 布料统一求解；游戏引擎实时液体方案；NVIDIA Flex 核心 | http://mmacklin.com/pbf_sig_preprint.pdf |
| baraff-witkin-1998-cloth | Baraff & Witkin, "Large Steps in Cloth Simulation" | 1998 | 隐式欧拉 + 共轭梯度让布料能用大时间步；Maya / Marvelous Designer / 游戏引擎布料系统的算法基础 | https://www.cs.cmu.edu/~baraff/papers/sig98.pdf |

## 实时渲染

| slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| saito-takahashi-1990-gbuffer | Saito & Takahashi, "Comprehensible Rendering of 3-D Shapes" | 1990 | 第一次提出 G-buffer 概念；deferred shading 的奶奶；Killzone 2 / 现代延迟渲染 / SSAO / SSR 全靠它 | https://dl.acm.org/doi/10.1145/97879.97901 |
| deering-1988-triangle-processor | Deering, Winner, Schediwy, Duffy, Hunt, "The Triangle Processor and Normal Vector Shader" | 1988 | 硬件 z-buffer + 法线插值 + 多通道 deferred 雏形；现代 GPU 渲染管线祖先架构 | https://dl.acm.org/doi/10.1145/378456.378468 |
| karis-2014-ue4-pbr | Karis (Epic), "Real Shading in Unreal Engine 4" (SIGGRAPH course) | 2013 | 工业最广泛部署的实时 PBR 实现细节：split-sum approximation IBL + GGX + 简化 disney brdf；UE4 默认 shader 的设计文档 | https://blog.selfshadow.com/publications/s2013-shading-course/karis/s2013_pbs_epic_notes_v2.pdf |
| karis-2014-taa | Karis (Epic), "High Quality Temporal Anti-Aliasing" (SIGGRAPH course) | 2014 | 把上一帧 reprojection + neighborhood clamp 工程化；UE4 / Frostbite / 现代游戏 4K 渲染的关键技术；DLSS 的前作思想 | http://advances.realtimerendering.com/s2014/epic/TemporalAA.pptx |
| liu-2020-dlss | Liu (NVIDIA), "DLSS 2.0: Image Reconstruction for Real-time Rendering with Deep Learning" | 2020 | 深度学习首次大规模进入实时渲染管线；TAA + super resolution 的 ML 重写；定义了 2020+ AAA 游戏 4K 60fps 范式 | https://research.nvidia.com/publication/2020-08_dlss-20-image-reconstruction-real-time-rendering-deep-learning |

## 几何重建

| slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| curless-levoy-1996-tsdf | Curless & Levoy, "A Volumetric Method for Building Complex Models from Range Images" | 1996 | TSDF（截断有符号距离场）原始论文；Stanford Bunny 数据库背后的算法；KinectFusion / VoxelHashing / 工业 3D 扫描的奶奶 | https://graphics.stanford.edu/papers/volrange/volrange.pdf |
| kazhdan-2006-poisson-recon | Kazhdan, Bolitho, Hoppe, "Poisson Surface Reconstruction" | 2006 | 把点云 + 法线重建成水密网格，转化为 Poisson 方程；Meshlab / Open3D / RealityCapture 默认重建算法；至今 SOTA 的对手 | https://hhoppe.com/poissonrecon.pdf |
| newcombe-2011-kinectfusion | Newcombe et al., "KinectFusion: Real-Time Dense Surface Mapping and Tracking" | 2011 | 用消费级 RGB-D + GPU TSDF integration 实时重建；AR / VR / SLAM 工业级模板；之后 ElasticFusion / DynamicFusion / BundleFusion 的起点 | https://www.microsoft.com/en-us/research/wp-content/uploads/2011/01/ismar2011.pdf |
| park-2019-deepsdf | Park, Florence, Straub, Newcombe, Lovegrove, "DeepSDF: Learning Continuous Signed Distance Functions for Shape Representation" | 2019 | 用 MLP 隐式表达 SDF 的开山作；occupancy network / NeRF / 3D-GS 的前驱思想（神经场）；几何深度学习关键节点 | https://arxiv.org/abs/1901.05103 |

## 采样、纹理与抗锯齿

| slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| catmull-1974-zbuffer | Catmull, "A Subdivision Algorithm for Computer Display of Curved Surfaces" (PhD 论文) | 1974 | z-buffer 算法首次提出；现代 GPU 光栅化管线最基础的硬件特性；论文同时提出贴图、细分、Hidden Surface Removal 三大概念 | https://static.aminer.org/pdf/PDF/000/255/100/computer_display_of_curved_surfaces.pdf |
| williams-1983-mipmap | Williams, "Pyramidal Parametrics" | 1983 | mipmap 第一篇；O(1) 各向同性纹理过滤；GPU 硬件采样器至今实现的标准 | https://dl.acm.org/doi/10.1145/800031.808600 |
| perlin-1985-noise | Perlin, "An Image Synthesizer" | 1985 | Perlin noise 起源；程序化纹理 / 地形生成 / 火焰 / 云 / Minecraft 都来自这一篇；Ken Perlin 拿奥斯卡技术奖 | https://dl.acm.org/doi/10.1145/325165.325247 |
| cook-1986-stochastic-sampling | Cook, "Stochastic Sampling in Computer Graphics" | 1986 | 用 Poisson disk / jittered sampling 把规则采样的 aliasing 转成可接受的 noise；Pixar RenderMan / 离线渲染 AA 的算法基础 | https://dl.acm.org/doi/10.1145/7529.8927 |
| heckbert-1986-texture-survey | Heckbert, "Survey of Texture Mapping" | 1986 | 80 年代纹理映射全谱系综述；UV / projective / environment / bump 各种映射的原始定义；图形教材必引 | https://www.cs.cmu.edu/~ph/texsurv.pdf |

## 图像合成与光场

| slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| levoy-hanrahan-1996-light-field | Levoy & Hanrahan, "Light Field Rendering" | 1996 | 用 4D 光场代替 3D 几何做新视角合成；NeRF / 3D-GS / Lytro 相机 / IBR 全部精神祖先；image-based rendering 的奠基 | https://graphics.stanford.edu/papers/light/light-lores-corrected.pdf |
| gortler-1996-lumigraph | Gortler, Grzeszczuk, Szeliski, Cohen, "The Lumigraph" | 1996 | 与 Levoy 几乎同期发布的 light field 方案；加入几何 proxy 提高质量；现代 view synthesis 的另一支系 | https://dl.acm.org/doi/10.1145/237170.237200 |
| debevec-1998-rendering-with-natural-light | Debevec, "Rendering Synthetic Objects into Real Scenes" | 1998 | HDRI environment map 工程化；image-based lighting (IBL) 的工业起点；现代 PBR 工作流不能没有它 | https://www.pauldebevec.com/Research/IBL/debevec-siggraph98.pdf |
