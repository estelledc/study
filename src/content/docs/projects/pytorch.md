---
title: 'PyTorch — 深度学习主流框架'
来源: 'https://github.com/pytorch/pytorch'
日期: '2026-05-30'
子分类: 数据科学与 AI
分类: 机器学习
难度: '中级'
schema_version: legacy-long
provenance: legacy-migrated
---

## 是什么

PyTorch 是一个**用 Python 写神经网络、让 GPU 替你跑数学**的框架。日常类比：像一个**会自动求导的超级 NumPy**——你随手写矩阵运算，它一边算结果，一边在背后偷偷记下"刚才每一步怎么算的"，等你说"该反向传播了"，它就把链式法则替你跑一遍。

你写：

```python
import torch
x = torch.tensor([2.0], requires_grad=True)
y = x ** 3 + 2 * x
y.backward()
print(x.grad)  # tensor([14.])  ← 3*x^2 + 2 在 x=2 处
```

你**没写一行求导公式**，PyTorch 自己推出 `dy/dx = 14`。这就是 autograd。

加上 `.cuda()` 一句话搬到 GPU，PyTorch 就成了 OpenAI、Tesla、HuggingFace 训练大模型的**事实标准底座**。

## 为什么重要

不理解 PyTorch，下面这些事都没法解释：

- 为什么 2018 年后**研究界论文几乎全用 PyTorch**，TensorFlow 退守工业部署
- 为什么写神经网络可以像写普通 Python（`for` 循环、`if` 分支随便用）——这叫**动态图**
- 为什么 2023 年 `torch.compile` 一出，同样代码不改一个字就快 30%-200%
- 为什么 Meta 2022 年把它**捐给 Linux Foundation**——避免单一厂商绑架，社区才放心用

## 核心要点

PyTorch 的能力可以拆成 **四层**：

1. **Tensor（张量）**：多维数组，和 NumPy 几乎一样的 API，但能跑在 GPU 上。是所有计算的基本单位。

2. **Autograd（自动微分）**：每个 `requires_grad=True` 的 tensor 在被运算时，PyTorch 偷偷建一棵"计算图"，记录"谁是谁算来的"。`.backward()` 时反过来跑链式法则。

3. **nn.Module（积木）**：把"一层神经网络"封装成一个类，参数自动注册、`.to(device)` 自动搬。复杂网络靠嵌套组合而不是从零写。

4. **torch.compile（2.0 新引擎）**：把你的 eager 代码用 TorchDynamo 抓成图，再交给 TorchInductor + Triton 编译成融合后的 GPU kernel。**不改代码就提速**。

## 实践案例

### 案例 1：写一个最小的神经网络训练循环

```python
import torch
from torch import nn

model = nn.Sequential(nn.Linear(10, 32), nn.ReLU(), nn.Linear(32, 1))
opt = torch.optim.Adam(model.parameters(), lr=1e-3)
loss_fn = nn.MSELoss()

for x, y in dataloader:
    pred = model(x)
    loss = loss_fn(pred, y)
    opt.zero_grad()      # 清掉上一轮的梯度
    loss.backward()      # 反向传播
    opt.step()           # 用梯度更新参数
```

这 6 行就是**所有 PyTorch 训练**的骨架。`forward → loss → backward → step`，循环到收敛。

### 案例 2：动态图的威力——`if` 分支随便用

```python
def forward(x):
    if x.sum() > 0:
        return self.branch_a(x)
    else:
        return self.branch_b(x)
```

**TensorFlow 1.x 时代**这要写 `tf.cond`、构造 placeholder、`session.run`。PyTorch 直接 Python `if`——因为图是**每次 forward 现场建**的，不是预先编译的。

### 案例 3：torch.compile 一行加速

```python
model = MyBigModel()
model = torch.compile(model)   # ← 加这一行
# 训练循环不动
```

PyTorch 2.0+ 把 forward 抓成图，TorchInductor 生成 Triton kernel，常见模型 30%-200% 加速。**eager 易调试 + 编译时高性能** 一起拿。

## 踩过的坑

1. **CUDA 版本必须严格对齐**：装 PyTorch 时去[官网选择器](https://pytorch.org/get-started/locally/)选 CUDA 11.8 / 12.1，错一个就 `CUDA error: no kernel image is available`。`pip install torch` 不带版本默认 CPU 版，新人常装错以为没 GPU。

2. **in-place op + autograd = 翻车**：`x += 1` 这种**就地修改**会破坏 autograd 记录的中间结果。报错 `one of the variables needed for gradient computation has been modified`。改成 `x = x + 1`。

3. **DataLoader 的 num_workers 在 macOS 行为不同**：Linux fork、macOS spawn，spawn 下子进程要重新 import，全局变量不共享，常导致"Linux 跑得通 Mac 跑不通"。

4. **`.detach()` vs `.no_grad()` 别混**：`.detach()` 切断单个 tensor 的梯度链；`with torch.no_grad():` 关整个块的 autograd。推理时用后者更省显存。

5. **梯度不清零会累加**：忘了 `opt.zero_grad()` 上一轮梯度会叠到这一轮，loss 看起来"震荡"找不到原因。

## 适用 vs 不适用场景

**适用**：

- 研究原型（动态图 + Python 调试体验）
- 大模型训练（FSDP / DDP / TorchElastic 分布式生态成熟）
- 快速迭代实验（不用编译图，改完即跑）
- 自定义算子（写 CUDA / Triton kernel 后注册回 Python）

**不适用**：

- 极致部署性能（移动端 / 嵌入式）→ 用 ONNX Runtime / TFLite / ExecuTorch 转出
- 纯函数式纯科学计算 → JAX 的 `vmap` / `pmap` / `grad` 组合更优雅
- 不需要 GPU 的小数据 → NumPy + scikit-learn 更轻
- 完全静态、低延迟推理服务 → 转 TensorRT / OpenVINO 更稳

## 历史小故事（可跳过）

- **2002 年**：Torch 在瑞士 IDIAP 出生，Lua 写的，Yann LeCun 团队用了多年
- **2016 年**：Soumith Chintala 等在 Meta FAIR 把 Torch 用 Python 重写——PyTorch 0.1 发布
- **2018 年**：Caffe2 合并进来，PyTorch 1.0 发布，TorchScript 上线
- **2022-09**：Meta 把 PyTorch 捐给 Linux Foundation，成立 PyTorch Foundation
- **2023-03**：PyTorch 2.0 发布，`torch.compile` 成为旗舰特性
- **现在**：~84k stars，HuggingFace / OpenAI / Tesla 训练栈底座

## 学到什么

1. **eager 模式不是性能妥协**——动态图调试体验 + JIT 编译可以同时拿到（torch.compile 证明了）
2. **autograd 是"反向 mode 自动微分"的工程化**，本质是计算图反向遍历 + 链式法则
3. **API 稳定性比新功能更重要**——PyTorch 8 年向后兼容做得比同期框架都好
4. **治理决定信任**——Meta 主动让出控制权进基金会，企业才敢押注
5. **生态护城河**——HuggingFace / Lightning / TorchVision 等上层栈让换框架的迁移成本极高
6. **"Pythonic"不是口号**——用户能用直觉调试任何中间状态，是研究界投票的根本原因

## 延伸阅读

- 官方教程：[PyTorch Tutorials](https://pytorch.org/tutorials/) — 从 60 分钟入门到分布式训练
- 必读论文：[PyTorch: An Imperative Style, High-Performance Deep Learning Library (NeurIPS 2019)](https://arxiv.org/abs/1912.01703)
- torch.compile 深读：[PyTorch 2.0 paper / blog](https://pytorch.org/get-started/pytorch-2.0/)
- [[lambda-calculus]] —— autograd 的数学根基也是函数 + 高阶组合

## 关联

- [[llvm]] —— TorchInductor 走的是 LLVM 风格的多级 IR + 后端代码生成
- [[lambda-calculus]] —— autograd 把"前向函数"映成"反向函数"的能力本质是高阶函数变换
- [[ssa]] —— TorchDynamo 抓出来的 FX Graph 与 SSA 的"每个值只赋值一次"思路相通
- [[hindley-milner]] —— PyTorch 的 tensor shape 推导背后也是"占位符 + 解方程"的思想

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[accelerate]] —— Accelerate — HuggingFace 设备/分布式抽象
- [[adam-2014]] —— Adam — 让深度学习自己挑步长的优化器
- [[adamw-2017]] —— AdamW — 把 weight decay 从梯度里拆出来
- [[axolotl]] —— Axolotl — YAML 驱动 LLM 微调
- [[bentoml]] —— BentoML — 模型打包部署
- [[candle]] —— Candle — HuggingFace 出品的 Rust 推理框架
- [[captum]] —— Captum — 给 PyTorch 模型装上 X 光机
- [[clearml]] —— ClearML — 自托管 MLOps 套件
- [[colossal-ai]] —— Colossal-AI — 大模型训练系统
- [[comfyui]] —— ComfyUI — 节点式扩散模型 GUI
- [[coqui-tts]] —— Coqui TTS — 多语种 TTS 工具包
- [[cudnn-2014]] —— cuDNN — 把卷积写成矩阵乘，让所有深度学习框架共享底层加速
- [[deepspeed]] —— DeepSpeed — 微软分布式训练库
- [[dlrm-2019]] —— DLRM — Meta 把工业推荐模型拆成 4 个标准积木
- [[dspy]] —— DSPy — 把 prompt 写成签名，让编译器替你调
- [[fastai]] —— fastai — 三行代码做迁移学习
- [[faster-whisper]] —— faster-whisper — Whisper 的 4× 加速重写版
- [[fermi-architecture-2010]] —— NVIDIA Fermi — 把 GPU 从游戏卡推上超算
- [[flax]] —— Flax — JAX 上的神经网络库
- [[fsdp-2023]] —— PyTorch FSDP — 把大模型切成 N 份分到 N 张卡
- [[gcn-2017]] —— GCN 2017 — 把卷积搬到图结构上的最简版本
- [[graphsage-2017]] —— GraphSAGE 2017 — 给没见过的节点也能算嵌入
- [[hindley-milner]] —— Hindley-Milner — 编译器自己猜变量类型
- [[invokeai]] —— InvokeAI — 工业级 Stable Diffusion 工具
- [[jax]] —— JAX — Google 函数式数值计算
- [[kepler-architecture-2012]] —— NVIDIA Kepler — 把 GPU 调成深度学习训练默认机型
- [[keras]] —— Keras 3 — 一份模型代码跑三套后端
- [[lambda-calculus]] —— λ-演算 — 用三条规则表达所有可计算函数
- [[li-2018-redner]] —— redner — 让光线追踪能反向传播过几何边缘
- [[librosa]] —— librosa — Python 音频分析库与 MFCC/STFT 事实标准
- [[lindholm-2008-tesla]] —— Lindholm 2008 Tesla — SM、warp、SIMT 这套词汇的官方出生证明
- [[llama-cpp]] —— llama.cpp — 让 LLM 在你电脑里直接跑
- [[llvm]] —— LLVM — 模块化编译器框架
- [[maxwell-architecture-2014]] —— NVIDIA Maxwell — 同一工艺节点把性能每瓦翻一倍
- [[megatron-lm]] —— Megatron-LM — NVIDIA 张量并行库
- [[metaflow]] —— Metaflow — Netflix 给数据科学家的 Python 流水线
- [[mlflow]] —— MLflow — 端到端 ML 生命周期
- [[mlx]] —— MLX — Apple Silicon 统一内存原生 ML 框架
- [[mueller-2022-instant-ngp]] —— Instant-NGP — 把 NeRF 训练从几小时压到 5 秒
- [[ncnn]] —— ncnn — 手机上的「无依赖神经网络放映机」
- [[nerf-2020]] —— NeRF — 用一个 MLP 把整个场景"背"下来
- [[neumf-2017]] —— NeuMF — 用神经网络替掉推荐系统的内积
- [[nvidia-gpu-operator]] —— NVIDIA GPU Operator — K8s 上自动装 GPU 软件栈
- [[open-sora]] —— Open-Sora — 把 Sora 黑盒一比一开源的视频生成项目
- [[opencl-2010]] —— OpenCL 2010 — 一份代码同时跑 CPU/GPU/DSP/FPGA 的开放标准
- [[opencv]] —— OpenCV — 开源计算机视觉库与跨平台图像视频处理
- [[optax]] —— Optax — JAX 优化器组合库
- [[optuna]] —— Optuna — 让超参搜索像写普通 Python 代码一样自然
- [[paddle-lite]] —— Paddle Lite — 把飞桨模型装进手机里的「端侧放映机」
- [[paddleocr]] —— PaddleOCR — 中文 OCR 最强开源方案
- [[park-2019-deepsdf]] —— DeepSDF — 用一个 MLP 把整类 3D 形状的距离场背下来
- [[pascal-architecture-2016]] —— NVIDIA Pascal P100 — HBM2 + NVLink + FP16 让 Tesla 真正变成 AI 卡
- [[pillow]] —— Pillow — Python 图像处理库与 PIL 现代继任者
- [[pipedream-2019]] —— PipeDream — 1F1B 调度让流水线工位别空等
- [[piper]] —— Piper — 端侧低延迟 TTS
- [[plenoxels-2022]] —— Plenoxels — 不要神经网络也能渲染辐射场
- [[ps-li-2014]] —— Parameter Server — 多机训练前 AllReduce 时代的工业标准
- [[pytorch-lightning]] —— PyTorch Lightning — PyTorch 训练循环抽象
- [[ray]] —— Ray — 把单机 Python 函数和类无缝扩展到整个集群
- [[ring-allreduce-2017]] —— Ring All-Reduce — 把 HPC 的环形规约搬进深度学习
- [[sglang]] —— SGLang — 结构化推理运行时
- [[shap]] —— SHAP — 用博弈论给每个特征发工资
- [[ssa]] —— SSA — 静态单赋值形式
- [[stable-diffusion-webui]] —— AUTOMATIC1111 SD WebUI — 把 Stable Diffusion 装进浏览器
- [[taso-2019]] —— TASO — 让机器自己发现深度学习图重写规则
- [[tensorflow]] —— TensorFlow — Google 端到端 DL 平台
- [[tensorflow-osdi-2016]] —— TensorFlow — 把神经网络拆成数据流图再跑到任何机器上
- [[tesla-architecture-2008]] —— NVIDIA Tesla — 把显卡改造成通用并行计算机
- [[torchcodec]] —— TorchCodec — PyTorch 原生 GPU 视频解码与张量输出
- [[torchtune]] —— torchtune — PyTorch 官方 LLM 微调库
- [[transformers-video]] —— Transformers Video — HuggingFace 视频处理器与多模态输入管线
- [[trl]] —— TRL — RLHF / DPO / GRPO 训练库
- [[videochat2]] —— VideoChat2 — OpenGVLab 三阶段训练 Video-LLM 官方实现
- [[vllm-multimodal]] —— vLLM Multimodal — 多模态与视频 URL 高吞吐推理服务
- [[wandb]] —— Weights & Biases — 几行 init 把指标系统代码自动入库
- [[whisper]] —— Whisper — OpenAI 多语言 ASR
- [[world-model-robot-learning-2026]] —— 机器人世界模型综述 — 预测未来再动手

