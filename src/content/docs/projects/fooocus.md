---
title: 'Fooocus — 把 SDXL 做成傻瓜机'
来源: 'https://github.com/lllyasviel/Fooocus'
日期: '2026-05-31'
分类: '数据科学与 AI'
难度: '入门'
---

## 是什么

Fooocus 是一个**让你输入一句 prompt 就能出 SDXL 图的 Gradio 应用**，是 AUTOMATIC1111 webui 的极简化替代品。日常类比：傻瓜相机 vs 单反——webui 是单反，几十个旋钮要你自己调；Fooocus 是傻瓜机，按快门就出片，曝光、对焦、白平衡作者帮你定好。

最简使用是这样的：

```bash
python entry_with_update.py
```

浏览器打开后，你只看到一个 prompt 输入框、几个风格按钮、一个 Generate。点下去出一张 1024×1024 的 SDXL 图——采样器、CFG、scheduler 你一个也不用选。

作者 lllyasviel（张吕敏）是 ControlNet 论文一作、Forge 主力维护者、IC-Light 作者——AI 绘画工程界少数能既写 paper 又写 UI 的人。

## 为什么重要

不理解 Fooocus，下面这些事讲不清：

- 为什么 SDXL 出来后会同时存在 webui、ComfyUI、Fooocus 三种主流前端——它们代表「暴露全部参数」「拆成节点图」「藏起所有参数」三种产品哲学
- 为什么 Image Prompt（参考图引导）这个功能在 Fooocus 里是默认标签页，在 webui 里要装扩展才有
- 为什么社区会冒出 RuinedFooocus、SimpleSDXL、Fooocus-MRE 这一串 fork——Fooocus 的「强默认值」框架被认为是 SDXL 时代的一种参考实现
- 为什么 ControlNet 作者会同时维护「藏起参数」（Fooocus）和「极致暴露」（Forge）两个项目——他对应的是不同用户

## 核心要点

记 **3 件套 + 1 个槽点**：

1. **强默认值代替旋钮**：采样器固定 `dpmpp_2m_sde_gpu`、scheduler 固定 `karras`、CFG 落在约 4.0–7.0——这些都是 lllyasviel 调出来的甜点值，主界面看不到也不让随便改。早期版本还默认走 Base→Refiner（约第 80% 步切换）；自 2.1.864 起默认 preset 已关掉独立 Refiner，只留单模型路径。这种「我替你定」是 Fooocus 和 webui 哲学最大的差别。

2. **Prompt 自动扩写（`fooocus_expansion`）**：一个约 600MB 的 GPT-2 small fine-tune 模型。输入 `a cat`，它扩成 `a cat, sitting on a wooden table, soft golden light, 8k, intricate details, masterpiece`——把 Midjourney 用户养成的「写一句就够」习惯搬到 SDXL。

3. **底层用 `ldm_patched` 跑扩散**：Fooocus 不自己写推理代码，把 ComfyUI 的执行引擎 fork 一份魔改，叫 `ldm_patched`。所以 Fooocus 和 ComfyUI 底层是同一套，只是 Fooocus 锁死了 workflow，不让你改节点图。

4. **槽点：默认 checkpoint 不是官方 SDXL**——现行默认是社区微调的 `juggernautXL`（写实/人像更稳），动漫要换 `animaPencilXL` preset 或手动换 `ponyDiffusion` / `animagine`。新手第一次发现「我画的二次元怎么这么奇怪」就在这里。

## 实践案例

### 案例 1：第一次跑通需要绕开的坑

官方 README 说「双击 run.bat」就能用。现行默认 preset（General）首次启动主要做这些事：

1. 自动下载 `juggernautXL_v8Rundiffusion` checkpoint（约 6.6GB）到 `models/checkpoints/`
2. 自动下载 `fooocus_expansion`（约 600MB）以及 VAE approx、默认 LoRA 等辅助文件
3. **不再默认拉独立 SDXL Refiner**（早期版本会再下约 6GB；现在 Refiner 栏默认 `None`）

国内网络通常拉不动 HuggingFace。手动放权重时要严格按这个目录结构：

```
models/
  checkpoints/juggernautXL_v8Rundiffusion.safetensors
  loras/sd_xl_offset_example-lora_1.0.safetensors
  vae_approx/xlvaeapp.pth
  prompt_expansion/fooocus_expansion/pytorch_model.bin
```

放错路径或文件名 Fooocus 会再去网上拉，把刚下的覆盖掉。

### 案例 2：Image Prompt 标签页是怎么工作的

切到 Image Prompt 标签，上传一张参考图，再写 prompt `a girl in this style`。Fooocus 内部做：

1. 用 CLIP Vision 把参考图编码成 image embedding
2. 把 image embedding 当成额外的 conditioning 喂给 U-Net（IP-Adapter 思想）
3. 同时 prompt 也走 CLIP Text 编码、合并两路 conditioning

这是 Fooocus 内置的功能，等价于 webui 装 IP-Adapter 扩展 + ControlNet 的组合。

### 案例 3：风格按钮的本质

UI 上有 200 多个风格按钮：Cinematic、Anime、Pixel Art、Photographic 等。点 Cinematic 实际做的事是：

```
final_prompt = user_prompt + ", cinematic still, emotional, harmonious, vignette, 4k epic detailed"
negative   += ", cartoon, anime, sketch"
```

就是字符串拼接——但 lllyasviel 把这些后缀模板调到「点完就好看」的程度。整个 `sdxl_styles/` 目录就是 200 多个 JSON 文件，每个文件就是一组「正向后缀 + 负向后缀」。换句话说，**Fooocus 的风格库本质是一份调好的 prompt 词典，不是模型权重的差别**。

### 案例 4：可选的 Base + Refiner 两阶段（非现行默认）

SDXL 早期常把出图拆两段：Base 负责粗结构，Refiner 修细节。Fooocus 仍支持这条路径，但 **现行默认 preset 已关掉独立 Refiner**；若你在 Advanced 里手动选 Refiner，常见是 30 步 / 切换点 80%：

1. 步 1-24 用 Base U-Net 跑 `dpmpp_2m_sde_gpu` 采样
2. 第 24 步把 latent 切给 Refiner U-Net
3. 步 25-30 用 Refiner 继续采样，相当于「最后两成步数交给修边师傅」
4. 出完 latent 用 SDXL VAE 解码到 1024×1024 RGB

webui 里要手动选「Refiner checkpoint + 切换点 + 切换方式」；Fooocus 把连续采样切换藏进 `ldm_patched`，你只需选模型和切换比例。对 `juggernautXL` 这类后期微调，关 Refiner 往往几乎看不出差别。

## 踩过的坑

1. **Advanced 选项默认折叠**：右上角小开关打开才能改采样器、CFG、step 数。新手以为「不让改」就放弃了，其实给了出口
2. **prompt expansion 默认开**：导致「我写啥它都加 8k masterpiece」。画极简风格、抽象风格要去 Advanced 关掉
3. **`ldm_patched` 是 ComfyUI 老版本的 fork**：跟现在 ComfyUI 不兼容，所以 ComfyUI 的 `custom_nodes` 不能直接搬过来
4. **macOS MPS 后端比 CUDA 慢很多**：M2 Max 出一张 1024×1024 大约要 60 秒，4090 大约 4 秒。预期不要按 NVIDIA 来
5. **别按早期教程强行开 Refiner**：现行默认已是单模型；对 `juggernautXL` 再挂官方 SDXL Refiner 往往收益很小还多占显存。真要省时间，优先减总 step 或开 Extreme Speed，而不是纠结 Refiner 开关

## 适用 vs 不适用场景

**适用**：

- 想要 SDXL 出图但不想学 webui 几十个参数的新手
- 快速出营销/封面/插画原型，prompt 写得糙也能有可用结果
- 想要 Midjourney 风格的本地化版本（prompt expansion + 风格按钮约等于 MJ 的 prompt 加工管线）
- Mac M 系列用户——Fooocus 对 MPS 后端调得比 webui 顺
- 想对照 webui，演示「可选 Base+Refiner 两阶段」和「强默认单模型」差在哪

**不适用**：

- 想要精确控制每个参数 → 用 webui 或 ComfyUI
- 复杂 workflow（多 ControlNet 串联、AnimateDiff 动画）→ 用 ComfyUI
- 训练 LoRA、微调 checkpoint → Fooocus 只做推理
- SD 1.5 模型 → Fooocus 设计上只优化 SDXL，1.5 不在目标里

## 历史小故事（可跳过）

- **2022-08**：Stable Diffusion 1.4 公开，AUTOMATIC1111 webui 同期出现，奠定「暴露所有参数」的范式
- **2023-02**：ControlNet 论文（lllyasviel 一作）让控制式生成成为主流
- **2023-07**：SDXL 1.0 权重发布，参数从 1.5 的 0.86B 涨到 3.5B，对显存和默认参数要求更高
- **2023-08**：lllyasviel 发布 Fooocus，主张「默认值优先」；同月 stars 破 10k
- **2024 起**：作者主力转去 Forge（webui 性能 fork）和 IC-Light，Fooocus 进入维护模式但仍出版本

## 学到什么

1. **强默认值是一种产品哲学**——同一个底层模型可以做出「全部参数暴露」「节点图编排」「藏起所有参数」三种完全不同的产品
2. **作者经验值如何固化进 UI**——lllyasviel 把自己调出来的甜点值（采样器/scheduler/CFG/refiner 切换）写死在代码里，新手白嫖到了 ControlNet 作者的 know-how
3. **前端在分化、后端在收敛**——Fooocus、ComfyUI、SwarmUI 都跑同一套 ComfyUI 引擎（Fooocus 是 fork），扩散模型生态的执行层已经统一
4. **prompt expansion 是工程化的 prompt engineering**——不靠用户写好 prompt，靠一个小模型自动补成长描述

## 延伸阅读

- 项目 GitHub README：[lllyasviel/Fooocus](https://github.com/lllyasviel/Fooocus)（带大量截图，解释默认值为什么是这些）
- 作者主页：[lllyasviel.github.io](https://lllyasviel.github.io)（看 ControlNet / Forge / IC-Light 三个相关项目）
- ComfyUI 节点引擎对照：[[comfyui]] —— Fooocus 后端 `ldm_patched` 的源头
- AUTOMATIC1111 webui：[[stable-diffusion-webui]] —— Fooocus 要替代的目标，对照看产品哲学差异

## 关联

- [[stable-diffusion-webui]] —— 暴露全部参数的代表，Fooocus 的反面教材
- [[comfyui]] —— Fooocus 后端 `ldm_patched` 的来源
- [[diffusers]] —— HuggingFace 扩散库，Fooocus 没用它而是 fork ComfyUI
- [[gradio]] —— Fooocus UI 框架，和 webui 同一套
