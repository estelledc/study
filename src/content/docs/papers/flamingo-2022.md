---
title: Flamingo — 让冻结的大模型学会看图，几张样例就上手
来源: 'Alayrac et al., "Flamingo: a Visual Language Model for Few-Shot Learning", NeurIPS 2022'
日期: 2026-05-31
子分类: 模型与训练
分类: 机器学习
难度: 中级
provenance: pipeline-v3
---

## 是什么

Flamingo 是 DeepMind 2022 年做的一个**视觉-语言大模型**。它的核心招数：把一个已经训练好的**纯文本大模型**和一个已经训练好的**图像编码器**都**冻住**（权重不动），中间只塞几层新模块把视觉信号翻译成大模型能听懂的样子。结果就是：模型不用为每个新任务专门微调，**在 prompt 里塞几张「问题图 + 答案」做示范**，它就能照着格式回答新图。

日常类比：好比一个已经会写作文的中学生（语言模型），你给他配一副会拍照的眼镜（视觉编码器），中间加一个翻译耳机（新插入的模块）。耳机把眼镜看到的东西翻成中学生能听懂的话。中学生本人没重新上课，眼镜也没换，只是耳机被训练过。

## 为什么重要

不理解 Flamingo，下面这些事说不清楚：

- **GPT-4V 之前的工业天花板**：2022 年它在 16 个图像/视频任务上少样本就打过当时一堆专门微调的 SOTA。多模态大模型从「研究玩具」变「能干活」是这一年。
- **后来所有 VLM 的祖型**：LLaVA、BLIP-2、MiniGPT-4、Qwen-VL、IDEFICS 全是这条路的变体——视觉编码器 + 一个 connector + 冻结的 LLM。
- **证明 in-context few-shot 不只属于 NLP**：GPT-3 让大家见识了「prompt 里塞几个例子就能学」，Flamingo 第一次把这件事搬到图文混排。
- **「冻结大模型 + 少量适配层」这条路线的代表作**：和后来 GPT-4V 的「端到端原生多模态」是两条不同的路，Flamingo 是冻结路线的顶峰。

## 核心要点

整个模型可以拆成 **四块**：

1. **视觉编码器（Vision Encoder）**：用一个已经训练好的 NFNet-F6（约 0.4B 参数），把图片或视频帧变成一堆视觉特征。**冻结**，不训练。
2. **Perceiver Resampler**：新模块、要训练。任务是把变长的视觉特征**压成固定的 64 个视觉 token**——不管输入是 1 张图还是 8 帧视频，出来都是 64 个。技术细节：用一小组可学习的 query 做交叉注意力。
3. **冻结的语言模型**：用 Chinchilla（1.4B / 7B / 70B 三档），最大的 Flamingo-80B 配 Chinchilla 70B。**冻结**，不训练。
4. **Gated Cross-Attention（门控交叉注意力）**：新模块、要训练。在语言模型每隔几层之间塞一层新的交叉注意力，让文本 token 能「看见」前面那 64 个视觉 token。

**最关键的一个工程技巧**：门控用 `tanh(α)`，把 α 初始化为 0。训练刚开始时门是关的——新插入的模块输出**乘以 0** 等于不存在，整个模型行为和原版 Chinchilla **一字不差**。然后训练慢慢把 α 拧开。这保证「不破坏已有的语言能力」是数学上的，不是靠运气。

整个 80B 参数里只有约 10B 在训练，剩下 70B 全冻结。

## 训练数据

四个数据集组合训练：

- **M3W**：DeepMind 自爬的 4300 万页网页，图文**自然交错**——这是支持 in-context few-shot 的关键
- **ALIGN**：18 亿图文对，质量嘈杂但量大
- **LTIP**：3.12 亿高质量图文对
- **VTP**：2700 万短视频文本对

训练目标只有一个：**下一个 token 预测**，损失只算文本部分。视觉 token 不参与 loss，只作为条件输入。

## 实践案例

### 案例 1：少样本 in-context 视觉问答

prompt 长这样：

```
[图1] Q: 这只动物是什么？ A: 老虎
[图2] Q: 这只动物是什么？ A: 长颈鹿
[图3] Q: 这只动物是什么？ A:
```

模型读完前两个例子，自己学会了「看图回答动物名」的格式，对图 3 直接补「斑马」。**模型权重一个字没改**，只是在做下一个 token 预测。这就是 few-shot in-context learning 在多模态版本。论文里 shot 数从 0 单调爬到 32，每加几个例子准确率都在涨。

### 案例 2：图文交错的网页阅读

M3W 数据集让 Flamingo 天生支持「图，文，图，文，图，文」这种序列——不只是「一张图配一段描述」。这让它能做图文混排的复杂推理（比如菜谱里图和步骤交错）。这一点是和早期 VLM（CLIP / ViLBERT）最大的差别：那些只能处理「一图一文」的对应。

### 案例 3：视频理解

视觉编码器对每一帧编码，Perceiver Resampler 把所有帧的特征**压成同样 64 个 token**。所以同一个模型既能吃图又能吃视频，不用改架构。在 MSVD-QA 等视频问答任务上 32-shot 也超过了当时的 fine-tune SOTA。

### 案例 4：开放式描述生成

不像 CLIP 只能算图文相似度，Flamingo 是**生成式**的——可以让它「用一句话描述这张图发生了什么」、「写一首关于这张图的诗」、「这张图和上一张图有什么区别」。这种开放回答能力来自冻结的 Chinchilla 本身已经会的语言生成。

## 踩过的坑

1. **训练数据 M3W 是私有的**：DeepMind 没开放。社区想复现只能用 OBELICS（HuggingFace 团队照 M3W 思路自己爬的开源版本）。这是为什么 OpenFlamingo / IDEFICS 这些复刻版精度对不齐 paper 的根因。

2. **32-shot 上下文极长**：每张图占 64 个 token，32 张就 2048 token 还没算文字。实际部署里大家常退回 0-shot 或 1-shot，论文里漂亮的 32-shot 数字日常用不上。

3. **图像分辨率固定 320×320**：OCR、密集图表、小字这种任务上明显弱。这个限制后来 LLaVA-Next、Qwen2-VL 用「动态分辨率 / 切片」解决。

4. **tanh 门控让早期 loss 看起来「没在学」**：因为 α≈0 时新模块输出几乎为 0，loss 就和纯 LLM 持平。新人容易以为训练发散，实际上这是设计意图——要给训练几千步让 α 慢慢长出来。

## 和同类方法的区别

| 方法 | 视觉前端 | 连接方式 | LLM | 训练规模 |
|------|---------|---------|-----|---------|
| CLIP（2021） | ViT | 对比损失 | 双塔 | 全部训练 |
| Flamingo（2022） | NFNet | Perceiver + 门控 cross-attn | Chinchilla 70B 冻结 | 10B 可训 / 80B 总 |
| BLIP-2（2023） | ViT 冻结 | Q-Former（更轻） | OPT/T5 冻结 | Q-Former 可训 |
| LLaVA（2023） | CLIP-ViT 冻结 | 一层线性投影 | Vicuna 冻结后微调 | 投影层 + LLM |
| GPT-4V（2023） | 未公开 | 端到端 | 端到端 | 整个模型一起训 |

CLIP 是**双塔判别式**，只能算「图和文匹配度」，不能开放回答。Flamingo 是**单塔生成式**，能续写任何文本，所以可以做 VQA、描述、对话。BLIP-2 把 Resampler 改成 Q-Former，更轻。LLaVA 把 connector 简化到极致——一层线性映射，靠指令微调拿到 SOTA，是这条路的极简版。GPT-4V 不再冻结，端到端训，是另一条路。

## 适用 vs 不适用场景

**适用**：

- 想做多模态但**不想从头训语言模型**：直接拿一个开源 LLM 冻起来配视觉前端
- 任务种类多、每个任务样本少：靠 few-shot in-context 一个模型打通
- 想保留底层 LLM 的语言能力（写代码、推理、对话），不想被多模态训练冲掉

**不适用**：

- **需要高分辨率、密集 OCR**：固定 320×320 撑不住，要换 LLaVA-Next 这种切片方案
- **需要原生多模态对齐**：冻结路线的天花板低于端到端训练（GPT-4V、Gemini）
- **延迟敏感的产线**：32-shot 太长，0-shot 又比专门微调差
- **任务窄而深**：不如直接微调一个小模型省钱

## 历史小故事（可跳过）

- **2021 年**：DeepMind 发表 **Perceiver IO**，证明「一组可学习 query 压任意输入」这招很通用。这是 Flamingo 里 Resampler 的前身。
- **2021 年 1 月**：OpenAI 发 **CLIP**，把视觉和语言塞进同一个嵌入空间。是 Flamingo 之前最有影响力的 VLM。
- **2022 年 3 月**：DeepMind 发 **Chinchilla**（70B 参数，训练 token 量是 GPT-3 的 4 倍），结论是「数据 vs 参数应等比缩放」。Flamingo 的语言后端就是它。
- **2022 年 4 月**：Flamingo 论文上 arXiv，刷 16 个 benchmark，第一次把 in-context few-shot 完整搬到多模态。
- **2023 年 1 月**：Salesforce 发 **BLIP-2**，把 Resampler 换成更轻的 Q-Former，证明 connector 还能更瘦。
- **2023 年 3 月**：LAION 开源 **OpenFlamingo**，3B/9B 两档复刻。
- **2023 年 4 月**：威斯康星麦迪逊发 **LLaVA**，把 connector 简化到一层线性投影 + 指令微调。
- **2023 年 8 月**：HuggingFace 开源 **IDEFICS**，9B/80B 完整复刻，连数据集 OBELICS 一起放出。
- **2023 年 9 月**：**GPT-4V** 公开发布，端到端原生多模态崛起，「冻结路线」开始让位。

## 学到什么

1. **冻结 + 少量适配层** 是把已有大模型扩展到新模态的高性价比路子，比从头训便宜两个数量级。这条路线后来在所有模态扩展（音频、视频、3D）都被复用。
2. **门控初始化为 0** 是个值得记住的工程模式：插入新模块时让它一开始等于「不存在」，训练自己学着开门。后来 LoRA、ControlNet 都用过类似思路。
3. **统一变长输入到定长 token**（Perceiver Resampler）让一个模型同时吃图、视频、多帧，不用为每种模态单写一份代码。这是「query 当压缩器」的范式胜利。
4. **多模态的 in-context few-shot 是真的**，但代价是上下文很长——理论漂亮，工程要权衡。
5. **数据集形态决定能力上界**：M3W 的图文交错网页让模型学到「图文混排」这种格式，这是单纯堆图文对喂不出来的。

## 延伸阅读

- 论文 PDF：[Flamingo: a Visual Language Model for Few-Shot Learning](https://arxiv.org/abs/2204.14198)（NeurIPS 2022，66 页含附录）
- 复刻代码：[OpenFlamingo (LAION)](https://github.com/mlfoundations/open_flamingo) — 3B/9B 两档，从这里读起最容易
- 完整开源：[IDEFICS / HuggingFace](https://huggingface.co/blog/idefics) — 含 80B 权重和 OBELICS 数据集
- DeepMind 博客：[Tackling multiple tasks with a single visual language model](https://deepmind.google/discover/blog/tackling-multiple-tasks-with-a-single-visual-language-model/)（科普版讲解，可视化好）
- [[attention]] —— Flamingo 用的交叉注意力是 Transformer 的标配
- [[chinchilla-2022]] —— Flamingo 的语言后端，也定下了「数据等比缩放」的规则

## 关联

- [[attention]] —— 视觉 token 进 LLM 的桥梁就是交叉注意力
- [[clip]] —— 同样把视觉和语言绑到一起，但 CLIP 是双塔判别式，Flamingo 是单塔生成式
- [[blip2-2023]] —— 用 Q-Former 替换 Perceiver Resampler，思路一致，模块更轻
- [[llava-2023]] —— 把 connector 简化成一层线性投影 + 指令微调，是这条路的极简版
- [[gpt4v-2023]] —— 端到端原生多模态训练，是冻结路线的对立面
- [[chinchilla-2022]] —— Flamingo-80B 的语言后端

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[attention]] —— Attention Is All You Need
- [[blip2-2023]] —— BLIP-2 — 用 188M 小桥接器把冻结的视觉模型和大语言模型拼起来
- [[clip]] —— CLIP — Contrastive Language-Image Pre-training
- [[llama-vid-2023]] —— LLaMA-VID — 每帧两枚 token，把小时级视频塞进 LLM
- [[lvbench-2024]] —— LVBench — 平均 68 分钟、六维能力的长视频极限考
- [[st-llm-2024]] —— ST-LLM — 把所有时空 token 交给 LLM，让它自己学时序
- [[vid-llm-survey-2023]] —— Vid-LLM Survey — 用大语言模型理解视频的全景地图
- [[video-llama-2023]] —— Video-LLaMA — 把音频和视频同时塞进大语言模型
- [[videochat-2023]] —— VideoChat — 把视频、指令微调、多轮对话第一次放进同一个系统

