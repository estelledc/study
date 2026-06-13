---
title: CMSIS-NN — Cortex-M 上的「神经网络专用工具箱」
来源: 'https://github.com/ARM-software/CMSIS-NN'
日期: '2026-06-13'
子分类: 嵌入式
分类: 操作系统
难度: '中级'
provenance: 'pipeline-v3'
---

## 是什么

**CMSIS-NN** 是 Arm 维护的开源 C 语言算子库，专门为 **Cortex-M 微控制器**上的神经网络推理做极致优化。源码托管在 [ARM-software/CMSIS-NN](https://github.com/ARM-software/CMSIS-NN)，当前以独立 CMSIS-Pack 发布，每年大约两次正式版本（如 v6.0.0、v7.0.0）。

日常类比：**如果把 [[tflite-micro]] 比作「放映机」——负责按 FlatBuffer 剧本调度整场推理——那 CMSIS-NN 就是放映机里换上的「高速镜头组」**。放映机仍然决定放哪部电影、何时切镜头；镜头组负责把每一帧画面算得更快、更省内存。你不会单独拿镜头组去拍电影，但换上好镜头，同一台放映机在 STM32 上就能从「卡成幻灯片」变成「勉强实时」。

更接地气的比喻：神经网络推理是一桌满汉全席，有卷积、全连接、池化、Softmax 等十几道菜。通用 C 循环像一把菜刀从头切到尾；CMSIS-NN 则是**按 Cortex-M0 / M4 DSP / M55 Helium 三套厨房设备**，为每道菜准备了专用模具和流水线——编译器根据 `-mcpu=cortex-m55` 等参数自动选最快那套，你通常不用手写 `#ifdef`。

## 解决什么问题

| 痛点 | 朴素 C 实现 | CMSIS-NN 的回应 |
| --- | --- | --- |
| MCU 算力弱 | 浮点卷积在 M4 上动辄数百毫秒 | int8/int4 量化内核 + SIMD / Helium 向量化 |
| RAM 极小 | 中间缓冲随意 `malloc` 会爆 | 提供 `*_get_buffer_size()`，推理前可精确预算 |
| 与 TFLM 对不齐 | 自写算子结果和训练端不一致 | 遵循 TFLM 量化规范，**与参考内核 bit-exact** |
| 硬件碎片化 | M0 无 DSP、M4 有 DSP、M55 有 MVE | 每算子通常有 Pure C / DSP / MVE 三档实现 |
| Flash 紧张 | 整库链接体积大 | 按算子拆分源文件，只编译模型用到的层 |

典型落地：关键词唤醒、人数检测、异常振动分类、低功耗视觉——凡是用 [[tflite-micro]] 或 Ethos-U 生态在 Cortex-M 上跑 int8 模型的场景，CMSIS-NN 几乎都是默认或推荐后端。

## 核心概念

### 1. 算子库，不是完整运行时

CMSIS-NN **不负责**解析 `.tflite`、管理 `tensor_arena`、注册 OpResolver。它只提供一层层的数学内核，例如：

- `arm_convolve_wrapper_s8` — 卷积
- `arm_fully_connected_s8` — 全连接
- `arm_max_pool_s8` / `arm_avgpool_s8` — 池化
- `arm_softmax_s8` — Softmax
- `arm_lstm_unidirectional_s8` — LSTM

上层框架（TFLM、TVM、自研解释器）在调度到对应算子时，调用这些函数完成实际计算。类比：CMSIS-NN 提供「标准化螺丝规格」，整车装配仍由 TFLM 完成。

### 2. 三代命名：`_q7` → `_s8` → `_s4`

历史上 CMSIS-NN 有两代 API：

| 后缀 | 含义 | 现状 |
| --- | --- | --- |
| `_q7` / `_q15` | Arm 早期对称量化，类型别名 `q7_t` | **遗留 API**，不再新开发 |
| `_s8` / `_s16` | 对齐 TensorFlow Lite for Microcontrollers 的 int8/int16 规范 | **主流 API**，TFLM 默认路径 |
| `_s4` | int4 权重 + int8 激活（打包存储） | 新芯片上进一步省 Flash |

新手应只学 `_s8` 系列。v4.0 起已移除不符合 TFLM 量化规范的老算子；`q7_t` 等别名也改为标准 `int8_t`。

### 3. 三档硬件实现（编译期自动选择）

README 中的算子支持表按三列优化档划分：

1. **Pure C** — Cortex-M0/M3 等无 SIMD 内核
2. **DSP Extension** — Cortex-M4/M33 等，用 `ARM_MATH_DSP` 启用
3. **MVE (Helium)** — Cortex-M55/M85 等，用 `ARM_MATH_MVEI` 启用

编译 `armclang -mcpu=cortex-m4` 时，编译器定义 `ARM_MATH_DSP`，`arm_convolve_wrapper_s8` 内部会自动走 DSP 快路径。你不需要在业务代码里写 `#if defined(ARM_MATH_MVEI)`。

### 4. 统一的参数结构体

现代 API 把「层超参」「张量形状」「量化元数据」拆成几个 struct，避免几十个 positional 参数：

| 结构体 | 典型字段 |
| --- | --- |
| `cmsis_nn_dims` | `n, h, w, c` —— NHWC 格式 |
| `cmsis_nn_conv_params` | `stride`, `padding`, `dilation`, `input_offset`, `output_offset`, `activation` |
| `cmsis_nn_per_channel_quant_params` | 每通道 `multiplier[]`, `shift[]` |
| `cmsis_nn_context` | `buf` + `size` —— 部分算子需要的临时工作区 |

卷积的 filter 维度约定为 **`[C_OUT, HK, WK, C_IN]`**，与 TFLM 一致。搞反 channel 顺序是嵌入式 CV 最常见的踩坑之一。

### 5. Context 缓冲：先问大小，再分配

不少卷积、深度可分离卷积在 DSP/MVE 路径上需要额外 scratch buffer。标准流程：

```
buf_size = arm_convolve_wrapper_s8_get_buffer_size(...)
ctx.buf  = tensor_arena 里划出 buf_size 字节
ctx.size = buf_size
arm_convolve_wrapper_s8(&ctx, ...)
```

这与 TFLM 的 `tensor_arena` 哲学一致：**所有内存在推理前预算完毕**，运行中不调用 `malloc`。官方还提到调用方应在安全敏感场景下**清零**该缓冲。

### 6. Wrapper 与 Fast 变体

同一算子常有多个入口：

- `arm_convolve_wrapper_s8` — 根据 kernel 尺寸、stride 等自动分发到最优子内核
- `arm_convolve_1x1_s8_fast` — 针对 1×1 pointwise 的特化快路径
- `arm_depthwise_conv_3x3_s8` — 3×3 深度卷积特化

直接调 `wrapper` 最省心；做极致压测时可换 `fast` 变体，但需自己保证 shape 满足其约束。

### 7. 与 TFLM 的关系

启用 TFLM 的 CMSIS-NN 后端后，解释器在碰到 `Conv2D`、`FullyConnected` 等 op 时，会转而调用 CMSIS-NN 内核，而不是纯 C 参考实现。收益：

- **速度**：同模型在 M4 上常见数倍加速；M55 上 Helium 路径更明显
- **正确性**：输出与 TFLM 参考 bit-exact，方便和 PC 端 golden 对比
- **体积**：只链接用到的 `.c` 文件

若你手写推理循环（不用 TFLM），也可以直接链 CMSIS-NN，自行填充权重指针和量化参数——适合极简场景或教学。

### 8. 构建与工具链要点

官方推荐用 Ethos-U Core Platform 的 CMake toolchain：

```bash
mkdir build && cd build
cmake .. \
  -DCMAKE_TOOLCHAIN_FILE=<path>/arm-none-eabi-gcc.cmake \
  -DTARGET_CPU=cortex-m55
make
```

注意事项（来自 README）：

- 默认 `-Ofast`；`-O0` 调试时在 Helium 芯片上需定义 `ARM_MATH_AUTOVECTORIZE`
- **避免** `-fno-builtin` / `-ffreestanding`，否则 `memcpy`/`memset` 退化严重拖慢性能
- Cortex-M7 上可定义 `OPTIONAL_RESTRICT_KEYWORD=__restrict` 帮助卷积优化
- 测试过的编译器：Arm Compiler 6、Arm GNU Toolchain；IAR 未充分测试
- v4.0 起**不再依赖 CMSIS-Core**，可单独拉取 CMSIS-NN 仓库构建

### 9. Python 绑定（可选）

仓库提供 `cmsis_nn` pybind11 模块，主要用于在 **Host 上查询 buffer 大小**（方便 TVM、CI 或模型分析工具），例如：

```python
import cmsis_nn

backend = cmsis_nn.resolve_backend(cmsis_nn.CortexM.M55)
buf_size = cmsis_nn.convolve_wrapper_buffer_size(
    backend,
    cmsis_nn.DataType.A8W8,
    input_nhwc=[1, 8, 8, 16],
    filter_nhwc=[8, 3, 3, 16],
    output_nhwc=[1, 6, 6, 8],
    padding_hw=[0, 0],
    stride_hw=[1, 1],
    dilation_hw=[1, 1],
)
```

这不用于在 PC 上跑生产推理，而是帮你在烧录前算清「这层卷积要吃多少 scratch」。

## 代码示例一：手写 int8 卷积（最小可运行骨架）

下面示例展示**不经过 TFLM、直接调用** `arm_convolve_wrapper_s8` 的典型写法。数据指针通常来自 Flash 中的量化权重；此处用栈上数组演示流程。

```c
#include "arm_nnfunctions.h"
#include "arm_nnsupportfunctions.h"
#include <string.h>

#define INPUT_H 8
#define INPUT_W 8
#define INPUT_C 16
#define OUTPUT_C 8
#define KERNEL 3
#define OUTPUT_H 6
#define OUTPUT_W 6

void run_conv2d_s8_example(void) {
    int8_t input[INPUT_H * INPUT_W * INPUT_C];
    int8_t weights[OUTPUT_C * KERNEL * KERNEL * INPUT_C];
    int32_t bias[OUTPUT_C];
    int8_t output[OUTPUT_H * OUTPUT_W * OUTPUT_C];

    /* 量化参数：实际项目从 TFLite 模型元数据导出 */
    cmsis_nn_conv_params conv_params = {
        .input_offset  = 0,
        .output_offset = 0,
        .stride        = {1, 1},
        .padding       = {0, 0, 0, 0},
        .dilation      = {1, 1},
        .activation    = {.min = -128, .max = 127},
    };

    int32_t mult[OUTPUT_C] = {1073741824};
    int32_t shift[OUTPUT_C] = {-8};
    cmsis_nn_per_channel_quant_params quant_params = {
        .multiplier = mult,
        .shift      = shift,
    };

    cmsis_nn_dims input_dims  = {1, INPUT_H, INPUT_W, INPUT_C};
    cmsis_nn_dims filter_dims = {OUTPUT_C, KERNEL, KERNEL, INPUT_C};
    cmsis_nn_dims bias_dims   = {1, 1, 1, OUTPUT_C};
    cmsis_nn_dims output_dims = {1, OUTPUT_H, OUTPUT_W, OUTPUT_C};

    int32_t buf_size = arm_convolve_wrapper_s8_get_buffer_size(
        &conv_params, &input_dims, &filter_dims, &output_dims);

    /* 实际固件里 ctx.buf 应来自预分配的 tensor_arena */
    int8_t scratch[512];
    cmsis_nn_context ctx = {.buf = scratch, .size = sizeof(scratch)};

    if (buf_size > (int32_t)sizeof(scratch)) {
        /* 缓冲不足：需扩大 arena 或换更小的模型 */
        return;
    }
    memset(scratch, 0, buf_size);

    arm_cmsis_nn_status status = arm_convolve_wrapper_s8(
        &ctx, &conv_params, &quant_params,
        &input_dims, input,
        &filter_dims, weights,
        &bias_dims, bias,
        &output_dims, output);

    if (status != ARM_CMSIS_NN_SUCCESS) {
        /* ARM_CMSIS_NN_ARG_ERROR：检查 offset 范围、dims 是否合法 */
        return;
    }
}
```

要点回顾：

1. 先 `get_buffer_size`，再分配 `cmsis_nn_context`
2. `per_channel_quant_params` 的 multiplier/shift 数组长度必须等于 `C_OUT`
3. `input_offset` 范围 `[-127, 128]`，`output_offset` 范围 `[-128, 127]`——越界会直接 `ARG_ERROR`

## 代码示例二：int8 全连接层 + ReLU 裁剪

全连接在语音/传感器小模型里极为常见（分类头、嵌入层）。`arm_fully_connected_s8` 接受与卷积类似的量化参数：

```c
#include "arm_nnfunctions.h"

#define FC_IN  32
#define FC_OUT 10

void run_fully_connected_s8_example(void) {
    int8_t  input[FC_IN];
    int8_t  weights[FC_OUT * FC_IN];  /* 行主序：每行对应一个输出神经元 */
    int32_t bias[FC_OUT];
    int8_t  output[FC_OUT];

    cmsis_nn_fc_params fc_params = {
        .input_offset  = 0,
        .filter_offset = 0,
        .output_offset = 0,
        .activation    = {.min = 0, .max = 127},  /* ReLU：负值截断为 0 */
    };

    cmsis_nn_per_tensor_quant_params quant_params = {
        .multiplier = 1073741824,
        .shift      = -8,
    };

    cmsis_nn_dims input_dims  = {1, 1, 1, FC_IN};
    cmsis_nn_dims filter_dims = {FC_OUT, 1, 1, FC_IN};
    cmsis_nn_dims bias_dims   = {1, 1, 1, FC_OUT};
    cmsis_nn_dims output_dims = {1, 1, 1, FC_OUT};

    cmsis_nn_context ctx = {0};  /* 多数 FC 路径不需要 scratch */

    arm_cmsis_nn_status status = arm_fully_connected_s8(
        &ctx, &fc_params, &quant_params,
        &input_dims, input,
        &filter_dims, weights,
        &bias_dims, bias,
        &output_dims, output);

    /* output[i] 已是 int8 量化 logits，可再接 arm_softmax_s8 */
}
```

与卷积的区别：

- 全连接常用 **per-tensor** 量化（单个 multiplier/shift），卷积多为 **per-channel**
- `activation.min = 0` 等价于 fused ReLU，少一次内存往返
- 分类任务末尾通常再接 `arm_softmax_s8` 把 logits 变成伪概率

## 在 TFLM 中启用 CMSIS-NN（集成视角）

业务项目更常见的路径是**不改算子调用**，只在构建 TFLM 时打开优化后端。概念步骤：

```
1. 训练并量化模型 → 得到 int8 .tflite
2. 用 TFLM 代码生成器或 Makefile 链入 CMSIS-NN 源文件
3. 编译选项指定 -mcpu=cortex-m4 / cortex-m55 等
4. MicroInterpreter::Invoke() 内部自动走 CMSIS 快路径
```

与 [[esp-dl]]、[[tflite-micro]] 文档对照阅读效果更好：三者都服务「MCU 上跑神经网络」，但 CMSIS-NN 是 **跨厂商的 Cortex-M 算子层**，不绑定 Espressif 或 Google 的单家运行时。

## 算子覆盖速查（v6+ 主干）

| 类别 | 代表函数 | int8 | int16 | int4 权重 |
| --- | --- | --- | --- | --- |
| Conv2D | `arm_convolve_wrapper_s8` | ✓ | ✓ | ✓ |
| DepthwiseConv | `arm_depthwise_conv_wrapper_s8` | ✓ | ✓ | ✓ |
| FullyConnected | `arm_fully_connected_s8` | ✓ | ✓ | ✓ |
| Pooling | `arm_max_pool_s8`, `arm_avgpool_s8` | ✓ | ✓ | — |
| Elementwise | `arm_elementwise_add_s8`, `arm_elementwise_mul_s8` | ✓ | ✓ | — |
| Softmax | `arm_softmax_s8` | ✓ | ✓ | — |
| LSTM | `arm_lstm_unidirectional_s8` | ✓ | ✓ | — |
| 其他 | Pad, Transpose, Batch Matmul, SVDF | 部分 | 部分 | 部分 |

具体某块芯片是否吃到 MVE 优化，以目标 `-mcpu` + 编译器实测为准；README 里的表格是「上游实现了几套内核」，不是「你的板子一定跑满」。

## 学习路径建议

### 第 0 步：先懂量化，再碰算子

建议先读 TFLM 的 [int8 量化规范](https://www.tensorflow.org/lite/performance/quantization_spec)。不理解 `zero_point`、`scale`、`per-channel multiplier`，看 CMSIS-NN 源码会像在读天书。

### 第 1 步：用 TFLM 示例 + CMSIS 后端跑通

仓库 `Examples/` 下有图像识别等端到端样例（TFLM 作推理引擎、CMSIS-NN 作加速库）。先让 **`micro_speech` 或 `person_detection`** 在你的板子上跑起来，再考虑手写算子调用。

### 第 2 步：读一个 wrapper 源文件

推荐从 `Source/ConvolutionFunctions/arm_convolve_wrapper_s8.c` 入手，观察它如何根据 kernel 尺寸分发到 `arm_convolve_1x1_s8_fast`、`arm_convolve_s8` 等子函数——这是「编译期 + 运行期双重分发」的教科书级代码。

### 第 3 步：用 Python 绑定做 buffer 预算

在 Host 上用 `cmsis_nn.convolve_wrapper_buffer_size` 扫描模型各层，把结果写进 `tensor_arena` 规划表，避免板上第一次 `Invoke()` 才暴雷。

### 第 4 步：读论文加深直觉

Arm 论文 [CMSIS-NN: Efficient Neural Network Kernels for Arm Cortex-M CPUs](https://arxiv.org/abs/1801.06601) 解释了 q7 时代的数据重排与 SIMD 技巧；虽部分 API 已过时，但**「用数据布局换访存」**的思路至今适用。

## 常见坑

| 现象 | 可能原因 | 排查方向 |
| --- | --- | --- |
| `ARM_CMSIS_NN_ARG_ERROR` | offset 越界或 dims 不一致 | 对照 TFLM 导出的量化元数据 |
| 结果与 PC 参考不一致 | 混用 legacy `_q7` 与 `_s8` API | 统一走 TFLM 规范与 `_s8` 路径 |
| 性能不如预期 | `-O0` 调试构建、`-fno-builtin` | 用 `-Ofast` 或 Release 配置重测 |
| M55 仍慢 | 未启用 MVE 编译标志 | 确认 `ARM_MATH_MVEI` 与 `-mcpu=cortex-m55` |
| 链接体积暴涨 | 把整个 Source/ 全编进去 | 只添加模型用到的算子 `.c` 文件 |
| scratch 溢出 | 未调用 `get_buffer_size` | 每层用 API 查询，纳入 arena 规划 |

## 与相邻项目怎么选

| 组件 | 角色 | 何时优先 |
| --- | --- | --- |
| **CMSIS-NN** | Cortex-M 通用 int8/int4 算子 | 任意 Arm MCU + TFLM/TVM/自研 |
| **[[tflite-micro]]** | 完整微控制器推理运行时 | 需要 FlatBuffer 解释器与生态 |
| **Ethos-U NPU** | 硬件加速核 | 芯片带 NPU 驱动时叠加使用 |
| **[[esp-dl]]** | Espressif 专用加速库 | 仅 ESP32 系列且愿绑 Espressif 栈 |

很多量产固件的组合是：**TFLM + CMSIS-NN**；有 Ethos-U 时再由驱动把部分算子 offload 到 NPU。

## 小结

CMSIS-NN 不是「又一个机器学习框架」，而是嵌入在推理运行时下面的 **Cortex-M 专用数学加速层**。它用 int8/int4 量化、三档 SIMD 实现、与 TFLM bit-exact 的对齐，把「在几 KB RAM 的 MCU 上跑神经网络」从论文里的口号变成可维护的工程实践。

零基础学习时，抓住三条主线即可：

1. **它是算子库，不是完整推理引擎** —— 上层仍需要 TFLM 或等价调度器
2. **现代 API 看 `_s8` 后缀和那几个 struct** —— `dims`、`conv_params`、`context`
3. **性能来自「对的 CPU 标志 + 对的缓冲预算」** —— 编译选项和 `get_buffer_size` 与算法本身同样重要

把本文的两个 C 示例读懂，再跑通一个 TFLM 官方例程，你就已经跨过「听说过 CMSIS-NN」和「能在自己板子上量化加速」之间的那道坎了。

## 参考链接

- 源码仓库：[ARM-software/CMSIS-NN](https://github.com/ARM-software/CMSIS-NN)
- 官方文档：[CMSIS-NN Documentation](https://arm-software.github.io/CMSIS-NN/latest/index.html)
- 卷积 API：[Convolution Functions](https://arm-software.github.io/CMSIS-NN/latest/group__NNConv.html)
- 发行说明：[Releases](https://github.com/ARM-software/CMSIS-NN/releases)
- 论文：[arXiv:1801.06601](https://arxiv.org/abs/1801.06601)
- 关联笔记：[[tflite-micro]]、[[esp-dl]]
