---
title: Marlin Firmware — 3D 打印机的「一体式管家固件」
来源: 'https://github.com/MarlinFirmware/Marlin'
日期: '2026-06-13'
子分类: 嵌入式
分类: 操作系统
provenance: 'pipeline-v3'
---

## 是什么

**Marlin** 是 [MarlinFirmware/Marlin](https://github.com/MarlinFirmware/Marlin) 维护的开源 **3D 打印机固件**：跑在主控 MCU（如 STM32、AVR）上，负责解析 G-code、规划运动、驱动步进电机、控温、读限位与探针，把切片软件输出的「打印剧本」变成真实的塑料层。

日常类比：**住在打印机主板里的全能管家**。

想象你点了一份复杂套餐（G-code 文件）。传统做法不是请外卖员（上位机）每走一步都喊一声，而是把 **菜单解读、路线规划、火候控制、开关火、摇锅** 全部交给 **一位住在厨房里的管家（Marlin）**——他脑子（Flash/RAM）不大，但必须在毫秒级反应：该加热到 210°C 时不能犹豫，该在拐角减速时不能算错，该在热敏电阻脱落时立刻关火。Marlin 自 2011 年起为 RepRap / Ultimaker 生态服务，至今仍是全球装机量最大的 3D 打印机固件之一；许多 Creality、Prusa 兼容机出厂或社区改装都基于 Marlin。

与 [[klipper]] 的架构对比：Klipper 把「算路径」放到树莓派，MCU 只执行节拍表；Marlin 则是 **All-in-One**——G-code 解析、运动规划、步进脉冲、PID 温控全在同一颗芯片上完成。优点是 **单板、离线、不依赖 Linux 主机**；代价是复杂功能（高速输入整形、多板协同）受 MCU 算力与 Flash 约束，改配置通常要 **重新编译并刷写固件**。

## 解决什么问题

消费级 3D 打印需要一套 **实时、可配置、可审计** 的底层控制栈：

| 痛点 | 没有专用固件时 | Marlin 的回应 |
| --- | --- | --- |
| 硬件千差万别 | 每块板引脚、驱动、传感器不同 | `Configuration.h` 用 `#define` 描述你的机器 |
| 切片器只懂 G-code | 主机无法直接 GPIO 步进 | 内建 G-code 解释器 + 运动规划器 |
| 加热失控风险 | 裸 PID 可能无限加热 | 热失控保护（Thermal Runaway）、加热失败监测 |
| 床面不平 | 首层 adhesion 差 | ABL（自动调平）、网格补偿、探针协议 |
| 断电丢进度 | 长打印中断即废 | 可选 Power Loss Recovery |
| 功能开关爆炸 | 全编译固件太大 | PlatformIO 条件编译，未启用模块不进镜像 |

Marlin 要回答的核心问题是：**如何在资源有限的 MCU 上，安全、精确、可配置地执行 3D 打印所需的全部实时任务？**

## 核心概念

### 1. 配置即编译：`Configuration.h` 与 `Configuration_adv.h`

Marlin 不用运行时 JSON 描述打印机——它在 **编译期** 用 C 预处理器决定「这台机器有什么」。官方文档 [Configuring Marlin](https://marlinfw.org/docs/configuration/configuration.html) 规定：

| 文件 | 职责 |
| --- | --- |
| `Configuration.h` | 主板型号、步进驱动、传感器、语言、常用功能开关 |
| `Configuration_adv.h` | 高级选项：热保护参数、Filament Runout、调试、实验特性 |
| `Config.h`（2.1.3+ 可选） | **最小覆盖**：只写你改过的项，替代上述两文件 |

启用某功能通常是 **取消注释** `#define`；禁用则注释掉或 `#undef`。编译时 Marlin 会检查 `CONFIGURATION_H_VERSION`，版本不匹配会报错并提示迁移项——这是防止「旧配置 + 新源码」 silent break 的安全阀。

配套仓库 [MarlinFirmware/Configurations](https://github.com/MarlinFirmware/Configurations) 按 **release 分支** 提供各机型样板；下载 ZIP 时务必选对与固件版本一致的分支。

### 2. 数据流水线：G-code → 分段 → 规划器 → 步进 ISR

Marlin 官方 [Code Structure](https://marlinfw.org/docs/development/code_structure.html) 把运动控制拆成四级：

```
(1) G-code 解析 (GcodeSuite)
        ↓
(2) 高层运动：G0/G1/G2/G3 等 → 线性小段 (motion.cpp)
        ↓
(3) Planner 队列：加减速、junction deviation (planner.cpp)
        ↓
(4) Stepper ISR：Bresenham 协调多轴 STEP 脉冲 (stepper.cpp)
```

- **G-code 层**：`Marlin/src/gcode/` 下按类别分目录（`motion/`、`temp/`、`bedlevel/`…），统一由 `GcodeSuite` 调度。
- **分段**：规划器层面 Marlin 主要做 **直线段**；圆弧 G2/G3、Delta/SCARA 运动学、调平补偿会在进入 Planner 前被切成更短的直线。
- **Planner**：维护块队列（block buffer），在拐角用 junction deviation 等算法限制向心加速度，避免急停急启。
- **Stepper ISR**：高优先级中断，频率可达 **数万次/秒**，用 Bresenham 算法对齐 X/Y/Z/E 的步进时刻——这是「听起来像打印机在唱歌」的物理来源。

理解这条链有助于调试：**层纹、共振、丢步** 往往在 Planner/ISR 参数；**首层、探针** 在 G-code 与 bedlevel 模块；**温度波动** 在 `temperature.cpp` 与 PID。

### 3. G-code：主机与固件的通用语言

切片器（Cura、PrusaSlicer、Orca）输出 `.gcode` 文本文件，常见指令：

| 命令 | 含义 |
| --- | --- |
| `G28` | 回原点（Homing） |
| `G0` / `G1` | 快速移动 / 直线插补（含挤出 E） |
| `M104 S210` | 设热端目标温度，**不等待** |
| `M109 S210` | 设热端目标温度，**等到位**（仅加热方向等待） |
| `M140` / `M190` | 热床目标 / 等待热床 |
| `M105` | 上报当前温度 |
| `M500` / `M501` / `M502` | 保存 / 加载 / 恢复 EEPROM 默认 |

Marlin 文档对每条命令有独立页面，例如 [M104](https://marlinfw.org/docs/gcode/M104.html)。`M104` 在后台继续加热的同时允许移动；首层前常用 `M109` 确保喷嘴已到温。

### 4. 热安全：Thermal Runaway 与 Heating Failed

`Configuration_adv.h` 中的 **THERMAL_PROTECTION** 系列选项实现两层防护：

1. **Heating failed（加热失败）**：发 `M104`/`M109` 后，若在 `WATCH_TEMP_PERIOD` 内温升不足 `WATCH_TEMP_INCREASE`，判定传感器异常或加热器失效，**停机**。
2. **Thermal runaway（热失控）**：已到目标温后，若读数长期低于目标超过 `THERMAL_PROTECTION_HYSTERESIS` 并持续 `THERMAL_PROTECTION_PERIOD`，判定失控（例如热敏电阻脱落读数偏低、固件仍加热），**关加热并 halt**。

现代 Marlin 在热错误时还会 **Park 喷头**（移离打印件），降低引燃塑料风险。误报时可微调 hysteresis/period，但 **不要为求快而关闭保护**——这是 Anet A8 等早期社区血的教训。

### 5. 构建系统：PlatformIO 与条件编译

根目录 `platformio.ini` 定义 **default_envs**（如 `STM32F103RC_btt`）。`buildroot/share/PlatformIO/scripts/` 下的脚本会：

- 读取你的 `#define`，从编译中 **剔除未用源文件**（缩小固件、加快构建）；
- 做配置版本预检（preflight-checks）。

推荐工具链：**VS Code + PlatformIO**，或 **Auto Build Marlin** 扩展一键编译上传。Arduino IDE 仍可用，但社区主流已是 PlatformIO。

### 6. 调平与网格：ABL / UBL / MBL

- **Manual Mesh (MBL)**：手动探点，适合无探针机器。
- **Auto Bed Leveling (ABL)**：BLTouch、inductive probe 等自动探床。
- **Unified Bed Leveling (UBL)**：更灵活的网格存储与编辑。

启用后在 `Configuration.h` 选择探针类型与引脚；G-code 侧常用 `G29` 触发探测序列。调平补偿在 Planner 层把 Z 微调叠加到移动上，让喷嘴跟随床面起伏。

### 7. EEPROM 与运行时覆盖

许多参数（steps/mm、PID、探针偏移）可在运行时用 G-code 修改，并通过 **M500** 写入 EEPROM，重启 **M501** 加载。这减轻「改一行配置就全量重编译」的频率，但 **新增功能开关** 仍须改 `Configuration.h` 并重刷固件。

## 代码示例

### 示例 1：`Configuration.h` 中的硬件骨架

下列片段展示零基础最常改的几项（具体值须对照你的主板与机械结构；勿直接抄进未知机器）：

```cpp
// 配置版本：必须与当前 Marlin 源码要求一致，否则编译报错并提示迁移
#define CONFIGURATION_H_VERSION 02010300

// 主板：决定引脚映射与 HAL（见 Marlin/src/pins/）
#define MOTHERBOARD BOARD_BTT_SKR_MINI_E3_V3_0

// 机器显示名（M115、LCD 上可见）
#define CUSTOM_MACHINE_NAME "My Ender-style Printer"

// 挤出机数量
#define EXTRUDERS 1

// 步进驱动类型（影响 TMC UART/SPI 配置）
#define X_DRIVER_TYPE  TMC2209
#define Y_DRIVER_TYPE  TMC2209
#define Z_DRIVER_TYPE  TMC2209
#define E0_DRIVER_TYPE TMC2209

// 每毫米步数（与丝杆导程、微步、齿轮比相关）
#define DEFAULT_AXIS_STEPS_PER_UNIT   { 80, 80, 400, 93 }

// 热端传感器类型与引脚（须与硬件一致）
#define TEMP_SENSOR_0 1  // 例如 EPCOS 100K
#define HEATER_0_PIN PC8

// 启用自动调平与 BLTouch（示例）
#define BLTOUCH
#define Z_SAFE_HOMING
#define Z_SAFE_HOMING_X_POINT 110
#define Z_SAFE_HOMING_Y_POINT 110
```

改完后在 PlatformIO 选择对应 `env` 编译。若报错 `error: #error "..."`，按编译器提示逐项更新配置——这是 Marlin 2.x 的 **自迁移向导**。

### 示例 2：切片起始 G-code 与温度等待

下面是一段典型的 **起始 G-code**（可放在 slicer 的「Print Start G-code」），说明 Marlin 如何被主机驱动：

```gcode
; 关风扇、设单位、用绝对坐标
M107
G21
G90

; 热端 / 热床升温（M109/M190 会阻塞直到到位）
M140 S60        ; 热床目标 60°C（不等待）
M104 S210       ; 热端目标 210°C（不等待）
M190 S60        ; 等待热床到 60°C
M109 S210       ; 等待热端到 210°C

; 回原点与调平
G28             ; 全轴 Homing
G29             ; 自动调平（需已在 Configuration.h 启用 ABL/UBL）
G1 Z5 F3000     ; 抬 Z 免刮床

; 清嘴、开始首层（示意）
G1 X0.1 Y20 Z0.3 F5000
G1 X0.1 Y200 E15 F1500
G1 X0.4 Y200 F5000
G92 E0          ; 挤出量归零
```

若打印中需 **中断加热等待**，可发送 `M108`（需启用 `EMERGENCY_PARSER` 时响应更快）。打印结束常用 `M104 S0`、`M140 S0` 降温，配合 `M84` 关闭步进省电。

### 示例 3：`platformio.ini` 选择编译环境

Marlin 为多板维护独立 environment；你通常只需改 **default_envs** 一行：

```ini
[platformio]
src_dir      = Marlin
boards_dir   = buildroot/share/PlatformIO/boards
default_envs = STM32G0B1RE_btt

[env:STM32G0B1RE_btt]
extends = env:STM32G0B1RE
board   = marlin_STM32G0B1RE
```

在 VS Code 底部状态栏切换 **Project Environment**，再 **Build** / **Upload**。首次成功编译后，用 `M115` 确认固件版本与 `DETAILED_BUILD_VERSION` 是否为你预期分支。

## 从零上手路径

1. **确认硬件**：主板型号、驱动（A4988/TMC2209…）、探针、热敏电阻类型、机械行程。
2. **拉匹配版本**：克隆 Marlin 与 Configurations **同一 release 分支**；复制最接近的 example config 到 `Marlin/` 目录。
3. **改 Configuration.h**：`MOTHERBOARD`、steps/mm、传感器、`EXTRUDERS`、驱动类型、安全选项。
4. **编译刷写**：PlatformIO Upload；通过 USB 连接后用 Pronterface、OctoPrint、Mainsail（若仍用 Marlin 串口）发 `M115` 验证。
5. **Tune**：PID `M303`，挤出 `M92 E...`，探针 Z offset `M851 Z...`，满意后 `M500` 保存。
6. **读文档**： [marlinfw.org](https://marlinfw.org/) 的 Configuration、G-code、Feature 页；改一项查一项，避免凭记忆乱开宏。

## 与 Klipper 如何选

| 维度 | Marlin | Klipper |
| --- | --- | --- |
| 架构 | 单 MCU 全包 | 主机 + MCU 分工 |
| 改配置 | 多数功能要重编译 | `printer.cfg` 重启服务 |
| 主机依赖 | 无（可纯 SD 打印） | 需要 Linux 类主机 |
| 步进 timing | MCU 内 Bresenham ISR | 主机算精确时刻表 |
| 社区机型 | 极多出厂/改装案例 | 增长快，需自行配 cfg |
| 适合谁 | 入门机、离线、单板 | 高速、共振补偿、多 MCU |

许多玩家 **先用 Marlin 熟悉 G-code 与机械**，再迁 Klipper；二者 G-code 表面相似，但配置哲学完全不同。

## 常见坑

- **配置版本与固件版本不匹配**：从 GitHub 随便下 ZIP 极易踩坑；用 Configurations 仓库 **同名分支**。
- **引脚抄错**：同系列板（如 SKR Mini E3 V2 vs V3）引脚不同，`MOTHERBOARD` 必须精确。
- **ABL 未设 Z safe homing**：探针在 bed 外时 `G28` 可能把 nozzle 扎床。
- **关闭热保护**：Never do this on unattended prints.
- **Steps/mm 未校准**：XYZ 尺寸不准、E 过度挤出，先校准再怪切片。

## 延伸阅读

- 官方配置：[Configuring Marlin](https://marlinfw.org/docs/configuration/configuration.html)
- 代码结构：[Code Structure](https://marlinfw.org/docs/development/code_structure.html)
- G-code 索引：[marlinfw.org/meta/gcode](https://marlinfw.org/meta/gcode/)
- 对比阅读：本站 [[klipper]] 笔记（主机/MCU 分离架构）
- 最小 Config.h：[PR #27338](https://github.com/MarlinFirmware/Marlin/pull/27338)（2.1.3+ 只写差异项）

---

Marlin 的学习曲线集中在 **「读 Configuration 注释 + 敢编译 + 会用 G-code 验证」**。它不像 Klipper 那样改 cfg 即生效，但 **单文件固件、离线 SD 打印、海量机型范例** 使它仍是零基础理解 3D 打印机实时控制的最佳入口之一：先搞懂 G-code → 分段 → Planner → Stepper 这条链，再读 `#define` 开关，你会 suddenly 明白切片器里每一行起始 G-code 在指挥管家做什么。
