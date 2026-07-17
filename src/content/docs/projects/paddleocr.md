---
title: PaddleOCR — 多语言 OCR 与文档解析平台
来源: https://github.com/PaddlePaddle/PaddleOCR
日期: 2026-05-31
分类: 数据科学与 AI / 计算机视觉
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: system
  canonical_source: https://github.com/PaddlePaddle/PaddleOCR
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-07-17'
  immutable_revision: 211989f046cc1878460f9e65574690c00a127a1a
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-07-17'
  review_after: '2026-10-17'
  applicable_version: 3.7.0
---

## 是什么

PaddleOCR 是 PaddlePaddle 团队维护的多语言 OCR 与文档解析平台。固定 3.7.0 源码同时包含 PP-OCRv6 文字识别、PP-StructureV3 结构化解析、PaddleOCR-VL、训练代码、端云部署、API SDK 和 MCP 接入。

日常类比：它像一座文档加工厂，而不是一台单功能识字机。

- PP-OCR 像识字工位：先定位文字，再纠正方向，最后识别字符串。
- PP-StructureV3 像文档编辑部：在 OCR 之外处理版面、表格、公式、图表和印章等模块。
- PaddleOCR-VL 像另一条 VLM 生产线：用视觉语言模型直接理解复杂文档元素。

它和 [[cvat]] 不一样——CVAT 是给人手工标的工具，PaddleOCR 是直接吐结果的端到端引擎。

## 为什么重要

不了解 PaddleOCR，下面几件事就讲不通：

- 为什么高层 `PaddleOCR()` 看起来很薄：真正的 pipeline 创建和大量推理逻辑位于版本绑定的 PaddleX 依赖
- 为什么 OCR 与文档解析不能混称一种能力：文字框/字符串正确，不代表表格、公式和阅读顺序正确
- 为什么同仓库同时保留 `paddleocr/_pipelines`、`ppocr` 和 `ppstructure`：产品 API、训练实现与历史流程处于不同层
- 为什么部署验证必须绑定模型、设备、后端和文档集，而不能只引用 README 的单个 benchmark 数字

## Pipeline 架构与流程

固定源码中的高层主链是：

```text
Python / CLI 参数
  → PaddleXPipelineWrapper
  → 读取 PaddleX pipeline config
  → 合并 model / subpipeline override
  → paddlex.create_pipeline()
  → predict iterator
  → PaddleX result / Markdown / JSON
```

1. **Wrapper 层**：`paddleocr/_pipelines/base.py` 负责读取配置、合并 override 和调用 `create_pipeline()`。因此只读 PaddleOCR 仓库看不到完整推理实现，必须把 PaddleX 版本边界纳入分析。

2. **OCR pipeline**：`PaddleOCR` 将文档方向、去畸变、文字行方向、检测和识别参数映射到 pipeline config。固定版本支持 PP-OCRv3 到 v6，但具体语言与版本组合有限制。

3. **结构化 pipeline**：`PPStructureV3` 再加入 layout、表格、公式、图表、印章和区域检测等模块。每个模块可以单独开关或替换模型，但组合正确性需要端到端评测。

4. **训练与交付层**：`ppocr/` 保留数据、网络、loss、metric 和训练脚本；`deploy/`、`api_sdk/`、`mcp_server/` 覆盖不同运行形态。仓库许可证是 Apache-2.0，但具体模型权重、数据集和外部服务仍需分别核对。

## 实践示例

### 示例 1：用 3.x API 检查文字结果合同

```python
from paddleocr import PaddleOCR

pipeline = PaddleOCR(lang="ch", ocr_version="PP-OCRv6")
results = pipeline.predict("invoice.jpg")

for result in results:
    print(result["rec_texts"])
    print(result["rec_scores"])
    print(result["dt_polys"])
```

固定测试用 `predict()` 验证 `dt_polys`、`rec_texts` 等字段。真实运行会下载/加载模型并依赖 PaddleX/PaddlePaddle，本文没有执行这段代码。

### 示例 2：结构解析与 OCR 是不同验收对象

```python
from paddleocr import PPStructureV3

pipeline = PPStructureV3(
    use_table_recognition=True,
    use_formula_recognition=True,
    use_chart_recognition=False,
)
results = pipeline.predict("financial_report.png")

for result in results:
    print(result["overall_ocr_res"]["rec_texts"])
```

这只能确认整体 OCR 字段存在。表格结构、公式 LaTeX、layout 标签和 reading order 需要各自 rubric，不能因为有文本输出就判整页成功。

### 示例 3：追踪高层参数到外部运行时边界

```text
PPStructureV3(use_table_recognition=False)
  → _get_paddlex_config_overrides()
  → merged PaddleX YAML
  → create_pipeline(config=...)
```

这是最小源码练习：选一个参数，追到 wrapper 生成的 config 后停止。继续理解节点执行、batch 和 backend 时，应切到当前锁定的 PaddleX 源码，而不是在本仓猜实现。

## 踩过的坑

1. **复制 2.x 教程到 3.x**：`ocr(..., cls=True)`、`PPStructure(...)` 和旧参数仍可能出现在网上；先看当前 wrapper 的 deprecated mapping 和测试。
2. **把高层仓库当完整运行时**：大量 inference 逻辑在 `paddlex>=3.7,<3.8`，排查时必须记录两个包的实际版本。
3. **只看平均准确率**：模型版本、语言、硬件、页面类型和 benchmark 版本都会改变结论；至少保留分类型质量、p50/p95 和失败率。
4. **把 OCR 字符正确等同于文档正确**：合并单元格、跨页表、公式、印章和阅读顺序需要单独检查。
5. **只核对仓库许可证**：应用代码、依赖、模型权重、训练/评测数据和云服务条款是不同层。

## 适用 vs 不适用场景

**适用**：

- 需要多语言 OCR、结构解析、训练与多端部署的团队
- 愿意按文档类型验证 PP-OCR、PP-StructureV3 或 PaddleOCR-VL 的差异
- 需要保留模型训练和领域微调能力，而不是只调用闭源 API
- 能管理 PaddlePaddle/PaddleX 版本、模型资源和部署后端

**不适用**：

- 只需解析单一、简单文本格式，引入完整模型栈得不偿失
- 无法建立真实文档评测集，却要求高风险字段零错误
- 只接受 PyTorch 原生运行时且不能承担转换/双框架验证
- 需要像素级文档还原，但不准备评估版面、表格和跨页结构

## 固定版本边界

- 本文绑定 `PaddlePaddle/PaddleOCR@211989f0...`，提交日期为 2026-06-26。
- `pyproject.toml` 绑定 `paddlex[ocr-core]>=3.7.0,<3.8.0`，README 对应 PaddleOCR 3.7.0。
- 高层 API 支持旧参数映射，但主调用已是 wrapper `predict()`；历史教程必须逐项复核。
- 仓库代码为 Apache-2.0；具体模型、数据集、转换产物和在线 API 需单独核查。
- 本文只做固定源码静态审查，没有安装 Paddle/PaddleX、下载权重或执行 OCR，状态保持 `UNVERIFIED`。

## 学到什么

1. **OCR 与文档解析是多阶段系统**：字符、表格、公式和阅读顺序需要不同证据。
2. **Wrapper 边界必须可追踪**：高层参数进入 PaddleX config 后，源码分析责任也跨到依赖仓。
3. **旧新 API 共存会制造教程漂移**：固定包版本、import path 和返回 schema 比记住一段代码更重要。
4. **训练代码与产品 API 同仓是能力也是负担**：可微调、可部署，但兼容矩阵和认知成本更大。
5. **许可核验要分层**：仓库 Apache-2.0 不能自动覆盖所有权重、数据和服务。

## 应用型自测

1. `PaddleOCR.predict()` 的 `rec_texts` 全部正确，能否判定扫描财报解析成功？
2. PaddleOCR wrapper 传入 `use_table_recognition=False`，要证明它真实生效，源码追踪应停在哪里？
3. README 给出某硬件上的速度提升，生产选型能否直接套到自己的扫描合同？

检查点：

1. 不能。还要验证 layout、表格结构、公式、阅读顺序和跨页关系。
2. 先确认 override 进入合并后的 PaddleX config；继续证明执行行为时必须读匹配版本的 PaddleX 或做运行实验。
3. 不能。需要绑定模型、后端、硬件、batch、文档集和冷/热启动条件重测。

## 延伸阅读

- 固定源码：[PaddlePaddle/PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR) —— 本文绑定提交 `211989f046cc1878460f9e65574690c00a127a1a`
- 论文：PP-OCRv3 / PP-OCRv4 / PP-Structure 技术报告（arxiv 上搜 PP-OCR 都能找到）
- DBNet 论文：Real-time Scene Text Detection with Differentiable Binarization (AAAI 2020)
- SVTR 论文：SVTR — Scene Text Recognition with a Single Visual Model (IJCAI 2022)
- [[cvat]] —— 视觉数据标注平台，给 PaddleOCR 微调准备数据
- [[easyocr]] —— PyTorch 生态的 OCR 替代品

## 关联

- [[cvat]] —— 给 PaddleOCR 微调准备标注数据的上游工具
- [[dbnet-2020]] —— PaddleOCR detection 阶段的核心算法
- [[pytorch]] —— 主流深度学习框架，与 paddlepaddle 是生态竞争对手
- [[onnx]] —— PaddleOCR 与 PyTorch 项目集成时常用的导出格式
- [[mobilenet-v3]] —— PaddleOCR 检测和识别骨干的轻量化基底
- [[svtr-2022]] —— PP-OCRv3 起识别阶段的核心 Transformer 架构

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[paddle-lite]] —— Paddle Lite — 端侧轻量推理引擎
- [[unstructured]] —— Unstructured — 把任意文档解析成 LLM 能吃的元素列表
