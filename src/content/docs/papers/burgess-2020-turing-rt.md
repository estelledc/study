---
title: Burgess 2020 RTX ON — Turing 把光线追踪做进硅片
来源: 'Burgess, J., RTX ON – The NVIDIA TURING GPU, IEEE Micro vol. 40 no. 2, pp. 36-44, Mar/Apr 2020. DOI 10.1109/MM.2020.2971677'
日期: 2026-05-31
子分类: 渲染与图形
分类: 图形学
难度: 中级
provenance: pipeline-v3
---

## 是什么

Turing 是 NVIDIA 2018 年发布的第七代 GPU 架构，旗舰是 **TU102（RTX 2080 Ti）**。Burgess 这篇 IEEE Micro 总结文章讲清楚一件事：**Turing 在硅片上加了一类新单元——RT Core**，专门做光线追踪里最贵的两件事——**BVH 遍历**和**光线-三角形求交**。再配合第二代 Tensor Core 做 AI 去噪，**让光追第一次能在 60 fps 下跑游戏**。

日常类比：以前画一张写实照片，要么用相机（栅格化——快但是贴图作假）要么用画笔一笔一笔画（光追——真实但慢到离线）。**Turing 给画家配了一台特制的"几何尺"（RT Core）**，画笔自己还在你手上，但量距离 / 找交点这种重活从画家脑子里搬到了尺子里——画家只负责创意，尺子负责算账。

落到硅片：**TU102 = 186 亿晶体管、TSMC 12nm FFN、754 mm²、72 SM × 64 FP32 = 4608 CUDA 核 + 72 RT Core + 576 第二代 Tensor Core**。代表卡 **RTX 2080 Ti / 2080 / 2070、Quadro RTX 6000 / 8000**。**Tesla T4** 例外——只有 Tensor Core 没 RT Core，定位推理。

## 为什么重要

不理解 Turing，下面这些事都没法解释：

- 为什么 **2018 年之前游戏里几乎看不到真光追**——CPU 路径追踪每帧几秒到几分钟，离 16ms 一帧的实时差三个数量级
- 为什么 **DirectX Raytracing（DXR）和 Vulkan RT 扩展 2018 同期才出**——硬件没就绪，API 也无处落
- 为什么 **DLSS 这种"AI 补帧"在 Turing 才出现**——Tensor Core + RT Core 在同一颗硅片，去噪和插帧才有算力预算
- 为什么 **2018-2024 的消费 GPU 都是"栅格 + RT + Tensor"三件套**——这套分工是 Turing 定的，[[ampere-architecture-2020]] / Ada / Blackwell 都在加强不在重做

## 核心要点

Turing 在 [[volta-architecture-2017]] 之上做了 **三件事**：

1. **RT Core——固定功能光追加速器**：每个 SM 一个 RT Core，负责两件最贵的活——**遍历 BVH 树**（找哪些三角形可能挡到光线）和**光线-三角形求交**（求精确碰撞点）。SM 上的 CUDA Core 只发起 `TraceRay()`、收结果做着色。意义：**软件版 Pascal 用 shader 模拟光追约 1 Giga Rays/sec，Turing 直奔 10 Grays/sec**——这一步硅化就是 10×。

2. **第二代 Tensor Core + DLSS**：[[volta-architecture-2017]] 第一代只做 FP16；Turing 加 **INT8 / INT4 推理路径**，把 Tensor Core 从训练单元扩成训练 + 推理双用。**DLSS（Deep Learning Super Sampling）**就是用它跑——**低分辨率出图 + AI 上采样到目标分辨率**，等价用算力换像素，把 RT 省下的预算花在 AI 补帧上。

3. **SM 流水线重排**：FP32 和 INT32 改成**双发并行**——以前一条 SM 在做 FP32 时 INT32 单元闲着，Turing 让两边同时跑，**整型运算（地址计算 / 循环索引）平均省 36%**。L1 / shared memory 合并成 96KB **可配置**池子（V100 是固定 128KB / 96KB 拆分）。新增**变量速率着色（VRS）**——画面边缘可以"几像素一着色"省算力。

### 三件事怎么配合：混合渲染管线

Turing 不是"全光追"——是 **栅格化主体 + 选择性发射光线 + AI 去噪** 的混合管线：

- **大部分像素**仍由栅格化画——快，每秒 60 帧没问题
- **难做的效果**（反射 / 阴影 / 环境光遮蔽 / 全局光照）从着色器**发射几条光线**——RT Core 算交点
- **光线少 = 噪声大**——Tensor Core 跑去噪网络，把"几条光线的稀疏样本"补成干净图像
- **DLSS** 再用 AI 把渲染分辨率从 1440p 上采样到 4K——总算力预算守住

这个**算力分工**是 Turing 论文最核心的工程贡献——不是单点技术发明，是**让三种异构单元在 16ms 一帧的预算里恰好够用**。

## 实践案例

### 案例 1：BVH 是什么——给 RT Core 喂的数据结构

光追每条光线要问 "这条线撞到场景里哪个三角形"。场景有 100 万个三角形，**线性扫一遍肯定不行**。**BVH（Bounding Volume Hierarchy）= 把三角形按空间分组，套层层包围盒**——根盒子套整场景，往下分两半盒子各套一半三角形，递归到每盒一两个三角形。

光线进来：**先和根盒求交**——不撞就丢；撞了就**沿树往下两个子盒**问；最终只剩几个候选三角形精确求交。**每条光线从 O(N) 降到 O(log N)**。

RT Core 把"BVH 节点访问 + 光线-三角形求交"做成 fixed-function——不可编程但**比 SM 跑同样代码快 10×**。

### 案例 2：DLSS 在干什么——用算力换像素

直觉：要 4K 60fps，需要每秒画 5 亿像素。**DLSS 偷懒**——只画 1440p（约 4K 的 44%），然后让一个**预训练神经网络**把它"放大"到 4K。

```
低分辨率帧 + 历史帧 + 运动向量 → DLSS 网络（Tensor Core 跑）→ 高分辨率输出
```

Tensor Core 每秒可以跑约 110 TOPS INT8——画一帧 DLSS 大概 1-2ms。代价：**极少数情况下细节会糊或鬼影**，但平均效果 = 比原生 1440p 锐、比原生 4K 慢得少。

### 案例 3：RT Core 不能干什么——着色还是 SM 做

RT Core 只回答"光线撞到哪个三角形 / 在哪"。**碰到三角形之后做什么**（反射光线方向、采样纹理、二次发射）——这部分是**着色器代码**，CUDA Core 跑。这就是为什么 RT Core 数量只是 SM 数（72），不是 CUDA Core 数（4608）——**它是 SM 的协处理器，不是替代品**。

### 案例 4：RTX 2080 Ti 一帧的预算分配

按 60 fps = 每帧 16.6ms 算，开 RT 反射 + DLSS 2.0 后大致：

- **栅格化主体几何 + 着色**：约 6ms（CUDA Core）
- **RT Core 发射反射光线 + BVH 遍历**：约 3-4ms（RT Core）
- **去噪 + DLSS 上采样**：约 2ms（Tensor Core）
- **后处理 + UI**：约 2ms
- **预留余量**：约 2ms

**三种单元几乎并行跑**——RT Core 在算反射时 CUDA Core 在着色直接光照，这就是混合管线高效的原因。任何一种单元成为瓶颈，都达不到 60 fps。

## 踩过的坑

1. **首发 RT 性能压力大**：RTX 2080 Ti 开 RT 在 1440p 也常掉到 40-50 fps；2018-2019 早期游戏（Battlefield V 等）光追实现不成熟，画面收益和性能代价不平衡。**[[ampere-architecture-2020]] 第二代 RT Core 把 BVH 遍历再快 2×** 才让 RT 真正主流化。

2. **第一代 DLSS（DLSS 1.0）口碑差**：用了**每游戏单独训模型 + 静态采样**，糊、不通用。**DLSS 2.0（2020）改成统一时序网络**才翻身。Turing 卖的时候 DLSS 1.0 体验**显著拉低 RTX 价值感**。

3. **Tesla T4 没 RT Core**：T4 用 TU104 但屏蔽 RT Core——**纯推理卡**。这是 NVIDIA 第一次把"消费 RT"和"数据中心推理"分开做硅。后来 [[ampere-architecture-2020]] 的 A100 也没 RT Core，Ada L40 才把两者重新合并。

4. **混合渲染对开发者复杂**：游戏引擎要同时维护栅格管线 + RT 管线 + DLSS 集成，**API（DXR / VKR）** 抽象层薄、调优坑多。**虚幻 5 / Unity HDRP 在 2021-2022 才把 RT 做成"打勾启用"**。早期开发自己写 BVH 更新逻辑、自己做去噪 shader 大坑无数。

5. **动态场景 BVH 重建是隐性成本**：BVH 是预计算的空间结构，**场景里物体一动就得重建或刷新**——角色走动、爆炸、布料模拟。RT Core 加速了"用 BVH"，但**重建 BVH 仍然在 CPU 或 SM 上跑**。早期游戏里动态物体多的场景反而 RT 越开越慢，就是这个原因。Turing 给了硬件 API（refit / rebuild）但策略要开发者自己定。

## 适用 vs 不适用场景

**适用**：
- 实时光追游戏（反射 / 阴影 / 全局光照）——这是 Turing 设计目标
- 影视实时预览——以前 Maya / Blender 视口要么栅格预览要么离线渲染，Turing 后视口能开 RT
- 工业可视化（汽车 / 建筑）——Quadro RTX 在工作站把"实时真实材质预览"做出来
- AI 推理（Tensor Core 部分）——T4 / RTX 系列推理性价比极强

**不适用**：
- 大规模训练——Tensor Core 算力 V100 / A100 高得多，且 Turing 没 BF16
- 离线高质量光追——还是 CPU 集群（Pixar RenderMan）或专业 GPU 渲染器（OptiX 但用 A100）更稳
- 高吞吐 HPC / 科学计算——FP64 算力被砍（消费定位），HPC 还是看 V100 / A100
- 移动 / 嵌入式光追——Turing 功耗 250W 起，手机端要等 2022 后的 ARM Mali / Adreno RT 单元

## 历史脉络

- **1980 年代**：光追在离线渲染（Pixar、CG 电影）成熟——[[cook-1984-distributed-ray-tracing]] / [[lafortune-1993-bdpt]]。CPU 一帧几小时。
- **2008-2017**：GPU shader 模拟光追（OptiX / iray）——能跑但每秒约 1 Grays，离实时还差 10×。
- **2018**：Turing 发布——RT Core 把 BVH 遍历做进硅片，10 Grays/sec。同期 DXR / Vulkan RT API 上线。
- **2020**：[[ampere-architecture-2020]] 第二代 RT Core，BVH 遍历再 2×；同年 DLSS 2.0 翻身。
- **2022-2024**：Ada（RTX 40）第三代 RT Core + Shader Execution Reordering；Blackwell（RTX 50）继续。**RT Core + Tensor Core + 栅格三件套**自此成为消费 GPU 标配。

## 与同期方案对比

**Imagination PowerVR Wizard（2014）**：第一个公开声称硬件光追的 GPU IP——但只在嵌入式 IP 授权层面，没量产消费产品。Turing 是第一个**桌面级、量产、配套软件栈完整**的硬件光追平台。

**AMD RDNA 2（2020）**：用**Ray Accelerator** 单元实现 RT，但 BVH 遍历仍由着色器配合做，**不是完全 fixed-function**。性能上首发 RX 6800 XT 在 RT 工作负载明显落后 RTX 3080，部分原因就是这个混合策略。Turing 走纯 fixed-function 路线在 RT 性能上更激进。

**Intel Arc Alchemist（2022）**：每个 Xe 核 1 个 RT 单元，BVH 遍历 + 求交全硬件，路线最接近 Turing。但驱动栈成熟度不足，市场份额有限。

这三家路线对照能看出 Turing 设计的两个赌注：**(1) BVH 遍历值得做进硅**——AMD 第一代赌反了，第二代 RDNA 3 改成更接近 NVIDIA 路线。**(2) AI 去噪 + 上采样是 RT 的必要伴侣**——AMD FSR / Intel XeSS 都是模仿 DLSS 的产物。

## 学到什么

1. **硬件加速器的本质是固化高频路径**——RT Core 只做 BVH 遍历和光线-三角求交两件事，但这两件占光追 80% 时间，做进硅就是 10×。这和 [[volta-architecture-2017]] Tensor Core 把 4×4 矩阵乘做进硅的思路一样。
2. **混合管线优于纯方案**——Turing 没把栅格扔了走全光追，而是栅格 + RT + AI 去噪 + DLSS 协同。**现实约束下的工程混合 > 理论纯净的全光追**。
3. **配套软件栈决定硬件接受度**——RT Core 没 DXR / VKR / DLSS / 虚幻 5 / Unity 集成，硬件就是孤岛。Burgess 这篇把硬件 + API + 引擎集成 + 模型训练当成**一个整体**写，是工程系统论文的范本。
4. **第一代产品是定锚不是终点**——Turing RT 性能 + DLSS 1.0 槽点不少，但**后续每代都在这套架构上迭代**——做对方向比首发完美更重要。
5. **算力分工比单点峰值重要**——TU102 同样 754 mm² 硅片，如果把 RT Core / Tensor Core 全换成 CUDA Core，纸面 FP32 算力更高，但 RT 工作负载反而更慢。**异构单元按工作负载切分预算**是这一代消费 GPU 的设计哲学。

## 延伸阅读

- [Burgess 2020 IEEE Micro 论文 PDF](https://ieeexplore.ieee.org/document/8988690) — 9 页综述，硬件细节 + 性能数据
- [NVIDIA Turing Architecture Whitepaper](https://www.nvidia.com/content/dam/en-zz/Solutions/design-visualization/technologies/turing-architecture/NVIDIA-Turing-Architecture-Whitepaper.pdf) — 86 页技术白皮书
- [Microsoft DXR Specification](https://microsoft.github.io/DirectX-Specs/d3d/Raytracing.html) — 配套 API
- [[cook-1984-distributed-ray-tracing]] —— 光追采样理论的源头
- [[lafortune-1993-bdpt]] —— 双向路径追踪，离线高质量基线
- [[volta-architecture-2017]] —— Tensor Core 起点
- [[ampere-architecture-2020]] —— Turing 的下一代

## 关联

- [[volta-architecture-2017]] —— Volta 第一代 Tensor Core，Turing 在它之上加 RT Core 和 INT 推理
- [[ampere-architecture-2020]] —— A100 第二代 RT Core + 第三代 Tensor Core，把 Turing 路线推到数据中心
- [[cook-1984-distributed-ray-tracing]] —— 光追算法源头，Turing 是它 36 年后的硬件答卷
- [[lafortune-1993-bdpt]] —— 双向路径追踪，离线渲染参照
