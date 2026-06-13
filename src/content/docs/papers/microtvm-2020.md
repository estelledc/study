---
title: microTVM — 把 TVM 编译器搬到微控制器上的 bare-metal ML 栈（学习笔记）
来源: https://tvm.apache.org/docs/topic/microtvm/index.html
日期: 2026-06-13
分类: 操作系统
子分类: 嵌入式与 IoT
provenance: pipeline-v3
---

## 先想成什么事

想象你在一家**连锁烘焙店**总部，要把同一套「识别面包是否烤焦」的神经网络，部署到全球几千家**只有一口小烤箱、没有后厨经理**的街边档口：

- 每家档口的**灶台型号**不同（Cortex-M3/M4/M7、RISC-V、有无 FPU、Flash 只有 512 KB～2 MB）。
- 档口**不能运行时打电话要内存**——没有 `malloc`，常常没有完整操作系统，只有裸机或轻量 RTOS。
- 但总部希望**不只靠解释器逐层放映**，而是像专业中央厨房一样：**提前把菜谱编译成可直接下锅的半成品**，还能针对每家店的烤箱做**自动调参**（autotuning）。

**microTVM** 就是 Apache TVM 为这种场景做的扩展：在**只依赖 C 标准库**的 bare-metal 设备上，把 Relay/TFLite 等前端模型**编译成 C 源码或目标文件**，配合极简 **C Runtime（CRT）** 和 **Project API** 生成可烧录固件；同时可在设备上跑 **TVM RPC 服务**，让主机端驱动推理或自动调优。

它与 [TensorFlow Lite Micro](./tflite-micro-2021.md) 解决同一类 TinyML 问题，但路线不同：TFLM 强调**解释器 + FlatBuffer**；microTVM 强调**编译器优化 + 代码生成 + TVM 全栈复用**（AutoTVM / Meta Schedule、CMSIS-NN 等 BYOC 内核）。

## microTVM 到底是什么

根据 [官方文档](https://tvm.apache.org/docs/topic/microtvm/index.html)，microTVM 由三块能力组成：

| 组件 | 作用 |
|------|------|
| **编译器扩展** | 让 `tvm.relay.build` 能针对 `tvm.target.micro(...)` 生成可在 MCU 上链接的 C/LLVM 产物 |
| **设备端 RPC** | 在板子上跑精简 TVM RPC server，主机通过 UART 等通道下发算子、做 autotuning |
| **CRT 运行时** | 极简 C 运行时（`Runtime("crt")`），替代桌面 TVM 常用的动态 C++ Runtime |

典型工作流（与官方 workflow 图一致）可记成：

```
训练/导出模型 (TFLite / ONNX / PyTorch→Relay)
    → Relay 前端 + 量化/剪枝
    → relay.build(target=micro, runtime=crt, executor=aot|graph)
    → Model Library Format (MLF) 目录/压缩包
    → Project API 套入 Zephyr / Arduino / CRT 模板工程
    → 交叉编译 + 烧录
    → Host-Driven（主机 Graph/AOT Executor 经 RPC 驱动）或 Standalone（设备自包含推理）
```

## 为什么需要 microTVM

MCU 上的 ML 部署有三条常见路线，microTVM 站在「**编译器派**」：

| 路线 | 代表 | 强项 | 弱项 |
|------|------|------|------|
| 解释器 | TFLite Micro | 换模型常只需换 Flash 里的数组 | 优化深度受解释调度限制 |
| 厂商 SDK | CMSIS-NN 手写调用 | 单算子极快 | 整图手工拼接成本高 |
| **编译器** | **microTVM** | 整图融合、调度搜索、多前端 | 工具链与板级集成更复杂 |

microTVM 的价值在于：**复用 TVM 在服务器/GPU 上验证过的编译与调优基础设施**，把「为这颗 STM32 手写卷积循环」变成「声明 target + 跑 build + 选 executor」。

## 核心概念

### 1. Micro Target

`TARGET = tvm.target.target.micro("host")` 可在 x86 上用 CRT **模拟** MCU 环境；真板子则传入板级 model 字符串，例如 Zephyr 的 `nucleo_f746zg`：

```python
import tvm

# 主机仿真：不连硬件也能跑通 pipeline
TARGET_HOST = tvm.target.target.micro("host")

# 物理板：从 boards.json 读取 SoC 描述（Zephyr 模板）
# TARGET = tvm.target.target.micro(boards["nucleo_l4r5zi"]["model"])
```

Target 告诉编译器：可用内存、是否禁用向量指令、交叉编译器前缀等——**同一 Relay 图，换 target 就换「为哪家烤箱写的菜谱」**。

### 2. CRT Runtime 与 Executor 选择

microTVM **应使用 C Runtime**，不要用桌面默认的 C++ Runtime：

| 选项 | 含义 | 适用场景 |
|------|------|----------|
| `Runtime("crt", {"system-lib": True})` | 静态链接、函数注册表在编译期确定 | 几乎所有 microTVM 部署 |
| `Executor("aot")` | Ahead-of-Time：图编译成单个 `run()`，**预先规划内存** | 部署首选；比 Graph 少运行时解析 JSON |
| `Executor("graph", {"link-params": True})` | 保留 `graph.json`，由 GraphExecutor 调度 | Host-Driven 实验、与 AutoTVM 集成 |

设计文档指出：**GraphExecutor 的 Standalone 模式内存效率一般**；生产更推荐 **AOT + 预分配 workspace**。

常见 Pass 配置（MCU 无 SIMD 时要关向量化）：

```python
with tvm.transform.PassContext(opt_level=3, config={"tir.disable_vectorize": True}):
    module = tvm.relay.build(
        relay_mod,
        target=TARGET,
        params=params,
        runtime=RUNTIME,
        executor=EXECUTOR,
    )
```

### 3. Model Library Format (MLF)

`relay.build` 返回的 `(graph_json, lib, params)` 三元组会被打包成 **MLF** 标准目录，便于 CI 与 Project API 消费。典型结构包括：

- `codegen/target/src/*.c` — 算子与元数据 C 源码
- `parameters/*.params` — Relay 权重
- `runtime-config/aot/` 或 `graph/graph.json` — 执行器配置
- `metadata.json` — 目标、runtime、外部依赖（如 standalone CRT 头文件列表）

MLF 是「**中央厨房出库的半成品箱**」：不关心你最后用的是 Zephyr 还是 Arduino，箱内格式统一。

### 4. Host-Driven vs Standalone

| 模式 | 推理控制端 | 固件内含 | 典型用途 |
|------|------------|----------|----------|
| **Host-Driven** | 主机上的 Graph/AOT Executor | CRT + RPC Server | 开发调试、AutoTVM 调优、快速迭代 |
| **Standalone** | 设备 `main()` 直接调 `run()` | CRT + 编译进设备的执行逻辑 | 量产后脱机运行 |

Host-Driven 时，主机通过 UART/USB 发 RPC：**「把这块输入 tensor 拷进去，跑第 7 号算子」**——设备像远程协处理器。Standalone 则把 AOT 生成的 `run()` 和权重全部链进 Flash，上电即推理。

### 5. Project API 与模板工程

裸 `relay.build` 产物还不能直接烧录。microTVM 用 **Project API** 把 MLF 注入平台模板：

- `crt` / `host` — x86 仿真
- `zephyr` — STM32、nRF 等 Zephyr 板
- `arduino` — Nano 33 BLE 等

模板根目录有 `microtvm_api_server.py`，负责 `generate_project` → `build` → `flash` → 暴露 `transport()` 给 `tvm.micro.Session`。

### 6. TVMC Micro 命令行

不想写 Python 时，可用 **TVMC Micro** 一条龙（需先 `tvmc compile` 出 MLF）：

```bash
# 生成 Zephyr 工程
tvmc micro create project mlf.tar zephyr \
  --project-option zephyr_board=qemu_x86

# 编译固件
tvmc micro build project zephyr --project-option zephyr_board=qemu_x86

# 烧录后在主机侧跑推理
tvmc run --device micro project/model.tar --device-key micro0
```

适合 CI 里「编译 → 仿真板跑 golden」的流水线。

## 代码示例一：TFLite → Relay → AOT → Host-Driven 推理

下列流程浓缩自官方 [microTVM Host-Driven AoT](https://tvm.apache.org/docs/how_to/work_with_microtvm/micro_aot.html) 教程：在 `host` target 上用 CRT 跑通，再换板级 target 即可迁移。

```python
import json
import pathlib
import numpy as np
import tvm
from tvm import relay
from tvm.relay.backend import Executor, Runtime

# 1. 导入 TFLite（也可用 ONNX / PyTorch）
tflite_model = open("mobilenet_v1_0.25_128_quant.tflite", "rb").read()
shape_dict = {"input": [1, 128, 128, 3]}
relay_mod, params = relay.frontend.from_tflite(tflite_model, shape_dict=shape_dict)

# 2. micro target + CRT + AOT
TARGET = tvm.target.target.micro("host")
RUNTIME = Runtime("crt", {"system-lib": True})
EXECUTOR = Executor("aot")

with tvm.transform.PassContext(opt_level=3, config={"tir.disable_vectorize": True}):
    module = tvm.relay.build(
        relay_mod, target=TARGET, params=params, runtime=RUNTIME, executor=EXECUTOR
    )

# 3. 用 Project API 生成可构建工程
template = pathlib.Path(tvm.micro.get_microtvm_template_projects("crt"))
project_dir = pathlib.Path("/tmp/microtvm_aot_project")
project = tvm.micro.generate_project(
    template,
    module,
    project_dir,
    {"project_type": "host_driven"},
)

# 4. 构建并通过 Session 跑 AOT Executor
project.build()
with tvm.micro.Session(project.transport()) as session:
    aot = tvm.runtime.executor.aot_executor.AotModule(session.create_aot_executor())
    sample = np.load("sample_input.npy")
    aot.get_input("input").copyfrom(sample)
    aot.run()
    logits = aot.get_output(0).numpy()
    print("predicted class:", int(np.argmax(logits)))
```

要点：**AOT 不在运行时解析 graph.json**，workspace 在编译期规划，适合 RAM 紧张的 MCU。

## 代码示例二：Graph Executor + Zephyr 物理板

Host-Driven Graph 模式更接近「主机当导演、设备当演员」，与 AutoTVM 历史集成最深。下面展示 Session + `create_local_graph_executor` 形态（摘自 [TFLite microTVM 教程](https://tvm.apache.org/docs/how_to/work_with_microtvm/micro_tflite.html) 思路）：

```python
import numpy as np
import tvm
from tvm import relay
from tvm.relay.backend import Executor, Runtime

# 极简 sin 回归模型（MCU 友好）
def build_sin_model():
    x = relay.var("input", shape=(1,), dtype="float32")
    y = relay.nn.dense(relay.reshape(x, (1, 1)), relay.const(np.zeros((1, 8), "float32")))
    y = relay.nn.relu(y)
    y = relay.nn.dense(y, relay.const(np.zeros((8, 1), "float32")))
    mod = tvm.IRModule.from_expr(relay.Function([x], y))
    params = {}  # 实际应加载训练权重
    return mod, params

relay_mod, params = build_sin_model()
TARGET = tvm.target.target.micro("nucleo_f746zg")  # Zephyr 板级 model
RUNTIME = Runtime("crt", {"system-lib": True})
EXECUTOR = Executor("graph", {"link-params": True})

with tvm.transform.PassContext(opt_level=3, config={"tir.disable_vectorize": True}):
    module = tvm.relay.build(
        relay_mod, target=TARGET, params=params, runtime=RUNTIME, executor=EXECUTOR
    )

import pathlib
zephyr_tpl = pathlib.Path(tvm.micro.get_microtvm_template_projects("zephyr"))
project = tvm.micro.generate_project(
    zephyr_tpl,
    module,
    pathlib.Path("/tmp/zephyr_sin"),
    {"project_type": "host_driven", "zephyr_board": "nucleo_f746zg"},
)
project.build()
project.flash()

with tvm.micro.Session(project.transport()) as session:
    graph_mod = tvm.micro.create_local_graph_executor(
        module.get_graph_json(),
        session.get_system_lib(),
        session.device,
    )
    graph_mod.set_input(**module.get_params())
    graph_mod.set_input("input", tvm.nd.array(np.array([0.5], dtype="float32")))
    graph_mod.run()
    print("sin(0.5) ≈", graph_mod.get_output(0).numpy())
```

`create_local_graph_executor` 的「local」指图调度在**主机**，重算子在**设备**执行——调试时可在 PC 上打断点看 RPC 轨迹。

## 自动调优与 CMSIS-NN

microTVM 一大差异化能力是 **AutoTVM / Meta Schedule**：在真实板子（或 QEMU）上测量算子耗时，搜索 tile size、unroll 等 schedule。

- 设备端跑 RPC server，主机发 `tvm.contrib.autotvm` 测量任务。
- 对 Arm Cortex-M，可启用 **CMSIS-NN BYOC**，让特定算子落到 hand-tuned 汇编内核，再由 TVM 做图级融合。

这与「只换 `.tflite` 数组」的 TFLM 不同：**同一模型可针对每块板重新调 schedule**，代价是离线调优时间更长。

## 支持硬件与开发环境

官方 CI 主要覆盖 **Cortex-M + Zephyr RTOS**，但不限于 Zephyr，也面向 **RISC-V** 等架构。文档列出的参考板包括：

- STM32 Nucleo-F746ZG / STM32F746 Discovery
- nRF5340 DK

无物理板时可：

1. 用 `target.micro("host")` + CRT 在 x86 仿真；
2. 用 Zephyr `qemu_x86` / `qemu_cortex_m3` 目标；
3. 用 **microTVM Reference VM**（Vagrant）预装 Zephyr 依赖，复现 bug 与教程。

构建 TVM 时需打开 CMake 选项（示例）：

```cmake
set(USE_MICRO ON)
set(USE_MICRO_STANDALONE_RUNTIME ON)
```

## microTVM vs TFLite Micro：怎么选

| 维度 | microTVM | TFLite Micro |
|------|----------|--------------|
| 模型入口 | Relay 多前端（TFLite/ONNX/PyTorch…） | 主要 `.tflite` |
| 执行模型 | AOT/Graph 编译 + CRT | 解释器 + FlatBuffer |
| 调优 | AutoTVM/Meta Schedule + BYOC | 厂商内核替换（如 CMSIS-NN） |
| 上手曲线 | 陡（需懂 TVM target/MLF/Project API） | 平缓（MicroInterpreter API 固定） |
| 生态成熟度 | 持续演进，API 变动需跟版本 | 产品化案例多（Google/Arm 文档全） |

实践上常见组合：**训练导出 TFLite → TVM 导入 Relay → microTVM 编译 + CMSIS-NN**，兼得 TFLite 工具链与 TVM 调度优势。

## 常见坑与排错

1. **忘记 `tir.disable_vectorize`**：Cortex-M 无 NEON 时向量化可能生成非法指令或更大代码体积。
2. **Runtime 用错**：micro 上误用默认 C++ Runtime 会导致链接失败或体积暴涨。
3. **Arena / workspace 不足**：AOT metadata 会声明 workspace 大小；Standalone 需在 `main.c` 里分配足够 `uint8_t workspace[]`。
4. **Zephyr 版本不匹配**：社区示例常钉死某分支（如 2.7），升级前查 TVM 发行说明。
5. **Host-Driven 串口权限**：Linux 上需将用户加入 `dialout`，VM 需 USB passthrough（Reference VM 文档强调）。

## 延伸阅读

- [microTVM 主题页](https://tvm.apache.org/docs/topic/microtvm/index.html) — 总览与教程索引
- [microTVM Design Document](https://tvm.apache.org/docs/arch/microtvm_design.html) — Host-Driven / Standalone 固件组成
- [Model Library Format RFC](https://discuss.tvm.apache.org/t/rfc-tvm-model-library-format/9121) — MLF 目录规范
- [microTVM TFLite 教程](https://tvm.apache.org/docs/how_to/work_with_microtvm/micro_tflite.html)
- [TVMC Micro CLI](https://tvm.apache.org/docs/how_to/work_with_microtvm/micro_tvmc.html)
- 对比阅读：[TensorFlow Lite Micro 论文笔记](./tflite-micro-2021.md)、[Zephyr RTOS 概览](./zephyr-rtos-overview.md)

## 一句话总结

**microTVM = 在「只有 C 库、没有 OS」的 MCU 上，用 TVM 编译器把神经网络变成可烧录的 C 固件，并可选地通过 RPC 做主机驱动推理与自动调优**——它不是又一个小解释器，而是把「编译 + 调优」那套服务器级能力，压缩进 TinyML 的厨房流水线里。
