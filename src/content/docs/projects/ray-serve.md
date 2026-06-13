---
title: "Ray Serve：可扩展的模型服务化框架"
来源: https://docs.ray.io/en/latest/serve/index.html
日期: 2026-06-13
分类: 机器学习
子分类: ML 系统
provenance: pipeline-v3
---

# Ray Serve：可扩展的模型服务化框架

## 一个日常类比

想象你开了一家餐厅。

- **单个厨师** = 一个训练好的 ML 模型（比如一个图像分类器）。它能做菜，但来的人一多就忙不过来。
- **叫号系统** = HTTP 服务器，负责把订单分给不同的厨师。
- **多厨房协作** = 前厅接单、中间切配、后端烹饪——每个环节由不同的人负责，最后组合成一盘菜。

Ray Serve 就是一个"智能餐厅管理系统"。它帮你：

1. 雇多个厨师（复制部署实例）来处理排队订单
2. 让不同专长的厨师协作完成复杂菜品（多模型组合）
3. 根据客流量自动增减人手（自动扩缩容）
4. 不管厨师用的是中式还是西式厨具（框架无关：PyTorch、TensorFlow、Scikit-Learn 都行）

## 安装

```bash
pip install "ray[serve]"
```

## 核心概念

### 1. Deployment（部署）

Deployment 是 Ray Serve 的核心概念。它封装了你的业务逻辑或 ML 模型，负责处理传入的请求。你可以把它理解为一个"可独立扩展的服务单元"。

在运行时，一个 Deployment 由多个 **Replica（副本）** 组成——每个副本运行在一个独立的 Ray Actor 进程中。副本数量可以动态调整，以匹配请求负载。

定义方式：用 `@serve.deployment` 装饰一个 Python 类（或函数）。

### 2. Application（应用）

Application 是 Ray Serve 集群中的"升级单位"。一个应用包含一个或多个 Deployment。其中有一个被称为 **Ingress（入口）** 的 Deployment，负责接收所有外部流量。

你可以把一个 Application 理解为一整家餐厅——包含前厅、后厨、配菜间等多个部门，但顾客只从前门进门。

### 3. DeploymentHandle（部署句柄）

DeploymentHandle 允许一个 Deployment 调用另一个 Deployment。绑定 Deployment 时，你可以传入对其他 Deployment 的引用，运行时它们会被自动转换为 Handle。

这就像餐厅里前厅服务员可以直接呼叫配菜间和烹饪间的同事——不需要自己跑去厨房。

### 4. Ingress Deployment（入口部署）

Ingress 是应用的入口点，定义了 HTTP 处理逻辑。默认情况下，类的 `__call__` 方法会收到一个 Starlette Request 对象，返回值会被序列化为 JSON。

### 5. Replica（副本）与 Autoscaling（自动扩缩容）

每个 Deployment 可以有多个副本并行处理请求。Ray Serve 支持自动扩缩容——流量大时自动增加副本，流量小时自动减少，节省成本。

## 代码示例

### 示例一：最简单的 Hello World

这是最基础的用法——定义一个部署，部署它，然后通过 HTTP 访问。

```python
import requests
from starlette.requests import Request
from typing import Dict

from ray import serve


# 1: 定义一个 Ray Serve 部署
@serve.deployment
class MyModelDeployment:
    def __init__(self, msg: str):
        # 初始化模型状态：这里可能是一个巨大的神经网络权重
        self._msg = msg

    def __call__(self, request: Request) -> Dict:
        return {"result": self._msg}


# 2: 绑定参数并部署到本地
app = MyModelDeployment.bind(msg="Hello world!")
serve.run(app, route_prefix="/")

# 3: 通过 HTTP 查询并打印结果
print(requests.get("http://localhost:8000/").json())
# 输出: {'result': 'Hello world!'}
```

**逐行解读：**

- `@serve.deployment` 告诉 Ray："这是一个可以被分布式部署的服务单元"
- `__init__` 中加载模型权重（实际场景中可能是 PyTorch 模型、HuggingFace Transformer 等）
- `__call__` 处理每个 HTTP 请求，返回 JSON 格式的响应
- `bind()` 把参数注入到构造函数中
- `serve.run()` 启动服务，默认监听 8000 端口

### 示例二：多模型组合（Model Composition）

真实场景中，一个功能往往需要多个模型协作。比如一个评论分析系统：先用情感分析模型判断情绪，再用关键词提取模型抓取重点，最后把结果汇总。

```python
import requests
import starlette
from typing import Dict
from ray import serve
from ray.serve.handle import DeploymentHandle


# 模型1：给输入值加一个数
@serve.deployment
class Adder:
    def __init__(self, increment: int):
        self.increment = increment

    def add(self, inp: int):
        return self.increment + inp


# 模型2：计算多个输入的平均值
@serve.deployment
class Combiner:
    def average(self, *inputs) -> float:
        return sum(inputs) / len(inputs)


# 入口：接收请求，调用下游模型，组合结果
@serve.deployment
class Ingress:
    def __init__(
        self,
        adder1: DeploymentHandle,
        adder2: DeploymentHandle,
        combiner: DeploymentHandle,
    ):
        # 这些 Handle 就是"呼叫按钮"
        self._adder1 = adder1
        self._adder2 = adder2
        self._combiner = combiner

    async def __call__(self, request: starlette.requests.Request) -> Dict[str, float]:
        input_json = await request.json()
        # 异步并发调用两个 Adder，再把结果交给 Combiner
        final_result = await self._combiner.average.remote(
            self._adder1.add.remote(input_json["val"]),
            self._adder2.add.remote(input_json["val"]),
        )
        return {"result": final_result}


# 构建应用：把三个部署绑在一起
app = Ingress.bind(
    Adder.bind(increment=1),
    Adder.bind(increment=2),
    Combiner.bind()
)
serve.run(app)

# 查询：输入 100，adder1 返回 101，adder2 返回 102，combiner 平均 = 101.5
print(requests.post("http://localhost:8000/", json={"val": 100.0}).json())
# 输出: {"result": 101.5}
```

**关键机制：**

- `DeploymentHandle` 的 `.remote()` 方法发起的是**异步远程调用**，类似 RPC
- 两个 `Adder` 的调用是**并发执行**的，不需要等第一个完成再发第二个
- 每个 Deployment 可以独立扩缩容——如果 Adder 压力大，只增加 Adder 的副本数，不影响 Combiner

### 示例三：集成 HuggingFace 情感分析模型

```python
import requests
from starlette.requests import Request
from typing import Dict
from transformers import pipeline
from ray import serve


@serve.deployment
class SentimentAnalysisDeployment:
    def __init__(self):
        # 模型只在初始化时加载一次，不会每次请求都重新加载
        self._model = pipeline("sentiment-analysis")

    def __call__(self, request: Request) -> Dict:
        text = request.query_params["text"]
        return self._model(text)[0]


app = SentimentAnalysisDeployment.bind()
serve.run(app, route_prefix="/")

# 查询
print(
    requests.get(
        "http://localhost:8000/", params={"text": "Ray Serve is great!"}
    ).json()
)
# 输出: {'label': 'POSITIVE', 'score': 0.9998476505279541}
```

## Ray Serve 的独特优势

| 特性 | 说明 |
|------|------|
| **框架无关** | 不绑定 PyTorch/TensorFlow 等任一框架，PyTorch、Scikit-Learn、纯 Python 业务逻辑混用 |
| **多模型组合** | 用 Python 函数调用的方式组合多个模型，比 YAML 配置灵活得多 |
| **灵活扩缩容** | 按副本数扩缩容，支持 fractional GPU（ fractional GPU 意味着一张显卡可以分给多个模型共享） |
| **端到端应用** | 不只是"张量进、张量出"，可以把 ML 模型、数据库查询、HTTP 路由全部写成一个 Python 程序 |
| **无厂商锁定** | 开源，可在笔记本、Kubernetes、任何主流云厂商或私有服务器上运行 |

## 与其他工具的对比

- **TFServing / TorchServe**：这些是框架专用的。Ray Serve 框架无关，可以在同一个应用中混用 PyTorch 模型和 Scikit-Learn 模型。
- **AWS SageMaker / Azure ML**：这些是云平台的全托管方案。Ray Serve 是开源的，可以部署在任何地方，不被单一云厂商绑定。
- **KServe / Seldon**：这些需要先有 Kubernetes 集群才能用。Ray Serve 在笔记本上就能跑，生产时再扩展到 K8s，零代码改动。

## 小结

Ray Serve 的本质思路很简单：

1. 把你的模型或业务逻辑包装成 **Deployment**
2. 用 **Application** 把多个 Deployment 组织起来
3. 通过 **DeploymentHandle** 让它们互相调用
4. Ray 底层自动处理分布式调度、负载均衡、弹性扩缩容

你只需要写 Python 代码，剩下的交给 Ray。

## 延伸阅读

- 官方教程：[Get Started with Ray Serve](https://docs.ray.io/en/latest/serve/getting_started.html)
- 核心概念详解：[Key Concepts](https://docs.ray.io/en/latest/serve/key-concepts.html)
- 资源分配指南：[Resource Allocation](https://docs.ray.io/en/latest/serve/resource-allocation.html)
- 自动扩缩容：[Autoscaling Guide](https://docs.ray.io/en/latest/serve/autoscaling-guide.html)
