---
title: Megatron-Core MoE — 大规模稀疏专家并行实践
来源: 'Yan et al., "Scalable Training of Mixture-of-Experts Models with Megatron Core", arXiv:2603.07685, 2026'
日期: 2026-07-08
分类: ml-systems
难度: 高级
---

## 是什么

Megatron-Core MoE 是 NVIDIA 在 Megatron-Core 上做的一套**稀疏专家（Mixture-of-Experts）训练系统报告**：不是再发明一种 MoE 路由公式，而是把「每个 token 只进少数专家」这件事，在**内存、通信、算力**三条线上一起工程化。

日常类比：大食堂不再让每个厨师炒整桌菜，而是**按菜品把订单分到不同档口**——总菜单可以很长（总参数很大），但每桌只动用两三个档口（每步只激活 Top-k 专家）。难点不在「分单」口号，而在传菜口会不会堵、哪个档口会不会闲死、后厨冰箱够不够。

报告对应 arXiv:2603.07685（Yan 等，2026）。它在 GB200/GB300 上给出 DeepSeek-V3-685B、Qwen3-235B 等吞吐数字，并把 Parallel Folding、Grouped GEMM、FP8/NVFP4、长上下文路径写进同一套可复用栈。读它时更像「生产级 MoE 训练操作手册」，而不是新的算法论文。

## 为什么重要

不理解这套系统栈，下面这些事都很难讲清：

- 为什么「参数到万亿」不等于「每步算力也翻万亿」——稀疏激活把算力和参数解耦
- 为什么 MoE 训练常死在 all-to-all，而不是 matmul——token 要在专家之间搬家
- 为什么只堆更多 GPU 仍可能变慢——重算、通信重叠、Grouped GEMM 必须共设计
- 为什么 DeepSeek / Qwen 这类超大 MoE 能在千卡集群上跑起来——工业界实际在用这套栈

一句话：MoE 的算法故事讲完后，真正决定能不能训起来的，是这篇关心的系统层。

## 核心要点

1. **路由只点名，专家才干活**。路由器给每个 token 选 Top-k 专家；未被选中的专家本步不算。类比：叫号机只叫两三个窗口，其余窗口本轮休息。参数可以继续加专家，但每步算量大致跟 k 走。
2. **三条线一起拧，不能单点优化**。报告把优化拆成内存（细粒度重算、offload）、通信（dispatcher、通信计算重叠）、计算（Grouped GEMM、算子融合、CUDA Graph），并强调改一端会把压力挤到另一端。类比：扩后厨若不扩传菜通道，出餐更堵。
3. **Parallel Folding + 低精度是扩容旋钮**。多维并行（TP/PP/EP/DP 等）可折叠组合；FP8 / NVFP4 压通信量与显存；长上下文另有专门路径。类比：同一套积木能折成不同形状的机架——先选形状，再谈加卡。

把三件事连起来记：**谁被点名（路由）→ token 怎么搬家（通信）→ 小专家怎么算得快（Grouped GEMM）**。缺任何一环，加卡都可能变成加堵。

再补一条工程直觉：dense 训练的主矛盾常是「矩阵够不够大」；MoE 训练的主矛盾常是「专家够不够匀、通道够不够宽」。同一套 GPU，换问题定义后，优化顺序也要换。

## 实践案例

### 案例 1：最小 MoE 一步在干什么

```text
for each token x:
  scores = Router(x)              # 给每个专家打分
  experts = TopK(scores, k=2)     # 只留 2 个档口
  y = 0
  for e in experts:
    y += gate(e) * Expert_e(x)    # 只计算被点名的专家
  # 同时：token 经 all-to-all 送到专家所在 GPU，算完再送回
```

读法：先打分 → 只激活 k 个 → 局部专家计算 → 通信把 token 送对卡。Dense 模型没有「送对卡」这一步，这就是 MoE 系统难度的来源。把这段对照 profiler：若 all-to-all 占比远高于 GEMM，说明通信栈还没叠好。
也可以把案例 1 想成两段流水：CPU/框架侧决定「谁去哪个专家」，GPU 侧执行「搬过去算完搬回来」。很多 MoE bug 其实出在第一段的元数据（索引、容量、对齐），而不是第二段的 matmul 本身。


### 案例 2：看吞吐时要对齐硬件与模型

报告在 NVIDIA GB300 / GB200 上给出量级：DeepSeek-V3-685B 约 **1233 / 1048 TFLOPS/GPU**；Qwen3-235B 约 **974 / 919 TFLOPS/GPU**。对比时固定：专家数与 Top-k、EP size、是否 FP8、序列长度。只报一个「更快」没有对照基线，等于没测。

复现实验最小清单：同一模型配置、同一精度、同一序列长，记录 tokens/s 与 TFLOPS/GPU 两列，再谈某项优化是否有效。
若你的集群是多节点，还要单独问一句：专家并行的 all-to-all 有多少比例跨节点？跨节点比例一高，就要优先考虑折叠并行维度或缩小 EP，而不是继续堆专家数。


### 案例 3：负载不均时先动容量与辅助损失

若部分专家 step 时间明显更长：先查 capacity factor（专家槽位是否太紧）、aux loss / 负载惩罚是否过弱、dispatcher 是否把热门专家打到同一 NVLink 域。类比：热门档口永远排队，冷门档口空转——要改叫号策略，不是只加厨师人数。

可操作顺序：看专家利用率直方图 → 调容量/辅助损失 → 再考虑改 EP 拓扑。反过来一上来加卡，常把不均放大。
经验上：利用率方差很大但平均还行，优先调路由/辅助损失；平均值整体偏低，才去怀疑 dispatcher 或硬件拓扑。


## 踩过的坑

1. **只开 EP、不调 capacity**：热门专家溢出，token 被丢或重路由，loss 毛刺变大。
2. **通信与计算不重叠**：all-to-all 裸等，GPU 算力报表好看、墙钟时间很差。
3. **Grouped GEMM 未启用时小专家很碎**：大量小矩阵把 GPU 打成「启动开销机器」。
4. **低精度与路由分数混用不当**：FP8 权重可以，但路由 logits 乱压精度会导致专家塌缩到少数几个。

排障时建议固定一张表：专家利用率、all-to-all 耗时占比、GEMM 效率、溢出 token 比例。四列里哪一列先爆，就先动对应旋钮，避免「看见慢就加 EP」。

## 适用 vs 不适用

**适用**：

- 总参数很大、但每 token 只需激活少量专家（典型 Top-1/Top-2 MoE）
- 有多节点 GPU 与高带宽互联，能承担 expert parallel 的 all-to-all
- 需要把 DeepSeek/Qwen 类 MoE 训到千卡级，并关心 TFLOPS 墙钟
- 已有 Megatron-Core / NeMo 路径，想把 MoE 从演示规模推到生产规模

**不适用**：

- 小模型或纯 dense Transformer——EP 通信成本往往高于收益
- 只有单卡/单机、没有跨卡带宽预算
- 只做推理服务、且已有专用推理引擎（本报告重心在训练系统）
- 还没搞清 Top-k / 容量因子，就想靠「换框架」解决收敛问题

## 历史小故事（可跳过）

- 2017 前后 MoE 在 NLP 复兴；GShard / Switch Transformer 把「稀疏专家」做成可扩配方
- Megatron-LM（2019）先解决 dense 模型的张量并行；随后生态长出 Expert Parallel
- 2023+ Megatron-Core 把并行原语库化，MoE dispatcher / Grouped GEMM 进入主路径
- 2026 本报告系统整理内存·通信·计算共设计，并给出 GB200/GB300 上的生产级吞吐
- 同一时期业界把「万亿参数 MoE」从海报数字推进到可重复训练的工程清单
- 这条线的关键词始终是共设计：内存、通信、计算一起动，而不是单点 kernel 竞赛

## 学到什么

- 稀疏不是免费午餐：省下的是算力，买下的是路由与 all-to-all
- 系统报告的价值在「压力会转移」——优化显存可能打爆网络
- 看 MoE 论文先问：Top-k、EP size、容量因子、精度，再看刷榜数字
- 工业可用 = 算法公式 + 通信调度 + 低精度 + 可折叠并行，缺一就停在演示规模
- 对照 dense 的 [[megatron-lm]]：先会切矩阵，再学切专家，两条线不要颠倒

若你只能带走一张检查清单：先确认 Top-k 与容量因子，再看 EP 是否落在高带宽域，最后才打开低精度与 CUDA Graph。顺序反了，数字会很好看，收敛却对不上。

- 上线前先画通信账本：哪些集合通信在节点内、哪些跨节点
- 把「专家数」和「每步激活专家数」分开写进实验记录，避免只报总参数唬人

## 延伸阅读

- 论文全文：https://arxiv.org/abs/2603.07685
- Megatron-Core / NeMo 用户指南中的 parallelisms 与 MoE 章节
- [[gshard-2020]] —— Google 大规模 MoE 路由与分片的前序工作
- [[megatron-lm]] —— dense 张量并行原点，理解 EP 前先懂 TP
- [[mixture-of-experts]] —— MoE 算法直觉总览
- [[deepspeed-zero]] —— 另一条显存切分路线，常与 Megatron 叠用

## 关联

- [[megatron-lm]] —— 张量/流水并行底座，MoE 报告建立在同一家族上
- [[gshard-2020]] —— 早期大规模 MoE 系统论文
- [[mixture-of-experts]] —— 专家稀疏激活的概念入口
- [[deepspeed-zero]] —— ZeRO 切优化器状态，可与 EP 互补
- [[afd-disagg-moe]] —— 另一条 MoE 系统拆分思路，便于对照
- [[nvlink-nvswitch-2018]] —— 专家并行对机内带宽极敏感
- 实操备忘：长上下文路径要单独记账，序列一长，通信与激活内存会同时抬头

### 小结对照（可跳过细读）

- Dense Megatron：主问题是「大矩阵怎么切开还不通信爆炸」。
- MoE Megatron-Core：主问题是「专家怎么点名、token 怎么搬家、小 GEMM 怎么合并」。
- 两者共享 TP/PP/DP 词汇，但 MoE 多了 EP 与 dispatcher；把 dense 经验原样套过来，常会低估 all-to-all。
- 报告里的 GB200/GB300 数字是「系统共设计后的上限参考」，不是换任意集群都能自动达到的保底值。
- 若你的目标是推理延迟而不是训练吞吐，请改读推理引擎文档，本篇不要当推理手册。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[papers/megatron-lm]] —— Megatron-LM — NVIDIA 大规模训练框架
