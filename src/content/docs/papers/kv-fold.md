---
title: "KV-Fold — 把 KV cache 当成 fold 的累加器，一段一段读长文"
来源: "Nadali et al., KV-Fold: One-Step KV-Cache Recurrence for Long-Context Inference, arXiv:2605.12471, 2026"
日期: 2026-07-08
分类: LLM 推理
难度: 中级
---

## 是什么

KV-Fold 是一套**不用改模型、不用再训练**的长上下文推理协议：把超长文本切成小段，每段做一次前向，把算出来的 **KV cache**（每层注意力里存下的 Key/Value）当作「累加器」传给下一段。

日常类比：你读一本很厚的书，一次只翻一章；读完把书签和笔记夹在一起交给下一章——下一章开读时，前面的笔记都还在，可以随时翻回去查。这个「带着笔记往下折」的过程，就是函数式编程里的 `foldl`（左折叠）。

它和「把整本书一次性摊开算注意力」不同：整本摊开在超长序列上会把显存撑爆；也和「只留最近几页、旧页撕掉」的滑窗不同：旧笔记还在。论文在 Llama-3.1-8B 上把上下文推到 128K，针在草堆（needle-in-a-haystack）152 次试验全部精确找回，且跑在单张 40GB GPU 上。

一句话抓住边界：**改的是推理循环，不是权重文件**——同一套冻结 Transformer，换一种喂法。

## 为什么重要

不理解 KV-Fold，下面这些事会对不上：

- 为什么「模型宣称支持 128K」不等于「一张卡能一次算完 128K」——完整注意力分数矩阵可能到 TB 级
- 为什么 StreamingLLM 一类滑窗方法显存省、但针一滑出窗口就找不回来
- 为什么可以不改权重、不加 memory token，只改**推理时怎么喂 chunk**
- 为什么 KV cache 不只是 serving 加速器，也可以当成跨段的**循环状态**
- 为什么「困惑度还行」不等于「早先那句密码还找得到」——指标选错会误判方法

## 核心要点

1. **KV 当累加器**：类比记账本——每读完一段，把新 Key/Value 追加到本子末尾，下一段带着整本再算。形式是 `(K_t, V_t) = F_θ((K_{t-1}, V_{t-1}), x_t)`，整段序列就是 `foldl`。当前段的 Query 把历史 KV 当 prefix 来盯，再把自己的 KV 拼进去。

2. **漂移会封顶，不会越滚越大**：类比温水——前几段水温略升，之后稳定在平台。若每跨一段都独立加噪声，误差应随链深线性爬；论文在 Qwen2.5 上看到相对 full attention 的 NLL 漂移约在深度 7 附近饱和，再加深几乎不动。换 bf16/fp32（精度差约 10000×）平台仍在，说明更像「进入另一种稳定注意力工况」，不是舍入误差越积越多。

3. **不压缩、换精确召回**：类比不撕旧笔记——cache 随长度线性涨，旧 token 仍可被内容寻址。相对 StreamingLLM 的有界窗口，KV-Fold 用更多显存换「很早出现的事实仍可精确取回」。作者强调：这是 memory–retrieval 权衡上的另一个点，不是「全面碾压滑窗」。

## 实践案例

### 案例 1：一段一段往前 fold

```python
# 伪代码：冻结模型，只改推理循环
cache = empty_kv()          # 累加器起点
pos = 0
for chunk in split(tokens, C):          # 每段长度 C
    out, new_kv = model.forward(
        chunk,
        past_kv=cache,                  # 前面所有段的 K/V 当 prefix
        position_ids=range(pos, pos+len(chunk)),  # RoPE 位置连续
    )
    cache = concat_kv(cache, new_kv)    # 追加，不丢旧的
    pos += len(chunk)
```

**逐步解释**：

1. 把长序列切成长度 `C` 的 chunk（论文扫过多种 `C`，平台行为对块大小不敏感）
2. 当前段的 Query 盯着「历史 KV + 本段 KV」做注意力
3. 把本段新产生的 K/V 拼进累加器，原样传给下一段（不变换、不压缩）
4. 位置编号按全文绝对下标续上，避免段边界「坐标跳号」

实现时注意：`concat_kv` 是按层拼接，不是把所有层揉成一个张量；每层 ℓ 各自维护自己的 K/V 列表。这和「latent multi-agent 通信」用的 KV 拼接原语是同一类操作，只是这里拼的是**同一模型相邻 chunk**，不是两个 agent。

### 案例 2：针在草堆里还找不找得到

把一句秘密插在第 0 段，后面再叠几百段无关文本，最后提问。论文设定：T∈{16K, 32K, 64K, 96K, 128K}，链深可达 511。KV-Fold 在 Llama-3.1-8B 上 **152/152** 精确匹配；同设定下 StreamingLLM（约 1024 token 窗口）一旦针滑出窗口，召回掉到 0%。

对照实验还放了三条尺子：`full`（一次吃完全文，上限）、`isolated`（每段互不看见，下限）、`kv-fold`（本方法）。优势用 `isolated − kv-fold` 的 NLL 差来量，论文里能补上 isolated→full 鸿沟的大约 89%–94%。

**逐步理解评测**：

1. 先确认针的位置（第几段）
2. 再确认提问落在链末
3. 最后比的是 exact-match 而不是「看起来像」——这才能证明「旧笔记没被撕掉」

### 案例 3：显存账怎么算

128K、深度 511、A100 40GB：单次 full attention 不可行（注意力分数矩阵约 1TB 量级）；KV-Fold 峰值约 35.6GB、约 171s 跑完。代价是 cache 线性涨（论文量级约 0.13KB/token）——比滑窗贵（StreamingLLM 同设定峰值约 16.6GB），但换来长距精确检索。

心算口诀：**分段降低的是「单次注意力工作集」，不是「历史 KV 总量」**；总量仍 roughly ∝ T。若你的卡只剩 20GB 余量，先用公式估 `0.13KB × T × 层数缩放`，不够就别硬上 128K。

## 踩过的坑

1. **以为「分段」等于「省显存到常数」**：KV-Fold 不驱逐旧 token，显存仍随 T 线性涨；要有界内存应看 StreamingLLM 一类，并接受召回损失。
2. **段边界忘了连续 position id**：RoPE 若每段从 0 重开，跨段相对位置全乱，召回会塌。
3. **拿短窗 NLL 当唯一指标**：滑窗可以保持局部困惑度，却丢掉窗口外事实；长距任务要用 needle 类检索指标。
4. **和「改结构的长上下文训练」混为一谈**：KV-Fold 是推理协议，不引入额外 memory 参数，也不微调；别把它当成又一种要重训的架构。
5. **chunk 切太碎只为「看起来很 fold」**：块过小会增加边界次数与调度开销；论文显示平台对块大小稳健，但工程上仍应按 GPU 利用率选 C。

## 适用 vs 不适用

**适用**：

- 冻结模型上要读超长文档 / 日志 / 代码库，且必须**精确**找回早先细节
- 单次 full attention 显存爆、但还能接受线性增长的 KV（例如单卡 40GB 级、T~1e5）
- 想先验证「只改推理循环」是否够用，再决定要不要上压缩或训练方案
- 对照实验需要「保留全部历史 KV」的上界基线时

**不适用**：

- 必须严格有界显存、可牺牲远距召回（用滑窗 / 压缩 KV）
- 已经在做需要改注意力或加记忆模块的训练配方（那是另一条线）
- 序列短到一次 forward 就轻松放下——没必要引入 chunk 边界
- 要在多租户 serving 里把 KV 分页复用到极致——那是 [[paged-attention]] / vLLM 的主场

## 历史小故事（可跳过）

- **2017**：Transformer 用自注意力吃序列，但满注意力随长度二次涨。
- **2019**：Transformer-XL 等探索段间递推，把「跨段状态」写进训练目标。
- **2023 前后**：StreamingLLM 等用 attention sink + 滑窗，换有界显存。
- **同期**：各类 KV 压缩 / 驱逐 / 量化，在「省内存」和「保信息」之间拉扯。
- **Latent multi-agent 工作**：展示「一次 forward 可以盯另一次的 KV 当 prefix」。
- **2026**：Nadali、Cooper、Trivedi、Velasquez（科罗拉多大学博尔德）把该拼接原语收成单模型上的 chunk 级 `foldl`，写成 KV-Fold，并系统测漂移平台与 needle 召回。

## 学到什么

1. **Serving 优化里的状态，可以升格成算法状态**——KV cache 不只是加速缓存。
2. **稳定 ≠ 零误差**：漂移可以饱和成平台，系统仍能精确检索。
3. **取舍要写清坐标轴**：有界内存 ↔ 精确长距召回，KV-Fold 站在后者。
4. **先改协议、再改模型**：训练免费的推理把戏，往往是最便宜的第一刀。
5. **评测要对齐目标**：只看 NLL 会偏爱滑窗；要保事实就得上 needle / 长距 QA。

把这五条收成一句：**长上下文首先是状态怎么传，其次才是模型怎么训。**

## 延伸阅读

- 论文：[arXiv:2605.12471](https://arxiv.org/abs/2605.12471)（方法 + 漂移/needle/显存曲线）
- StreamingLLM（滑窗对照）：Xiao et al., "Efficient Streaming Language Models with Attention Sinks", ICLR 2024
- PG-19 长文基准（论文漂移实验用过）：Rae et al., 2019
- [[paged-attention]] —— 另一条线：把 KV 当虚拟内存页来管，服务吞吐向
- [[transformer-2017]] —— 注意力与 KV 的源头
- [[flash-attention]] —— 单次 forward 里把注意力算快、算省的内核技术
- [[transformer-xl-2019]] —— 更早的段间递推对照

## 关联

- [[paged-attention]] —— 管 KV 布局与碎片；KV-Fold 管跨 chunk 怎么递推
- [[transformer-2017]] —— Decoder 里 K/V 从哪来
- [[flash-attention]] —— 单段 forward 的算力/显存底座
- [[transformer-xl-2019]] —— 更早的「段间递推状态」思路（segment-level recurrence）
- [[rwkv-2023]] —— 用线性状态代替显式 KV 的另一条长序列路线
- [[llama-cpp]] —— 本地推理里也能看到工业级 KV cache 管理代码
- [[flashattention-2]] —— 同族内核优化，决定单 chunk forward 能吃多宽

读完建议顺序：先 [[transformer-2017]] 搞清 K/V，再对照 StreamingLLM 与本笔记的取舍表，最后看 [[paged-attention]] 如何在 serving 侧管同一块内存。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

