---
title: "核聚变等离子体破坏预测的自回归 Transformer"
source: https://arxiv.org/abs/2401.00051
date: 2026-06-13
category: 物理科学 + AI
subcategory: 时间序列预测
provenance: pipeline-v3
分类: 其他
子分类: economics-game-theory
---

# 核聚变等离子体破坏预测的自回归 Transformer

## 一、日常类比：给高压锅装一个"暴脾气预测器"

想象你有一个高压锅，里面压力越来越大了。你可以通过几个仪表看出来：温度表、压力表、阀门的位置。

问题是：这个高压锅可能在下一秒突然爆炸。

你该怎么办？你不能每次都拆开来检查，因为那时候已经晚了。你需要一个"预测器"，它能根据过去一段时间仪表的变化趋势，提前告诉你：这个锅还有没有危险。

论文做的就是这样一件事。只不过"高压锅"是一个核聚变反应堆（叫 tokamak），"爆炸"叫 disruption（破坏/失稳），"仪表"则是 10 几种传感器数据。

## 二、核心问题：什么是"破坏"（Disruption）？

在 tokamak 中，等离子体被强大的磁场约束在一个环形真空室里，温度可达太阳中心的水平。但磁场并不完美，等离子体内部会出现不稳定（叫 MHD 不稳定性），最终导致等离子体突然接触反应堆壁，造成：

- 设备损坏
- 停机维修
- 经济损失

目标：在破坏发生前，给控制系统留出至少 40ms 的反应时间。

## 三、核心概念：Transformer 为什么适合这个任务？

### 3.1 类比：像阅读"病历记录"一样阅读时间序列

普通神经网络看时间序列，就像一个人每次只看病历的最后几行。

Transformer 的"注意力机制"（attention）则像医生翻阅整份病历——它能同时关注到：
- 1 分钟前某个异常电压尖峰
- 30 秒前的一次温度骤降
- 整个实验过程中 plasma pressure 的变化趋势

这就叫 **长期记忆（long-term memory）**。

### 3.2 论文的两个贡献

1. **性能提升**：用 GPT 风格的自回归 Transformer，AUC 指标比现有最优方法（HDL）提升约 5%
2. **科学发现**：证明了等离子体具有长期记忆——即实验开始时的某个异常，会影响几秒后的结果

### 3.3 关键创新：课程学习（Curriculum Learning）

类比：教小朋友算数，先教一位数加法，再教两位数，再教三位数。

论文中，训练时先让模型预测"只剩 10ms 就结束"的数据，再逐步扩展到 20ms、30ms、40ms。这样模型先学会简单的，再挑战复杂的，效果比直接教难的要好 10%。

### 3.4 关键创新：状态预训练（State Pretraining）

类比：学英语先学单词，再学造句。

模型先学习"预测下一个时刻的传感器读数"（这是一个回归任务），学会了等离子体的物理规律后，再换成"预测是否会发生破坏"（这是一个分类任务）。两步走的效果比一步到位好。

## 四、代码示例

### 示例 1：数据预处理——把三个不同 tokamak 的传感器数据统一成 5ms 间隔

```python
import numpy as np
import pandas as pd

def preprocess_shot(sensor_df, target_interval_ms=5):
    """
    把一次 tokamak "shot" 的传感器数据标准化为固定时间间隔。
    
    三个 tokamak（C-Mod, DIII-D, EAST）的采样率不同：
      - C-Mod:  0.005ms  (200kHz)
      - DIII-D: 0.01ms   (100kHz)
      - EAST:   0.025ms  (40kHz)
    
    统一离散化到 5ms 间隔，用前向填充（forward-fill）处理缺失值。
    """
    # 假设 sensor_df 有 'timestamp_ms' 列和各种传感器读数
    start = sensor_df['timestamp_ms'].iloc[0]
    end = sensor_df['timestamp_ms'].iloc[-1]
    
    # 生成统一的 5ms 时间戳
    time_axis = np.arange(start, end, target_interval_ms)
    
    # 对每个传感器列做前向填充插值
    sensor_cols = [c for c in sensor_df.columns if c != 'timestamp_ms']
    result = pd.DataFrame({'timestamp_ms': time_axis})
    
    for col in sensor_cols:
        # 先按时间排序
        sorted_data = sensor_df.sort_values('timestamp_ms')
        # 设置时间索引，重采样
        interp_data = sorted_data.set_index('timestamp_ms')[col]
        interp_data = interp_data.reindex(
            time_axis, method='ffill'  # 前向填充
        )
        result[col] = interp_data.values
        
    return result


def normalize_features(train_df, val_df):
    """
    用训练集的均值和方差标准化所有传感器读数。
    测试集/推理时用相同的参数，不能重新算。
    """
    sensor_cols = [c for c in train_df.columns if c != 'timestamp_ms']
    
    means = train_df[sensor_cols].mean()
    stds = train_df[sensor_cols].std()
    
    train_normalized = (train_df[sensor_cols] - means) / stds
    val_normalized = (val_df[sensor_cols] - means) / stds
    
    return train_normalized, val_normalized, means, stds
```

### 示例 2：自回归 Transformer 架构——用 GPT 做破坏预测

```python
import torch
import torch.nn as nn

class DisruptionPredictor(nn.Module):
    """
    基于 GPT-2 的破坏预测模型。
    
    典型 GPT 用于处理离散的"单词 token"，这里输入是连续传感器读数，
    所以不需要 embedding 层——直接把归一化后的传感器向量输入 transformer。
    """
    
    def __init__(self, num_features=13, d_model=128, nhead=4, 
                 num_layers=4, dropout=0.1):
        super().__init__()
        
        # 由于输入已经是连续向量，无需 embedding 层
        # 但需要位置编码：告诉模型每个数据点的时序位置
        self.positional_encoding = PositionalEncoding(
            d_model, max_len=10000
        )
        
        # Transformer Encoder（GPT 用的是 Decoder-only，但这里用
        # Encoder 做序列分类更高效）
        encoder_layer = nn.TransformerEncoderLayer(
            d_model=d_model,
            nhead=nhead,
            dim_feedforward=d_model * 4,
            dropout=dropout,
            batch_first=True  # 输入形状: (batch, seq_len, features)
        )
        self.transformer = nn.TransformerEncoder(encoder_layer, 
                                                  num_layers=num_layers)
        
        # 分类头：输出一个二分类概率（是否发生破坏）
        self.classifier = nn.Sequential(
            nn.LayerNorm(d_model),
            nn.Linear(d_model, 64),
            nn.GELU(),
            nn.Dropout(dropout),
            nn.Linear(64, 1)
        )
        
    def forward(self, x):
        """
        Args:
            x: (batch_size, seq_len, num_features) 传感器时间序列
        
        Returns:
            logit: (batch_size,) 二分类 logits
        """
        # x 已经是 (B, T, d_model)，加上位置编码
        x = self.positional_encoding(x)
        
        # Transformer 编码
        encoded = self.transformer(x)  # (B, T, d_model)
        
        # 取最后一个时间步的输出做分类
        last_hidden = encoded[:, -1, :]  # (B, d_model)
        
        logit = self.classifier(last_hidden).squeeze(-1)
        return logit


class PositionalEncoding(nn.Module):
    """
    正弦位置编码：为每个时间步生成唯一的编码向量。
    
    类比：给时间序列中的每个数据点贴上一个"第几秒"的标签，
    让模型知道数据的先后顺序。
    """
    
    def __init__(self, d_model, max_len=5000):
        super().__init__()
        pe = torch.zeros(max_len, d_model)
        position = torch.arange(0, max_len, dtype=torch.float).unsqueeze(1)
        div_term = torch.exp(
            torch.arange(0, d_model, 2).float() * (-np.log(10000.0) / d_model)
        )
        pe[:, 0::2] = torch.sin(position * div_term)
        pe[:, 1::2] = torch.cos(position * div_term)
        self.register_buffer('pe', pe.unsqueeze(0))
        
    def forward(self, x):
        # x: (B, T, D) -> 加上位置编码
        return x + self.pe[:, :x.size(1), :]
```

### 示例 3：课程学习训练——从简单到困难

```python
def curriculum_training(model, dataloaders_by_cutoff, 
                        num_steps_per_phase=50000, device='cuda'):
    """
    课程学习：逐步增加训练难度。
    
    Cutoff 指从 shot 结尾截断掉多少毫秒：
      - Cutoff=0ms：   看完整条 shot（最难，但模型没学过）
      - Cutoff=40ms：  保留前 N-40ms，最后 40ms 不预测（标准设置）
      
    训练顺序：0ms → 10ms → 20ms → 30ms → 40ms
    类比：先学简单题，再学复杂题。
    """
    optimizer = torch.optim.AdamW(model.parameters(), lr=1e-4)
    criterion = nn.BCEWithLogitsLoss()
    
    # 按 cutoff 从小到大训练
    cutoffs = [0, 10, 20, 30, 40]
    
    for cutoff in cutoffs:
        loader = dataloaders_by_cutoff[cutoff]
        print(f"Training with cutoff={cutoff}ms, {num_steps_per_phase} steps")
        
        model.train()
        for step, (features, labels) in enumerate(loader):
            features = features.to(device)
            labels = labels.to(device)
            
            optimizer.zero_grad()
            logits = model(features)
            loss = criterion(logits, labels.float())
            loss.backward()
            optimizer.step()
            
            if step % 1000 == 0:
                print(f"  Step {step}, Loss: {loss.item():.4f}")
                
            if step >= num_steps_per_phase:
                break
                
    print("Curriculum training complete!")


# 状态预训练：先学会"预测下一个传感器读数"
def state_pretraining(model, nsp_loader, num_steps=50000, device='cuda'):
    """
    状态预训练（State Pretraining）：
    1. 加一个回归头，预测下一时刻的传感器值
    2. 训练 50k 步直到收敛
    3. 换回分类头，继续训练破坏预测任务
    
    类比：学英语先学会"下一个词是什么"，自然就能理解整句话了。
    """
    # 先添加回归头
    regression_head = nn.Linear(model.classifier[1].in_features, 
                                 model.classifier[1].in_features)
    # 注意：实际实现中需要修改 model 的 forward 来输出回归预测
    
    optimizer = torch.optim.AdamW(model.parameters(), lr=1e-4)
    criterion = nn.L1Loss()  # MAE loss
    
    model.train()
    for step, (features, next_features) in enumerate(nsp_loader):
        features = features.to(device)
        next_features = next_features.to(device)
        
        optimizer.zero_grad()
        # 回归预测
        pred_next = model.forward_regression(features)
        loss = criterion(pred_next, next_features)
        loss.backward()
        optimizer.step()
        
        if step >= num_steps:
            break
            
    print(f"State pretraining complete after {num_steps} steps")
    
    # 之后恢复原始分类头，用分类 loss 继续训练
    # model.restore_classification_head()
```

## 五、实验结果摘要

| 训练数据组合 | HDL AUC | 普通 GPT AUC | 增强 GPT AUC |
|---|---|---|---|
| 三个 tokamak 全量 | 0.72 | 0.76 | 0.77 |
| 增强 GPT 最佳情况 | 0.831 | 0.836 | 0.841 |

- **AUC 提升**：平均比 HDL 基线高 5%
- **推理速度**：单次前向传播 1-3ms，可实时部署
- **长期记忆验证**：当输入上下文从 480ms 减少到 80ms 时，模型性能下降，说明它确实在利用整条 shot 的信息

## 六、注意力机制揭示了什么物理规律？

论文通过可视化注意力图发现：

1. **电压尖峰**：注意力集中在 loop voltage（环路电压）的尖峰上，电压升高通常意味着系统压力增大
2. **冷却等离子体**：注意力高的区域对应 beta_p 上升和 L_i 下降，这正是边缘不稳定性（edge instabilities）的特征

这说明 Transformer 不是"黑箱"——它学到的模式与已知的等离子体物理规律一致。

## 七、未来方向

论文提到当前模型优化的是离散时间序列（类似句子中的词），但物理过程是连续的。未来计划评估 Autoformer，用自相关 FFT 分解替代离散注意力块，更适合连续序列。
