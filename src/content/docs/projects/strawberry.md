---
title: Strawberry — 用 Python 类型注解直接生成 GraphQL schema
来源: 'https://github.com/strawberry-graphql/strawberry'
日期: 2026-05-30
子分类: Web 后端
分类: 后端 API
难度: 初级
provenance: pipeline-v3
---

## 是什么

Strawberry 是一个 **Python 的 GraphQL 库**——你写一个普通的 Python 类，给字段加上类型注解，它就自动生成一份 GraphQL schema 给前端用。日常类比：像超市里贴价签，你只贴一次（在货架上），结账小票、订单系统、库存表都自动同步——不用每个地方再贴一遍。

你写：

```python
import strawberry

@strawberry.type
class User:
    name: str
    age: int
```

Strawberry 读到这个类，自动生成 GraphQL：

```graphql
type User {
  name: String!
  age: Int!
}
```

你**只写了一份 Python 类**，没有手写 GraphQL；类型注解就是 schema 的真相。这件事让 mypy / IDE / GraphQL 三边自动对齐。

## 为什么重要

不理解 Strawberry 这种风格，下面这些事情都会显得奇怪：

- 为什么 [[fastapi]] 和它配起来几乎不用胶水代码——两者都把"类型注解当真相"当作设计原点
- 为什么 Python 老牌 GraphQL 库 Graphene 写起来像 Django ORM，而 Strawberry 写起来像 dataclass——同一个问题两种风格
- 为什么"async resolver"忽然成了基本款——Python 3.5+ 的 async/await 普及后，I/O 密集的 GraphQL resolver 不能再是同步的
- 为什么 GraphQL 在 Python 圈一度被吐槽"麻烦"，又在 2020 年后回潮——工具链不一样了

## 核心要点

Strawberry 做的事情可以拆成 **三步**：

1. **装饰器读注解**：`@strawberry.type` 装饰一个类，库会读 `__annotations__` 字典，把 `name: str` 这种映射成 GraphQL 字段。类比：海关读你护照上的国籍栏，不问你"你是哪国人"。

2. **resolver 就是普通方法**：你想算"某 User 的 posts"，就在类里写一个普通方法 `def posts(self) -> list[Post]: ...`。返回值的类型注解告诉 schema："这个字段返回 Post 列表"。

3. **Schema 对象包一层**：最后用 `strawberry.Schema(query=Query)` 把根类型包起来，得到一个 schema，可以挂到任何 ASGI / WSGI server。

三步加起来，让"Python 类型注解 → GraphQL schema"成了一条直线，没有中间转换层。

## 实践案例

### 案例 1：最小可跑的 GraphQL schema

```python
import strawberry

@strawberry.type
class Query:
    @strawberry.field
    def hello(self) -> str:
        return "world"

schema = strawberry.Schema(query=Query)
result = schema.execute_sync("{ hello }")
print(result.data)   # {'hello': 'world'}
```

**逐部分解释**：

- `@strawberry.type` 把类标记成"GraphQL 对象类型"
- `@strawberry.field` 把方法标记成"GraphQL 字段"，返回值的类型注解 `-> str` 决定字段类型
- `schema.execute_sync` 是同步执行接口，本地调试方便

### 案例 2：和 FastAPI 集成（async）

```python
import strawberry
from strawberry.fastapi import GraphQLRouter
from fastapi import FastAPI

@strawberry.type
class Query:
    @strawberry.field
    async def user(self, id: int) -> str:
        # 真实场景这里会 await db.fetch_user(id)
        return f"user-{id}"

schema = strawberry.Schema(query=Query)
app = FastAPI()
app.include_router(GraphQLRouter(schema), prefix="/graphql")
```

启动：`uvicorn app:app`。访问 `/graphql` 就能看到内置 GraphiQL 调试界面。`async def` 让 resolver 在等数据库时不阻塞别的请求——这是 Strawberry 相比 Graphene 最大的工程优势。

### 案例 3：用 DataLoader 解掉 N+1

```python
from strawberry.dataloader import DataLoader

async def load_posts(user_ids: list[int]) -> list[list[str]]:
    rows = await db.fetch_all(
        "SELECT user_id, title FROM posts WHERE user_id = ANY($1)", user_ids
    )
    by_user = {uid: [] for uid in user_ids}
    for r in rows:
        by_user[r["user_id"]].append(r["title"])
    return [by_user[uid] for uid in user_ids]

post_loader = DataLoader(load_fn=load_posts)
```

`DataLoader` 把同一 tick 里的多次 `loader.load(uid)` 合并成一次批量调用——100 个 user 不再触发 100 次 SQL，而是 1 次。这是 GraphQL 列表查询里几乎必装的件。

## 踩过的坑

1. **前向引用要用字符串**：A 引用 B、B 引用 A 时，必须写 `posts: list['Post']` 而不是 `list[Post]`，否则 Python 解析时还没定义 `Post` 就 `NameError`。

2. **Optional 别滥用**：Python 写 `Optional[str]` 时 GraphQL 字段会变成可空 `String`。前端拿到一个不该是 null 的字段反而要做防御判断——只在真的可空时才标 Optional。

3. **async resolver 配 async server**：`async def` resolver 必须跑在 ASGI（uvicorn / hypercorn）下；老 WSGI 部署（gunicorn 默认 sync worker）会卡——FastAPI 默认 ASGI 没事，老 Django 要换 channels 或 gunicorn 的 uvicorn worker。

4. **N+1 不会自己消失**：每写一个 `def posts(self): return db.query(...)` 都是一次独立查询，list 里 100 个 user 就 100 次查询；必须显式用 DataLoader 批量化，没有"自动神奇优化"。

## 适用 vs 不适用场景

**适用**：

- Python 后端要给前端提供 GraphQL，并且前端真的吃 GraphQL（不是 REST 套了一层皮）
- 已经在用 [[fastapi]] / Pydantic / SQLAlchemy 类型注解栈，想让 schema 一份配置走到底
- 项目已经升级到 Python 3.10+，类型语法（`int | None`、`list[X]`）能用上

**不适用**：

- 团队还停在 Python 3.7 以下、不写 type hint —— 收益归零，反而增加心智负担
- 接口又简单又稳定，REST + JSON 就够，前端没有"我要挑字段"的需求 —— GraphQL 全套是过度工程
- 需要超大规模 federation / subgraph 拼装且团队没人懂 GraphQL 语义 —— 选 Apollo 生态成熟工具更稳，参考 [[apollo-server]]

## 历史小故事（可跳过）

- **2015 年**：Facebook 开源 GraphQL；Python 圈出现 Graphene，写法仿照 Django ORM 的 Field 类
- **2018 年前后**：Python 类型注解（PEP 484 / dataclass）成熟，[[fastapi]] 出现并迅速流行，证明"注解驱动框架"可行
- **2019 年**：Patrick Arminio 发起 Strawberry，目标是用 dataclass + 注解重做 Graphene，去掉 Field 类那套手写
- **2021 年**：Strawberry 加入 Python 软件基金会，被 FastAPI / Django / Pydantic 官方文档列为推荐 GraphQL 库
- **2023 年起**：federation 2 / subscriptions / Pydantic v2 集成陆续 GA，覆盖度追上甚至超过 Apollo Python 客户端

## 学到什么

- **类型注解可以是代码的"主角"**：注解不只是给 IDE 看的提示，可以驱动 schema、校验、序列化
- **同一个语言生态里，"老风格 vs 新风格"会同时存在很久**：Graphene 不会一夜消失，Strawberry 也不会一夜替代——你选哪一个看团队
- **async/await 普及推动了一整批"配套库的重写"**：HTTP 客户端、ORM、GraphQL 都被重做了一遍
- **生态拼接的成本，决定了一个新库会不会火**：Strawberry 之所以站住脚，是因为 FastAPI / Django / Pydantic 都给它写了适配

## 延伸阅读

- 官方文档：[Strawberry GraphQL Docs](https://strawberry.rocks/)（教程从最小例子起步，1 小时就能跑起来）
- 视频教程：[Patrick Arminio 在 PyCon 2022 的 talk](https://www.youtube.com/results?search_query=strawberry+graphql+pyconus)（讲设计动机和踩过的坑）
- GraphQL 规范：[graphql.github.io](https://graphql.github.io/)（理解 schema / query / mutation 的本意）
- [[fastapi]] —— Strawberry 最常搭配的 web 框架
- [[graphql-yoga]] —— Node 生态对照组，看跨语言怎么做 GraphQL server

## 关联

- [[fastapi]] —— 同样以"类型注解驱动"为核心，集成几乎零胶水
- [[django]] —— 经典 Python web 框架，Strawberry 提供 Django 视图适配
- [[flask]] —— 老牌 Python micro framework，可以挂 Strawberry 做 GraphQL 端点
- [[apollo-server]] —— Node 生态的 GraphQL server 旗舰，对照看"另一种语言怎么做 GraphQL"
- [[graphql-yoga]] —— Node 端轻量 GraphQL server，和 Strawberry 同期同思路
- [[hindley-milner]] —— 类型推导的祖师爷；Strawberry 对类型注解的依赖思想上一脉相承

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[apollo-server]] —— Apollo Server — Node 端 GraphQL 服务端的事实标准
- [[django]] —— Django — 全功能 batteries-included 的 Python web 框架
- [[errbot]] —— Errbot — 用 Python 类写一个能进 Slack/Discord 的聊天机器人
- [[fastapi]] —— FastAPI — 用 Python 类型注解写 API
- [[flask]] —— Flask — 用装饰器把 URL 接到函数上的 Python 微框架
- [[graphql-yoga]] —— GraphQL Yoga — 跨运行时的轻量 GraphQL 服务器
- [[hindley-milner]] —— Hindley-Milner — 编译器自己猜变量类型
- [[hot-chocolate]] —— Hot Chocolate — .NET 里 code-first 写 GraphQL 服务器

