---
title: 'ComfyUI 零基础入门 —— 用连线代替写代码'
来源: 'https://github.com/comfyanonymous/ComfyUI'
日期: '2026-06-13'
分类: 其他
子分类: ai-tools
provenance: pipeline-v3
---

## 一句话认识 ComfyUI

ComfyUI 是一个**用连线代替写代码的 AI 工具**：它把图像生成的每一步拆成小方块（叫"节点"），你用鼠标把方块连起来，就能让电脑画出你想要的图片。不需要会写 Python，但学会了比会写 Python 还能做更多事。

## 日常类比：乐高积木

想象你有两块乐高积木——一块写着"加载图片"，一块写着"把图片变黑白色"。

- 传统工具像**一次性打印店**：你说"我要一张黑白色的猫"，店员直接给你一张图。你不知道中间发生了什么，也不能把黑白色步骤拆开加别的效果。
- ComfyUI 像**乐高套装**：你把"加载图片"积木和"变黑白色"积木用卡扣连起来，搭完告诉它"开始"，它就从第一块积木开始，一块接一块跑完。中间任何一步你都能停下来看一眼结果，也能随时拆掉某块积木换别的。

扩散模型（Stable Diffusion、Flux 这些）的出图过程本来就是一步接一步的——先理解文字，再脑子里想象一个模糊的影子，再一点点擦除噪点变得清晰。ComfyUI 就是把每一步变成一块积木，让你看见整条流水线。

## 核心概念 1：节点（Node）

节点是 ComfyUI 里最小的功能单元。每个节点有**输入口**（左边的小圆点）和**输出口**（右边的小圆点）。

最简单的节点长这样：

```
[  CLIP Text Encode  ]
  左口: text ──────  你输入提示词的地方
  右口: CONDITIONING ──  输出给下一个节点
```

当你把一个节点拖到画布上，右键选 `CLIP Text Encode`，它就有三个口：一个 `text` 输入口让你打字，一个 `CONDITIONING` 输出口把结果送出去。

**关键理解**：节点不是按钮，它是函数。你给它输入，它给你输出。和写代码的区别在于——你不用管语法，连上线就行。

## 核心概念 2：数据流（Data Flow）

ComfyUI 里流动的不是像素，而是一种叫**张量（Tensor）**的纯数字方块。最常见的五种数据类型在 UI 上用不同颜色的线表示：

- 🔵 MODEL（紫色线）—— 扩散模型的主体，也叫 U-Net，负责"擦除噪点"这个核心动作
- 🟢 CLIP（绿色线）—— 文本编码器，把文字变成模型能看懂的数字
- 🟠 VAE（橙色线）—— 图像编解码器，负责"把脑子里的模糊影子变成真实像素"
- 🟣 LATENT（紫色点线）—— 4 通道的压缩图像，分辨率是真实图像的 1/8。512×512 的图片在 latent 里只有 64×64
- 🔴 IMAGE（红色线）—— 普通的 RGB 图像，肉眼能直接看到的样子

你连错线的话，UI 不会让你通过——类型不匹配就像水管口径不对，接不上去。这比写代码报一堆错要好调试得多。

## 核心概念 3：工作流（Workflow）

工作流就是你搭好的整张节点图。按 `Ctrl + Enter`，ComfyUI 从第一个节点开始执行，数据沿着线流动，经过每个节点时每个节点都跑一遍自己的函数，最后输出一张图。

执行时它很聪明：**只跑你改了的部分**。你改了一个提示词，它不会重新加载模型，只会重跑 CLIP Text Encode 及其下游。这在跑大图时能省大量时间。

## 第一个例子：最简文生图工作流

下面是一张完整的"文字描述 → 生成图片"的工作流。你只需要 7 个节点：

```
[ Load Checkpoint ]    ← 加载模型文件（一个 safetensors 文件约 2-7GB）
       ├─ MODEL ────────→ [ KSampler ]          ← 核心：去噪采样
       ├─ CLIP   ────────→ [ CLIP Text Encode ]  ← 正向提示词
       │                    │     │
       │                    ↓     │
       │              [ CLIP Text Encode ]  ← 反向提示词
       │                    │     │
       ├─ VAE   ────────────┘     │
       │                          │
       │                    [ Empty Latent Image ]  ← 造一张空白 canvas
       │                          │     │
       └──────────────────────────┘     │
                                [ VAE Decode ]  ← 把 latent 变回真实图片
                                [ Save Image ]   ← 保存
```

用文字描述每一步发生了什么：

1. **Load Checkpoint**：把一个 `.safetensors` 模型文件拆成三块——MODEL（负责画图）、CLIP（负责读文字）、VAE（负责解码图像）。这三块从同一个文件来，但进入不同的线路。
2. **CLIP Text Encode × 2**：一个接正向提示词（"a cat sitting on a windowsill, golden hour lighting"），一个接反向提示词（"blurry, bad anatomy"）。它们把文字编码成 CONDITIONING 张量送给 KSampler。
3. **Empty Latent Image**：造一个 4 通道、64×64 的 latent 张量（对应最终 512×512 的像素图）。初始内容是纯噪声。
4. **KSampler**：这是整个工作流的心脏。它拿到模型、正向/反向提示词、噪声 latent、步数（steps）、随机种子（seed），然后开始一步步"擦除噪点"。每一步它先听 CLIP 的提示词，然后用 MODEL 算一下"往哪个方向擦能更像描述的东西"。默认 20 步，每步大约 0.1-0.5 秒。
5. **VAE Decode**：KSampler 输出的是 latent（4 通道、64×64），人看不懂。VAE 把它解码成 3 通道、512×512 的真实像素图像。
6. **Save Image**：把图存到硬盘。

## 第二个例子：自己写一个自定义节点

ComfyUI 的扩展机制极其简单——你写一个 Python 文件放进 `custom_nodes/` 文件夹，重启就能看到。不需要模板、不需要打包、不需要注册。

下面写一个"把图片转成黑白"的节点：

```python
# 文件名：custom_nodes/bw_filter.py

class BlackWhiteFilter:
    # INPUT_TYPES 告诉 UI：这个节点需要什么输入
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),       # 接收 IMAGE 类型的数据
                "threshold": ("FLOAT", {   # 一个浮点滑块，默认 0.5
                    "default": 0.5,
                    "min": 0.0,
                    "max": 1.0,
                    "step": 0.01
                })
            }
        }

    # RETURN_TYPES 告诉 UI：这个节点输出什么
    RETURN_TYPES = ("IMAGE",)
    # FUNCTION 告诉 UI：执行哪个方法
    FUNCTION = "apply"
    # CATEGORY 决定它出现在右键菜单的哪个分组
    CATEGORY = "image/filters"

    # 实际执行逻辑
    def apply(self, image, threshold):
        import torch
        # image 是一个 PyTorch 张量，形状 [batch, height, width, channels]
        # 先转成灰度：用 RGB 的权重 0.2989, 0.5870, 0.1140
        gray = (image[:, :, :, 0:1] * 0.2989 +
                image[:, :, :, 1:2] * 0.5870 +
                image[:, :, :, 2:3] * 0.1140)
        # 再按 threshold 二值化
        bw = (gray > threshold).float()
        return (bw,)

# 这个字典把节点名映射到类，ComfyUI 靠它发现节点
NODE_CLASS_MAPPINGS = {
    "BlackWhiteFilter": BlackWhiteFilter
}
```

写完存为 `custom_nodes/bw_filter.py`，然后**重启 ComfyUI**。重启后右键菜单 `image/filters` 下就会出现 `BlackWhiteFilter`。

把它连到工作流里：

```
[ Load Checkpoint ] → ... → [ Save Image ]
                          ↓
                    [ BlackWhiteFilter ]  ← 你刚写的节点
                          ↓
                    [ Save Image ]       ← 存黑白版本
```

不需要改任何现有节点，不需要重启服务器以外的任何操作。这就是 ComfyUI 生态为什么能爆炸式增长——门槛低到几乎为零。

## 为什么 ComfyUI 这么受欢迎

理解 ComfyUI 受欢迎，可以从三个层次看：

**第一层：白盒。** 大多数 AI 工具把过程藏在你看不见的面板后面。ComfyUI 把每一步摊开在你眼前。你不知道扩散模型怎么工作的？拉一张图出来，看工作流——7 个节点、几条线，模型推理的真实过程一目了然。

**第二层：可组合。** ControlNet、IP-Adapter、AnimateDiff 这些复杂功能在别的工具里要装一堆插件、改一堆参数。在 ComfyUI 里只是多拖几个节点、多连几根线。因为每个功能本身就是一个节点，节点之间通过标准类型连接，可以像乐高一样无限组合。

**第三层：可分享。** 你画好的一张图，保存时 workflow JSON 被嵌进了 PNG 文件的元数据里。把这张 PNG 发给别人，对方拖进 ComfyUI 就能 100% 还原你的工作流——包括所有节点参数和随机种子。分享门槛从"写教程 + 发代码 + 解释环境"降到了"发一张图"。

## 常见困惑（零基础必看）

**LATENT 是什么？** Latent 是"潜空间"的缩写。VAE 把 512×512×3 的图像压缩成 4×64×64 的数字方块。4 个通道不是颜色通道，是 4 个抽象特征图。你看不懂的，但模型处理得更快。KSampler 在 latent 空间里操作，最后 VAE Decode 再变回像素。

**为什么要有正向和反向提示词？** 模型学习时看到"一只猫在窗台上"的图片，也会看到"模糊、畸形"这种标签的图片。正向提示词告诉它"往这个方向靠"，反向提示词告诉它"别往那个方向靠"。CFG 值（分类器自由引导）决定反向提示词的力度——CFG 3 几乎不听反向提示词，CFG 10 反向提示词影响极大。

**seed 有什么用？** seed 决定了初始噪声的样子。同一张工作流、同一个提示词，换 seed 就出不同的图。锁住 seed = 完全复现。

## 快速上手步骤

1. 安装：去 [comfy.org/download](https://www.comfy.org/download) 下桌面版（最简单），或者 `git clone` 后用 `pip install -r requirements.txt` 装
2. 放模型：把 `.safetensors` 文件放进 `models/checkpoints/`
3. 启动：双击 `ComfyUI.exe` 或运行 `python main.py`
4. 打开浏览器：访问 `http://127.0.0.1:8188`
5. 右键菜单拖入 `Load Checkpoint` → `KSampler` → `VAE Decode` → `Save Image`，连线
6. 在 Load Checkpoint 的模型下拉框选你放的文件
7. 在 CLIP Text Encode 的 text 口打一句提示词
8. `Ctrl + Enter` 出图

## 延伸阅读

- 官方示例工作流：[comfyanonymous/ComfyUI_examples](https://comfyanonymous.github.io/ComfyUI_examples/) —— 从文生图到视频到 3D，每种能力都有现成模板
- ComfyUI-Manager：[ltdrdata/ComfyUI-Manager](https://github.com/ltdrdata/ComfyUI-Manager) —— 装第三方节点的包管理器，别手动 git clone 了
- YouTube 教程：Matteo Spinelli (latentvision) 的系列视频，从零基础讲到高级工作流
- 社区工作流分享：Civitai 和 OpenArt 上搜"workflow"下载 PNG，拖进 ComfyUI 直接学习

## 学到什么

1. **可视化比文字更接近理解** —— 节点图是一张"能跑的图"，比任何文字教程都更能让你看懂扩散模型的工作方式
2. **低门槛 = 高生态** —— 自定义节点的写法规则只有一页纸，任何人写个 Python 函数就能变成可复用的节点
3. **类型系统减少挫败感** —— 五种端口类型、颜色编码的线，新手不会犯"接错类型"的错误
4. **可复现性是信任的基础** —— seed + PNG 内嵌 workflow = 任何人能 100% 复现任何一张图
