---
title: Gazebo Classic — 机器人仿真零基础入门
来源: 'https://github.com/osrf/gazebo'
日期: 2026-06-13
子分类: 嵌入式
分类: 操作系统
provenance: pipeline-v3
---

## 日常类比：带物理引擎的「沙盒游戏 + 风洞实验室」

想象你要测试一辆还没造出来的遥控车，但不想每次改设计都开模、焊电路、买零件。

- **世界（World）** 像游戏关卡文件：地面、光照、障碍物、重力方向，全写在一个 `.world` / `.sdf` 里。
- **模型（Model）** 像可复用的积木包：一个差速小车、一张桌子、一盏太阳灯，各自有 `model.sdf`，关卡里用 `<include>` 引用即可。
- **链接与关节（Link / Joint）** 像积木的「硬块 + 铰链」：车身是一个 link，轮子通过 revolute joint 连到车身；物理引擎据此算碰撞与运动。
- **gzserver** 像后台物理服务器：不算画面，只跑物理步进、传感器采样、插件逻辑——适合 CI 或无头云仿真。
- **gzclient** 像 3D 客户端：负责渲染、鼠标拖物体、调仿真参数；挂了可以重启，server 继续跑。
- **插件（Plugin）** 像 Mod：用 C++ 写 `.so`，在 SDF 里挂到 world / model / sensor 上，就能改重力、推模型、读激光数据。

**Gazebo Classic**（仓库 [osrf/gazebo](https://github.com/osrf/gazebo)）是 Open Robotics 维护多年的 3D 机器人仿真器，长期与 ROS 1 深度集成，也是 ROS 2 早期 `gazebo_ros_pkgs` 的底座。官方教程入口：[Gazebo Classic Tutorials](https://classic.gazebosim.org/tutorials)。

> **重要背景**：Gazebo Classic 已于 **2025 年 1 月** 到达 end-of-life（EOL），新项目应迁移到新一代 **Gazebo**（原 Ignition Gazebo，见 [gazebosim.org](https://gazebosim.org)）。本文仍值得学：大量 legacy 栈、教材、比赛环境基于 Classic；理解 SDF、server/client 分离、插件模型，迁移到新 Gazebo 会轻松很多。

它和 [[ros2]] / [[navigation2]] 的关系：Nav2 常在 Gazebo 里跑 SLAM + 导航；Classic 通过 `gazebo_ros` 桥发布 `/clock`、`/scan`、`/odom` 等话题，让 ROS 节点以为在跟真机打交道。

---

## 解决什么问题

| 痛点 | 没有仿真时 | Gazebo Classic 的回应 |
| --- | --- | --- |
| 硬件贵、迭代慢 | 每改一次结构就要实机调试 | SDF 改参数 → 重启仿真，分钟级验证 |
| 危险场景难测 | 高速碰撞、跌落不便真测 | 物理引擎（ODE/Bullet 等）在虚拟世界重复试验 |
| 传感器难同步 | 相机、激光、IMU 时间戳对齐麻烦 | 仿真器统一 clock，传感器按同一物理步长采样 |
| 算法要可复现 | 实机噪声、环境不可控 | 固定 seed、固定 world，回归测试稳定 |
| 多机协同 | 多台机器人成本高 | 一个 world 里 spawn 多个 model |

核心问题：**如何在可控、可重复、低成本的环境里，让机器人软件（感知、规划、控制）以为在操作真实硬件？**

---

## 架构：Server / Client 分离

Gazebo Classic 由两个主要进程组成（`gazebo` 命令会同时拉起二者）：

```text
┌─────────────────┐         transport (Protobuf/Topic)        ┌─────────────────┐
│    gzserver     │ ◄──────────────────────────────────────► │    gzclient     │
│  物理 + 传感器   │         状态、图像、GUI 指令               │  QT 可视化界面   │
│  插件加载        │                                          │  用户交互        │
└────────┬────────┘                                          └─────────────────┘
         │
         │  libgazebo_ros_* 等桥接
         ▼
┌─────────────────┐
│  ROS / ROS 2    │  /clock, /tf, /scan, /cmd_vel ...
└─────────────────┘
```

常用启动方式：

```bash
# 图形界面 + 默认空世界
gazebo

# 指定官方示例世界（路径随安装版本变化，如 gazebo-11）
gazebo worlds/empty_sky.world

# 无头：只跑物理（适合服务器 / CI）
gzserver worlds/empty_sky.world

# 另开终端再看画面
gzclient
```

环境变量（排错高频）：

| 变量 | 作用 |
| --- | --- |
| `GAZEBO_MODEL_PATH` | 额外模型目录，找 `model://` |
| `GAZEBO_RESOURCE_PATH` | 找 world、media 等资源 |
| `GAZEBO_PLUGIN_PATH` | 自定义 `.so` 插件搜索路径 |

---

## 核心概念

### 1. SDF（Simulation Description Format）

SDF 是 XML 格式的仿真描述语言（[SDF 规范](http://sdformat.org/)）。与 URDF 相比，SDF **原生支持一个文件里多个 model、完整 world、插件标签**，Classic 以 SDF 为一等公民。

层级结构（由粗到细）：

```text
<sdf>
  <world>           ← 一个仿真场景
    <include/>      ← 引用 model://ground_plane 等
    <model>         ← 也可 inline 写完整模型
      <link>        ← 刚性单元：visual + collision + inertial
        <visual/>   ← 外观（mesh / box / cylinder）
        <collision/>← 碰撞体（可简化）
        <inertial/> ← 质量、惯性张量
      </link>
      <joint/>      ← 连接两个 link：revolute / prismatic / fixed ...
      <plugin/>     ← 绑定 C++ 插件 .so
    </model>
    <plugin/>       ← World 级插件
  </world>
</sdf>
```

**Model 数据库**：在线/本地 `~/.gazebo/models`，GUI 里 Insert  tab 下载的模型也在这里。每个模型目录通常含 `model.config`（元数据）和 `model.sdf`（几何与物理）。

### 2. 物理引擎与仿真步

`gzserver` 循环执行：

1. 读 SDF，实例化 world 与 model；
2. 按 `max_step_size` 推进物理（默认 ODE）；
3. 更新 joint 状态、碰撞响应；
4. 触发传感器与插件回调（如 `WorldUpdateBegin`）；
5. 通过 transport 把状态发给 client 与外部桥。

实时因子（Real Time Factor, RTF）= 仿真时间 / 墙钟时间。RTF < 1 说明算力不够，仿真比真实时间慢。

### 3. 插件类型

| 插件基类 | 挂载点 | 典型用途 |
| --- | --- | --- |
| `SystemPlugin` | 命令行 / 最早加载 | 控制启动流程 |
| `WorldPlugin` | `<world>` | 改重力、光照、全局逻辑 |
| `ModelPlugin` | `<model>` | 推模型、自定义控制器 |
| `SensorPlugin` | 传感器 | 处理相机/激光原始数据 |
| `VisualPlugin` | visual | 特效、非物理可视化 |

注册宏：`GZ_REGISTER_WORLD_PLUGIN`、`GZ_REGISTER_MODEL_PLUGIN` 等。插件必须编译为 **shared library**，并在 SDF 里写 `filename="libxxx.so"`。

### 4. Transport 与消息

Classic 内部用 **Protobuf** 消息在 topic 上通信（与 ROS 不同层）。插件里常见：

- `transport::Node` 订阅/发布 Gazebo 话题；
- `event::Events::ConnectWorldUpdateBegin` 每个仿真步回调。

ROS 集成则另走 `gazebo_ros` 包，把 Gazebo 传感器转成 ROS 消息。

### 5. Classic vs 新 Gazebo

| 维度 | Gazebo Classic | 新 Gazebo (gz sim) |
| --- | --- | --- |
| 命令 | `gazebo`, `gzserver` | `gz sim` |
| 维护状态 | EOL (2025-01) | 活跃开发 |
| SDF 版本 | 1.4–1.7 常见 | SDFormat 最新版 |
| ROS 2 | 旧 `gazebo_ros_pkgs` | `ros_gz` 系列 |

维护老项目读 Classic； greenfield 请直接上新 Gazebo + [迁移指南](https://gazebosim.org/docs/latest/migration_from_classic/)。

---

## 示例 1：最小 World SDF + 命令行启动

在任意目录创建 `minimal.world`：

```xml
<?xml version="1.0"?>
<sdf version="1.6">
  <world name="default">
    <!-- 内置 ground_plane 与 sun 模型 -->
    <include>
      <uri>model://ground_plane</uri>
    </include>
    <include>
      <uri>model://sun</uri>
    </include>

    <!-- 1m 立方体，中心高度 0.5m -->
    <model name="box">
      <pose>0 0 0.5 0 0 0</pose>
      <static>false</static>
      <link name="link">
        <collision name="collision">
          <geometry>
            <box><size>1 1 1</size></box>
          </geometry>
        </collision>
        <visual name="visual">
          <geometry>
            <box><size>1 1 1</size></box>
          </geometry>
          <material>
            <ambient>0.2 0.5 0.8 1</ambient>
          </material>
        </visual>
        <inertial>
          <mass>1.0</mass>
          <inertia>
            <ixx>0.166667</ixx><iyy>0.166667</iyy><izz>0.166667</izz>
          </inertia>
        </inertial>
      </link>
    </model>
  </world>
</sdf>
```

运行：

```bash
cd /path/to/dir
gazebo minimal.world
# 或 headless
gzserver minimal.world
```

期望：地面上一块蓝色立方体，受重力落下并静止。若报 `Unable to find uri[model://ground_plane]`，检查 Gazebo 是否正确安装、`GAZEBO_MODEL_PATH` 是否包含系统 model 路径。

---

## 示例 2：Model 插件 — 每帧给模型施加速度

以下 C++ **ModelPlugin** 在每一仿真步给父模型设置线速度（改编自官方 [Model plugins](https://classic.gazebosim.org/tutorials?tut=plugins_model) 教程）。

`model_push.cc`：

```cpp
#include <gazebo/gazebo.hh>
#include <gazebo/physics/physics.hh>
#include <gazebo/common/common.hh>

namespace gazebo {
class ModelPush : public ModelPlugin {
 public:
  void Load(physics::ModelPtr _parent, sdf::ElementPtr /*_sdf*/) {
    model_ = _parent;
    updateConnection_ = event::Events::ConnectWorldUpdateBegin(
        std::bind(&ModelPush::OnUpdate, this));
  }

  void OnUpdate() {
    // 沿 X 轴 0.5 m/s 匀速推动
    model_->SetLinearVel(ignition::math::Vector3d(0.5, 0, 0));
  }

 private:
  physics::ModelPtr model_;
  event::ConnectionPtr updateConnection_;
};
GZ_REGISTER_MODEL_PLUGIN(ModelPush)
}
```

`CMakeLists.txt` 骨架（需 `find_package(gazebo REQUIRED)`，链接 `${GAZEBO_LIBRARIES}`）：

```cmake
cmake_minimum_required(VERSION 3.5)
project(model_push)
find_package(gazebo REQUIRED)
add_library(model_push SHARED model_push.cc)
target_link_libraries(model_push ${GAZEBO_LIBRARIES})
```

`model_push.world` 片段：

```xml
<model name="box">
  <pose>0 0 0.5 0 0 0</pose>
  <link name="link">
    <collision name="collision">
      <geometry><box><size>1 1 1</size></box></geometry>
    </collision>
    <visual name="visual">
      <geometry><box><size>1 1 1</size></box></geometry>
    </visual>
  </link>
  <plugin name="model_push" filename="libmodel_push.so"/>
</model>
```

编译与运行：

```bash
mkdir build && cd build && cmake .. && make
export GAZEBO_PLUGIN_PATH=$GAZEBO_PLUGIN_PATH:$(pwd)
gzserver -u ../model_push.world   # -u 表示 paused 启动，按播放开始
```

期望：点击播放后，立方体持续向 X 正方向滑动。`-u` 便于先检查场景再开仿真。

---

## 示例 3：World 插件 — 启动时修改重力

World 插件在 `Load` 里拿到 `physics::WorldPtr`，可改物理参数。官方 [Programmatic World Control](https://classic.gazebosim.org/tutorials?tut=plugins_world_properties) 通过 transport 发布 `msgs::Physics` 把重力改成 `(0.01, 0, 0.1)`，物体缓慢「飘走」。

SDF 挂载：

```xml
<world name="default">
  <!-- ... includes ... -->
  <plugin filename="libworld_edit.so" name="world_edit"/>
</world>
```

要点：`node->Init(_parent->GetName())` 初始化 transport；`physicsPub->Publish(physicsMsg)` 应用新重力。适合课程演示「月球重力」「火星重力」而不改全局配置。

---

## 与 ROS 2 联合使用（概念）

典型流程（包名因发行版略有差异）：

1. 安装 `gazebo_ros_pkgs` 与机器人描述包；
2. `ros2 launch` 同时起 `gzserver`（带 robot world）与 robot state / spawn；
3. 控制器发 `/cmd_vel`，`gazebo_ros_diff_drive` 等插件驱动模型；
4. `gazebo_ros_ray_sensor` 发布 `/scan`，Nav2 消费。

```bash
# 示意：具体 launch 名以你所用栈为准（如 turtlebot3_gazebo）
ros2 launch turtlebot3_gazebo empty_world.launch.py
```

仿真时间：设置 `use_sim_time` 为 true，ROS 节点订阅 `/clock`，避免墙钟与 sim time 错位。

---

## GUI 快速上手

1. **Insert**  tab：从 model 库拖入物体（下载到 `~/.gazebo/models`）。
2. 工具栏 **简单几何体**：快速放 box / sphere / cylinder。
3. **Translate / Rotate** 插件：拖动物体与模型。
4. **File → Save As**：把当前场景存成 `.world` / `.sdf`。
5. 左下角 **播放 / 暂停 / 单步**：控制仿真运行。

教程 [Building a world](https://classic.gazebosim.org/tutorials?tut=build_world) Walkthrough 与上述流程一致。

---

## 常见问题排查

| 现象 | 可能原因 | 处理 |
| --- | --- | --- |
| `model://` 找不到 | model 路径未设置 | `export GAZEBO_MODEL_PATH=...` 或 `gazebo --verbose` 看日志 |
| 插件未加载 | `.so` 不在 `GAZEBO_PLUGIN_PATH` | 编译后 export 插件目录 |
| 黑屏 / 无 client | 只跑了 gzserver | 另开 `gzclient` 或直接用 `gazebo` |
| 物体穿透抖动 | 步长过大、碰撞 mesh 太薄 | 减小 `max_step_size`，简化 collision |
| ROS 时间不对 | 未用 sim time | 全局 `use_sim_time:=true` + `/clock` |

调试建议：始终先 `gazebo --verbose` 或 `gzserver --verbose`，第一屏错误通常直指缺失的 uri 或 plugin。

---

## 学习路径建议

1. **Quick Start**：[官方 Quick Start](https://classic.gazebosim.org/tutorials?tut=quick_start) — 熟悉 `gazebo worlds/pioneer2dx.world`。
2. **Components**：[Gazebo Components](https://classic.gazebosim.org/tutorials?tut=components) — world / model / server / client 分工。
3. **Build World** — GUI 搭场景并 Save As。
4. **Plugins 101** — WorldPlugin Hello World，理解 `GZ_REGISTER_*`。
5. **Model / Sensor 插件** — 控制与传感器数据处理。
6. **对接 ROS 2** — 在已有 robot launch 里改 world、换传感器插件。
7. **迁移** — 读 [Migration from Gazebo classic](https://gazebosim.org/docs)，对照新 API。

---

## 小结

Gazebo Classic 用 **SDF 描述世界**，用 **gzserver 跑物理与插件**，用 **gzclient 看与摸**，可选 **ROS 桥** 对接导航/感知栈。对零基础学习者，先会写最小 world、会启动 server/client、会在 SDF 里 `include` 模型，再进阶 C++ 插件与 ROS launch，是一条扎实路径。

记住 EOL 时间线：学 Classic 是为了维护与理解现有资产；**新仿真项目请直接选 Gazebo (gz sim)**，并把本文的 SDF 与插件思想映射到新文档即可。

---

## 参考链接

- 源码与 Issue：[github.com/osrf/gazebo](https://github.com/osrf/gazebo)
- 教程索引：[classic.gazebosim.org/tutorials](https://classic.gazebosim.org/tutorials)
- SDF 规范：[sdformat.org](https://sdformat.org/)
- 新 Gazebo 与迁移：[gazebosim.org](https://gazebosim.org)
- 相关笔记：[[ros2]]、[[navigation2]]、[[moveit2]]
