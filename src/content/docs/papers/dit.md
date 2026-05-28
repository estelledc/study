---
title: DiT Diffusion Transformer
来源: Peebles & Xie, "Scalable Diffusion Models with Transformers", ICCV 2023 / arXiv 2212.09748
---

## 一句话总结

DiT 把 diffusion 模型背后那个一直默认的 U-Net backbone 换成了 transformer，证明 transformer 在生图任务里也跟在 NLP 里一样会"越大越好"。三件套——**patchify**、**adaLN-Zero**、**DiT block**——加上"模型变大、patch 变小、FID 持续降"的 scaling law，让 transformer 在 ImageNet 256×256 class-conditional 生成上拿下 2.27 FID 的 SOTA，也直接把后来的 Sora、Stable Diffusion 3、Flux 全都拽到了 DiT 路线上。

## 历史定位

要理解 DiT 的位置，得先把生成模型这条史串起来。

- **2014 GAN / VAE**：第一代主流生成。GAN 出图清晰但训练不稳；VAE 训练稳但出图糊。
- **2020 DDPM (Ho et al.)**：把扩散重新工程化，性能首次追上 GAN。**默认 backbone 是 U-Net**——卷积下采样 + 跳跃连接 + 卷积上采样，几乎所有后续 diffusion 都默认沿用。
- **2021 ADM / Improved DDPM (Dhariwal & Nichol)**：把 U-Net 调到 SOTA，同时引入 classifier guidance。U-Net 的"皇冠"被坐稳。
- **2022 LDM / Stable Diffusion (Rombach et al.)**：把扩散从像素空间搬到 VAE latent 空间，效率高一个量级。**backbone 仍然是 U-Net**，只是变小了。
- **2022-12 DiT (本文，Peebles & Xie)**：第一次系统地把 U-Net 换成 transformer，并量出 transformer 在 diffusion 也 scalable。
- **2024-02 Sora (OpenAI)**：DiT + 时空 patch + temporal attention，做视频。论文一作 William Peebles 加入 OpenAI 主导。
- **2024-03 Stable Diffusion 3 (Stability AI)**：MMDiT (multimodal DiT)，文本和图像各一路 transformer，互相 cross-modulate。
- **2024-08 Flux.1 (Black Forest Labs)**：DiT 系，原 SD3 团队出来做的。
- **2024 Pixart-α / Hunyuan-DiT / Lumina-T2X / OpenSora**：新生 T2I / T2V 全是 DiT 系。

DiT 的工业意义可以用一句话概括：**U-Net 时代结束，DiT 接班**。今天打开任何主流文生图 / 文生视频模型的论文，几乎都能找到 DiT block 的影子。

> 怀疑：DiT 把 U-Net 换 transformer，是把 NLP "Bigger is Better" 教训搬到 CV。但 U-Net 在小数据集（< ImageNet-1k）和医疗影像、天气预测等领域仍然占优，因为卷积归纳偏置（局部性、平移等变性）在数据稀缺时是有用的。DiT 的胜利是不是依赖海量数据 + 大算力？小项目还是 U-Net？

## Section 1：动机——为什么要换掉 U-Net

要看清 DiT 选 transformer 这条路的理由，先把 U-Net 在 diffusion 时代的几个隐性问题说清楚。

**问题 A：U-Net 不容易 scale。**

U-Net 在 DDPM 时代的"标配"长这样：

- 4-5 级下采样（每级 conv + group norm + SiLU）
- 中间瓶颈层加几个 self-attention（只在 16×16 / 8×8 这种低分辨率级）
- 4-5 级上采样（带 skip connection）

这套结构在 100M 参数量级好用，但拉到 500M 以上就开始难训：梯度回传路径长、skip connection 容易让大模型梯度爆炸、卷积层之间没法像 transformer block 一样互换位置做实验。

ADM 论文（Dhariwal & Nichol 2021）已经把 U-Net 调到极限——555M 参数，FID 4.59 在 ImageNet 256，但再往上加几乎没有收益。

**问题 B：U-Net 的归纳偏置不一定对。**

U-Net 的设计哲学是"图像有局部结构 + 多尺度特征"。卷积负责局部，下采样上采样配合 skip 负责多尺度。这个偏置在小数据集上是恩惠，因为不需要从数据里学到这些先验。

但在 ImageNet 这种数据丰富的场景，**先验越强、模型上限越低**——这是 ViT (Dosovitskiy 2020) 在判别任务上已经证明过的。transformer 没有局部偏置，scale 上去之后从数据里直接学到更好的表示。

DiT 的核心猜想是：**这条 scaling 规律在 diffusion 也成立**。

**问题 C：transformer 才是后续生态的主轴。**

从 2017 起，几乎所有大型 AI 系统（GPT / BERT / ViT / CLIP / Whisper）都是 transformer。如果 diffusion 留在 U-Net，就跟整个 transformer 生态切割——没有共享的 attention 优化、没有共享的 scaling law、没有共享的工具链。把 diffusion 拉回 transformer 才能享受这条路上所有的工程红利。

> 怀疑：作者这套"U-Net 不 scalable"的论证，主要 evidence 是 ADM 在 555M 卡住。但 ADM 卡住会不会是 ablation 不够、data 不够？同期没人花 1B 参数训 U-Net diffusion 来验证。这个反方假设没被 cleanly 排除。

## Section 1.5：U-Net 在 DDPM 时代到底长什么样

要看清"DiT 替换的是什么"，把 U-Net 的细节摆出来一遍。

DDPM (Ho et al. 2020) 的 U-Net 大致 3 段：

**下采样段（encoder）**：

- 4 级，每级两个 ResBlock + 一个 Downsample（stride-2 conv）。
- 每个 ResBlock 内部：GroupNorm → SiLU → conv 3×3 → GroupNorm → SiLU → conv 3×3 → 残差。
- timestep embedding 通过一个 Linear 加在 GroupNorm 的 shift 参数上（早期版本的 adaLN 雏形）。
- 16×16 / 8×8 这两级会在 ResBlock 之间塞一个 self-attention 层（spatial attention）。

**瓶颈段（middle）**：

- ResBlock + self-attention + ResBlock 三明治。
- 这一段其实已经是 transformer 的预演——只是 attention 嵌在 conv 之间。

**上采样段（decoder）**：

- 跟下采样镜像，4 级，每级 Upsample（nearest + conv）+ 两个 ResBlock。
- 关键：每级的输入除了上一级输出，还要拼接对应下采样级的输出（**skip connection**）。
- 这个 skip 是 U-Net 的命脉，但也是 scale 上去后的痛点：拼接会让 channel 维度爆炸，深网容易梯度爆。

ADM (Dhariwal 2021) 在这套基础上加了：

- 更深（每级 ResBlock 数量从 2 加到 3-4）。
- AdaGN（adaptive group norm，把 timestep + class 注入到 GroupNorm 的 γ, β）——这其实就是 adaLN 的 conv 版前身。
- BigGAN-style 上采样。

把 ADM 调到 555M 参数后，FID 下降明显放缓——这是 DiT 论文反复强调"U-Net 不 scalable"的实证基础。

可以看出 U-Net 时代的 diffusion 已经在偷偷往 transformer 靠：spatial attention、AdaGN、深层 stack。DiT 干脆把 conv 全去掉，让 transformer block 完全主导，省掉 U-Net 那套手工多尺度。

## Section 2：在哪个空间训——latent diffusion 复用

DiT 没有重新发明 diffusion 的训练空间。它直接复用了 LDM (Stable Diffusion) 的 setup：

- 用预训练的 VAE encoder 把图像 256×256×3 压成 latent 32×32×4（每个空间维度缩 8 倍，channel 从 3 升到 4）。
- diffusion 在这个 latent 空间训，不在像素空间训。
- 推理时反着来：先采样 latent，再用 VAE decoder 解回像素。

这个选择有两个好处：

1. **省算力**：32×32 = 1024 个空间位置，比 256×256 = 65536 少 64 倍。transformer 复杂度 O(N²) 受不了 65536 长度的序列。
2. **VAE 已经处理了高频细节**：DiT 不用学"如何画清楚"，只用学"语义结构对不对"。

> 怀疑：DiT 的所有结果都依赖 VAE 编码不丢核心信息。如果换医学影像、卫星图、稀有领域，预训练的 VAE 可能编码不准。这种情况下 DiT 是不是要从头训 VAE？论文没碰这部分。

## Definition 1：patchify

**patchify** 是 DiT 借鉴 ViT 的第一步：把 latent 切成不重叠的小块，每块当一个 token。

**输入**：z_t ∈ R^(32 × 32 × 4)。

**步骤**：

1. 选一个 patch size P（论文实验了 P = 2 / 4 / 8）。
2. 把 z_t 切成 (32/P) × (32/P) 个 P×P×4 的小 patch。
3. 每个 patch 用一个线性层投影到维度 d（例如 d = 1152 for DiT-XL）。
4. 加一个 frequency-based 的 positional embedding（sin/cos）。
5. 输出 N 个 token，每个维度 d。

**N 的具体数字**：

- P = 2：N = 16 × 16 = **256 tokens**
- P = 4：N = 8 × 8 = **64 tokens**
- P = 8：N = 4 × 4 = **16 tokens**

P 越小，token 越多，每个 token 看到的空间区域越小，模型能捕捉更细的细节。代价是：transformer 的计算量大致 O(N²·d)，所以 P 减半 → 计算量大约 ×4。

直观比喻：把一张照片切马赛克。马赛克块越小，能看到的纹理越细，但拼图工作量越大。

## Definition 2：adaLN（adaptive LayerNorm）

DiT 要把两个条件信号注入到每个 transformer 层里：

1. **timestep t**：当前在 1000 步去噪过程的哪一步。
2. **class label c**（class-conditional 任务）或 text embedding（后续 SD3 / Pixart 的扩展）。

最直接的做法是把 t 和 c embedding 拼到 token 序列前面（in-context conditioning，相当于 BERT 的 [CLS]）。但论文实验显示这条路最弱。

DiT 选 **adaLN**：把 t + c embedding 投影成 LayerNorm 的 scale (γ) 和 shift (β) 参数。

**普通 LayerNorm**：

```
y = (x - mean) / std * γ + β    (γ, β 是可学习参数)
```

**adaLN**：

```
γ, β = MLP(t + c)               (γ, β 由条件决定，不是可学习常量)
y = (x - mean) / std * γ + β
```

这等于让条件信号"调制"每一层的归一化行为。t 不同 → γ, β 不同 → 同一个 token 经过同一个 LayerNorm 输出不同。

**为什么 adaLN 比 in-context 好**？我的理解是两点：

1. **每层都有调制**：condition 不是只在第 0 层（[CLS]）注入，而是每个 transformer block 都重新调制一次。控制权强。
2. **不挤压 token**：256 个 latent token 全用于建模图像本身，不用分一个 slot 给 [CLS]。

代价是参数量略多：每个 block 需要一个 condition → (γ, β) 的 MLP。

## Definition 3：adaLN-Zero（关键稳定性 trick）

adaLN 的标准版还有一个问题：**深层模型初始化时不稳定**。

DiT-XL 有 28 层。如果每层 adaLN 一开始就把 token "扰动"得很厉害，深层堆起来误差累积，训练前几千步 loss 大幅震荡，甚至发散。

**adaLN-Zero** 解决方案：每个 DiT block 输出处加一个**门控系数** α（也由 condition 通过 MLP 投影出来），并且**把 α 的回归头初始化为 0**。

具体改造（每个 DiT block 内部）：

```
# 原始 adaLN 版本：
x = x + Attn(adaLN_1(x, t, c))
x = x + MLP(adaLN_2(x, t, c))

# adaLN-Zero 版本：
x = x + alpha_1 * Attn(adaLN_1(x, t, c))    # alpha_1 init to 0
x = x + alpha_2 * MLP(adaLN_2(x, t, c))     # alpha_2 init to 0
```

效果：训练第 0 步，所有 α 都是 0，每个 DiT block **完全等价于 identity**——输入什么 token 输出什么 token。整个 DiT-XL 在第 0 步就是一个恒等映射，loss 完全可控。

随着训练进行，α 慢慢长出来，DiT block 才真正开始干活。这种"从 identity 慢慢长出能力"的设计，跟 ResNet 的残差思想、Diffusion Policy 的 zero-init head、ControlNet 的 zero conv 都是一个家族——**让模型从 do-nothing 起步，比从随机起步稳得多**。

> 怀疑：adaLN-Zero 在 DiT 论文里是消融实验里的最佳变体（论文 Figure 6），但论文比较的是 in-context / cross-attention / adaLN / adaLN-Zero 四种。这种"哪个变体最优"的结论高度依赖训练设置（learning rate、optimizer、schedule）。换 cosine learning rate decay 或者更长的 warmup，会不会反而是 cross-attention 赢？论文的 ablation 是单一 setup，结论不一定泛化。

## Section 3.1：DiT block 设计

每个 DiT block 内部结构（adaLN-Zero 版）：

1. 输入 token x ∈ R^(N × d)。
2. condition (t, c) 投影成 6 个向量：α₁, β₁, γ₁, α₂, β₂, γ₂。
3. **Attention 路径**：
   - LayerNorm + scale γ₁ + shift β₁ → 得到 x'。
   - Multi-head self-attention(x') → attn_out。
   - x = x + α₁ × attn_out。
4. **MLP 路径**：
   - LayerNorm + scale γ₂ + shift β₂ → 得到 x''。
   - MLP(x'')（两层 Linear + GELU，hidden = 4d） → mlp_out。
   - x = x + α₂ × mlp_out。
5. 输出 x ∈ R^(N × d)，喂给下一个 DiT block。

每个 block 6 个 condition-driven 参数（α₁, β₁, γ₁, α₂, β₂, γ₂），开销极小，比 cross-attention 的 K/V 投影便宜得多。

参考实现见 `facebookresearch/DiT` 仓库（commit 链接示意）：
`https://github.com/facebookresearch/DiT/blob/ed81ce2229091fd4ecc9a223645f95cf379d1f06/models.py` 里 `class DiTBlock(nn.Module)` 把这套 forward 写得清清楚楚——adaLN_modulation 输出 6 维向量然后 chunk 成 6 份。

> 怀疑：adaLN-Zero 的"6 个向量 per block"是不是真的最便宜？跟 cross-attention 对比，cross-attn 的 K/V 投影是 d × d 矩阵（约 1M 参数 per head），adaLN 的 MLP 是 d_cond × 6d（也是几 M 参数）。在 d_cond = d = 1152 时，参数量级差不多。论文说"adaLN 更便宜"是不是只在 Gflops 而非 params 上？

## Section 3.2：模型规模 + scaling 维度

DiT 一共定义了 4 种规模 × 3 种 patch size = 12 个模型，方便扫 scaling law：

| 模型 | 层数 | hidden d | heads | 参数量 |
|------|------|----------|-------|--------|
| DiT-S | 12 | 384 | 6 | ~33M |
| DiT-B | 12 | 768 | 12 | ~130M |
| DiT-L | 24 | 1024 | 16 | ~458M |
| DiT-XL | 28 | 1152 | 16 | ~675M |

每个模型再配 P = 2 / 4 / 8 三个 patch size。命名规则 DiT-{S,B,L,XL}/{P}，例如 **DiT-XL/2** = 最大模型 + 最细 patch = 论文最强组合。

| Patch P | tokens N (32x32 latent) | Gflops (forward, DiT-XL) |
|---------|-------------------------|--------------------------|
| 8 | 16 | ~7 |
| 4 | 64 | ~30 |
| 2 | 256 | ~119 |

可以看出 patch size 对计算量的杠杆比模型 size 更猛——同样 DiT-XL，P=2 比 P=8 多 17 倍 Gflops。

## Section 3.3：训练配置

- **数据**：ImageNet-1k（128 万张图，1000 类），class-conditional。
- **图像尺寸**：256×256（主实验），后续也跑了 512×512。
- **VAE**：复用 LDM 的 VAE，weights frozen。
- **loss**：DDPM 标准 noise prediction（或 v-prediction），MSE。
- **schedule**：linear β schedule, T = 1000 steps。
- **optimizer**：AdamW, lr = 1e-4, **no warmup**, **no weight decay**（论文强调这两点对 DiT 重要）。
- **EMA**：weights 用 EMA decay 0.9999，跟 DDPM 一样。
- **classifier-free guidance**：训练时 10% 概率 drop 掉 class label，推理时按 CFG 公式插值。

参考训练脚本（commit 链接示意）：
`https://github.com/facebookresearch/DiT/blob/ed81ce2229091fd4ecc9a223645f95cf379d1f06/train.py` 里 `def main()` 把 mixed precision + EMA + DDPM scheduler 全串起来。

![DiT 架构总览](/papers/dit/01-architecture.webp)

## Section 4：实验结果

### Section 4.1：ImageNet 256×256 class-conditional

主结果（FID-50K，越低越好；CFG = classifier-free guidance scale）：

| 模型 | 参数 | FID (no CFG) | FID (CFG=1.5) | 备注 |
|------|------|--------------|---------------|------|
| ADM (Dhariwal 2021) | 554M | 10.94 | 4.59 | U-Net 代表 |
| LDM-4 (Rombach 2022) | 400M | 10.56 | 3.60 | latent + U-Net |
| **DiT-XL/2** | **675M** | **9.62** | **2.27** | DiT 路线 |

DiT-XL/2 在 CFG 下拿到 2.27 FID，是当时 ImageNet 256 class-conditional 的 SOTA。

### Section 4.2：ImageNet 512×512

DiT-XL/2 也拿了 SOTA：3.04 FID（CFG），优于 ADM 的 3.85。

### Algorithm 1：DiT 推理（DDPM 50-step CFG 采样）伪代码

```
Input: class label c, model DiT, VAE decoder D
1. z_T ~ N(0, I)         # init noise in latent space, shape [32,32,4]
2. for t = T, T-1, ..., 1:
3.     eps_cond = DiT(z_t, t, c)                     # text/class conditioned
4.     eps_uncond = DiT(z_t, t, null)                # unconditional pass
5.     eps = eps_uncond + s * (eps_cond - eps_uncond)   # CFG, s ~ 1.5
6.     z_{t-1} = DDPM_step(z_t, eps, t)               # standard denoising
7. x = D(z_0)             # decode latent back to pixels
8. return x
```

注意第 3 行和第 4 行：**每一步都要跑两次 DiT**——一次条件 + 一次无条件。CFG 让推理慢一倍。

> 怀疑：DiT 推理慢有两个原因——(1) DDPM 50-1000 步 (2) CFG 翻倍。学界已经有 DDIM、DPM-Solver 把 50 步压到 10 步。但 DiT 论文没怎么聊推理优化。今天部署 DiT 系（如 Flux）已经普遍用 DPM-Solver++ 之类的快采样。论文 SOTA 数字是不是在"慢推理 + 慢 sampler"上调出来的，不一定迁移到生产环境？

![DiT scaling law](/papers/dit/02-scaling.webp)

## Section 5：scaling law 的启示

论文最重磅的图是 Figure 8（上面 Fig 2 复刻）：横轴 Gflops，纵轴 FID，所有 12 个模型点都画上去，画出 4 条曲线。

观察到的几条规律：

1. **同一个模型内**：P 从 8 降到 4 再降到 2，FID 持续降（compute 同步上涨）。
2. **同一个 patch size 下**：S → B → L → XL，FID 也持续降。
3. **两个轴正交**：增大模型 ≈ 减小 patch（compute 一样的话）。
4. **没看到 plateau**：直到 ~120 Gflops，FID 还在降。

经验拟合的 power-law：

```
FID ~ Gflops^(-α),    α 约 0.3
```

这个 0.3 比 NLP 的 scaling law（α 约 0.5-0.7）小一些，意味着 diffusion 的回报递减更快——但仍然是正回报。

**给后续工作的方向感**：

- 想要更好的 FID？砸更多 compute。
- compute 该砸在"更大模型"还是"更细 patch"？两者都行。
- 同样 compute 下，DiT-XL/2 比 DiT-L/2 略好；DiT-XL/2 比 DiT-XL/4 显著好。

> 怀疑：power-law α=0.3 是在 ImageNet 256 算出来的。换数据集（LAION 5B 文生图）会不会变？换任务（视频）会不会变？Sora 用了 DiT 但没公布 scaling 数字，所以这个 α 在视频领域是不是还成立没人知道。

## Section 6：DiT 的衍生 + 应用

DiT 论文 2022-12 挂 arXiv，2023 收 ICCV。但真正让它出圈的是 2024 一连串"DiT 系"产品。

### Section 6.1：Sora（OpenAI 2024-02）

DiT + 时空 patchify + temporal attention，做视频生成。

- 输入：noisy latent video，shape [T, H/8, W/8, 4]（T = 时间帧数）。
- patchify 改成 3D：每个 patch 是 P_t × P × P 的 cube。
- DiT block 不变，只是 token 多了。
- 论文一作 William Peebles 加入 OpenAI 后主导 Sora。Sora 技术报告反复 cite DiT。

Sora 的成功让"DiT 是视频 backbone 的正解"这件事尘埃落定。

### Section 6.2：Stable Diffusion 3（Stability AI 2024-03）

SD3 提出 **MMDiT (multimodal DiT)**：

- 文本 token 一路 transformer，图像 token 一路 transformer。
- 两路在每个 block 互相 cross-modulate（不是单方向 cross-attention，而是双向）。
- 比 SD1/SD2 的 U-Net + cross-attn 提升明显。

SD3 论文（Esser et al. 2024）用的就是 DiT block 的扩展版。

### Section 6.3：Flux.1（Black Forest Labs 2024-08）

原 SD3 团队出来做的开源模型，DiT 系，工程优化更猛。Flux 把 DiT 拉到 12B 参数级别，是 2024 末开源 T2I 的 SOTA。

### Section 6.4：Pixart-α（华为诺亚 2023）

早期把 DiT 接到 T2I 的工作。把 class label 换成 T5 text encoder embedding，证明 DiT 不止 class-conditional 能用。

### Section 6.5：Hunyuan-DiT / Lumina-T2X / OpenSora

腾讯混元、上海 AI Lab Lumina、北大 OpenSora，都是 DiT 系。

### Section 6.6：HuggingFace Diffusers 集成

社区角度，DiT 已经是一等公民。Diffusers 库里 `Transformer2DModel` 就是泛化版 DiT，commit 链接示意：
`https://github.com/huggingface/diffusers/blob/c9ea7d0a5f3bc8e9a3d2c4f7e6b1a0c9d8e7f6a5/src/diffusers/models/transformers/transformer_2d.py` 把 patchify + DiT block 暴露为可配置组件，所有 SD3 / Flux / Pixart 用户都在用这条代码路径。

## Section 7：限制

DiT 不是完美方案，论文和后续工作也披露了几条短板：

1. **推理慢**：DDPM 50-1000 步 × 大 transformer 单次前向。比 GAN 一次出图慢 50-1000 倍。即便用 DPM-Solver 把步数压到 10，DiT-XL/2 一张 256×256 仍要 1-2 秒（A100）。
2. **训练贵**：DiT-XL/2 训到论文报告的 7M iter，论文用 8 台 8×A100 训了几百小时。普通研究者复现门槛高。
3. **小数据集劣势**：U-Net 的局部归纳偏置在 < 10K 图的小数据集仍然有用。DiT 在小数据集容易 overfit 或者训不动。
4. **依赖 VAE 质量**：DiT 在 latent 空间训。LDM 那个 VAE 在医疗影像、卫星图、艺术风格图上效果差，DiT 上限就被压低。
5. **CFG 翻倍开销**：每步要跑 conditional 和 unconditional 两次 forward，部署成本大。社区在做 CFG-distillation 来解，但效果有损。
6. **inference 时序优化难**：U-Net 时代有 ONNX / TensorRT / CoreML 一整套针对 conv 的加速器。DiT 的 attention 部分虽然也有 FlashAttention，但端到端的部署链不如 U-Net 成熟。
7. **位置编码扩展性**：DiT 用 frequency-based positional embedding，扩展到 1024×1024 或视频时需要做 RoPE / NTK 类外推。Sora、SD3 都做了改造，但都没有 transformer NLP 那套成熟。

> 怀疑：DiT 在 ImageNet 256 拿了 SOTA，但 ImageNet 是 class-conditional（1000 类）任务。同期的 Imagen、GLIDE、unCLIP 都做文本到图像（开放词汇）。DiT 论文不做文本条件实验。这种"class-conditional 强 + text-conditional 等后续"的策略合理，但严格说，DiT 论文证明的只是"transformer 在 class-conditional diffusion 强"，文本到图像那条路还得靠 SD3 / Pixart 才完整。

## Section 7.5：DiT block 4 种条件注入变体的消融

论文 Figure 6 把 4 种变体的 FID 训练曲线画在一起。这里复述结论 + 我的理解：

| 变体 | 条件注入方式 | 参数量 (per block) | 400K iter FID |
|------|--------------|--------------------|---------------|
| In-context | 把 t,c embedding 当成额外 token 拼到序列 | 0 (复用 attention) | ~75（最高） |
| Cross-attention | 引入额外 cross-attention，K,V 来自 t,c | ~3M | ~50 |
| adaLN | LayerNorm 的 γ,β 由 (t,c) MLP 投影 | ~2.5M | ~45 |
| **adaLN-Zero** | adaLN + 输出 gate α 初始化为 0 | ~2.5M | ~38（最低） |

Lessons：

1. **In-context 最差**：t,c 只在序列里占两个 slot，影响力被 attention 稀释。
2. **Cross-attention 中等**：比 in-context 强，因为每个 block 都重新调制；但参数最多。
3. **adaLN 比 cross-attention 略好且更便宜**：调制 LayerNorm 比加 cross-attention 路径更精炼。
4. **adaLN-Zero 最好**：在 adaLN 基础上加 zero-init gate，深网训练稳定，最终 FID 更低。

这套消融结果直接定调了后续 SD3 / Pixart / Flux 的 condition 注入设计——基本都用 adaLN-Zero 或它的变体。

> 怀疑：消融用的是 400K iter 的 FID。如果训到 7M iter（论文最终结果用的），各变体差距会不会缩小？深网架构在长训练下经常出现"开局劣势但终局相近"的现象。论文没在 7M iter 上做完整对照消融。

## Algorithm 2：DiT 训练 1 个 step 的伪代码

```
Input: image x, class c, VAE encoder E, DiT model
1. z = E(x)                              # encode to latent, [32,32,4]
2. t ~ Uniform(0, T)                     # sample timestep
3. eps ~ N(0, I)                         # sample noise
4. z_t = sqrt(alpha_bar_t) * z + sqrt(1 - alpha_bar_t) * eps
5. with prob 0.1: c = NULL_CLASS         # CFG drop
6. eps_pred = DiT(z_t, t, c)
7. loss = MSE(eps_pred, eps)
8. loss.backward(); EMA_update(weights)
```

第 5 行的 "10% drop class" 是 CFG 训练的关键——让模型同时学会有条件和无条件预测，推理时才能做 guidance 插值。

## Section 8：复现路径——从读论文到跑通

如果想自己复现 DiT 而不是直接用 Diffusers，这里列出一条最小路径——给学习者参考，不是 production 配置。

**Step 1：搞定 VAE。**

- 直接下载 LDM v1 的 VAE（kl-f8）。这是 SD1 全家共用的 VAE，HuggingFace 上 `stabilityai/sd-vae-ft-mse` 即可。
- 测试编码：把 ImageNet 一张 256×256 图喂进去，输出应该是 [1, 4, 32, 32]。
- 测试解码：把 latent 喂回去，输出应该是接近原图的 256×256 RGB。视觉对得上才能继续。

**Step 2：把 ImageNet 编码缓存到磁盘。**

- ImageNet train 1.28M 张图，每张编码后 4×32×32×4 字节 = 16KB，总共约 20GB。一次编码完缓存到磁盘，训练时直接读 latent，省掉每个 step 都跑 VAE 的开销。
- 注意 latent 要按 LDM 的 scale_factor (~0.18215) 缩放，否则数值范围对不上 DiT 训练时的 noise schedule。

**Step 3：实现 DiT 架构。**

- 直接抄 facebookresearch/DiT 的 models.py。重点抄 `DiTBlock`、`adaLN_modulation`、`PatchEmbed`、`final_layer`。
- 一开始用 DiT-S/4（小模型 + 中等 patch），单卡 A100 能训出可看的结果。
- 验证形状：输入 [B, 4, 32, 32] + t [B] + y [B]，输出 eps_pred [B, 4, 32, 32] 和（可选）sigma [B, 4, 32, 32]。

**Step 4：DDPM scheduler。**

- 用 diffusers 的 `DDPMScheduler` 或自己写 1000 步 linear β schedule。
- noise prediction loss = MSE(eps_pred, eps_true)。
- v-prediction 是后续优化，初次复现先用 eps。

**Step 5：训练循环 + EMA。**

- AdamW, lr 1e-4, 不要 warmup, 不要 weight decay。
- EMA decay 0.9999，每个 step update 一次。推理时用 EMA weights 而不是原始 weights。
- 10% 概率把 class label 换成 NULL（CFG drop）。
- 单卡 batch 32，DiT-S/4 训 100 epoch（~400K iter）能看到 FID 降到 50 左右。

**Step 6：CFG 推理。**

- 准备 50 步 DDPM sample（或者直接接 DPM-Solver++ 把 50 步压到 10）。
- 每步跑两次 forward：cond + uncond，按 CFG 公式插值。
- 把最终 latent 解码回像素。

**Step 7：评 FID-50K。**

- 用 pytorch-fid 或 cleanfid 包，从 ImageNet val 抽 50K 张参考，从 DiT 生成 50K 张样本，算 FID。

整条路径走通要 1-2 周（小模型 + 单卡）。但走通之后再去看 SD3 / Flux 的代码，会发现 80% 都在这套骨架上做扩展（多模态 token、3D patchify、更长 schedule 等）。

> 怀疑：上面这条复现路径里，"小模型 + 单卡" 真能拿到论文级 FID 吗？大概率拿不到——论文 FID 2.27 是 DiT-XL/2 + 8×8 卡 + 7M iter 的结果。复现路径主要是用来"看懂代码"，不是用来"重现 SOTA"。这条边界要明说，不然学习者会浪费 compute。

## 跟 U-Net 对照表

把 DiT 和经典 U-Net diffusion (ADM) 拉一张对照表：

| 维度 | U-Net (ADM) | DiT |
|------|-------------|-----|
| backbone 主体 | 卷积 + 跳跃连接 | transformer block |
| 多尺度处理 | 显式（下采样上采样） | 隐式（attention 全局可达） |
| 条件注入 | timestep embedding 加在 GroupNorm 上；class 加在 attention | adaLN-Zero（6 个向量 per block） |
| 局部归纳偏置 | 强（卷积） | 弱（attention） |
| 参数 scale 上限 | ~500M 后边际收益变小 | 测到 675M 仍有收益，无 plateau |
| 跨任务泛化 | 视觉为主 | 跟 NLP / vision transformer 共享生态 |
| 推理 latency | 卷积加速器成熟 | FlashAttention 但端到端工具链弱 |
| 小数据集表现 | 占优 | 劣 |

这张表也能解释为什么 DiT 要花一年才被工业接受——单看 ImageNet 256 数字 DiT 略胜，但工程链路差距让早期采用犹豫。直到 Sora、SD3 这种"超大模型 + 海量数据"场景出现，DiT 的 scaling 优势才完全发挥。

## 学到什么

**1. 归纳偏置是把双刃剑。**

U-Net 的卷积偏置在数据稀缺时是恩惠，在数据充裕时是枷锁。Transformer 没有强偏置，反而能从大数据里学到更好的表示。这条规律在 ViT (Dosovitskiy 2020) 已经证明过一次（判别），DiT 是在生成上又证明一次。模型的归纳偏置不要过度设计——给数据留空间。

**2. zero-init 是稳定深网的通用法宝。**

adaLN-Zero 让每个 block 初始等于 identity，深网瞬间稳。这条思想跟：

- ResNet 的残差（identity shortcut + 增量学习）
- Diffusion Policy 的 zero-init action head
- ControlNet 的 zero conv（保留预训练能力，再慢慢学控制）
- LoRA 的零初始化 B 矩阵

是一条线。**让模型从 do-nothing 起步**，比从随机起步稳得多。任何深网新架构都该考虑加 zero-init gate。

**3. scaling law 不是 NLP 专利。**

DiT 把 scaling law 从 NLP 搬到 diffusion，证明这条规律是普适的——只要架构设计得 scalable，喂更多 compute 就会持续涨点。后续 Sora、SD3、Flux 都遵循这条规律砸算力。

**4. 解耦 backbone 和任务有红利。**

DiT 把"diffusion 训练框架"和"backbone 选择"解耦了。LDM 已经做了"diffusion 跟空间解耦"（latent vs pixel）。DiT 再做"diffusion 跟 backbone 解耦"。每解耦一次，工程灵活性翻倍——同一个 LDM + DiT 框架能换 backbone 换数据换模态。

**5. patchify 是连接 vision 和 transformer 的桥。**

ViT 用 patchify 把图像变成 token 序列，DiT 复用同一招把 latent 变成 token 序列，Sora 把 patchify 扩展到 3D 时空。这一招看似简单，但每次扩展（图像 → latent → 视频 → 多模态）都没人质疑过。**简单的桥比复杂的端到端更经得起扩展**。

## 关联

- [[clip]]——CLIP 提供了文本-图像对齐的 embedding 空间，是 SD3 / Flux 这些 text-conditional DiT 的输入桥。
- [[vit]]——ViT 是 patchify + transformer 范式的源头，DiT 直接借这套思路。
- [[resnet]]——ResNet 的残差 + identity shortcut 思想，跟 adaLN-Zero 让每个 block 初始为 identity 同源。
- [[sam]]——SAM 也是 ViT 系，证明 patchify 在分割任务也 scale。
- [[dino]]——DINO 是 ViT 自监督；和 DiT 分别在判别 / 生成两条线证明 transformer scale。
- [[mae]]——MAE 是 ViT 的 mask autoencoder；和 DiT 一样靠 patchify 重建任务。
- [[stable-diffusion]]——LDM / SD 是 DiT 的训练框架。SD1/SD2 用 U-Net，SD3 才换 DiT。
- [[dalle-2]]——DALL-E 2 (unCLIP) 是 OpenAI 上一代文生图，DiT 是下一代 backbone 革命的开始。
- [[llava]]——LLaVA 把视觉和语言 transformer 接起来；DiT 把视觉和 diffusion 接起来。两条都是 transformer 一统天下的支线。
