---
title: NVIDIA Maxwell — 同一工艺节点把性能每瓦翻一倍
来源: 'NVIDIA, "GeForce GTX 980 Maxwell GM204 Whitepaper", 2014'
日期: 2026-05-30
分类: 系统
难度: 中级
---

## 是什么

Maxwell 是 NVIDIA 2014 年发布的第四代通用 GPU 架构（前代见 [[kepler-architecture-2012]]），代表芯片是 **GM204**（GTX 980/970）和 **GM200**（Titan X / 980 Ti）。它做了一件听起来反常识但工程上里程碑的事：**沿用与 Kepler 完全相同的 28nm 工艺，靠重设计 SM 把性能每瓦做到约 2 倍**。

日常类比：Kepler 是 192 人挤在一间大工坊里抢一张排班表；Maxwell 把工坊隔成 4 个 32 人小间，每间自己排班、自己存料——人数只少一点（128 vs 192），但因为不再互相等同步，**实际产能反而高、电费反而低**。

落到硅片：**GM204 = 52 亿晶体管、16 SMM × 128 CUDA cores = 2048 核、165W TDP**；**GM200（Titan X）= 80 亿晶体管、24 SMM × 128 cores = 3072 核、12GB GDDR5**。代表卡：**GTX 980/970/Titan X/980 Ti**（消费）、**Tesla M40 训练卡 / M4 推理卡 / Quadro M6000**（数据中心）。

## 为什么重要

不理解 Maxwell，下面这些事都没法解释：

- 为什么 NVIDIA 在**没换工艺**的情况下还能让性能/W 翻倍——证明"架构 > 工艺"成立
- 为什么 **GTX Titan X** 让深度学习训练**第一次进入个人开发者桌面**：1000 美元的桌面卡 + 12GB 显存能完整训 ResNet-152 / VGG-19
- 为什么 **Tesla M40** 是 NVIDIA **第一张明牌瞄准 DL 训练**的数据中心卡（前代 K20/K40/K80 起家是 HPC，DL 是顺带）
- 为什么 Pascal / Volta / Ampere 的 SM 全是"4 个 warp scheduler 子分区"——骨架就是 Maxwell SMM 定下来的

## 核心要点

Maxwell 在 Kepler 之上的关键升级可以拆成 **四件事**：

1. **SMM 重组**（SMM = Maxwell 的一间"小工坊"）：Kepler 的 SMX = 192 核 + 4 个调度员**抢同一本记事本**；Maxwell 的 SMM = **128 核拆成 4 个 32 核小间**，每间自己的 warp 调度员（一次派 32 线程那一组）+ 自己的指令缓冲。意义：不再互相等同步；白皮书宣称**每核执行效率约 +35%**——核数少一点但更忙。

2. **L2 扩 4 倍 + 独立 shared memory**：GM204 L2 = **2MB**（GK104 仅 512KB）；shared memory **96KB 独立**于 L1（Kepler 是 L1+shared 合计 64KB 切换）。意义：少跑慢速外存——**功耗大头是 DRAM 来回，少访一次省一次电**。

3. **指令调度静态化**：Kepler 用硬件记分牌（scoreboard）现场判断"这条能不能跑"；Maxwell 让**编译器事先在指令里塞好等待/发射标记**（control codes），硬件照单执行。意义：硬件更简单，面积拿去加核加 cache——这是"不靠换工艺也能翻倍"的核心。

4. **能效优先 vs 算力优先**：双精度 FP64 砍到 **1/32 FP32**（Kepler GK110 是 1/3）。意义：**主动放弃 HPC 双精度市场**，硅片预算压在 FP32 + 能效——换来桌面卡能塞约 8B 晶体管、M40 能 24/7 跑 DL。

### 这四件事怎么互为支柱

- 没 **SMM 重组**，128 核做不过 192 核——靠分区独立调度才赢回效率
- 没 **大 L2 + 独立 shared**，DRAM 带宽和功耗都顶不住——分区多了反而更糟
- 没 **静态调度**，硬件复杂度撑不下"4 分区 + 大 cache"——硅片预算超了
- 没 **砍 FP64**，硅片放不下其他东西——Maxwell 是"取舍换能效"的范例

## 实践案例

### 案例 1：Titan X + ResNet-152

```python
# Titan X (Maxwell GM200, 12GB GDDR5)，2015 年 1000 美元桌面卡
import torch
device = torch.device('cuda:0')
model = resnet152().to(device)   # 60M 参数，FP32 仅占 240MB
# 单 Titan X 训 ImageNet 1 epoch ≈ 1 小时（K40 ≈ 1.5h，K80 ≈ 50 分钟）
```

意义：**第一次有桌面卡能完整训 ResNet/VGG**——之前要么云租 K80（贵），要么集群（门槛高）。Titan X 让单兵研究员桌面就能复现顶会论文，**2015-2017 年 Kaggle / 学位论文标配**。

### 案例 2：性能每瓦实测对比

| 卡 | 架构 | 工艺 | TDP | FP32 TFLOPS | TFLOPS/W |
|---|---|---|---|---|---|
| GTX 680 (GK104) | Kepler | 28nm | 195W | 3.09 | 0.016 |
| GTX 980 (GM204) | Maxwell | 28nm | 165W | 4.98 | 0.030 |
| GTX 1080 (GP104) | Pascal | 16nm | 180W | 8.87 | 0.049 |

**同一 28nm 节点，Maxwell 把 TFLOPS/W 从 0.016 拉到 0.030——~2x**。Pascal 看起来更快，但其中一半收益来自 **16nm 工艺**；Maxwell 是**纯架构功劳**。

### 案例 3：Tesla M40 训练卡

```bash
# M40: GM200, 24GB GDDR5, 250W, 7 TFLOPS FP32
# NVIDIA 官方定位: "Deep Learning Training"  <- 史上第一次
nvidia-smi  # M40 出现在 2015 年底数据中心，是 K40 的 DL 接班人
```

M40 的意义不在性能（被一年后 P100 完爆），而在**第一次有 Tesla 卡白纸黑字写"训练"**——数据中心从此把"训"和"推"拆成两条产品线（Maxwell 时代是 M40 训 / M4 推）。

### 案例 4：静态调度的代价（编译器视角）

```cuda
// Kepler: 硬件检查依赖，编译器随便排
a = b + c;
d = e + f;   // 硬件自己看出独立，并发执行

// Maxwell: 编译器必须在指令里塞 control code 标"这条等不等"
// nvcc 输出的 SASS 多出 reuse / yield / stall flag
```

老 CUDA 代码迁到 Maxwell 不会变慢——nvcc 自动处理。但**手写 SASS / 第三方汇编器**（如 maxas）才能榨出最后 20% 性能。这是 Scott Gray 写 [[gpu-kernel-tuning]] 风格 maxas 内核的契机。

## 踩过的坑

1. **FP64 1/32 砍到底**：HPC 用户从 K40（1/3 FP64）升 Titan X（1/32），双精度直接慢 **10 倍**。Maxwell 上**没有真正的"科学计算卡"**——HPC 用户必须等 Pascal P100 才回血。

2. **GM204 仅 4GB 装不下 ResNet**：GTX 980/970 训 ImageNet 经常 OOM——必须上 Titan X 12GB。新人买 GTX 980 想训 DL 是常见踩坑。

3. **GTX 970 内存丑闻**：广告写 4GB，实际 **3.5GB 全速 + 0.5GB 极慢**（带宽降到 1/7）。NVIDIA 2015 年集体诉讼赔款。买二手卡至今要躲。

4. **无 FP16 / 无 Tensor Core**：Maxwell 不支持 FP16 加速（需 Pascal P100），更没 Tensor Core（需 Volta V100）。AMP / bf16 时代一来即过气——**寿命比 Kepler 短**。

5. **静态调度让 occupancy tuning 更敏感**：分区独立调度后，**寄存器超过 32 / 线程**就会让一个分区只跑一个 warp（其他分区也帮不上）——Kepler 上还能"借用"邻居的资源。新人不调寄存器压力直接性能腰斩。

6. **CUDA 12 已 deprecate**：CUDA 11 起警告，CUDA 12 正式删除 Compute Capability 5.x（Maxwell）。**Titan X / 980 Ti 装不上 PyTorch 2.x**，旧框架长尾里见。

## 适用 vs 不适用场景

**适用**：

- 中期深度学习训练（2015-2018）—— Titan X 12GB 单卡能训当时主流模型
- 个人开发者 / 实验室入门 —— 桌面级 1000 美元拿下完整 DL 工作流
- FP32 推理负载 —— 能效高、M4 是当年推理性价比之选
- 游戏 / 可视化 —— 至今 GTX 980 在 1080p 中等画质仍能用

**不适用**：

- HPC 双精度 —— 1/32 FP64 直接出局
- LLM 训练 —— 显存 12GB 不够、无 FP16 / TF32 / Tensor Core
- AMP 混合精度 —— 必须 Pascal P100 起步
- 现代框架 —— PyTorch 2.x / CUDA 12 已不支持 CC 5.x

## 历史小故事（可跳过）

- **2014-09**：GTX 980/970（GM204）发布，165W 跑赢 250W 的 GTX 780 Ti——震动业界
- **2015-03**：**GTX Titan X（GM200）发布**，3072 核、12GB、999 美元——深度学习圈第一次集体高潮
- **2015-06**：980 Ti 发布（GM200 砍版，6GB）——游戏旗舰
- **2015-11**：Tesla M40（GM200，24GB）发布，**首张明牌瞄准 DL 训练的 Tesla**
- **2016-04**：Pascal P100 发布——Maxwell 在科研前沿被替换
- **2017-2018**：Maxwell 在 Kaggle / 学位论文 / 入门教程里黄金期延续
- **2022**：CUDA 12 正式删除 Maxwell 支持

## 学到什么

1. **架构创新可以独立于工艺**：Maxwell 在同一 28nm 节点把性能/W 翻倍——**反例**了"芯片进步全靠摩尔定律"的迷思。SMM 重组 + 静态调度 + 大 cache 是纯架构功劳。
2. **SMM 4 分区是后续 10 年模板**：Pascal SM、Volta SM、Ampere SM、Hopper SM 全是"几个 32-thread 子分区"——分区独立调度成 GPU 标配，骨架就在 Maxwell。
3. **能效优先是 DL 时代的入场券**：训练 7×24 跑，电费比硬件折旧贵——Maxwell 把 perf/W 拉到能进数据中心规模的水平，**M40 是后来 V100/A100 训练卡的起点**。
4. **桌面卡进入 DL 主流靠 Titan X**：[[kepler-architecture-2012]] 的 K80 是云端基础设施，Maxwell 的 Titan X 是**桌面研究员的入场券**——两条线一起把 2015-2017 那波 DL 复现潮推起来。
5. **"取舍换专精"**：砍 FP64 换能效是大胆决定——Maxwell 主动放弃 HPC 市场专心 FP32 + DL，**为 NVIDIA 后来 AI 帝国铺第一块砖**。

## 延伸阅读

- 白皮书：[NVIDIA GeForce GTX 980 Whitepaper](https://www.nvidia.com/content/dam/en-zz/Solutions/geforce/maxwell/pdf/GeForce_GTX_980_Whitepaper_FINAL.PDF)（32 页，2014）
- maxas 项目：[Scott Gray, maxas — Maxwell Assembler](https://github.com/NervanaSystems/maxas)（手写 SASS 榨性能）
- GTX 970 内存事件：[AnandTech 深度分析](https://www.anandtech.com/show/8935/geforce-gtx-970-correcting-the-specs-exploring-memory-allocation)
- [[kepler-architecture-2012]] —— 直接前代，Maxwell 在其上重做 SM
- [[fermi-architecture-2010]] —— L1+ECC 的祖父，Maxwell 把 cache 思路推到极致
- [[pytorch]] —— Titan X 是 PyTorch 0.x 时代桌面研究员的默认卡
- [[cuda]] —— Compute Capability 5.x 即 Maxwell

## 关联

- [[tesla-architecture-2008]] —— SIMT 鼻祖，Maxwell 仍沿用 warp = 32 线程
- [[fermi-architecture-2010]] —— cache + ECC 立住，Maxwell 把 L2 扩 4 倍
- [[kepler-architecture-2012]] —— 直接前代，Maxwell 把 SMX 拆成 4 分区 SMM
- [[pytorch]] —— Titan X 让 PyTorch 桌面 DL 真正普及
- [[cuda]] —— 静态调度 + control code 是 Maxwell 起的，影响后续所有 SASS
- [[attention]] —— Transformer 之前 RNN/CNN 论文很多训在 Titan X / M40 上

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[ampere-architecture-2020]] —— NVIDIA Ampere — 第三代 Tensor Core 加 TF32 / BF16 / FP64，结构化稀疏 + MIG 重写大模型时代硬件假设
- [[blackwell-architecture-2024]] —— NVIDIA Blackwell — 双 die NV-HBI + 第二代 Transformer Engine + FP4 让万亿参数训练日常化
- [[hopper-architecture-2022]] —— NVIDIA Hopper — Transformer Engine + FP8 + TMA + Thread Block Cluster 把硅片为 LLM 量身定制
- [[pascal-architecture-2016]] —— NVIDIA Pascal P100 — HBM2 + NVLink + FP16 让 Tesla 真正变成 AI 卡
- [[turing-architecture-2018]] —— NVIDIA Turing — RT Core 把光追装进消费卡，Tensor Core 第二代下放 INT8
