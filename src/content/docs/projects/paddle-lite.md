---
title: Paddle Lite — 端侧轻量推理引擎
来源: 'https://github.com/PaddlePaddle/Paddle-Lite'
日期: 2026-07-07
分类: embedded
难度: 中级
---

## 是什么

Paddle Lite 是 PaddlePaddle 生态里的**端侧深度学习推理引擎**，目标是把训练好的模型塞进手机、开发板、车载盒子、摄像头这种资源受限设备里跑。日常类比：训练框架像中央厨房，Paddle Lite 像外卖保温箱加小炉灶——菜已经做好，它负责把菜缩小、保温、送到现场再快速加热。

最小使用感受不是“再训练一个模型”，而是把模型转成 `.nb`，再用移动端 API 跑：

```bash
paddle_lite_opt --model_dir=./mobilenet_v1 \
  --valid_targets=arm \
  --optimize_out_type=naive_buffer \
  --optimize_out=./mobilenet_v1_opt
```

这条命令会生成 `mobilenet_v1_opt.nb`。`.nb` 可以理解成 Paddle Lite 专用的旅行装模型：图结构更轻，算子已经按目标硬件做过筛选和融合。

官方 README 给它的定位很清楚：高性能、轻量、可扩展，覆盖 Android、iOS、嵌入式 Linux、Windows、macOS 和 Linux 主机；语言层面有 C++、Java、Python；硬件层面从 ARM CPU、OpenCL、Metal 到多类 NPU 都有适配入口。

## 为什么重要

不理解 Paddle Lite，下面这些事都没法解释：

- 为什么手机上不能直接把训练脚本搬过去跑——训练框架太大，端侧需要只保留推理需要的图、权重和 kernel。
- 为什么同一个模型在 CPU、GPU、NPU 上要先走 `opt`——不同硬件支持的算子和数据布局不同，提前优化才能避免运行时手忙脚乱。
- 为什么 PaddleOCR、PaddleClas 这类项目会单独写 Lite 部署文档——“模型能推理”和“模型能在手机上稳定推理”是两件事。
- 为什么边缘 AI 工程常常卡在库版本、模型格式、算子支持，而不是卡在神经网络原理——端侧部署的难点在工程链路。

## 核心要点

1. **先分析，再执行**：Paddle Lite 把流程拆成 Analysis Phase 和 Execution Phase。类比搬家：先在家里打包、贴标签、扔掉没用的东西，再让货车只负责运输。Analysis Phase 里有 MIR，会做算子融合、计算裁剪、Kernel 优选；Execution Phase 尽量只保留执行模型需要的部分。

2. **`opt` 是端侧入口门卫**：原始 Paddle 模型通常不能直接给移动端 Light API 跑，需要 `opt` 转成 `naive_buffer` 的 `.nb` 文件。类比登机安检：行李不合规就不能上飞机，`valid_targets=arm,opencl` 这种参数就是告诉安检员你要去哪条通道。

3. **硬件适配靠“后备路线”保命**：Paddle Lite 支持 ARM CPU、OpenCL、Metal、NNAdapter 接入的 NPU 等，但不是每个算子都能在每块硬件上跑。类比导航：高速路最快，但某段封路时必须能走国道；工程里常把 `arm` 放在 NPU / GPU 后面做 fallback。

## 实践案例

### 案例 1：Android shell 跑 MobileNet 分类

官方 C++ demo 用 MobileNetV1 演示“转模型、编程序、推到手机、执行”这一条线：

```bash
wget http://paddle-inference-dist.bj.bcebos.com/mobilenet_v1.tar.gz
tar zxf mobilenet_v1.tar.gz
paddle_lite_opt --model_dir=./mobilenet_v1 \
  --optimize_out_type=naive_buffer \
  --valid_targets=arm \
  --optimize_out=./mobilenet_v1_opt

cd inference_lite_lib.android.armv8/demo/cxx/mobile_light
make
adb push mobilenet_v1_opt.nb /data/local/tmp/
adb push mobilenetv1_light_api /data/local/tmp/
adb shell 'cd /data/local/tmp && ./mobilenetv1_light_api --model_dir=mobilenet_v1_opt.nb'
```

**逐部分解释**：

- `mobilenet_v1.tar.gz` 是原始推理模型，还不是端侧最终形态。
- `paddle_lite_opt` 把它转成 `.nb`，并按 `arm` 目标筛掉不合适的执行路径。
- `make` 编译的是手机上运行的 C++ 可执行文件。
- `adb push` 把模型和程序送进手机，最后一行才是真正在手机 CPU 上推理。

### 案例 2：Android App 里用 Java API 推理

Paddle Lite 的 Android demo 里，Java 侧用 `MobileConfig` 创建 predictor：

```java
String modelPath = copyFromAssetsToCache("mobilenet_v1_opt.nb", context);
MobileConfig config = new MobileConfig();
config.setModelFromFile(modelPath);
config.setPowerMode(PowerMode.LITE_POWER_HIGH);
config.setThreads(1);
PaddlePredictor predictor = PaddlePredictor.createPaddlePredictor(config);

Tensor input = predictor.getInput(0);
input.resize(new long[] {1, 3, 224, 224});
input.setData(inputBuffer);
predictor.run();
Tensor output = predictor.getOutput(0);
```

**逐部分解释**：

- `copyFromAssetsToCache` 是 Android 常见套路：模型先放在 assets，运行时复制到可读路径。
- `MobileConfig` 只吃 Lite 模型文件，适合 `.nb` 这种已经被 `opt` 处理过的模型。
- `setPowerMode` 和 `setThreads` 是性能旋钮，决定 CPU 绑核与线程数。
- `input.resize` 必须和模型输入 shape 对上，否则不是结果差，而是直接推理失败。

### 案例 3：PaddleOCR 移动端部署

PaddleOCR 的 Lite 文档把 OCR 模型部署到手机上，典型流程是编译带图像处理和扩展算子的预测库，再转检测、识别模型：

```bash
git clone https://github.com/PaddlePaddle/Paddle-Lite.git
cd Paddle-Lite
git checkout release/v2.10
./lite/tools/build_android.sh --arch=armv8 --with_cv=ON --with_extra=ON

paddle_lite_opt --model_file=./ch_det/model \
  --param_file=./ch_det/params \
  --valid_targets=arm \
  --optimize_out_type=naive_buffer \
  --optimize_out=./ch_det_opt
```

**逐部分解释**：

- `--with_cv=ON` 是为了把图像预处理相关能力编进库里，OCR demo 通常离不开它。
- `--with_extra=ON` 是为了带上更多非基础算子，识别模型常会用到。
- `model_file + param_file` 对应 combined 模型；如果模型是非 combined 形式，应改用 `--model_dir`。
- OCR 不只是一个模型，通常还有检测、方向分类、识别三个阶段，每个阶段都要确认 Lite 是否支持。

## 踩过的坑

1. **`opt` 版本和预测库版本不一致**：老 `opt` 转出的 `.nb` 给新 runtime 跑，可能出现 warning 后再报奇怪算子错误；原因是模型序列化格式和 kernel 注册表随版本变化。

2. **`valid_targets` 不是许愿池**：写了 `rockchip_npu` 或 `opencl` 不代表模型所有算子都能上去；原因是目标硬件只支持一部分算子，缺的部分要靠 CPU fallback 或重训/改模型。

3. **C++/iOS 忘记包含 kernel 注册头**：缺 `paddle_use_ops.h`、`paddle_use_kernels.h` 时可能报 `feed kernel not found`；原因是静态库链接需要显式把用到的 op/kernel 拉进最终二进制。

4. **模型格式参数写错**：非 combined 模型用 `--model_file`，或 combined 模型只给 `--model_dir`，都会让 parser 读错；原因是 Paddle 模型有目录型和双文件型两种保存方式。

## 适用 vs 不适用场景

**适用**：

- 已经在 PaddlePaddle / PaddleOCR / PaddleClas 生态里训练好模型，想部署到 Android、iOS 或嵌入式 Linux。
- 端侧需要小模型、小二进制、低内存，并愿意为目标硬件单独做转换和测试。
- 项目要同时覆盖 ARM CPU、OpenCL、Metal、部分 NPU，且需要 CPU fallback。
- 想用 C++/Java/Python 中比较直接的 API，把模型嵌入现有 App 或设备程序。

**不适用**：

- 模型主要来自 TensorFlow 生态，并且只部署到 MCU；这时 [[tflite-micro]] 更贴近。
- 需要极简 C++ 图像推理库、模型格式比较自由；[[ncnn]] 往往更轻。
- 服务端批量推理、需要 HTTP/gRPC、多模型调度；那是 [[triton-inference-server]] 的地盘。
- 团队完全不使用 Paddle 训练链路，只想“一键吃任意 ONNX”；中间转换和算子兼容会消耗不少时间。

## 历史小故事（可跳过）

- **早期**：Paddle-Mobile 先服务移动端推理，支持 ARM CPU、Mali GPU、Adreno GPU、FPGA、ARM Linux 和 Apple Metal 等方向。
- **后来**：Paddle Lite 作为 Paddle-Mobile 的升级版，把旧能力收进新的架构，强调分析阶段优化和执行阶段轻量部署。
- **2020 前后**：PaddleOCR、PaddleClas 等项目开始系统提供 Lite 移动端教程，`.nb + 预测库 + demo` 成为常见交付形态。
- **2024 年**：GitHub release 页面显示 v2.14-rc，仓库约 7.3k stars，说明它仍是 Paddle 生态端侧部署的重要入口。
- **今天**：它更像“Paddle 模型出海到设备端”的专用通道，而不是一个孤立的通用推理库。

## 学到什么

1. **端侧部署不是把模型复制过去**：真正的工作是模型格式转换、图优化、kernel 裁剪、硬件兼容测试。
2. **`.nb` 是工程边界**：训练侧交出原始推理模型，端侧用 `opt` 生成 `.nb`，两边职责就清楚了。
3. **硬件越多，fallback 越重要**：GPU/NPU 加速看起来漂亮，但 CPU 路径才是稳定性的安全网。
4. **生态比单点性能更关键**：Paddle Lite 最大价值在于和 PaddleOCR、PaddleClas、PaddleDetection 的部署文档与模型格式连在一起。

## 延伸阅读

- 官方仓库：[PaddlePaddle/Paddle-Lite](https://github.com/PaddlePaddle/Paddle-Lite)
- 官方文档：[Paddle Lite 文档](https://www.paddlepaddle.org.cn/lite)
- C++ 示例：[Paddle Lite C++ 完整示例](https://github.com/PaddlePaddle/Paddle-Lite/blob/develop/docs/user_guides/cpp_demo.md)
- 模型转换：[opt 工具说明](https://github.com/PaddlePaddle/Paddle-Lite/blob/develop/docs/user_guides/opt/opt_bin.md)
- [[paddleocr]] —— OCR 移动端部署是 Paddle Lite 最常见的真实用法之一
- [[ncnn]] —— 另一个移动端推理库，对比能看清生态绑定和轻量 C++ 的差异

## 关联

- [[paddleocr]] —— PaddleOCR 的 Android/iOS 部署经常用 Paddle Lite 转 `.nb` 并运行。
- [[ncnn]] —— 都是端侧推理引擎，ncnn 更独立，Paddle Lite 更贴 Paddle 生态。
- [[tflite-micro]] —— MCU 级别推理路径，比 Paddle Lite 更偏微控制器。
- [[tvm]] —— TVM 更像编译器栈，Paddle Lite 更像 Paddle 模型的部署 runtime。
- [[pytorch]] —— 训练和研究常用框架；部署到端侧时要经过额外转换链路。
- [[embedded-hal]] —— 都在处理“抽象硬件差异”的问题，只是一个在 Rust 外设层，一个在 AI 推理层。
- [[zephyr]] —— 嵌入式系统底座；Paddle Lite 则负责在设备上跑神经网络模型。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
