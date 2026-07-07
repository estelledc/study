---
title: Nav2 — ROS 2 移动机器人导航栈
来源: 'https://github.com/ros-navigation/navigation2'
日期: 2026-07-07
分类: embedded
难度: 初级
---

## 是什么

Nav2 是 ROS 2 里的移动机器人导航框架：你给机器人地图、传感器和目标点，它负责定位、规划路径、避障、控制底盘，并在失败时尝试恢复。

日常类比：它像商场里的“总调度台”。保安告诉它哪里堵了，地图告诉它楼层结构，司机只管按它给的路线开；如果电梯口堵住了，它还能安排绕路或倒退。

最小例子不是写一个完整机器人，而是在官方 TurtleBot 仿真里启动整套导航：

```bash
source /opt/ros/<ros2-distro>/setup.bash
ros2 launch nav2_bringup tb3_simulation_launch.py headless:=False
```

这两行背后会拉起地图服务、AMCL 定位、行为树导航器、planner、controller、costmap、RViz 和 Gazebo。新手可以先把它当作“会动的导航样板间”，再逐步替换成自己的机器人。

## 为什么重要

不理解 Nav2，下面这些事都很难解释：

- 为什么机器人不是“算出一条线就完事”，还要同时处理定位、障碍物、速度控制和失败恢复。
- 为什么 ROS 2 机器人经常要求 TF、map、odom、base_link 这些坐标关系先对齐。
- 为什么同一个目标点，有时是 planner 失败，有时是 controller 失败，日志看起来像不同系统在说话。
- 为什么现代机器人软件更喜欢“插件 + 行为树”，而不是把所有逻辑写进一个巨大的 if/else。

## 核心要点

Nav2 的核心可以拆成 **三件事**：

1. **行为树当总导演**：BT Navigator 像任务清单，不直接开车，而是按顺序调用“算路”“跟路”“恢复”等节点。好处是逻辑可换：同样是去目标点，你可以加重试、清 costmap、暂停、绕路。

2. **server 分工做脏活**：planner server 算全局路径，controller server 把路径变成速度，behavior server 负责倒退、旋转、清障等恢复动作。类比餐厅后厨：切菜、炒菜、传菜分开，某个岗位换人不用重建整家店。

3. **插件让算法可替换**：不同底盘和场景需要不同 planner、controller、costmap layer。Nav2 把它们做成插件，仓库不用 fork，也能把默认算法换成适合仓库车、差速车或全向车的版本。

这套设计的价值在于：机器人导航不是单一算法，而是一条长期运行的流水线；Nav2 把流水线拆成可观察、可替换、可组合的部件。

## 实践案例

### 案例 1：先在仿真里跑通“点到点导航”

官方 Getting Started 用 TurtleBot 仿真做第一步。命令大致长这样：

```bash
source /opt/ros/<ros2-distro>/setup.bash
sudo apt install ros-$ROS_DISTRO-navigation2
sudo apt install ros-$ROS_DISTRO-nav2-bringup
ros2 launch nav2_bringup tb3_simulation_launch.py headless:=False
```

逐部分解释：

- `source` 是把 ROS 2 环境变量放进当前终端，否则系统找不到包和命令。
- `navigation2` 和 `nav2_bringup` 是导航核心与启动配置；它们不是某一个算法，而是一整套节点。
- `tb3_simulation_launch.py` 会启动仿真机器人、地图、定位、导航节点和可视化工具。
- `headless:=False` 让 Gazebo 图形界面出现，适合新手观察“机器人真的在地图里移动”。

启动后，RViz 里先点 `2D Pose Estimate` 给机器人一个大概初始位置，再点 `Navigation2 Goal` 发送目标。这个动作会触发行为树，通过 action server 让机器人朝目标走。

### 案例 2：边建图边导航

当你没有现成地图时，官方 SLAM 教程让 Nav2 不启动 AMCL 和 map server，而是让 SLAM Toolbox 发布 `/map` 和 `map -> odom`。

```bash
source /opt/ros/<ros2-distro>/setup.bash
sudo apt install ros-$ROS_DISTRO-slam-toolbox
ros2 launch turtlebot3_bringup robot.launch.py
ros2 launch nav2_bringup navigation_launch.py
ros2 launch slam_toolbox online_async_launch.py
ros2 topic pub /goal_pose geometry_msgs/PoseStamped "{header: {stamp: {sec: 0}, frame_id: 'map'}, pose: {position: {x: 0.2, y: 0.0, z: 0.0}, orientation: {w: 1.0}}}"
ros2 run nav2_map_server map_saver_cli -f ~/map
```

逐部分解释：

- `robot.launch.py` 提供真实或仿真的机器人接口，包含底盘、传感器和 TF。
- `navigation_launch.py` 只启动导航相关节点，把建图职责留给 SLAM。
- `online_async_launch.py` 让 SLAM Toolbox 一边接收激光数据，一边更新地图。
- `/goal_pose` 是给 Nav2 的目标点；机器人移动时，地图会同步扩展。
- `map_saver_cli` 把实时生成的地图保存下来，之后可切回 AMCL 定位模式。

这就是很多移动机器人项目的真实节奏：先用 SLAM 探索环境，保存地图，再用固定地图做稳定导航。

### 案例 3：给机器人设置禁行区

Nav2 的 costmap filter 可以让地图上的某些区域带行为规则。官方 Keepout Zones 教程用 filter mask 告诉机器人“这里不要走”。

```yaml
global_costmap:
  global_costmap:
    ros__parameters:
      plugins: ["static_layer", "obstacle_layer", "inflation_layer"]
      filters: ["keepout_filter"]
      keepout_filter:
        plugin: "nav2_costmap_2d::KeepoutFilter"
        enabled: True
        filter_info_topic: "keepout_costmap_filter_info"
```

```bash
ros2 launch nav2_bringup tb4_simulation_launch.py
```

逐部分解释：

- `plugins` 是普通 costmap 层：静态地图、传感器障碍物、膨胀安全距离。
- `filters` 是单独的行为过滤层；官方特别强调不要把它混进普通 layer 里。
- `KeepoutFilter` 会读取 mask 和 filter info，把“禁行”规则叠加到全局 costmap。
- launch 之后，机器人规划路径时会把这些区域当成不可走或高代价区域。

这个案例说明 Nav2 不只是“躲开当前看到的障碍物”，也能执行场地规则，比如仓库禁入区、危险区域、临时施工区。

## 踩过的坑

1. **没有初始位姿，导航树看似启动却走不动**：AMCL 需要你先在 RViz 点 `2D Pose Estimate`，否则 `map -> odom` 关系可能还没闭合。

2. **`use_sim_time` 写错，TF 报未来或过去的时间**：仿真用仿真时间，真机用系统时间，混用会让 transform 查询失败。

3. **只调 planner，不看 controller 和 costmap**：路径算出来不代表能走，局部控制和障碍物代价也会让机器人停下或进入恢复。

4. **把 costmap filter 当普通 layer 配**：keepout、speed limit 这类 filter 应放在 `filters` 参数里，否则容易和 inflation 等普通层互相干扰。

## 适用 vs 不适用场景

**适用**：

- ROS 2 移动机器人，需要从当前点自主到目标点。
- 仓储、巡检、服务机器人等需要地图、避障、恢复和任务编排的场景。
- 想在同一框架里替换 planner、controller、costmap layer 或行为树逻辑。
- 需要从仿真逐步迁移到真实 TurtleBot、差速底盘、全向底盘或 Ackermann 底盘。

**不适用**：

- 只想做一个离线最短路算法，不需要真实传感器、TF 和速度控制。
- 飞行器、高速自动驾驶等动力学约束完全不同的系统，不能直接照搬默认配置。
- 没有 ROS 2 基础设施的项目；Nav2 依赖 action、service、lifecycle node、TF 和参数系统。
- 期望“装上就自动适配所有机器人”的场景；真实机器人仍要调 footprint、传感器、速度和安全距离。

## 历史小故事（可跳过）

- **ROS 1 时代**：经典导航栈围绕 `move_base` 展开，很多逻辑集中在一个入口里，能用但扩展成本高。
- **ROS 2 迁移时**：Nav2 借机重做架构，把 action、lifecycle node、pluginlib 和行为树放进核心设计。
- **2020 年**：项目团队发表 The Marathon 2，把 Nav2 作为 ROS 2 导航系统介绍给机器人社区。
- **2023 年以后**：文档开始强调现代 planner、controller、costmap filter、route server、Simple Commander 等能力。
- **到 2026 年**：GitHub 上约 4.4k stars，Nav2 已经是 ROS 2 移动机器人导航的事实标准之一。

## 学到什么

1. **导航是一条链，不是一个函数**：定位、地图、规划、控制、恢复任何一环坏掉，机器人都可能不动。
2. **行为树解决“任务怎么编排”**：它让导航逻辑像流程图一样可改，而不是散落在代码 if/else 里。
3. **插件化解决“算法怎么换”**：planner、controller、costmap layer 可以按机器人类型和场景替换。
4. **调机器人先看接口契约**：TF、时间、地图、传感器 topic、footprint，比盲目改参数更关键。

## 延伸阅读

- 官方文档：[Nav2 Documentation](https://docs.nav2.org/)（概念、教程、配置集中入口）
- 入门教程：[Getting Started](https://docs.nav2.org/getting_started/index.html)（从安装到 TurtleBot 仿真）
- 真实案例：[Navigating while Mapping](https://docs.nav2.org/tutorials/docs/navigation2_with_slam.html)（SLAM 与导航一起跑）
- Python 应用：[Simple Commander API](https://docs.nav2.org/commander_api/index.html)（把导航当库来调用）
- [[ros2]] —— Nav2 建在 ROS 2 的 action、service、lifecycle node 和 TF 上
- [[behavior-tree]] —— Nav2 用行为树编排导航任务和恢复策略

## 关联

- [[ros2]] —— Nav2 是 ROS 2 移动机器人生态里的导航层。
- [[slam]] —— 没有现成地图时，SLAM 负责生成 `/map` 和 `map -> odom`。
- [[behavior-tree]] —— 行为树决定何时算路、跟路、恢复和重试。
- [[plugin-architecture]] —— Nav2 的 planner、controller、costmap layer 都依赖插件化扩展。
- [[state-estimation]] —— AMCL、里程计和传感器融合共同决定机器人“以为自己在哪”。
- [[embedded-systems]] —— 真实机器人导航同时受算力、传感器、时钟和底盘能力限制。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
