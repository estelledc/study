---
title: VideoMLA — 给长视频生成压缩 KV 缓存
来源: 'Hidir Yesiltepe, Jiazhen Hu, Tuna Han Salih Meral, Adil Kaan Akan, Kaan Oktay, Hoda Eldardiry, Pinar Yanardag, "VideoMLA: Low-Rank Latent KV Cache for Minute-Scale Autoregressive Video Diffusion", arXiv 2026'
日期: 2026-05-28
分类: machine-learning
难度: 中级
---

## 是什么

VideoMLA 是一篇研究**怎么让自回归视频扩散模型少存 KV cache** 的论文。日常类比：像搬家时不把每本书原封不动塞进车里，而是先按主题装进几箱，再另外贴一张“每箱在哪个房间”的位置标签。

这里的“书”就是每个视频 token 在注意力层里留下的 key 和 value。普通做法会为 12 个 head 都存完整 K/V；VideoMLA 改成存一个共享的内容 latent，再单独存一个共享的 3D-RoPE 位置 key。

论文的核心数字很直接：在 Wan2.1-T2V-1.3B 上，每个 token 每层缓存从 3072 个标量降到 224 个标量，也就是减少 92.7%。模型仍然能生成 30 秒、60 秒长视频，并在单张 B200 上把吞吐提高到 1.23 倍。

最值得记住的一句话：VideoMLA 不是“发现视频注意力天然低秩”，而是“强行给缓存一个低秩预算，然后训练模型学会在这个预算里工作”。

## 为什么重要

不理解 VideoMLA，下面这些事会很难解释：

- 为什么长视频生成会被 KV cache 卡住：窗口大小可以固定，但每个 token 每层仍然要存很多 head 的 K/V。
- 为什么“滑动窗口”不是终点：它只限制存多少个 token，没有降低每个 token 的存储单价。
- 为什么 LLM 里的 MLA 不能照搬成一句“低秩压缩”：视频扩散的预训练 K/V 谱并不低秩。
- 为什么吞吐提升和显存节省会同时出现：少读写 cache，不只是少占内存，也减少推理时的内存带宽压力。
- 为什么“保持画面会动”很关键：过度压缩可能让视频变静态，指标好看但体验变差。

## 核心要点

1. **把每个 token 的 K/V 装进一个共享 latent**。类比：多位老师原来各自保管一份学生档案，现在改成保管一份公共档案，需要时再按老师视角展开。VideoMLA 用 $c^{KV}$ 同时服务所有 attention head。

2. **把内容和位置拆开存**。类比：包裹里放商品，快递单上放地址；商品可以压缩装箱，地址要能随时重贴。内容 latent 不带 RoPE，位置用 head-shared 的 3D-RoPE key 单独处理。

3. **低秩不是前提，而是预算**。类比：不是因为行李本来只有一个小箱子，而是你规定只能带一个小箱子，于是重新学会取舍。论文发现 Wan 的 dense K/V 并不低秩，但训练后的 VideoMLA 会几乎用满给定的 rank budget。

## 实践案例

### 案例 1：看懂缓存从 3072 到 224

```python
heads = 12
head_dim = 128
d_c = 192
d_rope = 32

dense = 2 * heads * head_dim
videomla = d_c + d_rope
print(dense, videomla, 1 - videomla / dense)
```

**逐部分解释**：

- `dense` 是普通 MHA：每个 head 都要存 key 和 value，所以是 `2 * heads * head_dim`。
- `videomla` 是 VideoMLA：内容 latent 占 192，位置 key 占 32。
- 最后一行会得到约 92.7% 的减少，这就是论文最醒目的内存数字。

### 案例 2：为什么位置 key 要单独存

```python
cache_token = {
    "content": "c_kv",      # 不带绝对位置，适合长期缓存
    "position": "k_rope",   # 使用窗口坐标时再旋转
}
```

**逐部分解释**：

- `content` 像 token 的语义摘要，负责“画面里有什么”。
- `position` 像时间和空间坐标，负责“它在第几帧、第几块区域”。
- 长视频滚动生成时，旧 token 会进入新的局部窗口；位置如果提前写死，重排窗口会更麻烦。

### 案例 3：推理时不把 latent 展开回大 K/V

```python
def content_score(q_latent, kv_latent, A_head):
    return q_latent @ A_head @ kv_latent
```

**逐部分解释**：

- 训练时可以把 latent 展开成每个 head 的 K/V，方便复用标准注意力写法。
- 推理时如果真的展开，就会把省下来的显存带宽又花回去。
- 论文把若干线性层预先合并成 `A_head`，直接在 latent 上算内容分数。

## 踩过的坑

1. **把 VideoMLA 理解成 SVD 近似**：原因是论文反而证明 dense K/V 的 99% 能量 rank 超过 1300，远高于默认 $d_c=192$。

2. **只盯 92.7% 忽略质量预算**：原因是 $d_c=64$ 虽然更省，但会丢细节，压缩比例不能无限追高。

3. **以为 RoPE 位置也能一起压进内容 latent**：原因是长视频滑动窗口要重新编号位置，未旋转的位置 key 更适合复用。

4. **把 LongSANA 这类线性注意力当成同一种改法**：原因是它们改注意力机制或全局状态，VideoMLA 改的是每个 cached token 的 K/V 布局。

## 适用 vs 不适用场景

**适用**：

- 自回归、流式、长视频扩散模型，尤其是生成时需要反复读取历史 token 的场景。
- 已经有滑动窗口 KV cache，但 per-token K/V 成本仍然太高的模型。
- 想在不大改训练管线的前提下，替换 self-attention 内部缓存结构。
- 需要在单卡或固定显存下提高 batch headroom 和吞吐的部署场景。

**不适用**：

- 完全不使用 KV cache 的模型，VideoMLA 的收益点不在这里。
- 对每一帧细节极端敏感、不能接受低维瓶颈取舍的任务。
- 还没有 causal distillation 或 streaming rollout 能力的普通短视频扩散模型。
- 只想解释“预训练权重天然低秩”的研究，VideoMLA 的结论正好不是这个。

## 历史小故事（可跳过）

- **2017 年**：Transformer 把 key/value cache 变成自回归生成里绕不开的工程事实。
- **2024 年**：DeepSeek-V2 把 Multi-Head Latent Attention 用在语言模型里，让共享低维 KV latent 成为可部署方案。
- **2025 年**：CausVid、Self-Forcing、LongLive、Infinity-RoPE 等方法把视频扩散推向流式长视频，但大多仍保留 dense per-head KV。
- **2026 年**：VideoMLA 把 MLA 移到视频扩散，发现视频 K/V 谱并不低秩，却仍能通过训练适配低秩预算。
- **这条线的意义**：长视频生成的瓶颈不只在模型会不会动，还在历史信息能不能便宜地留下来。

## 学到什么

- **缓存也有架构设计空间**：不是只能决定“存多少 token”，还可以决定“每个 token 怎么存”。
- **低秩压缩要区分原因和结果**：VideoMLA 不是从 pretrained spectrum 推出低秩，而是让训练适应低秩瓶颈。
- **内容和位置要分工**：内容适合共享压缩，位置适合保留可重索引的 RoPE 分支。
- **好指标要同时看质量和系统**：VBench、用户偏好、吞吐、延迟、batch headroom 缺一不可。
- **默认配置是一种折中**：$d_c=192$ 和 32 个 RoPE 通道不是数学最优解，而是质量、位置能力、显存收益之间的工程选择。

## 延伸阅读

- 论文 PDF：[VideoMLA: Low-Rank Latent KV Cache for Minute-Scale Autoregressive Video Diffusion](https://arxiv.org/pdf/2605.30351)
- 项目页：[VideoMLA Project Page](https://videomla.github.io)
- [[attention]] —— 先理解 key、value、head，才能看懂 KV cache 为什么贵。
- [[dit]] —— 视频扩散里的 Transformer 骨架，VideoMLA 替换的是其中注意力缓存。
- [[ddpm]] —— 扩散模型的基础直觉，帮助区分“去噪过程”和“自回归缓存”。
- [[open-sora]] —— 开源视频生成生态，适合对照长视频系统工程问题。

## 关联

- [[attention]] —— VideoMLA 直接改 multi-head attention 的 K/V 存储方式。
- [[dit]] —— Wan2.1-T2V-1.3B 属于视频 Diffusion Transformer 路线。
- [[ddpm]] —— VideoMLA 仍服务扩散生成，只是让历史条件更省。
- [[classifier-free-guidance-2022]] —— 论文训练和推理仍涉及 guidance，属于视频扩散常见控制手段。
- [[consistency-models-2023]] —— 4-step sampling 和 distillation 背后是“少步生成”的同一类追求。
- [[blackwell-architecture-2024]] —— B200 上的吞吐和显存结果，需要放回新 GPU 架构背景理解。
- [[clip]] —— CLIP-T / CLIP-F 指标帮助解释文本对齐和帧间相似度的取舍。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
