---
title: ROS 2 — 机器人软件的分布式消息底座
来源: 'https://github.com/ros2/ros2'
日期: 2026-07-07
分类: 嵌入式
难度: 中级
---

## 是什么

ROS 2 是一套**把机器人拆成很多小程序，再让它们可靠对话**的软件框架。日常类比：一台工厂机器人像一支施工队，摄像头、雷达、底盘、电机、规划器各管一摊；ROS 2 就像现场调度台，让每个人用统一频道报状态、发指令、查任务。

它不是一个传统意义上的操作系统内核，而是跑在 Linux、Windows、macOS 或实时系统之上的“机器人中间层”。你常见的最小动作是：启动一个节点，再观察它往哪个话题发消息。

```bash
ros2 run turtlesim turtlesim_node
ros2 topic pub /turtle1/cmd_vel geometry_msgs/msg/Twist \
  "{linear: {x: 2.0}, angular: {z: 1.8}}"
```

第一行启动一个海龟模拟器节点；第二行往速度话题发 `Twist` 消息。换成真机器人时，`/turtle1/cmd_vel` 常常就是底盘速度命令的同类接口。

## 为什么重要

不理解 ROS 2，下面这些机器人开发里的现象会很难解释：

- 为什么摄像头、定位、导航、电机控制可以由不同进程甚至不同机器完成，却像一个系统一样协作
- 为什么同一个传感器数据既能给导航用，也能给记录工具 `ros2 bag` 用，而不用改传感器代码
- 为什么工业设备启动时要先 `configure` 再 `activate`，不是程序一运行就直接打电机
- 为什么无线网络、实时控制、仿真调试会把通信策略调成不同 QoS，而不是一把梭可靠传输

## 核心要点

1. **节点是工位**：一个节点只做一件相对清楚的事，比如发布激光雷达、估计位置、规划路径。类比工厂里的工位，工位越清楚，坏了越容易替换。

2. **话题是传送带**：话题负责连续数据流，发布者和订阅者只约定名字与消息类型。类比传送带，装箱的人不需要认识取箱的人，只要箱子规格一致。

3. **DDS/RMW 是底层物流**：ROS 2 通过 RMW 抽象接入 Fast DDS、Cyclone DDS、Zenoh 等通信实现。类比快递公司可替换，同一张发货单可以按项目需要选择更可靠、更省带宽或更实时的路线。

## 实践案例

### 案例 1：用 turtlesim 看懂“节点 + 话题”

```bash
ros2 run turtlesim turtlesim_node
ros2 run turtlesim turtle_teleop_key
ros2 topic list -t
ros2 topic echo /turtle1/cmd_vel
```

**逐部分解释**：

- `turtlesim_node` 是被控制的模拟机器人，`turtle_teleop_key` 是键盘控制节点
- `ros2 topic list -t` 会列出话题和类型，例如速度命令常见是 `geometry_msgs/msg/Twist`
- `ros2 topic echo` 像把传送带旁边加一个透明观察窗，能看到键盘节点发出的速度消息
- 这个案例来自官方 turtlesim 与 topic 教程，是 ROS 2 新手最短的反馈回路

### 案例 2：写一个 Python 发布者和订阅者

```python
import rclpy
from rclpy.node import Node
from std_msgs.msg import String

class Talker(Node):
    def __init__(self):
        super().__init__("talker")
        self.pub = self.create_publisher(String, "chatter", 10)
        self.create_timer(0.5, self.say)

    def say(self):
        msg = String()
        msg.data = "hello ros2"
        self.pub.publish(msg)
```

**逐部分解释**：

- `Node` 是这个小程序接入 ROS 图的身份牌
- `create_publisher(String, "chatter", 10)` 表示往 `chatter` 话题发 `String` 类型消息，队列深度是 10
- `create_timer` 让节点每 0.5 秒执行一次，不用自己写死循环
- 订阅者只要对同名话题和同类型消息 `create_subscription`，就能收到这批字符串

### 案例 3：用 lifecycle 管住硬件启动顺序

```bash
ros2 launch lifecycle lifecycle_demo_launch.py
ros2 lifecycle get /lc_talker
ros2 lifecycle set /lc_talker configure
ros2 lifecycle set /lc_talker activate
```

**逐部分解释**：

- `lifecycle_demo_launch.py` 同时启动 lifecycle talker、listener 和控制客户端
- `get` 查询当前状态；新节点通常先在 `unconfigured`
- `configure` 做资源准备，例如打开相机、创建发布者、分配缓冲区
- `activate` 才真正开始发布；这能避免“驱动还没准备好，电机已经收到命令”的工业事故

## 踩过的坑

1. **只记住 topic，忘了 service/action**：topic 适合连续数据流；短请求用 service，长任务用 action，因为 service 客户端通常在等结果。

2. **QoS 两边不兼容还以为代码没跑**：可靠订阅者可能收不到 best effort 发布者的消息，原因是 ROS 2 要求“请求的质量”不能高于“提供的质量”。

3. **每个新终端忘记 source**：没执行 `source /opt/ros/<distro>/setup.bash` 或工作区 `install/setup.bash`，命令行就找不到包和接口。

4. **把多个重量节点硬塞一个进程**：composition 能省进程间通信开销，但也会减少故障隔离；一个组件崩溃可能拖住同容器节点。

## 适用 vs 不适用场景

**适用**：

- 移动机器人、机械臂、无人车、仓储机器人，需要多传感器和多算法模块协作
- 需要仿真、可视化、日志回放、命令行 introspection 一起工作的研发环境
- 需要在不稳定网络里调 QoS，或者在硬件驱动上用 lifecycle 控制启动和关闭
- 团队希望复用 Navigation2、MoveIt、RViz、rosbag2 等机器人生态包

**不适用**：

- 一个 MCU 裸机循环就能完成的简单控制器，ROS 2 的依赖和启动成本太重
- 对微秒级确定性有硬约束的内环控制，通常应放在 RTOS、PLC 或驱动固件里
- 没有机器人图结构、只需要普通 Web 后端通信的项目，用 HTTP、MQTT、NATS 更直接
- 团队完全不愿意接受工作区、消息接口、QoS、launch 这些额外概念

## 历史小故事（可跳过）

- **2007 年前后**：ROS 1 在 Willow Garage 生态里成形，目标是让机器人研究者少重复造基础工具。
- **2017 年**：ROS 2 的 Ardent Apalone 发布，核心变化是从中心化 master 转向 DDS 发现与通信。
- **2020 年代**：ROS 2 逐渐成为主线，Foxy、Humble、Iron、Jazzy 等发行版推动长期支持和工业采用。
- **2026 年**：`ros2/ros2` GitHub 仓库约 5k+ stars，官方文档和 demos 继续围绕 rolling 与 LTS 发行版演进。

## 学到什么

- ROS 2 的本质不是“机器人 SDK”，而是“机器人分布式系统的约定层”
- topic、service、action 是三种通信姿势：连续广播、短请求、长任务
- QoS 把网络可靠性、延迟、历史缓存这些取舍显式暴露出来，这是 ROS 2 相比 ROS 1 的关键升级
- lifecycle 和 composition 说明 ROS 2 面向工业部署：不仅要能跑，还要能按顺序启动、按成本组合

## 延伸阅读

- 官方入口：[ros2/ros2 README](https://github.com/ros2/ros2)
- 官方文档源：[ros2_documentation](https://github.com/ros2/ros2_documentation)
- 入门教程：[Using turtlesim, ros2, and rqt](https://github.com/ros2/ros2_documentation/blob/rolling/source/Tutorials/Beginner-CLI-Tools/Introducing-Turtlesim/Introducing-Turtlesim.rst)
- 进阶概念：[Quality of Service settings](https://github.com/ros2/ros2_documentation/blob/rolling/source/Concepts/Intermediate/About-Quality-of-Service-Settings.rst)
- [[zephyr]] —— 对比理解 RTOS 管单设备实时任务，ROS 2 管多节点机器人系统
- [[linuxcnc]] —— 同样面对机器运动控制，但 LinuxCNC 更靠近数控机床实时控制链路

## 关联

- [[rt-thread]] —— MCU 侧实时任务可交给 RTOS，ROS 2 更适合上位机和机器人图
- [[freertos]] —— 内环控制常在 FreeRTOS 这类轻量系统里跑，ROS 2 管外层协调
- [[zephyr]] —— Zephyr 适合嵌入式节点固件，ROS 2 适合多节点机器人应用
- [[lwip]] —— 嵌入式网络栈解决 TCP/IP 基础通信，ROS 2 在其上定义机器人语义
- [[openthread]] —— 都关心设备网络，但 OpenThread 是低功耗 mesh，ROS 2 是机器人数据流
- [[nats]] —— NATS 是通用消息系统；ROS 2 的消息系统更强绑定类型、节点图和机器人工具链
- [[kubernetes]] —— Kubernetes 编排服务进程，ROS 2 launch/lifecycle 编排机器人节点

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
