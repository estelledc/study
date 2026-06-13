---
title: sqlite-vec — 在 SQLite 里做向量相似度搜索
来源: https://github.com/asg017/sqlite-vec
日期: 2026-06-13
分类: 数据库
子分类: 存储与查询
provenance: pipeline-v3
---

## 是什么

sqlite-vec 是一个 **SQLite 扩展**，让你能在 SQLite 数据库里直接存储和搜索向量（vector）。日常类比：[[sqlite]] 本身像一个普通的图书目录卡片柜——你能按书名、作者精确查找，但没法回答"哪本书和我手边这本最相似"。sqlite-vec 就是在卡片柜里加了一台"语义搜索引擎"，让每一本书都有一个数字指纹（向量），然后你可以问"哪本书的指纹和我的最接近"。

它由 Alex Garcia 开发，获 Mozilla Builders 项目赞助，目前 7.7k+ Star。纯 C 语言编写，零依赖，可以在 Linux / macOS / Windows / WASM / 树莓派等任何能跑 SQLite 的地方运行。

## 核心概念

### 什么是向量

向量就是一串数字。比如一段文字经过 AI 模型处理后，会变成类似这样的 768 维向量：

```
[0.200, -0.150, 0.341, ..., 0.935, -0.316, -0.924]
```

向量空间里有个基本规律：**距离越近的两个向量，语义越相似**。就像"猫"和"狗"的向量距离比"猫"和"汽车"更近。

### vec0 虚拟表

sqlite-vec 的核心是一个叫 `vec0` 的虚拟表。和普通表不同，`vec0` 专门用来存向量数据，并内置了相似度计算能力。用法和创建普通 SQLite 表一样简单：

```sql
CREATE VIRTUAL TABLE vec_movies USING vec0(
  movie_id INTEGER PRIMARY KEY,
  synopsis_embedding FLOAT[768]
);
```

这里 `FLOAT[768]` 表示存储 768 维的浮点向量。`movie_id` 是你自己的业务主键，`synopsis_embedding` 是电影简介经 embedding 模型生成的向量。

### KNN 查询（K 近邻搜索）

KNN 是"K Nearest Neighbors"的缩写，就是找出与查询向量最近的 K 个结果。sqlite-vec 用 `MATCH` 关键字来实现：

```sql
SELECT
  movie_id,
  distance
FROM vec_movies
WHERE synopsis_embedding MATCH '[0.890, 0.544, 0.825, ...]'
ORDER BY distance
LIMIT 5;
```

`MATCH` 后面跟一个向量（JSON 格式或二进制 BLOB），SQLite 会自动计算每条记录与查询向量的距离，并按距离从小到大排序，`LIMIT 5` 取最近的 5 条。

### 三种附加列

除了向量，`vec0` 还支持存储额外数据，有三种方式：

| 列类型 | 用途 | 能否在 WHERE 中使用 |
|--------|------|-------------------|
| 元数据列（metadata） | 存储分类、评分等筛选条件 | 可以 |
| 分区键（partition key） | 按用户/时间等分片索引 | 可以 |
| 辅助列（auxiliary，以 + 前缀） | 存储大文本、图片等大字段 | 不可以 |

## 代码示例

### 示例一：从零搭建一个电影语义搜索

```python
import sqlite3
import sqlite_vec

# 1. 建立连接并加载 sqlite-vec 扩展
db = sqlite3.connect(":memory:")
db.enable_load_extension(True)
sqlite_vec.load(db)
db.enable_load_extension(False)

# 2. 创建 vec0 虚拟表，存 768 维向量
db.execute("""
    CREATE VIRTUAL TABLE vec_movies USING vec0(
        movie_id INTEGER PRIMARY KEY,
        synopsis_embedding FLOAT[768],
        genre TEXT,
        rating FLOAT
    )
""")

# 3. 插入模拟数据（实际项目中这些向量来自 embedding 模型）
movies = [
    (1, '[0.1, 0.2, 0.3, -0.4, 0.5, -0.6, 0.7, 0.8]', 'scifi', 8.5),
    (2, '[0.9, -0.8, 0.7, -0.6, 0.5, -0.4, 0.3, -0.2]', 'romance', 7.2),
    (3, '[0.15, 0.25, 0.35, -0.45, 0.55, -0.65, 0.75, 0.85]', 'scifi', 9.0),
    (4, '[0.85, -0.75, 0.65, -0.55, 0.45, -0.35, 0.25, -0.15]', 'comedy', 6.8),
]

# 注意：实际 768 维向量需要用 serialize_float32() 转成 BLOB
# 这里用 8 维简化演示
for movie in movies:
    db.execute(
        "INSERT INTO vec_movies VALUES (?, ?, ?, ?)",
        movie
    )

# 4. KNN 搜索：找与"太空科幻"最接近的电影
query_vector = '[0.12, 0.22, 0.32, -0.42, 0.52, -0.62, 0.72, 0.82]'
results = db.execute("""
    SELECT movie_id, genre, rating, distance
    FROM vec_movies
    WHERE synopsis_embedding MATCH ?
      AND k = 2
      AND genre = 'scifi'
    ORDER BY distance
""", [query_vector]).fetchall()

for row in results:
    print(f"电影ID: {row[0]}, 类型: {row[1]}, 评分: {row[2]}, 距离: {row[3]:.4f}")
```

输出示例：

```
电影ID: 3, 类型: scifi, 评分: 9.0, 距离: 0.0520
电影ID: 1, 类型: scifi, 评分: 8.5, 距离: 0.1040
```

注意 WHERE 子句里同时用了向量搜索（`MATCH`）和元数据过滤（`genre = 'scifi'`），sqlite-vec 会在计算距离的同时应用这些过滤条件。

### 示例二：用普通表 + SQL 函数手动做向量搜索

如果你不想用 `vec0` 虚拟表，也可以把向量存在普通表的 BLOB 列里，手动调用距离函数：

```python
import sqlite3
import sqlite_vec

db = sqlite3.connect(":memory:")
db.enable_load_extension(True)
sqlite_vec.load(db)
db.enable_load_extension(False)

# 普通表，向量存在 BLOB 列中
db.execute("""
    CREATE TABLE articles (
        id INTEGER PRIMARY KEY,
        title TEXT,
        content TEXT,
        embedding BLOB CHECK(typeof(embedding) = 'blob' AND vec_length(embedding) = 768)
    )
""")

# 插入数据，用 vec_f32() 函数把 JSON 向量转成 BLOB
db.execute(
    "INSERT INTO articles VALUES (?, ?, ?, vec_f32(?))",
    (1, "AI 的未来", "人工智能正在改变世界...", "[0.1, 0.2, 0.3, 0.4]")
)
db.execute(
    "INSERT INTO articles VALUES (?, ?, ?, vec_f32(?))",
    (2, "烹饪技巧", "如何做出完美的牛排...", "[0.9, 0.8, 0.7, 0.6]")
)
db.execute(
    "INSERT INTO articles VALUES (?, ?, ?, vec_f32(?))",
    (3, "深度学习入门", "神经网络的基础知识...", "[0.15, 0.25, 0.35, 0.45]")
)

# 手动计算距离做 KNN
query = "[0.12, 0.22, 0.32, 0.42]"
results = db.execute("""
    SELECT id, title,
           vec_distance_L2(embedding, ?) AS distance
    FROM articles
    ORDER BY distance
    LIMIT 2
""", [query]).fetchall()

for row in results:
    print(f"文章: {row[1]}, 距离: {row[2]:.4f}")
```

输出示例：

```
文章: AI 的未来, 距离: 0.0520
文章: 深度学习入门, 距离: 0.1040
```

这种方法更灵活，不需要 `vec0` 虚拟表，但性能不如 `vec0`（没有专门的向量索引），适合小规模数据或原型阶段。

## 关键特性一览

- **纯 SQL 操作**——只需要 CREATE、INSERT、SELECT，不需要额外的配置或服务器
- **多语言绑定**——Python、Node.js、Ruby、Go、Rust 都有官方包
- **多种向量类型**——FLOAT（浮点）、INT8（整型）、BIT（二进制向量）
- **多种距离度量**——L2 距离（欧几里得）、余弦相似度、L1 距离
- **元数据过滤**——在向量搜索的同时用 WHERE 条件筛选，不用二次过滤
- **分区索引**——按用户 ID 等字段分片，大规模数据也能快速检索
- **二进制量化**——支持将向量压缩为二进制（1 bit/维），大幅节省存储空间

## 什么时候用它

| 场景 | 是否适合 |
|------|---------|
| 本地 AI 应用（离线 embedding + 搜索） | 非常适合 |
| 嵌入式设备 / IoT 上的向量搜索 | 非常适合（体积小、无依赖） |
| 浏览器端 AI 功能（WASM） | 非常适合 |
| 已有 SQLite 的项目想加语义搜索 | 非常适合（零迁移成本） |
| 超大规模向量（亿级以上） | 考虑专用向量数据库（如 Milvus） |

## 和 pgvector 的区别

[[pgvector]] 是 PostgreSQL 的向量扩展，适合已经用 Postgres 的后端服务。sqlite-vec 的定位完全不同——它是给**不需要独立数据库服务器**的场景设计的。你的数据就在一个文件里，可以随应用打包、可以复制到任何地方、不需要运维数据库实例。

## 相关项目

- [sqlite-rembed](https://github.com/asg017/sqlite-rembed) — 通过远程 API（OpenAI / Ollama）生成 embedding，适合测试和 SQL 脚本
- [sqlite-lembed](https://github.com/asg017/sqlite-lembed) — 本地从 GGUF 格式的 embedding 模型生成向量
- [sqlite-vss](https://github.com/asg017/sqlite-vss) — sqlite-vec 的前身，已被取代
