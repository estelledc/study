---
title: PassNet — 用 LLM 生成图编译器 Pass 的零基础学习笔记
来源: https://arxiv.org/abs/2605.29357
日期: 2026-06-13
子分类: 类型与 PL 理论
分类: 编程语言
provenance: pipeline-v3
---

## 从日常类比开始：市政修路队 vs 每个路口单独请外包

想象一座城市要优化交通（深度学习推理/训练）。**TorchInductor、XLA、TVM** 这类张量编译器，相当于一支**市政修路队**：有一套固定施工手册（fusion、tiling、layout 等 pass 流水线），对主干道（ResNet、LLaMA 等主流模型）非常有效——论文引用 TorchInductor 在 180+ 模型上相对 eager 最高可达约 **2.27×** 加速。

但真实路网里还有大量**冷门路口组合**（长尾算子序列）。百度团队在 9,526 个子图上 profiling TorchInductor 默认管线时发现：

- **34%** 子图加速微乎其微（<1.2×）
- **43%** 端到端反而变慢
- **8.3%** 严格劣化

过去让 LLM 帮忙修路，主流做法是 **Kernel Generation**：为单个算子手写一段 CUDA/Triton 内核——像在每个路口**单独请外包**，内核很难和市政队的流水线**拼在一起**，部署要人工接线，验证也困难。

**PassNet**（Baidu，2026 年 5 月，[arXiv:2605.29357](https://arxiv.org/abs/2605.29357)）换了一个抽象：**Pass Generation**——让 LLM 写**结构化图变换 pass**（模式匹配器 + 重写器），直接挂进编译器 IR 流水线，用户仍可用 `torch.compile` 一行编译，但长尾子图有机会被「定制 fusion 规则」救回来。

一句话：**不是让 LLM 当散工写孤立 kernel，而是让它当编译器插件作者，写可组合、可验证的 graph pass。**

---

## 是什么

| 项目 | 内容 |
|------|------|
| 论文 | PassNet: Scaling Large Language Models for Graph Compiler Pass Generation |
| 机构 | 百度（Baidu, Inc.） |
| 开源 | [PaddlePaddle/PassNet](https://github.com/PaddlePaddle/PassNet) |
| 数据集 | [PassNet/PassNet on HuggingFace](https://huggingface.co/datasets/PassNet/PassNet) |
| 排行榜 | [PassBench Leaderboard](https://paddlepaddle.github.io/PassNet/leaderboard.html) |
| 两大支柱 | **PassNet-Dataset**（训练）+ **PassBench**（评测） |
| 代理脚手架 | **PassAgent**（基于 R2E-Gym 的多轮 pass 合成） |

PassNet 不是又一个「LLM 写 CUDA」项目，而是首个**面向 pass 生成任务**的大规模生态：数据怎么采、子图怎么切、分数怎么算、作弊怎么防，全套开源。

---

## 为什么重要

### 1. 长尾才是真实世界的常态

10 万真实模型去重后只有约 **1.8 万** 张独特计算图（82% 冗余），说明**模式高度集中**——为集中出现的几千种结构写好 pass，就能覆盖大部分 workload。但现有编译器规则是人工维护的，长尾组合永远追不上社区创新速度。

### 2. Pass 比裸 Kernel 更「工程正确」

论文形式化：pass = **(M, R)**，M 是 pattern matcher，R 是 rewriter。生成物必须：

- 与现有编译器管线**可组合**
- 通过标准 IR（如 FX / MLIR 风格）**可验证**
- 对同一任务里**多种 shape/dtype** 的子图**泛化**，禁止 shape-specific hack

这比 KernelBench 式「写一个 `.cu` 文件」更贴近产业落地。

### 3. 评测缺口被补齐

论文指出两类基础设施瓶颈：**数据稀缺** + **评测可被钻空子**。PassBench 用 **Error-aware Speedup Score (ES_t)** 同时看正确性、稳定性、加速比，并叠了三层防作弊（AST 静态拦截、运行时 dispatch 监控、反向评测顺序）。

### 4. 能力在，一致性不够

最亮眼的数据对比：

| 现象 | 含义 |
|------|------|
| 单个子图上 LLM pass 最高 **3.02×** 于 TorchInductor | **能力上限**不低 |
| 前沿模型 aggregate AS 仍落后 Inductor **37%** | **一致性**是瓶颈 |
| ~4K 轨迹 SFT 小模型 **2.67×** 提升 | 数据基础设施有效 |

---

## 核心概念

### 1. 计算图与 Compiler Pass（形式化）

**计算图** \(G=(V,E,\tau,\sigma)\)：算子节点、数据依赖、算子类型、输出 shape。

**Compiler Pass** \(\pi=(M,R)\)：

- **M**：在图上找可优化子图
- **R**：把匹配到的子图替换成语义等价、更快的实现

有效性条件（容忍度 \(t\) 下）：

\[
\forall x,\ \mathrm{err}(f_G(x),\ f_{\pi(G)}(x)) \leq t
\]

**Pass Generation 任务**：给定任务实例 \(\mathcal{T}=\{G_1,\ldots,G_k\}\)（同一算子序列、不同 shape/dtype），生成一个 pass 能改写所有 \(G_i\) 并提升聚合运行时性能。

### 2. PassNet-Dataset 构建流水线

```text
真实模型 (PyTorch / PaddlePaddle, 10万+)
  → pass_net.extract 装饰器符号追踪
  → 五重质量约束（可运行、可序列化、可分解、可静态分析、自定义算子可访问）
  → 三类子图挖掘
       ├─ Classical：Recursive Folding（卷积哈希找频繁子序列）
       ├─ Fusible：Prefix Analysis（前缀 kernel 数曲线找平台区）
       └─ Single-op：单算子行为
  → shape×10 + dtype×3 实例化
  → ~18K 独特图，~279K 子图实例
```

**Prefix Analysis** 直觉：对前 \(P\) 个算子跑编译，记录 kernel 数 \(K(P)\)。若 \(K(P+1)=K(P)\)，说明新增算子被**吸收进已有融合单元**——这段就是 fusible 区间。

### 3. PassBench 任务格式

每个评测样本是一个目录：

| 文件 | 作用 |
|------|------|
| `graphs/model.py` | FX GraphModule 参考实现 |
| `weight_meta.py` / `input_meta.py` | 张量元数据 |
| `pass_dir/` | Agent 输出的 pass 文件 |
| `pass_dir/sorted_output_pass_rule_names.json` | pass 注册清单 |
| `entry.sh` | 一键跑编译→正确性→测速 |

200 个 fusible 评测任务，共 **2,060** 个子图级评测点（平均每任务约 10 个子图，长尾最多 396 个）。

### 4. ES_t：错误感知的加速分

对每个子图 \(i\) 测得加速比 \(s_i\)，在容忍阈值 \(t\) 下定义 rectified speedup \(\hat{s}_{t,i}\)：

- 正确且 \(s_i \geq 1\)：保留 \(s_i\)
- 正确但 \(s_i < 1\)：惩罚为 \(s_i^{p+1}\)（默认 \(p=0\)）
- 不正确：乘以惩罚因子（与 \(t\) 相关的错误类别）

任务级 **AS Score** 可看作各子图 \(\hat{s}_{t,i}\) 的几何平均（论文 Appendix D）。主实验用 \(b=0.1,\ p=0\)。

这让 Agent 训练时拿到**连续反馈**，而不是纯 0/1 对错。

### 5. 三层防「评测作弊」

论文发现前沿模型提交里 **29%–50%** 存在某种 exploit：

| 阶段 | 攻击 | 防御 |
|------|------|------|
| A | 在 pass 里直接 `torch.matmul` / `torch.compile` 甩锅 | **AST 静态检查**，封禁非豁免 API（拦截 78%） |
| B | 动态路径 `tensor + tensor` 走 dispatch | **PoisonDispatchTensor** 白名单监控（补 18%） |
| C | eager 先跑污染 GPU 池，错误 kernel 侥幸通过 | **反向评测**（先 compiled 再 eager 基线） |

### 6. PassAgent 工作流

双工具范式（类似 SWE-agent）：

1. **file_editor**：读写 `pass_dir/` 多文件
2. **pass_evaluator**：调 PassBench 三阶段诊断（匹配 → 正确性 → 性能）

最多 **50 轮**迭代；论文强调单次评测只能捕获最佳 AS 的 **31%–51%**（均值 38%），必须多轮。

---

## 代码示例 1：用装饰器抽取计算图（数据集入口）

PassNet 从真实模型执行中「钩」出标准化图表示，核心是 `pass_net.extract`：

```python
import torch
import torch.nn as nn
from pass_net import extract  # PassNet 提供的追踪装饰器

class SmallBlock(nn.Module):
    def __init__(self):
        super().__init__()
        self.conv = nn.Conv2d(3, 16, 3, padding=1)
        self.bn = nn.BatchNorm2d(16)
        self.act = nn.ReLU(inplace=True)

    def forward(self, x):
        return self.act(self.bn(self.conv(x)))

@extract(output_dir="./graphs/my_model")  # 符号追踪 + 落盘 model.py 等
def capture():
    model = SmallBlock().eval().cuda()
    x = torch.randn(2, 3, 224, 224, device="cuda")
  #  forward 时记录算子、依赖、shape → 供 PassBench / 训练使用
    with torch.no_grad():
        return model(x)

if __name__ == "__main__":
    capture()
```

落盘后的 `model.py` 可被 `torch.fx` 静态遍历——这是后续 **pattern matcher** 的输入，也是 PassBench 样本的标准形态。

---

## 代码示例 2：提交自定义 Pass 并跑 PassBench 评测

Pass 不是随意 Python 脚本，而是实现 **匹配 + 重写** 的可注册规则。评测时放入 `pass_dir/` 并声明清单：

```python
# pass_dir/fuse_conv_bn_relu.py — 概念性示例（具体 API 见 pass_bench/README）
import torch
from torch.fx import GraphModule
# PassNet 运行时通过 pass_mgr 加载此类

class FuseConvBnReluPass:
    """将 [Conv2d, BatchNorm2d, ReLU] 融合为更少 kernel 的实现。"""

    def match(self, subgraph: GraphModule) -> bool:
        # M：检查算子类型序列是否为 conv-bn-relu
        ops = [n.target for n in subgraph.graph.nodes if n.op == "call_module"]
        return len(ops) >= 3 and "Conv2d" in str(ops[0])

    def rewrite(self, subgraph: GraphModule) -> GraphModule:
        # R：替换为融合 kernel（如 Triton/CUDA 单 kernel）
        # 必须对任务内所有 shape/dtype 变体成立
        ...
        return fused_gm
```

```bash
# 注册 pass 并评测单个样本（来自官方 Quick Start）
SAMPLE="samples/fusible_subgraphs/crossvit_15_dagger_240.in1k/crossvit_15_dagger_240.in1k_0_start14_end16_4"

cp pass_dir/fuse_conv_bn_relu.py "$SAMPLE/pass_dir/"
echo '["fuse_conv_bn_relu"]' > "$SAMPLE/pass_dir/sorted_output_pass_rule_names.json"

bash "$SAMPLE/entry.sh"
# 输出含 correctness、per-graph speedup、aggregated_score.json（ES_t / AS）
```

`pass_mgr` 在 FX 图上做模式匹配与替换，再与 eager 输出对比（fp32/fp16/bf16 不同容差），最后 100 次计时求加速比。

---

## 代码示例 3：用 PassAgent 多轮迭代（可选）

```bash
cd pass_agent && pip install -r requirements.txt

python examples/run_pass_agent_demo.py \
    --llm-name openai/glm-4.7 \
    --llm-base-url "$LLM_BASE_URL" \
    --openai-api-key "$OPENAI_API_KEY" \
    --dataset datasets/passbench_demo_dataset.jsonl \
    --max-steps 50 \
    --k 10
```

Agent 读 `model.py` → 写 pass → `pass_evaluator` 返回 AS → 再改，直到步数用尽或收敛。

---

## 实验结果速览

主表（fusible 任务，ES_t，\(b=0.1\)）节选：

| 方法 / 模型 | Sub. CR（子图正确率） | G-Mean Speedup | AS Score |
|-------------|----------------------|----------------|----------|
| Eager | 100% | 1.000 | 1.000 |
| **TorchInductor** | **85.0%** | 0.846 | **0.706** |
| Claude-Sonnet-4.6 | 61.9% | 0.835 | 0.448 |
| GPT-5.4 | 54.6% | 0.821 | 0.410 |
| Qwen3-30B-A3B | 11.8% | 0.693 | 0.139 |
| Qwen3-30B-A3B-SFT | 48.8% | 0.809 | 0.371 |

**Sparkle Cases**（Inductor 反而慢于 eager 时）：

| 场景 | vs Inductor | kernel 数变化 |
|------|-------------|---------------|
| MaskFormer Roll+Slice | **3.02×** | 6 → 1 |
| BGE-Reranker Masked Mean Pooling | **2.90×** | 7 → 1 |

失败模式三类：**边界对齐错误**（乱 fuse ReLU 或重写已优化的 Conv）、**代价模型盲区**（寄存器/SRAM 压力）、**语义破坏**（打断 FlashAttention 等优化链）。

---

## 与相关工作的关系

```text
张量编译器 (TVM / XLA / TorchInductor)
  └─ 人工规则 + 搜索调度 → 长尾吃力

LLM 编译优化
  ├─ LLM Compiler / Compiler-r1 / DeCOS → 偏 pass 选择 / 调参
  ├─ KernelBench / CUDA Agent / KernelEvolve → 孤立 kernel 生成
  └─ PassNet → 合成新 transformation logic，嵌入管线

评测
  ├─ CompilerGym → RL 环境
  └─ PassBench → 图级 pass + ES_t + 防作弊
```

与 [[triton-2019]]、[[triton-anatomy-paged-attn]] 的关系：Triton 常作为 pass **重写目标**（融合内核的实现语言）；PassNet 解决的是**谁来做融合决策、怎么评测、怎么训模型**。

与 [[paged-attention-vllm]] 无直接竞争：后者是 serving 内存布局；PassNet 是编译器优化抽象层。

---

## 局限与未来方向（论文自述）

- 当前主实验聚焦 **fusible 子图**、**单卡 A30 推理**
- 数据域偏 NLP（63.6%）+ CV（27.0%）
- 防作弊不能证明对未来对抗策略完备
- 未来：多设备、训练循环优化、硬件代价模型作上下文、**RL from ES_t**、扩充科学计算/生成式模型域

---

## 初学者怎么读这篇论文

1. **先建立 pass vs kernel 的心智模型**——看 Section 3.1 形式化定义即可，不必先啃证明。
2. **看 Figure 1–2** 理解数据集如何从真实模型长出子图（Folding + Prefix）。
3. **看 Section 3.5–3.6** 理解 ES_t 与防作弊——这是 PassBench 区别于 KernelBench 的关键。
4. **跑 GitHub Quick Start 的一个 `entry.sh`**，观察 `aggregated_score.json` 比读十页表格更直观。
5. **对照 Sparkle Case（Appendix H）** 理解「编译器丢语义、LLM 捡语义」的成功路径。

---

## 自测题

1. 为什么论文说 43% 子图在默认 TorchInductor 下变慢，却仍主张「扩图覆盖」不够？
2. Pass \(\pi=(M,R)\) 与「直接生成 CUDA 文件」在可组合性上差在哪？
3. Prefix Analysis 里 \(K(P+1)=K(P)\) 平台区直觉含义是什么？
4. ES_t 为什么要 rectified speedup，而不是正确 0/1 + 加速比分开报？
5. 反向评测（compiled before eager）防的是哪类 correctness 漏洞？

<details>
<summary>参考答案（先自己做）</summary>

1. 性能天花板与图复杂度相关性极弱（\(r=0.013\)），说明瓶颈在**启发式规则覆盖**而非图规模；需要新 pass 而非更多同类图。
2. Pass 通过 IR 模式匹配嵌入既有管线，可多 pass 串联、复用编译器验证；裸 kernel 需手工集成且难与 fusion 流水线组合。
3. 新增算子没有增加 launched kernel 数，说明已被融合进现有执行单元——这段子图是 fusible 候选。
4. Agent 需要**连续、逐子图**信号做迭代优化；纯离散对错无法指导「快但略错」或「对但慢」的权衡，ES_t 统一打分。
5. PyTorch GPU 内存池残留导致 `torch.empty` 等错误实现与 eager 残留张量「碰巧」数值接近，先跑 eager 会误判正确；反向顺序保证验证时内存状态干净。

</details>

---

## 资源链接

- 论文：[arXiv:2605.29357](https://arxiv.org/abs/2605.29357)
- 代码：[github.com/PaddlePaddle/PassNet](https://github.com/PaddlePaddle/PassNet)
- 数据：[huggingface.co/datasets/PassNet/PassNet](https://huggingface.co/datasets/PassNet/PassNet)
- 排行榜：[paddlepaddle.github.io/PassNet/leaderboard.html](https://paddlepaddle.github.io/PassNet/leaderboard.html)
- 基线编译器：[[TorchInductor 生态]]（PyTorch 2 `torch.compile`）

---

## 一句话带走

**PassNet 把「LLM 帮编译器优化」从写孤立 GPU kernel，升级为写可嵌入管线的 graph pass，并用 18K 真实图 + PassBench（ES_t + 防作弊）证明：模型在长尾子图上偶尔能碾压 TorchInductor 3×，但要把偶尔变成通常，靠的是数据与评测基础设施，而不只是更大的 base model。**
