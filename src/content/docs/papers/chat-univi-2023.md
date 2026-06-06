---
title: Chat-UniVi — 动态视觉 token 统一图像与视频对话
来源: 'Jin et al., "Chat-UniVi: Unified Visual Representation Empowers Large Language Models with Image and Video Understanding", CVPR 2024'
日期: 2026-06-05
分类: 机器学习
子分类: 视频理解
难度: 中级
provenance: manual-read
---

## 是什么

Chat-UniVi 是北京大学 Yuan 团队 2023 年 11 月提出、2024 年 CVPR 收录的统一视觉语言模型。它用**同一套动态视觉 token**同时表示图像和视频，让大语言模型（LLM）不必为两种媒介各学一套「翻译规则」。

日常类比：以前的视频模型像给每张照片都配固定数量的便签——背景天空和主角人脸占同样多位置，既浪费又抓不住重点。Chat-UniVi 像会**自动合并相似便签**的秘书：羊的细节留很多 token，雪山背景只留一个；视频则先按「事件」切段，再在段内随帧数扩展 token——**该细的地方细，该粗的地方粗**。

技术栈：CLIP-ViT 提供初始视觉 token → **DPC-KNN 聚类**逐步合并语义相近的 token → **多尺度表示**同时保留高层语义与低层细节 → Vicuna-7B 做指令微调。图像和视频混合训练，推理时同一套权重直接两用。

## 为什么重要

不理解 Chat-UniVi，下面这些事说不清：

- 为什么在 LLM 上下文有限时，「动态 token 数」比「固定 256 个 patch」更关键——视频帧多、图像分辨率高，固定 token 要么爆上下文要么丢细节
- 为什么 2023–2024 年 PKU-YuanGroup 会连续产出 Video-LLaVA 和 Chat-UniVi 两条统一图像/视频路线——前者靠对齐前置（LanguageBind），后者靠 token 合并（DPC-KNN），解决的是同一问题的不同切面
- 为什么 POPE 幻觉 benchmark 上，多尺度动态 token 能明显压低「看图胡说」——粗粒度 token 提供全局约束，细粒度 token 保留局部证据
- 为什么混合图像+视频训练不是简单堆数据——论文 ablation 显示只训视频或只训图像都会掉分，联合训练在 ScienceQA 和视频 QA 上同时受益

## 核心要点

1. **动态视觉 token（Dynamic Visual Tokens）**：图像里羊需要细粒度、背景只需一个 token；视频先按帧特征聚类成「事件」，再在事件内随时间扩展 token。核心算法是 **DPC-KNN**（基于 k 近邻密度峰值的聚类）：每轮把语义相近的 token 特征取平均合并，token 总数随内容复杂度变化，而非写死 256。

2. **多尺度表示（Multi-scale Representation）**：合并不是一步完成，而是分多步——早期步保留更多 token（低层纹理、边缘），后期步压缩成语义簇（高层概念）。LLM 同时看到多个尺度的 token 序列，既能答「图里有什么大类」，也能答「羊耳朵是什么颜色」。去掉多尺度后 POPE 对抗集 F1 从 71.5 掉到 68.7。

3. **统一图像/视频训练（Unified Training）**：预训练用 COCO + CC3M-595K 图像对；指令微调混合 LLaVA 图像指令、MIMIC-IT 多模态上下文数据、VideoChatGPT 视频指令。输入统一 resize 到 224×224，同一 projector 和 LLM 权重处理两种媒介——切换任务不需要改模型结构。

## 实践案例

### 案例 1：Chat-UniVi 推理（图像/视频同一接口）

```python
# 官方 repo: https://github.com/PKU-YuanGroup/Chat-UniVi
from chatunivi.model.builder import load_pretrained_model
from chatunivi.mm_utils import get_model_name_from_path

model_path = "Chat-UniVi/Chat-UniVi-7B"
tokenizer, model, processor, _ = load_pretrained_model(model_path)

# 图像问答：DPC-KNN 合并后 token 数 < 原始 patch 数
image = processor["image"]("sheep_mountain.jpg")
response = model.generate(
    input_ids=tokenizer("图里羊和背景各是什么？"),
    pixel_values={"image": image},
)

# 视频问答：先事件分段，再帧内扩展 token
video = processor["video"]("cooking_clip.mp4", num_frames=8)
response = model.generate(
    input_ids=tokenizer("厨师先做了什么？"),
    pixel_values={"video": video},
)
# 两路共享同一套动态 token 编码 + Vicuna LLM
```

### 案例 2：零样本视频 QA 对比（GPT 辅助评测）

```
论文 Table 4（Accuracy / GPT Score，7B 模型）：

                    MSVD-QA    ActivityNet-QA
Video-ChatGPT       64.9/3.3   35.2/2.7
VideoChat           56.3/2.8   26.5/2.2
Chat-UniVi          69.3/3.7   46.1/3.3   <- 同期开源视频 LLM 中领先

关键：固定 token 的 Video-ChatGPT 在长视频 ActivityNet 上差距更大；
      动态 token 让更长视频能分到更多表示预算。
```

### 案例 3：DPC-KNN token 合并（概念伪代码）

```python
# 从 CLIP-ViT 得到初始 token Z = {z_1, ..., z_N}
Z = clip_vit(image_or_frames)  # N 个 patch token

for step in range(num_merge_steps):
    # DPC-KNN：找密度峰作为簇中心，k 近邻归簇
    clusters = dpc_knn(Z, k=5)
    # 同簇 token 特征取平均，数量减少
    Z = [mean([z for z in cluster]) for cluster in clusters]

# 视频额外一步：先在帧级特征上 DPC-KNN 得到 events
# 再在每 event 内的帧 token 上做空间合并
# 输出：多尺度 token 列表 → 送入 LLM projector
```

## 踩过的坑

1. **DPC-KNN 合并是不可学习的启发式**：聚类阈值和步数靠手工设定，不同视频类型（体育 vs 访谈）最优合并率不同——论文 ablation 显示合并过狠会掉 MSVD 精度，合不够又占满上下文。

2. **224×224 输入分辨率偏低**：为和 LLaVA 训练设置对齐，高分辨率细节（小字、远处物体）在 ViT 第一层就被下采样，动态 token 救不了已经丢掉的像素信息。

3. **ActivityNet-QA 绝对分仍不高（46.1%）**：动态 token 改善了相对排名，但长视频复杂推理距离 Gemini / GPT-4V 仍有鸿沟——token 预算问题缓解了，语义理解上限仍受 7B LLM 和训练数据约束。

4. **与 Video-LLaVA 路线不同但容易混为一谈**：Video-LLaVA 用 LanguageBind 对齐后再投影；Chat-UniVi 用 CLIP + 动态合并——两者都称「统一视觉表征」，实现路径和适用场景并不相同，选型时需分开评估。

## 适用 vs 不适用场景

**适用**：
- 需要在有限 LLM 上下文内同时处理图像和高帧数视频
- 希望图像/视频混合训练、单一 checkpoint 部署两种任务
- 关注 object hallucination（POPE）——多尺度动态 token 在此 benchmark 表现突出

**不适用**：
- 需要原生高分辨率输入（224×224 是硬限制）
- 极长视频（小时级）——动态 token 仍受总上下文上限约束，没有 LongVA 式长上下文迁移
- 需要音频理解——Chat-UniVi 无音频分支，纯视觉

## 历史小故事（可跳过）

- **2023-11-14**：Chat-UniVi 上传 arXiv（2311.08046），与 Video-LLaVA（2311.10122）几乎同期，同属 PKU-YuanGroup 统一多模态攻势
- **2024-04**：arXiv v3 修订，补充更多 ablation 与 POPE 结果
- **2024-06**：CVPR 2024 正式发表（pp. 13700–13710），代码在 GitHub 开源
- **2024 后**：同团队 LLaVA-OneVision 把统一表征思路扩展到单图/多图/视频三模 SOTA，Chat-UniVi 的动态 token 思想被后续工作引用为「有限 token 预算」方案代表

## 学到什么

1. **固定 token 数是图像/视频统一的多模态瓶颈**：LLM 上下文有限，「每帧 256 token × 8 帧」和「高分辨率图 576 token」无法兼顾——动态分配是更合理的默认思路
2. **聚类合并是 cheap 的压缩**：DPC-KNN 不需要额外可训练模块，却在视频 QA 上稳定超过 Video-ChatGPT——先问「哪些 token 该合并」再问「怎么训 projector」
3. **多尺度不是 luxury**：粗+细同时喂给 LLM，POPE 和 ScienceQA 双涨——全局语义和局部细节在同一 forward 里互补
4. **混合训练的价值有 ablation 支撑**：只训视频掉图像分、只训图像掉视频分，联合训练两者都涨——和 Video-LLaVA 的「United Visual Representation」结论互相印证

## 延伸阅读

- 论文 PDF：[arXiv 2311.08046](https://arxiv.org/abs/2311.08046)
- CVPR 2024 页面：[OpenAccess](https://openaccess.thecvf.com/content/CVPR2024/html/Jin_Chat-UniVi_Unified_Visual_Representation_Empowers_Large_Language_Models_with_Image_CVPR_2024_paper.html)
- 官方代码：[PKU-YuanGroup/Chat-UniVi](https://github.com/PKU-YuanGroup/Chat-UniVi)
- [[llava]] —— Chat-UniVi 继承 LLaVA 的 projector + 指令微调范式，训练数据也含 LLaVA 指令集
- [[clip]] —— 视觉 encoder 基于 CLIP-ViT，初始 token 来自 patch embedding
- [[vid-llm-survey-2023]] —— 综述将 Chat-UniVi 列为动态 token / 统一表征路线代表

## 关联

- [[llava]] —— 架构母本：CLIP + MLP Projector + Vicuna；Chat-UniVi 在 token 层做创新
- [[clip]] —— 提供初始视觉 token，DPC-KNN 在其 patch 特征上合并
- [[blip2-2023]] —— 对照：Q-Former 固定查询 token vs Chat-UniVi 动态合并 token
- [[videochat-2023]] —— 同期竞品：Q-Former + 固定帧采样；Chat-UniVi 视频 QA 全面更高
- [[video-llama-2023]] —— 双分支音视频方案；Chat-UniVi 专注纯视觉统一
- [[video-llava-2024]] —— 同团队另一条路：LanguageBind 对齐前置 vs DPC-KNN 动态 token
- [[qwen2-vl-2024]] —— 工业竞品：动态分辨率 + M-RoPE vs 聚类合并
- [[longva-2024]] —— 长视频另一条路：扩 LLM 上下文 vs 压缩视觉 token
- [[tempcompass-2024]] —— 可检验 Chat-UniVi 事件分段是否真懂时序
- [[videoprism-2024]] —— 冻结 encoder 通用表征 vs 端到端指令微调
- [[mvbench-2023]] —— 多维度视频理解 benchmark，可测统一模型短板
- [[video-understanding]] —— 专题枢纽

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）

