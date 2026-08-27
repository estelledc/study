---
title: Flask — 用装饰器把 URL 接到视图函数的 WSGI 微框架
description: 介绍 Flask 如何用 Werkzeug 路由、ContextVar 代理和 make_response 把同步视图收成 WSGI 应用
来源: https://github.com/pallets/flask
日期: 2026-08-27
分类: backend-framework
难度: 入门
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/pallets/flask
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 22d924701a6ae2e4cd01e9a15bbaf3946094af65
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 3.1.3
---

## 是什么

Flask 3.1.3 是一个把 URL 规则交给 Werkzeug、把模板交给 Jinja、自己只做应用对象与请求生命周期的 WSGI 微框架。日常类比：邮局只准备分拣架和当前窗口的便签本；信件怎么拆、数据库怎么连，都不是核心包的事。

你写：

```python
from flask import Flask

app = Flask(__name__)

@app.route("/")
def hello():
    return "Hello, World!"
```

`Flask` 必须传入 `import_name`。`@app.route` 调用 `add_url_rule`：默认方法是 `GET`，并在配置允许时自动补 `OPTIONS`。WSGI 服务器调用 `app` 时进入 `wsgi_app`。核心包要求 Python `>=3.9`，依赖 Werkzeug、Jinja2、Click、ItsDangerous、Blinker、MarkupSafe。

## 为什么重要

不理解 Flask 3.1.3 的上下文和收尾规则，就解释不了：

- 为什么 `request` / `current_app` 看起来像全局变量，换到新线程或异步任务却会报 “Working outside of …”
- 为什么视图直接 `return {"ok": True}` 会变成 JSON，而不必手写 `jsonify`
- 为什么 `async def` 视图在没装 `flask[async]` 时会直接炸
- 为什么 `app.run()` 自己就写着不要用于生产

## 核心要点

固定 3.1.3 的主链可以拆成五步：

1. **WSGI 入口**：`__call__` 转给 `wsgi_app`。后者 `request_context(environ).push()`，跑 `full_dispatch_request()`，最后 `ctx.pop()`。中间件应包 `app.wsgi_app`，不要包掉应用对象。

2. **路由登记**：`route` 是 `add_url_rule` 的装饰器。规则进 `url_map`，视图进 `view_functions[endpoint]`。同一 endpoint 换函数会 `AssertionError`。

3. **分发**：`full_dispatch_request` 发 `request_started`，跑 `preprocess_request`，再 `dispatch_request`。匹配到的视图先经 `ensure_sync` 再调用。

4. **返回值收口**：`make_response` 把 `str`/`bytes`、`dict`/`list`、迭代器、`(body, status, headers)` 元组收成 `Response`。`dict`/`list` 走 `self.json.response`。`None` 直接 `TypeError`。

5. **上下文是 ContextVar**：`current_app` / `g` / `request` / `session` 是 `LocalProxy`，底层是 `_cv_app` 与 `_cv_request`。`AppContext.push` 用 `ContextVar.set`，不是线程局部存储。

## 实践示例

### 案例 1：同一规则按方法分发，dict 自动成 JSON

```python
from flask import Flask, request

app = Flask(__name__)
todos = []

@app.route("/todos", methods=["GET", "POST"])
def todos_view():
    if request.method == "POST":
        todos.append(request.get_json(silent=True) or {})
        return todos, 201
    return todos
```

`methods` 必须是字符串列表。视图返回 `list`/`dict` 时，`make_response` 会走 JSON provider。`request.get_json` 来自 Werkzeug `Request`，Flask 只把 `json_module` 指到 `flask.json`。

### 案例 2：Blueprint 先分组，再挂到 app

```python
from flask import Blueprint, Flask

auth = Blueprint("auth", __name__, url_prefix="/auth")

@auth.route("/login", methods=["POST"])
def login():
    return {"ok": True}

app = Flask(__name__)
app.register_blueprint(auth)
```

`Blueprint` 继承 sans-io 基类，并自带 Click `AppGroup`。`register_blueprint` 把规则和 CLI 一并挂上；主文件不必知道每条 URL。

### 案例 3：async 视图要 asgiref，上下文不能跨任务默认继承

```python
from flask import Flask, request

app = Flask(__name__)

@app.get("/ping")
async def ping():
    return {"q": request.args.get("q")}
```

`ensure_sync` 见到协程函数就调用 `async_to_sync`；缺 `asgiref` 时抛 `RuntimeError`，提示安装 `flask[async]`。`request` 绑在当前 ContextVar 上，新线程或未复制的异步任务里不会自动出现。

## 踩过的坑

1. **把 `app.run()` 当生产服务器**：文档写明不满足生产安全与性能。默认 `host=127.0.0.1`、`port=5000`，`threaded=True`；`debug` 为真时默认打开 Werkzeug reloader 与 debugger。本轮未读 Werkzeug PIN 实现，也不声称已复现远程代码执行。

2. **把 `request` 当成真正的全局变量**：3.1.3 用 `ContextVar` + `LocalProxy`。后台线程要显式传值，或用 `copy_current_request_context`。

3. **在应用上下文外用 `current_app` / `url_for`**：会触发 “Working outside of application context”。脚本里用 `with app.app_context():`。

4. **返回 `None`**：`make_response` 直接报该 endpoint 没有合法响应。

5. **`flask.__version__` 还当稳定 API**：访问会 `DeprecationWarning`，计划在 Flask 3.2 删除；应改用 `importlib.metadata.version("flask")`。

## 适用 vs 不适用场景

**适用**：

- 需要最小 WSGI 入口、装饰器路由和可组合扩展，而不是内置 ORM / Admin
- 视图以同步函数为主，JSON 用 `dict`/`list` 返回即可
- 用 Blueprint 拆模块，并接受自己选择数据库、表单和登录扩展

**不适用**：

- 原生 async 请求处理是主路径——[[fastapi]] / [[starlette]] / [[quart]] 不必把协程桥回 WSGI
- 需要开箱即用的 ORM、迁移和后台——看 [[django]]
- 需要签名驱动的 OpenAPI 与 422 校验主链——看 [[fastapi]]
- 不能接受开发服务器与 debugger 默认绑定在 `run()` 上

## 固定版本边界

- 本文绑定 `pallets/flask@22d924701a6ae2e4cd01e9a15bbaf3946094af65`，tag / `pyproject.toml` 版本均为 `3.1.3`。
- `requires-python >=3.9`；`async` extra 才包含 `asgiref>=3.2`。
- `jsonify` 必须在请求或应用上下文里，内部调用 `current_app.json.response`。
- 本文未安装依赖、未跑 `flask run`、未跑上游测试，状态保持 `UNVERIFIED`。

## 学到什么

1. **微框架的边界是“路由 + 上下文 + 响应收口”**——JSON、模板、CLI 都是薄封装，扩展不在核心包。
2. **看起来像全局的对象其实是当前 ContextVar**——跨线程/任务前要先问有没有 push。
3. **`async def` 只是同步桥**——没有 `asgiref` 就没有这条路。
4. **开发服务器和 debugger 是同一条 `run()` 开关**——`debug` 会同时打开 reloader 与 debugger。

## 应用型自测

1. `@app.route("/x")` 不写 `methods` 时，默认允许哪些方法（忽略自动 OPTIONS）？
2. 视图 `return {"ok": True}` 会不会自动变成 JSON 响应？
3. 没装 `flask[async]` 时，`async def` 视图会怎样？

检查点：

1. 只有 `GET`（`HEAD` 由 Werkzeug 规则处理；`OPTIONS` 另按配置自动补）。
2. 会。`make_response` 对 `dict`/`list` 调用 `self.json.response`。
3. `async_to_sync` 在 import `asgiref` 失败时抛 `RuntimeError`。

## 延伸阅读

- 文档：[flask.palletsprojects.com](https://flask.palletsprojects.com/)
- 固定源码：[pallets/flask](https://github.com/pallets/flask) —— 本文绑定提交 `22d924701a6ae2e4cd01e9a15bbaf3946094af65`
- [[fastapi]] —— 类型注解 + ASGI 的对照
- [[starlette]] —— 若要把 Flask 心智换成原生 async，先看这一层
- [[django]] —— 全家桶对照

## 关联

- [[fastapi]] —— 同样用装饰器挂路由，但主链是 dependant / Pydantic / OpenAPI
- [[starlette]] —— FastAPI 的 ASGI 底座，也是 Flask 同步模型的对照
- [[django]] —— batteries-included，Flask 刻意不做的那部分
- [[quart]] —— Flask 风格 API 的 ASGI 移植，不在本页固定范围内
- [[express]] —— 另一条“最小核心 + 中间件/扩展”的微框架对照

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
