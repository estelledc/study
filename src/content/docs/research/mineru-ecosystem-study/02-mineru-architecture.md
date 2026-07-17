# MinerU 架构深读

**版本：** 3.4.4
**固定提交：** `79d6d8d79fb8f3ddba5cc34c07a16f0ec36f56c7`
**主语言：** Python
**本轮证据：** 静态源码；未下载模型或执行解析

## 一句话架构

MinerU 像一个“统一收件台 + 三条加工线 + 一个标准装订台”：

- CLI/API 接收 PDF、图片和 Office 文件。
- 根据输入和 backend 选择 native Office、pipeline、VLM 或 hybrid 路径。
- 各路径先生成自己的模型结果，再统一转换为 `middle_json`。
- 文档级后处理完成段落、标题、跨页表格和阅读顺序。
- 渲染器输出 Markdown、content list、middle JSON、模型原始结果和可视化。
- Router 可以在多个本地/远程 API worker 之间分配任务。

## 代码组织

| 目录 | 职责 | 类比 |
|---|---|---|
| `mineru/cli/` | CLI、API、异步任务、router、模型服务入口 | 收件台与调度中心 |
| `mineru/backend/pipeline/` | 多专家模型分析、批处理和中间表示转换 | 专科流水线 |
| `mineru/backend/vlm/` | 专用 VLM 推理、模型输出解释和渲染 | 全科视觉模型 |
| `mineru/backend/hybrid/` | 版面/原生信息与 VLM 协作 | 人机混合工位 |
| `mineru/backend/office/` | DOCX/PPTX/XLSX 原生解析 | 直接拆文件结构 |
| `mineru/model/` | 版面、OCR、公式、表格、VLM 运行适配 | 机器与工具 |
| `mineru/data/` | 文件/S3 读写抽象 | 仓储系统 |
| `mineru/utils/` | PDF 分类、bbox、表格合并、标题、格式等 | 公共工具箱 |

`pyproject.toml:128-136` 注册 8 个命令入口，包括 `mineru`、`mineru-api`、`mineru-router`、三类 VLM server、模型下载和 Gradio。

## 顶层调用链

### CLI

```text
mineru
  → mineru.cli.client:main
  → 收集输入、探测页数、规划批次
  → 如果未指定 API URL，启动临时 mineru-api
  → POST /tasks
  → 轮询状态并下载结果 ZIP
  → 客户端生成最终输出/可视化
```

关键证据：

- `mineru/cli/client.py:544-607`：收集输入文档。
- `mineru/cli/client.py:609-665`：按页数和窗口规划任务。
- `mineru/cli/client.py:705-759`：提交、轮询和下载。
- `mineru/cli/client.py:910-1025`：编排完整 CLI。

这意味着 MinerU 3.x 的 CLI 不再直接等同于“在当前进程调用模型”。它更像 API 客户端，统一了本地临时服务与远程服务的行为。

### API

```text
POST /file_parse
  → 创建异步任务
  → 等待同一个任务管理器完成
  → 同步返回结果

POST /tasks
  → 立即返回 task_id
GET /tasks/{id}
  → 返回状态
GET /tasks/{id}/result
  → 返回 JSON 或 ZIP
```

`mineru/cli/fast_api.py:1228-1349` 表明同步接口和异步接口复用同一个任务模型，避免维护两套解析实现。

`run_parse_job()` 在 `fast_api.py:822-867` 统一组装参数：

- `pipeline` 放到工作线程运行同步 `do_parse()`。
- 其他后端走 `aio_do_parse()`。

## 输入分流

真正的核心分派在 `mineru/cli/common.py:668-757`：

1. 先规范 backend 名称。
2. Office 文件先走原生解析并从待处理 PDF 列表移除。
3. PDF/图片先由 PDFium 重写指定页区间，损坏页有降级路径。
4. 根据 backend 进入 pipeline、VLM 或 hybrid。
5. 所有路径调用统一 `_process_output()` 生成产物。

Office 分流位于 `common.py:618-665`：

- DOCX → `office_docx_analyze`
- PPTX → `office_pptx_analyze`
- XLSX → `office_xlsx_analyze`

这比“先转 PDF 再 OCR”更快、更确定，也能保留 Office 原生结构。

## 三类后端不是重复实现

公开 backend 定义在 `mineru/cli/backend_options.py:3-22`：

| Backend | 运行位置 | 主要特点 |
|---|---|---|
| `pipeline` | 本地 | 专家模型；CPU/GPU；确定性更强 |
| `vlm-engine` | 本地 | 自动选择本地 VLM 推理引擎 |
| `vlm-http-client` | 远程 | 调 OpenAI-compatible VLM 服务 |
| `hybrid-engine` | 本地 | 本地版面/原生能力 + VLM |
| `hybrid-http-client` | 混合 | 本地轻量处理 + 远程 VLM |

默认值是 `hybrid-engine`，hybrid effort 支持 `medium` 和 `high`。

### Pipeline

主入口：`mineru/backend/pipeline/pipeline_analyze.py:157-328`。

流程：

```text
PDF bytes
  → 判断是否需要 OCR
  → PDFium 打开文档
  → 按 processing_window_size 切页窗口
  → 页面渲染为 PIL
  → BatchAnalyze 调版面/OCR/公式/表格模型
  → 每页模型结果转 page_info
  → 文档完成后 finalize
  → 回调触发流式落盘
```

重要设计：

- 模型按 `(lang, formula_enable, table_enable)` 缓存在 `ModelSingleton`。
- 默认窗口 64 页，多个文档可以共享一个窗口批次。
- 一份文档最后一页完成后立即触发 `on_doc_ready`，输出线程可以开始落盘。
- 页面图像在每个窗口结束后显式关闭，降低长文档峰值内存。
- 自动 OCR 分类位于 `_get_ocr_enable()`，只有需要时才走 OCR。

Pipeline 的核心优势是错误可归因：版面、OCR、公式和表格的原始模型结果仍可保留。

### VLM

主入口：`mineru/backend/vlm/vlm_analyze.py:423-522`。

流程：

```text
页面图像
  → MinerUClient / VLM engine
  → 生成带类型、bbox、index、内容的 page blocks
  → VLM MagicModel 分类整理
  → 转换为共同 page_info
  → 段落、跨页表格、标题后处理
```

VLM 模型输出在 `model_output_to_middle_json.py:23-76` 被拆成：

- image、table、chart
- code、reference、phonetic
- title、text、formula、list
- discarded blocks

然后按模型给出的 `index` 排序。这条路径更依赖 VLM 对结构和阅读顺序的一次性判断。

### Hybrid

主入口：`mineru/backend/hybrid/hybrid_analyze.py:889-1095`。

Hybrid 不是简单地“先 pipeline 再 VLM”，而是按 effort 和页面类型分工：

- 先做 OCR 页面分类和版面预测。
- `medium`：把传统版面结果转成 VLM 需要的 layout blocks，再做定向抽取。
- `high`：使用 VLM 两阶段抽取，获取更完整的页面理解。
- OCR 页面和数字 PDF 分别决定是否保留原生/专家模型结果。
- 公式、OCR sidecar、表格方向和标题切分再合并回模型结果。

`medium` 的关键调用位于 `hybrid_analyze.py:965-1004`；`high` 位于 `1005-1033`。

这种设计的直觉是：版面框和数字 PDF 文本像“已有底稿”，VLM 不必从零重写全部内容，只处理难点。

## 统一中间表示是架构支点

不同后端都有自己的 `*_model_output_to_middle_json.py`，但最终都形成：

```json
{
  "_backend": "pipeline | vlm | hybrid",
  "_version_name": "3.4.4",
  "pdf_info": [
    {
      "page_idx": 0,
      "page_size": [width, height],
      "preproc_blocks": [],
      "para_blocks": [],
      "discarded_blocks": []
    }
  ]
}
```

每个 block 进一步保存：

- `type`
- `bbox`
- `index`
- `lines`
- `spans`
- `content` / `html` / `image_path`
- 表格、图片、公式等嵌套块

价值：

1. 模型输出与最终 Markdown 解耦。
2. 客户端可以从 staged middle JSON 重建最终结果。
3. Markdown、content list v1/v2、可视化和原页引用共享事实源。
4. 后端可以替换，只需适配到相同 IR。
5. 文档级后处理只需面向一种结构。

`title_level_postprocess.py:46-80` 甚至根据 `_backend` 选择对应 finalize，说明 backend 标签是中间表示协议的一部分。

## 文档级后处理

Pipeline finalize 位于 `model_json_to_middle_json.py:216-231`：

1. 公式编号优化。
2. `para_split()` 把页面块组织成段落。
3. `cross_page_table_merge()` 合并跨页表格。
4. 标题层级处理。
5. 内部 block 类型归一化。

### 跨页表格

`mineru/utils/table_merge.py` 不是简单拼字符串，而是解析 HTML 表格并维护：

- 有效列数。
- `rowspan` / `colspan` 占位。
- 头部行签名。
- 首尾数据行指标。
- 跨边界仍占用的单元格。
- 续表 caption 与误识别 caption。

这解释了为什么表格解析不能只输出 Markdown 表格：Markdown 无法完整表达合并单元格，HTML 才能提供结构判断所需信息。

### 标题层级

默认后处理保留模型/规则给出的标题信息；如果配置 `llm_aided.title_aided.enable`，`apply_title_leveling_to_pdf_info()` 会调用额外 LLM 辅助分级。它是可选增强，不应被误解为所有解析都必须调用外部 LLM。

## 输出层

统一 `_process_output()` 位于 `mineru/cli/common.py:259-348`，可生成：

- `*.md`
- `*_content_list.json`
- `*_content_list_v2.json`
- `*_middle.json`
- `*_model.json`
- 原始 PDF/Office 文件
- layout/span bbox 可视化 PDF
- `images/` 中的裁剪图片、表格、图表和公式

Markdown 不是唯一事实源。调试模型错误时应先看 model JSON 和 middle JSON，再看最终 Markdown。

## 服务与扩展

### AsyncTaskManager

`mineru/cli/fast_api.py:926-1219` 负责：

- pending / processing / completed / failed 状态。
- 并发限制和后台 processor。
- task event、等待和取消。
- 结果保留与过期清理。
- 健康统计。

这是进程内任务管理，不是持久化队列。服务重启后的任务恢复、跨节点一致性和外部数据库不在该层解决。

### Router

`mineru/cli/router.py:503-829` 的 `WorkerPool`：

- 管理远程 API URL 和本地 GPU/CPU worker。
- 定期调用 `/health`。
- 校验 API protocol version。
- 按 `(queued + processing + pending assignment) / max concurrency` 打分。
- 同分时优先本地 worker。
- 连续健康失败时尝试重启本地服务。

它是应用层负载均衡器，不是通用集群调度器。任务状态仍映射到具体 upstream task。

## 依赖与可部署性

`pyproject.toml:33-63` 的核心依赖包含：

- `pypdfium2`、`pypdf`、`pdftext`：PDF 读取与原生文本。
- `opencv-python`、Pillow：图像处理。
- `fastapi`、`uvicorn`、`httpx`：服务和客户端。
- Office 文档库：`python-docx`、`pypptx-with-oxml`、`openpyxl`。

可选依赖拆成：

- `pipeline`
- `vlm`
- `vllm`
- `lmdeploy`
- `mlx`
- `s3`
- `gradio`
- `all`

这种拆分让轻量远程客户端不必安装全部 GPU 栈，但组合矩阵也带来版本兼容成本。

## 测试现状

当前固定提交的 `tests/` 只有 4 个文件，核心 pytest 入口是 `tests/unittest/test_e2e.py`。`pyproject.toml:153-166` 的 coverage 配置还显式忽略 CLI、API、Gradio 和模型下载等入口。

结论：

- 源码中有大量可测试的任务管理、router、表格合并和后端分流逻辑。
- 当前公开仓库的本地测试可见面明显小于代码面。
- README benchmark 与模型准确率不能替代服务状态机、失败恢复和协议兼容测试。
- 如果要在生产采用，应为自己的版本补充 API contract、长文档、并发、坏页、跨页表格和升级回归。

## 架构优点

- 输入、后端、中间表示、输出、服务分层清楚。
- 同时保留专家 pipeline、专用 VLM 和 hybrid，覆盖不同成本/准确率需求。
- Office 原生解析避免不必要的视觉转换。
- processing window、流式落盘和模型缓存面向长文档。
- API 与 Router 已具备基础生产形态。
- 中间 JSON 和多级调试产物便于定位问题。

## 主要代价与风险

- 三后端意味着三套模型结果适配和部分重复渲染逻辑。
- 大量几何/表格/段落后处理使边界条件复杂。
- 环境变量参与运行时行为，线程并发时要注意全局状态。
- 进程内任务状态不提供持久恢复。
- 公开测试覆盖与系统复杂度不匹配。
- MinerU 自定义许可证要求超大规模商业用户另取许可，在线服务必须显著标识使用 MinerU。

## 推荐精读顺序

1. `mineru/cli/backend_options.py`：先理解产品公开边界。
2. `mineru/cli/common.py:668-840`：看所有输入和后端如何分流。
3. `mineru/backend/pipeline/pipeline_analyze.py:157-328`：理解窗口、批处理和流式完成。
4. `mineru/backend/hybrid/hybrid_analyze.py:889-1095`：理解 hybrid 的真实分工。
5. 三个 `*_model_output_to_middle_json.py`：比较不同模型怎样汇入同一 IR。
6. `mineru/utils/table_merge.py`：研究最复杂的文档级规则之一。
7. `mineru/cli/fast_api.py` 与 `router.py`：最后看服务化。

## 关键思考点

1. 为什么 client 默认先启动 API，而不是直接 import `do_parse()`？
2. Pipeline 和 VLM 的 `middle_json` 是否真的等价，哪些字段只在某条后端存在？
3. `medium` effort 为什么能比 `high` 快很多，它具体省掉了哪些 VLM 工作？
4. 客户端 finalize 与服务端 finalize 如何保证只执行一次？
5. Router 的负载分数为什么要加入 `pending_assignments`？
6. 如果服务进程在任务完成前退出，现有 AsyncTaskManager 能恢复什么？
7. 跨页表格规则应怎样构造最小回归样本，避免“修一个表、坏另一类表”？
