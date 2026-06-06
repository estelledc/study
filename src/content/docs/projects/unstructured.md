---
title: Unstructured — 把任意文档解析成 LLM 能吃的元素列表
来源: https://github.com/Unstructured-IO/unstructured
日期: 2026-05-31
子分类: 数据科学与 AI
分类: 机器学习
难度: 中级
provenance: pipeline-v3
---

## 是什么

Unstructured 是一个**专门把"乱七八糟的文档"压成"一串带类型的小块"**的开源 Python 库。日常类比：你把一摞混在一起的纸（PDF 报告、Word 简历、PPT、网页打印件、邮件、扫描照片）扔给一个分拣员，他**逐张读、贴标签**——这是标题、这是正文段、这是列表项、这是表格、这是图——最后给你一份按顺序排好、每块都带"类别 + 页码 + 坐标"的卡片清单。

它解决的痛点很具体：要做 RAG，第一步永远是"把文档变成可切块的有序文本"。但**25+ 种格式各有各的解析坑**——PDF 有版面、PPTX 是 XML、邮件有头有正文有附件、扫描件还得 OCR。Unstructured 把这些坑集中到一处，对外只暴露一个 `partition()`。

最简一行：

```python
from unstructured.partition.auto import partition
elements = partition(filename="报销政策.pdf")
for el in elements:
    print(type(el).__name__, el.text[:60])
```

输出会是 `Title 公司差旅报销政策 / NarrativeText 第一条 ... / ListItem 出租车 ... / Table | 类别 | 上限 | ...`——每个 Element 都是 Python 对象，有 `.text`、`.category`、`.metadata.page_number` 等字段。

## 为什么重要

不理解 Unstructured，下面这些事都没法解释：

- 为什么 [[langchain]] 和 [[llamaindex]] 的"默认文档加载器"列表里都摆着 Unstructured——它把上游脏活做深了，下游不愿意再造一遍轮子
- 为什么 RAG 项目卡在"PDF 解析质量"这一环——纯 `pdfplumber` 抽不出表格、PyMuPDF 抽不出版面层级，Unstructured 把这些拼成一套
- 为什么"非结构化数据准备"能撑起一家拿了 ~25M 美元 A 轮的公司——这件事看起来不性感，但谁都绕不过去
- 为什么 Unstructured 把策略显式分档（`fast` / `hi_res` / `ocr_only`），而不是"自动适配"——RAG 工程里的延迟和精度权衡只能由用户拍板
- 为什么后来 LlamaParse、Reducto、AWS Textract 这一批"专业文档解析"工具会冒出来，都在啃同一块蛋糕

## 核心要点

Unstructured 的处理流程可以拆成 **三步**：

1. **Partition（识别 + 切分）**：`partition(filename=...)` 自动嗅探文件后缀和 magic number（文件开头几个字节的指纹，比如 PDF 是 `%PDF`），分发到对应的子函数（`partition_pdf` / `partition_docx` / `partition_html` ...），把整篇文档拆成**有序的 Element 列表**。类比：分拣员先看一眼文件是哪种格式，再用对应的拆封工具。

2. **Element 类型化**：每个 Element 有明确类别——`Title`（标题）/ `NarrativeText`（正文段）/ `ListItem`（列表项）/ `Table`（表格）/ `Image` / `FigureCaption` / `Header` / `Footer`，并附带元数据：页码、bbox（bounding box，矩形边界框坐标）、parent_id（层级关系）、languages（语种）。这一步让"一份 PDF"变成"可程序化操作的有序结构"。

3. **Chunking（按语义切块）**：`chunk_by_title` 把同一标题下的内容粘成一个 chunk；`chunk_elements` 按 token 数硬切。这一步是为**下游 embedding** 准备等长且语义相对完整的输入——直接喂裸 Element 列表给向量化会切太碎，喂整篇又超 token。

## 实践案例

### 案例 1：最简 RAG 前置

```python
from unstructured.partition.auto import partition
from unstructured.chunking.title import chunk_by_title

elements = partition(filename="report.pdf")
chunks = chunk_by_title(elements, max_characters=1000, combine_text_under_n_chars=200)
# chunks 直接喂给 embedding 模型即可
```

三行做完："PDF → 有序 Element → 按标题分块"——下一步接 [[llamaindex]] 或 [[langchain]] 的 vector store 即可。

### 案例 2：hi_res 策略抠表格

对扫描 PDF / 含财报表格的文档，默认 `fast` 策略会丢表格结构。换成：

```python
elements = partition(
    filename="财报.pdf",
    strategy="hi_res",
    infer_table_structure=True,
)
```

这会调用版面检测模型（detectron2 / yolox）识别表格区域，把表格 Element 的 `metadata.text_as_html` 填成结构化 HTML——下游可以直接喂给 LLM 让它读表。代价：速度从一秒几十页掉到一秒一两页。

### 案例 3：把元数据保留下来做 citation

```python
for el in elements:
    print(el.text, "← page", el.metadata.page_number, el.metadata.coordinates)
```

每个 Element 都有页码和 bbox，做 RAG 时可以让 LLM 回答完之后**指回原文**——"这段答案来自第 3 页第 12-18 行"，这是裸 `pdfplumber` 抽文本做不到的。

### 案例 4：自定义过滤——只留正文段

很多场景下 Header / Footer / Page Number 只会污染检索结果（每页都有"第 X 页 / 公司机密"反复出现）。利用 Element 类型可以一行过滤掉：

```python
narrative = [el for el in elements
             if type(el).__name__ in ("NarrativeText", "Title", "ListItem", "Table")]
```

裸文本抽取做不到这一步——只有"已经类型化"的 Element 列表才能这样切。这也是 Unstructured 比单纯抽 text 多出来的核心价值。

## 踩过的坑

1. **重依赖**：`hi_res` 策略要装 poppler（PDF 渲染）+ tesseract（OCR）+ detectron2 / onnxruntime（版面检测）+ libreoffice（DOCX/PPTX 先转 PDF）。裸 `pip install unstructured` 只够 `fast`——一上 `hi_res` 就 ImportError。社区维护的 `unstructured[all-docs]` extras 能装一部分系统包还得自己来。

2. **速度差三档**：`fast` 一秒几十页，`hi_res` 一秒一两页，`ocr_only` 一秒不到一页。生产线必须**显式分流**——纯文本 PDF 走 fast，含表格 / 扫描件走 hi_res，扔同一档要么慢要么糊。

3. **表格识别质量靠版面运气**：多列表格、合并单元格、跨页表格、横向表格——这些场景下 `text_as_html` 经常错位。专业财报场景往往要叠 layoutparser 或换 LlamaParse 这类专门工具。

4. **OCR 千万别乱开**：`strategy="ocr_only"` 会把每一页都过 tesseract，纯文本 PDF 走这条路慢 50 倍且精度反而低（tesseract 对干净文字不如直接抽 text layer）。只在确认是扫描档时开。

5. **embedding 维度对齐**：上游 chunk 大小和下游 embedding 模型的 token 上限要对齐——`max_characters=1000` 对 OpenAI text-embedding-3 够用，但有些 BGE 系列输入限 512 token，1000 字符可能超。换模型必须重新切块 + 重建索引。

## 适用 vs 不适用场景

**适用**：

- RAG 管线的**前置文档解析**——25+ 格式统一一个 `partition()`
- 需要按"标题 / 段落 / 列表 / 表格"语义切块的场景（学术论文、技术文档、合同条款）
- 需要保留版面元数据（页码、bbox）做 **citation 回溯**
- 图文混排文档——一次提取文字 + 表格 + 图片标题
- 接 [[langchain]] / [[llamaindex]] / haystack——这些框架都内置了 Unstructured loader

**不适用**：

- 纯文本日志 / CSV / JSON——直接 `pandas` / `open()`，杀鸡用牛刀
- 极致延迟（< 100 ms）的在线请求——hi_res 一页就要几百毫秒
- 需要完美 OCR 的扫描档——它的 OCR 是 tesseract 包装，专业场景该上 PaddleOCR / Azure Document Intelligence
- 完全离线 + 无 GPU 环境——hi_res 的版面模型在 CPU 上慢且吃内存
- 单一格式且量大——只解析 PDF 的话，PyMuPDF / pdfplumber 直接调更轻

## 历史小故事（可跳过）

- **2022 中**：Brian Raymond 一帮人给 LLM 团队做数据预处理时，发现"PDF → 文本"这一步反复造轮子，决定抽成独立库。
- **2022-10**：`Unstructured-IO/unstructured` 在 GitHub 开源，初版只支持 PDF / HTML / EML 三种。
- **2023**：[[langchain]] 与 [[llamaindex]] 把 Unstructured 接成默认 document loader 之一，GitHub star 从 1k 涨到 6k。
- **2024-Q1**：拿到 Madrona / Bain 领投的 ~25M 美元 A 轮，推出 Unstructured Platform（hosted API + 企业连接器，对接 SharePoint / Google Drive / S3）。
- **2024-2025**：Element 列表持续加新字段（emphasis 强调、languages 多语种、links 链接），同时和 LlamaIndex / Haystack 等下游框架 co-evolve——上游加字段，下游接住。

## 学到什么

1. **把脏活做深就是护城河**——25+ 格式 × 3 种策略 × 元数据完整度，新框架要一次性复制非常难
2. **策略显式分档比"自动适配"更工程**——`fast` / `hi_res` / `ocr_only` 让用户拍板 SLA，比黑箱更可控
3. **下游生态的接入决定上游存活**——LangChain 哪天换默认 loader，Unstructured 的护城河会松一大截，所以它必须持续 co-evolve
4. **开源 + 商业 hosted 是 RAG 工具链标准打法**——和 LlamaCloud / Pinecone / Weaviate 一样的双轨：开源版做生态，hosted 版收钱
5. **元数据是"未来杠杆"**——一开始只是把页码、bbox 顺手存上，几年后做 citation 回溯、版面感知 chunk、多模态拼合时全靠它撑场。看起来"额外"的数据其实是**最有复利**的部分

## 延伸阅读

- 官方文档与 API 参考：[Unstructured Docs](https://docs.unstructured.io/)（按格式、按策略两条主索引）
- 源码起点：`unstructured/partition/auto.py`——读完这一文件就能搞清"自动嗅探 + 分发"是怎么实现的
- 配套博客：Unstructured 团队对每种格式的解析坑都写过专题文章，比通用 RAG 教程深
- [[langchain]] 文档里的 `UnstructuredFileLoader` 章节——能看到下游怎么消费 Element 列表

## 关联

- [[langchain]] —— 通用 LLM 框架，`UnstructuredFileLoader` 是默认文档加载器之一
- [[llamaindex]] —— RAG 框架，`SimpleDirectoryReader` 在复杂格式下也会调 Unstructured
- [[haystack]] —— 另一个把 Unstructured 当前置 loader 的 RAG 框架
- [[paddleocr]] —— 专业扫描档场景的 OCR 替代方案，比内置 tesseract 准
