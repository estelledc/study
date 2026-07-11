---
title: Bullet — C++ 经典 3D 物理引擎与 PyBullet 仿真工具
来源: 'https://github.com/bulletphysics/bullet3'
日期: 2026-07-08
分类: graphics
难度: 中级
---

## 是什么

Bullet 是一个开源的**实时 3D 物理引擎**：它负责算物体怎么碰撞、怎么滚动、怎么被关节约束住。日常类比：你在桌上摆积木、弹珠和橡皮筋，手只负责设定初始位置，之后每一小拍发生什么由“物理裁判”统一判定。

它最早被游戏和视觉特效圈使用，后来又因为 Python 绑定 PyBullet 进入机器人、强化学习和机器学习仿真场景。

抓住一句话：Bullet 不是渲染引擎，它不负责把画面画漂亮；它负责在每一帧告诉你“这个盒子现在在哪里、转了多少、有没有撞上别的东西”。

## 为什么重要

不理解 Bullet 这类物理引擎，下面这些事会很难解释：

- 为什么 3D 游戏里箱子堆起来会抖，常常不是美术问题，而是时间步、碰撞形状和约束求解的问题。
- 为什么机器人仿真喜欢 PyBullet：Python 写控制策略，底层仍由 C++ 引擎快速推进物理世界。
- 为什么“能撞上”不等于“撞得真实”：碰撞检测、接触点、摩擦、恢复系数和求解器迭代都在参与结果。
- 为什么同一个模型换到真实机器人会翻车：仿真里的质量、阻尼、关节限制和传感器噪声只是近似。

## 核心要点

1. **世界先建好，时间再推进**。类比：先画好操场和参赛者，再每 1/60 秒吹一次哨。Bullet 里的 `btDiscreteDynamicsWorld` 或 PyBullet 的连接会保存所有刚体、碰撞形状、约束和重力。

2. **碰撞形状比模型外观更重要**。类比：电影道具外表像石头，实际安全道具可能是海绵；物理引擎看的是 box、sphere、capsule、convex hull 这类“可计算外壳”，不是三角面片有多漂亮。

3. **约束求解器是在“劝架”**。类比：两个物体互相挤压、铰链又要求只能绕一个轴转，求解器每帧反复调解。迭代次数太少会抖，太多会慢；真实项目要在稳定和性能之间取平衡。

## 实践案例

### 案例 1：PyBullet 里让小盒子落到地面

```python
import pybullet as p

client = p.connect(p.DIRECT)
p.setGravity(0, 0, -9.8)
plane = p.loadURDF("plane.urdf")
box = p.loadURDF("r2d2.urdf", [0, 0, 1])

for _ in range(240):
    p.stepSimulation()

print(p.getBasePositionAndOrientation(box)[0])
p.disconnect(client)
```

**逐部分解释**：

- `p.DIRECT` 表示不打开图形窗口，适合 CI 或批量实验；调试时可换成 `p.GUI`。
- `setGravity` 设定重力方向，单位要和模型尺寸一致。
- `stepSimulation()` 是固定节拍推进；循环 240 次约等于默认 240 Hz 下的 1 秒。

### 案例 2：C++ 里创建一个最小刚体世界

```cpp
btDefaultCollisionConfiguration config;
btCollisionDispatcher dispatcher(&config);
btDbvtBroadphase broadphase;
btSequentialImpulseConstraintSolver solver;
btDiscreteDynamicsWorld world(&dispatcher, &broadphase, &solver, &config);

world.setGravity(btVector3(0, -9.8, 0));
world.stepSimulation(1.0f / 60.0f, 10);
```

**逐部分解释**：

- `broadphase` 先粗筛“可能碰到”的物体，避免所有物体两两检查。
- `dispatcher` 负责把具体碰撞形状交给对应窄相检测算法。
- `SequentialImpulseConstraintSolver` 是常见实时求解器，适合游戏和交互仿真。
- `stepSimulation` 的第二个参数限制最多补几个子步，避免帧率抖动时一次追太多物理时间。

### 案例 3：用碰撞组过滤“不该撞”的对象

```cpp
short robotGroup = 1 << 0;
short floorGroup = 1 << 1;
short sensorGroup = 1 << 2;

short robotMask = floorGroup;
short sensorMask = robotGroup;

world.addRigidBody(robotBody, robotGroup, robotMask);
world.addCollisionObject(sensorObject, sensorGroup, sensorMask);
```

**逐部分解释**：

- group 像“身份牌”，mask 像“我愿意和谁互动”的名单。
- 机器人只和地面发生刚体碰撞，传感器只检查机器人是否进入区域。
- 过滤写错时会出现“明明穿模却没碰撞”或“传感器把场景全挡住”的问题。

## 踩过的坑

1. **把可视模型当碰撞模型**：高面数 mesh 直接参与碰撞会慢且不稳定，原因是实时引擎更适合简单凸形状或分解后的外壳。
2. **时间步跟着帧率乱跳**：渲染帧率从 120 掉到 30 时，物理结果也变，原因是积分误差和约束误差被放大。
3. **质量比例差太夸张**：1 kg 物体推 10000 kg 物体会抖，原因是求解器在有限迭代内很难同时满足所有接触约束。
4. **仿真结果直接搬到真机**：PyBullet 里能站稳的机器人真机摔倒，原因是电机延迟、摩擦、传感器噪声没有建模。
5. **忘记清理 collision shape 和 motion state**：C++ API 里对象生命周期要自己管，泄漏常出现在反复创建/销毁场景的工具里。

## 适用 vs 不适用

**适用**：

- 3D 游戏、VR、视觉特效里需要实时刚体、碰撞、约束和车辆模型的场景。
- 机器人和强化学习实验，需要用 PyBullet 快速搭环境、批量跑控制策略。
- 教学和原型验证，需要看清碰撞检测、刚体动力学和约束求解之间的关系。
- 需要开源 C++ 引擎，并愿意自己处理构建、资源生命周期和参数调试的团队。

**不适用**：

- 只做 2D 物理小游戏：通常先看 [[box2d]] 这类专门 2D 引擎。
- 需要电影级离线高精度模拟：实时引擎以交互速度为先，不追求每个细节的物理真实。
- 需要完整机器人产品级数字孪生：还要叠加传感器、控制器、硬件延迟和标定系统。
- 团队不愿维护 C++ 依赖，只想要托管云 API 的场景。

## 历史小故事（可跳过）

- **2000 年代**：Erwin Coumans 推动 Bullet 成为开源实时物理 SDK，重点是碰撞检测、刚体和约束。
- **2010 年前后**：游戏、动画和视觉特效场景让 Bullet 变成常见的开源 3D 物理选项之一。
- **2015 年以后**：PyBullet 出现，Python 用户可以更容易把 Bullet 用在机器人、强化学习和数据生成里。
- **2018 年前后**：发布说明中多次提到机器人、深度学习、VR、强化学习环境和可变形体改进，说明它的重心不只在游戏。
- **2020 年代**：项目仍以 Bullet 2.x C++ 引擎和 PyBullet 生态为主，使用者要关注版本、示例和构建方式差异。

## 学到什么

- 物理引擎的主线是“形状、刚体、约束、时间步”，不是某个神奇 API。
- 碰撞检测解决“有没有碰到”，约束求解解决“碰到后怎么分开和保持限制”。
- 真实感来自稳定参数：固定步长、合理质量比例、简单碰撞形状和可复现实验。
- PyBullet 的价值是把 C++ 引擎接到 Python 工作流，适合机器人和机器学习快速实验。
- 仿真永远是近似；越接近真机，越要补摩擦、延迟、噪声和执行器限制。

## 延伸阅读

- 官方仓库：[bulletphysics/bullet3](https://github.com/bulletphysics/bullet3)
- PyBullet quickstart guide（仓库文档中常用入门资料，先跑 Python 示例最直观）
- Bullet releases：关注 PyBullet 3.x、Bullet 2.x、机器人和 VR 相关更新
- [[box2d]] —— 2D 刚体物理的经典对照，能帮你区分 2D 与 3D 引擎边界
- [[gazebo-classic]] —— 机器人仿真平台里也能看到 Bullet、ODE、DART 等后端差异

## 关联

- [[box2d]] —— Bullet 面向 3D，Box2D 面向 2D，二者最容易被初学者混淆。
- [[gazebo-classic]] —— 机器人仿真中常见的物理后端选择之一。
- [[game-loop]] —— 固定时间步是物理稳定性的基础。
- [[benchmarking]] —— 比较物理引擎时要固定场景、步长和硬件。
- [[tradeoff-analysis]] —— 稳定、真实和性能三者需要取舍。
- [[vis-network]] —— 同样使用“物理”隐喻，但目标是图布局而不是刚体仿真。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[rapier]] —— Rapier — Rust 现代 2D/3D 物理引擎
