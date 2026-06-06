---
title: SmoothQuant 2023 — 把激活的烫手山芋扔给权重
来源: Xiao et al., SmoothQuant Accurate and Efficient Post-Training Quantization for Large Language Models, ICML 2023 (arXiv 2211.10438)
日期: 2026-05-31
子分类: GPU 架构
分类: 图形学
难度: 中级
provenance: pipeline-v3
---

## 是什么

SmoothQuant 是 MIT HAN Lab 与 NVIDIA 2022 年底提出的**训练后 W8A8 全 INT8 量化**方法，目的是让大模型的权重和激活同时量化到 8-bit，而不掉点。

日常类比：搬两箱东西，一箱装了几块巨石（激活），一箱全是棉花（权重）。直接用同一种秤量两箱都很难。SmoothQuant 的做法是——先把巨石**敲一部分塞进棉花箱**，再各称各的。两箱重量加起来不变，但每一箱都更好处理。

数学层面：矩阵乘 `Y = X·W` 中，激活 X 有几个通道特别大（outlier）很难量化；权重 W 比较平滑容易量化。SmoothQuant 引入对角缩放矩阵 `diag(s)`，把式子写成 `Y = (X·diag(1/s)) · (diag(s)·W)`——结果完全相同，但激活被压扁、权重被放大，两边都好量化了。

## 为什么重要

不理解 SmoothQuant，下面这些事都没法解释：

- 为什么 2023 年起 vLLM / TensorRT-LLM 默认有 W8A8 选项，而 2022 年大家只敢量权重
- 为什么 530B 的 MT-NLG 能塞进单节点——SmoothQuant 把显存压到原来一半
- 为什么硬件厂商要做 INT8 Tensor Core——只有激活也是 INT8 才用得上
- LLM.int8() 已经能做 INT8 了，为什么还需要 SmoothQuant——前者用混合精度路由 outlier 在硬件上很慢

## 核心要点

SmoothQuant 的逻辑链可以拆成 **三步**：

1. **观察**：在 LLM 里，**权重好量化、激活难量化**。激活的难是因为少数通道有 outlier（比 99% 的通道大 100 倍以上），均匀量化时 outlier 决定 scale，其他值被压成 0。

2. **数学等价缩放**：引入对角矩阵 `diag(s)`，`Y = X·W = (X·diag(1/s)) · (diag(s)·W)`。激活除以 s 把 outlier 压低，权重乘 s 被放大。结果不变，但两边量化误差都变小。

3. **难度迁移公式**：缩放因子 `s_j = max(|X_j|)^α / max(|W_j|)^(1-α)`，`α∈[0,1]` 是迁移强度。`α=0.5` 默认平衡，模型越极端 α 越大（GLM-130B 用 0.75–0.8）。`1/s` 可以离线吸进前一层 LayerNorm 的权重——**运行时零开销**。

## 实践案例

### 案例 1：为什么激活难量化

OPT-175B 的某层激活，99% 通道在 [-1, 1]，少数通道达到 ±60。对这个张量做 INT8 per-tensor 量化：

```
scale = 60 / 127 ≈ 0.47
```

那些 [-1, 1] 的值除以 0.47 再 round，几乎全部变成 -2 / -1 / 0 / 1 / 2——**精度被 outlier 吃光**。这就是 LLM 激活直接 INT8 会掉 10+ 点的根因。

### 案例 2：缩放后两边都好量化

设第 j 通道激活最大值 100、权重最大值 1，取 α=0.5：

```
s_j = sqrt(100 / 1) = 10
```

激活除以 10：max 从 100 降到 10。权重乘 10：max 从 1 升到 10。两边的最大值都是 10——量化范围对称、误差均衡。这就是 SmoothQuant 名字里的 "smooth"。

### 案例 3：1/s 怎么吸进 LayerNorm

Transformer 里激活 X 通常是某个 LayerNorm 的输出：`X = γ · norm(h) + β`。SmoothQuant 离线把 `γ ← γ / s`、`β ← β / s`——LayerNorm 出来的 X 自动等于"原 X / s"。**运行时不用做除法**。

权重那边 `W ← diag(s) · W` 也是离线一次性写回。整套方案推理时**和普通 INT8 一样快**，没有任何额外 kernel。

### 案例 4：在 TensorRT-LLM 里用 SmoothQuant

```bash
python convert_checkpoint.py \
  --model_dir Llama-2-7b \
  --smoothquant 0.5 \
  --per_channel \
  --per_token \
  --output_dir trt_engine
```

`smoothquant 0.5` 是 α；`per_channel` 是权重每列一个 scale；`per_token` 是激活每行一个 scale。这个组合是工程主流——比纯 per-tensor 精度高一个量级。

### 案例 5：α 怎么选

论文给出经验法则：

- **OPT / BLOOM / Llama**：α=0.5 默认就够
- **GLM-130B**：outlier 极端，α=0.75–0.8
- **小模型 (<7B)**：outlier 不显著，α=0.3–0.5 都行

实践做法是跑 5 个 α 值各算一次校准 PPL，选最低的那个。

## 踩过的坑

1. **α 不能瞎选**：α=1 时全部难度压给权重，权重某些列被放大 100 倍——量化误差爆炸。`α∈[0.3, 0.8]` 是安全区。

2. **per-tensor 量化精度差**：per-tensor 给整个张量一个 scale，对激活 outlier 仍然敏感。**激活 per-token + 权重 per-channel** 才是 SmoothQuant 真正的工程配方。

3. **校准集大小**：128–512 条文本就够，过大反而引入分布噪声。要的是"激活分布的 max 包络"，不是覆盖所有领域。

4. **小模型收益小**：1B 以下模型激活 outlier 现象本身就不明显，SmoothQuant 的迁移没什么可迁。直接 W8A8 per-channel 也能跑。

5. **outlier 通道是固定的**：同一个模型里，outlier 集中在那几个通道，不会随输入变。这是 SmoothQuant 能离线计算 s 的根本前提——如果 outlier 随机出现这套就垮了。

6. **LayerNorm 折叠的边界条件**：如果某层前面不是 LayerNorm 而是 GeLU、SiLU 这类非线性，1/s 没法折叠，必须运行时做一次乘法——会损失部分速度优势。

## 适用 vs 不适用场景

**适用**：

- 大模型推理部署，需要 W8A8 全 INT8
- 硬件有 INT8 Tensor Core（A100 / H100 / RTX 4090）
- OPT / BLOOM / Llama / Falcon / Mistral / Mixtral 系列
- 显存和带宽双重瓶颈的场景

**不适用**：

- 训练阶段（SmoothQuant 是 PTQ-only）
- 极致 4-bit / 2-bit 场景（请用 AWQ / GPTQ）
- 模型 <1B，激活 outlier 现象不显著
- 纯 FP16 / BF16 平台，硬件没有 INT8 加速

## 历史小故事（可跳过）

- **2022.08**：Dettmers 等发现 LLM 激活有 outlier 通道，提出 LLM.int8()——FP16+INT8 混合精度，outlier 走 FP16 旁路。能保精度但硬件慢。
- **2022.11**：MIT HAN Lab + NVIDIA 联合提出 SmoothQuant，思路换成"迁移而非路由"——把激活的难度数学等价地搬到权重上，两边都 INT8。
- **2023.07**：ICML 2023 正式收录。
- **2023 末**：TensorRT-LLM、vLLM、FasterTransformer 全部接入 SmoothQuant 作为 W8A8 默认路径。
- **2024**：成为 LLM 推理服务化的事实标准之一，与 AWQ（W4A16 路线）形成双标杆。

## 学到什么

1. **难度可以迁移**——这个思想超越量化（梯度累积里梯度 norm 也是迁移、混合精度训练里 loss scaling 也是迁移）
2. **数学等价的缩放**是个万能工具：训练有 BatchNorm 折叠，AWQ 有保护性缩放，SmoothQuant 有难度迁移
3. **观察先于方法**：作者先发现"权重平滑、激活粗糙"这一事实，再设计算法对症下药——比上来就改算法靠谱
4. **硬件友好优先**：LLM.int8() 数学上能赢，但混合精度让硬件流水中断；SmoothQuant 全 INT8 路径直，工程上完胜
5. **离线吸收开销**：能折叠到前一层的操作就提前算掉，运行时零成本——这是部署优化的通用招式
6. **校准是廉价信号**：几百条样本前向跑一遍就能拿到激活分布——比训练全模型便宜 6 个数量级

## 延伸阅读

- 论文 PDF：[SmoothQuant arXiv 2211.10438](https://arxiv.org/abs/2211.10438)
- 官方实现：[mit-han-lab/smoothquant](https://github.com/mit-han-lab/smoothquant)
- TensorRT-LLM 集成文档：NVIDIA 官方 SmoothQuant 配方
- vLLM 量化文档：W8A8 路径默认走 SmoothQuant
- [[awq-2023]] —— W4A16 路线，与 SmoothQuant 互补
- [[gptq-2023]] —— 反向重建权重路线
- [[llm-int8-2022]] —— 混合精度路由 outlier 的早期方案，SmoothQuant 想替代的对象

## 关联

- [[vllm]] —— 推理引擎，W8A8 默认路径
- [[awq-2023]] —— 同期对手，W4A16 vs W8A8 的两条路线
- [[gptq-2023]] —— 反向重建路线，与 SmoothQuant 形成 4-bit / 8-bit 分工
- [[llm-int8-2022]] —— outlier 通道的最早发现者，SmoothQuant 的直接前驱
- [[ampere-architecture-2020]] —— INT8 Tensor Core 硬件支撑
- [[paged-attention]] —— vLLM 显存管理，与权重激活压缩互补
