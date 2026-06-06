---
title: FreeModbus — 嵌入式工业总线从机协议栈 C 实现
来源: 'https://github.com/cwalter-at/freemodbus'
日期: 2026-06-06
分类: 操作系统
子分类: 嵌入式
难度: 中级
---

## 是什么

FreeModbus 是一套运行在微控制器上的 **Modbus ASCII/RTU/TCP 从机协议栈**，用纯 C 写成，核心库采用 BSD 许可可直接嵌入商业产品。日常类比：把它想象成一家工厂里的"翻译官"——上位机（PLC、SCADA 软件）用 Modbus 语言发指令，微控制器通过 FreeModbus 听懂并回复，整个工厂设备才能协调运转。

Modbus 本身是 1979 年由 Modicon 公司为可编程逻辑控制器发明的工业串行通信协议，发展至今是工业现场总线的事实标准：从温度传感器、变频器、电表，到智能开关柜，几乎都说 Modbus。FreeModbus 把这套协议塞进了几十 KB ROM 的单片机里。

协议栈分三层：**应用逻辑**（你自己的寄存器回调）→ **协议核心**（FreeModbus 实现）→ **平台移植层**（你需要实现的三个抽象：串口/定时器/事件）。上下解耦，换一块 MCU 只需重写移植层，业务代码不动。

## 为什么重要

不理解 FreeModbus 与 Modbus 协议，以下这些事都没法解释：

- 为什么工厂里几十台传感器可以共享同一根 RS-485 总线，主机却能按地址精准读到每台设备的数据
- 为什么嵌入式工程师说"Modbus 寄存器地址偏 1"会触发灵魂抖动——这个"偏移"坑害过无数新人
- 为什么 Modbus RTU 帧不需要帧头标志位，而是靠"沉默时间"判断帧边界，以及这种设计在中断延迟大的 RTOS 里为何容易出 bug
- 为什么 Modbus/TCP 和串口 Modbus 的报文结构几乎一样，但多了一个 MBAP 头——以太网和串口的寻址方式不同

## 核心要点

1. **四种数据对象**：Modbus 把设备状态抽象成四张表——线圈（Coil，1 位可读写，代表继电器）、离散输入（Discrete Input，1 位只读，代表按钮）、输入寄存器（Input Register，16 位只读，代表传感器值）、保持寄存器（Holding Register，16 位可读写，代表配置参数）。类比：线圈像开关，寄存器像旋钮，输入是传感器读数，保持是设定值。FreeModbus 里你只需要实现四个回调函数对应这四张表，协议细节全由库处理。

2. **RTU 帧结构与 CRC**：RTU 模式用二进制传输，帧格式是「地址（1 字节）+ 功能码（1 字节）+ 数据（N 字节）+ CRC16（2 字节）」。帧边界靠 **3.5 字符时间**的串口静默检测——没有帧头标志，靠沉默时间。这意味着发送端的定时器精度直接影响通信可靠性，FreeModbus 的移植层必须提供高精度定时器支持。

3. **三层可移植架构**：FreeModbus 把"知道协议细节"和"知道 MCU 细节"彻底分开。你需要实现的移植层只有三个文件：`portserial.c`（串口读写中断）、`porttimer.c`（3.5/1.5 字符时间定时器）、`portevent.c`（事件队列或信号量）。协议栈内部通过这三个接口感知硬件，不直接碰寄存器地址。换 MCU 时，只改这三个文件，其余不动。

## 实践案例

### 案例 1：STM32 + RS-485 温度传感器从机

一个工厂里有 32 个温度探头，主机 SCADA 软件每秒用 FC04（Read Input Registers）轮询：

```c
/* 1. 移植层：portserial.c 里实现串口初始化 */
void vMBPortSerialEnable(BOOL xRxEnable, BOOL xTxEnable) {
    if (xRxEnable) __HAL_UART_ENABLE_IT(&huart1, UART_IT_RXNE);
    else           __HAL_UART_DISABLE_IT(&huart1, UART_IT_RXNE);
    /* TX 方向还要控制 RS-485 方向引脚 */
    HAL_GPIO_WritePin(RS485_DE_GPIO_Port, RS485_DE_Pin,
                      xTxEnable ? GPIO_PIN_SET : GPIO_PIN_RESET);
}

/* 2. 应用层：注册输入寄存器回调 */
eMBErrorCode eMBRegInputCB(UINT8 *pucRegBuffer, USHORT usAddress,
                            USHORT usNRegs) {
    /* usAddress 从 0 开始（PDU 地址），物理探头编号从 1 开始 */
    USHORT idx = usAddress;   /* 注意：不要再 +1，FreeModbus 内部已处理偏移 */
    while (usNRegs--) {
        INT16 temp = read_sensor(idx++);  /* 单位：0.1℃，-400 ~ 1500 */
        *pucRegBuffer++ = (UINT8)(temp >> 8);   /* 大端：高字节先 */
        *pucRegBuffer++ = (UINT8)(temp & 0xFF);
    }
    return MB_ENOERR;
}

/* 3. 主循环 */
eMBInit(MB_RTU, 0x01, 1, 9600, MB_PAR_NONE);
eMBEnable();
for (;;) { eMBPoll(); }
```

逐部分解释：`eMBInit` 设备地址 `0x01`，串口 1，9600 bps，无校验；`eMBPoll()` 驱动协议状态机，必须在主循环里持续调用；回调里大端写入两字节即可，库负责打帧和 CRC。

### 案例 2：FreeRTOS + Modbus/TCP 以太网控制器

在工业以太网环境下，把 FreeModbus TCP 集成到 FreeRTOS 任务：

```c
/* TCP 模式初始化 */
eMBTCPInit(MB_TCP_PORT_USE_DEFAULT);   /* 默认端口 502 */
eMBEnable();

/* 专用任务跑 poll，避免阻塞其他任务 */
void vModbusTask(void *pvParam) {
    for (;;) {
        eMBPoll();
        vTaskDelay(1);   /* 让出 1 ms，其他任务有机会运行 */
    }
}

/* 保持寄存器回调：PID 控制器参数可被上位机读写 */
eMBErrorCode eMBRegHoldingCB(UINT8 *pucRegBuffer, USHORT usAddress,
                              USHORT usNRegs, eMBRegisterMode eMode) {
    if (eMode == MB_REG_READ) {
        /* 读取当前 PID 参数 */
    } else {
        /* 写入新参数，需加互斥锁保护 */
        xSemaphoreTake(xPIDMutex, portMAX_DELAY);
        /* ... 写参数 ... */
        xSemaphoreGive(xPIDMutex);
    }
    return MB_ENOERR;
}
```

TCP 模式底层依赖 lwIP，FreeModbus 的 `porttcp.c` 负责 socket 管理；上层业务代码与 RTU 模式完全相同。

### 案例 3：Arduino 上的简易 Modbus 从机

用 FreeModbus 的 AVR demo 改写，接受上位机 FC05（Write Single Coil）控制 LED：

```c
eMBErrorCode eMBRegCoilsCB(UINT8 *pucRegBuffer, USHORT usAddress,
                            USHORT usNCoils, eMBRegisterMode eMode) {
    if (eMode == MB_REG_WRITE) {
        /* pucRegBuffer 每位对应一个线圈，位 0 = 地址 usAddress */
        BOOL coilVal = (*pucRegBuffer & 0x01) ? TRUE : FALSE;
        digitalWrite(LED_PIN, coilVal ? HIGH : LOW);
    }
    return MB_ENOERR;
}
```

上位机用 Modbus Poll 软件发送 `01 05 00 00 FF 00`（设备 1，FC05，线圈 0，ON），Arduino LED 点亮；发 `01 05 00 00 00 00` 熄灭。整个通信链路从 USB 转 RS-485，不需要修改任何协议层代码。

## 踩过的坑

1. **寄存器地址偏移混淆**：Modbus 规范里线圈从地址 `00001` 开始，但 PDU 里地址字段从 `0x0000` 开始——差 1。FreeModbus 把 PDU 地址（从 0 起）原样传给回调，所以回调里的 `usAddress` 是 **PDU 地址**，不要再加 1，否则全部偏移一个位置。

2. **大端字节序 swap 遗漏**：Modbus 规定寄存器高字节先传（大端），ARM Cortex-M 是小端。如果直接 `memcpy` 把本地变量复制到 `pucRegBuffer`，字节序会反。必须手动 `(val >> 8) & 0xFF` 和 `val & 0xFF` 分开写入，或用 `__builtin_bswap16`。

3. **RTU 定时器精度不足导致拆帧**：RTU 依赖 3.5 字符时间（9600 bps 时约 4 ms）判断帧结束。如果 RTOS tick 是 10 ms，帧边界检测会失准，导致两帧粘在一起或一帧被拆成两帧。移植时定时器分辨率应 ≤ 1 ms，通常用硬件定时器中断而非 RTOS tick。

4. **回调函数里读外设阻塞**：`eMBRegInputCB` 等回调在 `eMBPoll()` 的状态机里被同步调用。若在回调里做耗时操作（比如读 SPI Flash、等待 ADC 完成），会超出 RTU 响应超时（通常 1 s），导致主机重发甚至认为设备离线。应在主循环里预先读好数据缓存，回调只做内存复制。

## 适用 vs 不适用场景

**适用**：
- 工业传感器、变频器、电表需要接入 Modbus 主网络
- 学习 Modbus 协议和嵌入式通信协议栈设计
- 资源受限 MCU（ROM ≥ 20 KB，RAM ≥ 4 KB）上的从机实现
- 需要可商用 BSD 许可、不依赖 RTOS 的轻量级协议栈

**不适用**：
- 需要 **Modbus 主机（Master/Client）**功能——FreeModbus 官方仅实现从机
- 对实时性要求极高（< 1 ms 响应），Modbus 本身是轮询协议，不适合硬实时
- 需要 Modbus Plus 或 Modbus over CAN 等扩展变体
- 已有成熟商业 Modbus 栈授权、需要配套技术支持的商业项目

## 历史小故事（可跳过）

- **1979 年**：Modicon 公司为自家 PLC 开发内部通信协议，命名 Modbus。因为简单、开放，迅速被行业仿制，成为事实标准。
- **1996 年前后**：随着以太网进入工厂，Modbus 协议被封装进 TCP/IP，诞生 Modbus/TCP，保留了几乎相同的 PDU 结构，只加了 6 字节 MBAP 头做寻址。
- **2000 年代初**：Christian Walter 将 FreeModbus 发布到网上，BSD 许可让工程师可以直接把它塞进产品而无需开源自己的代码。
- **2004 年**：Modicon 母公司 Schneider Electric 把 Modbus 知识产权移交给独立的 Modbus Organization，彻底开放协议规范，官网免费下载。
- **2023 年至今**：原作者活跃度降低，社区以 master 分支方式开放维护，GitHub 仍有新 PR 合并，嵌入式 MCU 工程师依然把它作为学习 Modbus 移植的第一块砖。

## 学到什么

1. **协议 = 帧格式 + 状态机**：FreeModbus 的核心就是一个接收字节的状态机，加上 CRC 验证和功能码分发。读懂它，你就读懂了 90% 的工业串行协议。

2. **可移植性靠"切面"实现**：三个移植接口（串口、定时器、事件）把硬件细节隔离出去。这种"硬件抽象层"思想在嵌入式开发中比面向对象更实用，因为 C 语言里函数指针就够了。

3. **大端 vs 小端是跨平台通信的第一道坎**：凡是字节序不对就是大坑。养成习惯：网络/工业协议传输时始终用 `htons`/`ntohs` 或手动位移处理字节序。

4. **轮询协议的响应时间上限由主机决定**：Modbus 主机轮询间隔通常 100 ms～1 s，这是嵌入式从机唯一需要满足的实时性要求。理解这一点有助于正确评估 RTOS 是否必要。

## 延伸阅读

- 官方协议规范：[Modbus Application Protocol v1.1b3](https://modbus.org/docs/Modbus_Application_Protocol_V1_1b3.pdf)（30 页，读完就懂 90% 的功能码）
- 串口规范：[Modbus over Serial Line v1.0](https://modbus.org/docs/Modbus_over_serial_line_V1_01.pdf)（RTU/ASCII 帧格式和时序的权威来源）
- 调试工具：[Modbus Poll](https://www.modbustools.com/modbus_poll.html)（Windows 主机模拟器，开发从机必备）
- [[lwip]] —— FreeModbus TCP 模式的底层 TCP/IP 栈依赖
- [[freertos]] —— 与 FreeModbus 最常搭配的嵌入式 RTOS
- [[embedded-hal]] —— Rust 嵌入式硬件抽象层，与 FreeModbus 的 C 移植层思想一脉相承

## 关联

- [[freertos]] —— 最常与 FreeModbus 搭配使用的嵌入式实时操作系统，提供任务调度和信号量
- [[lwip]] —— FreeModbus TCP 模式底层依赖的轻量 TCP/IP 协议栈
- [[embedded-hal]] —— Rust 嵌入式 HAL，与 FreeModbus 移植层的"硬件抽象切面"思想相同
- [[mqtt-s-2008]] —— 另一种面向资源受限设备的消息协议，与 Modbus 同属工业/物联网通信领域

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）

