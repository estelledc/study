---
title: "零门槛自动生成短视频——Pixelle-Video 笔记"
来源: https://github.com/AIDC-AI/Pixelle-Video
日期: 2026-06-13
分类_原始: AI 工具
分类: 机器学习
子分类: 模型与训练
provenance: pipeline-v3
---

# 零门槛自动生成短视频——Pixelle-Video 笔记

## 一、从日常类比说起

想象你要拍一支旅行 Vlog。正常流程是：

1. 想主题、写文案
2. 找或拍配图/画面
3. 录音或配音
4. 选背景音乐
5. 把声音、画面、音乐拼在一起加字幕

每一步都需要不同技能——写作、摄影、录音、剪辑。

**Pixelle-Video 做的事情，就是把这五步打包成一行字**：你只输入一个主题，比如"为什么要养成阅读习惯"，它自动走完全部五步，最后给你一支完整的视频。

它来自阿里旗下的 AIDC 团队，在 GitHub 上已获得 22k+ star，开源协议是 Apache 2.0。

## 二、核心概念

### 2.1 流水线（Pipeline）架构

Pixelle-Video 把视频生成拆成了 **四个串联阶段**，每个阶段可以独立替换"引擎"：

| 阶段 | 做什么 | 可选引擎 |
|------|--------|----------|
| 文案生成 | 根据主题写分镜脚本 | GPT-4o、通义千问、DeepSeek、Ollama（本地） |
| 配图/视频生成 | 为每一句文案生成画面 | ComfyUI（本地）、RunningHub（云端）、直连模型 API |
| 语音合成 | 把文案转成人声 | Edge-TTS（免费）、Index-TTS（可克隆音色） |
| 视频合成 | 拼画面 + 声音 + 字幕 + BGM | 基于 FFmpeg + HTML 模板 |

你可以把每个阶段想象成流水线上的一个工位。你想换"配音员"，就换 TTS 引擎；想换"画风"，就换图像生成工作流。**互不影响，自由组合**。

### 2.2 ComfyUI 工作流

ComfyUI 是一个"可视化节点式 AI 工作流"工具。Pixelle-Video 把 ComfyUI 当作 **图像/视频生成的底层引擎**。

具体来说，每个图像生成任务对应一个 `.json` 文件（比如 `image_flux.json`），里面描述了："从提示词到最终图片"的节点连接关系。Pixelle-Video 调用这个工作流，把文案中的描述送进去，再把生成的图片拉出来。

### 2.3 三种媒体生成方式

项目支持三种获取画面素材的途径：

- **ComfyUI 本地部署**：自己电脑跑 ComfyUI 服务，完全免费，但有显卡门槛
- **RunningHub 云端**：无需本地环境，按量付费
- **直连模型 API**：直接调用 DashScope（通义万象）、OpenAI、可灵等厂商的图像/视频 API，不经过 ComfyUI

### 2.4 视频模板

模板决定了最终视频的"外壳"——画面布局、字幕样式、转场方式。模板是纯 HTML 文件，分为三类：

- `static_*.html`：纯文字样式，不需要 AI 生成媒体
- `image_*.html`：AI 生成的图片做背景
- `video_*.html`：AI 生成的视频片段做背景

懂 HTML 的话可以自己写模板。

## 三、安装与启动

### 前置依赖

```bash
# macOS
brew install ffmpeg

# Ubuntu / Debian
sudo apt update && sudo apt install ffmpeg
```

还需要 Python 包管理器 `uv`（比 pip 更快）：
https://docs.astral.sh/uv/getting-started/installation/

### 从源码启动

```bash
git clone https://github.com/AIDC-AI/Pixelle-Video.git
cd Pixelle-Video
uv run streamlit run web/app.py
```

浏览器会自动打开 `http://localhost:8501`。

> Windows 用户可以直接下载整合包，解压后双击 `start.bat` 即可，无需装任何环境。

## 四、代码示例

### 示例 1：配置文件结构

`config.example.yaml` 展示了整个项目的配置体系。理解这个文件，就理解了 Pixelle-Video 的"大脑"：

```yaml
project_name: Pixelle-Video

# 大语言模型 —— 负责写文案
llm:
  api_key: "sk-xxx"
  base_url: "https://dashscope.aliyuncs.com/compatible-mode/v1"
  model: "qwen-max"

# 图像 / 视频生成 —— 通过 ComfyUI 或云端
comfyui:
  comfyui_url: http://127.0.0.1:8188
  runninghub_api_key: "xxx"

  image:
    default_workflow: runninghub/image_flux.json
    prompt_prefix: "Minimalist black-and-white matchstick figure style"

  video:
    default_workflow: runninghub/video_wan2.1_fusionx.json

# 模板
template:
  default_template: "1080x1920/image_default.html"
```

关键点：
- LLM 部分只要是 OpenAI SDK 兼容的 API 都能用——GPT、通义千问、DeepSeek 都行
- 图像生成默认用 RunningHub 的 FLUX 模型，不需要本地显卡
- `prompt_prefix` 决定了配图的整体视觉风格

### 示例 2：直连 API 媒体模型配置

不想用 ComfyUI 的话，可以直接配置模型供应商：

```yaml
api_providers:
  common:
    print_model_input: false
    local_proxy: ""
  openai:
    api_key: "sk-xxx"
    base_url: "https://api.openai.com/v1"
    use_proxy: false
  dashscope:
    api_key: "sk-xxx"
    base_url: "https://dashscope.aliyuncs.com/api/v1"
    use_proxy: false
  kling:
    base_url: "https://api-beijing.klingai.com"
    access_key: "xxx"
    secret_key: "xxx"
    use_proxy: false
```

这里配置了三个供应商：
- **OpenAI**：可以调 GPT Image 模型生成图片
- **DashScope**：通义万象的图像和视频模型（Wan、HappyHorse）
- **可灵 Kling**：快手旗下的视频生成模型

每个供应商可以独立决定是否走本地代理。

### 示例 3：模板文件结构

`templates/` 下的模板是 HTML 文件，下面是一个简化示意：

```html
<!DOCTYPE html>
<html>
<head>
  <style>
    .frame {
      width: 1080px;
      height: 1920px;
      position: relative;
      overflow: hidden;
    }
    .bg-image {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .subtitle {
      position: absolute;
      bottom: 200px;
      width: 90%;
      left: 5%;
      text-align: center;
      font-size: 48px;
      color: white;
      text-shadow: 2px 2px 8px rgba(0,0,0,0.8);
    }
  </style>
</head>
<body>
  <div class="frame">
    <img class="bg-image" src="{{image_url}}" />
    <div class="subtitle">{{subtitle_text}}</div>
  </div>
</body>
</html>
```

关键机制：`{{image_url}}` 和 `{{subtitle_text}}` 是模板占位符，Pipeline 在合成视频时，会把每一帧对应的图片 URL 和文案自动填进去。

## 五、成本分析

| 方案 | LLM | 图像/视频 | 成本 | 适合谁 |
|------|-----|-----------|------|--------|
| 完全免费 | Ollama（本地） | 本地 ComfyUI | 0 元 | 有显卡的开发者 |
| 推荐方案 | 通义千问 | 本地 ComfyUI | 极低 | 大多数用户 |
| 云端方案 | OpenAI | RunningHub | 较高 | 没有本地环境 |

通义千问的 API 调用成本非常低，配合免费或低成本的图像生成方案，做一次视频的成本通常不到 1 元。

## 六、扩展模块

项目还有三个有趣的扩展能力：

1. **数字人口播**：上传一张人脸照片，让"数字人"对着镜头说话
2. **动作迁移**：上传参考视频和图片，把参考视频的动作迁移到图片上
3. **图生视频**：从一张静态图片生成动态视频片段

这些模块通过 ComfyUI 工作流或直连 API 实现，不需要改动主流程代码。

## 七、关键收获

1. **模块化是核心设计哲学**：文案、配图、配音、合成四个阶段完全解耦，任何一个环节都可以独立替换
2. **ComfyUI 是底层能力层**：项目把 ComfyUI 的工作流机制封装成了"可用即插"的模块化能力，降低了 AI 视频生成的使用门槛
3. **三种获取画面的方式满足不同场景**：本地部署（零成本）、云端托管（零门槛）、直连 API（最灵活）
4. **HTML 模板降低了视频排版门槛**：不需要会剪辑软件，懂一点 HTML 就能自定义视频样式

## 八、思考

这个项目最打动我的一点是：**它把"视频创作"从一项多技能复合任务，变成了"输入主题 → 等待结果"的单点操作**。

如果你是一个内容创作者，但它不懂剪辑，可以用它快速产出内容原型。如果你是一个产品经理想验证一个视频创意，可以用它几分钟出片，而不是花几天找设计师。

下一步值得探索的是：能不能在现有 Pipeline 基础上加入更多环节，比如自动字幕翻译、多语言配音、AI 自动封面生成？
