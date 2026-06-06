---
title: NVIDIA Turing — RT Core 把光追装进消费卡，Tensor Core 第二代下放 INT8
来源: 'NVIDIA, "NVIDIA Turing GPU Architecture — Graphics Reinvented", Whitepaper WP-09183-001_v01, 2018'
日期: 2026-05-30
子分类: GPU 架构
分类: 图形学
难度: 中级
provenance: pipeline-v3
---

## 是什么

Turing 是 NVIDIA 2018 年发布的第七代 GPU 架构，旗舰是 **TU102（Quadro RTX 6000 / GeForce RTX 2080 Ti）**。它在一代之内做了三件改写底层假设的事：**第一代 RT Core（硬件光追）+ 第二代 Tensor Core（加 INT8 / INT4）+ FP32 与 INT32 并行数据通路**——前两件让"图形渲染"和"AI 推理"两条路线在同一颗硅片上首次正式合流，后一件让普通游戏 shader 单 SM IPC 跳 ~36%。

日常类比：[[volta-architecture-2017]] 是在数据中心车间专门加了一台拼乐高 4×4 的机器（Tensor Core）；Turing 是**把这台机器小型化装进了家用工作台**，**再加一台专门追光线的雕刻机（RT Core）**——同一张消费卡既能游戏渲染、又能 AI 推理、还能跑光追。**Volta 是数据中心的产物，Turing 是把它揉进消费市场的产物**。

落到硅片：**TU102 = 186 亿晶体管、TSMC 12nm FFN、754 mm²、72 SM × 64 FP32 = 4608 FP32 + 576 第二代 Tensor Core + 72 RT Core、GDDR6 14 Gbps、NVLink 2.0 100 GB/s（仅 Quadro / Titan）、260W TDP**。代表卡：**Quadro RTX 6000 / 8000、Titan RTX、GeForce RTX 2080 Ti / 2080 / 2070 / 2060**，**Compute Capability sm_75**。

## 为什么重要

不理解 Turing，下面这些事都没法解释：

- 为什么 **RTX = "Ray Tracing eXtreme"**——RT Core 是 GPU 历史上第一次为光线求交（BVH 遍历 + 三角形相交）造专用硬件
- 为什么 **DLSS 1.0 / 2.0 只能在 RTX 卡跑**——DLSS 用 Tensor Core 推理，老 GTX 没 Tensor Core
- 为什么 **2018 后消费 GPU = "图形 + AI" 双引擎**——Turing 把 [[volta-architecture-2017]] 数据中心的 Tensor Core 第一次下放消费市场
- 为什么 **YOLOv5 / Stable Diffusion 在 RTX 2080 上能跑**——第二代 Tensor Core 加 INT8 / INT4，推理算力跳 2-4 倍
- 为什么 **2020 年才出现"Tensor Core 加速 BERT 推理"教程**——Turing INT8 是它的硬件支点

## 核心要点

Turing 在 [[volta-architecture-2017]] 之上做了 **四件事**：

1. **RT Core 第一代**：每个 SM 里 1 个 RT Core，专门加速 **BVH 树遍历 + 三角形相交求交**——这两件事过去由 SM 着色器软件完成，慢且抢占算力。RT Core 把这两步 fixed-function 化，**TU102 达 10 Giga Rays/sec**，比纯 SM 软件路径快 **~10×**。意义：实时光追（每帧上百万光线）从不可能变可行。

2. **第二代 Tensor Core**：在 [[volta-architecture-2017]] FP16 / FP32 累加之上，加 **INT8 / INT4 整数模式**——INT8 是 FP16 算力的 **2×**，INT4 是 **4×**。TU102 FP16 Tensor 算力 ~114 TFLOPS、INT8 ~228 TOPS、INT4 ~455 TOPS。意义：**推理比训练吃的精度低**，INT8 把消费卡推理算力一夜抬两倍，催生 TensorRT INT8 量化路线。

3. **FP32 与 INT32 并行数据通路**：[[pascal-architecture-2016]] 之前 SM 共享一套整数 / 浮点 ALU，shader 跑 `idx * stride + base` 这种"整数算地址 + 浮点算颜色"必须串行。Turing 给每个 SM 拆**两套独立通路**：64 FP32 + 64 INT32 同时发射。意义：游戏 shader 平均 ~36 INT 指令 / 100 FP 指令，并行后实测 IPC 提升 **30-50%**。

4. **Mesh Shader + Variable Rate Shading（VRS）**：传统几何流水线（vertex shader → geometry shader → tessellation）用了 20 年，瓶颈是固定。Mesh Shader 把它换成"两阶段计算 shader"（task → mesh），开发者直接写并行几何生成。**VRS** 让屏幕不同区域用不同像素着色率（中心 1×1、边缘 2×2、屏幕外 4×4）——肉眼看不出但少 30% 像素 shader 工作。意义：图形 API 二十年来最大改动，DirectX 12 Ultimate / Vulkan 1.2 跟进。

### 这四件事怎么互为支柱

- 没 **RT Core**，光追只能离线渲染（电影可以、游戏不行）
- 没 **第二代 Tensor Core INT8**，DLSS 1.0 跑不动每帧推理
- 没 **FP32/INT32 并行**，普通 shader 性能没提升 → "RTX 卡只是为光追"卖不动
- 没 **Mesh Shader / VRS**，几何 + 着色阶段无法跟上 RT Core 的速度

## 实践案例

### 案例 1：DLSS 1.0 一帧里同时用三种核心

```
游戏一帧 (RTX 2080 Ti):
  [SM FP32]        渲染低分辨率（1440p）几何 + 材质
  [RT Core]        发射光线，做反射 / 阴影 / GI 求交
  [Tensor Core]    INT8 推理 DLSS 网络，把 1440p 升到 4K
=> 同一帧、同一颗 GPU，三种专用单元各干各的、并行流水
```

意义：**Turing 是第一颗"图形 + 光追 + AI 推理"三合一**的消费 GPU——这是后续 Ampere / Ada Lovelace 的模板。

### 案例 2：TensorRT INT8 量化推理

```python
# TensorRT 8 INT8 calibration on RTX 2080 Ti
import tensorrt as trt
config = builder.create_builder_config()
config.set_flag(trt.BuilderFlag.INT8)            # 启用 INT8
config.int8_calibrator = MyCalibrator(data)      # 校准集找量化范围
engine = builder.build_engine(network, config)
# ResNet-50 推理: FP16 ~3.5ms, INT8 ~1.8ms (≈2x)
```

INT8 走第二代 Tensor Core，2× FP16 吞吐——这是 2019 后边缘 / 工作站推理标配路径。

### 案例 3：CUDA WMMA INT8 直写

```cuda
#include <mma.h>
using namespace nvcuda::wmma;
fragment<matrix_a, 16, 16, 16, signed char, row_major> a;
fragment<matrix_b, 16, 16, 16, signed char, col_major> b;
fragment<accumulator, 16, 16, 16, int> c;
fill_fragment(c, 0);
load_matrix_sync(a, A_ptr, 16);
load_matrix_sync(b, B_ptr, 16);
mma_sync(c, a, b, c);              // 一拍 16x16x16 INT8 GEMM, INT32 累加
```

CUDA 10 起 `wmma` 加 INT8 / INT4 类型。意义：**消费卡也能写定制低精度 GEMM**，研究者不用买 V100 也能做量化算法。

### 案例 4：RTX 2080 Ti vs GTX 1080 Ti 同代对比

```
GTX 1080 Ti (Pascal): 11.3 FP32 TFLOPS, 0 RT, 0 Tensor, 11 GB GDDR5X
RTX 2080 Ti (Turing): 13.4 FP32 TFLOPS, 10 GRays/s RT, 114 FP16 / 228 INT8 TOPS, 11 GB GDDR6
游戏帧率: ~+30% (光栅化), 光追开后 1080 Ti 完全跑不动
DLSS 4K: 1080 Ti 不支持, 2080 Ti 60+ FPS
```

意义：**Pascal → Turing 的"代差"不是光栅算力（只 +20%），而是新增的两类专用核心**——这个套路 [[volta-architecture-2017]] 在数据中心走过一次，Turing 在消费市场重演。

## 踩过的坑

1. **GTX 16 系列没有 RT / Tensor Core**：GTX 1660 / 1650 也是 Turing 架构（TU116 / TU117），但**砍掉 RT 和 Tensor**，只留 FP32/INT32 并行 + GDDR6——为压价格。买卡前必看型号是 RTX 还是 GTX。

2. **NVLink 仅 Quadro / Titan 有**：消费 RTX 2080 / 2080 Ti **去掉 NVLink**（Pascal 时代 1080 Ti 还有 SLI 接口），多卡训练只能走 PCIe。Quadro RTX 6000 / 8000 / Titan RTX 才有。

3. **RT Core 不能"独立工作"**：RT Core 算"光线 vs BVH"求交，但 **shading（颜色计算）还得回 SM**——光追性能仍受 SM 算力 + 显存带宽影响。RT Core 只解决"找交点"那一环。

4. **第二代 Tensor Core INT4 实际很少用**：INT4 4× 算力诱人，但量化校准 + 精度掉点工程化困难。多数 TensorRT 引擎只到 INT8，INT4 留给极少数自研团队。

5. **DLSS 1.0 效果差**：第一代 DLSS 训练用每个游戏专门数据集，画面糊、伪影多，被骂"AI 涂抹"。直到 **DLSS 2.0（2020）** 通用模型 + 时序复用才翻身——但底层硬件（Tensor Core INT8）从 Turing 开始就够用。

6. **混合精度 INT8 易精度爆炸**：FP16 容错高，INT8 无 sign exponent，量化 scale 选错梯度直接溢出。必须 calibration set 跑 KL 散度找最佳 scale，**纯换 dtype 不行**。

## 适用 vs 不适用场景

**适用**：

- 实时光追游戏 —— Cyberpunk / Control / Metro Exodus 等 RTX 标志作
- 边缘 / 工作站 INT8 推理 —— TensorRT + RTX 2080 Ti 是 2019-2021 推理标配
- 消费级 AI 实验 —— 学生买 RTX 2070 也能跑 CUDA Tensor Core
- 内容创作 + AI 加速 —— Premiere / Resolve 用 Tensor Core 做降噪、超分

**不适用**：

- 大规模训练 —— V100 / A100 才是数据中心选择，RTX 缺 NVLink / HBM
- BF16 / TF32 —— Ampere 起才有，Turing 仅 FP16
- FP8 / Transformer Engine —— Hopper H100 起才有
- 多卡 GPU 直连 —— 消费 RTX 无 NVLink，Quadro 才能两卡桥接
- 高 FP64 HPC —— Turing FP64 = 1/32 FP32（消费定位），需要 V100 / A100

## 历史小故事（可跳过）

- **2018-08 SIGGRAPH**：黄仁勋发布 Quadro RTX，"GPU 历史最大架构跨越"——RT Core + Tensor Core 同台亮相
- **2018-09 GeForce RTX 2080/2080 Ti 上市**：消费市场首张光追卡，定价 999 / 1199 USD 引争议
- **2018-10 Battlefield V**：第一款 RTX-on 游戏，光追开关全网炸号
- **2019-02 GTX 16 系**：砍掉 RT / Tensor 的 Turing 派生，价格压到 200 USD 以下
- **2019-08 DLSS 2.0 蓝图**：NVIDIA 承认 DLSS 1.0 失败，重做通用模型
- **2020-03 DLSS 2.0 上线**：Turing Tensor Core 才真正发挥价值，画质追平原生
- **2020-09 Ampere RTX 30 系**：第二代 RT Core + 第三代 Tensor Core，Turing 让位但兼容性长尾延续

## 学到什么

1. **专用化路线全面下沉**：[[volta-architecture-2017]] 在数据中心证明"专用单元 (Tensor Core) 跑特定负载更划算"，Turing 把这条路线**打包加 RT Core 一起塞进消费卡**——专用化从此成 GPU 主旋律
2. **图形与计算合流的硅片证据**：1999 GeForce 256 是图形卡、[[tesla-architecture-2008]] 让通用计算上车、[[volta-architecture-2017]] 加 AI、Turing 是**第一颗同时"图形 + 计算 + 光追 + AI 推理"四合一**的硅片
3. **架构升级靠新增专用核心，不只是 FP32 加宽**：Pascal → Turing 光栅算力只 +20%，但新增两类专用核心让代际感强烈——后续 Ampere / Ada / Blackwell 全循此路
4. **消费市场是技术下沉的杠杆**：RT Core / Tensor Core 在 Turing 之前都是数据中心或离线，下沉到 RTX 才催生 DLSS / 实时光追游戏 / 个人 AI 实验生态
5. **代际"杀手级应用"是后置的**：Turing 上市时 RT 游戏只 3 款、DLSS 1.0 被骂——真正证明价值要到 2020 后 DLSS 2.0 + Cyberpunk 2077。**架构师为 18-24 个月后的生态铺路**

## 延伸阅读

- 白皮书：[NVIDIA Turing Architecture Whitepaper](https://images.nvidia.com/aem-dam/Solutions/design-visualization/technologies/turing-architecture/NVIDIA-Turing-Architecture-Whitepaper.pdf)（86 页，2018）
- RT Core 详解：[NVIDIA Turing Architecture In-Depth](https://developer.nvidia.com/blog/nvidia-turing-architecture-in-depth/)（NVIDIA Blog 2018-09）
- DLSS 演进：[DLSS: A New Era for Game Graphics](https://www.nvidia.com/en-us/geforce/news/dlss-a-new-era-of-game-graphics/)
- [[volta-architecture-2017]] —— 直接前代，Tensor Core 第一代在数据中心首发
- [[pascal-architecture-2016]] —— 消费 GPU 上一代旗舰 GTX 1080 Ti 的架构
- [[maxwell-architecture-2014]] —— 能效骨架被 Turing SM 沿用
- [[kepler-architecture-2012]] —— SMX 4 分区组织延续到 Turing SM
- [[fermi-architecture-2010]] —— ECC + cache 起点
- [[tesla-architecture-2008]] —— SIMT + warp = 32 鼻祖，Turing 仍沿用

## 关联

- [[tesla-architecture-2008]] —— SIMT 鼻祖，Turing 沿用 warp = 32
- [[fermi-architecture-2010]] —— ECC + L1/L2 cache 在 Turing 全面继承
- [[kepler-architecture-2012]] —— SMX 4 分区组织延续到 Turing SM
- [[maxwell-architecture-2014]] —— SMM 4 分区骨架被 Turing SM 直接继承
- [[pascal-architecture-2016]] —— 消费上一代 GTX 1080 Ti，Turing 加 RT/Tensor 把代差打开
- [[volta-architecture-2017]] —— Tensor Core 第一代在数据中心，Turing 第二代下放消费 + 加 INT8/INT4
- [[attention]] —— Transformer 推理在 RTX 上跑得动，靠的是第二代 Tensor Core INT8
- [[cuda]] —— Compute Capability 7.5 = Turing，CUDA 10 起 `wmma` 加 INT8/INT4
