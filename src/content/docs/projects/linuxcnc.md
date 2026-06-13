---
title: LinuxCNC — 在 Linux 上跑完整 CNC「机床操作系统」
来源: 'https://github.com/LinuxCNC/linuxcnc'
日期: '2026-06-13'
子分类: 嵌入式
分类: 操作系统
provenance: 'pipeline-v3'
---

## 是什么

**LinuxCNC** 是 [LinuxCNC/linuxcnc](https://github.com/LinuxCNC/linuxcnc) 维护的一套 **开源 CNC 机床控制软件套件**：在 Linux 上协调最多 **9 轴** 运动，驱动铣床、车床、激光切割机、等离子切割机、3D 打印机、机械臂、六足机器人等「按坐标精确运动的机器」。它不是单一固件，而是一组可深度定制的应用——GUI、实时运动控制、I/O、硬件抽象层（HAL）拼成完整闭环。

日常类比：**机床上的「总调度中心 + 接线间 + 操作面板」**。

想象一家自动化小工厂。CAM 软件写好「今天加工什么」（G-code 程序文件）；操作员坐在 **操作面板**（AXIS、Touchy、QtDragon 等 GUI）前点按钮、看坐标、按急停。后台有个 **总调度**（EMCTASK + EMCMOT 运动控制器）按时间表指挥各轴何时加速、何时到位。真正连到电机驱动器、限位开关、主轴启停的那一堆线，不直接焊死在代码里，而是经过一间 **接线间**（HAL）——里面全是「虚拟插头」：谁输出脉冲、谁读限位、谁点亮「主轴就绪」灯，都用配置文件 **插线**，换一块 Mesa 板或并口接线不必改 C 源码。

与 [[grbl]] 对比：Grbl 是烧在 Arduino 上的 **单片机固件**，主机只发串口 G-code；LinuxCNC 跑在 **完整 Linux PC** 上，算力大、可接专业运动控制卡（Mesa、EtherCAT 等），适合工坊级铣床与多轴设备。与 [[klipper]] 对比：Klipper 把「规划」放主机、「脉冲」放 MCU；LinuxCNC 传统上在 **同一台 Linux 的实时线程** 里完成规划与步进（也可接硬件运动接口 offload），配置风格是 **INI + HAL** 而非 `printer.cfg`。

官方用户手册强调：LinuxCNC 已发展 **25 年以上**，GPL-2.0 许可；当前稳定文档对应 2.9 系列，GitHub 上约 2200+ stars，社区横跨全球创客与专业机修车间。

## 解决什么问题

在 LinuxCNC 出现之前，许多 DIY 与小型车间依赖 **Windows + 专有 CNC 软件** 或 **并口直吐脉冲**：换电脑、换系统、备份配置都痛苦，实时性受桌面系统调度影响，高级 I/O（刀库、Modbus 主轴、探针）往往要额外买闭源插件。

| 痛点 | 专有 / 并口方案 | LinuxCNC 的回应 |
| --- | --- | --- |
| 平台锁定 | 绑定 Windows 与特定硬件 | 开源 Linux，可 Live CD 或 deb 安装 |
| 接线与扩展 | 改线 = 改程序或不敢改 | HAL 用文本「网线」连接逻辑，组件可组合 |
| 多轴与多机型 | 一套软件一种机床 | 同一框架支持铣、车、激光、等离子 GUI |
| 配置可维护 | 参数散落、难版本管理 | 配置目录：`*.ini` + `*.hal` + 刀表，可 Git 管理 |
| 安全文化 | 仅靠软件急停 | 文档强调 **硬件急停链** 不可被软件替代 |

核心问题：**能否用开源栈，在普通 PC 上可靠地执行 G-code，并把「机床长什么样」完全交给可编辑配置，而不是重新编译内核？** LinuxCNC 的答案支撑了全球大量改装铣床、雕刻机与工业 retrofit。

## 核心概念

### 1. 四大块：GUI、HAL、运动控制、任务执行

官方架构可简化为：

```
操作员 ↔ GUI（AXIS / Touchy / QtDragon …）
              ↕
         EMCTASK（任务：读程序、模式切换）
              ↕
    EMCMOT（运动：轨迹、速度规划） + EMCIO（数字 I/O）
              ↕
         HAL（引脚/信号/参数 虚拟接线）
              ↕
    并口 / Mesa / EtherCAT / 其他 Supported Hardware
              ↕
         步进/伺服驱动、主轴、冷却、限位
```

- **GUI**：人机界面；在 INI 里用 `DISPLAY = axis` 等选择。常见还有 GMOCCAPY、QtPlasmaC（等离子专用）、NGCGUI（子程序向导）。
- **HAL（Hardware Abstraction Layer）**：把内部组件的 **pin（引脚）**、**signal（信号）**、**parameter（参数）** 连成网络；语法由 `halcmd` / `.hal` 文件描述。
- **EMCMOT**：实时运动模块，处理关节空间轨迹、跟随误差等。
- **INI 文件**：机床「身份证」——轴数、行程、步进每毫米脉冲数、GUI 类型、加载哪些 HAL 文件。

典型 3 轴并口步进配置，配置向导会生成目录 `My_CNC/`，内含 `My_CNC.ini`、`My_CNC.hal`、`custom.hal`、`custom_postgui.hal`、`tool.tbl` 等（见 [User Introduction](https://linuxcnc.org/docs/html/user/user-intro.html)）。

### 2. INI：机床参数表

INI 按 **段（section）** 组织，方括号标名，如 `[TRAJ]`、`[AXIS_0]`、`[HAL]`。段内 `关键字 = 值`；同一配置目录下路径常相对于 INI 所在文件夹。

常见段职责：

| 段 | 含义 |
| --- | --- |
| `[EMC]` | 版本、机器名、MACHINE 类型 |
| `[DISPLAY]` | 用哪个 GUI |
| `[TRAJ]` | 坐标系、轴数、最大速度 |
| `[AXIS_n]` | 每轴行程、回零、限位逻辑 |
| `[HAL]` | 启动时执行哪些 `.hal`、是否 `TWOPASS` |
| `[TASK]` | 任务控制器选项 |
| `[RS-232]` / `[SPINDLE]` 等 | 串口主轴、变频器 |

`[HAL]` 段可列出多个 `HALFILE`，按顺序执行；还可 `POSTGUI_HALFILE` 在 GUI 创建 HAL 引脚 **之后** 再接线（例如接 PyVCP 面板上的 LED）。

### 3. HAL：软件里的配电箱

HAL 核心命令（[`halcmd` / HAL Basics](https://linuxcnc.org/docs/html/hal/basic-hal.html)）：

| 命令 | 作用 |
| --- | --- |
| `loadrt` | 加载 **实时** 组件（如 `stepgen`、`pid`） |
| `loadusr` | 加载 **非实时** 用户空间组件（如 `halui`） |
| `addf` | 把组件函数挂到 **线程**（`base-thread` 快、`servo-thread` 慢且支持浮点） |
| `net` | 用 **信号** 连接多个 **引脚**（替代老式 `linksp`） |
| `setp` | 设置未联网引脚或 **参数** 的数值 |
| `sets` | 设置信号值（无 writer 时） |

引脚方向规则：`IN` 可读；`OUT` 只能有一个 writer；`IO` 可双向但受信号上已有连接约束。并口引脚名里的 `in`/`out` 表示 **物理电气特性**，与 HAL 逻辑流向无关——读文档时要反过来理解。

线程分工典型模式：

- **base-thread**（周期约几十微秒）：并口读限位、发步进脉冲，**无浮点**。
- **servo-thread**（周期约 1ms）：运动控制、PID、逻辑门组件，**有浮点**。

### 4. 三种操作模式

操作员视角（[User Introduction § Modes](https://linuxcnc.org/docs/html/user/user-intro.html)）：

| 模式 | 行为 | 典型用途 |
| --- | --- | --- |
| **Manual（手动）** | 单条即时命令：点动、开冷却 | 装刀、对刀、挪工件 |
| **Auto（自动）** | 运行整个 G-code 文件 | 批量加工 |
| **MDI** | 输入一行 G-code 立即执行 | 对刀 `G38.2`、改坐标系 `G10` |

急停、Abort、进给倍率等在多模式下行为一致。AXIS 等 GUI 会 **自动切换模式** 以完成「对刀」「回零」等复合操作。

### 5. G-code 与刀表

程序默认放在配置旁的 `nc_files/` 或 INI 指定目录。`tool.tbl` 记录刀号、直径、长度，供 **刀长补偿** 与换刀逻辑使用。INI 可开 `INI_VARS = 1`，让 G-code 通过 `#<_ini[section]var>` 读取配置变量——把机床参数带进程序里。

### 6. 与 Grbl / Klipper 的定位

| 维度 | Grbl | Klipper | LinuxCNC |
| --- | --- | --- | --- |
| 运行环境 | AVR MCU | Linux 主机 + MCU | Linux（实时内核/线程） |
| 配置 | `$` 串口设置 | `printer.cfg` | INI + HAL |
| 典型规模 | 小型雕刻机 | 3D 打印机 | 铣床、车床、等离子 |
| 扩展 I/O | 有限 GPIO | 多 MCU、CAN | Mesa、EtherCAT、Modbus |

三者都解析 G-code，但 LinuxCNC 更偏 **通用机床集成商** 路线：Wizard 生成配置、HAL 搭逻辑、多种 GUI 面向不同人机场景。

## 代码示例

### 示例 1：INI 片段——声明 HAL 与单轴参数

下面是一个 **教学用** 的 INI 节选，展示如何指定 GUI、轨迹轴数，以及 X 轴行程与 HAL 加载顺序（字段名与官方 [INI Configuration](https://linuxcnc.org/docs/html/config/ini-config.html) 一致）：

```ini
[EMC]
VERSION = 1.1
MACHINE = My_Mill
DEBUG = 0

[DISPLAY]
DISPLAY = axis
POSITION_OFFSET = RELATIVE
POSITION_FEEDBACK = ACTUAL
MAX_FEED_OVERRIDE = 1.2
MAX_SPINDLE_OVERRIDE = 1.0

[TRAJ]
COORDINATES = X Y Z
LINEAR_UNITS = mm
ANGULAR_UNITS = degree
DEFAULT_LINEAR_VELOCITY = 6.0
MAX_LINEAR_VELOCITY = 25.0
NO_FORCE_HOMING = 1

[AXIS_0]
TYPE = LINEAR
HOME = 0.0
MAX_VELOCITY = 15.0
MAX_ACCELERATION = 200.0
MIN_LIMIT = -0.01
MAX_LIMIT = 300.0

[HAL]
TWOPASS = ON
HALFILE = core_stepper.hal
HALFILE = my_mill_pinout.hal
HALFILE = custom.hal
POSTGUI_HALFILE = custom_postgui.hal
```

解读：`TWOPASS = ON` 让多个 `loadrt` 可先汇总再执行，避免组件重复加载顺序问题；`core_stepper.hal` 通常是通用步进逻辑，`my_mill_pinout.hal` 把 `stepgen` 接到具体并口或 Mesa 引脚。

### 示例 2：HAL 片段——限位、步进与并口接线

来自官方 HAL 文档风格的 **典型并口 3 轴** 接线（`net` 方向箭头仅便于人类阅读）：

```hal
# 加载并口与步进发生器（实际配置常由 Wizard 生成）
loadrt [EMCMOT]EMCMOT base_period_nsec=50000 servo_period_nsec=1000000 num_joints=3
loadrt stepgen step_type=0,0,0
loadrt parport cfg="0x378 in"

addf parport.0.read base-thread
addf stepgen.make-pulses base-thread
addf parport.0.write base-thread
addf motion-command-handler servo-thread
addf motion-controller servo-thread

# X 轴：关节反馈 ↔ 步进发生器 ↔ 并口引脚
net xpos-cmd joint.0.motor-pos-cmd => stepgen.0.position-cmd
net xpos-fb stepgen.0.position-fb => joint.0.motor-pos-fb
net xenable joint.0.amp-enable-out => stepgen.0.enable
net xstep <= stepgen.0.step
net xdir <= stepgen.0.dir
net xstep => parport.0.pin-02-out
net xdir => parport.0.pin-03-out

# X 轴 home 开关：并口输入 → 关节 home 引脚
net home-x joint.0.home-sw-in <= parport.0.pin-11-in

# 逻辑门示例：两路输入都为真时点亮输出（冷却或指示灯）
loadrt and2 count=1
addf and2.0 servo-thread
net flood-btn parport.0.pin-12-in => and2.0.in0
net mist-btn  parport.0.pin-13-in => and2.0.in1
net coolant-on parport.0.pin-14-out <= and2.0.out
```

读懂这段 HAL，就等于读懂 LinuxCNC 一半集成工作：**运动模块的 joint 引脚** 通过 **信号名** 接到 **stepgen** 和 **物理引脚**；辅助逻辑用 `and2` 等实时组件挂在 **servo-thread**。

### 示例 3：MDI / 程序中的 G-code

对刀与设工件坐标系在车间里极常见，可在 MDI 或 `nc_files/` 程序中使用：

```gcode
(G54 工件坐标：Z 轴探针对刀后写入偏移)
G21          (毫米模式)
G90          (绝对坐标)
G38.2 Z-20 F50   (探针向下，碰到工件停止)
G10 L20 P1 Z0    (把当前探针接触点设为 G54 的 Z0)
G0 Z5            (抬刀到安全高度)
M2               (程序结束)
```

`G38.2` 探针移动需 INI/HAL 中已配置探针输入引脚并接到 `motion` 的 probe 相关信号；这是 **软件配置 + 物理探针** 协同的典型场景。

## 配置目录与启动

安装或 Live 环境下，配置常位于：

```
/home/<user>/linuxcnc/configs/<config-name>/
  <name>.ini          # 主配置
  <name>.hal          # Wizard 生成的主 HAL
  custom.hal          # 用户扩展（GUI 前加载）
  custom_postgui.hal  # GUI 后加载（PyVCP / 面板）
  tool.tbl            # 刀表（可选）
  nc_files/           # G-code 示例与加工程序
```

启动方式：

- 菜单 **LinuxCNC 配置选择器** 点选配置；
- 或命令行：`linuxcnc /path/to/my_mill.ini`（`linuxcnc -h` 查看选项）。

仿真配置在源码树 `configs/sim/` 下，例如 `sim/axis/vismach/` 可在 **无真实机床** 时学习 GUI 与换刀动画。

## 学习路径（零基础）

1. **装仿真**：用官方 Live ISO 或 deb 包，选 `sim/axis` 配置启动 AXIS，熟悉 Manual / Auto / MDI 与急停。
2. **读 INI**：对照自己的轴行程、`MAX_VELOCITY`，理解 `[AXIS_n]` 与 `[TRAJ]`，勿在未回零时超软限位。
3. **玩 HAL**：`halcmd show pin`、`halscope` 或 AXIS 菜单 **Machine → HAL Configuration**，观察 `joint.*`、`stepgen.*` 随点动变化。
4. **改 `custom.hal`**：先加指示灯或 `and2` 联锁，确认能启动再动步进接线。
5. **读 Integrator Manual**：接 Mesa、EtherCAT、Modbus 主轴时查 [Supported Hardware](https://wiki.linuxcnc.org/) 与对应 Wizard。
6. **安全**：软件急停不能替代 **硬件切断电机电源**；文档 DISCLAIMER 明确要求符合当地机械安全规范。

## 延伸阅读

- 官方文档索引：<https://linuxcnc.org/docs/html/>
- 用户入门：<https://linuxcnc.org/docs/html/user/user-intro.html>
- HAL 基础：<https://linuxcnc.org/docs/html/hal/basic-hal.html>
- INI 参考：<https://linuxcnc.org/docs/html/config/ini-config.html>
- 论坛：<https://forum.linuxcnc.org/>
- 本仓库相关笔记：[[grbl]]（轻量串口固件）、[[klipper]]（主机+MCU 3D 打印架构）、[[marlin]]（一体 MCU 打印固件）

## 小结

LinuxCNC 不是「又一个 G-code 播放器」，而是 **可组装的机床控制操作系统**：INI 描述机床能力与文件布局，HAL 描述电气与逻辑接线，GUI 服务不同操作场景，实时模块保证运动与 I/O 时序。零基础学习时，用 **日常类比** 抓住「调度中心 + 接线间 + 面板」，再在仿真里 **改 INI 数值、加 HAL 网线、跑 MDI 探针**，比死记命令表更快建立直觉。真正上机前，务必确认硬件急停、限位与驱动器使能链路——软件再成熟，也只是机床安全链中的一环。
