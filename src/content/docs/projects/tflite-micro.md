---
title: TensorFlow Lite Micro — 把小模型塞进微控制器
来源: 'https://github.com/tensorflow/tflite-micro'
日期: 2026-05-29
分类: embedded
难度: 初级
---

## 是什么

TensorFlow Lite Micro（常写作 **TFLM**）是 Google 做的一个**让微控制器也能跑神经网络推理**的 C++ runtime。日常类比：普通 TensorFlow Lite 像厨房里的多功能料理机，TFLM 像只带一把小刀和一个小锅去露营，也要把饭做出来。

微控制器就是洗衣机、玩具、传感器、耳机里那种很小的芯片。它通常没有 Linux，没有文件系统，内存也很小，所以不能像手机 App 那样临时申请一堆内存。

最小使用姿势大概长这样：

```cpp
tflite::MicroMutableOpResolver<4> resolver;  // 只注册模型用到的算子
const tflite::Model* model = tflite::GetModel(g_model);
static uint8_t arena[8 * 1024];  // 固定工作台，不动态扩容
tflite::MicroInterpreter interpreter(model, resolver, arena, sizeof(arena));
interpreter.AllocateTensors();
interpreter.Invoke();
```

这段代码的意思是：先声明会用到的算子，模型已经被编译进程序，`arena` 是提前准备好的工作台，解释器只在这块固定空间里搬东西，然后执行一次推理。

## 为什么重要

不理解 TFLM，下面这些事都很难解释：

- 为什么一个"识别 yes/no"的小模型能在没有操作系统的开发板上跑，而不是必须连云端。
- 为什么 TinyML 项目总在讲 `int8`、模型大小、tensor arena，而不是只讲准确率。
- 为什么把手机上的 `.tflite` 模型直接搬到单片机，经常会因为算子不支持或内存不够而失败。
- 为什么边缘设备上的隐私、延迟、功耗问题，很多时候要靠"本地推理"解决。

## 核心要点

1. **模型先变小，再放进固件**：TFLM 常把模型量化成 `int8`，再转成 C 数组编进程序。类比：不是把整本书塞进口袋，而是先做成袖珍本，再夹进工具包。

2. **内存提前分配，不边跑边借**：TFLM 的核心设计是不依赖动态内存分配，开发者给它一块 `tensor_arena`。类比：做菜前把桌面大小划好，过程中不能临时扩建厨房。

3. **只带用得到的算子**：项目里通常用 `MicroMutableOpResolver` 注册模型需要的算子。类比：出门维修只带螺丝刀和钳子，不把整个五金店背上。

## 实践案例

### 案例 1：Hello World，用模型拟合正弦波

官方 `hello_world` 示例用一个很小的模型预测 `sin(x)`，适合第一次确认 TFLM 跑通。它不是为了证明正弦波有多难，而是为了把训练、转换、编译、推理这条链路走一遍。

```bash
bazel build tensorflow/lite/micro/examples/hello_world:evaluate
bazel run tensorflow/lite/micro/examples/hello_world:evaluate
bazel run tensorflow/lite/micro/examples/hello_world:evaluate -- --use_tflite
```

**逐部分解释**：

- 第一行先构建桌面端评估程序，方便不用烧录开发板也能检查模型。
- 第二行用 TFLM interpreter 跑一组 `x` 值，输出预测曲线。
- 第三行切到普通 TensorFlow Lite 路径，用来对比两套 runtime 的输出是否接近。

这个案例的学习重点是：TFLM 不是只在板子上才可调试，很多模型和解释器问题可以先在开发机上发现。

### 案例 2：Micro Speech，在麦克风里听 yes/no

`micro_speech` 示例把原始音频先变成频谱特征，再交给一个小于 20KB 的关键词模型，识别 `yes`、`no`、`unknown`、`silence` 这几类结果。

```bash
bazel run tensorflow/lite/micro/examples/micro_speech:micro_speech_test
make -f tensorflow/lite/micro/tools/make/Makefile test_micro_speech_test
make -f tensorflow/lite/micro/tools/make/Makefile TARGET=cortex_m_qemu TARGET_ARCH=cortex-m0 OPTIMIZED_KERNEL_DIR=cmsis_nn BUILD_TYPE=default test_micro_speech_test
```

**逐部分解释**：

- 第一行用 Bazel 在开发机上跑 C++ 测试，确认模型输入输出没坏。
- 第二行用 Makefile 走另一套构建路径，贴近很多嵌入式项目的习惯。
- 第三行把目标换成 Cortex-M0 的 QEMU，并启用 CMSIS-NN 优化算子，验证更接近真实微控制器的环境。

这个案例的学习重点是：语音项目不是"把 wav 丢进模型"这么简单，中间还有窗口、步长、频谱、量化这些预处理步骤。

### 案例 3：Person Detection，用 250KB 模型看图里有没有人

`person_detection` 示例用摄像头图像做二分类：有人 / 没有人。官方测试会加载模型，对一组有人的图片和无人的图片做推理，并检查分数方向是否正确。

```bash
make -f tensorflow/lite/micro/tools/make/Makefile third_party_downloads
make -f tensorflow/lite/micro/tools/make/Makefile test_person_detection_test
make -f tensorflow/lite/micro/tools/make/Makefile run_person_detection
```

**逐部分解释**：

- 第一行下载测试和构建所需的第三方依赖。
- 第二行构建并运行单元测试，期望最后看到所有测试通过。
- 第三行运行连续推理目标，会输出类似 `person score:-72 no person score 72` 的分数。

这个案例的学习重点是：图像模型比 hello_world 大很多，开发板是否有摄像头、RAM、PSRAM、驱动支持，会直接决定能不能跑。

## 踩过的坑

1. **把大模型直接塞进板子**：模型能在电脑上跑，不代表 flash、RAM、算子集合都够用。

2. **忘记注册算子**：模型里有 `CONV_2D`，resolver 里没加对应算子，解释器初始化或调用时就会失败。

3. **tensor arena 估小了**：TFLM 不靠运行时动态扩容，arena 小了就像桌子太小，所有中间张量都摆不开。

4. **硬件外设被低估**：语音要麦克风采样，视觉要摄像头和图像缓冲，移植难点常常不在模型，而在传感器数据进不来。

## 适用 vs 不适用场景

**适用**：

- 电池供电、网络不稳、要毫秒～数十毫秒级本地响应的 MCU（常见 RAM/flash 为数十到数百 KB）。
- 关键词唤醒（模型常约十几 KB）、简单手势、异常检测、低分辨率人像检测（约数百 KB）等小模型。
- 已接受 `int8` 量化、tensor arena 预分配、只注册所需算子的项目。
- 要把推理留在设备本地、少上传原始传感器数据的场景。

**不适用**：

- 想在单片机上训练模型；TFLM 主要做推理，不做端上训练。
- 需要完整 TensorFlow / Python 生态；微控制器上没有那些运行时条件。
- 模型依赖大量自定义算子、动态 shape、复杂后处理，且不愿意重写。
- 设备其实是 Raspberry Pi 这类嵌入式 Linux（通常有 ≥128MB RAM）；这时普通 LiteRT / TensorFlow Lite 更省事。

## 历史小故事（可跳过）

- **2010s 后期**：手机端推理已经常见，但微控制器还受限于内存、功耗和碎片化硬件生态。
- **2019 年**：Google 公开 TensorFlow Lite for Microcontrollers，TinyML 社区开始围绕"极小内存跑模型"讨论。
- **2020 年**：TFLM 论文（arXiv:2010.08678）系统解释无操作系统、无动态内存、解释器式执行，并展示低资源开销。
- **之后几年**：社区移植到 Arduino、ESP32、SparkFun Edge、Zephyr、Renesas、Silicon Labs 等平台，README 里也维护了这些入口。
- **现在**：独立仓库约 3k stars，定位不是替代云端大模型，而是让最小的设备拥有一点本地判断力。

## 学到什么

- **TinyML 的第一约束是资源**：准确率重要，但内存、flash、功耗、外设链路先决定能不能落地。
- **TFLM 的核心工程感是"提前确定"**：模型、算子、内存、平台适配都尽量在编译期或初始化期定下来。
- **示例不是玩具**：hello_world、micro_speech、person_detection 分别覆盖数值、音频、图像三条常见入门路径。
- **移植比调用 API 更难**：真正卡住项目的，常是日志、计时、麦克风、摄像头、优化 kernel 这些平台细节。

## 延伸阅读

- 官方仓库：[tensorflow/tflite-micro](https://github.com/tensorflow/tflite-micro)（README、docs、examples 都在这里）
- 官方概览：[LiteRT for Microcontrollers](https://developers.google.com/edge/litert/microcontrollers/overview)（16KB runtime、平台限制、工作流）
- 移植文档：[New Platform Support](https://github.com/tensorflow/tflite-micro/blob/main/tensorflow/lite/micro/docs/new_platform_support.md)（新开发板接入路线）
- 论文：[TensorFlow Lite Micro: Embedded Machine Learning on TinyML Systems](https://arxiv.org/abs/2010.08678)（设计取舍的正式说明）
- [[zephyr]] —— 常见 RTOS，能跑 TFLM sample，并提供嵌入式构建生态
- [[arduino-cli]] —— 很多 TFLM 入门板卡会从 Arduino 工具链开始

## 关联

- [[tensorflow]] —— TFLM 的模型通常从 TensorFlow 训练与转换流程来。
- [[tensorflow-osdi-2016]] —— 理解 TensorFlow 早期系统设计，再看 Micro 版会更清楚为什么要瘦身。
- [[keras]] —— 许多入门模型先用 Keras 训练，再量化成 `.tflite`。
- [[pytorch]] —— 另一套训练生态；对比后能理解"训练框架"和"部署 runtime"不是一件事。
- [[embedded-hal]] —— 嵌入式抽象层，能帮助理解为什么外设适配比模型调用更麻烦。
- [[micropython]] —— 也是在小设备上编程，但目标是脚本易用性，和 TFLM 的 C++ 推理 runtime 侧重点不同。
- [[zephyr]] —— TFLM 的板级移植常需要 RTOS、驱动和构建系统配合。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[cmsis-nn]] —— CMSIS-NN — Arm Cortex-M 的神经网络算子加速库
- [[paddle-lite]] —— Paddle Lite — 端侧轻量推理引擎
- [[wamr]] —— WAMR — 塞进单片机也能跑的 Wasm 微运行时
