---
title: Ray — 把单机 Python 函数和类无缝扩展到整个集群
来源: Ray Documentation, https://docs.ray.io/
日期: 2026-05-31
子分类: ai-infra
分类: 机器学习
难度: 中级
provenance: pipeline-v3
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

- 为什么 OpenAI 训 GPT、Uber / Pinterest / Spotify 做推荐用的都是 Ray——它原生支持『训练 + 模拟 + 推理』混在一张拓扑里跑（mixed workload），是强化学习和 LLM 微调天生的形态
- 为什么 Tune / Serve / RLlib / Train 这些子库能做到『一行 import 就能用集群』——它们都站在 Ray Core 的两条原语（task + actor）上
- 为什么调度系统讨论里『有状态 vs 无状态』是核心分叉——Ray 是少数把 actor 当一等公民的通用框架

## 核心要点

Ray 的两条原语：

1. **Task**：无状态远程函数。`@ray.remote def f(...)` → `f.remote(args)` 返回 `ObjectRef`，调度到任意空闲 worker 执行。
2. **Actor**：有状态远程类。`@ray.remote class C` → `C.remote()` 返回 actor handle，状态在固定 worker 进程里持久，所有方法调用都路由到同一个进程。

四个底层组件咬合：

- **GCS**（Global Control Store）：head 节点上的元数据中心，存 actor 位置、节点状态、placement group。
- **Raylet**：每节点一个守护进程，负责本地调度 + 与 GCS 同步。
- **Plasma object store**：每节点一块共享内存，跨进程零拷贝传 numpy 数组——这是 Ray 比 Celery / RPC 框架快的关键。
- **Worker**：执行 task / actor 的 Python 进程，Raylet 按需起停。

调度策略：每个 Raylet 先尝试本地放任务，资源不够再问 GCS 借。DEFAULT 策略给每个节点打分（资源利用率），从最低 20% 里随机选；任务还会优先去『参数对象在本地』的节点（locality-aware）；actor 默认随机分布以避免热点。

上层五个 AI 库都基于 Core 两条原语：

- **Ray Data** —— 分布式数据预处理流水线
- **Ray Train** —— 分布式训练，封装 PyTorch DDP / HuggingFace / XGBoost
- **Ray Tune** —— 超参搜索（ASHA / PBT / Optuna 后端）
- **Ray Serve** —— 模型在线推理，多模型可组合成 DAG
- **RLlib** —— 强化学习算法库（PPO / DQN / IMPALA）

## 实践案例

### 案例 1：把单机 numpy 工作分到集群

```python
@ray.remote
def heavy(arr):
    return arr @ arr.T

big = np.random.rand(10000, 10000)
ref = ray.put(big)                    # 显式放进 Plasma，避免每次 .remote 复制
results = ray.get([heavy.remote(ref) for _ in range(8)])
```

`ray.put` 把大数组放进共享内存，8 个 task 拿到的是**指针**而不是副本。

### 案例 2：parameter server 模式（actor 用法）

```python
@ray.remote
class ParamServer:
    def __init__(self, w): self.w = w
    def get(self): return self.w
    def apply_grad(self, g): self.w -= 0.01 * g

ps = ParamServer.remote(init_weights)
@ray.remote
def worker(ps, batch):
    w = ray.get(ps.get.remote())
    grad = compute_grad(w, batch)
    ps.apply_grad.remote(grad)
```

ParamServer 是有状态 actor，多个 worker task 并行算梯度发回去。这就是 RLlib / Train 内部的雏形。

### 案例 3：超参搜索一键并行

```python
from ray import tune
tune.run(train_fn, config={"lr": tune.loguniform(1e-4, 1e-1)},
         num_samples=100, scheduler=tune.schedulers.ASHAScheduler())
```

Tune 自动把 100 组超参分发到集群，跑得差的 trial 提前杀掉（ASHA），不用自己写调度。

## 踩过的坑

1. **for 循环里串行 ray.get() 等于没并行**：`for x in xs: ray.get(f.remote(x))` 是错的——每次都阻塞。正确做法是先批量 launch 拿 ref 列表，最后 `ray.get([...])` 一次性等。
2. **Plasma 溢出到磁盘性能崩塌**：对象总量超过共享内存配额会 spill 到磁盘，吞吐掉到 IO 速度。`ray status` 看 object store usage，超过 70% 就该清理。
3. **Actor 不是数据库**：节点挂掉 actor 状态丢失（除非加 `max_restarts` + 自己写持久化）。需要可靠状态存外部 KV / 数据库。
4. **大返回值直接 return 比 ray.put 慢**：返回 GB 级 numpy 时，`ray.put` 后返回 ObjectRef 比直接 return 少一次拷贝。

## 适用 vs 不适用场景

**适用**：

- 强化学习（rollout worker + learner actor + replay buffer 混合拓扑）
- LLM 微调 / 推理（Train + Serve 串起来）
- 超参搜索 / AutoML（Tune）
- 端到端 ML 流水线（Data → Train → Tune → Serve）

**不适用**：

- 纯批处理 ETL → Spark / Airflow 更成熟
- 强一致事务工作流 → Temporal
- 单机够用 → 别上 Ray，初始化有几秒开销
- 细粒度 GPU 共享调度 → K8s GPU operator 更精细

## 历史小故事（可跳过）

- **2017 年**：UC Berkeley RISELab 团队（Philipp Moritz / Robert Nishihara 等）发表论文《Ray: A Distributed Framework for Emerging AI Applications》，OSDI 2018 收录。动机是 RL 需要『训练 + 仿真 + 推理』同时跑，当时没框架能装下。
- **2019 年**：Anyscale 公司成立，把 Ray 作为商业基座。
- **2021 年**：Ray 1.0 GA，KubeRay 把 Ray 部署到 Kubernetes。
- **2022-2023 年**：随着大模型训练爆发，Ray 成为事实标准——OpenAI 用 Ray 训 GPT，Cohere / Uber / Pinterest 跟进。
- **2024-2025 年**：Ray 2.x 稳定，新增 Ray Data LLM、推理路由、MultiNode Train 等大模型场景能力。

## 学到什么

1. **Task + Actor 两条原语足以表达大多数分布式计算**——无状态可重试、有状态可路由，组合起来就是 parameter server / pipeline / ensemble。
2. **共享内存是分布式 Python 的胜负手**——Plasma 让跨进程传 numpy 不走序列化，这是 Ray 比 Celery / RPC 快一个数量级的原因。
3. **调度器分层**：本地 Raylet 先看本地资源 → 不够再问 GCS。这种『先本地后全局』的设计避免单点瓶颈，K8s 调度器是反例（全部走 API server）。
4. **统一框架的复利**：Tune / Serve / RLlib / Train 都基于同一套 Core，意味着它们之间的对象传递零拷贝、调度策略一致——这是『装五个独立工具』堆不出来的。

## 延伸阅读

- 官方文档（首选）：[Ray Documentation](https://docs.ray.io/)
- OSDI 2018 论文：[Ray: A Distributed Framework for Emerging AI Applications](https://www.usenix.org/conference/osdi18/presentation/moritz)
- 架构白皮书：[Ray v2 Architecture](https://docs.google.com/document/d/1tBw9A4j62ruI5omIJbMxly-la5w4q_TjyJgJL_jN2fI/)
- KubeRay 项目：[ray-project/kuberay](https://github.com/ray-project/kuberay)

## 关联

- [[airflow]] —— 调度系统的对照基线，Airflow 是任务队列、Ray 是有状态 actor + 共享内存
- [[spark]] —— 批处理代表，与 Ray 在『流水线 vs BSP』形成分叉
- [[dask]] —— 同样是 Python 分布式但偏数据并行，与 Ray 的通用 actor 模型对照
- [[pytorch]] —— Ray Train 把 PyTorch DDP 包成 Trainer
- [[kubernetes]] —— KubeRay 把 Ray 集群跑在 K8s 上，两层调度器并存
