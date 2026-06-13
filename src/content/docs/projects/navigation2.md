---
title: Navigation2 (Nav2) — 移动机器人导航零基础入门
来源: 'https://github.com/ros-navigation/navigation2'
日期: 2026-06-13
子分类: 嵌入式
分类: 操作系统
provenance: pipeline-v3
---

## 日常类比：商场里的「导览系统 + 保安 + 路线规划师」

想象你推着一辆购物车在大型商场里，要从入口走到三楼书店。商场里已经有一套成熟的导览体系，而不是你边走边临时问路：

- **地图（Map）** 像商场平面图：哪里是墙、哪里能走，事先画好或扫出来。
- **定位（Localization）** 像头顶的蓝牙信标/Wi-Fi 定位：告诉你「我现在在 2 楼扶梯口偏东 3 米」。
- **全局规划（Global Planner）** 像导航 App 算整条路线：从入口经扶梯到书店，走哪条通道最顺。
- **局部规划 / 控制（Local Planner / Controller）** 像你推车时的实时微调：前面突然有人停下，绕一下、慢一点，但大方向不变。
- **代价地图（Costmap）** 像热力图：越红越「不想走」（离障碍物近），规划会主动绕开。
- **行为树（Behavior Tree）** 像导览员手里的流程卡：先算路 → 跟路走 → 卡住了就执行恢复动作（原地转圈看清环境、后退、清地图）→ 再试一次。
- **生命周期管理（Lifecycle Manager）** 像商场开业流程：先通电、再开监控、再开扶梯，**按顺序**把各子系统拉起来；关店时反过来，避免「定位还没好就开始乱跑」。

**Navigation2（Nav2）** 就是 ROS 2 生态里这套「移动机器人导览系统」的标准实现。它是 ROS 1 `navigation` 栈的专业继任者，被 Autoware、仓储 AMR、服务机器人等大量产品采用。官方仓库：[ros-navigation/navigation2](https://github.com/ros-navigation/navigation2)；概念与配置见 [Nav2 Documentation](https://docs.nav2.org/)。

它和 [[ros2]] 的关系：Nav2 完全跑在 ROS 2 之上，用 **Topic** 传传感器与速度指令，用 **Action** 暴露「导航到某点」「穿过多个路标」等长任务，用 **Lifecycle Node** 管理各服务器启停。若你已读过 ROS 2 笔记里的节点/话题/动作，Nav2 就是把它们组织成一条可产品化的导航流水线。

---

## 解决什么问题

移动机器人在室内/园区自主行走，至少要同时搞定四件事：

| 痛点 | 没有 Nav2 时 | Nav2 的回应 |
| --- | --- | --- |
| 模块耦合 | 定位、规划、控制各写各的，接口不统一 | 拆成 **Planner / Controller / Smoother / Behavior** 等 **Task Server**，经 BT Navigator 编排 |
| 卡住不会自救 | 规划失败或跟丢路径就停住 | 默认 BT 含 **Recovery**：清 costmap、原地旋转、等待、后退等 |
| 启动顺序混乱 | 地图未加载就规划，TF 未就绪就发速度 | **Lifecycle Manager** 按 `node_names` 顺序 configure → activate |
| 算法换不了 | 换 DWB 为 RPP 要改一堆代码 | **插件架构**：`nav2_core` 接口 + YAML 里换 `plugin` 名 |

Nav2 要回答的核心问题是：**能否在 ROS 2 上，用同一套配置和 Action 接口，让差速、全向、阿克曼等多种底盘，在已知或 SLAM 建图环境中，可靠地从 A 走到 B（乃至一串路标点）？**

---

## 系统架构一览

官方架构图可概括为「**一个大脑 + 多个专职服务器 + 一层地图**」：

```text
                    ┌─────────────────────┐
                    │   BT Navigator      │  ← 行为树：NavigateToPose / NavigateThroughPoses
                    │   (bt_navigator)    │
                    └──────────┬──────────┘
           Action 调用         │
    ┌──────────┼──────────┬───────────┬──────────────┐
    ▼          ▼          ▼           ▼              ▼
 planner   controller  smoother   behaviors    waypoint_follower
 _server    _server     _server    (recovery)      (可选)
    │          │          │           │
    └──────────┴────┬─────┴───────────┘
                      ▼
              ┌───────────────┐
              │ Costmap 2D    │  ← global + local 代价地图
              │ (map_server,  │
              │  AMCL/SLAM)   │
              └───────────────┘
```

**数据流（简化）**：

1. 用户或上层应用发 `NavigateToPose` 目标到 `bt_navigator`。
2. BT 调用 `planner_server` 在 **global costmap** 上算路径。
3. 可选 `smoother_server` 平滑路径。
4. `controller_server` 根据 **local costmap** 与路径跟踪，输出 `cmd_vel`。
5. 失败时 BT 触发 recovery 行为，再重试规划或跟踪。
6. `lifecycle_manager` 保证 `map_server`、`amcl`、`planner_server` 等按序就绪。

---

## 核心概念

### 1. Task Server 与 Action 接口

Nav2 把「算路、跟路、恢复」拆成独立 **服务器节点**，每个服务器对外提供 **Action**（少数用 Service）。上层（通常是 BT Navigator）只认 Action 语义：发目标、收反馈、可取消。

常用 Action（包名 `nav2_msgs`）：

| Action | 作用 |
| --- | --- |
| `NavigateToPose` | 导航到单个位姿（最常用） |
| `NavigateThroughPoses` | 按顺序经过多个路标点 |
| `ComputePathToPose` | 只规划路径，不执行 |
| `FollowPath` | 跟踪已有路径 |
| `Spin` / `BackUp` / `Wait` | 恢复行为 |

查看本机已注册的导航 Action：

```bash
ros2 action list | grep nav
ros2 action info /navigate_to_pose
```

### 2. 行为树（Behavior Tree）

相比「几十种状态、上百条转移」的有限状态机（FSM），行为树用 **可复用节点**（条件、动作、控制流）拼出复杂流程，更易扩展。Nav2 使用 [BehaviorTree.CPP](https://www.behaviortree.dev/)，默认树例如 `navigate_to_pose_w_replanning_and_recovery.xml`：

- **Navigation 子树**：周期性重规划（默认约 1 Hz）+ `FollowPath`。
- **Recovery 子树**：子树失败后轮询 `ClearCostmap`、`Spin`、`Wait`、`BackUp` 等。

自定义树：复制 XML，在参数里改 `default_nav_to_pose_bt_xml`，或在 Goal 里填 `behavior_tree` 字段指向你的 XML。

### 3. Lifecycle Node 与 Lifecycle Manager

Nav2 关键节点（`map_server`、`amcl`、`planner_server`、`controller_server`、`bt_navigator` 等）都是 **受管生命周期节点**。状态迁移：`unconfigured` → `inactive` → `active` → …

`nav2_lifecycle_manager` 通过服务 `lifecycle_manager/manage_nodes` 一次性 **startup / pause / resume / reset / shutdown** 列表中的节点。启动顺序由参数 `node_names` 决定——**先传感器与地图，再规划与控制**，避免「无图规划」。

在 RViz 的 Nav2 面板点 **Startup**，本质上就是调这个服务；量产系统里一般由 launch 或自主应用自动调用。

### 4. 地图、定位与 Costmap

- **map_server**：加载静态栅格地图（`map.yaml` + 图像）。
- **AMCL**（Adaptive Monte Carlo Localization）：在已知地图上，用激光/里程计估计机器人在 `map` 坐标系下的位姿。
- **SLAM 模式**：用 `slam_toolbox` 等同时建图与定位，Nav2 `bringup` 里用 `slam:=True` 切换 launch 分支。
- **Costmap 2D**：两层常见配置——**global**（大范围、低更新率）给全局规划；**local**（小窗口、高更新率）给避障与控制。障碍物来自静态地图层、障碍层（激光）、膨胀层（inflation）等 **plugin** 堆叠。

TF 链必须连通：`map` → `odom` → `base_link`（及 `base_link` → `laser` 等传感器）。缺 TF 时 Nav2 会拒绝目标或速度异常——这是初学者最高频问题之一。

### 5. 插件（Plugins）

算法以插件形式加载，YAML 里改类名即可切换，无需改 BT 源码：

| 服务器 | 示例插件 |
| --- | --- |
| Global Planner | NavFn, Smac Planner 2D/ Hybrid-A* |
| Controller | DWB, RPP (Regulated Pure Pursuit), Graceful |
| Smoother | Savitzky-Golay, Simple |
| Goal Checker | 判断是否到达目标 |

参数文件通常在 `nav2_bringup/params/*.yaml`，机器人项目应 **复制一份** 改成自己的 `my_robot_nav2.yaml`，而不是直接改官方默认文件。

### 6. nav2_simple_commander（Python 高层 API）

不想手写 Action Client 时，可用官方 Python 库 `nav2_simple_commander`，封装了 lifecycle 等待、发目标、读反馈、取消任务等。适合快速验证和教学 demo。

---

## 快速上手：仿真一条命令

在已安装 Nav2 的 ROS 2 环境（如 Humble/Jazzy + `sudo apt install ros-<distro>-navigation2`）：

```bash
# 终端 1：TurtleBot3 仿真 + Nav2 全栈
export TURTLEBOT3_MODEL=burger
ros2 launch nav2_bringup tb3_simulation_launch.py use_sim_time:=True

# 终端 2：用 RViz 点「2D Pose Estimate」设初始位姿，再点「Nav2 Goal」
# 或用下面 Python 示例自动发目标
```

`tb3_simulation_launch.py` 会拉起 Gazebo（或新版仿真）、机器人状态发布、定位、规划、控制、RViz 与 lifecycle。**第一次使用务必先设初始位姿**，否则 AMCL 不知道机器人在地图哪里，规划会失败。

---

## 代码示例一：Python 导航到目标点（nav2_simple_commander）

下面脚本演示：等待 Nav2 激活 → 设置初始位姿 → 发送 `NavigateToPose` 等价任务 → 打印 ETA 与剩余距离。改编自官方 `example_nav_to_pose.py`。

```python
#!/usr/bin/env python3
import rclpy
from geometry_msgs.msg import PoseStamped
from nav2_simple_commander.robot_navigator import BasicNavigator, TaskResult


def main():
    rclpy.init()
    navigator = BasicNavigator()

    # 等待 lifecycle 全部激活（launch 里 autostart:=True 时必需）
    navigator.waitUntilNav2Active()

    # 初始位姿：告诉 AMCL「机器人在地图上的大概位置」
    initial_pose = PoseStamped()
    initial_pose.header.frame_id = 'map'
    initial_pose.pose.position.x = -2.0
    initial_pose.pose.position.y = -0.5
    initial_pose.pose.orientation.w = 1.0
    navigator.setInitialPose(initial_pose)

    # 目标位姿
    goal_pose = PoseStamped()
    goal_pose.header.frame_id = 'map'
    goal_pose.pose.position.x = 1.5
    goal_pose.pose.position.y = 0.5
    goal_pose.pose.orientation.w = 1.0

    navigator.goToPose(goal_pose)

    while not navigator.isTaskComplete():
        feedback = navigator.getFeedback()
        if feedback:
            print(
                f'剩余距离: {feedback.distance_remaining:.2f} m, '
                f'预计到达: {feedback.estimated_time_remaining.sec} s'
            )

    result = navigator.getResult()
    if result == TaskResult.SUCCEEDED:
        print('导航成功')
    elif result == TaskResult.CANCELED:
        print('导航被取消')
    else:
        print('导航失败')

    navigator.lifecycleShutdown()
    rclpy.shutdown()


if __name__ == '__main__':
    main()
```

运行前确认仿真已启动且地图 frame 为 `map`。若换真实机器人，把初始位姿改为 GPS/反光板/手动标定值，并关闭 `use_sim_time`。

---

## 代码示例二：YAML 参数片段（规划器 + 控制器 + BT）

真实项目里，核心差异往往在 **参数** 而非改 C++。下面摘录典型结构（字段名因发行版略有不同，以你安装的 `nav2_bringup/params/nav2_params.yaml` 为母版修改）：

```yaml
bt_navigator:
  ros__parameters:
    use_sim_time: true
    global_frame: map
    robot_base_frame: base_link
    odom_topic: /odom
    # 默认行为树：含重规划 + 恢复
    default_nav_to_pose_bt_xml: navigate_to_pose_w_replanning_and_recovery.xml
    plugin_lib_names:
      - nav2_compute_path_to_pose_action_bt_node
      - nav2_follow_path_action_bt_node
      - nav2_spin_action_bt_node
      - nav2_wait_action_bt_node
      - nav2_clear_costmap_service_bt_node

planner_server:
  ros__parameters:
    planner_plugins: ["GridBased"]
    GridBased:
      plugin: "nav2_navfn_planner/NavfnPlanner"
      tolerance: 0.5
      use_astar: false

controller_server:
  ros__parameters:
    controller_frequency: 20.0
    min_x_velocity_threshold: 0.001
    controller_plugins: ["FollowPath"]
    FollowPath:
      plugin: "nav2_regulated_pure_pursuit_controller/RPPController"
      desired_linear_vel: 0.5
      lookahead_dist: 0.6

local_costmap:
  local_costmap:
    ros__parameters:
      update_frequency: 5.0
      publish_frequency: 2.0
      rolling_window: true
      width: 3
      height: 3
      resolution: 0.05
      robot_radius: 0.22
```

launch 时通过 `params_file` 指向你的 YAML：

```bash
ros2 launch nav2_bringup bringup_launch.py \
  map:=/path/to/warehouse.yaml \
  params_file:=/path/to/my_robot_nav2.yaml \
  use_sim_time:=False
```

调参顺序建议：**机器人半径 / footprint → 控制器最大速度 → 膨胀半径 → 规划容差**。一次只改一类参数，用仿真反复走同一条路线对比。

---

## 代码示例三：底层 Action Client（了解原理用）

若不用 `nav2_simple_commander`，可直接对 `/navigate_to_pose` 发 Action（与 RViz「Nav2 Goal」相同接口）：

```python
from rclpy.action import ActionClient
from nav2_msgs.action import NavigateToPose


class Nav2Client(Node):
    def __init__(self):
        super().__init__('nav2_client')
        self._client = ActionClient(self, NavigateToPose, 'navigate_to_pose')

    def go_to(self, x: float, y: float):
        self._client.wait_for_server()
        goal = NavigateToPose.Goal()
        goal.pose.header.frame_id = 'map'
        goal.pose.header.stamp = self.get_clock().now().to_msg()
        goal.pose.pose.position.x = x
        goal.pose.pose.position.y = y
        goal.pose.pose.orientation.w = 1.0
        self._client.send_goal_async(goal)
```

注意：**发导航目标前**，必须先有可靠的 `map`→`base_link` 位姿（AMCL 已收敛或你已 `setInitialPose`）。否则 BT 会认为定位无效而失败。

---

## 默认行为树在做什么（读懂 XML）

`navigate_to_pose_w_replanning_and_recovery.xml` 逻辑可口述为：

1. 收到目标后，进入 **PipelineSequence**：一边以固定频率 **重算全局路径**，一边 **FollowPath**。
2. 若规划或跟路失败，在 Navigation 子树内先做 **上下文恢复**（如清 local costmap）。
3. 若仍失败，进入 Recovery 子树：**轮询** Spin → Wait → BackUp → ClearCostmap 等，再回到 Navigation 重试。
4. 全部耗尽仍失败，Action 返回 `aborted`，上层应用决定告警或人工接管。

读 XML 不必一次啃完；用 `bt_navigator` 的 Groot 监控或日志，对照「机器人实际在转圈还是后退」理解更快。

---

## 与 ROS 1 navigation 的主要差异

| 维度 | ROS 1 move_base | Nav2 |
| --- | --- | --- |
| 中间件 | ROS 1 | ROS 2 + DDS |
| 编排 | 较固定的 recovery 顺序 | **行为树**，可换 XML |
| 节点模型 | 普通节点 | **Lifecycle** + bond 看门狗 |
| 接口 | 多种自定义 | 统一 **nav2_msgs** Action |
| 扩展 | 改源码较多 | **插件** + YAML |

从 ROS 1 迁移时：先别急着复刻旧参数，用默认 TB3 仿真跑通，再逐项把 `move_base` 参数映射到 `planner_server` / `controller_server` / costmap 插件。

---

## 常见问题排查

| 现象 | 可能原因 | 处理 |
| --- | --- | --- |
| 发目标无反应 | 未 Startup / lifecycle 未 active | RViz 面板 Startup 或调 `manage_nodes` |
| 全局规划失败 | 无初始位姿、目标在障碍物内 | 2D Pose Estimate；检查 goal 是否在自由空间 |
| 机器人不动但无报错 | `cmd_vel` 未接到底盘；TF 断链 | `ros2 topic echo /cmd_vel`；`ros2 run tf2_tools view_frames` |
| 贴墙抖、绕障怪 | 膨胀半径、footprint、控制器增益 | 调 local costmap inflation 与 RPP/DWB 参数 |
| 仿真时间错乱 | `use_sim_time` 不一致 | 全局统一 `use_sim_time:=True` 并开 `/clock` |

调试命令清单：

```bash
ros2 lifecycle get /planner_server          # 应为 active [3]
ros2 topic hz /scan                         # 激光是否进栈
ros2 run nav2_util lifecycle_bringup autostart  # 部分环境手动拉起
```

---

## 学习路径建议（零基础 → 能改项目）

1. **跑通仿真**：`tb3_simulation_launch.py`，会用 RViz 设初始位姿与目标。
2. **读架构图**：对照本文「系统架构」记住 planner / controller / BT / costmap 分工。
3. **改 YAML**：只改 `desired_linear_vel`、`robot_radius`，观察行为变化。
4. **换 BT**：复制默认 XML，删掉某种 recovery，看失败时有何不同。
5. **接真机**：导出自己机器人的 URDF footprint、激光 topic、差速 `cmd_vel`，新建 `my_robot_nav2.yaml`。
6. **读插件列表**：[Navigation Plugins](https://docs.nav2.org/plugins/index.html) 按底盘类型选控制器（差速常用 RPP 或 DWB；阿克曼用 Smac Hybrid-A* + 相应控制器）。

延伸阅读：

- [Navigation Concepts](https://docs.nav2.org/concepts/index.html) — Lifecycle、BT、Action 设计哲学
- [Detailed Behavior Tree Walkthrough](https://docs.nav2.org/behavior_trees/overview/detailed_behavior_tree_walkthrough.html) — 默认树逐节点说明
- [Adding a New Nav2 Task Server](https://docs.nav2.org/tutorials/docs/adding_a_nav2_task_server.html) — 扩展自定义服务器
- 关联笔记：[[ros2]]（通信基础）、[[moveit2]]（机械臂规划，常与 Nav2 组成移动操作机器人）

---

## 小结

Nav2 不是单个「导航节点」，而是一套 **由行为树编排的、生命周期受控的、插件化可扩展的** 移动机器人导航框架。日常使用时你主要接触三件事：**launch 拉起全栈**、**设初始位姿 + 发 NavigateToPose**、**按机器人调 YAML**。把商场导览的类比换成「地图 + 定位 + 规划 + 控制 + 卡住怎么办」，你就已经握住了 Nav2 的主线；其余插件与 XML，都是在这条主线上换策略、加细节。
