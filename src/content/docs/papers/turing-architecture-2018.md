---
title: NVIDIA Turing — RT Core 把光追装进消费卡，Tensor Core 第二代下放 INT8
来源: 'NVIDIA, "NVIDIA Turing GPU Architecture — Graphics Reinvented", Whitepaper WP-09183-001_v01, 2018'
日期: 2026-05-30
分类: 系统
难度: 中级
---

## 是什么

Turing 是 NVIDIA 2018 年发布的消费旗舰 GPU 架构（[[volta-architecture-2017]] 之后一代），旗舰芯片是 **TU102（Quadro RTX 6000 / GeForce RTX 2080 Ti）**。它在一代之内做了三件改写底层假设的事：**第一代 RT Core（硬件光追）+ 第二代 Tensor Core（加 INT8 / INT4）+ FP32 与 INT32 并行数据通路**——前两件让"图形渲染"和"AI 推理"在同一颗硅片上正式合流，后一件让普通游戏 shader 单工位吞吐跳约 36%。

日常类比：[[volta-architecture-2017]] 是在数据中心车间专门加了一台拼乐高 4×4 的机器（Tensor Core）；Turing 是**把这台机器小型化装进家用工作台**，**再加一台专门追光线的雕刻机（RT Core）**——同一张消费卡既能游戏、又能 AI 推理、还能跑光追。**Volta 是数据中心产物，Turing 是把它揉进消费市场的产物**。

落到硅片：TU102 约 **186 亿晶体管、TSMC 12nm FFN、754 mm²、260W TDP**。算力侧是 **72 个 SM（可当成 72 个并行工位）× 64 FP32 = 4608 FP32**，外加 **576 个第二代 Tensor Core + 72 个 RT Core**，显存 GDDR6 14 Gbps；NVLink 2.0 仅 Quadro / Titan。代表卡：Quadro RTX 6000 / 8000、Titan RTX、GeForce RTX 2080 Ti / 2080 / 2070 / 2060，**Compute Capability sm_75**。

## 为什么重要

不理解 Turing，下面这些事都没法解释：

- 为什么品牌叫 **RTX（常释为 Ray Tracing Texel eXtreme）**——RT Core 是 GPU 史上第一次为光线求交造专用硬件
- 为什么 **DLSS 1.0 / 2.0 只能在 RTX 卡跑**——DLSS 用 Tensor Core 推理，老 GTX 没有
- 为什么 **2018 后消费 GPU = "图形 + AI" 双引擎**——Turing 把 [[volta-architecture-2017]] 的 Tensor Core 第一次下放消费市场
- 为什么 **YOLOv5 / Stable Diffusion 在 RTX 2080 上能跑**——第二代 Tensor Core 加 INT8 / INT4，推理算力跳 2–4 倍
- 为什么 **2020 年才出现"Tensor Core 加速 BERT 推理"教程**——Turing INT8 是硬件支点

## 核心要点

Turing 在 [[volta-architecture-2017]] 之上做了 **四件事**：

1. **RT Core 第一代**：每个 SM（工位）里 1 个 RT Core，专门加速 **BVH 遍历 + 三角形相交**。BVH 可类比城市分区目录树——先查大区再查街道，避免对每个三角形穷举。过去这两步由着色器软件做，慢且抢算力；RT Core 做成固定功能单元，**TU102 约 10 Giga Rays/sec**，比纯软件路径快约 **10×**。意义：实时光追从不可能变可行。

2. **第二代 Tensor Core**：在 Volta 的 FP16 / FP32 累加之上，加 **INT8 / INT4**——INT8 是 FP16 算力的 **2×**，INT4 是 **4×**。TU102 FP16 Tensor 约 114 TFLOPS、INT8 约 228 TOPS、INT4 约 455 TOPS。意义：推理可比训练用更低精度，INT8 把消费卡推理吞吐一夜抬两倍。

3. **FP32 与 INT32 并行通路**：[[pascal-architecture-2016]] 前 SM 共享一套整数/浮点 ALU，"整数算地址 + 浮点算颜色"必须串行。Turing 拆成两套独立通路，64 FP32 + 64 INT32 可同时发射。IPC（每拍能干几件事）实测提升约 **30–50%**——普通游戏帧率也跟着涨，不只光追受益。

4. **Mesh Shader + VRS**：传统几何流水线用了约 20 年。Mesh Shader 换成 task → mesh 两阶段计算 shader；**VRS** 让屏幕中心 1×1、边缘 2×2 着色——肉眼难察但少约 30% 像素工作。意义：DirectX 12 Ultimate / Vulkan 跟进的大改。

### 这四件事怎么互为支柱

- 没 **RT Core**，光追只能离线（电影可以、游戏不行）
- 没 **第二代 Tensor Core INT8**，DLSS 每帧推理跑不动
- 没 **FP32/INT32 并行**，普通 shader 没提升 → "RTX 只为光追"卖不动
- 没 **Mesh Shader / VRS**，几何与着色跟不上 RT Core 速度

## 实践案例

### 案例 1：DLSS 一帧里同时用三种核心

```
游戏一帧 (RTX 2080 Ti):
  [SM FP32]        渲染低分辨率（1440p）几何 + 材质
  [RT Core]        发射光线，做反射 / 阴影 / GI 求交
  [Tensor Core]    INT8 推理 DLSS 网络，把 1440p 升到 4K
=> 同一帧、同一颗 GPU，三种专用单元并行流水
```

**逐部分解释**：SM 先画"草稿图"；RT Core 只负责"光线撞到哪"；Tensor Core 把草稿超分成 4K。三者各干各的——这是后续 Ampere / Ada 的模板。

### 案例 2：TensorRT INT8 量化推理

```python
# TensorRT 8 INT8 on RTX 2080 Ti（需自写校准器）
import tensorrt as trt
config = builder.create_builder_config()
config.set_flag(trt.BuilderFlag.INT8)            # 打开 INT8 路径
config.int8_calibrator = MyCalibrator(data)      # 用校准集估每层 scale
engine = builder.build_engine(network, config)
# ResNet-50: FP16 ~3.5ms → INT8 ~1.8ms (≈2x)
```

**逐部分解释**：

1. `BuilderFlag.INT8`：告诉构建器走整数 Tensor Core，不是默认 FP16
2. `MyCalibrator`：你提供的校准类——喂几百张代表图，量出每层激活范围（教学示意，需自己实现）
3. `build_engine`：生成可部署引擎；吞吐约 2× FP16，走的就是第二代 Tensor Core

### 案例 3：CUDA WMMA INT8 直写（需 sm_75+、CUDA 10+）

```cuda
#include <mma.h>
using namespace nvcuda::wmma;
fragment<matrix_a, 16, 16, 16, signed char, row_major> a;
fragment<matrix_b, 16, 16, 16, signed char, col_major> b;
fragment<accumulator, 16, 16, 16, int> c;
fill_fragment(c, 0);
load_matrix_sync(a, A_ptr, 16);
load_matrix_sync(b, B_ptr, 16);
mma_sync(c, a, b, c);  // 一拍 16x16x16 INT8 GEMM，INT32 累加
```

**逐部分解释**：`fragment` 是 warp 级矩阵片；`signed char` = INT8 输入；`mma_sync` 一拍做完小块乘加。意义：消费卡也能写定制低精度 GEMM，不必买 V100。

### 案例 4：RTX 2080 Ti vs GTX 1080 Ti

```
GTX 1080 Ti: 11.3 FP32 TFLOPS, 0 RT, 0 Tensor, 11 GB GDDR5X
RTX 2080 Ti: 13.4 FP32 TFLOPS, 10 GRays/s, 114 FP16 / 228 INT8 TOPS, GDDR6
光栅化帧率 ~+30%；开光追后 1080 Ti 跑不动；DLSS 4K 仅 2080 Ti
```

意义：**代差主要来自新增专用核心，不是 FP32 加宽**——Volta 在数据中心走过的路，Turing 在消费市场重演。

## 踩过的坑

1. **GTX 16 系列没有 RT / Tensor**：GTX 1660 等也是 Turing（TU116），但砍掉 RT/Tensor 压价——买卡必看 RTX 还是 GTX。
2. **消费 RTX 无 NVLink**：2080 / 2080 Ti 多卡只能走 PCIe；Quadro / Titan 才有 NVLink。
3. **RT Core 不能独立出图**：只做求交，着色仍回 SM——光追仍吃 SM 算力与带宽。
4. **INT4 很少落地**：4× 算力诱人，但校准与精度掉点难；多数引擎停在 INT8。
5. **DLSS 1.0 糊**：专用数据集伪影多；到 DLSS 2.0（2020）才翻身，硬件从 Turing 起就够。
6. **INT8 易炸精度**：scale 选错就溢出，必须校准集找范围，**不能只改 dtype**。

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

- **2018-08 SIGGRAPH**：Quadro RTX 发布，RT Core + Tensor Core 同台
- **2018-09**：GeForce RTX 2080 / 2080 Ti 上市，定价引争议
- **2018-10 Battlefield V**：首款 RTX-on 游戏
- **2019-02 GTX 16**：砍 RT/Tensor 的 Turing 派生
- **2020-03 DLSS 2.0**：Turing Tensor Core 真正发挥价值
- **2020-09 Ampere**：第二代 RT + 第三代 Tensor，Turing 长尾仍在

## 学到什么

1. **专用化下沉**：Volta 在数据中心证明专用单元划算，Turing 打包 RT + Tensor 塞进消费卡
2. **四合一硅片**：图形 + 通用计算 + 光追 + AI 推理首次同片
3. **代差靠新核心**：Pascal→Turing 光栅只 +20%，专用核心才是体感
4. **杀手级应用后置**：上市时生态稀薄，价值要到 2020 后才兑现——架构为 18–24 个月后铺路

## 延伸阅读

- 白皮书：[NVIDIA Turing Architecture Whitepaper](https://images.nvidia.com/aem-dam/Solutions/design-visualization/technologies/turing-architecture/NVIDIA-Turing-Architecture-Whitepaper.pdf)（2018）
- 深度解读：[NVIDIA Turing Architecture In-Depth](https://developer.nvidia.com/blog/nvidia-turing-architecture-in-depth/)
- DLSS：[A New Era for Game Graphics](https://www.nvidia.com/en-us/geforce/news/dlss-a-new-era-of-game-graphics/)
- [[volta-architecture-2017]] —— Tensor Core 第一代
- [[pascal-architecture-2016]] —— 消费上一代 GTX 1080 Ti
- [[cuda]] —— sm_75 与 WMMA INT8

## 关联

- [[volta-architecture-2017]] —— Tensor 第一代在数据中心，Turing 下放并加 INT8/INT4
- [[pascal-architecture-2016]] —— 消费上一代，Turing 用 RT/Tensor 拉开代差
- [[maxwell-architecture-2014]] —— SMM 四分区骨架被 Turing SM 继承
- [[tesla-architecture-2008]] —— SIMT / warp=32，Turing 仍沿用
- [[attention]] —— Transformer 推理靠第二代 Tensor INT8
- [[cuda]] —— Compute Capability 7.5 = Turing

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
