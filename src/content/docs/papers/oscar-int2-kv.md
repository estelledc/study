---
title: OSCAR — 离线转个方向，把 KV Cache 压到 2-bit
来源: 'Zhou et al., "OSCAR: Offline Spectral Covariance-Aware Rotation for 2-bit KV Cache Quantization", arXiv:2605.17757, 2026'
日期: 2026-07-08
分类: LLM 推理 / 量化
难度: 高级
---

## 是什么

OSCAR（**O**ffline **S**pectral **C**ovariance-**A**ware **R**otation）专门做一件事：把大模型推理时的 **KV Cache**（注意力里存下的 Key/Value 历史）压到 **INT2（每元素约 2 bit）**，还要能真正跑在 [[sglang]] / [[vllm]] 这类 serving 框架里。

日常类比：仓库货架方向乱，用粗尺子量会量歪。OSCAR 先**离线**量好「注意力真正在看的方向」，把货架**转正**再贴 2-bit 标签；上线时只对「很久以前的货」贴粗标签，门口刚到的货和最重要的「注意力锚点」（attention sink）仍用高精度（BF16）保管。

为什么叫「spectral covariance-aware」：它不是按「把 K/V 张量重建得像不像」来转，而是按注意力下游真正吃到的协方差——Key 侧看 $Q^\top Q$，Value 侧看分数加权后的 $V^\top S^\top S V$——再取特征方向当旋转轴。

它不是再训一遍模型，而是：**校准一次 → 得到固定旋转矩阵 + 裁剪阈值 → 在线只做旋转、裁剪、INT2 打包**。有效位宽约 **2.28 bit/元素**（含 scale/zero 与少量 BF16 窗口开销），相对 BF16 约 **8×** KV 显存下降。

一句话记：OSCAR = **离线对齐注意力方向的旋转** + **在线 INT2 历史缓存** + **可进 SGLang 的 kernel**。

读者只需记住：它压的是「推理时越积越长的 KV」，不是「模型权重本身」。

## 为什么重要

不理解 OSCAR，下面这些事都没法解释：

- 为什么长上下文（32k–128k）推理时显存往往先被 **KV Cache** 吃光，而不是被权重吃光
- 为什么「随便做个 Hadamard 旋转再 INT2」在论文里会**精度崩到接近 0**，而 OSCAR 能把与 BF16 的差距压到个位数百分点
- 为什么量化论文很多，但真正能进 [[sglang]] 分页 KV、前缀缓存流水线的 INT2 方案很少
- 为什么同显存预算下，大 batch 吞吐能到约 **7×**、单请求 decode 也能因带宽下降到约 **3×**（相对 BF16）

## 核心要点

OSCAR 的逻辑可以拆成 **三步**：

1. **问题不在「压得不够扁」，而在「压错了方向」**：INT2 只有四个重建档位；少数 outlier 通道会霸占量化尺度，把多数正常值挤进无用档。朴素旋转能摊平 outlier，但没对齐注意力真正消费的方向，误差会被放大到不可用。类比：把照片压成马赛克前，先把人脸转正——转错了，马赛克后谁都认不出。

2. **离线估 attention-aware 协方差，再导出固定旋转**：在小校准集上 dump Q/K/V（论文约 8878 tokens × layers），Key 侧用 $C_K \approx Q^\top Q$，Value 侧用 $C_S \approx V^\top S^\top S V$，再取特征方向组成旋转。常见形式是 $R = U \cdot H_{\mathrm{Had}} \cdot P_{\mathrm{br}}$（特征基 × Hadamard 混匀 × bit-reversal 置换）。$U$ 暴露「注意力更在意」的轴，$H_{\mathrm{Had}}$ 继续摊平峰值，$P_{\mathrm{br}}$ 把大小方差通道交错进量化组。旋转和 clip 阈值**固定**，推理时不再重算。

3. **在线：历史 INT2，sink + recent 留 BF16**：逻辑布局是 `[BF16 sink] ‖ [INT2 history] ‖ [BF16 recent]`（常见 sink=64、recent=256）。长历史走 rotate→clip→INT2→打包（每字节塞 4 个 2-bit 值）；配自定义 INT2 attention kernel，兼容 paged KV 与融合算子。Value 旋转还可吸收进投影权重，省在线算力。Decode 时 BF16 段与 INT2 段分核计算，再用 online softmax merge 拼回完整 attention。

## 实践案例

### 案例 1：为什么「只旋转、不对齐注意力」会翻车

设某层 Key 在少数方向能量极高。若旋转只最小化「重建误差」，这些方向可能被摊平到对 attention 不重要的轴上；INT2 再一量化，**真正被 Q 点到的方向**精度先死。

```text
naive / QuaRot-style INT2  →  长推理任务分数 ≈ 崩（接近 0）
OSCAR 对齐 QᵀQ / 分数加权 V 协方差  →  与 BF16 差距个位数 pp
```

论文在 Qwen3-4B-Thinking / Qwen3-8B 上报告相对 BF16 的平均差距约 **3.78 / 1.42** 分；Qwen3-32B 与 GLM-4.7 量级上可接近 BF16（约 −0.02 / +0.27）。消融里：换「张量重建」目标或去掉 attention-aware $U$，均值会从约 70 掉到约 31–33。

同设定下 QuaRot-INT2 / naive INT2 往往接近不可用——说明「有旋转」不等于「旋转对了」。

### 案例 2：离线校准 → 得到 RotationZoo 文件

概念流程（与官方仓库一致）：

```bash
# 1) 在校准数据上 dump 各层 Q/K/V（论文用 MMLU 风格小集）
# 2) 估协方差、求旋转与 clip（典型 c_K≈0.96, c_V≈0.92）
# 3) 导出固定矩阵，供 serving 加载
# 例如 RotationZoo：
#   k_rotation_qqt_r_h_pbr.pt
#   v_rotation_sst_r_h_pbr.pt
```

**逐步理解**：

- 校准只跑一次；上线路径**不**再做特征分解
- K 对齐 query 侧协方差，V 对齐分数加权协方差——这是名字里 spectral covariance-aware 的来源
- 换模型必须重校准，不能直接复用别人的 `.pt`

### 案例 3：在 SGLang 里挂 INT2 KV

```bash
export SGLANG_OSCAR_K_ROTATION_PATH=/path/to/k_rotation_qqt_r_h_pbr.pt
export SGLANG_OSCAR_V_ROTATION_PATH=/path/to/v_rotation_sst_r_h_pbr.pt
python -m sglang.launch_server \
  --model-path Qwen/Qwen3-8B \
  --kv-cache-dtype int2
```

**逐步理解**：

- 环境变量注入离线旋转；`--kv-cache-dtype int2` 打开 INT2 分页缓存路径
- decode 时 kernel 负责旋转、量化与 attention，对业务侧仍像普通 paged attention
- 新 token 先落在 BF16 recent，再被 demote 进 INT2 history
- 论文在 RULER-NIAH 到 128K 时 OSCAR 仍稳健，而 naive rotation INT2 会塌——长上下文才是试金石

## 踩过的坑

1. **把 OSCAR 当成「权重 INT2」**：它压的是 **KV Cache**，不是把全部权重打成 2-bit；权重仍可走别的量化方案。
2. **跳过校准、乱借别的模型的旋转矩阵**：旋转是 per-model / per-layer 的；张冠李戴会直接掉点。
3. **关掉 sink/recent 的 BF16 保护**：长上下文里 attention sink 与最近 token 对精度极敏感，全 INT2 往往先在这里崩。
4. **只看压缩比、不看 serving 集成**：没有兼容 paged KV 的 INT2 kernel，实验室数字进不了生产吞吐；短上下文小 batch 也不要指望论文峰值 7×。

## 适用 vs 不适用

**适用**：
- 长上下文 / 长思维链推理，KV 显存是瓶颈（例如 32k+ reasoning trace）
- 已在 [[sglang]]（或兼容路径）上做高并发 serving，愿意加载 RotationZoo
- 能接受一次离线校准，换约 **8×** KV 显存下降与更高 batch
- 需要在相同 GPU 显存预算下抬高并发，而不是只追求单请求极致首 token

**不适用**：
- 只要权重量化、KV 本来就很短（短问答、小窗口）——这时 KV 不是主瓶颈，收益有限
- 无法改 serving runtime / 没有 INT2 attention kernel 的环境
- 对「零校准、即插即用任意模型」有硬要求（需先有该模型的旋转）
- 把「2-bit」理解成端到端训练方案——OSCAR 是推理侧 cache 量化，不改训练目标

## 历史小故事（可跳过）

- **2017–2022**：Transformer / 大模型让 KV Cache 成为 decode 主成本；[[paged-attention]] 先解决碎片，未解决位宽。
- **2022–2024**：[[smoothquant-2023]]、权重/激活低比特、各种 KV 4-bit/8-bit 方案涌现；INT2 仍难又准又可部署。
- **2024–2025**：旋转量化（Hadamard / QuaRot 等）变热，但「对齐注意力消费方向」仍常被忽略；TurboQuant 等走另一类向量量化后端。
- **2026**：OSCAR（Zhou et al., arXiv:2605.17757）把 attention-aware 协方差旋转 + BF16 窗口 + SGLang INT2 kernel 打成一套可跑系统，并公开 RotationZoo；评测覆盖 Qwen3 系列与 GLM-4.7 量级模型，并在 AIME25 等长生成设定下对比 KIVI / Kitty。

## 学到什么

1. **低比特的敌人常常是「错对齐」，不是「位数不够」**——先问量化轴是否对齐下游算子（这里是 attention 的 $QK^\top$ 与 $SV$）。
2. **离线一次、在线固定**是 serving 友好形态：校准可以贵，decode 路径必须稳。
3. **混合精度窗口（sink/recent）** 往往比「全局同一比特」更划算。
4. **系统论文要看 kernel 与分页缓存是否真接上**——否则压缩比只是幻灯片数字。

## 延伸阅读

- 论文 PDF：[arXiv:2605.17757](https://arxiv.org/pdf/2605.17757)
- 项目页：[oscar-quantize.github.io](https://oscar-quantize.github.io/)
- 代码：[FutureMLS-Lab/OSCAR](https://github.com/FutureMLS-Lab/OSCAR)
- 旋转权重包：[OSCAR-RotationZoo](https://huggingface.co/Zhongzhu/OSCAR-RotationZoo)
- [[smoothquant-2023]] —— 激活/权重量化里「难度迁移」的近亲思路
- [[paged-attention]] —— KV 分页是 OSCAR 要兼容的 serving 底座
- [[sglang-2024]] —— 理解 OSCAR 挂进哪条 serving 流水线

## 关联

- [[smoothquant-2023]] —— 训练后量化里处理 outlier 的经典路线
- [[paged-attention]] —— vLLM 系 KV 分页，OSCAR INT2 路径要兼容它
- [[sglang-2024]] —— OSCAR 官方集成的 serving 框架论文侧
- [[vllm]] —— 同生态位推理引擎；OSCAR 亦讨论兼容方向
- [[attention]] —— Q/K/V 与分数加权是旋转目标的来源
- [[kv-cache-budget-2026]] —— KV 预算与长上下文压力的相邻讨论
- [[nestedkv]] —— 另一类 KV 结构/压缩相关笔记

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[kv-cache-budget-2026]] —— KVBudget — 给每条请求划一块 KV cache 预算
- [[nestedkv]] —— NestedKV — 用三层记忆决定 KV cache 该留谁
- [[prefix-cache-policy-2026]] —— Beyond LRU — 混杂负载下的 LLM 前缀缓存淘汰（UniCache）
- [[vericache]] —— VeriCache: Turning Lossy KV Cache into Lossless LLM Inference — 有损压缩草稿，无损输出验收
