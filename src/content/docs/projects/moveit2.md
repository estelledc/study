---
title: MoveIt 2 — ROS 2 上的机械臂运动规划框架
来源: 'https://github.com/moveit/moveit2'
日期: 2026-07-07
分类: 嵌入式
难度: 中级
---

## 是什么

MoveIt 2 是 ROS 2 生态里的**机械臂运动规划框架**：给它机器人模型、当前关节状态和目标姿态，它会帮你找一条尽量安全的轨迹。日常类比：像给机械臂装了“导航软件”，只是导航对象不是汽车，而是一串电机和夹爪。

普通导航只要避开路障；机械臂还要同时考虑每个关节角度、末端姿态、速度限制、碰撞物、规划算法和控制器。MoveIt 2 把这些东西接成一条流水线，让你先在 RViz 里看计划，再把轨迹交给真实机器人或仿真器执行。

最小感受不是先写几百行算法，而是启动教程里的 demo，再运行一个小节点去规划：

```bash
ros2 launch moveit2_tutorials demo.launch.py
ros2 run hello_moveit hello_moveit
```

第一行启动 `move_group`、机器人模型和 RViz；第二行运行自己的 MoveGroupInterface 程序。成功时，你会看到 Panda 机械臂在 RViz 里从当前姿态走到目标点。

## 为什么重要

不理解 MoveIt 2，下面这些机器人开发里的现象会很难解释：

- 为什么同一个“移动到杯子旁边”的目标，机械臂不是走直线，而是绕开桌子、夹具和自己的手臂
- 为什么 URDF 只描述“长什么样”，还需要 SRDF 描述规划组、末端执行器和允许碰撞关系
- 为什么 RViz 里能拖一个目标球，背后却牵动 IK、碰撞检测、规划器和控制器整条链路
- 为什么真实机器人调试常常卡在 `robot_description`、controller、joint limits，而不是卡在“算法不会算”

## 核心要点

MoveIt 2 可以先抓住三件事：

1. **机器人模型是地图**：URDF/SRDF 告诉 MoveIt 哪些连杆相连、哪些关节能动、哪些部件可以互相接触。类比导航地图，地图错了，再好的路线规划也会带你开进河里。

2. **Planning Scene 是现场**：它记录当前机器人状态、桌子、盒子、夹住的物体和允许碰撞矩阵。类比厨房台面，机械臂拿杯子前，必须知道桌上还有刀、盘子和自己的另一只手。

3. **规划流水线是厨师团队**：IK 求一个可达姿态，OMPL/Pilz/CHOMP/STOMP 等规划器找路径，时间参数化把路径变成带速度的轨迹。类比做菜，有人备菜、有人下锅、有人装盘，最后才是一道能端出去的菜。

## 实践案例

### 案例 1：用 C++ 让机械臂去一个姿态

官方“Your First C++ MoveIt Project”从 `hello_moveit` 开始，核心代码长这样：

```cpp
using moveit::planning_interface::MoveGroupInterface;

auto group = MoveGroupInterface(node, "panda_arm");
geometry_msgs::msg::Pose goal;
goal.orientation.w = 1.0;
goal.position.x = 0.28;
goal.position.y = -0.20;
goal.position.z = 0.50;

group.setPoseTarget(goal);
MoveGroupInterface::Plan plan;
if (group.plan(plan)) {
  group.execute(plan);
}
```

**逐部分解释**：

- `MoveGroupInterface(node, "panda_arm")` 连接到 `move_group`，并声明这次要控制 SRDF 里的 `panda_arm` 规划组
- `Pose goal` 是末端执行器想去的空间位置和朝向，不是每个关节角度
- `plan(plan)` 只算路线；`execute(plan)` 才把轨迹交给控制器
- 如果没先启动 demo 或真实机器人的 MoveIt 配置，程序可能等不到 `robot_description`

### 案例 2：往现场放一个盒子再规划

官方 Move Group C++ Interface 教程会把一个盒子加入 Planning Scene，让机械臂绕开它：

```cpp
moveit_msgs::msg::CollisionObject box;
box.header.frame_id = move_group.getPlanningFrame();
box.id = "box1";

shape_msgs::msg::SolidPrimitive shape;
shape.type = shape.BOX;
shape.dimensions = {0.10, 1.50, 0.50};

geometry_msgs::msg::Pose pose;
pose.orientation.w = 1.0;
pose.position.x = 0.48;
pose.position.z = 0.25;

box.primitives.push_back(shape);
box.primitive_poses.push_back(pose);
box.operation = box.ADD;
planning_scene_interface.addCollisionObjects({box});
```

**逐部分解释**：

- `frame_id` 说明盒子的坐标相对哪个坐标系，坐标系错了，盒子会“飘”到奇怪位置
- `shape` 定义几何尺寸，`pose` 定义几何体摆在哪里
- `ADD` 表示把物体加入世界；之后再规划时，碰撞检测会把它当成真实障碍
- 这就是 MoveIt 2 和纯数学路径规划的差别：它规划的不是抽象曲线，而是带场景约束的机器人动作

### 案例 3：用 Servo 做实时遥操作

MoveIt Servo 适合键盘、手柄或上层控制器连续给速度/姿态命令。官方教程给出的 ROS API 可以这样启动：

```bash
ros2 launch moveit_servo demo_ros_api.launch.py
ros2 run moveit_servo servo_keyboard_input
ros2 service call /servo_node/switch_command_type \
  moveit_msgs/srv/ServoCommandType "{command_type: 1}"
```

**逐部分解释**：

- `demo_ros_api.launch.py` 启动 ServoNode、机器人模型和必要参数
- `servo_keyboard_input` 把按键翻译成关节或笛卡尔速度命令
- `switch_command_type` 用服务切换输入类型，例如 joint jog、twist 或 pose
- Servo 会继续做关节限制、奇异点处理和碰撞相关检查，比“每次按键都重新完整规划”更适合细小连续动作

## 踩过的坑

1. **只启动自己的节点，不启动 `move_group`**：MoveGroupInterface 需要从 MoveIt 配置里拿 `robot_description` 和规划服务，否则会等待一段时间后失败。

2. **把 planning tolerance 当成 execution tolerance**：`setGoalTolerance()` 影响规划接受范围，真实控制器的执行容差通常要在 `controller.yaml` 或轨迹消息里处理。

3. **SRDF 规划组名字写错**：代码里的 `"panda_arm"` 必须对应配置里的 planning group；换成自己的机械臂时，名字、末端 link 和 joint group 都要同步改。

4. **Servo 命令缺少坐标系或输入不平滑**：Twist/Pose 命令要有 `header.frame_id`；真实工业机器人还常需要平滑滤波，否则控制器会拒绝抖动太大的命令。

## 适用 vs 不适用场景

**适用**：

- 机械臂、移动机械臂、双臂工作站，需要 IK、轨迹规划、碰撞检测和 RViz 调试
- 从仿真走向真机，希望同一套模型和规划配置能接 Gazebo、ros2_control 或真实驱动
- 研发阶段要快速试 OMPL、Pilz、CHOMP、Servo、MoveItPy 等不同控制姿势
- 需要把“拿起物体后物体也会碰撞”这种操作语义纳入规划场景

**不适用**：

- 一个舵机按固定角度摆动就够的 MCU 项目，MoveIt 2 和 ROS 2 依赖太重
- 毫秒以下硬实时内环控制，通常应放在驱动、PLC、RTOS 或厂商控制器里
- 没有明确机器人模型、关节限制和控制器接口的早期概念验证
- 只需要通用消息通信的系统，用 [[ros2]] topic/service/action 就够，不必引入整套运动规划

## 历史小故事（可跳过）

- **2011 年**：MoveIt 的第一次提交出现，早期由 Willow Garage 相关团队推动，目标是降低复杂机械臂软件的入门门槛。
- **2013 年**：MoveIt 在 ROS 生态中正式发布，把运动规划、运动学、碰撞检测、抓取、感知和控制接到一起。
- **2016 年前后**：MoveIt 逐步从多个仓库合并和整理，维护成本下降，社区贡献更集中。
- **2020 年**：MoveIt 2 Foxy 结束 beta，成为 ROS 2 上面向下一代复杂灵巧操作的重要里程碑；MoveIt Servo 也进入 ROS 2。
- **2026 年**：`moveit/moveit2` 是千星级 ROS 2 机械臂项目，README 指向官方教程、二进制安装、源码构建和迁移指南。

## 学到什么

- 机械臂“会动”不等于“会安全地动”，MoveIt 2 的核心价值是把模型、场景、规划和执行连成一条可调试链路
- URDF/SRDF、Planning Scene、MoveGroupInterface 是入门三件套，先理解它们，比背 API 更重要
- MoveIt 2 的差异点不是单个规划算法，而是插件式流水线：同一目标可以换 OMPL、Pilz、CHOMP 或并行规划
- Servo 和普通 planning 解决不同问题：planning 适合一次性找完整路线，Servo 适合实时小步跟随和遥操作

## 延伸阅读

- 官方入口：[MoveIt 2 Documentation](https://moveit.picknik.ai/)（教程、概念、API 都从这里进）
- 入门教程：[Your First C++ MoveIt Project](https://moveit.picknik.ai/humble/doc/tutorials/your_first_project/your_first_project.html)（从 `hello_moveit` 写到 plan/execute）
- 示例教程：[Move Group C++ Interface](https://moveit.picknik.ai/main/doc/examples/move_group_interface/move_group_interface_tutorial.html)（姿态目标、笛卡尔路径、碰撞物）
- 实时控制：[Realtime Servo](https://moveit.picknik.ai/main/doc/examples/realtime_servo/realtime_servo_tutorial.html)（joint/twist/pose 连续命令）
- 配置工具：[MoveIt Setup Assistant](https://moveit.picknik.ai/main/doc/examples/setup_assistant/setup_assistant_tutorial.html)（URDF 到 SRDF 和配置包）
- [[ros2]] —— MoveIt 2 建在 ROS 2 节点、参数、action 和 topic 之上

## 关联

- [[ros2]] —— 提供节点通信、参数、launch 和 action，MoveIt 2 是其上的机械臂应用层
- [[linuxcnc]] —— 同样关心运动控制，但 LinuxCNC 更靠近机床实时轨迹执行
- [[rt-thread]] —— 真机低层实时控制可放在 RTOS 侧，MoveIt 2 负责上位机规划
- [[freertos]] —— MCU 内环适合 FreeRTOS，机械臂全局路径规划适合 MoveIt 2
- [[zephyr]] —— Zephyr 解决嵌入式节点固件，MoveIt 2 解决多关节机器人动作决策
- [[nats]] —— NATS 是通用消息系统；MoveIt 2 的消息更绑定机器人模型和规划语义
- [[kubernetes]] —— Kubernetes 编排服务，MoveIt 2 launch 与 lifecycle 编排机器人节点和控制链路

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
