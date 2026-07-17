---
title: "19 项目逐仓分析"
sidebar:
  hidden: true
---
# 19 项目逐仓分析

## 总览

| 项目 | 路线 | 最值得研究的设计 |
|---|---|---|
| MinerU | Hybrid 全栈 | 三后端、统一 middle JSON、异步 API、router |
| PDF-Extract-Kit | 专家模型工具箱 | task/model 注册表 |
| OmniDocBench | 评测基础设施 | dataset/task/metric 注册表与细粒度报告 |
| DocLayout-YOLO | 版面检测 | Ultralytics 框架上的文档领域适配 |
| UniMERNet | 公式识别 | Swin 视觉编码器 + MBART LaTeX 解码器 |
| MinerU-Diffusion | 扩散 OCR | 块级并行去噪解码与多推理引擎 |
| Docling | 统一文档对象 | format backend + pipeline + DoclingDocument |
| Marker | 插件式 Pipeline | Provider → Builder → Processor → Renderer |
| PaddleOCR | OCR 平台 | PaddleX 管线包装与大量专家模块 |
| olmOCR | 大规模 VLM 线性化 | 页面请求、重试、work queue、规则 benchmark |
| dots.ocr | 单 VLM 多任务 | prompt 即任务接口 |
| MonkeyOCR | VLM + 几何后处理 | 结构-识别-关系与 Magic-PDF 风格 IR |
| DeepSeek-OCR | OCR token 压缩 | DeepEncoder 与多分辨率视觉 token |
| GLM-OCR | 流式混合管线 | 有界队列、背压、cloud/self-hosted 双模式 |
| Dolphin | 两阶段专用 VLM | layout 分析后按元素类型解码 |
| OCRFlux | 文档级 VLM | 页面解析、跨页元素/表格合并 |
| MarkItDown | 轻量转换 | 内容探测、优先级 converter、entry-point plugin |
| Unstructured | 文档 ETL | typed elements、策略路由、chunking |
| OpenParse | 语义节点 | text/table ingest + 可组合 processing steps |

## 1. MinerU

完整分析见 [MinerU 架构深读](02-mineru-architecture.md)。

核心链：

```text
CLI/API → Office/PDF 分流 → pipeline/VLM/hybrid
→ model output → middle JSON → 文档级 finalize
→ Markdown/content list/JSON/图片 → API/router
```

最重要的可复用模式是“模型层先适配到稳定 IR，再由文档层统一后处理”。这比让每个模型直接输出最终 Markdown 更利于替换模型、调试和多格式导出。

## MinerU 直接组件与评测

### 2. PDF-Extract-Kit

**定位：** MinerU 早期/底层的专家模型工具箱，不是完整的生产级 PDF-to-Markdown 系统。

**架构：**

```text
配置 YAML
  → initialize_tasks_and_models()
  → Registry 查 task/model
  → Layout / Formula Detection / Formula Recognition / OCR / Table
  → project/pdf2markdown 示例做区域裁剪、识别和拼接
```

**代码组织：**

- `pdf_extract_kit/tasks/`：每类能力一个 `task.py` 和 `models/`。
- `pdf_extract_kit/registry/registry.py`：名称到实现的注册表。
- `pdf_extract_kit/utils/config_loader.py`：从配置初始化任务与模型。
- `project/pdf2markdown/`：展示如何把工具箱组合成应用。

**核心实现：**

- `LayoutDetectionTask`、`FormulaRecognitionTask`、`TableParsingTask` 继承 `BaseTask`。
- Layout 支持 YOLO 和 LayoutLMv3。
- Formula 使用 UniMERNet。
- OCR 适配 PaddleOCR，并包含 bbox 合并、公式区域避让等几何规则。
- Table 适配 StructEqTable。

**优点：** 模型边界直观，适合研究某个专家模块或替换模型。

**代价：** 2025-01 后主仓活跃度低；读取顺序、跨页后处理、服务化和稳定中间表示不如当前 MinerU。许可证为 AGPL-3.0，不能直接把它等同于 MinerU 3.x 的新许可证。

**推荐入口：**

- `pdf_extract_kit/tasks/__init__.py`
- `pdf_extract_kit/utils/config_loader.py`
- `project/pdf2markdown/scripts/pdf2markdown.py`

**思考点：** 一个“模型工具箱”从什么时候开始需要升级成“完整文档系统”？

### 3. OmniDocBench

**定位：** 文档解析 benchmark 与评测运行时，2026-04-30 主分支升级到 v1.7。

**架构：**

```text
YAML config
  → DATASET_REGISTRY 构造样本与匹配结果
  → EVAL_TASK_REGISTRY 选择任务
  → METRIC_REGISTRY 逐元素运行指标
  → all/group/page 三层结果
  → runtime、stage、final report
```

**代码组织：**

- `configs/`：端到端、OCR、公式、表格、layout 等任务配置。
- `src/core/registry.py`：dataset/task/metric 注册表。
- `src/core/pipeline.py`：公共 CLI 和配置运行。
- `src/core/pipeline_eval.py`：端到端评测主循环。
- `src/dataset/`：标注和预测匹配。
- `src/metrics/`、`metrics/`：Edit、TEDS、CDM 等。
- `tools/model_infer/`：各模型推理适配。

**核心实现：**

- `pipeline.py:38-58` 按配置动态实例化 dataset 与 task。
- `pipeline_eval.py:34-81` 对 text/table/formula 等元素逐指标运行。
- 输出不只保存平均分，还保存 page denominator、match debug、runtime environment 和 stage execution。

**优点：** 同时提供端到端、组件级和属性切片，能解释“平均分为什么变化”。

**代价：** 匹配算法、数据版本和推理适配都会影响分数；v1.7 代码与 README 的 v1.6_full 榜单不能混称同一版本。

**推荐入口：**

- `src/core/pipeline.py`
- `src/core/pipeline_eval.py`
- `configs/end2end.yaml`
- `src/dataset/end2end_dataset.py`

**思考点：** 如果预测把一个段落拆成三个 block，文本正确但匹配失败，指标应该如何计算？

### 4. DocLayout-YOLO

**定位：** 文档版面检测模型，MinerU/PDF-Extract-Kit 的关键上游能力之一。

**架构：**

```text
Ultralytics 风格 CLI/config
  → Model / YOLO 统一 API
  → DetectionModel
  → Predictor / Trainer / Validator / Exporter
  → bbox + class + score
```

**代码组织：**

- `doclayout_yolo/cfg/`：CLI、默认配置和参数校验。
- `doclayout_yolo/engine/`：Model、Predictor、Trainer。
- `doclayout_yolo/models/yolo/`：不同任务的 model/trainer/predictor 映射。
- `doclayout_yolo/nn/`：网络结构。
- `doclayout_yolo/data/`：数据和转换。

**核心实现：**

- `engine/model.py:20-84` 定义统一模型外观。
- `models/yolo/model.py:30-64` 用 `task_map` 绑定 model/trainer/validator/predictor。
- 训练方法的创新主要来自 DocSynth300K、多样化文档数据和 global-to-local perception，工程框架大量继承 Ultralytics。

**优点：** 训练、验证、预测、导出和 benchmark 工具完整；适合作为可替换 layout 服务。

**代价：** AGPL-3.0；它只解决“哪里是什么”，不解决区域内容、阅读顺序和文档级结构。

**思考点：** layout 类别越细是否一定越好，还是会把后处理复杂度推高？

### 5. UniMERNet

**定位：** 真实世界数学公式图像到 LaTeX 的专家模型。

**架构：**

```text
公式裁剪图
  → Swin/UnimerNet 视觉编码器
  → 图像 token
  → MBART 风格自回归解码器
  → LaTeX token
  → 规范化与 CDM/BLEU 评测
```

**代码组织：**

- `unimernet/models/unimernet/`：encoder、decoder、encoder-decoder 组合。
- `unimernet/processors/`：训练/评测图像预处理。
- `unimernet/datasets/`：数据集和 builder。
- `unimernet/tasks/`、`runners/`：训练任务与执行。
- `unimernet/common/registry.py`：模型、任务、processor、runner 注册表。
- `cdm/`：公式视觉一致性评测。

**核心实现：**

- 编码器将公式图像切成 patch，使用窗口注意力。
- 解码器基于 MBART，并对 Q/K 维度做 squeeze。
- `UniMERModel.forward()` 计算训练损失，`generate()` 输出 LaTeX。

**优点：** 专业公式场景比通用 OCR 更稳定；可独立训练和评测。

**代价：** 需要准确的公式区域裁剪；只识别公式，不处理公式在页面中的位置与上下文。

**思考点：** 公式识别错误到底来自 bbox 裁剪、视觉编码还是语言解码，如何分层定位？

### 6. MinerU-Diffusion

**定位：** 2026 年的文档 OCR 解码研究项目，目标是把串行自回归生成改成块级并行去噪。

**架构：**

```text
Qwen2 Vision Encoder
  → PatchMerger
  → SDAR 非因果 Decoder
  → MASK block 反复去噪/重掩码
  → 文本/表格/公式/layout 输出
```

**代码组织：**

- `mineru_diffusion/`：Hugging Face 配置、processor、模型。
- `engines/hf/`：标准 Transformers 推理。
- `engines/nano_dvlm/`：专用轻量运行时、scheduler、KV block、Triton kernel。
- `engines/sglang/`：远程服务适配。
- `docs/gradio/`：演示与速度比较。

**核心实现：**

- `SDARAttention` 明确设置 `is_causal = False`。
- `generate()` 接收 `denoising_steps`、`block_length`、`remasking_strategy` 和动态阈值。
- Nano-DVLM 自己实现 block manager、scheduler 和 sparse attention。

**优点：** 直接针对文档 OCR 长输出的串行瓶颈；模型、算法和运行时共同设计。

**代价：** 当前仓库更像研究原型；训练、评测、服务稳定性和完整文档后处理不如 MinerU 主仓。

**思考点：** 并行解码节省墙钟时间时，重复、漏字和长依赖一致性如何变化？

## 工程型解析器

### 7. Docling

**定位：** 面向生成式 AI 的多格式文档转换框架，核心资产是统一 `DoclingDocument`。

**架构：**

```text
DocumentConverter
  → 按 InputFormat 选择 backend + pipeline
  → Backend 读取 PDF/Office/HTML/LaTeX 等
  → StandardPdfPipeline / SimplePipeline / VlmPipeline
  → DoclingDocument
  → Markdown / HTML / JSON / DocTags / chunks
```

**代码组织：**

- `docling/document_converter.py`：统一入口和 format option。
- `docling/backend/`：每种格式一个 backend。
- `docling/pipeline/`：PDF、VLM、ASR、简单格式管线。
- `docling/models/`：layout、table、OCR、picture 等 stage。
- `docling/datamodel/`：输入、转换状态和 options。
- 真正的 `DoclingDocument` 类型来自独立依赖 `docling-core`。

**核心实现：**

- `FormatOption` 把 `pipeline_cls` 和 `backend` 配成一对。
- `DocumentConverter` 按 `(pipeline class, options hash)` 缓存重模型。
- `StandardPdfPipeline` 使用 stage queue 和 batch，把预处理、模型阶段和组装并行化。
- `ConversionResult` 同时保存文档、状态、错误和时间统计。

**优点：** 多格式、统一对象模型、错误分类和扩展边界成熟；MIT 许可友好。

**代价：** 依赖图大；PDF 精度由 layout/table/OCR 组合决定；中间模型分散在 `docling`、`docling-core`、`docling-ibm-models` 等仓。

**推荐入口：**

- `docling/document_converter.py:249-286`
- `docling/document_converter.py:289-540`
- `docling/pipeline/standard_pdf_pipeline.py`

**思考点：** 稳定 IR 放在独立 `docling-core` 包，带来了哪些版本治理收益和成本？

### 8. Marker

**定位：** 以可替换处理链为核心的 PDF/多格式转 Markdown、JSON、HTML 工具。

**架构：**

```text
Provider
  → DocumentBuilder(layout + line + OCR)
  → StructureBuilder
  → Processor list
  → Renderer
```

**代码组织：**

- `providers/`：PDF、DOCX、PPTX、XLSX、HTML、EPUB。
- `builders/`：Document、layout、line、OCR、structure。
- `processors/`：表格、公式、列表、标题、页眉、LLM 修正等。
- `schema/`：Document、Page、Block、Table、Equation 等类型。
- `renderers/`：Markdown、HTML、JSON、chunk、OCR JSON。
- `converters/`：组装完整链路。

**核心实现：**

- `PdfConverter.default_processors` 明确给出处理顺序。
- `build_document()` 先建块，再逐 Processor 原地处理。
- Processor、Renderer、Provider 可通过类路径注入。
- `use_llm` 后启用表格、公式、手写、图片描述、跨页表格等 LLM processor。

**优点：** 扩展边界清晰；自定义输入、处理或输出不必 fork 整个项目。

**代价：** Processor 顺序是隐含协议；LLM 修正增加成本和非确定性；代码 GPL-3.0，模型权重是修改版 OpenRAIL-M，商业约束不能忽略。

**思考点：** 当 20 多个 processor 都能改 Document，如何证明处理顺序不会造成非局部回归？

### 9. PaddleOCR

**定位：** 从 OCR 工具发展为文档解析平台，覆盖模型训练、推理、部署、SDK 和 MCP。

**架构：**

```text
paddleocr CLI / Python Wrapper
  → PaddleXPipelineWrapper
  → 加载 PaddleX pipeline config
  → 覆盖 model/subpipeline 参数
  → create_pipeline()
  → predict iterator
  → PaddleX result / Markdown
```

**代码组织：**

- `paddleocr/_pipelines/`：OCR、PP-StructureV3、PaddleOCR-VL、Doc Translation、ChatOCR。
- `paddleocr/_models/`：OCR、layout、formula、table、chart 等包装。
- `ppocr/`：训练网络、数据、loss、metric、postprocess。
- `ppstructure/`：旧/底层 layout、table、KIE 流程。
- `deploy/`：C++、Android、iOS、ONNX、Docker 等。
- `api_sdk/`、`mcp_server/`：多语言 API 与 Agent 接入。

**核心实现：**

- 当前 Python 高层 API 的核心是 `PaddleXPipelineWrapper`，大量重逻辑在 PaddleX 依赖中。
- PP-StructureV3 把方向、去畸变、layout、OCR、表格、公式、图表、印章等参数映射到结构化 PaddleX 配置。
- 同时保留 `ppocr` 的训练代码和部署生态。

**优点：** 语言、设备、训练和部署覆盖广；Apache-2.0；适合自定义领域 OCR。

**代价：** 高层仓库不是全部运行时源码，理解完整链路还要读 PaddleX；历史 API 与新管线并存，认知负担高。

**思考点：** 一个仓库同时承担研究模型、训练框架、SDK 和产品 API 时，怎样控制兼容性？

## 专用文档 VLM

### 10. olmOCR

**定位：** 为 LLM 训练语料大规模线性化 PDF，并同时提供训练、推理和 benchmark。

**架构：**

```text
Local/S3 PDF work queue
  → 逐页渲染
  → 构造图像 + 结构化 prompt
  → OpenAI-compatible vLLM/SGLang
  → PageResponse front matter + Markdown
  → 旋转/重复/失败重试
  → 合并 Dolma/Markdown
```

**代码组织：**

- `pipeline.py`：百万级 PDF 批处理主程序。
- `work_queue.py`：本地/S3 队列和重试状态。
- `prompts/`：anchor/no-anchor prompt 与响应 schema。
- `train/`：SFT、GRPO、数据增强、checkpoint。
- `bench/`：行为规则、runner、统计与 HTML report。
- `data/`：silver data、清洗和重打包。

**核心实现：**

- 页面请求附带渲染图，并解析 YAML front matter。
- 检查上下文长度、finish reason、旋转有效性。
- 失败时提高 temperature、旋转重试，最后回退 `pdftotext`。
- 当 vLLM 队列为空时可并行发剩余重试，提高尾部吞吐。
- olmOCR-bench 用文字存在、顺序、表格、数学等规则测试输出，并做 bootstrap CI。

**优点：** 训练数据、推理规模化和评测形成闭环；Apache-2.0。

**代价：** 7B 级模型要求较高 GPU；主输出偏线性文本，不像 Docling/MinerU 那样强调通用 IR 和多格式应用。

**思考点：** “可验证规则奖励”比编辑距离更接近业务验收吗？

### 11. dots.ocr

**定位：** 用单个 VLM 同时完成 layout detection、OCR、表格和公式输出。

**架构：**

```text
PDF → page images
  → prompt mode
  → HF 或 OpenAI-compatible vLLM
  → JSON/Markdown response
  → bbox 归一化、过滤、绘图
  → layout JSON + Markdown
```

**代码组织：**

- `dots_ocr/parser.py`：文件级主流程和线程池。
- `dots_ocr/model/inference.py`：vLLM API 调用。
- `dots_ocr/utils/prompts.py`：任务协议。
- `layout_utils.py`、`format_transformer.py`：输出修复和 Markdown。

**核心实现：**

- `prompt_layout_all_en` 要求单 JSON，元素含 bbox/category/text。
- 表格 text 必须是 HTML，公式是 LaTeX，其余是 Markdown。
- 同一模型通过 prompt 做 layout only、OCR、bbox grounding、web parsing 和 SVG。
- PDF 页通过 ThreadPool 并发请求服务。

**优点：** 概念简单，任务统一；MIT。

**代价：** 工程防线较薄；JSON 修复、重试、长文档和跨页关系主要留给调用方。

**思考点：** prompt 是 API contract 时，模型升级怎样保证旧输出 schema 不漂移？

### 12. MonkeyOCR

**定位：** 用结构-识别-关系三元组处理复杂文档，并保留大量几何后处理。

**架构：**

```text
PDF/image dataset
  → MonkeyOCR model / vLLM / LMDeploy / API
  → layout + content results
  → MagicModel
  → bbox/line/span 组合、reading order
  → paragraph split
  → middle JSON → Markdown
```

**代码组织：**

- `magic_pdf/model/`：模型管理、推理后端和批分析。
- `magic_pdf/pre_proc/`：bbox、span、图像裁剪。
- `pdf_parse_union_core_v2_llm.py`：页面解析与关系恢复。
- `post_proc/`、`dict2md/`：段落和 Markdown。
- `operators/`：InferenceResult → PipeResult 接口。

**核心实现：**

- `ModelManager` 单例缓存模型，并判断异步能力。
- `InferenceResultLLM.pipe_ocr_mode()` 把模型结果送进统一 `pdf_parse_union()`。
- reading order 可用 LayoutLMv3 模型或 XY-Cut。
- 对文本框、公式框、footnote、标题重叠有大量几何修复。

**优点：** 对“模型预测不等于最终文档”的认识深入；Apache-2.0。

**代价：** 与 Magic-PDF/MinerU 旧代码风格高度相似，模块多且边界历史感强；模型与规则耦合度较高。

**思考点：** 几何规则不断增加时，何时应改成显式关系图或学习型后处理？

### 13. DeepSeek-OCR

**定位：** 研究 Contexts Optical Compression，用较少视觉 token 表示高分辨率文档。

**架构：**

```text
多分辨率图像
  → DeepEncoder
  → 压缩视觉 token
  → MoE 文本 decoder
  → prompt 控制 Markdown/OCR/grounding/figure
```

**代码组织：**

- `DeepSeek-OCR-hf/`：Transformers 推理示例。
- `DeepSeek-OCR-vllm/`：vLLM 模型适配、image process、ngram 防重复。
- 主要模型权重和 trust-remote-code 实现通过 Hugging Face 分发。

**核心实现：**

- Tiny/Small/Base/Large 与动态 Gundam 分辨率对应不同视觉 token 数。
- vLLM 使用 ngram logits processor 抑制长输出重复。
- prompt 用 `<|grounding|>` 切换带定位的 Markdown。

**优点：** 直接解决视觉 token 与高分辨率的成本矛盾；MIT。

**代价：** GitHub 仓是推理适配和示例，不是完整文档服务；核心模型细节需结合论文和模型仓。

**思考点：** 视觉压缩率提高后，首先损失的是小字、表格结构还是版面关系？

### 14. GLM-OCR

**定位：** 专用 OCR 模型加可生产化 SDK，支持 MaaS 和 self-hosted。

**架构：**

```text
GlmOcr API
  → MaaS passthrough
  或
  → PageLoader queue
  → PPDocLayout queue
  → OCRClient concurrent requests
  → ResultFormatter
  → PipelineResult
```

**代码组织：**

- `glmocr/api.py`：统一 Python API。
- `pipeline/pipeline.py`：线程和结果发射。
- `pipeline/_workers.py`：加载、layout、recognition worker。
- `pipeline/_state.py`：有界 queue、shutdown、异常。
- `layout/`、`ocr_client.py`、`postprocess/`：可替换模块。
- `parser_result/`：统一结果对象。

**核心实现：**

- page queue 和 region queue 都有 max size，形成背压。
- 三个 daemon thread 分阶段运行，watchdog 监控 OCR 服务。
- 完成顺序可乱，但 `preserve_order` 通过 buffer 保证输出顺序。
- API 层按“构造参数 > 环境变量 > YAML > 默认值”合并配置。

**优点：** 工程边界清楚、测试面较广、Apache-2.0。

**代价：** self-hosted 仍依赖模型服务和 PPDocLayout；MaaS 与本地模式的能力/隐私/成本边界需单独验收。

**思考点：** bounded queue 的大小应该按页面数、区域数、显存还是端到端延迟设置？

### 15. Dolphin

**定位：** 用同一个 VLM 做“两阶段 analyze-then-parse”，通过异构锚点为不同元素提供不同 prompt。

**架构：**

```text
整页
  → layout prompt
  → bbox + label + reading order
  → 按 bbox 裁剪元素
  → text/table/formula/code 专用 prompt
  → 并行元素解码
  → JSON + Markdown
```

**代码组织：**

- `demo_page.py`：完整两阶段页面解析。
- `demo_layout.py`：只做 layout。
- `demo_element.py`：单元素识别。
- `utils/utils.py`：PDF 渲染、layout 解析、裁剪、输出。
- `utils/markdown_utils.py`：表格和公式后处理。

**核心实现：**

- layout 输出是带 `[PAIR_SEP]`、bbox、label、tags 的序列。
- bbox 映射回原始图后裁剪。
- `process_elements()` 按元素类型分组，批量生成。
- reading order 直接来自第一阶段输出。

**优点：** 比一个超长 prompt 同时生成所有内容更易并行和控制；元素失败可局部重试。

**代价：** 第一阶段漏框会永久丢内容；GitHub `LICENSE` 是 Qwen Research License，只允许非商业研究，不能按普通开源代码理解。

**思考点：** 两阶段模型与传统 layout + 专家 OCR 的本质区别在哪里？

### 16. OCRFlux

**定位：** 重点解决复杂版面、表格和跨页内容合并的 3B 文档 VLM。

**架构：**

```text
Stage 1: 每页 → Markdown element list
Stage 2: 相邻页 element merge detect
Stage 3: 跨页 HTML table merge
→ 文档 Markdown
```

**代码组织：**

- `ocrflux/pipeline.py`：批处理、worker、vLLM server、三阶段任务。
- `ocrflux/inference.py`：离线批量推理。
- `ocrflux/client.py`：在线 OpenAI-compatible 服务。
- `prompts.py`：三类 prompt。
- `eval/`：页面、表格、跨页元素和表格合并评测。

**核心实现：**

- 页面输出先拆成 Markdown 元素。
- 模型再判断两页哪些元素应该连接。
- 如果连接元素都是表格，再让模型生成合并后的完整 HTML。
- 失败页比例超过阈值时丢弃整份文档。

**优点：** 把“跨页关系”作为一等任务，而不是事后字符串启发式；Apache-2.0。

**代价：** `pipeline.py` 是大型脚本，直接 `eval()` 模型输出，HTTP 客户端和异常处理较原始；工程成熟度低于算法想法。

**思考点：** 模型判断跨页关系后，怎样防止索引错位或链式误合并？

## 轻量转换与文档 ETL

### 17. MarkItDown

**定位：** 把常见文件转换成适合 LLM 阅读的 Markdown，优先追求简单和格式覆盖，不追求完整视觉文档理解。

**架构：**

```text
path / URL / data URI / stream
  → StreamInfo guesses
  → Magika + extension + MIME
  → 按 priority 尝试 converter
  → DocumentConverterResult
```

**代码组织：**

- `_markitdown.py`：入口、识别和 converter 注册。
- `converters/`：PDF、DOCX、PPTX、XLSX、HTML、音频、图片等。
- `_base_converter.py`：converter 协议。
- `markitdown.plugin` entry point：第三方插件。
- 独立 `markitdown-mcp`、`markitdown-ocr` 包。

**核心实现：**

- 先组合多种 `StreamInfo` 猜测，再让 converter 判断是否接受。
- converter 带优先级，specific format 先于 generic text。
- 插件延迟加载，失败插件只警告不阻塞主流程。
- PDF converter 主要基于 PDF 文本/word 几何和规则，不等同于 MinerU。

**优点：** MIT、依赖轻、格式多、插件接口简单，适合“先把普通文件变成文本”。

**代价：** 复杂扫描、公式、跨页和严格布局不是核心目标；超高 star 不能解释为文档解析准确率最高。

**思考点：** 什么时候简单 converter 比完整视觉解析器更正确？

### 18. Unstructured

**定位：** 把多格式文档分割成带 metadata 的语义元素，再提供 chunking，面向 ETL 和 RAG。

**架构：**

```text
partition(auto)
  → libmagic/FileType
  → lazy-load format partitioner
  → PDF strategy: fast / hi_res / ocr_only
  → Element[]
  → metadata
  → basic/by_title chunker
```

**代码组织：**

- `partition/auto.py`：文件类型路由。
- `partition/<format>.py`：每种格式解析。
- `documents/elements.py`：Title、NarrativeText、Table、Image 等。
- `chunking/`：basic、by-title、表格专用切分。
- `staging/`、`embed/`：下游输出。

**核心实现：**

- `_PartitionerLoader` 懒加载可选依赖并给出明确 extra 安装错误。
- PDF `auto` 先判断文本是否可提取，再选 fast 或 hi_res。
- `ElementMetadata` 保存页码、坐标、链接、语言、来源等。
- chunking 不只是按字符截断，表格被隔离并可保留表头。

**优点：** typed element + metadata + chunking 非常贴近 RAG；Apache-2.0。

**代价：** 目标不是像素级还原；hi_res 依赖 `unstructured_inference`，仓库内并不包含全部模型实现。

**思考点：** RAG 真正需要的是完美 Markdown，还是稳定 element schema 和 provenance？

### 19. OpenParse

**定位：** 从 PDF 文本、表格和图片构造面向检索的 `Node`，强调可解释 processing pipeline。

**架构：**

```text
Pdf
  → text ingest: PDFMiner / PyMuPDF OCR
  → optional table ingest: PyMuPDF / Table Transformers / UniTable
  → Element → Node
  → Basic/Semantic IngestionPipeline
  → ParsedDocument
```

**代码组织：**

- `doc_parser.py`：统一入口。
- `text/`：PDFMiner、PyMuPDF。
- `tables/`：三种表格策略。
- `processing/`：基础和语义变换。
- `schemas.py`：Bbox、Element、Node、ParsedDocument。

**核心实现：**

- `DocumentParser.parse()` 明确分离 text 和 table ingest。
- Basic pipeline 去除表内重复文本、页眉页脚、小碎片，再按空间合并。
- Semantic pipeline 可用 embedding 相似度合并节点。
- `Node` 可以包含多个 element，并按 page/y/x 计算 reading order。

**优点：** MIT；处理步骤小而可组合，适合研究 chunk 形成逻辑。

**代价：** 0.7.0 架构较轻；复杂 OCR、公式和长文档服务化有限；上游 Git LFS 额度已耗尽，测试 PDF 只能保留 LFS 指针。

**思考点：** 语义相似的两个段落如果相距很远，是否应该合并为一个检索 Node？
