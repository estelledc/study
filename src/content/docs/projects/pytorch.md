---
title: 'PyTorch — 深度学习主流框架'
来源: 'https://github.com/pytorch/pytorch'
日期: '2026-05-30'
分类: '数据科学与 AI'
难度: '中级'
---

## 是什么

PyTorch 是一个**用 Python 写神经网络、让 GPU 替你跑数学**的框架。日常类比：像一个**会自动求导的超级 NumPy**——你随手写矩阵运算，它一边算结果，一边在背后偷偷记下"刚才每一步怎么算的"，等你说"该反向传播了"，它就把链式法则替你跑一遍。

你写：

```python
import torch
x = torch.tensor([2.0], requires_grad=True)
y = x ** 3 + 2 * x
y.backward()
print(x.grad)  # tensor([14.])  ← 3*x^2 + 2 在 x=2 处
```

你**没写一行求导公式**，PyTorch 自己推出 `dy/dx = 14`。这就是 autograd。

加上 `.cuda()` 一句话搬到 GPU，PyTorch 就成了 OpenAI、Tesla、HuggingFace 训练大模型的**事实标准底座**。

## 为什么重要

不理解 PyTorch，下面这些事都没法解释：

- 为什么 2018 年后**研究界论文几乎全用 PyTorch**，TensorFlow 退守工业部署
- 为什么写神经网络可以像写普通 Python（`for` 循环、`if` 分支随便用）——这叫**动态图**
- 为什么 2023 年 `torch.compile` 一出，同样代码不改一个字就快 30%-200%
- 为什么 Meta 2022 年把它**捐给 Linux Foundation**——避免单一厂商绑架，社区才放心用

## 核心要点

PyTorch 的能力可以拆成 **四层**：

1. **Tensor（张量）**：多维数组，和 NumPy 几乎一样的 API，但能跑在 GPU 上。是所有计算的基本单位。

2. **Autograd（自动微分）**：每个 `requires_grad=True` 的 tensor 在被运算时，PyTorch 偷偷建一棵"计算图"，记录"谁是谁算来的"。`.backward()` 时反过来跑链式法则。

3. **nn.Module（积木）**：把"一层神经网络"封装成一个类，参数自动注册、`.to(device)` 自动搬。复杂网络靠嵌套组合而不是从零写。

4. **torch.compile（2.0 新引擎）**：把你的 eager 代码用 TorchDynamo 抓成图，再交给 TorchInductor + Triton 编译成融合后的 GPU kernel。**不改代码就提速**。

## 实践案例

### 案例 1：写一个最小的神经网络训练循环

```python
import torch
from torch import nn

# 假数据：假装已有 dataloader，每步给一对 (x, y)
x = torch.randn(8, 10)
y = torch.randn(8, 1)

model = nn.Sequential(nn.Linear(10, 32), nn.ReLU(), nn.Linear(32, 1))
opt = torch.optim.Adam(model.parameters(), lr=1e-3)
loss_fn = nn.MSELoss()

pred = model(x)
loss = loss_fn(pred, y)
opt.zero_grad()      # 清掉上一轮的梯度
loss.backward()      # 反向传播
opt.step()           # 用梯度更新参数
```

这几行就是**所有 PyTorch 训练**的骨架。`forward → loss → backward → step`，套进 `for` 循环到收敛。

### 案例 2：动态图的威力——`if` 分支随便用

```python
def forward(x):
    if x.sum() > 0:
        return self.branch_a(x)
    else:
        return self.branch_b(x)
```

**TensorFlow 1.x 时代**这要写 `tf.cond`、构造 placeholder、`session.run`。PyTorch 直接 Python `if`——因为图是**每次 forward 现场建**的，不是预先编译的。

### 案例 3：torch.compile 一行加速

```python
model = MyBigModel()
model = torch.compile(model)   # ← 加这一行
# 训练循环不动
```

PyTorch 2.0+ 把 forward 抓成图，TorchInductor 生成 Triton kernel，常见模型 30%-200% 加速。**eager 易调试 + 编译时高性能** 一起拿。

## 踩过的坑

1. **CUDA 版本必须严格对齐**：装 PyTorch 时去[官网选择器](https://pytorch.org/get-started/locally/)选 CUDA 11.8 / 12.1，错一个就 `CUDA error: no kernel image is available`。`pip install torch` 不带版本默认 CPU 版，新人常装错以为没 GPU。

2. **in-place op + autograd = 翻车**：`x += 1` 这种**就地修改**会破坏 autograd 记录的中间结果。报错 `one of the variables needed for gradient computation has been modified`。改成 `x = x + 1`。

3. **DataLoader 的 num_workers 在 macOS 行为不同**：Linux fork、macOS spawn，spawn 下子进程要重新 import，全局变量不共享，常导致"Linux 跑得通 Mac 跑不通"。

4. **`.detach()` vs `.no_grad()` 别混**：`.detach()` 切断单个 tensor 的梯度链；`with torch.no_grad():` 关整个块的 autograd。推理时用后者更省显存。

5. **梯度不清零会累加**：忘了 `opt.zero_grad()` 上一轮梯度会叠到这一轮，loss 看起来"震荡"找不到原因。

## 适用 vs 不适用场景

**适用**：

- 研究原型（动态图 + Python 调试体验）
- 大模型训练（FSDP / DDP / TorchElastic 分布式生态成熟）
- 快速迭代实验（不用编译图，改完即跑）
- 自定义算子（写 CUDA / Triton kernel 后注册回 Python）

**不适用**：

- 极致部署性能（移动端 / 嵌入式）→ 用 ONNX Runtime / TFLite / ExecuTorch 转出
- 纯函数式纯科学计算 → JAX 的 `vmap` / `pmap` / `grad` 组合更优雅
- 不需要 GPU 的小数据 → NumPy + scikit-learn 更轻
- 完全静态、低延迟推理服务 → 转 TensorRT / OpenVINO 更稳

## 历史小故事（可跳过）

- **2002 年**：Torch 在瑞士 IDIAP 出生，Lua 写的，Yann LeCun 团队用了多年
- **2016 年**：Soumith Chintala 等在 Meta FAIR 把 Torch 用 Python 重写——PyTorch 0.1 发布
- **2018 年**：Caffe2 合并进来，PyTorch 1.0 发布，TorchScript 上线
- **2022-09**：Meta 把 PyTorch 捐给 Linux Foundation，成立 PyTorch Foundation
- **2023-03**：PyTorch 2.0 发布，`torch.compile` 成为旗舰特性
- **现在**：~84k stars，HuggingFace / OpenAI / Tesla 训练栈底座

## 学到什么

1. **eager 模式不是性能妥协**——动态图调试体验 + JIT 编译可以同时拿到（torch.compile 证明了）
2. **autograd 是"反向 mode 自动微分"的工程化**，本质是计算图反向遍历 + 链式法则
3. **API 稳定性比新功能更重要**——PyTorch 8 年向后兼容做得比同期框架都好
4. **治理决定信任**——Meta 主动让出控制权进基金会，企业才敢押注
5. **生态护城河**——HuggingFace / Lightning / TorchVision 等上层栈让换框架的迁移成本极高
6. **"Pythonic"不是口号**——用户能用直觉调试任何中间状态，是研究界投票的根本原因

## 延伸阅读

- 官方教程：[PyTorch Tutorials](https://pytorch.org/tutorials/) — 从 60 分钟入门到分布式训练
- 必读论文：[PyTorch: An Imperative Style, High-Performance Deep Learning Library (NeurIPS 2019)](https://arxiv.org/abs/1912.01703)
- torch.compile 深读：[PyTorch 2.0 paper / blog](https://pytorch.org/get-started/pytorch-2.0/)
- [[lambda-calculus]] —— autograd 的数学根基也是函数 + 高阶组合

## 关联

- [[llvm]] —— TorchInductor 走的是 LLVM 风格的多级 IR + 后端代码生成
- [[lambda-calculus]] —— autograd 把"前向函数"映成"反向函数"的能力本质是高阶函数变换
- [[ssa]] —— TorchDynamo 抓出来的 FX Graph 与 SSA 的"每个值只赋值一次"思路相通
- [[hindley-milner]] —— PyTorch 的 tensor shape 推导背后也是"占位符 + 解方程"的思想

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

