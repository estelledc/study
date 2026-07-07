---
title: FreeModbus：嵌入式设备的 Modbus 从站协议栈
来源: 'https://github.com/cwalter-at/freemodbus'
日期: 2026-07-07
分类: embedded
难度: 初级
---

## 是什么

FreeModbus 是一个给嵌入式设备用的 Modbus ASCII、RTU 和 TCP 协议栈，重点是实现从站设备。

日常类比：工厂里有很多仪表、传感器和 PLC。Modbus 像一套统一问答话术：“请告诉我 100 号寄存器的值”“请把这个线圈打开”。FreeModbus 就是帮小设备听懂这套话术的翻译员。

典型主循环长这样：

```c
eMBInit(MB_RTU, 0x0A, 0, 38400, MB_PAR_EVEN);
eMBEnable();
for (;;) {
    eMBPoll();
}
```

应用代码不用自己解析每个字节，而是在回调里提供寄存器、线圈和离散输入的值。

它适合学习工业通信：代码小、接口清楚，能看到协议栈如何和串口、定时器、TCP 以及业务寄存器连接起来。

## 为什么重要

不理解 FreeModbus，嵌入式通信里几个常见问题会很难落地：

- Modbus 是工业现场常见协议，很多 PLC、仪表和采集器都支持。
- 嵌入式设备资源少，协议栈要小，不能随便 malloc 一堆状态。
- RTU 对串口时序敏感，协议正确不等于硬件配置正确。
- 应用寄存器和协议帧之间要有清晰边界，否则业务代码会和通信细节缠在一起。

## 核心要点

1. **从站协议栈**：原项目说明里强调 BSD licensed MODBUS RTU/ASCII and TCP slave。它主要让设备响应主站请求。

2. **三种传输模式**：RTU 更紧凑，ASCII 更易调试，TCP 跑在以太网或 IP 网络上。

3. **轮询驱动**：应用先 `eMBInit`，再 `eMBEnable`，主循环或 RTOS 任务里周期性调用 `eMBPoll`。

4. **寄存器由应用提供**：协议栈不内部保存所有寄存器。读写发生时，它调用 `eMBRegHoldingCB` 等回调。

5. **移植层很关键**：串口收发、定时器、事件队列和临界区通常要由具体芯片或 RTOS 适配。

## 实践案例

### 案例 1：STM32 做一个 RTU 从站

```c
void app_main(void) {
    eMBInit(MB_RTU, 10, 1, 9600, MB_PAR_EVEN);
    eMBEnable();
    while (1) {
        eMBPoll();
    }
}
```

逐部分解释：

- `MB_RTU` 选择串口二进制帧。
- `10` 是从站地址，主站请求必须打到这个地址或广播地址。
- `9600` 和 `MB_PAR_EVEN` 必须和主站、串口硬件一致。

### 案例 2：实现保持寄存器回调

```c
eMBErrorCode eMBRegHoldingCB(UCHAR *buf, USHORT addr,
                             USHORT nregs, eMBRegisterMode mode) {
    if (addr < REG_START || addr + nregs > REG_END) return MB_ENOREG;
    if (mode == MB_REG_READ) copy_app_regs_to(buf, addr, nregs);
    else copy_buf_to_app_regs(addr, buf, nregs);
    return MB_ENOERR;
}
```

这段代码的重点是边界检查。回调返回 `MB_ENOREG` 时，协议栈会把它变成 Modbus 异常响应。

### 案例 3：TCP 模式接入上位机

```c
eMBTCPInit(502);
eMBEnable();
for (;;) {
    eMBPoll();
}
```

TCP 模式省掉了串口波特率和校验位，但多了网络栈、端口、防火墙和连接管理。嵌入式里常见组合是 lwIP + FreeModbus。

## 踩过的坑

1. **地址从 0 还是从 1 开始混淆**：Modbus 文档、上位机软件和代码数组常常差一位，先统一约定再调试。

2. **串口参数不一致**：波特率、校验位、停止位只要有一个不一致，RTU 就会像没接线一样。

3. **忘记周期调用 `eMBPoll`**：初始化成功不代表会处理帧，事件要靠轮询或 RTOS 任务推进。

4. **回调里不做范围检查**：主站请求越界时应该返回异常，而不是读坏内存。

5. **忽略许可证边界**：仓库 README 写到 core stack、port implementations、demo applications 许可证不同，商用前要逐文件检查。

## 适用 vs 不适用场景

**适用**：

- MCU 或小型 Linux 设备做 Modbus 从站。
- 学习 RTU 帧、功能码、寄存器模型和异常响应。
- 需要把传感器、继电器、计量数据暴露给 PLC 或上位机。
- 已有串口、定时器、lwIP 等基础移植能力的项目。

**不适用**：

- 需要完整主站功能且不想改造源码的项目。
- 强安全隔离的公网工业网关，Modbus 本身没有现代认证加密。
- 对协议认证、诊断工具、长期维护 SLA 有商业要求的场景。
- 不熟悉底层串口时序，却希望直接复制代码一次成功。

## 历史小故事（可跳过）

- Modbus 起源很早，官方规范把它定义成应用层 request/reply 协议，通过功能码描述读写动作。
- FreeModbus 的文档生成时间能追溯到 2018 年，代码风格也很“传统嵌入式 C”。
- 仓库 README 说明原作者活动较少，社区现在用更开放的方式维护 master，同时保留 1.6.0 作为官方发布点。
- 2026 年 7 月查看 GitHub 页面时，仓库显示约 1.1k stars，最新 release 是 v1.6.0。

## 学到什么

1. 工业协议栈的难点不是 API 多，而是时序、边界检查和移植层。
2. FreeModbus 把协议解析和业务寄存器分开，用回调让应用提供真实数据。
3. RTU、ASCII、TCP 是同一套 Modbus 应用语义落在不同传输上的样子。
4. 学嵌入式通信时，先跑通最小从站，再逐步补寄存器表、异常处理和诊断日志。

## 延伸阅读

- 官方仓库：[cwalter-at/freemodbus](https://github.com/cwalter-at/freemodbus)
- API 文档：[FreeModbus Modbus module](https://www.embedded-solutions.at/files/freemodbus-v1.6-apidoc/group__modbus.html)
- 寄存器回调：[FreeModbus Registers](https://www.embedded-solutions.at/files/freemodbus-v1.6-apidoc/group__modbus__registers.html)
- 官方规范：[Modbus Specifications](https://www.modbus.org/modbus-specifications)
- [[lwip]] —— TCP 模式常见网络栈搭档

## 关联

- [[lwip]] —— 嵌入式 TCP/IP 栈，适合和 Modbus TCP 对照学习。
- [[mbedtls]] —— 如果要把工业通信放到更安全的链路上，会碰到 TLS 话题。
- [[mqtt-s-2008]] —— 另一类物联网通信协议，和 Modbus 的主从模型不同。
- [[docker]] —— 可用容器跑上位机模拟器或测试环境。
- [[caddy]] —— 当 Modbus 数据被网关转成 Web API 时，可能需要 HTTPS 入口。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
