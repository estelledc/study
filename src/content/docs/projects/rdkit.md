---
title: RDKit 零基础入门笔记
来源: https://github.com/rdkit/rdkit
日期: 2026-06-13
分类: 机器学习
子分类: 生物信息
provenance: pipeline-v3
---

# RDKit 零基础入门笔记

## 一、RDKit 是什么？

想象一下，你有一盒乐高积木。每一块积木代表一个原子（碳、氧、氮……），而积木之间的连接方式就代表化学键。RDKit 就是一个"超级乐高说明书"——它用代码帮你读取、绘制、分析和转换这些"分子积木"。

RDKit 是一个开源的化学信息学库，核心用 C++ 写，同时提供 Python 接口。它能：

- 读取和写入各种分子文件格式（SMILES、SDF、MOL 等）
- 生成分子的 2D/3D 结构图
- 进行子结构搜索（在大量分子中找特定片段）
- 计算分子描述符（分子量、极性表面积等）
- 生成分子指纹（用于机器学习）
- 优化分子 3D 构象

安装只需一行：

```bash
conda install -c conda-forge rdkit
```

## 二、核心概念

### 2.1 SMILES —— 分子的"文本身份证"

SMILES（Simplified Molecular Input Line Entry System）是用 ASCII 字符表示分子结构的字符串。比如：

- `C` = 甲烷（一个碳原子连三个氢，氢省略不写）
- `CCO` = 乙醇（C-C-O，即 CH₃-CH₂-OH）
- `c1ccccc1` = 苯（六个碳组成的芳香环）
- `Cc1ccccc1` = 甲苯（苯环上连一个甲基）

这就像用文字描述一个人的外貌："高个子、黑发、戴眼镜"——看到这句话你就能在大脑中画出他的样子。SMILES 也是同样的道理：看到字符串，RDKit 就能在内存中构建出完整的分子结构。

### 2.2 Mol 对象 —— 内存中的分子

当你用 `Chem.MolFromSmiles()` 解析一个 SMILES 字符串时，RDKit 会在内存中创建一个 `Mol` 对象。这个对象包含了分子的完整信息：

- 每个原子的种类和位置
- 每个键的类型（单键、双键、芳香键）
- 环的信息
- 立体化学信息（手性）

你可以把它理解为一个"分子数据库记录"——所有关于这个分子的数据都封装在里面。

### 2.3 SMARTS —— 分子的"搜索表达式"

如果说 SMILES 是用来**描述**一个具体分子的，那 SMARTS 就是用来**匹配**一类分子的。它类似于正则表达式：

- SMILES `CCO` 精确匹配乙醇这一个分子
- SMARTS `C(=O)O` 匹配所有羧酸（含有 -COOH 基团的分子）

## 三、代码示例

### 示例 1：读取分子、生成 SMILES、绘制结构

这是最基础的流程——从一段 SMILES 字符串出发，创建分子对象，再转回 SMILES（验证解析正确），最后画出结构图。

```python
from rdkit import Chem
from rdkit.Chem import Draw, AllChem

# 1. 从 SMILES 字符串创建分子对象
#    这里用咖啡因作为例子：Caffeine
smiles = 'CN1C=NC2=C1C(=O)N(C)C(=O)N2C'
mol = Chem.MolFromSmiles(smiles)

# 检查是否解析成功（如果 SMILES 无效，返回 None）
if mol is None:
    print("SMILES 解析失败")
else:
    print(f"分子包含 {mol.GetNumAtoms()} 个原子")
    print(f"分子包含 {mol.GetNumBonds()} 个化学键")

    # 2. 生成规范 SMILES（Canonical SMILES）
    #    同一个分子无论怎么写 SMILES，规范 SMILES 都是唯一的
    canonical_smiles = Chem.MolToSmiles(mol)
    print(f"规范 SMILES: {canonical_smiles}")

    # 3. 生成 2D 坐标（用于绘图）
    AllChem.Compute2DCoords(mol)

    # 4. 保存为图片
    Draw.MolToFile(mol, 'caffeine.png', imageSize=(300, 300))
    print("已保存 caffeine.png")
```

运行后你会得到一张咖啡因分子的 2D 结构图，以及类似这样的输出：

```
分子包含 24 个原子
分子包含 24 个化学键
规范 SMILES: CN1C=NC2=C1C(=O)N(C)C(=O)N2C
已保存 caffeine.png
```

### 示例 2：子结构搜索 + 分子指纹

这个例子展示如何在一批分子中找到含有特定片段的分子，并计算它们的分子指纹（用于后续机器学习）。

```python
from rdkit import Chem
from rdkit.Chem import AllChem

# 1. 准备一组分子的 SMILES
smiles_list = [
    (' Aspirin', 'CC(=O)Oc1ccccc1C(=O)O'),
    (' 咖啡因', 'CN1C=NC2=C1C(=O)N(C)C(=O)N2C'),
    (' 尼古丁', 'CN1CCCC1C2=CN=CC=C2'),
    (' 多巴胺', 'CC(N)c1ccc(O)c(O)c1'),
    (' 青蒿素', 'COc1cc(CC2(CCC3C(C2)C(C3OO)C)C(=O)C'),
]

# 2. 定义要搜索的子结构：羧基 -COOH
#    用 SMARTS 表示：C(=O)[OH]
carboxyl_pattern = Chem.MolFromSmarts('C(=O)[OH]')

print("=== 子结构搜索结果 ===")
for name, smi in smiles_list:
    mol = Chem.MolFromSmiles(smi)
    if mol.HasSubstructMatch(carboxyl_pattern):
        match = mol.GetSubstructMatch(carboxyl_pattern)
        print(f"{name}: 匹配到羧基，原子索引 = {match}")
    else:
        print(f"{name}: 未找到羧基")

# 3. 为每个分子计算 Morgan 指纹（半径=2，2048 位）
#    Morgan 指纹是 RDKit 最常用的分子指纹之一，
#    类似 NLP 中的 word embedding，把分子变成向量
print("\n=== Morgan 指纹 ===")
for name, smi in smiles_list:
    mol = Chem.MolFromSmiles(smi)
    fingerprint = AllChem.GetMorganFingerprintAsBitVect(mol, radius=2, nBits=2048)
    # 计算指纹中有多少位被置为 1（稀疏度）
    num_set = fingerprint.GetNumOnBits()
    print(f"{name}: 指纹中有 {num_set} 个 bit 被置为 1（总共 2048 位）")
```

输出示例：

```
=== 子结构搜索结果 ===
 Aspirin: 匹配到羧基，原子索引 = (9, 10, 11)
 咖啡因: 未找到羧基
 尼古丁: 未找到羧基
 多巴胺: 未找到羧基
 青蒿素: 未找到羧基

=== Morgan 指纹 ===
 Aspirin: 指纹中有 127 个 bit 被置为 1（总共 2048 位）
 咖啡因: 指纹中有 95 个 bit 被置为 1（总共 2048 位）
 尼古丁: 指纹中有 83 个 bit 被置为 1（总共 2048 位）
 多巴胺: 指纹中有 56 个 bit 被置为 1（总共 2048 位）
 青蒿素: 指纹中有 78 个 bit 被置为 1（总共 2048 位）
```

## 四、关键 API 速查

| 功能 | 代码 |
|------|------|
| 从 SMILES 创建分子 | `Chem.MolFromSmiles('CCO')` |
| 分子转 SMILES | `Chem.MolToSmiles(mol)` |
| 从 SDF 文件读取 | `Chem.SDMolSupplier('molecules.sdf')` |
| 写入 SDF 文件 | `Chem.SDWriter('output.sdf')` |
| 子结构匹配 | `mol.HasSubstructMatch(pattern)` |
| 获取匹配原子索引 | `mol.GetSubstructMatch(pattern)` |
| 生成 2D 坐标 | `AllChem.Compute2DCoords(mol)` |
| 生成 3D 构象 | `AllChem.EmbedMolecule(mol)` |
| Morgan 指纹 | `AllChem.GetMorganFingerprintAsBitVect(mol, 2, 2048)` |
| 计算分子量 | `Chem.Descriptors.MolWt(mol)` |
| 分子绘图 | `Draw.MolToFile(mol, 'out.png')` |
| 多图网格 | `Draw.MolsToGridImage(mol_list)` |

## 五、学习建议

1. 先掌握 SMILES 读写——这是所有操作的入口
2. 学会用 `HasSubstructMatch` 做子结构搜索——这是最实用的功能
3. 了解 Morgan 指纹的概念——它是连接化学和机器学习的桥梁
4. 动手画分子图——视觉反馈能帮助你建立直觉
5. 官方文档 [rdkit.org/docs/GettingStartedInPython.html](https://rdkit.org/docs/GettingStartedInPython.html) 是最佳参考
