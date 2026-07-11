---
title: llama.cpp — 让 LLM 在你电脑里直接跑
来源: https://github.com/ggml-org/llama.cpp
日期: 2026-05-31
分类: AI / 推理
难度: 中级
---

## 是什么

llama.cpp 是**用纯 C/C++ 写的大语言模型推理引擎**。日常类比：原本要跑一个 LLM，得装 Python、装 CUDA、装 PyTorch、装 transformers，凑齐一套环境得花一上午；llama.cpp 把这一切压成**一个 binary + 一个模型文件**，双击就跑。

最小命令长这样：

```bash
./llama-cli -m llama-3-8b.Q4_K_M.gguf -p "讲个笑话"
```

一个可执行文件 + 一个 4GB 的 .gguf 文件，MacBook、树莓派、Windows 笔记本、安卓手机都能直接跑大模型。它催生了整个端侧 LLM 生态：Ollama、LM Studio、llamafile、GPT4All 底层全是它。

## 为什么重要

不理解 llama.cpp，下面这些事都说不清：

- 为什么 2023 年开始"本地跑 LLM"突然变成普通用户也能玩——不是模型变小了，是**安装这件事**降到了 `npm install` 级别
- 为什么 MacBook M2 能跑 7B 模型，普通游戏本能跑 13B——量化技术 + Metal/CUDA 后端把内存和算力榨到了极限
- 为什么 Apple 工程师亲自来给一个开源仓库提 PR——这个仓库定义了 Apple Silicon 上推理的事实标准
- 为什么读 LLM 推理源码，老手都推荐从 llama.cpp 入门——不到 5 万行 C++，比 vLLM 简单一个量级

## 核心要点

### 1. GGUF：一个文件装下整个模型

GGUF（GPT-Generated Unified Format）是 llama.cpp 自己定义的模型格式。日常类比：像把一个完整 LLM 的**所有零件**——权重、tokenizer、超参数、对话模板——打包成一个自包含的 zip。你只下载一个 `.gguf` 文件，没有依赖、没有 Python 环境、没有登录。

对比 PyTorch 的 `.bin` + `config.json` + `tokenizer.json` + `special_tokens_map.json` 这种碎片包，GGUF 一个文件搞定。

### 2. 量化：把 16 位浮点压到 4 位整数

原本每个模型权重用 FP16 存，每个数占 2 字节。**量化**把它压到 Q4（4 位整数），1 字节装 2 个权重。70 亿参数的模型从 14GB 缩到 4GB，精度只掉几个百分点。

常见档位：

- **Q4_K_M** — 质量/速度甜点，绝大多数场景选它
- **Q5_K_M** — 想要再准一点，多花 25% 内存
- **Q8_0** — 接近 FP16，留给"我有 64GB 内存"的人
- **Q2_K** — 救命档，糊到能用就行

### 3. ggml：手写的 mini PyTorch

PyTorch 是给训练用的大引擎，带动态图、自动微分、几十 GB 依赖。**ggml** 是作者 ggerganov 自己写的 mini 张量库——只做推理、纯 C、没动态图，每个算子手工调到 SIMD/Metal/CUDA 各后端最优。

llama.cpp 是 ggml 的第一个大用户；现在 ggml 已独立成一个仓库，whisper.cpp、stable-diffusion.cpp 都基于它。

### 4. 多后端：一份模型文件跨所有硬件

同一个 .gguf 文件，根据机器自动选后端：

- **Metal**（Mac）—— Apple 自家工程师贡献，M 系列芯片性能最强
- **CUDA**（Nvidia 显卡）—— 桌面/服务器主流
- **Vulkan**（AMD / Intel / 其他）—— 跨平台 GPU 兜底
- **CPU**（AVX2 / AVX512 / NEON）—— 没显卡也能跑，只是慢

用户只改 `-ngl <层数>` 一个参数，决定多少层放 GPU、多少层留 CPU。

### 5. KV Cache：让对话不会越聊越慢

每生成一个 token 都要算前面所有 token 的注意力，原始实现是 O(n²)。**KV Cache** 把算过的 Key/Value 存下来，下次直接复用，降到 O(n)。这是所有 LLM 推理引擎的标配，llama.cpp 的实现极简，适合读源码学原理。

## 历史小故事（可跳过）

- **2023-03**：Meta 的 LLaMA 权重在网上泄露。几天之内，保加利亚开发者 Georgi Gerganov（ggerganov）用纯 C++ 写了一份推理代码，**一个人一周**让 LLaMA 7B 跑在 MacBook M1 上。当时业内还在讨论"7B 至少要 A100"。
- **2023-06**：ggml 张量库从 llama.cpp 仓库剥离独立，whisper.cpp、stable-diffusion.cpp 跟上。
- **2023-08**：GGUF 格式定型，取代之前混乱的 GGML/GGJT 各种版本号。
- **2024 起**：Apple 工程师亲自来贡献 Metal 后端；Star 数破 7 万，成为端侧推理事实标准；Ollama / LM Studio / llamafile 全部基于它。

整个故事是"一个人 + 一周时间 + 一台 MacBook"撬动了端侧 LLM 浪潮——对照同期工业界的"千卡集群"叙事，提醒我们工程价值常常来自把现有技术往**约束更强的场景**搬。

## 实践案例

### 案例 1：MacBook 跑 LLaMA 3 8B

```bash
# 下载量化模型（约 5GB）
huggingface-cli download bartowski/Meta-Llama-3-8B-Instruct-GGUF \
  Meta-Llama-3-8B-Instruct.Q4_K_M.gguf --local-dir .

# 启动 OpenAI 兼容 server
./llama-server -m Meta-Llama-3-8B-Instruct.Q4_K_M.gguf -ngl 999 -c 4096
```

`-ngl 999` 把所有层放 GPU，`-c 4096` 设上下文长度。然后任何 OpenAI client 改 BASE_URL 到 `http://localhost:8080` 就能用。

### 案例 2：源码里读懂 KV Cache

`llama.cpp` 主仓库 `src/llama-kv-cache.cpp` 不到 1000 行，能看到一个工业级 KV Cache 怎么管理张量复用、batch 内 sequence 切换、长上下文滑窗。读完这一份，再去看 vLLM 的 PagedAttention 不会发懵。

### 案例 3：llamafile —— 单文件跨平台分发

Mozilla 把 llama.cpp + 一个 GGUF 模型 + Cosmopolitan libc 打包成**单个可执行文件**，同一个文件双击在 Mac/Linux/Windows 都能跑。这是 llama.cpp 生态独有的能力——纯 C++ 没运行时，才能这么打包。

### 案例 4：和 vLLM 对照看推理两条路线

同一个 LLaMA-3-8B 模型：

- **vLLM 路线**：FP16 权重，PagedAttention，连续 batching，目标是单台 A100 同时服务几十个用户；延迟容忍 200ms+，吞吐第一
- **llama.cpp 路线**：Q4 量化权重，单 sequence，目标是 MacBook 一个用户对话，首 token 50ms 内出来；延迟第一，吞吐不重要

两条路线没有谁优谁劣，是**部署场景**决定的工程取舍。读源码时把这两个项目放一起对照，会更快理解 LLM 推理的核心约束。

## 踩过的坑

1. **下错量化档位**：图省事下了 Q2_K 发现胡言乱语，又下 Q8_0 发现 16GB 内存爆了。Q4_K_M 是默认推荐，先试这个。
2. **忘记加 `-ngl`**：Mac 上不加这个参数全跑 CPU，速度差 5 倍。无脑加 `-ngl 999`。
3. **上下文长度 `-c` 默认 2048**：处理长文档要调大；**KV cache 显存近似随长度线性增长**（注意力计算量才是 O(n²)）。8B 模型开 32k 时显存可能到十余 GB 量级（粗估，视量化与 offload 而定）。
4. **量化模型不能微调**：Q4 已经丢精度，微调要回到原始 FP16 权重；llama.cpp 只做推理。
5. **GGUF 版本不兼容**：旧 GGUFv1/v2 文件在新版 llama.cpp 跑不了，下载时认准 v3 或更新。

## 适用 vs 不适用

**适用**：

- 端侧推理（笔记本 / 手机 / 嵌入式）
- 离线或机密场景，数据不能传云
- 学习 LLM 推理底层，源码量友好
- 单用户低延迟对话

**不适用**：

- 云端高并发推理（用 vLLM / TGI / SGLang，它们有 PagedAttention 和连续 batching）
- 训练或微调（用 PyTorch / Accelerate / torchtune）
- 多模态训练（llama.cpp 推理支持 LLaVA 等，但训练不在目标内）

## 学到什么

1. **量化是端侧 LLM 的钥匙**——精度和内存的 trade-off 才让消费级硬件跑得动百亿参数
2. **单 binary 分发的威力**——纯 C++ 没运行时依赖，所以才能塞进树莓派、做成 llamafile
3. **多后端抽象**——同一份算子在 Metal/CUDA/Vulkan/CPU 上分别手工实现，不靠 PyTorch 这种通用框架
4. **生态是封装层叠出来的**——llama.cpp 在底，Ollama 套用户 API，LM Studio 套 GUI，llamafile 套分发；每层只解决一个问题

## 延伸阅读

- 仓库本身：[ggml-org/llama.cpp](https://github.com/ggml-org/llama.cpp)
- GGUF 格式规范：[ggml/docs/gguf.md](https://github.com/ggml-org/ggml/blob/master/docs/gguf.md)
- 作者最初一周怎么搞出来的：[discussions/205](https://github.com/ggerganov/llama.cpp/discussions/205)

## 关联

- [[ollama]] —— Ollama 把 llama.cpp 包成 docker pull/run 风格的工具
- [[vllm]] —— vLLM 是云端高吞吐推理，目标和 llama.cpp 完全不同（GPU 多用户 vs 端侧单用户）
- [[llamaindex]] —— 上层 RAG 框架，可接 llama.cpp 作为本地推理后端
- [[accelerate]] —— HuggingFace 训练侧的设备抽象，与 llama.cpp 推理侧多后端是镜像问题
- [[pytorch]] —— 训练主流框架；llama.cpp 解决的是"训完之后怎么塞进消费硬件"

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
