---
title: MicroPython — 在巴掌大的芯片上跑 Python
来源: 'https://github.com/micropython/micropython'
日期: 2026-06-24
分类: 嵌入式
难度: 初级
---

## 是什么

MicroPython 是一个精简的 Python 3 解释器，专门设计来在微控制器（MCU）上运行。日常类比：Python 3 就像一个全功能的豪华大厨房——烤箱、洗碗机、双开门冰箱样样齐全；MicroPython 则是一台房车厨房——灶台、小冰箱、水槽一个不少，但全压缩在一平方米内，靠 256KB Flash 和 16KB RAM 就能跑起来。

你拿一块十几块钱的 ESP32 开发板，刷入 MicroPython 固件，用 USB 线插到电脑上，打开串口终端，就能看到熟悉的 Python REPL（`>>>` 提示符）。在这个提示符里，你输入 `1 + 1` 立刻返回 `2`，输入 `import machine; machine.Pin(2, machine.Pin.OUT).value(1)` 板载 LED 就亮了——不需要编译、不需要链接、不需要等待烧录，交互式开发在指尖发生。

项目 GitHub 地址：<https://github.com/micropython/micropython>（21k stars，MIT 许可证）。

## 为什么重要

传统嵌入式开发像手工雕刻——用 C 写代码，等编译器慢慢编译，再把二进制烧进芯片，改一行可能要等半分钟才能看到效果。MicroPython 改变了这个节奏：

**第一，开发速度飞升**。REPL 让你一行行试，从"想到"到"看到效果"压缩到秒级，对学习和原型验证是质的变化。

**第二，学习门槛断崖式下降**。Python 是大多数初学者的第一门语言，MicroPython 让你用同一套语法直接操控 LED、电机、传感器、WiFi——而不是只在屏幕上打印字符串。

**第三，给"脚本化固件"打开了大门**。过去嵌入式逻辑烧死在 Flash 里，改参数就要重新编译。有了 MicroPython，配置和业务逻辑写成 `.py` 文件存在文件系统，运行时加载、远程更新——IoT 运维从"刷固件"变成"推脚本"。

## 核心要点

MicroPython 的设计可以拆成 **五个关键模块** 来理解：

**1. 编译器（Compiler）**：MicroPython 不是直接解释源码文本，而是先把 `.py` 文件编译成紧凑的字节码（bytecode）。这个编译器本身也跑在芯片上，但因为内存受限，它使用了"多趟扫描 + 极小内存占用"的设计——语法树不会完整构建在内存里，而是边解析边生成字节码。

**2. 虚拟机（VM）**：生成的字节码由一个基于栈的虚拟机执行。这个 VM 跟 CPython 的 VM 结构类似，但每条指令的实现都经过手工优化以减少代码体积（`.text` 段通常 < 100KB）。

**3. 垃圾回收器（GC）**：MicroPython 用了一个简单的**标记-清除**（mark-sweep）GC。没有分代、没有引用计数的日常开销。代价是 GC 触发时会有短暂停顿，但在 MCU 场景下（没有 UI 帧率要求）这完全可以接受。

**4. 硬件抽象（`machine` 模块）**：`machine.Pin`、`machine.I2C`、`machine.SPI`、`machine.PWM` 等类为不同芯片的外设提供统一接口。底层由每个"port"（芯片移植层）实现。

**5. 端口系统（Ports）**：MicroPython 把硬件相关代码隔离在 `ports/` 目录下。每个目录对应一个芯片系列——`ports/esp32`、`ports/stm32`、`ports/rp2`、`ports/nrf`、`ports/unix`、`ports/windows` 等。新增支持一颗芯片，就是在 `ports/` 下新建一个目录，实现启动代码和 `machine` 模块的底层驱动。

## 实践案例

### 案例 1：REPL 里三行点灯

打开串口终端连接到 MicroPython 板子：

```python
>>> from machine import Pin
>>> led = Pin(2, Pin.OUT)   # GPIO2 通常是板载 LED
>>> led.value(1)            # 灯亮
```

不需要创建项目、不需要 `main.py`、不需要任何文件操作。输入即执行，这就是 REPL 的力量。

### 案例 2：文件系统方式——WiFi 读传感器上报

把下面的代码存为板子上的 `main.py`，开机自动执行：

```python
import network, time, urequests
from machine import ADC, Pin

wlan = network.WLAN(network.STA_IF)
wlan.active(True)
wlan.connect('MySSID', 'MyPassword')
while not wlan.isconnected():
    time.sleep(0.5)

# GPIO36 = ADC1_CH0，接外部模拟传感器（不是片内温度计）
sensor = ADC(Pin(36))
while True:
    raw = sensor.read()          # 0..4095
    volt = raw * 3.3 / 4095
    urequests.post('http://my-server/api/adc', json={'volt': volt})
    time.sleep(60)
```

连 WiFi、读外部 ADC、POST 上报——约 15 行。片内温度请用各 port 专用 API（如 ESP32 的 `esp32.raw_temperature()`），不要误用 GPIO ADC。

### 案例 3：用 `mpremote` 工具管理板子

```bash
pip install mpremote              # 安装
mpremote connect /dev/ttyUSB0     # 进入 REPL
mpremote cp main.py :main.py     # 本地文件 → 板子
mpremote exec "import machine; machine.freq()"  # 远程执行
mpremote mount .                  # 挂载本地目录（免反复拷贝）
```

`mpremote` 是官方 CLI 工具，支持文件传输、REPL、本地挂载，比 `ampy` / `rshell` 更现代。

### 源码架构

MicroPython 源码仓库的顶层目录体现分层设计：

```
micropython/
├── py/         # 核心解释器（编译器 + VM + GC + 运行时）
├── mpy-cross/  # 交叉编译器：.py → .mpy
├── ports/      # 各芯片移植层（esp32 / stm32 / rp2 / nrf / unix …）
├── extmod/     # 扩展模块（网络、蓝牙、VFS、JSON 等）
├── lib/        # 第三方 C 库（lwip、mbedtls、tinyusb）
├── drivers/    # 通用设备驱动（显示屏、SD 卡）
└── tests/      # 测试套件（2000+ 脚本）
```

`py/` 是心脏——任何 port 都链接它获得完整解释器能力。最小移植（`ports/minimal/`）只需约 200 行 C。

## 与 CPython 的关键区别

为塞进 MCU，MicroPython 做了大量裁剪：

- **内存**：只用标记-清除 GC（无分代/无日常引用计数）；小整数与短字符串内联，少占堆。
- **标准库**：内置约 20+ 模块（`sys`/`os`/`time`/`json`/`re`/`struct`/`asyncio` 等），远少于 CPython 的 200+；模块名已统一去掉旧 `u` 前缀。
- **类型**：`float` 默认单精度；无 `complex`；任意精度 `int` 默认常关闭。
- **导入**：无 `.pyc`，有 `.mpy`（`mpy-cross`），体积约小 50%。
- **并发**：`asyncio` 协作式；部分 port（如 ESP32）支持 `_thread`。
- **平台**：ESP32、STM32、RP2040/2350、nRF、SAMD、Unix/Windows 等 15+ port，靠 `mpconfigport.h` 在 Flash 与功能间取舍。

## 踩过的坑

1. **内存不够用**：ESP32 用户可用堆通常只有 100-200KB。创建大列表或字符串拼接很容易 `MemoryError`。应对：`gc.collect()` 主动回收，用 `memoryview` 零拷贝。

2. **默认频率不是最高**：ESP32 默认 160MHz，`machine.freq(240_000_000)` 可切到 240MHz，性能敏感场景别忘了。

3. **Flash 写入是阻塞的**：写文件时解释器暂停，WiFi/蓝牙可能丢包。大文件应分块写入。

4. **HTTPS 不验证证书**：默认 `ssl` 不验证服务器证书，生产环境有安全风险，需手动导入 CA 证书。

5. **`import` 搜索路径**：顺序是"冻结模块 → 文件系统"，固件冻结了同名模块时文件系统版本不会被加载。用 `sys.path` 检查。

## 适用 vs 不适用场景

**适用**：

- IoT 原型开发——快速验证传感器方案，几天内从想法到 demo
- 教育场景——教学生用 Python 直接控制硬件，比 C 学习曲线平缓太多
- 脚本化配置——在成熟固件中嵌入 MicroPython 做"用户自定义逻辑"引擎
- 自动化测试夹具——用 Python 脚本驱动测试工装，比写 C 测试快
- WiFi/BLE 数据采集网关——ESP32 + MicroPython 几十行代码就能上报数据

**不适用**：

- 硬实时控制（微秒级响应）——GC 停顿和解释执行的延迟不可预测，需要用 C 或 [[arduino-cli]] 生态
- 极低功耗场景——MicroPython 的 idle 功耗比裸机 C 高，深度睡眠唤醒后重新初始化解释器有额外开销
- Flash < 256KB 的芯片——MicroPython 最小固件约 256KB，低于这个跑不起来
- 需要完整 Python 3 标准库——做数据分析请用 [[cpython]]，MicroPython 没有 `numpy`、`pandas`
- 量产固件追求极致代码体积——解释器本身占 256KB+，纯 C 方案可以把整个固件压到 32KB 以下

## 历史小故事（可跳过）

2013 年底，澳大利亚物理学家 Damien George 在 Kickstarter 众筹——目标 15,000 英镑，最终筹到 97,803 英镑（6.5 倍超额）。他设计了 PyBoard（STM32F405，168MHz Cortex-M4，1MB Flash），配合从零写的解释器，2014 年发货。核心设计决策是**不改 Python 语法**——语法 100% 兼容 CPython 3.4+，学 MicroPython 不是学新语言，而是学用 Python 操作硬件。

2016 年 BBC micro:bit 选用 MicroPython，让全英国数百万中学生第一次在真实硬件上写 Python。2017 年 Adafruit fork 出 [[circuitpython]]，面向更入门的用户。到 2026 年，MicroPython 已是嵌入式 Python 的事实标准。

## 学到什么

1. **"够用的子集"比"完整但跑不动"更有价值**——砍掉约 90% 标准库，却保留日常体验，才能塞进 256KB Flash。
2. **REPL 是学习加速器**——试错成本趋近于零，跟 Jupyter 改变数据科学是同一道理。
3. **"port"模式是跨平台经典范式**——核心不碰硬件，差异封在 port/HAL 层。
4. **GC 权衡因场景而异**——MCU 上优先低内存开销，mark-sweep 换来更小的元数据与代码体积。

## 延伸阅读

- 官方文档：<https://docs.micropython.org/>（API 参考 + 各 port 快速入门）
- `mpremote` 工具：<https://docs.micropython.org/en/latest/reference/mpremote.html>
- Awesome MicroPython：<https://awesome-micropython.com/>（社区库索引）

## 关联

- [[circuitpython]] —— Adafruit 在 MicroPython 基础上 fork 的初学者友好版本，USB 拖文件即用
- [[arduino-cli]] —— Arduino 生态的 CLI 工具，C/C++ 编译式开发，实时性更好
- [[platformio-core]] —— 统一嵌入式构建系统，可以管理 MicroPython 板子的 C/C++ 开发
- [[nuttx]] —— POSIX 兼容实时操作系统，适合 MicroPython 搞不定的硬实时场景
- [[esp-idf]] —— ESP32 官方 C SDK，MicroPython 的 ESP32 port 底层就是基于它构建的
- [[cpython]] —— MicroPython 的"母版"——完整的 Python 3 实现，桌面/服务器用它

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[arduino-cli]] —— Arduino CLI — 用命令行管理 Arduino 开发全流程
- [[circuitpython]] —— CircuitPython — 拖文件就能给芯片写程序的 Python
- [[embedded-hal]] —— embedded-hal — Rust 嵌入式硬件抽象的统一接口
- [[nuttx]] —— Apache NuttX — 把 POSIX 塞进单片机的实时操作系统
- [[platformio-core]] —— PlatformIO Core — 一条命令编译上传任意嵌入式板子
- [[probe-rs]] —— probe-rs — Rust 写的嵌入式调试烧录工具
- [[smoltcp]] —— smoltcp — 在没有操作系统的芯片上跑 TCP/IP

