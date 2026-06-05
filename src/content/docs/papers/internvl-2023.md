---
title: InternVL — 6B 视觉基座 + QLLaMA 对齐开源多模态
来源: 'Chen et al., "InternVL: Scaling up Vision Foundation Models and Aligning for Generic Visual-Linguistic Tasks", arXiv 2023'
日期: 2026-06-06
分类: 机器学习
子分类: 模型与训练
难度: 中级
provenance: pipeline-v3
---

## 是什么

InternVL 是上海 AI Lab 2023 年底发布的**大规模视觉-语言基础模型**：先把视觉编码器扩到 **6B 参数**，再用 **QLLaMA** 中间件把视觉特征对齐到 LLM，最后在 32 个通用视觉语言 benchmark 上刷榜。

日常类比：以前的 VLM 像「小望远镜 + 大词典」——望远镜太小，看不清细节；词典再大也接不住模糊图像。InternVL 换了一架**大口径望远镜**（6B ViT），再雇一个**专职翻译**（QLLaMA）把图像信号翻译成 LLM 能读的 token，两边都够大才接得上。

核心组件：**InternViT-6B**（视觉基座）+ **QLLaMA**（查询式 LLM 桥接器）+ 渐进式 web-scale 图文对齐训练。

论文把任务分成两大类：**视觉感知**（分类、检测、分割）和**视觉-语言**（VQA、caption、零样本检索）。同一个 InternVL 权重树用不同 head 就能切换——这是「foundation」一词在这里的含义：底座一次训练，下游多处挂载。

## 为什么重要

不理解 InternVL，下面这些事说不清：

- 为什么 2024 年开源 VLM 普遍走向「大视觉 encoder + 冻结/半冻结 LLM」——InternVL 是这条路的早期标杆
- 为什么 [[llava]] / VILA / LLaVA-NeXT 系列论文都引用它——它证明了 6B 视觉侧 + 7B LLM 的组合在零样本分类、VQA、图文检索上能打过很多专模
- 为什么「渐进对齐」（先训视觉、再对齐语言）比一步到位端到端更稳——InternVL 的 staged recipe 被后续 InternVL2 继承
- 为什么工业界开始区分「视觉 foundation model」和「VLM 成品」——InternVL 把前者单独做大
- 为什么论文一次报 32 个 benchmark——它在树立「开源 VLM 全科医生」而非单科冠军的评价范式

## 核心要点

InternVL 的训练可以拆成 **三步**：

1. **放大视觉基座（InternViT-6B）**：在 LAION 等 web-scale 数据上把 ViT 扩到 6B，专注图像级/像素级感知（分类、检测、分割）。类比：先把眼睛练到能看清极小字，再学说话。

2. **QLLaMA 桥接**：借鉴 BLIP-2 的 query 思路，但用 LLaMA 变体做 cross-attention 抽取器，把可变数量视觉 token 压成固定长度 soft prompt，喂给 LLM。不是简单线性投影，而是**可学习的查询网络**。

3. **渐进式视觉-语言对齐**：先用大规模 image-text 对比学习拉齐表示，再做多任务指令微调（caption、VQA、分类）。视觉 encoder 前期可冻结，后期部分解冻——避免小 LLM 被噪声视觉特征带偏。

4. **统一评测叙事**：论文一次性在 32 个公开集上报分，把「开源 VLM 全科医生」当作目标函数——这一传统被 InternVL2/2.5 继承为品牌内核。

## 实践案例

### 案例 1：InternVL 三模块数据流

```python
# 概念流程（非完整推理代码）
image = load_image("chart.png")          # 高分辨率商业图表
vision_tokens = intern_vit_6b(image)     # 6B ViT → 多尺度 patch 特征
queries = qllama.cross_attn(vision_tokens)  # 32~64 个 query token
text = llama.generate(queries + prompt)  # "这张图的营收趋势是什么？"
```

关键：**视觉侧 token 数随分辨率变化**，QLLaMA 负责压成 LLM 能吃的固定前缀。

### 案例 2：与 BLIP-2 桥接方式对比

| 方案 | 视觉侧 | 桥接器 | LLM | 特点 |
|---|---|---|---|---|
| BLIP-2 | 冻结 ViT-g | Q-Former 188M | 冻结 OPT/T5 | 极省可训参数 |
| InternVL | 6B InternViT（可部分解冻） | QLLaMA | LLaMA-7B 系 | 视觉容量优先 |
| LLaVA | CLIP ViT-L | 单层 MLP projector | Vicuna | 极简、易复现 |

InternVL 的赌注是：**视觉 encoder 不够大，桥接再巧也看不清细节**。

### 案例 3：零样本图像分类用法

```python
# 零样本：把类别名当文本 prompt
classes = ["猫", "狗", "鸟"]
image_feat = model.encode_image(img)
scores = [cosine(image_feat, model.encode_text(c)) for c in classes]
pred = classes[argmax(scores)]
```

InternVL 在 32 个 benchmark 里很多是这种「不微调、直接评」设置——说明对齐质量够高，能当通用视觉语言底座。

### 案例 4：渐进解冻的训练日程

```text
Week 1-2:  冻结 LLM，只训 QLLaMA + 顶层 ViT block
Week 3-4:  解冻 ViT 后 30% 层，图文对比 + 匹配
Week 5+:   加指令数据，LoRA 微调 LLM 顶层
```

这种日程避免「视觉还没对齐就让 LLM 硬背图像答案」。复现 InternVL 类模型时，**日程比总 step 数更关键**——日志里应能看见 loss 分阶段下降，而不是一条直线。

## 踩过的坑

1. **只训 projector 不够**：若视觉 encoder 太小，QLLaMA 再强也补不回细节——高分辨率文档 OCR 类任务会崩。

2. **一步到位端到端易不稳定**：视觉和语言学习率差几个数量级，同时全开容易 LLM 遗忘或视觉欠拟合；渐进解冻更稳。

3. **固定 query 数丢信息**：QLLaMA 把可变视觉 token 压成固定长度，极复杂场景（多图、长视频）需要后续 InternVL2 的动态分辨率方案。

4. **评测集泄漏风险**：web-scale 预训练数据与公开 benchmark 有重叠，报分时要核对 decontamination 说明。

5. **忽视视觉-语言学习率比**：QLLaMA 与 InternViT 若共用过大 lr，常见现象是 LLM 输出乱码而 loss 仍下降——应分组 optimizer param group。

## 适用 vs 不适用场景

**适用**：
- 需要强零样本感知 + 语言推理的通用 VLM 底座
- 有算力做大规模视觉预训练、再对齐 LLM 的团队
- 研究「视觉 foundation model 规模效应」的实验对照

**不适用**：
- 手机端实时推理（6B+7B 太重）→ 看 [[minicpm-v-2024]]
- 只要极简可复现 pipeline → [[llava]] 更合适
- 纯视频长上下文 → 需接 InternVL2.5 / [[qwen2-vl-2024]] 等后续工作
- 教学演示只想周末跑通 Demo → 先用 LLaVA-1.5 体量，再回溯 InternVL 学缩放

## 历史小故事（可跳过）

- **2023-12**：InternVL 技术报告挂 arXiv，首次把开源视觉 encoder 推到 6B 并与 LLaMA 对齐。
- **2024**：InternVL2 系列继承动态分辨率 + MPO，标题直接问「离 GPT-4V 还差多少」。
- **2024-2025**：VILA / NVILA / LLaVA-NeXT 在长视频与效率上接力，但 citation 链仍回到 InternVL 的「大视觉 + 对齐」范式。
- **开源影响**：InternViT-6B 权重单独发布，许多团队只换视觉塔、保留自己的 LLM，验证「视觉 foundation 可插拔」假设。

## 学到什么

1. **多模态 AGI 不能只堆 LLM**——视觉 foundation model 的缩放同样关键。
2. **渐进对齐**是工程上更稳的路径：先视觉、再桥接、再指令微调。
3. **QLLaMA 类桥接**介于 BLIP-2 Q-Former 与 LLaVA 单层 MLP 之间，兼顾表达力与训练成本。
4. 开源 VLM 的工业对标故事，从 InternVL 的 32 benchmark 全面评测开始成型。
5. 读后续 InternVL2 动态分辨率时，记得它站在本篇「大视觉 encoder」肩膀之上——两篇连读才完整。

## 延伸阅读

- 论文 PDF：[arXiv:2312.14238](https://arxiv.org/abs/2312.14238)
- 代码：[OpenGVLab/InternVL](https://github.com/OpenGVLab/InternVL)
- [[blip2-2023]] —— 冻结双塔 + Q-Former 的先例
- [[llava]] —— 极简 MLP 桥接的对照组
- [[clip]] —— 视觉-文本对比学习的祖师爷
- OpenGVLab 技术博客 —— InternViT 与 QLLaMA 训练细节连载
- [[mmmu-2023]] —— 工业对标常用高难度评测入口

## 关联

- [[blip2-2023]] —— InternVL 的 QLLaMA 继承 query 桥接思路
- [[llava]] —— 更轻量的 VLM 拼装范式，常被拿来对比
- [[clip]] —— 视觉-语言对齐的对比学习基础
- [[qwen2-vl-2024]] —— 工业级动态分辨率后继路线
- [[longvila-2024]] —— 长视频训练管线，引用 InternVL 视觉缩放经验
- [[mmmu-2023]] —— 专家级多模态评测，InternVL2 对标 GPT-4V 的主战场之一

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
