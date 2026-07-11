---
title: Unstructured — 把任意文档解析成 LLM 能吃的元素列表
来源: https://github.com/Unstructured-IO/unstructured
日期: 2026-05-31
分类: AI / RAG / Document Parsing
难度: 中级
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
- 为什么 RAG 项目卡在"PDF 解析质量"——纯 `pdfplumber` 抽不出表格、PyMuPDF 抽不出版面层级，它把这些拼成一套
- 为什么"非结构化数据准备"能撑起一家拿了约 2500 万美元融资的公司——看起来不性感，但谁都绕不过去
- 为什么它把策略显式分档（`fast` / `hi_res` / `ocr_only`），而不是"自动适配"——延迟和精度只能由用户拍板

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
```

**逐部分解释**：

1. `partition(...)`：自动认格式，拆成带类型的 Element 列表（标题 / 正文 / 表格…）
2. `chunk_by_title(...)`：同一标题下的块粘在一起，并限制每块大约 1000 字符——方便下游 embedding（把文字变成向量的模型）吃下
3. 下一步把 `chunks` 交给 [[llamaindex]] / [[langchain]] 的 vector store 即可

### 案例 2：hi_res 策略抠表格

默认 `fast` 会丢表格结构。扫描 PDF / 财报要显式升档：

```python
elements = partition(
    filename="财报.pdf",
    strategy="hi_res",
    infer_table_structure=True,
)
```

**逐部分解释**：

1. `strategy="hi_res"`：启用版面检测模型（detectron2 / yolox 一类），先找"哪里是表"
2. `infer_table_structure=True`：把表格填进 `metadata.text_as_html`，下游 LLM 可读结构化表
3. 代价：速度从一秒几十页掉到一秒一两页；且常需 `unstructured[all-docs]` + poppler / tesseract 等系统依赖（见踩坑）

### 案例 3：元数据做 citation

```python
for el in elements:
    print(el.text, "← page", el.metadata.page_number, el.metadata.coordinates)
```

每个 Element 自带页码和 bbox（矩形框坐标）。RAG 回答后可**指回原文**——"来自第 3 页"——裸抽 text 做不到。页码像书签：检索命中后读者能翻回原页核对。

### 案例 4：按类型过滤正文

Header / Footer / 页码会污染检索（每页重复"公司机密"）。按 Element 类型过滤：

```python
narrative = [el for el in elements
             if type(el).__name__ in ("NarrativeText", "Title", "ListItem", "Table")]
```

只有"已贴标签"的列表才能这样切——这是比单纯抽 text 多出来的核心价值。

## 踩过的坑

1. **重依赖**：`hi_res` 要 poppler + tesseract + 版面模型 +（DOCX/PPTX 时）libreoffice；裸 `pip install unstructured` 只够 `fast`，一上 `hi_res` 就 ImportError。
2. **速度差三档**：`fast` 一秒几十页，`hi_res` 一秒一两页，`ocr_only` 更慢——生产线必须按文档类型分流，不能一刀切。
3. **表格靠版面运气**：合并单元格、跨页表、横向表时 `text_as_html` 常错位；专业财报往往要换 LlamaParse 等专门工具。
4. **OCR 别乱开**：`ocr_only` 每页过 tesseract，纯文本 PDF 慢约 50 倍且更糊——只在确认是扫描档时开。

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

- **2022 中**：Brian Raymond 等人做 LLM 数据预处理时，发现"PDF → 文本"反复造轮子，抽成独立库。
- **2022-10**：`Unstructured-IO/unstructured` 开源，初版主要支持 PDF / HTML / EML。
- **2023**：[[langchain]] / [[llamaindex]] 接成默认 document loader 之一；同年 7 月公布 Seed + Series A 合计约 2500 万美元（Madrona 领投 A，Bain 参与）。
- **2024-03**：再融约 4000 万美元 Series B（Menlo 领投），推进 Unstructured Platform（hosted API + SharePoint / Drive / S3 等连接器）。
- **2024-2025**：Element 持续加字段（languages、links 等），与 LlamaIndex / [[haystack]] 等下游 co-evolve。

## 学到什么

1. **把脏活做深就是护城河**——25+ 格式 × 3 种策略 × 元数据完整度，新框架很难一次抄齐
2. **策略显式分档比"自动适配"更工程**——`fast` / `hi_res` / `ocr_only` 让用户拍板 SLA
3. **下游生态决定上游存活**——框架换默认 loader，护城河就会松，必须持续 co-evolve
4. **元数据是未来杠杆**——页码、bbox 当初像"顺手存"，后来 citation、版面感知 chunk 全靠它

## 延伸阅读

- 官方文档：[Unstructured Docs](https://docs.unstructured.io/)（按格式、按策略两条主索引）
- 源码起点：`unstructured/partition/auto.py`——看清"自动嗅探 + 分发"
- 融资背景：[TechCrunch 报道 Seed+A 轮](https://techcrunch.com/2023/07/19/unstructured-which-offers-tools-to-prep-enterprise-data-for-llms-raises-25m/)
- [[langchain]] 的 `UnstructuredFileLoader` 章节——看下游怎么消费 Element

## 关联

- [[langchain]] —— 通用 LLM 框架，`UnstructuredFileLoader` 是常见文档加载器之一
- [[llamaindex]] —— RAG 框架，复杂格式下常会调到 Unstructured
- [[haystack]] —— 另一个把 Unstructured 当前置 loader 的 RAG 框架
- [[paddleocr]] —— 专业扫描档 OCR 替代，比内置 tesseract 更准
- [[vllm]] —— 下游生成侧；解析质量再好，也要接上能跑的推理引擎

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
