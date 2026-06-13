---
title: ComfyUI 零基础学习笔记
来源: https://github.com/comfyanonymous/ComfyUI
日期: 2026-06-13
分类: 机器学习
子分类: ai-ml-frameworks
provenance: pipeline-v3
---

# ComfyUI 零基础学习笔记

## 一、ComfyUI 是什么？

ComfyUI 是一个用节点（Node）和连线（Graph）来操控 AI 图像生成工具的程序。

你可以把它想象成一个"乐高积木工作台"——每一块积木是一个功能模块（比如"加载模型"、"输入文字提示词"、"生成图片"），你用线把积木连起来，告诉 AI 按什么顺序干活。

这和普通的"在一个输入框里打字就出图"的工具完全不同。普通工具像一个一键咖啡机，而 ComfyUI 像一台你可以自己调配咖啡豆、水温、萃取时间的半自动咖啡机。

核心一句话：**用流程图的方式控制 AI 图像的生成过程。**

## 二、核心概念

### 1. 工作流（Workflow）

一个工作流就是一张画布上的所有节点和它们之间的连线。

类比：一张菜谱。每张菜谱规定了"先做什么、再做什么、最后做什么"。你可以保存一张菜谱，下次直接加载，不用重新画。

### 2. 节点（Node）

节点是工作流中的最小功能单元。每个节点只做一件事：

- **CheckpointLoader** — 加载一个 AI 大模型文件
- **CLIPTextEncode** — 把文字提示词翻译成 AI 能理解的数学表示
- **EmptyLatentImage** — 创建一张空白画布（定义图片尺寸）
- **KSampler** — 核心节点，真正执行"从噪声到图片"的生成过程
- **VAEDecode** — 把 AI 生成的"潜空间数据"解码成可见的图片
- **SaveImage** — 把最终结果保存到硬盘

类比：厨房里的各种工具——刀负责切，锅负责炒，盘子负责装。每个节点就是一个工具。

### 3. 连线（Connection / Wire）

连线表示数据从一个节点流向另一个节点。

类比：水管。水（数据）从水龙头流出，经过净水器、加热器，最后从出水口出来变成热水。

每个节点有**输入端口**（左边的小圆圈）和**输出端口**（右边的小圆圈）。你把 A 的输出连到 B 的输入，就是把 A 的处理结果交给 B 继续处理。

### 4. 数据类型

ComfyUI 中节点之间传递的不是普通文字或数字，而是特殊的"张量"（Tensor）：

- **MODEL** — 一个训练好的 AI 模型
- **CLIP** — 文本编码器，负责理解文字
- **VAE** — 变分自编码器，负责把图片编码和解码
- **LATENT** — 潜空间数据，是 AI 生成的中间表示（不是肉眼可见的图片）
- **IMAGE** — 肉眼可见的像素图片
- **CONDITIONING** — 条件数据，包含提示词的编码结果

理解这个很重要：**LATENT 不是图片，IMAGE 才是**。KSampler 产出的是 LATENT，必须经过 VAEDecode 才能变成 IMAGE。

### 5. 执行逻辑

ComfyUI 有一个聪明的特性：**只重新执行变化的部分**。

类比：你做了一道菜，发现盐放少了。你不需要从头重新做整道菜，只需要回到加盐那一步，调整后再往下走就行。ComfyUI 也是这样——如果你只改了提示词，它只会重新执行提示词相关的节点，不会重新加载模型。

## 三、第一个工作流：文生图

下面展示一个最简单的"文生图"工作流的连接关系，以及对应的 JSON 格式。

### 3.1 工作流连接关系

```
CheckpointLoader (Simple)
  ├── model ──────────────────────┐
  └── clip ───────────────────────┤
                                  ▼
CLIPTextEncode (prompt: "a cat sitting on a windowsill") ──┐
                                                           ▼
EmptyLatentImage (width: 512, height: 512) ───────────────┼──► KSampler ──► LATENT
                                                           │         (steps: 20, cfg: 7.0)
CLIPTextEncode (prompt: "blurry, low quality") ───────────┘              │
                                                                        ▼
                                                                   VAEDecode ──► IMAGE
                                                                        │
                                                                        ▼
                                                                   SaveImage ──► 输出文件
```

### 3.2 节点参数详解

**CheckpointLoader（加载模型）**

这是第一步。你需要指定一个已经下载好的 `.safetensors` 或 `.ckpt` 模型文件放在 `models/checkpoints/` 目录下。

例如加载 SDXL 模型：
- 文件名：`sdxl_v1.0.safetensors`
- 放在：`ComfyUI/models/checkpoints/sdxl_v1.0.safetensors`
- 节点会自动识别并列出可用模型

**CLIPTextEncode（编码提示词）**

有两个输入端口需要连接：
- `clip` — 来自 CheckpointLoader 的 CLIP 输出
- `text` — 你手写的文字提示词

正向提示词（想要什么）："a cat sitting on a windowsill, sunlight, photorealistic"
负向提示词（不想要什么）："blurry, low quality, deformed"

**KSampler（采样器）**

这是整个工作流的核心。它接收四个输入：

| 参数 | 说明 | 常用值 |
|------|------|--------|
| model | 要用的 AI 模型 | 来自 CheckpointLoader |
| positive | 正向条件 | 来自 CLIPTextEncode（正向提示词） |
| negative | 负向条件 | 来自 CLIPTextEncode（负向提示词） |
| latent_image | 初始潜空间 | 来自 EmptyLatentImage |

关键参数：
- `seed` — 随机种子。相同 seed + 相同输入 = 完全相同的输出。设为 -1 则每次随机
- `steps` — 采样步数。越多越精细，也越慢。SDXL 一般 20-30 步
- `cfg` — 提示词相关性。越高越严格遵循提示词，越低越自由。一般 7.0
- `sampler_name` — 采样算法。常用 `euler`, `ddim`, `dpmpp_2m`
- `scheduler` — 调度器。常用 `normal`, `karras`, `beta`

**EmptyLatentImage（创建空白画布）**

定义输出图片的尺寸：
- `width`：宽度（像素），如 1024
- `height`：高度（像素），如 1024
- `batch_size`：一次生成几张图

注意：SDXL 推荐 1024x1024，SD 1.5 推荐 512x512。

**VAEDecode（解码）**

把 KSampler 产出的 LATENT（不可见的潜空间数据）转换成 IMAGE（可见的图片像素）。

必须连接：
- `samples` — 来自 KSampler 的 LATENT
- `vae` — 来自 CheckpointLoader 的 VAE

**SaveImage（保存图片）**

把最终的 IMAGE 保存到硬盘。

## 四、JSON 工作流文件示例

ComfyUI 的工作流可以保存为 JSON 文件。下面是上面那个文生图工作流的实际 JSON 结构：

```json
{
  "3": {
    "class_type": "CheckpointLoaderSimple",
    "inputs": {
      "ckpt_name": "sdxl_v1.0.safetensors"
    }
  },
  "4": {
    "class_type": "CLIPTextEncode",
    "inputs": {
      "text": "a cat sitting on a windowsill, sunlight, photorealistic",
      "clip": ["3", 1]
    }
  },
  "5": {
    "class_type": "CLIPTextEncode",
    "inputs": {
      "text": "blurry, low quality, deformed",
      "clip": ["3", 1]
    }
  },
  "6": {
    "class_type": "EmptyLatentImage",
    "inputs": {
      "width": 1024,
      "height": 1024,
      "batch_size": 1
    }
  },
  "7": {
    "class_type": "KSampler",
    "inputs": {
      "model": ["3", 0],
      "positive": ["4", 0],
      "negative": ["5", 0],
      "latent_image": ["6", 0],
      "seed": 42,
      "steps": 20,
      "cfg": 7.0,
      "sampler_name": "euler",
      "scheduler": "normal",
      "denoise": 1.0
    }
  },
  "8": {
    "class_type": "VAEDecode",
    "inputs": {
      "samples": ["7", 0],
      "vae": ["3", 2]
    }
  },
  "9": {
    "class_type": "SaveImage",
    "inputs": {
      "images": ["8", 0]
    }
  }
}
```

解读 JSON 中的连接关系：

- `"3"` 是 CheckpointLoader 节点的 ID
- `"clip": ["3", 1]` 表示连接到节点 3 的第 1 号输出端口（CLIP 模型）
- `"model": ["3", 0]` 表示连接到节点 3 的第 0 号输出端口（模型权重）
- `"vae": ["3", 2]` 表示连接到节点 3 的第 2 号输出端口（VAE）
- `"samples": ["7", 0]` 表示连接到节点 7（KSampler）的输出

每个节点都有一个唯一的数字 ID，连线通过 `[节点ID, 端口号]` 来表示。

## 五、进阶：图生图与 ControlNet

### 5.1 图生图（Img2Img）

图生图和文生图的区别在于：不是从空白画布开始，而是从一张已有的图片开始。

连接关系变化：

```
LoadImage（加载已有图片） ──► IMAGE
                                    │
                                    ▼
                               VAEEncode ──► LATENT
                                    │
                                    ▼
                               KSampler（denoise: 0.7）
                                    │
                                    ▼
                               VAEDecode ──► IMAGE
```

关键参数 `denoise`（去噪强度）：
- `1.0` = 完全重新生成（相当于从零开始）
- `0.5` = 保留一半原图特征，生成一半新内容
- `0.3` = 只在原图基础上做微调

### 5.2 ControlNet

ControlNet 让你可以用一张参考图的"结构"来控制生成结果。比如用一张骨架图来控制人物姿势。

```
ControlNetLoader（加载 controlnet 模型） ──┐
                                             ▼
CLIPTextEncode ──► CONDITIONING ──► ApplyControlNet ──► CONDITIONING ──► KSampler
EmptyLatentImage ──► LATENT ──┘
ControlNetApply（条件合并）

ImageOnlyCondition（参考图结构） ──► CONDITIONING
```

常用的 ControlNet 模型：
- **Canny** — 边缘检测，适合控制轮廓
- **Depth** — 深度图，适合控制空间关系
- **OpenPose** — 人体骨架，适合控制人物姿势
- **Tile** — 细节增强，适合高清放大

## 六、常用技巧

### 1. 提示词权重

用括号和数字来控制词语的重要性：

```
(a cat:1.2) sitting on a (windowsill:0.8)
```

- `(词:1.2)` = 这个词重要程度提高 20%
- `(词:0.8)` = 这个词重要程度降低 20%
- 默认权重是 1.1

### 2. 动态提示词（通配符）

用 `{选项1|选项2|选项3}` 语法，每次生成时随机选一个：

```
a {cat|dog|rabbit} sitting on a windowsill
```

每次点击生成，可能是猫、狗或兔子。

### 3. 节点分组（Group）

选中多个节点后按 `Ctrl+G` 可以把它们打包成一个组，方便管理复杂工作流。

### 4. 快捷操作

| 快捷键 | 功能 |
|--------|------|
| Ctrl + Enter | 开始生成 |
| Ctrl + S | 保存工作流 |
| Ctrl + O | 加载工作流 |
| Ctrl + Z / Y | 撤销 / 重做 |
| Ctrl + B | 绕过选中节点（临时禁用） |
| Alt + C | 折叠 / 展开节点组 |
| Space + 拖拽 | 平移画布 |

### 5. 自定义节点（Custom Nodes）

ComfyUI 有大量社区开发的自定义节点，通过 ComfyUI Manager 可以一键安装。常见的有：

- **Impact Pack** — 人脸检测、分割、增强
- **ControlNet Auxiliary** — 更多预处理器（Lineart、SAM 等）
- **IP-Adapter** — 图像提示适配器，用参考图风格迁移
- **Impact Pack** — 批量处理、高级人脸修复

## 七、安装步骤（手动安装）

### 前提条件

- Python 3.12 或 3.13（推荐）
- 有 NVIDIA GPU（建议 8GB 显存以上），也支持 CPU、Apple Silicon、AMD GPU

### 安装流程

```bash
# 1. 克隆仓库
git clone https://github.com/comfyanonymous/ComfyUI.git
cd ComfyUI

# 2. 创建虚拟环境（推荐）
python -m venv venv
source venv/bin/activate   # Linux/Mac
# 或 venv\Scripts\activate  # Windows

# 3. 安装 PyTorch（NVIDIA GPU）
pip install torch torchvision torchaudio \
  --extra-index-url https://download.pytorch.org/whl/cu130

# 4. 安装 ComfyUI 依赖
pip install -r requirements.txt

# 5. 下载模型
# 把 .safetensors 文件放到 models/checkpoints/ 目录下

# 6. 启动
python main.py
```

启动后浏览器打开 `http://127.0.0.1:8188` 即可使用。

### 模型目录结构

```
ComfyUI/
├── models/
│   ├── checkpoints/       # 主模型（SDXL, SD1.5 等）
│   ├── vae/               # VAE 模型
│   ├── clip/              # CLIP 模型
│   ├── controlnet/        # ControlNet 模型
│   ├── lora/              # LoRA 微调模型
│   ├── embeddings/        # 文本嵌入
│   ├── upscale_models/    # 超分辨率模型
│   └── animatediff_models/ # 视频生成模型
├── input/                 # 放入待处理的图片
├── output/                # 生成的图片放在这里
└── custom_nodes/          # 自定义节点
```

## 八、数据流总结

整个图像生成的数据流向可以概括为：

```
文字提示 ──► CLIPTextEncode ──► CONDITIONING（条件）
                                          │
模型 ──► CheckpointLoader ──► MODEL ──────┼──► KSampler ──► LATENT
                                          │          （去噪过程）
画布尺寸 ──► EmptyLatentImage ────────────┘
                                          │
                                      VAE  ──► VAEDecode ──► IMAGE ──► 保存
```

记住两个关键转换：
1. **文字 → CONDITIONING**：CLIP 把人类语言翻译成 AI 能理解的向量
2. **LATENT → IMAGE**：VAE 把 AI 的"内心想法"翻译成人类能看到的图片

## 九、学习路线建议

1. 先跑通一个最简单的文生图工作流（7 个节点）
2. 学会修改提示词、调整 seed、改变图片尺寸
3. 尝试图生图，理解 denoise 参数的作用
4. 学习 ControlNet，用参考图精确控制构图
5. 探索 LoRA，学习如何加载和使用微调模型
6. 尝试视频生成（AnimateDiff）和 3D 模型生成
7. 编写自定义节点或用 API 自动化工作流

## 十、常见误区

1. **以为 LATENT 就是图片** — LATENT 是 AI 的内部表示，必须经 VAE 解码才能看到
2. **steps 越高越好** — 超过一定阈值后视觉效果提升很小，但时间大幅增加
3. **CFG 越高越好** — CFG 太高会导致画面过饱和、伪影增多，一般 5-8 最佳
4. **忽略负向提示词** — 负向提示词对排除不想要的元素非常重要
5. **不保存工作流** — 每次调出好图后务必保存 JSON，否则下次无法复现
