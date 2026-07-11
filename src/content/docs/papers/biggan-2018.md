---
title: BigGAN — 把 GAN 暴力放大到 ImageNet 512×512
来源: Brock, Donahue, Simonyan, "Large Scale GAN Training for High Fidelity Natural Image Synthesis", ICLR 2019 (arXiv:1809.11096)
日期: 2026-05-31
分类: 机器学习
难度: 中级
---

## 是什么

BigGAN 是 DeepMind 2018 年的一篇论文，做的事情一句话：**把 GAN 的网络、批量、类别嵌入同时放大 2-4 倍，再配一个采样小技巧，让 GAN 第一次在 ImageNet 这种类别多、像素 512×512 的真实数据上做到逼近真实**。

日常类比：以前的 GAN 像在小作坊里手作家具，能做椅子但做不好沙发。BigGAN 把作坊换成自动化产线（更大的网络 + 更大的批量 + TPU 集群），同时发明一个"出货前再过一遍筛子"的小动作（truncation trick），就能批量产出沙发、冰箱、汽车。

代价也很直白：训练经常崩（collapse），算力门槛极高，复现一次要几百张 TPU。

## 为什么重要

不理解 BigGAN，下面这些事说不清：

- 为什么 2018 年之前 GAN 论文都在 64×64 的 CIFAR / CelebA 上比，2019 年突然全跳到 256×256 ImageNet——是 BigGAN 抬高了 baseline
- 为什么 GAN 圈出现"越大越好"的信仰——BigGAN 是第一篇用消融实验证明 batch size 单独翻 4 倍就能涨 IS 46% 的工作
- 为什么 truncation trick 现在写进所有生成模型教程——它把"质量 vs 多样性"变成一个可调旋钮
- 为什么 2020 之后 GAN 在大规模图像生成被扩散模型反超——BigGAN 已经把"暴力放大"这条路走到尽头，下一波要换范式

## 核心要点

BigGAN 的贡献可以拆成 **三件事**：

1. **规模化（scaling）**：网络通道数 2x、batch size 从 256 → 2048、类别嵌入用 shared embedding 一次投射到所有 BatchNorm 层。光是这三步，IS 从 52 涨到 166。

2. **truncation trick（推断期采样）**：训练时输入噪声 z 服从标准正态，**采样时**把 |z| 超过阈值的丢弃重采样。阈值越小，输出越高保真但多样性塌缩；阈值越大，越接近原分布。这是一个把 quality 和 diversity 解耦的**旋钮**。

3. **正交正则（orthogonal regularization）**：单纯做 truncation，很多模型会塌成糊状色块。论文加了一个让权重矩阵接近正交的正则项，让 G 在被 truncate 时仍能保持结构。

底子是当时 GAN 的几个零件全堆上：**self-attention（SAGAN）+ spectral normalization + hinge loss + projection discriminator**。BigGAN 没发明这些，它的贡献是"放在一起 + 全部放大 + 加上面三件事"。

## 实践案例

### 案例 1：truncation trick 怎么调

PyTorch 伪代码：

```python
# 训练时：z 是标准正态
z = torch.randn(batch_size, dim_z)

# 采样时：z 来自截断正态
def truncated_z(batch_size, dim_z, threshold=0.5):
    z = torch.randn(batch_size, dim_z)
    while (z.abs() > threshold).any():
        mask = z.abs() > threshold
        z[mask] = torch.randn(mask.sum())
    return z
```

调 `threshold`：

- `threshold=2.0`（接近原分布）→ 多样性高，偶尔出畸形
- `threshold=0.5`（很接近均值）→ 每张都漂亮，但都长一个样
- `threshold=0.04`（极端）→ 几乎所有样本都收敛到类别"原型"

### 案例 2：scaling 消融——单独翻 batch 就有大涨

论文 Table 1（128×128 ImageNet）：

| 配置 | batch | 通道倍数 | IS | FID |
|------|-------|---------|-----|-----|
| baseline (SAGAN) | 256 | 1x | 52.5 | 18.7 |
| +batch 8x | 2048 | 1x | 76.8 | 12.4 |
| +channels 1.5x | 2048 | 1.5x | 92.2 | 9.0 |
| +shared embedding | 2048 | 1.5x | 109 | 8.1 |
| +truncation 0.5 | 2048 | 1.5x | 166 | 9.6 |

**单独把 batch 从 256 → 2048**，IS 涨 46%。这条结果震动了 GAN 圈：没换架构、没换 loss、没调超参，钱多就能涨。

### 案例 3：训练经常崩，论文怎么处理

BigGAN 训完 100k 步左右，G 的某层最大奇异值会突然爆炸，输出变成噪声。论文给 D 加了 spectral normalization 和 dropout，发现：

- 加正则**只能延后崩溃**，不能消除
- 一旦观察到奇异值飙升，就在崩溃前手动 early stop，取最后一个 checkpoint

这是论文坦白的硬伤。后来 StyleGAN2 用不同架构和正则路线绕开了这个问题。

## 踩过的坑

1. **truncation trick 不能乱用**：要先验证模型对 truncation 是不是 amenable（中文勉强翻成"配合得上"）。论文里 BigGAN-deep 不加正交正则就一 truncate 就糊。

2. **batch size 不是越大越好**：超过 2048 之后 BigGAN 反而开始过早崩溃。论文猜测是大 batch 让 D 学得太快。

3. **复现成本极高**：原版 BigGAN 训一次要 128 块 TPU v3 跑 24-48 小时，社区开源版（biggan-pytorch）只能在 128×128 跑通。

4. **类别条件不是 unconditional**：BigGAN 依赖 ImageNet 1000 类标签。脱离类别条件做 unconditional 生成时效果掉一半以上。

5. **shared embedding 是双刃剑**：把类别向量线性投影到所有 BatchNorm 的 γ/β 节省了参数，但也让"某一层学坏"的影响沿着 embedding 传遍全网。崩溃排查时要先看 embedding 的奇异值。

## 适用 vs 不适用场景

**适用**：

- 大规模、有类别标签的图像数据集（ImageNet、JFT 之类）
- 需要"质量/多样性"可调的产品场景（比如批量素材生成）
- 教学：理解"GAN 放大的天花板在哪"

**不适用**：

- 小数据集 / 无标签数据 → 直接选 StyleGAN 或扩散模型
- 想稳定训练不想盯崩溃 → 扩散模型训练曲线平稳得多
- 想要文本到图像 → BigGAN 没语言条件，用 Stable Diffusion 这条线
- 算力有限 → 单卡跑不动 BigGAN，原版至少要 8×A100

## 历史小故事（可跳过）

- **2014**：Goodfellow 提出 GAN，能画 28×28 数字
- **2015**：DCGAN 把 GAN 搬到卷积网络，能画 64×64 卧室
- **2017**：ProgressiveGAN（NVIDIA）通过逐步加层做到 1024×1024 人脸，但只能做 CelebA 这种"窄分布"数据
- **2018 上半年**：SAGAN 加 self-attention，SN-GAN 加 spectral normalization，cGAN-projection 改进类别条件，三股合流
- **2018 年 9 月**：DeepMind 三人组 Brock、Donahue、Simonyan 把上面所有零件拼起来 + 暴力放大 + 发明 truncation trick，得到 BigGAN
- **2019 之后**：StyleGAN 系列在人脸、扩散模型在通用图像逐渐反超；BigGAN 退到"工业基线 + 教学经典"位置

## 学到什么

1. **scaling 在 GAN 上也成立，但有天花板**：参数和 batch 翻倍能换分数，但翻到一定程度训练稳定性塌方
2. **train/test 分布故意拉开是可以接受的**：truncation trick 推断期换 z 的分布，违反"训练测试同分布"教条但 work
3. **拼装比发明重要**：BigGAN 没造新零件，但它证明了"把当时最好的几样合在一起 + 放大 + 一个小改进"能改写 SOTA
4. **写论文要诚实写硬伤**：作者公开承认训练不稳定、超参敏感、复现成本高，反而让这篇成为引用最多的 GAN 论文之一

## 一句话记忆

把当时最好的 GAN 零件全堆上，再把网络和 batch 一起放大，然后用 truncation trick 在采样时换一个噪声分布——quality 和 diversity 就有了一个旋钮可以调。代价是训练经常崩、复现要 TPU pod。

## 延伸阅读

- 论文 PDF：[arXiv:1809.11096](https://arxiv.org/abs/1809.11096)（38 页，附录有大量样本图）
- 官方 demo：[BigGAN TF Hub](https://tfhub.dev/deepmind/biggan-512/2)（可在浏览器调 truncation 滑块感受效果）
- 解读视频：[Yannic Kilcher 讲 BigGAN](https://www.youtube.com/watch?v=1_5_t_kLkpw)（45 分钟逐节读）
- 社区复现：[ajbrock/BigGAN-PyTorch](https://github.com/ajbrock/BigGAN-PyTorch)（论文一作开源）
- [[stable-diffusion]] —— BigGAN 之后的范式接班人

## 关联

- [[attention]] —— BigGAN 的 self-attention 来自 SAGAN，思想接 Transformer
- [[stable-diffusion]] —— 2020 年后扩散模型在 FID 和稳定性上反超 BigGAN
- [[ampere-architecture-2020]] —— BigGAN 训练用的 TPU 同时代，A100 让规模化进一步降本
- [[align-2021]] —— 同样把"对比学习 + scaling + 大数据"组合的代表作

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[stylegan2-2020]] —— StyleGAN2 — 把 StyleGAN 的水滴瑕疵和潜空间纠葛一起修掉
