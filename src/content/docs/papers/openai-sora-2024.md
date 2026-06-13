---
title: "Sora：从文字到视频的 AI 生成模型"
来源: https://openai.com/sora
日期: 2026-06-13
分类: 机器学习
子分类: 模型与训练
provenance: pipeline-v3
---

# Sora：从文字到视频的 AI 生成模型

> "Sora" 在日语中是"天空"的意思，象征着它无限的创作潜力。

---

## 一、日常类比：给 AI 一本"世界说明书"

想象一下，你有一本特别厚的书，叫"世界说明书"。这本书里记录了地球上所有的视频——海浪拍打沙滩、城市车流、小动物奔跑、风吹树叶摇曳……

Sora 读过了数以百万计这样的视频。

现在，你告诉 Sora："给我生成一段视频，内容是一只橘猫在窗台上晒太阳打呼噜。"

Sora 会：

1. 在脑子里翻找它之前读过的所有视频
2. 提取出"猫""阳光""窗台""慵懒"这些概念是怎么在画面里表现的
3. 然后把它们组合起来，一段一段地"画"出一个视频

这和以前的 AI 有什么不同？

- **以前的图像 AI（如 DALL-E）**：只画一张照片。就像给你一张静态截图。
- **Sora 生成的视频**：是一张"会动的照片"，有画面、有时间流动、有物理规律。

---

## 二、核心概念拆解

### 2.1 Transformer 架构

你可能听说过 GPT 模型用的 Transformer 架构。Sora 也用了类似的架构，但做了一些关键改造：

**GPT 读文字**：把文字切成小块（token），按顺序处理，预测下一个词。

**Sora 处理视频**：把视频切成一块块的"时空方块"，然后预测这些方块应该怎么组合起来才是流畅的画面。

```
视频 = 多张图片在时间上排列

每张图片 = 2D 的空间（宽 x 高）
加上时间维度 = 3D 的"时空立方体"

Sora 做的事：学习这个 3D 立方体的规律
```

### 2.2 潜空间（Latent Space）

直接处理原始像素太慢了，就像让你一个字一个字地读一本 1000 页的书。

Sora 用的是"潜空间"：先把视频压缩成一个更紧凑的表示（类似把一本厚书总结成一页提纲），然后在压缩后的空间里做计算，最后再"展开"回完整的视频。

```
原始视频 → 压缩到潜空间（变小、变快）→ AI 在潜空间里生成 → 展开回视频
     ↓                                        ↓
   几 GB 的文件                        几 MB 的紧凑表示
```

这个压缩器叫 **VAE（Variational Autoencoder，变分自编码器）**，展开它的叫 **视频解压器**。

### 2.3 去噪扩散模型（Denoising Diffusion）

这是 Sora 生成视频的核心魔法。

想象一幅画被墨汁一点一点地弄脏：

```
清晰的视频 → 逐步加噪声（加雪花点） → 变成一团杂讯
    ↑                                          ↓
    └────── Sora 学习"反过来"的过程 ←─────
```

训练时，Sora 学习的是：**如果我知道一团杂讯，我能不能把它"净化"回清晰的画面？**

一旦学会了这个"净化"能力，你就可以给它一段文字描述，让它从杂讯中慢慢生成你描述的画面。

---

## 三、Sora 的技术架构

```
┌──────────────────────────────────────────────────┐
│                  Sora 工作流程                      │
├──────────────────────────────────────────────────┤
│                                                  │
│  1. 文字输入 (Prompt)                             │
│       ↓                                          │
│  2. 文字编码 (CLIP 或类似模型)                     │
│       ↓                                          │
│  3. 文字信息注入到 Transformer                     │
│       ↓                                          │
│  4. Transformer 处理时空数据                       │
│       ↓                                          │
│  5. 去噪扩散过程（多步迭代）                        │
│       ↓                                          │
│  6. 潜空间解码 → 输出视频                          │
│                                                  │
└──────────────────────────────────────────────────┘
```

关键组件：

- **扩散 Transformer（DiT）**：Sora 的核心网络，是 Transformer 和扩散模型的结合体
- **3D 补丁（3D Patches）**：把视频切成立方体块来处理，同时捕获空间和时间的信息
- **重注释（Recaptioning）**：用视频转文字模型为训练数据自动生成更详细的描述，增强训练

---

## 四、代码示例

### 示例 1：使用 OpenAI API 生成视频（伪代码）

这是你调用 Sora 生成视频的基本方式：

```python
import openai

client = openai.OpenAI()

# 生成一个视频
video = client.video.create(
    model="sora-1",
    prompt="一只橘猫在午后阳光充足的窗台上打呼噜，\
            窗外是城市的天际线，\
            4K 画质，电影感的景深效果",
    size="1280x720",
    n=1,          # 生成 1 个视频
    seconds=10    # 视频长度 10 秒
)

# 获取视频 URL
video_url = video.data[0].url
print(f"视频生成完成，下载地址：{video_url}")
```

要点：
- `model`：指定使用哪个 Sora 模型版本
- `prompt`：用自然语言描述你想要的视频内容
- `size`：输出分辨率
- `seconds`：视频时长（Sora 1 支持最长 60 秒）

---

### 示例 2：使用 API 进行视频编辑/扩展

Sora 不仅能生成新视频，还能在已有视频基础上做修改：

```python
import openai

client = openai.OpenAI()

# 扩展一个已有视频的后续画面
extended_video = client.video.extend(
    model="sora-1",
    video_url="https://example.com/existing_video.mp4",
    prompt="继续：小猫从窗台上跳下来，走到花园里追蝴蝶",
    seconds=10
)

# 提升视频分辨率
enhanced_video = client.video.enhance(
    model="sora-1",
    video_url="https://example.com/low_res_video.mp4",
    resolution="4K"
)

print(f"扩展视频：{extended_video.data[0].url}")
print(f"增强视频：{enhanced_video.data[0].url}")
```

---

### 示例 3：批量生成与参数控制

实际使用时，你可能需要一次性生成多个版本再挑选：

```python
import openai
import asyncio

client = openai.OpenAI()

async def generate_video_variations(prompt, num_variations=5):
    """
    批量生成同一提示词的不同视频变体
    """
    tasks = []
    for i in range(num_variations):
        task = client.video.create(
            model="sora-1",
            prompt=prompt,
            size="1920x1080",
            n=1,
            seconds=10,
            # seed 用来控制随机性
            # 相同 seed 会得到相同结果
            seed=i * 1000
        )
        tasks.append(task)

    results = await asyncio.gather(*tasks)

    for i, result in enumerate(results):
        print(f"变体 {i+1}: {result.data[0].url}")

    return results

# 使用示例
prompt = "无人机视角：秋天的京都，金黄的枫叶铺满小路，\
          远处是古老的寺庙，薄雾缭绕"

# 注意：异步需要 async def 包裹
# generate_video_variations(prompt)
```

---

### 示例 4：从图片生成视频（图生视频）

Sora 也可以从一张静态图片出发，让它"动起来"：

```python
import openai

client = openai.OpenAI()

# 从一张图片生成视频
image_to_video = client.video.create_from_image(
    model="sora-1",
    image_url="https://example.com/placeholder_image.jpg",
    prompt="让图片中的海浪缓缓流动，云层缓慢移动，\
            海鸥在天空中盘旋",
    size="1280x720",
    seconds=10
)

print(f"视频 URL: {image_to_video.data[0].url}")
```

---

## 五、Sora 的能力与局限

### 它能做什么

- 生成长达 1 分钟的 720p 视频
- 理解复杂的场景描述（多对象、多动作、空间关系）
- 自动产生不同镜头角度，无需手动指定
- 从图片出发让静态画面动起来
- 生成逼真的人像、动物、自然环境

### 它的局限

- 对物理规律的理解有限（比如水的流动、物体碰撞不够精确）
- 不理解因果关系
- 区分左右容易出错
- 人物面部近距离特写时可能出现不自然
- 生成成本极高（据报道每天约 100 万美元）

---

## 六、Sora 的发展时间线

| 时间 | 事件 |
|------|------|
| 2024 年 2 月 | OpenAI 首次公开演示 Sora |
| 2024 年 12 月 | Sora 面向 ChatGPT Plus/Pro 用户开放 |
| 2025 年 9 月 | Sora 2 发布，推出 iOS/Android 应用，类似 TikTok |
| 2025 年 12 月 | 迪士尼投资 10 亿美元，开放 200+ 版权角色生成 |
| 2026 年 4 月 | Sora 应用停止运营 |
| 2026 年 9 月 | Sora API 计划停止服务 |

Sora 作为一个独立产品的生命周期相对短暂。据媒体报道，关停原因与计算资源紧张、成本压力以及 OpenAI 向企业级产品转型有关。

---

## 七、与其他模型的对比

| 模型 | 公司 | 最长时长 | 特色 |
|------|------|---------|------|
| Sora 2 | OpenAI | ~1 分钟 | 潜空间扩散 Transformer 架构 |
| Veo | Google | ~60 秒 | 多镜头、电影语法 |
| Gen-3 | Runway | ~1 分钟 | 创意控制能力强 |
| Kling 3.0 | KlingAI | ~2 分钟 | 长视频生成 |
| Seedance 2.0 | 字节跳动 | ~1 分钟 | 高质量物理模拟 |

---

## 八、关键收获总结

1. **Sora 的本质**：是一个"世界模拟器"——它通过学习视频中的物理规律和场景逻辑，能够生成现实中可能发生的画面
2. **技术核心**：扩散模型 + Transformer + 潜空间压缩 = 高效的视频生成管道
3. **与普通 LLM 的区别**：GPT 处理的是 1D 的文本序列，Sora 处理的是 3D 的时空数据
4. **实际价值**：大幅降低了视频创作门槛，让不懂拍摄的人也能生成高质量片段
5. **行业影响**：Sora 的生命周期也提醒我们，AI 领域发展极快，今天的产品可能明天就会被淘汰或整合

---

## 九、思考题

> 读完这篇笔记后，试着思考：

1. 如果 Sora 能完美模拟物理规律，它和真正的"现实"还有什么区别？
2. 当每个人都能生成逼真的视频时，我们如何分辨什么是真实拍摄的？
3. 从 DALL-E（文字→图片）到 Sora（文字→视频），你觉得下一个突破会是什么？

---

*笔记来源：OpenAI 官方文档与公开技术报告。本文旨在学习记录，仅供个人学习使用。*
