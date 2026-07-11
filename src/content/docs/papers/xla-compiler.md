---
title: XLA — 给 TensorFlow / JAX 装一台真正的张量编译器
来源: 'Google. "XLA: Optimizing Compiler for TensorFlow". 2017'
日期: 2026-05-30
分类: 编译器
难度: 中级
---

## 是什么

XLA（**A**ccelerated **L**inear **A**lgebra）是 Google 在 2017 年开源的**深度学习编译器**：把 TensorFlow / JAX（以及可选的 PyTorch/XLA）写出的整张张量计算图先翻成统一中间语言 HLO，再像传统编译器那样做优化，最后落到 CPU / GPU / TPU 的机器码。

日常类比：原来你点十道菜，服务员每点一道就跑后厨一次（启动一次 GPU kernel）。XLA 是个"会读菜单的服务员"——先把食材一起算清楚（图级优化），合并能并的工序（算子融合），写成一张厨房单（HLO），让后厨**一次性**做完。

你写：

```python
@jax.jit
def f(x):
    return jnp.sin(x) * 2 + 1
```

`jit` 会把这函数交给 XLA：sin、乘、加三个算子被**融合**成**一个** GPU kernel，输入只读一次内存。不开 jit 时是三个 kernel、三趟读写。

## 为什么重要

不理解 XLA，下面这些事都没法解释：

- 为什么 JAX 加 `@jit` 在算子细碎时能快数倍到约 10 倍（相对 eager，视硬件而定）——解释执行换成了编译执行
- 为什么 TPU 离开 XLA 就跑不动——TPU 没有 cuDNN（NVIDIA 手写好的算子库）这种现成库，只能靠编译器现场生成 kernel
- 为什么 PyTorch 2.0 的 `torch.compile` **长得像** XLA——都是"前端图 → 中间 IR → 后端 codegen"（默认路径不是 XLA）
- 为什么 shape 一变 jit 就慢——XLA 对每个 shape 单独编译一份机器码

## 核心要点

XLA 的工作流可以拆成 **三段**，像三道工序的流水线：

1. **统一 IR：HLO**。前端先翻成 HLO（High Level Operations，高层算子清单）。类比：多国语言先翻成一种"中间语"。HLO 后来标准化成 StableHLO（跨框架可交换的稳定版）。

2. **目标无关优化**。在 HLO 上做整图优化：CSE（公共子表达式消除——同一道菜别做两遍）、算子融合、buffer 分配规划。类比：先把菜单整理好，能合并的工序合并。

3. **后端 codegen**。按硬件 pattern match——能调 cuDNN 就调；否则发到 LLVM，生成 PTX（NVIDIA GPU 的中间汇编）或 CPU 汇编。TPU 有专属 codegen。

三段都不可少：少了 1，前端各写各的；少了 2，没法整图融合；少了 3，没法跨硬件。

## 实践案例

### 案例 1：JAX 里看 HLO 长什么样

```python
import jax, jax.numpy as jnp
f = jax.jit(lambda x: jnp.sin(x) * 2 + 1)
print(f.lower(jnp.ones(4)).compiler_ir(dialect="hlo"))
```

输出大概长这样（节选）：

```
HloModule jit_f
ENTRY main.5 {
  Arg_0.1 = f32[4] parameter(0)
  sine.2  = f32[4] sine(Arg_0.1)
  cst.3   = f32[]  constant(2)
  bcast.4 = f32[4] broadcast(cst.3)
  ROOT mul-add.5 = f32[4] fused_computation(sine.2, bcast.4)
}
```

**逐部分解释**：

- `Arg_0.1`：输入参数，形状 `f32[4]`（4 个 float）
- `sine.2` / `bcast.4`：对输入做 sin，并把标量 2 广播成同形状
- `fused_computation`：乘和加已被合进同一计算——整图融合的痕迹
- `f.lower(...).compiler_ir(...)`：看 lowering 后的 HLO，不必再包一层 `jax.jit`

### 案例 2：TensorFlow 训练开 jit_compile

```python
@tf.function(jit_compile=True)
def train_step(x, y):
    with tf.GradientTape() as tape:
        loss = loss_fn(model(x), y)
    grads = tape.gradient(loss, model.trainable_variables)
    optimizer.apply_gradients(zip(grads, model.trainable_variables))
```

**逐部分解释**：

1. `jit_compile=True`：整个 `train_step` 交给 XLA，不再逐步解释执行
2. 前向（`model`）+ 损失 + 反向（`GradientTape`）+ 更新被合成一组大 kernel
3. TPU 上常见 1.5–3× 加速；代价是第一次编译要几秒到几十秒

### 案例 3：retracing 排查

```python
@jax.jit
def f(x): return x.sum()

f(jnp.ones(3))   # 编译一次（shape=3）
f(jnp.ones(4))   # 重新编译（shape=4）
f(jnp.ones(5))   # 又重新编译
```

**逐部分解释**：

1. JAX 把 shape 当编译期常量，每个新 shape 等于新程序
2. batch size 不固定时，重编开销能吃光 jit 收益
3. 修法：`static_argnums` 标静态参数，或把输入 padding 成固定 shape

## 踩过的坑

1. **把 XLA 当通用编译器**：它是张量计算编译器，纯 Python 控制流（很多 if / 不规则循环）会被跳过，没加速。
2. **shape 多态触发 retracing**：shape 一换就重编，能把 jit 好处吃光。
3. **fusion 不是越多越好**：过激融合会爆寄存器 / 共享内存，反而更慢；极端情况用手写 `dont_fuse` 提示。
4. **HLO 报错读不懂**：错误常指向 `fusion.137` 这类算子名，跟 Python 行号对不上。

## 适用 vs 不适用场景

**适用**：
- 计算图相对固定、shape 不大变（训练、批量推理）
- 算子细碎、kernel 启动开销占比高的场景
- 必须用 TPU——没有编译器就跑不了
- JAX / TensorFlow 重度用户，开 `@jit` / `jit_compile` 就是 XLA 接手

**不适用**：
- 控制流极复杂、动态 shape 频繁（LLM 推理 KV cache 早期是痛点）
- 想用最新硬件指令但 XLA 还没支持时
- 调试期、原型期——编译开销让迭代变慢
- 框架已有手工 cuDNN 重度优化的固定模型，XLA 收益有限

## 历史小故事（可跳过）

- **2017 年**：Google 公开 XLA，最初给 TensorFlow 做后端加速。
- **2018 年**：TPU v2 / v3 上线，XLA 成内部主力——TPU 没 cuDNN，全靠现场 codegen。
- **2020 年**：JAX 起飞，`jax.jit` 几乎成 ML 论文标配。
- **2022 年**：StableHLO 提出，把 HLO 标准化成跨框架 IR。
- **2023 年**：XLA 独立成 **OpenXLA**，PyTorch 等加入；与 MLIR 走向融合。

思想脉络：Halide（2013）开了"算法与调度分离"的头，TVM 把它通用化，XLA 把它工业化到云规模训练。

## 学到什么

1. **编译器思路打败解释执行**——从"逐 op 调库"到"整图编译"，是过去 10 年关键性能跃迁
2. **统一 IR 是杠杆**——前端多家、后端多家，关键是中间那层 HLO
3. **融合是核心收益**——内存带宽往往是真瓶颈，多算子合一个 kernel 直接省读写
4. **编译开销要算账**——第一次慢、shape 一变就重编，生产里要做静态化设计

## 延伸阅读

- 官方架构文档：[OpenXLA Architecture](https://openxla.org/xla/architecture)（StableHLO + 三段 pipeline）
- 视频：[Matthew Johnson — JAX, MLPerf and XLA](https://www.youtube.com/results?search_query=jax+xla+matthew+johnson)
- JAX 官方："How JAX primitives work"（HLO 怎么从 Python 出来）
- [[halide]] —— 算法与调度分离的奠基论文
- [[tvm]] —— 与 XLA 同代的开源 ML 编译器
- [[mlir]] —— 与 XLA 合流的下一代统一 IR 框架

## 关联

- [[halide]] —— 算法与调度分离，被 XLA 内化成"HLO + backend pass"
- [[tvm]] —— 同代 ML 编译器，更偏开源生态、对小厂硬件更友好
- [[mlir]] —— 多层 IR 框架，OpenXLA 正在与它合流
- [[llvm]] —— 后端代码生成基石，PTX / 汇编从这里出
- [[ssa]] —— LLVM IR 的形式基础，HLO 也借鉴 SSA 风格命名
- [[kildall-dataflow]] —— CSE、buffer 分析走的经典数据流框架
- [[attention]] —— Transformer 核心算子，TPU 上靠 XLA fusion 跑得快

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[alpa-2022]] —— Alpa — 把张量/流水/数据并行统一成一道搜索题
- [[gshard-2020]] —— GShard — 用注解让 600B 模型自动跨设备切片
- [[milestone-phase-order]] —— MileStone — 让编译器按能耗预算自己排优化顺序
- [[passnet-graph-compiler]] —— PassNet — 让大模型给图编译器写优化 pass
- [[taso-2019]] —— TASO — 让机器自己发现深度学习图重写规则
- [[triton-2019]] —— Triton 2019 — 让 Python 写出贴近 cuBLAS 的 GPU kernel
- [[triton-llm]] —— Triton — 让 Python 程序员也能写出贴近 cuBLAS 的 GPU kernel
- [[tvm-2018]] —— TVM OSDI 2018 — 把 Halide 思想搬到深度学习
- [[numpy]] —— NumPy — Python 科学计算基石
