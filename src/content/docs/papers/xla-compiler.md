---
title: XLA — 给 TensorFlow / JAX 装一台真正的张量编译器
来源: 'Google. "XLA: Optimizing Compiler for TensorFlow". 2017'
日期: 2026-05-30
子分类: 类型与 PL 理论
分类: 编程语言
难度: 中级
provenance: pipeline-v3
---

## 是什么

XLA（**A**ccelerated **L**inear **A**lgebra）是 Google 在 2017 年开源的**深度学习编译器**：把 TensorFlow / JAX / PyTorch 写出的整张张量计算图先翻成一种统一中间语言 HLO，再像传统编译器那样做优化，最后落到 CPU / GPU / TPU 的机器码。

日常类比：原来你点一份十道菜，服务员每点一道就跑后厨一次（启动一次 GPU kernel），一晚跑十趟。XLA 是个"会读菜单的服务员"——他先把十道菜的食材一起算清楚（图级优化），合并能并起来的（算子融合），写成一张厨房单（HLO），让后厨**一次性**做完。

你写：

```python
@jax.jit
def f(x):
    return jnp.sin(x) * 2 + 1
```

`jit` 装饰器会让 JAX 把这函数交给 XLA：sin、乘、加 三个算子被**融合**成**一个** GPU kernel，输入张量只读一次内存。不开 jit 时是三个 kernel、三趟读写。

## 为什么重要

不理解 XLA，下面这些事都没法解释：

- 为什么 JAX 加一个 `@jit` 就能快 10 倍——它把解释执行换成了编译执行
- 为什么 TPU 离开 XLA 就跑不动——TPU 没有 cuDNN 这种手写库，只能靠编译器现场生成 kernel
- 为什么 PyTorch 2.0 的 `torch.compile` 长得像 XLA——大家都在抄"前端图 → 中间 IR → 后端 codegen"这套路
- 为什么 shape 一变 jit 就慢——XLA 对每个 shape 单独编译一份机器码

## 核心要点

XLA 的工作流可以拆成 **三段**，像三道工序的流水线：

1. **统一 IR：HLO**。前端框架不管多花哨，先翻成 HLO（High Level Operations）。类比：英语 / 日语 / 法语先翻成一种"中间语"，下游只需懂这一种。HLO 后来标准化成 StableHLO。

2. **目标无关优化**。在 HLO 上做和硬件无关的整图优化：公共子表达式消除（CSE）、算子融合（把多个小算子合一个 kernel）、buffer 分配规划（提前算好张量该放哪、什么时候能复用）。类比：先把菜单整理好，能合并的工序合并。

3. **后端 codegen**。按目标硬件再做一轮 pattern match——能调 cuDNN 就调 cuDNN，剩下的发到 LLVM IR，由 LLVM 生成 PTX（GPU）或原生汇编（CPU）。TPU 后端有自己专属 codegen。

三段都不可少：少了 1，前端各写各的；少了 2，没法做整图融合；少了 3，没法跨硬件。

## 实践案例

### 案例 1：JAX 里看 HLO 长什么样

```python
import jax, jax.numpy as jnp
f = jax.jit(lambda x: jnp.sin(x) * 2 + 1)
print(jax.jit(f).lower(jnp.ones(4)).compiler_ir())
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

注意 `sine` + `multiply` + `add` 已被合到 `fused_computation` 里——这就是 XLA 的整图融合。

### 案例 2：TensorFlow 训练开 jit_compile

```python
@tf.function(jit_compile=True)
def train_step(x, y):
    with tf.GradientTape() as tape:
        loss = model(x).loss(y)
    grads = tape.gradient(loss, model.trainable_variables)
    optimizer.apply_gradients(zip(grads, model.trainable_variables))
```

`jit_compile=True` 让 TensorFlow 把整个 step 交给 XLA。前向 / 反向 / 梯度更新被合成一组大 kernel，TPU 上常见 1.5–3× 加速。代价：第一次跑时编译要几秒到几十秒。

### 案例 3：retracing 排查

```python
@jax.jit
def f(x): return x.sum()

f(jnp.ones(3))   # 编译一次（shape=3）
f(jnp.ones(4))   # ⚠️ 重新编译（shape=4）
f(jnp.ones(5))   # ⚠️ 又重新编译
```

每个新 shape 都触发一次重编。生产里如果 batch size 不固定，jit 反而更慢。修法：用 `jax.jit(..., static_argnums=...)` 明确哪些是静态参数，或把输入 padding 成固定 shape。

## 踩过的坑

1. **把 XLA 当通用编译器**：它是张量计算编译器，纯 Python 控制流（很多 if / 不规则循环）会被它当成不能编译的部分跳过，没加速。

2. **shape 多态触发 retracing**：JAX 里 shape 是编译期常量，shape 一换就重新编译，能把 jit 的好处吃光。

3. **fusion 不是越多越好**：过激融合会爆寄存器、爆共享内存，反而比不融合还慢。极端情况要手写 `xla.dont_fuse` 提示。

4. **HLO 报错读不懂**：错误经常指向编译后的 HLO 算子名（`fusion.137`），跟用户写的 Python 行号对不上。新人常被绕晕。

## 适用 vs 不适用场景

**适用**：
- 计算图相对固定、shape 不大变（训练、批量推理）
- 算子细碎、kernel 启动开销占比高的场景
- 必须用 TPU——TPU 没编译器就跑不了
- JAX / TensorFlow 重度用户，开 `@jit` 就是 XLA 接手

**不适用**：
- 控制流极复杂、动态 shape 频繁的代码（LLM 推理 KV cache 早期是痛点）
- 想用最新硬件指令但 XLA 还没支持时
- 调试期、原型期——编译开销让迭代变慢
- 框架已有手工 cuDNN 重度优化的固定模型，XLA 收益有限

## 历史小故事（可跳过）

- **2017 年**：Google 公开 XLA，最初目标是给 TensorFlow 做后端加速。
- **2018 年**：TPU v2 / v3 上线，XLA 成 Google 内部 ML infra 主力——TPU 没 cuDNN，全靠 XLA 现场 codegen。
- **2020 年**：JAX 起飞，把 XLA 推到研究社区主流；`jax.jit` 几乎成 ML 论文标配。
- **2022 年**：StableHLO 提出，把 HLO 标准化成跨框架 IR。
- **2023 年**：Google 把 XLA 独立成 **OpenXLA** 项目，PyTorch / Alibaba 等加入；MLIR 与 XLA 走向融合。

思想脉络：Halide（2013）开了"算法与调度分离"的头，TVM 把它通用化，XLA 把它工业化到云规模训练。

## 学到什么

1. **编译器思路打败解释执行**——ML 框架从"逐 op 调库"进化到"整图编译"，是过去 10 年最重要的性能跃迁
2. **统一 IR 是杠杆**——前端三家、后端三家、再多组合都不爆炸，关键是中间那层 HLO
3. **融合是核心收益来源**——内存带宽往往是真瓶颈，把多算子合一个 kernel 直接省读写
4. **编译开销要算账**——jit 第一次很慢，shape 一变就重编，生产里要做静态化设计

## 延伸阅读

- 官方架构文档：[OpenXLA Architecture](https://openxla.org/xla/architecture)（StableHLO + 三段 pipeline 入门）
- 视频：[Matthew Johnson — JAX, MLPerf and XLA](https://www.youtube.com/results?search_query=jax+xla+matthew+johnson)（JAX 作者亲讲 XLA）
- JAX 官方："How JAX primitives work"（讲 HLO 怎么从 Python 函数出来）
- [[halide]] —— 算法与调度分离的奠基论文
- [[tvm]] —— 与 XLA 同代的开源 ML 编译器
- [[mlir]] —— 与 XLA 的下一代统一 IR 框架

## 关联

- [[halide]] —— 算法与调度分离的思想，被 XLA 内化成"HLO + backend pass"
- [[tvm]] —— 同代 ML 编译器，更偏开源生态、对小厂硬件更友好
- [[mlir]] —— LLVM 之上的多层 IR 框架，OpenXLA 正在与它合流
- [[llvm]] —— XLA 后端代码生成的基石，PTX / 汇编都从这里出
- [[ssa]] —— LLVM IR 的形式基础，HLO 也借鉴了 SSA 风格的命名
- [[kildall-dataflow]] —— XLA 的目标无关优化（CSE、buffer 分析）走的就是经典数据流框架
- [[attention]] —— Transformer 的核心算子，TPU 上能跑得快全靠 XLA fusion

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[alpa-2022]] —— Alpa — 把张量/流水/数据并行统一成一道搜索题
- [[attention]] —— Attention Is All You Need
- [[gshard-2020]] —— GShard — 用注解让 600B 模型自动跨设备切片
- [[halide]] —— Halide — 把"算什么"和"怎么算"分开写
- [[kildall-dataflow]] —— Kildall 数据流框架 — 用一套格论统一所有全局编译优化
- [[llvm]] —— LLVM — 模块化编译器框架
- [[mlir]] —— MLIR — 给编译器一套乐高，每层抽象都能搭自己的方言
- [[numpy]] —— NumPy — Python 科学计算基石
- [[ssa]] —— SSA — 静态单赋值形式
- [[taso-2019]] —— TASO — 让机器自己发现深度学习图重写规则
- [[triton-2019]] —— Triton 2019 — 让 Python 写出贴近 cuBLAS 的 GPU kernel
- [[triton-llm]] —— Triton — 让 Python 程序员也能写出贴近 cuBLAS 的 GPU kernel
- [[tvm]] —— TVM — 让一份模型能在所有硬件上跑得快
- [[tvm-2018]] —— TVM OSDI 2018 — 把 Halide 思想搬到深度学习

