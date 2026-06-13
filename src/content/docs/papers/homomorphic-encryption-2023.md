---
title: Practical Homomorphic Encryption: State of the Art
来源: https://arXiv.org/abs/2401.00010
日期: 2026-06-13
分类: 安全与隐私
子分类: 安全与隐私
provenance: pipeline-v3
---

# Practical Homomorphic Encryption: State of the Art — 零基础学习笔记

## 一、从"保险箱"开始：什么是同态加密？

想象你在银行有一个保险箱，你把文件放进去锁好。银行可以帮你做一件事：**在不打开保险箱、看不到文件内容的情况下，对文件做一些处理**——比如把文件复印一份、把两份文件合并。最后你打开保险箱，看到的是处理过的结果，而银行从头到尾没见过你的文件内容。

这就是同态加密（Homomorphic Encryption, HE）的核心思想：**对密文直接计算，结果解密后等同于对明文做同样的计算**。

用数学符号说：如果 E(x) 是 x 的加密，D(y) 是 y 的解密，那么

```
D( 对 E(x) 做计算 ) = 对 x 做同样的计算
```

银行（云服务器）像是一个"瞎子厨师"——你能让它照着食谱做菜，但它看不见食材本身。

## 二、为什么要关心这个？

传统云计算模型下，你的数据一旦传到云端，云服务商理论上就能看到。这在医疗、金融等领域是巨大的风险。同态加密让数据在**始终加密的状态下被计算**，从根源上解决了"数据使用"和"数据隐私"之间的矛盾。

实际场景举例：

- **隐私医疗**：医院把患者的加密病历交给 AI 平台做疾病预测，AI 在密文上运算，结果解密后就是预测结果，医院不知道数据，AI 平台也不知道数据。
- **金融风控**：两家银行各自用自己的客户数据做联合建模，数据不离开各自本地，只在密文上计算。
- **投票系统**：选票加密后在云端计票，结果解密后知道胜者，但没人知道任何一张具体的选票。

## 三、同态加密的三种"能力等级"

同态加密不是"全有或全无"，它有三种级别，按能力递增：

### 3.1 部分同态（Partial HE）

只支持一种运算——要么只能做加法，要么只能做乘法。

**经典例子：Paillier 加密**。它只支持密文加法。

```python
# Paillier 加法同态示例（概念演示，非实际密码学安全的实现）

# 加密密钥公之于众，每个人都有
public_key = 289043  # 简化示例中的模数 n = p * q

# 加密函数（简化展示概念）
def encrypt(plaintext, public_key, random_r):
    # 在真实 Paillier 中：c = g^m * r^n mod n^2
    c = pow(2, plaintext) * pow(random_r, public_key) % (public_key * public_key)
    return c

# 解密函数（私钥持有者才知道）
def encrypt(plaintext, public_key, random_r):
    g = 289044  # g = n + 1 是 Paillier 的特殊构造
    c = pow(g, plaintext) * pow(random_r, public_key) % (public_key ** 2)
    return c

def decrypt(ciphertext, private_key, public_key):
    # 在真实实现中用 L 函数和模运算
    L = (pow(ciphertext, private_key, public_key**2) - 1) // public_key
    return (L * private_key) % public_key

# 加密两个数字
m1 = 100
m2 = 200
r1, r2 = 12345, 67890

c1 = encrypt(m1, public_key, r1)  # 加密 100
c2 = encrypt(m2, public_key, r2)  # 加密 200

# 在密文上直接做乘法——等同于明文做加法！
c_sum = (c1 * c2) % (public_key ** 2)

# 解密结果
result = decrypt(c_sum, private_key, public_key)
# result = 300, 等于 100 + 200
```

Paillier 只支持加法，所以叫"部分同态"。它已经很有用了——比如可以安全地统计投票总数，或者做加密的平均值计算。

### 3.2 半同态（Semi-Heomorphic / Leveled HE）

支持加法和多次乘法（但乘法次数有限制），也就是能做有限深度的电路计算。

**代表方案：BFV、BGV、CKKS**。这是目前最接近"实用"的级别。

### 3.3 全同态（Fully Homomorphic Encryption, FHE）

支持加法和乘法无限次嵌套——理论上可以做任何计算。

**里程碑：Gentry 2009**。Craig Gentry 首次构造出了全同态加密方案，震惊了整个密码学界。他的核心灵感来自一个类比：

> 就像用"中间密钥"来重置加密噪声，使得计算可以继续进行一样。

## 四、核心概念详解

### 4.1 噪声：同态加密的"敌人"

每次你在密文上做运算，密文里就会多一点点"噪声"（noise）。你可以把噪声想象成写在透明胶片上的字迹——看得越用力（运算越多），字迹越模糊。

- 加法：噪声增长很慢
- 乘法：噪声增长很快

当噪声超过某个阈值，解密就会失败。这就是为什么半同态只能做有限次乘法——**噪声决定了计算的"深度"上限**。

### 4.2 Bootstrapping：噪声的"橡皮擦"

Gentry 的突破性发现是：**你可以用密文本身来执行解密操作**。也就是说，你不需要私钥就能"清理"噪声——这就是 bootstrapping（自举）。

类比：你有一张写满字的透明胶片，字迹模糊了。你拿相机拍下来（加密），然后用你的私钥（解密方法）洗出一张新的、字迹清晰的胶片（解密再重新加密）。关键创新：Gentry 发现你不需要拿出私钥，可以在不解密的情况下让胶片自己变清晰——这就像让胶片自己把自己重新拍干净。

Bootstrapping 的计算量极大，是目前 FHE 最耗时的操作之一。

### 4.3 密文槽（Slots / Packed Encryption）

现代 HE 方案不是"一个一个数字加密"，而是一个密文可以打包**多个明文槽位**。这就像是把多个小纸条塞进同一个信封——加密一次，同时保护多个数据。

这带来了巨大的**并行加速比**——对 N 个数据做同样的运算，打包加密下只需要一次运算，而不是 N 次。

### 4.4 CKKS：支持近似的"革命性方案"

CKKS（Cheon-Kim-Kim-Song, 2017）是近年来最重要的进展之一。它的特点是：

- 支持**近似算术**（浮点数运算），而非精确整数
- 对科学计算、机器学习极其友好——这些场景本来就需要浮点数和容忍误差

类比：如果你做天气预报模拟，算出来的温度是 23.738291°，但实际天气预报说"24°左右"就够了。CKKS 天然支持这种"够精确就行"的场景。

## 五、HE 的"四大金刚"方案

| 缩写 | 全称 | 核心思想 | 适用场景 |
|------|------|---------|---------|
| **BFV** | Brakerski/Fan-Vercauteren | LWE 格问题 | 精确整数运算 |
| **BGV** | Brakerski-Gentry-Vaikuntanathan | LWE 格问题 | 精确整数运算 |
| **CKKS** | Cheon-Kim-Kim-Song | RLWE 格问题 | 近似浮点运算 |
| **TFHE** | Torus FHE | RLWE 格问题 | 布尔电路 / 密文比较 |

**选型指南（类比版）**：

- 要做精确的数据库查询（"密码等于多少"）→ BFV / BGV
- 要做 AI 推理（"置信度 0.73"）→ CKKS
- 要做密文比较（"哪个更大"）→ TFHE

## 六、代码示例：用 Concrete-ML 做加密推理

Concrete-ML 是基于 TFHE 的 Python 库，是门槛最低的 HE 编程方式之一。

### 6.1 安装

```bash
pip install concrete-numpy
```

### 6.2 在密文上做线性回归

```python
# 一个最简单的"加密线性回归"示例

from concrete import fhe

# 定义函数：y = 2*x + 3
@fhe.compiler({"x": "encrypted"})
def encrypted_linear(x):
    # 这个函数在编译时记录操作，运行时在密文上执行
    return 2 * x + 3

# 编译模型（只需要做一次）
circuit = encrypted_linear.compile(42)

# 运行：输入明文，输出密文结果
input_plaintext = 10  # 真实世界中的输入是 x=10
encrypted_input = circuit.encrypt(input_plaintext)
encrypted_output = circuit.run(encrypted_input)
decrypted_output = circuit.decrypt(encrypted_output)

print(f"明文计算: 2*10 + 3 = {2*10 + 3}")      # 23
print(f"密文计算: {decrypted_output}")            # 也是 23！
```

### 6.3 加密的 logistic 回归分类器

```python
import numpy as np
from concrete import fhe
from concrete.fhe import configuration

# 设置编译配置
config = configuration.Configuration()
config.vacuous_execution = True

# 模拟一个二分类问题：y = sigmoid(w*x + b)
# w = 1.5, b = -2（简化模型）

def sigmoid(x):
    """用分段线性近似 sigmoid 函数"""
    if x < -5:
        return 0.0
    elif x > 5:
        return 1.0
    else:
        # 中间段用线性近似
        return 1.0 / (1.0 + np.exp(-x))

# 编译加密的 sigmoid
@fhe.compiler({"x": "encrypted"})
def encrypted_sigmoid(x):
    # 实际实现中用查表或分段多项式
    return x if x > 2.0 else x * 0.1 + 0.5

# 编译加密的分类器
@fhe.compiler({"x": "encrypted"})
def encrypted_classifier(x):
    w, b = 1.5, -2.0
    logits = w * x + b
    return encrypted_sigmoid(logits)

# 编译并运行
circuit = encrypted_classifier.compile(42)

test_input = 2.0  # 假设用户特征是 2.0
encrypted_x = circuit.encrypt(test_input)
encrypted_pred = circuit.run(encrypted_x)
result = circuit.decrypt(encrypted_pred)

print(f"密文预测结果: {result:.4f}")
# 对比：明文计算
print(f"明文预测结果: {sigmoid(1.5 * 2.0 - 2.0):.4f}")
```

## 七、现状与挑战

### 7.1 已经取得的进展

- **库的成熟**：Microsoft SEAL、PALISADE、TFHE-rs（Rust）、Concrete-ML 等开源库已可用
- **AI 推理加速**：已有在密文上运行逻辑回归、小型神经网络的实际案例
- **硬件加速**：FPGA 和 GPU 上的 HE 加速研究活跃

### 7.2 仍然面临的主要挑战

| 挑战 | 说明 | 类比 |
|------|------|------|
| **性能开销** | 密文计算比明文慢 1000~10000 倍 | 就像骑自行车和坐高铁的区别 |
| **密文膨胀** | 密文大小是明文的几十到几百倍 | 装一辆自行车塞进背包 |
| **深度限制** | 大多数方案只能支持有限层数的神经网络 | 楼梯的台阶数有限 |
| **生态不成熟** | 开发者需要了解很多底层概念 | 相当于每个开发者都要成为密码学专家 |

### 7.3 未来方向

- **专用芯片**：专门为 HE 设计的 ASIC/FPGA，有望将性能提升 100 倍以上
- **混合方案**：HE + 安全多方计算（MPC）+ 可信执行环境（TEE）的组合
- **ML 原生 HE**：为神经网络定制的新型 HE 方案，如 Tensor-HE

## 八、一句话总结

> 同态加密让"数据可用不可见"成为可能，是隐私计算领域的"圣杯"之一。虽然性能瓶颈仍然显著，但随着算法改进和硬件加速，它正在从实验室走向现实应用。

## 九、延伸阅读

- **Gentry 2009**: "A Fully Homomorphic Encryption Scheme"（开创性论文）
- **Cheon et al. 2017**: "Homomorphic Encryption for Arithmetic of Approximate Numbers"（CKKS 方案）
- **Microsoft SEAL**: https://github.com/microsoft/SEAL（最主流的 C++ HE 库）
- **TFHE-rs**: https://github.com/tfhe-rs/tfhe-rs（Rust 实现，性能优秀）
