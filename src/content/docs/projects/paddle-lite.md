---
title: Paddle Lite — 把飞桨模型装进手机里的「端侧放映机」
来源: https://github.com/PaddlePaddle/Paddle-Lite
日期: 2026-06-13
分类: 操作系统
子分类: 嵌入式
难度: 中级
provenance: pipeline-v3
---

## 是什么

**Paddle Lite**（飞桨 Lite）是百度 [PaddlePaddle](https://github.com/PaddlePaddle/Paddle) 生态下的**高性能端侧推理引擎**，源码托管在 [PaddlePaddle/Paddle-Lite](https://github.com/PaddlePaddle/Paddle-Lite)。它面向手机、嵌入式 Linux、边缘盒子等「算力有限、内存紧张、常常离线」的设备，把已经训练好的神经网络**压缩、优化、加速**后跑在本地。

日常类比：**如果把 [[pytorch]] / Paddle 训练比作在摄影棚里拍一部 4K 电影——灯光、演员、后期团队一应俱全——那 Paddle Lite 就是装进手机里的「离线放映机」**。

放映机不负责拍戏，也不负责把整部电影上传到云端再流式播放；它只做一件事：把已经刻录好的「精简版胶片」（`.nb` 优化模型）按固定顺序播放出来。更关键的是，这台放映机**针对小屏幕设备做了专门调校**：胶片体积更小（naive_buffer 序列化）、播放速度更快（算子融合、Kernel 优选）、耗电更省（`PowerMode` 能耗策略）。类比到生活：你出差住酒店，有的播放器还得先联网验证版权、再下载解码器；Paddle Lite 则是自带解码芯片的便携机——模型和运行时一起打包，拎袋就走。

和 [[ncnn]]（腾讯、零依赖 C++ 推理）、[[tflite-micro]]（几 KB RAM 的 MCU）相比，Paddle Lite 的定位是：**原生吃 Paddle 推理模型**，在 Android / iOS / ARM Linux / x86 等多平台上做**生产级端侧部署**，并通过 NNAdapter 统一对接华为 NPU、高通 QNN、昆仑芯 XPU 等 AI 硬件。

## 解决什么问题

| 痛点 | 云端推理 | Paddle Lite 的回应 |
| --- | --- | --- |
| 延迟与隐私 | 每次请求都要联网 | **本地推理**，数据不出设备 |
| 模型体积 | Paddle 原生 protobuf 模型偏大 | `opt` 工具转为 **`.nb` naive_buffer**，体积更小 |
| 算力碎片化 | 不同手机芯片差异大 | 支持 **ARM / OpenCL / Metal / NPU** 等多 backend |
| 训练与部署割裂 | 训练框架和移动端运行时不同 | **直接支持 Paddle 推理模型**，配合 X2Paddle 可接其他框架 |
| 性能调优复杂 | 手工选 kernel、融合算子 | **MIR 图优化**：量化、子图融合、混合调度、Kernel 优选 |

典型落地：图像分类、目标检测、OCR、人脸关键点、人像分割、关键词唤醒——凡是要在**百度系 App、Android/iOS 应用、嵌入式 Linux 设备**上跑 Paddle 模型，Paddle Lite 都是官方正选路径。

## 标准工作流

Paddle Lite 官方文档把部署流程概括为四步，零基础可以先记住这条主线：

```
① 准备模型（Paddle save_inference_model 或 X2Paddle 转换）
        ↓
② opt 优化（量化 / 融合 / 选 kernel → 生成 .nb）
        ↓
③ 下载或编译预测库（C++ / Java / Python）
        ↓
④ 创建 Predictor → 填输入 → Run → 读输出
```

类比：① 是拍好母带；② 是压成适合手机播放的 MP4；③ 是安装播放器 App；④ 是按下播放键。

## 核心概念

### 1. 推理-only：训练在 PC，设备只「放映」

Paddle Lite **不支持设备端训练**（另有实验性 C++ train demo，但主流用法是推理）。设备上的程序不理解 `backward()`，只理解一张静态计算图。

### 2. 两种模型格式

| 格式 | 说明 | 典型用途 |
| --- | --- | --- |
| **protobuf** | Paddle 原生推理格式（`__model__` + 参数文件） | 开发调试、Full API |
| **naive_buffer（`.nb`）** | opt 优化后的轻量序列化格式 | **移动端部署（Light API）** |

移动端几乎总是用 `.nb`。一个 `.nb` 文件把结构和权重打包在一起，加载更快、体积更小。

### 3. `opt`：模型优化工具

`opt`（命令行 `paddle_lite_opt` 或 Python `Opt` 类）是 Paddle Lite 的**离线编译器**。它对 Paddle 模型做：

- 格式转换（protobuf → naive_buffer）
- 图优化（算子融合、常量折叠、子图裁剪）
- 硬件适配（按 `valid_targets` 选择 ARM / OpenCL / NPU 等 kernel）
- 可选量化（int8 内核加速）

**未经 opt 优化的 Paddle 模型，不能高效地在 Lite 上跑 Light API。**

### 4. Place 与 valid_targets

**Place** 描述「张量和算子在哪个硬件上执行」，由 **Target**（如 `kARM`、`kOpenCL`、`kNPU`）和 **Precision**（fp32 / fp16 / int8）组成。

`valid_targets` / `valid_places` 告诉 opt：「我的 App 最终可能跑在哪些硬件上」。opt 会据此预选 kernel，避免运行时才发现某算子不支持 NPU 而崩溃。

常见取值：`arm`、`x86`、`opencl`、`npu`、`xpu`、`metal`（iOS GPU）等。

### 5. `MobileConfig` 与 `PaddlePredictor`

- **`MobileConfig`**：配置模型路径、线程数、能耗模式等
- **`CreatePaddlePredictor` / `create_paddle_predictor`**：根据 config 创建预测器
- **`PaddlePredictor`**：推理会话对象，提供 `GetInput` / `Run` / `GetOutput`

C++ 侧还有 **`CxxConfig`**（Full API，直接加载 protobuf 模型，适合开发调试）和 **`MobileConfig`**（Light API，加载 `.nb`，适合上线）。

### 6. `Tensor`：输入输出的数据容器

`Tensor` 封装 shape、dtype 和底层 buffer。C++ 里用 `Resize` + 指针写入；Python 里用 `from_numpy` / `numpy()` 与 NumPy 互转。

### 7. `PowerMode` 与 `set_threads`

在 ARM 设备上，`PowerMode` 控制 CPU 大核/小核调度策略（如 `LITE_POWER_HIGH`、`LITE_POWER_LOW`），在性能和功耗之间取舍。`set_threads` 设置 CPU 推理线程数，通常设为物理核心数或略少。

### 8. Light API vs Full API

| API | 模型输入 | 特点 |
| --- | --- | --- |
| **Light API** | `.nb` 单文件 | 体积小、加载快，**生产部署首选** |
| **Full API** | protobuf 模型目录 | 跳过 opt 也可跑，方便调试，性能不如 Light |

### 9. NNAdapter：AI 硬件统一适配层

Paddle Lite 通过 **NNAdapter** 对接第三方 NPU（华为麒麟、昇腾、高通 QNN、寒武纪 MLU 等），上层 API 不变，底层自动路由到对应驱动。类比：USB-C 转接头——手机接口统一，插不同厂商的扩展坞都能用。

## 与相近项目对比

| 维度 | Paddle Lite | [[ncnn]] | [[tflite-micro]] |
| --- | --- | --- | --- |
| 原生模型 | Paddle 推理格式 | `.param` + `.bin` | `.tflite` FlatBuffer |
| 典型平台 | Android / iOS / ARM Linux | 同上 + 桌面 | MCU（无 OS） |
| 语言 API | C++ / Java / Python | 主要是 C++ | C++ |
| 优化工具 | `opt` → `.nb` | pnnx / onnx2ncnn | 模型转换 + 量化 |
| 生态绑定 | 飞桨 / 百度系 | 腾讯系 / 通用 CNN | TensorFlow 系 |

若你的模型已经在 Paddle 里训练完成，走 Paddle Lite 路径最顺；若模型来自 PyTorch 且不想转 Paddle，[[ncnn]] 或 ONNX Runtime Mobile 可能更直接。

## 代码示例

### 示例 1：Python — 用 `opt` 把模型转成 `.nb`

以下流程改编自官方 Python API 文档。假设当前目录有 Paddle 导出的 `mobilenet_v1` 文件夹（非 combined 形式）：

```python
from paddlelite.lite import Opt

# 1. 创建 opt 实例
opt = Opt()

# 2. 指定 Paddle 原生模型目录
opt.set_model_dir("./mobilenet_v1")

# 3. 指定目标硬件（移动端常用 arm；桌面调试可用 x86）
opt.set_valid_places("arm")

# 4. 输出 naive_buffer 格式（移动端必须）
opt.set_model_type("naive_buffer")

# 5. 输出文件名前缀，实际生成 mobilenetv1_opt.nb
opt.set_optimize_out("mobilenetv1_opt")

# 6. 执行优化
opt.run()
```

等价的命令行写法（Linux / macOS 安装 `paddlelite` 后自带 `paddle_lite_opt`）：

```bash
paddle_lite_opt \
  --model_dir=./mobilenet_v1 \
  --valid_targets=arm \
  --optimize_out_type=naive_buffer \
  --optimize_out=mobilenetv1_opt
```

成功后当前目录会出现 **`mobilenetv1_opt.nb`**，这就是可以打进 APK / 随 App 分发的部署模型。

### 示例 2：Python — Light API 推理完整闭环

改编自官方 `mobilenetv1_light_api.py` 的五步流程：

```python
from paddlelite.lite import MobileConfig, create_paddle_predictor
import numpy as np

# ① 配置：加载 .nb 模型
config = MobileConfig()
config.set_model_from_file("mobilenetv1_opt.nb")
config.set_threads(4)  # 可选：CPU 线程数

# ② 创建 predictor
predictor = create_paddle_predictor(config)

# ③ 准备输入（MobileNet 典型输入 1×3×224×224）
input_tensor = predictor.get_input(0)
input_tensor.from_numpy(
    np.random.rand(1, 3, 224, 224).astype("float32")
)

# ④ 执行推理
predictor.run()

# ⑤ 读取输出
output_tensor = predictor.get_output(0)
scores = output_tensor.numpy()          # shape: [1, 1000]
top1 = int(np.argmax(scores))
print(f"top-1 class index: {top1}, score: {scores[0][top1]:.6f}")
```

真实业务里，第三步应把相机帧或图片做 resize、减均值、归一化后再 `from_numpy`，而不是随机数。

### 示例 3：C++ — MobileConfig 最小推理

C++ 是 Android / iOS 原生集成的常用语言，核心 API 与 Python 一一对应：

```cpp
#include "paddle_api.h"
using namespace paddle::lite_api;

MobileConfig config;
config.set_model_from_file("mobilenetv1_opt.nb");
config.set_threads(4);
config.set_power_mode(LITE_POWER_HIGH);

std::shared_ptr<PaddlePredictor> predictor =
    CreatePaddlePredictor<MobileConfig>(config);

// 写入输入
std::unique_ptr<Tensor> input_tensor(std::move(predictor->GetInput(0)));
input_tensor->Resize({1, 3, 224, 224});
auto* data = input_tensor->mutable_data<float>();
// TODO: 把预处理后的图像数据拷贝到 data

// 推理
predictor->Run();

// 读取输出
std::unique_ptr<const Tensor> output_tensor(
    std::move(predictor->GetOutput(0)));
const float* out_data = output_tensor->data<float>();
// out_data[0..999] 即 1000 类 softmax 分数
```

## 安装与工具链速查

| 场景 | 做法 |
| --- | --- |
| 桌面 Python 体验 | `pip install paddlelite`（如 2.12） |
| 模型转换 | `paddle_lite_opt` 或 Python `Opt` |
| Android 集成 | 下载预编译 `.so` 或源码编译，Java/C++ API |
| iOS 集成 | 预编译 framework / CocoaPods，支持 Metal |
| 非 Paddle 模型 | 先用 [X2Paddle](https://github.com/PaddlePaddle/X2Paddle) 转换 |

查看当前 Lite 支持哪些算子：

```bash
paddle_lite_opt --print_all_ops=true
```

查看某模型在指定硬件上是否支持：

```bash
paddle_lite_opt --print_model_ops=true --model_dir=./mobilenet_v1 --valid_targets=arm
```

## 常见坑与排查

1. **直接用 protobuf 模型上线** — Light API 需要 `.nb`；忘记跑 opt 是最常见的新手错误。
2. **valid_targets 与真机不符** — 在 x86 上 opt 出的模型放到 ARM 手机，应重新指定 `--valid_targets=arm`（或同时包含 opencl、npu）。
3. **输入 shape / 预处理不一致** — 训练时用的 mean/std、RGB/BGR 顺序、NCHW 布局必须在端侧完全一致，否则精度暴跌。
4. **线程数开太大** — 超过物理核心数反而因调度开销变慢；一般 2～4 是移动端甜点。
5. **NPU 路径需额外 SDK** — 华为、高通等 NPU 不仅要写 `npu`，还要集成对应厂商运行时库，参考官方各硬件 demo。

## 进一步学习

- 官方文档：[Paddle Lite 文档](https://www.paddlepaddle.org.cn/lite)
- 示例工程：[Paddle-Lite-Demo](https://github.com/PaddlePaddle/Paddle-Lite-Demo)
- API 参考：[C++](https://www.paddlepaddle.org.cn/lite/develop/api_reference/cxx_api_doc.html) / [Python](https://www.paddlepaddle.org.cn/lite/develop/api_reference/python_api_doc.html) / [Java](https://www.paddlepaddle.org.cn/lite/develop/api_reference/java_api_doc.html)
- 模型优化详解：[模型转化方法](https://www.paddlepaddle.org.cn/lite/develop/user_guides/model_optimize_tool.html)
- 量化加速：[静态离线量化](https://www.paddlepaddle.org.cn/lite/develop/user_guides/quant/quant_post_static.html)
- 相关笔记：[[ncnn]]、[[tflite-micro]]、[[esp-dl]]、[[pytorch]]

## 小结

Paddle Lite 的本质是：**把飞桨训练产物，经过 opt「压片」成 `.nb`，再用 Predictor 在端侧高速播放**。零基础只需记住三个词——**opt、.nb、Predictor**——再配上一段 Python 转换脚本和一段推理脚本，就能在 x86 上跑通第一个 MobileNet 分类 demo。之后按目标平台（Android / iOS / NPU）查官方 demo 集成即可。
