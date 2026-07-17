# 零基础实验：少了多少视觉 Token，真的会快多少吗

> 目标：理解 token 在哪里产生、在哪里减少，以及什么证据才能写成“真机更快”。
>
> 代码：[`labs/edge_vlm_budget.py`](labs/edge_vlm_budget.py)

## 1. 先建立生活类比

把 VLM 想成答题者：

1. 摄影师把图片整理成视觉笔记。
2. 翻译员把视觉笔记转成答题者能读的格式。
3. 答题者先读完图片笔记和问题，再写第一个字。

四种优化：

| 路线 | 类比 |
|---|---|
| 层次化视觉塔 | 摄影师一开始就少而精地记笔记 |
| Projector pooling | 摄影师写很多，翻译员再压成摘要 |
| Decoder pruning | 答题者先全读，读到中途再扔掉部分笔记 |
| Active crop | 先看缩略图，确定区域后才放大细看 |

类比边界：视觉 token 是向量，不是可直接阅读的自然语言笔记。

## 2. 为什么分辨率会让 Token 暴涨

普通 patch 模型：

```text
tokens = ceil(width / patch) * ceil(height / patch)
```

若 patch 不变，384×384 变为 768×768：

```text
24 * 24 = 576
48 * 48 = 2304
```

长宽各 2 倍，token 约 4 倍。

这还只是 token 数。视觉 attention、LLM prefill、KV cache 和内存都会受影响。

## 3. 四种成本位置

### 普通 Patch ViT

```text
vision encoder: 2304 token
LLM prefill: 2304 visual token + text
```

### 层次化骨干

若最终二维特征图等效 stride 为 32：

```text
24 * 24 = 576 output token
```

它从视觉结构源头减少输出 token。实验没有模拟 FastViTHD 的真实卷积/attention
FLOPs，只模拟最终网格。

### Projector Pooling

```text
vision encoder: 已处理 2304
projector output: 144
LLM prefill: 144 visual token + text
```

结论：

```text
prefill cost drops
vision cost does not disappear
```

### Decoder Pruning

```text
vision encoder: 已完成
LLM layer 0...K: 全 visual token
LLM layer K...end: retained token
```

结论：

```text
late layers shrink
early layers and vision remain
```

## 4. 运行预算实验

```bash
cd explorations/research/fastvlm-ecosystem-study/labs
PYTHONDONTWRITEBYTECODE=1 python3 edge_vlm_budget.py
```

2026-07-17 输出：

```text
patch_vit: vision_tokens=2304 llm_initial=2304 llm_late=2304 pair_proxy=134578176
hierarchical: vision_tokens=576 llm_initial=576 llm_late=576 pair_proxy=9830400
projector_pool: vision_tokens=2304 llm_initial=144 llm_late=144 pair_proxy=1038336
decoder_prune: vision_tokens=576 llm_initial=576 llm_late=128 pair_proxy=3866624
measurement: ttft_ms=74.0 decode_tps=50.0
camera: next=frame-3 dropped=2
```

## 5. `pair_proxy` 不是什么

实验把每层 sequence length 的平方相加：

```text
sum(sequence_tokens²)
```

它只建立直觉：

- 长序列会让 attention pair 快速增长；
- 早裁和晚裁成本不同；
- text token 也在序列中。

它不是：

- FLOPs；
- 毫秒；
- Core ML/MLX kernel 时间；
- 能耗；
- 内存峰值；
- 模型质量。

不能把 `134578176` 写成“真实计算量”或“比另一个慢 13.7 倍”。

## 6. TTFT 到底包含什么

用户从提交图片到看到第一个字，至少经历：

```text
image_decode
preprocess
vision
projector
prefill
first_decode
```

实验合成：

```text
3 + 4 + 20 + 2 + 40 + 5 = 74ms
```

74ms 只验证 stage 求和代码，不对应真实模型、设备或操作系统。

模型首次下载、首次 load/compile 应单列，不应偷偷混进 warm TTFT。

## 7. 一条可比较的真机记录

必须保存：

```text
run_id
model_id
model_commit
device
os_version
image_id
prompt_id
cold_start
thermal_state
max_new_tokens
temperature
stage_ms
post_first_tokens
decode_ms
peak_memory_mb
```

比较函数会拒绝：

- device/OS 不同；
- 图片/prompt 不同；
- cold 与 warm 混合；
- thermal state 不同；
- max_new_tokens/temperature 不同；
- 缺 commit；
- 缺任一 TTFT stage。

## 8. TTFT 与 Decode 要分开

FastVLM 主要优化看图后首响应：

```text
vision + prefill -> TTFT
```

回答很长时：

```text
autoregressive decode -> total response time
```

所以报告至少要同时给：

- TTFT；
- post-first tokens/s；
-固定输出长度；
- stop reason。

只报 TTFT 不能说明整段回答更快。

## 9. 为什么 Token Count 可能动态变化

MLX Swift LM 的 2026-07-16 Gemma 4 增量：

- 保持图片长宽比；
- 尺寸对齐 patch × pooling kernel；
- 每张图独立计算 soft token count；
- 多图 placeholder 分别展开；
- image/placeholder 不匹配时失败。

因此：

```text
model = same
image aspect ratio = different
visual tokens = may differ
```

benchmark 必须固定原图尺寸、方向、resize policy 和多图数量。

## 10. 持续相机为什么只保留最新帧

假设模型每秒只能分析 1 帧，相机每秒产生 30 帧。若全部排队，模型会不断描述过去。

实验：

```text
push frame-1
push frame-2 -> drop frame-1
push frame-3 -> drop frame-2
pop -> frame-3
```

这叫 backpressure。它不提高模型速度，只避免工作变陈旧。

真实产品还要决定：

- 固定时间采样还是场景变化采样；
- 当前 generation 是否可取消；
- 热状态变差时是否降频；
- 连续相同画面是否跳过。

## 11. 运行九个测试

```bash
PYTHONDONTWRITEBYTECODE=1 \
python3 -m unittest -v test_edge_vlm_budget.py
```

结果：

```text
Ran 9 tests
OK
```

| 测试 | 证明什么 |
|---|---|
| resolution scaling | 长宽翻倍，patch token 四倍 |
| hierarchical | 源头减少 LLM token |
| projector pooling | 只减少后段，不抹去视觉成本 |
| decoder prune | 前 K 层成本仍在 |
| TTFT stages | 具名阶段求和 |
| metadata gate | 缺设备/commit/stage 拒绝 |
| cold/warm gate | 冷热启动不可混比 |
| output gate | 输出合同不同不可混比 |
| camera buffer | 陈旧帧被丢弃 |

## 12. Static、Synthetic、Device 三层

| 层 | 可写成什么 |
|---|---|
| Static source | “代码在 projector 压到 144 token” |
| Synthetic lab | “预算公式在这些输入下得到 144” |
| Device E2 | “该设备、commit、图片和 prompt 的 warm TTFT 是 Xms” |

前两层都不能升级成真机性能。

## 13. 常见误区

1. **视觉 token 少 4 倍，TTFT 就快 4 倍。**
   还有预处理、视觉 kernel、projector、文本、decode 和 runtime overhead。

2. **Projector 压缩代表视觉塔也省了。**
   压缩发生前的视觉计算已经支付。

3. **参数更少一定内存更低。**
   还要看 KV cache、视觉特征、量化和中间 buffer。

4. **Core ML 一定跑 ANE。**
   调度取决于算子、精度、compute units 和设备。

5. **单图冷启动 benchmark 可以代表连续相机。**
   持续场景还有温升、降频、队列和 UI 更新。

## 14. 应用题与检查点

### 题 1

一个模型视觉塔生成 2304 token，projector 压到 144。应说“视觉成本减少 16 倍”吗？

检查点：不能。只证明 LLM 输入 token 减少；视觉塔仍处理 2304。

### 题 2

模型 A warm TTFT 100ms，模型 B cold TTFT 150ms，能说 A 更快吗？

检查点：不能，冷热状态不同。

### 题 3

同一模型横图 200 token、竖图 260 token，是 bug 吗？

检查点：不一定；先检查 aspect-preserving resize 和动态 soft token contract。

### 题 4

连续相机只保留最新帧会不会丢信息？

检查点：会。它用“新鲜度”换“完整帧历史”，适合实时描述，不一定适合事件审计。

## 15. 真机验证清单

未来真正执行时至少固定：

1. 设备型号、OS、低电量模式；
2. 模型、commit、量化；
3. 图片 bytes、方向、色彩空间；
4. prompt、temperature、max tokens、stop；
5. cold/warm；
6. thermal state；
7. TTFT 六阶段；
8. decode tokens/s；
9. peak memory；
10. 10 分钟温升、能耗和帧率；
11. OCR、计数、空间、小物体失败集。

没有这些字段，只能称 demo，不能称可比较 benchmark。
