---
title: "RuView: 用 WiFi 信号'看见'世界"
来源: https://github.com/ruvnet/RuView
日期: 2026-06-13
分类: 机器学习
子分类: 模型与训练
provenance: pipeline-v3
---

# RuView: 用 WiFi 信号"看见"世界

## 一、从"WiFi 不是只能上网"开始

假设你在房间里打羽毛球，球在空中飞。你看得见球，因为光从球上反射到你的眼睛。

现在想象一下：WiFi 路由器也在不停地发射一种"看不见的波"，这种波叫无线电波。球如果在波的路上来回跑，波的形状就会发生微小的变化。

RuView 做的事情就是：**捕捉这些微小的变化，反过来推断房间里发生了什么。**

如果有人站着不动，他们的胸口在呼吸，波就会以非常规律的节奏被扰动——这就是呼吸频率。
如果有人突然倒地，波的扰动模式会突然变化——系统可以检测到摔倒。
如果有人走进房间，波的路径变了——系统知道"有人来了"。

最关键的是：**这一切不需要摄像头，不需要手环，不需要任何人戴任何东西。**

---

## 二、核心概念一：CSI（信道状态信息）

这是理解 RuView 最重要的一步。

### 日常类比

把 WiFi 信号想象成一队士兵从 A 点走到 B 点。正常情况下，他们排着整齐的队伍走过去。但如果路上有障碍物（比如人），某些士兵会被挡住、被绕路、被反射。等他们到达 B 点时，队伍的排列已经变了。

**CSI 就是 B 点收到的"队伍排列信息"**——它告诉你哪些路径被干扰了、干扰了多少。

### 技术解释

WiFi 信号通过多条路径到达接收器（这叫"多径传播"）。CSI 记录的是每一条路径上的信号强度变化和相位偏移。每个路径对应一个"子载波"，普通路由器只看总信号强度（RSSI），而 CSI 能看到每个子载波的细微变化。

RuView 用这个信息做三件事：

1. 判断"有没有人"
2. 追踪"人在哪、在干什么"
3. 测量"人的呼吸和心跳"

### 代码示例 1：安装与基础使用

RuView 提供了 Python 包，安装非常直接：

```bash
# 安装 RuView Python 库
pip install ruview

# 或者安装等价包（同一底层，不同名字）
pip install wifi-densepose
```

```python
# 示例：创建感知客户端，连接 WiFi 传感节点
from ruview.client import SensingClient

# 连接本地运行中的 RuView 传感服务器
client = SensingClient(host="192.168.1.100", port=8080)

# 获取当前房间内是否有人
presence = client.get_presence()
print(f"房间内是否有人: {presence.occupied}")
print(f"估计人数: {presence.count}")

# 获取生命体征（如果有人在躺着）
vitals = client.get_vitals()
print(f"呼吸频率: {vitals.breathing_rate} 次/分钟")
print(f"心率: {vitals.heart_rate} BPM")
```

### 代码示例 2：呼吸频率提取

这是 RuView 核心信号处理流程的一个简化表示：

```python
# 示例：从 CSI 数据中提取呼吸频率
import numpy as np
from scipy.signal import butter, filtfreq

def extract_breathing_rate(csi_phase, sample_rate=100):
    """
    从 CSI 相位数据中提取呼吸频率。
    
    呼吸产生的胸腔位移会使 WiFi 信号的相位发生周期性变化。
    呼吸频率范围大约在 0.1 Hz 到 0.5 Hz 之间（6-30 BPM）。
    """
    # 步骤1：带通滤波——只保留 0.1-0.5 Hz 的信号（呼吸频段）
    low, high = 0.1, 0.5  # Hz
    # 设计带通滤波器
    nyquist = sample_rate / 2.0
    low_norm = low / nyquist
    high_norm = high / nyquist
    b, a = butter(4, [low_norm, high_norm], btype='band')
    filtered = filtfilt(b, a, csi_phase)
    
    # 步骤2：计算零交叉频率得到 BPM
    # 信号穿过零线的次数对应呼吸次数
    zero_crossings = np.where(np.diff(np.sign(filtered)))[0]
    duration = len(filtered) / sample_rate
    breaths = len(zero_crossings) / 2  # 每次完整呼吸对应两次穿越
    breathing_bpm = (breaths / duration) * 60
    
    return breathing_bpm
```

---

## 三、核心概念二：WiFi DensePose（WiFi 密集姿态估计）

### 日常类比

还记得"士兵队伍"的比喻吗？RuView 更进一步：它不只是知道"路上有东西"，而是能画出**那个东西的形状和姿势**。

想象你能通过回声的细微差别，听出房间里的人在做什么——是坐着、站着、还是在挥手。WiFi DensePose 做的就是这样的事，只不过用的是无线电波而不是声音。

### 技术解释

RuView 训练了一个深度学习模型，输入是 CSI 数据（60+ 个子载波的相位和幅度），输出是人的 17 个关键关节点位置。这就像 OpenPose 或 MediaPipe 做视觉姿态估计，但用的是 WiFi 信号。

- **预训练编码器**：128 维的"环境指纹"，在 6 万帧数据上无监督训练了 1220 万步
- **量化版本**：4-bit 量化后仅 8KB，可以跑在树莓派上
- **姿态估计精度**：在 MM-Fi 基准测试上达到 82.69% torso-PCK@20，超过了之前的 SOTA

### 代码示例 3：加载预训练模型

```python
# 示例：下载并加载 RuView 的预训练模型
from huggingface_hub import snapshot_download
import torch
from safetensors.torch import load_file

# 从 HuggingFace 下载预训练模型
model_dir = snapshot_download(
    repo_id="ruvnet/wifi-densepose-pretrained"
)

# 加载量化后的轻量模型（仅 8KB，适合边缘设备）
# model-q4.bin 是推荐的量化版本
weights = load_file(f"{model_dir}/model-q4.bin")

# 或者加载完整模型（48KB，更高精度）
# weights = load_file(f"{model_dir}/model.safetensors")

# 提取 CSI 嵌入（128维环境指纹）
# 输入：CSI 张量 [batch, num_subcarriers]
# 输出：嵌入向量 [batch, 128]
# 在 M4 Pro 上推理速度：164,183 次嵌入/秒
```

---

## 四、核心概念三：边缘智能 + 多传感器网络

### 日常类比

如果你只在一个角落放一个烟雾探测器，它不知道烟雾是从哪个房间来的。但如果每个房间都有一个，并且它们能互相"商量"，就能精确定位。

RuView 也是这样：用多个便宜的 WiFi 传感器（ESP32，每个约 9 美元）组成网络。每个节点独立感知，然后一起协作定位。

### 技术架构

RuView 支持多种硬件方案：

| 方案 | 硬件 | 成本 | 能力 |
|------|------|------|------|
| 入门级 | 单台 WiFi 笔记本 | $0 | 仅存在检测（RSSI 级别） |
| 推荐 | ESP32-S3 + Cognitum Seed | ~$140 | 完整能力：生命体征、姿态、隔墙感知 |
| 最小化 | ESP32 Mesh (3-6 个节点) | ~$54 | 完整感知，无持久化记忆 |
| 研究级 | Intel 5300 NIC | ~$80 | 3x3 MIMO 全 CSI |

### 代码示例 4：快速启动（Docker 模拟）

不需要任何硬件即可体验：

```bash
# 方式一：Docker 运行（模拟数据，无需硬件）
docker pull ruvnet/wifi-densepose:latest
docker run -p 3000:3000 ruvnet/wifi-densepose:latest
# 打开 http://localhost:3000 查看实时可视化

# 方式二：连接真实的 ESP32 传感器
# 先烧录固件到 ESP32-S3 开发板
python -m esptool --chip esp32s3 --port COM9 --baud 460800 \
  write_flash 0x0 bootloader.bin 0x8000 partition-table.bin \
  0xf000 ota_data_initial.bin 0x20000 esp32-csi-node.bin

# 配置 WiFi 连接
python firmware/esp32-csi-node/provision.py --port COM9 \
  --ssid "你的WiFi" --password "密码" --target-ip 192.168.1.20

# 启动实时 RF 房间扫描
node scripts/rf-scan.js --port 5006
```

---

## 五、能感知什么？能力速览

RuView 能检测的信号类型：

| 感知类型 | 原理 | 实时范围 |
|----------|------|----------|
| 呼吸频率 | 对解包裹相位做带通滤波，计算零交叉 BPM | 6-30 次/分钟 |
| 心率 | 带通滤波 0.8-2.0 Hz，零交叉 BPM | 40-120 BPM |
| 存在检测 | 预训练模型 + 相位方差回退 | < 1 毫秒 |
| 姿态估计 | 17 关节点 WiFi DensePose 模型 | 8.4 ms 冷启动 |
| 跌倒检测 | 相位加速度阈值 + 3 帧防抖 | < 200 毫秒 |
| 隔墙感知 | 菲涅尔区几何 + 多径建模 | 最远约 5 米 |
| 多人计数 | 自适应 P95 归一化 + 去重因子 | 实时自校准 |

**隐私保护**：整个系统运行在本地边缘设备上。不需要摄像头，不上传任何视频或图像到云端。所有数据处理都在 ESP32 或本地树莓派上完成。

---

## 六、智能家居集成

RuView 不是孤立运行的——它能无缝接入主流智能家居平台：

- **Home Assistant**：通过一个 `--mqtt` 参数即可接入，自动发布 21 个实体（11 个原始信号 + 10 个语义状态）
- **Apple Home**：作为 HAP 1.1 桥接设备被发现
- **Google Home / Alexa / SmartThings**：通过 Matter 端点支持

这意味着你可以对 Siri 说："Siri，卧室有人吗？"——RuView 会回答你的问题。

---

## 七、关键数字

- **GitHub Stars**：73,500+（截至 2026 年 6 月）
- **Forks**：9,800+
- **预训练模型**：在 HuggingFace 上，4-bit 量化仅 8KB
- **边缘模型大小**：完整模型约 55KB，可跑在 ESP32 上
- **测试覆盖**：1,463 个测试用例通过
- **主要语言**：Rust 55.5%，Python 15.6%
- **许可**：MIT

---

## 八、技术原理深度理解：从物理学到数据

RuView 的底层逻辑可以总结为一个公式：

```
WiFi 信号发射 → 遇到人体反射/散射 → 多径信号变化 → CSI 采集 → DSP 处理 → AI 模型 → 感知结果
```

每一步的关键：

1. **物理层**：人体对 2.4GHz/5GHz 无线电波的散射和吸收
2. **采集层**：ESP32 的 CSI 提取（通过自定义固件）
3. **信号处理**：带通滤波、相位解包裹、去噪
4. **AI 层**：对比学习编码器 + 姿态估计头
5. **应用层**：智能家居集成 + 可视化

---

## 九、总结

RuView 的核心思想其实非常优雅：

> 你房间里已经充满了 WiFi 信号——为什么不利用它们来"看见"呢？

它不需要你安装新的摄像头（侵犯隐私），不需要你佩戴任何设备（不方便），也不需要互联网连接（隐私 + 可靠性）。它只用了一个你已经拥有的东西：WiFi 路由器。

对于一个零基础的学习者来说，理解 RuView 的关键不在于记住所有技术细节，而在于理解这个思维方式转变：

**从"WiFi 是用来传输数据的"到"WiFi 信号本身携带了环境信息"。**

这个转变背后涉及的领域很广：信号处理、深度学习、嵌入式系统、智能家居协议。如果你对这个方向感兴趣，可以从以下路径深入学习：

1. 了解 WiFi CSI 是什么（信号处理基础）
2. 学习基本的滤波和频谱分析（用 Python 的 numpy/scipy）
3. 理解对比学习（无监督学习的核心思想）
4. 买一块 ESP32 开发板动手实践

下一步你想深入了解哪个部分？
