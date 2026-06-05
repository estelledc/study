---
title: SpaceVLLM — 一个 MLLM 同时做时序定位、图像指代与时空管定位
来源: 'Wang et al., "SpaceVLLM: Endowing Multimodal Large Language Model with Spatio-Temporal Video Grounding Capability", arXiv 2025'
日期: 2026-06-05
分类: 机器学习
子分类: 视频理解
难度: 高级
provenance: manual-read
---

## 是什么

SpaceVLLM 是中科大与人大团队 2025 年 3 月发布的**时空视频定位多模态大模型**：在单一 MLLM 里同时完成三件事——**Video Temporal Grounding（VTG，按文字找起止时间）**、**Referring Expression Comprehension（REC，在单张图里框出被指物体）**、**Spatio-Temporal Video Grounding（STVG，在视频里框出「谁在何时何地做了什么」的时空管）**。

日常类比：[[vtg-llm-2024]] 像剪辑师只会在时间轴上标「0:12–0:18」；REC 模型像摄影师在一张照片里圈出「穿红衣服的人」；传统 STVG 专用模型像安防回放员逐帧画框。SpaceVLLM 像**带三维坐标的导播台**——同一句「男人什么时候抱起婴儿」既能回答时间段，又能在该时段每一帧画出婴儿和男人的框，且三种能力共用一套对话接口。

论文核心结构：**Spatio-Temporal Aware Query**（每帧插入一个可学习查询 token，与视觉 token 交错拼接，吸收帧内静态细节与帧间动态线索）+ **Query-Guided Space Decoder**（用双重交叉注意力把查询映射成 `(cx, cy, w, h)` 框坐标，时间范围仍由 LLM 文本生成）。配套合成数据集 **Uni-STG**（48 万条，覆盖 VTG / REC / STVG 三任务）做多任务指令微调；骨干为 **SigLIP** 视觉编码器 + **Qwen2** LLM，在 **LLaVA-Video** 上 16×A800 训练约 24 小时。

## 为什么重要

不理解 SpaceVLLM，下面这些事容易误判：

- 为什么 [[grounded-videollm-2024]]、[[vtg-llm-2024]]、TRACE 很强却仍做不了 STVG——它们主攻**时间轴**或**单图框选**；STVG 要每帧对齐框与时间管，视觉 token 海量，一次性让 LLM 吐出所有坐标极易错位
- 为什么 [[vidstg-2020]] 定义的 STVG 长期只有 DETR 类专用模型——缺大规模时空联合标注；SpaceVLLM 用 Grounding-DINO + Qwen2.5-72B 流水线合成 11 万 STVG 样本，把任务拉回 MLLM 统一范式
- 为什么 GroundingGPT 的「先 VTG 再逐帧 REC」两阶段在 HCSTVG 上 m_vIoU 只有 16.7——静态图定位缺帧间动态；SpaceVLLM 的交错查询 token 显式建模**相邻帧运动**
- 为什么 2025 年 Video LLM 评测开始同时报 Charades-STA、RefCOCO、HCSTVG、VidSTG——证明「会答题」≠「会画时空管」；SpaceVLLM 在 11 个基准上联合 SOTA，把 VTG + REC + STVG 收成一条产品线

## 核心要点

1. **Spatio-Temporal Aware Query（交错时空查询）**：均匀采样 $N_v$ 帧，为每帧配一个特殊 token `<r_i>`，与帧视觉 embedding 按行交错拼接后送入 LLM；末尾再加 `<r_{N_v}>` 专供单图 REC。查询位置自带时间序，又夹在相邻帧之间吸收动态空间变化。类比：每两页漫画之间插一张「动作过渡便签」，便签既记住当前页画面，又记住翻页时的运动。

2. **Query-Guided Space Decoder（查询引导空间解码器）**：LLM 最后一层输出中，取出每帧查询 embedding，经**双重交叉注意力**——先让视觉 token 与 caption 文本对齐，再让查询 attend 增强后的视觉 token——最后过轻量 MLP 预测框坐标；**不新增可训练注意力参数**，复用 LLM 已学好的表征。时间起止仍由 LLM 自回归生成文本时间戳，再换算帧区间只对 $[t_s, t_e]$ 内帧算 $\mathcal{L}_{space}$。类比：导游先口头报「请到 12–18 秒那段」，副导播再按便签逐帧圈人。

3. **Uni-STG 三任务 48 万条统一训练**：VTG 聚合 DiDeMo、Charades-STA、TACoS（5 万）；REC 用 RefCOCO 系列（32 万）；STVG 11 万由合成流水线产出——Analyzer 用 Qwen2.5-72B 抽 caption 主体 → Annotator 用 Grounding-DINO 打框 → Refiner 收紧时间边界 → Filter 丢复杂场景与面积跳变帧（约滤掉 40%）。另混 VQA、对话、字幕共 20 万条保通用视频理解。类比：同一所驾校既教「看后视镜」（VTG）、「倒车入库」（REC）、「跟车并线」（STVG），结业考试分开考但共用方向盘技巧。

4. **11 基准联合 SOTA**：HCSTVG-v1 test m_tIoU **56.9** / m_vIoU **39.3**（超 CG-STVG 与 TRACE-7B）；VidSTG 陈述句 m_vIoU **27.4**、疑问句 **25.4**，接近 TubeDETR 等专用模型；Charades-STA R@1@IoU=0.5 **63.6%**（超 TRACE 1.9pt）；RefCOCO+ test-A **88.4%**；MVBench / VideoMME / TempCompass / EgoSchema 相对 LLaVA-Video 基座仍持平或微涨——说明时空头没有牺牲通用理解。

## 实践案例

### 案例 1：交错查询 token 在输入序列中的排布

```
视频 64 帧，每帧 S 个视觉 token，指令为「定位描述中的主体」：

[帧₀: v₀,₁ … v₀,ₛ | <r₀> | 帧₁: v₁,₁ … v₁,ₛ | <r₁> | … | <r₆₃> | USER: 男人抱起婴儿的时间段与框 ]

LLM 文本输出示例：
  「The event occurs from 12.0s to 18.5s.」

再将 [12.0s, 18.5s] 映射到帧索引 [f_s, f_e]，
取出对应 <r_fs>…<r_fe> 的 last-layer embedding → Space Decoder → 每帧一个框
```

- `<r_i>` 插在相邻帧视觉块之间，既看当前帧又感知帧间运动
- 时间用自然语言 + 显式秒数 prompt（如「64 帧均匀采自 20 秒片，各帧位于 0.00s, 0.28s, …」）强化时间感知
- 空间损失只在 GT 时间管内计算，避免全片乱框

### 案例 2：Uni-STG STVG 合成流水线（论文 Figure 3）

```text
原始源：Charades-STA / TACoS / DiDeMo / InternVid 的 (视频, caption, 粗时段)

Step 1 Analyzer (Qwen2.5-72B)
  → 从 caption 抽可定位物体列表，优先主体

Step 2 Annotator (Grounding-DINO, conf ≥ 0.3)
  → 在粗时段内每帧打 open-set 框

Step 3 Refiner
  → 按框出现时刻收紧起止时间；丢弃 <2s 或 >120s 样本

Step 4 Filter
  → 丢 >3 框的复杂帧；相邻帧框面积不得差 2 倍以上

产出：~110K 高质量 STVG 管标注 + 指令模板
```

- 解决老 VTG 数据集「5 秒整数边界」与真实物体出入不对齐的问题
- 合成数据让 MLLM 见过「时间 + 每帧框」联合格式，零样本迁移到 [[vidstg-2020]] 官方测试集

### 案例 3：读 HCSTVG-v1 与 VidSTG 指标（论文 Table 2–4）

```
指标          含义
────────────────────────────────────────────────────────
m_tIoU        预测时间管与 GT 时间 IoU 均值（越高越准定位「何时」）
m_vIoU        预测框管与 GT 框管体积 IoU 均值（越高越准「在哪」）
vIoU@0.3/0.5  管 IoU 超阈值的比例（更严的 STVG 命中率）

SpaceVLLM-7B vs TRACE-7B（HCSTVG-v1）：
  m_tIoU  56.9 vs 39.2（+17.7）
  m_vIoU  39.3 vs —（TRACE 未报空间）

SpaceVLLM-7B vs CG-STVG（专用 DETR 类）：
  m_tIoU  56.9 vs 52.8；vIoU@0.5  36.9 vs 36.3（MLLM 追平专用 SOTA）

读法：STVG 必须分「时间」和「空间」两列看；只报 m_tIoU 会掩盖「时段对了但框飞了」
```

## 踩过的坑

1. **把「LLM 一次吐出所有坐标」当 STVG 方案**：论文消融去掉 Query 与 Space Decoder 后 m_vIoU 掉 11.6pt——海量视觉 token 与坐标难对齐，必须分「文本报时 + 查询导框」两阶段。

2. **用两阶段 VTG→逐帧 REC 代替联合建模**：GroundingGPT 在 VidSTG 陈述句 m_vIoU 仅 12.3；静态图定位缺帧间动态，时空管会断档。

3. **忽略 Uni-STG 过滤率**：合成流水线约去掉 40% 样本；复现时若跳过 Filter，噪声框会把 $\mathcal{L}_{space}$ 训崩。

4. **在 STVG 榜只比 m_tIoU**：TRACE、VTG 专用模型 temporal 分高但 spatial 弱；HCSTVG / VidSTG 必须同时报 m_vIoU 与 vIoU@0.5。

## 适用 vs 不适用场景

**适用**：
- 需要**单一 MLLM** 同时服务「跳时间段」「图里指物」「视频时空管」三种产品的团队
- 研究 **VTG + REC 多任务是否互促**（SpaceVLLM 在 Charades-STA 与 RefCOCO 双涨）
- 在 [[vidstg-2020]]、HCSTVG 上评测 Video LLM 的**时空联合**能力，而非只看 QA 准确率
- 作为 [[vtg-llm-2024]] → [[grounded-videollm-2024]] → SpaceVLLM 演进线的**时空统一终点**参考

**不适用**：
- 只要粗粒度「第几秒发生了什么」、不需要每帧框——[[vtg-llm-2024]] 或 TRACE 更轻
- 实时毫秒级多目标跟踪（SpaceVLLM 需 LLM 自回归 + 解码器，非流式检测器）
- 无 GPU 合成数据复现（Uni-STG STVG 依赖 Qwen2.5-72B + Grounding-DINO 流水线）
- 纯音频或纯文本时段检索（模型强依赖 SigLIP 视觉编码）

## 历史小故事（可跳过）

- **2020**：[[vidstg-2020]] 提出 STVG 任务与 VidSTG 数据集，主流方法为两阶段 Faster R-CNN + 管匹配
- **2023–2024**：[[vtg-llm-2024]]、[[grounded-videollm-2024]]、TRACE 等把 VTG 写进 Video LLM，REC 有 Groma、Shikra 等，但**时空联合**仍空白
- **2025-03**：arXiv 2503.13983 发布 SpaceVLLM + Uni-STG；代码仓库 Jayce1kk/SpaceVLLM
- **同期**：OmniSTVG 等多对象 STVG 工作出现，benchmark 竞争加剧
- **社区**：基于 LLaVA-Video + Qwen2 的 7B 权重成为复现默认；LMMs-Eval 用于补全部分理解榜分数

## 学到什么

1. **时间 grounding 与空间 grounding 不能简单串联**——交错查询 token 让 MLLM 在统一上下文里同时看见「哪一帧」和「帧间怎么动」，比「先截段再当图片」稳得多
2. **缺数据可以合成，但要重度过滤**——Grounding-DINO 打框 + 面积/复杂度过滤，比直接信老 VTG 数据集的 5 秒边界更靠谱
3. **解码器分工**：LLM 擅长生成时间文本与语义，轻量 Space Decoder 擅长回归框——各用所长比强迫 LLM 吐几百个浮点坐标更稳
4. **多任务联合训练不必然伤通用理解**——混 VQA / 对话 / 字幕后 MVBench、EgoSchema 仍微涨，说明时空头是「加能力」而非「换脑子」
5. **评测要 11 榜一起看**——只在 Charades-STA 高分不代表会做 STVG；HCSTVG-v2、VidSTG 疑问句才是硬菜

## 延伸阅读

- 论文 PDF：[arXiv 2503.13983](https://arxiv.org/abs/2503.13983)
- 官方代码：[Jayce1kk/SpaceVLLM](https://github.com/Jayce1kk/SpaceVLLM)
- STVG 经典基线：TubeDETR、CG-STVG、STVGFormer（对比专用 DETR 管线）
- 时间 LLM 前作：[[vtg-llm-2024]]、[[grounded-videollm-2024]]、[[trace-2024]]
- 数据集：[[vidstg-2020]]（VidSTG 官方时空管标注）、HCSTVG
- 检测工具：Grounding-DINO（Uni-STG 合成打框器）

## 关联

- [[vidstg-2020]] —— STVG 任务与 VidSTG 数据集的定义源头；SpaceVLLM 主榜之一
- [[vtg-llm-2024]] —— 绝对时间 token + VTG-IT 的 VTG 专模；SpaceVLLM 继承「时间文本输出」思路并扩展到空间管
- [[grounded-videollm-2024]] —— 双流 + 相对时间 token 的细粒度 VTG；与 SpaceVLLM 的「查询 + 空间解码器」形成对照
- [[trace-2024]] —— 因果事件链 VTG；HCSTVG 上 m_tIoU 被 SpaceVLLM 大幅超过
- [[qvhighlights-2021]] —— Moment retrieval + highlight 经典榜；SpaceVLLM 的 VTG 子能力可对接 MR 任务
- [[llava-next]] —— LLaVA-Video 系多模态基座；SpaceVLLM 训练起点
- [[video-understanding]] —— 专题枢纽；STVG 子路线以 vidstg → spacevllm 收束

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
