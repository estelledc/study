---
title: MarkItDown — 万能文件转 Markdown 工具
来源: 'https://github.com/microsoft/markitdown'
日期: 2026-06-13
分类: 机器学习
子分类: ai-ml-tools
难度: 入门
provenance: pipeline-v3
---

## 是什么

MarkItDown 是微软开源的 Python 工具，GitHub 上超过 15 万 star。日常类比：你手里有一堆不同格式的文件——PDF、Word、PPT、Excel、图片、音频、YouTube 链接，它们就像不同语言的演讲者，每个人用不同的方式表达内容。MarkItDown 就是一个同声传译员，不管原文件是什么格式，它都能把它们翻译成同一种"语言"——Markdown。

为什么需要翻译？因为现在的 AI 大模型（比如 GPT-4）最擅长理解的就是 Markdown。把各种文件统一转成 Markdown 后，就能批量喂给 LLM 做分析、摘要、检索，这就是 RAG（检索增强生成）管道的关键一步。

```
PDF / Word / PPT / Excel / 图片 / 音频 / HTML / YouTube / ZIP / EPUB
                                            |
                                    MarkItDown "翻译员"
                                            |
                                    统一的 Markdown 输出
                                            |
                                    喂给 LLM 做各种任务
```

## 核心概念

**一个核心类**：`MarkItDown`，所有操作的入口。

它的工作原理可以理解为"分发大厅"：你给它一个文件路径，它先判断文件格式，然后交给对应的"翻译专家"处理——PDF 文件走 PDF 通道，Word 走 docx 通道，图片走 OCR 通道，每个通道输出标准的 Markdown 片段，最后拼在一起返回。

**支持的文件格式**：PDF、PowerPoint、Word、Excel、图片（含 OCR）、音频（含语音转文字）、HTML、CSV/JSON/XML、ZIP、YouTube 视频字幕、EPub 电子书等。

**可选依赖**：MarkItDown 本身很小，每种文件格式的"翻译能力"通过可选依赖安装。比如 `pip install markitdown[pdf,docx,pptx]` 只装这三种，`pip install 'markitdown[all]'` 装全部。

**三种安全级别**（越窄越好）：

- `convert()` — 最宽松，接受本地文件、远程 URL、字节流
- `convert_local()` — 只接受本地文件
- `convert_stream()` — 只接受已经打开的文件流，最安全

## 为什么重要

做 RAG 或者 AI 应用时，你经常需要把各种文件内容提取出来喂给模型。没有 MarkItDown 的话，你要自己装 PyPDF2 读 PDF、装 python-docx 读 Word、装 openpyxl 读 Excel、装 pytesseract 做图片 OCR……每种工具语法还不一样。MarkItDown 把它们统一成同一个 API，一行代码搞定所有格式。

## 代码示例

### 示例 1：命令行一行搞定

终端里直接运行，把 PDF 转成 Markdown 文件：

```bash
pip install 'markitdown[all]'

markitdown report.pdf > report.md
```

也可以指定输出文件：

```bash
markitdown report.pdf -o report.md
```

支持管道输入：

```bash
cat report.pdf | markitdown
```

### 示例 2：Python API 基本用法

```python
from markitdown import MarkItDown

# 创建一个实例
md = MarkItDown()

# 转换任何支持的文件
result = md.convert("report.pdf")

# 获取 Markdown 文本
print(result.text_content)
```

同样的代码，把 `"report.pdf"` 换成 `"presentation.pptx"` 或 `"data.xlsx"` 也能正常工作，不需要改任何代码。

### 示例 3：给图片加 AI 描述

如果你装了 OpenAI 的 SDK，MarkItDown 可以让 AI 自动描述图片内容：

```python
from markitdown import MarkItDown
from openai import OpenAI

client = OpenAI()

md = MarkItDown(
    llm_client=client,
    llm_model="gpt-4o",
    llm_prompt="用中文描述这张图片的内容"
)

result = md.convert("photo.jpg")
print(result.text_content)
```

输出示例：

```
<!-- 图片描述: 这张图片展示了一只橘色的猫咪趴在窗台上，
窗外是城市夜景，玻璃上有雨滴的痕迹。猫咪的眼睛看向镜头，
表情显得很放松。 -->
```

### 示例 4：安全模式——只处理本地文件

在生产环境中，用户可能上传恶意 URL，应该用更安全的窄接口：

```python
from markitdown import MarkItDown

# 只允许本地文件，不接受 URL
md = MarkItDown()
result = md.convert_local("user_upload.docx")
print(result.text_content)
```

### 示例 5：转换 YouTube 视频

MarkItDown 能从 YouTube 视频自动提取字幕并转成 Markdown：

```python
from markitdown import MarkItDown

md = MarkItDown()
result = md.convert("https://www.youtube.com/watch?v=dQw4w9WgXcY")
print(result.text_content)
```

## 进阶：插件和云集成

MarkItDown 支持第三方插件系统，比如 `markitdown-ocr` 插件可以用 LLM 做图片文字的 OCR，不需要装额外的 ML 库。它也支持接入 Azure Content Understanding 和 Azure Document Intelligence 做更高质量的云转换，适合需要精确提取发票金额、合同条款等结构化数据的场景。

## 安全提醒

MarkItDown 的行为和 Python 的 `open()` 函数类似——它有权访问你程序能访问的所有资源。如果你在处理用户上传的文件（比如网页应用），务必：

1. 用 `convert_local()` 而不是 `convert()`，防止恶意 URL
2. 不要直接把不受信任的输入传给 MarkItDown
3. 用 `--use-plugins` 按需开启插件，默认是关闭的

## 小结

MarkItDown 就是一个"文件到 Markdown 的统一翻译层"。它的核心价值不在于某个文件格式的转换质量有多高，而在于把所有格式的统一接口。一行 `md.convert()` 搞定所有文件类型，这对 AI 应用开发来说省去了大量胶水代码。
