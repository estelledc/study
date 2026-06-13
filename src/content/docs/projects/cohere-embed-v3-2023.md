---
title: Cohere Embed v3 学习笔记
来源: https://cohere.com/blog/introducing-embed-v3
日期: 2026-06-13
分类: 信息检索
子分类: 检索与排序
provenance: pipeline-v3
---

# Cohere Embed v3 学习笔记

## 一、什么是 Embedding？（日常类比）

想象你去图书馆找书。传统方法是用书名或作者名来精确匹配——这就像关键词搜索，找不到完全一样的名字就一无所获。

Embedding 的做法完全不同：它把每本书的内容"压缩"成一个数字列表（比如 1024 个数字），内容相似的书，它们的数字列表也会很接近。这样你只需要比较数字之间的距离，就能找到"意思相近"的书，哪怕书名和作者完全不同。

这个"压缩"过程就是 Embedding 模型做的：输入一段文字，输出一串浮点数。

## 二、Cohere Embed v3 是什么

Cohere 是一家加拿大的 AI 公司，专注于"检索增强生成"（RAG）场景下的 AI 模型。Embed v3 是他们在 2023 年 11 月发布的第三代嵌入模型系列。

相比前代，v3 有三个重大改进：

1. **多语言支持**：`embed-multilingual-v3.0` 支持超过 100 种语言，包括中文、日文、阿拉伯文等。这意味着你可以用同一种模型处理全球各种语言的文本。
2. **压缩嵌入（Compressed Embeddings）**：这是 v3 最大的亮点。除了传统的浮点数格式（float），还支持 int8、uint8、binary、ubinary 和 base64 等多种压缩格式。
3. **多模态能力**：同时支持文本和图片的嵌入。

## 三、核心概念详解

### 3.1 嵌入向量（Embedding Vector）

Embedding 的本质是一个高维向量。以 `embed-multilingual-v3.0` 为例，它输出的向量长度是 1024——也就是说，一段文字会被转换成 1024 个浮点数组成的列表。

```
"你好世界" → [0.123, -0.456, 0.789, ..., 0.012]  （共 1024 个数字）
```

两个向量越"接近"（用余弦相似度衡量），说明两段文字的意思越相似。

### 3.2 压缩嵌入（Compressed Embeddings）

这是 Embed v3 最具革命性的特性。传统 embedding 用 32 位浮点数（float32），每个数字占 4 字节。1024 维的向量就需要 4096 字节（约 4KB）。

压缩嵌入通过量化（quantization）大幅减少存储空间：

| 格式 | 每个元素位数 | 1024 维占用 | 压缩比 |
|------|------------|-----------|--------|
| float (float32) | 32 bit | 4096 字节 | 1x |
| int8 / uint8 | 8 bit | 1024 字节 | 4x |
| binary / ubinary | 1 bit | 128 字节 | 32x |

**为什么压缩后还能用？**

打个比方：你要描述一个人的身高体重。float 格式就像是精确到小数点后三位（175.234cm, 70.567kg），而 int8 就像是四舍五入到整数（175cm, 71kg）。精度确实降低了，但对于"找相似"这种任务来说，损失很小，存储成本却大幅下降。

binary 格式更进一步：把每个数字变成 0 或 1，然后用位运算来加速计算。1024 维的二进制向量只需要 128 字节，而且可以用 CPU 的位运算指令瞬间完成相似度计算。

### 3.3 input_type（输入类型）

v3 要求你指定 `input_type`，告诉模型这段文字将来怎么用途：

- `search_document`：存进向量数据库的文档
- `search_query`：用户的搜索查询
- `classification`：用于文本分类
- `clustering`：用于聚类分析

指定正确的类型能让模型生成更合适的向量，因为不同用途对向量的侧重点不同。

## 四、代码示例

### 示例一：基础多语言嵌入

```python
import cohere

co = cohere.Client("YOUR_API_KEY")

response = co.embed(
    texts=["Hello world", "你好世界", "Bonjour le monde"],
    model="embed-multilingual-v3.0",
    input_type="search_document"
)

embeddings = response.embeddings
print(f"生成了 {len(embeddings)} 个向量")
print(f"每个向量长度: {len(embeddings[0])}")
# 输出: 生成了 3 个向量
# 输出: 每个向量长度: 1024
```

这里的关键点：

- 一个请求可以同时处理多种语言的文本
- `embed-multilingual-v3.0` 输出 1024 维向量
- `input_type="search_document"` 表示这些向量将用于搜索

### 示例二：使用压缩嵌入节省存储

```python
import cohere

co = cohere.Client("YOUR_API_KEY")

# 同时获取 float 和 binary 两种格式的嵌入
response = co.embed(
    texts=[
        "The quick brown fox jumps over the lazy dog",
        "人工智能正在改变世界的面貌"
    ],
    model="embed-multilingual-v3.0",
    input_type="search_document",
    embedding_types=["float", "binary"]
)

# float 格式：4096 字节每向量，精度高
float_embeddings = response.embeddings.float
print(f"Float 向量维度: {len(float_embeddings[0])}")

# binary 格式：128 字节每向量，压缩 32 倍！
binary_embeddings = response.embeddings.binary
print(f"Binary 向量维度: {len(binary_embeddings[0])}")
print(f"存储节省: {4096 // 128}x")
```

对比：

- float 格式：每条记录 4096 字节，适合对精度要求高的场景
- binary 格式：每条记录 128 字节，存储节省 32 倍，适合大规模向量数据库

## 五、模型家族一览

| 模型名称 | 语言 | 维度 | 最大 Token | 特点 |
|---------|------|------|----------|------|
| embed-english-v3.0 | 仅英文 | 1024 | 512 | 英文场景最优 |
| embed-english-light-v3.0 | 仅英文 | 384 | 512 | 更快更轻量 |
| embed-multilingual-v3.0 | 100+ 语言 | 1024 | 512 | 多语言通用 |
| embed-multilingual-light-v3.0 | 100+ 语言 | 384 | 512 | 多语言轻量版 |

`light` 版本维度更低（384 维）、速度更快，但精度略低。适合对延迟敏感或资源受限的场景。

## 六、实际应用场景

### 场景一：多语言搜索引擎

假设你在做一个面向全球的客服系统，用户可以用任何语言提问。用 `embed-multilingual-v3.0` 把知识库中的所有回答编码成向量存起来，用户提问时也编码成向量，然后找最接近的向量即可。无论用户用中文、英文还是阿拉伯文提问，都能找到正确答案。

### 场景二：海量文档去重

你有 100 万篇新闻文章，想找出内容重复的。把每篇文章编码成 binary 嵌入（每条只要 128 字节），总存储只需约 120MB，然后用位运算快速计算相似度，找出重复文章。如果用 float 格式则需要约 4GB。

## 七、关键要点总结

1. Embedding 把文字变成数字向量，相似的文字向量距离近
2. Embed v3 的核心突破是多语言（100+ 语言）和压缩嵌入（最高 32 倍压缩）
3. 压缩嵌入（binary/int8）牺牲少量精度换取大量存储节省，性价比极高
4. 使用 `input_type` 告诉模型你的用途，能获得更好的向量质量
5. `light` 版本适合对速度和资源敏感的场景

## 八、延伸阅读

- Cohere 官方文档：https://docs.cohere.com/docs/cohere-embed
- Embed API 参考：https://docs.cohere.com/reference/embed
- 支持的 100+ 语言列表见官方文档中的表格（包含中文 zh、日语 ja、韩语 ko 等）
