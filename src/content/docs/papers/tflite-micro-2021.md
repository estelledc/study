---
title: TensorFlow Lite Micro — 把深度学习塞进微控制器的推理框架（论文笔记）
来源: https://arxiv.org/abs/2010.08678
日期: 2026-06-13
子分类: 嵌入式与 IoT
分类: 操作系统
provenance: pipeline-v3
---

## 先想成什么事

想象你在一家**连锁便利店**总部工作，要把同一套「识别顾客是否说了暗号」的流程，部署到全球几千家**只有一张小桌子、没有仓库管理员**的微型分店：

- 每家店的**电路和货架布局**都不一样（ARM、Xtensa、RISC-V、有无 FPU、有无文件系统）。
- 分店**不能运行时打电话要内存**——没有 `malloc`，没有虚拟内存，SRAM 常常只有几百 KB。
- 但总部希望**只训练一次模型**，用同一套「操作手册」在各家店放映，而不是为每家店手写一份专用机器码。

**TensorFlow Lite Micro（TFLM）** 就是这篇论文（David 等，MLSys 2021；arXiv [2010.08678](https://arxiv.org/abs/2010.08678)）提出的那套「连锁放映系统」：在极度受限的嵌入式设备上跑深度学习**推理**，用**解释器 + FlatBuffer 模型 + 预分配内存竞技场**，在可移植性与性能之间为 TinyML 找到折中。

论文作者来自 Google 与 Harvard，核心论点不是「MCU 上也能跑神经网络」这么简单，而是：**嵌入式生态的碎片化与资源天花板，让传统「编译成专用二进制」和「桌面式 ML 框架」都走不通**——需要专门为 TinyML 重新设计运行时。

## 这篇论文在说什么

| 维度 | 内容 |
|------|------|
| 问题域 | TinyML：在微控制器 / DSP 上做**本地推理**（关键词唤醒、传感器分类、轻量视觉等） |
| 核心对象 | 开源推理框架 TFLM，从 TensorFlow Lite 工具链导出 `.tflite`，在设备上用 `MicroInterpreter` 执行 |
| 主要挑战 | 无动态内存、无统一 ISA、Flash/RAM 极小、训练框架算子远多于可部署子集 |
| 设计选择 | **解释器**而非全图代码生成；**单块 tensor arena**；**按需注册算子**；**Bag of Files** 构建 |
| 评估结论 | 解释器开销相对卷积等大算子可忽略（VWW 上 <0.1%）；CMSIS-NN 等优化内核可带来 4×–7.7× 加速 |

全球有超过 **2500 亿**颗微控制器（论文引用 IC Insights 2020），而典型 MCU 与手机 SoC 在算力、内存、功耗上相差 **100×–1000×**。论文用「关键词检测」作为最广为人知的落地例：Amazon、Apple、Google 等在数十亿设备上跑常开的小网络——但在此之前，每个团队往往为每块芯片写**一次性框架**，移植成本极高。

## 为什么嵌入式 ML 特别难

论文第 2 节把障碍归纳为四类，零基础读者可以记成一张检查表：

### 1. 缺「现代程序员以为理所当然」的功能

很多 MCU **没有**：动态内存分配、虚拟内存、完整操作系统、标准文件系统、浮点硬件。框架若默认依赖这些能力，可移植性立刻崩塌。

### 2. 市场极度碎片化

嵌入式为省电、省成本会**激进定制 ISA**（甚至厂商允许客户加自定义指令）。工具链、IDE 常闭源且按芯片授权。结果是：**没有一个团队能靠一套预编译二进制覆盖主流 MCU**。

### 3. 资源硬顶

论文给出的量级感：

- 「大」嵌入式：Flash 数 MB、SRAM 约 1 MB。
- 「小」嵌入式：总共只有**几百 KB** ROM+RAM 要分着用。

训练时一个 float 模型轻松 MB 级；上板必须量化、剪枝、算子裁剪，且**代码体积**本身也要极简。

### 4. 深度学习本身还在快速变化

TensorFlow 训练侧有 **1400+** 算子，而部署到边缘的 TensorFlow Lite 只支持约 **130** 个。新论文层出不穷，产品方希望「换模型不重写运行时」——这推高了框架**灵活更新**的需求，与「为每颗芯片生成静态代码」形成张力。

## 四条设计原则（论文第 3 节）

### 原则 1：功能范围极小 → 可移植

TFLM **只负责**：给定已在内存中的模型、输入张量、输出张量，完成前向计算。

**故意不做**：从文件系统加载模型、直接读传感器、线程调度。加载模型、采数、点灯都是**应用代码**的事。ML 模型是**纯函数**（无副作用），这让「瘦运行时」成为可能。

### 原则 2：让芯片厂商能贡献优化内核

Arm（CMSIS-NN）、Cadence、Ceva、Synopsys 等可为自家内核提交优化实现。框架保留**参考内核**（可读、可移植），构建时用 `TAGS=cmsis-nn` 等**替换**为平台专用版本，无需重写编译器。

### 原则 3：复用 TensorFlow Lite 导出链

训练仍在 PC/云端完成，经 **TFLite Converter** 得到 FlatBuffer（图 1：Training Graph → Exporter → `.tflite`）。TFLM 直接消费同一序列化格式，避免再造一套模型转换器。

### 原则 4：「一袋文件」（Bag of Files）构建

不假设复杂构建特性（主机端代码生成、随意宏定义等）。理想状态：厂商把源码拖进自家 IDE 就能编过——这对碎片化工具链至关重要。

## 核心概念：从模型到一次 `Invoke()`

论文第 4 节实现可概括为 **五步流水线**：

```
1. GetModel()        → 解析 Flash 里的 FlatBuffer
2. OpResolver        → 只链接本模型用到的算子
3. tensor_arena      → 应用提供一块连续 uint8 缓冲区
4. AllocateTensors() → 初始化阶段完成所有内存规划（之后不再分配）
5. Invoke()          → 按拓扑序执行算子，写输入 / 读输出
```

### FlatBuffer 模型

- 序列化格式来自 TensorFlow Lite；访问器代码 **<2 KB**。
- **零拷贝**：不需要先解压成另一套结构。
- 多数 MCU **没有文件系统**：`.tflite` 用 `xxd` 等转成 `unsigned char g_model[]` 链进固件。

### 解释器 vs 代码生成

| 方式 | 优点 | 缺点 |
|------|------|------|
| **解释器（TFLM 选择）** | 换模型常只需换 Flash 里的数组；多模型共享同一份运行时代码 | 每层有少量调度开销 |
| **代码生成** | 理论上更快 | 换模型要重编整个固件；架构/权重 baked 进二进制 |

论文的关键洞察：ML 推理时间主要在**大内核**（卷积、全连接）里，解释器分支开销可被摊薄——第 5 节数据支持这一点。

### Tensor Arena 与双栈分配

应用传入固定大小的 `tensor_arena`。初始化时：

- **Tail 栈**（从高地址向下）：解释器生命周期内的持久区（元数据等）。
- **Head 栈**（从低地址向上）：单次 `Invoke` 可用的临时区。
- 中间空隙可在**内存规划**阶段做临时分配。

**Memory Planner** 对中间张量做**生命周期复用**（类似 bin packing）：若张量 A 的输出只被算子 3 用到，而算子 5 才需要张量 B，两者可重叠同一块 RAM。论文图 4 对比了朴素分配与打包后的占用。

推理阶段**禁止再分配**，避免长跑固件因堆碎片崩溃。

### MicroMutableOpResolver

全量算子表会撑大 Flash。开发者声明「本模型最多 N 种 op」，只 `AddConv2D()`、`AddFullyConnected()` 等——**链接器只拉进需要的内核**。

### 多租户（Multitenancy）

若多个模型**不同时运行**，可共享一块 arena：非持久区取各模型需求的**最大值**，持久区按模型叠在 Tail。适合「一个固件里多套专用小模型」的产品形态。

## 代码示例一：主机端训练并导出 TFLite

论文强调训练与部署分离。下面是与官方 Hello World / 论文工作流一致的**最小 Python 路径**（在 PC 上完成）：

```python
import numpy as np
import tensorflow as tf

# 1. 用 sin 曲线训练一个极小全连接网络（类比关键词/传感器回归任务）
x = np.linspace(0, 2 * np.pi, 1000, dtype=np.float32).reshape(-1, 1)
y = np.sin(x).astype(np.float32)

model = tf.keras.Sequential([
    tf.keras.layers.Input(shape=(1,)),
    tf.keras.layers.Dense(8, activation="relu"),
    tf.keras.layers.Dense(1),
])
model.compile(optimizer="adam", loss="mse")
model.fit(x, y, epochs=200, verbose=0)

# 2. 导出 SavedModel → FlatBuffer（.tflite）
tf.saved_model.save(model, "/tmp/sin_saved")
converter = tf.lite.TFLiteConverter.from_saved_model("/tmp/sin_saved")

# 3. 可选：MCU 上更常用 int8 全量化（论文 3.3 节讨论量化导出复杂度）
converter.optimizations = [tf.lite.Optimize.DEFAULT]
converter.representative_dataset = lambda: [x[:100]]
converter.target_spec.supported_ops = [tf.lite.OpsSet.TFLITE_BUILTINS_INT8]
converter.inference_input_type = tf.int8
converter.inference_output_type = tf.int8
tflite_int8 = converter.convert()

open("/tmp/hello_world_float.tflite", "wb").write(
    tf.lite.TFLiteConverter.from_saved_model("/tmp/sin_saved").convert()
)
open("/tmp/hello_world_int8.tflite", "wb").write(tflite_int8)
```

随后用 `xxd -i hello_world_int8.tflite > model.cc` 把模型嵌进固件——对应论文 4.3.1「无文件系统时把 FlatBuffer 编成 C 数组」。

## 代码示例二：MCU 上的 MicroInterpreter 推理闭环

下列 C++ 浓缩了论文 4.1 节「四步初始化 + Invoke」的设备端形态（与 [tensorflow/tflite-micro](https://github.com/tensorflow/tflite-micro) Hello World 一致）：

```cpp
#include "tensorflow/lite/micro/micro_interpreter.h"
#include "tensorflow/lite/micro/micro_mutable_op_resolver.h"
#include "tensorflow/lite/micro/micro_error_reporter.h"
#include "tensorflow/lite/schema/schema_generated.h"
#include "tensorflow/lite/version.h"
#include "model.h"  // g_model[] 由 xxd 从 .tflite 生成

void RunInference() {
  tflite::MicroErrorReporter error_reporter;

  const tflite::Model* model = tflite::GetModel(g_model);
  if (model->version() != TFLITE_SCHEMA_VERSION) return;

  // 只注册本图需要的算子 —— 对应论文「最小化链接体积」
  static tflite::MicroMutableOpResolver<1> resolver;
  resolver.AddFullyConnected();

  // 应用提供的 arena；大小需 ≥ Memory Planner 规划结果
  constexpr int kTensorArenaSize = 2048;
  alignas(16) uint8_t tensor_arena[kTensorArenaSize];

  tflite::MicroInterpreter interpreter(
      model, resolver, tensor_arena, kTensorArenaSize, &error_reporter);

  // 初始化阶段一次性分配；之后 Invoke 不再 malloc
  if (interpreter.AllocateTensors() != kTfLiteOk) return;

  TfLiteTensor* input = interpreter.input(0);
  TfLiteTensor* output = interpreter.output(0);

  input->data.f[0] = 1.0f;
  if (interpreter.Invoke() != kTfLiteOk) return;

  float sin_1 = output->data.f[0];  // 应接近 sin(1) ≈ 0.841
}
```

**int8 模型**时改为读取 `output->data.int8[i]`，并用 `output->params.scale` 与 `zero_point` 反量化到浮点便于调试。

## 论文评估：开销真的小吗？

第 5 节在两类极端平台上测了 **Visual Wake Words（VWW）** 人形检测与 **Google Hotword** 模型（INT8 FlatBuffer）：

| 平台 | 模型 | 参考内核周期 | 优化内核周期 | 解释器开销 |
|------|------|-------------|-------------|-----------|
| SparkFun Edge (Cortex-M4 @96MHz) | VWW | ~19.0M | ~4.9M（CMSIS-NN **>4×**） | **<0.1%** |
| 同上 | Hotword | 45.1K | 36.4K | ~3–4% |
| Xtensa HiFi Mini DSP @10MHz | VWW | ~387M | ~50M（**~7.7×**） | **<0.1%** |

内存方面（表 3 量级）：

- 解释器本体 **<2 KB**。
- 小模型（Hotword、简单卷积参考网）框架总占用约 **≤13 KB**。
- 较大的 VWW 约 **26.5 KB**（仍远小于手机端 TFLite 假设）。

这些数字说明论文主张成立：**在 TinyML 里，选对算子内核比争论解释器 vs 编译器更重要**；解释器换来的是跨芯片、可 OTA 换模型的灵活性。

## 与手机端 TensorFlow Lite 的关系

| 特性 | TensorFlow Lite（手机/边缘 Linux） | TensorFlow Lite Micro |
|------|-----------------------------------|------------------------|
| 动态形状 | 支持 | 固定形状，规划在初始化完成 |
| 内存 | 可用系统堆 | 仅 arena，无 `malloc` |
| 模型加载 | 文件、内存映射 | 通常 C 数组嵌 Flash |
| 算子集 | ~130 | 进一步裁剪 + 手动 Resolver |
| 线程 | 较完整 | 框架不包线程；可多 interpreter 实例 |

若设备跑 Linux（树莓派等），一般用标准 LiteRT/TFLite 更合适；**Cortex-M、ESP32、裸机 DSP** 才是 TFLM 主场。本仓库项目笔记见 [[projects/tflite-micro]]，Arm 内核加速见 [[projects/cmsis-nn]]。

## 论文仍留下的开放问题

论文坦诚若干局限，适合作为延伸阅读方向：

- 构建系统早期依赖 Makefile + 杂糅 Python 生成工程文件，维护成本高。
- FlatBuffer C++ 访问器要求 **C++11**，曾迫使部分厂商升级工具链。
- 算子语义缺乏统一规范，导出失败时错误信息对「只负责部署的工程师」不友好。
- TinyML 基准仍年轻；论文采用 TinyMLPerf / MCUNet 相关模型。

## 零基础学习路线建议

1. **概念**：记住「训练在 PC、推理在 MCU、中间是 `.tflite` + arena」。
2. **动手**：跑通 Hello World（sin 回归）→ 把 `tensor_arena` 改小观察 `AllocateTensors` 失败 → 换 int8 模型。
3. **读论文图**：图 2（模块关系）、图 3（双栈 arena）、图 4（内存复用）各花 10 分钟。
4. **进阶**：在同一 arena 上挂两个模型（multitenancy）；打开 `TAGS=cmsis-nn` 对比周期数。

## 小结

TensorFlow Lite Micro 论文的核心贡献，是把 TinyML 的工程问题讲清楚并给出一套**可复现的实现哲学**：在缺少 OS 与动态内存的世界里，用**解释器 + FlatBuffer + 静态内存规划 + 可替换内核**，把深度学习的适用范围推到数十亿计的最小芯片上。它不是缩小版的 TensorFlow，而是**为「没有 malloc 的便利店分店」重写的放映机**——理解这一点，就抓住了这篇 MLSys 论文与整个 TinyML 运动的主线。

## 参考

- 论文：[TensorFlow Lite Micro: Embedded Machine Learning on TinyML Systems](https://arxiv.org/abs/2010.08678)（v3, 2021-03-13）
- 会议：MLSys 2021
- 源码演进：[tensorflow/tflite-micro](https://github.com/tensorflow/tflite-micro)（社区亦称 LiteRT for Microcontrollers）
- 相关笔记：[[projects/tflite-micro]]、[[projects/cmsis-nn]]、[[papers/zephyr-rtos-overview]]
