---
title: "零基础项目上手卡：19 个项目从哪里读起"
sidebar:
  hidden: true
---
# 零基础项目上手卡：19 个项目从哪里读起

> 完整机制见[逐仓分析](03-project-deep-dives.md)，版本与许可见
> [仓库清单](05-repository-inventory.md)。

## 使用方法

1. 先选“完整解析器、专家模型、文档 VLM、ETL 或评测”中的一层。
2. 复述输入、输出和主链，再打开 2-5 个源码锚点。
3. 完成第一项任务后，才决定是否下载模型或跑 GPU。
4. 本页除 MarkItDown/OpenParse 小 PDF 外均为 E1。

## 全栈与直接组件

### 1. MinerU

- **类比与输入输出**：统一收件台把 PDF/Office 分到三条加工线，最后在标准装订台汇合；输入文档，输出 middle JSON、Markdown、content list、图片和可视化。
- **主链**：CLI/API → Office/PDF 分流 → pipeline/VLM/hybrid → middle JSON → document finalize → output/API/router。
- **源码锚点**：`mineru/cli/common.py`、`mineru/backend/pipeline/pipeline_analyze.py`、`mineru/backend/hybrid/hybrid_analyze.py`、`mineru/cli/fast_api.py`、`mineru/cli/router.py`。
- **取舍**：多后端和统一 IR 兼顾不同成本/质量，代价是模型适配、几何后处理和依赖矩阵复杂。
- **证据与第一项任务**：**E1**；从 `common.py` 画出 pipeline/VLM/hybrid 分叉，并标出它们首次汇入共同 `pdf_info` 的位置。

### 2. PDF-Extract-Kit

- **类比与输入输出**：装有版面、公式、OCR 和表格专用工具的工作箱；输入裁剪页/区域，输出各专家模型结果。
- **主链**：YAML → registry → task/model → layout/formula/OCR/table → 示例应用拼接。
- **源码锚点**：`pdf_extract_kit/tasks/`、`pdf_extract_kit/registry/registry.py`、`pdf_extract_kit/utils/config_loader.py`、`project/pdf2markdown/scripts/pdf2markdown.py`。
- **取舍**：专家边界清楚、易替换，代价是读取顺序、跨页、IR 和服务化仍需上层补齐。
- **证据与第一项任务**：**E1**；选一个 task，追踪配置名如何经 registry 变成具体模型对象。

### 3. OmniDocBench

- **类比与输入输出**：文档解析的体检中心，按文字、表格、公式和阅读顺序分别检查；输入标注与预测，输出细粒度指标和失败切片。
- **主链**：config → dataset registry → eval task → metric registry → page/group/all reports。
- **源码锚点**：`src/core/registry.py`、`src/core/pipeline.py`、`src/core/pipeline_eval.py`、`src/dataset/end2end_dataset.py`、`configs/end2end.yaml`。
- **取舍**：细粒度指标可解释平均分，代价是 matching、数据版本和推理适配都会改变结果。
- **证据与第一项任务**：**E1**；画出一个 text block 从 prediction matching 到 edit metric 的路径，并列出一次拆段会怎样影响分数。

### 4. DocLayout-YOLO

- **类比与输入输出**：只负责在页面上圈出“这里是标题、表格、图片”的版面勘测员；输入页面图，输出 bbox/class/score。
- **主链**：config/CLI → model facade → DetectionModel → predictor/trainer/validator/exporter。
- **源码锚点**：`doclayout_yolo/engine/model.py`、`doclayout_yolo/models/yolo/model.py`、`doclayout_yolo/cfg/`、`doclayout_yolo/nn/`。
- **取舍**：训练、推理和导出完整，代价是只解决区域检测，上游漏框会让下游永久看不到内容。
- **证据与第一项任务**：**E1**；从 `task_map` 找出 predictor 和 validator 如何绑定，解释类别增加为何会推高后处理成本。

### 5. UniMERNet

- **类比与输入输出**：只读取公式图片并翻译成 LaTeX 的专业译员；输入公式 crop，输出 LaTeX token。
- **主链**：image patches → Swin encoder → visual tokens → MBART decoder → normalized LaTeX。
- **源码锚点**：`unimernet/models/unimernet/`、`unimernet/processors/`、`unimernet/datasets/`、`unimernet/tasks/`、`cdm/`。
- **取舍**：公式专精优于通用 OCR，代价是依赖正确裁剪且不理解公式在页面中的关系。
- **证据与第一项任务**：**E1**；把错误拆成 bbox、视觉编码和语言解码三层，各找一个可观测工件。

### 6. MinerU-Diffusion

- **类比与输入输出**：不是一个字接一个字写，而是把一块遮住的文本反复擦亮；输入页面 token，输出文本/表格/公式/layout 序列。
- **主链**：vision encoder → patch merger → non-causal decoder → block denoise/remask → output。
- **源码锚点**：`mineru_diffusion/`、`engines/hf/`、`engines/nano_dvlm/`、`engines/sglang/`、`docs/gradio/`。
- **取舍**：块级并行降低自回归墙钟时间，代价是去噪轮次、漏字、重复和长依赖一致性更难控制。
- **证据与第一项任务**：**E1**；找到 `denoising_steps`、`block_length` 与 remasking 参数，预测各自对速度/质量的影响。

## 工程型解析器

### 7. Docling

- **类比与输入输出**：不同文件先经专用拆包员，再装进统一 `DoclingDocument` 容器；输入多格式文件，输出统一文档对象与多种导出。
- **主链**：DocumentConverter → format backend/pipeline → model stages → DoclingDocument → Markdown/HTML/JSON/chunks。
- **源码锚点**：`docling/document_converter.py`、`docling/backend/`、`docling/pipeline/standard_pdf_pipeline.py`、`docling/datamodel/`、`tests/test_e2e_conversion.py`。
- **取舍**：稳定对象模型利于应用集成，代价是依赖分散在 docling-core/model packages。
- **证据与第一项任务**：**E1**；追踪 `FormatOption` 怎样同时选择 backend 与 pipeline，说明两者为什么不能只保留一个。

### 8. Marker

- **类比与输入输出**：一条可换工位的编辑流水线，先建文档，再让多个 processor 修结构，最后换 renderer；输入文件，输出 Markdown/HTML/JSON/chunks。
- **主链**：Provider → DocumentBuilder → StructureBuilder → Processor list → Renderer。
- **源码锚点**：`marker/providers/`、`marker/builders/`、`marker/processors/`、`marker/renderers/`、`marker/converters/`。
- **取舍**：插件边界清楚，代价是 processor 顺序成为隐式协议，LLM 修正还可能改坏正确 block。
- **证据与第一项任务**：**E1**；读取 PDF converter 的默认 processor 顺序，选两个相邻步骤解释交换后可能出现的回归。

### 9. PaddleOCR

- **类比与输入输出**：从识字机扩展成训练、部署、结构化文档和 Agent 接口一体的平台；输入图像/文档，输出 OCR、layout、table、formula 等结果。
- **主链**：Python/CLI wrapper → PaddleX pipeline config → model/subpipeline → predict iterator → structured result。
- **源码锚点**：`paddleocr/_pipelines/`、`paddleocr/_models/`、`ppocr/`、`ppstructure/`、`deploy/`。
- **取舍**：训练与设备生态广，代价是高层 wrapper 的重逻辑位于外部 PaddleX，旧新 API 并存。
- **证据与第一项任务**：**E1**；从 PP-StructureV3 wrapper 找一个 dotted config override，追到 PaddleX 边界后停止。

## 专用文档 VLM

### 10. olmOCR

- **类比与输入输出**：面向百万页的扫描流水线，每页有工单、重试和规则质检；输入本地/S3 PDF，输出 PageResponse、Markdown/Dolma 和 benchmark。
- **主链**：work queue → page render → image/prompt request → schema parse → rotate/retry/fallback → merge。
- **源码锚点**：`olmocr/pipeline.py`、`olmocr/work_queue.py`、`olmocr/prompts/`、`olmocr/bench/`、`olmocr/train/`。
- **取舍**：训练、规模推理和规则评测闭环，代价是 7B 模型 GPU 成本高，IR 主要偏线性文本。
- **证据与第一项任务**：**E1**；比较 rotation retry、temperature retry 和 `pdftotext` fallback 的触发条件。

### 11. dots.ocr

- **类比与输入输出**：同一个视觉模型通过不同任务单同时做圈框、识字或网页解析；输入页面图和 prompt mode，输出 JSON/Markdown。
- **主链**：PDF pages → prompt → HF/vLLM → response repair → bbox normalize/filter → layout JSON/Markdown。
- **源码锚点**：`dots_ocr/parser.py`、`dots_ocr/model/inference.py`、`dots_ocr/utils/prompts.py`、`dots_ocr/utils/layout_utils.py`、`dots_ocr/utils/format_transformer.py`。
- **取舍**：接口概念简单，代价是 prompt/schema 漂移、重试和跨页关系主要由调用方承担。
- **证据与第一项任务**：**E1**；读 layout-all prompt，列出 bbox、category、text 三个字段互相干扰的失败方式。

### 12. MonkeyOCR

- **类比与输入输出**：模型先给结构-识别-关系草稿，再由几何编辑部修 bbox、行段和顺序；输入 PDF/image，输出 middle JSON 与 Markdown。
- **主链**：model backend → layout/content → MagicModel → geometry/read order → paragraph split → middle JSON → Markdown。
- **源码锚点**：`magic_pdf/model/`、`magic_pdf/pre_proc/`、`magic_pdf/pdf_parse_union_core_v2_llm.py`、`magic_pdf/post_proc/`、`magic_pdf/dict2md/`。
- **取舍**：模型结果与文档后处理分离，代价是历史规则多、模型与几何逻辑耦合。
- **证据与第一项任务**：**E1**；找一条 bbox 修正规则，写出它的前置假设和可能误伤的页面类型。

### 13. DeepSeek-OCR

- **类比与输入输出**：把高分辨率页面压成更少视觉 token，再让文本 decoder 还原内容；输入多分辨率图像和 prompt，输出 OCR/Markdown/grounding。
- **主链**：resolution/tiles → DeepEncoder → compressed visual tokens → MoE decoder → ngram repetition guard。
- **源码锚点**：`DeepSeek-OCR-master/DeepSeek-OCR-hf/`、`DeepSeek-OCR-master/DeepSeek-OCR-vllm/`、`README.md`。
- **取舍**：减少视觉 token 成本，代价是小字、表格结构和版面关系可能先损失。
- **证据与第一项任务**：**E1**；对照 Tiny/Base/Gundam 配置，预测同一小字号表格的 token 与质量变化。

### 14. GLM-OCR

- **类比与输入输出**：有背压的三工位生产线，页面加载、版面切区和 OCR 可并行但不能无限堆料；输入文档，输出 ordered PipelineResult。
- **主链**：GlmOcr API → PageLoader queue → Layout queue → OCRClient → formatter → ordered emission。
- **源码锚点**：`glmocr/api.py`、`glmocr/pipeline/pipeline.py`、`glmocr/pipeline/_workers.py`、`glmocr/pipeline/_state.py`、`glmocr/ocr_client.py`。
- **取舍**：bounded queue 和 watchdog 强化生产行为，代价是 MaaS/self-hosted 协议、隐私和外部服务仍需分别验收。
- **证据与第一项任务**：**E1**；画三条 queue 的生产/消费关系，解释 queue 过大和过小各造成什么问题。

### 15. Dolphin

- **类比与输入输出**：先看整页做分镜，再按文字、表格、公式分别裁剪识别；输入页面，输出 layout 序列、元素结果和 Markdown。
- **主链**：layout prompt → bbox/label/order → crop → type-specific prompt → parallel decode → merge。
- **源码锚点**：`demo_page.py`、`demo_layout.py`、`demo_element.py`、`utils/utils.py`、`utils/markdown_utils.py`。
- **取舍**：两阶段便于并行和局部重试，代价是第一阶段漏框后第二阶段无法恢复。
- **证据与第一项任务**：**E1**；从 layout 输出格式追到 crop，说明两个重叠 bbox 会怎样造成重复。

### 16. OCRFlux

- **类比与输入输出**：先逐页拆元素，再专门判断相邻页哪些段落/表格应接起来；输入多页 PDF，输出文档 Markdown。
- **主链**：page elements → adjacent-page merge detect → cross-page HTML table merge → document output。
- **源码锚点**：`ocrflux/pipeline.py`、`ocrflux/inference.py`、`ocrflux/client.py`、`ocrflux/prompts.py`、`eval/`。
- **取舍**：跨页关系成为一等模型任务，代价是大型脚本、`eval()` 输出和链式误合并风险。
- **证据与第一项任务**：**E1**；找出模型结果进入 `eval()` 的路径，设计一个 JSON/schema 替代 gate。

## 轻量转换与 ETL

### 17. MarkItDown

- **类比与输入输出**：先辨认文件类型，再选择优先级最高的轻量抄写员转成 Markdown；输入 path/URL/stream，输出 Markdown。
- **主链**：StreamInfo guesses → converter priority → convert → Markdown。
- **源码锚点**：`packages/markitdown/src/markitdown/_markitdown.py`、`packages/markitdown/src/markitdown/_base_converter.py`、`packages/markitdown/src/markitdown/converters/`、`packages/markitdown/tests/test_pdf_memory.py`。
- **取舍**：依赖轻、格式广，代价是复杂视觉结构和细粒度 provenance 不是核心合同。
- **证据与第一项任务**：**E2-limited**，33 项定向测试和同 PDF 对照通过；解释 plain PDF 为什么回退 pdfminer，form page 为什么保留 pdfplumber 路径。

### 18. Unstructured

- **类比与输入输出**：把多格式材料拆成有类型和 metadata 的积木，再按标题/表格规则装成 RAG chunk；输入文件，输出 Element[] 和 chunks。
- **主链**：partition(auto) → file type → format partitioner → strategy → typed elements → metadata → chunking。
- **源码锚点**：`unstructured/partition/auto.py`、`unstructured/documents/elements.py`、`unstructured/chunking/`、`unstructured/partition/pdf.py`、`test_unstructured/chunking/test_table_isolation.py`。
- **取舍**：Element schema 贴近 ETL/RAG，代价是目标不是像素级还原，hi_res 模型在外部包。
- **证据与第一项任务**：**E1**；比较 Title、NarrativeText、Table 进入 `by_title` chunker 后的边界。

### 19. OpenParse

- **类比与输入输出**：把页面中的文字和表格卡片按空间/语义组合成检索 Node；输入 PDF，输出 ParsedDocument/Node/bbox。
- **主链**：text/table ingest → Element → Basic/Semantic processing steps → Node → ParsedDocument。
- **源码锚点**：`src/openparse/doc_parser.py`、`src/openparse/text/`、`src/openparse/tables/`、`src/openparse/processing/`、`src/openparse/schemas.py`。
- **取舍**：处理步骤小且 provenance 清楚，代价是复杂 OCR/公式/服务化有限，测试 fixture 受 LFS 影响。
- **证据与第一项任务**：**E2-limited**，公开 API 同 PDF 输出 3 个 Node；官方 pytest 被 conftest cwd bug 阻断。先解释两类证据为何不能合并。

## 项目级完成检查

完成一个项目的入门学习后，至少能回答：

1. 它覆盖文档解析九层中的哪几层？
2. 输入、IR、最终输出和失败工件分别是什么？
3. 哪些源码锚点组成主控制流？
4. 一个设计选择提高了什么，又增加了什么成本？
5. 当前是 E0、E1 还是 E2，模型、数据和硬件边界是什么？
6. 第一个实验应测 text、order、structure、provenance 还是 operations？

答不出第 5-6 题，说明仍在比较项目宣传，而不是建立可复查选型能力。
