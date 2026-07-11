---
title: Litestar — 类型驱动的 ASGI 框架（原 Starlite）
来源: 'https://github.com/litestar-org/litestar'
日期: 2026-05-29
分类: backend-api
难度: 中级
---

## 是什么

Litestar（**原名 Starlite**）是一个 Python 写的 ASGI Web 框架，专门用来做 API。日常类比：如果 FastAPI 是"快速搭一个 API 的瑞士军刀"，Litestar 就是"自带工具箱的木匠"——开箱就有 ORM、会话、缓存、限流、OpenTelemetry，不用一个个找轮子。

最小例子：

```python
from litestar import Litestar, get

@get("/")
async def hello_world() -> dict[str, str]:
    return {"hello": "world"}

app = Litestar(route_handlers=[hello_world])
```

写法看着像 FastAPI，但底层哲学不一样：Litestar 把"类型注解"当作单一真相源，做参数校验、做 OpenAPI 文档、做 DI 注入，全部都从你的 type hint 推。

## 为什么重要

不理解 Litestar，下面这些事都没法解释：

- 为什么 Python 后端社区在 FastAPI 之后又冒出来一个新框架——FastAPI 哪里"不够好"
- 为什么"类驱动控制器"这种 OOP 风格在 Python Web 圈又被翻出来（Django 之后已经多年不流行）
- 为什么同样一段代码，Litestar 跑得比 FastAPI 还快——msgspec 插件 vs Pydantic 的差距
- 为什么"开箱即用"和"微框架"会变成两条岔路——Litestar 站到 FastAPI 的对立面

## 核心要点

Litestar 的设计可以拆成 **三个支柱**：

1. **类型即真相**：你写 `async def get_user(user_id: int) -> User`，框架就用这串签名做三件事——校验请求、注入依赖、生成 OpenAPI。类比：报关单上写一次，海关、税务、物流都用同一份。

2. **类驱动控制器**：路由可以分组到 `Controller` 类里，共享路径前缀和依赖。灵感来自 TypeScript 的 NestJS（NestJS 又抄 Angular）。类比：把同一组 API 装进一个文件夹，而不是平铺。

3. **分层 DI**：依赖在 app / router / controller / handler 四层都能声明，越内层的优先级越高，会覆盖外层。类比：公司发文件，部门规章覆盖公司规章。

## 实践案例

### 案例 1：函数式 handler（最常见姿势）

```python
from litestar import Litestar, get

@get("/users/{user_id:int}")
async def get_user(user_id: int) -> dict:
    return {"id": user_id, "name": "Alice"}

app = Litestar(route_handlers=[get_user])
```

**逐部分解释**：

- `@get("/users/{user_id:int}")` —— 路由 + 路径参数，`:int` 是类型标记，框架据此把 URL 字符串转成 int
- `async def get_user(user_id: int) -> dict` —— 参数和返回都有类型注解，框架自动生成 OpenAPI schema
- `Litestar(route_handlers=[...])` —— 注册路由，列表式（FastAPI 是 `app.include_router`）

### 案例 2：依赖注入

```python
from litestar import Litestar, get
from litestar.di import Provide

async def get_db_session() -> str:
    return "fake-db-session"

@get("/")
async def index(db: str) -> str:
    return f"using {db}"

app = Litestar([index], dependencies={"db": Provide(get_db_session)})
```

**逐部分解释**：

- `Provide(get_db_session)` —— 把异步工厂包成可注入对象
- handler 形参名 `db` 必须和 `dependencies={"db": ...}` 的 key 对上，框架按名字匹配
- 这个 `dependencies` 也可以放在 Controller 上、Router 上、甚至单个 handler 上——分层覆盖

### 案例 3：类驱动 Controller

```python
from litestar import Controller, Litestar, get, post

class UserController(Controller):
    path = "/users"

    @get()
    async def list_users(self) -> list[dict]:
        return [{"id": 1}, {"id": 2}]

    @post()
    async def create_user(self, data: dict) -> dict:
        return {"created": data}

app = Litestar(route_handlers=[UserController])
```

**逐部分解释**：

- `class UserController(Controller)` + `path = "/users"` —— 类级路径前缀，里面的方法自动继承
- `@get()` `@post()` 不带路径就是挂在前缀上（`GET /users`、`POST /users`）
- `data: dict` 这个特殊形参名 `data` 在 Litestar 里是约定：从 request body 反序列化

## 踩过的坑

1. **包名改过**：2021 年叫 `starlite`，2023 年改名 `litestar`（避免和 SaaS 公司 Starlite 撞名）。老教程里 `from starlite import ...` 早就不能 import 了，遇到老代码必须批量替换。

2. **msgspec vs Pydantic 插件二选一**：Litestar 默认用 msgspec（C 写的，比 Pydantic 快几倍），但很多团队已有的模型是 Pydantic。混用要装 `litestar[pydantic]` 并手动注册插件，忘了装就报"unknown type"。

3. **DI 分层覆盖容易踩**：同一个名字 `db` 在 app 层声明又在 handler 层声明，handler 的会赢。如果 controller 层定义了 `db` 但你 handler 里以为用的是 app 层的，参数注入对不上时排查很折磨。

4. **`data` 参数是保留语义**：handler 里写 `data: SomeModel`，框架自动从 body 反序列化；但写 `body: SomeModel` 就不会，会被当作未知依赖报错。新人常以为参数名随便起。

## 适用 vs 不适用

**适用**：

- 中大型 API 项目，希望"开箱即用"——会话、缓存、限流、OpenTelemetry 都不用自己拼
- 团队偏好 OOP，路由想按业务域分组到 Controller 类
- 性能敏感的服务，msgspec 序列化能比 Pydantic 快 3-10 倍
- 需要严格类型校验和高质量 OpenAPI 文档（自动生成 5 种 UI：Swagger / ReDoc / RapiDoc / Scalar / Stoplight）

**不适用**：

- 想要"最小依赖"的微服务 → 用 Starlette 或 FastAPI 更合适
- 团队从 Flask 迁移、不想学 OOP 风格 → FastAPI 学习曲线更平
- 需要服务端模板渲染的传统 Web 应用 → 用 Django
- Node.js 生态项目 → 看 [[express]] / [[hono]] / [[nestjs]]

## 历史小故事（可跳过）

- **2021 年**：开发者 Na'aman Hirschfeld 因为对 FastAPI 的某些设计不满意，发起 `starlite` 项目，初期就是"FastAPI 但更结构化"
- **2023 年 3 月**：和 SaaS 公司 Starlite Suite 撞名遭法律通知，社区投票后改名 **Litestar**
- **2023 年 10 月**：发布 2.0，重写插件系统，引入分层 DI 和 DTO（数据传输对象）抽象
- **至 2025 年**：约 6.5k stars，进入 GitHub Python Web 框架前 10，社区维护稳定

## 学到什么

1. **同一个生态可以容下两种哲学**：FastAPI 走"微框架 + 你自己拼"，Litestar 走"全家桶 + 我替你拼好"，没有谁更对
2. **类型注解是 Python Web 的新中心**——既能校验、又能生成文档、又能做 DI 路由匹配，一份代码三件事
3. **改名是品牌灾难但生态会原谅**——Starlite → Litestar 让所有教程链接死一遍，但两年内社区基本完成迁移
4. **OOP 在 Python Web 里没真正死过**——Django 一直在用，Litestar 用 NestJS 风格把它重新包装成"现代"

## 延伸阅读

- 官方文档：[Litestar Docs](https://docs.litestar.dev/latest/)（教程、插件、ORM 集成都在）
- 视频对比：[Litestar vs FastAPI](https://www.youtube.com/results?search_query=litestar+vs+fastapi)（社区有几十个对比讲解）
- 迁移指南：[FastAPI → Litestar 官方迁移文档](https://docs.litestar.dev/latest/migration/fastapi.html)
- [[fastapi]] —— 最直接的竞争对手，理解差异最快的方式
- [[starlette]] —— Litestar 早期基于 Starlette，2.x 已自研 ASGI 层
- [[nestjs]] —— Litestar 类驱动控制器的灵感来源

## 关联

- [[fastapi]] —— 同生态最强对手；Litestar 把 FastAPI"微框架"反过来做"全家桶"
- [[starlette]] —— Litestar 1.x 基于 Starlette；2.x 起独立实现 ASGI 层
- [[nestjs]] —— TypeScript 圈的类驱动框架；Litestar 的 Controller 设计明显受其影响
- [[django]] —— Python 老牌 OOP 框架；Litestar 把"类驱动"重新包装成现代异步风
- [[flask]] —— Python 微框架代表；Litestar 走的是相反方向（开箱即用）
- [[express]] —— Node 微框架代表；同样的"微 vs 全家桶"对立
- [[hono]] —— 新一代轻量框架；和 Litestar 形成"轻 vs 重"的两端对照

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
