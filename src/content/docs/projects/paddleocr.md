---
title: PaddleOCR — 中文 OCR 最强开源方案
来源: https://github.com/PaddlePaddle/PaddleOCR
日期: 2026-05-31
子分类: 数据科学与 AI
分类: 机器学习
难度: 中级
provenance: pipeline-v3
---

## 是什么

PaddleOCR 是百度 PaddlePaddle 团队 2020 年开源的**多语言 OCR 工具包**，GitHub ~44k star，是中文场景下最广泛使用的开源 OCR 方案。它的主线产品叫 **PP-OCR**（detection + 方向分类 + recognition 三段式），扩展产品叫 **PP-Structure**（在 OCR 之上再做版面分析、表格识别、票据字段抽取）。

日常类比：

- 一般 OCR 像一个只会读单字的小学生——给他一张图，他说 "这个字是 '中'"
- PaddleOCR 像一个流水线工厂：先有质检员找出图里所有文字框（detection），再由翻转判定员把倒着的拍正（direction classifier），再由抄写员一框一框地读字（recognition），最后还有一个文档管家把读出来的字摆回原表格、原段落里（PP-Structure）

它和 [[cvat]] 不一样——CVAT 是给人手工标的工具，PaddleOCR 是直接吐结果的端到端引擎。

## 为什么重要

不了解 PaddleOCR，下面几件事就讲不通：

- 为什么国内中小公司做票据 / 合同 / 工单 OCR 第一反应是它而不是 Tesseract——中文精度差着代沟
- 为什么"扫描表格转 Excel"这种产品功能能两周做出来——PP-Structure 已经把表格 → HTML 这条路打通
- 为什么短视频字幕擦除 / 古籍数字化 / 工业仪表读数都共享同一套底子——PaddleOCR 暴露的不是黑盒 API，而是可微调的 **训练脚本** + 预训练权重
- 为什么 PyTorch 一统江湖之后，OCR 圈子里 PaddlePaddle 还守得住——它在中文 OCR 这个垂直赛道上的工程化做得极深

## 核心要点

PaddleOCR 的主线管线 PP-OCR 拆成 **三段**：

1. **文字检测（detection）**：用 [[dbnet-2020]] 系骨干（PP-OCR 把 backbone 换成 MobileNetV3 轻量化），在图片上画出每个文字行的多边形框。日常类比：你看一份合同，先用荧光笔圈出所有有字的地方，但还没读字。

2. **方向分类（direction classifier）**：一个非常小的网络判断这个框是正的还是倒着的（0° / 180°）。这一步是为了应对手机拍照倒着拍 / 扫描仪喂反了。

3. **文字识别（recognition）**：把每个框抠出来送进 **SVTR_LCNet** 骨干（PP-OCRv3 起的设计：纯 Transformer 的 SVTR + 轻量 CNN 的 PP-LCNet 组合），输出这一框里的字符串。这一步替代了传统 CRNN + CTC 的三段式管线。

PP-OCRv4（2023）相对 v3 的提升主要不是结构变化，而是 **训练侧的蒸馏全家桶**：

- **CML（Collaborative Mutual Learning）**：让一个大学生模型和一个小学生模型互相学习，比传统师生蒸馏多一条互动通道
- **UDML（Unified Deep Mutual Learning）**：把多个识别头的输出统一蒸馏，强迫它们在更细粒度上对齐
- **DSR（Distillation with Stricter Rules）**：更严格的蒸馏规则，让学生模型更逼近教师
- **PFHead**：检测头加入并行融合分支，提高小文字 / 密集文字的检出率

四件套加起来，中文 Hmean 比 v3 提升约 10%，移动端整套模型仍在 10 MB 量级。

## 实践案例

### 案例 1：30 行 Python 把一张票据读出来

```python
from paddleocr import PaddleOCR

ocr = PaddleOCR(use_angle_cls=True, lang='ch')
result = ocr.ocr('invoice.jpg', cls=True)

for line in result[0]:
    box, (text, score) = line
    print(f'{text}  (置信度 {score:.2f})')
```

`use_angle_cls=True` 打开方向分类器，`lang='ch'` 选中文识别模型。**装包 + 推理三行代码**，这是 PaddleOCR 在国内 OCR 圈起家的核心卖点。

### 案例 2：PP-Structure 把扫描表格转成 Excel 可用结构

```python
from paddleocr import PPStructure

table_engine = PPStructure(table=True, ocr=True, show_log=False)
result = table_engine('financial_report.png')

for region in result:
    if region['type'] == 'table':
        html = region['res']['html']  # 直接是 HTML 表格字符串
```

PP-Structure 把扫描页拆成 "图 / 表 / 文字 / 标题" 四类区域，遇到表格再调表格识别模型，输出 HTML 结构 + 单元格文字——下游用 pandas.read_html 一行就拿到 DataFrame。

### 案例 3：用 PaddleOCR 训练脚本微调古籍模型

PaddleOCR 不只是 SDK，它把**训练 / 评估 / 导出**全套脚本都开源了。古籍竖排场景下默认横排模型读不出来，正确做法是：

1. 用 PPOCRLabel 标 ~5000 行竖排古籍
2. 跑 `tools/train.py -c configs/rec/PP-OCRv4/...` 在中文预训练权重上微调
3. 用 `tools/export_model.py` 导出为推理模型，部署到 PaddleInference / PaddleLite

这是它和商用 API（阿里云 / 腾讯云）的根本区别——**模型在你自己手里**，长尾场景能继续往上叠。

## 踩过的坑

1. **paddlepaddle 框架冲突**：和 PyTorch 项目共存要同时装两套框架，or 把 PaddleOCR 模型导出 ONNX 用 onnxruntime 跑，不然 import 时容易 CUDA 版本打架
2. **GPU 不一定更快**：模型很轻（移动版 10 MB），batch 小的时候 CPU 推理比 GPU 还快——别下意识 `use_gpu=True`，先 benchmark
3. **方向分类器对中英混排不友好**：英文行偶尔被判成 180°，结果倒着读出乱码——纯英文场景直接关 `use_angle_cls=False`
4. **PP-Structure 表格识别的极限**：手写表 / 合并单元格 / 跨页表仍是难点，需要后处理（甚至人工兜底）
5. **古籍 / 艺术字 / 竖排** 默认模型基本读不出，必须微调，不要指望 zero-shot

## 适用 vs 不适用场景

**适用**：

- 中文票据 / 合同 / 工单 / 标准印刷文档的批量 OCR
- 扫描 PDF / 图片表格 → 结构化数据（pandas / Excel）
- 工业场景：仪表读数 / 物流单据 / 包装标签
- 想自训练 / 微调 OCR 模型，但又不想从零写训练框架

**不适用**：

- 已经在 PyTorch 重度生态里，**只为了 OCR** 引入 paddlepaddle 不划算 → 用 [[easyocr]] 或导出 ONNX
- 极端长尾场景（古籍 / 手写 / 艺术字）**不能微调**的项目 → 上商用 API 兜底
- 需要语义理解（不只是认字，还要理解含义）→ 接 [[paddlenlp]] 或 LLM 后处理
- 多模态文档理解（图文并茂、复杂版面）→ Donut / LayoutLMv3 这类端到端模型更合适

## 历史小故事（可跳过）

- **2020**：PaddleOCR 仓库开源，首版 PP-OCR 主打 "8.6 MB 整套模型"，瞄准移动端
- **2022**：PP-OCRv3 + SVTR_LCNet 识别骨干上线；同年 PP-Structure 加入表格识别
- **2023**：PP-OCRv4 把蒸馏（CML / UDML / DSR）做成全家桶，中文 Hmean 跃升
- **2024**：PP-StructureV2 集成版面分析 + 表格 + KIE 全链路，开始往 "文档智能" 方向走
- **后续**：社区把 PaddleOCR 模型陆续导出 ONNX / TensorRT，跨框架部署成熟；同时 LLM 多模态崛起（GPT-4V / Qwen-VL）开始抢"复杂版面理解"市场，PaddleOCR 的护城河收窄到"高吞吐 + 可微调 + 低成本"三角

## 学到什么

1. **OCR 不是单一模型，是流水线**：detection / direction / recognition / structure 各自是独立子问题，PaddleOCR 的工程价值就在把这条线接成一根
2. **轻量化是中文 OCR 的命根**：移动端 10 MB 整套模型才能在国内市场跑得开，这是 PaddleOCR 选 MobileNetV3 + PP-LCNet 的根本原因
3. **蒸馏 > 换结构**：v3 → v4 提升 10% 没靠改架构，全靠 CML / UDML / DSR 蒸馏策略——告诉你工程层面"训练流程"比"模型设计"杠杆更大
4. **开源训练脚本 = 长尾场景的护城河**：商用 API 的盒子打不开，PaddleOCR 把训练 / 评估 / 导出全开源，这是它在长尾场景守住份额的真正原因
5. **生态绑定是双刃剑**：选 PaddlePaddle 让 PaddleOCR 在百度内部和国内云厂商那里跑得很顺，但代价是与 PyTorch 主流社区隔了一层——做技术选型时要把"生态成本"算进 TCO

## 延伸阅读

- 仓库：[PaddlePaddle/PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR)（44k star，文档极厚）
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

- [[pytorch]] —— PyTorch — 深度学习主流框架
- [[unstructured]] —— Unstructured — 把任意文档解析成 LLM 能吃的元素列表

