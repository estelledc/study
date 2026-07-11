---
title: Starlette — FastAPI 底下那台轻量 ASGI 引擎
来源: 'https://github.com/encode/starlette'
日期: 2026-05-29
分类: backend-api
难度: 中级
---

## 是什么

Starlette 是一套**只做最基础几件事**的 Python 异步 Web 工具箱：路由、中间件、WebSocket、后台任务、测试客户端。它不是给业务程序员写 API 用的（那一层是 [[fastapi]]），而是给"写框架的人"和"想要极致控制权的人"用的底座。

日常类比：像汽车的**底盘 + 发动机**。你拿到 Starlette，相当于拿到能跑的底盘，方向盘、仪表盘、座椅都得自己装；FastAPI 就是装好了所有内饰的整车。

最小例：

```python
from starlette.applications import Starlette
from starlette.responses import JSONResponse
from starlette.routing import Route

async def homepage(request):
    return JSONResponse({'hello': 'world'})

app = Starlette(routes=[Route('/', homepage)])
```

跑：`uvicorn main:app`。十行代码就有了一个能扛并发的异步 web 服务。

## 为什么重要

不理解 Starlette，下面这些事都没法解释：

- 为什么 FastAPI 自称"快"——它快是因为继承了 Starlette + Uvicorn 的异步 I/O，不是因为自己有黑科技
- 为什么 Python 后端社区从 2019 年开始集体迁到 ASGI——WSGI（Flask 用的那套）每请求一线程，扛不住高并发 WebSocket
- 为什么写"通用中间件"在 Starlette 里这么自然，但移到别的框架要重写——它走的是 ASGI 标准协议
- 为什么生产代码里你常看到一堆 `async def`，但偶尔要写 `def`——同步函数会被 Starlette 丢到线程池里跑

## 核心要点

Starlette 把"一个 web 框架"拆成了**三层洋葱**：

1. **ASGI 协议层**：最里面是一个 `async def app(scope, receive, send)` 函数，它就是整个应用。`scope` 是请求元信息（路径、headers），`receive` 拉数据，`send` 推数据。类比：一根三通水管。

2. **路由 + 端点层**：`Route("/users/{id}", users_endpoint)` 把 URL 模式映射到函数。匹配到了就调用你的 endpoint，没匹配就 404。类比：邮政分拣机看地址塞进对应袋子。

3. **中间件洋葱**：`Middleware(CORSMiddleware, ...)` 在外面套一层，请求进来按顺序穿过每层，响应出去再反向穿一遍。类比：洋葱皮，剥一层处理一层。

这三层是**正交**的——你可以只用最里面那一层（裸 ASGI）跑生产，也可以只拿路由不要中间件。

## 实践案例

### 案例 1：写一个带 WebSocket 的实时回显

```python
from starlette.applications import Starlette
from starlette.routing import WebSocketRoute

async def echo(websocket):
    await websocket.accept()
    async for msg in websocket.iter_text():
        await websocket.send_text(f"echo: {msg}")
    await websocket.close()

app = Starlette(routes=[WebSocketRoute('/ws', echo)])
```

**逐部分解释**：

- `WebSocketRoute` 把 `/ws` 这条路径标记成 WebSocket 端点（不是 HTTP）
- `await websocket.accept()` 完成握手；不调用就一直挂着
- `async for msg in websocket.iter_text()` 一直读到客户端断开
- WebSocket 这种长连接是 ASGI 的招牌能力，WSGI 框架（如 Flask）原生不支持

### 案例 2：自己写一个请求耗时中间件

```python
import time
from starlette.middleware.base import BaseHTTPMiddleware

class TimingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        t0 = time.perf_counter()
        response = await call_next(request)
        response.headers['X-Process-Time'] = f"{(time.perf_counter() - t0)*1000:.1f}ms"
        return response
```

挂上去：`app = Starlette(routes=routes, middleware=[Middleware(TimingMiddleware)])`。

每个响应都会带一个 `X-Process-Time: 23.4ms` 头。BaseHTTPMiddleware 是给写中间件门槛较低的入口，但生产严格场景应该写"纯 ASGI 中间件"（见踩坑 3）。

### 案例 3：lifespan 起停钩子（连数据库 / 关连接池）

```python
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app):
    app.state.db = await connect_db()      # 启动时
    yield                                   # 应用运行
    await app.state.db.close()              # 关闭时

app = Starlette(routes=routes, lifespan=lifespan)
```

启动一次连库、关闭一次断库，不在每请求里反复连。比 Flask 的 `before_first_request` 干净。

## 踩过的坑

1. **同步函数会被丢到线程池**：endpoint 写 `def`（不是 `async def`）能跑，但 Starlette 用 `anyio.to_thread.run_sync` 把它放线程池，并发量小、耗 GIL；写 IO 密集型一定要 `async def`。

2. **中间件加进去顺序很反直觉**：列表里"越靠前"的越**外层**，请求最先到、响应最后离。新人常写反，导致 CORS 套在错误处理器外面，404 没带 CORS 头。

3. **BaseHTTPMiddleware 会断 contextvars**：用 BaseHTTPMiddleware 包后，端点里 `ContextVar.set(...)` 在中间件里读不到——它内部用了独立任务。生产链路追踪 / 日志注入要写**纯 ASGI 中间件**绕开这个。

4. **TestClient 不是 async**：`from starlette.testclient import TestClient` 用起来像 requests（同步），但底层用 anyio 跑事件循环；想直接 `await app(...)` 测试得自己造 ASGI 调用。

## 适用 vs 不适用场景

**适用**：

- 想要极致性能 + 高度自定义的异步 API 服务
- WebSocket / SSE / 长连接为主的实时系统
- 写中间件库 / SDK，想兼容多个 ASGI 框架（Quart / FastAPI / Litestar 都吃同一份）
- 学异步 web 内部原理——Starlette 代码库小（约 3k 行），可精读

**不适用**：

- 想要"开箱即用 + 自动文档 + 数据校验"——直接上 [[fastapi]]，它在 Starlette 之上加了 Pydantic 和 OpenAPI
- 团队没异步基础、业务全是同步 ORM —— [[flask]] / [[django]] 更稳
- 重业务的管理后台（admin / auth / ORM 一条龙）——Starlette 不带这些，自造心智成本高
- 部署环境只有 WSGI 服务器（如老 Apache + mod_wsgi）——必须 ASGI server（Uvicorn / Hypercorn / Daphne）

## 历史小故事（可跳过）

- **2018 年**：Tom Christie（Django REST Framework 作者）发起 Starlette，配套 Encode 组织还做了 httpx、databases、uvicorn 等"异步生态全家桶"。
- **2019 年**：Sebastián Ramírez 在 Starlette 之上做了 FastAPI，三个月内星标过万；FastAPI 的爆火反过来推 Starlette 成了生产基建。
- **2020 年起**：Starlette 进入"维护模式"——核心 API 几乎不变，靠稳定性吃饭。这种"故意慢"的策略让它成了 Python 异步生态最值得信赖的底座之一。

stars 量级 11k+，依赖只有 `anyio`，依赖图极简。

## 学到什么

1. **不是所有框架都该"全功能"**——Starlette 故意只做最基础几件事，把"路由、中间件、ASGI 协议"做扎实，别的让生态去补
2. **ASGI 协议比 Starlette 本身更值得学**——它是 Python 异步 web 的"普通话"，所有框架都得说它
3. **底层中间件的正确写法是"纯 ASGI 函数"**，不是继承 BaseHTTPMiddleware；后者是糖，会丢功能
4. **代码库小可以精读**——3k 行能读完，是理解"框架 = 路由 + 中间件 + 协议适配"的最佳样本

## 延伸阅读

- 官方文档：[starlette.io](https://www.starlette.io/)（短小精悍，一晚上能过完）
- ASGI 规范：[asgi.readthedocs.io](https://asgi.readthedocs.io/)（理解 scope/receive/send 三件套）
- 视频：[Tom Christie — Async Python Web Frameworks](https://www.youtube.com/watch?v=NMCM2nGNVCg)（作者本人讲设计哲学）
- 同类对比文章：[Flask vs FastAPI vs Starlette](https://testdriven.io/blog/fastapi-vs-flask/)（含基准测试）
- [[fastapi]] —— Starlette 之上的"完整车"
- [[hono]] —— JS 端的同位思想轻量框架

## 关联

- [[fastapi]] —— FastAPI 直接建在 Starlette 之上，大半 HTTP 行为是 Starlette 的
- [[flask]] —— Flask 是 WSGI 同步同位生态，对照能看出 ASGI 的优势
- [[django]] —— Django 是另一极的"重量全家桶"，Starlette 哲学正相反
- [[hono]] —— JS / TS 端类似的"小而快"路由框架，思想同源
- [[express]] —— Node 端的 Express 在中间件设计上和 Starlette 互相印证
- [[playwright]] —— 测试 Starlette 后端 + 前端集成时常一起用
- [[testing-library]] —— Starlette 的 TestClient 思路与 RTL 类似，都强调"用接口而非实现"

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[litestar]] —— Litestar — 类型驱动的 ASGI 框架（原 Starlite）
- [[quart]] —— Quart — Flask 完全 async 移植，API 同源 + ASGI 后端
- [[robyn]] —— Robyn — Rust 内核驱动的 Python 高性能 Web 框架
- [[sanic]] —— Sanic — 性能向 async Python 框架，对标 Node.js 高吞吐
