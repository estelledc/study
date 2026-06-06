---
title: CircuitPython — 保存即重载的微控制器 Python 运行时
来源: 'https://github.com/adafruit/circuitpython'
日期: 2026-06-06
分类: 操作系统
子分类: 嵌入式
难度: 初级
---

## 是什么

CircuitPython 是 **Adafruit 定制的面向微控制器的 Python 运行时**，最大卖点是"把开发板插入 USB → 电脑出现一个叫 CIRCUITPY 的磁盘 → 修改 `code.py` → 保存 → 代码立刻重跑"，全程不需要安装任何工具链。

日常类比：传统嵌入式开发像修古董车——要先买专用工具箱、学几种驾驶证、等待下载固件，才能让引擎点火；CircuitPython 像玩乐高——拆开盒子就能拼，改一块就立刻看结果。

具体说，你拿到一块支持 CircuitPython 的开发板（比如 Adafruit Feather M4），插入 USB 后：

1. 电脑认出一个名为 `CIRCUITPY` 的 U 盘
2. 打开里面的 `code.py`，用任意文本编辑器写 Python 代码
3. 按 Ctrl+S 保存
4. 开发板上的 `supervisor` 模块检测到文件写入 → 自动重启 Python VM → 新代码运行

**这个"保存即重载"的交互范式**让完全没有嵌入式经验的人，也能在几分钟内让传感器、LED、蜂鸣器响应 Python 代码。

## 为什么重要

不理解 CircuitPython，下面这些事都没法解释：

- 为什么 Adafruit 的入门教程可以告诉初学者"直接保存文件就行"——背后是 FAT 文件系统写入监听 + VM 热重载这套机制在支撑
- 为什么 CircuitPython 的模块叫 `os`、`time`、`random` 而不是自创命名——它故意与 CPython 标准库对齐，让 PC 上写的代码几乎不用改就能放到板子上跑
- 为什么"微控制器 + Python"不能直接用标准 Python——板子只有几十 KB RAM，需要定制裁剪版运行时 + 预编译字节码才能塞进去
- 为什么 BLE Workflow（蓝牙无线工作流）能让没有 USB 端口的手机也能修改开发板代码——CircuitPython 9.0 把"USB 磁盘"的交互范式搬进了蓝牙协议

## 核心要点

CircuitPython 的核心设计可以拆成 **三块**：

1. **USB 自动挂载 + 文件保存即重载**：开发板枚举为 USB CDC（串口调试）+ USB MSC（大容量存储）双设备。`supervisor` 模块在主循环里轮询 FAT 文件系统写标志位，检测到 `code.py` 被修改后立即软复位 Python VM。这就是"不用按任何按钮"的秘密——整个过程在硬件层面发生，不需要任何 IDE 插件。

2. **分层执行模型**：CircuitPython 区分三种入口文件：`boot.py`（上电一次，用来配置 USB 设备、读写权限）、`code.py`（主逻辑，保存即重载）、`safemode.py`（崩溃或 Safe Mode 时运行，用来报错提示）。类比：`boot.py` 是厨房装修（只做一次），`code.py` 是每天做菜（反复改），`safemode.py` 是厨房着火时的灭火器。

3. **300+ 官方硬件驱动库（CircuitPython Libraries）**：Adafruit 维护超过 300 个开箱即用的库，覆盖温湿度传感器、OLED 显示屏、NeoPixel LED、电容触摸、电机驱动等几乎所有常见硬件外设。这些库都以 `.mpy` 预编译字节码分发，可直接复制到 `CIRCUITPY/lib/` 目录使用，不需要 `pip install`，也不需要构建环境。

## 实践案例

### 案例 1：NeoPixel LED 灯带控制

用 Adafruit Feather M4 + 8 颗 NeoPixel 灯带：

```python
import board
import neopixel
import time

pixels = neopixel.NeoPixel(board.D6, 8, brightness=0.3)

while True:
    pixels.fill((255, 0, 0))   # 全红
    time.sleep(0.5)
    pixels.fill((0, 255, 0))   # 全绿
    time.sleep(0.5)
    pixels.fill((0, 0, 255))   # 全蓝
    time.sleep(0.5)
```

把这段代码保存到 `code.py` 后：

- 灯带立即开始红绿蓝交替闪烁
- 修改任意颜色值 → 保存 → 灯光立刻变化，**零延迟看到结果**
- `board.D6` 是引脚名，CircuitPython 把硬件引脚包装成 Python 常量，不需要记忆 GPIO 编号

这个案例的价值在于展示了"代码 → 物理反馈"的完整闭环，无需 IDE、无需编译、无需烧录步骤。

### 案例 2：电容触摸钢琴

用导电胶带贴在纸板上做钢琴键，不需要焊接：

```python
import board
import touchio
import audioio
import audiocore

# 定义 8 个触摸引脚
touch_pins = [
    touchio.TouchIn(board.A1),
    touchio.TouchIn(board.A2),
    touchio.TouchIn(board.A3),
    touchio.TouchIn(board.A4),
]

while True:
    for i, touch in enumerate(touch_pins):
        if touch.value:
            print(f"Key {i} touched!")
            # 这里可接音频播放库播放对应音符
```

**逐部分解释**：

- `touchio.TouchIn` 把引脚变成电容触摸传感器，不需要任何电阻或外部硬件
- `touch.value` 直接返回 `True/False`，碰到胶带就触发
- 导电胶带 → 引脚 → Python 对象，整条链路 3 步搞定
- 加上 `audioio` 库可以播放 WAV 音频，做出能发声的乐器原型

这个案例展示了 CircuitPython 最核心的设计哲学：**把硬件外设包装成熟悉的 Python 对象**，降低从"想法"到"原型"之间的门槛。

### 案例 3：async/await 协作式多任务

在单个 RP2040 芯片上同时读温湿度传感器 + 刷新 e-ink 屏幕：

```python
import asyncio
import board
import adafruit_sht4x
import adafruit_il0373

sensor = adafruit_sht4x.SHT4x(board.I2C())
display = adafruit_il0373.IL0373(...)

async def read_sensor():
    while True:
        temp, humidity = sensor.measurements
        print(f"{temp:.1f}°C  {humidity:.1f}%")
        await asyncio.sleep(2)

async def refresh_display():
    while True:
        # 刷新 e-ink 屏（慢操作，约 2 秒）
        display.refresh()
        await asyncio.sleep(30)

async def main():
    await asyncio.gather(
        read_sensor(),
        refresh_display(),
    )

asyncio.run(main())
```

**关键点**：

- CircuitPython 禁用了 `threading`，用协作式多任务（`asyncio`）代替
- `await asyncio.sleep(N)` 挂起当前任务 → 让出 CPU → 其他任务运行，所有切换在用户代码层发生
- 相比 threading，不会有锁竞争、不会有不可预测的抢占，适合资源极其有限的微控制器
- 把 MicroPython 的线程代码直接搬过来会**静默失败**，这是最常见的踩坑

## 踩过的坑

1. **REPL 与 `code.py` 状态完全隔离**：每次 `code.py` 跑完，Python VM 重初始化，在串口 REPL 里读不到 `code.py` 定义的变量。初学者常以为"变量消失了"，实际是两个独立的执行环境。

2. **禁用 `threading` 导致 MicroPython 代码不兼容**：CircuitPython 去掉了 `_thread` 模块和硬件中断回调，换来更易预测的执行模型。把 MicroPython 的 `_thread.start_new_thread(...)` 搬过来会直接报 `ImportError`，且没有任何警告提示。

3. **USB 弹出时机导致文件系统损坏**：在 `CIRCUITPY` 磁盘上写文件后**立即拔线**，可能导致 FAT 文件系统损坏（因为写操作尚未 flush）。需等 `code.py` 自动重载完成（板子上的 LED 恢复常亮）再拔线。低版本固件对此没有任何警告。

4. **内存限制触发 `MemoryError`**：微控制器只有几十 KB RAM，`import` 大型库（如完整的 USB-HID 库）可能直接报 `MemoryError`。解决方法是用 `mpy-cross` 工具把 `.py` 预编译成 `.mpy` 字节码（更紧凑），再放到 `lib/` 目录，可节省 40-60% 内存占用。

## 适用 vs 不适用场景

**适用**：

- 零基础的硬件入门学习——从"代码 → 物理反馈"闭环中建立直觉
- 快速硬件原型——有想法到能演示通常只需几十分钟
- 教育场景：中学 / 大学创客课，不需要讲解工具链和编译流程
- 需要大量现成传感器驱动的项目（官方库 300+，覆盖大多数常见外设）
- 需要 BLE / WiFi 无线工作流的无 USB 场景（CircuitPython 9.0+）

**不适用**：

- 对实时性有严格要求的控制系统（协作式调度有延迟抖动，不能保证硬实时）
- 需要多线程并发的场景（`threading` 模块被禁用）
- 超低功耗设备（CircuitPython 运行时开销比裸机 C 高一个数量级）
- 大型复杂固件（内存太小，超过几十 KB 的程序需要仔细优化）
- 生产级产品固件（Adafruit 自己建议复杂产品用 C/C++ 重写）

## 历史小故事（可跳过）

- **2014 年**：Damien George 发布 MicroPython，证明 Python 可以在微控制器上运行，开创了"MCU + Python"这条路
- **2017 年**：Adafruit 员工 Scott Shawcroft 从 MicroPython 0.10 fork 出 CircuitPython，目标是让 Circuit Playground Express 这块板子"买来就能用 Python"，去掉 threading、加入 USB 自动挂载
- **2019 年**：CircuitPython 4.0 扩展到 atmel-samd 之外的多个平台（ESP32S2、nRF52840），官方库数量突破 100 个
- **2022 年**：8.0 引入 WiFi Workflow，板子接入同一局域网后可以通过浏览器直接编辑 `code.py`，消除了对 USB 线的依赖
- **2023 年**：9.0 引入 BLE Workflow + USB Host 支持，进化成多通道无线工作流运行时，Discord 社区活跃用户超过 5 万人

## 学到什么

1. **工具链是最大的门槛，消除它就能打开一个全新的用户群**——CircuitPython 用"U 盘 + 文本编辑器"替代了 IDE + 工具链，让嵌入式开发的起点降到了零
2. **与标准库对齐比性能优先更重要（在教育场景里）**——模块名与 CPython 保持一致，让初学者在 PC 上学到的知识可以直接迁移到硬件上
3. **裁剪不是妥协，是设计选择**——去掉 threading 换来可预测的执行模型，在资源受限的硬件上这是正确的取舍
4. **官方维护的"胶水层"（驱动库）往往比运行时本身更重要**——300+ 官方库意味着用户很少需要自己写底层驱动，这才是生态真正的护城河

## 延伸阅读

- 官方文档：[circuitpython.org/libraries](https://circuitpython.org/libraries)（所有官方库列表 + 安装方法）
- 视频教程：[Adafruit — CircuitPython School](https://www.youtube.com/playlist?list=PLjF7R1fz_OOWFqZfqW9jlvQSIUmwn9lWr)（系列教程，从点灯到 BLE 全覆盖）
- 固件下载：[circuitpython.org/downloads](https://circuitpython.org/downloads)（按板子型号找对应固件）
- 工具：[mpy-cross](https://pypi.org/project/mpy-cross/)（`.py` → `.mpy` 预编译工具，节省内存）
- [[arduino-cli]] —— 同是嵌入式开发工具，但走 C++ 编译路线
- [[llvm]] —— `mpy-cross` 字节码编译背后依赖的编译基础设施思路

## 关联

- [[arduino-cli]] —— 同类嵌入式开发工具链，CircuitPython 的 Python 方案 vs Arduino 的 C++ 方案
- [[llvm]] —— 编译器基础设施，`mpy-cross` 字节码优化背后的相似思路
- [[wasmtime]] —— 同为"把运行时嵌入受限环境"的实践，一个面向微控制器，一个面向 WebAssembly 沙箱
- [[nix]] —— 同样致力于消除"环境配置门槛"，方向不同但设计哲学共鸣
- [[dspy]] —— 同样试图让非专家用声明式接口驱动复杂系统（AI vs 硬件外设）

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）

