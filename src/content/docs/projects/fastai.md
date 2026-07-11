---
title: 'fastai — 三行代码做迁移学习'
来源: 'https://github.com/fastai/fastai'
日期: '2026-05-30'
分类: '数据科学与 AI'
难度: '中级'
---

## 是什么

fastai 是一个**深度学习训练库**，建在 [[pytorch]] 上面。

日常类比：PyTorch 像"自己用乐高搭车"——零件齐、灵活，但要花时间。fastai 像"已经搭好底盘、轮子、引擎的半成品车"——你只填颜色和品牌就能开。

最出名的口号是"**三行代码 SOTA**"——下面三行真的能在猫狗分类上做出接近最好水平的结果：

```python
from fastai.vision.all import *
dls = ImageDataLoaders.from_folder(path, valid_pct=0.2, item_tfms=Resize(224))
learn = vision_learner(dls, resnet34, metrics=error_rate)
learn.fine_tune(3)
```

它由 Jeremy Howard 和 Rachel Thomas 主导，配套有一门叫 **Practical Deep Learning for Coders** 的免费课（官方宣传覆盖过大量学员）。一句话定位：PyTorch 给你积木，fastai 给你已经搭好的车。

## 为什么重要

不理解 fastai 思路，下面这些事都没法解释：

- 为什么 2018 年之后**迁移学习**（拿 ImageNet 预训练模型微调）变成默认套路——fastai 把它包成一行 `fine_tune(3)`
- 为什么很多 Kaggle 选手第一版 baseline 用 fastai 跑——开箱就是接近 SOTA 的超参
- 为什么"自顶向下教学"（先跑出 SOTA 再讲数学）成为深度学习教学的主流——fast.ai 课程把这套打法做成范式
- 为什么很多 PyTorch 用户读完 fastai 源码后才理解：训练循环里到底**哪些套路是研究套路、哪些是工程套路**

## 核心要点

fastai 的设计可以概括成 **分层 API（Layered API）**——给不同水平的人不同的接口：

1. **高层 API**：`vision_learner` / `text_classifier_learner` / `tabular_learner`——一行就能搞定 90% 任务。新手第一周用这个。

2. **中层 API**：`DataBlock`（数据管线声明式 DSL）、`Callback`（训练循环钩子）、`Learner`（训练器）——做"标准任务的小变种"用这个。

3. **低层 API**：`Tensor` 子类、类型分发（type dispatch）、`Transform` 类——做研究、写新算法用这个。

第二层的两个关键发明：

- **DataBlock API**：把数据管线写成"声明"——`blocks=(ImageBlock, CategoryBlock)`、`get_items=get_image_files`、`splitter=RandomSplitter()`、`item_tfms=Resize(224)`。读起来像填表，不像写代码。
- **Callback 系统**：训练循环里有 ~20 个挂钩点（`before_fit`、`after_batch`、`after_epoch`...），所有"花式训练技巧"（mixup、混合精度、early stopping）都写成 Callback 插进去。

第三个关键发明是 **`fine_tune(epochs)` 一招**：自动 freeze 主干 → 只训练 head → 解冻 → 用**判别式学习率**（discriminative LR，深层小、浅层更小）继续训。背后是论文 ULMFiT 的迁移学习配方。

## 实践案例

### 案例 1：DataBlock 声明式数据管线

```python
dblock = DataBlock(
    blocks=(ImageBlock, CategoryBlock),
    get_items=get_image_files,
    splitter=RandomSplitter(valid_pct=0.2),
    get_y=parent_label,
    item_tfms=Resize(224),
    batch_tfms=aug_transforms()
)
dls = dblock.dataloaders(path, bs=64)
```

读法：

- `blocks=(ImageBlock, CategoryBlock)` —— 输入图片、输出类别
- `splitter=RandomSplitter(valid_pct=0.2)` —— 20% 当验证集
- `item_tfms` 是"每张图单独处理"（resize），`batch_tfms` 是"整批一起处理"（数据增强，跑在 GPU 上）

整个过程没写一行 for 循环。和 [[pytorch]] 原生那套（自己写 `Dataset` + `DataLoader`）相比，省了 30 行模板代码。

### 案例 2：fine_tune 一行迁移学习

```python
learn = vision_learner(dls, resnet34, metrics=accuracy)
learn.fine_tune(epochs=3, base_lr=2e-3)
```

`fine_tune` 内部做了：

1. 冻结 ResNet34 的卷积层（只 head 可训）
2. 跑 1 个 epoch，让 head 大致就位
3. 解冻所有层
4. 跑剩下 2 个 epoch，但**底层用 `base_lr/100`、顶层用 `base_lr`**——浅层（边缘检测）几乎不动，深层（语义特征）调多点

如果直接 PyTorch 写，要手动写 `param_group` 配学习率、写两段训练循环、调度学习率——~50 行。fastai 一行。

### 案例 3：Callback 加新功能

```python
class PrintGradNormCallback(Callback):
    def after_backward(self):
        total = sum(p.grad.norm().item() for p in self.model.parameters() if p.grad is not None)
        print(f"grad norm = {total:.4f}")

learn.fit(3, cbs=[PrintGradNormCallback()])
```

Callback 系统让你在**不改训练循环代码**的前提下注入逻辑——这是和 [[pytorch-lightning]] 的 `LightningModule.training_step` 不一样的设计：PL 让你重写方法，fastai 让你挂钩。

## 踩过的坑

1. **抽象太重，调参时不知道改哪一颗螺丝**：`fine_tune` 内部封了 freeze、unfreeze、判别式 LR、1cycle 调度——结果不好时新手不知道动哪个。建议读 [fastai 源码 `Learner.fine_tune`](https://github.com/fastai/fastai/blob/master/fastai/callback/schedule.py) 一次。

2. **Callback 顺序有坑**：自己写的 Callback 如果改了梯度，可能和内置的 `MixedPrecision` 冲突。`order` 属性控制执行顺序，调错了就静默错。

3. **PyTorch 教程不能直接搬**：很多 PyTorch tutorial 假设你手写 `for batch in dataloader` 循环；fastai 期望 `Learner` 形态，要把代码改成 fastai 风格。

4. **文档和源码偶尔不同步**：fastai 用 nbdev 写——源码就是 Jupyter notebook。看官网 doc 不够，要去 GitHub 翻 `nbs/` 目录的 notebook。

## 适用 vs 不适用场景

**适用**：

- 学习深度学习的入门工具——配套课程免费且高质量，远超读论文起步
- 标准任务 baseline——单卡图像分类约 <10 万张、文本分类、表格回归，三行起步看效果
- Kaggle 比赛第一版 baseline——开箱接近最优超参，常用来 1–2 小时内摸清数据上限

**不适用**：

- 自定义研究算法（新 loss / 新优化器 / 新训练策略）——抽象会挡路，不如直接 PyTorch
- 大规模分布式（多机 ≥8 GPU / TPU）——这是 [[pytorch-lightning]] 的强项
- 经典机器学习（树模型、SVM、线性模型）——用 [[scikit-learn]]，fastai 主要做深度学习

## 历史小故事（可跳过）

- **2016**：Jeremy Howard 与 Rachel Thomas 创办 fast.ai，主张"先做出能用的模型，再回头补数学"
- **2018**：ULMFiT 论文把迁移学习配方带到 NLP；同年 fastai 库把 `fine_tune` 等最佳实践做成默认
- **2018–2019**：Practical Deep Learning for Coders 课程走红，自顶向下教学法被广泛模仿
- **2020**：Howard & Gugger 发表 *fastai: A Layered API for Deep Learning*（arXiv 2002.04688），把分层 API 写成设计论文
- **持续维护**：库与课程同步迭代；和 [[pytorch-lightning]] 形成"教学派 vs 工程派"两条上层路线

## 学到什么

1. **"好默认值"比"灵活"更重要**——fastai 把研究界沉淀的最佳实践（1cycle、判别式 LR、mixup）做成默认，新手不用懂也能拿到不错结果
2. **分层 API 是教学神器**——同一套库，新手用高层、研究员用低层，不必换工具栈
3. **声明式数据管线**——DataBlock 把"图片从哪来、怎么切、怎么变换"写成声明而非过程，读起来像填表
4. **抽象的代价**：抽象越多，"出问题时不知道动哪里"的风险越大；做选择时要权衡——选哪个看你处在学习曲线的哪一段

## 延伸阅读

- 课程：[Practical Deep Learning for Coders](https://course.fast.ai/) —— 免费、自顶向下、第一节就让你训出 SOTA
- 论文：[fastai: A Layered API for Deep Learning](https://arxiv.org/abs/2002.04688) —— Howard & Gugger, Information 2020，讲设计哲学
- 书：《Deep Learning for Coders with fastai and PyTorch》（Howard & Gugger）—— 课程的纸质版，500+ 页
- [[pytorch]] —— fastai 建在它之上，用 PyTorch 张量和 autograd
- [[pytorch-lightning]] —— 同位竞品，工程派；和 fastai 的"教学派"是两条路
- [[scikit-learn]] —— 经典 ML 的"好默认"哲学始祖，fastai 在深度学习领域复刻了这套思路

## 关联

- [[pytorch]] —— fastai 的底座；fastai 不重写张量和 autograd，只在训练循环和数据管线层加抽象
- [[pytorch-lightning]] —— 同样是 PyTorch 上层，但走"工程"路线（多 GPU / 日志 / 不预设超参）；fastai 走"教学 + 默认最佳实践"路线
- [[scikit-learn]] —— 经典 ML 的事实标准，fastai 在深度学习领域学了它的"`fit` / `predict` 一致接口"和"好默认"思路
- [[keras]] —— TF 生态的高层 API 对照；Keras 之于 TF 约等于 fastai 之于 PyTorch
- [[torchtune]] —— PyTorch 官方后训练剧本；和 fastai 的 Learner 抽象是两条路

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[keras]] —— Keras 3 — 一份模型代码跑三套后端
- [[tensorflow]] —— TensorFlow — Google 端到端 DL 平台
- [[torchtune]] —— torchtune — PyTorch 官方 LLM 微调库
