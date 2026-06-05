---
title: Candle — HuggingFace 出品的 Rust 推理框架
来源: https://github.com/huggingface/candle
日期: 2026-05-31
子分类: 数据科学与 AI
分类: 机器学习
难度: 中级
provenance: pipeline-v3
---

## 是什么

Candle 是 HuggingFace 用 **Rust** 写的极简机器学习框架，主打**推理**（inference）。

日常类比：把模型推理想象成一家餐厅。

- **PyTorch** 像旗舰大店——什么菜都能做（训练、研究、推理），但开店准备时间长、厨房巨大、要带一整个 Python 解释器。
- **Candle** 像精品快餐车——只做"把已经训练好的模型跑起来"这一件事，开张快、车小、不用拉一车 Python。

API 设计刻意像 PyTorch（`Tensor`、`Module` 概念几乎一一对应），目的是让 Python 用户能上手。

## 为什么重要

不理解 Candle，下面这些事都不容易解释：

- 为什么 AI 公司部署模型时**总在抱怨 Python 太慢、太重**——GIL、冷启动、依赖几百 MB
- 为什么"serverless 推理"喊了很久但难落地——每次冷启动要加载 Python + 模型，几秒就过去了
- 为什么浏览器内跑模型（隐私场景）一直停在"演示阶段"——没有合适的 Rust 框架编 WASM
- 为什么 HuggingFace 这种以 Python 起家的公司会去做 Rust 框架——他们想吃下"训练之外"的另一半市场

## 核心要点

Candle 的设计可以拆成 **三个决定**：

1. **只做推理优先**：训练能跑但不强求和 PyTorch 拼。生态精力先压在"把已有模型加载、跑得快、部署小"上。

2. **后端多但 API 单一**：上层代码一套，下层支持 CPU（含 MKL / Apple Accelerate）、CUDA（含多卡 NCCL）、Metal（Apple GPU）、**WASM**（浏览器）。

3. **拥抱 HuggingFace 生态**：`safetensors`（比 pickle 安全的权重格式）、`tokenizers`（HF 自家分词器）都是 Rust crate，Candle 直接复用，零 Python 中转。

整个框架可以分成四层：

- `candle-core`：张量基础设施（Tensor、Device、Shape）
- `candle-nn`：模块抽象（Linear、LayerNorm 等积木）
- `candle-transformers`：现成模型动物园（LLaMA、Whisper、Stable Diffusion …）
- `candle-examples`：开箱即用的 demo

## 实践案例

### 案例 1：跑一个 LLaMA 推理大概什么样

```rust
use candle_core::{Device, Tensor};
use candle_transformers::models::llama::LlamaConfig;

let device = Device::new_cuda(0)?;       // 选择 GPU
let weights = candle_core::safetensors::load(weights_path, &device)?;
let model = Llama::load(&weights, &config)?;
let output = model.forward(&input_ids, /* pos = */ 0)?;
```

对比 Python 版的 `transformers`：少了 import torch、少了 GIL 顾虑、编译完是一个**单二进制**。

### 案例 2：WASM 后端能干什么

把同一份 Rust 代码用 `wasm-pack` 编译，模型可以在**浏览器里直接跑**，不上传用户数据：

- 客户端 OCR / 文档分类
- 浏览器扩展里跑小型 LLM
- 不需要后端的 demo 站

代价：模型必须小（几百 MB 内），推理慢于 native。

### 案例 3：和 llama.cpp 的分工

| 维度 | llama.cpp | Candle |
| --- | --- | --- |
| 语言 | C++ | Rust |
| 模型范围 | 专精 LLM（GGUF 量化） | 通用（LLM + 视觉 + 音频 + 扩散） |
| 量化生态 | 极成熟，主流 | 跟得上但晚一步 |
| 学习曲线 | C++ + 自定义量化 | Rust + 标准 ML 概念 |

简单说：要部署 GGUF 量化 LLaMA 选 llama.cpp；要在 Rust 项目里加任意模型选 Candle。

### 案例 4：四层架构怎么读源码

如果想学习 Candle 源码，建议**自下而上**读：

1. 先读 `candle-core/src/tensor.rs` —— Tensor 类型怎么定义、形状怎么传播
2. 再读 `candle-core/src/op.rs` —— 加法、矩阵乘怎么落到不同 Device
3. 再读 `candle-nn/src/linear.rs` —— 一个最简单的 Module 长什么样
4. 最后读 `candle-transformers/src/models/llama.rs` —— 真正的模型组装

这样比一上来读 LLaMA 实现要顺得多。

## 踩过的坑

1. **Rust 学习成本叠加 ML 学习成本**：新人同时学借用、生命周期、Tensor、autograd——双重曲线。建议先用 Python 把模型跑通再来 Rust 移植。

2. **CUDA 编译要显式指定 compute capability**：环境变量 `CUDA_COMPUTE_CAP` 没设，第一次编译报一堆 nvcc 错误，Issue 区高频问题。

3. **WSL 下模型加载慢**：mmap 在 WSL2 上表现差，加载 LLaMA-7B 可能比 native Linux 慢几倍。生产环境别用 WSL。

4. **训练能力跟不上 PyTorch**：反向传播能跑但优化器、调度器、分布式 API 都还在补。**别用 Candle 做研究，用它做部署**。

5. **找不到的模型要自己移植**：动物园没覆盖的模型，得照着 HF `transformers` 的 Python 实现一行行翻成 Rust。耗时但可行。

6. **调试不如 Python 顺手**：没有 REPL，print 一个大 Tensor 屏幕刷屏；要么写小测试函数验证形状，要么用 `tracing` crate 加日志。习惯 Jupyter 的人会很难受。

7. **多卡分布式还在补**：`NCCL` 集成有但样例不多，多机训练几乎没人在跑。生产多卡推理可行，研究级分布式训练别想。

## 适用 vs 不适用场景

**适用**：

- 容器化推理服务（Lambda / Cloud Run / Fly.io）——单二进制启动快
- 边缘推理（嵌入式、IoT、桌面 app）
- 浏览器内推理（WASM，隐私敏感场景）
- 现有 Rust 项目里加 AI 功能（不想引入 Python）

**不适用**：

- 训练新模型 → 用 PyTorch
- 只跑量化 LLaMA → llama.cpp 更专精
- 团队全是 Python 工程师 → 强行迁移得不偿失
- 模型不在动物园且没人力移植 → 等社区或自己写

## 历史小故事（可跳过）

- **2023 年中**：HuggingFace 发起 Candle 项目，目标是把"用 Python 训、用任何东西部署"的部署一侧做成 Rust 原生选项。
- **2024 年**：快速迭代，主流 LLM、视觉、扩散模型逐个进入 `candle-transformers`，star 数从几百涨到一万多。
- **2025 年**：进入生产应用阶段，多家公司用 Candle 替换 Python 推理服务，冷启动时间和内存占用显著下降。

之后路线：训练能力补齐、量化生态追赶、更多硬件后端（如 NPU）。

## 学到什么

1. **推理和训练是两个市场**：训练讲究灵活迭代，Python 优势不可撼动；推理讲究启动快、内存小、可部署，Rust 是更好的答案。
2. **生态复用比自己造更重要**：Candle 没自己写权重格式或分词器，直接吃 HuggingFace 的 `safetensors` / `tokenizers`，让框架轻盈。
3. **API 模仿是降低迁移成本的捷径**：刻意做成 PyTorch 风，让 Python 用户读 Rust 代码也能猜个大概。
4. **WASM 后端打开新场景**：浏览器内推理之前是边角料，有了 Candle 后变成可工程化的方案。

## 延伸阅读

- 仓库 README：[huggingface/candle](https://github.com/huggingface/candle)（含 examples 列表，照着跑最快）
- 官方教程：[Candle Tutorial](https://huggingface.github.io/candle/)（从 Tensor 到加载 LLaMA 一步步带）
- 对比文章：搜索 "Candle vs burn vs tch-rs"，三个 Rust ML 框架的取舍分析
- [[pytorch]] —— Candle API 的对照对象，先理解 PyTorch 再看 Candle 半天就懂
- [[llama-cpp]] —— 推理框架的另一极（C++ + 量化专精），值得对比
- [[ollama]] —— 比 Candle 更上层的本地 LLM 部署工具
- [[pytorch-lightning]] —— PyTorch 训练侧封装，和 Candle 的"推理侧"形成完整对照

## 关联

- [[pytorch]] —— Candle 显式致敬的 API 模板，理解一个就能猜另一个
- [[llama-cpp]] —— 同样是非 Python 部署，专攻 LLM 量化，和 Candle 互补
- [[ollama]] —— 把 LLM 推理打包成"一键运行"，可以基于 Candle / llama.cpp 之类的底座
- [[llamaindex]] —— 应用层 RAG 框架，最终调用的推理引擎可以是 Candle
