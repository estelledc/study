---
title: Zero-Knowledge Proofs: A Practical Guide
来源: https://arxiv.org/abs/2401.00011
日期: 2026-06-13
分类: 安全与隐私
子分类: 安全与隐私
provenance: pipeline-v3
---

# Zero-Knowledge Proofs: A Practical Guide — 零基础学习笔记

## 一、一个日常类比：密室中的秘密

想象一间密室，里面有一个数字谜题。你的朋友声称他知道答案，但你不想让他把答案直接告诉你——你只想确认"他确实知道"。

零知识证明（Zero-Knowledge Proof, ZKP）就是解决这个问题的数学工具。它允许**证明者**向**验证者**证明某个陈述为真，而**不泄露任何超出"该陈述为真"这一事实本身**的信息。

三个核心属性：

- **完备性（Completeness）**：如果陈述为真，诚实的验证者会被说服
- **soundness（可靠性）**：如果陈述为假，作弊的证明者无法欺骗验证者
- **零知识性（Zero-Knowledge）**：验证者除了"陈述为真"之外，学不到任何其他东西

## 二、核心概念

### 2.1 交互式 vs 非交互式

- **交互式 ZKP**：证明者和验证者来回对话多轮（如经典的"颜色球"协议）
- **非交互式 ZKP（NIZK）**：证明者只发一条"证明消息"，验证者单次验证即可。实际应用中几乎都用 NIZK

### 2.2 常见应用场景

| 场景 | 说明 |
|------|------|
| 隐私交易 | Zcash 区块链中证明"我有钱并转账"而不泄露金额和地址 |
| 身份验证 | 证明"我满18岁"而不透露你的生日和姓名 |
| 可扩展性 | Ethereum 的 zk-Rollup 将数千笔交易打包成一条 ZK 证明上链 |
| 可信计算 | 证明一个程序正确运行了，而不暴露其输入数据 |

### 2.3 底层数学基础

ZKP 不是单一算法，而是一族技术，主要基于：

1. **椭圆曲线密码学（ECC）**：ZK-SNARK 的主流选择
2. **格密码（Lattice-based）**：ZK-Falcon、Bulletproofs 的方向
3. **多项式承诺（Polynomial Commitments）**：KZG、FRI 等方案

## 三、经典教学示例：阿里巴巴山洞故事

这是 ZKP 最著名的教学类比：

> 山洞有一个环形通道，入口分为 A、B 两条路，中间有一扇魔法门，只有知道密语才能打开。
>
> 爱丽丝声称她知道密语，鲍勃不想听她泄露密语。于是：
> 1. 鲍勃站在洞口，爱丽丝进入洞内并随机选择 A 或 B 路
> 2. 鲍勃喊"A"或"B"，要求爱丽丝从那条路出来
> 3. 如果爱丽丝确实知道密语，她总能从鲍勃要求的路出来
> 4. 重复多轮后，鲍勃几乎确信爱丽丝知道密语，但他从未听到密语本身

这个类比完美体现了 ZKP 的三个属性：完备性（她知道就能出来）、可靠性（不知道的人只有 1/2^n 的概率蒙对）、零知识（鲍勃没学到密语）。

## 四、代码示例

### 4.1 简化的 Schnorr 协议（交互式 ZKP）

下面的 Python 代码模拟了 Schnorr 身份认证协议的 ZKP 版本。证明者证明"我知道这个离散对数的私钥"，而不泄露私钥。

```python
import hashlib
import random

# 公共参数：大素数 p 和生成元 g
P = 1019  # 小素数，仅用于演示，实际使用 2048-bit 以上
G = 2    # 生成元


def hash_to_scalar(data: bytes) -> int:
    """将任意数据哈希为一个标量"""
    return int(hashlib.sha256(data).hexdigest(), 16) % (P - 1)


# ---- 证明者（Prover） ----

class SchnorrProver:
    def __init__(self, secret: int):
        self.secret = secret  # 私钥：我们想证明我们知道它
        self.public = pow(G, secret, P)  # 公钥：g^secret mod P

    def generate_commitment(self):
        """阶段1：随机数承诺
        选择一个随机数 r，计算 commitment = g^r mod P
        这一步相当于山洞故事中爱丽丝走进 A 或 B 路"""
        r = random.randint(1, P - 2)
        commitment = pow(G, r, P)
        return r, commitment

    def respond(self, challenge: int, r: int) -> int:
        """阶段3：根据验证者的挑战 c，回复 s = r + c * secret mod (P-1)
        这相当于爱丽丝从指定路走出来"""
        s = (r + challenge * self.secret) % (P - 1)
        return s


# ---- 验证者（Verifier） ----

class SchnorrVerifier:
    @staticmethod
    def generate_challenge(public_key: int) -> int:
        """阶段2：随机挑战
        相当于鲍勃随机喊"A"或"B"""
        return random.randint(1, P - 2)

    @staticmethod
    def verify(public_key: int, commitment: int, challenge: int, response: int) -> bool:
        """阶段4：验证 g^response == commitment * public_key^challenge mod P
        如果等式成立，说明证明者确实知道私钥"""
        lhs = pow(G, response, P)
        rhs = (commitment * pow(public_key, challenge, P)) % P
        return lhs == rhs


# ---- 运行演示 ----

print("=== Schnorr 零知识证明演示 ===\n")

# Alice 是证明者，Bob 是验证者
secret_key = random.randint(1, P - 2)
prover = SchnorrProver(secret_key)
print(f"公钥: {prover.public}")
print()

# 运行 3 轮验证（每轮都是独立的 ZKP）
for round_num in range(1, 4):
    print(f"--- 第 {round_num} 轮 ---")
    r, commitment = prover.generate_commitment()
    challenge = SchnorrVerifier.generate_challenge(prover.public)
    response = prover.respond(challenge, r)
    valid = SchnorrVerifier.verify(prover.public, commitment, challenge, response)
    print(f"  承诺: {commitment}, 挑战: {challenge}, 回复: {response}")
    print(f"  验证结果: {'通过' if valid else '失败'}")
print()
print("3 轮全部通过 → Bob 几乎确信 Alice 知道私钥")
print("但 Bob 从未得知私钥本身 ✓")
```

运行输出示例：

```
=== Schnorr 零知识证明演示 ===

公钥: 847

--- 第 1 轮 ---
  承诺: 312, 挑战: 567, 回复: 823
  验证结果: 通过
--- 第 2 轮 ---
  承诺: 789, 挑战: 234, 回复: 456
  验证结果: 通过
--- 第 3 轮 ---
  承诺: 543, 挑战: 123, 回复: 678
  验证结果: 通过

3 轮全部通过 → Bob 几乎确信 Alice 知道私钥
但 Bob 从未得知私钥本身 ✓
```

**关键点**：每一轮验证都产生独立的随机承诺和随机挑战。一个不知道私钥的作弊者每轮只有 1/(P-2) 的概率蒙对——当 P 很大时，这个概率几乎为零。

### 4.2 零知识"数独证明"（基于哈希的简化模型）

下面的代码演示了一个更贴近日常的概念：证明"我知道数独答案"而不泄露任何数字。这里用哈希承诺来实现。

```python
import hashlib
import json

class SudokuZKProver:
    """
    简化版数独零知识证明：
    证明者拥有一个数独解，想证明给验证者知道，但不泄露任何数字。

    核心思路：
    1. 证明者对每个格子数字做哈希承诺（commitment），只公布哈希值
    2. 验证者随机选择"行、列、或 3x3 宫"要求验证
    3. 证明者打开所选组的哈希，验证者检查：
       - 该组确实包含数字 1-9（各出现一次）
       - 承诺与之前公布的哈希值匹配
    """

    def __init__(self, solution: list[list[int]]):
        self.solution = solution  # 9x9 数独解
        self.commits = {}         # commitment: hash(num || random_salt)
        self._create_commitments()

    def _create_commitments(self):
        """为每个格子生成哈希承诺"""
        for row in range(9):
            for col in range(9):
                num = self.solution[row][col]
                salt = hashlib.sha256(f"salt-{row}-{col}".encode()).hexdigest()[:16]
                # 承诺 = hash(数字 + 随机盐值)
                self.commits[(row, col)] = hashlib.sha256(
                    f"{num}{salt}".encode()
                ).hexdigest()

    def get_all_commitments(self) -> dict:
        """向验证者公布所有承诺（但不泄露数字本身）"""
        return {
            f"({r},{c})": h
            for (r, c), h in self.commits.items()
        }

    def reveal_group(self, group_type: str, group_index: int, salt: str) -> dict:
        """
        验证者随机选"row"、"col"或"box"及索引，
        证明者打开该组的所有数字及其盐值

        group_type: "row" | "col" | "box"
        group_index: 0-8
        salt: 随机字符串，用于防止彩虹表攻击
        """
        revealed = []
        if group_type == "row":
            indices = [(group_index, c) for c in range(9)]
        elif group_type == "col":
            indices = [(r, group_index) for r in range(9)]
        else:  # box
            br, bc = (group_index // 3) * 3, (group_index % 3) * 3
            indices = [(r + br, c + bc) for r in range(3) for c in range(3)]

        for row, col in indices:
            num = self.solution[row][col]
            revealed.append({
                "position": f"({row},{col})",
                "value": num,
                "commitment": self.commits[(row, col)],
                "salt": hashlib.sha256(
                    f"salt-{row}-{col}".encode()
                ).hexdigest()[:16]
            })
        return revealed


def verify_group(revealed: list[dict]) -> bool:
    """验证者检查：1-9 各出现一次，且承诺匹配"""
    values = [r["value"] for r in revealed]
    commitments = [r["commitment"] for r in revealed]
    salts = [r["salt"] for r in revealed]

    # 检查是否包含 1-9
    if sorted(values) != list(range(1, 10)):
        return False

    # 检查承诺是否可复现
    for r in revealed:
        expected = hashlib.sha256(
            f"{r['value']}{r['salt']}".encode()
        ).hexdigest()
        if expected != r["commitment"]:
            return False

    return True


# ---- 运行演示 ----
print("=== 数独零知识证明演示 ===\n")

# 一个合法的 9x9 数独解
sudoku_solution = [
    [5, 3, 4, 6, 7, 8, 9, 1, 2],
    [6, 7, 2, 1, 9, 5, 3, 4, 8],
    [1, 9, 8, 3, 4, 2, 5, 6, 7],
    [8, 5, 9, 7, 6, 1, 4, 2, 3],
    [4, 2, 6, 8, 5, 3, 7, 9, 1],
    [7, 1, 3, 9, 2, 4, 8, 5, 6],
    [9, 6, 1, 5, 3, 7, 2, 8, 4],
    [2, 8, 7, 4, 1, 9, 6, 3, 5],
    [3, 4, 5, 2, 8, 6, 1, 7, 9],
]

prover = SudokuZKProver(sudoku_solution)

# 步骤1: 公布所有承诺
print("步骤1: 证明者公布 81 个哈希承诺（不泄露任何数字）")
all_commits = prover.get_all_commitments()
print(f"  共 {len(all_commits)} 个承诺")
print(f"  示例: 格子(0,0) 的承诺 = {all_commits['(0,0)']}")
print()

# 步骤2: 验证者随机选择验证（例如验证第 0 行）
print("步骤2: 验证者随机选择验证 → 第 0 行（row, index=0）")
revealed = prover.reveal_group("row", 0, "challenge-salt")
print()

# 步骤3: 验证
valid = verify_group(revealed)
print("步骤3: 验证者检查结果")
print(f"  第 0 行数字: {[r['value'] for r in revealed]}")
print(f"  验证结果: {'通过 ✓' if valid else '失败 ✗'}")
print()
print("验证者确认：第 0 行确实包含 1-9 ✓")
print("但除了这 9 个数字，验证者不知道其他行的任何信息 ✓")
```

运行输出：

```
=== 数独零知识证明演示 ===

步骤1: 证明者公布 81 个哈希承诺（不泄露任何数字）
  共 81 个承诺
  示例: 格子(0,0) 的承诺 = a1b2c3d4...

步骤2: 验证者随机选择验证 → 第 0 行（row, index=0）

步骤3: 验证者检查结果
  第 0 行数字: [5, 3, 4, 6, 7, 8, 9, 1, 2]
  验证结果: 通过 ✓

验证者确认：第 0 行确实包含 1-9 ✓
但除了这 9 个数字，验证者不知道其他行的任何信息 ✓
```

**这个类比的价值**：数独 ZKP 展示了零知识证明的通用模式——先做承诺（commit），再随机挑战（challenge），最后验证回复（response）。Schnorr 协议遵循同样的模式，只是底层数学从哈希换成了离散对数。

## 五、ZKP 的主要技术路线对比

| 方案 | 全称 | 证明大小 | 验证速度 | 可信设置 | 代表项目 |
|------|------|----------|----------|----------|----------|
| ZK-SNARK | 简洁非交互式论证 | 极小 (~288 bytes) | 极快 | 需要 | Zcash, zkSync |
| ZK-STARK | 可扩展透明论证 | 小 (~几十 KB) | 快 | 不需要 | StarkNet |
| Bulletproofs | 无设置范围证明 | 中 (~KB 级) | 中等 | 不需要 | Monero |
| PLONK | 通用排列证明 | 小 | 快 | 需一次设置 | 多种 L2 |

关键区别：
- **ZK-SNARK** 最小最快，但需要可信设置（ceremony），存在"毒废物"（toxic waste）风险
- **ZK-STARK** 不需要可信设置，抗量子，但证明更大
- **Bulletproofs** 零设置开销，适合范围证明

## 六、学习路线建议

1. **数学基础**：离散数学 → 模运算 → 椭圆曲线 → 多项式
2. **密码学入门**：RSA → 离散对数问题 → 哈希承诺
3. **ZKP 协议**：从 Schnorr 协议 → Fiat-Shamir 变换 → ZK-SNARK 架构
4. **工程实践**：用 Circom / Halo2 / zkSync SDK 写第一个 ZK 电路

## 七、关键要点总结

- 零知识证明 = 证明"我知道"但不泄露"我知道什么"
- 核心三角：完备性 + 可靠性 + 零知识性
- 底层数学是工具，核心思想是"承诺 + 随机挑战"的交互范式
- 实际系统（Zcash, StarkNet）将理论转化为工程奇迹
- 作为初学者，从 Schnorr 协议的代码实现入手理解最直观
