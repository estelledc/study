---
title: Isaac Lab 零基础入门笔记
来源: https://github.com/isaac-sim/IsaacLab
日期: 2026-06-13
分类: 机器学习
子分类: 机器人与 VLA
provenance: pipeline-v3
---

# Isaac Lab 零基础入门笔记

## 一、Isaac Lab 是什么

### 日常类比：机器人的"电子游乐场"

想象你要教一只机器狗怎么走路。

如果让真狗来练，你得买设备、占场地，练摔了还会疼。

Isaac Lab 做的事情就是：**在电脑里建一个完全真实的虚拟世界**，让机器人在里面跑、摔、练，练好了再把学会的技能搬到真机器上。

关键好处：
- GPU 加速：在虚拟世界里可以同时模拟成千上万个机器人，一个 GPU 就能跑
- 真实物理引擎：碰撞、摩擦、重力，一切按物理定律来
- 传感器模拟：摄像头、激光雷达、惯性测量单元（IMU），和真机器人一样"感知"世界

### 它建立在谁身上

Isaac Lab 不是从零开始的，它建立在 NVIDIA Isaac Sim 之上。

可以这样理解关系链：

```
NVIDIA Isaac Sim  →  物理引擎 + 3D 渲染 + 传感器模拟
Isaac Lab         →  用 Python 把这些能力封装成易用的框架
```

Isaac Sim 提供底层能力（类似发动机），Isaac Lab 提供方向盘和导航（你写代码操作的部分）。

## 二、核心概念

### 1. Simulation Context（模拟上下文）

这是整个框架的入口。你创建一个 Simulation Context，就是启动了一个可以运行物理仿真的环境。

类比：就像你打开一个游戏，先选择"新游戏"——Simulation Context 就是你的那个"新游戏"。

核心 API：

```python
from isaaclab.sim import SimulationCfg, SimulationContext

# 设置模拟参数：每步 0.01 秒（即 100Hz）
sim_cfg = SimulationCfg(dt=0.01)
sim = SimulationContext(sim_cfg)
```

### 2. Prims（图元 / 场景元素）

在 Isaac Lab（以及它底层的 USD 格式）中，所有场景里的东西都叫 Prim。

- 地面是一个 Prim
- 一个红色锥体是一个 Prim
- 一台机器人是一个 Prim
- 灯光也是一个 Prim

类比：乐高积木里的每一块积木都是一个 Prim。你把它们搭在一起，就组成了一个场景。

### 3. Assets（资产）

Asset 是比 Prim 更高一层的概念。一个 Asset 可以包含多个 Prim，代表一个完整的物理对象。

Isaac Lab 提供三种主要资产类型：

| 类型 | 说明 | 类比 |
|------|------|------|
| RigidObject | 刚体，不会变形 | 一块石头 |
| Articulation | 带关节的 articulated 物体 | 人、机器狗 |
| DeformableObject | 可变形物体 | 橡皮泥、海绵 |

### 4. Environments（环境）

Environment 是整个框架的核心。它把场景、机器人、传感器、奖励函数全部打包成一个可交互的单元。

类比：Environment 就像是一个完整的"训练关卡"——里面有地形、有角色、有任务目标、有打分规则。

两种设计工作流：
- **Manager-Based**：用配置驱动，通过 YAML 或 Python 字典声明式地定义环境
- **Direct Workflow**：直接用 Python 代码继承基类来编写，更灵活

### 5. Wrappers（包装器）

Isaac Lab 的环境遵循 Gymnasium 接口（这是强化学习的标准接口），但 RL 库（如 Stable-Baselines3）需要自己的包装格式。

Wrapper 做的事情就是把 Isaac Lab 环境"套"成 RL 库能认的格式。

类比：你有个 USB-C 的充电器，但手机是 Lightning 接口——Wrapper 就是那个转接头。

## 三、代码示例

### 示例一：创建空场景并启动模拟

这是最基础的入门代码。运行后会启动一个空白的模拟世界。

```python
from isaaclab.app import AppLauncher
from isaaclab.sim import SimulationCfg, SimulationContext

# 1. 先启动 Isaac Sim 应用（这是所有 Isaac Lab 代码的第一步）
parser = argparse.ArgumentParser()
AppLauncher.add_app_launcher_args(parser)
args_cli = parser.parse_args()
app_launcher = AppLauncher(args_cli)
simulation_app = app_launcher.app

# 2. 创建模拟上下文
sim_cfg = SimulationCfg(dt=0.01)
sim = SimulationContext(sim_cfg)
sim.set_camera_view([2.5, 2.5, 2.5], [0.0, 0.0, 0.0])

# 3. 启动模拟循环
sim.reset()
print("[INFO]: Setup complete...")

while simulation_app.is_running():
    sim.step()  # 推进一个物理模拟步

simulation_app.close()
```

要点说明：
- 每一段 Isaac Lab 代码都必须先通过 `AppLauncher` 启动模拟器
- `dt=0.01` 表示物理模拟步长为 10 毫秒
- `sim.step()` 推进一帧，放在 `while` 循环中就构成了持续的模拟
- 最后用 `simulation_app.close()` 关闭

### 示例二：在场景中生成物体

这个例子展示如何往空场景里添加地面、灯光、锥体、可变形方块等。

```python
import isaaclab.sim as sim_utils

def design_scene():
    """设计场景：地面、灯光、物体"""

    # 1. 添加地面
    cfg_ground = sim_utils.GroundPlaneCfg()
    cfg_ground.func("/World/defaultGroundPlane", cfg_ground)

    # 2. 添加远处光源
    cfg_light = sim_utils.DistantLightCfg(
        intensity=3000.0,
        color=(0.75, 0.75, 0.75),
    )
    cfg_light.func("/World/lightDistant", cfg_light, translation=(1, 0, 10))

    # 3. 创建一个容器（Xform prim），所有物体放在它下面
    sim_utils.create_prim("/World/Objects", "Xform")

    # 4.  spawn 一个红色锥体（纯视觉，无物理）
    cfg_cone = sim_utils.ConeCfg(
        radius=0.15,
        height=0.5,
        visual_material=sim_utils.PreviewSurfaceCfg(diffuse_color=(1.0, 0.0, 0.0)),
    )
    cfg_cone.func("/World/Objects/Cone1", cfg_cone, translation=(-1.0, 1.0, 1.0))
    cfg_cone.func("/World/Objects/Cone2", cfg_cone, translation=(-1.0, -1.0, 1.0))

    # 5. spawn 一个绿色锥体（带刚体物理属性）
    cfg_cone_rigid = sim_utils.ConeCfg(
        radius=0.15,
        height=0.5,
        rigid_props=sim_utils.RigidBodyPropertiesCfg(),
        mass_props=sim_utils.MassPropertiesCfg(mass=1.0),
        collision_props=sim_utils.CollisionPropertiesCfg(),
        visual_material=sim_utils.PreviewSurfaceCfg(diffuse_color=(0.0, 1.0, 0.0)),
    )
    cfg_cone_rigid.func(
        "/World/Objects/ConeRigid", cfg_cone_rigid,
        translation=(-0.2, 0.0, 2.0),
        orientation=(0.5, 0.0, 0.5, 0.0),
    )

    # 6. spawn 一个蓝色可变形方块
    cfg_cuboid = sim_utils.MeshCuboidCfg(
        size=(0.2, 0.5, 0.2),
        deformable_props=sim_utils.DeformableBodyPropertiesCfg(),
        visual_material=sim_utils.PreviewSurfaceCfg(diffuse_color=(0.0, 0.0, 1.0)),
        physics_material=sim_utils.DeformableBodyMaterialCfg(),
    )
    cfg_cuboid.func("/World/Objects/CuboidDeformable", cfg_cuboid, translation=(0.15, 0.0, 2.0))

def main():
    sim_cfg = sim_utils.SimulationCfg(dt=0.01, device="cuda:0")
    sim = sim_utils.SimulationContext(sim_cfg)
    sim.set_camera_view([2.0, 0.0, 2.5], [-0.5, 0.0, 0.5])

    design_scene()  # 生成场景物体

    sim.reset()
    print("[INFO]: Scene created...")

    while simulation_app.is_running():
        sim.step()

    simulation_app.close()
```

这段代码展示了 Isaac Lab 的核心编程模式：

1. **Cfg 模式**：每个物体都有一个 `Cfg` 类（如 `ConeCfg`、`GroundPlaneCfg`），用来配置该物体的属性
2. **func() 调用**：配置好后调用 `.func()` 方法，传入路径名和位置参数，物体就真正被生成到场景里了
3. **USD 路径命名**：`/World/Objects/Cone1` 这种路径是 USD 格式的层级命名，`/` 表示层级关系
4. **物理属性分层**：`rigid_props` 控制碰撞，`mass_props` 控制质量，`visual_material` 控制外观

### 示例三：用 PPO 算法训练一个平衡环境

这是 Isaac Lab 的完整 RL 训练流程，使用 Stable-Baselines3 的 PPO 算法训练 Cartpole（倒立摆）任务。

```python
import gymnasium as gym
from stable_baselines3 import PPO
from stable_baselines3.common.vec_env import VecNormalize

from isaaclab.envs import ManagerBasedRLEnvCfg
from isaaclab_rl.sb3 import Sb3VecEnvWrapper

# 1. 创建 Isaac Lab 环境（使用已注册的任务名）
env_cfg = ManagerBasedRLEnvCfg()
env_cfg.scene.num_envs = 64  # 同时模拟 64 个环境

env = gym.make("Isaac-Cartpole-v0", cfg=env_cfg)

# 2. 包装成 Stable-Baselines3 能识别的格式
env = Sb3VecEnvWrapper(env)

# 3. （可选）归一化观测值
env = VecNormalize(env, training=True, norm_obs=True, norm_reward=True)

# 4. 创建并训练 PPO 代理
agent = PPO("MlpPolicy", env, verbose=1, tensorboard_log="./logs")

agent.learn(total_timesteps=1_000_000, progress_bar=True)

# 5. 保存模型
agent.save("./logs/cartpole_model")
env.close()
```

训练和运行命令：

```bash
# 无头模式训练（不显示画面，速度最快）
./isaaclab.sh -p scripts/reinforcement_learning/sb3/train.py \
    --task Isaac-Cartpole-v0 \
    --num_envs 64 \
    --headless

# 用训练好的模型来玩
./isaaclab.sh -p scripts/reinforcement_learning/sb3/play.py \
    --task Isaac-Cartpole-v0 \
    --num_envs 32 \
    --use_last_checkpoint
```

## 四、Isaac Lab 的能力全景

### 支持的机器人类型

Isaac Lab 内置了 16 种以上的机器人模型，包括：

- **机械臂**：Franka, WidowX 等
- **四足机器人**：Unitree Go1,ANYmal 等
- **双足机器人**：Atlas, Digit 等
- **轮式机器人**：Jetbot 等

### 内置环境

超过 30 种预置环境可以直接训练，覆盖：
- 平衡（Cartpole, Hopper）
- 抓取（机械臂操作物体）
- 行走（四足、双足）
- 多智能体（多个机器人协作/对抗）

### 支持的传感器

| 传感器 | 用途 |
|--------|------|
| RGB / Depth / Segmentation 相机 | 视觉感知 |
| 激光雷达（Ray Caster） | 距离测量 |
| IMU | 惯性测量 |
| 接触传感器 | 碰撞检测 |

### 支持的 RL 库

Isaac Lab 不绑定单一 RL 框架，可通过 Wrapper 对接：

- **RSL RL**：针对 Legged Robot 优化的实现
- **SKRL**：多智能体友好的库
- **RL Games**：NVIDIA 自家的 GPU 加速 RL
- **Stable Baselines3**：最容易上手的入门库

## 五、学习路径建议

如果你是零基础，推荐的入门顺序：

1. **先看环境能跑起来**
   - 按安装文档装好 Isaac Lab
   - 跑通一个已有的环境（如 `Isaac-Cartpole-v0`）

2. **学写"空场景"脚本**
   - 参考 `00_sim/create_empty.py`
   - 理解 AppLauncher + SimulationContext 的基本结构

3. **学生成物体**
   - 参考 `00_sim/spawn_prims.py`
   - 尝试修改锥体的颜色、位置、数量

4. **学加载机器人**
   - 参考 `01_assets/run_articulation.py`
   - 尝试控制一个真实机器人模型的关节

5. **进入强化学习**
   - 参考 `03_envs/create_manager_rl_env.py`
   - 训练 Cartpole 并观察 reward 变化

6. **添加传感器**
   - 参考 `04_sensors/add_sensors_on_robot.py`
   - 在机器人上加摄像头，观察输出

## 六、重要注意事项

- Isaac Lab 需要 **Isaac Sim** 作为依赖，两者版本有对应关系
- 支持 Linux 和 Windows，但目前社区以 Linux 为主
- 所有代码都是 Python 脚本，不需要额外的配置语言
- 使用 Hydra 做配置管理，可以通过命令行参数覆盖设置
- 支持多 GPU 和分布式训练，适合大规模仿真

## 参考资料

- 官方文档：https://isaac-sim.github.io/IsaacLab
- GitHub 仓库：https://github.com/isaac-sim/IsaacLab
- 技术论文（arXiv）：https://arxiv.org/abs/2511.04831
- 社区讨论：https://github.com/isaac-sim/IsaacLab/discussions
