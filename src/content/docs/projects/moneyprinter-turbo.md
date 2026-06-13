---
title: MoneyPrinterTurbo - AI 一键生成短视频
来源: https://github.com/harry0703/MoneyPrinterTurbo
日期: 2026-06-13
分类: 机器学习
子分类: 模型与训练
provenance: pipeline-v3
---

# MoneyPrinterTurbo - AI 一键生成短视频

## 一、这是什么？日常类比

想象一下：你想做一个抖音短视频，但不会剪辑、不会配音、不会找素材。传统做法需要你：

1. 写文案
2. 录配音
3. 去素材网站找视频片段
4. 用剪映把素材拼起来
5. 加上字幕
6. 配上背景音乐

**MoneyPrinterTurbo 做的事，就是把这 6 步全部自动化。** 你只需要告诉它一个主题（比如"金钱的作用"），它就会自己完成从文案到成片的全过程。

它就像一个"视频工厂"——你输入原材料（主题），工厂自动产出成品（视频）。

## 二、核心概念

### 2.1 流水线式生成

MoneyPrinterTurbo 的核心设计是一个 **6 阶段的流水线**，每个阶段独立完成一个任务：

```
主题 → [1.写文案] → [2.提取关键词] → [3.语音合成] → [4.生成字幕] → [5.下载素材] → [6.合成视频]
```

每个阶段都可以单独停下来看结果，也可以一口气跑完。

### 2.2 关键组件

| 组件 | 作用 | 类比 |
|------|------|------|
| LLM（大语言模型） | 写文案、提取搜索关键词 | 文案策划 |
| TTS（语音合成） | 把文字变成语音 | 配音员 |
| 素材源（Pexels/Pixabay） | 下载无版权视频片段 | 素材库 |
| Whisper | 生成精确字幕（可选） | 字幕校对员 |
| FFmpeg + MoviePy | 把所有东西拼成最终视频 | 剪辑师 |

### 2.3 视频素材来源

项目支持多种素材来源：
- **Pexels**（默认）— 免费高清视频库
- **Pixabay** — 另一个免费素材库
- **Coverr** — 横屏为主的高清素材
- **本地文件** — 用自己的视频素材

## 三、代码示例

### 示例 1：命令行一键生成视频

这是最简单的用法。打开终端，运行：

```bash
uv run python cli.py --video-subject "金钱的作用"
```

这行命令做了什么？

- `--video-subject "金钱的作用"` — 告诉程序你的视频主题是"金钱的作用"
- 程序会自动：写文案 → 提取关键词 → 下载素材 → 合成语音 → 加字幕 → 拼成视频
- 最终在当前目录生成一个 MP4 文件

你也可以指定更多参数：

```bash
uv run python cli.py \
  --video-subject "生命的意义" \
  --video-aspect 16:9 \
  --video-count 3 \
  --voice-name "zh-CN-XiaoyiNeural-Female"
```

- `--video-aspect 16:9` — 横屏格式（适合 B 站/西瓜视频），默认是 9:16 竖屏（适合抖音）
- `--video-count 3` — 一次生成 3 个不同版本，挑一个最好的
- `--voice-name` — 指定 AI 配音员的声音

### 示例 2：通过 Python API 调用

如果你想在自己的程序里集成视频生成能力，可以直接导入：

```python
from app.models.schema import VideoParams
from app.services import task as tm

# 创建视频参数
params = VideoParams(
    video_subject="春天的花海",
    voice_name="zh-CN-XiaoyiNeural-Female",
    voice_rate=1.0,
    video_aspect="9:16",
    video_count=1,
)

# 启动生成任务
result = tm.start(task_id="my-task-001", params=params, stop_at="video")

# result 包含生成的视频路径等信息
print(result["videos"])
# 输出: ['/path/to/storage/cache_videos/my-task-001/final-1.mp4']
```

这里的关键是 `VideoParams` 对象——它就像一张"订单"，告诉系统你想要什么样的视频。

### 示例 3：配置文件（config.toml）

MoneyPrinterTurbo 使用 TOML 格式的配置文件来控制各种行为。一个最小可用的配置长这样：

```toml
[app]
video_source = "pexels"
llm_provider = "openai"
openai_api_key = "sk-your-api-key-here"
openai_model_name = "gpt-4o-mini"

[whisper]
model_size = "large-v3"
device = "CPU"
compute_type = "int8"
```

- `llm_provider` — 选择哪个 AI 模型来写文案（OpenAI、通义千问、Gemini 等都支持）
- `openai_api_key` — 你的 AI 模型 API 密钥
- `subtitle_provider` — 字幕生成方式，可选 `"edge"`（快）或 `"whisper"`（准）

## 四、架构概览

MoneyPrinterTurbo 采用经典的 **MVC 架构**（模型-视图-控制器），代码结构清晰：

```
MoneyPrinterTurbo/
├── app/                    # 核心逻辑
│   ├── services/           # 各阶段服务
│   │   ├── task.py         # 流水线调度（核心入口）
│   │   ├── llm.py          # 大语言模型交互
│   │   ├── voice.py        # 语音合成（TTS）
│   │   ├── material.py     # 素材下载
│   │   ├── subtitle.py     # 字幕生成
│   │   └── video.py        # 视频合成
│   ├── models/             # 数据模型
│   └── config/             # 配置管理
├── webui/                  # Web 界面（Streamlit）
├── cli.py                  # 命令行入口
├── main.py                 # API 服务入口
└── config.example.toml     # 配置模板
```

流水线的主控函数在 `app/services/task.py` 的 `start()` 函数中，它按顺序调用各个阶段：

```python
def start(task_id, params, stop_at="video"):
    # 1. 生成文案
    video_script = generate_script(task_id, params)

    # 2. 提取搜索关键词
    video_terms = generate_terms(task_id, params, video_script)

    # 3. 生成语音
    audio_file, audio_duration, sub_maker = generate_audio(task_id, params, video_script)

    # 4. 生成字幕
    subtitle_path = generate_subtitle(task_id, params, video_script, sub_maker, audio_file)

    # 5. 下载视频素材
    downloaded_videos = get_video_materials(task_id, params, video_terms, audio_duration)

    # 6. 合成最终视频
    final_video_paths = generate_final_videos(task_id, params, downloaded_videos, ...)
```

每个步骤之间用 `stop_at` 参数可以中途暂停，方便调试和查看中间结果。

## 五、部署方式

有三种方式可以使用这个项目：

### 方式 1：Docker（推荐，最简单）

```bash
git clone https://github.com/harry0703/MoneyPrinterTurbo.git
cd MoneyPrinterTurbo
docker-compose up
```

打开浏览器访问 `http://127.0.0.1:8501` 即可使用。

### 方式 2：本地 Python 环境

```bash
git clone https://github.com/harry0703/MoneyPrinterTurbo.git
cd MoneyPrinterTurbo
uv sync --frozen
uv run streamlit run ./webui/Main.py --browser.gatherUsageStats=False
```

### 方式 3：Google Colab（零安装）

直接在浏览器中运行，不需要本地安装任何东西。点击 README 中的 Colab 按钮即可。

## 六、配置要点

使用之前需要准备两样东西：

### 6.1 一个 AI 模型的 API Key

LLM（大语言模型）负责写文案。支持 OpenAI、通义千问、Gemini、Moonshot 等 15+ 种模型。以 OpenAI 为例：

```toml
llm_provider = "openai"
openai_api_key = "sk-xxxxxxxxxx"
openai_model_name = "gpt-4o-mini"
```

### 6.2 一个视频素材源的 API Key

默认使用 Pexels 下载免费视频素材。去 [pexels.com/api](https://www.pexels.com/api/) 免费注册即可获得 API Key：

```toml
pexels_api_keys = ["your-pexels-api-key-here"]
```

> Edge TTS（语音合成）是免费的，不需要额外配置。

## 七、关键技术选型

| 技术 | 用途 | 为什么选它 |
|------|------|-----------|
| Python 3.11 | 编程语言 | 生态丰富，AI 领域首选 |
| Streamlit | Web 界面 | 几行代码就能做出好看的 Web UI |
| FastAPI | API 服务 | 自动生成文档，开发效率高 |
| MoviePy 2.x | 视频剪辑 | Python 生态中最成熟的视频处理库 |
| edge-tts | 语音合成 | 免费、高质量、无需 API Key |
| faster-whisper | 字幕生成 | 比原版 Whisper 快 4 倍 |
| FFmpeg | 视频编码 | 行业标准，几乎所有平台都支持 |

## 八、学习小结

MoneyPrinterTurbo 的价值在于它展示了一个完整的 **"AI + 自动化"** 应用范式：

1. **输入**：一个简单的主题（自然语言）
2. **AI 理解**：大语言模型把主题变成结构化内容（文案 + 关键词）
3. **资源获取**：通过 API 从互联网获取素材
4. **AI 增强**：语音合成 + 字幕生成
5. **工程组装**：用 FFmpeg + MoviePy 把所有元素合成最终产品

这套模式可以迁移到很多其他场景——比如自动生成教程、自动生成产品介绍、自动生成新闻摘要视频等等。

核心思想就一句话：**让 AI 做它擅长的（理解和生成内容），让工具做它擅长的（剪辑、编码、下载），两者结合就能产生强大的自动化效果。**
