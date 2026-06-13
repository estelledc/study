---
title: Zephyr Project — Linux Foundation RTOS 零基础学习笔记
来源: https://docs.zephyrproject.org/latest/introduction/index.html
日期: 2026-06-13
子分类: 嵌入式与 IoT
分类: 操作系统
provenance: pipeline-v3
---

## 先想成什么事

想象一座**大型连锁便利店**，要在几百种不同户型（芯片、板卡）里同时开业：

- 每家店的**电路走线**不同：UART 接在 A 引脚还是 B 引脚、LED 挂在哪条 GPIO 上——这是**硬件差异**。
- 但**运营手册**希望统一：怎么排班（线程调度）、怎么传菜（队列）、怎么省电（电源管理）、怎么连 Wi-Fi / 蓝牙——这是**软件共性**。
- **Zephyr** 就是 Linux Foundation 托管的这套「连锁运营系统」：一个开源 RTOS，用同一套内核 + 驱动模型 + 构建工具，覆盖从 2 KB 级传感器节点到带网络协议栈的智能手表。

和「手机/服务器上的 Linux」的关系：Linux 擅长大内存、复杂文件系统；Zephyr 专攻**资源受限、硬实时、长生命周期**的嵌入式设备。官方定位是 complementary——工业现场里常见 **Zephyr 管实时控制环 + Linux 管数据面** 的组合。

官方入口：[Introduction — Zephyr Project Documentation](https://docs.zephyrproject.org/latest/introduction/index.html)

## 这篇文档在说什么

| 维度 | 内容 |
|------|------|
| 项目 | Zephyr Project — Linux Foundation 协作项目 |
| 许可 | Apache 2.0（部分导入组件另有许可） |
| 内核 | 小 footprint、可抢占、支持协作式/抢占式线程、可选时间片 |
| 架构 | ARM Cortex-M/A/R、RISC-V、x86、Xtensa、ARC、MIPS 等 |
| 板卡 | 1000+ 官方支持板型（持续增加） |
| 构建 | CMake + Kconfig + Devicetree + **west** meta-tool |
| 子系统 | 网络、蓝牙、USB、文件系统、日志、Shell、电源管理等模块化可选 |

Zephyr 不是「只有一个内核的库」，而是**可裁剪的嵌入式发行版**：通过 Kconfig 关掉用不到的功能，通过 Devicetree 描述板级硬件，最终链接成单一镜像烧进 Flash。

## 为什么值得学

| 场景 | Zephyr 提供的价值 |
|------|-------------------|
| 跨芯片产品线 | 同一应用逻辑 + 不同 `.overlay` 换板 |
| 蓝牙 Mesh / OpenThread / Wi-Fi 产品 | 内置协议栈与认证路径，减少自研 |
| 安全与合规 | 用户态（userspace）、内存域、栈溢出检测；面向 CRA 等长周期维护需求 |
| 团队已有 Linux 经验 | Kconfig、Devicetree、CMake 与内核生态一脉相承 |
| 本地快速验证 | `native_sim` 在 Linux 上把 Zephyr 当普通进程跑，利于 CI |

与 FreeRTOS 的常见对比：FreeRTOS 核心是调度器 + 同步原语；Zephyr 在此基础上提供**统一设备模型、west 多仓库管理、完整网络/蓝牙栈、Twister 测试框架**——更像「嵌入式 Linux 的轻量 cousin」，而不是「又一个迷你内核」。

## 核心概念一：四件套（west / Kconfig / Devicetree / CMake）

理解 Zephyr 开发，先记住四件事各管什么：

```
  应用源码 (src/main.c)
        │
        ▼
  prj.conf ──────► Kconfig：开不开 BLE？栈大小？日志级别？
        │
  *.dts / *.overlay ► Devicetree：LED 在哪根 GPIO？SPI 时钟多少？
        │
  CMakeLists.txt ─► 告诉构建系统「这是个 Zephyr 应用」
        │
  west build -b <board>  ──► 拉 modules、调工具链、生成镜像
```

| 组件 | 职责 | 类比 |
|------|------|------|
| **west** | 多仓库 manifest、`west update`、`west build/flash` | 便利店总部的「供应链 + 开店 SOP」 |
| **Kconfig** | 编译期功能开关，`prj.conf` 里 `CONFIG_*=y` | 菜单勾选：要不要外卖（网络）、要不要 24h 冷库（文件系统） |
| **Devicetree** | 硬件拓扑与引脚，生成 `devicetree_generated.h` | 每家店的平面图，不写在 C 里硬编码 |
| **CMake** | 生成 Ninja/Makefile，调用 Zephyr 样板代码 | 施工总包 |

**关键分工**：Kconfig 回答「软件能力要不要编进来」；Devicetree 回答「这块板上硬件长什么样」。新人最常犯的错是把引脚号写死在 `main.c`——Zephyr 风格是用 `DT_ALIAS(led0)` 等宏从树里取。

## 核心概念二：线程与调度

Zephyr 里可调度单元叫 **thread（线程）**。内核提供：

- **协作式**与**抢占式**线程（`CONFIG_PREEMPT_ENABLED` 等控制）
- 基于优先级的就绪队列（多种实现：简单链表、红黑树、多队列，见 `CONFIG_SCHED_*`）
- 同优先级可选**时间片**轮转
- `k_sleep()` / `k_msleep()` 阻塞时让出 CPU
- 扩展调度：EDF（最早截止时间优先）、Meta IRQ（类似 Linux 的 bottom half）

线程状态（简化）：

```
              ┌──────────┐
    就绪 ────►│ Running  │◄──── 抢占 / 唤醒
              └────┬─────┘
                   │ k_sleep / k_sem_take / k_fifo_get ...
                   ▼
              ┌──────────┐
              │ Pending  │  （等待事件，不占 CPU）
              └──────────┘
```

数字**越小优先级越高**（与 FreeRTOS 部分端口「数大优先」相反，写代码时务必查板级文档）。

创建线程两种方式：

1. **运行时** `k_thread_create()` — 灵活，需自管栈数组
2. **编译期** `K_THREAD_DEFINE()` — 静态分配栈与 `k_thread` 控制块，示例与测试里极常见

## 核心概念三：同步与数据传递

内核提供与经典 RTOS 对应的抽象（详见 [Kernel Services](https://docs.zephyrproject.org/latest/kernel/services/)）：

| 对象 | 典型用途 |
|------|----------|
| `k_sem` | 二进制/计数信号量，任务与 ISR 同步 |
| `k_mutex` | 互斥访问共享外设或数据结构 |
| `k_fifo` / `k_lifo` | 指针队列，常用于线程间传递「堆上消息块」 |
| `k_msgq` | 定长消息拷贝进环形缓冲 |
| `k_work` / `k_work_queue` | 把耗时逻辑从 ISR 推迟到线程上下文 |

ISR 里应使用 `k_*_give` 等 **ISR-safe** 变体，并注意部分 API 会要求检查返回值是否需要立即 `k_yield()`。

## 核心概念四：设备模型与 Devicetree

驱动通过 **devicetree 绑定** 与硬件节点关联。应用侧推荐模式：

```c
#define LED0_NODE DT_ALIAS(led0)
static const struct gpio_dt_spec led = GPIO_DT_SPEC_GET(LED0_NODE, gpios);

if (!gpio_is_ready_dt(&led)) { /* 处理未就绪 */ }
gpio_pin_configure_dt(&led, GPIO_OUTPUT);
gpio_pin_set_dt(&led, 1);
```

`gpio_dt_spec` 把 port、pin、flags 打包；换板时只改 DTS，**应用 C 代码可不变**。这与 Linux 的 `struct gpio_desc` 哲学一致，是 Zephyr 可移植性的核心。

## 代码示例一：Blinky（最小应用 + 配置）

官方 [Getting Started](https://docs.zephyrproject.org/latest/develop/getting_started/index.html) 推荐第一个 sample 是 `samples/basic/blinky`。典型 `prj.conf` 几乎为空（默认即可）；`main.c` 核心逻辑如下（摘自上游 sample 结构，省略版权头）：

```c
#include <zephyr/kernel.h>
#include <zephyr/drivers/gpio.h>

#define SLEEP_TIME_MS 500

#define LED0_NODE DT_ALIAS(led0)
static const struct gpio_dt_spec led = GPIO_DT_SPEC_GET(LED0_NODE, gpios);

int main(void)
{
	int ret;
	bool led_state = true;

	if (!gpio_is_ready_dt(&led)) {
		return 0;
	}

	ret = gpio_pin_configure_dt(&led, GPIO_OUTPUT_ACTIVE);
	if (ret < 0) {
		return 0;
	}

	while (1) {
		ret = gpio_pin_toggle_dt(&led);
		if (ret < 0) {
			return 0;
		}
		led_state = !led_state;
		k_msleep(SLEEP_TIME_MS);
	}
	return 0;
}
```

构建与烧录（将 `<board>` 换成 `west boards` 列出的名字，如 `nrf52840dk/nrf52840`）：

```bash
cd ~/zephyrproject/zephyr
west build -p always -b <board> samples/basic/blinky
west flash
```

要点：`main()` 里 `k_msleep()` 阻塞当前线程（此处仅 main 一线程），定时器由内核 tick 或 tickless 模式驱动；LED 引脚来自 `DT_ALIAS(led0)`，不是 `GPIO_PIN(13)` 这种硬编码。

## 代码示例二：多线程 + FIFO（官方 threads sample）

`samples/basic/threads` 演示 `K_THREAD_DEFINE` 与 `k_fifo`：两个线程以不同周期闪灯，第三个线程从 FIFO 取消息并 `printk` 到控制台。精简版如下：

```c
#include <zephyr/kernel.h>
#include <zephyr/drivers/gpio.h>
#include <zephyr/sys/printk.h>

#define STACKSIZE 1024
#define PRIORITY 7

#define LED0_NODE DT_ALIAS(led0)
#define LED1_NODE DT_ALIAS(led1)

struct printk_data_t {
	void *fifo_reserved;  /* k_fifo 要求首字段 */
	uint32_t led;
	uint32_t cnt;
};

K_FIFO_DEFINE(printk_fifo);

static void blink(const struct gpio_dt_spec *spec, uint32_t sleep_ms, uint32_t id)
{
	int cnt = 0;

	gpio_pin_configure_dt(spec, GPIO_OUTPUT);

	while (1) {
		gpio_pin_toggle_dt(spec);

		struct printk_data_t *tx = k_malloc(sizeof(*tx));
		tx->led = id;
		tx->cnt = cnt++;
		k_fifo_put(&printk_fifo, tx);

		k_msleep(sleep_ms);
	}
}

static void blink0(void) { blink(GPIO_DT_SPEC_GET(LED0_NODE, gpios), 100, 0); }
static void blink1(void) { blink(GPIO_DT_SPEC_GET(LED1_NODE, gpios), 1000, 1); }

static void uart_out(void)
{
	while (1) {
		struct printk_data_t *rx = k_fifo_get(&printk_fifo, K_FOREVER);
		printk("Toggled led%u; counter=%u\n", rx->led, rx->cnt);
		k_free(rx);
	}
}

K_THREAD_DEFINE(blink0_id, STACKSIZE, blink0, NULL, NULL, NULL, PRIORITY, 0, 0);
K_THREAD_DEFINE(blink1_id, STACKSIZE, blink1, NULL, NULL, NULL, PRIORITY, 0, 0);
K_THREAD_DEFINE(uart_out_id, STACKSIZE, uart_out, NULL, NULL, NULL, PRIORITY, 0, 0);
```

读这段代码时对照三件事：

1. **三线程并发**：闪灯循环互不阻塞，靠调度器切换。
2. **FIFO 传指针**：生产者 `k_malloc` + `k_fifo_put`，消费者 `k_free`——典型「多生产者单消费者」日志模式。
3. **编译期建线程**：`K_THREAD_DEFINE` 省去手动 `k_thread_create` 与栈数组声明。

## 从零到跑通：环境骨架

官方推荐路径（Ubuntu/macOS/Windows 类似，依赖 CMake ≥ 3.20、Python ≥ 3.12、west ≥ 1.4）：

```bash
python3 -m venv ~/zephyrproject/.venv
source ~/zephyrproject/.venv/bin/activate
pip install west
west init ~/zephyrproject
cd ~/zephyrproject && west update
west zephyr-export
west packages pip --install
cd zephyr && west sdk install
```

之后每个应用目录执行 `west build -b <board> [-p always]`，`west flash` 烧录。无板子时可用 `native_sim` 在主机上跑部分子系统，适合单元级逻辑验证。

## 子系统一览（按需启用）

官方 Introduction 把 **subsystem** 定义为内核之上、可模块化裁剪的功能块，例如：

| 子系统 | 能力摘要 |
|--------|----------|
| 网络 | 原生 IPv4/IPv6 栈、BSD socket API、MQTT/CoAP/LwM2M |
| 蓝牙 | BLE 5.x Host + Controller、Mesh |
| OpenThread | 802.15.4 Thread 协议（多 Nordic 方案） |
| USB | Device 类：CDC、MSC、HID、DFU 等 |
| 文件系统 | LittleFS、FatFs、ext2 等通过 VFS 挂载 |
| 日志 | 多 backend、运行时过滤、与 Shell 集成 |
| 电源管理 | 系统级 tickless + 设备级 PM 回调 |

全部通过 Kconfig 打开，避免「为了用一个 GPIO 拖进整个 TCP 栈」——但若你的产品本来就要联网，Zephyr 的优势正是**这些栈与内核在同一仓库体系里一起测过**。

## 安全与内存保护（建立正确预期）

Zephyr 在具备 MPU/MMU 的架构上支持：

- 栈溢出检测（`CONFIG_STACK_SENTINEL` 等）
- **Userspace**：线程分用户态/内核态，系统调用边界
- **Memory domains**：一组线程共享可访问的内存区域

资源极度紧张的 MCU 可能退化为**单地址空间镜像**：应用与内核链接在一起，靠静态分配与审查保证安全——读文档时要分清「你的板子属于哪一档」。

## 与 FreeRTOS / 裸机对照表

| 话题 | 裸机 `while(1)` | FreeRTOS | Zephyr |
|------|-----------------|----------|--------|
| 并发单元 | 标志位 + 状态机 | Task | Thread |
| 硬件描述 | 头文件宏 | 多为移植层硬编码 | Devicetree |
| 功能裁剪 | 手动 `#ifdef` | `FreeRTOSConfig.h` | Kconfig + `prj.conf` |
| 多仓库依赖 | 手动拷贝 | 各厂商 SDK | west manifest |
| 协议栈 | 第三方拼凑 | 常外接 | 主线集成 |

## 学习路径建议

1. **跑通 Blinky + Hello World** — 熟悉 `west build/flash` 与板名。
2. **读 `samples/basic/threads`** — 理解 `K_THREAD_DEFINE` 与 FIFO。
3. **改 Devicetree overlay** — 给自定义板加一节 I2C 传感器节点，用 `device_is_ready()` 探测。
4. **写一个 `prj.conf`** — 打开 `CONFIG_LOG`、`CONFIG_SHELL`，体验运行时调试。
5. **查 [Kernel Services](https://docs.zephyrproject.org/latest/kernel/services/)** — 按项目需要深入 mutex、msgq、work queue。
6. **社区** — [Discord](https://chat.zephyrproject.org)、users@lists.zephyrproject.org；提问时贴完整命令与文本日志，而非截图。

## 小结

Zephyr Project 是 Linux Foundation 下的**开源、可裁剪、跨架构 RTOS 生态**：小内核负责调度与同步，Devicetree 描述硬件，Kconfig 裁剪功能，west 管理源码与工具链，之上叠加网络、蓝牙、USB 等子系统。零基础上手的关键不是背 API，而是接受「**硬件在 DTS，配置在 prj.conf，构建交给 west**」的分工；在此基础上，`K_THREAD_DEFINE` + 设备 API 足以写出与板卡解耦的多线程固件。官方 [Introduction](https://docs.zephyrproject.org/latest/introduction/index.html) 与 [Getting Started Guide](https://docs.zephyrproject.org/latest/develop/getting_started/index.html) 是持续更新的主索引，版本号随季度 release（如 4.x）演进，实践时以你 `west update` 检出的文档为准。
