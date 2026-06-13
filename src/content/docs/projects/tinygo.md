---
title: TinyGo — 把 Go 编译进微控制器和 WebAssembly 的「袖珍版编译器」
来源: 'https://github.com/tinygo-org/tinygo'
日期: '2026-06-13'
子分类: 语言运行时
分类: 编译器
难度: '高级'
provenance: 'pipeline-v3'
---

## 是什么

**TinyGo** 是 [tinygo-org/tinygo](https://github.com/tinygo-org/tinygo) 维护的一套 Go 编译器，专门把 Go 程序编译到**资源极度受限**的环境：微控制器（MCU）、WebAssembly（浏览器 / WASI 边缘运行时）、以及体积敏感的命令行工具。它不是标准 Go 工具链 `gc` 的替代品，而是面向「小地方」的平行路线。

日常类比：**旅行箱 vs 登山包**。

标准 Go 编译器像一套功能齐全的旅行箱——自带完整调度器、庞大运行时、多核并行优化，适合服务器和桌面。但你要去登山（一块只有 32KB RAM、256KB Flash 的 STM32 芯片），拖着旅行箱根本爬不上去。TinyGo 就是专门设计的登山包：同样装的是 Go 语言（语法、类型系统、大部分标准库），但把箱子的轮子、拉杆、扩展层都拆掉，只留徒步必需品，再用 LLVM 这把瑞士军刀把剩余部分压到最小体积。

和 [[zephyr]] 这种「嵌入式操作系统」不同，TinyGo 走的是**语言层路线**：你写的是 Go，编译器负责生成能在裸机或轻量 RTOS 上跑的固件，不必先学 C 和 Kconfig。和 [[wasmtime]] 这种「运行时」的关系则是上下游：TinyGo 产出 `.wasm` 字节码，Wasmtime / wazero / 浏览器负责执行。

## 解决什么问题

标准 Go（`go build` + `gc` 编译器）在「小地方」有三类硬障碍：

| 痛点 | 标准 Go 的表现 | TinyGo 的回应 |
| --- | --- | --- |
| 二进制体积 | 最小 `hello world` 往往数 MB 级（含完整运行时） | 通过 LLVM 优化 + 裁剪运行时，固件可压到数十 KB |
| RAM 占用 | goroutine 默认独立栈（初始约 2KB），调度器常驻 | 可选 `scheduler=none` 完全去掉协程；或协作式 tasks/asyncify 调度 |
| 目标平台 | 主要面向 Linux / macOS / Windows / 少量 OS | 支持 150+ 开发板（BBC micro:bit、Arduino、RP2040、nRF52 等）及 WASM/WASI |

TinyGo 要回答的核心问题是：**能否在保持 Go 语法和内存模型（含 GC）的前提下，让同一份语言跑在灯泡芯片和浏览器沙箱里？**

它的设计目标（来自官方 README）写得很直白：

- 体积极小——「不为不用的功能付费」
- 支持常见 MCU 开发板
- 能编译到 WebAssembly（浏览器 + WASI 边缘）
- CGO 开销接近普通函数调用
- 兼容大部分标准库，多数 Go 代码无需修改即可尝试编译

同时它也明确列了**非目标**：不追求海量 goroutine 的调度效率、不保证比 `gc` 更快（虽然 LLVM 优化在数值计算上有时反而更优）、不承诺能编译「任意 Go 项目」——反射、部分 `unsafe` 用法、依赖完整 `syscall` 的包仍可能编不过。

## 核心概念

### 1. LLVM 后端：不是生成 C，而是直接走编译器 IR

标准 Go 编译器 `gc` 自研了一整套中间表示和机器码生成。TinyGo 则选择站在 **LLVM** 肩膀上：

```
Go 源码 → TinyGo 前端（复用 go/types、go/parser 等）→ LLVM IR → 目标机器码 / WASM
```

这条路径带来几个实际好处：

- **跨架构统一**：同一份前端逻辑，靠 LLVM 后端覆盖 ARM Cortex-M、AVR、RISC-V、WASM 等，不必为每种 ISA 手写代码生成器
- **成熟的优化 Pass**：`-opt=z`（默认）走体积优先优化；`-opt=2` 可走性能优先；LLVM 的内联、死代码消除、常量折叠对嵌入式很关键
- **与 C 生态互操作**：TinyGo 的 CGO 设计目标是无额外调用开销，方便直接调用厂商 HAL / CMSIS 库

对比历史上的 **emgo**（另一套 Go→嵌入式方案，通过生成 C 代码再交给 GCC）：TinyGo 坚持保留 Go 内存模型（意味着要有某种 GC），并用 LLVM 换更大的后端灵活性和更小的最终体积。

### 2. `machine` 包：嵌入式世界的「硬件抽象层」

标准库里不存在 `machine` 包；它是 TinyGo 为 MCU 增加的**类标准库**，提供跨板型的 GPIO、I2C、SPI、UART、ADC 等 portable API。不同开发板的 `machine.LED`、`machine.SDA` 等常量在编译期由 `-target` 解析到具体引脚。

你可以把它理解成：**Go 版的 Arduino `digitalWrite`**，但类型安全、编译期检查，且与 `time.Sleep` 等标准库无缝配合。

### 3. Goroutine 调度裁剪：三种 scheduler 档位

这是 TinyGo 与标准 Go 差异最大的运行时设计之一。编译时通过 `-scheduler` 选择策略：

| 调度器 | 适用平台 | 行为 | 代价 |
| --- | --- | --- | --- |
| `none` | AVR 等极小内存板（常作默认） | **禁用** goroutine 和 channel；`go` 关键字不可用 | 固件最小；并发模型归零 |
| `tasks` | 多数 MCU（Cortex-M、RP2040 等） | 协作式任务调度，类似轻量 RTOS | 支持有限并发，非抢占式 |
| `asyncify` | WebAssembly | 基于 Binaryen Asyncify，把阻塞调用拆成可恢复协程 | 适配 WASM 无法高效切换栈的限制 |
| `cores` | RP2040 / RP2350 等多核板 | 利用芯片多核并行跑 goroutine | 体积和 RAM 略增，但吞吐更好 |

**为什么要裁剪？** 标准 Go 的调度器（G-M-P 模型 + 抢占 + 系统调用监控）是为多核服务器设计的，运行时本身就要占掉大量 Flash 和 RAM。在 8KB RAM 的 AVR 上，这套设施根本放不下。

TinyGo 在 WASM 上还有一层历史背景：WebAssembly 出于安全考虑**不暴露原生栈切换**，传统「每个 goroutine 一块栈」模型走不通。因此 TinyGo 借用 LLVM coroutine / Asyncify，把 `time.Sleep` 等阻塞点改写成可挂起、可恢复的协程状态机——对写 Go 的人透明，但编译器在背后做了 CPS（continuation-passing style）变换。

在 `scheduler=none` 时，`runtime.Gosched()` 会直接返回（因为只有逻辑上的单线程）；定时器、channel 等依赖调度器的特性会触发运行时错误——这是刻意的「用体积换能力」trade-off。

### 4. 垃圾回收与 Panic 策略

`-gc` 控制内存管理器：

- **conservative**（默认）：保守式 mark/sweep GC，跨平台，但停顿时间不可预测
- **leaking**：只分配不释放，最简单、最快，适合短生命周期固件
- **none**：完全禁用堆分配，用于审计程序里哪些地方偷偷 `new` 了对象

`-panic` 控制崩溃行为：`abort`（默认，打印信息后挂起或 `unreachable`）、`trap`（直接触发陷阱指令，体积更小但难调试）。

## 与标准 Go 的对比

| 维度 | 标准 Go (`gc`) | TinyGo |
| --- | --- | --- |
| 编译器后端 | 自研 SSA → 机器码 | LLVM |
| 典型目标 | 服务器、桌面、移动端 | MCU、WASM、WASI、小体积 CLI |
| 最小二进制 | ~1–2 MB 量级起 | 数十 KB 级固件可行 |
| Goroutine | 原生抢占式，M:N 调度 | 可选 none / 协作式 tasks / asyncify / 多核 cores |
| 标准库覆盖 | 完整 | 大部分可用；`net` 部分子包、`reflect` 深度用法等受限 |
| 反射 / `unsafe` | 完整支持 | 部分受限，复杂反射可能编译失败 |
| 调试体验 | Delve、成熟生态 | GDB + OpenOCD / 板载 USB-CDC，门槛更高 |
| 并发规模 | 轻松上万 goroutine | 适合少量协程；不追求「海量」 |
| 工具链命令 | `go build` | `tinygo build` / `flash` / `monitor` |
| 硬件访问 | 无内建 `machine` 包 | `machine` 包直接操作寄存器级外设 |

选型口诀：

- 写 **云原生微服务、CLI 工具、需要完整标准库** → 标准 Go
- 写 **LED 点灯、传感器采集、BLE 外设、浏览器里跑的逻辑、WASI 边缘函数** → TinyGo
- 已有 **Zephyr / FreeRTOS C 固件** 要渐进迁移 → TinyGo 可尝试，但和纯 C RTOS 生态的驱动成熟度仍需评估

## 代码示例

### 示例 1：板载 LED 闪烁（MCU 版 Hello World）

这是 TinyGo 官方教程的「硬件世界 Hello World」——逻辑与 Arduino `blink.ino` 相同，但语言是 Go：

```go
package main

import (
	"machine"
	"time"
)

func main() {
	led := machine.LED
	led.Configure(machine.PinConfig{Mode: machine.PinOutput})

	for {
		led.High()
		time.Sleep(500 * time.Millisecond)

		led.Low()
		time.Sleep(500 * time.Millisecond)
	}
}
```

编译与烧录（以 Raspberry Pi Pico 为例）：

```bash
# 安装 TinyGo 后，指定板型 target
tinygo build -target=pico -o firmware.uf2 .
tinygo flash -target=pico .
# 或通过 USB 串口看 println 输出
tinygo monitor
```

要点：

- `machine.LED` 由 `-target` 决定具体 GPIO，换板子不用改代码
- `time.Sleep` 在 `scheduler=tasks` 下通过协作式调度实现，不阻塞整个系统（若有其他 goroutine）
- 在 AVR Uno 等极小板上，默认可能是 `scheduler=none`，此时不宜使用 `go` 关键字

### 示例 2：WebAssembly 导出函数（浏览器 / WASI）

TinyGo 可把 Go 编译成体积极小的 `.wasm`，适合嵌入网页或边缘运行时：

```go
package main

import "syscall/js"

func main() {
	// 保持 Go runtime 存活；WASM 入口由 JS 调用导出函数
	select {}
}

//export add
func add(this js.Value, args []js.Value) interface{} {
	a := args[0].Int()
	b := args[1].Int()
	return a + b
}
```

编译命令：

```bash
# 浏览器用 WASM（scheduler 默认 asyncify）
tinygo build -target=wasm -o main.wasm .

# WASI 边缘运行时（如 Fermyon Spin、Fastly Compute）
tinygo build -target=wasi -o main.wasm .
```

HTML 侧加载（简化示意）：

```html
<script>
  WebAssembly.instantiateStreaming(fetch("main.wasm"), go.importObject)
    .then((result) => {
      const go = new Go();
      go.run(result.instance);
      // 调用 Go 导出的 add
      const sum = result.instance.exports.add(3, 4);
      console.log(sum); // 7
    });
</script>
```

与标准 Go 的 `GOOS=js GOARCH=wasm` 相比，TinyGo 产出的 WASM 模块通常**小一个数量级以上**，但支持的 `syscall/js` 和反射子集更少，复杂标准库调用需逐项验证。

### 示例 3：用 goroutine 做并发采集（scheduler=tasks）

在 RAM 充裕的板子（如 nRF52840、STM32）上，可以写接近标准 Go 风格的并发：

```go
package main

import (
	"machine"
	"time"
)

func main() {
	led := machine.LED
	led.Configure(machine.PinConfig{Mode: machine.PinOutput})

	// 后台 goroutine 每秒打印计数
	go func() {
		n := 0
		for {
			println("tick", n)
			n++
			time.Sleep(time.Second)
		}
	}()

	// 主 goroutine 负责闪灯
	for {
		led.Set(!led.Get())
		time.Sleep(200 * time.Millisecond)
	}
}
```

编译时显式指定 tasks 调度器（部分板型默认已是 tasks）：

```bash
tinygo build -target=circuitplay-express -scheduler=tasks -o firmware.uf2 .
```

注意：这与服务器上开成千上万个 goroutine 不是同一量级；嵌入式上要控制 goroutine 数量和栈大小（`-stack-size`），否则容易 RAM 溢出。

## 常用编译选项速查

开发固件时最常碰到的几个 flag（完整列表见 [官方文档](https://tinygo.org/docs/reference/usage/important-options/)）：

| 选项 | 作用 |
| --- | --- |
| `-target=<board\|wasm\|wasi>` | 选择芯片 / WASM 目标，连带 emulator、烧录工具 |
| `-opt=z` | 默认，体积优先优化 |
| `-scheduler=none\|tasks\|asyncify\|cores` | 协程调度策略 |
| `-gc=conservative\|leaking\|none` | 垃圾回收器选择 |
| `-panic=abort\|trap` | panic 时是打印后挂起还是直接陷阱 |
| `-serial=usb\|uart\|rtt\|none` | `println` 输出走哪条通道 |
| `-size short` | 打印固件体积摘要（code/data/bss） |

## 踩坑与边界

1. **不是所有 Go 都能编**：标准库中依赖完整操作系统的包（部分 `net`、`os/exec` 场景）在 MCU 上不可用；生成代码前先用 `tinygo list` 或试编译摸底。

2. **scheduler=none 时别写 `go`**：编译可能过，但行为与预期不符；AVR 默认 none 是为了省 RAM，要并发需手动 `-scheduler=tasks` 并接受体积上涨。

3. **LED 亮灭极性因板而异**：有的板子 `High()` 是灭、`Low()` 是亮，取决于 LED 共阳/共阴接法，别当成编译器 bug。

4. **调试比桌面 Go 难**：常用 GDB + OpenOCD，或 `-monitor` 看串口；`panic=trap` 省体积但只剩 HardFault，排错成本高。

5. **与 TinyGo Playground 的差异**：在线 playground 是模拟环境，体积估算和真实烧录可能有出入，上板前以 `tinygo size` 为准。

6. **多核仍属进阶**：`-scheduler=cores` 目前主要针对 RP2040/RP2350 等，需配合链接选项（如 `--defsym=__num_stacks=2`），别在单核 M0 上盲目开启。

## 适用 vs 不适用

**适用**：

- 已会 Go，想用它写物联网固件、可穿戴、传感器节点
- 需要把业务逻辑编译进浏览器 WASM（游戏逻辑、音视频处理、编辑器插件）
- WASI 边缘函数（Spin、Fastly Compute 等）且在意冷启动体积
- 教学场景：用 Go 语法降低嵌入式入门门槛（比直接学 C + 寄存器友好）

**不适用**：

- 典型云原生后端（用标准 Go 生态更完整）
- 依赖大量反射、动态插件、完整 `database/sql` 驱动的项目
- 需要硬实时抢占式调度（毫秒级确定性）——协作式 scheduler 要慎重评估
- 团队已有成熟 Zephyr/FreeRTOS C 栈，且没有 Go 迁移动力

## 学习路径建议

1. **零硬件**：在 [TinyGo Playground](https://play.tinygo.org/) 跑通 LED 模拟和 WASM 示例，建立「Go 能下小板子」的直觉。
2. **有一块板子**：跟官方 [Blinky 教程](https://tinygo.org/docs/tutorials/blinky/)，掌握 `tinygo flash` + `tinygo monitor`。
3. **理解调度**：分别用 `-scheduler=none` 和 `-scheduler=tasks` 编译同一程序，对比 `tinygo size` 输出，理解体积 trade-off。
4. **读源码**：从 `src/runtime` 和 `machine` 包入手，对照 Ayke van Laethem 关于 [goroutine 实现](https://aykevl.nl/2019/02/tinygo-goroutines/) 的文章，理解 LLVM coroutine 与 Asyncify 背景。
5. **对照标准 Go**：把桌面上的小程序用 `tinygo build -target=wasm` 试编，记录哪些包能过、哪些报错，形成心理「支持子集」地图。

## 小结

TinyGo 不是「更好的 Go」，而是「Go 的嵌入式与 WASM 方言」：复用 Go 语言前端和大部分编程体验，用 LLVM 压体积，用可裁剪的调度器换 RAM，用 `machine` 包接通真实引脚。标准 Go 继续统治服务器；TinyGo 占领那些旅行箱拖不进去的小地方——从一块几美元的 MCU，到浏览器里几 KB 的 WASM 模块。
