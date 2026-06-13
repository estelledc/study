---
title: TensorFlow Lite Micro — 把神经网络塞进几 KB RAM 的「袖珍推理引擎」
来源: 'https://github.com/tensorflow/tflite-micro'
日期: '2026-06-13'
子分类: 嵌入式
分类: 操作系统
难度: '中级'
provenance: 'pipeline-v3'
---

## 是什么

**TensorFlow Lite Micro**（简称 **TFLM**，社区与文档中也逐渐改称 **LiteRT for Microcontrollers**）是 Google 为**微控制器、DSP 和极度受限嵌入式设备**维护的机器学习推理运行时。源码托管在 [tensorflow/tflite-micro](https://github.com/tensorflow/tflite-micro)，从 TensorFlow 主仓独立出来，专门服务「没有操作系统、没有 `malloc`、Flash 只有几百 KB」的场景。

日常类比：**手机 App vs 手表上的表盘程序**。

你在手机上跑 [[tensorflow]] 训练的完整模型，就像装一个功能齐全的 App——后台服务、动态内存、网络随时拉数据都行。但一块 STM32 或 ESP32 芯片更像智能手表表盘：屏幕小、电池小、程序必须在出厂时就占好固定内存，运行时不能突然向系统要一大块堆内存。TFLM 就是给这类设备准备的「表盘级推理引擎」：只负责**按固定剧本执行已经训练好的模型**，不负责训练、不负责联网更新权重，把体积和 RAM 压到能塞进手表芯片里。

和桌面/手机上的 TensorFlow Lite（LiteRT）相比，TFLM 砍掉了更多东西：无动态内存分配、无完整 C++ 标准库依赖、算子集合是子集、API 是底层 C++。若你的设备跑 Linux（如树莓派），通常用标准 LiteRT 更省事；若目标是 Cortex-M、ESP32、RISC-V MCU，TFLM 才是正选。

## 解决什么问题

| 痛点 | 云端 / 手机推理 | TFLM 的回应 |
| --- | --- | --- |
| RAM 极小 | 运行时 + 张量常需 MB 级 | 核心运行时约 **16 KB**（Arm Cortex-M3 上测过），张量区预分配 |
| 无操作系统 | 依赖 POSIX、`malloc`、线程 | **无 OS 即可运行**，不强制标准库 |
| 功耗与延迟 | 推理需联网或唤醒大核 | **本地推理**，数据不出设备，适合隐私与实时控制 |
| 模型体积 | 浮点模型动辄 MB | 支持 **int8 全量化**，模型可嵌进 Flash 只读区 |
| 硬件碎片化 | 一套二进制难覆盖所有 MCU | 可移植内核 + **CMSIS-NN / Ethos-U / ESP-NN** 等加速后端 |

典型落地场景：关键词唤醒（`micro_speech`）、简单视觉（`person_detection`）、传感器异常检测、家电自适应、工业边缘「这是不是故障」分类——都是**毫秒级、常开、不能依赖 Wi-Fi** 的任务。

## 核心概念

### 1. 推理-only：训练在 PC，设备只「放映胶片」

TFLM **不支持设备端训练**。工作流永远是：

```
Python 训练 → 导出 TFLite FlatBuffer → 转成 C 数组或烧进 Flash → C++ 解释器 Invoke()
```

设备上的程序不理解「反向传播」，只理解一张静态计算图。类比：电影院只放拷贝好的胶片，不会在放映厅里现拍电影。

### 2. FlatBuffer 模型 + `GetModel()`

模型文件是 **TensorFlow Lite FlatBuffer** 格式（`.tflite`）。嵌入式部署时，常用 `xxd` 或构建脚本把二进制转成 `unsigned char g_model[]`，链接进固件。运行时通过 `tflite::GetModel(g_model)` 解析，并检查 `TFLITE_SCHEMA_VERSION` 是否与当前库兼容。

### 3. `MicroInterpreter`：解释器三件套

推理的核心对象是 `tflite::MicroInterpreter`，创建时需要四样东西：

| 组件 | 作用 |
| --- | --- |
| `Model*` | 编译进固件的 FlatBuffer |
| `MicroMutableOpResolver` | 注册本模型用到的算子（如 `FullyConnected`、`Conv2D`） |
| `tensor_arena` | **预分配**的一块 `uint8_t` 内存，供所有中间张量复用 |
| `ErrorReporter` | 日志输出（可对接 UART、`printf` 等） |

**没有 `malloc`**：`AllocateTensors()` 只在 `tensor_arena` 里划分子缓冲区。arena 不够大会分配失败，需靠实验或工具测大小。

### 4. `MicroMutableOpResolver`：按需注册算子

全量算子表会撑大 Flash。TFLM 要求你声明模型实际用到的 op 数量，例如 Hello World 只需 1 个 `FullyConnected`：

```cpp
using HelloWorldOpResolver = tflite::MicroMutableOpResolver<1>;
TF_LITE_ENSURE_STATUS(op_resolver.AddFullyConnected());
```

只链接需要的内核，是体积优化的关键之一。

### 5. 张量读写：`input(0)` / `output(0)` / `Invoke()`

- `interpreter.input(0)` 返回 `TfLiteTensor*`，按 `type` 访问 `data.f`（float）或 `data.int8` 等
- `interpreter.Invoke()` 执行一整轮前向推理
- `interpreter.output(0)` 读结果

输入输出 shape 在转换模型时已固定；嵌入式代码里常写断言检查 `dims` 和 `kTfLiteFloat32` / `kTfLiteInt8`。

### 6. 量化：float 训练，int8 上板

MCU 上 float 推理慢且耗能。官方 Hello World 提供 **PTQ（训练后量化）** 路径：浮点 SavedModel → `ptq.py` → `hello_world_int8.tflite`。量化后权重与部分激活用 int8，算子走 CMSIS-NN / ESP-NN 等整数内核，速度可差 **数十倍**（ESP32 上 person_detection 有公开对比：无优化 ~4s vs ESP-NN ~380ms 量级）。

### 7. 平台与加速栈

| 层级 | 说明 |
| --- | --- |
| 参考内核 | `tensorflow/lite/micro/kernels/` 纯 C/C++，跨平台兼容 |
| CMSIS-NN | Arm Cortex-M 优化，与 Keil / CMSIS-Pack 生态集成 |
| Ethos-U | Arm 微 NPU（U55/U65）硬件加速 |
| ESP-NN | Espressif 芯片专用，ESP-IDF 组件 `esp-tflite-micro` 默认集成 |
| 社区移植 | Arduino、SparkFun Edge、TI、Silicon Labs、Renesas 等见官方 README |

构建常用 `tensorflow/lite/micro/tools/make/Makefile`，`TARGET=cortex_m_generic` 等参数交叉编译；也可用 Bazel、Mbed、Arduino 库。

## 端到端工作流（Hello World）

官方 **Hello World** 用神经网络拟合 `sin(x)`：输入一个标量，输出 sin 值；上板后可驱动 LED 闪烁或动画。完整链路：

1. **训练**（Python / Bazel）：`train.py` 生成 TF 与 float TFLite
2. **（可选）量化**：`ptq.py` 生成 int8 模型
3. **嵌入固件**：模型 → `model.cc` 字节数组
4. **C++ 测试**：`hello_world_test.cc` 加载模型、循环 Invoke、断言输出接近 `sin(x)`

支持设备包括 Arduino Nano 33 BLE、ESP32-DevKitC、STM32F746、SparkFun Edge 等（详见 Google AI Edge 文档）。

## 代码示例一：Python 训练与导出

在主机上用 Bazel 构建并训练 Hello World 模型（来自官方 README）：

```bash
# 构建训练脚本
bazel build tensorflow/lite/micro/examples/hello_world:train

# 训练并保存 TF + float TFLite 到指定目录
bazel-bin/tensorflow/lite/micro/examples/hello_world/train \
  --save_tf_model \
  --save_dir=/tmp/model_created/
```

若需要 **int8 全量化模型**（更适合 MCU）：

```bash
bazel build tensorflow/lite/micro/examples/hello_world/quantization:ptq

bazel-bin/tensorflow/lite/micro/examples/hello_world/quantization/ptq \
  --source_model_dir=/tmp/model_created \
  --target_dir=/tmp/quant_model/
```

输出 `hello_world_int8.tflite` 后，用项目自带脚本或 `xxd -i` 转成 C 数组，替换示例里的 `g_model`。

等价的 Keras 思路（理解用，非仓库内脚本）：

```python
import numpy as np
import tensorflow as tf

# 用 sin 数据训练一个极小全连接网络
x = np.linspace(0, 2 * np.pi, 1000).astype(np.float32)
y = np.sin(x).astype(np.float32)

model = tf.keras.Sequential([
    tf.keras.layers.Input(shape=(1,)),
    tf.keras.layers.Dense(8, activation="relu"),
    tf.keras.layers.Dense(1),
])
model.compile(optimizer="adam", loss="mse")
model.fit(x, y, epochs=200, verbose=0)

# 导出 SavedModel，再用 TFLite Converter 得到 .tflite
tf.saved_model.save(model, "/tmp/sin_saved")
converter = tf.lite.TFLiteConverter.from_saved_model("/tmp/sin_saved")
tflite_model = converter.convert()
open("/tmp/hello_world.tflite", "wb").write(tflite_model)
```

## 代码示例二：C++ 设备端推理

下列代码浓缩自官方 `evaluate_test.cc` / Hello World 测试，展示**最小推理闭环**：

```cpp
#include "tensorflow/lite/micro/micro_error_reporter.h"
#include "tensorflow/lite/micro/micro_interpreter.h"
#include "tensorflow/lite/micro/micro_mutable_op_resolver.h"
#include "tensorflow/lite/schema/schema_generated.h"
#include "tensorflow/lite/version.h"
#include "tensorflow/lite/micro/examples/hello_world/model.h"

void RunHelloWorldInference() {
  tflite::MicroErrorReporter micro_error_reporter;
  tflite::ErrorReporter* error_reporter = &micro_error_reporter;

  // 1. 加载嵌在 Flash 里的模型
  const tflite::Model* model = tflite::GetModel(g_model);
  if (model->version() != TFLITE_SCHEMA_VERSION) {
    TF_LITE_REPORT_ERROR(error_reporter, "Schema version mismatch\n");
    return;
  }

  // 2. 只注册模型用到的算子
  static tflite::MicroMutableOpResolver<1> resolver;
  if (resolver.AddFullyConnected() != kTfLiteOk) {
    return;
  }

  // 3. 预分配 tensor arena（大小需按模型调试）
  constexpr int kTensorArenaSize = 2 * 1024;
  uint8_t tensor_arena[kTensorArenaSize];

  // 4. 创建解释器并分配张量
  tflite::MicroInterpreter interpreter(
      model, resolver, tensor_arena, kTensorArenaSize, error_reporter);
  if (interpreter.AllocateTensors() != kTfLiteOk) {
    TF_LITE_REPORT_ERROR(error_reporter, "AllocateTensors failed\n");
    return;
  }

  // 5. 写入输入 → Invoke → 读输出
  TfLiteTensor* input = interpreter.input(0);
  TfLiteTensor* output = interpreter.output(0);

  input->data.f[0] = 0.0f;
  if (interpreter.Invoke() != kTfLiteOk) {
    TF_LITE_REPORT_ERROR(error_reporter, "Invoke failed\n");
    return;
  }
  float y0 = output->data.f[0];  // 期望接近 sin(0) = 0

  input->data.f[0] = 1.0f;
  interpreter.Invoke();
  float y1 = output->data.f[0];  // 期望接近 sin(1) ≈ 0.841

  TF_LITE_REPORT_ERROR(error_reporter, "sin(0)=%f sin(1)=%f\n", y0, y1);
}
```

要点回顾：`tensor_arena` 太小会 silent fail 或 `AllocateTensors` 失败；`Invoke()` 前后 input/output 指针有效；量化模型需改访问 `output->data.int8` 并配合 scale/zero_point。

## 代码示例三：Makefile 交叉编译（补充）

在克隆的 `tflite-micro` 仓库根目录，可用 Make 跑主机单元测试或指定 MCU：

```bash
# 主机上跑 Hello World 单元测试
make -f tensorflow/lite/micro/tools/make/Makefile test_hello_world_test

# 交叉编译示例：通用 Cortex-M0 Hello World
make -f tensorflow/lite/micro/tools/make/Makefile \
  TARGET=cortex_m_generic \
  TARGET_ARCH=cortex-m0 \
  TARGET_CFLAGS=-mcpu=cortex-m0 \
  build
```

ESP32 用户更常走 **ESP-IDF**：

```bash
idf.py add-dependency "esp-tflite-micro"
idf.py set-target esp32s3
idf.py build
```

组件内带 `hello_world`、`micro_speech`、`person_detection` 示例，并默认链入 **ESP-NN** 优化。

## 与 TensorFlow / LiteRT 生态的关系

```
TensorFlow (训练, Keras)  →  TFLite Converter  →  .tflite (FlatBuffer)
                                                      ↓
                    ┌─────────────────────────────────┴────────────────────────┐
                    │  LiteRT (手机/嵌入式 Linux)   │  TFLM (MCU, 无 OS)      │
                    │  动态内存、更多算子、Java API   │  静态 arena、C++17、子集  │
                    └──────────────────────────────────────────────────────────┘
```

Google 近年将面向边缘的产品线统一为 **LiteRT** 品牌，文档 URL 已迁至 `developers.google.com/edge/litert/microcontrollers/`；GitHub 仓库名仍为 `tflite-micro`，社区习惯仍称 TFLM。与 [[tensorflow]] 笔记中的「一次训练、多平台部署」叙事一致：TFLM 是这条链路的**最末端、最瘦**的一环。

## 限制与选型清单

官方明确列出的约束（选型前必读）：

- **仅推理**，无设备端训练
- **算子子集**：转换前需查 [Micro 算子支持列表](https://www.tensorflow.org/lite/microcontrollers/op_resolver)，自定义层可能要改模型结构
- **手动内存管理**：arena 大小、resolver 模板参数都要自己调
- **C++17 + 32 位平台**为主，已在 Cortex-M、ESP32、RISC-V 等验证
- 需要 **Ethos-U / CMSIS-NN** 时，构建 flag 与链接库要按平台文档打开

若设备有 **>1MB RAM、跑 Linux**：优先考虑标准 LiteRT + Python/C API，开发体验好很多。

## 学习路径建议

1. **读 Hello World**：`tensorflow/lite/micro/examples/hello_world/`，先跑主机 `bazel test`，再选一块手头开发板上板
2. **跟官方 Get Started**： [LiteRT for Microcontrollers - Get started](https://developers.google.com/edge/litert/microcontrollers/get_started)
3. **换一个真实示例**：语音 `micro_speech` 或视觉 `person_detection`，理解 int8 输入与更大 arena
4. **读 C++ 库结构**：`micro_interpreter.h`、`micro/docs/` 下的 new platform、memory management
5. **量化专题**：Hello World 的 `quantization/ptq.py`，对照 int8 与 float 延迟差异

## 小结

TensorFlow Lite Micro 不是「缩小版的 TensorFlow」，而是**为 MCU 约束重新设计的推理运行时**：静态内存、可裁剪算子表、FlatBuffer 模型嵌进 Flash、配合 CMSIS-NN / ESP-NN 在硅片上榨性能。零基础入门抓住一条线即可——**PC 上训练 sin 模型 → 转成 `.tflite` → C 数组进固件 → `MicroInterpreter` 三轮 `Invoke()`**——其余平台移植、量化、NPU 加速都是在这条主线上的加厚垫层。
