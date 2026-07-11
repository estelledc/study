---
title: Gazebo Classic — 机器人世界的物理排练场
来源: 'https://github.com/osrf/gazebo'
日期: 2026-07-08
分类: embedded
难度: 初级
---

## 是什么

Gazebo Classic 是一个**给机器人先搭虚拟世界、再在里面摔打测试**的三维物理仿真器。日常类比：像给机器人排练用的剧场，地面、灯光、障碍物、传感器和物理规则都先在舞台上布好。

你可以先写一个很小的世界文件：

```xml
<sdf version="1.6">
  <world name="demo"><include><uri>model://sun</uri></include></world>
</sdf>
```

再运行：

```bash
gazebo demo.world
```

这不是在“画一个 3D 场景”而已，而是在启动一个会算重力、碰撞、关节、传感器输出的机器人实验场。Gazebo Classic 的经典组合是 SDF / URDF 写模型，`gzserver` 算模拟，`gzclient` 做显示，插件插入控制逻辑。

## 为什么重要

不理解 Gazebo Classic，下面这些事都很难解释：

- 为什么真实机器人还没接电，团队就能先验证避障、定位、抓取和路径规划
- 为什么 URDF 只写了“机器人长什么样”，到了 Gazebo 里还要补质量、摩擦、阻尼和传感器
- 为什么同一个世界可以无界面跑在 CI / 服务器上，也可以开 GUI 给人拖拽观察
- 为什么很多 ROS 教程把“先在 Gazebo 跑通”当成上真机前的必经步骤

## 核心要点

1. **世界文件是舞台清单**：SDF / world 文件像剧组通告单，列出哪里有地面、灯、机器人、障碍物和物理参数。`gzserver` 读它后，才知道这场仿真应该从什么状态开始。

2. **服务端和客户端分工**：`gzserver` 像后台机械师，持续计算物理、传感器和时间；`gzclient` 像观众席和控制台，负责把世界画出来、让人暂停和拖动模型。分开后，服务器可以在没有屏幕的机器上跑测试。

3. **插件把“模型”变成“会动的系统”**：SDF 只能描述结构，插件像给模型装上小程序。模型插件能改关节和速度，传感器插件能产出数据，世界插件能控制全局规则。

## 实践案例

### 案例 1：用 SDF 保存并重新打开一个训练场

官方“Building a world”教程会把 GUI 中加入的地面、简单形状和模型保存成 `my_world.sdf`。最小命令是：

```bash
gazebo
gazebo my_world.sdf
```

如果手写一个可复用的世界，核心长这样：

```xml
<sdf version="1.6">
  <world name="warehouse">
    <include><uri>model://sun</uri></include>
    <include><uri>model://ground_plane</uri></include>
    <physics type="ode"><max_step_size>0.001</max_step_size></physics>
  </world>
</sdf>
```

**逐部分解释**：

- `world name="warehouse"`：给这场仿真起名，后面日志、话题和插件都围绕它工作。
- `model://sun` / `model://ground_plane`：从 Gazebo 的模型路径里引入现成太阳和地面。
- `<physics type="ode">`：选择 ODE 物理引擎；Gazebo Classic 还支持 Bullet、Simbody、DART 等后端。
- `max_step_size`：决定仿真时间步长；设错会让机器人动作发飘或跑得很慢。

### 案例 2：把 ROS 里的 URDF 机器人放进 Gazebo

很多机器人先用 URDF 描述“身体结构”。官方 ROS 教程建议先检查 URDF 能不能被转换为 Gazebo 使用的 SDF：

```bash
gz sdf -p MYROBOT.urdf
roslaunch gazebo_ros empty_world.launch
rosrun gazebo_ros spawn_model -file `rospack find MYROBOT_description`/urdf/MYROBOT.urdf -urdf -z 1 -model MYROBOT
```

也可以把启动步骤写进 launch 文件：

```xml
<launch>
  <include file="$(find gazebo_ros)/launch/empty_world.launch"/>
  <node name="spawn_urdf" pkg="gazebo_ros" type="spawn_model" args="-file $(find MYROBOT_description)/urdf/MYROBOT.urdf -urdf -z 1 -model MYROBOT"/>
</launch>
```

**逐部分解释**：

- `gz sdf -p`：先把 URDF 翻译成 SDF 并打印出来，能提前看到缺质量、缺惯量、标签不支持等警告。
- `empty_world.launch`：用 ROS 的方式启动 Gazebo 空世界，并让 ROS 节点使用仿真时间。
- `spawn_model`：调用 `gazebo_ros` 的服务，把文件里的机器人实例插进正在运行的世界。
- `-z 1`：让机器人从 1 米高处生成；如果写成 0，复杂模型可能一出生就和地面穿插。

### 案例 3：用模型插件让盒子自己往前走

官方 Model plugin 教程展示了一个会给父模型设置线速度的插件。核心 C++ 逻辑可以缩到这样：

```cpp
class ModelPush : public gazebo::ModelPlugin {
 public: void Load(gazebo::physics::ModelPtr parent, sdf::ElementPtr) {
   this->model = parent;
   this->conn = gazebo::event::Events::ConnectWorldUpdateBegin(
     [this] { this->model->SetLinearVel({0.3, 0, 0}); });
 }
 gazebo::physics::ModelPtr model; gazebo::event::ConnectionPtr conn;
};
GZ_REGISTER_MODEL_PLUGIN(ModelPush)
```

在 SDF 里把它挂到模型上：

```xml
<model name="box">
  <link name="link">...</link>
  <plugin name="model_push" filename="libmodel_push.so"/>
</model>
```

编译并运行：

```bash
cmake ../
make
export GAZEBO_PLUGIN_PATH=$HOME/gazebo_plugin_tutorial/build:$GAZEBO_PLUGIN_PATH
gzserver -u model_push.world && gzclient
```

**逐部分解释**：

- `ModelPlugin`：说明这段代码绑定在某一个模型上，不是整个世界，也不是某个传感器。
- `ConnectWorldUpdateBegin`：每个仿真步开始时都回调一次，适合持续控制速度或关节。
- `SetLinearVel({0.3, 0, 0})`：让盒子沿 x 方向移动；这是真正改仿真状态，不只是改画面。
- `GAZEBO_PLUGIN_PATH`：告诉 Gazebo 去哪里找 `.so` 动态库；忘了它，SDF 里写了插件也加载不到。

## 踩过的坑

1. **把 Gazebo Classic 当新项目默认选择**：Classic 已在 2025 年 1 月到达 EOL，2025 年 2 月 GitHub 仓库归档；新项目优先看新版 Gazebo。
2. **URDF 能在 RViz 看到就以为能仿真**：RViz 只看可视化，Gazebo 还需要惯量、碰撞、摩擦、阻尼等物理信息。
3. **插件编译成功但运行时找不到**：`.so` 不在 `GAZEBO_PLUGIN_PATH`，或者 SDF 的 `filename` 和实际库名不一致。
4. **物理参数照抄默认值**：`max_step_size`、`real_time_update_rate`、接触数量和摩擦会直接影响稳定性，复杂 mesh 尤其容易抖。

## 适用 vs 不适用场景

**适用**：

- ROS 1 / 早期 ROS 2 项目已经围绕 Gazebo Classic、URDF 和 `gazebo_ros` 建好了仿真资产
- 需要在上真机前验证机器人模型、传感器、控制器和世界障碍物的交互
- 需要无界面跑批量测试，或在服务器上用 `gzserver` 做回归
- 需要通过 C++ 插件直接接触物理、传感器、关节和世界状态

**不适用**：

- 全新项目想长期维护仿真平台，优先考虑新版 Gazebo 的分库架构和迁移路线
- 只需要漂亮 3D 展示，不需要真实物理和机器人传感器数据
- 需要高度精确的工业级动力学认证，Gazebo 更适合研发验证，不等于真实世界保证
- 团队只会 Web / Python，短期没有 C++ 插件和 ROS 生态准备

## 历史小故事（可跳过）

- **2002 年左右**：Gazebo 项目启动，目标是给机器人研究提供一个可扩展的多机器人仿真环境。
- **2010s**：ROS 社区大量教程和机器人包把 Gazebo Classic 当作默认仿真入口，URDF + gazebo_ros 成为常见组合。
- **2025 年**：Gazebo Classic 到达生命周期终点，GitHub 仓库进入只读归档状态。

## 学到什么

1. **机器人仿真不是动画**：动画只负责看起来动，Gazebo 要同时维护物理状态、传感器输出和控制接口。
2. **SDF / URDF 是入口，不是全部**：描述文件决定初始结构，插件和物理参数决定系统行为。
3. **先仿真再上真机是降风险**：在虚拟世界摔坏一百次，比在实验室摔坏一次便宜得多。
4. **Classic 值得读，但新项目要看迁移**：它解释了很多 ROS 老教程，新项目则要认真评估新版 Gazebo。

## 延伸阅读

- 官方教程总入口：[Gazebo Classic Tutorials](https://classic.gazebosim.org/tutorials)
- 仓库主页：[gazebosim/gazebo-classic](https://github.com/osrf/gazebo)
- 迁移说明：[Gazebo Classic Migration](https://gazebosim.org/docs/latest/gazebo_classic_migration/)
- [[ros2]] —— Gazebo 常和 ROS 一起承担机器人消息、时间和启动流程
- [[embedded-hal]] —— 都在处理“软件如何贴近真实硬件行为”的问题

## 关联

- [[ros2]] —— ROS 负责机器人节点和消息，Gazebo 负责物理世界和传感器环境
- [[embedded-hal]] —— embedded-hal 抽象硬件接口，Gazebo 抽象可测试的虚拟硬件世界
- [[arduino-cli]] —— 都服务硬件开发，只是一个管理板卡工程，一个提供仿真舞台
- [[circuitpython]] —— 都降低硬件实验门槛，前者跑在板子上，Gazebo 先跑在电脑里
- [[slam-microsoft]] —— 定位建图需要可重复场景，Gazebo 能生成受控测试世界
- [[autonomous-driving-waymo-2021]] —— 自动驾驶同样依赖仿真先验证稀有危险场景

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[blender]] —— Blender — 全流程 3D 创作套件
- [[bullet]] —— Bullet — C++ 经典 3D 物理引擎与 PyBullet 仿真工具
- [[ogre]] —— OGRE — 老牌 C++ 3D 渲染引擎
