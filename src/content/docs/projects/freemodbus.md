---
title: FreeModbus — 嵌入式 Modbus RTU/TCP 从机协议栈
来源: 'https://github.com/cwalter-at/freemodbus'
日期: 2026-06-06
分类: 操作系统
子分类: 嵌入式
难度: 中级
---

## 是什么

FreeModbus 是一个可移植的 C 语言库，专门给嵌入式系统实现 **Modbus 从机（Slave）协议栈**，支持 RTU、ASCII 和 TCP 三种传输模式。日常类比：它就像一个"工业翻译官"——你的单片机说 C 语言，工厂里的 PLC 和 SCADA 系统说 Modbus；FreeModbus 架在中间，把两边的话互相翻译。

Modbus 是 1979 年 Modicon 公司（PLC 鼻祖）发明的串行通信协议，今天仍是工业现场最常见的协议之一。一条生产线上的温度传感器、变频器、电流表，绝大多数都能挂在 Modbus 总线上。FreeModbus 让你的 MCU 以极少的 Flash 和 RAM 占用加入这条总线，成为其中一个"从机"节点，接受主机（PLC/上位机）的读写命令。

核心架构分两层：底层是**硬件抽象层（HAL port）**，你需要实现 UART 中断回调和定时器；上层是**协议处理层**，由 FreeModbus 的状态机驱动，用户只需在主循环中调用 `eMBPoll()` 即可。

## 为什么重要

不了解 FreeModbus（或 Modbus 从机实现原理），以下事情会让你抓狂：

- 为什么上位机说"无响应"，而示波器上明明看到了数据——RTU 帧间沉默时间没做对，主机认为帧损坏
- 为什么读到的寄存器值总是差 1——Modbus 地址 0-based 和工具显示的 1-based 之间的经典偏移坑
- 为什么 FreeRTOS 环境下主机偶发超时——eMBPoll 必须被周期调用，但你的任务被高优先级任务抢占了
- 为什么同一套代码在 STM32 上跑正常，换 ESP32 就乱码——字节序（大端 vs 小端）没处理

## 核心要点

1. **三层结构：用户应用 → 协议层 → HAL 端口层**。FreeModbus 的设计思路是：协议状态机完全在 `modbus/` 目录里，平台无关；你只需要为自己的硬件实现 `port/` 目录下几个函数——串口发送、接收中断处理、3.5 字符定时器启停。类比：FreeModbus 是一个厨房合同，你只需提供厨具（硬件 port），它负责出菜（协议帧处理）。

2. **寄存器模型：四类寄存器，四个回调**。Modbus 把数据抽象成 4 种寄存器：保持寄存器（Holding，16 位可读写）、输入寄存器（Input，16 位只读）、线圈（Coil，1 位可读写）、离散输入（Discrete，1 位只读）。FreeModbus 对每类寄存器提供一个回调函数——`eMBRegHoldingCB`、`eMBRegInputCB`、`eMBRegCoilsCB`、`eMBRegDiscreteCB`——你在回调里把应用数据填进去，协议层自动打包返回。类比：四个邮箱，邮递员（FreeModbus）来取信或投信时叫你开门，你决定里面放什么。

3. **事件驱动主循环**：接收中断把帧放进内部事件队列，`eMBPoll()` 从队列取出事件依次处理——`FRAME_RECEIVED` → 解析校验 → 调回调 → `FRAME_SENT`。这个设计让 FreeModbus 可以在裸机（无 OS）和 RTOS 两种环境下运行：裸机在 `while(1)` 里轮询，RTOS 中单独建一个任务阻塞在队列上。

## 实践案例

### 案例 1：STM32 裸机 RTU 从机（最小可运行版本）

```c
/* main.c - 裸机 RTU 从机核心骨架 */
#include "mb.h"

/* 应用数据：4 个保持寄存器 */
static USHORT usRegHoldingBuf[4] = {0};

int main(void) {
    /* 初始化：RTU 模式，从机地址 0x0A，波特率 38400，偶校验 */
    eMBInit(MB_RTU, 0x0A, 0, 38400, MB_PAR_EVEN);
    eMBEnable();

    for (;;) {
        eMBPoll();  /* 必须周期调用，驱动状态机 */
    }
}

/* 保持寄存器读写回调 */
eMBErrorCode eMBRegHoldingCB(UCHAR *pucRegBuffer, USHORT usAddress,
                              USHORT usNRegs, eMBRegisterMode eMode) {
    /* Modbus 地址 0-based，usAddress 从 0 开始 */
    if (usAddress + usNRegs > 4) return MB_ENOREG;

    if (eMode == MB_REG_READ) {
        while (usNRegs--) {
            /* 大端：高字节在前 */
            *pucRegBuffer++ = (usRegHoldingBuf[usAddress] >> 8) & 0xFF;
            *pucRegBuffer++ = usRegHoldingBuf[usAddress] & 0xFF;
            usAddress++;
        }
    } else {
        while (usNRegs--) {
            usRegHoldingBuf[usAddress] = ((USHORT)*pucRegBuffer++ << 8);
            usRegHoldingBuf[usAddress] |= *pucRegBuffer++;
            usAddress++;
        }
    }
    return MB_ENOERR;
}
```

**逐部分解释**：
- `eMBInit` 配置串口号（第 3 个参数 `0` 是端口索引，对应你 port 层的 USART1）
- `eMBEnable` 使能接收中断，协议栈开始监听总线
- `eMBPoll` 非阻塞轮询：无事件立刻返回，不占用 CPU
- 回调里手动做大端转换——这是新手最容易漏掉的地方

### 案例 2：FreeRTOS + lwIP TCP 从机

```c
/* modbus_task.c - RTOS 环境 TCP 从机 */
#include "mb.h"
#include "FreeRTOS.h"
#include "task.h"

/* 输入寄存器：映射 ADC 采样值 */
static USHORT usRegInputBuf[8] = {0};

void vModbusTask(void *pvParam) {
    /* TCP 模式，监听 502 端口（Modbus 标准端口） */
    eMBTCPInit(502);
    eMBEnable();

    for (;;) {
        eMBPoll();
        /* 让出 CPU，tick 间隔 = 1ms 时约 1ms 轮询一次 */
        vTaskDelay(1);
    }
}

/* 输入寄存器只读回调 */
eMBErrorCode eMBRegInputCB(UCHAR *pucRegBuffer, USHORT usAddress, USHORT usNRegs) {
    if (usAddress + usNRegs > 8) return MB_ENOREG;
    while (usNRegs--) {
        /* ADC 值由主任务实时更新到 usRegInputBuf */
        *pucRegBuffer++ = (usRegInputBuf[usAddress] >> 8) & 0xFF;
        *pucRegBuffer++ = usRegInputBuf[usAddress] & 0xFF;
        usAddress++;
    }
    return MB_ENOERR;
}
```

**逐部分解释**：
- `eMBTCPInit(502)` 替代串口初始化，port 层用 lwIP socket 实现
- 单独 Modbus 任务可设较低优先级，避免抢占控制任务
- `usRegInputBuf` 由应用任务写、Modbus 任务读——需用临界区保护或 atomic 操作
- TCP 模式下不需要 3.5 字符定时器，帧边界由 MBAP 头中的长度字段决定

### 案例 3：双缓冲防数据撕裂

```c
/* 问题：上位机读寄存器时，应用任务正在更新同一块内存，导致读到半新半旧数据 */

static USHORT regBuf[2][16]; /* 双缓冲 */
static int activeBuf = 0;    /* 当前供 Modbus 读的缓冲索引 */

/* 应用任务：写非活跃缓冲，写完后原子切换 */
void vAppTask(void *pvParam) {
    for (;;) {
        int writeBuf = 1 - activeBuf;
        regBuf[writeBuf][0] = read_sensor_temperature();
        regBuf[writeBuf][1] = read_sensor_humidity();
        /* ...更新其余寄存器... */
        taskENTER_CRITICAL();
        activeBuf = writeBuf;  /* 原子切换 */
        taskEXIT_CRITICAL();
        vTaskDelay(pdMS_TO_TICKS(100));
    }
}

eMBErrorCode eMBRegInputCB(UCHAR *pucRegBuffer, USHORT usAddress, USHORT usNRegs) {
    USHORT *src = regBuf[activeBuf]; /* 始终读活跃缓冲 */
    /* ...填充 pucRegBuffer... */
    return MB_ENOERR;
}
```

**逐部分解释**：
- 双缓冲让采样频率（100ms）和 Modbus 读取完全解耦
- 切换指针是原子操作（单字写），不需要互斥锁保护读端
- 上位机无论何时查询，总拿到最近一次完整的采样帧，不会读到撕裂数据

## 踩过的坑

1. **RTU 定时器精度不够**：3.5 字符间隔（以 38400 波特为例约 1ms）必须用硬件定时器实现，用 SysTick 或 RTOS 的 vTaskDelay 精度太低，会把连续两帧误判为一帧或把一帧内的字节间隔误判为帧结束。

2. **寄存器地址差 1**：Modbus PDU 寄存器地址从 0 开始，但 Modbus Poll / SCADA 工具默认显示 40001 代表地址 0，你的回调收到的 `usAddress` 是 0，不是 40001，也不是 1。新手常把映射偏移写反。

3. **在回调里做耗时操作**：`eMBRegHoldingCB` 在 `eMBPoll` 执行期间被同步调用，如果里面有等待互斥锁、I2C 读取、Flash 写入，会让协议栈超时；主机会连续重试，总线被占满。解决方案：回调只做内存拷贝，耗时操作异步化。

4. **忘记实现所有 4 个回调**：编译时只报"函数未定义"，链接后如果用到某类寄存器却没实现回调，运行时返回 `MB_ENOREG`，上位机报"非法数据地址"，新手以为是协议层 bug。

## 适用 vs 不适用场景

**适用**：
- 需要接入已有 Modbus 主机（PLC/SCADA/工业人机界面）的嵌入式从机设备
- 资源受限的 MCU（Cortex-M0/M3，Flash < 64KB）：FreeModbus 核心约 5KB Flash
- 需要同时支持 RTU 串口和 TCP 网口的设备（两套 port 层切换即可）
- 学习 Modbus 协议实现细节的参考代码库

**不适用**：
- 需要 Modbus **主机（Master）**功能——FreeModbus 只实现从机端，主机需要另找库（如 libmodbus）
- 需要 Modbus Plus 或私有扩展功能码（> 0x17）的场景
- 高速数据采集（> 10kHz 更新率）——Modbus 本身是低速轮询协议，不适合实时流数据
- 已有 IEC 61131 PLC 运行环境——直接用 PLC 的内建 Modbus 功能块更合适

## 历史小故事（可跳过）

- **1979 年**：Modicon 公司为连接自家可编程逻辑控制器（PLC）发布 Modbus 协议。设计极简：Master 发请求，Slave 回应，没有碰撞检测，没有广播确认，今天看来简陋，但正因简单，40 年后仍是工业现场最常见的协议。
- **2002 年前后**：Christian Walter 在 Austria 开始 FreeModbus 项目，填补嵌入式开源 Modbus 从机实现的空白；相比商业 Modbus 库动辄数千美元的授权费，BSD 许可让小型公司和学生都能用。
- **2009 年，v1.6.0**：Chris Walter 发布最后一个官方版本，此后项目转为社区维护。因为 Modbus 协议本身极少变化，v1.6.0 的代码在十几年后仍被广泛引用。
- **现在**：GitHub 上衍生出 FreeModbus for STM32 HAL、ESP-IDF 版本、Zephyr RTOS 移植等多个分支，核心状态机代码几乎未变，只是 port 层接了更多硬件平台。

## 学到什么

1. **分层设计让协议可移植**：FreeModbus 把协议状态机和硬件 I/O 完全分离；这种"协议层 + HAL 层"思路在嵌入式领域极其通用，lwIP、TinyUSB 都是同一套哲学。
2. **回调即合约**：四个寄存器回调函数就是 FreeModbus 与应用层的完整接口；理解一个库的回调签名，等于理解它对你的全部要求。
3. **协议细节决定互操作性**：RTU 帧间沉默时间、地址偏移、大端字节序——这些"1 bit 的差距"在工业现场会让设备完全无法通信，细节即可靠性。
4. **简单协议的生命力**：Modbus 没有加密、没有流控、没有服务发现，设计于 1979 年，今天仍跑在数百万工厂设备里。过度设计不是美德，够用 + 标准化才有生命力。

## 延伸阅读

- Modbus 官方规范：[Modbus Application Protocol v1.1b](https://modbus.org/specs.php)（免费 PDF，协议权威文档）
- FreeModbus API 文档：[embedded-solutions.at FreeModbus v1.6 API](https://www.embedded-solutions.at/files/freemodbus-v1.6-apidoc/group__modbus.html)（官方文档，含所有函数签名和状态机说明）
- 实战示例：[FreeMODBUS Examples](https://www.embedded-experts.at/en/freemodbus/freemodbus-examples/)（STR71X/FreeRTOS 示例详解）
- [[freertos]] —— FreeModbus 最常配套使用的嵌入式 RTOS，事件队列、任务优先级与 eMBPoll 调用频率密切相关
- [[lwip]] —— FreeModbus TCP 模式常用的嵌入式 TCP/IP 协议栈，port 层用 lwIP socket 实现

## 关联

- [[freertos]] —— FreeModbus 的 RTOS 移植通常以 FreeRTOS 任务 + 队列为基础，两者几乎总成对出现
- [[lwip]] —— Modbus TCP 模式的 port 层依赖轻量级 IP 协议栈，lwIP 是嵌入式领域首选
- [[embedded-hal]] —— 为嵌入式硬件抽象定义通用接口，与 FreeModbus port 层承担同类职责但面向 Rust 生态
- [[mqtt-s-2008]] —— MQTT-SN 与 Modbus 同为工业/IoT 设备常用协议，前者事件驱动适合无线网络，后者轮询适合有线总线

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[embedded-hal]] —— embedded-hal — 让同一份驱动代码跑在任意芯片上
- [[freertos]] —— FreeRTOS-Kernel — KB 级 RAM 跑得动的可抢占多任务内核
- [[lwip]] —— lwIP — ~40KB ROM 跑完整 TCP/IP 的嵌入式网络栈
- [[mqtt-s-2008]] —— MQTT-S 2008 — 把发布/订阅消息机制装进传感器芯片

