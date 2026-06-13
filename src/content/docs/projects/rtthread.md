---
title: RT-Thread 零基础入门笔记
来源: https://github.com/RT-Thread/rt-thread
日期: 2026-06-13
分类: 其他
子分类: embedded-and-iot
provenance: pipeline-v3
---

# RT-Thread 零基础入门笔记

## 一、什么是 RT-Thread？

RT-Thread（实时线程）是一个开源的嵌入式实时操作系统（RTOS），2006 年诞生，采用 Apache 2.0 许可证，可以免费用于商业产品。

**类比**：想象你的单片机（MCU）是一块空白的蛋糕，而 RT-Thread 就是蛋糕上的"调度层"——它负责管理蛋糕上的所有"配料"（任务、内存、外设），让这些配料有条不紊地协作，而不是互相打架。

没有 RTOS 时，程序是"一条道走到黑"的：

```
主循环 → 读传感器 → 处理数据 → 发送数据 → 再读传感器 → ...
```

如果"发送数据"卡住了（比如 WiFi 信号不好），整个程序都停了。

有了 RT-Thread 后，每个任务变成独立的"线程"，操作系统负责在它们之间快速切换，给人的感觉是"多个任务同时在做"：

```
线程 A：每 100ms 读一次传感器
线程 B：每 1s 发送一次数据
线程 C：等待用户按键
```

## 二、架构分层

RT-Thread 像三层汉堡：

- **内核层（面包底层）**：线程调度、信号量、消息队列、内存管理、定时器等核心功能。Nano 版只需 3KB Flash + 1.2KB RAM。
- **组件和服务层（肉饼和蔬菜）**：虚拟文件系统、FinSH 命令行终端、网络协议栈、设备框架等。
- **软件包层（顶层酱料）**：超过 370 个可复用软件包，如 MQTT、LVGL 图形库、SQLite 等，像乐高积木一样按需拼装。

支持的芯片架构包括 ARM Cortex-M/R/A、RISC-V、MIPS、Xtensa 等近 200 款开发板。

## 三、核心概念

### 1. 线程（Thread）

线程是 RT-Thread 最基本的执行单位。每个线程有自己的栈、优先级和状态（运行、就绪、挂起、关闭）。RT-Thread 使用**基于优先级的抢占式调度**：优先级高的线程随时可以打断低优先级线程运行。

### 2. 信号量（Semaphore）

信号量是线程间的"信号灯"。分两种：

- **二值信号量**：只有 0 和 1，相当于"开关"
- **计数信号量**：可以有 0 到 N 的计数，相当于"票券"

### 3. 互斥锁（Mutex）

互斥锁保护"共享资源"，同一时间只允许一个线程访问。它支持**优先级继承**——当低优先级线程持有锁时，如果高优先级线程要进来等锁，低优先级线程的优先级会被暂时提升到等待者的级别，避免"优先级翻转"问题。

### 4. 消息队列（Message Queue）

消息队列是线程间传递数据的"信箱"。一个线程把消息放进去（send），另一个线程取出来（receive）。

### 5. 内存管理

RT-Thread 使用**静态分配 + 动态分配**两种方式。动态分配基于"内存堆"，使用首次适配（First Fit）算法。还有基于线程的内存池，适合频繁分配/释放固定大小内存的场景。

## 四、代码示例

### 示例 1：创建线程 + 信号量同步

这是一个经典的"生产者-消费者"模型：一个线程读传感器数据，另一个线程把数据发到串口。

```c
#include <rtthread.h>

/* 定义信号量：初始值为 0（表示没有数据） */
static struct rt_semaphore data_ready_sem;

/* 共享缓冲区 */
static int sensor_value = 0;

/* 生产者线程：每 500ms 读取一次传感器并发送信号量 */
void producer_thread(void *param)
{
    while (1)
    {
        /* 模拟读取传感器 */
        sensor_value++;
        rt_kprintf("[生产者] 读取到传感器值: %d\n", sensor_value);

        /* 发送信号量，告诉消费者有新数据了 */
        rt_sem_release(&data_ready_sem);

        /* 等待 500ms */
        rt_thread_mdelay(500);
    }
}

/* 消费者线程：等待信号量，收到后处理数据 */
void consumer_thread(void *param)
{
    rt_err_t result;

    while (1)
    {
        /* 等待信号量，最长等 2000ms（超时返回超时错误） */
        result = rt_sem_take(&data_ready_sem, RT_WAITING_FOREVER);

        if (result == RT_EOK)
        {
            rt_kprintf("[消费者] 处理数据: %d\n", sensor_value);
            /* 这里可以把数据发到 WiFi、上报到服务器等 */
        }
    }
}

/* 线程入口：系统启动后自动运行 */
int rt_app_init(void)
{
    rt_thread_t prod_thread, cons_thread;

    /* 初始化信号量 */
    rt_sem_init(&data_ready_sem, "data_sem", 0, RT_IPCB_FLAG);

    /* 创建生产者线程，优先级 20，栈大小 1024 字节 */
    prod_thread = rt_thread_create("producer",
                                   producer_thread, RT_NULL,
                                   1024, 20, 10);
    if (prod_thread != RT_NULL)
        rt_thread_startup(prod_thread);

    /* 创建消费者线程，优先级 10，栈大小 1024 字节 */
    cons_thread = rt_thread_create("consumer",
                                   consumer_thread, RT_NULL,
                                   1024, 10, 10);
    if (cons_thread != RT_NULL)
        rt_thread_startup(cons_thread);

    return 0;
}
```

**运行效果**：

```
[生产者] 读取到传感器值: 1
[消费者] 处理数据: 1
[生产者] 读取到传感器值: 2
[消费者] 处理数据: 2
[生产者] 读取到传感器值: 3
[消费者] 处理数据: 3
...
```

信号量就像两人之间的对讲机：生产者说"有数据了"，消费者收到后才开始处理。

### 示例 2：互斥锁保护共享资源

多个线程同时访问同一个串口时，需要用互斥锁保护：

```c
#include <rtthread.h>

/* 定义互斥锁 */
static struct rt_mutex uart_mutex;

/* 线程 1：写日志到串口 */
void logger_thread(void *param)
{
    while (1)
    {
        /* 获取互斥锁，拿不到就等着 */
        rt_mutex_take(&uart_mutex, RT_WAITING_FOREVER);

        rt_kprintf("[日志] 温度: 25.3C, 湿度: 60%%\n");
        rt_kprintf("[日志] 电压: 3.3V, 电流: 120mA\n");

        /* 释放互斥锁，让其他线程可以使用串口 */
        rt_mutex_release(&uart_mutex);

        rt_thread_mdelay(2000);
    }
}

/* 线程 2：上报状态到串口 */
void reporter_thread(void *param)
{
    while (1)
    {
        /* 获取互斥锁 */
        rt_mutex_take(&uart_mutex, RT_WAITING_FOREVER);

        rt_kprintf("[上报] 在线设备数: 42\n");
        rt_kprintf("[上报] 固件版本: v2.1.0\n");

        /* 释放互斥锁 */
        rt_mutex_release(&uart_mutex);

        rt_thread_mdelay(5000);
    }
}

int rt_app_init(void)
{
    rt_thread_t log_t, rep_t;

    /* 初始化互斥锁 */
    rt_mutex_init(&uart_mutex, "uart_mtx", RT_IPCB_FLAG);

    log_t = rt_thread_create("logger", logger_thread, RT_NULL,
                             1024, 15, 10);
    if (log_t) rt_thread_startup(log_t);

    rep_t = rt_thread_create("reporter", reporter_thread, RT_NULL,
                             1024, 15, 10);
    if (rep_t) rt_thread_startup(rep_t);

    return 0;
}
```

**关键点**：没有互斥锁时，两个线程的串口输出会混在一起变成乱码。加了互斥锁后，每次只有一个线程能"独占"串口输出。

## 五、开发工具

- **RT-Thread Studio**：官方一站式 IDE，图形化配置系统，拖拽式添加软件包
- **Env 工具**：命令行辅助工具，基于 TUI 界面，用 `menuconfig` 图形化裁剪内核和组件
- **SCons**：Python 构建系统，命令行编译
- 也支持 Keil MDK、IAR、GCC 等传统开发环境

## 六、与 FreeRTOS 的简单对比

| 特性 | RT-Thread | FreeRTOS |
|------|-----------|----------|
| 最小体积 | 3KB Flash + 1.2KB RAM（Nano） | 约 5KB Flash |
| 生态组件 | 文件系统、网络协议栈、软件包市场 | 需要额外移植 |
| 设备抽象 | 统一的设备框架（类 Linux） | 无 |
| 社区 | 中国社区活跃，文档中文友好 | 全球社区庞大 |
| 许可证 | Apache 2.0 | MIT |

## 七、学习建议

1. **先跑起来**：用 QEMU 模拟器（无需硬件）或 STM32F103 BluePill 开发板，跟着官方文档编译第一个程序
2. **理解线程调度**：这是 RTOS 的灵魂，画个时间轴自己推演优先级切换
3. **动手改参数**：尝试修改线程优先级、栈大小、信号量初始值，观察行为变化
4. **学设备框架**：RT-Thread 的设备模型和 Linux 很像，学了这个就能举一反三操作 UART、I2C、SPI
5. **尝试软件包**：从 MQTT、LVGL 等知名包开始，体验"积木式开发"

## 八、参考链接

- GitHub 仓库：https://github.com/RT-Thread/rt-thread
- 官方文档：https://www.rt-thread.io/document/site/
- 软件包市场：https://packages.rt-thread.org/
- 开发者论坛：https://club.rt-thread.io/
