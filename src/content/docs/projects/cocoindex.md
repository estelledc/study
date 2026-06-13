---
title: CocoIndex — AI 增量数据转换与索引框架
来源: https://github.com/cocoindex-io/cocoindex
日期: 2026-06-13
子分类: 模型与训练
分类: 机器学习
provenance: pipeline-v3
---

## 是什么

**CocoIndex** 是一个面向 AI 工作负载的**增量数据转换框架**：你用 Python 声明「源数据 → 变换 → 目标索引」的期望状态，引擎在 Rust 核心上自动做变更检测、最小重算与目标同步。典型产物包括向量索引、知识图谱、特征表，以及供 Agent 长期引用的结构化上下文。

日常类比：

- **手写 ETL 脚本**：像每次仓库改动都重新复印整栋楼的所有文件柜——改了一个 `main.py`，却把全库 Markdown 再切分、再 embedding 一遍。
- **CocoIndex**：像图书馆的**编目系统**——新书入库只登记新书，某本书换版只更新那一册的卡片；删书则自动从目录里摘掉对应条目。你只管写「一本书该怎么变成卡片」，不用写「今天比昨天多了哪几本」。

再换一个类比：它很像 Excel 里的公式——你定义 `C2 = A2 & B2`，改 A2 时 Excel 只重算受影响的格子。CocoIndex 把这套「声明式变换 + 自动增量重算」扩展到嵌套数据（文档 → 块 → 向量）、长生命周期管道，以及 Postgres / 向量库等目标存储。

核心引擎用 **Rust** 编写，通过 **PyO3** 暴露 Python API；Apache 2.0 开源，GitHub 上 star 数已达数千级，定位是「long-horizon agent」背后的数据层，而不是又一个聊天 UI。

## 为什么重要

如果你在做 RAG、代码库索引、会议记录入库、或任何「源数据会变、下游索引必须跟得上」的 Agent 场景，CocoIndex 解决的是常被低估的一层：

1. **增量是默认能力，不是后期补丁**——组件级、函数级、目标级三层变更检测；未改动的文件可 `memo` 跳过，embedding 等昂贵步骤可复用缓存。
2. **数据血缘（lineage）可观测**——采用 Dataflow 式编程：每个字段由输入字段纯函数导出，无隐藏可变状态，便于调试「这条检索结果从哪来」。
3. **写批处理心智，跑增量执行**——不必手写 DAG、调度器或 delta 逻辑；`cocoindex update` 在 batch 与 live 模式间切换。
4. **与 Python AI 生态对齐**——SentenceTransformer、Docling、自定义 UDF 都能挂在 `transform` / `@coco.fn` 上；目标端支持 Postgres（pgvector）、以及可扩展的 connector 接口。

它和 [[dify]]、[[llamaindex]] 的边界也清晰：Dify 偏「低代码搭应用」；LlamaIndex 偏「应用层 RAG 编排」；CocoIndex 更靠近 **数据工程 + 索引管道**——把「永远新鲜的上下文」做成基础设施。

## 核心概念

### 1. 索引流（Indexing Flow）

一条索引流 = **数据源 import → 变换 transform →（可选 collect）→ 目标 export**。流内所有数据的 schema 在定义时就确定，支持基础类型、struct、以及带 key 的 KTable / 有序 LTable。

常见操作（action）：

| 动作 | 作用 |
|------|------|
| `import` / `add_source` | 从 LocalFile、数据库、队列等拉取源数据 |
| `transform` | 对字段应用内置或自定义函数（切分、embedding、LLM 抽取） |
| `for each` / `.row()` | 对集合中每一行重复同一套变换 |
| `collect` | 把多行结果汇总到 collector |
| `export` | 写入 Postgres 向量表、图库、文件系统等 target |

### 2. 持久状态驱动（Persistent-State-Driven）

你声明的是 **target 应该长什么样**，而不是「如何一步步 patch」。引擎维护内部状态（默认用 **PostgreSQL** 或本地 `COCOINDEX_DB`），记录每个处理单元上次算过什么；源数据或代码变更时，只 reconcile 差异。

### 3. 处理组件（Processing Component）

在较新的 App API 里，**每个独立源项**（例如一个 PDF、一个仓库文件）可挂载为一个 processing component，拥有自己的 component path。该项删除时，其声明的 target state（如对应的 `.md` 文件）会自动清理——适合「一文件一输出」的同步语义。

### 4. 增量处理的三层粒度

文档与官方 overview 一致，可概括为：

- **组件/行级**：只有变更的源文件或记录进入重处理。
- **函数级**：`@coco.fn(memo=True)` 等对昂贵纯函数做 memoization。
- **目标级**：对向量表等只做必要的 insert / update / delete。

### 5. 查询（Query）

索引完成后，检索可以走任意栈：直接 SQL + pgvector、Qdrant SDK，或注册 `@flow.query_handler` 供 CocoInsight 等工具发现。推荐用 `@cocoindex.transform_flow()` **共享**索引与查询阶段的 embedding 逻辑，避免「建索引用一种模型、查询又手写另一套」的漂移。

## 安装与环境

```bash
pip install -U cocoindex

# 向量索引示例通常需要 Postgres + pgvector
# 或 quickstart 可用本地 SQLite 状态库：
echo "COCOINDEX_DB=./cocoindex.db" > .env
```

Postgres 场景设置：

```bash
export COCOINDEX_DATABASE_URL="postgresql://user:pass@localhost:5432/cocoindex"
```

可选：`pip install docling` 用于 PDF→Markdown 教程；`sentence-transformers` 用于本地 embedding。

## 实践案例一：Markdown 文档 → Postgres 向量索引

这是官方最常见的 **flow_def** 风格：读目录、递归切分、embedding、导出带 HNSW 的向量表。

```python
import cocoindex

@cocoindex.flow_def(name="TextEmbedding")
def text_embedding_flow(
    flow_builder: cocoindex.FlowBuilder,
    data_scope: cocoindex.DataScope,
):
    # 1) 数据源：本地 markdown 目录
    data_scope["documents"] = flow_builder.add_source(
        cocoindex.sources.LocalFile(path="markdown_files")
    )

    doc_embeddings = data_scope.add_collector()

    # 2) 每个文档
    with data_scope["documents"].row() as doc:
        doc["chunks"] = doc["content"].transform(
            cocoindex.functions.SplitRecursively(),
            language="markdown",
            chunk_size=2000,
            chunk_overlap=500,
        )

        # 3) 每个 chunk
        with doc["chunks"].row() as chunk:
            chunk["embedding"] = chunk["text"].transform(
                cocoindex.functions.SentenceTransformerEmbed(
                    model="sentence-transformers/all-MiniLM-L6-v2"
                )
            )

            doc_embeddings.collect(
                filename=doc["filename"],
                location=chunk["location"],
                text=chunk["text"],
                embedding=chunk["embedding"],
            )

    # 4) 导出到 Postgres
    doc_embeddings.export(
        "doc_embeddings",
        cocoindex.targets.Postgres(),
        primary_key_fields=["filename", "location"],
        vector_indexes=[
            cocoindex.VectorIndexDef(
                field_name="embedding",
                metric=cocoindex.VectorSimilarityMetric.COSINE_SIMILARITY,
            )
        ],
    )
```

运行：

```bash
cocoindex update main          # 一次性同步到当前源数据快照
cocoindex update main -L       # live 模式：持续监听源变更
```

**增量行为**：往 `markdown_files/` 新增或修改单个文件后再次 `update`，只会重跑受影响文档的切分与 embedding，而不是全库重算。

## 实践案例二：共享 Transform Flow + 语义检索

索引与查询应对同一 embedding 函数，否则向量空间不一致，检索质量会莫名变差。

```python
import os
from psycopg_pool import ConnectionPool
import cocoindex

@cocoindex.transform_flow()
def text_to_embedding(text: cocoindex.DataSlice[str]) -> cocoindex.DataSlice[list[float]]:
  """索引与查询共用的 embedding 逻辑。"""
  return text.transform(
      cocoindex.functions.SentenceTransformerEmbed(
          model="sentence-transformers/all-MiniLM-L6-v2"
      )
  )

def search(pool: ConnectionPool, flow, query: str, top_k: int = 5):
    table = cocoindex.utils.get_target_storage_default_name(flow, "doc_embeddings")
    query_vector = text_to_embedding.eval(query)

    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT filename, text, embedding <=> %s::vector AS distance
                FROM {table}
                ORDER BY distance
                LIMIT %s
                """,
                (query_vector, top_k),
            )
            return [
                {"filename": row[0], "text": row[1], "score": 1.0 - row[2]}
                for row in cur.fetchall()
            ]

# 使用示例
# pool = ConnectionPool(os.environ["COCOINDEX_DATABASE_URL"])
# print(search(pool, text_embedding_flow, "CocoIndex incremental processing"))
```

也可注册 query handler，把 `search` 包成 `cocoindex.QueryOutput`，供 CocoInsight 直接调用——适合团队内「可观测的 RAG 管道」。

## 实践案例三：PDF 批量转 Markdown（App API 速览）

较新的 quickstart 用 `@coco.fn` + `coco.App`，强调**每文件一个处理组件**：

```python
import pathlib
import cocoindex as coco
from cocoindex.connectors import localfs
from cocoindex.resources.file import PatternFilePathMatcher

@coco.fn(memo=True)
def process_file(file: localfs.File, outdir: pathlib.Path) -> None:
    # 伪代码：真实项目里可换成 docling 等转换器
    markdown = file.read_text()  # 示意
    outname = file.file_path.path.stem + ".md"
    localfs.declare_file(outdir / outname, markdown, create_parent_dirs=True)

@coco.fn
async def app_main(sourcedir: pathlib.Path, outdir: pathlib.Path) -> None:
    files = localfs.walk_dir(
        sourcedir,
        recursive=True,
        path_matcher=PatternFilePathMatcher(included_patterns=["**/*.pdf"]),
    )
    await coco.mount_each(process_file, files.items(), outdir)

app = coco.App(
    "PdfToMarkdown",
    app_main,
    sourcedir=pathlib.Path("./pdf_files"),
    outdir=pathlib.Path("./out"),
)
```

```bash
cocoindex update main.py
```

删除 `pdf_files/` 中某个 PDF 再 update，对应 `out/` 下的 Markdown 会被引擎自动移除——这就是 **declare_file** 与组件路径树联动带来的「目标状态与源一致」。

## 与相关项目的对比

| 维度 | CocoIndex | LlamaIndex / LangChain 索引 | 自写 cron + 脚本 |
|------|-----------|------------------------------|------------------|
| 增量重算 | 内建、细粒度 | 需自行设计 checkpoint | 通常全量或手写 diff |
| 血缘/可观测 | Dataflow 字段级 | 依具体实现 | 弱 |
| 学习曲线 | Python 声明式 | 抽象多、偏应用 | 低起步、难维护 |
| 典型用户 | 数据/平台工程师、Agent 基础设施 | 应用开发者 | 小团队脚本 |

不是替代关系：很多团队用 CocoIndex 维护「干净的索引层」，上层再用任意 Agent 框架消费。

## 常见坑与排错

1. **Postgres 必须用 pgvector 镜像**——plain `postgres:16` 会在创建 vector 扩展时报 `extension "vector" is not available`。
2. **索引与查询 embedding 不一致**——务必 `@transform_flow` 共享，或 query handler 内 `eval()` 同一 flow。
3. **混淆两种 API 风格**——仓库里同时存在 `flow_def`（FlowBuilder）与 `coco.App`（mount_each）；跟官方 quickstart 版本对齐即可，不要混用已废弃的 `main_fn()` 入口。
4. **粒度选太大或太小**——`mount_each` 按文件往往最自然；按页 mount 适合超大 PDF，按目录 mount 适合批量原子更新。
5. **live 模式依赖源 connector 的变更捕获**——并非所有数据源都同等支持实时监听，部署前查对应 connector 文档。

## 典型应用场景

- **代码库索引**：符号、调用图、文件 chunk embedding，供 code review / coding agent 使用（官方强调「structure, not raw text」）。
- **企业知识库 RAG**：Confluence / SharePoint / S3 文档增量入 Postgres 或向量库。
- **多模态管道**：音视频转写 → 分段 → embedding（与文本流同一套增量语义）。
- **长时程 Agent**：数周运行的任务里，源数据持续变化，但 agent 读到的索引保持秒级～分钟级新鲜。

## 命令速查

```bash
pip install -U cocoindex
cocoindex update <entry>        # 同步索引
cocoindex update <entry> -L     # live 更新
cocoindex drop <entry>          # 删除 flow 及关联内部状态（慎用）
```

环境变量：

- `COCOINDEX_DATABASE_URL` — Postgres 状态与向量目标
- `COCOINDEX_DB` — 本地轻量状态（如 quickstart 的 SQLite 路径）

## 延伸阅读

- 官方文档：[Overview](https://cocoindex.io/docs/getting_started/overview/)、[Indexing Basics](https://cocoindex.io/docs/core/basics)、[Quickstart](https://cocoindex.io/docs/getting_started/quickstart)
- 示例集：[Simple Vector Index](https://cocoindex.io/examples/simple_vector_index)
- 相关笔记：[[dify]]（应用层）、[[vllm]]（推理Serving）、向量数据库与 RAG 论文索引

---

**一句话总结**：CocoIndex 让你用 Python 描述「数据应该变成什么样」，由 Rust 引擎负责「只有 delta 在动」——适合把 Agent 的上下文从「偶尔跑一次的脚本」升级成「可版本化、可观测、可持续同步的数据产品」。
