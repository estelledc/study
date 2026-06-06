---
title: Qwen2-VL — 动态分辨率 + M-RoPE，工业级视频理解的里程碑
来源: Wang et al. "Qwen2-VL - Enhancing Vision-Language Models Perception of the World at Any Resolution". arXiv 2024
日期: 2026-06-05
分类: 机器学习
子分类: 视频理解
难度: 高级
provenance: manual-read
---

## 是什么

Qwen2-VL 是阿里巴巴 2024 年 9 月发布的大型多模态模型系列（2B / 8B / 72B），它做了三件之前没人系统做好的事：**任意分辨率输入、时空位置编码统一、20 分钟长视频理解**。

日常类比：之前的 VLM 像一台只能拍 4:3 照片的相机——你拍了一张宽屏全景图，它必须压缩才能处理，细节全丢了。Qwen2-VL 是一台手机相机——分辨率跟着场景走：拍文档时高分辨率看清每个字，拍风景时正常分辨率就够，不浪费算力。

三个核心技术点：**Naive Dynamic Resolution**（输入分辨率动态化）、**M-RoPE**（视觉 + 文本统一的时空位置编码）、**统一的图像/视频处理范式**——三件事叠加，让 Qwen2-VL-72B 在多模态 benchmark 上首次与 GPT-4o / Claude 3.5 Sonnet 持平甚至超越。

## 为什么重要

不了解 Qwen2-VL，下面这些事说不清：

- 为什么「固定 224×224 输入」是多模态模型的重大设计缺陷——高分辨率图里的小字、细节、表格在被强制压缩后永久丢失
- 为什么 1D RoPE 对视频来说不够用——视频帧有时序维度和两个空间维度，共 3D；用 1D 位置编码会让模型混淆「第 3 帧的第 5 行」和「第 5 帧的第 3 行」
- 为什么 Qwen2-VL-72B 能把 GPT-4V 拉下来——不是因为参数多，而是因为动态分辨率让它真正能看清高分辨率图里的内容
- 为什么长视频理解从「几十秒」跳到「20 分钟+」需要专门的位置编码设计——帧数增多后 1D 位置编码的区分度崩塌

## 核心要点

1. **Naive Dynamic Resolution（NDR）——按内容确定 token 数**：传统 VLM 把图像 resize 到固定尺寸（224×224）再切 patch；Qwen2-VL 直接从原始分辨率切 patch，高分辨率图自然产生更多 token，低分辨率图产生更少 token。一张 1024×1024 的文档图产生 1024 个 patch，一张 224×224 的缩略图只产生 64 个——模型按需分配，不浪费也不截断。

2. **M-RoPE（Multimodal Rotary Position Embedding）——3D 位置编码**：文本用 1D RoPE（序列位置）；图像用 2D（行位置 + 列位置）；视频用 3D（帧索引 + 行位置 + 列位置）。三种模态的 RoPE 分量共享同一个 embedding 维度，但各自占不同的频段——LLM 在处理 `<image>` token 时自动激活 2D 分量，处理 `<video>` token 时激活 3D 分量，处理文本时激活 1D 分量。

3. **图像和视频统一范式**：图像被视为「单帧视频」（temporal position = 0），视频帧按时间戳编码（temporal position = frame_idx）。ViT 的参数在图像和视频任务间完全共享，不分叉——这让图像预训练数据也能帮助视频理解，反之亦然，和 Video-LLaVA 的 ABP 思路在不同层面殊途同归。

## 实践案例

### 案例 1：动态分辨率推理

```python
from transformers import Qwen2VLForConditionalGeneration, AutoProcessor
from qwen_vl_utils import process_vision_info

model = Qwen2VLForConditionalGeneration.from_pretrained(
    "Qwen/Qwen2-VL-7B-Instruct", torch_dtype="auto"
)
processor = AutoProcessor.from_pretrained("Qwen/Qwen2-VL-7B-Instruct")

# 高分辨率文档图（会自动生成更多 token）
messages = [{
    "role": "user",
    "content": [
        {"type": "image", "image": "file://contract.png"},  # 1024×1024
        {"type": "text", "text": "提取合同中的甲方和乙方信息"},
    ],
}]
text = processor.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
image_inputs, video_inputs = process_vision_info(messages)
inputs = processor(text=[text], images=image_inputs, return_tensors="pt")
# 1024×1024 图 → ~256 个 visual token（原来固定分辨率只有 64 个）
```

### 案例 2：长视频理解（20+ 分钟）

```python
messages = [{
    "role": "user",
    "content": [
        {
            "type": "video",
            "video": "file://lecture.mp4",
            "max_pixels": 360 * 420,   # 控制每帧分辨率，平衡质量与 token 数
            "fps": 1.0,                 # 每秒 1 帧，20 分钟 = 1200 帧
        },
        {"type": "text", "text": "这堂课的核心论点是什么？在哪个时间点提出的？"},
    ],
}]
# M-RoPE 能区分「第 300 帧的第 5 行第 3 列」和「第 600 帧的第 5 行第 3 列」
# 1D RoPE 无法区分这两个位置
```

### 案例 3：M-RoPE 的三维位置编码示意

```python
# 伪代码：不同模态下的 RoPE 分量使用
def get_position_ids(input_type, seq_len, frame_ids=None, row_ids=None, col_ids=None):
    if input_type == "text":
        # 1D：只有序列位置
        return {"temporal": seq_positions, "row": 0, "col": 0}
    elif input_type == "image":
        # 2D：时间固定为 0，行列是 patch 坐标
        return {"temporal": 0, "row": row_ids, "col": col_ids}
    elif input_type == "video":
        # 3D：帧索引 + 行列坐标
        return {"temporal": frame_ids, "row": row_ids, "col": col_ids}

# 三个分量各占 RoPE 频段的 1/3，不互相干扰
# LLM 通过不同频段的 attention pattern 区分「时序位置」和「空间位置」
```

## 踩过的坑

1. **动态 token 数导致 batch 处理复杂**：不同分辨率的图产生不同数量的 token，传统的 padding 会浪费大量算力；Qwen2-VL 使用动态 batch packing（不同样本 token 拼成一条序列），实现困难，对工程要求高，社区复现时常常这里出问题。

2. **高分辨率 token 数量爆炸的推理成本**：1024×1024 的图产生 256 个 visual token，4 倍于固定 224×224 的 64 个；KV cache 相应增长 4 倍——精度提升和推理速度之间的权衡在生产部署时需要仔细平衡 `max_pixels` 参数。

3. **M-RoPE 的长视频位置编码上限**：论文使用绝对位置编码，帧数超过训练时的最大帧数（约 24000 帧 / 约 3 小时@8fps）后，位置编码外推会降级——超长视频仍然是系统瓶颈。

4. **ViT 解冻训练引入不稳定**：Qwen2-VL 不冻结 ViT，端到端微调——相比 LLaVA 类冻结 encoder 方案，训练更不稳定，learning rate 需要对 ViT 和 LLM 分别设置，否则 ViT 容易发生灾难性遗忘。

## 适用 vs 不适用场景

**适用**：
- 高分辨率图像理解（文档 / OCR / 表格 / 密集文字）——动态分辨率的最大受益场景
- 长视频问答（20 分钟内）——M-RoPE 在同类模型里长视频能力最强
- 多任务统一部署——2B / 8B / 72B 三档都在同一套框架里，可按算力选配

**不适用**：
- 极长视频（>3 小时）——位置编码外推问题未解决
- 对推理延迟敏感的实时场景——动态分辨率高分辨率图推理慢
- 资源极度受限设备——2B 最小档在移动端也需要一定内存

## 历史小故事（可跳过）

- **2024-09-18**：Qwen2-VL 上传 arXiv，前作 Qwen-VL 2023 年已有较强图像理解；Qwen2-VL 是视频侧的重大升级
- **2024 Q4**：Qwen2-VL-72B 在 OpenVLM Leaderboard 上短暂排名第一，首次让开源模型在多模态综合 benchmark 上正面比肩 GPT-4o
- **2025 初**：续作 Qwen2.5-VL 发布，增强了文档解析和视觉推理能力，M-RoPE 系列持续演进

## 学到什么

1. **「固定分辨率」是多模态模型设计里被接受太久的错误约束**：Qwen2-VL 的 NDR 让每个视觉任务用自己需要的分辨率，这才是正确的——就像语言模型不强制所有句子等长
2. **位置编码是视频理解的核心基础设施**：M-RoPE 才把「第 5 帧的第 3 行」和「第 3 帧的第 5 行」区分开；没有正确的时空位置编码，无论帧数多少，模型都只是在猜
3. **端到端微调 ViT 比冻结 ViT 带来更高上界，但代价是训练稳定性**：Qwen2-VL 选择解冻，并承担了相应的工程复杂度；这不是所有场景都值得——VideoPrism 坚持冻结并同样拿到 SOTA
4. **工业级开源模型正在重新定义「可接触」的性能上界**：Qwen2-VL-72B 与 GPT-4o 的差距缩到误差范围内，意味着视频理解的工业基线已经在开源社区可得

## 延伸阅读

- 论文 PDF：[arXiv 2409.12191](https://arxiv.org/abs/2409.12191)
- 官方代码：[QwenLM/Qwen2-VL](https://github.com/QwenLM/Qwen2-VL)
- HuggingFace 模型：[Qwen/Qwen2-VL-7B-Instruct](https://huggingface.co/Qwen/Qwen2-VL-7B-Instruct)
- [[video-llava-2024]] —— 同样做图像/视频统一，但用 ABP 方案；与 Qwen2-VL 的 M-RoPE 方案形成对照
- [[vid-llm-survey-2023]] —— 视频理解领域全景综述；Qwen2-VL 是综述后的工业代表作

## 关联

- [[llava]] —— LLaVA 范式的工业延伸；Qwen2-VL 在 LLaVA 「视觉 encoder → connector → LLM」骨架上加了动态分辨率和 M-RoPE
- [[clip]] —— Qwen2-VL 的 ViT 初始化来自 CLIP 系列；但它解冻了 ViT，与 CLIP 的冻结用法不同
- [[video-llava-2024]] —— 同期统一视觉范式的代表；Video-LLaVA 用 ABP + MLP，Qwen2-VL 用 NDR + M-RoPE + 解冻 ViT
- [[videoprism-2024]] —— 对照：冻结 encoder 的 SOTA；Qwen2-VL 解冻，两条路在 2024 年都有 SOTA
- [[vid-llm-survey-2023]] —— 综述的终点；Qwen2-VL 的发布时间（2024-09）比综述（2023-12）晚近 1 年，代表了这一波演进的工业顶峰
- [[long-video-retrieval-2023]] —— 长视频问题的学术解法；Qwen2-VL 靠 M-RoPE + 长训练覆盖工程解法
- [[tempcompass-2024]] —— M-RoPE 设计动机之一来自此类时序 benchmark
- [[videochat-2023]] —— 对话式 Video-LLM 开山；Qwen2-VL 是工业延伸
- [[video-llama-2023]] —— 音视频路线对照；Qwen2-VL 2.1 系列亦接 Qwen2 后端
- [[lmms-eval]] —— 论文榜单数字的常用复现框架
- [[videollama2]] —— 国内竞品；VideoLLaMA2.1 同样采用 Qwen2 作 LLM
- [[internvideo]] —— 视频 encoder 预训练路线的工业对照
- [[video-understanding]] —— 专题枢纽

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[2d-tan-2019]] —— 2D-TAN — 用二维时间图做自然语言时刻检索
- [[chapter-llama-2025]] —— Chapter-Llama — 语音引导采帧，一小时视频一次前向切章节
- [[chat-univi-2023]] —— Chat-UniVi — 动态视觉 token 统一图像与视频对话
- [[clip]] —— CLIP — Contrastive Language-Image Pre-training
- [[countervqa-2025]] —— CounterVQA — 因果图驱动的反事实视频 VQA
- [[cover-2025]] —— COVER — 四象限反事实视频推理 benchmark
- [[dense360-2025]] —— Dense360 — 全景 ERP 密集理解与 ERP-RoPE
- [[egoschema-2023]] —— EgoSchema — 三分钟第一视角长视频理解的诊断探针
- [[flash-vstream-2024]] —— Flash-VStream — STAR 双进程记忆的低延迟长流理解
- [[gemini-1.5-2024]] —— Gemini 1.5 — 百万 token 多模态长上下文
- [[instant-ngp-2022]] —— Instant-NGP — 秒级训练 NeRF 的多分辨率哈希编码
- [[internvideo]] —— InternVideo — 上海 AI Lab 视频基础模型套件
- [[internvideo2-2024]] —— InternVideo2 — 三阶段渐进训练，把视频基础模型扩到 6B
- [[internvideo2-5-2025]] —— InternVideo2.5 — 长富上下文 + HiCo 层次压缩
- [[internvl-2023]] —— InternVL — 6B 视觉基座 + QLLaMA 对齐开源多模态
- [[livevlm-2025]] —— LiveVLM — 免训练流式视觉 token 压缩
- [[llava]] —— LLaVA — 开源多模态对话模型
- [[llava-next]] —— LLaVA-NeXT — 图像/视频/交织统一多模态主线仓库
- [[llava-onevision-2024]] —— LLaVA-OneVision — 单图、多图、视频一个模型全搞定
- [[llava-video-2024]] —— LLaVA-Video — LLaVA-NeXT 视频主线，合成数据 + SlowFast 采帧
- [[llmvs-2025]] —— LLMVS — 用 LLM 语义裁判给视频帧打分做摘要
- [[lmms-eval]] —— LMMs-Eval — 多模态大模型统一评测框架
- [[long-video-retrieval-2023]] —— R-VLM — 长视频不靠均匀采帧，靠可学习检索选片段
- [[longva-2024]] —— LongVA — 把语言模型的长上下文能力「搬」到视频上
- [[longvideobench-2024]] —— LongVideoBench — 一小时交织字幕视频的长上下文理解考卷
- [[longvila-2024]] —— LongVILA — 把 VILA 从 8 帧扩到 2048 帧的长视频全栈方案
- [[lvbench-2024]] —— LVBench — 平均 68 分钟、六维能力的长视频极限考
- [[minicpm-v-2024]] —— MiniCPM-V — 手机能跑的 GPT-4V 级多模态模型
- [[mllm-benchmark-survey-2024]] —— MLLM Benchmark Survey — 200+ 多模态评测基准地图
- [[mlvu-2024]] —— MLVU — 九类任务、多时长分层的长视频理解大考
- [[mme-benchmark-2023]] —— MME Benchmark — 开源 MLLM 评测的事实起点
- [[mme-survey-2024]] —— MME-Survey — 多模态 LLM 怎么评才靠谱
- [[moviechat-2024]] —— MovieChat — 从稠密帧到稀疏记忆，小时级电影也能聊
- [[mplug-owl-2023]] —— mPLUG-Owl — 模块化拼装多模态大模型
- [[nvila-2024]] —— NVILA — 先放大分辨率再压缩 token 的高效 VLM
- [[omagent-2024]] —— OmAgent — 长视频分治 Agent 与回退检索
- [[omnidirectional-mllm-2025]] —— 全景空间推理 — MLLM 准备好面对 360° 了吗
- [[qwen2-5-vl-2025]] —— Qwen2.5-VL — 绝对时间编码 + 动态分辨率，小时级视频原生理解
- [[sharegpt4video-2024]] —— ShareGPT4Video — 用 GPT-4V 级密集字幕，喂饱视频理解与生成
- [[siglip-2023]] —— SigLIP — 用 Sigmoid 损失训练图文对齐
- [[ta-stvg-2025]] —— TA-STVG — 解耦「找谁 / 何时 / 何地」的时空视频定位
- [[tempcompass-2024]] —— TempCompass — 专门拆穿 Video LLM 有没有真懂时间
- [[timechat-2024]] —— TimeChat — 带时间戳的多轮视频助手，长视频也能精确定位
- [[transformers-video]] —— Transformers Video — HuggingFace 视频处理器与多模态输入管线
- [[vid-llm-survey-2023]] —— Vid-LLM Survey — 用大语言模型理解视频的全景地图
- [[video-llama-2023]] —— Video-LLaMA — 把音频和视频同时塞进大语言模型
- [[video-llava-2024]] —— Video-LLaVA — 投影之前先对齐，图像和视频共用一个 LLM
- [[videoagent-longform-2024]] —— VideoAgent (Wang) — LLM Agent 迭代选帧理解长视频
- [[videoagent-memory-2024]] —— VideoAgent（Fan）— 双记忆 + 四工具，长视频逼近 Gemini
- [[videochat-2023]] —— VideoChat — 把视频、指令微调、多轮对话第一次放进同一个系统
- [[videochat-flash-2025]] —— VideoChat-Flash — 分层压缩，让长视频理解又快又准
- [[videochat2]] —— VideoChat2 — OpenGVLab 三阶段训练 Video-LLM 官方实现
- [[videollama2]] —— VideoLLaMA2 — 阿里达摩院音视频 Video-LLM 可运行实现
- [[videollama2-2024]] —— VideoLLaMA 2 — 时空卷积连接器 + 音视频联合理解
- [[videollama3]] —— VideoLLaMA3 — 阿里达摩院第三代图像/视频多模态基座
- [[videollama3-2025]] —— VideoLLaMA 3 — 动态分辨率视觉编码 + 视频 token 压缩
- [[videollm-online-2024]] —— VideoLLM-online — 流式视频对话的 LIVE 框架
- [[videomme-2024]] —— Video-MME — 视频多模态大模型的「高考卷」
- [[videoprism-2024]] —— VideoPrism — 冻结一个模型就能搞定所有视频理解任务
- [[vidstg-2020]] —— VidSTG — 用自然语言在长视频里框出「谁在何时何地」
- [[vinoground-2024]] —— Vinoground — 时序反事实短视频探针
- [[vllm-multimodal]] —— vLLM Multimodal — 多模态与视频 URL 高吞吐推理服务
- [[vsi-bench-2024]] —— VSI-Bench — 用室内漫游视频考视频大模型的空间智商

