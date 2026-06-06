---
title: TimeMarker — 时间分隔符 + 任意长度采帧的视频定位大模型
来源: 'Chen et al., "TimeMarker: A Versatile Video-LLM for Long and Short Video Understanding with Superior Temporal Localization Ability", arXiv 2024'
日期: 2026-06-05
分类: 机器学习
子分类: 视频理解
难度: 中级
provenance: manual-read
---

## 是什么

TimeMarker 是 2024 年 11 月发布的**时间定位导向 Video-LLM**：在 [[llava]] 式「ViT 编码 + MLP 投影 + LLM」骨架上，用两样东西把「第几秒发生了什么」说清楚——**Temporal Separator Token（时间分隔符）** 和 **AnyLength 采帧机制**。

日常类比：以前的 Video LLM 像只会讲故事的解说——「这段视频里有人做饭、有人切菜」，但说不清「切菜在第 42 秒」。TimeMarker 像带书签的录像回放——每一帧画面前面都插一张写着 `Second{42.0}` 的小标签，LLM 读标签就能指着时间轴回答「从 40 秒到 55 秒在切洋葱」。AnyLength 则像智能快进：短视频多采帧、长视频少采帧并合并 token，同一条模型既能看 10 秒短片，也能啃 2 小时纪录片。

底座是 CLIP-ViT-L/336 + 两层 MLP 投影器 + LLama3-8B；最多采 128 帧（SFT 阶段），训练视频从不到 1 分钟到 126 分钟不等。

## 为什么重要

不理解 TimeMarker，下面这些事容易误判：

- 为什么 [[timechat-2024]] 和 TimeMarker 都强调「绝对秒数」却路线不同——TimeChat 在 Q-Former 里绑时间戳；TimeMarker 用纯文本 `Second{i}` 插在帧 token 前，**即插即用**、不必重训对齐模块
- 为什么 [[vtimellm-2023]] 用离散帧号 `from 18 to 35` 而 TimeMarker 直接报秒——前者是 100 帧均匀网格；后者每帧带真实采样秒数，长短视频尺度更一致
- 为什么固定 8/32 帧的 Video-LLaVA 在长片上 VTG 挂零——短视频需要高 FPS 保细节，长视频需要压 token 防爆显存；AnyLength 按片长动态调两者
- 为什么 Video LLM 能在 Charades-STA **零样本**超过专用 DETR 模型——TimeMarker 把动作检测、时序定位、摘要等标注全转成带 `Second{}` 格式的 QA，统一教 LLM「搜+定位」

## 核心要点

1. **Temporal Separator Token（时间分隔符）**：每采一帧，先在 LLM 输入里放文本 `Second{2.0}`，再接该帧的视觉 token，序列形如 `Second{2.0}||V_2||Second{5.0}||V_5||…`。训练数据里所有时间表达也统一成同一格式。类比：不是给画面贴隐形水印，而是在每张照片前大声报出「这是第几秒拍的」——LLM 直接读文字，不必额外学一套时间 embedding 对齐。

2. **AnyLength 动态采帧**：短视频（<8 秒）用 2 FPS 多抓细节；长视频按 `sample_fps = 1/⌈duration/max_frames⌉` 控制总帧数不超过上限（PT2 最多 64 帧，SFT 最多 128 帧）。类比：拍延时摄影——短片每秒多拍几张，长片拉长快门间隔，底片总数仍装进同一本相册。

3. **Adaptive Token Merge（自适应 token 合并）**：每帧经 ViT+投影后得到 h×w 特征图，再按**已采帧总数**对空间维做平均池化：帧越多，池化核越大（2×2 起步，超阈值升到 4×4）。长片每帧 token 更少，短片保留更多空间细节。类比：远景照片缩略图小、近景照片高清——同一段旅程，远近镜头用不同压缩比。

4. **时序任务数据统一转 QA**：除常规字幕/QA 外，把时序动作检测、分割、视频摘要、Temporal Sentence Grounding 的标注用规则 + GPT-4o 改写成对话式 QA，约 500 万视频对 + 8500 万图像 + 1200 万多图交错数据。三阶段训练：PT1 对齐、PT2 全参知识、SFT 指令跟随。

## 实践案例

### 案例 1：时间分隔符在 prompt 里长什么样

论文 Figure 3 的输入序列（概念化）：

```
<用户问题> When does the woman start applying lipstick?

<视频 token 流>
Second{0.0} || [frame_0_visual_tokens] ||
Second{3.5} || [frame_1_visual_tokens] ||
Second{7.0} || [frame_2_visual_tokens] ||
...
Second{42.0} || [frame_k_visual_tokens] || ...

<模型回答> The woman starts applying lipstick from Second{40.0} to Second{55.0}.
```

- `Second{i}` 是**普通文本 token**，不是额外 embedding 层；与训练答案里的时间写法一致
- 消融 **TimeMarker-wo-sep**（去掉分隔符）：Charades-STA R@1 IoU=0.7 从 26.9% 跌到 20.6%——绝对时间锚点不可替代
- 与 [[vtimellm-2023]] 的 `from 18 to 35` 帧号不同，TimeMarker 输出可直接对照真实秒数

### 案例 2：AnyLength 采帧与 token 合并

```python
# 概念伪代码，对应论文 §3.3 Algorithm 1
def anylength_sample(duration_sec, max_frames=128):
    if duration_sec < 8:
        sample_fps = 2.0          # 短片：每秒 2 帧，保细节
    else:
        sample_fps = 1.0 / math.ceil(duration_sec / max_frames)
    frame_times = []
    t = 0.0
    while t < duration_sec and len(frame_times) < max_frames:
        frame_times.append(t)
        t += 1.0 / sample_fps
    return frame_times

def adaptive_merge_kernel(num_frames, max_frames):
    base = 2
    if num_frames > max_frames / 2:
        return base * 2, base * 2   # 高×宽都 4×4 池化
    if num_frames > max_frames / 4:
        return base * 2, base        # 仅高度 4×2
    return base, base                # 2×2，短片保留更多 token

# 10 秒视频 → 约 20 帧，小池化核
# 90 分钟视频 → 128 帧上限，大池化核 + 低 FPS
```

读法：两个旋钮联动——帧数多 → 每帧 token 少；帧数少 → 每帧 token 多。总 context 占用大致可控。

### 案例 3：读 VTG 主榜数字（论文 Table 3）

```
任务 / 模型              Charades-STA R@1@0.5   ActivityNet R@1@0.5   备注
─────────────────────────────────────────────────────────────────────────
UniVTG（专用 FS）              60.2%                  —              全监督检测头
VTimeLLM-7B（VLM）             34.3%                 29.5%            三阶段边界感知
TimeMarker-8B（VLM）           51.9%                 50.7%            Charades 零样本
TimeMarker-wo-sep              38.x%（估）            下降明显          无分隔符消融

读法：TimeMarker 在 Charades 上未用该集 grounding 标注训练，仍超 [[vtimellm-2023]] 约 17 个点；
ActivityNet 平均 3 分钟片长，R@0.7 达 33.0%，说明 AnyLength + 分隔符对中长片也有效。
```

长视频理解榜（MLVU 49.2、LongVideoBench 56.3、LVBench 41.3）与短视频榜（VideoVista 78.4、MVBench 67.4）并列 SOTA 梯队，说明机制不只服务 VTG。

## 踩过的坑

1. **把 `Second{42}` 当成特殊词表 token**：它是普通文本拼进 prompt，tokenizer 会拆成子词；复现时别单独加 embedding 行。

2. **固定 FPS 复现 AnyLength**：论文按 `duration` 和 `max_frames` 动态算 `sample_fps`；写死 1 FPS 会在 <8 秒短片上丢细节、在长片上 OOM。

3. **忽略 Adaptive Merge 与采帧联动**：只减帧数不加大池化核，128 帧长片仍可能撑爆 8B context；两处要一起调。

4. **用 Charades 微调数据训练却称零样本**：论文强调 Charades-STA 评测时**未用其 grounding 标注**；若你微调进了 Charades GT，不能对标论文 zero-shot 数字。

## 适用 vs 不适用场景

**适用**：
- 需要 **Video LLM 同时做对话 + 秒级 temporal grounding**（「跳转到涂口红那段」）
- 研究 **文本时间锚点 vs Q-Former 时间戳 vs 帧号** 三种路线的取舍（对照 [[timechat-2024]]、[[vtimellm-2023]]）
- 一条模型覆盖 **秒级短片到 2 小时长片**，不想维护「短视频模型 + 长视频模型」两套管线
- 想把动作检测、摘要、VTG 等**异构时序标注**统一成 LLM 可学的 QA 格式
- 在 Charades-STA / ActivityNet Captions 上做 **生成式零样本 VTG** 基线

**不适用**：
- 只要 2 秒粒度的 MR/HD 刷榜（用 [[qvhighlights-2021]] + Moment-DETR 更对口）
- 毫秒级直播流式定位（128 帧上限 + 自回归延迟高）
- 边缘无 GPU 部署（8B LLM + 最多 128 帧 ViT 仍重）
- 纯时序概念推理不定位区间（用 [[tempcompass-2024]] 专测方向/速度等维度）

## 历史小故事（可跳过）

- **2024-11-28**：arXiv 2411.18211 上传；同日 GitHub [TimeMarker-LLM/TimeMarker](https://github.com/TimeMarker-LLM/TimeMarker) 开放
- **同期背景**：[[timechat-2024]]（CVPR 2024）已证明帧级时间戳 + 滑动 Q-Former；TimeMarker 走更轻的「文本分隔符 + LLaVA 骨架」路线
- **数据巧思**：仅 ~5M 视频对却覆盖 126 分钟最长片；88% 训练片 <3 分钟，靠 AnyLength 迁移到长片榜
- **VTG 零样本里程碑**：Charades-STA R@1@0.3 达 73.5%，论文称首次让 Video-LLM 超过部分全监督 FS 模型
- **2025+**：Qwen2-VL、VideoChat-Flash 等继续卷长视频；TimeMarker 的分隔符思路被后续工作当作可插拔时间模块引用

## 学到什么

1. **绝对时间可以当「普通中文/英文」教给 LLM**——`Second{i}` 文本锚点比隐式 temporal embedding 更可解释、可验证，消融掉就掉 6+ 点 R@0.7
2. **长短视频不能共用同一采帧策略**——固定 8 帧牺牲长片，固定 128 帧浪费短片；AnyLength 是「时长感知」的工程答案
3. **VTG 监督可以藏在 QA 里**——不必只为 LLM 另训 DETR 头；把 TAD/TVG/摘要标注改写成带时间格式的对话，零样本也能逼近专用模型
4. **即插即用的时间模块有价值**——分隔符不改 ViT/投影器结构，比重做 Q-Former 更容易迁到其他 Video-LLM
5. **长视频理解与时刻定位可以一条模型兼顾**——MLVU 与 Charades 同时前列，说明「会定位」不必然牺牲「会聊天」

## 延伸阅读

- 论文 PDF：[arXiv 2411.18211](https://arxiv.org/abs/2411.18211)
- 官方代码：[TimeMarker-LLM/TimeMarker](https://github.com/TimeMarker-LLM/TimeMarker)
- 长视频评测：MLVU、LVBench、LongVideoBench（论文 Table 2）
- VTG 评测：Charades-STA、ActivityNet Captions（论文 Table 3）
- [[vid-llm-survey-2023]] —— Video LLM 综述里时间感知与 VTG 章节
- [[univtg-2023]] —— 专用统一 VTG 检测头；与 TimeMarker 生成式路线对照

## 关联

- [[timechat-2024]] —— 并列路线：TimeChat 在 Q-Former 绑帧级时间戳 + 滑动压缩；TimeMarker 用文本分隔符 + AnyLength，骨架更贴近 LLaVA
- [[vtimellm-2023]] —— 前驱边界感知 Video LLM；离散帧号 `from s to e` vs TimeMarker 的 `Second{}` 秒级锚点，VTG 榜可直接比
- [[llava]] —— TimeMarker 沿用 ViT + MLP 投影 + LLM 三件套；PT1 用 LAION 等图像对做对齐
- [[qvhighlights-2021]] —— 专用 moment retrieval 榜；TimeMarker 走生成式 VTG，任务相近、指标协议不同
- [[tempcompass-2024]] —— 时序概念专测；TimeMarker 在 TempCompass 60.4%，强定位不等于全维度时序满分
- [[videomme-2024]] —— 综合 Video LLM 榜；TimeMarker 长短子集均进开源 8B 第一梯队
- [[video-understanding]] —— 专题枢纽；VTG 生成式路线在 TimeChat → TimeMarker 一脉

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[llava]] —— LLaVA — 开源多模态对话模型
- [[qvhighlights-2021]] —— QVHighlights — 用自然语言查询在视频里找精彩瞬间
- [[tempcompass-2024]] —— TempCompass — 专门拆穿 Video LLM 有没有真懂时间
- [[timechat-2024]] —— TimeChat — 带时间戳的多轮视频助手，长视频也能精确定位
- [[univtg-2023]] —— UniVTG — 把视频时刻定位、高光检测、摘要合成一套框架
- [[vid-llm-survey-2023]] —— Vid-LLM Survey — 用大语言模型理解视频的全景地图
- [[videomme-2024]] —— Video-MME — 视频多模态大模型的「高考卷」
- [[vtimellm-2023]] —— VTimeLLM — 让 Video LLM 学会标出事件起止时间

