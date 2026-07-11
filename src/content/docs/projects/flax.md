---
title: 'Flax — JAX 上的神经网络库'
来源: 'https://github.com/google/flax'
日期: '2026-05-30'
分类: '数据科学与 AI'
难度: '中级'
---

## 是什么

Flax 是**给 [[jax]] 配的神经网络库**。日常类比：JAX 像一台只卖"面粉、糖、酵母"的食材店——它给你 `grad` / `jit` / `vmap` 这些原料，但不直接卖蛋糕。Flax 是开在 JAX 楼上的"蛋糕店"，把神经网络层（Linear / Conv / Attention）、参数管理、训练状态打包好。

你写：

```python
import flax.linen as nn
import jax, jax.numpy as jnp

class MLP(nn.Module):
    @nn.compact
    def __call__(self, x):
        x = nn.Dense(128)(x); x = nn.relu(x)
        return nn.Dense(10)(x)

model = MLP()
params = model.init(jax.random.PRNGKey(0), jnp.ones((1, 784)))
logits = model.apply(params, jnp.ones((1, 784)))
```

注意一个反直觉的设计：**`params` 是和 `model` 分开存的**——模型只是一份"配方"，参数是外面的"食材袋"。这是 Flax 函数式哲学的核心。

后端是 [[jax]] + XLA，跑在 CPU / GPU / TPU。**Google 的大模型 JAX 栈常站在 Flax 上**（Gemma 官方实现是 Flax）；DeepMind 早期大作如 AlphaFold 2 则用姊妹库 Haiku。两者都是「JAX 上的神经网络层」，API 哲学相近。

## 为什么重要

不理解 Flax，下面这些事都没法解释：

- 为什么 [[jax]] 这么强还要再套一层——JAX 只卖原料，Flax 才是蛋糕
- 为什么 Gemma 等 Flax 代码里参数到处显式传，而 AlphaFold 2 同类写法却 import Haiku——同生态两条线
- 为什么 Flax 2024 又推出一套全新的 `nnx` API，**和老的 `linen` 风格完全不一样**
- 为什么大模型训练偏好 Flax 而不是 [[keras]]——Keras 3 是「跨后端最大公约数」，Flax 是「为 JAX 量身定做」

## 核心要点

Flax 现在有**两套并存的 API**，新人最容易在这里迷路：

1. **linen（旧版，目前主流）**：Module 是**纯函数式 dataclass**——它**自己不存参数**，调 `model.init(rng, x)` 才返回参数 PyTree，调 `model.apply(params, x)` 才推理。好处：参数永远显式，对 [[jax]] 的 `jit` / `grad` / `vmap` 极友好。

2. **nnx（2024 新版）**：Module 像 [[pytorch]] 一样**内部存可变状态**——参数是 `nnx.Param` 字段，可以直接 `model.linear.kernel = ...` 改。要进 jit 时用 `nnx.split` 把"状态"和"纯函数"拆开。**牺牲一点函数式纯度，换 PyTorch 用户能秒懂**。

3. **TrainState**：`flax.training.train_state.TrainState` 把 `params` / `optimizer state` / `step` 打成一个 PyTree，配合 [[jax]] 的 `jit` 整体传进训练函数。配套优化器是 Optax。

4. **rng 显式**：和 [[jax]] 一样，每次随机操作都要传 `rng key`。`init` 时给一把，`Dropout` 时给一把，**永远不能复用**——纯函数 + 可复现的代价。

## 实践案例

### 案例 1：linen 风格的训练循环

```python
import optax
from flax.training import train_state

state = train_state.TrainState.create(
    apply_fn=model.apply, params=params, tx=optax.adam(1e-3))

@jax.jit
def step(state, x, y):
    def loss_fn(p):
        logits = state.apply_fn(p, x)
        return optax.softmax_cross_entropy_with_integer_labels(logits, y).mean()
    grads = jax.grad(loss_fn)(state.params)
    return state.apply_gradients(grads=grads)
```

注意 `state` 是个 PyTree，`@jax.jit` 整体编译；params 永远显式传，没有 [[pytorch]] 的 `.backward()`。

### 案例 2：nnx 风格——更像 PyTorch

```python
from flax import nnx

class MLP(nnx.Module):
    def __init__(self, rngs: nnx.Rngs):
        self.l1 = nnx.Linear(784, 128, rngs=rngs)
        self.l2 = nnx.Linear(128, 10,  rngs=rngs)
    def __call__(self, x):
        return self.l2(nnx.relu(self.l1(x)))

model = MLP(nnx.Rngs(0))
y = model(jnp.ones((1, 784)))   # 直接调，参数在 model 里
```

对从 [[pytorch]] / [[pytorch-lightning]] 转过来的人，`nnx` 学习曲线短一大截。

### 案例 3：参数 PyTree 长什么样

```python
jax.tree.map(lambda p: p.shape, params)
# {'params': {'Dense_0': {'kernel': (784,128), 'bias': (128,)},
#             'Dense_1': {'kernel': (128,10),  'bias': (10,)}}}
```

参数是**嵌套字典**，新人常误以为是普通 dict——实际是 PyTree，要用 `jax.tree.map` 操作才能保持 jit 友好。

## 踩过的坑

1. **linen 两种风格混用**：`@nn.compact` 内联定义层 vs `setup()` 显式定义。**别在同一个 Module 混用**——会报"variable already defined"。

2. **BatchNorm / Dropout 的状态分集合**：linen 里 `params` 和 `batch_stats` 是**两个独立集合**。训练时 `model.apply({'params': p, 'batch_stats': bs}, x, mutable=['batch_stats'])`，写错就 silent bug。

3. **nnx 是 2024 新 API，社区代码大多还是 linen**：找开源参考时先看版本。`pip install flax` 默认装最新，但 README 大半还是 linen 例子。

4. **保存模型用 orbax，不是 pickle**：`orbax.checkpoint.PyTreeCheckpointer` 是官方推荐——pickle 在多卡 sharding 下会爆。

5. **rng 不能复用**：忘记 split 直接传同一个 key 给 Dropout，整个 batch 的 mask 完全一样，模型不收敛——和 [[jax]] 的坑同宗。

## 适用 vs 不适用场景

**适用**：

- JAX 上的任意神经网络训练（MLP / CNN / Transformer / Diffusion）
- TPU 大规模训练（[[jax]] sharding + Flax Module）
- 需要高阶导数 / 自定义训练循环的研究（meta-learning、隐式微分）
- 复现 DeepMind / Google 论文的 reference 实现

**不适用**：

- 纯推理部署 → 直接 [[jax]] + 编译，Flax 抽象多余
- 已有大量 [[pytorch]] 代码 → 迁移成本远高于继续用 [[pytorch-lightning]]
- 想用 HuggingFace 主流模型 → 大部分先有 PT 版，Flax 实现少
- 想要"跨后端最大公约数" → 用 [[keras]] 3，它把 [[jax]] / [[pytorch]] / [[tensorflow]] 都当后端

## 历史小故事（可跳过）

- **2020**：Google Brain 推出 Flax，替代早期 `jax.experimental.stax`，对标 DeepMind 的 Haiku
- **2021**：AlphaFold 2 开源——训练/推理栈是 **Haiku + JAX**（不是 Flax）；同生态对照很有用
- **2022-2023**：linen API 稳定；Gemma 等 Google 开源 LLM 用 Flax；DeepMind 建议新项目改用 Flax
- **2024**：`nnx` 作为新一代 API 公开，定位「linen 的精神继任者」，但 linen 不废弃——两套长期并存

## 学到什么

1. **参数和模型分开**是函数式深度学习的核心——和 [[pytorch]] 把参数藏在 `self.linear.weight` 是两条路
2. **Flax 不是替代 [[jax]]**——它在 JAX 之上加"层 / 参数 / 训练状态"三件套，下面还是 grad/jit/vmap
3. **nnx vs linen 反映了一个张力**：函数式纯度 vs 命令式手感，Flax 选择两套都给
4. **Optax + orbax + Flax** 是 JAX 生态的"三件套"——分别对应优化器、checkpoint、神经网络

## 延伸阅读

- 官方文档：[Flax Documentation](https://flax.readthedocs.io/) — 先读 "Quick Start"，再选 linen 或 nnx
- nnx 教程：[Why NNX](https://flax.readthedocs.io/en/latest/why.html) — 解释为什么要新 API
- 参考实现：[Gemma in Flax](https://github.com/google-deepmind/gemma) — Google 官方开源 LLM
- [[jax]] —— 必须先理解 JAX 的函数变换思想
- [[pytorch]] —— 对照看能秒懂 Flax 函数式哲学的反差

## 关联

- [[jax]] —— Flax 是 JAX 之上的神经网络层，下面引擎完全是 JAX
- [[pytorch]] —— 命令式 + 参数藏在 self.x.weight；Flax linen 反过来 params 完全外置
- [[keras]] —— Keras 3 把 JAX 当后端之一；Flax 只为 JAX 服务，更深度
- [[tensorflow]] —— Flax 与 TF 共享 XLA 后端，但前端范式（函数式 vs 图）完全不同
- [[pytorch-lightning]] —— PyTorch 上的训练循环抽象；Flax 的 TrainState 是 JAX 侧对应物
- [[accelerate]] —— HuggingFace 的设备/分布式抽象；JAX 自带 sharding 不需要它

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[optax]] —— Optax — JAX 优化器组合库
