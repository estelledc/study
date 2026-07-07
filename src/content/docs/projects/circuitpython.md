---
title: CircuitPython — 拖文件就能给芯片写程序的 Python
来源: 'https://github.com/adafruit/circuitpython'
日期: 2026-06-24
分类: 嵌入式
难度: 初级
---

## 是什么

CircuitPython 是 Adafruit 在 MicroPython 基础上 fork 出来的一个 Python 解释器，专门跑在微控制器（单片机）上。日常类比：MicroPython 是一辆可以自己改装的越野车，CircuitPython 是 Adafruit 在这辆车上加了自动挡、倒车影像和一键启动——目标是让完全没碰过嵌入式的初学者也能几分钟内把灯点亮。

核心体验是这样的：把开发板用 USB 线插到电脑上，电脑会弹出一个叫 `CIRCUITPY` 的 U 盘。你在里面新建或编辑一个 `code.py`，保存，板子立刻自动重新加载代码并执行——不需要装编译器、不需要命令行、不需要任何额外软件，一个记事本就够了（官方推荐用 Mu 编辑器）。

CircuitPython 目前支持 400+ 块开发板，覆盖 atmel-samd（SAMD21/51）、espressif（ESP32-S2/S3/C3/C6）、raspberrypi（RP2040/RP2350）、nordic（nRF52840）、stm（STM32F4）等主要芯片端口，另有 litex、mimxrt10xx 等实验性端口。官方和社区维护了 300+ 个设备驱动库，从 NeoPixel 灯带到 BME280 温湿度传感器到电子墨水屏，即插即用。

项目 GitHub 地址：<https://github.com/adafruit/circuitpython>（4.4k stars，MIT 许可证）。

## 为什么重要

传统嵌入式开发对初学者有三道高墙：

第一道是**工具链**。写 Arduino 要装 Arduino IDE，写 ESP-IDF 要装 CMake + Python + 交叉编译器，版本不对就一堆报错。CircuitPython 把这道墙拆了——没有编译步骤，插上 USB 就是一个 U 盘，拖文件进去就行。

第二道是**语言门槛**。C/C++ 的指针、内存管理、头文件对零基础学生来说太陡。CircuitPython 用的是 Python 语法，`import board; import digitalio` 两行就能控制 GPIO，学习曲线从悬崖变成了斜坡。

第三道是**反馈周期**。传统流程是"写代码 → 编译 → 上传 → 运行"，改一行要等几十秒。CircuitPython 的 autoreload 机制让你保存文件的瞬间代码就重新跑起来，反馈周期缩短到 1-2 秒，跟写网页改 CSS 一样快。

这三点加在一起，使 CircuitPython 成了 STEM 教育和创客社区的首选入门方案。Adafruit 的教程生态（Learn System）有数百篇配套指南，从"第一次点亮 LED"到"用 ESP32-S3 做 USB MIDI 控制器"都有手把手教程。

## 核心要点

CircuitPython 的设计可以拆成**四个关键决策**来理解：

**决策 1：USB 自动挂载为大容量存储设备（MSC）**。板子插上电脑后表现得跟 U 盘一模一样，出现 `CIRCUITPY` 盘符。你把 `.py` 文件拖进去就等于"上传代码"。这个设计省掉了所有烧录工具（esptool、avrdude、openocd），代价是需要芯片原生支持 USB——所以 CircuitPython 优先支持有原生 USB 的芯片（SAMD21/51、nRF52840、RP2040、ESP32-S2/S3）。对于没有原生 USB 的板子（如部分 ESP32-C3），则通过 BLE 或 WiFi 提供文件访问。

**决策 2：autoreload——保存即运行**。CircuitPython 内置文件系统监听，检测到 `code.py`（或 `main.py`）被修改后自动重启虚拟机并执行新代码。类比：你在 Word 里改了一段话，按 Ctrl+S 的瞬间打印机就自动帮你打出来。这个机制大幅缩短了"改代码 → 看效果"的循环。

**决策 3：统一硬件 API，严格 CPython 子集**。CircuitPython 定义了一套跨芯片的统一 API——`board`（引脚定义）、`digitalio`（GPIO）、`analogio`（ADC）、`busio`（I2C/SPI/UART）、`neopixel`（WS2812 灯带）等。不管你用的是 SAMD21 还是 ESP32-S3，同一份 `code.py` 都能跑。而且标准库模块（`time`、`os`、`random`）是 CPython 的严格子集——在 CircuitPython 上能跑的代码，拿到电脑上的 Python 3 里也能跑（反过来不一定）。

**决策 4：安全模式（Safe Mode）**。如果你的代码导致板子崩溃（比如无限循环烧满 CPU），CircuitPython 会在重启时进入安全模式——LED 闪三下黄灯，`CIRCUITPY` 盘符照常挂载但不执行用户代码。这让你永远有机会修改或删除出问题的文件，不会"变砖"。

## 实践案例

### 案例 1：三行代码点亮板载 LED

```python
import board
import digitalio

led = digitalio.DigitalInOut(board.LED)
led.direction = digitalio.Direction.OUTPUT
led.value = True  # 灯亮了
```

把这段代码存到 `CIRCUITPY` 盘的 `code.py`，保存，LED 立刻亮起。改 `True` 为 `False`，保存，灯灭。整个过程不到 30 秒。

### 案例 2：LED 呼吸灯 + NeoPixel 彩虹

```python
import time
import board
import neopixel

pixels = neopixel.NeoPixel(board.NEOPIXEL, 10, brightness=0.3)

def wheel(pos):
    """把 0-255 映射为 RGB 彩虹色"""
    if pos < 85:
        return (255 - pos * 3, pos * 3, 0)
    elif pos < 170:
        pos -= 85
        return (0, 255 - pos * 3, pos * 3)
    else:
        pos -= 170
        return (pos * 3, 0, 255 - pos * 3)

while True:
    for j in range(256):
        for i in range(10):
            pixels[i] = wheel((i * 256 // 10 + j) & 255)
        pixels.show()
        time.sleep(0.02)
```

10 颗 NeoPixel 灯珠循环显示彩虹色。驱动库通过 `import neopixel` 直接导入，不需要手动安装——CircuitPython 固件内置了最常用的驱动。

### 案例 3：读取温湿度传感器并通过串口打印

```python
import time
import board
import adafruit_bme280.basic as bme280

i2c = board.I2C()
sensor = bme280.Adafruit_BME280_I2C(i2c)

while True:
    print(f"温度: {sensor.temperature:.1f} C")
    print(f"湿度: {sensor.humidity:.1f} %")
    print(f"气压: {sensor.pressure:.1f} hPa")
    time.sleep(2)
```

这里用了 Adafruit 官方库 `adafruit_bme280`。库的安装方式也是拖文件——从 CircuitPython Library Bundle 下载 `.mpy` 文件，放到 `CIRCUITPY/lib/` 目录。

## 与 MicroPython 的关键区别

CircuitPython 从 MicroPython fork 而来，但做了大量取舍：

**USB 优先**。MicroPython 默认通过串口 REPL 交互，CircuitPython 默认把板子变成 U 盘，初学者友好度领先，但不支持原生 USB 的芯片（如经典 ESP32）功能受限。

**API 统一 vs 芯片特化**。MicroPython 的 `machine` 模块暴露底层硬件细节，CircuitPython 用 `board` + `digitalio` + `busio` 统一抽象，代价是无法用某些芯片特有功能。

**并发模型**。MicroPython 支持 `_thread` 多线程和中断回调，CircuitPython 禁用了线程和中断，部分板子支持 `async/await` 协作式多任务。

**模块命名与错误信息**。MicroPython 有 `uos`、`utime` 等带前缀的别名，CircuitPython 直接用 `os`、`time`、`random`，与 CPython 一致。另外错误信息被翻译成 10+ 种语言（含中文）。

**启动流程**。启动顺序是确定的：`boot.py`（可选，USB 前执行，输出写 `boot_out.txt`）→ `code.py`（主程序，也可叫 `main.py`）→ REPL（虚拟机完全重置）。文件变化后 autoreload 自动重跑，崩溃后进入安全模式（`safemode.py` 可编程处理）。

## 踩过的坑

1. **Flash 空间不够装库**：SAMD21（M0）芯片只有 256KB Flash，CircuitPython 固件本身就占了大部分。如果你导入太多库，会报 `MemoryError`。解决办法是用 `.mpy` 预编译格式的库（比 `.py` 源文件小 50%+），或者换 Flash 更大的板子（SAMD51 / ESP32-S3 / RP2040）。

2. **USB 驱动没识别**：Windows 7 等旧系统可能不识别 CircuitPython USB 设备，需手动装驱动。macOS / Linux 通常即插即用。

3. **`code.py` 和 `main.py` 同时存在**：CircuitPython 只执行优先级最高的那个（`code.py` > `code.txt` > `main.py` > `main.txt`），新手常不知道自己编辑的不是正在运行的文件。

4. **REPL 里改的东西重启后丢失**：autoreload 或 Ctrl+D 后 REPL 状态全部清零，需要持久化的必须写进文件。

5. **WiFi 连接后内存不足**：ESP32-S2 连接 WiFi 后可用内存骤减，做网络项目时要注意内存预算。

## 适用 vs 不适用场景

**适用**：

- STEM 教育和创客入门——零编程基础也能上手，不需要理解编译、链接、烧录
- 快速原型验证——想试试传感器能不能读、灯带效果对不对，几分钟就能搞定
- USB 外设开发——CircuitPython 内置 USB HID（键盘鼠标）、MIDI、串口模拟，做自定义控制器很方便
- 需要大量 Adafruit 硬件驱动的项目——300+ 官方库即拖即用

**不适用**：

- 实时性要求高的场景——CircuitPython 是解释执行，响应延迟在毫秒级，做不了微秒级的电机控制
- 多线程 / 中断驱动的复杂固件——CircuitPython 禁用了线程和中断，需要这些功能请用 [[micropython]] 或 C/C++
- Flash / RAM 极度受限的芯片——低于 256KB Flash 的芯片跑不了 CircuitPython
- 需要深度定制芯片外设的项目——CircuitPython 的统一 API 隐藏了底层寄存器，需要直接操作寄存器请用 [[esp-idf]] 或 [[nuttx]]
- 生产级固件——CircuitPython 面向教学和原型，不适合做需要 OTA 升级、看门狗、低功耗深度优化的量产产品

## 历史小故事（可跳过）

2013 年，Damien George 在 Kickstarter 上众筹了 MicroPython——把 Python 3 塞进微控制器。2017 年，Adafruit 的 Scott Shawcroft 觉得 MicroPython 对初学者还不够友好（API 不统一、USB 支持不完善），于是 fork 出 CircuitPython，核心改动就两件事：让板子插上就变 U 盘，统一所有芯片的硬件 API。

"拖文件编程"的灵感来自 BBC micro:bit——英国给中学生免费发的编程教育板，也是拖文件到 U 盘烧录。CircuitPython 把这个理念从"拖编译好的固件"推进到"拖 Python 源码"。到 2026 年，CircuitPython 已支持 400+ 块板子，社区每周三有 Discord"Show and Tell"活动，Adafruit Learn System 上有上千篇配套教程。

## 学到什么

1. **"拖文件就能跑"不是玩具，是设计哲学**——通过把芯片伪装成 U 盘，CircuitPython 把"烧录"这个概念从用户的心智模型里彻底删除了。好的工具设计是让用户不需要知道底层在做什么。

2. **fork 不是简单复制，是价值主张的分裂**——CircuitPython 和 MicroPython 共享 90% 的代码，但 10% 的差异（USB 自动挂载、统一 API、禁用线程）定义了完全不同的用户群体。

3. **"严格子集"策略降低迁移成本**——CircuitPython 的标准库是 CPython 的子集，学会了 CircuitPython 换到桌面 Python 不用重新学。

4. **安全模式是教学场景的刚需**——初学者写死循环是必然事件，安全模式确保板子永远不会"变砖"，这比任何文档警告都有效。

## 延伸阅读

- 官方文档：<https://docs.circuitpython.org/>（API 参考 + 移植指南）
- 入门教程：<https://learn.adafruit.com/welcome-to-circuitpython>
- 官方库合集：<https://circuitpython.org/libraries>（300+ 设备驱动）
- Awesome CircuitPython：<https://github.com/adafruit/awesome-circuitpython>
- Mu 编辑器：<https://codewith.mu/>

## 关联

- [[micropython]] —— CircuitPython 的上游项目，功能更完整但对初学者更陡
- [[arduino-cli]] —— Arduino 生态的 CLI 工具，C/C++ 路线，编译式开发
- [[platformio-core]] —— 统一嵌入式构建系统，支持 CircuitPython 板子的 C/C++ 开发
- [[nuttx]] —— 实时操作系统，CircuitPython 不适用的场景（实时性 / 多线程）它擅长
- [[esp-idf]] —— ESP32 官方 SDK，需要深度定制 ESP 芯片外设时用它

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[embedded-hal]] —— embedded-hal — Rust 嵌入式硬件抽象的统一接口
- [[micropython]] —— MicroPython — 在巴掌大的芯片上跑 Python
- [[probe-rs]] —— probe-rs — Rust 写的嵌入式调试烧录工具

