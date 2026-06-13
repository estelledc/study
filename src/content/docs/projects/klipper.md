---
title: Klipper — 把 3D 打印机的「大脑」和「手脚」拆开的固件架构
来源: 'https://github.com/Klipper3d/klipper'
日期: '2026-06-13'
子分类: 嵌入式
分类: 操作系统
难度: '中级'
provenance: 'pipeline-v3'
---

## 是什么

**Klipper** 是 [Klipper3d/klipper](https://github.com/Klipper3d/klipper) 维护的一套 **3D 打印机固件**，但它和传统 Marlin / RepRapFirmware 的写法完全不同：不是把「算路径、控温度、解析 G-code、驱动步进电机」全部塞进一块 8 位 MCU，而是拆成 **主机（Host）+ 微控制器（MCU）** 两层协作。

日常类比：**交响乐团 vs 指挥 + 乐手**。

传统一体固件像一个小型乐队——指挥兼小提琴手兼定音鼓，每个人都要会所有乐器，舞台（Flash/RAM）又只有几平米，复杂曲子（高速打印、输入整形、多 MCU）一上就挤爆。Klipper 则请一位 **指挥（树莓派 / 小主机上的 Klippy，Python 实现）** 在后台算好整首曲子的每个音符时间点，再把 **极短、极准的节拍表** 发给 **乐手（MCU 上的 C 固件）** 按微秒级时间表拨弦（发步进脉冲）。指挥负责「想」，乐手负责「到点动」——分工清楚，各自只做最擅长的事。

官方文档把这套关系概括为：主机做 G-code 解析、运动学、前瞻（look-ahead）、温度算法；MCU 做 GPIO、步进调度、硬件定时器。二者通过 **低延迟二进制 RPC 协议**（串口 / USB / CAN）通信，连接时 MCU 还会下发 **data dictionary（数据字典）**，让主机动态知道「我能执行哪些命令」——换固件不必改主机代码。

和 [[octoprint]] / Mainsail / Fluidd 的关系是上下游：它们提供 Web 界面发 G-code；Klipper 的 `klippy` 进程接收 G-code 并真正驱动打印机。和 [[marlin]] 的对比则是架构级：Marlin 全在 MCU；Klipper 把算力搬到 Linux 主机，MCU 只做实时执行，因此同一颗 ATmega 也能跑到 17 万步/秒以上，新 MCU 可达数百万步/秒。

## 解决什么问题

消费级 3D 打印机固件长期面临一组矛盾：

| 痛点 | 传统 MCU 一体固件 | Klipper 的回应 |
| --- | --- | --- |
| 算力天花板 | 8/32 位 MCU RAM/Flash 有限，复杂算法难塞进去 | 主机跑 Python + C helper，算法迭代快 |
| 步进精度 | 常用 Bresenham 等近似，高速时易丢步/共振 | 按物理加速度算精确步进时刻，精度约 25µs |
| 改配置 | 常需重新编译、刷写 MCU 固件 | 几乎全部配置在 `printer.cfg`，改完重启服务即可 |
| 多 MCU | 多板协同、时钟同步复杂 | 配置里多写几个 `[mcu xxx]` 段，主机做 clock sync |
| 功能扩展 | C 宏、条件编译，门槛高 | `gcode_macro` + Jinja2 模板，用户可编程宏 |
| 打印质量 | 转角挤出、振纹（ringing）难调 | Smooth Pressure Advance、Input Shaping 等内建 |

Klipper 要回答的核心问题是：**能否用廉价 Linux 板（如 Raspberry Pi）的算力，换 MCU 上省下的复杂度，同时让步进 timing 比传统方案更准、更快？**

## 核心概念

### 1. 三层架构：Host ↔ Protocol ↔ MCU

```
切片器 G-code
    ↓
Klippy (klippy/klippy.py)     ← Python：解析、规划、温控、宏
    ↓ 二进制 RPC + data dictionary
MCU 固件 (src/stm32/, src/avr/ …)  ← C：定时器调度、步进脉冲
    ↓
步进驱动 / 加热棒 / 风扇 / 探针
```

- **Klippy**：入口在 `klippy/klippy.py`，读 `printer.cfg`，加载 `[stepper_x]`、`[extruder]` 等模块，G-code 主循环在 `gcode.py` 的 `_process_commands()`。
- **MCU 固件**：按架构分目录（`src/avr/`、`src/stm32/`、`src/rp2040/` 等），用 `DECL_COMMAND()` 声明主机可调用的命令。
- **协议**：见官方 [Protocol](https://www.klipper3d.org/Protocol.html)——消息块带 CRC、序列号；主机启动时通过 `identify` 分块拉取 zlib 压缩的 JSON 字典。

人类可读协议示例（文档中的说明性文本，实际线上为压缩二进制）：

```
set_digital_out pin=PA3 value=1
queue_step oid=7 interval=7458 count=10 add=331
queue_step oid=7 interval=117 add=1281 count=4 add=1281
```

第一条开引脚，后面 `queue_step` 在指定 **MCU 时钟 tick** 排队步进脉冲——复杂轨迹在主机算好，MCU 只执行时间表。

### 2. `printer.cfg`：声明式打印机描述

Klipper **没有** Marlin 式「改源码再编译」的主流程。打印机几何、引脚、驱动、传感器全写在配置文件里，常见主文件路径为 `~/printer_data/config/printer.cfg`（因发行版而异）。

关键段落类型：

| 配置段 | 作用 |
| --- | --- |
| `[mcu]` | 主控板串口 / CAN UUID、波特率 |
| `[printer]` | 运动学类型、`max_velocity`、`max_accel` |
| `[stepper_x]` 等 | 步进引脚、`rotation_distance`、微步、归零 |
| `[extruder]` | 挤出机、热端、PID |
| `[heater_bed]` | 热床 |
| `[gcode_macro …]` | 用户自定义 G-code 宏 |

引脚命名直接用硬件名（如 `PA4`），可用 `!` 反相、`^` 上拉。

### 3. 运动规划：Look-ahead 与精确步进

`toolhead.py` 里的 **ToolHead** 维护移动队列，对连续 G1 做 **lookahead** 合并加减速，避免每个拐角都停到零。Klipper 强调：不用 Bresenham 走近似线，而用 **迭代求解器** 从运动学方程算步进时刻——对 delta、corexy、极坐标等非笛卡尔机同样适用。

相关高级功能：

- **Smooth Pressure Advance**：补偿挤出机内压力，减轻转角渗料。
- **Input Shaping**：用加速度计（如 ADXL345）测共振，抑制「鬼影/振纹」。
- **Bed Mesh / 探针**：网格调平、BLTouch、Z 相位 endstop 等。

### 4. 多 MCU 与 clock sync

一块板子管 XY，另一块管挤出机和热端——在 Klipper 里只需额外 `[mcu toolboard]` 段，引脚写成 `toolboard:PA1` 形式。主机 `mcu.py` 负责 **时钟同步**，补偿各板晶振漂移，对上层仍是「一台打印机」。

### 5. G-code 宏与 Jinja2：`gcode_macro`

配置里可直接定义新 G-code 命令，正文是 **Jinja2 模板**，运行时展开成 G-code 序列。可读取 `printer.heater_bed.temperature` 等状态，做条件分支、循环——相当于给打印机写「脚本语言」，无需改 Klipper 源码。

### 6. API Server 与前端生态

除串口 G-code 外，Klipper 提供 **JSON API**（Unix socket），Mainsail、Fluidd、OctoPrint 插件等通过它与 `klippy` 交互。开发者可写外部 Job 监控、农场管理软件。

### 7. 支持的硬件面

- **主机**：Raspberry Pi、PC、部分 SBC。
- **MCU**：AVR、STM32、LPC176x、RP2040/RP2350、PRU、Linux MCU 模式等。
- **运动学**：cartesian、corexy、delta、polar、winch 等（见 `[printer]` 的 `kinematics`）。

## 代码示例

### 示例 1：最小可理解的 `printer.cfg` 片段

下面是一个 **笛卡尔机** 的骨架（引脚与 `rotation_distance` 需按你的硬件修改；官方 `config/` 目录有各机型样板）：

```ini
# 主控 MCU：USB 串口连接
[mcu]
serial: /dev/serial/by-id/usb-Klipper_stm32f103xx_...
restart_method: command

# 打印机全局运动限制
[printer]
kinematics: cartesian
max_velocity: 300
max_accel: 3000
max_z_velocity: 15
max_z_accel: 100

# X 轴步进（rotation_distance 见官方 Rotation Distance 文档）
[stepper_x]
step_pin: PF0
dir_pin: PF1
enable_pin: !PD7
microsteps: 16
rotation_distance: 40
endstop_pin: ^PC0
position_endstop: 0
position_max: 235
homing_speed: 50

[stepper_y]
step_pin: PF6
dir_pin: !PF7
enable_pin: !PD7
microsteps: 16
rotation_distance: 40
endstop_pin: ^PC1
position_endstop: 0
position_max: 235
homing_speed: 50

[stepper_z]
step_pin: PL3
dir_pin: PL1
enable_pin: !PK0
microsteps: 16
rotation_distance: 8
endstop_pin: ^PD3
position_endstop: 0.0
position_max: 250

[extruder]
step_pin: PA4
dir_pin: PA6
enable_pin: !PA2
microsteps: 16
rotation_distance: 33.500
nozzle_diameter: 0.400
filament_diameter: 1.750
heater_pin: PB4
sensor_type: EPCOS 100K B57560G104F
sensor_pin: PK5
control: pid
pid_Kp: 22.2
pid_Ki: 1.08
pid_Kd: 114
min_temp: 0
max_temp: 275

[heater_bed]
heater_pin: PH5
sensor_type: Generic 3950
sensor_pin: PK6
control: watermark
min_temp: 0
max_temp: 110
```

改配置后通常执行 `sudo systemctl restart klipper`（或你的安装脚本提供的等价命令），**不必**重刷 MCU 固件——除非你要升级 Klipper 版本本身。

### 示例 2：带参数与状态读取的 `gcode_macro`

官方 [Command templates](https://www.klipper3d.org/Command_Templates.html) 推荐：宏内若要用 `G1` 移动，先用 `SAVE_GCODE_STATE` / `G91` / `RESTORE_GCODE_STATE` 避免污染全局坐标模式。

```ini
[gcode_macro SET_BED_TEMPERATURE]
description: 设置热床目标温度，默认 60°C
gcode:
  {% set bed_temp = params.TEMPERATURE|default(60)|float %}
  M140 S{bed_temp}
  M117 Bed target {bed_temp}C

[gcode_macro MOVE_UP]
description: 相对当前位置 Z 轴上移 10mm
gcode:
  SAVE_GCODE_STATE NAME=move_up_state
  G91
  G1 Z10 F300
  RESTORE_GCODE_STATE NAME=move_up_state

[gcode_macro QUERY_STATUS]
description: 在屏幕/终端显示挤出机与热床温度
gcode:
  M117 E:{printer.extruder.temperature|round(1)} / B:{printer.heater_bed.temperature|round(1)}
```

终端用法：

```gcode
SET_BED_TEMPERATURE TEMPERATURE=70
MOVE_UP
QUERY_STATUS
```

宏名大小写不敏感；带数字时数字须在末尾（`PROBE25` 合法，`PROBE25_FAST` 不合法）。

## 安装与日常运维（零基础路径）

1. **刷 MCU 固件**：用 `make menuconfig` 选主板型号，编译后通过 `flash.sh` 或 UF2 烧录（详见 [Installation](https://www.klipper3d.org/Installation.html)）。
2. **装主机端**：Klipper + Moonraker（常见）+ Mainsail/Fluidd；或使用 KIAUH 等一键脚本。
3. **拷贝/编写 `printer.cfg`**：从官方 `config/` 找最接近的机型，改 `serial`、引脚、`rotation_distance`。
4. **校准**：`PID_CALIBRATE`、`PROBE_CALIBRATE`、Delta/CoreXY 调平等按文档逐步做。
5. **升级**：拉 git 新版本 → 重编 MCU（若协议变）→ 重启服务；关注 [Config changes](https://www.klipper3d.org/Config_Changes.html) 以免配置项过时。

常用调试入口：

- 日志：`~/printer_data/logs/klippy.log`
- 主机命令：`~/klipper/scripts/graph_accelerometer.py`（共振测量）、`GET_POSITION` 等 G-code
- 开发者先读 [Code overview](https://www.klipper3d.org/Code_Overview.html)

## 性能与选型参考

官方 [Features](https://www.klipper3d.org/Features.html) 给出步进基准（单轴 / 三轴同时）：

| MCU 示例 | 1 轴 | 3 轴 |
| --- | --- | --- |
| 16MHz AVR | 157K 步/秒 | 99K |
| STM32F103 | 1180K | 818K |
| RP2040 | 4000K | 2571K |
| STM32H723 | 7429K | 8619K |

高步进率 → 更高打印速度潜力；配合 Input Shaping 可在提速同时控制振纹。

## 与其他方案怎么选

| 方案 | 特点 | 更适合 |
| --- | --- | --- |
| **Marlin** | 全 MCU、生态最大、离线单板 | 不想挂 SBC、极简硬件 |
| **Klipper** | 主机+MCU、配置驱动、宏与 API 强 | 有 Pi、追求速度/质量/可编程 |
| **RepRapFirmware** | Duet 生态、G-code 宏也强大 | Duet 硬件用户 |

若你已有树莓派和 USB 主板，Klipper 通常是 **性价比最高的升级路径**之一：硬件不必换，主要增加主机算力与配置学习成本。

## 学习资源

- 官方总览：[Overview](https://www.klipper3d.org/Overview.html)
- 配置全集：[Config Reference](https://www.klipper3d.org/Config_Reference.html)
- 协议与字典：[Protocol](https://www.klipper3d.org/Protocol.html)
- 源码树：`klippy/`（主机 Python）、`src/`（MCU C）、`config/`（样例配置）
- 社区：Klipper Discourse、各发行版 Discord；中文用户常搜「Klipper 安装」「printer.cfg 教程」

## 小结

Klipper 的本质不是「又一个 Marlin」，而是 **把 3D 打印机控制拆成「Linux 上算轨迹 + MCU 上准时步进」** 的分布式实时系统。零基础入门抓住四条即可：

1. 分清 **Klippy（主机）** 与 **MCU 固件** 的职责；
2. 几乎所有行为由 **`printer.cfg`** 声明；
3. 主机与 MCU 靠 **data dictionary + 定时 queue_step** 协作；
4. 用 **`gcode_macro`** 扩展工作流，而不必 fork 固件。

当你能读懂一份官方样例配置、并成功跑通一次 PID 与 bed mesh，就已经从「会用切片软件」迈进「能驾驭打印机固件」的门槛了。
