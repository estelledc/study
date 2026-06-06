---
title: CircuitPython — 插上 USB 就能写 Python 的微控制器运行时
来源: 'https://github.com/adafruit/circuitpython'
日期: 2026-06-06
分类: 操作系统
子分类: 嵌入式
难度: 初级
---

## 是什么

CircuitPython 是 Adafruit 基于 MicroPython 定制的 Python 运行时，专为廉价微控制器设计。你插上 USB，电脑出现一个叫 **CIRCUITPY** 的磁盘，打开里面的 `code.py`，改一行，保存——代码立刻重新跑。不需要 IDE、不需要烧录工具链、不需要学 Makefile。

这有点像把 Python REPL 刻进了 U 盘：板子本身就是"开发环境"，插哪台电脑都能工作。

核心设计决定：代码保存即重载（autoreload）。`supervisor` 模块监听 CIRCUITPY 分区的文件写入事件，一检测到改动就把 Python VM 整体重初始化再跑一遍——没有"打包""上传"这些步骤，反馈闭环缩到 1 秒以内。Adafruit 还配套了 300+ 个开箱即用的硬件驱动库，覆盖 LED 灯带、温湿度传感器、e-ink 屏、蓝牙等，从零到点灯平均不超过 5 分钟。

## 为什么重要

不理解 CircuitPython，下面这些事没法解释：

- 为什么同一份 MicroPython 代码在 CircuitPython 上跑会报 `AttributeError: 'module' object has no attribute 'Thread'`——CircuitPython 刻意禁用了 threading
- 为什么 `code.py` 跑完再按 REPL 看不到之前定义的变量——每次 reload VM 都从零开始
- 为什么 `import` 一个稍大的库会触发 `MemoryError`——微控制器只有几十 KB RAM，全功能 .py 文件放不下
- 为什么官方推荐 `.mpy` 文件而不是 `.py`——字节码体积小 10 倍，能装进去

## 核心要点

CircuitPython 执行模型可以拆成 **三层文件**：

1. **`boot.py`**（上电只跑一次）：配置 USB 设备描述符，决定板子挂载为 CIRCUITPY 磁盘还是 HID 键盘还是 MIDI 设备。这一步 serial 不可用，输出写到 `boot_out.txt`。类比：像是设置"进门规矩"，等门开了就不能再改了。

2. **`code.py`**（每次 reload 都重跑）：用户主逻辑。跑完后 VM 和硬件都重初始化——pin 脚回到初始状态，变量全清。想"保留状态跨 reload"只有写文件或用 `microcontroller.nvm`（非易失内存）这两条路。

3. **`safemode.py`**（崩溃后触发）：如果 `code.py` 导致硬故障或掉电，下次上电进入安全模式，跑 `safemode.py` 决定是自动重启还是休眠等待充电。这让板子在出错时仍然可控。

三层加起来：上电 → boot.py → 等 workflow（USB/BLE/WiFi 挂载）→ 循环跑 code.py。每层职责清晰，debug 范围缩小 3 倍。

## 实践案例

### 案例 1：点亮 NeoPixel LED 灯带

NeoPixel 是 WS2812B 协议的 LED 灯条，每颗灯独立可控 RGB。

```python
import board
import neopixel

# board.NEOPIXEL 是板载灯的 pin 脚；10 是灯数；brightness 0.2 避免刺眼
pixels = neopixel.NeoPixel(board.NEOPIXEL, 10, brightness=0.2)

# 把所有灯设成红色 (R, G, B)
pixels.fill((255, 0, 0))
```

保存后板子立刻亮红光，不需要任何额外步骤。`neopixel` 库处理了时序精确的位拆解，你只管传 RGB 元组。改成 `(0, 255, 0)` 再保存——绿光。这就是 CircuitPython 的「代码→现实」闭环，改一行 1 秒内有物理反馈。

### 案例 2：用 async/await 同时读传感器 + 刷新显示

微控制器没有多线程，但 CircuitPython 支持 `async/await` 协作式多任务：

```python
import asyncio
import board
import adafruit_ahtx0
import adafruit_display_text.label as label

sensor = adafruit_ahtx0.AHTx0(board.I2C())

async def read_sensor():
    while True:
        temp = sensor.temperature
        print(f"温度: {temp:.1f}°C")
        await asyncio.sleep(2)   # 挂起 2 秒，让其他 task 跑

async def blink_led():
    import digitalio
    led = digitalio.DigitalInOut(board.LED)
    led.direction = digitalio.Direction.OUTPUT
    while True:
        led.value = not led.value
        await asyncio.sleep(0.5)

asyncio.run(asyncio.gather(read_sensor(), blink_led()))
```

**逐步拆解**：`asyncio.gather` 把两个协程合并成"并发"——每当一个 `await asyncio.sleep(...)` 挂起，另一个立刻接着跑。没有线程竞争，没有锁，可预测。这是 CircuitPython 推荐的单板"并发"模式。

### 案例 3：把导电胶带变成钢琴键

CircuitPython 内置 `touchio` 模块，可以把任意导电物体（铝箔、导电漆、导电布）当电容触摸传感器：

```python
import board
import touchio
import audiocore
import audiopwmio

# 把三段铝箔胶带贴到纸板上，连接到 A0/A1/A2
keys = [touchio.TouchIn(getattr(board, f"A{i}")) for i in range(3)]
notes = ["do.wav", "re.wav", "mi.wav"]  # 预先录好的音频文件

audio = audiopwmio.PWMAudioOut(board.A3)

while True:
    for i, key in enumerate(keys):
        if key.value:
            wave = audiocore.WaveFile(open(notes[i], "rb"))
            audio.play(wave)
```

不需要焊接，不需要额外芯片，胶带就是钢琴键。这个例子展示了 CircuitPython"硬件抽象层统一"的优势——`touchio`/`audiocore`/`audiopwmio` 背后是 C 写的驱动，你在 Python 层感知不到差异。

## 踩过的坑

1. **REPL 看不到 code.py 的变量**：`code.py` 跑完 VM 整体重初始化，REPL 是全新环境。想保留数据只能写文件（`open("state.json","w")`）或用 `microcontroller.nvm`，别指望全局变量穿越 reload。

2. **threading 静默失效**：从 MicroPython 或 CPython 搬来的 `threading.Thread(...)` 代码，在 CircuitPython 里导入就报 `ImportError`；换成 `asyncio` 协作式任务，心智模型完全不同，需要重写。

3. **FAT 文件系统损坏**：保存 `code.py` 后 autoreload 触发的那一秒内强行拔线，CIRCUITPY 分区可能变成只读（Windows 会弹"需要格式化"对话框）。解决：等状态 LED 亮绿灯（code 跑完）再拔，或者直接在 `code.py` 里处理好退出逻辑。

4. **MemoryError 来自大 .py 文件**：CircuitPython 在运行时编译 .py 到字节码，编译过程本身也耗 RAM。解决方案：用 `mpy-cross` 预编译成 `.mpy` 放到 `lib/` 文件夹，体积小 10 倍，import 速度也快 3 倍。

## 适用 vs 不适用场景

**适用**：
- 教学和原型：从零到「灯亮」5 分钟，无需工具链
- 硬件驱动调试：改一行 Python 立刻看效果，比重烧固件快 10 倍
- 低并发传感器采集：单任务或 async 协作式多任务，逻辑简单可预测
- Adafruit 生态板（Feather、ItsyBitsy、CircuitPlayground、QT Py）

**不适用**：
- 实时性要求严格的场景（电机 PID 控制、高频中断）——CircuitPython 禁用 interrupt，GC 暂停不可控
- 大量数值计算——RAM 只有几十 KB，NumPy 不可用，换 MicroPython 的 `ulab`
- 需要线程并发的场景——只有协作式 async，不是抢占式多线程
- 生产部署（非教育用途）——没有 OTA 更新机制、没有 watchdog 保障

## 历史小故事（可跳过）

- **2017 年**：Adafruit 工程师 Scott Shawcroft 从 MicroPython 0.10 fork，最初目标是让 Circuit Playground Express（ATSAMD21 板）「买来即能写 Python」，核心突破是把 USB 大容量存储设备与自动重载结合在一起。
- **2019 年（v4）**：引入 `asyncio` 支持，解决了"单线程如何同时做两件事"的教学难题。
- **2021 年（v7）**：引入 BLE Workflow，无 USB 接口的蓝牙板子可以通过手机 App `code.circuitpython.org` 直接编辑代码，彻底去掉 USB 线。
- **2022 年（v8）**：引入 WiFi Workflow，ESP32-S2/S3 系列可以通过局域网 Web 界面编辑文件，真正"无线编程"。

从一块板子的专属运行时，演变成「多通道无线工作流」平台——每一步都保持零工具链安装的核心承诺不变。

## 学到什么

1. **去掉摩擦才是教育设计**——「插上 USB 即可编程」不是技术噱头，而是刻意砍掉了"装驱动/烧录/连接 COM 口"三道门槛，降低了 3 倍入门难度
2. **受限换可预测**——禁用 threading 和 interrupt 看似退步，实则让初学者永远不会踩竞态条件；生产工具和教学工具的优化目标不同
3. **文件系统即 API**——用 CIRCUITPY 磁盘做"上传通道"，把编辑器、终端、IDE 全部绕过，任何能写文件的工具都能部署代码
4. **分层执行（boot→code→safemode）比单一入口更健壮**——每层职责清晰，出问题时能快速定位是"上电配置错"还是"用户逻辑错"

## 延伸阅读

- 官方入门指南：[Welcome to CircuitPython](https://learn.adafruit.com/welcome-to-circuitpython)（建议作为第一本教程）
- 硬件驱动库总览：[CircuitPython Libraries](https://circuitpython.org/libraries)（300+ 驱动，按品类分组）
- 与 MicroPython 差异对照：[Differences from MicroPython](https://github.com/adafruit/circuitpython#differences-from-micropython)
- [[arduino-cli]] —— 嵌入式开发的另一条路：C++ + 命令行工具链
- [[wasmtime]] —— 同样聚焦「运行时安全隔离」，但目标是服务端 WASM
- [[llvm]] —— mpy-cross 字节码编译器的底层工具链基础

## 关联

- [[arduino-cli]] —— 同为面向创客的嵌入式开发工具，Arduino 走 C++ 工具链路线，CircuitPython 走「磁盘即接口」路线
- [[wasmtime]] —— 都是「把某种高级语言运行时塞进受限环境」的思路，一个面向微控制器，一个面向服务端沙箱
- [[llvm]] —— mpy-cross 把 .py 预编译成 .mpy 字节码，背后依赖 LLVM 工具链
- [[pyth]] —— CircuitPython 是 CPython 的精简子集，模块命名故意与 CPython 对齐，代码可双向移植

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[arduino-cli]] —— Arduino CLI — 命令行驱动嵌入式全流程工具链
- [[dspy]] —— DSPy — 把 prompt 写成签名，让编译器替你调
- [[llvm]] —— LLVM — 模块化编译器框架
- [[micropython]] —— MicroPython — 在 MCU 上跑 Python 3 的精简实现
- [[nix]] —— Nix — 函数式声明式包管理与可重复构建
- [[pyth]] —— Pyth Network — 一手数据上链的低延迟预言机
- [[wasmtime]] —— Wasmtime — Bytecode Alliance 标准 wasm runtime

