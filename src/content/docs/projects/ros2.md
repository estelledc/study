---
title: ROS 2 — 机器人操作系统零基础入门
来源: 'https://github.com/ros2/ros2'
日期: 2026-06-13
子分类: 嵌入式
分类: 操作系统
provenance: pipeline-v3
---

## 日常类比：一座分工明确的智能工厂

想象你在运营一家小型智能工厂，而不是一个人包办所有事。

- **节点（Node）** 像不同工位的工人：有人管摄像头、有人管轮子、有人管路径规划。每个工人只做一类活，但都能通过对讲机协作。
- **话题（Topic）** 像厂内广播频道：`/camera/image` 频道持续播报画面，`/cmd_vel` 频道播报「前进/转弯」指令。谁想听就订阅，谁想说就发布，不必点对点登记电话号码。
- **服务（Service）** 像前台的一次性问答：「现在电池剩多少？」问一次答一次，适合短平快的查询或计算。
- **动作（Action）** 像下达一项带进度条的任务：「走到仓库 B 区」，执行过程中可以汇报「已完成 40%」，也可以中途取消。
- **参数（Parameter）** 像每台设备面板上的旋钮：最大速度、传感器频率，运行中可改，不必重启整个工厂。

**ROS 2（Robot Operating System 2）** 就是这套「工厂协作规范 + 工具箱」。它本身不是某个机器人产品，而是一组库、消息格式、启动工具和可视化界面，让不同语言（C++、Python 等）写的模块能即插即用。官方仓库：[ros2/ros2](https://github.com/ros2/ros2)；入门教程见 [ROS 2 Documentation](https://docs.ros.org/en/humble/Tutorials.html)。

和 ROS 1 相比，ROS 2 默认基于 **DDS（Data Distribution Service）** 中间件，更适合多机、实时性、QoS（服务质量）配置，也是现代 Autoware、Nav2、MoveIt 2 等栈的默认底座。

---

## 解决什么问题

### 痛点 1：机器人软件是「一堆进程」，缺少统一通信层

摄像头驱动、定位、规划、底盘控制往往来自不同团队、不同语言。若没有标准，就要手写 socket、自己定义二进制协议。ROS 2 提供 **rcl（ROS Client Library）** 及 **rclcpp / rclpy**，统一节点生命周期、消息类型和发现机制。

### 痛点 2：发布/订阅、请求/响应、长任务需要不同语义

传感器数据是**连续流** → 用 Topic；查地图元数据是**一问一答** → 用 Service；导航到目标点要**进度 + 可取消** → 用 Action。混用语义会导致阻塞、难以抢占，官方 [Topics vs Services vs Actions](https://docs.ros.org/en/humble/How-To-Guides/Topics-Services-Actions.html) 指南对此有明确划分。

### 痛点 3：构建、依赖、部署碎片化

ROS 2 用 **colcon** 构建工作空间，用 **ament** 作为构建系统，用 **rosdep** 拉系统依赖。`install/setup.bash` 一次性把本工作空间里的包加入 `PATH` 和 `PYTHONPATH`，避免「能编译不能运行」。

---

## 核心概念

### 1. 工作空间（Workspace）与包（Package）

典型目录结构：

```text
ros2_ws/
├── src/          # 你的源码包
├── build/        # colcon 中间产物
├── install/      # 安装后的可执行文件与 share 资源
└── log/          # 构建日志
```

创建并编译：

```bash
mkdir -p ~/ros2_ws/src
cd ~/ros2_ws
# 先 source 已安装的 ROS 2（underlay）
source /opt/ros/jazzy/setup.bash   # 发行版名按本机安装为准
colcon build --symlink-install
source install/setup.bash          # overlay：优先使用本工作空间
```

用 `ros2 pkg create` 生成包骨架；Python 包常用 `--build-type ament_python`，C++ 用 `ament_cmake`。

### 2. 计算图（Computation Graph）

ROS 2 运行时是一张**有向图**：

| 概念 | 含义 | 类比 |
|------|------|------|
| Node | 进程内一个可通信实体 | 工位工人 |
| Topic | 命名消息通道，多对多 | 广播频道 |
| Message | `.msg` 定义的结构化数据 | 广播里的一句话格式 |
| Publisher / Subscriber | 发/收 Topic 消息 | 播音员 / 听众 |
| Service / Client | 同步 RPC | 前台问答 |
| Action Server / Client | 带反馈与取消的长任务 | 带进度条的项目 |
| Parameter | 节点级键值配置 | 设备旋钮 |
| TF2 | 坐标系变换树 | 工厂里「相对位置关系表」 |

用 `ros2 node list`、`ros2 topic list`、`ros2 topic echo /topic` 做命令行自省；`rqt_graph` 可视化谁连谁。

### 3. 中间件与 QoS

ROS 2 的 **RMW（ROS Middleware）** 把 Topic/Service 映射到 DDS。发布者与订阅者除 **话题名、消息类型** 一致外，**QoS 策略**也要兼容（如 reliability、history depth）。Publisher 构造函数里的队列深度 `10` 就是常见 QoS 设置：订阅者处理不过来时，最多缓存 10 条。

### 4. Launch 与组合

单节点可以用 `ros2 run pkg executable` 启动；多节点、多参数、命名空间、重映射应写 **Launch 文件**（Python 为主）：

```python
# launch/talk_listen.launch.py（片段）
from launch import LaunchDescription
from launch_ros.actions import Node

def generate_launch_description():
    return LaunchDescription([
        Node(package='demo_nodes_cpp', executable='talker', name='talker'),
        Node(package='demo_nodes_cpp', executable='listener', name='listener'),
    ])
```

`ros2 launch my_pkg talk_listen.launch.py` 一次拉起整条流水线。

### 5. 常用 CLI 速查

```bash
ros2 node list
ros2 topic list
ros2 topic info /topic
ros2 topic pub /topic std_msgs/msg/String "{data: 'hello'}" --once
ros2 service list
ros2 param list
ros2 bag record /topic    # 录包回放，调试神器
```

---

## 代码示例 1：Python 发布者与订阅者（Talker / Listener）

以下改编自官方教程 [Writing a simple publisher and subscriber (Python)](https://docs.ros.org/en/humble/Tutorials/Beginner-Client-Libraries/Writing-A-Simple-Py-Publisher-And-Subscriber.html)。假设包名 `py_pubsub`，依赖 `rclpy`、`std_msgs`。

**publisher_member_function.py** — 每 0.5 秒往 `topic` 发一条字符串：

```python
import rclpy
from rclpy.node import Node
from std_msgs.msg import String


class MinimalPublisher(Node):
    def __init__(self):
        super().__init__('minimal_publisher')
        self.publisher_ = self.create_publisher(String, 'topic', 10)
        self.timer = self.create_timer(0.5, self.timer_callback)
        self.i = 0

    def timer_callback(self):
        msg = String()
        msg.data = f'Hello World: {self.i}'
        self.publisher_.publish(msg)
        self.get_logger().info(f'Publishing: "{msg.data}"')
        self.i += 1


def main(args=None):
    rclpy.init(args=args)
    node = MinimalPublisher()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    node.destroy_node()
    rclpy.shutdown()


if __name__ == '__main__':
    main()
```

**subscriber_member_function.py** — 订阅同一话题并打印：

```python
import rclpy
from rclpy.node import Node
from std_msgs.msg import String


class MinimalSubscriber(Node):
    def __init__(self):
        super().__init__('minimal_subscriber')
        self.subscription = self.create_subscription(
            String, 'topic', self.listener_callback, 10)

    def listener_callback(self, msg):
        self.get_logger().info(f'I heard: "{msg.data}"')


def main(args=None):
    rclpy.init(args=args)
    node = MinimalSubscriber()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    node.destroy_node()
    rclpy.shutdown()


if __name__ == '__main__':
    main()
```

在 `setup.py` 的 `entry_points['console_scripts']` 中注册 `talker`、`listener` 两个入口，然后：

```bash
colcon build --packages-select py_pubsub
source install/setup.bash
# 终端 1
ros2 run py_pubsub talker
# 终端 2
ros2 run py_pubsub listener
```

**执行路径**：`rclpy.init` → 创建 Node → `create_publisher` / `create_subscription` → `rclpy.spin` 进入事件循环（处理 timer 回调与订阅回调）→ 退出时 `destroy_node` + `shutdown`。

---

## 代码示例 2：Python 服务与客户端（短请求）

Service 适合「算一下、查一下、设一下」类操作。下面演示自定义服务类型 `AddTwoInts`（实际项目里用 `ros2 interface show example_interfaces/srv/AddTwoInts` 等现成类型即可）。

**add_two_ints_server.py**：

```python
import rclpy
from rclpy.node import Node
from example_interfaces.srv import AddTwoInts


class AddTwoIntsServer(Node):
    def __init__(self):
        super().__init__('add_two_ints_server')
        self.srv = self.create_service(
            AddTwoInts, 'add_two_ints', self.add_callback)

    def add_callback(self, request, response):
        response.sum = request.a + request.b
        self.get_logger().info(
            f'Incoming: a={request.a}, b={request.b} -> sum={response.sum}')
        return response


def main():
    rclpy.init()
    node = AddTwoIntsServer()
    rclpy.spin(node)
    rclpy.shutdown()


if __name__ == '__main__':
    main()
```

**add_two_ints_client.py**：

```python
import rclpy
from rclpy.node import Node
from example_interfaces.srv import AddTwoInts


class AddTwoIntsClient(Node):
    def __init__(self):
        super().__init__('add_two_ints_client')
        self.client = self.create_client(AddTwoInts, 'add_two_ints')
        while not self.client.wait_for_service(timeout_sec=1.0):
            self.get_logger().info('service not available, waiting...')

    def send_request(self, a, b):
        req = AddTwoInts.Request()
        req.a = a
        req.b = b
        future = self.client.call_async(req)
        rclpy.spin_until_future_complete(self, future)
        return future.result()


def main():
    rclpy.init()
    node = AddTwoIntsClient()
    result = node.send_request(3, 7)
    node.get_logger().info(f'Result: {result.sum}')
    node.destroy_node()
    rclpy.shutdown()


if __name__ == '__main__':
    main()
```

CLI 快速验证（无需写代码）：

```bash
ros2 service call /add_two_ints example_interfaces/srv/AddTwoInts "{a: 3, b: 7}"
```

---

## 安装与第一个小时路线

1. **选发行版**：Ubuntu 上常用 Humble（LTS）、Jazzy、Rolling（滚动）。新手优先 LTS + 对应文档版本。
2. **安装**：按 [官方 Installation](https://docs.ros.org/en/humble/Installation.html) 装 desktop 或 bare；WSL2 / Docker 也可，但 USB 相机与实时控制需额外配置。
3. **验证**：`ros2 run demo_nodes_cpp talker` 与 `listener` 应能看到字符串对传。
4. **学路径**：Colcon 工作空间 → Pub/Sub → Service → 自定义 `.msg`/`.srv` → Parameters → Launch → TF2 / URDF → Nav2 或 MoveIt 2（按机器人方向选）。

---

## Topic / Service / Action 怎么选

| 场景 | 推荐 | 原因 |
|------|------|------|
| 激光雷达、IMU、图像流 | Topic | 连续、多订阅者 |
| 查询版本、触发单次标定 | Service | 短、同步 |
| 导航到点、机械臂抓取 | Action | 长时、要反馈与取消 |
| 最大速度、帧率配置 | Parameter | 键值、可动态改 |

切忌用 Service 跑长时间阻塞任务（会占死客户端线程）；长任务应迁移到 Action，并正确实现 **preempt（抢占）**。

---

## 生态与延伸

- **仿真**：Gazebo / Isaac Sim + ROS 2 桥接，先在仿真里调通再上车。
- **导航**：Nav2（costmap、planner、controller、behavior tree）。
- **机械臂**：MoveIt 2（规划场景、碰撞检测）。
- **可视化**：RViz2 看 TF、点云、路径；Foxglove 看 rosbag。
- **与 ROS 1 互通**：`ros1_bridge`（维护模式，新项目尽量原生 ROS 2）。

ROS 2 的学习曲线在「工具链 + 分布式概念」上，不在某一门语言语法上。把 **Node + Topic + colcon + launch** 四条线跑通，再读任一具体栈（Nav2、MoveIt、micro-ROS）会轻松很多。

---

## 常见问题

**Q：`ros2 run` 找不到包？**  
先 `source /opt/ros/<distro>/setup.bash`，再 `source ~/ros2_ws/install/setup.bash`；确认 `colcon build` 成功且包名、executable 与 `setup.py` entry_points 一致。

**Q：Publisher 有输出，Subscriber 收不到？**  
检查话题名、消息类型、QoS 是否匹配；`ros2 topic info /topic -v` 看两端 QoS。

**Q：ROS 2 和「会写嵌入式 C」是什么关系？**  
应用层用 rclcpp/rclpy；MCU 侧可用 **micro-ROS** 或自定义桥接；ROS 2 管的是「系统级协作」，不替代裸机驱动。

**Q：必须学 C++ 吗？**  
不必。原型、算法验证 Python 足够；性能关键路径（驱动、控制环）常用 C++。两者可在同一工作空间共存。

---

## 小结

ROS 2 把机器人软件拆成**可组合的节点**，用 **Topic / Service / Action / Parameter** 表达不同通信语义，用 **colcon + ament + launch** 统一构建与启动。零基础路径：理解工厂类比 → 搭工作空间 → 写一对 Pub/Sub → 写一个 Service → 用 Launch 联调 → 再接仿真或真机栈。官方入口 [github.com/ros2/ros2](https://github.com/ros2/ros2) 聚合各核心仓库；系统学习以 [docs.ros.org](https://docs.ros.org) 教程顺序为准，比零散搜代码更高效。
