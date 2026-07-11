---
title: Quart — Flask 完全 async 移植，API 同源 + ASGI 后端
来源: 'https://github.com/pallets/quart'
日期: 2026-05-29
分类: backend-api
难度: 中级
---

## 是什么

Quart 是 **Flask 的异步双胞胎**——把 Flask 的写法原封不动搬过来，改成 `async`/`await`，跑在 ASGI 后端上。日常类比：像把一辆手动挡的车（Flask 同步）换成自动挡（Quart 异步），方向盘、油门、刹车的位置一模一样，只是动力机制变了。

最小例：

```python
from quart import Quart

app = Quart(__name__)

@app.route("/")
async def hello():
    return {"hello": "world"}
```

跟 Flask 比，只多了一个 `async`，导入从 `flask` 换成 `quart`。3.3k stars，是 Pallets 官方维护的 Flask 异步分支。

## 为什么重要

不理解 Quart 的存在意义，下面这些事都讲不清：

- 老 Flask 项目想加 WebSocket、长连接、SSE，发现同步 WSGI 接口接不上 → Quart 是最近的迁移路径
- Python 后端选型时纠结 "FastAPI 还是继续 Flask" → Quart 给老 Flask 用户提供了第三条路
- 为什么有人愿意维护一个 "Flask 但 async" 的框架——因为 ASGI 标准 2018 才稳定
- 为什么 Pallets（Flask 团队）后来直接收编了 Quart，把它列为官方副品

## 核心要点

把 Quart 拆开看，三件核心事：

1. **API 完全照抄 Flask**：路由装饰器 `@app.route`、请求对象 `request`、模板 `render_template`、蓝图 `Blueprint`——名字、参数、行为都一致。类比：同一个剧本换演员，台词不变。

2. **底层换成 ASGI**：Flask 跑在 WSGI（同步、一次一请求），Quart 跑在 ASGI（异步、可同时挂着上千连接）。所以 WebSocket / HTTP/2 / Server-Sent Events 这些"长连接"协议它能原生接。

3. **任何 IO 操作都要 await**：`request.get_json()` / `render_template()` / `make_response()` 全部变成协程。漏写一个 `await`，运行时就报 `coroutine was never awaited`。

## 实践案例

### 案例 1：Flask 项目迁移到 Quart

Flask 原代码：

```python
from flask import Flask, request, render_template_string

app = Flask(__name__)

@app.route("/")
def route():
    data = request.get_json()
    return render_template_string("Hello {{name}}", name=data["name"])
```

Quart 改写：

```python
from quart import Quart, request, render_template_string

app = Quart(__name__)

@app.route("/")
async def route():
    data = await request.get_json()
    return await render_template_string("Hello {{name}}", name=data["name"])
```

**逐部分解释**：

- `flask` → `quart`，`Flask` → `Quart`：两次 find-replace
- 函数加 `async`：变成协程
- `request.get_json()` 和 `render_template_string()` 前加 `await`：因为它们现在是 async 调用

官方原话："find and replace `flask` to `quart`，再补 async/await"。这是 Quart 最大卖点。

### 案例 2：原生 WebSocket（Flask 做不到）

```python
from quart import Quart, websocket

app = Quart(__name__)

@app.websocket("/ws")
async def ws():
    while True:
        msg = await websocket.receive()
        await websocket.send(f"echo: {msg}")
```

**逐部分解释**：

- `@app.websocket("/ws")`：声明这条路由是 WebSocket 不是 HTTP
- `await websocket.receive()`：挂起协程等客户端消息，不阻塞别的连接
- 整个连接生命周期都在一个协程里——同进程能挂着上千个 WS 连接

Flask 要做这个必须叠 `flask-sockets`、`gevent` 这种猴补丁层；Quart 原生支持。

### 案例 3：后台任务（处理请求外的 async 工作）

```python
from quart import Quart
import asyncio

app = Quart(__name__)

async def cleanup():
    await asyncio.sleep(60)
    print("cleaned")

@app.route("/start")
async def start():
    app.add_background_task(cleanup)
    return "scheduled"
```

**逐部分解释**：

- `add_background_task` 把 `cleanup` 调度到事件循环
- Quart 保证 shutdown 时等后台任务跑完（除非超时被强杀）
- 后台任务报错只 log，不影响主进程——避免一个崩了拖死整个 app

## 踩过的坑

1. **漏写 `async` 触发非协程错**：路由函数忘加 `async`，里面又写了 `await` → 直接 SyntaxError；如果没写 `await` 但调了个返回协程的函数 → 运行时 `RuntimeWarning: coroutine was never awaited`。

2. **Flask 扩展不能直接复用**：`flask-sqlalchemy` / `flask-login` 等同步扩展不会自动变 async，需要看 Quart 文档找对应替代（`quart-sqlalchemy` 等）或者用 `quart-flask-patch` 兼容层。

3. **测试客户端也得 await**：Flask `client.get('/')` → Quart `await test_client.get('/')`，整个测试函数要是 async 的，pytest 要装 `pytest-asyncio`。

4. **后台任务被 shutdown 强杀**：服务器超时设置太短，长任务还没跑完就被 cancel。要么调大 graceful timeout，要么把任务拆短。

## 适用 vs 不适用

**适用**：

- 已有 Flask 项目想加异步功能（WebSocket / SSE / 大流式响应）
- 团队熟悉 Flask 不想换 FastAPI 这种新 API 风格
- 需要 ASGI 但喜欢 Flask 的扩展生态和路由装饰器风格
- 中小规模 API，async IO 密集（外部 HTTP / DB）

**不适用**：

- 全新项目且团队没历史包袱 → FastAPI 自动 OpenAPI 文档 + 数据校验更现代
- 纯同步、CPU 密集逻辑 → 用 Flask 配合 gunicorn 多 worker 反而更简单
- 需要极致性能 ASGI（Starlette / Sanic 在 benchmark 里更快）
- Flask 扩展深度依赖且没 Quart 对应版本 → 迁移成本可能比想象大

## 历史小故事（可跳过）

- **2017 年**：Phil Jones 一个人写了 Quart，目标是"让 Flask 能跑 async"，那时 ASGI 草案还在变
- **2018 年**：ASGI 1.0 稳定，Quart 跟着升级；同期 Starlette / FastAPI 出现，竞争开始
- **2022 年**：Pallets 团队（Flask 维护方）正式接手 Quart，纳入官方组织
- **2024-2026**：Quart 成为 Pallets 全家桶里的 async 副品，Flask 主线仍保持 WSGI 同步路线

收编那一刻意味着：Flask 团队认了 "完全异步重写" 这条路，但选择以独立框架形式存在，不破坏 Flask 自身的稳定性。

## 学到什么

1. **API 兼容是最大的迁移激励**——改一个 import 加几个 await，比换框架学新 API 便宜十倍
2. **WSGI 和 ASGI 是物理层差异**：协议接口决定了能不能挂长连接，不是上层 API 能补的
3. **官方收编开源项目** 是活力延续路径——Quart 从个人项目变成 Pallets 副品后维护质量上一个台阶
4. **每个 await 都是一次显式让出**：写 async 框架你必须知道 IO 在哪，比同步多一份"哪里会阻塞"的心智负担

## 延伸阅读

- 官方文档：[quart.palletsprojects.com](https://quart.palletsprojects.com/)
- Flask → Quart 迁移指南：[How to migrate from Flask](https://quart.palletsprojects.com/en/latest/how_to_guides/flask_migration.html)
- 后台任务详解：[Background tasks](https://quart.palletsprojects.com/en/latest/discussion/background_tasks.html)
- ASGI 规范：[asgi.readthedocs.io](https://asgi.readthedocs.io/)（搞清楚 ASGI 才能真正用好 Quart）
- [[fastapi]] —— 同样 ASGI 的现代竞品，自带 OpenAPI
- [[starlette]] —— Quart / FastAPI 之外另一个 ASGI 微框架

## 关联

- [[flask]] —— Quart 的同步原版，API 完全沿袭
- [[fastapi]] —— ASGI 路线竞品，类型驱动 vs Quart 的 Flask 兼容路线
- [[starlette]] —— 另一个 ASGI 框架，FastAPI 底座
- [[sanic]] —— 早期 Python async 框架，Quart 后台任务设计借鉴它
- [[django]] —— 大而全的同步老大，Django 4 加了 async 视图但不是全异步
- [[uvicorn]] —— 跑 Quart 最常用的 ASGI server

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
