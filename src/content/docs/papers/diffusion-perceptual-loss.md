---
title: Diffusion Model with Perceptual Loss
来源: https://arxiv.org/abs/2401.00110
日期: 2026-06-13
分类_原始: AI / 深度学习
分类: 机器学习
子分类: 扩散模型
provenance: pipeline-v3
---

# Diffusion Model with Perceptual Loss — 零基础学习笔记

> **论文**: Diffusion Model with Perceptual Loss (Lin & Yang, ByteDance, 2024)
> **arXiv**: 2401.00110

---

## 一、一句话讲清楚这篇论文在说什么

这篇论文回答了一个问题：**为什么不用 guidance 的扩散模型画出来的图那么糊？**

作者说：不是模型不行，是**训练时用的"评分标准"（loss function）有问题**。他们把传统的方法从"逐个像素比较"换成了"让模型自己当裁判"，结果不用 guidance 也能画出清晰的图。

---

## 二、日常类比：厨师做菜

想象你教一个学徒做蛋糕，有两个不同的方法：

**方法 A（MSE 损失）：用尺子量每一颗糖的位置。** 你拿一把尺子，量每一颗糖距离标准配方差了多少像素。学徒学会了精确摆放糖的位置，但做出来的蛋糕虽然"像素级"对齐了，整体口感却很差。因为糖的位置差了一点点，不代表蛋糕就不好吃。

**方法 B（Perceptual Loss）：让一个美食家品尝。** 你找一个品过一万道甜点的老师傅，尝完学徒的蛋糕后说"还行"或"不太对"。老师傅不在乎糖差了几毫米，他在乎的是蛋糕整体好不好吃。

这篇论文说：扩散模型训练用的 MSE 就像方法 A — 它强迫模型在**像素级别**上精确匹配，结果模型学会了把不同的脸"糊在一起"，造出有四只眼睛的怪物。而 Perceptual Loss 就像方法 B，关注的是**语义级别**好不好。

---

## 三、核心概念

### 3.1 扩散模型在学什么？

扩散模型（Diffusion Model）的训练目标是：**学习从纯噪声变回真实数据的还原过程**。

训练时，模型接收一张被加了噪声的图片，尝试预测"原本的干净图片是什么样子"。预测完之后，需要跟正确答案对比，算出一个"错误分数"，这个分数就是 loss。

### 3.2 MSE 损失的问题（核心痛点）

扩散模型几乎全部使用 **MSE（均方误差）损失**：

$$\mathcal{L}_{mse} = \| \hat{v}_t - v_t \|_2^2$$

翻译成人话：对图片里每一个像素点，计算预测值和真实值的差的平方，然后全部加起来。

**问题出在哪？**

假设你训练一个生成人脸的扩散模型，训练数据里有两个人脸：

- 人脸 A：左边有颗痣
- 人脸 B：右边有颗痣

MSE 要求模型在像素级别上精确还原。于是模型学会了一个取巧的办法：**生成一张左半边脸 A + 右半边脸 B 的"拼接脸"**。在像素距离上，这张拼接脸确实离两张训练样本都不远，所以 MSE 觉得"挺好的"。

但人眼一看就知道：这是个有四只眼睛的怪物。

论文原话：

> MSE leads the model to learn a distribution of pixel-wise blending instead of semantic morphing.

MSE 让模型学会了"像素级混合"，而不是"语义级融合"。

### 3.3 Perceptual Loss 的思路

Perceptual Loss 的核心思想来自一篇叫 "A Style-Based Generator Architecture for GANs" 的论文（Johnson et al., 2016）。它的方法是：

1. 找一个已经训练好的神经网络（比如 VGG）
2. 不看图片本身，而是看图片经过这个网络中间层后的"特征表示"
3. 比较两张图片的特征表示之间的距离

**类比**：MSE 像是在比较两个人的身份证照片差了多少像素。Perceptual Loss 像是让一个认人专家来判断"这两个人像不像"。专家不在乎像素差多少，他看的是脸的特征。

### 3.4 Self-Perceptual Loss（本文的独创）

传统的 Perceptual Loss 需要一个外部的预训练网络（比如 VGG）。这篇论文做了一个巧妙的简化：**直接用扩散模型自己当裁判**。

流程如下：

```
原始图片 x0 → 加噪声 → xt
                ↓
       模型预测 v^t → 还原出 x^0
                ↓
       从 x^0 出发再走一步 → x^t'（预测路径）
       从 x0 出发走另一条路 → xt'（真实路径）
                ↓
       把 x^t' 和 xt' 同时塞进"冻结的模型"
       比较它们中间层的特征距离 = 感知损失
```

关键点：

- 冻结（freeze）训练好的 MSE 模型，不改变它的参数
- 把冻结的模型当作品味家（perceptual network）
- 比较预测路径和真实路径在中间层的差异
- 用这个差异来指导训练

论文中公式：

$$\mathcal{L}_{sp} = \| p^l_*(\hat{x}_{t'}, t', c) - p^l_*(x_{t'}, t', c) \|_2^2$$

不用被公式吓到。拆解来看：

- `p^l_*`：冻结的模型的第 l 层（只取中间层的特征，不看输出）
- `\hat{x}_{t'}`：模型自己预测出来的路径
- `x_{t'}`：从真实数据出发走过的路径
- 两者的特征距离就是新的损失

### 3.5 为什么 guidance 有效？

一个有趣的发现：这篇论文从 Perceptual Loss 的角度重新解释了 CFG（Classifier-Free Guidance）为什么有效。

传统解释：CFG 降低了采样温度，提高了质量。

本文解释：CFG 本质上也是在提供**感知监督**。CFG 同时查询条件版本和无条件版本的模型，放大它们的差异。这个差异的方向，恰好跟"语义上更像真实数据"的方向一致。换句话说，CFG 的效果类似于在采样阶段加了一个临时的 Perceptual Loss。

---

## 四、代码示例

### 示例 1：传统 MSE 损失 vs Self-Perceptual 损失 的对比

```python
import torch
import torch.nn as nn
import torch.nn.functional as F

# 假设我们有一个预训练的扩散模型（比如 Stable Diffusion）
# 它已经被 MSE 损失训练好了

diffusion_model = load_diffusion_model()  # 加载已训练的模型

# ========== 方法 A：传统 MSE 损失 ==========
def mse_loss(pred_noise, true_noise):
    """
    传统 MSE 损失：直接比较预测的噪声和真实的噪声
    逐像素比较，不管语义
    """
    return F.mse_loss(pred_noise, true_noise)


# ========== 方法 B：Self-Perceptual 损失 ==========
def self_perceptual_loss(frozen_model, x_pred, x_true, t, condition):
    """
    Self-Perceptual 损失：
    - frozen_model: 冻结的扩散模型，用作"品味家"
    - x_pred: 模型预测的路径（从预测结果还原后再走一步）
    - x_true: 真实数据路径（从真实数据走相同时间步）
    - t: 时间步
    - condition: 条件（比如文本 prompt）

    只取 midblock 层的特征来计算距离
    """
    # 冻结模型的特征提取
    frozen_model.eval()
    with torch.no_grad():
        # 获取冻结模型在 midblock 层的特征
        pred_features = frozen_model.get_midblock_features(x_pred, t, condition)
        true_features = frozen_model.get_midblock_features(x_true, t, condition)

    # 比较特征距离
    return F.mse_loss(pred_features, true_features)


# ========== 训练循环对比 ==========

def train_with_mse(model, batch, optimizer):
    """传统 MSE 训练"""
    x0, text = batch  # 真实图片、文本描述
    t = torch.randint(0, 1000, (x0.shape[0],))  # 随机时间步
    noise = torch.randn_like(x0)

    # 加噪声
    xt = add_noise(x0, noise, t)

    # 模型预测噪声
    predicted_noise = model(xt, t, text)

    # 计算 MSE 损失
    loss = mse_loss(predicted_noise, noise)

    # 反向传播
    optimizer.zero_grad()
    loss.backward()
    optimizer.step()
    return loss


def train_with_self_perceptual(model, batch, frozen_model, optimizer):
    """Self-Perceptual 训练"""
    x0, text = batch
    t = torch.randint(0, 1000, (x0.shape[0],))
    noise = torch.randn_like(x0)

    # 加噪声
    xt = add_noise(x0, noise, t)

    # 第一步：模型预测噪声
    predicted_noise = model(xt, t, text)

    # 第二步：从预测结果还原干净图片
    x0_pred = reconstruct_clean_image(xt, predicted_noise, t)

    # 第三步：再随机选一个时间步 t_prime
    t_prime = torch.randint(0, 1000, (x0.shape[0],))

    # 第四步：预测路径和真实路径
    x_pred_t_prime = add_noise(x0_pred, noise, t_prime)
    x_true_t_prime = add_noise(x0, noise, t_prime)

    # 第五步：用冻结模型计算感知损失
    loss = self_perceptual_loss(
        frozen_model, x_pred_t_prime, x_true_t_prime, t_prime, text
    )

    # 反向传播
    optimizer.zero_grad()
    loss.backward()
    optimizer.step()
    return loss
```

### 示例 2：完整的训练流程（简化版）

```python
import torch
import torch.nn as nn
from torch.utils.data import DataLoader

# 配置
BATCH_SIZE = 896
LEARNING_RATE = 3e-5
EMA_DECAY = 0.9995
NUM_ITERATIONS = 50000
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"


class SelfPerceptualTrainer:
    """
    Self-Perceptual Loss 训练器
    两阶段训练：
      阶段1：用 MSE 训练扩散模型
      阶段2：冻结模型，用它当感知网络，继续训练
    """

    def __init__(self, model, perceptual_model, optimizer):
        self.model = model.to(DEVICE)
        self.perceptual_model = perceptual_model.to(DEVICE)  # 冻结的
        self.perceptual_model.eval()  # 设为评估模式
        for param in self.perceptual_model.parameters():
            param.requires_grad = False  # 冻结参数
        self.optimizer = optimizer

    def forward_diffusion(self, x0, noise, t):
        """前向加噪声过程"""
        # alpha_bar 是预定义的噪声调度
        alpha_bar = get_alpha_bar(t)
        sqrt_alpha = torch.sqrt(alpha_bar)
        sqrt_one_minus_alpha = torch.sqrt(1 - alpha_bar)

        # xt = sqrt(alpha_bar) * x0 + sqrt(1 - alpha_bar) * noise
        return sqrt_alpha[:, None, None, None] * x0 + \
               sqrt_one_minus_alpha[:, None, None, None] * noise

    def reconstruct_x0(self, xt, predicted_v, t):
        """
        从预测的 v 值反推干净图片 x0
        v = sqrt(alpha_bar) * noise - sqrt(1 - alpha_bar) * x0
        反解出 x0
        """
        alpha_bar = get_alpha_bar(t)
        sqrt_alpha = torch.sqrt(alpha_bar)
        sqrt_one_minus_alpha = torch.sqrt(1 - alpha_bar)

        # 从 v 反推 x0
        return (sqrt_alpha[:, None, None, None] * xt - predicted_v) / \
               sqrt_one_minus_alpha[:, None, None, None]

    def compute_self_perceptual_loss(self, x0, xt, t, condition):
        """
        计算 Self-Perceptual 损失
        """
        noise = torch.randn_like(x0)

        # Step 1: 模型预测
        predicted_v = self.model(xt, t, condition)

        # Step 2: 从预测反推干净图片
        x0_pred = self.reconstruct_x0(xt, predicted_v, t)

        # Step 3: 再选一个新的时间步
        t_prime = torch.randint(0, 1000, (x0.shape[0],))

        # Step 4: 从两个方向走到 t_prime
        x_true_t_prime = self.forward_diffusion(x0, noise, t_prime)
        x_pred_t_prime = self.forward_diffusion(x0_pred, noise, t_prime)

        # Step 5: 冻结模型提取 midblock 特征
        with torch.no_grad():
            pred_feat = self.perceptual_model.get_midblock_features(
                x_pred_t_prime, t_prime, condition
            )
            true_feat = self.perceptual_model.get_midblock_features(
                x_true_t_prime, t_prime, condition
            )

        # Step 6: 特征距离
        loss = F.mse_loss(pred_feat, true_feat)
        return loss

    def train_step(self, x0, condition):
        """单个训练步骤"""
        t = torch.randint(0, 1000, (x0.shape[0],))
        noise = torch.randn_like(x0)
        xt = self.forward_diffusion(x0, noise, t)

        # 计算 Self-Perceptual 损失
        loss = self.compute_self_perceptual_loss(x0, xt, t, condition)

        # 反向传播
        self.optimizer.zero_grad()
        loss.backward()

        # 梯度裁剪，防止爆炸
        torch.nn.utils.clip_grad_norm_(self.model.parameters(), max_norm=1.0)

        self.optimizer.step()
        return loss.item()

    def train_epoch(self, dataloader):
        """训练一个 epoch"""
        self.model.train()
        total_loss = 0

        for x0, condition in dataloader:
            x0 = x0.to(DEVICE)
            loss = self.train_step(x0, condition)
            total_loss += loss

        avg_loss = total_loss / len(dataloader)
        return avg_loss


# 使用示例
def main():
    # 第一阶段：MSE 训练（假设已完成）
    mse_model = build_diffusion_model()
    mse_optimizer = torch.optim.Adam(mse_model.parameters(), lr=1e-4)
    # ... 训练 mse_model ...

    # 第二阶段：复制并冻结 MSE 模型作为感知网络
    perceptual_model = build_diffusion_model()
    perceptual_model.load_state_dict(mse_model.state_dict())

    # 用 SP 损失微调原始模型
    sp_model = build_diffusion_model()
    sp_model.load_state_dict(mse_model.state_dict())
    sp_optimizer = torch.optim.Adam(sp_model.parameters(), lr=LEARNING_RATE)

    trainer = SelfPerceptualTrainer(sp_model, perceptual_model, sp_optimizer)

    # 开始 SP 训练
    for epoch in range(NUM_ITERATIONS // len(train_dataloader)):
        avg_loss = trainer.train_epoch(train_dataloader)
        print(f"Epoch {epoch}, SP Loss: {avg_loss:.4f}")
```

---

## 五、关键实验结果

| 方法 | CFG | FID（越低越好） | IS（越高越好） |
|------|-----|----------------|----------------|
| MSE Loss | 否 | 29.63 | 22.86 |
| **SP Loss** | **否** | **24.42** | **28.07** |
| MSE + CFG | 是 | 18.67 | 34.17 |

SP Loss 在**不需要 guidance 的情况下**，FID 从 29.63 降到 24.42，IS 从 22.86 升到 28.07，显著改善。

---

## 六、重要发现总结

1. **MSE loss 假设了像素独立性**，但图像像素之间高度相关，这个假设在现实中不成立
2. **Perceptual Loss 关注语义级别**，能避免模型产生"四只眼睛"这种像素级正确但语义级错误的样本
3. **CFG 有效的真正原因**可能是它提供了感知监督，而不只是降低采样温度
4. **只用 midblock 层的特征效果最好**，其他层反而不好 — 说明中间层捕捉到的语义信息最合适
5. **从模型自己提取感知信号是可行的**，不需要引入外部网络，方便微调已有模型
6. **t' 均匀采样效果最好**，不需要复杂的采样策略

---

## 七、这篇论文的局限

- 目前还没有超过 CFG + Rescale 的效果
- SP 主要改善的是"不用 guidance 时的质量"，而不是完全取代 guidance
- 作者说未来可以探索结合 SP 和 CFG 的方法

---

## 八、我的理解

传统思路一直在改扩散模型的结构（卷积→Transformer）、采样算法（更多 solver）、训练技巧，但很少有人质疑**训练目标本身可能就不合适**。这篇论文的贡献在于：它回到了最根本的问题 — "我们到底在优化什么？" — 然后说"我们一直在用尺子量蛋糕，但也许应该让品味家来尝"。

MSE 不是"错的"，它在数学推导上很优雅，但它追求的是"像素级的准确"，而图像生成需要的是"语义级的合理"。这是一个根本性的不匹配。Perceptual Loss 补上了这个缺口。
