---
title: ELECTRA — 把猜词题改成判真假题，训练效率 4 倍
来源: 'Clark et al., "ELECTRA: Pre-training Text Encoders as Discriminators Rather Than Generators", ICLR 2020'
日期: 2026-05-31
分类: NLP
难度: 中级
---

## 是什么

ELECTRA（**Efficiently Learning an Encoder that Classifies Token Replacements Accurately**）是 Stanford × Google 在 2020 年 ICLR 提的一个**改训练目标**的方法。它没动 [[bert]] 的 Transformer encoder，只把 **MLM**（猜被遮的词）换成 **RTD**（判每个词是不是被换过）。

日常类比：

> 老办法是「完形填空」——出题人挖 15% 空，你只为这 15% 个位置写答案。新办法是「找茬」——出题人偷偷把句子里某些词换成相似但不对的词，你要给**每个**位置打勾或打叉。
>
> 同样一段文本，老办法只在约 15% 位置算 loss，新办法覆盖 100% 位置——**训练信号更密**。论文端到端结果是：达到相近下游表现时，算力大约只要 RoBERTa 的 **1/4**（不是把 100/15 直接当成 6 倍加速）。

读懂这两段就读懂了 ELECTRA 的核心：**让训练信号覆盖到每个 token，而不是只在被遮的位置上算 loss**。

## 为什么重要

不理解 ELECTRA，下面这些事都没法解释：

- 为什么 2020 年开始小模型论文都拿 ELECTRA-small 当基线——14M 参数、单卡 4 天，效果接近 GPT-1
- 为什么 [[bert]] / [[roberta-2019]] 时代「想训得好就要堆 GPU」的共识被打破——同等性能 ELECTRA 只要 RoBERTa **1/4 算力**
- 为什么后续 DeBERTa-v3 / NLU 类闭源模型都用 RTD 替代 MLM——它**不是替换 [[bert]]，而是替换 BERT 的训练目标**
- 为什么 GAN 思路在文本预训练里走不通，但 ELECTRA「看似像 GAN」却走通了——里面有一个微妙的「不让梯度回传」的工程决定

引用数 5k+。这是少数几篇「不靠 scale、只换损失函数」就把 SOTA 推前一步的论文。

## 核心要点

ELECTRA 用 **两个网络** 联合训练：

1. **Generator G（小 MLM）**：还是干 BERT 的活——对随机 mask 的 15% 位置预测原词。但 G 故意做小（1/4~1/2 D 的尺寸），它的输出**不是最终模型**，只是用来「造假货」。

2. **Discriminator D（主模型）**：拿 G 输出的句子（有些位置已经被 G 的预测词替换掉），对**每一个 token** 做二分类——「这个词是原文吗？还是被换过？」。这个任务叫 **Replaced Token Detection (RTD)**。

**关键工程细节**：

- 训完只用 D，G 直接扔掉——G 是「陪练」
- G 和 D **共享 embedding 层**（token + position），减参又互利
- 总 loss = `L_MLM(G) + λ · L_RTD(D)`，λ=50（D 的梯度被放大 50 倍才能盖过 G 的 MLM）
- **梯度不在 G 和 D 之间回传**：D 的 loss 不会反向影响 G。文本是离散的，采样不可微，硬通会要 REINFORCE 或 Gumbel-softmax，作者试了发现不稳定，索性砍掉

**为什么 RTD 比 MLM 高效**：

- MLM 只在 15% mask 位置上计 loss，剩下 85% 位置「白训」
- RTD 在 **100%** 位置上计 loss，每个 token 都贡献训练信号
- 这就是 4× 效率提升的来源——不是更聪明，是**不浪费**

## 实践案例

### 案例 1：RTD 在做什么

```
原句：     我  爱  吃  鱼
Mask：     我  爱 [M]  鱼
G 预测：   吃 → "看"（G 不准，给了个错的）
拼回：     我  爱  看  鱼   ← 拿这个去训 D
D 输出：   原  原  替  原   ← D 要判每个位置「真/假」
```

D 必须学会：「我爱看鱼」里「看」放在「爱」和「鱼」之间不太对劲（应该是吃 / 钓 / 养这一类）。这种**细粒度的语义合理性判断**就是 D 学到的能力。

注意 G 的预测有时候**会蒙对**——G 输出「吃」，那这个位置 D 看到的就是原词。这种情况 D 应该判「原」。也就是说 D 看到的「假货」其实只占 G 错预测的那部分，在实际训练里通常 ~85% 位置是原词、~15% 是被替换过的。

### 案例 2：和 BERT MLM 对比

| 维度 | BERT (MLM) | ELECTRA (RTD) |
|---|---|---|
| 训练任务 | 预测 15% 被 mask 词 | 二分类 100% 位置 |
| 每 step loss 算几个位置 | 15% | 100% |
| 模型结构 | 1 个 encoder | G（小） + D（主） |
| 算力效率 | baseline | ~4× |
| 训完用什么 | 整个 encoder | 只用 D |
| 下游用法 | 一样（都是 encoder） | 一样 |

**对下游使用者**完全无感——拿来 fine-tune 跟 BERT 一模一样。差别全在预训练阶段。

### 案例 3：「这不就是 GAN 吗」的辩护

读者第一反应：G 造假、D 鉴假，这就是 GAN。论文专门有一节解释**为什么不是**：

- GAN 的 G 用 D 的 loss 反向更新（对抗训练）
- ELECTRA 的 G 用 **MLE**（最大似然）训练，跟 BERT 的 MLM 一模一样，**完全不看 D 的 loss**
- 真 GAN 在文本上要解决离散采样不可微的问题，ELECTRA 直接绕开

作者实验过「真对抗」版本（用 REINFORCE 让 G 接 D 的反馈），效果反而差。**判别器的存在是为了让 D 拿到密集训练信号，不是为了对抗**。

## 踩过的坑

1. **G 太大反而变差**：直觉上 G 越强、造的假越像，D 学得越多。但实验里 **G 的 size 是 D 的 1/4 时最优**。G 太强，所有「假货」都变成「合理替换」，D 失去判别梯度（全判替换）。这跟 GAN 的「Discriminator 不能太强」是镜像版本的问题。

2. **λ=50 是经验值**：D 的 loss 在数值上比 MLM 小一个数量级，不放大就训不出来。这个 λ 没有理论根据，作者试出来的。换数据集要重试。

3. **共享 embedding 是性能关键**：消融里去掉「embedding 共享」会掉 1.6 分。两个原因——参数省一半 + G 的 MLM 训练同时也在更新这些 embedding，相当于 D 免费蹭到 MLM 的语义信息。

4. **G/D 不能不同 vocabulary**：写实现时容易踩——G 和 D 必须用同一份 tokenizer 同一份 vocab，否则 G 的输出 D 看不懂。HuggingFace 早期 ELECTRA 实现就掉过这个坑。

## 适用 vs 不适用场景

**适用**：

- 算力紧、仍要预训练 encoder：ELECTRA-Small（约 14M 参数、单卡数天）就能接近早期 GPT 的 GLUE 水平
- 下游是分类 / 抽取 / 检索类 NLU（GLUE、SQuAD 等），需要稠密 token 级表征
- 想换训练目标而不是换架构：encoder 仍是 Transformer，fine-tune 用法与 BERT 同类
- 中小规模模型（约 14M–335M）上抠效率；论文 Large 档在更少算力下追平/超过当时 RoBERTa

**不适用**：

- 生成式语言模型（写故事、对话续写）——ELECTRA 是 encoder-only + 判别目标，不是 decoder LM
- 已经有现成大模型、只做推理/轻量 fine-tune，不必自己重训 RTD
- 需要 seq2seq / text-to-text 统一接口时，优先看 T5 一类，而不是 ELECTRA
- 把「像 GAN」理解成必须上对抗训练——论文的稳定配方恰恰是 G 不接 D 的梯度

## 历史小故事（可跳过）

- **2018-10**：[[bert]] 发布，MLM + 双向 encoder + 预训练范式
- **2019-07**：[[roberta-2019]] 用更大数据 + 更久训练把 BERT 推到极限，「scale 派」声势浩大
- **2019-12**：ALBERT / DistilBERT 走「让 BERT 变小」路线，但都在 MLM 框架内
- **2020-03**：**ELECTRA 发布**——不堆 scale、不缩参数，**改训练任务**就把效率提 4 倍
- **2020-06**：DeBERTa-v3（微软）把 ELECTRA 的 RTD + 自己的解耦注意力结合，刷 SuperGLUE
- **2022+**：decoder-only 大模型（LLaMA / GPT-3+）兴起，encoder 路线整体降温。但**做检索 / 分类 embedding** 的领域 ELECTRA 系仍在用
- **2024+**：ModernBERT 等新一代 encoder 论文重新审视训练目标，RTD 仍是候选之一

## 学到什么

1. **训练信号密度比堆机器更值钱**——把 loss 从约 15% 位置扩到 100%，是论文约 4× 算力效率的主因之一；先找浪费再加卡
2. **看似像 GAN 不一定要做 GAN**——G 用 MLE、不接 D 的反馈，就避开离散文本对抗训练的坑；判别器是为了稠密信号
3. **「换损失函数」是被低估的杠杆**——架构不动，MLM → RTD 就能换代际效率（同类思路还有图像 MAE、对比学习）
4. **写消融要把反直觉写出来**——「G 越大反而越差」「真对抗不如假对抗」比单纯刷分更有迁移价值

## 延伸阅读

- 论文 PDF：[ELECTRA arXiv 2003.10555](https://arxiv.org/abs/2003.10555)（17 页，含完整 ablation）
- 官方代码：[google-research/electra](https://github.com/google-research/electra)（TF1，论文同款数值）
- HuggingFace 实现：[transformers ELECTRA](https://github.com/huggingface/transformers/blob/main/src/transformers/models/electra/modeling_electra.py)（PyTorch，G+D 双模块清晰）
- 视频精读：[Yannic Kilcher — ELECTRA Explained](https://www.youtube.com/watch?v=QWu7j1nb_jI)（30 分钟，逐图过 RTD）
- 配套阅读：DeBERTa-v3（把 RTD 升级版）、SpanBERT（另一种「让 mask 更难」的思路）

## 关联

- [[bert]] — ELECTRA 严格在 BERT encoder 之上换损失函数，架构没动
- [[roberta-2019]] — 同期对手，「调训练配方」派，ELECTRA 是「换训练目标」派
- [[mae]] — 把「遮一部分 + 重建」搬到图像，跟 ELECTRA 是同一类「任务设计」论文
- [[xlnet-2019]] — 另一种「改训练目标」的尝试（permutation LM），但工程复杂度比 ELECTRA 高
- [[t5]] — 用 text-to-text 统一所有任务，与 ELECTRA「换损失」是不同方向的统一思路

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[bert]] —— BERT — 双向 Transformer 预训练
- [[mae]] —— MAE — Masked Autoencoders
- [[roberta-2019]] —— RoBERTa — 把 BERT 重训一遍就能拿 SOTA
- [[t5]] —— T5 — Text-to-Text Transfer Transformer
- [[xlnet-2019]] —— XLNet — 把句子打乱顺序读，借此同时拿到 AR 和双向

