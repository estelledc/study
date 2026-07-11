---
title: 'JAX — Google 函数式数值计算'
来源: 'https://github.com/jax-ml/jax'
日期: '2026-05-30'
分类: '数据科学与 AI'
难度: '中级'
---

## 是什么

JAX 是一个**让 NumPy 长出四个新技能**的库：自动求导（`grad`）、即时编译（`jit`）、自动批量化（`vmap`）、跨设备并行（`pmap` / `shard_map`）。日常类比：把 NumPy 当成一台普通烤箱，JAX 给它装了**四个魔法旋钮**——同一份函数，转一下旋钮就变成"会自己求导"或"会自己 GPU 并行"的版本。

你写：

```python
import jax, jax.numpy as jnp

def f(x):
    return jnp.sin(x) ** 2 + x

df = jax.grad(f)          # df/dx
batched = jax.vmap(df)    # 一次算一整批
fast = jax.jit(batched)   # XLA 编译

print(fast(jnp.arange(5.0)))   # 一次性算 5 个点的导数
```

四行就把"求导 + 批量 + 编译"叠在同一个函数上。这种**函数即变换对象**的风格是 JAX 的灵魂。

后端是 Google 的 XLA，自动下发到 CPU / GPU / TPU。DeepMind / Anthropic / xAI / AlphaFold 训练栈底座。

## 为什么重要

不理解 JAX，下面这些事都没法解释：

- 为什么 DeepMind 的 AlphaFold、Gemini 训练前端、Anthropic 的训练栈都偏好 JAX 而不是 [[pytorch]]
- 为什么 Google TPU 上跑大模型，**JAX 几乎是唯一一线选项**
- 为什么 `vmap` 出现后，研究者**再也不手写 batch 维度**——一份单样本代码自动变成批处理代码
- 为什么"函数式 + 不可变" 在 2026 年的深度学习里反而比命令式更快——纯函数对编译器最友好

## 核心要点

JAX 的核心是 **四个函数变换**，作用对象都是 Python 函数：

1. **`grad`（自动微分）**：把函数 `f` 变成 "返回梯度的函数 `df`"。本质是**反向模式自动微分**，但 API 是函数变换不是 tape。

2. **`jit`（即时编译）**：JAX 用**抽象值**追踪你的 Python 函数一次，生成 `jaxpr` 中间表示，再交给 XLA 编译成融合的 GPU/TPU kernel。下次调用走编译版。

3. **`vmap`（自动批量化）**：把"对单个样本"的函数自动改写成"对一个 batch"的函数，**不用你手动加维度**。等价于把 for 循环消进 kernel。

4. **`pmap` / `shard_map` / `jit + sharding`（设备并行）**：把同一个函数复制到多张卡，输入按指定轴切分。新代码用 `jax.sharding` + `jit` 做 SPMD，`pmap` 已是历史 API。

四个变换可以**任意组合嵌套**：`jit(grad(vmap(f)))` 是合法的，编译器替你把它们融合成一个最优 kernel。

## 实践案例

### 案例 1：用 grad 求一个简单导数

```python
import jax
def f(x): return x ** 3 + 2 * x
print(jax.grad(f)(2.0))   # 14.0  ← 3*x^2 + 2 在 x=2
```

和 [[pytorch]] 不同——**没有 `requires_grad`、没有 `.backward()`**。`grad` 是一个把函数变成函数的纯变换。

### 案例 2：vmap 让单样本函数秒变批处理

```python
def predict(params, x):           # 处理单个样本
    return jnp.dot(params, x)

batched = jax.vmap(predict, in_axes=(None, 0))   # params 不批量, x 批量
batched(params, X)                # X.shape = (1024, 784) 一次性跑
```

如果你写 [[pytorch]]，这一步通常要手写 `unsqueeze` / `broadcast`。`vmap` 把这件苦差事变成一个参数。

### 案例 3：jit 编译一个完整训练 step

```python
@jax.jit
def step(params, x, y):
    loss, grads = jax.value_and_grad(lambda p: ((p @ x - y) ** 2).mean())(params)
    return params - 0.01 * grads, loss
```

第一次调用编译，后续每次调用都跑融合后的 XLA kernel。**eager 写法 + 编译性能** 一起拿——和 [[pytorch]] 2.0 的 `torch.compile` 殊途同归，但 JAX 一开始就长这样。

## 踩过的坑

1. **数组不可变**：`x[0] = 1` 直接报错。要写 `x = x.at[0].set(1)`——JAX 函数式哲学的硬约束。新人最先被绊倒的就是这条。

2. **jit 下 Python `if` / `for` 只在 trace 时跑一次**：分支依赖**输入值**时要改用 `jax.lax.cond` / `jax.lax.fori_loop`。否则永远走第一次 trace 时那一支。

3. **PRNG key 必须显式 split**：`jax.random.normal(key)` 同一个 key 永远给同一个数。每次随机前要 `key, subkey = jax.random.split(key)`——为了**纯函数 + 可复现**牺牲便利。

4. **shape 必须静态**：jit 下输入 shape 一变就**重新编译**。变长序列要 padding 到固定长度，否则训练循环慢到怀疑人生。

5. **`pmap` 已经过时**：2024 年后多卡 SPMD 用 `jax.sharding.Mesh` + `jit`，`pmap` 文档还在但新代码不应再写。

## 适用 vs 不适用场景

**适用**：

- 大规模科研训练（AlphaFold、扩散模型、LLM 预训练）
- TPU 训练栈（XLA 是 TPU 的母语）
- 需要高阶导数 / 雅可比 / 海森的科学计算（`grad(grad(f))` 一行）
- 需要任意函数变换组合（meta-learning、隐式微分）

**不适用**：

- 研究原型快速调试（动态 shape / 调试 print 体验不如 [[pytorch]]）
- 工业部署到移动端 / 嵌入式 → 转 [[tensorflow]] Lite / ONNX 更顺
- 已有大量 PyTorch 生态依赖（HuggingFace 大部分模型先有 PT 实现）
- 需要 "改一个 tensor 的某个值就生效" 的命令式工作流

## 历史小故事（可跳过）

- **2018-12**：Google Brain 的 Matt Johnson、Roy Frostig、Peter Hawkins 把 Autograd（一个 Python 自动微分库）和 XLA 拼起来，发布 JAX 0.1
- **2020**：DeepMind 把内部框架 Sonnet（基于 [[tensorflow]]）迁到 JAX，催生 Haiku 和后来的 Flax
- **2021**：AlphaFold 2 公开，训练栈全 JAX
- **2024-04**：JAX 仓库从 `google/jax` 迁到 `jax-ml/jax`，治理半独立
- **现在**：~31k stars，Anthropic / xAI / Google DeepMind 大模型训练主力

## 学到什么

1. **函数变换 > tape 记录**——`grad` 是函数到函数的映射，比"建一棵动态图"更接近数学本质
2. **不可变 + 纯函数对编译器友好**——XLA 能做的融合优化远比命令式框架激进
3. **同一份代码 = 单样本代码**——`vmap` 让你只关心算法本质，批量维度交给变换
4. **trace-once 编译模型**有代价——动态 shape 和 Python 控制流是它的天敌
5. **生态是分层的**：JAX 只管变换，[[keras]] 3 / Flax / Haiku / Equinox 在上面盖神经网络层
6. **TPU 与 JAX 互相成全**——XLA 是 TPU 的本命编译器，JAX 是 XLA 的最佳前端

## 延伸阅读

- 官方文档：[JAX Documentation](https://jax.readthedocs.io/) — 从 "Thinking in JAX" 开始读
- 教程合集：[JAX 101](https://jax.readthedocs.io/en/latest/jax-101/index.html) — 一步步把 NumPy 思维换成 JAX 思维
- 代表论文：[Compiling machine learning programs via high-level tracing](https://mlsys.org/Conferences/doc/2018/146.pdf)（JAX 设计论文）
- 神经网络层：[Flax NNX](https://flax.readthedocs.io/) / [Equinox](https://docs.kidger.site/equinox/)
- [[pytorch]] —— 命令式深度学习框架的代表，对照看能更快理解 JAX
- [[lambda-calculus]] —— 函数变换思想的数学根基

## 关联

- [[pytorch]] —— 命令式 + 动态图 vs JAX 函数式 + trace 编译，是深度学习两大范式
- [[tensorflow]] —— 同样后端是 XLA，但 JAX 是更轻、更函数式的前端
- [[keras]] —— Keras 3 把 JAX 列为一等后端，与 PyTorch / TF 平级
- [[accelerate]] —— HuggingFace 的设备/分布式抽象，JAX 自带 sharding 不需要额外封装
- [[hindley-milner]] —— JAX trace 期间用抽象值替代具体值，思路接近"占位符 + 解方程"
- [[lambda-calculus]] —— `grad` / `vmap` / `jit` 是高阶函数变换的工程化体现
- [[llvm]] —— XLA 与 LLVM 都走"高级 IR → 后端代码生成"的多级 IR 路线
- [[ssa]] —— jaxpr 是 JAX 的 SSA 风格中间表示

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[adam-2014]] —— Adam — 让深度学习自己挑步长的优化器
- [[alpa-2022]] —— Alpa — 把张量/流水/数据并行统一成一道搜索题
- [[cudnn-2014]] —— cuDNN — 把卷积写成矩阵乘，让所有深度学习框架共享底层加速
- [[kokkos-2014]] —— Kokkos — 一份 C++ 代码同时跑 CPU、GPU、Xeon Phi
- [[li-2018-redner]] —— redner — 让光线追踪能反向传播过几何边缘
- [[nimier-david-2019-mitsuba2]] —— Mitsuba 2 — 一份渲染代码同时编出 CPU / GPU / 可微版
- [[tensorflow-osdi-2016]] —— TensorFlow — 把神经网络拆成数据流图再跑到任何机器上
- [[colossal-ai]] —— Colossal-AI — 大模型训练系统
- [[deepspeed]] —— DeepSpeed — 微软分布式训练库
- [[flax]] —— Flax — JAX 上的神经网络库
- [[keras]] —— Keras 3 — 一份模型代码跑三套后端
- [[mediapipe]] —— MediaPipe — Google ML 多模态流水线
- [[projects/megatron-lm]] —— Megatron-LM — NVIDIA 张量并行库
- [[mitsuba3]] —— Mitsuba 3 — 研究向可微渲染器
- [[mlx]] —— MLX — Apple Silicon 统一内存原生 ML 框架
- [[optax]] —— Optax — JAX 优化器组合库
- [[twgl]] —— TWGL — 极薄 WebGL helpers
