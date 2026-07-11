---
title: Strawberry — 用 Python 类型注解直接生成 GraphQL schema
来源: 'https://github.com/strawberry-graphql/strawberry'
日期: 2026-05-30
分类: backend-api
难度: 初级
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

启动：`uvicorn app:app`，访问 `/graphql` 见 GraphiQL。`async def` 让 resolver 等库时不堵别的请求——相对 Graphene 的工程优势。

### 案例 3：用 DataLoader 解掉 N+1（三步跟做）

**步骤 1**：写批量加载（一次 SQL；`db` 换成你的异步驱动）：

```python
async def load_posts(user_ids: list[int]) -> list[list[str]]:
    rows = await db.fetch_all(
        "SELECT user_id, title FROM posts WHERE user_id = ANY($1)", user_ids
    )
    by_user = {uid: [] for uid in user_ids}
    for r in rows:
        by_user[r["user_id"]].append(r["title"])
    return [by_user[uid] for uid in user_ids]
```

**步骤 2**：挂到字段（每次请求新建 `DataLoader(load_fn=load_posts)` 注入 `info.context`，别用全局单例）：

```python
@strawberry.type
class User:
    id: int

    @strawberry.field
    async def posts(self, info: strawberry.Info) -> list[str]:
        return await info.context["post_loader"].load(self.id)
```

**步骤 3**：查 `{ users { posts } }` 时，同一 tick 多次 `load` 合并成 **1 次** SQL，而不是 100×N+1。

## 踩过的坑

1. **前向引用要用字符串**：A 引用 B、B 引用 A 时，必须写 `posts: list['Post']` 而不是 `list[Post]`，否则 Python 解析时还没定义 `Post` 就 `NameError`。

2. **Optional 别滥用**：Python 写 `Optional[str]` 时 GraphQL 字段会变成可空 `String`。前端拿到一个不该是 null 的字段反而要做防御判断——只在真的可空时才标 Optional。

3. **async resolver 配 async server**：`async def` 必须跑 ASGI（uvicorn）；gunicorn 默认 sync worker 会卡——FastAPI 默认没事，老 Django 要换 channels / uvicorn worker。

4. **N+1 不会自己消失**：`def posts(self): return db.query(...)` 在 list 里 100 个 user 就是 100 次查询；必须显式 DataLoader，没有自动优化。

## 适用 vs 不适用场景

**适用**：

- Python 后端要给前端提供 GraphQL，并且前端真的吃 GraphQL（不是 REST 套了一层皮）
- 已经在用 [[fastapi]] / Pydantic / SQLAlchemy 类型注解栈，想让 schema 一份配置走到底
- 项目已经升级到 Python 3.10+，类型语法（`int | None`、`list[X]`）能用上

**不适用**：

- 团队还停在 Python 3.7 以下、不写 type hint —— 收益归零，反而增加心智负担
- 接口又简单又稳定，REST + JSON 就够，前端没有"我要挑字段"的需求 —— GraphQL 全套是过度工程
- 需要大规模 federation / subgraph 且团队不熟 GraphQL —— 选 Apollo 生态更稳，参考 [[apollo-server]]

## 历史小故事（可跳过）

- **2015 年**：Facebook 开源 GraphQL；Python 圈出现 Graphene，写法仿照 Django ORM 的 Field 类
- **2018 年前后**：Python 类型注解（PEP 484 / dataclass）成熟，[[fastapi]] 出现并迅速流行，证明"注解驱动框架"可行
- **2019 年**：Patrick Arminio 发起 Strawberry，目标是用 dataclass + 注解重做 Graphene，去掉 Field 类那套手写
- **2020–2021 年**：作者成为 PSF Fellow；Strawberry 被 FastAPI 等文档列为 Python GraphQL 选项之一，社区扩大
- **2023 年起**：federation 2 / subscriptions / Pydantic v2 集成陆续 GA；对照 Node 侧 [[apollo-server]]，Python 端 code-first 体验已够用

## 学到什么

- **类型注解可以是代码的"主角"**：不只给 IDE 看，还能驱动 schema、校验、序列化
- **老风格 vs 新风格会长期并存**：Graphene 与 Strawberry 选哪个看团队，不是谁一夜替代谁
- **async/await 推动配套库重写**：HTTP 客户端、ORM、GraphQL 都被重做了一遍；生态适配决定新库能不能站住

## 延伸阅读

- 官方文档：[Strawberry GraphQL Docs](https://strawberry.rocks/)（最小例子 1 小时能跑）
- 视频：[Patrick Arminio PyCon 2022 talk](https://www.youtube.com/results?search_query=strawberry+graphql+pyconus)
- GraphQL 规范：[graphql.github.io](https://graphql.github.io/)
- [[fastapi]] —— 最常搭配的 web 框架
- [[graphql-yoga]] —— Node 生态对照组

## 关联

- [[fastapi]] —— 同样以"类型注解驱动"为核心，集成几乎零胶水
- [[django]] —— Strawberry 提供 Django 视图适配
- [[flask]] —— 可挂 Strawberry 做 GraphQL 端点
- [[apollo-server]] —— Node 端 GraphQL server 旗舰对照
- [[graphql-yoga]] —— Node 端轻量 GraphQL server
- [[hindley-milner]] —— 类型推导祖师；注解驱动思想一脉相承

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[errbot]] —— Errbot — 用 Python 类写一个能进 Slack/Discord 的聊天机器人
- [[hot-chocolate]] —— Hot Chocolate — .NET 里 code-first 写 GraphQL 服务器
