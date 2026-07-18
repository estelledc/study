---
title: "零基础实验：同一份 PDF，为什么会得到不同“正确答案”"
sidebar:
  hidden: true
---
# 零基础实验：同一份 PDF，为什么会得到不同“正确答案”

> 目标：不用模型权重或 GPU，对比轻量 Markdown 转换与结构化 Node 解析。
>
> 代码：[`labs/document_parser_lab.py`](labs/document_parser_lab.py)

## 1. 先建立生活类比

两个人整理同一张报纸：

- A 把所有内容按阅读顺序抄成一篇纯文本。
- B 把内容分成三张卡片，并记录每张卡来自页面哪个矩形。

如果四句关键话都抄到了，二人的“文本覆盖”都可能合格；但 B 多了一条回到原页的
路径，A 更适合直接阅读。不能只按字符数宣布谁更好。

类比边界：真实解析器还要处理表格、公式、图片、跨页和扫描件，本实验只覆盖一页
数字文本 PDF。

## 2. 五个验收维度

| 维度 | 问题 |
|---|---|
| Text | 关键内容是否存在、是否重复或幻觉？ |
| Order | 人类阅读顺序是否恢复？ |
| Structure | 标题、段落、表格和公式是否保留关系？ |
| Provenance | 能否回到 page/bbox/原始对象？ |
| Operations | 速度、内存、警告、失败率和重试如何？ |

只测一个维度，无法推出整份文档“解析正确”。

## 3. 两个解析器的产品合同

### MarkItDown

```text
file/stream
  -> type guesses
  -> priority converter
  -> Markdown
```

目标是让多种普通文件快速变成适合 LLM 阅读的 Markdown。

### OpenParse

```text
PDF
  -> text/table ingest
  -> Element
  -> processing steps
  -> Node
  -> ParsedDocument
```

目标是为检索构造带 element、page 和 bbox 的 Node。

二者不应只用一个“准确率”排名。

## 4. 输入样本

复用 MarkItDown pinned commit 的测试 fixture：

```text
research-worktrees/markitdown/
  packages/markitdown/tests/test_files/test.pdf
```

属性：

```text
PDF 1.4
1 page
92,971 bytes
数字文本 PDF
```

选择它的原因：

- 已进入上游测试语料；
- 无需下载新数据；
- 有明确 expected Markdown；
- 含多个段落，可检查阅读顺序；
- 不需要 OCR/GPU。

它不能代表扫描件、表格或公式。

## 5. 创建一次性环境

两个项目都从本地 pinned 源码安装。为避免 setuptools 在外部 clone 写入 `build/`
和 `*.egg-info`，先复制到 `/tmp`：

```bash
scratch="$(mktemp -d /tmp/document-parser-src.XXXXXX)"
cp -R research-worktrees/markitdown/packages/markitdown \
  "$scratch/markitdown"
cp -R research-worktrees/open-parse \
  "$scratch/openparse"

uv venv /tmp/document-parser-venv-20260717 \
  --python /opt/homebrew/bin/python3.11
uv pip install \
  --python /tmp/document-parser-venv-20260717/bin/python \
  "$scratch/markitdown[pdf]" \
  "$scratch/openparse" \
  pytest
```

本轮实际环境路径：

```text
/tmp/document-parser-venv-20260717
```

## 6. 运行同文档对照

```bash
cd src/content/docs/research/mineru-ecosystem-study/labs
PYTHONDONTWRITEBYTECODE=1 \
/tmp/document-parser-venv-20260717/bin/python document_parser_lab.py
```

2026-07-17 输出：

```text
markitdown: phrases=4/4 order=pass chars=5194 units=1 source_boxes=0
openparse: phrases=4/4 order=pass chars=5255 units=3 source_boxes=3
```

四个锚点：

```text
Introduction
Large language models (LLMs)
Customizable and conversable agents
Conversation programming
```

两者都找到 4/4，且相对顺序正确。

## 7. 怎样读这组数字

### `phrases=4/4`

只证明四个短语存在，不证明全文没有漏字、重复或幻觉。

### `order=pass`

只证明四个锚点顺序正确，不证明每个中间段落顺序正确。

### `chars`

不参与 gate。HTML `<br>`、Markdown 换行和 Node 拼接都会改变字符数。

### `units`

MarkItDown 把结果作为一个 Markdown 文档；OpenParse 返回 3 个 Node。Node 多不等于
切分更合理，仍需用真实 RAG 查询验证。

### `source_boxes`

OpenParse 的 Node 保留 bbox，MarkItDown 的最终 Markdown 没有。它证明 provenance
入口存在，不证明 bbox 与人工标注完全一致。

## 8. 运行七个测试

```bash
PYTHONDONTWRITEBYTECODE=1 \
/tmp/document-parser-venv-20260717/bin/python \
  -m unittest -v test_document_parser_lab.py
```

结果：

```text
Ran 7 tests
OK
```

| 测试 | 证明什么 |
|---|---|
| normalize | 换行、空格和大小写不会误伤短语匹配 |
| missing phrase | coverage 会暴露关键内容缺失 |
| order | 内容齐全但顺序错误仍失败 |
| structure separation | units/source boxes 不混入文本分数 |
| text-only | 文本可通过，但 provenance 可明确为 0 |
| same PDF | 两个真实 parser 使用同一输入和同一 gate |
| source structure | OpenParse 的 Node/bbox 能力单独验证 |

系统 Python 没安装两个 parser 时：

```text
5 passed
2 skipped
```

skip 只证明依赖缺失，不能写成“integration 通过”。

## 9. MarkItDown 真实项目测试

```bash
cd research-worktrees/markitdown
PYTHONDONTWRITEBYTECODE=1 \
/tmp/document-parser-venv-20260717/bin/python -m pytest -q \
  packages/markitdown/tests/test_pdf_memory.py \
  packages/markitdown/tests/test_pdf_tables.py \
  packages/markitdown/tests/test_pdf_masterformat.py
```

结果：

```text
33 passed, 2 skipped
```

这比单次 demo 多覆盖：

- page cleanup；
- plain/form page 路由；
- table；
- borderless table；
- master format。

## 10. OpenParse 失败卡

从仓库根执行官方 pytest，仍在 session start 退出：

```text
Pytest must be run from the project root directory
```

实际 `src/tests/conftest.py` 计算：

```python
Path(__file__).resolve().parent / "src"
```

得到不存在的 `src/tests/src`。分类：

```text
test harness contract failure
```

不是：

```text
parser output failure
```

本实验通过公开 `DocumentParser.parse()` 完成 API E2，但没有冒充官方 suite 通过。

## 11. 输入 PDF 的 warning

解析时出现：

```text
Object <id> not defined.
Overwriting cache for 0 <id>
```

两套 parser 最终都返回内容并通过最小 gate。正确处理方式：

1. 保存 warning；
2. 检查输出；
3. 把样本加入 malformed-PDF 回归集；
4. 不因返回成功就删除 warning；
5. 不因 warning 存在就自动判整份输出失败。

## 12. 为什么本轮不跑 MinerU 模型

MinerU full e2e 需要：

- Torch/Transformers/ONNX Runtime；
- pipeline 或 VLM extra；
- layout/OCR/formula/table 模型权重；
- 模型下载时间和磁盘；
- GPU 或可接受的 CPU 运行预算。

本轮没有这些预先授权的资源。边界：

```text
MinerU architecture = E1
MarkItDown/OpenParse small PDF = E2
MinerU model quality = unverified
```

不能用轻量 parser 的 E2 给 MinerU 升级证据等级。

## 13. 常见误区

1. **输出字符更多，质量更高。**
   可能只是格式标记、重复或换行不同。

2. **关键文本都在，解析就正确。**
   还要检查顺序、表格、层级、bbox 和多余内容。

3. **有 bbox 就能可靠引用。**
   还要验证坐标系、页码、裁剪和人工标注误差。

4. **官方测试没跑，所以项目不能用。**
   应区分 harness failure、fixture blocker 和 API 行为。

5. **轻量 baseline 通过，所以不用 VLM。**
   只对数字文本 PDF 成立；扫描和复杂视觉需要另测。

## 14. 应用题与检查点

### 题 1

Parser A 4/4 短语但顺序失败，Parser B 3/4 短语但顺序正确，谁更好？

检查点：不能给总答案；先确认业务是关键字段完整还是阅读顺序，再分别报告失败。

### 题 2

OpenParse 有 bbox，能直接说比 MarkItDown 更适合所有 RAG 吗？

检查点：不能。还要测 Node 切分、检索命中、bbox 准确率、延迟和成本。

### 题 3

一份 PDF 返回 warning 但 gate 通过，应该忽略 warning 吗？

检查点：不能；保留为输入健康证据并加入回归集，但不要自动等同 output failure。

### 题 4

为什么不把 MinerU README 的 benchmark 当成本机 E2？

检查点：没有固定本机模型、权重、配置、硬件、数据和实际命令，证据仍是项目自述。

## 15. 下一步怎样扩展

按风险逐层增加样本：

1. 一页数字文本；
2. 双栏；
3. borderless table；
4. 公式；
5. 扫描；
6. 旋转/损坏；
7. 跨页表格；
8. 100 页长文档。

每加一类，先写 expected invariants，再运行 parser；不要先看输出再决定什么算正确。
