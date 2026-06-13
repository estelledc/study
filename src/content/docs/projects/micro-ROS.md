---
title: micro-ROS 零基础入门
来源: https://github.com/micro-ROS/micro-ROS
日期: 2026-06-13
分类: 机器学习
子分类: embedded-and-iot
provenance: pipeline-v3
---

# micro-ROS 零基础入门

## 一、从日常类比开始：为什么需要 micro-ROS？

想象一个工厂里的机器人：

- 大脑（比如 NVIDIA Jetson）运行 ROS 2，负责决策、路径规划、视觉处理
- 身体（比如 Arduino、STM32）上有大量传感器和电机，负责采集温度、读取编码器、驱动轮子

问题：大脑和身体之间怎么对话？

传统做法是"各说各的话"——大脑用 ROS 2 的协议，身体用 UART 串口发自己的私有格式。每次加一个新传感器，都要重新写解析代码。

micro-ROS 的做法是：让身体也"说 ROS 2 的话"。这样大脑可以直接用 `ros2 topic echo` 读取传感器数据，就像读取自己的本地话题一样。

**一句话总结**：micro-ROS = 把 ROS 2 的核心能力搬到只有几 KB RAM 的微控制器上。

---

## 二、核心概念

### 2.1 整体架构

micro-ROS 不是一种全新的协议，而是站在巨人的肩膀上：

```
[微控制器 MCU]
  ├── rcl + rclc       ← C 语言的 ROS 2 客户端 API（类似 Python/C++ 的 rclpy/rclcpp）
  ├── rmw_microxrcedds  ← 中间件适配层，把 ROS 2 的概念翻译成 XRCE 协议
  ├── Micro XRCE-DDS    ← 核心中间件协议（ OMG DDS-XRCE 标准的实现）
  └── 传输层            ← UART / UDP / TCP / 6LoWPAN / Bluetooth

[micro-ROS Agent] ← 跑在 Linux 上的小程序，充当翻译官
  └── 把 XRCE 协议转换成标准 DDS/ROS 2 协议

[ROS 2 主机] ← 运行在电脑或边缘设备上
  └── ros2 topic / ros2 node / rclcpp / rclpy
```

可以把它想象成一个三层结构：

1. **MCU 端**：用 C 语言写的 micro-ROS 节点，运行在资源极受限的芯片上
2. **Agent 端**：一个轻量级的"翻译程序"，连接 MCU 和 ROS 2 世界
3. **ROS 2 端**：标准的 ROS 2 工具链，可以正常使用所有 `ros2` 命令

### 2.2 micro-ROS Agent（代理）

Agent 是 micro-ROS 最关键的概念之一。MCU 上**不直接跑 DDS**，而是跑一个更轻量的 XRCE 协议。Agent 跑在Linux/Mac/Windows 上，负责：

- 接收 MCU 发来的 XRCE 数据
- 把它"翻译"成标准 DDS 消息
- 转发给 ROS 2 系统中的其他节点

所以，MCU 和 ROS 2 之间多了一个"中间人"。就像两个人说不同语言，需要一个翻译官。

### 2.3 RTOS 支持

micro-ROS 支持三大主流实时操作系统：

- **FreeRTOS**：最流行的嵌入式 RTOS，广泛用于 ESP32、Arduino 等
- **Zephyr**：Linux 基金会支持的现代 RTOS
- **NuttX**：POSIX 兼容的 RTOS，微控制器和小型设备常用

也可以在没有 RTOS 的裸机（bare-metal）或 Linux 上运行。

### 2.4 内存占用

micro-ROS 的设计目标是在资源极受限的环境运行：

- Flash 占用：**约 75 KB**（一个完整的发布/订阅应用）
- RAM 占用：**约 3 KB**（512 字节的消息大小）
- 运行时**无动态内存分配**——初始化后全部使用静态内存池

这个内存占用大概是一个手机 App 的万分之一到十万分之一。

### 2.5 rcl + rclc：C 语言的 ROS 2 API

标准 ROS 2 提供两种客户端库：`rclcpp`（C++）和 `rclpy`（Python）。micro-ROS 没有 Python，C++ 太占内存，所以选择了 **纯 C 语言**。

具体由两部分组成：

- **rcl**（ROS 2 Client Library）：标准 ROS 2 的 C 客户端库，提供节点、话题、服务等基础数据结构
- **rclc**（ROS 2 Client Library Convenience）：micro-ROS 新增的便利函数层，提供定时器、执行器（Executor）、生命周期等嵌入式友好的 API

---

## 三、代码示例

### 示例 1：最简单的发布器（Publisher）

这个示例展示如何创建一个 micro-ROS 节点，定时发布一个整数到话题：

```c
#include <stdio.h>
#include <std_msgs/msg/int32.h>
#include <rclc/rclc.h>
#include <rclc/executor.h>

// 全局变量
rcl_publisher_t publisher;
std_msgs__msg__Int32 message;
rclc_executor_t executor;
rcl_timer_t timer;

// 定时器回调：每秒执行一次，发布数据
void timer_callback(rcl_timer_t *timer, int64_t last_call_time)
{
    (void)last_call_time;
    if (timer != NULL) {
        message.data++;  // 计数器 +1
        rcl_publish(&publisher, &message, NULL);
        printf("Published: %d\n", message.data);
    }
}

int main(int argc, const char *argv[])
{
    // 1. 初始化默认分配器
    rcl_allocator_t allocator = rcl_get_default_allocator();

    // 2. 初始化支持对象（连接 micro-ROS 传输层）
    rclc_support_t support;
    rcl_ret_t rc = rclc_support_init(&support, argc, argv, &allocator);

    // 3. 创建节点
    rcl_node_t node;
    rc = rclc_node_init_default(&node, "counter_node", "", &support);

    // 4. 创建发布器：发布 std_msgs/msg/Int32 类型到 "counter" 话题
    const rosidl_message_type_support_t * type_support =
        ROSIDL_GET_MSG_TYPE_SUPPORT(std_msgs, msg, Int32);
    rc = rclc_publisher_init_default(&publisher, &node, type_support, "counter");

    // 5. 创建定时器：每 1000 毫秒触发一次
    rc = rclc_timer_init_default(&timer, &support, RCL_MS_TO_NS(1000), timer_callback);

    // 6. 创建执行器：管理 timer 和 subscription 的回调调度
    rclc_executor_init(&executor, &support.context, 1, &allocator);
    rclc_executor_add_timer(&executor, &timer);

    // 7. 开始运行！执行器不断检查 timer 是否触发、消息是否到达
    rclc_executor_spin(&executor);

    return 0;
}
```

代码说明：

- 第 1 步：微控制器需要内存分配器来处理一些内部结构
- 第 2 步：`rclc_support_init` 是 micro-ROS 的"入口"，它建立与 Agent 的连接
- 第 3-4 步：创建节点和发布器，类似 ROS 2 中的 `Node()` + `create_publisher()`
- 第 5-6 步：创建定时器和执行器，决定"什么时候做什么事"
- 第 7 步：`rclc_executor_spin` 是主循环——它会一直运行，检查 timer 是否到了时间、订阅者是否有新消息

### 示例 2：订阅者 + 发布者 + 生命周期

这个示例更完整：同时包含订阅者（接收数据）和发布者（发送数据），并使用生命周期节点：

```c
#include <stdio.h>
#include <std_msgs/msg/string.h>
#include <rclc/rclc.h>
#include <rclc/executor.h>
#include <rclc/lifecycle.h>

rcl_publisher_t publisher;
std_msgs__msg__String pub_msg;
std_msgs__msg__String sub_msg;
rclc_executor_t executor;

// 订阅者回调：收到消息后打印并转发
void string_subscription_callback(const void * msgin)
{
    const std_msgs__msg__String * msg = (const std_msgs__msg__String *)msgin;
    if (msg != NULL && msg->data.data != NULL) {
        printf("Received: %s\n", msg->data.data);

        // 把收到的消息转发给另一个话题
        std_msgs__msg__String__init(&pub_msg);
        pub_msg.data.data = malloc(strlen(msg->data.data) + 10);
        pub_msg.data.capacity = strlen(msg->data.data) + 10;
        snprintf(pub_msg.data.data, pub_msg.data.capacity,
                 "Echo: %s", msg->data.data);
        pub_msg.data.size = strlen(pub_msg.data.data);
        rcl_publish(&publisher, &pub_msg, NULL);
        std_msgs__msg__String__fini(&pub_msg);
    }
}

int main(int argc, const char *argv[])
{
    rcl_allocator_t allocator = rcl_get_default_allocator();

    // 1. 初始化支持对象
    rclc_support_t support;
    rcl_ret_t rc = rclc_support_init(&support, argc, argv, &allocator);

    // 2. 创建普通节点
    rcl_node_t node;
    rc = rclc_node_init_default(&node, "echo_node", "", &support);

    // 3. 创建发布器（发到 "echoed" 话题）
    const rosidl_message_type_support_t * type_support =
        ROSIDL_GET_MSG_TYPE_SUPPORT(std_msgs, msg, String);
    rc = rclc_publisher_init_default(&publisher, &node, type_support, "echoed");

    // 4. 创建订阅者（从 "input" 话题接收）
    rcl_subscription_t subscriber;
    rc = rclc_subscription_init_default(&subscriber, &node, type_support, "input");

    // 5. 初始化消息接收缓冲区
    std_msgs__msg__String__init(&sub_msg);

    // 6. 创建执行器：添加订阅者，收到新数据时调用回调
    rclc_executor_init(&executor, &support.context, 1, &allocator);
    rclc_executor_add_subscription(&executor, &subscriber, &sub_msg,
                                    &string_subscription_callback, ON_NEW_DATA);

    // 7. 开始执行
    rclc_executor_spin(&executor);

    // 8. 清理资源
    rclc_executor_fini(&executor);
    rcl_subscription_fini(&subscriber, &node);
    rcl_publisher_fini(&publisher, &node);
    rcl_node_fini(&node);
    rclc_support_fini(&support);

    return 0;
}
```

这个例子的运行效果：

```
# 在另一台终端发布消息
$ ros2 topic pub /input std_msgs/msg/String "{data: 'Hello micro-ROS!'}"

# 在 micro-ROS 节点上会看到
Received: Hello micro-ROS!

# 同时在另一终端监听 echoed 话题
$ ros2 topic echo /echoed
data: "Echo: Hello micro-ROS!"
```

---

## 四、micro-ROS vs 标准 ROS 2 对比

| 特性 | 标准 ROS 2 | micro-ROS |
|------|-----------|-----------|
| 语言 | C++ / Python | C (C99) |
| 中间件 | DDS (fastDDS, CycloneDDS) | Micro XRCE-DDS |
| 典型 RAM | 几十 MB | 3-10 KB |
| 典型 Flash | 几百 MB | 75 KB |
| 传输方式 | UDP / TCP (原生 DDS) | UART / UDP / TCP / Bluetooth |
| 需要 Agent | 否（节点直连 DDS） | 是（必须运行 Agent） |
| 适用平台 | Linux / 高性能设备 | MCU (Arduino, STM32, ESP32) |

---

## 五、学习路线建议

1. **先在 Linux 上体验**：micro-ROS 提供了在 Linux 上运行 micro-ROS 客户端的方式，不需要购买硬件就能跑通 publish/subscribe 流程
2. **理解 Agent 的角色**：这是最核心的概念——Agent 是 MCU 和 ROS 2 世界之间的桥梁
3. **在开发板上动手**：推荐 ESP32 或 STM32 开发板，配合 UART 或 WiFi 连接到 Agent
4. **掌握 rclc Executor**：这是 micro-ROS 的"调度中心"，理解它的回调调度机制是关键
5. **探索 QoS 和生命周期**：在真实机器人项目中，服务质量（QoS）和节点生命周期管理非常重要

---

## 六、关键术语速查

| 术语 | 解释 |
|------|------|
| **Node（节点）** | micro-ROS 应用的基本单元，一个程序就是一个节点 |
| **Topic（话题）** | 节点之间通过话题发布/订阅消息 |
| **Publisher（发布器）** | 向话题发送消息的组件 |
| **Subscriber（订阅者）** | 从话题接收消息的组件 |
| **Agent（代理）** | 运行在主机上的翻译程序，连接 MCU 和 ROS 2 |
| **Executor（执行器）** | 调度 timer 和 subscription 回调的"总管" |
| **rclc** | micro-ROS 的 C 语言便利函数库 |
| **Micro XRCE-DDS** | micro-ROS 使用的轻量级中间件协议 |
| **DDS-XRCE** | OMG 组织制定的"极端资源受限环境 DDS"标准 |
| **RTOS** | 实时操作系统，如 FreeRTOS、Zephyr、NuttX |

---

## 七、思考题

1. 为什么 micro-ROS 选择 C 语言而不是 C++？
2. 如果 MCU 和 Agent 之间的 UART 连接断开，会发生什么？
3. Executor 中 `ON_NEW_DATA` 和 `ALWAYS` 两种回调触发模式有什么区别？

这些问题的答案在官方文档的 [Execution Management](https://micro.vulcanexus.org/docs/concepts/client_library/execution_management/) 和 [QoS 教程](https://micro.vulcanexus.org/docs/tutorials/programming_rcl_rclc/qos/) 中。

---

*本文基于 micro-ROS 官方文档（Vulcanexus）编写，内容适用于 ROS 2 Humble / Iron 版本。*
