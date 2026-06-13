---
title: LeRobot — Hugging Face 开源机器人学习库
来源: https://github.com/huggingface/lerobot
日期: 2026-06-13
分类_原始: AI / 机器人
分类: 机器学习
子分类: 机器人与 VLA
provenance: pipeline-v3
---

# LeRobot — 让每个人都能做机器人 AI

## 一、一个日常类比

想象你想教一个机器人叠衣服。传统方法需要工程师一条条写指令：

> "先把左袖拉到右边 → 再把右袖拉到左边 → 对折 → 压平"

这就像让一个程序员手动画每一帧动画——可行，但极其繁琐，而且换一件衣服就全得重写。

LeRobot 的做法是反过来的：**你不用写指令，而是直接"示范"。** 你把衣服放在机器人面前，用手（或遥控装置）操控机械臂叠一次。机器人看着你的动作、听着你的摄像头画面，自己学着该怎么做。下次你再放一件衣服给它，它就能自己叠了。

这就是"端到端学习"——从**看到画面**到**做出动作**，中间不需要人写规则，全让 AI 自己从数据中学。

## 二、LeRobot 是什么

LeRobot 是 Hugging Face 开源的一个 PyTorch 机器人学习库，核心目标就一句话：**降低机器人 AI 的门槛**，让任何人都能收集数据、训练模型、部署到真实机器人上。

它有几个关键组件：

- **统一硬件接口**：不管你是便宜的 SO-100 机械臂、人形机器人 Unitree G1，还是人形机器人 HopeJR，LeRobot 提供一个统一的 `Robot` 接口来操控
- **LeRobotDataset 格式**：用 Parquet（表格数据）+ MP4（摄像头视频）标准化存储机器人数据，方便在 Hugging Face Hub 上共享
- **丰富的预训练模型**：涵盖模仿学习（ACT、Diffusion）、强化学习（HIL-SERL、TDMPC）、视觉-语言-动作模型（Pi0、GR00T）等
- **完整的训练和推理工具**：一条命令行就能训练或推理

## 三、核心概念拆解

### 3.1 端到端学习（End-to-End Learning）

传统机器人编程 = 感知 → 规划 → 控制，每一步都要单独设计。端到端学习则是一个神经网络直接输入摄像头画面，输出电机动作：

> 摄像头画面 → [AI 模型] → 电机动作

### 3.2 模仿学习（Imitation Learning）

机器人观察人类演示，学习映射关系。LeRobot 支持 ACT（Action Chunking Transformer）、Diffusion Policy 等主流算法。

### 3.3 VLA 模型（Vision-Language-Action）

在视觉 + 动作的基础上加入**自然语言指令**。比如你说"把红色积木放进盒子"，模型同时理解语言、画面，然后做出动作。Pi0、GR00T N1.5 就是这类模型。

### 3.4 LeRobotDataset

数据结构：

- 摄像头画面 → MP4 视频文件（多路摄像头同步录制）
- 机器人状态和动作 → Parquet 文件（类似 CSV，但更高效）

所有数据都可以通过 `LeRobotDataset` 类一行代码加载，自动处理视频解码。

## 四、实际代码示例

### 示例 1：连接机器人 + 获取传感器数据

```python
from lerobot.robots.myrobot import MyRobot

# 连接到一个真实的机器人
robot = MyRobot(config={...})
robot.connect()

# 获取当前"看到"的画面和"感觉到"的状态
observation = robot.get_observation()

# observation 里通常包含：
# - observation["image"]   ：摄像头拍到的画面
# - observation["state"]   ：机械臂每个关节的角度
# - observation["lang"]    ：语言任务描述（比如 "fold the shirt"）

# 把观察喂给训练好的模型，让它决定下一步怎么做
action = model.select_action(observation)

# 发送动作给机器人执行
robot.send_action(action)
```

这个过程每秒循环很多次，形成"看 → 想 → 做"的闭环。

### 示例 2：加载数据集 + 查看数据

```python
from lerobot.datasets.lerobot_dataset import LeRobotDataset

# 从 Hugging Face Hub 加载一个已经收集好的数据集
# 这个数据集包含 Aloha 机械臂开柜子的演示视频
dataset = LeRobotDataset("lerobot/aloha_mobile_cabinet")

# 查看数据量
print(f"总帧数: {len(dataset)}")
print(f"摄像头数: {dataset.camera_keys}")
print(f"动作维度: {dataset.policy_mode}")

# 取第一帧看看
frame = dataset[0]
print(f"动作形状: {frame['action'].shape}")
# 比如输出: action.shape=torch.Size([6])，表示机械臂有 6 个自由度

# 遍历前 5 帧
for i in range(5):
    frame = dataset[i]
    print(f"帧 {i}: 动作 = {frame['action']}")
```

### 示例 3：用命令行训练一个 ACT 模型

```bash
# 一条命令训练 ACT（Action Chunking Transformer）模型
lerobot-train \
  --policy=act \
  --dataset.repo_id=lerobot/aloha_mobile_cabinet \
  --output_dir=./outputs/act_training
```

就这么简单。LeRobot 会自动：从 Hub 下载数据 → 构建模型 → 训练 → 把训练好的模型保存到 `./outputs/act_training`。

### 示例 4：在真实机器人上推理

```bash
# 用训练好的模型控制 SO-101 机械臂
lerobot-rollout \
  --strategy.type=base \
  --policy.path=./outputs/act_training \
  --robot.type=so101_follower \
  --robot.port=/dev/ttyACM1 \
  --robot.camulas="{ up: {type: opencv, index_or_path: /dev/video1, width: 640, height: 480, fps: 30}}" \
  --task="Put lego brick into the transparent box" \
  --duration=60
```

模型会看着摄像头画面，按照"把乐高积木放进透明盒子"这个任务，自动控制机械臂执行 60 秒。

## 五、LeRobot 的完整工作流

```
校准机器人 → 遥控示范(收集数据) → 训练模型 → 部署推理 → 评估效果
    ↓              ↓                  ↓            ↓           ↓
机械臂关节    人类操控机械臂       PyTorch      真实机器人    仿真环境
标定           录制视频和动作       自动训练      执行任务      量化评分
```

每一步 LeRobot 都有对应工具，不需要自己搭建整个管线。

## 六、为什么值得关注

1. **Hugging Face 生态**：数据和模型直接发布到 HF Hub，和 NLP 领域的体验完全一致
2. **硬件无关**：同一个 API 支持 10+ 种机器人，换硬件不用改代码
3. **学术前沿**：ICLR 2026 论文，内置 Pi0、GR00T、Diffusion 等 SOTA 算法
4. **开源友好**：Apache 2.0 协议，欢迎所有人贡献
5. **中文教程**：有同济子豪兄做的完整中文教程，从组装到部署都有

## 七、适合谁

- **想入门机器人 AI 的人**：不用先懂控制理论，从数据驱动的角度切入更直观
- **想做具身智能研究的人**：LeRobot 提供了从数据到训练的完整管线
- **想给机器人加 AI 能力的团队**：统一接口让你不用为每种机器人重新写代码

---

*本文基于 LeRobot 官方 GitHub 仓库和文档编写，适合零机器人基础的编程学习者理解端到端机器人学习的核心思路。*
