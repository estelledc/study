---
title: TensorFlow — 把神经网络拆成数据流图再跑到任何机器上
来源: 'Abadi et al., "TensorFlow: A System for Large-Scale Machine Learning", OSDI 2016'
日期: 2026-05-31
分类: 机器学习系统
难度: 中级
---

## 是什么

TensorFlow 是 Google 2015 年开源的机器学习系统。它的核心想法是把一个神经网络**先画成一张图**，再让运行时把这张图切片、分发到 CPU/GPU/TPU 上跑。

日常类比：像菜谱与厨房分离。你写菜谱（图）的时候不关心几口锅几个灶；执行的时候系统自己分锅分火。换厨房（GPU 改 TPU）只换执行器，不改菜谱。

它的前身叫 DistBelief，是 Google 内部 2011 年的训练框架，只能跑特定模型架构。TensorFlow 是 Google 写给"任意模型 + 任意硬件 + 任意规模"的第二代系统。

## 为什么重要

不理解 TensorFlow 这一代设计，很多事情解释不清：

- 为什么 PyTorch 的 eager 模式当年被吹成"革命"——因为它的对手就是 TF 的"先建图再跑"
- 为什么后来出现 `tf.function` / `torch.compile`——大家又想要图带来的优化
- 为什么 JAX 的 `jit + grad + vmap` 看起来熟悉——它继承了 TF 的图思想再做减法
- 为什么"算子"（operator）这个词在 ML 系统里这么基础——TF 把它定成了图的节点单位

简单说：现代 ML 系统的设计词汇表（图、算子、设备、自动微分、参数服务器）大半是 TF 这一代论文沉淀下来的。

## 核心要点

TensorFlow 的设计可以拆成 **四块**：

1. **数据流图（dataflow graph）**：节点是算子（matmul / relu / conv），边是张量（多维数组）。整张图描述一次前向 + 反向 + 更新。类比：流程图上的方框与箭头。

2. **可变状态作为节点**：模型参数是图里一种特殊节点叫 **Variable**（像可改写的记事本格子，不是一次性纸条）。这让"参数更新"也变成图里的一条边。DistBelief 把状态藏在外部参数服务器，TF 把它拉进图里。

3. **自动切分到设备**：运行时按设备约束和数据依赖把图切成子图；跨机用 **send/recv** 节点桥接（像快递收发点，专门负责把张量寄到另一台机器）。

4. **同一抽象同时支持训练与推理**：训练多一条反向 + 优化器子图，推理只跑前向。两边共享算子和图调度器。

四块加起来给出一个统一描述：**「程序 = 图」**。

## 实践案例

### 案例 1：一个最小图（TF1 图模式）

```python
import tensorflow.compat.v1 as tf
tf.disable_v2_behavior()
W = tf.Variable(tf.random.normal([784, 10]))
b = tf.Variable(tf.zeros([10]))
x = tf.placeholder(tf.float32, [None, 784])
logits = tf.matmul(x, W) + b
with tf.Session() as sess:
    sess.run(tf.global_variables_initializer())
    out = sess.run(logits, feed_dict={x: [[0.0] * 784]})
```

**逐部分解释**：前四行只建图，不算数；`Session` 才真正切片、上设备、执行；`feed_dict` 把数据灌进 `placeholder`。建图与执行是两个世界——这是 TF1 最被诟病、也最能优化的点。

### 案例 2：自动微分怎么发生

```python
loss = tf.reduce_mean(tf.nn.softmax_cross_entropy_with_logits_v2(labels=y, logits=logits))
grads = tf.gradients(loss, [W, b])  # 运行时生成反向子图
```

三步：① 你只写前向 `loss`；② 调 `tf.gradients`，运行时反向遍历图，查每个算子的"反向规则表"（matmul 的反向是另一次 matmul）；③ 得到的 `grads` 也是图节点，要 `sess.run(grads, ...)` 才算出数值。有图就能工业化反向模式自动微分。

### 案例 3：分布式训练的两种图

```
异步 PS： Worker──梯度──▶ PS(Variable) ──新权重──▶ Worker   # 不等齐
同步：    Worker1/2/3 ──all-reduce(梯度求平均)──▶ 各 Worker 同更新
```

`all-reduce` 像全班把作业收齐再发回平均分——大家步调一致。论文用 Inception-v3 测多 worker 吞吐：异步可扩到上百 worker 但单 worker 利用率下降；同步更稳，并用备份 worker 缓解掉队（50-worker 配置下约 9.5% normalized speedup）。换策略只换图结构，模型代码不动。

### 案例 4：算子和内核分离

`tf.matmul` 在图里是一个**算子**（接口），下面挂多个**内核**（CPU / CUDA / TPU 各一份实现）。加新硬件只接内核，不改图——后来的 PyTorch dispatcher、JAX lax 沿用同一分层。

## 踩过的坑

1. **静态图调试痛**：图建好才能跑，`print(x)` 只看到 `Tensor("matmul:0", ...)`，要插 `tf.Print`——这是 PyTorch eager 吃掉研究用户的主因。
2. **Session 与 Graph 是两个对象**：图描述结构，Session 管设备与执行；乱开多个 Session 会状态对不上。
3. **Variable 共享要用 scope**：写两遍 `tf.Variable(...)` 会创两个变量；复用得 `tf.variable_scope(..., reuse=True)`，TF2 用 Keras layer 重做了。
4. **同步/异步收敛性不同**：论文当时主推异步 PS；ResNet 时代工业界大多回到同步 all-reduce，因为大规模异步更抖。

## 适用 vs 不适用场景

**适用**：

- 多机多卡训练（例如 ≥8 GPU、要 Serving 延迟 SLA）——图 + 设备分配天然支持
- 推理服务化（TensorFlow Serving）——同一张图直接部署
- 跨硬件后端（CPU / GPU / TPU）与图级优化（XLA、算子融合）

**不适用**：

- 研究期快速实验（单机单卡、参数约 <1e7、迭代以分钟计）——eager（PyTorch / JAX）更快
- 控制流复杂的模型（树、变长 RNN、RL）——静态图要 `tf.cond` / `tf.while_loop`，别扭
- 小模型小数据——建图开销大于收益

## 历史小故事（可跳过）

- **2011 年**：Google Brain 用 DistBelief 训 ImageNet，框架太死，只支持 feedforward + 异步 PS。
- **2015 年 11 月**：TensorFlow 开源（初始版本），带着 DistBelief 经验与 Theano 的图思想。
- **2016 年**：本论文发于 OSDI；Google 同期公布 TPU 硬件（论文见 Jouppi et al., ISCA 2017）。
- **2017 年 2 月**：TensorFlow 1.0 发布，承诺 Python API 稳定。
- **2017–2019 年**：PyTorch 用 eager 抢走研究市场；2019 年 TF 2.0 默认 eager + `tf.function` 保留图给生产。

之后图思想没死——JAX 的 `jit`、PyTorch 2.0 的 `torch.compile` 都是回到图。

## 学到什么

1. **「程序 = 图」是 ML 系统的关键抽象**——计算与调度解耦，才能跨硬件跨规模复用。
2. **状态进入图**比 DistBelief 的"状态在外"更优雅——分布式策略只是图变换。
3. **自动微分需要图**——反向规则表加一遍遍历就能生成反向。
4. **静态图 vs 动态图不是非此即彼**——eager 调试 + 图部署是后来的共识。
5. **基础设施的设计语言会沉淀十年**——「算子 / 图 / 设备 / Variable」到今天还在用。

## 延伸阅读

- 论文 PDF：[TensorFlow OSDI 2016](https://www.usenix.org/system/files/conference/osdi16/osdi16-abadi.pdf)
- 前作：[DistBelief NIPS 2012](https://research.google/pubs/large-scale-distributed-deep-networks/)
- 开源公告：[TensorFlow open-sourced (2015)](https://research.google/blog/tensorflow-googles-latest-machine-learning-system-open-sourced-for-everyone/)
- [[pytorch]] —— 主要竞品，先 eager 后图
- [[jax]] —— Google 下一代，图思想 + 函数式
- [[alpa-2022]] —— 把设备分配推到自动并行

## 关联

- [[pytorch]] —— 同代框架，靠 eager 调试体验击穿研究市场
- [[jax]] —— Google 第三代 ML 系统，把 TF 的图思想做成纯函数变换
- [[alpa-2022]] —— 把 TF 的设备分配自动化为搜索问题
- [[keras]] —— TF 2 默认前端，把"建图"包成 layer 对象
- [[mlx]] —— Apple Silicon 的同思想精简版
- [[ssa]] —— 编译器的图思想，TF 的图与 SSA 是远亲
- [[kildall-dataflow]] —— 数据流分析的理论祖先

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[adam-2014]] —— Adam — 让深度学习自己挑步长的优化器
- [[amdahl-law-1967]] —— Amdahl 定律 — 串行比例决定并行加速比的上界
- [[bonawitz-fl-system-2019]] —— Bonawitz 2019 — Google 联邦学习的工业级系统设计
- [[ray-2018]] —— Ray 2018 — 把任务和演员放进同一个分布式舞台
- [[tvm-2018]] —— TVM OSDI 2018 — 把 Halide 思想搬到深度学习
- [[tflite-micro]] —— TensorFlow Lite Micro — 把小模型塞进微控制器
