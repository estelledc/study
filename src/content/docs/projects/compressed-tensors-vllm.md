---
title: compressed-tensors — vLLM 的量化模型格式
来源: https://github.com/neuralmagic/compressed-tensors
日期: 2026-06-13
分类: 机器学习
子分类: ML 系统
provenance: pipeline-v3
---

## 一句话概括

compressed-tensors 是一个基于 safetensors 的扩展格式，让量化后的 AI 模型（把大数字拆成小数字来省空间）可以统一、高效地存到硬盘上。

## 为什么要学这个？

想象一下，你买了一本 1000 页的厚书（一个大模型），但你的书包（显存）很小，装不下。于是你用一种"压缩法"把每页的内容浓缩成原来的一半大小，这本薄书还是能读，只是稍微费点脑子。

compressed-tensors 就是干这件事的——它管的是"浓缩后的书怎么打包、怎么存储、怎么再打开读"这个环节。

在 AI 的世界里，这叫**模型量化（Quantization）**：把模型里的数字从 16 位（float16）压缩到 4 位甚至 8 位，从而减少内存占用、加快推理速度。

## 核心概念

### 1. safetensors 是什么？

safetensors 是 Hugging Face 提出的一个"只存数据、不存代码"的文件格式，用来替代传统的 pickle。它的特点是安全——加载模型时不会执行任意代码，避免黑客注入恶意程序。

compressed-tensors 就是在这个安全格式之上"打个补丁"，增加了对压缩/量化数据的支持。

### 2. 量化的类型

| 类型 | 说人话 | 举例 |
|------|--------|------|
| Weight-only | 只压缩模型的"参数"（脑子里的数字），计算还是用高精度 | W4A16：权重4位，激活16位 |
| Activation | 连中间计算结果也压缩 | W8A8：权重8位，激活8位 |
| KV Cache | 压缩对话历史缓存 | 省显存 |
| 混合量化 | 不同层用不同压缩率 | 重要的层不压缩，不重要的层压缩狠一点 |

### 3. 压缩状态（Quantization Status）

模型从原始到压缩，会经历三个阶段：

1. **CALIBRATION（校准）**：用一些样本数据跑一遍模型，看看哪些数字可以安全地变小
2. **QUANTIZED（已量化）**：压缩完成，但还没冻结
3. **FROZEN（已冻结）**：压缩参数被锁定，可以安全保存到硬盘

### 4. 支持的压缩方法

compressed-tensors 不是自己发明压缩算法，而是当个"通用快递员"——它支持多种已有的压缩方法：

- **GPTQ**：一种逐层压缩方法
- **AWQ**：自适应权重量化
- **SmoothQuant**：把计算难度从权重转移到激活值上
- **FP8**：用 8 位浮点数存储
- **稀疏化（Sparsity）**：把不重要的大量参数设为零

## 代码示例

### 示例一：对一个小模型做量化并保存到硬盘

这段代码演示了完整的流程：加载模型 → 配置量化 → 用数据校准 → 压缩保存。

```python
from transformers import AutoModelForCausalLM, AutoTokenizer
from compressed_tensors import (
    QuantizationConfig,
    QuantizationStatus,
    apply_quantization_config,
    freeze_module_quantization,
    compress_quantized_weights,
    ModelCompressor,
)
from datasets import load_dataset
from torch.utils.data import DataLoader

# 第一步：加载一个原始的大模型
model_name = "TinyLlama/TinyLlama-1.1B-intermediate-step-1431k-3T"
model = AutoModelForCausalLM.from_pretrained(
    model_name, device_map="cuda:0", torch_dtype="auto"
)

# 第二步：读取量化配置文件，告诉模型"怎么用4位来存权重"
config = QuantizationConfig.parse_file("./examples/bit_packing/int4_config.json")

# 第三步：进入"校准"模式——用真实数据让模型自己看看哪些数字可以变小
config.quantization_status = QuantizationStatus.CALIBRATION
apply_quantization_config(model, config)

# 第四步：准备校准用的数据集（用512句文本"喂"给模型）
dataset = load_dataset("ptb_text_only")["train"]
tokenizer = AutoTokenizer.from_pretrained(model_name)

def tokenize_function(examples):
    return tokenizer(examples["sentence"], padding=False, truncation=True, max_length=1024)

tokenized_dataset = dataset.map(tokenize_function, batched=True)
data_loader = DataLoader(tokenized_dataset, batch_size=1)

# 第五步：跑校准——让模型过一遍数据
for idx, sample in enumerate(data_loader):
    sample = {key: value.to("cuda") for key, value in sample.items()}
    _ = model(**sample)
    if idx >= 512:
        break

# 第六步：冻结量化参数，然后压缩权重到硬盘
model.apply(freeze_module_quantization)
model.apply(compress_quantized_weights)

# 第七步：保存压缩后的模型
output_dir = "./my_compressed_model"
compressor = ModelCompressor.from_pretrained_model(model)
compressor.compress_model(model)
model.save_pretrained(output_dir)
```

### 示例二：直接加载一个已经量化的模型

量化的模型存到硬盘后，和普通模型用法几乎一样。

```python
from transformers import AutoModelForCausalLM, AutoConfig
from compressed_tensors import QuantizationConfig

# 加载压缩模型的配置文件，看看它是怎么被压缩的
config = AutoConfig.from_pretrained("./my_compressed_model")
quantization_config = getattr(config, "quantization_config", None)

if quantization_config:
    # 解析量化配置，了解用了什么压缩方案
    q_config = QuantizationConfig.model_validate(quantization_config)
    print(f"压缩方案: {q_config.quant_method}")
    print(f"量化精度: 权重 {q_config.bits} 位")
    print(f"当前状态: {q_config.quantization_status}")
else:
    print("这个模型没有做量化。")

# 直接加载量化后的模型——底层会自动处理解压，你不需要操心
model = AutoModelForCausalLM.from_pretrained(
    "./my_compressed_model",
    device_map="cuda:0",
    torch_dtype="auto",
)

# 和正常模型一样推理
inputs = tokenizer("你好，请介绍一下你自己。", return_tensors="pt").to("cuda")
outputs = model.generate(**inputs, max_new_tokens=50)
print(tokenizer.decode(outputs[0], skip_special_tokens=True))
```

## 架构关系图

```
原始模型 (float16)
      │
      ▼
 ┌─────────────┐
 │  校准 (Calibration)  │  ← 用少量数据跑一遍，找规律
 └─────────────┘
      │
      ▼
 ┌─────────────┐
 │  量化 (Quantize)  │  ← float16 → int4/int8，数字变小
 └─────────────┘
      │
      ▼
 ┌─────────────┐
 │  压缩 (Compress)  │  ← 冻结参数，打包数据
 └─────────────┘
      │
      ▼
 ┌─────────────────┐
 │ compressed-tensors │  ← 存成 safetensors 格式，带量化元数据
 │  (.safetensors)   │
 └─────────────────┘
```

## 关键点总结

- compressed-tensors = safetensors 的"量化插件"，让压缩后的模型能安全地存到硬盘上
- 它不发明压缩算法，而是统一了各种压缩方法的存储格式
- 三种状态：校准 → 量化 → 冻结，理解这个流程就理解了量化
- 支持混合量化（不同层不同精度），这是它相比其他方案的亮点
- 用 vLLM 推理时，自动识别并加载 compressed-tensors 格式的模型，无需额外配置

## 延伸学习

如果你想进一步了解，推荐的方向：

1. **safetensors 本身**：了解它为什么比 pickle 安全
2. **GPTQ / AWQ / SmoothQuant**：了解各种量化算法的差异
3. **vLLM 推理引擎**：compressed-tensors 主要服务于 vLLM，了解它怎么加载量化模型
4. **LLM-Compressor**：vLLM 官方出的模型压缩工具集，和 compressed-tensors 配套使用
