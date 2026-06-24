---
title: Flask — 用装饰器把 URL 接到函数上的 Python 微框架
来源: 'https://github.com/pallets/flask'
日期: 2026-05-29
分类: backend-api
难度: 初级
---

## 是什么

Flask 是一个**让你用一个装饰器就把 URL 路径绑到 Python 函数上**的轻量 Web 框架。日常类比：像在邮局给每个房间号贴一张"信件去哪个抽屉"的便签——客户端发一封 `GET /hello`，Flask 看一眼便签上写"去 hello 函数"，把信塞过去就完了。

最小例子：

```python
from flask import Flask

app = Flask(__name__)

@app.route("/")
def hello():
    return "Hello, World!"
```

5 行代码就有了一个能跑的 web 服务。`@app.route("/")` 这一行装饰器就是那张便签——它告诉 Flask："如果有人请求 `/`，就调下面这个函数"。

它叫"微框架"是因为**自己只做最少的事**——HTTP 路由、模板渲染、cookie 三件套，其他（数据库、表单、登录）全靠扩展拼出来。

## 为什么重要

不理解 Flask 解决的问题，下面这些事都没法解释：

- 为什么 Python 写 web 后端 15 年来教程几乎都从 Flask 开始（学习曲线最低，5 行代码看到结果）
- 为什么"装饰器 + 蓝图"成了 Python web 圈通用心智模型——FastAPI / Starlette / Quart 都沿用同一套
- 为什么很多公司内部小工具、API 网关、ML 推理服务都用 Flask 起步（500 行就够生产可用）
- 为什么"微框架 vs 全栈框架"的争论 Django 党和 Flask 党吵了 15 年还没停

## 核心要点

Flask 的核心设计可以拆成 **三块**：

1. **Werkzeug + Jinja 的胶水层**：Flask 自己几乎不实现底层——HTTP 协议、路由匹配交给 Werkzeug（一个 WSGI 工具集），HTML 模板交给 Jinja（一个模板引擎）。Flask 的工作是把这两个粘起来加一层易用 API。类比：像方便面碗——面是别人的（Werkzeug），调料包是别人的（Jinja），它只是个让你吃得方便的容器。

2. **装饰器路由**：`@app.route("/path")` 让你在函数定义那一刻就声明"我负责这个 URL"，不用单独维护一张路由表。类比：在自己门上贴号码牌，而不是去物业那边登记房号——分散管理但每个文件局部清晰。

3. **应用上下文 + 请求上下文**：Flask 用一个叫 thread-local 的机制，让你在任何地方都能写 `request.args.get("name")` 拿到当前 HTTP 请求的参数——好像它是个全局变量，但实际每个请求各自一份。这是 Flask 最神奇也最容易踩坑的地方。

## 实践案例

### 案例 1：最小 JSON API

```python
from flask import Flask, request, jsonify

app = Flask(__name__)
todos = []

@app.route("/todos", methods=["GET", "POST"])
def todos_view():
    if request.method == "POST":
        todos.append(request.json["text"])
        return jsonify(todos), 201
    return jsonify(todos)
```

**逐部分解释**：

- `methods=["GET", "POST"]`：同一个路径按方法分发——GET 返回列表，POST 添加一项
- `request.json`：Flask 帮你解析请求 body 的 JSON——不用自己写 `json.loads`
- `jsonify(todos), 201`：返回 JSON 响应 + 状态码 201（Created）

### 案例 2：蓝图（Blueprint）拆模块

应用大了一个文件就乱。蓝图把路由分组到不同文件：

```python
# auth.py
from flask import Blueprint
auth = Blueprint("auth", __name__, url_prefix="/auth")

@auth.route("/login", methods=["POST"])
def login(): ...

# app.py
from flask import Flask
from auth import auth
app = Flask(__name__)
app.register_blueprint(auth)
# 现在 /auth/login 由 auth.py 里的函数处理
```

**逐部分解释**：

- `Blueprint("auth", __name__, url_prefix="/auth")`：这一组路由全部以 `/auth` 开头
- `register_blueprint`：把整组路由挂到 app 上——主文件不需要知道每条路由的细节

### 案例 3：扩展生态——Flask-SQLAlchemy

```python
from flask import Flask
from flask_sqlalchemy import SQLAlchemy

app = Flask(__name__)
app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///app.db"
db = SQLAlchemy(app)

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(80))

@app.route("/users")
def list_users():
    return [u.name for u in User.query.all()]
```

**逐部分解释**：

- `flask_sqlalchemy` 把 SQLAlchemy ORM 的会话生命周期接到 Flask 请求生命周期上——请求开始给一个会话，结束自动关
- 这就是"扩展"模式：外部库写一层 Flask 适配，你只 import 就能用

## 踩过的坑

1. **生产环境千万别用 `flask run`**：开发服务器单线程、不抗压、debug 模式开了等于远程代码执行。生产用 Gunicorn / uWSGI / waitress 这种 WSGI 服务器。

2. **Debug 模式 = RCE 漏洞**：`app.run(debug=True)` 配合公网部署，攻击者可以通过浏览器拿到的 PIN 直接执行 Python。记住 debug **只在本地开**。

3. **应用上下文外报 `RuntimeError: Working outside of application context`**：你想在脚本里用 `current_app` 或 `db.session` 但没在请求里——Flask 不知道当前是哪个 app。要么 `with app.app_context():` 包起来，要么用 application factory 模式。

4. **多线程 + 全局变量**：`request` / `g` 看起来像全局变量，但实际是 thread-local。如果你用 `threading.Thread` 派生新线程跑后台任务，新线程里访问 `request` 会炸——新线程没有这个 thread-local。后台任务用 Celery 或显式传值。

## 适用 vs 不适用场景

**适用**：

- 学习 web 后端的第一站（教程多、心智负担低、5 行能跑）
- 小到中型 API / 内部工具 / ML 推理服务（5 万行代码以内）
- 想自己组合技术栈（数据库 / 表单 / 登录 各挑各的扩展）
- 已有 Python 业务逻辑，需要套一层 HTTP 接口

**不适用**：

- 大型 admin 后台、多数据模型 + 权限 → Django 开箱即用更省事
- 重 IO、需要原生 async/await → 用 FastAPI / Starlette / Quart
- 要内置 ORM / migrations / admin → Django 全包
- 强类型 + 自动 OpenAPI 文档 → FastAPI

## 历史小故事（可跳过）

- **2010 年 4 月愚人节**：Armin Ronacher 在博客发"Denied: the next generation Python micro-web-framework"当玩笑，反而吸引了真实需求
- **2010 年 4 月正式发布 0.1**：底层基于他自己之前写的 Werkzeug（2007）和 Jinja（2008）
- **2016 年 Pallets 组织成立**：Armin 把 Werkzeug / Jinja / Click / Flask 都搬进 Pallets 共同维护
- **2020 年 Flask 2.0**：开始支持 `async def` 视图（虽然性能不如原生 async 框架）
- **2024 年 Flask 3.0**：移除老 Python 兼容代码，全面拥抱现代 Python

如今 71k stars、Pallets 组织维护、BSD-3 协议，仍是 Python web 教程默认起点。

## 学到什么

1. **少做事 = 易学 = 长寿**：Flask 15 年没大改核心 API，正因为它不试图把所有事包圆
2. **装饰器是 Python web 的通用心智**：Flask 把它推成主流后，FastAPI / Starlette 都沿用同一套
3. **微框架的代价是组合负担**：自由换来要自己挑数据库、表单、登录——决策疲劳是真实代价；thread-local 让 API 优雅但和异步组合时要懂底层机制

## 延伸阅读

- 官方教程 + 设计哲学：[Flask Tutorial](https://flask.palletsprojects.com/en/tutorial/) + [Design Decisions in Flask](https://flask.palletsprojects.com/en/design/)（搭完整博客 + 解释"为什么是这样"）
- Miguel Grinberg 的 [Flask Mega-Tutorial](https://blog.miguelgrinberg.com/post/the-flask-mega-tutorial-part-i-hello-world)（23 篇博文，社区公认最完整）
- [[fastapi]] —— 用类型注解的现代继承者
- [[express]] —— JS 世界同生态位的微框架

## 关联

- [[fastapi]] —— 思想继承者，把 Flask 装饰器风格 + Python 类型注解结合
- [[express]] —— Node.js 微框架，路由风格几乎一模一样
- [[hono]] —— Web 标准时代的微框架，装饰器心智的最新演化
- [[postgresql]] —— Flask 应用最常配的关系数据库（通过 Flask-SQLAlchemy）
- [[redis]] —— Flask 常用的 session / 缓存后端
- [[docker]] —— Flask 应用的标准部署封装
- [[caddy]] —— Flask 前面常摆的反向代理 + HTTPS 终端

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[caddy]] —— Caddy — 自动 HTTPS Web 服务器
- [[chi]] —— chi — Go 标准库友好的轻量 HTTP router
- [[clack]] —— Clack — 给 Common Lisp 加一层标准化的 web 服务器接口
- [[dash]] —— Dash — Plotly 的 Python 仪表板框架
- [[django]] —— Django — 全功能 batteries-included 的 Python web 框架
- [[express]] —— Express — Node.js 最经典的 Web 框架
- [[fastapi]] —— FastAPI — 用 Python 类型注解写 API
- [[hono]] —— Hono — 多运行时 Web 框架
- [[litestar]] —— Litestar — 类型驱动的 ASGI 框架（原 Starlite）
- [[postgresql]] —— PostgreSQL — 工业级关系数据库
- [[quart]] —— Quart — Flask 完全 async 移植，API 同源 + ASGI 后端
- [[redis]] —— Redis — 内存键值数据库
- [[robyn]] —— Robyn — Rust 内核驱动的 Python 高性能 Web 框架
- [[sanic]] —— Sanic — 性能向 async Python 框架，对标 Node.js 高吞吐
- [[sinatra]] —— Sinatra — 用 Ruby 三行代码起一个 web 服务
- [[starlette]] —— Starlette — FastAPI 底下那台轻量 ASGI 引擎
- [[strawberry]] —— Strawberry — 用 Python 类型注解直接生成 GraphQL schema
- [[superset]] —— Apache Superset — 开源 BI 平台

