---
title: InternVideo — 上海 AI Lab 视频基础模型套件
description: OpenGVLab 视频基础模型全栈——InternVideo2 Chat、InternVid 230M 语料、16 个下游 benchmark；与 VideoPrism 对照的工业开源预训练路线
来源: 'https://github.com/OpenGVLab/InternVideo'
日期: 2026-06-05
分类: 机器学习
子分类: 视频理解
难度: 高级
provenance: manual-read
---

## 是什么

**InternVideo** 是上海人工智能实验室 OpenGVLab 的**视频基础模型系列仓库**：从 InternVideo1（生成+判别联合预训练）到 InternVideo2/2.5/3/Next，外加 InternVid 大规模视频-文本数据集，覆盖「预训练 → 下游微调 → Chat 模型 → 评测」全栈。

日常类比：像计算机视觉里的「ImageNet + ResNet 官方实现」合体——不只给权重，还给数据、训练脚本、16 个 benchmark 的评测流程。做 Video-LLM 的人用它当**视频 encoder 天花板**或**预训练数据供应商**。

仓库结构（README 摘要）：

```
InternVideo/
├── InternVideo1/     # 早期视频基础模型
├── InternVideo2/     # 缩放版：1B/6B/8B Chat
├── InternVideo2.5/   # 长上下文视频 MLLM
├── InternVideo3/     # 长程 agent 推理
├── InternVideo-Next/ # 2025 新一代
└── Data/InternVid/   # 230M 视频-文本对
```

## 为什么重要

不理解 InternVideo，工业级视频理解和学术 SOTA 的脉络会断档：

- **与 VideoPrism 的对照轴**：[[videoprism-2024]] 是 Google 闭源式报告 + 开源权重；InternVideo 是中文社区最完整的**可跑通预训练**开源栈
- **数据即壁垒**：InternVid 230M 对、InternVideo2_Vid_Text 标注，是训练 VideoChat / Video-LLaMA 类模型的常用数据源
- **版本迭代快**：2024 InternVideo2-Chat-8B 到 2025 InternVideo-Next，跟踪它能看懂「视频 MLLM 从 encoder 预训练到长上下文 Chat」的演进
- **评测一体**：MODEL_ZOO 对齐 16 个下游 benchmark，和 [[lmms-eval]] 互补

## 核心要点

1. **InternVideo2：生成+判别双目标缩放**：Stage1 大规模视频-文本对比学习，Stage2 接 LLM 做 Chat（8B = 1B video encoder + 7B LLM）。HD 版本支持更高分辨率输入。

2. **InternVid 数据管线**：从 YouTube 等来源清洗的视频-文本对，Full 版 230M 条在 HuggingFace / OpenDataLab 发布——训练自己的 Video-LLM 时最常引用的开源语料之一。

3. **多代共存而非替换**：仓库用子目录保留 InternVideo1/2/2.5/3/Next，方便 ablation 和复现旧论文，而不是 force migrate 到最新版。

## 实践案例

### 案例 1：加载 InternVideo2-Chat-8B 做推理

```python
# 典型路径：从 HuggingFace 拉 checkpoint，按 InternVideo2/ 子目录 README 配置
# 模型卡：OpenGVLab/InternVideo2-Chat-8B
from transformers import AutoModel, AutoTokenizer

model_path = "OpenGVLab/InternVideo2-Chat-8B"
# 具体 API 以 InternVideo2/multi_modality/demo 为准
# 输入：视频路径 + 文本问题 -> 文本回答
```

实际脚本在 `InternVideo2/multi_modality/` 下有 demo；核心是「InternVideo2 encoder 提时空特征 → 投影进 7B LLM → 自回归生成」。

### 案例 2：用 InternVid 子集做预训练

```bash
# 数据在 HuggingFace: OpenGVLab/InternVid-Full 或 InternVideo2_Vid_Text
# 训练脚本见 InternVideo2/single_modality/scripts/
cd InternVideo2/single_modality
# 按 MODEL_ZOO.md 选 1B 配置，准备 json 标注 + 视频路径列表
bash scripts/pretrain.sh configs/internvideo2_base.py
```

预训练阶段不接 LLM，只训 video encoder；之后再接 Stage2 做多模态对话——和 [[blip2-2023]] 两阶段范式类似，但规模在视频域。

### 案例 3：下游 MVBench 评测

```bash
# eval 配置在 InternVideo2/multi_modality/scripts/eval/
# 数据格式对齐 OpenGVLab/MVBench
python eval_mvbench.py --checkpoint path/to/internvideo2_chat.pth
```

仓库内建 MVBench 等评测脚本；也可把 encoder 权重导出到 [[lmms-eval]] 统一跑分，便于和 VideoLLaMA2 横向比。

### 案例 4：decord + InternVideo2 预训练 DataLoader

```python
# InternVideo2/single_modality 数据管线核心：decord 按 clip 采帧
from decord import VideoReader, cpu
import decord

decord.bridge.set_bridge('torch')

def load_clip(video_path, num_frames=8):
    vr = VideoReader(video_path, ctx=cpu(0))
    # InternVideo 预训练常用随机或均匀采帧
    indices = list(range(0, len(vr), max(1, len(vr) // num_frames)))[:num_frames]
    return vr.get_batch(indices)  # 直接 torch.Tensor，进 Stage1 对比学习
```

Stage2 接 LLM 做 Chat 时，同一 decord 采样策略延续到 [[videochat-2023]] / [[video-llava-2024]] 类指令微调——encoder 与下游帧分布一致。

## 与同类对比

| 栈 | 预训练数据 | Chat 模型 | 开源完整度 | 对照论文 |
|---|---|---|---|---|
| **InternVideo** | InternVid 230M | InternVideo2-Chat-8B | 数据+训练+eval 全栈 | [[videoprism-2024]] 工业轴 |
| VideoPrism (Google) | 内部+YouTube | 报告为主 | 权重开源，训练细节少 | [[videoprism-2024]] |
| [[videollama2]] | VideoLLaVA 语料 | 7B/72B 开箱 | 偏 SFT，非 encoder 预训练 | [[video-llama-2023]] |
| [[llava-next]] | LLaVA-Video-178K | OneVision 统一 | 偏指令微调+合成数据 | [[video-llava-2024]] |
| [[qwen2-vl-2024]] | 闭源规模 | Qwen2-VL 工业 | 权重开源，数据不开放 | 工业对标 |

选 **encoder 天花板** 看 InternVideo + VideoPrism；选 **快速对话 demo** 看 VideoLLaMA2 / LLaVA-NeXT。

## 踩过的坑

1. **子目录多、入口分散**：InternVideo1 和 InternVideo2 的 API 不兼容，clone 后先读对应子目录 README，别混用脚本。

2. **视频数据下载量大**：InternVid Full 230M 和预训练视频不是小文件；需要预留存储和按子集（如 10M）试跑。

3. **GPU 显存门槛高**：8B Chat + HD 视频输入，单卡 24G 往往不够，需按 MODEL_ZOO 用梯度检查点或多卡。

4. **与 VideoPrism 指标不可直接比**：训练数据、tokenizer、评测脚本都不同，只能比趋势不能比绝对分数。

## 适用 vs 不适用场景

**适用**：
- 需要 SOTA 级视频 encoder 权重做 Video-LLM 前端
- 复现或改进 InternVideo 系列论文
- 获取大规模视频-文本预训练数据（InternVid）

**不适用**：
- 只想快速对话式 demo（[[videollama2]] / [[llava-next]] 开箱更快）
- 纯图像多模态（用 LLaVA 系列更直接）
- 算力有限的小团队从头预训练（成本极高）
- 需要开箱即用的 Gradio 演示（本仓偏研究与预训练）

## 历史小故事（可跳过）

- **2022-12**：InternVideo 技术报告发布，提出生成+判别联合预训练
- **2023-07**：InternVid 数据集开源，支撑 VideoChat 等指令微调
- **2024-03**：InternVideo2 报告 + HuggingFace checkpoints 发布
- **2025+**：InternVideo2.5 长上下文、InternVideo3 agent、InternVideo-Next 持续迭代

## 学到什么

1. **视频基础模型需要「数据+训练+评测」三位一体**：只开源权重不够，InternVideo 的价值在全套可复现
2. **encoder 代际演进比 LLM 嫁接更慢**：接哪个 7B LLM 可以换，video encoder 的质量决定上限
3. **工业 lab 开源栈是学术对照的重要一极**：和 Google VideoPrism、Meta 路线形成三角参照
4. **数据版本和模型版本要绑在一起读**：InternVid 不同子集对应不同 InternVideo 代际
5. **子目录即代际边界**：换目录前不要假设权重和脚本可混用

## 延伸阅读

- InternVideo2 报告：[arXiv 2403.15377](https://arxiv.org/abs/2403.15377)
- InternVideo-Next 报告：[arXiv 2512.01342](https://arxiv.org/pdf/2512.01342)
- HuggingFace Collection：OpenGVLab/internvideo2
- InternVid 数据：HuggingFace OpenGVLab/InternVid-Full
- [[videoprism-2024]] —— 对照阅读：冻结 encoder 范式的另一巅峰
- [[videochat-2023]] —— 用了 InternVideo 系数据和能力的对话模型
- [视频理解阅读站](/study/stations/video-understanding/) — 工业对标阶段（qwen2-vl / internvideo2）阅读顺序

## 关联

- [[videoprism-2024]] —— 学术对照：视频掩码蒸馏 vs 生成判别联合
- [[videochat-2023]] —— VideoChat 与 InternVideo 数据/能力交叉
- [[video-llava-2024]] —— 同赛道 Video-LLM；encoder 选型对照
- [[video-llama-2023]] —— 音视频 LLM 与 InternVideo encoder 路线对照
- [[qwen2-vl-2024]] —— 工业 Video-LLM 竞品
- [[lmms-eval]] —— 统一评测出口
- [[decord]] —— 预训练数据加载
- [[internvideo2-2024]] —— InternVideo2 论文笔记（项目代码归宿）
- [[videollama2]] —— 同赛道阿里 VideoLLaMA 实现
- [[llava-next]] —— 另一套统一多模态主线
- [[vid-llm-survey-2023]] —— 综述中的工业视频基础模型章节
- [[llava]] —— 图像 LLaVA 范式；InternVideo2 Stage2 嫁接 LLM 同源
- [[clip]] —— 视觉对比学习先驱；InternVideo Stage1 与之同族
- [[blip2-2023]] —— 两阶段预训练范式先驱
- [[long-video-retrieval-2023]] —— 长视频下游任务对照
- [[tempcompass-2024]] —— 下游时序评测可接 InternVideo2-Chat
- [[llava-onevision-2024]] —— 统一 image/video 竞品论文
- [[videochat2]] —— VideoChat2 官方仓（笔记待写，Ask-Anything）
- [[video-understanding]] —— 专题枢纽

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[blip2-2023]] —— BLIP-2 — 用 188M 小桥接器把冻结的视觉模型和大语言模型拼起来
- [[decord]] —— Decord — Video-LLM 数据管线的高效视频解码库
- [[llava-next]] —— LLaVA-NeXT — 图像/视频/交织统一多模态主线仓库
- [[lmms-eval]] —— LMMs-Eval — 多模态大模型统一评测框架
- [[long-video-retrieval-2023]] —— R-VLM — 长视频不靠均匀采帧，靠可学习检索选片段
- [[pytorch]] —— PyTorch — 深度学习主流框架
- [[qwen2-vl-2024]] —— Qwen2-VL — 动态分辨率 + M-RoPE，工业级视频理解的里程碑
- [[tempcompass-2024]] —— TempCompass — 专门拆穿 Video LLM 有没有真懂时间
- [[vid-llm-survey-2023]] —— Vid-LLM Survey — 用大语言模型理解视频的全景地图
- [[videochat-2023]] —— VideoChat — 把视频、指令微调、多轮对话第一次放进同一个系统
- [[videollama2]] —— VideoLLaMA2 — 阿里达摩院音视频 Video-LLM 可运行实现
- [[videoprism-2024]] —— VideoPrism — 冻结一个模型就能搞定所有视频理解任务

