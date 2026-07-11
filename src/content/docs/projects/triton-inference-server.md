---
title: Triton Inference Server — NVIDIA 多框架推理服务化标杆
来源: https://github.com/triton-inference-server/server
日期: 2026-05-31
分类: 项目
难度: 中级
---

## 是什么

**Triton Inference Server**（下称 Triton-IS）是 NVIDIA 开源的一套**把训练好的模型对外提供 HTTP / gRPC 推理服务**的服务器。日常类比：像一家"模型快餐店"——后厨有十几口锅（TensorRT / TensorFlow / PyTorch / ONNX / OpenVINO / vLLM 等不同框架），前台只有一个柜台（统一 HTTP 接口）；点单进来店长会自动凑单（动态批处理），把一桌的菜一锅炒出来送上桌。

由 NVIDIA 在 2018 年发布，最早叫 **TensorRT Inference Server (TRTIS)**，2019 年改名为 Triton Inference Server，扩展为多框架。BSD-3 协议，主语言 C++，配合 Python / Java client SDK（GitHub stars 会随时间变，以仓库页为准）。

**重要消歧**：与 OpenAI 的 Triton（写 GPU kernel 的 Python DSL，见 [[triton-2019]]）**同名但完全无关**。OpenAI Triton 是"写 kernel 的 DSL"；Triton-IS 是"对外暴露 endpoint 的 server"。

## 为什么重要

不理解 Triton-IS，下面这些事就没法解释：

- 大型推理工厂为什么不写 FastAPI 套 PyTorch，而是用 Triton-IS——因为 dynamic batching、并发实例、多框架共存这些事自己写一遍要几个月
- 为什么 K8s 上部署模型时 KServe / Seldon **常把 Triton-IS 选作推理运行时**——它实现了 KServe v2 API 标准
- 为什么同一个 server 能同时跑视觉的 TensorRT 引擎、文本的 ONNX 模型、还能挂 vLLM 跑 LLM——后端是插件式的
- 为什么 Microsoft Bing、蔚来汽车、American Express 在生产里都用它——它是过去多年迭代出来的工业级工程基建

## 核心要点

Triton-IS 可以拆成 **三块积木**：

1. **模型仓库（model repository）**：启动时只指向一个目录，每个模型一个文件夹，版本号子目录放权重，`config.pbtxt`（一种可读的配置文本，像菜单说明书）声明输入输出 shape、batch、framework。类比：仓库 = 后厨货架，按菜名分格、按版本贴标签。**踩坑**：版本目录必须是纯数字。

```
model_repository/
  resnet50/
    config.pbtxt
    1/
      model.plan       # TensorRT 引擎
```

2. **动态批处理 + 并发实例**：多个独立请求在排队 N 微秒内尽量凑成一批再送 GPU；`instance_group` 可在同一 GPU 上开多份实例做负载均衡，但每份权重各占一份显存。类比：凑单炒菜 + 多开灶台，灶台越多越占厨房面积。

```
dynamic_batching {
  preferred_batch_size: [4, 8]
  max_queue_delay_microseconds: 5000
}
instance_group [{ count: 2, kind: KIND_GPU, gpus: [0] }]
```

`max_queue_delay` 是**用延迟换吞吐**的旋钮——延迟上限多大，就能凑出多大的 batch。

3. **插件后端 + Ensemble / BLS**：后端 = 一个动态库 `.so`（官方有 TensorRT / ONNX / PyTorch / TF / vLLM 等）；`ensemble_scheduling` 把"分词 → 主模型 → 后处理"串成 1 个对外 endpoint；复杂编排用 BLS（Business Logic Scripting，Python 后端写调度）。类比：换锅不换柜台，流水线在店内传菜不让顾客跑三趟。

## 实践案例

### 案例 1：起一个最简 server

```bash
docker run --gpus=1 --rm -p8000:8000 -p8001:8001 -p8002:8002 \
    -v $PWD/model_repository:/models \
    nvcr.io/nvidia/tritonserver:24.10-py3 \
    tritonserver --model-repository=/models
```

**逐部分解释**：

- `-v ...:/models`：把本机模型目录挂进容器，server 只认这个货架
- `8000` HTTP、`8001` gRPC、`8002` Prometheus metrics——三个门分别给人、给程序、给监控用
- 前提：`model_repository/` 里已有合法模型文件夹 + `config.pbtxt`

### 案例 2：客户端调用

```python
import numpy as np
import tritonclient.http as httpclient
client = httpclient.InferenceServerClient(url="localhost:8000")
image_np = np.zeros((1, 3, 224, 224), dtype=np.float32)  # 占位图
inputs = httpclient.InferInput("INPUT_0", [1, 3, 224, 224], "FP32")
inputs.set_data_from_numpy(image_np)
result = client.infer("resnet50", inputs=[inputs])
out = result.as_numpy("OUTPUT_0")
```

**逐部分解释**：

1. `InferInput` 的名字 / shape / dtype 必须和 `config.pbtxt` 完全一致
2. `set_data_from_numpy` 把数组塞进请求；`infer` 发到名为 `resnet50` 的模型
3. `as_numpy` 按输出名取回结果——常见 422 根因就是 dim layout 对不上

### 案例 3：用 vLLM 后端挂 LLM

`model_repository/llama/config.pbtxt` 最小片段：

```
name: "llama"
backend: "vllm"
```

权重放在 `llama/1/`。**逐部分解释**：`backend: "vllm"` 告诉 server 用 vLLM 这口锅；对外仍是统一 Triton 接口，所以同一进程里可同时挂视觉模型与 LLM。

## 踩过的坑

1. **GPU 利用率上不去**：忘开 `dynamic_batching` 或 `instance count = 1`，单请求把 GPU 闲死——用 `--log-verbose=1` 确认是否合批。
2. **dim 写错直接 422**：`[-1, 224, 224, 3]`（NHWC，通道在后）vs `[1, 3, 224, 224]`（NCHW，通道在前）写错即拒。
3. **多实例 OOM**：`count: 4` 等于权重复制 4 份；70B 模型这样很快炸卡。
4. **Ensemble 中间 tensor 走 CPU**：两步之间默认回 CPU 再下 GPU，掉性能——需配置让数据驻留 GPU。另：**不能训练**——Triton-IS 只做推理，训完导出再喂给它。

## 适用 vs 不适用场景

**适用**：

- 多模型 / 多框架共存的推理工厂，需要统一接口（典型：单卡同时挂视觉 + 小文本模型）
- K8s 大规模部署，配 KServe / Seldon 做自动扩缩
- 需要请求级动态批处理把吞吐量打满（例如把 GPU 利用率从个位数拉到几十）
- 同一个 server 既挂视觉模型又挂 LLM（vLLM / TensorRT-LLM backend）

**不适用**：

- 纯单一 LLM、追求极致吞吐 → 直接用 [[vllm]] / [[sglang]] 更轻（少一层编排开销）
- Python 业务逻辑很厚（前后处理是核心） → [[bentoml]] / FastAPI 更顺手
- 边缘 / 嵌入式 → ONNX Runtime / TFLite 直接进进程
- 闭源云模型（GPT / Claude）→ 直接调它们的 API，Triton-IS 跑不了

## 历史小故事（可跳过）

- **2018**：NVIDIA 发布 TensorRT Inference Server (TRTIS)，把 TensorRT 引擎暴露成 HTTP/gRPC
- **2019-09**：更名为 Triton Inference Server，加入 TF / PyTorch / ONNX / Python 等多框架后端
- **2020**：进入 KServe（前身 KFServing）常用运行时列表；引入 Ensemble
- **2022**：加入 BLS，让 Python backend 能在 server 内部写调度
- **2023–2025**：TensorRT-LLM Backend、vLLM Backend 相继加入；与 NVIDIA NIM 整合为默认运行底座

## 学到什么

- **服务化 = 仓库结构 + 动态批 + 后端插件**——三件事缺一就要自己写一遍
- **dynamic batching 是吞吐杠杆**：`max_queue_delay` 在调"延迟上限 vs GPU 利用率"
- **多框架后端比单框架运行时长寿**：统一接口 + 可插拔后端是工业级软件的常见骨架
- **命名冲突要敏感**：Triton-IS vs OpenAI Triton 是不同东西，搜资料先看是 kernel 还是 server

## 延伸阅读

- 官方仓库：[triton-inference-server/server](https://github.com/triton-inference-server/server)
- 官方文档：[Triton User Guide](https://docs.nvidia.com/deeplearning/triton-inference-server/user-guide/docs/)
- KServe v2 推理协议：[KServe Inference Protocol v2](https://kserve.github.io/website/latest/modelserving/data_plane/v2_protocol/)
- [[vllm]] —— LLM 专用引擎，可作为 Triton-IS 的 backend
- [[tensorrt-llm-2023]] —— TensorRT-LLM，同样可作为 backend
- [[triton-2019]] —— OpenAI Triton（DSL，与本笔记同名但不同物）

## 关联

- [[vllm]] —— 单一 LLM 高吞吐引擎；可被 Triton-IS 当 backend 挂载
- [[sglang]] —— 结构化 LLM 推理运行时；定位与 vLLM 接近
- [[tensorrt-llm-2023]] —— NVIDIA 官方 LLM 推理栈；Triton-IS 的"亲儿子"backend
- [[triton-2019]] —— 同名 OpenAI Triton（GPU kernel DSL），完全不同领域
- [[nvidia-gpu-operator]] —— K8s 上自动装 GPU 软件栈，常与 Triton-IS 一起部署
- [[bentoml]] —— Python-first 模型打包；业务逻辑厚时更顺手
- [[fastapi]] —— 自己写推理服务的轻量替代；适合小规模 / 高定制

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[ncnn]] —— ncnn — 腾讯开源的端侧神经网络推理框架
- [[nvidia-gpu-operator]] —— NVIDIA GPU Operator — K8s 上自动装 GPU 软件栈
- [[paddle-lite]] —— Paddle Lite — 端侧轻量推理引擎
