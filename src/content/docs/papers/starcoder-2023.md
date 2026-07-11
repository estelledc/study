---
title: StarCoder — 把训练数据完整公开的 15B 代码模型
来源: 'Li et al. (BigCode), "StarCoder: may the source be with you!", arXiv:2305.06161 (2023)'
日期: 2026-06-01
分类: 机器学习
难度: 中级
---

## 是什么

StarCoder 是 BigCode（Hugging Face 与 ServiceNow 联合发起的开源协作）在 2023 年 5 月放出的代码大模型。日常类比：把一本『代码界的开源教科书』摆出来——不只交课本，还把课本里每一页素材取自哪本原书全部列出来；学生（开发者）甚至可以说『我不想我的笔记被印进去』，出版社就照办撤掉。

技术规格：

- **15.5B 参数**，标准 decoder-only Transformer
- **8192 token 上下文**——同期 LLaMA 还停在 2K
- **训练数据 The Stack v1.2**：6.4 TB 源码、86 种语言，全部来自 GitHub 上 permissive 许可证的仓库
- **License OpenRAIL-M**：允许商用、要求不滥用

但它真正的标杆地位不在性能，而在**透明度**——这是开源代码模型第一次把『数据来源 + 开发者 opt-out + 商用许可证』三件事一次做齐。

## 为什么重要

不读这篇，下面这些事都没法解释：

- 为什么 2024 年起 DeepSeek-Coder / StarCoder 2 / Qwen2.5-Coder 都把『数据合规』写进论文摘要——StarCoder 是第一个把这件事做成范式的
- 为什么 The Stack 数据集成了开源代码模型的『默认地基』——后续 4 个主流开源代码模型都从这里取数据
- 为什么 GitHub 上会出现 amitheinthestack 这种网站——StarCoder 第一次允许开发者把自己的代码从训练集里撤掉
- 为什么同期 Code Llama（Meta）选择闭源数据但开源权重，反而让 StarCoder 的『数据透明』显得稀缺

它把『训一个能用的代码模型』和『训一个法律上可以用的代码模型』第一次合并到一篇论文里。

## 核心要点

四个设计选择，每一个都值得单独讲。

1. **数据：The Stack v1.2 — 只取 permissive license**。从 GitHub 抓所有公开仓库后，**先按 SPDX 许可证白名单过滤**（MIT / Apache / BSD 等），再用 PII 检测器去掉密钥和邮箱，最后留下 6.4 TB。这一步把法律风险从『模糊地带』压到『可解释』。

2. **架构：MQA + FlashAttention**。注意力部分用了 Multi-Query Attention（MQA）——所有 Query head 共享一份 Key/Value，推理时 **KV cache 约降到 1/头数**（48 head 时约 1/48），推理更快。注意：**StarCoder 1 用的是 MQA，不是 GQA**；GQA 是 2024 年 StarCoder 2 才引入的。

3. **训练目标：next-token + Fill-in-the-Middle (FIM)**。50% 的样本被切成『前缀 / 中间 / 后缀』，重排成『前缀-后缀-中间』，让模型学会**从两侧补中间**。这是 IDE 行内补全的能力来源。

4. **Opt-out 机制**。BigCode 把训练数据放上 amitheinthestack 工具，开发者输入 GitHub 用户名，能查到自己的哪些仓库被收录，并提交移除请求。**这是开源数据集第一次提供透明 opt-out 通道**——后来常被数据治理讨论当作合规模板。

## 实践案例

### 案例 1：MQA 为什么省那么多显存

标准 multi-head attention：每个 head 都有自己的 Q、K、V 三套权重。8 个 head 就是 8 份 K/V。

```
标准 MHA:  Q1,K1,V1  Q2,K2,V2  ...  Q48,K48,V48   ← 48 份 K/V
StarCoder: Q1,Q2,...,Q48 + 一份共享 K, V          ← 1 份 K/V
```

推理时显存占用大头是 KV cache，**MQA 把这块压到 1/48**。代价是表达力轻微下降，但在 15B 这个规模上几乎没影响。

后来 LLaMA 2 / Mistral 选择了 **折中版 GQA**（每 8 个 Q head 共享一份 K/V），算是 MHA 与 MQA 的中间产物。

### 案例 2：FIM 的训练数据长什么样

原始代码：

```python
def fibonacci(n):
    if n < 2:
        return n
    return fibonacci(n-1) + fibonacci(n-2)
```

随机切三段：

```
前缀: def fibonacci(n):\n    if n < 2:\n
中间:         return n\n    return fibonacci(n-1)
后缀:  + fibonacci(n-2)\n
```

重排成训练样本：

```
<fim_prefix>def fibonacci(n):
    if n < 2:
<fim_suffix> + fibonacci(n-2)
<fim_middle>        return n
    return fibonacci(n-1)
```

模型学到：看到前缀和后缀的特殊 token，就要预测中间。**IDE 里光标停在函数中间时调用的就是这条路径**。

### 案例 3：从训练数据撤掉自己的代码

amitheinthestack 工具流程：

1. 输入 GitHub 用户名 → 查询 The Stack 索引
2. 显示哪些仓库被收录、占多少 token
3. 提交 opt-out 请求 → 下次数据集刷新时移除

之前的 GPT-3 / Codex 闭源数据，开发者**没有这条路**——只能事后告。StarCoder 第一次把『不参与训练』变成开发者可点击的按钮。

## 踩过的坑

1. **以为 StarCoder 用的是 GQA**——错。StarCoder 1 是 MQA（一份 K/V 共享），StarCoder 2 才换成 GQA。这是面试时容易翻车的细节。

2. **以为 The Stack 抓了所有 GitHub**——错。只取 permissive license 仓库（约 1/3 的代码量），且过滤了 PII。这就是为什么训练 token 数（1T）看起来不算特别大。

3. **以为 8K 上下文是当时新高**——半对。2023-05 发布时 8K 在开源代码模型里确实靠前；同年 8 月 Code Llama 才用 RoPE（旋转位置编码，把『位置刻度』拉长）外推到约 100K。StarCoder 1 选 8K 是为了可学习位置编码成本可控，**长上下文不是它的目标**。

4. **以为 OpenRAIL-M 等于完全开源**——半错。OpenRAIL-M 允许商用，但**附带使用限制条款**（不能用于歧视、监控等场景），严格来说不算 OSI 定义的『开源』，而是『负责任开源』（Responsible AI License）。

## 适用 vs 不适用场景

**适用**：

- 想要一个『法律上能进公司代码库』的开源代码模型基座
- 学习 IDE 行内补全的训练原理（FIM 是核心）
- 研究开源数据集合规该怎么做——The Stack 是第一个完整范式
- 中等规模（15B）部署：bf16 下单张 A100 80GB 可跑推理（fp32 会爆）

**不适用**：

- 需要超长上下文（>16K）→ 选 Code Llama 或 DeepSeek-Coder V2
- 需要中文代码理解 → StarCoder 训练数据英文为主，中文注释偏少
- 需要 SOTA HumanEval 分数 → 2024 年起 DeepSeek-Coder 和 Qwen2.5-Coder 都明显超过
- 需要 OSI 严格定义的『开源』 → OpenRAIL-M 不算，要找 Apache 2.0 模型（如 Mistral）

## 历史小故事（可跳过）

- **2022 年 9 月**：BigCode 项目启动，定位是『Hugging Face 版 BLOOM』但专门做代码——透明、可追溯、协作开发
- **2022 年 12 月**：The Stack v1.0 发布，3 TB 数据，第一次开放 amitheinthestack 网站
- **2023 年 5 月**：StarCoder 与 StarCoderBase 同时发布，论文 50+ 作者，跨 18 个机构
- **2024 年 2 月**：StarCoder 2 + The Stack v2 发布，数据扩到 67 TB，架构换成 GQA + RoPE，这才追上 Code Llama 的长上下文

整条线最值得记的是：**透明度是花时间堆出来的，不是临时加的**——BigCode 第一年就在搭 opt-out 工具，第二年才发模型。

## 学到什么

1. **数据合规可以是技术贡献**——StarCoder 论文里『数据如何过滤』的篇幅几乎和模型架构一样长，这是后续合规论文的范本
2. **MQA / GQA / MHA 是注意力的三档油门**——MHA 表达最强但贵，MQA 最便宜但表达弱，GQA 折中。代码模型选 MQA 是因为推理频次远高于训练
3. **FIM 是 IDE 补全的训练目标**——光看 next-token 训出来的模型在光标中间补全会卡，必须显式训过『从两侧补中间』
4. **License 比代码更难**——OpenRAIL-M 不是 OSI 开源，但它给『商用 + 不滥用』找到了第一个工业可用版本，后续大模型 license 几乎都参考它

## 延伸阅读

- 论文：[StarCoder: may the source be with you!](https://arxiv.org/abs/2305.06161)
- 数据集：[The Stack v1.2 — Hugging Face Datasets](https://huggingface.co/datasets/bigcode/the-stack)
- Opt-out 工具：[Am I in The Stack?](https://huggingface.co/spaces/bigcode/in-the-stack)
- 后续工作：[StarCoder 2 论文 (2024)](https://arxiv.org/abs/2402.19173)
- [[codellama-2023]] —— 同年 Meta 闭源对照
- [[codex-2021]] —— OpenAI 代码模型鼻祖

## 关联

- [[codellama-2023]] —— 同期闭源对照，长上下文走得更远但数据不公开
- [[codex-2021]] —— OpenAI 闭源代码模型鼻祖，定下『代码模型』这条赛道
- [[deepseek-coder-2024]] —— 沿用 The Stack 风格但数据规模更大
- [[transformer-xl-2019]] —— 长上下文注意力机制的早期探索
- [[gpt-3]] —— decoder-only 缩放范式来源

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[codellama-2023]] —— Code Llama — 开源代码模型的完整训练配方
- [[gpt-3]] —— GPT-3 — Language Models are Few-Shot Learners
- [[transformer-xl-2019]] —— Transformer-XL — 让 Transformer 像 RNN 那样把上下文滚动传下去

