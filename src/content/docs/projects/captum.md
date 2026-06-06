---
title: Captum — 给 PyTorch 模型装上 X 光机
来源: https://github.com/pytorch/captum
日期: 2026-05-31
子分类: 数据科学与 AI
分类: 机器学习
难度: 中级
provenance: pipeline-v3
---

## 是什么

Captum 是 **PyTorch 官方的模型可解释性库**，2019 年由 Meta AI（当时还叫 Facebook AI）发布，名字取自拉丁文 *captum*——『理解、把握』。GitHub ~5k star，是 PyTorch 生态里做归因（attribution）的事实标准。

日常类比：训练完的神经网络是一台**黑箱微波炉**，你输入图片它输出『猫』。Captum 是一台 **X 光机**，告诉你：

- 像素层面：图里**哪些像素**让模型说『这是猫』（眼睛？耳朵？背景的窗帘？）
- 中间层面：第 5 层的**哪个通道**对最终答案贡献最大
- 神经元层面：第 5 层第 128 号神经元在『看』什么

```python
from captum.attr import IntegratedGradients

model.eval()
ig = IntegratedGradients(model)
attributions = ig.attribute(input_image, target=class_idx, n_steps=50)
# attributions 形状和 input_image 一样，每个像素一个分数
```

## 为什么重要

深度模型一旦上生产（医疗影像、自动驾驶、内容审核），监管、产品和你自己都会问：『模型凭什么这么判？』

不用归因工具时，常见做法都不靠谱：

- **看 loss 和准确率**：只能告诉你模型整体行不行，不能告诉你**这一张**图为什么错
- **手撕 attention map**：只在 Transformer 上能看，且 attention != 解释（Jain & Wallace 2019 已证伪）
- **黑箱包装库（LIME / SHAP-Kernel）**：模型无关但慢，且不利用 PyTorch 计算图

Captum 同时解决三件事：

1. **生态原生**：直接接 PyTorch `nn.Module`，反向传播复用 autograd，不用拷贝模型
2. **方法齐全**：从 1 行代码的 Saliency 到论文级 Integrated Gradients、DeepLIFT、Occlusion、Layer Conductance、Neuron Conductance 一应俱全
3. **三层粒度**：Primary（输入→输出）/ Layer（中间层）/ Neuron（单神经元），同一套 API 切换

## 核心要点

### 1. 三层归因

| 层级 | 回答的问题 | 典型方法 |
|------|-----------|---------|
| Primary attribution | 哪些**输入**对预测重要？ | IntegratedGradients、Saliency、DeepLIFT、Occlusion |
| Layer attribution | 中间**某一层**的哪些神经元/通道重要？ | LayerConductance、LayerGradCam、LayerActivation |
| Neuron attribution | **单个神经元**对哪些输入敏感？ | NeuronConductance、NeuronGradient |

### 2. 招牌方法：Integrated Gradients（IG）

Sundararajan-Taly-Yan **ICML 2017** 论文 *Axiomatic Attribution for Deep Networks* 提出。

直觉：取一张**基准图**（通常全黑），从基准沿直线插值到真实输入，沿路把梯度积起来。

```
IG_i(x) = (x_i − b_i) · ∫₀¹ ∂F(b + α(x−b))/∂x_i  dα   （b 是基准）
```

满足两个公理：

- **完备性**：所有像素 IG 之和 = F(x) − F(x_baseline)，模型预测的差能完整分解
- **敏感性**：只要某像素改变会影响输出，IG 不为 0

实践用 `n_steps=50` 黎曼和近似积分，速度可接受。

### 3. 与 SHAP 的分工

| 维度 | Captum | SHAP |
|------|--------|------|
| 主战场 | 深度网络（CV / NLP / 多模态） | 表格类 ML（树模型） |
| 后端 | PyTorch autograd | TreeSHAP / KernelSHAP |
| 速度（深度网络） | 快（用计算图） | 慢（KernelSHAP 黑箱） |
| 速度（树模型） | 不支持 | 极快（TreeSHAP 多项式） |

经验法则：**有树用 SHAP，有 PyTorch 用 Captum**。

### 4. Captum Insights

随库附带的交互式可视化前端，跑在 Jupyter 或浏览器，支持图像/文本/表格三种模态。开发期最快的『看一眼模型在看哪里』工具。

## 实践案例

### 案例 1：图像分类调试

```python
from captum.attr import IntegratedGradients, visualization as viz

ig = IntegratedGradients(model)
attr = ig.attribute(img, target=pred_class, n_steps=50)
viz.visualize_image_attr(attr.squeeze().cpu().permute(1,2,0).numpy(),
                         method="heat_map", sign="positive")
```

如果热图集中在背景水印而不是物体——立刻知道**数据集偏置**，模型在学水印不在学物体。

### 案例 2：NLP 模型归因

```python
from captum.attr import LayerIntegratedGradients

lig = LayerIntegratedGradients(model, model.bert.embeddings)
attr = lig.attribute(inputs=input_ids, baselines=ref_ids,
                     target=label, n_steps=50)
# attr 形状 [batch, seq_len, hidden]，sum 到 hidden 得每个 token 的分数
```

BERT 情感分类做错时，看哪些 token 推高了错误类别——常见结论：模型抓了否定词但漏了双重否定。

### 案例 3：用 LayerGradCam 看 CNN 关注哪里

```python
from captum.attr import LayerGradCam

lgc = LayerGradCam(model, model.layer4[2].conv3)
attr = lgc.attribute(img, target=pred_class)
# 上采样到原图大小后叠加，得到热区图
```

复现 ResNet 论文里那种『模型在看狗的脸不是狗的腿』可视化，3 行搞定。

## 踩过的坑

1. **基准选择影响巨大**：IG 的全黑基准对自然图通用，但医学影像 / 文本要换成数据均值或 [PAD] token，否则归因失真
2. **n_steps 太小积分不准**：默认 50 是经验值，复杂模型上调到 200 才稳。有 `internal_batch_size` 控显存
3. **归因 ≠ 因果**：Captum 解释的是『模型在做什么』，不是『世界真因果』。和 SHAP 一个口径
4. **DeepLIFT 在 ReLU 网络上才严格**：用了 GELU / Swish / SiLU 时 DeepLIFTRescale 退化，建议改用 IG
5. **梯度消失会让 Saliency 全 0**：深网络 Saliency 看着像没归因，其实是梯度被 ReLU 屏蔽了。换成 IG 立刻有信号

## 适用 vs 不适用场景

**适用**：

- PyTorch 深度模型（CV / NLP / 多模态）做归因调试和上线解释
- 论文复现需要 IG / DeepLIFT / Occlusion 等标准方法
- 需要中间层或单神经元粒度（Layer / Neuron attribution）

**不适用**：

- 树模型 → 用 SHAP TreeExplainer
- TensorFlow / JAX 模型 → 用 tf-explain / SHAP DeepExplainer
- 严格因果推断 → 用 DoWhy / EconML
- 需要解释生成式 LLM 完整生成轨迹 → 用 TransformerLens / inseq

## 学到什么

1. **归因方法分三层**：输入级 / 层级 / 神经元级，不同问题挑不同粒度
2. **公理化方法 vs 启发式方法**：IG 满足完备性和敏感性两条公理，是同类里少有的有数学保证的
3. **生态绑定的力量**：Captum 不追求模型无关，而是吃透 PyTorch autograd，速度和易用性都是黑箱方法做不到的

## 延伸阅读

- 论文：[Sundararajan et al. 2017 — Axiomatic Attribution for Deep Networks](https://arxiv.org/abs/1703.01365)
- 官方文档：[captum.ai](https://captum.ai)
- 教程合集：[Captum Tutorials on PyTorch.org](https://pytorch.org/tutorials/beginner/introyt/captumyt.html)
- 与 SHAP 对比：Christoph Molnar *Interpretable Machine Learning* 第 10 章

## 关联

- [[pytorch]] —— Captum 直接吃 PyTorch autograd，无 PyTorch 不 Captum
- [[shap]] —— 表格类 ML 解释首选，与 Captum 在不同战场
- [[transformers-hf]] —— Captum 的 LayerIntegratedGradients 常用来归因 BERT / GPT 系列
