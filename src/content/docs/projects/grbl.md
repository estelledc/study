---
title: Grbl — 让 Arduino 听懂 G-code 的 CNC「翻译官」
来源: 'https://github.com/gnea/grbl'
日期: '2026-06-13'
子分类: 嵌入式
分类: 操作系统
provenance: 'pipeline-v3'
---

## 是什么

**Grbl** 是 [gnea/grbl](https://github.com/gnea/grbl) 维护的开源 **嵌入式 G-code 解析器 + CNC 运动控制器**：用高度优化的 C 语言写在 Arduino（典型为 ATmega328p，如 Uno / Nano）上，把上位机发来的 **标准 G-code 文本** 翻译成 **步进电机驱动器能听懂的脉冲时序**，从而驱动小型 CNC 铣床、激光雕刻机、笔式绘图仪等「三轴运动平台」。

日常类比：**餐厅后厨里的传菜员 + 节拍器**。

想象你是顾客（CAM 软件 / 手工写的 G-code），厨房前台（串口终端、Universal Gcode Sender、LightBurn、Candle 等 GUI）把你的点菜单一行行递给传菜员（Grbl）。传菜员 **不亲自炒菜**（不算复杂刀路几何学——那是 CAM 的事），他的职责是：

1. **读懂** 每一行指令（`G0` 快速移动、`G1` 直线切削、`G2/G3` 圆弧……）；
2. **排期**——在脑子里排好「先加速、再匀速、再减速」的时间表（规划器 planner）；
3. **打拍子**——按微秒级节拍给步进驱动器发 STEP 脉冲（步进 ISR），让 X/Y/Z 同步到位；
4. **汇报**——每做完一行回一个 `ok`，出错了回 `error:编号`，急停时喊 `ALARM`。

Grbl 的哲学是 **做少、做精、做实时**：它故意不做 U 盘直读、LCD 菜单、网络栈——那些交给上位机 GUI。固件只专注 **干净、可靠的运动**。官方 README 称：在 16MHz AVR 上可达约 **30kHz 稳定、低抖动的控制脉冲**；v1.1 支持圆弧/螺旋线、探针循环、刀长补偿、激光/主轴 PWM、点动（jog）等工业常用子集，但不支持宏变量和大多数 canned cycle（官方认为 GUI 应预先展开成直线 G-code）。

与 [[marlin]] / [[klipper]] 的对比：Marlin、Klipper 面向 **3D 打印**（挤出机、热床 PID、多轴 E）；Grbl 面向 **减材 / 2.5D 雕刻**（主轴/激光、工件坐标系 G54–G59、软限位与回零）。三者都解析 G-code，但 Grbl 更轻、更老、更「单板串口即用」，是开源 CNC 生态的奠基固件之一。

## 解决什么问题

在 Grbl 流行之前，许多 DIY CNC 依赖 **并口（LPT）+ PC 软件** 直接吐脉冲：换电脑、换系统、USB 隔离都麻烦，实时性也难保证。Grbl 用一块十几美元的 Arduino 把问题收成：

| 痛点 | 并口时代 | Grbl 的回应 |
| --- | --- | --- |
| 主机实时性 | Windows 后台任务会卡脉冲 | MCU 专管步进，主机只发文本 |
| 协议标准 | 各软件私有二进制 | 串口 + G-code + `$` 配置，文档公开 |
| 成本 | 老式 PC 并口稀缺 | Uno + 驱动板即可 |
| 加减速 | 容易失步、拐角过冲 | 内建 look-ahead 规划器（最多 16 段缓冲） |
| 安全 | 限位/急停接线随意 | 状态机 + ALARM + 软/硬限位可配置 |

核心问题：**能否在资源极少的 8 位 MCU 上，用开源固件可靠执行 CAM 输出的 G-code，并给 GUI 留出清晰的串口协议？** Grbl 的答案持续了十余年，衍生出 grblHAL（多 MCU）、Grbl_Esp32 等分支，但 gnea/grbl 仍是 AVR 路线的参考实现。

## 核心概念

### 1. 源码模块：一条 G-code 如何变成脉冲

仓库 `grbl/` 目录按职责拆分（见 [GitHub 文件树](https://github.com/gnea/grbl/tree/master/grbl)）：

```
串口 serial.c  ←→  协议层 protocol.c（主循环 + 实时命令）
                        ↓
              G-code 解析 gcode.c（模态状态、语法检查）
                        ↓
              运动入口 motion_control.c（mc_line 等）
                        ↓
              规划器 planner.c（加减速、拐角速度、16 段缓冲）
                        ↓
              步进执行 stepper.c（定时器 ISR 发 STEP）
                        ↓
              引脚映射 cpu_map.h / config.h
```

- **`protocol_main_loop()`**（`protocol.c`）：上电初始化、读限位、进入无限循环；在「等缓冲区有空位」等阻塞点反复调用 **`protocol_exec_rt_system()`**，处理 `!` 暂停、`~` 继续、`?` 状态查询等 **实时命令**，避免与 G-code 解析抢状态。
- **`gc_execute_line()`**（`gcode.c`）：解析一行；错误则 **整行丢弃** 并 `error:n`，防止半行模态污染后续程序。
- **`plan_buffer_line()`**（`planner.c`）：把目标位置、进给率变成带加速度约束的运动段队列。
- **`stepper.c`**：从规划器取出段，在硬件定时器中断里精确翻转 STEP 引脚；脉冲宽度由 `$0`（步进脉冲微秒数）等设置约束。

数据流可记为：**文本行 → 解析器 → 规划队列 → ISR 脉冲 → 机械位移**。

### 2. 三层缓冲：为什么流式发送有讲究

Grbl 与上位机之间典型存在：

| 缓冲 | 容量（量级） | 作用 |
| --- | --- | --- |
| 串口 RX | 约 127 字符 | 暂存主机发来的行 |
| Planner | 16 行运动 | 预计算加减速，look-ahead |
| 步进段 | 执行中 | ISR 正在消费的脉冲序列 |

官方 [Interface 文档](https://github.com/gnea/grbl/blob/master/doc/markdown/interface.md) 定义两种流式协议：

- **Send-Response（推荐新手）**：发一行 → 等 `ok` → 再发下一行；最简单，但若程序含大量短线段，主机往返延迟可能 **饿死** planner，运动一停一停。
- **Character-Counting（高性能）**：跟踪已发送字符数，在不超过 128 字节 RX 的前提下 **尽量灌满** 串口缓冲；配合 `$C` 预检查模式，适合激光机等高速短段作业。

实时字符（`?`、`!`、`~`、软复位 `0x18` 等）**不进 RX 缓冲**，在串口层被截获并置标志位——这是 Grbl 能在运动中立刻暂停的关键。

### 3. 状态机：什么时候能动、什么时候必须停

`sys.state` 决定当前可接受的命令（Wiki / DeepWiki 归纳）：

| 状态 | 含义 | 典型限制 |
| --- | --- | --- |
| `Idle` | 空闲 | 可接受新 G-code、`$` 设置 |
| `Run` | 执行程序 | 实时命令、上报可用 |
| `Hold` | 进给保持 | 规划减速停，可 `~` 恢复 |
| `Jog` | 点动 | 与主程序解析器隔离（v1.1） |
| `Homing` | 回零 | 专用周期 |
| `Alarm` | 报警 | 需 `$X` 解锁或复位 |
| `Sleep` | 休眠 `$SLP` | 关闭步进保持，仅硬复位唤醒 |

**ALARM** 与 **error** 不同：`error` 是单行解析失败；`ALARM` 是硬限位触发、急停、探针失败等 **系统级停机**，必须人工介入。

### 4. `$` 设置与 EEPROM：机器的「出厂参数表」

Grbl 不把机床参数写死在编译里（基础引脚在 `config.h` / `cpu_map.h`），运行时用 **`$编号=值`** 存入 EEPROM。常用项（详见 [settings.md](https://github.com/gnea/grbl/blob/master/doc/markdown/settings.md)）：

| 设置 | 含义 |
| --- | --- |
| `$0` | 步进脉冲宽度（µs），默认约 10 |
| `$1` | 步进空闲后多久关闭保持电流（ms，255=常使能） |
| `$3` | 各轴方向反转位掩码 |
| `$100–$102` | X/Y/Z **steps/mm**（标定核心） |
| `$110–$112` | 各轴最大速率（mm/min） |
| `$120–$122` | 各轴加速度（mm/s²） |
| `$130–$132` | 各轴最大行程（软限位用） |
| `$22` | 是否启用回零 |
| `$23` | 回零方向掩码 |
| `$32` | 激光模式（M3/M5 变功率而非等待转速） |

查询：`$$` 打印全部；`$#` 打印坐标系与 G92 等参数；`$G` 打印模态状态；`$I` 打印版本/build 信息。

**steps/mm 计算**（Wiki 配置指南）：

```
steps/mm = (步进电机每圈整步数 × 每步微步数) / 每圈丝杠/皮带移动的距离(mm)
```

例：200 整步 × 16 微步，丝杠导程 8mm/rev → `(200×16)/8 = 400` steps/mm。

### 5. 坐标系：G54 与 G92

- **工件坐标系** `G54`–`G59`：CAM 常输出「相对于工件零点」的坐标，Grbl 支持六套可切换偏置（`G10 L2` 写入 EEPROM）。
- **G92 坐标偏移**：历史遗留的「当前点定义为某坐标」；v1.1 建议在 GUI 侧用 `G10` 替代；`$C` 检查模式结束会软复位并 **清除 G92**。

### 6. 支持的 G-code 子集（v1.1）

README 列出主要支持项（**不支持** 宏、`G81` 等多数 canned cycle）：

- 运动：`G0` `G1` `G2` `G3` `G38.2–.5`（探针）`G80`
- 单位/距离：`G20/G21` `G90/G91` `G91.1`（圆弧 IJK 增量）
- 平面：`G17/G18/G19`
- 坐标：`G54–G59` `G28/G30` 回参考点
- 流程：`M0` `M2` `M30`；冷却 `M7/M8/M9`；主轴 `M3/M4/M5`

## 从零上手：推荐路径

1. **硬件**：Arduino Uno/Nano + CNC Shield（如 A4988/DRV8825）+ 步进电机 + 限位开关（可选）+ 12–24V 电源。`config.h` 选对 `cpu_map.h` 引脚表（常见为 `cpu_map_atmega328p.h`）。
2. **烧录**：用 Arduino IDE 或 PlatformIO 编译 `grbl` 项目并上传；上电串口 115200 应看到欢迎语 `Grbl 1.1h ['$' for help]`。
3. **空载试转**：串口发 `G91 G0 X1` / `G91 G0 X-1` 看 X 轴是否约动 1mm；方向反了改 `$3`。
4. **标定 `$100–$102`**：用卡尺实测，微调 steps/mm。
5. **回零与软限位**：装限位后设 `$22=1`，设 `$130–$132` 行程，`$20=1` 开软限位（须先回零）。
6. **上位机**：UGS、Candle、LaserGRBL、LightBurn（激光）等，负责发送文件与可视化；固件保持 Grbl 即可。

## 代码示例

### 示例 1：用 Python 以 Send-Response 方式流式发送 G-code

下列脚本复现官方 `simple_stream.py` 的核心逻辑：每行等待 `ok` 或 `error:`，适合学习与调试（需 `pip install pyserial`）。

```python
#!/usr/bin/env python3
"""向 Grbl 流式发送 G-code（Send-Response 协议）"""
import serial
import time
import sys

PORT = "/dev/tty.usbserial-1410"  # macOS/Linux 按实际修改；Windows 如 COM3
BAUD = 115200

PROGRAM = [
    "G21",           # 毫米单位
    "G90",           # 绝对坐标
    "G0 X0 Y0 Z0",   # 快速到原点（需已回零或知悉坐标）
    "G1 X10 F500",   # 直线到 X=10，进给 500 mm/min
    "G1 Y10",
    "G0 X0 Y0",
]

def wait_for_response(ser: serial.Serial) -> str:
    """读取直到 ok / error: 行（忽略 <...> 状态推送）"""
    while True:
        line = ser.readline().decode("ascii", errors="ignore").strip()
        if not line:
            continue
        if line.startswith("<"):
            print(f"  [status] {line}")
            continue
        return line

def main() -> None:
    with serial.Serial(PORT, BAUD, timeout=1) as ser:
        time.sleep(2)  # 等待 Grbl 启动
        ser.reset_input_buffer()
        for cmd in PROGRAM:
            print(f">> {cmd}")
            ser.write((cmd + "\n").encode("ascii"))
            resp = wait_for_response(ser)
            print(f"<< {resp}")
            if resp.startswith("error"):
                sys.exit(f"Grbl 报错，已停止: {resp}")
    print("程序发送完毕")

if __name__ == "__main__":
    main()
```

要点：

- 状态报告 `<Idle|...>` 是 **push 消息**，不算在流式 ack 里，应单独解析或忽略。
- 可随时发 `?` 查询位置（不占用 RX 缓冲）；暂停发 `!`，继续发 `~`。
- 修改 EEPROM 的指令（`$100=400` 等）应在 **Idle** 下发，且不要用 character-counting 在写入时继续灌数据。

### 示例 2：串口配置会话与最小加工 G-code

连接 115200 串口终端后，典型首次配置（数值需按你的机械更换）：

```text
$$                    # 查看当前全部设置
$100=400.000          # X 轴 steps/mm
$101=400.000          # Y
$102=400.000          # Z
$110=5000.000         # X 最大速率 mm/min
$120=200.000          # X 加速度 mm/s²
$22=1                 # 启用回零
$23=1                 # X 回零方向（位掩码，按接线调整）
$130=200.000          # X 最大行程 mm
$20=1                 # 软限位（需已回零）
$X                    # 若有 ALARM，解锁
$H                    # 执行回零周期
$G                    # 查看模态：单位、距离模式、坐标系
```

确认空载安全后，可发送极简「矩形刀路」：

```gcode
G21 G90 G54
G0 Z5.000
G0 X0 Y0
G1 Z-1.000 F100
G1 X50 Y0 F300
G1 X50 Y30
G1 X0 Y30
G1 X0 Y0
G0 Z5.000
M5
```

若仅测试移动、主轴未接，可省略 `M3`/`M5`；激光模式（`$32=1`）下 `M3 S1000` 用 S 值调功率。

### 示例 3：编译期引脚与功能开关（`config.h` 片段）

Grbl 行为大量由 `grbl/config.h` 在 **编译期** 决定（与运行期 `$` 互补）。例如启用激光模式、改报告类型：

```c
// grbl/config.h 节选 — 修改后需重新编译烧录

#define DEFAULT_LASER_MODE_ENABLE 1   // 1=激光/PWM 模式默认开启（亦可用 $32 运行时改）

// 状态报告中位置用机器坐标 MPos 还是工件坐标 WPos
#define REPORT_MACHINE_POSITION       // 默认 MPos；注释掉则 WPos

#define HOMING_INIT_LOCK              // 上电必须回零才能动（视安全需求）

// 默认串口波特率（亦可用 $10 等设置，视版本）
#define BAUD_RATE 115200
```

引脚定义在 `cpu_map.h` 选择的板级文件中，例如 `STEP_DDR`、`X_STEP_BIT` 等；换板或换接线时必须与 **CNC Shield 丝印** 一致，否则表现是「某轴不动或乱转」。

## 与生态的关系

| 组件 | 角色 |
| --- | --- |
| CAM（Fusion 360、Carbide Create、FreeCAD Path） | 生成刀路 G-code |
| 控制 GUI（UGS、Candle、gsender、bCNC） | 流式发送、可视化、探针向导 |
| 激光软件（LightBurn） | 图像转 G-code，依赖 Grbl 激光模式 |
| grblHAL / Grbl_Esp32 | 更高主频、更多轴、以太网 — 协议思想延续 Grbl |
| [[klipper]] | 不同赛道（3D 打印）；主机+MCU 分工，非 G-code 单行 ack 同一套 |

Grbl 文档入口：[Wiki](https://github.com/gnea/grbl/wiki)、[Interface](https://github.com/gnea/grbl/blob/master/doc/markdown/interface.md)、[Settings](https://github.com/gnea/grbl/blob/master/doc/markdown/settings.md)、[Configuration 指南](https://github.com/gnea/grbl/wiki/Grbl-v1.1-Configuration)。

## 常见问题

**Q：发了 G-code 没动静？**  
先 `$X` 清报警，确认 `Idle` 而非 `Alarm`；是否完成回零（若启了 `$22`）；`$1` 是否让步进保持关闭过快；进给 `F` 是否过小。

**Q：`error:22` Feed rate not set？**  
`G1`/`G2`/`G3` 需要 `F` 字；或在之前行已设进给模态。

**Q：圆弧 `error:34`？**  
半径法圆弧几何无解，改用小线段或 IJK 偏移法，并检查 `G91.1`。

**Q：和 Marlin 能共用一块板吗？**  
硬件可能都是 Arduino+驱动，但 **固件不同、G-code 扩展不同**；3D 打印机刷 Marlin，CNC/激光刷 Grbl 或衍生版，勿混用。

**Q：性能瓶颈？**  
大量 `G1` 短段（尤其 G64 未等效的高密多段）会吃满 16 段 planner；用 character-counting 流式、CAM 简化路径，或升级 grblHAL。

## 小结

Grbl 把 CNC 运动控制从「PC 并口吐脉冲」收成 **「串口 + G-code + 单板实时」** 的标准范式：上位机负责文件与人机界面，固件负责 **解析、规划、脉冲、状态机**。零基础学习路径是：**串口对话 → `$` 标定 → 回零与限位 → Send-Response 发程序 → 再读 Interface 做 GUI 或自动化**。掌握 planner 缓冲、实时命令与 ALARM 语义后，读 `protocol.c` / `planner.c` 源码会顺畅很多——那正是 Grbl 作为嵌入式运动控制教科书的魅力所在。
