---
title: VidSTG — 用自然语言在长视频里框出「谁在何时何地」
来源: 'Zhang et al., "Where Does It Exist: Spatio-Temporal Video Grounding for Multi-Form Sentences", CVPR 2020'
日期: 2026-06-05
分类: 机器学习
子分类: 视频理解
难度: 中级
provenance: manual-read
---

## 是什么

VidSTG 是浙江大学等团队在 CVPR 2020 提出的**时空视频定位（STVG）**任务与数据集：给你一段未剪辑的长视频，再给你一句描述某个物体的英文句子（陈述句或疑问句），系统要同时找出**目标在哪些时间段出现**，以及**每一帧里目标在哪个框里**——输出一条「时空管」（spatio-temporal tube）。

日常类比：监控录像有 30 分钟，保安问「穿红衣服的人什么时候进过门？」——你不只要回答「大概第 12 分钟」（时间），还要在画面上用红框标出那个人每一帧的位置（空间）。老方法常先剪出「可能相关的 10 秒」再逐帧找框，像先翻目录再查页码；论文提出的 **STGRN**（Spatio-Temporal Graph Reasoning Network）把视频解析成**区域关系图**，在图上做多步图文推理，再用动态选择直接抽出时空管，省掉「预生成一堆候选管再筛选」的笨重步骤。

论文还从 VidOR 关系视频数据集扩展出 **VidSTG** benchmark：约 10 万句标注、79 类物体、支持陈述句（明确说出「男孩」）和疑问句（只说「谁把球扔了出去」）。

## 为什么重要

不理解 VidSTG / STGRN，下面这些事容易误判：

- 为什么 [[qvhighlights-2021]] 只标时间段、不画框——QVHighlights 做 moment retrieval + highlight detection，**不管空间**；VidSTG 把 VTG 推进到「时间 + 每帧 bbox」联合定位，是空间 grounding 路线的奠基 benchmark
- 为什么「Who kicked the ball?」比「The boy kicked the ball」难很多——疑问句不给出物体外观，只能靠**物体间关系**推理；STGRN 的显式/隐式空间子图就是为这种多形式句子设计的
- 为什么后来 [[spacevllm-2025]] 要把 STVG 和 REC、VTG 塞进同一个 MLLM——VidSTG 首次把**未剪辑视频 + 多形式自然语言 → 时空管**定义成可评测任务，后继统一模型都要在这个榜上对齐
- 为什么 Charades-STA / DiDeMo 高分不等于会画框——那些数据集只做**时间句子定位**；VidSTG 的 vIoU 指标要求帧级框与 GT 重叠，能力维度完全不同

## 核心要点

1. **STVG 双挑战设定**：(1) 目标可能只在长视频的短短几秒内出现，要先找对时间段；(2) 句子分陈述句（有明确主语）和疑问句（主语是 who/what）。类比：前者像「找穿蓝球衣的 7 号」，后者像「谁进的球」——后者必须读场上人与人的互动。

2. **时空区域图（Spatio-Temporal Region Graph）**：每帧用 Faster R-CNN 提 K=20 个区域候选，建三张子图——**隐式空间图**（帧内区域全连接）、**显式空间图**（预测 Visual Genome 式关系谓词）、**时间动态图**（跨帧追踪同一物体轨迹）。类比：帧内是「谁挨着谁」，跨帧是「同一个人从左边走到右边」。

3. **多步跨模态图推理**：文本经 GloVe + 实体注意力得到查询向量，与区域特征在 T=2 层图卷积里反复融合，让语言线索在关系图上传播。疑问句用 who/what 的 embedding 当实体特征，逼模型从关系而非外观定位。

4. **动态选择的时空定位器**：时间分支用多尺度窗口（8 种宽度）预测起止 clip；空间分支不用 tube pre-generation，而是**动态 region selection** 逐帧选框拼成管。对比贪心版 STGRN(Greedy)：动态选择在 vIoU@0.5 上明显更高（论文 Table 2）。

## 实践案例

### 案例 1：VidSTG 标注长什么样

```json
{
  "vid": "00000001",
  "sentence": "The boy in blue throws the ball to a girl.",
  "sentence_type": "declarative",
  "tube": {
    "temporal": [12, 45],
    "spatial_per_frame": {
      "12": [0.21, 0.33, 0.48, 0.91],
      "13": [0.22, 0.35, 0.49, 0.90]
    }
  },
  "triplet_source": ["boy", "throws", "ball"]
}
```

- `temporal`：目标出现的起止帧（视频约 5 fps 采样后索引）
- `spatial_per_frame`：每帧归一化 bbox `[x1,y1,x2,y2]`
- 陈述句直接点名 boy；疑问句版本可能是 `"Who throws the ball to the girl?"`，GT 仍是 boy 的管

### 案例 2：用官方仓库准备数据与评测

```bash
git clone https://github.com/Guaranteer/VidSTG-Dataset
cd VidSTG-Dataset

# 按 README 下载 VidOR 视频与 VidSTG 句子标注
# 需自备 Faster R-CNN 区域特征（论文用 MSCOCO 预训练，每帧 20 proposals）

# 训练 STGRN（实现见论文作者代码仓，特征维 dr=1024→256）
python train_stgrn.py --fps 5 --max_frames 200 --batch_size 16

# 评测：m tIoU / m vIoU / vIoU@0.3 / vIoU@0.5
python eval.py --split val --checkpoint best.pth
```

论文在陈述句上 STGRN 的 m vIoU 约 25.8%、vIoU@0.5 约 14.6%；疑问句更低（m vIoU ~21.1%），复现时需分句型报分。

### 案例 3：读 STVG 指标（论文 Table 2 思路）

```
任务维度          指标           含义
────────────────────────────────────────────────────────────
时间定位          m tIoU         预测时间段与 GT clip 的平均时间 IoU
空间+时间联合     m vIoU         在 GT 与预测重叠帧上，逐帧 bbox IoU 的平均
阈值命中率        vIoU@0.5       vIoU > 0.5 的样本占比（更严的空间对齐）

读法：
  - m tIoU 高、m vIoU 低 → 时间段找对了，但框飘了
  - 疑问句 vIoU@0.5 通常比陈述句低 2–3 个点 → 关系推理仍难
  - 「+ Tem. Gt」消融给真时间段 → 上限空间定位能力，STGRN 约 54% m vIoU
```

## 踩过的坑

1. **把 STVG 当成纯 moment retrieval**：只优化 m tIoU 不训空间分支，vIoU 会接近 0；必须联合时空管监督。

2. **忽略 5 fps + 最长 200 帧采样**：论文实现细节固定；自提特征若帧率不同，时间 clip 与 GT 对不齐。

3. **疑问句和陈述句混报一个数**：Table 2 分开统计；合并平均会掩盖「who/what」推理失败。

4. **照搬 tube pre-generation 基线**：STPR+TALL 等两阶段方法在 VidSTG 上远低于 STGRN；未剪辑视频里预生成管代价高、误差累积。

## 适用 vs 不适用场景

**适用**：
- 研究「自然语言 → 视频中某物体何时出现在哪」的**时空管定位**
- 需要同时评测**时间 IoU 与帧级框 IoU** 的 grounding benchmark（比 [[qvhighlights-2021]] 多空间维）
- 学习**区域关系图 + 跨模态图推理**结构，为 [[spacevllm-2025]] 等统一 MLLM 打基础
- 在 VidOR 关系三元组上扩展语言标注的**数据构建范式**参考

**不适用**：
- 只关心「精彩片段在哪」、不需要画框（用 [[qvhighlights-2021]]）
- 开放域长 vlog 对话式 Video QA（用 [[video-chatgpt-2023]]、[[qwen2-vl-2024]]）
- 毫秒级动作定位或固定动作表 TAD（任务定义不同）
- 无检测框、只有整帧 CLIP 特征的现代端到端 MLLM 零样本对比（协议不同，数字不可直接比）

## 历史小故事（可跳过）

- **2018**：VidOR 发布，提供 1 万段视频的关系三元组与时空管标注，但缺少自然语言查询句
- **2020-01**：arXiv 2001.06891 上传；定义 STVG 任务、STGRN 模型与 VidSTG 数据集
- **2020-06**：CVPR 2020 接收；代码与数据发布于 Guaranteer/VidSTG-Dataset
- **2020–2023**：HC-STVG、STCAT、TubeDETR 等后继在 VidSTG 上刷新 SOTA；任务从短视频 tubes 走向更长视频
- **2025+**：[[spacevllm-2025]] 等把 STVG 纳入统一 Video LLM 评测，VidSTG 仍是经典对照榜

## 学到什么

1. **Grounding 有三层**——答内容（QA）、标时段（VTG/MR）、标时空管（STVG）；VidSTG 把最后一层量化了
2. **关系图是疑问句的关键**——没有显式物体名时，只能靠 who 与谁互动来反推目标
3. **端到端优于两阶段**——先 TALL 剪段再 GroundeR 逐帧，误差叠加；STGRN 联合优化时空
4. **数据集继承关系标注**——站在 VidOR 肩上补语言句，省掉重标 bbox 的成本，是高效 benchmark 设计
5. **读榜要分句型、分指标**——陈述/疑问、m tIoU/m vIoU 分开看，才能定位模型弱在哪

## 延伸阅读

- 论文 PDF：[arXiv 2001.06891](https://arxiv.org/abs/2001.06891)
- 数据集：[Guaranteer/VidSTG-Dataset](https://github.com/Guaranteer/VidSTG-Dataset)
- 基础数据：VidOR（关系视频）、Visual Genome（关系分类器预训练）
- 同期空间 grounding：GroundeR、WSSTG、STPR
- [[qvhighlights-2021]] —— 纯时间 moment + highlight；与 VidSTG 空间维互补
- [[spacevllm-2025]] —— 统一 VTG + REC + STVG 的 MLLM 后继路线

## 关联

- [[qvhighlights-2021]] —— 查询驱动时间定位经典榜；VidSTG 在此基础上加帧级 bbox 与多形式句子
- [[spacevllm-2025]] —— 后继统一模型把 STVG 纳入同一 MLLM；VidSTG 是空间 grounding 前站
- [[2d-tan-2019]] —— 另一支 VTG 路线（二维时间图 moment retrieval）；与 STVG 任务目标不同但常并列阅读
- [[grounded-videollm-2024]] —— Video LLM 时间 token 路线；与 VidSTG 精确管定位形成对照
- [[vid-llm-survey-2023]] —— 综述 VTG / grounding 谱系，含 STVG 任务定义
- [[video-understanding]] —— 专题枢纽；STVG 子路线以 VidSTG 为入口
- [[decord]] —— 自跑 VidOR 原始视频抽帧时的解码工具

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[2d-tan-2019]] —— 2D-TAN — 用二维时间图做自然语言时刻检索
- [[decord]] —— Decord — Video-LLM 数据管线的高效视频解码库
- [[grounded-videollm-2024]] —— Grounded-VideoLLM — 双流编码 + 时间 token，把「何时发生」写进 Video LLM
- [[omnistvg-2025]] —— OmniSTVG — 按句子把视频里所有相关物体都框出来
- [[qvhighlights-2021]] —— QVHighlights — 用自然语言查询在视频里找精彩瞬间
- [[qwen2-vl-2024]] —— Qwen2-VL — 动态分辨率 + M-RoPE，工业级视频理解的里程碑
- [[spacevllm-2025]] —— SpaceVLLM — 一个 MLLM 同时做时序定位、图像指代与时空管定位
- [[ta-stvg-2025]] —— TA-STVG — 解耦「找谁 / 何时 / 何地」的时空视频定位
- [[uvtg-mllm-2025]] —— UniTime — 生成式 MLLM 做通用视频时序定位
- [[vid-llm-survey-2023]] —— Vid-LLM Survey — 用大语言模型理解视频的全景地图
- [[video-chatgpt-2023]] —— Video-ChatGPT — 让大语言模型看懂视频并聊起来

