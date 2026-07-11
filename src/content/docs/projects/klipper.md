---
title: Klipper — 把 3D 打印运动计算搬到主机上
来源: 'https://github.com/Klipper3d/klipper'
日期: 2026-07-07
分类: embedded
难度: 中级
---

## 是什么

Klipper 是一套 3D 打印机固件：它把复杂的运动规划放到树莓派这类主机上算，再让打印机主板按精确时间执行脉冲。

日常类比：传统固件像一个人在厨房里边看菜谱边切菜边计时；Klipper 像把菜谱和计时交给旁边的调度员，厨师只按铃声下刀，所以动作更稳。

最小例子不是一段 Python，而是一小段 `printer.cfg`。你告诉 Klipper 主板在哪里、打印机运动上限是多少：

```ini
[mcu]
serial: /dev/serial/by-id/usb-Klipper_stm32f103_12345-if00

[printer]
kinematics: cartesian
max_velocity: 300
max_accel: 3000
```

这段配置的意思是：主机用 USB 找到微控制器，按笛卡尔结构理解 X/Y/Z 运动，并限制最高速度与加速度。

## 为什么重要

不理解 Klipper，下面这些事都很难解释：

- 为什么一块老 8 位主板也可能跑出很高的步进频率，因为主机先把步进事件压缩好再发送。
- 为什么改很多参数不用重新刷固件，因为大部分配置在主机上的 `printer.cfg` 里。
- 为什么高速打印常把 Pressure Advance、Input Shaping、加速度一起调，因为它们都在修正运动和挤出之间的时间关系。
- 为什么 Klipper 报错常常直接停机，因为固件宁愿中断，也不默默打印出危险或劣质结果。

## 核心要点

Klipper 的核心可以拆成三点：

1. **主机算大脑**：树莓派或 Linux 主机负责 G-code 解析、运动规划、加速度曲线和运动学换算。类比：导航软件先规划整条路线，不让司机每个路口临时心算。
2. **微控制器守时间**：打印机主板上的 C 代码主要执行队列里的定时脉冲、采集温度、控制 IO。类比：节拍器不懂整首歌，但每一下必须准。
3. **配置即接口**：主板、步进电机、探针、宏、输入整形都通过配置段接入。类比：不是重新焊电路，而是在配电箱标签上告诉系统每根线连到哪里。

这三个设计合起来，让 Klipper 像一个分布式实时系统：主机负责聪明，MCU 负责准时，中间靠协议和时钟同步粘住。

## 实践案例

### 案例 1：从样例配置启动一台打印机

官方安装流程的第一种真实用法，是先编译并刷入 MCU 固件，再把样例配置复制成自己的 `printer.cfg`。

```bash
cd ~/klipper
make menuconfig
make
ls /dev/serial/by-id/*
sudo service klipper stop
make flash FLASH_DEVICE=/dev/serial/by-id/usb-1a86_USB2.0-Serial-if00-port0
sudo service klipper start
```

逐部分解释：

- `make menuconfig` 选择目标主板、通信方式、启动方式。
- `make` 编译 MCU 端固件，ARM 板通常生成 `out/klipper.bin`。
- `ls /dev/serial/by-id/*` 找稳定的 USB 串口名，不要硬写 `/dev/ttyUSB0`。
- 刷写前停止服务，是为了避免主机进程还占着串口。

然后把最接近的样例配置复制成 `~/printer.cfg` 并编辑，配置里最容易先改的是 `[mcu]`：

```ini
[mcu]
serial: /dev/serial/by-id/usb-1a86_USB2.0-Serial-if00-port0
```

改完在控制台跑 `RESTART` 和 `STATUS`。如果状态不是 ready，先看报错和 `~/printer_data/logs/klippy.log`，不要急着开热床。

### 案例 2：调 Pressure Advance，让拐角不鼓包

Pressure Advance 的目标是补偿喷嘴里塑料压力的滞后：加速时多推一点，减速时少推一点。

官方调参会让打印件不同高度使用不同 `pressure_advance`，再用卡尺找质量最好的高度。

```txt
SET_VELOCITY_LIMIT SQUARE_CORNER_VELOCITY=1 ACCEL=500
TUNING_TOWER COMMAND=SET_PRESSURE_ADVANCE PARAMETER=ADVANCE START=0 FACTOR=.005
```

逐部分解释：

- `SQUARE_CORNER_VELOCITY=1` 故意让拐角效果更明显，方便肉眼比较。
- `TUNING_TOWER` 每升高一层就改一点参数，相当于一次打印完成一串实验。
- 直驱挤出机常用较小 `FACTOR`，长 Bowden 管通常要更大的范围。

选好值之后写回配置：

```ini
[extruder]
pressure_advance: 0.065
```

最后执行 `RESTART`。它不是让路径变短，也不会改变总挤出量；它只是改变加减速阶段的挤出时机。

### 案例 3：用 Input Shaper 压住机架共振

Input Shaper 解决的是高速拐弯后的波纹。直觉上，它不是让机器更硬，而是把命令信号改成“自己抵消振动”的形状。

没有加速度计时，可以打印测试塔：

```txt
SET_VELOCITY_LIMIT MINIMUM_CRUISE_RATIO=0
SET_PRESSURE_ADVANCE ADVANCE=0
SET_INPUT_SHAPER SHAPER_TYPE=MZV
TUNING_TOWER COMMAND=SET_VELOCITY_LIMIT PARAMETER=ACCEL START=1500 STEP_DELTA=500 STEP_HEIGHT=5
```

逐部分解释：

- 先关掉 Pressure Advance，是为了别把挤出问题误判成振动问题。
- `SET_INPUT_SHAPER SHAPER_TYPE=MZV` 选择一种常用整形器。
- `TUNING_TOWER` 让不同高度对应不同加速度，观察从哪一段开始波纹或圆角过度。

有加速度计时，可以让 Klipper 自动测频率：

```txt
ACCELEROMETER_QUERY
SHAPER_CALIBRATE
SAVE_CONFIG
```

保存后还要手动检查 `[printer] max_accel`，因为自动校准会推荐整形参数，但不会替你决定机器长期能承受多高加速度。

## 踩过的坑

1. **把 `/dev/ttyUSB0` 当稳定串口**：设备重启后名字可能变，应该优先用 `/dev/serial/by-id/*`。
2. **改完 `printer.cfg` 忘记 `RESTART`**：Klipper 只会在重启配置阶段重新加载很多段，页面显示不一定代表新配置生效。
3. **照搬 Marlin 参数**：Klipper 能跑更高步进频率，原来的 Z 速度或微步设置可能让电机叫但不动。
4. **把 Input Shaper 当万能药**：低频共振、松皮带、晃机架先要修机械结构，否则整形只是在遮住问题。

## 适用 vs 不适用场景

**适用**：

- 想把普通 3D 打印机升级成可调、可观测、可远程控制的系统。
- 已经能 SSH 到树莓派或小主机，愿意读日志、改配置、跑校准。
- 需要高速打印、压力提前、输入整形、多 MCU、宏命令这类能力。
- 想学习嵌入式里“主机规划 + 控制器实时执行”的架构。

**不适用**：

- 只想插卡即打、不想接触 Linux、串口、配置文件和日志。
- 机器机械结构本身松散，却希望软件直接治好所有波纹。
- 没有把握处理热端、热床、限位、急停等安全检查。
- 对实时控制毫无容错空间的工业设备；Klipper 面向开源 3D 打印生态，不是通用安全 PLC。

## 历史小故事（可跳过）

- **2016 年前后**：Kevin O'Connor 开始公开推进 Klipper，重点不是再造一个 Marlin，而是换一种主机/MCU 分工。
- **早期社区**：很多用户先把树莓派和旧 8 位主板配起来，发现老硬件也能获得更高步进性能。
- **后来演进**：Mainsail、Fluidd、Moonraker 等生态把控制面板、Web API、远程管理补齐。
- **现在规模**：GitHub 上已有约 1 万星量级，文档覆盖安装、配置、宏、API、运动学和多种传感器。
- **工程气质**：它把“刷一次固件”变成“持续调一份配置”，所以更像长期维护一台小型机器。

## 学到什么

1. Klipper 的先进不只是“快”，而是把实时系统切成主机计算和 MCU 执行两层。
2. 配置文件不是附属品，而是 Klipper 暴露硬件能力和运行策略的主要接口。
3. 高速打印质量来自一串校准：机械刚性、步进配置、压力提前、输入整形、切片器设置要一起看。
4. 好固件不会沉默失败；在温度、通信、越界、配置错误上及时停机，本身就是安全设计。

## 延伸阅读

- 官方主页：[Klipper Documentation](https://www.klipper3d.org/)
- 功能总览：[Features](https://www.klipper3d.org/Features.html)
- 安装入口：[Installation](https://www.klipper3d.org/Installation.html)
- 调压力提前：[Pressure Advance](https://www.klipper3d.org/Pressure_Advance.html)
- 调输入整形：[Resonance Compensation](https://www.klipper3d.org/Resonance_Compensation.html)
- [[marlin]] —— 传统 3D 打印固件，对比 Klipper 的主机/MCU 分工更清楚

## 关联

- [[embedded-systems]] —— Klipper 是嵌入式实时控制和 Linux 主机协作的好例子
- [[real-time-systems]] —— 步进脉冲必须按时发生，晚一点就可能丢步或抖动
- [[raspberry-pi]] —— 常见 Klipper 主机，用来跑 Python 服务、Web 前端和日志
- [[g-code]] —— 切片器输出的命令流，Klipper 把它翻译成运动队列
- [[pid-control]] —— 热端和热床调温依赖 PID 校准
- [[input-shaping]] —— 高速打印中压制共振的控制方法
- [[marlin]] —— 同类固件参照物，能帮助理解 Klipper 为什么要拆分计算层

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[marlin]] —— Marlin Firmware — 3D 打印机里的运动控制大脑
