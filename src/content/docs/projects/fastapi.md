---
title: FastAPI — 用类型注解驱动请求校验的 ASGI 框架
description: 介绍 FastAPI 如何把函数签名编成 dependant，再用 Pydantic v2 做校验和 OpenAPI
来源: https://github.com/fastapi/fastapi
日期: 2026-08-27
分类: backend-framework
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/fastapi/fastapi
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 95f8322ee1dcda7ceace7b1c4f6c9915b36d748f
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 0.141.1
---

## 是什么

FastAPI 0.141.1 是一个建立在 [[starlette]] 上的 ASGI 应用类：你写路径操作函数的类型注解，框架在启动时把它编成 `Dependant`，请求到来时再做校验、依赖注入和 OpenAPI。日常类比：函数签名就是一张报关单，海关（`analyze_param` / `solve_dependencies`）先核完，才放行到你的处理函数。

你写：

```python
from fastapi import FastAPI

app = FastAPI()

@app.get("/items/{item_id}")
def read_item(item_id: int, q: str | None = None):
    return {"item_id": item_id, "q": q}
```

`item_id` 出现在路径里，所以被编成 `Path`；`q` 是标量且有默认值，被编成 `Query`。校验失败走 `RequestValidationError`，默认处理器返回 422。核心包要求 Python `>=3.10`、`pydantic>=2.9.0`、`starlette>=0.46.0`，**不带** ASGI 服务器。

## 为什么重要

不理解这条“签名 → dependant → 校验 → 调用”的主链，就解释不了：

- 为什么没写 `Query()` / `Body()` 也能分出路径、查询和 JSON body
- 为什么 `def` 处理函数不会卡住 event loop，却也不能在里面安全地跑同步阻塞并自称 async
- 为什么声明 `response_model` 后，多出来的字段会在序列化时消失
- 为什么 `/docs` 能出 Swagger，但把 `openapi_url=None` 后文档路由也会关掉

## 核心要点

固定 0.141.1 的主链可以拆成五步：

1. **ASGI 入口**：`FastAPI` 继承 `Starlette`。`__call__` 只补 `root_path`，然后交给父类。路由方法委托给内部 `APIRouter`。

2. **启动期编 dependant**：`get_dependant` 读函数签名。路径名命中则 `Path`；`UploadFile` 走 `File`；非标量走 `Body`；其余标量走 `Query`。`Depends` / `Security` 递归挂到 `dependant.dependencies`。

3. **请求期求解**：`get_request_handler` 先读 body（JSON 要求 `application/json` 或 `+json`，除非关闭 `strict_content_type`），再 `solve_dependencies`。子依赖默认 `use_cache=True`；`async def` 直接 await，普通 `def` 丢进 `run_in_threadpool`。

4. **调用与序列化**：普通函数走 `run_endpoint_function`。返回值若不是 `Response`，就按 `response_field` 做 `serialize_response`；有字段时先 `validate` 再 `serialize`，多余键会被丢掉。校验失败抛 `ResponseValidationError`。

5. **OpenAPI 缓存**：默认 `openapi_url="/openapi.json"`、`docs_url="/docs"`、`redoc_url="/redoc"`。`openapi()` 按路由版本生成并缓存；路由变化后重算。

## 实践示例

### 案例 1：签名位置决定参数种类

```python
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()

class Item(BaseModel):
    name: str
    price: float

@app.post("/items/{item_id}")
def create_item(item_id: int, item: Item, q: str = ""):
    return {"id": item_id, "name": item.name, "q": q}
```

`item_id` 在路径里所以是 path；`Item` 不是标量所以是 body；`q` 是标量默认值所以是 query。body 对不上时 handler 不会被调用。

### 案例 2：同步处理函数进线程池

```python
@app.get("/sync")
def sync_ok():
    return {"mode": "threadpool"}

@app.get("/async")
async def async_ok():
    return {"mode": "event-loop"}
```

`run_endpoint_function` 看 `_is_coroutine_callable`：协程直接 await，否则 `await run_in_threadpool(...)`。在 `async def` 里调用同步阻塞 I/O，源码不会自动再包一层线程池。

### 案例 3：Depends 默认缓存，生成器靠退出栈关闭

```python
from fastapi import Depends, FastAPI

app = FastAPI()

def current_user():
    return {"id": 1}

@app.get("/me")
def me(user: dict = Depends(current_user)):
    return user
```

同一请求里相同依赖默认只算一次。`yield` 依赖按 `scope` 进入 `fastapi_inner_astack`（request）或 `fastapi_function_astack`（function）；`BackgroundTasks` 则挂到响应的 `background`，在响应发出之后才跑，不会自动享受函数级生成器收尾。

## 踩过的坑

1. **把 Pydantic v1 当还能用**：`pydantic.v1` 模型会显式报 “no longer supported”。`_compat` 只导出 v2 `ModelField`。

2. **把 `response_model` 当成原样转发**：`serialize_response` 先按字段校验再序列化，未声明的键不会出现在 JSON 里。

3. **在 `async def` 里跑同步阻塞**：线程池优化只作用于被识别为非协程的 endpoint / 依赖。

4. **以为核心包装了 Uvicorn**：`standard` extra 才拉 `uvicorn`、`fastapi-cli`、`httpx` 等；本轮未安装 extra，也未启动服务。

5. **把 `/docs` 和 schema 拆开看**：`docs_url` 只有在 `openapi_url` 也设置时才会注册。

## 适用 vs 不适用场景

**适用**：

- 需要把路径、查询、header 和 JSON body 的合同写在函数签名上，并生成 OpenAPI
- 接受 ASGI 服务器、Pydantic v2 模型和可选 `standard` extra 自行组装
- 想用 `Depends` 做请求级注入，并分清生成器收尾与 `BackgroundTasks`

**不适用**：

- 主要做服务端 HTML + 表单会话——[[flask]] / [[django]] 的模板与上下文模型更贴
- 必须继续用 `pydantic.v1` 模型
- 不能接受核心包仍标 `Development Status :: 4 - Beta`，且本页未跑服务或压测
- 需要在静态阅读之外证明延迟、吞吐或兼容性

## 固定版本边界

- 本文绑定 `fastapi/fastapi@95f8322ee1dcda7ceace7b1c4f6c9915b36d748f`，tag / `__version__` 均为 `0.141.1`。
- `requires-python >=3.10`；运行依赖是 Starlette、Pydantic v2、`typing-extensions`、`typing-inspection`、`annotated-doc`。
- OpenAPI 默认挂在 `/openapi.json`，Swagger UI 在 `/docs`，ReDoc 在 `/redoc`。
- 本文未安装依赖、未启动 Uvicorn、未跑上游测试，状态保持 `UNVERIFIED`。

## 学到什么

1. **类型注解是运行时合同**——位置、是否标量、是否 `Depends`，都在 `analyze_param` 里决定。
2. **同步与异步是两条调用路径**——线程池不会替你把 `async def` 里的阻塞变安全。
3. **文档路由依赖 schema URL**——关掉 `openapi_url` 等于同时关掉 `/docs`。
4. **后台任务不是依赖收尾**——`BackgroundTasks` 挂在响应上，生成器依赖挂在退出栈上。

## 应用型自测

1. `q: str | None = None` 在 `/items/{item_id}` 上会被编成 path、query 还是 body？
2. 普通 `def` 路径操作会在 event loop 上直接调用吗？
3. 把 `FastAPI(openapi_url=None)` 之后，默认 `/docs` 还会注册吗？

检查点：

1. query。它是带默认值的标量，且不在路径参数名集合里。
2. 不会。`run_endpoint_function` 把它丢进 `run_in_threadpool`。
3. 不会。`setup()` 要求 `openapi_url` 与 `docs_url` 同时存在。

## 延伸阅读

- 文档：[fastapi.tiangolo.com](https://fastapi.tiangolo.com/)
- 固定源码：[fastapi/fastapi](https://github.com/fastapi/fastapi) —— 本文绑定提交 `95f8322ee1dcda7ceace7b1c4f6c9915b36d748f`
- [[flask]] —— 同步 WSGI + 上下文代理的对照
- [[starlette]] —— FastAPI 继承的 ASGI 应用与路由层
- [[django]] —— batteries-included 的另一条 Python web 主线

## 关联

- [[flask]] —— 装饰器路由同源，但没有签名驱动的校验/OpenAPI 主链
- [[starlette]] —— ASGI、Request/Response、BackgroundTasks 的底层
- [[django]] —— ORM / Admin / 模板全家桶，而不是类型注解 API
- [[hono]] —— 另一条“类型友好、运行时校验”的 Web 框架对照
- [[litestar]] —— 同属类型驱动 ASGI，实现不在本页范围

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
