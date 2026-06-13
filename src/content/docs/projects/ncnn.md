---
title: ncnn — 手机上的「无依赖神经网络放映机」
来源: https://github.com/Tencent/ncnn
日期: 2026-06-13
子分类: 嵌入式
分类: 操作系统
难度: 中级
provenance: pipeline-v3
---

## 是什么

**ncnn** 是腾讯开源的高性能神经网络**推理**框架，专为手机、嵌入式和桌面端部署优化。源码托管在 [Tencent/ncnn](https://github.com/Tencent/ncnn)，自 2017 年发布以来持续维护，被微信、QQ 等亿级产品用于端侧 AI。

日常类比：**如果把 [[pytorch]] 训练比作在摄影棚里拍一部电影——灯光、演员、剪辑台一应俱全——那 ncnn 就是装进手机里的「离线放映机」**。

放映机不负责拍戏，也不联网下载新片；它只做一件事：把已经刻录好的胶片（`.param` + `.bin` 模型文件）按固定顺序播放出来。更关键的是，这台放映机**不借任何外部设备**：不需要装 BLAS、NNPACK、CUDA 运行时，纯 C++ 就能在 Android、iOS、Linux、Windows、macOS 甚至 WebAssembly 上转起来。类比到生活：你出差住酒店，有的播放器还得先找前台借 HDMI 线和解码器；ncnn 则是自带电池和屏幕的便携机，拎袋就走。

和 [[tflite-micro]]（面向几 KB RAM 的 MCU）、[[esp-dl]]（深度绑定乐鑫芯片）相比，ncnn 瞄准的是**有操作系统、有多核 CPU、可选 GPU 的移动与边缘设备**。

## 为什么重要

不了解 ncnn，下面几件事就讲不通：

- 为什么微信、QQ 里人脸贴纸、图像滤镜能在**无网、低延迟**下跑起来——背后常是 ncnn 这类端侧推理引擎，而不是每次请求云端
- 为什么国内 Android 团队做 CNN 部署时，除了 [[onnx]] Runtime 还会单独评估 ncnn——**零第三方运行时依赖**意味着 APK 体积和链接复杂度可控
- 为什么同一套 PyTorch 模型在 PC 上跑得飞快，塞进手机却要先「转格式」——ncnn 只认静态计算图（param + bin），训练与推理是两套编制
- 为什么 Vulkan GPU 加速在移动端是「能用就用、不能用就回退 CPU」——ncnn 从设计之初就把 CPU NEON 多线程当作主路径，GPU 是可选增压

典型落地：人脸检测、图像分类、风格迁移、AR 滤镜、离线 OCR 预处理——凡是要在**手机 App、嵌入式 Linux、树莓派**上跑 CNN，且希望安装包体积可控的场景，ncnn 都是常见选型。

## 核心要点

### 1. 推理-only：训练在 PC，设备只「读 param + bin」

ncnn **不支持设备端训练**。标准工作流永远是：

```
PyTorch / ONNX 训练 → pnnx（或 onnx2ncnn）转换 → model.ncnn.param + model.ncnn.bin → C++ Net 加载 → Extractor 推理
```

设备上的程序不理解 `backward()`，只理解一张静态计算图。类比：餐厅后厨（训练）和前台取餐窗口（推理）是两套编制。

### 2. 双文件模型：`.param` 描述结构，`.bin` 存权重

| 文件 | 内容 | 类比 |
| --- | --- | --- |
| `*.param` | 网络拓扑：每层类型、输入输出 blob 名、卷积核大小等 | 乐谱（先奏什么后奏什么） |
| `*.bin` | 浮点或量化后的权重张量 | 乐谱对应的演奏录音 |

加载时两步走：`load_param()` 再 `load_model()`。也可用 `load_param_bin()` 加载去掉明文字符串的二进制 param，降低逆向可读性。

### 3. `ncnn::Net` 与 `ncnn::Extractor`

- **`Net`**：整个模型的根对象，解析 param、映射 bin 权重、创建推理会话
- **`Extractor`**：由 `net.create_extractor()` 得到，一次独立 forward pass；`input(blob, mat)` 喂数据，`extract(blob, mat)` 取结果
- **线程习惯**：多线程环境下，每个线程应使用自己的 `Extractor`，不要跨线程共享

### 4. `ncnn::Mat`：推理世界的轻量张量

`Mat` 用 `w` / `h` / `c` 表达维度，支持 `from_pixels` / `from_pixels_resize` 从 RGB/BGR 图像构造，以及 `substract_mean_normalize` 做减均值、乘缩放。与 OpenCV `cv::Mat` 可互操作，但内存布局为 SIMD 友好。

### 5. pnnx：现代模型转换器

官方推荐用 **pnnx**（PyTorch Neural Network eXchange）替代零散的 `onnx2ncnn` 手工链：

```bash
pip install pnnx
pnnx my_model.onnx
```

输出包括 `my_model.ncnn.param` / `.ncnn.bin`（部署用）和 `my_model_pnnx.py`（PyTorch 参考实现）。转换时务必用**真实输入 shape** 的 dummy tensor。

### 6. CPU、Vulkan 与量化

| 能力 | 说明 |
| --- | --- |
| ARM NEON | Android / iOS 默认加速，多核 `set_num_threads` 可调 |
| Vulkan | Adreno、Mali 等 GPU offload；驱动质量因机型差异大 |
| fp16 / int8 | 半精度省内存；整型需校准或 QAT，适合极致性能 |

## 实践案例

### 案例 1：C++ 图像分类完整流程

以下示例改编自官方 AlexNet 教程，展示从读图到输出分类分数的最小闭环：

```cpp
#include "net.h"
#include <stdio.h>

int main()
{
    ncnn::Net net;
    net.load_param("alexnet.param");
    net.load_model("alexnet.bin");

    int w = 640, h = 480;
    unsigned char* rgb = load_image_rgb("cat.jpg", &w, &h);

    ncnn::Mat in = ncnn::Mat::from_pixels_resize(
        rgb, ncnn::Mat::PIXEL_RGB, w, h, 227, 227);

    const float mean_vals[3] = {104.f, 117.f, 123.f};
    in.substract_mean_normalize(mean_vals, 0);

    ncnn::Extractor ex = net.create_extractor();
    ex.input("data", in);

    ncnn::Mat out;
    ex.extract("prob", out);

    ncnn::Mat flat = out.reshape(out.w * out.h * out.c);
    int best = 0;
    float best_score = -1.f;
    for (int i = 0; i < flat.w; i++) {
        if (flat[i] > best_score) {
            best_score = flat[i];
            best = i;
        }
    }
    printf("top1 class = %d, score = %.4f\n", best, best_score);
    net.clear();
    return 0;
}
```

要点：blob 名称 `"data"` / `"prob"` 来自 param 文件；预处理在 `Mat` 上完成；推理结束 `net.clear()` 释放映射。

### 案例 2：Python 用 pnnx 把 PyTorch 模型转成 ncnn

```python
import torch
import torchvision
import pnnx

model = torchvision.models.resnet18(
    weights=torchvision.models.ResNet18_Weights.DEFAULT)
model.eval()

x = torch.rand(1, 3, 224, 224)
pnnx.export(model, "resnet18", x)

print("  resnet18.ncnn.param  — 网络结构")
print("  resnet18.ncnn.bin   — 权重")
print("  resnet18_pnnx.py    — PyTorch 参考")
```

命令行等价：`pnnx resnet18.pt inputshape=[1,3,224,224]`。把生成的 param/bin 拷进 Android `assets` 或 iOS bundle，再用案例一的 C++ 流程加载。**导出时的输入尺寸必须和上线推理一致**。

### 案例 3（进阶）：ncnn2mem 零拷贝嵌入安装包

```bash
ncnn2mem alexnet.param alexnet.bin alexnet.id.h alexnet.mem.h
```

```cpp
#include "alexnet.mem.h"
#include "alexnet.id.h"

ncnn::Net net;
net.load_param(alexnet_param_bin);
net.load_model(alexnet_bin);

ncnn::Extractor ex = net.create_extractor();
ex.input(alexnet_param_id::BLOB_data, in);
ex.extract(alexnet_param_id::BLOB_prob, out);
```

`load_param` / `load_model` 直接引用静态数组缓冲区，推理期间**不能释放**这块内存——适合从 `AAssetManager` 读入后常驻 RAM 的场景。

### 桌面快速验证

```bash
git clone https://github.com/Tencent/ncnn.git
cd ncnn && mkdir build && cd build
cmake -DCMAKE_BUILD_TYPE=Release -DNCNN_VULKAN=ON -DNCNN_BUILD_EXAMPLES=ON ..
make -j$(nproc)
./examples/squeezenet ../images/ncnn.png
```

也可 `pip install ncnn` 获取带 Python 绑定的预编译轮子，适合原型验证。

## 踩过的坑

1. **转换成功但推理结果全错**：先查预处理（RGB vs BGR、均值方差）、pnnx 导出 shape 是否与线上一致、是否忘记 `model.eval()`；用 `*_pnnx.py` 在 PyTorch 侧对比中间层
2. **param 里 blob 名称找不到**：用文本编辑器打开 `*.ncnn.param` 查 Input/Output 名；二进制 param 必须用 `ncnn2mem` 生成的 `*.id.h` 枚举
3. **Vulkan 开了反而更慢**：部分机型驱动不成熟，务必用 `benchncnn` 同机对比 CPU vs GPU，不要默认 `set_vulkan_compute(true)`
4. **动态 shape 踩雷**：ncnn 传统上偏好固定输入；可变分辨率常导出多份 param 或按档位切换，完全动态图需逐层验证 shape
5. **多线程共享 Extractor**：跨线程复用同一 extractor 会数据竞争，每线程各自 `create_extractor()`

## 适用 vs 不适用场景

**适用**：

- 手机 App / 嵌入式 Linux 上跑 CNN，要求**低依赖、可控 APK 体积**
- 隐私敏感、需**离线推理**（人脸、滤镜、端侧检测）
- 已有 PyTorch 模型，愿意走 pnnx → ncnn 转换链
- 需要 ARM NEON + 可选 Vulkan 的移动端 CPU/GPU 混合加速

**不适用**：

- 无 OS、只有几百 KB RAM 的 MCU → 看 [[tflite-micro]]、[[cmsis-nn]]
- 深度绑定某家 SoC 且只用官方 SDK → 如乐鑫 [[esp-dl]]
- 需要训练、微调、自动求导 → 留在 [[pytorch]]，ncnn 只管推理
- 强依赖完整 ONNX 算子生态、不想维护转换链 → 考虑 ONNX Runtime Mobile

| 框架 | 典型目标 | 和 ncnn 的差异 |
| --- | --- | --- |
| [[tflite-micro]] | Cortex-M MCU | KB 级 arena；ncnn 假设 MB 级 RAM |
| [[esp-dl]] | ESP32 | 专用 `.espdl`；ncnn 跨平台 |
| ONNX Runtime | 通用 ONNX | 功能全、依赖相对重；ncnn 更轻、移动 CPU 手工优化深 |
| MNN | 阿里系移动端 | 定位相近；ncnn 社区早、Vulkan 与微信系实践多 |

## 历史小故事（可跳过）

- **2017**：腾讯 nihui 在 GitHub 开源 ncnn，定位「为手机端推理而生的高性能框架」，主打无 BLAS 依赖与 ARM NEON
- **2018–2019**：微信、QQ 等内部业务大规模采用，社区出现大量 Android/iOS 集成教程与预编译库
- **2020 前后**：pnnx 逐步取代零散 `caffe2ncnn` / 手工 `onnx2ncnn` 链，PyTorch 成为主流训练入口
- **2021+**：Vulkan GPU 路径成熟，`ncnn2mem`、int8 量化、WebAssembly 等能力补齐；与 MNN、TFLite 在移动端形成「三足鼎立」选型格局
- **现状**：仓库 star 数万级，仍由腾讯维护；在「极致轻依赖 + 可控体积」这条轴上，仍是国内移动 CV 团队的默认候选之一

## 学到什么

1. **推理框架不是训练框架的缩小版**：ncnn 砍掉 backward、动态图、自动求导，换来的是可预测的内存与可嵌入的安装包体积
2. **param + bin 双文件是移动端部署的通用隐喻**：结构与人眼可读（或可二进制化），权重单独 mmap，利于热更新与资产打包
3. **转换链和推理链一样重要**：pnnx 导出时的 input shape、eval 模式、预处理对齐，决定了上线后「能不能用」而不只是「能不能跑」
4. **CPU 优先、GPU 可选是移动现实**：NEON 多线程是保底路径；Vulkan 是增压，驱动质量决定要不要开
5. **生态选型看 TCO**：与 PyTorch 隔一层转换，换来的是链接简单、依赖少——技术选型要把「维护转换脚本」算进总成本

## 延伸阅读

- 官方仓库：[Tencent/ncnn](https://github.com/Tencent/ncnn)
- PyTorch / ONNX 转换：[use-ncnn-with-pytorch-or-onnx](https://github.com/Tencent/ncnn/blob/master/docs/how-to-use-and-FAQ/use-ncnn-with-pytorch-or-onnx.md)
- AlexNet 端到端示例：[use-ncnn-with-alexnet](https://github.com/Tencent/ncnn/blob/master/docs/how-to-use-and-FAQ/use-ncnn-with-alexnet.md)
- 在线文档：[ncnn.readthedocs.io](https://ncnn.readthedocs.io/)
- Python 包：[pypi.org/project/ncnn](https://pypi.org/project/ncnn/) · [pypi.org/project/pnnx](https://pypi.org/project/pnnx/)
- [[onnx]] — 常见中间格式，可经 pnnx 或 onnx2ncnn 进入 ncnn
- [[opencv]] — 图像预处理常与 ncnn 推理并读

## 关联

- 训练侧：[[pytorch]]、[[onnx]]
- MCU 极小内存：[[tflite-micro]]、[[cmsis-nn]]
- 乐鑫生态：[[esp-dl]]
- 移动工程化常与 [[opencv]] 预处理、Android NDK / iOS 打包并读

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[opencv]] —— OpenCV — 开源计算机视觉库与跨平台图像视频处理
- [[paddle-lite]] —— Paddle Lite — 把飞桨模型装进手机里的「端侧放映机」
- [[pytorch]] —— PyTorch — 深度学习主流框架

