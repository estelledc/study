---
title: Ollama — 本地跑 LLM 的工具
来源: https://github.com/ollama/ollama
日期: 2026-05-29
子分类: ai-infra
分类: 机器学习
难度: 中级
provenance: pipeline-v3
---

## 是什么

Ollama 是**本地大语言模型的"Docker"**。日常类比：以前你想在自己电脑跑一个 LLM，要先装 Python，再装 cuda，再装 transformers，再下一堆 dependencies，弄一上午还可能版本不对——Ollama 把这些全打包成**一个 binary + 一行命令**。

实际操作长这样：

```bash
ollama pull llama3        # 下载模型
ollama run llama3         # 进入对话
```

两行命令，本地就有一个能聊天的 LLM。模型文件、权重、推理引擎、HTTP 服务，全都在那个单 binary 里。

更关键的是：它跑起来后开了一个 `localhost:11434` 端口，提供**和 OpenAI 一样格式的 HTTP API**。你之前写给 OpenAI 的代码，把 BASE_URL 一改，零修改跑本地模型。

## 为什么重要

不理解 Ollama，下面这些事说不清：

- 为什么 2024 年开始"本地跑 LLM"突然变成"普通用户也能玩"的事——不是模型变小了，是**安装这件事**变成了 `npm install` 级别
- 为什么 LangChain / LlamaIndex / CrewAI 这些框架默认就支持 Ollama——它的 API 已经是事实标准
- 为什么 Mac M-series 笔记本能跑 7B 模型——Ollama 自动用 Metal GPU 加速，用户不用配
- 为什么"本地 LLM 三强"是 Ollama / LM Studio / GPT4All——三者都是为"普通人"设计的，但 Ollama 是 CLI/API 优先（开发者最爱）

一句话总结：**Ollama 把"在自己电脑跑大模型"从一件需要工程师周末的事，变成了一行命令的事**。

## 核心要点

Ollama 的设计可以拆成 **三件事**：

1. **Modelfile（Dockerfile 风格的"模型配置 DSL"）**
   你可以写一个声明文件，告诉 Ollama "基于 llama3，加一段 system prompt，温度调到 0.7"，命名一个新模型。
   ```
   FROM llama3.1
   SYSTEM "You are a helpful Chinese assistant."
   PARAMETER temperature 0.7
   ```
   然后 `ollama create my-llama -f Modelfile`，就有了一个叫 `my-llama` 的自定义模型。
   类比：Dockerfile 让你"基于 ubuntu 镜像加几层"，Modelfile 让你"基于 llama 模型加几层配置"。

2. **GGUF 量化模型（让 7B 模型 4GB 显存能跑）**
   原始的 7B 模型 FP16 精度要 14GB 显存，Mac 笔记本根本跑不动。GGUF 是一种**模型压缩格式**——把每个权重从 16-bit 浮点压成 4-bit 或 8-bit 整数，体积缩到 1/4，速度反而快。
   Ollama 默认拉的就是 Q4_K_M（4-bit 量化），质量损失约 5%，但 7B 模型只占 4GB——MacBook Air 也能跑。

3. **REST API + OpenAI 兼容**
   Ollama 跑起来后开两套 API：
   - `/api/generate`、`/api/chat`：原生 API
   - `/v1/chat/completions`：**和 OpenAI 完全一样的格式**

   于是你之前用 OpenAI Python SDK 写的代码，只要改一个环境变量（`OPENAI_BASE_URL=http://localhost:11434/v1`），其他**一行不改**，就跑本地模型了。

## 实践案例

### 案例 1：一行命令跑 LLM

```bash
ollama pull llama3.1
ollama run llama3.1 "用一句话解释相对论"
```

第一次 pull 模型大约 30-60 秒（取决于带宽），之后跑起来约 2-5 秒加载到内存，然后就能对话。

### 案例 2：用 Modelfile 做个"古文先生"

```bash
mkdir sage && cd sage
cat > Modelfile <<'EOF'
FROM llama3.1
SYSTEM "你是一位读过四书五经的先生。无论问什么都用古文回答，每句不超过 12 字。"
PARAMETER temperature 0.6
EOF

ollama create sage -f Modelfile
ollama run sage "如何学好编程？"
# 预期输出：勤练为本，读书为辅。
```

注意：`ollama create` **不会**重新下载 llama3.1，它复用已有的权重 blob，只新建一个 manifest 指向同一个文件——这就是为什么"像 Docker"，layer 复用。

### 案例 3：与 LangChain 接通

```python
from langchain_ollama import ChatOllama

llm = ChatOllama(model="llama3.1", temperature=0.7)
print(llm.invoke("Go 的 channel 一句话讲清"))
```

LangChain 会用 Ollama 的 `/api/chat` 端点。如果你之前用的是 `ChatOpenAI`，把这一行换成 `ChatOllama` 就行——上面所有的 chain / agent / RAG 代码都不用改。

## 踩过的坑

1. **内存吃货**：模型尺寸 ≈ 实际占内存。7B 模型 Q4 占 4GB，13B 占 8GB，**70B 满载需要 40GB+**。Mac M2 Pro 64GB 跑 70B 能跑但慢成 PPT，M2 8GB 只能跑 1B-3B 模型。下载前先 `ollama list` 看模型大小再选。

2. **量化质量差异**：同一个模型有 Q2 / Q4 / Q5 / Q8 多种量化版本——数字越高越接近原版但越占内存。Q4_K_M 是甜点位（默认），Q2 会明显变笨（写代码会出错），Q8 几乎无损但占两倍内存。**别一上来就选 Q2**。

3. **模型库不全**：Ollama 官方 registry 上的模型必须是 **GGUF 格式**。HuggingFace 上很多模型是 safetensors / pytorch_model.bin 格式，要先用 `llama.cpp` 的 `convert.py` 工具转成 GGUF 才能 import 回 Ollama。这一步对新手不友好。

4. **和 [[vllm]] 用错场景**：Ollama 适合**个人 + 小团队 + 调试**，不适合**生产高并发**。它默认 numParallel=4，超过排队。给 1000 个用户用一个模型选 vLLM；自己电脑跑选 Ollama。

5. **桌面 app 和 CLI 配置不同步**：Mac 上用 brew 装的 ollama 和官网下载的 .app 是两套——模型默认路径都不一样，常见踩坑"GUI 拉的模型 CLI 看不到"。建议二选一别同时装。

## 适用 vs 不适用场景

**适用**：

- 个人本地试模型（一个人、一台 Mac/PC）—— Ollama 最甜的场景
- 小团队内部 LLM 服务（5-10 个工程师，OpenAI 兼容 API 接前端）
- LLM 应用开发期 mock—— 调 prompt 不烧真实 token
- 给 PM / 设计师演示自定义 prompt 模型（写一份 Modelfile）

**不适用**：

- 生产推理（千 QPS）→ 用 vLLM / TGI / TensorRT-LLM
- 嵌入式设备（树莓派集群）→ 用 [[llama-cpp]] 直接，少一层 Go runtime 开销
- 完全不写代码的用户（GUI 强依赖）→ 用 LM Studio
- 训练 / fine-tune → Ollama 只跑推理，训练用 transformers + peft

## 历史小故事（可跳过）

- **2023-07**：Jeffrey Morgan 在 GitHub 发布 ollama 0.1.0，初衷只是给自己一个"docker run 风格的 llama.cpp 包装"
- **2024 年**：Mac M3 GPU 加速接入，Ollama 在 Apple Silicon 上速度反超 Linux+CUDA 的同价位机器，成为 Mac 用户首选
- **2024-09**：加 Function Calling 支持（让模型能调工具）
- **2024-12**：加 vision 模型支持（图像输入）
- **2026 年**：星星数破 17 万，与 [[langchain]] / [[llamaindex]] 形成"框架默认对接 Ollama"的事实标准

短短 3 年，Ollama 从"个人项目"变成"本地 LLM 普及的代名词"。

## 学到什么

1. **"易用性"本身是产品力**——llama.cpp 性能更顶但门槛太高，Ollama 多一层 Go 包装牺牲 5-10% 性能换"五分钟跑通"，市场用脚投票
2. **OpenAI API 已成事实标准**——任何新 LLM runtime 想被采纳，第一件事就是兼容 OpenAI 的 `/v1/chat/completions` 路径
3. **content-addressed storage 是个好套路**——Docker、Git、Nix、Ollama 都用这招（sha256 寻址 blob + 可变 manifest），改配置不动 blob，layer 复用零成本
4. **DSL 配置文件 vs 命令行 flag**——Modelfile 把"用什么模型 + 什么 system prompt + 什么参数"打包成可版本化的声明文件，比一长串 `--temperature 0.7 --num-ctx 4096 ...` 易读且可分享

## 延伸阅读

- 官方安装与 Quick Start：[ollama.com](https://ollama.com)
- Modelfile 参考：仓库内 `docs/modelfile.md`
- GGUF 格式说明：[gguf.io](https://gguf.io)（量化背后的文件结构）
- 视频：YouTube 搜 "Ollama vs LM Studio vs llama.cpp"——10 分钟看完三者差异
- [[llama-cpp]] —— Ollama 的"内核"，C++ 写的极致性能推理引擎
- [[langchain]] —— 上层 LLM 应用框架，默认支持 Ollama

## 关联

- [[llama-cpp]] —— Ollama 调用的底层推理引擎（subprocess 包装）
- [[langchain]] —— 上层应用框架默认对接 Ollama 的 API
- [[vllm]] —— 生产推理引擎，与 Ollama 形成"个人 vs 生产"分工
- [[transformers]] —— HuggingFace 训练与推理库，Ollama 的模型多数来自这里转 GGUF
