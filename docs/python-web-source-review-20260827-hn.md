# Python web source review (writer HN)

> 用途：记录 FastAPI、Flask 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：HN
- evidence：GitHub metadata、PyPI 发布元数据、固定提交静态源码阅读
- not executed：未安装两仓依赖，未运行上游 test、ASGI/WSGI 服务、OpenAPI 客户端或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git
- fallback unused：canonical `fastapi/fastapi@0.141.1` 与 `pallets/flask@3.1.3` 的 tag 与源码版本一致，且未被开放/已合并 study 页占用，未改用其他 Python-web 配对

## FastAPI

- canonical source：`https://github.com/fastapi/fastapi`
- revision：`95f8322ee1dcda7ceace7b1c4f6c9915b36d748f`
- package：`fastapi==0.141.1`
- inspected：
  - `pyproject.toml`
  - `fastapi/__init__.py`
  - `fastapi/applications.py`
  - `fastapi/routing.py`（`serialize_response`、`run_endpoint_function`、`get_request_handler`）
  - `fastapi/dependencies/utils.py`（`get_dependant`、`analyze_param`、`solve_dependencies`）
  - `fastapi/params.py`（`Depends`）
  - `fastapi/exception_handlers.py`
  - `fastapi/exceptions.py`
  - `fastapi/background.py`
  - `fastapi/concurrency.py`
  - `fastapi/_compat/__init__.py`
  - `fastapi/utils.py`（pydantic.v1 拒绝）
- observed：
  - lightweight tag `0.141.1` 与 `__version__` 同指 `95f8322ee1dcda7ceace7b1c4f6c9915b36d748f`；
  - `requires-python >=3.10`；运行依赖 `starlette>=0.46.0`、`pydantic>=2.9.0`；分类仍是 `Development Status :: 4 - Beta`；
  - `FastAPI` 继承 `Starlette`；`__call__` 只写入 `root_path`；
  - `analyze_param` 按路径名 / UploadFile / 非标量 / 标量分别编成 Path、File、Body、Query；
  - `Depends.use_cache` 默认 true；生成器依赖按 `scope` 进入 request 或 function `AsyncExitStack`；
  - 非协程 endpoint / 依赖走 `run_in_threadpool`；
  - `request_validation_exception_handler` 固定 422；
  - `serialize_response` 在存在 `response_field` 时先 validate 再 serialize；
  - `BackgroundTasks` 是 Starlette 子类，挂到 `response.background`；
  - `pydantic.v1` 模型会显式报不再支持；
  - 默认 `openapi_url="/openapi.json"`、`docs_url="/docs"`、`redoc_url="/redoc"`；`docs` 路由要求 `openapi_url` 同时存在。

## Flask

- canonical source：`https://github.com/pallets/flask`
- revision：`22d924701a6ae2e4cd01e9a15bbaf3946094af65`
- package：`Flask==3.1.3`
- inspected：
  - `pyproject.toml`
  - `src/flask/__init__.py`
  - `src/flask/app.py`（`run`、`dispatch_request`、`full_dispatch_request`、`ensure_sync`、`make_response`、`wsgi_app`）
  - `src/flask/sansio/app.py`（`add_url_rule`）
  - `src/flask/sansio/scaffold.py`（`route`）
  - `src/flask/blueprints.py`
  - `src/flask/ctx.py`
  - `src/flask/globals.py`
  - `src/flask/wrappers.py`
  - `src/flask/json/__init__.py`
- observed：
  - annotated tag `3.1.3` 剥皮提交与 `pyproject.toml` `version=3.1.3` 一致；
  - `requires-python >=3.9`；`async` extra 才有 `asgiref>=3.2`；
  - `request` / `current_app` / `g` / `session` 是 `LocalProxy`，底层 `_cv_app` / `_cv_request` 为 `ContextVar`；
  - `__call__` → `wsgi_app` → push request context → `full_dispatch_request` → pop；
  - `route` 默认方法 `GET`，配置允许时自动加 `OPTIONS`；
  - `make_response` 把 `dict`/`list` 交给 `self.json.response`，`None` 抛 `TypeError`；
  - `ensure_sync` 对协程函数调用 `asgiref.sync.async_to_sync`，缺包则 `RuntimeError`；
  - `run()` 默认 `127.0.0.1:5000`、`threaded=True`，`debug` 为真时默认 `use_reloader` / `use_debugger`，并委托 `werkzeug.serving.run_simple`；
  - `Flask.Request` 继承 Werkzeug Request，仅设置 `json_module`；
  - `__version__` 已弃用，计划 Flask 3.2 删除。
