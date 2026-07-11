---
title: Ray — 把单机 Python 函数和类无缝扩展到整个集群
来源: Ray Documentation, https://docs.ray.io/
日期: 2026-05-31
分类: 基础设施
难度: 中级
---

## 是什么

Ray 是一套**让 Python 函数和类几乎不改写就能跑在整个集群上**的分布式计算框架。

日常类比：像一个**人才中介所**——你写好简历（函数），中介（调度器）按各公司空缺（节点资源）派人入职；如果是『带状态的雇员』（类的实例），中介就把这个人长期派驻到一个工位（固定 worker），后面所有任务都找他。

写起来是这样：

```python
import ray
ray.init()

@ray.remote
def square(x):
    return x * x

@ray.remote
class Counter:
    def __init__(self): self.n = 0
    def inc(self): self.n += 1; return self.n

futures = [square.remote(i) for i in range(10)]
print(ray.get(futures))           # 普通函数 → 任务（task）

c = Counter.remote()
print(ray.get([c.inc.remote() for _ in range(3)]))  # 类 → 有状态 actor
```

加一行 `@ray.remote`，函数变成可远程执行的任务，类变成有状态的 actor。

## 为什么重要

不理解 Ray，下面这些事就解释不通：

- 为什么 OpenAI、Uber、Pinterest、Spotify 等把大规模训练 / 推荐 / 服务跑在 Ray 上——它原生支持『训练 + 模拟 + 推理』混在一张拓扑里（mixed workload），是强化学习和 LLM 微调常见的形态
- 为什么 Tune / Serve / RLlib / Train 能『一行 import 就用集群』——它们都站在 Ray Core 的两条原语（task + actor）上
- 为什么调度讨论里『有状态 vs 无状态』是核心分叉——Ray 是少数把 actor 当一等公民的通用框架
- 为什么单机 Python 科学计算一上多机就卡在『传大数组』——Ray 用共享内存对象存储把 numpy 当指针传，而不是每次序列化拷贝

## 核心要点

Ray 的两条原语：

1. **Task**：无状态远程函数。`@ray.remote def f(...)` → `f.remote(args)` 返回 `ObjectRef`（取货单号，以后 `ray.get` 凭单取结果），调度到任意空闲 worker。
2. **Actor**：有状态远程类。`@ray.remote class C` → `C.remote()` 返回 actor handle，状态在固定 worker 进程里持久，所有方法调用都路由到同一进程。

四个底层组件咬合：

- **GCS**（Global Control Store）：head 上的元数据中心，存 actor 位置、节点状态、placement group（把一组资源『订成一桌』的预约单）。
- **Raylet**：每节点一个守护进程，负责本地调度 + 与 GCS 同步。
- **对象存储**（曾称 Plasma）：每节点一块共享内存，跨进程零拷贝传 numpy——这是 Ray 比 Celery / 普通 RPC 快的关键。
- **Worker**：执行 task / actor 的 Python 进程，Raylet 按需起停。

调度：每个 Raylet 先本地放任务，不够再问 GCS。DEFAULT 策略给节点打分，从利用率最低的约 20% 里随机选；任务优先去『参数对象在本地』的节点；actor 默认打散以避免热点。

上层库都基于 Core：Data（预处理）、Train（分布式训练）、Tune（超参搜索）、Serve（在线推理）、RLlib（强化学习）。

## 实践案例

### 案例 1：把单机 numpy 工作分到集群

沿用文首 `ray.init()`。步骤：① `ray.put` 把大数组放进对象存储；② 多个 task 只拿引用并行算；③ 一次 `ray.get` 收齐。

```python
import numpy as np

@ray.remote
def heavy(arr):
    return arr @ arr.T

big = np.random.rand(2000, 2000)
ref = ray.put(big)  # 放进共享内存，避免每次 .remote 复制
results = ray.get([heavy.remote(ref) for _ in range(8)])
```

8 个 task 拿到的是**指针**而不是副本。

### 案例 2：parameter server（actor）

步骤：① 起 ParamServer actor 存权重；② worker task 拉权重、算梯度；③ 把梯度打回 actor 更新。

```python
@ray.remote
class ParamServer:
    def __init__(self, w): self.w = w
    def get(self): return self.w
    def apply_grad(self, g): self.w -= 0.01 * g; return self.w

def compute_grad(w, batch):  # stub：真实场景换成反向传播
    return w * 0.0 + (batch - w.mean())

init_weights = np.ones(8)
ps = ParamServer.remote(init_weights)

@ray.remote
def worker(ps, batch):
    w = ray.get(ps.get.remote())
    grad = compute_grad(w, batch)
    return ray.get(ps.apply_grad.remote(grad))

batches = [np.random.rand(8) for _ in range(4)]
print(ray.get([worker.remote(ps, b) for b in batches]))
```

有状态 actor + 无状态 task，就是 RLlib / Train 内部的雏形。

### 案例 3：超参搜索一键并行

步骤：① 写 `train_fn(config)` 返回指标；② 用 `tune.loguniform` 定义搜参空间；③ ASHA 早停差 trial。

```python
from ray import tune
from ray.tune.schedulers import ASHAScheduler

def train_fn(config):
    # stub：真实场景换成模型训练；这里用假 loss 演示
    return {"score": -abs(config["lr"] - 1e-3)}

tune.run(
    train_fn,
    config={"lr": tune.loguniform(1e-4, 1e-1)},
    num_samples=20,
    scheduler=ASHAScheduler(metric="score", mode="max"),
)
```

Tune 把 trial 分发到集群，跑得差的提前杀掉，不用自己写调度。

## 踩过的坑

1. **for 循环里串行 `ray.get()` 等于没并行**：先批量 `f.remote` 拿 ref 列表，最后一次 `ray.get([...])`。
2. **对象存储溢出到磁盘会崩吞吐**：`ray status` 看 usage，超过约 70% 就该清理或加大配额。
3. **Actor 不是数据库**：节点挂了状态丢（除非 `max_restarts` + 自己持久化）；可靠状态放外部 KV。
4. **GB 级返回值**：对象已在存储里时，`ray.put` 后返回 `ObjectRef` 往往比直接 `return` 大数组少一次拷贝。

## 适用 vs 不适用场景

**适用**：

- 强化学习（rollout + learner + replay 混合拓扑）
- LLM 微调 / 推理（Train + Serve）
- 超参搜索 / AutoML（Tune）
- 端到端 ML 流水线（Data → Train → Tune → Serve）

**不适用**：

- 纯批处理 ETL → Spark / Airflow 更成熟
- 强一致事务工作流 → Temporal
- 单机够用 → 别上 Ray（`ray.init` 有秒级开销）
- 细粒度 GPU 共享 → K8s GPU operator 更精细

## 历史小故事（可跳过）

- **2017–2018 年**：UC Berkeley RISELab（Philipp Moritz / Robert Nishihara 等）发表《Ray: A Distributed Framework for Emerging AI Applications》，OSDI 2018 收录；动机是 RL 需要训练 + 仿真 + 推理同跑。
- **2019 年**：Anyscale 成立，把 Ray 作为商业基座。
- **2020 年**：Ray 1.0 在 Ray Summit 宣布（2020-09-30）；随后 KubeRay 把 Ray 部署到 Kubernetes。
- **2022–2023 年**：大模型训练爆发，OpenAI / Cohere / Uber / Pinterest 等公开采用 Ray 做规模化 Python 计算。
- **2024–2025 年**：Ray 2.x 持续增强 Data LLM、推理路由、MultiNode Train 等大模型能力。

## 学到什么

1. **Task + Actor 两条原语**足以表达多数分布式计算——无状态可重试、有状态可路由，组合即 parameter server / pipeline。
2. **共享内存对象存储**是分布式 Python 的胜负手——跨进程传 numpy 不走完整序列化，这是相对 Celery / RPC 的数量级差距来源。
3. **调度器分层**：本地 Raylet 先看本地 → 不够再问 GCS，避免单点瓶颈。
4. **统一框架的复利**：Tune / Serve / RLlib / Train 共用 Core，对象传递与调度策略一致。

## 延伸阅读

- 官方文档：[Ray Documentation](https://docs.ray.io/)
- OSDI 2018 论文：[Ray: A Distributed Framework for Emerging AI Applications](https://www.usenix.org/conference/osdi18/presentation/moritz)
- 架构白皮书：[Ray v2 Architecture](https://docs.google.com/document/d/1tBw9A4j62ruI5omIJbMxly-la5w4q_TjyJgJL_jN2fI/)
- KubeRay：[ray-project/kuberay](https://github.com/ray-project/kuberay)

## 关联

- [[airflow]] —— 任务队列调度对照；Ray 是有状态 actor + 共享内存
- [[spark]] —— 批处理 BSP 代表，与 Ray 动态任务图分叉
- [[dask]] —— Python 分布式偏数据并行，对照 Ray 的通用 actor
- [[pytorch]] —— Ray Train 把 PyTorch DDP 包成 Trainer
- [[kubernetes]] —— KubeRay 让两层调度器并存

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
