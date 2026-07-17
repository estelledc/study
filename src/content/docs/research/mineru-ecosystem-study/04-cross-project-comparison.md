# 横向对比与选型

## 先决定你在解决哪一层

选型前先回答四个问题：

1. 输入是数字 PDF、扫描 PDF、Office 文件，还是混合格式？
2. 只要可搜索文本，还是必须保留表格、公式、层级和 bbox？
3. 下游是人读 Markdown、RAG chunk、字段抽取，还是训练数据生产？
4. 可以用 GPU/云 API 吗，数据能离开本机吗？

如果这四项没有答案，比较 star、榜单或 demo 都不会得到可靠结论。

## 三大工程型解析器

| 维度 | MinerU | Docling | Marker |
|---|---|---|---|
| 核心抽象 | middle JSON | DoclingDocument | Document/Block schema |
| 输入 | PDF、图片、DOCX、PPTX、XLSX | PDF、Office、HTML、Markdown、LaTeX、音频等 | PDF、图片、Office、HTML、EPUB |
| PDF 路线 | pipeline/VLM/hybrid | 标准 PDF pipeline/VLM | Surya + processors + optional LLM |
| 扩展方式 | 新 backend/模型适配/后处理 | FormatOption/backend/pipeline/model stage | Provider/Builder/Processor/Renderer |
| 长文档 | window + 流式落盘 | threaded stage queue | 多进程/拆文件，文档级链相对简单 |
| 服务 | FastAPI task + router | 主要是库/CLI，生态另有服务 | 简单 FastAPI，README 明示不适合大规模 |
| 调试产物 | model/middle/content/layout/span | ConversionResult、page/model artifacts | debug images、JSON block |
| 许可证 | Apache-2.0 + MinerU 附加条款 | MIT | GPL-3.0 code + 受限模型权重 |
| 最适合 | 高精度、多后端、私有部署与规模化 | 多格式统一对象和应用集成 | 强可定制处理链和快速实验 |

### 关键差异

- MinerU 把“后端差异”显式建模，适合比较和切换 pipeline、VLM、hybrid。
- Docling 把“文档对象”放在中心，适合让多种输入进入统一下游 API。
- Marker 把“处理步骤”放在中心，最容易替换某个 processor 或 renderer。

## 中间表示对比

| 项目 | 中间表示 | 是否保留坐标 | 是否保留层级 | 表格表示 | 主要目的 |
|---|---|---|---|---|---|
| MinerU | `middle_json.pdf_info` | 是 | block/line/span/para | HTML + block | 多后端统一输出 |
| Docling | `DoclingDocument` | 是 | 文档树与引用 | TableData | 多格式、无损导出 |
| Marker | `Document` + Block | 是 | parent/child block | Table/Cell block | Processor/Renderer |
| Unstructured | `Element[]` | 可选 | 类型序列，层级较轻 | Table + `text_as_html` | ETL/chunk |
| OpenParse | `ParsedDocument.nodes` | 是 | Node 聚合 element | TableElement | 检索节点 |
| dots.ocr | page layout JSON | 是 | 主要靠顺序 | HTML string | 单页模型输出 |
| olmOCR | PageResponse + Markdown | 较弱 | 线性文本为主 | Markdown/HTML 文本 | 训练语料线性化 |

### 判断标准

一个可用于生产的 IR 至少应回答：

- 内容是什么？
- 在哪一页、哪个 bbox？
- 属于什么类型？
- 阅读顺序是什么？
- 与父标题、caption、表格、图片有什么关系？
- 来源于原生文本、OCR 还是生成模型？
- 置信度和模型版本是什么？
- 如何回到原始文件做引用或人工复核？

仅保存最终 Markdown 会丢失大部分调试和追溯信息。

## Pipeline 与 VLM

| 维度 | 多专家 Pipeline | 端到端 VLM |
|---|---|---|
| 错误定位 | 可定位到 layout/OCR/table/formula | 通常只能看到生成结果 |
| 普通数字 PDF | 快、稳定，可复用原生文本 | 可能浪费算力并改写正确文本 |
| 扫描/复杂背景 | 依赖训练域和 OCR | 通常更鲁棒 |
| 表格/公式 | 专家模型可控 | 能统一生成，但可能 schema 漂移 |
| 长尾版式 | 容易漏检或规则失效 | 泛化通常更好 |
| 资源 | CPU 到中等 GPU | 通常需要较强 GPU |
| 吞吐 | 易批处理和分阶段并行 | 受视觉 token 与生成长度限制 |
| 替换局部能力 | 容易 | 很难只换一个子能力 |
| 幻觉 | 低，但会漏内容 | 可能补写、重复或截断 |
| 许可证 | 多个子模型许可叠加 | 单模型权重许可可能更清楚，也可能受限 |

结论不是“VLM 会淘汰 Pipeline”，而是：

- 数字 PDF 和可解释生产链继续需要 Pipeline。
- 扫描、手写和复杂视觉会推动专用 VLM。
- Hybrid 用路由把两者组合，是当前最现实的主流方向。

## 专用 VLM 的不同设计

| 项目 | 核心策略 | 文档级能力 | 运行时特点 |
|---|---|---|---|
| MinerU2.5/Hybrid | layout/原生信息辅助 VLM | 跨页表格、标题、IR | 多引擎、窗口、API/router |
| olmOCR | 整页图 + 结构化 prompt | 页面合并、训练语料 | work queue、S3、vLLM、重试 |
| dots.ocr | prompt 切换 layout/OCR | 主要单页 | HF/vLLM，线程池 |
| DeepSeek-OCR | 高压缩视觉 token | 主要单页 | HF/vLLM，ngram 防重复 |
| GLM-OCR | PP layout → 区域 VLM | 结果合并 | bounded queues、watchdog |
| Dolphin | layout → 元素专用 prompt | 页面元素合并 | 元素批量并行 |
| OCRFlux | 页面 → 跨页关系 → 表格合并 | 强调跨页 | vLLM batch，大型脚本 |
| MinerU-Diffusion | block diffusion decoding | 主要模型层 | HF/Nano-DVLM/SGLang |

## 三种“混合”并不相同

### 1. 路由式混合

先判断页面是否需要 OCR/VLM，简单页走快路径，复杂页走慢路径。

例：Unstructured `auto`、OpenDataLoader hybrid。

风险：路由错了会选择错误能力。

### 2. 区域式混合

layout/原生文本给出区域和底稿，VLM 只识别部分区域。

例：MinerU `hybrid medium`、GLM-OCR。

风险：bbox 坐标、重复内容和责任边界复杂。

### 3. 修正式混合

完整 Pipeline 先跑，LLM 只修表格、公式、图片描述或跨页问题。

例：Marker `--use_llm`。

风险：修正可能把正确内容改错，需要可验证 gate。

## 轻量转换与 ETL

| 项目 | 主要输出 | 适合 | 不适合 |
|---|---|---|---|
| MarkItDown | Markdown | 普通 Office、网页、文本 PDF，低成本 ingest | 高精度扫描/复杂布局 |
| Unstructured | typed Elements/chunks | RAG ETL、metadata、chunking | 像素级还原 |
| OpenParse | Nodes + bbox | 可解释 chunk、表格与空间/语义合并 | 大规模 OCR 服务 |

一个常见误区是先用最重的 VLM 处理所有文件。更合理的策略是：

```text
原生格式可读？
  是 → 轻量 converter/partition
  否 → layout/OCR/VLM

下游只需检索？
  是 → typed elements + chunking
  否 → 保留完整 IR 与视觉结构
```

## 服务化对比

| 项目 | 并发模型 | 失败处理 | 持久化 | 多节点 |
|---|---|---|---|---|
| MinerU API | 进程内 async task manager | task 状态、错误结果 | 否 | Router 转发多个 API |
| MinerU Router | worker health + 负载分数 | 本地重启、上游失败 | task registry 内存 | 支持多个本地/远程 worker |
| GLM-OCR | 三线程 + bounded queue | watchdog/shutdown | 否 | 外部 OCR 服务可扩 |
| olmOCR | async worker + Local/S3 queue | 指数退避、页面 fallback | workspace/S3 | Beaker/多 GPU |
| OCRFlux | async worker + vLLM | 页重试、错误率阈值 | workspace JSONL | 面向批处理 |
| Marker server | 单 FastAPI 示例 | 基础异常 | 否 | README 明示小规模 |

真正生产化还要补：

- 外部持久队列。
- 幂等 task key。
- 结果对象存储。
- 精确模型/配置版本。
- 任务取消和重试策略。
- 资源配额与租户隔离。
- 可观测性和坏样本回流。

## 如何正确阅读 benchmark

### 规则 1：固定五个版本

一次可复查比较至少记录：

1. 数据集版本。
2. 评测代码 commit。
3. 被测项目 commit/release。
4. 模型权重版本。
5. 推理配置和后处理脚本。

### 规则 2：不要跨表拼数字

OmniDocBench、olmOCR-bench、项目自建 benchmark 的：

- 样本分布不同。
- 任务定义不同。
- 指标不同。
- 预处理和输出清洗不同。
- 商业 API 版本可能变化。

不能把各自最好的数字拼成一张“总榜”。

### 规则 3：平均分必须配失败切片

至少按以下维度切：

- 数字 PDF / 扫描 PDF。
- 中文 / 英文 / 混合语言。
- 单栏 / 多栏 / 复杂布局。
- 普通文本 / 表格 / 公式 / 手写。
- 清晰 / 模糊 / 旋转 / 水印。
- 短文档 / 长文档 / 超长表格。

### 规则 4：准确率之外还要测

- p50/p95 页延迟。
- pages/s 与 batch scaling。
- 峰值 RAM/VRAM。
- 冷启动和模型下载。
- 页面失败率、文档失败率。
- 重试后是否重复/错序。
- 结果可追溯性。
- 部署和许可证成本。

## 许可证不是附属信息

| 项目 | 代码/仓库许可 | 模型或附加约束 |
|---|---|---|
| MinerU | 自定义 MinerU Open Source License | 基于 Apache-2.0；MAU >1 亿或月收入 >2000 万美元需商业许可；在线服务需显著标识 |
| PDF-Extract-Kit | AGPL-3.0 | 组合模型还需分别检查 |
| DocLayout-YOLO | AGPL-3.0 | 权重/训练数据另查 |
| UniMERNet | Apache-2.0 | 权重与数据卡另查 |
| Docling | MIT | 模型包/权重需分别确认 |
| Marker | GPL-3.0 | 权重为修改版 OpenRAIL-M；收入/融资/竞争业务限制 |
| PaddleOCR | Apache-2.0 | 单个模型和数据集仍需核对 |
| olmOCR | Apache-2.0 | 模型卡另查 |
| dots.ocr | MIT | 模型卡另查 |
| MonkeyOCR | Apache-2.0 | 模型卡另查 |
| DeepSeek-OCR | MIT | 模型权重条款另查 |
| GLM-OCR | Apache-2.0 | MaaS 另受服务条款约束 |
| Dolphin | Qwen Research License | 非商业研究；商业使用需另取许可 |
| OCRFlux | Apache-2.0 | 模型卡另查 |
| MarkItDown | MIT | 可选 Azure 服务另受服务条款约束 |
| Unstructured | Apache-2.0 | 平台服务与开源库不同 |
| OpenParse | MIT | UniTable 等权重另查 |

生产选型必须建立四层许可清单：

```text
应用代码
  + 依赖代码
  + 模型权重
  + 训练/评测数据与云服务条款
```

## 场景选型

### 科研论文与公式

优先试：

- MinerU hybrid/pipeline。
- olmOCR。
- 专用公式能力 UniMERNet。

验收重点：公式 CDM、行内公式、编号、跨栏阅读顺序、引用和脚注。

### 财报与复杂表格

优先试：

- MinerU hybrid。
- Marker + LLM table processor。
- PaddleOCR PP-StructureV3。
- OCRFlux 的跨页表格路径。

验收重点：rowspan/colspan、跨页表头、表内图片、数值零误差。

### 扫描档案与手写

优先试：

- olmOCR。
- dots.ocr / DeepSeek-OCR / GLM-OCR。
- MinerU VLM/hybrid。

验收重点：旋转、模糊、小字、手写、语言混合和失败回退。

### 多格式企业知识库

优先试：

- Docling：统一对象模型。
- Unstructured：element + chunking。
- MarkItDown：普通格式快路径。
- MinerU：复杂 PDF 和 Office 高精度补充。

### 超大批量数据生产

优先研究：

- MinerU processing window + router。
- olmOCR WorkQueue/S3。
- GLM-OCR bounded queue。
- OCRFlux workspace batch。

不要只测单页 demo。

## 推荐的真实选型流程

1. 收集 50-200 份真实文档，按失败类型分桶。
2. 为关键字段和结构定义人工基准。
3. 先跑轻量原生解析，建立成本下限。
4. 再跑 Pipeline、VLM、Hybrid 三类代表。
5. 记录 exact version、配置、硬件和输出。
6. 用组件指标 + 业务规则双重评分。
7. 分析最差 10% 样本，而不是只看平均分。
8. 评估许可证、部署、维护和回归成本。
9. 最终可以是路由组合，不必强行选一个万能解析器。

## 关键思考点

1. 你的业务真正不能错的是文字、表格结构、字段，还是阅读顺序？
2. 如果 90% 文档原生可读，是否值得为全部文档部署 GPU VLM？
3. 中间表示应由解析器定义，还是由下游 RAG 平台定义？
4. LLM 修正步骤怎样做到“只有证据充分才改原结果”？
5. 许可证限制是否会改变技术最优解？
