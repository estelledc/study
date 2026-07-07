---
title: ncnn — 腾讯开源的端侧神经网络推理框架
来源: 'https://github.com/Tencent/ncnn'
日期: 2026-07-07
分类: embedded
难度: 初级
---

## 是什么

ncnn 是腾讯开源的神经网络推理框架，专门把训练好的模型搬到手机、嵌入式设备、桌面端和浏览器里本地运行。

日常类比：像把大餐厅的中央厨房菜谱改成露营炉菜谱。训练框架负责“研发菜谱”，ncnn 负责把菜谱压成小锅也能照着做的步骤，并尽量少带额外厨具。

最小使用感大概是这样：

```cpp
#include "net.h"

ncnn::Net net;
net.load_param("model.ncnn.param");
net.load_model("model.ncnn.bin");
ncnn::Mat in(224, 224, 3);
auto ex = net.create_extractor();
ex.input("in0", in);
ncnn::Mat out;
ex.extract("out0", out);
```

这段代码背后的前提是：模型已经被 pnnx 或其他转换工具变成 ncnn 能读的 `.param` 和 `.bin`，输入也已经按模型要求整理好。

## 为什么重要

不理解 ncnn，下面这些事会很难解释：

- 为什么手机 App 不能直接塞一个 PyTorch `.pth` 文件就上线；训练格式和端侧推理格式不是一回事。
- 为什么端侧 AI 总在讨论 ARM NEON、Vulkan、fp16、int8；小设备最缺的是内存、带宽和稳定耗电。
- 为什么同一个模型在电脑上准，到了手机上却结果怪；输入颜色顺序、尺寸、均值归一化都可能变。
- 为什么“不依赖第三方运行时”很值钱；嵌入式和 App 发版时，少一个依赖就少一层兼容风险。

## 核心要点

1. **模型先换格式**：ncnn 不直接执行训练框架文件，而是读取 `.param` 图结构和 `.bin` 权重。类比：先把设计院图纸翻译成施工队能看的材料清单和步骤表。

2. **CPU 和 Vulkan 双路线**：CPU 路线靠 C++、多线程、ARM NEON 等优化，Vulkan 路线把合适的层交给 GPU。类比：有些菜用手工刀法最快，有些菜交给电动搅拌机更划算。

3. **推理是“装货、跑图、卸货”**：`Mat` 装输入，`Extractor` 沿着网络图执行，`extract` 拿输出。类比：快递站先把包裹贴单，再按路线分拣，最后从指定出口取件。

## 实践案例

### 案例 1：把 PyTorch / ONNX 模型转成 ncnn

官方推荐新手优先走 pnnx：PyTorch 可以直接导出，已有 ONNX 文件也可以让 pnnx 继续转换。

```bash
pip3 install pnnx
pnnx my_model.onnx
```

```python
import torch
import pnnx

model = MyModel().eval()
input_tensor = torch.rand(1, 3, 224, 224)
pnnx.export(model, "my_model.pt", (input_tensor,))
```

逐部分解释：

- `pip3 install pnnx`：安装转换工具，既能在 Python 里调用，也能在命令行里运行。
- `pnnx my_model.onnx`：把 ONNX 图转成 ncnn 的 `.param` 和 `.bin`。
- `model.eval()`：关闭训练时才需要的行为，让导出的图更接近真实推理。
- `input_tensor`：告诉转换器输入形状；端侧推理最怕“形状没说清楚”。

### 案例 2：用 SqueezeNet 做图片分类

官方 `examples/squeezenet.cpp` 展示了最典型的端侧视觉流程：读图、缩放、归一化、推理、取 top-k。

```cpp
ncnn::Net squeezenet;
squeezenet.opt.use_vulkan_compute = true;
squeezenet.load_param("squeezenet_v1.1.param");
squeezenet.load_model("squeezenet_v1.1.bin");

ncnn::Mat in = ncnn::Mat::from_pixels_resize(
    bgr.data, ncnn::Mat::PIXEL_BGR, bgr.cols, bgr.rows, 227, 227);
const float mean_vals[3] = {104.f, 117.f, 123.f};
in.substract_mean_normalize(mean_vals, 0);

ncnn::Extractor ex = squeezenet.create_extractor();
ex.input("data", in);
ncnn::Mat out;
ex.extract("prob", out);
```

逐部分解释：

- `use_vulkan_compute = true`：允许模型尝试走 Vulkan GPU 后端，但前提是构建和设备都支持。
- `from_pixels_resize`：把图片像素转成 ncnn 的 `Mat`，顺手改成模型要的 227x227。
- `substract_mean_normalize`：做训练时约定的均值处理；这一步错了，输出经常“看起来能跑但不准”。
- `"data"` 和 `"prob"`：输入输出 blob 名，来自模型图，不是每个模型都叫这个。

### 案例 3：把模型藏进 App 资源里加载

AlexNet 教程展示了一个更贴近移动 App 的做法：把明文 `.param` 处理成二进制，再从内存里加载。

```bash
ncnn2mem alexnet.param alexnet.bin alexnet.id.h alexnet.mem.h
```

```cpp
#include "alexnet.mem.h"

ncnn::Net net;
net.load_param(alexnet_param_bin);
net.load_model(alexnet_bin);
```

逐部分解释：

- `ncnn2mem`：把模型参数和权重变成 C/C++ 头文件里的数组，方便随程序一起打包。
- `alexnet_param_bin`：二进制参数，不再把网络层名字明晃晃写在普通文本里。
- `alexnet_bin`：权重数据；从内存加载时要保证这段内存在推理期间一直有效。
- 这种方式适合 App 资源打包，但模型更新会变成重新发版或重新下发资源的问题。

## 踩过的坑

1. **把训练模型直接塞给 ncnn**：`.pth`、`.pb`、原始 `.onnx` 不是 ncnn 运行时的目标格式，通常要先转换。
2. **输入名和输出名写错**：`"in0"`、`"data"`、`"prob"` 取决于模型图，照抄别的例子会拿不到结果。
3. **以为开 Vulkan 一定更快**：小模型、冷启动、驱动差异都会让 GPU 路线不一定划算，要实测。
4. **忽略预处理约定**：RGB/BGR、resize 方式、mean/normalize 不一致，模型会安静地输出错误答案。

## 适用 vs 不适用场景

**适用**：

- 手机、平板、树莓派、嵌入式 Linux、WebAssembly 这类端侧推理场景。
- 视觉分类、检测、分割、OCR、轻量语音等模型，且算子能被 ncnn 支持。
- 想把推理逻辑嵌进 C++ / Android / iOS 应用，而不是起一个远程服务。
- 对安装体积、依赖数量、离线能力和隐私传输很敏感的产品。

**不适用**：

- 训练模型；ncnn 是推理运行时，不负责反向传播和优化器。
- 巨型大语言模型或扩散模型的通用服务化；这类更常见于专门的服务器推理栈。
- 主要业务逻辑都在 Python 里，且不需要端侧部署的项目。
- 模型包含大量未支持算子，又没有精力写自定义层和验证数值一致性。

## 历史小故事（可跳过）

- **2017 年前后**：ncnn 以移动端高性能推理为核心方向开源，示例代码里能看到早期版权年份。
- **早期定位**：它先服务经典 CNN 和移动视觉任务，重点是小体积、低内存、ARM CPU 跑得快。
- **后来演进**：Vulkan、fp16、int8、pnnx、Python 绑定和更多平台预编译包陆续补上，使用门槛下降。
- **社区状态**：GitHub 上已有 2 万多 stars，仓库语言以 C++、C、GLSL、Python 为主，说明它既贴近运行时，也贴近工具链。
- **生态外延**：许多 Android、WebAssembly、图像增强和语音项目把 ncnn 当作端侧执行层。

## 学到什么

- 端侧推理不是“把模型复制到设备”，而是“把模型、输入、算子和硬件后端对齐”。
- ncnn 的价值来自少依赖和硬件优化：它尽量让模型在资源紧的小设备上稳稳跑完。
- pnnx 是新手路线的入口；先把转换链路跑通，再谈性能优化更现实。
- Vulkan 是加速选项，不是魔法按钮；是否更快要看模型规模、设备驱动和数据搬运成本。

## 延伸阅读

- 官方仓库：[Tencent/ncnn](https://github.com/Tencent/ncnn)
- 入门 README：[Quick Start](https://github.com/Tencent/ncnn#quick-start)
- 转换指南：[use ncnn with PyTorch or ONNX](https://github.com/Tencent/ncnn/blob/master/docs/how-to-use-and-FAQ/use-ncnn-with-pytorch-or-onnx.md)
- C++ 示例：[examples](https://github.com/Tencent/ncnn/tree/master/examples)
- [[esp-dl]] —— 另一个端侧推理项目，更贴近 ESP32 微控制器。
- [[triton-inference-server]] —— 服务器侧推理服务化，和 ncnn 的部署位置正好相反。

## 关联

- [[pytorch]] —— 常见训练来源，模型常通过 pnnx 进入 ncnn。
- [[tensorflow]] —— 另一类训练生态，端侧部署时也会遇到格式转换问题。
- [[keras]] —— 高层模型 API，和 ncnn 的运行时角色不同。
- [[esp-dl]] —— 同样做端侧推理，但更偏微控制器和 ESP-IDF。
- [[mlx]] —— Apple Silicon 本地机器学习框架，关注本机硬件效率。
- [[piper]] —— 端侧语音合成项目，和 ncnn 共享“离线、本地、轻量”的部署思路。
- [[triton-inference-server]] —— 数据中心推理服务；ncnn 更像设备内嵌运行时。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
