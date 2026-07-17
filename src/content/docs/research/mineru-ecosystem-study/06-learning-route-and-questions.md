---
title: "学习路线与思考题"
sidebar:
  hidden: true
---
# 学习路线与思考题

## 学习原则

不要从 19 个 README 同时开始。把它们当成 19 座工厂，先学一座完整工厂，再按同一问题去比较其他工厂。

推荐顺序：

```text
领域问题
  → MinerU 完整主链
  → 中间表示
  → Pipeline 与 VLM 对比
  → 文档级后处理
  → 服务化
  → 评测与选型
```

每次只处理 4-7 个新概念，并用问题主动回忆，不要只重复阅读材料。

## 第一阶段：建立领域地图

**目标：** 能解释为什么“PDF 转 Markdown”不是简单文本提取。

阅读：

- [生态与发展现状](01-ecosystem-landscape.md)

需要掌握：

- OCR、版面分析、文档解析、字段抽取、文档 ETL 的区别。
- 原生解析、Pipeline、VLM、Hybrid 四条路线。
- 文档解析九层技术栈。

主动回忆：

1. 一个扫描 PDF 为什么不能用普通 PDF 文本提取解决？
2. 阅读顺序错误会怎样影响 RAG？
3. 表格为什么经常用 HTML，而不是 Markdown？
4. 哪些任务属于页面级，哪些必须文档级处理？

掌握证据：

- 不看材料，画出“输入 PDF → 结构化输出”的九层流程。
- 给出一个数字 PDF 和一个扫描财报的不同技术路径。

## 第二阶段：追踪 MinerU 主链

**目标：** 能从 CLI 一直追到最终 Markdown。

阅读：

- [MinerU 架构深读](02-mineru-architecture.md)
- `repos/MinerU/mineru/cli/backend_options.py`
- `repos/MinerU/mineru/cli/common.py:668-840`

追踪题：

1. 用户执行 `mineru -p input.pdf -o output` 后，为什么可能先启动临时 API？
2. `do_parse()` 在什么时候先处理 Office 文件？
3. `pipeline`、`vlm-engine`、`hybrid-http-client` 分别改变了哪一段控制流？
4. 为什么 `pipeline` 在 FastAPI 中放进 `asyncio.to_thread()`？
5. 最终 `_process_output()` 依赖的是原始模型结果还是 `pdf_info`？

掌握证据：

- 用 10 行以内写出 CLI → API → backend → output 的调用链。
- 能指出 backend 选择发生在哪个文件，而不是泛泛说“配置决定”。

## 第三阶段：理解统一中间表示

**目标：** 能解释 IR（Intermediate Representation，中间表示）为什么是架构核心。

对比阅读：

- MinerU：三个 `*_model_output_to_middle_json.py`
- Docling：`document_converter.py` 与 `DoclingDocument`
- Marker：`schema/document.py`、`schema/blocks/`
- Unstructured：`documents/elements.py`
- OpenParse：`schemas.py`

对比问题：

1. 这五个项目保存的最小单位分别是什么？
2. 哪些结构能回到原页 bbox？
3. 哪些结构适合无损导出，哪些更适合 RAG chunk？
4. 表格在每个 IR 中是 HTML 字符串、Table 对象还是 Cell 树？
5. 如果只保存 Markdown，后续无法回答哪些问题？

练习：

设计一个最小 `DocumentIR`，至少包含：

```text
document
  pages
    blocks
      type
      bbox
      order
      confidence
      source
      children/spans
```

然后解释如何从它生成 Markdown 和可点击引用。

## 第四阶段：比较 Pipeline 与 VLM

**目标：** 能根据样本特点选择路线，而不是追最新模型。

Pipeline 精读：

- MinerU `pipeline_analyze.py:157-328`
- PaddleOCR `paddleocr/_pipelines/pp_structurev3.py`
- Marker `converters/pdf.py`

VLM 精读：

- dots.ocr `parser.py`
- olmOCR `pipeline.py:106-375`
- Dolphin `demo_page.py`
- DeepSeek-OCR README 的分辨率/token 配置

Hybrid 精读：

- MinerU `hybrid_analyze.py:889-1095`
- GLM-OCR `pipeline/pipeline.py`

应用题：

1. 10 万份可复制文本的英文合同，哪条路线最经济？
2. 低清手写档案，为什么 VLM 可能优于 Pipeline？
3. 财报中 95% 是普通文字、5% 是复杂表格，怎样设计区域级 Hybrid？
4. 如果 layout 漏掉一个表格，后续 OCR 能否恢复？
5. VLM 生成有效 JSON 但漏了一段，schema 校验为什么发现不了？

## 第五阶段：文档级后处理

**目标：** 明白模型输出只是中间结果。

阅读：

- MinerU `utils/table_merge.py`
- MinerU `backend/pipeline/para_split.py`
- OCRFlux `pipeline.py:302-457`
- Marker `processors/`
- OpenParse `processing/basic_transforms.py`

关键概念：

- 行、段、块的合并边界。
- 页眉页脚和重复内容。
- 跨页表格、跨页段落。
- 标题层级。
- 规则与生成模型修正的责任边界。

验证题：

1. 两页都有相同列数的表格，为什么仍不能直接合并？
2. `rowspan` 跨分页边界时需要保存什么状态？
3. 连字符结尾在英文和中文跨页段落里应该怎样处理？
4. OCRFlux 为什么先判断元素关系，再专门合并 HTML 表格？
5. Marker Processor 顺序改变会造成哪类回归？

实践题：

构造 6 个最小跨页表格测试：

- 重复表头。
- 不重复表头。
- `rowspan` 跨页。
- 列数相同但其实是两个表。
- “续表” caption。
- 表格后紧跟新的段落标题。

## 第六阶段：服务化与规模

**目标：** 能区分“模型能跑”和“系统可用”。

阅读：

- MinerU `cli/fast_api.py:822-1219`
- MinerU `cli/router.py:503-829`
- GLM-OCR `pipeline/_state.py`、`_workers.py`
- olmOCR `work_queue.py`、`pipeline.py`

问题：

1. MinerU `AsyncTaskManager` 的状态存在哪里？进程重启会怎样？
2. Router 为什么必须校验 `protocol_version`？
3. `pending_assignments` 为什么要计入负载分数？
4. bounded queue 如何形成背压？
5. 页面重试应该与文档重试怎样分层？
6. 结果什么时候写对象存储，什么时候保存在本地磁盘？

架构练习：

为 100 万页/天设计一个最小系统，明确：

- API。
- 持久队列。
- worker 类型。
- 模型版本。
- 幂等 key。
- 结果存储。
- 失败恢复。
- 指标和坏样本回流。

## 第七阶段：评测与真实选型

**目标：** 能建立自己的 baseline，不被单一榜单误导。

阅读：

- OmniDocBench `src/core/pipeline.py`
- OmniDocBench `src/core/pipeline_eval.py`
- olmOCR `bench/tests.py`、`bench/benchmark.py`
- [横向对比：如何读 benchmark](04-cross-project-comparison.md#如何正确阅读-benchmark)

问题：

1. Edit Distance、TEDS、CDM 分别忽略了什么？
2. 一个输出平均分高，但漏掉关键金额，业务是否可接受？
3. 规则型 benchmark 与标注相似度 benchmark 如何互补？
4. 为什么必须固定模型权重和推理配置？
5. 如何定义“页面失败”和“文档失败”？

实践：

建立 30 份最小业务集，每份写：

```yaml
sample_id:
document_type:
language:
layout:
must_preserve:
must_not_appear:
critical_tables:
critical_formulas:
expected_reading_order:
```

先取得人工基准，再运行工具；没有基准时不宣布“解析正确”。

## 项目专项问题

### MinerU

1. staged middle JSON 为什么要支持客户端 finalize？
2. Hybrid `medium` 和 `high` 的具体调用差异是什么？
3. Router 的 in-memory task registry 如何升级到持久化？

### Docling

1. `FormatOption` 为什么同时绑定 backend 和 pipeline？
2. 独立 `docling-core` 如何管理 schema 演进？
3. Threaded pipeline 如何保证同一 run 的页面顺序？

### Marker

1. Processor 是原地修改还是返回新 Document？
2. 如何声明 Processor 前后依赖？
3. LLM Processor 失败时怎样回退原 block？

### PaddleOCR

1. PaddleOCR 与 PaddleX 的源码/版本边界是什么？
2. PP-StructureV3 的所有参数为何映射到 dotted config path？
3. 旧 `ppstructure` 与新 `_pipelines` 如何共存？

### olmOCR

1. 为什么使用 front matter，而不是直接生成裸 Markdown？
2. 旋转重试与温度重试为什么分开？
3. 规则 reward 如何用于 GRPO？

### dots.ocr

1. 一个 prompt 同时要求 bbox、category 和 text，哪项最容易互相干扰？
2. JSON 过滤失败后的 fallback 是否仍有结构保证？

### MonkeyOCR

1. 模型已经输出 layout，为什么仍需要大量 bbox 几何规则？
2. LayoutLMv3 reading order 与 XY-Cut 何时切换？

### DeepSeek-OCR

1. 动态 Gundam 分辨率如何决定 tile 数？
2. 100 个视觉 token 能否保留小字号表格？

### GLM-OCR

1. region queue 的容量怎样影响内存和吞吐？
2. MaaS 和 self-hosted 如何保持输出协议一致？

### Dolphin

1. layout 第一阶段和元素第二阶段能否用不同模型？
2. 如果两个 bbox 重叠，元素裁剪如何避免重复识别？

### OCRFlux

1. 直接 `eval()` 模型输出有什么风险？
2. 链式跨页表格合并如何保证索引稳定？

### MarkItDown

1. converter priority 与注册顺序发生冲突时谁优先？
2. 内容探测和扩展名不一致时怎样避免误路由？

### Unstructured

1. `Element` 与 `CompositeElement` 的边界是什么？
2. 表格 chunk 为什么需要单独策略？

### OpenParse

1. 空间合并与语义合并冲突时怎样选择？
2. Node 的 bbox 跨多页后还代表什么？

## 推荐下一次精读

只选一个：

1. **理解完整系统：** MinerU `cli/common.py` → `pipeline_analyze.py` → `model_json_to_middle_json.py`。
2. **理解 IR：** MinerU middle JSON 与 DoclingDocument 对比。
3. **理解可扩展 Pipeline：** Marker `PdfConverter` 和 Processor 顺序。
4. **理解生产并发：** GLM-OCR bounded queue 与 MinerU Router 对比。
5. **理解评测：** OmniDocBench matching 与 olmOCR rule tests 对比。

精读时每次控制在约 50 行代码，读完用 2-3 个问题验证，不一次倾倒整文件。
