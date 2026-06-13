---
title: Gazebo 机器人仿真器零基础入门
来源: https://github.com/gazebosim/gazebo
日期: 2026-06-13
分类: 机器学习
子分类: robotics
provenance: pipeline-v3
---

# Gazebo 机器人仿真器零基础入门

## 一、从"乐高虚拟世界"说起

想象一下，你有一整套乐高积木，但你不想真的去拼。你希望在自己的电脑上搭建一个虚拟世界——里面有地板、墙壁、灯光，还有一台你自己设计的机器人。你给它一个指令，比如"往前走"，就能看到它在虚拟世界中真的移动，碰到墙壁会停下来，遇到斜坡会慢慢爬上去，甚至它的摄像头能"看到"虚拟世界中的画面。

Gazebo 做的就是这件事。它是一个**开源的机器人仿真平台**，用一句话概括：

> **Gazebo 让程序员在代码里跑机器人，而不用真的造出一台。**

为什么需要它？因为造一台真机器人很贵，调试时摔坏更贵。在 Gazebo 里，你可以无限次地尝试、失败、重来，零成本。

---

## 二、核心概念（5 个关键词）

理解 Gazebo 只需要记住下面 5 个概念：

### 1. World（世界）

World 是你搭建的整个虚拟环境——包括地板、天空、灯光、家具、障碍物。

- 就像电子游戏里的"地图"
- 用 **SDF（Simulation Description Format）** 文件格式定义，本质上是一种 XML 格式
- Gazebo 内置了很多现成的 world，比如 `empty.sdf`（空房间）、`house.sdf`（小房子）

### 2. Model（模型）

Model 是放在世界中的物体——可以是机器人、桌子、人、宠物，任何东西。

- 每个 Model 由若干 **Link（连杆）** 组成（比如机器人的身体、轮子、手臂各是一个 Link）
- Link 之间通过 **Joint（关节）** 连接（比如轮子通过旋转关节连在车身上）
- Gazebo Fuel（app.gazebosim.org/fuel）上有数千个现成模型可以直接下载

### 3. Physics（物理引擎）

物理引擎是 Gazebo 的"隐性大脑"，负责计算重力、碰撞、摩擦力等真实物理效果。

- Gazebo 支持多种物理引擎：**ODE**（默认）、**DART**、**Bullet**
- 你可以在 SDF 文件里设置重力大小、时间步长、接触参数等

### 4. Sensor（传感器）

Gazebo 能模拟真实机器人上的各种传感器，包括：

| 传感器类型 | 模拟效果 |
|-----------|---------|
| 2D/3D 激光雷达 (LiDAR) | 环境距离扫描 |
| RGB 摄像头 | 真实摄像头画面 |
| IMU（惯性测量单元） | 加速度和角速度 |
| 接触传感器 | 碰撞检测 |
| GPS | 经纬度位置 |
| 深度相机 | 类似 Kinect 的点云 |

### 5. Plugin（插件）

插件是 Gazebo 最强大的扩展机制——你可以用 C++ 或 Python 写代码，插入到仿真过程中，实现自定义行为：

- **系统插件（System Plugin）**：控制整个仿真过程
- **模型插件（Model Plugin）**：控制特定模型的行为（比如让机器人动起来）

---

## 三、SDF 文件格式详解

SDF 是 Gazebo 的"语言"。理解它，你就理解了 Gazebo。

SDF 的全称是 **Simulation Description Format**（仿真描述格式），是一套用于描述机器人仿真世界的 XML 标准。它的结构分层清晰：

```
world → model → link → visual / collision
                 → joint → parent / child
```

一个 SDF 文件可以定义整个世界，也可以只定义一个模型。

---

## 四、代码示例

### 示例 1：创建一个简单的机器人模型

下面是一个微型移动机器人的 SDF 描述文件。它有两个轮子（Link）和一个底座（Link），轮子通过旋转关节（Joint）连在底座上：

```xml
<?xml version="1.0"?>
<sdf version="1.9">
  <!-- 定义一个模型 -->
  <model name="my_robot">

    <!-- 机器人的底盘 -->
    <link name="chassis">
      <!-- 位置：在 (0, 0, 0.5) -->
      <pose>0 0 0.5 0 0 0</pose>
      <!-- 尺寸：长0.6m 宽0.4m 高0.2m 的长方体 -->
      <collision name="base_collision">
        <geometry>
          <box>
            <size>0.6 0.4 0.2</size>
          </box>
        </geometry>
      </collision>
      <!-- 外观：灰色 -->
      <visual name="base_visual">
        <geometry>
          <box>
            <size>0.6 0.4 0.2</size>
          </box>
        </geometry>
        <material>
          <ambient>0.3 0.3 0.3 1</ambient>
        </material>
      </visual>
    </link>

    <!-- 左轮 -->
    <link name="left_wheel">
      <pose>-0.15 -0.22 0.25 0 1.5708 0</pose>
      <inertial>
        <mass>0.5</mass>
        <inertia>
          <ixx>0.001</ixx>
          <iyy>0.001</iyy>
          <izz>0.001</izz>
        </inertia>
      </inertial>
      <collision name="wheel_collision">
        <geometry>
          <cylinder>
            <radius>0.075</radius>
            <length>0.03</length>
          </cylinder>
        </geometry>
      </collision>
      <visual name="wheel_visual">
        <geometry>
          <cylinder>
            <radius>0.075</radius>
            <length>0.03</length>
          </cylinder>
        </geometry>
        <material>
          <ambient>0.8 0.2 0.2 1</ambient>
        </material>
      </visual>
    </link>

    <!-- 右轮 -->
    <link name="right_wheel">
      <pose>-0.15 0.22 0.25 0 1.5708 0</pose>
      <inertial>
        <mass>0.5</mass>
        <inertia>
          <ixx>0.001</ixx>
          <iyy>0.001</iyy>
          <izz>0.001</izz>
        </inertia>
      </inertial>
      <collision name="wheel_collision">
        <geometry>
          <cylinder>
            <radius>0.075</radius>
            <length>0.03</length>
          </cylinder>
        </geometry>
      </collision>
      <visual name="wheel_visual">
        <geometry>
          <cylinder>
            <radius>0.075</radius>
            <length>0.03</length>
          </cylinder>
        </geometry>
        <material>
          <ambient>0.8 0.2 0.2 1</ambient>
        </material>
      </visual>
    </link>

    <!-- 左轮关节：控制旋转 -->
    <joint name="left_wheel_joint" type="revolute">
      <parent>chassis</parent>
      <child>left_wheel</child>
      <axis>
        <xyz>0 1 0</xyz>
        <limit>
          <upper>1000</upper>
          <lower>-1000</lower>
        </limit>
      </axis>
    </joint>

    <!-- 右轮关节：控制旋转 -->
    <joint name="right_wheel_joint" type="revolute">
      <parent>chassis</parent>
      <child>right_wheel</child>
      <axis>
        <xyz>0 1 0</xyz>
        <limit>
          <upper>1000</upper>
          <lower>-1000</lower>
        </limit>
      </axis>
    </joint>

  </model>
</sdf>
```

**关键说明：**

- `<pose>` 元素的格式是 `x y z roll pitch yaw`——即 3D 位置 + 3D 旋转（欧拉角）
- `<inertial>` 定义质量和转动惯量，让物理引擎能正确计算运动
- `<collision>` 负责碰撞检测，`<visual>` 负责渲染显示，二者可以不同

### 示例 2：C++ 模型插件——让机器人动起来

光有模型是不够的。你还需要告诉机器人怎么动。下面是一个 C++ 模型插件，通过控制左右轮差速来实现运动：

```cpp
#include <gazebo/common/common.hh>
#include <gazebo/physics/physics.hh>
#include <gazebo/sensors/sensors.hh>
#include <iostream>

// 继承自 ModelPlugin，Gazebo 会调用以下回调函数
class DifferentialDrivePlugin : public gazebo::ModelPlugin
{
public:
    void Load(gazebo::physics::ModelPtr parent, sdf::ElementPtr sdf) override
    {
        // 记住父模型（机器人）
        this->model = parent;

        // 获取两个轮子的关节
        this->leftWheel = parent->GetJoint("left_wheel_joint");
        this->rightWheel = parent->GetJoint("right_wheel_joint");

        // 注册回调：每个仿真帧调用一次
        this->updateConnection = gazebo::event::Events::ConnectWorldUpdateBegin(
            std::bind(&DifferentialDrivePlugin::OnUpdate, this));
    }

private:
    void OnUpdate()
    {
        // 获取当前仿真时间
        gazebo::common::Time now = this->model->GetWorld()->SimTime();

        // 简单逻辑：前5秒以0.5 rad/s的速度前进，然后停止
        if (now.sec < 5)
        {
            double speed = 0.5;  // 轮子旋转速度
            this->leftWheel->SetPosition(0, speed);
            this->rightWheel->SetPosition(0, speed);
        }
        else
        {
            this->leftWheel->SetPosition(0, 0.0);
            this->rightWheel->SetPosition(0, 0.0);
            gazebo::common::Console::SetBanner(true);
            std::cout << "Robot stopped at " << now.sec << " seconds.\n";
            gazebo::common::Console::SetBanner(false);
        }
    }

    gazebo::physics::ModelPtr model;
    gazebo::physics::JointPtr leftWheel;
    gazebo::physics::JointPtr rightWheel;
    gazebo::event::ConnectionPtr updateConnection;
};

// 注册插件，这样 Gazebo 才能识别它
GZ_REGISTER_MODEL_PLUGIN(DifferentialDrivePlugin)
```

**关键说明：**

- `Load()` 在插件加载时调用一次，用于初始化
- `OnUpdate()` 每个仿真帧被调用（默认 100Hz，即每秒 100 次）
- `SetPosition(0, speed)` 的第一个参数 0 表示设置速度（不是角度位置）
- 这个插件编译成 `.so` 或 `.dll` 后，在 SDF 文件中引用即可加载

---

## 五、Gazebo 的两大分支

Gazebo 目前有两套并行版本：

| 分支 | 状态 | 最新版本 | 说明 |
|------|------|---------|------|
| **Gazebo Classic** | 已停止维护（2025年1月EOL） | 11.x | 经典版，稳定但不再更新 |
| **Gazebo Sim (gz-sim)** | 活跃开发中 | 10.x | 新一代，架构重构、支持 ROS 2 |

新项目推荐使用 **Gazebo Sim**（新 Gazebo）。它的命令变成了 `gz sim`。

---

## 六、Gazebo 生态系统一览

Gazebo 不是单一软件，而是一套库：

```
Gazebo 项目全家桶：
├── gz-sim     —— 仿真核心（渲染 + 物理 + 传感器）
├── gz-physics —— 物理引擎抽象层
├── gz-sensors —— 传感器模型库
├── gz-rendering —— 渲染引擎（基于 OGRE v2）
├── gz-gui     —— 图形界面
├── gz-transport —— 进程间通信（消息发布/订阅）
├── gz-utils   —— 工具库
└── sdf        —— SDFormat 解析器
```

它们之间通过 **消息传递** 通信。比如：传感器发布激光扫描数据，机器人控制器订阅该数据，插件读取数据后计算电机输出——整个过程就像 ROS 里的 Topic 机制。

---

## 七、Gazebo 的典型工作流

对于一个初学者，最自然的使用路径是：

```
1. 打开 Gazebo → 加载一个世界（如 empty.world）
2. 用内置编辑器或 SDF 文件 → 添加机器人模型
3. 在模型里挂载传感器 → 如摄像头、激光雷达
4. 加载 C++ 插件 → 编写控制逻辑
5. 启动仿真 → 观察机器人行为
6. （可选）接入 ROS 2 → 用真实机器人算法控制仿真中的机器人
```

第 6 步是 Gazebo 最强大的地方：**仿真和现实的桥梁**。你在 Gazebo 里写好的控制代码，通常可以直接部署到真实机器人上。

---

## 八、学习资源

| 资源 | 地址 | 说明 |
|------|------|------|
| 官方教程 | classic.gazebosim.org/tutorials | 从入门到进阶的完整教程体系 |
| 新 Gazebo 文档 | gazebosim.org/docs | gz-sim 最新文档 |
| SDFormat 规范 | sdformat.org | SDF 文件格式完整参考 |
| Gazebo Fuel | app.gazebosim.org/fuel | 数千个现成模型下载 |
| GitHub 源码 | github.com/gazebosim/gz-sim | 最新源码 |
| 社区问答 | discourse.openrobotics.org/c/gazebo | 提问和讨论 |

---

## 九、总结

Gazebo 的本质是一个**虚拟物理沙盒**：

- 用 **SDF** 描述世界和机器人
- 用 **物理引擎** 模拟真实感
- 用 **插件** 注入你的控制逻辑
- 用 **传感器** 让机器人"感知"环境
- 最终目标是**仿真与现实的无缝衔接**

对于机器人学习者来说，Gazebo 提供了一个零成本、零风险的练手平台。你写的每一行控制代码、调的每一个参数，都在虚拟世界中得到了即时验证——这比在真机上调试高效得多。
