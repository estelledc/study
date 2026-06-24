---
title: Sanic — 性能向 async Python 框架，对标 Node.js 高吞吐
来源: 'https://github.com/sanic-org/sanic'
日期: 2026-05-29
分类: backend-api
难度: 中级
---

## 是什么

Sanic 是一个 **从第一行就为 async/await 设计、跑得跟 Node.js 一样快的 Python web 框架**。日常类比：Flask 是慢悠悠的城市公交（一站一站），Sanic 是地铁（同时几十节车厢并行），都从 A 到 B，但吞吐量差一个数量级。

最小例子：

```python
from sanic import Sanic
from sanic.response import json

app = Sanic("hello-app")

@app.route("/")
async def hello(request):
    return json({"hello": "world"})
```

`async def` 是关键——每个请求来了不会"占用"线程，而是"先挂起，等数据库回复再继续"。这让单进程能同时扛住几千个连接。

跑起来：`sanic hello.app`（不需要额外的 gunicorn/uvicorn）。

## 为什么重要

不理解 Sanic 在 Python 异步生态里的位置，下面这些事都没法解释：

- 为什么 Python 也能做高并发后端，不必逼自己换 Go / Node.js
- 为什么 [[fastapi]] 和 Sanic 看起来很像，但 FastAPI 跑在 [[starlette]] 上、Sanic 自己写 server
- 为什么 Sanic 的进程模型（多 worker + uvloop）能把 CPU 榨到 95%，而 Flask + gunicorn 同样配置只到 30%
- 为什么"async-first"和"sync-first 加 async 补丁"在生产环境差别巨大——前者是 Sanic / FastAPI，后者是 Flask 2.x / Django async views

## 核心要点

Sanic 区别于其他 Python 框架的 **三个核心机制**：

1. **自带高性能 server，不需要 WSGI 适配**：Flask 必须搭配 gunicorn / uWSGI 才能上生产，Sanic 自带的 server 用 uvloop（libuv 的 Python 绑定）直接跑。类比：自带发动机的汽车，不用外接电瓶。

2. **请求对象显式传参，不用全局上下文**：Flask 的 `request` 是隐藏全局变量（context-local），Sanic 强制每个 handler 第一个参数就是 `request`。类比：明文交接钥匙，而不是塞在花盆下面。

3. **Blueprint + Signal 模块化**：Blueprint 把路由分组（像 Flask），Signal 是事件总线（中间件 + 生命周期钩子的统一抽象）。类比：地铁站每条线路独立，调度信号统一指挥。

## 实践案例

### 案例 1：流式返回大文件（不爆内存）

```python
from sanic.response import ResponseStream

@app.get("/big-csv")
async def big_csv(request):
    async def streaming(response):
        for i in range(1_000_000):
            await response.write(f"{i},data\n")
    return ResponseStream(streaming, content_type="text/csv")
```

**逐部分解释**：

- `ResponseStream` 不一次性构造整个 body，而是边算边推
- `await response.write(...)` 让出控制权——OS 在写网络包时，CPU 去处理别的请求
- 1 百万行用 < 50 MB 内存搞定。换成 Flask 同步版本会把 1 GB RAM 吃光

### 案例 2：WebSocket 聊天广播

```python
@app.websocket("/chat")
async def chat(request, ws):
    app.ctx.clients.add(ws)
    try:
        async for msg in ws:
            for client in app.ctx.clients:
                await client.send(msg)
    finally:
        app.ctx.clients.discard(ws)
```

**逐部分解释**：

- `@app.websocket` 注册 WS 路由（Flask 原生不支持，需 Flask-SocketIO）
- `async for msg in ws` 持续消费连接里的消息，连接断开自动跳出循环
- `app.ctx` 是用户自定义的应用级状态容器（这里存所有在线 client）
- `finally` 保证客户端掉线后从集合里移除——否则下次广播会向"鬼连接"写

### 案例 3：Blueprint 拆分大型应用

```python
# users/routes.py
from sanic import Blueprint
users_bp = Blueprint("users", url_prefix="/users")

@users_bp.get("/<user_id:int>")
async def get_user(request, user_id):
    return json({"id": user_id})

# main.py
from sanic import Sanic
from users.routes import users_bp
app = Sanic("MyApp")
app.blueprint(users_bp)
```

**逐部分解释**：

- 每个 Blueprint 是独立模块，可挂自己的中间件 / 异常处理 / listener
- `<user_id:int>` 是路径参数 + 类型转换，自动把字符串转成整数
- `app.blueprint(users_bp)` 一行挂载——大项目按业务域拆分，不互相污染

## 踩过的坑

1. **不要在 async handler 里写 `time.sleep` / `requests.get`**：这些是同步阻塞，会卡住整个 worker（不是单个请求）。必须用 `asyncio.sleep` / `httpx.AsyncClient`。

2. **`app.ctx` 不在 worker 之间共享**：多 worker 模式下每个进程一份，需要全局共享必须走 Redis / 数据库。新人常误以为它是单例。

3. **Python 3.10+ 才能跑**：Sanic 23+ 砍掉了 3.8/3.9 支持。生产环境如果还在 3.8 要么升级要么锁旧版（v22.x）。

4. **uvloop 在 Windows 不可用**：uvloop 不支持 Windows。`SANIC_NO_UVLOOP=true` 退回标准 asyncio，性能砍半。Windows 用户考虑 WSL。

## 适用 vs 不适用

**适用**：

- 高并发 IO 密集场景：聊天 / 推送 / 实时 dashboard / WebSocket
- 微服务网关 / API 聚合层（轻量 + 高吞吐）
- 已经熟悉 async Python 生态的团队

**不适用**：

- CPU 密集型任务（图像处理 / ML 推理）—— async 不解决 GIL，要么换进程池要么换 Go
- 团队全是同步 Python 经验，没人懂 await —— 学习曲线陡，迁移成本高
- 重度依赖 Django ORM / admin 后台 —— 用 [[django]] 异步视图更顺
- 想要"开箱即用 swagger 文档" —— 用 [[fastapi]]（Sanic 也能加但要自己装插件）

## 历史小故事（可跳过）

- **2016 年**：Channel Cat（社区昵称）受 Node.js 高吞吐启发，发布 Sanic v0.1，那时 Python 3.5 刚加 async/await
- **2017-2019 年**：早期被诟病"为快而快、API 不稳定"，每个版本破坏性改动多
- **2020 年**：项目转交社区维护（sanic-org），引入语义化版本和 LTS（长期支持）策略
- **2023 年**：v23 大重构，引入 Signal 系统统一中间件，砍掉 Python 3.8/3.9
- **2026 年**：GitHub 18k+ stars，是 Python async 框架前三（与 [[fastapi]]、aiohttp 并列）

## 学到什么

- **async-first 框架 vs sync-first 加 async 补丁**：架构选择影响性能上限——Sanic 一开始就为 async 设计，FastAPI 把 Starlette 当地基都比 Flask 加 async 装饰器快得多
- **自带 server 是优势也是负担**：少一层抽象（不用 gunicorn）但也意味着自己维护 worker 模型、热重载、信号处理
- **显式优于隐式**：把 `request` 强制写进函数签名，比 Flask 的全局 `request` 更难写错、更易测试
- **微框架要不要变全栈**：Sanic 一直克制，没做 ORM / 模板引擎 / admin —— 让用户自己拼。这是优点也是劝退点

## 延伸阅读

- 官方 guide：[Sanic Workshop](https://sanic.dev/en/guide/) — 从 Hello World 到部署的完整教程
- 视频对比：[FastAPI vs Sanic vs aiohttp Benchmark](https://www.youtube.com/results?search_query=fastapi+sanic+benchmark)
- 性能基准：[TechEmpower Web Framework Benchmarks](https://www.techempower.com/benchmarks/)（搜 Sanic）
- [[fastapi]] —— 同样 async-first，但走 Starlette + Pydantic 路线
- [[starlette]] —— FastAPI 的底层 ASGI 框架，对比 Sanic 自研 server 路线

## 关联

- [[fastapi]] —— async Python 框架双雄之一，FastAPI 强在类型注解，Sanic 强在性能极限
- [[starlette]] —— ASGI 工具包，FastAPI 用它当地基，Sanic 走的是另一条自研路线
- [[flask]] —— 同步前辈，Sanic 的设计参考了它的极简哲学但全部异步化
- [[django]] —— 全栈对照组，Django 4.x 才补的 async 视图，Sanic 一开始就是
- [[elysia]] —— Bun 上的 async 框架，Sanic 在 Python 生态对应它的位置
- [[fastify]] —— Node.js 性能向框架，跟 Sanic 在不同语言里扮演同一种角色
- [[nginx]] —— 反向代理网关，生产部署常放在 Sanic 前面做 SSL 终端

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[django]] —— Django — 全功能 batteries-included 的 Python web 框架
- [[elysia]] —— Elysia — 长在 Bun 上的极致类型安全 Web 框架
- [[fastapi]] —— FastAPI — 用 Python 类型注解写 API
- [[fastify]] —— Fastify — 让 schema 替你写校验和序列化的 Node.js 框架
- [[flask]] —— Flask — 用装饰器把 URL 接到函数上的 Python 微框架
- [[nginx]] —— nginx — 高性能 Web 服务器
- [[quart]] —— Quart — Flask 完全 async 移植，API 同源 + ASGI 后端
- [[robyn]] —— Robyn — Rust 内核驱动的 Python 高性能 Web 框架
- [[starlette]] —— Starlette — FastAPI 底下那台轻量 ASGI 引擎

