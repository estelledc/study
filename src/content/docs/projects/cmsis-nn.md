---
title: CMSIS-NN — Arm Cortex-M 的神经网络算子加速库
来源: 'https://github.com/ARM-software/CMSIS-NN'
日期: 2026-07-07
分类: embedded
难度: 初级
---

## 是什么

CMSIS-NN 是 Arm 给 Cortex-M 微控制器准备的一组**神经网络基础算子**：卷积、全连接、池化、softmax、LSTM 这些层，在小芯片上用更少内存、更少周期跑起来。

日常类比：TensorFlow Lite Micro 像一间露营厨房，CMSIS-NN 像专门给小炉子打磨过的刀、锅和铲子；菜谱还是模型，但真正切菜炒菜的工具换成了更省力的版本。

最小使用姿势常常不是手写整套推理，而是在构建时告诉 TFLM：这次请用 CMSIS-NN 后端。

```bash
make -f tensorflow/lite/micro/tools/make/Makefile \
  OPTIMIZED_KERNEL_DIR=cmsis_nn \
  TARGET=cortex_m_corstone_300 TARGET_ARCH=cortex-m55 \
  kernel_conv_test
```

这行命令的意思是：同样的卷积测试，目标是 Cortex-M55；TFLM 遇到可替换的算子时，优先接 CMSIS-NN 的实现。

## 为什么重要

不用 CMSIS-NN，下面这些事会很难解释：

- 为什么同一个 `int8` 模型在电脑上很轻松，放到 Cortex-M 上却会被 RAM、flash 和周期数卡住。
- 为什么 TFLM README 经常强调 `OPTIMIZED_KERNEL_DIR=cmsis_nn`，这不是装饰参数，而是在换底层算子。
- 为什么 Cortex-M4、Cortex-M55、Cortex-M85 的模型速度差异巨大；它们能用的 DSP / Helium 指令不同。
- 为什么量化规范要和 TFLM 对齐；如果输出不是 bit-exact，端侧调试会变成猜测游戏。

## 核心要点

1. **算子库，不是训练框架**：CMSIS-NN 不负责训练模型，也不负责读取 `.tflite` 文件。类比：它不是厨师学校，而是一套已经磨好的厨房工具，等上层 runtime 来调用。

2. **按硬件特性自动分路**：同一个算子通常有 Pure C、DSP、MVE 几类实现。类比：普通自行车道、快车道、高速路都通向同一目的地，编译器根据目标 CPU 选择路线。

3. **量化协议必须对齐**：官方目标是跟 TensorFlow Lite Micro 的 `int8` / `int16` 参考 kernel 对齐。类比：两把尺子刻度必须一样，不然你在电脑上量出的 10 厘米，到板子上会变成 9.8 厘米。

## 实践案例

### 案例 1：把 CMSIS-NN 编成 Cortex-M55 静态库

README 给的基础路线是用 CMake + Arm toolchain file 指定目标 CPU。

```bash
cd /path/to/CMSIS-NN
mkdir build && cd build
cmake .. \
  -DCMAKE_TOOLCHAIN_FILE=/path/to/ethos-u-core-platform/cmake/toolchain/arm-none-eabi-gcc.cmake \
  -DTARGET_CPU=cortex-m55
make
```

**逐部分解释**：

- `TARGET_CPU=cortex-m55`：告诉构建系统目标芯片是谁，后面能不能走 Helium 路径就靠它。
- `CMAKE_TOOLCHAIN_FILE=...arm-none-eabi-gcc.cmake`：告诉 CMake 这不是给 Mac / Linux 主机编译，而是给裸机 Arm 目标编译。
- `make`：生成库文件，后续可以被固件工程或 TFLM 静态链接进去。
- 这个案例适合想把 CMSIS-NN 当独立依赖接进现有嵌入式工程的人。

### 案例 2：在 TFLM 里启用 CMSIS-NN 优化 kernel

TFLM 的 `cmsis_nn` 文档给了直接替换参考 kernel 的命令。

```bash
make -f tensorflow/lite/micro/tools/make/Makefile \
  OPTIMIZED_KERNEL_DIR=cmsis_nn \
  TARGET=cortex_m_corstone_300 \
  TARGET_ARCH=cortex-m55 \
  kernel_conv_test
```

**逐部分解释**：

- `OPTIMIZED_KERNEL_DIR=cmsis_nn`：关键开关，让 TFLM 去使用 CMSIS-NN 目录下的优化 kernel。
- `TARGET=cortex_m_corstone_300`：用 Corstone-300 这类固定虚拟平台作为测试目标，适合没有真实板子时先跑通。
- `TARGET_ARCH=cortex-m55`：指定目标架构，给编译器机会打开 MVE / Helium 相关路径。
- `kernel_conv_test`：先从卷积单元测试切入，比一上来跑完整语音模型更容易定位问题。

### 案例 3：用 Python 绑定预估卷积 scratch buffer

CMSIS-NN 还提供可选 Python 绑定，重点暴露 host 侧 buffer size getter，方便离线规划内存。

```bash
cmake -S . -B build -DCMSISNN_BUILD_PYBIND=ON
cmake --build build
pip wheel . -w dist
pip install dist/cmsis_nn-*.whl
```

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

**逐部分解释**：

- `resolve_backend(CortexM.M55)`：按目标 CPU 推出应该估算哪类后端的 buffer。
- `DataType.A8W8`：表示激活和权重都是 8bit 量化数据，是 TFLM 常见部署形态。
- `input_nhwc` / `filter_nhwc` / `output_nhwc`：用 NHWC 形状描述张量，提前知道这一层要多少临时内存。
- 这个案例适合做部署前内存预算：先在电脑上算清楚，再去板子上烧录验证。

## 踩过的坑

1. **把 CMSIS-NN 当完整推理引擎**：它只提供算子，模型解析、算子调度和 tensor arena 仍然要靠 TFLM 或你的上层工程。

2. **目标 CPU 写错**：Cortex-M3、M4、M55 能用的优化路径不同，`TARGET_CPU` 或 `TARGET_ARCH` 写错会让性能数字完全失真。

3. **随手开 `-fno-builtin` / `-ffreestanding`**：README 明确提醒这会影响 `memcpy` / `memset` 等优化，热路径可能明显变慢。

4. **float API 误当默认选择**：float16 / float32 是实验 API，主要面向带 Helium 的场景；普通 TinyML 部署仍优先看 `int8`。

## 适用 vs 不适用场景

**适用**：

- Cortex-M4 / M7 / M33 / M55 / M85 这类 Arm M-profile 芯片上的本地神经网络推理。
- 已经使用 TFLM，想把 Conv2D、DepthwiseConv2D、Fully Connected、Pooling 等常见层换成优化实现。
- 模型能接受 `int8` / `int16` 量化，并且希望输出和 TFLM reference kernel 对齐。
- 需要在上线前做周期数、scratch buffer、代码大小这些嵌入式预算。

**不适用**：

- 需要训练模型、自动量化、模型转换；这些属于 TensorFlow / PyTorch / converter 工具链。
- 目标是 Arm A-class、x86、服务器 GPU；README 也建议 A-class 选 Arm Compute Library 或 XNNPACK。
- 模型大量依赖 CMSIS-NN 未覆盖的自定义算子，且团队不准备补实现。
- 只想在电脑上跑推理 benchmark；CMSIS-NN 的价值主要在 Cortex-M 资源边界里体现。

## 历史小故事（可跳过）

- **2010 年代后期**：TinyML 开始从实验走向产品，关键词从“能不能跑模型”变成“能不能在几百 KB 内存里稳定跑”。
- **Arm CMSIS 生态里**：CMSIS-DSP 先解决信号处理常见计算，CMSIS-NN 则把这种思路扩展到神经网络 kernel。
- **TFLM 生态形成后**：CMSIS-NN 逐渐成为 Arm Cortex-M 上最常见的优化后端之一，官方文档也明确强调 bit-exact 对齐。
- **Helium 出现后**：Cortex-M55 / M85 能用 MVE 向量指令，CMSIS-NN 的分层实现更有价值。
- **社区状态**：仓库是数百到 1k star 量级的专业基础库，受众不大但位置关键。

## 学到什么

- CMSIS-NN 的核心不是“多一个库”，而是把神经网络最费时的基础层换成贴合 Cortex-M 指令和内存的实现。
- TinyML 性能通常来自一串朴素工程选择：量化、静态内存、目标 CPU、编译选项、scratch buffer，而不是单个魔法开关。
- TFLM 和 CMSIS-NN 的关系像“调度员”和“专用工人”：TFLM 决定执行顺序，CMSIS-NN 负责把具体算子干快。
- 读嵌入式 AI 项目时，先看目标芯片和算子覆盖表，比先看模型名字更可靠。

## 延伸阅读

- 官方仓库：[ARM-software/CMSIS-NN](https://github.com/ARM-software/CMSIS-NN)
- 在线文档：[CMSIS-NN Software Library](https://arm-software.github.io/CMSIS-NN/latest/index.html)
- TFLM 集成说明：[tensorflow/lite/micro/kernels/cmsis_nn](https://github.com/tensorflow/tflite-micro/blob/main/tensorflow/lite/micro/kernels/cmsis_nn/README.md)
- 示例入口：[CMSIS-NN Examples](https://github.com/ARM-software/CMSIS-NN/tree/main/Examples)
- [[tflite-micro]] —— 上层微控制器推理 runtime，常把 CMSIS-NN 当优化后端。
- [[esp-dl]] —— 另一条微控制器 AI 部署路线，对比能看出芯片厂生态差异。

## 关联

- [[tflite-micro]] —— CMSIS-NN 常被 TFLM 调用，负责替换参考 kernel 的热路径。
- [[tensorflow]] —— 训练和量化模型常从 TensorFlow 生态进入，再交给 TFLM / CMSIS-NN 部署。
- [[pytorch]] —— 训练端常见来源；对比后能理解训练框架和端侧 kernel 库不是同一层。
- [[esp-dl]] —— 同属嵌入式 AI 推理库，但目标芯片和模型格式生态不同。
- [[zephyr]] —— 真实产品里可能用 Zephyr 管 RTOS、驱动和构建，再接 TFLM / CMSIS-NN 做推理。
- [[arduino-cli]] —— 入门板卡常通过 Arduino 工具链接触 TinyML，底层仍可能用到优化 kernel。
- [[mbedtls]] —— 同属小设备基础库，体现“按资源边界裁剪实现”的工程取舍。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
