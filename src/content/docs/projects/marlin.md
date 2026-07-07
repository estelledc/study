---
title: Marlin Firmware — 3D 打印机里的运动控制大脑
来源: 'https://github.com/MarlinFirmware/Marlin'
日期: 2026-07-07
分类: embedded
难度: 中级
---

## 是什么

Marlin Firmware 是一套开源 3D 打印机固件：它跑在打印机主板的 MCU 上，把切片器生成的 G-code 翻译成电机脉冲、加热控制、限位保护和屏幕交互。

日常类比：切片器像厨师写的菜谱，G-code 是“先切菜、再开火、再翻炒”的指令；Marlin 是站在炉子前真正执行的人，既要照菜谱走，又要盯着温度、别让锅烧干。

最小感受可以从几行 G-code 开始：

```gcode
G28
M104 S200
G1 X50 Y25.3 F1500
```

这三行的意思是：先回零，给热端设置 200 度目标温度，再让喷头以指定速度移动到某个坐标。

Marlin 的厉害之处在于：它不仅“会听命令”，还要在几 KB 到几百 KB RAM 的芯片上同时做运动规划、温度闭环、安全检查、屏幕菜单、SD 卡读写和 EEPROM 设置保存。

## 为什么重要

不理解 Marlin，下面这些事都很难解释：

- 为什么 3D 打印不是“把模型直接丢给电机”，中间必须有一层固件把路径变成实时脉冲。
- 为什么换主板、热端、探针、屏幕以后常要改 `Configuration.h`，因为硬件差异在编译期就要告诉固件。
- 为什么 8-bit AVR 老板子和 STM32、ESP32、LPC1768 等 32-bit 板子能共用同一个项目，因为 Marlin 用 HAL 把底层差异隔开。
- 为什么调平、PID、自定义启动 G-code 看起来像“玄学”，本质上都是给固件补充机器状态。

## 核心要点

Marlin 可以拆成三层看：

1. **G-code 入口层**：串口、SD 卡或上位机送来一行行命令，Marlin 解析 `G28`、`G1`、`M104` 这种指令。类比：前台收单，把“少糖热拿铁”翻译成后厨能执行的动作。

2. **运动和温度层**：Planner 负责把直线移动拆成加速、匀速、减速的步进节奏；温控模块用 PID 或其他策略让热端、热床保持目标温度。类比：一个人踩油门刹车，另一个人盯着火候。

3. **配置和 HAL 层**：`Configuration.h` 决定机器长什么样，HAL 决定同一套上层代码怎样点亮不同 MCU 的引脚、定时器和串口。类比：同一本驾驶教材，换车时要先知道方向盘、刹车、仪表在哪里。

这三层合在一起，让 Marlin 成为 3D 打印固件里的“默认教材”：它把 G-code 语言、实时控制、硬件抽象和社区配置都放在一个项目里。

## 实践案例

### 案例 1：给一块主板写清楚“我是谁”

官方配置文档反复强调：Marlin 的核心配置在 `Configuration.h` 和 `Configuration_adv.h`，很多机器特征在编译前就要确定。

```cpp
#define MOTHERBOARD BOARD_BTT_SKR_MINI_E3_V3_0
#define SERIAL_PORT 2
#define BAUDRATE 115200
#define X_BED_SIZE 235
#define Y_BED_SIZE 235
```

逐部分解释：

- `MOTHERBOARD` 选择主板定义，决定哪些引脚接电机、热端、风扇、限位。
- `SERIAL_PORT` 和 `BAUDRATE` 决定电脑或屏幕怎样和固件说话。
- `X_BED_SIZE`、`Y_BED_SIZE` 告诉运动规划器机器的可移动范围，防止喷头跑出物理边界。

如果用 PlatformIO 构建，Marlin 仓库里有真实环境名，例如 BigTreeTech SKR Mini E3 V3.0 对应：

```bash
pio run -e STM32G0B1RE_btt
```

Auto Build Marlin 这个 VS Code 扩展则把环境选择藏到按钮后面，适合不想手记环境名的用户。

### 案例 2：读懂切片器启动 G-code

Marlin 的常见使用姿势不是手写整份打印文件，而是看懂切片器开头那几十行启动命令。

```gcode
G28          ; 所有轴回零
M104 S200    ; 热端目标温度 200 度，不等待
M140 S60     ; 热床目标温度 60 度，不等待
M109 S200    ; 等热端到温
G1 X50 Y25.3 E22.4 F1500
```

逐部分解释：

- `G28` 先找限位，建立“当前位置在哪里”的基准。
- `M104` 只设置热端目标温度，固件会在后台继续升温；如果要等温度到位，用 `M109`。
- `G1` 是线性移动，`X/Y` 是目标坐标，`E` 是挤出量，`F` 是进给速度。

这段展示了 Marlin 的工作方式：每条命令都短，但固件要把它和温度、坐标、挤出、加速度同步起来。

### 案例 3：用固件命令做调平和 PID 调参

Marlin 的另一个真实使用姿势，是通过 G-code 让机器自己测量或校准。

```gcode
M303 E0 C8 S210
M303 E-1 C8 S60
G28
G29
M500
M420 S1
```

逐部分解释：

- `M303 E0 C8 S210` 给 0 号热端做 210 度、8 轮 PID 自动调参。
- `M303 E-1 C8 S60` 给热床做 60 度 PID 自动调参，`E-1` 在这里表示热床。
- `G28` 回零之后再 `G29` 自动调平，避免机器还不知道坐标就开始探测。
- `M500` 把可保存的设置写入 EEPROM，`M420 S1` 在之后的启动 G-code 里启用已保存的调平数据。

这不是“神秘口诀”，而是在告诉固件：先知道机器边界，再测床面，再把结果保存成下次能用的状态。

## 踩过的坑

1. **配置文件和源码分支不匹配**：Marlin README 提醒要选兼容分支，旧配置直接丢进新源码可能因为选项改名而编译失败。

2. **只改 `MOTHERBOARD` 不看芯片和驱动**：同一外壳型号可能换过不同 MCU 或步进驱动，板号错了会导致引脚、串口、定时器全错。

3. **以为 `G29` 后就永久有效**：自动调平数据先在 RAM 里，没用 `M500` 保存，断电或重连后就可能丢失。

4. **8-bit 板子什么功能都想开**：老 AVR 板空间很小，启用彩屏、复杂调平、网络、更多轴可能超出 Flash 或 RAM。

## 适用 vs 不适用场景

**适用**：

- 你想给常见 FDM 3D 打印机刷开源固件，而不是依赖厂商闭源包。
- 你要学习 G-code、运动规划、PID 温控、限位安全这些嵌入式控制基本功。
- 你手上有 8-bit 老板子或多种 32-bit 主板，希望用同一套固件生态维护。
- 你愿意按机器真实硬件逐项核对配置，并在第一次运动时守着电源开关。

**不适用**：

- 你只想开箱即打，不想碰编译、刷机、探针偏移和启动 G-code。
- 你要极限高速打印，并且更想把复杂计算放到树莓派或 Linux 主机上；这时可以对比 [[klipper]]。
- 你做的是工业安全控制，需要认证链路、冗余安全设计和供应商责任，而不是社区固件。
- 你完全不知道主板型号、热敏电阻型号、驱动型号，却希望随便下载一个配置就安全可用。

## 历史小故事（可跳过）

- **RepRap 时代**：3D 打印社区需要一种能在廉价 Arduino 类主板上跑的固件，把 G-code 和步进电机控制接起来。
- **2011 年前后**：Erik van der Zalm 创建 Marlin，后来 Scott Lahteine 等维护者接过长期维护工作。
- **Marlin 1.x**：8-bit AVR 是主战场，RAM 和 Flash 很紧，很多功能都要在“够用”和“塞得下”之间取舍。
- **Marlin 2.x**：项目把 32-bit ARM、ESP32、LPC1768 等平台纳入同一代码库，HAL 变得更关键。
- **现在**：Marlin 仓库约 17k stars，官方文档覆盖配置、安装、G-code、硬件、开发指南和大量故障排查入口。

## 学到什么

1. 固件不是“硬件附属品”，它定义了机器如何理解坐标、速度、温度和安全边界。
2. 编译期配置是嵌入式的常见策略：少一点运行时灵活性，换来更小、更快、更适合 MCU 的二进制。
3. HAL 的价值很具体：让上层运动和 G-code 逻辑不必为每块 MCU 重写一遍。
4. 3D 打印调参不是玄学；大多数步骤都能还原成“让固件获得更准确的机器模型”。

## 延伸阅读

- 官方 README：[MarlinFirmware/Marlin](https://github.com/MarlinFirmware/Marlin)
- 官方文档入口：[Marlin Firmware Docs](https://marlinfw.org/docs/)
- 配置说明：[Configuring Marlin](https://marlinfw.org/docs/configuration/configuration.html)
- G-code 索引：[Marlin G-code](https://marlinfw.org/meta/gcode/)
- [[klipper]] —— 同是 3D 打印固件，但把复杂运动计算拆到主机侧。
- [[platformio-core]] —— Marlin 推荐构建链路之一，理解它能少踩编译环境坑。

## 关联

- [[klipper]] —— 对比 Marlin 的“MCU 自己算”和 Klipper 的“主机算、MCU 准时执行”。
- [[platformio-core]] —— Marlin 2.x 常用 PlatformIO 构建，环境名和板卡定义都在这里发挥作用。
- [[arduino-cli]] —— Marlin 仍保留 Arduino IDE 路线，能帮助理解早期 8-bit 生态。
- [[embedded-hal]] —— Rust 生态的硬件抽象层，可对照 Marlin HAL 的跨板思路。
- [[freertos]] —— 同属嵌入式实时领域，但 Marlin 是面向打印机的固件，不是通用 RTOS。
- [[micropython]] —— 另一条 MCU 编程路线；解释执行更友好，但不适合 Marlin 这种步进实时控制核心。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
