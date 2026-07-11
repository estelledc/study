---
title: 'ComfyUI — 节点式扩散模型 GUI'
来源: 'https://github.com/comfyanonymous/ComfyUI'
日期: '2026-05-31'
分类: '数据科学与 AI'
难度: '中级'
---

## 是什么

ComfyUI 是一个**节点式扩散模型推理界面**：把 Stable Diffusion / Flux / Hunyuan 这类扩散模型每一步（加载权重、文本编码、采样、VAE 解码）拆成可视化方块，你拖线把它们连起来就成了一张工作流图。日常类比：像音频里的**模块化合成器**——AUTOMATIC1111 webui 是封装好的电子琴，按一个键出一个声；ComfyUI 是 Eurorack 机柜，你自己接振荡器到滤波器到包络，能做出别人做不出来的声音。

最简单的『文生图』在 ComfyUI 里长这样：

```
[Load Checkpoint] --MODEL--> [KSampler] --LATENT--> [VAE Decode] --IMAGE--> [Save Image]
                  --CLIP-->  [CLIP Text Encode (positive)] --CONDITIONING--> [KSampler]
                  --CLIP-->  [CLIP Text Encode (negative)] --CONDITIONING--> [KSampler]
                  --VAE-->   [VAE Decode]
                              [Empty Latent Image] --LATENT--> [KSampler]
```

7 个节点、几条线，你就能看见『一次出图』在底层到底发生了什么。

## 为什么重要

不理解 ComfyUI，下面这些事会卡住你：

- 为什么 Stability AI 官方发 SDXL / SD3 的参考实现都用 ComfyUI workflow 而不是 Python 脚本——节点图既是程序也是文档
- 为什么社区里『复现一张图』可以靠**拖一张 PNG 进画布**就完成——workflow JSON 嵌在 PNG 元数据里
- 为什么 AUTOMATIC1111 webui 用户多但 ComfyUI 跑得更深：黑盒 vs 白盒的两条路
- 为什么 ControlNet / IP-Adapter / AnimateDiff 这些复杂技巧在 ComfyUI 里只是『多接两根线』，在 webui 里要装插件改参数

## 核心要点

记 **3 件套 + 1 张图**：

1. **节点（Node）= 一段函数**：每个方块本质是一个 Python 类，声明 `INPUT_TYPES`（输入口和类型）、`RETURN_TYPES`（输出口和类型）、`FUNCTION`（执行的方法）。运行时拓扑排序后顺序调用——不神秘。

2. **类型化端口**：边的两端必须类型一致，主要 5 种：`MODEL`（U-Net 主体）、`CLIP`（文本编码器）、`VAE`（潜空间编解码器）、`LATENT`（4 通道 1/8 分辨率张量，1/8 是 VAE 的固定下采样比例——512×512 图对应 64×64 latent）、`IMAGE`（普通 RGB 图）。连错线 UI 直接拒绝，比写代码 debug 快。

3. **图执行器有缓存**：改一个节点只重跑它的下游，上游缓存复用。所以微调 prompt 不用重新加载 8GB checkpoint——这是节点式比 webui 重启快的根本原因。

4. **`custom_nodes/` 文件夹**：你写一个 Python 类，放进这个文件夹，重启就出现在右键菜单里。**没有模板、没有注册表、没有打包格式**——蠢到极点的扩展机制是生态爆炸的真正原因。

## 实践案例

### 案例 1：拆开『一次出图』看清楚每一步

上面那张图的 7 个节点，对应扩散模型推理的真实步骤：

1. **Load Checkpoint**：把 `.safetensors` 文件拆成 `MODEL` / `CLIP` / `VAE` 三个输出口
2. **CLIP Text Encode (positive)**：把『a cat on a table』编码成 `CONDITIONING` 张量
3. **CLIP Text Encode (negative)**：把『blurry, low quality』也编码（用于负向引导）
4. **Empty Latent Image**：造一个 4×64×64 的高斯噪声 `LATENT`（对应 512×512 输出）
5. **KSampler**：拿 model+positive+negative+latent+seed+steps+cfg，跑 N 步去噪，吐出去噪后的 `LATENT`
6. **VAE Decode**：4×64×64 latent 解码成 3×512×512 `IMAGE`
7. **Save Image**：写盘，文件名里嵌入 workflow JSON

每一根线传递的张量形状、含义都在 UI 上看得见。这是别的工具给不了的教学价值。

### 案例 2：加 LoRA 只是『中间插一个节点』

要在原 pipeline 里挂一个『二次元风格 LoRA』，做法是：

```
[Load Checkpoint] --MODEL--> [Load LoRA] --MODEL--> [KSampler]
                  --CLIP-->  [Load LoRA] --CLIP-->  [CLIP Text Encode ...]
```

**LoRA 节点夹在 Checkpoint 和下游之间**，把 MODEL 和 CLIP 都『改写』一遍再传下去。叠两个 LoRA 就再插一个。webui 里这是 prompt 里塞 `<lora:xxx:0.8>` 的语法糖；ComfyUI 直接把语法糖背后的图结构画出来。

### 案例 3：分享 workflow = 分享一张图

把生成好的 PNG 拖回 ComfyUI 画布，节点图和参数全部还原。原理：保存图片时把 workflow JSON 嵌进 PNG 的 `tEXt` chunk，加载时读出来重建。这让社区分享门槛比『贴代码 + 装环境』低一个数量级——你在 OpenArt / Civitai 看到的那张精致工作流图，下载 PNG 直接用。

### 案例 4：自己写一个节点有多简单

新建一个文件 `custom_nodes/my_invert.py`：

```python
class InvertImage:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"image": ("IMAGE",)}}
    RETURN_TYPES = ("IMAGE",)
    FUNCTION = "run"
    CATEGORY = "image/filters"
    def run(self, image):
        return (1.0 - image,)

NODE_CLASS_MAPPINGS = {"InvertImage": InvertImage}
```

重启，右键菜单 `image/filters` 下就多了一个『InvertImage』节点。**没有插件 manifest、没有版本号、没有打包**——一个文件、一个类、一个字典登记，整个生态就是这样长起来的。

### ComfyUI vs AUTOMATIC1111 vs diffusers

| 维度 | ComfyUI | AUTOMATIC1111 | diffusers |
|---|---|---|---|
| 形态 | 节点画布 | 表单 webui | Python 库 |
| 暴露程度 | 全 pipeline 可见 | 隐藏在按钮后 | 调 API |
| 学习曲线 | 中（要懂 latent） | 低（点就行） | 高（要写代码） |
| 复杂工作流 | 强（连线即可） | 靠插件凑 | 自己写循环 |
| 分享 | 拖 PNG 复现 | 贴 prompt+settings | 贴代码 |

## 踩过的坑

1. **positive/negative 两个口接反**：CLIP Text Encode 输出都是 `CONDITIONING`，类型相同 UI 不拦你；接反后正面提示词当负面用，出图全是『模糊低质』。盯紧 KSampler 上 positive 和 negative 两根线。

2. **checkpoint 换了 VAE 没换**：SDXL 的 fp16 VAE 有数值溢出 bug，用 SD1.5 的 VAE 解 SDXL latent 颜色会发灰。专门下个 `sdxl-vae-fp16-fix.safetensors` 接到 VAE Decode 上。

3. **`custom_nodes/` 装多了启动慢且会冲突**：每个第三方节点包都 import 自己的 Python 依赖，30 个包启动 30 秒起步，且不同包的 PyTorch / xformers 版本互相打架。装 ComfyUI-Manager 用它管，别手动 git clone。

4. **workflow JSON 跨版本断线**：作者重构节点时输入顺序或名字一改，老 workflow 加载会出现一堆红线。导入失败先看右下角错误日志，常见办法是把对应节点删了重新右键加。

5. **直接 preview latent 是噪声**：LATENT 是 4×H/8×W/8 的张量，不是图。要看中间结果必须接 VAE Decode；新手常以为 KSampler 输出能直接 preview，出来全是雪花。

6. **sampler 和 scheduler 是两个轴**：KSampler 节点上 `sampler_name`（euler / dpmpp_2m_sde / heun ...）控制单步去噪算法，`scheduler`（normal / karras / exponential ...）控制 N 步噪声表。不是一个下拉，是两个；换 sampler 不改 scheduler 出图差别可能很大。

## 适用 vs 不适用场景

**适用**：

- 想理解扩散模型 pipeline 每一步在做什么——节点图就是最好的教科书
- 复杂工作流：多 LoRA 叠加 / ControlNet / IP-Adapter / 视频帧间一致性
- 批量出图、参数扫描——把 seed/prompt 接到 PrimitiveNode 用 batch 跑
- 本地部署 Stable Diffusion / Flux / Hunyuan 等开源扩散模型，4GB 显卡也能 lowvram 跑

**不适用**：

- 只想点一下出图、不学概念 → 用 AUTOMATIC1111 / Forge / Fooocus
- 云端 SaaS 出图 → 用 Replicate / fal.ai / Civitai 在线服务
- 训练（不只是推理） → 用 kohya_ss 或 diffusers + [[accelerate]]
- 非扩散模型（LLM / 检测 / 分类） → 不适用，ComfyUI 专攻扩散

## 历史小故事（可跳过）

- **2023-01**：开发者 comfyanonymous 首版 push，slogan 就是『把 SD pipeline 透明化』
- **2023-07**：SDXL 发布，Stability AI 官方推荐 ComfyUI 作为参考实现，第一次破圈
- **2023-08**：第三方 ComfyUI-Manager 发布，节点生态进入指数增长
- **2024**：视频模型（AnimateDiff / SVD / CogVideoX）社区视频出图首选 ComfyUI
- **2024-08**：Flux.1 开源当天 ComfyUI 就有可用 workflow——生态响应速度的胜利
- **2025**：ComfyUI Inc 成立，推出桌面版 + 云版

## 学到什么

1. **暴露 > 隐藏**：黑盒按钮型 UI 用户多，白盒节点型 UI 用户跑得更深——目标群不同
2. **扩展机制要够蠢**：custom_nodes 就是 Python 类放进文件夹，零模板，所以生态爆炸
3. **类型化端口节省调试**：MODEL / CLIP / VAE / LATENT 四种类型让连错线肉眼可见
4. **JSON workflow 即文档**：分享一张 PNG 等于分享一篇教程，门槛比贴代码低一个数量级

## 延伸阅读

- 官方 examples 仓库（最佳起点）：[comfyanonymous/ComfyUI_examples](https://github.com/comfyanonymous/ComfyUI_examples)
- 视频教程：Matteo Spinelli (latentvision) 的 YouTube 系列，从最基础节点连法讲起
- 节点管理器：[ltdrdata/ComfyUI-Manager](https://github.com/ltdrdata/ComfyUI-Manager)
- Workflow 库：OpenArt / Civitai 上拖 PNG 即复现
- [[pytorch]] —— ComfyUI 全部基于 PyTorch，节点本质就是 nn.Module 调用
- [[accelerate]] —— 同样解决『模型大于显存』，但 ComfyUI 自己写了 lowvram/offload 不依赖 Accelerate

## 关联

- [[pytorch]] —— ComfyUI 节点底层全是 PyTorch 算子调用
- [[accelerate]] —— 大模型 offload 思路相似，ComfyUI 走自研路线
- [[stable-diffusion]] —— ComfyUI 最常见的工作流就是把 Stable Diffusion pipeline 拆成节点
- [[stable-diffusion-webui]] —— AUTOMATIC1111 代表黑盒表单路线，正好和 ComfyUI 的白盒节点路线对照
- [[flux]] —— Flux.1 等新扩散模型发布后，ComfyUI 常是社区最早可用的本地 workflow
- [[hindley-milner]] —— 不直接相关，但『类型化端口阻挡接错线』和静态类型阻挡 bug 是同一种思想

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[classifier-free-guidance-2022]] —— Classifier-Free Guidance — 让扩散模型自己听懂条件
- [[blender]] —— Blender — 全流程 3D 创作套件
- [[fooocus]] —— Fooocus — 把 SDXL 做成傻瓜机
- [[handbrake]] —— HandBrake — 把视频转码变成点两下鼠标的事
- [[invokeai]] —— InvokeAI — 工业级 Stable Diffusion 工具
- [[meshroom]] —— Meshroom — AliceVision 节点式 GUI
- [[open-sora]] —— Open-Sora — 把 Sora 路线开源对标的视频生成项目
- [[react-flow]] —— React Flow / xyflow — 节点编辑器框架
- [[sam2]] —— SAM 2 — 图像和视频都能抠轮廓的通用分割模型
- [[stable-diffusion-webui]] —— AUTOMATIC1111 SD WebUI — 把 Stable Diffusion 装进浏览器
- [[ultralytics]] —— Ultralytics — YOLOv8/v11 易用 SDK
