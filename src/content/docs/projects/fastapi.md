---
title: FastAPI — 用 Python 类型注解写 API
来源: 'https://github.com/fastapi/fastapi'
日期: 2026-05-29
分类: backend-api
难度: 中级
---

## 是什么

FastAPI 是一个**用 Python 类型注解（type hints）当合同**的 Web 框架——你在函数签名上写 `item_id: int`，框架就自动负责"从 URL 抠这个参数 → 校验是 int → 不是就报 422 → 文档里标成整数字段"。

日常类比：以前写后端像填海关申报单——你既要在表上写"我带了一台笔记本"，又要在另一张登记表上写"笔记本是电子产品"，再到第三张表上写"电子产品要交税"。FastAPI 把这三张表合成一张：你**只写一次类型**，剩下的校验、文档、序列化都自动从这一处生成。

```python
from fastapi import FastAPI

app = FastAPI()

@app.get("/items/{item_id}")
def read_item(item_id: int, q: str | None = None):
    return {"item_id": item_id, "q": q}
```

`item_id: int` 这一句让 FastAPI 自动做四件事：从路径抠值、校验是否整数、写进 OpenAPI 文档、IDE 给你补全。**写一处，省四处**。

## 为什么重要

不理解 FastAPI 解决的问题，下面这些事都没法解释：

- 为什么 2020 年后 Python 后端一边倒选它，Flask / Django 在新项目里份额下滑
- 为什么 Microsoft / Uber / Netflix 这种规模的公司也在用一个个人开源项目（80k+ stars）
- 为什么写一个 API 不用手写 Swagger，访问 `/docs` 就有交互式文档可点
- 为什么 ML 推理服务（torch / transformers）几乎都用 FastAPI 暴露——类型校验天然挡住脏输入

它把"Python 类型注解"这个 PEP 484（2014）以来一直没用满的能力，变成了**整个框架的中枢神经**。

## 核心要点

FastAPI 的设计可以拆成 **三块**：

1. **类型注解驱动一切**：`item_id: int` 不是给 IDE 看的注释，是运行时实际生效的合同。FastAPI 读这个注解 → 生成 Pydantic 校验器 → 失败抛 422 → 同时写进 OpenAPI schema。一处声明，四处复用。

2. **Pydantic 当数据模型**：复杂请求体（JSON body）用 `class Item(BaseModel)` 描述，Pydantic 帮你 parse + validate。类比拼乐高：BaseModel 是"零件标准"，请求过来 FastAPI 试图把零件拼上去，对不上的位置自动报错。

3. **Depends() 实现依赖注入**：把"每个接口都要做的事"（取当前用户、连数据库、做权限校验）写成函数，在路由签名里 `Depends(get_user)` 引入。框架在调用 handler 前自动跑依赖、把结果传进来——和 Spring 的 @Autowired 思想接近，但写法纯函数。

底层栈：FastAPI = **Starlette（ASGI 层）+ Pydantic（校验层）+ 类型注解魔法**。它本身只有几千行，重活都委托出去。

## 实践案例

### 案例 1：路径参数 + 查询参数自动校验

```python
from fastapi import FastAPI

app = FastAPI()

@app.get("/users/{user_id}")
def get_user(user_id: int, include_email: bool = False):
    return {"id": user_id, "email_visible": include_email}
```

**逐部分解释**：

- `user_id: int` → 访问 `/users/abc` 直接返回 422 "not a valid integer"，handler 根本不会被调
- `include_email: bool = False` → 因为有默认值，自动识别为查询参数；`?include_email=true` 解析成 True
- 启动后访问 `/docs` 已有可点击的 Swagger UI——**没写一行文档**

### 案例 2：请求体用 Pydantic 模型

```python
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()

class CreateItem(BaseModel):
    name: str
    price: float
    tags: list[str] = []

@app.post("/items")
def create_item(item: CreateItem):
    return {"saved": item.name, "total_tags": len(item.tags)}
```

POST `{"name": "book", "price": "abc"}` → 框架返回 `{"detail":[{"loc":["body","price"],"msg":"value is not a valid float"}]}`。**handler 拿到的 `item` 一定是合规的**——这是 type hint 在运行时生效的力量。

### 案例 3：Depends 把鉴权抽出来

```python
from fastapi import Depends, FastAPI, HTTPException, Header

app = FastAPI()

def current_user(x_token: str = Header()):
    if x_token != "secret":
        raise HTTPException(401, "bad token")
    return {"id": 42, "name": "jason"}

@app.get("/me")
def me(user: dict = Depends(current_user)):
    return user
```

任何路由加上 `user = Depends(current_user)` 就自动接入鉴权链，handler 拿到的永远是已登录用户。**鉴权逻辑只写一遍**，所有路由复用。

## 踩过的坑

1. **`def` 还是 `async def` 选错会卡线程池**：用 `async def` handler 里调用同步阻塞函数（`requests.get` / 同步 ORM）会卡住整个 event loop。要么用 `httpx` 异步客户端，要么把 handler 改回 `def`——FastAPI 会把同步函数丢进线程池跑，反而更安全。

2. **Pydantic v1 → v2 不兼容**：FastAPI 0.100 之后默认 Pydantic v2，`@validator` 改成 `@field_validator`，`.dict()` 改成 `.model_dump()`，老项目升级时大量代码要改。pin 死版本号是关键。

3. **`response_model` 会"偷偷"过滤字段**：声明 `response_model=Item` 后，handler 返回的 dict 里多出来的键会被静默丢掉。很多人 debug "为什么前端拿不到这个字段"半天，其实是 response_model 没声明它。

4. **后台任务（BackgroundTasks）和 Depends 不对等**：`Depends(get_db)` 在请求结束后自动关连接，但写进 `BackgroundTasks.add_task` 的函数没有这个机制，常导致连接泄漏。后台任务里要手动管理资源。

## 适用 vs 不适用场景

**适用**：

- REST API 后端、微服务、内部 BFF
- ML / LLM 推理服务（输入校验 + 文档自动出 = 模型部署刚需）
- 数据管道的 HTTP 触发面（Pydantic 把脏 JSON 挡在外面）
- 快速 prototype / hackathon——半天能写出一个有完整文档的 API

**不适用**：

- 需要服务端渲染 HTML 网站（Django / Flask + Jinja 更顺手）
- 超低延迟（< 1ms）场景 → Go / Rust 框架更合适，Python GIL 是天花板
- 需要 Django ORM + admin 面板的"全家桶"项目 → FastAPI 没有官方 ORM，要自己拼 SQLAlchemy / Tortoise
- 团队 Python 经验偏弱、type hints 不熟 → 类型不准时报错信息很难懂，反而拖慢节奏

## 历史小故事（可跳过）

- **2014 年**：Python 3.5 落地 type hints（PEP 484）。当时大多数人当注释看，没人在运行时用它做事。
- **2018 年 12 月**：哥伦比亚开发者 Sebastián Ramírez（GitHub: tiangolo）写出 FastAPI 0.1。核心思路："如果框架真的去读类型注解会怎样？"
- **2019-2020 年**：TechEmpower 基准测出 FastAPI 接近 Go / Node 性能（站在 Starlette + Uvicorn 肩膀上），社区爆发。
- **2021 年**：Microsoft / Uber / Netflix 公开使用，Tiangolo 加入 Sequoia 投的 cloud 创业。
- **2023-2026 年**：Pydantic v2 用 Rust 重写校验层，FastAPI 0.100+ 跟进，性能再提一档；80k+ stars 成 Python 后端事实标准。

## 学到什么

1. **把现有语言能力榨到极致** 比发明新语法更聪明——类型注解 PEP 484 等了四年才被框架级利用，但一旦用起来就赢了
2. **"声明一次、生成多处"** 是 DX 的圣杯：类型 → 校验 + 文档 + IDE + 客户端 SDK，单一真相源比手工同步好太多
3. **抽象站在巨人肩上**：FastAPI 自己不重复造 ASGI 服务器（Uvicorn）/ 校验引擎（Pydantic）/ 路由（Starlette），它只是"把这三个粘起来 + 加类型魔法"
4. **个人开源项目可以跑赢公司框架**：tiangolo 一个人主导，但社区贡献者 700+，节奏比 Django/Flask 灵活——好的设计 > 资源堆砌

## 延伸阅读

- 官方教程：[fastapi.tiangolo.com](https://fastapi.tiangolo.com/tutorial/)（中文完整翻译，按段写、能跑）
- 视频：[ArjanCodes — FastAPI Tutorial Series](https://www.youtube.com/results?search_query=arjancodes+fastapi)（半小时一集，从 0 到部署）
- [[hono]] —— JS / TS 世界的同位概念，多运行时 + 类型友好
- [[langchain]] —— 与 FastAPI 经常配对：LangChain 写 AI 逻辑，FastAPI 当 HTTP 入口
- [[hindley-milner]] —— 类型推导的理论根，FastAPI 用的是 type hint 静态校验，思路相似

## 关联

- [[hono]] —— TS 版 "type-first 框架"，二者是各自语言里的同位
- [[express]] —— 老一代 callback 风格，FastAPI 是 Python 后端"async + type"的对应升级
- [[nestjs]] —— TS 装饰器 + DI 的企业风格，FastAPI 用函数 + Depends 实现同类思想
- [[trpc]] —— 同样追求"声明一次、类型贯穿前后端"，但走 RPC 不走 REST
- [[langchain]] —— LLM 应用层最常用的部署方式就是包成 FastAPI 接口
- [[hindley-milner]] —— "类型注解是合同" 的思想根，HM 是数学定理，FastAPI 是它的工程化日用版
- [[redis]] —— FastAPI 项目里几乎必出现的 cache / session 后端

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[papers/bentoml]] —— BentoML — 把模型 + 依赖 + API 打包成一个能直接跑的盒子
- [[papers/panel]] —— Panel — 把 notebook 一键变交互式 web app
- [[actix-web]] —— Actix Web — Rust 上长期占据 TechEmpower 榜首的 web 框架
- [[aiortc]] —— aiortc — 让 Python 服务端像浏览器一样讲 WebRTC
- [[aspnetcore]] —— ASP.NET Core — 微软跨平台 web 框架
- [[axum]] —— axum — 用 Rust 类型系统当『路由参数表』的 Web 框架
- [[projects/bentoml]] —— BentoML — 模型打包部署
- [[chatwoot]] —— chatwoot — 把 11 种外部聊天渠道归一到同一张消息表
- [[chi]] —— chi — Go 标准库友好的轻量 HTTP router
- [[clack]] —— Clack — 给 Common Lisp 加一层标准化的 web 服务器接口
- [[connect-rpc]] —— ConnectRPC — 让 gRPC 在浏览器里裸跑的 RPC 协议
- [[discord-py]] —— discord.py — 用 Python 写 Discord 机器人的事实标准
- [[django]] —— Django — 全功能 batteries-included 的 Python web 框架
- [[echo]] —— Echo — 极简高性能 Go 框架，5 行起服务
- [[effect]] —— Effect — 给 TypeScript 装上"会跟踪错误和依赖"的副作用引擎
- [[errbot]] —— Errbot — 用 Python 类写一个能进 Slack/Discord 的聊天机器人
- [[express]] —— Express — Node.js 最经典的 Web 框架
- [[faster-whisper]] —— faster-whisper — Whisper 的 4× 加速重写版
- [[fastify]] —— Fastify — 让 schema 替你写校验和序列化的 Node.js 框架
- [[fiber]] —— Fiber — 把 Express 写法搬到 Go 上的高性能 web 框架
- [[flask]] —— Flask — 用装饰器把 URL 接到函数上的 Python 微框架
- [[gin]] —— Gin — Go 写 web API 的事实标准框架
- [[gradio]] —— Gradio — ML 模型 demo 框架
- [[grape]] —— Grape — 用 Ruby DSL 专写 REST API 的轻量框架
- [[hanami]] —— Hanami — Ruby 里既不是 Rails 也不是 Sinatra 的第三选择
- [[helidon]] —— Helidon — 让 Java 微服务用同步代码写出反应式性能
- [[immich]] —— Immich — 把家庭照片从别人的云里救回自己机器
- [[invokeai]] —— InvokeAI — 工业级 Stable Diffusion 工具
- [[janusgraph]] —— JanusGraph — 可插拔后端的分布式图数据库
- [[ktor]] —— Ktor — 用 Kotlin DSL 拼出来的异步 Web 框架
- [[laravel]] —— Laravel — 现代 PHP 全栈框架，Eloquent + Blade + Artisan 三件套
- [[litellm-proxy]] —— LiteLLM Proxy — 自托管的 LLM 统一网关
- [[litestar]] —— Litestar — 类型驱动的 ASGI 框架（原 Starlite）
- [[locust]] —— Locust — 用 Python 写压测脚本的分布式负载工具
- [[micronaut]] —— Micronaut — 编译期搞定 DI 的 JVM 云原生框架
- [[nestjs]] —— NestJS — 把 Angular 思想搬到 Node.js 后端的企业级框架
- [[phoenix]] —— Phoenix — Elixir/OTP 上的实时 web 框架
- [[pillow]] —— Pillow — Python 图像处理
- [[plug]] —— Plug — 把 HTTP 中间件写成『conn 进 conn 出』的纯函数
- [[poem]] —— poem — 一份 impl 块同时变 HTTP API + OpenAPI 文档站的 Rust 框架
- [[quarkus]] —— Quarkus — 让 Java 启动比 Node 还快的云原生框架
- [[quart]] —— Quart — Flask 完全 async 移植，API 同源 + ASGI 后端
- [[rails]] —— Ruby on Rails — 约定大于配置的全栈 Web 框架教科书
- [[rasa]] —— Rasa — 自己造一个能记住上下文的对话机器人
- [[redash]] —— Redash — 浏览器里写 SQL、出图、做仪表板的开源 BI
- [[robyn]] —— Robyn — Rust 内核驱动的 Python 高性能 Web 框架
- [[rocket]] —— Rocket — 用 Rust attribute macro 把路由当函数签名写的 web 框架
- [[salvo]] —— Salvo — 把中间件和处理器统一成一个 Handler trait 的 Rust web 框架
- [[sanic]] —— Sanic — 性能向 async Python 框架，对标 Node.js 高吞吐
- [[sinatra]] —— Sinatra — 用 Ruby 三行代码起一个 web 服务
- [[slim-framework]] —— Slim — PHP 圈最轻的 web 框架，专给小 API 用
- [[spin]] —— Spin — 用 WebAssembly 模块当 serverless handler 的开源框架
- [[spring-boot]] —— Spring Boot — 用 Auto-configuration 把 Java 后端从 XML 地狱里救出来的事实标准框架
- [[stable-diffusion-webui]] —— AUTOMATIC1111 SD WebUI — 把 Stable Diffusion 装进浏览器
- [[starlette]] —— Starlette — FastAPI 底下那台轻量 ASGI 引擎
- [[strawberry]] —— Strawberry — 用 Python 类型注解直接生成 GraphQL schema
- [[streamlit]] —— Streamlit — Python 几行写 Web 应用
- [[symfony]] —— Symfony — 把 PHP 框架拆成 30 个独立组件再拼起来
- [[triton-inference-server]] —— Triton Inference Server — NVIDIA 多框架推理服务化标杆
- [[warp]] —— warp — Rust 里把请求处理拼成 Filter 积木的 web 框架
