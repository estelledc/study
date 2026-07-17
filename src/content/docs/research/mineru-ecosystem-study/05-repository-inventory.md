# 仓库与版本清单

**快照日期：** 2026-07-16
**GitHub 账号：** `estelledc`
**本地根目录：** `explorations/research/repos/`
**fork 策略：** 仅默认分支
**clone 策略：** `--depth=1 --filter=blob:none --sparse --single-branch`

## 远端样本

GitHub 数字是研究时点快照，只用于说明项目规模和活跃度，不是质量排名。

| 上游 | Stars | Forks | 最近 push | GitHub 识别许可 |
|---|---:|---:|---|---|
| `opendatalab/MinerU` | 74,821 | 6,293 | 2026-07-15 | NOASSERTION，自定义 MinerU License |
| `opendatalab/PDF-Extract-Kit` | 9,790 | 740 | 2025-01-03 | AGPL-3.0 |
| `opendatalab/OmniDocBench` | 1,894 | 186 | 2026-06-26 | Apache-2.0 |
| `opendatalab/DocLayout-YOLO` | 2,227 | 170 | 2025-04-14 | AGPL-3.0 |
| `opendatalab/UniMERNet` | 490 | 44 | 2025-09-28 | Apache-2.0 |
| `opendatalab/MinerU-Diffusion` | 623 | 40 | 2026-06-18 | MIT |
| `docling-project/docling` | 63,285 | 4,471 | 2026-07-15 | MIT |
| `datalab-to/marker` | 37,557 | 2,642 | 2026-07-07 | GPL-3.0 |
| `PaddlePaddle/PaddleOCR` | 85,622 | 11,025 | 2026-07-15 | Apache-2.0 |
| `allenai/olmocr` | 19,098 | 1,572 | 2026-03-25 | Apache-2.0 |
| `rednote-hilab/dots.ocr` | 9,005 | 800 | 2026-03-24 | MIT |
| `Yuliang-Liu/MonkeyOCR` | 6,601 | 459 | 2026-07-14 | Apache-2.0 |
| `deepseek-ai/DeepSeek-OCR` | 23,594 | 2,175 | 2026-01-27 | MIT |
| `zai-org/GLM-OCR` | 7,162 | 648 | 2026-04-21 | Apache-2.0 |
| `bytedance/Dolphin` | 9,035 | 774 | 2026-03-25 | NOASSERTION，Qwen Research License |
| `chatdoc-com/OCRFlux` | 2,523 | 153 | 2026-04-14 | Apache-2.0 |
| `microsoft/markitdown` | 166,597 | 11,947 | 2026-06-24 | MIT |
| `Unstructured-IO/unstructured` | 15,144 | 1,272 | 2026-07-15 | Apache-2.0 |
| `Filimoa/open-parse` | 3,163 | 143 | 2026-05-17 | MIT |

## Fork 与本地版本

| 项目 | 个人 fork | 本地目录 | Pinned commit |
|---|---|---|---|
| MinerU | `estelledc/MinerU` | `repos/MinerU` | `79d6d8d79fb8` |
| PDF-Extract-Kit | `estelledc/PDF-Extract-Kit` | `repos/PDF-Extract-Kit` | `fdb25fd4bd90` |
| OmniDocBench | `estelledc/OmniDocBench` | `repos/OmniDocBench` | `2b161d010d2e` |
| DocLayout-YOLO | `estelledc/DocLayout-YOLO` | `repos/DocLayout-YOLO` | `32a8ec276b3d` |
| UniMERNet | `estelledc/UniMERNet` | `repos/UniMERNet` | `5a2c80d96b1d` |
| MinerU-Diffusion | `estelledc/MinerU-Diffusion` | `repos/MinerU-Diffusion` | `a0189ced794c` |
| Docling | `estelledc/docling` | `repos/docling` | `e548307e8d32` |
| Marker | `estelledc/marker` | `repos/marker` | `ef16c2caa29d` |
| PaddleOCR | `estelledc/PaddleOCR` | `repos/PaddleOCR` | `211989f046cc` |
| olmOCR | `estelledc/olmocr` | `repos/olmocr` | `f7cfe4c22098` |
| dots.ocr | `estelledc/dots.ocr` | `repos/dots-ocr` | `36d7248878f1` |
| MonkeyOCR | `estelledc/MonkeyOCR` | `repos/MonkeyOCR` | `70f6e2c5583a` |
| DeepSeek-OCR | `estelledc/DeepSeek-OCR` | `repos/DeepSeek-OCR` | `09eaf526153e` |
| GLM-OCR | `estelledc/GLM-OCR` | `repos/GLM-OCR` | `cef4d0ea120d` |
| Dolphin | `estelledc/Dolphin` | `repos/Dolphin` | `befa5dad986f` |
| OCRFlux | `estelledc/OCRFlux` | `repos/OCRFlux` | `c1b315aa4c83` |
| MarkItDown | `estelledc/markitdown` | `repos/markitdown` | `e144e0a2be95` |
| Unstructured | `estelledc/unstructured` | `repos/unstructured` | `d309caf8ee20` |
| OpenParse | `estelledc/open-parse` | `repos/open-parse` | `6c2da9b5da56` |

完整 SHA 保存在对应 `explorations/_meta/*.md` 项目卡。

## Sparse checkout 范围

| 项目 | 检出目录 |
|---|---|
| MinerU | `docs mineru projects tests` |
| PDF-Extract-Kit | `configs docs pdf_extract_kit project requirements scripts` |
| OmniDocBench | `configs metrics signatures skills src tools` |
| DocLayout-YOLO | `doclayout_yolo mesh-candidate_bestfit` |
| UniMERNet | `MFD cdm configs models scripts unimernet` |
| MinerU-Diffusion | `docs engines mineru_diffusion scripts` |
| Docling | `docling packages scripts tests` |
| Marker | `benchmarks examples marker signatures tests` |
| PaddleOCR | `api_sdk configs deploy mcp_server paddleocr ppocr ppstructure skills tests tools` |
| olmOCR | `docs olmocr scripts tests` |
| dots.ocr | `demo docker dots_ocr tools` |
| MonkeyOCR | `api demo docker docs magic_pdf tools` |
| DeepSeek-OCR | `DeepSeek-OCR-master` |
| GLM-OCR | `apps examples glmocr skills` |
| Dolphin | `demo utils` |
| OCRFlux | `eval ocrflux` |
| MarkItDown | `packages` |
| Unstructured | `scripts test_unstructured test_unstructured_ingest typings unstructured` |
| OpenParse | `docs src` |

未检出的典型目录：

- 模型权重。
- 数据集。
- 大型 assets/images。
- 构建产物和虚拟环境。
- 与当前主链无关的仓库历史。

## Remote 契约

所有仓库满足：

```text
origin   = git@github.com:estelledc/<fork>.git
upstream = https://github.com/<owner>/<repo>.git
```

例：

```text
MinerU:
  origin   git@github.com:estelledc/MinerU.git
  upstream https://github.com/opendatalab/MinerU.git
```

含义：

- `origin` 是个人可写 fork。
- `upstream` 是只读事实源。
- 当前研究不在任何外部仓修改或提交。
- 将来贡献时必须从最新 upstream 基线建分支。

## 本地验证结果

完成后逐仓检查：

- `git status --porcelain`：19 个仓库均为 0 行。
- `origin`：19 个均指向个人 fork。
- `upstream`：19 个均指向原项目。
- 父仓 `git check-ignore`：`explorations/research/repos/*/` 命中 `.gitignore`。
- 父仓没有追踪任何外部源码文件。

## OpenParse LFS 限制

OpenParse sparse checkout 第一次展开 `src/` 时尝试下载：

```text
src/evals/data/full-pdfs/Response_Letter.pdf
```

GitHub 返回：

```text
This repository exceeded its LFS budget.
```

处理方式：

```bash
GIT_LFS_SKIP_SMUDGE=1 git -C explorations/research/repos/open-parse \
  sparse-checkout set --cone src docs
```

结果：

- 源码和文档成功检出。
- LFS 测试 PDF 只保留指针/缺失对象。
- 不把上游 LFS 故障伪装为本地 clone 完整成功。
- 本轮静态架构研究不依赖这些 PDF。

## 候选池与排除理由

### 作为依赖记录、未单独 fork

| 项目 | 原因 |
|---|---|
| pypdf | 已有个人 fork；底层 PDF 库，不是端到端文档解析系统 |
| pypdfium2 | PDFium Python binding，属于渲染/读取层 |
| pdftext | 原生 PDF text 抽取层 |
| vLLM / SGLang / LMDeploy | 通用模型运行时 |
| fast-langdetect / Magika | 语言与文件类型基础能力 |
| TableStructureRec | 单一表格子能力 |

### 作为历史/相邻项目记录、未纳入深度样本

| 项目 | 原因 |
|---|---|
| Magic-Doc | 历史 Office/PDF 工具；当前 MinerU 已原生覆盖 Office |
| Magic-HTML / MinerU-HTML | 网页主内容提取，不是本轮文档主线 |
| OpenDataLoader PDF | 新兴项目，适合后续独立 benchmark；本轮 19 项目已覆盖其“规则 + hybrid”路线 |
| Kreuzberg | 统一传统工具链，和 MarkItDown/Unstructured 的研究价值部分重叠 |
| 商业 OCR/API | 无完整源码，不能执行同级架构深读 |

### 榜单模型没有全部 fork

OmniDocBench v1.6/v1.7 涵盖几十个专用和通用 VLM。全部 fork 会导致：

- 大量仓库只有推理样例，架构同质。
- 通用 VLM 不属于文档解析系统。
- 模型权重通常不在 GitHub。
- 研究范围失去有限验收标准。

本轮选择 dots.ocr、DeepSeek-OCR、GLM-OCR、Dolphin、MonkeyOCR、olmOCR、OCRFlux 和 MinerU-Diffusion，覆盖主要创新方向。

## 恢复命令示例

项目卡中的 `clone_url` 可直接恢复个人 fork。以 MinerU 为例：

```bash
git clone --depth=1 --filter=blob:none --sparse --single-branch \
  git@github.com:estelledc/MinerU.git \
  explorations/research/repos/MinerU

git -C explorations/research/repos/MinerU remote add upstream \
  https://github.com/opendatalab/MinerU.git

git -C explorations/research/repos/MinerU sparse-checkout set --cone \
  docs mineru projects tests
```

新机器日常恢复默认拉最新 fork；需要复盘本研究结论时，再 checkout 项目卡的 `pinned_commit`。
