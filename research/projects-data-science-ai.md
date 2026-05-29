---
title: 项目候选 — 数据科学 / ML 基础设施 / AI 工具链
日期: 2026-05-29
---

# 数据科学 / ML 基础设施 / AI 工具链项目候选

候选 70 个，按子类分组（数值计算 8 / PyTorch 6 / TF + JAX 5 / 训练加速 5 / 推理引擎 6 / Agent 框架 6 / MLOps 5 / 数据编排 5 / Serving 4 / AutoML 评估 5 / 标注 OCR 5 / 音频 5 / 图像视频 5）。

已过滤现有覆盖：AI 应用层 dify / langfuse / librechat / ollama / chroma / claude-code / mcp-ts-sdk / vercel-ai / continue；浏览器自动化 midscene / steel-browser / stagehand / patchright / nanobrowser / browser-use；向量库 faiss / hnswlib / annoy / lance / lancedb（已在 databases）；编辑器侧 jupyter-notebook / jupyterlab / aider / cline / shell-gpt（已在 editors）。本表只收"训练 + 推理 + 数据 + Agent + 多模态生成"基础设施。

Stars 量级为 2025-2026 区间近似值，仅作影响力参考。

## 数值计算 / DataFrame / 数据处理（8 个）

| Slug | 项目 | Stars 量级 | 一句话价值 | URL |
|---|---|---|---|---|
| `numpy` | NumPy — Python 科学计算基石 | ~28k | ndarray 与 ufunc 定义了整个 PyData 栈的内存与广播契约 | https://github.com/numpy/numpy |
| `pandas` | pandas — 表格数据事实标准 | ~43k | DataFrame / Index / GroupBy 三件套，数据分析教学第一课 | https://github.com/pandas-dev/pandas |
| `polars` | Polars — Rust 写的列存 DataFrame | ~31k | Lazy 查询 + Apache Arrow 内存，单机替代 pandas / Spark | https://github.com/pola-rs/polars |
| `scipy` | SciPy — 科学计算扩展库 | ~13k | 优化 / 线代 / 信号 / 统计的标准实现，NumPy 之上的工程层 | https://github.com/scipy/scipy |
| `scikit-learn` | scikit-learn — 经典 ML 库 | ~60k | fit / predict / transform 三件套教学整个 ML 工程范式 | https://github.com/scikit-learn/scikit-learn |
| `dask` | Dask — Python 并行计算框架 | ~12k | 用 NumPy / pandas 接口做分布式，大数据入门门槛最低 | https://github.com/dask/dask |
| `pyarrow` | Apache Arrow（Python） — 列存内存格式 | ~15k | 跨语言零拷贝列存，连接 pandas / polars / DuckDB / Spark 的胶水 | https://github.com/apache/arrow |
| `modin` | Modin — pandas 的分布式 drop-in | ~10k | `import modin.pandas as pd` 一行换上 Ray / Dask 后端 | https://github.com/modin-project/modin |

## PyTorch 生态（6 个）

| Slug | 项目 | Stars 量级 | 一句话价值 | URL |
|---|---|---|---|---|
| `pytorch` | PyTorch — 深度学习主流框架 | ~84k | 动态图 + autograd + CUDA 集成，研究界事实标准 | https://github.com/pytorch/pytorch |
| `pytorch-lightning` | Lightning — PyTorch 训练循环抽象 | ~28k | Trainer 把 device / 分布式 / checkpoint 收口，研究代码上生产 | https://github.com/Lightning-AI/pytorch-lightning |
| `fastai` | fastai — 上层训练库 | ~26k | "三行代码 SOTA"，迁移学习 + 数据 block API 教学神器 | https://github.com/fastai/fastai |
| `torchtune` | torchtune — 官方 LLM 微调库 | ~5k | PyTorch 自家纯 native 实现，QLoRA / 全参 / DPO 一份配置切换 | https://github.com/pytorch/torchtune |
| `accelerate` | Accelerate — HuggingFace 设备/分布式抽象 | ~8k | 几行 wrap 把单机脚本拓展到多 GPU / TPU / DeepSpeed / FSDP | https://github.com/huggingface/accelerate |
| `trl` | TRL — RLHF / DPO / GRPO 训练库 | ~11k | SFT / RewardModel / PPO / DPO trainer 一站式，主流对齐方案标杆 | https://github.com/huggingface/trl |

## TensorFlow / JAX 生态（5 个）

| Slug | 项目 | Stars 量级 | 一句话价值 | URL |
|---|---|---|---|---|
| `tensorflow` | TensorFlow — Google 端到端 DL 平台 | ~187k | 静态图 + XLA + TFLite / TF.js，工业部署最完整的工具链 | https://github.com/tensorflow/tensorflow |
| `keras` | Keras 3 — 多后端高层 API | ~62k | 同一份模型代码跑 TF / JAX / PyTorch，DL 教学事实入门 | https://github.com/keras-team/keras |
| `jax` | JAX — Google 函数式数值计算 | ~31k | grad / vmap / pmap / jit 四个变换重写并行编程范式 | https://github.com/jax-ml/jax |
| `flax` | Flax — JAX 上的神经网络库 | ~6k | 函数式纯模块 + nnx 新 API，Google 官方研究底座 | https://github.com/google/flax |
| `optax` | Optax — JAX 优化器组合库 | ~1.8k | 优化器是函数变换链，chain 组合 SGD / Adam / 调度器 | https://github.com/google-deepmind/optax |

## 大模型训练加速（5 个）

| Slug | 项目 | Stars 量级 | 一句话价值 | URL |
|---|---|---|---|---|
| `deepspeed` | DeepSpeed — 微软分布式训练库 | ~36k | ZeRO 三阶段切分 + Offload，万亿参数训练事实方案 | https://github.com/microsoft/DeepSpeed |
| `megatron-lm` | Megatron-LM — NVIDIA 张量并行库 | ~11k | TP / PP / SP 三维并行实现教科书，主流训练框架内核都引用 | https://github.com/NVIDIA/Megatron-LM |
| `colossal-ai` | Colossal-AI — 大模型训练系统 | ~39k | Gemini 异构内存 + 1D-3D 并行，开源社区训练加速代表 | https://github.com/hpcaitech/ColossalAI |
| `unsloth` | Unsloth — 微调 2-5x 加速 | ~18k | 手写 Triton kernel + 显存优化，单卡也能跑 70B QLoRA | https://github.com/unslothai/unsloth |
| `axolotl` | Axolotl — YAML 驱动 LLM 微调 | ~8k | 把 SFT / DPO / ORPO / LoRA 收成一份 YAML，社区微调首选脚手架 | https://github.com/axolotl-ai-cloud/axolotl |

## LLM 推理引擎（6 个）

| Slug | 项目 | Stars 量级 | 一句话价值 | URL |
|---|---|---|---|---|
| `vllm` | vLLM — 高吞吐 LLM 推理服务 | ~30k | PagedAttention 让 KV cache 变虚拟内存，吞吐量基线 | https://github.com/vllm-project/vllm |
| `sglang` | SGLang — 结构化推理运行时 | ~8k | RadixAttention 复用前缀 KV，agent / 工具调用场景吞吐王 | https://github.com/sgl-project/sglang |
| `llama-cpp` | llama.cpp — C/C++ 量化推理 | ~70k | GGUF + Metal / CUDA / Vulkan，端侧 LLM 事实运行时 | https://github.com/ggml-org/llama.cpp |
| `mlx` | MLX — Apple 自研 ML 框架 | ~17k | Apple Silicon 统一内存优化，Mac 上跑大模型最快路径 | https://github.com/ml-explore/mlx |
| `candle` | Candle — Rust 推理框架 | ~16k | HuggingFace 出品，无 Python 依赖，serverless / 边缘部署友好 | https://github.com/huggingface/candle |
| `ctranslate2` | CTranslate2 — Transformer 推理加速 | ~3.6k | 自研 IR + INT8/FP16，Whisper / NLLB 翻译模型部署首选 | https://github.com/OpenNMT/CTranslate2 |

## Agent / RAG / 编排框架（6 个）

| Slug | 项目 | Stars 量级 | 一句话价值 | URL |
|---|---|---|---|---|
| `langchain` | LangChain — LLM 应用编排框架 | ~92k | Chain / Agent / Tool 抽象定义了第一波 RAG / Agent 工程范式 | https://github.com/langchain-ai/langchain |
| `llama-index` | LlamaIndex — 数据 / RAG 框架 | ~37k | Loader / Index / Retriever / QueryEngine 四件套主打 RAG | https://github.com/run-llama/llama_index |
| `haystack` | Haystack — 企业 NLP / RAG 流水线 | ~17k | DAG 风格 Pipeline，比 LangChain 更工程化，类型严格 | https://github.com/deepset-ai/haystack |
| `autogen` | AutoGen — 微软多 Agent 框架 | ~35k | ConversableAgent + GroupChat 抽象，多 Agent 协作研究底座 | https://github.com/microsoft/autogen |
| `crewai` | CrewAI — 角色化 Agent 编排 | ~24k | Role / Task / Crew 三段式，把 Agent 拟人化做产品快 | https://github.com/crewAIInc/crewAI |
| `dspy` | DSPy — 程序化 prompt 框架 | ~18k | 用编译器思路优化 prompt，签名 + Module + Optimizer 取代手写 | https://github.com/stanfordnlp/dspy |

## MLOps / 实验追踪（5 个）

| Slug | 项目 | Stars 量级 | 一句话价值 | URL |
|---|---|---|---|---|
| `mlflow` | MLflow — 端到端 ML 生命周期 | ~19k | Tracking / Models / Registry / Projects 四件套行业标准 | https://github.com/mlflow/mlflow |
| `wandb` | Weights & Biases — 实验跟踪 SDK | ~9k | 几行 init 把指标 / 系统 / 代码自动入库，研究界默认工具 | https://github.com/wandb/wandb |
| `dvc` | DVC — 数据版本管理 | ~14k | "Git for data"，把数据 / 模型 / pipeline 都 Git 化 | https://github.com/iterative/dvc |
| `clearml` | ClearML — 自托管 MLOps 套件 | ~5.6k | 实验跟踪 + 远程执行 + 数据管理三合一，可私有部署 | https://github.com/clearml/clearml |
| `metaflow` | Metaflow — Netflix 数据科学框架 | ~8k | Python 装饰器写 DAG，本地跑 -> AWS / K8s 一键远程 | https://github.com/Netflix/metaflow |

## 数据 ETL / 编排（5 个）

| Slug | 项目 | Stars 量级 | 一句话价值 | URL |
|---|---|---|---|---|
| `airflow` | Apache Airflow — DAG 工作流编排 | ~37k | DAG-as-code 鼻祖，调度系统的语义参考实现 | https://github.com/apache/airflow |
| `prefect` | Prefect — Python 原生编排 | ~17k | Flow / Task 装饰器 + 动态 DAG，Airflow 不能解决的复用场景 | https://github.com/PrefectHQ/prefect |
| `dagster` | Dagster — 数据资产编排 | ~12k | 把"数据资产"作为一等公民，type-aware + asset lineage | https://github.com/dagster-io/dagster |
| `dbt-core` | dbt-core — 数据转换工具 | ~10k | SQL + Jinja + 测试，数据仓库里的"软件工程"运动 | https://github.com/dbt-labs/dbt-core |
| `kedro` | Kedro — 数据科学项目模板 | ~10k | QuantumBlack 出品，把 notebook 转成可复用模块化 pipeline | https://github.com/kedro-org/kedro |

## 特征 / Serving / 算力（4 个）

| Slug | 项目 | Stars 量级 | 一句话价值 | URL |
|---|---|---|---|---|
| `feast` | Feast — 开源特征仓库 | ~6k | 在线 / 离线特征一致性问题的标准答案，Linux Foundation AI | https://github.com/feast-dev/feast |
| `bentoml` | BentoML — 模型打包部署 | ~7k | "Bento" 把模型 + 依赖 + API 封成镜像，K8s / Serverless 通吃 | https://github.com/bentoml/BentoML |
| `ray` | Ray — 分布式 Python 计算 | ~33k | Actor 模型 + 调度器，Tune / Serve / RLlib / Train 全家桶基座 | https://github.com/ray-project/ray |
| `triton-inference-server` | Triton — NVIDIA 推理服务器 | ~8k | 多框架 + 动态批 + 模型仓库，GPU 推理服务化工业标杆 | https://github.com/triton-inference-server/server |

## AutoML / 可解释性 / 评估（5 个）

| Slug | 项目 | Stars 量级 | 一句话价值 | URL |
|---|---|---|---|---|
| `optuna` | Optuna — 超参搜索框架 | ~11k | define-by-run + TPE / CMA-ES，HPO 工程实现的事实标准 | https://github.com/optuna/optuna |
| `autogluon` | AutoGluon — AWS AutoML 套件 | ~8k | 表格 / 时序 / 多模态一行 fit，AutoML 比赛常客 | https://github.com/autogluon/autogluon |
| `shap` | SHAP — 模型解释库 | ~23k | 基于博弈论的 Shapley value，特征重要性分析事实标准 | https://github.com/shap/shap |
| `captum` | Captum — PyTorch 可解释性 | ~5k | 梯度 / 集成梯度 / Layer attribution，DL 模型归因工具箱 | https://github.com/pytorch/captum |
| `lm-evaluation-harness` | lm-evaluation-harness — LLM 基准 | ~7k | EleutherAI 出品，HuggingFace OpenLLM 排行榜的执行底座 | https://github.com/EleutherAI/lm-evaluation-harness |

## 数据标注 / 文档 OCR（5 个）

| Slug | 项目 | Stars 量级 | 一句话价值 | URL |
|---|---|---|---|---|
| `label-studio` | Label Studio — 多模态标注平台 | ~19k | 文本 / 图像 / 音频 / 视频 / 时间序列通吃的开源标注王者 | https://github.com/HumanSignal/label-studio |
| `cvat` | CVAT — 计算机视觉标注 | ~13k | Intel 起家，视频帧标注 / 半自动追踪是杀手锏 | https://github.com/cvat-ai/cvat |
| `argilla` | Argilla — LLM 数据质量平台 | ~4k | 专门为 LLM 数据集打磨：标注 / 评估 / 反馈一体化 | https://github.com/argilla-io/argilla |
| `paddleocr` | PaddleOCR — 多语言 OCR 工具包 | ~44k | 检测 + 识别 + 结构化 + 表格，中文 OCR 最强开源方案 | https://github.com/PaddlePaddle/PaddleOCR |
| `unstructured` | Unstructured — 文档解析库 | ~10k | PDF / DOCX / HTML / 邮件统一切成 chunk，RAG 数据准备首选 | https://github.com/Unstructured-IO/unstructured |

## 音频 / 语音（5 个）

| Slug | 项目 | Stars 量级 | 一句话价值 | URL |
|---|---|---|---|---|
| `whisper` | Whisper — OpenAI 多语言 ASR | ~71k | 一个模型 99 种语言 + 翻译，离线语音识别事实标准 | https://github.com/openai/whisper |
| `coqui-tts` | Coqui TTS — 多语种 TTS 工具包 | ~35k | XTTS 跨语言克隆 + VITS，开源 TTS 最完整代码库 | https://github.com/coqui-ai/TTS |
| `piper` | Piper — 端侧低延迟 TTS | ~6k | Rhasspy 出品，树莓派也能跑的小型 TTS，VoiceAssistant 用 | https://github.com/rhasspy/piper |
| `faster-whisper` | faster-whisper — Whisper 加速版 | ~12k | CTranslate2 后端，比官方 Whisper 快 4x，显存只用 1/2 | https://github.com/SYSTRAN/faster-whisper |
| `silero-vad` | Silero VAD — 轻量语音活动检测 | ~4k | 1MB 模型 + ms 级延迟，所有语音流水线的"开关层" | https://github.com/snakers4/silero-vad |

## 图像 / 视频生成（5 个）

| Slug | 项目 | Stars 量级 | 一句话价值 | URL |
|---|---|---|---|---|
| `comfyui` | ComfyUI — 节点式扩散模型 GUI | ~56k | 把 sampler / loader / latent 拆成节点，工作流社区最活跃 | https://github.com/comfyanonymous/ComfyUI |
| `stable-diffusion-webui` | AUTOMATIC1111 — SD WebUI | ~142k | 最早把 SD 工具化的 Gradio 应用，扩展生态最庞大 | https://github.com/AUTOMATIC1111/stable-diffusion-webui |
| `invokeai` | InvokeAI — 工业级 SD 工具 | ~24k | 对标 A1111 但工程化更好，画布 / 节点 / 模型管理一体 | https://github.com/invoke-ai/InvokeAI |
| `open-sora` | Open-Sora — 开源 Sora 复现 | ~22k | hpcaitech 系列，DiT + STDiT 视频生成完整训练 / 推理代码 | https://github.com/hpcaitech/Open-Sora |
| `fooocus` | Fooocus — 极简 SDXL 应用 | ~41k | 把 SDXL 调到"输入 prompt 就能用"，精简版 A1111 替代品 | https://github.com/lllyasviel/Fooocus |
