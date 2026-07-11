---
title: 'Optax — JAX 优化器组合库'
来源: 'https://github.com/google-deepmind/optax'
日期: '2026-05-30'
分类: '数据科学与 AI'
难度: '中级'
---

## 是什么

Optax 是 [[jax]] 生态里**专门管"优化器"的小库**，DeepMind 主导，Apache 2.0。日常类比：把"优化器"想成做菜——以前 [[pytorch]] 卖给你一整盒"红烧肉成品（`torch.optim.Adam`）"，里面酱、糖、料酒都焊死了想换得拆饭盒；Optax 把每种调料拆成独立小瓶（梯度裁剪、动量、学习率调度、weight decay），用 `chain(...)` 像拼乐高一样串起来——你随时能抽掉一段、塞一段。

你写：

```python
import optax, jax.numpy as jnp

tx = optax.chain(
    optax.clip_by_global_norm(1.0),               # 1. 先裁剪超大梯度
    optax.scale_by_adam(b1=0.9, b2=0.999),        # 2. Adam 自适应缩放
    optax.add_decayed_weights(0.01),              # 3. AdamW 解耦权重衰减
    optax.scale_by_schedule(optax.cosine_decay_schedule(1e-3, 10_000)),
    optax.scale(-1.0),                            # 5. 梯度下降是负方向
)

params = {"w": jnp.ones(4)}
state = tx.init(params)                            # 状态在外
grads = {"w": jnp.array([0.1, 0.2, -0.3, 0.4])}
updates, state = tx.update(grads, state, params)
params = optax.apply_updates(params, updates)
```

注意一个反直觉的设计：**`state` 是和优化器分开存的**——优化器只是"配方"，状态（动量、二阶矩）是外面的"食材袋"。这是 Optax 函数式哲学的核心，也是它能被 [[jax]] 的 `jit` / `grad` / `vmap` 安全包住的原因。

跑在 [[jax]] + XLA 上，CPU / GPU / TPU 通吃。**[[flax]] / Haiku / AlphaFold / Gemma / MaxText** 训练栈底层全是它。

## 为什么重要

不理解 Optax，下面这些事都没法解释：

- 为什么 [[jax]] / [[flax]] 这套生态从来不学 [[pytorch]] 把 `optimizer.step()` 写成 in-place ——纯函数才能进 `jit`
- 为什么 DeepMind 开源代码里**优化器永远是 `tx = chain(...)` 一长串**，而不是 `Adam(lr=1e-3)` 一行
- 为什么"AdamW"在 Optax 里**根本不是一个新优化器**，只是 `chain(scale_by_adam, add_decayed_weights, ...)` 的别名
- 为什么 warmup + cosine 这种"两段式学习率"在 Optax 里两行就能拼出来，[[pytorch]] 要写一个 `LambdaLR` 类

## 核心要点

Optax 的全部世界观可以压成 **一个 type + 三个动作**：

1. **`GradientTransformation`**：一个优化器 = 一对纯函数 `(init, update)`。`init(params) -> state` 给参数初始化状态；`update(grads, state, params) -> (updates, new_state)` 把梯度变成"该往参数加的量"。**纯函数**——同样输入永远同样输出，没有藏在对象里的可变属性。

2. **`chain(*transforms)`**：把多个 `GradientTransformation` **首尾相接**，前一个的 `updates` 变成后一个的 `grads`。状态会**自动合并**成一个 tuple。这就是 Optax 的"乐高接口"。

3. **`apply_updates(params, updates)`**：最后一步把 `updates` 加到 `params` 上。注意 `updates` 已经带了**负号**（`scale(-1)` 那一步），所以这里是加不是减——这是新人最常踩的符号坑。

一个真实的 AdamW 长这样：

```python
optax.adamw(1e-3, weight_decay=0.01)  # 第一参是 learning_rate，不要写 lr=
# 等价于：
optax.chain(
    optax.scale_by_adam(),
    optax.add_decayed_weights(0.01),
    optax.scale_by_learning_rate(1e-3),  # 内部再 scale(-1)
)
```

每一段都能**单独抽出来换**——这就是为什么 Optax 在 chain 上花了所有筹码。

## 实践案例

### 案例 1：和 [[flax]] 配合的标准训练循环

```python
import flax.linen as nn, optax, jax, jax.numpy as jnp

model = nn.Dense(10)
params = model.init(jax.random.PRNGKey(0), jnp.ones((1, 784)))
tx = optax.adamw(1e-3, weight_decay=0.01)
state = tx.init(params)

@jax.jit
def step(params, state, x, y):
    def loss_fn(p):
        logits = model.apply(p, x)
        return optax.softmax_cross_entropy_with_integer_labels(logits, y).mean()
    grads = jax.grad(loss_fn)(params)
    updates, state = tx.update(grads, state, params)
    return optax.apply_updates(params, updates), state
```

**注意 `state` 显式跟着函数走**——这是 Optax 能被 `jit` 编译、能被 `vmap` 同时跑很多份的关键。[[pytorch]] 的 `optimizer.step()` 是 in-place 副作用，进不了 `jit`。

### 案例 2：warmup + cosine 学习率两行拼出来

```python
schedule = optax.warmup_cosine_decay_schedule(
    init_value=0.0, peak_value=3e-4,
    warmup_steps=1000, decay_steps=100_000, end_value=1e-5)

tx = optax.chain(
    optax.clip_by_global_norm(1.0),
    optax.scale_by_adam(),
    optax.scale_by_schedule(schedule),
    optax.scale(-1.0),
)
```

`schedule` 只是一个 `step -> float` 的函数，`scale_by_schedule` 把它当一个变换接进 chain。**学习率本身就是一个梯度变换**——这是 Optax 把"调度器"和"优化器"统一的洞见。

### 案例 3：[[pytorch]] 风格 vs Optax 风格

```python
# PyTorch：状态藏在对象里
opt = torch.optim.AdamW(model.parameters(), lr=1e-3, weight_decay=0.01)
loss.backward()
opt.step(); opt.zero_grad()

# Optax：状态在外、纯函数变换
tx = optax.adamw(1e-3, weight_decay=0.01)
state = tx.init(params)
updates, state = tx.update(grads, state, params)
params = optax.apply_updates(params, updates)
```

[[pytorch]] 把"参数 / 梯度 / 优化器状态"绑进一个对象——写得短，但难复制、难序列化、难进 `jit`。Optax 把三者拆开，全是 PyTree——多写两行，换来**完全可被 [[jax]] 函数变换包住**。

## 踩过的坑

1. **顺序敏感**：`chain` 里 `scale_by_schedule` 必须**在** `scale_by_adam` **之后**，否则学习率乘到原始梯度上而不是 Adam 缩放后的值，训练不收敛。
2. **符号陷阱**：`updates` 是负号方向（`scale(-1)`），最后用 `apply_updates` 是**加**不是减。自己手写 `params - updates` 会直接发散。
3. **weight decay ≠ L2**：`add_decayed_weights` 是 AdamW 风格的**解耦权重衰减**，不是 L2 正则（L2 会先经 Adam 缩放，效果完全不同）。AdamW 论文（Loshchilov & Hutter，arXiv 2017 / ICLR 2019）整篇就在说这件事。
4. **EMA / `multi_steps` wrapper 改变 state 形状**：自定义 chain 时如果再叠一层 `optax.MultiSteps`，`state` 会多嵌一层 tuple，老代码取 `state[0]` 就崩——把 wrapper 留到最外层。
5. **PyTree 结构必须一致**：`tx.init(params)` 返回的 state 形状由 `params` PyTree 决定。如果训练中途换了 [[flax]] 模型结构，state 不能复用，要重 `init`。

## 适用 vs 不适用场景

**适用**：

- [[jax]] / [[flax]] / Haiku 任何想被 `jit` / `vmap` / `pmap` 包住的训练栈
- 需要**精细控制优化器组成**的研究——LR schedule × weight decay × grad clip × EMA 的笛卡尔积
- 大模型训练（Gemma / AlphaFold / MaxText 已是事实标准）

**不适用**：

- 纯 [[pytorch]] / [[pytorch-lightning]] 项目——直接用 `torch.optim`，没必要套
- 纯 [[keras]] 高层训练——`model.compile(optimizer=...)` 已够用
- 推理 only（不需要梯度更新）——根本不需要优化器

## 历史小故事（可跳过）

- **2018 之前**：DeepMind 内部把"优化器"散在 `jax_optimizers` / `rlax` 等小仓里，重复造轮子
- **2020 初**：DeepMind 工程师把这些碎片统一成 Optax，开源到 `deepmind` 组织
- **2021**：1.0 版稳定 `GradientTransformation` API，`chain` 成为一等公民
- **2024-2025**：加入 Lion（Chen 2023） / Adafactor / Schedule-Free 等新优化器，服务 Gemma / AlphaFold 3 训练

## 学到什么

1. **优化器 = 函数变换链**——这个抽象比"一个 Adam 类"强一个数量级，因为它把"调度器 / 裁剪 / 衰减 / 缩放"全收编成同一个 type
2. **状态在外、纯函数在内**——和 [[flax]] 的 linen 一脉相承，是 [[jax]] 整个生态的统一哲学
3. **可组合 > 现成品**——`adamw(...)` 只是 `chain(...)` 的快捷方式；真到要换组件时，你直接拆 chain 就行
4. **API 设计的力量**：把同一件事（梯度变换）压成一个 type，整个库的复杂度立刻塌成乐高积木

## 延伸阅读

- 官方 docs：[Optax 文档](https://optax.readthedocs.io/)（"Combining Optimizers" 一节是入门必读）
- 论文：[Loshchilov-Hutter, Decoupled Weight Decay Regularization, ICLR 2019](https://arxiv.org/abs/1711.05101)（解释为什么 AdamW ≠ Adam+L2）
- [[jax]] —— Optax 的宿主，没有 JAX 就没有 Optax
- [[flax]] —— 最常和 Optax 配套的神经网络库
- [[pytorch]] —— 对照组，理解为什么 Optax 选了相反的设计

## 关联

- [[jax]] —— Optax 是 JAX 函数变换哲学在"优化器"领域的延伸
- [[flax]] —— 标配组合：Flax 管模型，Optax 管优化
- [[pytorch]] —— 对照面：`torch.optim` 把状态藏在对象里，Optax 把状态拽到外面
- [[pytorch-lightning]] —— 同样的"训练循环抽象"问题，PL 选了类继承，Optax 选了函数组合
- [[keras]] —— Keras 3 也支持 JAX 后端，但 optimizer 还是封装风格，没走 Optax 路线

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
