---
title: SteinDreamer: Variance Reduction for Text-to-3D Score Distillation via Stein Identity
来源: https://arxiv.org/abs/2401.00604
日期: 2026-06-13
分类: 机器学习
子分类: 3D生成
provenance: pipeline-v3
---

# SteinDreamer：用 Stein 恒等式降低方差，让文字生成 3D 更稳更快

## 一、从"盲人摸象"说起

想象你是一位雕塑家，面前有一块石头，但你不能直接看到它。你只能让助手从不同角度拍照，然后把照片拿给一位"懂艺术的评论家"（一个在 2D 图片上训练好的 AI）来评价。评论家会说："这张照片里的东西应该往某个方向改一改。"

你的任务就是把评论家的意见翻译成对石头的雕刻动作。这就是 **Text-to-3D**（文字生成 3D）的核心思路。

但问题来了：每次只拍一张照片就听评论家的，意见波动很大——今天说往左刻，明天说往右刻。结果石头被刻得歪歪扭扭，甚至出现"两张脸"（Janus 问题）或"幽灵般的伪影"。

SteinDreamer 这篇论文的核心洞察是：**问题的根源不是评论家不准，而是我们听意见的方式方差太高**。他们引入了一个数学工具——Stein 恒等式——来"降噪"，让雕刻过程更稳定、更快收敛。

## 二、前置知识：Score Distillation 是什么

在深入之前，需要了解两个关键概念。

### 2.1 NeRF：用神经网络表示 3D

NeRF（Neural Radiance Field）把 3D 场景用一个神经网络来表示。给定空间中的一个点 (x, y, z) 和一个观察方向，网络输出该点的颜色和密度。通过"体积渲染"（volume rendering），可以从任意角度生成 2D 图像。

### 2.2 SDS：DreamFusion 的核心

DreamFusion 提出了 **Score Distillation Sampling (SDS)**，公式如下：

```
Δ_SDS = E[t, c, ε] [ ω(t) · (∂g(θ,c)/∂θ) · (σ_t · ∇log p_t(x|y) - ε) ]
```

拆开看：
- `θ` 是 3D 模型的参数（比如 NeRF 的权重）
- `g(θ, c)` 是从参数 θ、相机位姿 c 渲染出的一张 2D 图片
- `∇log p_t(x|y)` 是预训练的文本到图像扩散模型给出的"评分梯度"——告诉这张图应该往哪个方向改才能更像文字描述 y
- `ε` 是随机噪声
- `∂g(θ,c)/∂θ` 是通过链式法则把 2D 的评分"反向传播"回 3D 参数

简单类比：SDS 就是让 3D 模型去"模仿"扩散模型在 2D 图片上的分布。

### 2.3 VSD：ProlificDreamer 的改进

VSD（Variational Score Distillation）在 SDS 的基础上加了一个额外的分数项：

```
Δ_VSD = E[t, c, ε] [ ω(t) · (∂g(θ,c)/∂θ) · (σ_t · ∇log p_t(x|y) - σ_t · ∇log q_t(x|c)) ]
```

多出来的 `∇log q_t(x|c)` 是对"渲染图像本身分布"的估计，相当于给自己加了一个"自我校准"。效果确实比 SDS 好，但论文作者追问：**为什么好？本质是什么？**

## 三、论文的核心发现：SDS 和 VSD 都是"控制变量法"

这是论文最精彩的理论贡献之一。

### 3.1 什么是控制变量（Control Variate）

在统计学中，如果你想估算一个难以计算的期望值，可以引入一个**已知均值为零**的辅助函数来降低方差。这就是蒙特卡洛估计中的"控制变量法"。

公式上，假设你要估算 E[f(X)]，如果你有一个函数 h(X) 满足 E[h(X)] = 0，那么：

```
E[f(X) + μ · h(X)] = E[f(X)] + μ · E[h(X)] = E[f(X)]
```

加了 h(X) 之后，估计的**期望不变**（仍然是无偏的），但如果 h(X) 和 f(X) 高度相关，方差就会显著降低。

### 3.2 SDS 和 VSD 的本质

论文把 SDS 拆成两部分：

```
Δ_SDS = E[ f(t,θ,x,c) ] - E[ h_SDS(t,θ,x,c) ]
```

其中：
- `f` 是扩散模型的评分项
- `h_SDS` 包含随机噪声 ε，其期望为 0

同样地，VSD 也可以拆成：

```
Δ_VSD = E[ f(t,θ,x,c) ] - E[ h_VSD(t,θ,x,c) ]
```

其中 `h_VSD` 包含 `∇log q_t(x|c)`，也是一个零均值项。

**关键结论**：SDS 和 VSD 在期望意义上是完全等价的！它们都在最小化同一个 KL 散度。VSD 之所以表现更好，是因为它的控制变量 h_VSD 与原始评分 f 的相关性更高，从而方差更小。

用日常话说：SDS 用的是"纯随机噪声"做控制变量，而 VSD 用的是"自己渲染出来的图像分布"做控制变量——后者显然跟真实情况更接近，所以效果更好。

## 四、SteinDreamer 的方案：Stein 恒等式

既然控制变量法是关键，那能不能找到**更灵活、相关性更强**的控制变量？论文的答案是：能，用 Stein 恒等式。

### 4.1 Stein 恒等式

Stein 恒等式是一个优美的数学结果。对于任意分布 p(x) 和任意满足正则条件的函数 φ(x)，有：

```
E_{x~p} [ ∇log p(x) · φ(x) + ∇_x φ(x) ] = 0
```

这个公式的意思是：括号里这一坨东西的期望永远是零。也就是说，它可以作为一个**控制变量**！

### 4.2 Stein Score Distillation (SSD)

把 Stein 恒等式应用到 Score Distillation 中，论文得到了 SSD 的更新规则：

```
Δ_SSD = E[t,c,ε] [ ω(t) · (∂g(θ,c)/∂θ) · (σ_t · ∇log p_t(x|y) + μ ⊙ [ε·φ + ∇_x φ]) ]
```

对比 SDS/VSD，唯一的不同是在评分梯度后面加了一项 `μ ⊙ [ε·φ + ∇_x φ]`。

这里：
- `φ` 是任意基线函数（baseline function），可以是任何神经网络
- `μ` 是可学习的权重，用来最优地降低方差
- `[ε·φ + ∇_x φ]` 来自 Stein 恒等式，保证期望为零

### 4.3 论文中的具体实现

论文中，φ 是用 MiDAS（一个单目深度估计器）来实现的：

```
φ(t, x, θ, c) = -ℓ( α(θ, c), MiDAS(x) )
```

具体来说：
1. 从当前 3D 模型渲染出一张 RGB 图和一张深度图
2. 用 MiDAS 从带噪声的 RGB 图中预测深度
3. 计算预测深度和真实深度之间的相关性损失作为 φ
4. 通过自动微分得到 ∇_x φ

这样做的直觉是：如果深度估计和渲染深度高度一致，说明 3D 结构是合理的。这个一致性信号可以作为控制变量来稳定梯度。

## 五、代码示例

### 示例 1：SSD 梯度更新的伪代码实现

```python
def ssd_step(nerf_model, diffusion_model, depth_estimator, theta, camera, text_prompt, mu):
    """
    SteinScoreDistillation 的一步更新
    
    参数:
        nerf_model:       NeRF 3D 模型，参数为 theta
        diffusion_model:  预训练的文本到图像扩散模型
        depth_estimator:  MiDAS 单目深度估计器
        theta:            当前 3D 模型参数
        camera:           随机采样的相机位姿
        text_prompt:      文本描述
        mu:               控制变量的可学习权重
    """
    # Step 1: 从当前 3D 模型渲染 RGB 图和深度图
    rgb_rendered = nerf_model.render(camera, theta)       # 渲染 RGB
    depth_rendered = nerf_model.render_depth(camera, theta) # 渲染深度
    
    # Step 2: 添加噪声，得到带噪声的观测
    t = random_diffusion_time()          # 随机采样时间步
    alpha_t, sigma_t = diffusion_coeffs(t)
    epsilon = torch.randn_like(rgb_rendered)
    x_noisy = alpha_t * rgb_rendered + sigma_t * epsilon
    
    # Step 3: 用扩散模型估计评分梯度（和 SDS 一样）
    score = diffusion_model.predict_noise(x_noisy, t, text_prompt)
    score_grad = sigma_t * (score - epsilon)
    
    # Step 4: 用 MiDAS 估计深度，构建 Stein 基线函数 phi
    depth_predicted = depth_estimator(x_noisy)
    phi = -pearson_correlation(depth_rendered, depth_predicted)
    
    # Step 5: 计算 phi 对输入图像的梯度
    phi_grad = torch.autograd.grad(phi, x_noisy, create_graph=True)[0]
    
    # Step 6: 构造 Stein 控制变量
    stein_control = epsilon * phi + phi_grad
    control_variate = mu * stein_control
    
    # Step 7: 合并评分和控制变量
    total_score = score_grad + control_variate
    
    # Step 8: 通过链式法则回传到 3D 参数
    render_grad = torch.autograd.grad(
        total_score, rgb_rendered, retain_graph=True
    )[0]
    gradient = torch.autograd.grad(
        rgb_rendered, theta, grad_outputs=render_grad
    )[0]
    
    return gradient


def update_mu(nerf_model, diffusion_model, depth_estimator, theta, camera, text_prompt, mu):
    """
    优化 mu 以最小梯度范数（方差最小化）
    
    固定 theta，调整 mu 使得梯度更新的二阶矩最小。
    这等价于最小化梯度范数的平方。
    """
    gradient = ssd_step(nerf_model, diffusion_model, depth_estimator,
                        theta, camera, text_prompt, mu)
    
    # 最小化梯度范数的平方
    loss = torch.sum(gradient ** 2)
    
    # 反向传播更新 mu
    mu_grad = torch.autograd.grad(loss, mu, create_graph=True)[0]
    mu = mu - lr_mu * mu_grad
    
    return mu
```

### 示例 2：完整的 SteinDreamer 训练循环

```python
class SteinDreamer:
    def __init__(self, nerf_model, diffusion_model, depth_estimator, text_prompt):
        self.nerf = nerf_model
        self.diffusion = diffusion_model
        self.depth_est = depth_estimator
        self.prompt = text_prompt
        
        # 可学习的控制变量权重
        self.mu = torch.ones_like(nerf_model.get_params())
        
        # 优化器
        self.optimizer_theta = torch.optim.Adam(self.nerf.parameters(), lr=1e-3)
        self.optimizer_mu = torch.optim.Adam([self.mu], lr=0.01)
        
    def train_step(self, step):
        """执行一步交替优化"""
        camera = sample_random_camera()
        t = sample_diffusion_time()
        
        # --- 阶段 1: 更新 3D 模型参数 theta ---
        self.optimizer_theta.zero_grad()
        
        gradient = ssd_step(
            self.nerf, self.diffusion, self.depth_est,
            self.nerf.get_params(), camera, self.prompt, self.mu
        )
        
        self.optimizer_theta.step(lambda: gradient)
        
        # --- 阶段 2: 冻结 theta，优化 mu ---
        self.optimizer_mu.zero_grad()
        
        gradient_frozen = ssd_step(
            self.nerf, self.diffusion, self.depth_est,
            self.nerf.get_params().detach(), camera, self.prompt, self.mu
        )
        
        loss_mu = torch.sum(gradient_frozen ** 2)
        loss_mu.backward()
        self.optimizer_mu.step()
        
        # 记录方差
        var = torch.var(gradient).item()
        if step % 100 == 0:
            print(f"Step {step}, Gradient Variance: {var:.6f}")
        
        return var
    
    def train(self, num_steps=5000):
        """完整训练流程"""
        for step in range(num_steps):
            var = self.train_step(step)
            
            # 如果方差已经很低，可以提前停止
            if var < 1e-6:
                print(f"Converged at step {step}")
                break
        
        return self.nerf
```

## 六、实验结果

### 6.1 物体生成（Object-Centric）

在单个物体的生成任务上，SteinDreamer 相比 SDS 和 VSD：
- 纹理更清晰，没有过饱和和过度平滑
- 几何更平滑，没有漂浮物（floaters）
- 有效缓解了 Janus 问题（比如"狗雕像"只出现一张脸，而不是两张）

### 6.2 场景生成（Scene-Level）

在大场景生成中：
- SDS 产生模糊、颜色不真实的图像
- VSD 的背景噪声大，且在纹理细化阶段可能发散
- SteinDreamer 生成更锐利、细节更好的结果

### 6.3 收敛速度

这是 SteinDreamer 的一大优势：
- 比现有方法节省 **14%-22%** 的扩散模型调用次数
- 每次迭代比 VSD 快约 **30%**（因为不需要微调另一个扩散模型）

## 七、为什么 Stein 恒等式这么好用？

回到最根本的问题：**为什么加了 Stein 控制变量就能降方差？**

从公式上看，控制变量降低方差的程度取决于它与原始评分函数的相关性：

```
Var[新估计量] = (1 - Corr(原始, 控制变量)^2) × Var[原始]
```

相关性越高，方差降得越多。

在 SDS 中，控制变量是纯高斯噪声，和真实评分几乎不相关，所以方差降低有限。

在 VSD 中，控制变量是渲染图像自身的分数估计，相关性提高了，但需要额外微调一个扩散模型，计算成本高。

在 SteinDreamer 中，控制变量来自 Stein 恒等式，基线函数 φ 可以用任何网络（如 MiDAS 深度估计器）来实现。这个网络捕捉的是 3D 结构的先验知识（深度/法向一致性），与评分函数高度相关，因此方差降低显著，而且不需要微调扩散模型。

## 八、总结

| 方面 | SDS | VSD | SteinDreamer (SSD) |
|------|-----|-----|-------------------|
| 核心思想 | 用噪声做控制变量 | 用渲染图像分数做控制变量 | 用 Stein 恒等式构造控制变量 |
| 方差大小 | 高 | 中等 | 低 |
| 额外成本 | 无 | 需微调扩散模型 | 只需 MiDAS 深度估计 |
| 收敛速度 | 慢 | 中等 | 最快（快 14-22%） |
| 单次迭代速度 | 快 | 慢（30%+） | 快 |
| 生成质量 | 一般 | 较好 | 最好 |

**一句话总结**：SteinDreamer 通过 Stein 恒等式把"降低方差"这件事变成了一个可以自由设计控制变量的问题，用现成的深度估计器就能显著提升 3D 生成的质量和速度。

## 九、延伸思考

1. **Stein 控制变量是否还有其他形式？** 论文中用了深度估计器，但理论上任何能捕捉 3D 结构信息的网络都可以作为 φ。法向量估计、语义分割等都可能有效。

2. **μ 的学习策略**：论文中采用交替优化的方式（固定 θ 更新 μ，固定 μ 更新 θ）。是否有更高效的联合优化方法？

3. **与 3DGS 的结合**：NeRF 正在被 3D Gaussian Splatting 取代，SteinDreamer 的思路能否迁移到 3DGS 框架中？

4. **更广泛的方差缩减**：除了 Stein 恒等式，还有哪些数学工具可以用于构造控制变量？这可能是一个值得探索的方向。
