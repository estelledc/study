---
title: 'AUTOMATIC1111 SD WebUI — 把 Stable Diffusion 装进浏览器'
来源: 'https://github.com/AUTOMATIC1111/stable-diffusion-webui'
日期: '2026-05-31'
分类: '数据科学与 AI'
难度: '入门'
---

## 是什么

AUTOMATIC1111 SD WebUI 是一个**让你在浏览器里点几下就能跑 Stable Diffusion 的 Python 程序**。日常类比：相机店给你的傻瓜机——你按快门，它替你算光圈/快门/ISO；你写一句 prompt，它替你接 U-Net、CLIP、VAE、采样器、调度器一整条管线。

技术上它是一个 **Gradio 应用**：Python 写 UI 控件（输入框、滑块、按钮），框架自动生成浏览器前端 + WebSocket 通信。你跑：

```bash
python launch.py
```

浏览器开 `127.0.0.1:7860`，就有一个能出图的 webui。

2022 年 8 月 22 日 Stable Diffusion 1.4 权重公开的**同一天**，匿名作者 AUTOMATIC1111 就把 Gradio 入口推上了 GitHub——这是把扩散模型从「会写 PyTorch 的人才能玩」变成「装个 Python 就能玩」的关键一步。

## 为什么重要

不理解 SD WebUI，下面这些事讲不清：

- 为什么 GitHub 上一个 AI 工具能有 **~164k stars / ~30.5k forks**——它定义了 2022-2024 普通人接触扩散模型的默认入口
- 为什么 Civitai 上每个模型卡都标「webui 兼容」——目录结构、文件名、扩展名约定都是这个仓库订下的
- 为什么 ControlNet / LoRA / Dreambooth 这些 paper 一出来，**几天内**就有 webui 扩展跑得动——`extensions/` 目录的极简扩展机制
- 为什么 ComfyUI / Forge / sd.next / InvokeAI 这些后起之秀都要先跟 webui 兼容再谈差异化——它是事实标准

## 核心要点

记 **3 件套 + 1 个槽点**：

1. **Gradio 把 Python 函数变成 UI**：你写 `gr.Textbox()` + `gr.Button(fn=my_func)`，框架自动生成 HTML、连 WebSocket、处理 form submit。webui 的每个标签页（txt2img / img2img / extras）都是一棵 Gradio 组件树。

2. **modules/ 是核心，shared.py 是全局状态**：`shared.sd_model`（当前加载的 checkpoint）、`shared.cmd_opts`（命令行参数）、`shared.state`（生成进度）。所有模块共享这几个全局对象——简单但耦合高。

3. **extensions/ 目录放 git repo 就装上了**：你 `git clone` 一个第三方仓库到 `extensions/foo/`，重启 webui，它就出现了。**没有注册表、没有 manifest、没有打包格式**——这种「蠢扩展机制」是生态爆炸的根因，跟 ComfyUI 的 `custom_nodes/` 一脉相承。

4. **槽点：扩展用 monkey-patch 改 webui 行为**——A 扩展 patch `sd_samplers`，B 扩展也 patch，启动顺序决定结果。webui 主分支一更新，扩展集体崩，老用户都学会了**锁 commit hash**。

## 实践案例

### 案例 1：txt2img 一次出图在底层做了什么

你点 Generate 按钮，webui 内部按这个顺序跑：

1. **`processing.StableDiffusionProcessingTxt2Img`**：把 UI 上的 prompt / steps / cfg / size / seed 打包成对象
2. **prompt parsing**：把 `(masterpiece:1.2), best quality` 解析成 token + 权重
3. **CLIP encode**：调 `shared.sd_model.cond_stage_model` 把 prompt 编成 conditioning 张量
4. **采样器循环**：选定的 sampler（Euler a / DPM++ 2M Karras）跑 20-30 步去噪
5. **VAE decode**：4×64×64 latent → 3×512×512 RGB
6. **后处理**：face restoration / upscale（如果勾了）
7. **保存**：写盘到 `outputs/txt2img-images/<date>/`，文件名嵌 PNG metadata

每一步都能在 `modules/processing.py` 找到对应函数。读这一个文件就能搞清扩散模型推理的工程化全貌。

### 案例 2：写一个最小扩展

新建 `extensions/hello-webui/scripts/hello.py`：

```python
import modules.scripts as scripts
import gradio as gr

class HelloScript(scripts.Script):
    def title(self):
        return "Hello WebUI"

    def ui(self, is_img2img):
        return [gr.Textbox(label="say something")]

    def run(self, p, msg):
        print(f"[hello] {msg}")
        return scripts.Processed(p, [], p.seed, msg)
```

重启 webui，txt2img 标签页底部「Script」下拉框就多了「Hello WebUI」。**整个扩展机制就是「继承 Script 类、放对位置」**——简单到没有学习成本。

### 案例 3：API 模式当后端

加 `--api` 启动参数，webui 暴露 `/sdapi/v1/txt2img` REST 接口：

```bash
curl -X POST http://127.0.0.1:7860/sdapi/v1/txt2img \
  -H "Content-Type: application/json" \
  -d '{"prompt": "a cat", "steps": 20}'
```

返回 base64 PNG。很多「AI 画图机器人」「Discord bot」「内部产品 demo」就是套了这个 API——不必自己写推理代码。

## 踩过的坑

1. **Python 必须 3.10.x**——3.11+ 装某些扩展（特别是带 C 扩展的）直接炸；3.9 又有 typing 语法不支持。pyenv 锁版本是常识。
2. **首次启动下 1.5GB+ 依赖**（torch / xformers / open_clip / k-diffusion）——网络慢的人卡这步；用 `--use-cache-dir` + 国内镜像。
3. **`--medvram` / `--lowvram` 救 8GB / 6GB 显卡**，但生成速度掉一半到三分之一——这是把模型分块换进换出 VRAM 的代价。
4. **Live preview 默认 Approx NN 看着糊**——是用线性近似从 latent 估计 RGB；切 **TAESD**（一个超小 VAE）才接近真图。
5. **更新 webui 后扩展集体崩**——`git pull` 前先 `git log` 看主仓改了什么；扩展库要么锁 commit，要么准备每次更新调一遍。
6. **Gradio 版本锁死**——webui 的 `requirements.txt` 把 `gradio==3.41.2` 钉死，是因为 Gradio 4 改了组件 API，webui 大量自定义 JS 注入对不上。这也是为什么 webui 主分支不敢升 Gradio——升一次扩展全崩。
7. **AGPL 协议陷阱**——AGPL 比 MIT/Apache 严格得多，把 webui 当后端 API 嵌入闭源 SaaS 会触发开源义务；很多创业团队栽在这上面才转 ComfyUI（GPL-3.0）或自研。

## 适用 vs 不适用场景

**适用**：
- 个人玩家本地出图——一键启动、prompt + 几个滑块就出活
- 模型/LoRA 测试——切 checkpoint、装 LoRA 都是 UI 操作
- 当后端 API 嵌入小型产品 demo（注意 AGPL 协议，闭源商用要小心）
- 学扩散模型工程化——`modules/processing.py` 是绝佳教材

**不适用**：
- 复杂工作流（多 ControlNet 串联、视频管线、自定义 sampler）→ 用 ComfyUI 节点图
- 生产级服务（多 GPU 调度、队列、计费）→ 用 vLLM-style serving 或自研
- 想跟最新模型（SD3 / Flux 完整支持）→ 主仓库滞后，去 Forge 或 ComfyUI
- 严格代码质量要求——webui 工程是「黑客快速迭代」风格，全局 state、monkey-patch、紧耦合

## 历史小故事（可跳过）

- **2022-08-22**：Stability AI 公开 SD 1.4 权重；同日 AUTOMATIC1111 建仓并推上首个 Gradio 单文件 commit（`first`）
- **2022-09**：txt2img / img2img / Outpainting Mark II 标签页定型
- **2022-10**：`extensions/` 目录上线，社区第三方扩展涌入
- **2023**：SDXL 支持、API 改写、queue 重做
- **2024-2025**：v1.9 / v1.10 主仓节奏放慢；SD3 / Flux 支持滞后，社区分流到 ComfyUI 和 Forge

主仓 commit 节奏从「每天几十个」掉到「每月几个」，但**它定义的目录结构、扩展协议、文件命名仍是事实标准**——后来者要兼容它，而不是它要兼容后来者。

## 学到什么

1. **Gradio 让「会写 Python 函数」直接等于「会写 webui」**——AI 工具普及的最大杠杆之一
2. **极简扩展机制（放对目录就行）赢过复杂注册表**——ComfyUI、VS Code 走的也是这条路
3. **全局 state + monkey-patch 是技术债，但项目早期赢在迭代速度**——工程"对的"不一定赢，"快的"先占生态
4. **事实标准来自先发**——目录结构、文件名、PNG metadata 格式订下后，整个生态围着它转

## 延伸阅读

- 仓库 README：[AUTOMATIC1111/stable-diffusion-webui](https://github.com/AUTOMATIC1111/stable-diffusion-webui) —— 一键启动指南
- 性能优化 fork：[lllyasviel/stable-diffusion-webui-forge](https://github.com/lllyasviel/stable-diffusion-webui-forge) —— Forge 重写 backend
- 节点式替代品：[[comfyui]] —— ComfyUI 节点图工作流，工程白盒
- 扩展生态目录：[Civitai 模型站](https://civitai.com) —— 模型/LoRA 都按 webui 目录结构组织

## 关联

- [[comfyui]] —— 节点式扩散模型 GUI，跟 webui 是「黑盒 vs 白盒」两条路
- [[pytorch]] —— webui 的推理底座，所有张量运算都过它
- [[fastapi]] —— webui 的 API 模式跟 FastAPI 思路接近，都是「函数即接口」
- [[accelerate]] —— HuggingFace 设备/分布式抽象；webui 自己没用 accelerate，而是直接管 CUDA/MPS 分支——这是 2022 年「快糙猛」工程风格的典型残留
- [[whisper]] —— 同样是 2022 年「论文出来很快就出现一键工具」的现象级案例，但 Whisper 是 OpenAI 官方放，webui 是社区自发——两条普及路径

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[comfyui]] —— ComfyUI — 节点式扩散模型 GUI
- [[fooocus]] —— Fooocus — 把 SDXL 做成傻瓜机
- [[gradio]] —— Gradio — ML 模型 demo 框架
- [[handbrake]] —— HandBrake — 把视频转码变成点两下鼠标的事
- [[invokeai]] —— InvokeAI — 工业级 Stable Diffusion 工具
- [[mitsuba3]] —— Mitsuba 3 — 研究向可微渲染器
- [[open-sora]] —— Open-Sora — 把 Sora 路线开源对标的视频生成项目
