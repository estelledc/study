---
title: MicroPython — 在 MCU 上跑 Python 3 的精简实现
来源: 'https://github.com/micropython/micropython'
日期: 2026-06-06
分类: 操作系统
子分类: 嵌入式
难度: 初级
---

## 是什么

MicroPython 是 **Damien George 发起的 Python 3 精简实现**，专门跑在微控制器、嵌入式 Linux 等资源受限平台上。它的核心承诺是：在只有 **256KB Flash + 16KB RAM** 的芯片上，也能打开串口 REPL、写 `while True` 循环、用 `import` 驱动 GPIO——就像你在 PC 上写 Python，只是内存和库都小得多。

日常类比：标准 Python（CPython）像开 SUV——功能全、空间大、油耗高；MicroPython 像开电动滑板——只保留「前进、转向、刹车」三样，但能在窄巷子里灵活穿梭。你写的语法还是 Python 3，但标准库里很多「豪华配置」被拆掉了。

具体说，你拿到一块支持 MicroPython 的开发板（比如 Raspberry Pi Pico 或 ESP32），刷入固件后：

1. USB 串口出现 REPL 提示符 `>>>`
2. 输入 `import machine` 就能访问硬件引脚
3. 把脚本存成 `main.py`，上电自动运行
4. 用 `mpy-cross` 把 `.py` 预编译成 `.mpy`，可节省 40–60% 内存

**REPL + GC + 硬件 API 全塞进几百 KB Flash**，这是 MicroPython 与「在 PC 上远程控制 Arduino」的本质区别——Python 解释器本身就在芯片里。

## 为什么重要

不理解 MicroPython，下面这些事都没法解释：

- 为什么 Raspberry Pi Pico 出厂固件就是 MicroPython——RP2040 port 是 Tier 1 官方维护，文档与 CI 完整
- 为什么 `import json` 在 ESP8266 上可能失败——MicroPython 只实现标准库子集，各 port 差异写在 Quick Reference 里
- 为什么 CircuitPython 能从 MicroPython fork 出来——两者共享同一套 VM 思路，但 MicroPython 更偏「通用移植 + 多平台」，CircuitPython 更偏「Adafruit 板子开箱即用」
- 为什么嵌入式 Python 项目常提 `mpy-cross`——在 RAM 只有几十 KB 的板上，预编译字节码是避免 `MemoryError` 的常规手段

## 核心要点

MicroPython 的设计可以拆成 **三块**：

1. **精简 Python VM + 增量 GC**：`py/` 目录实现编译器、运行时与核心库；垃圾回收针对小 RAM 优化，避免 CPython 那种大堆假设。类比：CPython 的 GC 像城市环卫系统（规模大、延迟可接受）；MicroPython 的 GC 像随身垃圾袋——随时清、容量小，但塞满就会 `MemoryError`。

2. **ports/ 分层移植**：每个 MCU 家族（ESP32、STM32、RP2040…）有独立 port，共用 VM 核心、替换底层 HAL。`machine` 模块提供 Pin、I2C、SPI、PWM 等统一 API，但引脚编号规则因芯片而异——跨板移植必须查对应 Quick Reference。

3. **mpy-cross 预编译 + frozen 模块**：`mpy-cross` 把 `.py` 编译成 `.mpy` 字节码，体积更小、import 更快；还可把模块「冻结」进固件，上电无需文件系统。类比：`.py` 是带注释的源码 `.mpy` 是压缩包，frozen 是直接焊死在芯片里的 ROM 程序。

## 实践案例

### 案例 1：RP2040 点灯（最小 GPIO 闭环）

Raspberry Pi Pico 默认固件即 MicroPython：

```python
from machine import Pin
import time

led = Pin(25, Pin.OUT)  # Pico 板载 LED 接 GP25

while True:
    led.value(1)
    time.sleep(0.5)
    led.value(0)
    time.sleep(0.5)
```

把代码存为 `main.py` 或通过 REPL 粘贴运行：

- `Pin(25, Pin.OUT)` 把 GP25 设为输出模式，不需要记寄存器地址
- `led.value(1/0)` 直接拉高/拉低，比 Arduino 的 `digitalWrite` 更 Pythonic
- 修改 `time.sleep` 参数 → 保存 → 软复位后立即看到闪烁频率变化

这个案例展示了「Python 语法 → 物理引脚」的最短路径，全程无需 C 工具链。

### 案例 2：ESP32 读 I2C 温湿度传感器

用 `machine.I2C` 读 BME280（需先 `pip install` 到 PC 再复制库，或使用内置驱动）：

```python
from machine import Pin, I2C
import time

i2c = I2C(0, scl=Pin(22), sda=Pin(21), freq=400000)
# BME280 默认地址 0x76 或 0x77，需对应传感器库
# 此处示意：扫描总线上设备
devices = i2c.scan()
print("I2C devices:", [hex(d) for d in devices])

while True:
    # 实际项目用 bme280 库: temp, press, hum = bme.read_compensated_data()
    print("scan ok, waiting...")
    time.sleep(2)
```

**逐部分解释**：

- `I2C(0, scl=..., sda=...)` 指定 ESP32 的 I2C 总线 0 与引脚——**ESP32 与 STM32 引脚号不同**，不能照搬 Pico 案例
- `i2c.scan()` 返回总线上所有从设备地址，排线错误时列表为空，是常用调试手段
- 传感器读数通常封装成第三方 `.py` 或 `.mpy` 库，放到 `lib/` 目录即可 import

这个案例说明 MicroPython 的硬件抽象：**同一套 `machine.I2C` API，不同 port 只换引脚号**。

### 案例 3：mpy-cross 预编译省内存

板子 RAM 紧张时，把大型模块预编译：

```bash
# 在 PC 上安装 mpy-cross（与固件版本匹配很重要）
mpy-cross -o sensor.mpy sensor.py
# 把 sensor.mpy 复制到开发板 lib/ 目录
```

开发板上：

```python
import sensor  # 加载 .mpy 而非 .py，占用更少 RAM
sensor.read()
```

**关键点**：

- `mpy-cross` 版本必须与板载 MicroPython 固件版本一致，否则 import 报错或行为异常
- `.mpy` 不含源码注释与 docstring，调试时仍保留 `.py` 在 PC 上
- 多个大模块都预编译后，`import` 链路的峰值内存明显下降，是生产原型常见优化

## 踩过的坑

1. **标准库子集导致 CPython 代码直接报错**：`import asyncio` 仅在部分 port 可用；`json` 在极小固件上可能缺失。从 PC 复制脚本前应先查 [docs.micropython.org](https://docs.micropython.org) 对应 port 的模块列表。

2. **MemoryError 与内存碎片**：在 16–128KB RAM 上频繁 `+` 拼接字符串或 append 大 list 会 OOM；应用 `uarray`、`bytearray` 或预分配 buffer，并把重型库编译成 `.mpy`。

3. **REPL 与 main.py 执行环境隔离**：`main.py` 跑完后软复位，REPL 里找不到 main 里定义的变量——这是两个独立 VM 生命周期，不是 bug。

4. **跨 port 引脚与 API 差异**：`machine.Pin` 在 ESP32 用 GPIO 编号，在 Pico 用 GP 编号；WiFi 仅部分 port 支持。换板子时必须重读 Quick Reference，不能假设「上次能跑这次也能跑」。

## 适用 vs 不适用场景

**适用**：

- 需要在 MCU 上用 Python 语法快速验证硬件逻辑（传感器、电机、简单协议）
- 教育场景：学生已会 Python，想直接控制 LED / 按钮而不用学 C 工具链
- 多平台原型：同一套脚本逻辑在 Unix port 上调试，再部署到 ESP32 / RP2040
- 资源中等（≥512KB Flash + 128KB RAM）且可接受非硬实时的项目
- 需要官方 20+ port 与活跃社区（GitHub Discussions、Discord）的长期维护项目

**不适用**：

- 硬实时控制（毫秒级确定性延迟）—— GC 与解释执行有抖动，应改用裸机 C 或 RTOS
- 需要完整 CPython 标准库（pandas、requests 全功能）——应跑在 Linux 上用 CPython
- 超低功耗待机（微安级）——解释器与 GC 开销远高于睡眠态 C 固件
- 安全关键固件（医疗、航空）——动态语言与 GC 增加认证难度
- 已有成熟 CircuitPython 生态的 Adafruit 板子——若需要「U 盘保存即重载」，CircuitPython 体验更顺滑（见 [[circuitpython]]）

## 历史小故事（可跳过）

- **2013 年**：Damien George 在 Kickstarter 众筹 pyboard，目标是在 STM32 上跑完整 Python 3 语法
- **2014 年**：MicroPython 1.0 发布，开源 MIT 协议，证明 MCU 上可以跑 REPL + GC
- **2016 年**：ESP8266 port 出现，把成本压到几美元的 WiFi 芯片也能跑 Python
- **2017 年**：Adafruit 从 MicroPython 0.10 fork 出 CircuitPython，强调 USB 磁盘与初学者友好
- **2021 年**：RP2040 port 随 Raspberry Pi Pico 量产，MicroPython 成为入门 MCU Python 的默认选项之一

## 学到什么

1. **语言兼容不等于库兼容**——MicroPython 保留 Python 3 语法，但标准库是「精选子集」；移植 PC 代码前必须查 port 文档
2. **VM + port 分层是嵌入式解释器的标准打法**——核心 VM 一次编写，硬件差异关在 `ports/` 里
3. **内存预算决定工程手法**——`.mpy` 预编译与 frozen 模块不是优化炫技，而是小 RAM 板上的生存技能
4. **生态 fork 往往来自交互范式分歧**——MicroPython 偏通用移植，CircuitPython 偏「保存即运行」；选型看板子与受众，不是看「哪个更 Python」

## 延伸阅读

- 官方文档：[docs.micropython.org](https://docs.micropython.org)（各 port Quick Reference + API）
- 入门硬件：[MicroPython pyboard 引脚图](https://github.com/micropython/pyboard)（官方参考板）
- 工具：仓库内 [mpy-cross](https://github.com/micropython/micropython/tree/master/mpy-cross)（`.py` → `.mpy` 交叉编译器）
- 社区：[GitHub Discussions](https://github.com/micropython/micropython/discussions)（提问与项目展示）
- [[circuitpython]] —— 从 MicroPython fork 的 Adafruit 定制版，USB 磁盘保存即重载
- [[arduino-cli]] —— C++ 嵌入式路线，与 MicroPython 的 Python 路线形成对照

## 关联

- [[circuitpython]] —— 同源 fork，MicroPython 通用多平台 vs CircuitPython 教育开箱即用
- [[arduino-cli]] —— 嵌入式开发另一主流：编译型 C++ 工具链 vs 解释型 Python 运行时
- [[zephyr]] —— RTOS 路线；MicroPython 有 zephyr port，可与 RTOS 任务模型对比
- [[llvm]] —— 编译器基础设施；`mpy-cross` 字节码生成与 LLVM IR 思路同属「中间表示」范畴
- [[wasmtime]] —— 另一「把运行时塞进受限环境」的实践，面向 WebAssembly 而非 MCU
- [[nix]] —— 同样强调可重复构建；交叉编译固件时可与 nix 声明式环境配合

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）

